const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..');
(async () => {
  const env = {...process.env, BANCI_TEST_PROFILE:path.join(root,'artifacts',`readme-demo-${Date.now()}`)}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:require('electron'),args:[root,'--test-mode'],env});
  try {
    let page=(await app.windows()).find(p=>/index\.html/.test(p.url()));if(!page)page=await app.waitForEvent('window',{predicate:p=>/index\.html/.test(p.url())});page.setDefaultTimeout(10000);
    await page.waitForSelector('#immersive-toggle');
    await app.evaluate((_,cover)=>{
      const m=globalThis.__banciTest.model;m.configure({autoSearch:false,audioOnly:true});
      m.media={...m.media,key:'/video/BV0000000001/',url:'https://www.bilibili.com/video/BV0000000001/',title:'夜航',cover,time:21,duration:228,paused:true};
      m.import('[00:00]夜色漫过窗沿\n[00:08]城市渐渐安静\n[00:16]让旋律沿着长街轻轻回响\n[00:24]把此刻留在歌声里\n[00:32]远处的灯还亮着\n[00:40]我们慢慢向前走\n[00:48]直到风吹散云层\n[00:56]天光落在你身旁');
      m.import('[00:00]Night falls across the window\n[00:08]The city grows quiet\n[00:16]Let the melody drift along the street\n[00:24]Keep this moment in a song\n[00:32]The distant lights are still on\n[00:40]We take our time moving forward\n[00:48]Until the clouds clear away\n[00:56]Daylight settles by your side',true);
      m.track={id:'demo:1',title:'夜航',artist:'Bili音乐 · 示例音轨',source:'演示字幕'};m.status='已载入演示歌词';m.publish();
      for(const [i,title] of ['夜航','回声','雨停以后','沿途的光'].entries())m.queue.add({url:`https://www.bilibili.com/video/BV${String(i+1).padStart(10,'0')}/`,title});
      m.queue.select(m.queue.items[0].id);m.queue.setMode('list');
    },'data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'docs/assets/demo-cover.svg')).toString('base64'));
    await page.waitForFunction(()=>document.querySelector('#lyric-source').textContent==='演示字幕');
    await page.screenshot({path:path.join(root,'docs/assets/listening.png')});
    await page.locator('#immersive-toggle').click();
    await app.evaluate(()=>{const m=globalThis.__banciTest.model;m.updateMedia({...m.media,paused:false})});
    await page.waitForFunction(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.immersive-arm')).transform);return Math.abs(Math.atan2(m.b,m.a)*180/Math.PI-24)<.5});
    await page.screenshot({path:path.join(root,'docs/assets/immersive.jpg'),type:'jpeg',quality:88});
    await page.keyboard.press('Escape');await page.locator('#dark-toggle').click();await page.locator('[data-page="queue"]').click();
    await page.waitForFunction(()=>document.body.classList.contains('dark-mode')&&document.querySelectorAll('.queue-row').length===4);
    await page.screenshot({path:path.join(root,'docs/assets/playlist.png')});
    console.log('Generated 3 independent README previews. No real account or remote media used.');
  } finally {await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
