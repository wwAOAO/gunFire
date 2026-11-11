/* 真实帧率探针：进入 raid 后让主循环跑起来，用 rAF 采样帧间隔
   用法：node tools/fps.js [采样帧数] */
const http = require('http');
const WebSocket = require('ws');
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

const N = Number(process.argv[2] || 240);

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
    if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200);
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
    FOG.seen.fill(1); FOG.vis.fill(1);
    /* 造 12 个敌人 + 40 发子弹，模拟交火时的负载 */
    for (let i = 0; i < 12; i++) spawnEnemy(['runner','shooter','nader','sniper'][i % 4], P.x + (Math.random()-0.5)*620, P.y + (Math.random()-0.5)*420, 'asara');
    for (let i = 0; i < 40; i++) G.bullets.push({ x: P.x + (Math.random()-0.5)*600, y: P.y + (Math.random()-0.5)*400, vx: 300, vy: 200, life: 2, dmg: 10, from: 'e', hostile: true, color: '#ffb27a', r: 2 });
    return 'ready';
  }catch(e){ return 'ERR ' + e.message }})()`));

  await new Promise(r => setTimeout(r, 1200));   // 让主循环跑热

  console.log(await ev(`new Promise(res=>{
    const ts = []; let last = performance.now();
    function step(){
      const now = performance.now();
      ts.push(now - last); last = now;
      if (ts.length < ${N}) return requestAnimationFrame(step);
      const s = ts.slice(10).sort((a,b)=>a-b);      // 丢前 10 帧
      const mean = s.reduce((a,b)=>a+b,0)/s.length;
      const p = q => s[Math.min(s.length-1, Math.floor(s.length*q))].toFixed(1);
      res('帧间隔 mean=' + mean.toFixed(2) + 'ms  p50=' + p(0.5) + '  p95=' + p(0.95) + '  max=' + s[s.length-1].toFixed(1) + '  估算FPS=' + (1000/mean).toFixed(1));
    }
    requestAnimationFrame(step);
  })`));

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
