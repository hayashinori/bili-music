(function (root) {
  'use strict';
  const searches = new Map(), lyrics = new Map();
  const catalog = typeof module !== 'undefined' && module.exports ? require('./source-catalog') : root.BanCiSources;
  let cacheVersion = 0;
  let bridge = null;
  function setBridge(fn) { bridge = fn; searches.clear(); lyrics.clear(); }
  function simplifyQuery(query) {
    return String(query).replace(/[（(][^）)]*[）)]/g, ' ').split(/\s*[\/|｜]\s*/)[0]
      .replace(/[!！]{2,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function checked(data, stage) {
    if (Number(data?.code) !== 200) {
      const error = new Error(`网易云${stage}返回 ${data?.code || '异常数据'}${data?.message || data?.msg ? '：' + String(data.message || data.msg).slice(0, 100) : ''}`);
      error.code = Number(data?.code); throw error;
    }
    return data;
  }
  async function sourceRequest(source, operation, parameters, direct) {
    let localError;
    if (bridge) {
      try { return await bridge(source, operation, parameters); }
      catch (e) { localError = e.message; }
    }
    try { return await direct(); }
    catch (e) {
      const help = localError ? `；本机通道：${localError}` : '；请检查网络，或更换歌词来源后重试';
      throw new Error(e.message + help);
    }
  }
  function remember(cache, key, data, limit) {
    cache.set(key, { data, at: Date.now() });
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return data;
  }
  function cached(cache, key) {
    const entry = cache.get(key);
    return entry && Date.now() - entry.at < 600000 ? entry.data : undefined;
  }
  async function json(url, options = {}) {
    try {
      const response = await fetch(url, { ...options, credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`接口 HTTP ${response.status}`);
      try { return await response.json(); } catch { throw new Error('接口返回了非 JSON 数据'); }
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('歌词源连接超时');
      if (e instanceof TypeError) throw new Error('无法连接歌词源，请检查网络或代理');
      throw e;
    }
  }
  function neteaseTrack(song) {
    return { id: `netease:${song.id}`, provider: 'netease', remoteId: song.id, source: '网易云音乐',
      trackName: song.name || '', artistName: (song.artists || song.ar || []).map(a => a.name).join(' / '),
      albumName: (song.album || song.al || {}).name || '', duration: Number(song.duration || song.dt || 0) / 1000,
      lyricsPending: true };
  }
  async function neteaseSearch(query) {
    const data = await sourceRequest('netease', 'search', { query }, async () => {
      let primaryError;
      try {
        const first = checked(await json('https://music.163.com/api/search/get/web', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ s: query, type: '1', offset: '0', limit: '20', total: 'true' }).toString()
        }), '搜索');
        if (first.result?.songs?.length || simplifyQuery(query) === query) return first;
      } catch (e) {
        // Do not try another endpoint when the service explicitly requires authorization.
        if ([301, 401, 403].includes(e.code)) throw e;
        primaryError = e;
      }
      try {
        return checked(await json('https://music.163.com/api/search/get?' + new URLSearchParams({ s: simplifyQuery(query) || query, type: '1', offset: '0', limit: '20' })), '兼容搜索');
      } catch (e) { throw new Error(`${primaryError ? primaryError.message + '；' : ''}${e.message}`); }
    });
    checked(data, '搜索');
    return (data.result?.songs || []).map(neteaseTrack);
  }
  async function lrcSearch(query) {
    const data = await sourceRequest('lrclib', 'search', { query }, () => json('https://lrclib.net/api/search?' + new URLSearchParams({ q: query })));
    if (!Array.isArray(data)) throw new Error('LRCLIB 返回格式异常');
    return data.slice(0, 40).map(t => ({ ...t, id: `lrclib:${t.id}`, remoteId: t.id, provider: 'lrclib', source: 'LRCLIB' }));
  }
  function decodeText(value) {
    return String(value || '').replace(/&#(x[\da-f]+|\d+);/gi, (whole, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function base64Text(value) {
    if (typeof Buffer !== 'undefined') return Buffer.from(String(value || ''), 'base64').toString('utf8');
    return new TextDecoder().decode(Uint8Array.from(atob(String(value || '')), c => c.charCodeAt(0)));
  }
  const qqHeaders = { Referer: 'https://y.qq.com/' };
  async function qqSearch(query) {
    const data = await sourceRequest('qq', 'search', { query }, () => json('https://u.y.qq.com/cgi-bin/musicu.fcg?' + new URLSearchParams({ format: 'json', data: JSON.stringify({ comm: { ct: 19, cv: 1859, uin: '0' }, req: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { grp: 1, num_per_page: 20, page_num: 1, query, search_type: 0 } } }) }), { headers: qqHeaders }));
    if (data?.code !== 0 || data.req?.code !== 0) throw new Error(`QQ 音乐搜索返回 ${data?.req?.code ?? data?.code ?? '异常数据'}`);
    const songs = data.req?.data?.body?.song?.list;
    if (!Array.isArray(songs)) throw new Error('QQ 音乐返回格式异常');
    return songs.filter(s => /^[\da-zA-Z]{1,40}$/.test(s.mid)).map(s => ({ id: `qq:${s.mid}`, provider: 'qq', remoteId: s.mid, source: 'QQ 音乐', trackName: decodeText(s.name || s.title), artistName: (s.singer || []).map(a => decodeText(a.name)).join(' / '), albumName: decodeText(s.album?.name), duration: Number(s.interval || 0), lyricsPending: true }));
  }
  async function kugouSearch(query) {
    const data = await sourceRequest('kugou', 'search', { query }, () => json('https://songsearch.kugou.com/song_search_v2?' + new URLSearchParams({ keyword: query, page: '1', pagesize: '20', platform: 'WebFilter', format: 'json' })));
    if (data?.status !== 1) throw new Error(`酷狗搜索返回 ${data?.error_code ?? data?.status ?? '异常数据'}`);
    if (!Array.isArray(data.data?.lists)) throw new Error('酷狗返回格式异常');
    return data.data.lists.filter(s => /^[\da-f]{32}$/i.test(s.FileHash)).map(s => ({ id: `kugou:${s.FileHash}`, provider: 'kugou', remoteId: s.FileHash, source: '酷狗音乐', trackName: decodeText(s.SongName), artistName: decodeText(s.SingerName), albumName: decodeText(s.AlbumName), duration: Number(s.Duration || 0), lyricsPending: true }));
  }
  function clearCache(source = 'auto') {
    if (!catalog.some(s => s.id === source)) throw new Error('未知歌词源。');
    cacheVersion++;
    for (const key of searches.keys()) if (source === 'auto' || key.startsWith(source + ':') || key.startsWith('auto:')) searches.delete(key);
    for (const key of lyrics.keys()) if (source === 'auto' || key.startsWith(source + ':')) lyrics.delete(key);
  }
  async function search(query, source = 'auto') {
    query = String(query || '').trim().slice(0, 160);
    if (!query) throw new Error('请输入歌曲名或歌手。');
    if (!catalog.some(s => s.id === source)) throw new Error('未知歌词源。');
    const version = cacheVersion;
    const key = source + ':' + query, hit = cached(searches, key);
    if (hit) return hit;
    const sources = source === 'auto' ? catalog.filter(s => s.id !== 'auto').map(s => s.id) : [source];
    const handlers = { netease: neteaseSearch, lrclib: lrcSearch, qq: qqSearch, kugou: kugouSearch };
    const results = await Promise.allSettled(sources.map(s => handlers[s](query)));
    const tracks = [], warnings = [], sourceResults = [];
    results.forEach((result, i) => {
      const id = sources[i], name = catalog.find(s => s.id === id).name;
      if (result.status === 'fulfilled') { tracks.push(...result.value); sourceResults.push({ id, name, status: result.value.length ? 'ok' : 'empty', count: result.value.length }); }
      else { warnings.push(`${name}：${result.reason.message}`); sourceResults.push({ id, name, status: 'error', count: 0, message: result.reason.message }); }
    });
    if (results.every(r => r.status === 'rejected')) { const error = new Error(warnings.join('；')); error.sourceResults = sourceResults; throw error; }
    const data = { tracks, warnings, sourceResults };
    // Do not cache a partial outage: the next search can recover immediately.
    return warnings.length || version !== cacheVersion ? data : remember(searches, key, data, 30);
  }
  async function resolve(provider, remoteId) {
    const valid = { netease: /^\d{1,18}$/, qq: /^[\da-zA-Z]{1,40}$/, kugou: /^[\da-f]{32}$/i };
    if (!valid[provider]?.test(String(remoteId))) throw new Error('无效的歌曲来源或 ID。');
    const key = `${provider}:${remoteId}`, version = cacheVersion;
    const hit = cached(lyrics, key);
    if (hit) return hit;
    if (provider === 'qq') {
      const data = await sourceRequest('qq', 'lyric', { id: String(remoteId) }, () => json('https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' + new URLSearchParams({ songmid: remoteId, g_tk: '5381', format: 'json', inCharset: 'utf8', outCharset: 'utf-8', nobase64: '1' }), { headers: qqHeaders }));
      if (data?.code !== 0) throw new Error(`QQ 音乐歌词返回 ${data?.code ?? '异常数据'}`);
      const result = { syncedLyrics: decodeText(data.lyric), translatedLyrics: decodeText(data.trans).replace(/\/\//g, ''), lyricsPending: false };
      return result.syncedLyrics && version === cacheVersion ? remember(lyrics, key, result, 100) : result;
    }
    if (provider === 'kugou') {
      const data = await sourceRequest('kugou', 'lyric', { id: String(remoteId) }, async () => {
        const found = await json('https://lyrics.kugou.com/search?' + new URLSearchParams({ ver: '1', client: 'pc', man: 'yes', hash: remoteId, keyword: '', duration: '0' }));
        if (found?.status !== 200) throw new Error(`酷狗歌词搜索返回 ${found?.status ?? '异常数据'}`);
        const candidate = found.candidates?.find(c => /^\d{1,20}$/.test(c.id) && /^[\da-zA-Z]{1,128}$/.test(c.accesskey));
        if (!candidate) return { status: 200, content: '' };
        return json('https://lyrics.kugou.com/download?' + new URLSearchParams({ ver: '1', client: 'pc', id: candidate.id, accesskey: candidate.accesskey, fmt: 'lrc', charset: 'utf8' }));
      });
      if (data?.status !== 200) throw new Error(`酷狗歌词返回 ${data?.status ?? '异常数据'}`);
      const result = { syncedLyrics: base64Text(data.content), translatedLyrics: '', lyricsPending: false };
      return result.syncedLyrics && version === cacheVersion ? remember(lyrics, key, result, 100) : result;
    }
    const data = await sourceRequest('netease', 'lyric', { id: String(remoteId) }, async () => checked(await json('https://music.163.com/api/song/lyric?' + new URLSearchParams({ id: remoteId, lv: '-1', kv: '-1', tv: '-1' })), '歌词'));
    checked(data, '歌词');
    const result = { syncedLyrics: data.lrc?.lyric || '', translatedLyrics: data.tlyric?.lyric || '', lyricsPending: false };
    // No empty/failure caching, so temporarily unavailable tracks can be retried.
    return result.syncedLyrics && version === cacheVersion ? remember(lyrics, key, result, 100) : result;
  }
  const api = { search, resolve, neteaseTrack, setBridge, simplifyQuery, clearCache };
  root.BanCiProviders = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
