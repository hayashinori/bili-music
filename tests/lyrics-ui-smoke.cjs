const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, 'artifacts', `lyrics-ui-${Date.now()}`);
async function launch() {
  const env = { ...process.env, BANCI_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env });
  let page = (await app.windows()).find(p => /index\.html/.test(p.url()));
  if (!page) page = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
  await page.waitForSelector('#song-name');
  return { app, page };
}
(async () => {
  let { app, page } = await launch();
  try {
    await app.evaluate(() => {
      const m = globalThis.__banciTest.model;
      m.configure({ audioOnly: true });
      m.providers = { search: async () => ({ tracks: [1, 2].map(i => ({ id: `netease:${i}`, provider: 'netease', source: '网易云音乐', trackName: '影色舞', artistName: i === 1 ? 'MyGO!!!!!' : '收藏版本', duration: 40, syncedLyrics: `[00:00]版本${i}\n[00:10]收藏的这一句`, translatedLyrics: '[00:10]Saved translation' })) }) };
      m.updateMedia({ key: 'BV1xx411c7mD:1', title: 'MyGO!!!!! 影色舞', url: 'https://www.bilibili.com/video/BV1xx411c7mD/', time: 12, duration: 40, paused: true });
    });
    await page.locator('[data-page="listen"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.candidate-row').length === 2);
    assert.equal(await page.locator('.side-bottom,.breadcrumb,.record-art').count(), 0);
    assert.equal(await page.locator('#album-stage').isVisible(), false);
    assert.equal(await page.locator('#dock-cover').evaluate(el => getComputedStyle(el).borderRadius), '50%');
    await page.locator('#candidates').evaluate(el => { const d = el.closest('details'); if (d) d.open = true; });
    await page.locator('.lyric-star[data-track-id="netease:2"]').click();
    await page.waitForFunction(() => document.querySelector('.lyric-star[data-track-id="netease:2"]').getAttribute('aria-pressed') === 'true');
    await page.locator('#offset-more').click();
    await page.waitForFunction(() => document.querySelector('#offset-value').textContent === '+0.5s');
    await page.screenshot({ path: path.join(root, 'artifacts/lyrics-star-compact.png') });
    await app.close(); app = null;
    ({ app, page } = await launch());
    await app.evaluate(() => {
      const m = globalThis.__banciTest.model;
      m.providers = { search: async () => { throw new Error('Offline test: search must not run'); } };
      m.library = {};
      m.updateMedia({ key: 'BV1xx411c7mD:1', title: 'MyGO!!!!! 影色舞', url: 'https://www.bilibili.com/video/BV1xx411c7mD/', time: 12, duration: 40, paused: true });
    });
    await page.locator('[data-page="listen"]').click();
    await page.waitForFunction(() => document.querySelector('#favorite-current-lyrics').getAttribute('aria-pressed') === 'true');
    const saved = await app.evaluate(() => { const m = globalThis.__banciTest.model; return { id: m.track.id, offset: m.offset, translation: m.translations[0].text, status: m.status }; });
    assert.equal(saved.id, 'netease:2'); assert.equal(saved.offset, .5); assert.equal(saved.translation, 'Saved translation'); assert.match(saved.status, /已调用收藏歌词/);
    await page.locator('#favorite-current-lyrics').click();
    await page.waitForFunction(() => document.querySelector('#favorite-current-lyrics').getAttribute('aria-pressed') === 'false');
    console.log('PASS: compact UI, circular cover, candidate/current star buttons, actual app restart restores pinned bilingual lyrics and offset offline, unstar. Independent test profile.');
  } finally { if (app) await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
