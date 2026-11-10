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
    const info = w.eval(`
      (function(){
        SAVE.worn.rig = 'd01';
        P.rig = emptyCells(8);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var brks = d.querySelectorAll('.blk-break').length;
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cap: b.dataset.cap, cells: b.querySelectorAll('.lo-cell.bcell').length,
                   cols: b.querySelector('.blk-grid').style.gridTemplateColumns,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ brks: brks, blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 5 个隔舱（1+2+2+2+1）', r.blks.length === 5);
    T('总格数 8', r.sum === 8);
    T('无换行断点（全在同一条排上）', r.brks === 0);
    T('格数顺序 1,2,2,2,1', r.blks.map(b => b.cells).join(',') === '1,2,2,2,1');
    T('全部单列竖舱', r.blks.every(b => b.cols === 'repeat(1, var(--bcell))'));
    T('上排 4 舱无偏移', r.blks.slice(0, 4).every(b => b.ml === '0' && b.mt === '0'));
    T('第 2 个 1 格袋左移 -296 回第 1 列', r.blks[4].ml === '-296px');
    T('第 2 个 1 格袋下移 64px（顶头袋正下方）', r.blks[4].mt === '64px');
    T('blkSizesText = 1+2+2+2+1', w.eval('blkSizesText(GEAR.d01.blocks)') === '1+2+2+2+1');
    // 放置逻辑：1x1 物品能放进任意舱，竖 2 格物品能放进 2 格舱
    const fit = w.eval(`
      (function(){
        var i2 = findFitRun(P.rig, zoneBlocks('rig'), { t: 'ammo', cal: '762', lv: 1, n: 60, __wide: true });
        var ok2 = false;
        // 2格竖舱 findFitRun 对 1x2 物品
        var cell = { t: 'relic', id: Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===2; }) };
        var j = findFitRun(P.rig, zoneBlocks('rig'), cell);
        return '1x2@' + j;
      })()`);
    T('1x2 收集品能放进竖 2 格舱', fit.startsWith('1x2@') && !fit.endsWith('@-1'));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
