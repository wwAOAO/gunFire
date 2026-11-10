/* 枪械外观验证：改装台预览逐枪截图（画到一张长图上） */
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(1500);
  const targets = await getJson('http://127.0.0.1:9222/json');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = {};
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending[mid] = { res, rej };
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);

  const guns = ['akm', 'ak12', 'm4a1', 'hk416', 'rpk', 'm249', 'pkm', 'r93', 'awm', 'm700', 'sks', 'm14', 'sr9', 'sr25', 'asval'];
  // 一行行画到 gsPreview 并截图，最后拼一张长图核对
  await ev(`document.getElementById('gunsmith').classList.remove('hidden');
            document.getElementById('lobby').classList.add('hidden');`);
  await sleep(300);
  let idx = 0;
  for (const gid of guns) {
    await ev(`(function(){
      var cv = document.getElementById('gsPreview');
      drawGunPreview('${gid}');
      var t = document.querySelector('#gsName');
      if (t) t.textContent = 'PREVIEW: ${gid}';
      cv.scrollIntoView({ block: 'center' });
    })()`);
    await sleep(120);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', '.tmps', `gun_${String(idx).padStart(2, '0')}_${gid}.png`), Buffer.from(r.data, 'base64'));
    idx++;
  }
  console.log('shots:', idx);
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
