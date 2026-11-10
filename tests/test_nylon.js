/* 尼龙挎包：左右两列各3个独立1×1小袋 + 中缝1×2袋（对齐参考图，虚线不重合） */
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
        SAVE.worn.rig = 'nylon';
        P.rig = emptyCells(8);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cells: b.querySelectorAll('.lo-cell.bcell').length,
                   cols: b.querySelector('.blk-grid').style.gridTemplateColumns,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 7 个隔舱', r.blks.length === 7);
    T('总格数 8', r.sum === 8);
    T('舱序 1/1/1/2/1/1/1', r.blks.map(b => b.cells).join(',') === '1,1,1,2,1,1,1');
    T('两侧 6 个都是独立 1×1 单格舱（不是 1×3 长舱）',
      [0,1,2,4,5,6].every(i => r.blks[i].cells === 1 && r.blks[i].cols === 'repeat(1, var(--bcell))'));
    T('中缝 1×2 竖袋无偏移', r.blks[3].cells === 2 && r.blks[3].ml === '0' && r.blks[3].mt === '0');
    T('下袋错位悬挂：mt=66 / 132（留 2px 不压线）',
      r.blks[1].mt === '66px' && r.blks[2].mt === '132px' && r.blks[5].mt === '66px' && r.blks[6].mt === '132px');
    T('上袋与拉回偏移 ml=-74', [1,2,5,6].every(i => r.blks[i].ml === '-74px'));
    T('blkSizesText = 1+1+1+2+1+1+1', w.eval('blkSizesText(GEAR.nylon.blocks)') === '1+1+1+2+1+1+1');

    // 放置逻辑：1x2 只能进中缝，1x1 哪都能放
    const fit = w.eval(`
      (function(){
        var id2 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===2; });
        var id1 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===1; });
        var a = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id2 });
        var b = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id1 });
        return JSON.stringify({ x2: a >= 0, x1: b >= 0 });
      })()`);
    const jf = JSON.parse(fit);
    T('1x2 收集品能放进中缝竖袋', jf.x2 === true);
    T('1x1 收集品能放进任意小袋', jf.x1 === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
