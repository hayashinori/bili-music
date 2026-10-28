const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PlayerModel } = require('../src/model.cjs');
const { allowedBilibili, resolveInput } = require('../src/navigation.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const media = (key, title = '演示歌') => ({ key, title, url: 'https://www.bilibili.com' + key, time: 12, duration: 200, paused: false });
test('只接受B站HTTPS地址和BV号，其他输入作为官方搜索', () => {
  assert.equal(resolveInput('BV1xx411c7mD'), 'https://www.bilibili.com/video/BV1xx411c7mD/');
  assert.equal(allowedBilibili('https://passport.bilibili.com/login'), true);
  for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'https://bilibili.com.evil.com/', 'http://www.bilibili.com']) assert.equal(allowedBilibili(url), false);
  assert.throws(() => resolveInput('https://evil.com/'), /B 站/);
  assert.match(resolveInput('影色舞 MyGO'), /search\.bilibili\.com/);
});
test('搜索自动采用最高可用时间轴，网易云翻译一起载入', async () => {
  const providers = { search: async () => ({ tracks: [1, 2].map(n => ({ id: n, trackName: '演示歌', duration: 200 + n, lyricsPending: true, provider: 'netease', source: '网易云音乐', remoteId: n })) }),
    resolve: async (_, id) => ({ syncedLyrics: id === 1 ? '' : '[00:10]原文\n[00:20]下一句', translatedLyrics: '[00:10]Translation', lyricsPending: false }) };
  const model = new PlayerModel(providers, { settings: { autoSearch: false } });
  model.media = media('/video/BVexample/');
  await model.search('演示歌');
  assert.equal(model.track.id, 2); assert.equal(model.snapshot().text, '原文');
  assert.equal(model.snapshot().translation, 'Translation');
  assert.equal(model.snapshot().progress, .2);
});
test('切换视频立即清空，迟到的旧歌词无法覆盖当前视频', async () => {
  let finish;
  const model = new PlayerModel({ search: () => new Promise(resolve => { finish = resolve; }) }, { settings: { autoSearch: false } });
  model.media = media('/video/old/');
  model.import('[00:00]旧歌');
  const searching = model.search('旧歌');
  model.updateMedia(media('/video/new/', '新歌'));
  assert.equal(model.snapshot().text, '');
  finish({ tracks: [{ id: 1, trackName: '旧歌', syncedLyrics: '[00:00]迟到旧歌' }] });
  await searching;
  assert.equal(model.rows.length, 0);
  clearTimeout(model.timer);
});
test('双语开关、偏移、按句校准和逐视频保存', () => {
  let saved;
  const model = new PlayerModel({}, {}, value => { saved = value; }); model.media = media('/video/imported/');
  model.import('[00:10]歌词\n[00:20]下句'); model.import('[00:10]Translation', true);
  model.setOffset(3); assert.equal(model.snapshot().text, '');
  model.align(0); assert.equal(model.offset, 2); assert.equal(model.snapshot().text, '歌词');
  model.configure({ bilingual: false, fontSize: 1000 }); assert.equal(model.snapshot().translation, '');
  assert.equal(model.settings.fontSize, 64); assert.equal(saved.library['/video/imported/'].manual, true);
});
test('导入的字幕可在再次打开同视频时恢复', async () => {
  const key = '/video/saved/';
  const model = new PlayerModel({}, { library: { [key]: { rows: [{ time: 0, text: '已保存' }], translations: [], offset: 1, manual: true } } });
  model.updateMedia(media(key)); await wait(700);
  assert.equal(model.snapshot().text, '已保存'); assert.equal(model.offset, 1);
});
