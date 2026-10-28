(function (root) {
  const sources = [
    { id: 'auto', name: '自动合并（全部源）' },
    { id: 'netease', name: '网易云音乐' },
    { id: 'qq', name: 'QQ 音乐' },
    { id: 'kugou', name: '酷狗音乐' },
    { id: 'lrclib', name: 'LRCLIB' }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = sources;
  else root.BanCiSources = sources;
})(globalThis);
