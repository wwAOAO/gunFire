/* HD3战术胸挂：左1×3 + 中两条1×2 + 右1×3 + 底行中缝横2×1（对齐参考图，4列×3行） */
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
        SAVE.worn.rig = 'hd3';
        P.rig = emptyCells(12);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var brks = d.querySelectorAll('.blk-break').length;
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cells: b.querySelectorAll('.lo-cell.bcell').length,
                   cols: b.querySelector('.blk-grid').style.gridTemplateColumns,
                   ml: b.style.marginLeft || '0', mt: b.style.marginTop || '0' };
        });
        return JSON.stringify({ brks: brks, blks: blks, sum: blks.reduce(function(a,b){return a+b.cells;},0) });
      })()`);
    const r = JSON.parse(info);
    T('共 5 个隔舱', r.blks.length === 5);
    T('总格数 12', r.sum === 12);
    T('无自动换行断点（全靠 brk 控排）', r.brks === 0);
    T('舱序 3格/2格/2格/3格/横2格', r.blks.map(b => b.cells).join(',') === '3,2,2,3,2');
    T('前四舱都是单列竖条', r.blks.slice(0, 4).every(b => b.cols === 'repeat(1, var(--bcell))'));
    T('底行快取袋是横双格', r.blks[4].cols === 'repeat(2, var(--bcell))');
    T('底行快取袋有拉回偏移（ml=-222 mt=114）', r.blks[4].ml === '-222px' && r.blks[4].mt === '114px');
    T('前四舱无偏移', r.blks.slice(0, 4).every(b => b.ml === '0' && b.mt === '0'));
    T('blkSizesText = 3+2+2+3+2', w.eval('blkSizesText(GEAR.hd3.blocks)') === '3+2+2+3+2');

    // 放置逻辑：1x3 能放进两侧长袋，1x4 放不下，1x2 横收集品能进底行快取袋
    const fit = w.eval(`
      (function(){
        var id3 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===3; });
        var id4 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===4; });
        var id2h = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===2 && s[1]===1; });
        var zb = zoneBlocks('rig');
        var a = findFitRun(P.rig, zb, { t: 'relic', id: id3 });
        var b = findFitRun(P.rig, zb, { t: 'relic', id: id4 });
        var c = findFitRun(P.rig, zb, { t: 'relic', id: id2h });
        return JSON.stringify({ x3: a >= 0, x4: b >= 0, x2h: c >= 0 });
      })()`);
    const jf = JSON.parse(fit);
    T('1x3 收集品能放进侧长袋', jf.x3 === true);
    T('1x4 收集品放不下', jf.x4 === false);
    T('2x1 横收集品能放进底行快取袋', jf.x2h === true);
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
