/* 配件占格四档验收：GIR 弹挂里放 4 件 3x1 长件 + 2 颗 2x2 弹鼓，拍整备界面的隔舱网格。
   用法：先起 headless Chrome（--remote-debugging-port=9222），再 node tools/shot_foot.js */
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
    if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 240);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(2200);

  console.log('setup=', await ev(`(()=>{try{
    SAVE.gearOwned = SAVE.gearOwned || {};
    SAVE.gearOwned.gir = true; SAVE.gearOwned.pack_outdoor = true;
    SAVE.worn.rig = 'gir'; SAVE.worn.pack = 'pack_outdoor';
    SAVE.carry = SAVE.carry || {};
    const rb = zoneBlocks('rig'), pb = zoneBlocks('pack');
    SAVE.carry.rig  = new Array(rigCap()).fill(null);
    SAVE.carry.pack = new Array(packCap()).fill(null);
    SAVE.carry.pocket = new Array(5).fill(null);

    function put(arr, blocks, mid) {
      const cell = { t: 'mod', id: mid };
      const r = findFitAuto(arr, blocks, cell);
      if (!r) return null;
      if (r.rot) cell.rot = 1;
      placeAtRun(arr, r.at, cell, blocks);
      return r.at;
    }
    const log = [];
    // 弹挂：四条 3x1 舱各一件长件 + 两个 2x2 舱各一颗弹鼓
    for (const mid of ['barrel', 'scope4x', 's_mg_chain', 'd_gr_bipod', 'drummag', 's_mg_lightdrum']) {
      const at = put(SAVE.carry.rig, rb, mid);
      log.push(mid + (at === null ? ':放不下' : '@' + at));
    }
    // 背包：其余长件摊开，看 3x1 在大包里是否横着排
    for (const mid of ['mk4_auto', 'd_op_6x', 'thermal', 'supp_s', 's_mz_supp', 'd_sniper_bipod',
                       's_gr_claw', 'd_lmg_sled', 's_op_quantum', 'd_asval_int', 's_mz_em']) {
      put(SAVE.carry.pack, pb, mid);
    }
    renderLoadout();
    return log.join(' ');
  }catch(e){ return 'ERR ' + e.message }})()`));

  await sleep(400);
  console.log('open=', await ev(`(()=>{try{ openLoadout(); return 'ok'; }catch(e){ return 'ERR ' + e.message }})()`));
  await sleep(900);
  await shot('foot-rig.png');
  console.log('shot foot-rig.png');
  await ev(`(()=>{ const els = document.querySelectorAll('#loadout, #loadout .lo-main, #loadout .frame, #loadout .lo-wrap');
    els.forEach(el => el.scrollTop = 99999); window.scrollTo(0, 99999);
    return 'scrolled ' + els.length; })()`);
  await sleep(500);
  await shot('foot-pack.png');
  console.log('shot foot-pack.png');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
