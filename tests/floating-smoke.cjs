const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = path.join(root, 'artifacts', `floating-profile-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  // Reproduce the user's saved 0.3.0 state: already enabled and click-through locked.
  fs.writeFileSync(path.join(profile, 'player.json'), JSON.stringify({ settings: { floating: true, locked: true, autoSearch: false } }));
  const env = { ...process.env, BANCI_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'),
    args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env, timeout: 30000 });
  try {
    let main = (await app.windows()).find(p => /index\.html/.test(p.url()));
    if (!main) main = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
    main.setDefaultTimeout(10000); await main.waitForSelector('#recover-floating');
    const nativeState = () => app.evaluate(({ screen }) => {
      const t = globalThis.__banciTest, win = t.floating;
      return { id: win.id, visible: win.isVisible(), minimized: win.isMinimized(), resizable: win.isResizable(),
        top: win.isAlwaysOnTop(), bounds: win.getBounds(), area: screen.getDisplayMatching(win.getBounds()).workArea,
        locked: t.model.settings.locked, background: t.model.settings.floatingBackground };
    });
    async function currentPage() {
      for (let i = 0; i < 50; i++) {
        const page = (await app.windows()).find(p => !p.isClosed() && /floating\.html/.test(p.url()));
        if (page) { try { await page.waitForSelector('#base', { timeout: 500 }); return page; } catch {} }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('Floating document never became ready');
    }
    await main.waitForFunction(async () => (await window.banci.call('state')).state.settings.floating, null, { timeout: 8000 });
    let floating = await currentPage();
    await floating.waitForFunction(() => document.querySelector('#base').textContent.includes('伴词'));
    let before = await nativeState();
    assert.equal(before.visible, true, 'Cold start must create a real visible native window');
    assert.equal(before.resizable, false); assert.equal(before.top, true); assert.equal(before.locked, true); assert.equal(before.background, true);
    await app.evaluate(() => {
      const t = globalThis.__banciTest;
      t.model.media = { ...t.model.media, key: '/video/test/', title: '浮窗回归测试', time: 5, duration: 30 };
      t.model.import('[00:00]桌面歌词显示测试\n[00:10]下一句');
      t.floating.setPosition(80000, -10000); t.floating.hide();
    });
    await main.locator('#recover-floating').click();
    floating = await currentPage();
    await floating.waitForFunction(() => document.querySelector('#base').textContent === '桌面歌词显示测试');
    let recovered = await nativeState();
    assert.notEqual(recovered.id, before.id, 'Recovery must replace the blank native window');
    assert.equal(recovered.visible, true); assert.equal(recovered.locked, false);
    assert.ok(recovered.bounds.x >= recovered.area.x && recovered.bounds.y >= recovered.area.y);
    assert.ok(recovered.bounds.x + recovered.bounds.width <= recovered.area.x + recovered.area.width);
    assert.ok(recovered.bounds.y + recovered.bounds.height <= recovered.area.y + recovered.area.height);
    for (const fontSize of [64, 20, 34]) await main.evaluate(size => window.banci.call('settings', { fontSize: size }), fontSize);
    const unchanged = await nativeState();
    assert.deepEqual(unchanged.bounds, recovered.bounds, 'Font changes must never resize the native window');
    await main.evaluate(() => window.banci.call('floating', false)); assert.equal((await nativeState()).visible, false);
    await main.evaluate(() => window.banci.call('floating', true)); assert.equal((await nativeState()).visible, true);
    await main.evaluate(() => window.banci.call('settings', { locked: true }));
    await main.locator('#recover-floating').click(); floating = await currentPage();
    await floating.waitForFunction(() => document.querySelector('#base').textContent === '桌面歌词显示测试');
    assert.equal((await nativeState()).locked, false);
    await floating.screenshot({ path: path.join(root, 'artifacts/floating-fixed.png') });
    await main.evaluate(() => window.banci.call('settings', { floatingBackground: false }));
    floating = await currentPage();
    await floating.waitForFunction(() => document.querySelector('#base').textContent === '桌面歌词显示测试' && !document.body.classList.contains('with-background'));
    assert.equal((await nativeState()).visible, true); assert.equal((await nativeState()).resizable, false);
    await main.evaluate(() => window.banci.call('settings', { floatingBackground: true }));
    floating = await currentPage();
    await floating.waitForFunction(() => document.body.classList.contains('with-background'));
    console.log('PASS: saved enabled+locked startup is visibly displayed; recovery replaces hidden/off-screen window, unlocks and recenters; font changes keep native size fixed; disable/re-enable works.');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
