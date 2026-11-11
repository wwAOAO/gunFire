/* 地图美化第二步验收：交界过渡带 / 混凝土使用痕迹 / 草地大元素 / 河谷水 / 迷雾柔化
   用法：先起 headless Chrome（--remote-debugging-port=9222），再 node tools/shot_mapextra.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const OUT = path.join(__dirname, '..', '.workbuddy');
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    console.log('shot', name);
  };
  /* 开一局、清敌、关迷雾、传送到指定坐标 */
  const enter = async (mapId, wx, wy, aim) => ev(`(()=>{try{
    loadBuiltinMap('${mapId}', true);
    startRaid();
    G.enemies.length = 0; G.bullets.length = 0;
    P.hp = P.maxHp; P.invuln = 99999;
    P.x = ${wx}; P.y = ${wy}; P.aim = ${aim || 0};
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    FOG.seen.fill(1); FOG.vis.fill(1);
    FOG.cx.putImageData = function(){}; FOG.cx.canvas.width = FOG.cx.canvas.width;
    return 'ok';
  }catch(e){ return 'ERR ' + e.message }})()`);

  /* 保留真实迷雾：只清理战场，让 FOG 正常算 */
  const enterFog = async (mapId, wx, wy, aim) => ev(`(()=>{try{
    loadBuiltinMap('${mapId}', true);
    startRaid();
    G.enemies.length = 0; G.bullets.length = 0;
    P.hp = P.maxHp; P.invuln = 99999;
    P.x = ${wx}; P.y = ${wy}; P.aim = ${aim};
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    return 'ok fog=' + FOG.ready + ' cell=' + FOG.cell;
  }catch(e){ return 'ERR ' + e.message }})()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(2400);
  await ev(`(()=>{try{ loadBuiltinMap('zero-dam', true); return 1; }catch(e){ return 0 }})()`);

  /* 1. 材质交界：河谷(草) 与 水泥厂(土) 交界，x≈1080 */
  console.log('A 交界过渡带:', await enter('zero-dam', 1080, 1500));
  await sleep(2600); await shot('ext-seam.png');

  /* 2. 混凝土使用痕迹：行政辖区（大量铺装） */
  console.log('B 混凝土痕迹:', await enter('zero-dam', 2380, 880));
  await sleep(2600); await shot('ext-marks.png');

  /* 3. 草地大元素：河谷中段 */
  console.log('C 草地元素:', await enter('zero-dam', 1300, 1850));
  await sleep(2600); await shot('ext-grass.png');

  /* 4. 河谷水：区域中心 */
  console.log('D 河谷水:', await enter('zero-dam', 1360, 2050));
  await sleep(2600); await shot('ext-river.png');

  /* 4b. 河谷远景：看整条水带的走向 */
  console.log('D2 河谷远景:', await ev(`(()=>{try{
    P.x = 1360; P.y = 2560; G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    return 'ok';
  }catch(e){ return 'ERR ' + e.message }})()`));
  await sleep(900); await shot('ext-river2.png');

  /* 5. 迷雾柔化：真实迷雾，朝东看。
     注意：前面的 enter 把 putImageData 劫持成了空函数（用来冻结迷雾），
     迷雾验收前必须 reload 恢复 —— 否则 FOG.cv 永远是上一局 fill(1) 的全亮图。 */
  await send('Page.reload', { ignoreCache: true });
  await sleep(2600);
  console.log('E 迷雾边界:', await enterFog('zero-dam', 2380, 880, 0.6));
  await sleep(1800); await shot('ext-fog.png');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
