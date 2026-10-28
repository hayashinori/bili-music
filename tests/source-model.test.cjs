const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerModel } = require('../model.cjs');
test('快捷切源保留自定义搜索词，刷新真正清缓存，失败保留当前歌词及收藏', async () => {
  const calls = [], clears = []; let fail = false;
  const m = new PlayerModel({ clearCache: s => clears.push(s), search: async (query, source) => {
    calls.push([query, source]); if (fail) throw new Error('源连接失败');
    return { tracks: [{ id: source + ':1', provider: source, source, trackName: query, syncedLyrics: '[00:00]原文', translatedLyrics: '[00:00]Translation' }] };
  } });
  m.media.key = 'video1'; m.media.title = '视频原始标题';
  await m.searchSource('qq', '手动歌名'); m.setOffset(1.5); await m.toggleLyricFavorite();
  const favorite = structuredClone(m.lyricFavorites);
  fail = true; await m.searchSource('kugou', '', true);
  assert.deepEqual(calls, [['手动歌名', 'qq'], ['手动歌名', 'kugou']]); assert.deepEqual(clears, ['kugou']);
  assert.equal(m.rows[0].text, '原文'); assert.equal(m.offset, 1.5); assert.deepEqual(m.lyricFavorites, favorite); assert.equal(m.searching, false);
  await assert.rejects(m.searchSource('bad', '歌'), /未知/);
});
test('快速切源时只显示最后一次结果，旧请求不会结束新请求的忙碌状态', async () => {
  const finish = {};
  const m = new PlayerModel({ search: (_, source) => new Promise(r => { finish[source] = r; }) });
  const first = m.searchSource('qq', '歌'); const second = m.searchSource('kugou', '歌');
  finish.qq({ tracks: [] }); await first; assert.equal(m.searching, true);
  finish.kugou({ tracks: [{ id: 'kg:1', source: '酷狗音乐', trackName: '歌', syncedLyrics: '[00:00]新源' }] }); await second;
  assert.equal(m.rows[0].text, '新源'); assert.equal(m.searching, false); assert.equal(m.settings.source, 'kugou');
});
