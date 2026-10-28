const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), profile = path.join(root, 'artifacts', `floating-size-${Date.now()}`);
async function launch() {
  const env = { ...process.env, BANCI_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env });
  let main = (await app.windows()).find(p => /index\.html/.test(p.url()));
  if (!main) main = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
  main.setDefaultTimeout(10000); await main.waitForSelector('#floating-size-apply', { state: 'attached' }); return { app, main };
}
async function floatingPage(app, oldId) {
  for (let i = 0; i < 80; i++) {
    for (const p of await app.windows()) if (!p.isClosed() && /floating\.html/.test(p.url())) { try { const win = await app.browserWindow(p); const native = await win.evaluate(w => ({ id:w.id, visible:w.isVisible() })); if (native.id === oldId || !native.visible) continue; await p.waitForSelector('.resize-edge.right', { timeout: 200 }); return p; } catch {} }
    await new Promise(r => setTimeout(r, 50));
  }
  throw Error('No floating window');
}
(async () => {
  let { app, main } = await launch();
  try {
    await main.evaluate(() => window.banci.call('settings', { floating: true, locked: false, floatingBackground: true, autoSearch: false }));
    await app.evaluate(() => { const m = globalThis.__banciTest.model; m.media = { ...m.media, key: 'long-line', title: '长句测试', duration: 100, time: 5 }; m.import('[00:00]ただ あなたにだけ届いて欲しい 響け恋の歌 ほら 響け恋の歌 いつまでも'); m.import('[00:00]看吧 只是想要向你传达 响彻 恋爱之歌 无论何时都会继续唱给你听', true); });
    let p = await floatingPage(app); await p.waitForFunction(() => document.querySelector('#base').textContent.includes('ただ'));
    const before = await app.evaluate(() => ({ id: globalThis.__banciTest.floating.id, bounds: globalThis.__banciTest.floating.getBounds() }));
    const handle = await p.locator('.resize-edge.right').boundingBox();
    await p.mouse.move(handle.x + handle.width / 2, handle.y + 20); await p.mouse.down();
    await p.mouse.move(handle.x + handle.width / 2 + 100, handle.y + 20, { steps: 8 });
    await p.mouse.up().catch(() => {});
    await main.waitForFunction(async () => (await window.banci.call('state')).state.settings.floatingWidth > 900);
    p = await floatingPage(app, before.id); await p.waitForFunction(() => innerWidth > 900);
    const after = await app.evaluate(() => ({ id: globalThis.__banciTest.floating.id, bounds: globalThis.__banciTest.floating.getBounds(), visible: globalThis.__banciTest.floating.isVisible() }));
    assert.notEqual(after.id, before.id); assert.equal(after.visible, true); assert.ok(Math.abs(after.bounds.width - before.bounds.width - 100) < 8);
    const layout = await p.evaluate(() => {
      const a = document.querySelector('#base').getBoundingClientRect(), b = document.querySelector('#highlight').getBoundingClientRect(), s = document.querySelector('#secondary').getBoundingClientRect();
      return { a: { x:a.x,y:a.y,width:a.width,height:a.height }, b: { x:b.x,y:b.y,width:b.width,height:b.height }, width:innerWidth, font:parseFloat(getComputedStyle(document.querySelector('.primary')).fontSize), secondary:s.width };
    });
    assert.deepEqual(layout.a, layout.b); assert.ok(layout.a.height <= layout.font * 1.6); assert.ok(layout.a.width <= layout.width - 30); assert.ok(layout.secondary <= layout.width - 30);
    await p.screenshot({ path: path.join(root, 'artifacts/floating-long-resized.png') });
    await main.evaluate(() => window.banci.call('settings', { floatingBackground: false })); p = await floatingPage(app, after.id);
    const transparentId = await app.evaluate(() => globalThis.__banciTest.floating.id);
    await p.locator('.resize-edge.right').press('ArrowRight').catch(() => {});
    await main.waitForFunction(async previous => (await window.banci.call('state')).state.settings.floatingWidth >= previous + 35, after.bounds.width);
    const savedWidth = await app.evaluate(() => globalThis.__banciTest.model.settings.floatingWidth);
    p = await floatingPage(app, transparentId); await p.waitForFunction(width => Math.abs(innerWidth - width) < 8 && document.querySelector('#base').textContent.includes('ただ'), savedWidth);
    await main.evaluate(() => window.banci.call('settings', { locked: true }));
    const locked = await main.evaluate(() => window.banci.call('floating-size', { width: 1200, height: 220 })); assert.equal(locked.ok, false);
    await main.evaluate(() => window.banci.call('settings', { locked: false }));
    await app.close(); app = null; ({ app, main } = await launch()); p = await floatingPage(app);
    await p.waitForFunction(width => Math.abs(innerWidth - width) < 8, savedWidth); assert.equal(await app.evaluate(() => globalThis.__banciTest.floating.isVisible()), true);
    console.log('PASS: actual pointer drag extends width, safe recreation, single-line base/highlight alignment and bilingual fitting, transparent keyboard resize, lock rejection and restart size persistence.');
  } finally { if (app) await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
