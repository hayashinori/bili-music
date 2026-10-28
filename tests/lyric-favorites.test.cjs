const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PlayerModel } = require('../model.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const media = { key: '/video/starred/?p=2', title: '测试歌曲', url: 'https://www.bilibili.com/video/starred/?p=2', time: 5, duration: 100, paused: true };
test('星标候选会切换并保存原文、翻译与后续偏移，重启可离线调用', async () => {
  let saved;
  const providers = { search: async () => ({ tracks: [1, 2].map(id => ({ id, trackName: '测试歌曲', duration: 100, source: '测试源', provider: 'netease', remoteId: id, lyricsPending: true })) }),
    resolve: async (_, id) => ({ syncedLyrics: `[00:00]版本${id}\n[00:10]下一句`, translatedLyrics: '[00:00]Translation', lyricsPending: false }) };
  const model = new PlayerModel(providers, {}, data => { saved = structuredClone(data); }); model.media = { ...model.media, ...media };
  await model.search('测试歌曲'); assert.equal(model.track.id, 1);
  assert.equal(await model.toggleLyricFavorite(2), true); model.setOffset(1.75);
  assert.equal(model.snapshot().currentLyricsStarred, true); assert.equal(saved.lyricFavorites[media.key].offset, 1.75);
  saved.library = {}; // Ordinary cache eviction must not remove the star.
  const offline = new PlayerModel({ search: () => { throw new Error('收藏不应请求来源'); } }, saved);
  offline.updateMedia(media); await wait(720);
  assert.equal(offline.track.id, 2); assert.equal(offline.offset, 1.75);
  assert.equal(offline.snapshot().text, '版本2'); assert.equal(offline.snapshot().translation, 'Translation');
  assert.match(offline.status, /收藏/);
});
test('已收藏版本优先于后来临时选择的缓存，取消收藏保留当前字幕', async () => {
  let saved; const model = new PlayerModel({}, {}, d => { saved = structuredClone(d); }); model.media = { ...model.media, ...media };
  model.import('[00:00]收藏版本'); await model.toggleLyricFavorite(); const id = model.track.id;
  model.import('[00:00]临时版本');
  const restored = new PlayerModel({}, saved); restored.updateMedia(media); await wait(720);
  assert.equal(restored.track.id, id); assert.equal(restored.snapshot().text, '收藏版本');
  assert.equal(await restored.toggleLyricFavorite(), false); assert.equal(restored.snapshot().currentLyricsStarred, false);
  assert.equal(restored.snapshot().text, '收藏版本');
});
test('收藏加载期间切换视频，不会把迟到歌词绑定到新视频', async () => {
  let finish;
  const model = new PlayerModel({ resolve: () => new Promise(r => { finish = r; }) }, { settings: { autoSearch: false } });
  model.media = { ...model.media, ...media }; model.candidates = [{ id: 'pending', provider: 'netease', remoteId: 1, lyricsPending: true }];
  const pending = model.toggleLyricFavorite('pending');
  model.updateMedia({ ...media, key: '/video/new/', title: '新视频' });
  finish({ syncedLyrics: '[00:00]旧歌词', lyricsPending: false });
  await assert.rejects(pending, /视频已切换/); assert.deepEqual(model.lyricFavorites, {}); clearTimeout(model.timer);
});
