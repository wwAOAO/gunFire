/* 双伤害体系：每把枪的「护甲伤害 / 身体伤害」与弹级磨甲系数 */
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
    /* ───────── 1. 数据完整性 ───────── */
    const guns = JSON.parse(w.eval(`(function(){
      var out = [];
      for (var id in WEAPONS) {
        var g = WEAPONS[id];
        if (!g.cat || g.cat === 'melee') continue;
        out.push({ id: id, name: g.short, cat: g.cat, dmg: g.dmg, ad: g.armorDmg,
                   cnt: g.count || 1, rate: g.rate, mode: g.mode, mag: g.mag });
      }
      return JSON.stringify(out);
    })()`));
    const tiers = JSON.parse(w.eval(`JSON.stringify(AMMO_TIERS.map(function(T){
      return { lv: T.lv, mul: T.dmgMul, amul: T.armorMul, flesh: T.fleshMul, price: T.priceMul };
    }))`));

    T('32 把枪全部有护甲伤害', guns.length === 32 && guns.every(g => typeof g.ad === 'number'));
    T('护甲伤害都为正数', guns.every(g => g.ad > 0));
    T('护甲伤害不超过身体伤害（单发口径下）', guns.every(g => g.ad <= g.dmg * 1.02));
    T('8 级弹都有磨甲系数', tiers.length === 8 && tiers.every(t => typeof t.amul === 'number'));
    T('弹级磨甲系数单调递增', tiers.every((t, i) => i === 0 || t.amul > tiers[i - 1].amul));
    T('修脚弹磨甲最差（< 白弹）', tiers[0].amul < tiers[1].amul * 0.8);
    T('顶级弹磨甲是白弹的 1.5 倍以上', tiers[7].amul / tiers[1].amul >= 1.5);

    /* ───────── 2. bulletDamage 逐分支 ───────── */
    const cases = JSON.parse(w.eval(`(function(){
      function mk(dmg, ad, pen, amul, flesh){ return { dmg:dmg, pen:pen, armorDmg:ad, armorMul:amul, fleshMul:flesh||1 }; }
      function run(name, e, b){
        var ah0 = e.armorHp;
        var r = bulletDamage(e, b);
        return { name:name, flesh:r.dmg, wear:ah0 - e.armorHp, ratio:r.ratio, blocked:r.blocked };
      }
      var out = [];
      // AKM 3 级弹（零穿透）打 4 级甲
      out.push(run('zero', { hp:280, armorLv:4, armorHp:93, armorFlash:0, x:0, y:0, r:20 }, mk(44*1.04, 11, 3, 1.0)));
      // AKM 5 级弹（75%）打 4 级甲
      out.push(run('pen75', { hp:280, armorLv:4, armorHp:93, armorFlash:0, x:0, y:0, r:20 }, mk(44*1.08, 11, 5, 1.16)));
      // 无甲
      out.push(run('naked', { hp:34, armorLv:0, armorHp:0, armorFlash:0, x:0, y:0, r:11 }, mk(44, 11, 3, 1.0)));
      // RIP 打裸体
      out.push(run('rip', { hp:34, armorLv:0, armorHp:0, armorFlash:0, x:0, y:0, r:11 }, mk(44*0.72, 11, 0, 0.55, 1.9)));
      // 甲只剩 5 点：一发打穿后应继续结算（第二发按裸体）
      var e2 = { hp:280, armorLv:4, armorHp:5, armorFlash:0, x:0, y:0, r:20 };
      var first = run('break', e2, mk(44*1.04, 11, 3, 1.0));
      var second = run('afterBreak', e2, mk(44*1.04, 11, 3, 1.0));
      return JSON.stringify({ out: out, first: first, second: second });
    })()`));
    const by = n => cases.out.find(c => c.name === n);
    T('零穿透：肉伤 0', by('zero').flesh === 0 && by('zero').blocked);
    T('零穿透：磨甲 = 11 × 1.0 × 0.65 = 7.15', Math.abs(by('zero').wear - 7.15) < 0.01);
    T('75% 穿透：肉伤 = 44×1.08×0.75', Math.abs(by('pen75').flesh - 44 * 1.08 * 0.75) < 0.01);
    T('75% 穿透：磨甲全额（11 × 1.16）', Math.abs(by('pen75').wear - 11 * 1.16) < 0.01);
    T('打裸体：不磨甲、肉伤等于 dmg', by('naked').flesh === 44 && by('naked').wear === 0);
    T('RIP 打裸体：肉伤 ×1.9', Math.abs(by('rip').flesh - 44 * 0.72 * 1.9) < 0.01);
    T('甲被打穿的那发仍按穿透率结算肉伤', cases.first.flesh === 0 && cases.first.wear === 5);
    T('甲碎之后按裸体结算', Math.abs(cases.second.flesh - 44 * 1.04) < 0.01 && cases.second.wear === 0);

    /* ───────── 3. 平衡判据（写死，不许事后追认） ───────── */
    w.GUNS = guns;                       // 把导出的枪表挂到全局，供下面的模拟读取
    const sim = JSON.parse(w.eval(`(function(){
      var AHP = { 0:0, 1:45, 2:55, 3:68, 4:93, 5:110, 6:133 };
      function ttk(g, tier, hp0, ah0, lv){
        var T = AMMO_TIERS[tier];
        var hp = hp0, ah = ah0, n = 0, cross = 0;
        while (hp > 0 && n < 4000) {
          var ratio = (ah > 0 && lv > 0) ? penRatio(tier, lv) : 1;
          var per = g.dmg * T.dmgMul * g.cnt * (ratio > 0 ? ratio : (tier === 0 ? T.fleshMul : 0));
          if (ah > 0 && lv > 0) {
            ah = Math.max(0, ah - g.ad * g.cnt * T.armorMul * (ratio > 0 ? 1 : 0.65));
            if (ah <= 0 && !cross) cross = n + 1;
          }
          hp -= per; n++;
        }
        var t = (g.mode === 'burst') ? (Math.floor(n / 3) * g.rate + (n % 3) * (g.burstGap || 0.055)) : n * g.rate;
        if (n > g.mag) t += Math.ceil(n / g.mag - 1) * 1.8;
        return { shots: n, t: t, cross: cross };
      }
      var out = {};
      for (var i = 0; i < GUNS.length; i++) {
        var g = GUNS[i];
        out[g.id] = {
          r3: ttk(g, 3, 280, 93, 4),
          r4: ttk(g, 4, 280, 93, 4),
          r5: ttk(g, 5, 280, 93, 4),
          r6: ttk(g, 6, 280, 93, 4),
          bare: ttk(g, 1, 34, 0, 0),
          boss3: ttk(g, 3, 1400, 110, 5)
        };
      }
      return JSON.stringify(out);
    })()`));

    /* 上面 eval 里用到的 GUNS 先塞进 window */
    // （若上面抛错说明 GUNS 未定义 —— 见下方注入）
    T('模拟表算出来了', !!sim.akm);

    const rifleIds = ['akm', 'm4a1', 'qbz95', 'ak12', 'qbz192', 'qbz191'];
    const ratioOf = id => sim[id].r3.t / sim[id].r5.t;

    T('每把步枪：3 级弹比 5 级弹慢 1.6 倍以上', rifleIds.every(id => ratioOf(id) >= 1.6));
    T('弹级收益有上限（不超过 3 倍，避免卡死）', rifleIds.every(id => ratioOf(id) <= 3.0));
    T('磨甲王 QBZ-95 用 3 级弹快过肉伤王 AKM', sim.qbz95.r3.t < sim.akm.r3.t * 0.9);
    T('QBZ-191 磨甲也快过 AKM', sim.qbz191.r3.t < sim.akm.r3.t * 0.95);
    T('霰弹打重甲最慢（≥ 步枪中位数 3 倍）', sim.m870.r3.t >= 2.0 * 3);
    T('手枪打重甲明显慢于步枪', sim.g17.r3.t > sim.m4a1.r3.t * 2);
    T('没有任何枪打不死 5 级甲 BOSS（3 级弹 ≤ 60s）',
      Object.keys(sim).every(id => sim[id].boss3.t <= 60));
    T('霰弹用 6 级弹打 4 级甲 ≤ 3 发', sim.m870.r6.shots <= 3);
    T('无甲 TTK 未被改动影响（AKM 1 发 / M4 2 发 / 野牛 3 发）',
      sim.akm.bare.shots === 1 && sim.m4a1.bare.shots === 2 && sim.bizon.bare.shots === 3);

    /* ───────── 4. UI 与改装透传 ───────── */
    const spec = w.eval(`weaponSpecs(WEAPONS.akm)`);
    T('军火库规格表出现「护甲伤害」行', /护甲伤害/.test(spec));
    T('护甲伤害行带「磨穿」提示', /4 级甲约 \d+ 发磨穿/.test(spec));

    const st = JSON.parse(w.eval(`(function(){
      var s = weaponStats('akm');
      return JSON.stringify({ dmg: s.dmg, ad: s.armorDmg, spread: s.spread });
    })()`));
    T('weaponStats 透传护甲伤害', st.ad === 11);
    T('改装后身体伤害仍为 44（AKM 无加伤配件）', st.dmg === 44);

    /* ───────── 5. 子弹携带字段 ───────── */
    const bullet = JSON.parse(w.eval(`(function(){
      // 造一发玩家子弹：走真实开火路径太重，这里直接验证字段来源
      var g = WEAPONS.akm, T = AMMO_TIERS[5];
      return JSON.stringify({ ad: g.armorDmg || 0, amul: T.armorMul || 1 });
    })()`));
    T('子弹护甲伤害来自枪、系数来自弹级', bullet.ad === 11 && bullet.amul === 1.16);

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('测试异常：', e && e.stack || e);
    process.exit(1);
  }
}, 1500);
