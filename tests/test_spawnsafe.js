/* 出生点安全：落地不能一睁眼就被守军看见
   ① 数据层（生成器校验）：每个出生点不压墙，且无守军能在「巡逻 200 + 兵种视野」
      内无遮挡看到落点（朝向开局随机，视线通即有被发现的概率）
   ② 运行层（secureSpawnArea）：开局把出生点半径 780 内的守军全部挪到圈外，
      所有地图通用（780 ≥ 最大视野 520 + 巡逻 200 = 720）
   ③ 变体继承：机密变体共用同一布局，必须同样安全 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadDom, fullSource } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = fullSource();   // index.html + 全部 js 模块源码（源码正则断言用）
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

const GUARD_SIGHT = { runner: 320, shooter: 350, brute: 300, boss: 520, sniper: 500,
                      rocket: 460, flamer: 300, cryo: 420, cryoT: 400, cryoS: 330, nader: 440 };
const PATROL_WANDER = 200, SPAWN_SAFE_DIST = 520, SECURE_R = 780;

function segHitsRect(x1, y1, x2, y2, o) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - o.x, o.x + o.w - x1, y1 - o.y, o.y + o.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}
/* 静态判定：出生点是否被某守军视线威胁 */
function spawnThreats(sp, map) {
  return map.units.filter(u => {
    const sight = GUARD_SIGHT[u.type] || 320;
    const d = Math.hypot(u.x - sp.x, u.y - sp.y);
    if (d - PATROL_WANDER > Math.max(sight, SPAWN_SAFE_DIST)) return false;
    return !map.obstacles.some(o => segHitsRect(u.x, u.y, sp.x, sp.y, o));
  });
}
function onWall(sp, map, r) {
  return map.obstacles.some(o => {
    const nx = Math.max(o.x, Math.min(sp.x, o.x + o.w));
    const ny = Math.max(o.y, Math.min(sp.y, o.y + o.h));
    return (sp.x - nx) ** 2 + (sp.y - ny) ** 2 < r * r;
  });
}

setTimeout(() => {
  try {
    // ── 1. 数据层：零号大坝（含机密变体）每个出生点都安全 ──
    const maps = JSON.parse(w.eval(`JSON.stringify({
      normal: BUILTIN_MAPS['zero-dam'],
      secret: BUILTIN_MAPS['zero-dam-secret'],
    })`));
    for (const [tag, m] of Object.entries(maps)) {
      T(`[${tag}] 出生点 ${m.spawns.length} 个全部不压墙`,
        m.spawns.every(s => !onWall(s, m, 16)));
      const bad = m.spawns.map((s, i) => ({ i, t: spawnThreats(s, m) })).filter(x => x.t.length);
      T(`[${tag}] 无出生点处于守军视线威胁内`, bad.length === 0);
      if (bad.length) console.log('    不安全: ' + JSON.stringify(bad.map(b => ({ i: b.i, t: b.t.map(u => u.type) }))));
    }
    T('机密变体出生点与普通版一致（继承同一布局）',
      JSON.stringify(maps.secret.spawns) === JSON.stringify(maps.normal.spawns));

    // ── 2. 源码：落地安全区全地图通用 ──
    T('secureSpawnArea(780) 无条件调用（不再是航天基地专属）',
      /secureSpawnArea\(780\);/.test(src) && !/if \(G\.extMode === 'switch'\) secureSpawnArea/.test(src));

    // ── 3. 运行层：落位守军后 secureSpawnArea 必须清空出生点半径 ──
    //    每个出生点都重建一套新守军（对齐真实单局：一局只用一个出生点）
    const rt = JSON.parse(w.eval(`
      (function(){
        var out = [];
        for (var si = 0; si < G.spawns.length; si++) {
          var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam'])));
          r.map.builtin = 'zero-dam';
          applyMapData(r.map);
          G.enemies.length = 0;
          for (var i = 0; i < G.units.length; i++) {
            var u = G.units[i];
            spawnEnemy(u.type, u.x, u.y, u.f);
          }
          G.spawn = { x: G.spawns[si].x, y: G.spawns[si].y };
          var moved = secureSpawnArea(780);
          var minD = Infinity, who = '';
          for (var j = 0; j < G.enemies.length; j++) {
            var e = G.enemies[j];
            if (!e || e.hp <= 0) continue;
            var d = Math.hypot(e.x - G.spawn.x, e.y - G.spawn.y);
            if (d < minD) { minD = d; who = e.type; }
          }
          // 巡逻锚点必须搬出安全圈：锚点在圈内 = 守军会朝出生点走回来
          var patrolBack = 0;
          for (var j2 = 0; j2 < G.enemies.length; j2++) {
            var e2 = G.enemies[j2];
            if (!e2 || e2.hp <= 0) continue;
            if (Math.hypot(e2.homeX - G.spawn.x, e2.homeY - G.spawn.y) < 780) patrolBack++;
          }
          out.push({ si: si, moved: moved, minD: Math.round(minD), who: who, patrolBack: patrolBack });
        }
        return JSON.stringify(out);
      })()`));
    const rounds = rt;
    // 安全不变量：圈内必须清空；圈外最近的守军就算巡逻到极限（-200）
    // 也超出最大视野 520（狙击/BOSS），不可能看见出生点
    T('安全圈内清空，圈外守军巡逻极限仍在视野之外（minD ≥ 780 且 minD-200 > 520）',
      rounds.every(r => r.minD >= 780 && r.minD - 200 > 520));
    T('巡逻目标全部搬出安全圈（守军不朝出生点走回来）',
      rounds.every(r => r.patrolBack === 0));
    T('确实有守军被挪动（兜底真实生效）', rounds.some(r => r.moved > 0));
    if (!rounds.every(r => r.minD >= 870)) console.log('    ' + JSON.stringify(rounds));

    // ── 4. 磁盘文件与内置一致 ──
    const disk = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', 'zero-dam.json'), 'utf8'));
    T('maps/zero-dam.json 与 index.html 内置地图逐字节一致',
      w.eval(`JSON.stringify(BUILTIN_MAPS['zero-dam'])`) === JSON.stringify(disk));

  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
