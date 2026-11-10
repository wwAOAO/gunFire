/* 临时 UI 验证：headless Chrome + CDP 打开委托 / 整备面板并截图 */
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
  await sleep(1200);
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
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', name), Buffer.from(r.data, 'base64'));
    console.log('shot', name);
  };
  await sleep(1500);
  await shot('shot_lobby.png');

  await ev(`document.getElementById('ctBtn').click()`);
  await sleep(300);
  await shot('shot_contracts.png');
  const info = await ev(`document.getElementById('ctList').children.length + ' cards, day=' + document.getElementById('ctDay').textContent`);
  console.log(info);
  await ev(`document.getElementById('closeContracts').click()`);
  await ev(`document.getElementById('loadoutBtn').click()`);
  await sleep(400);
  await shot('shot_loadout.png');
  console.log('presets:', await ev(`document.getElementById('loPresets').children.length`));
  // 存一套预设再看
  await ev(`presetAction('save', 0); presetAction('save', 1);`);
  await sleep(200);
  await shot('shot_presets.png');
  console.log('preset0:', await ev(`JSON.stringify(SAVE.presets[0])`).then(v => v.slice(0, 160)));
  await ev(`document.getElementById('closeLoadout').click()`);
  await ev(`openSettings()`);
  await sleep(200);
  await shot('shot_settings.png');
  await ev(`closeSettings()`);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
