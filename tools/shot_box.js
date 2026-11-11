/* 临时：容器涂装验收 —— 把六种箱子摆成一排拍全屏 + 3x 特写 */
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
    P.slots.primary = 'ak'; P.weapon = 'ak'; P.curSlot = 'primary';
    FOG.seen.fill(1); FOG.vis.fill(1);
    FOG.cx.putImageData = function(){}; FOG.cx.canvas.width = FOG.cx.canvas.width;

    /* 六种箱子各取一个，摆成一排：前四个未开、第五个翻过还剩东西、第六个搜空 */
    const kinds = ['ammo','med','tool','weapon','safe','crate'];
    const picked = [];
    for (const k of kinds) { const c = G.crates.find(o => o.kind === k); if (c) picked.push(c); }
    const bx = P.x - 40, by = P.y - 150;
    picked.forEach((c, i) => {
      c.x = bx + (i % 3) * 92;
      c.y = by + Math.floor(i / 3) * 84;
      c.opened = (i >= 3);
    });
    if (picked[4]) {                                    // 翻过但没翻干净
      picked[4].opened = true;
      if (!picked[4].items || !picked[4].items.length) picked[4].items = [{ t:'mod', id:'reddot', taken:false }];
      else picked[4].items.forEach((x, j) => { x.taken = j > 0; });
    }
    if (picked[5]) {                                    // 搜空
      picked[5].opened = true;
      if (picked[5].items) picked[5].items.forEach(x => { x.taken = true; });
    }
    G.searchTarget = picked[3] || null;                 // 让「被瞄准」的高亮也进画面

    window.__boxO = { x: bx, y: by };
    P.x = bx + 96; P.y = by + 150;
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2 - 60;
    return 'ok ' + picked.map(c => c.kind).join(',');
  }catch(e){ return 'ERR ' + e.message }})()`));
  await sleep(600);
  await ev("(()=>{try{ FOG.cx.canvas.width = FOG.cx.canvas.width; }catch(e){}})()");
  await shot('box-scene.png');

  const r = await ev(`(()=>{try{
    const cv = document.getElementById('game');
    const O = window.__boxO;
    const bx = (O.x - G.cam.x) * ZOOM, by = (O.y - G.cam.y) * ZOOM;
    const c2 = document.createElement('canvas');
    c2.width = 900; c2.height = 640;
    const g = c2.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, bx - 20, by - 20, 300, 210, 0, 0, 900, 630);
    return c2.toDataURL('image/png');
  }catch(e){ return 'ERR ' + e.message }})()`);
  if (typeof r === 'string' && r.startsWith('data:image')) {
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', 'box-zoom.png'), Buffer.from(r.split(',')[1], 'base64'));
    console.log('shot -> box-zoom.png');
  } else console.log('zoom failed:', String(r).slice(0, 200));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
