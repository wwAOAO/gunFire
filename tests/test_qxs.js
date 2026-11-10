/* 轻型战术胸挂：左右各 2 个独立 1×1 小袋（错位悬挂零压线）+ 中缝 1×2 竖袋（3 列，对齐参考图） */
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
        SAVE.worn.rig = 'qxs';
        P.rig = emptyCells(6);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var brks = d.querySelectorAll('.blk-break').length;
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cells: b.querySelectorAll('.lo-cell.bcell').length,
                   rows: b.querySelector('.blk-grid').style.gridTemplateColumns,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0', mr: b.style.marginRight || '0' };
        });
        return JSON.stringify({ brks: brks, blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 5 个隔舱（左右各 2 小袋 + 中缝 1 竖袋）', r.blks.length === 5);
    T('总格数 6', r.sum === 6);
    T('舱序 1/1/2/1/1', r.blks.map(b => b.cells).join(',') === '1,1,2,1,1');
    T('只有中缝是竖双格', r.blks[2].cells === 2 && r.blks.filter(b => b.cells === 2).length === 1);
    T('侧列下袋错位悬挂（ml=-74 mt=66，贴上袋框下方 2px）',
      r.blks[1].ml === '-74px' && r.blks[1].mt === '66px' && r.blks[4].ml === '-74px' && r.blks[4].mt === '66px');
    T('顶袋与中缝无偏移', r.blks[0].ml === '0' && r.blks[0].mt === '0' && r.blks[2].ml === '0' && r.blks[2].mt === '0' && r.blks[3].ml === '0' && r.blks[3].mt === '0');
    T('blkSizesText = 1+1+2+1+1', w.eval('blkSizesText(GEAR.qxs.blocks)') === '1+1+2+1+1');

    // 放置逻辑：1x3 放不下，1x2 只能进中缝
    const fit = w.eval(`
      (function(){
        var id3 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===3; });
        var id2 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===2; });
        var a = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id3 });
        var b = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id2 });
        return JSON.stringify({ x3: a >= 0 ? 'fit' : 'nofit', x2: b >= 0 ? 'fit' : 'nofit' });
      })()`);
    const jf = JSON.parse(fit);
    T('1x3 收集品放不下', jf.x3 === 'nofit');
    T('1x2 收集品能放进中缝竖袋', jf.x2 === 'fit');
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
