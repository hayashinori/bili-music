// Opt-in public-network check. No account login is performed.
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--test-mode'], env, timeout: 30000 });
  try {
    let main = (await app.windows()).find(w => /index\.html/.test(w.url()));
    if (!main) main = await app.waitForEvent('window', { predicate: w => /index\.html/.test(w.url()) });
    await main.waitForSelector('#global-query');
    await main.evaluate(() => { window.banci.call('open', 'https://www.bilibili.com/video/BV1gP411u7kS/'); });
    try { await main.waitForFunction(() => document.querySelector('#song-name').textContent.includes('影色舞'), null, { timeout: 30000 }); }
    catch { /* Return real diagnostics, including upstream accessibility limits. */ }
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(JSON.stringify(await app.evaluate(async () => {
      const t = globalThis.__banciTest, snapshot = t.model.snapshot();
      return { media: snapshot.media.title, duration: snapshot.media.duration, track: snapshot.track,
        rows: snapshot.rows.length, hasTranslation: !!snapshot.translations.length, status: snapshot.status,
        browserURL: t.guest?.webContents.getURL(), pageTitle: await t.guest?.webContents.getTitle(),
        pageText: await t.guest?.webContents.executeJavaScript('document.body.innerText.slice(0,220)') };
    })));
    await main.evaluate(() => { window.banci.call('login'); });
    await new Promise(resolve => setTimeout(resolve, 6000));
    console.log(JSON.stringify(await app.evaluate(async () => ({ loginURL: globalThis.__banciTest.guest.webContents.getURL(),
      loginPageTitle: globalThis.__banciTest.guest.webContents.getTitle(),
      hasLoginUI: await globalThis.__banciTest.guest.webContents.executeJavaScript('/登录|扫码/.test(document.body.innerText)') }))));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
