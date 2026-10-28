const { resolveInput } = require('./navigation.cjs');
function videoURL(input) {
  const u = new URL(resolveInput(input));
  if (!/(^|\.)bilibili\.com$/.test(u.hostname) || !/^\/(video\/BV[\da-zA-Z]{10}|bangumi\/play\/(ep|ss)\d+)\/?$/.test(u.pathname)) throw new Error('请使用完整 B 站视频链接或 BV 号');
  const p = Number(u.searchParams.get('p'));
  return 'https://www.bilibili.com' + u.pathname.replace(/\/$/, '') + '/' + (Number.isInteger(p) && p > 1 && p <= 10000 ? '?p=' + p : '');
}
class SongQueue {
  constructor(saved = {}, changed = () => {}) {
    this.items = []; this.changed = changed; this.mode = ['order', 'list', 'one'].includes(saved.mode) ? saved.mode : 'order';
    for (const item of (Array.isArray(saved.items) ? saved.items : []).slice(0, 500)) { try { const clean = this.clean(item); if (!this.items.some(t => t.id === clean.id)) this.items.push(clean); } catch {} }
    this.currentId = String(saved.currentId || ''); this.cursor = Number.isInteger(saved.cursor) ? saved.cursor : -1;
  }
  clean(item) {
    const url = videoURL(item?.url || ''); let cover = '';
    try { const u = new URL(item.cover); if (u.protocol === 'https:' && u.hostname.endsWith('.hdslb.com')) cover = u.href; } catch {}
    return { id: url, url, title: String(item.title || new URL(url).pathname.split('/')[2]).slice(0, 300), cover };
  }
  snapshot() { return { items: this.items, mode: this.mode, currentId: this.currentId, cursor: this.cursor }; }
  add(item) {
    const clean = this.clean(item); if (this.items.some(t => t.id === clean.id)) return false;
    if (this.items.length >= 500) throw new Error('歌曲列表最多保存 500 首');
    this.items.push(clean); this.lastMedia = null; this.changed(); return true;
  }
  remove(id) {
    const index = this.items.findIndex(t => t.id === id); if (index < 0) return;
    if (this.currentId === id) { this.currentId = ''; this.cursor = index - 1; }
    this.items.splice(index, 1); this.lastMedia = null; this.changed();
  }
  reorder(ids) {
    if (!Array.isArray(ids) || ids.length !== this.items.length || new Set(ids).size !== ids.length || ids.some(id => !this.items.some(t => t.id === id))) throw new Error('列表已变化，请重新拖动排序');
    const byId = new Map(this.items.map(t => [t.id, t])); this.items = ids.map(id => byId.get(id)); this.changed();
  }
  setMode(mode) { if (!['order', 'list', 'one'].includes(mode)) throw new Error('未知循环模式'); this.mode = mode; this.changed(); }
  select(id) { const index = this.items.findIndex(t => t.id === id); if (index < 0) throw new Error('歌曲已从列表移除'); this.currentId = id; this.cursor = index; this.changed(); return this.items[index]; }
  syncMedia(media) {
    const old = this.lastMedia;
    if (old && old.url === media.url && old.title === media.title && old.cover === media.cover && old.id === this.currentId && old.items === this.items) return;
    let url; try { url = videoURL(media.url); } catch { return; }
    const index = this.items.findIndex(t => t.id === url);
    this.lastMedia = { url: media.url, title: media.title, cover: media.cover, id: index < 0 ? this.currentId : url, items: this.items };
    if (index < 0) return;
    const item = this.items[index], changed = this.currentId !== item.id || media.title && media.title !== item.title || media.cover && media.cover !== item.cover;
    this.currentId = item.id; this.cursor = index;
    if (media.title) item.title = media.title; if (media.cover) item.cover = media.cover;
    if (changed) this.changed();
  }
  next(currentURL, direction = 1, automatic = false) {
    if (automatic && this.mode === 'one') return { repeat: true };
    if (!this.items.length) return null;
    let id; try { id = videoURL(currentURL); } catch {}
    let index = this.items.findIndex(t => t.id === id);
    if (index < 0) index = this.currentId ? this.items.findIndex(t => t.id === this.currentId) : this.cursor;
    let next = index + (direction < 0 ? -1 : 1);
    if (index < 0) next = direction < 0 ? this.items.length - 1 : Math.max(0, next);
    if (automatic && this.mode === 'order' && next >= this.items.length) return null;
    next = (next + this.items.length) % this.items.length;
    return this.items[next];
  }
}
module.exports = { SongQueue, videoURL };
