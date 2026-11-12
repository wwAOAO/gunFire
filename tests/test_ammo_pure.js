/* 弹匣纯级：换弹只装与枪上同弹级的备弹，不同弹级绝不混进同一个弹匣；
   弹匣打空才允许换弹种（按整备偏好就近挑身上有的级别）。
   旧逻辑的坑：drainReserve 跨弹级兜底 grab(null)，兜底弹装进去也只能
   按枪上记的旧 tier 结算 —— 金弹按紫弹打（白亏钱）、白弹按紫弹打（白赚）。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { inlineScripts } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(inlineScripts(html), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(window) {                       // jsdom 无 canvas：页面脚本运行前注入假 2D 上下文
    const noop = function(){};
    const fakeCtx = new Proxy({}, {
      get(t, k) {
        if (k === 'canvas') return { width: 800, height: 600 };
        if (k === 'createImageData' || k === 'getImageData')
          return (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray((a || 1) * (b || 1) * 4) });
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern')
          return () => ({ addColorStop: function(){} });
        return noop;
      },
      set() { return true; }
    });
    window.HTMLCanvasElement.prototype.getContext = function(){ return fakeCtx; };
  }
});
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  const R = JSON.parse(w.eval(`(function(){
    loadBuiltinMap('zero-dam', true); startRaid();
    var gun = 'akm';                            // 7.62x39：弹级表 0-5 全有，30 发弹匣，混级场景才成立
    P.owned[gun] = 1; P.weapon = gun; P.reloading = 0;   // 测试环境没有大厅整备，直接塞一把枪
    const cal = calOfWeapon(P.weapon);
    const magCap = weaponStats(P.weapon).mag;
    const out = { cal, magCap };

    /* 身上弹药格重置：rig[0] = 4 级 10 发，rig[1] = 5 级 30 发 */
    function reset() {
      [P.rig, P.pocket, P.pack].forEach(a => { for (let i = 0; i < a.length; i++) a[i] = null; });
      P.rig[0] = { t: 'ammo', cal, lv: 4, n: 10 };
      P.rig[1] = { t: 'ammo', cal, lv: 5, n: 30 };
      const a = currentAmmo();
      a.cal = cal; a.mag = 0; a.tier = 4;
      SAVE.ammoPick[cal] = 4;
      P.reloading = 0;
    }
    const cell = i => (P.rig[i] ? P.rig[i].n : 0);   // 扣空的格子会被 drainReserve 置 null

    /* ① drainReserve 只扣同级：4 级只剩 10 发，要 30 只给 10 */
    reset();
    out.t1 = drainReserve(cal, 30, 4);
    out.t1b = cell(1);                          // 5 级格子一颗不动

    /* ② 半匣停装：弹匣 10 发 + 同级备弹只有 5 发 → 补到 15，不拿 5 级凑满 */
    reset();
    P.rig[0].n = 5;
    P.ammo[P.weapon].mag = 10;
    finishReload();
    out.t2mag = P.ammo[P.weapon].mag;
    out.t2tier = P.ammo[P.weapon].tier;
    out.t2b = cell(1);

    /* ③ 弹匣有弹 + 同级备弹没了：换弹直接拒掉（不空转读条） */
    reset();
    P.ammo[P.weapon].mag = 10;
    P.rig[0] = null;                            // 4 级弹清空
    startReload();
    out.t3reloading = P.reloading;

    /* ④ 弹匣打空 = 可换弹种：偏好 4 级、身上只有 5 级 → 就近装 5 级整匣 */
    reset();
    P.rig[0] = null;
    startReload();                              // mag==0 放行
    finishReload();
    out.t4tier = P.ammo[P.weapon].tier;
    out.t4mag = P.ammo[P.weapon].mag;

    /* ⑤ 就近偏好平手取低级：偏好 4 级、身上 3 级和 5 级都有 → 装 3 级 */
    reset();
    P.rig[0] = { t: 'ammo', cal, lv: 3, n: 40 };
    P.ammo[P.weapon].mag = 0;
    finishReload();
    out.t5tier = P.ammo[P.weapon].tier;

    /* ⑥ 出击装填：两个同弹级格挨个填满整匣（旧逻辑只扣第一格） */
    reset();
    P.rig[0] = { t: 'ammo', cal, lv: 4, n: 10 };
    P.rig[1] = { t: 'ammo', cal, lv: 4, n: 40 };
    out.t6mag = drainReserve(cal, magCap, 4);
    out.t6left = [cell(0), cell(1)];

    /* ⑦ 半匣不重挑弹级：弹匣 10 发 4 级 + 同级备弹 10 发、身上 5 级一堆 →
       补到 20，tier 不变，5 级一颗不动 */
    reset();
    P.ammo[P.weapon].mag = 10;
    finishReload();
    out.t7tier = P.ammo[P.weapon].tier;
    out.t7mag = P.ammo[P.weapon].mag;
    out.t7b = P.rig[1].n;

    /* ⑧ 完全没备弹：换弹静默拒绝（原行为不变） */
    reset();
    P.rig[0] = null; P.rig[1] = null;
    P.ammo[P.weapon].mag = 5;
    startReload();
    out.t8reloading = P.reloading;

    return JSON.stringify(out);
  })()`));
  const cal = R.cal;

  T('① drainReserve 只扣同级：要 30 只拿到 4 级的 10 发', R.t1 === 10);
  T('① 5 级格子一颗没动', R.t1b === 30);
  T('② 半匣停装：10+5=15，不拿 5 级凑满', R.t2mag === Math.min(15, R.magCap));
  T('② 换弹后 tier 仍是 4 级', R.t2tier === 4);
  T('② 5 级备弹没被扣', R.t2b === 30);
  T('③ 弹匣有弹且无同级备弹：startReload 拒绝，不进读条', R.t3reloading === 0);
  T('④ 打空弹匣换弹种：按就近装上 5 级', R.t4tier === 5);
  T('④ 换弹种后装满整匣', R.t4mag === R.magCap);
  T('⑤ 就近偏好平手取低级（4 级偏好、3/5 都有 → 3 级）', R.t5tier === 3);
  T('⑥ 出击装填跨同弹级格凑满整匣', R.t6mag === R.magCap);
  T('⑥ 两格都被扣（10 发格清空、40 发格补余量）', R.t6left[0] === 0 && R.t6left[1] === 50 - R.magCap);
  T('⑦ 半匣换弹不动弹级、不混装', R.t7tier === 4 && R.t7mag === 20 && R.t7b === 30);
  T('⑧ 完全没备弹：静默拒绝（不弹提示不读条）', R.t8reloading === 0);

  console.log('\\n' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}, 1200);
