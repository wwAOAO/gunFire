/* 警戒本地化 + 增援延迟：
   ① 一次「看见」只惊动附近一圈（喊话半径 / 硬闸 / 追兵上限）
   ② 追远了会放弃回防，不会从半张图外一路走过来
   ③ 呼叫增援先挂 ETA、到点才进场；增援波只对附近的警报有反应 */
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
    // ── 1. 喊话只在附近一圈生效 ──
    const ring = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = []; G.backups = []; G.callCd = 0;
        var src = spawnEnemy('runner', 2050, 1600);
        var near = spawnEnemy('runner', 2150, 1600);    // 距发现者 100
        var mid  = spawnEnemy('runner', 2350, 1600);    // 距发现者 300
        var far  = spawnEnemy('runner', 3150, 1600);    // 距发现者 1100
        G.enemies = [src, near, mid, far];
        enterCombat(src, P.x, P.y, true);
        var out = { near: near.state, mid: mid.state, far: far.state, chain: mid.chain > 0 };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('喊话首跳半径内（100px）的人被叫来', ring.near === 'alert');
    T('喊话半径边缘（300px）的人也被叫来', ring.mid === 'alert' && ring.chain === true);
    T('喊话半径外（1100px）的人照常巡逻，不再全图动员', ring.far === 'patrol');

    // ── 2. 追兵封顶：一次发现最多拉来 ALERT.maxResponders 人 ──
    const cap = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = [];
        var src = spawnEnemy('runner', 2000, 1600);
        var list = [src];                      // spawnEnemy 自己会 push，先攒本地数组再赋值
        for (var i = 0; i < 20; i++) {
          list.push(spawnEnemy('runner',
            2000 + Math.cos(i / 20 * 6.283) * 220,
            1600 + Math.sin(i / 20 * 6.283) * 220));
        }
        G.enemies = list;
        enterCombat(src, 2000, 1600, true);
        var alerted = 0;
        for (var k = 0; k < G.enemies.length; k++) if (G.enemies[k].state === 'alert') alerted++;
        var out = { alerted: alerted, max: ALERT.maxResponders };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('20 个人围在 220px 内，只有 7 个被喊来（+发现者 = 上限 8）',
      cap.alerted === cap.max - 1);
    T('追兵上限生效（不再把整圈人全拉走）', cap.alerted < 20);

    // ── 3. 硬闸：链式喊话到点时，离发现点太远的人不进战斗 ──
    const gate = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = [];
        var e = spawnEnemy('runner', 2000, 2500);   // 距发现点 900 > chaseR
        e.sight = 1;
        G.enemies = [e];
        e.state = 'alert';
        e.lastSeenX = 2000; e.lastSeenY = 1600;
        e.chain = 0.01; e.chainHop = 1; e.investigateT = 13;
        updateEnemies(0.05);
        var out = { state: e.state, chain: e.chain, off: Math.abs(e.lastSeenX - e.x) };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('900px 外的人听完喊话仍是警戒，没有进战斗', gate.state === 'alert');
    T('链式计时被清掉（不会每帧重试）', gate.chain === 0);
    T('原地犯疑：搜索点落回自己身边，不跨半张图去凑热闹', gate.off <= 61);

    // ── 4. 追远了放弃回防 ──
    const giveUp = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = [];
        var e = spawnEnemy('runner', 2000, 2100);
        e.sight = 1;
        e.state = 'combat'; e.chaseX = 2000; e.chaseY = 2800; e.loseT = 0;
        G.enemies = [e];
        updateEnemies(0.05);
        var out = {
          state: e.state,
          home: e.lastSeenX === e.homeX && e.lastSeenY === e.homeY,
        };
        G.enemies = [];
        return JSON.stringify(out);
      })()`));
    T('从锚点算追出 1200px 还没咬住 → 退出战斗', giveUp.state === 'alert');
    T('放弃后搜索点指向自己的点位（回防）', giveUp.home === true);

    // ── 5. 呼叫增援：先挂 ETA，到点才进场 ──
    const backup = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.enemies = []; G.backups = []; G.callCd = 0; G.enemyCap = 42;
        G.nests = [{ x: 600, y: 600 }, { x: 2600, y: 600 }];
        callBackup(2000, 1600);
        var q1 = G.backups.length, eta = G.backups[0] ? G.backups[0].t : 0;
        var n0 = G.backups[0] ? G.backups[0].n : 0;
        callBackup(2000, 1600);                 // 冷却中：不重复挂单
        var q2 = G.backups.length;
        var right0 = G.enemies.length;          // 刚喊完：场上一个人都没多
        updateBackups(1);
        var after1 = G.enemies.length;
        updateBackups(60);                      // 跨过 ETA
        var out = {
          q1: q1, q2: q2, eta: eta, n: n0,
          right0: right0, after1: after1,
          arrived: G.enemies.length,
          state: G.enemies[0] ? G.enemies[0].state : '',
          dist: G.enemies[0] ? dist(G.enemies[0].x, G.enemies[0].y, P.x, P.y) : 0,
        };
        G.enemies = []; G.backups = []; G.callCd = 0;
        return JSON.stringify(out);
      })()`));
    T('呼叫增援只挂一张单，不当场刷人', backup.q1 === 1 && backup.right0 === 0);
    T('ETA 在 22–32 秒之间', backup.eta >= 22 && backup.eta <= 32);
    T('冷却内的第二次呼叫被吞掉', backup.q2 === 1);
    T('ETA 没到之前一直没人在路上', backup.after1 === 0);
    T('ETA 到点后 2–3 人进场', backup.arrived === backup.n && backup.n >= 2 && backup.n <= 3);
    T('增援进场即警戒（知道该往哪走）', backup.state === 'alert');
    T('集结点不在玩家眼皮底下（≥300px）', backup.dist >= 300);

    // ── 6. 增援波：只对附近的警报有反应 ──
    const wave = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = []; G.backups = [];
        G.nests = [{ x: 400, y: 400 }, { x: 3600, y: 2600 }];
        G.alarm = 1; G.lastAlarmX = 400; G.lastAlarmY = 400;
        G.reinforceWave = 0; G.enemyCap = 42;
        spawnReinforce();
        var bad = 0, near = 0;
        for (var i = 0; i < G.enemies.length; i++) {
          var e = G.enemies[i];
          if (dist(e.x, e.y, 400, 400) > ALERT.waveAwareR) { if (e.state !== 'patrol') bad++; }
          else near++;
        }
        var out = { bad: bad, tot: G.enemies.length, near: near };
        G.enemies = []; G.reinforceWave = 0; G.alarm = 0;
        return JSON.stringify(out);
      })()`));
    T('增援波照常来人（不少于 3 个）', wave.tot >= 3);
    T('远端集结点刷出来的人不会跟着去抄你（照常巡逻）', wave.bad === 0);

    // ── 7. 安全总监的坐标共享：全场 → 半径 ──
    const mark = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 2000; P.y = 1600;
        G.obstacles = []; G.enemies = [];
        var a = spawnEnemy('runner', 2100, 1600, 'havk');
        var b = spawnEnemy('runner', 2000, 2900, 'havk');   // 1300px 外
        a.sight = 1; b.sight = 1;
        G.enemies = [a, b];
        G.directorMarkT = 10;
        updateEnemies(0.05);
        var out = { a: a.state, b: b.state };
        G.enemies = []; G.directorMarkT = 0;
        return JSON.stringify(out);
      })()`));
    T('总监标记范围内（100px）的哈夫克被点亮', mark.a !== 'patrol');
    T('标记范围外（1300px）的哈夫克不受影响', mark.b === 'patrol');

    // ── 8. 增援节奏拉长 ──
    const pace = JSON.parse(w.eval(`
      JSON.stringify({
        first: firstReinforceDelay(), gap0: reinforceGap(0), gap1: reinforceGap(1),
        hopR: ALERT.hopR, chaseR: ALERT.chaseR, maxResp: ALERT.maxResponders,
        maxHop: ALERT.maxHop, giveUpR: ALERT.giveUpR,
      })`));
    T('普通图首波增援 90s → 115s', pace.first === 115);
    T('首波后的间隔 55s → 76s（递减更快，下限 40s）', pace.gap0 === 76 && pace.gap1 === 73);
    T('喊话深度 3 跳 → 2 跳、首跳 520 → 330', pace.maxHop === 2 && pace.hopR === 330);
    T('硬闸 700px / 追兵 8 人 / 放弃 1150px',
      pace.chaseR === 700 && pace.maxResp === 8 && pace.giveUpR === 1150);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
