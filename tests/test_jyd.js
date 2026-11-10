/* 简易携行弹挂：左右两列各2个独立1×1小袋 + 中缝两条1×2竖袋 + 底行横2×1快取袋（对齐参考图） */
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
        SAVE.worn.rig = 'jyd';
        P.rig = emptyCells(10);
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
    T('总格数 10', r.sum === 10);
    T('舱序 1/1/2/2/1/1/2', r.blks.map(b => b.cells).join(',') === '1,1,2,2,1,1,2');
    T('左右小袋都是 1×1 单格舱', [0,1,4,5].every(i => r.blks[i].cols === 'repeat(1, var(--bcell))' && r.blks[i].cells === 1));
    T('中缝两条都是 1×2 竖袋', [2,3].every(i => r.blks[i].cols === 'repeat(1, var(--bcell))' && r.blks[i].cells === 2));
    T('底行快取袋是横双格', r.blks[6].cols === 'repeat(2, var(--bcell))');
    T('下袋挂上袋下方（mt=66，留 2px 不压线）', [1,5].every(i => r.blks[i].ml === '-74px' && r.blks[i].mt === '66px'));
    T('上袋与中缝竖袋无偏移', [0,2,3,4].every(i => r.blks[i].ml === '0' && r.blks[i].mt === '0'));
    T('底行快取袋拉回中缝下方（ml=-222 mt=114）', r.blks[6].ml === '-222px' && r.blks[6].mt === '114px');
    T('blkSizesText = 1+1+2+2+1+1+2', w.eval('blkSizesText(GEAR.jyd.blocks)') === '1+1+2+2+1+1+2');

    // 放置逻辑：1x2 竖收集品只能进中缝竖袋，进不了左右 1×1 小袋
    const fit = w.eval(`
      (function(){
        var id2v = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===2; });
        var id2h = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===2 && s[1]===1; });
        var zb = zoneBlocks('rig');
        var a = findFitRun(P.rig, zb, { t: 'relic', id: id2v });
        var b = findFitRun(P.rig, zb, { t: 'relic', id: id2h });
        return JSON.stringify({ x2v: a >= 0, x2h: b >= 0 });
      })()`);
    const jf = JSON.parse(fit);
    T('1x2 竖收集品能放进中缝竖袋', jf.x2v === true);
    T('2x1 横收集品能放进底行快取袋', jf.x2h === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
