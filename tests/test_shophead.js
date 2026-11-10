/* 军火库头部（已按要求去掉吸顶）+ 子类目条真正隐藏（.hidden 规则修复） */
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
    const vis = () => JSON.parse(w.eval(`
      (function(){
        var bar = document.getElementById('shopSubTabs');
        var cs = getComputedStyle(bar);
        return JSON.stringify({ hiddenCls: bar.classList.contains('hidden'),
          display: cs.display, labels: [...bar.children].map(function(b){ return b.textContent; }) });
      })()`));

    // ── 1. 头部结构（跟随滚动，不吸顶） ──
    const head = JSON.parse(w.eval(`
      (function(){
        var h = document.getElementById('shopHead');
        var cs = getComputedStyle(h);
        return JSON.stringify({ exists: !!h, pos: cs.position,
          hasTopbar: !!h.querySelector('.topbar'), hasTabs: !!h.querySelector('#shopTabs'),
          hasSub: !!h.querySelector('#shopSubTabs'),
          gridOutside: h.nextElementSibling === document.getElementById('shopGrid') });
      })()`));
    T('#shopHead 存在且包住 topbar/主类目/子类目', head.exists && head.hasTopbar && head.hasTabs && head.hasSub);
    T('#shopHead 不再吸顶（' + head.pos + '）', head.pos !== 'sticky' && head.pos !== 'fixed');
    T('商品列表在头部外面（正常滚动）', head.gridOutside === true);

    // ── 2. 武器：子类目显示 ──
    w.eval(`openShop('weapon')`);
    let v = vis();
    T('武器：子类目可见', v.hiddenCls === false && v.display !== 'none' && v.labels.length === 8);

    // ── 3. 近战（无子类目）：hidden 类 + 真正 display:none ──
    w.eval(`document.querySelector('#shopTabs [data-tab=melee]').click()`);
    v = vis();
    T('近战：hidden 类生效（display none，' + v.display + '）', v.hiddenCls === true && v.display === 'none');

    w.eval(`document.querySelector('#shopTabs [data-tab=armor]').click()`);
    v = vis();
    T('护甲：同样隐藏', v.hiddenCls === true && v.display === 'none');
    w.eval(`document.querySelector('#shopTabs [data-tab=rig]').click()`);
    v = vis();
    T('弹挂：同样隐藏', v.hiddenCls === true && v.display === 'none');
    w.eval(`document.querySelector('#shopTabs [data-tab=pack]').click()`);
    v = vis();
    T('背包：同样隐藏', v.hiddenCls === true && v.display === 'none');

    // ── 4. 弹药 / 补给：各自子类目 ──
    w.eval(`document.querySelector('#shopTabs [data-tab=ammo]').click()`);
    v = vis();
    T('弹药：子类目 = 全部 + 8 弹级', v.hiddenCls === false && v.display !== 'none' && v.labels.length === 9);
    w.eval(`document.querySelector('#shopTabs [data-tab=supply]').click()`);
    v = vis();
    T('补给：子类目 = 全部/手术/治疗/止疼/甲修', v.hiddenCls === false &&
      v.labels.join(',') === '全 部,手 术,治 疗,止 疼,甲 修');

    // ── 5. 标题和余额在头部块里 ──
    const hdr = JSON.parse(w.eval(`
      (function(){
        var h = document.getElementById('shopHead');
        return JSON.stringify({
          logo: h.querySelector('.logo').textContent,
          credit: h.querySelector('#shopCredit') !== null,
          back: h.querySelector('#closeShop') !== null,
          bg: getComputedStyle(h).backgroundImage.indexOf('gradient') >= 0 });
      })()`));
    T('标题「军火库」+ 余额 + 返回按钮都在头部块里', hdr.logo === '军火库' && hdr.credit && hdr.back);
    T('头部不再有遮挡用的渐变底（' + hdr.bg + '）', hdr.bg === false);

    w.eval(`closeShop()`);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
