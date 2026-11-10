/* ═══════════════════════════════════════════════════════════════
   数值验证 harness —— 把「体感平衡」变成「看表」
   ─────────────────────────────────────────────────────────────
   用法：node .workbuddy/sim_balance.js [--tier standard|secret|top]
   输出：
     1) 每把枪对 runner / shooter / brute / sniper / boss 的
        弹数、TTK（含换弹）、单杀弹药成本（按最便宜弹级 / 最高弹级）
     2) 干员技能爆发参考表（G/V/X 的伤害与 CD）
   说明：
     · 护甲按 penRatio 线性折算，未模拟护甲耐久被磨穿的二次效应
       （低穿甲弹实际还能靠磨甲补刀，表里会显得略慢）
     · 不算移动、命中率、爆头 —— 这是「站桩理论值」，用于横向对比
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = path.join(__dirname, '..', 'index.html');
const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
});
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);

const pad = (s, n) => { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };
const padL = (s, n) => { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; };

setTimeout(() => {
  try {
    const argTier = (process.argv.find(a => a.startsWith('--tier=')) || '').split('=')[1] || 'standard';
    const data = JSON.parse(w.eval(`(function(){
      var guns = [];
      for (var id in WEAPONS) {
        var g = WEAPONS[id];
        if (!g.cat || g.cat === 'melee') continue;
        var tiers = CAL_TIERS[g.cal] || [1];
        var low = tiers[0], high = tiers[tiers.length - 1];
        guns.push({ id: id, name: g.short || id, cat: g.cat, cal: g.cal,
                    dmg: g.dmg, armorDmg: g.armorDmg || 0,
                    rate: g.rate, count: g.count || 1, mode: g.mode,
                    burst: g.burst || 0, burstGap: g.burstGap || 0,
                    mag: g.mag, reload: g.reload, price: g.price,
                    fb: g.fb || null, range: g.range,
                    low: low, high: high,
                    lvHigh: AMMO_TIERS[high].lv, mulHigh: AMMO_TIERS[high].dmgMul,
                    penHigh: AMMO_TIERS[high].lv,
                    lvLow: AMMO_TIERS[low].lv, mulLow: AMMO_TIERS[low].dmgMul });
      }
      var enemies = {};
      ['runner','shooter','brute','sniper','boss'].forEach(function(t){
        var d = ENEMY_TYPES[t]; if (!d) return;
        enemies[t] = { hp: d.hp, armor: d.armor || 0, speed: d.speed, name: d.name || t };
      });
      var cal = {};
      for (var c in CALIBERS) cal[c] = { base: CALIBERS[c].base, box: CALIBERS[c].box };
      var ops = [];
      for (var k in OPERATORS) {
        var o = OPERATORS[k];
        ops.push({ id: k, name: o.name, role: o.role,
                   g: o.g.name + ' (' + o.g.cd + 's' + (o.g.charges ? '×' + o.g.charges : '') + ')',
                   v: o.v.name + ' (' + o.v.cd + 's' + (o.v.charges ? '×' + o.v.charges : '') + ')',
                   x: o.x.name + ' (' + o.x.cd + 's' + (o.x.charges ? '×' + o.x.charges : '') + ')' });
      }
      return JSON.stringify({ guns: guns, enemies: enemies, cal: cal, ops: ops });
    })()`));

    const tier = argTier === 'top' ? { hpMul: 1.35, armorAdd: 2 } : argTier === 'secret' ? { hpMul: 1.2, armorAdd: 1 } : { hpMul: 1, armorAdd: 0 };
    /* 护甲耐久：同一级具名甲有好几件，取均值（3级68 / 4级93 / 5级110 / 6级133） */
    const ARMOR_HP = { 0: 0, 1: 45, 2: 55, 3: 68, 4: 93, 5: 110, 6: 133 };
    const E = {};
    for (const k in data.enemies) {
      const d = data.enemies[k];
      const lv = Math.min(6, d.armor > 0 ? d.armor + tier.armorAdd : 0);
      E[k] = { hp: Math.round(d.hp * tier.hpMul), armor: lv, armorHp: ARMOR_HP[lv] || 0 };
    }
    const penRatio = (pen, lv) => {
      lv |= 0; if (lv <= 0) return 1;
      const d = lv - (pen | 0);
      if (d <= -2) return 1; if (d === -1) return 0.75; if (d === 0) return 0.5; return 0;
    };

    /* 远距衰减：d0 内满伤，之后线性掉到 min（与 index.html 的 bulletDamage 同一条公式） */
    const fbMul = (gun, d) => {
      if (!gun.fb) return 1;
      const k = Math.max(0, Math.min(1, (d - gun.fb.d0) / Math.max(1, gun.range - gun.fb.d0)));
      return 1 - k * (1 - gun.fb.min);
    };

    const tierOf = lv => w.eval(`AMMO_TIERS[${lv}]`);

    /* 真实击杀模拟：逐发结算「穿透 → 肉伤」「护甲伤害 → 耐久」，磨穿后按裸体算。
       低弹级不再直接 Infinity —— 靠磨甲仍然能打死，只是慢。 */
    const shotsToKill = (gun, tierLv, target, dist) => {
      const T = tierOf(tierLv);
      const fbm = fbMul(gun, dist || 0);
      let hp = target.hp, ah = target.armorHp || 0, shots = 0;
      while (hp > 0 && shots < 4000) {
        const ratio = (ah > 0 && target.armor > 0) ? penRatio(tierLv, target.armor) : 1;
        const per = gun.dmg * T.dmgMul * fbm * gun.count * (ratio > 0 ? ratio : (tierLv === 0 ? T.fleshMul : 0));
        if (ah > 0 && target.armor > 0) {
          ah = Math.max(0, ah - gun.armorDmg * gun.count * T.armorMul * (ratio > 0 ? 1 : 0.65));
        }
        hp -= per;
        shots++;
      }
      return shots;
    };

    /* 时间：按「最后一发落地」计，含连发节奏与换弹 */
    const timeOf = (gun, shots) => {
      if (!isFinite(shots) || shots <= 0) return Infinity;
      let t;
      if (gun.mode === 'burst' && gun.burst > 0) {
        const groups = Math.floor(shots / gun.burst);
        const rem = shots % gun.burst;
        t = groups * gun.rate + rem * gun.burstGap;
      } else {
        t = shots * gun.rate;
      }
      if (shots > gun.mag) t += Math.ceil(shots / gun.mag - 1) * gun.reload;
      return t;
    };

    const shoot = (gun, tierLv, target, dist) => {
      const shots = shotsToKill(gun, tierLv, target, dist);
      return { shots, ttk: timeOf(gun, shots) };
    };

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  数值 harness · 击杀效率表（' + pad(argTier, 8) + ' 图 · 站桩理论值）                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('\n【靶子】', Object.keys(E).map(k => `${k}: ${E[k].hp}hp / ${E[k].armor}级甲`).join('   '));

    const rows = [];
    for (const g of data.guns) {
      const enemyOrder = ['runner', 'shooter', 'brute', 'sniper', 'boss'];
      const cells = enemyOrder.map(k => {
        const r = shoot(g, g.penHigh, E[k], 300);
        return { shots: r.shots, ttk: r.ttk };
      });
      const far = shoot(g, g.penHigh, E.brute, 900);
      const costHi = cells[0].shots * (data.cal[g.cal] ? data.cal[g.cal].base * w.eval(`AMMO_TIERS[${g.high}].priceMul`) : 1);
      rows.push({ g, cells, far, costHi });
    }
    rows.sort((a, b) => a.cells[2].ttk - b.cells[2].ttk);

    console.log('\n【对机枪兵（brute）TTK 排序 · 最高弹级】');
    console.log(pad('枪', 12) + pad('口径', 10) + pad('弹级', 6) + pad('甲伤', 6) + pad('弹数', 6) + pad('TTK近', 8) + pad('TTK远', 8) + pad('小兵弹费¥', 10) + '对 runner / shooter / sniper / boss 弹数');
    for (const r of rows) {
      const g = r.g;
      console.log(
        pad(g.name, 12) + pad(g.cal, 10) + pad(g.high + '级', 6) + pad(g.armorDmg, 6) +
        pad(r.cells[2].shots, 6) + pad(r.cells[2].ttk.toFixed(2), 8) +
        pad(r.far.ttk === Infinity ? '∞' : r.far.ttk.toFixed(2), 8) +
        pad(Math.round(r.costHi), 10) +
        [0, 1, 3, 4].map(i => r.cells[i].shots).join(' / ')
      );
    }

    /* ── 护甲节奏：同一把枪换弹级，磨穿重甲要多久 ── */
    const BRUTE = { hp: 280, armor: 4, armorHp: 93 };
    const simKill = (gun, tierLv) => {
      const T = tierOf(tierLv);
      let ah = BRUTE.armorHp, cross = 0;
      const shots = shotsToKill(gun, tierLv, BRUTE, 0);
      /* 复算磨穿点（只用于展示） */
      let h = ah, n = 0;
      while (h > 0 && n < shots) {
        const ratio = penRatio(tierLv, BRUTE.armor);
        h = Math.max(0, h - gun.armorDmg * gun.count * T.armorMul * (ratio > 0 ? 1 : 0.65));
        n++;
        if (h <= 0) cross = n;
      }
      return { shots, ttk: timeOf(gun, shots), cross };
    };

    console.log('\n【护甲节奏 · 4 级甲机枪兵 280HP / 耐久 93】');
    console.log(pad('枪', 12) + pad('身/甲', 9) + pad('3级弹', 16) + pad('4级弹', 16) + pad('5级弹', 16) + '3÷5 倍率');
    for (const g of data.guns) {
      const r3 = simKill(g, 3);
      const r4 = simKill(g, 4);
      const r5 = simKill(g, 5);
      const cell = r => pad(r.shots + '发/' + r.ttk.toFixed(2) + 's' + (r.cross ? '(穿' + r.cross + ')' : ''), 16);
      console.log(
        pad(g.name, 12) + pad(g.dmg + '/' + g.armorDmg, 9) +
        cell(r3) + cell(r4) + cell(r5) + (r5.ttk > 0 ? (r3.ttk / r5.ttk).toFixed(2) + 'x' : '—')
      );
    }

    console.log('\n【干员技能爆发参考】');
    console.log(pad('干员', 10) + pad('定位', 6) + 'G / V / X');
    for (const o of data.ops) {
      console.log(pad(o.name, 10) + pad(o.role, 6) + o.g + ' | ' + o.v + ' | ' + o.x);
    }

    console.log('\n【读数提示】');
    console.log('· TTK近 = 300 距离站桩；TTK远 = 900 距离，含该枪自己的远距衰减；');
    console.log('· 六把步枪近距 0.94~1.12s 拉开档位，远距由衰减决定谁还能打；');
    console.log('· TTK > 1.2s 的枪在正面交火里要求你先手或先手命中 2 发以上；');
    console.log('· 弹数 > 弹匣时表内已含一次换弹（1.1~2s），近战贴脸会非常致命；');
    console.log('· 单杀弹费 = 弹数 × 单发价（口径基价×弹级倍率），高弹级打小兵是纯亏本；');
    console.log('· 护甲节奏表 = 真实磨穿过程：零穿透弹只按 65% 磨甲，3 级弹打 4 级甲约慢 2 倍（少花钱换时间）；');
    console.log('· 「穿N」= 第 N 发磨穿护甲，之后全按身体伤害结算。');
    process.exit(0);
  } catch (e) {
    console.error('harness 失败：', e && e.stack || e);
    process.exit(1);
  }
}, 1500);
