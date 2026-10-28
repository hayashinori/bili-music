const test = require('node:test');
const assert = require('node:assert/strict');
const { SongQueue, videoURL } = require('../src/song-queue.cjs');
const { PlayerModel } = require('../src/model.cjs');
const ids = ['BV1xx411c7mD', 'BV2xx411c7mD', 'BV3xx411c7mD'];
function fixture() { const q = new SongQueue(); ids.forEach((id, i) => q.add({ url: id, title: '歌曲' + i })); return q; }
test('歌曲列表标准化去重、保留分P、拒绝其他站点及非视频', () => {
  const q = fixture(); assert.equal(q.add({ url: 'https://www.bilibili.com/video/BV1xx411c7mD/?spm=x&p=1' }), false);
  assert.equal(q.add({ url: 'https://www.bilibili.com/video/BV1xx411c7mD/?p=2' }), true);
  for (const url of ['https://evil.com/video/BV1xx411c7mD', 'https://passport.bilibili.com/login', 'abc']) assert.throws(() => videoURL(url));
  assert.equal(q.items.length, 4);
});
test('下一首、上一首与自动顺序/列表/单曲循环行为', () => {
  const q = fixture(), [a,b,c] = q.items;
  assert.equal(q.next(a.url).id, b.id); assert.equal(q.next(a.url, -1).id, c.id);
  assert.equal(q.next(c.url, 1, true), null);
  q.setMode('list'); assert.equal(q.next(c.url, 1, true).id, a.id);
  q.setMode('one'); assert.deepEqual(q.next(b.url, 1, true), { repeat: true }); assert.equal(q.next(b.url).id, c.id);
});
test('重排不改变当前歌曲，校验完整ID集合，删除正在播放项后可衔接下一首', () => {
  const q = fixture(), [a,b,c] = q.items;
  q.select(b.id); q.reorder([c.id,b.id,a.id]); assert.equal(q.currentId,b.id); assert.equal(q.next(b.url).id,a.id);
  assert.throws(() => q.reorder([a.id,a.id,c.id]), /变化/);
  q.remove(b.id); assert.equal(q.next(b.url).id,a.id);
  const restored = new SongQueue(q.snapshot()); assert.deepEqual(restored.items,q.items);
});
test('列表和外观设置一起持久化，轻量时钟不携带列表', () => {
  let saved; const m = new PlayerModel({}, {}, d => saved = structuredClone(d));
  m.queue.add({ url:ids[0],title:'保存曲目' }); m.queue.setMode('list'); m.configure({ appearance:'dark' });
  const restored = new PlayerModel({}, saved); assert.equal(restored.queue.items.length,1); assert.equal(restored.queue.mode,'list'); assert.equal(restored.settings.appearance,'dark');
  assert.equal('queue' in restored.clock(),false); assert.throws(() => restored.queue.setMode('bad'));
});
