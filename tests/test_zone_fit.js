/* 隔舱越界回归：舱的列数变了（换弹挂 / 换背包）之后，原来合法的 2x2 大件
   会落到 1x3 这类窄舱里 —— 必须被识别成坏档、重排或回仓，绝不能留在舱里。
   旧版 spanIdxs 只判 j < e，2x2 在 1 列舱会算成 [8,9,9,10]（重复 + 跨舱），
   spanOk 反而判「占位完整」，reflowZone 不重排；渲染再把 1 列的 grid 撑出
   隐式第 2 列 —— 玩家看到的就是「我的 1x3 格子被扩大了」。

   ① spanIdxs 行列几何：越宽 / 越右 / 越矮一律返回空
   ② spanOk 对装不进舱的物品判 false
   ③ reflowZone 把越界大件挪到装得下的舱
   ④ 全舱都装不下时回仓，不留残件
   ⑤ ensureCarry 老档自愈（换装后的脏档）
   ⑥ 渲染兜底：脏数据也不能把格子撑出舱外
   ⑦ 1x3 舱放 1x1 小件仍然正常（回归）

   注：2x2 样例用「哈夫克快拔弹鼓」—— 配件占格改成四档后，2x2 只剩三种弹鼓，
   枪管 / 倍镜 / 两脚架这些长件都是 3x1 了，不能再拿它们当 2x2 的样本。 */
const fs = require('fs');
const path = require('path');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (ok || !extra ? '' : '  → ' + extra)); };

setTimeout(() => {
  const run = code => w.eval(code);
  const J = code => JSON.parse(run(code));

  /* 统一基线：穿 GIR 弹挂 —— 2x2 + 2x2 + 四条 1x3 竖舱，正好覆盖「宽舱变窄舱」 */
  run(`(function(){ SAVE.worn = SAVE.worn || {}; SAVE.worn.rig = 'gir'; return 1; })()`);

  /* ── ① spanIdxs：1 列 3 行舱（gir 的 [3,1] 弹匣舱）装 2x2 ── */
  const a1 = J(`(function(){
    const blocks = zoneBlocks('rig');           // gir: 2x2 / 2x2 / 1x3 x4
    const b = blkAt(blocks, 8);                 // 8..10 = 1x3
    return JSON.stringify({ blk: b, span: spanIdxs(8, {t:'mod', id:'drummag'}, b[0], b[1], b[2]) });
  })()`);
  T('① 1x3 舱（1 列）放 2x2 → 无合法占位', a1.span.length === 0, JSON.stringify(a1.span));

  /* ── ② spanIdxs：2x2 舱正放 / 起点偏移 / 舱太矮 ── */
  const a2 = J(`(function(){
    const c = {t:'mod', id:'drummag'};
    return JSON.stringify({
      ok:    spanIdxs(0, c, 0, 4, 2),        // 2 列 2 行，头格 → 0,1,2,3
      right: spanIdxs(1, c, 0, 4, 2),        // 起点在第 2 列 → 越右
      short: spanIdxs(0, c, 0, 2, 2),        // 只有 1 行 → 越矮
      dup:   spanIdxs(0, {t:'mod', id:'heavy'}, 0, 4, 2),   // 2x1 中件 → 0,1 不重复
    });
  })()`);
  T('② 2x2 在 2x2 舱正放 = 4 格', a2.ok.length === 4 && a2.ok.join() === '0,1,2,3', a2.ok.join());
  T('② 起点太靠右 → 空', a2.right.length === 0, a2.right.join());
  T('② 舱高不够 → 空', a2.short.length === 0, a2.short.join());
  T('② 2x1 在 2 列舱 = 2 格且不重复', a2.dup.join() === '0,1', a2.dup.join());

  /* ── ③ spanOk 对越界物品判 false ── */
  const a3 = J(`(function(){
    const blocks = zoneBlocks('rig');
    const arr = new Array(rigCap()).fill(null);
    arr[8] = {t:'mod', id:'drummag'}; arr[9] = {cont:1, head:8}; arr[10] = {cont:1, head:8};
    return JSON.stringify({ bad: spanOk(arr, 8, blocks) });
  })()`);
  T('③ 2x2 赖在 1x3 舱 → spanOk false', a3.bad === false, String(a3.bad));

  /* ── ④ reflowZone：挪到装得下的舱 ── */
  const a4 = J(`(function(){
    const blocks = zoneBlocks('rig');
    const arr = new Array(rigCap()).fill(null);
    arr[8] = {t:'mod', id:'drummag'}; arr[9] = {cont:1, head:8}; arr[10] = {cont:1, head:8};
    const ov = reflowZone(arr, blocks);
    let head = -1; for (let i = 0; i < arr.length; i++) if (arr[i] && !arr[i].cont && arr[i].id === 'drummag') head = i;
    return JSON.stringify({ ov: ov ? ov.length : 0, head, blk: head >= 0 ? blkAt(blocks, head) : null, ok: head >= 0 ? spanOk(arr, head, blocks) : false });
  })()`);
  T('④ 越界大件被挪到 2x2 舱（不丢件）', a4.head >= 0 && a4.head < 8, 'head=' + a4.head);
  T('④ 挪过去后占位完整', a4.ok === true, String(a4.ok));
  T('④ 没有溢出', a4.ov === 0, String(a4.ov));

  /* ── ⑤ 全舱都装不下 → 回仓 ── */
  const a5 = J(`(function(){
    SAVE.worn.rig = 'scout';                    // 六个独立 1x1 舱
    const blocks = zoneBlocks('rig');
    const arr = new Array(rigCap()).fill(null);
    arr[0] = {t:'mod', id:'drummag'};
    const ov = reflowZone(arr, blocks);
    const left = arr.some(c => c && !c.cont);
    return JSON.stringify({ overflow: ov ? ov.map(c => c.id) : [], left });
  })()`);
  T('⑤ 装不下的大件进溢出清单', a5.overflow.indexOf('drummag') >= 0, JSON.stringify(a5.overflow));
  T('⑤ 舱里不留残件', a5.left === false, String(a5.left));

  /* ── ⑥ ensureCarry 老档自愈 ── */
  const a6 = J(`(function(){
    SAVE.worn.rig = 'gir';
    const arr = new Array(rigCap()).fill(null);
    arr[8] = {t:'mod', id:'drummag'}; arr[9] = {cont:1, head:8}; arr[10] = {cont:1, head:8};
    SAVE.carry.rig = arr;
    const car = ensureCarry();
    const blocks = zoneBlocks('rig');
    const bad = [];
    for (let i = 0; i < car.rig.length; i++) {
      const c = car.rig[i]; if (!c || c.cont) continue;
      const b = blkAt(blocks, i);
      if (!b) { bad.push([i, 'noBlk']); continue; }
      if (!spanOk(car.rig, i, blocks)) bad.push([i, 'badSpan']);
      if (shapeOf(c, b[2])[0] > b[2]) bad.push([i, 'tooWide']);
    }
    return JSON.stringify({ bad, has: car.rig.some(c => c && c.id === 'drummag') });
  })()`);
  T('⑥ 读档后舱内无越界物品', a6.bad.length === 0, JSON.stringify(a6.bad));
  T('⑥ 越界的大件没被丢掉', a6.has === true, String(a6.has));

  /* ── ⑦ 渲染兜底：脏数据也不能把 1 列舱撑成 2 列 ── */
  run(`(function(){
    SAVE.worn.rig = 'gir';
    const arr = new Array(GEAR.gir.cap).fill(null);
    arr[8] = {t:'mod', id:'drummag'};          // 故意不写 cont，模拟最脏的情况
    SAVE.carry = SAVE.carry || {};
    SAVE.carry.rig = arr;
    SAVE.carry.pocket = new Array(5).fill(null);
    SAVE.carry.pack = new Array(20).fill(null);
    renderLoadout();
    return 1;
  })()`);
  const a7 = J(`(function(){
    const grid = document.getElementById('loRig');
    const out = [];
    for (const bg of grid.querySelectorAll('.blk-grid')) {
      const cols = parseInt((bg.style.gridTemplateColumns.match(/repeat\\((\\d+)/) || [0, 1])[1], 10);
      for (const el of bg.children) {
        const span = parseInt((el.style.gridColumn.match(/span (\\d+)/) || [0, 1])[1], 10);
        if (span > cols) out.push({ cols, span, col: el.style.gridColumn });
      }
    }
    return JSON.stringify(out);
  })()`);
  T('⑦ 渲染不产生超出舱宽的跨列', a7.length === 0, JSON.stringify(a7).slice(0, 160));

  /* ── ⑧ 回归：1x3 舱放 1x1 小件正常 ── */
  const a8 = J(`(function(){
    const blocks = zoneBlocks('rig');
    const arr = new Array(rigCap()).fill(null);
    arr[8] = {t:'mod', id:'reddot'};           // 1x1
    const b = blkAt(blocks, 8);
    return JSON.stringify({
      span: spanIdxs(8, arr[8], b[0], b[1], b[2]),
      ok: spanOk(arr, 8, blocks),
      shape: shapeOf(arr[8], b[2]),
    });
  })()`);
  T('⑧ 1x1 小件在 1x3 舱占 1 格', a8.span.join() === '8' && a8.ok === true, JSON.stringify(a8));
  T('⑧ 形状仍是 1x1', a8.shape.join() === '1,1', a8.shape.join());

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 400);
