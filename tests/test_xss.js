/* 外部文本注入回归：导入地图 JSON 的名称字段绝不能变成可执行 HTML。
   历史问题：normalizeMap 只做 trim/slice(0,24)，地图名直接拼进 innerHTML，
   导入 `<svg onload=alert(1)>` 就会在浏览器里执行。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { inlineScripts } = require('./loader');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const editorHtml = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const mapData = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'zero-dam.json'), 'utf8'));

let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

const noop = function () {};
const fakeCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 800, height: 600 };
    if (k === 'createImageData' || k === 'getImageData')
      return (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray((a || 1) * (b || 1) * 4) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern')
      return () => ({ addColorStop: noop });
    return noop;
  }, set() { return true; }
});
const mk = src => new JSDOM(inlineScripts(src), {
  runScripts: 'dangerously', pretendToBeVisual: false, url: 'http://localhost/',
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
    w.requestAnimationFrame = () => 0;      // 不启动主循环
    w.confirm = () => false;
  }
});

/* ── 游戏本体 ── */
const dom = mk(html);
const w = dom.window;
const ev = s => w.eval('esc(' + JSON.stringify(s) + ')');
T('游戏定义了 esc()', w.eval('typeof esc === "function"'));
T('esc 转义 & < >', ev('a&<b>') === 'a&amp;&lt;b&gt;');
T('esc 转义双引号 / 单引号', ev('"\'') === '&quot;&#39;');
T('esc 处理 null / undefined', ev(null) === '' && w.eval('esc(undefined)') === '');

const evil = JSON.parse(JSON.stringify(mapData));
evil.name = '<svg onload=alert(1)>';
evil.extracts[0].name = '<img id=auditxss src=x onerror=alert(2)>';
const res = w.eval('importMapText(' + JSON.stringify(JSON.stringify(evil)) + ', "evil.json")');
T('带标签的地图名仍能正常载入（转义而非拒绝）', !!res.ok);

const note = w.document.getElementById('mapselNote');
const rows = w.document.getElementById('mapRows');
const cards = Array.from(w.document.querySelectorAll('.mcard'));
const noteHtml = note ? note.innerHTML : '';
const rowsHtml = rows ? rows.innerHTML : '';
T('地图选择说明不含未转义标签', noteHtml.indexOf('<svg') < 0 && noteHtml.includes('&lt;svg'));
T('地图信息表不含未转义标签', rowsHtml.indexOf('<svg') < 0 && rowsHtml.includes('&lt;svg'));
T('地图卡片不含未转义标签', cards.length > 0 && cards.every(c => c.innerHTML.indexOf('<svg') < 0));
T('注入的 img 节点未进入 DOM', !w.document.getElementById('auditxss'));
T('转义后原文仍可读', !!note && note.textContent.includes('<svg onload=alert(1)>'));
dom.window.close();

/* ── 地图编辑器 ── */
const ed = mk(editorHtml);
const ew = ed.window;
T('编辑器定义了 esc()', ew.eval('typeof esc === "function"'));
ew.eval('map.extracts[0].name = "<img id=edxss src=x onerror=alert(3)>"; sel = {kind:"extract", i:0}; syncSel();');
const info = ew.document.getElementById('selInfo');
const infoHtml = info ? info.innerHTML : '';
T('编辑器选中面板不含未转义标签', infoHtml.indexOf('<img') < 0 && infoHtml.includes('&lt;img'));
T('编辑器注入的 img 节点未进入 DOM', !ew.document.getElementById('edxss'));
T('编辑器仍显示撤离点原名', !!info && info.textContent.includes('<img id=edxss'));
ed.window.close();

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
