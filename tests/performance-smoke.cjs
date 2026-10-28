const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname,'..');
(async()=>{
  const profile=path.join(root,'artifacts',`performance-${Date.now()}`); fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(profile,'player.json'),JSON.stringify({settings:{autoSearch:false},queue:{items:Array.from({length:200},(_,i)=>({url:'https://www.bilibili.com/video/BV'+String(i).padStart(10,'0')+'/',title:'测试歌曲 '+i}))}}));
  const env={...process.env,BANCI_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:process.env.BANCI_EXECUTABLE||require('electron'),args:process.env.BANCI_EXECUTABLE?['--test-mode']:[root,'--test-mode'],env});
  try{
    let main=(await app.windows()).find(p=>/index\.html/.test(p.url()));if(!main)main=await app.waitForEvent('window',{predicate:p=>/index\.html/.test(p.url())});main.setDefaultTimeout(10000);
    await main.waitForSelector('#song-name');assert.equal(await main.locator('.brand-icon').count(),0);assert.equal((await main.locator('.brand').textContent()).trim(),'Bili音乐');
    await main.waitForFunction(()=>document.querySelector('#queue-count').textContent.includes('200'));
    assert.equal(await main.locator('.queue-row').count(),0,'Hidden saved queue must not build 200 rows during startup');
    const views=await main.evaluate(async()=>{
      const original=call;let count=0;call=(...args)=>{if(args[0]==='view')count++;return original(...args)};
      for(let i=0;i<100;i++)layout();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);call=original;return count;
    });assert.ok(views<=1,'Repeated unchanged layout calls must coalesce/deduplicate');
    await main.locator('[data-page="queue"]').click();await main.waitForFunction(()=>document.querySelectorAll('.queue-row').length===200);
    await app.evaluate(()=>{const m=globalThis.__banciTest.model;m.media={...m.media,key:'/video/BV0000000000/',url:'https://www.bilibili.com/video/BV0000000000/',title:'测试曲目',time:0,duration:100,paused:true};m.import('[00:00]第一句\n[00:10]第二句');});
    await main.locator('[data-page="settings"]').click();
    await main.evaluate(()=>{window.__lyricMutations=0;window.__observer=new MutationObserver(records=>window.__lyricMutations+=records.length);window.__observer.observe(document.querySelector('#lyrics-lines'),{subtree:true,attributes:true,childList:true,characterData:true})});
    await app.evaluate(()=>{const m=globalThis.__banciTest.model;for(let i=1;i<=20;i++)m.updateMedia({...m.media,time:i})});
    await main.evaluate(()=>new Promise(resolve=>setTimeout(resolve,80)));
    assert.equal(await main.evaluate(()=>window.__lyricMutations),0,'Hidden lyric DOM must remain unchanged during clock updates');
    await main.evaluate(()=>window.__observer.disconnect());
    await main.locator('[data-page="listen"]').click();await main.waitForFunction(()=>document.querySelector('.lyric-row.current')?.textContent.includes('第二句'));
    await app.evaluate(()=>{const m=globalThis.__banciTest.model;m.updateMedia({...m.media,paused:false})});
    await main.locator('#immersive-toggle').click();await app.evaluate(()=>globalThis.__banciTest.main.minimize());
    await main.waitForFunction(()=>document.body.classList.contains('motion-suspended'),null,{polling:100});
    assert.equal(await main.locator('.immersive-record').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    await app.evaluate(()=>{globalThis.__banciTest.model.configure({mainSecondaryFontSize:17});globalThis.__banciTest.main.restore()});
    await main.waitForFunction(()=>!document.body.classList.contains('motion-suspended')&&document.documentElement.style.getPropertyValue('--main-translation-size')==='17px');
    console.log(`PASS: text-only brand; 200 saved rows deferred until open; 100 static layout requests -> ${views} IPC; 20 background clocks -> 0 lyric mutations; restore refreshes lyrics/settings; minimized record pauses.`);
  }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
