const { ipcRenderer } = require('electron');
// Runs in an isolated world. No host API is exposed to the Bilibili page.
let metadata = {}, metaAt = 0, lastReport = '', mediaElement = null, videoAt = 0, timer = 0;
function report() {
  const now = Date.now();
  const p = new URLSearchParams(location.search).get('p');
  const key = location.pathname + (p ? '?p=' + p : '');
  if (!mediaElement?.isConnected || key !== metadata.key || now - videoAt >= 1200) {
    const videos = [...document.querySelectorAll('video')];
    mediaElement = videos.find(v => v.duration > 0 && !v.paused && !v.ended) || videos.find(v => v.duration > 0) || videos[0]; videoAt = now;
  }
  const video = mediaElement;
  if (!video || !/^\/(video\/|bangumi\/play\/)/.test(location.pathname)) return;
  if (key !== metadata.key || now - metaAt >= 2000) {
    const part = document.querySelector('.video-pod__item.active .title-txt,.video-pod__item.active .title,.list-box li.on .part');
    const heading = document.querySelector('h1.video-title,h1[title],.media-title');
    const title = (p && part?.textContent?.trim()) || heading?.getAttribute('title') || heading?.textContent?.trim() || document.title.replace(/_哔哩哔哩.*/, '');
    metadata = { title: (title || '').slice(0, 300), key, url: location.href, cover: document.querySelector('meta[property="og:image"]')?.content || '' }; metaAt = now;
  }
  if (!metadata.title || metadata.title === '哔哩哔哩') return;
  const data = { ...metadata,
    time: video.currentTime || 0, duration: Number.isFinite(video.duration) ? video.duration : 0,
    paused: video.paused, ended: video.ended, volume: video.volume, rate: video.playbackRate };
  const signature = JSON.stringify(data); if (signature === lastReport) return;
  lastReport = signature; ipcRenderer.send('guest:media', data);
}
function tick() {
  clearTimeout(timer); report(); timer = setTimeout(tick, mediaElement && !mediaElement.paused && !mediaElement.ended ? 400 : 1000);
}
addEventListener('DOMContentLoaded', tick); addEventListener('pageshow', tick);
addEventListener('pagehide', () => clearTimeout(timer));
for (const event of ['play', 'pause', 'seeked', 'ratechange', 'volumechange', 'ended', 'loadedmetadata', 'durationchange']) document.addEventListener(event, tick, true);
