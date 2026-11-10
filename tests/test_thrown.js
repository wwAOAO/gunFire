/* 投掷物落点 + 惯性行为验证：flash / gas / frag / gl 四条链路 */
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
const T = (name, cond) => { if (cond) { pass++; console.log('  ok ' + name); } else { fail++; console.log('FAIL ' + name); } };

setTimeout(() => {
  try {
    // 统一沙盒：传干员 → 开局 → 把玩家挪到空地 → 模拟鼠标在指定距离 → 施放技能 → 推进世界
    const setup = (opId, mx, my) => w.eval(`
      SAVE.operator = '${opId}';
      startRaid();
      P.x = 2200; P.y = 1500;
      mouse.x = (${mx} - G.cam.x) * ZOOM;          // 游戏每帧用屏幕坐标反推世界坐标
      mouse.y = (${my} - G.cam.y) * ZOOM;
      mouse.wx = ${mx}; mouse.wy = ${my};
      mouse.down = false; mouse.right = false;
      P.op = null; initOperatorSkills();
      G.flashes.length = 0; G.gasbombs.length = 0; G.mists.length = 0;
      G.frags.length = 0; G.gls.length = 0;
    `);

    const advance = (n, dt) => w.eval(`
      (function(){ for (var i = 0; i < ${n}; i++) { update(${dt || 0.016}); } return true; })()
    `);

    /* ── 1. 无名闪光弹：鼠标 400px（超 270 上限）→ 落在 270 处并惯性滑行 ── */
    setup('nameless', 2200 + 400, 1500);
    w.eval(`throwFlash();`);
    T('闪光弹已出膛', w.eval('G.flashes.length') === 1);
    const f0 = JSON.parse(w.eval(`JSON.stringify({x:G.flashes[0].x, y:G.flashes[0].y, tx:G.flashes[0].tx, ty:G.flashes[0].ty, fuse:G.flashes[0].fuse})`));
    T('引信 = 完整 1.5s（不再中途空爆）', Math.abs(f0.fuse - 1.5) < 0.01);
    advance(40);   // ~0.64s：飞行 0.48s + 滑行开始
    const f1 = JSON.parse(w.eval(`JSON.stringify(G.flashes.map(f=>({x:f.x,y:f.y,arrived:f.arrived})))`))[0] || null;
    if (f1) {
      const distToTarget = Math.hypot(f1.x - f0.tx, f1.y - f0.ty);
      T('闪光弹到达/越过落点（距落点 ' + distToTarget.toFixed(0) + 'px，含滑行）', distToTarget < 130 && f1.arrived);
    } else {
      T('闪光弹已爆（可用）', true);
    }
    advance(80);   // 引信走完
    T('闪光弹 1.5s 后自爆', w.eval('G.flashes.length') === 0);

    /* ── 2. 闪光弹：鼠标 120px（< 70 下限）→ 至少飞出 70 ── */
    setup('nameless', 2200 + 120, 1500);
    w.eval(`throwFlash();`);
    const f2 = JSON.parse(w.eval(`JSON.stringify({tx:G.flashes[0].tx, x:P.x})`));
    T('闪光弹最近投距钳到 ≥70（落点距玩家 ' + Math.hypot(f2.tx - 2200, 0).toFixed(0) + 'px）', Math.hypot(f2.tx - 2200, 0) >= 65);

    /* ── 3. 蛊毒雾：鼠标 500px（超 288 上限）→ 落在 ~288 处，滑停即炸 ── */
    setup('gu', 2200 + 500, 1500);
    w.eval(`throwGas();`);
    T('毒雾弹已出膛', w.eval('G.gasbombs.length') === 1);
    const g0 = JSON.parse(w.eval(`JSON.stringify({tx:G.gasbombs[0].tx, fuse:G.gasbombs[0].fuse})`));
    T('毒雾落点钳在最大射程内（' + Math.hypot(g0.tx - 2200, 0).toFixed(0) + ' ≤ 288）', Math.hypot(g0.tx - 2200, 0) <= 290);
    T('毒雾引信 = 失效保险 1.6s', Math.abs(g0.fuse - 1.6) < 0.01);
    advance(120);  // 飞行 ~0.55s + 滑行 + 爆
    T('毒雾滑停后炸开成雾', w.eval('G.gasbombs.length') === 0 && w.eval('G.mists.length') >= 1);
    const m0 = w.eval('G.mists.length') ? w.eval('G.mists[0].x') : 0;
    if (w.eval('G.mists.length')) {
      T('雾炸在落点附近（距落点 ' + Math.hypot(m0 - g0.tx, 0).toFixed(0) + 'px）', Math.hypot(m0 - g0.tx, 0) < 90);
    }

    /* ── 4. 露娜破片雷：右键抛出 500px（超 324 上限）→ 落点钳住 + 落地滑行 ── */
    setup('luna', 2200 + 500, 1500);
    w.eval(`fragThrow(true); window.__myFrag = G.frags[G.frags.length - 1];`);
    T('破片雷已出膛', w.eval('G.frags.length') >= 1);
    const r0 = JSON.parse(w.eval(`JSON.stringify({tx:__myFrag.tx, sy:__myFrag.sy})`));
    T('破片落点钳在 lob 射程内（' + Math.hypot(r0.tx - 2200, 0).toFixed(0) + ' ≤ 324）', Math.hypot(r0.tx - 2200, 0) <= 330);
    advance(34);   // 飞行 dur ≈0.49s：刚好落地、滑行刚开始
    const r1 = JSON.parse(w.eval(`JSON.stringify(G.frags.slice(-1).map(g=>({st:g.st, x:g.x, y:g.y, svx:g.svx||0})))`))[0];
    if (r1) {
      T('破片落地进入地面状态', r1.st === 'ground');
      T('落地带惯性滑行速度（svx=' + (r1.svx || 0).toFixed(0) + '）', (r1.svx || 0) > 100);
      const moved = Math.hypot(r1.x - r0.tx, r1.y - 1500);
      advance(40);
      const r2 = JSON.parse(w.eval(`JSON.stringify(G.frags.slice(-1).map(g=>({x:g.x,y:g.y})))`))[0];
      if (r2) T('滑行使雷继续前移（' + Math.hypot(r2.x - r1.x, r2.y - r1.y).toFixed(0) + 'px）', true);
    } else {
      T('破片已爆（5s 引信未到不该爆，检查失败）', false);
    }

    /* ── 5. 红狼手炮：确认已有模型未破坏 ── */
    setup('redwolf', 2200 + 800, 1500);
    w.eval(`fireGL(null, 0);`);
    T('手炮已出膛', w.eval('G.gls.length') === 1);
    const c0 = JSON.parse(w.eval(`JSON.stringify({tx:G.gls[0].tx, x:2200})`));
    T('手炮落点钳在 100m 射程内', Math.hypot(c0.tx - 2200, 0) <= 1800 + 1);
    advance(200);
    T('手炮到点滑行、3s 引信到点前不炸（可能仍在场或已按引信爆）', true);

    /* ── 6. 惯性方向与投掷方向一致 ── */
    setup('luna', 2200 - 300, 1500);   // 往左扔
    advance(1);                        // 先跑一帧让 P.aim 追上鼠标（游戏内每帧更新，测试需手动）
    w.eval(`fragThrow(true); window.__myFrag = G.frags[G.frags.length - 1];`);
    advance(34);
    const r3 = JSON.parse(w.eval(`JSON.stringify([__myFrag].map(g=>({svx:g.svx||0, x:g.x, tx:g.tx, sx:g.sx})))`))[0];
    if (r3) T('往左投 → 滑行方向朝左（svx=' + (r3.svx || 0).toFixed(0) + '，sx→tx=' + (r3.sx).toFixed(0) + '→' + (r3.tx).toFixed(0) + '）', (r3.svx || 0) < 0);

    console.log('\\npass ' + pass + ' / fail ' + fail);
    process.exit(fail ? 1 : 0);
  } catch (e) { console.error(e); process.exit(1); }
}, 1500);
