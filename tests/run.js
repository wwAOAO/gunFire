/* 回归测试总入口：npm test
   逐个执行 tests/test_*.js（每个脚本自带断言与退出码），汇总结果与失败输出。
   运行目录恒为项目根，脚本内一律用 __dirname 定位文件，不依赖当前工作目录。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const filter = process.argv.slice(2).find(a => !a.startsWith('--')) || '';
const files = fs.readdirSync(__dirname)
  .filter(f => /^test_.*\.js$/.test(f) && f.includes(filter))
  .sort();

if (!files.length) {
  console.error('没有匹配的测试文件：tests/test_*.js' + (filter ? '（过滤：' + filter + '）' : ''));
  process.exit(1);
}

let failed = 0;
const started = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    cwd: root, encoding: 'utf8', timeout: 120000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const hasFailWord = /\bFAIL\b|\bfail(?:ed)?\s+[1-9]/.test(out);
  const bad = Boolean(r.error) || r.status !== 0 || hasFailWord;
  if (bad) failed++;
  const summary = (out.trim().split('\n').filter(l => /passed|pass \d|结果|===|通过/.test(l)).pop() || '').trim();
  console.log(`${bad ? 'FAIL' : 'PASS'}  ${f.padEnd(26)} ${summary.slice(0, 90)}`);
  if (bad) {
    console.log('  exit=' + r.status + (r.error ? ' error=' + r.error.message : ''));
    out.trim().split('\n').slice(-25).forEach(l => console.log('  | ' + l));
  }
}
const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${files.length - failed}/${files.length} 通过，${failed} 失败，耗时 ${sec}s`);
process.exit(failed ? 1 : 0);
