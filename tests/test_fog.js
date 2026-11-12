/* 迷雾穿墙：柔化模糊与玩家照明都不得越过墙体 —— 墙后保持纯黑 */
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
  /* ── 1. fogSoften：亮 alpha 不得顺着卷积核抹过墙 ── */
  const soften = w.eval(`(function(){
    FOG.cols = 5; FOG.rows = 3;
    FOG.block = new Uint8Array(15);
    for (let r = 0; r < 3; r++) FOG.block[r * 5 + 2] = 1;   // 第 2 列整列是墙
    FOG.img = { data: new Uint8ClampedArray(15 * 4) };
    for (let i = 0; i < 15; i++) {
      const a = (i % 5) <= 1 ? 10 : ((i % 5) >= 3 ? 250 : 10);   // 亮 | 亮 | 墙(亮) | 暗 | 暗
      FOG.img.data[i * 4 + 3] = a;
    }
    FOG.soft = null;
    fogSoften();
    const d = FOG.img.data;
    return {
      wall: d[(1 * 5 + 2) * 4 + 3],          // 墙格：原样保留
      brightSide: d[(1 * 5 + 1) * 4 + 3],    // 墙左侧亮格：不吃到墙格的值
      darkSide: d[(1 * 5 + 3) * 4 + 3],      // 墙右侧暗格：不吃到墙格的亮度
    };
  })()`);
  T('墙格 alpha 不被柔化改动（原样 10）', soften.wall === 10);
  T('墙左侧亮格保持亮（10）', soften.brightSide === 10);
  T('墙右侧暗格保持暗（250，修复前会被抹成 ~200）', soften.darkSide === 250);

  /* ── 2. 实景：玩家贴墙站，雾与射线止步于墙 ── */
  const live = w.eval(`(function(){
    loadBuiltinMap('zero-dam', true); startRaid();
    P.invuln = 99999;
    // 找一面横墙：厚 40~140、宽 >300、远离边界
    var wall = null;
    for (var i = 0; i < G.obstacles.length; i++) {
      var o = G.obstacles[i];
      if (o.h >= 40 && o.h <= 140 && o.w > 300 && o.y > 400 && o.y + o.h < WORLD.h - 400 && o.x > 200 && o.x + o.w < WORLD.w - 200) { wall = o; break; }
    }
    if (!wall) return { err: 'no wall' };
    P.x = wall.x + wall.w / 2;
    P.y = wall.y + wall.h + P.r + 220;
    P.aim = -Math.PI / 2;
    P.ads = 0;
    FOG.lastX = -99999; FOG.timer = 0;
    updateFog(1);
    var cell = FOG.cell;
    var col = (P.x / cell) | 0;
    var rBot = (((wall.y + wall.h) / cell) | 0);
    // 墙上方（外侧）取 3 格：全部应为未点亮且接近纯黑
    var far = [];
    for (var r = rBot - 1; r >= rBot - 3 && r >= 0; r--) {
      var idx = r * FOG.cols + col;
      far.push({ vis: FOG.vis[idx], a: FOG.img.data[idx * 4 + 3] });
    }
    // 正对墙的射线：终点不应深过墙面太多（墙格深 + 一格余量）
    var upRay = null;
    for (var a = 0; a < 300; a++) {
      var ang = a * Math.PI * 2 / 300;
      if (Math.abs(Math.sin(ang) + 1) < 0.02 && Math.cos(ang) > -0.02) { upRay = FOG.rayD[a]; break; }
    }
    var distToWall = P.y - wall.y;    // 玩家到墙远侧表面的距离
    return {
      far: far,
      upRay: upRay,
      distToWall: distToWall,
      rayDAllocated: !!FOG.rayD && FOG.rayD.length === 300,
    };
  })()`);
  if (live.err) { T('实景场景建立（找到合适的墙）', false); }
  else {
    T('FOG.rayD 已分配（300 根射线）', live.rayDAllocated);
    T('正对墙的射线止步于墙格内（' + Math.round(live.upRay) + ' ≤ ' + Math.round(live.distToWall + 30) + '）',
      live.upRay <= live.distToWall + 30);
    var allDark = live.far.every(function(c){ return c.vis === 0 && c.a >= 240; });
    T('墙外 3 格全部未点亮且接近纯黑（vis=0, alpha≥240）', allDark);
    T('墙外格子没有一格被点亮', live.far.every(function(c){ return c.vis === 0; }));
  }

  /* ── 3. 薄墙：16px 薄墙贴墙站不得穿透 ──
     旧的按距离豁免（40px 内不判遮挡）会让射线整条穿过薄墙，墙外全亮。
     两种姿态：hug = 贴墙下沿；inside = 中心落在墙的栅格脚印内（旧豁免的主泄漏路径） */
  const thin = w.eval(`(function(){
    loadBuiltinMap('zero-dam', true); startRaid();
    P.invuln = 99999;
    var wall = null;
    for (var i = 0; i < G.obstacles.length; i++) {
      var o = G.obstacles[i];
      if (o.h >= 40 && o.h <= 140 && o.w > 300 && o.y > 400 && o.y + o.h < WORLD.h - 400 && o.x > 200 && o.x + o.w < WORLD.w - 200) { wall = o; break; }
    }
    if (!wall) return { err: 'no wall' };
    wall.y = wall.y + Math.floor((wall.h - 16) / 2);
    wall.h = 16;
    rebuildFogBlock();                          // 障碍改小后重建脚印 + cellObs
    var cell = FOG.cell;
    var col = (wall.x + wall.w / 2) / cell | 0;
    var rTop = ((wall.y / cell) | 0);
    function probe(py) {
      P.x = wall.x + wall.w / 2;
      P.y = py;
      P.aim = -Math.PI / 2;
      P.ads = 0;
      var own = FOG.block[(((P.y / cell) | 0) * FOG.cols + ((P.x / cell) | 0))];
      FOG.lastX = -99999; FOG.timer = 0;
      updateFog(1);
      var far = [];
      for (var r = rTop - 1; r >= rTop - 3 && r >= 0; r--) {
        var idx = r * FOG.cols + col;
        far.push({ vis: FOG.vis[idx], a: FOG.img.data[idx * 4 + 3] });
      }
      return { own: own, far: far };
    }
    return {
      hug: probe(wall.y + wall.h + P.r + 2),      // 贴墙下沿
      inside: probe(wall.y + wall.h - 6),         // 中心在墙脚印格内
    };
  })()`);
  if (thin.err) { T('薄墙场景建立', false); }
  else {
    T('贴墙下沿：薄墙外 3 格全部未点亮且接近纯黑',
      thin.hug.far.every(function(c){ return c.vis === 0 && c.a >= 240; }));
    T('inside 姿态玩家中心格在墙的栅格脚印内（旧豁免的泄漏路径被覆盖）', thin.inside.own === 1);
    T('中心在墙脚印内：薄墙外 3 格全部未点亮且接近纯黑',
      thin.inside.far.every(function(c){ return c.vis === 0 && c.a >= 240; }));
  }

  /* ── 4. 阴影边缘连续性：玩家 1px 步进靠近墙，射线终点不得跳变（抖动回归护栏）──
     旧实现阴影贴着「格脚印边界」而不是墙皮，玩家跨格瞬间终点跳最多 26px */
  const smooth = w.eval(`(function(){
    loadBuiltinMap('zero-dam', true); startRaid();
    P.invuln = 99999;
    var wall = null;
    for (var i = 0; i < G.obstacles.length; i++) {
      var o = G.obstacles[i];
      if (o.h >= 40 && o.h <= 140 && o.w > 300 && o.y > 400 && o.y + o.h < WORLD.h - 400 && o.x > 200 && o.x + o.w < WORLD.w - 200) { wall = o; break; }
    }
    if (!wall) return { err: 'no wall' };
    var faceY = wall.y + wall.h;                 // 墙的远侧表面（朝玩家这面）
    // 选一条竖直无遮挡路径：路径上不能有其他障碍（否则玩家被传进障碍里，射线起点就在矩形内）
    var px0 = -1;
    for (var cand = wall.x + 20; cand < wall.x + wall.w - 20; cand += 8) {
      var clear = true;
      for (var i5 = 0; i5 < G.obstacles.length; i5++) {
        var ob = G.obstacles[i5];
        if (ob === wall) continue;
        if (cand >= ob.x && cand <= ob.x + ob.w && faceY + 18 <= ob.y + ob.h && faceY + 60 >= ob.y) { clear = false; break; }
      }
      if (clear) { px0 = cand; break; }
    }
    if (px0 < 0) return { err: 'no clear path' };
    function step(py) {
      P.x = px0;
      P.y = py;
      P.aim = -Math.PI / 2;
      P.ads = 0;
      FOG.lastX = -99999; FOG.timer = 0;
      updateFog(1);
      var best = -1;
      for (var a = 0; a < 300; a++) {
        var ang = a * Math.PI * 2 / 300;
        if (Math.abs(Math.sin(ang) + 1) < 0.02 && Math.cos(ang) > -0.02) { best = FOG.rayD[a]; break; }
      }
      return best;
    }
    var ds = [];
    for (var py = faceY + 18; py <= faceY + 60; py += 1) ds.push(step(py));
    var maxJump = 0;
    for (var i2 = 1; i2 < ds.length; i2++) maxJump = Math.max(maxJump, Math.abs(ds[i2] - ds[i2 - 1]));
    var err = 0;
    for (var i3 = 0; i3 < ds.length; i3++) {
      var expect = 18 + i3 + 2;                 // 玩家到墙面距离 + 2px 光铺量
      err = Math.max(err, Math.abs(ds[i3] - expect));
    }
    return { maxJump: maxJump, err: err, last: ds[0] };
  })()`);
  if (smooth.err === undefined) { T('连续移动场景建立', false); }
  else {
    T('1px 步进靠近墙：相邻两步射线终点跳变 ≤ 3px（实测 ' + smooth.maxJump.toFixed(1) + '）', smooth.maxJump <= 3);
    T('射线终点精确贴墙皮（偏差 ≤ 4px，实测 ' + smooth.err.toFixed(1) + '）', smooth.err <= 4);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 200);
