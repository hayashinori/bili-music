const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..'), profile = path.join(root, 'artifacts', `theme-${Date.now()}`);
async function launch() {
  const env = { ...process.env, BANCI_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env });
  let page = (await app.windows()).find(p => /index\.html/.test(p.url()));
  if (!page) page = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
  await page.waitForSelector('#theme-color', { state: 'attached' });
  return { app, page };
}
(async () => {
  let { app, page } = await launch();
  try {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    assert.equal((await page.locator('.brand').textContent()).trim(), 'Bili音乐');
    await page.locator('[data-page="settings"]').click();
    await page.getByRole('button', { name: '鸢尾紫', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--theme') === '#7962d8');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.nav.active')).backgroundColor === 'rgb(121, 98, 216)' && getComputedStyle(document.querySelector('.main-play')).backgroundColor === 'rgb(121, 98, 216)');
    assert.equal(await page.locator('.nav.active').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.nav.active').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(121, 98, 216)');
    assert.equal(await page.locator('.main-play').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(121, 98, 216)');
    assert.equal(await page.locator('#seek').evaluate(el => getComputedStyle(el).accentColor), 'rgb(121, 98, 216)');
    for (const item of await page.locator('.sidebar .nav').all()) assert.ok((await item.boundingBox()).height <= 38);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/theme-purple.png') });
    await page.locator('#theme-color').fill('#208b77'); await page.locator('#theme-color').dispatchEvent('change');
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--theme') === '#208b77');
    await app.close(); app = null;
    ({ app, page } = await launch());
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--theme') === '#208b77');
    await page.locator('[data-page="settings"]').click();
    assert.equal(await page.locator('#theme-color').inputValue(), '#208b77');
    await page.locator('#theme-reset').click();
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--theme') === '#f43f55');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.nav.active')).color === 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.brand-icon').count(), 0);
    for (const selector of ['.main-play svg', '.theme-preview-play svg']) {
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
    }
    assert.equal(await page.locator('#choose-video').count(), 0);
    await page.locator('.nav.active').hover();
    assert.equal(await page.locator('.nav.active svg').evaluate(el => getComputedStyle(el).stroke), 'rgb(255, 255, 255)');
    await page.screenshot({ path: path.join(root, 'artifacts/brand-white-selection.png') });
    for (const name of ['listen', 'browse', 'library', 'favorites', 'settings']) {
      await page.locator(`[data-page="${name}"]`).click();
      assert.equal(await page.locator('.nav[aria-current="page"]').getAttribute('data-page'), name);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('[data-page="listen"]').click();
    await page.locator('#global-query').fill('空の箱');
    await page.locator('#global-query').focus();
    assert.equal(await page.locator('.global-search').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(await page.locator('#global-query').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await page.locator('#page-listen .page-heading .eyebrow').count(), 0);
    await page.screenshot({ path: path.join(root, 'artifacts/search-focus.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: compact functional sidebar, preset/custom global accents and controls, actual restart persistence, default reset, navigation aria-current. Isolated profile.');
  } finally { if (app) await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
