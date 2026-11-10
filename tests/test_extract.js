/* 撤离点变体：付费撤离（3s 读条 / 钱不够不能进 / 完成扣款）与普通点 6s 并存 */
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
    // ── 1. 付费点：钱不够不能进读条 ──
    const poor = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        SAVE.credits = 1000;
        G.extracts = [{ x: 0, y: 0, r: 108, phase: 0, mode: 'paid', cost: 1500, hold: 3, name: 'B' }];
        G.extractT = 0; G.scene = 'playing';
        updateExtract(0.1); updateExtract(0.1);
        return JSON.stringify({ t: G.extractT, inside: !!G.inExtract });
      })()`));
    T('资金不足时付费点不累积读条', poor.t === 0 && poor.inside === false);

    // ── 2. 钱够：3 秒完成并扣款 ──
    const paid = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        SAVE.credits = 2000;
        SAVE.stats = { raids: 1, extracts: 0, deaths: 0, loot: 0, kills: 0, sold: 0 };
        SAVE.achieved = {};                                // 先把所有成就置为已解锁，排除奖金干扰
        ACHIEVEMENTS.forEach(function(a){ SAVE.achieved[a.id] = 1; });
        G.extracts = [{ x: 0, y: 0, r: 108, phase: 0, mode: 'paid', cost: 1500, hold: 3, name: 'B' }];
        G.extractT = 0; G.scene = 'playing';
        for (var i = 0; i < 29; i++) updateExtract(0.1);   // 2.9s：还没到
        var before = { t: G.extractT, scene: G.scene };
        for (var j = 0; j < 3; j++) updateExtract(0.1);    // 3.2s：完成
        return JSON.stringify({ before: before, scene: G.scene, credits: SAVE.credits,
                                extracts: SAVE.stats.extracts });
      })()`));
    T('2.9 秒时还差一点（3 秒读条）', paid.before.t < 3 && paid.before.scene === 'playing');
    T('3 秒后完成撤离', paid.scene === 'extracted');
    T('按标注扣款（2000 − 1500 + 撤离奖励 400 = 900）', paid.credits === 900);
    T('计入撤离次数', paid.extracts === 1);

    // ── 3. 普通点仍是 6 秒 ──
    const norm = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        SAVE.credits = 9999;
        SAVE.stats = { raids: 1, extracts: 0, deaths: 0, loot: 0, kills: 0, sold: 0 };
        SAVE.achieved = {};
        ACHIEVEMENTS.forEach(function(a){ SAVE.achieved[a.id] = 1; });
        G.extracts = [{ x: 0, y: 0, r: 108, phase: 0, mode: 'hold', name: 'A' }];
        G.extractT = 0; G.scene = 'playing';
        for (var i = 0; i < 40; i++) updateExtract(0.1);   // 4s
        var mid = { t: G.extractT, scene: G.scene };
        for (var j = 0; j < 25; j++) updateExtract(0.1);   // 6.5s
        return JSON.stringify({ mid: mid, scene: G.scene, credits: SAVE.credits });
      })()`));
    T('普通点 4 秒时尚未撤离', norm.mid.scene === 'playing');
    T('普通点 6 秒后撤离且不扣钱（只有 +400 撤离奖励）', norm.scene === 'extracted' && norm.credits === 9999 + 400);

    // ── 4. 生成器：第二个点可能是付费点 ──
    const gen = JSON.parse(w.eval(`
      (function(){
        var rnd = Math.random;
        Math.random = function(){ return 0; };    // 强制走 paid 分支
        G.obstacles = []; G.extracts = [];
        generateExtracts();
        Math.random = rnd;
        return JSON.stringify({ n: G.extracts.length, modes: G.extracts.map(function(e){ return e.mode || 'hold'; }) });
      })()`));
    T('随机图生成 2 个撤离点', gen.n === 2);
    T('第二个点是付费撤离（cost 1500 / hold 3）', gen.modes[1] === 'paid');

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
