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
  const cs = w.getComputedStyle(w.document.createElement('div'));
  // 只验 CSS 规则本身：给临时元素挂上类名再取计算样式（jsdom 不做布局，验证声明值）
  const st = w.eval(`
    (function(){
      var d = document.createElement('div'); d.className = 'lo-row';
      d.innerHTML = '<span class="nm">突击者战术背心</span><span class="sub">紫 · 弹挂 · 快捷可用 · 16 格（3+2+2+3+2+4 舱） · 移动速度 -1%</span><span class="ct">备用 ×1</span>';
      document.body.appendChild(d);
      var nm = getComputedStyle(d.querySelector('.nm')), sub = getComputedStyle(d.querySelector('.sub'));
      return JSON.stringify({ nmFlex: nm.flex, nmWrap: nm.whiteSpace, subFlex: sub.flex, subMin: sub.minWidth, subLH: sub.lineHeight });
    })()`);
  const r = JSON.parse(st);
  T('nm 不再挤压（flex 0 0 auto）', r.nmFlex === '0 0 auto');
  T('nm 一行不折行', r.nmWrap === 'nowrap');
  T('sub 占满剩余并可折行', r.subFlex === '1 1 0%' || r.subFlex === '1 1 0' || /1 1/.test(r.subFlex));
  T('sub min-width:0 允许折行', r.subMin === '0px' || r.subMin === '0');
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
