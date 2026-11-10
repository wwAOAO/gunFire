/* HK3便携胸挂：舱位结构对齐参考图（顶2零钱袋压竖双格袋上，底行两侧零钱袋） */
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
        SAVE.worn.rig = 'hk3';
        P.rig = emptyCells(8);
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
    T('共 6 个隔舱（1+1+2+2+1+1）', r.blks.length === 6);
    T('总格数 8', r.sum === 8);
    T('只有 1 个换行断点（顶排 / 竖袋排之间）', r.brks === 1);
    T('每舱列数=1（全竖条）', r.blks.every(b => b.rows === 'repeat(1, var(--bcell))'));
    T('格数顺序 1,1,2,2,1,1', r.blks.map(b => b.cells).join(',') === '1,1,2,2,1,1');
    T('顶上两个零钱袋右移到竖袋正上方（ml=74）', r.blks[0].ml === '74px' && r.blks[1].ml === '74px');
    T('两条竖双格袋右移一列（ml=74）', r.blks[2].ml === '74px' && r.blks[3].ml === '74px');
    T('底右零钱袋下移半格对齐底行（mt=48）', r.blks[4].mt === '48px');
    T('底右零钱袋右缩占位（mr=-222 防回流）', r.blks[4].mr === '-222px');
    T('底左零钱袋拉回第 1 列（ml=-148）', r.blks[5].ml === '-148px');
    T('底左零钱袋下移对齐底行（mt=48）', r.blks[5].mt === '48px');
    T('blkSizesText = 1+1+2+2+1+1', w.eval('blkSizesText(GEAR.hk3.blocks)') === '1+1+2+2+1+1');

    // 放置逻辑回归：2 格竖物品、1x3、单格都能放
    const fit = w.eval(`
      (function(){
        var id3 = Object.keys(RELICS).find(function(k){ var s = relicShape(k); return s[0]===1 && s[1]===3; });
        var a = findFitRun(P.rig, zoneBlocks('rig'), { t: 'relic', id: id3 });
        var b = findFitRun(P.rig, zoneBlocks('rig'), { t: 'med', id: 'inject_s', left: 4 });
        return JSON.stringify({ tall: a >= 0 ? 'fit@' + a : 'nofit', small: b >= 0 ? 'fit@' + b : 'nofit' });
      })()`);
    const jf = JSON.parse(fit);
    T('1x3 收集品放不进竖 2 格舱（符合舱位限制）', jf.tall === 'nofit');
    T('1 格物品能放进任意舱', jf.small.startsWith('fit@'));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
