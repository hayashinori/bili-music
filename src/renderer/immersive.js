let immersive = false, normalScroll = 0, armReady = false;
function centerImmersiveLyric() {
  const row = document.querySelector('.lyric-row.current'), scroll = $('lyrics-scroll');
  if (row) scroll.scrollTo({ top: row.offsetTop - scroll.clientHeight / 2 + row.clientHeight / 2, behavior: 'instant' });
}
function setImmersive(value) {
  if (immersive === value) return;
  immersive = value;
  armReady = false; document.body.classList.remove('arm-engaged');
  if (value) normalScroll = document.querySelector('main').scrollTop;
  document.body.classList.toggle('immersive', value);
  $('immersive-toggle').setAttribute('aria-pressed', String(value));
  const heading = document.querySelector('.song-heading');
  if (value) document.querySelector('.lyrics-column').prepend(heading);
  else document.querySelector('.song-actions').before(heading);
  $('immersive-exit').hidden = !value;
  document.querySelector('main').scrollTop = value ? 0 : normalScroll;
  (value ? $('immersive-exit') : $('immersive-toggle')).focus();
  requestAnimationFrame(() => {
    layout(); centerImmersiveLyric();
    if (immersive) {
      // Establish the lifted pose before applying playback, including when
      // entering this view while the existing video is already playing.
      getComputedStyle(document.querySelector('.immersive-arm')).transform;
      armReady = true; if (state) renderImmersiveClock(state);
    }
  });
}
function setupImmersive() {
  const clear = document.createElement('button'); clear.type = 'button'; clear.id = 'search-clear'; clear.title = '清空搜索文字'; clear.setAttribute('aria-label', clear.title); clear.innerHTML = icon('x'); clear.hidden = !$('global-query').value;
  $('global-query').after(clear);
  $('global-query').addEventListener('input', () => clear.hidden = !$('global-query').value);
  clear.onclick = () => { $('global-query').value = ''; $('global-query').dispatchEvent(new Event('input', { bubbles: true })); $('global-query').focus(); };
  const button = featureButton('', () => setImmersive(true), 'pill'); button.id = 'immersive-toggle'; button.innerHTML = icon('immersive') + '<span>沉浸模式</span>'; button.setAttribute('aria-pressed', 'false');
  // Join the existing right-aligned desktop-lyrics controls.
  $('float-toggle').parentElement.append(button);
  const exit = featureButton('', () => setImmersive(false), 'immersive-exit'); exit.id = 'immersive-exit'; exit.innerHTML = icon('chevron') + '<span>退出沉浸模式</span><kbd>Esc</kbd>'; exit.hidden = true; document.body.append(exit);
  const art = document.createElement('div'); art.className = 'immersive-art';
  art.innerHTML = '<div class="immersive-turntable"><div class="immersive-arm"></div><div class="immersive-record"><div class="immersive-label"><img id="immersive-cover" alt="当前视频封面" hidden><span id="immersive-cover-placeholder">' + icon('music') + '</span></div></div></div>';
  document.querySelector('.player-column').prepend(art);
  $('immersive-cover').onerror = () => { $('immersive-cover').hidden = true; $('immersive-cover-placeholder').hidden = false; };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && immersive) { event.preventDefault(); setImmersive(false); } });
}
function renderImmersive(s) {
  const cover = s.media.cover || '', image = $('immersive-cover');
  if (image.dataset.cover !== cover) { image.dataset.cover = cover; image.hidden = !cover; $('immersive-cover-placeholder').hidden = !!cover; if (cover) image.src = cover; else image.removeAttribute('src'); }
  renderImmersiveClock(s);
}
function renderImmersiveClock(s) {
  const playing = !!s.media.key && !s.media.paused;
  document.body.classList.toggle('record-playing', playing);
  document.body.classList.toggle('arm-engaged', immersive && armReady && playing);
}
let uiActive = true;
function updateMotionActivity() { document.body.classList.toggle('motion-suspended', !uiActive || document.hidden); }
document.addEventListener('visibilitychange', updateMotionActivity);
window.banci.onActivity(active => { uiActive = active; updateMotionActivity(); });
