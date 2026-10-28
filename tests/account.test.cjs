const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BiliAccount, imageURL } = require('../account.cjs');
const { PlayerModel } = require('../model.cjs');
test('账号资料和收藏夹使用当前会话，输出仅含显示所需字段', async () => {
  const requests = [];
  const account = new BiliAccount(async (url, options) => {
    requests.push({ url, options }); const p = new URL(url).pathname;
    const data = p.includes('/nav') ? { isLogin: true, mid: 42, uname: '测试用户', face: 'http://i0.hdslb.com/avatar.jpg', secret: 'never-export' }
      : p.includes('list-all') ? { list: [{ id: 123, title: '音乐收藏', media_count: 21 }] }
      : { has_more: true, medias: [{ id: 1, type: 2, bvid: 'BV1xx411c7mD', title: '视频', cover: 'https://i0.hdslb.com/a.jpg', upper: { name: 'UP' }, duration: 100, attr: 0 }] };
    return { ok: true, json: async () => ({ code: 0, data }) };
  });
  const profile = await account.getProfile(); assert.equal(profile.name, '测试用户'); assert.equal(profile.avatar, 'https://i0.hdslb.com/avatar.jpg'); assert.equal(profile.secret, undefined);
  assert.equal((await account.folders())[0].id, '123');
  const videos = await account.videos('123', 2); assert.equal(videos.items[0].url, 'https://www.bilibili.com/video/BV1xx411c7mD/'); assert.equal(videos.hasMore, true);
  assert.ok(requests.every(r => r.options.credentials === 'include'));
  assert.equal(new URL(requests.at(-1).url).searchParams.get('pn'), '2');
  assert.equal(requests.filter(r => r.url.includes('/nav')).length, 1);
  await assert.rejects(account.videos('https://evil.com'), /无效/);
  assert.equal(imageURL('https://evil-hdslb.com/secret'), '');
});
test('账号未登录时不会读取收藏夹，接口失败显示真实错误', async () => {
  const account = new BiliAccount(async () => ({ ok: true, json: async () => ({ code: -101 }) }));
  assert.equal((await account.getProfile()).loggedIn, false); await assert.rejects(account.folders(), /先登录/);
  const failed = new BiliAccount(async () => ({ ok: true, json: async () => ({ code: -403, message: 'denied' }) }));
  await assert.rejects(failed.getProfile(), /-403/);
});
test('删除与一键清空最近播放可撤销，不删除字幕缓存', () => {
  const history = [{ url: 'a', title: 'A' }, { url: 'b', title: 'B' }];
  const model = new PlayerModel({}, { history, library: { existing: { rows: [{ time: 0, text: 'cached' }] } } });
  model.removeHistory('a'); assert.equal(model.history.length, 1); model.undoHistory(); assert.equal(model.history.length, 2);
  model.clearHistory(); assert.equal(model.history.length, 0); assert.ok(model.library.existing); model.undoHistory(); assert.equal(model.history.length, 2);
  model.configure({ libraryLayout: 'list', secondaryFontSize: 28, mainSecondaryFontSize: 18 });
  assert.equal(model.settings.fontSize, 34); assert.equal(model.settings.secondaryFontSize, 28); assert.equal(model.settings.libraryLayout, 'list');
});
test('播放时钟更新不再携带完整歌词和历史记录', () => {
  const model = new PlayerModel({}); model.media = { ...model.media, key: '/video/test/', title: 'test', duration: 200 };
  model.rows = Array.from({ length: 1000 }, (_, i) => ({ time: i, text: '字幕内容' + i }));
  let full = 0, clocks = 0, clock;
  model.on('state', () => full++); model.on('clock', c => { clocks++; clock = c; });
  for (let i = 0; i < 100; i++) model.updateMedia({ key: '/video/test/', title: 'test', time: i / 10 });
  assert.equal(full, 0); assert.equal(clocks, 100); assert.equal(clock.rows, undefined); assert.equal(clock.history, undefined);
  assert.ok(JSON.stringify(clock).length < JSON.stringify(model.snapshot()).length / 20);
});
