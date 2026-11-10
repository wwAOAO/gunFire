/* 装备（弹挂/背包）不能装回自己里面 —— 回归测试 */
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
    const pkKey = w.eval("Object.keys(GEAR).find(function(k){return GEAR[k].kind==='pack' && GEAR[k].cap>0;})");
    const packCap = w.eval('GEAR[pk]'.replace('pk', JSON.stringify(pkKey)) + '.cap');

    // ── 1. 背包装回自己：拒绝，东西不消失 ──
    w.eval(`
      SAVE.worn.pack = ${JSON.stringify(pkKey)};
      P.pack = emptyCells(${packCap});
      PK_UI.held = { t: 'gear', key: ${JSON.stringify(pkKey)}, cells: [] };
    `);
    const r1 = w.eval(`
      (function(){
        var empty = P.pack.findIndex(function(c){return !c;});
        pkPlaceInto(P.pack, empty, 2);
        return JSON.stringify({ held: !!PK_UI.held, cell: P.pack[empty] });
      })()`);
    const j1 = JSON.parse(r1);
    T('背包装回自己 → 拒绝（手上还在）', j1.held === true);
    T('背包格子没被写进去', j1.cell === null);

    // ── 2. 弹挂装回自己：拒绝 ──
    w.eval(`
      SAVE.worn.rig = 'gir';
      P.rig = emptyCells(20);
      PK_UI.held = { t: 'gear', key: 'gir', cells: [] };
    `);
    const r2 = w.eval(`
      (function(){
        pkPlaceInto(P.rig, 0, 0);
        return JSON.stringify({ held: !!PK_UI.held, cell: P.rig[0] });
      })()`);
    const j2 = JSON.parse(r2);
    T('弹挂装回自己 → 拒绝（手上还在）', j2.held === true && j2.cell === null);

    // ── 3. 合法路径：手上的弹挂存进（另一只）背包 → 接受 ──
    w.eval(`
      SAVE.worn.pack = ${JSON.stringify(pkKey)};
      P.pack = emptyCells(${packCap});
      PK_UI.held = { t: 'gear', key: 'gir', cells: [] };
    `);
    const r3 = w.eval(`
      (function(){
        var empty = P.pack.findIndex(function(c){return !c;});
        pkPlaceInto(P.pack, empty, 2);
        return JSON.stringify({ held: !!PK_UI.held, cell: P.pack[empty] && P.pack[empty].t });
      })()`);
    const j3 = JSON.parse(r3);
    T('弹挂存进背包 → 接受', j3.held === false && j3.cell === 'gear');
    w.eval('P.pack = emptyCells(' + packCap + ');');

    // ── 4. 同款已在身上时拖回槽位 → 拒绝（不造双指针） ──
    w.eval(`
      SAVE.worn.rig = 'gir';
      P.rig = emptyCells(20);
      document.getElementById('pack').classList.remove('hidden');
      renderPackPanel();
      PK_UI.held = { t: 'gear', key: 'gir', cells: [] };
    `);
    const r4 = w.eval(`
      (function(){
        var slots = document.querySelectorAll('#pack .pk-slot');
        var rigSlot = null;
        for (var i = 0; i < slots.length; i++) {
          if (slots[i].textContent.indexOf('GIR') >= 0 || (i === 0 && slots[i].__pkPlace)) { rigSlot = slots[i]; break; }
        }
        if (!rigSlot) return JSON.stringify({ err: 'no slot' });
        rigSlot.__pkPlace();
        return JSON.stringify({ held: !!PK_UI.held, worn: SAVE.worn.rig });
      })()`);
    const j4 = JSON.parse(r4);
    T('同款拖回弹挂槽 → 拒绝（手上还在 / 穿着不变）', j4.held === true && j4.worn === 'gir');

    // ── 5. ensureCarry 坏档清洗 ──
    const r5 = w.eval(`
      (function(){
        SAVE.carry = { rig: [], pocket: [null, null, null, null, null], pack: [] };
        SAVE.carry.rig = emptyCells(20);
        SAVE.carry.rig[0] = { t: 'gear', key: 'gir', cells: [] };       // 弹挂里不该有装备格
        SAVE.carry.pack = emptyCells(GEAR[${JSON.stringify(pkKey)}].cap);
        SAVE.carry.pack[0] = { t: 'gear', key: ${JSON.stringify(pkKey)}, cells: [] };  // 背包套自己 = 坏档
        SAVE.carry.pack[4] = { t: 'gear', key: 'gir', cells: [] };      // 弹挂存进背包 = 合法
        ensureCarry();
        var packSelfGone = !SAVE.carry.pack.some(function(c){ return c && c.t === 'gear' && c.key === '" + pkKey + "'; });
        var rigInPackKept = SAVE.carry.pack.some(function(c){ return c && c.t === 'gear' && c.key === 'gir'; });
        var rigClean = !SAVE.carry.rig.some(function(c){ return c && c.t === 'gear'; });
        return JSON.stringify({ packSelfGone: packSelfGone, rigInPackKept: rigInPackKept, rigClean: rigClean });
      })()`);
    const j5 = JSON.parse(r5);
    T('坏档：背包套自己被剥掉', j5.packSelfGone === true);
    T('合法：弹挂存背包保留', j5.rigInPackKept === true);
    T('坏档：弹挂里的装备格被剥掉', j5.rigClean === true);

    // ── 6. 走完成本路径后页面无报错 ──
    w.eval('renderPackPanel(); closePackPanel();');
    T('面板开合无报错', true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
