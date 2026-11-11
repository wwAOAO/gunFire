/* 临时：枪械侧视图验收 —— 直接调 drawGunSide 画一排不同骨架的枪 */
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
  const save = (name, dataUrl) => {
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('shot ->', name);
  };

  await send('Page.reload', { ignoreCache: true });
  await sleep(2200);

  // 一排代表枪：ak 骨架 / ar 骨架 / 木托 sporter / lmg / 无托 / 狙击 chassis / 冲锋
  const r = await ev(`(()=>{try{
    const ids = ['akm','hk416','svd','m249','aug','awm','mp7','m870'];
    const cv = document.createElement('canvas');
    cv.width = 560; cv.height = 96 * ids.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#1a1b12'; g.fillRect(0, 0, cv.width, cv.height);
    ids.forEach((id, i) => {
      g.save(); g.translate(70, 96 * i + 48); g.scale(1.6, 1.6);
      drawGunSide(g, WEAPONS[id]);
      g.restore();
      g.fillStyle = '#e6e0c9';
      g.font = '700 13px ui-monospace, monospace';
      g.fillText(WEAPONS[id].name, 430, 96 * i + 52);
    });
    return cv.toDataURL('image/png');
  }catch(e){ return 'ERR ' + e.message }})()`);
  if (typeof r === 'string' && r.startsWith('data:image')) save('gunside.png', r);
  else console.log('failed:', String(r).slice(0, 200));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
