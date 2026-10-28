let queueSignature = '', renderedLoop = '', queueDrag = null, queueDragTimer = 0, queueDragRaf = 0;
const loopNames = { order: '顺序播放', list: '列表循环', one: '单曲循环' };
function setupAppearance() {
  const row = document.createElement('label'); row.className = 'setting-row'; row.htmlFor = 'appearance'; row.innerHTML = '<span>界面模式</span><select id="appearance"><option value="light">浅色模式</option><option value="dark">暗色模式</option><option value="system">跟随系统</option></select>';
  document.querySelector('.theme-section h2').after(row);
  $('appearance').onchange = () => act(() => call('settings', { appearance: $('appearance').value }));
  const toggle = featureButton('', () => act(() => call('settings', { appearance: document.body.classList.contains('dark-mode') ? 'light' : 'dark' })), 'dark-toggle'); toggle.id = 'dark-toggle'; toggle.innerHTML = icon('moon'); toggle.setAttribute('aria-label', '切换明暗模式'); $('login').before(toggle);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state?.settings.appearance === 'system') renderTheme(state.settings.themeColor); });
}
function setupQueue() {
  const nav = featureButton('', () => showPage('queue'), 'nav'); nav.dataset.page = 'queue'; nav.innerHTML = icon('list') + '<span>歌曲列表</span>'; document.querySelector('.library-nav').append(nav);
  const page = document.createElement('section'); page.id = 'page-queue'; page.className = 'page';
  page.innerHTML = '<div class="page-heading"><h1>歌曲列表<span class="title-dot"></span></h1><button id="queue-play-all" class="pill">从第一首播放</button></div><form id="queue-add-form" class="queue-add-form"><label class="sr-only" for="queue-input">视频链接或 BV 号</label><input id="queue-input" placeholder="粘贴 B 站视频链接或 BV 号，添加到列表"><button type="submit" class="red-button">添加歌曲</button></form><div class="queue-toolbar"><span id="queue-count">0 首歌曲</span><label for="queue-loop">循环模式</label><select id="queue-loop"><option value="order">顺序播放</option><option value="list">列表循环</option><option value="one">单曲循环</option></select><span class="queue-hint">长按歌曲或拖动柄上下排序，也可用方向按钮移动</span></div><div id="queue-list" aria-label="歌曲列表"></div><p id="queue-empty" class="setting-description">列表还是空的。在正在听、最近播放或我的收藏中点击“添加到歌曲列表”。</p>';
  document.querySelector('main').append(page);
  $('queue-add-form').onsubmit = event => { event.preventDefault(); act(async () => { const r = await call('queue-add', { url: $('queue-input').value }); toast(r.added ? '已添加到歌曲列表' : '歌曲已在列表中'); $('queue-input').value = ''; }); };
  $('queue-loop').onchange = () => act(() => call('queue-mode', $('queue-loop').value));
  $('queue-play-all').onclick = () => act(() => call('queue-play', state.queue.items[0]?.id));
  const add = featureButton('', () => act(async () => { const r = await call('queue-add'); toast(r.added ? '已添加到歌曲列表' : '歌曲已在列表中'); })); add.id = 'queue-add-current'; add.innerHTML = icon('add-list') + '<span>添加到歌曲列表</span>'; document.querySelector('.song-actions').append(add);
  const previous = featureButton('', () => act(() => call('queue-prev')), 'queue-transport'); previous.id = 'queue-prev'; previous.innerHTML = icon('previous'); previous.title = '上一首'; previous.setAttribute('aria-label', '上一首'); $('back-ten').before(previous);
  const next = featureButton('', () => act(() => call('queue-next')), 'queue-transport'); next.id = 'queue-next'; next.innerHTML = icon('next'); next.title = '下一首'; next.setAttribute('aria-label', '下一首'); $('forward-ten').after(next);
  const loop = featureButton('', () => act(() => { const modes = ['order', 'list', 'one']; return call('queue-mode', modes[(modes.indexOf(state.queue.mode) + 1) % modes.length]); }), 'queue-transport'); loop.id = 'queue-mode'; document.querySelector('.playback-buttons').append(loop);
  const open = featureButton('', () => showPage('queue'), 'dock-icon'); open.id = 'queue-open'; open.title = '歌曲列表'; open.setAttribute('aria-label', '打开歌曲列表'); open.innerHTML = icon('list'); document.querySelector('.dock-tools').append(open);
}
function moveQueue(id, delta) {
  const ids = state.queue.items.map(t => t.id), i = ids.indexOf(id), next = i + delta; if (next < 0 || next >= ids.length) return;
  [ids[i], ids[next]] = [ids[next], ids[i]]; act(() => call('queue-reorder', ids));
}
function attachQueueDrag(row) {
  row.onpointerdown = event => {
    if (event.button !== 0 || event.target.closest('button') && !event.target.closest('.queue-grip')) return;
    const start = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false, row, yNow: event.clientY };
    queueDrag = start;
    queueDragTimer = setTimeout(() => {
      if (queueDrag !== start) return; start.active = true; row.classList.add('dragging');
      // Capture on the stable list: moving the dragged row in the DOM must not
      // release capture and cancel the reorder halfway through the gesture.
      const list = $('queue-list'); list.setPointerCapture(start.id);
      for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) list['on' + type] = event => row['on' + type]?.(event);
      document.body.classList.add('queue-dragging'); dragFrame();
    }, 300);
  };
  function reorderAt(y) {
    const rows = [...$('queue-list').children].filter(r => r !== row);
    const target = rows.find(r => { const rect = r.getBoundingClientRect(); return y < rect.y + rect.height / 2; });
    $('queue-list').insertBefore(row, target || null);
  }
  function dragFrame() {
    if (!queueDrag?.active) return;
    const main = document.querySelector('main'), rect = main.getBoundingClientRect(), y = queueDrag.yNow;
    if (y > rect.bottom - 55) main.scrollTop += 12; else if (y < rect.top + 55) main.scrollTop -= 12;
    reorderAt(y); queueDragRaf = requestAnimationFrame(dragFrame);
  }
  row.onpointermove = event => {
    if (queueDrag?.row !== row) return; queueDrag.yNow = event.clientY;
    if (!queueDrag.active && Math.hypot(event.clientX - queueDrag.x, event.clientY - queueDrag.y) > 8) { clearTimeout(queueDragTimer); queueDrag = null; }
    else if (queueDrag?.active) { event.preventDefault(); reorderAt(event.clientY); }
  };
  function finish(commit) {
    if (queueDrag?.row !== row) return;
    const active = queueDrag.active; clearTimeout(queueDragTimer); cancelAnimationFrame(queueDragRaf); queueDrag = null;
    row.classList.remove('dragging'); document.body.classList.remove('queue-dragging');
    const ids = [...$('queue-list').children].map(r => r.dataset.id);
    queueSignature = '';
    if (active && commit) act(async () => { try { await call('queue-reorder', ids); } finally { renderQueue(state); } });
    else renderQueue(state);
  }
  row.onpointerup = () => finish(true); row.onpointercancel = () => finish(false); row.onlostpointercapture = () => finish(false);
  row.onpointerleave = () => { if (queueDrag?.row === row && !queueDrag.active) finish(false); };
}
function renderQueue(s) {
  if (!s.queue) return;
  const q = s.queue;
  $('queue-add-current').disabled = !s.media.key; $('queue-play-all').disabled = !q.items.length;
  for (const id of ['queue-prev', 'queue-next']) $(id).disabled = !q.items.length;
  if (q.mode !== renderedLoop) {
    renderedLoop = q.mode; $('queue-mode').innerHTML = icon(q.mode === 'one' ? 'repeat-one' : q.mode === 'list' ? 'repeat' : 'order'); $('queue-mode').title = loopNames[q.mode]; $('queue-mode').setAttribute('aria-label', '循环模式：' + loopNames[q.mode]); $('queue-mode').classList.toggle('enabled', q.mode !== 'order');
  }
  setValue('queue-loop', q.mode); $('queue-count').textContent = q.items.length + ' 首歌曲'; $('queue-empty').hidden = !!q.items.length;
  if (page !== 'queue' || queueDrag) return;
  const signature = JSON.stringify(q); if (signature === queueSignature) return; queueSignature = signature;
  const fragment = document.createDocumentFragment();
  q.items.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'queue-row'; row.dataset.id = item.id; row.classList.toggle('current', item.id === q.currentId);
    const grip = featureButton('', () => {}, 'queue-grip'); grip.innerHTML = icon('grip'); grip.title = '长按拖动排序'; grip.setAttribute('aria-label', '长按拖动排序：' + item.title); row.append(grip);
    const number = document.createElement('span'); number.className = 'queue-number'; number.textContent = String(index + 1).padStart(2, '0'); row.append(number);
    const name = document.createElement('div'); name.className = 'queue-name'; const title = document.createElement('strong'); title.textContent = item.title; const info = document.createElement('small'); info.textContent = item.id === q.currentId ? '当前播放' : 'B 站视频'; name.append(title, info); row.append(name);
    for (const [label, symbol, action] of [['播放', 'play', () => call('queue-play', item.id)], ['上移', 'chevron-up', () => moveQueue(item.id, -1)], ['下移', 'chevron', () => moveQueue(item.id, 1)], ['移除', 'x', () => call('queue-remove', item.id)]]) {
      const button = featureButton('', () => act(action), 'queue-row-action'); button.innerHTML = icon(symbol); button.title = label; button.setAttribute('aria-label', label + '：' + item.title); if (label === '上移') button.disabled = index === 0; if (label === '下移') button.disabled = index === q.items.length - 1; row.append(button);
    }
    grip.onkeydown = event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); moveQueue(item.id, event.key === 'ArrowUp' ? -1 : 1); } };
    attachQueueDrag(row); fragment.append(row);
  });
  $('queue-list').replaceChildren(fragment);
}
