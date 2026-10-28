const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, BANCI_TEST_PROFILE: path.join(root, 'artifacts', `sources-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env });
  try {
    let page = (await app.windows()).find(p => /index\.html/.test(p.url()));
    if (!page) page = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
    await page.waitForSelector('#quick-source'); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(() => {
      const m = globalThis.__banciTest.model; m.configure({ audioOnly: true });
      globalThis.__sourceCalls = {}; globalThis.__kgFail = false;
      m.providers.setBridge(async (source, operation, parameters) => {
        const key = `${source}:${operation}`, n = globalThis.__sourceCalls[key] = (globalThis.__sourceCalls[key] || 0) + 1;
        if (source === 'netease') return operation === 'search' ? { code: 200, result: { songs: [{ id: 1, name: parameters.query, artists: [{ name: '测试歌手' }], duration: 200000 }] } } : { code: 200, lrc: { lyric: '[00:00]网易云歌词\n[00:10]正在听的这一句' } };
        if (source === 'qq') return operation === 'search' ? { code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: 'fixtureQQ', name: parameters.query, singer: [{ name: '测试歌手' }], interval: 200 }] } } } } } : { code: 0, lyric: `[00:00]QQ歌词第${n}版\n[00:10]正在听的这一句`, trans: '[00:10]This line follows the music' };
        if (source === 'kugou') return globalThis.__kgFail ? { status: 0, error_code: 503 } : operation === 'search' ? { status: 1, data: { lists: [{ FileHash: 'A'.repeat(32), SongName: parameters.query, SingerName: '测试歌手', Duration: 200 }] } } : { status: 200, content: Buffer.from('[00:00]酷狗歌词\n[00:10]正在听的这一句').toString('base64') };
        return [{ id: 1, trackName: parameters.query, syncedLyrics: '[00:00]LRCLIB歌词', duration: 200 }];
      });
      m.updateMedia({ key: 'source-video', title: '测试歌曲', url: 'https://www.bilibili.com/video/BV1xx411c7mD/', time: 12, duration: 200, paused: true });
    });
    await page.waitForFunction(() => document.querySelectorAll('.source-result').length === 4 && !document.querySelector('#source-refresh').disabled);
    assert.equal(await page.locator('.player-column .lyric-tools #quick-source').count(), 1);
    assert.equal(await page.locator('.player-column .lyric-tools #offset-more').count(), 1);
    const layout = await page.evaluate(() => ({ lyrics:document.querySelector('#lyrics-scroll').getBoundingClientRect().toJSON(), tools:document.querySelector('.lyric-tools').getBoundingClientRect().toJSON() }));
    assert.ok(layout.lyrics.height > 350); assert.ok(layout.tools.right < layout.lyrics.left);
    await page.locator('#match-details').evaluate(el => el.open = true);
    await page.locator('#lyric-query').fill('手动歌名'); await page.locator('#quick-source').selectOption('qq');
    await page.waitForFunction(() => document.querySelector('#lyric-source').textContent === 'QQ 音乐' && !document.querySelector('#source-refresh').disabled);
    assert.equal(await page.locator('#source').inputValue(), 'qq');
    assert.match(await page.locator('.lyric-row.current').textContent(), /This line follows/);
    await page.locator('#offset-more').click(); await page.locator('#source-refresh').click();
    await page.waitForFunction(() => document.querySelector('#lyrics-lines').textContent.includes('QQ歌词第2版') && !document.querySelector('#source-refresh').disabled);
    assert.equal(await page.locator('#offset-value').textContent(), '+0.5s');
    const calls = await app.evaluate(() => globalThis.__sourceCalls); assert.equal(calls['qq:lyric'], 2); assert.equal(calls['qq:search'], 3);
    await page.locator('#quick-source').selectOption('kugou');
    await page.waitForFunction(() => document.querySelector('#lyric-source').textContent === '酷狗音乐' && !document.querySelector('#source-refresh').disabled);
    await page.screenshot({ path: path.join(root, 'artifacts/quick-sources.png') });
    await app.evaluate(() => globalThis.__kgFail = true); await page.locator('#source-refresh').click();
    await page.waitForSelector('.source-result.error');
    assert.equal(await page.locator('#lyric-source').textContent(), '酷狗音乐');
    assert.match(await page.locator('#lyrics-lines').textContent(), /酷狗歌词/);
    await page.locator('[data-page="settings"]').click(); await page.locator('#source').selectOption('lrclib');
    await page.waitForFunction(() => document.querySelector('#quick-source').value === 'lrclib');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS: four-source merge/status, inline source selection, synchronized settings, actual cache-bypass refresh, bilingual lyrics, retained offset, KuGou decode and outage retaining current lyrics. Isolated profile.');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
