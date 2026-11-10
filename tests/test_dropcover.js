/* 多格物品「落点覆盖」放置：手术包落在 3 格竖舱的顶/中/底格都能放 —— 回归测试 */
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
    // 探测：gir 弹挂的第一个 3 格竖舱起点，以及手术包 cell 类型
    const probe = JSON.parse(w.eval(`(function(){
      var blocks = zoneBlocks('rig');                    // SAVE.worn.rig 还没穿，先借默认看结构不行 —— 直接读 GEAR
      var g = GEAR['gir'];
      var out = null, s = 0;
      for (var i = 0; i < g.blocks.length; i++) {
        var sp = blkSpec(g.blocks[i]);
        if (sp[0] === 3 && sp[1] === 1) { out = { s: s, e: s + sp[0], C: sp[1] }; break; }
        s += sp[0];
      }
      
      return JSON.stringify({ blk: out, medT: (typeof SURGERIES !== 'undefined' && SURGERIES['surg_dek']) ? 'ok' : null, cap: g.cap });
    })()`));
    T('gir 弹挂里有 3 格竖舱', !!probe.blk);
    T('手术包 surg_dek 存在', probe.medT === 'ok');
    if (!probe.blk || probe.medT !== 'ok') { console.log('fail:', fail); process.exit(1); }

    const S = probe.blk.s, E = probe.blk.e, CAP = probe.cap;
    const setup = `
      SAVE.worn.rig = 'gir';
      P.rig = emptyCells(${CAP});
      PK_UI.held = { t: 'med', id: 'surg_dek', n: 1 };
    `;
    const headAt = i => w.eval(`(function(){
      var c = P.rig[${i}];
      return c ? (c.cont ? c.head : ${i}) : -1;
    })()`);

    for (const drop of [S, S + 1, E - 1]) {            // 顶格 / 中格 / 底格
      w.eval(setup);
      w.eval(`pkPlaceInto(P.rig, ${drop}, 0);`);
      const held = w.eval('!!PK_UI.held');
      T('1×3 竖放 · 落在第 ' + (drop - S + 1) + ' 格 → 放下', !held);
      T('  头格锚在竖舱顶格', headAt(drop) === S);
    }

    // 横放也要成立：在 3 列横舱里落 [3,1] 手术包（不旋转），落在中间列也能放
    const probe2 = JSON.parse(w.eval(`(function(){
      for (var k in GEAR) {
        var g = GEAR[k];
        if (g.kind !== 'pack' || !g.blocks) continue;
        var s = 0;
        for (var i = 0; i < g.blocks.length; i++) {
          var sp = blkSpec(g.blocks[i]);
          if (sp[1] >= 3 && sp[0] >= 3) return JSON.stringify({ key: k, s: s, C: sp[1], cap: g.cap });
          s += sp[0];
        }
      }
      return 'null';
    })()`));
    if (probe2) {
      const dropMid = probe2.s + Math.floor((probe2.C - 1) / 2);   // 首排中间列
      w.eval(`
        SAVE.worn.pack = ${JSON.stringify(probe2.key)};
        P.pack = emptyCells(${probe2.cap});
        PK_UI.held = { t: 'med', id: 'surg_dek', n: 1 };
      `);
      w.eval(`pkPlaceInto(P.pack, ${dropMid}, 2);`);
      const held3 = w.eval('!!PK_UI.held');
      T('3×1 横放 · 落在首排中间列 → 放下', !held3);
    }

    // 放不下仍拒绝：竖舱里已有东西占中间格，1×3 从任何格都放不进这个舱
    w.eval(setup);
    w.eval(`
      P.rig[${S}] = { t: 'med', id: 'surg_simple', n: 1 };   // 占顶格
      pkPlaceInto(P.rig, ${S + 1}, 0);
    `);
    const held4 = w.eval('!!PK_UI.held');
    T('竖舱被占 1 格 → 1×3 放不进（手上还在）', held4 === true);

    /* ── 扩展：2×2 / 3×2 / 3×3 全形状覆盖 ──
       blkSpec 是 [格数, 列数]：2×2 舱 = (4,2)，3×2 舱 = (6,3)，3×3 物品没有专属舱、
       只能进 ≥3 列的大舱（如 pack_outdoor 的 12 格 3 列舱）。 */
    const blockOf = (gearKey, n0, c0) => JSON.parse(w.eval(`(function(){
      var g = GEAR[${JSON.stringify(gearKey)}];
      var s = 0;
      for (var i = 0; i < g.blocks.length; i++) {
        var sp = blkSpec(g.blocks[i]);
        if (sp[0] === ${n0} && sp[1] === ${c0}) return JSON.stringify({ s: s, n: sp[0], C: sp[1], cap: g.cap });
        s += sp[0];
      }
      return 'null';
    })()`));

    // ── 2×2：pack_surv 背包的 4 格 2 列舱（甲设计上只能进背包 zone2），甲 lv2（[2,2]），4 个落点都试 ──
    const b22 = blockOf('pack_surv', 4, 2);
    T('pack_surv 背包里有 2×2 舱（4 格 2 列）', !!b22);
    if (b22) {
      for (let d = 0; d < 4; d++) {
        w.eval(`
          SAVE.worn.pack = 'pack_surv';
          P.pack = emptyCells(${b22.cap});
          PK_UI.held = { t: 'gear', key: 'd01' };
        `);
        w.eval(`pkPlaceInto(P.pack, ${b22.s + d}, 2);`);
        const held = w.eval('!!PK_UI.held');
        const head = w.eval(`(function(){ var c=P.pack[${b22.s + d}]; return c ? (c.cont ? c.head : ${b22.s + d}) : -1; })()`);
        T('2×2 装备 · 落在舱内第 ' + (d + 1) + ' 格 → 放下', !held);
        T('  头格锚在舱左上', head === b22.s);
      }
    }

    // ── 3×2：pack_heavymtn 背包的 6 格 3 列舱，甲 lv3（[3,2]），6 个落点都试 ──
    const b32 = blockOf('pack_heavymtn', 6, 3);
    T('pack_heavymtn 背包里有 3×2 舱（6 格 3 列）', !!b32);
    if (b32) {
      for (let d = 0; d < 6; d++) {
        w.eval(`
          SAVE.worn.pack = 'pack_heavymtn';
          P.pack = emptyCells(${b32.cap});
          PK_UI.held = { t: 'armor', id: 3, hp: 60, max: 60 };
        `);
        w.eval(`pkPlaceInto(P.pack, ${b32.s + d}, 2);`);
        const held = w.eval('!!PK_UI.held');
        const head = w.eval(`(function(){ var c=P.pack[${b32.s + d}]; return c ? (c.cont ? c.head : ${b32.s + d}) : -1; })()`);
        T('3×2 甲 · 落在舱内第 ' + (d + 1) + ' 格 → 放下', !held);
        T('  头格锚在舱左上', head === b32.s);
      }
    }

    // ── 3×3：pack_outdoor 背包的 12 格 3 列舱，神话收藏品 reactor（[3,3]）──
    //     12 格舱里 3×3 有两个合法锚点（第 0~2 行 / 第 1~3 行），12 个落点全覆盖
    const b33 = JSON.parse(w.eval(`(function(){
      var g = GEAR['pack_outdoor'];
      return JSON.stringify({ s: 0, n: blkSpec(g.blocks[0])[0], C: blkSpec(g.blocks[0])[1], cap: g.cap });
    })()`));
    T('pack_outdoor 背包首舱是 12 格 3 列', b33.n === 12 && b33.C === 3);
    if (b33.n === 12 && b33.C === 3) {
      let ok = true, heads = new Set();
      for (let d = 0; d < 12; d++) {
        w.eval(`
          SAVE.worn.pack = 'pack_outdoor';
          P.pack = emptyCells(${b33.cap});
          PK_UI.held = { t: 'relic', id: 'reactor' };
        `);
        w.eval(`pkPlaceInto(P.pack, ${b33.s + d}, 2);`);
        const held = w.eval('!!PK_UI.held');
        const head = w.eval(`(function(){ var c=P.pack[${b33.s + d}]; return c ? (c.cont ? c.head : ${b33.s + d}) : -1; })()`);
        if (held || head < 0) ok = false;
        if (head >= 0) heads.add(head);
      }
      T('3×3 收藏品 · 12 个落点全部放下', ok);
      T('  锚点只落在第 0 行 / 第 1 行（合法位置）', heads.size === 2 && heads.has(b33.s) && heads.has(b33.s + 3));
    }

    // ── 大厅整备路径（renderLoadout 的 placeHere / _loDrop）：1×3 手术包拖 gir 弹挂 ──
    //     每次落点前重置格子并重渲染：中间/底格只有在「空舱」状态下才会渲染成独立空格
    const loTest = JSON.parse(w.eval(`(function(){
      SAVE.worn.rig = 'gir';
      SAVE.carry.rig = emptyCells(GEAR['gir'].cap);
      renderLoadout();
      return JSON.stringify({ n: document.querySelectorAll('#loRig .lo-cell.bcell').length });
    })()`));
    T('大厅整备渲染出 ' + (loTest.n || 0) + ' 个格子', loTest.n > 0);
    if (loTest.n > S) {
      for (const drop of [S, S + 1, E - 1]) {
        w.eval(`
          SAVE.carry.rig = emptyCells(GEAR['gir'].cap);
          renderLoadout();
          LO_UI.held = { t: 'med', id: 'surg_dek', n: 1 };
          document.querySelectorAll('#loRig .lo-cell.bcell')[${drop}]._loDrop();
        `);
        const held = w.eval('!!LO_UI.held');
        const head = w.eval(`(function(){ var c=SAVE.carry.rig[${drop}]; return c ? (c.cont ? c.head : ${drop}) : -1; })()`);
        T('大厅整备 · 1×3 落在第 ' + (drop - S + 1) + ' 格 → 放下', !held);
        T('  头格锚在竖舱顶格', head === S);
      }
    }

    console.log('pass', pass, 'fail', fail);
    process.exit(fail ? 1 : 0);
  } catch (e) { console.error(e); process.exit(1); }
}, 1200);
