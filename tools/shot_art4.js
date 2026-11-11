/* 临时特写 v3：reload → startRaid → 清敌 → 装枪 → 传送 → 关雾 → 全屏 + 抠特写 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const getJson = url => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(300);
  const targets = await getJson('http://127.0.0.1:9222/json');
  const page = targets.find(t => t.type === 'page' && t.url.includes('index.html'));
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = {};
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending[mid] = { res, rej };
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending[m.id]) { pending[m.id].res(m.result); delete pending[m.id]; }
  });
  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 300) };
    return r.result.value;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', name), Buffer.from(r.data, 'base64'));
    console.log('shot ->', name);
  };

  await send('Page.reload', { ignoreCache: true });
  await sleep(2200);
  await shot('art-lobby.png');
  console.log('raid=', await ev("(()=>{try{ startRaid(); return G.scene; }catch(e){ return 'ERR '+e.message }})()"));
  await sleep(1600);
  console.log('prep=', await ev("(()=>{try{ G.enemies.length=0; G.bullets.length=0; P.hp=P.maxHp; P.alive=true; P.invuln=99999; P.slots.primary='ak'; P.weapon='ak'; P.curSlot='primary'; FOG.seen.fill(1); FOG.vis.fill(1); FOG.cx.putImageData=function(){}; FOG.cx.canvas.width=FOG.cx.canvas.width; const o=G.obstacles[Math.floor(G.obstacles.length/2)]; P.x=o.x-100; P.y=o.y+80; G.cam.x=P.x-VW/ZOOM/2+52; G.cam.y=P.y-VH/ZOOM/2+38; return 'ok '+(o.x)+','+(o.y); }catch(e){ return 'ERR '+e.message }})()"));
  await sleep(500);
  await ev("(()=>{try{ P.hp=P.maxHp; FOG.cx.canvas.width=FOG.cx.canvas.width; }catch(e){}})()");
  await shot('art-scene.png');

  const r = await ev(`(()=>{try{
    const px = (P.x - G.cam.x) * ZOOM, py = (P.y - G.cam.y) * ZOOM;
    const cv = document.getElementById('game');
    const c2 = document.createElement('canvas');
    c2.width = 640; c2.height = 480;
    const g = c2.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, px - 160, py - 120, 320, 240, 0, 0, 640, 480);
    return c2.toDataURL('image/png');
  }catch(e){ return 'ERR ' + e.message }})()`);
  if (typeof r === 'string' && r.startsWith('data:image')) {
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', 'art-zoom.png'), Buffer.from(r.split(',')[1], 'base64'));
    console.log('shot -> art-zoom.png');
  } else console.log('zoom failed:', r);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
