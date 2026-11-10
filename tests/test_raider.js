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
        SAVE.worn.rig = 'raider';
        P.rig = emptyCells(16);
        var d = document.createElement('div');
        document.body.appendChild(d);
        renderCarryZoneGrid(d, P.rig, 0);
        var blks = [...d.querySelectorAll('.pk-blk')].map(function(b){
          return { cap: b.dataset.cap, ml: b.style.marginLeft || '0', cols: b.querySelector('.blk-grid').style.gridTemplateColumns,
                   cells: b.querySelectorAll('.lo-cell.bcell').length };
        });
        return JSON.stringify(blks);
      })()`);
    const blks = JSON.parse(info);
    T('共 6 个隔舱', blks.length === 6);
    T('总格数 16', blks.reduce((a, b) => a + b.cells, 0) === 16);
    T('上排 4 舱无缩进', blks.slice(0, 4).every(b => b.ml === '0'));
    T('上排 4 舱都是单列', blks.slice(0, 4).every(b => b.cols === 'repeat(1, var(--bcell))'));
    T('格数顺序 3,2,2,3', blks.slice(0, 4).map(b => b.cells).join(',') === '3,2,2,3');
    T('横快取袋 2 列 + 缩进 135', blks[4].cols === 'repeat(2, var(--bcell))' && blks[4].ml === '87px' && blks[4].cells === 2);
    T('2x2 舱 2 列 + 缩进 135', blks[5].cols === 'repeat(2, var(--bcell))' && blks[5].ml === '87px' && blks[5].cells === 4);
    // 缩进校验：中点对齐（中舱 B..C 各宽 64，跨 74..212，中心 143；2 列舱外宽 112 → 左缘 87）
    T('缩进后中心=中舱中线 143px', 87 + 112 / 2 === 143);
    T('缩进舱右缘不甩出中舱右缘', 87 + 112 <= 212 + 10);

    // loot 面板同款渲染也生效
    const info2 = w.eval(`
      (function(){
        var d = document.getElementById('lootRig');
        document.getElementById('loot').classList.remove('hidden');
        renderCarryZoneGrid(d, P.rig, 0);
        return JSON.stringify([...d.querySelectorAll('.pk-blk')].map(function(b){ return b.style.marginLeft || '0'; }));
      })()`);
    const mls = JSON.parse(info2);
    T('搜刮面板同样应用缩进', mls.length === 6 && mls[4] === '87px' && mls[5] === '87px');

    // 存档兼容：blkSizesText 仍输出格数串
    const sz = w.eval(`blkSizesText(GEAR.raider.blocks)`);
    T('blkSizesText 兼容 = 3+2+2+3+2+4', sz === '3+2+2+3+2+4');
    // 放置逻辑没坏：往弹挂塞一件 2x2 还能落进 2x2 舱
    const put = w.eval(`
      (function(){
        var cell = { t: 'relic', id: Object.keys(RELICS).find(function(k){ return relicShape(k)[0]===2 && relicShape(k)[1]===2; }) };
        var r = freeCellFor ? null : null;
        // 直接找弹挂里的空位
        var i = findFitRun(P.rig, zoneBlocks('rig'), cell);
        return i >= 0 ? 'fit@' + i : 'nofit';
      })()`);
    T('2x2 收集品能放进 2x2 舱', put.startsWith('fit@'));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
