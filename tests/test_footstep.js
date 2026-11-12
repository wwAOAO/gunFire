/* 敌人 3D 脚步声：方位声像 / 身后闷声 / 距离衰减 / 重甲加成 / 每帧预算 / 步距积累挂载 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { inlineScripts, fullSource } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = fullSource();   // index.html + 全部 js 模块源码（源码正则断言用）
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
    // ── 1. 源码结构：发声器 / 挂载点 / 预算 ──
    T('audio.js 定义 step3d 且走 StereoPanner', /step3d\(pan, vol, behind, heavy\)/.test(src) && src.includes('createStereoPanner'));
    T('身后的脚步套低通（420Hz 闷声）', /behind \? 420 :/.test(src));
    T('敌人位移处积累步距（stepDist 挂载）', /e\.stepDist = \(e\.stepDist \|\| 0\) \+ moved/.test(src) && /enemyFootstep\(e\)/.test(src));
    T('updateEnemies 每帧重置脚步预算', /G\.stepBudget = 5/.test(src));
    T('战斗状态步频更快（步幅 24 < 巡逻 30）', /e\.state === 'combat' \? 24 : 30/.test(src));

    // ── 2. 方位几何：footPanVol ──
    const r = w.eval(`(function(){
      var out = {};
      startRaid();
      P.invuln = 99999;
      P.x = 1000; P.y = 1000; P.aim = 0;              // 玩家朝东（屏幕右）
      function mk(x, y, state, type) {
        var e = G.enemies[0];
        e.x = x; e.y = y; e.state = state || 'patrol'; e.type = type || 'grunt';
        return e;
      }
      // 正前方（东）：rel=0 → pan 居中，不是身后
      var f = footPanVol(mk(1200, 1000), false);
      out.front = { pan: f.pan, behind: f.behind, vol: +f.vol.toFixed(3) };
      // 左侧（北，屏幕上方）：面向东时左手边 → pan 显著为负
      var l = footPanVol(mk(1000, 800), false);
      out.left = { pan: +l.pan.toFixed(2), behind: l.behind };
      // 右侧（南）：pan 显著为正
      var rt = footPanVol(mk(1000, 1200), false);
      out.right = { pan: +rt.pan.toFixed(2), behind: rt.behind };
      // 正后方（西）：behind = true，声像居中
      var b = footPanVol(mk(800, 1000), false);
      out.back = { pan: +b.pan.toFixed(2), behind: b.behind };
      // 听力半径外：null
      out.far = footPanVol(mk(1700, 1000), false);
      // 重甲加成：同位置 heavy 版音量 ×1.8
      var e1 = mk(1150, 1000);
      var v1 = footPanVol(e1, false).vol, v2 = footPanVol(e1, true).vol;
      out.heavyRatio = +(v2 / v1).toFixed(2);
      // 战斗状态更响
      var vP = footPanVol(mk(1150, 1000, 'patrol')).vol, vC = footPanVol(mk(1150, 1000, 'combat')).vol;
      out.combatLouder = vC > vP;
      // 距离衰减：近的比远的响
      var vn = footPanVol(mk(1060, 1000)).vol, vf = footPanVol(mk(1400, 1000)).vol;
      out.nearLouder = vn > vf;
      out.ear = FOOTSTEP_EAR;
      endRaid(false);
      return JSON.stringify(out);
    })()`);
    const o = JSON.parse(r);
    T('正前方：声像居中、非身后', Math.abs(o.front.pan) < 0.01 && o.front.behind === false && o.front.vol > 0);
    T('左侧（面向东的北边）：pan 为负', o.left.pan < -0.5 && !o.left.behind);
    T('右侧（面向东的南边）：pan 为正', o.right.pan > 0.5 && !o.right.behind);
    T('正后方：behind=true 且声像居中', o.back.behind === true && Math.abs(o.back.pan) < 0.01);
    T('听力半径 520 之外听不见', o.far === null && o.ear === 520);
    T('重甲脚步音量 ×1.8', o.heavyRatio === 1.8);
    T('战斗状态脚步更响', o.combatLouder);
    T('距离衰减：近响远轻', o.nearLouder);

    // ── 3. 发声链路：enemyFootstep（假 Sfx 捕获参数）──
    const r2 = w.eval(`(function(){
      var out = {};
      startRaid();
      P.invuln = 99999; P.alive = true;
      P.x = 1000; P.y = 1000; P.aim = 0;
      var e = G.enemies[0];
      e.x = 1150; e.y = 1000; e.state = 'patrol'; e.type = 'grunt';
      var captured = [];
      var realStep = Sfx.step3d, realReady = Sfx.ready;
      Sfx.ready = true;
      Sfx.step3d = function(pan, vol, behind, heavy) { captured.push([pan, vol, behind, heavy]); };
      G.stepBudget = 3;
      enemyFootstep(e); enemyFootstep(e); enemyFootstep(e); enemyFootstep(e);
      out.captured = captured.length;
      out.budgetLeft = G.stepBudget;
      Sfx.ready = false;
      enemyFootstep(e);
      out.afterNoAudio = captured.length;
      Sfx.step3d = realStep; Sfx.ready = realReady;
      endRaid(false);
      return JSON.stringify(out);
    })()`);
    const o2 = JSON.parse(r2);
    T('预算内每步都发声（3 步预算发 3 声）', o2.captured === 3);
    T('预算耗尽后静默（防爆音）', o2.budgetLeft === 0 && o2.afterNoAudio === 3);

    // ── 4. 真实帧：移动的敌人积累步距并触发发声 ──
    const r3 = w.eval(`(function(){
      var out = {};
      startRaid();
      P.invuln = 99999; P.alive = true;
      P.x = 1000; P.y = 1000; P.aim = 0;
      var e = G.enemies[0];
      e.x = 1120; e.y = 1000; e.state = 'combat'; e.type = 'grunt';
      e.stepDist = 0;
      var captured = [];
      var realStep = Sfx.step3d, realReady = Sfx.ready;
      Sfx.ready = true;
      Sfx.step3d = function() { captured.push(1); };
      G.stepBudget = 99;
      for (var i = 0; i < 90; i++) update(1/60);       // 1.5 秒：战斗中的敌人朝玩家走
      out.moved = +(Math.hypot(e.x - 1120, e.y - 1000)).toFixed(1);
      out.stepDist = +(e.stepDist || 0).toFixed(1);
      out.steps = captured.length;
      Sfx.step3d = realStep; Sfx.ready = realReady;
      endRaid(false);
      return JSON.stringify(out);
    })()`);
    const o3 = JSON.parse(r3);
    T('敌人 1.5s 内真实位移且步距被消耗积累', o3.moved > 10 && o3.stepDist >= 0);
    T('移动的敌人真的发出了脚步声', o3.steps > 0);
  } catch (e) {
    fail++; console.log('FAIL  exception: ' + e.message);
  }
  console.log('\\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 300);
