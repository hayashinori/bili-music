const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session, screen, globalShortcut, Menu, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PlayerModel } = require('./model.cjs');
const { allowedBilibili, resolveInput } = require('./navigation.cjs');
const { homeBounds, clampBounds, sizedBounds } = require('./floating-bounds.cjs');
const { BiliAccount } = require('./account.cjs');
const { readAudioState, clickAudioOption } = require('./player-audio.cjs');
const { videoURL } = require('./song-queue.cjs');
const providers = require('./shared/providers');
const testMode = process.argv.includes('--test-mode');
if (testMode) app.setPath('userData', process.env.BANCI_TEST_PROFILE || path.join(__dirname, 'test-profile'));
app.setName('伴词桌面');
let main, floating, guest, model, saveTimer, storePath, quitting = false, mode = 'listen';
let floatingReady = false, floatingBackgroundMode = true, floatingCrashCount = 0, floatingLocked = null;
let browserState = { url: '', loading: false, loggedIn: false, error: '', profile: null };
let pendingPlayURL = '', handledEnd = '';
let biliSession, account, loginTimer, guestBoundsSignature = '', qualityKey = '', loginPending;
let viewRect = { x: 0, y: 0, width: 0, height: 0 }, compact = false, compactSignature = '';
const mainURL = pathToFileURL(path.join(__dirname, 'renderer/index.html')).href;
const floatURL = pathToFileURL(path.join(__dirname, 'renderer/floating.html')).href;
function writeStore(data) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(storePath), { recursive: true }); fs.writeFileSync(storePath + '.tmp', JSON.stringify(data)); fs.renameSync(storePath + '.tmp', storePath); }
    catch { if (main && !main.isDestroyed()) main.webContents.send('browser:state', { ...browserState, error: '无法保存设置，请检查应用数据目录权限' }); }
  }, 350);
}
function notifyBrowser(update = {}) {
  browserState = { ...browserState, ...update };
  if (main && !main.isDestroyed()) main.webContents.send('browser:state', browserState);
}
async function refreshLogin(force = false) {
  ensureSession();
  if (loginPending) { await loginPending; return force ? refreshLogin(true) : undefined; }
  if (!force) {
    const cookies = await biliSession.cookies.get({ url: 'https://www.bilibili.com', name: 'SESSDATA' });
    if (!cookies.length) { notifyBrowser({ loggedIn: false, profile: { loggedIn: false, name: '', avatar: '', mid: 0 } }); return; }
  } else account.invalidate();
  loginPending = (async () => {
  try {
    ensureSession(); const profile = await account.getProfile();
    notifyBrowser({ loggedIn: profile.loggedIn, profile, profileError: '' });
  } catch (e) { notifyBrowser({ profileError: '账号信息读取失败，可点击刷新重试：' + e.message }); }
  })();
  try { await loginPending; } finally { loginPending = null; }
}
function ensureSession() {
  if (biliSession) return biliSession;
  biliSession = session.fromPartition('persist:bilibili');
  account = new BiliAccount((url, options) => biliSession.fetch(url, options));
  biliSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  biliSession.setPermissionCheckHandler(() => false);
  biliSession.cookies.on('changed', (_event, cookie) => {
    if (!['SESSDATA', 'DedeUserID'].includes(cookie.name)) return;
    account.invalidate(); clearTimeout(loginTimer); loginTimer = setTimeout(() => refreshLogin(true), 800);
  });
  return biliSession;
}
function updateGuestBounds() {
  if (!guest || !main || main.isDestroyed()) return;
  const [w, h] = main.getContentSize();
  const rect = viewRect;
  const visible = !main.isMinimized() && ['browse', 'listen'].includes(mode) && rect.width > 20 && rect.height > 20 && !!guest.webContents.getURL() && (mode === 'browse' || !!model.media.key && !model.settings.audioOnly);
  const signature = JSON.stringify([visible, rect, w, h]); if (signature === guestBoundsSignature) return; guestBoundsSignature = signature;
  guest.setVisible(visible);
  if (visible) guest.setBounds({ x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(Math.min(rect.width, w - rect.x))), height: Math.max(1, Math.round(Math.min(rect.height, h - rect.y))) });
}
async function applyCompact(force = false) {
  if (!guest || guest.webContents.isDestroyed()) return;
  const enabled = mode === 'listen';
  const signature = JSON.stringify([enabled, model.settings.lowResource, model.settings.audioOnly, mode === 'browse']);
  if (!force && compactSignature === signature) return; compactSignature = signature;
  compact = enabled;
  try {
    guest.webContents.setBackgroundThrottling(model.settings.lowResource);
    await guest.webContents.executeJavaScript(`(() => {
      document.getElementById('banci-focus-style')?.remove();
      document.getElementById('banci-low-power')?.remove();
      if (${enabled}) {
        const s = document.createElement('style'); s.id = 'banci-focus-style';
        s.textContent = 'body{overflow:hidden!important;background:#151821!important}body>*{visibility:hidden!important}.bpx-player-container,.bpx-player-container *,#bilibili-player,#bilibili-player *{visibility:visible!important}.bpx-player-container,#bilibili-player{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483640!important;margin:0!important}.bpx-player-video-area{width:100%!important;height:100%!important}';
        document.head.append(s);
      }
      if (${model.settings.lowResource && mode !== 'browse'}) {
        const style=document.createElement('style'); style.id='banci-low-power';
        style.textContent='.bili-danmaku-x-dm,.bpx-player-dm-wrap{display:none!important}'; document.head.append(style);
      }
      if (${model.settings.audioOnly && mode !== 'browse'}) {
        const e=document.getElementById('banci-low-power') || document.createElement('style'); e.id='banci-low-power';
        e.textContent+='video{display:none!important}'; if(!e.parentNode) document.head.append(e);
      }
    })()`);
  } catch { /* Retried when navigation finishes. */ }
}
function ensureGuest() {
  if (guest) return guest;
  ensureSession(); guestBoundsSignature = ''; compactSignature = '';
  guest = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'guest-preload.cjs'), partition: 'persist:bilibili',
    sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: model.settings.lowResource } });
  main.contentView.addChildView(guest); guest.setVisible(false);
  const wc = guest.webContents;
  wc.setWindowOpenHandler(({ url }) => { if (allowedBilibili(url)) navigate(url); return { action: 'deny' }; });
  wc.on('will-navigate', (event, url) => {
    const target = typeof url === 'string' ? url : event.url;
    if (!allowedBilibili(target)) { event.preventDefault(); notifyBrowser({ error: '此链接不属于 B 站，请在浏览器中访问其他网站' }); }
    else { model.reset(); notifyBrowser({ url: target, loading: true, error: '' }); }
  });
  wc.on('did-start-loading', () => { if (!wc.isDestroyed() && guest?.webContents === wc) notifyBrowser({ loading: true, error: '' }); });
  wc.on('did-stop-loading', () => { if (wc.isDestroyed() || guest?.webContents !== wc) return; notifyBrowser({ loading: false, url: wc.getURL() }); updateGuestBounds(); refreshLogin(); refreshAudio(); });
  wc.on('dom-ready', () => applyCompact(true));
  wc.on('did-navigate-in-page', () => notifyBrowser({ url: wc.getURL() }));
  wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (code === -3 || isMainFrame === false) return;
    notifyBrowser({ loading: false, error: `B站页面未能打开：${description}。可点击刷新重试。` });
  });
  refreshLogin(); return guest;
}
async function closeVideo() {
  pendingPlayURL = ''; handledEnd = '';
  const old = guest; guest = null; guestBoundsSignature = ''; qualityKey = ''; compact = false; compactSignature = '';
  if (old && !old.webContents.isDestroyed()) old.webContents.close();
  model.reset('视频已关闭，播放已停止'); model.media.url = '';
  mode = 'listen'; notifyBrowser({ url: '', loading: false, error: '', audio: null });
  main.webContents.send('browser:state', { ...browserState, mode });
}
async function refreshAudio() {
  const wc = guest?.webContents; if (!wc || wc.isDestroyed()) return null;
  try { const audio = await wc.executeJavaScript(`(${readAudioState.toString()})()`); if (guest?.webContents === wc) notifyBrowser({ audio }); return audio; } catch { return null; }
}
async function selectAudio(id) {
  if (!['standard', 'hires', 'dolby'].includes(id) || !guest) throw new Error('不支持的音质选项');
  const wc = guest.webContents, state = await refreshAudio();
  if (!state?.options.some(o => o.id === id && o.available)) throw new Error('当前视频或账号未提供此音轨');
  const clicked = await wc.executeJavaScript(`(${clickAudioOption.toString()})(${JSON.stringify(id)})`, true);
  if (!clicked) throw new Error('音质控件暂不可用');
  await new Promise(resolve => setTimeout(resolve, 600));
  const updated = await refreshAudio();
  if (updated?.current !== id) throw new Error('未确认音质切换，请在 B 站播放器检查视频与账号权限');
  return updated;
}
async function navigate(input, targetMode = 'browse', autoplay = false) {
  const url = resolveInput(input);
  pendingPlayURL = autoplay ? videoURL(url) : ''; handledEnd = '';
  ensureGuest(); model.reset(); mode = targetMode;
  notifyBrowser({ url, loading: true, error: '' });
  main.webContents.send('browser:state', { ...browserState, mode });
  updateGuestBounds();
  try { await guest.webContents.loadURL(url); }
  catch (e) { if (!e.message.includes('ERR_ABORTED')) notifyBrowser({ loading: false, error: '无法打开 B 站页面，请检查网络后刷新' }); }
}
async function mediaControl(action, value) {
  if (!guest || guest.webContents.isDestroyed()) throw new Error('先打开一个 B 站视频');
  if (!['play', 'resume', 'restart', 'seek', 'volume', 'rate', 'back10', 'forward10'].includes(action)) throw new Error('不支持的播放操作');
  if (['seek', 'volume', 'rate'].includes(action) && !Number.isFinite(value)) throw new Error('无效的播放参数');
  const v = action === 'volume' ? Math.max(0, Math.min(1, value)) : action === 'rate' ? Math.max(.5, Math.min(3, value)) : Math.max(0, value || 0);
  const ok = await guest.webContents.executeJavaScript(`(async () => {
    const v = [...document.querySelectorAll('video')].find(x => x.duration > 0) || document.querySelector('video'); if (!v) return false;
    const a=${JSON.stringify(action)}, n=${JSON.stringify(v)};
    if(a==='play'){if(v.paused) await v.play();else v.pause();}
    if(a==='resume')await v.play();if(a==='restart'){v.currentTime=0;await v.play();}
    if(a==='seek')v.currentTime=Math.min(v.duration||n,n);
    if(a==='back10')v.currentTime=Math.max(0,v.currentTime-10);
    if(a==='forward10')v.currentTime=Math.min(v.duration||Infinity,v.currentTime+10);
    if(a==='volume')v.volume=n;if(a==='rate')v.playbackRate=n;return true;
  })()`, true);
  if (!ok) throw new Error('当前页面还没有可播放的视频');
}
async function playQueue(id) {
  const item = model.queue.select(id); await navigate(item.url, 'listen', true);
}
async function advanceQueue(direction = 1, automatic = false) {
  const next = model.queue.next(pendingPlayURL || model.media.url, direction, automatic);
  if (next?.repeat) { await mediaControl('restart'); return; }
  if (next) { await playQueue(next.id); return; }
  if (!automatic) throw new Error('请先添加歌曲到列表');
  if (model.queue.items.length) { model.status = '歌曲列表已播放完'; model.publish(); }
}
function floatingState(state = model.snapshot()) {
  return { ...model.clock(), settings: state.settings };
}
function floatingArea() {
  try { return screen.getDisplayMatching(main.getNormalBounds()).workArea; }
  catch { return screen.getPrimaryDisplay().workArea; }
}
function destroyFloating() {
  const old = floating; floating = null; floatingReady = false; floatingLocked = null;
  if (old && !old.isDestroyed()) old.destroy();
}
function createFloating(bounds) {
  if (floating && !floating.isDestroyed()) return;
  floatingReady = false; floatingLocked = null; floatingBackgroundMode = model.settings.floatingBackground;
  const win = new BrowserWindow({ ...(bounds || homeBounds(floatingArea(), { width: model.settings.floatingWidth, height: model.settings.floatingHeight })),
    frame: false, transparent: !floatingBackgroundMode, backgroundColor: floatingBackgroundMode ? '#202632' : '#00000000',
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    // Electron explicitly warns against resizing transparent windows on Windows.
    resizable: false, maximizable: false, fullscreenable: false, minimizable: false,
    title: '伴词悬浮歌词', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  floating = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.on('did-finish-load', () => {
    if (floating !== win || win.isDestroyed()) return;
    floatingReady = true; win.webContents.send('app:state', floatingState()); syncFloating();
  });
  win.webContents.on('render-process-gone', () => {
    if (floating !== win || quitting) return;
    floatingReady = false;
    if (model.settings.floating && floatingCrashCount++ < 2) setTimeout(() => { if (!quitting) recoverFloating(); }, 500);
  });
  win.webContents.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => {
    if (code === -3 || isMainFrame === false || floating !== win) return;
    model.status = '桌面歌词页面加载失败，请点击“找回桌面歌词”重建窗口'; model.publish();
  });
  win.on('close', e => { if (!quitting) { e.preventDefault(); model.configure({ floating: false }); syncFloating(); } });
  win.on('closed', () => { if (floating === win) { floating = null; floatingReady = false; } });
  win.loadFile(path.join(__dirname, 'renderer/floating.html')).catch(() => {});
}
function resizeFloating(value) {
  if (model.settings.locked) throw new Error('请先解锁桌面歌词，再调整尺寸');
  const current = floating && !floating.isDestroyed() ? floating.getBounds() : homeBounds(floatingArea());
  const area = screen.getDisplayMatching(current).workArea;
  const bounds = sizedBounds(current, area, value || {});
  model.configure({ floatingWidth: bounds.width, floatingHeight: bounds.height });
  // Recreate once on release rather than repeatedly resizing a transparent HWND.
  const win = floating;
  setTimeout(() => { if (!quitting && floating === win) { destroyFloating(); createFloating(bounds); } }, 0);
  return bounds;
}
function syncFloating() {
  if (!model.settings.floating) { if (floating && !floating.isDestroyed()) floating.hide(); return; }
  if (!floating || floating.isDestroyed() || floatingBackgroundMode !== model.settings.floatingBackground) {
    destroyFloating(); createFloating(); return;
  }
  if (!floatingReady) return;
  if (floating.isMinimized()) floating.restore();
  const area = screen.getDisplayMatching(floating.getBounds()).workArea;
  if (floating.getBounds().width > area.width - 16 || floating.getBounds().height > area.height - 16) {
    destroyFloating(); createFloating(); return;
  }
  const safe = clampBounds(floating.getBounds(), area);
  // Move only; changing a transparent window's size can blank its renderer.
  const current = floating.getBounds();
  if (current.x !== safe.x || current.y !== safe.y) floating.setPosition(safe.x, safe.y);
  if (!floating.isAlwaysOnTop()) floating.setAlwaysOnTop(true, 'screen-saver');
  floating.webContents.send('app:state', floatingState());
  if (!floating.isVisible()) floating.showInactive();
  floating.moveTop();
  if (floatingLocked !== model.settings.locked) {
    floating.setIgnoreMouseEvents(model.settings.locked, { forward: true }); floatingLocked = model.settings.locked;
  }
}
function recoverFloating() {
  model.configure({ floating: true, locked: false, floatingBackground: true });
  destroyFloating(); createFloating();
}
function authorized(event) {
  const url = event.senderFrame?.url;
  if (event.senderFrame !== event.sender.mainFrame) return false;
  if (main && event.sender === main.webContents && url === mainURL) return 'main';
  if (floating && event.sender === floating.webContents && url === floatURL) return 'floating';
  return false;
}
async function importFile(translation) {
  const result = await dialog.showOpenDialog(main, { title: translation ? '导入翻译字幕' : '导入歌词字幕', properties: ['openFile'], filters: [{ name: '歌词与字幕', extensions: ['lrc', 'srt', 'vtt', 'txt'] }] });
  if (result.canceled) return;
  const file = result.filePaths[0];
  if (fs.statSync(file).size > 1000000) throw new Error('文件超过 1 MB，请缩小字幕后重试');
  const bytes = fs.readFileSync(file); let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('gb18030').decode(bytes); }
  model.import(text, translation, path.basename(file));
}
ipcMain.on('guest:media', (event, data) => {
  if (!guest || event.sender !== guest.webContents || event.senderFrame !== guest.webContents.mainFrame || !allowedBilibili(event.senderFrame.url)) return;
  if (!data || typeof data.title !== 'string' || typeof data.key !== 'string' || !/^\/(video\/|bangumi\/play\/)/.test(data.key)) return;
  let cover = '';
  try { const u = new URL(data.cover); if (u.protocol === 'https:' && u.hostname.endsWith('.hdslb.com')) cover = u.href; } catch {}
  model.updateMedia({ title: data.title.slice(0, 300), key: data.key.slice(0, 300), url: allowedBilibili(data.url) ? data.url : guest.webContents.getURL(), cover,
    time: Math.max(0, Number(data.time) || 0), duration: Math.max(0, Number(data.duration) || 0), paused: !!data.paused,
    volume: Math.max(0, Math.min(1, Number(data.volume) || 0)), rate: Number(data.rate) || 1 });
  if (pendingPlayURL && model.media.duration > 0) {
    let current; try { current = videoURL(model.media.url); } catch {}
    if (current === pendingPlayURL) { pendingPlayURL = ''; mediaControl('resume').catch(e => notifyBrowser({ error: '自动播放失败，请点击播放：' + e.message })); }
  }
  const endKey = event.sender.id + ':' + data.key;
  if (!data.ended && model.media.time < model.media.duration - .5) handledEnd = '';
  if (!pendingPlayURL && data.ended === true && model.media.duration > 0 && model.media.time >= model.media.duration - .5 && handledEnd !== endKey) {
    handledEnd = endKey; advanceQueue(1, true).catch(e => notifyBrowser({ error: '切换歌曲失败：' + e.message }));
  }
  if (qualityKey !== model.media.key) { qualityKey = model.media.key; refreshAudio(); }
});
ipcMain.handle('app:command', async (event, method, value) => {
  try {
    const role = authorized(event);
    if (!role) throw new Error('无权调用此操作');
    if (role === 'floating' && !['state', 'floating', 'locked', 'show-main', 'font', 'floating-size'].includes(method)) throw new Error('不支持此操作');
    if (method === 'state') return { ok: true, state: role === 'floating' ? floatingState() : model.snapshot(), browser: browserState };
    else if (method === 'open') await navigate(value);
    else if (method === 'open-play') await navigate(value, 'listen', true);
    else if (method === 'queue-add') return { ok: true, added: model.queue.add(value || model.media) };
    else if (method === 'queue-remove') model.queue.remove(String(value));
    else if (method === 'queue-reorder') model.queue.reorder(value);
    else if (method === 'queue-mode') model.queue.setMode(String(value));
    else if (method === 'queue-play') await playQueue(String(value));
    else if (method === 'queue-next') await advanceQueue(1);
    else if (method === 'queue-prev') await advanceQueue(-1);
    else if (method === 'login') await navigate('https://passport.bilibili.com/login');
    else if (method === 'profile-refresh') { await refreshLogin(true); return { ok: true, profile: browserState.profile, error: browserState.profileError }; }
    else if (method === 'favorite-folders') { ensureSession(); return { ok: true, folders: await account.folders() }; }
    else if (method === 'favorite-videos') { ensureSession(); return { ok: true, result: await account.videos(value?.folder, value?.page) }; }
    else if (method === 'close-video') await closeVideo();
    else if (method === 'audio-quality') return { ok: true, audio: value ? await selectAudio(value) : await refreshAudio() };
    else if (method === 'history-remove') model.removeHistory(String(value));
    else if (method === 'history-clear') model.clearHistory();
    else if (method === 'history-undo') model.undoHistory();
    else if (method === 'view') {
      if (['listen', 'browse', 'library', 'settings', 'favorites', 'queue'].includes(value?.mode)) mode = value.mode;
      const rect = value?.rect;
      if (rect && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k]))) viewRect = rect;
      if (mode === 'browse') { ensureGuest(); if (!guest.webContents.getURL() && !browserState.loading) navigate('https://www.bilibili.com/'); }
      updateGuestBounds(); applyCompact();
    } else if (method === 'browser') {
      const wc = ensureGuest().webContents;
      if (value === 'reload') wc.reload();
      if (value === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      if (value === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    } else if (method === 'media') await mediaControl(value.action, value.value);
    else if (method === 'search') await model.search(String(value || ''));
    else if (method === 'source-search') await model.searchSource(String(value?.source || 'auto'), String(value?.query || ''), value?.refresh === true);
    else if (method === 'choose') await model.choose(value);
    else if (method === 'lyric-favorite') return { ok: true, favorite: await model.toggleLyricFavorite(value ?? undefined) };
    else if (method === 'offset') model.setOffset(Number(value));
    else if (method === 'align') model.align(Number(value));
    else if (method === 'seek-line') { if (model.rows[value]) await mediaControl('seek', model.rows[value].time + model.offset); }
    else if (method === 'settings') { model.configure(value || {}); syncFloating(); updateGuestBounds(); if ('lowResource' in (value || {}) || 'audioOnly' in (value || {})) applyCompact(); }
    else if (method === 'floating') { model.configure({ floating: typeof value === 'boolean' ? value : !model.settings.floating }); syncFloating(); }
    else if (method === 'recover-floating') recoverFloating();
    else if (method === 'floating-size') return { ok: true, bounds: resizeFloating(value) };
    else if (method === 'locked') { model.configure({ locked: !model.settings.locked }); syncFloating(); }
    else if (method === 'font') model.configure({ fontSize: model.settings.fontSize + (Number(value) > 0 ? 2 : -2) });
    else if (method === 'import') await importFile(!!value);
    else if (method === 'paste') model.import(String(value.text || ''), !!value.translation, '自定义字幕');
    else if (method === 'show-main') { main.show(); main.focus(); }
    else if (method === 'minimize') main.minimize();
    else if (method === 'maximize') { if (main.isMaximized()) main.unmaximize(); else main.maximize(); }
    else if (method === 'close') main.close();
    else throw new Error('未知操作');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
app.whenReady().then(() => {
  app.setAppUserModelId('com.banci.desktop'); Menu.setApplicationMenu(null);
  storePath = path.join(app.getPath('userData'), 'player.json');
  let saved = {}; try { saved = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch {}
  model = new PlayerModel(providers, saved, writeStore);
  const startDark = saved.settings?.appearance === 'dark' || saved.settings?.appearance === 'system' && nativeTheme.shouldUseDarkColors;
  main = new BrowserWindow({ width: 1280, height: 860, minWidth: 1040, minHeight: 720, frame: false, backgroundColor: startDark ? '#17191f' : '#f7f8fa',
    show: false, title: '伴词桌面', icon: path.join(__dirname, 'assets/app.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  main.loadFile(path.join(__dirname, 'renderer/index.html'));
  main.once('ready-to-show', () => { main.show(); main.webContents.send('app:state', model.snapshot()); });
  main.on('resize', updateGuestBounds);
  main.on('minimize', () => { updateGuestBounds(); main.webContents.send('app:activity', false); });
  main.on('hide', () => main.webContents.send('app:activity', false));
  main.on('show', () => main.webContents.send('app:activity', !main.isMinimized()));
  main.on('restore', () => { main.webContents.send('app:activity', true); main.webContents.send('app:state', model.snapshot()); updateGuestBounds(); });
  main.on('close', () => { quitting = true; if (guest && !guest.webContents.isDestroyed()) guest.webContents.close(); if (floating && !floating.isDestroyed()) floating.destroy(); });
  model.on('state', state => {
    if (!main.isDestroyed() && !main.isMinimized()) main.webContents.send('app:state', state);
    if (floatingReady && floating && !floating.isDestroyed() && model.settings.floating) floating.webContents.send('app:state', floatingState(state));
  });
  model.on('clock', clock => {
    if (!main.isDestroyed() && main.isVisible() && !main.isMinimized()) main.webContents.send('app:clock', clock);
    if (floatingReady && floating && !floating.isDestroyed() && model.settings.floating) floating.webContents.send('app:clock', clock);
  });
  createFloating();
  refreshLogin();
  globalShortcut.register('CommandOrControl+Alt+D', () => { model.configure({ floating: !model.settings.floating }); syncFloating(); });
  globalShortcut.register('CommandOrControl+Alt+L', () => { recoverFloating(); main.show(); main.focus(); });
  screen.on('display-removed', () => { if (model.settings.floating) recoverFloating(); });
  screen.on('display-metrics-changed', () => syncFloating());
  if (testMode) globalThis.__banciTest = { model, ensureGuest, main, get account() { return account; }, get floating() { return floating; }, get guest() { return guest; } };
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); model?.persist(); });
app.on('will-quit', () => { if (saveTimer && model) { clearTimeout(saveTimer); try { fs.mkdirSync(path.dirname(storePath), { recursive: true }); fs.writeFileSync(storePath, JSON.stringify(model.savedState())); } catch {} } });
