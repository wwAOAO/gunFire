/* 敌人脚步声：听距 / 距离曲线 / 战斗与重甲倍率 / 头盔拾音 / 低频落地分量 */
const fs = require('fs');
const path = require('path');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok, extra) => {
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (ok || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
};

/* 最小 AudioContext 桩：建节点 + 记调用，够验证「真的排了哪几层声音」 */
function stubAC() {
  const node = () => ({
    gain: { value: 0, setValueAtTime: (v) => window.__sfxCalls.push(['gain', v]), linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    frequency: { value: 0, setValueAtTime: (v) => window.__sfxCalls.push(['freq', v]), exponentialRampToValueAtTime: () => {} },
    Q: { value: 0 },
    pan: { value: 0 },
    type: '',
    buffer: null,
    playbackRate: { value: 1 },
    connect: () => {}, start: () => window.__sfxCalls.push(['start']), stop: () => {},
  });
  return function AC() {
    return {
      currentTime: 0, sampleRate: 44100, destination: {},
      createGain: node, createBiquadFilter: node, createBufferSource: node,
      createOscillator: node, createStereoPanner: node,
      createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
      state: 'running', resume: () => {},
    };
  };
}

setTimeout(() => {
  try {
    w.eval(`
      window.__sfxCalls = [];
      window.AudioContext = (${stubAC.toString()})();
      Sfx.init();
      window.__ready = Sfx.ready;

      window.__pv = function (dist, state, type) {
        P.alive = true; P.x = 1000; P.y = 1000; P.aim = 0;
        var heavy = (type === 'brute' || type === 'boss');
        var e = { x: P.x + dist, y: P.y, state: state || 'patrol', type: type || 'runner' };
        var pv = footPanVol(e, heavy);
        return pv === null ? null : { vol: pv.vol, pan: pv.pan, behind: pv.behind };
      };
      P.helmetHear = 1;
      window.__freqs = function (vol, heavy) {
        window.__sfxCalls.length = 0;
        Sfx.step3d(0, vol, false, heavy);
        return window.__sfxCalls.filter(function (c) { return c[0] === 'freq'; })
          .map(function (c) { return c[1]; });
      };
    `);
    T('stub AudioContext 下 Sfx 就绪', w.eval('window.__ready') === true);

    /* 1. 听距与曲线：巡逻兵要在「不贴脸」的距离上被听见 */
    T('听距 460 → 520', w.eval('FOOTSTEP_EAR') === 520, w.eval('FOOTSTEP_EAR'));
    const v300 = w.eval('__pv(300, "patrol", "runner").vol');
    T('300px 巡逻可听度 0.067（旧版 0.024）', v300 > 0.05 && v300 < 0.12, v300);
    const v400 = w.eval('__pv(400, "patrol", "runner").vol');
    T('400px 仍有 0.033，明显高于发声闸门', v400 > 0.02 && v400 < 0.05, v400);
    const v460 = w.eval('__pv(460, "patrol", "runner").vol');
    T('460px 不再落进「算了又扔」的死区', v460 > 0.004, v460);
    T('超出 520px 返回 null（听不见）', w.eval('__pv(530, "patrol", "runner")') === null);
    T('贴脸 12px 返回 null（交给近战音效）', w.eval('__pv(12, "patrol", "runner")') === null);

    /* 2. 倍率：战斗略响、重甲明显更响 */
    const vc = w.eval('__pv(300, "combat", "runner").vol');
    T('战斗态 ×1.15', Math.abs(vc / v300 - 1.15) < 1e-6, vc / v300);
    const vb = w.eval('__pv(300, "patrol", "brute").vol');
    T('重甲（brute）是轻兵的 1.8 倍', Math.abs(vb / v300 - 1.8) < 1e-6, vb / v300);

    /* 3. 头盔拾音：DICH +50% → 听距 780，640px 外还听得到 */
    const vHear = w.eval(`(function () {
      var old = P.helmetHear; P.helmetHear = 1.5;
      var a = __pv(640, 'patrol', 'runner');
      P.helmetHear = old;
      return a ? a.vol : null;
    })()`);
    T('拾音 +50% 时 640px 外仍能听见', vHear !== null && vHear > 0, vHear);

    /* 4. 低频落地分量：普通兵 96~118Hz、重甲 70~88Hz，各一层 */
    const fN = w.eval('__freqs(0.06, false)');
    T('普通兵脚步带 96~118Hz 落地分量', fN.length === 1 && fN[0] >= 90 && fN[0] <= 120, fN);
    const fH = w.eval('__freqs(0.06, true)');
    T('重甲落地分量更低（70~88Hz）', fH.length === 1 && fH[0] >= 66 && fH[0] <= 92, fH);
    const quiet = w.eval('__freqs(0.003, false).length');
    T('低于 0.004 闸门时不出声', quiet === 0, quiet);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
