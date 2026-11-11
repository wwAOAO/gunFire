/* 静态体检（npm run verify）：模块语法、加载顺序、行尾、超长行、
   地图构建注入同步、路径与版本控制边界。
   单文件时代靠这段守住"不悄悄退化"；模块化后守卫面变大：
   file:// 双击即玩依赖经典 <script src> 按序加载 + 地图构建注入。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
const readRaw = f => fs.readFileSync(path.join(root, f));
const read = f => readRaw(f).toString('utf8');
const html = read('index.html');
const edHtml = read('editor.html');
const MODULE_ORDER = ['maps/builtin-maps.js', 'js/data.js', 'js/audio.js', 'js/game.js', 'js/art.js', 'js/render.js', 'js/ui.js'];

let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

/* 1. 语法：只编译、不执行 */
for (const f of MODULE_ORDER) {
  let ok = false, err = '';
  try { new vm.Script(read(f), { filename: f }); ok = true; } catch (e) { err = e.message; }
  T(f + ' 语法通过' + (err ? '（' + err + '）' : ''), ok);
}
{
  const m = edHtml.match(/<script>([\s\S]*?)<\/script>/);
  let ok = false, err = '';
  try { new vm.Script(m[1], { filename: 'editor.html' }); ok = true; } catch (e) { err = e.message; }
  T('editor.html 内联脚本语法通过' + (err ? '（' + err + '）' : ''), ok);
}

/* 2. index.html 的模块引用：顺序正确、无遗留内联游戏脚本 */
{
  const got = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  T('index.html 按序引用全部 ' + (MODULE_ORDER.length - 1) + ' 个模块', JSON.stringify(got) === JSON.stringify(MODULE_ORDER));
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  T('index.html 无内联游戏脚本残留', inline.length === 0);
  T('index.html 不再内嵌地图数据', !html.includes('const BUILTIN_MAPS') && !html.includes('buildSpaceBase'));
}

/* 3. 可读性 / 行尾一致性（生成物 builtin-maps.js 除外） */
const txtFiles = ['index.html', 'editor.html', 'README.md', ...MODULE_ORDER.slice(1), 'tools/build-maps.js'];
for (const f of txtFiles) {
  const src = read(f);
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const max = Math.max(...lines.map(l => l.length));
  T(f + ' 无超过 2000 字符的行（最长 ' + max + '）', max <= 2000);
}
const crlf = b => (b.match(/\r\n/g) || []).length;
const lf = b => (b.match(/\n/g) || []).length;
T('index.html 行尾统一 CRLF', crlf(html) > 0 && crlf(html) === lf(html));
T('README.md 行尾统一 CRLF', crlf(read('README.md')) === lf(read('README.md')));
T('editor.html 行尾统一 LF', crlf(edHtml) === 0 && lf(edHtml) > 0);
const mixedEol = MODULE_ORDER.slice(1).filter(f => { const b = read(f); return !(crlf(b) === 0 || crlf(b) === lf(b)); });
T('js/ 模块行尾各自统一（不混用）', mixedEol.length === 0);

/* 4. 没有动态执行与硬编码本机路径 */
T('页面与模块均无 eval / new Function',
  !/\beval\s*\(|new Function\s*\(/.test(html + edHtml + MODULE_ORDER.slice(1).map(read).join('')));
const jsFiles = ['tests', 'tools', 'js'].flatMap(d =>
  fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.js')).map(f => path.join(root, d, f)));
const absRefs = jsFiles.filter(f => /D:\/work\/node\/war|D:\\work\\node\\war/.test(read(path.relative(root, f))));
T('tests/ tools/ js/ 无硬编码本机绝对路径（共 ' + jsFiles.length + ' 个脚本）', absRefs.length === 0);
T('.gitignore 不忽略 tests/ tools/ js/ 或 maps/*.json',
  !/^\/?(tests|tools|js)\//m.test(read('.gitignore')) && !/\*\.json/m.test(read('.gitignore')));

/* 5. 内置地图：构建注入与 maps/*.json 同步、运行时加载一致 */
const noop = function () {};
const fakeCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 800, height: 600 };
    if (k === 'createImageData' || k === 'getImageData') return (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray((a || 1) * (b || 1) * 4) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
    return noop;
  }, set() { return true; }
});
const dom = new JSDOM(html.replace(/<script src="([^"]+)"><\/script>/g,
    (m, src) => '<script>\n' + read(src) + '\n</script>'), {
  runScripts: 'dangerously', pretendToBeVisual: false, url: 'http://localhost/', virtualConsole: new VirtualConsole(),
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => fakeCtx; w.requestAnimationFrame = () => 0; }
});
const maps = JSON.parse(dom.window.eval('JSON.stringify(BUILTIN_MAPS)'));
T('内置地图恰好 4 张', Object.keys(maps).length === 4);
T('地图键序 = 默认部署顺序（zero-dam 在前）', Object.keys(maps)[0] === 'zero-dam');
const MAP_IDS = ['zero-dam', 'zero-dam-secret', 'space-base', 'space-base-top'];
T('地图 ID 与 maps/*.json 一一对应',
  JSON.stringify(Object.keys(maps)) === JSON.stringify(MAP_IDS) &&
  fs.readdirSync(path.join(root, 'maps')).filter(f => f.endsWith('.json')).length === MAP_IDS.length);
for (const [id, m] of Object.entries(maps)) {
  T('地图 ' + id + ' 字段与实体完整',
    m.format === 'neonpurge-map' && m.version === 1 && typeof m.name === 'string' &&
    m.w > 0 && m.h > 0 && Array.isArray(m.spawns) && m.spawns.length > 0 &&
    Array.isArray(m.obstacles) && m.obstacles.length > 0 &&
    Array.isArray(m.extracts) && m.extracts.length > 0 &&
    Array.isArray(m.units) && m.units.length > 0);
}
T('builtin-maps.js 与 maps/*.json 同步（改 JSON 后需 npm run build:maps）',
  JSON.stringify(maps) === JSON.stringify(MAP_IDS.map(id => JSON.parse(read('maps/' + id + '.json')))
    .reduce((o, m, i) => (o[MAP_IDS[i]] = m, o), {})));
T('机密 / 绝密档位标记齐全',
  maps['zero-dam-secret'].tier === 'secret' && maps['space-base'].tier === 'secret' && maps['space-base-top'].tier === 'top');
dom.window.close();

/* 6. 命令入口 */
const pkg = JSON.parse(read('package.json'));
T('npm test 与 npm run verify 均已配置',
  pkg.scripts.test === 'node tests/run.js' && /tests\/run\.js static|node tests\/test_static\.js/.test(pkg.scripts.verify || ''));
T('npm run build:maps 已配置', pkg.scripts['build:maps'] === 'node tools/build-maps.js');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
