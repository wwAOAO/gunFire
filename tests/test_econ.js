/* 收集品市场饱和：单价衰减 / 逐件结算 / 仓库估值 / 一键出售 */
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
    const r = JSON.parse(w.eval(`
      (function(){
        SAVE.soldN = {};
        var id = 'radchip';   // 神话 34,000
        var p0 = relicSellPrice(id);
        SAVE.soldN[id] = 5;
        var p5 = relicSellPrice(id);
        SAVE.soldN[id] = 30;  // 超过封底阈值
        var p30 = relicSellPrice(id);
        return JSON.stringify({ p0: p0, p5: p5, p30: p30, base: RELICS[id].price,
                                cap: Math.round(RELICS[id].price * 0.4) });
      })()`));
    T('原价不打折', r.p0 === r.base);
    T('卖 5 件后单价下降', r.p5 < r.p0 && r.p5 > r.base * 0.4);
    T('衰减封底 40%', r.p30 === r.cap);

    const sell = JSON.parse(w.eval(`
      (function(){
        SAVE.soldN = {};
        SAVE.credits = 0;
        SAVE.stash = { radchip: 3 };       // 神话 34,000 × 3
        var per = relicSellPrice('radchip');
        var t = stashTotals();
        sellAllRelics();
        return JSON.stringify({ per: per, first: per * 3, gain: SAVE.credits, soldN: SAVE.soldN.radchip,
                                left: Object.keys(SAVE.stash).length, worth0: t.v });
      })()`));
    T('一键出售逐件衰减（< 3×首件价）', sell.gain < sell.first && sell.gain > sell.first * 0.7);
    T('卖出计数写进 soldN', sell.soldN === 3);
    T('仓库清空', sell.left === 0);

    const est = JSON.parse(w.eval(`
      (function(){
        SAVE.soldN = { radchip: 6 };
        SAVE.stash = { radchip: 2 };
        return JSON.stringify({ t: stashTotals(), sp: relicSellPrice('radchip') });
      })()`));
    T('仓库估值用衰减价（不再按原价虚高）', est.t.v === est.sp * 2);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
