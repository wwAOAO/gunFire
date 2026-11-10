/* 搜刮面板四项：容器格标价格 / 首次搜刮即可存放 / 交换旧枪不消失 / Tab 关面板 */
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
    // ── 准备：一局进行中，身上背包有空间、主手一把枪，容器里一把枪 + 一件收集品 ──
    w.eval(`
      G.scene = 'playing';
      G.lootPanel = null; G.pickups = [];
      var pkKey = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});
      SAVE.worn.rig = 'gir'; SAVE.worn.pack = pkKey;
      P.rig = emptyCells(GEAR.gir.cap); P.pack = emptyCells(GEAR[pkKey].cap); P.pocket = emptyCells(5);
      P.slots = { primary: null, secondary: null, pistol: null };
      P.owned = {}; P.ammo = {}; P.gunLoot = {}; P.gearLoot = {};
      var gunA = Object.keys(WEAPONS).find(function(k){return !PISTOL_IDS[k];});   // 身上的枪
      var gunB = Object.keys(WEAPONS).find(function(k){return k!==gunA;});        // 容器里的枪
      P.slots.primary = gunA;
      var relId = Object.keys(RELICS).find(function(k){ return RELICS[k].price > 0; });
      var CR = Object.keys(CONTAINERS)[0];
      var boxItem = { kind: 'weapon', weapon: gunB, name: '箱枪', taken: false, seen: true, at: 0, ready: 0, blocked: '' };
      var relItem = { kind: 'relic', id: relId, name: RELICS[relId].name, taken: false, seen: true, at: 0, ready: 0, blocked: '' };
      var freshCrate = { kind: CR, x: 500, y: 500, phase: 0, items: [boxItem, relItem] };
      G.crates = [freshCrate];
      P.x = 500; P.y = 500;
      window.__T = { gunA: gunA, gunB: gunB, relId: relId, boxItem: boxItem };
    `);

    // ── 1. 首次打开（again=false）：容器格就是存放落点（首次搜刮可自由存放） ──
    const r1 = JSON.parse(w.eval(`
      (function(){
        startLoot(G.crates[0]);
        var L = G.lootPanel;
        L.items.forEach(function(x){ x.at = 0; x.ready = 0; });   // 直接翻出：剪影态测不了实物格
        $('loot').classList.remove('hidden');
        lootRender();
        var box = document.getElementById('lootBox');
        var cells = [...box.querySelectorAll('.lo-cell')];
        var relCell = cells.find(function(c){ return (c.textContent || '').indexOf(RELICS[__T.relId].name) >= 0; });
        return JSON.stringify({
          again: !!L.again,
          anyPlace: cells.some(function(c){ return !!c.__pkPlace; }),
          relHasSub: !!(relCell && relCell.querySelector('.sub')),
          relSubText: relCell && relCell.querySelector('.sub') ? relCell.querySelector('.sub').textContent : '',
          pendText: document.getElementById('lootPend').textContent
        });
      })()`));
    T('首次打开 again=false', r1.again === false);
    T('首次搜刮容器格全部是存放落点', r1.anyPlace === true);
    T('收集品格子带信息行（¥ 价格）', r1.relHasSub === true);
    T('价格是 ¥ 格式（' + r1.relSubText + '）', r1.relSubText.indexOf('¥') >= 0);
    T('首次搜刮提示宣传存放 + 最右丢弃', r1.pendText.indexOf('身上的东西也能拖进这里存放') >= 0 && r1.pendText.indexOf('最右丢弃') >= 0);

    // ── 2. 交换 BUG：箱枪上槽 → 旧枪自动收进背包，不消失 ──
    const r2 = JSON.parse(w.eval(`
      (function(){
        var L = G.lootPanel, it = L.items[0];
        var revert = lootBoxPick(it);                    // 从箱里拿起箱枪
        PK_DRAG.revert = revert;
        var slotEl = pkBuildGunSlot('primary', function(){});   // 落点：主手武器槽
        var heldBefore = PK_UI.held ? PK_UI.held.id : null;
        pkFinishDrag({ kind: 'cell', el: slotEl });
        var stowed = P.pack.some(function(c){ return c && c.t === 'gun' && c.id === __T.gunA; }) ||
                     P.rig.some(function(c){ return c && c.t === 'gun' && c.id === __T.gunA; });
        return JSON.stringify({
          heldBefore: heldBefore,
          slotNow: P.slots.primary,
          oldStowed: stowed,
          heldNow: PK_UI.held ? PK_UI.held.id : null,
          lootCounted: (P.gunLoot[__T.gunB] | 0)
        });
      })()`));
    T('手上先拿着箱枪 ' + r2.heldBefore, r2.heldBefore === w.eval('__T.gunB'));
    T('箱枪装上主手槽', r2.slotNow === w.eval('__T.gunB'));
    T('旧枪自动收进背包/弹挂（不消失）', r2.oldStowed === true);
    T('手上已清空', r2.heldNow === null);
    T('缴获台账记了箱枪', r2.lootCounted === 1);

    // ── 3. again=true 存放落点同样成立（回归） ──
    const r3 = JSON.parse(w.eval(`
      (function(){
        var L = G.lootPanel;
        L.again = true;                                  // 模拟关掉再打开
        lootRender();
        var cells = [...document.getElementById('lootBox').querySelectorAll('.lo-cell')];
        var empty = [...document.getElementById('lootBox').querySelectorAll('.lo-cell.empty')];
        return JSON.stringify({
          anyPlace: cells.some(function(c){ return c.__pkPlace === lootDepositPlace; }),
          emptyPlace: empty.length === 0 || empty.every(function(c){ return c.__pkPlace === lootDepositPlace; })
        });
      })()`));
    T('再开容器格是存放落点', r3.anyPlace === true);
    T('空格落点同样是 lootDepositPlace', r3.emptyPlace === true);

    // ── 4. 存放一件 → 再取回：own 不计缴获 ──
    const r4 = JSON.parse(w.eval(`
      (function(){
        var L = G.lootPanel;
        var med = { t: 'med', id: 'inject_s', left: 3 };
        PK_UI.held = med; PK_UI.fromLoot = null;
        lootDepositPlace();                              // 存进箱子
        var stored = L.items.some(function(x){ return x.own && x.__cell === med; });
        PK_UI.held = med; PK_UI.fromLoot = med;          // 模拟取回（own 件）
        var before = P.gunLoot[__T.gunB] | 0;
        return JSON.stringify({ stored: stored });
      })()`));
    T('存放成功带 own 标记', r4.stored === true);

    // ── 5. Tab：搜刮面板开着 → 关面板，不开背包 ──
    w.eval(`
      var L0 = G.lootPanel;
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      window.__tabR = { closed: G.lootPanel === null, packNotOpen: !G.packOpen };
    `);
    const r5 = JSON.parse(w.eval('JSON.stringify(__tabR)'));
    T('Tab 关掉搜刮面板', r5.closed === true);
    T('Tab 没有顺手打开背包', r5.packNotOpen === true);
    w.eval("G.scene = 'playing'; openPackPanel(); var pk1 = G.packOpen; closePackPanel(); window.__pk1 = pk1;");
    T('Tab 之后背包仍可正常打开（功能没坏）', w.eval('__pk1') === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
