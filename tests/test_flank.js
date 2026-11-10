/* 敌人侧翼包抄：进入战斗时指派 / 场上唯一 / 绕侧移动方向 / 到位或超时归零 */
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
    // ── 1. 进入战斗时的指派 ──
    const asg = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        G.obstacles = [];
        G.enemies = [];
        var a = spawnEnemy('runner', 400, 0);
        var b = spawnEnemy('shooter', 420, 80);
        G.enemies = [a, b];
        var rnd = Math.random;
        Math.random = function(){ return 0; };   // 强制命中 55% 判定、固定左偏
        enterCombat(a, 0, 0, true);
        enterCombat(b, 0, 0, true);
        Math.random = rnd;
        var out = { a: a.flankOn > 0, b: b.flankOn > 0, t: a.flankOn, ang: a.flankAng };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('进入战斗有概率指派 flanker', asg.a === true);
    T('场上同时只有一名 flanker', asg.b === false);
    T('绕行时长在 2.5–4s', asg.t >= 2.5 && asg.t <= 4);

    // ── 2. 绕侧移动方向：往玩家侧面走，而不是直线贴脸 ──
    const mv = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        G.obstacles = [];
        var e = spawnEnemy('runner', 400, 0);
        G.enemies = [e];
        e.state = 'combat'; e.facing = Math.PI; e.flankOn = 3; e.flankAng = Math.PI / 2;
        var y0 = e.y, x0 = e.x;
        updateEnemies(0.05);
        var out = { dx: e.x - x0, dy: e.y - y0 };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('flanker 向侧方绕行（y 明显前进）', mv.dy > 8);
    T('不直接贴脸（同时保留朝玩家的横向分量）', mv.dx < -2);

    // ── 3. 到位 / 超时归零 ──
    const done = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0;
        G.obstacles = [];
        var e = spawnEnemy('runner', 120, 0);
        G.enemies = [e];
        e.state = 'combat'; e.facing = Math.PI; e.flankOn = 0.05; e.flankAng = Math.PI / 2;
        updateEnemies(0.1);
        var afterT = e.flankOn;
        var e2 = spawnEnemy('runner', 0, 280);   // 已经站到侧后点附近
        G.enemies = [e2];
        e2.state = 'combat'; e2.facing = Math.PI; e2.flankOn = 3; e2.flankAng = Math.PI / 2;
        updateEnemies(0.05);       // 距侧后点已 <70px → 立即归零
        var near = e2.flankOn;
        G.enemies = [];
        return JSON.stringify({ afterT: afterT, near: near });
      })()`));
    T('计时耗尽后回到正面打法', done.afterT <= 0);
    T('已到侧后位置就不再绕（归零）', done.near === 0);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
