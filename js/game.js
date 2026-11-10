"use strict";

/* js/game.js —— 输入、全局状态、世界生成、地图文件层、玩家、敌人、子弹、搜刮、相机（依赖 data.js / audio.js 与 maps/builtin-maps.js）。 */

/* ══════════════════════════════════════════════════════════
   4. 输入
   ══════════════════════════════════════════════════════════ */
const keys = Object.create(null);
const mouse = { x: VW / 2, y: VH / 2, wx: 0, wy: 0, down: false, pressed: false, right: false };

/* 治疗物品选择器：按 5 不立刻动作 —— 松手那一刻再判断是短按（用）还是长按（选）。
   hold 累计按住时长，open 表示选择盘已经弹出，wheel 是滚轮攒下的步数。 */
const MED_SEL = { down: false, hold: 0, open: false, idx: 0, wheel: 0, list: [] };
const MED_HOLD_T = 0.34;   // 按住超过这个时长就算长按

/* 磁吸炸弹的投掷预瞄：按住 G 时按鼠标离人多远选落点，松手才扔。
   短按（< 0.28s）不预瞄，直接按上次的距离扔。 */
const MAG_AIM = { down: false, hold: 0, on: false };
const MAG_HOLD_T = 0.28;

/* 无人机 / 激素枪的「点按 / 长按」判定 */
const HOLDV = { down: false, hold: 0 };
const HOLDX = { down: false, hold: 0, fired: false };
const HOLD_T = 0.30;

/* 手持模式的文案：HUD 底部那行提示 */
const MODE_KEY = {
  frag:     { k: 'G', text: '左键按住点引信 · 松手投出 · 右键抛出 · 再按 G 收起' },
  firebomb: { k: 'G', text: '左键投掷 · 右键抛出 · 再按 G 收起' },
  shockbow: { k: 'V', text: '左键射箭 · 右键切换反弹 · 再按 V 收弓' },
  scanbow:  { k: 'X', text: '左键射出侦察箭 · 再按 X 收弓' },
  coverdev: { k: 'V', text: '左键放置掩体 · 右键切换横 / 竖 · 再按 V 收起' },
  drone:    { k: 'V', text: 'WASD 操控无人机 · 再按 V 收回' },
  healgun:  { k: 'X', text: '左键注射 · 右键瞄准 · 长按 X 自用 · 再按 X 收起' },
  loiter:   { k: 'X', text: '左键发射 · 右键瞄准后手控制导 · 再按 X 收起' },
  gl:       { k: 'V', text: '左键射出三联 · 到点惯性滑行 · 3 秒后引爆 · 再按 V 收起' },
};

/* 这个技能是不是「拿出来用」的类型（点一下键只是把东西拿到手上） */
const MODE_SKILL = {
  frag: 1, firebomb: 1, shockbow: 1, scanbow: 1, coverdev: 1, healgun: 1, loiter: 1, gl: 1,
};

function modeOn() { return !!(P.op && P.op.mode); }

function enterMode(id, k) {
  if (!P.op) return;
  P.op.mode = { id, k, t: 0, lit: false, fuse: 0, bounce: false, vert: false, aimR: 0, prevDown: false };
  P.sprinting = false;
  P.ads = 0;
  if (id === 'frag') popup(P.x, P.y - 48, '破 片 雷 就 位', '#bff3c9', 12);
  else if (id === 'firebomb') popup(P.x, P.y - 48, '燃 烧 弹 就 位', '#ffc98a', 12);
  else if (id === 'shockbow') popup(P.x, P.y - 48, '电 箭 上 弦', '#bff3c9', 12);
  else if (id === 'scanbow') popup(P.x, P.y - 48, '侦 察 弓', '#9ef7c8', 12);
  else if (id === 'coverdev') popup(P.x, P.y - 48, '速 凝 装 置', '#ffc98a', 12);
  else if (id === 'healgun') popup(P.x, P.y - 48, '激 素 枪', '#8dffc0', 12);
  else if (id === 'loiter') popup(P.x, P.y - 48, '巡 飞 弹 发 射 器', '#ffc98a', 12);
  else if (id === 'gl') popup(P.x, P.y - 48, '三 头 犬 就 位', '#ffd66b', 12);
  Sfx.adsIn();
}

function exitMode(silent) {
  if (!P.op || !P.op.mode) return;
  const id = P.op.mode.id;
  P.op.mode = null;
  if (id === 'drone') G.drones.length = 0;      // 收回无人机：烟迹留在原地
  if (id === 'loiter') {                        // 松开遥控 = 引爆
    const m = ctlLoiter();
    if (m) {
      loiterBlast(m.x, m.y, true);
      const k = G.loiters.indexOf(m);
      if (k >= 0) G.loiters.splice(k, 1);
    }
  }
  if (!silent) Sfx.adsOut();
}

/* 手上这件东西还剩几层储备 / 冷却好没好 */
function modeAvailable(k) {
  const op = opDef();
  if (!op || !P.op) return false;
  const S = P.op[k], def = op[k];
  if (!def) return false;
  if (def.kind === 'healgun') {
    if (S.use <= 0) { uiToast('激素枪充能中 · ' + Math.ceil(S.recharge) + 's', 'small'); return false; }
    return true;
  }
  if (S.cd > 0) {
    uiToast(def.short + (def.tag === '大招' ? '冷却 ' + Math.ceil(S.cd) + 's' : '装填中'), 'small');
    return false;
  }
  if (S.use <= 0) { uiToast(def.short + '回充中 · ' + Math.ceil(S.recharge) + 's', 'small'); return false; }
  return true;
}

/* 真正扣掉一层储备（拿出来不扣，用掉才扣） */
function consumeOp(k) {
  const op = opDef();
  if (!op || !P.op) return;
  const S = P.op[k], def = op[k];
  S.use--;
  S.cd = 0.55;                                  // 出弹间隔：防连按双发
  /* 回充间隔：每层按自己的冷却算；激素枪没有大 CD，cd 字段就是「每发 30 秒」 */
  const cap = def.charges || 1;
  const gap = Math.max(0.5, def.cd || 0);
  if (S.use < cap && S.recharge <= 0) S.recharge = gap;
}

function magAimDist() { return Math.hypot(mouse.wx - P.x, mouse.wy - P.y); }

function skillGDown() {
  if (G.scene !== 'playing') return;
  const op = opDef();
  if (!op || !P.alive) return;
  if (P.medOn) { uiToast('正在处理伤口 · 右键先收手', 'small'); return; }

  /* 已经在手持模式里：再按一次对应的键就收起来 */
  if (modeOn()) {
    if (P.op.mode.k === 'g') { exitMode(); }
    return;
  }

  if (op.g.kind === 'magbomb') {
    MAG_AIM.down = true; MAG_AIM.hold = 0; MAG_AIM.on = false;
    return;
  }
  if (MODE_SKILL[op.g.kind]) {
    if (!modeAvailable('g')) return;
    enterMode(op.g.kind, 'g');
    return;
  }
  useTactic();
}

function skillGUp() {
  if (MAG_AIM.down) {
    const held = MAG_AIM.hold;
    MAG_AIM.down = false; MAG_AIM.on = false; MAG_AIM.hold = 0;
    if (G.scene !== 'playing') return;
    const op = opDef();
    if (op && op.g.kind === 'magbomb') useTactic(held >= MAG_HOLD_T ? magAimDist() : null);
  }
}

/* ── V 键：点按 / 长按分流（无人机） ── */
function skillVDown() {
  if (G.scene !== 'playing') return;
  const op = opDef();
  if (!op || !P.alive) return;
  if (P.medOn) { uiToast('正在处理伤口 · 右键先收手', 'small'); return; }

  if (modeOn()) {
    if (P.op.mode.k === 'v') exitMode();
    return;
  }
  if (op.v.kind === 'drone') {
    if (!modeAvailable('v')) return;
    HOLDV.down = true; HOLDV.hold = 0;
    return;
  }
  /* 无名：按住 = 进入锁定（锁定中一直看得见目标框），松手才发射 */
  if (op.v.kind === 'blade') {
    if (!modeAvailable('v')) return;
    HOLDV.down = true; HOLDV.hold = 0;
    BLADE_LOCK.on = true; BLADE_LOCK.prog = 0; BLADE_LOCK.target = null;
    BLADE_LOCK.behind = false; BLADE_LOCK.t = 0;
    return;
  }
  if (MODE_SKILL[op.v.kind]) {
    if (!modeAvailable('v')) return;
    enterMode(op.v.kind, 'v');
    return;
  }
  useSkill();
}

function skillVUp() {
  if (!HOLDV.down) return;
  const held = HOLDV.hold;
  HOLDV.down = false; HOLDV.hold = 0;
  if (G.scene !== 'playing') { BLADE_LOCK.on = false; return; }
  const op = opDef();
  if (!op) return;
  /* 无名：锁定满 → 追踪弹；没锁上（或只是轻点）→ 直掷弹 */
  if (op.v.kind === 'blade') {
    const tgt = BLADE_LOCK.target;
    const locked = !!(tgt && tgt.alive && BLADE_LOCK.prog >= 1);
    fireBlade(locked ? tgt : null);
    consumeOp('v');
    BLADE_LOCK.on = false;
    return;
  }
  if (op.v.kind !== 'drone') return;
  if (held >= HOLD_T) startDrone();
  else layLineSmoke();
}

/* ── X 键：点按切枪 / 长按给自己一针 ── */
function skillXDown() {
  if (G.scene !== 'playing') return;
  const op = opDef();
  if (!op || !P.alive) return;
  if (P.medOn) { uiToast('正在处理伤口 · 右键先收手', 'small'); return; }

  if (modeOn()) {
    if (P.op.mode.k === 'x') exitMode();
    return;
  }
  if (op.x.kind === 'healgun') {
    HOLDX.down = true; HOLDX.hold = 0; HOLDX.fired = false;
    return;
  }
  if (MODE_SKILL[op.x.kind]) {
    if (!modeAvailable('x')) return;
    enterMode(op.x.kind, 'x');
    return;
  }
  useUlt();
}

function skillXUp() {
  if (!HOLDX.down) return;          // 长按到点已在按住时自用过：松手无事发生
  const held = HOLDX.hold;
  HOLDX.down = false; HOLDX.hold = 0;
  if (G.scene !== 'playing') return;
  const op = opDef();
  if (!op || op.x.kind !== 'healgun') return;

  if (held >= HOLD_T) healSelfShot();
  else if (modeAvailable('x')) enterMode('healgun', 'x');
}

/* 按住计时：长按 X 满 0.3s 立即自用（不用等松手），V 继续由松手判定 */
function updateSkillHold(dt) {
  if (HOLDV.down) HOLDV.hold += dt;
  if (HOLDX.down) {
    HOLDX.hold += dt;
    if (HOLDX.hold >= HOLD_T) {
      HOLDX.down = false; HOLDX.hold = 0; HOLDX.fired = true;
      const op2 = opDef();
      if (G.scene === 'playing' && op2 && op2.x.kind === 'healgun' && modeAvailable('x')) healSelfShot();
      else HOLDX.fired = false;
    }
  }
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();

  if (k === 'escape') {
    keys[k] = true;
    if (G.modWin) closeModWin();                   // 改装窗最先收
    else if (!$('settings').classList.contains('hidden')) closeSettings();   // 设置叠在所有东西上面
    else if (BIGMAP.open) BIGMAP.open = false;     // 战术地图开着：先关地图，再考虑暂停
    else if (G.packOpen) closePackPanel();
    else if (G.scene === 'playing' && G.lootPanel) closeLootPanel();
    else if (G.scene === 'playing') pauseRaid();
    else if (G.scene === 'paused') resumeRaid();
    else if (G.scene === 'lobby' && !$('loadout').classList.contains('hidden')) closeLoadout();
    else if (G.scene === 'lobby' && !$('maps').classList.contains('hidden')) closeMaps();
    else if (G.scene === 'lobby' && !$('ach').classList.contains('hidden')) closeAchievements();
    else if (G.scene === 'lobby' && !$('contracts').classList.contains('hidden')) closeContracts();
    else if (G.scene === 'lobby' && !$('codex').classList.contains('hidden')) closeCodex();
  }
  /* Tab：开着就关；没开且在局内才打开 */
  if (k === 'tab' && !e.repeat) {
    e.preventDefault();
    keys['tab'] = true;
    if (G.packOpen) closePackPanel();
    else if (G.lootPanel) closeLootPanel();        // 搜刮面板开着：Tab 先关它，别直接弹背包
    else if (G.scene === 'playing') openPackPanel();
    return;
  }
  /* M：战术地图开关（局内专用）。背包 / 搜刮面板开着也能看，地图画在最上层 */
  if (k === 'm' && !e.repeat && G.scene === 'playing') {
    BIGMAP.open = !BIGMAP.open;
    return;
  }
  /* 背包开着：时间在走、世界在动，但局内按键全封（移动/换弹/技能），防止背着面板瞎走 */
  if (G.packOpen) return;
  if (G.scene !== 'playing') return;
  keys[k] = true;
  /* 倒地：F 是长按自救（在 updateDowned 里读 keys），其他交互 / 技能 / 开火全部封死 */
  if (isDowned()) return;
  if (k === 'f' && !e.repeat) searchInteract();   // 点一下开箱，不用长按
  if (k === 'e' && !e.repeat) switchInteract();   // E：拉总闸 / 丢包丢背包
  if (k === 'h' && !e.repeat) searchKeyH();        // H：搜弹挂 / 背包；周围掉落叠着时开「地面物资」面板选中拾取
  if (k === 'r') startReload();
/* 干员技能：G 战术道具 / V 小技能 / X 大招 / C 被动滑铲 */
  if (k === 'g' && !e.repeat) skillGDown();
  if (k === 'v' && !e.repeat) skillVDown();
  if (k === 'x' && !e.repeat) skillXDown();
  if (k === 'c' && !e.repeat) trySlide();
  if (k === '5') { if (!e.repeat) medPressDown(); return; }
  if (k >= '1' && k <= '4' && !e.repeat) {
    const sd = SLOT_DEFS[+k - 1];
    if (sd) equipSlot(sd.id);
  }
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === 'g') skillGUp();
  if (k === 'v') skillVUp();
  if (k === 'x') skillXUp();
  if (k !== '5') return;
  if (G.scene === 'playing') medPressUp();
  else { MED_SEL.down = false; MED_SEL.open = false; }
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouse.down = false; mouse.right = false;
  MED_SEL.down = false; MED_SEL.open = false;
  MAG_AIM.down = false; MAG_AIM.on = false; MAG_AIM.hold = 0;
  HOLDV.down = false; HOLDV.hold = 0;
  HOLDX.down = false; HOLDX.hold = 0;
  if (G.packOpen) closePackPanel();
});

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
  if (e.button === 2) {
    mouse.right = true;                              // 右键 = 开镜
    /* 手上是药的时候右键不开镜，改成"收手"：读条 / 回血都能随时掐掉 */
    if (G.scene === 'playing' && P.medOn) endCareBack('已收手');
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.down = false;
  if (e.button === 2) mouse.right = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (G.scene !== 'playing') return;
  if (G.lootPanel) { lootSelMove(e.deltaY > 0 ? 1 : -1); return; }          // 开箱面板：滚轮挑东西
  if (MED_SEL.open) { MED_SEL.wheel += (e.deltaY > 0 ? 1 : -1); return; }   // 选药时滚轮挑型号
  cycleSlot(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

/* ══════════════════════════════════════════════════════════
   5. 全局状态
   ══════════════════════════════════════════════════════════ */
const G = {
  scene: 'lobby',
  tier: 'standard',   // 'standard' | 'secret'（机密模式：敌人更硬、战利品更好）
  time: 0,
  raidTime: 0,
  score: 0,
  combo: 0,
  comboTimer: 0,
  kills: 0,
  blinds: 0,        // 本局致盲敌人的次数（闪光 / 毒雾）—— 成就用
  swarmHits: 0,     // 本局流荧集群缠住敌人的次数
  bleedHits: 0,     // 本局让敌人流血的次数
  silentKills: 0,   // 本局静默潜袭期间击杀数
  lootValue: 0,    // 携带收集品的估值（不直接进账户）
  relics: [],      // 局内捡到的收集品：[{ id, n }]
  foundMods: [],   // 局内捡到的配件 id（撤离成功才进配件库）
  extractsFound: 0,
  reinforceT: 90,
  enemyCap: 42,      // 场上存活敌人上限：随开局驻军规模在 startRaid 里重设（大地图驻军多，闸门不能写死 42）
  reinforceWave: 0,
  alarm: 0,        // 全局警戒度 0..1
  callCd: 0,       // 「呼叫增援」冷却
  nests: [],       // 固定刷怪点位
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  searchTarget: null,
  lootPanel: null,     // 开箱中的战利品面板
  packOpen: false,     // Tab 背包面板开着（时间继续流动，被打会强制退出）
  extractT: 0,
  extractHold: 6,
  inExtract: null,
  cam: { x: 0, y: 0 },
  obstacles: [],
  bullets: [],
  enemies: [],
  particles: [],
  pickups: [],
  decals: [],
  popups: [],
  crates: [],
  extracts: [],
  nades: [],
  fires: [],        // 燃烧瓶火场
  molotovs: [],     // 飞行中的燃烧瓶
  rockets: [],      // 敌方火箭弹
  icebolts: [],     // 敌方冰弹（冰冻军团·投射兵）
  icepots: [],      // 敌方霜瓶（冰冻军团·投掷兵）在飞的那几只
  frosts: [],       // 冰弹 / 霜瓶 / 冷雾炸开后留下的霜区
  smokes: [],       // 干员烟雾弹留下的烟幕（挡敌人视线）
  gls: [],          // 玩家三联装手炮的榴弹（会弹墙）
  magbombs: [],     // 威龙的磁吸炸弹（飞行 / 吸附 / 倒计时）
  shocks: [],       // 威龙虎蹲炮的压缩空气弹（会弹墙）
  frags: [],        // 露娜的破片手雷（引信在飞 / 在手上烧）
  flashes: [],      // 无名的突破型闪光弹（飞行 / 撞墙倒计时）
  blades: [],       // 无名的旋刃飞行器（直掷 / 锁定追踪）
  footprints: [],   // 玩家的脚印（静默潜袭期间不落）
  flashBlind: 0,    // 玩家被闪光闪到的强度（0..1，屏幕白屏遮罩用）
  hitmark: null,    // 命中确认：{ at: 到期时间, kind: 'hit'|'armor'|'kill' }
  mists: [],        // 蛊的致盲毒雾烟区（不挡视线，只让人瞎）
  gasbombs: [],     // 蛊的瓦斯弹（飞行体，落地 / 撞墙炸开成雾）
  gasT: 0,          // 玩家在毒雾里累计待了多久（满 0.75s 才致盲）
  gasBlind: 0,      // 玩家中毒的屏幕遮蔽强度（0..1，绿色遮罩）
  adrFields: [],    // 蛊的肾上腺素增益无人机（圈内加 buff）
  swarms: [],       // 蛊的流荧集群（自动寻路无人机群）
  arrows: [],       // 露娜的电击箭 / 侦察箭
  ezones: [],       // 电击箭落地的电圈
  scanPings: [],    // 侦察箭落地的侦察视野（无遮挡开雾）
  healFields: [],   // 蜂医染出来的绿色治疗场
  drones: [],       // 蜂医的烟幕无人机
  covers: [],       // 乌鲁鲁的速凝掩体（同时挂在 obstacles 里挡人挡弹）
  loiters: [],      // 乌鲁鲁的巡飞弹（含分裂出来的子炸弹）
  units: [],        // 地图里布置的敌人（兵种 + 驻地）
  bossSpawned: false, // 本局是否已有 BOSS（避免增援重复刷）
  bossZone: null,     // BOSS 驻守区（地图字段）：有值时赤霄只在矩形内活动，增援也回这里
  bossBarBottom: false, // BOSS 血条是否临时挪到屏幕底部
  directorMarkT: 0,   // 安全总监标记干员位置的剩余秒数（>0 时全哈夫克共享你的位置）
  toasts: [],
  spawns: [{ x: 1500, y: 1100 }], // 全部出生点（来自地图文件，每局随机挑一个）
  spawn: { x: 1500, y: 1100 },    // 本局实际使用的出生点
  lastSpawnIdx: -1,               // 上一局用的出生点序号，避免连续重复
  squad: [],                     // 初始守军（来自地图文件）
  customMap: null,               // 已载入的自定义地图
  mapName: '随机生成',
};

const P = {
  x: 0, y: 0, r: 16,
  vx: 0, vy: 0,                 // 本帧速度，仅供敌方预判瞄准用
  hp: 100, maxHp: 100,
  speed: 165,                   // 走路基础速度（配合 0.85 相机缩放：屏幕速度再降 15%）
  stamina: 100,                 // 体力：跑步消耗，不跑才回
  sprinting: false,             // 这一帧是否在跑
  sprintLatch: false,           // 跑步姿态锁存：移动中按过 Shift 就一直跑，停下来才解除
  exhaust: 0,                   // 力竭锁定剩余时间
  armorLoad: 0,                 // 当前护甲的负重（影响走速与体力消耗）
  /* 干员技能运行时：g/v 各自 {cd,use}（use = 本局剩余储备），x = {cd,on,t}，
     volley 是三连发的排程，slide/slideA 是滑铲的剩余时间与方向 */
  op: null,
  downed: 0,                    // 蜂医被动：>0 = 倒地中（要长按 F 自救，或被打死）
  downHp: 0,                    // 倒地血条：100 点，无护甲减伤，扣光直接阵亡
  downRev: 0,                   // 长按 F 自救已累计的秒数
  regenT: 0,                    // 激素针的后续回血剩余时间
  concuss: 0,                   // 被自己的榴弹震到：眩晕，重影 + 不能开镜
  aim: 0,
  fireCd: 0,
  reloading: 0,
  invuln: 0,
  hurtFlash: 0,
  weapon: null,                 // 当前手持的那把枪（切到刀/医疗时保留上次的枪；一把枪都没有时是 null）
  curSlot: 'melee',             // primary / secondary / melee / pistol / medkit
  slots: { primary: null, secondary: null, pistol: null },
  melee: STARTER_MELEE,
  meleeCd: 0,
  swingT: 0,                    // 挥击动画剩余时间
  swingAim: 0,                  // 挥击时的朝向
  swingHit: 0,                  // 本次挥击命中人数（>0 就画命中特效）
  owned: {},                    // 本局可用的枪（从仓库带进来的）
  gunLoot: {},                  // 局内缴获的同款枪计数：撤离时 SAVE.owned 各 +n
  gearLoot: {},                 // 局内捡到的弹挂 / 背包计数：撤离时 SAVE.gearOwned 各 +n
  ammo: {},
  walkPhase: 0,
  recoil: 0,
  muzzle: 0,
  ads: 0,          // 开镜进度 0 腰射 → 1 完全开镜
  adsPrev: 0,
  alive: true,
  armorDR: 0,
  armorId: 0,         // 身上这件的目录编号（ARMORS 下标，0 = 裸奔）
  armorLv: 0,         // 身上这件的甲级
  armorName: '',      // 具名甲的名字（HUD / 飘字用）
  armorAim: 0,        // 瞄准惩罚：开火散布 ×(1+aim)
  armorMove: 0,       // 移速惩罚：走速 ×(1-move)
  armorHp: 0,         // 当前耐久：挡弹会磨，磨光就没防护了
  armorMax: 0,        // 耐久上限：修甲会掉上限（恢复 × 损耗率）
  /* 医疗：meds 是这一局随身带的六种包，carePick 是上次用的那种治疗物品（短按 5 走自动阶梯，回血段优先沿用它的剩余耐久）
     key 形如 'med:inject_s' / 'stop:bandage' / 'surg:surg_dek' */
  meds: {},
  stops: {},
  surgs: {},
  carePick: 'med:' + STARTER_MEDKIT,
  medOn: null,        // 正在使用的治疗物品 key，null 表示没在用
  medKind: 'med',     // med / stop / surg —— 决定读条走完干什么
  medWind: 0,         // 启动读条剩余时间（读条期间不回血）
  medWindT: 0,        // 启动段总时长，用来算进度
  medHealT: 0,        // 回血窗口剩余时间（启动段结束后才开始倒数）
  medHealW: 0,        // 回血窗口总时长 = ceil(缺口 / 每秒回血)
  healAcc: 0,         // 累计回血，用来凑一个飘字，别每帧刷屏
  /* 创伤：流血 / 三处贯穿伤 / 手臂与腿部骨折 / 骨裂 / 虚弱 */
  deb: { bleed: 0, redHead: 0, redChest: 0, redAbdomen: 0, arm: 0, leg: 0, fissure: 0, weak: 0 },
  bleedAcc: 0,        // 流血累计掉的血，凑够一点飘个字
  painT: 0,           // 止痛剩余时间（减伤 + 屏蔽部分创伤惩罚）
  chill: 0,           // 冻伤层数：霜区里越久越僵，离开后慢慢化开
  chillTick: 0,
  inFrost: false,     // 本帧是否站在霜区里
  medCd: 0,
  careFrom: null,     // 进医疗槽之前手里拿的是哪个槽 —— 治疗结束换回去
  burnT: 0,        // 被燃烧瓶点燃的剩余时间
  burnTick: 0,     // 灼烧结算节奏
  hurtDir: 0,      // 最近一次受击的来源方向（世界角）
  hurtDirT: 0,     // 受击方向提示的剩余时间
};

/* ══════════════════════════════════════════════════════════
   6. 世界生成
   ══════════════════════════════════════════════════════════ */
function generateWorld() {
  G.obstacles = [];
  const cx = WORLD.w / 2, cy = WORLD.h / 2;

  let tries = 0;
  while (G.obstacles.length < 34 && tries < 900) {
    tries++;
    const w = rand(70, 300);
    const h = rand(70, 300);
    const x = rand(120, WORLD.w - 120 - w);
    const y = rand(120, WORLD.h - 120 - h);

    const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    if (dist(nx, ny, cx, cy) < 300) continue;
    if (x < 60 || y < 60 || x + w > WORLD.w - 60 || y + h > WORLD.h - 60) continue;

    let ok = true;
    for (const o of G.obstacles) {
      if (x < o.x + o.w + 110 && x + w + 110 > o.x && y < o.y + o.h + 110 && y + h + 110 > o.y) { ok = false; break; }
    }
    if (!ok) continue;
    G.obstacles.push({ x, y, w, h, tone: rand(0, 1) });
  }
}

/* 固定刷新点：敌人在这些点位生成并就地巡逻，不会凭空朝玩家搜索 */
function generateNests() {
  G.nests = [];
  const cx = WORLD.w / 2, cy = WORLD.h / 2;
  const cols = 4, rows = 3;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const baseX = 300 + (WORLD.w - 600) * (gx / (cols - 1));
      const baseY = 300 + (WORLD.h - 600) * (gy / (rows - 1));

      let x = baseX, y = baseY;
      for (let t = 0; t < 60; t++) {
        x = baseX + rand(-190, 190);
        y = baseY + rand(-160, 160);
        x = clamp(x, 160, WORLD.w - 160);
        y = clamp(y, 160, WORLD.h - 160);
        if (hitsObstacle(x, y, 46) || pointInObstacle(x, y)) continue;
        // 据点要落在出生点视野之外，玩家落地时不会直接被抓
        if (dist(x, y, cx, cy) < 780) continue;
        break;
      }
      if (dist(x, y, cx, cy) < 780) continue;
      G.nests.push({ x, y });
    }
  }
  // 保底：万一都被挤掉，四周补几个
  if (G.nests.length < 4) {
    G.nests = [
      { x: 340, y: 340 }, { x: WORLD.w - 340, y: 340 },
      { x: 340, y: WORLD.h - 340 }, { x: WORLD.w - 340, y: WORLD.h - 340 },
    ];
  }
}

function nearestNest(x, y) {
  let best = G.nests[0] || { x: WORLD.w / 2, y: WORLD.h / 2 };
  let bd = Infinity;
  for (const n of G.nests) {
    const d = dist2(x, y, n.x, n.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function hitsObstacle(x, y, r) {
  for (const o of G.obstacles) {
    const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
    if (dist2(x, y, nx, ny) < r * r) return true;
  }
  return false;
}

function pointInObstacle(x, y) {
  for (const o of G.obstacles) {
    if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}

function resolveCircleRects(e) {
  let hit = false;
  for (const o of G.obstacles) {
    const nx = clamp(e.x, o.x, o.x + o.w);
    const ny = clamp(e.y, o.y, o.y + o.h);
    const dx = e.x - nx, dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 > e.r * e.r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      e.x = nx + dx / d * e.r;
      e.y = ny + dy / d * e.r;
    } else {
      const l = e.x - o.x, rr = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) e.x = o.x - e.r;
      else if (m === rr) e.x = o.x + o.w + e.r;
      else if (m === t) e.y = o.y - e.r;
      else e.y = o.y + o.h + e.r;
    }
  }
  return hit;
}

function clampWorld(e) {
  e.x = clamp(e.x, e.r, WORLD.w - e.r);
  e.y = clamp(e.y, e.r, WORLD.h - e.r);
}

/* 生成物资容器：六种各按权重抽，保底各来一个，别让整张图只有补给箱 */
function generateCrates() {
  G.crates = [];
  const cx = WORLD.w / 2, cy = WORLD.h / 2;
  const need = Math.min(CONTAINER_IDS.length, 6);
  let tries = 0;
  while (G.crates.length < 18 && tries < 2400) {
    tries++;
    const x = rand(140, WORLD.w - 140);
    const y = rand(140, WORLD.h - 140);
    const kind = G.crates.length < need
      ? CONTAINER_IDS[G.crates.length]                 // 前几箱每种来一个，保证种类齐全
      : pickWeighted(CONTAINER_IDS.map(k => [k, CONTAINERS[k].weight]));
    const C = containerOf(kind);
    if (hitsObstacle(x, y, C.r + 14)) continue;
    if (dist(x, y, cx, cy) < 260) continue;
    let ok = true;
    for (const c of G.crates) if (dist(x, y, c.x, c.y) < 240) { ok = false; break; }
    if (!ok) continue;
    G.crates.push({ x, y, r: C.r, kind, opened: false, phase: rand(0, TAU), hover: 0 });
  }
}

/* 生成撤离点 */
function generateExtracts() {
  G.extracts = [];
  const marginX = 300, marginY = 260;
  for (let i = 0; i < 2; i++) {
    let x = 0, y = 0, ok = false;
    for (let t = 0; t < 80; t++) {
      const side = randInt(0, 3);
      if (side === 0) { x = rand(marginX, WORLD.w - marginX); y = marginY; }
      else if (side === 1) { x = rand(marginX, WORLD.w - marginX); y = WORLD.h - marginY; }
      else if (side === 2) { x = marginX; y = rand(marginY, WORLD.h - marginY); }
      else { x = WORLD.w - marginX; y = rand(marginY, WORLD.h - marginY); }

      if (hitsObstacle(x, y, 130)) continue;
      if (dist(x, y, WORLD.w / 2, WORLD.h / 2) < 800) continue;
      if (G.extracts.some(e => dist(e.x, e.y, x, y) < 1500)) continue;
      ok = true;
      break;
    }
    if (!ok) { x = marginX; y = marginY; }
    /* 第二个撤离点有概率是「付费快速撤离」：3 秒读条、收 ¥1500 —— 烧钱换安全 */
    const paid = i === 1 && Math.random() < 0.55;
    G.extracts.push(paid
      ? { x, y, r: 108, phase: rand(0, TAU), name: i === 0 ? 'A' : 'B', mode: 'paid', cost: 1500, hold: 3 }
      : { x, y, r: 108, phase: rand(0, TAU), name: i === 0 ? 'A' : 'B' });
  }
}

/* ══════════════════════════════════════════════════════════
   6.5 地图文件层
   ──────────────────────────────────────────────────────────
   地图是一个纯 JSON 对象，自带渲染所需的全部数据，
   与 editor.html 共用同一套字段，可以互相导入导出：

     { format:"neonpurge-map", version:1, name, w, h,
       spawns:[{x,y}, ...],        // 可以有多个，每局随机挑一个
       obstacles:[{x,y,w,h}],
       crates:[{x,y}],
       extracts:[{x,y,name}],
       nests:[{x,y}],
       units:[{x,y,type}, ...],    // 兵种布点：type 为 runner/shooter/brute/boss
       squad:['runner','shooter',...] }   // 旧字段，没有 units 时按它铺守军
   ══════════════════════════════════════════════════════════ */
const MAP_KEY = 'neonpurge_map_v1';
const MAP_FORMAT = 'neonpurge-map';
const MAP_VERSION = 1;

const WORLD_DEFAULT = { w: 3000, h: 2200 };
/* 默认守军：小兵多、盾兵少、机枪兵更少（机枪兵太耐打，排多了会拖节奏） */
/* 单出生点 / 随机地图的默认守军：14 人，四种新兵各放一两个，别一上来就满编 */
const DEFAULT_SQUAD = ['runner', 'runner', 'shooter', 'runner', 'brute', 'runner',
                       'shooter', 'sniper', 'runner', 'rocket', 'brute', 'flamer',
                       'shooter', 'runner', 'cryo', 'cryoT', 'cryoS', 'nader'];

const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

function emptyMapData() {
  return {
    format: MAP_FORMAT, version: MAP_VERSION, name: '未命名地图',
    w: WORLD_DEFAULT.w, h: WORLD_DEFAULT.h,
    spawns: [{ x: WORLD_DEFAULT.w / 2, y: WORLD_DEFAULT.h / 2 }],
    obstacles: [], crates: [], extracts: [], nests: [],
    units: [],
    squad: DEFAULT_SQUAD.slice(),
  };
}

/* 某个半径内是否完全落在空地上 */
function mapFree(x, y, r, obstacles, w, h) {
  if (x < r || y < r || x > w - r || y > h - r) return false;
  for (const o of obstacles) {
    const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}

/* 落到墙里时，向外找最近的空地 */
function nudgeFree(x, y, r, obstacles, w, h) {
  if (mapFree(x, y, r, obstacles, w, h)) return { x, y, moved: false };
  for (let rad = 30; rad <= 1200; rad += 30) {
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      const nx = clamp(x + Math.cos(a) * rad, r, w - r);
      const ny = clamp(y + Math.sin(a) * rad, r, h - r);
      if (mapFree(nx, ny, r, obstacles, w, h)) {
        return { x: Math.round(nx), y: Math.round(ny), moved: true };
      }
    }
  }
  return { x: Math.round(clamp(x, r, w - r)), y: Math.round(clamp(y, r, h - r)), moved: true };
}

/* 校验并规整一份地图数据：越界会夹紧，压墙会挪开，缺撤离点直接拒绝 */
function normalizeMap(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['文件内容不是合法的地图对象'], warnings, map: null };
  }
  if (raw.format && raw.format !== MAP_FORMAT) warnings.push('格式标记不是 ' + MAP_FORMAT + '，仍尝试载入');

  const w = clamp(Math.round(numOr(raw.w, WORLD_DEFAULT.w)), 1600, 8000);
  const h = clamp(Math.round(numOr(raw.h, WORLD_DEFAULT.h)), 1200, 8000);
  const map = {
    format: MAP_FORMAT, version: MAP_VERSION,
    name: (typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '导入地图').slice(0, 24),
    tier: raw.tier === 'top' ? 'top' : (raw.tier === 'secret' ? 'secret' : 'standard'),
    faction: FACTIONS[raw.faction] ? raw.faction : 'asara',
    w, h,
    spawns: [],
    obstacles: [], crates: [], extracts: [], nests: [],
    units: [],
    squad: [],
  };

  for (const o of (Array.isArray(raw.obstacles) ? raw.obstacles : [])) {
    if (!o) continue;
    const ow = clamp(Math.round(numOr(o.w, 100)), 20, w);
    const oh = clamp(Math.round(numOr(o.h, 100)), 20, h);
    const ox = Math.round(numOr(o.x, 0));
    const oy = Math.round(numOr(o.y, 0));
    if (!isFinite(ox) || !isFinite(oy)) continue;
    map.obstacles.push({ x: clamp(ox, 0, w - ow), y: clamp(oy, 0, h - oh), w: ow, h: oh });
    if (map.obstacles.length >= 560) break;
  }

  for (const c of (Array.isArray(raw.crates) ? raw.crates : [])) {
    if (!c) continue;
    const x = Math.round(numOr(c.x, NaN)), y = Math.round(numOr(c.y, NaN));
    if (!isFinite(x) || !isFinite(y)) continue;
    const p = nudgeFree(clamp(x, 30, w - 30), clamp(y, 30, h - 30), 34, map.obstacles, w, h);
    if (p.moved) warnings.push('有容器压在墙上，已挪到附近空地');
    map.crates.push({ x: p.x, y: p.y, t: CONTAINERS[c.t] ? c.t : '' });
    if (map.crates.length >= 200) break;
  }

  for (const e of (Array.isArray(raw.extracts) ? raw.extracts : [])) {
    if (!e) continue;
    const x = Math.round(numOr(e.x, NaN)), y = Math.round(numOr(e.y, NaN));
    if (!isFinite(x) || !isFinite(y)) continue;
    const p = nudgeFree(clamp(x, 140, w - 140), clamp(y, 140, h - 140), 120, map.obstacles, w, h);
    if (p.moved) warnings.push('有撤离点场地不够，已挪到附近空地');
    const mode = e.mode === 'emergency' ? 'emergency'
               : e.mode === 'naked' ? 'naked'
               : e.mode === 'paid' ? 'paid' : 'hold';
    map.extracts.push({
      x: p.x, y: p.y, mode,
      name: String(e.name || '').slice(0, 2) || (map.extracts.length === 0 ? 'A' : 'B'),
      cost: mode === 'paid' ? Math.max(200, Math.round(numOr(e.cost, 1500))) : 0,
      hold: mode === 'paid' ? 3 : 6,
    });
    if (map.extracts.length >= 4) break;
  }
  if (map.extracts.length === 0) errors.push('地图里没有撤离点，玩家无法撤离');

  /* 拉闸撤离图：extMode='switch'，地图自带 N 处总闸（全拉下才开紧急撤离点） */
  map.extMode = raw.extMode === 'switch' ? 'switch' : 'hold';
  /* 安全总监的随机出生区（航天基地核心控制区），矩形不合法就忽略 */
  if (raw.coreZone && [raw.coreZone.x, raw.coreZone.y, raw.coreZone.w, raw.coreZone.h]
      .every(v => isFinite(numOr(v, NaN)))) {
    map.coreZone = { x: raw.coreZone.x, y: raw.coreZone.y, w: raw.coreZone.w, h: raw.coreZone.h };
  }
  /* BOSS 驻守区（零号大坝的行政楼大厅）：赤霄出生与拴绳都锁在这个矩形里 */
  if (raw.bossZone && [raw.bossZone.x, raw.bossZone.y, raw.bossZone.w, raw.bossZone.h]
      .every(v => isFinite(numOr(v, NaN)))) {
    const z = {
      x: Math.round(raw.bossZone.x), y: Math.round(raw.bossZone.y),
      w: Math.round(raw.bossZone.w), h: Math.round(raw.bossZone.h),
    };
    if (z.w >= 140 && z.h >= 140 && z.x >= 0 && z.y >= 0 && z.x + z.w <= w && z.y + z.h <= h) map.bossZone = z;
    else warnings.push('BOSS 驻守区太小或越界，已忽略');
  }
  map.switches = [];
  for (const s of (Array.isArray(raw.switches) ? raw.switches : [])) {
    if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
    const p = nudgeFree(clamp(Math.round(s.x), 60, w - 60), clamp(Math.round(s.y), 60, h - 60), 40, map.obstacles, w, h);
    map.switches.push({ x: p.x, y: p.y });
    if (map.switches.length >= 4) break;
  }

  for (const n of (Array.isArray(raw.nests) ? raw.nests : [])) {
    if (!n) continue;
    const x = Math.round(numOr(n.x, NaN)), y = Math.round(numOr(n.y, NaN));
    if (!isFinite(x) || !isFinite(y)) continue;
    const p = nudgeFree(clamp(x, 50, w - 50), clamp(y, 50, h - 50), 46, map.obstacles, w, h);
    if (p.moved) warnings.push('有据点压在墙上，已挪到附近空地');
    map.nests.push({ x: p.x, y: p.y });
    if (map.nests.length >= 40) break;
  }
  if (map.nests.length === 0) {
    warnings.push('地图里没有敌人据点，已补到四角');
    map.nests = [
      { x: 300, y: 300 }, { x: w - 300, y: 300 },
      { x: 300, y: h - 300 }, { x: w - 300, y: h - 300 },
    ];
  }

  const squad = Array.isArray(raw.squad) ? raw.squad.filter(t => ENEMY_TYPES[t]) : [];
  map.squad = squad.length ? squad.slice(0, 32) : DEFAULT_SQUAD.slice();
  if (!squad.length && Array.isArray(raw.squad)) warnings.push('守军配置为空，已使用默认小队');

  /* 地区标注：{ x, y, w, h, name } —— 局内地面画虚线框与地区名，进图提示「当前地区」 */
  map.regions = [];
  for (const r of (Array.isArray(raw.regions) ? raw.regions : [])) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const rx = Math.round(numOr(r.x, NaN)), ry = Math.round(numOr(r.y, NaN));
    const rw = Math.round(numOr(r.w, NaN)), rh = Math.round(numOr(r.h, NaN));
    if (![rx, ry, rw, rh].every(isFinite) || rw < 80 || rh < 80) continue;
    if (rx < 0 || ry < 0 || rx + rw > w || ry + rh > h) continue;
    map.regions.push({ x: rx, y: ry, w: rw, h: rh, name: r.name.trim().slice(0, 10) });
    if (map.regions.length >= 10) break;
  }

  // 兵种布点：新格式 units；没有就按旧 squad 均匀铺到各据点周围
  let movedUnit = false;
  for (const u of (Array.isArray(raw.units) ? raw.units : [])) {
    if (!u || !ENEMY_TYPES[u.type]) continue;
    const x = Math.round(numOr(u.x, NaN)), y = Math.round(numOr(u.y, NaN));
    if (!isFinite(x) || !isFinite(y)) continue;
    const R = ENEMY_TYPES[u.type].r + 10;
    const p = nudgeFree(clamp(x, 60, w - 60), clamp(y, 60, h - 60), R, map.obstacles, w, h);
    if (p.moved) movedUnit = true;
    map.units.push({ x: p.x, y: p.y, type: u.type, f: FACTIONS[u.f] ? u.f : map.faction });
    if (map.units.length >= 96) break;
  }
  if (movedUnit) warnings.push('有敌人布点压在墙上，已挪到附近空地');
  if (!map.units.length) {
    const nestList = map.nests.length ? map.nests : [{ x: w / 2, y: h / 2 }];
    map.squad.forEach((t, i) => {
      const n = nestList[i % nestList.length];
      const R = ENEMY_TYPES[t].r + 12;
      const p = nudgeFree(
        clamp(n.x + rand(-130, 130), 60, w - 60),
        clamp(n.y + rand(-130, 130), 60, h - 60),
        R, map.obstacles, w, h);
      map.units.push({ x: p.x, y: p.y, type: t, f: map.faction });
    });
  }

  // 出生点：新格式是 spawns 数组（N 个，每局随机），旧格式 spawn 单点也认
  const rawSpawns = Array.isArray(raw.spawns) ? raw.spawns
                   : (raw.spawn ? [raw.spawn] : []);
  let movedSpawn = false;
  for (const s of rawSpawns) {
    if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
    const p = nudgeFree(clamp(Math.round(s.x), 40, w - 40), clamp(Math.round(s.y), 40, h - 40), 24, map.obstacles, w, h);
    if (p.moved) movedSpawn = true;
    // 同一个位置不要重复放
    if (map.spawns.some(q => Math.abs(q.x - p.x) < 20 && Math.abs(q.y - p.y) < 20)) continue;
    map.spawns.push({ x: p.x, y: p.y });
    if (map.spawns.length >= 12) break;
  }
  if (movedSpawn) warnings.push('有出生点原本在墙里，已挪到最近空地');
  if (!map.spawns.length) {
    const p = nudgeFree(w / 2, h / 2, 24, map.obstacles, w, h);
    map.spawns.push({ x: p.x, y: p.y });
    if (rawSpawns.length) warnings.push('出生点数据无效，已放到地图中心');
  }

  // 内置预设的 id：写进地图里，重新读档后大厅仍能高亮对应的预设
  if (typeof raw.builtin === 'string' && raw.builtin) map.builtin = raw.builtin.slice(0, 24);

  // 去重提示
  const uniq = new Set(warnings);
  warnings.length = 0;
  warnings.push(...uniq);

  return { ok: errors.length === 0, errors, warnings, map };
}

/* 把一份地图数据写进运行时世界 */
function applyMapData(m) {
  WORLD.w = m.w;
  WORLD.h = m.h;
  const list = (m.spawns && m.spawns.length) ? m.spawns : [{ x: m.w / 2, y: m.h / 2 }];
  G.spawns = list.slice(0, 12).map(s => ({ x: s.x, y: s.y }));
  G.spawn = { x: G.spawns[0].x, y: G.spawns[0].y };
  G.obstacles = m.obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, tone: Math.random() }));
  // 老地图的容器没有 t：前几个先补齐六种，剩下的按权重抽，别整张图只有补给箱
  const need = CONTAINER_IDS.slice();
  for (let i = need.length - 1; i > 0; i--) { const j = randInt(0, i); const tmp = need[i]; need[i] = need[j]; need[j] = tmp; }
  let needI = 0;
  G.crates = m.crates.map(c => {
    let kind;
    if (CONTAINERS[c.t]) kind = c.t;
    else if (needI < need.length) kind = need[needI++];
    else kind = rollContainerKind();
    return { x: c.x, y: c.y, kind, r: CONTAINERS[kind].r, opened: false, phase: rand(0, TAU), hover: 0 };
  });
  G.extracts = m.extracts.map((e, i) => {
    const mode = e.mode === 'emergency' ? 'emergency'
               : e.mode === 'naked' ? 'naked'
               : e.mode === 'paid' ? 'paid' : 'hold';
    return {
      x: e.x, y: e.y, r: 108, phase: rand(0, TAU), mode,
      name: e.name || (i === 0 ? 'A' : 'B'),
      cost: mode === 'paid' ? Math.max(200, Math.round(numOr(e.cost, 1500))) : 0,
      hold: mode === 'paid' ? 3 : 6,
    };
  });
  G.extMode = m.extMode === 'switch' ? 'switch' : 'hold';
  G.coreZone = m.coreZone || null;
  G.bossZone = m.bossZone || null;
  G.switches = (m.switches || []).map(s => ({ x: s.x, y: s.y, pulled: false, phase: rand(0, TAU) }));
  G.emergencyOpen = G.extMode !== 'switch';   // 普通图撤离点常开；拉闸图要拉满总闸
  G.emergencyTimer = 0;
  G.emergencyToast60 = false;
  G.emergencyToast10 = false;
  G.nests = m.nests.map(n => ({ x: n.x, y: n.y }));
  G.mapFaction = FACTIONS[m.faction] ? m.faction : 'asara';
  G.regions = (m.regions || []).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, name: r.name }));
  G.curRegion = '';
  G.regionBanner = 0;
  G.units = (m.units || []).map(u => ({ x: u.x, y: u.y, type: u.type, f: FACTIONS[u.f] ? u.f : G.mapFaction }));
  G.squad = (m.squad && m.squad.length ? m.squad : DEFAULT_SQUAD).slice();
  G.mapName = m.name || '自定义地图';
  G.tier = m.tier === 'top' ? 'top' : (m.tier === 'secret' ? 'secret' : 'standard');
  /* 混编地图才需要跑阵营混战；单阵营地图直接跳过，零开销 */
  const facs = new Set(G.units.map(u => u.f));
  if (!facs.size) facs.add(G.mapFaction);
  G.factionsMixed = facs.size > 1;
  G.spawnFaction = G.units.length ? G.units[0].f : G.mapFaction;
}

/* 每局开场准备世界：有自定义地图就载入，否则现场随机生成 */
function prepareWorldForRaid() {
  if (G.customMap) {
    applyMapData(G.customMap);
    return;
  }
  WORLD.w = WORLD_DEFAULT.w;
  WORLD.h = WORLD_DEFAULT.h;
  generateWorld();
  generateCrates();
  generateExtracts();
  generateNests();
  G.spawns = [{ x: WORLD.w / 2, y: WORLD.h / 2 }];
  G.spawn = { x: WORLD.w / 2, y: WORLD.h / 2 };
  G.units = [];
  G.squad = DEFAULT_SQUAD.slice();
  G.regions = [];
  G.curRegion = '';
  G.regionBanner = 0;
  G.mapName = '随机生成（每局不同）';
  G.tier = 'standard';
  G.mapFaction = 'asara';
  G.spawnFaction = 'asara';
  G.factionsMixed = false;
  G.extMode = 'hold';
  G.switches = [];
  G.emergencyOpen = true;
  G.emergencyTimer = 0;
}

/* 把当前世界导出成一份地图数据 */
function buildMapData(name) {
  return {
    format: MAP_FORMAT, version: MAP_VERSION,
    name: (name || (G.customMap ? G.customMap.name : '自定义地图')).slice(0, 24),
    tier: G.tier || 'standard',
    faction: G.mapFaction || 'asara',
    w: WORLD.w, h: WORLD.h,
    spawns: (G.spawns && G.spawns.length ? G.spawns : [G.spawn]).map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })),
    obstacles: G.obstacles.map(o => ({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) })),
    crates: G.crates.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), t: c.kind || 'crate' })),
    extracts: G.extracts.map(e => ({ x: Math.round(e.x), y: Math.round(e.y), name: e.name, mode: e.mode || 'hold' })),
    extMode: G.extMode || 'hold',
    coreZone: G.coreZone || undefined,
    bossZone: G.bossZone || undefined,
    switches: (G.switches || []).map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })),
    nests: G.nests.map(n => ({ x: Math.round(n.x), y: Math.round(n.y) })),
    regions: (G.regions || []).map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), name: r.name })),
    units: (G.units || []).map(u => ({ x: Math.round(u.x), y: Math.round(u.y), type: u.type, f: u.f || G.mapFaction })),
    squad: (G.squad.length ? G.squad : DEFAULT_SQUAD).slice(),
  };
}

function loadStoredMap() {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 老存档只写了 builtin:true，按地图名补回 id
    if (parsed && parsed.builtin === true) {
      for (const id of Object.keys(BUILTIN_MAPS)) {
        if (BUILTIN_MAPS[id].name === parsed.name) { parsed.builtin = id; break; }
      }
    }
    // 存的是内置地图：始终以代码里的版本为准，改图后老存档不会卡在旧数据
    if (parsed && typeof parsed.builtin === 'string' && BUILTIN_MAPS[parsed.builtin]) {
      const rb = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS[parsed.builtin])));
      if (rb.ok) { rb.map.builtin = parsed.builtin; return rb.map; }
    }
    const r = normalizeMap(parsed);
    return r.ok ? r.map : null;
  } catch (e) { return null; }
}

function persistMap(m) {
  try {
    if (m) localStorage.setItem(MAP_KEY, JSON.stringify(m));
    else localStorage.removeItem(MAP_KEY);
  } catch (e) {}
}

/* 切换地图：写入存档、重建背景世界、玩家回到出生点 */
function setCustomMap(m) {
  G.customMap = m || null;
  persistMap(G.customMap);
  prepareWorldForRaid();
  resetPlayer();
  G.cam.x = clamp(P.x - VW / ZOOM / 2, 0, Math.max(0, WORLD.w - VW / ZOOM));
  G.cam.y = clamp(P.y - VH / ZOOM / 2, 0, Math.max(0, WORLD.h - VH / ZOOM));
  if (typeof refreshMapPanel === 'function') refreshMapPanel();
  if (typeof refreshMapSelect === 'function') refreshMapSelect();
}

function importMapText(text, fname) {
  let raw;
  try { raw = JSON.parse(text); }
  catch (e) { return { ok: false, msg: 'JSON 解析失败，请检查文件内容' }; }

  const r = normalizeMap(raw);
  if (!r.ok) return { ok: false, msg: r.errors[0] || '地图无效' };

  if (!raw.name && fname) r.map.name = fname.replace(/\.json$/i, '').slice(0, 24);
  setCustomMap(r.map);

  return {
    ok: true,
    msg: '已载入「' + r.map.name + '」：墙 ' + r.map.obstacles.length + ' · 箱 ' + r.map.crates.length +
         ' · 撤离 ' + r.map.extracts.length + ' · 据点 ' + r.map.nests.length +
         ' · 出生点 ' + r.map.spawns.length +
         ' · 守军 ' + r.map.units.length +
         (r.map.units.some(u => u.type === 'boss') ? '（含赤霄）' : '') +
         (r.warnings.length ? '（' + r.warnings[0] + '）' : ''),
  };
}

/* 一键部署内置地图 */
function loadBuiltinMap(id, quiet) {
  const raw = BUILTIN_MAPS[id];
  if (!raw) { mapMessage('没有这张内置地图', 'warn'); return false; }
  const r = normalizeMap(JSON.parse(JSON.stringify(raw)));
  if (!r.ok) { mapMessage(r.errors[0] || '地图数据无效', 'warn'); return false; }
  r.map.builtin = id;
  setCustomMap(r.map);
  if (!quiet) {
    mapMessage('已部署「' + r.map.name + '」：掩体 ' + r.map.obstacles.length + ' · 补给箱 ' +
      r.map.crates.length + ' · 撤离点 ' + r.map.extracts.length + ' · 出生点 ' +
      r.map.spawns.length + '（每局随机）· 守军 ' + r.map.units.length + ' 人', 'ok');
  }
  return true;
}

function exportMapFile() {
  const m = buildMapData(G.customMap ? G.customMap.name : '自定义地图');
  const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (m.name || 'map').replace(/[\\/:*?"<>|]/g, '_') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return m;
}

/* ══════════════════════════════════════════════════════════
   7. 粒子 / 文字
   ══════════════════════════════════════════════════════════ */
function addParticle(x, y, opt) {
  /* 粒子密度设置：0 = 全关，低于 100 时按比例抽稀（纯视觉，不影响任何结算） */
  const fx = fxRate();
  if (fx <= 0) return;
  if (fx < 1 && Math.random() > fx) return;
  if (G.particles.length > 900) return;
  G.particles.push({
    x, y,
    vx: opt.vx || 0, vy: opt.vy || 0,
    life: opt.life || 0.5, max: opt.life || 0.5,
    r: opt.r || 3,
    color: opt.color || '#fff',
    drag: opt.drag !== undefined ? opt.drag : 0.92,
    grav: opt.grav || 0,
    glow: opt.glow || false,
    shape: opt.shape || 'circle',
    rot: rand(0, TAU),
    spin: opt.spin || 0,
  });
}

function burst(x, y, n, opt) {
  for (let i = 0; i < n; i++) {
    const a = opt.angle !== undefined
      ? opt.angle + rand(-(opt.spread || 0.6), (opt.spread || 0.6))
      : rand(0, TAU);
    const s = rand(opt.spdMin || 40, opt.spdMax || 260);
    addParticle(x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.2, opt.life || 0.6),
      r: rand(1.5, opt.r || 4),
      color: Array.isArray(opt.color) ? pick(opt.color) : (opt.color || '#fff'),
      drag: opt.drag !== undefined ? opt.drag : 0.90,
      glow: opt.glow, shape: opt.shape,
    });
  }
}

function popup(x, y, text, color, size) {
  if (G.popups.length > 46) G.popups.shift();
  G.popups.push({ x, y, text, color: color || '#fff', size: size || 15, life: 0.95, max: 0.95, vy: -48 });
}

function addDecal(x, y, r, color, alpha) {
  if (G.decals.length > 170) G.decals.shift();
  G.decals.push({ x, y, r, color, a: alpha === undefined ? 0.55 : alpha });
}

function shake(v) { G.shake = Math.min(34, G.shake + v * shakeMul()); }

function uiToast(text, cls) {
  const layer = document.getElementById('toastLayer');
  const d = document.createElement('div');
  d.className = 'tmsg ' + (cls || '');
  d.textContent = text;
  layer.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}

/* ══════════════════════════════════════════════════════════
   8. 玩家
   ══════════════════════════════════════════════════════════ */
/* 从地图的 N 个出生点里随机挑一个，尽量不和上一局重复 */
function pickSpawnPoint() {
  const list = (G.spawns && G.spawns.length) ? G.spawns : [{ x: WORLD.w / 2, y: WORLD.h / 2 }];
  let idx = 0;
  if (list.length > 1) {
    const pool = [];
    for (let i = 0; i < list.length; i++) if (i !== G.lastSpawnIdx) pool.push(i);
    idx = pool[Math.floor(Math.random() * pool.length)];
  }
  G.lastSpawnIdx = idx;
  return list[idx];
}

/* 落地安全区：出生点半径内的守军挪到圈外。
   内置地图的守军布点是写死的，光挑出生点未必躲得开 —— 这道兜底保证
   「一睁眼不会有人贴脸」。所有地图开局都跑一遍：半径 780 覆盖最大视野
   520（狙击/BOSS）+ 巡逻游荡 200 = 720，挪到圈外 870+ 就不可能落地被看见。
   （地图数据层另有生成器校验：出生点不得处于任何守军视线内，双保险） */
function secureSpawnArea(radius) {
  const sx = G.spawn.x, sy = G.spawn.y;
  let moved = 0;
  for (const e of G.enemies) {
    if (!e || e.hp <= 0) continue;
    if (dist(e.x, e.y, sx, sy) > radius) continue;
    /* 八圈 × 36 向系统搜位：870 → 1255，比单圈随机 20 次稳得多
       （守军挤在两个出生点之间时随机尝试很容易全部落空） */
    let done = false;
    for (let ring = 0; ring < 8 && !done; ring++) {
      const d = radius + 90 + ring * 55;
      for (let k = 0; k < 36 && !done; k++) {
        const a = (k / 36) * TAU + rand(-0.06, 0.06);
        const nx = clamp(sx + Math.cos(a) * d, e.r + 40, WORLD.w - e.r - 40);
        const ny = clamp(sy + Math.sin(a) * d, e.r + 40, WORLD.h - e.r - 40);
        /* 贴边出生点：环上的点被 clamp 拉回界内后会落进半径里 —— 直接跳过，
           宁可往有空地的方向找，也不把守军「挪」到更近的位置 */
        if (dist(nx, ny, sx, sy) < radius + 80) continue;
        if (hitsObstacle(nx, ny, e.r + 6)) continue;
        e.x = nx; e.y = ny;
        e.homeX = nx; e.homeY = ny;            // 巡逻锚点一起搬，免得它自己走回来
        e.patrolX = nx; e.patrolY = ny;        // 巡逻目标也要清掉 —— 不然还会朝出生点走
        e.state = 'patrol'; e.alert = 0; e.spotted = false;
        if ('lastSeenX' in e) { e.lastSeenX = nx; e.lastSeenY = ny; }
        moved++; done = true;
      }
    }
    if (!done) {
      /* 实在挪不动（被墙围死）：把巡逻锚点改成背对出生点方向最近的空地，
         至少开局它是背对玩家走出去的 */
      const a = Math.atan2(e.y - sy, e.x - sx);
      for (let k = -3; k <= 3 && !done; k++) {
        const na = a + k * 0.22;
        const nx = clamp(e.x + Math.cos(na) * 500, e.r + 40, WORLD.w - e.r - 40);
        const ny = clamp(e.y + Math.sin(na) * 500, e.r + 40, WORLD.h - e.r - 40);
        if (hitsObstacle(nx, ny, e.r + 6)) continue;
        e.homeX = nx; e.homeY = ny;
        e.patrolX = nx; e.patrolY = ny;
        e.state = 'patrol'; e.alert = 0; e.spotted = false;
        if ('lastSeenX' in e) { e.lastSeenX = nx; e.lastSeenY = ny; }
        moved++; done = true;
      }
    }
  }
  return moved;
}

/* 每局开局把干员技能重置：储备按表回满、冷却归零、外骨骼一定关着 */
function initOperatorSkills() {
  const op = opDef();
  /* 开局状态：G / V 不压初始冷却，满储备、落地就能用；X 是大招，开局就带着
     一整段冷却转起来（充能型的激素枪等价成「0 发、等一个充能周期」），
     所以谁都不能一落地就把大招甩出去。 */
  const xCd = op ? Math.max(0, op.x.cd || 0) : 0;
  const xCharge = !!(op && (op.x.charges || 1) > 1);
  P.op = {
    /* 储备制：use 是还能连放几层；recharge 是下一层的回充倒计时。
       打掉一层后立刻开始回充，回满一层接着回下一层 —— 手上有余量就能连放 */
    g: { cd: 0, use: op ? op.g.charges : 0, recharge: 0 },
    v: { cd: 0, use: op ? op.v.charges : 0, recharge: 0 },
    x: { cd: xCharge ? 0 : xCd, on: false, t: 0,
         use: op ? (xCharge ? 0 : (op.x.charges || 1)) : 0,
         recharge: xCharge ? xCd : 0 },
    /* 技能手持模式：拿出来的雷 / 弓 / 装置 / 发射器。有 mode 时左键右键都归技能管，
       枪是收起来的。结构见 enterMode() */
    mode: null,
    volley: null,          // 三连发的排程：{ left, t }
    slide: 0,              // 滑铲剩余时间
    slideDur: 0,           // 这一下滑铲的总时长（算衰减用）
    slideA: 0,             // 滑铲锁定的方向
    dash: 0,               // 动力推进剩余时间
    dashDur: 0,            // 这一下推进的总时长
    dashA: 0,              // 推进锁定的方向
    dashSpd: 0,            // 推进速度（按正/侧/后打过的折）
    kine: 0,               // 动能辅助剩余时间
    lastMag: SKILL.mag.def,// 磁吸炸弹上次的投掷距离（短按沿用）
    lastThrow: 5 * 18,      // 燃烧弹 / 破片雷上次的投掷距离
    rescueCd: 0,           // 蜂医「专业救援」的冷却（每局重生一次）
    adrStack: 0,           // 蛊：肾上腺素叠层（整局保留，倒地 / 阵亡 / 新一局清空）
    adrBuffT: 0,           // 蛊：被流荧集群「路过队友」挂上的独立肾上腺素时长
  };
  P.concuss = 0;
  P.kd = 0;                // 被虎蹲炮掀翻的剩余时间
  P.downed = 0;            // 每局重新开始，倒地状态清零
  P.downHp = 0;
  P.downRev = 0;
  P.sprintLatch = false;   // 跑步姿态锁存一并清掉
  P.gunLoot = {};          // 缴获台账每局重记
  P.gearLoot = {};
  P.regenT = 0;
}

function resetPlayer() {
  const sp = pickSpawnPoint();
  P.packDiscarded = false;    // 丢包撤离标记每局重置
  G.spawn = { x: sp.x, y: sp.y };
  P.x = clamp(sp.x, P.r, WORLD.w - P.r);
  P.y = clamp(sp.y, P.r, WORLD.h - P.r);
  resetDebuff();              // 先把创伤清干净，血量上限按基础值重算
  P.hp = P.maxHp;
  P.aim = 0;
  P.vx = 0;
  P.vy = 0;
  P.ads = 0;
  P.adsPrev = 0;
  P.fireCd = 0;
  P.burstLeft = 0;
  P.triggerPrev = false;
  P.reloading = 0;
  P.chill = 0;
  P.chillTick = 0;
  P.stamina = SPRINT.max;
  P.sprinting = false;
  P.exhaust = 0;
  initOperatorSkills();
  P.invuln = 0;
  P.hurtFlash = 0;
  P.recoil = 0;
  P.muzzle = 0;
  P.alive = true;
  P.medCd = 0;
  P.careFrom = null;
  P.medOn = null;
  P.medWind = 0;
  P.medWindT = 0;
  P.medHealT = 0;
  P.medHealW = 0;
  P.medKind = 'med';
  P.healAcc = 0;
  MED_SEL.down = false;
  MED_SEL.open = false;
  MED_SEL.hold = 0;
  MED_SEL.wheel = 0;
  MAG_AIM.down = false;
  MAG_AIM.on = false;
  MAG_AIM.hold = 0;
  P.burnT = 0;
  P.burnTick = 0;
  P.hurtDir = 0;
  P.hurtDirT = 0;

  // 每局按大厅配装携带：主武器 / 副武器 / 手枪，三槽各自独立弹药
  // 三个枪槽都可以是空的 —— 一把枪都没带就只能靠刀，不再白送手枪
  P.owned = {};
  P.slots = { primary: null, secondary: null, pistol: null };
  const LO = SAVE.loadout || {};
  const avail = {};                                  // 每把枪的实例数：装一个槽吃掉一把
  for (const k in SAVE.owned) avail[k] = SAVE.owned[k] | 0;
  for (const k of GUN_SLOTS) {
    const id = LO[k];
    if (!id || !WEAPONS[id] || (avail[id] | 0) <= 0) continue;
    P.slots[k] = id;
    P.owned[id] = true;
    avail[id]--;
  }
  P.curSlot = P.slots.primary ? 'primary' : (P.slots.secondary ? 'secondary'
    : (P.slots.pistol ? 'pistol' : 'melee'));
  P.weapon = P.slots[P.curSlot] || null;
  /* 出生飘字要等配装结算完再说 —— 放在这里才知道手里到底有没有枪 */
  popup(P.x, P.y - 46, P.curSlot === 'melee' ? '只有刀 · 1~5 切换装备'
    : (P.curSlot === 'pistol' ? '只有手枪 · 1~5 切换装备' : '右键开镜 · 1~5 切换装备'), '#8ef2ff', 13);

  P.melee = (SAVE.ownedMelee && SAVE.ownedMelee[SAVE.equippedMelee]) ? SAVE.equippedMelee : STARTER_MELEE;
  P.meleeCd = 0;
  P.swingT = 0;
  P.swingHit = 0;

  /* 随身容器：把大厅整备好的弹挂 / 口袋 / 背包深拷一份带进来。
     撤离成功原样写回，阵亡就地清空 —— 带进去的就是你丢得起的。 */
  const car = ensureCarry();
  P.rig = car.rig.map(c => c ? Object.assign({}, c) : null);
  P.pocket = car.pocket.map(c => c ? Object.assign({}, c) : null);
  P.pack = car.pack.map(c => c ? Object.assign({}, c) : null);
  P.carePick = normCareKey(SAVE.carePick);

  /* 装弹：备弹不再自动从仓库扣 —— 弹挂里装了什么格就是什么。
     弹匣从对应口径的弹药格里真扣发数；格子空着就是烧火棍。
     弹级以格子记录的为准（大厅整备时装入那一刻选的弹级）。 */
  P.ammo = {};
  for (const id of Object.keys(P.owned)) {
    const WS = weaponStats(id);
    const cal = calOfWeapon(id);
    const src = ammoCellFor(cal);          // 弹挂/口袋里这个口径的弹药格
    const lv = src ? src.cell.lv : ammoPickOf(cal);
    const inMag = src ? drainReserve(cal, Math.min(WS.mag, src.cell.n), src.cell.lv) : 0;
    P.ammo[id] = { mag: inMag, tier: lv, cal };
  }

  /* 提醒：哪个口径一颗子弹都没有（弹匣 + 弹挂备弹都空） */
  {
    const dry = [];
    for (const id of Object.keys(P.owned)) {
      const a = P.ammo[id];
      if (!a || a.mag + reserveOf(calOfWeapon(id)) <= 0) dry.push(weaponStats(id).short);
    }
    if (dry.length) uiToast('没子弹：' + dry.join(' / ') + ' · 弹挂里装点备弹', 'warn');
  }

  {
    const pc = SAVE.wornPiece;
    const AR = (pc && ARMORS[pc.id]) || ARMORS[0];
    P.armorId = AR.id;
    P.armorLv = AR.lv | 0;
    P.armorName = AR.lv > 0 ? AR.name : '';
    P.armorHp = AR.lv > 0 ? Math.max(0, Math.round(pc.hp)) : 0;
    P.armorMax = AR.lv > 0 ? Math.max(1, Math.round(pc.max)) : 0;
    P.armorDR = AR.dr;
    P.armorAim = AR.aim || 0;        // 瞄准惩罚：开火散布变大
    P.armorMove = AR.move || 0;      // 移速惩罚：走得慢
    P.armorLoad = AR.load || 0;      // 负重：影响跑步耗体力
  }
}

/* 护甲当前的实际减免：件还在且没磨光才有效 —— 磨光就是裸奔 */
function armDr() {
  return (P.armorLv > 0 && P.armorHp > 0) ? P.armorDR : 0;
}

function currentAmmo() {
  if (!P.weapon) return { mag: 0 };                 // 空手：没有弹匣可谈
  if (!P.ammo[P.weapon]) {
    /* 没登记过的枪（理论上不会）当成空枪，绝不凭空发子弹 */
    const cal = calOfWeapon(P.weapon);
    P.ammo[P.weapon] = { mag: 0, tier: ammoPickOf(cal), cal };
  }
  return P.ammo[P.weapon];
}

/* ── 弹药格：备弹不再是枪上的一个数字，而是弹挂/口袋里的实体格子 ── */
/* 这个口径的备弹格（弹挂优先于口袋；多格时返回第一格） */
function ammoCellFor(cal) {
  const zones = carryZones();
  for (const arr of zones) for (const c of arr) if (c && c.t === 'ammo' && c.cal === cal) return { cell: c };
  return null;
}
/* 这个口径身上还剩几发备弹 */
function reserveOf(cal) {
  let n = 0;
  for (const arr of carryZones()) for (const c of arr) if (c && c.t === 'ammo' && c.cal === cal) n += c.n | 0;
  return n;
}
/* 加备弹：只往同口径同弹级的格子里填（1 级弹绝不混进 4 级弹的格子），
   装不下开新格（背包优先收纳，弹挂口袋其次—— 弹挂/口袋的格子留给要用的）。
   返回实际装进格子的发数。 */
function addReserve(cal, n, lv) {
  if (lv == null || !calHasTier(cal, lv)) lv = ammoPickOf(cal);
  let left = Math.max(0, Math.round(n));
  if (left <= 0) return 0;
  const cap = ammoCellCap(cal, ownedMapLive());
  for (const arr of allCarryZones()) {
    for (const c of arr) {
      if (c && c.t === 'ammo' && c.cal === cal && c.lv === lv && c.n < cap) {
        const add = Math.min(cap - c.n, left);
        c.n += add; left -= add;
        if (left <= 0) return n;
      }
    }
  }
  while (left > 0) {
    const slot = freeCellFor('ammo');
    if (!slot) break;                        // 身上没格子了：装不下的就地丢弃
    const arr = allCarryZones()[slot.zone];
    const add = Math.min(cap, left);
    arr[slot.i] = { t: 'ammo', cal, lv, n: add };
    left -= add;
  }
  return n - left;
}
/* 扣备弹：先扣 preferLv 同弹级的格子（换弹优先用枪里那种弹），
   不够再动其他弹级的格子兜底。返回实际扣到的发数。 */
function drainReserve(cal, n, preferLv) {
  let need = Math.max(0, Math.round(n));
  let got = 0;
  const grab = matchLv => {
    for (const arr of carryZones()) {
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c && c.t === 'ammo' && c.cal === cal && c.n > 0 &&
            (matchLv == null || c.lv === matchLv)) {
          const take = Math.min(c.n, need);
          c.n -= take; got += take; need -= take;
          if (c.n <= 0) arr[i] = null;       // 打空的格子腾出来
          if (need <= 0) return;
        }
      }
    }
  };
  if (preferLv != null) grab(preferLv);
  grab(null);
  return got;
}

/* ══════════════════════════════════════════════════════════
   医疗 / 创伤
   ──────────────────────────────────────────────────────────
   三种东西共用一个「医疗槽 + 长按 5 选择盘」：
     med  医疗包  —— 耐久池，读条后持续回血（见下面的 startMedHeal）
     stop 止血件  —— 一次性，止住流血层
     surg 手术包  —— 有次数，读条后处理一项贯穿伤 / 骨折 / 骨裂 / 流血
   key 统一写成 'med:inject_s' 这种形式，短按 5 直接用 carePick。
   ══════════════════════════════════════════════════════════ */

/* ── 局内格子访问 ──
   快捷可用 = 弹挂 + 口袋（按 5 打药、R 换弹只认这两个容器）；
   背包里的东西要先 Tab 打开背包倒过来才能用。 */
function carryZones() { return [P.rig, P.pocket]; }
function allCarryZones() { return [P.rig, P.pocket, P.pack]; }
function usableCellList() {
  const out = [];
  carryZones().forEach((arr, zi) => { for (let i = 0; i < arr.length; i++) if (arr[i]) out.push({ zone: zi, i, cell: arr[i] }); });
  return out;
}
/* ── 物品占格（隔舱制）：不同物品占不同格数 / 形状，且必须整个塞进同一个隔舱的连续空格。
   形状优先级：SHAPES（显式宽×高）→ CELLS（只给格数，形状按舱列数自动近似方形）→ 类型兜底。
   护甲按等级：3 级 3x2、4 级 4x2、5·6 级 5x2；弹挂固定 2x2，背包按品质（紫及以下 2x2、金红 3x2）。
   容器的隔舱 = GEAR[key].blocks（弹挂）；没写 blocks 的（背包 / 口袋）= 一个整舱。
   多格物品只落在首个格子（head），后续格子放 { cont:1, head } 占位标记，
   所有「读物品」的循环都按 c.t 匹配类型，cont 标记天然被跳过。 ── */
function armorShape(id) {
  const A = ARMORS[id];
  const lv = A ? A.lv : 0;
  if (lv >= 5) return [5, 2];
  if (lv === 4) return [4, 2];
  if (lv === 3) return [3, 2];
  return [2, 2];
}
function gearShapeOf(c) {
  const g = c && GEAR[c.key];
  if (!g) return [2, 2];
  if (g.kind === 'rig') return [2, 2];                      // 弹挂：一律 2x2
  return (g.q === '金' || g.q === '红') ? [3, 2] : [2, 2];  // 背包：紫及以下 2x2，金红 3x2
}
function cellSize(c) {
  if (!c || c.cont) return 0;
  if (c.t === 'armor') { const s = armorShape(c.id); return s[0] * s[1]; }
  if (c.t === 'gear') { const s = gearShapeOf(c); return s[0] * s[1]; }
  if (c.t === 'relic') { const s = relicShape(c.id); return s[0] * s[1]; }
  const s = SHAPES[c.id];
  if (s) return s[0] * s[1];
  if (c.id && CELLS[c.id] > 0) return CELLS[c.id];
  if (c.t === 'gun') return 4;
  if (c.t === 'melee' || c.t === 'surg' || c.t === 'repair') return 2;
  return 1;
}
/* ── 隔舱 2D 化：每个舱摆成一个正方格小网格（1x2 / 1x3 竖条、2x2、2x3 …），
      存储仍是行优先的一维数组 + head/cont 占位，但铺设与渲染都按矩形来 ── */
/* 舱的列数：1 = 1 格；1x2 / 1x3 = 横排；4 = 2x2；6 = 3x2；大背包尽量接近方形 */
function blkCols(n) {
  if (n <= 1) return 1;
  if (n <= 3) return n;                                  // 2 / 3 格：横排
  for (let c = Math.ceil(Math.sqrt(n)); c <= 10; c++) if (n % c === 0) return c;
  return 10;
}
/* 隔舱数显示：只报格数（[3,1] 这种列数写法不进文案） */
function blkSizesText(blocks) { return blocks.map(b => Array.isArray(b) ? b[0] : b).join('+'); }
/* 隔舱定义解析：数字 = 自动列数（blkCols），[格数, 列数] = 指定列数（如 [3,1] = 竖 1x3 弹匣条）。
   第 3 位 brk：1=强制换行 2=强制同行；第 4 位 ind：左移 px（负值把舱拉回上一排舱的正下方）；
   第 5 位 mt：下移 px（小袋压在同行高舱的下方，如 xiqiang 的零钱袋） */
function blkSpec(b) { return Array.isArray(b) ? [b[0], b[1], b[2] | 0, b[3] | 0, b[4] | 0, b[5] | 0] : [b, blkCols(b), 0, 0, 0, 0]; }
/* 自动形状：sz 格物品在 C 列舱里的 w×h（只用于 SHAPES 没写的老物品）。
   只用「宽×高刚好等于 sz」的矩形，绝不出现 L 形缺口：把 sz 拆成因数对，
   取最接近正方形的那一对（同样方正时取更宽的，枪横着躺）。 */
function itemShape(sz, C) {
  if (C <= 1) return [1, Math.max(1, sz)];   // 单列舱（口袋 / 1 格）：竖放
  if (sz <= 1) return [1, 1];
  let best = null;
  for (let w = 1; w <= Math.min(sz, C); w++) {
    if (sz % w) continue;                    // 只认能整除的宽度
    const h = sz / w;
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (!best || ratio < best.ratio - 1e-9 || (Math.abs(ratio - best.ratio) < 1e-9 && w > best.w)) {
      best = { w, h, ratio };
    }
  }
  if (best) return [best.w, best.h];
  const w = Math.min(sz, C);                 // 质数等怪尺寸：退化成铺满的行优先矩形
  return [w, Math.ceil(sz / w)];
}
/* 物品的「原始」形状（不含朝向 / 舱宽自适应）：护甲按等级、装备按品质、收集品按占格表，其余 SHAPES */
function rawShapeOf(c) {
  if (!c || c.cont) return null;
  if (c.t === 'armor') return armorShape(c.id);
  if (c.t === 'gear') return gearShapeOf(c);
  if (c.t === 'relic') return relicShape(c.id);
  return SHAPES[c.id] || null;
}
/* 物品在 C 列舱里的实际占位形状：显式形状优先；c.rot = 转 90°（自动朝向标记）；
   所选朝向塞不下舱宽就躺倒（宽高互换）。只依赖舱列数 C（不看当前空位），
   保证「判空 / 铺设 / 渲染」三处算出同一形状。 */
function shapeOf(c, C) {
  if (!c || c.cont) return [1, 1];
  const s = rawShapeOf(c);
  if (!s) return itemShape(cellSize(c), C);        // 老物品：形状随舱列数自动安排
  if (s[0] === s[1]) return [s[0], s[1]];          // 正方形：转不转一样
  const a = s, b = [s[1], s[0]];
  const want = c.rot ? b : a;
  if (want[0] <= C) return want;
  const alt = c.rot ? a : b;
  return alt[0] <= C ? alt : want;
}
/* 某容器（'rig' | 'pocket' | 'pack'）的隔舱 → [[start, end, cols, brk, ml, mt, mr], ...] */
function zoneBlocks(zone) {
  if (zone === 'pocket') {                                   // 口袋：五个独立单格舱
    const out = []; let s = 0;
    for (const b of pocketBlocks()) { const [n, cols, brk, ml, mt, mr] = blkSpec(b); out.push([s, s + n, cols, brk, ml, mt, mr]); s += n; }
    return out;
  }
  const g = wornGear(zone);
  if (!g || !(g.cap > 0)) return [];
  if (!g.blocks) return [[0, g.cap, blkCols(g.cap), 0]];
  const out = []; let s = 0;
  for (const b of g.blocks) { const [n, cols, brk, ml, mt, mr] = blkSpec(b); out.push([s, s + n, cols, brk, ml, mt, mr]); s += n; }
  return out;
}
function blkAt(blocks, i) { for (const b of blocks) if (i >= b[0] && i < b[1]) return b; return null; }
/* 矩形判定：i 在隔舱 [s,e) 内，把 cell 从 i 铺开是否放得下（全空 + 行内不折行） */
function rectFitsAt(arr, s, e, C, i, cell) {
  if (i < s || i >= e) return false;
  const [w, h] = shapeOf(cell, C);
  if (w === 1 && h === 1) return !arr[i];
  if ((i - s) % C + w > C) return false;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const j = i + dy * C + dx;
    if (j >= e || arr[j]) return false;
  }
  return true;
}
/* 一件物品从 i 铺开的全部下标（行优先矩形） */
function spanIdxs(i, cell, s, e, C) {
  const [w, h] = shapeOf(cell, C);
  const out = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const j = i + dy * C + dx;
    if (j < e) out.push(j);
  }
  return out;
}
/* 在隔舱里找物品的落点：返回起点下标，找不到 -1 */
function findFitRun(arr, blocks, cell) {
  for (const [s, e, C] of blocks) {
    for (let i = s; i < e; i++) if (rectFitsAt(arr, s, e, C, i, cell)) return i;
  }
  return -1;
}
/* 指定下标能否放下这件物品 */
function fitsAtRun(arr, blocks, i, cell) {
  const b = blkAt(blocks, i);
  return b ? rectFitsAt(arr, b[0], b[1], b[2], i, cell) : false;
}
/* 「落点覆盖」锚点搜索：多格物品松手时不必正好压在头格 ——
   在落点所在隔舱里找一个能整件放下、且矩形覆盖落点格的锚点，
   有多个取离落点最近的。找不到返回 -1。
   例：1×3 手术包放进一个 3 格竖舱，落在中间格/底格也能放（锚点自动顶到头格）。 */
function findFitCovering(arr, blocks, i, cell) {
  const b = blkAt(blocks, i);
  if (!b) return -1;
  const [s, e, C] = b;
  let best = -1, bestD = Infinity;
  for (let a = s; a < e; a++) {
    if (!rectFitsAt(arr, s, e, C, a, cell)) continue;
    if (!spanIdxs(a, cell, s, e, C).includes(i)) continue;
    const d = Math.abs(a - i);
    if (d < bestD) { best = a; bestD = d; }
  }
  return best;
}
/* ── 自动朝向 ──
   6 格空洞不管摆成 2x3 还是 3x2 都该塞得下：默认按原始朝向找落点，放不下就转 90° 再找。
   朝向记在物品实例的 rot 标记上，shapeOf 读它 —— 存档 / 渲染 / 判空 全走同一个入口。 */
function canRotate(c) {
  const s = rawShapeOf(c);
  return !!s && s[0] !== s[1];                     // 正方形 / 自动形状：转不转一样
}
function rotatedCell(c) { return Object.assign({}, c, { rot: c.rot ? 0 : 1 }); }
/* 把自动朝向结果写回物品（真的转了才挂 rot，没转就保持干净） */
function applyFitRot(cell, rot) {
  if (!cell || typeof cell !== 'object') return cell;
  if (rot) cell.rot = 1; else delete cell.rot;
  return cell;
}
/* 找一个能整件放下的落点（带旋转兜底）：返回 { at, rot } 或 null */
function findFitAuto(arr, blocks, cell) {
  let i = findFitRun(arr, blocks, cell);
  if (i >= 0) return { at: i, rot: cell && cell.rot ? 1 : 0 };
  if (!canRotate(cell)) return null;
  const rc = rotatedCell(cell);
  i = findFitRun(arr, blocks, rc);
  return i >= 0 ? { at: i, rot: rc.rot } : null;
}
/* 拖拽落点：原位放得下就原位；否则在落点所在隔舱里挪锚点覆盖落点；再不行转 90° 重来。
   返回 { at, rot } 或 null。 */
function resolveDropAt(arr, blocks, hi, cell) {
  const tryOrient = (c2) => {
    if (fitsAtRun(arr, blocks, hi, c2)) return { at: hi, rot: c2.rot ? 1 : 0 };
    const cov = findFitCovering(arr, blocks, hi, c2);
    return cov >= 0 ? { at: cov, rot: c2.rot ? 1 : 0 } : null;
  };
  const r = tryOrient(cell);
  if (r) return r;
  return canRotate(cell) ? tryOrient(rotatedCell(cell)) : null;
}
/* 放置：head 落 i，占位标记按矩形铺（blocks 缺省时退回扁平铺，兼容老调用） */function placeAtRun(arr, i, cell, blocks) {
  arr[i] = cell;
  const b = blocks ? blkAt(blocks, i) : null;
  const idxs = b ? spanIdxs(i, cell, b[0], b[1], b[2]) : null;
  const n = idxs ? idxs.length : cellSize(cell);
  if (n <= 1) return;
  for (let k = 1; k < n; k++) {
    const j = idxs ? (idxs.length > k ? idxs[k] : -1) : i + k;
    if (j >= 0) arr[j] = { cont: 1, head: i };
  }
}
/* 清除一件（i 可以是 head 也可以是 cont 占位格），整个矩形一起清空 */
function clearSpanAt(arr, i, blocks) {
  const c = arr[i];
  if (!c) return;
  const h = c.cont ? c.head : i;
  const head = arr[h];
  if (!head || head.cont) { arr[i] = null; return; }   // 孤儿占位：只清自己
  const b = blocks ? blkAt(blocks, h) : null;
  const idxs = b ? spanIdxs(h, head, b[0], b[1], b[2]) : null;
  const n = idxs ? idxs.length : cellSize(head);
  if (n <= 1) { arr[h] = null; return; }
  for (let k = 0; k < n; k++) {
    const j = idxs ? idxs[k] : h + k;
    if (j >= 0 && j < arr.length) arr[j] = null;
  }
}
/* 孤儿占位清理：head 没了 / 指向的不是 head / 落在 head 矩形之外 —— 一律清掉。
   传 blocks 时按矩形（2x2 的第二行下标差 = 列数，不能再用「下标差 < 格数」判断）；
   不传（地上的箱子那种一维格子）退回线性判断。 */
function sanitizeSpans(arr, blocks) {
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (!c || !c.cont) continue;
    const h = c.head;
    const head = arr[h];
    if (!head || head.cont) { arr[i] = null; continue; }
    const b = blocks ? blkAt(blocks, h) : null;
    const idxs = b ? spanIdxs(h, head, b[0], b[1], b[2]) : null;
    const ok = idxs ? idxs.indexOf(i) > 0 : (i - h > 0 && i - h < cellSize(head));
    if (!ok) arr[i] = null;
  }
}
/* head 的矩形是否完整：每个占位格都得是「指向自己的 cont」（混进别人的东西 = 尺寸变了 / 老档错位） */
function spanOk(arr, i, blocks) {
  const c = arr[i];
  if (!c || c.cont) return true;
  const b = blkAt(blocks, i);
  if (!b) return true;
  const idxs = spanIdxs(i, c, b[0], b[1], b[2]);
  if (idxs.length <= 1) return true;
  for (const j of idxs) {
    if (j === i) continue;
    const d = arr[j];
    if (!d || !d.cont || d.head !== i) return false;
  }
  return true;
}
/* 占格规则改动后的老档重排：只要有一件的矩形对不上，就把整舱物品取出、按新尺寸重新摆；
   摆不下的原物回仓（返回溢出清单，null = 不用重排）。 */
function reflowZone(arr, blocks) {
  let bad = false;
  for (let i = 0; i < arr.length && !bad; i++) if (!spanOk(arr, i, blocks)) bad = true;
  if (!bad) return null;
  const items = [];
  for (let i = 0; i < arr.length; i++) { const c = arr[i]; if (c && !c.cont) items.push(c); }
  arr.fill(null);
  const overflow = [];
  for (const c of items) {
    const fit = findFitAuto(arr, blocks, c);
    if (!fit) { overflow.push(c); continue; }
    applyFitRot(c, fit.rot);
    placeAtRun(arr, fit.at, c, blocks);
  }
  sanitizeSpans(arr, blocks);
  return overflow;
}
const ZONE_NAMES = ['rig', 'pocket', 'pack'];
/* 找一个能放下的位置：先背包（storage），再弹挂、口袋（快捷）。
   枪 / 护甲 / 弹挂 / 背包只进背包。返回 { zone, i } 或 null（不写入）。
   放不下原朝向时会自动转 90° —— 例：包里留了个 2x3 的空洞，3x2 的战利品也能塞进去。 */
function freeCellFor(cell) {
  const t = typeof cell === 'string' ? cell : cell.t;
  const zones = allCarryZones();
  for (const pass of [2, 0, 1]) {              // pack → rig → pocket
    if ((t === 'gun' || t === 'armor' || t === 'gear') && pass !== 2) continue;   // 这四类只进背包
    const fit = findFitAuto(zones[pass], zoneBlocks(ZONE_NAMES[pass]), cell);
    if (fit) { applyFitRot(cell, fit.rot); return { zone: pass, i: fit.at }; }
  }
  return null;
}
/* 把一件合法格子物品塞进随身容器（按类型选区 + 隔舱矩形空位）。成功返回 { zone, i }。 */
function stowCell(cell) {
  if (!cell) return null;
  if (cell.t === 'gear') return null;          // 弹挂 / 背包只能手动拖进背包存放，捡到地上的一律直接换穿
  const slot = freeCellFor(cell);
  if (slot) placeAtRun(allCarryZones()[slot.zone], slot.i, cell, zoneBlocks(ZONE_NAMES[slot.zone]));
  return slot;
}
function removeCell(zone, i) { clearSpanAt(allCarryZones()[zone], i, zoneBlocks(ZONE_NAMES[zone])); }
function carryCellTotal() {
  let n = 0;
  for (const arr of allCarryZones()) for (const c of arr) if (c) n++;
  return n;
}

function medUnit(id) {
  for (const z of carryZones()) for (const c of z) if (c && c.t === 'med' && c.id === id) return c;
  return null;
}
function medCount(id) { return medUnit(id) ? 1 : 0; }
function medTotal() {
  let n = 0;
  for (const { cell } of usableCellList()) if (cell.t === 'med') n++;
  return n;
}
function medOwnedIds() { return MEDKIT_ORDER.filter(id => medCount(id) > 0); }
/* 当前那支的剩余耐久；没有就是 0 */
function medLeftOf(id) {
  const c = medUnit(id);
  return c ? Math.max(0, c.left) : 0;
}
/* 用完一支：把那格清空（一格一件，没有"下一支"的概念了） */
function consumeMedUnit(id) {
  const zones = carryZones();
  for (let zi = 0; zi < zones.length; zi++) {
    const arr = zones[zi];
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c && c.t === 'med' && c.id === id) { clearSpanAt(arr, i); return; }
    }
  }
}

/* 甲修包：局内的格子计数 —— 弹挂 / 口袋里那一份才快捷可用 */
function repairUnit(id) {
  for (const z of carryZones()) for (const c of z) if (c && c.t === 'repair' && c.id === id) return c;
  return null;
}
function repairCount(id) { return repairUnit(id) ? 1 : 0; }
function repairLeftOf(id) {
  const c = repairUnit(id);
  return c ? Math.max(0, c.left) : 0;
}
function consumeRepairUnit(id) {
  for (const arr of carryZones()) {
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c && c.t === 'repair' && c.id === id) { clearSpanAt(arr, i); return; }
    }
  }
}

/* 止血消耗品：一份一格 */
function stopCount(id) {
  let n = 0;
  for (const { cell } of usableCellList()) if (cell.t === 'stop' && cell.id === id) n++;
  return n;
}
function stopTotal() {
  let n = 0;
  for (const { cell } of usableCellList()) if (cell.t === 'stop') n++;
  return n;
}
/* 手术包还剩几次刀：各格剩余次数求和 */
function surgUses(id) {
  let n = 0;
  for (const { cell } of usableCellList()) if (cell.t === 'surg' && cell.id === id) n += cell.uses | 0;
  return n;
}
function surgTotal() {
  let n = 0;
  for (const { cell } of usableCellList()) if (cell.t === 'surg') n += cell.uses | 0;
  return n;
}
/* 用掉一次手术刀：所在格次数 -1，用光清格 */
function consumeSurgUse(id) {
  for (const arr of carryZones()) {
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c && c.t === 'surg' && c.id === id && (c.uses | 0) > 0) {
        c.uses--;
        if (c.uses <= 0) arr[i] = null;
        return;
      }
    }
  }
}

/* 用完一份止血 / 止痛：把那格清空 */
function consumeStopUnit(id) {
  for (const arr of carryZones()) {
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c && c.t === 'stop' && c.id === id) { arr[i] = null; return; }
    }
  }
}

/* 治疗物品的通用查询 */
function careCount(key) {
  const k = careKindOf(key), id = careIdOf(key);
  if (k === 'med') return medCount(id);
  if (k === 'stop') return stopCount(id);
  if (k === 'surg') return surgUses(id);
  return 0;
}
function careName(key) {
  const k = careKindOf(key), id = careIdOf(key);
  if (k === 'med') return (MEDKITS[id] || MEDKITS[STARTER_MEDKIT]).name;
  if (k === 'stop') return (STOPS[id] || STOPS.bandage).name;
  if (k === 'surg') return (SURGERIES[id] || SURGERIES.surg_simple).name;
  if (k === 'repair') return (REPAIRS[id] || REPAIRS.repair_b).name;
  return '医疗包';
}
function careColor(key) {
  const k = careKindOf(key), id = careIdOf(key);
  if (k === 'med') return (MEDKITS[id] || MEDKITS[STARTER_MEDKIT]).color;
  if (k === 'stop') return (STOPS[id] || STOPS.bandage).color;
  if (k === 'surg') return (SURGERIES[id] || SURGERIES.surg_simple).color;
  if (k === 'repair') return (REPAIRS[id] || REPAIRS.repair_b).color;
  return '#8fffc4';
}
/* 身上还带着的全部治疗物品，按「医疗包 → 止血 → 手术包」的顺序 */
function careOwnedKeys() {
  const out = [];
  for (const id of MEDKIT_ORDER) if (medCount(id) > 0) out.push(careKeyMake('med', id));
  for (const id of STOP_ORDER) if (stopCount(id) > 0) out.push(careKeyMake('stop', id));
  for (const id of SURG_ORDER) if (surgUses(id) > 0) out.push(careKeyMake('surg', id));
  for (const id of REPAIR_ORDER) if (repairCount(id) > 0) out.push(careKeyMake('repair', id));
  return out;
}
/* 「上次那种」：选择盘默认高亮谁、以及在没法自动判断时兜底用 */
function carePickNow() {
  const own = careOwnedKeys();
  if (!own.length) return null;
  if (own.indexOf(P.carePick) >= 0) return P.carePick;
  return own[0];
}

/* 止痛值不值得吃：止痛压的是「骨伤负面」和「贯穿伤黑边」，
   顺带打架时 -10% 受伤。纯掉血不算理由 —— 否则每次残血按 5 都先吃一片药，
   真正想回血的人反而要多按一次。 */
function painWorthIt() {
  const d = P.deb || {};
  if (d.arm > 0 || d.leg > 0 || d.fissure > 0) return true;
  return d.redHead > 0 || d.redChest > 0 || d.redAbdomen > 0;
}

/* ── 短按 5 的自动用药阶梯（严格按顺序）──
   ① 止血 ② 止痛 ③ 手术 ④ 回血
   规则：上一步身上没有可用的东西，就顺延到下一步；四步都找不到动手的理由，返回 null。
   为什么是这个顺序：
     止血永远最先 —— 流血时包扎效率只有 0.75 折，血一边灌一边漏，先止住再谈别的；
     手术排在回血前面 —— 贯穿伤压着血量上限，不先缝上，血灌到上限也到不了 100；
     止痛排手术前面 —— 一片药 3~4 秒，动刀要 5~10 秒，先止疼再慢慢缝更安全。 */
function careAutoPick() {
  const d = P.deb || {};

  /* ① 止血：两层以上有止血带就一把压完（2.6s），只有一层先用便宜的绷带（1.8s）
     没带绷带 / 止血带时，带止血功能的医疗箱（户外箱 / 战地箱）也能一把压住 —— 烧的是箱子耐久 */
  if (d.bleed > 0) {
    const band = stopCount('bandage'), tour = stopCount('tourniquet');
    if (d.bleed >= 2 && tour > 0) return careKeyMake('stop', 'tourniquet');
    if (band > 0) return careKeyMake('stop', 'bandage');
    if (tour > 0) return careKeyMake('stop', 'tourniquet');
    for (const mid of MEDKIT_ORDER) {
      if (MEDKITS[mid].perk === 'cure' && medCount(mid) > 0) return careKeyMake('med', mid);
    }
  }

  /* ② 止痛：药效还在就不重复吃（不叠加，只是烧库存）；挑最便宜的那种先吃 */
  if (P.painT <= 0 && painWorthIt()) {
    for (const id of STOP_PAINS) if (stopCount(id) > 0) return careKeyMake('stop', id);
  }

  /* ③ 手术：贯穿伤 / 骨折 / 骨裂 / 流血（没绷带止血带时的兜底），按价钱从低到高挑一个还带着的 */
  if (surgTarget()) {
    for (const id of SURG_ORDER) if (surgUses(id) > 0) return careKeyMake('surg', id);
  }

  /* ④ 修甲：甲还穿着、耐久缺了 5 点以上、身上带着修得动它的甲修包 ——
     挑「够得着这支甲、点数又最省」的先用（剩得最少的优先烧） */
  if (P.armorLv > 0 && P.armorMax - P.armorHp > 5) {
    const kits = usableCellList().filter(r => r.cell.t === 'repair' && REPAIRS[r.cell.id].capLv >= P.armorLv && r.cell.left > 0.5);
    if (kits.length) {
      kits.sort((a, b) => {
        const ra = a.cell.left / REPAIRS[a.cell.id].dur, rb = b.cell.left / REPAIRS[b.cell.id].dur;
        if (Math.abs(ra - rb) > 1e-6) return ra - rb;                 // 先烧用得最多的那份
        return REPAIRS[a.cell.id].capLv - REPAIRS[b.cell.id].capLv;   // 同样新鲜就先用小号的，大号留给大甲
      });
      return careKeyMake('repair', kits[0].cell.id);
    }
  }

  /* ⑤ 回血：先接着烧已经拆开的那支（拆封就归你了，不烧完等于扔钱），
     多支半的先烧剩得最少的；都是满的才去拆新的 —— 优先上次那种，否则第一支有货的 */
  if (P.hp < P.maxHp - 0.01) {
    const last = P.carePick;
    const lid = last && careKindOf(last) === 'med' ? careIdOf(last) : '';
    const opened = usableCellList().filter(r => r.cell.t === 'med');
    if (opened.length) {
      opened.sort((a, b) => (a.cell.left / MEDKITS[a.cell.id].dur) - (b.cell.left / MEDKITS[b.cell.id].dur));
      const minR = opened[0].cell.left / MEDKITS[opened[0].cell.id].dur;
      const tied = opened.filter(r => r.cell.left / MEDKITS[r.cell.id].dur <= minR + 1e-6);
      const pick = tied.find(r => r.cell.id === lid) || opened[0];
      return careKeyMake('med', pick.cell.id);
    }
    if (lid && medCount(lid) > 0) return careKeyMake('med', lid);
    const own = medOwnedIds();
    if (own.length) return careKeyMake('med', own[0]);
  }
  return null;
}

/* 四步都走不通时该说什么 */
function careIdleMsg() {
  const armorNeed = P.armorLv > 0 && P.armorMax - P.armorHp > 5;
  if (P.hp >= P.maxHp - 0.01 && !armorNeed) return '状态正常 · 没有要处理的伤';
  if (P.hp >= P.maxHp - 0.01) return '身上带着甲修包就能修甲 · 没有修得动这件的';
  return '没有能用的治疗物品了 · 回大厅补给';
}

/* 入袋：局内拾到 / 开箱拿到的医疗物品。一格一件，
   先塞背包（不能直接用），背包满了才进弹挂 / 口袋（快捷可用）。
   返回实际带走的件数。 */
function addMed(id, n) {
  const key = MEDKITS[id] ? id : STARTER_MEDKIT;
  let placed = 0;
  for (let k = 0; k < Math.max(1, n | 0); k++) {
    if (!stowCell({ t: 'med', id: key, left: MEDKITS[key].dur })) break;
    placed++;
  }
  if (placed > 0 && medCount(careIdOf(P.carePick)) <= 0) P.carePick = careKeyMake('med', key);
  return placed;
}
function addStop(id, n) {
  const key = STOPS[id] ? id : 'bandage';
  let placed = 0;
  for (let k = 0; k < Math.max(1, n | 0); k++) {
    if (!stowCell({ t: 'stop', id: key })) break;
    placed++;
  }
  return placed;
}
function addSurg(id, n) {
  const key = SURGERIES[id] ? id : SURG_ORDER[0];
  let placed = 0;
  for (let k = 0; k < Math.max(1, n | 0); k++) {
    if (!stowCell({ t: 'surg', id: key, uses: SURGERIES[key].uses })) break;
    placed++;
  }
  return placed * SURGERIES[key].uses;   // 换算成"几把刀"，0 = 带不走
}

/* 大厅里查存档的那一套（与局内的 medCount / medTotal 对应） */
function saveMedCount(id) {
  const s = SAVE.meds && SAVE.meds[id];
  return s ? (s.n | 0) + ((Number(s.left) || 0) > 0.01 ? 1 : 0) : 0;
}
function saveMedTotal() {
  let n = 0;
  for (const id of MEDKIT_ORDER) n += saveMedCount(id);
  return n;
}
function saveStopTotal() {
  let n = 0;
  for (const id of STOP_ORDER) n += (SAVE.stops && SAVE.stops[id]) | 0;
  return n;
}
function saveSurgTotal() {
  let n = 0;
  for (const id of SURG_ORDER) n += (SAVE.surgs && SAVE.surgs[id] && SAVE.surgs[id].uses) | 0;
  return n;
}
/* 大厅里"短按 5 会用哪种"：上次用的那种还留着就用它，否则第一个还有的 */
function saveCarePick() {
  const list = [];
  for (const id of MEDKIT_ORDER) if (saveMedCount(id) > 0) list.push(careKeyMake('med', id));
  for (const id of STOP_ORDER) if (((SAVE.stops && SAVE.stops[id]) | 0) > 0) list.push(careKeyMake('stop', id));
  for (const id of SURG_ORDER) if (((SAVE.surgs && SAVE.surgs[id] && SAVE.surgs[id].uses) | 0) > 0) list.push(careKeyMake('surg', id));
  if (!list.length) return careKeyMake('med', STARTER_MEDKIT);
  const pick = normCareKey(SAVE.carePick);
  return list.indexOf(pick) >= 0 ? pick : list[0];
}

/* ══════════════════════════════════════════════════════════
   创伤 debuff
   ──────────────────────────────────────────────────────────
   bleed   流血：每层每秒掉血，最低锁 1 血；绷带 / 止血带处理
   red*    贯穿伤（头 / 胸 / 腹）：每层 -10% 血量上限 + 黑边；手术包治
   arm     手臂骨折：开镜 / 换弹 / 打药变慢、散布变大；止痛可屏蔽
   leg     腿部骨折：不能冲刺、移速大降；止痛只屏蔽视觉
   fissure 骨裂：腿骨折后强行冲刺触发，更慢；止痛无效
   weak    虚弱：被拉起后 -20% 上限（目前没有救起流程，先留底）
   ══════════════════════════════════════════════════════════ */
function resetDebuff() {
  P.deb = { bleed: 0, redHead: 0, redChest: 0, redAbdomen: 0, arm: 0, leg: 0, fissure: 0, weak: 0 };
  P.bleedAcc = 0;
  P.painT = 0;
  recalcMaxHp();
}

/* 贯穿伤与虚弱都会压低血量上限：上限一降，当前血量跟着夹住 */
function recalcMaxHp() {
  const d = P.deb || {};
  const red = (d.redHead | 0) + (d.redChest | 0) + (d.redAbdomen | 0);
  const k = 1 - DEBUFF.redHp * red - DEBUFF.weakHp * (d.weak | 0);
  P.maxHp = Math.max(20, Math.round(DEBUFF.baseHp * Math.max(0.25, k)));
  if (P.hp > P.maxHp) P.hp = P.maxHp;
}
function painOn() { return P.painT > 0; }
function redLayers() {
  return (P.deb.redHead | 0) + (P.deb.redChest | 0) + (P.deb.redAbdomen | 0);
}
/* 手臂骨折的负面：止痛期间被压住 */
function armHurt() { return P.deb.arm > 0 && P.painT <= 0; }
/* 腿骨折 / 骨裂 是实打实的结构损伤，止痛只能骗过脑子，跑不动还是跑不动。
   外骨骼撑着的时候腿是机械在带，骨折照挂、但照样能跑（见 X 技能）。 */
function legBroken() {
  if (exoOn()) return false;
  return P.deb.leg > 0 || P.deb.fissure > 0;
}

/* 挂一层创伤。kind: bleed / redHead / redChest / redAbdomen / arm / leg / fissure / weak */
function addDebuff(kind, n, label) {
  const d = P.deb;
  const k = Math.max(1, n | 0);
  let txt = '';
  /* 久经沙场：骨折 / 骨裂这一类结构伤，有一半概率直接扛住 */
  if (toughOn() && (kind === 'leg' || kind === 'arm' || kind === 'fissure')
      && Math.random() < SKILL.tough.traumaMul) {
    popup(P.x + rand(-8, 8), P.y - 46, '久经沙场 · 硬扛', '#ffc98a', 12);
    return;
  }
  if (kind === 'bleed') {
    const before = d.bleed;
    d.bleed = Math.min(DEBUFF.bleedMax, d.bleed + k);
    if (d.bleed === before) return;
    txt = '流血 ×' + d.bleed;
  } else if (kind === 'redHead' || kind === 'redChest' || kind === 'redAbdomen') {
    const before = d[kind];
    d[kind] = Math.min(DEBUFF.redMax, d[kind] + k);
    if (d[kind] === before) return;
    txt = label || '贯穿伤';
  } else if (kind === 'arm' || kind === 'leg') {
    if (kind === 'leg' && exoOn()) return;      // 外骨骼撑着：腿不会被打断
    if (d[kind] > 0) return;
    d[kind] = 1;
    txt = label || (kind === 'arm' ? '手臂骨折' : '腿部骨折');
  } else if (kind === 'fissure') {
    if (exoOn()) return;                        // 同上：外骨骼期间不吃骨裂
    /* 动能辅助卸力：冲击被系统吃掉大半，多半摔不出骨裂 */
    if (kineOn() && Math.random() < SKILL.kine.fissureDodge) {
      popup(P.x + rand(-8, 8), P.y - 46, '动能卸力 · 无骨裂', '#8fe0ff', 12);
      return;
    }
    const before = d.fissure;
    d.fissure = Math.min(2, d.fissure + k);
    if (d.fissure === before) return;
    txt = '骨裂 ×' + d.fissure;
  } else if (kind === 'weak') {
    if (d.weak > 0) return;
    d.weak = 1;
    txt = '虚弱 · 血量上限 -20%';
  } else return;

  recalcMaxHp();
  popup(P.x + rand(-8, 8), P.y - 46, txt, kind === 'bleed' ? '#ff5c7a' : '#ff9b6b', 13);
  Sfx.hurt();
}

/* 一发伤害打在身上，掷一次创伤：越重越可能挂彩。
   概率故意压低——一枪同时挂流血 + 贯穿伤 + 骨折会让人弃游。 */
function rollTrauma(dmg, kind) {
  if (!P.alive || !(dmg > 0)) return;
  const d = P.deb;

  if (kind === 'burn') {
    /* 烧穿皮肤：小概率起一层流血 */
    if (dmg >= 4 && Math.random() < 0.20) addDebuff('bleed', 1);
    return;
  }

  /* 流血：弹片划开皮肉，越重越多 */
  if (dmg >= 9 && d.bleed < DEBUFF.bleedMax) {
    const n = dmg >= 30 ? 2 : 1;
    if (Math.random() < (dmg >= 30 ? 0.72 : 0.55)) addDebuff('bleed', n);
  }

  /* 贯穿伤：只有重弹才穿得进去，随机头 / 胸 / 腹 */
  if (dmg >= 24 && Math.random() < 0.30) {
    const parts = [['redHead', '贯穿伤 · 头部'], ['redChest', '贯穿伤 · 胸部'], ['redAbdomen', '贯穿伤 · 腹部']];
    const avail = parts.filter(pp => d[pp[0]] < DEBUFF.redMax);
    if (avail.length) {
      const pick = avail[Math.floor(Math.random() * avail.length)];
      addDebuff(pick[0], 1, pick[1]);
    }
  }

  /* 骨折：中等以上的伤才可能打断骨头 */
  if (dmg >= 20 && Math.random() < 0.18) {
    if (d.arm <= 0) addDebuff('arm', 1, '手臂骨折');
    else if (d.leg <= 0 && dmg >= 26) addDebuff('leg', 1, '腿部骨折');
  }
  if (dmg >= 26 && Math.random() < 0.14 && d.leg <= 0) addDebuff('leg', 1, '腿部骨折');
}

/* 虚弱：被队友拉起来的人会永久少 20% 血上限。
   目前没有倒地 / 救起流程，先把入口和结算留在这里，
   以后加救援时在被拉起的地方调 applyWeak() 就行。 */
function applyWeak() {
  addDebuff('weak', 1);
}

/* 每帧的创伤结算：流血 tick + 止痛倒计时 */
function updateDebuff(dt) {
  P.painT = Math.max(0, P.painT - dt);
  if (!P.alive) return;
  const d = P.deb;
  if (d.bleed > 0) {
    const dps = DEBUFF.bleedDps * d.bleed;
    /* 锁 1 血：失血只会把你拖到 1 点，不会自己流死 */
    const can = Math.max(0, P.hp - DEBUFF.bleedLock);
    const loss = Math.min(dps * dt, can);
    if (loss > 0) {
      P.hp -= loss;
      P.bleedAcc += loss;
      if (P.bleedAcc >= 3) {
        popup(P.x + rand(-9, 9), P.y - 30, '-' + Math.round(P.bleedAcc), '#ff5c7a', 11);
        P.bleedAcc = 0;
      }
      if (Math.random() < dt * (2 + d.bleed * 2.2)) {
        addParticle(P.x + rand(-10, 10), P.y + rand(-6, 10), {
          vx: rand(-10, 10), vy: rand(20, 60), life: 0.5, r: rand(1.4, 2.8),
          color: pick(['#ff4060', '#c01030']), drag: 0.94,
        });
      }
    }
  }
  /* 腿断着走两步就疼一下，画面外也能感觉到 */
  if ((d.leg > 0 || d.fissure > 0) && Math.random() < dt * 0.9) {
    addParticle(P.x + rand(-8, 8), P.y + rand(0, 8), {
      vx: 0, vy: -8, life: 0.35, r: rand(1.2, 2.2), color: '#ff9b6b', drag: 0.95,
    });
  }
}

/* 手术包这次该处理哪一项：贯穿伤优先，其次腿、手臂、骨裂，最后流血。
   同一部位要好几次才能缝完，所以一次只减一层。
   手术包都能止血（外科清创）：一刀压住全部流血层。 */
function surgTarget() {
  const d = P.deb;
  const parts = [
    ['redHead', '贯穿伤 · 头部'],
    ['redChest', '贯穿伤 · 胸部'],
    ['redAbdomen', '贯穿伤 · 腹部'],
  ].filter(pp => d[pp[0]] > 0);
  if (parts.length) {
    parts.sort((a, b) => d[b[0]] - d[a[0]]);
    return { kind: parts[0][0], label: parts[0][1] + ' ×' + d[parts[0][0]] };
  }
  if (d.leg > 0) return { kind: 'leg', label: '腿部骨折' };
  if (d.arm > 0) return { kind: 'arm', label: '手臂骨折' };
  if (d.fissure > 0) return { kind: 'fissure', label: '骨裂 ×' + d.fissure };
  if (d.bleed > 0) return { kind: 'bleed', label: '清创止血 ×' + (d.bleed | 0) };
  return null;
}

function applySurgery() {
  const t = surgTarget();
  if (!t) return false;
  const d = P.deb;
  if (t.kind === 'bleed') stopBleeding(d.bleed | 0);
  else if (t.kind === 'leg' || t.kind === 'arm') d[t.kind] = 0;
  else if (t.kind === 'fissure') d.fissure = Math.max(0, d.fissure - 1);
  else d[t.kind] = Math.max(0, d[t.kind] - 1);
  recalcMaxHp();
  popup(P.x, P.y - 50, '处理完成 · ' + t.label, '#9fffd0', 14);
  burst(P.x, P.y, 16, { color: ['#9fffd0', '#e8f4ea'], life: 0.55, r: 3.4, spdMin: 30, spdMax: 150, glow: true });
  return true;
}

/* 止血：把 n 层流血压掉 */
function stopBleeding(layers) {
  const n = Math.min(P.deb.bleed, Math.max(1, layers | 0));
  if (n <= 0) return 0;
  P.deb.bleed -= n;
  popup(P.x, P.y - 46, '已止血 ×' + n, '#cfe6f2', 13);
  return n;
}

/* 这个槽现在能不能掏出来 */
function slotReady(slot) {
  if (slot === 'melee') return !!(P.melee && MELEES[P.melee]);
  /* 医疗槽：医疗包、绷带、止痛药、手术包，带着任意一种就能掏出来 */
  if (slot === 'medkit') return careOwnedKeys().length > 0;
  return !!(P.slots && P.slots[slot] && P.owned[P.slots[slot]]);
}

function slotGunId(slot) {
  return (P.slots && GUN_SLOTS.indexOf(slot) >= 0) ? P.slots[slot] : null;
}

/* 局内拾到的枪往哪放：同类槽优先空位，都满了就顶掉没拿在手上的那个槽。
   顶替不会删除 P.owned —— 那把枪还在背包里，撤离后照样入库。 */
function stowGun(id) {
  const isP = !!PISTOL_IDS[id];
  const spots = isP ? ['pistol'] : ['primary', 'secondary'];
  if (!P.slots) return null;
  for (const k of spots) {
    if (!P.slots[k]) { P.slots[k] = id; return k; }
  }
  const idle = spots.find(k => k !== P.curSlot) || spots[0];
  P.slots[idle] = id;
  return idle;
}

/* 按 1~5 / 滚轮：切到对应槽位。
   切到医疗槽只把「上次那种」拿在手上；短按 5 / 左键才是按阶梯自动挑一种开始用。 */
function equipSlot(slot) {
  if (!P.alive) return;
  if (!slotReady(slot)) {
    if (slot === 'medkit') uiToast('没有治疗物品了 · 回大厅补给', 'small warn');
    else if (slot === 'secondary') uiToast('副武器槽是空的 · 回大厅装配', 'small warn');
    else if (slot === 'primary') uiToast('主武器槽是空的 · 回大厅装配', 'small warn');
    else if (slot === 'pistol') uiToast('手枪槽是空的 · 去军火库买一把', 'small warn');
    else uiToast('没有可用的近战武器', 'small warn');
    return;
  }
  if (P.curSlot === slot) {
    if (slot === 'medkit') toggleMedkit();
    return;
  }
  if (modeOn()) exitMode(true);          // 换枪就把手上的技能装置收起来
  if (slot === 'medkit' && P.curSlot !== 'medkit') P.careFrom = P.curSlot;   // 记住从哪把枪切过来的
  P.curSlot = slot;
  P.burstLeft = 0;
  P.reloading = 0;
  P.meleeCd = 0;
  P.ads = 0;
  P.adsPrev = 0;
  if (slot !== 'medkit') { P.medOn = null; P.medWind = 0; P.medHealT = 0; }   // 药收回去了，读条自然作废（不算打断）
  const g = slotGunId(slot);
  if (g) P.weapon = g;
  P.fireCd = Math.max(P.fireCd, 0.14);
  Sfx.tone(420, 0.05, 0.06, 'square');
  if (slot === 'medkit') {
    const key = carePickNow();
    if (key) P.carePick = key;      // 掏出来先拿着，短按 5 / 左键才开始
  }
}

/* 滚轮：在摸得到的槽之间循环 */
function cycleSlot(dir) {
  const list = SLOT_DEFS.map(d => d.id).filter(slotReady);
  if (list.length < 2) return;
  let i = list.indexOf(P.curSlot);
  if (i < 0) i = 0;
  i = (i + (dir > 0 ? 1 : -1) + list.length) % list.length;
  equipSlot(list[i]);
}

/* 挥刀：身前扇形内所有敌人一起吃伤害，静音、不吃盾、不耗弹药 */
function swingMelee() {
  if (!P.alive || P.meleeCd > 0 || knockOn()) return;
  const M = MELEES[P.melee] || MELEES[STARTER_MELEE];
  P.meleeCd = M.rate;
  P.swingT = 0.22;
  P.swingAim = P.aim;
  P.swingHit = 0;
  P.fireCd = Math.max(P.fireCd, 0.05);

  let hitN = 0;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    const d = Math.hypot(dx, dy);
    if (d > P.r + e.r + M.reach) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), P.aim)) > M.arc) continue;
    const ux = d > 0.001 ? dx / d : Math.cos(P.aim);
    const uy = d > 0.001 ? dy / d : Math.sin(P.aim);
    damageEnemy(e, M.dmg, ux, uy, M.knock);
    popup(e.x, e.y - e.r - 8, String(Math.round(M.dmg)), M.color, 13);
    burst(e.x + ux * e.r * 0.6, e.y + uy * e.r * 0.6, 7, {
      color: [M.color, '#ff8fa3'], life: 0.35, r: 3.4, spdMin: 40, spdMax: 190, glow: true,
    });
    hitN++;
  }
  P.swingHit = hitN;
  if (hitN) {
    Sfx.meleeHit();
    shake(4);
    emitNoise(P.x, P.y, 260, 0.35, true);   // 刀声很轻，只惊动贴脸的
  } else {
    Sfx.meleeMiss();
  }
}

function startReload() {
  if (!P.weapon) return;
  const W = weaponStats(P.weapon);
  const a = currentAmmo();
  if (P.reloading > 0 || a.mag >= W.mag || reserveOf(a.cal || calOfWeapon(P.weapon)) <= 0) return;
  P.burstLeft = 0;
  /* 手臂骨折时单手换弹，慢一截；止痛能压住 */
  P.reloading = W.reload * (armHurt() ? DEBUFF.armReload : 1);
  Sfx.reload_();
}

function finishReload() {
  const W = weaponStats(P.weapon);
  const a = currentAmmo();
  const need = W.mag - a.mag;
  const take = drainReserve(a.cal || calOfWeapon(P.weapon), need, a.tier);
  a.mag += take;
}

/* 扣扳机：全自动按住就连，半自动每发都要重新按，点射一次打三发 */
function tryFire(edge) {
  if (!P.weapon || !P.owned[P.weapon]) return;
  if (dashOn() || knockOn() || modeOn() || isDowned()) return;   // 推进 / 倒地 / 手持技能都不能开火
  const W = weaponStats(P.weapon);
  const a = currentAmmo();
  if (P.reloading > 0 || a.mag <= 0 || P.fireCd > 0) return;

  const bursting = P.burstLeft > 0;
  if (W.mode === 'semi') {
    if (!bursting && !edge) return;          // 半自动：每一发都要重新扣扳机
  } else if (!bursting) {
    if (!mouse.down) return;                 // 全自动 / 点射：按住就行
    if (W.mode === 'burst') P.burstLeft = W.burst || 3;
  }
  playerShoot();
}

function playerShoot() {
  if (!P.weapon) return;
  const W = weaponStats(P.weapon);
  const a = currentAmmo();
  if (a.mag <= 0) { startReload(); return; }

  a.mag--;
  /* 这一发吃的是什么弹：弹级决定穿甲和肉伤倍率 */
  const T = ammoTier(a.tier == null ? 1 : a.tier);
  const calId = a.cal || calOfWeapon(P.weapon);
  /* 点射内的间隔很短，打完整轮才进入循环冷却 */
  P.fireCd = (P.burstLeft > 1) ? (W.burstGap || 0.06) : W.rate;
  if (P.burstLeft > 0) P.burstLeft--;
  P.recoil = W.recoil * (1 - P.ads * 0.5) * adrRecoilMul();   // 开镜后坐减半；肾上腺素再压一档
  P.muzzle = 0.06;
  Sfx.shoot(W.sound);

  const muzzleDist = P.r + 20;
  const mx = P.x + Math.cos(P.aim) * muzzleDist;
  const my = P.y + Math.sin(P.aim) * muzzleDist;

  for (let i = 0; i < W.count; i++) {
    const sp0 = W.spread * (1 - P.ads * (1 - adsOf(W).spread)) * (armHurt() ? DEBUFF.armSpread : 1)  // 开镜收束散布；手断了端不稳
              * (1 + (P.armorAim || 0))                                                              // 护甲瞄准惩罚：板子越硬枪口越晃
              * (P.sprinting ? SPRINT.spreadMul : 1);                                                // 跑动中开枪：枪口飘
    const spread = W.count > 1 ? rand(-sp0, sp0) : rand(-sp0, sp0) * 0.6;
    const ang = P.aim + spread;
    const spd = W.bspeed * rand(0.94, 1.06);
    G.bullets.push({
      x: mx, y: my, px: mx, py: my, ox: mx, oy: my,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: W.size, dmg: W.dmg * T.dmgMul, color: T.color,
      life: W.range / W.bspeed,
      hostile: false,
      /* pen 是弹级，fleshMul 只对 0 级修脚弹生效；cal 只用于飘字/统计 */
      pen: T.lv, fleshMul: T.fleshMul, cal: calId, tier: T.lv,
      /* 护甲伤害：来自枪（armorDmg）× 弹级系数（armorMul） */
      armorDmg: W.armorDmg || 0, armorMul: T.armorMul || 1,
      /* fb：这把枪的远距衰减（d0 之后线性掉到 min）；enemy 弹没有这个字段 */
      fb: W.fb ? { d0: W.fb.d0, d1: W.range, min: W.fb.min } : null,
      pierce: W.pierce || 0,
      hitSet: null,
      knock: W.knock,
    });
  }

  burst(mx, my, W.count > 1 ? 10 : 5, {
    angle: P.aim, spread: 0.45, spdMin: 120, spdMax: 440,
    color: ['#fff3c4', T.color], life: 0.2, r: 3, glow: true,
  });
  G.particles.push({
    x: mx, y: my, vx: 0, vy: 0, life: 0.07, max: 0.07,
    r: W.count > 1 ? 20 : (W.cat === 'sniper' ? 26 : 12),
    color: '#fff8dc', drag: 1, glow: true, shape: 'flash', grav: 0, rot: 0, spin: 0,
  });

  P.x -= Math.cos(P.aim) * W.recoil * 0.35;
  P.y -= Math.sin(P.aim) * W.recoil * 0.35;
  shake(W.recoil * (W.count > 1 ? 1.5 : 0.85));

  // 枪声穿墙传播，把附近敌人引过来查看
  emitNoise(mx, my, W.noise || 700, 0.55, true);

  if (a.mag <= 0) startReload();
}

/* ══════════════════════════════════════════════════════════
   治疗物品的使用
   ──────────────────────────────────────────────────────────
   三种东西共用一套读条：
     med  医疗包 —— 读条完开始按耐久回血，血满自动停，耐久留到下次
     stop 止血件 —— 读条完压掉几层流血，一次性消耗
     surg 手术包 —— 读条完处理一项创伤，扣一次
   读条期间换槽 / 收手就白读，物品不消耗。
   ══════════════════════════════════════════════════════════ */

/* 读条时长：手臂骨折时拆包、缝合都不利索（止痛可以屏蔽） */
function careWindSec(base) {
  return base * (armHurt() ? DEBUFF.armHeal : 1) * careTimeMul();
}

/* 医疗包这次要读多久 —— 读条长度由「要回多少血」决定：
   回血窗口 = ceil(缺口 / 实际每秒回血)，加上启动段。血越满读得越短。
   窗口按「缺口」和「这支还剩的耐久」取小：耐久只够回一半，就没必要读完。 */
function medReadPlan(M, s) {
  const need = Math.max(0, P.maxHp - P.hp);
  const eff = P.deb.bleed > 0 ? WOUND_HEAL_K : 1;         // 还在流血：包扎效率打折
  const hps = Math.max(0.5, M.hps * eff * careRateMul());  // 高效治疗：每秒灌得更多，窗口更短
  const canPay = Math.max(0, s ? s.left : 0);             // 耐久只够回这么多
  const heal = Math.min(need, canPay > 0 ? canPay : need);
  const win = Math.max(1, Math.ceil(heal / hps));         // 向上取整到整秒
  return { need, heal, hps, win, wind: careWindSec(M.wind), total: careWindSec(M.wind) + win };
}

function careBusy() { return !!(P.medOn || P.medCd > 0); }

/* 统一的"使用"入口：care key → 对应分支 */
function startCare(key) {
  const k = careKindOf(key);
  /* 血满了还按 5：先说清楚原因，别被后面的收手冷却抢了台词 */
  if (k === 'med' && P.hp >= P.maxHp - 0.01) { uiToast('生命值已满，不用包扎', 'small'); return false; }
  /* 刚收手的 0.25s 里再按，给一句反馈，别让人以为按键没生效 */
  if (P.medCd > 0.05) { uiToast('手还没收回来 · ' + P.medCd.toFixed(1) + 's 后再起手', 'small'); return false; }
  if (k === 'stop') return startStopBleed(careIdOf(key));
  if (k === 'surg') return startSurgery(careIdOf(key));
  if (k === 'repair') return startArmorRepair(careIdOf(key));
  return startMedHeal(careIdOf(key));
}

/* 开始包扎（不消耗整支，只扣耐久）；返回是否成功 */
function startMedHeal(id) {
  if (!P.alive) return false;
  const key = MEDKITS[id] ? id : careIdOf(carePickNow() || '');
  if (!key || !MEDKITS[key]) { uiToast('没有医疗包了 · 回大厅补给', 'small warn'); return false; }
  const M = MEDKITS[key];
  const s = medUnit(key);
  if (!s || s.left <= 0.01) {
    uiToast(M.name + ' 用完了', 'small warn');
    P.carePick = careKeyMake('med', careIdOf(carePickNow() || careKeyMake('med', key)));
    return false;
  }
  if (P.hp >= P.maxHp - 0.01) { uiToast('生命值已满，不用包扎', 'small'); P.medCd = 0.5; return false; }
  if (careBusy()) return false;

  P.medOn = careKeyMake('med', key);
  P.medKind = 'med';
  P.carePick = P.medOn;
  P.healAcc = 0;
  P.medCd = 0.35;
  const plan = medReadPlan(M, s);
  P.medWind = plan.wind;             // 先走启动读条，读条期间一滴血都不回
  P.medWindT = plan.wind;
  P.medHealW = plan.win;             // 之后的回血窗口：缺多少血就读多少秒
  P.medHealT = plan.win;

  popup(P.x, P.y - 34, M.name + ' · 读条 ' + plan.total.toFixed(1) + 's', M.color, 13);
  Sfx.tone(420, 0.08, 0.05, 'sine', 620);
  return true;
}

/* 急救消耗品：绷带止一层 / 止血带全压住 / 止痛药只是让你暂时不疼 */
function startStopBleed(id) {
  if (!P.alive) return false;
  const key = STOPS[id] ? id : 'bandage';
  const S = STOPS[key];
  if (stopCount(key) <= 0) { uiToast(S.name + ' 用完了', 'small warn'); return false; }
  if (S.pain) {
    if (P.painT > 0) { uiToast('止痛还在生效 · 剩 ' + Math.ceil(P.painT) + 's', 'small'); P.medCd = 0.4; return false; }
  } else if (P.deb.bleed <= 0) {
    uiToast('没有在流血', 'small'); P.medCd = 0.4; return false;
  }
  if (careBusy()) return false;

  P.medOn = careKeyMake('stop', key);
  P.medKind = 'stop';
  P.carePick = P.medOn;
  P.medCd = 0.3;
  P.medWind = careWindSec(S.sec);
  P.medWindT = P.medWind;

  popup(P.x, P.y - 34, S.name + (S.pain ? ' · 服用' : ' · 止血'), S.color, 13);
  if (S.pain && stopCount(key) > 1) uiToast(S.name + ' · 单次止痛 ' + S.pain + 's · 身上还有 ' + (stopCount(key) - 1) + ' 份', 'small');
  Sfx.tone(420, 0.08, 0.05, 'sine', 600);
  return true;
}

/* 手术包：一次治一项，优先贯穿伤 → 腿 → 手臂 → 骨裂 */
function startSurgery(id) {
  if (!P.alive) return false;
  const key = SURGERIES[id] ? id : SURG_ORDER[0];
  const S = SURGERIES[key];
  if (surgUses(key) <= 0) { uiToast(S.name + ' 用完了', 'small warn'); return false; }
  const t = surgTarget();
  if (!t) { uiToast('没有需要手术的伤', 'small'); P.medCd = 0.4; return false; }
  if (careBusy()) return false;

  P.medOn = careKeyMake('surg', key);
  P.medKind = 'surg';
  P.carePick = P.medOn;
  P.medCd = 0.3;
  P.medWind = careWindSec(S.sec);
  P.medWindT = P.medWind;

  popup(P.x, P.y - 34, S.name + ' · ' + t.label, S.color, 13);
  Sfx.tone(380, 0.1, 0.05, 'sine', 560);
  return true;
}

/* 甲修包：读条完把护甲耐久敲回去 —— 恢复 = 点数 × 维修效率，上限损耗 = 恢复 × 耐久损耗率 */
function startArmorRepair(id) {
  if (!P.alive) return false;
  const key = REPAIRS[id] ? id : REPAIR_ORDER[0];
  const R = REPAIRS[key];
  if (repairCount(key) <= 0) { uiToast(R.name + ' 用完了 · 整备界面带一份出门', 'small warn'); return false; }
  if (P.armorLv <= 0) { uiToast('身上没穿甲 · 修什么', 'small'); P.medCd = 0.4; return false; }
  const missing = P.armorMax - P.armorHp;
  if (missing <= 0.5) { uiToast('护甲完好 · 不用修', 'small'); P.medCd = 0.4; return false; }
  if (P.armorLv > R.capLv) {
    uiToast(ARMORS[P.armorId].name + '（' + P.armorLv + ' 级）超出修护上限 · 需要 ' + (P.armorLv >= 6 ? '红甲修' : ['','蓝','蓝','蓝','紫','金','红'][P.armorLv] + '甲修以上'), 'small warn');
    P.medCd = 0.4;
    return false;
  }
  if (careBusy()) return false;

  const kitLeft = repairLeftOf(key);
  const restore = Math.min(kitLeft * ARMORS[P.armorId].eff, missing);   // 点数 × 维修效率 = 可恢复耐久
  P.medOn = careKeyMake('repair', key);
  P.medKind = 'repair';
  P.carePick = P.medOn;
  P.medCd = 0.3;
  P.medWind = careWindSec(R.wind);
  P.medWindT = P.medWind;
  P.medHealW = restore;              // 计划恢复量（结算时按剩余重算）

  popup(P.x, P.y - 34, R.name + ' · 敲甲 +' + Math.floor(restore), R.color, 13);
  Sfx.tone(360, 0.1, 0.05, 'square', 520);
  return true;
}

/* ── 收手 ──
   只有一种打断：玩家自己按右键（或再按 5 / 左键）收手。
   挨打、起跑、翻窗都不会自动中断 —— 代价只有"时间"：读条白读、回血中断，
   但已经灌进去的那部分耐久不会返还（耐久是按血量 1:1 扣的，血留下了，耐久就没了）。 */
function stopCare(msg, cd) {
  if (!P.medOn) return;
  P.medOn = null;
  P.medWind = 0;
  P.medHealT = 0;               // 剩下的回血窗口作废（已经灌进去的血留着）
  P.medHealW = 0;
  P.medCd = Math.max(P.medCd, cd || 0.25);
  if (msg) uiToast(msg, 'small');
}
/* 老名字还留着：外面有几处是按"包扎"来调用的 */
function stopMedHeal(msg) { stopCare(msg); }

/* 手上还端着医疗槽的话，把进医疗槽之前那把枪换回来 */
function backToGun() {
  if (!P.alive || P.curSlot !== 'medkit') return;
  const back = P.careFrom;
  P.careFrom = null;
  if (back && back !== 'medkit' && back !== P.curSlot && slotReady(back)) equipSlot(back);
}

/* 治疗结束（打完 / 收手）：停手 + 换回之前的枪 */
function endCareBack(msg, cd) {
  if (P.medOn) stopCare(msg, cd);
  backToGun();
}

/* 按 5 / 左键：开始或停止治疗 —— 不再切到医疗槽，原地就用，枪一直在手上 */
function toggleMedkit() {
  if (!P.alive) return;
  if (P.medOn) { endCareBack('已停止'); return; }
  const key = careAutoPick();
  if (!key) { uiToast(careIdleMsg(), 'small'); return; }
  if (modeOn()) exitMode(true);          // 手上有技能装置先收起来
  startCare(key);
}

/* 长按 5 选中即用：原地进启动读条，不换手里的枪 */
function useCareNow(key) {
  if (!P.alive || !key) return false;
  if (P.medOn === key) return true;   // 正在用的就是这一种，别把读条重开
  if (modeOn()) exitMode(true);
  if (P.medOn) stopCare();
  P.carePick = key;
  P.medCd = 0;                                   // 换药不算"刚收手"的那 0.25s 抖动
  return startCare(key);
}

/* ── 短按 / 长按 5 ──
   按下只记账，松手时才决定：
     短按 = 让 careAutoPick 按「止血 → 止痛 → 手术 → 回血」自己挑一样；
     长按 = 弹出选择盘，滚轮挑型号。 */
function medPressDown() {
  if (!P.alive) return;
  const own = careOwnedKeys();
  if (!own.length) { uiToast('没有治疗物品了 · 回大厅补给', 'small warn'); return; }
  MED_SEL.down = true;
  MED_SEL.hold = 0;
  MED_SEL.open = false;
  MED_SEL.wheel = 0;
  MED_SEL.list = own;
  /* 选择盘默认停在这会儿「该用」的那件上：短按 5 会自动选它，长按想换成别的再滚轮 */
  MED_SEL.idx = Math.max(0, own.indexOf(careAutoPick() || carePickNow() || own[0]));
}

function medPressUp() {
  if (!MED_SEL.down) return;
  MED_SEL.down = false;
  if (MED_SEL.open) {
    MED_SEL.open = false;
    const id = MED_SEL.list[MED_SEL.idx];
    if (id) {
      Sfx.tone(660, 0.06, 0.05, 'square');
      P.carePick = id;
      useCareNow(id);            // 选中即用：松手直接进读条
    }
    return;
  }
  toggleMedkit();
}

/* 每帧推进长按计时，并把滚轮攒下的步数结算掉 */
function updateMedSelect(dt) {
  if (!MED_SEL.down) return;
  MED_SEL.hold += dt;
  if (!MED_SEL.open && MED_SEL.hold >= MED_HOLD_T) {
    MED_SEL.list = careOwnedKeys();
    if (!MED_SEL.list.length) { MED_SEL.down = false; return; }
    MED_SEL.open = true;
    MED_SEL.idx = Math.max(0, MED_SEL.list.indexOf(careAutoPick() || carePickNow() || MED_SEL.list[0]));
    Sfx.tone(520, 0.07, 0.05, 'square');
  }
  if (MED_SEL.open && MED_SEL.wheel) {
    const n = MED_SEL.list.length;
    MED_SEL.idx = ((MED_SEL.idx + MED_SEL.wheel) % n + n) % n;
    MED_SEL.wheel = 0;
    Sfx.tone(600, 0.04, 0.04, 'square');
  }
}

/* 读条与结算：三种物品共用前半段，医疗包在后面接持续回血 */
/* 当前正在使用的医疗包的 perk；不在挂水就返回空串 */
function activeMedPerk() {
  if (!P.medOn || careKindOf(P.medOn) !== 'med') return '';
  const M = MEDKITS[careIdOf(P.medOn)];
  return M ? (M.perk || '') : '';
}

function updateMedHeal(dt) {
  if (!P.medOn) return;
  if (!P.alive || isDowned()) { P.medOn = null; P.medWind = 0; P.medHealT = 0; P.medHealW = 0; P.careFrom = null; return; }

  const key = P.medOn;
  const kind = careKindOf(key);
  const id = careIdOf(key);

  /* ── 启动读条：掏包、拆包装、扎针 / 下刀。这段时间不回血，被打断就白读 ── */
  if (P.medWind > 0) {
    P.medWind = Math.max(0, P.medWind - dt);
    if (Math.random() < dt * 7) {
      addParticle(P.x + rand(-14, 14), P.y + rand(-10, 10), {
        vx: rand(-8, 8), vy: rand(-26, -8), life: 0.4, r: rand(1.6, 3),
        color: kind === 'surg' ? '#8ef2ff' : '#ffd66b', drag: 0.94, glow: true,
      });
    }
    if (P.medWind > 0) return;

    /* 急救消耗品：读条完直接结算，一次性 */
    if (kind === 'stop') {
      const S = STOPS[id] || STOPS.bandage;
      consumeStopUnit(id);
      if (S.pain) {
        P.painT = Math.max(P.painT, S.pain);
        popup(P.x, P.y - 46, '止痛 ' + S.pain + 's', S.color, 14);
        if (stopCount(id) > 0) popup(P.x, P.y - 62, S.short + ' 还剩 ' + stopCount(id) + ' 份', 'rgba(190,230,250,0.9)', 12);
      } else {
        stopBleeding(S.layers);
      }
      Sfx.heal();
      if (stopCount(id) <= 0) uiToast(S.name + ' 用完了', 'small warn');
      P.medOn = null;
      P.medCd = Math.max(P.medCd, 0.5);
      backToGun();
      return;
    }

    /* 甲修包：读条完结算 —— 恢复多少耐久耗多少点数，上限按维修效率掉 */
    if (kind === 'repair') {
      const R = REPAIRS[id] || REPAIRS.repair_b;
      const s = repairUnit(id);
      if (!s || s.left <= 0.01) { uiToast(R.name + ' 用完了', 'small warn'); P.medOn = null; backToGun(); return; }
      if (P.armorLv <= 0) { uiToast('身上没穿甲', 'small'); P.medOn = null; backToGun(); return; }
      const A = ARMORS[P.armorId];
      const missing = P.armorMax - P.armorHp;
      if (missing <= 0.5) { uiToast('护甲完好', 'small'); P.medOn = null; backToGun(); return; }
      /* ── 修甲公式 ──
         维修效率 A.eff：1 点甲修剂恢复 A.eff 点护甲耐久（中 0.9 / 低 0.59 / 高 1.2）；
         耐久损耗 A.loss：每恢复 1 点耐久，上限磨掉 A.loss 点（高 9% / 中 7.5% / 低 6%）。
         从 0 修满时上限正好掉「当前上限 × 损耗率」，且逐次复利：
           0/150 修满 → 扣 13.5 → 136.5；再打空再修满 → 扣 12.285 → 124.215。
         点数按 missing/eff 精确扣，恢复量不溢出缺口。 */
      const want = missing / A.eff;                       // 修满缺口需要的点数
      const used = Math.min(s.left, want);
      const restore = used * A.eff;
      if (restore <= 0.5) { uiToast('修不动了', 'small'); P.medOn = null; backToGun(); return; }
      s.left = Math.max(0, s.left - used);
      if (s.left <= 0.01) consumeRepairUnit(id);          // 点数烧完的空格清出来
      const maxLoss = restore * A.loss;
      P.armorHp += restore;
      P.armorMax = Math.max(1, P.armorMax - maxLoss);
      popup(P.x, P.y - 46, '修甲 +' + Math.floor(restore) + ' · 上限 -' + (Math.floor(maxLoss * 10) / 10), R.color, 14);
      popup(P.x, P.y - 64, ARMORS[P.armorId].short + ' 耐久 ' + Math.round(P.armorHp) + '/' + Math.round(P.armorMax), armorLvColor(P.armorLv), 12);
      Sfx.heal();
      if (repairCount(id) <= 0) uiToast(R.name + ' 用完了', 'small warn');
      P.medOn = null;
      P.medCd = Math.max(P.medCd, 0.5);
      backToGun();
      return;
    }

    /* 手术包：读条完处理一项，扣一次 */
    if (kind === 'surg') {
      const S = SURGERIES[id] || SURGERIES.surg_simple;
      const t = surgTarget();
      if (!t) { uiToast('没有需要手术的伤', 'small'); P.medOn = null; P.medCd = 0.4; backToGun(); return; }
      if (surgUses(id) <= 0) { uiToast(S.name + ' 用完了', 'small warn'); P.medOn = null; backToGun(); return; }
      consumeSurgUse(id);
      applySurgery();
      Sfx.heal();
      if (surgUses(id) <= 0) uiToast(S.name + ' 用完了', 'small warn');
      P.medOn = null;
      P.medCd = Math.max(P.medCd, 0.6);
      backToGun();
      return;
    }

    /* 医疗包：读条完成才真正处理伤口 + 止痛（顺带把火扑掉） */
    const M = MEDKITS[id] || MEDKITS[STARTER_MEDKIT];
    if (M.perk === 'cure') {
      const had = P.burnT > 0;
      P.burnT = 0;
      P.burnTick = 0;
      P.painT = Math.max(P.painT, M.pain || 20);
      if (had) popup(P.x, P.y - 48, '伤口处理 · 止痛 ' + M.pain + 's', '#9fffd0', 14);
      /* 开箱即止血：一把压住全部流血层，每压 1 层额外烧 MEDBOX_STOP_COST 点耐久 */
      const s0 = medUnit(id);
      const layers = P.deb.bleed | 0;
      if (layers > 0 && s0) {
        const cost = Math.min(layers * MEDBOX_STOP_COST, s0.left);
        s0.left = Math.max(0, s0.left - cost);
        stopBleeding(layers);
        popup(P.x, P.y - 62, '止血 ×' + layers + ' · 耐久 -' + Math.ceil(cost), M.color, 13);
        if (s0.left <= 0.01) {          // 止血就把这支烧干了：直接收手
          consumeMedUnit(id);
          P.medOn = null;
          uiToast(M.name + ' 用完了', 'small warn');
          backToGun();
          return;
        }
      }
    }
    Sfx.heal();
    popup(P.x, P.y - 44, '开始回血 · ' + P.medHealT.toFixed(1) + 's', M.color, 12);
  }

  /* ── 持续回血：只有医疗包走这一段 ── */
  if (kind !== 'med') { P.medOn = null; return; }

  const M = MEDKITS[id] || MEDKITS[STARTER_MEDKIT];
  const s = medUnit(id);
  if (!s) { P.medOn = null; return; }

  if (P.hp >= P.maxHp - 0.01) { P.medOn = null; uiToast('生命值已满', 'small'); backToGun(); return; }
  /* 这一支的耐久耗光就扔格收手 —— 想接着灌得换一支、再走一次启动读条 */
  if (s.left <= 0.01) {
    consumeMedUnit(id);                          // 用完的空格清出来
    P.medOn = null;                              // 自然用完不留冷却：换一支立刻能起手
    uiToast(M.name + ' 这支用完了', 'small');
    backToGun();
    return;
  }

  /* 还在流血的时候包扎效率很低，止血带能先解决这个问题 */
  const eff = P.deb.bleed > 0 ? WOUND_HEAL_K : 1;
  const heal = Math.min(M.hps * eff * careRateMul() * dt, s.left, P.maxHp - P.hp);
  if (heal <= 0) { P.medOn = null; backToGun(); return; }

  P.hp += heal;
  s.left = Math.max(0, s.left - heal);
  P.healAcc += heal;

  /* 回血窗口每秒都在烧：烧完就收手。窗口按「起手时的缺口」定死，
     中途又挨了打导致没回满，就自己再读一次 —— 不自动补时。 */
  P.medHealT = Math.max(0, P.medHealT - dt);
  if (P.medHealT <= 0) {
    P.medOn = null;
    if (P.hp < P.maxHp - 0.01) uiToast('读条走完了 · 还没回满，再按 5 续一次', 'small');
    backToGun();
    return;
  }

  if (P.healAcc >= 10) {
    popup(P.x + rand(-10, 10), P.y - 36, '+' + Math.round(P.healAcc), M.color, 13);
    P.healAcc = 0;
  }
  if (Math.random() < dt * 14) {
    addParticle(P.x + rand(-12, 12), P.y + rand(-12, 12), {
      vx: rand(-12, 12), vy: rand(-40, -14), life: 0.55, r: rand(2, 3.6),
      color: M.color, drag: 0.92, glow: true,
    });
  }
}

/* ── 跑步结算：移动中按一下 Shift 就进入跑步姿态 ──
   姿态是「锁存」的：只要人还在移动就一直跑，不用按着不放；
   松开方向键（停下来）姿态解除，再次移动后要重新按 Shift 才会接着跑。
   只有「在动 + 没开镜 + 没换弹 + 没在包扎 + 腿没断 + 没力竭」才跑得起来；
   已经在跑的人可以一直跑到 0，重新起跑要 >= resumeAt，避免在 0 附近反复抖。 */
function updateSprint(dt, il) {
  const load = P.armorLoad || 0;
  if (dashOn() || knockOn() || isDowned()) { P.sprinting = false; P.sprintLatch = false; return; }   // 推进 / 倒地时不算跑
  const ready = P.alive && il > 0 && P.ads < 0.3 && P.reloading <= 0 &&
                P.medOn === null && !legBroken() && P.exhaust <= 0 && !modeOn();
  /* 锁存：移动中按 Shift 上膛；一停下来就解除，重新起跑要再按一次 */
  if (keys['shift'] && il > 0 && ready && P.stamina >= SPRINT.resumeAt) P.sprintLatch = true;
  if (il <= 0 || !ready) P.sprintLatch = false;
  const run = ready && P.sprintLatch &&
              (P.sprinting ? P.stamina > 0 : P.stamina >= SPRINT.resumeAt);

  if (run && !P.sprinting) Sfx.dash();          // 起跑：一声脚步
  P.sprinting = run;

  if (P.sprinting) {
    /* 重甲更费体力；冻伤每层再 +10%（冻僵了跑得费劲） */
    const drain = SPRINT.drain * (1 + SPRINT.loadDrain * load) * (1 + 0.10 * P.chill) * dt;
    P.stamina -= drain;
    if (P.stamina <= 0) {
      P.stamina = 0;
      P.sprinting = false;
      P.exhaust = SPRINT.exhaustT;
      popup(P.x, P.y - 46, '体力见底', '#ffb347', 12);
      Sfx.breath();
    }
  } else {
    const regen = (il > 0 ? SPRINT.regenWalk : SPRINT.regen) * (P.exhaust > 0 ? SPRINT.exhaustRegen : 1);
    P.stamina = Math.min(SPRINT.max, P.stamina + regen * dt);
    if (P.exhaust > 0) P.exhaust = Math.max(0, P.exhaust - dt);
  }
}

function updatePlayer(dt) {
  updateMedSelect(dt);          // 长按 5 的计时 / 选择盘滚轮
  updateDebuff(dt);             // 流血 tick / 止痛倒计时
  updateFrosts(dt);             // 霜区结算 / 冻伤叠层
  updateMedHeal(dt);            // 包扎按耐久持续回血
  updateOperatorSkills(dt);     // 干员技能：冷却 / 三连发 / 外骨骼 / 滑铲计时

  /* 激素针的后续回血 */
  if (P.regenT > 0 && P.alive && !isDowned()) {
    P.regenT = Math.max(0, P.regenT - dt);
    P.hp = Math.min(P.maxHp, P.hp + SKILL.heal.regen * dt);
  }

  /* 蜂医倒地：只能 WASD 爬行 + 长按 F 自救，打不了枪用不了技能 */
  if (isDowned()) {
    updateDowned(dt);
    P.aim = Math.atan2(mouse.y / ZOOM + G.cam.y - P.y, mouse.x / ZOOM + G.cam.x - P.x);
    mouse.pressed = false;
    mouse.right = false;
    return;
  }

  const wmx = mouse.x / ZOOM + G.cam.x;
  const wmy = mouse.y / ZOOM + G.cam.y;
  mouse.wx = wmx; mouse.wy = wmy;
  P.aim = Math.atan2(wmy - P.y, wmx - P.x);

  let ix = 0, iy = 0;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (keys['w'] || keys['arrowup']) iy -= 1;
  if (keys['s'] || keys['arrowdown']) iy += 1;
  const il = Math.hypot(ix, iy);
  if (il > 0) { ix /= il; iy /= il; }

  /* 被虎蹲炮掀翻：站不起来也开不了枪，只能等这 2 秒过去 */
  if (knockOn()) { ix = 0; iy = 0; }
  /* 遥控巡飞弹时人钉在原地：WASD 此时归导弹 */
  if (modeOn() && P.op.mode.controlling) { ix = 0; iy = 0; }

  /* ── 跑步：这一步要排在开镜之前，跑起来就没法开镜 ── */
  updateSprint(dt, il);

  /* ── 开镜：右键按住抬枪收束视野，换弹 / 阵亡 / 跑动强制关镜 ── */
  const wNow = weaponStats(P.weapon);
  const aCfg = adsOf(wNow);
  const gunOut = P.curSlot !== 'melee' && P.curSlot !== 'medkit';
  const adsOn = mouse.right && gunOut && P.alive && P.reloading <= 0 && !P.sprinting
                && P.concuss <= 0 && !dashOn() && !knockOn() && !modeOn() && !isDowned()
                && !P.medOn && P.medCd <= 0;
  /* 手臂断了抬枪又慢又抖，止痛之后能压住；大容量弹挂也会拖慢抬枪。
     蛊的肾上腺素：开镜更快；圈里前 10 秒连装备的惩罚一起抹掉 */
  const gearClear = adrClearGear();
  const rigAds = rigWornMods().ads;
  const adsTime = aCfg.time * (armHurt() ? DEBUFF.armAds : 1) * (1 + 0.12 * P.chill)
                * (1 + (gearClear ? 0 : rigAds) / 100) * adrAdsMul();
  P.ads = clamp(P.ads + (adsOn ? dt / adsTime : -dt / (adsTime * 0.75)), 0, 1);
  if (P.ads > 0.02 && P.adsPrev <= 0.02) Sfx.adsIn();
  if (P.ads <= 0.02 && P.adsPrev > 0.02) Sfx.adsOut();
  P.adsPrev = P.ads;

  let spd = P.speed * (wNow.moveMul || 1);           // 配件带来的负重 / 轻量化
  spd *= 1 + (gearClear ? 0 : rigWornMods().spd) / 100;  // 弹挂移速修正（肾上腺素前 10 秒抹掉）
  if (!gearClear) {
    spd *= 1 - SPRINT.loadWalk * (P.armorLoad || 0);  // 护甲负重：穿得越厚走得越慢
    spd *= 1 - (P.armorMove || 0);                    // 护甲移速惩罚（具名甲各自不同）
  }
  spd *= adrMoveMul();                               // 蛊：肾上腺素的小幅移速加成
  if (P.sprinting) spd *= SPRINT.mul;                // 按住 Shift：跑步
  else if (P.exhaust > 0) spd *= SPRINT.exhaustMul;  // 体力见底：先喘几口
  if (P.curSlot === 'melee') spd *= 1.06;            // 收枪持刀：跑得更利索
  else if (P.medOn && activeMedPerk() !== 'move') spd *= 0.92;   // 一边包扎一边走，慢一点
  /* 创伤：流血越多越虚；腿断了直接掉一半多；骨裂再叠一层，止痛都救不回来 */
  if (P.deb.bleed > 0) spd *= 1 - Math.min(0.20, 0.05 * P.deb.bleed);
  /* 久经沙场：腿断 / 骨裂 / 冻伤三条减速各按自己的抗性打折（改 SKILL.tough 即刻生效）
     以前三处都读 legMul，fissureMul / chillMul 是死字段，改配置不生效 */
  const tough = toughOn();
  const legK = tough ? SKILL.tough.legMul : 1;
  const fissK = tough ? SKILL.tough.fissureMul : 1;
  const chillK = tough ? SKILL.tough.chillMul : 1;
  if (P.deb.leg > 0) spd *= 1 - (1 - DEBUFF.legMove) * legK;
  if (P.deb.fissure > 0) spd *= 1 - DEBUFF.fissureMove * P.deb.fissure * fissK;
  if (armHurt()) spd *= 0.96;                        // 一只手挂着，跑起来也别扭
  /* 冻伤：每层再慢 7%，霜区里叠满三层基本挪不动 */
  if (P.chill > 0) spd *= 1 - 0.07 * P.chill * chillK;
  /* 手上拿着技能装置：脚步放慢一点 */
  if (modeOn()) spd *= 0.9;
  if (P.reloading > 0) spd *= 0.82;
  if (P.fireCd > 0.02) spd *= 0.94;
  spd *= 1 - P.ads * (1 - aCfg.move);            // 开镜走得慢（重枪更慢）
  if (exoOn()) spd *= SKILL.exo.move;            // 外骨骼推着人往前走
  if (P.op && P.op.kine > 0) spd *= SKILL.kine.move;   // 动能辅助：技能后那一小段加速
  if (P.concuss > 0) spd *= 0.65;                // 被自己的榴弹震懵了，脚下发飘

  /* 滑铲：方向锁死、速度按剩余时间衰减 —— 会盖掉上面所有移速修正 */
  if (P.op && P.op.slide > 0) {
    const k = P.op.slideDur ? P.op.slide / P.op.slideDur : 0;
    const boost = exoOn() ? SKILL.exo.slide : 1;
    spd = P.speed * SKILL.slide.mul * boost * (0.55 + 0.45 * k);
    ix = Math.cos(P.op.slideA);
    iy = Math.sin(P.op.slideA);
  }

  /* 动力推进：方向与速度全锁，位移结束后才把控制权还给你 */
  if (dashOn()) {
    spd = P.op.dashSpd;
    ix = Math.cos(P.op.dashA);
    iy = Math.sin(P.op.dashA);
    if (Math.random() < dt * 60) {
      addParticle(P.x - Math.cos(P.op.dashA) * (P.r + 4) + rand(-5, 5),
                  P.y - Math.sin(P.op.dashA) * (P.r + 4) + rand(-5, 5), {
        vx: rand(-40, 40), vy: rand(-40, 40), life: rand(0.15, 0.3), r: rand(2, 4),
        color: pick(['#ffffff', '#8fe0ff', '#4ad1ff']), drag: 0.88, glow: true,
      });
    }
  }
  if (knockOn()) spd = 0;
  P.walkPhase += dt * (il > 0 ? (P.sprinting ? 16 : 11) : 0);

  /* 跑动扬尘：给「正在跑」一点视觉回馈，也让脚步看得出来 */
  if (P.sprinting && Math.random() < dt * 22) {
    addParticle(P.x + rand(-7, 7), P.y + rand(8, 14), {
      vx: -P.vx * 0.16 + rand(-16, 16), vy: -P.vy * 0.16 + rand(-16, 4),
      life: 0.42, r: rand(2, 4), color: 'rgba(140,180,205,0.38)', drag: 0.9,
    });
  }

  P.x += ix * spd * dt;
  P.y += iy * spd * dt;
  P.vx = ix * spd;
  P.vy = iy * spd;

  resolveCircleRects(P);
  clampWorld(P);

  /* 玩家也不会和敌人"合体"：挤到身上会被顶开（可以挤过去，但绝不会重叠） */
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const ex = P.x - e.x, ey = P.y - e.y;
    let ed = Math.hypot(ex, ey);
    const need = P.r + e.r;
    if (ed < need) {
      let ux, uy;
      if (ed < 0.001) { ux = Math.cos(P.aim); uy = Math.sin(P.aim); ed = 1; }
      else { ux = ex / ed; uy = ey / ed; }
      const gx = e.x + ux * need, gy = e.y + uy * need;
      if (!hitsObstacle(gx, gy, P.r)) { P.x = gx; P.y = gy; }
      resolveCircleRects(P);
      clampWorld(P);
    }
  }

  P.fireCd = Math.max(0, P.fireCd - dt);
  P.invuln = Math.max(0, P.invuln - dt);
  P.hurtFlash = Math.max(0, P.hurtFlash - dt * 3.2);
  P.recoil = Math.max(0, P.recoil - dt * 34);
  P.muzzle = Math.max(0, P.muzzle - dt);
  P.medCd = Math.max(0, P.medCd - dt);
  P.meleeCd = Math.max(0, P.meleeCd - dt);
  P.swingT = Math.max(0, P.swingT - dt);
  P.hurtDirT = Math.max(0, P.hurtDirT - dt);

  // 燃烧状态：离开火场后还会被烧一小会儿
  if (P.burnT > 0 && P.alive) {
    P.burnT = Math.max(0, P.burnT - dt);
    P.burnTick -= dt;
    if (P.burnTick <= 0) {
      P.burnTick = 0.55;
      burnPlayer(4.5);
      if (Math.random() < 0.7) {
        addParticle(P.x + rand(-9, 9), P.y + rand(-9, 9), {
          vx: rand(-14, 14), vy: rand(-46, -16), life: 0.45, r: rand(2, 4.5),
          color: pick(['#ff8a3a', '#ffd66b']), drag: 0.9, glow: true,
        });
      }
    }
  }

  if (P.reloading > 0) {
    P.reloading -= dt;
    if (P.reloading <= 0) { P.reloading = 0; finishReload(); }
  }

  if (P.medOn) {
    /* 治疗中：枪还在手上但腾不出手 —— 左键不出枪、不挥刀；
       右键在 mousedown 里已改成"收手" */
  } else if (modeOn()) {
    updateModeInput(dt);                   // 手上拿着雷 / 弓 / 装置：左键右键都归技能管
    mouse.pressed = false;
  } else if (P.curSlot === 'melee') {
    if (mouse.down) swingMelee();          // 按住就一下一下地挥
  } else if (P.curSlot === 'medkit') {
    if (mouse.pressed) toggleMedkit();     // 左键开始 / 停止包扎
  } else {
    const wa = currentAmmo();
    if (wa.mag <= 0 && P.reloading <= 0 && reserveOf(wa.cal || calOfWeapon(P.weapon)) > 0) startReload();
    tryFire(mouse.pressed);
  }
  mouse.pressed = false;      // 一次按下只算一次扣扳机

  // 地上掉落：原地放着，靠近后按 F 拾取（磁吸聚拢已删 —— 手动拾取时代物品再粘着人走就是 BUG）
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.life -= dt;
    p.bob += dt * 4;
    if (p.cool > 0) p.cool -= dt;
    if (p.life <= 0) { G.pickups.splice(i, 1); continue; }
  }
}

/* F 拾取候选：拾取半径内最近的一件掉落（含 1.2s 冷却防刷屏的） */
function nearestPickup(range) {
  let best = null, bestD = 1e9;
  for (const p of G.pickups) {
    if (p.cool > 0) continue;
    const d = dist(P.x, P.y, p.x, p.y);
    if (d <= range && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/* F 按在地上一件掉落上：捡最近的那件；捡不动（没空位）时掉落自会进 1.2s 冷却 */
function pickupInteract() {
  const p = nearestPickup(120);
  if (!p) return false;
  if (collectPickup(p)) {
    const i = G.pickups.indexOf(p);
    if (i >= 0) G.pickups.splice(i, 1);
  } else {
    p.cool = 1.2;                            // 没空位：进冷却，别连按刷屏
  }
  return true;
}

/* ── 蜂医被动：专业救援 ──
   血量见底不是直接结账，而是「倒地」：倒地瞬间自动扑出一团蜂巢烟遮住自己，
   只能用 WASD 慢慢爬（很慢），打不了枪、用不了技能。
   倒地有独立的 100 点血条，无护甲减伤 —— 敌人打多少扣多少，扣光直接阵亡。
   长按 F 累计 8 秒完成自救：10 点血爬起来。松开 F 进度暂停但不回退。 */
const DOWNED_MAX_HP = 100;    // 倒地血条
const DOWNED_SPEED = 46;      // 爬行速度（走路 165 的 ~28%，真的慢）
function isDowned() { return (P.downed || 0) > 0; }

function startDowned() {
  P.downed = 1;
  P.downHp = DOWNED_MAX_HP;
  P.downRev = 0;
  P.hp = 0;
  P.invuln = 1.2;
  P.burnT = 0;
  if (P.op) P.op.rescueCd = SKILL.rescue.cd;
  exitMode(true);
  if (G.lootPanel) closeLootPanel();          // 倒地瞬间还开着容器：收起来，别挡 F 自救
  /* 倒地自动扑烟：蜂医的烟是自己的手术室，躺下之前先把自己的手术室铺上 */
  G.smokes.push({ x: P.x, y: P.y, t: 0, r: 0, seed: rand(0, 100), life: SKILL.bee.life, bee: true });
  popup(P.x, P.y - 66, '蜂 巢 烟', '#8dffc0', 12);
  uiToast('倒地 · 长按 F 自救（8 秒）· 爬行中', 'small warn');
  popup(P.x, P.y - 54, '倒 地', '#8dffc0', 16);
  Sfx.hurt();
  shake(12);
  burst(P.x, P.y, 18, { color: ['#ff4060', '#8dffc0'], life: 0.7, r: 4, spdMin: 40, spdMax: 220 });
}

function updateDowned(dt) {
  P.invuln = Math.max(0, P.invuln - dt);   // 倒地分支不走 updatePlayer 的衰减，这里自己扣

  /* ── 爬行：只有 WASD，速度很慢，撞墙照样被挡 ── */
  let ix = 0, iy = 0;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (keys['w'] || keys['arrowup']) iy -= 1;
  if (keys['s'] || keys['arrowdown']) iy += 1;
  const il = Math.hypot(ix, iy);
  if (il > 0) { ix /= il; iy /= il; }
  P.x += ix * DOWNED_SPEED * dt;
  P.y += iy * DOWNED_SPEED * dt;
  P.vx = ix * DOWNED_SPEED;
  P.vy = iy * DOWNED_SPEED;
  resolveCircleRects(P);
  clampWorld(P);
  P.walkPhase += dt * (il > 0 ? 5 : 0);
  if (il > 0 && Math.random() < dt * 8) {
    addParticle(P.x - ix * 14 + rand(-6, 6), P.y - iy * 14 + rand(-4, 8), {
      vx: rand(-14, 14), vy: rand(-16, 2), life: rand(0.3, 0.6), r: rand(1.6, 3),
      color: 'rgba(150,170,190,0.4)', drag: 0.9,
    });
  }

  /* ── 长按 F 自救：累计满 8 秒爬起来；松手进度停住但不倒退 ── */
  const pulling = !!keys['f'] && !G.lootPanel;
  P.downRev = clamp(P.downRev + (pulling ? dt * careRateMul() : 0), 0, SKILL.rescue.down);
  if (pulling && Math.random() < dt * 10) {
    addParticle(P.x + rand(-14, 14), P.y + rand(-10, 8), {
      vx: rand(-8, 8), vy: rand(-30, -8), life: 0.45, r: rand(1.6, 3),
      color: pick(['#8dffc0', '#d8ffe8']), drag: 0.93, glow: true,
    });
  }
  if (P.downRev >= SKILL.rescue.down) reviveSelf();
}

function reviveSelf() {
  P.downed = 0;
  P.downHp = 0;
  P.downRev = 0;
  P.hp = SKILL.rescue.hp;
  P.deb.weak = 0;              // 专业救援：把「血量上限降低」一并清掉
  recalcMaxHp();
  P.invuln = 1.6;
  P.painT = Math.max(P.painT, 4);
  uiToast('自己爬起来了 · ' + SKILL.rescue.hp + ' 血', '');
  popup(P.x, P.y - 50, '救 援 成 功', '#8dffc0', 15);
  Sfx.heal();
  burst(P.x, P.y, 20, { color: ['#ffffff', '#8dffc0', '#26d96f'], life: 0.6, r: 4, spdMin: 40, spdMax: 240, glow: true });
}

/* 所有致命伤都走这里：能倒地就倒地，不能才结算阵亡 */
function playerLethal() {
  if (rescueOn() && P.op && P.op.rescueCd <= 0 && !isDowned()) {
    startDowned();
    return true;
  }
  endRaid(false);
  return false;
}

/* 护甲磨光：防护当场清零，全图都能看见你这块板子碎了 */
function armorBreak() {
  P.armorHp = 0;
  P.armorDR = 0;
  popup(P.x, P.y - 54, '护 甲 击 穿', '#ff6b81', 15);
  burst(P.x, P.y, 14, { color: ['#8fd8f2', '#ffffff', '#ff8fa3'], life: 0.5, r: 3.5, spdMin: 80, spdMax: 320, glow: true });
  Sfx.noiseBurst(0.25, 900, 1.4, 0.2);
}

function damagePlayer(amount, srcX, srcY, inv, pen) {
  if (P.invuln > 0 || !P.alive) return;
  if (G.packOpen) closePackPanel();                // 背包里挨打：面板立刻被拍掉，时间可没停
  /* 倒地：独立的 100 点血条，无护甲减伤、不吃止痛不吃创伤 —— 敌人打多少扣多少 */
  if (isDowned()) {
    P.downHp -= amount;
    P.invuln = 0.3;
    P.hurtFlash = 1;
    if (typeof srcX === 'number' && typeof srcY === 'number') {
      P.hurtDir = Math.atan2(srcY - P.y, srcX - P.x);
      P.hurtDirT = 1.5;
    }
    shake(7);
    Sfx.hurt();
    burst(P.x, P.y, 8, { color: ['#ff4060', '#ff8fa3'], life: 0.4, r: 3, spdMin: 60, spdMax: 200 });
    if (P.downHp <= 0) { P.hp = 0; playerLethal(); }
    return;
  }
  let dmg = amount;
  /* 护甲：有耐久才生效 ——
     带弹级的伤害（子弹）走弹级对照表：同级弹减半、低两级全挡、高两级全穿；挡下的部分磨甲；
     没弹级的伤害（爆炸 / 近战 / 火 / 冻）吃固定减免。甲磨光了（armorHp 0）两条路都失效。 */
  if (P.armorLv > 0 && P.armorHp > 0) {
    if (typeof pen === 'number' && pen > 0) {
      const ratio = penRatio(pen, P.armorLv);
      dmg *= ratio;
      P.armorHp = Math.max(0, P.armorHp - amount * (ratio > 0 ? 0.25 : 0.5));
      if (P.armorHp <= 0) armorBreak();
    } else {
      dmg *= (1 - P.armorDR);
    }
  }
  if (P.painT > 0) dmg *= 1 - PAIN_DR;      // 止痛剂压着，挨打没那么疼
  rollTrauma(dmg, 'bullet');                // 掷创伤：流血 / 贯穿伤 / 骨折
  P.hp -= dmg;
  P.invuln = inv || (isTop() ? TOP.playerInvuln : (isSecret() ? SECRET.playerInvuln : 0.55));
  P.hurtFlash = 1;
  // 背后看不见，至少让人知道子弹从哪来
  if (typeof srcX === 'number' && typeof srcY === 'number') {
    P.hurtDir = Math.atan2(srcY - P.y, srcX - P.x);
    P.hurtDirT = 1.5;
  }
  shake(9 * adrShakeMul());
  P.recoil = Math.max(P.recoil, 3.4 * adrKickMul());   // 受击枪口上抬（肾上腺素压得住）
  Sfx.hurt();
  G.combo = 0;
  G.comboTimer = 0;
  burst(P.x, P.y, 10, { color: ['#ff4060', '#ff8fa3'], life: 0.45, r: 3.5, spdMin: 60, spdMax: 240 });
  emitNoise(P.x, P.y, 780, 0.9, true);   // 受伤惨叫/交火声会暴露位置
  if (P.hp <= 0) { P.hp = 0; playerLethal(); }
}

/* ══════════════════════════════════════════════════════════
   9. 敌人
   ══════════════════════════════════════════════════════════
   感知模型：
   · 平时在固定点附近巡逻，不会主动朝玩家搜索
   · 视野 = 朝向 ± fov、距离 sight、且必须视线通畅（被障碍物挡住看不见）
   · 听觉穿墙，开枪/爆炸会惊动范围内敌人去查看
   · 一旦有人确认看见玩家 → enterCombat → alertOthers 逐跳扩散
     整片区域都会被叫来，发现者还有概率直接呼叫增援
   ─────────────────────────────────────────────────────── */

// 线段与矩形是否相交（Liang-Barsky），用于视线遮挡
function segmentHitsRect(x1, y1, x2, y2, o) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - o.x, o.x + o.w - x1, y1 - o.y, o.y + o.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function losClear(x1, y1, x2, y2) {
  for (const o of G.obstacles) if (segmentHitsRect(x1, y1, x2, y2, o)) return false;
  return true;
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function canSeePlayer(e) {
  if (!P.alive) return false;
  if (e.blind > 0) return false;                  // 被闪光弹晃到：睁着眼也是白的
  /* 蛊的流荧集群：被缠住时视野糊成一片 —— 看不远，也看不宽 */
  const blurK = (e.swarmT || 0) > 0 ? SKILL.swarm.sightMul : 1;
  const fovK = (e.swarmT || 0) > 0 ? SKILL.swarm.fovMul : 1;
  const dx = P.x - e.x, dy = P.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > e.sight * blurK) return false;
  /* 自己站在烟里：除了贴脸（64px 内）什么都看不见 */
  if (d > 64 && pointInSmoke(e.x, e.y)) return false;
  if (d > 54 && Math.abs(angleDiff(Math.atan2(dy, dx), e.facing)) > e.fov * fovK) return false;
  if (!losClear(e.x, e.y, P.x, P.y)) return false;
  /* 烟幕：线段穿过成形后的烟圈就看不见 —— 这就是烟雾弹的全部价值 */
  return !smokeBlocks(e.x, e.y, P.x, P.y);
}

/* 声音穿墙传播：只要在半径内，敌人一定会过来查看（这就是开枪的代价）
   byPlayer：这条动静是玩家自己弄出来的 —— 静默潜袭期间要压到近乎无声 */
function emitNoise(x, y, radius, hardness, byPlayer) {
  if (byPlayer && silentOn()) {
    radius *= SKILL.silent.noiseMul;
    hardness *= SKILL.silent.hardMul;
  }
  if (radius < 30) return;
  for (const e of G.enemies) {
    if (e.state === 'combat') continue;
    /* 蛊的流荧集群：被缠住时听力大幅衰减，喊他他听不见 */
    const ear = (e.deaf || 0) > 0 ? radius * SKILL.swarm.hearMul : radius;
    const d = dist(e.x, e.y, x, y);
    if (d > ear) continue;
    const k = 1 - d / ear;

    e.lastSeenX = x; e.lastSeenY = y;

    if (e.state === 'patrol') {
      e.state = 'alert';
      e.investigateT = 11 + k * 7;
    } else {
      e.investigateT = Math.max(e.investigateT, 10);
    }

    // 越近越心里有数，见到人立刻就能锁定
    e.alertMeter = Math.min(0.92, e.alertMeter + k * hardness);
  }
}

/* 警戒扩散：hop 控制连锁深度，形成喊话涟漪 */
function alertOthers(src, sx, sy, hop) {
  if (hop >= 3) return;
  const radius = 520 - hop * 80;
  for (const o of G.enemies) {
    if (o === src || o.state === 'combat') continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > radius) continue;
    o.lastSeenX = sx; o.lastSeenY = sy;
    if (o.state === 'alert') { o.investigateT = 13; continue; }
    o.state = 'alert';
    o.alertMeter = 1;
    o.investigateT = 13;
    o.chain = 0.28 + Math.random() * 0.45;   // 稍后自己也开打并继续扩散
    o.chainHop = hop + 1;
  }
  G.alarm = Math.min(1, G.alarm + 0.3);
  G.lastAlarmX = sx; G.lastAlarmY = sy;
}

function enterCombat(e, sx, sy, bySight) {
  e.state = 'combat';
  e.alertMeter = 1;
  e.lastSeenX = sx; e.lastSeenY = sy;
  e.loseT = 0;
  e.chain = 0;
  /* 侧翼包抄：场上同时只留一个 flanker，沿玩家侧后 ±0.65~0.95 弧度绕行 2.5~4 秒。
     只让「跑得动、会打枪」的兵种当 flanker —— 机枪兵/喷火兵原地架着就行。 */
  const canFlank = e.type === 'runner' || e.type === 'shooter' || e.type === 'sniper' ||
                   e.type === 'nader' || e.type === 'rocket';
  if (canFlank && bySight && !(e.flankOn > 0) && Math.random() < 0.55 &&
      !G.enemies.some(o => o.alive && o !== e && (o.flankOn || 0) > 0)) {
    e.flankOn = rand(2.5, 4);
    e.flankAng = Math.atan2(e.y - P.y, e.x - P.x) + (Math.random() < 0.5 ? -1 : 1) * rand(0.65, 0.95);
  }
  if (bySight) {
    alertOthers(e, sx, sy, 0);
    if (Math.random() < 0.5) callBackup(sx, sy);   // 有概率叫更多人
  }
}

function callBackup(sx, sy) {
  if (G.callCd > 0 || G.enemies.length > (G.enemyCap || 42)) return;
  G.callCd = 17;
  const n = 2 + ((Math.random() * 2) | 0);
  const nest = nearestNest(sx, sy);
  for (let i = 0; i < n; i++) {
    const e = spawnEnemy('runner', nest.x + rand(-46, 46), nest.y + rand(-46, 46));
    if (!e) continue;
    e.state = 'alert';
    e.alertMeter = 1;
    e.investigateT = 16;
    e.lastSeenX = sx; e.lastSeenY = sy;
  }
  uiToast('敌 人 呼 叫 增 援', 'warn');
  Sfx.tone(260, 0.35, 0.1, 'square', 120);
}

function spawnEnemy(type, atX, atY, fac) {
  const T = ENEMY_TYPES[type];
  const scale = 1 + G.reinforceWave * 0.16;
  const faction = FACTIONS[fac] ? fac : (G.spawnFaction || 'asara');
  /* 机密模式：血量换表、伤害走倍率（远程在读取处乘，近战直接用 e.dmg） */
  const sec = isSecret();
  const hpBase = ((sec && SECRET.hp[type]) ? SECRET.hp[type] : T.hp) * (isTop() ? TOP.hpMul : 1);
  const dmgMul = (sec ? (SECRET.dmgMul[type] || 1) : 1) * (isTop() ? TOP.dmgMul : 1);
  const shieldBase = ((sec && type === 'shooter') ? SECRET.shield : (T.shield || 0)) * (isTop() ? TOP.shieldMul : 1);
  /* 护甲等级：决定「几级弹才打得进」。护甲本身有耐久，磨光了就裸奔。
     机密图里穿甲的兵整体上浮一级、绝密上浮两级（封顶 5 级），多出来的那级换算成耐久。 */
  const baseLv = T.armor || 0;
  const addLv = sec ? (isTop() ? TOP.armorAdd : (SECRET.armorAdd || 0)) : 0;
  const rawLv = baseLv > 0 ? baseLv + addLv : baseLv;
  /* 具名甲目录最低 3 级：老配置里 1-2 级甲的兵统一穿 3 级（封顶照旧） */
  const armorLv = rawLv > 0 ? Math.max(3, Math.min(rawLv, SECRET.armorLvCap || 6)) : 0;
  /* 同一级里随机挑一件具名甲 —— 敌人穿的甲就是打死后能捡到的那件 */
  const armorId = armorLv > 0 ? rollArmorId(armorLv) : 0;
  /* 子弹弹级：普通按类型表，机密 +1、绝密 +2（封顶 6）—— 高难图的枪才啃得动高级甲 */
  const pen = Math.min(6, (T.pen || 0) + (sec ? (isTop() ? (TOP.penAdd || 2) : (SECRET.penAdd || 1)) : 0));
  const armorHp = armorId ? Math.round(ARMORS[armorId].hp * ((sec && rawLv > armorLv) ? (SECRET.armorOverCapHp || 1) : 1)) : 0;
  let x = atX, y = atY, nest = null;

  /* 赤霄的地盘：地图带 bossZone 时，初始布点与增援波一律刷在驻守区内（行政楼大厅） */
  if (type === 'boss' && G.bossZone) {
    const z = G.bossZone;
    let bx = z.x + z.w / 2, by = z.y + z.h / 2, ok = false;
    for (let t = 0; t < 60; t++) {
      const rx = Math.max(T.r + 8, z.w / 2 - T.r - 8);
      const ry = Math.max(T.r + 8, z.h / 2 - T.r - 8);
      bx = clamp(z.x + z.w / 2 + rand(-rx, rx), z.x + T.r, z.x + z.w - T.r);
      by = clamp(z.y + z.h / 2 + rand(-ry, ry), z.y + T.r, z.y + z.h - T.r);
      if (hitsObstacle(bx, by, T.r + 6)) continue;
      if (dist(bx, by, P.x, P.y) < 260) continue;   // 别贴脸刷出来
      ok = true;
      break;
    }
    if (!ok) {   // 兜底：区域正中（宁可压墙也不要跑到区外）
      bx = z.x + z.w / 2; by = z.y + z.h / 2;
    }
    atX = bx; atY = by; x = bx; y = by;
  }

  if (atX === undefined) {
    // 默认刷在固定点位附近，而不是玩家周围
    nest = G.nests.length
      ? G.nests[(Math.random() * G.nests.length) | 0]
      : { x: WORLD.w / 2, y: WORLD.h / 2 };

    let placed = false;
    for (let t = 0; t < 30; t++) {
      x = clamp(nest.x + rand(-150, 150), T.r + 40, WORLD.w - T.r - 40);
      y = clamp(nest.y + rand(-150, 150), T.r + 40, WORLD.h - T.r - 40);
      if (hitsObstacle(x, y, T.r + 6)) continue;
      if (dist(x, y, P.x, P.y) < 620) continue;   // 不刷在玩家眼皮底下
      placed = true;
      break;
    }
    if (!placed) { x = nest.x; y = nest.y; }      // 兜底：退回点位本身
  }

  const home = nest || { x, y };

  const e = {
    type, faction, label: enemyLabel(type, faction),
    x, y, r: T.r,
    hp: hpBase * scale, maxHp: hpBase * scale,
    speed: T.speed * rand(0.92, 1.08),
    dmg: T.dmg * dmgMul, dmgMul, score: T.score,
    /* 颜色兜底：数据表里少一个字段不该让整个渲染管线挂掉 */
    color: T.color || '#ff4d6d', glow: T.glow || T.color || '#ff2d55', shape: T.shape || 'tri',

    sight: T.sight, fov: T.fov,
    state: 'patrol',
    alertMeter: 0,
    facing: rand(0, TAU),
    homeX: home.x, homeY: home.y,
    patrolX: x, patrolY: y,
    patrolT: rand(0, 2.5),
    investigateT: 0,
    lastSeenX: x, lastSeenY: y,
    loseT: 0,
    chain: 0, chainHop: 0,

    burn: 0, touchCd: 0,
    /* 无名：闪光致盲 / 流血层数 / 重伤（打药与起身变慢）/ 战地包扎进度 */
    blind: 0, bleedN: 0, bleedT: 0, trauma: 0,
    bandaging: false, bandageT: 0, careCd: rand(3, 9),
    flankOn: 0, flankAng: 0,       // 侧翼包抄计时 / 绕行方位（场上同时最多一个 flanker）
    careSeek: 0, careSpotX: 0, careSpotY: 0,   // 包扎前的找掩体阶段（拖着伤往掩体挪）
    /* 近战：wind 抬手预警 / swing 挥击动画 / cd 收招冷却 / lunge 剩余突进 / back 收招后撤 / hit 命中闪光 */
    meleeCd: rand(0.2, 0.9), meleeWind: 0, meleeSwing: 0, meleeAim: 0,
    meleeLunge: 0, meleeBack: 0, meleeHit: 0,
    fireCd: rand(0.6, (T.burst ? T.burst.cd[1] : 1.5)),
    strafe: Math.random() < 0.5 ? 1 : -1,
    avoidDir: Math.random() < 0.5 ? 1 : -1,
    walkPhase: rand(0, TAU),
    stagger: 0,
    aim: rand(0, TAU),
    hexAim: rand(0, TAU),   // 机枪兵六边身体的朝向（战斗时锁定目标，待机时慢转）
    alive: true,

    /* 点射（小兵 / 盾兵共用）：ptN 剩余发数，ptT 下一发倒计时 */
    ptN: 0, ptT: 0, ptInt: 0.1, ptDmg: 0, ptSpd: 0, ptSpr: 0,
    /* 盾牌：正面吃子弹，打完就碎；shieldAim 是盾面朝向，转身比眼睛慢半拍 */
    shield: shieldBase, maxShield: shieldBase, shieldAim: 0, shieldFlash: 0,
    /* 护甲：armorLv 是等级（普通最高 5，机密图封顶也是 5），armorId 是穿的具名甲，
       armorHp 是耐久 —— 挡住的弹会磨甲，磨穿就裸了 */
    armorLv, armorId, armorHp, armorMax: armorHp, armorFlash: 0,
    /* 加特林：spin 预热 / burst 剩余弹数 / fire 连发间隔 / heat 枪管热度 / bloom 弹道扩散 */
    gatCd: rand(0.7, 1.6), gatSpin: 0, gatBurst: 0, gatFire: 0, gatHeat: 0, gatBloom: 0, gatPhase: 0,

    /* 狙击兵：snipeCharge 激光锁定倒计时（>0 表示正在瞄准，随时可能开枪） */
    snipeCharge: 0,
    /* 火箭筒兵：loadT 装填倒计时 */
    loadT: 0, rocketCd: rand(1.6, 2.8),
    /* 喷火兵：flameT 喷射剩余时间 / flameTick 下一次灼烧结算 / fireDrop 下一次落地留火 */
    flameT: 0, flameTick: 0, fireDrop: 0, flameCd: rand(1.0, 1.9),
    /* 冰冻军团·投射兵：iceLoad 装填读条（>0 正在蓄冰） / iceCd 冷却 */
    iceLoad: 0, iceCd: rand(1.4, 2.6),
    /* 冰冻军团·投掷兵：potCd 下一次抛霜瓶的冷却 */
    potCd: rand(1.6, 3.0),
    /* 冰冻军团·喷射兵：sprayT 喷雾剩余 / sprayTick 下一次结算 / patchDrop 下一次落地留霜 / sprayCd 冷却 */
    sprayT: 0, sprayTick: 0, patchDrop: 0, sprayCd: rand(1.2, 2.3),
    /* 手雷兵：throwCd 下一次投掷的冷却 */
    throwCd: rand(1.2, 2.4),

    /* 安全总监：连发狙（dirN 剩余发数 / dirT 下一发倒计时）+ 爆破小车冷却 */
    dirN: 0, dirT: 0, seekerCd: rand(6, 10), spotted: false,
    /* 无人作战小车：炮弹冷却 / 自爆倒计时（总监阵亡后启动） */
    cannonCd: rand(2.6, 4.2), cannonLoad: 0, sdT: 0, sdBeep: 0,
    /* 寻敌爆破小车：贴脸引信（>0 = 已咬住，滴滴声中起爆） */
    fuseT: 0,

    // 技能状态（只有 boss 会用到）
    rollT: 0, rollX: 0, rollY: 0,
    rollCd: rand(2.4, 4.2),
    molotovCd: rand(2.2, 4.0),
    // 重机枪：spin 预热 / burst 剩余弹数 / fire 连发间隔 / heat 枪管热度 / bloom 弹道扩散
    hmgCd: rand(0.8, 1.6), hmgSpin: 0, hmgBurst: 0, hmgFire: 0, hmgHeat: 0, hmgBloom: 0,
    invuln: 0,
  };

  e.shieldAim = e.facing;

  G.enemies.push(e);
  burst(x, y, 10, { color: [T.color, '#ffffff'], life: 0.5, r: 4, spdMin: 40, spdMax: 180, glow: true });
  return e;
}

/* ── 航天基地 BOSS：安全总监 + 护卫无人作战小车 ──
   每局在核心控制区（coreZone）随机挑一个空地出生，不走增援波；
   世界上没有赤霄 —— 零号大坝才是赤霄的地盘。 */
function spawnDirectorSquad() {
  const z = G.coreZone || { x: WORLD.w * 0.1, y: WORLD.h * 0.1, w: WORLD.w * 0.4, h: WORLD.h * 0.3 };
  let x = z.x + z.w / 2, y = z.y + z.h / 2, placed = false;
  for (let t = 0; t < 60; t++) {
    x = rand(z.x + 90, z.x + z.w - 90);
    y = rand(z.y + 90, z.y + z.h - 90);
    if (hitsObstacle(x, y, 60)) continue;
    if (dist(x, y, P.x, P.y) < 900) continue;      // 不刷在玩家出生点旁边
    placed = true;
    break;
  }
  const dir = spawnEnemy('director', x, y, 'havk');
  if (dir) {
    dir.homeX = x; dir.homeY = y; dir.patrolX = x; dir.patrolY = y;
    const ea = rand(0, TAU);
    const esc = spawnEnemy('escort', x + Math.cos(ea) * 78, y + Math.sin(ea) * 78, 'havk');
    if (esc) { esc.homeX = x; esc.homeY = y; }
  }
}

function spawnReinforce() {  G.reinforceWave++;
  const n = Math.min(9, 3 + G.reinforceWave);

  // 增援从固定点位进场；只有在已有警报时才知道大致方位，否则就地巡逻
  const alarmed = G.alarm > 0.25 && G.lastAlarmX !== undefined;
  const sx = alarmed ? G.lastAlarmX + rand(-220, 220) : 0;
  const sy = alarmed ? G.lastAlarmY + rand(-220, 220) : 0;

  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let type = 'runner';
    if (G.reinforceWave >= 4 && r < 0.07) type = 'flamer';
    else if (G.reinforceWave >= 4 && r < 0.13) type = 'cryo';
    else if (G.reinforceWave >= 4 && r < 0.18) type = 'cryoT';
    else if (G.reinforceWave >= 3 && r < 0.23) type = 'cryoS';
    else if (G.reinforceWave >= 3 && r < 0.29) type = 'brute';
    else if (G.reinforceWave >= 3 && r < 0.35) type = 'rocket';
    else if (G.reinforceWave >= 2 && r < 0.42) type = 'sniper';
    else if (G.reinforceWave >= 2 && r < 0.48) type = 'nader';
    else if (G.reinforceWave >= 2 && r < 0.62) type = 'shooter';
    const e = spawnEnemy(type);
    if (e && alarmed) {
      e.state = 'alert';
      e.alertMeter = 1;
      e.investigateT = 18;
      e.lastSeenX = sx; e.lastSeenY = sy;
    }
  }
  if (G.reinforceWave === bossWaveNo() && !G.bossSpawned) {
    G.bossSpawned = true;
    const b = spawnEnemy('boss');
    if (b && alarmed) {
      b.state = 'alert'; b.alertMeter = 1; b.investigateT = 18;
      b.lastSeenX = sx; b.lastSeenY = sy;
    }
  }
  uiToast('敌 军 增 援 抵 达', 'warn');
  Sfx.tone(180, 0.4, 0.14, 'sawtooth', 90);
}

/* 单发出膛（点射 / 加特林共用）：带枪口焰，但不额外加随机散布 */
function enemyShootAt(e, a, speed, dmg, r, color) {
  const mx = e.x + Math.cos(a) * (e.r + 6);
  const my = e.y + Math.sin(a) * (e.r + 6);
  G.bullets.push({
    x: mx, y: my, px: e.x, py: e.y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    r: r || 4.0, dmg: dmg, color: color || '#ff5c7a',
    life: 2.2, hostile: true, pierce: 0, knock: 0, pen: e.pen || 0,
    side: e.faction || 'asara', src: e,      // 阵营归属：混战里同阵营不会误伤
  });
  burst(mx, my, 3, {
    angle: a, spread: 0.34, spdMin: 110, spdMax: 320,
    color: ['#ffe9a8', color || '#ff5c7a'], life: 0.11, r: 2.8, glow: true,
  });
}

/* ── 点射：阿萨拉小兵 / 盾兵都是「哒·哒·哒」三连，而不是一枪一枪地漏 ── */
function startPointBurst(e, B) {
  e.ptN = B.n;
  e.ptT = 0;
  e.ptInt = B.gap;
  e.ptDmg = B.dmg * (e.dmgMul || 1);
  e.ptSpd = B.spd;
  e.ptSpr = B.spread;
  e.aim = Math.atan2(P.y - e.y, P.x - e.x);
}

function updatePointBurst(e, dt) {
  if (e.ptN <= 0) return;
  e.ptT -= dt;
  let guard = 0;
  while (e.ptN > 0 && e.ptT <= 0 && guard++ < 6) {
    e.ptT += e.ptInt;
    e.ptN--;
    const lead = 0.16;   // 预判一点点，站着不动会被点名
    const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
    const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
    const a = Math.atan2(ty - e.y, tx - e.x) + rand(-1, 1) * e.ptSpr;
    enemyShootAt(e, a, e.ptSpd, e.ptDmg, 3.8, '#ff6b81');
    Sfx.shoot('tap');
  }
}

/* 加特林：枪管转够了才喷，边打边散，打完过热歇一会儿 */
function enemyGatFire(e, sees, gatTab) {
  const GAT = gatTab || ENEMY_TYPES.brute.gat;
  const lead = 0.18;
  const tx = sees ? P.x + P.vx * lead : e.lastSeenX;
  const ty = sees ? P.y + P.vy * lead : e.lastSeenY;
  const base = Math.atan2(ty - e.y, tx - e.x);
  const a = base + rand(-1, 1) * (GAT.spread + e.gatBloom);
  const mx = e.x + Math.cos(a) * (e.r + 8);
  const my = e.y + Math.sin(a) * (e.r + 8);

  G.bullets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * GAT.spd,
    vy: Math.sin(a) * GAT.spd,
    r: 4.6, dmg: GAT.dmg * (e.dmgMul || 1), color: '#ffb03a',
    life: 1.8, hostile: true, pierce: 0, knock: 0, pen: e.pen || 0,
  });

  burst(mx, my, 2, {
    angle: a, spread: 0.3, spdMin: 130, spdMax: 340,
    color: ['#fff3c4', '#ffb347'], life: 0.1, r: 3, glow: true,
  });
  if (e.gatBurst % 2 === 1) Sfx.shoot('hmg');
  if (e.gatBurst % 4 === 0 && dist(e.x, e.y, P.x, P.y) < 760) shake(0.9);
  if (e.gatBurst === GAT.rounds) emitNoise(e.x, e.y, 850, 0.7);
}

/* ── 狙击兵：一枪一条线。弹速 1500，靠预判 + 激光预警规避 ── */
function sniperFire(e) {
  const SN = ENEMY_TYPES.sniper.snipe;
  const lead = 0.22;
  const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
  const base = Math.atan2(ty - e.y, tx - e.x);
  const a = base + rand(-1, 1) * SN.spread;
  const mx = e.x + Math.cos(a) * (e.r + 12);
  const my = e.y + Math.sin(a) * (e.r + 12);

  G.bullets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * SN.spd, vy: Math.sin(a) * SN.spd,
    r: 3.2, dmg: SN.dmg * (e.dmgMul || 1), color: '#8ff6ff',
    life: 1.3, hostile: true, pierce: 0, knock: 0, tracer: 74, pen: e.pen || 0,
  });

  // 枪口焰 + 一道空气被撕裂的细线
  burst(mx, my, 6, {
    angle: a, spread: 0.22, spdMin: 240, spdMax: 620,
    color: ['#ffffff', '#8ff6ff'], life: 0.14, r: 3.2, glow: true,
  });
  addParticle(mx, my, {
    vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.22,
    r: 10, color: '#bff8ff', drag: 0.9, glow: true, shape: 'flash',
  });
  Sfx.shoot('enemy');
  Sfx.noiseBurst(0.3, 2600, 2.2, 0.3);
  if (dist(e.x, e.y, P.x, P.y) < 620) shake(6);
  emitNoise(e.x, e.y, 1150, 0.85);
}

/* ── 安全总监的 M700：一发更重、弹道更快的狙击弹 ── */
function directorSniperFire(e) {
  const SN = ENEMY_TYPES.director.snipe;
  const lead = 0.24;
  const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
  const base = Math.atan2(ty - e.y, tx - e.x);
  const a = base + rand(-1, 1) * SN.spread;
  const mx = e.x + Math.cos(a) * (e.r + 14);
  const my = e.y + Math.sin(a) * (e.r + 14);

  G.bullets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * SN.spd, vy: Math.sin(a) * SN.spd,
    r: 4.2, dmg: SN.dmg * (e.dmgMul || 1), color: '#ffd66b',
    life: 1.5, hostile: true, pierce: 0, knock: 40, tracer: 110, pen: e.pen || 0,
  });

  burst(mx, my, 9, {
    angle: a, spread: 0.2, spdMin: 260, spdMax: 700,
    color: ['#ffffff', '#ffd66b', '#ff9d2e'], life: 0.16, r: 3.6, glow: true,
  });
  addParticle(mx, my, {
    vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.24,
    r: 12, color: '#ffe9b8', drag: 0.9, glow: true, shape: 'flash',
  });
  Sfx.shoot('enemy');
  Sfx.noiseBurst(0.42, 2200, 2.6, 0.34);
  if (dist(e.x, e.y, P.x, P.y) < 720) shake(8);
  emitNoise(e.x, e.y, 1300, 0.9);
}

/* ── 无人作战小车：直飞炮弹（比火箭筒兵的火箭快，半径小一档） ── */
function escortCannon(e) {
  const CN = ENEMY_TYPES.escort.cannon;
  const lead = 0.16;
  const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
  const a = Math.atan2(ty - e.y, tx - e.x) + rand(-0.03, 0.03);
  const mx = e.x + Math.cos(a) * (e.r + 12);
  const my = e.y + Math.sin(a) * (e.r + 12);

  G.rockets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * CN.spd, vy: Math.sin(a) * CN.spd,
    a, r: 6, life: CN.life, smokeT: 0, travel: 0, mul: e.dmgMul || 1,
    rad: CN.radius, dmg: CN.dmg, smoke: 0.5,
  });

  burst(mx, my, 10, {
    angle: a + Math.PI, spread: 0.5, spdMin: 90, spdMax: 320,
    color: ['#fff3c4', '#ffd66b', '#aebccb'], life: 0.28, r: 4, glow: true,
  });
  Sfx.noiseBurst(0.24, 800, 0.7, 0.2);
  Sfx.tone(150, 0.2, 0.1, 'sawtooth', 70);
  emitNoise(e.x, e.y, 900, 0.8);
}

/* ── 寻敌爆破小车自爆：贴脸引信烧完 / 被子弹打爆都走这里 ── */
function seekerBoom(e) {
  if (e.boomDone) return;
  e.boomDone = true;
  const SK = ENEMY_TYPES.seeker.boom;
  explodeAt(e.x, e.y, SK.radius, SK.dmg * (e.dmgMul || 1), false);
  if (e.alive) damageEnemy(e, 1e9, 0, -1, 0, 'env');
}

/* ── 无人作战小车自爆：总监阵亡后的殉爆程序（炮塔弹药库，威力更大） ── */
function escortBoom(e) {
  if (e.boomDone) return;
  e.boomDone = true;
  explodeAt(e.x, e.y, 150, 62 * (e.dmgMul || 1), false);
  if (e.alive) damageEnemy(e, 1e9, 0, -1, 0, 'env');
}

/* ── 火箭筒兵：装填完打一发直飞火箭，飞得慢、能半空打爆 ── */
function fireRocket(e) {
  const RK = ENEMY_TYPES.rocket.rkt;
  const lead = 0.16;
  const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
  const a = Math.atan2(ty - e.y, tx - e.x) + rand(-0.035, 0.035);
  const mx = e.x + Math.cos(a) * (e.r + 14);
  const my = e.y + Math.sin(a) * (e.r + 14);

  G.rockets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * RK.spd, vy: Math.sin(a) * RK.spd,
    a, r: 7, life: RK.life, smokeT: 0, travel: 0, mul: e.dmgMul || 1,
  });

  // 尾焰 + 发射烟
  burst(mx, my, 12, {
    angle: a + Math.PI, spread: 0.55, spdMin: 80, spdMax: 300,
    color: ['#fff3c4', '#ffb347', '#8ad34a'], life: 0.3, r: 4, glow: true,
  });
  Sfx.noiseBurst(0.28, 700, 0.8, 0.22);
  Sfx.tone(120, 0.22, 0.12, 'sawtooth', 60);
  shake(4);
  emitNoise(e.x, e.y, 900, 0.8);
}

function updateRockets(dt) {
  for (let i = G.rockets.length - 1; i >= 0; i--) {
    const rk = G.rockets[i];
    rk.life -= dt;
    rk.px = rk.x; rk.py = rk.y;
    const step = Math.hypot(rk.vx, rk.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 12));
    let boom = false;

    for (let s = 0; s < n; s++) {
      rk.x += rk.vx * dt / n;
      rk.y += rk.vy * dt / n;
      rk.travel += step / n;
      if (rk.x < 8 || rk.x > WORLD.w - 8 || rk.y < 8 || rk.y > WORLD.h - 8) { boom = true; break; }
      // 刚出膛的 26px 不判定墙体，免得贴墙开火时炸自己一脸
      if (rk.travel > 26 && pointInObstacle(rk.x, rk.y)) { boom = true; break; }
      if (P.alive && dist2(rk.x, rk.y, P.x, P.y) < (P.r + rk.r) * (P.r + rk.r)) { boom = true; break; }
    }

    // 烟迹：尾焰 + 灰烟
    rk.smokeT -= dt;
    if (rk.smokeT <= 0) {
      rk.smokeT = 0.02;
      addParticle(rk.x - Math.cos(rk.a) * 10, rk.y - Math.sin(rk.a) * 10, {
        vx: rand(-20, 20) - Math.cos(rk.a) * 40, vy: rand(-20, 20) - Math.sin(rk.a) * 40,
        life: rand(0.35, 0.7), r: rand(3, 6), color: pick(['#ffd66b', '#ff8a3a', '#ffffff']),
        drag: 0.9, glow: true,
      });
      if (Math.random() < 0.5) {
        addParticle(rk.x - Math.cos(rk.a) * 14, rk.y - Math.sin(rk.a) * 14, {
          vx: rand(-16, 16), vy: rand(-16, 16), life: rand(0.5, 0.9), r: rand(4, 8),
          color: 'rgba(120,120,128,0.45)', drag: 0.92,
        });
      }
    }

    if (rk.life <= 0) boom = true;
    if (boom) {
      rocketBlast(rk.x, rk.y, rk.mul, rk.rad, rk.dmg, rk.smoke);
      G.rockets.splice(i, 1);
    }
  }
}


/* ══════════════════════════════════════════════════════════
   9.4 干员技能：烟雾 / 三联手炮 / 外骨骼 / 滑铲
   ──────────────────────────────────────────────────────────
   G 战术道具（烟雾）· V 小技能（三头犬）· X 大招（外骨骼）· 被动（滑铲）
   储备制：use 是"现在手上有几层"，打掉一层就按 CD 回充下一层。
   所以余量在手上时可以连放两层；放空之后才需要等回充。
   cd 只做 0.55s 的出弹间隔（防连按双发），不再是"用一次锁 45 秒"。
   ══════════════════════════════════════════════════════════ */

/* ── 烟雾：半径随时间长大 / 最后一段收缩 ── */
function smokeRadius(s) {
  if (s.fixed) return s.r;                       // 无人机 / 直线长烟：一出来就是满半径
  const SM = SKILL.smoke;
  const life = s.life || SM.life;
  if (s.t < SM.grow) return SM.r * Math.pow(s.t / SM.grow, 0.55);
  const left = life - s.t;
  if (left < SM.fade) return SM.r * Math.pow(Math.max(0, left) / SM.fade, 0.7);
  return SM.r;
}

/* 线段与圆是否相交：烟雾挡视线的判定核心 */
function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t, py = y1 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

/* 视线是否被烟幕遮断：只按成形后的 82% 半径算，免得刚起烟就把人挡死 */
function smokeBlocks(x1, y1, x2, y2) {
  for (let i = 0; i < G.smokes.length; i++) {
    const s = G.smokes[i];
    if (s.r < 14) continue;
    if (segmentHitsCircle(x1, y1, x2, y2, s.x, s.y, s.r * 0.82)) return true;
  }
  return false;
}

/* 一个点是否泡在成形烟里：站在烟里的人睁眼也白睁 —— 烟里烟外互相看不见 */
function pointInSmoke(x, y) {
  for (let i = 0; i < G.smokes.length; i++) {
    const s = G.smokes[i];
    if (s.r < 14) continue;
    const rr = s.r * 0.82;
    if (dist2(x, y, s.x, s.y) < rr * rr) return true;
  }
  return false;
}

function updateSmokes(dt) {
  for (let i = G.smokes.length - 1; i >= 0; i--) {
    const s = G.smokes[i];
    s.t += dt;
    s.r = smokeRadius(s);

    if (s.t >= (s.life || SKILL.smoke.life)) { G.smokes.splice(i, 1); continue; }

    /* 起烟那 0.3s 往外喷几团，让它看起来是"炸开"的而不是"淡入"的 */
    if (s.t < SKILL.smoke.grow && Math.random() < dt * 110) {
      const a = rand(0, TAU), rr = rand(0, s.r * 0.7);
      addParticle(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, {
        vx: rand(-40, 40), vy: rand(-40, 40), life: rand(0.5, 1.1), r: rand(7, 14),
        color: 'rgba(196,206,212,0.45)', drag: 0.88,
      });
    }
    /* 收烟阶段零星往外散 */
    const slife = s.life || SKILL.smoke.life;
    if (s.t > slife - SKILL.smoke.fade && Math.random() < dt * 26) {
      const a = rand(0, TAU), rr = s.r * rand(0.3, 1);
      addParticle(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, {
        vx: rand(-24, 24), vy: rand(-30, 10), life: rand(0.4, 0.9), r: rand(6, 12),
        color: 'rgba(196,206,212,0.32)', drag: 0.9,
      });
    }
  }

  /* 玩家自己也一样：站在烟里只看得见身边一小圈，外面全是白的。
     进烟快、出烟慢，免得边打边蹭烟时屏幕一直闪。 */
  let target = 0;
  if (P.alive) {
    for (const s of G.smokes) {
      if (s.r < 14) continue;
      const rr = s.r * 0.82;
      const d = dist(P.x, P.y, s.x, s.y);
      if (d < rr) target = Math.max(target, clamp(1.25 - d / rr, 0, 1));
    }
  }
  const rate = target > G.smokeBlind ? 9 : 2.6;
  if (G.smokeBlind == null || !isFinite(G.smokeBlind)) G.smokeBlind = 0;
  G.smokeBlind += (target - G.smokeBlind) * clamp(dt * rate, 0, 1);
}

/* ── G：战术道具总入口。dist 只在磁吸炸弹「长按」时传进来 ── */
function useTactic(dist) {
  const op = opDef();
  if (!op) { uiToast('没有出战干员 · 去大厅挑一个', 'small warn'); return; }
  if (!P.alive) return;
  if (!P.op) initOperatorSkills();
  const S = P.op.g;
  const label = op.g.short;
  if (S.cd > 0) { uiToast(label + '装填中', 'small'); return; }
  if (S.use <= 0) { uiToast(label + '回充中 · ' + Math.ceil(S.recharge) + 's', 'small'); return; }

  consumeOp('g');                               // 扣层 + 出弹间隔 + 开始回充下一层

  if (op.g.kind === 'magbomb') throwMagBomb(dist);
  else if (op.g.kind === 'beesmoke') throwBeeSmoke();
  else if (op.g.kind === 'flash') throwFlash();
  else if (op.g.kind === 'gas') throwGas();
  else throwSmoke();

  kineticKick();                                // 动能辅助：放技能就给一档移速
}

/* ── G（红狼）：突破型烟雾弹 ── */
function throwSmoke() {
  const SM = SKILL.smoke;
  const dx = mouse.wx - P.x, dy = mouse.wy - P.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(SM.range, Math.max(70, d)) / d;
  let tx = clamp(P.x + dx * k, 30, WORLD.w - 30);
  let ty = clamp(P.y + dy * k, 30, WORLD.h - 30);
  /* 落点压在墙里就往回退，别让烟长在水泥里 */
  for (let t = 0; t < 14 && pointInObstacle(tx, ty); t++) {
    tx -= (dx / d) * 24;
    ty -= (dy / d) * 24;
  }

  G.smokes.push({ x: tx, y: ty, t: 0, r: 0, seed: rand(0, 100) });
  popup(P.x, P.y - 46, '烟 雾 弹', '#c8d6de', 12);
  Sfx.dash();
  burst(tx, ty, 12, { color: ['#e8eef2', '#aab8c2'], life: 0.4, r: 6, spdMin: 20, spdMax: 120, drag: 0.88 });
}

/* ── G（威龙）：磁吸炸弹 —— 抛物线飞出去，贴到墙/人身上，3 秒后引爆 ──
   dist 为 null 表示「短按」：直接按上一次的距离扔（初始 5 米）。 */
function throwMagBomb(dist) {
  const M = SKILL.mag;
  const d = clamp(dist == null ? P.op.lastMag : dist, M.min, M.range);
  P.op.lastMag = d;
  const a = P.aim;
  const tx = clamp(P.x + Math.cos(a) * d, 24, WORLD.w - 24);
  const ty = clamp(P.y + Math.sin(a) * d, 24, WORLD.h - 24);

  G.magbombs.push({
    x: P.x, y: P.y, sx: P.x, sy: P.y, tx, ty, h: 0,
    t: 0, dur: clamp(d / M.speed, 0.10, 0.85),
    st: 'fly', fuse: 0, host: null, ax: tx, ay: ty, spin: rand(0, TAU),
  });

  popup(P.x, P.y - 46, '磁 吸 炸 弹', '#8fe0ff', 12);
  Sfx.dash();
  burst(P.x + Math.cos(a) * (P.r + 12), P.y + Math.sin(a) * (P.r + 12), 10, {
    angle: a, spread: 0.5, spdMin: 60, spdMax: 220,
    color: ['#cdf3ff', '#4ad1ff'], life: 0.3, r: 3, glow: true,
  });
}

/* 磁吸炸弹结算：高伤 + 炸护甲（把 armorHp 直接削掉一大块） */
function magBombBlast(x, y) {
  const M = SKILL.mag;
  blastFX(x, y, M.radius);
  Sfx.explode();
  shake(16);
  emitNoise(x, y, 1500, 1.0);
  burst(x, y, 30, {
    color: ['#ffffff', '#8fe0ff', '#4ad1ff', '#ffb347'],
    life: 0.7, r: 5, spdMin: 80, spdMax: 420, glow: true, drag: 0.9,
  });

  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > M.radius + e.r) continue;
    const fall = 1 - clamp((d - e.r) / M.radius, 0, 1);
    const ddx = (e.x - x) / (d || 1), ddy = (e.y - y) / (d || 1);
    damageEnemy(e, M.dmg * (0.35 + fall * 0.65), ddx, ddy, 520);
    /* 磁吸弹的药型是冲着甲去的：护甲耐久直接砍，砍穿就裸着挨炸 */
    if (e.armorHp > 0) {
      e.armorHp = Math.max(0, e.armorHp - M.armorBreak * (0.5 + fall * 0.5));
      e.armorFlash = 1;
      if (e.armorHp <= 0) popup(e.x, e.y - e.r - 16, '护甲炸穿', '#8fe0ff', 11);
    }
    e.stun = Math.max(e.stun || 0, 0.45);
    e.stagger = 0.45;
  }

  if (!P.alive) return;
  const dp = dist(x, y, P.x, P.y);
  if (dp > M.radius + P.r) return;
  const fall = 1 - clamp((dp - P.r) / M.radius, 0, 1);
  let mul = M.selfMul;
  if (kineOn()) mul *= SKILL.kine.blastMul;      // 动能辅助：爆炸对自己再打一折
  damagePlayer(M.dmg * (0.35 + fall * 0.65) * mul, x, y, 0.5);
  P.concuss = Math.max(P.concuss, 0.8);
  if (Math.random() < 0.3) addDebuff('fissure', 1);
  kineticKick();
}

function updateMagbombs(dt) {
  const M = SKILL.mag;
  for (let i = G.magbombs.length - 1; i >= 0; i--) {
    const b = G.magbombs[i];

    if (b.st === 'fly') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.sx + (b.tx - b.sx) * k;
      b.y = b.sy + (b.ty - b.sy) * k;
      b.h = Math.sin(Math.PI * k) * M.arc;
      b.spin += dt * 10;

      /* 磁吸：途中蹭到谁就粘谁，不等人落地 */
      for (let k2 = 0; k2 < G.enemies.length; k2++) {
        const e = G.enemies[k2];
        if (!e.alive) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (e.r + 14) * (e.r + 14)) {
          b.st = 'stuck'; b.host = e; b.fuse = M.fuse;
          popup(e.x, e.y - e.r - 20, '贴在身上了', '#8fe0ff', 12);
          Sfx.tone(760, 0.08, 0.05, 'square', 520);
          break;
        }
      }
      if (b.st === 'fly' && k >= 1) {
        b.st = 'stuck';
        b.host = null;
        b.ax = b.x; b.ay = b.y;
        b.fuse = M.fuse;
        Sfx.tone(680, 0.08, 0.05, 'square', 460);
      }
      continue;
    }

    /* 吸住了：跟着宿主走（敌人会把它带走），引信到点就炸 */
    if (b.host) {
      if (!b.host.alive) { b.host = null; b.ax = b.x; b.ay = b.y; }
      else { b.x = b.host.x; b.y = b.host.y; }
    }
    b.fuse -= dt;
    if (b.fuse <= 0) {
      magBombBlast(b.x, b.y);
      G.magbombs.splice(i, 1);
    }
  }
}

/* ── V：三联装手炮（三头犬）—— 飞到准星落点炸，一次三发横着排开 ── */

/* 准星落点：鼠标指向的世界坐标，最远 100 米；太近就推出去，别在脚面起爆 */
function glAimPoint() {
  const L = SKILL.gl;
  let dx = mouse.x / ZOOM + G.cam.x - P.x;
  let dy = mouse.y / ZOOM + G.cam.y - P.y;
  let d = Math.hypot(dx, dy) || 1;
  const far = d > L.range;
  if (far) { dx *= L.range / d; dy *= L.range / d; d = L.range; }
  if (d < 44) { dx *= 44 / d; dy *= 44 / d; d = 44; }
  return { x: P.x + dx, y: P.y + dy, d, far };
}

function fireGL(tg, side) {
  const L = SKILL.gl;
  const t = tg || glAimPoint();
  const base = Math.atan2(t.y - P.y, t.x - P.x);
  /* 三发横向排开：落点是一小片而不是一个点，免得三发全叠在同一个人身上 */
  const off = (side || 0) * L.spread;
  const tx = t.x - Math.sin(base) * off;
  const ty = t.y + Math.cos(base) * off;

  const a = Math.atan2(ty - P.y, tx - P.x) + rand(-0.01, 0.01);
  const mx = P.x + Math.cos(a) * (P.r + 10);
  const my = P.y + Math.sin(a) * (P.r + 10);
  const d = Math.max(24, Math.hypot(tx - mx, ty - my));
  const flight = d / L.speed;                          // 到点的飞行时间：只跟距离有关

  G.gls.push({
    x: mx, y: my, px: mx, py: my,
    vx: (tx - mx) / flight,
    vy: (ty - my) / flight,
    tx, ty, r: 5,
    fuse: L.fuse,                                      // 固定 3 秒引信：到点也不会立刻炸
    arrived: false, travel: 0, spin: rand(0, TAU),
  });
  P.recoil = Math.max(P.recoil, 2.4);
  P.x -= Math.cos(a) * 1.8;
  P.y -= Math.sin(a) * 1.8;
  burst(mx, my, 9, {
    angle: a, spread: 0.42, spdMin: 80, spdMax: 280,
    color: ['#ffd66b', '#fff3c4'], life: 0.26, r: 3.2, glow: true,
  });
  Sfx.shoot('shotgun');
}

function useSkill() {
  const op = opDef();
  if (!op) { uiToast('没有出战干员 · 去大厅挑一个', 'small warn'); return; }
  if (!P.alive) return;
  if (!P.op) initOperatorSkills();
  const S = P.op.v;
  const label = op.v.short;
  if (S.cd > 0) { uiToast(label + '冷却 ' + Math.ceil(S.cd) + 's', 'small'); return; }
  if (S.use <= 0) { uiToast(label + '回充中 · ' + Math.ceil(S.recharge) + 's', 'small'); return; }

  consumeOp('v');                               // 扣层 + 出弹间隔 + 开始回充下一层

  if (op.v.kind === 'dash') {
    dashForward();
  } else if (op.v.kind === 'adr') {
    deployAdr();
  }
  kineticKick();
}

/* ── V（威龙）：动力推进 —— 朝输入方向喷气，正前 10 米、侧后打 0.62 折 ── */
function dashForward() {
  const D = SKILL.dash;
  let ix = 0, iy = 0;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (keys['w'] || keys['arrowup']) iy -= 1;
  if (keys['s'] || keys['arrowdown']) iy += 1;
  let ang = P.aim;
  if (ix || iy) ang = Math.atan2(iy, ix);

  /* 和准星夹角越大越短：正前 1.0，侧向 / 正后 0.62 */
  const diff = Math.abs(angleDiff(ang, P.aim));
  const mul = D.sideMul + (1 - D.sideMul) * Math.max(0, Math.cos(diff));
  const dist = D.dist * mul;
  const dur = D.dur * (0.8 + 0.2 * mul);

  P.op.dash = dur;
  P.op.dashDur = dur;
  P.op.dashA = ang;
  P.op.dashSpd = dist / dur;
  P.ads = 0;
  P.sprinting = false;
  P.stamina = Math.max(0, P.stamina - D.cost);
  Sfx.dash();
  shake(4);

  /* 喷口在后、气浪往前推 */
  const bx = P.x - Math.cos(ang) * (P.r + 6);
  const by = P.y - Math.sin(ang) * (P.r + 6);
  burst(bx, by, 18, {
    angle: ang + Math.PI, spread: 0.55, spdMin: 90, spdMax: 300,
    color: ['#ffffff', '#8fe0ff', '#4ad1ff'], life: 0.4, r: 4, drag: 0.86, glow: true,
  });
  popup(P.x, P.y - 48, '动 力 推 进', '#8fe0ff', 12);
}

function dashOn() { return !!(P.op && P.op.dash > 0); }

/* ── 动能辅助（威龙被动）──
   本作没有真正的"高度差"，所以把「高处下落」折算成「被爆炸掀翻」：
   放技能、吃爆炸都回收动能，给一段短加速。 */
function kineOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'kinetic');
}
function kineticKick() {
  if (!kineOn() || !P.op) return;
  const was = P.op.kine;
  P.op.kine = SKILL.kine.dur;
  if (was <= 0.05) {
    popup(P.x, P.y - 62, '动能辅助', '#8fe0ff', 11);
    burst(P.x, P.y + 6, 8, {
      color: ['#8fe0ff', '#ffffff'], life: 0.35, r: 3, spdMin: 30, spdMax: 120, drag: 0.9, glow: true,
    });
  }
}

function glBlast(x, y) {
  const GL = SKILL.gl;
  blastFX(x, y, GL.radius);
  Sfx.explode();
  shake(15);
  emitNoise(x, y, 1200, 1.0);

  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > GL.radius + e.r) continue;
    const fall = 1 - clamp((d - e.r) / GL.radius, 0, 1);
    const ddx = (e.x - x) / (d || 1), ddy = (e.y - y) / (d || 1);
    damageEnemy(e, GL.dmg * (0.35 + fall * 0.65), ddx, ddy, 460);
    /* 眩晕 + 骨折：先站住不动 1.6s，之后一瘸一拐 6s */
    e.stun = Math.max(e.stun || 0, GL.stun);
    e.cripple = Math.max(e.cripple || 0, GL.cripple);
    e.stagger = 0.4;
    popup(e.x, e.y - e.r - 16, '眩晕 · 骨折', '#ffb347', 11);
  }

  /* 自己扔的也会炸自己：半伤 + 近距离糊一脸（外骨骼期间不骨折） */
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < GL.radius + P.r) {
      const fall = 1 - clamp((dp - P.r) / GL.radius, 0, 1);
      damagePlayer(GL.dmg * (0.35 + fall * 0.65) * GL.selfMul, x, y, 0.4);
      P.concuss = Math.max(P.concuss, 0.9);
      if (!exoOn() && Math.random() < 0.35) addDebuff('fissure', 1);
    }
  }
}

function updateGls(dt) {
  const L = SKILL.gl;
  for (let i = G.gls.length - 1; i >= 0; i--) {
    const g = G.gls[i];
    g.fuse -= dt;
    g.spin += dt * 14;
    g.px = g.x; g.py = g.y;

    const spd = Math.hypot(g.vx, g.vy);
    const step = spd * dt;
    const n = Math.max(1, Math.ceil(step / 8));
    let boom = false, hit = false;

    for (let s = 0; s < n; s++) {
      const dtt = dt / n;
      const nx = g.x + g.vx * dtt;
      const ny = g.y + g.vy * dtt;

      /* 撞到实体 / 撞出地图：就地停住 —— 惯性滑到墙上就贴墙停下，等引信烧完再炸 */
      if (!pointInObstacle(g.x, g.y) &&
          (pointInObstacle(nx, g.y) || pointInObstacle(g.x, ny))) { hit = true; break; }
      if (nx < 12 || nx > WORLD.w - 12 || ny < 12 || ny > WORLD.h - 12) { hit = true; break; }

      g.x = nx; g.y = ny;
      g.travel += step / n;

      /* 到准星落点：不炸，只是从这一帧起开始惯性滑行 */
      if (!g.arrived && Math.hypot(g.tx - g.x, g.ty - g.y) <= 9) g.arrived = true;
    }

    /* 到点之后：弹体带着余速往前蹭一小段，速度指数衰减，蹭完就趴在那儿等引信 */
    if (!g.arrived && ((g.tx - g.x) * g.vx + (g.ty - g.y) * g.vy) <= 0) g.arrived = true;   // 一帧跨过了落点
    if (hit) { g.vx = 0; g.vy = 0; }
    else if (g.arrived && (g.vx || g.vy)) {
      const k = Math.exp(-L.glide * dt);
      g.vx *= k; g.vy *= k;
      if (Math.hypot(g.vx, g.vy) < L.slideMin) { g.vx = 0; g.vy = 0; }
    }

    if (Math.random() < (spd > 30 ? 0.8 : 0.25)) {
      addParticle(g.x, g.y, {
        vx: rand(-16, 16), vy: rand(-16, 16), life: rand(0.2, 0.45), r: rand(2, 4),
        color: '#ffcf6b', drag: 0.9, glow: true,
      });
    }

    /* 固定引信：从出膛那一刻算，3 秒到点就炸 —— 不管它落在哪 */
    if (g.fuse <= 0) boom = true;
    if (boom) { glBlast(g.x, g.y); G.gls.splice(i, 1); }
  }
}

/* ── X：大招总入口（外骨骼 / 虎蹲炮） ── */
function useUlt() {
  const op = opDef();
  if (!op) { uiToast('没有出战干员 · 去大厅挑一个', 'small warn'); return; }
  if (!P.alive) return;
  if (!P.op) initOperatorSkills();
  const S = P.op.x;
  if (S.on) { uiToast(op.x.short + '正在生效', 'small'); return; }
  if (S.cd > 0) { uiToast(op.x.short + '冷却 ' + Math.ceil(S.cd) + 's', 'small'); return; }

  if (op.x.kind === 'shock') {
    fireShock();
    S.cd = op.x.cd;
    kineticKick();
    return;
  }

  if (op.x.kind === 'silent') { fireSilent(); return; }

  if (op.x.kind === 'swarm') {
    launchSwarm();
    S.cd = op.x.cd;
    kineticKick();
    return;
  }

  if (op.x.kind !== 'exo') return;   // 其余大招都在手持模式里处理

  S.on = true;
  S.t = op.x.dur;
  S.cd = op.x.cd;               // 冷却从启动那刻开始算
  P.deb.leg = 0;                // 机械腿把断腿撑住
  P.deb.fissure = 0;
  P.stamina = SPRINT.max;
  P.exhaust = 0;
  P.hp = Math.min(P.maxHp, P.hp + 10);
  uiToast('动力外骨骼 · ' + op.x.dur + 's', '');
  popup(P.x, P.y - 52, '外 骨 骼 上 线', '#ff8a4c', 14);
  Sfx.adsIn();
  shake(8);
  burst(P.x, P.y, 26, { color: ['#ff8a4c', '#ffd66b', '#ffffff'], life: 0.6, r: 4, spdMin: 60, spdMax: 300, glow: true });
  kineticKick();
}

/* ── X（威龙）：虎蹲炮 —— 压缩空气弹，2.5 秒引信、撞墙反弹、半径内强制击倒 ── */
function fireShock() {
  const K = SKILL.shock;
  const a = P.aim;
  const mx = P.x + Math.cos(a) * (P.r + 18);
  const my = P.y + Math.sin(a) * (P.r + 18);
  G.shocks.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * K.speed, vy: Math.sin(a) * K.speed,
    r: 10, fuse: K.life, spin: rand(0, TAU), bounce: 0,
  });
  P.recoil = Math.max(P.recoil, 8);
  P.x -= Math.cos(a) * 4.5;
  P.y -= Math.sin(a) * 4.5;
  Sfx.shoot('shotgun');
  Sfx.noiseBurst(0.3, 1200, 0.7, 0.2, 'bandpass');
  shake(6);
  burst(mx, my, 16, {
    angle: a, spread: 0.3, spdMin: 100, spdMax: 320,
    color: ['#ffffff', '#cdf3ff', '#8fe0ff'], life: 0.35, r: 4, glow: true,
  });
  popup(P.x, P.y - 50, '虎 蹲 炮', '#8fe0ff', 13);
}

function updateShocks(dt) {
  const K = SKILL.shock;
  for (let i = G.shocks.length - 1; i >= 0; i--) {
    const s = G.shocks[i];
    s.fuse -= dt;
    s.spin += dt * 12;
    s.px = s.x; s.py = s.y;

    const step = Math.hypot(s.vx, s.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 8));
    for (let k = 0; k < n; k++) {
      const dtt = dt / n;
      let nx = s.x + s.vx * dtt;
      let ny = s.y + s.vy * dtt;
      /* 压缩空气弹会弹墙：撞一下就折一次，弹几次都不炸（只认引信） */
      if (nx < 12 || nx > WORLD.w - 12) { nx = clamp(nx, 12, WORLD.w - 12); s.vx *= -0.86; s.bounce++; }
      if (ny < 12 || ny > WORLD.h - 12) { ny = clamp(ny, 12, WORLD.h - 12); s.vy *= -0.86; s.bounce++; }
      if (pointInObstacle(nx, s.y)) { nx = s.x; s.vx *= -0.86; s.bounce++; }
      if (pointInObstacle(s.x, ny)) { ny = s.y; s.vy *= -0.86; s.bounce++; }
      s.x = nx; s.y = ny;
    }

    if (Math.random() < 0.85) {
      addParticle(s.x, s.y, {
        vx: rand(-24, 24), vy: rand(-24, 24), life: rand(0.18, 0.36), r: rand(3, 6),
        color: pick(['#ffffff', '#cdf3ff', '#8fe0ff']), drag: 0.88, glow: true,
      });
    }

    if (s.fuse <= 0) { shockBlast(s.x, s.y); G.shocks.splice(i, 1); }
  }
}

/* 虎蹲炮起爆：低伤、强制击倒。BOSS 只跪 1 秒，杂兵跪 3 秒 —— 这 3 秒够你换弹或跑路 */
function shockBlast(x, y) {
  const K = SKILL.shock;
  blastFX(x, y, K.radius);
  Sfx.explode();
  shake(18);
  emitNoise(x, y, 1300, 1.0);
  burst(x, y, 34, {
    color: ['#ffffff', '#cdf3ff', '#8fe0ff'], life: 0.6, r: 5,
    spdMin: 80, spdMax: 460, glow: true, drag: 0.88,
  });

  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > K.radius + e.r) continue;
    const kd = e.type === 'boss' ? K.bossKd : K.kd;
    /* 重伤的人被扶起来更慢：倒地时间 ×1.5（这就是「被扶起变长」） */
    const kdT = (e.trauma || 0) > 0 ? kd * SKILL.trauma.kdMul : kd;
    damageEnemy(e, K.dmg, (e.x - x) / (d || 1), (e.y - y) / (d || 1), K.knock);
    e.stun = Math.max(e.stun || 0, kdT);      // stun 就是"不能操作"的总闸
    e.kd = Math.max(e.kd || 0, kdT);          // kd 只负责倒地表现
    e.stagger = 0.5;
    popup(e.x, e.y - e.r - 18,
      (e.type === 'boss' ? '击倒 ' : '击倒 ') + kdT.toFixed(1) + 's' + (kdT > kd ? ' · 重伤难起' : ''),
      (e.trauma || 0) > 0 ? '#ffb28a' : '#8fe0ff', 12);
  }

  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < K.radius + P.r) {
      P.kd = Math.max(P.kd, K.selfKd);
      P.concuss = Math.max(P.concuss, 1.0);
      popup(P.x, P.y - 56, '被自己的气浪掀翻', '#ff8fa3', 13);
      Sfx.hurt();
      kineticKick();                          // 落地回收动能：站起来就跑
    }
  }
}

/* 被击倒（虎蹲炮自炸）：站着不能动也不能打，画面压一层灰 */
function knockOn() { return P.kd > 0; }

function endExo() {
  if (!P.op) return;
  P.op.x.on = false;
  P.op.x.t = 0;
  popup(P.x, P.y - 50, '外骨骼离线', '#ff8a5c', 12);
}

/* 外骨骼击杀结算：续命 + 回血 + 回满体力 */
function exoOnKill() {
  if (!exoOn()) return;
  const op = opDef();
  if (!op) return;
  const X = op.x;
  P.op.x.t += X.killExtend;
  P.hp = Math.min(P.maxHp, P.hp + X.killHeal);
  P.stamina = SPRINT.max;
  P.exhaust = 0;
  popup(P.x, P.y - 64, '延长 +' + X.killExtend + 's · +' + X.killHeal + ' 血', '#ff8a4c', 12);
}

/* ── 被动：战术滑铲（奔跑中按 C，无冷却） ── */
function trySlide() {
  const op = opDef();
  if (!op || !op.passive || op.passive.kind !== 'slide') return;   // 只有带滑铲的干员吃 C
  if (!P.alive) return;
  const S = P.op;
  if (S.slide > 0) return;                          // 这一下滑完再说
  if (!P.sprinting) { uiToast('先跑起来再滑铲', 'small'); return; }
  if (!exoOn() && P.stamina < SKILL.slide.cost) { uiToast('体力不够滑铲', 'small warn'); return; }
  if (legBroken()) return;

  const exo = exoOn();
  const dur = SKILL.slide.dur * (exo ? SKILL.exo.slideDur : 1);
  S.slide = dur;
  S.slideDur = dur;
  S.slideA = (Math.abs(P.vx) + Math.abs(P.vy) > 6) ? Math.atan2(P.vy, P.vx) : P.aim;
  if (!exo) P.stamina = Math.max(0, P.stamina - SKILL.slide.cost);
  P.invuln = Math.max(P.invuln, 0.10);              // 低身位：滑出去的瞬间擦掉一点判定
  Sfx.dash();

  burst(P.x, P.y + 8, 12, {
    angle: S.slideA + Math.PI, spread: 0.7, spdMin: 40, spdMax: 190,
    color: ['#c8d6de', '#8fb6d0'], life: 0.4, r: 3.6, drag: 0.9,
  });
}

/* ══════════════════════════════════════════════════════════
   8.6 露娜 / 蜂医 / 乌鲁鲁：手持装置与技能实体
   ══════════════════════════════════════════════════════════
   共同约定：这些技能先「拿出来」（P.op.mode），左键 / 右键才是技能动作，
   这期间枪是收起来的。拿出来不扣储备，真正用掉才算一次。
   ─────────────────────────────────────────────────────── */
function spotOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'spot');
}
function toughOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'tough');
}
function rescueOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'rescue');
}
/* 被标上的人：迷雾里也看得见 */
function markEnemy(e, t) {
  if (!e) return;
  e.mark = Math.max(e.mark || 0, t);
}

/* 手持模式的每帧：右键边沿、左键动作、引信计时 */
/* 左键这一下被技能吃掉了：把按住状态一并吞掉，
   不然「按下即发射 + 收技能」的出口会让还按着的左键漏给枪（下一帧全自动直接开火）。 */
function swallowClick() { mouse.down = false; mouse.pressed = false; }

function updateModeInput(dt) {
  const M = P.op && P.op.mode;
  if (!M) return;
  M.t += dt;

  /* 手控制导中：左键手动引爆，导弹没了就自动收手 */
  if (M.controlling) {
    if (!ctlLoiter()) { exitMode(true); return; }
    if (mouse.pressed) {
      const m = ctlLoiter();
      if (m) {
        loiterBlast(m.x, m.y, true);
        const idx = G.loiters.indexOf(m);
        if (idx >= 0) G.loiters.splice(idx, 1);
      }
      swallowClick();                // 这一击是引爆，别让按住的左键漏给枪
      exitMode(true);
      return;
    }
    M.prevDown = mouse.down;
    return;
  }

  const rEdge = mouse.right && !M.rightPrev;
  M.rightPrev = mouse.right;

  if (rEdge) {
    if (M.id === 'frag') { fragThrow(true); consumeOp('g'); exitMode(); return; }
    if (M.id === 'firebomb') { firebombThrow(true); consumeOp('g'); exitMode(); return; }
    if (M.id === 'gl') { exitMode(); return; }          // 右键把手炮收回去
    if (M.id === 'shockbow') {
      M.bounce = !M.bounce;
      popup(P.x, P.y - 58, M.bounce ? '反弹 · 开' : '反弹 · 关', M.bounce ? '#9ef7c8' : '#8fa8b8', 11);
      Sfx.tone(760, 0.05, 0.03, 'square', 900);
    }
    if (M.id === 'coverdev') {
      M.vert = !M.vert;
      popup(P.x, P.y - 58, M.vert ? '竖向' : '横向', '#ffc98a', 11);
      Sfx.tone(700, 0.05, 0.03, 'square', 900);
    }
  }

  if (mouse.pressed) {
    if (M.id === 'frag') {
      M.lit = true;
      M.fuse = SKILL.frag.fuse;
      Sfx.tone(1200, 0.05, 0.03, 'square', 900);
    } else if (M.id === 'firebomb') {
      swallowClick(); firebombThrow(false); consumeOp('g'); exitMode(); return;
    } else if (M.id === 'shockbow') {
      swallowClick(); fireArrow('arc', M.bounce); consumeOp('v'); exitMode(); return;
    } else if (M.id === 'scanbow') {
      swallowClick(); fireArrow('scan', false); consumeOp('x'); exitMode(); return;
    } else if (M.id === 'coverdev') {
      /* 放不下就不扣储备、也不收起装置 —— 换个地方再来 */
      if (placeCover(M.vert)) { swallowClick(); consumeOp('v'); exitMode(); }
      return;
    } else if (M.id === 'healgun') {
      swallowClick(); fireHealDart(); exitMode(); return;   // 一针一按：打完就收，再用重按 X
    } else if (M.id === 'gl') {
      /* 三发共用一个落点：按下那一刻锁定准星位置，之后动鼠标不会把弹撒出去 */
      const S = P.op.v;
      if (S.cd > 0 || S.use <= 0) return;
      const tg = glAimPoint();
      fireGL(tg, 0);
      P.op.volley = { left: Math.max(0, (opDef().v.shots || 3) - 1), t: 0.11, tg, n: 1 };
      consumeOp('v');
      kineticKick();
      popup(P.x, P.y - 46, '三 头 犬', '#ffd66b', 12);
      swallowClick();                   // 一组一按：打完就收，想再放重按 V
      exitMode();
      return;
    } else if (M.id === 'loiter') {
      swallowClick();
      fireLoiter(mouse.right);
      if (!mouse.right) exitMode();
      return;
    }
  }

  if (M.id === 'frag' && M.lit) {
    M.fuse -= dt;
    if (M.fuse <= 0) {
      fragBlast(P.x, P.y, true);
      exitMode(true);
      uiToast('引信烧完了 —— 手里炸的', 'small warn');
      return;
    }
    if (M.prevDown && !mouse.down) { fragThrow(false); consumeOp('g'); exitMode(); return; }
  }
  M.prevDown = mouse.down;
  if (M.id === 'loiter') M.aimR = clamp(M.aimR + (mouse.right ? dt * 3 : -dt * 3), 0, 1);
  if (M.id === 'healgun') P.ads = Math.max(P.ads, mouse.right ? 0.5 : 0);
}

/* ── 露娜 G：增强破片手雷 ── */
function fragThrow(isLob) {
  const F = SKILL.frag, M = P.op.mode;
  const maxD = isLob ? F.lob : F.holdMax;
  const d = clamp(magAimDist() || 120, 70, maxD);
  P.op.lastThrow = d;
  const a = P.aim;
  let tx = clamp(P.x + Math.cos(a) * d, 24, WORLD.w - 24);
  let ty = clamp(P.y + Math.sin(a) * d, 24, WORLD.h - 24);
  /* 落点压在墙里就往回退，别让雷长在水泥里 */
  for (let t = 0; t < 12 && pointInObstacle(tx, ty); t++) {
    tx -= Math.cos(a) * 22;
    ty -= Math.sin(a) * 22;
  }
  G.frags.push({
    x: P.x, y: P.y, sx: P.x, sy: P.y, tx, ty, t: 0,
    dur: clamp(d / F.speed, 0.12, 0.9),
    fuse: isLob ? F.fuse : Math.max(0.04, M ? M.fuse : F.fuse),
    st: 'fly', spin: rand(0, TAU), lob: !!isLob,
  });
  P.recoil = Math.max(P.recoil, 3);
  burst(P.x + Math.cos(a) * (P.r + 10), P.y + Math.sin(a) * (P.r + 10), 7, {
    angle: a, spread: 0.5, spdMin: 50, spdMax: 180,
    color: ['#e8f6ec', '#8ef2b0'], life: 0.25, r: 3,
  });
  Sfx.dash();
}

function fragBlast(x, y, self) {
  const F = SKILL.frag;
  blastFX(x, y, F.radius);
  Sfx.explode();
  shake(14);
  emitNoise(x, y, 1400, 1.0);
  burst(x, y, 26, {
    color: ['#ffffff', '#bff3c9', '#8ef2b0', '#ffd66b'],
    life: 0.55, r: 4.5, spdMin: 90, spdMax: 400, glow: true, drag: 0.9,
  });
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > F.radius + e.r) continue;
    const fall = 1 - clamp((d - e.r) / F.radius, 0, 1);
    damageEnemy(e, F.dmg * (0.32 + fall * 0.68), (e.x - x) / (d || 1), (e.y - y) / (d || 1), 320);
    e.stagger = 0.4;
    if (Math.random() < 0.55) e.cripple = Math.max(e.cripple || 0, 2.5);
    if (Math.random() < 0.5) markEnemy(e, 4);      // 破片也算「打中」
    popup(e.x, e.y - e.r - 16, '破片', '#bff3c9', 10);
  }
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < F.radius + P.r) {
      const fall = 1 - clamp((dp - P.r) / F.radius, 0, 1);
      damagePlayer(F.dmg * (0.32 + fall * 0.68) * (self ? 1 : F.selfMul), x, y, 0.45);
      if (Math.random() < 0.35) addDebuff('bleed', 1);
    }
  }
}

function updateFrags(dt) {
  for (let i = G.frags.length - 1; i >= 0; i--) {
    const g = G.frags[i];
    g.spin += dt * 12;
    if (g.st === 'fly') {
      g.t += dt;
      const k = clamp(g.t / g.dur, 0, 1);
      g.x = lerp(g.sx, g.tx, k);
      g.y = lerp(g.sy, g.ty, k);
      g.h = Math.sin(k * Math.PI) * (g.lob ? 74 : 46);
      if (k >= 1) {
        g.st = 'ground';
        g.h = 0;
        /* 惯性：落地后带着投掷方向的余速往前蹭，蹭到墙就停，引信继续烧 */
        const ang = Math.atan2(g.ty - g.sy, g.tx - g.sx);
        const sp = SKILL.frag.speed * SKILL.frag.slide;
        g.svx = Math.cos(ang) * sp;
        g.svy = Math.sin(ang) * sp;
        if (g.fire) { igniteGround(g.x, g.y); G.frags.splice(i, 1); continue; }
      }
    } else {
      g.fuse -= dt;
      /* 地面滑行：指数衰减，撞墙 / 滑到低速就停 */
      if (g.svx || g.svy) {
        const spd = Math.hypot(g.svx, g.svy);
        const step = spd * dt;
        const n = Math.max(1, Math.ceil(step / 8));
        for (let s = 0; s < n; s++) {
          const dtt = dt / n;
          const nx = g.x + g.svx * dtt;
          const ny = g.y + g.svy * dtt;
          if (nx < 12 || nx > WORLD.w - 12 || ny < 12 || ny > WORLD.h - 12 ||
              pointInObstacle(nx, g.y) || pointInObstacle(g.x, ny)) {
            g.svx = 0; g.svy = 0; break;
          }
          g.x = nx; g.y = ny;
        }
        const k2 = Math.exp(-SKILL.frag.glide * dt);
        g.svx *= k2; g.svy *= k2;
        if (Math.hypot(g.svx, g.svy) < SKILL.frag.slideMin) { g.svx = 0; g.svy = 0; }
      }
      if (g.fuse <= 0) { fragBlast(g.x, g.y, false); G.frags.splice(i, 1); }
    }
  }
}

/* ══════════════════════════════════════════════════════════
   8.7 无名：闪光弹 / 旋刃飞行器 / 静默潜袭 / 重伤延滞
   ══════════════════════════════════════════════════════════
   三个能力共用一套「听觉 + 视觉 + 恢复」的底层：
   · 闪光弹只认「面朝爆点」的敌人，背对着炸就只是亮一下
   · 旋刃有两条出手路径（直掷 / 锁定追踪），爆炸结算完全一样
   · 静默潜袭不改视野，只压噪音、抹脚印、挡掉侦察标记
   · 被无名打中的人挂「重伤」：包扎更久、回血更少、起身更慢，还容易流血
   ─────────────────────────────────────────────────────── */

/* ── G：突破型闪光弹 —— 撞墙 0.35 秒后就地起爆 ── */
function throwFlash() {
  const F = SKILL.flash;
  const a = P.aim;
  /* 落点 = 鼠标位置，超出最大投掷距离就落在最大距离处 */
  const d = clamp(magAimDist() || 160, 70, F.range);
  const tx = clamp(P.x + Math.cos(a) * d, 12, WORLD.w - 12);
  const ty = clamp(P.y + Math.sin(a) * d, 12, WORLD.h - 12);
  const mx = P.x + Math.cos(a) * (P.r + 9);
  const my = P.y + Math.sin(a) * (P.r + 9);
  G.flashes.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * F.speed, vy: Math.sin(a) * F.speed,
    tx, ty, arrived: false,
    fuse: F.fuse, bounced: 0,
    spin: rand(0, TAU), r: 6,
  });
  P.recoil = Math.max(P.recoil, 2.4);
  burst(mx, my, 8, {
    angle: a, spread: 0.4, spdMin: 60, spdMax: 220,
    color: ['#ffffff', '#dcd4ff'], life: 0.24, r: 3, glow: true,
  });
  Sfx.dash();
  popup(P.x, P.y - 46, '闪 光 弹', '#dcd4ff', 12);
}

function updateFlashes(dt) {
  const F = SKILL.flash;
  for (let i = G.flashes.length - 1; i >= 0; i--) {
    const f = G.flashes[i];
    f.fuse -= dt;
    f.spin += dt * 16;
    f.px = f.x; f.py = f.y;

    const step = Math.hypot(f.vx, f.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 8));
    let hitWall = false;
    for (let k = 0; k < n; k++) {
      const dtt = dt / n;
      let nx = f.x + f.vx * dtt;
      let ny = f.y + f.vy * dtt;
      if (nx < 12 || nx > WORLD.w - 12) { nx = clamp(nx, 12, WORLD.w - 12); f.vx *= -F.bounce; hitWall = true; }
      if (ny < 12 || ny > WORLD.h - 12) { ny = clamp(ny, 12, WORLD.h - 12); f.vy *= -F.bounce; hitWall = true; }
      if (pointInObstacle(nx, f.y)) { nx = f.x; f.vx *= -F.bounce; hitWall = true; }
      if (pointInObstacle(f.x, ny)) { ny = f.y; f.vy *= -F.bounce; hitWall = true; }
      f.x = nx; f.y = ny;
    }
    /* 撞到东西就开始闪：0.35 秒后炸，给玩家一点「弹进去再炸」的空间 */
    if (hitWall && f.bounced < 2) {
      f.bounced++;
      f.fuse = Math.min(f.fuse, F.wallFuse);
      Sfx.tone(1500, 0.05, 0.03, 'square', 1200);
    } else if (!hitWall) {
      /* 到落点判定（与手炮同款）：贴到落点 9px 内，或这一帧跨过了落点 */
      if (!f.arrived && Math.hypot(f.tx - f.x, f.ty - f.y) <= 9) f.arrived = true;
      if (!f.arrived && ((f.tx - f.x) * f.vx + (f.ty - f.y) * f.vy) <= 0) f.arrived = true;
      /* 到点之后不立刻死：弹体带着余速往前蹭，指数衰减到停 —— 惯性滑行 */
      if (f.arrived && (f.vx || f.vy)) {
        const k = Math.exp(-F.glide * dt);
        f.vx *= k; f.vy *= k;
        if (Math.hypot(f.vx, f.vy) < F.slideMin) { f.vx = 0; f.vy = 0; }
      }
    }

    if (f.fuse <= 0) { flashBlast(f.x, f.y); G.flashes.splice(i, 1); }
  }
}

function flashBlast(x, y) {
  const F = SKILL.flash;
  /* 视觉：一圈白色冲击 + 刺眼的星芒 */
  blastFX(x, y, F.radius * 0.62);
  Sfx.tone(2400, 0.16, 0.08, 'triangle', 500);
  Sfx.noiseBurst(0.18, 3200, 1.4, 0.34);
  shake(9);
  emitNoise(x, y, 900, 0.7);
  burst(x, y, 34, {
    color: ['#ffffff', '#f3f0ff', '#dcd4ff'], life: 0.5, r: 6,
    spdMin: 120, spdMax: 520, glow: true, drag: 0.92,
  });
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU);
    addParticle(x, y, {
      vx: Math.cos(a) * rand(120, 380), vy: Math.sin(a) * rand(120, 380),
      life: rand(0.2, 0.42), r: rand(2, 4), color: '#ffffff', drag: 0.9, glow: true,
    });
  }

  /* 敌人：只闪到「面朝爆点」的那几个（背对 = 只看见墙上亮了一下） */
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > F.radius + e.r) continue;
    if (!losClear(x, y, e.x, e.y)) continue;
    const toFlash = Math.atan2(y - e.y, x - e.x);
    /* 「面朝」按这个兵种自己的视锥算：突击兵 ±57°，总监视野宽 ±80°，站侧后方就闪不到 */
    if (Math.abs(angleDiff(toFlash, e.facing)) > (e.fov || 1.0)) {
      popup(e.x, e.y - e.r - 18, '背对 · 没被闪到', 'rgba(200,215,235,0.75)', 10);
      continue;
    }
    const fall = 1 - clamp((d - e.r) / F.radius, 0, 1);
    const t = F.blind * (0.45 + 0.55 * fall);
    e.blind = Math.max(e.blind || 0, t);
    e.stun = Math.max(e.stun || 0, 0.45);
    e.bandaging = false;
    e.careSeek = 0;
    G.blinds++;
    popup(e.x, e.y - e.r - 22, '致盲 ' + t.toFixed(1) + 's', '#ffffff', 12);
  }

  /* 自己：站在爆光里一样中招 —— 屏幕炸白 + 眩晕 */
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < F.radius + P.r && losClear(x, y, P.x, P.y)) {
      const fall = 1 - clamp((dp - P.r) / F.radius, 0, 1);
      G.flashBlind = Math.max(G.flashBlind || 0, 0.55 + 0.45 * fall);
      P.concuss = Math.max(P.concuss, SKILL.flash.selfConcuss);
      popup(P.x, P.y - 56, '被自己的闪光晃到', '#ffffff', 13);
      Sfx.hurt();
    }
  }
}

/* ── 重伤延滞（被动）── */
function traumaOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'trauma');
}
/* 给敌人挂一层「流血」：最多 3 层，每层每秒掉血 */
function addEnemyBleed(e, n) {
  if (!e || !e.alive) return;
  const EB = SKILL.ebleed;
  const before = e.bleedN || 0;
  e.bleedN = Math.min(EB.max, before + Math.max(1, n | 0));
  e.bleedT = EB.life;
  if (e.bleedN === before) return;
  G.bleedHits++;
  popup(e.x, e.y - e.r - 20, '流血 ×' + e.bleedN, '#ff5c7a', 11);
  burst(e.x, e.y, 5, {
    color: ['#ff4a6a', '#c21030'], life: 0.4, r: 2.6,
    spdMin: 20, spdMax: 110, drag: 0.9,
  });
}

/* ── V：旋刃飞行器 ── */
/* 挑锁定目标：准星方向 ±1.0 弧度、26 米内、视线通畅，取离准星最近的 */
function pickBladeTarget() {
  const B = SKILL.blade;
  let best = null, bestScore = Infinity;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = dist(P.x, P.y, e.x, e.y);
    if (d > B.lockRange) continue;
    const ang = Math.atan2(e.y - P.y, e.x - P.x);
    const off = Math.abs(angleDiff(ang, P.aim));
    if (off > 1.05) continue;
    if (!losClear(P.x, P.y, e.x, e.y)) continue;
    const score = off * 260 + d * 0.35;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/* 长按 V 的每帧：维持目标、算「是否在背后」、攒锁定条 */
function bladeLockStep(dt) {
  const B = SKILL.blade;
  if (!P.alive) { BLADE_LOCK.target = null; BLADE_LOCK.prog = 0; return; }
  let t = BLADE_LOCK.target;
  if (t && (!t.alive || dist(P.x, P.y, t.x, t.y) > B.lockRange || !losClear(P.x, P.y, t.x, t.y))) t = null;
  if (!t) { t = pickBladeTarget(); BLADE_LOCK.prog = 0; }
  BLADE_LOCK.target = t;
  if (!t) { BLADE_LOCK.behind = false; BLADE_LOCK.prog = Math.max(0, BLADE_LOCK.prog - dt * 1.8); return; }

  /* 目标面朝哪：他自己朝着玩家 = 正对；背对玩家 = 背后（锁定飞快） */
  const toPlayer = Math.atan2(P.y - t.y, P.x - t.x);
  const behind = Math.abs(angleDiff(t.facing, toPlayer)) > 2.0;
  BLADE_LOCK.behind = behind;
  const need = B.lockTime * (behind ? B.lockBehind : 1);
  const before = BLADE_LOCK.prog;
  BLADE_LOCK.prog = Math.min(1, BLADE_LOCK.prog + dt / need);
  if (before < 1 && BLADE_LOCK.prog >= 1) {
    Sfx.tone(behind ? 1650 : 1250, 0.09, 0.05, 'triangle', 900);
    popup(t.x, t.y - t.r - 34, behind ? '背 后 锁 定' : '锁 定', '#c9c0ff', 12);
  }
}

function fireBlade(tgt) {
  const B = SKILL.blade;
  const a = tgt ? Math.atan2(tgt.y - P.y, tgt.x - P.x) : P.aim;
  const mx = P.x + Math.cos(a) * (P.r + 10);
  const my = P.y + Math.sin(a) * (P.r + 10);
  G.blades.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * B.launch, vy: Math.sin(a) * B.launch,
    spd: B.launch, homing: !!tgt, target: tgt || null,
    life: B.life, bounced: 0, spin: 0, travel: 0, a,
  });
  P.recoil = Math.max(P.recoil, 3.4);
  burst(mx, my, 10, {
    angle: a, spread: 0.35, spdMin: 80, spdMax: 280,
    color: ['#ffffff', '#c9c0ff', '#8f7bff'], life: 0.26, r: 3.2, glow: true,
  });
  Sfx.tone(520, 0.06, 0.04, 'sawtooth', 1400);
  popup(P.x, P.y - 46, tgt ? '旋 刃 · 追 踪' : '旋 刃 投 掷', '#c9c0ff', 12);
}

function updateBlades(dt) {
  const B = SKILL.blade;
  for (let i = G.blades.length - 1; i >= 0; i--) {
    const s = G.blades[i];
    s.px = s.x; s.py = s.y;
    s.life -= dt;
    s.spin += dt * 22;

    /* 追踪：按转向速率把速度方向掰向目标 */
    if (s.homing && s.target && s.target.alive) {
      const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
      const cur = Math.atan2(s.vy, s.vx);
      const na = cur + clamp(angleDiff(want, cur), -B.turn * dt, B.turn * dt);
      s.spd = Math.min(B.speed, s.spd + 520 * dt);
      s.vx = Math.cos(na) * s.spd;
      s.vy = Math.sin(na) * s.spd;
      s.a = na;
      if (dist(s.x, s.y, s.target.x, s.target.y) < s.target.r + B.near) {
        bladeBlast(s.x, s.y); G.blades.splice(i, 1); continue;
      }
    }

    const step = Math.hypot(s.vx, s.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 8));
    let boom = false;
    for (let k = 0; k < n && !boom; k++) {
      const dtt = dt / n;
      let nx = s.x + s.vx * dtt;
      let ny = s.y + s.vy * dtt;
      let hit = false;
      if (nx < 12 || nx > WORLD.w - 12) { nx = clamp(nx, 12, WORLD.w - 12); s.vx *= -1; hit = true; }
      if (ny < 12 || ny > WORLD.h - 12) { ny = clamp(ny, 12, WORLD.h - 12); s.vy *= -1; hit = true; }
      if (pointInObstacle(nx, s.y)) { nx = s.x; s.vx *= -1; hit = true; }
      if (pointInObstacle(s.x, ny)) { ny = s.y; s.vy *= -1; hit = true; }

      if (hit) {
        /* 短按模式：弹一次墙，第二次撞墙就炸（这就是「弹墙炸掩体后」的玩法） */
        if (s.bounced < B.bounce) {
          s.bounced++;
          s.spd *= B.bounceKeep;
          s.vx *= B.bounceKeep; s.vy *= B.bounceKeep;
          s.a = Math.atan2(s.vy, s.vx);
          Sfx.tone(880, 0.05, 0.03, 'square', 600);
          burst(nx, ny, 6, {
            color: ['#ffffff', '#c9c0ff'], life: 0.24, r: 2.6,
            spdMin: 40, spdMax: 180, glow: true,
          });
        } else boom = true;
      }
      s.x = nx; s.y = ny;
      if (!boom) {
        for (const e of G.enemies) {
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < e.r + 9) { boom = true; break; }
        }
      }
    }
    s.travel += Math.hypot(s.vx, s.vy) * dt;

    if (Math.random() < 0.7) {
      addParticle(s.x, s.y, {
        vx: rand(-26, 26), vy: rand(-26, 26), life: rand(0.14, 0.3), r: rand(1.6, 3.2),
        color: pick(['#ffffff', '#c9c0ff', '#8f7bff']), drag: 0.9, glow: true,
      });
    }

    if (boom || s.life <= 0 || s.travel > B.range) {
      bladeBlast(s.x, s.y);
      G.blades.splice(i, 1);
    }
  }
}

function bladeBlast(x, y) {
  const B = SKILL.blade;
  blastFX(x, y, B.radius);
  Sfx.explode();
  shake(12);
  emitNoise(x, y, 1050, 0.95);
  burst(x, y, 26, {
    color: ['#ffffff', '#c9c0ff', '#8f7bff', '#ff5c7a'],
    life: 0.55, r: 4.6, spdMin: 90, spdMax: 400, glow: true, drag: 0.9,
  });
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > B.radius + e.r) continue;
    const fall = 1 - clamp((d - e.r) / B.radius, 0, 1);
    damageEnemy(e, B.dmg * (0.4 + fall * 0.6), (e.x - x) / (d || 1), (e.y - y) / (d || 1), 300);
    addEnemyBleed(e, B.bleed);
    e.cripple = Math.max(e.cripple || 0, B.cripple);
    e.trauma = Math.max(e.trauma || 0, SKILL.trauma.dur);
    if (e.type !== 'boss' && e.type !== 'director') {
      e.stun = Math.max(e.stun || 0, 0.3);
      popup(e.x, e.y - e.r - 18, '骨折 · 减速', '#ffb28a', 11);
    }
  }
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < B.radius + P.r) {
      const fall = 1 - clamp((dp - P.r) / B.radius, 0, 1);
      damagePlayer(B.dmg * (0.4 + fall * 0.6) * B.selfMul, x, y, 0.5);
      if (Math.random() < 0.5) addDebuff('bleed', 1);
      if (Math.random() < B.fissureP) addDebuff('fissure', 1);
      P.concuss = Math.max(P.concuss, 0.6);
    }
  }
}

/* ── X：静默潜袭 ── */
function silentOn() {
  const op = opDef();
  return !!(op && op.x.kind === 'silent' && P.op && P.op.x.on && P.op.x.t > 0);
}

function fireSilent() {
  const op = opDef();
  if (!op || !P.op) return;
  const S = P.op.x, X = SKILL.silent;
  S.on = true;
  S.t = X.dur;
  S.cd = op.x.cd;

  /* 当场解除追踪：正在追你的敌人被打回搜索，只知道你开大那一刻站哪 */
  G.directorMarkT = 0;
  const ax = P.x, ay = P.y;
  let broke = 0;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    e.lastSeenX = ax; e.lastSeenY = ay;
    if (e.state === 'combat') { e.state = 'alert'; e.investigateT = 7; e.loseT = 0; broke++; }
    if (e.snipeCharge > 0) e.snipeCharge = 0;
    if (e.loadT > 0) e.loadT = 0;
  }

  uiToast('静 默 潜 袭 · ' + X.dur + 's', '');
  popup(P.x, P.y - 56, '静 默 潜 袭', '#a99bff', 15);
  Sfx.adsIn();
  Sfx.tone(320, 0.3, 0.05, 'sine', 120);
  burst(P.x, P.y, 30, {
    color: ['#a99bff', '#6a4cff', '#1a1030'], life: 0.75, r: 4,
    spdMin: 40, spdMax: 220, drag: 0.9, glow: true,
  });
  if (broke > 0) popup(P.x, P.y - 78, '解除 ' + broke + ' 个追踪', '#c9c0ff', 11);
}

function endSilent() {
  if (!P.op) return;
  P.op.x.on = false;
  P.op.x.t = 0;
  popup(P.x, P.y - 50, '静默结束', '#8f7bff', 12);
  Sfx.tone(260, 0.16, 0.04, 'sine', 110);
}

/* ══════════════════════════════════════════════════════════
   蛊（支援）：致盲毒雾 / 肾上腺素激活 / 流荧集群系统
   ──────────────────────────────────────────────────────────
   设计意图：她不给队友发枪，只给队友发状态。
   · G 毒雾：不挡视线的软封锁 —— 踩进去要过半秒才瞎，逼人换路，而不是把人糊在原地。
   · V 肾上腺素：一个必须守着打的圈；圈里是另一个自己，击杀叠层让"打得顺"滚成雪球。
   · X 流荧集群：真正伤人的不是伤害，是上限 —— 被缠上的人打不赢，也跑不快。
   ══════════════════════════════════════════════════════════ */

/* 被动「高效治疗」：全队读条 -20% / 回血与救援速率 +25%（本作单兵行动，落在自己身上） */
function guOn() {
  const op = opDef();
  return !!(op && op.passive && op.passive.kind === 'medic');
}
function careTimeMul() { return guOn() ? SKILL.med : 1; }        // 读条时长倍率
function careRateMul() { return guOn() ? 1 / SKILL.med : 1; }    // 回血 / 自救速率倍率

/* ── 肾上腺素：在场 / 叠层 / 各项修正 ── */
function adrFieldAt(x, y) {
  for (const f of G.adrFields) {
    if (f.t >= f.life) continue;
    if (dist(x, y, f.x, f.y) <= SKILL.adr.r) return f;
  }
  return null;
}
function adrOn() {
  if (!P.op) return false;
  if ((P.op.adrLinger || 0) > 0 || (P.op.adrBuffT || 0) > 0) return true;
  return !!adrFieldAt(P.x, P.y);
}
function adrStackN() { return Math.min((P.op && P.op.adrStack) || 0, SKILL.adr.stackMax); }
function adrEff() { return 1 + adrStackN() * SKILL.adr.stackGain; }
function adrAdsMul() { return adrOn() ? Math.max(0.4, 1 - SKILL.adr.ads * adrEff()) : 1; }
function adrMoveMul() { return adrOn() ? 1 + SKILL.adr.move * adrEff() : 1; }
function adrRecoilMul() { return adrOn() ? Math.max(0.5, 1 - SKILL.adr.recoil * adrEff()) : 1; }
function adrKickMul() { return adrOn() ? Math.max(0.2, 1 - SKILL.adr.kick * adrEff()) : 1; }
function adrShakeMul() { return adrOn() ? Math.max(0.28, 1 - SKILL.adr.shake * adrEff()) : 1; }
/* 前 10 秒：抹掉装备带来的移速 / 开镜负面 */
function adrClearGear() {
  const f = adrFieldAt(P.x, P.y);
  return !!(f && f.t <= SKILL.adr.gearClear);
}
/* buff 期间由蛊本人击杀：叠一层强度（层数整局保留） */
function adrOnKill() {
  if (!adrOn() || !P.op) return;
  if (P.op.adrStack >= SKILL.adr.stackMax) return;
  P.op.adrStack++;
  popup(P.x, P.y - 66, '肾上腺素 +1 层 · ' + P.op.adrStack, '#d8ffa8', 12);
  Sfx.tone(880, 0.1, 0.05, 'triangle', 620);
}

/* ── V：放出增益无人机 ── */
function deployAdr() {
  const AD = SKILL.adr;
  G.adrFields.push({ x: P.x, y: P.y, t: 0, life: AD.life, seed: rand(0, TAU) });
  uiToast('肾 上 腺 素 激 活 · ' + AD.life + 's', '');
  popup(P.x, P.y - 54, '肾 上 腺 素', '#a6ef5e', 14);
  if (P.op && P.op.adrStack > 0) popup(P.x, P.y - 76, '继承 ' + P.op.adrStack + ' 层强度', '#d8ffa8', 11);
  Sfx.adsIn();
  Sfx.tone(660, 0.18, 0.05, 'triangle', 480);
  burst(P.x, P.y, 22, {
    color: ['#d8ffa8', '#a6ef5e', '#5fbf18'], life: 0.6, r: 4,
    spdMin: 50, spdMax: 240, drag: 0.9, glow: true,
  });
}

function updateAdrFields(dt) {
  const AD = SKILL.adr;
  for (let i = G.adrFields.length - 1; i >= 0; i--) {
    const f = G.adrFields[i];
    f.t += dt;
    if (f.t >= f.life) G.adrFields.splice(i, 1);
  }
  if (!P.op) return;
  const inside = P.alive && !!adrFieldAt(P.x, P.y);
  if (inside) P.op.adrLinger = AD.linger;
  else P.op.adrLinger = Math.max(0, (P.op.adrLinger || 0) - dt);
  P.op.adrBuffT = Math.max(0, (P.op.adrBuffT || 0) - dt);

  if (inside && Math.random() < dt * 16) {
    addParticle(P.x + rand(-22, 22), P.y + rand(-18, 18), {
      vx: rand(-6, 6), vy: rand(-30, -10), life: rand(0.5, 1.0), r: rand(1.4, 2.6),
      color: pick(['#d8ffa8', '#a6ef5e']), drag: 0.94, glow: true,
    });
  }
}

/* ── G：瓦斯弹 → 毒雾 ── */
function throwGas() {
  const GS = SKILL.gas;
  const a = P.aim;
  /* 落点 = 鼠标位置，超出最大投掷距离就落在最大距离处 */
  const d = clamp(magAimDist() || 160, 70, GS.range);
  const tx = clamp(P.x + Math.cos(a) * d, 12, WORLD.w - 12);
  const ty = clamp(P.y + Math.sin(a) * d, 12, WORLD.h - 12);
  const mx = P.x + Math.cos(a) * (P.r + 9);
  const my = P.y + Math.sin(a) * (P.r + 9);
  G.gasbombs.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * GS.speed, vy: Math.sin(a) * GS.speed,
    tx, ty, arrived: false,
    fuse: GS.maxFuse, spin: rand(0, TAU),
  });
  P.recoil = Math.max(P.recoil, 2.2);
  popup(P.x, P.y - 46, '致 盲 毒 雾', '#c8f57a', 12);
  burst(mx, my, 8, {
    angle: a, spread: 0.4, spdMin: 60, spdMax: 200,
    color: ['#e8ffc0', '#a6ef5e'], life: 0.24, r: 3, glow: true,
  });
  Sfx.dash();
}

function updateGasBombs(dt) {
  const GS = SKILL.gas;
  for (let i = G.gasbombs.length - 1; i >= 0; i--) {
    const b = G.gasbombs[i];
    b.fuse -= dt;
    b.spin += dt * 14;
    b.px = b.x; b.py = b.y;

    const step = Math.hypot(b.vx, b.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 8));
    let hit = false;
    for (let k = 0; k < n; k++) {
      const dtt = dt / n;
      let nx = b.x + b.vx * dtt;
      let ny = b.y + b.vy * dtt;
      if (nx < 12 || nx > WORLD.w - 12) { nx = clamp(nx, 12, WORLD.w - 12); b.vx *= -0.35; hit = true; }
      if (ny < 12 || ny > WORLD.h - 12) { ny = clamp(ny, 12, WORLD.h - 12); b.vy *= -0.35; hit = true; }
      if (pointInObstacle(nx, b.y)) { nx = b.x; b.vx *= -0.35; hit = true; }
      if (pointInObstacle(b.x, ny)) { ny = b.y; b.vy *= -0.35; hit = true; }
      b.x = nx; b.y = ny;
    }
    /* 碰到墙 / 地面就放气：几乎立刻炸开成雾 */
    if (hit) {
      b.fuse = Math.min(b.fuse, 0.22);
    } else {
      /* 到落点判定（与手炮同款）：贴到落点 9px 内，或这一帧跨过了落点 */
      if (!b.arrived && Math.hypot(b.tx - b.x, b.ty - b.y) <= 9) b.arrived = true;
      if (!b.arrived && ((b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy) <= 0) b.arrived = true;
      /* 到点之后带余速惯性滑行，滑停就地炸开成雾 */
      if (b.arrived && (b.vx || b.vy)) {
        const k = Math.exp(-GS.glide * dt);
        b.vx *= k; b.vy *= k;
        if (Math.hypot(b.vx, b.vy) < GS.slideMin) { b.vx = 0; b.vy = 0; b.fuse = 0; }
      }
    }

    if (Math.random() < 0.6) {
      addParticle(b.x, b.y, {
        vx: rand(-20, 20), vy: rand(-30, 4), life: rand(0.2, 0.45), r: rand(1.6, 3),
        color: '#c8f57a', drag: 0.9, glow: true,
      });
    }
    if (b.fuse <= 0) { gasBlast(b.x, b.y); G.gasbombs.splice(i, 1); }
  }
}

function gasBlast(x, y) {
  const GS = SKILL.gas;
  G.mists.push({ x, y, t: 0, life: GS.life, r: 0, seed: rand(0, 100) });
  Sfx.noiseBurst(0.42, 1100, 1.1, 0.22);
  Sfx.tone(170, 0.46, 0.06, 'sawtooth', 70);
  burst(x, y, 26, {
    color: ['#e8ffc0', '#a6ef5e', '#6fbf2a'], life: 0.8, r: 6,
    spdMin: 40, spdMax: 240, drag: 0.9, glow: true,
  });
  emitNoise(x, y, 700, 0.45);
}

function updateMists(dt) {
  const GS = SKILL.gas;
  for (let i = G.mists.length - 1; i >= 0; i--) {
    const m = G.mists[i];
    m.t += dt;
    const fadeK = 1 - clamp((m.t - (GS.life - GS.fade)) / GS.fade, 0, 0.45);
    m.r = GS.r * clamp(m.t / GS.grow, 0, 1) * fadeK;
    if (m.t >= GS.life) { G.mists.splice(i, 1); continue; }
    if (Math.random() < dt * 20) {
      const a = rand(0, TAU), rr = rand(0.2, 0.95) * m.r;
      addParticle(m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr, {
        vx: rand(-14, 14), vy: rand(-22, -4), life: rand(0.6, 1.3), r: rand(2, 5),
        color: 'rgba(186,232,116,0.35)', drag: 0.92,
      });
    }
  }

  /* 敌人：在雾里待满 0.75 秒才致盲；离开后盲只留 1.2 秒残效 */
  for (const e of G.enemies) {
    if (!e.alive) continue;
    let inside = false;
    for (const m of G.mists) {
      if (m.r < 20) continue;
      if (dist(e.x, e.y, m.x, m.y) <= m.r * 0.92 + e.r) { inside = true; break; }
    }
    if (inside) {
      e.gasT = (e.gasT || 0) + dt;
      if (e.gasT >= GS.delay) {
        if (!e.gasHit) {
          e.gasHit = 1;
          e.blind = Math.max(e.blind || 0, GS.blind);
          e.bandaging = false;
          G.blinds++;
          popup(e.x, e.y - e.r - 30, '毒雾致盲', '#d6ff9c', 11);
        } else {
          e.blind = Math.max(e.blind || 0, GS.residual);
        }
        e.bandaging = false;
      }
    } else {
      e.gasT = Math.max(0, (e.gasT || 0) - dt);
      if (e.gasT <= 0) e.gasHit = 0;
    }
  }

  /* 自己：同一套规矩，一样会瞎 */
  let pin = false;
  if (P.alive) {
    for (const m of G.mists) {
      if (m.r < 20) continue;
      if (dist(P.x, P.y, m.x, m.y) <= m.r * 0.92 + P.r) { pin = true; break; }
    }
  }
  if (pin) G.gasT += dt;
  else G.gasT = Math.max(0, G.gasT - dt);
  const blindT = G.gasT >= GS.delay ? 1 : 0;
  if (blindT > 0) P.concuss = Math.max(P.concuss, 0.4);
  G.gasBlind += (blindT - G.gasBlind) * clamp(dt * (blindT > 0 ? 3.2 : 0.9), 0, 1);
  if (G.gasBlind < 0.004) G.gasBlind = 0;
}

/* ── X：流荧集群 ── */
function swarmSteer(s, ang) {
  const look = 30;
  const free = a => !pointInObstacle(s.x + Math.cos(a) * look, s.y + Math.sin(a) * look);
  if (free(ang)) return ang;
  for (let k = 1; k <= 6; k++) {
    const d = k * 0.34;
    if (free(ang + d)) return ang + d;
    if (free(ang - d)) return ang - d;
  }
  return ang + Math.PI;
}

function pickSwarmTarget(s) {
  const SW = SKILL.swarm;
  let best = null, bd = 1e9;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if ((e.swarmT || 0) > 0) continue;                                  // 已经在拔了，别叠
    if (dist(P.x, P.y, e.x, e.y) > SW.range) continue;                   // 母机 55 米内
    const d = dist(s.x, s.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function launchSwarm() {
  const SW = SKILL.swarm;
  const a = P.aim;
  G.swarms.push({
    x: P.x + Math.cos(a) * 26, y: P.y + Math.sin(a) * 26,
    vx: Math.cos(a) * SW.speed, vy: Math.sin(a) * SW.speed,
    t: 0, life: SW.life, target: null, retarget: 0,
    given: false, seed: rand(0, TAU), bob: 0,
  });
  uiToast('流 荧 集 群 系 统', '');
  popup(P.x, P.y - 56, '流 荧 集 群', '#a6ef5e', 15);
  Sfx.adsIn();
  Sfx.tone(760, 0.2, 0.05, 'triangle', 380);
  burst(P.x, P.y, 26, {
    color: ['#e8ffc0', '#a6ef5e', '#5fbf18'], life: 0.7, r: 4,
    spdMin: 50, spdMax: 260, drag: 0.9, glow: true,
  });
}

function attachSwarm(e) {
  const SW = SKILL.swarm;
  if ((e.swarmT || 0) > 0) return;
  const boss = e.type === 'boss' || e.type === 'director';
  e.swarmT = boss ? SW.bossAttach : SW.attach;
  e.capMul = 1;
  e.capLost = 0;
  e.capFloor = boss ? SW.bossCapFloor : SW.capFloor;
  e.capBoss = boss;
  e.swarmRec = 0;
  G.swarmHits++;
  e.blur = 1;
  e.deaf = 1;
  e.bandaging = false;
  e.careSeek = 0;
  popup(e.x, e.y - e.r - 26, boss ? '无人机群缠上 · 拔除 2s' : '无人机群缠上 · 拔除 3s', '#c8f57a', 12);
  Sfx.tone(620, 0.12, 0.05, 'square', 380);
  burst(e.x, e.y, 14, {
    color: ['#d8ffa8', '#a6ef5e'], life: 0.45, r: 3, spdMin: 40, spdMax: 180, glow: true,
  });
}

function updateSwarms(dt) {
  const SW = SKILL.swarm;
  for (let i = G.swarms.length - 1; i >= 0; i--) {
    const s = G.swarms[i];
    s.t += dt;
    s.bob += dt;
    if (s.t >= s.life) { G.swarms.splice(i, 1); continue; }

    /* 经过队友（本作唯一的队友就是自己）：直接挂一份肾上腺素 */
    if (!s.given && P.alive && dist(s.x, s.y, P.x, P.y) < 48) {
      s.given = true;
      if (P.op) P.op.adrBuffT = Math.max(P.op.adrBuffT || 0, SKILL.adr.passBuff);
      popup(P.x, P.y - 62, '肾上腺素', '#a6ef5e', 12);
    }

    s.retarget -= dt;
    if (!s.target || !s.target.alive || s.retarget <= 0) {
      s.target = pickSwarmTarget(s);
      s.retarget = SW.retarget;
    }

    const tx = s.target ? s.target.x : P.x;
    const ty = s.target ? s.target.y : P.y;
    const cur = Math.atan2(s.vy, s.vx);
    const want = Math.atan2(ty - s.y, tx - s.x);
    let ang = cur + clamp(angleDiff(want, cur), -SW.turn * dt, SW.turn * dt);
    ang = swarmSteer(s, ang);
    const spd = s.target ? SW.speed : SW.speed * 0.45;
    s.vx = Math.cos(ang) * spd;
    s.vy = Math.sin(ang) * spd;
    s.x = clamp(s.x + s.vx * dt, 14, WORLD.w - 14);
    s.y = clamp(s.y + s.vy * dt, 14, WORLD.h - 14);

    if (s.target && dist(s.x, s.y, s.target.x, s.target.y) < SW.radius + s.target.r) attachSwarm(s.target);

    if (Math.random() < dt * 26) {
      addParticle(s.x + rand(-10, 10), s.y + rand(-10, 10), {
        vx: rand(-14, 14), vy: rand(-14, 14), life: rand(0.25, 0.6), r: rand(1.2, 2.4),
        color: pick(['#d8ffa8', '#a6ef5e']), drag: 0.9, glow: true,
      });
    }
  }
}

/* 包扎找掩体：8 米内找一个「自己能站上去、且挡住玩家视线」的点；找不到返回 null */
function findCareCover(e) {
  if (!P.alive) return null;
  for (let t = 0; t < 30; t++) {
    const ang = (t / 30) * TAU + rand(0, 0.4);
    const rr = [60, 100, 144][t % 3];                 // 三圈半径：3.3m / 5.6m / 8m
    const px = e.x + Math.cos(ang) * rr;
    const py = e.y + Math.sin(ang) * rr;
    if (px < e.r + 10 || py < e.r + 10 || px > WORLD.w - e.r - 10 || py > WORLD.h - e.r - 10) continue;
    if (hitsObstacle(px, py, e.r + 6)) continue;      // 得是自己能站的位置
    if (losClear(px, py, P.x, P.y)) continue;         // 得挡住玩家的视线（通视的点不要）
    return { x: px, y: py };
  }
  return null;
}

/* 敌人纯计时类状态的统一衰减。
   只收「按秒简单倒数」的字段（burn/melee 窗口/硬控/致盲/重伤/包扎冷却等）；
   有自己行为逻辑的计时（bandageT、swarmT、bleedT、gasT）仍留在原处 —— 别混进来。
   以后加新 debuff：字段定义在 spawnEnemy，衰减只在这里补一行。 */
function tickEnemyFx(e, dt) {
  e.burn = Math.max(0, e.burn - dt * 6);
  e.touchCd = Math.max(0, e.touchCd - dt);
  e.meleeCd = Math.max(0, e.meleeCd - dt);
  e.meleeSwing = Math.max(0, e.meleeSwing - dt);
  e.meleeBack = Math.max(0, e.meleeBack - dt);
  e.meleeHit = Math.max(0, e.meleeHit - dt * 2);
  e.stagger = Math.max(0, e.stagger - dt);
  e.stun = Math.max(0, (e.stun || 0) - dt);         // 三头犬震晕：不吃不减，纯粹站着发呆
  e.kd = Math.max(0, (e.kd || 0) - dt);             // 虎蹲炮击倒：只负责"趴着"的画面
  e.cripple = Math.max(0, (e.cripple || 0) - dt);   // 骨折：移速打折
  e.mark = Math.max(0, (e.mark || 0) - dt);         // 被标记（露娜被动 / 侦察箭）
  e.healSlow = Math.max(0, (e.healSlow || 0) - dt); // 被电：回血变慢
  e.blind = Math.max(0, (e.blind || 0) - dt);       // 致盲（闪光 / 毒雾）
  e.trauma = Math.max(0, (e.trauma || 0) - dt);     // 重伤（无名被动）
  e.careCd = Math.max(0, (e.careCd || 0) - dt);     // 包扎冷却
}

/* 敌人身上的集群：压上限 / 拔除 / 恢复（每帧在 updateEnemies 里跑） */
function updateSwarmDebuff(e, dt) {
  const SW = SKILL.swarm;
  if ((e.swarmT || 0) > 0) {
    e.swarmT -= dt;
    const floor = e.capFloor == null ? SW.capFloor : e.capFloor;
    const rate = (1 - floor) / (e.capBoss ? SW.bossRamp : SW.ramp);
    e.capMul = Math.max(floor, (e.capMul == null ? 1 : e.capMul) - rate * dt);
    const cap = e.maxHp * e.capMul;
    if (e.hp > cap) {
      e.capLost = (e.capLost || 0) + (e.hp - cap);
      e.hp = cap;
    }
    e.blur = 1;
    e.deaf = 1;
    if (e.swarmT <= 0) {
      e.swarmT = 0;
      e.swarmRec = SW.recover;
      e.capHeal = e.capLost || 0;      // 记下要还回去的血量，恢复期里按固定节奏还
      e.capHeal0 = e.capHeal;
      e.blur = 0;
      e.deaf = 0;
      popup(e.x, e.y - e.r - 26, '拔除无人机群', '#c8f57a', 11);
    }
  } else if ((e.swarmRec || 0) > 0) {
    e.swarmRec = Math.max(0, e.swarmRec - dt);
    const floor = e.capFloor == null ? SW.capFloor : e.capFloor;
    e.capMul = Math.min(1, (e.capMul == null ? 1 : e.capMul) + (1 - floor) * dt / SW.recover);
    /* 上限回来了，血也跟着还 —— 按「拔除那一刻欠下的量」在 6 秒里匀速补 */
    const back = Math.min(e.capHeal || 0, (e.capHeal0 || 0) * dt / SW.recover);
    e.capHeal = Math.max(0, (e.capHeal || 0) - back);
    e.capLost = e.capHeal;
    e.hp = Math.min(e.maxHp, e.hp + back);
    if (e.swarmRec <= 0) {
      e.capMul = 1;
      e.hp = Math.min(e.maxHp, e.hp + (e.capHeal || 0));
      e.capHeal = 0;
      e.capHeal0 = 0;
      e.capLost = 0;
    }
  }
}

/* ── 脚印：静默潜袭期间不落 ── */
let FOOT_ACC = 0;
function updateFootprints(dt) {
  for (let i = G.footprints.length - 1; i >= 0; i--) {
    const f = G.footprints[i];
    f.t += dt;
    if (f.t >= f.life) G.footprints.splice(i, 1);
  }
  if (!P.alive) return;
  const speed = Math.hypot(P.vx, P.vy);
  if (speed < 24) { FOOT_ACC = 0; return; }
  FOOT_ACC += dt;
  const gap = P.sprinting ? 0.22 : 0.34;
  if (FOOT_ACC < gap) return;
  FOOT_ACC = 0;
  if (silentOn()) return;                     // 静默：地上一个印子都不留
  G.footprints.push({
    x: P.x + rand(-3, 3), y: P.y + 5, a: P.aim,
    side: (G.footprints.length & 1) ? 1 : -1, t: 0, life: 6.5,
  });
  if (G.footprints.length > 64) G.footprints.shift();
  /* 跑起来才有声音：走路的动静小到敌人不会因此过来 */
  if (P.sprinting) emitNoise(P.x, P.y, 150, 0.18, true);
}

/* ── 露娜 V / X：弓 ── */
function fireArrow(kind, bounce) {
  const A = kind === 'arc' ? SKILL.arc : SKILL.scan;
  const a = P.aim + rand(-0.012, 0.012);
  const mx = P.x + Math.cos(a) * (P.r + 12);
  const my = P.y + Math.sin(a) * (P.r + 12);
  G.arrows.push({
    kind, x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * A.speed, vy: Math.sin(a) * A.speed,
    bounce: bounce ? 1 : 0, bounces: 0, dist: 0, max: A.range,
    life: A.range / A.speed, spin: a,
  });
  P.recoil = Math.max(P.recoil, 2);
  burst(mx, my, 6, {
    angle: a, spread: 0.22, spdMin: 90, spdMax: 260,
    color: kind === 'arc' ? ['#ffffff', '#8ef2b0', '#43d9a0'] : ['#ffffff', '#9ef7c8', '#5fe0b0'],
    life: 0.24, r: 2.6, glow: true,
  });
  Sfx.tone(620, 0.06, 0.03, 'triangle', 1400);
  popup(P.x, P.y - 46, kind === 'arc' ? '电 击 箭' : '侦 察 箭', kind === 'arc' ? '#8ef2b0' : '#9ef7c8', 12);
}

function arrowLand(a) {
  if (a.kind === 'arc') {
    const A = SKILL.arc;
    G.ezones.push({ x: a.x, y: a.y, r: A.zoneR, life: A.zoneLife, max: A.zoneLife, tick: 0, seed: rand(0, 100) });
    burst(a.x, a.y, 20, {
      color: ['#ffffff', '#8ef2b0', '#43d9a0'], life: 0.5, r: 4, spdMin: 60, spdMax: 320, glow: true,
    });
    Sfx.tone(1800, 0.22, 0.05, 'sawtooth', 400);
    shake(5);
    popup(a.x, a.y - 26, '电 圈', '#8ef2b0', 12);
  } else if (a.kind === 'scan') {
    /* 侦察箭落地：开出无遮挡的侦察视野 + 圈内敌人全部标记（隔墙隔雾都算） */
    const S = SKILL.scan;
    G.scanPings.push({ x: a.x, y: a.y, r: S.pingR, t: S.ping, max: S.ping, seed: rand(0, 100) });
    let n = 0;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (dist2(a.x, a.y, e.x, e.y) < S.pingR * S.pingR) { markEnemy(e, S.mark); n++; }
    }
    burst(a.x, a.y, 18, {
      color: ['#ffffff', '#9ef7c8', '#5fe0b0'], life: 0.55, r: 3.6, spdMin: 40, spdMax: 240, glow: true,
    });
    Sfx.tone(1500, 0.18, 0.05, 'sine', 700);
    Sfx.tone(2100, 0.3, 0.04, 'sine', 900);
    popup(a.x, a.y - 26, n > 0 ? '侦 察 区 域 · ' + n + ' 个目标' : '侦 察 区 域', '#9ef7c8', 12);
  } else {
    burst(a.x, a.y, 14, {
      color: ['#ffffff', '#9ef7c8', '#5fe0b0'], life: 0.45, r: 3.4, spdMin: 40, spdMax: 200, glow: true,
    });
    Sfx.tone(1500, 0.12, 0.04, 'sine', 700);
  }
}

/* 激素针：轻微追踪最近的蜂巢烟 / 敌人；命中烟就把它染绿 */
function stepHealDart(a, dt) {
  const H = SKILL.heal;
  let tgt = null, bd = 300 * 300;
  for (const s of G.smokes) {
    if (!s.bee || s.dyed) continue;
    const d2 = dist2(a.x, a.y, s.x, s.y);
    if (d2 < bd) { bd = d2; tgt = s; }
  }
  if (!tgt) {
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(a.x, a.y, e.x, e.y);
      if (d2 < bd) { bd = d2; tgt = e; }
    }
  }
  if (tgt) {
    const want = Math.atan2(tgt.y - a.y, tgt.x - a.x);
    const cur = Math.atan2(a.vy, a.vx);
    const na = cur + clamp(angleDiff(want, cur), -H.homing * dt, H.homing * dt);
    a.vx = Math.cos(na) * H.speed;
    a.vy = Math.sin(na) * H.speed;
  }

  a.px = a.x; a.py = a.y;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  a.dist += H.speed * dt;

  for (let i = 0; i < G.smokes.length; i++) {
    const s = G.smokes[i];
    if (!s.bee || s.dyed) continue;
    if (dist(a.x, a.y, s.x, s.y) < s.r + 8) {
      dyeSmoke(s);
      G.smokes.splice(i, 1);
      a.dead = true;
      return;
    }
  }
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (dist(a.x, a.y, e.x, e.y) < e.r + 7) {
      damageEnemy(e, H.dmg, a.vx / H.speed, a.vy / H.speed, 40);
      markEnemy(e, 3);
      popup(e.x, e.y - e.r - 12, '激素', '#8dffc0', 10);
      a.dead = true;
      return;
    }
  }
  if (pointInObstacle(a.x, a.y) || a.dist > a.max) a.dead = true;
}

function updateArrows(dt) {
  const S = SKILL.scan;
  for (let i = G.arrows.length - 1; i >= 0; i--) {
    const a = G.arrows[i];

    if (a.kind === 'heal') {
      stepHealDart(a, dt);
      if (a.dead) G.arrows.splice(i, 1);
      continue;
    }

    /* 侦察箭：一路上把 9 米内的敌人标出来 */
    if (a.kind === 'scan') {
      for (const e of G.enemies) {
        if (!e.alive) continue;
        if (dist2(a.x, a.y, e.x, e.y) < S.scanR * S.scanR) markEnemy(e, S.mark);
      }
    }

    a.px = a.x; a.py = a.y;
    const step = Math.hypot(a.vx, a.vy) * dt;
    const n = Math.max(1, Math.ceil(step / 10));
    let stop = false;
    const through = a.kind === 'scan';           // 侦察箭无视地形：穿墙飞满全程
    for (let k = 0; k < n; k++) {
      const dtt = dt / n;
      let nx = a.x + a.vx * dtt;
      let ny = a.y + a.vy * dtt;
      if (nx < 10 || nx > WORLD.w - 10) { if (!through && a.bounce > 0) { a.bounce--; a.bounces++; nx = clamp(nx, 10, WORLD.w - 10); a.vx *= -0.9; } else stop = true; }
      if (ny < 10 || ny > WORLD.h - 10) { if (!through && a.bounce > 0) { a.bounce--; a.bounces++; ny = clamp(ny, 10, WORLD.h - 10); a.vy *= -0.9; } else stop = true; }
      if (!stop && !through && pointInObstacle(nx, a.y)) { if (a.bounce > 0) { a.bounce--; a.bounces++; nx = a.x; a.vx *= -0.9; } else stop = true; }
      if (!stop && !through && pointInObstacle(a.x, ny)) { if (a.bounce > 0) { a.bounce--; a.bounces++; ny = a.y; a.vy *= -0.9; } else stop = true; }
      if (stop) break;
      a.x = nx; a.y = ny;
    }

    a.dist += step;
    if (a.kind === 'arc' || a.kind === 'scan') {
      /* 打到敌人就立刻落地（电箭） —— 侦察箭穿人 */
      if (a.kind === 'arc') {
        for (const e of G.enemies) {
          if (!e.alive) continue;
          if (dist2(a.x, a.y, e.x, e.y) < (e.r + 8) * (e.r + 8)) { stop = true; break; }
        }
      }
    }
    if (stop || a.dist >= a.max) {
      arrowLand(a);
      G.arrows.splice(i, 1);
    }
  }
}

function updateEZones(dt) {
  const A = SKILL.arc;
  for (let i = G.ezones.length - 1; i >= 0; i--) {
    const z = G.ezones[i];
    z.life -= dt;
    if (z.life <= 0) { G.ezones.splice(i, 1); continue; }
    if (Math.random() < dt * 16) {
      const ang = rand(0, TAU), rr = z.r * Math.sqrt(Math.random());
      addParticle(z.x + Math.cos(ang) * rr, z.y + Math.sin(ang) * rr, {
        vx: rand(-20, 20), vy: rand(-50, -12), life: rand(0.2, 0.45), r: rand(1.5, 3.4),
        color: pick(['#ffffff', '#8ef2b0', '#43d9a0']), drag: 0.9, glow: true,
      });
    }
    z.tick -= dt;
    if (z.tick > 0) continue;
    z.tick = A.tick;
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (!e.alive) continue;
      if (dist(e.x, e.y, z.x, z.y) > z.r + e.r) continue;
      damageEnemy(e, A.dmg, (e.x - z.x) / (z.r || 1), (e.y - z.y) / (z.r || 1), 0);
      e.cripple = Math.max(e.cripple || 0, A.cripple);
      e.healSlow = Math.max(e.healSlow || 0, A.healSlow);
      e.stun = Math.max(e.stun || 0, 0.12);
      markEnemy(e, 3);
    }
    if (P.alive && !isDowned() && dist(P.x, P.y, z.x, z.y) < z.r + P.r * 0.5) {
      /* 自己的电圈也会电自己一脚：小伤 + 减速，不骨折 */
      burnPlayer(3.2, z.x, z.y);
      P.chill = Math.max(P.chill, 0.4);
    }
  }
}

/* ── 侦察视野：倒数到期，清空时通知迷雾强制刷一次 ── */
function updateScanPings(dt) {
  let n = G.scanPings.length;
  for (let i = n - 1; i >= 0; i--) {
    const sp = G.scanPings[i];
    sp.t -= dt;
    if (sp.t <= 0) G.scanPings.splice(i, 1);
  }
  if (G.scanPings.length !== n) FOG.pingN = -1;   // 数量变了，让 updateFog 强制重算
}

/* ── 蜂医 G：蜂巢烟（可被激素枪染成治疗场） ── */
function throwBeeSmoke() {
  const SM = SKILL.smoke;
  const dx = mouse.wx - P.x, dy = mouse.wy - P.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(SM.range, Math.max(70, d)) / d;
  let tx = clamp(P.x + dx * k, 30, WORLD.w - 30);
  let ty = clamp(P.y + dy * k, 30, WORLD.h - 30);
  for (let t = 0; t < 14 && pointInObstacle(tx, ty); t++) { tx -= (dx / d) * 24; ty -= (dy / d) * 24; }
  G.smokes.push({ x: tx, y: ty, t: 0, r: 0, seed: rand(0, 100), life: SKILL.bee.life, bee: true });
  popup(P.x, P.y - 46, '蜂 巢 烟', '#8dffc0', 12);
  Sfx.dash();
  burst(tx, ty, 14, { color: ['#e8fff0', '#8dffc0', '#43d9a0'], life: 0.45, r: 6, spdMin: 20, spdMax: 140, drag: 0.88 });
}

/* 把一团蜂巢烟染成治疗场 */
function dyeSmoke(s) {
  const B = SKILL.bee;
  s.dyed = true;
  G.healFields.push({ x: s.x, y: s.y, r: B.healR, life: B.healLife, max: B.healLife, tick: 0, seed: rand(0, 100) });
  burst(s.x, s.y, 26, {
    color: ['#ffffff', '#8dffc0', '#26d96f'], life: 0.7, r: 6, spdMin: 40, spdMax: 220, glow: true, drag: 0.9,
  });
  popup(s.x, s.y - 26, '治 疗 场', '#8dffc0', 13);
  Sfx.heal();
}

function updateHealFields(dt) {
  const B = SKILL.bee;
  for (let i = G.healFields.length - 1; i >= 0; i--) {
    const f = G.healFields[i];
    f.life -= dt;
    if (f.life <= 0) { G.healFields.splice(i, 1); continue; }

    if (Math.random() < dt * 14) {
      const ang = rand(0, TAU), rr = f.r * Math.sqrt(Math.random());
      addParticle(f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr, {
        vx: rand(-12, 12), vy: rand(-38, -10), life: rand(0.5, 1.1), r: rand(2, 4.4),
        color: pick(['#8dffc0', '#43d9a0', '#d8ffe8']), drag: 0.92, glow: true,
      });
    }

    if (P.alive && !isDowned() && dist(P.x, P.y, f.x, f.y) < f.r) {
      if (P.hp < P.maxHp) {
        P.hp = Math.min(P.maxHp, P.hp + B.healRate * dt);
        P.healAcc = (P.healAcc || 0) + B.healRate * dt;
        if (P.healAcc >= 8) { popup(P.x, P.y - 34, '+' + Math.round(P.healAcc), '#8dffc0', 11); P.healAcc = 0; }
      }
    }
    /* 敌我都能吃到：敌人站在绿场里也回血（所以别给他们留一口） */
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (dist(e.x, e.y, f.x, f.y) > f.r) continue;
      const slow = (e.healSlow || 0) > 0 ? 0.3 : 1;
      const trauma = (e.trauma || 0) > 0 ? SKILL.trauma.healMul : 1;   // 重伤：治疗场也救不动
      e.hp = Math.min(e.maxHp, e.hp + B.healRate * 0.7 * slow * trauma * dt);
      if (Math.random() < dt * 0.6) popup(e.x + rand(-6, 6), e.y - e.r - 10, '+', '#6fe8a0', 9);
    }
  }
}

/* ── 蜂医 V：点按 = 派自动烟幕机全速沿射向飞，一路拉直线长烟 ── */
function layLineSmoke() {
  const D = SKILL.drone;
  if (!modeAvailable('v')) return;
  consumeOp('v');
  const a = P.aim;
  G.drones.push({
    x: P.x + Math.cos(a) * 46, y: P.y + Math.sin(a) * 46,
    ang: a, life: D.life, stepT: 0,
    auto: true, dist: 0, max: D.autoRange,
  });
  popup(P.x, P.y - 46, '直 线 长 烟', '#8dffc0', 12);
  Sfx.tone(520, 0.12, 0.04, 'triangle', 900);
  burst(P.x + Math.cos(a) * 40, P.y + Math.sin(a) * 40, 10, {
    angle: a, spread: 0.4, spdMin: 40, spdMax: 200,
    color: ['#e8fff0', '#8dffc0'], life: 0.35, r: 4, drag: 0.9,
  });
}

function startDrone() {
  const D = SKILL.drone;
  if (!modeAvailable('v')) return;
  consumeOp('v');
  const a = P.aim;
  G.drones.push({
    x: P.x + Math.cos(a) * 46, y: P.y + Math.sin(a) * 46,
    ang: a, life: D.life, stepT: 0,
  });
  enterMode('drone', 'v');
  uiToast('WASD 操控无人机 · 再按 V 收回', 'small');
}

function updateDrones(dt) {
  const D = SKILL.drone;
  const ctl = modeOn() && P.op.mode.id === 'drone';
  for (let i = G.drones.length - 1; i >= 0; i--) {
    const d = G.drones[i];
    d.life -= dt;
    /* 手控机：收回 / 到期：机身飞回（这里直接销毁） */
    if (!d.auto && (d.life <= 0 || !ctl)) {
      if (d.life <= 0) popup(d.x, d.y - 16, '无人机撤离', '#8dffc0', 11);
      G.drones.splice(i, 1);
      if (ctl) exitMode(true);
      continue;
    }
    if (d.life <= 0) { G.drones.splice(i, 1); continue; }

    if (ctl && !d.auto) {
      let ix = 0, iy = 0;
      if (keys['a'] || keys['arrowleft']) ix -= 1;
      if (keys['d'] || keys['arrowright']) ix += 1;
      if (keys['w'] || keys['arrowup']) iy -= 1;
      if (keys['s'] || keys['arrowdown']) iy += 1;
      if (ix || iy) d.ang = Math.atan2(iy, ix);
      const mv = (ix || iy) ? D.speed : D.speed * 0.25;
      d.x = clamp(d.x + Math.cos(d.ang) * mv * dt, 20, WORLD.w - 20);
      d.y = clamp(d.y + Math.sin(d.ang) * mv * dt, 20, WORLD.h - 20);
    } else if (d.auto) {
      /* 自动机：全速沿射向直飞，撞墙 / 到头就地撤离（烟迹留在原地） */
      const mv = D.autoSpeed;
      const nx = d.x + Math.cos(d.ang) * mv * dt;
      const ny = d.y + Math.sin(d.ang) * mv * dt;
      d.dist += mv * dt;
      if (pointInObstacle(nx, ny) || d.dist >= d.max) {
        popup(d.x, d.y - 16, '无人机撤离', '#8dffc0', 11);
        G.drones.splice(i, 1);
        continue;
      }
      d.x = nx; d.y = ny;
    }

    /* 恒定烟距：飞多快都按「每 56px 一团」铺烟 */
    d.stepT -= dt;
    if (d.stepT <= 0) {
      d.stepT = d.auto ? (D.speed * D.step) / D.autoSpeed : D.step;
      G.smokes.push({
        x: d.x, y: d.y, t: 0, r: D.trailR, seed: rand(0, 100),
        life: SKILL.bee.life, bee: true, fixed: true, drone: true,
      });
    }
    if (Math.random() < dt * 30) {
      addParticle(d.x + rand(-4, 4), d.y + rand(-4, 4), {
        vx: rand(-14, 14), vy: rand(-14, 14), life: rand(0.2, 0.4), r: rand(2, 4),
        color: '#8dffc0', drag: 0.9, glow: true,
      });
    }
  }
}

/* ── 蜂医 X：激素枪 ── */
function fireHealDart() {
  const H = SKILL.heal;
  if (!modeAvailable('x')) { exitMode(); return; }
  consumeOp('x');
  const a = P.aim + rand(-H.homing * 0.004, H.homing * 0.004);
  const mx = P.x + Math.cos(a) * (P.r + 12);
  const my = P.y + Math.sin(a) * (P.r + 12);
  G.arrows.push({
    kind: 'heal', x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * H.speed, vy: Math.sin(a) * H.speed,
    dist: 0, max: H.range, bounce: 0,
  });
  P.recoil = Math.max(P.recoil, 1.6);
  burst(mx, my, 5, {
    angle: a, spread: 0.2, spdMin: 60, spdMax: 200,
    color: ['#ffffff', '#8dffc0'], life: 0.22, r: 2.4, glow: true,
  });
  Sfx.tone(980, 0.05, 0.03, 'sine', 1600);
}

function healSelfShot() {
  const H = SKILL.heal;
  if (!modeAvailable('x')) return;
  consumeOp('x');
  P.hp = Math.min(P.maxHp, P.hp + H.heal);
  P.regenT = Math.max(P.regenT || 0, H.regenT);
  P.painT = Math.max(P.painT, 6);              // 激素里带止痛
  popup(P.x, P.y - 50, '激 素 · +' + H.heal, '#8dffc0', 13);
  burst(P.x, P.y, 16, { color: ['#ffffff', '#8dffc0', '#26d96f'], life: 0.5, r: 3.6, spdMin: 30, spdMax: 180, glow: true });
  Sfx.heal();
  /* 站在自己蜂巢烟里扎针：顺手把烟染绿 */
  for (const s of G.smokes) {
    if (!s.bee || s.dyed || s.r < 20) continue;
    if (dist(P.x, P.y, s.x, s.y) < s.r * 0.9) { dyeSmoke(s); G.smokes.splice(G.smokes.indexOf(s), 1); break; }
  }
}

/* ── 乌鲁鲁 G：复合燃烧弹 ── */
function firebombThrow(isLob) {
  const F = SKILL.firebomb;
  const maxD = isLob ? F.lob : 9 * 18;
  const d = clamp(magAimDist() || 120, 70, maxD);
  P.op.lastThrow = d;
  const a = P.aim;
  const tx = clamp(P.x + Math.cos(a) * d, 24, WORLD.w - 24);
  const ty = clamp(P.y + Math.sin(a) * d, 24, WORLD.h - 24);
  G.frags.push({
    x: P.x, y: P.y, sx: P.x, sy: P.y, tx, ty, t: 0,
    dur: clamp(d / F.speed, 0.12, 0.9),
    fuse: 0, st: 'fly', spin: rand(0, TAU), lob: !!isLob, fire: true,
  });
  burst(P.x + Math.cos(a) * (P.r + 10), P.y + Math.sin(a) * (P.r + 10), 7, {
    angle: a, spread: 0.5, spdMin: 50, spdMax: 180,
    color: ['#ffd66b', '#ff8a3a'], life: 0.25, r: 3, glow: true,
  });
  Sfx.dash();
}

function igniteGround(x, y) {
  const F = SKILL.firebomb;
  blastFX(x, y, F.r * 0.7);
  Sfx.explode();
  shake(8);
  emitNoise(x, y, 1100, 0.9);
  burst(x, y, 22, { color: ['#ffffff', '#ffd66b', '#ff8a3a', '#ff4422'], life: 0.55, r: 4.6, spdMin: 60, spdMax: 300, glow: true });

  /* 爆燃初伤：中心满伤，边缘衰减到 blastFall。敌人吃全额，自己吃半伤
     （以前落地只有特效，敌人在火里毫发无伤） */
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > F.r + e.r) continue;
    const fall = 1 - clamp((d - e.r) / F.r, 0, 1);
    damageEnemy(e, F.blast * (F.blastFall + fall * (1 - F.blastFall)),
      (e.x - x) / (d || 1), (e.y - y) / (d || 1), 200);
    e.stagger = Math.max(e.stagger || 0, 0.25);
    popup(e.x, e.y - e.r - 16, '爆 燃', '#ff9b57', 11);
  }
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < F.r + P.r) {
      const fall = 1 - clamp((dp - P.r) / F.r, 0, 1);
      damagePlayer(F.blast * (F.blastFall + fall * (1 - F.blastFall)) * F.selfFire, x, y, 0.4);
    }
  }

  G.fires.push({
    x, y, r: F.r, life: F.life, max: F.life, tick: 0.1, etick: 0.1,
    dmg: F.dmg, breed: F.tick, warm: 3.0, geo: true, own: 'p',
  });
  popup(x, y - 24, '火 场', '#ff9b57', 12);
}

/* ── 乌鲁鲁 V：速凝掩体 ── */
/* 这块板能不能立：不能压在地形 / 别的掩体上，也不能把自己砌进去 */
function coverFits(x, y, w, h) {
  for (const o of G.obstacles) {
    if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false;
  }
  /* 圆心到矩形最近点的距离要留出一个身位 */
  const nx = clamp(P.x, x, x + w), ny = clamp(P.y, y, y + h);
  const dx = P.x - nx, dy = P.y - ny;
  return dx * dx + dy * dy > (P.r + 10) * (P.r + 10);
}

/* 落点：以准星距离为准，压在墙上就沿射线朝两边找最近的空位；实在放不下 ok=false。
   放置预览和真正浇筑都走这里，所以你瞄到哪儿就立在哪儿。 */
function coverSpot(vert) {
  const C = SKILL.cover;
  const a = P.aim;
  const want = clamp(magAimDist() || 120, 60, C.range);
  const w = vert ? C.thin : C.long;
  const h = vert ? C.long : C.thin;
  const at = (d) => {
    const x = clamp(P.x + Math.cos(a) * d - w / 2, 8, WORLD.w - w - 8);
    const y = clamp(P.y + Math.sin(a) * d - h / 2, 8, WORLD.h - h - 8);
    return { x, y };
  };
  for (let step = 0; step <= 400; step += 20) {
    if (want + step <= C.range + 1) {
      const p = at(want + step);
      if (coverFits(p.x, p.y, w, h)) return { x: p.x, y: p.y, w, h, ok: true };
    }
    if (want - step >= 0) {
      const p = at(want - step);
      if (coverFits(p.x, p.y, w, h)) return { x: p.x, y: p.y, w, h, ok: true };
    }
  }
  const p = at(want);
  return { x: p.x, y: p.y, w, h, ok: false };
}

function placeCover(vert) {
  const C = SKILL.cover;
  const spot = coverSpot(vert);
  if (!spot.ok) {
    uiToast('这里立不住掩体 · 换个位置', 'small warn');
    Sfx.tone(180, 0.1, 0.05, 'square', 700);
    return false;
  }
  const o = { x: spot.x, y: spot.y, w: spot.w, h: spot.h, tone: 0.78, cover: true };
  G.obstacles.push(o);
  G.covers.push({ o, t: C.life, max: C.life });
  rebuildFogBlock();
  Sfx.tone(300, 0.16, 0.06, 'square', 900);
  shake(3);
  popup(spot.x + spot.w / 2, spot.y - 14, '速 凝 掩 体', '#ffc98a', 12);
  burst(spot.x + spot.w / 2, spot.y + spot.h / 2, 16, {
    color: ['#ffd8a8', '#ffb457', '#ffffff'], life: 0.5, r: 4, spdMin: 40, spdMax: 220, drag: 0.88,
  });
  return true;
}

/* 掩体顶上一条寿命条：最后 10 秒开始闪，免得它毫无预兆地化掉 */
function drawCoverTimers() {
  if (!G.covers.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  for (const c of G.covers) {
    const o = c.o;
    const cx = o.x + o.w / 2, top = o.y;
    const frac = clamp(c.t / c.max, 0, 1);
    const urgent = c.t <= 10;
    const blink = urgent ? 0.4 + 0.6 * Math.abs(Math.sin(G.time * 6)) : 1;
    ctx.fillStyle = 'rgba(6,10,14,0.65)';
    ctx.fillRect(cx - 26, top - 9, 52, 4);
    ctx.fillStyle = urgent ? 'rgba(255,110,90,' + blink.toFixed(2) + ')' : 'rgba(255,190,120,0.9)';
    ctx.fillRect(cx - 26, top - 9, 52 * frac, 4);
    ctx.fillStyle = 'rgba(255,225,190,' + (urgent ? blink.toFixed(2) : '0.62') + ')';
    ctx.font = '700 9px ui-monospace, "Consolas", monospace';
    ctx.fillText(Math.ceil(c.t) + 's', cx, top - 13);
  }
  ctx.restore();
}

function updateCovers(dt) {
  for (let i = G.covers.length - 1; i >= 0; i--) {
    const c = G.covers[i];
    c.t -= dt;
    if (c.t > 0) continue;
    const k = G.obstacles.indexOf(c.o);
    if (k >= 0) G.obstacles.splice(k, 1);
    G.covers.splice(i, 1);
    rebuildFogBlock();
    burst(c.o.x + c.o.w / 2, c.o.y + c.o.h / 2, 14, {
      color: ['#ffd8a8', '#b98d5f'], life: 0.5, r: 4, spdMin: 20, spdMax: 130, drag: 0.9,
    });
    popup(c.o.x + c.o.w / 2, c.o.y - 10, '掩体消散', '#c8b090', 11);
  }
}

/* 迷雾的墙体掩码是按障碍物栅格化的；掩体来了 / 走了要重算一次 */
function rebuildFogBlock() {
  if (!FOG.ready || !FOG.block) return;
  const c = FOG.cell;
  FOG.block.fill(0);
  for (const o of G.obstacles) {
    const c0 = Math.floor(o.x / c), c1 = Math.floor((o.x + o.w) / c);
    const r0 = Math.floor(o.y / c), r1 = Math.floor((o.y + o.h) / c);
    for (let r = Math.max(0, r0); r <= Math.min(FOG.rows - 1, r1); r++) {
      const base = r * FOG.cols;
      for (let k = Math.max(0, c0); k <= Math.min(FOG.cols - 1, c1); k++) FOG.block[base + k] = 1;
    }
  }
}

/* ── 乌鲁鲁 X：巡飞弹 ── */
function fireLoiter(ctl) {
  const L = SKILL.loiter;
  const a = P.aim;
  G.loiters.push({
    x: P.x + Math.cos(a) * (P.r + 16), y: P.y + Math.sin(a) * (P.r + 16),
    ang: a, spd: L.speed * (L.startMul || 0.25), dist: 0, max: L.range,
    ctl: !!ctl, ctlT: ctl ? L.ctl : 0, sub: false, t: 0,
  });
  consumeOp('x');
  if (ctl && P.op && P.op.mode) P.op.mode.controlling = true;
  P.recoil = Math.max(P.recoil, 9);
  shake(6);
  Sfx.shoot('shotgun');
  burst(P.x + Math.cos(a) * (P.r + 16), P.y + Math.sin(a) * (P.r + 16), 14, {
    angle: a + Math.PI, spread: 0.5, spdMin: 60, spdMax: 260,
    color: ['#ffffff', '#ffd66b', '#ffb457'], life: 0.4, r: 4, glow: true,
  });
  popup(P.x, P.y - 50, ctl ? '巡 飞 弹 · 手 控' : '巡 飞 弹', '#ffc98a', 13);
  if (ctl) uiToast('WASD 控制导弹 · 再点左键引爆', 'small');
}

function loiterBlast(x, y, main) {
  const L = SKILL.loiter;
  blastFX(x, y, L.radius);
  Sfx.explode();
  shake(main ? 20 : 10);
  emitNoise(x, y, main ? 1700 : 900, 1.0);
  burst(x, y, main ? 34 : 18, {
    color: ['#ffffff', '#ffd66b', '#ff8a3a', '#ff4422'],
    life: main ? 0.7 : 0.5, r: main ? 6 : 4, spdMin: 80, spdMax: main ? 480 : 300, glow: true, drag: 0.88,
  });
  const R = main ? L.radius : L.subR;
  const DMG = main ? L.dmg : L.subDmg;
  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > R + e.r) continue;
    const fall = 1 - clamp((d - e.r) / R, 0, 1);
    damageEnemy(e, DMG * (0.4 + fall * 0.6), (e.x - x) / (d || 1), (e.y - y) / (d || 1), 260);
    e.stagger = 0.35;
    markEnemy(e, 4);
  }
  if (P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < R + P.r) {
      const fall = 1 - clamp((dp - P.r) / R, 0, 1);
      damagePlayer(DMG * (0.4 + fall * 0.6) * L.selfMul, x, y, 0.45);
    }
  }
  if (main) {
    for (let s = 0; s < L.subs; s++) {
      const ang = rand(0, TAU);
      G.loiters.push({
        x, y, ang, spd: 210, dist: 0, max: 150, ctl: false, sub: true, t: L.subDelay,
      });
    }
    popup(x, y - 30, '分 裂 ×4', '#ffb457', 13);
  }
}

function updateLoiters(dt) {
  const L = SKILL.loiter;
  for (let i = G.loiters.length - 1; i >= 0; i--) {
    const m = G.loiters[i];

    if (m.sub) {
      m.t -= dt;
      if (m.t > 0) continue;
    }

    /* 手控制导：A/D 转向、W/S 加减速 */
    let manualSpd = false;
    if (m.ctl) {
      if (keys['a'] || keys['arrowleft']) m.ang -= L.turn * dt;
      if (keys['d'] || keys['arrowright']) m.ang += L.turn * dt;
      if (keys['w'] || keys['arrowup']) { m.spd = Math.min(L.speed * 1.25, m.spd + L.accel * dt); manualSpd = true; }
      if (keys['s'] || keys['arrowdown']) { m.spd = Math.max(L.speed * 0.25, m.spd - L.accel * dt); manualSpd = true; }
      /* 最大控制时间：到点就地在当前位置引爆，不让导弹无限飞 */
      m.ctlT -= dt;
      if (m.ctlT <= 0) {
        popup(m.x, m.y - 26, '控 制 超 时', '#ff9a6a', 12);
        loiterBlast(m.x, m.y, true);
        G.loiters.splice(i, 1);
        continue;
      }
    }
    /* 由慢到快：没踩 W/S 时自动向满速靠拢（低于满速加速，被 W 提过头的慢慢回落） */
    if (!manualSpd) {
      if (m.spd < L.speed) m.spd = Math.min(L.speed, m.spd + L.accel * dt);
      else m.spd = Math.max(L.speed, m.spd - L.accel * dt);
    }

    m.px = m.x; m.py = m.y;
    const stepLen = m.spd * dt;
    m.x += Math.cos(m.ang) * stepLen;
    m.y += Math.sin(m.ang) * stepLen;
    m.dist += stepLen;

    let boom = false;
    if (m.x < 10 || m.x > WORLD.w - 10 || m.y < 10 || m.y > WORLD.h - 10) boom = true;
    if (pointInObstacle(m.x, m.y)) boom = true;
    if (m.dist >= m.max) boom = true;

    if (!m.sub && Math.random() < dt * 40) {
      addParticle(m.x, m.y, {
        vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.2, 0.4), r: rand(2.5, 5),
        color: pick(['#ffffff', '#ffd66b', '#ffb457']), drag: 0.9, glow: true,
      });
    }
    if (boom) { loiterBlast(m.x, m.y, !m.sub); G.loiters.splice(i, 1); }
  }
}

function ctlLoiter() {
  for (const m of G.loiters) if (m.ctl && !m.sub) return m;
  return null;
}

/* 每帧：冷却、三连发排程、外骨骼计时、滑铲计时 */
function updateOperatorSkills(dt) {
  if (!P.op) initOperatorSkills();
  const S = P.op;
  const op = opDef();
  S.g.cd = Math.max(0, S.g.cd - dt);
  S.v.cd = Math.max(0, S.v.cd - dt);
  S.x.cd = Math.max(0, S.x.cd - dt);
  P.concuss = Math.max(0, P.concuss - dt);

  /* 储备回充：打掉一层就开始计时，回满一层接着回下一层。
     G / V / X 走同一套；激素枪是按「充能」发的，在下面单独处理 */
  for (const k of ['g', 'v', 'x']) {
    const sk = S[k], def = op ? op[k] : null;
    if (!def || def.kind === 'healgun') continue;
    const cap = def.charges || 1;
    if (sk.use < cap && sk.recharge > 0) {
      sk.recharge -= dt;
      if (sk.recharge <= 0) {
        sk.use++;
        sk.recharge = sk.use < cap ? def.cd : 0;
        popup(P.x, P.y - 58, k === 'x' ? (def.short + ' 就绪') : (def.short || '战术道具') + ' +1',
              k === 'x' ? '#ffb27a' : '#9fd0e8', 11);
      }
    }
  }

  if (S.volley) {
    S.volley.t -= dt;
    if (S.volley.t <= 0) {
      if (S.volley.left > 0) {
        /* 左右交替排开（第一发正中，第二发偏左，第三发偏右） */
        fireGL(S.volley.tg, (S.volley.n & 1) ? -1 : 1);
        S.volley.n = (S.volley.n || 1) + 1;
        S.volley.left--;
        S.volley.t = 0.11;
      }
      if (S.volley.left <= 0) S.volley = null;
    }
  }

  if (S.x.on) {
    S.x.t -= dt;
    if (S.x.t <= 0) {
      const xk = op ? op.x.kind : '';
      if (xk === 'silent') endSilent(); else endExo();
    }
  }

  if (S.slide > 0) S.slide = Math.max(0, S.slide - dt);
  if (S.dash > 0) S.dash = Math.max(0, S.dash - dt);
  if (S.kine > 0) S.kine = Math.max(0, S.kine - dt);
  P.kd = Math.max(0, (P.kd || 0) - dt);
  if (P.op.rescueCd > 0) P.op.rescueCd = Math.max(0, P.op.rescueCd - dt);

  /* 蜂医激素枪：按「充能」回，不是冷却 —— 每充满一格就是一发（op.x.cd = 30s） */
  if (op && op.x.kind === 'healgun' && S.x.use < op.x.charges) {
    S.x.recharge = Math.max(0, S.x.recharge - dt);
    if (S.x.recharge <= 0) {
      S.x.use++;
      S.x.recharge = S.x.use < op.x.charges ? op.x.cd : 0;
      popup(P.x, P.y - 58, '激素针 +1 · ' + S.x.use + '/' + op.x.charges, '#8dffc0', 11);
    }
  }

  /* 点按 / 长按计时（updateSkillHold） */
  updateSkillHold(dt);

  /* 无名：长按 V 的锁定进度（松手就清掉，发射在 skillVUp 里结算） */
  if (HOLDV.down && op && op.v.kind === 'blade') bladeLockStep(dt);
  if (!HOLDV.down) BLADE_LOCK.on = false;
  /* 闪光残留：1 秒多退干净 */
  G.flashBlind = Math.max(0, (G.flashBlind || 0) - dt * 0.9);

  /* 长按 G 的预瞄计时：超过阈值才开始画轨迹 */
  if (MAG_AIM.down) {
    MAG_AIM.hold += dt;
    if (!MAG_AIM.on && MAG_AIM.hold >= MAG_HOLD_T) {
      MAG_AIM.on = true;
      Sfx.adsIn();
    }
  } else MAG_AIM.on = false;
}

/* ══════════════════════════════════════════════════════════
   9.5 冰冻军团：冰弹 → 霜区 → 冻伤
   ──────────────────────────────────────────────────────────
   设计意图：这一档敌人不负责「打死你」，负责「让你跑不掉」。
   冰弹直击只有 12 点，但落地炸开的霜区半径 104、持续 5 秒，
   站在里面每 0.9 秒叠一层冻伤（上限 3 层，每层 -7% 移速、+12% 开镜时间）。
   于是真正的威胁来自配合：被冻住的人躲不开手雷兵的圈、也躲不开机枪兵的扫射。
   ══════════════════════════════════════════════════════════ */
function fireIceBolt(e) {
  const IC = ENEMY_TYPES.cryo.ice;
  const lead = 0.22;
  const tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  const ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;
  const a = Math.atan2(ty - e.y, tx - e.x) + rand(-0.04, 0.04);
  const mx = e.x + Math.cos(a) * (e.r + 10);
  const my = e.y + Math.sin(a) * (e.r + 10);

  G.icebolts.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * IC.spd, vy: Math.sin(a) * IC.spd,
    r: 6, life: 2.0, mul: e.dmgMul || 1, spin: rand(0, TAU),
  });

  burst(mx, my, 8, {
    angle: a, spread: 0.5, spdMin: 60, spdMax: 220,
    color: ['#eaf7ff', '#7fd4ff'], life: 0.28, r: 3.2, glow: true,
  });
  Sfx.tone(900, 0.16, 0.04, 'triangle', 520);
}

function updateIceBolts(dt) {
  for (let i = G.icebolts.length - 1; i >= 0; i--) {
    const b = G.icebolts[i];
    b.life -= dt;
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    let hit = false;
    if (P.alive && dist2(b.x, b.y, P.x, P.y) < (P.r + b.r) * (P.r + b.r)) {
      damagePlayer(ENEMY_TYPES.cryo.ice.dmg * b.mul, b.px, b.py, 0.24);
      hit = true;
    } else if (b.x < 8 || b.x > WORLD.w - 8 || b.y < 8 || b.y > WORLD.h - 8) {
      hit = true;
    } else if (pointInObstacle(b.x, b.y)) {
      hit = true;
    }

    if (Math.random() < 0.75) {
      addParticle(b.x, b.y, {
        vx: rand(-24, 24), vy: rand(-24, 24), life: rand(0.18, 0.4),
        r: rand(1.4, 3), color: pick(['#eaf7ff', '#bfe9ff', '#7fd4ff']), drag: 0.9, glow: true,
      });
    }

    if (hit || b.life <= 0) {
      shatterFrost(b.x, b.y, b.mul);
      G.icebolts.splice(i, 1);
    }
  }
}

/* 冰弹破碎：在地上铺一片霜区 */
function shatterFrost(x, y, mul) {
  const IC = ENEMY_TYPES.cryo.ice;
  G.frosts.push({ x, y, r: IC.radius, life: IC.life, max: IC.life, mul: mul || 1 });
  burst(x, y, 20, {
    spdMin: 40, spdMax: 230, life: 0.6, r: 3.6,
    color: ['#ffffff', '#bfe9ff', '#7fd4ff'], drag: 0.9, glow: true,
  });
  Sfx.noiseBurst(0.2, 2800, 0.65, 0.12, 'highpass');
}

/* 霜区结算 + 冻伤叠层：站在霜里每 0.9 秒 +1 层，离开后每秒化 0.45 层 */
function updateFrosts(dt) {
  let inside = false;
  for (let i = G.frosts.length - 1; i >= 0; i--) {
    const f = G.frosts[i];
    f.life -= dt;
    if (f.life <= 0) { G.frosts.splice(i, 1); continue; }
    if (P.alive && dist(f.x, f.y, P.x, P.y) < f.r) inside = true;
  }

  if (inside && P.alive) {
    if (!P.inFrost) P.chillTick = Math.min(P.chillTick, 0.5);   // 刚踩进来：先给半秒反应时间
    P.chillTick -= dt;
    if (P.chillTick <= 0) {
      P.chillTick = 1.1;
      if (P.chill < 3) {
        P.chill = Math.min(3, P.chill + 1);
        popup(P.x, P.y - 52, '冻伤 ×' + Math.round(P.chill), '#7fd4ff', 12);
        Sfx.tone(320, 0.12, 0.04, 'sine', 220);
      }
    }
    P.inFrost = true;
  } else {
    P.inFrost = false;
    P.chillTick = 0;
    if (P.chill > 0) P.chill = Math.max(0, P.chill - dt * 0.45);
  }
}

/* ══════════════════════════════════════════════════════════
   9.6 冰冻军团：投掷兵霜瓶 / 喷射兵冷雾
   ──────────────────────────────────────────────────────────
   · 霜瓶：抛物线飞到预判落点（飞行 1 秒，落点先亮冰圈），砸开是一片更大的霜
     （半径 132、持续 6 秒），范围内直接吃一层冻伤。落地就炸、不拖引信，
     赶人的方式是把冰圈画在你脚下。
   · 冷雾：贴脸按住管子喷 1.7 秒，锥形里每 0.26 秒掉一点血 + 叠冻伤；
     喷的时候地上不断留小霜点，喷完那片地仍然站不住。
   ══════════════════════════════════════════════════════════ */

/* 冻伤叠层统一入口：霜区 / 霜瓶 / 冷雾都走这里，跨过整数层才弹一次提示 */
function addChill(n) {
  if (!P.alive || n <= 0) return;
  const before = P.chill;
  P.chill = Math.min(3, P.chill + n);
  if (P.chill > before && Math.floor(P.chill) > Math.floor(before)) {
    popup(P.x, P.y - 52, '冻伤 ×' + Math.round(P.chill), '#7fd4ff', 12);
    Sfx.tone(320, 0.12, 0.04, 'sine', 220);
  }
}

function throwIcePot(e) {
  const PT = ENEMY_TYPES.cryoT.pot;
  const lead = 0.6;
  let tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  let ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;

  const dd = dist(e.x, e.y, tx, ty);
  if (dd > PT.range) {
    tx = e.x + (tx - e.x) / dd * PT.range;
    ty = e.y + (ty - e.y) / dd * PT.range;
  }

  G.icepots.push({
    x: e.x, y: e.y, sx: e.x, sy: e.y, tx, ty, h: 0,
    t: 0, dur: PT.throw, radius: PT.radius, life: PT.life,
    dmg: PT.dmg * (e.dmgMul || 1), r: 6, spin: rand(-8, 8), rot: 0,
  });

  popup(e.x, e.y - e.r - 26, '霜瓶！', '#8fe0ff', 13);
  Sfx.tone(420, 0.16, 0.05, 'triangle', 300);
}

/* 霜瓶砸开：一片大霜 + 落点伤害，范围内的人直接吃一层冻伤 */
function burstIcePot(pt) {
  G.frosts.push({ x: pt.tx, y: pt.ty, r: pt.radius, life: pt.life, max: pt.life, mul: 1 });
  burst(pt.tx, pt.ty, 26, {
    spdMin: 50, spdMax: 260, life: 0.65, r: 4,
    color: ['#ffffff', '#bfe9ff', '#7fd4ff'], drag: 0.88, glow: true,
  });
  Sfx.noiseBurst(0.26, 2600, 0.7, 0.14, 'highpass');
  shake(5);

  if (!P.alive) return;
  const d = dist(pt.tx, pt.ty, P.x, P.y);
  if (d < pt.radius + P.r) {
    const fall = 1 - clamp(d / pt.radius, 0, 1);
    damagePlayer(pt.dmg * (0.45 + fall * 0.55), pt.tx, pt.ty, 0.3);
    addChill(1);
  }
}

function updateIcePots(dt) {
  for (let i = G.icepots.length - 1; i >= 0; i--) {
    const pt = G.icepots[i];
    pt.t += dt;
    pt.rot += pt.spin * dt;
    const k = Math.min(1, pt.t / pt.dur);
    pt.x = pt.sx + (pt.tx - pt.sx) * k;
    pt.y = pt.sy + (pt.ty - pt.sy) * k;
    pt.h = Math.sin(Math.PI * k) * 58;

    if (Math.random() < 0.5) {
      addParticle(pt.x, pt.y - pt.h * 0.35, {
        vx: rand(-14, 14), vy: rand(-4, 26), life: rand(0.2, 0.42), r: rand(1.4, 3),
        color: pick(['#ffffff', '#bfe9ff', '#7fd4ff']), drag: 0.9, glow: true,
      });
    }

    if (k >= 1) { burstIcePot(pt); G.icepots.splice(i, 1); }
  }
}

/* 冷雾：喷口不断吐白气，锥形里一片雾 */
function coldSpray(e) {
  const S = ENEMY_TYPES.cryoS.spray;
  const a0 = e.aim;
  const mx = e.x + Math.cos(a0) * (e.r + 8);
  const my = e.y + Math.sin(a0) * (e.r + 8);
  for (let i = 0; i < 2; i++) {
    const a = a0 + rand(-S.arc, S.arc) * 1.05;
    const spd = rand(150, 320);
    const off = rand(18, 46);
    addParticle(mx + Math.cos(a) * off, my + Math.sin(a) * off, {
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: rand(0.24, 0.42), r: rand(3.5, 6.5),
      color: pick(['#ffffff', '#d9f4ff', '#9fdcff']),
      drag: 0.88, glow: true,
    });
  }
  if (Math.random() < 0.3) {
    addParticle(mx + Math.cos(a0) * 22, my + Math.sin(a0) * 22, {
      vx: Math.cos(a0) * 260, vy: Math.sin(a0) * 260,
      life: 0.12, r: 7, color: '#eaf9ff', drag: 0.8, glow: true, shape: 'flash',
    });
  }
}

/* 冷雾结算：锥形 + 视线通畅才吃伤害与冻伤。
   伤害走轻量通道 —— 每 0.26 秒一次，走 damagePlayer 会把无敌帧与红屏抖动用烂 */
function frostSprayHit(e, S) {
  if (!P.alive) return;
  const dx = P.x - e.x, dy = P.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > S.range + P.r) return;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), e.aim)) > S.arc) return;
  if (!losClear(e.x, e.y, P.x, P.y)) return;

  let dmg = S.dmg * (e.dmgMul || 1) * (1 - armDr());
  if (P.painT > 0) dmg *= 1 - PAIN_DR;
  P.hp -= dmg;
  if (G.packOpen) closePackPanel();                // 被特殊攻击拍中：背包立刻收
  P.hurtFlash = Math.max(P.hurtFlash, 0.4);
  addChill(S.chill);
  if (Math.random() < 0.4) Sfx.tone(rand(1500, 1900), 0.05, 0.02, 'sine', 1200);
  if (P.hp <= 0) { P.hp = 0; playerLethal(); }
}

/* ══════════════════════════════════════════════════════════
   9.7 手雷兵：抛掷破片雷
   ──────────────────────────────────────────────────────────
   雷从兵身上抛向「预判落点」，飞行 0.95 秒后落地，再等 1.3 秒引爆。
   落地那一刻起地上会出现红圈 + 收缩的倒计时环，给玩家 1.3 秒挪窝。
   空中或地上的雷都能被子弹打爆：半径和伤害各打八折，但省时间。
   ══════════════════════════════════════════════════════════ */
function throwEnemyNade(e) {
  const ND = ENEMY_TYPES.nader.nad;
  const lead = 0.55;
  let tx = P.alive ? P.x + P.vx * lead : e.lastSeenX;
  let ty = P.alive ? P.y + P.vy * lead : e.lastSeenY;

  // 落点别甩太远，超出射程就压到边缘
  const dd = dist(e.x, e.y, tx, ty);
  if (dd > ND.range) {
    tx = e.x + (tx - e.x) / dd * ND.range;
    ty = e.y + (ty - e.y) / dd * ND.range;
  }

  G.nades.push({
    x: e.x, y: e.y, sx: e.x, sy: e.y, tx, ty, h: 0,
    t: 0, dur: ND.throw, fuse: ND.fuse, radius: ND.radius,
    dmg: ND.dmg * (e.dmgMul || 1), r: 7,
    spin: rand(-10, 10), rot: 0, armed: false,
  });

  popup(e.x, e.y - e.r - 26, '投雷！', '#ffb347', 13);
  Sfx.tone(300, 0.12, 0.06, 'square', 200);
}

/* 敌方火箭爆炸：只伤玩家，不吃无敌帧以外的额外豁免
   radius/dmg 可由弹体自带（护卫车炮弹比制式火箭小一圈），缺省走火箭筒兵的表 */
function rocketBlast(x, y, mul, rad, dmg, smokeMul) {
  const RK = ENEMY_TYPES.rocket.rkt;
  const R = rad || RK.radius;
  const DMG = dmg || RK.dmg;
  blastFX(x, y, R);
  Sfx.explode();
  shake(smokeMul ? 12 : 16);
  emitNoise(x, y, 1400, 1.0);

  const d = dist(x, y, P.x, P.y);
  if (P.alive && d < R + P.r * 0.7) {
    const falloff = 1 - clamp(d / R, 0, 1);
    damagePlayer(DMG * (mul || 1) * (0.42 + falloff * 0.58), x, y, 0.6);
    if (P.alive) {
      const a = Math.atan2(P.y - y, P.x - x);
      P.x += Math.cos(a) * 30 * falloff;
      P.y += Math.sin(a) * 30 * falloff;
      resolveCircleRects(P);
      clampWorld(P);
    }
  }

  // 附近敌人也会被震一下（不打友伤，只给击退和踉跄）
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const de = dist(x, y, e.x, e.y);
    if (de > R + e.r) continue;
    const f = 1 - clamp(de / R, 0, 1);
    const a = Math.atan2(e.y - y, e.x - x);
    e.x += Math.cos(a) * 18 * f;
    e.y += Math.sin(a) * 18 * f;
    e.stagger = Math.max(e.stagger, 0.28);
  }
}

/* ── 喷火兵：锥形火舌，画面粒子 + 每 0.28 秒结算一次灼烧 ── */
function flameSpray(e) {
  const F = ENEMY_TYPES.flamer.flame;
  const a0 = e.aim;
  const mx = e.x + Math.cos(a0) * (e.r + 8);
  const my = e.y + Math.sin(a0) * (e.r + 8);
  const n = 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + rand(-F.arc, F.arc) * 1.05;
    const spd = rand(210, 380);
    const off = rand(24, 58);          // 从喷口外一点开始，避免堆在枪口
    addParticle(mx + Math.cos(a) * off, my + Math.sin(a) * off, {
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: rand(0.15, 0.26), r: rand(3, 5.5),
      color: pick(['#ff9a3a', '#ff6a22', '#e8491a']),
      drag: 0.9, glow: true, grav: -30,
    });
  }
  if (Math.random() < 0.25) {
    addParticle(mx + Math.cos(a0) * 26, my + Math.sin(a0) * 26, {
      vx: Math.cos(a0) * 300, vy: Math.sin(a0) * 300,
      life: 0.09, r: 6, color: '#ffe9b0', drag: 0.8, glow: true, shape: 'flash',
    });
  }
}

/* 冷雾本体：和火舌同构的扇形，换成白蓝 —— 撞墙同样会被截断 */
function drawSprayCone(e) {
  if (e.sprayT <= 0) return;
  if (!fogVisibleAt(e.x, e.y)) return;
  const S = ENEMY_TYPES.cryoS.spray;
  const a0 = e.aim;

  let len = S.range;
  for (let d = e.r + 10; d < S.range; d += 12) {
    if (pointInObstacle(e.x + Math.cos(a0) * d, e.y + Math.sin(a0) * d)) { len = d; break; }
  }

  const t = G.time;
  const pulse = 0.9 + Math.sin(t * 18) * 0.06 + Math.sin(t * 31 + 1.3) * 0.04;
  const half = S.arc * 1.05;
  const mx = e.x + Math.cos(a0) * (e.r + 7);
  const my = e.y + Math.sin(a0) * (e.r + 7);
  const L = Math.max(24, len * pulse);

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(a0);

  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, L);
  g.addColorStop(0, 'rgba(246,254,255,0.42)');
  g.addColorStop(0.28, 'rgba(200,240,255,0.26)');
  g.addColorStop(0.64, 'rgba(130,205,255,0.14)');
  g.addColorStop(1, 'rgba(90,170,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, L, -half, half);
  ctx.closePath();
  ctx.fill();

  const g2 = ctx.createRadialGradient(0, 0, 2, 0, 0, L * 0.5);
  g2.addColorStop(0, 'rgba(255,255,255,0.42)');
  g2.addColorStop(1, 'rgba(150,215,255,0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, L * 0.5, -half * 0.55, half * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* 火舌本体：一个朝瞄准方向的扇形，撞墙就断开 */
function drawFlameCone(e) {
  if (e.flameT <= 0) return;
  if (!fogVisibleAt(e.x, e.y)) return;
  const F = ENEMY_TYPES.flamer.flame;
  const a0 = e.aim;

  // 沿中轴探一下：前面有墙就把火舌截断
  let len = F.range;
  for (let d = e.r + 10; d < F.range; d += 12) {
    if (pointInObstacle(e.x + Math.cos(a0) * d, e.y + Math.sin(a0) * d)) { len = d; break; }
  }

  const t = G.time;
  const flick = 0.88 + Math.sin(t * 26) * 0.07 + Math.sin(t * 43 + 1.7) * 0.05;
  const half = F.arc * 1.02;
  const mx = e.x + Math.cos(a0) * (e.r + 7);
  const my = e.y + Math.sin(a0) * (e.r + 7);
  const L = Math.max(24, len * flick);

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(a0);
  ctx.globalCompositeOperation = 'lighter';

  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, L);
  g.addColorStop(0, 'rgba(255,246,210,0.34)');
  g.addColorStop(0.26, 'rgba(255,190,80,0.26)');
  g.addColorStop(0.62, 'rgba(255,110,35,0.13)');
  g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, L, -half, half);
  ctx.closePath();
  ctx.fill();

  const g2 = ctx.createRadialGradient(0, 0, 2, 0, 0, L * 0.52);
  g2.addColorStop(0, 'rgba(255,244,214,0.34)');
  g2.addColorStop(1, 'rgba(255,160,50,0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, L * 0.52, -half * 0.5, half * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function flameBurn(e, F) {
  if (!P.alive) return;
  const dx = P.x - e.x, dy = P.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > F.range + P.r) return;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), e.aim)) > F.arc) return;
  if (!losClear(e.x, e.y, P.x, P.y)) return;     // 躲在墙后火舌烧不到
  burnPlayer(F.dmg * (e.dmgMul || 1), e.x, e.y);
  P.burnT = Math.max(P.burnT, 1.1);
}

/* ── 盾牌：只在正面生效，打空了就碎 ── */
function shieldBlocks(e, b) {
  if (!(e.shield > 0)) return false;
  const a = Math.atan2(b.y - e.y, b.x - e.x);
  return Math.abs(angleDiff(a, e.shieldAim)) <= ENEMY_TYPES.shooter.shieldArc;
}

function hitShield(e, dmg, bx, by, bvx, bvy) {
  e.shield = Math.max(0, e.shield - dmg);
  e.shieldFlash = 1;
  const a = Math.atan2(bvy, bvx) + Math.PI;
  burst(bx, by, 7, {
    angle: a, spread: 1.0, spdMin: 70, spdMax: 300,
    color: ['#fff3c4', '#ffd66b', '#ffffff'], life: 0.28, r: 2.6, glow: true, drag: 0.9,
  });
  Sfx.hit();
  if (e.shield <= 0) breakShield(e);
}

function breakShield(e) {
  const px = e.x + Math.cos(e.shieldAim) * (e.r + 6);
  const py = e.y + Math.sin(e.shieldAim) * (e.r + 6);
  popup(e.x, e.y - e.r - 26, '盾 牌 击 碎', '#ffd66b', 13);
  burst(px, py, 22, {
    color: ['#ffd66b', '#ffa23a', '#ffffff'], life: 0.6, r: 4.2,
    spdMin: 70, spdMax: 340, glow: true, drag: 0.9,
  });
  addDecal(px, py, 16, '#3a2408', 0.4);
  Sfx.noiseBurst(0.3, 1700, 1.1, 0.22);
  Sfx.tone(170, 0.22, 0.1, 'sawtooth', 60);
  e.stagger = 0.4;
}

function updateEnemies(dt) {
  G.combatCount = 0;
  G.alertCount = 0;
  G.suspect = 0;
  G.directorMarkT = Math.max(0, (G.directorMarkT || 0) - dt);   // 安全总监的位置标记倒计时

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    /* 纯计时类状态统一衰减（burn / 硬控 / 致盲 / 重伤 / 包扎冷却 …） */
    tickEnemyFx(e, dt);
    /* 蛊：流荧集群压在身上的上限 / 拔除读条 / 拔完的回血 */
    updateSwarmDebuff(e, dt);
    /* 流血：每层每秒掉血，掉光就倒 —— 这是「重伤延滞」撕开的口子 */
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      const dps = SKILL.ebleed.dps * (e.bleedN || 0);
      if (dps > 0) {
        e.hp -= dps * dt;
        if (Math.random() < dt * 6) {
          addParticle(e.x + rand(-e.r * 0.6, e.r * 0.6), e.y + rand(-e.r * 0.4, e.r * 0.4), {
            vx: rand(-12, 12), vy: rand(6, 30), life: rand(0.25, 0.5), r: rand(1.4, 2.8),
            color: '#e01f3a', drag: 0.9,
          });
        }
        if (e.hp <= 0) { e.envKill = false; killEnemy(e); continue; }
      }
      if (e.bleedT <= 0) e.bleedN = 0;
    }
    e.invuln = Math.max(0, e.invuln - dt);
    e.walkPhase += dt * 8;

    const dx = P.x - e.x, dy = P.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const angToPlayer = Math.atan2(dy, dx);
    const sees = canSeePlayer(e);

    /* ── 战地包扎：血掉到一半以下、又看不见玩家，就蹲下来自己缠绷带。
       被无名打伤（重伤）的人：包扎时间翻倍、回血只回一半 —— 这就是「打药变长」 ── */
    if (e.bandaging) {
      if (sees || e.stun > 0 || (e.kd || 0) > 0 || e.hp <= 0) {
        e.bandaging = false; e.bandageT = 0;
      } else {
        e.bandageT -= dt;
        if (e.bandageT <= 0) {
          /* 回血量按「开始包扎时」的状态算：重伤就是重伤，别等 8 秒后自己好了又变回全效 */
          const heal = e.maxHp * SKILL.trauma.bandageHeal * (e.bandageSlow || 1);
          e.hp = Math.min(e.maxHp, e.hp + heal);
          popup(e.x, e.y - e.r - 22, '包扎 +' + Math.round(heal), '#8ad3a8', 11);
          burst(e.x, e.y, 8, { color: ['#dff8ea', '#8ad3a8'], life: 0.4, r: 3, spdMin: 30, spdMax: 120, drag: 0.9 });
          e.bandaging = false;
          e.bandageSlow = 1;
          e.careCd = SKILL.trauma.bandageCd;
        }
      }
    } else if (e.careSeek > 0) {
      /* 拖着伤往掩体挪：走到位（或 1.5 秒没走到）就地包扎；被看见 / 被控 / 被致盲就放弃这轮 */
      if (sees || e.stun > 0 || (e.kd || 0) > 0 || e.blind > 0 || e.hp <= 0) {
        e.careSeek = 0;
      } else {
        e.careSeek -= dt;
        const cdst = Math.hypot(e.careSpotX - e.x, e.careSpotY - e.y);
        if (cdst < 24 || e.careSeek <= 0) {
          e.careSeek = 0;
          e.bandaging = true;
          e.bandageSlow = e.trauma > 0 ? SKILL.trauma.healMul : 1;
          e.bandageT = SKILL.trauma.bandageTime * (e.trauma > 0 ? SKILL.trauma.careMul : 1);
          popup(e.x, e.y - e.r - 24, e.trauma > 0 ? '重伤 · 包扎拖慢' : '战地包扎', e.trauma > 0 ? '#ff8fa3' : '#8ad3a8', 11);
        }
      }
    } else if (e.state !== 'combat' && !sees && e.hp < e.maxHp * 0.55 &&
               e.careCd <= 0 && e.stun <= 0 && (e.kd || 0) <= 0 && e.blind <= 0) {
      /* 先看看 8 米内有没有能挡住玩家视线的掩体点：有就拖着伤挪过去再包扎，没有就地包扎 */
      const spot = findCareCover(e);
      if (spot) {
        e.careSpotX = spot.x; e.careSpotY = spot.y;
        e.careSeek = 1.5;
        popup(e.x, e.y - e.r - 24, e.trauma > 0 ? '重伤 · 拖向掩体' : '找掩体包扎', '#8ad3a8', 10);
      } else {
        e.bandaging = true;
        e.bandageSlow = e.trauma > 0 ? SKILL.trauma.healMul : 1;
        e.bandageT = SKILL.trauma.bandageTime * (e.trauma > 0 ? SKILL.trauma.careMul : 1);
        popup(e.x, e.y - e.r - 24, e.trauma > 0 ? '重伤 · 包扎拖慢' : '战地包扎', e.trauma > 0 ? '#ff8fa3' : '#8ad3a8', 11);
      }
    }

    /* ── 安全总监的持续标记：总监盯着你的时候，全体哈夫克都知道你站在哪 ── */
    if (G.directorMarkT > 0 && P.alive && !silentOn() && e.faction === 'havk' && e.state !== 'combat' && e.type !== 'seeker') {
      e.lastSeenX = P.x; e.lastSeenY = P.y;
      if (e.state === 'patrol') { e.state = 'alert'; e.alertMeter = 1; }
      e.investigateT = Math.max(e.investigateT || 0, 3);
    }

    /* ── 无人作战小车：总监阵亡 → 殉爆程序启动（不管小车处在什么状态） ── */
    if (e.type === 'escort') {
      if (e.sdT <= 0 && !G.enemies.some(o => o.type === 'director' && o.alive)) {
        e.sdT = 1.2; e.sdBeep = 0;
        popup(e.x, e.y - e.r - 26, '护卫车 · 自爆程序启动', '#ff5533', 13);
        Sfx.tone(980, 0.25, 0.1, 'square', 420);
      }
      if (e.sdT > 0) {
        e.sdT -= dt;
        e.sdBeep -= dt;
        if (e.sdBeep <= 0) { e.sdBeep = 0.18; Sfx.tone(1200, 0.06, 0.045, 'square', 500); }
        if (e.sdT <= 0) { escortBoom(e); continue; }
      }
    }

    /* 近战参数：出手距离 = 玩家半径 + 敌人半径 + 兵种的出手长度 */
    const M = meleeOf(e);
    const mReach = P.r + e.r + M.reach;

    /* ── 连锁喊话：被通知的敌人过一会儿也开打，并继续向外扩散 ── */
    if (e.chain > 0) {
      e.chain -= dt;
      if (e.chain <= 0) {
        const hop = e.chainHop || 0;
        e.chain = 0;
        enterCombat(e, e.lastSeenX, e.lastSeenY, false);
        alertOthers(e, e.lastSeenX, e.lastSeenY, hop);
      }
    }

    /* ── 视野发现累积 ── */
    if (e.state !== 'combat') {
      if (sees) {
        const rate = 0.6 + (1 - Math.min(1, d / e.sight)) * 2.0;
        e.alertMeter = Math.min(1, e.alertMeter + dt * rate);
        if (e.alertMeter >= 1) enterCombat(e, P.x, P.y, true);
      } else {
        e.alertMeter = Math.max(0, e.alertMeter - dt * 0.55);
      }
    }

    /* ── 战斗中丢失目标 → 转为搜索 ── */
    if (e.state === 'combat') {
      if (sees) {
        e.lastSeenX = P.x; e.lastSeenY = P.y;
        e.loseT = 0;
      } else {
        e.loseT += dt;
        if (e.loseT > 4.5) {
          e.state = 'alert';
          e.investigateT = 12;
          e.loseT = 0;
        }
      }
    }

    if (e.state === 'combat') G.combatCount++;
    else if (e.state === 'alert') G.alertCount++;
    else if (e.alertMeter > G.suspect) G.suspect = e.alertMeter;

    /* 被三头犬震晕：计时照走（上面统一扣过了），但这一帧不移动、不瞄准、不开枪 */
    if (e.stun > 0) continue;
    /* 被流荧集群缠住：停火、不瞄准、不追人 —— 站在原地专心拔无人机，拔完才恢复行动 */
    if ((e.swarmT || 0) > 0) continue;

    /* ── 按状态决定移动目标与速度 ── */
    let mvx = 0, mvy = 0, spdMul = 1, faceAim = null;
    let rolling = false;

    if (e.bandaging) {
      /* 蹲着包扎：原地不动、也不还击（掉血或被他看见就打断） */
      mvx = 0; mvy = 0;
    } else if (e.careSeek > 0) {
      /* 拖着伤往掩体挪：目标就是掩体点，不还击 */
      const cdx = e.careSpotX - e.x, cdy = e.careSpotY - e.y;
      const cl = Math.hypot(cdx, cdy) || 1;
      mvx = cdx / cl; mvy = cdy / cl;
      spdMul = 0.85;
    } else if (e.state === 'patrol') {
      // 在驻点附近游荡，走到就驻足张望（BOSS 只在很小的圈子里踱步）
      e.patrolT -= dt;
      const dp = Math.hypot(e.patrolX - e.x, e.patrolY - e.y);
      if (e.patrolT <= 0 || dp < 18) {
        e.patrolT = rand(2.2, e.type === 'boss' ? 5.5 : 5.0);
        for (let t = 0; t < 12; t++) {
          const ang = rand(0, TAU);
          const rr = rand(50, e.type === 'boss' ? 105 : 200);
          const px = clamp(e.homeX + Math.cos(ang) * rr, e.r + 30, WORLD.w - e.r - 30);
          const py = clamp(e.homeY + Math.sin(ang) * rr, e.r + 30, WORLD.h - e.r - 30);
          if (!hitsObstacle(px, py, e.r + 8)) { e.patrolX = px; e.patrolY = py; break; }
        }
      }
      const tdx = e.patrolX - e.x, tdy = e.patrolY - e.y;
      const td = Math.hypot(tdx, tdy);
      if (td > 18) {
        mvx = tdx / td; mvy = tdy / td;
        spdMul = e.type === 'boss' ? 0.3 : 0.42;
        faceAim = Math.atan2(mvy, mvx);
      } else {
        e.facing += Math.sin(G.time * 0.9 + e.walkPhase) * dt * 1.1;  // 原地扫视
      }
    } else if (e.state === 'alert') {
      // BOSS 不追查线索，直接回自己的点位；其他敌人去最后已知位置搜
      const isBoss = e.type === 'boss';
      const tdx = (isBoss ? e.homeX : e.lastSeenX) - e.x;
      const tdy = (isBoss ? e.homeY : e.lastSeenY) - e.y;
      const td = Math.hypot(tdx, tdy) || 1;
      if (td > (isBoss ? 34 : 56)) {
        mvx = tdx / td; mvy = tdy / td;
        spdMul = isBoss ? 0.72 : 0.88;
        faceAim = Math.atan2(mvy, mvx);
      } else {
        e.investigateT -= dt;
        e.facing += Math.sin(G.time * 3 + e.walkPhase) * dt * 2.2;   // 原地找人
      }
      if (isBoss && td <= 34) {
        e.state = 'patrol';
        e.alertMeter = 0;
        e.patrolT = 0;
      } else if (e.investigateT <= 0) {
        e.state = 'patrol';
        e.alertMeter = 0;
        e.patrolT = 0;
      }
    } else {
      // 战斗：看得见就打玩家，看不见就扑向最后位置
      const tx2 = sees ? P.x : e.lastSeenX;
      const ty2 = sees ? P.y : e.lastSeenY;
      const tdx = tx2 - e.x, tdy = ty2 - e.y;
      const td = Math.hypot(tdx, tdy) || 1;

      if (e.type === 'shooter') {
        /* 阿萨拉盾兵：举盾守住中距离，趁玩家换弹的间隙探头两连点射 */
        const ST = ENEMY_TYPES.shooter;
        const B = ST.burst;
        const keep = ST.keep;
        if (!sees) { mvx = tdx / td; mvy = tdy / td; }
        else if (d > keep + 70) { mvx = nx; mvy = ny; }
        else if (d < keep - 80) { mvx = -nx; mvy = -ny; }
        else {
          mvx = -ny * e.strafe * 0.7;
          mvy = nx * e.strafe * 0.7;
          if (Math.random() < 0.006) e.strafe *= -1;
        }
        if (sees && e.ptN <= 0) {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && d < B.range) {
            e.fireCd = rand(B.cd[0], B.cd[1]);
            startPointBurst(e, B);
          }
        }
      } else if (e.type === 'brute') {
        /* 阿萨拉机枪兵：加特林要先转起来，走到射程内就架枪扫一梭子，打空了才挪窝 */
        const GT = ENEMY_TYPES.brute;
        const GAT = GT.gat;
        if (!sees) { mvx = tdx / td; mvy = tdy / td; }
        else if (d > GT.keep + 110) { mvx = nx * 0.8; mvy = ny * 0.8; }
        else if (d < GT.keep - 90) { mvx = -nx * 0.5; mvy = -ny * 0.5; }
        else {
          mvx = -ny * e.strafe * 0.5;
          mvy = nx * e.strafe * 0.5;
          if (Math.random() < 0.007) e.strafe *= -1;
        }

        e.gatCd -= dt;
        e.gatHeat = Math.max(0, e.gatHeat - dt * 0.9);
        e.gatBloom = Math.max(0, e.gatBloom - dt * 0.3);

        if (e.gatBurst > 0) {
          e.gatFire -= dt;
          let guard = 0;
          while (e.gatFire <= 0 && e.gatBurst > 0 && guard++ < 6) {
            e.gatFire += GAT.rate;
            enemyGatFire(e, sees);
            e.gatBurst--;
            e.gatBloom = Math.min(GAT.bloom, e.gatBloom + GAT.bloom * 0.055);
          }
          e.gatHeat = Math.min(1, e.gatHeat + dt * 5);
          if (e.gatBurst <= 0) { e.gatCd = rand(GAT.cd[0], GAT.cd[1]); e.gatBloom = 0; }
        } else if (e.gatSpin > 0) {
          e.gatSpin -= dt;
          if (Math.random() < 0.5) {
            const ma = e.aim;
            addParticle(e.x + Math.cos(ma) * e.r * 1.3, e.y + Math.sin(ma) * e.r * 1.3, {
              vx: rand(-12, 12), vy: rand(-12, 12), life: 0.2, r: rand(1.8, 3.2),
              color: pick(['#d8b6ff', '#ffe0b0']), drag: 0.9, glow: true,
            });
          }
          if (e.gatSpin <= 0) { e.gatBurst = GAT.rounds; e.gatFire = 0; e.gatBloom = 0.006; }
        } else if (sees && e.gatCd <= 0 && d < GAT.range) {
          e.gatSpin = GAT.spin;
          Sfx.tone(84, 0.34, 0.05, 'sawtooth', 190);
        }
      } else if (e.type === 'sniper') {
        /* 阿萨拉狙击兵：待在最远处，激光锁定 0.9 秒后一枪见血；被贴近就边撤边架枪 */
        const SN = ENEMY_TYPES.sniper.snipe;
        const keep = ENEMY_TYPES.sniper.keep;

        if (!sees) {
          e.snipeCharge = 0;                 // 目标脱离视线 → 收镜
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < keep - 130) {
          mvx = -nx; mvy = -ny;
        } else if (d > keep + 150) {
          mvx = nx * 0.72; mvy = ny * 0.72;
        } else {
          mvx = -ny * e.strafe * 0.38;
          mvy = nx * e.strafe * 0.38;
          if (Math.random() < 0.005) e.strafe *= -1;
        }

        if (sees) {
          if (e.snipeCharge > 0) {
            e.snipeCharge -= dt;
            if (e.snipeCharge <= 0) {
              sniperFire(e);
              e.fireCd = rand(SN.cd[0], SN.cd[1]);
            }
          } else {
            e.fireCd -= dt;
            if (e.fireCd <= 0 && d < SN.range) {
              e.snipeCharge = SN.charge;
              Sfx.tone(1180, 0.14, 0.04, 'triangle', 720);
            }
          }
        }
      } else if (e.type === 'rocket') {
        /* 阿萨拉火箭筒兵：先拉开距离装填，装填完打一发直飞的火箭 */
        const RT = ENEMY_TYPES.rocket;
        const RK = RT.rkt;

        if (!sees) {
          e.loadT = 0;
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < RT.keep - 110) {
          mvx = -nx; mvy = -ny;
        } else if (d > RT.keep + 180) {
          mvx = nx * 0.85; mvy = ny * 0.85;
        } else {
          mvx = -ny * e.strafe * 0.42;
          mvy = nx * e.strafe * 0.42;
          if (Math.random() < 0.006) e.strafe *= -1;
        }

        e.rocketCd -= dt;
        if (e.loadT > 0) {
          e.loadT -= dt;
          if (e.loadT <= 0) {
            if (sees) {
              fireRocket(e);
              e.rocketCd = rand(RK.cd[0], RK.cd[1]);
            }
          }
        } else if (sees && e.rocketCd <= 0 && d < RK.range) {
          e.loadT = RK.load;
          popup(e.x, e.y - e.r - 26, '装填火箭', '#8ad34a', 12);
          Sfx.tone(170, 0.14, 0.06, 'square', 250);
        }
      } else if (e.type === 'flamer') {
        /* 阿萨拉喷火兵：主动贴到十来米，然后按住扳机喷一片锥形火 */
        const F = ENEMY_TYPES.flamer.flame;

        if (!sees) {
          e.flameT = 0;
          mvx = tdx / td; mvy = tdy / td;
        } else if (d > F.range * 0.82) {
          mvx = nx; mvy = ny;
        } else if (d < 84) {
          mvx = -nx * 0.7; mvy = -ny * 0.7;
        } else {
          mvx = -ny * e.strafe * 0.55;
          mvy = nx * e.strafe * 0.55;
          if (Math.random() < 0.007) e.strafe *= -1;
        }

        if (e.flameT > 0) {
          e.flameT -= dt;
          e.flameTick -= dt;
          e.fireDrop -= dt;
          flameSpray(e);
          if (e.flameTick <= 0) {
            e.flameTick = F.tick;
            flameBurn(e, F);
          }
          if (e.fireDrop <= 0) {
            e.fireDrop = 0.46;
            const fa = e.aim + rand(-F.arc * 0.7, F.arc * 0.7);
            const fr = rand(90, F.range * 0.92);
            const fx = e.x + Math.cos(fa) * fr;
            const fy = e.y + Math.sin(fa) * fr;
            // 同一块地方不重复叠火，否则站着不动几秒就会被烤熟
            const stacked = G.fires.some(q => dist2(q.x, q.y, fx, fy) < 55 * 55);
            if (!pointInObstacle(fx, fy) && !stacked) {
              G.fires.push({
                x: fx, y: fy, r: F.fireR, life: F.fireLife, max: F.fireLife,
                tick: 0.12, dmg: F.fireDmg * (e.dmgMul || 1), breed: 0.5, warm: 0.9,
              });
            }
          }
          if (e.flameT <= 0) e.flameCd = rand(F.cd[0], F.cd[1]);
        } else if (sees) {
          e.flameCd -= dt;
          if (e.flameCd <= 0 && d < F.range * 1.05) {
            e.flameT = F.dur;
            e.flameTick = 0;
            e.fireDrop = 0.22;
            popup(e.x, e.y - e.r - 26, '喷火！', '#ffb347', 13);
            Sfx.noiseBurst(0.55, 1400, 0.8, 0.16, 'bandpass');
            Sfx.tone(120, 0.3, 0.07, 'sawtooth', 220);
          }
        }
      } else if (e.type === 'cryo') {
        /* 阿萨拉冰冻军团·投射兵：远远地架着冷冻投射器，蓄冰 0.8 秒后打一发冰弹。
           冰弹本身不疼，疼的是它在地上留下的那片霜 —— 逼你换位置 */
        const CT = ENEMY_TYPES.cryo;
        const IC = CT.ice;

        if (!sees) {
          e.iceLoad = 0;
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < CT.keep - 120) {
          mvx = -nx; mvy = -ny;
        } else if (d > CT.keep + 180) {
          mvx = nx * 0.8; mvy = ny * 0.8;
        } else {
          mvx = -ny * e.strafe * 0.4;
          mvy = nx * e.strafe * 0.4;
          if (Math.random() < 0.006) e.strafe *= -1;
        }

        e.iceCd -= dt;
        if (e.iceLoad > 0) {
          e.iceLoad -= dt;
          if (e.iceLoad <= 0) {
            if (sees) { fireIceBolt(e); e.iceCd = rand(IC.cd[0], IC.cd[1]); }
          }
        } else if (sees && e.iceCd <= 0 && d < IC.range) {
          e.iceLoad = IC.load;
          popup(e.x, e.y - e.r - 26, '蓄冰', '#7fd4ff', 12);
          Sfx.tone(680, 0.18, 0.04, 'triangle', 460);
        }
      } else if (e.type === 'cryoT') {
        /* 阿萨拉冰冻军团·投掷兵：站在中距离把霜瓶抛到你脚下。
           落点有冰圈预警，但落地就炸 —— 逼你从掩体后面挪出来挨枪 */
        const TT = ENEMY_TYPES.cryoT;
        const PT = TT.pot;

        if (!sees) {
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < PT.near) {
          mvx = -nx; mvy = -ny;
        } else if (d > TT.keep + 140) {
          mvx = nx * 0.85; mvy = ny * 0.85;
        } else {
          mvx = -ny * e.strafe * 0.45;
          mvy = nx * e.strafe * 0.45;
          if (Math.random() < 0.006) e.strafe *= -1;
        }

        e.potCd -= dt;
        if (sees && e.potCd <= 0 && d < PT.range) {
          throwIcePot(e);
          e.potCd = rand(PT.cd[0], PT.cd[1]);
        }
      } else if (e.type === 'cryoS') {
        /* 阿萨拉冰冻军团·喷射兵：一路贴到十米内按住冷雾管。
           伤害低得可以忽略，但那片雾沾上就叠冻伤，站两秒就走不动了 */
        const ST = ENEMY_TYPES.cryoS;
        const SP = ST.spray;

        if (!sees) {
          e.sprayT = 0;
          mvx = tdx / td; mvy = tdy / td;
        } else if (d > SP.range * 0.78) {
          mvx = nx; mvy = ny;
        } else if (d < 78) {
          mvx = -nx * 0.7; mvy = -ny * 0.7;
        } else {
          mvx = -ny * e.strafe * 0.5;
          mvy = nx * e.strafe * 0.5;
          if (Math.random() < 0.007) e.strafe *= -1;
        }

        if (e.sprayT > 0) {
          e.sprayT -= dt;
          e.sprayTick -= dt;
          e.patchDrop -= dt;
          coldSpray(e);
          if (e.sprayTick <= 0) { e.sprayTick = SP.tick; frostSprayHit(e, SP); }
          if (e.patchDrop <= 0) {
            e.patchDrop = 0.42;
            const sa = e.aim + rand(-SP.arc * 0.7, SP.arc * 0.7);
            const sr = rand(70, SP.range * 0.92);
            const fx = e.x + Math.cos(sa) * sr;
            const fy = e.y + Math.sin(sa) * sr;
            const stacked = G.frosts.some(q => dist2(q.x, q.y, fx, fy) < 40 * 40);
            if (!pointInObstacle(fx, fy) && !stacked) {
              G.frosts.push({ x: fx, y: fy, r: SP.patchR, life: SP.patchLife, max: SP.patchLife, mul: 1 });
            }
          }
          if (e.sprayT <= 0) e.sprayCd = rand(SP.cd[0], SP.cd[1]);
        } else if (sees) {
          e.sprayCd -= dt;
          if (e.sprayCd <= 0 && d < SP.range * 1.02) {
            e.sprayT = SP.dur;
            e.sprayTick = 0;
            e.patchDrop = 0.24;
            popup(e.x, e.y - e.r - 26, '冷雾！', '#c9f2ff', 13);
            Sfx.noiseBurst(0.5, 2200, 0.7, 0.14, 'highpass');
            Sfx.tone(240, 0.3, 0.05, 'sine', 180);
          }
        }
      } else if (e.type === 'nader') {
        /* 阿萨拉手雷兵：不正面接火，保持中距离往玩家预判点抛雷；被贴脸就往后跑 */
        const NT = ENEMY_TYPES.nader;
        const ND = NT.nad;

        if (!sees) {
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < ND.near) {
          mvx = -nx; mvy = -ny;
        } else if (d > NT.keep + 160) {
          mvx = nx * 0.85; mvy = ny * 0.85;
        } else {
          mvx = -ny * e.strafe * 0.5;
          mvy = nx * e.strafe * 0.5;
          if (Math.random() < 0.006) e.strafe *= -1;
        }

        e.throwCd -= dt;
        if (sees && e.throwCd <= 0 && d < ND.range) {
          throwEnemyNade(e);
          e.throwCd = rand(ND.cd[0], ND.cd[1]);
        }
      } else if (e.type === 'seeker') {
        /* 寻敌爆破小车：锁死干员位置一路猛冲，贴脸滴滴 0.45 秒后自爆。
           打爆它也会炸 —— 提前在远处点掉等于拆弹。 */
        const SK = ENEMY_TYPES.seeker.boom;
        e.lastSeenX = P.x; e.lastSeenY = P.y;      // 寻敌小车永远知道玩家在哪
        e.state = 'combat';
        if (e.fuseT > 0) {
          e.fuseT -= dt;
          mvx = nx; mvy = ny;                      // 咬住了就直冲
          if (e.fuseT <= 0) seekerBoom(e);
        } else if (d < e.r + P.r + 26) {
          e.fuseT = SK.fuse;
          popup(e.x, e.y - e.r - 22, '滴滴滴滴——', '#ff5533', 12);
          Sfx.tone(1250, 0.05, 0.05, 'square', 560);
        } else {
          mvx = tdx / td; mvy = tdy / td;
        }
      } else if (e.type === 'escort') {
        /* 无人作战小车：贴着总监走位，机枪扫射 + 直飞炮弹。
           总监阵亡 → 自爆程序启动（1.2 秒，滴滴声预警，玩家可以跑开）；
           小车被击毁 → 对总监没有任何影响。 */
        const ES = ENEMY_TYPES.escort;
        const GAT = ES.gat, CN = ES.cannon;
        const dirBoss = G.enemies.find(o => o.type === 'director' && o.alive);

        if (e.sdT > 0) {
          /* 殉爆倒计时由上方的公共段推进，这里只钉住不动 */
          mvx = 0; mvy = 0;
        } else {
          if (dirBoss) {
            const bd = dist(e.x, e.y, dirBoss.x, dirBoss.y) || 1;
            const bnx = (dirBoss.x - e.x) / bd, bny = (dirBoss.y - e.y) / bd;
            if (bd > 150) { mvx = bnx; mvy = bny; }
            else if (bd < 90) { mvx = -bnx; mvy = -bny; }
            else {
              mvx = -bny * e.strafe * 0.5; mvy = bnx * e.strafe * 0.5;
              if (Math.random() < 0.008) e.strafe *= -1;
            }
          } else {
            mvx = tdx / td; mvy = tdy / td;
          }

          // 机枪：转管预热 → 扫射（与机枪兵同一套状态机）
          e.gatCd -= dt;
          e.gatHeat = Math.max(0, e.gatHeat - dt * 0.9);
          e.gatBloom = Math.max(0, e.gatBloom - dt * 0.3);
          if (e.gatBurst > 0) {
            e.gatFire -= dt;
            let guard = 0;
            while (e.gatFire <= 0 && e.gatBurst > 0 && guard++ < 6) {
              e.gatFire += GAT.rate;
              enemyGatFire(e, sees, GAT);
              e.gatBurst--;
              e.gatBloom = Math.min(GAT.bloom, e.gatBloom + GAT.bloom * 0.055);
            }
            e.gatHeat = Math.min(1, e.gatHeat + dt * 5);
            if (e.gatBurst <= 0) { e.gatCd = rand(GAT.cd[0], GAT.cd[1]); e.gatBloom = 0; }
          } else if (e.gatSpin > 0) {
            e.gatSpin -= dt;
            if (Math.random() < 0.5) {
              const ma = e.aim;
              addParticle(e.x + Math.cos(ma) * e.r * 1.3, e.y + Math.sin(ma) * e.r * 1.3, {
                vx: rand(-12, 12), vy: rand(-12, 12), life: 0.2, r: rand(1.8, 3.2),
                color: pick(['#d8e4ee', '#ffe0b0']), drag: 0.9, glow: true,
              });
            }
            if (e.gatSpin <= 0) { e.gatBurst = GAT.rounds; e.gatFire = 0; e.gatBloom = 0.006; }
          } else if (sees && e.gatCd <= 0 && d < GAT.range) {
            e.gatSpin = GAT.spin;
            Sfx.tone(84, 0.34, 0.05, 'sawtooth', 190);
          }

          // 炮弹：装填 1.05 秒后打一发直飞炮弹（有预警，侧身能躲）
          e.cannonCd -= dt;
          if (e.cannonLoad > 0) {
            e.cannonLoad -= dt;
            if (e.cannonLoad <= 0 && sees) {
              escortCannon(e);
              e.cannonCd = rand(CN.cd[0], CN.cd[1]);
            }
          } else if (sees && e.cannonCd <= 0 && d < CN.range) {
            e.cannonLoad = CN.load;
            popup(e.x, e.y - e.r - 26, '炮弹装填', '#ffd66b', 11);
            Sfx.tone(210, 0.16, 0.05, 'square', 240);
          }
        }
      } else if (e.type === 'director') {
        /* BOSS「安全总监」：中距离架 M700，激光锁定后三连发狙；
           间隙放出寻敌爆破小车；发现干员当场呼叫增援并持续标记位置。 */
        const DT = ENEMY_TYPES.director;
        const SN = DT.snipe;

        if (!sees) {
          e.snipeCharge = 0;                       // 目标脱离视线 → 收镜
          mvx = tdx / td; mvy = tdy / td;
        } else if (d < DT.keep - 150) {
          mvx = -nx; mvy = -ny;
        } else if (d > DT.keep + 210) {
          mvx = nx * 0.7; mvy = ny * 0.7;
        } else {
          mvx = -ny * e.strafe * 0.4;
          mvy = nx * e.strafe * 0.4;
          if (Math.random() < 0.006) e.strafe *= -1;
        }

        if (sees) {
          /* 技能四：发现干员 → 呼叫哈夫克增援 + 持续标记干员位置 10 秒。
             无名静默期间：这段标记对他无效（免疫侦察扫描） */
          if (!e.spotted) {
            e.spotted = true;
            if (!silentOn()) G.directorMarkT = DT.mark || 10;
            popup(e.x, e.y - e.r - 44, '发现干员！呼叫增援', '#ffb02e', 15);
            Sfx.tone(880, 0.28, 0.12, 'square', 340);
            Sfx.tone(660, 0.42, 0.1, 'square', 300);
            spawnReinforce();
          }
          if (!silentOn()) G.directorMarkT = DT.mark || 10;   // 盯着就一直刷新（削到 10 秒）
        }

        /* 技能一：M700 连发狙 —— 锁定 1.05 秒 → 三发急速射 */
        if (e.dirN > 0) {
          e.dirT -= dt;
          let guard = 0;
          while (e.dirN > 0 && e.dirT <= 0 && guard++ < 4) {
            e.dirT += SN.gap;
            e.dirN--;
            directorSniperFire(e);
          }
        } else if (sees) {
          if (e.snipeCharge > 0) {
            e.snipeCharge -= dt;
            if (e.snipeCharge <= 0) { e.dirN = SN.burst; e.dirT = 0; }
          } else {
            e.fireCd -= dt;
            if (e.fireCd <= 0 && d < SN.range) {
              e.snipeCharge = SN.charge;
              Sfx.tone(1320, 0.16, 0.05, 'triangle', 720);
            }
          }
        }

        /* 技能二：放出寻敌爆破小车（场上最多两台，打爆了会再放） */
        e.seekerCd -= dt;
        if (sees && e.seekerCd <= 0) {
          const nSeek = G.enemies.filter(o => o.alive && o.type === 'seeker').length;
          if (nSeek < DT.maxSeekers) {
            e.seekerCd = rand(DT.seekerCd[0], DT.seekerCd[1]);
            const sa = e.facing + Math.PI + rand(-0.6, 0.6);
            const s = spawnEnemy('seeker', e.x + Math.cos(sa) * (e.r + 30), e.y + Math.sin(sa) * (e.r + 30), e.faction);
            if (s) {
              s.state = 'combat';
              popup(e.x, e.y - e.r - 26, '放出爆破小车', '#ff7a1f', 12);
              Sfx.tone(320, 0.2, 0.08, 'sawtooth', 160);
            }
          } else {
            e.seekerCd = 3;                        // 满编了稍后再看
          }
        }
      } else if (e.type === 'boss') {
        /* 守点型 BOSS「赤霄」：不追人。扛重机枪守中距离，玩家贴脸就后退，被逼急了翻滚拉开 */
        const BT = ENEMY_TYPES.boss;
        const H = BT.hmg;
        rolling = e.rollT > 0;
        if (!rolling) {
          const firing = e.hmgBurst > 0 || e.hmgSpin > 0;

          if (sees) {
            if (d < BT.keep - 70) { mvx = -nx * 0.9; mvy = -ny * 0.9; }
            else if (d > BT.keep + 230) { mvx = nx * 0.5; mvy = ny * 0.5; }
            else {
              mvx = -ny * e.strafe * 0.5;
              mvy = nx * e.strafe * 0.5;
              if (Math.random() < 0.008) e.strafe *= -1;
            }
          } else {
            // 看不见人就往驻地走，绝不会一路追出去
            const hx = e.homeX - e.x, hy = e.homeY - e.y;
            const hd = Math.hypot(hx, hy);
            if (hd > 30) { mvx = hx / hd; mvy = hy / hd; }
          }
          // 架枪时脚步几乎钉死，靠上身微调
          if (firing) { mvx *= 0.22; mvy *= 0.22; }

          e.rollCd -= dt;
          e.molotovCd -= dt;
          e.hmgCd -= dt;
          e.hmgHeat = Math.max(0, e.hmgHeat - dt * 1.1);
          e.hmgBloom = Math.max(0, e.hmgBloom - dt * 0.35);

          if (e.hmgBurst > 0) {
            /* ── 扫射中：按射速逐发出膛，枪管越来越烫、弹道越打越散 ── */
            e.hmgFire -= dt;
            let guard = 0;
            while (e.hmgFire <= 0 && e.hmgBurst > 0 && guard++ < 8) {
              e.hmgFire += H.rate;
              bossHmgFire(e, sees);
              e.hmgBurst--;
              e.hmgBloom = Math.min(H.bloom, e.hmgBloom + H.bloom * 0.06);
            }
            e.hmgHeat = Math.min(1, e.hmgHeat + dt * 5.5);
            if (e.hmgBurst <= 0) { e.hmgCd = rand(H.cd[0], H.cd[1]); e.hmgBloom = 0; }
          } else if (e.hmgSpin > 0) {
            /* ── 预热：枪管转动、准星收紧，给玩家 0.44 秒找掩体 ── */
            e.hmgSpin -= dt;
            if (Math.random() < 0.55) {
              const ma = e.aim;
              addParticle(e.x + Math.cos(ma) * e.r * 1.5, e.y + Math.sin(ma) * e.r * 1.5, {
                vx: rand(-14, 14), vy: rand(-14, 14), life: 0.22, r: rand(2, 4),
                color: pick(['#ffb347', '#ffd66b']), drag: 0.9, glow: true,
              });
            }
            if (e.hmgSpin <= 0) { e.hmgBurst = H.rounds; e.hmgFire = 0; e.hmgBloom = 0.006; }
          } else if (sees && e.hmgCd <= 0 && d < H.range) {
            /* ── 重新架枪 ── */
            e.hmgSpin = H.spin;
            popup(e.x, e.y - e.r - 26, '重机枪 · 预热', '#ffb347', 12);
            Sfx.tone(96, 0.4, 0.05, 'sawtooth', 210);
          }

          // 技能一：翻滚。贴脸就往后滚拉开距离，距离够远时偶尔侧滚换位（扫射时不能滚）
          if (sees && !firing && e.rollCd <= 0) {
            if (d < BT.keep - 90) startBossRoll(e, -nx, -ny);
            else if (Math.random() < 0.5) startBossRoll(e, -ny * e.strafe, nx * e.strafe);
          }

          if (sees) {
            // 技能二：燃烧瓶，封锁玩家走位（扫射间隙才丢，避免两套技能叠在一起）
            if (e.molotovCd <= 0 && !firing && d < 860 && d > 80) {
              e.molotovCd = rand(BT.molotovCd[0], BT.molotovCd[1]);
              throwMolotov(e, P.x + rand(-54, 54), P.y + rand(-54, 54));
            }
          }
        } else {
          // 翻滚中：只保留翻滚位移，不做别的
          e.rollT -= dt;
          mvx = e.rollX; mvy = e.rollY;
          if (Math.random() < 0.7) {
            addParticle(e.x, e.y, {
              vx: rand(-40, 40), vy: rand(-40, 40), life: 0.32, r: rand(4, 8),
              color: pick(['#ff2d55', '#ff8a3a', '#ffffff']), drag: 0.9, glow: true,
            });
          }
        }
      } else {
        /* 阿萨拉小兵：一路小跑压上去，边跑边短点射，贴近了再补近身 */
        const B = ENEMY_TYPES.runner.burst;
        mvx = tdx / td; mvy = tdy / td;
        if (sees && e.ptN <= 0 && d < B.range && d > 46) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            e.fireCd = rand(B.cd[0], B.cd[1]);
            startPointBurst(e, B);
          }
        }
      }

    /* 侧翼包抄：flanker 先绕到玩家侧后方的位置（远了才绕，近了就正常打） */
    if ((e.flankOn || 0) > 0) {
      e.flankOn -= dt;
      const fx = P.x + Math.cos(e.flankAng) * 300;
      const fy = P.y + Math.sin(e.flankAng) * 300;
      const fd = Math.hypot(fx - e.x, fy - e.y) || 1;
      if (e.state !== 'combat' || !P.alive || fd < 70 || e.flankOn <= 0) {
        e.flankOn = 0;                       // 到位 / 超时 / 脱战：回到正面打法
      } else if (d > 170) {
        mvx = (fx - e.x) / fd;
        mvy = (fy - e.y) / fd;
        spdMul = Math.max(spdMul, 1.12);     // 绕侧稍微加快脚步
      }
    }

    /* ── 近战姿态：抬手时站定蓄力，挥击时改走突进位移，收招后拉开距离 ── */
    if (e.meleeWind > 0 && !rolling) {
      mvx = 0; mvy = 0;                                   // 抬手：钉住不动，给你走位的时间
      e.meleeAim += clamp(angleDiff(angToPlayer, e.meleeAim), -2.2 * dt, 2.2 * dt);
      faceAim = e.meleeAim;
    } else if (e.meleeSwing > 0) {
      mvx = 0; mvy = 0;                                   // 突进由下面的位移直接完成
      faceAim = e.meleeAim;
    } else if (e.meleeBack > 0) {
      mvx = -Math.cos(e.meleeAim) * 0.85; mvy = -Math.sin(e.meleeAim) * 0.85;
      faceAim = e.meleeAim;
    } else if (e.state === 'combat' && !rolling && d < mReach * 0.97) {
      /* 已经进入出手距离：不往玩家身上挤；想拉开的也压慢，先挨一刀再走（不再"合体"） */
      const rad = mvx * nx + mvy * ny;
      if (rad > 0) { mvx -= nx * rad; mvy -= ny * rad; }   // 不往身上挤
      else if (rad < 0) spdMul *= 0.4;                     // 想拉开也放慢脚步，留出挥刀窗口
    }

    if (e.meleeWind > 0 || e.meleeSwing > 0 || e.meleeBack > 0) faceAim = e.meleeAim;
    else if (sees) faceAim = angToPlayer;
    else if (td > 26) faceAim = Math.atan2(mvy, mvx);
    else e.facing += Math.sin(G.time * 3.4 + e.walkPhase) * dt * 2.4;
    }

    if ((mvx || mvy) && hitsObstacle(e.x + mvx * (e.r + 30), e.y + mvy * (e.r + 30), e.r * 0.72)) {
      const tx = -mvy * e.avoidDir, ty = mvx * e.avoidDir;
      mvx = tx * 1.55 + mvx * 0.22;
      mvy = ty * 1.55 + mvy * 0.22;
    }

    for (let j = 0; j < G.enemies.length; j++) {
      if (i === j) continue;
      const o = G.enemies[j];
      const ddx = e.x - o.x, ddy = e.y - o.y;
      const dd = Math.hypot(ddx, ddy);
      const minD = e.r + o.r;
      if (dd > 0.001 && dd < minD) {
        const push = (minD - dd) / minD;
        mvx += (ddx / dd) * push * 3.2;
        mvy += (ddy / dd) * push * 3.2;
      }
    }

    /* 只有超长向量才归一化：方向系数 <1 的「慢走 / 侧移 / 后撤」必须保留，
       否则盾兵的 0.7、机枪兵的 0.5、狙击兵的 0.38 全被拉回全速 */
    const ml = Math.hypot(mvx, mvy);
    if (ml > 1) { mvx /= ml; mvy /= ml; }

    if (faceAim !== null) e.facing += angleDiff(faceAim, e.facing) * Math.min(1, dt * 9);

    let spd = e.speed * spdMul * (e.stagger > 0 ? 0.25 : 1);
    if (e.cripple > 0) spd *= 0.6;                        // 被炸断腿：一瘸一拐
    if (e.blind > 0) spd *= 0.5;                          // 被闪光晃到：摸着墙走
    if (e.type === 'runner') {
      // 点射时半蹲着走，打完继续撒腿冲
      if (e.ptN > 0) spd *= 0.5;
      else if (e.state === 'combat') spd *= 1 + 0.25 * Math.sin(e.walkPhase);
    }
    if (e.type === 'shooter' && e.ptN > 0) spd *= 0.35;
    if (e.type === 'brute' && (e.gatBurst > 0 || e.gatSpin > 0)) spd *= 0.22;
    if (e.type === 'sniper' && e.snipeCharge > 0) spd *= 0.14;   // 架枪瞄准时几乎不动
    if (e.type === 'director' && (e.snipeCharge > 0 || e.dirN > 0)) spd *= 0.18;
    if (e.type === 'rocket' && e.loadT > 0) spd *= 0.32;
    if (e.type === 'flamer' && e.flameT > 0) spd *= 0.42;
    if (e.type === 'cryo' && e.iceLoad > 0) spd *= 0.45;
    if (e.type === 'cryoS' && e.sprayT > 0) spd *= 0.34;     // 喷着雾基本是站桩
    if (e.type === 'nader' && e.throwCd > 4.6) spd *= 0.6;   // 刚扔完那一小会儿会停一下
    if (rolling) spd = ENEMY_TYPES.boss.rollSpd;

    e.x += mvx * spd * dt;
    e.y += mvy * spd * dt;

    /* 挥击突进：朝锁定方向扑一小段，纯位移、不走常规移动（让你看清"这一刀"） */
    if (e.meleeSwing > 0 && e.meleeLunge > 0 && !rolling) {
      const step = Math.min(e.meleeLunge, 640 * dt);
      if (step > 0.01) {
        const mx = e.x + Math.cos(e.meleeAim) * step, my = e.y + Math.sin(e.meleeAim) * step;
        if (!hitsObstacle(mx, my, e.r)) { e.x = mx; e.y = my; }
        e.meleeLunge -= step;
      }
    }

    // 加特林枪管转动（纯表现，扫射时转得最快）；六边身体战斗时锁定目标、待机才慢转
    if (e.type === 'brute') {
      e.gatPhase += dt * (e.gatBurst > 0 ? 30 : (e.gatSpin > 0 ? 22 : 0));
      if (e.state === 'combat' || e.state === 'alert') {
        e.hexAim += angleDiff(e.aim, e.hexAim) * Math.min(1, dt * 6);   // 大块头转身慢半拍
      } else {
        e.hexAim += dt * 0.6;
      }
    }
    e.shieldFlash = Math.max(0, e.shieldFlash - dt * 4);
    e.armorFlash = Math.max(0, (e.armorFlash || 0) - dt * 5);

    resolveCircleRects(e);
    clampWorld(e);

    /* 绝不和玩家"合体"：任何情况下都把敌人顶到玩家体积之外 */
    {
      const sdx = e.x - P.x, sdy = e.y - P.y;
      let sd = Math.hypot(sdx, sdy);
      const need = P.r + e.r;
      if (sd < need) {
        let ux, uy;
        if (sd < 0.001) { ux = Math.cos(e.facing); uy = Math.sin(e.facing); sd = 1; }
        else { ux = sdx / sd; uy = sdy / sd; }
        const gx = P.x + ux * need, gy = P.y + uy * need;
        if (!hitsObstacle(gx, gy, e.r)) { e.x = gx; e.y = gy; }
        else {
          // 敌人这边被地形卡住 → 改把玩家顶开，总之绝不重叠
          const px = e.x - ux * need, py = e.y - uy * need;
          if (!hitsObstacle(px, py, P.r)) {
            P.x = px; P.y = py;
            resolveCircleRects(P); clampWorld(P);
          } else { e.x += ux * (need - sd) * 0.6; e.y += uy * (need - sd) * 0.6; }
        }
        resolveCircleRects(e);
        clampWorld(e);
      }
    }

    // BOSS 有活动半径：被引走也会被拽回据点附近，绝不离开岗位
    if (e.type === 'boss') {
      /* 带驻守区的地图（零号大坝行政楼）：硬锁在区域内，连击退/翻滚都推不出去 */
      if (G.bossZone) {
        const z = G.bossZone, m = e.r + 2;
        e.x = clamp(e.x, z.x + m, Math.max(z.x + m, z.x + z.w - m));
        e.y = clamp(e.y, z.y + m, Math.max(z.y + m, z.y + z.h - m));
      }
      const hdx = e.x - e.homeX, hdy = e.y - e.homeY;
      const hd = Math.hypot(hdx, hdy);
      const maxLeash = ENEMY_TYPES.boss.leash + 150;
      if (hd > maxLeash) {
        e.x = e.homeX + hdx / hd * maxLeash;
        e.y = e.homeY + hdy / hd * maxLeash;
      }
    }

    e.aim = (e.state === 'combat' && sees) ? angToPlayer : e.facing;

    /* 盾面朝向：追着玩家转，但转身有上限——贴着它绕圈就能把盾甩到侧面去 */
    if (e.maxShield > 0) {
      const want = (e.state === 'combat') ? angToPlayer : e.facing;
      const turn = (e.state === 'combat' ? 1.55 : 0.9) * dt;
      e.shieldAim += clamp(angleDiff(want, e.shieldAim), -turn, turn);
    }

    /* 点射出膛：一发一发打，节奏由 ptInt 控制 */
    updatePointBurst(e, dt);

    /* 被贴到脸上时收招更快，保证有还手的一刀（远程兵种也不会一味后退） */
    if (e.meleeCd > 0 && e.state !== 'patrol' && d <= mReach) {
      e.meleeCd = Math.max(0, e.meleeCd - dt * 2.4);
      if (d <= mReach * 0.62) e.meleeCd = Math.min(e.meleeCd, 0.1);   // 被死贴住：立刻还一刀
    }

    /* ── 近战攻击：进入出手距离 → 抬手预警（可躲） → 突进一刀 ── */
    if (e.meleeWind > 0) {
      if (rolling) {
        e.meleeAim = angToPlayer;                          // 翻滚中不出手，蓄力先憋着
      } else {
      e.meleeWind -= dt;
      if (e.meleeWind <= 0) {
        const hd = Math.hypot(P.x - e.x, P.y - e.y) || 1;
        const off = Math.abs(angleDiff(Math.atan2(P.y - e.y, P.x - e.x), e.meleeAim));
        const hit = hd <= mReach + 16 && off <= M.arc;    // 走位跑开或绕到侧后 → 落空
        e.meleeSwing = 0.26;
        e.meleeLunge = M.lunge;
        e.meleeBack = 0.34;
        e.meleeHit = hit ? 1 : 0;
        e.meleeCd = M.cd * rand(0.88, 1.14);
        if (hit) {
          damagePlayer(e.dmg, e.x, e.y, 0.3);
          // 被砍中会被顶开一小段，免得被围在原地动不了
          const kx = Math.cos(e.meleeAim) * M.kick, ky = Math.sin(e.meleeAim) * M.kick;
          if (!hitsObstacle(P.x + kx, P.y + ky, P.r)) { P.x += kx; P.y += ky; }
          Sfx.meleeHit();
        } else {
          Sfx.meleeMiss();
          popup(e.x, e.y - e.r - 22, '落空', 'rgba(200,220,240,0.8)', 11);
        }
        burst(e.x + Math.cos(e.meleeAim) * e.r, e.y + Math.sin(e.meleeAim) * e.r,
              hit ? 10 : 5,
              { color: hit ? ['#ffffff', e.glow] : [e.glow], life: 0.32, r: 3, spdMin: 40, spdMax: 210 });
      }
      }
    } else if (e.meleeCd <= 0 && e.meleeSwing <= 0 && e.meleeBack <= 0 && !rolling
               && e.stagger <= 0 && e.state !== 'patrol' && d <= mReach
               && (sees || d < P.r + e.r + M.reach * 0.45)) {
      e.meleeWind = M.wind;
      e.meleeAim = angToPlayer;
      // 慢刀（机枪兵抡枪托、赤霄重踏）才给文字预警，快刀靠弧光+音效，免得刷屏
      if (M.wind >= 0.4) popup(e.x, e.y - e.r - 26, e.type === 'boss' ? '重踏！' : '挥击！', '#ff5a70', 13);
      Sfx.meleeWind();
      if (e.state !== 'combat') enterCombat(e, P.x, P.y, true);
    }
  }

  G.alarm = Math.max(0, G.alarm - dt * 0.08);
}

/* ══════════════════════════════════════════════════════════
   阵营混战：两个阵营同场时互相开火
   ──────────────────────────────────────────────────────────
   只接管「没在打玩家」的敌人：看见敌对阵营就转头对射。
   正在和玩家交火的敌人仍优先玩家 —— 玩家永远是最扎眼的那个。
   单阵营地图（零号大坝 / 航天基地）G.factionsMixed=false，整段零开销跳过。
   ══════════════════════════════════════════════════════════ */
function updateFactionWars(dt) {
  if (!G.factionsMixed) return;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.state === 'combat' || e.stun > 0) { e.foeTgt = null; continue; }

    /* 索敌：每 0.35~0.7 秒扫一次最近的敌对阵营（要能看见，墙后不算） */
    e.foeScan = (e.foeScan || 0) - dt;
    if (e.foeScan <= 0) {
      e.foeScan = rand(0.35, 0.7);
      let best = null, bd = Infinity;
      for (const o of G.enemies) {
        if (!o.alive || o.faction === e.faction) continue;
        const dd = dist(e.x, e.y, o.x, o.y);
        if (dd > e.sight * 0.9 || dd >= bd) continue;
        if (!losClear(e.x, e.y, o.x, o.y)) continue;
        if (dd > 64 && smokeBlocks(e.x, e.y, o.x, o.y)) continue;
        best = o; bd = dd;
      }
      e.foeTgt = best;
    }

    const t = e.foeTgt;
    if (!t || !t.alive) { e.foeTgt = null; continue; }
    const dd = dist(e.x, e.y, t.x, t.y);
    if (dd > e.sight || !losClear(e.x, e.y, t.x, t.y)) { e.foeTgt = null; continue; }

    /* 转头对准（不瞬移甩枪） */
    const aim = Math.atan2(t.y - e.y, t.x - e.x);
    e.facing += clamp(angleDiff(aim, e.facing), -3.2 * dt, 3.2 * dt);

    e.foeCd = (e.foeCd === undefined ? rand(0.5, 1.4) : e.foeCd) - dt;
    if (e.foeCd <= 0) {
      e.foeCd = rand(1.1, 2.0);
      const a = aim + rand(-1, 1) * 0.08;
      enemyShootAt(e, a, 620, 5.5 * (e.dmgMul || 1), 3.4, '#ffd0da');
      Sfx.shoot('tap');
    }
  }
}

/* 子弹打在身上：先过护甲那道关。
   返回 {dmg 实际肉伤, ratio 穿透比例, blocked 是否被完全挡住}。
   挡住的弹不掉血，但会磨护甲耐久 —— 所以低级弹磨也能把甲磨穿，
   只是要多打半个弹匣。修脚弹（0 级）打无甲目标时肉伤按 fleshMul 放大。 */
function bulletDamage(e, b) {
  const pen = b.pen || 0;
  let dmg = b.dmg;
  /* 远距衰减：每把步枪有自己的「有效距离」与封底倍率（fb.d0 内满伤，
     之后线性掉到 fb.min）。只在玩家子弹上有 fb，敌人子弹不受影响。 */
  if (b.fb && b.ox != null) {
    const trav = Math.hypot(b.x - b.ox, b.y - b.oy);
    const span = Math.max(1, (b.fb.d1 || b.fb.d0 * 3) - b.fb.d0);
    const k = clamp((trav - b.fb.d0) / span, 0, 1);
    dmg *= 1 - k * (1 - b.fb.min);
  }
  let ratio = 1;
  if (e.armorHp > 0 && e.armorLv > 0) {
    ratio = penRatio(pen, e.armorLv);
    /* 护甲伤害是独立于肉伤的第二套数值：每发削掉多少耐久。
       穿透（ratio>0）全额结算；被甲吃住（跳弹）只留 65% —— 所以低弹级磨甲明显更慢。 */
    const ad = (b.armorDmg || 0) * (b.armorMul || 1) * (ratio > 0 ? 1 : 0.65);
    e.armorHp = Math.max(0, e.armorHp - ad);
    if (ratio <= 0) e.armorFlash = 1;
    if (e.armorHp <= 0) {
      popup(e.x, e.y - e.r - 32, '护甲被打穿', '#ffd66b', 13);
      burst(e.x, e.y, 12, { color: ['#bfe4ff', '#ffffff', '#8fb6d0'], life: 0.4, r: 3, spdMin: 60, spdMax: 240, glow: true });
    }
    dmg *= ratio;
  } else if (pen === 0) {
    dmg *= (b.fleshMul || 1.6);
  }
  return { dmg, ratio, blocked: ratio <= 0 };
}

function damageEnemy(e, dmg, dirX, dirY, knock, byFac) {
  if (e.invuln > 0) return;        // 翻滚中的 BOSS 不吃伤害
  const byPlayer = !byFac || byFac === 'player';
  e.hp -= dmg;
  e.burn = 1;
  e.stagger = Math.min(0.22, dmg / 380);
  /* 露娜被动：打中就标上 —— 隔着迷雾也能看见他往哪跑（只有玩家打的才算） */
  if (byPlayer && spotOn()) markEnemy(e, 4);
  /* 无名被动「重伤延滞」：打中就挂重伤（打药 / 起身变慢），还有较高概率撕开流血 */
  if (byPlayer && traumaOn() && dmg < 500) {
    e.trauma = Math.max(e.trauma || 0, SKILL.trauma.dur);
    e.bandaging = false; e.bandageT = 0;                  // 包扎被打断
    const chance = SKILL.trauma.bleedChance + (dmg >= 30 ? SKILL.trauma.bleedHeavy : 0);
    if (Math.random() < chance) addEnemyBleed(e, 1);
  }
  if (knock) { e.x += dirX * knock * 0.02; e.y += dirY * knock * 0.02; }
  if (e.hp <= 0 && e.alive) {
    e.envKill = !byPlayer;         // 死于阵营混战：不给玩家记击杀 / 连击 / 分数
    killEnemy(e);
  }
}

function killEnemy(e) {
  e.alive = false;
  const idx = G.enemies.indexOf(e);
  if (idx >= 0) G.enemies.splice(idx, 1);

  /* 死于阵营混战（不是玩家打的）：不记击杀 / 连击 / 分数，也不触发击杀类被动 */
  const byEnv = !!e.envKill;
  if (!byEnv) {
    G.kills++;
    if (silentOn()) G.silentKills++;
    G.combo++;
    G.comboTimer = 2.6;
    exoOnKill();                  // 外骨骼期间：每倒一个都续 5 秒 + 回 30 血 + 满体力
    adrOnKill();                  // 蛊：肾上腺素期间每倒一个叠一层强度
    /* 威龙：动力推进每倒一个直接扣 10 秒冷却（冷却在 recharge 上，cd 只剩出弹间隔） */
    if (P.op && (P.op.v.cd > 0 || P.op.v.recharge > 0)) {
      const od = opDef();
      if (od && od.v.kind === 'dash') {
        const cut = SKILL.dash.killCd;
        if (P.op.v.recharge > 0) P.op.v.recharge = Math.max(0, P.op.v.recharge - cut);
        else P.op.v.cd = Math.max(0, P.op.v.cd - cut);
        popup(e.x, e.y - e.r - 46, '推进 -' + cut + 's', '#8fe0ff', 11);
      }
    }
    const mult = 1 + Math.min(G.combo, 20) * 0.06;
    const gain = Math.round(e.score * mult);
    G.score += gain;
    popup(e.x, e.y - e.r - 6, '+' + gain, G.combo > 3 ? '#ffd66b' : '#a8d8ff', e.type === 'boss' ? 26 : 14);
    if (G.combo > 2) popup(e.x, e.y - e.r - 30, 'x' + G.combo + ' 连击', '#43d9f5', 12);
  } else {
    popup(e.x, e.y - e.r - 6, '阵营交火', 'rgba(200,220,240,0.75)', 11);
  }

  burst(e.x, e.y, (e.type === 'boss' || e.type === 'director') ? 60 : (e.type === 'brute' ? 26 : 16), {
    color: [e.color, '#ffffff', '#ff8fa3'],
    life: 0.75, r: (e.type === 'boss' || e.type === 'director') ? 8 : 5,
    spdMin: 60, spdMax: (e.type === 'boss' || e.type === 'director') ? 520 : 320, glow: true, drag: 0.92,
  });
  addDecal(e.x, e.y, e.r * rand(1.1, 1.9), '#3a0a14', 0.5);

  if (e.type === 'director') {
    /* 安全总监：全场警报式谢幕，掉哈夫克专属货；护卫小车随后殉爆 */
    Sfx.explode(); shake(26);
    popup(e.x, e.y - e.r - 70, '安全总监 · 击破', '#ffd66b', 20);
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        burst(e.x + rand(-40, 40), e.y + rand(-40, 40), 20, { color: ['#ffb02e', '#ffd66b', '#ffffff'], life: 0.8, r: 7, spdMin: 100, spdMax: 460, glow: true });
        shake(10);
      }, k * 110);
    }
    dropPickup(e.x, e.y, 'relic', 0, 'access');                    // 「安全总监」权限卡
    dropPickup(e.x + 40, e.y, 'relic', 0, Math.random() < 0.24 ? rollRelicOf('myth') : rollRelicOf('epic'));
    dropPickup(e.x - 34, e.y + 16, 'medkit');
  } else if (e.type === 'seeker') {
    /* 爆破小车被打爆：原地炸一圈，掉不了东西 */
    seekerBoom(e);
  } else if (e.type === 'escort') {
    /* 护卫小车被击毁：殉爆，但对总监没影响 */
    escortBoom(e);
  } else if (e.type === 'boss') {
    Sfx.explode(); shake(26);
    popup(e.x, e.y - e.r - 70, '赤霄 · 击破', '#ffd66b', 20);
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        burst(e.x + rand(-40, 40), e.y + rand(-40, 40), 20, { color: ['#ff2d55', '#ffd66b', '#ffffff'], life: 0.8, r: 7, spdMin: 100, spdMax: 460, glow: true });
        shake(10);
      }, k * 110);
    }
  } else {
    Sfx.hit();
    shake(e.type === 'brute' ? 8 : 2);
  }

  if (e.type === 'boss') {
    dropPickup(e.x, e.y, 'relic', 0, 'belt');
    // 打倒赤霄有 22% 概率摸到一件神话货
    dropPickup(e.x + 40, e.y, 'relic', 0, Math.random() < 0.22 ? rollRelicOf('myth') : rollRelicOf('epic'));
    dropPickup(e.x - 34, e.y + 16, 'medkit');
  } else if (Math.random() < 0.16) {
    const r = Math.random();
    if (r < 0.22) dropPickup(e.x, e.y, 'relic', 0, rollRelicOf('common'));
    else if (r < 0.62) dropPickup(e.x, e.y, 'medkit');
    else {
      /* 掉的是实体子弹（口径 / 弹级 / 发数都随机），不是抽象的「备弹」 */
      const b = rollBulletDrop(0.6);
      dropPickup(e.x, e.y, 'cell', 0, null, { t: 'ammo', cal: b.cal, lv: b.lv, n: b.n });
    }
  }
  /* 带甲的敌人被打倒，甲板还能捡回来 —— 耐久就是它替你（或者说替它）挨过的那些弹 */
  if (e.armorLv > 0) {
    const dropP = (e.type === 'boss' || e.type === 'director') ? 0.55 : 0.18;
    if (Math.random() < dropP) {
      const aid = e.armorId || rollArmorId(e.armorLv);
      const A = ARMORS[aid] || ARMORS[1];
      const m = A.hp;
      const wear = clamp(e.armorMax > 0 ? (e.armorHp | 0) / e.armorMax : 0.55, 0.25, 1);
      dropPickup(e.x + 20, e.y + 12, 'cell', 0, null,
        { t: 'armor', id: A.id, hp: Math.max(1, Math.round(m * wear)), max: m });
    }
  }
}

function dropPickup(x, y, kind, value, relicId, cell) {
  G.pickups.push({
    x: x + rand(-10, 10), y: y + rand(-10, 10),
    kind, life: cell ? 600 : 180, bob: rand(0, TAU), value: value || 0,
    relicId: relicId || null, cell: cell || null,
  });
}

/* 捡起地上的一件东西。返回 false = 身上没空位 / 装不下 —— 留在地上（有 1.2s 冷却防刷屏）。
   都走格子收纳：背包 → 弹挂 → 口袋。 */
function collectPickup(p) {
  let ok = false;
  if (p.kind === 'cell' && p.cell) {
    const c = p.cell;
    if (stowCell(c)) {
      ok = true;
      recountLoot();
      popup(P.x, P.y - 30, cellName(c) + (c.t === 'ammo' ? ' ' + (c.n | 0) + ' 发' : ''), cellColor(c), 14);
      Sfx.pickup();
    } else if (c.t === 'gear' && wearGearInRaid(c.key, true, c.cells)) {
      ok = true;                                   // 弹挂 / 背包：直接换穿（同款 = 备用件）
      popup(P.x, P.y - 30, cellName(c) + ' 已换上', cellColor(c), 14);
    } else if (c.t === 'gun' && groundGunTake(c, p.x, p.y)) {
      ok = true;                                   // 没背包 / 背包满：空槽装上或和手上这把换
      popup(P.x, P.y - 30, WEAPONS[c.id].short + ' 已拿起', cellColor(c), 14);
    } else if (c.t === 'armor' && swapWearArmor(c)) {
      ok = true;                                   // 背包满：直接换穿，身上那件掉脚边
      popup(P.x, P.y - 30, cellName(c) + ' 已穿上', cellColor(c), 14);
    } else {
      popup(P.x, P.y - 30, '身上没有空位', '#ff6b8a', 13);
    }
  } else if (p.kind === 'medkit') {
    if (Math.random() < 0.22) ok = addStop('bandage', 1) > 0;
    else ok = addMed(rollMedDropId(false), 1) > 0;
    if (ok) { popup(P.x, P.y - 30, '医疗物资 +1', '#46e08a', 14); Sfx.pickup(); }
    else popup(P.x, P.y - 30, '身上没有空位', '#ff6b8a', 13);
  } else if (p.kind === 'ammo') {
    const a = currentAmmo();
    if (P.weapon) {
      const want = weaponStats(P.weapon).mag * 2;
      const got = addReserve(calOfWeapon(P.weapon), want, a.tier);
      ok = got > 0;
      popup(P.x, P.y - 30, '弹药补给 +' + got + ' 发' + (got < want ? ' · 格子满了' : ''), ammoTier(a.tier).color, 14);
      if (ok) Sfx.pickup();
    } else {
      P.hp = Math.min(P.maxHp, P.hp + 8);
      ok = true;
      popup(P.x, P.y - 30, '没有枪，先回血', '#8ef2ff', 14);
      Sfx.pickup();
    }
  } else if (p.kind === 'relic' && p.relicId && RELICS[p.relicId]) {
    const r = RELICS[p.relicId];
    ok = addRelic(p.relicId, 1) > 0;
    if (ok) { popup(P.x, P.y - 30, r.name + ' ¥' + fmtMoney(r.price), QUALITY[r.q].color, 14); Sfx.loot(); }
    else popup(P.x, P.y - 30, '身上没有空位', '#ff6b8a', 13);
  }
  if (ok) {
    burst(p.x, p.y, 10, { color: p.kind === 'medkit' ? '#46e08a' : (p.kind === 'ammo' ? '#8ef2ff' : (p.kind === 'cell' ? cellColor(p.cell) : (p.relicId && RELICS[p.relicId] ? QUALITY[RELICS[p.relicId].q].color : '#ffd08a'))), life: 0.4, r: 3, spdMin: 50, spdMax: 200, glow: true });
  }
  return ok;
}

/* ══════════════════════════════════════════════════════════
   10. 子弹 & 手雷
   ══════════════════════════════════════════════════════════ */
function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { G.bullets.splice(i, 1); continue; }
    b.px = b.x; b.py = b.y;

    const moveX = b.vx * dt, moveY = b.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveY) / 9));
    let removed = false;

    for (let s = 0; s < steps; s++) {
      b.x += moveX / steps;
      b.y += moveY / steps;

      if (b.x < 0 || b.x > WORLD.w || b.y < 0 || b.y > WORLD.h) {
        burst(b.x, b.y, 3, { color: b.color, life: 0.2, r: 2.5, spdMin: 20, spdMax: 90 });
        G.bullets.splice(i, 1); removed = true; break;
      }
      if (pointInObstacle(b.x, b.y)) {
        burst(b.x, b.y, 5, { color: ['#ffe9a8', b.color, '#ffffff'], life: 0.24, r: 2.6, spdMin: 40, spdMax: 190, glow: true });
        G.bullets.splice(i, 1); removed = true; break;
      }

      if (b.hostile) {
        if (P.alive && dist2(b.x, b.y, P.x, P.y) < (P.r + b.r) * (P.r + b.r)) {
          damagePlayer(b.dmg, b.x, b.y, b.heavy ? 0.34 : 0, b.pen);
          burst(b.x, b.y, 6, { color: ['#ff4060', '#ffffff'], life: 0.3, r: 3, spdMin: 50, spdMax: 200, glow: true });
          G.bullets.splice(i, 1); removed = true; break;
        }
        /* 阵营混战：敌对阵营的子弹会打到对方，同阵营穿过去不误伤 */
        if (b.side && G.factionsMixed) {
          for (let j = G.enemies.length - 1; j >= 0; j--) {
            const e = G.enemies[j];
            if (!e.alive || e === b.src || e.faction === b.side) continue;
            if (dist2(b.x, b.y, e.x, e.y) >= (e.r + b.r) * (e.r + b.r)) continue;
            const sp = Math.hypot(b.vx, b.vy) || 1;
            damageEnemy(e, b.dmg * 0.85, b.vx / sp, b.vy / sp, 0, b.side);
            burst(b.x, b.y, 5, { color: ['#ffd0da', '#ffffff'], life: 0.26, r: 2.8, spdMin: 40, spdMax: 180, glow: true });
            G.bullets.splice(i, 1); removed = true;
            break;
          }
          if (removed) break;
        }
      } else {
        /* 半空中的火箭可以被点爆——这是对火箭筒兵最省事的解法 */
        for (let k = G.rockets.length - 1; k >= 0; k--) {
          const rk = G.rockets[k];
          const rk2 = (rk.r + b.r) * (rk.r + b.r);
          if (dist2(b.x, b.y, rk.x, rk.y) < rk2) {
            popup(rk.x, rk.y - 20, '火 箭 拦 截', '#8ad34a', 13);
            G.rockets.splice(k, 1);
            rocketBlast(rk.x, rk.y, rk.mul);
            G.bullets.splice(i, 1); removed = true;
            break;
          }
        }
        if (removed) break;

        for (let j = G.enemies.length - 1; j >= 0; j--) {
          const e = G.enemies[j];
          if (!e.alive) continue;
          if (!b.hitSet) b.hitSet = new Set();
          if (b.hitSet.has(e)) continue;
          // 举着盾的正面比身体胖一圈，所以命中半径按盾算
          const bodyR2 = (e.r + b.r) * (e.r + b.r);
          const reach = e.shield > 0 ? (e.r + 7 + b.r) : (e.r + b.r);
          if (dist2(b.x, b.y, e.x, e.y) < reach * reach) {
            // 打在正面盾上：盾掉血、子弹被吃掉（穿透弹也穿不过去）
            if (e.shield > 0 && shieldBlocks(e, b)) {
              b.hitSet.add(e);
              hitShield(e, b.dmg, b.x, b.y, b.vx, b.vy);
              spawnHitmark('armor');
              G.bullets.splice(i, 1); removed = true;
              break;
            }
            // 盾沿之外擦过去的子弹不算命中
            if (dist2(b.x, b.y, e.x, e.y) > bodyR2) continue;
            b.hitSet.add(e);
            const len = Math.hypot(b.vx, b.vy) || 1;
            const res = bulletDamage(e, b);
            if (res.blocked) {
              /* 被甲吃住：不掉血，只磨耐久，溅一圈冷色火星 */
              e.armorFlash = 1;
              burst(b.x, b.y, 4, {
                angle: Math.atan2(b.vy, b.vx) + Math.PI, spread: 1.1,
                spdMin: 30, spdMax: 150, color: ['#bfe4ff', '#ffffff', '#8fb6d0'],
                life: 0.24, r: 2.4, glow: true, drag: 0.9,
              });
              if (Math.random() < 0.22) popup(b.x, b.y - 14, '被 ' + e.armorLv + ' 级甲挡住', '#8fb6d0', 11);
              spawnHitmark('armor');
              Sfx.hit();
            } else {
              damageEnemy(e, res.dmg, b.vx / len, b.vy / len, b.knock * (res.ratio < 1 ? 0.6 : 1));
              spawnHitmark(e.alive ? 'hit' : 'kill');
              burst(b.x, b.y, 6, {
                angle: Math.atan2(b.vy, b.vx) + Math.PI, spread: 0.8,
                spdMin: 40, spdMax: 220, color: ['#ff3355', '#ff6b81', '#ffffff'],
                life: 0.35, r: 3, glow: false, drag: 0.9,
              });
              addDecal(e.x + rand(-6, 6), e.y + rand(-6, 6), rand(5, 11), '#4a0a18', 0.42);
              Sfx.hit();
            }

            if (b.pierce > 0) { b.pierce--; b.dmg *= 0.75; }
            else { G.bullets.splice(i, 1); removed = true; }
            break;
          }
        }
        if (removed) break;
      }
    }
  }
}

/* 爆炸的纯视觉部分：火光渐变 + 火星 + 闪光（手雷与火箭共用） */
function blastFX(x, y, radius) {
  const g = ctx.createRadialGradient(x, y, 6, x, y, radius);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.35, 'rgba(255,200,90,0.9)');
  g.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();

  for (let i = 0; i < 34; i++) {
    const a = rand(0, TAU), s = rand(120, 620);
    addParticle(x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.3, 0.85), r: rand(2, 7),
      color: pick(['#fff6d0', '#ffcc55', '#ff7733', '#ff4422']),
      drag: 0.90, glow: true,
    });
  }
  addParticle(x, y, { vx: 0, vy: 0, life: 0.35, r: radius * 0.9, color: '#fff3c4', drag: 1, glow: true, shape: 'flash' });
  addDecal(x, y, radius * 0.55, '#1a0a04', 0.5);
}

function explodeAt(x, y, radius, dmg, fromPlayer) {
  blastFX(x, y, radius);
  Sfx.explode();
  shake(18);
  emitNoise(x, y, 1500, 1.0);   // 爆炸声传遍半个街区

  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > radius + e.r) continue;
    const falloff = 1 - clamp((d - e.r) / radius, 0, 1);
    const dmgOut = dmg * (0.35 + falloff * 0.65);
    const dx = (e.x - x) / (d || 1), dy = (e.y - y) / (d || 1);
    damageEnemy(e, dmgOut, dx, dy, 420);
    e.x += dx * 26; e.y += dy * 26;
    e.stagger = 0.35;
  }

  /* 敌方手雷：玩家也要吃爆炸。同一条距离衰减曲线，近炸远轻 */
  if (!fromPlayer && P.alive) {
    const dp = dist(x, y, P.x, P.y);
    if (dp < radius + P.r) {
      const fall = 1 - clamp((dp - P.r) / radius, 0, 1);
      damagePlayer(dmg * (0.35 + fall * 0.65), x, y, 0.35);
    }
  }
}

function updateNades(dt) {
  for (let i = G.nades.length - 1; i >= 0; i--) {
    const n = G.nades[i];
    n.t += dt;
    n.rot += n.spin * dt;

    if (n.t < n.dur) {
      /* 飞行段：从兵身上抛到落点，h 是绘制用的弧高 */
      const k = n.t / n.dur;
      n.x = n.sx + (n.tx - n.sx) * k;
      n.y = n.sy + (n.ty - n.sy) * k;
      n.h = Math.sin(Math.PI * k) * 46;
      if (Math.random() < 0.35) {
        addParticle(n.x, n.y - n.h * 0.3, {
          vx: rand(-12, 12), vy: rand(-6, 30), life: 0.3, r: 1.8,
          color: '#ffcc55', drag: 0.92, glow: true,
        });
      }
    } else {
      /* 落地段：贴在落点上等引信烧完，这时候才开始算红圈 */
      n.h = 0;
      n.x = n.tx; n.y = n.ty;
      if (!n.armed) {
        n.armed = true;
        Sfx.tone(210, 0.07, 0.06, 'square');
        for (let k = 0; k < 8; k++) {
          const a = k * TAU / 8;
          addParticle(n.tx, n.ty, {
            vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.3, r: 2.4,
            color: '#ffcc55', drag: 0.88, glow: true,
          });
        }
      }
      n.fuse -= dt;
      if (n.fuse <= 0) {
        explodeAt(n.x, n.y, n.radius, n.dmg, false);
        G.nades.splice(i, 1);
        continue;
      }
      // 引信快到头的时候冒烟闪红，给最后半秒提个醒
      if (Math.random() < 0.6) {
        addParticle(n.x, n.y, {
          vx: rand(-16, 16), vy: rand(-34, -8), life: 0.4, r: rand(1.6, 3),
          color: n.fuse < 0.5 ? '#ff5533' : '#ffcc55', drag: 0.93, glow: true,
        });
      }
    }

    /* 子弹可以打爆它：提前引爆 = 半径与伤害各打八折，换一点喘息时间 */
    let blown = false;
    for (let bi = G.bullets.length - 1; bi >= 0; bi--) {
      const b = G.bullets[bi];
      if (dist2(b.x, b.y, n.x, n.y) > (n.r + (b.r || 3) + 2) ** 2) continue;
      explodeAt(n.x, n.y, n.radius * 0.8, n.dmg * 0.8, false);
      G.bullets.splice(bi, 1);
      G.nades.splice(i, 1);
      blown = true;
      break;
    }
    if (blown) continue;
  }
}

/* ══════════════════════════════════════════════════════════
   10.5 BOSS「赤霄」技能：重机枪 / 翻滚 / 燃烧瓶 / 火场
   ──────────────────────────────────────────────────────────
   · 重机枪：先预热 0.44 秒，然后 26 发长点射；后坐力让弹道越打越散，
     枪管过热后进入冷却。丢燃烧瓶和翻滚只在扫射间隙发生
   · 翻滚：向指定方向短促位移，期间免疫伤害，用来闪避与拉开距离
   · 燃烧瓶：抛物线飞向落点，摔碎后铺开一片持续烧灼的火场
   · 火场：范围内玩家持续掉血并被点燃，走出范围灼烧还会延续一小会儿
   ══════════════════════════════════════════════════════════ */
function bossHmgFire(e, sees) {
  const H = ENEMY_TYPES.boss.hmg;
  const lead = 0.2;                       // 预判玩家 0.2 秒后的位置，纯横向拉扯才躲得掉
  const tx = sees ? P.x + P.vx * lead : e.lastSeenX;
  const ty = sees ? P.y + P.vy * lead : e.lastSeenY;
  const base = Math.atan2(ty - e.y, tx - e.x);
  const a = base + rand(-1, 1) * (H.spread + e.hmgBloom);
  const mx = e.x + Math.cos(a) * e.r * 1.55;
  const my = e.y + Math.sin(a) * e.r * 1.55;

  G.bullets.push({
    x: mx, y: my, px: mx, py: my,
    vx: Math.cos(a) * H.spd,
    vy: Math.sin(a) * H.spd,
    r: 5.2, dmg: H.dmg * (e.dmgMul || 1), color: '#ffab4a',
    life: 1.5, hostile: true, pierce: 0, knock: 0, heavy: true, pen: e.pen || 0,
  });

  // 枪口焰
  burst(mx, my, 3, {
    angle: a, spread: 0.36, spdMin: 140, spdMax: 380,
    color: ['#fff3c4', '#ffb347'], life: 0.13, r: 3.4, glow: true,
  });
  // 抛壳：往枪身侧后方弹
  addParticle(mx, my, {
    vx: Math.cos(a + Math.PI / 2) * rand(70, 150) - Math.cos(a) * 50,
    vy: Math.sin(a + Math.PI / 2) * rand(70, 150) - Math.sin(a) * 50,
    life: rand(0.4, 0.75), r: rand(1.6, 2.6),
    color: pick(['#e8b96a', '#c99a4e']), drag: 0.92, grav: 260,
  });

  if (dist(e.x, e.y, P.x, P.y) < 820 && e.hmgBurst % 3 === 0) shake(1.4);
  if (e.hmgBurst % 2 === 1) Sfx.shoot('hmg');
  if (e.hmgBurst === H.rounds) emitNoise(e.x, e.y, 1100, 0.9);   // 开火声传遍半张图
}

function startBossRoll(e, dx, dy) {
  const BT = ENEMY_TYPES.boss;
  const l = Math.hypot(dx, dy) || 1;
  e.rollT = BT.rollTime;
  e.rollX = dx / l;
  e.rollY = dy / l;
  e.rollCd = rand(BT.rollCd[0], BT.rollCd[1]);
  e.invuln = BT.rollTime + 0.08;
  Sfx.dash();
  popup(e.x, e.y - e.r - 22, '翻滚', '#ffd66b', 12);
  burst(e.x, e.y, 18, {
    color: ['#ff2d55', '#ff8a3a', '#ffffff'],
    life: 0.5, r: 6, spdMin: 90, spdMax: 320, glow: true, drag: 0.88,
  });
  addDecal(e.x, e.y, e.r * 0.9, '#2a0812', 0.35);
}

function throwMolotov(e, tx, ty) {
  const d = dist(e.x, e.y, tx, ty);
  const air = clamp(d / 620, 0.45, 1.05);
  const ang = Math.atan2(ty - e.y, tx - e.x);
  G.molotovs.push({
    x: e.x + Math.cos(ang) * (e.r + 8),
    y: e.y + Math.sin(ang) * (e.r + 8),
    sx: e.x + Math.cos(ang) * (e.r + 8),
    sy: e.y + Math.sin(ang) * (e.r + 8),
    tx, ty, air, t: 0, h: 0,
    rot: rand(0, TAU), spin: rand(-14, 14),
  });
  popup(e.x, e.y - e.r - 24, '燃烧瓶！', '#ff8a3a', 14);
  Sfx.tone(420, 0.14, 0.09, 'triangle', 220);
}

/* 落地摔碎：铺一层火 */
function ignite(x, y) {
  x = clamp(x, 20, WORLD.w - 20);
  y = clamp(y, 20, WORLD.h - 20);
  G.fires.push({ x, y, r: BOSS_FIRE.r, life: BOSS_FIRE.life, max: BOSS_FIRE.life, tick: 0.1,
                 dmg: BOSS_FIRE.dmg * (isSecret() ? SECRET.dmgMul.boss : 1) });
  addDecal(x, y, BOSS_FIRE.r * 0.55, '#180a04', 0.42);
  Sfx.noiseBurst(0.45, 900, 0.7, 0.22);
  Sfx.tone(150, 0.3, 0.1, 'sawtooth', 70);
  shake(6);
  burst(x, y, 26, {
    color: ['#fff3c4', '#ffcc55', '#ff7733', '#ff4422'],
    life: 0.7, r: 6, spdMin: 80, spdMax: 380, glow: true, drag: 0.9,
  });
  emitNoise(x, y, 900, 0.6);
}

function updateMolotovs(dt) {
  for (let i = G.molotovs.length - 1; i >= 0; i--) {
    const m = G.molotovs[i];
    m.t += dt;
    m.rot += m.spin * dt;
    const k = clamp(m.t / m.air, 0, 1);
    // 抛物线：水平匀速插值，高度走正弦弧（只在绘制时体现）
    m.x = m.sx + (m.tx - m.sx) * k;
    m.y = m.sy + (m.ty - m.sy) * k;
    m.h = Math.sin(k * Math.PI) * 74;

    if (Math.random() < 0.5) {
      addParticle(m.x, m.y - (m.h || 0), {
        vx: rand(-16, 16), vy: rand(-20, 6), life: 0.3, r: 3,
        color: pick(['#ffcc55', '#ff7733']), drag: 0.9, glow: true,
      });
    }

    if (k >= 1) {
      ignite(m.x, m.y);
      G.molotovs.splice(i, 1);
    }
  }
}

function updateFires(dt) {
  for (let i = G.fires.length - 1; i >= 0; i--) {
    const f = G.fires[i];
    f.life -= dt;
    if (f.life <= 0) { G.fires.splice(i, 1); continue; }

    // 火苗粒子
    if (Math.random() < 0.75) {
      const a = rand(0, TAU), r = rand(0, f.r * 0.9);
      addParticle(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, {
        vx: rand(-10, 10), vy: rand(-46, -18), life: rand(0.35, 0.8), r: rand(2.5, 6),
        color: pick(['#ffd66b', '#ff8a3a', '#ff4422', '#ffffff']),
        drag: 0.92, glow: true, grav: -14,
      });
    }

    const mine = f.own === 'p';            // 玩家自己投的火场
    const d = dist(P.x, P.y, f.x, f.y);
    if (d < f.r + P.r * 0.6 && P.alive) {
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = f.breed || BOSS_FIRE.breed;
        /* 自己的燃烧弹只吃半伤，而且不点燃自己（不挂灼烧 BUF） */
        burnPlayer((f.dmg || BOSS_FIRE.dmg) * (mine ? SKILL.firebomb.selfFire : 1), f.x, f.y);
        if (!mine) P.burnT = Math.max(P.burnT, f.warm || BOSS_FIRE.warm);
      }
    }

    /* 自己的火场烧敌人（敌方喷火兵 / BOSS 的火不误伤自己人） */
    if (mine) {
      f.etick = (f.etick == null ? 0.1 : f.etick) - dt;
      if (f.etick <= 0) {
        f.etick = f.breed || SKILL.firebomb.tick;
        for (let j = G.enemies.length - 1; j >= 0; j--) {
          const e = G.enemies[j];
          if (!e.alive) continue;
          const de = dist(f.x, f.y, e.x, e.y);
          if (de < f.r + e.r * 0.5) {
            damageEnemy(e, f.dmg || BOSS_FIRE.dmg,
              (e.x - f.x) / (de || 1), (e.y - f.y) / (de || 1), 0);
          }
        }
      }
    }
  }
}

/* 火场伤害不吃受伤无敌帧，单独结算 */
function burnPlayer(dmg, srcX, srcY) {
  if (!P.alive || !P.hp) return;
  if (G.packOpen) closePackPanel();                // 着火也一样：先把背包拍掉
  P.hp -= dmg * (1 - armDr() * 0.6);
  rollTrauma(dmg, 'burn');                // 烧穿皮肤也会挂流血
  P.hurtFlash = Math.max(P.hurtFlash, 0.6);
  if (srcX !== undefined) {
    const a = Math.atan2(P.y - srcY, P.x - srcX);
    P.x += Math.cos(a) * 2;
    P.y += Math.sin(a) * 2;
  }
  if (P.hp <= 0) { P.hp = 0; playerLethal(); }
}

/* ══════════════════════════════════════════════════════════
   11. 搜刮 & 撤离
   ──────────────────────────────────────────────────────────
   搜刮不再是长按 F 的进度条：靠近箱子点一下 F，弹出一块
   补给箱面板，里面的东西一件一件"转"出来，翻到哪件才真正
   拿到哪件。全部翻完 1.2s 自动收下，也可以再按 F 直接收。
   ══════════════════════════════════════════════════════════ */
const LOOT_ROW  = 0.24;   // 相邻两件之间的间隔（秒）—— 已被逐件时间轴取代，留作兜底
const LOOT_HOLD = 0.15;   // 每件先打码抖动，再翻出来
const LOOT_FLIP = 0.11;   // 翻牌动画时长
const LOOT_RANGE = 92;    // 能开箱的距离
const LOOT_LEAD = 0.22;   // 开箱后先空一拍

/* 品质越高，越难翻：打码更久、翻牌更慢、间隔更长。
   这是「搜刮手感」的核心 —— 传说货要蹲着翻两三秒，逼你冒风险。 */
const REVEAL = {
  supply: { hold: 0.34, flip: 0.15, gap: 0.16 },
  common: { hold: 0.55, flip: 0.20, gap: 0.22 },
  rare:   { hold: 1.00, flip: 0.28, gap: 0.28 },
  epic:   { hold: 1.70, flip: 0.38, gap: 0.34 },
  legend: { hold: 2.60, flip: 0.52, gap: 0.40 },
  myth:   { hold: 3.60, flip: 0.64, gap: 0.50 },
};
function revealSpec(tier) { return REVEAL[tier] || REVEAL.supply; }

/* 品质权重：既决定打码时的微颤幅度，也决定翻开时的高光亮度 */
const Q_TREMBLE = { supply: 0.5, common: 0.7, rare: 1.0, epic: 1.35, legend: 1.7, myth: 2.1 };

/* 给一箱物品排出逐件时间轴：at 开始打码 / hold 打码 / flip 翻开 / ready 到手
   speed 是容器自己的翻找倍率：保险柜 1.9 倍，弹药箱 0.55 倍 */
function layoutLoot(items, speed) {
  const sp0 = (speed === undefined || speed === null) ? 1 : speed;   // 0 是合法速度 = 全部秒开
  let t = LOOT_LEAD * sp0;
  for (const it of items) {
    const sp = revealSpec(it.tier);
    it.at = t;
    it.hold = sp.hold * sp0;
    it.flip = sp.flip * sp0;
    it.ready = t + it.hold + it.flip;
    it.qWeight = Q_TREMBLE[it.tier] || 0.8;
    t = it.ready + sp.gap * sp0;
  }
  // 末尾那一段间隔不算在内，total 就是最后一件真正到手的时刻
  return items.length ? items[items.length - 1].ready : LOOT_LEAD * sp0;
}

/* 翻箱 · 二次翻：已经翻出来看过的（it.seen）直接秒开，没翻过的照常翻 ——
   「免搜索」只属于你看过的那几件，箱子里的未知部分还是要一件件翻 */
function layoutLootResumed(items, speed) {
  const sp0 = (speed === undefined || speed === null) ? 1 : speed;
  let t = LOOT_LEAD * sp0;
  for (const it of items) {
    const sp = revealSpec(it.tier);
    const k = it.seen ? 0 : 1;
    it.at = t;
    it.hold = sp.hold * sp0 * k;
    it.flip = sp.flip * sp0 * k;
    it.ready = t + it.hold + it.flip;
    it.qWeight = Q_TREMBLE[it.tier] || 0.8;
    t = it.ready + sp.gap * sp0 * k;
  }
  return items.length ? items[items.length - 1].ready : LOOT_LEAD * sp0;
}

function updateSearch(dt) {
  let best = null, bestD = 1e9;
  for (const c of G.crates) {
    /* 翻空了的箱子也还是目标：可以再打开，把身上的东西存进去 */
    const d = dist(P.x, P.y, c.x, c.y);
    if (d < 76 && d < bestD) { best = c; bestD = d; }
  }
  G.searchTarget = best;
  if (G.lootPanel) updateLootPanel(dt);
}

/* ── 掷一次骰子：这个容器里到底有什么 ──
   bob 是「品质加成」：保险柜 1.4、武器箱/工具箱 0.8、
   医疗箱 -0.3，直接影响各品质的权重。 */
function relicWeights(bob) {
  const wave = G.reinforceWave || 0;
  const b = bob || 0;
  const L = lootTable();
  return [
    ['common', Math.max(10, 64 - wave * 12 - b * 26) * (L ? L.relicCommon : 1)],
    ['rare',   (26 + wave * 4) * (L ? L.relicRare : 1)],
    ['epic',   (8 + wave * 5 + b * 9) * (L ? L.relicHigh : 1)],
    ['legend', (2 + wave * 1.6 + b * 4.5) * (L ? L.relicTop : 1)],
    ['myth',   (0.45 + wave * 0.42 + b * 1.4) * (L ? L.relicTop : 1)],
  ];
}
function modWeights(bob) {
  const wave = G.reinforceWave || 0;
  const b = bob || 0;
  const L = lootTable();
  return [
    ['common', Math.max(18, 58 - wave * 8 - b * 18) * (L ? 0.50 : 1)],
    ['rare',   (28 + wave * 3) * (L ? 1.40 : 1)],
    ['epic',   (10 + wave * 4 + b * 7) * (L ? L.modHigh : 1)],
    /* 传说配件只在航天基地军工体系里流转（权重 0 = 坝区永远抽不到） */
    ['legend', (1.4 + wave * 1.0 + b * 2.6) * (L ? 0.85 : 0)],
  ];
}

/* 医疗包掉落：小针最常见，越大的箱子越稀罕；机密图整体往上抬一档 */
function rollMedDropId(good) {
  const hi = good || isSecret();
  const table = hi
    ? [['inject_s', 22], ['inject_m', 32], ['kit_vehicle', 18], ['kit_field', 16], ['box_outdoor', 8], ['box_battle', 4]]
    : [['inject_s', 46], ['inject_m', 32], ['kit_vehicle', 13], ['kit_field', 6.5], ['box_outdoor', 1.8], ['box_battle', 0.7]];
  return pickWeighted(table);
}
/* n 是"几支"，不是血量 —— 注射器一板两支，大箱子一支就够重了 */
function makeMedItem(id, n) {
  const key = MEDKITS[id] ? id : STARTER_MEDKIT;
  const M = MEDKITS[key];
  const cnt = n || (key.indexOf('inject') === 0 ? 2 : 1);
  return {
    kind: 'med', icon: '药', name: M.name, val: '×' + cnt, color: M.color,
    tier: 'supply', med: key, n: cnt,
    note: M.dur + ' 耐久 · ' + M.hps + '/秒',
  };
}
/* 抽一件急救 / 止痛：绷带最常见，止疼片越贵越稀罕 */
function stopDropId() {
  const r = Math.random();
  if (r < 0.56) return 'bandage';
  if (r < 0.70) return 'tourniquet';
  if (r < 0.90) return 'pain_release';
  if (r < 0.985) return 'pain_antibio';
  return 'pain_dve';
}
function makeStopItem(id) {
  const S = STOPS[id] || STOPS.bandage;
  const cnt = Math.max(1, S.uses | 0);
  return {
    kind: 'stop', icon: S.pain ? '片' : '带', name: S.name, val: '×' + cnt, color: S.color,
    tier: 'supply', stop: S === STOPS[id] ? id : 'bandage', n: cnt,
    note: S.pain ? ('止痛 ' + S.pain + 's · ' + S.sec + 's') : (S.layers > 1 ? '止全部流血' : '止 1 层流血'),
  };
}
function makeSurgItem(id) {
  const S = SURGERIES[id] || SURGERIES.surg_simple;
  return {
    kind: 'surg', icon: '刀', name: S.name, val: '×1 次', color: S.color,
    tier: id === 'surg_dek' ? 'legend' : (id === 'surg_tactical' ? 'epic' : 'rare'),
    surg: SURGERIES[id] ? id : 'surg_simple', n: 1,
    note: S.sec + 's 读条 · 治一项',
  };
}
/* ── 局内掉落改成「实体子弹 + 实体护甲」──
   子弹不再是「备弹 ×N 匣」这种抽象物：每一批都带口径、弹级（1-6）和发数，
   捡到手就是弹挂 / 口袋 / 背包里的一个真弹药格。
   弹级只在该口径实际存在的级别里抽（9×19 最高 4 级紫弹、7.62×51 从 3 级起步），
   机密 / 绝密整体往高级偏。 */
const AMMO_TIER_Q = ['supply', 'supply', 'common', 'rare', 'epic', 'legend', 'myth', 'myth'];
const ARMOR_TIER_Q = ['supply', 'common', 'common', 'rare', 'epic', 'legend', 'myth'];

function rollBulletLv(cal) {
  const hi = isSecret();
  const base = hi ? [9, 13, 18, 21, 21, 18] : [30, 24, 18, 13, 8, 4];
  const table = [];
  for (let lv = 1; lv <= 6; lv++) if (calHasTier(cal, lv)) table.push([lv, base[lv - 1]]);
  if (!table.length) return Math.max(1, defaultTierOf(cal));
  return pickWeighted(table);
}
function makeBulletItem(cal, lv, n) {
  const C = CALIBERS[cal] || CALIBERS['919'];
  const T = ammoTier(lv);
  const cnt = Math.max(1, Math.round(n));
  return {
    kind: 'bullet', cal, lv, n: cnt,
    icon: '弹', name: C.short + ' ' + T.name, val: '×' + cnt + ' 发',
    color: T.color, tier: AMMO_TIER_Q[lv] || 'common',
    note: T.grade + ' · ' + penTableText(lv),
  };
}
/* 一批子弹：口径随机、弹级随机、发数半盒到一盒出头，且不超一格上限 */
function rollBulletDrop(mul) {
  const cal = pick(CAL_ORDER);
  const lv = rollBulletLv(cal);
  const cap = ammoCellCap(cal, ownedMapLive());
  const box = (CALIBERS[cal] && CALIBERS[cal].box) || 20;
  const n = clamp(Math.round(box * (0.45 + Math.random() * 0.75) * (mul || 1)), 6, cap);
  return makeBulletItem(cal, lv, n);
}

/* 护甲件：3-6 级各出几件具名甲，越往后越稀罕（绝密 / 高波次往上偏），耐久是「被人用过」的样子 */
function rollArmorLv(bob) {
  const wave = G.reinforceWave || 0;
  const hi = isSecret() ? 1 : 0;
  const b = bob || 0;
  return pickWeighted([
    [3, Math.max(6, 40 - wave * 5 - hi * 12 - b * 14)],
    [4, (16 + wave * 2.4 + hi * 7) * (1 + b * 0.5)],
    [5, (7 + wave * 1.6 + hi * 7) * (1 + b * 0.7)],
    [6, (2.2 + wave * 0.9 + hi * 5) * (1 + b * 1.0)],
  ]);
}
function makeArmorItem(id, hp, max) {
  const A = ARMORS[id] || ARMORS[1];
  const m = Math.max(1, Math.round(max || A.hp));
  const h = clamp(Math.round(hp == null ? m : hp), 0, m);
  return {
    kind: 'armor', id: A.id, lv: A.lv, hp: h, max: m,
    icon: '⛨', name: A.name, val: h + '/' + m,
    color: armorLvColor(A.lv), tier: ARMOR_TIER_Q[A.lv] || 'epic',
    note: A.lv + ' 级 · 瞄-' + Math.round(A.aim * 100) + '% 移-' + Math.round(A.move * 100) + '% · 损耗 ' + A.lossName,
  };
}
function rollArmorDrop(bob) {
  const id = rollArmorId(rollArmorLv(bob));
  const A = ARMORS[id];
  const max = A.hp;
  return makeArmorItem(id, Math.max(1, Math.round(max * (0.45 + Math.random() * 0.55))), max);
}

function makeWeaponItem(wk) {
  const owned = !!P.owned[wk];
  return {
    kind: 'weapon', icon: '枪', name: WEAPONS[wk].short,
    val: owned ? '补 弹' : '缴 获',
    color: '#c9a3ff', weapon: wk, tier: 'rare',
  };
}
/* 抽一把枪：优先抽还没有的，让武器箱真的能开图鉴。
   最便宜的入门枪 G17 只在军火库卖，不进空投池，免得开箱开出个便宜货。 */
function pickGun(preferNew) {
  const all = WEAPON_ORDER.filter(k => k !== BASE_WEAPON);
  if (preferNew && Math.random() < 0.68) {
    const pool = all.filter(k => !P.owned[k]);
    if (pool.length) return pick(pool);
  }
  return pick(all);
}
/* 抽一件弹挂 / 背包：越贵越难出（基础款遍地走，红背包看缘分） */
function pickGear() {
  const keys = Object.keys(GEAR);
  return pickWeighted(keys.map(k => [k, Math.max(0.15, 7000 / GEAR[k].price)]));
}
function makeGearItem(key) {
  const g = GEAR[key];
  return {
    kind: 'gear', gear: key, icon: g.kind === 'rig' ? '▤' : '▩',
    name: g.name, val: g.cap + ' 格', color: g.color || '#ffb08a', tier: 'rare',
    note: (g.kind === 'rig' ? '弹挂 · 快捷可用 · ' : '背包 · Tab 倒腾 · ') + g.cap + ' 格' +
      (g.blocks ? '（隔舱 ' + blkSizesText(g.blocks) + '）' : '') +
      (g.ads ? ' · 瞄准速度 ' + g.ads + '%' : '') + (g.spd ? ' · 移动速度 ' + g.spd + '%' : '') + ' · 拿起直接换穿',
  };
}

function rollContainerKind() {
  return pickWeighted(CONTAINER_IDS.map(k => [k, CONTAINERS[k].weight]));
}

/* 按容器种类装货 */
function rollContainer(kind) {
  const C = containerOf(kind);
  const wave = G.reinforceWave || 0;
  const items = [];
  const addRelic = (bob) => items.push(makeRelicItem(rollRelicOf(pickWeighted(relicWeights(bob)))));
  const addMod = (bob) => { const mid = rollModOf(pickWeighted(modWeights(bob))); if (mid) items.push(makeModItem(mid)); };

  switch (C.id) {
    /* 补给箱：什么都有一点，什么都不多 */
    case 'crate': {
      for (let i = 0; i < randInt(C.n[0], C.n[1]); i++) addRelic(0);
      if (Math.random() < 0.35) addRelic(0);
      if (Math.random() < 0.40) items.push(makeMedItem(rollMedDropId(false)));
      if (Math.random() < 0.14) items.push(makeStopItem('bandage'));
      if (Math.random() < (lootTable() ? lootTable().gunChance : 0.20)) items.push(makeWeaponItem(pickGun(false)));
      if (Math.random() < 0.16) items.push(rollBulletDrop());
      if (Math.random() < 0.30) addMod(0);
      if (Math.random() < 0.08 + wave * 0.04) addMod(0.4);
      if (Math.random() < (isSecret() ? 0.11 : 0.06)) items.push(rollArmorDrop(0));
      if (Math.random() < 0.05) items.push(makeGearItem(pickGear()));
      break;
    }
    /* 弹药箱：整箱子弹 —— 口径与弹级都随机，偶尔压着一件护甲 */
    case 'ammo': {
      const rows = randInt(C.n[0], C.n[1]);
      for (let i = 0; i < rows; i++) items.push(rollBulletDrop(i === 0 ? 1.25 : 0.9));
      if (Math.random() < (isSecret() ? 0.16 : 0.08)) items.push(rollArmorDrop(0));
      if (Math.random() < 0.10) items.push(makeMedItem(rollMedDropId(false)));
      break;
    }
    /* 医疗箱：一箱药，偶尔压着一件货 */
    case 'med': {
      for (let i = 0, r = randInt(2, 3); i < r; i++) items.push(makeMedItem(rollMedDropId(false)));
      if (Math.random() < 0.30) items.push(makeMedItem(rollMedDropId(true)));   // 压箱底的好货
      /* 医疗箱也是止血件和手术包的主要来源 —— 打崩了就地能找东西处理 */
      if (Math.random() < 0.50) items.push(makeStopItem(stopDropId()));
      if (Math.random() < 0.16) {
        const r = Math.random();
        items.push(makeSurgItem(r < 0.74 ? 'surg_simple' : (r < 0.96 ? 'surg_tactical' : 'surg_dek')));
      }
      if (Math.random() < 0.26) addRelic(-0.35);
      if (Math.random() < 0.10) items.push(rollBulletDrop(0.7));
      break;
    }
    /* 工具箱：改枪配件的家 */
    case 'tool': {
      const extra = isSecret() ? 1 : 0;
      for (let i = 0; i < randInt(C.n[0], C.n[1]) + extra; i++) addMod(0.55);
      if (Math.random() < 0.42) addMod(0.9);
      if (Math.random() < 0.28) addRelic(-0.5);
      break;
    }
    /* 武器箱：必出一把枪，配件的可能性也高，护甲也比别处多 */
    case 'weapon': {
      items.push(makeWeaponItem(pickGun(true)));
      if (Math.random() < (lootTable() ? lootTable().weaponModChance : 0.45)) addMod(0.7);
      if (Math.random() < 0.30) items.push(rollBulletDrop(1.1));
      if (Math.random() < 0.15) items.push(makeMedItem(rollMedDropId(false)));
      if (Math.random() < (isSecret() ? 0.32 : 0.20)) items.push(rollArmorDrop(0.6));
      if (Math.random() < 0.10) items.push(makeGearItem(pickGear()));
      break;
    }
    /* 保险柜：慢得离谱，但品质卷得最高 */
    case 'safe': {
      for (let i = 0; i < randInt(C.n[0], C.n[1]); i++) addRelic(1.4);
      if (Math.random() < (lootTable() ? lootTable().safeExtraChance : 0.50)) addRelic(1.4);
      if (Math.random() < (lootTable() ? lootTable().safeModChance : 0.30)) addMod(1.2);
      if (Math.random() < 0.14) items.push(rollBulletDrop(1.1));
      break;
    }
    default: {
      addRelic(0);
    }
  }
  // 一箱最多七行，别把面板撑到屏幕外；要砍先砍药和雷，别把枪和配件挤掉
  let maxRows = 7;
  while (items.length > maxRows) {
    let cut = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === 'med') { cut = i; break; }
    }
    if (cut < 0) cut = items.length - 1;
    items.splice(cut, 1);
  }
  return items;
}

/* 在某个品质里随机挑一件配件；只挑当前地图产地的货，这一档没有就往下降一级 */
function rollModOf(q) {
  const z = lootZone();
  const order = ['legend', 'epic', 'rare', 'common'];
  let i = order.indexOf(q);
  if (i < 0) i = order.length - 1;
  for (; i < order.length; i++) {
    const pool = Object.keys(MODS).filter(id => MODS[id].q === order[i] && (!MODS[id].z || MODS[id].z === z));
    if (pool.length) return pick(pool);
  }
  /* 兜底：本地没有就放宽产地限制（避免面板开天窗） */
  for (; i >= 0 && i < order.length; i++) {
    const pool = Object.keys(MODS).filter(id => MODS[id].q === order[i]);
    if (pool.length) return pick(pool);
  }
  return null;
}

/* 配件 → 战利品面板行 */
function makeModItem(id) {
  const m = MODS[id];
  const Q = QUALITY[m.q];
  const slot = MOD_SLOTS.find(s => s.id === m.slot);
  return {
    kind: 'mod', mod: id, q: m.q,
    icon: m.icon, name: m.name,
    val: slot ? slot.cn : '配件', color: Q.color, tier: m.q,
  };
}

/* 按权重表抽一个品质 */
function pickWeighted(table) {
  let total = 0;
  for (const t of table) total += t[1];
  let r = Math.random() * total;
  for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
  return table[table.length - 1][0];
}

/* 在某个品质里随机挑一件收集品（只挑当前地图的产地货）。
   池内按 RELIC_RARITY 物品稀有度加权：没写的默认 1，
   超稀有（非洲之心 / 海洋之泪）压到 0.25 —— 同档里份额只有别的红件的四分之一。 */
function rollRelicOf(q) {
  const z = lootZone();
  let pool = RELIC_IDS.filter(id => RELICS[id].q === q && (!RELICS[id].z || RELICS[id].z === z));
  if (!pool.length) pool = RELIC_IDS.filter(id => RELICS[id].q === q);   // 兜底
  if (!pool.length) return 'shell';
  return pickWeighted(pool.map(id => [id, RELIC_RARITY[id] || 1]));
}

/* 收集品 → 战利品面板行 */
function makeRelicItem(id) {
  const r = RELICS[id];
  const Q = QUALITY[r.q];
  return {
    kind: 'relic', id, q: r.q,
    icon: r.icon, name: r.name,
    val: '¥' + fmtMoney(r.price), color: Q.color,
    price: r.price, tier: r.q,
  };
}

/* 局内收集品：必须占一格（背包优先，没有空位就拿不走）。
   G.relics / lootValue 都是格子派生的（recountLoot），不单独记账。 */
function addRelic(id, n) {
  let placed = 0;
  for (let k = 0; k < (n || 1); k++) {
    if (!stowCell({ t: 'relic', id })) break;
    placed++;
  }
  recountLoot();
  return placed;
}

/* 从随身格子里重算收集品清单和价值 —— 拖动 / 丢弃 / 拾取之后都要调 */
function recountLoot() {
  const agg = {};
  for (const arr of allCarryZones()) {
    for (const c of arr) if (c && c.t === 'relic') agg[c.id] = (agg[c.id] | 0) + 1;
  }
  G.relics = Object.keys(agg).map(id => ({ id, n: agg[id] }));
  let v = 0;
  for (const it of G.relics) v += (RELICS[it.id] ? RELICS[it.id].price : 0) * it.n;
  G.lootValue = v;
}

function relicCount() {
  let n = 0;
  for (const arr of allCarryZones()) for (const c of arr) if (c && c.t === 'relic') n++;
  return n;
}

/* 局内捡到的配件：现在也是格子物品，从随身格子里读 */
function foundModIds() {
  const out = [];
  for (const arr of allCarryZones()) for (const c of arr) if (c && c.t === 'mod') out.push(c.id);
  return out;
}

/* 局内捡到的弹匣：加给手里的枪（空手就转给背包里别的枪）。
   局内捡的弹不挑级，就跟枪上现在装的那种同款。 */
function addAmmo(mags) {
  let w = P.weapon;
  if (!P.ammo[w]) {
    w = WEAPON_ORDER.find(k => k !== P.weapon && P.owned[k] && P.ammo[k]) || null;
  }
  if (!w) return 0;
  const n = weaponStats(w).mag * mags;
  return addReserve(calOfWeapon(w), n, P.ammo[w] ? P.ammo[w].tier : null);
}

/* 翻到某一件时才真正入账 —— 一律占格子：背包 → 弹挂 → 口袋。
   返回 false = 这件带不走（身上没有空位）—— 它会被留在箱子里，下次还能拿。 */
function applyLootItem(it, c) {
  let ok = true;
  if (it.kind === 'relic') {
    if (stowCell({ t: 'relic', id: it.id })) recountLoot();
    else { const s = relicShape(it.id); ok = false; it.blocked = '占 ' + s[0] + '×' + s[1] + ' · 身上塞不下'; }
  }
  else if (it.kind === 'med') {
    let placed = 0;
    if (it.left !== undefined) {               // 搜装备搜出来的：保剩余耐久
      const slot = stowCell({ t: 'med', id: it.med || STARTER_MEDKIT, left: clamp(Math.round(it.left), 1, MEDKITS[it.med].dur) });
      if (slot) { placed = 1; recountLoot(); }
    }
    if (!placed && addMed(it.med || STARTER_MEDKIT, it.n || 1) <= 0) { ok = false; it.blocked = '身上没有空位'; }
  }
  else if (it.kind === 'repair') {
    const slot = stowCell({ t: 'repair', id: it.repair, left: clamp(Math.round(it.left), 1, REPAIRS[it.repair].dur) });
    if (slot) recountLoot();
    else { ok = false; it.blocked = '身上没有空位'; }
  }
  else if (it.kind === 'stop') {
    if (addStop(it.stop || 'bandage', it.n || 1) <= 0) { ok = false; it.blocked = '身上没有空位'; }
  }
  else if (it.kind === 'surg') {
    let placed = 0;
    if (it.uses !== undefined) {               // 保剩余次数
      const slot = stowCell({ t: 'surg', id: it.surg || SURG_ORDER[0], uses: clamp(it.uses | 0, 1, SURGERIES[it.surg].uses) });
      if (slot) { placed = 1; recountLoot(); }
    }
    const got = placed ? 1 : addSurg(it.surg || SURG_ORDER[0], it.n || 1);
    if (got <= 0) { ok = false; it.blocked = '身上没有空位'; }
  }
  else if (it.kind === 'bullet') {
    /* 实体子弹：按弹级找同款格子堆叠，装不下就开新格（弹挂 / 口袋 / 背包都收） */
    const got = addReserve(it.cal, it.n, it.lv);
    it.got = got;                       // 只用于飘字
    if (got <= 0) { ok = false; it.blocked = '身上没有空位'; }
  }
  else if (it.kind === 'armor') {
    /* 护甲是重物：优先进背包格；背包满了直接换穿（身上那件掉在脚边） */
    const cell = { t: 'armor', id: it.id, hp: it.hp, max: it.max };
    if (stowCell(cell)) recountLoot();
    else if (!swapWearArmor(cell)) { ok = false; it.blocked = '背包没有空位'; }
  }
  else if (it.kind === 'weapon') {
    const w = it.weapon;
    const WS = weaponStats(w);
    const isP = !!PISTOL_IDS[w];
    if (!P.slots) P.slots = { primary: null, secondary: null, pistol: null };
    const spots = isP ? ['pistol'] : ['primary', 'secondary'];
    const freeSlot = spots.find(k => !P.slots || !P.slots[k]);
    const cellSlot = freeSlot ? null : stowCell({ t: 'gun', id: w });
    const swapped = !freeSlot && !cellSlot;
    /* 槽和背包都满：和手上这把换（旧枪掉脚边），不再「带不走」卡在箱里 */
    if (swapped && !groundGunTake({ id: w }, c ? c.x : P.x, c ? c.y : P.y)) { ok = false; it.blocked = '武器槽和背包都满了'; }
    else if (!swapped) {
      const cal = calOfWeapon(w);
      if (!P.owned[w]) {
        P.owned[w] = true;
        P.ammo[w] = { mag: WS.mag, tier: ammoPickOf(cal), cal };
      }
      if (!it.own) P.gunLoot[w] = (P.gunLoot[w] | 0) + 1;   // 箱里的都是缴获：撤离按实例入库（自己存的枪取回不算）
      if (freeSlot) {
        P.slots[freeSlot] = w;
        const sd = SLOT_DEFS.find(d => d.id === freeSlot);
        uiToast('拾取 ' + WS.short + ' · 装入' + (sd ? sd.cn : '武器槽'), 'small');
      } else {
        uiToast('拾取 ' + WS.short + ' · 收进背包', 'small');
      }
      /* 缴获的枪自带两个弹匣的子弹（能装多少装多少）；自己存的枪不给白送弹药 */
      if (!it.own) addReserve(cal, WS.mag * 2, P.ammo[w].tier);
    }
  } else if (it.kind === 'gear') {
    const incoming = it.__cell && it.__cell.cells ? it.__cell.cells : undefined;
    if (!wearGearInRaid(it.gear, !it.own, incoming)) { ok = false; it.blocked = '这件装备穿不上'; }
  } else if (it.kind === 'mod') {
    if (stowCell({ t: 'mod', id: it.mod })) recountLoot();
    else { ok = false; it.blocked = '身上没有空位'; }
  }
  if (c) {
    const txt = !ok
      ? (it.name + ' · ' + it.blocked + '，留在箱里')
      : (it.got !== undefined
        ? (it.got > 0 ? it.name + ' +' + it.got + (it.kind === 'bullet' ? ' 发' : '') : it.name + ' 无枪可用')
        : it.name + ' ' + it.val);
    popup(c.x, c.y - 26, txt, ok ? it.color : '#ff6b8a', 14);
    burst(c.x + rand(-12, 12), c.y + rand(-8, 8), 4, {
      color: ok ? [it.color, '#ffffff'] : ['#ff6b8a', '#ffffff'], life: 0.4, r: 2.5, spdMin: 30, spdMax: 130, glow: true,
    });
  }
  return ok;
}

/* 箱子第一次被翻开时才掷骰子，之后一直记着里面有什么 ——
   「没拿走的东西」会留在原地，可以回来接着拿。 */
function crateItems(c) {
  if (!c.items) {
    c.items = rollContainer(containerOf(c.kind).id);
    for (const it of c.items) { it.taken = false; it.blocked = ''; }
  }
  return c.items;
}
/* 还没拿到手的件数。没搜过的箱子按「不知道几件」处理，返回 0 */
function crateLeft(c) {
  if (!c || !c.items) return 0;
  let n = 0;
  for (const it of c.items) if (!it.taken) n++;
  return n;
}

/* 地上弹挂 / 背包搜索用：把里面的一格东西转成面板行；__cell 原样带着，收面板时写回去 */
function cellToLootItem(c) {
  let it = null;
  if (c.t === 'med') {
    it = makeMedItem(c.id, 1);
    it.left = c.left;
    const l = Math.round(c.left);
    if (l < MEDKITS[c.id].dur - 0.5) it.val = '剩 ' + l + '/' + MEDKITS[c.id].dur;
  }
  else if (c.t === 'repair') {
    const R = REPAIRS[c.id];
    it = { kind: 'repair', repair: c.id, left: c.left, icon: '修', name: R.short,
           val: '剩 ' + Math.round(c.left) + '/' + R.dur, color: R.color, tier: 'supply',
           note: '修 ' + R.capLv + ' 级以内护甲' };
  }
  else if (c.t === 'stop') it = makeStopItem(c.id);
  else if (c.t === 'surg') {
    it = makeSurgItem(c.id);
    it.uses = c.uses;
    it.val = '剩 ' + (c.uses | 0) + ' 次';
  }
  else if (c.t === 'ammo') it = makeBulletItem(c.cal, c.lv, c.n | 0);
  else if (c.t === 'gun') it = makeWeaponItem(c.id);
  else if (c.t === 'armor') it = makeArmorItem(c.id, c.hp, c.max);
  else if (c.t === 'relic') it = makeRelicItem(c.id);
  else if (c.t === 'mod') it = makeModItem(c.id);
  else if (c.t === 'gear' && GEAR[c.key]) {
    const g = GEAR[c.key];
    it = { kind: 'gear', gear: c.key, name: g.name, icon: g.kind === 'rig' ? '弹' : '背',
           color: g.color || '#ffb08a', tier: 'common',
           val: g.kind === 'rig' ? '弹挂' : '背包' };
  }
  if (it) it.__cell = c;
  return it;
}

/* H：搜索地上的一件弹挂 / 背包（里面的东西翻出来拿；不拿的还留在装备里） */
function gearSearchInteract() {
  if (G.scene !== 'playing' || G.lootPanel) return false;
  let best = null, bd = 1e9;
  for (const p of G.pickups) {
    if (!p.cell || p.cell.t !== 'gear') continue;
    const d = dist(P.x, P.y, p.x, p.y);
    if (d < LOOT_RANGE && d < bd) { best = p; bd = d; }
  }
  if (!best) return false;
  const g = GEAR[best.cell.key];
  const items = [];
  (best.cell.cells || []).forEach((c, idx) => {    // 占位格不是东西，跳过；head 带着原下标
    if (!c || c.cont) return;
    const it = cellToLootItem(c);
    if (it) { it.__cell = c; it.__cellIdx = idx; items.push(it); }
  });
  if (!items.length) { uiToast(g.name + ' · 里面是空的', 'small'); return true; }
  const total = layoutLoot(items, 0.8);
  G.lootPanel = { items, t: 0, shown: 0, taken: 0, closeT: 0, crate: best, total,
    col: { name: g.name, en: 'SEARCH ' + (g.kind === 'rig' ? 'RIG' : 'PACK'), color: g.color || '#ffb08a', dim: 'rgba(255,176,138,' },
    again: true, sel: 0, gear: best };
  popup(best.x, best.y - 40, '搜 ' + g.name, g.color || '#ffb08a', 12);
  Sfx.loot();
  return true;
}

/* 地上掉落 → 搜索面板的一行；__pickup 原样带着，选中拾取时找回实体 */
function pickupToLootItem(p) {
  let it = null;
  if (p.kind === 'cell' && p.cell) it = cellToLootItem(p.cell);
  else if (p.kind === 'medkit') {
    it = makeMedItem('bandage', 1);
    it.name = '医疗物资';
    it.val = '开出来随机';
  }
  else if (p.kind === 'ammo') {
    const cal = P.weapon ? calOfWeapon(P.weapon) : '919';
    it = makeBulletItem(cal, p.value || 1, 1);
    it.name = '弹药补给';
    it.val = '按身上枪的口径';
    it.n = 0;
  }
  else if (p.kind === 'relic' && p.relicId && RELICS[p.relicId]) it = makeRelicItem(p.relicId);
  if (it) it.__pickup = p;
  return it;
}

/* H：把周围叠在一起的掉落全部列进搜索面板 ——
   滚轮 / 点选挑一件，按 F 捡走选中的那件；没拿的留在地上 */
function pileSearchInteract() {
  if (G.scene !== 'playing' || G.lootPanel) return false;
  const near = [];
  for (const p of G.pickups) {
    const d = dist(P.x, P.y, p.x, p.y);
    if (d <= 120) near.push({ p, d });
  }
  if (near.length < 2) return false;        // 只有一件直接 F 就行，不开面板
  near.sort((a, b) => a.d - b.d);           // 最近的排最前
  const items = near.map(o => pickupToLootItem(o.p)).filter(Boolean);
  if (!items.length) return false;
  const total = layoutLoot(items, 0);       // 空地上的东西不用「搜」：面板一开全部直接可拿
  G.lootPanel = { items, t: 0, shown: 0, taken: 0, closeT: 0, crate: near[0].p, total,
    col: { name: '地面物资', en: 'GROUND PILE', color: '#8ef2ff', dim: 'rgba(142,242,255,' },
    again: true, sel: 0, pile: true };
  popup(near[0].p.x, near[0].p.y - 40, '搜 地面物资 ×' + items.length, '#8ef2ff', 12);
  Sfx.loot();
  return true;
}

/* H 键：搜地上装备 / 搜地面物资堆；都没有则不接管 */
function searchKeyH() {
  if (G.scene !== 'playing' || G.lootPanel) return false;
  if (gearSearchInteract()) return true;    // 弹挂 / 背包优先
  return pileSearchInteract();
}

function startLoot(c) {
  if (!c || G.lootPanel) return false;
  const C = containerOf(c.kind);
  const left = crateItems(c).filter(it => !it.taken);
  const wasOpened = !!c.opened;
  c.opened = true;
  c.hover = 1;
  /* 已搜空的容器：当储物箱再打开 —— 面板左栏照常，右栏空格可以收身上的东西 */
  if (!left.length) {
    G.lootPanel = { items: [], t: 0, shown: 0, taken: 0, closeT: 0, crate: c, total: 0, col: C, again: true, sel: 0, store: true };
    popup(c.x, c.y - 40, C.name + ' · 已搜空', C.color, 12);
    uiToast('已搜空 · 把身上的东西拖进右边格子存放', 'small');
    Sfx.loot();
    return true;
  }

  const again = wasOpened;               // 第二次翻：不再重掷、不再吵到敌人
  for (const it of left) it.blocked = '';
  const total = layoutLootResumed(left, C.speed);   // 翻出来过的秒开，没翻过的照常等
  G.lootPanel = { items: left, t: 0, shown: 0, taken: 0, closeT: 0, crate: c, total, col: C, again, sel: Math.max(0, left.findIndex(it => !it.taken)) };
  Sfx.loot();

  if (again) {
    const allOwn = left.every(it => it.own);
    popup(c.x, c.y - 40, allOwn ? '存着 ' + left.length + ' 件 · 取回或继续存放' : '接着翻 · 还剩 ' + left.length + ' 件', C.color, 12);
    return true;
  }
  burst(c.x, c.y, 18, { color: [C.color, '#ffffff', C.color], life: 0.6, r: 4, spdMin: 40, spdMax: 240, glow: true });
  // 铁柜、军械箱开起来是有动静的：附近的敌人会过来看看
  if (C.loud) emitNoise(c.x, c.y, C.loud, 0.34, true);
  if (C.speed > 1.2) popup(c.x, c.y - 40, C.loud ? C.name + ' · 翻得慢、动静大' : C.name + ' · 翻找较慢', C.color, 12);
  return true;
}

function updateLootPanel(dt) {
  const L = G.lootPanel;
  if (!L) return;
  /* 动了就收手：面板开着时按移动键 = 立刻收面板（不用等走出范围） */
  if (keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
      keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright']) {
    closeLootPanel();
    return;
  }
  L.t += dt;

  // 逐件翻牌只负责「看清是什么」：翻出来的不会自动进包 —— 滚轮选中、按 F 自己拿
  let shown = 0, started = 0;
  for (const it of L.items) {
    if (L.t >= it.at) started++;                        // 剪影进入扫描态也要重绘
    if (L.t >= it.ready) { shown++; it.seen = true; }   // 翻出来 = 看过了：下次搜这箱它秒开
  }
  L.shown = shown;

  // 全拿光 → 稍停收面板（存过东西的箱子不自动收：还要留着存放 / 取回）
  if (L.items.length && !L.deposited && L.taken >= L.items.length) {
    L.closeT += dt;
    if (L.closeT > 0.7) closeLootPanel();
  }

  // 走开就收手：没拿的留在箱子里，回来还能接着翻
  if (dist(P.x, P.y, L.crate.x, L.crate.y) > 160) closeLootPanel();
  if (!G.lootPanel) return;                        // 上面可能已经收面板了

  /* 界面：第一次进来就亮出来；翻出进度 / 拿走 / 选中变了才重排，不然每帧重绘太费 */
  const ui = $('loot');
  if (ui && ui.classList.contains('hidden')) { ui.classList.remove('hidden'); L.__sig = null; }
  const sig = L.items.length + '|' + L.taken + '|' + L.shown + '|' + L.sel + '|' + started;
  if (sig !== L.__sig) { L.__sig = sig; lootRender(); }
}

/* 滚轮 / 拿完自动跳用：把选中项挪到下一件「已翻出且还没收走」的东西上 */
function lootSelMove(dir) {
  const L = G.lootPanel;
  if (!L) return;
  const n = L.items.length;
  for (let s = 1; s <= n; s++) {
    const i = (L.sel + dir * s + n * 4) % n;
    const it = L.items[i];
    if (!it.taken && L.t >= it.ready) { L.sel = i; return; }
  }
}

/* F：把选中的那件收进身上。返回是否拿到 */
function lootPickSelected() {
  const L = G.lootPanel;
  if (!L) return false;
  const it = L.items[L.sel];
  if (!it || it.taken || L.t < it.ready) return false;
  const hi0 = it.tier === 'myth' || it.tier === 'legend' || it.tier === 'epic';
  const pickOk = () => {
    Sfx.tone(620 + L.sel * 70 + (hi0 ? 220 : 0), 0.06, hi0 ? 0.11 : 0.07, 'square');
    if (hi0) shake(it.tier === 'myth' ? 4.5 : (it.tier === 'legend' ? 3 : 1.5));
  };
  /* 地面物资堆：面板行对应地上一件实体 —— 收纳 / 换穿 / 空槽装枪全走 collectPickup */
  if (L.pile) {
    const pk = it.__pickup;
    const idx = pk ? G.pickups.indexOf(pk) : -1;
    if (idx < 0) {                            // 实体已经不在地上（被别的途径拿走）：行直接勾掉
      it.taken = true; L.taken++; lootSelMove(1); return true;
    }
    if (!collectPickup(pk)) {
      pk.cool = 1.2;                          // 没空位：进冷却，行上标「带不走」
      it.blocked = '带不走';
      Sfx.tone(200, 0.09, 0.05, 'square');
      return false;
    }
    G.pickups.splice(idx, 1);
    it.taken = true; L.taken++;
    pickOk();
    lootSelMove(1);
    return true;
  }
  if (applyLootItem(it, L.crate) === false) {
    Sfx.tone(200, 0.09, 0.05, 'square');
    uiToast(it.blocked || (it.name + ' 带不走'), 'small warn');
    return false;
  }
  it.taken = true;
  L.taken++;
  pickOk();
  lootSelMove(1);
  return true;
}

/* 收面板：拿走的已经进包，没拿的留在箱子里（回来按 F 接着翻） */
function closeLootPanel() {
  const L = G.lootPanel;
  if (!L) return;
  const crate = L.crate;
  if (L.gear) {                                   // 搜装备：拿走的从装备里整块抠掉，没拿的原样留着
    const cells = L.gear.cell.cells || [];
    for (const it of L.items) {
      if (!it.taken || it.__cellIdx == null) continue;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (c && (k === it.__cellIdx || (c.cont && c.head === it.__cellIdx))) cells[k] = null;
      }
    }
    sanitizeSpans(cells);
  }
  G.lootPanel = null;
  const lui = $('loot');
  if (lui) lui.classList.add('hidden');
  if (PK_DRAG.active) pkFinishDrag(null);          // 拖着东西时面板被关：先把手上的放回去
  const chip = $('pkHeldChip');
  if (chip) chip.classList.add('hidden');
  if (crate) {
    const left = crateLeft(crate);
    if (left > 0) uiToast(L.deposited ? '箱里存着 ' + left + ' 件 · 回来按 F 打开取回' : '箱里还剩 ' + left + ' 件 · 回来按 F 接着翻', 'small');
  }
}

/* ══════════════════════════════════════════════════════════
   搜刮容器界面（HTML · 左边随身容器 · 右边容器格子）
   ──────────────────────────────────────────────────────────
   还没翻出来的东西不画形状、也拿不走（只报「还有 N 件」）；
   翻出来的按真实占格摆进容器格子。按住拖到左边格子松手入包，
   松在右边 = 取消，东西还留在容器里。按 F 收下选中的那件。
   ══════════════════════════════════════════════════════════ */
const LOOT_BOX_COLS = 5;
const LOOT_BOX_ROWS = 8;                 // 存放容量：右栏 5×8 格，塞不下就拒绝

/* 手上这件能不能塞进箱子（按 lootBoxLayout 同款 first-fit 模拟一遍占位） */
function lootBoxFits(cell) {
  const L = G.lootPanel;
  if (!L || !cell) return false;
  const cols = LOOT_BOX_COLS;
  const occ = new Array(cols * LOOT_BOX_ROWS).fill(0);
  const tryPlace = (w, h) => {
    for (let i = 0; i < occ.length; i++) {
      if (i % cols + w > cols) continue;
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++)
        for (let dx = 0; dx < w; dx++) if (occ[i + dy * cols + dx]) { ok = false; break; }
      if (ok) {
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          const j = i + dy * cols + dx;
          if (j < occ.length) occ[j] = 1;
        }
        return true;
      }
    }
    return false;
  };
  for (const it of L.items) {
    if (it.taken) continue;
    const c2 = lootItemCell(it);
    const s = c2 ? shapeOf(c2, cols) : [1, 1];
    if (!tryPlace(s[0], s[1])) return false;
  }
  const sh = shapeOf(cell, cols);
  return tryPlace(sh[0], sh[1]);
}

/* 右栏容器格的放置回调：手上的东西松手 = 存进箱子。
   自己存的东西记 own 标记 —— 取回时不计缴获台账、不给白送弹药。 */
function lootDepositPlace() {
  const L = G.lootPanel;
  if (!L || !PK_UI.held) return;
  /* 从容器里拿出来的件松手在容器侧 = 取消，原样回箱（别把它转成自己的存放品） */
  if (PK_UI.fromLoot) return;
  const c = L.crate, held = PK_UI.held;
  const C = containerOf(c.kind);
  const it = cellToLootItem(held);
  if (!it) { uiToast('这件东西存不进箱子', 'small warn'); return; }
  if (!lootBoxFits(held)) {
    uiToast(C.name + ' 放不下了 · 先取回一些再存', 'small warn');
    Sfx.tone(200, 0.09, 0.05, 'square');
    return;
  }
  it.taken = false;
  it.blocked = '';
  it.seen = true;                                // 自己放的：不用翻，直接可见可取
  it.at = 0; it.ready = 0;
  it.own = true;
  it.__cell = held;                              // 原格子对象带着（装备内容 / 耐久都在里面）
  c.items.push(it);
  L.items.push(it);
  L.deposited = true;
  L.sel = L.items.length - 1;
  PK_UI.held = null;
  popup(c.x, c.y - 26, '存入 ' + cellName(held), '#8ef2b0', 14);
  Sfx.tone(520, 0.05, 0.05, 'square');
  if (!L.storeWarned) {
    L.storeWarned = true;
    uiToast('箱子只是临时仓库 · 撤离时里面的东西不会带走', 'small warn');
  }
  lootRender();
}

/* 容器里一件东西的实体格子（没有实体形状的堆叠品返回 null） */
function lootItemCell(it) {
  if (!it) return null;
  if (it.__cell) return it.__cell;
  if (it.kind === 'relic' && RELICS[it.id]) return { t: 'relic', id: it.id };
  if (it.kind === 'armor') return { t: 'armor', id: it.id, hp: it.hp, max: it.max };
  if (it.kind === 'weapon') return { t: 'gun', id: it.weapon };
  if (it.kind === 'mod' && MODS[it.mod]) return { t: 'mod', id: it.mod };
  if (it.kind === 'bullet') return { t: 'ammo', cal: it.cal, lv: it.lv | 0 || 1, n: Math.max(1, it.n | 0) };
  if (it.kind === 'gear' && GEAR[it.gear]) return { t: 'gear', key: it.gear, cells: [] };
  if (it.kind === 'surg' && it.surg) return { t: 'surg', id: it.surg, uses: it.uses };
  if (it.kind === 'repair' && it.repair) return { t: 'repair', id: it.repair, left: it.left };
  if (it.kind === 'med' && it.med && it.left !== undefined) return { t: 'med', id: it.med, left: it.left };
  return null;                    // 纯数量堆叠品（绷带 / 散装弹 / 药）：没有实体形状，按 1×1 摆
}

/* 容器装箱：翻出来的摆实物；没翻出的摆剪影（真实占格 + ? + 尺寸提示，不给名字） */
function lootBoxLayout(L) {
  const cols = LOOT_BOX_COLS;
  const list = [];
  let pend = 0;
  for (const it of L.items) {
    if (it.taken) continue;
    const cell = lootItemCell(it);
    const sh = cell ? shapeOf(cell, cols) : [1, 1];
    if (L.t < it.ready) { pend++; list.push({ it, cell, w: sh[0], h: sh[1], pending: true }); continue; }
    list.push({ it, cell, w: sh[0], h: sh[1] });
  }
  const occ = new Array(cols * 24).fill(0);
  let maxRow = 0;
  for (const e of list) {
    let put = -1;
    for (let i = 0; i < occ.length && put < 0; i++) {
      if (i % cols + e.w > cols) continue;
      let ok = true;
      for (let dy = 0; dy < e.h && ok; dy++) {
        for (let dx = 0; dx < e.w; dx++) if (occ[i + dy * cols + dx]) { ok = false; break; }
      }
      if (ok) put = i;
    }
    if (put < 0) put = 0;                            // 极端兜底：叠在第一格（不会发生，容器最多几件）
    for (let dy = 0; dy < e.h; dy++) {
      for (let dx = 0; dx < e.w; dx++) {
        const j = put + dy * cols + dx;
        if (j < occ.length) occ[j] = 1;
      }
    }
    e.col = put % cols;
    e.row = put / cols | 0;
    maxRow = Math.max(maxRow, e.row + e.h);
  }
  return { list, pend, rows: Math.max(3, maxRow) };
}

/* 从容器里拿起一件：拖到左边格子才算收下，松在别处原样回箱子 */
function lootBoxPick(it) {
  const L = G.lootPanel;
  if (!L || !it || it.taken) return null;
  if (L.t < it.ready) { uiToast('还没翻出来', 'small warn'); return null; }
  if (L.pile) {                                    // 地面物资：底下压着实体，只能走 collectPickup，不能直接塞格
    L.sel = L.items.indexOf(it);
    lootPickSelected();
    return null;
  }
  const cell = lootItemCell(it);
  if (!cell) {
    L.sel = L.items.indexOf(it);
    uiToast(it.name + ' · 按 F 收下（这类东西没有实体格子，拖不动）', 'small warn');
    lootRender();
    return null;
  }
  it.taken = true;
  L.taken++;
  PK_UI.held = cell;
  PK_UI.fromLoot = it;                             // 标记：这件是从容器里拿的（不许顶掉格子里的东西）
  Sfx.tone(500, 0.05, 0.04, 'square');
  lootRender();
  return () => {                                   // 没放出去：回容器原样待着
    /* 条件回退：只有手上还拿着「这件本身」才算拖放失败（放置成功换了别的在手上时，
       这件已经安顿好 —— 回退会把穿好的装备又送回箱子，还会把换下来的旧枪吞掉） */
    if (PK_UI.held === cell) {
      if (it.taken) { it.taken = false; L.taken--; }
      PK_UI.held = null;
      PK_UI.fromLoot = null;
      lootRender();
    }
  };
}

/* 搜刮面板左栏的武器 / 护甲 / 弹挂 / 背包槽：箱里翻出的装备拖上来直接穿。
   装备槽的换穿走 wearGearInRaid —— 缴获台账（gearLoot）跟着记，撤离按实例入库。 */
function lootPlaceGear(kind) {
  return () => {
    if (!PK_UI.held) return;
    if (PK_UI.held.t !== 'gear') { uiToast(kind === 'rig' ? '弹挂槽只能穿弹挂' : '背包槽只能穿背包', 'small warn'); return; }
    const nk = PK_UI.held.key, ng = GEAR[nk];
    if (!ng || ng.kind !== kind) { uiToast('这是' + (GEAR[nk] && GEAR[nk].kind === 'rig' ? '弹挂' : '背包') + '，拖到对应的槽', 'small warn'); return; }
    const isLoot = !!PK_UI.fromLoot && !PK_UI.fromLoot.own;   // 自己存进箱的取回不算缴获
    if (SAVE.worn[kind] === nk && !isLoot) {    // 自己的备用件：别在这儿消耗掉，回背包存着
      uiToast('这件已经穿在身上 · 手上这份拖进背包存放', 'small warn');
      return;
    }
    const incoming = PK_UI.held.cells || [];
    if (!wearGearInRaid(nk, isLoot, incoming)) { uiToast('这件装备穿不上', 'small warn'); return; }
    PK_UI.held = null;
    PK_UI.fromLoot = null;
  };
}

function renderLootEquipSlots() {
  const guns = $('lootGuns');
  if (!guns) return;
  $('lootGunsNote').textContent = '武 器 / 护 甲 槽 · 拖枪装上 · 拖护甲穿上';
  guns.innerHTML = '';
  guns.appendChild(pkBuildArmorSlot(lootRender));
  for (const sl of GUN_SLOTS) guns.appendChild(pkBuildGunSlot(sl, lootRender));
  const gear = $('lootGear');
  if (!gear) return;
  $('lootGearNote').textContent = '弹 挂 / 背 包 槽 · 拖上换穿（里面的东西跟着走）';
  gear.innerHTML = '';
  for (const kind of ['rig', 'pack']) gear.appendChild(pkBuildGearSlot(kind, lootRender, lootPlaceGear(kind)));
}

function lootRender() {
  const L = G.lootPanel;
  const ui = $('loot');
  if (!L || !ui || ui.classList.contains('hidden')) return;

  const left = L.items.filter(it => !it.taken).length;
  const lay = lootBoxLayout(L);
  const canStore = !!(L.crate && !L.pile && !L.gear);   // 真容器（箱子）随时能存放：首次搜刮也可以拖身上的东西进去
  const nm = $('lootName');
  if (nm) nm.textContent = (L.col ? L.col.name : '容 器');
  const st = $('lootStatus');
  if (st) {
    st.textContent = left
      ? ('翻出 ' + (lay.list.length - lay.pend) + ' / ' + left + ' 件 · 已拿 ' + L.taken + (lay.pend ? ' · 还在翻…' : ''))
      : (canStore ? (L.store || L.deposited ? '空 箱 · 可 存 放 物 品' : '已 全 部 收 下 · 可 存 放 物 品') : '已 全 部 收 下');
  }

  /* 左栏：武器 / 护甲 / 弹挂 / 背包槽 —— 箱里翻出的装备拖上来直接穿 */
  renderLootEquipSlots();

  /* 左栏：弹挂 / 口袋 / 背包 —— 拖到这里的格子就放进对应容器（自上而下固定顺序） */
  const zones = [
    ['lootRig', P.rig, 0, '弹 挂 · 快捷可用'],
    ['lootPocket', P.pocket, 1, '口 袋 · 快捷可用'],
    ['lootPack', P.pack, 2, '背 包'],
  ];
  for (const [gid, arr, zone, label] of zones) {
    const g = $(gid);
    if (!g) continue;
    const note = $(gid + 'Note');
    if (note) note.textContent = label + ' · ' + arr.filter(c => c && !c.cont).length + ' 件 / ' + arr.length + ' 格';
    renderCarryZoneGrid(g, arr, zone);
  }

  /* 右栏：容器格子（按真实占格拼） */
  const box = $('lootBox');
  box.__pkPlace = canStore ? lootDepositPlace : null;   // 侧栏兜底目标：缝隙 / 盒边松手也算存入
  box.innerHTML = '';
  if (!lay.list.length) {
    for (let i = 0; i < LOOT_BOX_COLS * 3; i++) {
      const d = document.createElement('div');
      d.className = 'lo-cell bcell empty';
      d.__pkPlace = canStore ? lootDepositPlace : null;   // 空箱也是存放目标：拖进来松手就存
      box.appendChild(d);
    }
  }
  for (const e of lay.list) {
    const el = document.createElement('div');
    if (e.pending) {
      /* 剪影：还没翻出来的东西按真实占格画虚线幽灵格 —— ? + 几×几，翻出哪件哪件变实物 */
      const scanning = L.t >= e.it.at;             // 已经开始翻这件：给扫描动画
      el.className = 'lo-cell bcell ghost' + (scanning ? ' scan' : '');
      el.style.gridColumn = (e.col + 1) + ' / span ' + e.w;
      el.style.gridRow = (e.row + 1) + ' / span ' + e.h;
      if (e.w > 1) el.style.width = 'calc(' + e.w + ' * var(--bcell) + ' + ((e.w - 1) * 2) + 'px)';
      if (e.h > 1) el.style.height = 'calc(' + e.h + ' * var(--bcell) + ' + ((e.h - 1) * 2) + 'px)';
      el.title = '？？？ · 占 ' + e.w + '×' + e.h + (scanning ? ' · 正在翻找…' : ' · 排队中');
      el.innerHTML = '<span class="ic">?</span><span class="sz">' + e.w + '×' + e.h + '</span>';
      el.__pkPlace = canStore ? lootDepositPlace : null;   // 拖东西松在剪影上也算存进箱子
      el.addEventListener('pointerdown', ev => {   // 点剪影：提示还在翻，别白点
        ev.stopPropagation();
        uiToast('还没翻出来 · 占 ' + e.w + '×' + e.h + ' · 继续翻找…', 'small warn');
        Sfx.tone(220, 0.06, 0.04, 'square');
      });
      box.appendChild(el);
      continue;
    }
    const sel = L.items[L.sel] === e.it;
    el.className = 'lo-cell bcell ready' + (sel ? ' sel' : '');
    el.style.gridColumn = (e.col + 1) + ' / span ' + e.w;
    el.style.gridRow = (e.row + 1) + ' / span ' + e.h;
    if (e.w > 1) el.style.width = 'calc(' + e.w + ' * var(--bcell) + ' + ((e.w - 1) * 2) + 'px)';
    if (e.h > 1) el.style.height = 'calc(' + e.h + ' * var(--bcell) + ' + ((e.h - 1) * 2) + 'px)';
    const shp = e.cell ? shapeOf(e.cell, LOOT_BOX_COLS) : [1, 1];
    const sub = e.cell ? cellSub(e.cell) : '';     // 价格 / 耐久 / 口径等信息行（收集品这里是 ¥ 价格）
    el.title = e.it.name + (sub ? ' · ' + sub : '') + ' · 占 ' + shp[0] + '×' + shp[1];
    let html = '<span class="ic" style="color:' + (e.it.color || '#cfe8f5') + '">' + (e.it.icon || '?') + '</span>';
    if (e.w > 1 || e.h > 1) html += '<span class="nm">' + e.it.name + '</span>' +
      (sub ? '<span class="sub">' + sub + '</span>' : '');
    el.innerHTML = html;
    el.__pkPlace = canStore ? lootDepositPlace : null;   // 拖东西松在容器格上 = 存进箱子
    el.addEventListener('pointerdown', () => {      // 点一下就选中它（F 收的就是这件）
      L.sel = L.items.indexOf(e.it);
      box.querySelectorAll('.lo-cell.sel').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
    }, true);
    pkPressable(el, () => lootBoxPick(e.it), () => {});
    box.appendChild(el);
  }

  const pd = $('lootPend');
  if (pd) {
    pd.innerHTML = lay.pend
      ? ('还有 <b>' + lay.pend + '</b> 件没翻出来 · 虚线剪影是它们的轮廓，翻到哪件哪件现形')
      : (left
        ? '拖到左边入包 · 按 F 收下选中的那件' + (canStore ? ' · 身上的东西也能拖进这里存放' : '') + ' · 拖到屏幕最右丢弃'
        : (canStore ? '箱子已清空 · 把身上的东西拖进来存放（撤离不带走） · 拖到屏幕最右丢弃' : '已全部拿走 · 拖到屏幕最右丢弃'));
  }
}

/* F 键：面板开着 → 拾取选中件；地上有掉落 → 捡最近一件；都没了 → 开箱 */
function searchInteract() {
  if (G.lootPanel) { lootPickSelected(); return; }
  if (pickupInteract()) return;                     // 地上掉落优先
  const c = G.searchTarget;
  if (c && dist(P.x, P.y, c.x, c.y) < LOOT_RANGE) startLoot(c);
}

/* E 键：拉总闸 / 在丢包点丢弃背包 */
function switchInteract() {
  if (G.scene !== 'playing' || G.extMode !== 'switch') return;
  /* 丢包点：穿着背包时按 E 丢弃（背包里的东西一起丢掉） */
  const ex = G.extracts.find(e => e.mode === 'naked' && dist(P.x, P.y, e.x, e.y) < e.r);
  if (ex && packCap() > 0 && P.pack && P.pack.some(c => c)) {
    const lost = P.pack.filter(c => c && !c.cont).length;
    P.pack = emptyCells(packCap());
    P.packDiscarded = true;
    uiToast('背包已丢弃（' + lost + ' 件物品丢失）· 现在可以丢包撤离', 'warn');
    Sfx.tone(150, 0.25, 0.12, 'square', 80);
    return;
  }
  /* 总闸：走近按 E 拉闸 */
  const sw = G.switches.find(s => !s.pulled && dist(P.x, P.y, s.x, s.y) < 92);
  if (!sw) return;
  sw.pulled = true;
  const done = G.switches.filter(s => s.pulled).length;
  Sfx.tone(220, 0.3, 0.16, 'square', 110);
  burst(sw.x, sw.y, 26, { spdMin: 60, spdMax: 240, color: ['#ffd66b', '#ff9a4d', '#fff'], life: 0.7, r: 3, glow: true });
  /* 拉闸 = 全场警报：增援直扑你的位置 */
  G.alarm = 1;
  G.lastAlarmX = P.x; G.lastAlarmY = P.y;
  spawnReinforce();
  if (done >= G.switches.length) {
    G.emergencyTimer = 300;
    uiToast('紧 急 撤 离 程 序 启 动 · 5 分钟后撤离点开启', 'warn');
  } else {
    uiToast('总闸已拉下 ' + done + '/' + G.switches.length + ' · 警报大作，快去下一处', 'warn');
  }
}

/* 拉闸倒计时：归零后紧急撤离点常开 */
function updateSwitchTimer(dt) {
  if (G.extMode !== 'switch' || G.emergencyOpen) return;
  if (G.switches.some(s => !s.pulled)) return;
  G.emergencyTimer -= dt;
  if (G.emergencyTimer <= 60 && !G.emergencyToast60) {
    G.emergencyToast60 = true;
    uiToast('紧急撤离还有 1 分钟开启', 'small');
  }
  if (G.emergencyTimer <= 10 && !G.emergencyToast10) {
    G.emergencyToast10 = true;
    uiToast('紧急撤离点即将开启', 'small');
  }
  if (G.emergencyTimer <= 0) {
    G.emergencyTimer = 0;
    G.emergencyOpen = true;
    uiToast('撤 离 点 已 开 启 · 西门 / 东南跑道', 'ok');
    Sfx.extract();
  }
}

function updateExtract(dt) {
  let inside = null;
  for (const ex of G.extracts) {
    if (ex.mode === 'emergency' && !G.emergencyOpen) continue;
    if (ex.mode === 'naked' && packCap() > 0 && !P.packDiscarded) continue;   // 丢包点：没背包才让进读条
    if (ex.mode === 'paid' && (SAVE.credits | 0) < (ex.cost | 0)) continue;    // 付费撤离：钱不够不让进
    if (dist(P.x, P.y, ex.x, ex.y) < ex.r - 10) { inside = ex; break; }
  }
  G.inExtract = inside;

  if (inside) {
    const hold = inside.hold || G.extractHold;
    G.extractT += dt;
    if (Math.random() < 0.35) {
      addParticle(P.x + rand(-70, 70), P.y + rand(-70, 70), {
        vx: 0, vy: rand(-60, -120), life: 0.8, r: rand(2, 4),
        color: '#46e08a', drag: 0.96, glow: true,
      });
    }
    if (G.extractT >= hold) {
      G.extractT = hold;
      if (inside.mode === 'paid') {
        const c = inside.cost | 0;
        SAVE.credits = Math.max(0, (SAVE.credits | 0) - c);
        uiToast('付费撤离　- ¥' + fmtMoney(c), 'warn');
      }
      endRaid(true);
    }
  } else {
    G.extractT = Math.max(0, G.extractT - dt * 1.6);
  }
}

/* ══════════════════════════════════════════════════════════
   12. 粒子更新
   ══════════════════════════════════════════════════════════ */
function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { G.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const dragF = Math.pow(p.drag, dt * 60);
    p.vx *= dragF;
    p.vy *= dragF;
    p.vy += p.grav * dt;
    p.rot += p.spin * dt;
  }
  for (let i = G.popups.length - 1; i >= 0; i--) {
    const t = G.popups[i];
    t.life -= dt;
    t.y += t.vy * dt;
    t.vy *= Math.pow(0.93, dt * 60);
    if (t.life <= 0) G.popups.splice(i, 1);
  }
  for (const c of G.crates) c.hover = Math.max(0, c.hover - dt * 2);
}

/* ══════════════════════════════════════════════════════════
   13. 相机
   ══════════════════════════════════════════════════════════ */
function updateCamera(dt) {
  /* 一屏能装下的世界尺寸（相机缩放后比窗口大 1/ZOOM 倍） */
  const vw = VW / ZOOM, vh = VH / ZOOM;
  /* 手控制导期间：镜头跟着导弹飞，爆炸后自动回到干员身上 */
  const ml = ctlLoiter();
  if (ml) {
    const mx = ml.x - vw / 2, my = ml.y - vh / 2;
    G.cam.x = lerp(G.cam.x, clamp(mx, 0, Math.max(0, WORLD.w - vw)), 1 - Math.pow(0.0002, dt));
    G.cam.y = lerp(G.cam.y, clamp(my, 0, Math.max(0, WORLD.h - vh)), 1 - Math.pow(0.0002, dt));
    G.shake *= Math.pow(0.0025, dt);
    if (G.shake < 0.15) G.shake = 0;
    return;
  }

  const look = 35 + P.ads * 78;                 // 开镜时镜头往准星方向前探
  const tx = P.x + Math.cos(P.aim) * look - vw / 2;
  const ty = P.y + Math.sin(P.aim) * look - vh / 2;

  G.cam.x = lerp(G.cam.x, tx, 1 - Math.pow(0.0015, dt));
  G.cam.y = lerp(G.cam.y, ty, 1 - Math.pow(0.0015, dt));

  if (WORLD.w > vw) G.cam.x = clamp(G.cam.x, 0, WORLD.w - vw);
  else G.cam.x = (WORLD.w - vw) / 2;
  if (WORLD.h > vh) G.cam.y = clamp(G.cam.y, 0, WORLD.h - vh);
  else G.cam.y = (WORLD.h - vh) / 2;

  G.shake *= Math.pow(0.0025, dt);
  if (G.shake < 0.15) G.shake = 0;
}
