const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, BANCI_TEST_PROFILE: path.join(root, 'artifacts', 'features-' + Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.BANCI_EXECUTABLE || require('electron'), args: process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root, '--test-mode'], env, timeout: 30000 });
  try {
    let main = (await app.windows()).find(p => /index\.html/.test(p.url()));
    if (!main) main = await app.waitForEvent('window', { predicate: p => /index\.html/.test(p.url()) });
    main.setDefaultTimeout(12000); await main.waitForSelector('#profile-refresh');
    const errors = []; main.on('pageerror', e => errors.push(e.message));
    const wav = Buffer.alloc(44 + 8000 * 40 * 2);
    wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
    await app.evaluate(({ session }, audio) => {
      globalThis.fixtureRequests = [];
      session.fromPartition('persist:bilibili').protocol.handle('https', request => {
        const u = new URL(request.url); globalThis.fixtureRequests.push({ path: u.pathname, method: request.method });
        if (u.hostname === 'api.bilibili.com') {
          const data = u.pathname.endsWith('/nav') ? { isLogin: true, mid: 42, uname: '音乐测试用户', face: 'https://i0.hdslb.com/avatar.png' }
            : u.pathname.includes('list-all') ? { list: [{ id: 123, title: '音乐收藏', media_count: 21 }, { id: 124, title: '现场', media_count: 0 }] }
            : { has_more: Number(u.searchParams.get('pn')) === 1, medias: Array.from({ length: Number(u.searchParams.get('pn')) === 1 ? 20 : 1 }, (_, i) => ({ id: i, title: '收藏演示视频 ' + (i + 1), type: 2, bvid: 'BV1xx411c7mD', duration: 40, upper: { name: '演示UP' }, attr: 0 })) };
          return new Response(JSON.stringify({ code: 0, data }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (u.hostname.endsWith('hdslb.com')) return new Response(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/png' } });
        const html = `<!doctype html><meta charset="utf-8"><h1 title="演示歌手《测试歌曲》">测试歌曲</h1><div class="bpx-player-container"><video muted preload="auto" src="data:audio/wav;base64,${audio}"></video><button class="bpx-player-ctrl-flac" onclick="this.classList.toggle('bpx-state-active')">Hi-Res</button></div><script>const v=document.querySelector('video');v.onloadedmetadata=()=>{v.currentTime=5;v.pause()};</script>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      });
      globalThis.__banciTest.model.providers = { search: async () => ({ tracks: [{ id: 'test', trackName: '测试歌曲', artistName: '演示歌手', duration: 40, source: '测试来源', syncedLyrics: '[00:00]平滑的歌词高亮\n[00:20]下一句', translatedLyrics: '[00:00]Independent translation size' }] }) };
      session.fromPartition('persist:bilibili').cookies.set({ url:'https://www.bilibili.com',name:'SESSDATA',value:'isolated-test-only',domain:'.bilibili.com',secure:true });
    }, wav.toString('base64'));
    await main.locator('#profile-refresh').click();
    await main.waitForFunction(() => document.querySelector('#login-text').textContent === '音乐测试用户');
    assert.match(await main.locator('#profile-avatar').getAttribute('src'), /avatar\.png/);
    await main.locator('[data-page="favorites"]').click();
    await main.waitForFunction(() => document.querySelectorAll('#favorite-list .history-card').length === 20);
    assert.equal(await main.locator('#favorite-folder option').count(), 2);
    await main.locator('#favorite-more').click();
    await main.waitForFunction(() => document.querySelectorAll('#favorite-list .history-card').length === 21);
    assert.equal(await main.locator('#favorite-more').isVisible(),false);
    await main.locator('main').evaluate(el => {el.scrollTop=0;});
    fs.mkdirSync(path.join(root,'artifacts'), {recursive:true});
    await main.screenshot({path:path.join(root,'artifacts/favorites.png')});
    await main.locator('#favorite-list .history-play').first().click();
    await main.waitForFunction(() => document.querySelector('#song-name').textContent === '测试歌曲');
    await main.waitForFunction(() => document.querySelector('#page-listen').classList.contains('active'));
    await main.evaluate(() => window.banci.call('media',{ action:'play' }));
    // Seed distinct local recent entries; no account/cloud deletion is involved.
    await app.evaluate(() => { const m=globalThis.__banciTest.model; m.history=[1,2,3].map(n=>({title:'最近播放 '+n,url:'https://www.bilibili.com/video/BV'+n+'xx411c7mD/'}));m.publish(); });
    await main.locator('[data-page="library"]').click();
    await main.locator('#history-list').waitFor(); await main.locator('#history-list').locator('.history-remove').first().click();
    await main.waitForFunction(() => document.querySelectorAll('#history-list .history-card').length === 2);
    await main.locator('#toast button').click(); await main.waitForFunction(() => document.querySelectorAll('#history-list .history-card').length === 3);
    await main.locator('#history-clear').click(); await main.waitForFunction(() => document.querySelectorAll('#history-list .history-card').length === 0);
    await main.locator('#toast button').click(); await main.waitForFunction(() => document.querySelectorAll('#history-list .history-card').length === 3);
    await main.locator('#history-layout-list').click();
    await main.waitForFunction(() => document.querySelector('#history-list').classList.contains('list-view'));
    await main.screenshot({path:path.join(root,'artifacts/recent-list.png')});
    await main.locator('[data-page="settings"]').click();
    for (const [id,value] of [['secondary-size',28],['main-secondary-size',18]]) await main.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
    await main.evaluate(() => window.banci.call('floating',true));
    const floating=(await app.windows()).find(p=>/floating\.html/.test(p.url()));
    await floating.waitForFunction(()=>getComputedStyle(document.querySelector('#secondary')).fontSize==='28px');
    await main.locator('[data-page="listen"]').click();
    assert.equal(await main.locator('.lyric-row .translation').first().evaluate(el=>getComputedStyle(el).fontSize),'18px');
    await main.locator('#quality-refresh').click(); await main.waitForFunction(()=>document.querySelector('#audio-quality option[value="hires"]'));
    await main.locator('#audio-quality').selectOption('hires');
    await main.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已确认音轨切换'));
    await main.locator('#audio-only').click();
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.guest.getVisible()),false);
    await main.evaluate(()=>window.banci.call('view',{mode:'listen',rect:{x:0,y:0,width:0,height:0}}));
    await main.locator('#audio-only').click(); await new Promise(r=>setTimeout(r,150));
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.guest.getVisible()),true);
    await main.locator('#audio-only').click();
    await app.evaluate(async()=>{const t=globalThis.__banciTest;await t.guest.webContents.executeJavaScript("document.querySelector('video').pause()");});
    await new Promise(r=>setTimeout(r,500));
    await app.evaluate(()=>{const m=globalThis.__banciTest.model;m.updateMedia({...m.media,time:5,paused:false,rate:1});});
    const samples=[];
    for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,40));samples.push(await floating.evaluate(()=>document.documentElement.style.getPropertyValue('--progress')));}
    assert.ok(new Set(samples).size>=4,'Highlight should animate between incoming clock messages');
    await main.locator('#close-video').click();
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.guest),null);
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.model.media.key),'');
    assert.equal(await app.evaluate(()=>globalThis.fixtureRequests.filter(r=>r.path.includes('/fav/')&&r.method!=='GET').length),0);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: profile/avatar, paginated favorites and direct playback, local history delete/clear/undo/list layout, independent translation sizes, official audio option confirmation, hidden video view, interpolated highlight and video destruction.');
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
