const { test } = require('node:test');
const assert = require('node:assert/strict');
const { homeBounds, clampBounds } = require('../floating-bounds.cjs');
test('浮窗归位留在主屏或负坐标副屏的工作区域内', () => {
  for (const area of [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1920, y: 120, width: 1920, height: 1080 }, { x: 2560, y: -1440, width: 1280, height: 720 }]) {
    const b = homeBounds(area);
    assert.ok(b.x >= area.x && b.y >= area.y);
    assert.ok(b.x + b.width <= area.x + area.width);
    assert.ok(b.y + b.height <= area.y + area.height);
  }
});
test('旧浮窗被拖到屏幕外时可归位，尺寸在屏幕内', () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 };
  const b = clampBounds({ x: 80000, y: -10000, width: 900, height: 200 }, area);
  assert.equal(b.x, 372); assert.equal(b.y, 8);
  const small = homeBounds({ x: 0, y: 0, width: 800, height: 600 });
  assert.equal(small.width, 768); assert.equal(small.height, 200);
});
