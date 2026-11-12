/* 弹匣混装混打：弹匣逐发记录弹级（a.rounds），每发各按各的弹级结算。
   drainReserve 返回逐发弹级数组：优先装 preferLv 同级，同级不够就近补别的弹级
   （枪里是紫弹先补金弹，不补修脚弹）；打空弹匣按整备偏好就近挑。
   旧 bug：drainReserve 跨弹级兜底但整匣只按枪上单个 tier 结算 —— 金弹按紫弹打
   （白亏钱）、白弹按紫弹打（白赚），AMMO_TIERS 价格系数被整个绕过。 */
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
    var gun = 'akm';                            // 7.62x39：弹级表 0-5 全有，30 发弹匣
    P.owned[gun] = 1; P.weapon = gun; P.reloading = 0;
    const cal = calOfWeapon(P.weapon);
    const magCap = weaponStats(P.weapon).mag;
    const out = { cal, magCap };

    /* 身上弹药格重置：rig[0] = 4 级 10 发，rig[1] = 5 级 30 发 */
    function reset() {
      [P.rig, P.pocket, P.pack].forEach(a => { for (let i = 0; i < a.length; i++) a[i] = null; });
      P.rig[0] = { t: 'ammo', cal, lv: 4, n: 10 };
      P.rig[1] = { t: 'ammo', cal, lv: 5, n: 30 };
      P.ammo[P.weapon] = { mag: 0, tier: 4, cal, rounds: [] };
      SAVE.ammoPick[cal] = 4;
      P.reloading = 0;
      P.fireCd = 0;
    }
    const cell = i => (P.rig[i] ? P.rig[i].n : 0);   // 扣空的格子会被 drainReserve 置 null

    /* ① drainReserve 返回逐发弹级数组：同级不足就近兜底 */
    reset();
    const t1 = drainReserve(cal, 30, 4);        // 4 级 10 发 + 兜底 5 级 20 发
    out.t1n = t1.length;
    out.t1s = Array.from(new Set(t1)).sort().join(',');
    out.t1b = cell(1);

    /* ② 兜底就近取级：偏好 4 级、身上 2 级和 5 级都有 → 先补 5 级（距离 1 < 距离 2） */
    reset();
    P.rig[0] = { t: 'ammo', cal, lv: 2, n: 40 };
    P.rig[1] = { t: 'ammo', cal, lv: 5, n: 40 };
    const t2 = drainReserve(cal, 10, 4);
    out.t2first = t2[0];

    /* ③ 续装顺序：老弹（10×4）在前，新装在后；同级只有 5 发、其余就近补 5 级 */
    reset();
    P.rig[0].n = 5;
    P.ammo[P.weapon].mag = 10;
    P.ammo[P.weapon].rounds = Array(10).fill(4);
    finishReload();
    out.t3mag = P.ammo[P.weapon].mag;
    out.t3head = P.ammo[P.weapon].rounds[0];
    out.t3new = P.ammo[P.weapon].rounds.slice(10).join(',');
    out.t3b = cell(1);

    /* ④ 混装：同级只有 5 发、5 级一堆 → 补满 30，弹匣两种弹级并存 */
    reset();
    P.rig[0].n = 5;
    P.ammo[P.weapon].mag = 10;
    P.ammo[P.weapon].rounds = Array(10).fill(4);
    finishReload();
    out.t4mag = P.ammo[P.weapon].mag;
    out.t4set = Array.from(new Set(P.ammo[P.weapon].rounds)).sort().join(',');
    out.t4new = P.ammo[P.weapon].rounds.slice(10).join(',');

    /* ⑤ 混打：打一发消耗一个自己的弹级 */
    reset();
    P.ammo[P.weapon].mag = 2;
    P.ammo[P.weapon].rounds = [4, 5];
    P.aim = 0; P.ads = 0; P.recoil = 0; P.invuln = 1e9; G.enemies = []; G.bullets = [];
    for (var k in Sfx) if (typeof Sfx[k] === 'function') Sfx[k] = function(){};
    /* AKM 全自动：tryFire 还要 mouse.down，耗弹逻辑在 playerShoot，直接打它 */
    playerShoot();
    out.t5mag = P.ammo[P.weapon].mag;
    out.t5next = P.ammo[P.weapon].rounds[0];
    playerShoot();
    out.t5mag2 = P.ammo[P.weapon].mag;
    out.t5rounds = P.ammo[P.weapon].rounds.length;

    /* ⑥ 打空弹匣换弹种：偏好 4 级、身上只有 5 级 → 整匣 5 级 */
    reset();
    P.rig[0] = null;
    startReload(); finishReload();
    out.t6set = Array.from(new Set(P.ammo[P.weapon].rounds)).sort().join(',');
    out.t6mag = P.ammo[P.weapon].mag;

    /* ⑦ 就近偏好平手取低级：偏好 4 级、身上 3 级和 5 级都有、弹匣空 → 装 3 级 */
    reset();
    P.rig[0] = { t: 'ammo', cal, lv: 3, n: 40 };
    P.ammo[P.weapon].mag = 0; P.ammo[P.weapon].rounds = [];
    finishReload();
    out.t7set = Array.from(new Set(P.ammo[P.weapon].rounds)).sort().join(',');

    /* ⑧ 出击装填：多个同弹级格挨个填满整匣 */
    reset();
    P.rig[0] = { t: 'ammo', cal, lv: 4, n: 10 };
    P.rig[1] = { t: 'ammo', cal, lv: 4, n: 40 };
    const t8 = drainReserve(cal, magCap, 4);
    out.t8n = t8.length;
    out.t8left = [cell(0), cell(1)];

    /* ⑨ 完全没备弹：换弹静默拒绝 */
    reset();
    P.rig[0] = null; P.rig[1] = null;
    P.ammo[P.weapon].mag = 5; P.ammo[P.weapon].rounds = Array(5).fill(4);
    startReload();
    out.t9reloading = P.reloading;

    return JSON.stringify(out);
  })()`));
  const cal = R.cal;

  T('① 要 30 拿到 30 发（4 级 10 + 兜底 5 级 20）', R.t1n === 30);
  T('① 弹匣里两种弹级（4,5）', R.t1s === '4,5');
  T('① 5 级格被扣走 20 发、剩 10', R.t1b === 10);
  T('② 就近兜底：偏好 4 级、2/5 都有 → 先补 5 级', R.t2first === 5);
  T('③ 续装补满：10 老 + 5 同级 + 15 兜底 = 30', R.t3mag === R.magCap);
  T('③ 老弹在前：第 1 发仍是 4 级', R.t3head === 4);
  T('③ 新装顺序 = 5 发 4 级 + 15 发 5 级', R.t3new === '4,4,4,4,4,' + Array(15).fill(5).join(','));
  T('③ 5 级格被扣走 15 发、剩 15', R.t3b === 15);
  T('④ 混装补满：30 发整匣', R.t4mag === R.magCap);
  T('④ 弹匣两种弹级并存', R.t4set === '4,5');
  T('④ 新装的 20 发 = 5 发 4 级 + 15 发 5 级', R.t4new === '4,4,4,4,4,' + Array(15).fill(5).join(','));
  T('⑤ 混打：第一发吃掉 4 级、剩 5 级', R.t5mag === 1 && R.t5next === 5);
  T('⑤ 第二发吃掉 5 级、弹匣打空', R.t5mag2 === 0 && R.t5rounds === 0);
  T('⑥ 打空换弹种：整匣 5 级', R.t6set === '5' && R.t6mag === R.magCap);
  T('⑦ 平手取低级：偏好 4 级、3/5 都有 → 3 级', R.t7set === '3');
  T('⑧ 出击装填跨同弹级格凑满整匣', R.t8n === R.magCap);
  T('⑧ 两格都被扣（10 发格清空、40 发格补余量）', R.t8left[0] === 0 && R.t8left[1] === 50 - R.magCap);
  T('⑨ 完全没备弹：静默拒绝', R.t9reloading === 0);

  console.log('\n' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}, 1200);
