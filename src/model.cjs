const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const B = require('./shared/core');
const sources = require('./shared/source-catalog');
const { SongQueue } = require('./song-queue.cjs');
const defaults = { source: 'auto', bilingual: true, autoSearch: true, floating: false, locked: false, floatingBackground: true, fontSize: 34, secondaryFontSize: 20, mainSecondaryFontSize: 12, audioOnly: false, lowResource: true, libraryLayout: 'grid', color: '#86e6ff', opacity: .92 };
class PlayerModel extends EventEmitter {
  constructor(providers, saved = {}, save = () => {}) {
    super(); this.providers = providers; this.save = save;
    this.settings = { ...defaults, ...saved.settings, themeColor: /^#[\da-f]{6}$/i.test(saved.settings?.themeColor || '') ? saved.settings.themeColor : '#f43f55' };
    this.history = Array.isArray(saved.history) ? saved.history.slice(0, 30) : [];
    this.library = saved.library || {};
    this.lyricFavorites = saved.lyricFavorites || {};
    this.queue = new SongQueue(saved.queue, () => { this.persist(); this.publish(); });
    this.media = { title: '', url: '', key: '', time: 0, duration: 0, paused: true, volume: 1, cover: '' };
    this.rows = []; this.translations = []; this.candidates = []; this.track = null; this.offset = 0;
    this.searching = false; this.searchQuery = ''; this.sourceResults = [];
    this.status = '打开 B 站视频，歌词会自动跟上'; this.generation = 0; this.request = 0; this.manual = false;
  }
  publish() { this.emit('state', this.snapshot()); }
  clock() {
    const time = this.media.time - this.offset, frame = B.frameAt(this.rows, time), index = B.indexAt(this.rows, time);
    const row = this.rows[index], next = this.rows[index + 1], parts = frame.text.split('\n');
    return { media: { time: this.media.time, duration: this.media.duration, paused: this.media.paused, rate: this.media.rate || 1, volume: this.media.volume, key: this.media.key },
      text: parts[0] || '', translation: this.settings.bilingual ? B.lineAt(this.translations, time) || parts.slice(1).join('\n') : '',
      nextText: frame.nextText.split('\n')[0], progress: frame.progress, index, lyricTime: time,
      lineStart: row?.time ?? 0, lineEnd: row?.end ?? next?.time ?? Math.max(time, this.media.duration - this.offset) };
  }
  snapshot() {
    const clock = this.clock();
    return { media: this.media, settings: this.settings, queue: this.queue.snapshot(), history: this.history, rows: this.rows, translations: this.translations,
      track: this.track, candidates: this.candidates.map(({ syncedLyrics, translatedLyrics, plainLyrics, ...t }) => ({ ...t, timed: !!syncedLyrics })),
      offset: this.offset, status: this.status,
      searching: this.searching, searchQuery: this.searchQuery, sourceResults: this.sourceResults,
      lyricFavoriteId: this.lyricFavorites[this.media.key]?.track?.id ?? null,
      currentLyricsStarred: !!this.track?.id && this.lyricFavorites[this.media.key]?.track?.id === this.track.id,
      ...clock, media: this.media };
  }
  persist() {
    if (this.media.key && this.rows.length) {
      delete this.library[this.media.key];
      this.library[this.media.key] = { rows: this.rows, translations: this.translations, track: this.track, offset: this.offset, manual: this.manual };
      const favorite = this.lyricFavorites[this.media.key];
      if (favorite && this.track?.id === favorite.track?.id) {
        this.lyricFavorites[this.media.key] = { ...favorite, rows: this.rows, translations: this.translations, track: this.track, offset: this.offset };
      }
    }
    while (Object.keys(this.library).length > 40 || Buffer.byteLength(JSON.stringify(this.library)) > 7000000) delete this.library[Object.keys(this.library)[0]];
    this.save(this.savedState());
  }
  savedState() { return { settings: this.settings, history: this.history, library: this.library, lyricFavorites: this.lyricFavorites, queue: this.queue.snapshot() }; }
  reset(status = '正在打开 B 站页面…') {
    this.generation++; this.request++; clearTimeout(this.timer);
    this.rows = []; this.translations = []; this.candidates = []; this.track = null; this.offset = 0; this.manual = false;
    this.searching = false; this.searchQuery = ''; this.sourceResults = [];
    this.media = { ...this.media, key: '', title: '', paused: true, time: 0, duration: 0, cover: '' };
    this.status = status; this.publish();
  }
  updateMedia(media) {
    if (!media.key || !media.title) return;
    const changed = media.key !== this.media.key || media.title !== this.media.title;
    const metadataChanged = media.cover !== undefined && media.cover !== this.media.cover;
    if (changed) this.reset('视频已切换，正在寻找这首歌…');
    this.media = { ...this.media, ...media };
    this.queue.syncMedia(this.media);
    if (changed) {
      const g = this.generation;
      this.timer = setTimeout(async () => {
        if (g !== this.generation) return;
        this.history = [{ title: this.media.title, url: this.media.url, cover: this.media.cover }, ...this.history.filter(h => h.url !== this.media.url)].slice(0, 30);
        const favorite = this.lyricFavorites[this.media.key];
        const saved = favorite || this.library[this.media.key];
        if (saved && (favorite || saved.manual || !this.settings.autoSearch)) {
          this.rows = saved.rows || []; this.translations = saved.translations || []; this.track = saved.track;
          this.offset = saved.offset || 0; this.manual = true; this.status = favorite ? '已调用收藏歌词 · ' + (saved.track?.source || '本地字幕') : '已恢复这首歌的字幕'; this.publish();
        } else if (this.settings.autoSearch) await this.search(B.cleanTitle(this.media.title));
        else { this.status = '自动匹配已关闭，可搜索或导入字幕'; this.publish(); }
        this.persist();
      }, 650);
    }
    if (changed || metadataChanged) this.publish(); else this.emit('clock', this.clock());
  }
  current(g, r) { return g === this.generation && r === this.request; }
  async searchSource(source, query, refresh = false) {
    if (!sources.some(s => s.id === source)) throw new Error('未知歌词源。');
    this.configure({ source }, false);
    query = String(query || this.searchQuery || B.cleanTitle(this.media.title)).trim().slice(0, 160);
    if (query) await this.search(query, { refresh });
    else if (refresh) this.providers.clearCache?.(source);
  }
  async search(query, { refresh = false } = {}) {
    clearTimeout(this.timer);
    const g = this.generation, r = ++this.request;
    this.searchQuery = String(query).trim().slice(0, 160); query = this.searchQuery;
    this.searching = true; this.candidates = []; this.sourceResults = [];
    this.status = (refresh ? '正在刷新' : '正在搜索') + (sources.find(s => s.id === this.settings.source)?.name || '歌词源') + '…'; this.publish();
    try {
      if (refresh) this.providers.clearCache?.(this.settings.source);
      const result = await this.providers.search(String(query).slice(0, 160), this.settings.source);
      if (!this.current(g, r)) return;
      this.sourceResults = result.sourceResults || [];
      this.candidates = B.rankTracks(result.tracks, query, this.media.duration, this.media.title || query);
      const failures = {}; let lastError = '';
      for (const candidate of this.candidates) {
        if (!this.current(g, r)) return;
        if ((!candidate.syncedLyrics && !candidate.lyricsPending) || failures[candidate.provider] >= 2) continue;
        const pending = !!candidate.lyricsPending;
        try {
          if (await this.choose(candidate.id, false, g, r)) {
            if (this.current(g, r) && result.warnings?.length) { this.status += ' · ' + result.warnings.join('；'); this.publish(); }
            return;
          }
        } catch (e) { lastError = e.message; if (pending) failures[candidate.provider] = (failures[candidate.provider] || 0) + 1; }
      }
      if (this.current(g, r)) { this.status = '没有可用时间轴，试试简化歌名，或导入字幕。' + (lastError || (result.warnings || []).join('；')); this.publish(); }
    } catch (e) { if (this.current(g, r)) { this.sourceResults = e.sourceResults || []; this.status = e.message; this.publish(); } }
    finally { if (this.current(g, r)) { this.searching = false; this.publish(); } }
  }
  async choose(id, manual = true, g = this.generation, r = this.request) {
    if (manual) { r = ++this.request; clearTimeout(this.timer); this.searching = false; }
    const selected = this.candidates.find(c => c.id === id);
    if (!selected) throw new Error('歌曲候选已过期，请重新搜索。');
    if (selected.lyricsPending) {
      const lyrics = await this.providers.resolve(selected.provider, selected.remoteId);
      if (!this.current(g, r)) return false;
      Object.assign(selected, lyrics);
    }
    if (!this.current(g, r)) return false;
    const rows = B.parseLyrics(selected.syncedLyrics);
    let translated = [];
    if (selected.translatedLyrics) { try { translated = B.parseLyrics(selected.translatedLyrics); } catch {} }
    const offset = this.track?.id === selected.id ? this.offset : 0;
    this.rows = rows; this.translations = translated; this.manual = manual;
    this.track = { id: selected.id, title: selected.trackName, artist: selected.artistName, source: selected.source, score: selected.score };
    this.offset = offset;
    this.status = `已${manual ? '切换' : '自动匹配'} · ${selected.source}${selected.score < 50 ? ' · 匹配度较低，可更换版本' : ''}`;
    this.persist(); this.publish(); return true;
  }
  import(text, translation = false, name = '自定义字幕') {
    const rows = B.parseLyrics(text);
    this.request++; clearTimeout(this.timer); this.manual = true; this.searching = false;
    if (translation) this.translations = rows;
    else { this.rows = rows; this.translations = []; this.offset = 0; this.track = { title: name, artist: '自定义字幕', source: '本地导入' }; }
    this.status = translation ? '双语翻译轨已载入' : '自定义字幕已载入'; this.persist(); this.publish();
  }
  setOffset(value) {
    if (!Number.isFinite(value)) throw new Error('请输入有效的偏移秒数');
    this.offset = Math.max(-3600, Math.min(3600, value)); this.persist(); this.publish();
  }
  align(index) {
    if (!this.rows[index]) throw new Error('先选择要对齐的歌词');
    this.setOffset(this.media.time - this.rows[index].time);
  }
  async toggleLyricFavorite(id) {
    if (!this.media.key) throw new Error('请先打开视频，再收藏对应歌词');
    const currentId = id ?? this.track?.id;
    const existing = this.lyricFavorites[this.media.key];
    if (existing && existing.track?.id === currentId) {
      delete this.lyricFavorites[this.media.key]; this.status = '已取消歌词收藏'; this.persist(); this.publish(); return false;
    }
    const key = this.media.key, generation = this.generation;
    if (id !== undefined && id !== this.track?.id) {
      if (!await this.choose(id)) throw new Error('视频已切换，请重新收藏歌词');
    }
    if (generation !== this.generation || key !== this.media.key) throw new Error('视频已切换，请重新收藏歌词');
    if (!this.rows.length || !this.track) throw new Error('请先匹配或导入带时间轴的歌词');
    if (!this.track.id) this.track = { ...this.track, id: 'local:' + createHash('sha256').update(JSON.stringify(this.rows)).digest('hex').slice(0, 20) };
    const entry = { rows: this.rows, translations: this.translations, track: this.track, offset: this.offset,
      title: this.media.title, url: this.media.url, savedAt: Date.now() };
    const next = { ...this.lyricFavorites, [key]: entry };
    if (Buffer.byteLength(JSON.stringify(next)) > 20000000) throw new Error('收藏歌词已超过 20 MB，请先取消部分收藏');
    this.lyricFavorites = next; this.manual = true;
    this.status = '已收藏歌词 · 下次播放此视频直接调用'; this.persist(); this.publish(); return true;
  }
  configure(update, search = true) {
    const old = this.settings;
    const next = { ...old };
    for (const key of ['bilingual', 'autoSearch', 'floating', 'locked', 'floatingBackground', 'audioOnly', 'lowResource']) if (typeof update[key] === 'boolean') next[key] = update[key];
    if (sources.some(s => s.id === update.source)) next.source = update.source;
    if (Number.isFinite(update.fontSize)) next.fontSize = Math.max(20, Math.min(64, update.fontSize));
    if (Number.isFinite(update.secondaryFontSize)) next.secondaryFontSize = Math.max(12, Math.min(48, update.secondaryFontSize));
    if (Number.isFinite(update.mainSecondaryFontSize)) next.mainSecondaryFontSize = Math.max(10, Math.min(28, update.mainSecondaryFontSize));
    if (Number.isFinite(update.floatingWidth)) next.floatingWidth = Math.round(Math.max(320, Math.min(7680, update.floatingWidth)));
    if (Number.isFinite(update.floatingHeight)) next.floatingHeight = Math.round(Math.max(120, Math.min(1200, update.floatingHeight)));
    if (['grid', 'list'].includes(update.libraryLayout)) next.libraryLayout = update.libraryLayout;
    if (['light', 'dark', 'system'].includes(update.appearance)) next.appearance = update.appearance;
    if (/^#[\da-f]{6}$/i.test(update.color || '')) next.color = update.color;
    if (/^#[\da-f]{6}$/i.test(update.themeColor || '')) next.themeColor = update.themeColor.toLowerCase();
    if (Number.isFinite(update.opacity)) next.opacity = Math.max(.3, Math.min(1, update.opacity));
    this.settings = next;
    if (old.autoSearch && !next.autoSearch) { this.request++; clearTimeout(this.timer); this.searching = false; this.status = '自动匹配已关闭，可手动搜索或导入字幕'; }
    this.persist(); this.publish();
    if (old.autoSearch && !next.autoSearch) return;
    else if (search && this.media.title && (old.source !== next.source || !old.autoSearch && next.autoSearch)) this.search(B.cleanTitle(this.media.title));
  }
  removeHistory(url) {
    this.historyUndo = this.history.slice(); this.history = this.history.filter(h => h.url !== url); this.persist(); this.publish();
  }
  clearHistory() { this.historyUndo = this.history.slice(); this.history = []; this.persist(); this.publish(); }
  undoHistory() { if (this.historyUndo) { this.history = this.historyUndo; this.historyUndo = null; this.persist(); this.publish(); } }
}
module.exports = { PlayerModel, defaults };
