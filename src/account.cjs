function imageURL(value) {
  try { const u = new URL(String(value).replace(/^http:/, 'https:')); return u.protocol === 'https:' && (u.hostname === 'hdslb.com' || u.hostname.endsWith('.hdslb.com')) ? u.href : ''; } catch { return ''; }
}
class BiliAccount {
  constructor(fetcher) { this.fetcher = fetcher; this.profile = null; this.at = 0; this.pending = null; }
  invalidate() { this.at = 0; this.profile = null; }
  async request(path, parameters = {}) {
    const url = 'https://api.bilibili.com' + path + '?' + new URLSearchParams(parameters);
    const response = await this.fetcher(url, { credentials: 'include', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`B站账号接口 HTTP ${response.status}`);
    const data = await response.json();
    if (data.code === -101) return { loggedOut: true };
    if (data.code !== 0) throw new Error(`B站接口返回 ${data.code}：${String(data.message || '请稍后重试').slice(0, 100)}`);
    return data.data;
  }
  async getProfile(force = false) {
    if (!force && this.profile && Date.now() - this.at < 60000) return this.profile;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const d = await this.request('/x/web-interface/nav');
      this.profile = d.loggedOut || !d.isLogin ? { loggedIn: false, name: '', avatar: '', mid: 0 } : {
        loggedIn: true, name: String(d.uname || '').slice(0, 80), avatar: imageURL(d.face), mid: Number(d.mid) || 0 };
      this.at = Date.now(); return this.profile;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async folders() {
    const p = await this.getProfile();
    if (!p.loggedIn || !p.mid) throw new Error('请先登录 B 站，再刷新收藏夹');
    const d = await this.request('/x/v3/fav/folder/created/list-all', { up_mid: p.mid, type: 2 });
    if (d.loggedOut) { this.invalidate(); throw new Error('登录已失效，请重新登录 B 站'); }
    return (d.list || []).map(x => ({ id: String(x.id), title: String(x.title || '').slice(0, 120), count: Number(x.media_count) || 0 }));
  }
  async videos(folder, page = 1) {
    if (!/^\d{1,20}$/.test(String(folder))) throw new Error('无效的收藏夹');
    const pn = Math.max(1, Math.min(10000, Number(page) || 1));
    const d = await this.request('/x/v3/fav/resource/list', { media_id: folder, pn, ps: 20, platform: 'web', order: 'mtime', type: 0 });
    if (d.loggedOut) throw new Error('请先登录 B 站');
    return { hasMore: !!d.has_more, page: pn, items: (d.medias || []).map(x => ({
      id: x.id, title: String(x.title || '已失效视频').slice(0, 300), cover: imageURL(x.cover),
      author: String(x.upper?.name || ''), duration: Number(x.duration) || 0,
      url: /^BV[\da-zA-Z]{10}$/.test(x.bvid || '') && x.type === 2 && !(Number(x.attr) & 1) ? `https://www.bilibili.com/video/${x.bvid}/` : '' })) };
  }
}
module.exports = { BiliAccount, imageURL };
