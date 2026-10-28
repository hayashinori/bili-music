const test = require('node:test');
const assert = require('node:assert/strict');
const { tokens } = require('../renderer/theme.js');
const { PlayerModel } = require('../model.cjs');
function luminance(hex) { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
test('任意主题填充的前景和浅色界面的主题文字保持可读，拒绝无效颜色', () => {
  for (const color of ['#f43f55', '#ffffff', '#000000', '#ffff00', '#168778', '#7962d8']) {
    const t = tokens(color), a = luminance(t['--theme']), b = luminance(t['--on-theme']);
    assert.ok((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5);
    assert.ok((luminance('#f7f8fa') + .05) / (luminance(t['--red']) + .05) >= 4.5);
    assert.ok((luminance(tokens(color, true)['--red']) + .05) / (luminance('#17191f') + .05) >= 4.5);
  }
  assert.equal(tokens('red; background:url(x)')['--theme'], '#f43f55');
});
test('主题色单独保存并恢复，不覆盖桌面歌词颜色，兼容旧设置', () => {
  let saved; const m = new PlayerModel({}, {}, data => { saved = data; });
  const floatingColor = m.settings.color; m.configure({ themeColor: '#3478DB' });
  assert.equal(saved.settings.themeColor, '#3478db'); assert.equal(m.settings.color, floatingColor);
  m.configure({ themeColor: 'invalid' }); assert.equal(m.settings.themeColor, '#3478db');
  assert.equal(new PlayerModel({}, saved).settings.themeColor, '#3478db');
  assert.equal(new PlayerModel({}, { settings: { themeColor: 'invalid' } }).settings.themeColor, '#f43f55');
});
