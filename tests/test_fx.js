/* 敌人 debuff 计时收敛：tickEnemyFx 统一衰减、字段与公式不变 */
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
    const meta = JSON.parse(w.eval(`JSON.stringify({
      fn: typeof tickEnemyFx,
      used: /tickEnemyFx\\(e, dt\\)/.test(updateEnemies.toString()),
      dup: (updateEnemies.toString().match(/e\\.blind = Math\\.max/g) || []).length
    })`));
    T('tickEnemyFx 已定义', meta.fn === 'function');
    T('updateEnemies 调用统一 tick', meta.used);
    T('旧的分散衰减已移除（无重复扣减）', meta.dup === 0);

    const decay = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 5000; P.y = 5000;
        G.obstacles = [];
        var e = spawnEnemy('runner', 0, 0);
        G.enemies = [e];
        e.state = 'patrol';
        e.stun = 1; e.kd = 1; e.cripple = 1; e.mark = 1; e.healSlow = 1;
        e.blind = 1; e.trauma = 1; e.careCd = 1; e.stagger = 1;
        updateEnemies(0.5);
        var out = { stun: e.stun, kd: e.kd, cripple: e.cripple, mark: e.mark,
                    healSlow: e.healSlow, blind: e.blind, trauma: e.trauma,
                    careCd: e.careCd, stagger: e.stagger };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    const keys = ['stun', 'kd', 'cripple', 'mark', 'healSlow', 'blind', 'trauma', 'careCd', 'stagger'];
    T('9 个计时字段按 dt 精确衰减（1 → 0.5）', keys.every(k => Math.abs(decay[k] - 0.5) < 1e-6));

    const pos = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 3000; P.y = 3000;
        G.obstacles = [];
        var e = spawnEnemy('runner', 0, 0);
        G.enemies = [e];
        e.state = 'combat'; e.stun = 9;
        var x0 = e.x, y0 = e.y;
        updateEnemies(0.2);          // 眩晕中：不移动
        var moved = Math.abs(e.x - x0) + Math.abs(e.y - y0);
        G.enemies = [];
        return JSON.stringify({ moved: moved });
      })()`));
    T('眩晕期间仍然原地不动（行为未变）', pos.moved < 1);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
