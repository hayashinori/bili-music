const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  env.BANCI_TEST_PROFILE = path.join(root, 'artifacts', `desktop-profile-${Date.now()}`);
  const electronApp = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env, timeout: 30000 });
  try {
    const windows = await electronApp.windows();
    let main = windows.find(w => /index\.html/.test(w.url()));
    if (!main) main = await electronApp.waitForEvent('window', { predicate: w => /index\.html/.test(w.url()) });
    main.setDefaultTimeout(12000);
    await main.waitForSelector('#song-name');
    const errors = []; main.on('pageerror', error => errors.push(error.message));
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await main.screenshot({ path: path.join(root, 'artifacts/desktop-home.png') });
    // The embedded official origin receives a deterministic test document. No
    // real login, account cookie, microphone or remote media is involved.
    const sampleRate = 8000, wav = Buffer.alloc(44 + sampleRate * 40 * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    await electronApp.evaluate(({ session }, audioBase64) => {
      session.fromPartition('persist:bilibili').protocol.handle('https', request => {
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>伴词联动演示</title><meta property="og:image" content=""></head><body style="background:#243342;color:white"><h1 title="MyGO!!!!!《影色舞》">MyGO!!!!!《影色舞》</h1><div class="bpx-player-container"><video muted preload="auto" src="data:audio/wav;base64,${audioBase64}"></video><p>内嵌视频同步测试</p></div><script>const v=document.querySelector('video');v.addEventListener('loadedmetadata',()=>{v.currentTime=12;v.pause();});</script></body></html>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      });
      globalThis.__banciTest.model.providers = {
        search: async () => ({ tracks: [{ id: 'netease:1', provider: 'netease', source: '网易云音乐', remoteId: 1, trackName: '影色舞', artistName: 'MyGO!!!!!', duration: 250, syncedLyrics: '[00:00]演示字幕\n[00:10]让这一句跟随音乐\n[00:20]下一句也会准时亮起', translatedLyrics: '[00:10]This line follows the music' }] })
      };
    }, wav.toString('base64'));
    await main.locator('#global-query').fill('BV1xx411c7mD');
    await main.locator('#open-form button[type=submit]').click();
    await main.waitForFunction(() => document.querySelector('#lyric-source').textContent === '网易云音乐', null, { timeout: 12000 }).catch(async e => {
      console.error('MEDIA DIAGNOSTICS', await electronApp.evaluate(() => ({ state: globalThis.__banciTest.model.snapshot(), url: globalThis.__banciTest.guest?.webContents.getURL() })));
      throw e;
    });
    await main.locator('[data-page="listen"]').click();
    await main.waitForFunction(() => document.querySelector('.lyric-row.current')?.textContent.includes('让这一句跟随音乐'));
    assert.match(await main.locator('.lyric-row.current').textContent(), /This line follows/);
    await main.locator('#offset-more').click();
    await main.waitForFunction(() => document.querySelector('#offset-value').textContent === '+0.5s');
    await main.locator('#bilingual').click();
    await main.waitForFunction(() => document.querySelector('.lyric-row.current .translation') === null);
    await main.locator('#bilingual').click();
    await main.evaluate(() => window.banci.call('floating', true));
    assert.equal(await electronApp.evaluate(() => globalThis.__banciTest.floating.isVisible()), true);
    const floating = (await electronApp.windows()).find(w => /floating\.html/.test(w.url()));
    await floating.waitForFunction(() => document.querySelector('#base').textContent === '让这一句跟随音乐');
    await main.screenshot({ path: path.join(root, 'artifacts/desktop-playing.png') });
    await floating.screenshot({ path: path.join(root, 'artifacts/floating.png'), omitBackground: true });
    await main.locator('[data-page="settings"]').click();
    await main.locator('#locked').check();
    assert.equal(await electronApp.evaluate(() => globalThis.__banciTest.model.settings.locked), true);
    await main.locator('#locked').uncheck();
    await main.locator('#custom-text').fill('[00:00]自定义字幕\n[00:10]导入后的这一句\n[00:20]下一句');
    await main.locator('#paste-apply').click();
    assert.equal(await electronApp.evaluate(() => globalThis.__banciTest.model.track.source), '本地导入');
    await main.locator('#align-line').selectOption('1'); await main.locator('#align-apply').click();
    assert.equal(await electronApp.evaluate(() => globalThis.__banciTest.model.offset), 2);
    await main.screenshot({ path: path.join(root, 'artifacts/desktop-settings.png') });
    // Switch the embedded page without a full navigation: preload must detect it.
    await electronApp.evaluate(async () => {
      const guest = globalThis.__banciTest.guest;
      await guest.webContents.executeJavaScript(`history.pushState({},'', '/video/BV2xx411c7mD/');document.querySelector('h1').setAttribute('title','另一首歌');`);
    });
    await main.waitForFunction(() => document.querySelector('#dock-title').textContent === '另一首歌' || document.querySelector('#dock-title').textContent === '影色舞');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.notEqual(await electronApp.evaluate(() => globalThis.__banciTest.model.track?.source), '本地导入');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(await main.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS: real Electron window, isolated Bilibili-origin preload, media detection, auto lyrics, bilingual, offset, native floating window, lock/unlock, custom subtitles, sentence alignment and SPA navigation. No renderer errors.');
  } finally { await electronApp.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
