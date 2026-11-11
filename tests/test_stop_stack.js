/* 瓶装药堆叠：抗生素 / DVE 一瓶多片 —— 一格装一瓶，不再摊成一堆「一格一片」的格子 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { inlineScripts } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(inlineScripts(html), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(window) {                       // jsdom 无 canvas：页面脚本运行前注入假 2D 上下文
    const noop = function(){};
    const fakeCtx = new Proxy({}, {
      get(t, k) {
        if (k === 'canvas') return { width: 800, height: 600 };
        if (k === 'createImageData' || k === 'getImageData')
          return (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray((a || 1) * (b || 1) * 4) });
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern')
          return () => ({ addColorStop: function(){} });
        return noop;
      },
      set() { return true; }
    });
    window.HTMLCanvasElement.prototype.getContext = function(){ return fakeCtx; };
  }
});
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    const R = JSON.parse(w.eval(`(function(){
      loadBuiltinMap('zero-dam', true); startRaid();
      function wipe(){
        [P.rig, P.pocket, P.pack].forEach(function(a){ for (var i=0;i<a.length;i++) a[i] = null; });
      }
      function stopCells(){
        var out = [];
        [P.rig, P.pocket, P.pack].forEach(function(a){
          for (var i=0;i<a.length;i++) if (a[i] && a[i].t === 'stop') out.push({ id:a[i].id, n:(a[i].n|0)||1 });
        });
        return out;
      }
      var out = {};

      /* ① 表里的每格上限 */
      out.capAnti = stopCap('pain_antibio');
      out.capDve = stopCap('pain_dve');
      out.capBand = stopCap('bandage');

      /* ② 容器里翻出来的一瓶抗生素：一个物品，n=3（面板显示 ×3） */
      var it = makeStopItem('pain_antibio');
      out.itemN = it.n;

      /* ③ 按 F 收下：只占一格，格子记 3 片 */
      wipe();
      applyLootItem(it, null);
      out.take = stopCells();
      out.countAfter = stopCount('pain_antibio');
      out.subAfter = cellSub(stopCells().length ? { t:'stop', id:'pain_antibio', n:3 } : null);

      /* ④ 吃一片：还是同一格，剩 2 片 */
      consumeStopUnit('pain_antibio');
      out.afterOne = stopCells();
      out.countOne = stopCount('pain_antibio');

      /* ⑤ 再吃两片：格子清空 */
      consumeStopUnit('pain_antibio');
      consumeStopUnit('pain_antibio');
      out.afterAll = stopCells();
      out.countAll = stopCount('pain_antibio');

      /* ⑥ 一次性的绷带仍然是「一格一片」 */
      wipe();
      addStop('bandage', 2);
      out.bandage = stopCells();

      /* ⑦ 分两次捡同一瓶：合并进同一格（先 2 片再 1 片） */
      wipe();
      addStop('pain_antibio', 2);
      addStop('pain_antibio', 1);
      out.merge = stopCells();

      /* ⑧ 超过一瓶的量：第二瓶另开一格 */
      wipe();
      addStop('pain_antibio', 5);
      out.overflow = stopCells();

      /* ⑨ 存档归一化：老档没 n 当 1 片，超出上限往回收 */
      out.validNone = cellValid({ t:'stop', id:'pain_antibio' }).n;
      out.validBig = cellValid({ t:'stop', id:'pain_antibio', n: 9 }).n;
      out.validOk = cellValid({ t:'stop', id:'pain_antibio', n: 2 }).n;

      /* ⑩ 仓库按片存、按瓶取 */
      SAVE.stops.pain_antibio = 4;
      var a = stockTakeCell('stop', 'pain_antibio');
      out.take1 = { n:a.n, left: SAVE.stops.pain_antibio };
      var b = stockTakeCell('stop', 'pain_antibio');
      out.take2 = { n:b.n, left: SAVE.stops.pain_antibio };
      out.take3 = stockTakeCell('stop', 'pain_antibio') === null;

      /* ⑪ 撤离回仓：一瓶剩 2 片就是 2 片 */
      SAVE.stops.pain_antibio = 0;
      cellToStock({ t:'stop', id:'pain_antibio', n: 2 });
      out.toStock = SAVE.stops.pain_antibio;

      /* ⑫ 格子 → 容器面板行：带上剩余片数 */
      out.rowN = cellToLootItem({ t:'stop', id:'pain_antibio', n: 2 }).n;

      return JSON.stringify(out);
    })()`));

    T('每格上限：抗生素 3 / DVE 5 / 绷带 1',
      R.capAnti === 3 && R.capDve === 5 && R.capBand === 1);
    T('容器里的一瓶抗生素是一个物品 n=3', R.itemN === 3);
    T('收下后只占 1 格（不再摊成 3 个一格）', R.take.length === 1 && R.take[0].n === 3);
    T('身上计数按片算 = 3', R.countAfter === 3);
    T('格子信息行报「剩 3/3 片」', R.subAfter === '剩 3/3 片');
    T('吃一片：同一格剩 2 片', R.afterOne.length === 1 && R.afterOne[0].n === 2 && R.countOne === 2);
    T('吃空才清格', R.afterAll.length === 0 && R.countAll === 0);
    T('绷带这种一次性的仍然一格一片', R.bandage.length === 2 && R.bandage.every(c => c.n === 1));
    T('分两次捡同一瓶合成一格 3 片', R.merge.length === 1 && R.merge[0].n === 3);
    T('超过一瓶（5 片）开第二格：3 + 2', R.overflow.length === 2 &&
      R.overflow[0].n + R.overflow[1].n === 5 && Math.max(R.overflow[0].n, R.overflow[1].n) === 3);
    T('老存档格子没 n 字段当 1 片', R.validNone === 1);
    T('异常大的 n 收回到一瓶上限', R.validBig === 3);
    T('正常剩余片数原样保留', R.validOk === 2);
    T('仓库 4 片 → 取一瓶 3 片，剩 1 片', R.take1.n === 3 && R.take1.left === 1);
    T('再取就是剩下的 1 片', R.take2.n === 1 && R.take2.left === 0);
    T('仓库空了取不出', R.take3 === true);
    T('撤离回仓按片记账（一瓶剩 2 片 = +2）', R.toStock === 2);
    T('格子转容器行也报剩余片数', R.rowN === 2);

    // ── 静态断言：所有 +1 记账点都改成按片 ──
    const src = w.eval("''");   // 占位，保持结构
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
    T('cellToStock 按 n 记账（不再一格 +1）',
      /c\.t === 'stop'\) \{\s*SAVE\.stops\[c\.id\] = Math\.min\(99, \(\(SAVE\.stops\[c\.id\] \| 0\) \+ \(\(c\.n \| 0\) \|\| 1\)\)\);/.test(uiSrc));
    const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
    T('存档归一化保留 n 并夹到上限', /c\.t === 'stop' && STOPS\[c\.id\]\) \{/.test(dataSrc) &&
      /n: clamp\(Math\.floor\(Number\(c\.n\)\) \|\| 1, 1, cap\)/.test(dataSrc));
  } catch (e) {
    fail++;
    console.log('FAIL  测试抛异常: ' + (e && e.stack ? e.stack.split('\n')[0] : e));
  }
  console.log('');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 1200);
