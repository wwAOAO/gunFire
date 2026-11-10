/* 搜刮面板槽位：武器/护甲/弹挂/背包槽渲染 + 箱里装备直接穿上 + 缴获台账 */
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
    // ── 1. Tab 面板回归：构建器重构没破坏原功能 ──
    w.eval('document.getElementById("pack").classList.remove("hidden"); renderPackPanel();');
    T('Tab 护甲槽渲染', w.document.querySelectorAll('#pkGuns .pk-slot').length === 4);
    T('Tab 弹挂/背包槽渲染', w.document.querySelectorAll('#pkGear .pk-slot').length === 2);
    w.eval('document.getElementById("pack").classList.add("hidden");');

    // ── 2. 搜刮面板：槽位渲染 ──
    const state = { t: 99, taken: 0, shown: 0, sel: 0, crate: { x: 0, y: 0 }, items: [] };
    w.eval('G.lootPanel = JSON.parse(' + JSON.stringify(JSON.stringify(state)) + ');'
      + 'var pkKey = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});'
      + 'SAVE.worn.rig = "gir"; SAVE.worn.pack = pkKey;'
      + 'P.rig = emptyCells(GEAR.gir.cap); P.pack = emptyCells(GEAR[pkKey].cap); P.pocket = emptyCells(5);'
      + 'document.getElementById("loot").classList.remove("hidden"); lootRender();');
    T('搜刮面板武器/护甲槽 4 个', w.document.querySelectorAll('#lootGuns .pk-slot').length === 4);
    T('搜刮面板弹挂/背包槽 2 个', w.document.querySelectorAll('#lootGear .pk-slot').length === 2);
    const rigSlot = w.document.querySelector('#lootGear .pk-slot');
    T('弹挂槽显示 GIR', rigSlot.textContent.includes('GIR'));
    T('槽位是合法拖放落点（__pkPlace）', typeof rigSlot.__pkPlace === 'function');

    // ── 3. 箱里的枪拖到武器槽：直接装上 ──
    const gunId = w.eval('Object.keys(WEAPONS)[0]');
    w.eval('G.lootPanel.items = [{ name: "枪", tier: "rare", kind: "weapon", weapon: "' + gunId + '", at: 0, ready: 0, taken: false, seen: true }]; lootRender();');
    const r3 = w.eval(`
      (function(){
        var it = G.lootPanel.items[0];
        var rv = lootBoxPick(it);                 // 真实链路：拿起（taken=true, held, fromLoot, 回退闭包）
        PK_DRAG.revert = rv;
        var slot = document.querySelectorAll('#lootGuns .pk-slot')[1];   // 主武器槽
        slot.__pkPlace();
        return JSON.stringify({ slotGun: P.slots.primary, gunLoot: P.gunLoot[it.weapon] | 0,
          owned: !!P.owned[it.weapon], taken: it.taken, slotCount: document.querySelectorAll('#lootGuns .pk-slot').length });
      })()`);
    const j3 = JSON.parse(r3);
    T('箱里的枪装上主武器槽', j3.slotGun === gunId);
    T('缴获台账 gunLoot +1', j3.gunLoot === 1);
    T('所有权已登记（owned）', j3.owned === true);
    T('箱子件数保持已拿', j3.taken === true);
    // 回退闭包：手上没有这件了 → 不回滚（不把穿好的枪送回箱子）
    w.eval('PK_DRAG.revert && PK_DRAG.revert()');
    T('放置后回退不回滚（枪还在槽上）', w.eval('P.slots.primary') === gunId);
    T('槽位刷新后仍显示枪', w.document.querySelector('#lootGuns .pk-slot:nth-child(2)').textContent.length > 0);

    // ── 4. 拖放失败（手上还是这件）→ 原样回箱 ──
    const r4 = w.eval(`
      (function(){
        var it = G.lootPanel.items[0];
        it.taken = false; G.lootPanel.taken = 0;  // 重置：第 3 节拿走过这件
        var rv = lootBoxPick(it);                 // 拿起
        rv();                                     // 松手没放出去
        return JSON.stringify({ taken: it.taken, held: !!PK_UI.held });
      })()`);
    const j4 = JSON.parse(r4);
    T('拖放失败回箱（taken 撤销）', j4.taken === false && j4.held === false);

    // ── 5. 箱里的弹挂拖到弹挂槽：直接换穿 + 台账 ──
    const rigKey = w.eval('Object.keys(GEAR).find(function(k){return GEAR[k].kind==="rig" && k!=="gir";})');
    w.eval('G.lootPanel.items.push({ name: "弹挂", tier: "rare", kind: "gear", gear: "' + rigKey + '", at: 0, ready: 0, taken: false, seen: true }); lootRender();');
    const r5 = w.eval(`
      (function(){
        var it = G.lootPanel.items[1];
        it.taken = true; G.lootPanel.taken++;
        PK_UI.held = { t: 'gear', key: it.gear, cells: [] };
        PK_UI.fromLoot = it;
        var slot = document.querySelector('#lootGear .pk-slot');    // 弹挂槽
        slot.__pkPlace();
        return JSON.stringify({ worn: SAVE.worn.rig, loot: P.gearLoot[it.gear] | 0, held: !!PK_UI.held, oldDropped: G.pickups.length });
      })()`);
    const j5 = JSON.parse(r5);
    T('箱里的弹挂拖上直接换穿', j5.worn === rigKey);
    T('换穿记缴获台账 gearLoot +1', j5.loot === 1);
    T('旧弹挂连内容掉脚边（不吞装备）', j5.oldDropped >= 1);

    // ── 6. 自己的备用弹挂：拒绝消耗 ──
    const r6 = w.eval(`
      (function(){
        SAVE.worn.rig = 'gir';
        PK_UI.held = { t: 'gear', key: 'gir', cells: [] };
        PK_UI.fromLoot = null;
        var before = P.gearLoot.gir | 0;
        document.querySelector('#lootGear .pk-slot').__pkPlace();
        return JSON.stringify({ held: !!PK_UI.held, loot: P.gearLoot.gir | 0, before: before });
      })()`);
    const j6 = JSON.parse(r6);
    T('备用弹挂不被换穿消耗（还在手上）', j6.held === true);
    T('备用件没有误记账', j6.loot === j6.before);

    // ── 7. 整件装备可拖：lootItemCell 支持 gear ──
    T('lootItemCell 支持 gear（整件可拖）',
      w.eval('(function(){ var c = lootItemCell({ kind: "gear", gear: "gir" }); return c && c.t === "gear" && c.key === "gir"; })()') === true);

    // ── 8. 面板开合无报错 ──
    w.eval('lootRender(); closeLootPanel(); renderPackPanel();');
    T('面板开合与刷新无报错', true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
