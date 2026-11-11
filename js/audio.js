"use strict";

/* js/audio.js —— 音频合成（依赖 data.js 的工具与设置）。 */

/* ══════════════════════════════════════════════════════════
   3. 音频合成
   ══════════════════════════════════════════════════════════ */
/* ── 设置读取：音量 / 震动 / 粒子 / 准星 / 小地图 ──
   SAVE 要到 GEAR 表之后才初始化，这里一律 typeof 兜底，避免加载期踩 TDZ。 */
function settingNum(k, def, lo, hi) {
  const s = (typeof SAVE !== 'undefined' && SAVE.settings) ? SAVE.settings : null;
  const v = s && typeof s[k] === 'number' ? s[k] : def;
  return clamp(v, lo === undefined ? 0 : lo, hi === undefined ? 100 : hi);
}
function sfxVol() { return settingNum('vol', 70) / 100 * 0.5; }   // 满档 0.5（原来写死 0.3）
function shakeMul() { return settingNum('shake', 100) / 100; }
function fxRate() { return settingNum('fx', 100) / 100; }
function aimColor() {
  const s = (typeof SAVE !== 'undefined' && SAVE.settings) ? SAVE.settings : null;
  return (s && typeof s.aim === 'string' && /^#[0-9a-f]{6}$/i.test(s.aim)) ? s.aim : '#b4e6ff';
}
function applySettings() {
  if (typeof Sfx !== 'undefined' && Sfx && Sfx.master) Sfx.master.gain.value = sfxVol();
}

const Sfx = {
  ready: false,
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = sfxVol();
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.ready = true;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  noiseBurst(dur, freq, q, vol, type) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = rand(0.85, 1.15);
    const f = c.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  tone(freq, dur, vol, type, slideTo) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  shoot(kind) {
    switch (kind) {
      case 'pistol':  this.noiseBurst(0.10, 1600, 1.2, 0.30); this.tone(190, 0.08, 0.16, 'square', 70); break;
      case 'g18':     this.noiseBurst(0.05, 2500, 1.4, 0.17); this.tone(330, 0.04, 0.06, 'square', 150); break;
      case '93r':     this.noiseBurst(0.06, 2400, 1.3, 0.20); this.tone(300, 0.05, 0.09, 'square', 120); break;
      case 'dmr':     this.noiseBurst(0.16, 2800, 1.5, 0.30); this.tone(230, 0.12, 0.16, 'square', 70); break;
      case 'smg':     this.noiseBurst(0.07, 2200, 1.0, 0.20); this.tone(240, 0.05, 0.10, 'square', 120); break;
      case 'shotgun': this.noiseBurst(0.26, 900, 0.8, 0.42);  this.tone(110, 0.20, 0.26, 'sawtooth', 42); break;
      case 'rifle':   this.noiseBurst(0.14, 3000, 1.4, 0.28); this.tone(320, 0.09, 0.14, 'square', 90); break;
      /* 7.62×39：比 5.56 闷一档，尾巴长一点 —— AKM 一响就知道是谁在打 */
      case 'ak':      this.noiseBurst(0.19, 2100, 1.2, 0.34); this.tone(200, 0.13, 0.18, 'square', 62); break;
      /* 机枪：比步枪更闷更沉的连发，枪管大一声 */
      case 'lmg':     this.noiseBurst(0.18, 1800, 1.3, 0.38); this.tone(150, 0.12, 0.20, 'square', 55); break;
      case 'sniper':  this.noiseBurst(0.40, 2600, 1.6, 0.50); this.tone(150, 0.30, 0.30, 'sawtooth', 38); break;
       case 'enemy':   this.noiseBurst(0.09, 900, 1.0, 0.10);  this.tone(150, 0.07, 0.06, 'sawtooth', 80); break;
      case 'tap':     this.noiseBurst(0.05, 1700, 1.2, 0.055); this.tone(215, 0.04, 0.045, 'square', 120); break;
      case 'hmg':     this.noiseBurst(0.10, 1100, 0.85, 0.20); this.tone(88, 0.07, 0.12, 'square', 52); break;
    }
  },
  hit()     { this.noiseBurst(0.07, 2600, 1.6, 0.13); },
  hitKill() { this.tone(1180, 0.08, 0.10, 'triangle', 720); },
  explode() { this.noiseBurst(0.55, 420, 0.7, 0.45); this.tone(70, 0.42, 0.30, 'sawtooth', 26); },
  hurt()    { this.tone(160, 0.22, 0.24, 'sawtooth', 55); this.noiseBurst(0.18, 600, 1.0, 0.14); },
  pickup()  { this.tone(620, 0.10, 0.13, 'triangle'); setTimeout(() => this.tone(980, 0.12, 0.11, 'triangle'), 65); },
  reload_() { this.tone(320, 0.05, 0.07, 'square'); setTimeout(() => this.tone(220, 0.06, 0.07, 'square'), 110); },
  dash()    { this.noiseBurst(0.22, 2400, 0.9, 0.14, 'bandpass'); },
  breath()  { this.noiseBurst(0.42, 780, 0.8, 0.09, 'bandpass'); },      // 体力见底：一口粗气
  loot()    { this.tone(780, 0.09, 0.12, 'triangle'); setTimeout(() => this.tone(1170, 0.14, 0.10, 'triangle'), 70); },
  extract() { this.tone(392, 0.3, 0.16, 'sine'); setTimeout(() => this.tone(523, 0.3, 0.16, 'sine'), 180); setTimeout(() => this.tone(784, 0.7, 0.16, 'sine'), 360); },
  death()   { this.tone(220, 1.2, 0.25, 'sawtooth', 40); this.noiseBurst(0.9, 500, 0.7, 0.2); },
  heal()    { this.tone(500, 0.12, 0.10, 'sine', 760); },
  meleeWind() { this.tone(760, 0.09, 0.055, 'triangle', 1240); },                      // 抬手：短促上扬，提示要挨刀
  meleeHit()  { this.noiseBurst(0.15, 1500, 1.1, 0.26); this.tone(120, 0.14, 0.20, 'square', 58); },
  meleeMiss() { this.noiseBurst(0.13, 2300, 0.9, 0.10, 'bandpass'); },
  adsIn()   { this.tone(880, 0.05, 0.05, 'square', 1320); },                           // 抬枪：轻脆一声
  adsOut()  { this.tone(560, 0.05, 0.035, 'square', 360); },                           // 落枪

  /* ── 干员技能音效：kind = 技能 kind（OPERATORS.g/v/x 的 kind 字段）──
     全部由 tone / noiseBurst 合成，每种技能一条音色轮廓：
     投掷物「拉栓一声脆 + 出手呼啸」，大招「上电 / 起转」的机械感，
     电箭弦震带电火花、侦察箭带声纳回波。开技能时都有声，不只命中才有。 */
  skill(kind) {
    if (!this.ready) return;
    const T = (f, d, v, ty, s) => this.tone(f, d, v, ty, s);
    const N = (d, f, q, v, ty) => this.noiseBurst(d, f, q, v, ty);
    switch (kind) {
      /* 投掷物：拉栓脆响 + 罐体出手呼啸 */
      case 'smoke': case 'frag':
        T(2400, 0.04, 0.06, 'square');
        setTimeout(() => N(0.18, 1800, 0.8, 0.09, 'bandpass'), 30);
        break;
      /* 蜂巢烟：拉栓 + 蜂鸣底噪 */
      case 'beesmoke':
        T(2400, 0.04, 0.06, 'square');
        T(180, 0.5, 0.045, 'sawtooth', 140);
        N(0.5, 320, 0.5, 0.05, 'lowpass');
        break;
      /* 磁吸弹：上电双哔 + 呼啸 */
      case 'magbomb':
        T(1400, 0.07, 0.06, 'sine', 700);
        setTimeout(() => T(1400, 0.07, 0.05, 'sine', 700), 90);
        N(0.16, 1600, 0.9, 0.08, 'bandpass');
        break;
      /* 闪光弹：弹壳 pop + 高频亮环（听感上「白」） */
      case 'flash':
        T(320, 0.05, 0.08, 'square', 90);
        setTimeout(() => T(3400, 0.4, 0.05, 'sine', 2900), 40);
        break;
      /* 毒雾：阀门泄气 + 低频翻涌 */
      case 'gas':
        N(0.55, 900, 0.4, 0.10, 'bandpass');
        T(120, 0.4, 0.05, 'sawtooth', 60);
        break;
      /* 燃烧弹：出手呼啸 + 落地前引燃的低频噼啪 */
      case 'firebomb':
        N(0.3, 1400, 0.7, 0.10, 'bandpass');
        setTimeout(() => N(0.5, 500, 0.6, 0.08, 'lowpass'), 80);
        break;
      /* 外骨骼：伺服上电（低频爬升 + 气路 + 上线哔） */
      case 'exo':
        T(140, 0.5, 0.09, 'square', 480);
        N(0.45, 1200, 0.5, 0.07, 'bandpass');
        setTimeout(() => T(520, 0.12, 0.07, 'square', 980), 320);
        break;
      /* 动力推进：喷气比过门重一档，带推进器低鸣 */
      case 'dash':
        N(0.32, 2200, 0.6, 0.16, 'bandpass');
        T(90, 0.3, 0.10, 'sawtooth', 42);
        break;
      /* 虎蹲炮：压缩空气炮——闷砰 + 气浪嘶 */
      case 'shock':
        T(70, 0.25, 0.20, 'sawtooth', 30);
        N(0.28, 1100, 0.6, 0.18, 'bandpass');
        break;
      /* 电箭：弦震 + 电火花 */
      case 'shockbow':
        T(880, 0.08, 0.07, 'triangle', 300);
        setTimeout(() => { T(1900, 0.16, 0.05, 'square', 640); N(0.2, 3400, 2.2, 0.05, 'bandpass'); }, 40);
        break;
      /* 侦察箭：弦震 + 声纳回波两跳 */
      case 'scanbow':
        T(880, 0.08, 0.07, 'triangle', 300);
        setTimeout(() => T(660, 0.5, 0.06, 'sine', 1180), 60);
        setTimeout(() => T(990, 0.4, 0.04, 'sine', 1480), 240);
        break;
      /* 无人机：旋翼起转 */
      case 'drone':
        T(190, 0.5, 0.06, 'sawtooth', 330);
        N(0.4, 700, 1.2, 0.05, 'bandpass');
        break;
      /* 激素针：软气声 + 上扬轻音 */
      case 'healgun':
        N(0.14, 2400, 1.6, 0.06, 'bandpass');
        setTimeout(() => T(700, 0.16, 0.06, 'sine', 1120), 50);
        break;
      /* 速凝掩体：高压喷注 */
      case 'coverdev':
        N(0.35, 1500, 0.7, 0.10, 'bandpass');
        T(300, 0.2, 0.06, 'square', 640);
        break;
      /* 旋刃：高速旋转甩出的啸声 */
      case 'blade':
        T(420, 0.35, 0.07, 'sawtooth', 1500);
        N(0.25, 2800, 1.8, 0.05, 'bandpass');
        break;
      /* 巡飞弹：发射闷响 + 电机嗡鸣起转 */
      case 'loiter':
        T(120, 0.2, 0.14, 'square', 60);
        setTimeout(() => T(150, 0.7, 0.05, 'sawtooth', 260), 60);
        break;
    }
  },

  /* ── 3D 脚步：敌人方位声 ──
     pan：-1 左耳 / +1 右耳（以玩家准星朝向为「正前」算出来的声像）；
     behind：身后的脚步套低通把高频闷掉 —— 戴上耳机就能听出「这人在我后面」；
     heavy：重甲敌人（ brute / boss ）降转速，声音又沉又慢。 */
  step3d(pan, vol, behind, heavy) {
    if (!this.ready || vol <= 0.004) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = heavy ? rand(0.42, 0.55) : rand(0.85, 1.15);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = behind ? 420 : (heavy ? 720 : 1000);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan || 0, -1, 1);
      src.connect(f); f.connect(p); p.connect(g);
    } else {                                       // 老浏览器没有声像节点：退化为单声道
      src.connect(f); f.connect(g);
    }
    g.connect(this.master);
    src.start(t); src.stop(t + 0.11);
  },
};
