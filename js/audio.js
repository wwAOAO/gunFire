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
};
