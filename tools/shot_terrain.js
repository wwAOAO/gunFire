/* 地表分区验收：零号大坝（草地 / 裸土 / 混凝土混合）与航天基地（混凝土机坪 + 钢板区）。
   用法：先起 headless Chrome（--remote-debugging-port=9222），再 node tools/shot_terrain.js */
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
    if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    console.log('shot', name);
  };
  /* 开一局并清理战场：清敌、无敌、关迷雾、扔到指定世界坐标 */
  const enter = async (mapId, wx, wy) => ev(`(()=>{try{
    loadBuiltinMap('${mapId}', true);
    startRaid();
    G.enemies.length = 0; G.bullets.length = 0;
    P.hp = P.maxHp; P.invuln = 99999;
    P.x = ${wx}; P.y = ${wy};
    G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
    FOG.seen.fill(1); FOG.vis.fill(1);
    FOG.cx.putImageData = function(){}; FOG.cx.canvas.width = FOG.cx.canvas.width;
    return 'ok ' + G.mapName + ' regions=' + G.regions.length;
  }catch(e){ return 'ERR ' + e.message }})()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(2400);

  /* ── 找零号大坝的草地 / 裸土区域中心 ── */
  const regions = await ev(`JSON.stringify((G.regions||[]).map(r => r))`);
  console.log('先载入地图...');
  console.log(await ev(`(()=>{try{ loadBuiltinMap('zero-dam', true); return 'loaded regions=' + (G.regions||[]).length; }catch(e){ return 'ERR '+e.message }})()`));

  console.log('A 河谷草地:', await enter('zero-dam', 1360, 2100));
  await sleep(2600); await shot('terr-grass.png');

  console.log('B 军营裸土:', await enter('zero-dam', 1150, 800));
  await sleep(2600); await shot('terr-dirt.png');

  console.log('C 大坝坝顶混凝土:', await enter('zero-dam', 2200, 240));
  await sleep(2600); await shot('terr-pave.png');

  console.log('D 航天基地:', await enter('space-base', 3200, 2300));
  await sleep(2600); await shot('terr-space.png');

  /* 统计分区占比，确认不是「清一色」 */
  console.log('占比:', await ev(`JSON.stringify((function(){
    loadBuiltinMap('zero-dam', true);
    var cnt = {}, N = 0;
    for (var y = 0; y < 3200; y += 80) for (var x = 0; x < 4400; x += 80) {
      var m = terrainMatAt(x, y); cnt[m] = (cnt[m]||0) + 1; N++;
    }
    var out = {}; for (var k in cnt) out[k] = (cnt[k] * 100 / N).toFixed(1) + '%';
    return out;
  })())`));

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
