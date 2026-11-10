/* 新干员「蛊」：高效治疗 / 致盲毒雾 / 肾上腺素激活 / 流荧集群系统 */
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
      has: !!OPERATORS.gu,
      inOrder: OP_ORDER.indexOf('gu'),
      inIds: !!OP_IDS.gu,
      name: OPERATORS.gu.name, role: OPERATORS.gu.role,
      g: OPERATORS.gu.g.kind + '|' + OPERATORS.gu.g.cd + '|' + OPERATORS.gu.g.charges,
      v: OPERATORS.gu.v.kind + '|' + OPERATORS.gu.v.cd + '|' + OPERATORS.gu.v.charges,
      x: OPERATORS.gu.x.kind + '|' + OPERATORS.gu.x.cd,
      p: OPERATORS.gu.passive.kind,
      adrR: Math.round(SKILL.adr.r), gasR: SKILL.gas.r, gasDelay: SKILL.gas.delay,
      gasLife: SKILL.gas.life, adrLife: SKILL.adr.life, gearClear: SKILL.adr.gearClear
    })`));
    T('OPERATORS 里有蛊', info.has);
    T('OP_ORDER 第 7 位（大厅卡片最后一张）', info.inOrder === 6);
    T('OP_IDS 白名单已加（存档可保存）', info.inIds);
    T('名字 / 定位：蛊 · 支援', info.name === '蛊' && info.role === '支援');
    T('G = 毒雾 · CD 50s · 储备 2', info.g === 'gas|50|2');
    T('V = 肾上腺素 · CD 45s · 储备 1', info.v === 'adr|45|1');
    T('X = 流荧集群 · CD 120s', info.x === 'swarm|120');
    T('被动 = medic（高效治疗）', info.p === 'medic');
    T('肾上腺素半径 12.75 米（230px）', info.adrR === 230);
    T('毒雾半径 7.3 米 / 致盲延迟 0.75s / 持续 15s', info.gasR === 132 && info.gasDelay === 0.75 && info.gasLife === 15);
    T('肾上腺素持续 15s、前 10s 清装备负面', info.adrLife === 15 && info.gearClear === 10);

    // ── 2. 开局储备 ──
    const st = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'gu';
        initOperatorSkills();
        return JSON.stringify({ g: P.op.g.use, v: P.op.v.use, xcd: P.op.x.cd, stack: P.op.adrStack });
      })()`));
    T('开局 G 储备 2', st.g === 2);
    T('开局 V 储备 1', st.v === 1);
    T('大招开局进 CD（120s）', st.xcd === 120);
    T('开局叠层为 0', st.stack === 0);

    // ── 3. 被动：高效治疗 ──
    const care = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'gu'; initOperatorSkills();
        var gu = { t: careTimeMul(), r: careRateMul(), wind: careWindSec(2) };
        SAVE.operator = 'redwolf'; initOperatorSkills();
        var rw = { t: careTimeMul(), r: careRateMul(), wind: careWindSec(2) };
        SAVE.operator = 'gu'; initOperatorSkills();
        return JSON.stringify({ gu: gu, rw: rw });
      })()`));
    T('蛊：读条时长 ×0.8', Math.abs(care.gu.t - 0.8) < 1e-6 && Math.abs(care.gu.wind - 1.6) < 1e-6);
    T('蛊：回血速率 ×1.25（总量不变、时间缩短）', Math.abs(care.gu.r - 1.25) < 1e-6);
    T('换别的干员：读条回到 ×1', care.rw.t === 1 && care.rw.wind === 2 && care.rw.r === 1);

    const plan = JSON.parse(w.eval(`
      (function(){
        SAVE.operator = 'gu'; initOperatorSkills();
        P.maxHp = 100; P.hp = 20; P.deb.bleed = 0;
        var a = medReadPlan(MEDKITS[STARTER_MEDKIT], { left: 999 });
        SAVE.operator = 'redwolf'; initOperatorSkills();
        var b = medReadPlan(MEDKITS[STARTER_MEDKIT], { left: 999 });
        SAVE.operator = 'gu'; initOperatorSkills();
        return JSON.stringify({ gu: a.total, rw: b.total });
      })()`));
    T('同一个医疗包：蛊读得更快', plan.gu < plan.rw - 0.9);

    // ── 4. 毒雾：0.75 秒才致盲 ──
    const gas = JSON.parse(w.eval(`
      (function(){
        blastFX = function(){};
        G.obstacles = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        G.mists = []; G.gasbombs = []; G.gasT = 0; G.gasBlind = 0;
        P.alive = true; P.x = 5000; P.y = 5000; P.concuss = 0;   // 玩家站远点，别被自己的雾呛到
        var e = { x: 0, y: 0, r: 12, alive: true, hp: 100, maxHp: 100, type: 'runner', blind: 0, state: 'patrol', bandaging: false };
        G.enemies = [e];
        gasBlast(0, 0);
        var t0 = { blind: e.blind, r: G.mists[0].r };
        for (var i = 0; i < 10; i++) updateMists(0.05);          // 0.5s
        var t5 = { blind: e.blind, gasT: e.gasT };
        for (var i = 0; i < 8; i++) updateMists(0.05);           // 0.9s
        var t9 = { blind: e.blind };
        var mistLife = G.mists.length ? G.mists[0].life : 0;
        return JSON.stringify({ t0: t0, t5: t5, t9: t9, mistLife: mistLife });
      })()`));
    T('瓦斯弹炸开立刻铺雾', gas.t0.r >= 0);
    T('进雾 0.5 秒还没瞎（延迟生效）', gas.t5.blind === 0);
    T('进雾满 0.75 秒后被致盲', gas.t9.blind > 1.5);
    T('雾区设定持续 15 秒', gas.mistLife === 15);

    const gasOut = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        G.mists = []; G.gasT = 0; G.gasBlind = 0; G.enemies = [];
        P.alive = true; P.x = 0; P.y = 0; P.concuss = 0;
        var e = { x: 0, y: 0, r: 12, alive: true, hp: 100, maxHp: 100, type: 'runner', blind: 0, state: 'patrol', bandaging: false };
        G.enemies = [e];
        gasBlast(0, 0);
        for (var i = 0; i < 18; i++) updateMists(0.05);          // 0.9s：已经致盲
        var inBlind = e.blind;
        e.x = 5000; e.y = 5000;                                  // 跑出雾区
        for (var i = 0; i < 8; i++) { updateMists(0.05); e.blind = Math.max(0, e.blind - 0.05); }   // 0.4s（blind 在 updateEnemies 里衰减，这里手动扣）
        var outBlind = e.blind;
        return JSON.stringify({ inBlind: inBlind, outBlind: outBlind });
      })()`));
    T('离开雾区后致盲还残留（不立刻恢复）', gasOut.outBlind > 0.5);
    T('残留会随时间退掉', gasOut.outBlind < gasOut.inBlind);

    const gasSelf = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        G.mists = []; G.gasT = 0; G.gasBlind = 0; G.enemies = [];
        P.alive = true; P.x = 0; P.y = 0; P.concuss = 0;
        gasBlast(0, 0);
        for (var i = 0; i < 40; i++) updateMists(0.05);
        var inK = G.gasBlind;
        P.x = 6000; P.y = 6000;
        for (var i = 0; i < 40; i++) updateMists(0.05);
        var outK = G.gasBlind;
        return JSON.stringify({ inK: inK, outK: outK });
      })()`));
    T('自己也吃自己的毒雾（屏幕遮蔽 > 0.5）', gasSelf.inK > 0.5);
    T('走出毒雾后视线慢慢恢复', gasSelf.outK < gasSelf.inK * 0.75);

    // ── 5. 肾上腺素：范围 / 修正 / 前 10 秒清装备负面 ──
    const adr = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        G.adrFields = []; G.gasBlind = 0;
        P.alive = true; P.x = 0; P.y = 0;
        var before = { on: adrOn(), ads: adrAdsMul(), move: adrMoveMul() };
        deployAdr();
        var f = G.adrFields[0];
        var inField = { on: adrOn(), ads: adrAdsMul(), move: adrMoveMul(), clear: adrClearGear(), n: G.adrFields.length };
        P.x = 400;                                            // 走出 12.75 米
        for (var i = 0; i < 4; i++) updateAdrFields(0.5);      // 2 秒：linger 早过了
        var out = { on: adrOn(), ads: adrAdsMul() };
        P.x = 0;
        f.t = 11;                                             // 第 11 秒：装备负面不再清除
        var late = { on: adrOn(), clear: adrClearGear() };
        return JSON.stringify({ before: before, inField: inField, out: out, late: late });
      })()`));
    T('没开技能时没有肾上腺素', adr.before.on === false && adr.before.ads === 1);
    T('放出无人机后本人立刻在圈内', adr.inField.on === true);
    T('开镜速度提升（adsTime ×<1）', adr.inField.ads < 0.8);
    T('附带小幅移速加成（>1）', adr.inField.move > 1.03);
    T('前 10 秒清除装备负面', adr.inField.clear === true);
    T('走出圈外（含 1.6s 延迟）后 buff 消失', adr.out.on === false);
    T('第 11 秒不再清装备负面', adr.late.on === true && adr.late.clear === false);

    // ── 6. 叠层：buff 期间击杀 +1，整局保留，阵亡/新局清空 ──
    const stack = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        G.adrFields = []; G.enemies = [];
        P.alive = true; P.x = 0; P.y = 0;
        var far = { x: 3000, y: 3000, r: 12, alive: true, hp: 10, maxHp: 100, type: 'runner',
                    armorMax: 0, armorHp: 0, score: 12, color: '#f00', glow: '#f00', shape: 'tri', xp: 0 };
        G.enemies = [far];
        adrOnKill();                                       // 没 buff：不该叠
        var none = P.op.adrStack;
        deployAdr();
        adrOnKill(); adrOnKill();
        var two = P.op.adrStack;
        var adsAt2 = adrAdsMul();
        G.adrFields = [];                                  // V 结束
        var keep = P.op.adrStack;
        initOperatorSkills();                              // 新一局
        var reset = P.op.adrStack;
        return JSON.stringify({ none: none, two: two, adsAt2: adsAt2, keep: keep, reset: reset });
      })()`));
    T('没有 buff 时击杀不叠层', stack.none === 0);
    T('buff 期间击杀叠加到 2 层', stack.two === 2);
    T('层数提升强度（开镜修正更强）', stack.adsAt2 < 0.75);
    T('V 结束后层数保留（下次继承）', stack.keep === 2);
    T('新开一局层数清空', stack.reset === 0);

    // ── 7. 流荧集群：缠绕 / 压上限 / 拔除 / 回血 ──
    const sw = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        G.swarms = []; G.enemies = []; G.adrFields = [];
        P.alive = true; P.x = 0; P.y = 0; P.aim = 0;
        var e = { x: 90, y: 0, r: 12, alive: true, hp: 100, maxHp: 100, type: 'runner',
                  state: 'patrol', blind: 0, stun: 0, kd: 0, facing: Math.PI, fov: 1, sight: 320,
                  armorMax: 0, armorHp: 0, speed: 100, color: '#f00', glow: '#f00', shape: 'tri' };
        G.enemies = [e];
        launchSwarm();
        var spawned = G.swarms.length;
        for (var i = 0; i < 20; i++) updateSwarms(0.05);     // 1s：应该追到并缠上
        var at = { t: e.swarmT, blur: e.blur, deaf: e.deaf };
        for (var i = 0; i < 40; i++) { updateSwarms(0.05); updateSwarmDebuff(e, 0.05); }   // 再 2s，压上限中（ramp 3s 压到 0.4）
        var mid = { cap: e.capMul, hp: e.hp, lost: e.capLost };
        for (var i = 0; i < 60; i++) { updateSwarmDebuff(e, 0.05); }   // 3s：拔除完成、开始恢复
        var after = { t: e.swarmT, rec: e.swarmRec, blur: e.blur };
        for (var i = 0; i < 140; i++) { updateSwarmDebuff(e, 0.05); }  // 7s：恢复完
        var done = { cap: e.capMul, hp: e.hp, lost: e.capLost };
        return JSON.stringify({ spawned: spawned, at: at, mid: mid, after: after, done: done });
      })()`));
    T('放出一群无人机', sw.spawned === 1);
    T('追上敌人后缠住（3 秒拔除读条）', sw.at.t > 2.5 && sw.at.t <= 3);
    T('被缠住 → 视野模糊 + 听力衰减标记', sw.at.blur === 1 && sw.at.deaf === 1);
    T('压制过程中上限往下掉', sw.mid.cap < 0.55);
    T('血量被压到上限（不是掉血而是扣上限）', sw.mid.hp <= sw.mid.cap * 100 + 0.01);
    T('拔除后进入恢复期', sw.after.t === 0 && sw.after.rec > 0 && sw.after.blur === 0);
    T('恢复期结束上限回到 100%', sw.done.cap === 1 && sw.done.lost === 0);
    T('被扣掉的血也还回来了', sw.done.hp > 95 && sw.done.hp <= 100);

    const swBoss = JSON.parse(w.eval(`
      (function(){
        G.obstacles = []; G.swarms = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        var b = { x: 90, y: 0, r: 44, alive: true, hp: 1400, maxHp: 1400, type: 'boss',
                  state: 'patrol', blind: 0, stun: 0, kd: 0, facing: Math.PI, fov: 1,
                  armorMax: 0, armorHp: 0, speed: 70, color: '#f00', glow: '#f00', shape: 'boss' };
        var r = { x: 95, y: 0, r: 12, alive: true, hp: 100, maxHp: 100, type: 'runner',
                  state: 'patrol', blind: 0, stun: 0, kd: 0, facing: Math.PI, fov: 1,
                  armorMax: 0, armorHp: 0, speed: 100, color: '#f00', glow: '#f00', shape: 'tri' };
        attachSwarm(b); attachSwarm(r);
        var t = { bossT: b.swarmT, runT: r.swarmT };
        for (var i = 0; i < 40; i++) updateSwarmDebuff(b, 0.05);   // 2.0s 恰好拔完（bossRamp 2s 压到 50%）
        var cap = { bossCap: b.capMul, bossHp: b.hp };
        return JSON.stringify({ t: t, cap: cap });
      })()`));
    T('BOSS 拔除只要 2 秒', swBoss.t.bossT === 2);
    T('小兵拔除要 3 秒', swBoss.t.runT === 3);
    T('BOSS 上限最低压到 50%', Math.abs(swBoss.cap.bossCap - 0.5) < 1e-6);
    T('BOSS 血量被压到 50%', Math.abs(swBoss.cap.bossHp - 700) < 1);

    // ── 8. 缠住之后的视野 / 听力 ──
    const sens = JSON.parse(w.eval(`
      (function(){
        G.obstacles = [];
        P.alive = true; P.x = 0; P.y = 0;
        var e = { x: 0, y: 300, r: 12, alive: true, hp: 100, maxHp: 100, type: 'runner',
                  state: 'patrol', blind: 0, facing: Math.PI * 1.5, fov: 1, sight: 320 };
        var before = canSeePlayer(e);
        e.swarmT = 3;
        var after = canSeePlayer(e);
        e.swarmT = 0;
        /* 听力：1000px 外的动静，正常听得到，失聪听不到 */
        var a = { x: 1000, y: 0, r: 12, alive: true, state: 'patrol', alertMeter: 0, investigateT: 0 };
        var b = { x: 1000, y: 0, r: 12, alive: true, state: 'patrol', alertMeter: 0, investigateT: 0, deaf: 1 };
        G.enemies = [a, b];
        emitNoise(0, 0, 1200, 0.6);
        return JSON.stringify({ before: before, after: after, normal: a.state, deaf: b.state });
      })()`));
    T('正常情况下 320px 内看得见玩家', sens.before === true);
    T('被集群缠住 → 视野大幅收缩，看不见了', sens.after === false);
    T('正常听力：1000px 外的动静会去看', sens.normal === 'alert');
    T('被集群缠住 → 听力衰减，听不见', sens.deaf === 'patrol');

    // ── 9. 技能分发接线 ──
    const wire = JSON.parse(w.eval(`
      (function(){
        G.obstacles = []; G.mists = []; G.gasbombs = []; G.adrFields = []; G.swarms = []; G.enemies = [];
        SAVE.operator = 'gu'; initOperatorSkills();
        P.alive = true; P.x = 0; P.y = 0; P.aim = 0;
        mouse.wx = 200; mouse.wy = 0;
        useTactic();
        var gas = G.gasbombs.length;
        useSkill();
        var adr = G.adrFields.length;
        P.op.x.cd = 0;
        useUlt();
        var sw = G.swarms.length;
        return JSON.stringify({ gas: gas, adr: adr, sw: sw, gUse: P.op.g.use, vUse: P.op.v.use, xcd: P.op.x.cd });
      })()`));
    T('按 G 扔出瓦斯弹', wire.gas === 1);
    T('按 V 放出增益无人机', wire.adr === 1);
    T('按 X 放出流荧集群', wire.sw === 1);
    T('G 扣掉一层储备（2→1）', wire.gUse === 1);
    T('V 扣掉储备（1→0）', wire.vUse === 0);
    T('X 进入 120 秒冷却', wire.xcd === 120);

    // ── 被缠住的敌人停火站桩：不移动、不开火，专心拔无人机 ──
    const pull = JSON.parse(w.eval(`
      (function(){
        P.alive = true; P.x = 0; P.y = 0; P.concuss = 0;
        G.obstacles = [];
        var e = spawnEnemy('runner', 300, 0);
        G.enemies = [e];
        e.state = 'combat'; e.facing = Math.PI; e.fireCd = 0; e.ptN = 0;
        var ox = e.x, oy = e.y;
        attachSwarm(e);                        // 缠上：进入 3s 拔除读条
        var t0 = e.swarmT;
        for (var i = 0; i < 20; i++) updateEnemies(0.05);   // 1 秒
        var p = { dx: Math.abs(e.x - ox) + Math.abs(e.y - oy), pt: e.ptN, t: e.swarmT };
        G.enemies = [];
        return JSON.stringify({ t0: t0, p: p });
      })()`));
    T('缠上后进入拔除读条', pull.t0 > 2.9);
    T('拔除期间敌人不移动（停火站桩）', pull.p.dx < 2);
    T('拔除期间不开火', pull.p.pt <= 0);
    T('拔除读条正常倒数', pull.p.t > 1.9 && pull.p.t < 2.1);

  } catch (e) {
    fail++;
    console.log('FAIL  测试崩溃: ' + e.message + '\n' + (e.stack || ''));
  }
  console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
}, 1500);
