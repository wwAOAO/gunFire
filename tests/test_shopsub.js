/* 品质调整 + 弹药/补给子类目 + 类目条（不吸顶） */
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
    // ── 1. 品质 ──
    const q = JSON.parse(w.eval(`JSON.stringify({
      dar: GEAR.dar.q, gir: GEAR.gir.q, jyd: GEAR.jyd.q, hls: GEAR.pack_hls.q, als: GEAR.pack_als.q,
      im: MEDKITS.inject_m.grade, kf: MEDKITS.kit_field.grade, bo: MEDKITS.box_outdoor.grade, bb: MEDKITS.box_battle.grade,
      ab: STOPS.pain_antibio.grade, dve: STOPS.pain_dve.grade, st: SURGERIES.surg_tactical.grade, sd: SURGERIES.surg_dek.grade
    })`));
    T('DAR突击手胸挂 → 金', q.dar === '金');
    T('GIR野战胸挂 → 紫', q.gir === '紫');
    T('简易携行弹挂 → 蓝', q.jyd === '蓝');
    T('HLS-2重型背包 → 金', q.hls === '金');
    T('ALS背负系统 → 金', q.als === '金');
    T('强效注射器 → 绿', q.im === '绿');
    T('野战急救包 → 蓝', q.kf === '蓝');
    T('户外医疗箱 → 紫', q.bo === '紫');
    T('战地医疗箱 → 金', q.bb === '金');
    T('瓶装抗生素 → 绿', q.ab === '绿');
    T('DVE止疼片 → 紫', q.dve === '紫');
    T('战术快拆手术包 → 绿', q.st === '绿');
    T('DEK野战手术包 → 紫', q.sd === '紫');
    T('品质颜色跟着改（DAR 金色）', w.eval('GEAR.dar.color') === '#ffcc4d');

    // ── 2. 子类目：各类目显示/隐藏 ──
    const sub = JSON.parse(w.eval(`
      (function(){
        var out = {};
        var grab = function(){
          var bar = document.getElementById('shopSubTabs');
          return { hidden: bar.classList.contains('hidden'),
                   labels: [...bar.querySelectorAll('.tab')].map(function(b){ return b.textContent; }) };
        };
        openShop('weapon'); out.weapon = grab();
        document.querySelector('#shopTabs [data-tab=melee]').click(); out.melee = grab();
        document.querySelector('#shopTabs [data-tab=ammo]').click(); out.ammo = grab();
        document.querySelector('#shopTabs [data-tab=supply]').click(); out.supply = grab();
        return JSON.stringify(out);
      })()`));
    T('武器类目显示 8 个枪种子标签（含机枪）', !sub.weapon.hidden && sub.weapon.labels.length === 8);
    T('近战/护甲/弹挂/背包类目隐藏子行（测近战）', sub.melee.hidden === true);
    T('弹药子类目 = 全部 + 8 个弹级', !sub.ammo.hidden && sub.ammo.labels.length === 9 && sub.ammo.labels[1] === '0 级' && sub.ammo.labels[8] === '7 级');
    T('补给子类目 = 手术/治疗/止疼/甲修（无针剂）', !sub.supply.hidden &&
      sub.supply.labels.join(',') === '全 部,手 术,治 疗,止 疼,甲 修');

    // ── 3. 补给分组过滤 ──
    const sup = JSON.parse(w.eval(`
      (function(){
        var grab = function(){
          return [...document.querySelectorAll('#shopGrid .item .nm')].map(function(e){ return e.textContent; });
        };
        var out = {};
        document.querySelector('#shopSubTabs [data-sub=pain]').click();
        out.pain = grab();
        document.querySelector('#shopSubTabs [data-sub=repair]').click();
        out.repair = grab();
        document.querySelector('#shopSubTabs [data-sub=surg]').click();
        out.surg = grab();
        document.querySelector('#shopSubTabs [data-sub=treat]').click();
        out.treat = grab();
        document.querySelector('#shopSubTabs [data-sub=all]').click();
        out.all = grab().length;
        return JSON.stringify(out);
      })()`));
    T('止疼 = 3 种止痛药（不含绷带止血带）', sup.pain.length === 3 && sup.pain.join().indexOf('DVE') >= 0 && sup.pain.join().indexOf('绷带') < 0);
    T('甲修 = 4 种甲修包', sup.repair.length === 4 && sup.repair.every(s => s.indexOf('甲修包') >= 0));
    T('手术 = 3 手术包 + 绷带 + 止血带 = 5', sup.surg.length === 5 && sup.surg.join().indexOf('绷带') >= 0 && sup.surg.join().indexOf('止血带') >= 0);
    T('治疗 = 6 种医疗包（注射器也归治疗）', sup.treat.length === 6 && sup.treat.join().indexOf('强效') >= 0 && sup.treat.join().indexOf('绷带') < 0);
    T('全部 = 18 件（6 医 + 5 止血止疼 + 3 手术 + 4 甲修）', sup.all === 18);

    // ── 4. 弹药弹级过滤 ──
    const am = JSON.parse(w.eval(`
      (function(){
        var g = WEAPON_ORDER.find(function(id){ return calOfWeapon(id) === '556'; }) || WEAPON_ORDER[0];
        SAVE.owned[g] = true;                          // 有枪才会上架对应的弹
        document.querySelector('#shopTabs [data-tab=ammo]').click();
        var allN = document.querySelectorAll('#shopGrid .item').length;
        document.querySelector('#shopSubTabs [data-sub=lv3]').click();
        var nms = [...document.querySelectorAll('#shopGrid .item .nm')].map(function(e){ return e.textContent; });
        document.querySelector('#shopSubTabs [data-sub=all]').click();
        var back = document.querySelectorAll('#shopGrid .item').length;
        return JSON.stringify({ allN: allN, lv3: nms, back: back });
      })()`));
    T('选 3 级只显示蓝弹（' + am.lv3.length + ' 件）', am.lv3.length > 0 && am.lv3.every(s => s.indexOf('蓝弹') >= 0));
    T('点全部恢复全量', am.back === am.allN);

    // ── 5. 头部 CSS（#shopHead 跟随滚动，不做 sticky） ──
    T('#shopHead 没有 sticky 吸顶（含标题/余额/类目条）', !/#shopHead \{[^}]*position: sticky/.test(html));
    T('子类目条 hidden 规则真实存在', /#shopSubTabs\.hidden \{ display: none/.test(html));
  } catch (e) { fail++; console.log('FAIL  异常: ' + e.stack); }
  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 400);
