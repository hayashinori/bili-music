const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, BANCI_TEST_PROFILE: path.join(root, 'artifacts', `immersive-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env });
  try {
    let main = (await app.windows()).find(p => /index\.html/.test(p.url()));
    if (!main) main = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
    main.setDefaultTimeout(10000); await main.waitForSelector('#immersive-toggle');
    assert.equal(await main.locator('.immersive-spindle').count(), 0);
    async function sampleArm() {
      return main.evaluate(async () => {
        const samples = [], started = performance.now();
        while (performance.now() - started < 820) {
          await new Promise(requestAnimationFrame);
          const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.immersive-arm')).transform);
          samples.push(Math.atan2(m.b, m.a) * 180 / Math.PI);
        }
        return samples;
      });
    }
    const errors = []; main.on('pageerror', e => errors.push(e.message));
    await main.locator('#global-query').fill('不应触发搜索'); assert.equal(await main.locator('#search-clear').isVisible(), true);
    await main.locator('#search-clear').click(); assert.equal(await main.locator('#global-query').inputValue(), '');
    assert.equal(await main.locator('#global-query').evaluate(el => el === document.activeElement), true);
    assert.equal(await main.locator('#search-clear').isVisible(), false);
    assert.equal(await main.locator('.floating-actions #immersive-toggle').count(), 1);
    await main.locator('#immersive-toggle').click(); await main.locator('#immersive-exit').click();
    const wav = Buffer.alloc(44 + 8000 * 40 * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    await app.evaluate(({ session }, audio) => {
      session.fromPartition('persist:bilibili').protocol.handle('https', () => new Response(`<!doctype html><meta charset="utf-8"><h1 title="夜行 / 测试歌手">夜行 / 测试歌手</h1><div class="bpx-player-container"><video muted src="data:audio/wav;base64,${audio}"></video></div><script>const v=document.querySelector('video');v.onloadedmetadata=()=>{v.currentTime=12;v.pause()}</script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      globalThis.__banciTest.model.providers = { search: async () => ({ tracks: [{ id: 'fixture:1', source: '网易云音乐', trackName: '夜行', artistName: '测试歌手', duration: 40, syncedLyrics: '[00:00]灯火穿过长街\n[00:05]风在窗边停留\n[00:10]ほら あなたにとって大事な人ほど すぐそばにいるの\n[00:20]直到天色渐明\n[00:30]我们仍在途中', translatedLyrics: '[00:10]This line follows the music' }] }) };
    }, wav.toString('base64'));
    await main.locator('#global-query').fill('BV1xx411c7mD'); await main.locator('#open-form button[type=submit]').click();
    await main.waitForFunction(() => document.querySelector('#lyric-source').textContent === '网易云音乐');
    await main.locator('[data-page="listen"]').click();
    await main.locator('#play').click();
    await main.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === '暂停');
    const before = await app.evaluate(() => ({ guestId: globalThis.__banciTest.guest.webContents.id, time: globalThis.__banciTest.model.media.time }));
    await main.locator('#immersive-toggle').click();
    await main.waitForFunction(() => document.body.classList.contains('immersive'));
    const falling = await sampleArm();
    assert.ok(new Set(falling.map(Math.round)).size > 3, 'Needle must visibly move through intermediate angles');
    assert.ok(Math.abs(falling.at(-1) - 24) < 1);
    await main.waitForFunction(async time => (await window.banci.call('state')).state.media.time > time + .4, before.time);
    assert.equal(await app.evaluate(() => globalThis.__banciTest.guest.webContents.id), before.guestId);
    assert.equal(await app.evaluate(() => globalThis.__banciTest.guest.getVisible()), false);
    assert.equal(await main.locator('.sidebar').isVisible(), false);
    assert.equal(await main.locator('.lyrics-column>.song-heading').count(), 1);
    assert.match(await main.locator('.lyric-row.current').textContent(), /This line follows/);
    await main.waitForFunction(() => getComputedStyle(document.querySelector('.lyric-row.current')).color === 'rgb(255, 255, 255)');
    assert.equal(await main.locator('#play').isVisible(), true);
    assert.equal(await main.locator('#queue-open').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await main.locator('#queue-open').hover();
    assert.notEqual(await main.locator('#queue-open').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    const typography = await main.evaluate(() => { const current = getComputedStyle(document.querySelector('.lyric-row.current')), normal = getComputedStyle(document.querySelector('.lyric-row:not(.current)')); return { active:current.fontSize, inactive:normal.fontSize, activeWeight:current.fontWeight, normalWeight:normal.fontWeight }; });
    assert.equal(typography.active, typography.inactive); assert.equal(typography.activeWeight, typography.normalWeight);
    await main.screenshot({ path: path.join(root, 'artifacts/immersive-mode.png') });
    await main.locator('#play').click(); await main.waitForFunction(() => !document.body.classList.contains('record-playing'));
    const rising = await sampleArm(); assert.ok(new Set(rising.map(Math.round)).size > 3); assert.ok(Math.abs(rising.at(-1) + 28) < 1);
    await main.keyboard.press('Escape');
    await main.waitForFunction(() => !document.body.classList.contains('immersive'));
    assert.equal(await main.locator('.player-column>.song-heading').count(), 1);
    assert.equal(await main.locator('.sidebar').isVisible(), true);
    await main.waitForFunction(async () => (await window.banci.call('state')).state.media.paused);
    assert.equal(await app.evaluate(() => globalThis.__banciTest.guest.getVisible()), true);
    await main.waitForFunction(async () => (await window.banci.call('state')).state.media.paused);
    await main.locator('#immersive-toggle').click();
    await app.evaluate(() => globalThis.__banciTest.main.setSize(1040, 720));
    assert.equal(await main.locator('#immersive-exit').isVisible(), true);
    assert.equal(await main.locator('#play').isVisible(), true);
    assert.equal(await main.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await main.locator('#immersive-exit').click();
    assert.equal(await main.locator('#global-query').inputValue(), 'BV1xx411c7mD');
    assert.equal(await main.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []);
    console.log('PASS: clear without navigation and retained focus; immersive button in lyrics control group; actual video keeps playing with same guest; bilingual lyrics, pause, Esc/button exits and original layout restored.');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
