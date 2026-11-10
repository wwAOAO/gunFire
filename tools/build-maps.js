/* ═══════════════════════════════════════════════════════════
   地图打包：maps/*.json → maps/builtin-maps.js
   ─────────────────────────────────────────────────────────
   file:// 双击即玩时 fetch() 被 CORS 拦死，没法运行时读 JSON，
   所以用「构建注入」：把 maps/*.json 打包成经典 <script> 能
   直接执行的 window.BUILTIN_MAPS 赋值文件。

   用法：改完 maps/*.json 后运行  npm run build:maps
   注意：builtin-maps.js 是生成物，不要手改；
        key 顺序 = 加载顺序 = 大厅默认部署顺序，别打乱。
   ═══════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const MAP_DIR = path.join(__dirname, '..', 'maps');
// 顺序即 Object.keys(BUILTIN_MAPS) 顺序，启动时第一张是默认部署图
const ORDER = ['zero-dam', 'zero-dam-secret', 'space-base', 'space-base-top'];

const maps = {};
for (const id of ORDER) {
  const f = path.join(MAP_DIR, id + '.json');
  if (!fs.existsSync(f)) { console.error('缺少 ' + id + '.json'); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (m.format !== 'neonpurge-map') { console.error(id + '.json: format 字段不对'); process.exit(1); }
  if (m.version !== 1) { console.error(id + '.json: version 字段不对'); process.exit(1); }
  maps[id] = m;
}

const extra = fs.readdirSync(MAP_DIR).filter(f => f.endsWith('.json'))
  .map(f => f.slice(0, -5)).filter(id => !ORDER.includes(id));
if (extra.length) { console.error('maps/ 下有未登记的 JSON：' + extra.join(', ')); process.exit(1); }

const out = '/* 本文件由 tools/build-maps.js 生成 —— 请改 maps/*.json 后运行 npm run build:maps，不要手改 */\n' +
  '"use strict";\n' +
  'window.BUILTIN_MAPS = ' + JSON.stringify(maps) + ';\n';
fs.writeFileSync(path.join(MAP_DIR, 'builtin-maps.js'), out, 'utf8');
console.log('builtin-maps.js 已生成：', ORDER.join(' / '),
  '(' + (out.length / 1024).toFixed(1) + ' KB)');
