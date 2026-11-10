/* ═══════════════════════════════════════════════════════════
   统一测试加载器
   ─────────────────────────────────────────────────────────
   index.html 通过 <script src> 引用 maps/builtin-maps.js 与
   js/*.js。jsdom 的外部脚本加载是异步的，而全部用例都是
   同步取值，所以在交给 JSDOM 之前，按引用顺序把外部脚本
   内联回 HTML —— 与浏览器的执行顺序、同步语义完全一致。

   用法：
     const { loadDom, inlineScripts } = require('./loader');
     const dom = loadDom(html);                    // 常规用例
     const dom = loadDom(html, { virtualConsole }); // 自定义选项
     new JSDOM(inlineScripts(html), { ... })        // 需要 beforeParse 等
   ═══════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/** 把 HTML 里的 <script src="..."></script> 按原位替换为内联脚本 */
function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const p = path.join(ROOT, src);
    if (!fs.existsSync(p)) throw new Error('loader: 外部脚本不存在 ' + src);
    return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>';
  });
}

/** 常规加载：同步执行全部脚本（含内联后的外部模块） */
function loadDom(html, extra) {
  return new JSDOM(inlineScripts(html), Object.assign({
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  }, extra || {}));
}

/** index.html 源文本 + 全部外部模块源码：供"源码正则断言"扫描。
    拆分后游戏逻辑不在 index.html 里了，源码检查必须扫完整源。 */
function fullSource() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '\n' +
    ['maps/builtin-maps.js', 'js/data.js', 'js/audio.js', 'js/game.js', 'js/render.js', 'js/ui.js']
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
}

module.exports = { inlineScripts, loadDom, fullSource, ROOT };
