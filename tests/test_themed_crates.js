/* 主题容器掉落：relicCat 分类正确性 / 新容器定义 / rollContainer 主题命中率 /
   大红直抽低于保险柜 / 类别空池兜底不炸 */
const fs = require('fs');
const path = require('path');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    w.eval(`
      G.scene = 'playing';
      window.__out = (function(){
        var out = {};
        /* 1. 分类器：代表性物品归对类 */
        out.cat = {
          med:  relicCat('m_plasma') === 'med' && relicCat('d_medbag') === 'med' && relicCat('m_surgkit') === 'med',
          mil:  relicCat('belt') === 'mil' && relicCat('d_ammoseal') === 'mil' && relicCat('d_sword') === 'mil',
          intel: relicCat('d_ledger') === 'intel' && relicCat('hdd') === 'intel' && relicCat('access') === 'intel',
          val:  relicCat('d_gold') === 'val' && relicCat('africaheart') === 'val' && relicCat('v_jade') === 'val',
          notMed: relicCat('d_ammobox') !== 'med' && relicCat('s_oring') !== 'med',
        };
        /* 2. 新容器定义齐全 */
        out.def = {
          docs: CONTAINERS.docs && CONTAINERS.docs.tag === '档案' && CONTAINERS.docs.speed > 0,
          lux:  CONTAINERS.lux && CONTAINERS.lux.tag === '贵重' && CONTAINERS.lux.speed > 0,
          ids:  CONTAINER_IDS.indexOf('docs') > 0 && CONTAINER_IDS.indexOf('lux') > 0,
        };
        /* 3. rollCatRelic：任何 (cat,q) 都不炸且返回有价物品；med myth 兜底走全量 */
        out.rollOk = ['common','rare','epic','legend','myth'].every(function(q){
          return ['med','mil','intel','val'].every(function(c){
            var id = rollCatRelic(q, c);
            return !!RELICS[id] && RELICS[id].q === q || c === 'med' && q === 'myth';
          });
        });
        /* 4. rollContainer：主题容器大批抽样，统计主题命中率 */
        function sample(kind, times){
          var themed = 0, myth = 0, total = 0;
          for (var i = 0; i < times; i++) {
            var items = rollContainer(kind);
            for (var j = 0; j < items.length; j++) {
              var it = items[j];
              if (it.kind !== 'relic') continue;
              total++;
              if (relicCat(it.id) === kind.replace('weapon','mil').replace('med','med').replace('docs','intel').replace('lux','val')) themed++;
              if (it.q === 'myth') myth++;
            }
          }
          return { themed: themed / Math.max(1, total), myth: myth / times };
        }
        out.weapon = sample('weapon', 400);
        out.medBox = sample('med', 400);
        out.docs   = sample('docs', 400);
        out.lux    = sample('lux', 400);
        out.safe   = sample('safe', 400);
        /* 5. 大红：主题箱直抽率都低于保险柜 */
        out.mythBelowSafe = out.weapon.myth < out.safe.myth && out.medBox.myth < out.safe.myth &&
                            out.docs.myth < out.safe.myth && out.lux.myth < out.safe.myth;
        /* 6. 主题命中：武器箱/医疗箱/文件柜/陈列柜的主题收集品占多数 */
        out.themedMajority = out.weapon.themed > 0.5 && out.medBox.themed > 0.5 &&
                             out.docs.themed > 0.6 && out.lux.themed > 0.6;
        return out;
      })();
    `);
    const o = w.eval('window.__out');
    T('分类器：医疗/军械/情报/贵重各归各类', o.cat.med && o.cat.mil && o.cat.intel && o.cat.val && o.cat.notMed);
    T('新容器定义：文件柜 / 陈列柜', o.def.docs && o.def.lux && o.def.ids);
    T('rollCatRelic 全 (cat,q) 组合不炸不空', o.rollOk);
    T('主题箱大红直抽率均低于保险柜', o.mythBelowSafe);
    T('主题收集品在对应容器占多数', o.themedMajority);
    console.log('  命中率 weapon=' + (o.weapon.themed * 100).toFixed(0) + '% med=' + (o.medBox.themed * 100).toFixed(0) +
      '% docs=' + (o.docs.themed * 100).toFixed(0) + '% lux=' + (o.lux.themed * 100).toFixed(0) + '% safe=' + (o.safe.themed * 100).toFixed(0) + '%');
    console.log('  大红/箱 weapon=' + o.weapon.myth.toFixed(3) + ' med=' + o.medBox.myth.toFixed(3) +
      ' docs=' + o.docs.myth.toFixed(3) + ' lux=' + o.lux.myth.toFixed(3) + ' safe=' + o.safe.myth.toFixed(3));
  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n'));
  }
  console.log(`=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}, 60);
