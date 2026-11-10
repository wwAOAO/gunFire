/* 五项体验补强：⑥步枪 TTK 差异化 ⑧局内成就进度 ⑨命中确认 ⑤委托系统 ⑪配装预设 */
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
    /* ───────── ⑥ 六把步枪 TTK 差异化 ───────── */
    const rifles = JSON.parse(w.eval(`(function(){
      var ids = ['akm','m4a1','qbz95','ak12','qbz192','qbz191'];
      function ttk(id, dist){
        var w = WEAPONS[id];
        var mul = 1;
        if (w.fb) {
          var k = Math.max(0, Math.min(1, (dist - w.fb.d0) / Math.max(1, w.range - w.fb.d0)));
          mul = 1 - k * (1 - w.fb.min);
        }
        var per = w.dmg * 1.08 * 0.75 * mul;           // 5 级弹打 4 级甲
        var shots = Math.ceil(280 / per);
        return { id: id, dmg: w.dmg, rate: w.rate, shots: shots, near: shots * w.rate,
                 role: w.role || '', fb: !!w.fb };
      }
      var arr = ids.map(function(id){ var r = ttk(id, 300); r.far = ttk(id, 900).shots * WEAPONS[id].rate; return r; });
      return JSON.stringify(arr);
    })()`));
    const nears = rifles.map(r => r.near);
    T('六把步枪都有定位标签', rifles.every(r => r.role.length > 0));
    T('六把步枪都有远距衰减参数', rifles.every(r => r.fb));
    T('近距 TTK 跨度 ≥ 0.15s（不再挤在 1.03~1.07）', Math.max(...nears) - Math.min(...nears) >= 0.15);
    T('近距 TTK 两两不重合（保留两位）', new Set(nears.map(v => v.toFixed(2))).size === 6);
    const far95 = rifles.find(r => r.id === 'qbz95').far;
    const far192 = rifles.find(r => r.id === 'qbz192').far;
    T('远距：QBZ-95 最短（1.15s）', Math.abs(far95 - 1.15) < 0.02);
    T('远距：QBZ-192 最长（约 1.39s）', far192 > far95 + 0.2);
    T('AKM 近距最快（8 发 / 0.94s）', rifles.find(r => r.id === 'akm').shots === 8);

    /* 衰减公式本身：300 距离、d0=100 d1=500 min=0.5 → 100 → 75 */
    const fbTest = w.eval(`(function(){
      var fake = { x: 300, y: 0, ox: 0, oy: 0, dmg: 100, pen: 1, fb: { d0: 100, d1: 500, min: 0.5 } };
      var e = { armorHp: 0, armorLv: 0, x: 0, y: 0, r: 4 };
      return bulletDamage(e, fake).dmg;
    })()`);
    T('远距衰减公式：300/500 处打出 75 伤', Math.abs(fbTest - 75) < 0.01);
    const noFb = w.eval(`(function(){
      var fake = { x: 800, y: 0, dmg: 100, pen: 1, fb: null };
      var e = { armorHp: 0, armorLv: 0, x: 0, y: 0, r: 4 };
      return bulletDamage(e, fake).dmg;
    })()`);
    T('没有 fb 的子弹（含敌人弹）不掉伤', noFb === 100);

    /* ───────── ⑨ 命中确认 ───────── */
    const hm = JSON.parse(w.eval(`(function(){
      G.time = 10;
      spawnHitmark('kill');
      var a = { kind: G.hitmark.kind, live: G.hitmark.at > G.time };
      spawnHitmark('armor');
      var b = G.hitmark.kind;
      return JSON.stringify({ a: a, b: b });
    })()`));
    T('spawnHitmark 写入 kind 与到期时间', hm.a.kind === 'kill' && hm.a.live);
    T('命中/破甲/击杀三种颜色分支可切换', hm.b === 'armor');
    const hmWire = JSON.parse(w.eval(`JSON.stringify({
      reset: /G\\.hitmark = null/.test(startRaid.toString()),
      armor: /spawnHitmark\\('armor'\\)/.test(updateBullets.toString()),
      kill: /spawnHitmark\\(e\\.alive \\? 'hit' : 'kill'\\)/.test(updateBullets.toString()),
      draw: /spawnHitmark/.test(drawCrosshair.toString()) || /G\\.hitmark/.test(drawCrosshair.toString())
    })`));
    T('新局清空命中标记', hmWire.reset);
    T('子弹破甲 / 命中 / 击杀都触发 hitmark', hmWire.armor && hmWire.kill);
    T('准星绘制里画 hitmark', hmWire.draw);

    /* ───────── ⑧ 局内成就进度 ───────── */
    const ach = JSON.parse(w.eval(`(function(){
      SAVE.achieved = {};
      G.kills = 5; G.blinds = 2; G.swarmHits = 0; G.bleedHits = 0; G.silentKills = 0;
      SAVE.stats = { raids: 1, extracts: 2, deaths: 0, loot: 0, kills: 100, sold: 0 };
      var rows = achLiveRows();
      var butcher = rows.find(function(r){ return r.a.id === 'butcher'; });
      var exec = rows.find(function(r){ return r.a.id === 'executioner'; });
      var blind = rows.find(function(r){ return r.a.id === 'blind_master'; });
      return JSON.stringify({
        n: rows.length,
        butcher: butcher ? butcher.v + '/' + butcher.n : null,
        exec: exec ? exec.v : null,
        blindAt: rows.indexOf(blind),
        sorted: rows.every(function(r, i){ return i === 0 || rows[i - 1].r >= r.r; }),
        noSuccessOnly: !rows.some(function(r){ return r.a.id === 'first_extract' || r.a.id === 'top_clear'; })
      });
    })()`));
    T('追踪面板列出 25 条可实时计算的成就', ach.n === 25);
    T('本局击杀 5：屠夫显示 5/20', ach.butcher === '5/20');
    T('累计击杀 = 存档 100 + 本局 5 = 105', ach.exec === 105);
    T('按完成度从高到低排序', ach.sorted);
    T('只能结算时判定的撤离类不列进追踪', ach.noSuccessOnly);

    const achToast = JSON.parse(w.eval(`(function(){
      SAVE.achieved = {};
      G.achReady = {};
      G.blinds = 8;
      updateAchTracker();
      var first = !!G.achReady.blind_master;
      var t1 = G.achReady.blind_master;
      updateAchTracker();
      return JSON.stringify({ first: first, t: t1, again: G.achReady.blind_master });
    })()`));
    T('达标瞬间写进 G.achReady（只提示一次）', achToast.first && achToast.t === 1 && achToast.again === 1);

    const achMove = JSON.parse(w.eval(`(function(){
      var noHud = typeof drawAchTracker === 'undefined' && typeof achHudOn === 'undefined';
      var def = DEFAULT_SAVE().settings.achHud;
      G.kills = 5; SAVE.stats = { raids: 1, extracts: 2, deaths: 0, loot: 0, kills: 100, sold: 0 };
      G.scene = 'playing'; pauseRaid();
      var html = document.getElementById('pauseAch') ? document.getElementById('pauseAch').innerHTML : '';
      var hasBar = html.indexOf('本局成就') !== -1 && html.indexOf('width:') !== -1;
      var n = (html.match(/达成/g) || []).length;
      G.scene = 'lobby'; document.getElementById('pause').classList.add('hidden');
      return JSON.stringify({ noHud: noHud, def: def, hasBar: hasBar, rows: n });
    })()`));
    T('局内 HUD 不再常驻成就面板（drawAchTracker/achHudOn 已移除）', achMove.noHud === true);
    T('存档默认值不再含 achHud 字段', achMove.def === undefined);
    T('暂停面板显示本局成就进度条', achMove.hasBar === true && achMove.rows >= 1);

    /* ───────── ⑤ 委托系统 ───────── */
    const ct1 = JSON.parse(w.eval(`(function(){
      SAVE.contracts = { day: '', list: [] };
      var C = ensureContracts();
      var ids = C.list.map(function(e){ return e.id; });
      return JSON.stringify({ n: C.list.length, uniq: new Set(ids).size, day: C.day, today: contractDay(),
        allKnown: C.list.every(function(e){ return !!CONTRACT_BY_ID[e.id]; }) });
    })()`));
    T('委托每天生成 3 份', ct1.n === 3);
    T('同一天三份不重复', ct1.uniq === 3 && ct1.allKnown);
    T('委托日期 = 今天', ct1.day === ct1.today);

    const ct2 = JSON.parse(w.eval(`(function(){
      SAVE.credits = 10000;
      SAVE.contracts = { day: contractDay(), list: [
        { id: 'ct_kill25', prog: 0, done: 0 },
        { id: 'ct_raids4', prog: 3, done: 0 },
        { id: 'ct_ext3', prog: 2, done: 0 }
      ] };
      G.kills = 30; G.blinds = 0; G.swarmHits = 0; G.bleedHits = 0; G.silentKills = 0;
      G.tier = 'standard'; G.lootValue = 0; G.relics = [];
      var done1 = updateContracts(true);
      var p = SAVE.contracts.list.map(function(e){ return e.prog; });
      var done2 = updateContracts(true);          // 再结算一局：不能重复算「刚好达标」
      return JSON.stringify({ done1: done1, p: p, done2: done2 });
    })()`));
    T('结算推进委托进度（击杀 30 → 25 封顶）', ct2.p[0] === 25);
    T('同局完成 3 份（击杀 / 出勤 / 撤离）', ct2.done1 === 3);
    T('已达标后再结算不重复提示', ct2.done2 === 0);

    const ct3 = JSON.parse(w.eval(`(function(){
      SAVE.credits = 0;
      SAVE.contracts = { day: contractDay(), list: [
        { id: 'ct_kill25', prog: 25, done: 0 },
        { id: 'ct_raids4', prog: 1, done: 0 },
        { id: 'ct_ext3', prog: 3, done: 0 }
      ] };
      claimAllContracts();
      var credit = SAVE.credits;
      var done = SAVE.contracts.list.filter(function(e){ return e.done; }).length;
      claimAllContracts();                        // 已领完：不应再加钱
      return JSON.stringify({ credit: credit, done: done, again: SAVE.credits });
    })()`));
    T('全部领取：两份达标委托到账（3500+3000）', ct3.credit === 6500);
    T('领取后标记完成', ct3.done === 2);
    T('重复领取不加钱', ct3.again === 6500);

    const ct4 = JSON.parse(w.eval(`(function(){
      SAVE.credits = 10000;
      SAVE.contracts = { day: contractDay(), list: [
        { id: 'ct_kill25', prog: 1, done: 0 },
        { id: 'ct_raids4', prog: 1, done: 0 },
        { id: 'ct_ext3', prog: 1, done: 0 }
      ] };
      var oldIds = SAVE.contracts.list.map(function(e){ return e.id; });
      rerollContracts();
      var now = SAVE.contracts.list.map(function(e){ return e.id; });
      return JSON.stringify({ credit: SAVE.credits, n: now.length,
        overlap: now.filter(function(id){ return oldIds.indexOf(id) >= 0; }).length,
        progress: SAVE.contracts.list.map(function(e){ return e.prog; }) });
    })()`));
    T('重掷扣 ¥2,000', ct4.credit === 8000);
    T('重掷重置换一批（不与旧委托重复）', ct4.n === 3 && ct4.overlap === 0);
    T('重掷后进度清零', ct4.progress.every(v => v === 0));

    const ctUI = JSON.parse(w.eval(`(function(){
      SAVE.credits = 10000;
      SAVE.contracts = { day: contractDay(), list: [
        { id: 'ct_kill25', prog: 25, done: 0 },
        { id: 'ct_raids4', prog: 1, done: 0 },
        { id: 'ct_ext3', prog: 3, done: 1 }
      ] };
      openContracts();
      var box = document.getElementById('ctList');
      var cards = box.children.length;
      var btns = box.querySelectorAll('button');
      var enabled = 0;
      for (var i = 0; i < btns.length; i++) if (!btns[i].disabled) enabled++;
      var open = !document.getElementById('contracts').classList.contains('hidden');
      var done = document.getElementById('ctDone').textContent;
      var ready = document.getElementById('ctReady').textContent;
      closeContracts();
      var closed = document.getElementById('contracts').classList.contains('hidden');
      return JSON.stringify({ cards: cards, enabled: enabled, open: open, closed: closed, done: done, ready: ready });
    })()`));
    T('委托面板列出 3 张卡并能开关', ctUI.cards === 3 && ctUI.open && ctUI.closed);
    T('只有达标且未领的卡能点「领取」（1 张）', ctUI.enabled === 1);
    T('面板统计：完成 1 / 待领 ¥3,500', ctUI.done === '1' && ctUI.ready.indexOf('3,500') >= 0);

    const ctClean = JSON.parse(w.eval(`(function(){
      var c = cleanContracts({ day: '2026-01-01', list: [
        { id: 'ct_kill25', prog: 999, done: 0 },
        { id: 'not_a_contract', prog: 5, done: 0 },
        { id: 'ct_ext3', prog: -4, done: 1 }
      ] });
      return JSON.stringify(c);
    })()`));
    T('存档清洗：未知委托丢弃', ctClean.list.length === 2);
    T('存档清洗：进度夹在 0~目标', ctClean.list[0].prog === 25 && ctClean.list[1].prog === 0);

    /* ───────── ⑪ 配装预设 ───────── */
    const pr1 = JSON.parse(w.eval(`(function(){
      SAVE.owned = { akm: 1, m4a1: 2 };
      SAVE.ownedMelee = {}; SAVE.ownedMelee[STARTER_MELEE] = true;
      SAVE.equippedMelee = STARTER_MELEE;
      SAVE.loadout = { primary: 'akm', secondary: null, pistol: null };
      SAVE.worn = { rig: null, pack: null };
      SAVE.armorPieces = [{ id: 3, hp: 40, max: 50 }];
      SAVE.wornPiece = null;
      SAVE.presets = [null, null, null];
      SAVE.carePick = 'med:' + STARTER_MEDKIT;
      presetAction('save', 0);
      var saved = SAVE.presets[0];
      var has = { primary: saved.guns.primary, armor: saved.armor, name: saved.name };
      SAVE.loadout.primary = 'm4a1';
      var ok = applyPreset(saved);
      return JSON.stringify({ has: has, ok: ok, after: SAVE.loadout.primary, cards: document.getElementById('loPresets').children.length });
    })()`));
    T('保存预设记下主武器与护甲', pr1.has.primary === 'akm' && pr1.has.armor === 0);
    T('套用预设恢复主武器', pr1.ok === true && pr1.after === 'akm');
    T('预设区渲染 3 个槽', pr1.cards === 3);

    const pr2 = JSON.parse(w.eval(`(function(){
      SAVE.owned = { m4a1: 1 };
      SAVE.loadout = { primary: 'm4a1', secondary: null, pistol: null };
      SAVE.wornPiece = { id: 3, hp: 40, max: 50 };
      SAVE.armorPieces = [];
      SAVE.presets = [null, null, null];
      presetAction('save', 1);                 // 身上穿着 3 级甲
      var p = SAVE.presets[1];
      SAVE.wornPiece = null;
      SAVE.armorPieces = [{ id: 3, hp: 30, max: 50 }, { id: 5, hp: 90, max: 90 }];
      var ok = applyPreset(p);
      var worn = SAVE.wornPiece ? SAVE.wornPiece.id : 0;
      var stock = SAVE.armorPieces.map(function(a){ return a.id; });
      delete SAVE.owned.m4a1;
      var miss = presetMissing(p);
      var before = SAVE.loadout.primary;
      var blocked = applyPreset(p);
      return JSON.stringify({ ok: ok, worn: worn, stock: stock, miss: miss.length, blocked: blocked, after: SAVE.loadout.primary === before });
    })()`));
    T('套用预设会从仓库取对应护甲穿上', pr2.ok === true && pr2.worn === 3);
    T('仓库里另一件护甲不受影响', pr2.stock.indexOf(5) >= 0);
    T('缺件时预设显示缺失且拒绝套用', pr2.miss === 1 && pr2.blocked === false && pr2.after);

    const prClean = JSON.parse(w.eval(`(function(){
      var out = cleanPresets([
        { name: 'A', guns: { primary: 'not_a_gun', secondary: 'awm', pistol: 'g17' }, melee: 'nope', armor: 999, rig: 'nope', pack: 'nope', care: '' },
        null,
        { name: 'C', guns: { primary: 'akm', secondary: 'akm', pistol: null }, melee: STARTER_MELEE, armor: -5, rig: null, pack: null, care: 'med:x' }
      ]);
      return JSON.stringify({ out: out, armorLen: ARMORS.length });
    })()`));
    T('预设清洗：未知枪 / 甲 / 装备全部丢掉', prClean.out[0].guns.primary === null && prClean.out[0].armor === prClean.armorLen - 1 && prClean.out[0].rig === null);
    T('预设清洗：副武器与主武器同枪 → 副武器空着', prClean.out[2].guns.primary === 'akm' && prClean.out[2].guns.secondary === null);
    T('预设清洗：负数护甲归 0（裸奔）', prClean.out[2].armor === 0);

    /* 存档字段能 round-trip */
    const rt = JSON.parse(w.eval(`(function(){
      saveGame();
      var raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      return JSON.stringify({
        hasCt: !!raw.contracts && Array.isArray(raw.contracts.list),
        hasPr: Array.isArray(raw.presets) && raw.presets.length === 3,
        prName: raw.presets[1] ? raw.presets[1].name : null
      });
    })()`));
    T('存档写入 contracts 字段', rt.hasCt);
    T('存档写入 3 个 presets 槽', rt.hasPr && rt.prName === '预设 2');

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  测试崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
