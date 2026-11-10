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
        SAVE.worn.rig = 'xiqiang';
        P.rig = emptyCells(14);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var brks = d.querySelectorAll('.blk-break').length;
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cap: b.dataset.cap, cells: b.querySelectorAll('.lo-cell.bcell').length,
                   rows: b.querySelector('.blk-grid').style.gridTemplateColumns, ml: b.style.marginLeft || '0',
                   mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ brks: brks, blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 7 个隔舱（2格×3 + 3格×2 + 1格×2）', r.blks.length === 7);
    T('总格数 14', r.sum === 14);
    T('无换行断点（全在同一条排上）', r.brks === 0);
    T('每舱列数=1（全竖条）', r.blks.every(b => b.rows === 'repeat(1, var(--bcell))'));
    T('格数顺序 2,2,2,3,3,1,1', r.blks.map(b => b.cells).join(',') === '2,2,2,3,3,1,1');
    T('第 6 舱（1格袋①）左移回第 1 列', r.blks[5].ml === '-370px');
    T('第 7 舱（1格袋②）自然落在第 2 列', r.blks[6].ml === '0');
    T('两个 1 格袋下移 112px（竖2格正下方）', r.blks[5].mt === '112px' && r.blks[6].mt === '112px');
    T('上排 5 舱无偏移', r.blks.slice(0, 5).every(b => b.ml === '0' && b.mt === '0'));
    T('blkSizesText = 2+2+2+3+3+1+1', w.eval('blkSizesText(GEAR.xiqiang.blocks)') === '2+2+2+3+3+1+1');
    // 放置逻辑：竖 1x3 物品能放进 3 格竖舱
    const fit = w.eval(`
      (function(){
        var id3 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===3; });
        var i = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id3 });
        return i >= 0 ? 'fit@' + i : 'nofit';
      })()`);
    T('1x3 收集品能放进竖 3 格舱', fit.startsWith('fit@'));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
