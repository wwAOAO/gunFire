/* 渲染性能探针：分项打点 render 各阶段耗时
   用法：先起 headless Chrome（--remote-debugging-port=9222），再 node tools/perf.js */
const http = require('http');
const WebSocket = require('ws');
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

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
  await new Promise(r => setTimeout(r, 2400));

  console.log(await ev(`(()=>{try{
    loadBuiltinMap('zero-dam', true); startRaid();
    P.hp = P.maxHp; P.invuln = 99999;
    P.x = 1360; P.y = 2050;
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    FOG.seen.fill(1); FOG.vis.fill(1);
    return 'ready vw=' + VW + ' vh=' + VH + ' dpr=' + DPR + ' zoom=' + ZOOM;
  }catch(e){ return 'ERR ' + e.message }})()`));

  /* 1) 总帧时间（60 次采样） */
  console.log(await ev(`(()=>{
    for (let i = 0; i < 10; i++) render();            // 预热
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) render();
    return 'render 平均 ' + ((performance.now() - t0) / 60).toFixed(2) + ' ms/帧';
  })()`));

  /* 2) 分项：把 render 内部各阶段包一层计时。
        file:// 下顶层 function 声明挂在 window 上，render 里的调用走全局解析，
        替换 window.xxx 就能截到。 */
  console.log(await ev(`(()=>{
    const names = ['drawFloor','drawRegions','drawCrates','drawPickups','drawObstacles','drawPlayer',
      'drawEnemy','drawBullets','drawFootprints','drawParticles','drawPopups','drawDecals',
      'drawFrosts','drawFires','drawEZones','drawSmokes','drawExtracts','drawVisionCones',
      'drawOffscreenMarkers','drawFog','drawLighting','drawHUD','artGrain'];
    window.__T = {};
    for (const n of names) {
      if (typeof window[n] !== 'function') continue;
      const f = window[n];
      window.__T[n] = 0;
      window[n] = function(){ const a = performance.now(); const r = f.apply(this, arguments); window.__T[n] += performance.now() - a; return r; };
    }
    for (let i = 0; i < 5; i++) render();
    for (const k in window.__T) window.__T[k] = 0;
    const N = 40;
    for (let i = 0; i < N; i++) render();
    const out = [];
    for (const k in window.__T) out.push([k, window.__T[k] / N]);
    out.sort((a, b) => b[1] - a[1]);
    return out.map(x => x[0] + ' ' + x[1].toFixed(2) + 'ms').join(' | ');
  })()`));

  /* 3) drawFloor 内部三段（地形 / 痕迹 / 草地元素 / 河） */
  console.log(await ev(`(()=>{
    const names = ['drawTerrain','drawGroundMarks','drawGrassProps','drawRiver','drawTerrainSeam'];
    window.__T2 = {};
    for (const n of names) {
      const f = window[n];
      if (typeof f !== 'function') continue;
      window.__T2[n] = 0;
      window[n] = function(){ const a = performance.now(); const r = f.apply(this, arguments); window.__T2[n] += performance.now() - a; return r; };
    }
    for (let i = 0; i < 5; i++) render();
    for (const k in window.__T2) window.__T2[k] = 0;
    const N = 40;
    for (let i = 0; i < N; i++) render();
    const out = [];
    for (const k in window.__T2) out.push([k, window.__T2[k] / N]);
    out.sort((a, b) => b[1] - a[1]);
    return out.map(x => x[0] + ' ' + x[1].toFixed(2) + 'ms').join(' | ');
  })()`));

  /* 4) 压力场景：20 敌人 + 60 子弹 + 烟雾 */
  console.log(await ev(`(()=>{try{
    G.enemies.length = 0;
    for (let i = 0; i < 20; i++) {
      const e = spawnEnemy(['runner','shooter','nader','sniper','rocket','flamer','brute','cryo'][i % 8],
        P.x + (Math.random() - 0.5) * 700, P.y + (Math.random() - 0.5) * 500, 'asara');
      e.state = 'combat';
    }
    G.bullets.length = 0;
    for (let i = 0; i < 60; i++) G.bullets.push({ x: P.x + (Math.random()-0.5)*600, y: P.y + (Math.random()-0.5)*400, vx: 300, vy: 200, life: 2, dmg: 10, from: 'e', hostile: true, color: '#ffb27a', r: 2 });
    for (let i = 0; i < 3; i++) render();
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) render();
    return '压力场景（20 敌 + 60 弹）' + ((performance.now() - t0) / 40).toFixed(2) + ' ms/帧';
  }catch(e){ return 'ERR ' + e.message }})()`));

  /* 5) 压力场景分项 */
  console.log(await ev(`(()=>{
    const names = ['drawEnemy','drawBullets','drawParticles','drawFloor','drawObstacles','drawHUD','drawVisionCones','drawOffscreenMarkers','drawLighting','drawFog','artGrain'];
    window.__T3 = {};
    for (const n of names) {
      const f = window[n];
      if (typeof f !== 'function') continue;
      window.__T3[n] = 0;
      window[n] = function(){ const a = performance.now(); const r = f.apply(this, arguments); window.__T3[n] += performance.now() - a; return r; };
    }
    for (let i = 0; i < 3; i++) render();
    for (const k in window.__T3) window.__T3[k] = 0;
    const N = 30;
    for (let i = 0; i < N; i++) render();
    const out = [];
    for (const k in window.__T3) out.push([k, window.__T3[k] / N]);
    out.sort((a, b) => b[1] - a[1]);
    return out.map(x => x[0] + ' ' + x[1].toFixed(2) + 'ms').join(' | ');
  })()`));

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
