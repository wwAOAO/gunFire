/* 新干员「无名」：重伤延滞 / 突破型闪光弹 / 旋刃飞行器 / 静默潜袭 */
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
    // ── 1. 数据表 ──
    const info = JSON.parse(w.eval(`JSON.stringify({
      has: !!OPERATORS.nameless,
      inOrder: OP_ORDER.indexOf('nameless'),
      inIds: !!OP_IDS.nameless,
      name: OPERATORS.nameless && OPERATORS.nameless.name,
      role: OPERATORS.nameless && OPERATORS.nameless.role,
      g: OPERATORS.nameless && OPERATORS.nameless.g.kind + '|' + OPERATORS.nameless.g.cd,
      v: OPERATORS.nameless && OPERATORS.nameless.v.kind + '|' + OPERATORS.nameless.v.cd + '|' + OPERATORS.nameless.v.charges,
      x: OPERATORS.nameless && OPERATORS.nameless.x.kind + '|' + OPERATORS.nameless.x.cd + '|' + OPERATORS.nameless.x.dur,
      p: OPERATORS.nameless && OPERATORS.nameless.passive.kind
    })`));
    T('OPERATORS 里有无名', info.has);
    T('OP_ORDER 末位是无名（大厅卡片第 6 个）', info.inOrder === 5);
    T('OP_IDS 白名单已加（存档可保存）', info.inIds);
    T('名字 / 定位：无名 · 突击', info.name === '无名' && info.role === '突击');
    T('G = 闪光弹 · CD 40s', info.g === 'flash|40');
    T('V = 旋刃 · CD 50s · 储备 1', info.v === 'blade|50|1');
    T('X = 静默 · CD 80s · 12s', info.x === 'silent|80|12');
    T('被动 = trauma（重伤延滞）', info.p === 'trauma');

    // ── 2. 开局储备 ──
    const st = JSON.parse(w.eval(`
      (function(){
        if (!P.op) initOperatorSkills();
        SAVE.operator = 'nameless';
        initOperatorSkills();
        return JSON.stringify({ g: P.op.g.use, v: P.op.v.use, x: P.op.x.use, xcd: P.op.x.cd });
      })()`));
    T('开局 G 储备 1', st.g === 1);
    T('开局 V 储备 1', st.v === 1);
    T('大招开局进 CD（80s）', st.xcd === 80);

    // ── 3. 闪光弹：面朝的被闪，背对的没事 ──
    const fl = JSON.parse(w.eval(`
      (function(){
        blastFX = function(){};                       // jsdom 里没有 canvas，跳过纯视觉
        G.obstacles = [];                             // 测试用空地：视线不被地图墙体挡
        P.alive = true; P.x = 2000; P.y = 2000; P.concuss = 0;
        G.flashBlind = 0;
        var front = { x: 60, y: 0, r: 12, facing: Math.PI, alive: true, hp: 100, maxHp: 100, type: 'runner', blind: 0, stun: 0, bandaging: false };
        var back  = { x: 0, y: 60, r: 12, facing: 0, alive: true, hp: 100, maxHp: 100, type: 'runner', blind: 0, stun: 0, bandaging: false };
        var far   = { x: 0, y: 1200, r: 12, facing: Math.PI, alive: true, hp: 100, maxHp: 100, type: 'runner', blind: 0, stun: 0, bandaging: false };
        G.enemies = [front, back, far];
        flashBlast(0, 0);
        return JSON.stringify({ front: front.blind, back: back.blind, far: far.blind, selfBlind: G.flashBlind });
      })()`));
    T('面朝爆点的敌人被致盲 2.4s 左右', fl.front > 1.8 && fl.front <= 2.4);
    T('背对爆点的敌人不被闪（只有墙上亮一下）', fl.back === 0);
    T('半径外的敌人不被闪', fl.far === 0);
    T('自己在远处不会被自己的闪光晃到', fl.selfBlind === 0);

    const fl2 = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        G.flashBlind = 0; P.concuss = 0; P.alive = true; P.x = 30; P.y = 0;
        G.enemies = [];
        flashBlast(0, 0);
        var r = { blind: G.flashBlind, concuss: P.concuss };
        P.x = 2000; P.y = 2000;
        return JSON.stringify(r);
      })()`));
    T('自己站在爆光里 → 白屏强度 > 0.5', fl2.blind > 0.5);
    T('自己站在爆光里 → 眩晕', fl2.concuss > 1);

    // ── 4. 旋刃：直掷命中 → 爆炸 / 流血 / 减速 / 重伤 ──
    const bl = JSON.parse(w.eval(`
      (function(){
        blastFX = function(){};
        G.obstacles = [];
        P.alive = true; P.x = 0; P.y = 0; P.aim = 0; P.concuss = 0;
        var e = { x: 120, y: 0, r: 16, facing: Math.PI, alive: true, hp: 500, maxHp: 500,
                  type: 'runner', blind: 0, stun: 0, kd: 0, cripple: 0, bleedN: 0, bleedT: 0,
                  trauma: 0, bandaging: false, invuln: 0, stagger: 0, bandageSlow: 1 };
        G.enemies = [e]; G.blades = [];
        fireBlade(null);
        var launched = G.blades.length;
        for (var i = 0; i < 120 && G.blades.length; i++) updateBlades(0.016);
        return JSON.stringify({ launched: launched, left: G.blades.length, hp: e.hp,
                                bleed: e.bleedN, cripple: e.cripple, trauma: e.trauma });
      })()`));
    T('短按投出 1 枚旋刃', bl.launched === 1);
    T('命中后旋刃消失（已引爆）', bl.left === 0);
    T('爆炸造成伤害', bl.hp < 500);
    T('附加流血 ×2', bl.bleed >= 2);
    T('附加减速 / 骨折 3.2s', bl.cripple >= 3.1);
    T('附加重伤 8s', bl.trauma >= 7.9);

    // ── 5. 旋刃：锁定 —— 背后比正面快 2 倍多 ──
    const lk = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'nameless'; initOperatorSkills();
        G.obstacles = [];
        P.alive = true; P.x = 0; P.y = 0; P.aim = 0;
        function run(behind){
          var e = { x: 200, y: 0, r: 14, facing: behind ? 0 : Math.PI, alive: true, hp: 100, maxHp: 100, type: 'runner' };
          G.enemies = [e];
          BLADE_LOCK.on = true; BLADE_LOCK.prog = 0; BLADE_LOCK.target = null; BLADE_LOCK.behind = false;
          bladeLockStep(0.1);
          return { prog: BLADE_LOCK.prog, behind: BLADE_LOCK.behind, tgt: !!BLADE_LOCK.target };
        }
        var back = run(true), front = run(false);
        BLADE_LOCK.on = false; BLADE_LOCK.target = null; BLADE_LOCK.prog = 0;
        return JSON.stringify({ back: back, front: front });
      })()`));
    T('锁定能选中准星方向的目标', lk.back.tgt === true);
    T('从背后锁定被标记为 behind', lk.back.behind === true);
    T('背后锁定速度约为正面的 2.4 倍', lk.back.prog > lk.front.prog * 2.0);

    // ── 6. 静默潜袭 ──
    const si = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'nameless'; initOperatorSkills();
        P.alive = true; P.x = 500; P.y = 500; G.directorMarkT = 6;
        var e = { x: 900, y: 500, r: 12, alive: true, state: 'combat', loseT: 2, investigateT: 0,
                  lastSeenX: 0, lastSeenY: 0, type: 'runner', blind: 0, stun: 0, kd: 0 };
        G.enemies = [e];
        fireSilent();
        var r = { on: P.op.x.on, t: P.op.x.t, cd: P.op.x.cd, mark: G.directorMarkT,
                  state: e.state, sx: e.lastSeenX, sy: e.lastSeenY, silent: silentOn() };
        return JSON.stringify(r);
      })()`));
    T('按 X 进入 12 秒静默', si.on === true && si.t === 12);
    T('大招进 80 秒冷却', si.cd === 80);
    T('启动瞬间清掉安全总监标记', si.mark === 0);
    T('正在追你的敌人被打回搜索状态', si.state === 'alert');
    T('敌人只记住开大瞬间的位置', si.sx === 500 && si.sy === 500);
    T('silentOn() 生效中', si.silent === true);

    // 噪音压制：静默期间 300px 外的敌人不该被普通枪声惊动
    const nz = JSON.parse(w.eval(`
      (function(){
        function probe(){
          var e = { x: P.x + 300, y: P.y, state: 'alert', alertMeter: 0, investigateT: 0,
                    lastSeenX: 0, lastSeenY: 0, alive: true };
          G.enemies = [e];
          emitNoise(P.x, P.y, 700, 0.8, true);
          return e.investigateT;
        }
        P.op.x.on = true; P.op.x.t = 5;
        var quiet = probe();
        P.op.x.on = false;
        var loud = probe();
        return JSON.stringify({ quiet: quiet, loud: loud });
      })()`));
    T('静默中开枪：300px 外敌人听不到', nz.quiet === 0);
    T('非静默开枪：300px 外敌人会来查看', nz.loud > 0);

    // 脚印：静默期间不落
    const fp = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 700; P.y = 700; P.vx = 120; P.vy = 0; P.sprinting = true;
        G.footprints = [];
        P.op.x.on = false;
        FOOT_ACC = 1;
        updateFootprints(0.05);
        var normal = G.footprints.length;
        G.footprints = []; FOOT_ACC = 1;
        P.op.x.on = true; P.op.x.t = 5;
        updateFootprints(0.05);
        var silent = G.footprints.length;
        P.op.x.on = false; P.vx = 0; P.vy = 0; P.sprinting = false;
        return JSON.stringify({ normal: normal, silent: silent });
      })()`));
    T('平时跑动会留脚印', fp.normal === 1);
    T('静默期间一个脚印都不留', fp.silent === 0);

    // ── 7. 被动：重伤延滞 ──
    const tr = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'nameless'; initOperatorSkills();
        var e = { x: 0, y: 0, r: 12, alive: true, hp: 900, maxHp: 900, type: 'runner',
                  blind: 0, stun: 0, kd: 0, bleedN: 0, bleedT: 0, trauma: 0, bandaging: false, invuln: 0, stagger: 0 };
        G.enemies = [e];
        var rnd = Math.random, hits = 0, bleeds = 0;
        Math.random = function(){ return 0.0; };      // 强制触发流血判定
        for (var i = 0; i < 5; i++) { damageEnemy(e, 10, 1, 0, 0); }
        Math.random = rnd;
        return JSON.stringify({ trauma: e.trauma, bleed: e.bleedN, bleedT: e.bleedT, hp: e.hp });
      })()`));
    T('被打中挂上 8 秒重伤', tr.trauma >= 7.9);
    T('被动把流血挂上去（最多 3 层）', tr.bleed === 3);
    T('流血持续 5 秒', tr.bleedT > 4.9);

    // ── 8. 敌人战地包扎：重伤时拖成两倍 ──
    const bd = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'nameless'; initOperatorSkills();
        P.alive = true; P.x = 60; P.y = 60;
        function mk(tr){
          var e = spawnEnemy('runner', P.x + 1200, P.y + 900);
          G.enemies = [e];
          e.hp = e.maxHp * 0.30;
          e.state = 'alert'; e.careCd = 0; e.trauma = tr ? 8 : 0; e.blind = 0;
          updateEnemies(0.05);
          return { on: e.bandaging, t: e.bandageT, slow: e.bandageSlow };
        }
        var hurt = mk(true), normal = mk(false);
        G.enemies = [];
        return JSON.stringify({ hurt: hurt, normal: normal });
      })()`));
    T('血量掉到 30% 的敌人会蹲下包扎', bd.normal.on === true);
    T('普通包扎 4.5 秒', Math.abs(bd.normal.t - 4.5 + 0.05) < 0.2);
    T('重伤包扎时间翻倍（9 秒）', Math.abs(bd.hurt.t - 9 + 0.05) < 0.2);
    T('重伤回血量打对折', Math.abs(bd.hurt.slow - 0.5) < 1e-9);

    // ── 9. 包扎先找掩体：有掩体就拖着伤挪过去，到位才蹲下 ──
    const cv = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'nameless'; initOperatorSkills();
        P.alive = true; P.x = 0; P.y = 0;
        G.obstacles = [{ x: 420, y: -320, w: 90, h: 640 }];   // 一堵墙隔开玩家和敌人
        var e = spawnEnemy('runner', 900, 0);
        G.enemies = [e];
        e.hp = e.maxHp * 0.3;
        e.state = 'alert'; e.careCd = 0; e.trauma = 0; e.blind = 0;
        updateEnemies(0.05);
        var p1 = { seek: e.careSeek, sx: e.careSpotX, sy: e.careSpotY, bandaging: e.bandaging,
                   blk: !losClear(e.careSpotX, e.careSpotY, P.x, P.y) };
        e.x = e.careSpotX; e.y = e.careSpotY;                  // 瞬移到掩体点
        updateEnemies(0.05);
        var p2 = { bandaging: e.bandaging, t: e.bandageT };
        G.obstacles = []; G.enemies = [];
        return JSON.stringify({ p1: p1, p2: p2 });
      })()`));
    T('有掩体时先进入找掩体阶段（不立刻包扎）', cv.p1.seek > 0 && cv.p1.bandaging === false);
    T('掩体点挡住玩家视线（losClear = false）', cv.p1.blk === true);
    T('走到掩体点后蹲下开始包扎', cv.p2.bandaging === true && cv.p2.t > 4);

    console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
    process.exit(fail ? 1 : 0);
  } catch (err) {
    console.error('FAIL 异常：', err && err.stack || err);
    process.exit(1);
  }
}, 1500);
