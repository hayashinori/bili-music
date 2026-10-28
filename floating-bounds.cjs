function homeBounds(area, size = {}) {
  const width = Math.max(280, Math.min(size.width || 900, area.width - 32));
  const height = Math.min(size.height || 200, area.height - 24);
  return { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + area.height - height - 36) };
}
function clampBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width - 16), height = Math.min(bounds.height, area.height - 16);
  return { width, height, x: Math.max(area.x + 8, Math.min(bounds.x, area.x + area.width - width - 8)),
    y: Math.max(area.y + 8, Math.min(bounds.y, area.y + area.height - height - 8)) };
}
function sizedBounds(bounds, area, size) {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) throw new Error('请输入有效的歌词框尺寸');
  const width = Math.round(Math.min(Math.max(320, size.width), area.width - 16));
  const height = Math.round(Math.min(Math.max(120, size.height), area.height - 16, 1200));
  return clampBounds({ x: size.anchor === 'right' ? bounds.x + bounds.width - width : bounds.x, y: bounds.y, width, height }, area);
}
module.exports = { homeBounds, clampBounds, sizedBounds };
