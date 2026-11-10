/* 打开过的容器可再打开 + 存放：空箱再开 / 拖放存入 / 容量 / own 不计缴获 / 取回带内容 */
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
    // ── 准备：一局进行中，身上一套装备 ──
    w.eval(`
      G.scene = 'playing';
      G.lootPanel = null;
      G.pickups = [];
      var pkKey = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});
      SAVE.worn.rig = 'gir'; SAVE.worn.pack = pkKey;
      P.rig = emptyCells(GEAR.gir.cap); P.pack = emptyCells(GEAR[pkKey].cap); P.pocket = emptyCells(5);
      P.slots = { primary: null, secondary: null, pistol: null };
      P.owned = {}; P.ammo = {}; P.gunLoot = {}; P.gearLoot = {};
      var CR = Object.keys(CONTAINERS)[0];                       // 补给箱
      var emptyCrate = { kind: CR, x: 500, y: 500, phase: 0, opened: true, items: [{ kind: 'med', med: 'inject_s', n: 1, taken: true, blocked: '' }] };
      var freshCrate = { kind: CR, x: 900, y: 900, phase: 0 };
      G.crates = [emptyCrate, freshCrate];
      P.x = 500; P.y = 500;
    `);

    // ── 1. 搜空的箱子仍然是交互目标 ──
    w.eval('updateSearch(0.016)');
    T('搜空的箱子仍是 searchTarget', w.eval('G.searchTarget === G.crates[0]') === true);

    // ── 2. 空箱可以再打开（储物模式） ──
    const r2 = w.eval(`
      (function(){
        var ok = startLoot(G.crates[0]);
        var L = G.lootPanel;
        return JSON.stringify({ ok: ok, store: !!(L && L.store), items: L ? L.items.length : -1 });
      })()`);
    const j2 = JSON.parse(r2);
    T('startLoot(空箱) 成功打开', j2.ok === true);
    T('面板标记 store（储物箱）', j2.store === true);
    T('空箱面板无遗留件', j2.items === 0);
    w.eval('updateLootPanel(0.01)');             // 游戏内由主循环每帧调；测试里手动刷一帧
    const r2b = w.eval(`
      (function(){
        var box = document.getElementById('lootBox');
        var cells = box.querySelectorAll('.lo-cell');
        var places = 0; cells.forEach(function(c){ if (typeof c.__pkPlace === 'function') places++; });
        return JSON.stringify({ cells: cells.length, places: places });
      })()`);
    const j2b = JSON.parse(r2b);
    T('空箱右栏画了空格', j2b.cells === 15);
    T('空箱格子是存放落点', j2b.places === 15);

    // ── 3. 拖放存入：医疗包存进箱子 ──
    const r3 = w.eval(`
      (function(){
        var held = { t: 'med', id: 'inject_s', left: 8 };
        PK_UI.held = held; PK_UI.fromLoot = null;
        lootDepositPlace();
        var c = G.lootPanel.crate, L = G.lootPanel;
        var it = L.items[0];
        return JSON.stringify({
          crateN: c.items.length, panelN: L.items.length,
          own: it && it.own, ready: it && it.ready, seen: it && it.seen,
          cellBack: it && it.__cell === held,
          heldClear: !PK_UI.held,
          name: it && it.name
        });
      })()`);
    const j3 = JSON.parse(r3);
    T('存入：箱里 +1（原有 1 件已拿 + 存入 1）', j3.crateN === 2);
    T('存入：面板行 +1', j3.panelN === 1);
    T('存入标记 own（不算缴获）', j3.own === true);
    T('存入即翻出（ready=0 seen）', j3.ready === 0 && j3.seen === true);
    T('原格子对象跟进去（__cell）', j3.cellBack === true);
    T('存完手就空了', j3.heldClear === true);
    T('存入的名字对（医疗包）', /绷带|医疗|注射/.test(j3.name || ''));

    // ── 4. 存入的装备带着内容取回：换穿 + 里面的东西并入 ──
    const rigKey = w.eval('Object.keys(GEAR).find(function(k){return GEAR[k].kind==="rig" && k!=="gir";})');
    const r4 = w.eval(`
      (function(){
        var med = { t: 'med', id: 'inject_s', left: 5 };
        var held = { t: 'gear', key: '${rigKey}', cells: [med] };
        PK_UI.held = held; PK_UI.fromLoot = null;
        lootDepositPlace();
        var it = G.lootPanel.items[G.lootPanel.items.length - 1];
        var beforeLoot = P.gearLoot['${rigKey}'] | 0;
        var ok = applyLootItem(it, G.lootPanel.crate);            // 取回：真实链路
        return JSON.stringify({
          ok: ok, worn: SAVE.worn.rig,
          loot: P.gearLoot['${rigKey}'] | 0, beforeLoot: beforeLoot,
          medInRig: P.rig.some(function(c){ return c && c.t === 'med'; }),
          heldClear: !PK_UI.held
        });
      })()`);
    const j4 = JSON.parse(r4);
    T('存的弹挂取回 = 换穿上身', j4.ok === true && j4.worn === rigKey);
    T('取回自己的装备不计 gearLoot', j4.loot === j4.beforeLoot);
    T('里面的东西跟着取回（并入身上）',
      w.eval('P.rig.concat(P.pack, P.pocket).some(function(c){ return c && c.t === "med"; })') === true);

    // ── 5. 存入自己的枪取回：不计缴获、不白送弹药 ──
    const gunId = w.eval('Object.keys(WEAPONS)[0]');
    const r5 = w.eval(`
      (function(){
        var cal = calOfWeapon('${gunId}');
        var sumReserve = function(){ var n = 0; for (var arr of allCarryZones()) for (var c of arr) if (c && c.t === 'ammo' && c.cal === cal) n += c.n | 0; return n; };
        var before = sumReserve();
        PK_UI.held = { t: 'gun', id: '${gunId}' }; PK_UI.fromLoot = null;
        lootDepositPlace();
        var it = G.lootPanel.items[G.lootPanel.items.length - 1];
        var ok = applyLootItem(it, G.lootPanel.crate);
        return JSON.stringify({ ok: ok, gunLoot: P.gunLoot['${gunId}'] | 0, reserved: sumReserve() - before, owned: !!P.owned['${gunId}'] });
      })()`);
    const j5 = JSON.parse(r5);
    T('自己的枪取回成功', j5.ok === true);
    T('取回自己的枪不计 gunLoot', j5.gunLoot === 0);
    T('自己的枪取回不白送两弹匣', j5.reserved === 0);
    T('枪所有权登记（owned）', j5.owned === true);

    // ── 6. 对照组：真正的缴获枪照旧记账 + 送弹 ──
    const gunId2 = w.eval('Object.keys(WEAPONS)[1] || Object.keys(WEAPONS)[0]');
    const r6 = w.eval(`
      (function(){
        var cal = calOfWeapon('${gunId2}');
        var sumReserve = function(){ var n = 0; for (var arr of allCarryZones()) for (var c of arr) if (c && c.t === 'ammo' && c.cal === cal) n += c.n | 0; return n; };
        var before = sumReserve();
        var it = { kind: 'weapon', weapon: '${gunId2}', name: '缴获枪', tier: 'rare', at: 0, ready: 0 };
        var ok = applyLootItem(it, G.lootPanel.crate);
        return JSON.stringify({ ok: ok, gunLoot: P.gunLoot['${gunId2}'] | 0, reserved: sumReserve() - before });
      })()`);
    const j6 = JSON.parse(r6);
    T('缴获枪照旧 gunLoot +1', j6.ok === true && j6.gunLoot === 1);
    T('缴获枪照旧自带两弹匣', j6.reserved > 0);

    // ── 7. 容量：塞满后拒绝存入，东西还在手上 ──
    const r7 = w.eval(`
      (function(){
        var L = G.lootPanel;
        var fits0 = lootBoxFits({ t: 'mod', id: Object.keys(MODS)[0] });
        var gshape = shapeOf({ t: 'gun', id: '${gunId}' }, LOOT_BOX_COLS);
        var n = 0;
        while (n < 24 && lootBoxFits({ t: 'gun', id: '${gunId}' })) {   // 用枪铺满 5×8
          L.items.push({ kind: 'weapon', weapon: '${gunId}', name: '枪', taken: false, seen: true, at: 0, ready: 0, __cell: { t: 'gun', id: '${gunId}' } });
          n++;
        }
        var held = { t: 'gun', id: '${gunId}' };        // 再塞一把同尺寸的枪：应该拒收
        PK_UI.held = held;
        var crateN = L.crate.items.length;
        lootDepositPlace();
        return JSON.stringify({ fits0: fits0, gshape: gshape, pushed: n, full: !lootBoxFits({ t: 'gun', id: '${gunId}' }),
          rejected: !!PK_UI.held, crateN: L.crate.items.length, wasCrateN: crateN });
      })()`);
    const j7 = JSON.parse(r7);
    T('空箱时容量检查通过', j7.fits0 === true);
    T('铺满判定生效（放不下）', j7.full === true);
    T('满箱拒收：东西留在手上', j7.rejected === true);
    T('满箱拒收：箱里没有多出东西', j7.crateN === j7.wasCrateN);

    // ── 8. 地面物资堆 / 搜装备面板不收存放 ──
    w.eval(`
      G.lootPanel = { items: [], t: 99, shown: 0, taken: 0, closeT: 0, crate: { x: P.x, y: P.y, kind: 'cell' }, total: 0,
        col: { name: '地面物资', en: 'PILE', color: '#8ef2ff', dim: 'rgba(142,242,255,' }, again: true, sel: 0, pile: true };
      document.getElementById('loot').classList.remove('hidden'); lootRender();`);
    const j8 = JSON.parse(w.eval(`
      (function(){
        var cells = document.getElementById('lootBox').querySelectorAll('.lo-cell');
        var places = 0; cells.forEach(function(c){ if (typeof c.__pkPlace === 'function') places++; });
        return JSON.stringify({ cells: cells.length, places: places });
      })()`));
    T('地面物资堆不是存放落点', j8.cells > 0 && j8.places === 0);

    // ── 9. 存过东西的箱子不自动收面板 ──
    w.eval(`
      G.lootPanel = { items: [{ taken: true, at: 0, ready: 0, seen: true, tier: 'supply' }], t: 0, shown: 1, taken: 1, closeT: 0,
        crate: { x: P.x, y: P.y, kind: Object.keys(CONTAINERS)[0] }, total: 0,
        col: CONTAINERS[Object.keys(CONTAINERS)[0]], again: true, sel: 0, deposited: true };
      document.getElementById('loot').classList.remove('hidden'); lootRender();`);
    w.eval('updateLootPanel(0.4); updateLootPanel(0.4)');
    T('存过东西：全拿光也不自动关', w.eval('!!G.lootPanel') === true);
    w.eval('G.lootPanel.deposited = false; G.lootPanel.closeT = 0; updateLootPanel(0.4); updateLootPanel(0.4)');
    T('没存过东西：全拿光自动收', w.eval('G.lootPanel') === null);

    // ── 10. cellToLootItem 支持 gear（搜装备也能翻出嵌套装备） ──
    const j10 = JSON.parse(w.eval(`
      (function(){
        var c = { t: 'gear', key: '${rigKey}', cells: [] };
        var it = cellToLootItem(c);
        return JSON.stringify({ kind: it && it.kind, gear: it && it.gear, name: it && it.name, hasCell: !!(it && it.__cell === c) });
      })()`));
    T('cellToLootItem 识别 gear', j10.kind === 'gear' && j10.gear === rigKey && !!j10.name && j10.hasCell);

    // ── 11. 新箱子首开行为没变（有货 → 正常搜刮面板） ──
    w.eval('G.lootPanel = null; P.x = 900; P.y = 900;');
    const r11 = w.eval(`
      (function(){
        var ok = startLoot(G.crates[1]);
        var L = G.lootPanel;
        return JSON.stringify({ ok: ok, store: !!(L && L.store), items: L ? L.items.length : -1, opened: G.crates[1].opened });
      })()`);
    const j11 = JSON.parse(r11);
    T('新箱子首开照常搜刮（非储物）', j11.ok === true && j11.store === false && j11.items > 0 && j11.opened === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
