const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..'), env = { ...process.env, BANCI_TEST_PROFILE: path.join(root, 'artifacts', 'inspect-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--test-mode'], env });
  try {
    await app.evaluate(async () => { const t = globalThis.__banciTest; t.ensureGuest(); await t.guest.webContents.loadURL('https://www.bilibili.com/video/BV1gP411u7kS/'); });
    await new Promise(r => setTimeout(r, 4500));
    console.log(JSON.stringify(await app.evaluate(async () => globalThis.__banciTest.guest.webContents.executeJavaScript(`(() => {
      const result = {}; for (const s of ['.bpx-player-ctrl-flac','.bpx-player-ctrl-dolby','.bpx-player-ctrl-quality','.bpx-player-ctrl-setting']) { const e=document.querySelector(s); result[s]=e?{class:e.className,text:e.innerText,html:e.outerHTML.slice(0,2500)}:null; }
      result.playerMethods = window.player ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.player)).filter(x=>/audio|quality|video|media/i.test(x)) : [];
      return result;
    })()`))));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
