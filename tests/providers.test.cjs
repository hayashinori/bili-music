const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../shared/providers');
test('QQ/酷狗独立搜索与歌词读取，字段、翻译、Base64 和固定地址正确', async () => {
  const original = global.fetch, calls = [], hash = 'A'.repeat(32);
  P.setBridge(null);
  global.fetch = async (input, options) => {
    const url = new URL(input); calls.push({ url, options });
    let data;
    if (url.hostname === 'u.y.qq.com') data = { code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: 'testMid123', name: '歌 &amp; 曲', singer: [{ name: '歌手' }], album: { name: '专辑' }, interval: 200 }] } } } } };
    else if (url.hostname === 'i.y.qq.com') data = { code: 0, lyric: '[00:01]原文&#10;[00:02]第二句', trans: '[00:01]Translation' };
    else if (url.hostname === 'songsearch.kugou.com') data = { status: 1, data: { lists: [{ FileHash: hash, SongName: '测试歌曲', SingerName: '歌手', Duration: 201 }] } };
    else if (url.pathname === '/search') data = { status: 200, candidates: [{ id: '1234', accesskey: 'ABC123' }] };
    else { assert.equal(url.searchParams.get('fmt'), 'lrc'); data = { status: 200, content: Buffer.from('[00:01]酷狗原文').toString('base64') }; }
    return new Response(JSON.stringify(data));
  };
  try {
    const qq = await P.search('测试', 'qq'); assert.equal(qq.tracks[0].trackName, '歌 & 曲'); assert.equal(qq.tracks[0].duration, 200);
    assert.equal(qq.sourceResults[0].status, 'ok');
    const ql = await P.resolve('qq', 'testMid123'); assert.match(ql.syncedLyrics, /原文\n/); assert.match(ql.translatedLyrics, /Translation/);
    const kg = await P.search('测试', 'kugou'); assert.equal(kg.tracks[0].remoteId, hash);
    assert.equal((await P.resolve('kugou', hash)).syncedLyrics, '[00:01]酷狗原文');
    assert.equal(calls.find(c => c.url.hostname === 'i.y.qq.com').options.headers.Referer, 'https://y.qq.com/');
    assert.equal(calls.find(c => c.url.hostname === 'lyrics.kugou.com' && c.url.pathname === '/search').url.searchParams.get('hash'), hash);
    assert.ok(calls.every(c => c.options.credentials === 'omit' && c.url.protocol === 'https:'));
    await assert.rejects(P.resolve('qq', '../bad'), /无效/); await assert.rejects(P.resolve('kugou', 'bad'), /无效/);
  } finally { global.fetch = original; P.setBridge(null); }
});
test('刷新清除所选源搜索和歌词缓存，并使合并缓存失效，不刷新其他源', async () => {
  let searches = 0, lyrics = 0;
  P.setBridge(async (source, operation) => {
    if (operation === 'lyric') { lyrics++; return { code: 0, lyric: `[00:01]版本${lyrics}` }; }
    searches++; return { code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: 'abc', name: '歌' }] } } } } };
  });
  await P.search('歌', 'qq'); await P.search('歌', 'qq'); await P.resolve('qq', 'abc'); await P.resolve('qq', 'abc');
  assert.equal(searches, 1); assert.equal(lyrics, 1);
  P.clearCache('kugou'); await P.search('歌', 'qq'); assert.equal(searches, 1);
  P.clearCache('qq'); await P.search('歌', 'qq'); assert.equal((await P.resolve('qq', 'abc')).syncedLyrics, '[00:01]版本2');
  assert.equal(searches, 2); P.setBridge(null);
});
test('多源局部失败仍返回其他结果和各源状态；失败不缓存', async () => {
  const original = global.fetch; global.fetch = async () => { throw new TypeError('offline'); };
  const attempts = {};
  P.setBridge(async source => {
    attempts[source] = (attempts[source] || 0) + 1;
    if (source === 'netease') return { code: 200, result: { songs: [] } };
    if (source === 'lrclib') return [{ id: 1, trackName: '歌', syncedLyrics: '[00:01]歌词' }];
    throw new Error('test outage');
  });
  try {
    const first = await P.search('歌', 'auto'); assert.equal(first.tracks.length, 1); assert.equal(first.sourceResults.length, 4);
    assert.equal(first.warnings.length, 2); assert.equal(first.sourceResults.find(s => s.id === 'netease').status, 'empty');
    await P.search('歌', 'auto'); assert.equal(attempts.qq, 2);
    await assert.rejects(P.search('歌', 'qq'), e => e.sourceResults[0].status === 'error');
  } finally { global.fetch = original; P.setBridge(null); }
});
test('刷新期间迟到的旧请求不会重新污染缓存', async () => {
  const finish = []; const data = name => ({ code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: name, name }] } } } } });
  P.setBridge(() => new Promise(resolve => finish.push(resolve)));
  const old = P.search('歌', 'qq'); P.clearCache('qq'); const fresh = P.search('歌', 'qq');
  finish[1](data('fresh')); await fresh; finish[0](data('old')); await old;
  assert.equal((await P.search('歌', 'qq')).tracks[0].remoteId, 'fresh'); P.setBridge(null);
});
