/* 内容扩编回归：收集品 329 / 成就 50 / 配件 84 + 兼容性 / 干员分组
   ① 收集品：总数 329，两图产地均衡，五档品质齐全，字段完整，占格合法
   ② 成就：50 条，id 唯一，test 函数对空数据不抛异常
   ③ 配件：modAllowed 兼容矩阵（类目 fit / 专属 guns / 手枪无枪托）
      cleanGunMods 读档清洗会丢掉装错的配件
   ④ 干员页：按 突击/侦察/支援/工程 四组分组摆放，卡片数 = 干员总数
   ⑤ 枪的占格：32 把枪全部在 SHAPES / CELLS 显式登记，宽×高与格数一致（防空档回落 4 格）
   ⑥ 配件占格：84 件按体积四档 1x1 / 2x1 / 3x1 / 2x2 全登记，口袋放不进 2 格以上件 */
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

setTimeout(() => {
  try {
    const d = JSON.parse(w.eval(`JSON.stringify((function(){
      var qc = { dam: 0, space: 0, both: 0 };
      var perQ = { dam: {}, space: {}, both: {} };
      var bad = [];
      for (var id in RELICS) {
        var r = RELICS[id], z = r.z || 'both';
        qc[z]++;
        if (!r.name || !r.icon || !r.desc || !(r.price > 0)) bad.push(id);
        perQ[z][r.q] = (perQ[z][r.q] || 0) + 1;
        if (r.q === 'myth' && r.price < 20000) bad.push(id + ':myth-cheap');
        if (r.q !== 'myth' && r.price > 40000) bad.push(id + ':price-out-of-band');
      }
      var s = RELIC_GRID;
      for (var gid in s) {
        if (!RELICS[gid]) { bad.push('grid-orphan:' + gid); continue; }
        if (!(s[gid][0] >= 1 && s[gid][1] >= 1 && s[gid][0] <= 4 && s[gid][1] <= 4)) bad.push('grid-bad:' + gid);
        if (s[gid][0] === 3 && s[gid][1] >= 3 && RELICS[gid].q !== 'myth') bad.push('grid-myth-only:' + gid);
      }
      return { n: Object.keys(RELICS).length, qc: qc, perQ: perQ, bad: bad };
    })())`));
    T('收集品总数 329', d.n === 329);
    const mythStats = JSON.parse(w.eval(`JSON.stringify((function(){
      var n = 0, sum = 0, cheap = [], named = {};
      for (var id in RELICS) {
        var r = RELICS[id];
        if (r.q !== 'myth') continue;
        n++; sum += r.price;
        if (r.price < 60000) cheap.push(id);
        if (id === 'africaheart') named.heart = r.price;
        if (id === 'oceantear') named.tear = r.price;
      }
      var shapes = {};
      for (var id2 in RELICS) {
        if (RELICS[id2].q !== 'myth') continue;
        var g = relicShape(id2);
        shapes[g[0] + 'x' + g[1]] = true;
      }
      return { n: n, avg: sum / n, cheap: cheap, named: named, shapes: Object.keys(shapes).sort() };
    })())`));
    T('神话 29 件、均价 ≈ 10 万（9.5 万以上）', mythStats.n === 29 && mythStats.avg >= 95000);
    T('神话没有 6 万以下的便宜货', mythStats.cheap.length === 0);
    T('非洲之心 131452 / 海洋之泪 333333（1x1）', mythStats.named.heart === 131452 && mythStats.named.tear === 333333);
    T('超稀有掉率加权：非洲之心 / 海洋之泪 0.25，其他默认 1',
      w.eval(`RELIC_RARITY.africaheart === 0.25 && RELIC_RARITY.oceantear === 0.25 &&
              RELIC_IDS.every(id => RELIC_RARITY[id] === undefined || id === 'africaheart' || id === 'oceantear')`));
    T('神话新形状齐全：1x2 / 1x3 / 2x2 / 2x3 / 3x3 在列',
      ['1x2', '1x3', '2x2', '2x3', '3x3'].every(s => mythStats.shapes.includes(s)));
    T('坝区 149 + 航天 149 + 双图 31', d.qc.dam === 149 && d.qc.space === 149 && d.qc.both === 31);
    T('两图各自五档品质齐全',
      ['common', 'rare', 'epic', 'legend', 'myth'].every(q => d.perQ.dam[q] > 0 && d.perQ.space[q] > 0));
    T('字段完整 / 价格档位 / 占格合法 / 无孤儿占格', d.bad.length === 0);

    const ach = JSON.parse(w.eval(`JSON.stringify((function(){
      var ids = ACHIEVEMENTS.map(function(a){ return a.id; });
      var dup = ids.filter(function(x, i){ return ids.indexOf(x) !== i; });
      var bad = [];
      var emptyRun = { success: false, kills: 0, relics: 0, value: 0, blinds: 0,
        swarmHits: 0, bleedHits: 0, silentKills: 0, noArmor: true, tier: 'standard' };
      var emptySt = { raids: 0, extracts: 0, deaths: 0, loot: 0, kills: 0, sold: 0,
        relics: 0, blinds: 0, swarm: 0, bleed: 0, silent: 0, secret: 0, top: 0, noArmor: 0 };
      for (var a of ACHIEVEMENTS) {
        if (!(a.reward > 0) || !a.name || !a.desc) bad.push(a.id);
        try { a.test(emptyRun, emptySt); } catch (e) { bad.push(a.id + ':throw'); }
        if (a.live && !ACH_LIVE[a.live]) bad.push(a.id + ':live');
        if (a.live && !a.goal) bad.push(a.id + ':goal');
      }
      return { n: ACHIEVEMENTS.length, dup: dup, bad: bad,
        rewardSum: ACHIEVEMENTS.reduce(function(x, a){ return x + a.reward; }, 0) };
    })())`));
    T('成就 50 条', ach.n === 50);
    T('成就 id 唯一、字段完整、test 空数据不抛异常、live 指标存在', ach.dup.length === 0 && ach.bad.length === 0);

    const mods = JSON.parse(w.eval(`JSON.stringify((function(){
      var slotIds = MOD_SLOTS.map(function(s){ return s.id; });
      var cats = WEAPON_CATS.map(function(c){ return c.id; });
      var bad = [];
      for (var id in MODS) {
        var m = MODS[id];
        if (slotIds.indexOf(m.slot) < 0) bad.push(id + ':slot');
        if (!m.eff || typeof m.eff !== 'object') bad.push(id + ':eff');
        if (m.fit) for (var c of m.fit) if (cats.indexOf(c) < 0) bad.push(id + ':fit-' + c);
        if (m.guns) for (var g of m.guns) if (!WEAPONS[g]) bad.push(id + ':gun-' + g);
        if (m.guns && m.guns.length === 0) bad.push(id + ':empty-guns');
      }
      return { n: Object.keys(MODS).length, bad: bad };
    })())`));
    T('配件 84 件：槽位 / 效果 / 类目白名单 / 专属枪 id 全部合法', mods.n === 84 && mods.bad.length === 0);

    // ── modAllowed 兼容矩阵 ──
    const mx = JSON.parse(w.eval(`JSON.stringify({
      akSide: [modAllowed('akm','d_ak_dust'), modAllowed('m4a1','d_ak_dust'), modAllowed('rpk','d_ak_dust')],
      valInt: [modAllowed('asval','d_asval_int'), modAllowed('akm','d_asval_int')],
      bull:   [modAllowed('qbz95','d_bull_kit'), modAllowed('aug','d_bull_kit'), modAllowed('akm','d_bull_kit')],
      pistol: [modAllowed('g17','d_pistol_comp'), modAllowed('mp7','d_pistol_comp')],
      sgPort: [modAllowed('m870','d_sg_port'), modAllowed('akm','d_sg_port')],
      dirKit: [modAllowed('awm','s_director_kit'), modAllowed('m700','s_director_kit')],
      mk4Auto: [modAllowed('mk4','mk4_auto'), modAllowed('mp7','mk4_auto'), modAllowed('akm','mk4_auto')],
      bipod:  [modAllowed('m700','d_sniper_bipod'), modAllowed('m700','d_sniper_bipod')],
      chain:  [modAllowed('m249','s_mg_chain'), modAllowed('mp7','s_mg_chain')],
      drum:   [modAllowed('bizon','drummag'), modAllowed('m4a1','drummag'), modAllowed('m249','drummag')],
      scope4x:[modAllowed('akm','scope4x'), modAllowed('g17','scope4x'), modAllowed('m700','scope4x')],
      pStock: [modAllowed('g17','tactic'), modAllowed('akm','tactic')],
      long:   [modAllowed('m700','d_op_long'), modAllowed('mp7','d_op_long')],
      pistolModAll: modAllowed('g17','reddot') && modAllowed('g17','supp') && modAllowed('g17','d_mg_plus'),
    })`));
    T('AK 侧轨：AKM/RPK 可装，M4A1 装不上', JSON.stringify(mx.akSide) === '[true,false,true]');
    T('AS 微声枪口：AS VAL 可装，AKM 装不上', JSON.stringify(mx.valInt) === '[true,false]');
    T('无托缓冲：QBZ-95/AUG 可装，AKM 装不上', JSON.stringify(mx.bull) === '[true,true,false]');
    T('手枪补偿：G17 可装，MP7 装不上', JSON.stringify(mx.pistol) === '[true,false]');
    T('霰弹护套：M870 可装，AKM 装不上', JSON.stringify(mx.sgPort) === '[true,false]');
    T('总监瞄具：AWM 可装，M700 装不上', JSON.stringify(mx.dirKit) === '[true,false]');
    T('MK4 连发枪管：MK4 可装，MP7/AKM 装不上', JSON.stringify(mx.mk4Auto) === '[true,false,false]');
    T('狙击两脚架：M700 可装', mx.bipod[0] === true);
    T('弹链转换：M249 可装，MP7 装不上', JSON.stringify(mx.chain) === '[true,false]');
    T('弹鼓：Bizon/M249 可装，M4A1 装不上', JSON.stringify(mx.drum) === '[true,false,true]');
    T('四倍镜：AKM/M700 可装，手枪装不上', JSON.stringify(mx.scope4x) === '[true,false,true]');
    T('枪托：手枪装不上，AKM 可装', JSON.stringify(mx.pStock) === '[false,true]');
    T('长焦镜：M700 可装，MP7 装不上', JSON.stringify(mx.long) === '[true,false]');
    T('通用基础件手枪全可装（红点/消音/加厚簧）', mx.pistolModAll === true);

    // ── MK4 三连发 + 专属连发枪管的模式覆写 ──
    const mk4mode = JSON.parse(w.eval(`JSON.stringify((function(){
      var base = weaponStats('mk4');
      var out = { baseMode: base.mode, baseBurst: base.burst, baseGap: base.burstGap };
      if (!SAVE.mods) SAVE.mods = {};
      SAVE.mods.mk4 = { muzzle: 'mk4_auto' };
      var withMod = weaponStats('mk4');
      out.modMode = withMod.mode;
      SAVE.mods.mk4 = {};
      return out;
    })())`));
    T('MK4 出厂是三连点射（3 发 / 0.062 发间隔）', mk4mode.baseMode === 'burst' && mk4mode.baseBurst === 3 && mk4mode.baseGap === 0.062);
    T('装连发改装枪管后 weaponStats 变全自动', mk4mode.modMode === 'auto');

    // ── cleanGunMods 读档清洗会丢掉装错的 ──
    const cl = JSON.parse(w.eval(`JSON.stringify({
      keep: Object.keys(cleanGunMods({ akm: { optic: 'd_ak_dust', muzzle: 'supp' } })),
      dropSide: Object.keys(cleanGunMods({ m4a1: { optic: 'd_ak_dust' } }).m4a1 || {}),
      dropStock: Object.keys(cleanGunMods({ g17: { stock: 'tactic' } }).g17 || {}),
    })`));
    T('读档清洗：合法保留，AK 侧轨装 M4A1 / 托装手枪都会被清掉',
      cl.keep.includes('akm') && cl.dropSide.length === 0 && cl.dropStock.length === 0);

    // ── 干员分组 ──
    const ops = JSON.parse(w.eval(`JSON.stringify((function(){
      openOperators();
      var hds = Array.prototype.map.call(document.querySelectorAll('#opsList .ops-grouphd'), function(x){
        return { rc: x.dataset.rc, b: x.querySelector('b').textContent }; });
      var cards = document.querySelectorAll('#opsList .ops-card');
      var detail = document.querySelector('#opsDetail .ops-name');
      closeOperators();
      return { hd: hds, n: cards.length, opN: OP_ORDER.length, detail: detail ? detail.textContent : '' };
    })())`));
    T('干员页四组分类标题（突击→侦察→支援→工程）',
      JSON.stringify(ops.hd.map(x => x.rc)) === '["assault","recon","support","engineer"]' &&
      JSON.stringify(ops.hd.map(x => x.b)) === '["突击","侦察","支援","工程"]');
    T('分组后卡片总数不变（7 张），详情面板正常渲染', ops.n === ops.opN && !!ops.detail);

    // ── 成就结算入口带上 value（估值类成就依赖） ──
    T('结算 run 带 value 字段（源码检查）', /value: G\.lootValue \| 0,/.test(src));
    T('累计账本入账（relics/secret/top/noArmor/blinds/…）',
      /SAVE\.stats\.relics = \(SAVE\.stats\.relics \| 0\)/.test(src) &&
      /SAVE\.stats\.secret = \(SAVE\.stats\.secret \| 0\)/.test(src) &&
      /SAVE\.stats\.noArmor = \(SAVE\.stats\.noArmor \| 0\)/.test(src) &&
      /SAVE\.stats\.blinds = \(SAVE\.stats\.blinds \| 0\) \+ \(G\.blinds \| 0\)/.test(src));

    // ── ⑤ 枪的占格：每把枪都要在 SHAPES / CELLS 里显式登记 ──
    //    早先新增的 17 把枪两张表都没登记，cellSize 按类型兜底给 4 格（2x2），
    //    等于 HK416 / PKM 这些大枪只占冲锋枪一半的空间，搜刮运输效率被白送。这条断言防回归。
    const gs = JSON.parse(w.eval(`JSON.stringify((function(){
      var fb = [], mismatch = [], by = {};
      for (var id in WEAPONS) {
        var s = SHAPES[id], cells = CELLS[id];
        if (!s) fb.push(id);
        else if (!cells) mismatch.push(id + ':no-cells');
        else if (s[0] * s[1] !== cells) mismatch.push(id + ':' + s.join('x') + '!=' + cells);
        if (s) by[id] = s.join('x') + '/' + (s[0] * s[1]);
      }
      return { total: Object.keys(WEAPONS).length, fb: fb, mismatch: mismatch, by: by };
    })())`));
    T('全部 ' + gs.total + ' 把枪都在 SHAPES 里显式登记（没有走 4 格兜底）', gs.fb.length === 0);
    T('SHAPES 宽×高 与 CELLS 格数逐把一致', gs.mismatch.length === 0);
    T('冲锋枪 3x2 / 6 格（野牛·MK4·汤姆逊·MP7·Vector）',
      ['bizon', 'mk4', 'thompson', 'mp7', 'vector'].every(id => gs.by[id] === '3x2/6'));
    T('短身步枪 4x2 / 8 格（AUG·MCX·SR-3M）',
      ['aug', 'mcx', 'sr3m'].every(id => gs.by[id] === '4x2/8'));
    T('标准步枪 / 精确射手 / 轻机枪 5x2 / 10 格',
      ['akm', 'm4a1', 'qbz95', 'ak12', 'qbz192', 'qbz191', 'sr9',
        'hk416', 'k437', 'asval', 'rpk', 'm249', 'pkm', 'sks', 'm14', 'sr25', 'svd']
        .every(id => gs.by[id] === '5x2/10'));
    T('狙击：R93 5x1 / M700 5x1 / AWM 7x1',
      gs.by.r93 === '5x1/5' && gs.by.m700 === '5x1/5' && gs.by.awm === '7x1/7');

    // ── ⑥ 配件占格：按体积分四档（1x1 / 2x1 / 3x1 / 2x2），全部显式登记 ──
    //    早先 84 件配件全落在 cellSize 的「1 格」兜底上 —— ¥8,800 的总监瞄准组件和
    //    ¥420 的机械瞄具运输成本一模一样，配件完全没有体积概念。这条断言防回归：
    //    新增配件必须在 MOD_FOOT 四张表里挑一档。
    //    3x1 = 长件（枪管 / 倍镜 / 抑制器 / 两脚架 / 弹链 / 供弹托），2x2 只剩三种弹鼓。
    const ms = JSON.parse(w.eval(`JSON.stringify((function(){
      var fb = [], bad = [], dist = {}, big = [];
      for (var id in MODS) {
        var sh = SHAPES[id];
        if (!sh) { fb.push(id); continue; }
        if (cellSize({ t: 'mod', id: id }) !== sh[0] * sh[1]) bad.push(id);
        dist[sh.join('x')] = (dist[sh.join('x')] || 0) + 1;
        if (sh[0] * sh[1] > 1) big.push(id);
      }
      // 口袋是 5 个独立的单格舱：2 格以上的配件一律塞不进
      var pb = zoneBlocks('pocket');
      var pocket = new Array(5).fill(null);
      var leak = [];
      for (var i = 0; i < big.length; i++) {
        if (findFitAuto(pocket, pb, { t: 'mod', id: big[i] })) leak.push(big[i]);
      }
      // 2x2 组只剩弹鼓；18 件 3x1 长件要能横向卡进 3x1 舱
      var big22 = [], fit31 = 0;
      for (var id2 in MODS) {
        var sh2 = SHAPES[id2] || [1, 1];
        if (sh2[0] === 2 && sh2[1] === 2) big22.push(id2);
        if (sh2[0] === 3 && sh2[1] === 1) {
          var slot = new Array(3).fill(null);
          if (findFitAuto(slot, [[0, 3, 3]], { t: 'mod', id: id2 })) fit31++;
        }
      }
      big22.sort();
      return { total: Object.keys(MODS).length, fb: fb, bad: bad, dist: dist, leak: leak,
               big22: big22, fit31: fit31 };
    })())`));
    T('全部 ' + ms.total + ' 件配件都在 SHAPES 显式登记（没有走 1 格兜底）', ms.fb.length === 0);
    T('配件只有 1x1 / 2x1 / 3x1 / 2x2 四档', Object.keys(ms.dist).sort().join(',') === '1x1,2x1,2x2,3x1');
    T('四档数量 小件 28 / 中件 35 / 长件 18 / 弹鼓 3',
      ms.dist['1x1'] === 28 && ms.dist['2x1'] === 35 && ms.dist['3x1'] === 18 && ms.dist['2x2'] === 3);
    // 2x2 只剩弹鼓：别的配件混进 2x2 就说明有人偷偷把长件改回去了
    T('2x2 只剩三种弹鼓', ms.big22.join(',') === 'd_mg_drum2,drummag,s_mg_lightdrum');
    // 长件进 3x1 舱：这是弹挂最主流的舱形，必须横着塞得进
    T('18 件长件都能塞进 3x1 舱', ms.fit31 === 18);
    T('占格数与形状逐件一致', ms.bad.length === 0);
    T('口袋（5 个单格舱）放不进任何 2 格以上配件', ms.leak.length === 0);

  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
