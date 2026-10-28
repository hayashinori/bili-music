// These self-contained functions run in Bilibili's main world. They only use
// controls exposed by the official player; no media URL or access flag is altered.
function readAudioState() {
  const controls = [['hires', 'Hi-Res 音质', '.bpx-player-ctrl-flac'], ['dolby', '杜比全景声', '.bpx-player-ctrl-dolby']];
  const options = [{ id: 'standard', label: '标准音质', available: true }]; let current = 'standard';
  for (const [id, label, selector] of controls) {
    const e = document.querySelector(selector);
    if (!e || getComputedStyle(e).display === 'none') continue;
    const available = e.getAttribute('aria-disabled') !== 'true' && !e.classList.contains('bpx-state-disabled');
    const active = e.classList.contains('bpx-state-active') || e.classList.contains('bpx-state-selected') || e.getAttribute('aria-pressed') === 'true' || !!e.querySelector('input:checked');
    options.push({ id, label, available }); if (active) current = id;
  }
  return { options, current, note: options.length === 1 ? '当前播放器仅提供标准音轨；Hi-Res/杜比取决于视频与账号权限' : '使用 B 站官方音轨选项，切换后以播放器状态为准' };
}
function clickAudioOption(id) {
  const selectors = { hires: '.bpx-player-ctrl-flac', dolby: '.bpx-player-ctrl-dolby' };
  const active = e => e && (e.classList.contains('bpx-state-active') || e.classList.contains('bpx-state-selected') || e.getAttribute('aria-pressed') === 'true' || !!e.querySelector('input:checked'));
  if (id === 'standard') {
    for (const selector of Object.values(selectors)) { const e = document.querySelector(selector); if (active(e)) e.click(); }
    return true;
  }
  const e = document.querySelector(selectors[id]);
  if (!e || e.getAttribute('aria-disabled') === 'true' || e.classList.contains('bpx-state-disabled')) return false;
  if (!active(e)) e.click(); return true;
}
module.exports = { readAudioState, clickAudioOption };
