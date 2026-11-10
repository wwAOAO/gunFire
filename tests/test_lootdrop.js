/* 搜刮面板拖拽：首次搜刮可存放（指针拖拽全链路）/ 拖到屏幕最右丢地上 */
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

/* pointer 事件模拟：jsdom 没有 PointerEvent，MouseEvent 够用（pointerType 为 null 走鼠标分支） */
const pev = (type, x, y, target) => {
  (target || w.document).dispatchEvent(new w.MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y,
  }));
};
w.pev = pev;                                       // eval 里也要用

setTimeout(() => {
  try {
    // ── 准备：一局进行中，弹挂里放一件医疗品；容器里一把枪 + 一件收集品（首次搜刮） ──
    w.eval(`
      G.scene = 'playing';
      G.lootPanel = null; G.pickups = [];
      var pkKey = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});
      SAVE.worn.rig = 'gir'; SAVE.worn.pack = pkKey;
      P.rig = emptyCells(GEAR.gir.cap); P.pack = emptyCells(GEAR[pkKey].cap); P.pocket = emptyCells(5);
      P.slots = { primary: null, secondary: null, pistol: null };
      P.owned = {}; P.ammo = {}; P.gunLoot = {}; P.gearLoot = {};
      P.rig[0] = { t: 'med', id: 'inject_s', left: 3 };
      var gunB = Object.keys(WEAPONS)[0];
      var relId = Object.keys(RELICS).find(function(k){ return RELICS[k].price > 0; });
      var CR = Object.keys(CONTAINERS)[0];
      var boxItem = { kind: 'weapon', weapon: gunB, name: '箱枪', taken: false, seen: true, at: 0, ready: 0, blocked: '' };
      var relItem = { kind: 'relic', id: relId, name: RELICS[relId].name, taken: false, seen: true, at: 0, ready: 0, blocked: '' };
      var freshCrate = { kind: CR, x: 500, y: 500, phase: 0, items: [boxItem, relItem] };
      G.crates = [freshCrate];
      P.x = 500; P.y = 500;
      window.__T = { gunB: gunB, relId: relId, boxItem: boxItem };
    `);

    // elementFromPoint 桩：jsdom 不做布局，指哪打哪
    w.eval(`
      window.__dropEl = null;
      document.elementFromPoint = function(){ return __dropEl; };
    `);

    const open = () => w.eval(`
      startLoot(G.crates[0]);
      var L = G.lootPanel;
      L.items.forEach(function(x){ x.at = 0; x.ready = 0; });
      L.t = 999;
      $('loot').classList.remove('hidden');
      lootRender();
    `);
    const close = () => w.eval(`
      closeLootPanel();
      G.lootPanel = null;
      G.crates[0].items.length = 0;
      G.crates[0].opened = false;
    `);

    // ── 1. 首次搜刮：指针拖拽把弹挂里的医疗品拖进容器格 = 存放 ──
    open();
    const r1 = JSON.parse(w.eval(`
      (function(){
        var rigCell = [...document.querySelectorAll('#lootRig .lo-cell')].find(function(c){
          return (c.textContent || '').trim().length > 0;      // 小格只显示图标，找非空格
        });
        var boxCell = [...document.getElementById('lootBox').querySelectorAll('.lo-cell')].find(function(c){
          return c.__pkPlace === lootDepositPlace;
        });
        if (!rigCell || !boxCell) return JSON.stringify({ err: 'cells not found', rig: !!rigCell, box: !!boxCell });
        var crateN = G.crates[0].items.length;
        pev('pointerdown', 100, 100, rigCell);
        pev('pointermove', 130, 130);            // 超过 10px：开始拖
        var dragging = PK_DRAG.active;
        var dzShown = !document.getElementById('pkDropZone').classList.contains('hidden');
        __dropEl = boxCell;
        pev('pointerup', 700, 300);              // 松手在容器格上
        return JSON.stringify({
          dragging: dragging, dzShown: dzShown,
          crateN: G.crates[0].items.length, wasCrateN: crateN,
          ownMarked: G.crates[0].items.some(function(x){ return x.own; }),
          heldCleared: PK_UI.held === null,
          rigEmpty: P.rig[0] === null
        });
      })()`));
    T('拖拽启动 + 丢弃区显示', r1.dragging === true && r1.dzShown === true);
    T('首次搜刮存放成功：箱里 +1（' + r1.crateN + '）', r1.crateN === r1.wasCrateN + 1);
    T('存入件带 own 标记', r1.ownMarked === true);
    T('手上清空、弹挂原格清空', r1.heldCleared === true && r1.rigEmpty === true);
    T('拖拽收尾丢弃区隐藏', w.eval(`document.getElementById('pkDropZone').classList.contains('hidden')`) === true);

    // ── 2. 拖容器里的东西到屏幕最右 = 丢地上 ──
    const r2 = JSON.parse(w.eval(`
      (function(){
        var L = G.lootPanel;
        var it = L.items.find(function(x){ return x.kind === 'weapon'; });
        var cellEl = [...document.getElementById('lootBox').querySelectorAll('.lo-cell')].find(function(c){
          return (c.textContent || '').indexOf('箱枪') >= 0;    // 容器格显示的是物品名
        });
        var pkN = G.pickups.length;
        pev('pointerdown', 700, 300, cellEl);
        pev('pointermove', 730, 320);
        __dropEl = document.getElementById('pkDropZone');
        pev('pointermove', innerWidth - 8, 300);   // 最右丢弃区
        var dzOn = document.getElementById('pkDropZone').classList.contains('on');
        pev('pointerup', innerWidth - 8, 300);
        var pk = G.pickups[G.pickups.length - 1];
        return JSON.stringify({
          dzOn: dzOn, pkAdded: G.pickups.length === pkN + 1,
          isGun: pk && pk.cell && pk.cell.t === 'gun',
          heldCleared: PK_UI.held === null,
          heldNull: PK_UI.held === null
        });
      })()`));
    T('拖到最右丢弃区高亮', r2.dzOn === true);
    T('松手后掉落物 +1 且是那把枪', r2.pkAdded === true && r2.isGun === true);
    T('手上清空', r2.heldCleared === true);
    close();

    // ── 3. 拖身上左栏的东西到最右 = 丢地上（再开一次面板，往弹挂放一件） ──
    open();
    const r3 = JSON.parse(w.eval(`
      (function(){
        PK_UI.held = null;
        P.rig[0] = { t: 'med', id: 'inject_s', left: 2 };
        lootRender();
        var rigCell = [...document.querySelectorAll('#lootRig .lo-cell')].find(function(c){
          return (c.textContent || '').trim().length > 0;      // 小格只显示图标，找非空格
        });
        var pkN = G.pickups.length;
        pev('pointerdown', 100, 100, rigCell);
        pev('pointermove', 130, 130);
        __dropEl = document.getElementById('pkDropZone');
        pev('pointerup', innerWidth - 8, 300);
        return JSON.stringify({
          pkAdded: G.pickups.length === pkN + 1,
          heldCleared: PK_UI.held === null,
          rigEmpty: P.rig[0] === null
        });
      })()`));
    T('身上的东西拖到最右也丢地上', r3.pkAdded === true && r3.heldCleared === true && r3.rigEmpty === true);

    // ── 4. 拖到面板空处（非丢弃区非格子）= 回原位，不丢 ──
    const r4 = JSON.parse(w.eval(`
      (function(){
        PK_UI.held = null;
        P.rig[0] = { t: 'med', id: 'inject_s', left: 2 };
        lootRender();
        var rigCell = [...document.querySelectorAll('#lootRig .lo-cell')].find(function(c){
          return (c.textContent || '').trim().length > 0;      // 小格只显示图标，找非空格
        });
        var pkN = G.pickups.length;
        pev('pointerdown', 100, 100, rigCell);
        pev('pointermove', 130, 130);
        __dropEl = document.getElementById('lootName');   // 面板标题：空处
        pev('pointerup', 500, 80);
        return JSON.stringify({
          pkSame: G.pickups.length === pkN,
          backHome: P.rig[0] && P.rig[0].t === 'med',
          heldCleared: PK_UI.held === null
        });
      })()`));
    T('拖到空处回原位不丢', r4.pkSame === true && r4.backHome === true && r4.heldCleared === true);
    close();
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
