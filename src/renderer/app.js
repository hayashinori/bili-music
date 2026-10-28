const $ = id => document.getElementById(id);
let state, page = 'listen', lastIdentity = '', lastVideoView = '', rowsSignature = '', historySignature = '', candidateSignature = '', lastIndex = -99, toastTimer;
let layoutFrame = 0, layoutSignature = '';
async function call(method, value) {
  const result = await window.banci.call(method, value);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function toast(message, undo) { $('toast').textContent = message; $('toast').style.display = 'block'; if (undo) { const button=document.createElement('button'); button.textContent='撤销'; button.onclick=()=>act(undo); $('toast').append(button); } clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.display = 'none', 5500); }
function act(fn) { Promise.resolve().then(fn).catch(e => toast(e.message)); }
function media(action, value) { return call('media', { action, value }); }
function layout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(commitLayout);
}
function commitLayout() {
  layoutFrame = 0;
  const slot = immersive ? null : page === 'browse' ? $('browse-web') : page === 'listen' && state?.media.key ? $('listen-web') : null;
  let rect = { x: 0, y: 0, width: 0, height: 0 };
  if (slot) {
    const r = slot.getBoundingClientRect(), y = Math.max(72, r.y), bottom = Math.min(innerHeight - 92, r.bottom);
    rect = { x: Math.round(r.x), y: Math.round(y), width: Math.round(r.width), height: Math.max(0, Math.round(bottom - y)) };
  }
  const signature = JSON.stringify([page, rect, state?.media.key, state?.settings.audioOnly]);
  if (signature === layoutSignature) return;
  layoutSignature = signature; call('view', { mode: page, rect }).catch(() => { layoutSignature = ''; });
}
function showPage(name) {
  if (name !== 'listen' && immersive) setImmersive(false);
  page = name;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + name));
  document.querySelectorAll('.nav').forEach(el => { const active = el.dataset.page === name; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  requestAnimationFrame(layout); if(name === 'favorites') loadFavorites();
  if (state) { if (name === 'queue') renderQueue(state); renderClock(state); }
}
document.querySelectorAll('[data-page]').forEach(el => el.onclick = () => showPage(el.dataset.page));
document.querySelectorAll('[data-window]').forEach(el => el.onclick = () => act(() => call(el.dataset.window)));
$('open-form').onsubmit = event => { event.preventDefault(); showPage('browse'); act(() => call('open', $('global-query').value)); };
$('login').onclick = () => { showPage('browse'); act(() => call('login')); };
$('empty-open').onclick = () => showPage('browse');
$('listen-view').onclick = () => showPage('listen');
for (const [id, action] of [['browser-back', 'back'], ['browser-forward', 'forward'], ['browser-reload', 'reload']]) $(id).onclick = () => act(() => call('browser', action));
$('play').onclick = () => act(() => media('play'));
$('back-ten').onclick = () => act(() => media('back10'));
$('forward-ten').onclick = () => act(() => media('forward10'));
$('seek').onchange = () => act(() => media('seek', Number($('seek').value) / 1000 * (state?.media.duration || 0)));
$('volume').onchange = () => act(() => media('volume', Number($('volume').value) / 100));
$('rate').onchange = () => act(() => media('rate', Number($('rate').value)));
for (const id of ['float-toggle', 'dock-floating']) $(id).onclick = () => act(() => call('floating'));
$('bilingual').onclick = () => act(() => call('settings', { bilingual: !state?.settings.bilingual }));
$('offset-less').onclick = () => act(() => call('offset', (state?.offset || 0) - .5));
$('offset-more').onclick = () => act(() => call('offset', (state?.offset || 0) + .5));
$('offset-reset').onclick = () => act(() => call('offset', 0));
for (const id of ['import-original', 'settings-import']) $(id).onclick = () => act(() => call('import', false));
$('import-translation').onclick = () => act(() => call('import', true));
$('lyric-search-form').onsubmit = event => { event.preventDefault(); act(() => call('search', $('lyric-query').value)); };
$('paste-apply').onclick = () => act(async () => { await call('paste', { text: $('custom-text').value, translation: $('paste-translation').checked }); toast('字幕已载入'); });
$('align-apply').onclick = () => act(() => call('align', Number($('align-line').value)));
for (const [id, setting] of [['source', 'source'], ['auto-search', 'autoSearch'], ['setting-bilingual', 'bilingual'], ['setting-floating', 'floating'], ['locked', 'locked'], ['font-size', 'fontSize'], ['lyric-color', 'color'], ['opacity', 'opacity']]) {
  $(id).onchange = () => act(() => call('settings', { [setting]: $(id).type === 'checkbox' ? $(id).checked : $(id).type === 'range' ? Number($(id).value) / (setting === 'opacity' ? 100 : 1) : $(id).value }));
}
function addFloatingRecoveryUI() {
  const recover = document.createElement('button'); recover.id = 'recover-floating'; recover.className = 'pill';
  recover.innerHTML = icon('reload') + '<span>找回歌词</span>'; recover.title = '重建浮窗、归位到屏幕内并解除锁定';
  recover.onclick = () => act(async () => { await call('recover-floating'); toast('桌面歌词已归位并解锁'); });
  const group = document.createElement('div'); group.className = 'floating-actions';
  $('float-toggle').before(group); group.append($('float-toggle'), recover);
  const section = $('setting-floating').closest('.settings-section');
  const label = document.createElement('label'); label.className = 'setting-row'; label.htmlFor = 'floating-background';
  const text = document.createElement('span'); text.textContent = '兼容背景（推荐）';
  const hint = document.createElement('small'); hint.textContent = '深色歌词条，避免部分电脑透明窗口空白'; text.append(hint);
  const input = document.createElement('input'); input.type = 'checkbox'; input.id = 'floating-background'; input.checked = true;
  input.onchange = () => act(() => call('settings', { floatingBackground: input.checked })); label.append(text, input); section.append(label);
  const button = document.createElement('button'); button.id = 'settings-recover-floating'; button.className = 'subtle-button wide';
  button.textContent = '找回桌面歌词 / 归位并解锁'; button.onclick = recover.onclick; section.append(button);
}
addFloatingRecoveryUI(); setupFeatures();
function setValue(id, value) {
  const element = $(id); if (document.activeElement === element) return;
  if (element.type === 'checkbox') { if (element.checked !== !!value) element.checked = !!value; }
  else if (String(element.value) !== String(value ?? '')) element.value = value;
}
function render(s) {
  state = s;
  const title = s.track?.title || (s.media.title ? BanCi.cleanTitle(s.media.title) : '你的下一首喜欢');
  $('song-name').textContent = title; $('song-name').title = title;
  $('song-artist').textContent = s.track ? `${s.track.artist || 'B站视频'}  /  ${s.track.source}` : s.media.title || '打开一个视频，其余交给伴词';
  $('dock-title').textContent = s.media.key ? title : '伴词音乐';
  $('dock-artist').textContent = s.track?.artist || (s.media.key ? '正在识别视频歌曲' : '从一首喜欢的歌开始');
  $('match-status').textContent = s.status;
  $('lyric-source').textContent = s.track?.source || (s.media.key ? '自动匹配中' : '等待播放');
  $('current-time').textContent = BanCi.formatTime(s.media.time); $('duration').textContent = BanCi.formatTime(s.media.duration);
  if (document.activeElement !== $('seek')) $('seek').value = s.media.duration ? s.media.time / s.media.duration * 1000 : 0;
  setValue('volume', s.media.volume * 100); setValue('rate', s.media.rate || 1);
  if ($('play').dataset.paused !== String(s.media.paused)) { $('play').dataset.paused = String(s.media.paused); $('play').innerHTML = icon(s.media.paused ? 'play' : 'pause'); $('play').setAttribute('aria-label', s.media.paused ? '播放' : '暂停'); }
  $('offset-value').textContent = `${s.offset > 0 ? '+' : ''}${s.offset.toFixed(1)}s`;
  $('float-toggle').classList.toggle('enabled', s.settings.floating); $('dock-floating').classList.toggle('enabled', s.settings.floating);
  $('bilingual').setAttribute('aria-pressed', String(s.settings.bilingual));
  setValue('source', s.settings.source); setValue('auto-search', s.settings.autoSearch); setValue('setting-bilingual', s.settings.bilingual);
  setValue('setting-floating', s.settings.floating); setValue('locked', s.settings.locked); setValue('font-size', s.settings.fontSize);
  setValue('lyric-color', s.settings.color); setValue('opacity', s.settings.opacity * 100); $('font-output').value = s.settings.fontSize;
  setValue('floating-background', s.settings.floatingBackground);
  const identity = s.media.key + s.media.title;
  if (identity !== lastIdentity) { lastIdentity = identity; $('lyric-query').value = BanCi.cleanTitle(s.media.title || ''); requestAnimationFrame(layout); }
  $('album-stage').classList.toggle('has-video', !!s.media.key && !s.settings.audioOnly);
  $('album-stage').hidden = !s.media.key || s.settings.audioOnly;
  document.querySelector('.player-column').classList.toggle('no-video', $('album-stage').hidden);
  const videoView = s.media.key + ':' + s.settings.audioOnly;
  if (videoView !== lastVideoView) { lastVideoView = videoView; requestAnimationFrame(layout); }
  if (s.media.cover) { if ($('dock-cover').src !== s.media.cover) $('dock-cover').src = s.media.cover; $('dock-cover').style.display = 'block'; }
  else $('dock-cover').style.display = 'none';
  $('lyrics-empty').style.display = s.rows.length ? 'none' : 'block';
  const signature = JSON.stringify([s.rows, s.translations, s.settings.bilingual]);
  if (signature !== rowsSignature) {
    rowsSignature = signature; const lines = document.createDocumentFragment(), options = document.createDocumentFragment(); lastIndex = -99;
    s.rows.forEach((row, index) => {
      const button = document.createElement('button'); button.className = 'lyric-row'; button.dataset.index = index;
      const primary = document.createElement('span'); primary.textContent = row.text.split('\n')[0] || '♪'; button.append(primary);
      const translated = s.settings.bilingual ? BanCi.lineAt(s.translations || [], row.time + .05) || row.text.split('\n').slice(1).join('\n') : '';
      if (translated) { const sub = document.createElement('span'); sub.className = 'translation'; sub.textContent = translated; button.append(sub); }
      button.title = '点击跳转到这一句'; button.onclick = () => act(() => call('seek-line', index)); lines.append(button);
      const option = document.createElement('option'); option.value = index; option.textContent = `${BanCi.formatTime(row.time)}  ${row.text.replace(/\n/g, ' / ') || '（间奏）'}`; options.append(option);
    });
    if (!s.rows.length) { const option = document.createElement('option'); option.textContent = '先播放视频并匹配歌词'; options.append(option); }
    $('lyrics-lines').replaceChildren(lines); $('align-line').replaceChildren(options);
    $('align-apply').disabled = !s.rows.length;
  }
  if (page === 'listen' && lastIndex !== s.index) {
    $('lyrics-lines').children[lastIndex]?.classList.remove('current');
    lastIndex = s.index;
    const row = $('lyrics-lines').children[s.index];
    row?.classList.add('current');
    if (row) $('lyrics-scroll').scrollTo({ top: row.offsetTop - $('lyrics-scroll').clientHeight / 2 + row.clientHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  const cs = JSON.stringify([s.candidates, s.track?.id, s.lyricFavoriteId]);
  if (cs !== candidateSignature) {
    candidateSignature = cs; $('candidates').replaceChildren();
    s.candidates.slice(0, 20).forEach(t => {
      const button = document.createElement('button'); button.className = 'candidate';
      const info = document.createElement('span'); info.textContent = t.trackName;
      const sub = document.createElement('small'); sub.textContent = `${t.artistName} / ${t.source} / ${BanCi.formatTime(t.duration)}`; info.append(sub);
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = s.track?.id === t.id ? '正在使用' : '使用歌词';
      button.disabled = !t.timed && !t.lyricsPending; button.append(info, tag); button.onclick = () => act(() => call('choose', t.id));
      const row = document.createElement('div'); row.className = 'candidate-row';
      const star = lyricStarButton(t.id, s.lyricFavoriteId === t.id, t.trackName);
      star.disabled = button.disabled; row.append(button, star); $('candidates').append(row);
    });
  }
  renderHistory(s); renderFeatureSettings(s); renderLyricFavoriteControls(s);

}
window.banci.onState(render); window.banci.onClock(renderClock);
window.banci.onBrowser(b => {
  if (b.mode) showPage(b.mode);
  renderProfile(b); if ('audio' in b) renderAudio(b.audio);
  $('browser-url').textContent = b.url || 'bilibili.com'; $('browser-loading').textContent = b.loading ? '正在加载…' : '官方网页';
  $('browser-error').textContent = b.error || ''; requestAnimationFrame(layout);
});
new ResizeObserver(layout).observe(document.querySelector('main'));
document.querySelector('main').addEventListener('scroll', layout, { passive: true });
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); act(() => media('play')); }
});
act(async () => { const result = await call('state'); render(result.state); renderProfile(result.browser); renderAudio(result.browser.audio); layout(); });
