/* 搜刮界面丢弃 + 存入容器回归测试
   修复点：
   1. #pkDropZone 从 #pack 内挪到 body 层 —— 搜刮界面打开时 #pack 是 display:none，
      藏在里面的丢弃区渲染不出来，拖到最右永远回原位（丢不掉的真因）
   2. #lootBox 挂 __pkPlace + pkDropTargetAt 侧栏兜底 —— 格缝 / 盒边松手也算存入
   3. 容器里拿出的件松手在容器侧 = 取消回箱，不误转成 own 存放品
   4. 提示文字按 canStore 条件化（地面物资 / 装备搜索不许诺存放） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { inlineScripts } = require('./loader');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(inlineScripts(html), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(window) {
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
const T = (name, cond) => { if (cond) { pass++; console.log('  ok ' + name); } else { fail++; console.log('FAIL ' + name); } };

/* 同步拿起：pointerdown + pointermove>10px 会同步走 pkDragBegin */
const pickByDrag = () => w.eval(`
  (function(){
    var cell = document.querySelector('#lootPocket .lo-cell.bcell:not(.empty)');
    if (!cell) return false;
    var r = cell.getBoundingClientRect ? null : null;
    cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 130, clientY: 105, pointerType: 'mouse' }));
    return !!PK_UI.held;
  })()
`);

setTimeout(() => {
  /* ── 1. 丢弃区结构 ── */
  const dzStruct = JSON.parse(w.eval(`JSON.stringify({
    atBody: document.getElementById('pkDropZone').parentElement === document.body,
    notInPack: !(document.getElementById('pkDropZone').closest('#pack')) })`));
  T('丢弃区挂在 body 层', dzStruct.atBody);
  T('丢弃区不在 #pack 面板内', dzStruct.notInPack);

  /* ── 2. 容器面板：存放目标 + 提示 ── */
  w.eval(`
    startRaid();
    P.x = 2200; P.y = 1500;
    for (var i = 0; i < 3; i++) update(0.016);
    var cr = G.crates[0];
    cr.x = 2200; cr.y = 1500; cr.opened = false; cr.items = undefined;
    G.searchTarget = cr;
    startLoot(cr);
    for (var i = 0; i < 30; i++) update(0.016);
    G.lootPanel.items.forEach(function(it){ it.ready = 0; });   // 全部翻出：让提示走存货分支
    P.pocket.length = 0; P.pocket[0] = { t: 'relic', id: 'shell' };
    P.pack.length = 0;
    lootRender();
  `);
  const box1 = JSON.parse(w.eval(`JSON.stringify({
    cratePanel: !!(G.lootPanel && G.lootPanel.crate && !G.lootPanel.pile && !G.lootPanel.gear),
    boxPlace: typeof document.getElementById('lootBox').__pkPlace === 'function',
    hintStore: document.getElementById('lootPend').textContent.indexOf('拖进这里存放') >= 0 })`));
  T('容器面板：识别为可存放（canStore）', box1.cratePanel);
  T('容器面板：lootBox 挂了存放回调', box1.boxPlace);
  T('容器面板：提示包含「拖进这里存放」', box1.hintStore);

  /* 存入：口袋件拖起 → 松手在 lootBox（侧栏兜底目标，等价格缝松手） */
  T('口袋件能同步拿起', pickByDrag() === true);
  const dep = JSON.parse(w.eval(`(function(){
    pkFinishDrag({ kind: 'cell', el: document.getElementById('lootBox') });
    return JSON.stringify({ heldAfter: !!PK_UI.held,
      own: G.lootPanel.items.filter(function(it){ return it.own; }).length });
  })()`));
  T('缝隙/侧栏松手 = 存进容器（own 标记）', dep.own === 1 && dep.heldAfter === false);

  /* ── 3. 容器里拿出的件松手在容器侧 = 取消回箱 ── */
  const rev = JSON.parse(w.eval(`(function(){
    var it = G.lootPanel.items.find(function(x){ return !x.taken && lootItemCell(x); });
    if (!it) return '{"err":"no crate item"}';
    var rv = lootBoxPick(it);                     // 拿起返回回退闭包
    if (!PK_UI.held) return '{"err":"pick failed"}';
    PK_DRAG.revert = rv; PK_DRAG.active = true;   // 等价 pkDragBegin 挂回退（pkFinishDrag finally 依赖它）
    var before = it.taken;
    pkFinishDrag({ kind: 'cell', el: document.getElementById('lootBox') });
    return JSON.stringify({ wasTaken: before, takenAfter: it.taken, heldAfter: !!PK_UI.held,
      own: G.lootPanel.items.filter(function(x){ return x.own; }).length });
  })()`));
  T('容器件拿起时标记 taken', rev.wasTaken === true);
  T('松手在容器侧 = 取消回箱（不转 own）', rev.takenAfter === false && rev.heldAfter === false && rev.own === 1);

  /* ── 4. 丢弃：kind drop → 地上多一件 pickup ── */
  const drop = JSON.parse(w.eval(`(function(){
    P.pocket.length = 0; P.pocket[0] = { t: 'relic', id: 'd_yuancoin' };
    lootRender();
    var cell = document.querySelector('#lootPocket .lo-cell.bcell:not(.empty)');
    cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 130, clientY: 105, pointerType: 'mouse' }));
    if (!PK_UI.held) return '{"err":"pick failed"}';
    var before = G.pickups.length;
    pkFinishDrag({ kind: 'drop', el: null });
    return JSON.stringify({ heldAfter: !!PK_UI.held, added: G.pickups.length - before,
      dzHiddenAfter: document.getElementById('pkDropZone').classList.contains('hidden') });
  })()`));
  T('丢弃：手上清空 + 地上多一件实体', drop.heldAfter === false && drop.added === 1);
  T('松手后丢弃区收起（不挡面板点击）', drop.dzHiddenAfter === true);

  /* ── 5. 地面物资堆面板：不许诺存放 ── */
  w.eval(`
    closeLootPanel();
    G.pickups.push({ x: 2200, y: 1500, kind: 'cell', cell: { t: 'relic', id: 'shell' }, r: 12 });
    G.pickups.push({ x: 2210, y: 1510, kind: 'cell', cell: { t: 'relic', id: 'd_trident' }, r: 12 });
    pileSearchInteract();
    $('loot').classList.remove('hidden');           // 真实游戏里 updateLootPanel 下帧做这件事
    lootRender();
  `);
  const pile = JSON.parse(w.eval(`JSON.stringify({
    isPile: !!(G.lootPanel && G.lootPanel.pile),
    boxPlace: typeof document.getElementById('lootBox').__pkPlace === 'function',
    hintStore: document.getElementById('lootPend').textContent.indexOf('拖进这里存放') >= 0,
    hintDrop: document.getElementById('lootPend').textContent.indexOf('拖到屏幕最右丢弃') >= 0 })`));
  T('地面物资堆：识别为 pile 面板', pile.isPile);
  T('地面物资堆：不挂存放回调', pile.boxPlace === false);
  T('地面物资堆：提示不再许诺存放', pile.hintStore === false);
  T('地面物资堆：提示仍指路丢弃区', pile.hintDrop === true);

  console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 1300);
