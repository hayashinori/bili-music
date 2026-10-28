// Opt-in public video check. Short samples are diagnostics, not a general benchmark.
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, BANCI_TEST_PROFILE: path.join(root,'artifacts','performance-'+Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:require('electron'),args:[root,'--test-mode'],env});
  try {
    let main=(await app.windows()).find(p=>/index\.html/.test(p.url()));
    if(!main)main=await app.waitForEvent('window',{predicate:p=>/index\.html/.test(p.url())});
    await main.waitForSelector('#song-name');
    await app.evaluate(async()=>{const t=globalThis.__banciTest;t.ensureGuest();t.guest.webContents.setAudioMuted(true);await t.guest.webContents.loadURL('https://www.bilibili.com/video/BV1gP411u7kS/');});
    await main.waitForFunction(async()=>{const r=await window.banci.call('state');return r.state.media.key&&r.state.media.duration>0;},null,{timeout:20000});
    async function sample(label,delay) {
      await new Promise(r=>setTimeout(r,delay));
      return app.evaluate(({app,webContents},label)=>{
        const metrics=app.getAppMetrics(),t=globalThis.__banciTest;
        return {label,cpu:Math.round(metrics.reduce((n,m)=>n+(m.cpu.percentCPUUsage||0),0)*10)/10,
          workingSetMB:Math.round(metrics.reduce((n,m)=>n+m.memory.workingSetSize,0)/1024),
          contents:webContents.getAllWebContents().length,guestPresent:!!t.guest,guestVisible:t.guest?.getVisible()||false,
          timedLyrics:t.model.rows.length,time:t.model.media.time};
      },label);
    }
    await sample('warmup',2500);
    console.log(JSON.stringify(await sample('video-visible-muted',3500)));
    await main.evaluate(()=>window.banci.call('settings',{audioOnly:true}));
    console.log(JSON.stringify(await sample('audio-only-view-hidden-muted',3500)));
    await main.evaluate(()=>window.banci.call('close-video'));
    console.log(JSON.stringify(await sample('video-closed',2000)));
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
