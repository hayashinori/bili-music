function allowedBilibili(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'bilibili.com' || u.hostname.endsWith('.bilibili.com') || u.hostname === 'b23.tv'); } catch { return false; }
}
function resolveInput(input) {
  const s = String(input || '').trim().slice(0, 500);
  if (!s) return 'https://www.bilibili.com/';
  const bv = s.match(/\bBV[0-9a-zA-Z]{10}\b/);
  if (bv && !/^https?:\/\//i.test(s)) return `https://www.bilibili.com/video/${bv[0]}/`;
  if (/^https?:\/\//i.test(s)) {
    if (!allowedBilibili(s)) throw new Error('请使用 HTTPS 的 B 站视频或 b23.tv 链接');
    return new URL(s).href;
  }
  return 'https://search.bilibili.com/all?' + new URLSearchParams({ keyword: s });
}
module.exports = { allowedBilibili, resolveInput };
