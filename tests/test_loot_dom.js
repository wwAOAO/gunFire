const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); };

setTimeout(() => {
  try {
    const state = {
      t: 0.5, taken: 0, shown: 0, sel: 1, crate: { x: 0, y: 0 },
      items: [
        { name: 'AKM', tier: 'rare', at: 0, hold: 1, flip: 2, ready: 10, taken: false, seen: false, qWeight: 1, __cell: { t: 'gun', id: 'akm' } },
        { name: '弹', tier: 'common', at: 0.2, hold: 0, flip: 0, ready: 0.2, taken: false, seen: true, qWeight: 1, __cell: { t: 'ammo', cal: '762', lv: 1, n: 30 } },
        { name: '绷带', tier: 'common', at: 2, hold: 1, flip: 2, ready: 5, taken: false, seen: false, qWeight: 1 },
      ],
    };
    w.eval('G.lootPanel = JSON.parse(' + JSON.stringify(JSON.stringify(state)) + ');'
      + 'var rk = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="rig" && GEAR[k].cap>0;});'
      + 'var pk2 = Object.keys(GEAR).find(function(k){return GEAR[k].kind==="pack" && GEAR[k].cap>0;});'
      + 'SAVE.worn.rig = rk; SAVE.worn.pack = pk2;'
      + 'P.pack = emptyCells(GEAR[pk2].cap); P.rig = emptyCells(GEAR[rk].cap); P.pocket = emptyCells(5);'
      + 'P.x = 0; P.y = 0;'   // 箱在脚下：不触发走开收面板
      + 'document.getElementById("loot").classList.remove("hidden"); lootRender();');
    const box = w.document.getElementById('lootBox');
    T('DOM 里有两个剪影格', box.querySelectorAll('.lo-cell.bcell.ghost').length === 2);
    T('正在翻的剪影有扫描态', box.querySelectorAll('.ghost.scan').length === 1);
    T('翻出的仍画实物格', box.querySelectorAll('.lo-cell.bcell.ready').length === 1);
    const szs = [...box.querySelectorAll('.ghost .sz')].map(x => x.textContent);
    T('剪影标尺寸 5×2 与 1×1', szs.includes('5×2') && szs.includes('1×1'));
    const g0 = box.querySelector('.ghost');
    T('剪影跨 5 列', g0 && g0.style.gridColumn.includes('span 5'));
    T('剪影不含真名（防剧透）', ![...box.querySelectorAll('.ghost')].some(g => g.textContent.includes('AKM')));
    const st = w.document.getElementById('lootStatus');
    T('状态栏「翻出 1 / 3」', st && st.textContent.includes('翻出 1 / 3'));
    const pd = w.document.getElementById('lootPend');
    T('底部提示还有 2 件', pd && pd.textContent.includes('2'));

    w.eval("document.querySelector('#lootBox .ghost').dispatchEvent(new window.PointerEvent('pointerdown', {bubbles:true}));");
    T('点剪影不抛错', true);

    // 推进 t → updateLootPanel 自己重绘（签名含 started）
    w.eval('G.lootPanel.t = 6; updateLootPanel(0.016);');
    T('t=6 剪影剩 1（updateLootPanel 自动重绘）', box.querySelectorAll('.lo-cell.bcell.ghost').length === 1);
    T('实物格 2 个', box.querySelectorAll('.lo-cell.bcell.ready').length === 2);

    // 左栏：flex + 隔舱虚线框
    for (const id of ['lootPack', 'lootRig', 'lootPocket']) {
      const el = w.document.getElementById(id);
      T(id + ' display:flex', el && w.getComputedStyle(el).display === 'flex');
      T(id + ' 有隔舱虚线框', el && el.querySelectorAll('.pk-blk').length > 0);
    }
    const bg = w.document.querySelector('#lootPocket .blk-grid');
    T('blk-grid 行高钉在 var(--bcell)（jsdom 不解析像素）', bg && w.getComputedStyle(bg).gridAutoRows === 'var(--bcell)');
    // 口袋单格舱：虚线空格全部同宽同高（对齐）
    const cells = [...bg.querySelectorAll('.lo-cell.bcell')];
    T('全部单格 height 声明=var(--bcell)（同尺寸对齐）',
      cells.length > 0 && cells.every(c => w.getComputedStyle(c).height === 'var(--bcell)' && w.getComputedStyle(c).width === 'var(--bcell)'));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
