const test = require('node:test');
const assert = require('node:assert/strict');
const { sizedBounds, homeBounds } = require('../src/floating-bounds.cjs');
test('歌词框尺寸约束在屏幕内，左边缘拉宽时固定右边缘，重启尺寸可还原', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1080 }, b = { x: -1600, y: 600, width: 900, height: 200 };
  const resized = sizedBounds(b, area, { width: 1100, height: 250, anchor: 'right' });
  assert.equal(resized.x + resized.width, b.x + b.width); assert.equal(resized.height, 250);
  const huge = sizedBounds(b, area, { width: 100000, height: 100000 }); assert.ok(huge.x >= area.x && huge.x + huge.width <= 0); assert.ok(huge.y + huge.height <= area.height);
  assert.equal(homeBounds(area, { width: 1100, height: 250 }).width, 1100);
  assert.throws(() => sizedBounds(b, area, { width: NaN, height: 200 }), /有效/);
});
