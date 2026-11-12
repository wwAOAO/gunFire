"use strict";

/* js/ui.js —— 大厅 UI、商店、装备/背包面板、流程控制、事件绑定与启动（依赖前序全部模块）。 */

const $ = id => document.getElementById(id);


/* ══════════════════════════════════════════════════════════
   20. 干员：大厅卡片 + 档案浮层
   ──────────────────────────────────────────────────────────
   大厅卡片只放"现在是谁 + 四个键位缩写"，点开才是完整技能说明。
   目前只有红狼一个，但结构按"多干员"写：OP_ORDER 加 id 就多一个。
   ══════════════════════════════════════════════════════════ */
function renderOpBar() {
  const el = $('opBar');
  if (!el) return;
  const op = opDef();
  if (!op) {
    el.innerHTML = '<div class="opempty">未选择干员 · 点这里挑选</div>';
    el.onclick = openOperators;
    return;
  }
  const chip = (k, t) => '<span class="opchip"><b>' + k + '</b>' + t + '</span>';
  el.innerHTML =
    '<div class="opavatar">' + op.name.slice(-1) + '</div>' +
    '<div class="opinfo"><b>' + op.name + '</b>' +
      '<span class="role">' + op.role + ' · ' + op.en + '</span>' +
      '<div class="opchips">' +
        chip('G', op.g.short) + chip('V', op.v.short) + chip('X', op.x.short) + chip('被动', op.passive.short) +
      '</div>' +
    '</div>' +
    '<span class="opgo">换 人 ›</span>';
  el.onclick = openOperators;
}

function openOperators() {
  $('lobby').classList.add('hidden');
  $('ops').classList.remove('hidden');
  renderOpsPanel();
}
function closeOperators() {
  $('ops').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

/* 干员分类分组：类似三角洲的干员页 —— 按定位分组摆放，组内按 OP_ORDER 顺序 */
const ROLE_GROUPS = [
  { rc: 'assault',  cn: '突击', en: 'ASSAULT',  trait: '破口 · 压制' },
  { rc: 'recon',    cn: '侦察', en: 'RECON',    trait: '标记 · 情报' },
  { rc: 'support',  cn: '支援', en: 'SUPPORT',  trait: '治疗 · 掩护' },
  { rc: 'engineer', cn: '工程', en: 'ENGINEER', trait: '工事 · 爆破' },
];

function renderOpsPanel() {
  const list = $('opsList');
  const det = $('opsDetail');
  if (!list || !det) return;
  list.innerHTML = '';

  for (const g of ROLE_GROUPS) {
    const ids = OP_ORDER.filter(id => OPERATORS[id] && roleClassOf(OPERATORS[id].role) === g.rc);
    if (!ids.length) continue;
    const hd = document.createElement('div');
    hd.className = 'ops-grouphd';
    hd.dataset.rc = g.rc;
    hd.innerHTML = '<b>' + g.cn + '</b><span>' + g.en + '</span>' +
      '<i>' + g.trait + ' · ' + ids.length + ' 名</i>';
    list.appendChild(hd);
    for (const id of ids) {
      const o = OPERATORS[id];
      const el = document.createElement('div');
      const rc = roleClassOf(o.role);
      el.className = 'ops-card' + (SAVE.operator === id ? ' on' : '');
      el.dataset.rc = rc;
      el.innerHTML =
        '<div class="opavatar">' + o.name.slice(-1) + '</div>' +
        '<div style="min-width:0"><b>' + o.name + '</b>' +
        '<span class="role">' + o.role + ' · ' + o.en + '</span></div>' +
        '<span class="rolebadge ' + rc + '">' + o.role + '</span>';
      el.addEventListener('click', () => {
        if (SAVE.operator === id) return;
        SAVE.operator = id;
        saveGame();
        uiToast('出战干员 · ' + o.name, 'small');
        renderOpsPanel();
        renderOpBar();
      });
      list.appendChild(el);
    }
  }

  const op = opDef() || OPERATORS[OP_ORDER[0]];
  if (!op) { det.innerHTML = ''; return; }
  const row = (key, cls, title, meta, desc) =>
    '<div class="skillrow"><div class="skillkey' + (cls ? ' ' + cls : '') + '">' + key + '</div>' +
    '<div class="skillbody"><b>' + title + '</b><span class="meta">' + meta + '</span><p>' + desc + '</p></div></div>';

  const onDuty = SAVE.operator === op.id;
  const gUnit = (op.g.kind === 'smoke' || op.g.kind === 'drone') ? '枚'
              : (op.g.kind === 'bee' ? '颗' : '颗');
  const gMeta = '战术道具 · CD ' + op.g.cd + 's' + (op.g.charges > 1 ? ' · 储备 ' + op.g.charges + ' ' + gUnit : '');
  const vUnit = op.v.kind === 'drone' ? '台' : '组';
  const vMeta = '小技能 · CD ' + op.v.cd + 's' + (op.v.charges > 1 ? ' · 储备 ' + op.v.charges + ' ' + vUnit : '');
  const xMeta = (op.x.charges || 1) > 1
    ? '大招 · 充能 ' + op.x.cd + 's / 发 · 上限 ' + op.x.charges + ' 发 · 开局 0 发'
    : '大招 · CD ' + op.x.cd + 's' + (op.x.dur ? ' · 持续 ' + op.x.dur + 's' : '') + ' · 开局转 CD';
  const pKey = op.passive.kind === 'slide' ? 'C' : '被动';
  det.innerHTML =
    '<div class="ops-head"><div class="opavatar">' + op.name.slice(-1) + '</div>' +
      '<div><div class="ops-name">' + op.name + '</div>' +
      '<div class="ops-role">' + op.role + ' · ' + op.en + ' · 4 项能力</div></div>' +
    '</div>' +
    '<div class="ops-desc">' + op.desc + '</div>' +
    row('G', '', op.g.name, gMeta, op.g.desc) +
    row('V', '', op.v.name + (op.v.sub ? ' · ' + op.v.sub : ''), vMeta, op.v.desc) +
    row('X', '', op.x.name, xMeta, op.x.desc) +
    row(pKey, 'pas', op.passive.name, '被动 · 无冷却', op.passive.desc) +
    '<div class="ops-foot"><button class="btn primary" id="opDeploy"' + (onDuty ? ' disabled' : '') + '>' +
      (onDuty ? '当 前 出 战' : '设 为 出 战 干 员') + '</button></div>';

  const btn = $('opDeploy');
  if (btn) {
    btn.addEventListener('click', () => {
      SAVE.operator = op.id;
      saveGame();
      uiToast('出战干员 · ' + op.name, 'small');
      renderOpsPanel();
      renderOpBar();
    });
  }
}

function refreshLobby() {
  $('creditVal').textContent = fmtMoney(SAVE.credits);
  renderOpBar();

  if (!SAVE.loadout) SAVE.loadout = { primary: null, secondary: null, pistol: null };
  if (!SAVE.worn) SAVE.worn = { rig: null, pack: null };
  if (!Array.isArray(SAVE.armorPieces)) SAVE.armorPieces = [];
  /* 槽位消毒：枪被丢掉 / 卖掉之后，槽位上的指针要清掉 */
  for (const sl of GUN_SLOTS) {
    const id = SAVE.loadout[sl];
    if (id && (!WEAPONS[id] || !SAVE.owned[id])) SAVE.loadout[sl] = null;
  }
  if (SAVE.equippedMelee && !(SAVE.ownedMelee && SAVE.ownedMelee[SAVE.equippedMelee])) SAVE.equippedMelee = STARTER_MELEE;

  const LO = SAVE.loadout;
  const armor = (SAVE.wornPiece && ARMORS[SAVE.wornPiece.id]) || ARMORS[0];
  const melee = MELEES[SAVE.equippedMelee] || MELEES[STARTER_MELEE];

  /* 出击装备摘要：改配装进「整备」界面（左装备 · 右仓库） */
  const eq = $('eqSummary');
  eq.innerHTML = '';
  const eqRow = (k, v, s, empty) => {
    const d = document.createElement('div');
    d.className = 'eqrow';
    d.innerHTML = '<span class="k">' + k + '</span><span class="v' + (empty ? ' empty' : '') + '">' + v + '</span>' +
      (s ? '<span class="s">' + s + '</span>' : '');
    eq.appendChild(d);
  };
  eqRow('主武器', LO.primary ? weaponName(WEAPONS[LO.primary]) : '空槽', LO.primary ? caliberOf(LO.primary).short : '带刀出击', !LO.primary);
  eqRow('副武器', LO.secondary ? weaponName(WEAPONS[LO.secondary]) : '空槽', LO.secondary ? caliberOf(LO.secondary).short : '', !LO.secondary);
  eqRow('手枪', LO.pistol ? weaponName(WEAPONS[LO.pistol]) : '空槽', LO.pistol ? caliberOf(LO.pistol).short : '', !LO.pistol);
  eqRow('近战', melee.name, '静音保底', false);
  eqRow('护甲', armor.dr > 0 ? armor.name : '没穿',
    armor.dr > 0 ? (armor.lv + ' 级甲 · 耐久 ' + Math.round(SAVE.wornPiece.hp) + '/' + SAVE.wornPiece.max) : '裸奔最快', !(armor.dr > 0));
  {
    const helmet = helmetOf(SAVE.wornHelmet);
    eqRow('头盔', helmet.lv > 0 ? helmet.name : '没戴',
      helmet.lv > 0 ? (helmet.lv + ' 级头 · 拾音 ' + (helmet.hear >= 0 ? '+' : '') + Math.round(helmet.hear * 100) +
        '% · 降噪 ' + helmet.quietName + helmetFovTag(helmet)) : '耳朵是原装的', helmet.lv <= 0);
  }
  eqRow('弹挂', SAVE.worn.rig ? GEAR[SAVE.worn.rig].name : '没穿', rigCap() + ' 格', !SAVE.worn.rig);
  eqRow('背包', SAVE.worn.pack ? GEAR[SAVE.worn.pack].name : '没穿', packCap() + ' 格', !SAVE.worn.pack);
  const medN = saveMedTotal(), stopN = saveStopTotal(), surgN = saveSurgTotal();
  eqRow('随身', '药 ' + (medN + stopN) + ' · 手术 ' + surgN + ' 次',
    '已装 ' + (SAVE.carry ? SAVE.carry.rig.concat(SAVE.carry.pocket, SAVE.carry.pack).filter(c => c).length : 0) + ' 格', false);

  const goBtn = $('eqGoBtn');
  if (goBtn) goBtn.onclick = () => openLoadout();

  const achN = ACHIEVEMENTS.filter(a => SAVE.achieved && SAVE.achieved[a.id]).length;
  $('lobbyStats').innerHTML =
    '出击 <b>' + SAVE.stats.raids + '</b> · 撤离 <b>' + SAVE.stats.extracts +
    '</b> · 阵亡 <b>' + SAVE.stats.deaths + '</b> · 累计战利品 <b>¥' + fmtMoney(SAVE.stats.loot) +
    '</b> · 成就 <b>' + achN + '/' + ACHIEVEMENTS.length + '</b>';

  const mapBtn = $('mapBtn');
  if (mapBtn) {
    mapBtn.title = '当前地图：' + (G.customMap ? G.customMap.name : '未选择');
    mapBtn.classList.toggle('has-map', !!G.customMap);
  }

  const risk = $('riskLine');
  if (risk) {
    const secretRaid = G.tier === 'secret';
    const topRaid = G.tier === 'top';
    const ownedWeapons = WEAPON_ORDER.filter(k => SAVE.owned[k]);
    /* 带进去的枪里，有哪个口径一颗子弹都没有 */
    const dryGuns = GUN_SLOTS
      .map(k => SAVE.loadout[k])
      .filter(id => id && WEAPONS[id] && ammoTotalOf(calOfWeapon(id)) <= 0);
    if (topRaid) {
      risk.textContent = '绝密行动（门票 ¥20,000 · 阵亡不退）：哈夫克精锐 · 敌人血量与护甲在机密之上再抬一档，增援更早更密，但军械与保险柜几乎铺满（打不过就绕，别硬换）';
    } else if (secretRaid) {
      risk.textContent = '机密行动（门票 ¥8,000 · 阵亡不退）：敌人血量、伤害与护甲全面上调（穿甲的兵甲级 +1），但军械与保险柜更多、品质更高';
    } else if (!ownedWeapons.length) {
      risk.textContent = '一把枪都没有 · 现在只能空手带刀出击，先去军火库买把枪（G17 ¥700 起）';
    } else if (!SAVE.loadout.primary) {
      risk.textContent = '主武器槽是空的 · 只能带手枪和刀出击，去整备界面装一把长枪';
    } else if (!SAVE.worn.rig) {
      risk.textContent = '没穿弹挂 · 备弹装不进去，去整备界面右侧仓库「弹挂」里穿一件';
    } else if (dryGuns.length) {
      risk.textContent = '没子弹：' + dryGuns.map(id => WEAPONS[id].short).join(' / ') +
        ' · 去整备界面从仓库拿点备弹，不然进图就是烧火棍';
    } else if (!SAVE.loadout.secondary && ownedWeapons.length < 3) {
      risk.textContent = '副武器槽空着 · 多带一把枪能少跑一趟，但阵亡会一起丢';
    } else if (SAVE.credits < 800) {
      risk.textContent = '资金吃紧：建议只带主武器低成本出击，撤离后再升级装备';
    } else {
      risk.textContent = '匕首永久保底 · 阵亡会丢掉带进去的枪和搜到的战利品，枪和子弹都要自己买';
    }
  }

  ensureContracts();
  refreshStashBadge();
  refreshModBadge();
  refreshContractBadge();
  refreshMapSelect();
}

let shopTab = 'weapon';
let stashTab = 'collect';   // 仓库当前标签页：collect 收集品 / 其余为清点页

let shopSub = 'all';             // 当前类目的子分类（'all' | 各类目自己的子项 id）
/* 各类目的子分类定义（武器=枪种 / 弹药=弹级 / 补给=用途分组）——以后新物品优先归进补给对应分组 */
const SHOP_SUB_DEFS = {
  weapon: [['all', '全 部'], ...WEAPON_CATS.map(c => [c.id, c.cn])],
  ammo:   [['all', '全 部'], ...AMMO_TIERS.map(T => ['lv' + T.lv, T.grade])],
  supply: [['all', '全 部'], ['surg', '手 术'], ['treat', '治 疗'], ['pain', '止 疼'], ['repair', '甲 修']],
};

function openShop(tab) {
  if (tab) shopTab = tab;
  $('lobby').classList.add('hidden');
  $('shop').classList.remove('hidden');
  refreshShop();
}
function closeShop() {
  $('shop').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

/* ══════════════════════════════════════════════════════════
   改装台：把搜来的配件装到枪上
   ──────────────────────────────────────────────────────────
   配件库是「物资」：装上去就从库里扣一件，拆下来再还回去。
   同一件配件不能同时装在两把枪上 —— 想换就拆。
   ══════════════════════════════════════════════════════════ */
let gsPick = { weapon: null, slot: 'muzzle' };
let gsFrom = 'lobby';           // 从大厅还是军火库进来的

const MOD_LABEL = {
  dmg: '伤害', spread: '散布', recoil: '后坐', mag: '弹匣', reload: '换弹',
  range: '射程', bspeed: '初速', noise: '枪声', pierce: '穿透',
  adsTime: '开镜', adsSpread: '镜内散布', adsMove: '开镜移速', move: '移速',
};
/* 这些数值越低越好，其余越高越好 */
const MOD_LOW_GOOD = { spread: 1, recoil: 1, reload: 1, noise: 1, adsTime: 1, adsSpread: 1 };

/* 一条配件 → 一排带颜色的效果标签 */
function modEffChips(m) {
  const out = [];
  for (const k in m.eff) {
    const v = m.eff[k];
    const lab = MOD_LABEL[k] || k;
    if (k === 'pierce') {
      out.push('<span class="g">' + lab + ' +' + v + ' 人</span>');
      continue;
    }
    if (k === 'mode') {
      out.push('<span class="g">射击模式 → ' + (v === 'auto' ? '全自动' : v === 'burst' ? '三连点射' : '半自动') + '</span>');
      continue;
    }
    const pct = Math.round((v - 1) * 100);
    if (!pct) continue;
    const good = MOD_LOW_GOOD[k] ? pct < 0 : pct > 0;
    out.push('<span class="' + (good ? 'g' : 'b') + '">' +
      lab + ' ' + (pct > 0 ? '+' : '') + pct + '%</span>');
  }
  return out.join('') || '<span class="g">无副作用</span>';
}

function openGunsmith(wid) {
  Sfx.init();
  const owned = WEAPON_ORDER.filter(k => SAVE.owned[k]);
  const LO = SAVE.loadout || {};
  const fav = (LO.primary && SAVE.owned[LO.primary]) ? LO.primary
    : (LO.pistol && SAVE.owned[LO.pistol] ? LO.pistol : null);
  gsPick.weapon = (wid && SAVE.owned[wid]) ? wid : (fav || owned[0] || null);
  gsPick.slot = 'muzzle';
  gsFrom = $('shop').classList.contains('hidden') ? 'lobby' : 'shop';
  $('lobby').classList.add('hidden');
  $('shop').classList.add('hidden');
  $('gunsmith').classList.remove('hidden');
  refreshGunsmith();
}

function closeGunsmith() {
  $('gunsmith').classList.add('hidden');
  if (gsFrom === 'shop') { $('shop').classList.remove('hidden'); refreshShop(); }
  else { $('lobby').classList.remove('hidden'); refreshLobby(); }
}

function refreshGunsmith() {
  $('gsCredit').textContent = fmtMoney(SAVE.credits);

  const owned = WEAPON_ORDER.filter(k => SAVE.owned[k]);
  if (!SAVE.owned[gsPick.weapon]) gsPick.weapon = owned[0] || null;
  $('gsGunCount').textContent = owned.length;

  /* 一把枪都没有：改装台只给一句去买枪，别去碰 WEAPONS[null] */
  if (!owned.length) {
    $('gsHead').innerHTML = '<span class="hn">没有可改装的枪</span><span class="hc">去军火库买一把再来</span>';
    $('gsSlots').innerHTML = '';
    $('gsModList').innerHTML = '';
    $('gsSlotName').textContent = '—';
    const cv0 = $('gsPreview');
    if (cv0) { const g0 = cv0.getContext('2d'); g0.clearRect(0, 0, cv0.width, cv0.height); }
    return;
  }

  /* ── 左：已拥有的枪 ── */
  const list = $('gsGunList');
  list.innerHTML = '';
  for (const id of owned) {
    const w = WEAPONS[id];
    const n = gunModCount(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gunrow' + (id === gsPick.weapon ? ' on' : '');
    b.innerHTML = '<span class="gn">' + w.short + '</span>' +
      '<span class="gm">' + (n ? '改 ' + n + '/' + modSlotTotal(id) : '无改装') + '</span>';
    b.addEventListener('click', () => {
      gsPick.weapon = id;
      /* 手枪没有枪托槽：切到手枪时把选中的槽位挪到枪口，免得停在不适用的格子上 */
      if (!slotAllowed(id, gsPick.slot)) gsPick.slot = 'muzzle';
      refreshGunsmith();
    });
    list.appendChild(b);
  }

  const wid = gsPick.weapon;
  const w = WEAPONS[wid];
  const st = weaponStats(wid);

  /* ── 中：枪头 ── */
  $('gsHead').innerHTML =
    '<span class="hn">' + w.name + '</span>' +
    '<span class="hc">' + w.code + ' · ' + weaponCatOf(w).cn + '</span>' +
    '<span class="hd">改装 ' + st.modCount + ' / ' + modSlotTotal(wid) + '</span>';

  drawGunPreview(wid);

  /* ── 中：五个槽位 ── */
  const slotsBox = $('gsSlots');
  slotsBox.innerHTML = '';
  for (const s of MOD_SLOTS) {
    const allow = slotAllowed(wid, s.id);
    const mid = (SAVE.mods[wid] || {})[s.id];
    const m = mid && MODS[mid];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slotbtn' + (gsPick.slot === s.id ? ' on' : '') +
      (m ? '' : ' empty') + (allow ? '' : ' off');
    b.innerHTML = '<span class="sn">' + s.cn + '</span>' +
      '<span class="sv">' + (allow ? (m ? m.name : '空 槽') : '不 适 用') + '</span>' +
      (m ? '<span class="sg">' + QUALITY[m.q].name + '</span>' : '');
    if (allow) b.addEventListener('click', () => { gsPick.slot = s.id; refreshGunsmith(); });
    slotsBox.appendChild(b);
  }
  $('gsSlotName').textContent = MOD_SLOTS.find(s => s.id === gsPick.slot).cn;

  /* ── 中：当前槽位的配件候选（只列当前枪装得上的；不兼容的进配件库也装不上） ── */
  const box = $('gsModList');
  box.innerHTML = '';
  const cur = (SAVE.mods[wid] || {})[gsPick.slot];
  const allCand = Object.keys(MODS).filter(id => MODS[id].slot === gsPick.slot);
  const cand = allCand.filter(id => modAllowed(wid, id))
    .sort((a, b) => QUALITY_ORDER.indexOf(MODS[a].q) - QUALITY_ORDER.indexOf(MODS[b].q));
  const banN = allCand.length - cand.length;

  if (!slotAllowed(wid, gsPick.slot)) {
    box.innerHTML = '<div class="gs-empty">手枪没有这个槽位<br>换一把长枪再改</div>';
  } else if (!cand.length) {
    box.innerHTML = '<div class="gs-empty">这个槽位还没有可用的配件</div>';
  } else {
    if (banN > 0) {
      const note = document.createElement('div');
      note.className = 'gs-empty';
      note.style.cssText = 'padding:5px 8px;font-size:10px';
      note.textContent = '已隐藏 ' + banN + ' 件与 ' + w.short + ' 不兼容的配件（类目不符或专属配件）';
      box.appendChild(note);
    }
    for (const id of cand) {
      const m = MODS[id];
      const Q = QUALITY[m.q];
      const stock = SAVE.modBag[id] | 0;
      const equipped = cur === id;
      const card = document.createElement('div');
      card.className = 'modcard' + (equipped ? ' cur' : '') + (!equipped && stock <= 0 ? ' used' : '');
      card.style.setProperty('--q', Q.color);
      card.style.setProperty('--qb', Q.dim + '0.14)');
      card.innerHTML =
        '<div class="mhead"><span class="mico">' + m.icon + '</span>' +
          '<span class="mnm">' + m.name + '</span>' +
          '<span class="mq">' + Q.name + '</span></div>' +
        '<div class="md">' + m.desc + '</div>' +
        '<div class="meff">' + modEffChips(m) + '</div>' +
        '<div class="mfoot"><span class="mstock">库存 ×' + stock + '</span>' +
          (equipped
            ? '<button class="minibtn off" data-act="off">卸 下</button>'
            : '<button class="minibtn"' + (stock > 0 ? '' : ' disabled') + ' data-act="on">' +
              (stock > 0 ? '装 上' : '无 库 存') + '</button>') +
          '<button class="minibtn buy"' + (SAVE.credits >= m.price ? '' : ' disabled') +
            ' data-act="buy" title="原价买入一件入库">购 ¥' + fmtMoney(m.price) + '</button>' +
          (stock > 0 ? '<button class="minibtn sell" data-act="sell" title="出售一件，回收一半价钱">¥</button>' : '') +
        '</div>';

      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'on') equipMod(wid, gsPick.slot, id);
          else if (act === 'off') unequipMod(wid, gsPick.slot);
          else if (act === 'sell') sellMod(id);
          else if (act === 'buy') buyMod(id);
        });
      });
      box.appendChild(card);
    }
  }

  /* ── 右：实时数据（基础 → 现值） ── */
  const base = w;
  let html = '';
  for (const row of GS_STATS) {
    const bv = row.get(base);
    const nv = row.get(st);
    let delta = '';
    const diff = nv - bv;
    if (Math.abs(diff) > 1e-6) {
      const pct = (diff / bv) * 100;
      const good = row.low ? pct < 0 : pct > 0;
      delta = '<span class="d ' + (good ? 'up' : 'dn') + '">' +
        (pct > 0 ? '+' : '') + pct.toFixed(0) + '%</span>';
    } else {
      delta = '<span class="d nil">—</span>';
    }
    html += '<div class="strow"><span class="k">' + row.k + '</span>' +
      '<span class="v" title="基础 ' + row.fmt(bv) + '">' + row.fmt(nv) + '</span>' + delta + '</div>';
  }
  $('gsStats').innerHTML = html;

  /* ── 右：配件库 ── */
  const bagIds = Object.keys(SAVE.modBag).filter(id => MODS[id] && (SAVE.modBag[id] | 0) > 0);
  bagIds.sort((a, b) => QUALITY_ORDER.indexOf(MODS[a].q) - QUALITY_ORDER.indexOf(MODS[b].q));
  let total = 0;
  for (const id of bagIds) total += SAVE.modBag[id] | 0;
  $('gsBagCount').textContent = total;

  const bag = $('gsBag');
  bag.innerHTML = '';
  if (!bagIds.length) {
    bag.innerHTML = '<span style="font-size:10px;color:#3f5d72;line-height:1.7">配件库是空的 —— 进封锁区开补给箱翻配件，' +
      '或者直接在左边的配件卡上花钱购入</span>';
  } else {
    for (const id of bagIds) {
      const m = MODS[id];
      const Q = QUALITY[m.q];
      const okGun = !gsPick.weapon || modAllowed(gsPick.weapon, id);
      const el = document.createElement('span');
      el.className = 'bchip' + (okGun ? '' : ' off');
      el.style.setProperty('--q', Q.color);
      el.style.setProperty('--qb', Q.dim + '0.12)');
      el.title = (okGun ? '✓ ' + WEAPONS[gsPick.weapon].short + ' 可用 · ' : '✗ 不适用当前枪 · ') +
        m.name + ' · ' + Q.name + ' · ' + m.desc;
      el.innerHTML = m.icon + ' <b>×' + (SAVE.modBag[id] | 0) + '</b>';
      bag.appendChild(el);
    }
  }
}

/* 改装台右侧的指标表 */
const GS_STATS = [
  { k: '单发伤害', get: w => w.dmg,            fmt: v => String(Math.round(v * 10) / 10), low: false },
  { k: '弹匣容量', get: w => w.mag,            fmt: v => Math.round(v) + ' 发',           low: false },
  { k: '换弹时间', get: w => w.reload,         fmt: v => v.toFixed(2) + 's',               low: true  },
  { k: '射速',     get: w => 1 / w.rate,       fmt: v => v.toFixed(1) + '/s',              low: false },
  { k: '腰射散布', get: w => w.spread * 57.2958, fmt: v => v.toFixed(2) + '°',             low: true  },
  { k: '后坐力',   get: w => w.recoil,         fmt: v => v.toFixed(1),                     low: true  },
  { k: '开镜耗时', get: w => w.ads.time * 1000, fmt: v => Math.round(v) + 'ms',            low: true  },
  { k: '镜内散布', get: w => w.ads.spread,     fmt: v => '×' + v.toFixed(2),               low: true  },
  { k: '枪声半径', get: w => w.noise,          fmt: v => Math.round(v) + 'm',              low: true  },
  { k: '移速',     get: w => (w.moveMul || 1) * 100, fmt: v => Math.round(v) + '%',        low: false },
];

function equipMod(wid, slot, mid) {
  const m = MODS[mid];
  if (!m || m.slot !== slot || !slotAllowed(wid, slot)) return;
  if (!modAllowed(wid, mid)) { uiToast(w.short + ' 装不上 ' + m.name + '（' + modBanReason(wid, mid) + '）', 'small warn'); return; }
  if ((SAVE.modBag[mid] | 0) <= 0) { uiToast('这件配件没有库存', 'small warn'); return; }

  SAVE.mods[wid] = SAVE.mods[wid] || {};
  const old = SAVE.mods[wid][slot];
  if (old === mid) return;

  if (old && MODS[old]) SAVE.modBag[old] = (SAVE.modBag[old] | 0) + 1;   // 换下来的回库
  SAVE.modBag[mid] = (SAVE.modBag[mid] | 0) - 1;
  if (SAVE.modBag[mid] <= 0) delete SAVE.modBag[mid];
  SAVE.mods[wid][slot] = mid;

  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  uiToast('装上 ' + m.name + '　·　' + WEAPONS[wid].short, 'small');
  refreshGunsmith();
}

function unequipMod(wid, slot) {
  const eq = SAVE.mods[wid];
  const mid = eq && eq[slot];
  if (!mid) return;
  SAVE.modBag[mid] = (SAVE.modBag[mid] | 0) + 1;
  delete eq[slot];
  if (!Object.keys(eq).length) delete SAVE.mods[wid];
  saveGame();
  Sfx.tone(420, 0.05, 0.06, 'square');
  refreshGunsmith();
}

function stripAllMods(wid) {
  const eq = SAVE.mods[wid];
  if (!eq) { uiToast('这把枪没有装任何配件', 'small'); return; }
  let n = 0;
  for (const s of MOD_SLOTS) {
    const mid = eq[s.id];
    if (!mid) continue;
    SAVE.modBag[mid] = (SAVE.modBag[mid] | 0) + 1;
    delete eq[s.id];
    n++;
  }
  if (!Object.keys(eq).length) delete SAVE.mods[wid];
  saveGame();
  Sfx.tone(380, 0.06, 0.08, 'square');
  uiToast('拆下 ' + n + ' 件配件', 'small');
  refreshGunsmith();
}

/* 卖一件配件，回收一半价钱 —— 多余的配件是钱，不是摆设 */
function sellMod(mid) {
  const m = MODS[mid];
  if (!m || (SAVE.modBag[mid] | 0) <= 0) return;
  SAVE.modBag[mid]--;
  if (SAVE.modBag[mid] <= 0) delete SAVE.modBag[mid];
  const gain = Math.round(m.price * 0.5);
  SAVE.credits += gain;
  SAVE.stats.sold = (SAVE.stats.sold | 0) + gain;
  saveGame();
  Sfx.tone(760, 0.06, 0.14, 'triangle');
  uiToast('出售 ' + m.name + '　+ ¥' + fmtMoney(gain), 'small');
  refreshGunsmith();
}

/* 局外也能买配件：改装台原价掏钱直接入库，不用再全靠局内翻箱 */
function buyMod(mid) {
  const m = MODS[mid];
  if (!m) return;
  if (SAVE.credits < m.price) {
    uiToast('钱不够 · 还差 ¥' + fmtMoney(m.price - SAVE.credits), 'small warn');
    Sfx.tone(200, 0.09, 0.05, 'square');
    return;
  }
  SAVE.credits -= m.price;
  SAVE.modBag[mid] = (SAVE.modBag[mid] | 0) + 1;
  saveGame();
  Sfx.tone(880, 0.06, 0.12, 'triangle');
  uiToast('购入 ' + m.name + '　- ¥' + fmtMoney(m.price), 'small');
  refreshGunsmith();
}


function stashRows() {
  const rows = [];
  for (const id in SAVE.stash) {
    const r = RELICS[id];
    const n = SAVE.stash[id] | 0;
    if (!r || n <= 0) continue;
    rows.push({ id, n, r, worth: r.price * n });
  }
  rows.sort((a, b) => {
    const d = QUALITY_ORDER.indexOf(a.r.q) - QUALITY_ORDER.indexOf(b.r.q);
    return d !== 0 ? d : b.worth - a.worth;
  });
  return rows;
}

function stashTotals() {
  let n = 0, v = 0;
  for (const id in SAVE.stash) {
    const r = RELICS[id];
    if (!r) continue;
    n += SAVE.stash[id] | 0;
    v += relicSellPrice(id) * (SAVE.stash[id] | 0);
  }
  return { n, v };
}

/* 市场饱和：同一件收集品卖得越多，单价越低（0.88^已售件数，封底 40%）。
   这就是把 myth 的陡峭 faucet 拉平 —— 头一件 34,000，卖到第十件只剩四成。 */
function relicSellPrice(id) {
  const r = RELICS[id];
  if (!r) return 0;
  /* myth 用「同品质已售总数」当衰减计数：单件各自计数时，每刷出一个
     新品种 myth 都是全价，市场饱和阀被「新品种」绕开。 */
  let sold = (SAVE.soldN && SAVE.soldN[id]) | 0;
  if (r.q === 'myth') {
    for (const k in (SAVE.soldN || {})) {
      const rr = RELICS[k];
      if (rr && rr.q === 'myth' && k !== id) sold += (SAVE.soldN[k] | 0);
    }
  }
  const k = Math.max(0.4, Math.pow(0.88, Math.min(sold, 12)));
  return Math.max(1, Math.round(r.price * k));
}

function refreshStashBadge() {
  const b = $('stashBadge');
  if (!b) return;
  const n = stashTotals().n;
  if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

/* 大厅「改装台」按钮上的配件库存角标 */
function refreshModBadge() {
  const b = $('modBadge');
  if (!b) return;
  let n = 0;
  for (const id in SAVE.modBag) if (MODS[id]) n += SAVE.modBag[id] | 0;
  if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

function openStash() {
  Sfx.init();
  stashTab = 'collect';                          // 每次进仓库回到收集品页
  syncStashTabs();

  $('lobby').classList.add('hidden');
  $('stash').classList.remove('hidden');
  refreshStash();
}

/* ── 成就面板 ── */
function refreshAchievements() {
  const got = SAVE.achieved || {};
  let n = 0, worth = 0;
  const list = $('achList');
  if (!list) return;
  list.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const on = !!got[a.id];
    if (on) { n++; worth += a.reward; }
    const d = document.createElement('div');
    d.style.cssText = 'border:1px solid ' + (on ? 'rgba(116,163,92,.45)' : 'rgba(255,255,255,.12)') +
      ';background:' + (on ? 'rgba(26,70,48,.35)' : 'rgba(255,255,255,.03)') +
      ';padding:10px 12px;border-radius:6px;opacity:' + (on ? '1' : '.6');
    d.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">' +
        '<b style="font-size:13px;color:' + (on ? '#8df0b6' : '#cfd9e6') + '">' + (on ? '✓ ' : '') + a.name + '</b>' +
        '<span style="font-size:11px;color:#ffcc4d">+ ¥' + fmtMoney(a.reward) + '</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.5">' + a.desc + '</div>';
    list.appendChild(d);
  }
  $('achCredit').textContent = fmtMoney(SAVE.credits);
  $('achCount').textContent = n;
  $('achTotal').textContent = ACHIEVEMENTS.length;
  $('achWorth').textContent = '¥' + fmtMoney(worth);
}

function openAchievements() {
  Sfx.init();
  $('lobby').classList.add('hidden');
  $('ach').classList.remove('hidden');
  refreshAchievements();
}

function closeAchievements() {
  $('ach').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

/* ── 委托面板 ── */
function refreshContractBadge() {
  const b = $('ctBadge');
  if (!b) return;
  const n = contractReadyN();
  if (n > 0) { b.textContent = String(n); b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

function refreshContracts() {
  const C = ensureContracts();
  const list = $('ctList');
  if (!list) return;
  list.innerHTML = '';
  let done = 0, ready = 0, readyMoney = 0;
  C.list.forEach((e, i) => {
    const t = CONTRACT_BY_ID[e.id];
    if (!t) return;
    const prog = Math.min(t.goal, e.prog | 0);
    const ok = prog >= t.goal;
    if (e.done) done++;
    if (ok && !e.done) { ready++; readyMoney += t.reward; }
    const pct = Math.round(clamp(prog / t.goal, 0, 1) * 100);
    const progTxt = t.money ? '¥' + fmtMoney(prog) + ' / ¥' + fmtMoney(t.goal) : prog + ' / ' + t.goal;
    const card = document.createElement('div');
    card.className = 'ctcard' + (e.done ? ' done' : (ok ? ' ready' : ''));
    card.innerHTML =
      '<h5>' + t.name + '<span>+ ¥' + fmtMoney(t.reward) + '</span></h5>' +
      '<div class="cd">' + t.desc + '</div>' +
      '<div class="ctbar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="ctfoot"><span>' + (e.done ? '已领取' : progTxt) + '</span>' +
      '<button data-i="' + i + '"' + (ok && !e.done ? '' : ' disabled') + '>' + (e.done ? '完成' : '领 取') + '</button></div>';
    list.appendChild(card);
  });
  for (const b of list.querySelectorAll('button[data-i]')) {
    b.addEventListener('click', () => claimContract(+b.dataset.i));
  }
  $('ctCredit').textContent = fmtMoney(SAVE.credits);
  $('ctDay').textContent = C.day;
  $('ctDone').textContent = done;
  $('ctTotal').textContent = C.list.length;
  $('ctReady').textContent = '¥' + fmtMoney(readyMoney);
  refreshContractBadge();
}

function openContracts() {
  Sfx.init(); Sfx.resume();
  ensureContracts();
  $('lobby').classList.add('hidden');
  $('contracts').classList.remove('hidden');
  refreshContracts();
}
function closeContracts() {
  $('contracts').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

function claimContract(i) {
  const C = ensureContracts();
  const e = C.list[i];
  const t = e && CONTRACT_BY_ID[e.id];
  if (!t || e.done || (e.prog | 0) < t.goal) return;
  e.done = 1;
  SAVE.credits += t.reward;
  saveGame();
  Sfx.pickup();
  uiToast('委托完成 · ' + t.name + '　+ ¥' + fmtMoney(t.reward), '');
  refreshContracts();
}

function claimAllContracts() {
  const C = ensureContracts();
  let n = 0, money = 0;
  for (const e of C.list) {
    const t = CONTRACT_BY_ID[e.id];
    if (!t || e.done || (e.prog | 0) < t.goal) continue;
    e.done = 1;
    SAVE.credits += t.reward;
    n++; money += t.reward;
  }
  if (!n) { uiToast('没有可领取的委托', 'small warn'); return; }
  saveGame();
  Sfx.pickup();
  uiToast('领取 ' + n + ' 份委托 · + ¥' + fmtMoney(money), '');
  refreshContracts();
}

function rerollContracts() {
  const COST = 2000;
  if (SAVE.credits < COST) { uiToast('重掷要 ¥2,000 · 资金不够', 'small warn'); return; }
  SAVE.credits -= COST;
  const cur = {};
  ensureContracts().list.forEach(e => { cur[e.id] = 1; });
  SAVE.contracts = { day: contractDay(), list: pickContracts(contractDay() + '#' + Date.now(), cur) };
  saveGame();
  Sfx.pickup();
  uiToast('已重掷一批委托 · − ¥' + fmtMoney(COST), 'small');
  refreshContracts();
}

/* ══════════ 设置面板 ══════════ */
const AIM_PRESETS = ['#b4e6ff', '#ffffff', '#63d68a', '#ffcc4d', '#ff7a9c', '#b782ff'];

function openSettings() {
  Sfx.init();
  G._setFromLobby = (G.scene === 'lobby');
  if (G._setFromLobby) $('lobby').classList.add('hidden');
  syncSettingsUI();
  $('settings').classList.remove('hidden');
}
function closeSettings() {
  $('settings').classList.add('hidden');
  if (G._setFromLobby) { $('lobby').classList.remove('hidden'); refreshLobby(); }
  G._setFromLobby = false;
}

function syncSettingsUI() {
  const s = SAVE.settings;
  $('setVol').value = s.vol;      $('setVolV').textContent = s.vol;
  $('setShake').value = s.shake;  $('setShakeV').textContent = s.shake;
  $('setFx').value = s.fx;        $('setFxV').textContent = s.fx;
  const row = $('setAimRow');
  row.innerHTML = '';
  for (const c of AIM_PRESETS) {
    const d = document.createElement('div');
    d.className = 'aimdot' + (String(s.aim).toLowerCase() === c.toLowerCase() ? ' on' : '');
    d.style.background = c;
    d.style.color = c;
    d.title = '准星 ' + c;
    d.addEventListener('click', () => { s.aim = c; saveGame(); syncSettingsUI(); });
    row.appendChild(d);
  }
  /* 画质档：改档立刻换纹理烘焙倍率（artPattern 检测到变化会重烘） */
  const gfxRow = $('setGfxRow');
  gfxRow.innerHTML = '';
  const GFX_LABEL = ['流畅', '均衡', '高画质'];
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('button');
    b.className = 'btn ghost small gfxbtn' + (s.gfx === i ? ' on' : '');
    b.textContent = GFX_LABEL[i];
    b.addEventListener('click', () => {
      s.gfx = i;
      ART.q = i;
      saveGame();
      syncSettingsUI();
    });
    gfxRow.appendChild(b);
  }
  $('saveMsg').textContent = '';
}

/* 启动时把存档里的画质档挂到美术层（默认高画质） */
function applyGfx() {
  const g = (SAVE.settings && (SAVE.settings.gfx | 0)) || 0;
  ART.q = Math.max(0, Math.min(2, g));
}

function bindSetSlider(id, key, valId) {
  const el = $(id);
  el.addEventListener('input', () => {
    SAVE.settings[key] = el.value | 0;
    $(valId).textContent = el.value;
    applySettings();
  });
  el.addEventListener('change', () => saveGame());
}

function saveMsg(t) { $('saveMsg').textContent = t; }

function initSettingsUI() {
  bindSetSlider('setVol', 'vol', 'setVolV');
  bindSetSlider('setShake', 'shake', 'setShakeV');
  bindSetSlider('setFx', 'fx', 'setFxV');

  /* 导出：把 SAVE 原样写成 JSON 文本，玩家自己保存 */
  $('saveExport').addEventListener('click', () => {
    $('saveText').value = JSON.stringify(SAVE);
    saveMsg('已导出 · 复制下来存好');
  });
  /* 复制到剪贴板（浏览器不给权限时退化成全选，让玩家手动复制） */
  $('saveCopy').addEventListener('click', () => {
    const s = JSON.stringify(SAVE);
    $('saveText').value = s;
    const fallback = () => { $('saveText').focus(); $('saveText').select(); saveMsg('复制受限 · 已全选，按 Ctrl+C'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(() => saveMsg('已复制到剪贴板'), fallback);
    } else fallback();
  });
  /* 导入：校验关键字段后覆盖存档并重新载入 */
  $('saveImport').addEventListener('click', () => {
    const raw = ($('saveText').value || '').trim();
    if (!raw) return saveMsg('先粘贴一份存档文本');
    let d;
    try { d = JSON.parse(raw); } catch (e) { return saveMsg('不是合法的存档文本'); }
    if (!d || typeof d !== 'object' || typeof d.credits !== 'number') return saveMsg('存档内容不对（缺少资金字段）');
    if (!confirm('导入会覆盖当前存档，确定吗？')) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); }
    catch (e) { return saveMsg('写入失败：浏览器存储不可用'); }
    saveMsg('导入成功 · 正在重新载入…');
    setTimeout(() => location.reload(), 400);
  });

  $('setBtn').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('pauseSetBtn').addEventListener('click', openSettings);
}

/* ══════════ 图鉴 ══════════ */
const CODEX_REWARD = { common: 5000, rare: 9000, epic: 15000, legend: 24000, myth: 36000 };

/* 收集品第一次进仓库 = 图鉴点亮（之后卖掉也仍然算见过） */
function markRelicSeen(id) {
  if (!id || !RELICS[id]) return;
  if (SAVE.seenRelics[id]) return;
  SAVE.seenRelics[id] = 1;
  checkCodexReward(RELICS[id].q);
  saveGame();
}

function codexProgress() {
  const out = {};
  for (const q of QUALITY_ORDER) out[q] = { have: 0, total: 0 };
  for (const id of RELIC_IDS) {
    const q = RELICS[id].q;
    if (!out[q]) continue;
    out[q].total++;
    if (SAVE.seenRelics[id]) out[q].have++;
  }
  return out;
}

/* 某一档全部见过 → 一次性发奖金（每个档位只发一次） */
function checkCodexReward(q) {
  const p = codexProgress()[q];
  if (!p || p.total === 0 || p.have < p.total || SAVE.codexReward[q]) return;
  SAVE.codexReward[q] = 1;
  const bonus = CODEX_REWARD[q] || 0;
  SAVE.credits += bonus;
  saveGame();
  Sfx.loot();
  setTimeout(() => Sfx.tone(1040, 0.08, 0.22, 'triangle'), 80);
  uiToast('图鉴集齐 · ' + QUALITY[q].name + '　+ ¥' + fmtMoney(bonus), '');
}

let codexTab = 'all';

function openCodex() {
  Sfx.init();
  $('lobby').classList.add('hidden');
  $('codex').classList.remove('hidden');
  codexTab = 'all';
  refreshCodex();
}
function closeCodex() {
  $('codex').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

function refreshCodex() {
  const prog = codexProgress();
  let totalAll = 0, haveAll = 0, worth = 0;
  for (const q of QUALITY_ORDER) {
    totalAll += prog[q].total;
    haveAll += prog[q].have;
    if (SAVE.codexReward[q]) worth += CODEX_REWARD[q] || 0;
  }
  $('codexCredit').textContent = fmtMoney(SAVE.credits);
  $('codexCount').textContent = haveAll;
  $('codexTotal').textContent = totalAll;
  $('codexWorth').textContent = '¥' + fmtMoney(worth);

  /* 稀有度切换（每档带进度） */
  const tabs = $('codexTabs');
  tabs.innerHTML = '';
  const mkTab = (key, label, col) => {
    const b = document.createElement('button');
    b.className = 'btn ghost small';
    const on = codexTab === key;
    b.style.borderColor = on ? (col || 'rgba(184,162,107,.7)') : 'rgba(120,150,175,.28)';
    b.style.color = on ? (col || '#b8a26b') : '#8fa9bd';
    b.textContent = label;
    b.addEventListener('click', () => { codexTab = key; refreshCodex(); });
    tabs.appendChild(b);
  };
  mkTab('all', '全部 ' + haveAll + '/' + totalAll, '#b8a26b');
  for (const q of QUALITY_ORDER) {
    const Q = QUALITY[q];
    mkTab(q, Q.name + ' ' + prog[q].have + '/' + prog[q].total, Q.color);
  }

  /* 网格：已获得的排前面，同状态按价格降序 */
  const grid = $('codexGrid');
  grid.innerHTML = '';
  const list = RELIC_IDS.filter(id => codexTab === 'all' || RELICS[id].q === codexTab);
  list.sort((a, b) => {
    const sa = SAVE.seenRelics[a] ? 1 : 0, sb = SAVE.seenRelics[b] ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return (RELICS[b].price | 0) - (RELICS[a].price | 0);
  });
  for (const id of list) {
    const r = RELICS[id];
    const got = !!SAVE.seenRelics[id];
    const Q = QUALITY[r.q] || QUALITY.common;
    const d = document.createElement('div');
    d.className = 'cdx' + (got ? '' : ' locked');
    d.title = got ? (r.name + ' · ¥' + fmtMoney(r.price) + '\n' + (r.desc || '')) : '未获得';
    d.innerHTML =
      '<span class="ic" style="color:' + Q.color + ';background:' + Q.dim + '0.12)">' + (got ? r.icon : '·') + '</span>' +
      '<span style="min-width:0">' +
        '<div class="nm"' + (got ? '' : ' style="color:#5e7a8f"') + '>' + (got ? r.name : '未获得') + '</div>' +
        '<div class="pr" style="color:' + (got ? Q.color : '#3f5d72') + '">' + (got ? '¥' + fmtMoney(r.price) : '???') + ' · ' + Q.name + '</div>' +
      '</span>';
    grid.appendChild(d);
  }
}

function closeStash() {
  $('stash').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}


/* ── 仓库清点卡片：仅展示，不出售（出售去收集品页，穿戴去整备界面） ── */
function stashCard(o) {
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML =
    '<div class="top"><span class="nm" style="color:' + (o.color || '#cfd9e6') + '">' + o.name + '</span>' +
    '<span class="tag cat">' + (o.tag || '') + '</span></div>' +
    '<div class="ds">' + (o.desc || '') + '</div>' +
    '<div class="buyrow"><span class="price" style="color:#9fb0c3">' + (o.meta || '') + '</span></div>';
  return el;
}
function stashEmpty(grid, text) {
  const d = document.createElement('div');
  d.className = 'stashempty';
  d.textContent = text;
  grid.appendChild(d);
}

const MOD_SLOT_CN = { muzzle: '枪口', optic: '瞄具', grip: '握把', stock: '枪托', mag: '弹匣', laser: '激光', rail: '导轨' };
const STASH_TAB_NOTE = {
  weapon: '名下所有枪械与近战武器的清点（含磨损）。出手枪械去军火库，装配件去改装台。',
  armor:  '护甲是仓库里的实体件，穿着的那件不占库存（阵亡丢的是身上这件，仓库里的还在）。穿上 / 换甲去整备界面，修理用甲修包。',
  gear:   '弹挂与背包是买断制实体装备。穿上去整备界面，购买去军火库。',
  ammo:   '各口径 × 弹级的备弹库存。局内搜到的弹药撤离后自动入账到这里。',
  supply: '医疗 / 止血止痛 / 手术包 / 甲修包的库存清点。出发前去整备界面装进弹挂或背包。',
  mods:   '配件库存清点。装到枪上去改装台。',
};
const STASH_TAB_EMPTY = {
  weapon: '名下没有任何武器 —— 去军火库买一把',
  armor:  '没有护甲。裸奔进封锁区很危险 —— 去军火库护甲页买一件',
  gear:   '还没买过弹挂 / 背包 —— 新手弹挂默认已穿着，这里不重复列出',
  ammo:   '一点备弹都没有 —— 去军火库弹药页补点货',
  supply: '没有任何补给。至少带一支注射器和几卷绷带再出门',
  mods:   '配件袋是空的 —— 军火库配件页或改装台拆件都能获得',
};

/* 清点页数据：每行 { name, color, tag, desc, meta, n, worth } */
function stashOtherRows() {
  const rows = [];
  if (stashTab === 'weapon') {
    for (const id of WEAPON_ORDER) {
      if (!SAVE.owned[id]) continue;
      const W = WEAPONS[id];
      if (!W) continue;
      rows.push({
        name: W.name, color: '#cfd9e6',
        tag: caliberOf(id).short + ' · 枪械',
        desc: W.desc || '',
        meta: '原价 ¥' + fmtMoney(W.price) + ' · 磨损 ' + gunWearOf(id) + '%',
        n: 1, worth: W.price,
      });
    }
    for (const id in (SAVE.ownedMelee || {})) {
      const M = MELEES[id];
      if (!M) continue;
      rows.push({
        name: M.name, color: M.color || '#cfd9e6',
        tag: '近战' + (SAVE.equippedMelee === id ? ' · 已装备' : ''),
        desc: M.desc || '',
        meta: M.price > 0 ? '原价 ¥' + fmtMoney(M.price) : '白送',
        n: 1, worth: M.price,
      });
    }
  } else if (stashTab === 'armor') {
    const list = [];
    if (SAVE.wornPiece) list.push({ p: SAVE.wornPiece, wearing: true });
    for (const p of (SAVE.armorPieces || [])) list.push({ p, wearing: false });
    for (const it of list) {
      const A = ARMORS[it.p.id | 0];
      if (!A || A.lv <= 0) continue;
      rows.push({
        name: A.name, color: armorLvColor(A.lv),
        tag: A.lv + ' 级甲' + (it.wearing ? ' · 身上穿着' : ''),
        desc: A.desc || '',
        meta: '耐久 ' + (it.p.hp | 0) + '/' + (it.p.max | 0) + ' · 原价 ¥' + fmtMoney(A.price),
        n: 1, worth: Math.round(A.price * (it.p.hp / Math.max(1, it.p.max))),
      });
    }
  } else if (stashTab === 'gear') {
    for (const key in GEAR) {
      if (!(SAVE.gearOwned && SAVE.gearOwned[key])) continue;
      const g = GEAR[key];
      const wearing = SAVE.worn && SAVE.worn[g.kind] === key;
      rows.push({
        name: g.name, color: g.color || '#cfd9e6',
        tag: (g.kind === 'rig' ? '弹挂' : '背包') + ' · ' + g.cap + ' 格' + (wearing ? ' · 身上穿着' : ''),
        desc: g.desc || '',
        meta: '原价 ¥' + fmtMoney(g.price),
        n: 1, worth: g.price,
      });
    }
  } else if (stashTab === 'helmet') {
    for (const H of HELMETS) {
      if (H.id === 0) continue;
      const n = (SAVE.helmetOwned && SAVE.helmetOwned[H.id]) | 0;
      if (n <= 0) continue;
      const wearing = SAVE.wornHelmet === H.id;
      rows.push({
        name: H.name, color: armorLvColor(H.lv),
        tag: H.lv + ' 级头' + (wearing ? ' · 头上戴着' : ''),
        desc: H.desc || '',
        meta: (H.dr ? '≤' + H.drLv + ' 级弹减伤 ' + Math.round(H.dr * 100) + '%' : '无防护') +
          ' · 拾音 ' + (H.hear >= 0 ? '+' : '') + Math.round(H.hear * 100) + '% · 降噪 ' + H.quietName + helmetFovTag(H) +
          ' · 原价 ¥' + fmtMoney(H.price),
        n, worth: H.price * n,
      });
    }
  } else if (stashTab === 'ammo') {
    for (const cal of CAL_ORDER) {
      for (let lv = 0; lv <= AMMO_LV_MAX; lv++) {
        const n = ammoStock(cal, lv);
        if (n <= 0) continue;
        const C = CALIBERS[cal], T = ammoTier(lv);
        if (!C || !T) continue;
        rows.push({
          name: C.short + ' ' + T.grade + ' ' + T.name, color: T.color,
          tag: '备弹',
          desc: T.desc || '',
          meta: '军火库 ¥' + fmtMoney(ammoPrice(cal, lv)) + ' / 盒 ' + C.box + ' 发',
          n, worth: Math.round(ammoPrice(cal, lv) / Math.max(1, C.box) * n),
        });
      }
    }
  } else if (stashTab === 'supply') {
    for (const id of MEDKIT_ORDER) {
      const m = SAVE.meds && SAVE.meds[id];
      const M = MEDKITS[id];
      if (!m || !M) continue;
      const n = m.n | 0, left = m.left | 0;
      if (n <= 0 && left <= 0) continue;
      rows.push({
        name: M.name, color: M.color || '#cfd9e6',
        tag: '医疗 · ' + M.grade,
        desc: M.desc || '',
        meta: '未开封 ×' + n + (left > 0 ? ' · 拆开那份剩 ' + left + ' 点耐久' : ''),
        n: n + (left > 0 ? 1 : 0), worth: M.price * (n + (left > 0 ? 1 : 0)),
      });
    }
    for (const id of STOP_ORDER) {
      const n = (SAVE.stops && SAVE.stops[id]) | 0;
      const M = STOPS[id];
      if (n <= 0 || !M) continue;
      rows.push({
        name: M.name, color: M.color || '#cfd9e6',
        tag: '止血止痛 · ' + M.grade,
        desc: M.desc || '',
        meta: '库存 ×' + n,
        n, worth: M.price * n,
      });
    }
    for (const id of SURG_ORDER) {
      const sg = SAVE.surgs && SAVE.surgs[id];
      const M = SURGERIES[id];
      if (!sg || !M) continue;
      const uses = sg.uses | 0;
      if (uses <= 0) continue;
      rows.push({
        name: M.name, color: M.color || '#cfd9e6',
        tag: '手术 · ' + M.grade,
        desc: M.desc || '',
        meta: '还能动 ' + uses + ' 次刀',
        n: 1, worth: Math.round(M.price * uses / Math.max(1, M.uses)),
      });
    }
    for (const id in REPAIRS) {
      const r = SAVE.repairs && SAVE.repairs[id];
      const M = REPAIRS[id];
      if (!r || !M) continue;
      const n = r.n | 0, left = r.left | 0;
      if (n <= 0 && left <= 0) continue;
      rows.push({
        name: M.name, color: M.color || '#cfd9e6',
        tag: '甲修 · ' + M.grade,
        desc: M.desc || '',
        meta: '未开封 ×' + n + (left > 0 ? ' · 拆开那份剩 ' + left + ' 点甲修剂' : ''),
        n: n + (left > 0 ? 1 : 0), worth: M.price * (n + (left > 0 ? 1 : 0)),
      });
    }
  } else if (stashTab === 'mods') {
    for (const id in (SAVE.modBag || {})) {
      const n = SAVE.modBag[id] | 0;
      const M = MODS[id];
      if (!M || n <= 0) continue;
      rows.push({
        name: M.name, color: '#cfd9e6',
        tag: '配件 · ' + (MOD_SLOT_CN[M.slot] || M.slot || '—'),
        desc: M.desc || '',
        meta: '原价 ¥' + fmtMoney(M.price),
        n, worth: M.price * n,
      });
    }
  }
  return rows;
}

function syncStashTabs() {
  document.querySelectorAll('#stashTabs .tab').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === stashTab));
}

function refreshStash() {
  const t = stashTotals();
  $('stashCredit').textContent = fmtMoney(SAVE.credits);
  refreshStashBadge();

  const btnAll = $('sellAllBtn');
  const grid = $('stashGrid');
  const note = $('stashNote');
  grid.innerHTML = '';

  /* 收集品页：保留原有出售流程 */
  if (stashTab === 'collect') {
    btnAll.classList.remove('hidden');
    $('stashCount').textContent = t.n;
    $('stashWorth').textContent = '¥' + fmtMoney(t.v);
    $('stashSold').textContent = '¥' + fmtMoney(SAVE.stats.sold | 0);
    note.textContent = '撤离带出的收集品会堆在这里。卖成资金之后，才能去军火库买枪。同一件卖得越多，市场越饱和、单价越低（跌到原价四成封底）—— 稀罕货别一次全抛。';
    const rows = stashRows();
    if (!rows.length) {
      btnAll.disabled = true;
      btnAll.style.opacity = 0.4;
      btnAll.style.cursor = 'not-allowed';
      stashEmpty(grid, '收集品仓库是空的 —— 进封锁区搜些货，撤出来才有东西卖');
      return;
    }
    btnAll.disabled = false;
    btnAll.style.opacity = 1;
    btnAll.style.cursor = 'pointer';
    for (const row of rows) {
      const Q = QUALITY[row.r.q];
      const sp = relicSellPrice(row.id);
      const decayed = sp < row.r.price;
      const el = document.createElement('div');
      el.className = 'relic' + (row.r.q === 'myth' ? ' myth' : '');
      el.style.setProperty('--q', Q.color);
      el.style.setProperty('--qb', Q.dim + '0.14)');
      el.innerHTML =
        '<div class="rhead">' +
          '<span class="rico">' + row.r.icon + '</span>' +
          '<span class="rnm">' + row.r.name + '</span>' +
          '<span class="rq">' + Q.name + ' · ' + relicShape(row.id)[0] + '×' + relicShape(row.id)[1] + '</span>' +
        '</div>' +
        '<div class="rfoot">' +
          '<span class="rprice" title="' + (decayed ? '市场饱和：已累计卖出 ' + (SAVE.soldN[row.id] | 0) + ' 件，原价 ¥' + fmtMoney(row.r.price) : '当前市场价') + '">' +
            '<i>¥</i>' + fmtMoney(sp) + (decayed ? ' ↓' : '') + '</span>' +
          '<span class="rqty">×' + row.n + '</span>' +
          '<button class="rbtn all" data-sell="' + row.id + '" data-n="all">全 卖</button>' +
          '<button class="rbtn" data-sell="' + row.id + '" data-n="1">卖 1</button>' +
        '</div>';
      el.querySelectorAll('[data-sell]').forEach(b => {
        b.addEventListener('click', () => {
          sellRelic(b.dataset.sell, b.dataset.n === 'all' ? 0 : 1);
        });
      });
      grid.appendChild(el);
    }
    return;
  }

  /* 其他标签页：清点展示（不出售 —— 出手装备去军火库，穿戴去整备界面） */
  btnAll.classList.add('hidden');
  const rows = stashOtherRows();
  let n = 0, v = 0;
  for (const r of rows) { n += r.n; v += r.worth; }
  $('stashCount').textContent = n;
  $('stashWorth').textContent = '¥' + fmtMoney(v);
  $('stashSold').textContent = '¥' + fmtMoney(SAVE.stats.sold | 0);
  note.textContent = STASH_TAB_NOTE[stashTab] || '';
  if (!rows.length) {
    stashEmpty(grid, STASH_TAB_EMPTY[stashTab] || '这里是空的');
    return;
  }
  for (const o of rows) grid.appendChild(stashCard(o));
}

function sellRelic(id, n) {
  const r = RELICS[id];
  if (!r) return;
  const have = SAVE.stash[id] | 0;
  if (have <= 0) return;
  const qty = n > 0 ? Math.min(n, have) : have;
  /* 逐件结算：卖得越多单价越低（同一批里也按顺序衰减） */
  let gain = 0;
  for (let i = 0; i < qty; i++) {
    gain += relicSellPrice(id);
    SAVE.soldN[id] = ((SAVE.soldN[id] | 0) + 1);
  }
  SAVE.credits += gain;
  SAVE.stats.sold = (SAVE.stats.sold | 0) + gain;
  const left = have - qty;
  if (left > 0) SAVE.stash[id] = left;
  else delete SAVE.stash[id];

  saveGame();
  Sfx.tone(760, 0.06, 0.16, 'triangle');
  setTimeout(() => Sfx.tone(1120, 0.05, 0.12, 'triangle'), 55);
  uiToast('出售 ' + r.name + ' ×' + qty + '　+ ¥' + fmtMoney(gain), 'small');
  refreshStash();
  refreshStashBadge();
}

function sellAllRelics() {
  const t = stashTotals();
  if (t.n === 0) return;
  /* 逐件按衰减价结算（顺序：仓库键序） */
  let gain = 0;
  for (const id in SAVE.stash) {
    if (!RELICS[id]) continue;
    const qty = SAVE.stash[id] | 0;
    for (let i = 0; i < qty; i++) {
      gain += relicSellPrice(id);
      SAVE.soldN[id] = ((SAVE.soldN[id] | 0) + 1);
    }
  }
  SAVE.credits += gain;
  SAVE.stats.sold = (SAVE.stats.sold | 0) + gain;
  SAVE.stash = {};
  saveGame();
  Sfx.loot();
  setTimeout(() => Sfx.tone(980, 0.06, 0.2, 'triangle'), 70);
  uiToast('清空仓库　+ ¥' + fmtMoney(gain), '');
  refreshStash();
  refreshStashBadge();
}

/* ══════════ 地图面板 ══════════ */
function openMaps() {
  $('lobby').classList.add('hidden');
  $('maps').classList.remove('hidden');

  // 编辑器「写入本机游戏」会更新本地存档，这里顺手同步一次
  const stored = loadStoredMap();
  if (stored) {
    const cur = G.customMap;
    const differs = !cur || cur.name !== stored.name || cur.w !== stored.w || cur.h !== stored.h ||
      JSON.stringify(cur.obstacles) !== JSON.stringify(stored.obstacles) ||
      JSON.stringify(cur.nests) !== JSON.stringify(stored.nests);
    if (differs) {
      setCustomMap(stored);
      mapMessage('已同步编辑器保存的地图「' + stored.name + '」', 'ok');
    }
  }

  refreshMapPanel();
}

function closeMaps() {
  $('maps').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshLobby();
}

function mapMessage(text, cls) {
  const el = $('mapMsg');
  if (!el) return;
  el.className = 'mapmsg' + (cls ? ' ' + cls : '');
  el.textContent = text;
}

/* ══════════ 大厅：出击前的快速选图 ══════════ */
const BUILTIN_MAP_META = {
  'zero-dam': { name: '零号大坝·普通', sub: '坝顶 · 行政辖区 · 主变电站 · 游客中心 · 阿萨拉守军' },
  'zero-dam-secret': { name: '零号大坝·机密', sub: '阿萨拉精锐 · 敌人更硬 · 战利品加码', secret: true },
  'space-base': { name: '航天基地·机密', sub: '发射场 · 拉闸撤离 · 安全总监 · 机密', secret: true },
  'space-base-top': { name: '航天基地·绝密', sub: '拉闸撤离 · 安全总监精锐卫队 · 顶级军工货', top: true },
};

function currentMapId() {
  if (!G.customMap) return 'none';
  const cm = G.customMap;
  if (cm.builtin && BUILTIN_MAPS[cm.builtin]) return cm.builtin;
  // 老存档只写了 builtin=true，没有 id：按地图名反查一次
  for (const id of Object.keys(BUILTIN_MAPS)) {
    if (BUILTIN_MAPS[id].name === cm.name) { cm.builtin = id; return id; }
  }
  return 'custom';
}

function refreshMapSelect() {
  const box = $('mapselList');
  if (!box) return;
  const curId = currentMapId();
  const list = [];

  for (const id of Object.keys(BUILTIN_MAPS)) {
    const m = BUILTIN_MAPS[id];
    const meta = BUILTIN_MAP_META[id];
    list.push({
      id,
      name: meta ? meta.name : m.name,
      sub: meta ? meta.sub : (m.w + '×' + m.h),
      secret: !!(meta && meta.secret) || m.tier === 'secret' || (meta && meta.top) || m.tier === 'top',
      top: !!(meta && meta.top) || m.tier === 'top',
    });
  }
  if (curId === 'custom') {
    list.push({
      id: 'custom',
      name: G.customMap.name,
      sub: '自定义 · ' + G.customMap.w + '×' + G.customMap.h,
    });
  }

  box.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mcard' + (it.id === curId ? ' on' : '') + (it.secret ? ' secret' : '') + (it.top ? ' top' : '');
    b.dataset.mapId = it.id;
    const mfee = entryFeeOf(it.top ? 'top' : (it.secret ? 'secret' : 'standard'));
    b.innerHTML = '<b>' + esc(it.name) + '</b><small>' + esc(it.sub) + (mfee ? ' · 门票 ¥' + fmtMoney(mfee) : '') + '</small>';
    b.title = it.name + (it.sub ? ' · ' + it.sub : '');   // 悬停看完整描述（卡片内最多两行）
    b.addEventListener('click', () => chooseMap(it.id));
    box.appendChild(b);
  }

  // 当前地图的一句话说明
  const note = $('mapselNote');
  if (!note) return;
  const cm = G.customMap;
  if (!cm) {
    note.innerHTML = '当前：<b>未选择地图</b> — 请在下方地图面板里载入一张';
  } else {
    const parts = [
      cm.w + '×' + cm.h,
      '出生点 ' + ((cm.spawns && cm.spawns.length) || 1) + ((cm.spawns && cm.spawns.length > 1) ? '（每局随机）' : ''),
      cm.extMode === 'switch'
        ? '拉闸撤离 ×' + ((cm.switches && cm.switches.length) || 0) + ' · 丢包点 1 · 无常规撤离'
        : '撤离点 ' + cm.extracts.length,
      '守军 ' + cm.units.length,
    ];
    const tag = cm.tier === 'top'
      ? '<b style="color:#d8a3ff">绝密 · 哈夫克精锐 · 战利品顶级</b> · '
      : (cm.tier === 'secret' ? '<b style="color:#ff8fa3">机密 · 敌人更硬 · 战利品加码</b> · ' : '');
    const facTxt = '<b style="color:' + factionOf(cm.faction).color + '">' + factionOf(cm.faction).name + '守军</b> · ';
    note.innerHTML = '当前：<b>' + esc(cm.name) + '</b> — ' + tag + facTxt + parts.join(' · ');
  }
}

function chooseMap(id) {
  if (!id || id === 'custom' || id === currentMapId()) {
    refreshMapSelect();
    return;
  }
  if (loadBuiltinMap(id, true)) refreshMapSelect();
}

function refreshMapPanel() {
  const cm = G.customMap;
  const squad = (G.squad && G.squad.length) ? G.squad : DEFAULT_SQUAD;
  const units = (G.units && G.units.length) ? G.units : null;
  const bossN = units ? units.filter(u => u.type === 'boss').length : 0;
  const list = units ? units.map(u => u.type) : squad;
  const c = { runner: 0, shooter: 0, brute: 0, sniper: 0, rocket: 0, flamer: 0,
              cryo: 0, cryoT: 0, cryoS: 0, nader: 0 };
  for (const t of list) if (c[t] !== undefined) c[t]++;
  const comp = [];
  const facNow = (cm && cm.faction) || 'asara';
  if (c.runner) comp.push(enemyShort('runner', facNow) + ' ' + c.runner);
  if (c.shooter) comp.push(enemyShort('shooter', facNow) + ' ' + c.shooter);
  if (c.brute) comp.push(enemyShort('brute', facNow) + ' ' + c.brute);
  if (c.sniper) comp.push(enemyShort('sniper', facNow) + ' ' + c.sniper);
  if (c.rocket) comp.push(enemyShort('rocket', facNow) + ' ' + c.rocket);
  if (c.flamer) comp.push(enemyShort('flamer', facNow) + ' ' + c.flamer);
  if (c.cryo) comp.push(enemyShort('cryo', facNow) + ' ' + c.cryo);
  if (c.cryoT) comp.push(enemyShort('cryoT', facNow) + ' ' + c.cryoT);
  if (c.cryoS) comp.push(enemyShort('cryoS', facNow) + ' ' + c.cryoS);
  if (c.nader) comp.push(enemyShort('nader', facNow) + ' ' + c.nader);
  if (bossN) comp.push(enemyShort('boss', facNow) + ' ' + bossN);
  // 容器构成：一眼看出这张图肥不肥
  const cc = {};
  for (const k of CONTAINER_IDS) cc[k] = 0;
  for (const c of (G.crates || [])) cc[containerOf(c.kind).id]++;
  const ccTxt = CONTAINER_IDS.filter(k => cc[k] > 0).map(k => CONTAINERS[k].tag + ' ' + cc[k]).join(' · ');

  const rows = [
    ['地图名称', cm ? cm.name : '未选择'],
    ['守军阵营', factionOf(G.mapFaction || (cm && cm.faction) || 'asara').name + (G.factionsMixed ? ' · 混编' : ' · 单一阵营')],
    ['地图尺寸', WORLD.w + ' × ' + WORLD.h],
    ['出生点', ((G.spawns && G.spawns.length) || 1) + ' 个' + (G.spawns && G.spawns.length > 1 ? '（每局随机）' : '')],
    ['掩体 / 容器', G.obstacles.length + ' / ' + (G.crates ? G.crates.length : 0)],
    ['容器构成', ccTxt || '—'],
    ['撤离 / 据点', G.extMode === 'switch'
      ? '拉闸撤离（' + (G.switches || []).filter(s => s.pulled).length + '/' + (G.switches || []).length + ' 闸）· 丢包点 '
        + G.extracts.filter(e => e.mode === 'naked').length
      : G.extracts.length + ' / ' + G.nests.length],
    ['守军布置', list.length + ' 人' + (comp.length ? ' · ' + comp.join(' · ') : '')],
    ['地图来源', cm ? (cm.builtin ? '内置预设 · 可导入编辑器修改' : '自定义地图文件') : '—'],
  ];
  $('mapRows').innerHTML = rows.map(r =>
    '<div class="maprow"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('');
}

function readMapFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { mapMessage('文件太大，地图 JSON 一般在 50KB 以内', 'warn'); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const r = importMapText(String(rd.result), file.name);
    mapMessage(r.msg, r.ok ? 'ok' : 'warn');
  };
  rd.onerror = () => mapMessage('文件读取失败', 'warn');
  rd.readAsText(file);
}

function refreshShop() {
  $('shopCredit').textContent = fmtMoney(SAVE.credits);
  document.querySelectorAll('#shopTabs .tab').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === shopTab);
  });

  /* 子分类行：武器=枪种 / 弹药=弹级 / 补给=用途分组，其他类目隐藏 */
  const subBar = $('shopSubTabs');
  const defs = SHOP_SUB_DEFS[shopTab];
  if (!defs) {
    subBar.classList.add('hidden');
  } else {
    if (subBar.dataset.tab !== shopTab) {          // 换类目：重建子标签
      subBar.innerHTML = '';
      for (const [id, cn] of defs) {
        const b = document.createElement('button');
        b.className = 'tab'; b.dataset.sub = id; b.textContent = cn;
        b.addEventListener('click', () => { shopSub = id; refreshShop(); });
        subBar.appendChild(b);
      }
      subBar.dataset.tab = shopTab;
    }
    subBar.classList.remove('hidden');
    subBar.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.sub === shopSub));
  }

  const grid = $('shopGrid');
  grid.innerHTML = '';

  if (shopTab === 'weapon') {
    grid.classList.add('stack');
    for (const cat of WEAPON_CATS) {
      if (shopSub !== 'all' && shopSub !== cat.id) continue;
      const guns = WEAPON_ORDER.filter(id => WEAPONS[id].cat === cat.id);
      if (!guns.length) continue;

      const sec = document.createElement('div');
      sec.className = 'wsec';

      const head = document.createElement('div');
      head.className = 'whead';
      head.innerHTML = '<span class="cn">' + cat.cn + '</span>' +
        '<span class="en">' + cat.en + '</span>' +
        '<span class="mk">' + cat.trait + ' · ' + guns.length + ' 把</span>';
      sec.appendChild(head);

      const sub = document.createElement('div');
      sub.className = 'grid';

      for (const id of guns) {
        const w = WEAPONS[id];
        const cnt = SAVE.owned[id] | 0;
        const owned = cnt > 0;
        const canAfford = SAVE.credits >= w.price;

        const el = document.createElement('div');
        el.className = 'item' + (owned ? ' owned' : '');
        const modN = owned ? gunModCount(id) : 0;
        const wear = owned ? gunWearOf(id) : 0;
        el.innerHTML =
          '<div class="top"><span class="nm">' + w.name + '</span>' +
          (owned ? '<span class="tag own">×' + cnt + ' · 改装 ' + modN + '/' + modSlotTotal(id) + (wear > 0 ? ' · 磨损 ' + wear + '%' : '') + '</span>' : '<span class="tag cat">' + cat.cn + '</span>') + '</div>' +
          '<div class="code">' + w.code + '</div>' +
          '<div class="ds">' + w.desc + '</div>' +
          '<div class="specs">' + weaponSpecs(w) + '</div>' +
          '<div class="bars wide">' +
            bar('伤害', w.bars.dmg) +
            bar('射速', w.bars.rate) +
            bar('弹匣', w.bars.mag) +
            bar('精准', w.bars.acc) +
          '</div>' +
          '<div class="buyrow">' +
            '<span class="price">' + (w.price === 0 ? '免费' : '<i>¥</i>' + fmtMoney(w.price)) + '</span>' +
            (owned
              ? '<button class="buybtn tune">改 装</button>' +
                (wear > 0 ? '<button class="buybtn svc">保 养 ¥' + fmtMoney(gunServiceCost(id)) + '</button>' : '') +
                '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>再 购</button>'
              : '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>' +
                (canAfford ? '购买' : '资金不足') + '</button>') +
          '</div>';

        const wBtns = el.querySelectorAll('.buybtn');
        wBtns.forEach(b => b.addEventListener('click', () => {
          if (b.classList.contains('tune')) openGunsmith(id);
          else if (b.classList.contains('svc')) serviceGun(id);
          else buyWeapon(id);
        }));
        sub.appendChild(el);
      }

      sec.appendChild(sub);
      grid.appendChild(sec);
    }
    return;
  }


  /* ── 弹药：按口径分组，每组 0~7 级 ──
     只列出「手上有枪的口径」，没枪的弹买了也打不出去。 */
  if (shopTab === 'ammo') {
    grid.classList.add('stack');

    const cals = CAL_ORDER.filter(cal => WEAPON_ORDER.some(id => SAVE.owned[id] && calOfWeapon(id) === cal));
    if (!cals.length) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = '<div class="ds">还没有枪 · 先去「武器」买一把，这里才会卖对应的弹。</div>';
      grid.appendChild(el);
      return;
    }

    for (const cal of cals) {
      const CC = CALIBERS[cal];
      const guns = WEAPON_ORDER.filter(id => SAVE.owned[id] && calOfWeapon(id) === cal).map(id => WEAPONS[id].short);
      const pick = ammoPickOf(cal);
      const allSale = AMMO_TIERS.filter(T => calHasTier(cal, T.lv));
      const onSale = allSale.filter(T => shopSub === 'all' || shopSub === 'lv' + T.lv);
      if (!onSale.length) continue;                    // 这个口径没有当前弹级：整组不显示
      const rangeTxt = allSale.length > 1              // 上架范围按口径真实在售弹级，不随筛选变
        ? ('上架 ' + allSale[0].grade + ' ~ ' + allSale[allSale.length - 1].grade)
        : ('仅 ' + allSale[0].grade);

      const sec = document.createElement('div');
      sec.className = 'wsec';

      const head = document.createElement('div');
      head.className = 'whead';
      head.innerHTML = '<span class="cn">' + CC.name + '</span>' +
        '<span class="en">' + CC.short + '</span>' +
        '<span class="mk">' + guns.join(' / ') + ' · 库存 ' + ammoTotalOf(cal) + ' 发 · 每盒 ' + CC.box + ' 发 · ' + rangeTxt + '</span>';
      sec.appendChild(head);

      const sub = document.createElement('div');
      sub.className = 'grid';

      for (const T of onSale) {
        const stock = ammoStock(cal, T.lv);
        const price = ammoPrice(cal, T.lv);
        const canAfford = SAVE.credits >= price;
        const isPick = pick === T.lv;

        const el = document.createElement('div');
        el.className = 'item' + (isPick ? ' owned' : '');
        if (isPick) el.style.outline = '1px solid ' + T.color;
        el.style.cursor = 'pointer';
        el.innerHTML =
          '<div class="top"><span class="nm" style="color:' + T.color + '">' + T.grade + ' · ' + T.name + '</span>' +
          '<span class="tag' + (isPick ? ' own' : '') + '">' +
            (isPick ? '装填中' : (stock > 0 ? '库存 ' + stock + ' 发' : '未持有')) + '</span></div>' +
          '<div class="code">' + T.key.toUpperCase() + ' · 穿透 ' + T.lv + ' 级 · 伤害 ×' + T.dmgMul.toFixed(2) + '</div>' +
          '<div class="ds">' + T.desc + '</div>' +
          '<div class="ds" style="color:#6fb0cf">' + penTableText(T.lv) + '</div>' +
          '<div class="ds" style="color:' + (stock > 0 ? T.color : '#4a6579') + '">' +
            (stock > 0 ? ('手上 ' + stock + ' 发') : '手上没有这一级') + '</div>' +
          '<div class="buyrow">' +
            '<span class="price"><i>¥</i>' + fmtMoney(price) + '<i> / ' + CC.box + ' 发</i></span>' +
            '<button class="buybtn"' + (canAfford ? '' : ' disabled') + '>' +
            (canAfford ? '购买' : '资金不足') + '</button>' +
          '</div>';

        el.addEventListener('click', ev => {
          if (ev.target.closest('.buybtn')) return;
          selectAmmo(cal, T.lv);
        });
        el.querySelector('.buybtn').addEventListener('click', ev => {
          ev.stopPropagation();
          buyAmmo(cal, T.lv);
        });
        sub.appendChild(el);
      }

      sec.appendChild(sub);
      grid.appendChild(sec);
    }
    return;
  }

  grid.classList.remove('stack');
  if (shopTab === 'melee') {
    for (const id of MELEE_ORDER) {
      const M = MELEES[id];
      const owned = !!(SAVE.ownedMelee && SAVE.ownedMelee[id]);
      const equipped = SAVE.equippedMelee === id;
      const canAfford = SAVE.credits >= M.price;

      const el = document.createElement('div');
      el.className = 'item' + (owned ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm">' + M.name + '</span>' +
        (equipped ? '<span class="tag own">已装备</span>'
                  : (owned ? '<span class="tag">已拥有</span>' : '<span class="tag cat">近战</span>')) + '</div>' +
        '<div class="code">' + M.code + '</div>' +
        '<div class="ds">' + M.desc + '</div>' +
        '<div class="specs">' +
          '<span class="spec"><i>伤害</i><b>' + M.dmg + '</b></span>' +
          '<span class="spec"><i>出手</i><b>' + (1 / M.rate).toFixed(1) + ' 刀/秒</b></span>' +
          '<span class="spec"><i>范围</i><b>' + Math.round(M.reach + 16) + ' px</b></span>' +
          '<span class="spec"><i>噪音</i><b>260</b></span>' +
        '</div>' +
        '<div class="buyrow">' +
          '<span class="price">' + (M.price === 0 ? '免费' : '<i>¥</i>' + fmtMoney(M.price)) + '</span>' +
          '<button class="buybtn' + (owned ? ' tune' : '') + '"' + (!owned && !canAfford ? ' disabled' : '') + '>' +
          (owned ? (equipped ? '已装备' : '装 备') : (canAfford ? '购买' : '资金不足')) + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => {
        if (owned) {
          SAVE.equippedMelee = id;
          saveGame();
          refreshShop();
          uiToast('已装备 ' + M.name, 'small');
        } else buyMelee(id);
      });
      grid.appendChild(el);
    }
    return;
  }

  /* 携行装备拆两页：弹挂 / 背包 —— 品质从白到红，格数越高越贵 */
  /* ── 黑市：每天 3 件限量货，纯自愿水槽 ── */
  if (shopTab === 'market') {
    const BM = ensureBlackMarket();
    grid.classList.add('stack');
    const sec = document.createElement('div');
    sec.className = 'wsec';
    const head = document.createElement('div');
    head.className = 'whead';
    head.innerHTML = '<span class="cn">今日黑市</span>' +
      '<span class="en">BLACK MARKET</span>' +
      '<span class="mk">每天 3 件 · 每件限量 · 明日 0 点换货 · 不退不换</span>';
    sec.appendChild(head);
    const sub = document.createElement('div');
    sub.className = 'grid';
    for (let i = 0; i < BM.items.length; i++) {
      const it = BM.items[i];
      const stock = it.stock | 0;
      const canAfford = SAVE.credits >= it.price;
      const el = document.createElement('div');
      el.className = 'item' + (stock <= 0 ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm" style="color:' + it.color + '">' + it.name + '</span>' +
        '<span class="tag cat">限量 ×' + stock + '</span></div>' +
        '<div class="ds">' + it.desc + '</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(it.price) + '</span>' +
          '<button class="buybtn"' + (stock <= 0 || !canAfford ? ' disabled' : '') + '>' +
          (stock <= 0 ? '售 罄' : (canAfford ? '买 下' : '资金不足')) + '</button>' +
        '</div>';
      el.querySelector('.buybtn').addEventListener('click', () => buyBlackMarket(i));
      sub.appendChild(el);
    }
    sec.appendChild(sub);
    grid.appendChild(sec);
    return;
  }

  if (shopTab === 'rig' || shopTab === 'pack') {
    const kindName = k => k === 'rig' ? '弹挂' : '背包';
    for (const key in GEAR) {
      const s = GEAR[key];
      if (s.kind !== shopTab) continue;                  // 只在对应页显示弹挂 / 背包
      const gcnt = (SAVE.gearOwned && SAVE.gearOwned[key]) | 0;
      const gowned = gcnt > 0;
      const canAfford = SAVE.credits >= s.price;

      const el = document.createElement('div');
      el.className = 'item' + (gowned ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm" style="color:' + s.color + '">' + s.name + '</span>' +
        (gowned ? '<span class="tag own">×' + gcnt + '</span>' : '<span class="tag" style="color:' + s.color + '">' + s.q + ' · ' + kindName(s.kind) + '</span>') + '</div>' +
        '<div class="ds">' + s.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">' + kindName(s.kind) + ' · 穿上后 ' + s.cap + ' 格' +
          (s.blocks ? '（隔舱 ' + blkSizesText(s.blocks) + '）' : '') + ' · 整备界面穿 / 脱</div>' +
        ((s.ads || s.spd) ? '<div class="ds" style="color:#ff9c8a">修正：' + (s.ads ? '瞄准速度 ' + s.ads + '%　' : '') + (s.spd ? '移动速度 ' + s.spd + '%' : '') + '</div>' : '') +
        '<div class="bars">' + bar('容量', s.cap / 50) + '</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(s.price) + '</span>' +
          '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>' +
          (canAfford ? (gowned ? '再 购' : '购买') : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyGear(key));
      grid.appendChild(el);
    }
    return;
  }

  if (shopTab === 'armor') {
    /* 护甲：17 件具名甲（3-6 级），每件有自己的耐久 / 双惩罚 / 维修属性 —— 买的是「一件」实体 */
    for (const a of ARMORS) {
      if (a.id === 0) continue;
      const have = (SAVE.armorPieces || []).filter(p => p.id === a.id).length;
      const canAfford = SAVE.credits >= a.price;

      const el = document.createElement('div');
      el.className = 'item' + (have > 0 ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm" style="color:' + armorLvColor(a.lv) + '">' + a.name + '</span>' +
        (have > 0 ? '<span class="tag own">仓库 ×' + have + '</span>' : '<span class="tag">' + a.lv + ' 级甲</span>') + '</div>' +
        '<div class="ds">' + a.desc + '</div>' +
        '<div class="bars">' + bar('耐久', a.hp / ARMOR_MAX_HP) + '</div>' +
        '<div class="ds" style="color:#6fb0cf">耐久 ' + a.hp + ' · 爆炸/近战减免 ' + Math.round(a.dr * 100) + '% · 瞄准惩罚 -' + Math.round(a.aim * 100) + '% · 移速惩罚 -' + Math.round(a.move * 100) + '% · 维修效率 ' + a.effName + '（1 点甲修剂修 ' + a.eff + ' 耐久） · 耐久损耗 ' + a.lossName + '（修满一次磨上限 ' + Math.round(a.loss * 100) + '%）</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(a.price) + '</span>' +
          '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>' +
          (canAfford ? '购买' : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyArmor(a.id));
      grid.appendChild(el);
    }
  } else if (shopTab === 'helmet') {
    /* 头盔：没有耐久条，卖的是「听觉」+ 对低级别子弹的平减 —— 和护甲是两个槽，可以叠着戴 */
    for (const h of HELMETS) {
      if (h.id === 0) continue;
      const have = (SAVE.helmetOwned && SAVE.helmetOwned[h.id]) | 0;
      const wearing = SAVE.wornHelmet === h.id;
      const canAfford = SAVE.credits >= h.price;

      const el = document.createElement('div');
      el.className = 'item' + (have > 0 ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm" style="color:' + armorLvColor(h.lv) + '">' + h.name + '</span>' +
        (wearing ? '<span class="tag own">头上戴着</span>'
                 : (have > 0 ? '<span class="tag own">仓库 ×' + have + '</span>' : '<span class="tag">' + h.lv + ' 级头</span>')) +
        '</div>' +
        '<div class="ds">' + h.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">' +
          (h.dr > 0 ? ('≤' + h.drLv + ' 级弹减伤 ' + Math.round(h.dr * 100) + '%') : '无防护') +
          ' · 拾音 ' + (h.hear >= 0 ? '+' : '') + Math.round(h.hear * 100) + '%' +
          ' · 降噪 ' + h.quietName + helmetFovTag(h) +
          (h.aim ? ' · 瞄准 -' + Math.round(h.aim * 100) + '%' : '') +
          (h.move ? ' · 移速 -' + Math.round(h.move * 100) + '%' : '') +
          ' · 阵亡丢头上这顶</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(h.price) + '</span>' +
          '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>' +
          (canAfford ? '购买' : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyHelmet(h.id));
      grid.appendChild(el);
    }
  } else {
    /* 医疗包：六种各有自己的耐久 / 回血速度 / 启动读条（注射器也归「治疗」） */
    for (const id of MEDKIT_ORDER) {
      if (shopSub !== 'all' && shopSub !== 'treat') continue;
      const M = MEDKITS[id];
      const held = (SAVE.meds && SAVE.meds[id] && SAVE.meds[id].n) | 0;
      const canAfford = SAVE.credits >= M.price;
      const perkTxt = M.perk === 'move' ? ' · 挂水不减速'
        : (M.perk === 'cure' ? ' · 治伤口 + ' + M.pain + 's 止痛' : '');

      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        '<div class="top"><span class="nm">' + M.name + '</span>' +
        '<span class="tag" style="color:' + gradeColor(M.grade) + '">' + M.grade + ' · 持有 ×' + held + '</span></div>' +
        '<div class="ds">' + M.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">耐久 ' + M.dur + ' · ' + M.hps + ' 血/秒 · 启动 ' + M.wind + 's' + perkTxt + '</div>' +
        '<div class="bars">' + bar('容量', M.dur / 800) + '</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(M.price) + '</span>' +
          '<button class="buybtn"' + (canAfford ? '' : ' disabled') + '>' +
          (canAfford ? '购买' : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyMedkit(id));
      grid.appendChild(el);
    }

    /* 急救 / 止痛：按份数囤，三片一瓶的止痛片一次进 3 份（绷带止血带归「手术」——所有手术包都能止血） */
    for (const id of STOP_ORDER) {
      if (shopSub !== 'all' && shopSub !== (STOP_PAINS.includes(id) ? 'pain' : 'surg')) continue;
      const S = STOPS[id];
      const held = (SAVE.stops && SAVE.stops[id]) | 0;
      const canAfford = SAVE.credits >= S.price;
      const pack = Math.max(1, S.uses | 0);

      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        '<div class="top"><span class="nm">' + S.name + '</span>' +
        '<span class="tag" style="color:' + gradeColor(S.grade) + '">' + S.grade + ' · 持有 ×' + held + '</span></div>' +
        '<div class="code">' + S.code + ' · <b style="color:' + gradeColor(S.grade) + '">' + S.grade + '</b></div>' +
        '<div class="ds">' + S.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">' +
          (S.pain ? ('单次止痛 ' + S.pain + 's · ' + (pack > 1 ? '一份 ' + pack + ' 次' : '一次性'))
                  : (S.layers > 1 ? '一次压住全部流血层' : '一次止 1 层流血'))
          + ' · 读条 ' + S.sec + 's</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(S.price) + '</span>' +
          '<button class="buybtn"' + (canAfford ? '' : ' disabled') + '>' +
          (canAfford ? (pack > 1 ? '购买 ×' + pack : '购买') : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyStop(id));
      grid.appendChild(el);
    }

    /* 手术包：按"剩几次刀"算，买一次补满一整包 */
    for (const id of SURG_ORDER) {
      if (shopSub !== 'all' && shopSub !== 'surg') continue;
      const S = SURGERIES[id];
      const uses = (SAVE.surgs && SAVE.surgs[id] && SAVE.surgs[id].uses) | 0;
      const full = uses >= S.uses;
      const canAfford = SAVE.credits >= S.price;

      const el = document.createElement('div');
      el.className = 'item' + (full ? ' owned' : '');
      el.innerHTML =
        '<div class="top"><span class="nm">' + S.name + '</span>' +
        '<span class="tag' + (full ? ' own' : '') + '" style="color:' + gradeColor(S.grade) + '">' + S.grade + ' · ' + (uses > 0 ? '剩 ' + uses + '/' + S.uses + ' 次' : '未持有') + '</span></div>' +
        '<div class="code">' + S.code + ' · <b style="color:' + gradeColor(S.grade) + '">' + S.grade + '</b></div>' +
        '<div class="ds">' + S.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">' + S.uses + ' 次 · 单次读条 ' + S.sec + 's · 治贯穿伤 / 骨折 / 骨裂 · 止血</div>' +
        '<div class="bars">' + bar('剩余次数', uses / S.uses) + '</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(S.price) + '</span>' +
          '<button class="buybtn' + (full ? ' owned' : '') + '"' + (full || !canAfford ? ' disabled' : '') + '>' +
          (full ? '已满' : (canAfford ? (uses > 0 ? '补满' : '购买') : '资金不足')) + '</button>' +
        '</div>';

      if (!full) el.querySelector('.buybtn').addEventListener('click', () => buySurg(id));
      grid.appendChild(el);
    }

    /* 甲修包：跟医疗包一样的耐久消耗品 —— 蓝修 1-3 级 / 紫 1-4 / 金 1-5 / 红全甲 */
    for (const id of REPAIR_ORDER) {
      if (shopSub !== 'all' && shopSub !== 'repair') continue;
      const R = REPAIRS[id];
      const s = (SAVE.repairs && SAVE.repairs[id]) || { n: 0, left: 0 };
      const held = (s.n | 0) + ((Number(s.left) || 0) > 0.01 ? 1 : 0);
      const canAfford = SAVE.credits >= R.price;

      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        '<div class="top"><span class="nm" style="color:' + R.color + '">' + R.name + '</span>' +
        '<span class="tag" style="color:' + gradeColor(R.grade) + '">' + R.grade + ' · 持有 ×' + held + '</span></div>' +
        '<div class="ds">' + R.desc + '</div>' +
        '<div class="ds" style="color:#6fb0cf">' + R.dur + ' 点 · 可修 ' + R.capLv + ' 级及以下 · 读条 ' + R.wind + 's · 整备/局内按 5 长按选用</div>' +
        '<div class="buyrow">' +
          '<span class="price"><i>¥</i>' + fmtMoney(R.price) + '</span>' +
          '<button class="buybtn"' + (!canAfford ? ' disabled' : '') + '>' +
          (canAfford ? '购买' : '资金不足') + '</button>' +
        '</div>';

      el.querySelector('.buybtn').addEventListener('click', () => buyRepair(id));
      grid.appendChild(el);
    }
  }

}

/* 分类名 + 枪名，例如「步枪 · M4A1」 */
function weaponCatOf(w) {
  for (const c of WEAPON_CATS) if (c.id === w.cat) return c;
  return WEAPON_CATS[0];
}
function weaponName(w) { return weaponCatOf(w).cn + ' · ' + w.name; }

function bar(label, v) {
  const pct = Math.round(clamp(v, 0, 1) * 100);
  return '<div class="bar"><span>' + label + '</span><span class="track"><span class="fill" style="width:' + pct + '%"></span></span></div>';
}

/* 武器详细参数（军火库卡片用） */
function weaponSpecs(w) {
  const per = w.dmg * (w.count > 1 ? w.count : 1);
  /* 点射枪的循环是「一轮 N 发 + 轮间隔」，DPS 不能只按单发间隔算 */
  const burstN = w.mode === 'burst' ? (w.burst || 3) : 0;
  const cycle = burstN ? w.rate + (burstN - 1) * (w.burstGap || 0.06) : w.rate;
  const dps = Math.round(per * (burstN || 1) / cycle);
  const rateTxt = w.mode === 'burst'
    ? (w.burst || 3) + ' 连发'
    : (1 / w.rate).toFixed(1) + ' 发/秒';
  const fireTxt = w.mode === 'auto' ? '全自动' : (w.mode === 'burst' ? '三连点射' : '半自动');
  const C = CALIBERS[w.cal] || CALIBERS['919'];
  const rows = [
    ['定位', w.role || '—'],
    ['口径', C.short],
    ['单发伤害', w.count > 1 ? per + '<i>(' + w.dmg + '×' + w.count + ')</i>' : String(w.dmg)],
    ['护甲伤害', w.armorDmg
      ? (w.count > 1 ? (w.armorDmg * w.count) + '<i>(' + w.armorDmg + '×' + w.count + ')</i>' : String(w.armorDmg)) +
        '<i> · 4 级甲约 ' + Math.ceil(93 / (w.armorDmg * w.count)) + ' 发磨穿</i>'
      : '—'],
    ['射速', rateTxt],
    ['射击方式', fireTxt],
    ['穿透', w.pierce ? w.pierce + ' 人' : '—'],
    ['弹匣', w.mag + ' 发'],
    ['备弹', w.reserveMul > 0 ? (w.mag * w.reserveMul) + ' 发' : '—'],
    ['理论 DPS', String(dps)],
    ['射程', String(w.range)],
    ['远距衰减', w.fb ? (w.fb.d0 + ' 外掉至 ' + Math.round(w.fb.min * 100) + '%') : '无'],
    ['开镜精度', '散布 ×' + adsOf(w).spread.toFixed(2)],
    ['开镜移速', Math.round(adsOf(w).move * 100) + '%'],
  ];
  return rows.map(r => '<div class="spec"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}

/* 新买的枪往哪放：空槽优先，都满了就替换主武器 */
function autoAssign(id) {
  if (!SAVE.loadout) SAVE.loadout = { primary: null, secondary: null, pistol: null };
  const LO = SAVE.loadout;
  if (PISTOL_IDS[id]) { LO.pistol = id; return 'pistol'; }
  if (!LO.primary || !SAVE.owned[LO.primary]) { LO.primary = id; return 'primary'; }
  if (!LO.secondary || !SAVE.owned[LO.secondary]) { LO.secondary = id; return 'secondary'; }
  LO.primary = id;
  return 'primary';
}

/* 保养：磨损清零，按磨损比例收费（磨满一次 = 枪价 25%） */
function serviceGun(id) {
  const cost = gunServiceCost(id);
  if (cost <= 0) return;
  if (SAVE.credits < cost) { uiToast('资金不足：保养需要 ¥' + fmtMoney(cost), 'warn'); return; }
  SAVE.credits -= cost;
  SAVE.gunWear[id] = 0;
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast(WEAPONS[id].name + ' 保养完毕 · 磨损 0%', 'small');
}

/* 黑市购买：库存记在 SAVE.blackMarket.items[i].stock 上，售罄等明天 */
function buyBlackMarket(i) {
  const BM = ensureBlackMarket();
  const it = BM.items[i];
  if (!it || (it.stock | 0) <= 0) return;
  if (SAVE.credits < it.price) return;
  SAVE.credits -= it.price;
  it.stock--;
  if (it.t === 'ammo') {
    addAmmoStock(it.cal, it.lv, it.n);
  } else if (it.t === 'repair') {
    const s = SAVE.repairs[it.id] || (SAVE.repairs[it.id] = { n: 0, left: 0 });
    s.n = Math.min(99, (s.n | 0) + 1);
  }
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('黑市成交：' + it.name, 'small');
}

function buyWeapon(id) {
  const w = WEAPONS[id];
  if (SAVE.credits < w.price) return;
  SAVE.credits -= w.price;
  SAVE.owned[id] = (SAVE.owned[id] | 0) + 1;   // 多实例：买几把囤几把
  const slot = autoAssign(id);
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + w.short + ' · 装入' + (slot === 'pistol' ? '手枪' : (slot === 'secondary' ? '副武器' : '主武器')), 'small');
}

function buyMelee(id) {
  const M = MELEES[id];
  if (!M || (SAVE.ownedMelee && SAVE.ownedMelee[id]) || SAVE.credits < M.price) return;
  SAVE.credits -= M.price;
  SAVE.ownedMelee[id] = true;
  SAVE.equippedMelee = id;
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + M.name + ' · 已装备', 'small');
}

/* 买护甲：护甲是仓库里的实体件，可以囤 —— 穿上要进整备界面，阵亡丢的是身上这件 */
function buyArmor(id) {
  const a = ARMORS[id];
  if (!a || a.id === 0 || SAVE.credits < a.price) return;
  SAVE.credits -= a.price;
  if (!SAVE.armorPieces) SAVE.armorPieces = [];
  SAVE.armorPieces.push({ id: a.id, hp: a.hp, max: a.hp });
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + a.name + ' · 进仓库 · 整备界面穿上', 'small');
}

/* 买头盔：按件数记（不像护甲每件记耐久）；头上那顶也算在件数里，戴上要进整备界面 */
function buyHelmet(id) {
  const h = HELMETS[id | 0];
  if (!h || h.id === 0 || SAVE.credits < h.price) return;
  SAVE.credits -= h.price;
  if (!SAVE.helmetOwned) SAVE.helmetOwned = {};
  SAVE.helmetOwned[h.id] = Math.min(9, (SAVE.helmetOwned[h.id] | 0) + 1);
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + h.name + ' · 整备界面戴上', 'small');
}

/* 买一份甲修包：进仓库（未拆封），整备界面抓进格子、局内按 5 用 */
function buyRepair(id) {
  const R = REPAIRS[id];
  if (!R || SAVE.credits < R.price) return;
  SAVE.credits -= R.price;
  const s = SAVE.repairs[id] || (SAVE.repairs[id] = { n: 0, left: 0 });
  s.n = Math.min(99, (s.n | 0) + 1);
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + R.name + ' · 进仓库 · 整备界面装进弹挂/背包', 'small');
}

/* 买一支医疗包：进背包（未开封），顺便帮第一次买的人把它设成默认 */
function buyMedkit(id) {
  const M = MEDKITS[id];
  if (!M || SAVE.credits < M.price) return;
  SAVE.credits -= M.price;
  if (!SAVE.meds) SAVE.meds = {};
  const s = SAVE.meds[id] || (SAVE.meds[id] = { n: 0, left: 0 });
  s.n = Math.min(99, (s.n | 0) + 1);
  if (saveMedTotal() === 1) SAVE.carePick = careKeyMake('med', id);
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + M.name + ' ×1', 'small');
}

/* 买一份急救 / 止痛：止痛片一次进 3~5 份，库存按份叠 */
function buyStop(id) {
  const S = STOPS[id];
  if (!S || SAVE.credits < S.price) return;
  SAVE.credits -= S.price;
  if (!SAVE.stops) SAVE.stops = {};
  const add = Math.max(1, S.uses | 0);
  SAVE.stops[id] = Math.min(99, ((SAVE.stops[id] | 0) + add));
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + S.name + (add > 1 ? ' · ' + add + ' 次' : ' ×1'), 'small');
}

/* 买手术包：一个整包，直接补满次数（不能囤两包） */
function buySurg(id) {
  const S = SURGERIES[id];
  if (!S || SAVE.credits < S.price) return;
  if (!SAVE.surgs) SAVE.surgs = {};
  const s = SAVE.surgs[id] || (SAVE.surgs[id] = { uses: 0 });
  if ((s.uses | 0) >= S.uses) return;
  SAVE.credits -= S.price;
  s.uses = S.uses;
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + S.name + ' · ' + S.uses + ' 次', 'small');
}

/* 买一盒弹药：按口径的盒装发数进库存 */
function buyAmmo(cal, lv) {
  const C = CALIBERS[cal], T = ammoTier(lv);
  if (!C || !T) return;
  if (!calHasTier(cal, lv)) { uiToast(C.short + ' 不上架这一级弹', 'small warn'); return; }
  const price = ammoPrice(cal, lv);
  if (SAVE.credits < price) return;
  SAVE.credits -= price;
  addAmmoStock(cal, lv, C.box);
  /* 第一次买这个口径，或者原来选的那级已经打光，就顺手设成默认弹 */
  if (!SAVE.ammoPick) SAVE.ammoPick = {};
  if (SAVE.ammoPick[cal] == null || ammoStock(cal, SAVE.ammoPick[cal] | 0) <= 0) SAVE.ammoPick[cal] = lv;
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + C.short + ' ' + T.grade + ' ×' + C.box + ' 发', 'small');
}

/* 把某一级设为这个口径的默认装填 */
function selectAmmo(cal, lv) {
  if (!CALIBERS[cal]) return;
  if (!calHasTier(cal, lv)) { uiToast(CALIBERS[cal].short + ' 不上架这一级弹', 'small warn'); return; }
  if (ammoStock(cal, lv) <= 0) { uiToast('这一级还没货 · 先买一盒', 'small warn'); return; }
  if (!SAVE.ammoPick) SAVE.ammoPick = {};
  SAVE.ammoPick[cal] = lv;
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已选用 ' + CALIBERS[cal].short + ' ' + ammoTier(lv).grade + ' 弹', 'small');
}

function buyGear(key) {
  const s = GEAR[key];
  if (!s) return;
  if (SAVE.credits < s.price) return;
  SAVE.credits -= s.price;
  SAVE.gearOwned[key] = (SAVE.gearOwned[key] | 0) + 1;   // 多实例：买几件有几件，穿不穿在整备界面自己决定
  saveGame();
  Sfx.init(); Sfx.resume(); Sfx.pickup();
  refreshShop();
  uiToast('已购入 ' + s.name + ' · 去整备界面穿上', 'small');
}

/* ══════════════════════════════════════════════════════════
   整备界面：左装备 · 右仓库（三角洲式）
   ──────────────────────────────────────────────────────────
   左边是出击装备：主武器 / 副武器 / 手枪 / 近战四个武器槽，
   护甲 / 弹挂 / 背包三个穿着槽，加弹挂格 / 口袋格 / 背包格三排容器。
   右边是仓库：武器 / 护甲 / 携行装备 / 弹药 / 医疗都在这儿。
   点一下拿在手上再点目标格放下，或者直接拖过去；右键 / 点仓库放回。
   装格 = 从仓库真扣，放回 = 真还（用剩的耐久 / 次数 / 发数都保留）。
   手上的东西（held）可以是：med / stop / surg / ammo 四种格子，
   也可以是 gun / melee / armor / gear 四种装备指针。
   ══════════════════════════════════════════════════════════ */
const LO_UI = { held: null };

/* 图标是口径标签这类多字符文本时按长度缩字号，免得撑出小格子 */
function icSizeCls(s) {
  const n = s ? s.length : 0;
  if (n <= 3) return '';
  return n >= 6 ? ' ic-narrow' : ' ic-wide';
}

function cellIcon(c) {
  if (!c) return '';
  if (c.t === 'med') return '✚';
  if (c.t === 'repair') return '⚒';
  if (c.t === 'stop') return '✦';
  if (c.t === 'surg') return '⚕';
  if (c.t === 'ammo') return CALIBERS[c.cal] ? (CALIBERS[c.cal].tag || '▣') : '▣';
  if (c.t === 'gun') return PISTOL_IDS[c.id] ? '⌐' : '⌖';
  if (c.t === 'relic') return RELICS[c.id] ? RELICS[c.id].icon : '◆';
  if (c.t === 'mod') return MODS[c.id] ? MODS[c.id].icon : '◆';
  if (c.t === 'melee') return '†';
  if (c.t === 'armor') return '⛨';
  if (c.t === 'gear') return (GEAR[c.key] && GEAR[c.key].kind === 'rig') ? '▤' : '▩';
  return '?';
}
function cellName(c) {
  if (!c) return '';
  if (c.t === 'med') return (MEDKITS[c.id] || MEDKITS[STARTER_MEDKIT]).short;
  if (c.t === 'repair') return (REPAIRS[c.id] || REPAIRS.repair_b).short;
  if (c.t === 'stop') return (STOPS[c.id] || STOPS.bandage).short;
  if (c.t === 'surg') return (SURGERIES[c.id] || SURGERIES.surg_simple).short;
  if (c.t === 'ammo') return CALIBERS[c.cal].short;
  if (c.t === 'gun') return WEAPONS[c.id] ? WEAPONS[c.id].short : '?';
  if (c.t === 'relic') return RELICS[c.id] ? RELICS[c.id].name : '?';
  if (c.t === 'mod') return MODS[c.id] ? MODS[c.id].name : '?';
  if (c.t === 'melee') return MELEES[c.id] ? MELEES[c.id].name : '?';
  if (c.t === 'armor') return ARMORS[c.id] ? ARMORS[c.id].name : '?';
  if (c.t === 'gear') return GEAR[c.key] ? GEAR[c.key].name : '?';
  return '?';
}
function cellSub(c) {
  if (!c) return '';
  if (c.t === 'med') {
    const M = MEDKITS[c.id];
    const l = Math.round(c.left);
    return (l >= M.dur - 0.5) ? ('耐久 ' + M.dur) : ('剩 ' + l + '/' + M.dur);
  }
  if (c.t === 'repair') {
    const R = REPAIRS[c.id];
    const l = Math.round(c.left);
    return (l >= R.dur - 0.5) ? (R.dur + ' 点 · 修' + R.capLv + '级甲') : ('剩 ' + l + '/' + R.dur);
  }
  if (c.t === 'stop') {                            // 瓶装类报剩余片数，一次性的照旧
    const cap = Math.max(1, ((STOPS[c.id] || STOPS.bandage).uses | 0) || 1);
    const n = (c.n | 0) || 1;
    return cap > 1 ? ('剩 ' + n + '/' + cap + ' 片') : '一次性';
  }
  if (c.t === 'surg') return '剩 ' + (c.uses | 0) + '/' + SURGERIES[c.id].uses + ' 次';
  if (c.t === 'ammo') {
    const T = ammoTier(c.lv == null ? 1 : c.lv);
    return T.grade + ' · ' + (c.n | 0) + ' 发';
  }
  if (c.t === 'gun') {
    const W = WEAPONS[c.id];
    return W ? (caliberOf(c.id).short + ' · ' + W.mag + ' 发弹匣') : '';
  }
  if (c.t === 'relic') return RELICS[c.id] ? ('¥' + fmtMoney(RELICS[c.id].price)) : '';
  if (c.t === 'mod') {
    const m = MODS[c.id];
    if (!m) return '';
    const sl = typeof MOD_SLOTS !== 'undefined' && MOD_SLOTS.find(s => s.id === m.slot);
    return (sl ? sl.cn + ' · ' : '') + (QUALITY[m.q] ? QUALITY[m.q].name : m.q);
  }
  if (c.t === 'melee') return MELEES[c.id] ? ('伤害 ' + MELEES[c.id].dmg + ' · 静音') : '';
  if (c.t === 'armor') {
    const A = ARMORS[c.id];
    if (!A) return '';
    const m = Math.max(1, Math.floor(c.max || A.hp));
    return A.lv + ' 级 · ' + Math.floor(c.hp) + '/' + m + ' · 瞄-' + Math.round(A.aim * 100) + '% 移-' + Math.round(A.move * 100) + '%';
  }
  if (c.t === 'gear') return GEAR[c.key] ? (GEAR[c.key].kind === 'rig' ? '弹挂 · ' : '背包 · ') + GEAR[c.key].cap + ' 格' : '';
  return '';
}
function cellColor(c) {
  if (!c) return '#8fd8f2';
  if (c.t === 'med') return (MEDKITS[c.id] || MEDKITS[STARTER_MEDKIT]).color;
  if (c.t === 'repair') return (REPAIRS[c.id] || REPAIRS.repair_b).color;
  if (c.t === 'stop') return (STOPS[c.id] || STOPS.bandage).color;
  if (c.t === 'surg') return (SURGERIES[c.id] || SURGERIES.surg_simple).color;
  if (c.t === 'ammo') return ammoTier(c.lv == null ? 1 : c.lv).color;
  if (c.t === 'gun') return '#ffca7a';
  if (c.t === 'relic') return RELICS[c.id] && QUALITY[RELICS[c.id].q] ? QUALITY[RELICS[c.id].q].color : '#ffd08a';
  if (c.t === 'mod') return MODS[c.id] && QUALITY[MODS[c.id].q] ? QUALITY[MODS[c.id].q].color : '#c9a3ff';
  if (c.t === 'melee') return '#c9f2ff';
  if (c.t === 'armor') return armorLvColor((ARMORS[c.id] || ARMORS[0]).lv);
  if (c.t === 'gear') return '#ffb08a';
  return '#8fd8f2';
}

/* 手上的东西放回仓库：格子走 cellToStock，护甲加回件数，武器 / 近战 / 携行
   本来就记在所有权里，扔掉手上指针就行。 */
function heldToStock(h) {
  if (!h) return;
  if (h.t === 'med' || h.t === 'stop' || h.t === 'surg' || h.t === 'ammo' || h.t === 'repair') { cellToStock(h); return; }
  if (h.t === 'armor') {
    /* 两种形态：仓库件指针 { id, piece } 和背包里的护甲格 { id, hp, max } */
    if (!Array.isArray(SAVE.armorPieces)) SAVE.armorPieces = [];
    const pc = h.piece || (ARMORS[h.id] && ARMORS[h.id].lv > 0
      ? { id: h.id, hp: clamp(Math.round(h.hp), 0, h.max || ARMORS[h.id].hp), max: h.max || ARMORS[h.id].hp }
      : null);
    if (pc && SAVE.armorPieces.length < 36) SAVE.armorPieces.push(pc);   // 连耐久一起放回仓库
  }
}

/* 格子 → 仓库（真还）。用剩的耐久 / 次数 / 发数都留着。 */
function cellToStock(c) {
  if (!c) return;
  if (c.t === 'repair') {
    const M = REPAIRS[c.id];
    const s = SAVE.repairs[c.id] || (SAVE.repairs[c.id] = { n: 0, left: 0 });
    if (c.left >= M.dur - 0.5) s.n = Math.min(99, (s.n | 0) + 1);
    else if ((Number(s.left) || 0) <= 0.01) s.left = Math.max(0, c.left);
    else {
      const total = (Number(s.left) || 0) + Math.max(0, c.left);
      s.n = Math.min(99, (s.n | 0) + Math.floor(total / M.dur));
      s.left = total % M.dur;
    }
  } else if (c.t === 'med') {
    const M = MEDKITS[c.id];
    const s = SAVE.meds[c.id] || (SAVE.meds[c.id] = { n: 0, left: 0 });
    if (c.left >= M.dur - 0.5) s.n = Math.min(99, (s.n | 0) + 1);
    else if ((Number(s.left) || 0) <= 0.01) s.left = Math.max(0, c.left);
    else {
      const total = (Number(s.left) || 0) + Math.max(0, c.left);
      s.n = Math.min(99, (s.n | 0) + Math.floor(total / M.dur));
      s.left = total % M.dur;
    }
  } else if (c.t === 'stop') {
    SAVE.stops[c.id] = Math.min(99, ((SAVE.stops[c.id] | 0) + ((c.n | 0) || 1)));
  } else if (c.t === 'surg') {
    const s = SAVE.surgs[c.id] || (SAVE.surgs[c.id] = { uses: 0 });
    s.uses = Math.min(SURGERIES[c.id].uses, (s.uses | 0) + (c.uses | 0));
  } else if (c.t === 'ammo') {
    addAmmoStock(c.cal, c.lv, c.n | 0);
  } else if (c.t === 'relic') {
    SAVE.stash[c.id] = (SAVE.stash[c.id] | 0) + 1;
    markRelicSeen(c.id);
  } else if (c.t === 'mod') {
    SAVE.modBag[c.id] = Math.min(99, (SAVE.modBag[c.id] | 0) + 1);
  } else if (c.t === 'armor') {
    if (!Array.isArray(SAVE.armorPieces)) SAVE.armorPieces = [];
    const A = ARMORS[c.id];
    if (A && A.lv > 0 && SAVE.armorPieces.length < 36) {
      SAVE.armorPieces.push({ id: A.id, hp: clamp(Math.round(c.hp), 0, c.max || A.hp), max: c.max || A.hp });
    }
  }
  /* gun：所有权本来就记在 SAVE.owned 里，把指针放下即可 */
}
/* 仓库 → 手上：拿一件出来（真扣）。返回格子对象。 */
function stockTakeCell(kind, id) {
  if (kind === 'repair') {
    const s = SAVE.repairs[id] || { n: 0, left: 0 };
    if ((Number(s.left) || 0) > 0.01) {
      const c = { t: 'repair', id, left: s.left };
      s.left = 0;
      return c;
    }
    if ((s.n | 0) <= 0) return null;
    s.n--;
    return { t: 'repair', id, left: REPAIRS[id].dur };
  }
  if (kind === 'med') {
    const s = SAVE.meds[id] || { n: 0, left: 0 };
    if ((Number(s.left) || 0) > 0.01) {
      const c = { t: 'med', id, left: s.left };
      s.left = 0;
      return c;
    }
    if ((s.n | 0) <= 0) return null;
    s.n--;
    return { t: 'med', id, left: MEDKITS[id].dur };
  }
  if (kind === 'stop') {
    const have = (SAVE.stops[id] || 0) | 0;
    if (have <= 0) return null;
    const cap = Math.max(1, ((STOPS[id] || STOPS.bandage).uses | 0) || 1);
    const take = Math.min(cap, have);               // 仓库按片存，拿出来按瓶装（一瓶 cap 片）
    SAVE.stops[id] = have - take;
    return { t: 'stop', id, n: take };
  }
  if (kind === 'surg') {
    const s = SAVE.surgs[id] || { uses: 0 };
    if ((s.uses | 0) <= 0) return null;
    const c = { t: 'surg', id, uses: Math.min(SURGERIES[id].uses, s.uses | 0) };
    s.uses = Math.max(0, (s.uses | 0) - c.uses);
    return c;
  }
  return null;
}
function stockTakeAmmo(cal, lv) {
  if (lv == null) lv = ammoPickOf(cal);      // 不指定弹级 = 按选用弹级（老调用兜底）
  const cap = ammoCellCap(cal, SAVE.owned);
  const take = takeAmmoStock(cal, lv, Math.min(cap, ammoStock(cal, lv)));
  return take > 0 ? { t: 'ammo', cal, lv, n: take } : null;
}

function loSetHeld(c) {
  LO_UI.held = c;
  const el = $('loHeldChip');
  if (!el) return;
  if (c) {
    el.textContent = '手持 · ' + cellName(c) + (c.t === 'ammo' ? ' ' + (c.n | 0) + ' 发' : '') + '（松手放置 / 回原位）';
    el.style.borderColor = cellColor(c);
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

/* ── 长按拖拽：按住 ~0.16s 拿起，拖到目标松手放置；
      空处松手 = 放回原位置；拖进右侧仓库 = 放回仓库 ──
   LO_DRAG.pending = 按住等待期；active = 已经拿起跟随指针。
   pick() 执行「从来源拿走」（真扣仓库 / 清格子 / 卸槽位），可返回 revert()，
   没给 revert 时默认放回仓库（heldToStock）。 */
const LO_DRAG = { pending: null, active: false, sx: 0, sy: 0, timer: 0, revert: null };
const LO_HOLD_MS = 160;

function loPressable(el, pick) {
  el.classList.add('lo-press');
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (LO_DRAG.active) {                        // 上次松手事件丢了（卡死态）：先就地收场
      loFinishDrag(null);
      return;
    }
    if (LO_UI.held || LO_DRAG.pending) return;
    LO_DRAG.pending = { pick };
    LO_DRAG.sx = e.clientX; LO_DRAG.sy = e.clientY;
    LO_DRAG.timer = setTimeout(() => {
      const p = LO_DRAG.pending;
      LO_DRAG.pending = null;
      if (p) loDragBegin(LO_DRAG.sx, LO_DRAG.sy, p.pick);   // pick 随按下时捕获，别回头读 pending
    }, LO_HOLD_MS);
  });
}

function loDragBegin(x, y, pickArg) {
  const pick = pickArg || (LO_DRAG.pending && LO_DRAG.pending.pick);
  LO_DRAG.pending = null;
  if (!pick || LO_UI.held) return;
  const rv = pick();
  if (!LO_UI.held) return;                       // 没拿到（库存空 / off 行）
  LO_DRAG.active = true;
  LO_DRAG.revert = rv || (() => {                // 默认回原处 = 放回仓库
    if (LO_UI.held) {
      /* 装备类空处松手最容易被误解成「放了没反应」—— 提一句该往哪儿放 */
      if (LO_UI.held.t === 'gear' || LO_UI.held.t === 'armor')
        uiToast(LO_UI.held.t === 'gear' ? '弹挂 / 背包已放回仓库 · 拖到左侧对应槽才能穿上' : '护甲已放回仓库 · 拖到左侧「护甲」槽穿上', 'small warn');
      heldToStock(LO_UI.held);
      loSetHeld(null);
    }
  });
  loMoveChip(x, y);
  document.body.classList.add('lo-grabbing');
  /* 拿起即重绘：从槽位 / 格子拿走后，原位置必须当场变空。
     不重绘的话槽位还挂着旧图标，看起来就是「已穿 + 手持同时在」的假象，
     用户会以为松手没生效、手持卡住了（实机复现 T4b）。 */
  try { renderLoadout(); } catch (e) {}
}

function loDropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('#loStock, .lo-cell, .lo-slot') : null;
}
/* 这个落点对手上的东西来说是不是合法目标（只用于拖拽高亮，结算仍有兜底校验） */
function loDropOk(t, h) {
  if (!t) return false;
  if (t.id === 'loStock') return true;
  if (t.classList.contains('lo-slot')) return true;
  if (h && h.t === 'gun' && t.closest('#loPack')) return true;   // 枪只进背包
  return cellAccepts(h);                                         // 容器格只收小物件
}

function loHighlight(el) {
  const prev = document.querySelector('#loadout .dragover');
  if (prev) prev.classList.remove('dragover');
  if (el) el.classList.add('dragover');
}

function loMoveChip(x, y) {
  const chip = $('loHeldChip');
  if (chip) {
    // 夹到视口内：芯片本体 + translate(12px) 偏移不许探出屏幕
    const w = chip.offsetWidth || 160, h = chip.offsetHeight || 28;
    chip.style.left = Math.min(Math.max(0, x), innerWidth - w - 14) + 'px';
    chip.style.top = Math.min(Math.max(0, y), innerHeight - h - 14) + 'px';
  }
}

/* 松手结算：t = 落点元素（loStock / .lo-cell / .lo-slot），null = 空处回原位。
   try/finally 兜底：中途抛异常也绝不许把「手持」卡死（卡死 = 整个界面点不动） */
function loFinishDrag(t) {
  LO_DRAG.active = false;
  document.body.classList.remove('lo-grabbing');
  loHighlight(null);
  const h = LO_UI.held;
  try {
    if (h) {
      if (t && t.id === 'loStock') {               // 拖进仓库 = 放回仓库
        heldToStock(h);
        loSetHeld(null);
        Sfx.tone(440, 0.05, 0.04, 'square');
      } else if (t && typeof t._loDrop === 'function') {
        t._loDrop();
      }
    }
  } finally {
    if (LO_UI.held) {                              // 没放出去：回原位 / 回仓库
      if (LO_DRAG.revert) LO_DRAG.revert();
      else if (LO_UI.held) { heldToStock(LO_UI.held); loSetHeld(null); }
    }
    LO_DRAG.revert = null;
    try { saveGame(); } catch (e) {}
    try { renderLoadout(); } catch (e) {}
  }
}

/* 测试 / 调试用：绕过 elementFromPoint 直接指定落点 */
function loDropOnEl(el) { if (LO_DRAG.active) loFinishDrag(el); }

if (typeof document !== 'undefined' && !window.__loDragWired) {
  window.__loDragWired = true;
  document.addEventListener('pointermove', e => {
    if (LO_DRAG.pending) {
      if (Math.hypot(e.clientX - LO_DRAG.sx, e.clientY - LO_DRAG.sy) > 10) {
        clearTimeout(LO_DRAG.timer);
        const p = LO_DRAG.pending;
        LO_DRAG.pending = null;
        /* 鼠标按住直接拖：不用等 0.16 秒（老逻辑移动就取消，真人永远凑不齐长按）。
           触屏 / 笔仍按误触取消，让位给滚动 */
        if (e.pointerType === 'mouse' || e.pointerType == null) loDragBegin(e.clientX, e.clientY, p.pick);
      }
      return;
    }
    if (!LO_DRAG.active) return;
    loMoveChip(e.clientX, e.clientY);
    const t = loDropTargetAt(e.clientX, e.clientY);
    loHighlight(loDropOk(t, LO_UI.held) ? t : null);   // 不合法的目标不点亮，免得误导
  });
  document.addEventListener('pointerup', e => {
    if (LO_DRAG.pending) { clearTimeout(LO_DRAG.timer); LO_DRAG.pending = null; return; }
    if (!LO_DRAG.active) return;
    loFinishDrag(loDropTargetAt(e.clientX, e.clientY));
  });
  /* 系统接管手势（触屏滚动等）：当空处松手处理，别把手持卡死 */
  document.addEventListener('pointercancel', () => {
    if (LO_DRAG.pending) { clearTimeout(LO_DRAG.timer); LO_DRAG.pending = null; }
    if (LO_DRAG.active) loFinishDrag(null);
  });
  window.addEventListener('blur', () => {            // 切窗口丢 pointerup：就地放下
    if (LO_DRAG.pending) { clearTimeout(LO_DRAG.timer); LO_DRAG.pending = null; }
    if (LO_DRAG.active) loFinishDrag(null);
  });
  document.addEventListener('keydown', e => {        // Esc 紧急脱手
    if (e.key !== 'Escape') return;
    if (LO_DRAG.pending) { clearTimeout(LO_DRAG.timer); LO_DRAG.pending = null; }
    if (LO_DRAG.active) loFinishDrag(null);
  });
}

function openLoadout() {
  ensureCarry();
  trimCarryToCap();
  if (!SAVE.loadout) SAVE.loadout = { primary: null, secondary: null, pistol: null };
  if (!SAVE.worn) SAVE.worn = { rig: null, pack: null };
  if (!Array.isArray(SAVE.armorPieces)) SAVE.armorPieces = [];
  if (!SAVE.repairs) SAVE.repairs = {};
  /* 拖拽状态全部清零：上次丢 pointerup 卡死的「手持」不能带进新开的界面 */
  if (LO_DRAG.pending) { clearTimeout(LO_DRAG.timer); LO_DRAG.pending = null; }
  LO_DRAG.active = false;
  LO_DRAG.revert = null;
  document.body.classList.remove('lo-grabbing');
  loSetHeld(null);
  $('loCredit').textContent = fmtMoney(SAVE.credits);
  $('loadout').classList.remove('hidden');
  renderLoadout();
}
function closeLoadout() {
  $('loadout').classList.add('hidden');
  loSetHeld(null);
  saveGame();
  refreshLobby();
}

/* 整备界面：F = 快捷放入鼠标悬停的那行仓库物品
   弹药 / 药品 / 甲修包直接塞进随身容器（弹挂优先 → 背包 → 口袋）；
   枪 / 近战 / 护甲 / 携行直接装上对应槽位。手上已有东西或正在拖拽时不抢动作。 */
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'f' || e.repeat) return;
  if ($('loadout').classList.contains('hidden')) return;          // 整备没开
  if (LO_UI.held || LO_DRAG.active || LO_DRAG.pending) return;    // 手上有东西 / 正在拖：不抢
  const r = LO_UI.hoverRow;
  if (r && r.isConnected) {
    const fn = r.__loQuick || r.__loPick;
    if (typeof fn === 'function') {
      fn();
      try { saveGame(); } catch (err) {}
      try { renderLoadout(); } catch (err) {}      // 数量 / 槽位立刻刷新
    }
  }
});

/* ── 左侧：七个装备槽 ── */
const LO_SLOTS = [
  { id: 'loSlotPrimary',   kind: 'long',   cn: '主武器', ico: '⌖',
    get: () => SAVE.loadout.primary,   set: v => { SAVE.loadout.primary = v; } },
  { id: 'loSlotSecondary', kind: 'long',   cn: '副武器', ico: '⌗',
    get: () => SAVE.loadout.secondary, set: v => { SAVE.loadout.secondary = v; } },
  { id: 'loSlotPistol',    kind: 'pistol', cn: '手枪',  ico: '⌐',
    get: () => SAVE.loadout.pistol,    set: v => { SAVE.loadout.pistol = v; } },
  { id: 'loSlotMelee',     kind: 'melee',  cn: '近战',  ico: '†',
    get: () => SAVE.equippedMelee,     set: v => { SAVE.equippedMelee = v; } },
  { id: 'loSlotArmor',     kind: 'armor',  cn: '护甲',  ico: '⛨',
    get: () => SAVE.wornPiece,         set: v => { SAVE.wornPiece = v; } },
  { id: 'loSlotHelmet',    kind: 'helmet', cn: '头盔',  ico: '◈',
    get: () => SAVE.wornHelmet,        set: v => { SAVE.wornHelmet = v; } },
  { id: 'loSlotRig',       kind: 'rig',    cn: '弹挂',  ico: '▤',
    get: () => SAVE.worn.rig,          set: v => { SAVE.worn.rig = v; } },
  { id: 'loSlotPack',      kind: 'pack',   cn: '背包',  ico: '▩',
    get: () => SAVE.worn.pack,         set: v => { SAVE.worn.pack = v; } },
];

/* 手上的东西装进槽位。返回 true 表示状态变了要重渲染。 */
function loPlaceToSlot(slot) {
  const h = LO_UI.held;
  if (!h) return false;
  if (slot.kind === 'long' || slot.kind === 'pistol') {
    if (h.t !== 'gun') { uiToast('这里放' + (slot.kind === 'long' ? '长枪' : '手枪'), 'small warn'); return true; }
    const isP = !!PISTOL_IDS[h.id];
    if (slot.kind === 'long' && isP) { uiToast('手枪放不进长枪槽', 'small warn'); return true; }
    if (slot.kind === 'pistol' && !isP) { uiToast('长枪放不进手枪槽', 'small warn'); return true; }
    if (!SAVE.owned[h.id]) { uiToast('还没有这把枪', 'small warn'); return true; }
    slot.set(h.id);
  } else if (slot.kind === 'melee') {
    if (h.t !== 'melee') { uiToast('这里放近战武器', 'small warn'); return true; }
    slot.set(h.id);
  } else if (slot.kind === 'armor') {
    /* 手上可能是仓库件指针，也可能是背包里的护甲格 —— 两种都能穿 */
    const pc = (h.t === 'armor')
      ? (h.piece || (ARMORS[h.id] && ARMORS[h.id].lv > 0
        ? { id: h.id, hp: clamp(Math.round(h.hp), 0, h.max || ARMORS[h.id].hp), max: h.max || ARMORS[h.id].hp }
        : null))
      : null;
    if (!pc) { uiToast('这里放护甲', 'small warn'); return true; }
    /* 换甲：身上那件先回仓库，再穿手上这件（拿的时候已经从仓库 / 格子真扣） */
    if (SAVE.wornPiece) SAVE.armorPieces.push(SAVE.wornPiece);
    slot.set(pc);
  } else if (slot.kind === 'helmet') {
    if (h.t !== 'helmet') { uiToast('这里放头盔', 'small warn'); return true; }
    /* 件数里已包含头上那顶：仓库里的备用件直接戴，不扣件数（和多实例弹挂同一套账） */
    if (!((SAVE.helmetOwned || {})[h.id] | 0) && SAVE.wornHelmet !== h.id) {
      uiToast('还没有这顶头盔 · 先去军火库买', 'small warn'); return true;
    }
    slot.set(h.id);
  } else {                                   // 弹挂 / 背包：换着穿，格子容量立刻变
    if (h.t !== 'gear') { uiToast('这里放' + (slot.kind === 'rig' ? '弹挂' : '背包'), 'small warn'); return true; }
    const g = GEAR[h.key];
    if (!g || g.kind !== slot.kind) { uiToast('这件装备放不进这个槽', 'small warn'); return true; }
    /* 从背包格子里拿出来的（fromCarry）：东西本来就在手上带着，件数早就记在账上 */
    if (!gearOwnedOf(h.key) && !h.fromCarry) { uiToast('还没有这件装备 · 先去军火库买', 'small warn'); return true; }
    slot.set(h.key);
    trimCarryToCap();                        // 容量变小的话，多出来的格子原物回仓
  }
  loSetHeld(null);
  Sfx.tone(620, 0.05, 0.04, 'square');
  return true;
}

/* 从槽位卸到手上（长按拖拽用）。返回 revert：空处松手时原样装回。 */
function loTakeFromSlot(slot) {
  const v = slot.get();
  if (!v) { uiToast('空槽 · 长按右侧仓库的装备拖进来', 'small'); return null; }
  let revert;
  if (slot.kind === 'long' || slot.kind === 'pistol') { slot.set(null); loSetHeld({ t: 'gun', id: v }); revert = () => { if (LO_UI.held && LO_UI.held.t === 'gun') { slot.set(LO_UI.held.id); loSetHeld(null); } }; }
  else if (slot.kind === 'melee') { slot.set(null); loSetHeld({ t: 'melee', id: v }); revert = () => { if (LO_UI.held && LO_UI.held.t === 'melee') { slot.set(LO_UI.held.id); loSetHeld(null); } }; }
  else if (slot.kind === 'armor') { slot.set(null); loSetHeld({ t: 'armor', id: v.id, piece: v }); revert = () => { if (LO_UI.held && LO_UI.held.t === 'armor') { slot.set(LO_UI.held.piece); loSetHeld(null); } }; }
  else if (slot.kind === 'helmet') { slot.set(null); loSetHeld({ t: 'helmet', id: v }); revert = () => { if (LO_UI.held && LO_UI.held.t === 'helmet') { slot.set(LO_UI.held.id); loSetHeld(null); } }; }
  else { slot.set(null); trimCarryToCap(); loSetHeld({ t: 'gear', key: v }); revert = () => { if (LO_UI.held && LO_UI.held.t === 'gear') { slot.set(LO_UI.held.key); loSetHeld(null); trimCarryToCap(); } }; }
  Sfx.tone(500, 0.05, 0.04, 'square');
  return revert;
}

function renderLoSlot(slot) {
  const el = $(slot.id);
  if (!el) return;
  const v = slot.get();
  let ic = slot.ico, nm, sub, color = '#8a8264';
  const empty = !v;
  if (slot.kind === 'long' || slot.kind === 'pistol') {
    if (v) {
      const W = WEAPONS[v];
      ic = PISTOL_IDS[v] ? '⌐' : '⌖';
      nm = W.short;
      sub = caliberOf(v).short + ' · 改装 ' + gunModCount(v) + '/' + modSlotTotal(v);
      color = '#ffca7a';
    } else {
      nm = slot.cn + ' · 空';
      sub = slot.kind === 'pistol' ? '从仓库装入手枪' : '从仓库装入长枪';
    }
  } else if (slot.kind === 'melee') {
    if (v) {
      const M = MELEES[v];
      ic = '†'; nm = M.name; sub = '伤害 ' + M.dmg + ' · ' + (1 / M.rate).toFixed(1) + ' 刀/秒'; color = '#c9f2ff';
    } else { nm = '近战 · 空'; sub = '空手也保底一把匕首'; }
  } else if (slot.kind === 'armor') {
    if (v) {
      const A = ARMORS[v.id] || ARMORS[0];
      ic = '⛨'; nm = A.name; color = armorLvColor(A.lv);
      sub = A.lv + ' 级甲 · 耐久 ' + Math.floor(v.hp) + '/' + Math.floor(v.max) + ' · 瞄-' + Math.round(A.aim * 100) + '% 移-' + Math.round(A.move * 100) + '%' + (v.hp <= 0 ? ' · 已击穿！' : '');
    } else { nm = '护甲 · 没穿'; sub = '裸奔 · 走得最快'; }
  } else if (slot.kind === 'helmet') {
    if (v) {
      const H = helmetOf(v);
      ic = '◈'; nm = H.name; color = armorLvColor(H.lv);
      sub = H.lv + ' 级头 · 拾音 ' + (H.hear >= 0 ? '+' : '') + Math.round(H.hear * 100) + '% · 降噪 ' + H.quietName + helmetFovTag(H) +
        (H.dr ? ' · ≤' + H.drLv + ' 级弹 -' + Math.round(H.dr * 100) + '%' : ' · 无防护');
    } else { nm = '头盔 · 没戴'; sub = '耳朵是原装的 · 从仓库戴一顶'; }
  } else {
    if (v) {
      const G = GEAR[v];
      ic = slot.kind === 'rig' ? '▤' : '▩';
      nm = G.name; sub = G.cap + ' 格 · ' + (slot.kind === 'rig' ? '快捷可用' : 'Tab 里倒腾'); color = '#ffb08a';
    } else {
      nm = slot.cn + ' · 没穿';
      sub = slot.kind === 'rig' ? '备弹没地方放 · 从仓库穿一件' : '搜刮装不下 · 从仓库穿一件';
    }
  }
  el.className = 'lo-slot' + (empty ? ' empty' : '');
  el.innerHTML = '<span class="ic" style="color:' + color + '">' + ic + '</span>' +
    '<span class="tx"><span class="nm">' + nm + '</span><span class="sub">' + sub + '</span></span>' +
    '<span class="val">' + slot.cn + '</span>';
  el._loDrop = () => { if (LO_UI.held) loPlaceToSlot(slot); };
  el.oncontextmenu = e => {                      // 右键：脱下并放回仓库
    e.preventDefault();
    if (LO_UI.held || !slot.get()) return;
    loTakeFromSlot(slot);
    if (LO_UI.held) { heldToStock(LO_UI.held); loSetHeld(null); }
    saveGame();
    renderLoadout();
  };
  loPressable(el, () => loTakeFromSlot(slot));
}

/* ── 右侧：仓库（武器 / 护甲 / 携行 / 弹药 / 医疗）── */
/* F 快捷放入：小物件（弹药 / 药品 / 甲修包）直接塞随身容器 —— 弹挂优先，没位置进背包，最后口袋；
   弹药先往同类堆上补齐再开新格。注意整备页操作的是 SAVE.carry（不是局内的 P）。成功返回 true。 */
function loQuickStow(c) {
  if (!c || !SAVE.carry) return false;
  const C = SAVE.carry;
  if (c.t === 'ammo') {
    for (const arr of [C.rig, C.pocket, C.pack]) {
      for (const dst of arr) {
        if (dst && stackInto(c, dst, SAVE.owned) && (c.n | 0) <= 0) return true;
      }
    }
    if ((c.n | 0) <= 0) return true;
  }
  /* 弹挂 → 背包 → 口袋（zone 编号：0 弹挂 / 1 口袋 / 2 背包）；占格物品找隔舱连空 */
  const cell = heldToCell(c);
  for (const [zi, arr] of [[0, C.rig], [2, C.pack], [1, C.pocket]]) {
    if (!Array.isArray(arr) || !cellAccepts(c, zi)) continue;
    const blocks = zoneBlocks(ZONE_NAMES[zi]);
    const fit = findFitAuto(arr, blocks, cell);
    if (!fit) continue;
    applyFitRot(cell, fit.rot);
    placeAtRun(arr, fit.at, cell, blocks);
    return true;
  }
  return false;
}

/* 小物件 F 快捷行的统一入口：拿一件 → 塞容器；塞不下原样退回仓库 */
function loQuickRow(kind, id, short) {
  const c = stockTakeCell(kind, id);
  if (!c) return;
  if (loQuickStow(c)) { uiToast(short + ' 已装入', 'small'); Sfx.tone(620, 0.05, 0.04, 'square'); }
  else { cellToStock(c); uiToast('弹挂 / 背包都满了', 'small warn'); }
}

function renderLoStock() {
  const stockEl = $('loStock');
  stockEl.innerHTML = '';
  /* 分类折叠：点分类标题收起 / 展开，物品多的时候不用来回滑 */
  if (!LO_UI.open) LO_UI.open = {};
  let curBox = stockEl;
  const sect = (t, id) => {
    const d = document.createElement('div');
    d.className = 'lo-ttl lo-sect';
    d.title = '点击收起 / 展开';
    const box = document.createElement('div');
    stockEl.appendChild(d);
    stockEl.appendChild(box);
    const apply = () => {
      const open = LO_UI.open[id] !== false;
      box.style.display = open ? '' : 'none';
      d.textContent = (open ? '▾ ' : '▸ ') + t;
    };
    d.addEventListener('click', () => {
      LO_UI.open[id] = (LO_UI.open[id] === false);
      apply();
      Sfx.tone(LO_UI.open[id] ? 320 : 480, 0.04, 0.03, 'square');
    });
    apply();
    curBox = box;
  };
  const row = o => {
    const el = document.createElement('div');
    el.className = 'lo-row' + (o.off ? ' off' : '');
    el.innerHTML = '<span class="nm" style="color:' + o.color + '">' + o.nm + '</span>' +
      '<span class="sub">' + o.sub + '</span>' +
      '<span class="ct">' + o.ct + '</span>';
    if (!o.off) {
      loPressable(el, o.pick);                   // 长按拿起（点击不再拾取）
      el.__loPick = o.pick;                      // 长按拖拽拿取：只认鼠标悬停的这行
      el.__loQuick = o.quick || o.pick;          // F 快捷放入：直接装进容器 / 装上槽位
      el.addEventListener('mouseenter', () => { LO_UI.hoverRow = el; });
      el.addEventListener('mouseleave', () => { if (LO_UI.hoverRow === el) LO_UI.hoverRow = null; });
    }
    curBox.appendChild(el);
  };

  /* 武器：长枪 / 手枪 / 近战，点了拿在手上装进左边对应槽。
     已经装在槽里的那把：先从槽里退出来再拿，别搞出「身上一把手上一把」的幻影副本 */
  sect('武 器', 'weapon');
  for (const id of WEAPON_ORDER) {
    if (!WEAPONS[id] || (SAVE.owned[id] | 0) <= 0) continue;
    const W = WEAPONS[id];
    /* 槽里装着的那几把不显示（槽位右键可脱下）；剩下的备用件才列出来 */
    const inSlots = (SAVE.loadout.primary === id ? 1 : 0) + (SAVE.loadout.secondary === id ? 1 : 0) +
                    (SAVE.loadout.pistol === id ? 1 : 0);
    const spare = (SAVE.owned[id] | 0) - inSlots;
    if (spare <= 0) continue;
    row({
      nm: W.short, color: '#ffca7a',
      sub: weaponCatOf(W).cn + ' · ' + caliberOf(id).short + ' · ' + W.mag + ' 发弹匣',
      ct: '在库 ×' + spare,
      pick: () => loSetHeld({ t: 'gun', id }),   // 拿的是备用件，槽里那把不受影响
      quick: () => {                          // F：直接装上（手枪进手枪槽，长枪先进主槽再进副槽）
        if (PISTOL_IDS[id]) SAVE.loadout.pistol = id;
        else if (!SAVE.loadout.primary) SAVE.loadout.primary = id;
        else if (!SAVE.loadout.secondary) SAVE.loadout.secondary = id;
        else SAVE.loadout.primary = id;       // 都占着就换下主武器（所有权在仓库，顶下来还在列表里）
        uiToast(W.short + ' 已装上', 'small');
        Sfx.tone(620, 0.05, 0.04, 'square');
      },
    });
  }
  for (const id of MELEE_ORDER) {
    if (!SAVE.ownedMelee || !SAVE.ownedMelee[id]) continue;
    if (SAVE.equippedMelee === id) continue;               // 已装的不显示
    const M = MELEES[id];
    row({
      nm: M.name, color: '#c9f2ff', sub: '伤害 ' + M.dmg + ' · 静音无弹药',
      ct: '在库',
      pick: () => {
        if (SAVE.equippedMelee === id) SAVE.equippedMelee = null;
        loSetHeld({ t: 'melee', id });
      },
      quick: () => { SAVE.equippedMelee = id; uiToast(M.name + ' 已装上', 'small'); Sfx.tone(620, 0.05, 0.04, 'square'); },
    });
  }

  /* 护甲：仓库里的实体件，穿上 = 从仓库拿出一件。
     身上穿的那件也在列表里：先脱下来再拿，不然会出现幻影副本。
     数量为 0 且没穿的直接不显示 —— 只看自己有的东西 */
  sect('护 甲', 'armor');
  /* 仓库件：一件一行 —— 每件有自己的耐久，磨了/修了都记在件上 */
  for (let i = SAVE.armorPieces.length - 1; i >= 0; i--) {
    const pc = SAVE.armorPieces[i];
    const A = ARMORS[pc.id];
    row({
      nm: A.name, color: armorLvColor(A.lv),
      sub: A.lv + ' 级甲 · 耐久 ' + Math.floor(pc.hp) + '/' + Math.floor(pc.max) + ' · 瞄-' + Math.round(A.aim * 100) + '% 移-' + Math.round(A.move * 100) + '% · 修 ' + A.effName + '（1 点修 ' + A.eff + '） · 损耗 ' + A.lossName + ' · 阵亡丢身上这件',
      ct: '在库 ×1',
      pick: () => {
        SAVE.armorPieces.splice(i, 1);
        loSetHeld({ t: 'armor', id: pc.id, piece: pc });
      },
      quick: () => {                          // F：直接穿上，身上那件脱下来回仓库
        SAVE.armorPieces.splice(i, 1);
        if (SAVE.wornPiece) SAVE.armorPieces.push(SAVE.wornPiece);
        SAVE.wornPiece = pc;
        uiToast(A.name + ' 已穿上', 'small');
        Sfx.tone(620, 0.05, 0.04, 'square');
      },
    });
  }
  /* 身上穿的这件不在仓库列表里 —— 左侧护甲槽右键可脱下（会回到本列表） */

  /* 头盔：按件数计（不像护甲那样每件记耐久），头上那顶也算在件数里，这里只列备用 */
  sect('头 盔', 'helmet');
  {
    let anyH = false;
    for (const H of HELMETS) {
      if (H.id === 0) continue;
      const cnt = (SAVE.helmetOwned && SAVE.helmetOwned[H.id]) | 0;
      const wornThis = SAVE.wornHelmet === H.id;
      const spare = cnt - (wornThis ? 1 : 0);
      if (spare <= 0) continue;
      anyH = true;
      row({
        nm: H.name, color: armorLvColor(H.lv),
        sub: H.lv + ' 级头 · ' + (H.dr ? '≤' + H.drLv + ' 级弹 -' + Math.round(H.dr * 100) + '%' : '无防护') +
          ' · 拾音 ' + (H.hear >= 0 ? '+' : '') + Math.round(H.hear * 100) + '% · 降噪 ' + H.quietName + helmetFovTag(H) +
          (H.aim ? ' · 瞄准 -' + Math.round(H.aim * 100) + '%' : '') +
          (H.move ? ' · 移速 -' + Math.round(H.move * 100) + '%' : ''),
        ct: '备用 ×' + spare,
        pick: () => loSetHeld({ t: 'helmet', id: H.id }),
        quick: () => {                          // F：直接戴上（换下的那顶还在件数里）
          SAVE.wornHelmet = H.id;
          uiToast(H.name + ' 已戴上', 'small');
          Sfx.tone(620, 0.05, 0.04, 'square');
        },
      });
    }
    if (!anyH) {
      const el = document.createElement('div');
      el.className = 'lo-row off';
      el.innerHTML = '<span class="nm">没有备用头盔</span><span class="sub">军火库「头盔」页有售</span><span class="ct">—</span>';
      curBox.appendChild(el);
    }
  }

  /* 携行装备：弹挂 / 背包分两节列出（买过就永久拥有，穿了才算数） */
  for (const gk of ['rig', 'pack']) {
    sect(gk === 'rig' ? '弹 挂' : '背 包', gk === 'rig' ? 'gearRig' : 'gearPack');
    let gearAny = false;
    for (const key in GEAR) {
      const g0 = GEAR[key];
      if (g0.kind !== gk) continue;                  // 本节只列这一类
      const gcnt = (SAVE.gearOwned && SAVE.gearOwned[key]) | 0;
      if (gcnt <= 0) continue;
      gearAny = true;
      const g = g0;
      /* 身上穿的那件不算库存；包里存着的也不算；剩下的备用件列出来（同款囤几件显示几件） */
      const wornThis = !!(SAVE.worn && SAVE.worn[g.kind] === key);
      const gspare = gcnt - (wornThis ? 1 : 0) - carriedGearCount(key);
      if (gspare <= 0) continue;    // 只有身上那件 / 全塞包里了：不显示（左槽右键脱下）
      row({
        nm: g.name, color: g.color || '#ffb08a',
        sub: (g.q ? g.q + ' · ' : '') + (g.kind === 'rig' ? '弹挂 · 快捷可用 · ' : '背包 · Tab 倒腾 · ') + g.cap + ' 格' +
          (g.blocks ? '（' + blkSizesText(g.blocks) + ' 舱）' : '') +
          (g.ads ? ' · 瞄准速度 ' + g.ads + '%' : '') + (g.spd ? ' · 移动速度 ' + g.spd + '%' : ''),
        ct: '备用 ×' + gspare,
        pick: () => loSetHeld({ t: 'gear', key }),   // 拿备用件，身上穿着的不动
        quick: () => {                          // F：直接穿上，容量变化立刻结算（多出的格子回仓）
          SAVE.worn[g.kind] = key;
          trimCarryToCap();
          uiToast(g.name + ' 已穿上', 'small');
          Sfx.tone(620, 0.05, 0.04, 'square');
        },
      });
    }
    if (!gearAny) {
      const el = document.createElement('div');
      el.className = 'lo-row off';
      el.innerHTML = gk === 'rig'
        ? '<span class="nm">没有备用弹挂</span><span class="sub">军火库「弹挂」页有售</span><span class="ct">—</span>'
        : '<span class="nm">没有备用背包</span><span class="sub">军火库「背包」页有售</span><span class="ct">—</span>';
      curBox.appendChild(el);
    }
  }

  /* 弹药：每个口径每个弹级单独一行（1 级弹和 4 级弹分开放，想拿哪级拿哪级），
     拿取只从对应弹级扣（按选用弹级拿的那行会标「选用」）；
     格上限 = 已有枪里最大弹匣×2，只能放弹挂 / 口袋。
     数量为 0 的弹级不显示 —— 只看自己有的东西 */
  sect('弹 药', 'ammo');
  for (const cal of CAL_ORDER) {
    const C = CALIBERS[cal];
    const hasGun = WEAPON_ORDER.some(w => SAVE.owned[w] && calOfWeapon(w) === cal);
    for (const T of AMMO_TIERS) {
      if (!calHasTier(cal, T.lv)) continue;
      const have = ammoStock(cal, T.lv);
      if (have <= 0) continue;
      const isPick = ammoPickOf(cal) === T.lv;
    row({
      nm: C.short, color: T.color,
      sub: T.grade + ' · 格上限 ' + ammoCellCap(cal, SAVE.owned) + (isPick ? ' · 选用' : ''),
      ct: have + ' 发', off: !hasGun,
      pick: () => { const c = stockTakeAmmo(cal, T.lv); if (c) loSetHeld(c); },
      quick: () => {
        const c = stockTakeAmmo(cal, T.lv);
        if (!c) return;
        if (loQuickStow(c)) { uiToast(C.short + ' ' + T.grade + ' 已装入 ×' + c.n, 'small'); Sfx.tone(620, 0.05, 0.04, 'square'); }
        else { addAmmoStock(cal, T.lv, c.n); uiToast('弹挂 / 背包都满了', 'small warn'); }
      },
    });
    }
  }

  /* 医疗：数量为 0 的不显示 —— 只看自己有的东西 */
  sect('医 疗', 'med');
  for (const id of MEDKIT_ORDER) {
    const M = MEDKITS[id];
    const have = saveMedCount(id);
    if (have <= 0) continue;
    row({
      nm: M.short, color: M.color, sub: M.dur + ' 耐久 · ' + M.hps + '/s',
      ct: '×' + have, off: have <= 0,
      pick: () => { const c = stockTakeCell('med', id); if (c) loSetHeld(c); },
      quick: () => loQuickRow('med', id, M.short),
    });
  }
  for (const id of STOP_ORDER) {
    const S = STOPS[id];
    const have = (SAVE.stops[id] | 0);
    if (have <= 0) continue;
    row({
      nm: S.short, color: S.color,
      sub: S.pain ? ('止痛 ' + S.pain + 's') : (S.layers > 1 ? '全止血' : '止 1 层'),
      ct: '×' + have, off: have <= 0,
      pick: () => { const c = stockTakeCell('stop', id); if (c) loSetHeld(c); },
      quick: () => loQuickRow('stop', id, S.short),
    });
  }
  for (const id of SURG_ORDER) {
    const S = SURGERIES[id];
    const have = ((SAVE.surgs[id] && SAVE.surgs[id].uses) | 0);
    if (have <= 0) continue;
    row({
      nm: S.short, color: S.color, sub: S.uses + ' 次 · ' + S.sec + 's',
      ct: have + ' 次', off: have <= 0,
      pick: () => { const c = stockTakeCell('surg', id); if (c) loSetHeld(c); },
      quick: () => loQuickRow('surg', id, S.short),
    });
  }
  /* 甲修包：修护甲的消耗品，跟医疗包一样抓进格子带出门 */
  for (const id of REPAIR_ORDER) {
    const R = REPAIRS[id];
    const ss = SAVE.repairs[id] || { n: 0, left: 0 };
    const have = (ss.n | 0) + ((Number(ss.left) || 0) > 0.01 ? 1 : 0);
    if (have <= 0) continue;
    row({
      nm: R.short, color: R.color,
      sub: R.dur + ' 点 · 修 ' + R.capLv + ' 级及以下 · 读条 ' + R.wind + 's',
      ct: '×' + have,
      pick: () => { const c = stockTakeCell('repair', id); if (c) loSetHeld(c); },
      quick: () => loQuickRow('repair', id, R.short),
    });
  }

  $('loStockNote').textContent = '按住拖动 · 鼠标所在行按 F 快捷放入（弹药 / 药品进弹挂，枪 / 甲直接装备）· 拖回这里放回仓库';
  stockEl._loDrop = () => {                      // 拖进仓库 = 放回仓库
    if (LO_UI.held) { heldToStock(LO_UI.held); loSetHeld(null); Sfx.tone(440, 0.05, 0.04, 'square'); }
  };
}

/* 格子只收小物件：med / stop / surg / ammo。装备（枪 / 甲 / 弹挂 / 背包）塞进
   容器格不但不会「穿上」，还会在 ensureCarry 清洗时被 cellValid 静默清掉 —— 必须挡。 */
/* 哪些东西能放进容器格：小物件全行；枪也能放 —— 但只进背包（zone 2）。
   zone = 0 弹挂 / 1 口袋 / 2 背包。 */
function cellAccepts(h, zone) {
  if (!h) return false;
  if (h.t === 'med' || h.t === 'stop' || h.t === 'surg' || h.t === 'ammo' ||
      h.t === 'repair' || h.t === 'relic' || h.t === 'mod') return true;
  if (h.t === 'gear') {
    /* 背包不能装回自己里面：zone 2 的格子属于穿着的那只背包，同 key = 自己套自己（数据递归，东西会凭空消失） */
    if (zone === 2 && SAVE.worn && SAVE.worn.pack === h.key) return false;
    return zone === 2;                                         // 枪 / 甲 / 弹挂 / 背包只进背包
  }
  if (h.t === 'gun' || h.t === 'armor') return zone === 2;
  return false;
}
/* 手上的装备指针 → 格子（护甲塞进背包时把件本身记在格子里；弹挂 / 背包只留 key） */
function heldToCell(h) {
  if (h && h.t === 'armor' && !h.piece && ARMORS[h.id] && ARMORS[h.id].lv > 0) {
    const A = ARMORS[h.id];
    const m = Math.max(1, Math.round(h.max || A.hp));
    return { t: 'armor', id: A.id, hp: clamp(Math.round(h.hp), 0, m), max: m };
  }
  if (h && h.t === 'armor' && h.piece) {
    const pc = h.piece;
    return { t: 'armor', id: pc.id, hp: pc.hp, max: pc.max };
  }
  if (h && h.t === 'gear') {                    // 格子里的装备：只存 key（cells 内容原样带上）
    const o = { t: 'gear', key: h.key };
    if (Array.isArray(h.cells)) o.cells = h.cells;
    return o;
  }
  return h;
}
/* 塞不下时的提示：报「宽x高 / 格数」，比只说格数好懂 */
function iszHint(cell, name) {
  const sz = cellSize(cell);
  if (sz <= 1) return '这里放不下';
  return (name ? '这个隔舱塞不下 ' + name : '这个隔舱放不下') + '（需要 ' + sz + ' 格整块空位）';
}
const CELL_REJECT_HINT = {
  gun: '枪只能放进背包（或拖到上方武器槽装上）',
  melee: '近战武器要装进上方近战槽',
  armor: '护甲只能放进背包，或拖到左侧「护甲」槽穿上',
  gear: '弹挂 / 背包可拖进背包存放，或拖到左侧对应槽穿上',
};

/* 同类弹药堆叠合并：把 src 拖到 dst 上 —— dst 补到上限，装不下的留在 src。
   5 发 + 55 发（上限 60）→ dst 60、src 空（消失）；
   5 发 + 56 发 → dst 60、src 剩 1 发。合并成功返回 true。 */
function stackInto(src, dst, owner) {
  if (!src || !dst || src.t !== 'ammo' || dst.t !== 'ammo') return false;
  if (src.cal !== dst.cal || src.lv !== dst.lv) return false;
  const cap = ammoCellCap(src.cal, owner);
  const total = (src.n | 0) + (dst.n | 0);
  dst.n = Math.min(cap, total);
  src.n = total - dst.n;
  if (src.n <= 0) src.n = 0;
  return true;
}

function renderLoadout() {
  if (!SAVE.carry) ensureCarry();          // 直接调进来（比如审计 / 调试）也能画
  $('loGunNote').textContent = '按住直接拖 · 拖进槽位装备 · 拖进背包存放';
  for (const slot of LO_SLOTS) renderLoSlot(slot);

  /* 三排容器格：弹挂 / 口袋 / 背包（没穿弹挂或背包时整排隐藏） */
  const zoneDefs = [
    ['loRig', SAVE.carry.rig, 'loRigNote', '快捷可用 · 按 5 打药 / R 换弹', rigCap(), '没穿弹挂 · 备弹没地方放，从右侧「弹挂」穿一件'],
    ['loPocket', SAVE.carry.pocket, 'loPocketNote', '快捷可用 · 按 5 打药 / R 换弹', pocketCap(), ''],
    ['loPack', SAVE.carry.pack, 'loPackNote', 'Tab 里倒腾 · 不能直接用', packCap(), '没穿背包 · 从右侧「背包」穿一件'],
  ];
  for (const [gridId, arr, noteId, base, cap, emptyHint] of zoneDefs) {
    $(noteId).textContent = cap > 0 ? (base + ' · ' + cap + ' 格') : emptyHint;
    const grid = $(gridId);
    grid.innerHTML = '';
    if (cap <= 0) continue;
    const zone = gridId === 'loRig' ? 0 : (gridId === 'loPocket' ? 1 : 2);
    const blocks = zoneBlocks(ZONE_NAMES[zone]);
    let lastBlkH = -1;
    for (const [s, e, C, brk, ml, mt, mr] of blocks) {
      const bh = (e - s) / C;                        // 舱高（格）
      // brk=2 → 强制不换行（同排高低舱混排，照实物图）；brk=1 → 强制换行；其余高度变化自动换行
      if (lastBlkH >= 0 && brk !== 2 && (bh !== lastBlkH || brk === 1)) {
        const br = document.createElement('div');
        br.className = 'blk-break';
        grid.appendChild(br);
      }
      lastBlkH = bh;
      const blk = document.createElement('div');
      blk.className = 'pk-blk';
      if (ml) blk.style.marginLeft = ml + 'px';      // 左移：压在上一排指定舱的正下方（如 raider 居中快取袋）
      if (mt) blk.style.marginTop = mt + 'px';       // 下移：小袋挂在同行高舱下方（如 xiqiang 零钱袋）
      if (mr) blk.style.marginRight = mr + 'px';     // 右缩：负值收窄占位宽，最右下小袋不触发 flex 回流
      const bgrid = document.createElement('div');
      bgrid.className = 'blk-grid';
      bgrid.style.gridTemplateColumns = 'repeat(' + C + ', var(--bcell))';
      for (let i = s; i < e; i++) {
        const c = arr[i];
        if (c && c.cont) continue;                   // 多格物品：整块画在 head 上
        const hi = i;
        const rel = i - s;
        /* 形状裁剪：物品比舱宽 / 舱高还大（换弹挂导致舱变窄后的遗留大件），
         绝不能让它把 CSS grid 撑出隐式列 —— 那样 1x3 舱会显示成 2 列宽 */
      const sh = c ? shapeOf(c, C) : [1, 1];
      const w = Math.max(1, Math.min(sh[0], C));
      const h = Math.max(1, Math.min(sh[1], bh));
        const el = document.createElement('div');
        el.className = 'lo-cell bcell' + (c ? '' : ' empty') + (c && (c.t === 'relic' || c.t === 'mod') ? ' relic-txt' : '');
        el.style.gridColumn = (rel % C + 1) + ' / span ' + w;
        el.style.gridRow = ((rel / C | 0) + 1) + ' / span ' + h;
        if (w > 1) el.style.width = 'calc(' + w + ' * var(--bcell) + ' + ((w - 1) * 2) + 'px)';    // 跨格：撑出实际宽
        if (h > 1) el.style.height = 'calc(' + h + ' * var(--bcell) + ' + ((h - 1) * 2) + 'px)';  // 跨格：撑出实际高
        if (c) {
          el.title = cellName(c) + ' · ' + cellSub(c);
          let html = '<span class="ic' + icSizeCls(cellIcon(c)) + '" style="color:' + cellColor(c) + '">' + cellIcon(c) + '</span>';
          if (w > 1 || h > 1) html += '<span class="nm">' + cellName(c) + '</span>' +
            '<span class="sub">' + cellSub(c) + '</span>';
          else if (c.t === 'ammo') html += '<span class="ct">' + (c.n | 0) + '</span>';
          else if (c.t === 'stop') {                 // 一瓶多片：短名 + 右下角剩余片数
            const sn = (c.n | 0) || 1;
            html = '<span class="nm solo" style="color:' + cellColor(c) + '">' + cellName(c) + '</span>' +
              (sn > 1 ? '<span class="ct">' + sn + '</span>' : '');
          }
          else if (c.t === 'relic' || c.t === 'mod') {   // 1×1 收集品 / 配件：名称 + 价格 / 部位
            /* 配件的品质看名称颜色就够，信息行只留部位 —— 「枪托 · 普通」5 字在 46px 里必折行 */
            const subTxt = c.t === 'mod' ? cellSub(c).split(' · ')[0] : cellSub(c);
            html = '<span class="nm solo" style="color:' + cellColor(c) + '">' + cellName(c) + '</span>' +
              '<span class="sub">' + subTxt + '</span>';
          }
          el.innerHTML = html;
        }

        const placeHere = () => {
          if (!LO_UI.held) return;
          if (LO_UI.held.t === 'gear' && ZONE_NAMES[zone] !== 'pocket' && SAVE.worn[ZONE_NAMES[zone]] === LO_UI.held.key) {
            uiToast(ZONE_NAMES[zone] === 'pack' ? '背包不能装回自己里面' : '弹挂不能装回自己里面', 'small warn');
            return;
          }
          if (!cellAccepts(LO_UI.held, zone)) {       // 枪 / 甲 / 弹挂 / 背包不进容器格（枪只进背包）
            uiToast(CELL_REJECT_HINT[LO_UI.held.t] || '这件放不进格子', 'small warn');
            return;
          }
          const cell = heldToCell(LO_UI.held);
          const c2 = arr[hi];
          if (!c2) {                                  // 空位：整件塞进落点所在隔舱（放不下自动转 90°，见 resolveDropAt）
            const fit = resolveDropAt(arr, blocks, hi, cell);
            if (!fit) { uiToast(iszHint(cell), 'small warn'); return; }
            applyFitRot(cell, fit.rot);
            placeAtRun(arr, fit.at, cell, blocks);
            loSetHeld(null);
          } else if (stackInto(LO_UI.held, c2, SAVE.owned)) {    // 同弹药合并
            if (LO_UI.held.n <= 0) loSetHeld(null);
            else loSetHeld(LO_UI.held);
          } else if (!c2.cont) {                      // 交换 / 换位
            clearSpanAt(arr, hi, blocks);
            const fit = resolveDropAt(arr, blocks, hi, cell) || findFitAuto(arr, blocks, cell);
            if (!fit) { placeAtRun(arr, hi, c2, blocks); uiToast(iszHint(cell, cellName(cell)), 'small warn'); return; }
            applyFitRot(cell, fit.rot);
            placeAtRun(arr, fit.at, cell, blocks);
            loSetHeld(c2);
          }
          Sfx.tone(620, 0.05, 0.04, 'square');
        };
        el._loDrop = placeHere;
        el.addEventListener('contextmenu', e => {                    // 右键放回仓库
          e.preventDefault();
          const t = arr[hi];
          if (!t || t.cont || LO_UI.held) return;
          cellToStock(t);
          clearSpanAt(arr, hi, blocks);
          Sfx.tone(440, 0.05, 0.04, 'square');
          saveGame();
          renderLoadout();
        });
        loPressable(el, () => {                      // 长按拿起：整件清格，空处松手放回原位
          const t = arr[hi];
          if (!t || t.cont) return null;
          clearSpanAt(arr, hi, blocks);
          loSetHeld(t.t === 'gear' ? Object.assign({}, t, { fromCarry: 1 }) : t);   // 标记来源：穿戴时不查仓库件数
          Sfx.tone(500, 0.05, 0.04, 'square');
          return () => {                             // revert：原位还空着就放回去
            if (!arr[hi]) { placeAtRun(arr, hi, LO_UI.held, blocks); loSetHeld(null); }
            else { heldToStock(LO_UI.held); loSetHeld(null); }
          };
        });
        bgrid.appendChild(el);
      }
      blk.appendChild(bgrid);
      grid.appendChild(blk);
    }
  }

  renderLoStock();
  renderPresets();
  $('loCredit').textContent = fmtMoney(SAVE.credits);
}

/* ── 配装预设：只存「装备」，不存弹挂/背包里的东西 ──
   枪槽 / 近战 / 身上那件甲 / 弹挂 / 背包 / 上次用的药。
   套用前先查仓库：缺件就整单不执行，避免套一半留个四不像。 */
function presetSnapshot(i) {
  const LO = SAVE.loadout || {};
  const own = id => (id && (SAVE.owned[id] | 0) > 0) ? id : null;
  return {
    name: '预设 ' + (i + 1),
    at: Date.now(),
    guns: { primary: own(LO.primary), secondary: own(LO.secondary), pistol: own(LO.pistol) },
    melee: (SAVE.equippedMelee && SAVE.ownedMelee && SAVE.ownedMelee[SAVE.equippedMelee]) ? SAVE.equippedMelee : STARTER_MELEE,
    armor: (SAVE.wornPiece && SAVE.wornPiece.id) | 0,
    rig: (SAVE.worn && SAVE.worn.rig) || null,
    pack: (SAVE.worn && SAVE.worn.pack) || null,
    care: SAVE.carePick || '',
  };
}

function presetMissing(p) {
  const miss = [];
  if (!p) return miss;
  for (const sl of ['primary', 'secondary', 'pistol']) {
    const id = p.guns && p.guns[sl];
    if (id && !(SAVE.owned[id] > 0)) miss.push(WEAPONS[id] ? WEAPONS[id].short : id);
  }
  if (p.melee && !(SAVE.ownedMelee && SAVE.ownedMelee[p.melee])) miss.push((MELEES[p.melee] || {}).name || p.melee);
  if (p.armor > 0) {
    const wornOK = SAVE.wornPiece && SAVE.wornPiece.id === p.armor && SAVE.wornPiece.hp > 0;
    const stockOK = (SAVE.armorPieces || []).some(a => a.id === p.armor && a.hp > 0);
    if (!wornOK && !stockOK) miss.push((ARMORS[p.armor] || {}).short || '护甲');
  }
  if (p.rig && !((SAVE.gearOwned[p.rig] | 0) > 0) && !(SAVE.worn && SAVE.worn.rig === p.rig)) miss.push(GEAR[p.rig].name);
  if (p.pack && !((SAVE.gearOwned[p.pack] | 0) > 0) && !(SAVE.worn && SAVE.worn.pack === p.pack)) miss.push(GEAR[p.pack].name);
  return miss;
}

function applyPreset(p) {
  if (!p) return false;
  if (!SAVE.loadout) SAVE.loadout = { primary: null, secondary: null, pistol: null };
  if (!SAVE.worn) SAVE.worn = { rig: null, pack: null };
  if (!Array.isArray(SAVE.armorPieces)) SAVE.armorPieces = [];
  const miss = presetMissing(p);
  if (miss.length) { uiToast('预设缺件：' + miss.join(' / '), 'small warn'); return false; }

  const LO = SAVE.loadout;
  LO.primary = p.guns.primary || null;
  LO.secondary = p.guns.secondary || null;
  LO.pistol = p.guns.pistol || null;
  SAVE.equippedMelee = p.melee || STARTER_MELEE;

  /* 护甲：身上已经是这件就不动；否则去仓库拿一件，旧的那件放回仓库 */
  if (p.armor > 0) {
    if (!(SAVE.wornPiece && SAVE.wornPiece.id === p.armor)) {
      const at = SAVE.armorPieces.findIndex(a => a.id === p.armor && a.hp > 0);
      if (at >= 0) {
        const pc = SAVE.armorPieces.splice(at, 1)[0];
        if (SAVE.wornPiece) SAVE.armorPieces.push(SAVE.wornPiece);
        SAVE.wornPiece = pc;
      }
    }
  } else if (SAVE.wornPiece) {
    SAVE.armorPieces.push(SAVE.wornPiece);       // 预设是裸奔：把身上的脱回仓库
    SAVE.wornPiece = null;
  }

  if (p.rig) SAVE.worn.rig = p.rig;
  if (p.pack) SAVE.worn.pack = p.pack;
  trimCarryToCap();
  if (p.care) SAVE.carePick = normCareKey(p.care);
  saveGame();
  renderLoadout();
  Sfx.tone(620, 0.05, 0.04, 'square');
  uiToast('已套用 ' + p.name, 'small');
  return true;
}

function presetAction(act, i) {
  if (!Array.isArray(SAVE.presets)) SAVE.presets = [null, null, null];
  if (act === 'save') {
    SAVE.presets[i] = presetSnapshot(i);
    saveGame();
    renderPresets();
    Sfx.tone(520, 0.05, 0.04, 'square');
    uiToast('当前配装已存入 ' + SAVE.presets[i].name, 'small');
  } else if (act === 'del') {
    SAVE.presets[i] = null;
    saveGame();
    renderPresets();
  } else if (act === 'apply') {
    applyPreset(SAVE.presets[i]);
  }
}

function renderPresets() {
  const box = $('loPresets');
  if (!box) return;
  if (!Array.isArray(SAVE.presets)) SAVE.presets = [null, null, null];
  box.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const p = SAVE.presets[i];
    const card = document.createElement('div');
    card.className = 'prcard';
    if (!p) {
      card.innerHTML = '<div class="prn">预设 ' + (i + 1) + '</div>' +
        '<div class="prs">空 · 配好这套再保存</div>' +
        '<div class="prb"><button data-act="save" data-i="' + i + '">保存当前</button></div>';
    } else {
      const gs = [p.guns.primary, p.guns.secondary, p.guns.pistol]
        .filter(Boolean).map(id => (WEAPONS[id] || {}).short || id).join(' / ') || '空手';
      const ar = p.armor > 0 && ARMORS[p.armor] ? ARMORS[p.armor].short : '裸奔';
      const sub = gs + ' · ' + ar + (p.rig ? ' · ' + GEAR[p.rig].name : '');
      const miss = presetMissing(p);
      card.innerHTML =
        '<div class="prn">' + p.name + '</div>' +
        '<div class="prs" title="' + sub + '">' + sub + '</div>' +
        (miss.length ? '<div class="prs" style="color:#ffb347">缺：' + miss.join(' · ') + '</div>' : '') +
        '<div class="prb">' +
          '<button class="apply" data-act="apply" data-i="' + i + '"' + (miss.length ? ' disabled' : '') + '>套 用</button>' +
          '<button data-act="save" data-i="' + i + '">覆盖</button>' +
          '<button data-act="del" data-i="' + i + '">清空</button>' +
        '</div>';
    }
    box.appendChild(card);
  }
  for (const b of box.querySelectorAll('button[data-act]')) {
    b.addEventListener('click', () => presetAction(b.dataset.act, +b.dataset.i));
  }
}

/* 一键整备：先把拥有的最好弹挂 / 背包穿上 → 弹药格补满 → 空弹挂格补口径格 →
   口袋塞绷带 → 剩余空格按 绷带 / 止痛 / 医疗包 / 手术包 顺序塞满（弹挂优先，背包垫底） */
function bestOwnedGear(kind) {                        // 拥有的同 kind 里容量最大的一件 key（没拥有 → null）
  let best = null;
  for (const k in SAVE.gearOwned) {
    const g = GEAR[k];
    if (g && g.kind === kind && (SAVE.gearOwned[k] | 0) > 0 && (!best || g.cap > GEAR[best].cap)) best = k;
  }
  return best;
}
function autoRestock() {
  if (!SAVE.worn) SAVE.worn = { rig: null, pack: null };
  if (!SAVE.worn.rig) SAVE.worn.rig = bestOwnedGear('rig');
  if (!SAVE.worn.pack) SAVE.worn.pack = bestOwnedGear('pack');
  trimCarryToCap();
  const C = SAVE.carry;
  let did = 0;
  for (const c of C.rig) {
    if (c && c.t === 'ammo') {
      const cap = ammoCellCap(c.cal, SAVE.owned);
      const add = takeAmmoStock(c.cal, c.lv, cap - (c.n | 0));
      if (add > 0) { c.n = (c.n | 0) + add; did++; }
    }
  }
  for (const cal of CAL_ORDER) {
    const slot = C.rig.findIndex(x => !x);
    if (slot < 0) break;
    if (C.rig.some(x => x && x.t === 'ammo' && x.cal === cal)) continue;
    const hasGun = WEAPON_ORDER.some(w => SAVE.owned[w] && calOfWeapon(w) === cal);
    if (!hasGun) continue;
    const c = stockTakeAmmo(cal);
    if (c) { C.rig[slot] = c; did++; }
  }
  const fillOrder = [];
  for (const id of STOP_ORDER) {
    const have = SAVE.stops[id] | 0;
    if (have <= 0) continue;
    const capS = Math.max(1, ((STOPS[id] || STOPS.bandage).uses | 0) || 1);
    fillOrder.push({ kind: 'stop', id, n: Math.ceil(have / capS) });   // 按瓶数排（每次取一整瓶）
  }
  for (const id of MEDKIT_ORDER) {
    const s = SAVE.meds[id] || { n: 0 };
    for (let k = 0; k < (s.n | 0); k++) fillOrder.push({ kind: 'med', id });
  }
  for (const id of SURG_ORDER) fillOrder.push({ kind: 'surg', id, n: ((SAVE.surgs[id] && SAVE.surgs[id].uses) | 0) });
  for (const id of REPAIR_ORDER) {
    const ss = SAVE.repairs[id] || { n: 0 };
    for (let k = 0; k < (ss.n | 0); k++) fillOrder.push({ kind: 'repair', id });
    if ((Number(ss.left) || 0) > 0.01) fillOrder.push({ kind: 'repair', id });
  }
  const zones = [C.rig, C.pocket, C.pack];
  for (const it of fillOrder) {
    for (let k = 0; k < (it.n == null ? 1 : it.n); k++) {
      const probe = { t: it.kind, id: it.id };       // 只为算占格形状（必须带 id：药箱 / DEK 手术包尺寸不同）
      let placed = false;
      for (let zi = 0; zi < zones.length && !placed; zi++) {
        const arr = zones[zi];
        const blocks = zoneBlocks(ZONE_NAMES[zi]);
        const fit = findFitAuto(arr, blocks, probe);
        if (!fit) continue;
        let c = null;
        if (it.kind === 'stop') c = stockTakeCell('stop', it.id);
        else if (it.kind === 'med') c = stockTakeCell('med', it.id);
        else if (it.kind === 'repair') c = stockTakeCell('repair', it.id);
        else c = stockTakeCell('surg', it.id);
        if (c) { applyFitRot(c, fit.rot); placeAtRun(arr, fit.at, c, blocks); did++; placed = true; }
      }
      if (!placed) break;
    }
  }
  saveGame();
  renderLoadout();
  if (did) uiToast('整备完成 · 动了 ' + did + ' 格', 'small');
  else uiToast('没有可整备的（仓库没货或格子已满）', 'small');
}

/* 全部卸下：所有格子原物回仓 */
function clearCarryAll() {
  const C = SAVE.carry;
  const zoneNames = ['rig', 'pocket', 'pack'];
  [C.rig, C.pocket, C.pack].forEach((arr, zi) => {
    const blocks = zoneBlocks(zoneNames[zi]);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && !arr[i].cont) { cellToStock(arr[i]); clearSpanAt(arr, i, blocks); }
    }
  });
  saveGame();
  renderLoadout();
  uiToast('已全部卸下回仓库', 'small');
}

/* ══════════════════════════════════════════════════════════
   局内背包：按 Tab 打开，时间暂停，格子之间倒腾
   ──────────────────────────────────────────────────────────
   弹挂 / 口袋 = 快捷可用（按 5 打药、R 换弹认这两个容器）；
   背包 = 仓库格，里面的东西要倒进弹挂 / 口袋才能用。
   ══════════════════════════════════════════════════════════ */
const PK_UI = { held: null };
const PK_ZONES = [
  ['pkRig', () => P.rig, 0, '弹 挂 · 快捷可用'],
  ['pkPocket', () => P.pocket, 1, '口 袋 · 快捷可用'],
  ['pkPack', () => P.pack, 2, '背 包 · 只能中转'],
];

/* ── 局内穿甲：把一件 {id,hp,max} 穿到身上（与开局装备同一套字段）── */
function wearArmorPiece(pc) {
  const AR = ARMORS[pc && pc.id] || ARMORS[0];
  if (!AR || AR.lv <= 0) return false;
  P.armorId = AR.id;
  P.armorLv = AR.lv | 0;
  P.armorName = AR.name;
  P.armorHp = clamp(Math.round(pc.hp), 0, Math.max(1, Math.round(pc.max)));
  P.armorMax = Math.max(1, Math.round(pc.max));
  P.armorDR = AR.dr;
  P.armorAim = AR.aim || 0;        // 瞄准惩罚：开火散布变大
  P.armorMove = AR.move || 0;      // 移速惩罚：走得慢
  P.armorLoad = AR.load || 0;      // 负重：影响跑步耗体力
  return true;
}
/* 脱甲：回到「无护甲」（身上那件由调用方拿着） */
function stripArmorNaked() {
  P.armorId = 0; P.armorLv = 0; P.armorName = '';
  P.armorHp = 0; P.armorMax = 0; P.armorDR = 0;
  P.armorAim = 0; P.armorMove = 0; P.armorLoad = 0;
}
/* 身上这件的格子形态（脱下来就能直接进背包 / 丢地上） */
function currentArmorPiece() {
  return P.armorLv > 0
    ? { id: P.armorId, hp: Math.round(P.armorHp), max: Math.max(1, Math.round(P.armorMax)) }
    : null;
}
/* 背包塞不下时的兜底：直接换穿 —— 身上那件（耐久原样）掉在脚边，不吞任何东西。
   只升不降：裸奔 / 更高级 / 同级更大杯才换，不然低级甲会把身上的好甲顶掉。 */
function swapWearArmor(pc) {
  const AR = ARMORS[pc && pc.id];
  if (!AR || AR.lv <= 0) return false;
  const prev = currentArmorPiece();
  if (prev) {
    const better = AR.lv > P.armorLv || (AR.lv === P.armorLv && Math.round(pc.max) > P.armorMax);
    if (!better) return false;                   // 不如身上的：不自动换，留给玩家 Tab 里自己决定
  }
  if (!wearArmorPiece(pc)) return false;
  if (prev) {
    G.pickups.push({
      x: P.x + rand(-8, 8), y: P.y + rand(22, 40),
      kind: 'cell', cell: { t: 'armor', id: prev.id, hp: prev.hp, max: prev.max },
      life: 600, bob: rand(0, TAU), value: 0, relicId: null, cool: 1.6,
    });
  }
  recountLoot();
  uiToast('背包满了 · 直接穿上 ' + ARMORS[P.armorId].name + (prev ? '（换下的在脚边）' : ''), 'small');
  Sfx.pickup();
  return true;
}

/* 局内捡到弹挂 / 背包：直接换穿。
   容量变大补空格；变小把多出格子的东西掉在脚边；换下来的旧装备也掉脚边（可再捡回去换穿）。
   同款再捡 = 备用件直接收下（撤离 +1）。fromLoot = 这是这局捡的（计缴获台账）。 */
function gearDropCell(c) {
  G.pickups.push({ x: P.x + rand(-14, 14), y: P.y + rand(18, 40),
    kind: 'cell', cell: c, life: 600, bob: rand(0, TAU), value: 0, relicId: null, cool: 1.6 });
}
function wearGearInRaid(key, fromLoot, incoming) {
  const g = GEAR[key];
  if (!g || !SAVE.worn) return false;
  const kind = g.kind;
  const prevKey = SAVE.worn[kind] || null;
  if (prevKey === key) {
    /* 同款：装备本身 = 备用件；带来的东西直接往身上塞，塞不下掉脚边 */
    for (const c of (incoming || [])) { if (!stowCell(c)) gearDropCell(c); }
    if (fromLoot) P.gearLoot[key] = (P.gearLoot[key] | 0) + 1;
    recountLoot();
    uiToast(g.name + ' · 备用件已收下' + ((incoming || []).length ? '（里面的东西已并入）' : ''), 'small');
    return true;
  }
  const arr = kind === 'rig' ? P.rig : P.pack;
  if (!arr) return false;
  const outgoing = arr.filter(c => c && !c.cont);   // 旧装备自己的东西跟着旧装备走（占位格不是东西）
  SAVE.worn[kind] = key;
  arr.length = 0;
  for (let i = 0; i < g.cap; i++) arr.push(null);
  const leftover = [];
  for (const c of (incoming || [])) { if (!stowCell(c)) leftover.push(c); }
  if (prevKey && GEAR[prevKey]) {
    /* 旧装备连里面的东西掉脚边：件数先 -1（捡回来时 gearLoot 会 +1，进出账对称） */
    SAVE.gearOwned[prevKey] = (SAVE.gearOwned[prevKey] | 0) - 1;
    if ((SAVE.gearOwned[prevKey] | 0) <= 0) delete SAVE.gearOwned[prevKey];
    gearDropCell({ t: 'gear', key: prevKey, cells: outgoing });
  }
  for (const c of leftover) gearDropCell(c);
  if (fromLoot) P.gearLoot[key] = (P.gearLoot[key] | 0) + 1;
  recountLoot();
  uiToast(g.name + ' 已换上' + (prevKey && GEAR[prevKey] ? '（' + GEAR[prevKey].name + ' 在脚边）' : ''), 'small');
  Sfx.pickup();
  return true;
}

/* 地上捡枪的兜底：有空武器槽直接装上；主副手枪槽全占着就和手上这把换 ——
   手上的枪掉回原地（不吞枪）。没背包也能捡。成功返回 true。 */
function groundGunTake(c, gx, gy) {
  const wid = c && c.id;
  if (!wid || !WEAPONS[wid]) return false;
  const isP = !!PISTOL_IDS[wid];
  if (!P.slots) P.slots = { primary: null, secondary: null, pistol: null };
  const spots = isP ? ['pistol'] : ['primary', 'secondary'];
  let target = spots.find(k => !P.slots[k]);
  if (!target) {
    /* 全占着：换下当前手上的枪（手持近战 / 医疗时退而换主武器） */
    const cur = (P.curSlot === 'primary' || P.curSlot === 'secondary' || P.curSlot === 'pistol') ? P.curSlot : 'primary';
    const oldId = P.slots[cur];
    if (!oldId) return false;
    target = cur;
    G.pickups.push({
      x: gx + rand(-8, 8), y: gy + rand(22, 40),
      kind: 'cell', cell: { t: 'gun', id: oldId },
      life: 600, bob: rand(0, TAU), value: 0, relicId: null, cool: 1.6,
    });
    uiToast('换枪 · ' + WEAPONS[oldId].short + ' 掉在脚边', 'small');
  }
  P.slots[target] = wid;
  if (P.curSlot === target) P.weapon = wid;      // 换的就是手里这把：枪口立刻跟上
  if (!P.owned[wid]) {
    P.owned[wid] = true;
    P.ammo[wid] = { mag: weaponStats(wid).mag, tier: ammoPickOf(calOfWeapon(wid)), cal: calOfWeapon(wid),
      rounds: Array(weaponStats(wid).mag).fill(ammoPickOf(calOfWeapon(wid))) };
    addReserve(calOfWeapon(wid), weaponStats(wid).mag * 2, P.ammo[wid].tier);   // 缴获自带两个弹匣
  }
  P.gunLoot[wid] = (P.gunLoot[wid] | 0) + 1;     // 缴获台账：撤离时仓库 +1 把（新枪、同款都算）
  recountLoot();
  return true;
}

$('pack').addEventListener('contextmenu', e => e.preventDefault());   // 右键是快捷操作，不弹浏览器菜单

function togglePackPanel() {
  if (G.packOpen) closePackPanel();
  else openPackPanel();
}
function openPackPanel() {
  if (G.scene !== 'playing' || !P.alive || isDowned()) return;
  if (G.lootPanel) closeLootPanel();                  // 搜刮面板和背包面板不叠在一起
  if (P.medOn) endCareBack('已收手');                 // 收拾背包前先把手上的药收了
  G.packOpen = true;
  PK_UI.held = null;
  mouse.down = false; mouse.pressed = false;
  MED_SEL.down = false; MED_SEL.open = false;
  for (const k in keys) keys[k] = false;             // 松开所有移动键：面板后面不再瞎走
  renderPackPanel();
  $('pack').classList.remove('hidden');
}
function closePackPanel() {
  if (!G.packOpen) return;
  if (PK_DRAG.active) pkFinishDrag(null);          // 拖拽收尾（回原位）
  if (G.modWin) { G.modWin = null; $('modWin').classList.add('hidden'); }   // 改装窗跟着关
  if (PK_UI.held) {                                // 手上还拿着：塞回任意空格，实在没有就丢地上
    if (!stowCell(PK_UI.held)) dropHeldToGround();
    PK_UI.held = null;
    recountLoot();
  }
  G.packOpen = false;
  $('pack').classList.add('hidden');
}

/* ── 局内改装窗：Tab 背包里右键枪槽弹出。
   槽位行：拖配件上去装（旧的下到手上）/ 拖已装的下来卸 / 右键拆进包；
   下面列身上（弹挂 / 口袋 / 背包）的配件，拖到槽位装枪。
   标题栏按住拖动窗口，Esc / 关闭按钮收窗（手上的配件自动塞包）。 ── */
function openModWin(wid) {
  if (!G.packOpen || !wid || !WEAPONS[wid]) return;
  if (!GUN_SLOTS.some(sl => P.slots && P.slots[sl] === wid)) return;
  G.modWin = { gun: wid, x: null, y: null };
  $('modWin').classList.remove('hidden');
  if (G.modWin.x == null) {                        // 默认停在面板右侧（记住上次拖到的位置）
    const win = $('modWin');
    const px = window.__modWinPos ? window.__modWinPos.x : Math.round(innerWidth / 2 + 210);
    const py = window.__modWinPos ? window.__modWinPos.y : 110;
    win.style.left = px + 'px';
    win.style.top = py + 'px';
  }
  renderModWin();
  Sfx.tone(760, 0.05, 0.04, 'square');
}

function closeModWin() {
  if (!G.modWin) return;
  if (PK_DRAG.active) pkFinishDrag(null);
  if (PK_UI.held) {                                // 手上还拿着（多半是刚拆下的配件）：塞包 / 丢地上
    if (!stowCell(PK_UI.held)) dropHeldToGround();
    PK_UI.held = null;
    recountLoot();
  }
  G.modWin = null;
  $('modWin').classList.add('hidden');
  renderPackPanel();
}

function renderModWin() {
  if (!G.modWin) return;
  const wid = G.modWin.gun;
  if (!GUN_SLOTS.some(sl => P.slots && P.slots[sl] === wid)) { closeModWin(); return; }   // 枪不在身上了
  const W = WEAPONS[wid];
  $('modWinTitle').textContent = W.short + ' · 改装 ' + gunModCount(wid) + '/' + modSlotTotal(wid);
  const slotsEl = $('modWinSlots');
  slotsEl.innerHTML = '';
  const eq = (SAVE.mods && SAVE.mods[wid]) || {};

  /* 槽位行：这把枪能装的每个槽位一格 */
  for (const s of MOD_SLOTS) {
    if (!slotAllowed(wid, s.id)) continue;
    const mid = eq[s.id] && MODS[eq[s.id]] ? eq[s.id] : null;
    const m = mid ? MODS[mid] : null;
    const el = document.createElement('div');
    el.className = 'lo-cell' + (mid ? '' : ' empty');
    el.innerHTML = mid
      ? '<span class="ic" style="color:' + (QUALITY[m.q] ? QUALITY[m.q].color : '#c9a3ff') + '">' + m.icon + '</span>' +
        '<span class="nm">' + m.name + '</span>' +
        '<span class="sub">' + s.cn + '</span>'
      : '<span class="nm" style="color:#8a8264">' + s.cn + '</span><span class="sub">空 · 拖配件上枪</span>';

    const installPlace = () => {                    // 拖配件到这个槽位 = 装上（旧的下到手上）
      if (!PK_UI.held) return;
      if (PK_UI.held.t !== 'mod') { uiToast('只有配件能装上枪', 'small warn'); return; }
      const nm = MODS[PK_UI.held.id];
      if (!nm) return;
      if (nm.slot !== s.id) { uiToast('这是' + ((MOD_SLOTS.find(x => x.id === nm.slot) || {}).cn || '其他') + '配件，拖到对应槽位', 'small warn'); return; }
      SAVE.mods[wid] = SAVE.mods[wid] || {};
      const old = SAVE.mods[wid][s.id];
      SAVE.mods[wid][s.id] = PK_UI.held.id;
      PK_UI.held = old ? { t: 'mod', id: old } : null;
      Sfx.tone(760, 0.06, 0.05, 'square');
      renderModWin(); renderPackPanel();
    };
    el.__pkPlace = installPlace;

    if (mid) {
      const pickMod = () => {                       // 拿起 = 拆下（拖去包格 / 丢弃区；空处松手装回去）
        delete SAVE.mods[wid][s.id];
        PK_UI.held = { t: 'mod', id: mid };
        Sfx.tone(420, 0.05, 0.04, 'square');
        return () => {                              // 取消：槽位还空着就装回去
          if (!SAVE.mods[wid][s.id]) { SAVE.mods[wid][s.id] = PK_UI.held.id; PK_UI.held = null; }
        };
      };
      el.oncontextmenu = e => {                     // 右键 = 拆下直接塞进随身容器
        e.preventDefault(); e.stopPropagation();
        if (PK_UI.held) { uiToast('先放下手上的东西', 'small warn'); return; }
        delete SAVE.mods[wid][s.id];
        const cell = { t: 'mod', id: mid };
        if (stowCell(cell)) uiToast('已拆下 · ' + m.name + ' 收进包', 'small');
        else { PK_UI.held = cell; uiToast('包满了 · ' + m.name + ' 在手上（拖进格子或丢地上）', 'small warn'); }
        Sfx.tone(420, 0.05, 0.04, 'square');
        recountLoot(); renderModWin(); renderPackPanel();
      };
      pkPressable(el, pickMod, installPlace);
    } else {
      pkPressable(el, () => null, installPlace);
    }
    slotsEl.appendChild(el);
  }

  /* 身上的配件：弹挂 / 口袋 / 背包里的 mod 格子，都能拿起拖去装枪 */
  const bagEl = $('modWinBag');
  bagEl.innerHTML = '';
  let found = 0;
  const bagZones = [[() => P.rig, 0, '弹挂'], [() => P.pocket, 1, '口袋'], [() => P.pack, 2, '背包']];
  for (const [getArr, zone, zn] of bagZones) {
    const arr = getArr();
    arr.forEach((c, i) => {
      if (!c || c.t !== 'mod' || !MODS[c.id]) return;
      found++;
      const mm = MODS[c.id];
      const el = document.createElement('div');
      el.className = 'lo-cell';
      el.innerHTML = '<span class="ic" style="color:' + (QUALITY[mm.q] ? QUALITY[mm.q].color : '#c9a3ff') + '">' + mm.icon + '</span>' +
        '<span class="nm">' + mm.name + '</span>' +
        '<span class="sub">' + zn + ' · ' + ((MOD_SLOTS.find(x => x.id === mm.slot) || {}).cn || '?') + '</span>';
      const pickBag = () => {                       // 拿起（拖去槽位装枪 / 拖回格子）
        arr[i] = null;
        PK_UI.held = c;
        Sfx.tone(500, 0.05, 0.04, 'square');
        return () => { if (!arr[i]) { arr[i] = PK_UI.held; PK_UI.held = null; } };
      };
      const placeBag = () => pkPlaceInto(arr, i, zone);
      el.__pkPlace = placeBag;
      pkPressable(el, pickBag, placeBag);
      bagEl.appendChild(el);
    });
  }
  if (!found) bagEl.innerHTML = '<span style="font-size:11px;color:#3f5d72;padding:4px">身上没有配件 · 翻箱搜到的配件放进弹挂 / 背包后出现在这里</span>';
}

/* 改装窗拖动：按住标题栏跟着指针走，位置记在 G.modWin 里换枪重开不跑位 */
if (typeof document !== 'undefined' && !window.__modWinWired) {
  window.__modWinWired = true;
  let mwOff = null;
  $('modWinHead').addEventListener('pointerdown', e => {
    if (e.button !== 0 || !G.modWin || e.target.closest('#modWinClose')) return;
    const win = $('modWin');
    mwOff = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!mwOff || !G.modWin) return;
    const win = $('modWin');
    G.modWin.x = clamp(e.clientX - mwOff.dx, 4, Math.max(4, innerWidth - win.offsetWidth - 4));
    G.modWin.y = clamp(e.clientY - mwOff.dy, 4, Math.max(4, innerHeight - 60));
    win.style.left = G.modWin.x + 'px';
    win.style.top = G.modWin.y + 'px';
    window.__modWinPos = { x: G.modWin.x, y: G.modWin.y };
  });
  document.addEventListener('pointerup', () => { mwOff = null; });
  $('modWinClose').addEventListener('click', closeModWin);
}

/* 背包面板的放置结算：手上的东西放进 (arr, i)。合并 / 交换 / 拒收都处理。 */
function pkPlaceInto(arr, i, zone) {
  const held = PK_UI.held;
  if (!held) return;
  const blocks = zoneBlocks(ZONE_NAMES[zone]);
  const c0 = arr[i];
  const hi = c0 && c0.cont ? c0.head : i;           // 落在延续格 = 落在那件物品头上
  /* 自己装自己：手上这件装备就是渲染这片格子的容器（同 key 穿着中）——塞进去 = 递归套娃，东西会凭空消失 */
  if (held.t === 'gear' && ZONE_NAMES[zone] !== 'pocket' && SAVE.worn[ZONE_NAMES[zone]] === held.key) {
    uiToast(ZONE_NAMES[zone] === 'pack' ? '背包不能装回自己里面' : '弹挂不能装回自己里面', 'small warn');
    return;
  }
  if (!cellAccepts(held, zone)) {
    uiToast(CELL_REJECT_HINT[held.t] || '这件放不进格子', 'small warn');
    return;
  }
  const cell = heldToCell(held);
  const c = arr[hi];
  if (!c) {                                          // 空格：整件塞进落点所在隔舱（放不下自动转 90°）
    const fit = resolveDropAt(arr, blocks, hi, cell);
    if (!fit) { uiToast(iszHint(cell), 'small warn'); return; }
    applyFitRot(cell, fit.rot);
    placeAtRun(arr, fit.at, cell, blocks);
    PK_UI.held = null;
  } else if (stackInto(held, c, ownedMapLive())) {   // 同弹药合并（补满为止，剩余留在手上）
    if ((held.n | 0) <= 0) PK_UI.held = null;
  } else {                                           // 交换：原来的那件整块换到手上
    if (PK_UI.fromLoot) {                            // 从容器里刚拿起来的：不许把格子里的东西顶到手上
      uiToast('这个格子有东西了 · 换个空格放', 'small warn');
      return;
    }
    if (!c.cont) {
      clearSpanAt(arr, hi, blocks);
      const fit = resolveDropAt(arr, blocks, hi, cell) || findFitAuto(arr, blocks, cell);
      if (!fit) { placeAtRun(arr, hi, c, blocks); uiToast(iszHint(cell, cellName(cell)), 'small warn'); return; }
      applyFitRot(cell, fit.rot);
      placeAtRun(arr, fit.at, cell, blocks);
      PK_UI.held = c;
    }
  }
  Sfx.tone(620, 0.05, 0.04, 'square');
  /* 缴获台账：箱里翻出的枪 / 弹挂 / 背包收进包里 = 这局缴获 +1（撤离按实例入库；
     箱里的枪在 F 收下路径已记过账，这里只管拖拽路径） */
  if (PK_UI.fromLoot) {
    if (cell.t === 'gun' && WEAPONS[cell.id]) {
      if (!P.owned[cell.id]) {
        P.owned[cell.id] = true;
        P.ammo[cell.id] = { mag: weaponStats(cell.id).mag, tier: ammoPickOf(calOfWeapon(cell.id)), cal: calOfWeapon(cell.id),
          rounds: Array(weaponStats(cell.id).mag).fill(ammoPickOf(calOfWeapon(cell.id))) };
      }
      P.gunLoot[cell.id] = (P.gunLoot[cell.id] | 0) + 1;
    } else if (cell.t === 'gear' && GEAR[cell.key]) {
      P.gearLoot[cell.key] = (P.gearLoot[cell.key] | 0) + 1;
    }
    PK_UI.fromLoot = null;
  }
  recountLoot();
}

/* 手上这件丢到地上（拖到最右侧丢弃区 / 关面板时无处可放）。
   是枪的话：不在武器槽、背包里也没有第二把 → 注销局内所有权（真丢了）。 */
function dropHeldToGround() {
  const h = PK_UI.held;
  if (!h) return;
  const copy = Object.assign({}, h);
  G.pickups.push({
    x: P.x + rand(-8, 8), y: P.y + rand(22, 40),
    kind: 'cell', cell: copy, life: 600, bob: rand(0, TAU),
    value: 0, relicId: null, cool: 1.6,
  });
  if (h.t === 'gun') {
    const stillSlotted = GUN_SLOTS.some(sl => P.slots && P.slots[sl] === h.id);
    const stillCarried = allCarryZones().some(arr => arr.some(c => c && c.t === 'gun' && c.id === h.id));
    if (!stillSlotted && !stillCarried && P.owned[h.id]) {
      if ((P.gunLoot[h.id] | 0) > 0) P.gunLoot[h.id]--;   // 丢的是缴获副本：台账 -1
      else { delete P.owned[h.id]; delete P.ammo[h.id]; }
    }
  }
  /* 丢在脚边的弹挂 / 背包：件数 -1（捡回来时 gearLoot 会 +1，进出账对称） */
  if (h.t === 'gear' && GEAR[h.key]) {
    SAVE.gearOwned[h.key] = (SAVE.gearOwned[h.key] | 0) - 1;
    if ((SAVE.gearOwned[h.key] | 0) <= 0) delete SAVE.gearOwned[h.key];
  }
  recountLoot();
  uiToast('已丢弃 · ' + cellName(h) + (h.t === 'ammo' ? ' ' + (h.n | 0) + ' 发' : ''), 'small');
  PK_UI.held = null;
  Sfx.tone(240, 0.09, 0.06, 'square');
}

/* ══ 槽位构建器：Tab 背包面板（renderPackPanel）和搜刮面板（renderLootEquipSlots）共用 ══
   refresh = 面板自己的重绘函数（右键脱下后刷哪边）。 */

function pkBuildArmorSlot(refresh) {              // 护甲槽：拖甲穿上，身上那件（耐久原样）换到手上
  const el = document.createElement('div');
  el.className = 'lo-cell pk-slot' + (P.armorLv > 0 ? '' : ' empty');
  if (P.armorLv > 0) {
    const A = ARMORS[P.armorId] || ARMORS[0];
    el.innerHTML = '<span class="ic" style="color:' + armorLvColor(P.armorLv) + '">⛨</span>' +
      '<span class="nm">' + A.short + '</span>' +
      '<span class="sub">' + P.armorLv + ' 级 · ' + Math.round(P.armorHp) + '/' + Math.round(P.armorMax) + ' · 右键脱下</span>';
  } else el.innerHTML = '<span class="sub" style="color:#7fb8d4">护 甲</span>';

  const pickArmor = () => {                     // 拿起：脱下来（回到无护甲）
    if (P.armorLv <= 0) return null;
    const pc = currentArmorPiece();
    stripArmorNaked();
    PK_UI.held = { t: 'armor', id: pc.id, hp: pc.hp, max: pc.max };
    Sfx.tone(500, 0.05, 0.04, 'square');
    return () => {                              // 取消：身上还光着就穿回去
      if (P.armorLv <= 0 && PK_UI.held && PK_UI.held.t === 'armor') {
        wearArmorPiece(PK_UI.held);
        PK_UI.held = null;
      }
    };
  };
  const placeArmor = () => {                    // 放置：穿上（身上那件换到手上）
    if (!PK_UI.held) return;
    if (PK_UI.held.t !== 'armor') { uiToast('只有护甲能穿进护甲槽', 'small warn'); return; }
    const prev = currentArmorPiece();
    if (!wearArmorPiece(PK_UI.held)) { uiToast('这件护甲有问题，穿不上', 'small warn'); return; }
    PK_UI.held = prev ? { t: 'armor', id: prev.id, hp: prev.hp, max: prev.max } : null;
    uiToast(ARMORS[P.armorId].name + ' 已穿上', 'small');
    Sfx.tone(620, 0.05, 0.04, 'square');
  };
  el.__pkPlace = placeArmor;
  el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); pickArmor(); refresh(); };   // 右键 = 脱下到手上
  pkPressable(el, pickArmor, placeArmor);
  return el;
}

function pkBuildGearSlot(kind, refresh, placeGear) {   // 弹挂 / 背包槽：拖上换穿（里面的东西跟着走）
  const key = SAVE.worn ? SAVE.worn[kind] : null;
  const g = key ? GEAR[key] : null;
  const arr = kind === 'rig' ? P.rig : P.pack;
  const used = arr ? arr.filter(c => c && !c.cont).length : 0;
  const el = document.createElement('div');
  el.className = 'lo-cell pk-slot' + (g ? '' : ' empty');
  el.innerHTML = g
    ? '<span class="ic" style="color:' + (g.color || '#ffb08a') + '">' + (kind === 'rig' ? '\u25a4' : '\u25a9') + '</span>' +
      '<span class="nm">' + g.name + '</span>' +
      '<span class="sub">' + g.cap + ' 格 · 里面 ' + used + ' 件</span>'
    : '<span class="sub" style="color:#7fb8d4">' + (kind === 'rig' ? '\u5f39 \u6302' : '\u80cd \u5305') + '</span>';

  const pickGearSlot = () => {              // 脱下到手上（连内容）
    if (!g) return null;
    const cells = (arr || []).filter(c => c && !c.cont);
    SAVE.worn[kind] = null;
    if (arr) arr.length = 0;
    PK_UI.held = { t: 'gear', key, cells };
    recountLoot();
    Sfx.tone(500, 0.05, 0.04, 'square');
    return () => {                          // 取消：穿回去（东西还原）
      if (SAVE.worn && !SAVE.worn[kind] && PK_UI.held && PK_UI.held.t === 'gear' && PK_UI.held.key === key) {
        const gg = GEAR[key];
        const a = kind === 'rig' ? P.rig : P.pack;
        a.length = 0;
        for (let i = 0; i < gg.cap; i++) a.push(PK_UI.held.cells[i] || null);
        PK_UI.held = null;
        recountLoot();
      }
    };
  };
  const defaultGearPlace = () => {          // 换上（旧的下到手上，新装备带来的东西入格，装不下掉脚边）
    if (!PK_UI.held || PK_UI.held.t !== 'gear') {
      uiToast(kind === 'rig' ? '弹挂槽只能穿弹挂（背包槽在右边）' : '背包槽只能穿背包（弹挂槽在左边）', 'small warn');
      return;
    }
    const nk = PK_UI.held.key, ng = GEAR[nk];
    if (!ng || ng.kind !== kind) { uiToast('这是' + (GEAR[nk] && GEAR[nk].kind === 'rig' ? '弹挂' : '背包') + '，拖到对应的槽', 'small warn'); return; }
    const incoming = PK_UI.held.cells || [];
    const prevKey = SAVE.worn[kind];
    if (prevKey === nk) {                              // 同款已经在身上：手上这份是另一份实体，换穿会造出双指针幽灵
      uiToast('这件已经穿在身上 · 手上这份拖进背包存放', 'small warn');
      return;
    }
    const outgoing = (arr || []).filter(c => c && !c.cont);
    PK_UI.held = prevKey && GEAR[prevKey] ? { t: 'gear', key: prevKey, cells: outgoing } : null;
    SAVE.worn[kind] = nk;
    arr.length = 0;
    for (let i = 0; i < ng.cap; i++) arr.push(null);
    for (const c of incoming) { if (!stowCell(c)) gearDropCell(c); }
    recountLoot();
    uiToast(ng.name + ' 已换上' + (prevKey && GEAR[prevKey] ? '（' + GEAR[prevKey].name + ' 在手上）' : ''), 'small');
    Sfx.tone(620, 0.05, 0.04, 'square');
  };
  el.__pkPlace = placeGear || defaultGearPlace;
  el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); pickGearSlot(); refresh(); };  // 右键 = 脱下到手上
  pkPressable(el, pickGearSlot, el.__pkPlace);
  return el;
}

function pkBuildGunSlot(sl, refresh) {            // 武器槽：拖枪装上（旧的下到手上），拖配件上枪直接改装
  const sd = SLOT_DEFS.find(d => d.id === sl);
  const id = P.slots ? P.slots[sl] : null;
  const el = document.createElement('div');
  el.className = 'lo-cell pk-slot' + (id ? '' : ' empty');
  el.innerHTML = id
    ? '<span class="ic" style="color:#ffca7a">' + cellIcon({ t: 'gun', id }) + '</span>' +
      '<span class="nm">' + WEAPONS[id].short + '</span>' +
      '<span class="sub">' + caliberOf(id).short + ' · ' + weaponStats(id).mag + ' 发 · 配件 ' + gunModCount(id) + '/' + modSlotTotal(id) + '</span>'
    : '<span class="sub">' + (sd ? sd.cn : sl) + '</span>';
  const pickSlot = () => {                      // 拿起：从槽里取下
    if (!P.slots || !P.slots[sl]) return null;
    const gid = P.slots[sl];
    P.slots[sl] = null;
    PK_UI.held = { t: 'gun', id: gid };
    Sfx.tone(500, 0.05, 0.04, 'square');
    return () => {                              // 取消：还回槽里
      if (!P.slots[sl]) { P.slots[sl] = PK_UI.held.id; PK_UI.held = null; }
    };
  };
  const placeSlot = () => {                     // 放置：装枪 / 装配件
    if (!PK_UI.held) return;
    /* 拖配件到枪上：按配件自身的槽位装进去，换下来的回到手上 */
    if (PK_UI.held.t === 'mod') {
      const m = MODS[PK_UI.held.id];
      if (!m) { uiToast('未知配件', 'small warn'); return; }
      const wid = P.slots ? P.slots[sl] : null;
      if (!wid) { uiToast('这个槽上没有枪', 'small warn'); return; }
      if (!slotAllowed(wid, m.slot)) { uiToast(WEAPONS[wid].short + ' 装不了' + (MOD_SLOTS.find(s => s.id === m.slot) || {}).cn, 'small warn'); return; }
      SAVE.mods[wid] = SAVE.mods[wid] || {};
      const old = SAVE.mods[wid][m.slot];
      SAVE.mods[wid][m.slot] = PK_UI.held.id;   // 配件装上（直接写档案：撤离/死亡结算都认这份数据）
      PK_UI.held = old ? { t: 'mod', id: old } : null;   // 换下来的配件回到手上
      uiToast(WEAPONS[wid].short + ' · ' + m.name + ' 已装上', 'small');
      Sfx.tone(760, 0.06, 0.05, 'square');
      return;
    }
    if (PK_UI.held.t !== 'gun') {
      uiToast('只有枪能装进武器槽（配件拖到装着的枪上改装）', 'small warn');
      return;
    }
    /* 缴获的枪直接上槽：台账 +1（撤离按实例入库）+ 登记所有权（自带弹匣子弹） */
    if (PK_UI.fromLoot) {
      const wid = PK_UI.held.id;
      if (WEAPONS[wid]) {
        if (!P.owned[wid]) {
          P.owned[wid] = true;
          P.ammo[wid] = { mag: weaponStats(wid).mag, tier: ammoPickOf(calOfWeapon(wid)), cal: calOfWeapon(wid),
            rounds: Array(weaponStats(wid).mag).fill(ammoPickOf(calOfWeapon(wid))) };
        }
        P.gunLoot[wid] = (P.gunLoot[wid] | 0) + 1;
      }
      PK_UI.fromLoot = null;
    }
    const prev = P.slots[sl];
    P.slots[sl] = PK_UI.held.id;
    PK_UI.held = prev ? { t: 'gun', id: prev } : null;
    Sfx.tone(620, 0.05, 0.04, 'square');
  };
  el.__pkPlace = placeSlot;                     // 拖拽落点用「目标格」自己的放置回调
  el.oncontextmenu = e => {                     // 右键 = 打开这把枪的改装窗（拖上装 / 拖下卸）
    e.preventDefault(); e.stopPropagation();
    if (!id) return;
    if (G.lootPanel) { uiToast('改装窗挂在背包面板上 · 关掉搜刮面板再改装', 'small warn'); return; }
    openModWin(id);
  };
  pkPressable(el, pickSlot, placeSlot);
  return el;
}

function renderPackPanel() {
  /* 武器槽：拖背包里的枪到这儿装上（原来的枪换到手上），拖下来收回背包；
     拖配件到枪上直接改装（换下来的配件回到手上）；护甲拖到护甲槽直接穿上 */
  const gunGrid = $('pkGuns');
  $('pkGunNote').textContent = '武 器 / 护 甲 槽 · 拖枪装上 · 拖护甲穿上 · 拖配件上枪 · 右键枪开改装窗';
  gunGrid.innerHTML = '';
  gunGrid.appendChild(pkBuildArmorSlot(renderPackPanel));
  for (const sl of GUN_SLOTS) gunGrid.appendChild(pkBuildGunSlot(sl, renderPackPanel));

  /* 弹挂 / 背包槽：拖背包里的装备到这儿换上（旧的下到手上，里面的东西跟着走）；
     点住 / 右键脱下到手上 —— 连里面的东西一起，拖到丢弃区扔地上就是「连包带物一起丢」 */
  {
    $('pkGearNote').textContent = '弹 挂 / 背 包 槽 · 拖上换穿 · 点住或右键脱下（里面的东西跟着走）';
    const gearGrid = $('pkGear');
    gearGrid.innerHTML = '';
    for (const kind of ['rig', 'pack']) gearGrid.appendChild(pkBuildGearSlot(kind, renderPackPanel));
  }

  for (const [gridId, getArr, zone, noteTxt] of PK_ZONES) {
    const noteEl = $(gridId + 'Note');
    const arr = getArr();
    const heads = arr.filter(c => c && !c.cont).length;
    if (noteEl) noteEl.textContent = noteTxt + ' · ' + heads + ' 件 / ' + arr.length + ' 格';
    renderCarryZoneGrid($(gridId), arr, zone);
  }
}

/* 把一个随身容器（0 弹挂 / 1 口袋 / 2 背包）画成隔舱格拼图 ——
   局内 Tab 面板和搜刮容器面板共用同一套渲染 / 拖拽。 */
function renderCarryZoneGrid(grid, arr, zone, opts) {
  if (!grid) return;
  const after = (opts && opts.onChange) || renderPackPanel;
  grid.innerHTML = '';
  const blocks = zoneBlocks(ZONE_NAMES[zone]);
  let lastBlkH = -1;
  for (const [s, e, C, brk, ml, mt, mr] of blocks) {
    const bh = (e - s) / C;                        // 舱高（格）
    // brk=2 → 强制不换行（同排高低舱混排，照实物图）；brk=1 → 强制换行；其余高度变化自动换行
    if (lastBlkH >= 0 && brk !== 2 && (bh !== lastBlkH || brk === 1)) {
      const br = document.createElement('div');
      br.className = 'blk-break';
      grid.appendChild(br);
    }
    lastBlkH = bh;
    const blk = document.createElement('div');
    blk.className = 'pk-blk';
    if (ml) blk.style.marginLeft = ml + 'px';      // 左移：压在上一排指定舱的正下方（如 raider 居中快取袋）
    if (mt) blk.style.marginTop = mt + 'px';       // 下移：小袋挂在同行高舱下方（如 xiqiang 零钱袋）
    if (mr) blk.style.marginRight = mr + 'px';     // 右缩：负值收窄占位宽，最右下小袋不触发 flex 回流
    const bgrid = document.createElement('div');
    bgrid.className = 'blk-grid';
    bgrid.style.gridTemplateColumns = 'repeat(' + C + ', var(--bcell))';
    for (let i = s; i < e; i++) {
      const c = arr[i];
      if (c && c.cont) continue;                   // 多格物品：整块画在 head 上
      const hi = i;
      const rel = i - s;
      /* 形状裁剪：物品比舱宽 / 舱高还大（换弹挂导致舱变窄后的遗留大件），
         绝不能让它把 CSS grid 撑出隐式列 —— 那样 1x3 舱会显示成 2 列宽 */
      const sh = c ? shapeOf(c, C) : [1, 1];
      const w = Math.max(1, Math.min(sh[0], C));
      const h = Math.max(1, Math.min(sh[1], bh));
      const el = document.createElement('div');
      el.className = 'lo-cell bcell' + (c ? '' : ' empty') + (c && (c.t === 'relic' || c.t === 'mod') ? ' relic-txt' : '');
      el.style.gridColumn = (rel % C + 1) + ' / span ' + w;
      el.style.gridRow = ((rel / C | 0) + 1) + ' / span ' + h;
      if (w > 1) el.style.width = 'calc(' + w + ' * var(--bcell) + ' + ((w - 1) * 2) + 'px)';    // 跨格：撑出实际宽
      if (h > 1) el.style.height = 'calc(' + h + ' * var(--bcell) + ' + ((h - 1) * 2) + 'px)';  // 跨格：撑出实际高
      if (c) {
        el.title = cellName(c) + (c.t === 'ammo' ? ' ×' + (c.n | 0) : '') + ' · ' + cellSub(c);
        let html = '<span class="ic' + icSizeCls(cellIcon(c)) + '" style="color:' + cellColor(c) + '">' + cellIcon(c) + '</span>';
        if (w > 1 || h > 1) html += '<span class="nm">' + cellName(c) + (c.t === 'ammo' ? ' ' + (c.n | 0) : '') + '</span>' +
          '<span class="sub">' + cellSub(c) + '</span>';
        else if (c.t === 'ammo') html += '<span class="ct">' + (c.n | 0) + '</span>';
        else if (c.t === 'stop') {                   // 一瓶多片：短名 + 右下角剩余片数
          const sn = (c.n | 0) || 1;
          html = '<span class="nm solo" style="color:' + cellColor(c) + '">' + cellName(c) + '</span>' +
            (sn > 1 ? '<span class="ct">' + sn + '</span>' : '');
        }
        else if (c.t === 'relic' || c.t === 'mod') {     // 1×1 收集品 / 配件：名称 + 价格 / 部位
          /* 配件的品质看名称颜色就够，信息行只留部位 —— 「枪托 · 普通」5 字在 46px 里必折行 */
          const subTxt = c.t === 'mod' ? cellSub(c).split(' · ')[0] : cellSub(c);
          html = '<span class="nm solo" style="color:' + cellColor(c) + '">' + cellName(c) + '</span>' +
            '<span class="sub">' + subTxt + '</span>';
        }
        el.innerHTML = html;
      }

      const pickCell = () => {                    // 拿起（多格物品整块一起）
        if (!arr[hi]) return null;
        const picked = arr[hi];
        clearSpanAt(arr, hi, blocks);
        PK_UI.held = picked;
        Sfx.tone(500, 0.05, 0.04, 'square');
        return () => {                            // 取消：原位还空着就放回去
          if (!arr[hi]) { placeAtRun(arr, hi, PK_UI.held, blocks); PK_UI.held = null; }
        };
      };
      const placeCell = () => pkPlaceInto(arr, hi, zone);   // 放置 / 交换 / 合并
      el.__pkPlace = placeCell;                   // 拖拽落在哪格就用哪格的回调
      if (c && c.t === 'armor') {
        el.oncontextmenu = e => {                 // 右键护甲 = 直接穿上（身上那件换回这个格子）
          e.preventDefault(); e.stopPropagation();
          const prev = currentArmorPiece();
          if (!wearArmorPiece(c)) { uiToast('这件护甲有问题，穿不上', 'small warn'); return; }
          clearSpanAt(arr, hi, blocks);
          if (prev) placeAtRun(arr, hi, { t: 'armor', id: prev.id, hp: prev.hp, max: prev.max }, blocks);
          uiToast('已穿上 ' + ARMORS[P.armorId].name + (prev ? ' · 换下的在格子里' : ''), 'small');
          Sfx.tone(620, 0.05, 0.04, 'square');
          after();
        };
      }
      pkPressable(el, pickCell, placeCell);
      bgrid.appendChild(el);
    }
    blk.appendChild(bgrid);
    grid.appendChild(blk);
  }
}

/* ── 局内拖拽（与大厅 LO_DRAG 同款手感）：
      按住 0.16s 或按下后拖动 10px 拿起，手上的东西跟着指针走；
      松手在格子上放置 / 交换 / 合并，松手在最右侧丢弃区扔到地上，
      空处松手放回原位。Esc 紧急脱手。 ── */
const PK_DRAG = { pending: null, active: false, sx: 0, sy: 0, timer: 0, revert: null, place: null };
const PK_HOLD_MS = 160;

function pkPressable(el, pick, place) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (PK_DRAG.active) { pkFinishDrag(null); return; }
    if (PK_DRAG.pending) return;
    PK_DRAG.pending = { pick, place };
    PK_DRAG.sx = e.clientX; PK_DRAG.sy = e.clientY;
    PK_DRAG.timer = setTimeout(() => {
      const p = PK_DRAG.pending;
      PK_DRAG.pending = null;
      if (p) pkDragBegin(p);
    }, PK_HOLD_MS);
  });
}

function pkDragBegin(p) {
  const rv = p.pick();
  if (!PK_UI.held) return;                        // 空格子：没拿到
  PK_DRAG.active = true;
  PK_DRAG.revert = rv || null;
  PK_DRAG.place = p.place || null;
  document.body.classList.add('lo-grabbing');
  $('pkDropZone').classList.remove('hidden');
  pkMoveChip(PK_DRAG.sx, PK_DRAG.sy);             // 拿起来就贴个浮标，别等第一下移动
}

function pkMoveChip(x, y) {
  let chip = $('pkHeldChip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'pkHeldChip';
    chip.className = 'lo-holding';
    document.body.appendChild(chip);
  }
  chip.style.left = Math.min(Math.max(0, x), innerWidth - 180) + 'px';
  chip.style.top = Math.min(Math.max(0, y), innerHeight - 40) + 'px';
  chip.textContent = '手持 · ' + cellName(PK_UI.held) + (PK_UI.held.t === 'ammo' ? ' ' + (PK_UI.held.n | 0) + ' 发' : '');
  chip.classList.remove('hidden');
}

function pkDropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return { kind: null, el: null };
  if (el.id === 'pkDropZone' || el.closest('#pkDropZone')) return { kind: 'drop', el: null };
  const cell = el.closest('.lo-cell');
  if (cell) {
    const inPack = $('pack') && $('pack').contains(cell);
    const inLoot = $('loot') && $('loot').contains(cell);
    if (inPack || inLoot) return { kind: 'cell', el: cell };
  }
  /* 搜刮界面右栏整块都能存：松在格缝 / 盒边 / 提示行上也算存进箱子，
     不必非得精确压在某一个格子上（格缝松手弹回去手感就是「放不进容器」） */
  const L = G.lootPanel;
  const box = $('lootBox');
  if (L && L.crate && !L.pile && !L.gear && box && box.__pkPlace) {
    const side = el.closest('.lo-lootside');
    if (side && $('loot').contains(side)) return { kind: 'cell', el: box };
  }
  return { kind: null, el: null };
}

function pkHighlight(target) {
  const prev = document.querySelector('.lo-cell.dragover, #lootBox.dragover');
  if (prev) prev.classList.remove('dragover');
  if (target && target.el) target.el.classList.add('dragover');
  const dz = $('pkDropZone');
  if (dz) dz.classList.toggle('on', !!(target && target.kind === 'drop'));
}

function pkEndVisuals() {
  PK_DRAG.active = false;
  document.body.classList.remove('lo-grabbing');
  pkHighlight(null);
  const dz = $('pkDropZone');
  if (dz) dz.classList.add('hidden');
  const chip = $('pkHeldChip');
  if (chip) chip.classList.add('hidden');
}

/* 松手结算：target = pkDropTargetAt 的结果（drop = 丢弃区 / cell = 格子 / null = 空处回原位）。
   try/finally 兜底：中途抛异常也绝不把手上的东西卡没。 */
function pkFinishDrag(target) {
  try {
    if (PK_UI.held) {
      if (target && target.kind === 'drop') {
        dropHeldToGround();
      } else if (target && target.kind === 'cell') {
        /* 关键：用落点格子自己的放置回调，不是拿起时那格的 ——
           否则拖到哪儿都算「放回原处」，手感就是「根本拖不动」。 */
        const put = (target.el && target.el.__pkPlace) || PK_DRAG.place;
        if (put) put();
      }
    }
  } finally {
    if (PK_UI.held) {                              // 没放出去：回原位
      let back = false;
      if (PK_DRAG.revert) { PK_DRAG.revert(); back = !PK_UI.held; }   // 回退真的把手上的东西安顿好才算数
      if (!back && PK_UI.held) {
        if (stowCell(PK_UI.held)) PK_UI.held = null;   // 塞进去了就要松手，否则会复制一件
        else dropHeldToGround();
      }
    }
    PK_DRAG.pending = null;
    PK_DRAG.revert = null;
    PK_DRAG.place = null;
    PK_UI.fromLoot = null;
    pkEndVisuals();
    renderPackPanel();
    if (G.lootPanel) lootRender();                 // 搜刮面板开着：左栏格子和容器格一起刷新
    if (G.modWin) renderModWin();                  // 拖拽可能动了配件：改装窗跟着刷
  }
}

if (typeof document !== 'undefined' && !window.__pkDragWired) {
  window.__pkDragWired = true;
  document.addEventListener('pointermove', e => {
    if (PK_DRAG.pending) {
      if (Math.hypot(e.clientX - PK_DRAG.sx, e.clientY - PK_DRAG.sy) > 10) {
        clearTimeout(PK_DRAG.timer);
        const p = PK_DRAG.pending;
        PK_DRAG.pending = null;
        if (e.pointerType === 'mouse' || e.pointerType == null) pkDragBegin(p);
      }
      return;
    }
    if (!PK_DRAG.active) return;
    pkMoveChip(e.clientX, e.clientY);
    pkHighlight(pkDropTargetAt(e.clientX, e.clientY));
  });
  document.addEventListener('pointerup', e => {
    if (PK_DRAG.pending) {                          // 单击（没拖动）：什么都不做 —— 防误点把东西拿在手上 / 弄丢
      clearTimeout(PK_DRAG.timer);
      PK_DRAG.pending = null;
      return;
    }
    if (!PK_DRAG.active) return;
    pkFinishDrag(pkDropTargetAt(e.clientX, e.clientY));
  });
  document.addEventListener('pointercancel', () => {
    if (PK_DRAG.pending) { clearTimeout(PK_DRAG.timer); PK_DRAG.pending = null; }
    if (PK_DRAG.active) pkFinishDrag(null);
  });
  window.addEventListener('blur', () => {
    if (PK_DRAG.pending) { clearTimeout(PK_DRAG.timer); PK_DRAG.pending = null; }
    if (PK_DRAG.active) pkFinishDrag(null);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (PK_DRAG.pending) { clearTimeout(PK_DRAG.timer); PK_DRAG.pending = null; }
    if (PK_DRAG.active) pkFinishDrag(null);
  });
}

/* ══════════════════════════════════════════════════════════
   18. 流程控制
   ══════════════════════════════════════════════════════════ */
function startRaid() {
  /* 行动门票：机密/绝密先掏钱再进场，阵亡不退。资金不足直接拦在大厅。 */
  const fee = entryFeeOf(G.tier);
  if (fee > 0 && SAVE.credits < fee) {
    uiToast('资金不足：' + (G.tier === 'top' ? '绝密' : '机密') + '行动门票 ¥' + fmtMoney(fee), 'warn');
    return;
  }
  Sfx.init();
  Sfx.resume();

  G.scene = 'playing';
  G.time = 0;
  G.raidTime = 0;
  G.score = 0;
  G.combo = 0;
  G.comboTimer = 0;
  G.kills = 0;
  G.blinds = 0;
  G.swarmHits = 0;
  G.bleedHits = 0;
  G.silentKills = 0;
  G.lootValue = 0;
  G.relics = [];
  G.foundMods = [];
  G.reinforceWave = 0;
  G.shake = 0;
  G.searchTarget = null;
  G.lootPanel = null;
  G.extractT = 0;
  mouse.pressed = false;        // 大厅里残留的一次按下不要带进出击的第一帧
  G.inExtract = null;

  BIGMAP.cv = null;              // 换图/新局：战术地图墙体缓存重烘
  BIGMAP.sig = '';

  G.bullets = [];
  G.enemies = [];
  G.particles = [];
  G.pickups = [];
  G.decals = [];
  G.popups = [];
  G.nades = [];
  G.icebolts = [];
  G.frosts = [];
  G.smokes = [];
  G.smokeBlind = 0;      // 玩家被自己丢的烟糊住的强度（0..1，屏幕遮罩用）
  G.flashes = [];
  G.blades = [];
  G.footprints = [];
  G.flashBlind = 0;
  G.hitmark = null;
  G.achReady = {};
  BLADE_LOCK.on = false; BLADE_LOCK.prog = 0; BLADE_LOCK.target = null; BLADE_LOCK.behind = false;
  G.gls = [];
  G.magbombs = [];
  G.shocks = [];
  G.frags = [];
  G.arrows = [];
  G.ezones = [];
  G.scanPings = [];
  G.healFields = [];
  G.drones = [];
  G.covers = [];
  G.loiters = [];
  G.icepots = [];
  G.fires = [];
  G.molotovs = [];
  G.rockets = [];

  SAVE.stats.raids++;
  if (fee > 0) SAVE.credits -= fee;
  G.raidFee = fee;
  saveGame();

  prepareWorldForRaid();
  resetPlayer();
  initFog();
  G.reinforceT = firstReinforceDelay();   // 必须在 prepareWorldForRaid 之后：机密图的首波更早
  G.bossSpawned = (G.units || []).some(u => u.type === 'boss');
  G.bossBarBottom = false;
  G.directorMarkT = 0;
  /* 航天基地（拉闸图）：安全总监每局在核心控制区随机位置出生，带一辆护卫小车。
     不走增援波 —— 世界上没有赤霄。 */
  if (G.extMode === 'switch') {
    spawnDirectorSquad();
    G.bossSpawned = true;
  }
  if (G.tier === 'top') uiToast('绝 密 行 动 · 敌人最硬 · 物资顶级', 'warn');
  else if (G.tier === 'secret') uiToast('机 密 行 动 · 敌人更强 · 物资更好', 'warn');

  G.cam.x = clamp(P.x - VW / ZOOM / 2, 0, Math.max(0, WORLD.w - VW / ZOOM));
  G.cam.y = clamp(P.y - VH / ZOOM / 2, 0, Math.max(0, WORLD.h - VH / ZOOM));

  G.alarm = 0;
  G.backups = [];       // 上一局没走完的增援别带进新局
  G.callCd = 0;
  G.callCd = 0;
  G.combatCount = 0;
  G.alertCount = 0;
  G.lastAlarmX = undefined;
  G.lastAlarmY = undefined;

  // 初始驻军：地图里布了点就按兵种落位；否则按 squad 随机铺到据点附近
  if (G.units && G.units.length) {
    for (const u of G.units) spawnEnemy(u.type, u.x, u.y, u.f);
    /* 新兵种保底：内置地图的布点是写死的，不含冰冻军团三兄弟与手雷兵。
       地图里没有就各补两个，落在据点附近的可通行处，免得整局见不到新兵种。 */
    const hasType = t => G.units.some(u => u.type === t);
    const F = G.spawnFaction || G.mapFaction || 'asara';
    if (!hasType('cryo')) { spawnEnemy('cryo', undefined, undefined, F); spawnEnemy('cryo', undefined, undefined, F); }
    if (!hasType('cryoT')) { spawnEnemy('cryoT', undefined, undefined, F); spawnEnemy('cryoT', undefined, undefined, F); }
    if (!hasType('cryoS')) { spawnEnemy('cryoS', undefined, undefined, F); spawnEnemy('cryoS', undefined, undefined, F); }
    if (!hasType('nader')) { spawnEnemy('nader', undefined, undefined, F); spawnEnemy('nader', undefined, undefined, F); }
  } else {
    const squad = (G.squad && G.squad.length) ? G.squad : DEFAULT_SQUAD;
    for (const t of squad) spawnEnemy(t);
  }

  /* 增援闸门随开局驻军规模伸缩：零号大坝这类大图开局 60+ 守军，
     若沿用固定 42 的上限，增援波（乃至叫增援）会被开局人数掐死。 */
  G.enemyCap = Math.max(42, G.enemies.length + 8);

  /* 全地图通用：固定驻军落位之后清一圈落地安全区（见 secureSpawnArea） */
  secureSpawnArea(780);

  $('lobby').classList.add('hidden');
  $('shop').classList.add('hidden');
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  document.body.classList.add('in-raid');

  lastT = 0;
  uiToast('进入封锁区', '');
  if (!P.weapon) uiToast('空手出击 · 只有匕首', 'warn');
  if (G.extMode === 'switch') {
    setTimeout(() => uiToast('本图无常规撤离点 · 拉下 2 处总闸开启紧急撤离', 'warn'), 1400);
    setTimeout(() => uiToast('总闸位置：核心控制区 / 发射工位 B · 南门可丢包撤离', 'small'), 2900);
    setTimeout(() => uiToast('安全总监已随守军进场 · 别被他看见', 'warn'), 4400);
  } else {
    setTimeout(() => uiToast('搜刮物资，找到撤离点', 'small'), 1400);
  }
}

function endRaid(success) {
  if (G.scene !== 'playing' && G.scene !== 'paused') return;
  BIGMAP.open = false;           // 结算/阵亡：战术地图跟着关掉

  G.scene = success ? 'extracted' : 'dead';
  document.body.classList.remove('in-raid');

  let rows = [];

  /* 成就结算：本局数据 + 累计统计（局内/累计两类都在这里判） */
  const applyAchievements = (success) => {
    const newly = checkAchievements({
      success,
      kills: G.kills | 0,
      relics: relicCount(),
      value: G.lootValue | 0,
      blinds: G.blinds | 0,
      swarmHits: G.swarmHits | 0,
      bleedHits: G.bleedHits | 0,
      silentKills: G.silentKills | 0,
      noArmor: !(P.armorLv > 0),
      tier: G.tier,
    });
    if (!newly.length) return;
    const bonus = newly.reduce((a, b) => a + b.reward, 0);
    rows.push(['成就解锁', newly.length + ' 项 · + ¥' + fmtMoney(bonus), 'pos']);
    for (const a of newly) rows.push(['　· ' + a.name, a.desc + ' · + ¥' + fmtMoney(a.reward), 'pos']);
  };

  if (success) {
    const bonus = 400;

    SAVE.credits += bonus;
    SAVE.stats.extracts++;
    SAVE.stats.loot += G.lootValue;
    SAVE.stats.kills += G.kills;
    /* 累计型成就的账本：撤离才计收集品 / 档位 / 裸奔；控场成败都计 */
    SAVE.stats.relics = (SAVE.stats.relics | 0) + relicCount();
    if (G.tier !== 'standard') SAVE.stats.secret = (SAVE.stats.secret | 0) + 1;
    if (G.tier === 'top') SAVE.stats.top = (SAVE.stats.top | 0) + 1;
    if (!(P.armorLv > 0)) SAVE.stats.noArmor = (SAVE.stats.noArmor | 0) + 1;
    const ctDone = updateContracts(true);

    // 收集品进仓库，一分钱没到手 —— 要自己回仓库卖
    const inN = relicCount();
    let inV = 0;
    for (const it of G.relics) {
      const r = RELICS[it.id];
      if (!r) continue;
      SAVE.stash[it.id] = (SAVE.stash[it.id] | 0) + it.n;
      markRelicSeen(it.id);
      inV += r.price * it.n;
    }

    // 缴获按实例入库：这局捡了几把枪 / 几件弹挂背包，仓库各 +n（带进来的本来就在仓库）
    for (const wid in P.gunLoot) {
      const n = P.gunLoot[wid] | 0;
      if (n > 0 && WEAPONS[wid]) SAVE.owned[wid] = Math.min(9, (SAVE.owned[wid] | 0) + n);
    }
    for (const key in P.gearLoot) {
      const n = P.gearLoot[key] | 0;
      if (n > 0 && GEAR[key]) SAVE.gearOwned[key] = Math.min(9, (SAVE.gearOwned[key] | 0) + n);
    }
    // 搜到并带到撤离点的枪，自动补进还空着的槽位
    for (const sl of ['primary', 'secondary']) {
      if (SAVE.loadout[sl] && SAVE.owned[SAVE.loadout[sl]]) continue;
      const cand = ['primary', 'secondary'].map(k => P.slots && P.slots[k]).filter(id => id && !PISTOL_IDS[id] && SAVE.owned[id]);
      const pickId = cand.find(id => id !== SAVE.loadout[sl === 'primary' ? 'secondary' : 'primary']);
      if (pickId) SAVE.loadout[sl] = pickId;
    }
    SAVE.equippedMelee = P.melee;
    if (P.melee) SAVE.ownedMelee[P.melee] = true;
    /* 身上这件护甲带着局内磨掉/修回的耐久原样回仓库档：撤离才算是你的。
       局内脱了甲（身上光着）：旧记录清掉 —— 那件甲在背包格子里一起带回，
       不清就是「身上一件 + 包里一件」双份。 */
    if (P.armorLv > 0) SAVE.wornPiece = { id: P.armorId, lv: P.armorLv, hp: Math.round(P.armorHp), max: Math.max(1, Math.round(P.armorMax)) };
    else SAVE.wornPiece = null;

    /* 随身容器原样带回：用剩的耐久 / 次数 / 发数都留在格子里，下次出击接着带。
       收集品 / 配件除外 —— 它们上面已经按格子派生的清单入了仓库，
       格子里要是再留一份，整备时往仓库一放就是第二份（双份入仓 bug）。 */
    const stripGranted = c => (c && (c.t === 'relic' || c.t === 'mod')) ? null : (c ? Object.assign({}, c) : null);
    SAVE.carry = {
      rig: P.rig.map(stripGranted),
      pocket: P.pocket.map(stripGranted),
      pack: P.pack.map(stripGranted),
    };
    sanitizeSpans(SAVE.carry.rig, zoneBlocks('rig'));
    sanitizeSpans(SAVE.carry.pocket, zoneBlocks('pocket'));
    sanitizeSpans(SAVE.carry.pack, zoneBlocks('pack'));
    SAVE.carePick = normCareKey(P.carePick);

    /* 武器磨损：带出去的枪每局都会磨 —— 大件从一次性消费变成持续保养水槽。
       阵亡局不算磨损：枪已经全丢了，再计磨损属于鞭尸。 */
    SAVE.gunWear = SAVE.gunWear || {};
    const wearAmt = GUN_WEAR.perRaid[G.tier] || GUN_WEAR.perRaid.standard;
    let wornN = 0;
    const wearGun = id => {
      if (!WEAPONS[id] || !(SAVE.owned[id] > 0)) return;
      if (gunWearOf(id) < 100) wornN++;
      gunWearAdd(id, wearAmt);
    };
    for (const sl of GUN_SLOTS) { const id = SAVE.loadout[sl]; if (id) wearGun(id); }
    for (const arr of allCarryZones()) for (const c of arr) if (c && c.t === 'gun') wearGun(c.id);

    // 搜到的配件入库（配件是格子物品，从随身格子里读），之后才能在改装台上装
    const modIds = foundModIds();
    const modN = modIds.length;
    for (const mid of modIds) {
      if (!MODS[mid]) continue;
      SAVE.modBag[mid] = Math.min(99, (SAVE.modBag[mid] | 0) + 1);
    }

    rows.push(['收集品入库', inN + ' 件 · 估值 ¥' + fmtMoney(inV), 'pos']);
    rows.push(['撤离奖励', '+ ¥' + fmtMoney(bonus), 'pos']);
    if (G.raidFee > 0) rows.push(['行动门票', '- ¥' + fmtMoney(G.raidFee) + ' · 出击时已支付', 'neu']);
    rows.push(['击杀 ' + G.kills + ' 名敌人', '+ ¥' + fmtMoney(G.score), 'neu']);
    rows.push(['配件带回', modN ? modN + ' 件 · 可上改装台' : '无', modN ? 'pos' : 'neu']);
    {
      const gunN = Object.values(P.gunLoot || {}).reduce((a, b) => a + (b | 0), 0);
      const gearN = Object.values(P.gearLoot || {}).reduce((a, b) => a + (b | 0), 0);
      const txt = (gunN ? gunN + ' 把枪' : '') + (gunN && gearN ? ' · ' : '') + (gearN ? gearN + ' 件弹挂 / 背包' : '');
      rows.push(['缴获入库', txt || '无', (gunN || gearN) ? 'pos' : 'neu']);
    }
    /* 局内捡到的护甲：以背包格子的形式原样带回，仓库 / 整备界面能直接穿 */
    let armorN = 0;
    for (const arr of allCarryZones()) for (const c of arr) if (c && c.t === 'armor') armorN++;
    rows.push(['护甲带回', armorN ? armorN + ' 件 · 在背包格子里' : '无', armorN ? 'pos' : 'neu']);
    rows.push(['装备状态', '全部保留', 'pos']);
    rows.push(['武器磨损', wornN ? '带出的枪每把 +' + wearAmt + ' 磨损 · 记得保养' : '没带长枪', wornN ? 'neu' : 'pos']);
    if (ctDone) rows.push(['委托完成', ctDone + ' 项 · 回大厅「委托」领取', 'pos']);

    Sfx.extract();
    applyAchievements(true);
    showResult(true, '撤离成功', 'EXTRACTION', rows,
      '剩余资金 ¥' + fmtMoney(SAVE.credits),
      inN ? '回到大厅打开仓库，把 ' + inN + ' 件收集品卖掉换钱' : '');
  } else {
    SAVE.stats.deaths++;
    SAVE.stats.kills += G.kills;
    /* 控场类累计账本：阵亡也照记 —— 打过就算数 */
    SAVE.stats.blinds = (SAVE.stats.blinds | 0) + (G.blinds | 0);
    SAVE.stats.swarm = (SAVE.stats.swarm | 0) + (G.swarmHits | 0);
    SAVE.stats.bleed = (SAVE.stats.bleed | 0) + (G.bleedHits | 0);
    SAVE.stats.silent = (SAVE.stats.silent | 0) + (G.silentKills | 0);
    /* 阵亡抚恤：给败局发小额补偿压挫败感 —— 量级只够补几盒白弹（击杀越多越体面），
       不会变成躺平收入；顺手把「连败弃坑」的压力泄掉一点。 */
    const dole = Math.min(600, 150 + (G.kills | 0) * 15);
    SAVE.credits += dole;
    const ctDone = updateContracts(false);

    const lostNames = [];
    let lostModN = 0;
    const loseGun = id => {
      if (!WEAPONS[id]) return;
      lostNames.push(WEAPONS[id].short);
      SAVE.owned[id] = (SAVE.owned[id] | 0) - 1;
      if ((SAVE.owned[id] | 0) <= 0) {
        delete SAVE.owned[id];
        lostModN += gunModCount(id);
        delete SAVE.mods[id];        // 最后一把才连配件一起没（同款还有就改装还在）
      }
    };
    for (const sl of GUN_SLOTS) {
      const id = SAVE.loadout[sl];
      if (!id || (SAVE.owned[id] | 0) <= 0) continue;
      loseGun(id);
      SAVE.loadout[sl] = null;
    }
    /* 背在包里的枪也算「身上带着的」—— 一起丢。
       （以前只清武器槽，塞包里的枪会跟着 SAVE.owned 留在仓库里，等于白嫖一趟） */
    for (const arr of allCarryZones()) {
      for (const c of arr) {
        if (!c || c.t !== 'gun' || (SAVE.owned[c.id] | 0) <= 0) continue;
        loseGun(c.id);
      }
    }
    const lostWeapon = lostNames.length ? lostNames.join(' · ') : null;
    const lostArmor = SAVE.wornPiece ? (ARMORS[SAVE.wornPiece.id] || ARMORS[0]).name : null;
    const lostHelmet = SAVE.wornHelmet ? helmetOf(SAVE.wornHelmet).name : null;

    /* 身上穿的弹挂 / 背包也一起丢：除了近战武器，身上带的一件不留 */
    const lostGear = [];
    for (const kind of ['rig', 'pack']) {
      const key = SAVE.worn && SAVE.worn[kind];
      if (!key || !GEAR[key]) continue;
      lostGear.push(GEAR[key].name);
      SAVE.gearOwned[key] = (SAVE.gearOwned[key] | 0) - 1;
      if ((SAVE.gearOwned[key] | 0) <= 0) delete SAVE.gearOwned[key];   // 多实例：死一次只丢身上这件
    }
    SAVE.worn = { rig: null, pack: null };
    const lostN = relicCount();
    const foundN = foundModIds().length;

    SAVE.wornPiece = null;  // 身上穿的这件护甲没了 —— 仓库里囤的还在
    /* 头上这顶也一起丢：件数减一（穿着那顶一直算在件数里，和多实例弹挂同一套账） */
    if (!SAVE.helmetOwned) SAVE.helmetOwned = {};
    if (SAVE.wornHelmet) {
      const hid = SAVE.wornHelmet;
      SAVE.helmetOwned[hid] = (SAVE.helmetOwned[hid] | 0) - 1;
      if ((SAVE.helmetOwned[hid] | 0) <= 0) delete SAVE.helmetOwned[hid];
    }
    SAVE.wornHelmet = null;
    /* 身上带的东西全丢：弹挂、口袋、背包清空（当初装格时就从仓库扣掉了，
       现在格子里剩多少就丢多少 —— 这就是"撤离才算是你的"的代价） */
    const lostCarry = carryCellTotal();
    const lostReserve = (function () {
      let n = 0;
      for (const arr of allCarryZones()) for (const c of arr) if (c && c.t === 'ammo') n += c.n | 0;
      return n;
    })();
    /* 包里存着的弹挂 / 背包也随这次行动一起丢：件数跟着扣 */
    for (const arr of allCarryZones()) {
      for (const c of arr) {
        if (!c || c.cont || c.t !== 'gear' || !GEAR[c.key]) continue;
        SAVE.gearOwned[c.key] = (SAVE.gearOwned[c.key] | 0) - 1;
        if ((SAVE.gearOwned[c.key] | 0) <= 0) delete SAVE.gearOwned[c.key];
        lostGear.push(GEAR[c.key].name);
      }
    }
    SAVE.carry = emptyCarry();

    rows.push(['丢失收集品', lostN + ' 件 · 价值 ¥' + fmtMoney(G.lootValue), 'neg']);
    rows.push(['损失武器', lostWeapon ? lostWeapon : '无', lostWeapon ? 'neg' : 'neu']);
    rows.push(['损失配件', (lostModN + foundN) ? (lostModN + foundN) + ' 件（随枪）' : '无', (lostModN + foundN) ? 'neg' : 'neu']);
    rows.push(['损失装备', lostGear.length ? lostGear.join(' · ') : '无', lostGear.length ? 'neg' : 'neu']);
    rows.push(['近战武器', '随身带走 · 唯一保底', 'neu']);
    rows.push(['损失护甲', lostArmor ? lostArmor : '无', lostArmor ? 'neg' : 'neu']);
    rows.push(['损失头盔', lostHelmet ? lostHelmet : '无', lostHelmet ? 'neg' : 'neu']);
    rows.push(['损失随身物资', '格子 ×' + lostCarry + (lostReserve ? ' · 备弹 ' + lostReserve + ' 发' : ''), lostCarry ? 'neg' : 'neu']);
    rows.push(['阵亡抚恤', '+ ¥' + fmtMoney(dole) + ' · 击杀 ' + (G.kills | 0) + ' 人', 'pos']);
    if (G.raidFee > 0) rows.push(['行动门票', '- ¥' + fmtMoney(G.raidFee) + ' · 阵亡不退', 'neg']);
    if (ctDone) rows.push(['委托完成', ctDone + ' 项 · 回大厅「委托」领取', 'pos']);

    Sfx.death();
    applyAchievements(false);
    showResult(false, '行 动 失 败', 'KILLED IN ACTION', rows, '剩余资金 ¥' + fmtMoney(SAVE.credits));
  }

  G.relics = [];
  G.foundMods = [];
  G.lootValue = 0;
  saveGame();
  refreshStashBadge();
  lastT = 0;
}

let resultTimer = null;

function showResult(ok, title, badge, rows, foot, hint) {
  clearTimeout(resultTimer);
  $('resBadge').textContent = badge;
  $('resBadge').className = 'badge ' + (ok ? 'ok' : 'bad');
  $('resTitle').textContent = title;
  $('resTitle').className = ok ? 'ok' : 'bad';

  let html = '';
  for (const r of rows) {
    html += '<div class="rrow"><span>' + r[0] + '</span><b class="' + r[2] + '">' + r[1] + '</b></div>';
  }
  html += '<div class="rrow total"><span>' + (ok ? '账户余额' : '账户余额') + '</span><b class="' + (ok ? 'pos' : 'neu') + '">' + foot.replace('剩余资金 ', '') + '</b></div>';
  if (hint) {
    html += '<div style="margin-top:4px;font-size:11px;color:#8a6a3a;letter-spacing:.08em;text-align:center;line-height:1.6">' + hint + '</div>';
  }
  $('resReceipt').innerHTML = html;

  resultTimer = setTimeout(() => $('result').classList.remove('hidden'), ok ? 900 : 1100);
}

/* 暂停面板里的本局成就：按完成度排序，最多列 8 条（已达成优先沉底保证可见），
     达成变绿标「达成」，未达成显示进度条。成就名是内部数据，但仍走 esc() 保持纪律。 */
function pauseAchHtml() {
  const rows = achLiveRows();
  if (!rows.length) return '<div style="font-size:11px;color:#4d7a94;letter-spacing:.15em">本局成就 · 无进行中条目</div>';
  const done = rows.filter(r => r.r >= 1).length;
  const show = rows.slice(0, 8);
  let h = '<div style="font-size:11px;font-weight:700;color:#4d7a94;letter-spacing:.15em;margin-bottom:5px">'
        + '本局成就 <span style="color:#3f5d72;font-weight:400">（' + done + ' / ' + rows.length + ' 达成）</span></div>';
  for (const r of show) {
    const ok = r.r >= 1;
    const col = ok ? '#8df0b6' : '#bcd9ea';
    h += '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:' + col + ';margin-top:4px">'
       + '<span>' + esc(r.a.name) + '</span>'
       + '<b style="color:' + (ok ? '#8df0b6' : '#6f9ab2') + ';white-space:nowrap">' + (ok ? '达成' : r.v + ' / ' + r.n) + '</b></div>'
       + '<div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:2px;overflow:hidden">'
       + '<div style="height:3px;width:' + Math.round(clamp(r.r, 0, 1) * 100) + '%;background:'
       + (ok ? 'rgba(116,163,92,0.85)' : 'rgba(184,162,107,0.62)') + ';border-radius:2px"></div></div>';
  }
  if (rows.length > show.length) {
    h += '<div style="font-size:10px;color:#3f5d72;margin-top:6px;letter-spacing:.08em">其余 ' + (rows.length - show.length)
       + ' 条未列出 · 结算时统一发放奖金</div>';
  }
  return h;
}

function pauseRaid() {
  if (G.scene !== 'playing') return;
  G.scene = 'paused';
  mouse.down = false;
  const mm = String(Math.floor(G.raidTime / 60)).padStart(2, '0');
  const ss = String(Math.floor(G.raidTime % 60)).padStart(2, '0');
  $('pauseTime').textContent = mm + ':' + ss;
  $('pauseLoot').textContent = relicCount() + ' 件 · ¥' + fmtMoney(G.lootValue);
  $('pauseAch').innerHTML = pauseAchHtml();
  $('pause').classList.remove('hidden');
}

function resumeRaid() {
  if (G.scene !== 'paused') return;
  G.scene = 'playing';
  lastT = 0;
  $('pause').classList.add('hidden');
  Sfx.resume();
}

function backToLobby() {
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  G.scene = 'lobby';
  document.body.classList.remove('in-raid');
  refreshLobby();
  // 重置一个静态世界作为背景
  prepareWorldForRaid();
  resetPlayer();
}

/* ══════════════════════════════════════════════════════════
   19. 事件绑定
   ══════════════════════════════════════════════════════════ */
$('deployBtn').addEventListener('click', startRaid);
$('opBtn').addEventListener('click', openOperators);
$('shopBtn').addEventListener('click', () => openShop('weapon'));
$('closeShop').addEventListener('click', closeShop);
$('loadoutBtn').addEventListener('click', openLoadout);
$('closeLoadout').addEventListener('click', closeLoadout);
$('loAutoBtn').addEventListener('click', autoRestock);
$('loClearBtn').addEventListener('click', clearCarryAll);
$('closePack').addEventListener('click', closePackPanel);
$('closeLoot').addEventListener('click', closeLootPanel);
$('loadout').addEventListener('mousemove', e => {
  if (LO_UI.held) loMoveChip(e.clientX, e.clientY);
});
$('closeOps').addEventListener('click', closeOperators);
$('stashBtn').addEventListener('click', openStash);
$('achBtn').addEventListener('click', openAchievements);
$('closeAch').addEventListener('click', closeAchievements);
$('ctBtn').addEventListener('click', openContracts);
$('closeContracts').addEventListener('click', closeContracts);
$('ctClaimAll').addEventListener('click', claimAllContracts);
$('ctReroll').addEventListener('click', rerollContracts);
$('codexBtn').addEventListener('click', openCodex);
$('closeCodex').addEventListener('click', closeCodex);
initSettingsUI();
applyGfx();
$('gunsmithBtn').addEventListener('click', () => openGunsmith());
$('closeGunsmith').addEventListener('click', closeGunsmith);
$('gsStripBtn').addEventListener('click', () => stripAllMods(gsPick.weapon));
$('closeStash').addEventListener('click', closeStash);
$('sellAllBtn').addEventListener('click', sellAllRelics);
$('mapBtn').addEventListener('click', openMaps);
$('mapselMore').addEventListener('click', openMaps);
$('closeMaps').addEventListener('click', closeMaps);
$('importMapBtn').addEventListener('click', () => $('mapFile').click());
$('mapFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) readMapFile(f);
  e.target.value = '';
});
$('exportMapBtn').addEventListener('click', () => {
  const m = exportMapFile();
  mapMessage('已导出「' + m.name + '.json」，可以在编辑器里继续修改', 'ok');
});
$('openEditorBtn').addEventListener('click', () => {
  const win = window.open('editor.html', '_blank');
  if (!win) mapMessage('浏览器拦截了弹窗：请直接双击同目录下的 editor.html', 'warn');
  else mapMessage('编辑器已在新标签页打开，改完导出 JSON 再拖回这里', 'ok');
});
$('clearMapBtn').addEventListener('click', () => {
  const first = Object.keys(BUILTIN_MAPS)[0];
  if (first && loadBuiltinMap(first)) return;
  mapMessage('没有可用的内置地图', 'warn');
});

/* 地图预设按钮按 BUILTIN_MAPS 自动生成：以后加地图只要往表里加一条 */
function fillMapPresets() {
  const box = $('mapPresets');
  if (!box) return;
  box.innerHTML = '';
  const ids = Object.keys(BUILTIN_MAPS);
  for (const id of ids) {
    const m = BUILTIN_MAPS[id];
    const meta = BUILTIN_MAP_META[id];
    const place = meta && meta.sub ? meta.sub.split('·')[0].trim() : (m.w + '×' + m.h);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost small';
    b.dataset.builtin = id;
    b.textContent = (meta ? meta.name : m.name) + ' · ' + place;
    b.addEventListener('click', () => loadBuiltinMap(id));
    box.appendChild(b);
  }
  if (!ids.length) {
    const p = document.createElement('div');
    p.className = 'mapsel-note';
    p.textContent = '暂无内置地图';
    box.appendChild(p);
  }
}

(function bindMapDrop() {
  const el = $('maps');
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dragging'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragging'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('dragging');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readMapFile(f);
  });
})();
$('resBtn').addEventListener('click', backToLobby);
$('resumeBtn').addEventListener('click', resumeRaid);
$('abandonBtn').addEventListener('click', () => {
  $('pause').classList.add('hidden');
  G.scene = 'playing';
  endRaid(false);
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('确定要重置存档吗？所有资金与装备将清空。')) return;
  SAVE = DEFAULT_SAVE();
  saveGame();
  refreshLobby();
  uiToast('存档已重置', 'small');
});

document.querySelectorAll('#shopTabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    shopTab = btn.dataset.tab;
    shopSub = 'all';                               // 换类目：子分类重置为全部
    refreshShop();
  });
});

document.querySelectorAll('#stashTabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    stashTab = btn.dataset.tab;
    syncStashTabs();
    refreshStash();
  });
});

/* ══════════════════════════════════════════════════════════
   20. 启动
   ══════════════════════════════════════════════════════════ */
G.customMap = loadStoredMap();
// 没存过地图就默认部署第一张内置地图（不再走程序随机生成）
if (!G.customMap) {
  const firstId = Object.keys(BUILTIN_MAPS)[0];
  if (firstId) loadBuiltinMap(firstId, true);
}
prepareWorldForRaid();
resetPlayer();
  G.cam.x = clamp(P.x - VW / ZOOM / 2, 0, Math.max(0, WORLD.w - VW / ZOOM));
  G.cam.y = clamp(P.y - VH / ZOOM / 2, 0, Math.max(0, WORLD.h - VH / ZOOM));
fillMapPresets();
refreshLobby();
requestAnimationFrame(loop);
