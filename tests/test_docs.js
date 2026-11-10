/* 文档 / 元数据一致性回归：README 里的数字必须从代码数据表来，
   package.json 与 lockfile 保持同步，编辑器能产出游戏支持的全部难度。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { inlineScripts, fullSource } = require('./loader');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const src = fullSource();   // index.html + 全部 js 模块源码（源码正则断言用）
const edHtml = read('editor.html');
const readme = read('README.md');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

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
    w.requestAnimationFrame = () => 0;
    w.confirm = () => false;
  }
});

const dom = mk(html);
const w = dom.window;
const val = expr => w.eval(expr);

T('README 干员数 = OPERATORS', readme.includes('共 **7 名干员**') && val('Object.keys(OPERATORS).length') === 7);
T('README 成就数 = ACHIEVEMENTS', readme.includes('「成就」50 条') && val('ACHIEVEMENTS.length') === 50);
T('README live 指标数一致', readme.includes('其中 25 条带 `live` 指标') && val('ACHIEVEMENTS.filter(a => a.live).length') === 25);
T('README 配件数 = MODS', readme.includes('共 84 件配件') && val('Object.keys(MODS).length') === 84);
T('README 收集品数 = RELICS', readme.includes('收集品 315 件') && val('Object.keys(RELICS).length') === 315);
T('README 具名护甲数 = ARMORS - 占位', readme.includes('17 件具名甲') && val('ARMORS.length') - 1 === 17);
T('README 口袋格数 = POCKET_BLOCKS', readme.includes('永远 5 格') && /\| 口袋 \| 5（固定） \|/.test(readme) && val('POCKET_BLOCKS.length') === 5);
T('README 不再有旧数字', !/成就.{0,4}12 条|194 件|共 21 件配件|永远 4 格/.test(readme));
T('README 重置存档位置已更新', readme.includes('设置面板的「存档备份」卡片') && !readme.includes('大厅右下角有'));
T('README 项目结构含 tests/ 与 tools/', readme.includes('├── tests/') && readme.includes('├── tools/'));
T('README 工具路径已更新', readme.includes('tools/gen_zero_dam.js') && !readme.includes('.workbuddy/gen_zero_dam.js'));
T('README 声明运行时零依赖', readme.includes('运行时零依赖'));
T('README 记录 npm test 用法', readme.includes('npm test --'));
T('README 难度档位覆盖 top', readme.includes('普通 / 机密 / 绝密') && readme.includes('standard / secret / top'));
dom.window.close();

/* 编辑器：切到绝密后导出的 JSON 必须仍然带 tier=top */
const ed = mk(edHtml);
const ew = ed.window;
const sel = ew.document.getElementById('inTier');
T('编辑器提供绝密选项', !!sel && Array.from(sel.options).some(o => o.value === 'top'));
sel.value = 'top';
sel.dispatchEvent(new ew.Event('change'));
T('编辑器切换绝密生效', ew.eval('map.tier') === 'top');
T('编辑器导出保留 tier=top', ew.eval('payload().tier') === 'top');
T('编辑器导入保留 tier=top', edHtml.includes("raw.tier === 'top' ? 'top'"));
T('游戏 normalizeMap 支持 top', /tier: raw\.tier === 'top' \? 'top'/.test(src));
ed.window.close();

/* 元数据 */
T('package.json 去掉失效的 main', !('main' in pkg));
T('package.json 标记 private', pkg.private === true);
T('license 与 README 一致（UNLICENSED）', pkg.license === 'UNLICENSED' && readme.includes('`UNLICENSED`'));
T('lockfile 同步 license / devDependencies',
  lock.packages[''].license === 'UNLICENSED' && !!lock.packages[''].devDependencies && !lock.packages[''].dependencies);
T('依赖只放在 devDependencies', !pkg.dependencies && !!pkg.devDependencies);
T('npm test 已接入执行器', pkg.scripts.test === 'node tests/run.js');
T('tests/ 与 tools/ 资产已入库', fs.existsSync(path.join(root, 'tests', 'run.js')) && fs.existsSync(path.join(root, 'tools', 'gen_zero_dam.js')));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
