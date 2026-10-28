const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'..'), profile = path.join(root,'artifacts',`queue-dark-${Date.now()}`);
const ids = ['BV1xx411c7mD','BV2xx411c7mD','BV3xx411c7mD'];
async function launch() {
  const env = { ...process.env, BANCI_TEST_PROFILE:profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath:process.env.BANCI_EXECUTABLE || require('electron'), args:process.env.BANCI_EXECUTABLE ? ['--test-mode'] : [root,'--test-mode'], env });
  let main=(await app.windows()).find(p=>/index\.html/.test(p.url())); if(!main)main=await app.waitForEvent('window',{predicate:p=>/index\.html/.test(p.url())});
  main.setDefaultTimeout(10000); await main.waitForSelector('#queue-open'); return {app,main};
}
(async()=>{
  let {app,main}=await launch();
  try {
    const errors=[]; main.on('pageerror',e=>errors.push(e.message));
    await main.locator('#dark-toggle').click(); await main.waitForFunction(()=>document.body.classList.contains('dark-mode'));
    await main.locator('[data-page="settings"]').click(); assert.equal(await main.locator('#appearance').inputValue(),'dark');
    assert.equal(await main.locator('.settings-section').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(34, 37, 46)');
    await main.locator('#appearance').selectOption('system'); await main.emulateMedia({colorScheme:'light'}); await main.waitForFunction(()=>!document.body.classList.contains('dark-mode'));
    await main.emulateMedia({colorScheme:'dark'}); await main.waitForFunction(()=>document.body.classList.contains('dark-mode'));
    await main.locator('#appearance').selectOption('dark');
    await main.locator('[data-page="queue"]').click();
    for(const id of ids){await main.locator('#queue-input').fill(id);await main.locator('#queue-add-form button').click();}
    await main.waitForFunction(()=>document.querySelectorAll('.queue-row').length===3);
    const first=main.locator('.queue-row').first(), rect=await first.locator('.queue-grip').boundingBox(), last=await main.locator('.queue-row').last().boundingBox();
    await main.mouse.move(rect.x+8,rect.y+8);await main.mouse.down();
    await main.waitForSelector('.queue-row.dragging');
    await main.mouse.move(last.x+100,last.y+last.height-4,{steps:8});await main.mouse.up();
    await main.waitForFunction(id=>document.querySelector('.queue-row:last-child')?.dataset.id.includes(id),ids[0]);
    const reordered=await app.evaluate(()=>globalThis.__banciTest.model.queue.items.map(t=>t.id)); assert.ok(reordered[2].includes(ids[0]));
    await main.screenshot({path:path.join(root,'artifacts/dark-song-list.png')});
    // Restore a known order through the validated IPC command for playback checks.
    await main.evaluate(ids=>window.banci.call('queue-reorder',ids.map(id=>`https://www.bilibili.com/video/${id}/`)),ids);
    const wav=Buffer.alloc(44+8000*30*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
    await app.evaluate(({session},audio)=>{
      session.fromPartition('persist:bilibili').protocol.handle('https',request=>new Response(`<!doctype html><meta charset="utf-8"><h1 title="歌曲 ${new URL(request.url).pathname}">歌曲</h1><div class="bpx-player-container"><video muted src="data:audio/wav;base64,${audio}"></video></div><script>document.querySelector('video').onloadedmetadata=()=>document.querySelector('video').pause()</script>`,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
      globalThis.__banciTest.model.configure({autoSearch:false});
    },wav.toString('base64'));
    await main.locator('#queue-play-all').click();
    async function playing(id){await main.waitForFunction(async id=>{const s=(await window.banci.call('state')).state;return s.media.key.includes(id)&&!s.media.paused&&s.media.time>0},id);}
    async function end(){await app.evaluate(async()=>globalThis.__banciTest.guest.webContents.executeJavaScript("(()=>{const v=document.querySelector('video');v.currentTime=v.duration-.08;return v.play()})()"));}
    await playing(ids[0]); await main.locator('#queue-next').click(); await playing(ids[1]); await main.locator('#queue-prev').click();await playing(ids[0]);
    await end();await playing(ids[1]);
    await main.evaluate(id=>window.banci.call('queue-play',`https://www.bilibili.com/video/${id}/`),ids[2]);await playing(ids[2]);await end();
    await main.waitForFunction(async()=>{const s=(await window.banci.call('state')).state;return s.media.paused&&s.media.time>29});
    assert.ok((await app.evaluate(()=>globalThis.__banciTest.model.media.key)).includes(ids[2]));
    await main.evaluate(()=>window.banci.call('queue-mode','list'));await end();await playing(ids[0]);
    await main.evaluate(()=>window.banci.call('queue-mode','one'));const guestId=await app.evaluate(()=>globalThis.__banciTest.guest.webContents.id);await end();
    await main.waitForFunction(async()=>{const s=(await window.banci.call('state')).state;return !s.media.paused&&s.media.time<2});
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.guest.webContents.id),guestId);
    // One-song repeat still permits the user's explicit next-song action.
    await main.locator('#queue-next').click();await playing(ids[1]);
    await main.locator('#queue-add-current').click();
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.model.queue.items.length),3,'Adding the current song twice must not duplicate it');
    await main.locator('[data-page="library"]').click();
    await main.locator('.card-queue-add').first().waitFor({state:'visible'});
    await main.locator('.card-queue-add').first().click();
    assert.equal(await app.evaluate(()=>globalThis.__banciTest.model.queue.items.length),3);
    await main.locator('[data-page="queue"]').click();
    await main.locator('.queue-grip').first().press('ArrowDown');
    await main.waitForFunction(id=>document.querySelector('.queue-row:first-child')?.dataset.id.includes(id),ids[1]);
    await app.close();app=null;({app,main}=await launch());
    await main.waitForFunction(()=>document.body.classList.contains('dark-mode'));
    const saved=await app.evaluate(()=>globalThis.__banciTest.model.queue.snapshot());assert.equal(saved.items.length,3);assert.equal(saved.mode,'one');assert.ok(saved.items[0].id.includes(ids[1]));
    assert.deepEqual(errors,[]);console.log('PASS: dark/system appearance and persistence, real long-press reorder, saved queue, next/previous, actual ended auto-next, order stop, list wrap, single repeat, manual next in repeat mode.');
  } finally {if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
