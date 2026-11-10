/* 手术包止血：surgTarget 兜底流血 / applySurgery 一刀压住全部层 / 伤口优先于流血 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    // ── 1. 只流血：手术包能处理（兜底） ──
    const r1 = JSON.parse(w.eval(`
      (function(){
        P.deb = { bleed: 3, redHead: 0, redChest: 0, redAbdomen: 0, arm: 0, leg: 0, fissure: 0, weak: 0 };
        var t = surgTarget();
        var hpBefore = P.hp;
        var n = applySurgery();
        return JSON.stringify({ label: t ? t.label : null, done: n, bleedNow: P.deb.bleed });
      })()`));
    T('只流血时手术包给出清创目标（' + r1.label + '）', r1.label === '清创止血 ×3');
    T('一刀压住全部流血层（3 → ' + r1.bleedNow + '）', r1.done === true && r1.bleedNow === 0);

    // ── 2. 有贯穿伤时优先缝伤，不动流血 ──
    const r2 = JSON.parse(w.eval(`
      (function(){
        P.deb = { bleed: 2, redHead: 0, redChest: 1, redAbdomen: 0, arm: 0, leg: 0, fissure: 0, weak: 0 };
        var t = surgTarget();
        var label = t ? t.label : null;
        applySurgery();
        return JSON.stringify({ label: label, chestNow: P.deb.redChest, bleedNow: P.deb.bleed });
      })()`));
    T('贯穿伤优先（' + r2.label + '）', r2.label === '贯穿伤 · 胸部 ×1');
    T('手术只缝伤不止血', r2.chestNow === 0 && r2.bleedNow === 2);

    // ── 3. 自动用药阶梯：有绷带时止血先走绷带，手术兜底 ──
    const r3 = JSON.parse(w.eval(`
      (function(){
        SAVE.meds = {}; SAVE.surgs = { surg_simple: { uses: 2 } };
        var pkKey = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});
        SAVE.worn.rig = 'gir'; SAVE.worn.pack = pkKey;
        P.rig = emptyCells(GEAR.gir.cap); P.pack = emptyCells(GEAR[pkKey].cap); P.pocket = emptyCells(5);
        P.deb = { bleed: 1, redHead: 0, redChest: 0, redAbdomen: 0, arm: 0, leg: 0, fissure: 0, weak: 0 };
        P.hp = P.maxHp * 0.9; P.painT = 0;
        P.pocket[0] = { t: 'stop', id: 'bandage' };    // 带着绷带：先绷带
        var withBandage = careAutoPick();
        P.pocket[0] = null;                            // 身上一件止血都没有：手术兜底
        P.pocket[0] = { t: 'surg', id: 'surg_simple', uses: 2 };
        var fallback = careAutoPick();
        return JSON.stringify({ withBandage: withBandage, fallback: fallback });
      })()`));
    T('有绷带：自动阶梯先绷带（' + r3.withBandage + '）', r3.withBandage === 'stop:bandage');
    T('没有止血件：手术包兜底止血（' + r3.fallback + '）', r3.fallback === 'surg:surg_simple');

    // ── 4. 商店手术卡文案带止血 ──
    const r4 = JSON.parse(w.eval(`
      (function(){
        openShop('supply');
        document.querySelector('#shopSubTabs [data-sub=surg]').click();
        var ds = [...document.querySelectorAll('#shopGrid .item .ds')].map(function(e){ return e.textContent; });
        document.querySelector('#shopSubTabs [data-sub=all]').click();
        closeShop();
        return JSON.stringify({ any: ds.some(function(s){ return s.indexOf('止血') >= 0; }) });
      })()`));
    T('手术卡能力行写明「止血」', r4.any === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
