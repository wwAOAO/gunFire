/* G01战术弹挂：底排三条竖双格袋右移一列，对齐顶部横三格条正下方（只改布局不改格子） */
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
        SAVE.worn.rig = 'g01';
        P.rig = emptyCells(13);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cells: b.querySelectorAll('.lo-cell.bcell').length,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 6 个隔舱（格子不变）', r.blks.length === 6);
    T('总格数 13', r.sum === 13);
    T('舱型 2/3/2/2/2/2 不变', r.blks.map(b => b.cells).join(',') === '2,3,2,2,2,2');
    T('只有底排首舱带 ml=74 右移', r.blks[3].ml === '74px' && r.blks.filter(b => b.ml !== '0').length === 1);
    T('其余舱无偏移', [0,1,2,4,5].every(i => r.blks[i].ml === '0' && r.blks[i].mt === '0'));

    // 13 格全空可容纳：2x1 横件能放进顶部横三格条
    const fit = w.eval(`
      (function(){
        var id2 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===2 && s[1]===1; });
        var a = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id2 });
        return a >= 0 ? 'fit' : 'nofit';
      })()`);
    T('2x1 横件能放进顶部横排', fit === 'fit');
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
