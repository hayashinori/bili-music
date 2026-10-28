let settings = {}, frame, receivedAt = 0, raf = 0, drawnAt = 0, fitSignature = '';
const $ = id => document.getElementById(id);
function fitText() {
  const primary = document.querySelector('.primary'), secondary = $('secondary');
  const width = Math.max(100, innerWidth - 36), height = Math.max(40, innerHeight - 66);
  primary.style.transform = secondary.style.transform = '';
  const mainSize = settings.fontSize || 34, subSize = settings.secondaryFontSize || 20;
  document.documentElement.style.setProperty('--size', mainSize + 'px');
  document.documentElement.style.setProperty('--secondary-size', subSize + 'px');
  let a = mainSize * Math.min(1, width / Math.max(1, primary.scrollWidth));
  let b = subSize * Math.min(1, width / Math.max(1, secondary.scrollWidth));
  const ratio = Math.min(1, height / (a * 1.5 + b * 1.7 + 5)); a *= ratio; b *= ratio;
  document.documentElement.style.setProperty('--size', Math.max(12, a) + 'px');
  document.documentElement.style.setProperty('--secondary-size', Math.max(12, b) + 'px');
  primary.style.transform = `scaleX(${Math.min(1, width / Math.max(1, primary.scrollWidth))})`;
  secondary.style.transform = `scaleX(${Math.min(1, width / Math.max(1, secondary.scrollWidth))})`;
}
function paint(now) {
  raf = 0;
  if (!frame || document.hidden) return;
  const delta = frame.media.paused ? 0 : Math.min(1.2, (now - receivedAt) / 1000) * (frame.media.rate || 1);
  const span = frame.lineEnd - frame.lineStart;
  const progress = span > 0 ? Math.max(0, Math.min(1, (frame.lyricTime + delta - frame.lineStart) / span)) : frame.progress;
  const cadence = settings.lowResource ? 1000 / 30 : 1000 / 60;
  if (now - drawnAt >= cadence - .75 || frame.media.paused) {
    document.documentElement.style.setProperty('--progress', (progress * 100) + '%'); drawnAt = now;
  }
  if (frame.text && span > 0 && !frame.media.paused && now - receivedAt < 1800 && progress < 1) raf = requestAnimationFrame(paint);
}
function update(clock) {
  frame = clock; receivedAt = performance.now();
  const text = clock.text || (clock.media.key ? '♪' : '伴词，随音乐而来');
  const secondary = clock.translation || clock.nextText || (!clock.media.key ? '播放 B 站音乐，歌词会自动跟上' : '');
  for (const id of ['base', 'highlight']) if ($(id).textContent !== text) $(id).textContent = text;
  if ($('secondary').textContent !== secondary) $('secondary').textContent = secondary;
  const signature = JSON.stringify([text, secondary, settings.fontSize, settings.secondaryFontSize]);
  if (signature !== fitSignature) {
    fitSignature = signature;
    requestAnimationFrame(fitText);
  }
  cancelAnimationFrame(raf); paint(receivedAt + 35);
}
function render(s) {
  settings = s.settings;
  document.body.classList.toggle('with-background', !!settings.floatingBackground);
  document.body.classList.toggle('locked', !!settings.locked);
  document.documentElement.style.setProperty('--color', settings.color);
  document.documentElement.style.setProperty('--opacity', settings.opacity);
  update(s);
}
function call(method, value) { window.banci.call(method, value).catch(() => {}); }
$('smaller').onclick = () => call('font', -2);
$('larger').onclick = () => call('font', 2);
$('lock').onclick = () => call('locked');
$('controls').onclick = () => call('show-main');
$('hide').onclick = () => call('floating', false);
window.banci.onState(render); window.banci.onClock(update);
document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden && frame) raf = requestAnimationFrame(paint); });
window.banci.call('state').then(r => { if (r.ok) render(r.state); });
window.addEventListener('resize', fitText);
const resizingUI = document.createElement('div');
resizingUI.innerHTML = '<div class="resize-edge left" data-edge="left" role="separator" aria-label="调整歌词框左边缘" aria-orientation="vertical" tabindex="0" title="拖动拉宽歌词框，松开应用；方向键微调"></div><div class="resize-edge right" data-edge="right" role="separator" aria-label="调整歌词框右边缘" aria-orientation="vertical" tabindex="0" title="拖动拉宽歌词框，松开应用；方向键微调"></div><div class="resize-corner" data-edge="corner" role="button" aria-label="调整歌词框宽高" tabindex="0" title="拖动调整宽高，松开应用"></div><output id="resize-status" hidden></output>';
document.body.append(resizingUI);
let drag = null;
for (const handle of document.querySelectorAll('[data-edge]')) {
  handle.onpointerdown = event => {
    if (settings.locked || event.button !== 0) return;
    event.preventDefault(); handle.setPointerCapture(event.pointerId);
    drag = { x: event.screenX, y: event.screenY, width: innerWidth, height: innerHeight, edge: handle.dataset.edge };
    document.body.classList.add('resizing'); $('resize-status').hidden = false; $('resize-status').textContent = '拖动调整尺寸，松开应用';
  };
  function requested(event) {
    return { width: drag.width + (event.screenX - drag.x) * (drag.edge === 'left' ? -1 : 1), height: drag.height + (drag.edge === 'corner' ? event.screenY - drag.y : 0), anchor: drag.edge === 'left' ? 'right' : 'left' };
  }
  handle.onpointermove = event => {
    if (!drag) return; const size = requested(event);
    $('resize-status').textContent = `${Math.round(Math.max(320, size.width))} × ${Math.round(Math.max(120, size.height))} · 松开应用`;
  };
  handle.onpointerup = event => {
    if (!drag) return; const size = requested(event); drag = null;
    document.body.classList.remove('resizing'); $('resize-status').hidden = true;
    call('floating-size', size);
  };
  handle.onlostpointercapture = () => { drag = null; document.body.classList.remove('resizing'); $('resize-status').hidden = true; };
  handle.onkeydown = event => {
    if (settings.locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); call('floating-size', { width: innerWidth + (event.key === 'ArrowRight' ? 40 : event.key === 'ArrowLeft' ? -40 : 0), height: innerHeight + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0) });
  };
}
