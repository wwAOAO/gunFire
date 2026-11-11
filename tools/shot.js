/* 截图工具：重载 index.html → 进入零号大坝随机点位 → 存 PNG
   用法：node tools/shot.js <输出文件> [x] [y] [等待ms] */
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const getJSON = url => new Promise((res, rej) => {
  http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

const out = process.argv[2] || '.tmps/shot.png';
const px = Number(process.argv[3] || 1360);
const py = Number(process.argv[4] || 2050);
const wait = Number(process.argv[5] || 2600);

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
  const NL = process.argv[6] === 'nolight' ? 1 : 0;
  await new Promise(r => setTimeout(r, wait));
  if (px >= 0) {
    console.log(await ev(`(()=>{try{
      loadBuiltinMap('zero-dam', true); startRaid();
      P.hp = P.maxHp; P.invuln = 99999; P.x = ${px}; P.y = ${py};
      G.cam.x = P.x - VW / ZOOM / 2; G.cam.y = P.y - VH / ZOOM / 2;
      FOG.seen.fill(1); FOG.vis.fill(1);
      G.time = 3;
      if (${NL} === 1) { window.drawLighting = function(){}; window.drawFog = function(){}; }
      render();
      return 'ok';
    }catch(e){ return 'ERR ' + e.message }})()`));
    await new Promise(r => setTimeout(r, 400));
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved ' + out);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
