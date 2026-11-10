/* 干员横向平衡：蜂医补强（自救 6s / 充能 24s）、露娜侦察箭 CD 66s，其余干员锚点不动 */
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
    const b = JSON.parse(w.eval(`JSON.stringify({
      recharge: SKILL.heal.recharge,
      rescue: SKILL.rescue.down,
      beeserCd: OPERATORS.beeser.x.cd,
      beeserDesc: OPERATORS.beeser.passive.desc,
      beeserXDesc: OPERATORS.beeser.x.desc,
      lunaCd: OPERATORS.luna.x.cd,
      lunaDesc: OPERATORS.luna.x.desc
    })`));
    T('蜂医激素枪充能 24s', b.recharge === 24);
    T('蜂医自救 6s', b.rescue === 6);
    T('技能面板 CD 跟随充能值（24）', b.beeserCd === 24);
    T('自救描述同步（6 秒）', b.beeserDesc.indexOf('6 秒完成自救') >= 0);
    T('充能描述同步（24 秒）', b.beeserXDesc.indexOf('充能 24 秒') >= 0);
    T('露娜侦察箭 CD 66s', b.lunaCd === 66);
    T('侦察箭描述同步（CD 66）', b.lunaDesc.indexOf('CD 66 秒') >= 0);

    const anchors = JSON.parse(w.eval(`JSON.stringify({
      redwolf: [OPERATORS.redwolf.x.cd, OPERATORS.redwolf.x.dur],
      weilong: [OPERATORS.weilong.v.cd, OPERATORS.weilong.g.cd],
      uluru: [OPERATORS.uluru.x.cd],
      nameless: [OPERATORS.nameless.x.cd, OPERATORS.nameless.x.dur],
      gu: [OPERATORS.gu.x.cd, OPERATORS.gu.v.cd],
      count: OP_ORDER.length
    })`));
    T('红狼外骨骼未动（90s / 25s）', anchors.redwolf[0] === 90 && anchors.redwolf[1] === 25);
    T('威龙推进 20s / 磁吸 55s 未动', anchors.weilong[0] === 20 && anchors.weilong[1] === 55);
    T('乌鲁鲁巡飞弹 90s 未动', anchors.uluru[0] === 90);
    T('无名静默 80s / 12s 未动', anchors.nameless[0] === 80 && anchors.nameless[1] === 12);
    T('蛊流荧 120s / 肾上腺素 45s 未动', anchors.gu[0] === 120 && anchors.gu[1] === 45);
    T('干员总数仍是 7', anchors.count === 7);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
