/* 自动朝向回归：物品默认按原始朝向摆，放不下原朝向时自动转 90°
   —— 包里留一个 2x3 的空洞，3x2 的战利品也该塞得进去，不用玩家自己倒包。
   ① stowCell 自动旋转（3 列背包 + 2 列 3 行 空洞）
   ② 空间够时保持原始朝向（不乱转）
   ③ resolveDropAt 拖拽落点自动旋转
   ④ shapeOf 认 rot：渲染 / 判空 / 铺设同一条路径
   ⑤ 读档清洗保留 rot；清格时整个旋转矩形一起清掉 */
const fs = require('fs');
const path = require('path');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    // ── 布置：3 列 × 6 行 背包（pack_3h），只留左上 2 列 × 3 行 的空洞 ──
    const setup = w.eval(`(function(){
      SAVE.worn = SAVE.worn || {};
      SAVE.worn.pack = 'pack_3h';                     // blocks: [[18, 3]] → 3 列 6 行
      SAVE.worn.rig = null;
      P.pack = emptyCells(18);
      P.rig = [];
      P.pocket = emptyCells(5);
      var C = zoneBlocks('pack')[0][2];
      for (var i = 0; i < 18; i++) {
        var col = i % C, row = (i / C) | 0;
        if (!(col < 2 && row < 3)) P.pack[i] = { t: 'mod', id: 'reddot' };   // 除左上 2x3 外全占满
      }
      return { C: C, free: P.pack.filter(function(c){ return !c; }).length };
    })()`);
    T('测试布置：3 列背包 + 左上 2x3 空洞（6 格空）', setup.C === 3 && setup.free === 6);

    // ── ① 3x2 物品塞进 2x3 空洞：自动转 90° 后成功 ──
    const r1 = JSON.parse(w.eval(`(function(){
      var cell = { t: 'relic', id: 'd_sandbag' };      // RELIC_GRID [3,2]
      var before = shapeOf(cell, 3);
      var slot = stowCell(cell);
      var after = shapeOf(cell, 3);
      var occ = [];
      P.pack.forEach(function(c, i){ if (c && c.t === 'relic') occ.push(i); });
      var conts = P.pack.filter(function(c){ return c && c.cont; }).length;
      return JSON.stringify({ before: before, after: after, slot: slot,
        rot: cell.rot, occ: occ, conts: conts });
    })()`));
    T('原朝向 3x2 在 3 列舱里仍是 3x2', JSON.stringify(r1.before) === '[3,2]');
    T('自动收纳：3x2 塞进 2x3 空洞成功，并打上 rot 标记',
      !!r1.slot && r1.slot.zone === 2 && r1.rot === 1 && JSON.stringify(r1.after) === '[2,3]');
    T('旋转后占住 2 列 3 行（0,1 / 3,4 / 6,7）+ 5 个占位标记',
      JSON.stringify(r1.occ) === '[0]' && r1.conts === 5);

    // ── ② 空间够时保持原始朝向 ──
    const r2 = JSON.parse(w.eval(`(function(){
      P.pack = emptyCells(18);
      var cell = { t: 'relic', id: 'd_sandbag' };
      var slot = stowCell(cell);
      return JSON.stringify({ rot: cell.rot === undefined ? 'none' : cell.rot,
        shape: shapeOf(cell, 3), zone: slot && slot.zone });
    })()`));
    T('空包时按原朝向 3x2 放，不乱转（无 rot 字段）',
      r2.rot === 'none' && JSON.stringify(r2.shape) === '[3,2]');

    // ── ③ 拖拽落点：落进 2x3 空洞也自动转 ──
    const r3 = JSON.parse(w.eval(`(function(){
      var C = zoneBlocks('pack')[0][2];
      P.pack = emptyCells(18);
      for (var i = 0; i < 18; i++) {
        var col = i % C, row = (i / C) | 0;
        if (!(col < 2 && row < 3)) P.pack[i] = { t: 'mod', id: 'reddot' };
      }
      var blocks = zoneBlocks('pack');
      var cell = { t: 'relic', id: 'd_sandbag' };
      var fit = resolveDropAt(P.pack, blocks, 4, cell);   // 落点在空洞正中（第 2 行第 2 列）
      return JSON.stringify({ fit: fit });
    })()`));
    T('拖拽落进 2x3 空洞：锚点顶回 0，rot=1', !!r3.fit && r3.fit.at === 0 && r3.fit.rot === 1);

    // ── ④ shapeOf 认 rot：渲染 = 判空 = 铺设 ──
    const r4 = JSON.parse(w.eval(`(function(){
      var a = shapeOf({ t: 'relic', id: 'd_sandbag', rot: 1 }, 3);
      var b = shapeOf({ t: 'relic', id: 'd_sandbag' }, 3);
      var sq = shapeOf({ t: 'relic', id: 'blackbox', rot: 1 }, 4);    // 2x2 正方形：转不转一样
      return JSON.stringify({ rot: a, plain: b, square: sq });
    })()`));
    T('shapeOf：rot=1 → [2,3]，无标记 → [3,2]，正方形不受影响',
      JSON.stringify(r4.rot) === '[2,3]' && JSON.stringify(r4.plain) === '[3,2]' &&
      JSON.stringify(r4.square) === '[2,2]');

    // ── ⑤ 读档清洗保留 rot；清格整个旋转矩形一起清 ──
    const r5 = JSON.parse(w.eval(`(function(){
      var kept = cellValid({ t: 'relic', id: 'd_sandbag', rot: 1 });
      var plain = cellValid({ t: 'relic', id: 'd_sandbag' });
      P.pack = emptyCells(18);
      var blocks = zoneBlocks('pack');
      var cell = { t: 'relic', id: 'd_sandbag', rot: 1 };
      P.pack[0] = cell;
      for (var k = 1; k < 6; k++) {
        var j = [1, 3, 4, 6, 7][k - 1];
        P.pack[j] = { cont: 1, head: 0 };
      }
      clearSpanAt(P.pack, 0, blocks);
      var left = P.pack.filter(function(c){ return c; }).length;
      return JSON.stringify({ kept: kept && kept.rot, plain: plain && plain.rot, left: left });
    })()`));
    T('cellValid 保留 rot，无标记的仍然是干净的', r5.kept === 1 && r5.plain === undefined);
    T('清格：旋转矩形的 6 格一起清空', r5.left === 0);

  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
