const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('暂停减少轮询，播放/跳转/结束即时报告，缓存视频并恢复SPA探测', () => {
  let now = 10000, scans = 0, next = 0; const timers = new Map(), events = {}, messages = [];
  const video = { isConnected:true, duration:100, currentTime:0, paused:true, ended:false, volume:1, playbackRate:1 };
  const location = { pathname:'/video/BV1xx411c7mD/', search:'', href:'https://www.bilibili.com/video/BV1xx411c7mD/' };
  const document = { title:'歌曲', querySelectorAll:() => { scans++; return [video]; }, querySelector:selector => selector.includes('h1') ? { getAttribute:()=> '歌曲' } : null, addEventListener:(type,fn)=>events[type]=fn };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/guest-preload.cjs'),'utf8'), { require:()=>({ipcRenderer:{send:(_,data)=>messages.push(data)}}), document, location, URLSearchParams, Date:{now:()=>now}, addEventListener:(type,fn)=>events[type]=fn, setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id}, clearTimeout:id=>timers.delete(id) });
  events.DOMContentLoaded(); assert.equal(messages.length,1); assert.equal([...timers.values()][0].delay,1000);
  video.paused=false;events.play();assert.equal(messages.at(-1).paused,false);assert.equal([...timers.values()][0].delay,400);
  const before=scans;
  for(let i=0;i<3;i++){now+=400;video.currentTime+=.4;const t=[...timers.values()][0];t.fn();}
  assert.equal(scans-before,1,'Three clock reports require only one additional video DOM scan');
  video.paused=true;events.pause();assert.equal([...timers.values()][0].delay,1000);
  const count=messages.length;events.pause();assert.equal(messages.length,count,'Duplicate state is not resent');
  video.currentTime=50;events.seeked();assert.equal(messages.at(-1).time,50);
  video.currentTime=100;video.ended=true;events.ended();assert.equal(messages.at(-1).ended,true);
  location.pathname='/video/BV2xx411c7mD/';location.href='https://www.bilibili.com'+location.pathname;now+=1000;[...timers.values()][0].fn();assert.match(messages.at(-1).key,/BV2/);
  events.pagehide();assert.equal(timers.size,0);
});
