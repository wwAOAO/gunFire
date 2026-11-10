/* 主页面 + 干员选择页截图审查 */
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
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', '.workbuddy', name), Buffer.from(r.data, 'base64'));
    console.log('shot', name);
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(1800);
  await shot('shot_lobby.png');
  // 布局指标
  const lobbyInfo = await ev(`(function(){
    var f=document.querySelector('#lobby .frame');
    var r=f.getBoundingClientRect();
    var foot=document.querySelector('#lobby .footbar').getBoundingClientRect();
    var cols=document.querySelector('#lobby .cols').getBoundingClientRect();
    return JSON.stringify({frameH:Math.round(r.height),pageH:document.documentElement.scrollHeight,vh:innerHeight,
      footTop:Math.round(foot.top),colsH:Math.round(cols.height),overflow:document.documentElement.scrollHeight>innerHeight});
  })()`);
  console.log('lobby layout:', lobbyInfo);

  await ev(`document.getElementById('opBtn').click()`);
  await sleep(500);
  await shot('shot_ops.png');
  const opsInfo = await ev(`(function(){
    var f=document.querySelector('#ops .frame');
    var r=f.getBoundingClientRect();
    var wrap=document.querySelector('.ops-wrap').getBoundingClientRect();
    var cards=[].map.call(document.querySelectorAll('.ops-card'),function(c){return c.getBoundingClientRect();});
    return JSON.stringify({frameH:Math.round(r.height),wrapH:Math.round(wrap.height),cardN:cards.length,
      overflow:document.documentElement.scrollHeight>innerHeight,pageH:document.documentElement.scrollHeight,vh:innerHeight});
  })()`);
  console.log('ops layout:', opsInfo);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
