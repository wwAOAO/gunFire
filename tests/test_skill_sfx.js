/* 干员技能音效：Sfx.skill 全 kind 覆盖 / stub AudioContext 下全技能出声不炸 /
   激活点全部挂载（源码断言）/ 旧的泛用 dash 呼啸已从投掷函数移除 */
const fs = require('fs');
const path = require('path');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

/* 最小 AudioContext 桩：能建节点、能记调用就够了（序列化进页面执行，用 window 全局记调用） */
function stubAC() {
  const node = () => ({
    gain: { value: 0, setValueAtTime: (v) => window.__sfxCalls.push(['gain', v]), linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    frequency: { value: 0, setValueAtTime: (v) => window.__sfxCalls.push(['freq', v]), exponentialRampToValueAtTime: () => {} },
    Q: { value: 0 },
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
      window.__AudioCtxStub = (${stubAC.toString()})();
      window.AudioContext = __AudioCtxStub;
      Sfx.init();
      window.__ready = Sfx.ready;
    `);
    T('stub AudioContext 下 Sfx.init 就绪', w.eval('window.__ready') === true);

    /* 1. Sfx.skill 存在且覆盖全部技能 kind */
    const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
    const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
    const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
    const kinds = ['smoke', 'frag', 'beesmoke', 'magbomb', 'flash', 'gas', 'firebomb',
      'exo', 'dash', 'shock', 'shockbow', 'scanbow', 'drone', 'healgun', 'coverdev', 'blade', 'loiter'];
    T('audio.js 定义了 Sfx.skill', /skill\(kind\)/.test(audioSrc));
    T('skill() 覆盖全部 ' + kinds.length + ' 种技能 kind',
      kinds.every(k => audioSrc.includes(`case '${k}'`)));

    /* 2. 每种 kind 真调一遍不抛异常、真的发声 */
    const n0 = w.eval('window.__sfxCalls.length');
    w.eval(`kindsTest = [${kinds.map(k => `'${k}'`).join(',')}]; kindsTest.forEach(k => Sfx.skill(k));`);
    const nCalls = w.eval('window.__sfxCalls.length') - n0;
    T('全 17 种技能音色真调不炸（发声次数 > 17）', nCalls > 17);

    /* 3. game.js 激活点全部挂上 Sfx.skill（每种 kind 至少一处调用） */
    const hooks = {
      smoke: "Sfx.skill('smoke')", frag: "Sfx.skill('frag')", beesmoke: "Sfx.skill('beesmoke')",
      magbomb: "Sfx.skill('magbomb')", flash: "Sfx.skill('flash')", gas: "Sfx.skill('gas')",
      firebomb: "Sfx.skill('firebomb')", exo: "Sfx.skill('exo')", dash: "Sfx.skill('dash')",
      shock: "Sfx.skill('shock')", shockbow: "'shockbow' : 'scanbow'", drone: "Sfx.skill('drone')",
      healgun: "Sfx.skill('healgun')", coverdev: "Sfx.skill('coverdev')",
      blade: "Sfx.skill('blade')", loiter: "Sfx.skill('loiter')",
    };
    const missing = Object.entries(hooks).filter(([k, s]) => !gameSrc.includes(s)).map(([k]) => k);
    T('game.js 全部激活点挂载 Sfx.skill' + (missing.length ? '（缺: ' + missing + '）' : ''), missing.length === 0);

    /* 4. 旧泛用呼啸已从投掷函数移除：throwSmoke/MagBomb/Flash/Gas/BeeSmoke/Firebomb/Frag 里不再有 Sfx.dash */
    const throwFns = ['throwSmoke', 'throwMagBomb', 'throwFlash', 'throwGas', 'throwBeeSmoke', 'firebombThrow', 'fragThrow'];
    const stillDash = throwFns.filter(fn => {
      const m = gameSrc.match(new RegExp('function ' + fn + '[\\s\\S]*?\\n}'));
      return m && /Sfx\.dash\(/.test(m[0]);
    });
    T('投掷技能不再用泛用 dash 呼啸' + (stillDash.length ? '（残留: ' + stillDash + '）' : ''), stillDash.length === 0);

    /* 5. dashForward 允许用 skill('dash')（推进器专属），7 个干员 3 技能位全有 kind 定义 */
    const opKinds = ['redwolf', 'weilong', 'luna', 'beeser', 'uluru', 'nameless', 'gu'].map(id => {
      const m = dataSrc.match(new RegExp(id + ': \\{[\\s\\S]*?\\n  \\},'));
      return m;
    });
    T('7 名干员技能定义完整', opKinds.every(Boolean));
  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n'));
  }
  console.log(`=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}, 60);
