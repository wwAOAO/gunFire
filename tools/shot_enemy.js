/* 临时：敌人涂装验收 —— 把各兵种摆在玩家面前拍特写 */
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
  let id = 0; const pending = {};
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending[mid] = res; ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } });
  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 240);
    return r.result.value;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', name), Buffer.from(r.data, 'base64'));
    console.log('shot ->', name);
  };

  await send('Page.reload', { ignoreCache: true });
  await sleep(2200);
  console.log('raid=', await ev("(()=>{try{ startRaid(); return G.scene; }catch(e){ return 'ERR '+e.message }})()"));
  await sleep(1500);

  console.log('prep=', await ev(`(()=>{try{
    G.enemies.length = 0; G.bullets.length = 0; G.pickups.length = 0;
    P.hp = P.maxHp; P.alive = true; P.invuln = 99999;
    FOG.seen.fill(1); FOG.vis.fill(1);
    FOG.cx.putImageData = function(){}; FOG.cx.canvas.width = FOG.cx.canvas.width;

    /* 摆一排兵种：先扫一块没有掩体的空地，别让掩体挡镜头 */
    let ox = P.x - 170, oy = P.y - 170;
    outer:
    for (let ty = 200; ty < 2400; ty += 60) {
      for (let tx = 200; tx < 2400; tx += 60) {
        let clear = true;
        for (const o of G.obstacles) {
          if (tx - 200 < o.x + o.w + 60 && tx + 200 > o.x - 60 && ty - 160 < o.y + o.h + 60 && ty + 160 > o.y - 60) { clear = false; break; }
        }
        if (clear) { ox = tx; oy = ty; break outer; }
      }
    }
    const kinds = ['runner','shooter','nader','sniper','rocket','flamer','brute','cryo'];
    kinds.forEach((k, i) => {
      const e = spawnEnemy(k, ox + (i % 4) * 96, oy + Math.floor(i / 4) * 92, 'asara');
      e.state = 'idle'; e.alertMeter = 0; e.speed = 0; e.think = 0;
      e.aim = 0; e.hexAim = 0;
      if (e.shieldAim === undefined) e.shieldAim = Math.PI / 2;
    });
    G.enemies.forEach(e => { e.speed = 0; e.state = 'idle'; });
    window.__fo = { x: ox, y: oy };
    P.x = ox + 150; P.y = oy + 250;
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    return 'ok ' + G.enemies.length;
  }catch(e){ return 'ERR ' + e.message }})()`));
  await sleep(700);
  await ev(`(()=>{try{
    const O = window.__fo;
    const kinds = ['runner','shooter','nader','sniper','rocket','flamer','brute','cryo'];
    G.enemies.forEach((e, i) => { e.x = O.x + (i % 4) * 96; e.y = O.y + Math.floor(i / 4) * 92; e.speed = 0; e.aim = 0; e.hexAim = 0; });
    P.x = O.x + 150; P.y = O.y + 250;
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    FOG.cx.canvas.width = FOG.cx.canvas.width;
    return 'pinned ' + G.enemies.length;
  }catch(e){ return 'ERR ' + e.message }})()`);
  await shot('enemy-scene.png');

  const r = await ev(`(()=>{try{
    const O = window.__fo;
    const cv = document.getElementById('game');
    const bx = (O.x - 30 - G.cam.x) * ZOOM, by = (O.y - 30 - G.cam.y) * ZOOM;
    const c2 = document.createElement('canvas');
    c2.width = 1080; c2.height = 700;
    const g = c2.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, bx, by, 360, 230, 0, 0, 1080, 690);
    return c2.toDataURL('image/png');
  }catch(e){ return 'ERR ' + e.message }})()`);
  if (typeof r === 'string' && r.startsWith('data:image')) {
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', 'enemy-zoom.png'), Buffer.from(r.split(',')[1], 'base64'));
    console.log('shot -> enemy-zoom.png');
  } else console.log('zoom failed:', String(r).slice(0, 200));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
