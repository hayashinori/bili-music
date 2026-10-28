(function (root) {
  'use strict';
  const defaults = { autoSearch: true, lyricsSource: 'auto', overlay: true, bilingual: true, desktop: false, offset: 0, fontSize: 28, color: '#80e7ff' };
  function cleanTitle(title) {
    const quoted = title.match(/[《「『]([^》」』]+)[》」』]/);
    return (quoted ? quoted[1] : title
      .replace(/[_-]哔哩哔哩.*$/i, '')
      .replace(/[【\[].*?[】\]]/g, ' ')
      .replace(/\b(official|music video|lyrics?|mv|pv|live|cover|4k|1080p)\b/gi, ' ')
      .replace(/(完整版|中英双语|双语字幕|中文字幕|高音质|无损音质|纯享版|翻唱|现场版)/g, ' ')
    ).replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function clock(s) {
    const a = s.replace(',', '.').split(':').map(Number);
    return a.length === 3 ? a[0] * 3600 + a[1] * 60 + a[2] : a[0] * 60 + a[1];
  }
  function parseLyrics(source) {
    const raw = String(source || '').replace(/^\uFEFF/, '').replace(/\r/g, '');
    if (raw.length > 1000000) throw new Error('字幕超过 1 MB，请缩小文件后重试。');
    const rows = [];
    if (raw.includes('-->')) {
      const blocks = raw.split(/\n\s*\n/);
      for (const block of blocks) {
        const lines = block.split('\n');
        const i = lines.findIndex(l => l.includes('-->'));
        if (i < 0) continue;
        const m = lines[i].match(/((?:\d+:)?\d{2}:\d{2}[.,]\d+)\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d+)/);
        if (!m) continue;
        const time = clock(m[1]), end = clock(m[2]);
        if (end <= time) continue;
        rows.push({ time, end, text: lines.slice(i + 1).join('\n').replace(/<[^>]*>/g, '').trim() });
      }
    } else {
      const offset = Number(raw.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
      for (const line of raw.split('\n')) {
        const stamps = [...line.matchAll(/\[(\d+):(\d{2}(?:\.\d+)?)\]/g)];
        const text = line.replace(/\[[^\]]*\]/g, '').trim();
        for (const m of stamps) rows.push({ time: Math.max(0, Number(m[1]) * 60 + Number(m[2]) + offset), text });
      }
    }
    const sorted = rows.filter(r => Number.isFinite(r.time)).sort((a, b) => a.time - b.time);
    const grouped = [];
    for (const row of sorted) {
      const prev = grouped[grouped.length - 1];
      if (prev && prev.time === row.time) {
        if (row.text && !prev.text.split('\n').includes(row.text)) prev.text += (prev.text ? '\n' : '') + row.text;
        if (row.end != null) prev.end = Math.max(prev.end || 0, row.end);
      } else grouped.push({ ...row });
    }
    if (!grouped.length) throw new Error('未找到时间戳。请导入 LRC、SRT 或 VTT；纯文本无法自动确定唱词时间。');
    return grouped;
  }
  function indexAt(rows, time) {
    let lo = 0, hi = rows.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].time <= time) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
  }
  function lineAt(rows, time) {
    const i = indexAt(rows, time), row = rows[i];
    return row && (row.end == null || time < row.end) ? row.text : '';
  }
  function norm(s) { return String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
  function rankTracks(tracks, query, duration, context = query) {
    const q = norm(query);
    const full = norm(context || query);
    return tracks.map(t => {
      const title = norm(t.trackName), artist = norm(t.artistName);
      const titleMatch = !!title && (q === title || q.includes(title) || title.includes(q) && q.length >= 3);
      const diff = Math.abs(Number(t.duration || 0) - (duration || 0));
      const artists = String(t.artistName || '').split(/\s*\/\s*/).map(norm).filter(Boolean);
      const artistMatch = artists.some(a => full.includes(a));
      const version = /live|现场|伴奏|remix|翻唱|cover|dj/i;
      const versionPenalty = version.test(t.trackName) && !version.test(context) ? 12 : 0;
      const score = (titleMatch ? 50 : 0) + (artistMatch ? 22 : 0) + (t.syncedLyrics || t.lyricsPending ? 15 : 0)
        + (duration > 0 ? Math.max(0, 20 - diff) : 0) + (t.provider === 'netease' ? 2 : 0) - versionPenalty;
      return { ...t, score, confident: titleMatch && !!t.syncedLyrics && duration > 0 && diff <= 8 };
    }).sort((a, b) => b.score - a.score);
  }
  function frameAt(rows, time) {
    const index = indexAt(rows, time), row = rows[index];
    const next = rows[index + 1];
    if (!row || row.end != null && time >= row.end) return { text: '', nextText: next?.text || '', progress: 0 };
    const end = row.end ?? next?.time;
    return { text: row.text, nextText: next?.text || '', progress: Number.isFinite(end) && end > row.time ? Math.max(0, Math.min(1, (time - row.time) / (end - row.time))) : 0 };
  }
  function formatTime(s) { return `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`; }
  const api = { defaults, cleanTitle, parseLyrics, lineAt, indexAt, rankTracks, frameAt, formatTime };
  root.BanCi = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
