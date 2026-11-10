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
        SAVE.worn.rig = 'gzd';
        P.rig = emptyCells(6);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var brks = d.querySelectorAll('.blk-break').length;
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cells: b.querySelectorAll('.lo-cell.bcell').length,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ brks: brks, blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 5 个隔舱（2+1+1+1+1）', r.blks.length === 5);
    T('总格数 6', r.sum === 6);
    T('无换行断点', r.brks === 0);
    T('格数顺序 2,1,1,1,1', r.blks.map(b => b.cells).join(',') === '2,1,1,1,1');
    T('上排 3 舱无偏移', r.blks.slice(0, 3).every(b => b.ml === '0' && b.mt === '0'));
    T('第 4 舱（下叠袋①）左移 -148 回第 2 列', r.blks[3].ml === '-148px');
    T('第 4 舱下移 64px（1格袋①正下方）', r.blks[3].mt === '64px');
    T('第 5 舱（下叠袋②）自然落第 3 列 + 下移 64', r.blks[4].ml === '0' && r.blks[4].mt === '64px');
    T('blkSizesText = 2+1+1+1+1', w.eval('blkSizesText(GEAR.gzd.blocks)') === '2+1+1+1+1');
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
