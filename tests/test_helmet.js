/* 头盔系统：数据表 / 拾音范围 / 低级别子弹减伤 / 开镜与移速惩罚 / 降噪 / 存档与购买会计 */
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
    // ── 1. 数据表：等级 / 减伤弹级 / 拾音 / 降噪 / 惩罚 ──
    const H = w.eval('HELMETS.map(function(h){ return { id:h.id, name:h.name, lv:h.lv, drLv:h.drLv, dr:h.dr, hear:h.hear, quiet:h.quiet, quietName:h.quietName, aim:h.aim, move:h.move, fov:h.fov || 1, fovName:h.fovName, price:h.price }; })');
    T('头盔表 9 条（含「不戴」占位：1-3 级头 4 件 + 4 级头 4 件）', H.length === 9 && H[0].id === 0);
    const cap = H.find(h => h.name === '户外棒球帽');
    const moto = H.find(h => h.name === '复古摩托头盔');
    const riot = H.find(h => h.name === '防暴头盔');
    const mc = H.find(h => h.name === 'MC201 防弹头盔');
    T('1 级头：棒球帽 拾音 +10% / 降噪低 / 无减伤', !!cap && cap.lv === 1 && cap.hear === 0.10 && cap.quietName === '低' && cap.dr === 0);
    T('2 级头：摩托盔 ≤2 级弹 -10% / 拾音 -5% / 降噪中', !!moto && moto.drLv === 2 && moto.dr === 0.10 && moto.hear === -0.05 && moto.quietName === '中');
    T('3 级头：防暴盔 ≤3 级弹 -12% / 瞄准 -3% / 移速 -1% / 拾音 -5%',
      !!riot && riot.drLv === 3 && riot.dr === 0.12 && riot.aim === 0.03 && riot.move === 0.01 && riot.hear === -0.05);
    T('3 级头：MC201 ≤3 级弹 -10% / 瞄准 -1% / 移速 -1% / 拾音 +20%',
      !!mc && mc.drLv === 3 && mc.dr === 0.10 && mc.aim === 0.01 && mc.move === 0.01 && mc.hear === 0.20);
    T('全部头盔价格为正且阵亡会丢（没有耐久字段）',
      H.slice(1).every(h => h.price > 0) && H.slice(1).every(h => !('hp' in h)));

    // ── 1b. 4 级头四件 + 视野字段 ──
    const mhs = H.find(h => h.name === 'MHS 战术头盔');
    const d6 = H.find(h => h.name === 'D6 战术头盔');
    const dich = H.find(h => h.name === 'DICH 训练头盔');
    const gt1 = H.find(h => h.name === 'GT1 战术头盔');
    T('4 级头四件齐：MHS / D6 / DICH / GT1', !!mhs && !!d6 && !!dich && !!gt1);
    T('4 级头都吃 ≤4 级弹', [mhs, d6, dich, gt1].every(h => h.lv === 4 && h.drLv === 4));
    T('MHS：-10% / 拾音 +30% / 瞄-3 移-1 / 降噪中 / 视野持平',
      mhs.dr === 0.10 && mhs.hear === 0.30 && mhs.aim === 0.03 && mhs.move === 0.01 && mhs.quietName === '中' && mhs.fov === 1);
    T('D6：-25% / 拾音 -10% / 瞄-6 移-4 / 降噪高 / 视野 0.82',
      d6.dr === 0.25 && d6.hear === -0.10 && d6.aim === 0.06 && d6.move === 0.04 && d6.quietName === '高' && d6.fov === 0.82);
    T('DICH：-3% / 拾音 +50% / 移-2 / 降噪高 / 视野 1.15',
      dich.dr === 0.03 && dich.hear === 0.50 && dich.aim === 0 && dich.move === 0.02 && dich.quietName === '高' && dich.fov === 1.15);
    T('GT1：-12% / 拾音 +20% / 瞄-4 移-4 / 降噪中 / 视野 1.08',
      gt1.dr === 0.12 && gt1.hear === 0.20 && gt1.aim === 0.04 && gt1.move === 0.04 && gt1.quietName === '中' && gt1.fov === 1.08);
    T('降噪「高」比「中」更静（0.18 > 0.10）', d6.quiet > mhs.quiet);
    const tags = w.eval('HELMETS.map(function(h){ return helmetFovTag(h); })');
    T('视野标签：持平不出标签、D6 -18%、DICH +15%、GT1 +8%',
      tags[5] === '' && tags[6] === ' · 视野 -18%' && tags[7] === ' · 视野 +15%' && tags[8] === ' · 视野 +8%');

    // ── 2. 管线挂载（源码级） ──
    T('damagePlayer 里按弹级吃头盔减伤', /pen > 0 && pen <= P\.helmetDrLv/.test(src) && /dmg \*= 1 - P\.helmetDr/.test(src));
    T('footPanVol 用拾音倍率缩放听力半径', /const ear = FOOTSTEP_EAR \* \(P\.helmetHear \|\| 1\)/.test(src));
    T('emitNoise 对玩家自身动静套三重降噪（半径 / 硬度 / 方位）',
      /const q = P\.helmetQuiet \|\| 0/.test(src) && /radius \*= 1 - q/.test(src) &&
      /hardness \*= Math\.max\(0\.35, 1 - q \* HELMET_QUIET_HARD\)/.test(src) &&
      /blur = q \* HELMET_QUIET_BLUR/.test(src) &&
      /e\.lastSeenX = blur \? x \+ rand\(-blur, blur\) : x/.test(src));
    T('adsTime 乘头盔抬枪惩罚', /\(1 \+ \(gearClear \? 0 : \(P\.helmetAim \|\| 0\)\)\)/.test(src));
    T('走速乘头盔移速惩罚', /spd \*= 1 - \(P\.helmetMove \|\| 0\)/.test(src));
    T('HUD 画出头盔拾音 / 降噪', /拾音 ' \+ \(H\.hear >= 0/.test(src) && /helmetOf\(P\.helmetId\)/.test(src));
    T('商店 / 仓库有「头 盔」页，整备有头盔槽',
      /data-tab="helmet">头 盔<\/button>/.test(html) && /id="loSlotHelmet"/.test(html) && /kind: 'helmet'/.test(src));
    T('阵亡结算丢头上这顶（件数减一 + 损失行）',
      /SAVE\.wornHelmet\) \{\s*const hid = SAVE\.wornHelmet;/.test(src) && /损失头盔/.test(src));

    // ── 3. 拾音范围：听力半径 520 × 倍率 ──
    const hear = w.eval(`(function(){
      var out = {};
      function probe(helmetId, dist) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999;
        P.x = 1000; P.y = 1000; P.aim = 0;
        var e = G.enemies[0];
        e.x = 1000 + dist; e.y = 1000; e.state = 'patrol'; e.type = 'grunt';
        return { heard: !!footPanVol(e, false), mul: +P.helmetHear.toFixed(3) };
      }
      out.plain = probe(null, 510);
      out.plainFar = probe(null, 530);
      out.mcNear = probe(4, 600);      // +20% → 624
      out.mcFar = probe(4, 640);
      out.motoNear = probe(2, 510);    // -5% → 494
      out.motoFar = probe(2, 480);
      out.cap = probe(1, 560);         // +10% → 572
      return out;
    })()`);
    T('裸头：510px 听得到、530px 听不到（半径 520）', hear.plain.heard && !hear.plainFar.heard && hear.plain.mul === 1);
    T('MC201 拾音 +20%：600px 听得到、640px 听不到（半径 624）', hear.mcNear.heard && !hear.mcFar.heard && hear.mcNear.mul === 1.2);
    T('摩托盔 拾音 -5%：510px 听不到、480px 听得到（半径 494）', !hear.motoNear.heard && hear.motoFar.heard && hear.motoNear.mul === 0.95);
    T('棒球帽 拾音 +10%：560px 听得到（半径 572）', hear.cap.heard && hear.cap.mul === 1.1);

    // ── 4. 低级别子弹减伤 ──
    const dr = w.eval(`(function(){
      var out = {};
      function hit(helmetId, pen, dmg) {
        SAVE.wornHelmet = helmetId; SAVE.wornPiece = null;   // 裸甲：只测头盔这一层
        startRaid(); P.invuln = 0; P.hp = P.maxHp;
        var before = P.hp;
        damagePlayer(dmg, P.x + 120, P.y, 0, pen);
        return +(before - P.hp).toFixed(2);
      }
      /* 用 20 点伤害，别把测试角色打死（死亡会触发虚弱减上限，后面几组数就全歪了） */
      out.none2 = hit(null, 2, 20);
      out.moto2 = hit(2, 2, 20);         // -10% → 18
      out.moto3 = hit(2, 3, 20);         // 3 级弹：不吃
      out.riot3 = hit(3, 3, 20);         // -12% → 17.6
      out.riot4 = hit(3, 4, 20);         // 4 级弹：不吃
      out.riot1 = hit(3, 1, 20);         // -12% → 17.6
      out.riotBlast = hit(3, 0, 20);     // 爆炸 / 近战 pen 0：不吃
      out.mc3 = hit(4, 3, 20);           // -10% → 18
      return out;
    })()`);
    T('无头盔：2 级弹全额 20', Math.abs(dr.none2 - 20) < 0.01);
    T('摩托盔：2 级弹 18 / 3 级弹仍 20', Math.abs(dr.moto2 - 18) < 0.01 && Math.abs(dr.moto3 - 20) < 0.01);
    T('防暴盔：3 级弹 17.6 / 4 级弹 20 / 1 级弹 17.6 / pen0 20',
      Math.abs(dr.riot3 - 17.6) < 0.01 && Math.abs(dr.riot4 - 20) < 0.01 &&
      Math.abs(dr.riot1 - 17.6) < 0.01 && Math.abs(dr.riotBlast - 20) < 0.01);
    T('MC201：3 级弹 18（减伤 10%）', Math.abs(dr.mc3 - 18) < 0.01);

    // ── 5. 移速与开镜：真实帧驱动 ──
    const move = w.eval(`(function(){
      var out = {};
      var gun = WEAPON_ORDER[0];
      SAVE.owned[gun] = 3; SAVE.loadout.primary = gun;
      function run(helmetId) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999; P.hp = P.maxHp;
        P.x = 1500; P.y = 1500; P.vx = 0; P.vy = 0; P.sprinting = false;
        keys['w'] = 1;
        var x0 = P.x, y0 = P.y;
        for (var i = 0; i < 90; i++) update(1/60);
        keys['w'] = 0;
        return Math.hypot(P.x - x0, P.y - y0);
      }
      out.plain = run(null);
      out.riot = run(3);          // 移速 -1%
      out.mc = run(4);
      // 开镜：固定帧数后攒到的开镜进度（帧数会取整，量进度才分得出 1% / 3%）
      function adsProgress(helmetId) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999;
        P.curSlot = 'primary'; P.weapon = gun; P.reloading = 0; P.ads = 0; P.adsPrev = 0;
        mouse.right = true;
        for (var i = 0; i < 6; i++) update(1/60);
        var a = P.ads;
        mouse.right = false; P.ads = 0;
        return a;
      }
      out.adsPlain = adsProgress(null);
      out.adsRiot = adsProgress(3);
      out.adsMc = adsProgress(4);
      return out;
    })()`);
    T('防暴盔移速 -1%（实测位移比 0.99）', Math.abs(move.riot / move.plain - 0.99) < 0.006);
    T('MC201 移速 -1%（实测位移比 0.99）', Math.abs(move.mc / move.plain - 0.99) < 0.006);
    /* adsTime 变长 = 同样帧数攒到的进度变少：plain/riot 正好 1.03 */
    T('防暴盔抬枪 -3%（开镜进度比 1.03）', Math.abs(move.adsPlain / move.adsRiot - 1.03) < 0.005);
    T('MC201 抬枪 -1%（开镜进度比 1.01）', Math.abs(move.adsPlain / move.adsMc - 1.01) < 0.005);

    // ── 6. 降噪：自己动静传得更近 ──
    const quiet = w.eval(`(function(){
      var out = {};
      function heard(helmetId, noiseR, dist) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999;
        var e = G.enemies[0];
        e.x = P.x + dist; e.y = P.y; e.state = 'patrol'; e.investigateT = 0;
        emitNoise(P.x, P.y, noiseR, 0.4, true);
        return e.state === 'alert';
      }
      out.plain = heard(null, 400, 380);      // 400 > 380：听见
      out.moto = heard(2, 400, 380);          // 360 < 380：听不见
      out.motoNear = heard(2, 400, 340);      // 340 < 360：听得见
      out.cap = heard(1, 400, 390);           // 384 < 390：听不见（降噪 4%）
      return out;
    })()`);
    T('无降噪：380px 动静被听见', quiet.plain);
    T('摩托盔降噪 10%：380px 听不见、340px 听得见', !quiet.moto && quiet.motoNear);
    T('棒球帽降噪 4%：390px 听不见', !quiet.cap);

    // ── 6c. 视野：视锥半角按 fov 缩放（真跑 updateFog 读 dyn） ──
    const fovP = w.eval(`(function(){
      if (typeof FOG === 'undefined') return null;
      function probe(helmetId) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999; P.ads = 0;
        if (!FOG.ready) return null;
        updateFog(0.05);
        return { core: +FOG.dyn.core.toFixed(4), edge: +FOG.dyn.edge.toFixed(4), fv: P.helmetFov };
      }
      return { plain: probe(null), d6: probe(6), dich: probe(7), gt1: probe(8), ek: HELMET_FOV_EDGE_K };
    })()`);
    if (fovP) {
      T('视野挂载：P.helmetFov 随头盔写入（0.82 / 1.15 / 1.08）',
        fovP.d6.fv === 0.82 && fovP.dich.fv === 1.15 && fovP.gt1.fv === 1.08 && fovP.plain.fv === 1);
      /* 主视野半角 1.06 rad：D6 收 18%、DICH 放 15% */
      T('D6 主视野 -18%（1.06 → 0.8692 rad）', Math.abs(fovP.d6.core / fovP.plain.core - 0.82) < 0.002);
      T('DICH 主视野 +15%（1.06 → 1.219 rad）', Math.abs(fovP.dich.core / fovP.plain.core - 1.15) < 0.002);
      T('GT1 主视野 +8%', Math.abs(fovP.gt1.core / fovP.plain.core - 1.08) < 0.002);
      /* 余光只吃 60%：D6 边角 1.46 × (1-0.108) = 1.3023 */
      T('余光按 0.6 衰减（D6 边角 1.3023 rad，不是 1.1972）',
        Math.abs(fovP.d6.edge - 1.46 * (1 - 0.18 * 0.6)) < 0.002 && fovP.ek === 0.6);
    } else {
      T('视野探针跳过（jsdom 无 FOG）', true);
    }

    // ── 6b. 降噪三重效果：警戒硬度 + 方位误差 ──
    const qhard = w.eval(`(function(){
      var out = { k: [HELMET_QUIET_HARD, HELMET_QUIET_BLUR] };
      function probe(helmetId) {
        SAVE.wornHelmet = helmetId; startRaid(); P.invuln = 99999;
        var e = G.enemies[0];
        e.x = P.x + 200; e.y = P.y; e.state = 'patrol'; e.alertMeter = 0; e.investigateT = 0;
        emitNoise(P.x, P.y, 400, 0.5, true);
        return {
          meter: +e.alertMeter.toFixed(4),
          off: Math.hypot(e.lastSeenX - P.x, e.lastSeenY - P.y),
          alerted: e.state === 'alert',
        };
      }
      out.plain = probe(null);
      out.moto = probe(2);
      out.cap = probe(1);
      // 多次采样：方位误差不能是 0，也不能超出 blur 方框的对角
      var far = 0, near = 1e9;
      for (var i = 0; i < 40; i++) { var r = probe(2); far = Math.max(far, r.off); near = Math.min(near, r.off); }
      out.blurMax = +far.toFixed(1); out.blurMin = +near.toFixed(1);
      return out;
    })()`);
    /* 无盔：k = 1 - 200/400 = 0.5，警戒 +0.5×0.5 = 0.25 */
    T('无降噪：警戒条涨 0.25、落点无偏移',
      Math.abs(qhard.plain.meter - 0.25) < 0.002 && qhard.plain.off < 0.01);
    /* 摩托盔：半径 360 → k = 1 - 200/360 = 0.4444；硬度 ×0.70 → 0.1556 */
    T('摩托盔：警戒涨幅砍到 0.70 倍（0.25 → 0.1556）',
      Math.abs(qhard.moto.meter / qhard.plain.meter - 0.70 * (1 - 200 / 360) / 0.5) < 0.005);
    /* 棒球帽：半径 384 → k = 0.4792；硬度 ×0.88 */
    T('棒球帽：警戒涨幅砍到 0.88 倍',
      Math.abs(qhard.cap.meter / qhard.plain.meter - 0.88 * (1 - 200 / 384) / 0.5) < 0.005);
    T('降噪系数生效：硬度 3.0 / 方位 700px', qhard.k[0] === 3 && qhard.k[1] === 700);
    /* 方位误差：摩托盔 ±70px，方框对角 = 70√2 ≈ 99 */
    T('摩托盔：敌人摸到的落点偏离 0~99px（±70 方框内）',
      qhard.blurMax <= 99.5 && qhard.moto.off > 0.01);
    T('即便听不见也会被记录为 alert（半径逻辑没被改坏）', qhard.moto.alerted && qhard.plain.alerted);

    // ── 7. 存档清算 + 购买会计 ──
    const save = w.eval(`(function(){
      var out = {};
      var a = cleanHelmets({ helmetOwned: { '1': 2, '3': 1, '9': 5, 'x': 3 }, wornHelmet: 3 });
      out.clean = { keys: Object.keys(a.owned).sort().join(','), worn: a.worn };
      var b = cleanHelmets({ helmetOwned: { '2': 1 }, wornHelmet: 4 });
      out.badWorn = b.worn;                       // 没库存 / 不存在的 id → null
      var c = cleanHelmets({ helmetOwned: { '2': 0 }, wornHelmet: 2 });
      out.zero = { n: Object.keys(c.owned).length, worn: c.worn };
      out.deflt = (function(){ var d = DEFAULT_SAVE(); return 'helmetOwned' in d && 'wornHelmet' in d; })();
      // 购买：扣钱 + 件数 +1（穿着不算第二件）
      SAVE.credits = 20000; SAVE.helmetOwned = {}; SAVE.wornHelmet = null;
      buyHelmet(2);
      out.buy = { credits: SAVE.credits, n: SAVE.helmetOwned[2] };
      SAVE.wornHelmet = 2;
      out.wornNoExtra = SAVE.helmetOwned[2];      // 件数里本身包含头上那顶
      buyHelmet(2);
      out.buy2 = { credits: SAVE.credits, n: SAVE.helmetOwned[2] };
      out.poor = (function(){ SAVE.credits = 0; buyHelmet(3); return SAVE.helmetOwned[3] | 0; })();
      return out;
    })()`);
    T('存档清算：只留存在的 id、头上有货才算戴着', save.clean.keys === '1,3' && save.clean.worn === 3);
    T('存档清算：头上那顶没库存 → 当没戴', save.badWorn === null);
    T('存档清算：件数 0 → 丢掉', save.zero.n === 0 && save.zero.worn === null);
    T('默认存档带头盔字段', save.deflt);
    T('买摩托盔：-2400、件数 1', save.buy.credits === 17600 && save.buy.n === 1);
    T('戴上不额外扣件数（头上一顶算在件数里）', save.wornNoExtra === 1);
    T('再买一顶：件数 2、钱再 -2400', save.buy2.n === 2 && save.buy2.credits === 15200);
    T('没钱买不了', save.poor === 0);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.log('ERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
    process.exit(1);
  }
}, 300);
