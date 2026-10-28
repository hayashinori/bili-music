let accountInfo = {}, favoriteLoaded = false, favoriteBusy = false, favoriteSeq = 0, favoriteItems = [], favoritePage = 1, favoriteMore = false;
const themePresets = [['#f43f55', '珊瑚红'], ['#da5c90', '玫瑰粉'], ['#7962d8', '鸢尾紫'], ['#3478db', '晴空蓝'], ['#168778', '松石绿'], ['#c38220', '琥珀金']];
let renderedTheme = '';
let sourceResultsSignature = '';
function setupSources() {
  const tools = document.createElement('div'); tools.className = 'lyric-source-tools';
  tools.innerHTML = '<label for="quick-source">字幕源</label><select id="quick-source"></select><button id="source-refresh" class="subtle-button" title="清除当前源搜索和歌词缓存，重新搜索">' + icon('refresh') + '<span>刷新源</span></button>';
  const results = document.createElement('div'); results.id = 'source-results'; results.className = 'source-results'; results.setAttribute('role', 'status');
  $('match-details').before(tools, results);
  const panel = document.createElement('section'); panel.className = 'lyric-tools'; panel.setAttribute('aria-label', '歌词匹配与时间校准');
  panel.append(document.querySelector('.calibration-bar'), tools, results, $('match-details'));
  document.querySelector('.player-column').append(panel);
  for (const id of ['source', 'quick-source']) {
    $(id).replaceChildren(...BanCiSources.map(source => { const option = document.createElement('option'); option.value = source.id; option.textContent = source.name; return option; }));
  }
  const changeSource = refresh => act(() => call('source-search', { source: $('quick-source').value, query: $('lyric-query').value.trim(), refresh }));
  $('quick-source').onchange = () => changeSource(false);
  $('source-refresh').onclick = () => changeSource(true);
}
function renderSources(s) {
  setValue('quick-source', s.settings.source);
  $('source-refresh').disabled = !!s.searching; $('source-refresh').setAttribute('aria-busy', String(!!s.searching));
  $('source-refresh').lastElementChild.textContent = s.searching ? '搜索中…' : '刷新源';
  const note = document.querySelector('.source-note').lastElementChild;
  const label = BanCiSources.find(source => source.id === s.settings.source)?.name || '自动合并（全部源）';
  if (note.dataset.source !== s.settings.source) { note.dataset.source = s.settings.source; note.replaceChildren(document.createTextNode(label), document.createElement('br')); const small = document.createElement('small'); small.textContent = '4 个歌词源 · 支持双语与自定义字幕'; note.append(small); }
  const signature = JSON.stringify([s.searching, s.sourceResults]); if (signature === sourceResultsSignature) return;
  sourceResultsSignature = signature; $('source-results').replaceChildren();
  if (s.searching) { $('source-results').textContent = '正在搜索所选来源，当前字幕继续播放…'; return; }
  for (const result of s.sourceResults || []) {
    const badge = document.createElement('span'); badge.className = 'source-result ' + result.status;
    badge.textContent = result.name + ' · ' + (result.status === 'error' ? '连接失败' : result.count ? result.count + ' 个结果' : '无结果');
    badge.title = result.message || badge.textContent; $('source-results').append(badge);
  }
}
function previewTheme(value) {
  for (const [key, color] of Object.entries(BanCiTheme.tokens(value, document.body.classList.contains('dark-mode')))) document.documentElement.style.setProperty(key, color);
}
function setupTheme() {
  const section = document.createElement('section'); section.className = 'settings-section theme-section';
  section.innerHTML = '<h2>全局主题色</h2><p class="setting-description">为侧栏、按钮、进度条和歌词高亮换个颜色。桌面歌词颜色可单独设置。</p><div id="theme-presets" class="theme-presets" role="group" aria-label="预设主题色"></div><div class="theme-custom"><label for="theme-color">自定义颜色</label><input type="color" id="theme-color" value="#f43f55"><output id="theme-value" for="theme-color">#F43F55</output><button class="subtle-button" id="theme-reset">恢复默认</button></div><div class="theme-preview" aria-hidden="true"><span class="theme-preview-play">' + icon('play') + '</span><span><strong>你的音乐，你的色彩</strong><small>主题将在整个应用中生效</small></span><span class="theme-preview-line"></span></div>';
  document.querySelector('.settings-grid').prepend(section);
  for (const [color, label] of themePresets) {
    const button = featureButton('', () => act(() => call('settings', { themeColor: color })), 'theme-swatch');
    button.dataset.color = color; button.style.setProperty('--swatch', color); button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', 'false');
    button.innerHTML = icon('check'); $('theme-presets').append(button);
  }
  $('theme-color').oninput = () => { previewTheme($('theme-color').value); $('theme-value').value = $('theme-color').value.toUpperCase(); };
  $('theme-color').onchange = () => act(() => call('settings', { themeColor: $('theme-color').value }));
  $('theme-reset').onclick = () => act(() => call('settings', { themeColor: '#f43f55' }));
}
function renderTheme(value) {
  const appearance = state?.settings.appearance || 'light';
  const dark = appearance === 'dark' || appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark-mode', dark);
  if ($('appearance')) setValue('appearance', appearance);
  if ($('dark-toggle')) { $('dark-toggle').setAttribute('aria-pressed', String(dark)); $('dark-toggle').title = dark ? '切换浅色模式' : '切换暗色模式'; }
  value = value || '#f43f55'; const signature = value + ':' + dark; if (signature === renderedTheme) return;
  renderedTheme = signature; previewTheme(value); $('theme-color').value = value; $('theme-value').value = value.toUpperCase();
  for (const button of document.querySelectorAll('.theme-swatch')) button.setAttribute('aria-pressed', String(button.dataset.color === value));
}
function featureButton(label, action, className = 'subtle-button') {
  const button = document.createElement('button'); button.className = className; button.textContent = label; button.onclick = action; return button;
}
function setupFeatures() {
  setupQueue();
  setupImmersive();
  setupSources();
  const nav = featureButton('我的收藏', () => showPage('favorites'), 'nav'); nav.dataset.page = 'favorites';
  nav.innerHTML = icon('star') + '<span>我的收藏</span>'; document.querySelector('.sidebar .library-nav').append(nav);
  setupTheme();
  setupAppearance();
  const fav = document.createElement('section'); fav.id = 'page-favorites'; fav.className = 'page';
  fav.innerHTML = '<div class="page-heading"><div><p class="eyebrow">账号里的好音乐</p><h1>我的收藏<span class="title-dot"></span></h1></div><button id="favorite-refresh" class="pill">刷新收藏夹</button></div><div class="favorite-toolbar"><label for="favorite-folder">收藏夹</label><select id="favorite-folder"><option>登录后读取收藏夹</option></select><button id="favorite-login" class="subtle-button">登录 B 站</button></div><p id="favorite-status" class="setting-description" role="status">读取当前账号自己的收藏夹，点击视频直接播放。</p><div id="favorite-list" class="history-grid"></div><button id="favorite-more" class="subtle-button wide" hidden>加载下一页</button>';
  document.querySelector('main').append(fav);
  $('favorite-folder').onchange = () => loadFavoriteVideos(false);
  $('favorite-refresh').onclick = () => act(async () => { await call('profile-refresh'); favoriteLoaded = false; await loadFavorites(true); });
  $('favorite-login').onclick = () => { showPage('browse'); act(() => call('login')); };
  $('favorite-more').onclick = () => loadFavoriteVideos(true);
  const profileImage = document.createElement('img'); profileImage.id = 'profile-avatar'; profileImage.alt = ''; profileImage.hidden = true;
  profileImage.onerror = () => { profileImage.hidden = true; };
  $('login').firstElementChild.append(profileImage);
  const refresh = featureButton('↻', () => act(() => call('profile-refresh')), 'account-refresh'); refresh.id = 'profile-refresh'; refresh.title = '刷新头像与账号信息'; refresh.setAttribute('aria-label', refresh.title); $('login').after(refresh);
  $('login').onclick = () => { if (accountInfo.loggedIn) showPage('favorites'); else { showPage('browse'); act(() => call('login')); } };
  const tools = document.createElement('div'); tools.className = 'library-tools';
  for (const [value, label] of [['grid', '卡片'], ['list', '列表']]) {
    const button = featureButton(label, () => act(() => call('settings', { libraryLayout: value })), 'pill'); button.id = 'history-layout-' + value; tools.append(button);
  }
  const clear = featureButton('清空记录', () => act(async () => { await call('history-clear'); toast('最近播放已清空', () => call('history-undo')); }), 'pill'); clear.id = 'history-clear'; tools.append(clear);
  document.querySelector('#page-library .page-heading').append(tools);
  const actions = document.querySelector('.song-actions');
  const audio = featureButton('仅听音频', () => act(() => call('settings', { audioOnly: !state.settings.audioOnly }))); audio.id = 'audio-only'; actions.append(audio);
  const stop = featureButton('关闭视频', () => act(() => call('close-video'))); stop.id = 'close-video'; stop.title = '停止播放并释放视频网页'; actions.append(stop);
  const quality = document.createElement('div'); quality.className = 'audio-quality-row';
  quality.innerHTML = '<label for="audio-quality">音质</label><select id="audio-quality"><option value="standard">标准音质</option></select><button id="quality-refresh" aria-label="刷新可用音轨">↻</button><span id="quality-note">按视频与账号提供可用音轨</span>';
  actions.after(quality);
  $('quality-refresh').onclick = () => act(async () => { const r = await call('audio-quality'); renderAudio(r.audio); });
  $('audio-quality').onchange = () => act(async () => { const r = await call('audio-quality', $('audio-quality').value); renderAudio(r.audio); toast('已确认音轨切换'); });
  const section = $('setting-floating').closest('.settings-section');
  const addRange = (id, title, key, min, max) => {
    const label = document.createElement('label'); label.className = 'setting-row'; label.htmlFor = id;
    const span = document.createElement('span'); span.textContent = title + ' '; const out = document.createElement('output'); out.id = id + '-value'; span.append(out);
    const input = document.createElement('input'); input.id = id; input.type = 'range'; input.min = min; input.max = max;
    input.onchange = () => act(() => call('settings', { [key]: Number(input.value) })); label.append(span, input); section.append(label);
  };
  addRange('secondary-size', '桌面翻译 / 下一行字号', 'secondaryFontSize', 12, 48);
  addRange('main-secondary-size', '主窗口翻译字号', 'mainSecondaryFontSize', 10, 28);
  const sizeRow = document.createElement('div'); sizeRow.className = 'floating-size-row';
  sizeRow.innerHTML = '<p class="setting-description">解锁后可拖动桌面歌词左右边缘拉宽，右下角调整宽高；松开鼠标应用并保存。</p><div class="theme-custom"><label for="floating-width">宽度</label><input id="floating-width" type="number" min="320" max="7680" step="20"><label for="floating-height">高度</label><input id="floating-height" type="number" min="120" max="1200" step="10"><button id="floating-size-apply" class="subtle-button">应用尺寸</button></div>';
  section.append(sizeRow);
  $('floating-size-apply').onclick = () => act(() => call('floating-size', { width: Number($('floating-width').value), height: Number($('floating-height').value) }));
  const performance = document.createElement('section'); performance.className = 'settings-section';
  performance.innerHTML = '<h2>播放与资源占用</h2><label class="setting-row"><span>仅听音频<small>隐藏视频画面，保留 B 站播放器声音</small></span><input id="setting-audio-only" type="checkbox"></label><label class="setting-row"><span>省资源模式<small>减少后台网页绘制、隐藏音乐页弹幕，歌词以 30 帧平滑显示</small></span><input id="low-resource" type="checkbox" checked></label><p class="setting-description">隐藏画面不等于只下载音频。彻底释放视频解码与网页内存，请使用“关闭视频”。音轨由原视频和账号权限决定。</p>';
  document.querySelector('.settings-grid').append(performance);
  for (const [id, key] of [['setting-audio-only', 'audioOnly'], ['low-resource', 'lowResource']]) $(id).onchange = () => act(() => call('settings', { [key]: $(id).checked }));
  const star = lyricStarButton(undefined, false, '当前歌词'); star.id = 'favorite-current-lyrics';
  document.querySelector('.lyrics-heading>div').append(star);
}
function lyricStarButton(id, starred, name) {
  const button = document.createElement('button'); button.className = 'lyric-star'; button.innerHTML = icon('star');
  button.classList.toggle('active', starred); button.setAttribute('aria-pressed', String(starred));
  button.dataset.trackId = id ?? 'current';
  button.setAttribute('aria-label', (starred ? '取消收藏歌词：' : '收藏歌词：') + name);
  button.title = starred ? '取消收藏此版本' : '收藏并使用此版本，下次播放该视频直接调用';
  button.onclick = () => act(async () => {
    button.disabled = true;
    try { const r = await call('lyric-favorite', id); toast(r.favorite ? '歌词已收藏，下次播放此视频直接调用' : '已取消歌词收藏'); }
    finally { button.disabled = false; }
  });
  return button;
}
function renderLyricFavoriteControls(s) {
  const button = $('favorite-current-lyrics'); button.disabled = !s.media.key || !s.rows.length;
  button.classList.toggle('active', s.currentLyricsStarred); button.setAttribute('aria-pressed', String(s.currentLyricsStarred));
  button.setAttribute('aria-label', s.currentLyricsStarred ? '取消收藏当前歌词' : '收藏当前歌词');
  button.title = s.currentLyricsStarred ? '已收藏此版本，点击取消收藏' : '收藏当前歌词、双语和偏移，下次直接调用';
}
function renderFeatureSettings(s) {
  renderQueue(s);
  renderImmersive(s);
  setValue('floating-width', s.settings.floatingWidth || 900); setValue('floating-height', s.settings.floatingHeight || 200);
  renderSources(s);
  renderTheme(s.settings.themeColor);
  for (const [id, key] of [['secondary-size', 'secondaryFontSize'], ['main-secondary-size', 'mainSecondaryFontSize'], ['setting-audio-only', 'audioOnly'], ['low-resource', 'lowResource']]) setValue(id, s.settings[key]);
  $('secondary-size-value').value = s.settings.secondaryFontSize; $('main-secondary-size-value').value = s.settings.mainSecondaryFontSize;
  document.documentElement.style.setProperty('--main-translation-size', s.settings.mainSecondaryFontSize + 'px');
  $('audio-only').textContent = s.settings.audioOnly ? '显示视频' : '仅听音频';
  $('audio-quality').disabled = !s.media.key; $('quality-refresh').disabled = !s.media.key;
  $('audio-only').classList.toggle('selected', s.settings.audioOnly); $('close-video').disabled = !s.media.key;
  $('history-clear').disabled = !s.history.length;
  for (const value of ['list', 'grid']) $('history-layout-' + value).classList.toggle('enabled', s.settings.libraryLayout === value);
}
function renderClock(clock) {
  renderImmersiveClock(clock);
  if (!state) return;
  const metadata = state.media; Object.assign(state, clock); state.media = { ...metadata, ...clock.media };
  const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
  text('current-time', BanCi.formatTime(clock.media.time)); text('duration', BanCi.formatTime(clock.media.duration));
  if (document.activeElement !== $('seek')) $('seek').value = clock.media.duration ? clock.media.time / clock.media.duration * 1000 : 0;
  setValue('volume', clock.media.volume * 100); setValue('rate', clock.media.rate || 1);
  if ($('play').dataset.paused !== String(clock.media.paused)) { $('play').dataset.paused = clock.media.paused; $('play').innerHTML = icon(clock.media.paused ? 'play' : 'pause'); $('play').setAttribute('aria-label', clock.media.paused ? '播放' : '暂停'); }
  if (page === 'listen' && clock.index !== lastIndex) {
    $('lyrics-lines').children[lastIndex]?.classList.remove('current'); lastIndex = clock.index;
    const row = $('lyrics-lines').children[clock.index];
    if (row) { row.classList.add('current'); $('lyrics-scroll').scrollTo({ top: row.offsetTop - $('lyrics-scroll').clientHeight / 2 + row.clientHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  }
}
function videoCard(item, removable) {
  const article = document.createElement('article'); article.className = 'history-card';
  const button = document.createElement('button'); button.className = 'history-play'; button.disabled = !item.url;
  if (item.cover) { const image = document.createElement('img'); image.src = item.cover; image.alt = ''; image.loading = 'lazy'; button.append(image); }
  else { const art = document.createElement('div'); art.className = 'history-art'; art.innerHTML = icon('disc'); button.append(art); }
  const description = document.createElement('div'); description.className = 'card-description';
  const name = document.createElement('strong'); name.textContent = item.title; description.append(name);
  const info = document.createElement('small'); info.textContent = item.author || (removable ? '点击继续播放' : item.url ? BanCi.formatTime(item.duration) : '视频失效或暂不支持'); description.append(info); button.append(description);
  button.onclick = () => act(() => call('open-play', item.url)); article.append(button);
  if (removable) {
    const remove = featureButton('×', () => act(async () => { await call('history-remove', item.url); toast('已删除这条播放记录', () => call('history-undo')); }), 'history-remove');
    remove.setAttribute('aria-label', '删除播放记录'); remove.title = '删除播放记录'; article.append(remove);
  }
  const add = featureButton('', () => act(async () => { const r = await call('queue-add', item); toast(r.added ? '已添加到歌曲列表' : '歌曲已在列表中'); }), 'card-queue-add'); add.innerHTML = icon('add-list'); add.title = '添加到歌曲列表'; add.setAttribute('aria-label', add.title); add.disabled = !item.url; article.append(add);
  return article;
}
function renderHistory(s) {
  const signature = JSON.stringify([s.history, s.settings.libraryLayout]); if (signature === historySignature) return;
  historySignature = signature; $('history-list').replaceChildren(); $('history-list').classList.toggle('list-view', s.settings.libraryLayout === 'list');
  if (!s.history.length) { const empty = document.createElement('p'); empty.className = 'history-empty'; empty.textContent = '还没有最近播放。在 B 站打开一首歌，它就会留在这里。'; $('history-list').append(empty); }
  s.history.forEach(item => $('history-list').append(videoCard(item, true)));
}
function renderProfile(b) {
  const next = b.profile || { loggedIn: b.loggedIn, name: '', avatar: '', mid: 0 };
  if (accountInfo.mid !== next.mid) { favoriteLoaded = false; favoriteItems = []; favoriteSeq++; $('favorite-list').replaceChildren(); $('favorite-folder').replaceChildren(new Option('请选择收藏夹', '')); $('favorite-more').hidden = true; }
  accountInfo = next;
  $('login-text').textContent = next.name || (next.loggedIn ? '账号资料待刷新' : '登录 B 站'); $('login').title = b.profileError || next.name || '登录 B 站';
  const image = $('profile-avatar'); image.hidden = !next.avatar; if (next.avatar && image.src !== next.avatar) image.src = next.avatar;
  $('favorite-login').hidden = !!next.loggedIn;
}
function renderAudio(audio) {
  if (!audio) { $('audio-quality').replaceChildren(new Option('标准音质', 'standard')); $('quality-note').textContent = '打开视频后读取可用音轨'; return; }
  $('audio-quality').replaceChildren(...audio.options.map(o => { const option = new Option(o.label + (o.available ? '' : '（不可用）'), o.id); option.disabled = !o.available; return option; }));
  $('audio-quality').value = audio.current; $('quality-note').textContent = audio.note; $('quality-note').title = audio.note;
}
async function loadFavorites(force = false) {
  if (favoriteBusy || favoriteLoaded && !force) return;
  favoriteBusy = true; $('favorite-status').textContent = '正在读取账号收藏夹…';
  try {
    const r = await call('favorite-folders'); $('favorite-folder').replaceChildren();
    r.folders.forEach(f => $('favorite-folder').append(new Option(`${f.title}（${f.count}）`, f.id)));
    favoriteLoaded = true;
    if (r.folders.length) await loadFavoriteVideos(false);
    else { $('favorite-status').textContent = '这个账号还没有收藏夹'; $('favorite-list').replaceChildren(); }
  } catch (e) { $('favorite-status').textContent = e.message; }
  finally { favoriteBusy = false; }
}
async function loadFavoriteVideos(append) {
  const folder = $('favorite-folder').value; if (!/^\d+$/.test(folder)) return;
  const seq = ++favoriteSeq, next = append ? favoritePage + 1 : 1;
  $('favorite-status').textContent = '正在读取收藏视频…'; $('favorite-more').disabled = true;
  try {
    const r = await call('favorite-videos', { folder, page: next }); if (seq !== favoriteSeq) return;
    favoritePage = next; favoriteItems = append ? [...favoriteItems, ...r.result.items] : r.result.items; favoriteMore = r.result.hasMore;
    $('favorite-list').replaceChildren(...favoriteItems.map(item => videoCard(item, false)));
    $('favorite-more').hidden = !favoriteMore; $('favorite-status').textContent = `已加载 ${favoriteItems.length} 个视频，点击即可播放`;
  } catch (e) { if (seq === favoriteSeq) $('favorite-status').textContent = e.message; }
  finally { $('favorite-more').disabled = false; }
}
