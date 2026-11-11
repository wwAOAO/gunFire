/* 单项渲染基准：对指定 draw* 函数各跑 N 次，取中位数，避免整帧噪声
   用法：先起 headless Chrome（--remote-debugging-port=9222）打开 index.html，再 node tools/bench.js */
const http = require('http');
const WebSocket = require('ws');
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

const NAMES = ['render', 'drawFloor', 'drawObstacles', 'drawParticles', 'drawCrates', 'drawHUD', 'drawFog', 'drawPlayer'];

(async () => {
  const tabs = await getJSON('http://127.0.0.1:9222/json');
  const page = tabs.find(t => t.type === 'page' && /war\/index\.html/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = new Map();
  ws.on('message', m => { const msg = JSON.parse(m); if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); } });
  await new Promise(r => ws.on('open', r));
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2600));

  console.log(await ev(`(()=>{try{
    loadBuiltinMap('zero-dam', true); startRaid();
    P.hp = P.maxHp; P.invuln = 99999;
    P.x = 1360; P.y = 2050;
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    FOG.seen.fill(1); FOG.vis.fill(1);
    return 'ready ' + NAMES.length + ' 项';
  }catch(e){ return 'ERR ' + e.message }})()`.replace('NAMES.length', NAMES.length)));

  const names = JSON.stringify(NAMES);
  console.log(await ev(`(()=>{
    const names = ${names};
    const out = [];
    for (const n of names) {
      const f = window[n];
      if (typeof f !== 'function') { out.push(n + ' (n/a)'); continue; }
      for (let i = 0; i < 12; i++) f();                    // 预热
      const samples = [];
      for (let r = 0; r < 7; r++) {
        const t0 = performance.now();
        for (let i = 0; i < 25; i++) f();
        samples.push((performance.now() - t0) / 25);
      }
      samples.sort((a, b) => a - b);
      out.push([n, samples[3]]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.map(x => x[0] + ' ' + x[1].toFixed(3) + 'ms').join(' | ');
  })()`));

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
