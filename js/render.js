"use strict";

/* js/render.js —— 渲染、HUD、主循环 loop()、战争迷雾（依赖 game.js 的状态与实体）。 */

/* ══════════════════════════════════════════════════════════
   14. 渲染
   ══════════════════════════════════════════════════════════ */
function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFloor() {
  /* 外层（render）已经把坐标系平移到相机原点，这里只负责画。
     以前这里又 translate 了一次 -cam，等于双重偏移 —— 网格、边框、血迹全被推出屏幕。 */
  const camX = G.cam.x, camY = G.cam.y;
  const vw = VW / ZOOM, vh = VH / ZOOM;
  const grid = 70;
  const startX = Math.floor(camX / grid) * grid;
  const startY = Math.floor(camY / grid) * grid;

  ctx.save();

  ctx.strokeStyle = 'rgba(45, 72, 100, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x < camX + vw + grid; x += grid) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + vh); }
  for (let y = startY; y < camY + vh + grid; y += grid) { ctx.moveTo(camX, y); ctx.lineTo(camX + vw, y); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(58, 100, 138, 0.5)';
  ctx.beginPath();
  const big = grid * 5;
  for (let x = Math.floor(camX / big) * big; x < camX + vw + big; x += big) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + vh); }
  for (let y = Math.floor(camY / big) * big; y < camY + vh + big; y += big) { ctx.moveTo(camX, y); ctx.lineTo(camX + vw, y); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(60, 110, 150, 0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, WORLD.w, WORLD.h);

  for (const d of G.decals) {
    if (d.x < camX - 80 || d.x > camX + vw + 80 || d.y < camY - 80 || d.y > camY + vh + 80) continue;
    ctx.globalAlpha = d.a;
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawExtracts() {
  const t = G.time;
  for (const ex of G.extracts) {
    const isEmg = ex.mode === 'emergency', isNaked = ex.mode === 'naked', isPaid = ex.mode === 'paid';
    const locked = isEmg && !G.emergencyOpen;
    const poor = isPaid && (SAVE.credits | 0) < (ex.cost | 0);
    const active = G.inExtract === ex;
    const pulse = 0.5 + Math.sin(t * 2 + ex.phase) * 0.5;
    /* 紧急未激活=灰蓝 · 丢包=琥珀 · 付费=金（钱不够=暗金）· 常规/已激活=绿 */
    const col = locked ? '#5a7a9a' : (isNaked ? '#ffb347' : (isPaid ? (poor ? '#8a7a4a' : '#ffcc4d') : (active ? '#5effb0' : '#46e08a')));
    const rgb = locked ? '90,122,154' : isNaked ? '255,179,71' : isPaid ? '255,204,77' : '70,224,138';

    ctx.save();
    ctx.translate(ex.x, ex.y);

    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, ex.r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + (active ? 0.30 : 0.16) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, ex.r, 0, TAU); ctx.fill();

    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, ex.r, 0, TAU); ctx.stroke();

    ctx.globalAlpha = 0.7;
    ctx.setLineDash([16, 14]);
    ctx.lineDashOffset = (locked ? t * 10 : -t * 34);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, ex.r - 16, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    if (!locked) {
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.strokeStyle = isNaked ? '#ffe0b0' : '#9effcc';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.stroke();
    }

    // 中心图标：绿菱=撤离 · 锁形=未激活 · 背包叉=丢包
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    if (locked) {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.strokeRect(-11, -6, 22, 17);
      ctx.beginPath(); ctx.arc(0, -6, 7, Math.PI, 0); ctx.stroke();
    } else if (isNaked) {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.strokeRect(-11, -13, 22, 26);
      ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(11, -5); ctx.stroke();
    } else if (isPaid) {
      ctx.font = '800 15px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('¥', 0, 6);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(13, 0); ctx.lineTo(0, 15); ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = locked ? '#a8c0d8' : (isNaked ? '#ffe0b0' : '#bfffe0');
    ctx.font = '700 12px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(locked ? '紧急撤离 ' + ex.name + ' · 未激活'
                : isNaked ? '丢包撤离 ' + ex.name
                : isPaid ? '付费撤离 ' + ex.name + ' · ¥' + fmtMoney(ex.cost | 0)
                : (isEmg ? '紧急撤离 ' + ex.name : '撤离点 ' + ex.name), 0, ex.r + 26);
    ctx.globalAlpha = 0.5;
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.fillText(locked ? '拉下全部总闸后开启'
                : isNaked ? '需无背包 · 按 E 丢弃背包'
                : isPaid ? (poor ? '资金不足 · 需要 ¥' + fmtMoney(ex.cost | 0) : '停留 3 秒 · 撤离时扣款')
                : '停留 ' + ((ex.hold || G.extractHold)) + ' 秒', 0, ex.r + 44);

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/* 总闸：红色配电柜 + 拉杆。拉下后绿灯亮起 */
function drawSwitches() {
  if (G.extMode !== 'switch') return;
  const t = G.time;
  for (const sw of G.switches) {
    ctx.save();
    ctx.translate(sw.x, sw.y);
    /* 底座提示圈 */
    const pulse = 0.5 + Math.sin(t * 3 + sw.phase) * 0.5;
    ctx.strokeStyle = sw.pulled ? 'rgba(70,224,138,0.5)' : 'rgba(255,80,80,' + (0.3 + pulse * 0.4) + ')';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    /* 柜体 */
    ctx.fillStyle = '#1c2a3e';
    ctx.strokeStyle = sw.pulled ? '#46e08a' : '#ff5c5c';
    ctx.lineWidth = 2;
    ctx.fillRect(-20, -26, 40, 52);
    ctx.strokeRect(-20, -26, 40, 52);
    /* 指示灯 */
    ctx.fillStyle = sw.pulled ? '#46e08a' : (Math.sin(t * 8) > 0 ? '#ff5c5c' : '#7a2020');
    ctx.beginPath(); ctx.arc(0, -14, 5, 0, TAU); ctx.fill();
    /* 拉杆 */
    ctx.strokeStyle = sw.pulled ? '#9effcc' : '#ffd66b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(sw.pulled ? 10 : -10, -2);
    ctx.stroke();
    /* 标签 */
    ctx.fillStyle = sw.pulled ? '#9effcc' : '#ffb0b0';
    ctx.font = '700 11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sw.pulled ? '总闸 · 已拉下' : '总闸 · 按 E 拉闸', 0, 44);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

/* 容器外形：六种各不相同，远远看一眼就知道值不值得绕路。
   翻过的箱子壳体转灰 —— 但里面还有东西时会亮一圈琥珀边，跟「搜空了」区分开。 */
function drawContainerBody(c, C, isTarget) {
  const spent = c.opened && !crateLeft(c);       // 翻过、而且拿干净了
  const body = c.opened ? '#141c24' : C.body;
  const line = spent
    ? 'rgba(90,110,130,0.5)'
    : (c.opened ? 'rgba(255,190,120,' + (isTarget ? '0.95)' : '0.72)') : C.dim + (isTarget ? '1)' : '0.78)'));
  const inner = spent
    ? 'rgba(80,100,120,0.32)'
    : (c.opened ? 'rgba(180,140,90,0.45)' : C.dim + '0.40)');
  const lw = isTarget ? 2 : 1.5;

  const frame = (w, h, r) => {
    drawRoundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke();
  };

  switch (C.id) {
    case 'ammo': {
      frame(28, 22, 2);
      ctx.strokeStyle = inner; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(14, -3); ctx.stroke();
      ctx.fillStyle = inner;                                   // 两枚立着的弹
      for (const bx of [-7, 2]) { drawRoundRect(bx, 1, 4, 8, 2); ctx.fill(); }
      break;
    }
    case 'med': {
      frame(28, 24, 2);
      ctx.fillStyle = inner;                                  // 十字
      drawRoundRect(-8, -2, 16, 4, 1); ctx.fill();
      drawRoundRect(-2, -8, 4, 16, 1); ctx.fill();
      break;
    }
    case 'tool': {
      frame(30, 22, 2);
      ctx.strokeStyle = inner; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -10, 6, Math.PI, 0); ctx.stroke();   // 提手
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-15, -1); ctx.lineTo(15, -1); ctx.stroke();
      ctx.fillStyle = inner;
      drawRoundRect(-1.5, -5, 3, 8, 1); ctx.fill();
      break;
    }
    case 'weapon': {
      frame(48, 18, 2);
      ctx.strokeStyle = inner; ctx.lineWidth = 1;
      ctx.beginPath();                                          // 两个卡扣
      ctx.moveTo(-11, -9); ctx.lineTo(-11, 9);
      ctx.moveTo(11, -9); ctx.lineTo(11, 9);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.stroke();
      break;
    }
    case 'safe': {
      frame(26, 28, 2);
      ctx.strokeStyle = inner; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(3, 1, 6.5, 0, TAU); ctx.stroke();      // 转盘
      ctx.beginPath(); ctx.moveTo(3, 1); ctx.lineTo(3, -3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-9, 10); ctx.stroke();  // 门轴
      break;
    }
    default: {                                                  // 补给箱
      frame(32, 26, 3);
      ctx.strokeStyle = inner; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-16, -4); ctx.lineTo(16, -4);
      ctx.moveTo(0, -13); ctx.lineTo(0, 13);
      ctx.stroke();
    }
  }
}

function drawCrates() {
  const t = G.time;
  for (const c of G.crates) {
    const C = containerOf(c.kind);
    const bob = Math.sin(t * 2.2 + c.phase) * 1.8;
    const isTarget = G.searchTarget === c;
    const spent = c.opened && !crateLeft(c);

    ctx.save();
    ctx.translate(c.x, c.y + bob);

    if (!spent) {
      const pulse = 0.55 + Math.sin(t * 3 + c.phase) * 0.45;
      /* 没翻过的用容器本色；翻过还剩东西的一律转琥珀色，和角标对上 */
      const gc = c.opened ? 'rgba(255,190,120,' : C.dim;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
      g.addColorStop(0, gc + (0.24 * pulse).toFixed(3) + ')');
      g.addColorStop(1, gc + '0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();
    }

    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    drawContainerBody(c, C, isTarget);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    /* 翻过但没拿干净：右上角挂一个琥珀色小角标，写还剩几件 —— 
       一眼就能看出「这箱还能回去翻」，不用凭记忆 */
    if (c.opened && !spent) {
      const left = crateLeft(c);
      const pulse = 0.55 + Math.sin(t * 3.4 + c.phase) * 0.45;
      ctx.save();
      ctx.translate(C.r * 0.62, -C.r * 0.62);
      ctx.fillStyle = 'rgba(10,16,22,0.9)';
      ctx.strokeStyle = 'rgba(255,190,120,' + (0.5 + pulse * 0.5).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffce8a';
      ctx.font = '800 9px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.min(left, 9)), 0, 3.2);
      ctx.restore();
    }

    if (isTarget) {
      // 不再画长按进度环，只做一圈呼吸光提示「按 F 就能开」
      const pulse = 0.5 + Math.sin(t * 4.6) * 0.5;
      const tc = c.opened ? 'rgba(255,190,120,' : C.dim;
      ctx.strokeStyle = tc + (0.28 + pulse * 0.55).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, C.r + 6 + pulse * 3, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = tc + (0.10 + pulse * 0.12).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, C.r + 5, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

/* 地区标注：地面虚线框 + 半透明地区名（画在建筑与人物之下） */
function drawRegions() {
  if (!G.regions || !G.regions.length) return;
  const camX = G.cam.x, camY = G.cam.y;
  const vw = VW / ZOOM, vh = VH / ZOOM;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of G.regions) {
    if (r.x + r.w < camX - 80 || r.x > camX + vw + 80 || r.y + r.h < camY - 80 || r.y > camY + vh + 80) continue;
    ctx.strokeStyle = 'rgba(67, 217, 245, 0.14)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    const fs = Math.max(26, Math.min(46, r.w / Math.max(2, r.name.length) * 0.92));
    ctx.font = '800 ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(124, 192, 232, 0.22)';
    /* 名字画在区块上部内侧：下部通常是建筑密集区，容易被盖住 */
    ctx.fillText(r.name, r.x + r.w / 2, r.y + Math.max(46, r.h * 0.16));
  }
  ctx.restore();
}

/* 当前地区横幅：进入新地区时屏幕上方淡入淡出 */
function updateRegionBanner(dt) {
  if (!G.regions || !G.regions.length) { G.curRegion = ''; G.regionBanner = 0; return; }
  let name = '';
  for (const r of G.regions) {
    if (P.x >= r.x && P.x <= r.x + r.w && P.y >= r.y && P.y <= r.y + r.h) { name = r.name; break; }
  }
  if (name && name !== G.curRegion) {
    G.curRegion = name;
    G.regionBanner = 2.6;
  } else if (!name) {
    G.curRegion = '';
  }
  if (G.regionBanner > 0) G.regionBanner = Math.max(0, G.regionBanner - dt);
}

function drawRegionBanner() {
  if (!(G.regionBanner > 0) || !P.alive) return;
  const a = Math.min(1, G.regionBanner / 0.6);
  const x = VW / 2, y = Math.max(74, VH * 0.10);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = '800 26px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(214, 238, 250, 0.92)';
  ctx.shadowColor = 'rgba(67, 217, 245, 0.55)';
  ctx.shadowBlur = 14;
  ctx.fillText(G.curRegion, x, y);
  ctx.shadowBlur = 0;
  ctx.font = '600 10px ui-monospace, Consolas, monospace';
  ctx.fillStyle = 'rgba(120, 166, 196, 0.8)';
  ctx.fillText('— 进 入 地 区 —', x, y + 20);
  ctx.restore();
}

function drawObstacles() {  const camX = G.cam.x, camY = G.cam.y;
  const vw = VW / ZOOM, vh = VH / ZOOM;
  for (const o of G.obstacles) {
    if (o.x + o.w < camX - 40 || o.x > camX + vw + 40) continue;
    if (o.y + o.h < camY - 40 || o.y > camY + vh + 40) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    drawRoundRect(o.x + 8, o.y + 12, o.w, o.h, 4);
    ctx.fill();

    const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
    if (o.cover) { g.addColorStop(0, '#6a5138'); g.addColorStop(1, '#3d2f22'); }
    else if (o.tone > 0.5) { g.addColorStop(0, '#33475e'); g.addColorStop(1, '#1f2d3d'); }
    else { g.addColorStop(0, '#2b3c50'); g.addColorStop(1, '#1a2634'); }
    ctx.fillStyle = g;
    drawRoundRect(o.x, o.y, o.w, o.h, 4);
    ctx.fill();

    ctx.strokeStyle = o.cover ? 'rgba(255, 190, 120, 0.75)' : 'rgba(120, 180, 225, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    drawRoundRect(o.x, o.y, o.w, o.h, 4);
    ctx.clip();
    ctx.strokeStyle = 'rgba(110, 165, 210, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sx = o.x - o.h; sx < o.x + o.w + o.h; sx += 18) {
      ctx.moveTo(sx, o.y + o.h);
      ctx.lineTo(sx + o.h, o.y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(67, 217, 245, 0.35)';
    ctx.fillRect(o.x + 4, o.y + 4, Math.min(16, o.w - 8), 2);
  }
}

function drawPickups() {
  const t = G.time;
  for (const p of G.pickups) {
    const bob = Math.sin(t * 3 + p.bob) * 3;
    const pulse = 0.6 + Math.sin(t * 5 + p.bob) * 0.4;
    let col, icon;
    if (p.kind === 'medkit') { col = '#46e08a'; icon = '+'; }
    else if (p.kind === 'ammo') { col = '#8ef2ff'; icon = '▮'; }
    else if (p.kind === 'cell' && p.cell) { col = cellColor(p.cell); icon = cellIcon(p.cell); }
    else if (p.kind === 'relic' && p.relicId && RELICS[p.relicId]) {
      col = QUALITY[RELICS[p.relicId].q].color; icon = RELICS[p.relicId].icon;
    } else { col = '#ffd08a'; icon = '¥'; }

    const alpha = p.life < 4 ? (Math.sin(t * 14) * 0.4 + 0.6) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y + bob);

    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    gr.addColorStop(0, col + 'aa');
    gr.addColorStop(1, col + '00');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();

    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = alpha * pulse;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8,14,20,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 1);
    ctx.restore();
  }

  // 拾取范围内最近的一件：头顶挂一个 [F] 提示（不再自动拾取，F 才捡）
  const np = nearestPickup(120);
  if (np) {
    const bob = Math.sin(t * 3 + np.bob) * 3;
    const pulse = 0.62 + Math.sin(t * 6) * 0.38;
    let pile = 0;
    for (const p of G.pickups) if (p.cool <= 0 && dist(P.x, P.y, p.x, p.y) <= 120) pile++;
    let tip = '[F]';
    if (np.cell && np.cell.t === 'gear') tip = '[F] 拾取 · [H] 搜索';
    else if (pile >= 2) tip = '[F] 拾取 · [H] 搜索';
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '800 11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(tip, np.x, np.y + bob - 26);
    ctx.strokeStyle = 'rgba(255,233,176,' + (pulse * 0.5).toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(np.x, np.y + bob, 17, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* 每种枪的剪影都不一样：枪管长度、弹鼓/弹匣、瞄具、脚架 */
function drawPlayerGun(W, rec) {
  const cat = W.cat;
  const V = W.vis || {};                                       // 每把枪的外观特征：弹匣形制/无托/自带消音/木质件
  const len = V.len || (cat === 'sniper' ? 36 : cat === 'dmr' ? 30 : cat === 'rifle' ? 26
    : cat === 'lmg' ? 30 : cat === 'shotgun' ? 26 : cat === 'smg' ? 19 : 13);
  const gx = P.r * 0.5 + rec;
  const hw = cat === 'shotgun' ? 4 : cat === 'lmg' ? 4.2 : 3.4;
  const magKind = V.mag || (cat === 'smg' ? 'helix' : cat === 'lmg' ? 'box' : 'curved');

  ctx.fillStyle = '#48657b';                                   // 机匣
  ctx.fillRect(gx - 3, -hw - 2.4, 12, hw * 2 + 4.8);
  ctx.fillStyle = '#5c7d95';                                   // 枪管
  ctx.fillRect(gx, -hw, len - 6, hw * 2);
  ctx.fillStyle = '#1a2733';                                   // 枪口
  ctx.fillRect(gx + len - 7, -hw + 0.5, 8, hw * 2 - 1);
  if (V.wood) {                                                // 木质护木：经典枪一眼认出
    ctx.fillStyle = '#5d4426';
    ctx.fillRect(gx + 3, -hw - 1.4, Math.min(14, len - 12), hw * 2 + 2.8);
  }

  /* 枪体骨架：不同家族的机匣形状（不是配件） */
  const isLong = cat === 'rifle' || cat === 'dmr' || cat === 'sniper' || cat === 'lmg';
  const frame = isLong && !V.bullpup ? (V.frame || (cat === 'lmg' ? 'lmg' : 'ar')) : null;
  if (frame === 'ak') {                                        // AK：机匣盖后段上斜 + 导气管
    ctx.fillStyle = '#48657b';
    ctx.beginPath();
    ctx.moveTo(gx + 4, -hw - 2.4); ctx.lineTo(gx + 9, -hw - 0.6);
    ctx.lineTo(gx + 9, -hw + 1.6); ctx.lineTo(gx + 4, -hw + 1.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5c7d95';
    ctx.fillRect(gx - 1, -hw - 3.4, 10, 1.8);
  } else if (frame === 'lmg') {                                // 机枪：加厚机匣 + 供弹盖缝 + 供弹盘
    ctx.fillStyle = '#48657b';
    ctx.fillRect(gx - 3, -hw - 3.8, 13, hw * 2 + 7.6);
    ctx.fillStyle = '#1a2733';
    ctx.fillRect(gx - 2, -hw - 0.2, 11, 1.8);
    ctx.fillStyle = '#2b3c4a';
    ctx.fillRect(gx + 4, hw + 0.5, 8, 4);
  } else if (frame === 'sporter' && !V.wood) {                 // 复合材运动枪体（M700）：机匣加厚
    ctx.fillStyle = '#3e5871';
    ctx.fillRect(gx - 3, -hw - 3.2, 12, hw * 2 + 6.4);
  }

  if (cat === 'pistol') {
    ctx.fillStyle = '#6d8fa6';
    ctx.fillRect(gx - 1, -hw - 1.5, 9, 2);                     // 套筒
    ctx.fillStyle = '#2b3c4a';
    ctx.fillRect(gx + 1, hw - 1, 5, 9);                        // 握把
  } else if (cat === 'smg') {
    if (magKind === 'helix' || magKind === 'drum') {           // 螺旋弹鼓（野牛）/ 圆弹鼓（汤姆逊）
      const r = magKind === 'drum' ? 7.6 : 6.5;
      ctx.fillStyle = '#2b3c4a';
      ctx.beginPath(); ctx.arc(gx + 5, hw + 6, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(142,242,255,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(gx + 5, hw + 6, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx + 5, hw + 6, 2.4, 0, TAU); ctx.stroke();
    } else {                                                   // 直弹匣（MP7 / Vector / MK4）
      ctx.fillStyle = '#2b3c4a';
      ctx.fillRect(gx + 3, hw - 0.5, magKind === 'stick' ? 3.4 : 5, 9);
    }
    ctx.fillStyle = '#40607a';
    ctx.fillRect(gx - 10, -hw - 2.8, 10, 4);                   // 上翘枪托
  } else if (cat === 'shotgun') {
    ctx.fillStyle = V.wood ? '#5d4426' : '#8a6534';
    ctx.fillRect(gx + 7, hw - 0.5, 14, 4.8);                   // 泵管护木
    ctx.fillStyle = '#2b3c4a';
    ctx.fillRect(gx + 6, hw + 3.6, 3, 3.4);
  } else if (cat === 'rifle') {
    if (V.bullpup) {                                           // 无托布局：弹匣在机匣后方、握把前移
      ctx.fillStyle = '#2b3c4a';
      ctx.beginPath();
      ctx.moveTo(gx - 8, hw); ctx.lineTo(gx - 2, hw);
      ctx.lineTo(gx, hw + 9); ctx.lineTo(gx - 6, hw + 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#40607a';
      ctx.fillRect(gx + 3, hw + 1, 5, 8);                      // 前移的握把
    } else {
      ctx.fillStyle = '#2b3c4a';                               // 弹匣：弯（AK/QBZ）或直（AR 系）
      ctx.beginPath();
      ctx.moveTo(gx + 2, hw); ctx.lineTo(gx + 8, hw);
      if (magKind === 'curved') {
        ctx.lineTo(gx + 10, hw + 9); ctx.lineTo(gx + 4, hw + 9);
      } else {
        ctx.lineTo(gx + 9, hw + 9); ctx.lineTo(gx + 3, hw + 9);
      }
      ctx.closePath(); ctx.fill();
      if (V.carry) {                                           // 提把：QBZ 家族 / AK-12
        ctx.fillStyle = '#5a7d96';
        ctx.fillRect(gx + 1, -hw - 3.4, 10, 2.2);
      }
    }
  } else if (cat === 'lmg') {
    if (magKind === 'curved') {                                // RPK：长弯弹匣，不背弹箱
      ctx.fillStyle = '#2b3c4a';
      ctx.beginPath();
      ctx.moveTo(gx + 2, hw); ctx.lineTo(gx + 8, hw);
      ctx.lineTo(gx + 11, hw + 12); ctx.lineTo(gx + 5, hw + 12);
      ctx.closePath(); ctx.fill();
    } else {                                                   // M249 / PKM：弹箱
      ctx.fillStyle = '#2b3c4a';
      ctx.fillRect(gx + 1, hw + 1.5, 11, 10);
      ctx.fillStyle = '#48657b';
      ctx.fillRect(gx + 2.5, hw + 3, 8, 2.2);                  // 弹箱盖
    }
    ctx.fillStyle = '#5a7d96';
    ctx.fillRect(gx + 1, -hw - 3.4, 12, 2.2);                  // 提把
    ctx.strokeStyle = '#5a7d96'; ctx.lineWidth = 1.2;          // 两脚架
    ctx.beginPath();
    ctx.moveTo(gx + len - 12, hw); ctx.lineTo(gx + len - 16, hw + 7);
    ctx.moveTo(gx + len - 12, -hw); ctx.lineTo(gx + len - 16, -hw - 7);
    ctx.stroke();
  } else if (cat === 'dmr' || cat === 'sniper') {
    const big = cat === 'sniper';
    ctx.fillStyle = '#2b3c4a';
    ctx.fillRect(gx + 3, hw, 5, 8.5);                          // 弹匣
    const sl = big ? 17 : 13;
    const sy = -hw - (big ? 6.5 : 5.5);
    ctx.fillStyle = '#5a7d96';
    ctx.fillRect(gx, sy, sl, big ? 4.4 : 3.6);                 // 镜筒
    ctx.fillStyle = '#0e161d';
    ctx.fillRect(gx, sy, 2.8, big ? 4.4 : 3.6);                // 前后镜环
    ctx.fillRect(gx + sl - 2.2, sy, 2.8, big ? 4.4 : 3.6);
    if (V.bolt) {                                              // 栓动拉柄：R93 / M700 / AWM / SKS / M14
      ctx.strokeStyle = '#6d8fa6'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(gx + 8, -hw - 1); ctx.lineTo(gx + 12, -hw - 5);
      ctx.stroke();
    }
    if (big) {                                                 // 脚架
      ctx.strokeStyle = '#5a7d96'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx + len - 13, hw); ctx.lineTo(gx + len - 17, hw + 7.5);
      ctx.moveTo(gx + len - 13, -hw); ctx.lineTo(gx + len - 17, -hw - 7.5);
      ctx.stroke();
    }
  }

  /* ── 配件外观：装了什么，看枪就知道 ── */
  const S = W.slots || {};
  const muzzleX = gx + len - 7;

  if (S.muzzle === 'supp' || V.supp) {                         // 消音器：粗圆筒（AS VAL / SR-3M 自带）
    ctx.fillStyle = '#22333f';
    ctx.fillRect(muzzleX - 2, -hw - 1.4, 15, hw * 2 + 2.8);
    ctx.fillStyle = '#0e161d';
    ctx.fillRect(muzzleX + 9, -hw - 0.6, 3, hw * 2 + 1.2);
  } else if (S.muzzle === 'comp') {                            // 补偿器：开槽短口
    ctx.fillStyle = '#3d5568';
    ctx.fillRect(muzzleX, -hw - 1.8, 11, hw * 2 + 3.6);
    ctx.fillStyle = '#0e161d';
    for (let i = 0; i < 3; i++) ctx.fillRect(muzzleX + 2 + i * 2.4, -hw - 1.2, 1.2, hw * 2 + 2.4);
  } else if (S.muzzle === 'barrel' || S.muzzle === 'mk4_auto') {  // 加长 / 连发改装枪管：细出来一截
    ctx.fillStyle = '#6d8fa6';
    ctx.fillRect(gx + len - 6, -hw + 0.9, 9, hw * 1.4);
  }

  if (S.optic && cat !== 'sniper' && cat !== 'dmr') {           // 给没有镜的枪加镜
    const sl = S.optic === 'scope4x' ? 15 : 8;
    const sy = -hw - 4.6;
    ctx.fillStyle = '#5a7d96';
    ctx.fillRect(gx + 1, sy, sl, 3.4);
    ctx.fillStyle = '#0e161d';
    ctx.fillRect(gx + 1, sy, 2.2, 3.4);
    ctx.fillRect(gx + 1 + sl - 2, sy, 2.2, 3.4);
    if (S.optic === 'scope4x' || S.optic === 'holo') {
      ctx.fillStyle = 'rgba(142,242,255,0.75)';
      ctx.fillRect(gx + 1 + sl - 1.6, sy + 0.8, 1.2, 1.8);
    }
  } else if (S.optic === 'scope4x') {                          // 长枪本来有镜，再加一截
    ctx.fillStyle = '#5a7d96';
    ctx.fillRect(gx + 2, -hw - 7.4, 6, 2.6);
  }

  if (S.mag === 'extmag' || S.mag === 'quickmag') {            // 弹匣变化
    if (S.mag === 'quickmag') {
      ctx.fillStyle = 'rgba(255,214,107,0.9)';
      ctx.fillRect(gx + 2, hw + 1.5, 6, 1.4);
    } else if (cat === 'smg') {
      ctx.fillStyle = '#2b3c4a';
      ctx.beginPath(); ctx.arc(gx + 5, hw + 6, 8.1, 0, TAU); ctx.fill();
    } else if (cat === 'rifle' || cat === 'lmg' || cat === 'dmr' || cat === 'sniper') {
      ctx.fillStyle = '#2b3c4a';
      ctx.fillRect(gx + 3, hw + 8.4, 5, 6);
    } else {
      ctx.fillStyle = '#2b3c4a';
      ctx.fillRect(gx + 1, hw + 7.5, 4.6, 6);
    }
  }

  if (S.stock) {                                               // 枪托
    const heavy = S.stock === 'heavy';
    const sx = gx - 3 - (heavy ? 10 : 7.5);
    ctx.fillStyle = '#40607a';
    ctx.fillRect(sx, -hw - 1.6, heavy ? 10 : 8, hw * 2 + 3.2);
    if (S.stock === 'tactic') {
      ctx.fillStyle = 'rgba(70,224,138,0.7)';
      ctx.fillRect(sx + 1, -hw - 1.2, 1.6, hw * 2 + 2.4);
    }
  }

  // 分类色：枪管整体淡淡染上这一类的颜色，一眼能认出手里拿的是什么
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = W.color;
  ctx.fillRect(gx, -hw, len - 6, hw * 2);
  ctx.globalAlpha = 0.9;
  ctx.fillRect(gx - 3, -hw - 2.4, 12, 1.6);
  ctx.restore();
  return { len: len };
}

/* ── 改装台的枪械预览：侧视图，改哪儿一眼看得出 ── */
/* 侧视轮廓长度（改装台与预览共用）：手枪按弹匣容量分三档，
   93R 长管 / G18 长弹匣 / G17 制式尺寸，一眼能分开 */
function gunSideLen(W) {
  if (W.vis && W.vis.sidel) return W.vis.sidel;                // 每枪覆盖：短管冲锋枪 / 卡宾长度差异
  const c = W.cat;
  if (c === 'sniper') return 92;
  if (c === 'dmr') return 86;
  if (c === 'lmg') return 84;
  if (c === 'rifle') return 78;
  if (c === 'shotgun') return 72;
  if (c === 'smg') return 64;
  return W.mag >= 30 ? 50 : W.mag >= 19 ? 55 : 48;
}

function drawGunSide(g, W) {
  const cat = W.cat;
  const S = W.slots || {};
  const L = gunSideLen(W);
  const V = W.vis || {};
  const magKind = V.mag || (cat === 'smg' ? 'helix' : cat === 'lmg' ? 'box' : 'curved');
  const bullpup = !!V.bullpup;                                 // 无托布局：握把/扳机前移，弹匣在机匣后方
  const isLong = cat === 'rifle' || cat === 'dmr' || cat === 'sniper' || cat === 'lmg';
  const frame = isLong && !bullpup
    ? (V.frame || (cat === 'lmg' ? 'lmg' : 'ar')) : null;      // 枪体骨架：ar/ak/chassis/sporter/lmg
  const FG = V.wood ? '#5d4426' : '#33475a';                   // 护木配色：木质件用木色
  const STK = V.wood ? '#4a3520' : null;
  const C = {
    body: '#33475a',
    body2: '#45627b',
    metal: '#6d8ea8',
    dark: '#141d27',
    accent: W.color,
  };
  /* 布局：常规枪 弹匣前/握把后；无托枪反过来 */
  const trigX = bullpup ? L * 0.44 : L * 0.58;
  const gripX = bullpup ? L * 0.47 : L * 0.61;
  const magX  = bullpup ? L * 0.565 : L * 0.375;

  const rr = (x, y, w, h, r) => {
    const rd = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    g.beginPath();
    g.moveTo(x + rd, y);
    g.lineTo(x + w - rd, y); g.quadraticCurveTo(x + w, y, x + w, y + rd);
    g.lineTo(x + w, y + h - rd); g.quadraticCurveTo(x + w, y + h, x + w - rd, y + h);
    g.lineTo(x + rd, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rd);
    g.lineTo(x, y + rd); g.quadraticCurveTo(x, y, x + rd, y);
    g.closePath();
  };

  /* 枪管 */
  const bEnd = (S.muzzle === 'barrel' || S.muzzle === 'mk4_auto') ? -12 : 2;
  g.fillStyle = C.metal;
  rr(bEnd, -2.1, L * 0.42 - bEnd, 4.2, 1); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(bEnd + 1, -1.7, Math.max(0, L * 0.42 - bEnd - 4), 1);

  /* 护木：运动托整段木壳更丰满，其余按骨架 */
  g.fillStyle = FG;
  if (frame === 'sporter') {
    rr(L * 0.11, -5.2, L * 0.23, 10.4, 2.4); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(L * 0.13, 2.6, L * 0.19, 2);
  } else {
    rr(L * 0.17, -4, L * 0.17, 8, 1.4); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    if (cat === 'shotgun') {                    // 泵管
      g.fillRect(L * 0.17, 2.2, L * 0.17, 2.2);
    }
  }

  /* 机匣 —— 按骨架画不同的枪体基座 */
  g.fillStyle = C.body2;
  if (frame === 'lmg') {
    rr(L * 0.30, -7, L * 0.44, 14, 1.8); g.fill();          // 机枪：厚机匣
    g.fillStyle = C.dark;                                    // 供弹盖缝
    g.fillRect(L * 0.31, -2.6, L * 0.42, 1.8);
  } else {
    rr(L * 0.33, -6, L * 0.41, 12, 1.8); g.fill();
  }
  if (frame === 'ak') {                                      // AK：机匣盖后段上斜收窄
    g.fillStyle = C.body2;
    g.beginPath();
    g.moveTo(L * 0.55, -6); g.lineTo(L * 0.745, -3.2);
    g.lineTo(L * 0.745, 1.2); g.lineTo(L * 0.55, 1.2);
    g.closePath(); g.fill();
    g.fillStyle = C.metal;                                   // 导气管：枪管上方细管
    rr(L * 0.175, -7.6, L * 0.16, 2.4, 1); g.fill();
  } else if (frame === 'lmg') {                              // 机枪：供弹盘凸出机匣下前部
    g.fillStyle = C.body;
    rr(L * 0.455, 6.4, L * 0.15, 4.4, 1.2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(L * 0.34, -5.2, L * 0.39, 1.5);

  /* 抛壳口 + 拉机柄 */
  g.fillStyle = C.dark;
  g.fillRect(L * 0.50, -3.4, Math.max(4, L * 0.08), 2.6);
  if (V.bolt) {                                 // 栓动 / 直拉枪机：拉柄斜上伸出
    g.strokeStyle = C.metal; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(L * 0.555, -3.2); g.lineTo(L * 0.555 + 5, -7.2);
    g.stroke();
    g.fillStyle = C.metal;
    g.beginPath(); g.arc(L * 0.555 + 5.6, -7.8, 1.7, 0, TAU); g.fill();
  }

  /* 扳机护圈 */
  g.strokeStyle = C.body;
  g.lineWidth = 1.3;
  g.beginPath();
  g.arc(trigX, 7.6, 3.4, Math.PI * 1.02, Math.PI * 1.98);
  g.stroke();

  /* 握把 */
  g.fillStyle = C.dark;
  g.beginPath();
  g.moveTo(gripX, 4.6); g.lineTo(gripX + L * 0.055, 4.6);
  g.lineTo(gripX + L * 0.105, 16.5); g.lineTo(gripX + L * 0.03, 16.5);
  g.closePath(); g.fill();

  /* 握把配件 */
  if (S.grip === 'vgrip') {
    g.fillStyle = '#22394c';
    rr(gripX + L * 0.015, 8.5, 4.4, 8, 1); g.fill();
    g.strokeStyle = 'rgba(120,200,240,0.5)'; g.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(gripX + L * 0.025, 9.6 + i * 2);
      g.lineTo(gripX + L * 0.055, 9.6 + i * 2);
      g.stroke();
    }
  } else if (S.grip === 'lgrip') {
    g.strokeStyle = 'rgba(150,210,235,0.55)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(gripX + L * 0.025, 6.5); g.lineTo(gripX + L * 0.09, 15);
    g.stroke();
  } else if (S.grip === 'laser') {
    g.fillStyle = '#1b2836';
    rr(L * 0.47, 4.4, 9, 3.6, 1); g.fill();
    g.fillStyle = 'rgba(255,70,90,0.95)';
    g.beginPath(); g.arc(L * 0.47 + 1, 6.2, 1.1, 0, TAU); g.fill();
  }

  /* 弹匣 / 供弹 —— 按每把枪的 magKind 画：螺旋弹鼓/圆弹鼓/弹箱/直弹匣/细长条/弯弹匣 */
  if (cat !== 'shotgun') {
    let mh = cat === 'pistol' ? (W.mag >= 30 ? 18 : W.mag >= 19 ? 12 : 10) : 13;
    let mw = 6;
    if (S.mag === 'extmag') mh = cat === 'pistol' ? 20 : 20;
    else if (S.mag === 'quickmag') { mh = 11; mw = 6.4; }
    else if (S.mag === 'lightmag') mh = 10;
    const mx = magX;

    if (magKind === 'helix') {                  // 野牛：螺旋弹鼓
      g.fillStyle = C.body;
      g.beginPath(); g.arc(mx + 4, 9.5, 6.4 + (S.mag === 'extmag' ? 1.6 : 0), 0, TAU); g.fill();
      g.strokeStyle = 'rgba(142,242,255,0.45)'; g.lineWidth = 0.9;
      g.beginPath(); g.arc(mx + 4, 9.5, 6.4 + (S.mag === 'extmag' ? 1.6 : 0), 0, TAU); g.stroke();
      g.beginPath(); g.arc(mx + 4, 9.5, 2.3, 0, TAU); g.stroke();
    } else if (magKind === 'drum') {            // 汤姆逊：圆弹鼓
      const dr = 7.6 + (S.mag === 'extmag' ? 1.4 : 0);
      g.fillStyle = '#243546';
      g.beginPath(); g.arc(mx + 4, 9, dr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath(); g.arc(mx + 4, 9, dr * 0.45, 0, TAU); g.fill();
      if (S.mag === 'quickmag') {
        g.strokeStyle = 'rgba(255,206,110,0.9)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(mx + 4, 9, dr, 0, TAU); g.stroke();
      }
    } else if (magKind === 'box' || magKind === 'belt') {   // 机枪：方弹箱（M249 / PKM）
      g.fillStyle = '#243546';
      rr(mx - 1.5, 4, 11.5, 15 + (S.mag === 'extmag' ? 2.5 : 0), 1.6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(mx - 0.5, 5.5, 9.5, 1.6);
      if (S.mag === 'quickmag') {
        g.fillStyle = 'rgba(255,206,110,0.9)';
        g.fillRect(mx - 1.5, 6.5, 11.5, 1.6);
      }
    } else if (magKind === 'stick') {           // 细长直弹匣（MP7 / Vector）
      g.fillStyle = '#243546';
      g.fillRect(mx + 1, 4, 3.6, mh + (S.mag === 'extmag' ? 6 : 0));
      if (S.mag === 'quickmag') {
        g.fillStyle = 'rgba(255,206,110,0.9)';
        g.fillRect(mx + 1, 6, 3.6, 1.4);
      }
    } else {
      g.fillStyle = '#243546';                  // 弹匣：弯（AK/QBZ 系）或直（AR 系）
      g.beginPath();
      g.moveTo(mx, 4); g.lineTo(mx + mw, 4);
      if (magKind === 'curved') {
        g.lineTo(mx + mw + 1.6, 4 + mh); g.lineTo(mx + 1.2, 4 + mh);
      } else {
        g.lineTo(mx + mw + 0.4, 4 + mh); g.lineTo(mx + 0.4, 4 + mh);
      }
      g.closePath(); g.fill();
      if (S.mag === 'quickmag') {
        g.fillStyle = 'rgba(255,206,110,0.9)';
        g.fillRect(mx + 0.6, 6, mw + 1.6, 1.4);
      }
    }
  } else {                                      // 霰弹枪：管状弹仓
    g.fillStyle = C.body;
    rr(L * 0.10, 2.6, L * 0.30, 2.8, 1.2); g.fill();
  }

  /* 机枪：枪管下两脚架（收纳状态斜撑） */
  if (cat === 'lmg') {
    g.strokeStyle = C.metal; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(L * 0.52, 2.4); g.lineTo(L * 0.46, 13);
    g.moveTo(L * 0.52, 2.4); g.lineTo(L * 0.58, 13);
    g.stroke();
  }

  /* 枪托（手枪没有枪托，用一小段套筒尾部收口） */
  const sx = L * 0.735;
  if (cat === 'pistol') {
    g.fillStyle = C.body;
    rr(sx - 1.5, -5.4, L * 0.10, 10.8, 1.6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(sx - 1, -4.6, L * 0.08, 1.4);
  } else if (S.stock === 'folding') {
    g.strokeStyle = C.body2; g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(sx, -3); g.lineTo(sx + 7, -3.5); g.lineTo(sx + 7, 3.4); g.lineTo(sx, 3);
    g.stroke();
  } else if (S.stock === 'heavy') {
    g.fillStyle = C.body2;
    rr(sx, -7.4, L * 0.27, 14.8, 2); g.fill();
    g.fillStyle = C.dark;
    rr(sx + L * 0.21, -7.8, L * 0.06, 15.6, 1.6); g.fill();
  } else if (frame === 'ar') {                  // AR：缓冲管从机匣后方伸出，托连在管上
    g.fillStyle = C.body;
    g.fillRect(sx - 6, -2.4, 8, 4.8);
    g.fillStyle = C.body2;
    g.beginPath();
    g.moveTo(sx, -6.2); g.lineTo(sx + L * 0.13, -5.4);
    g.lineTo(sx + L * 0.14, 6.8); g.lineTo(sx + L * 0.12, 8.6);
    g.lineTo(sx + 2, 8.2); g.lineTo(sx, 5.4);
    g.closePath(); g.fill();
    if (S.stock === 'tactic') {
      g.fillStyle = C.dark;
      rr(sx + L * 0.035, -4, L * 0.055, 8, 1.2); g.fill();
      g.fillStyle = 'rgba(70,224,138,0.8)';
      g.fillRect(sx + L * 0.04, -2.6, L * 0.045, 1.2);
    }
  } else if (frame === 'ak') {                  // AK：托板向下斜，托底板后仰
    g.fillStyle = STK || C.body2;
    g.beginPath();
    g.moveTo(sx, -3.6); g.lineTo(sx + L * 0.135, 0.8);
    g.lineTo(sx + L * 0.145, 10.8); g.lineTo(sx + L * 0.10, 11.8);
    g.lineTo(sx, 9.8);
    g.closePath(); g.fill();
    g.fillStyle = C.dark;
    g.fillRect(sx + L * 0.115, 2, 3.2, 10.6);   // 托底板
  } else if (frame === 'chassis') {             // 底盘：镂空骨架托 + 贴腮垫
    g.strokeStyle = C.body2; g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(sx - 3, -6.6); g.lineTo(sx + L * 0.19, -7);
    g.lineTo(sx + L * 0.215, 8); g.lineTo(sx - 3, 7.6);
    g.closePath(); g.stroke();
    g.fillStyle = C.dark;                       // 镂空
    rr(sx + 4, -3.4, L * 0.13, 8.6, 2.4); g.fill();
    g.fillStyle = C.body2;                      // 贴腮垫
    rr(sx + L * 0.05, -9.4, L * 0.10, 4.4, 1.6); g.fill();
    g.fillStyle = C.dark;                       // 托底板
    g.fillRect(sx + L * 0.18, -7.2, 3.2, 15.6);
  } else if (frame === 'sporter') {             // 运动托：一体斜收到宽托底板
    g.fillStyle = STK || C.body2;
    g.beginPath();
    g.moveTo(sx - 3, -6.6); g.lineTo(sx + L * 0.14, -4.6);
    g.lineTo(sx + L * 0.20, 9.4); g.lineTo(sx + L * 0.17, 13.4);
    g.lineTo(sx + L * 0.03, 13.4); g.lineTo(sx - 3, 6.8);
    g.closePath(); g.fill();
    g.fillStyle = C.dark;                       // 托底板
    g.fillRect(sx + L * 0.175, -4.2, 3.4, 18);
    if (S.stock === 'tactic') {
      g.fillStyle = C.dark;
      rr(sx + L * 0.035, -4, L * 0.055, 8, 1.2); g.fill();
    }
  } else if (frame === 'lmg') {                 // 机枪：实心肩托 + 收纳肩垫
    g.fillStyle = C.body2;
    g.beginPath();
    g.moveTo(sx, -7); g.lineTo(sx + L * 0.13, -6.6);
    g.lineTo(sx + L * 0.14, 7); g.lineTo(sx, 7.6);
    g.closePath(); g.fill();
    g.fillStyle = C.dark;
    g.fillRect(sx + L * 0.105, -6.8, 3.2, 14.2);
  } else {                                      // 默认三角托（霰弹/无托等）
    g.fillStyle = STK || C.body2;
    g.beginPath();
    g.moveTo(sx, -5.4); g.lineTo(sx + L * 0.13, -5);
    g.lineTo(sx + L * 0.14, 4.6); g.lineTo(sx + L * 0.13, 6.4);
    g.lineTo(sx, 5.4);
    g.closePath(); g.fill();
    if (S.stock === 'tactic') {
      g.fillStyle = C.dark;
      rr(sx + L * 0.035, -4, L * 0.055, 8, 1.2); g.fill();
      g.fillStyle = 'rgba(70,224,138,0.8)';
      g.fillRect(sx + L * 0.04, -2.6, L * 0.045, 1.2);
    }
  }

  /* 镜 / 机械瞄具 */
  if (S.optic) {
    const sl = S.optic === 'scope4x' ? 26 : (S.optic === 'holo' ? 14 : 10);
    const sy = S.optic === 'scope4x' ? -12.4 : -10.2;
    const sh = S.optic === 'scope4x' ? 5.6 : 4.6;
    g.fillStyle = C.metal;
    rr(L * 0.36, sy, sl, sh, 1.4); g.fill();
    g.fillStyle = C.dark;
    rr(L * 0.36, sy, 2.6, sh, 1); g.fill();
    rr(L * 0.36 + sl - 2.6, sy, 2.6, sh, 1); g.fill();
    if (S.optic === 'holo' || S.optic === 'scope4x') {
      g.fillStyle = 'rgba(150,240,255,0.85)';
      g.fillRect(L * 0.36 + sl - 3.2, sy + 1.2, 1.2, sh - 2.4);
    }
    /* 镜桥 */
    g.fillStyle = C.body;
    g.fillRect(L * 0.39, -6.2, 3, 1.6);
    g.fillRect(L * 0.39 + sl - 6, -6.2, 3, 1.6);
  } else {
    g.fillStyle = C.body;
    g.fillRect(L * 0.40, -8.2, 2.2, 2.4);      // 准星
    g.fillRect(L * 0.69, -8, 1.8, 2.2);        // 照门
  }

  /* 枪口配件（AS VAL / SR-3M 的自带消音同样画粗圆筒） */
  if (S.muzzle === 'supp' || V.supp) {
    g.fillStyle = C.dark;
    rr(-17, -4.6, 19, 9.2, 2.2); g.fill();
    g.strokeStyle = 'rgba(150,195,220,0.5)'; g.lineWidth = 0.7;
    rr(-17, -4.6, 19, 9.2, 2.2); g.stroke();
    g.fillStyle = '#0a1016';
    rr(-16, -1.4, 4, 2.8, 1); g.fill();
  } else if (S.muzzle === 'comp') {
    g.fillStyle = C.body2;
    rr(-9, -4.2, 11, 8.4, 1.2); g.fill();
    g.fillStyle = C.dark;
    for (let i = 0; i < 3; i++) g.fillRect(-7.6 + i * 2.6, -3.4, 1.3, 6.8);
  }

  /* 分类色：一条机匣高光 + 握把根部，让六类枪一眼分开 */
  g.fillStyle = C.accent;
  g.globalAlpha = 0.85;
  g.fillRect(L * 0.34, -6, L * 0.39, 1.3);
  g.globalAlpha = 0.55;
  g.fillRect(L * 0.17, -4, L * 0.17, 1.1);
  g.globalAlpha = 1;
}

function drawGunPreview(wid) {
  const cv = $('gsPreview');
  if (!cv) return;
  const cw = Math.max(360, cv.clientWidth || 640);
  const ch = 145;
  if (cv.width !== Math.round(cw * 2) || cv.height !== ch * 2) {
    cv.width = Math.round(cw * 2);
    cv.height = ch * 2;
  }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(2, 0, 0, 2, 0, 0);

  const W = weaponStats(wid);
  const L = gunSideLen(W);

  /* 逻辑坐标：x 从 -18（枪口）到 L，y 从 -13 到 20 */
  const spanX = L + 20, spanY = 34;
  const k = Math.min((cw - 56) / spanX, (ch - 22) / spanY, 6.2);
  const ox = cw / 2 - ((L - 18) / 2) * k;
  const oy = ch / 2 - 1.6 * k;

  g.save();
  g.translate(ox, oy);
  g.scale(k, k);

  g.globalAlpha = 0.4;
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(L * 0.45, 20, L * 0.42, 2.6, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;

  drawGunSide(g, W);
  g.restore();
}

/* 手持匕首：收刀时贴着身体，挥击时向前划出一道弧光 */
function drawPlayerBlade(rec) {
  const M = MELEES[P.melee] || MELEES[STARTER_MELEE];
  const total = 0.22;
  const k = P.swingT > 0 ? 1 - P.swingT / total : 1;
  const sw = P.swingT > 0 ? (k * k * (3 - 2 * k)) : 0;    // 平滑的 0 → 1
  const len = 12 + M.reach * 0.52;

  ctx.save();
  ctx.translate(P.r * 0.45 + rec, 0);
  ctx.rotate(-0.55 + sw * 1.30);
  /* 刀柄 */
  ctx.fillStyle = '#2b3a48';
  ctx.fillRect(-4, -2.2, 6, 4.4);
  /* 护手 */
  ctx.fillStyle = '#43586b';
  ctx.fillRect(1.4, -4.6, 2.6, 9.2);
  /* 刀身：靠近刀尖收成尖头 */
  ctx.fillStyle = M.color;
  ctx.beginPath();
  ctx.moveTo(4, -2.0);
  ctx.lineTo(4 + len, -2.6);
  ctx.lineTo(5.5 + len, 0);
  ctx.lineTo(4 + len, 2.4);
  ctx.lineTo(4, 2.0);
  ctx.closePath();
  ctx.fill();
  /* 血槽 */
  ctx.fillStyle = 'rgba(40,60,80,0.5)';
  ctx.fillRect(6, -0.4, len - 4, 0.9);
  /* 挥击弧光 */
  if (P.swingT > 0) {
    const fade = P.swingT / total;
    ctx.strokeStyle = (P.swingHit > 0 ? 'rgba(255,210,150,' : 'rgba(220,240,255,') + (0.5 * fade) + ')';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, P.r + M.reach * 0.72, -0.85 + sw * 1.25, -0.35 + sw * 1.25);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  ctx.restore();
}

/* 医疗槽里的手持物：医疗包 / 绷带 / 手术包，外圈是读条或剩余耐久 */
function drawPlayerMedkit(rec) {
  const pk = carePickNow() || P.carePick || careKeyMake('med', STARTER_MEDKIT);
  const kind = careKindOf(pk);
  const id = careIdOf(pk);

  ctx.save();
  ctx.translate(P.r * 0.55 + rec, 0);
  ctx.rotate(-0.22);

  if (kind === 'stop') {
    /* 止血件：绷带卷 / 止血带；止疼药：药瓶 + 一片药 */
    const S = STOPS[id] || STOPS.bandage;
    if (S.pain) {
      const bottle = (S.uses | 0) > 1;
      if (bottle) {
        ctx.fillStyle = 'rgba(216,238,248,0.95)';
        drawRoundRect(-9, -5.5, 12, 11, 2); ctx.fill();
        ctx.strokeStyle = S.color;
        ctx.lineWidth = 1.3;
        drawRoundRect(-9, -5.5, 12, 11, 2); ctx.stroke();
        ctx.fillStyle = S.color;
        drawRoundRect(-7.5, -8, 9, 3, 1.2); ctx.fill();      // 瓶盖
      }
      const px = bottle ? 4.6 : 0, py = bottle ? 2 : 0;
      ctx.fillStyle = 'rgba(248,252,254,0.98)';
      ctx.beginPath(); ctx.arc(px, py, 4.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = S.color;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(px, py, 4.6, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py); ctx.stroke();   // 刻痕
    } else if (id === 'tourniquet') {
      ctx.fillStyle = 'rgba(255,155,107,0.95)';
      drawRoundRect(-9, -3, 18, 6, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40,60,74,0.7)';
      ctx.lineWidth = 1;
      drawRoundRect(-9, -3, 18, 6, 2); ctx.stroke();
      ctx.fillStyle = '#2b3c4a';
      drawRoundRect(2.5, -5, 4, 10, 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(200,235,255,0.6)';
      ctx.fillRect(3.4, -3.6, 1.2, 7.2);
    } else {
      ctx.fillStyle = 'rgba(238,246,250,0.97)';
      drawRoundRect(-7.5, -5, 15, 10, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(110,145,170,0.75)';
      ctx.lineWidth = 1;
      drawRoundRect(-7.5, -5, 15, 10, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7.5, -1.6); ctx.lineTo(7.5, -1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7.5, 1.6); ctx.lineTo(7.5, 1.6); ctx.stroke();
      ctx.fillStyle = 'rgba(160,195,215,0.85)';
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    }
  } else if (kind === 'surg') {
    /* 手术包：硬盒 + 等级描边 + 手术刀 */
    const S = SURGERIES[id] || SURGERIES.surg_simple;
    ctx.fillStyle = 'rgba(228,238,246,0.97)';
    drawRoundRect(-8.5, -7, 17, 14, 2.4); ctx.fill();
    ctx.strokeStyle = S.color;
    ctx.lineWidth = 1.6;
    drawRoundRect(-8.5, -7, 17, 14, 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8.5, 0); ctx.lineTo(8.5, 0); ctx.stroke();
    ctx.strokeStyle = '#8fe3ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-3.4, 3.4); ctx.lineTo(4.2, -4.2); ctx.stroke();
    ctx.fillStyle = S.color;
    ctx.fillRect(1.6, -5.4, 2.6, 2.6);
  } else {
    /* 医疗包：注射器 / 软包 / 硬箱，按 size 分 */
    const M = MEDKITS[id] || MEDKITS[STARTER_MEDKIT];
    const k = M.size || 1;
    const w = 12 * k, h = 12 * k;

    if (k < 0.72) {
      const L = 17 + k * 10;
      ctx.fillStyle = 'rgba(226,246,255,0.94)';
      drawRoundRect(-L * 0.5, -2.3, L, 4.6, 1.8); ctx.fill();
      ctx.fillStyle = M.color;
      drawRoundRect(-L * 0.5 + 1.2, -1.2, L * 0.52, 2.4, 1.1); ctx.fill();
      ctx.strokeStyle = 'rgba(205,238,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(L * 0.5 + 7, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(232,250,255,0.9)';
      drawRoundRect(-L * 0.5 - 4.6, -4, 3, 8, 1); ctx.fill();
    } else if (k < 1.2) {
      ctx.fillStyle = 'rgba(232,244,234,0.96)';
      drawRoundRect(-w * 0.5, -h * 0.5, w, h, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(10,25,35,0.55)';
      ctx.lineWidth = 1;
      drawRoundRect(-w * 0.5, -h * 0.5, w, h, 2); ctx.stroke();
      ctx.fillStyle = M.color;
      ctx.fillRect(-1.7, -h * 0.34, 3.4, h * 0.68);
      ctx.fillRect(-w * 0.34, -1.7, w * 0.68, 3.4);
      ctx.strokeStyle = 'rgba(175,205,220,0.75)';
      ctx.beginPath(); ctx.arc(0, -h * 0.5, w * 0.22, Math.PI, 0); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(226,240,238,0.97)';
      drawRoundRect(-w * 0.5, -h * 0.42, w, h * 0.84, 2.6); ctx.fill();
      ctx.strokeStyle = 'rgba(10,25,35,0.6)';
      ctx.lineWidth = 1.2;
      drawRoundRect(-w * 0.5, -h * 0.42, w, h * 0.84, 2.6); ctx.stroke();
      ctx.fillStyle = M.color;
      ctx.fillRect(-2, -h * 0.30, 4, h * 0.60);
      ctx.fillRect(-w * 0.30, -2, w * 0.60, 4);
      ctx.strokeStyle = 'rgba(90,120,140,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(w * 0.5, 0); ctx.stroke();
    }
  }
  ctx.restore();

  /* 外圈：一整条读条 —— 琥珀色启动段 + 药色的回血窗口，走完就收手 */
  if (P.medOn) {
    const ct = careKindOf(P.medOn), ci = careIdOf(P.medOn);
    const winding = P.medWind > 0;
    let ratio = 1, col = '#ffd66b';
    if (winding) {
      ratio = clamp(1 - P.medWind / Math.max(0.01, P.medWindT), 0, 1);
    } else if (ct === 'med') {
      const MM = MEDKITS[ci] || MEDKITS[STARTER_MEDKIT];
      ratio = clamp(1 - P.medHealT / Math.max(0.01, P.medHealW), 0, 1);   // 回血窗口进度
      col = MM.color;
    }
    ctx.strokeStyle = 'rgba(8,18,26,0.55)';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(0, 0, P.r + 8, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, P.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (P.medCd > 0.05) {
    const kk = 1 - clamp(P.medCd / 0.35, 0, 1);
    ctx.strokeStyle = 'rgba(70,224,138,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, P.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * kk); ctx.stroke();
  }
}

function drawPlayer() {
  const t = G.time;
  const bob = Math.sin(P.walkPhase) * 1.4;

  /* 倒地：趴在地上的一具身体，头朝准星 */
  if (isDowned()) {
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(2, 5, P.r * 1.5, P.r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.rotate(P.aim);
    ctx.fillStyle = '#20465a';
    ctx.strokeStyle = '#8dffc0';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, P.r * 1.5, P.r * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8d6de';
    ctx.beginPath(); ctx.arc(P.r * 0.9, 0, P.r * 0.42, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(P.x, P.y + bob);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(2, 6, P.r * 1.05, P.r * 0.8, 0, 0, TAU);
  ctx.fill();

  ctx.rotate(P.aim);
  const rec = -P.recoil * 0.5;

  const legSwing = Math.sin(P.walkPhase) * 5;
  ctx.fillStyle = '#1b4a5e';
  ctx.beginPath(); ctx.ellipse(-2, -7 + legSwing * 0.4, 5, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-2, 7 - legSwing * 0.4, 5, 4, 0, 0, TAU); ctx.fill();

  const glowG = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
  glowG.addColorStop(0, 'rgba(67,217,245,0.20)');
  glowG.addColorStop(1, 'rgba(67,217,245,0)');
  ctx.fillStyle = glowG;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();

  const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, P.r);
  bodyGrad.addColorStop(0, P.hurtFlash > 0.1 ? '#ffffff' : '#8af0ff');
  bodyGrad.addColorStop(1, P.hurtFlash > 0.1 ? '#ff6b81' : '#1f9fc4');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.arc(0, 0, P.r, 0, TAU); ctx.fill();

  ctx.strokeStyle = P.invuln > 0 ? 'rgba(255,255,255,' + (0.35 + Math.sin(t * 40) * 0.3) + ')' : '#a8f2ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (armDr() > 0) {
    ctx.strokeStyle = 'rgba(120,200,255,' + (0.35 + armDr() * 0.7) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, P.r + 4, 0, TAU); ctx.stroke();
  }

  ctx.fillStyle = '#d8fbff';
  ctx.beginPath();
  ctx.moveTo(P.r - 1, -5); ctx.lineTo(P.r + 6, 0); ctx.lineTo(P.r - 1, 5);
  ctx.closePath(); ctx.fill();

  /* 手持物画在身体之上：枪身从胸口伸出去，不会被躯干和朝向箭头盖掉 */
  if (P.curSlot === 'melee') {
    drawPlayerBlade(rec);
  } else if (P.curSlot === 'medkit' || P.medOn) {
    drawPlayerMedkit(rec);          // 原地治疗：枪背在后面，药拿在手上
  } else {
    const wObj = weaponStats(P.weapon);
    const gun = drawPlayerGun(wObj, rec);
    if (P.muzzle > 0) {
      const fl = P.muzzle / 0.06;
      ctx.fillStyle = 'rgba(255,240,190,' + fl + ')';
      ctx.beginPath();
      ctx.arc(P.r * 0.5 + rec + gun.len + 4, 0, 11 * fl, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();

  /* 外骨骼：脚下一圈六边形力场 + 背后两根推进器，一眼看得出在增益里 */
  if (exoOn()) {
    const X = opDef().x;
    const remain = P.op.x.t / X.dur;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(t * 1.2);
    ctx.strokeStyle = 'rgba(255,138,76,' + (0.55 + Math.sin(t * 9) * 0.2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const px = Math.cos(a) * (P.r + 10), py = Math.sin(a) * (P.r + 10);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.rotate(-t * 1.2);
    ctx.strokeStyle = 'rgba(255,214,107,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, P.r + 15, -Math.PI / 2, -Math.PI / 2 + TAU * remain);
    ctx.stroke();
    ctx.restore();
  }

  /* 读条剩余画在未旋转的坐标系里，不然文字会跟着朝向倒过来 */
  if (P.medOn && P.medWind > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(255,214,107,0.95)';
    ctx.fillText('启动 ' + P.medWind.toFixed(1) + 's', P.x, P.y + P.r + 22);
    ctx.restore();
    ctx.textAlign = 'left';
  } else if (P.medOn && careKindOf(P.medOn) === 'med') {
    const MM = MEDKITS[careIdOf(P.medOn)] || MEDKITS[STARTER_MEDKIT];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = MM.color;
    ctx.fillText('回血 ' + P.medHealT.toFixed(1) + 's', P.x, P.y + P.r + 22);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

/* 视野扇形单独一层绘制：放在障碍物之前，墙体自然把光锥挡掉 */
function drawVisionCones() {
  for (const e of G.enemies) {
    if (e.state === 'combat' || e.type === 'boss') continue;
    if (!fogVisibleAt(e.x, e.y)) continue;   // 看不见的敌人才不会暴露视野

    const alert = e.state === 'alert' || e.alertMeter > 0.05;
    const rgb = alert ? '255,176,70' : '120,190,225';

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);

    const vg = ctx.createRadialGradient(0, 0, e.r * 0.8, 0, 0, e.sight);
    vg.addColorStop(0, 'rgba(' + rgb + ',' + (alert ? 0.155 : 0.095) + ')');
    vg.addColorStop(0.7, 'rgba(' + rgb + ',' + (alert ? 0.065 : 0.048) + ')');
    vg.addColorStop(1, 'rgba(' + rgb + ',0)');

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, e.sight, -e.fov, e.fov);
    ctx.closePath();
    ctx.fillStyle = vg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (alert ? 0.30 : 0.19) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(e) {
  const t = G.time;
  /* 被标记：脚下转一圈绿环 + 头顶三角，隔着迷雾也认得出 */
  if (e.mark > 0) {
    const a = clamp(e.mark / 1.2, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(140,250,190,' + (0.55 * a) + ')';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -G.time * 30;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(150,255,200,' + (0.85 * a) + ')';
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - e.r - 22);
    ctx.lineTo(e.x - 5, e.y - e.r - 30);
    ctx.lineTo(e.x + 5, e.y - e.r - 30);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(e.x, e.y);

  /* 抬手蓄力：先后坐一点，让"要出手了"看得出来 */
  if (e.meleeWind > 0) {
    const MW = meleeOf(e);
    const wk = 1 - Math.max(0, e.meleeWind) / MW.wind;
    ctx.translate(-Math.cos(e.meleeAim) * 6 * wk, -Math.sin(e.meleeAim) * 6 * wk);
  }

  /* 近战抬手预警：出手方向画一圈收拢的红色扇区，谁要打你一眼就能看见 */
  if (e.meleeWind > 0) {
    const MW = meleeOf(e);
    const k = 1 - Math.max(0, e.meleeWind) / MW.wind;        // 0 → 1 收拢
    const ar = e.r + MW.reach * (0.62 + 0.38 * k);
    const a0 = e.meleeAim - MW.arc, a1 = e.meleeAim + MW.arc;
    ctx.save();
    ctx.fillStyle = 'rgba(255,60,90,' + (0.05 + 0.15 * k) + ')';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, ar, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,70,100,' + (0.22 + 0.5 * k) + ')';
    ctx.lineWidth = 1.6 + 2.4 * k;
    ctx.beginPath(); ctx.arc(0, 0, ar, a0, a1); ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(2, 5, e.r * 1.0, e.r * 0.75, 0, 0, TAU);
  ctx.fill();

  /* glow 必须是 '#rrggbb'：拼 '40' 之前先兜一层底，否则 addColorStop 会抛异常，
     而那次异常会把整帧后面的迷雾与 HUD 一起吞掉（见 render 的绘制顺序） */
  const glowHex = /^#[0-9a-f]{6}$/i.test(e.glow || '') ? e.glow : '#ff2d55';
  const gr = ctx.createRadialGradient(0, 0, e.r * 0.6, 0, 0, e.r * 1.7);
  gr.addColorStop(0, glowHex + '40');
  gr.addColorStop(1, glowHex + '00');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(0, 0, e.r * 1.7, 0, TAU); ctx.fill();

  const baseCol = e.burn > 0.05 ? '#ffffff' : e.color;
  const strokeCol = e.burn > 0.05 ? '#ffffff' : e.glow;

  if (e.shape === 'tri') {
    ctx.rotate(e.aim);
    const wob = 1 + Math.sin(e.walkPhase * 1.6) * 0.07;
    ctx.beginPath();
    ctx.moveTo(e.r * 1.25 * wob, 0);
    ctx.lineTo(-e.r * 0.85, -e.r * 0.9);
    ctx.lineTo(-e.r * 0.35, 0);
    ctx.lineTo(-e.r * 0.85, e.r * 0.9);
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2; ctx.stroke();
  } else if (e.shape === 'sq') {
    ctx.rotate(e.aim + Math.PI / 4);
    const s = e.r * 0.92;
    ctx.fillStyle = baseCol;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.rotate(-(e.aim + Math.PI / 4));
    ctx.fillStyle = 'rgba(20,10,0,0.7)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.35, 0, TAU); ctx.fill();
  } else if (e.shape === 'hex') {
    /* 身体朝向：战斗/警觉时前角锁定目标（不再自转），待机时才慢转当待机动作 */
    ctx.rotate(e.hexAim);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = e.burn > 0.05 ? '#fff' : 'rgba(255,220,255,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, TAU); ctx.fill();
  } else if (e.shape === 'dia') {
    /* 狙击兵：细长的菱形，正面一条窄边，像一支压低的箭头 */
    ctx.rotate(e.aim);
    const wob = 1 + Math.sin(e.walkPhase * 1.4) * 0.05;
    ctx.beginPath();
    ctx.moveTo(e.r * 1.2 * wob, 0);
    ctx.lineTo(0, -e.r * 0.78);
    ctx.lineTo(-e.r * 0.95, 0);
    ctx.lineTo(0, e.r * 0.78);
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2; ctx.stroke();
    ctx.rotate(-e.aim);
    ctx.fillStyle = 'rgba(8,30,36,0.72)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.34, 0, TAU); ctx.fill();
  } else if (e.shape === 'roc') {
    /* 火箭筒兵：圆滚滚的重甲身板，半圈装甲片朝着行进方向 */
    ctx.rotate(e.aim);
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.95, 0, TAU);
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(30,46,18,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.56, -0.55, 1.95);
    ctx.closePath(); ctx.fill();
    ctx.rotate(-e.aim);
  } else if (e.shape === 'flm') {
    /* 喷火兵：圆角方箱 + 背上两支燃料罐，最敦实的一个 */
    ctx.rotate(e.aim);
    const fs = e.r * 0.84;
    drawRoundRect(-fs * 0.92, -fs, fs * 1.84, fs * 2, fs * 0.42);
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();
    ctx.rotate(-e.aim);
    ctx.fillStyle = 'rgba(46,24,0,0.7)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, TAU); ctx.fill();
  } else if (e.shape === 'cry') {
    /* 冰冻军团：正六边形冰晶，六个角各伸出一根短冰棱，蓄冰时整体发亮 */
    ctx.rotate(e.aim);
    const charge = e.iceLoad > 0 ? 1 - e.iceLoad / ENEMY_TYPES.cryo.ice.load : 0;
    const glowA = 0.25 + charge * 0.55;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 - Math.PI / 2;
      const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2.5; ctx.stroke();

    // 六根冰棱
    ctx.strokeStyle = 'rgba(210,244,255,' + glowA + ')';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.r * 0.92, Math.sin(a) * e.r * 0.92);
      ctx.lineTo(Math.cos(a) * e.r * (1.16 + charge * 0.12), Math.sin(a) * e.r * (1.16 + charge * 0.12));
      ctx.stroke();
    }

    ctx.rotate(-e.aim);
    ctx.fillStyle = 'rgba(8,32,52,0.78)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(220,248,255,' + (0.5 + charge * 0.45) + ')';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.2, 0, TAU); ctx.fill();
  } else if (e.shape === 'cryt') {
    /* 冰冻军团·投掷兵：棱面稍钝的八边形，背上插一排霜瓶 */
    ctx.rotate(e.aim);
    const pw = 0.88 + Math.sin(e.walkPhase * 1.3) * 0.04;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 - Math.PI / 2;
      const px = Math.cos(a) * e.r * pw, py = Math.sin(a) * e.r * pw;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2.4; ctx.stroke();

    for (let i = 0; i < 3; i++) {
      const by = -e.r * 0.62 + i * e.r * 0.62;
      ctx.fillStyle = 'rgba(226,248,255,0.9)';
      drawRoundRect(-e.r * 1.02, by - 3.2, e.r * 0.46, 6.4, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(79,184,234,0.95)';
      ctx.lineWidth = 1.1;
      drawRoundRect(-e.r * 1.02, by - 3.2, e.r * 0.46, 6.4, 3);
      ctx.stroke();
    }
    ctx.rotate(-e.aim);
    ctx.fillStyle = 'rgba(8,32,52,0.78)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(220,248,255,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.16, 0, TAU); ctx.fill();
  } else if (e.shape === 'crys') {
    /* 冰冻军团·喷射兵：最敦实的一个，厚圆角箱体 + 侧面两罐冷媒 */
    ctx.rotate(e.aim);
    const ss = e.r * 0.84;
    drawRoundRect(-ss, -ss * 0.96, ss * 2, ss * 1.92, ss * 0.46);
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();
    ctx.rotate(-e.aim);
    ctx.fillStyle = 'rgba(8,40,60,0.66)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, TAU); ctx.fill();
    ctx.rotate(e.aim);
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = 'rgba(120,205,245,0.55)';
      drawRoundRect(-ss * 1.18, (i ? 1 : -1) * ss * 0.34 - 5, ss * 0.4, 10, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,245,255,0.6)';
      ctx.lineWidth = 1.1;
      drawRoundRect(-ss * 1.18, (i ? 1 : -1) * ss * 0.34 - 5, ss * 0.4, 10, 4);
      ctx.stroke();
    }
    ctx.rotate(-e.aim);
  } else if (e.shape === 'grd') {
    /* 手雷兵：方身板 + 斜挎的弹带，背后鼓着一个装雷的包 */
    ctx.rotate(e.aim);
    const gs = e.r * 0.86;
    drawRoundRect(-gs * 0.95, -gs, gs * 1.9, gs * 2, gs * 0.3);
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2.5; ctx.stroke();

    // 弹带：一条斜线 + 三颗雷的轮廓
    ctx.strokeStyle = 'rgba(60,32,0,0.55)';
    ctx.lineWidth = gs * 0.42;
    ctx.beginPath();
    ctx.moveTo(-gs * 0.7, -gs * 0.75);
    ctx.lineTo(gs * 0.55, gs * 0.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,190,90,0.85)';
    for (let i = 0; i < 3; i++) {
      const k = 0.15 + i * 0.3;
      ctx.beginPath();
      ctx.arc(-gs * 0.7 + gs * 1.25 * k, -gs * 0.75 + gs * 1.6 * k, gs * 0.16, 0, TAU);
      ctx.fill();
    }
    ctx.rotate(-e.aim);
  } else if (e.shape === 'boss') {
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    ctx.rotate(t * 0.35);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      const rr = e.r * (i % 2 === 0 ? 1 : 0.62) * pulse;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.stroke();

    const pr = e.r * 0.3 * (1 + Math.sin(t * 6) * 0.15);
    const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, pr);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.5, '#ffd0d8');
    cg.addColorStop(1, 'rgba(255,45,85,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();

    /* ── 重机枪：机匣 + 三根枪管，开火时后坐抖动、枪管烧红 ── */
    ctx.rotate(e.aim - t * 0.35);
    const kick = e.hmgBurst > 0 ? Math.sin(t * 62) * 2.4 : (e.hmgSpin > 0 ? Math.sin(t * 40) * 0.7 : 0);
    const heat = e.hmgHeat;
    const bx = e.r * 0.84 - kick;

    ctx.fillStyle = '#2a1620';
    drawRoundRect(e.r * 0.34, -9, e.r * 0.54, 18, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,150,0.35)';
    ctx.lineWidth = 1.5;
    drawRoundRect(e.r * 0.34, -9, e.r * 0.54, 18, 3);
    ctx.stroke();

    ctx.fillStyle = heat > 0.1
      ? 'rgb(' + Math.round(118 + heat * 137) + ',' + Math.round(58 + heat * 76) + ',' + Math.round(48 + heat * 34) + ')'
      : '#4a3040';
    ctx.fillRect(bx, -6.6, e.r * 0.62, 4.2);
    ctx.fillRect(bx + 2, -1.8, e.r * 0.68, 3.6);
    ctx.fillRect(bx, 2.8, e.r * 0.6, 4.2);

    ctx.fillStyle = '#1d1018';
    ctx.fillRect(bx + e.r * 0.58, -7.8, 6, 15.6);

    if (heat > 0.02) {
      const glowR = 9 + heat * 13;
      const mg = ctx.createRadialGradient(e.r * 1.5, 0, 1, e.r * 1.5, 0, glowR);
      mg.addColorStop(0, 'rgba(255,220,150,' + (0.6 * heat) + ')');
      mg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(e.r * 1.5, 0, glowR, 0, TAU); ctx.fill();
    }
  } else if (e.shape === 'dir') {
    /* ── 安全总监：金棱甲、M700 长枪管、肩部天线；锁定时枪口亮起 ── */
    ctx.rotate(e.aim);

    // 肩部天线
    ctx.strokeStyle = 'rgba(255,176,46,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-e.r * 0.2, -e.r * 0.7); ctx.lineTo(-e.r * 0.55, -e.r * 1.25); ctx.stroke();
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.arc(-e.r * 0.55, -e.r * 1.25, 2.6, 0, TAU); ctx.fill();

    // M700 长枪管（装填/连发时后坐）
    const kick = (e.dirN > 0) ? Math.sin(t * 70) * 2.6 : 0;
    ctx.fillStyle = '#241708';
    ctx.fillRect(e.r * 0.2, -3.4, e.r * 1.5 - kick, 6.8);
    ctx.fillStyle = '#0e0903';
    ctx.fillRect(e.r * 1.62 - kick, -4.4, 7, 8.8);
    ctx.fillStyle = '#3a2a12';
    drawRoundRect(e.r * 0.05, -7, e.r * 0.55, 14, 3); ctx.fill();
    // 枪口锁定亮光
    if (e.snipeCharge > 0 || e.dirN > 0) {
      const lr = 6 + Math.sin(t * 24) * 2.5;
      const lg = ctx.createRadialGradient(e.r * 1.7 - kick, 0, 0, e.r * 1.7 - kick, 0, lr * 3);
      lg.addColorStop(0, 'rgba(255,220,140,0.85)');
      lg.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(e.r * 1.7 - kick, 0, lr * 3, 0, TAU); ctx.fill();
    }

    // 主体：八棱金甲
    ctx.rotate(-e.aim);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + 0.39;
      const rr = e.r * (i % 2 === 0 ? 1 : 0.7);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 3; ctx.stroke();

    // 金色核心 + 红色目镜条
    const dcg = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r * 0.5);
    dcg.addColorStop(0, '#fff3d0');
    dcg.addColorStop(0.55, '#ffb02e');
    dcg.addColorStop(1, 'rgba(255,122,31,0)');
    ctx.fillStyle = dcg;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(e.aim);
    ctx.fillStyle = '#ff2d2d';
    drawRoundRect(e.r * 0.3, -3.2, e.r * 0.62, 6.4, 2); ctx.fill();
    ctx.restore();
  } else if (e.shape === 'esc') {
    /* ── 无人作战小车：履带底盘 + 机枪塔 + 炮管；自爆时红灯狂闪 ── */
    const sdir = G.enemies.find(o => o.type === 'director' && o.alive);
    const alarm = e.sdT > 0;
    const lamp = alarm
      ? (Math.sin(t * 26) > 0 ? 1 : 0.15)
      : (0.5 + Math.sin(t * 4) * 0.5);

    // 履带
    ctx.fillStyle = '#151a20';
    drawRoundRect(-e.r, -e.r * 0.95, e.r * 2, e.r * 0.5, 4); ctx.fill();
    drawRoundRect(-e.r, e.r * 0.45, e.r * 2, e.r * 0.5, 4); ctx.fill();
    ctx.fillStyle = 'rgba(150,165,180,0.35)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-e.r * 0.85 + i * e.r * 0.44, -e.r * 0.9, 3, e.r * 0.4);
      ctx.fillRect(-e.r * 0.85 + i * e.r * 0.44, e.r * 0.5, 3, e.r * 0.4);
    }

    // 车体
    ctx.rotate(e.aim);
    ctx.fillStyle = baseCol;
    drawRoundRect(-e.r * 0.9, -e.r * 0.62, e.r * 1.8, e.r * 1.24, 5); ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2; ctx.stroke();
    // 机枪塔 + 双枪管
    ctx.fillStyle = '#2a333d';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, TAU); ctx.fill();
    const ek = e.gatBurst > 0 ? Math.sin(t * 60) * 2 : 0;
    ctx.fillStyle = '#141a20';
    ctx.fillRect(e.r * 0.3 - ek, -4.4, e.r * 0.95, 3.4);
    ctx.fillRect(e.r * 0.3 - ek, 1.0, e.r * 0.95, 3.4);
    // 炮管（装填时口部发亮）
    ctx.fillStyle = '#39424d';
    ctx.fillRect(e.r * 0.1, -1.6, e.r * 1.35, 3.2);
    if (e.cannonLoad > 0) {
      ctx.fillStyle = 'rgba(255,214,107,' + (0.5 + Math.sin(t * 18) * 0.4) + ')';
      ctx.beginPath(); ctx.arc(e.r * 1.45, 0, 4.5, 0, TAU); ctx.fill();
    }
    // 状态灯
    ctx.fillStyle = alarm ? 'rgba(255,60,60,' + (0.4 + lamp * 0.6) + ')' : 'rgba(120,220,140,' + (0.35 + lamp * 0.5) + ')';
    ctx.beginPath(); ctx.arc(-e.r * 0.55, 0, 3.4, 0, TAU); ctx.fill();
    ctx.rotate(-e.aim);
  } else if (e.shape === 'seek') {
    /* ── 寻敌爆破小车：三轮小炸弹车，红灯呼吸；咬人后红灯狂闪 ── */
    const armed = e.fuseT > 0;
    const blink = armed ? (Math.sin(t * 34) > 0 ? 1 : 0.1) : (0.35 + Math.sin(t * 9) * 0.3);

    ctx.rotate(e.aim);
    // 轮子
    ctx.fillStyle = '#1a1015';
    ctx.beginPath(); ctx.arc(e.r * 0.55, -e.r * 0.8, e.r * 0.34, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r * 0.55, e.r * 0.8, e.r * 0.34, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-e.r * 0.75, 0, e.r * 0.38, 0, TAU); ctx.fill();
    // 车体（圆头楔形）
    ctx.beginPath();
    ctx.moveTo(e.r * 1.05, 0);
    ctx.quadraticCurveTo(e.r * 0.9, -e.r * 0.8, -e.r * 0.4, -e.r * 0.75);
    ctx.quadraticCurveTo(-e.r * 1.1, -e.r * 0.5, -e.r * 1.05, 0);
    ctx.quadraticCurveTo(-e.r * 1.1, e.r * 0.5, -e.r * 0.4, e.r * 0.75);
    ctx.quadraticCurveTo(e.r * 0.9, e.r * 0.8, e.r * 1.05, 0);
    ctx.closePath();
    ctx.fillStyle = baseCol; ctx.fill();
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2; ctx.stroke();
    // 炸药包纹理
    ctx.strokeStyle = 'rgba(20,8,10,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-e.r * 0.5, -e.r * 0.55); ctx.lineTo(-e.r * 0.5, e.r * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.r * 0.15, -e.r * 0.65); ctx.lineTo(e.r * 0.15, e.r * 0.65); ctx.stroke();
    // 警告灯
    const sg = ctx.createRadialGradient(-e.r * 0.1, 0, 0, -e.r * 0.1, 0, e.r * 0.9);
    sg.addColorStop(0, 'rgba(255,70,50,' + (0.5 + blink * 0.5) + ')');
    sg.addColorStop(1, 'rgba(255,70,50,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(-e.r * 0.1, 0, e.r * 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,90,70,' + (0.55 + blink * 0.45) + ')';
    ctx.beginPath(); ctx.arc(-e.r * 0.1, 0, 3, 0, TAU); ctx.fill();
    ctx.rotate(-e.aim);
  }

  /* ── 阿萨拉盾兵：一手短枪、一手厚盾；盾面朝前挡子弹，血越少裂纹越多 ── */
  if (e.maxShield > 0) {
    const arc = ENEMY_TYPES.shooter.shieldArc;
    const ratio = e.shield / e.maxShield;
    const rad = e.r + 6.5;

    // 枪先画：短枪管从盾后探出一点，盾牌再压上去
    ctx.save();
    ctx.rotate(e.aim);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(e.r * 0.42, -2.2, e.r * 0.6, 4.4);
    ctx.fillStyle = '#120a06';
    ctx.fillRect(e.r * 0.98, -3.2, 4, 6.4);
    ctx.restore();

    ctx.save();
    ctx.rotate(e.shieldAim);

    // 持盾的手臂：把盾牌和身体连起来，不然看着像浮在旁边的弧
    ctx.fillStyle = 'rgba(122,84,40,0.85)';
    ctx.fillRect(e.r * 0.3, -1.4, rad - e.r * 0.3, 2.8);

    if (e.shield <= 0) {
      // 碎盾：只剩两侧残缺的把手
      ctx.strokeStyle = 'rgba(150,110,70,0.5)';
      ctx.lineWidth = 3;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(0, 0, rad - 2, sgn > 0 ? arc * 0.62 : -arc, sgn > 0 ? arc : -arc * 0.62);
        ctx.stroke();
      }
    } else {
      ctx.lineCap = 'butt';
      ctx.lineWidth = 6.5;
      const sg = ctx.createLinearGradient(-rad, 0, rad, 0);
      sg.addColorStop(0, '#6b4a22');
      sg.addColorStop(0.45, '#c9a35e');
      sg.addColorStop(1, '#8a6630');
      ctx.strokeStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, rad, -arc, arc); ctx.stroke();

      // 边条高光 / 受击闪白
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = e.shieldFlash > 0.05
        ? 'rgba(255,255,255,' + (0.35 + e.shieldFlash * 0.6) + ')'
        : 'rgba(255,236,190,0.45)';
      ctx.beginPath(); ctx.arc(0, 0, rad + 2.5, -arc * 0.94, arc * 0.94); ctx.stroke();

      // 裂纹：掉血越多越明显
      if (ratio < 0.75) {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(40,22,8,' + (0.35 + (1 - ratio) * 0.5) + ')';
        const cracks = ratio < 0.35 ? 4 : (ratio < 0.6 ? 3 : 2);
        for (let k = 0; k < cracks; k++) {
          const a0 = -arc * 0.72 + (k + 0.5) * (arc * 1.44 / cracks);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a0) * (rad - 3), Math.sin(a0) * (rad - 3));
          ctx.lineTo(Math.cos(a0 + 0.16) * rad, Math.sin(a0 + 0.16) * rad);
          ctx.lineTo(Math.cos(a0 + 0.05) * (rad + 3), Math.sin(a0 + 0.05) * (rad + 3));
          ctx.stroke();
        }
      }
      ctx.lineCap = 'round';
    }
    ctx.restore();
  }

  /* ── 阿萨拉机枪兵：一挺多管加特林，枪管随开火转动、高温发红 ── */
  if (e.type === 'brute') {
    ctx.save();
    ctx.rotate(e.aim);
    const kick = e.gatBurst > 0 ? Math.sin(t * 70) * 2.2 : (e.gatSpin > 0 ? Math.sin(t * 44) * 0.6 : 0);
    const heat = e.gatHeat;
    const bl = e.r * 1.12;

    // 弹鼓：缩在机匣下方，别飘到身体外面去
    ctx.fillStyle = '#241232';
    drawRoundRect(-e.r * 0.18, e.r * 0.2, e.r * 0.72, e.r * 0.5, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,150,255,0.3)';
    ctx.lineWidth = 1.4;
    drawRoundRect(-e.r * 0.18, e.r * 0.2, e.r * 0.72, e.r * 0.5, 4);
    ctx.stroke();

    // 机匣
    ctx.fillStyle = '#2a1638';
    drawRoundRect(e.r * 0.28 - kick, -8, e.r * 0.42, 16, 3);
    ctx.fill();

    // 枪管托架：深色衬底，让三根管子之间留出缝隙
    ctx.fillStyle = '#1a0f24';
    ctx.fillRect(e.r * 0.45 - kick, -6.4, bl, 12.8);

    // 三根枪管绕轴旋转
    const tubeCol = heat > 0.08
      ? 'rgb(' + Math.round(110 + heat * 145) + ',' + Math.round(60 + heat * 80) + ',' + Math.round(60 + heat * 40) + ')'
      : '#6b4a86';
    for (let k = 0; k < 3; k++) {
      const ph = e.gatPhase + k * TAU / 3;
      const oy = Math.sin(ph) * 4.1;
      const sc = 0.6 + 0.4 * Math.abs(Math.cos(ph));
      ctx.fillStyle = tubeCol;
      ctx.fillRect(e.r * 0.45 - kick, oy - 1.6 * sc, bl, 3.2 * sc);
    }

    // 枪口：一圈集束环
    const tipX = e.r * 0.45 + bl - kick;
    ctx.fillStyle = '#120a18';
    ctx.beginPath(); ctx.arc(tipX, 0, 5.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = heat > 0.08 ? tubeCol : 'rgba(160,120,205,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(tipX, 0, 5.4, 0, TAU); ctx.stroke();

    if (heat > 0.02) {
      const gx = e.r * 0.45 + bl;
      const glowR = 8 + heat * 12;
      const mg = ctx.createRadialGradient(gx, 0, 1, gx, 0, glowR);
      mg.addColorStop(0, 'rgba(255,220,150,' + (0.55 * heat) + ')');
      mg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(gx, 0, glowR, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ── 阿萨拉狙击兵：细长枪管 + 瞄准镜 + 两脚架，锁定中镜头亮起 ── */
  if (e.type === 'sniper') {
    ctx.save();
    ctx.rotate(e.aim);
    const bl = e.r * 2.4;

    ctx.fillStyle = '#123038';
    ctx.fillRect(e.r * 0.3, -2.2, bl, 4.4);
    ctx.fillStyle = '#08181d';
    ctx.fillRect(e.r * 0.3 + bl - 6, -3.8, 6, 7.6);
    ctx.fillStyle = '#0c2228';
    drawRoundRect(e.r * 0.5, -7.4, e.r * 0.85, 5, 2);
    ctx.fill();
    ctx.fillStyle = e.snipeCharge > 0 ? '#8ff6ff' : 'rgba(96,186,206,0.55)';
    ctx.beginPath(); ctx.arc(e.r * 1.35, -4.9, 2.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,190,205,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(e.r * 0.7, 0); ctx.lineTo(e.r * 1.05, -e.r * 0.52);
    ctx.moveTo(e.r * 0.7, 0); ctx.lineTo(e.r * 1.05, e.r * 0.52);
    ctx.stroke();
    ctx.restore();
  }

  /* ── 阿萨拉火箭筒兵：肩上一根粗筒，装填完成时弹头探出来 ── */
  if (e.type === 'rocket') {
    ctx.save();
    ctx.rotate(e.aim);
    const loaded = e.loadT > 0;

    ctx.fillStyle = '#1c2a12';
    drawRoundRect(-e.r * 0.55, -e.r * 0.42 - 3, e.r * 2.05, e.r * 0.84 + 6, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,120,0.32)';
    ctx.lineWidth = 1.2;
    drawRoundRect(-e.r * 0.55, -e.r * 0.42 - 3, e.r * 2.05, e.r * 0.84 + 6, 5);
    ctx.stroke();

    ctx.fillStyle = '#0f1a0a';
    ctx.fillRect(-e.r * 0.55 - 5, -e.r * 0.26, 6, e.r * 0.52);

    if (loaded) {
      const px = e.r * 1.5 + 9;
      ctx.fillStyle = '#8ad34a';
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px - 9, -4.8);
      ctx.lineTo(px - 9, 4.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,90,60,' + (0.45 + Math.sin(G.time * 22) * 0.3) + ')';
      ctx.beginPath(); ctx.arc(e.r * 1.12, 0, 2.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ── 阿萨拉喷火兵：背上两支燃料罐 + 长喷管 + 长明火 ── */
  if (e.type === 'flamer') {
    ctx.save();
    ctx.rotate(e.aim);

    ctx.fillStyle = '#3a2a08';
    drawRoundRect(-e.r * 1.02, -e.r * 0.64, e.r * 0.58, e.r * 0.5, 4);
    ctx.fill();
    drawRoundRect(-e.r * 1.02, e.r * 0.14, e.r * 0.58, e.r * 0.5, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,74,0.35)';
    ctx.lineWidth = 1.2;
    drawRoundRect(-e.r * 1.02, -e.r * 0.64, e.r * 0.58, e.r * 0.5, 4);
    ctx.stroke();
    drawRoundRect(-e.r * 1.02, e.r * 0.14, e.r * 0.58, e.r * 0.5, 4);
    ctx.stroke();

    ctx.fillStyle = '#2b2410';
    ctx.fillRect(e.r * 0.45, -2.8, e.r * 0.95, 5.6);
    ctx.fillStyle = '#140f04';
    ctx.fillRect(e.r * 1.3, -4.2, 5.5, 8.4);

    const lit = e.flameT > 0 ? 1 : 0.42;
    const gr = 8 + lit * 9 + Math.sin(G.time * 28) * 1.6;
    const fgl = ctx.createRadialGradient(e.r * 1.48, 0, 0, e.r * 1.48, 0, gr);
    fgl.addColorStop(0, 'rgba(255,252,225,' + (0.85 * lit) + ')');
    fgl.addColorStop(0.35, 'rgba(255,180,70,' + (0.7 * lit) + ')');
    fgl.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = fgl;
    ctx.beginPath(); ctx.arc(e.r * 1.48, 0, gr, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /* ── 阿萨拉冰冻军团：一根粗冷冻管，管口挂着白雾，蓄冰时结霜 ── */
  if (e.type === 'cryo') {
    ctx.save();
    ctx.rotate(e.aim);
    const charge = e.iceLoad > 0 ? 1 - e.iceLoad / ENEMY_TYPES.cryo.ice.load : 0;

    // 背后的冷媒罐
    ctx.fillStyle = '#123244';
    drawRoundRect(-e.r * 1.1, -e.r * 0.5, e.r * 0.5, e.r * 1.0, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,212,255,0.4)';
    ctx.lineWidth = 1.2;
    drawRoundRect(-e.r * 1.1, -e.r * 0.5, e.r * 0.5, e.r * 1.0, 3);
    ctx.stroke();

    // 投射管
    ctx.fillStyle = '#1b3d52';
    drawRoundRect(e.r * 0.35, -4.6, e.r * 1.05, 9.2, 3);
    ctx.fill();
    ctx.fillStyle = '#0a1e2a';
    drawRoundRect(e.r * 1.3, -6.4, 8, 12.8, 2);
    ctx.fill();

    // 管口冷雾
    const fg = ctx.createRadialGradient(e.r * 1.42 + 4, 0, 0, e.r * 1.42 + 4, 0, 12 + charge * 12);
    fg.addColorStop(0, 'rgba(235,250,255,' + (0.55 + charge * 0.4) + ')');
    fg.addColorStop(0.45, 'rgba(127,212,255,' + (0.35 + charge * 0.35) + ')');
    fg.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(e.r * 1.42 + 4, 0, 12 + charge * 12, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ── 冰冻军团·投掷兵：手里攥着一支霜瓶，冷却好了会亮起来 ── */
  if (e.type === 'cryoT') {
    ctx.save();
    ctx.rotate(e.aim);
    const ready = e.potCd <= 0.4;
    const k = ready ? 1 : 0.5;
    const hx = e.r * 1.02, hy = -e.r * 0.44;
    ctx.strokeStyle = '#1d4a63';
    ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.moveTo(e.r * 0.42, 0); ctx.lineTo(hx, hy); ctx.stroke();

    ctx.fillStyle = ready ? 'rgba(236,252,255,0.96)' : 'rgba(176,228,250,0.72)';
    drawRoundRect(hx - 4.2, hy - 6.4, 8.4, 12.8, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,212,255,0.95)';
    ctx.lineWidth = 1.3;
    drawRoundRect(hx - 4.2, hy - 6.4, 8.4, 12.8, 4);
    ctx.stroke();

    const fg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 13);
    fg.addColorStop(0, 'rgba(206,246,255,' + (0.5 * k) + ')');
    fg.addColorStop(1, 'rgba(90,190,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(hx, hy, 13, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ── 冰冻军团·喷射兵：一根粗冷雾管，管口挂着一团白气 ── */
  if (e.type === 'cryoS') {
    ctx.save();
    ctx.rotate(e.aim);
    const lit = e.sprayT > 0 ? 1 : 0.34;
    ctx.fillStyle = '#16394d';
    drawRoundRect(e.r * 0.42, -5.4, e.r * 1.0, 10.8, 3);
    ctx.fill();
    ctx.fillStyle = '#08202c';
    drawRoundRect(e.r * 1.34, -7.6, 8, 15.2, 2.6);
    ctx.fill();

    const mr = 9 + lit * 12 + Math.sin(G.time * 24) * 2;
    const mg = ctx.createRadialGradient(e.r * 1.5, 0, 0, e.r * 1.5, 0, mr);
    mg.addColorStop(0, 'rgba(244,254,255,' + (0.82 * lit) + ')');
    mg.addColorStop(0.42, 'rgba(160,225,255,' + (0.55 * lit) + ')');
    mg.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(e.r * 1.5, 0, mr, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ── 阿萨拉手雷兵：一只手举着雷，冷却好了就抖一下表示要扔 ── */
  if (e.type === 'nader') {
    ctx.save();
    ctx.rotate(e.aim);
    const ready = e.throwCd <= 0.35;
    const hx = e.r * 1.1, hy = -e.r * 0.34;
    ctx.strokeStyle = '#7a4a12';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(e.r * 0.5, 0); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = ready ? '#ffd66b' : '#8a6a3a';
    ctx.beginPath(); ctx.arc(hx, hy, 4.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,6,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(hx, hy, 4.6, 0, TAU); ctx.stroke();
    if (ready) {
      ctx.fillStyle = 'rgba(255,90,60,' + (0.5 + Math.sin(G.time * 18) * 0.35) + ')';
      ctx.beginPath(); ctx.arc(hx, hy - 5, 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ── 挥击刀光：从扇区一侧扫到另一侧，命中是白刃、落空是虚影 ── */
  if (e.meleeSwing > 0) {
    const MS = meleeOf(e);
    const k = clamp(1 - e.meleeSwing / 0.26, 0, 1);           // 0 → 1 扫过
    const a0 = e.meleeAim - MS.arc;
    const a1 = e.meleeAim - MS.arc + 2 * MS.arc * Math.min(1, k * 1.4);
    const ar = e.r + MS.reach * 0.95;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = e.meleeHit > 0
      ? 'rgba(255,255,255,' + (0.9 * (1 - k * 0.55)) + ')'
      : 'rgba(255,150,170,' + (0.5 * (1 - k * 0.6)) + ')';
    ctx.lineWidth = (e.meleeHit > 0 ? 5.5 : 3.5) * (1 - k * 0.4);
    ctx.beginPath(); ctx.arc(0, 0, ar, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    if (e.meleeHit > 0) {
      ctx.strokeStyle = 'rgba(255,90,120,' + (0.5 * e.meleeHit) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, ar + 5, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }
  ctx.restore();

  // ── 警觉标记：? 正在发现 / ! 已锁定
  const topY = e.y - e.r - 16;
  if (e.state === 'combat') {
    const pulse = 0.75 + Math.sin(t * 12) * 0.25;
    ctx.globalAlpha = pulse;
    ctx.font = '900 20px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText('!', e.x, topY);
    ctx.fillStyle = '#ff3b5c';
    ctx.fillText('!', e.x, topY);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  } else if (e.state === 'alert' || e.alertMeter > 0.04) {
    ctx.font = '900 18px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(e.state === 'alert' ? '!' : '?', e.x, topY);
    ctx.fillStyle = e.state === 'alert'
      ? '#ffb347'
      : 'rgba(255,236,180,' + (0.5 + e.alertMeter * 0.5) + ')';
    ctx.fillText(e.state === 'alert' ? '!' : '?', e.x, topY);
    ctx.textAlign = 'left';

    // 发现进度环
    if (e.state !== 'alert' && e.alertMeter > 0.04) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffd66b';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * e.alertMeter);
      ctx.stroke();
    }
  }

  // 盾牌血条：挂在血条正下方那条细的金色条（避开顶上的「!」，不然会被字压住）
  if (e.maxShield > 0 && e.shield > 0) {
    const w = Math.max(26, e.r * 2);
    const y = e.y - e.r - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, y, w, 3);
    const sr = clamp(e.shield / e.maxShield, 0, 1);
    ctx.fillStyle = sr > 0.45 ? '#ffcf6b' : '#ff9a3a';
    ctx.fillRect(e.x - w / 2, y, w * sr, 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(e.x - w / 2, y, w, 3);
  }

  /* 血条：有甲时即使满血也画 —— 外圈那道边就是甲级，颜色越亮甲越硬 */
  if (e.hp < e.maxHp || (e.armorMax > 0 && e.armorHp > 0)) {
    const w = Math.max(26, e.r * 2);
    const h = e.type === 'boss' ? 6 : 4;
    const y = e.y - e.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(e.x - w / 2, y, w, h);
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = ratio > 0.5 ? '#46e08a' : (ratio > 0.22 ? '#ffd66b' : '#ff4060');
    ctx.fillRect(e.x - w / 2, y, w * ratio, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(e.x - w / 2, y, w, h);

    /* 蛊的流荧集群：被压掉的那一截上限画成暗紫，右边缘一道绿刻线 */
    if ((e.capMul || 1) < 0.995) {
      const cw = w * clamp(e.capMul, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(24,12,34,0.88)';
      ctx.fillRect(e.x - w / 2 + cw, y, w - cw, h);
      ctx.strokeStyle = '#c8f57a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(e.x - w / 2 + cw, y - 1);
      ctx.lineTo(e.x - w / 2 + cw, y + h + 1);
      ctx.stroke();
      ctx.restore();
    }

    if (e.armorMax > 0 && e.armorHp > 0) {
      const ar = clamp(e.armorHp / e.armorMax, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + ar * 0.65;
      ctx.strokeStyle = ARMOR_LV_COLOR[e.armorLv] || '#8fb6d0';
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x - w / 2 - 1, y - 1, w + 2, h + 2);
      if (e.armorFlash > 0.05) {
        ctx.globalAlpha = e.armorFlash * 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(e.x - w / 2 - 1, y - 1, w + 2, h + 2);
      }
      ctx.restore();
    }
  }

  /* ── 三头犬的两件"礼物"：头顶转三颗星是眩晕，脚下一道折线是骨折 ── */
  if (e.stun > 0) {
    const k = clamp(e.stun / SKILL.gl.stun, 0, 1);
    ctx.save();
    ctx.translate(e.x, e.y - e.r - 26);
    for (let i = 0; i < 3; i++) {
      const a = G.time * 6 + i * TAU / 3;
      const sx = Math.cos(a) * 12, sy = Math.sin(a) * 3.4 - 3;
      ctx.globalAlpha = 0.3 + k * 0.65;
      ctx.fillStyle = '#ffd66b';
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const aa = -Math.PI / 2 + j * TAU / 5;
        const rr = j % 2 ? 2 : 4.2;
        const px = sx + Math.cos(aa) * rr, py = sy + Math.sin(aa) * rr;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* 虎蹲炮把人掀翻：脚下一圈气浪残影 + 剩余倒地秒数 */
  if (e.kd > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.22 * Math.sin(G.time * 9);
    ctx.strokeStyle = '#8fe0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.4, e.r * 0.55, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#8fe0ff';
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('击倒 ' + e.kd.toFixed(1) + 's', e.x, e.y + e.r + 24);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  if (e.cripple > 0) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ff8a3a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(e.x - 7, e.y + e.r + 6);    ctx.lineTo(e.x - 2.5, e.y + e.r + 2);
    ctx.lineTo(e.x + 1.5, e.y + e.r + 7);
    ctx.lineTo(e.x + 6, e.y + e.r + 3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* 被闪光弹晃到：头顶一圈转着的白星 */
  if (e.blind > 0) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) {
      const a = G.time * 5 + i * 2.09;
      const sx = e.x + Math.cos(a) * (e.r + 5);
      const sy = e.y - e.r - 6 + Math.sin(a) * 3.4;
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, TAU); ctx.fill();
    }
    ctx.font = '700 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('致盲 ' + e.blind.toFixed(1), e.x, e.y - e.r - 16);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /* 流血：身下渗出来的红点 */
  if (e.bleedN > 0) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#c21030';
    for (let i = 0; i < Math.min(3, e.bleedN); i++) {
      ctx.beginPath();
      ctx.ellipse(e.x + (i - 1) * 6, e.y + e.r * 0.7, 2.6, 1.6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 重伤：身上一圈淡红的「包扎慢」标记（打药 / 起身都被拖住） */
  if (e.trauma > 0 && e.bandaging) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ff8fa3';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - clamp(e.bandageT / (SKILL.trauma.bandageTime * SKILL.trauma.careMul), 0, 1)));
    ctx.stroke();
    ctx.font = '700 9px ui-monospace, monospace';
    ctx.fillStyle = '#ffb0bd';
    ctx.textAlign = 'center';
    ctx.fillText('重伤包扎 ' + Math.max(0, e.bandageT).toFixed(1) + 's', e.x, e.y - e.r - 16);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

function drawBullets() {
  for (const b of G.bullets) {
    const len = b.tracer ? b.tracer : (b.heavy ? 46 : (b.hostile ? 14 : 22));
    const ang = Math.atan2(b.vy, b.vx);
    const tx = b.x - Math.cos(ang) * len;
    const ty = b.y - Math.sin(ang) * len;

    // 重机枪弹：先铺一层灼热光晕，远看也能认出是机枪弹幕
    if (b.heavy) {
      ctx.strokeStyle = 'rgba(255,164,72,0.16)';
      ctx.lineWidth = b.r * 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
    grad.addColorStop(0, b.color + '00');
    grad.addColorStop(1, b.color);
    ctx.strokeStyle = grad;
    ctx.lineWidth = b.r * 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();

    ctx.fillStyle = b.hostile ? '#ffdde3' : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = b.color + '44';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.1, 0, TAU); ctx.fill();
  }
  ctx.lineCap = 'butt';
}

/* 所有正在喷火的喷火兵，统一在最上层画火舌 */
function drawFlameCones() {
  for (const e of G.enemies) {
    if (e.type === 'flamer') drawFlameCone(e);
    else if (e.type === 'cryoS') drawSprayCone(e);
  }
}

/* 敌方火箭：弹体 + 尾焰 + 光晕，远看也能看清它朝哪飞 */
function drawRockets() {
  for (const rk of G.rockets) {
    const t = G.time;
    const fl = 0.75 + Math.sin(t * 46 + rk.x * 0.02) * 0.25;

    ctx.save();
    ctx.translate(rk.x, rk.y);
    ctx.rotate(rk.a);

    // 尾焰
    const fg = ctx.createLinearGradient(-34 * fl, 0, -4, 0);
    fg.addColorStop(0, 'rgba(255,110,40,0)');
    fg.addColorStop(0.55, 'rgba(255,150,60,0.55)');
    fg.addColorStop(1, 'rgba(255,240,190,0.95)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-34 * fl - 6, 0);
    ctx.lineTo(-4, -5.2);
    ctx.lineTo(-4, 5.2);
    ctx.closePath();
    ctx.fill();

    // 弹体
    ctx.fillStyle = '#22301a';
    drawRoundRect(-12, -5, 22, 10, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,240,140,0.45)';
    ctx.lineWidth = 1.2;
    drawRoundRect(-12, -5, 22, 10, 4);
    ctx.stroke();

    // 弹头
    ctx.fillStyle = '#8ad34a';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(6, -4.4); ctx.lineTo(6, 4.4);
    ctx.closePath(); ctx.fill();

    // 尾翼
    ctx.fillStyle = '#3d5228';
    ctx.fillRect(-12, -8.4, 5, 3.4);
    ctx.fillRect(-12, 5, 5, 3.4);
    ctx.restore();

    const g = ctx.createRadialGradient(rk.x, rk.y, 2, rk.x, rk.y, 28);
    g.addColorStop(0, 'rgba(255,220,150,0.42)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(rk.x, rk.y, 28, 0, TAU); ctx.fill();
  }
}

/* 狙击兵的瞄准激光：画在迷雾之上，所以在黑暗里也能看到自己被点了名 */
function drawSniperBeams() {
  if (!G.enemies.length) return;
  const SN = ENEMY_TYPES.sniper.snipe;
  const DIR_SN = ENEMY_TYPES.director.snipe;
  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-G.cam.x, -G.cam.y);
  ctx.globalCompositeOperation = 'lighter';

  for (const e of G.enemies) {
    if (e.type !== 'sniper' && e.type !== 'director') continue;
    if (e.snipeCharge <= 0) continue;
    const isDir = e.type === 'director';
    const T = isDir ? DIR_SN : SN;
    const lasCol = isDir ? '255,205,110' : '120,246,255';
    const k = 1 - clamp(e.snipeCharge / T.charge, 0, 1);   // 0 → 1，越接近 1 越准
    const mx = e.x + Math.cos(e.aim) * (e.r + 12);
    const my = e.y + Math.sin(e.aim) * (e.r + 12);
    const tx = e.lastSeenX, ty = e.lastSeenY;
    const aimX = P.alive ? P.x : tx;
    const aimY = P.alive ? P.y : ty;

    const jitter = (1 - k) * 26;
    const jx = rand(-jitter, jitter), jy = rand(-jitter, jitter);

    // 主线
    const grad = ctx.createLinearGradient(mx, my, aimX + jx, aimY + jy);
    grad.addColorStop(0, 'rgba(' + lasCol + ',0)');
    grad.addColorStop(0.45, 'rgba(' + lasCol + ',' + (0.16 + k * 0.3) + ')');
    grad.addColorStop(1, 'rgba(220,255,255,' + (0.4 + k * 0.55) + ')');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.8 + k * 1.9;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(aimX + jx, aimY + jy); ctx.stroke();

    // 收紧的瞄准圈：圈缩完 = 开枪
    ctx.strokeStyle = 'rgba(' + lasCol + ',' + (0.18 + k * 0.5) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(aimX, aimY, 46 - 34 * k, -Math.PI / 2, -Math.PI / 2 + TAU * (0.25 + k * 0.75));
    ctx.stroke();

    // 光点
    const pr = 3 + k * 4;
    const pg = ctx.createRadialGradient(aimX, aimY, 0, aimX, aimY, pr * 3);
    pg.addColorStop(0, 'rgba(255,255,255,' + (0.55 + k * 0.45) + ')');
    pg.addColorStop(0.4, 'rgba(' + lasCol + ',' + (0.4 + k * 0.4) + ')');
    pg.addColorStop(1, 'rgba(' + lasCol + ',0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(aimX, aimY, pr * 3, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function drawNades() {
  for (const n of G.nades) {
    /* 落地前的预警圈：红圈 + 收缩的倒计时环，圈内也压一层淡红，
       告诉玩家「炸这里、还有多久」，躲不躲是玩家的事 */
    if (n.t >= n.dur) {
      const k = clamp(n.fuse / ENEMY_TYPES.nader.nad.fuse, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.16 + (1 - k) * 0.2;
      ctx.fillStyle = '#ff3a2a';
      ctx.beginPath(); ctx.arc(n.tx, n.ty, n.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff5a3a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(n.tx, n.ty, n.radius, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,220,120,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(n.tx, n.ty, n.radius * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
      ctx.restore();
    }

    const drawY = n.y - (n.h || 0);
    // 落影：飞在空中时影子留在落点附近，看得出「还在路上」
    if (n.h > 1) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(n.tx, n.ty + 4, 7, 4, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    const blink = n.fuse < 0.5 ? (Math.sin(G.time * 40) > 0 ? 1 : 0.3) : 1;
    ctx.save();
    ctx.translate(n.x, drawY);
    ctx.rotate(n.rot);
    ctx.fillStyle = '#2c3a2a';
    drawRoundRect(-6, -7, 12, 14, 3);
    ctx.fill();
    ctx.strokeStyle = '#7a8a6a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ff5533';
    ctx.beginPath(); ctx.arc(n.x, drawY - 9, 2.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}


/* 烟雾：一团会呼吸的灰白气，边缘是渐隐的，戴不住一个完美圆 */
/* ── 破片雷 / 燃烧弹：抛物线 + 引信闪红 ── */
function drawFrags() {
  for (const g of G.frags) {
    if (!fogVisibleAt(g.x, g.y)) continue;
    const h = g.h || 0;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(g.x, g.y + 6, 7, 4.5, 0, 0, TAU); ctx.fill();

    const bx = g.x, by = g.y - h;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(g.spin);
    ctx.fillStyle = g.fire ? '#ff7a2a' : '#5e6d61';
    ctx.strokeStyle = g.fire ? '#ffd66b' : '#bff3c9';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, -2); ctx.lineTo(3, 2);
    ctx.moveTo(-3, 2); ctx.lineTo(3, -2);
    ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();

    if (g.fire) {
      ctx.fillStyle = 'rgba(255,170,70,' + (0.45 + 0.4 * Math.sin(G.time * 22)) + ')';
      ctx.beginPath(); ctx.arc(bx, by, 9, 0, TAU); ctx.fill();
    } else if (g.st === 'fly' ? g.fuse < 2.2 : g.fuse < 2.2) {
      const blink = 0.35 + 0.65 * Math.abs(Math.sin(G.time * 16));
      ctx.fillStyle = 'rgba(255,72,72,' + blink + ')';
      ctx.beginPath(); ctx.arc(bx, by - 7, 2.6, 0, TAU); ctx.fill();
    }
  }
}

/* ── 脚印：两枚淡淡的鞋印，静默潜袭期间不再落下 ── */
function drawFootprints() {
  for (const f of G.footprints) {
    const k = 1 - f.t / f.life;
    if (k <= 0) continue;
    const a = clamp(k * 1.6, 0, 1) * 0.34;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    ctx.fillStyle = 'rgba(14,20,26,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(f.side * 3.2, 0, 3.4, 1.9, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/* ── 无名的闪光弹：飞行的小白罐 ── */
function drawFlashes() {
  for (const f of G.flashes) {
    if (!fogVisibleAt(f.x, f.y)) continue;
    const blink = f.bounced > 0 ? (Math.sin(G.time * 40) > 0 ? 1 : 0.35) : 0.9;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 5, 6.5, 3.8, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.spin);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 11);
    g.addColorStop(0, 'rgba(255,255,255,' + blink + ')');
    g.addColorStop(0.5, 'rgba(220,212,255,0.75)');
    g.addColorStop(1, 'rgba(160,140,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4f2ff';
    ctx.strokeStyle = '#b9adff';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

/* ── 旋刃飞行器：旋转的刃盘 + 拖尾 ── */
function drawBlades() {
  for (const s of G.blades) {
    if (!fogVisibleAt(s.x, s.y)) continue;
    ctx.save();
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 15);
    g.addColorStop(0, 'rgba(201,192,255,0.9)');
    g.addColorStop(0.55, 'rgba(143,123,255,0.4)');
    g.addColorStop(1, 'rgba(106,76,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, TAU); ctx.fill();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.spin);
    ctx.strokeStyle = '#e8e3ff';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, i * 2.09, i * 2.09 + 1.05);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();

    /* 追踪中的线：看得见它在拐弯 */
    if (s.homing && s.target && s.target.alive) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#a99bff';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.target.x, s.target.y); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ── 旋刃锁定框：目标身上一圈收拢的括号 + 锁定条 ── */
function drawBladeLock() {
  if (!BLADE_LOCK.on) return;
  const t = BLADE_LOCK.target;
  if (!t || !t.alive) return;
  const k = clamp(BLADE_LOCK.prog, 0, 1);
  const locked = k >= 1;
  const r = t.r + 16 + (1 - k) * 26;
  const col = BLADE_LOCK.behind ? '#c9c0ff' : '#9fd0e8';

  ctx.save();
  ctx.strokeStyle = locked ? 'rgba(220,212,255,0.95)' : 'rgba(160,180,220,' + (0.35 + 0.5 * k).toFixed(2) + ')';
  ctx.lineWidth = locked ? 2.2 : 1.6;
  /* 四角括号 */
  for (let i = 0; i < 4; i++) {
    const a0 = i * (Math.PI / 2) + 0.28;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, a0, a0 + 0.92);
    ctx.stroke();
  }
  /* 锁定进度环 */
  ctx.strokeStyle = 'rgba(201,192,255,0.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(t.x, t.y, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '800 11px ui-monospace, monospace';
  ctx.fillStyle = locked ? '#e8e3ff' : col;
  ctx.fillText(locked ? (BLADE_LOCK.behind ? '背 后 · 已锁定' : '已 锁 定')
                      : (BLADE_LOCK.behind ? '背 后 · 快 锁 ' : '锁 定 ') + Math.round(k * 100) + '%',
               t.x, t.y - r - 12);
  ctx.restore();
}

/* ── 蛊：瓦斯弹 / 毒雾 / 增益无人机 / 流荧集群 ── */
function drawGasBombs() {
  for (const b of G.gasbombs) {
    if (!fogVisibleAt(b.x, b.y)) continue;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 5, 6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(b.x, b.y);
    /* 泄气尾迹 */
    const g0 = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
    g0.addColorStop(0, 'rgba(216,255,168,0.45)');
    g0.addColorStop(1, 'rgba(166,239,94,0)');
    ctx.fillStyle = g0;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
    ctx.rotate(b.spin);
    ctx.fillStyle = '#8fbf3c';
    ctx.strokeStyle = '#e8ffc0';
    ctx.lineWidth = 1.3;
    drawRoundRect(-4.6, -6.2, 9.2, 12.4, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a3a12';
    ctx.fillRect(-2.4, -6.2, 4.8, 2.2);
    ctx.restore();
  }
}

function drawMists() {
  const GS = SKILL.gas;
  for (const m of G.mists) {
    if (!fogVisibleAt(m.x, m.y)) continue;
    const r = m.r;
    if (r < 2) continue;
    const a = clamp(Math.min(m.t / 0.35, (GS.life - m.t) / GS.fade), 0, 1);
    /* 半透明的黄绿雾：看得见人影，但看不清脸 —— 不挡视线，只让人瞎 */
    const g = ctx.createRadialGradient(m.x, m.y, r * 0.12, m.x, m.y, r);
    g.addColorStop(0, 'rgba(150,196,70,' + (0.34 * a).toFixed(3) + ')');
    g.addColorStop(0.58, 'rgba(158,206,76,' + (0.30 * a).toFixed(3) + ')');
    g.addColorStop(0.9, 'rgba(178,224,98,' + (0.2 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(190,232,116,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.fill();

    /* 翻滚的雾团 */
    for (let i = 0; i < 6; i++) {
      const ang = m.seed + i * 2.399 + G.time * 0.35;
      const rr = r * (0.3 + (i % 3) * 0.14);
      const bx = m.x + Math.cos(ang) * r * 0.42;
      const by = m.y + Math.sin(ang * 1.3) * r * 0.34;
      const gg = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      gg.addColorStop(0, 'rgba(196,240,120,' + (0.18 * a).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(166,239,94,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.fill();
    }

    /* 一圈边界：告诉所有人"这圈不能待" */
    ctx.strokeStyle = 'rgba(196,240,120,' + (0.22 * a).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 9]);
    ctx.lineDashOffset = -G.time * 22;
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.94, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawAdrFields() {
  const AD = SKILL.adr;
  for (const f of G.adrFields) {
    if (!fogVisibleAt(f.x, f.y)) continue;
    const left = f.life - f.t;
    const a = clamp(Math.min(f.t / 0.4, left / 1.2), 0, 1);
    const pulse = 0.5 + Math.sin(G.time * 3.4) * 0.5;

    /* 作用范围 */
    ctx.strokeStyle = 'rgba(166,239,94,' + ((0.34 + pulse * 0.2) * a).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -G.time * 26;
    ctx.beginPath(); ctx.arc(f.x, f.y, AD.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    const g = ctx.createRadialGradient(f.x, f.y, AD.r * 0.2, f.x, f.y, AD.r);
    g.addColorStop(0, 'rgba(166,239,94,0)');
    g.addColorStop(0.75, 'rgba(166,239,94,' + (0.05 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(166,239,94,' + (0.13 * a).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, AD.r, 0, TAU); ctx.fill();

    /* 悬停的无人机（三叶旋翼） */
    const dy = Math.sin(G.time * 2.2 + f.seed) * 4;
    ctx.save();
    ctx.translate(f.x, f.y + dy);
    ctx.rotate(G.time * 0.9);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3);
      ctx.fillStyle = 'rgba(200,255,150,' + (0.5 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(9, 0, 6, 2.4, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const gg = ctx.createRadialGradient(f.x, f.y + dy, 0, f.x, f.y + dy, 16);
    gg.addColorStop(0, 'rgba(166,239,94,0.5)');
    gg.addColorStop(1, 'rgba(166,239,94,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(f.x, f.y + dy, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(230,255,196,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(f.x, f.y + dy, 3.2, 0, TAU); ctx.fill();

    /* 剩余秒数 + 当前层数 */
    const stackN = (P.op && P.op.adrStack) || 0;
    ctx.textAlign = 'center';
    ctx.font = '800 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(216,255,168,' + (0.8 * a).toFixed(3) + ')';
    ctx.fillText(Math.ceil(left) + 's' + (stackN ? ' · 强度 ×' + stackN : ''), f.x, f.y - 22);
    ctx.textAlign = 'left';
  }
}

function drawSwarms() {
  const SW = SKILL.swarm;
  for (const s of G.swarms) {
    if (!fogVisibleAt(s.x, s.y)) continue;
    const fade = clamp(Math.min(s.t / 0.3, (s.life - s.t) / 1.0), 0, 1);
    for (let i = 0; i < SW.count; i++) {
      const a = s.seed + i * TAU / SW.count + G.time * 2.4;
      const rr = 12 + (i % 2) * 5;
      const px = s.x + Math.cos(a) * rr;
      const py = s.y + Math.sin(a) * rr * 0.7;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 8);
      g.addColorStop(0, 'rgba(232,255,200,' + (0.85 * fade).toFixed(3) + ')');
      g.addColorStop(0.35, 'rgba(166,239,94,' + (0.5 * fade).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(166,239,94,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(240,255,220,' + (0.9 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(px, py, 1.6, 0, TAU); ctx.fill();
    }
  }

  /* 缠在敌人身上：五颗小机绕着转，头顶画拔除进度 */
  for (const e of G.enemies) {
    if (!e.alive || !(e.swarmT > 0)) continue;
    if (!fogVisibleAt(e.x, e.y)) continue;
    const total = e.capBoss ? SW.bossAttach : SW.attach;
    const k = 1 - clamp(e.swarmT / total, 0, 1);
    for (let i = 0; i < 5; i++) {
      const a = G.time * 5.2 + i * TAU / 5;
      const rr = e.r + 8 + Math.sin(G.time * 7 + i) * 3;
      const px = e.x + Math.cos(a) * rr;
      const py = e.y + Math.sin(a) * rr * 0.85;
      ctx.fillStyle = 'rgba(200,255,150,0.85)';
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(200,255,150,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y - e.r - 34, 7, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
  }
}

/* ── 蛊的毒雾致盲：整块屏幕压成黄绿，只留身边一点轮廓 ── */
function drawGasBlind() {
  const k = clamp(G.gasBlind || 0, 0, 1);
  if (k <= 0.01 || !P.alive) return;
  const px = (P.x - G.cam.x) * ZOOM + G.shakeX;
  const py = (P.y - G.cam.y) * ZOOM + G.shakeY;
  ctx.save();
  const g = ctx.createRadialGradient(px, py, 34, px, py, Math.max(VW, VH) * 0.72);
  g.addColorStop(0, 'rgba(140,180,50,' + (0.32 * k).toFixed(3) + ')');
  g.addColorStop(0.5, 'rgba(112,152,38,' + (0.72 * k).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(66,96,20,' + (0.95 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
}

/* ── 箭矢：电箭绿、侦察箭青、激素针淡绿 ── */
function drawArrows() {
  for (const a of G.arrows) {
    if (!fogVisibleAt(a.x, a.y)) continue;
    const col = a.kind === 'arc' ? '#8ef2b0' : a.kind === 'scan' ? '#9ef7c8' : '#8dffc0';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a.x, a.y, 2.6, 0, TAU); ctx.fill();
  }
}

/* ── 侦察视野：扫描线转圈的开雾区域（迷雾本身已经淡了，这里画边界和扫描线） ── */
function drawScanPings() {
  for (const sp of G.scanPings) {
    const k = clamp(sp.t / sp.max, 0, 1);
    const a = Math.min(1, k * 3);
    /* 边界虚线圈 */
    ctx.strokeStyle = 'rgba(150,255,200,' + (0.5 * a) + ')';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -G.time * 30;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    /* 雷达扫描线 */
    const ang = G.time * 1.6 + sp.seed;
    const g = ctx.createLinearGradient(sp.x, sp.y, sp.x + Math.cos(ang) * sp.r, sp.y + Math.sin(ang) * sp.r);
    g.addColorStop(0, 'rgba(150,255,200,' + (0.55 * a) + ')');
    g.addColorStop(1, 'rgba(150,255,200,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x + Math.cos(ang) * sp.r, sp.y + Math.sin(ang) * sp.r); ctx.stroke();
    /* 即将到期：整体往回缩 */
    if (k < 0.25) {
      ctx.strokeStyle = 'rgba(150,255,200,' + (0.3 * a) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (k / 0.25), 0, TAU); ctx.stroke();
    }
  }
}

/* ── 电圈：会电人的绿环 ── */
function drawEZones() {
  for (const z of G.ezones) {
    if (!fogVisibleAt(z.x, z.y)) continue;
    const k = clamp(z.life / z.max, 0, 1);
    const a = Math.min(1, k * 2.2);
    const g = ctx.createRadialGradient(z.x, z.y, z.r * 0.15, z.x, z.y, z.r);
    g.addColorStop(0, 'rgba(70,230,150,' + (0.10 * a) + ')');
    g.addColorStop(0.72, 'rgba(60,220,140,' + (0.20 * a) + ')');
    g.addColorStop(1, 'rgba(60,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();

    ctx.strokeStyle = 'rgba(150,255,200,' + (0.75 * a) + ')';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -G.time * 26;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    /* 几道随机电弧，让它看起来在放电 */
    for (let i = 0; i < 3; i++) {
      const ang = G.time * 2.4 + i * 2.1 + z.seed;
      const r0 = z.r * 0.25, r1 = z.r * (0.65 + 0.3 * Math.abs(Math.sin(G.time * 7 + i)));
      ctx.strokeStyle = 'rgba(220,255,235,' + (0.5 * a) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(z.x + Math.cos(ang) * r0, z.y + Math.sin(ang) * r0);
      ctx.lineTo(z.x + Math.cos(ang + 0.5) * r1 * 0.7, z.y + Math.sin(ang + 0.5) * r1 * 0.7);
      ctx.lineTo(z.x + Math.cos(ang + 0.2) * r1, z.y + Math.sin(ang + 0.2) * r1);
      ctx.stroke();
    }
  }
}

/* ── 治疗场：绿色呼吸圈 + 十字 ── */
function drawHealFields() {
  for (const f of G.healFields) {
    if (!fogVisibleAt(f.x, f.y)) continue;
    const k = clamp(f.life / f.max, 0, 1);
    const a = Math.min(1, k * 3);
    const pulse = 0.86 + 0.14 * Math.sin(G.time * 2.2);
    const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.1, f.x, f.y, f.r * pulse);
    g.addColorStop(0, 'rgba(60,235,140,' + (0.26 * a) + ')');
    g.addColorStop(0.62, 'rgba(40,210,120,' + (0.20 * a) + ')');
    g.addColorStop(1, 'rgba(30,180,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * pulse, 0, TAU); ctx.fill();

    ctx.strokeStyle = 'rgba(160,255,200,' + (0.5 * a) + ')';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = G.time * 18;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.94, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(220,255,235,' + (0.55 * a) + ')';
    ctx.lineWidth = 3;
    const s = 9 * pulse;
    ctx.beginPath();
    ctx.moveTo(f.x - s, f.y); ctx.lineTo(f.x + s, f.y);
    ctx.moveTo(f.x, f.y - s); ctx.lineTo(f.x, f.y + s);
    ctx.stroke();
  }
}

/* ── 烟幕无人机 ── */
function drawDrones() {
  for (const d of G.drones) {
    if (!fogVisibleAt(d.x, d.y)) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.ang);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 8, 9, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dff8ea';
    ctx.strokeStyle = '#26d96f';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill(); ctx.stroke();
    /* 四个旋翼 */
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(sx * 9, sy * 8, 5.5 + Math.sin(G.time * 40 + sx + sy) * 1.2, 2.4, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(140,255,190,' + (0.4 + 0.35 * Math.abs(Math.sin(G.time * 6))) + ')';
    ctx.beginPath(); ctx.arc(2, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* ── 巡飞弹 ── */
function drawLoiters() {
  for (const m of G.loiters) {
    if (!fogVisibleAt(m.x, m.y)) continue;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.ang);
    if (m.sub) {
      ctx.fillStyle = 'rgba(255,180,90,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,180,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffd6a8';
      ctx.strokeStyle = '#ff8a1f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(13, 0); ctx.lineTo(-7, -5.5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 5.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      /* 尾焰 */
      ctx.fillStyle = 'rgba(255,190,90,' + (0.55 + 0.35 * Math.sin(G.time * 30)) + ')';
      ctx.beginPath();
      ctx.moveTo(-6, -3.2); ctx.lineTo(-16 - Math.random() * 8, 0); ctx.lineTo(-6, 3.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    if (m.ctl) {
      /* 弹载视野圈：迷雾里靠这 8 米看路 */
      const VR = SKILL.loiter.vision;
      ctx.strokeStyle = 'rgba(255,200,130,0.3)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.arc(m.x, m.y, VR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,190,120,0.045)';
      ctx.beginPath(); ctx.arc(m.x, m.y, VR, 0, TAU); ctx.fill();

      ctx.strokeStyle = 'rgba(255,190,120,0.75)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(m.x, m.y, 26, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,220,180,0.9)';
      ctx.font = '700 10px ui-monospace, "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('手控制导 · 剩 ' + Math.max(0, m.ctlT).toFixed(1) + 's · ' +
        Math.max(0, Math.round((m.max - m.dist) / 18)) + 'm', m.x, m.y - 34);
    }
  }
}

function drawSmokes() {
  const SM = SKILL.smoke;
  for (const s of G.smokes) {
    if (!fogVisibleAt(s.x, s.y)) continue;
    const t = s.t;
    const life = s.life || SM.life;
    const a = s.fixed ? clamp(Math.min(1, (life - t) / SM.fade + 0.2), 0, 1)
                      : clamp(Math.min(t / SM.grow, (life - t) / SM.fade + 0.2), 0, 1);
    const r = s.r;
    if (r < 1) continue;
    /* 蜂巢烟是淡绿色的，一眼能和红狼的白烟分开 */
    const tone = s.bee ? ['236,255,242', '208,246,222', '176,232,198'] : ['228,234,238', '208,216,222', '188,200,208'];

    const g = ctx.createRadialGradient(s.x, s.y, r * 0.08, s.x, s.y, r);
    g.addColorStop(0, 'rgba(' + tone[0] + ',' + (0.93 * a) + ')');
    g.addColorStop(0.58, 'rgba(' + tone[1] + ',' + (0.87 * a) + ')');
    g.addColorStop(0.86, 'rgba(' + tone[2] + ',' + (0.55 * a) + ')');
    g.addColorStop(1, 'rgba(' + tone[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();

    /* 七个鼓包：位置按 seed 固定、缓慢呼吸，看起来才有体积 */
    for (let i = 0; i < 7; i++) {
      const ang = s.seed + i * 2.399 + Math.sin(G.time * 0.5 + i) * 0.25;
      const rr = r * (0.38 + (i % 3) * 0.15);
      const bx = s.x + Math.cos(ang) * r * 0.40;
      const by = s.y + Math.sin(ang * 1.27) * r * 0.33;
      const gg = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      gg.addColorStop(0, 'rgba(' + tone[0] + ',' + (0.34 * a) + ')');
      gg.addColorStop(1, 'rgba(' + tone[1] + ',0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.fill();
    }
  }
}

/* ── 玩家在烟里的屏幕遮蔽：只留身边一小圈，外面一律糊白 ──
   烟雾对内对外一视同仁：敌人看不见你，你也看不见外面。 */
let SMOKE_GRAIN = null, SMOKE_PATTERN = null;
function smokePattern() {
  if (SMOKE_PATTERN) return SMOKE_PATTERN;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = 3 + Math.random() * 8;
    const lum = (206 + Math.random() * 40) | 0;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + lum + ',' + lum + ',' + (lum + 4) + ',0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  SMOKE_GRAIN = cv;
  SMOKE_PATTERN = ctx.createPattern(cv, 'repeat');
  return SMOKE_PATTERN;
}

/* ── 闪光弹致盲：整块屏幕炸白，然后慢慢退 ── */
function drawFlashBlind() {
  const k = clamp(G.flashBlind || 0, 0, 1);
  if (k <= 0.01 || !P.alive) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.98, k).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
  /* 留一圈暖白 + 一点刺痛的红边，别让纯白看起来像卡死 */
  const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.12, VW / 2, VH / 2, Math.max(VW, VH) * 0.78);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,246,225,' + (0.35 * k).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,120,120,' + (0.45 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
}

function drawSmokeBlind() {
  const k = G.smokeBlind;
  if (k <= 0.02 || !P.alive) return;
  const px = (P.x - G.cam.x) * ZOOM + G.shakeX;
  const py = (P.y - G.cam.y) * ZOOM + G.shakeY;

  ctx.save();

  /* 烟墙：62px 内还看得见，230px 外基本全白 */
  const g = ctx.createRadialGradient(px, py, 62, px, py, 230);
  g.addColorStop(0, 'rgba(212,222,228,0)');
  g.addColorStop(0.32, 'rgba(212,222,228,' + (0.52 * k).toFixed(3) + ')');
  g.addColorStop(0.60, 'rgba(214,224,230,' + (0.86 * k).toFixed(3) + ')');
  g.addColorStop(0.84, 'rgba(222,230,236,' + (0.95 * k).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(228,234,238,' + (0.98 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  /* 一层慢慢飘的颗粒，让它像"烟"而不是"白玻璃" */
  const pat = smokePattern();
  if (pat) {
    ctx.globalAlpha = 0.16 * k;
    const ox = (G.time * 9) % 128, oy = (-G.time * 6) % 128;
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(-128, -128, VW + 256, VH + 256);
  }

  ctx.restore();
}

/* 三头犬的榴弹：一颗带尾焰的胖子，弹过墙会留下火星；快炸的时候弹体开始闪红 */
function drawGls() {
  for (const g of G.gls) {
    if (!fogVisibleAt(g.x, g.y)) continue;

    const left = clamp(g.fuse / SKILL.gl.fuse, 0, 1);        // 1 → 刚出膛，0 → 马上炸
    const blink = left < 0.34 ? 0.5 + 0.5 * Math.sin(g.spin * 3.2) : 0;

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(g.x, g.y + 6, 7, 4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const glow = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 18 + blink * 5);
    glow.addColorStop(0, blink > 0
      ? 'rgba(255,' + Math.round(150 - blink * 110) + ',90,0.85)'
      : 'rgba(255,214,107,0.75)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(g.x, g.y, 18 + blink * 5, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.spin);
    ctx.fillStyle = '#3a2f1a';
    drawRoundRect(-5.5, -4.5, 11, 9, 3);
    ctx.fill();
    ctx.strokeStyle = blink > 0 ? 'rgba(255,' + Math.round(190 - blink * 130) + ',110,1)' : '#ffbe55';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    /* 引信环：最后 1 秒倒着收紧，一眼看出「还没炸」 */
    if (left < 0.34) {
      ctx.strokeStyle = 'rgba(255,96,72,' + (0.35 + 0.5 * blink) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 11, -Math.PI / 2, -Math.PI / 2 + TAU * (left / 0.34));
      ctx.stroke();
    }
  }
}

/* 弹道会在哪儿被墙截断：预览用，和弹丸同一套判定（8px 步进） */
function glImpact(t) {
  const a = Math.atan2(t.y - P.y, t.x - P.x);
  let x = P.x + Math.cos(a) * (P.r + 10);
  let y = P.y + Math.sin(a) * (P.r + 10);
  const dx = t.x - x, dy = t.y - y;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 8));
  const ux = dx / steps, uy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = x + ux, ny = y + uy;
    if (!pointInObstacle(x, y) && (pointInObstacle(nx, y) || pointInObstacle(x, ny)))
      return { x, y, blocked: true };
    x = nx; y = ny;
  }
  return { x: t.x, y: t.y, blocked: false };
}

/* 手炮落点预览：只有 V 端在手上时才画 —— 平时不端着炮就不该有个框跟着走。
   超过 100 米打不到，圈变红。画在迷雾之上（屏幕坐标）：不然远处那个圈会被黑糊掉。 */
function drawGlAim() {
  if (G.scene !== 'playing' || !P.alive || isDowned()) return;
  const M = P.op && P.op.mode;
  if (!M || M.id !== 'gl') return;

  const t = glAimPoint();
  const im = glImpact(t);                        // 墙挡在中间时，圈画在撞墙处
  const L = SKILL.gl;
  const col = t.far ? '255,86,72' : '255,190,110';
  const sx = (im.x - G.cam.x) * ZOOM + G.shakeX;
  const sy = (im.y - G.cam.y) * ZOOM + G.shakeY;
  const px = (P.x - G.cam.x) * ZOOM + G.shakeX;
  const py = (P.y - G.cam.y) * ZOOM + G.shakeY;
  const rr = L.radius * ZOOM;
  const ang = Math.atan2(im.y - P.y, im.x - P.x);

  ctx.save();
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(' + col + ',0.22)';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([9, 10]);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.setLineDash([]);

  /* 惯性：到点不炸，还会顺着弹道往前蹭一小段（v / glide），画出它会滑到哪儿 */
  if (!im.blocked) {
    const gl = L.speed / L.glide * ZOOM;
    const ex = sx + Math.cos(ang) * gl, ey = sy + Math.sin(ang) * gl;
    ctx.strokeStyle = 'rgba(' + col + ',0.3)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(' + col + ',0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.stroke();
  }

  /* 爆炸范围：这一圈的边界就是能炸到的边界 */
  ctx.strokeStyle = 'rgba(' + col + ',0.5)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 7]);
  ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(' + col + ',0.95)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
  ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
  ctx.stroke();

  const label = Math.round(Math.hypot(im.x - P.x, im.y - P.y) / 18) + 'm · ' +
    L.fuse.toFixed(0) + 's' +
    (im.blocked ? ' · 撞墙' : (t.far ? ' · 超出 100m' : ''));
  ctx.textAlign = 'center';
  ctx.font = '700 10px ui-monospace, "Consolas", monospace';
  ctx.fillStyle = 'rgba(' + col + ',0.95)';
  ctx.fillText(label, sx, sy - rr - 9);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* 磁吸炸弹：飞行时带青色尾焰；吸住之后闪红灯，越接近引爆闪得越快 */
function drawMagbombs() {
  for (const b of G.magbombs) {
    if (!fogVisibleAt(b.x, b.y)) continue;
    const yy = b.y - b.h;

    /* 地面投影：飞得越高影子越淡，吸住了就没有 */
    if (b.st === 'fly' && b.h > 1) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, 8, 4, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    const glow = ctx.createRadialGradient(b.x, yy, 0, b.x, yy, 22);
    const hot = b.st === 'stuck' ? 0.8 : 0.45;
    glow.addColorStop(0, 'rgba(143,224,255,' + hot + ')');
    glow.addColorStop(1, 'rgba(74,209,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(b.x, yy, 22, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(b.x, yy);
    ctx.rotate(b.spin * 0.4);
    ctx.fillStyle = '#16333f';
    drawRoundRect(-6, -5, 12, 10, 3); ctx.fill();
    ctx.strokeStyle = '#8fe0ff'; ctx.lineWidth = 1.5; ctx.stroke();
    /* 四条磁吸爪 */
    ctx.strokeStyle = 'rgba(143,224,255,0.75)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
      ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5);
      ctx.stroke();
    }
    ctx.restore();

    if (b.st === 'stuck') {
      /* 红灯：剩余时间越少，闪得越急 */
      const M = SKILL.mag;
      const left = clamp(b.fuse / M.fuse, 0, 1);
      const rate = 3 + (1 - left) * 16;
      const on = Math.sin(G.time * rate) > 0;
      ctx.fillStyle = on ? '#ff4d5e' : 'rgba(255,77,94,0.22)';
      ctx.beginPath(); ctx.arc(b.x, yy - 1, 2.6, 0, TAU); ctx.fill();
      if (on) {
        const rg = ctx.createRadialGradient(b.x, yy, 0, b.x, yy, 16);
        rg.addColorStop(0, 'rgba(255,77,94,0.35)');
        rg.addColorStop(1, 'rgba(255,77,94,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(b.x, yy, 16, 0, TAU); ctx.fill();
      }
    }
  }
}

/* 虎蹲炮的压缩空气弹：一团卷着白气的球，后面拖着螺旋气纹 */
function drawShocks() {
  for (const s of G.shocks) {
    if (!fogVisibleAt(s.x, s.y)) continue;
    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26);
    glow.addColorStop(0, 'rgba(255,255,255,0.85)');
    glow.addColorStop(0.45, 'rgba(143,224,255,0.45)');
    glow.addColorStop(1, 'rgba(74,209,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, TAU); ctx.fill();

    for (let i = 0; i < 3; i++) {
      const a = s.spin + i * TAU / 3;
      ctx.strokeStyle = 'rgba(205,243,255,' + (0.35 + i * 0.12) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9 + i * 4, a, a + 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = '#eafaff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, TAU); ctx.fill();
  }
}

/* 长按 G：从人指到落点的虚线 + 落点爆炸圈 + 距离读数 */
/* 手持装置的落点预览：虚线 + 落点圈 / 掩体轮廓 */
function drawModeAim() {
  if (!modeOn() || !P.alive) return;
  const M = P.op.mode, a = P.aim;
  const dash = (x1, y1, x2, y2, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
  };

  if (M.id === 'frag' || M.id === 'firebomb') {
    const F = M.id === 'frag' ? SKILL.frag : SKILL.firebomb;
    const maxD = M.id === 'frag' ? F.holdMax : 9 * 18;
    const d = clamp(magAimDist() || 120, 70, maxD);
    const tx = P.x + Math.cos(a) * d, ty = P.y + Math.sin(a) * d;
    const col = M.id === 'frag' ? 'rgba(160,240,190,0.55)' : 'rgba(255,170,90,0.55)';
    dash(P.x, P.y, tx, ty, col);
    ctx.strokeStyle = M.id === 'frag' ? 'rgba(160,240,190,0.75)' : 'rgba(255,170,90,0.75)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.arc(tx, ty, F.radius, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(220,255,235,0.85)';
    ctx.font = '700 10px ui-monospace, "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(d / 18) + 'm', tx, ty - F.radius - 8);
  } else if (M.id === 'coverdev') {
    const S = coverSpot(M.vert);
    const cx = S.x + S.w / 2, cy = S.y + S.h / 2;
    const good = S.ok;
    const lc = good ? '255,190,120' : '255,90,90';
    dash(P.x, P.y, cx, cy, 'rgba(' + lc + ',0.5)');
    ctx.strokeStyle = 'rgba(' + lc + ',0.85)';
    ctx.fillStyle = 'rgba(' + lc + ',0.16)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = good ? 'rgba(255,220,180,0.85)' : 'rgba(255,150,150,0.9)';
    ctx.font = '700 10px ui-monospace, "Consolas", monospace';
    ctx.textAlign = 'center';
    const d = Math.hypot(cx - P.x, cy - P.y) / 18;
    ctx.fillText(good ? Math.round(d) + 'm · ' + (M.vert ? '竖' : '横') : '这里立不住',
                 cx, S.y - 12);
  } else if (M.id === 'loiter') {
    if (M.controlling) return;                   // 镜头已经跟着导弹走了
    /* 直接发射：一条射向准星的示意线；右键瞄准：画出预测弹道 */
    ctx.strokeStyle = 'rgba(255,190,120,' + (0.18 + M.aimR * 0.35) + ')';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(P.x, P.y);
    const len = M.aimR > 0.05 ? 260 : 120;
    ctx.lineTo(P.x + Math.cos(a) * len, P.y + Math.sin(a) * len);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawMagAim() {
  if (!MAG_AIM.on || !P.alive) return;
  const M = SKILL.mag;
  const d = clamp(magAimDist(), M.min, M.range);
  const a = P.aim;
  const tx = clamp(P.x + Math.cos(a) * d, 24, WORLD.w - 24);
  const ty = clamp(P.y + Math.sin(a) * d, 24, WORLD.h - 24);

  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(143,224,255,0.65)';
  ctx.beginPath();
  ctx.moveTo(P.x, P.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  /* 落点：虚线爆炸圈 + 一圈实心小点 */
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255,120,90,0.75)';
  ctx.beginPath(); ctx.arc(tx, ty, M.radius, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,120,90,0.55)';
  ctx.beginPath(); ctx.arc(tx, ty, 3, 0, TAU); ctx.fill();
  ctx.restore();

  /* 距离读数：按米显示，一眼看得出「够不够得着」 */
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '800 12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(205,243,255,0.92)';
  ctx.fillText((d / METER).toFixed(1) + ' m', tx, ty - M.radius - 8);
  ctx.restore();
  ctx.textAlign = 'left';
}

/* 冰弹：一颗带尾迹的冰蓝碎晶 */
function drawIceBolts() {
  for (const b of G.icebolts) {
    if (!fogVisibleAt(b.x, b.y)) continue;
    const a = Math.atan2(b.vy, b.vx);
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 16);
    g.addColorStop(0, 'rgba(240,252,255,0.95)');
    g.addColorStop(0.45, 'rgba(127,212,255,0.55)');
    g.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, 16, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = '#eaf7ff';
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-3, -4.2); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4.2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* 投掷兵的霜瓶：地上先亮一圈冰圈预警，瓶在空中翻转着飞 */
function drawIcePots() {
  for (const pt of G.icepots) {
    const k = Math.min(1, pt.t / pt.dur);

    if (fogVisibleAt(pt.tx, pt.ty)) {
      ctx.save();
      ctx.globalAlpha = 0.12 + k * 0.2;
      ctx.fillStyle = '#7fd4ff';
      ctx.beginPath(); ctx.arc(pt.tx, pt.ty, pt.radius, 0, TAU); ctx.fill();

      ctx.globalAlpha = 0.32 + k * 0.45;
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.arc(pt.tx, pt.ty, pt.radius, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);

      /* 往里缩的倒计时环：缩到中心就是砸下来那一刻 */
      ctx.globalAlpha = 0.4 + k * 0.45;
      ctx.strokeStyle = '#eaf9ff';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(pt.tx, pt.ty, Math.max(3, pt.radius * (1 - k * 0.86)), 0, TAU); ctx.stroke();
      ctx.restore();
    }

    const bx = pt.x, by = pt.y - pt.h;
    if (!fogVisibleAt(bx, by)) continue;

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 6, 3.4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(bx, by, 0, bx, by, 18);
    g.addColorStop(0, 'rgba(235,252,255,0.72)');
    g.addColorStop(1, 'rgba(90,190,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, 18, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(pt.rot);
    ctx.fillStyle = 'rgba(226,248,255,0.95)';
    drawRoundRect(-4.5, -6.5, 9, 13, 4);
    ctx.fill();
    ctx.strokeStyle = '#4fb8ea';
    ctx.lineWidth = 1.5;
    drawRoundRect(-4.5, -6.5, 9, 13, 4);
    ctx.stroke();
    ctx.restore();
  }
}

/* 霜区：地面上的一层薄冰 + 随时间飘的雪粒 */
function drawFrosts() {
  for (const f of G.frosts) {
    if (!fogVisibleAt(f.x, f.y)) continue;
    const fade = Math.min(1, f.life / 0.8);
    const age = f.max - f.life;
    const grow = Math.min(1, age / 0.28);
    const rr = f.r * (0.72 + 0.28 * grow);

    ctx.globalAlpha = 0.32 * fade;
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, TAU); ctx.fill();

    ctx.globalAlpha = 0.55 * fade;
    ctx.strokeStyle = '#d9f4ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.97, 0, TAU); ctx.stroke();

    // 六片雪花，绕圈慢转
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const a = G.time * 0.4 + i * TAU / 6;
      const px = f.x + Math.cos(a) * rr * 0.62;
      const py = f.y + Math.sin(a) * rr * 0.62;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ka = k * Math.PI / 3 + G.time * 0.6;
        ctx.moveTo(px - Math.cos(ka) * 5, py - Math.sin(ka) * 5);
        ctx.lineTo(px + Math.cos(ka) * 5, py + Math.sin(ka) * 5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/* 火场：地面上的橙色光斑 + 焦痕 + 抖动的火舌 *//* 火场：地面上的橙色光斑 + 焦痕 + 抖动的火舌 */
function drawFires() {
  for (const f of G.fires) {
    if (!fogVisibleAt(f.x, f.y)) continue;
    const t = G.time;
    const age = f.max - f.life;
    const grow = Math.min(1, age / 0.32);
    const fade = Math.min(1, f.life / 0.9);
    const rr = f.r * (0.6 + 0.4 * grow) * (0.92 + Math.sin(t * 11 + f.x * 0.01) * 0.05);

    // 先铺焦痕，再叠火光，否则黑圈会把火心压暗
    ctx.globalAlpha = 0.32 * fade;
    ctx.fillStyle = '#140803';
    ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.92, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const g = ctx.createRadialGradient(f.x, f.y, rr * 0.1, f.x, f.y, rr);
    g.addColorStop(0, 'rgba(255,240,190,' + (0.5 * fade) + ')');
    g.addColorStop(0.35, 'rgba(255,150,60,' + (0.34 * fade) + ')');
    g.addColorStop(0.75, 'rgba(220,70,20,' + (0.16 * fade) + ')');
    g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, TAU); ctx.fill();

    // 跳动的火舌
    for (let i = 0; i < 5; i++) {
      const a = t * 2.4 + i * 1.31 + f.x * 0.02;
      const px = f.x + Math.cos(a) * rr * (0.18 + (i % 3) * 0.2);
      const py = f.y + Math.sin(a * 1.3) * rr * (0.16 + (i % 2) * 0.22);
      const h = (18 + Math.sin(t * 9 + i * 2.1) * 9) * fade;
      const fg = ctx.createLinearGradient(px, py, px, py - h * 1.6);
      fg.addColorStop(0, 'rgba(255,190,80,' + (0.5 * fade) + ')');
      fg.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.quadraticCurveTo(px, py - h * 1.7, px + 6, py);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 火心补一层高亮，让中心看起来更烫
    const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr * 0.34);
    cg.addColorStop(0, 'rgba(255,250,225,' + (0.55 * fade) + ')');
    cg.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.34, 0, TAU); ctx.fill();
  }
}

/* 飞行中的燃烧瓶：世界坐标 + 高度偏移，地面留个影子 */
function drawMolotovs() {
  for (const m of G.molotovs) {
    if (!fogVisibleAt(m.x, m.y)) continue;
    const h = m.h || 0;

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 8, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(m.x, m.y - h);
    ctx.rotate(m.rot);
    ctx.fillStyle = '#7c3b12';
    drawRoundRect(-4, -8, 8, 16, 3);
    ctx.fill();
    ctx.strokeStyle = '#d98545';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#ffd66b';
    ctx.fillRect(-3, -11, 6, 5);
    ctx.restore();

    // 尾焰
    const g = ctx.createRadialGradient(m.x, m.y - h, 1, m.x, m.y - h, 16);
    g.addColorStop(0, 'rgba(255,240,190,0.85)');
    g.addColorStop(0.4, 'rgba(255,150,60,0.45)');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y - h, 16, 0, TAU); ctx.fill();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.shape === 'flash') {
      const r = p.r * (1.4 - a * 0.5);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(255,248,220,' + a + ')');
      g.addColorStop(0.4, 'rgba(255,214,120,' + (a * 0.6) + ')');
      g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      continue;
    }
    ctx.globalAlpha = a;
    if (p.glow) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a * 0.25;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
    }
    ctx.fillStyle = p.color;
    if (p.shape === 'square') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPopups() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.popups) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = '800 ' + t.size + 'px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(t.text, t.x + 1, t.y + 2);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawOffscreenMarkers() {
  const pad = 40;
  const cx = VW / 2, cy = VH / 2;
  if (G.smokeBlind > 0.5) return;      // 自己糊在烟里：连方位提示都别给

  for (const e of G.enemies) {
    // 迷雾里没被察觉的敌人不该给出方位提示
    if (e.state !== 'combat' && e.state !== 'alert') continue;
    const sx = (e.x - G.cam.x) * ZOOM, sy = (e.y - G.cam.y) * ZOOM;
    if (sx > -20 && sx < VW + 20 && sy > -20 && sy < VH + 20) continue;
    const ang = Math.atan2(sy - cy, sx - cx);
    const bx = cx + Math.cos(ang) * (Math.min(VW, VH) / 2 - pad);
    const by = cy + Math.sin(ang) * (Math.min(VW, VH) / 2 - pad);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = e.type === 'boss' ? '#ff2d55' : 'rgba(255,90,120,0.85)';
    const s = e.type === 'boss' ? 9 : 6;
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.75); ctx.lineTo(-s * 0.8, s * 0.75);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 撤离点方向指引（未激活的紧急撤离点不指引；丢包点琥珀色；总闸红点）
  for (const ex of G.extracts) {
    if (ex.mode === 'emergency' && !G.emergencyOpen) continue;
    const sx = (ex.x - G.cam.x) * ZOOM, sy = (ex.y - G.cam.y) * ZOOM;
    if (sx > 0 && sx < VW && sy > 0 && sy < VH) continue;
    const ang = Math.atan2(sy - cy, sx - cx);
    const bx = cx + Math.cos(ang) * (Math.min(VW, VH) / 2 - 16);
    const by = cy + Math.sin(ang) * (Math.min(VW, VH) / 2 - 16);

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = ex.mode === 'naked' ? '#ffb347' : '#46e08a';
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-3, 0); ctx.lineTo(-8, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = ex.mode === 'naked' ? '#ffd699' : '#8fffc4';
    ctx.font = '700 11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    const lx = bx + Math.cos(ang) * 22, ly = by + Math.sin(ang) * 22;
    ctx.fillText(Math.round(dist(P.x, P.y, ex.x, ex.y)) + 'm', lx, ly + 4);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  // 总闸方向指引（未拉下时）
  for (const sw of (G.switches || [])) {
    if (sw.pulled) continue;
    const sx = (sw.x - G.cam.x) * ZOOM, sy = (sw.y - G.cam.y) * ZOOM;
    if (sx > 0 && sx < VW && sy > 0 && sy < VH) continue;
    const ang = Math.atan2(sy - cy, sx - cx);
    const bx = cx + Math.cos(ang) * (Math.min(VW, VH) / 2 - 30);
    const by = cy + Math.sin(ang) * (Math.min(VW, VH) / 2 - 30);
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(G.time * 4));
    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawLighting() {
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.40, VW / 2, VH / 2, Math.max(VW, VH) * 0.88);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);

  if (P.hurtFlash > 0.01) {
    ctx.fillStyle = 'rgba(255,20,60,' + (P.hurtFlash * 0.22) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  // 被点燃时屏幕下缘泛橙
  if (P.burnT > 0 && P.alive) {
    const p = 0.55 + Math.sin(G.time * 15) * 0.45;
    const bg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.34, VW / 2, VH / 2, Math.max(VW, VH) * 0.8);
    bg.addColorStop(0, 'rgba(255,110,30,0)');
    bg.addColorStop(1, 'rgba(255,110,30,' + (0.12 + p * 0.14) + ')');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VW, VH);
  }

  if (P.hp / P.maxHp < 0.32 && P.alive) {
    const pulse = 0.5 + Math.sin(G.time * 5) * 0.5;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.30, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, 'rgba(255,0,40,' + (0.16 + pulse * 0.14) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
}

/* ══════════════════════════════════════════════════════════
   15. HUD
   ══════════════════════════════════════════════════════════ */

/* 长按 5 弹出的选药盘：一格一种，滚轮切换，松开确认。
   选中只是"下次短按用哪种"，当场不消耗。 */
function drawMedSelect(mono) {
  if (!MED_SEL.down || !P.alive) return;

  if (!MED_SEL.open) {
    /* 还在蓄力：一根小条告诉玩家"再按住就出选择盘"，松手则是直接用 */
    const p = clamp(MED_SEL.hold / MED_HOLD_T, 0, 1);
    const cw = 150, cx = VW / 2 - cw / 2, cy = VH - 104;
    ctx.save();
    ctx.fillStyle = 'rgba(8,16,24,0.72)';
    drawRoundRect(cx - 5, cy - 5, cw + 10, 13, 3); ctx.fill();
    ctx.fillStyle = '#46e08a';
    drawRoundRect(cx, cy, Math.max(2, cw * p), 3, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,200,0.8)';
    ctx.font = '700 9px ' + mono;
    ctx.textAlign = 'center';
    ctx.fillText('按住 5 选择医疗 / 止血 / 手术', VW / 2, cy - 12);
    ctx.restore();
    ctx.textAlign = 'left';
    return;
  }

  const list = MED_SEL.list;
  const groups = [
    { kind: 'med', label: '医疗包', color: '#46e08a' },
    { kind: 'stop', label: '急救 / 止痛', color: '#cfe6f2' },
    { kind: 'surg', label: '手术包', color: '#8fe3ff' },
  ];
  const rows = [];
  for (const g of groups) {
    const items = list.filter(k => careKindOf(k) === g.kind);
    if (items.length) rows.push({ label: g.label, color: g.color, items: items });
  }
  if (!rows.length) return;

  const cw = 104, ch = 58, gap = 6;
  const rowH = ch + 20;
  let maxW = 0;
  for (const r of rows) maxW = Math.max(maxW, r.items.length * cw + (r.items.length - 1) * gap);

  const x0 = VW / 2 - maxW / 2;
  const totalH = rows.length * rowH;
  const y0 = Math.max(96, VH - 128 - totalH);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(190,230,250,0.85)';
  ctx.font = '700 11px ' + mono;
  ctx.fillText('治疗物品 · 滚轮切换 · 松开 [5] 直接用', VW / 2, y0 - 12);

  /* 这一下短按 5 会自动选哪件 —— 在卡片右上角标出来 */
  const autoKey = careAutoPick();

  let ry = y0;
  for (const r of rows) {
    /* 组标题：左边一条同色小竖线，后面跟组名 */
    ctx.textAlign = 'left';
    ctx.fillStyle = r.color;
    ctx.font = '700 9px ' + mono;
    ctx.fillRect(x0, ry + 2, 2, 9);
    ctx.globalAlpha = 0.72;
    ctx.fillText(r.label, x0 + 7, ry + 10);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';

    for (let i = 0; i < r.items.length; i++) {
      const key = r.items[i];
      const kind = careKindOf(key), id = careIdOf(key);
      const sel = MED_SEL.list.indexOf(key) === MED_SEL.idx;
      const x = x0 + i * (cw + gap);
      const y = ry + 16;
      const col = careColor(key);

      ctx.fillStyle = sel ? 'rgba(20,48,54,0.96)' : 'rgba(8,16,24,0.86)';
      drawRoundRect(x, y, cw, ch, 3); ctx.fill();
      ctx.strokeStyle = sel ? col : 'rgba(80,120,150,0.35)';
      ctx.lineWidth = sel ? 2 : 1;
      drawRoundRect(x, y, cw, ch, 3); ctx.stroke();

      ctx.fillStyle = sel ? '#ffffff' : 'rgba(180,215,235,0.85)';
      ctx.font = '700 11px ' + mono;
      ctx.fillText(careName(key), x + cw / 2, y + 16);

      /* 自动用药阶梯选中的那件：右上角一枚「推荐」角标 */
      if (key === autoKey) {
        ctx.fillStyle = 'rgba(6,14,20,0.88)';
        drawRoundRect(x + cw - 27, y + 2, 25, 11, 2.5); ctx.fill();
        ctx.fillStyle = col;
        ctx.font = '800 8px ' + mono;
        ctx.fillText('推荐', x + cw - 14.5, y + 10.5);
      }

      ctx.fillStyle = col;
      ctx.font = '800 15px ' + mono;
      const cnt = careCount(key);
      ctx.fillText(kind === 'surg' ? cnt + ' 次' : ('×' + cnt), x + cw / 2, y + 34);

      ctx.fillStyle = 'rgba(150,190,215,0.72)';
      ctx.font = '600 9px ' + mono;
      if (kind === 'med') {
        const M = MEDKITS[id];
        ctx.fillText(M.hps + ' 血/秒 · 启动 ' + M.wind + 's', x + cw / 2, y + 47);
        const ratio = clamp(medLeftOf(id) / M.dur, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        drawRoundRect(x + 10, y + ch - 8, cw - 20, 3, 1.5); ctx.fill();
        ctx.fillStyle = col;
        drawRoundRect(x + 10, y + ch - 8, Math.max(1, (cw - 20) * ratio), 3, 1.5); ctx.fill();
      } else if (kind === 'stop') {
        const S = STOPS[id];
        ctx.fillText(S.pain ? ('止痛 ' + S.pain + 's · ' + S.sec + 's')
          : (S.layers > 1 ? '止全部流血 · ' + S.sec + 's' : '止 1 层 · ' + S.sec + 's'), x + cw / 2, y + 47);
      } else {
        const S = SURGERIES[id];
        ctx.fillText('读条 ' + S.sec + 's · 治一项', x + cw / 2, y + 47);
      }
    }
    ry += rowH;
  }

  /* 底部说明：选中的这一件现在能干什么 */
  const picked = MED_SEL.list[MED_SEL.idx];
  if (picked) {
    const k = careKindOf(picked);
    let hint = '';
    if (k === 'med') {
      const mid = careIdOf(picked);
      const MM = MEDKITS[mid] || MEDKITS[STARTER_MEDKIT];
      if (P.hp >= P.maxHp - 0.01) hint = '生命值已满 · 读条长度按缺口算，缺得少读得短';
      else {
        const plan = medReadPlan(MM, medUnit(mid));
        hint = '读条 ' + plan.total.toFixed(1) + 's（启动 ' + MM.wind + 's + 回 ' +
               Math.round(plan.heal) + ' 血 ' + plan.win + 's）· 耐久 ' + Math.ceil(medLeftOf(mid));
      }
    }
    else if (k === 'stop') {
      const S = STOPS[careIdOf(picked)];
      if (S && S.pain) hint = P.painT > 0
        ? ('止痛还剩 ' + Math.ceil(P.painT) + 's，先别重复吃')
        : (S.pain + 's 止痛 · 压臂伤 / 淡黑边 · 压不住流血' + (S.uses > 1 ? ' · 还剩 ' + careCount(picked) + ' 次' : ''));
      else hint = P.deb.bleed > 0 ? ('当前流血 ×' + P.deb.bleed + '：用它可以压住') : '现在没有流血，用不上';
    }
    else {
      const t = surgTarget();
      hint = t ? ('将处理：' + t.label) : '现在没有需要手术的伤';
    }
    if (picked === autoKey) hint = '短按 5 就是它 · ' + hint;
    ctx.fillStyle = 'rgba(170,215,240,0.8)';
    ctx.font = '700 10px ' + mono;
    /* 垫一层底，别让下面的世界和飘字把这行说明糊掉 */
    const hw = ctx.measureText(hint).width;
    ctx.fillStyle = 'rgba(6,14,20,0.78)';
    drawRoundRect(VW / 2 - hw / 2 - 8, ry + 2, hw + 16, 15, 3); ctx.fill();
    ctx.fillStyle = 'rgba(170,215,240,0.88)';
    ctx.fillText(hint, VW / 2, ry + 12);
  }

  ctx.restore();
  ctx.textAlign = 'left';
}

/* 创伤状态标签：每个 debuff 一个小色块，层数与剩余时间直接写在里面 */
function drawStatusTags(mono) {
  const tags = [];
  const d = P.deb;
  if (d.bleed > 0) tags.push(['流血 ×' + d.bleed, '#ff4060']);
  if (d.redHead > 0) tags.push(['头穿 ×' + d.redHead, '#ff7a5c']);
  if (d.redChest > 0) tags.push(['胸穿 ×' + d.redChest, '#ff7a5c']);
  if (d.redAbdomen > 0) tags.push(['腹穿 ×' + d.redAbdomen, '#ff7a5c']);
  if (d.arm > 0) tags.push(['臂折', armHurt() ? '#ff9b6b' : 'rgba(255,155,107,0.45)']);
  if (d.leg > 0) tags.push(['腿折', '#ff9b6b']);
  if (d.fissure > 0) tags.push(['骨裂 ×' + d.fissure, '#ff5c7a']);
  if (d.weak > 0) tags.push(['虚弱', '#b46bff']);
  if (P.painT > 0) tags.push(['止痛 ' + Math.ceil(P.painT) + 's', '#82ffcd']);
  if (adrOn()) tags.push(['肾上腺素' + (adrStackN() ? ' ×' + adrStackN() : ''), '#a6ef5e']);
  if (!tags.length) return;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = '700 9px ' + mono;
  let tx = 22, ty = 138;
  for (const t of tags) {
    const w = ctx.measureText(t[0]).width + 12;
    if (tx + w > 322) { tx = 22; ty += 16; }
    ctx.fillStyle = 'rgba(8,16,24,0.72)';
    drawRoundRect(tx, ty - 9, w, 13, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    drawRoundRect(tx, ty - 9, w, 13, 2); ctx.stroke();
    ctx.fillStyle = t[1];
    ctx.fillText(t[0], tx + 6, ty + 1);
    tx += w + 4;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

/* ── 战术地图：按 M 全屏开关（不暂停，世界照常运转 —— 看图的时机本身就是个决策）。
      墙体静态部分只在换图时烘一次到离屏 canvas（720px 宽，全屏放大仍清晰），
      每帧只叠地区名 / 撤离点 / 已察觉敌人 / 自己。信息规则沿用原小地图：
      雾里没察觉的敌人不给点，保留潜行空间。 ── */
const BIGMAP = { open: false, cv: null, w: 0, h: 0, sig: '' };

function mapCache() {
  const wpx = 720;
  const hpx = Math.max(120, Math.round(wpx * WORLD.h / Math.max(1, WORLD.w)));
  const sig = WORLD.w + 'x' + WORLD.h + ':' + (G.obstacles ? G.obstacles.length : 0);
  if (BIGMAP.cv && BIGMAP.sig === sig) return BIGMAP;
  const cv = document.createElement('canvas');
  cv.width = wpx; cv.height = hpx;
  const c = cv.getContext('2d');
  if (!c) return BIGMAP;
  c.fillStyle = 'rgba(8,14,20,0.92)';
  c.fillRect(0, 0, wpx, hpx);
  const sx = wpx / WORLD.w, sy = hpx / WORLD.h;
  c.fillStyle = 'rgba(126,180,214,0.30)';
  for (const o of (G.obstacles || [])) {
    c.fillRect(o.x * sx, o.y * sy, Math.max(1, o.w * sx), Math.max(1, o.h * sy));
  }
  BIGMAP.cv = cv; BIGMAP.w = wpx; BIGMAP.h = hpx; BIGMAP.sig = sig;
  return BIGMAP;
}

function drawBigMap() {
  if (!P.alive) return;
  const mm = mapCache();
  if (!mm.cv) return;
  const mx = 70, mTop = 92, mBottom = 74;      // 留出标题与底部提示，四周不贴边
  const availW = VW - mx * 2, availH = VH - mTop - mBottom;
  const sc = Math.min(availW / mm.w, availH / mm.h);
  const w = mm.w * sc, h = mm.h * sc;
  const x0 = (VW - w) / 2, y0 = mTop + (availH - h) / 2;
  const sx = w / WORLD.w, sy = h / WORLD.h;

  ctx.save();
  ctx.fillStyle = 'rgba(4,9,14,0.86)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.drawImage(mm.cv, x0, y0, w, h);

  /* 地区名 */
  ctx.font = '700 14px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of (G.regions || [])) {
    const nx = x0 + (r.x + r.w / 2) * sx, ny = y0 + (r.y + r.h / 2) * sy;
    ctx.fillStyle = 'rgba(150, 205, 240, 0.60)';
    ctx.fillText(r.name, nx, ny);
  }

  /* 相机视野框 */
  const vw = VW / ZOOM, vh = VH / ZOOM;
  ctx.strokeStyle = 'rgba(67,217,245,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + G.cam.x * sx + 0.5, y0 + G.cam.y * sy + 0.5, vw * sx, vh * sy);

  /* 撤离点：圆点 + 名字（拉闸未开的灰色锁死） */
  ctx.font = '600 12px "Microsoft YaHei", "PingFang SC", sans-serif';
  for (const ex of G.extracts) {
    const locked = ex.mode === 'emergency' && !G.emergencyOpen;
    const col = locked ? '#5a7a9a' : ex.mode === 'naked' ? '#ffb347' : ex.mode === 'paid' ? '#ffcc4d' : '#46e08a';
    const ex0 = x0 + ex.x * sx, ey0 = y0 + ex.y * sy;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ex0, ey0, 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ex0, ey0, 9.5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = col;
    // 标签夹在地图框内，贴边的撤离点不被裁掉
    const ly = Math.max(y0 + 10, Math.min(y0 + h - 8, ey0 - 15));
    ctx.fillText((locked ? '🔒 ' : '') + ex.name + (locked ? '（未拉闸）' : ''), ex0, ly);
    ctx.globalAlpha = 1;
  }

  /* 已察觉 / 被标记的敌人（雾里没察觉的不给点，保留潜行空间） */
  for (const e of G.enemies) {
    if (!(e.state === 'combat' || e.state === 'alert' || e.mark > 0)) continue;
    const ex0 = x0 + e.x * sx, ey0 = y0 + e.y * sy;
    ctx.fillStyle = e.type === 'boss' || e.type === 'director' ? '#ff2d55' : 'rgba(255,120,145,0.9)';
    const r = e.type === 'boss' || e.type === 'director' ? 4.5 : 3;
    ctx.beginPath(); ctx.arc(ex0, ey0, r, 0, TAU); ctx.fill();
  }

  /* 自己：朝准星方向的三角 + 白圈标记 */
  const px = x0 + P.x * sx, py = y0 + P.y * sy;
  ctx.strokeStyle = 'rgba(234,247,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.stroke();
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(P.aim);
  ctx.fillStyle = '#eaf7ff';
  ctx.beginPath();
  ctx.moveTo(9, 0); ctx.lineTo(-6, -5.8); ctx.lineTo(-2.5, 0); ctx.lineTo(-6, 5.8);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  /* 外框 + 标题 + 底部提示 */
  ctx.strokeStyle = 'rgba(67,217,245,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(180,230,255,0.95)';
  ctx.font = '700 17px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('战术地图' + (G.tier === 'standard' ? '' : ' · ' + (G.tier === 'top' ? '绝密' : '机密')), x0, y0 - 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(120,166,196,0.85)';
  ctx.font = '600 12px ui-monospace, Consolas, monospace';
  ctx.fillText('M / Esc 关闭', x0 + w, y0 - 22);
  ctx.textAlign = 'left';
  ctx.fillText('绿=撤离 · 橙=付费撤离 · 红=已察觉敌人 · 世界不会暂停', x0, y0 + h + 26);
  ctx.restore();
}

function drawHUD() {
  const mono = 'ui-monospace, "Consolas", "SF Mono", monospace';

  // ── 顶中：拉闸撤离进度（航天基地专属） ──
  if (G.extMode === 'switch') {
    const pulledN = G.switches.filter(s => s.pulled).length;
    const allPulled = G.switches.length > 0 && pulledN >= G.switches.length;
    const bw = 250;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,24,0.68)';
    drawRoundRect(VW / 2 - bw / 2, 20, bw, 58, 3);
    ctx.fill();
    ctx.strokeStyle = allPulled ? (G.emergencyOpen ? 'rgba(70,224,138,0.5)' : 'rgba(255,179,71,0.5)') : 'rgba(255,92,92,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    if (!allPulled) {
      ctx.fillStyle = '#ff8a9a';
      ctx.font = '800 13px ' + mono;
      ctx.fillText('总闸 ' + pulledN + ' / ' + G.switches.length, VW / 2, 44);
      ctx.fillStyle = '#6f8aa4';
      ctx.font = '600 10px ' + mono;
      ctx.fillText('拉下全部总闸 · 5 分钟后紧急撤离开启', VW / 2, 64);
    } else if (!G.emergencyOpen) {
      const s = Math.max(0, Math.ceil(G.emergencyTimer));
      ctx.fillStyle = Math.ceil(G.emergencyTimer) <= 30 ? '#ff5c5c' : '#ffd66b';
      ctx.font = '800 20px ' + mono;
      ctx.fillText('紧急撤离 ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), VW / 2, 47);
      ctx.fillStyle = '#6f8aa4';
      ctx.font = '600 10px ' + mono;
      ctx.fillText('西门 / 东南跑道 即将开启', VW / 2, 66);
    } else {
      ctx.fillStyle = '#5effb0';
      ctx.font = '800 15px ' + mono;
      ctx.fillText('撤离点已开启 · 前往西门 / 东南跑道', VW / 2, 47);
      ctx.fillStyle = '#6f8aa4';
      ctx.font = '600 10px ' + mono;
      ctx.fillText('南门丢包点需无背包', VW / 2, 66);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── 左上：行动时间 / 战利品 ──
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,24,0.68)';
  drawRoundRect(20, 20, 200, 102, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(67,217,245,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const mm = String(Math.floor(G.raidTime / 60)).padStart(2, '0');
  const ss = String(Math.floor(G.raidTime % 60)).padStart(2, '0');

  ctx.fillStyle = '#4d7a94';
  ctx.font = '600 10px ' + mono;
  ctx.fillText('RAID TIME', 34, 40);
  ctx.fillStyle = '#9fd8ef';
  ctx.font = '800 20px ' + mono;
  ctx.fillText(mm + ':' + ss, 34, 62);

  ctx.fillStyle = '#4d7a94';
  ctx.font = '600 10px ' + mono;
  ctx.fillText('HOSTILES', 132, 40);
  ctx.fillStyle = G.enemies.length > 12 ? '#ff5c7a' : '#ffa0b0';
  ctx.font = '800 18px ' + mono;
  ctx.fillText(String(G.enemies.length), 132, 62);

  // 携带的收集品：件数 + 估值（这些还不是钱，得撤出去卖）
  const relicN = relicCount();
  ctx.fillStyle = relicN ? 'rgba(255,208,138,0.9)' : 'rgba(255,208,138,0.35)';
  ctx.font = '800 14px ' + mono;
  ctx.fillText('¥ ' + fmtMoney(G.lootValue), 34, 86);
  ctx.fillStyle = relicN ? '#7fb8d6' : '#3f5d72';
  ctx.font = '600 9px ' + mono;
  ctx.fillText(relicN ? 'LOOT ×' + relicN : 'LOOT', 168, 86);

  // 警戒状态：静默 / 被察觉 / 警戒 / 交战中
  const combatN = G.combatCount | 0, alertN = G.alertCount | 0;
  const suspect = G.suspect || 0;
  const quiet = combatN === 0 && alertN === 0 && suspect < 0.05;

  let stTxt, stCol;
  if (combatN > 0) { stTxt = '交战中'; stCol = '#ff3b5c'; }
  else if (alertN > 0) { stTxt = '警 戒'; stCol = '#ffb347'; }
  else if (suspect >= 0.05) { stTxt = '被察觉'; stCol = '#ffd66b'; }
  else { stTxt = '静 默'; stCol = '#46e08a'; }

  ctx.globalAlpha = quiet ? 1 : 0.5 + Math.sin(G.time * 6) * 0.5;
  ctx.fillStyle = stCol;
  ctx.beginPath();
  ctx.arc(38, 108, 4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = stCol;
  ctx.font = '800 11px ' + mono;
  ctx.fillText(stTxt, 48, 112);

  ctx.fillStyle = '#4d7a94';
  ctx.font = '600 10px ' + mono;
  ctx.fillText(quiet ? '未被发现' : ((combatN + alertN) > 0 ? '已警觉 ' + (combatN + alertN) : '正在被发现'), 104, 112);

  // 灼烧状态（被燃烧瓶点着时出现）
  if (P.burnT > 0 && P.alive) {
    const bk = clamp(P.burnT / BOSS_FIRE.warm, 0, 1);
    const pulse = 0.65 + Math.sin(G.time * 16) * 0.35;
    ctx.fillStyle = 'rgba(255,140,58,' + pulse + ')';
    ctx.font = '800 10px ' + mono;
    ctx.fillText('灼 烧', 34, 130);
    ctx.fillStyle = 'rgba(255,120,40,0.22)';
    drawRoundRect(74, 121, 132, 8, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,140,58,' + (0.6 + pulse * 0.4) + ')';
    drawRoundRect(74, 121, 132 * bk, 8, 2); ctx.fill();
  }

  // 安全总监标记：位置暴露倒计时（全哈夫克共享你的坐标）
  if (G.directorMarkT > 0 && P.alive) {
    const pulse = 0.6 + Math.sin(G.time * 10) * 0.4;
    ctx.fillStyle = 'rgba(255,176,46,' + pulse + ')';
    ctx.font = '800 10px ' + mono;
    ctx.fillText('位置暴露', 34, 130);
    ctx.fillStyle = 'rgba(255,176,46,0.22)';
    drawRoundRect(74, 121, 132, 8, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,176,46,' + (0.55 + pulse * 0.4) + ')';
    drawRoundRect(74, 121, 132 * clamp(G.directorMarkT / (ENEMY_TYPES.director.mark || 10), 0, 1), 8, 2); ctx.fill();
  }
  ctx.restore();

  // ── 顶部中央：BOSS 血条 ──
  let bossRef = null, bossD = 1e9;
  for (const e of G.enemies) {
    if (e.type !== 'boss' && e.type !== 'director') continue;
    const dd = dist(e.x, e.y, P.x, P.y);
    if (dd < bossD) { bossD = dd; bossRef = e; }
  }
  const bossLabel = bossRef ? (bossRef.type === 'director' ? '安 全 总 监' : '赤 霄') : '';
  if (bossRef && (bossRef.state === 'combat' || fogVisibleAt(bossRef.x, bossRef.y))) {
    const bw = Math.min(440, VW * 0.44), bh = 9;
    const bx = (VW - bw) / 2;
    // BOSS 守在玩家正上方时身体会撞到顶部面板 —— 临时把面板挪到底部（滞回，避免来回跳）
    const bossSy = (bossRef.y - G.cam.y) * ZOOM;
    if (G.bossBarBottom) {
      if (bossSy - bossRef.r > 170) G.bossBarBottom = false;
    } else if (bossSy - bossRef.r < 90) {
      G.bossBarBottom = true;
    }
    const by = G.bossBarBottom ? VH - 150 : 54;
    ctx.save();
    ctx.fillStyle = 'rgba(18,6,10,0.78)';
    drawRoundRect(bx - 10, by - 22, bw + 20, 50, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,45,85,0.42)';
    ctx.lineWidth = 1;
    drawRoundRect(bx - 10, by - 22, bw + 20, 50, 3);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff5c7a';
    ctx.font = '800 11px ' + mono;
    ctx.fillText('BOSS', bx, by - 8);
    ctx.fillStyle = '#ffd0d8';
    ctx.font = '700 11px ' + mono;
    ctx.fillText(bossLabel, bx + 42, by - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,160,175,0.85)';
    ctx.font = '700 10px ' + mono;
    ctx.fillText(Math.ceil(bossRef.hp) + ' / ' + Math.round(bossRef.maxHp), bx + bw, by - 8);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    drawRoundRect(bx, by, bw, bh, 2); ctx.fill();
    const br = clamp(bossRef.hp / bossRef.maxHp, 0, 1);
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#ff2d55');
    bg.addColorStop(1, '#ff8a3a');
    ctx.fillStyle = bg;
    drawRoundRect(bx, by, Math.max(0, bw * br), bh, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    drawRoundRect(bx, by, bw, bh, 2); ctx.stroke();

    // 技能状态：重机枪 / 翻滚 / 燃烧瓶
    const pct = (v, max) => clamp(1 - v / max, 0, 1);
    const rollPct = pct(bossRef.rollCd, ENEMY_TYPES.boss.rollCd[1]);
    const molPct = pct(bossRef.molotovCd, ENEMY_TYPES.boss.molotovCd[1]);
    const hmgCd = ENEMY_TYPES.boss.hmg.cd[1];
    const hmgTxt = bossRef.hmgBurst > 0 ? '扫射中'
                 : bossRef.hmgSpin > 0 ? '预热'
                 : (bossRef.hmgCd <= 0 ? '就绪' : Math.round(pct(bossRef.hmgCd, hmgCd) * 100) + '%');
    ctx.fillStyle = bossRef.hmgBurst > 0 ? '#ff8a3a' : 'rgba(255,201,138,0.95)';
    ctx.font = '700 10px ' + mono;
    ctx.fillText('重机枪 ' + hmgTxt, bx, by + 23);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,201,138,0.95)';
    ctx.fillText('翻滚 ' + (rollPct >= 0.999 ? '就绪' : Math.round(rollPct * 100) + '%'), bx + bw / 2, by + 23);
    ctx.textAlign = 'right';
    ctx.fillText('燃烧瓶 ' + (molPct >= 0.999 ? '就绪' : Math.round(molPct * 100) + '%'), bx + bw, by + 23);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── 右上：击杀分 ──
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4d7a94';
  ctx.font = '600 10px ' + mono;
  ctx.fillText('SCORE', VW - 30, 36);
  ctx.fillStyle = '#dff4ff';
  ctx.font = '800 26px ' + mono;
  ctx.fillText(G.score.toLocaleString(), VW - 30, 64);
  if (G.combo > 1) {
    ctx.globalAlpha = clamp(G.comboTimer / 2.6, 0, 1);
    ctx.fillStyle = '#ffd66b';
    ctx.font = '800 14px ' + mono;
    ctx.fillText('x' + G.combo + ' 连击', VW - 30, 86);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ── 左下：生命 / 护甲 / 体力 ──
  const hpX = 30, hpY = VH - 92, hpW = 230, hpH = 14;
  ctx.save();
  ctx.fillStyle = '#4d7a94';
  ctx.font = '600 10px ' + mono;
  ctx.fillText('HP', hpX, hpY - 8);

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  drawRoundRect(hpX, hpY, hpW, hpH, 2);
  ctx.fill();

  const hpRatio = clamp(P.hp / P.maxHp, 0, 1);
  const hpGrad = ctx.createLinearGradient(hpX, 0, hpX + hpW, 0);
  if (hpRatio > 0.5) { hpGrad.addColorStop(0, '#2bd9a0'); hpGrad.addColorStop(1, '#46e08a'); }
  else if (hpRatio > 0.25) { hpGrad.addColorStop(0, '#ffb347'); hpGrad.addColorStop(1, '#ffd66b'); }
  else { hpGrad.addColorStop(0, '#ff2d55'); hpGrad.addColorStop(1, '#ff6b81'); }
  ctx.fillStyle = hpGrad;
  drawRoundRect(hpX, hpY, Math.max(0, hpW * hpRatio), hpH, 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(120,190,230,0.25)';
  ctx.lineWidth = 1;
  drawRoundRect(hpX, hpY, hpW, hpH, 2);
  ctx.stroke();

  ctx.fillStyle = '#0a1018';
  ctx.font = '800 10px ' + mono;
  ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(P.hp) + ' / ' + P.maxHp, hpX + hpW - 6, hpY + 11);
  ctx.textAlign = 'left';

  // 护甲：等级 + 耐久条（磨光就整条消失 —— 裸奔没有假安全感）
  if (P.armorLv > 0 && P.armorHp > 0) {
    const ay = hpY + 20, aw = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawRoundRect(hpX, ay, aw, 5, 2);
    ctx.fill();
    ctx.fillStyle = armorLvColor(P.armorLv);
    drawRoundRect(hpX, ay, aw * clamp(P.armorHp / Math.max(1, P.armorMax), 0, 1), 5, 2);
    ctx.fill();
    ctx.fillStyle = '#5f9fc4';
    ctx.font = '600 9px ' + mono;
    ctx.fillText((ARMORS[P.armorId] || ARMORS[0]).short + ' · ' + Math.floor(P.armorHp) + '/' + Math.floor(P.armorMax), hpX + aw + 10, ay + 6);
  }

  /* 体力条：常驻 —— 能不能跑全看这一条 */
  const stW = 150, stH = 5;
  const stY = hpY + 30;
  {
    const sr = clamp(P.stamina / SPRINT.max, 0, 1);
    const low = P.stamina < SPRINT.resumeAt;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawRoundRect(hpX, stY, stW, stH, 2);
    ctx.fill();
    ctx.fillStyle = P.exhaust > 0 ? 'rgba(255,90,120,0.85)'
                  : low ? 'rgba(255,179,71,0.85)' : 'rgba(67,217,245,0.85)';
    drawRoundRect(hpX, stY, Math.max(1, stW * sr), stH, 2);
    ctx.fill();
    /* resumeAt 刻度：跑到低于这条线就起不来了，得先回上来 */
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(hpX + stW * (SPRINT.resumeAt / SPRINT.max) - 0.5, stY, 1, stH);

    let stTxt, stCol;
    if (legBroken()) { stTxt = P.deb.fissure > 0 ? '骨裂 · 跑不了' : '腿折 · 跑不了'; stCol = '#ff785a'; }
    else if (P.exhaust > 0) { stTxt = '力竭 · ' + P.exhaust.toFixed(1) + 's'; stCol = '#ff5a78'; }
    else if (P.sprinting) { stTxt = '跑 步'; stCol = '#8ef2ff'; }
    else { stTxt = '体力 ' + Math.round(P.stamina); stCol = low ? '#ffb347' : '#43d9f5'; }
    ctx.fillStyle = stCol;
    ctx.font = '700 9px ' + mono;
    ctx.fillText(stTxt, hpX + stW + 10, stY + 6);
  }

  /* 状态条：优先显示冻伤（三层满格），没有冻伤就显示流血层数 */
  const stY2 = hpY + 40;
  if (P.chill > 0 || P.deb.bleed > 0) {
    const chill = P.chill > 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawRoundRect(hpX, stY2, stW, stH, 2);
    ctx.fill();
    ctx.fillStyle = chill ? 'rgba(127,212,255,0.85)' : 'rgba(255,90,120,0.8)';
    drawRoundRect(hpX, stY2, Math.max(4, stW * (chill ? Math.min(1, P.chill / 3) : Math.min(1, P.deb.bleed / 3))), stH, 2);
    ctx.fill();
    ctx.fillStyle = chill ? '#7fd4ff' : '#ff5a78';
    ctx.font = '700 9px ' + mono;
    ctx.fillText(chill ? '冻伤 ×' + Math.round(P.chill) + ' · 移速 -' + Math.round(P.chill * 7) + '%' : '流血 ×' + P.deb.bleed,
                 hpX + stW + 10, stY2 + 6);
  }
  ctx.restore();

  /* 创伤标签：挂在左上行动面板下面，一行放不下就换行 */
  drawStatusTags(mono);

  // ── 补给计数（中下偏左）──
  ctx.save();
  const supY = VH - 30;
  ctx.fillStyle = 'rgba(10,16,24,0.7)';
  drawRoundRect(hpX, supY - 18, 190, 26, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(67,217,245,0.15)';
  ctx.stroke();

  ctx.font = '700 11px ' + mono;
  ctx.fillStyle = medTotal() > 0 ? '#46e08a' : '#3d5a6a';
  ctx.fillText('[5] ✚ ' + medTotal(), hpX + 10, supY);
  ctx.restore();

  // ── 右下：当前槽位 / 弹药 ──
  ctx.save();
  const wx = VW - 30;
  const wy = VH - 44;
  const W = weaponStats(P.weapon);
  const inHand = P.curSlot === 'primary' || P.curSlot === 'secondary' || P.curSlot === 'pistol';
  const a = inHand ? currentAmmo() : null;

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7fb8d6';
  ctx.font = '700 12px ' + mono;
  const slotTag = (SLOT_DEFS.find(d => d.id === P.curSlot) || SLOT_DEFS[0]);
  const carePk = P.curSlot === 'medkit' ? carePickNow() : null;
  /* 手枪槽的槽位名和枪种名都是「手枪」，别写成"手枪 · 手枪 · G17" */
  const headTxt = inHand
    ? (slotTag.cn + ' · ' + W.name)
    : (slotTag.cn + ' · ' + (P.curSlot === 'melee'
        ? (MELEES[P.melee] || MELEES[STARTER_MELEE]).name
        : (carePk ? careName(carePk) : '无治疗物品')));
  ctx.fillText(headTxt, wx, wy - 58);      // 下面那行 wy-44 是小方格弹匣条

  if (inHand) {
    /* 弹种一行：口径 + 弹级 —— 打不动甲的时候先看这里是不是白弹 */
    const AT = ammoTier(a.tier == null ? 1 : a.tier);
    const CAL = CALIBERS[a.cal] || CALIBERS['919'];
    ctx.textAlign = 'right';
    ctx.font = '700 10px ' + mono;
    ctx.fillStyle = AT.color;
    /* 放在「1主 2副…」快捷栏上面一行，那里正好空着 */
    ctx.fillText(CAL.short + ' · ' + AT.grade + ' ' + AT.name + ' · 穿甲 ' + AT.lv, wx, wy - 90);

    const magStr = String(a.mag).padStart(2, '0');
    const resStr = '/ ' + reserveOf(a.cal || calOfWeapon(P.weapon));
    ctx.font = '800 34px ' + mono;
    const magW = ctx.measureText(magStr).width;
    ctx.font = '700 16px ' + mono;
    const resW = ctx.measureText(resStr).width;
    const bLeft = wx - (magW + 10 + resW);

    ctx.textAlign = 'left';
    ctx.fillStyle = a.mag === 0 ? '#ff4060' : '#ffffff';
    ctx.font = '800 34px ' + mono;
    ctx.fillText(magStr, bLeft, wy);
    ctx.fillStyle = '#4d7a94';
    ctx.font = '700 16px ' + mono;
    ctx.fillText(resStr, bLeft + magW + 10, wy);

    ctx.textAlign = 'right';
    ctx.font = '700 10px ' + mono;
    const modeTxt = W.mode === 'auto' ? '全自动' : (W.mode === 'burst' ? '三连点射' : '半自动');
    const modN = W.modCount || 0;
    ctx.fillStyle = P.ads > 0.5 ? 'rgba(150,228,255,0.95)' : 'rgba(120,170,200,0.6)';
    ctx.fillText(modeTxt + (P.ads > 0.5 ? ' · 开镜' : ' · 右键开镜') + (modN ? ' · 改' + modN : ''), wx, wy + 16);

    const cells = Math.min(W.mag, 20);
    const cw = 4, gap = 2;
    const totalW = cells * (cw + gap);
    for (let i = 0; i < cells; i++) {
      const filled = i < Math.ceil(cells * (a.mag / W.mag));
      ctx.fillStyle = filled ? AT.color : 'rgba(70,100,125,0.3)';
      ctx.fillRect(wx - totalW + i * (cw + gap), wy - 44, cw, 4);
    }
  } else if (P.curSlot === 'melee') {
    const M = MELEES[P.melee] || MELEES[STARTER_MELEE];
    ctx.textAlign = 'right';
    ctx.font = '800 30px ' + mono;
    ctx.fillStyle = M.color;
    ctx.fillText(String(M.dmg), wx, wy);
    ctx.font = '700 12px ' + mono;
    ctx.fillStyle = '#4d7a94';
    ctx.fillText('/ 单刀', wx, wy + 16);
    ctx.font = '700 10px ' + mono;
    ctx.fillStyle = P.meleeCd > 0 ? 'rgba(120,170,200,0.4)' : 'rgba(150,228,255,0.9)';
    ctx.fillText((1 / M.rate).toFixed(1) + ' 刀/秒 · 静音 · 左键挥刀', wx, wy + 32);
  } else {
    /* 医疗槽：按当前选中的物品显示 —— 支数 / 卷数 / 剩余刀数
       这里比枪械多一行说明，整体上移一点，别顶到屏幕底边 */
    const wy2 = wy - 24;
    const pk = carePickNow();
    const kind = pk ? careKindOf(pk) : 'med';
    const cid2 = pk ? careIdOf(pk) : '';
    const col2 = pk ? careColor(pk) : '#3d5a6a';
    const bigTxt = pk ? (kind === 'surg' ? (careCount(pk) + ' 次') : ('×' + careCount(pk))) : '×0';

    ctx.textAlign = 'right';
    ctx.font = '800 28px ' + mono;
    ctx.fillStyle = col2;
    ctx.fillText(bigTxt, wx, wy2);

    /* 医疗包是剩余耐久，其它按"还剩多少份"的比例 */
    const bw2 = 132;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawRoundRect(wx - bw2, wy2 + 7, bw2, 4, 2); ctx.fill();
    let pct2 = 0;
    if (pk && kind === 'med') pct2 = clamp(medLeftOf(cid2) / MEDKITS[cid2].dur, 0, 1);
    else if (pk && kind === 'stop') pct2 = clamp(careCount(pk) / Math.max(2, (STOPS[cid2] || STOPS.bandage).uses), 0, 1);
    else if (pk && kind === 'surg') pct2 = clamp(careCount(pk) / SURGERIES[cid2].uses, 0, 1);
    if (pk) {
      ctx.fillStyle = col2;
      drawRoundRect(wx - bw2, wy2 + 7, Math.max(1, bw2 * pct2), 4, 2); ctx.fill();
    }

    let sub1 = '', sub2 = '', sub2warn = false;
    if (!pk) {
      sub1 = '没有治疗物品 · 回大厅补给';
    } else if (kind === 'med') {
      const MD = MEDKITS[cid2];
      sub1 = MD.hps + ' 血/秒 · 启动 ' + MD.wind + 's · 耐久 ' + Math.ceil(medLeftOf(cid2)) + '/' + MD.dur
        + (P.deb.bleed > 0 ? ' · 流血拖慢 25%' : '');
    } else if (kind === 'stop') {
      const S = STOPS[cid2];
      if (S.pain) {
        sub1 = '单次止痛 ' + S.pain + 's · 读条 ' + S.sec + 's';
        sub2 = P.painT > 0 ? ('止痛还剩 ' + Math.ceil(P.painT) + 's') : '受伤 -10% · 屏蔽臂伤与黑边';
        sub2warn = P.painT > 0;
      } else {
        sub1 = (S.layers > 1 ? '止全部流血' : '止 1 层流血') + ' · 读条 ' + S.sec + 's · 一次性';
        sub2 = P.deb.bleed > 0 ? ('当前流血 ×' + P.deb.bleed) : '现在没有流血';
        sub2warn = P.deb.bleed <= 0;
      }
    } else {
      const S = SURGERIES[cid2];
      const t = surgTarget();
      sub1 = '读条 ' + S.sec + 's · 剩 ' + careCount(pk) + '/' + S.uses + ' 次';
      sub2 = t ? ('将处理：' + t.label) : '没有需要手术的伤';
      sub2warn = !t;
    }
    ctx.font = '700 10px ' + mono;
    ctx.fillStyle = 'rgba(120,170,200,0.65)';
    ctx.fillText(sub1, wx, wy2 + 20);
    if (sub2) {
      ctx.fillStyle = sub2warn ? 'rgba(255,120,110,0.85)' : 'rgba(150,228,255,0.85)';
      ctx.fillText(sub2, wx, wy2 + 31);
    }

    const winding = P.medOn && P.medWind > 0;
    const stateY = sub2 ? wy2 + 42 : wy2 + 31;
    ctx.fillStyle = winding ? '#ffd66b' : (P.medOn ? '#8fffc4' : 'rgba(150,228,255,0.85)');
    ctx.fillText(
      winding ? (careKindOf(P.medOn) === 'surg'
        ? ('手术中 ' + P.medWind.toFixed(1) + 's · 右键收手')
        : ('启动中 ' + P.medWind.toFixed(1) + 's · 右键收手'))
        : (P.medOn ? (careKindOf(P.medOn) === 'med'
            ? ('回血 ' + P.medHealT.toFixed(1) + 's · 右键收手')
            : '处理中 · 右键收手')
          : '短按 5 自动用药 · 长按 5 换药'),
      wx, stateY);
  }

  /* 原地治疗：枪还在手上（上面是枪的面板），把治疗状态单独画一行 */
  if (P.medOn && P.curSlot !== 'medkit') {
    const winding2 = P.medWind > 0;
    ctx.textAlign = 'right';
    ctx.font = '700 11px ' + mono;
    ctx.fillStyle = winding2 ? '#ffd66b' : '#8fffc4';
    ctx.fillText(winding2 ? (careKindOf(P.medOn) === 'surg'
        ? '手术中 ' + P.medWind.toFixed(1) + 's · 右键收手'
        : '启动中 ' + P.medWind.toFixed(1) + 's · 右键收手')
      : (careKindOf(P.medOn) === 'med'
        ? '回血 ' + P.medHealT.toFixed(1) + 's · 右键收手'
        : '处理中 · 右键收手'), wx, wy + 32);
  }

  if (inHand && P.reloading > 0) {
    const prog = 1 - P.reloading / W.reload;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd66b';
    ctx.font = '700 11px ' + mono;
    ctx.fillText('换弹中', VW / 2, VH - 132);
    const bw = 130;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    drawRoundRect(VW / 2 - bw / 2, VH - 122, bw, 5, 2);
    ctx.fill();
    ctx.fillStyle = '#ffd66b';
    drawRoundRect(VW / 2 - bw / 2, VH - 122, bw * prog, 5, 2);
    ctx.fill();
    ctx.textAlign = 'right';
  }

  /* 快捷栏：固定 1~5 五个槽，空的画暗 */
  let ox = wx;
  ctx.font = '700 10px ' + mono;
  for (let i = SLOT_DEFS.length - 1; i >= 0; i--) {
    const sd = SLOT_DEFS[i];
    const isCur = sd.id === P.curSlot;
    const ok = slotReady(sd.id);
    ctx.fillStyle = isCur ? '#43d9f5' : (ok ? 'rgba(120,170,200,0.7)' : 'rgba(70,95,115,0.32)');
    ctx.fillText(sd.key + sd.cn.charAt(0), ox, wy - 74);
    ox -= 24;
  }
  ctx.restore();

  // ── 搜刮提示 ──
  if (G.searchTarget && !G.lootPanel) {
    const c = G.searchTarget;
    const CC = containerOf(c.kind);
    const left = crateLeft(c);
    const again = c.opened && left > 0;
    const store = c.opened && left === 0;
    const sx = (c.x - G.cam.x) * ZOOM, sy = (c.y - G.cam.y) * ZOOM;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 12px ' + mono;
    ctx.fillStyle = again ? 'rgba(255,206,138,0.95)' : store ? 'rgba(140,220,160,0.95)' : CC.dim + '0.95)';
    ctx.fillText(again ? ((() => { const l = crateItems(c).filter(x => !x.taken); return l.length && l.every(x => x.own) ? ('[F] 打开 · 存着 ' + left + ' 件') : ('[F] 接着翻 · 还剩 ' + left + ' 件'); })())
      : store ? ('[F] 打开 ' + CC.name + ' · 可存放物品')
      : ('[F] 搜刮' + CC.name), sx, sy + 46);
    ctx.font = '600 9px ' + mono;
    ctx.fillStyle = 'rgba(150,185,210,0.55)';
    ctx.fillText(again ? '上次没拿完' : store ? '已搜空 · 拖身上的东西进来存放' : CC.hint, sx, sy + 60);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ── 战利品面板：改成 HTML 的左右分栏网格（见 lootRender），canvas 这边不再画 ──

  // ── 长按 5 的选药盘 ──
  drawMedSelect(mono);

  // ── 撤离进度 ──
  if (G.extractT > 0.01) {
    const holdNow = (G.inExtract && G.inExtract.hold) || G.extractHold;
    const prog = clamp(G.extractT / holdNow, 0, 1);
    const cx = VW / 2, cy = VH * 0.30;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 13px ' + mono;
    ctx.fillStyle = '#8fffc4';
    ctx.fillText('撤 离 中', cx, cy - 52);

    ctx.strokeStyle = 'rgba(70,224,138,0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, TAU); ctx.stroke();

    ctx.strokeStyle = '#5effb0';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.fillStyle = '#eafff5';
    ctx.font = '800 20px ' + mono;
    ctx.fillText(Math.ceil(holdNow - G.extractT) + '', cx, cy + 7);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ── 受击方向：身后是雾看不见，至少让人知道子弹从哪来 ──
  if (P.hurtDirT > 0 && P.alive) {
    const rel = P.hurtDir;                               // 相机不旋转，世界角就是屏幕角
    const fade = Math.min(1, P.hurtDirT / 0.6);
    const pulse = 0.72 + 0.28 * Math.sin(G.time * 20);
    const R = Math.min(VW, VH) * 0.30;
    ctx.save();
    ctx.translate(VW / 2, VH / 2);
    ctx.rotate(rel);
    ctx.globalAlpha = fade * pulse;
    ctx.strokeStyle = 'rgba(255,64,96,0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R, -0.30, 0.30);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#ff4060';
    ctx.shadowColor = 'rgba(255,64,96,0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(R + 16, 0);
    ctx.lineTo(R - 12, -11);
    ctx.lineTo(R - 12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── 干员技能栏（底部正中）──
  drawSkillBar(mono);

  // ── 准星 ──
  drawCrosshair(mono);
}

/* 干员技能栏：底部正中三格 —— G 战术道具 / V 小技能 / X 大招。
   冷却时整格压黑并盖一层从下往上退的遮罩，储备用下方小圆点表示。 */
function drawSkillBar(mono) {
  const op = opDef();
  if (!op || !P.op || !P.alive) return;
  const S = P.op;
  const size = 54, gap = 8, total = size * 3 + gap * 2;
  const x0 = Math.round(VW / 2 - total / 2);
  const y0 = VH - 84;

  const xCharged = (op.x.charges || 1) > 1;      // 激素枪这类「按发充能」的大招
  const rows = [
    { k: 'G', cn: op.g.short, col: '#c8d6de', cd: S.g.cd, max: op.g.cd, use: S.g.use, cap: op.g.charges, rech: S.g.recharge },
    { k: 'V', cn: op.v.short, col: '#ffd66b', cd: S.v.cd, max: op.v.cd, use: S.v.use, cap: op.v.charges, rech: S.v.recharge },
    xCharged
      ? { k: 'X', cn: op.x.short, col: '#8dffc0',
          cd: S.x.use <= 0 ? S.x.recharge : 0, max: op.x.cd,
          use: S.x.use, cap: op.x.charges,
          rech: S.x.use < op.x.charges ? S.x.recharge : 0 }
      : { k: 'X', cn: op.x.short, col: '#ff8a4c',
          /* 没存货时显示的是「回充还有多久」，不是那个 0.55 秒的出弹间隔 */
          cd: S.x.on ? S.x.t : (S.x.use <= 0 ? S.x.recharge : S.x.cd),
          max: S.x.on ? op.x.dur : op.x.cd,
          use: S.x.on ? 1 : S.x.use, cap: 1, on: S.x.on },
  ];

  ctx.save();
  ctx.textAlign = 'center';

  for (let i = 0; i < rows.length; i++) {
    const it = rows[i];
    const x = x0 + i * (size + gap);
    const ready = it.on || (it.cd <= 0 && it.use > 0);
    const inMode = modeOn() && P.op.mode.k === it.k;

    /* 底板 */
    ctx.fillStyle = 'rgba(8,14,20,0.72)';
    drawRoundRect(x, y0, size, size, 3);
    ctx.fill();
    ctx.strokeStyle = inMode ? 'rgba(150,255,200,0.95)'
                    : it.on ? 'rgba(255,138,76,0.95)'
                    : ready ? 'rgba(140,200,230,0.55)' : 'rgba(90,130,160,0.28)';
    ctx.lineWidth = 1.4;
    drawRoundRect(x, y0, size, size, 3);
    ctx.stroke();

    /* 键位 + 名称 */
    ctx.fillStyle = it.on ? '#ffd0b0' : ready ? it.col : 'rgba(120,160,190,0.45)';
    ctx.font = '800 19px ' + mono;
    ctx.fillText(it.k, x + size / 2, y0 + 25);
    ctx.fillStyle = it.on ? 'rgba(255,190,160,0.9)' : ready ? 'rgba(190,225,245,0.85)' : 'rgba(120,160,190,0.4)';
    ctx.font = '700 9px ' + mono;
    ctx.fillText(it.cn, x + size / 2, y0 + 39);

    /* 储备点：已备的实心；正在回充的那一层画扇形进度 + 右上角小秒数 */
    if (it.cap > 1) {
      for (let d = 0; d < it.cap; d++) {
        const dx = x + size / 2 + (d - (it.cap - 1) / 2) * 10, dy = y0 + size - 9;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.6, 0, TAU);
        ctx.fillStyle = d < it.use ? it.col : 'rgba(110,150,180,0.22)';
        ctx.fill();
        if (d === it.use && it.rech > 0 && d < it.cap) {
          const frac = clamp(1 - it.rech / it.max, 0, 1);
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.arc(dx, dy, 2.6, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
          ctx.closePath();
          ctx.fillStyle = it.col;
          ctx.globalAlpha = 0.75;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(210,235,250,0.75)';
          ctx.font = '700 8px ' + mono;
          ctx.textAlign = 'right';
          ctx.fillText(Math.ceil(it.rech) + '', x + size - 3, y0 + 11);
          ctx.textAlign = 'center';
        }
      }
    }

    /* 冷却遮罩 */
    if (!it.on && it.cd > 0) {
      const k = clamp(it.cd / it.max, 0, 1);
      ctx.fillStyle = 'rgba(3,7,11,0.74)';
      ctx.fillRect(x + 1, y0 + 1, size - 2, (size - 2) * k);
      ctx.fillStyle = 'rgba(220,240,255,0.9)';
      ctx.font = '800 15px ' + mono;
      ctx.fillText(Math.ceil(it.cd) + '', x + size / 2, y0 + size / 2 + 6);
    }
  }

  /* 手上拿着东西时的一行提示 */
  if (modeOn()) {
    const M = P.op.mode;
    const MK = MODE_KEY[M.id];
    if (MK) {
      let txt = MK.text, col = '#a8f5c8';
      if (M.id === 'frag') {
        if (M.lit) { txt = '引信 ' + M.fuse.toFixed(1) + 's · 松手投出'; col = M.fuse < 1.6 ? '#ff8f8f' : '#ffd0a0'; }
      } else if (M.id === 'shockbow') {
        txt = '左键射箭 · 右键 ' + (M.bounce ? '反弹 · 开' : '反弹 · 关') + ' · V 收弓';
      } else if (M.id === 'coverdev') {
        txt = '左键放置 · 右键 ' + (M.vert ? '竖向' : '横向') + ' · V 收起';
      } else if (M.id === 'healgun') {
        txt = '左键注射 · 右键瞄准 · 剩 ' + P.op.x.use + ' 发 · X 收起';
      } else if (M.id === 'loiter' && M.controlling) {
        const lm = ctlLoiter();
        txt = 'WASD 操控导弹 · 左键引爆 · 剩 ' + (lm ? Math.max(0, Math.round((lm.max - lm.dist) / 18)) : 0) + 'm' +
          (lm ? ' · 控制剩 ' + Math.max(0, lm.ctlT).toFixed(1) + 's' : '');
        col = lm && lm.ctlT < 2.5 ? '#ff8f8f' : '#ffc98a';
      }
      ctx.font = '700 11px ' + mono;
      ctx.textAlign = 'center';
      const w = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(6,12,18,0.8)';
      drawRoundRect(VW / 2 - w / 2 - 11, y0 - 40, w + 22, 21, 3);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(txt, VW / 2, y0 - 25.5);
    }
  }

  /* 外骨骼剩余时间：一条压在技能栏上方 */
  if (S.x.on) {
    const k = clamp(S.x.t / op.x.dur, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    drawRoundRect(x0, y0 - 11, total, 4, 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a4c';
    drawRoundRect(x0, y0 - 11, Math.max(2, total * k), 4, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffbd94';
    ctx.font = '700 9px ' + mono;
    ctx.fillText('外骨骼 ' + S.x.t.toFixed(1) + 's', x0 + total + 8, y0 - 6);
  }

  ctx.restore();
  ctx.textAlign = 'left';
}

/* 命中确认：打在准星上的四道斜线 —— 白=命中 / 蓝灰=被甲挡住 / 红=击杀。
   只有玩家子弹会触发；duration 固定 0.24s，越接近结束越淡、越往外张。 */
function spawnHitmark(kind) {
  G.hitmark = { at: (G.time || 0) + 0.24, kind: kind || 'hit' };
  if (kind === 'kill') Sfx.hitKill();
}

function drawCrosshair(mono) {
  const x = mouse.x, y = mouse.y;
  const w = weaponStats(P.weapon);
  const ads = P.ads || 0;
  const gap = (5 + P.recoil * 1.2 + w.spread * 130) * (1 - ads * 0.60);   // 开镜收束
  const len = 8 + ads * 3;

  ctx.save();
  ctx.strokeStyle = P.reloading > 0 ? 'rgba(255,214,107,0.8)' : aimColor();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
  ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
  ctx.stroke();

  ctx.fillStyle = aimColor();
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.globalAlpha = 1;

  /* 开镜：细镜环 + 四角括号，越开越亮，像贴着镜筒看 */
  if (ads > 0.02) {
    const k = clamp((ads - 0.02) / 0.98, 0, 1);
    const R = 34 - 10 * k;
    ctx.globalAlpha = k * 0.62;
    ctx.strokeStyle = 'rgba(150,228,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    // 四角短括号
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + Math.PI / 4;
      for (const d of [-1, 1]) {
        const a = a0 + d * 0.16;
        ctx.moveTo(x + Math.cos(a) * (R + 3), y + Math.sin(a) * (R + 3));
        ctx.lineTo(x + Math.cos(a) * (R + 11), y + Math.sin(a) * (R + 11));
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (P.reloading > 0) {
    const prog = 1 - P.reloading / w.reload;
    ctx.strokeStyle = 'rgba(255,214,107,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, gap + 12, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
    ctx.stroke();
  }

  /* 命中确认（hitmark）：四道 45° 斜线从内向外张开，击杀变红并多一圈收束环 */
  const hm = G.hitmark;
  if (hm && G.time < hm.at) {
    const p = clamp(1 - (hm.at - G.time) / 0.24, 0, 1);
    const kill = hm.kind === 'kill';
    const col = kill ? '#ff5c5c' : (hm.kind === 'armor' ? '#a8c4d8' : '#eef7ff');
    const a = 1 - p * p;
    const r0 = 7 + p * 5, r1 = r0 + 7 * (1 - p * 0.45);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = col;
    ctx.globalAlpha = a;
    ctx.lineWidth = kill ? 3 : 2.2;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(sx * r0, sy * r0);
      ctx.lineTo(sx * r1, sy * r1);
    }
    ctx.stroke();
    if (kill) {
      ctx.globalAlpha = a * 0.45;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r1 + 5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   16. 主循环
   ══════════════════════════════════════════════════════════ */
let lastT = 0;

function update(dt) {
  if (G.scene !== 'playing') return;

  G.time += dt;
  G.raidTime += dt;
  G.comboTimer = Math.max(0, G.comboTimer - dt);
  if (G.comboTimer <= 0) G.combo = 0;

  updatePlayer(dt);
  updateEnemies(dt);
  updateFactionWars(dt);
  updateBullets(dt);
  updateNades(dt);
  updateSmokes(dt);
  updateGls(dt);
  updateMagbombs(dt);
  updateShocks(dt);
  updateFrags(dt);
  updateFlashes(dt);
  updateBlades(dt);
  updateFootprints(dt);
  updateGasBombs(dt);
  updateMists(dt);
  updateAdrFields(dt);
  updateSwarms(dt);
  updateArrows(dt);
  updateEZones(dt);
  updateScanPings(dt);
  updateHealFields(dt);
  updateDrones(dt);
  updateCovers(dt);
  updateLoiters(dt);
  updateIceBolts(dt);
  updateIcePots(dt);
  updateMolotovs(dt);
  updateRockets(dt);
  updateFires(dt);
  updateParticles(dt);
  updateSearch(dt);
  updateSwitchTimer(dt);
  updateExtract(dt);
  updateCamera(dt);
  updateFog(dt);
  updateAchTracker();
  updateRegionBanner(dt);

  // 增援
  G.callCd = Math.max(0, G.callCd - dt);
  G.reinforceT -= dt;
  if (G.reinforceT <= 0 && G.enemies.length < (G.enemyCap || 42)) {
    spawnReinforce();
    G.reinforceT = reinforceGap(G.reinforceWave);
  }

  if (G.decals.length > 170) G.decals.splice(0, G.decals.length - 170);
}

/* ══════════════════════════════════════════════════════════
   14.5 战争迷雾
   ──────────────────────────────────────────────────────────
   三态分层：
     · 未探索  —— 近乎全黑，看不到任何东西
     · 已探索  —— 记忆层，建筑/箱子/撤离点保留暗色轮廓
     · 视野内  —— 以玩家为中心的光圈，被墙体遮挡形成阴影
   用一张低分辨率 alpha 图缩放绘制，得到柔和的雾边。
   ══════════════════════════════════════════════════════════ */
const FOG = {
  cell: 26,          // 每格对应的世界像素
  cols: 0, rows: 0,
  seen: null,        // 是否探索过
  vis: null,         // 本帧是否可见
  block: null,       // 静态墙体遮挡
  noise: null,       // 雾面纹理
  cv: null, cx: null, img: null,
  timer: 0,
  ready: false,
  lastAds: 0,
  // 开镜会动态改这三个值：视锥更窄、看得更远（每帧在 updateFog 里重算）
  dyn: { light: 430, core: 1.06, edge: 1.46, cosCore: Math.cos(1.06), cosEdge: Math.cos(1.46) },
};

/* 开镜到满时的视野参数：半角 61°→35°、余光 84°→49°，视距 ×1.5 */
const ADS_FOV_CORE = 0.61;
const ADS_FOV_EDGE = 0.85;
const ADS_LIGHT_MUL = 0.50;

const FOG_LIGHT = 430;      // 视野半径（大于盾兵视野 350，不会被看不见的敌人点名）
const FOG_RAYS = 300;       // 射线数量
const FOG_STEP = 9;         // 射线步长

/* ── 视锥 ──────────────────────────────────────────────
   只看得到正面。身后不点亮，也不画敌人：
     · CORE 以内 —— 主视野，正常亮度
     · CORE…EDGE —— 余光，向外迅速衰减
     · EDGE 以外 —— 背后，压成浓雾（只剩极暗的地形记忆）
   NEAR 是贴身感知圈，脚下这一小块不受朝向限制，
   免得贴脸站人时脚下也是黑的。                      */
const FOG_FOV_CORE = 1.06;                      // 主视野半角 ≈ 61°
const FOG_FOV_EDGE = 1.46;                      // 余光半角   ≈ 84°
const FOG_COS_CORE = Math.cos(FOG_FOV_CORE);
const FOG_COS_EDGE = Math.cos(FOG_FOV_EDGE);
const FOG_NEAR = 128;                           // 贴身感知半径（窄道里不至于几乎全黑）
const FOG_A_BACK = 0.905;                       // 背后记忆层
const FOG_A_DARK = 0.994;                       // 背后未探索

function initFog() {
  FOG.cols = Math.ceil(WORLD.w / FOG.cell);
  FOG.rows = Math.ceil(WORLD.h / FOG.cell);
  const n = FOG.cols * FOG.rows;

  FOG.seen = new Uint8Array(n);
  FOG.vis = new Uint8Array(n);
  FOG.block = new Uint8Array(n);
  FOG.timer = 0;
  FOG.lastX = -99999;
  FOG.lastY = -99999;
  FOG.lastAim = P.aim || 0;
  FOG.lastAds = 0;

  // 低频噪声，用于让雾面呈现云絮般的浓淡，而不是一块死黑
  FOG.noise = new Float32Array(n);
  for (let i = 0; i < n; i++) FOG.noise[i] = Math.random();
  const tmp = new Float32Array(n);
  for (let r = 0; r < FOG.rows; r++) {
    for (let c = 0; c < FOG.cols; c++) {
      let s = 0, k = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= FOG.rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= FOG.cols) continue;
          s += FOG.noise[rr * FOG.cols + cc]; k++;
        }
      }
      tmp[r * FOG.cols + c] = s / k;
    }
  }
  FOG.noise = tmp;

  if (!FOG.cv) {
    FOG.cv = document.createElement('canvas');
    FOG.cx = FOG.cv.getContext('2d');
  }
  FOG.cv.width = FOG.cols;
  FOG.cv.height = FOG.rows;
  FOG.img = FOG.cx.createImageData(FOG.cols, FOG.rows);

  // 把障碍物栅格化成遮挡掩码，供射线 O(1) 查询
  const c = FOG.cell;
  for (const o of G.obstacles) {
    const c0 = Math.floor(o.x / c), c1 = Math.floor((o.x + o.w) / c);
    const r0 = Math.floor(o.y / c), r1 = Math.floor((o.y + o.h) / c);
    for (let r = r0; r <= r1; r++) {
      if (r < 0 || r >= FOG.rows) continue;
      const base = r * FOG.cols;
      for (let k = c0; k <= c1; k++) {
        if (k < 0 || k >= FOG.cols) continue;
        FOG.block[base + k] = 1;
      }
    }
  }

  FOG.ready = true;
  updateFog(1);
}

/* 视线：从玩家位置向前方扇形投射射线，撞墙即停。
   只有落在正面的射线才点亮 vis，因此背后的敌人不会被绘制。 */
function updateFog(dt) {
  if (!FOG.ready) return;
  const mdx = P.x - FOG.lastX, mdy = P.y - FOG.lastY;
  const moved = mdx * mdx + mdy * mdy > 900;   // 位移超过 30px 立刻刷新，避免冲刺时视野掉队
  const turned = Math.abs(angleDiff(P.aim, FOG.lastAim || 0)) > 0.03;  // 转身立刻刷新
  const adsChanged = Math.abs((P.ads || 0) - (FOG.lastAds || 0)) > 0.02;   // 开镜/收镜也要重算
  const pingN = G.scanPings ? G.scanPings.length : 0;
  const pingChanged = pingN !== (FOG.pingN | 0);   // 侦察视野开了/到期：强制重算一次
  /* 巡飞弹在飞：镜头跟着导弹走，迷雾必须跟着导弹重算 */
  let ml = null, mlN = 0;
  for (const m of G.loiters) if (!m.sub) { if (!ml) ml = m; mlN++; }
  const mlChanged = mlN !== (FOG.mlN | 0) ||
    (ml && ((ml.x - (FOG.mlX || 0)) ** 2 + (ml.y - (FOG.mlY || 0)) ** 2 > 900));
  FOG.timer -= dt;
  if (FOG.timer > 0 && !moved && !turned && !adsChanged && !pingChanged && !mlChanged) return;
  FOG.timer = 0.04;
  FOG.lastX = P.x;
  FOG.lastY = P.y;
  FOG.lastAim = P.aim;
  FOG.lastAds = P.ads || 0;
  FOG.pingN = pingN;
  FOG.mlN = mlN;
  if (ml) { FOG.mlX = ml.x; FOG.mlY = ml.y; }

  const cols = FOG.cols, rows = FOG.rows, cell = FOG.cell;
  const vis = FOG.vis, seen = FOG.seen, block = FOG.block;
  vis.fill(0);

  // 开镜：视锥收窄、视距拉长（看得远但看不宽，这就是开镜的代价）
  const k = P.ads || 0;
  const dyn = FOG.dyn;
  dyn.light = FOG_LIGHT * (1 + ADS_LIGHT_MUL * k);
  dyn.core = FOG_FOV_CORE + (ADS_FOV_CORE - FOG_FOV_CORE) * k;
  dyn.edge = FOG_FOV_EDGE + (ADS_FOV_EDGE - FOG_FOV_EDGE) * k;
  dyn.cosCore = Math.cos(dyn.core);
  dyn.cosEdge = Math.cos(dyn.edge);

  const px = P.x, py = P.y;
  const maxR = dyn.light;
  const cosEdge = dyn.cosEdge;
  const adx = Math.cos(P.aim), ady = Math.sin(P.aim);   // 正面方向

  for (let a = 0; a < FOG_RAYS; a++) {
    const ang = a * TAU / FOG_RAYS;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // 射线方向与正面的夹角：超出余光范围就不给光（背后彻底不照亮）
    const lit = (ca * adx + sa * ady) >= cosEdge;
    for (let r = 0; r <= maxR; r += FOG_STEP) {
      const x = px + ca * r, y = py + sa * r;
      if (x < 0 || y < 0 || x >= WORLD.w || y >= WORLD.h) break;
      const ci = (x / cell) | 0, ri = (y / cell) | 0;
      const idx = ri * cols + ci;
      // 起点附近不做遮挡判定，避免贴墙站立时视野全黑
      if (block[idx] && r > cell + 14) {
        if (lit) { vis[idx] = 1; seen[idx] = 1; }   // 墙本身是被照亮的，墙后才是阴影
        break;
      }
      if (lit) vis[idx] = 1;
      seen[idx] = 1;    // 视线扫过的范围都算「去过」，转身回来只剩记忆轮廓
    }
  }

  // 玩家脚下的贴身感知圈（正面半圆）：窄巷里准星怼着墙时，至少能看清身周一圈。
  // 每格做一次视线步进：隔着墙的格子不点亮（墙本身照常亮），修掉「面对墙却看见墙后面」的视野穿透。
  const pc = (px / cell) | 0, pr = (py / cell) | 0;
  const nearC = Math.ceil(FOG_NEAR / cell);
  for (let r = pr - nearC; r <= pr + nearC; r++) {
    if (r < 0 || r >= rows) continue;
    for (let k = pc - nearC; k <= pc + nearC; k++) {
      if (k < 0 || k >= cols) continue;
      const dx = (k + 0.5) * cell - px, dy = (r + 0.5) * cell - py;
      if (dx * adx + dy * ady < 0) continue;        // 落在身后就不给光
      const d2 = dx * dx + dy * dy;
      if (d2 > FOG_NEAR * FOG_NEAR) continue;
      const idx = r * cols + k;
      if (!block[idx]) {
        // 目标格不是墙：从玩家到格心步进，中途撞到别的墙格 = 隔墙，不给光
        const dist = Math.sqrt(d2);
        const steps = Math.max(1, Math.ceil(dist / (cell * 0.45)));
        let clear = true;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const sx = px + dx * t, sy = py + dy * t;
          if (block[((sy / cell) | 0) * cols + ((sx / cell) | 0)]) { clear = false; break; }
        }
        if (!clear) continue;
      }
      vis[idx] = 1;
      seen[idx] = 1;
    }
  }

  // 侦察箭的侦察视野：无遮挡判定（无视地形），落点周围整片点亮
  if (!FOG.ping) FOG.ping = new Uint8Array(vis.length);
  FOG.ping.fill(0);
  for (const sp of G.scanPings) {
    const sc = (sp.x / cell) | 0, sr = (sp.y / cell) | 0;
    const nc = Math.ceil(sp.r / cell);
    for (let r = sr - nc; r <= sr + nc; r++) {
      if (r < 0 || r >= rows) continue;
      for (let k = sc - nc; k <= sc + nc; k++) {
        if (k < 0 || k >= cols) continue;
        const dx = (k + 0.5) * cell - sp.x, dy = (r + 0.5) * cell - sp.y;
        if (dx * dx + dy * dy > sp.r * sp.r) continue;
        const idx = r * cols + k;
        FOG.ping[idx] = 1;
        seen[idx] = 1;
      }
    }
  }

  // 巡飞弹的弹载视野：同样无遮挡点亮，跟着导弹飞
  const LVIS = SKILL.loiter.vision;
  for (const m of G.loiters) {
    if (m.sub) continue;
    const mc = (m.x / cell) | 0, mr = (m.y / cell) | 0;
    const nc = Math.ceil(LVIS / cell);
    for (let r = mr - nc; r <= mr + nc; r++) {
      if (r < 0 || r >= rows) continue;
      for (let k = mc - nc; k <= mc + nc; k++) {
        if (k < 0 || k >= cols) continue;
        const dx = (k + 0.5) * cell - m.x, dy = (r + 0.5) * cell - m.y;
        if (dx * dx + dy * dy > LVIS * LVIS) continue;
        const idx = r * cols + k;
        FOG.ping[idx] = 1;
        seen[idx] = 1;
      }
    }
  }

  paintFog();
}

/* 把三态换算成 alpha 写入小图（视锥内的格子再按角度做一次柔化） */
function paintFog() {
  const cols = FOG.cols, rows = FOG.rows, cell = FOG.cell;
  const d = FOG.img.data;
  const vis = FOG.vis, seen = FOG.seen;
  const px = P.x, py = P.y;
  const dyn = FOG.dyn;
  const inner = dyn.light * 0.35, outer = dyn.light;
  const noise = FOG.noise;
  const adx = Math.cos(P.aim), ady = Math.sin(P.aim);

  for (let r = 0; r < rows; r++) {
    const wy = (r + 0.5) * cell - py;
    const wy2 = wy * wy;
    const rowBase = r * cols;
    for (let c = 0; c < cols; c++) {
      const i = rowBase + c;
      let a;
      if (FOG.ping && FOG.ping[i]) {
        a = 0.17;                          // 侦察视野：隔着雾能看清，但不完全透亮
      } else if (vis[i]) {
        const wx = (c + 0.5) * cell - px;
        const dist = Math.sqrt(wx * wx + wy2);
        let k = (dist - inner) / (outer - inner);
        if (k < 0) k = 0; else if (k > 1) k = 1;
        a = Math.pow(k, 2.2) * 0.97;

        // 视锥柔化：余光向外没入雾里，形成「披萨片」而不是半圆（贴墙时放轻，别把侧向巷道闷死）
        if (dist > 66) {                   // 贴着身体的那点地豁免，免得脚下出现黑斑
          const dc = dist > 0.001 ? (wx * adx + wy * ady) / dist : 1;
          let t = (dyn.cosCore - dc) / (dyn.cosCore - dyn.cosEdge);
          if (t > 0) {
            if (t > 1) t = 1;
            t = Math.pow(t, 0.75);
            const fade = 1 - t;
            const dark = 1 - (1 - a) * fade * 0.82;   // 越靠边缘越接近浓雾
            if (dark > a) a = dark;
          }
        }
      } else if (seen[i]) {
        // 背向 / 被墙挡住的旧记忆：背后压得更狠，只剩几乎看不见的轮廓
        const wx = (c + 0.5) * cell - px;
        const dist = Math.sqrt(wx * wx + wy2) || 1;
        const dc = (wx * adx + wy * ady) / dist;
        a = dc >= dyn.cosEdge ? 0.895 : FOG_A_BACK;
      } else {
        a = FOG_A_DARK;       // 从未探索：纯黑
      }
      const o = i * 4;
      // 用噪声扰动雾色，让浓雾有云絮般的厚薄变化（整体仍比地板更暗）
      const nz = noise[i];
      d[o] = 1 + nz * 4;
      d[o + 1] = 3 + nz * 6;
      d[o + 2] = 7 + nz * 9;
      d[o + 3] = (a * 255) | 0;
    }
  }
  FOG.cx.putImageData(FOG.img, 0, 0);
}

/* 被标记的敌人：迷雾会盖住普通绘制，这里把标记目标重新画一层（雾上） */
function drawMarkedOverlays() {
  let any = false;
  for (const e of G.enemies) {
    if (!(e.mark > 0) || fogVisibleAt(e.x, e.y)) continue;
    if (!any) { ctx.save(); ctx.translate(G.shakeX, G.shakeY); ctx.scale(ZOOM, ZOOM); ctx.translate(-G.cam.x, -G.cam.y); any = true; }
    try { drawEnemy(e); }
    catch (err) { if (!G._markWarned) { G._markWarned = 1; console.warn('drawMarked failed', err); } }
  }
  if (any) ctx.restore();
}

/* 某个世界坐标当前是否处在玩家视野内（必须同时在正面视锥里） */
/* 某个坐标是否在侦察箭开出的侦察视野里（无遮挡判定 = 无视地形） */
function scanPingAt(x, y) {
  for (const sp of G.scanPings) {
    const dx = x - sp.x, dy = y - sp.y;
    if (dx * dx + dy * dy <= sp.r * sp.r) return true;
  }
  return false;
}

/* 巡飞弹的弹载视野：飞行中的主弹周围一圈算「看见」（迷雾里跟着镜头看路） */
function loiterVisionAt(x, y) {
  const R = SKILL.loiter.vision;
  for (const m of G.loiters) {
    if (m.sub) continue;
    const dx = x - m.x, dy = y - m.y;
    if (dx * dx + dy * dy <= R * R) return true;
  }
  return false;
}

function fogVisibleAt(x, y) {
  if (!FOG.ready) return true;
  const ci = (x / FOG.cell) | 0, ri = (y / FOG.cell) | 0;
  if (ci < 0 || ri < 0 || ci >= FOG.cols || ri >= FOG.rows) return false;
  if (scanPingAt(x, y)) return true;               // 侦察视野里：隔墙隔雾都算看见
  if (loiterVisionAt(x, y)) return true;           // 巡飞弹弹载视野同理
  if (FOG.vis[ri * FOG.cols + ci] !== 1) return false;
  const dx = x - P.x, dy = y - P.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return true;
  const d = Math.sqrt(d2);
  const front = (dx * Math.cos(P.aim) + dy * Math.sin(P.aim)) / d;
  if (front < 0) return false;                     // 身后一律不算看见
  if (d <= FOG_NEAR) return true;                  // 贴身一圈靠听觉感知
  return front >= (FOG.dyn ? FOG.dyn.cosEdge : FOG_COS_EDGE);   // 开镜时视锥更窄，判定跟着收
}

/* 某个世界坐标是否已被探索过 */
function fogSeenAt(x, y) {
  if (!FOG.ready) return false;
  const ci = (x / FOG.cell) | 0, ri = (y / FOG.cell) | 0;
  if (ci < 0 || ri < 0 || ci >= FOG.cols || ri >= FOG.rows) return false;
  return FOG.seen[ri * FOG.cols + ci] === 1;
}

function drawPlayerLight() {
  // 玩家自带的照明：只照正面扇形，背后完全不发光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 光斑跟着开镜一起收窄、拉远：开镜时是一道窄而长的光柱
  const dyn = FOG.dyn || { light: FOG_LIGHT, edge: FOG_FOV_EDGE };
  const lightR = dyn.light, lightEdge = dyn.edge;

  ctx.beginPath();
  ctx.moveTo(P.x, P.y);
  ctx.arc(P.x, P.y, lightR, P.aim - lightEdge - 0.10, P.aim + lightEdge + 0.10);
  ctx.closePath();
  ctx.clip();

  const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, lightR);
  g.addColorStop(0, 'rgba(120,200,255,0.30)');
  g.addColorStop(0.42, 'rgba(92,172,235,0.15)');
  g.addColorStop(0.74, 'rgba(66,134,200,0.05)');
  g.addColorStop(1, 'rgba(48,100,165,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(P.x, P.y, lightR, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawFog() {
  if (!FOG.ready) return;
  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-G.cam.x, -G.cam.y);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    FOG.cv,
    0, 0, FOG.cols, FOG.rows,
    0, 0, FOG.cols * FOG.cell, FOG.rows * FOG.cell
  );
  ctx.restore();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, VW, VH);

  G.shakeX = (Math.random() - 0.5) * G.shake;
  G.shakeY = (Math.random() - 0.5) * G.shake;

  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-G.cam.x, -G.cam.y);

  drawFloor();
  drawRegions();             // 地区虚线框与地名，画在最底层
  drawSwitches();
  drawExtracts();
  drawCrates();
  drawPickups();
  drawFrosts();
  drawFires();
  drawEZones();
  drawScanPings();
  drawHealFields();
  drawVisionCones();
  drawObstacles();
  drawCoverTimers();
  drawFootprints();          // 脚印贴地画：在人和掩体下面

  const drawList = [];
  for (const e of G.enemies) {
    if (!fogVisibleAt(e.x, e.y) && !(e.mark > 0)) continue;   // 视野外的敌人不可见（被标记的除外）
    drawList.push({ y: e.y, kind: 'e', ref: e });
  }
  drawList.push({ y: P.y, kind: 'p', ref: P });
  drawList.sort((a, b) => a.y - b.y);
  for (const item of drawList) {
    if (item.kind === 'p') { if (P.alive) drawPlayer(); }
    else {
      /* 兜底：单个敌人数据或绘制出问题，只跳过它自己。
         以前这里一抛异常，跟在后面的迷雾、暗角、HUD 全都不画了 —— 表现就是「迷雾突然没了」。 */
      try { drawEnemy(item.ref); }
      catch (err) { if (!G._drawWarned) { G._drawWarned = 1; console.warn('drawEnemy failed', item.ref && item.ref.type, err); } }
    }
  }

  drawBullets();
  drawIceBolts();
  drawIcePots();
  drawNades();
  drawGls();
  drawMagbombs();
  drawShocks();
  drawFrags();
  drawFlashes();
  drawBlades();
  drawBladeLock();       // 锁定框画在人和技能特效上面
  drawGasBombs();
  drawMists();
  drawAdrFields();
  drawSwarms();
  drawArrows();
  drawDrones();
  drawLoiters();
  drawSmokes();
  drawMagAim();          // 长按 G 的投掷预瞄（画在烟上面，别被自己烟挡住）
  drawModeAim();         // 手上装置（雷 / 掩体 / 巡飞弹）的落点预览
  drawMolotovs();
  drawRockets();
  drawFlameCones();
  drawParticles();
  drawPopups();
  drawPlayerLight();

  ctx.restore();

  drawFog();
  drawMarkedOverlays();      // 被标记的敌人重画在雾上面：隔着迷雾也看得见
  drawSniperBeams();
  drawLighting();
  drawGlAim();               // 红狼手炮：准星落点 + 爆炸范围（画在迷雾之上才看得见）
  drawSmokeBlind();          // 自己在烟里：先糊住世界，再画 HUD
  drawGasBlind();            // 毒雾致盲：黄绿一片，比烟更闷
  drawFlashBlind();          // 闪光弹炸白（比烟更狠，直接盖满屏）
  if (G.scene === 'playing' || G.scene === 'paused') {
    drawOffscreenMarkers();
    drawHUD();
    drawRegionBanner();        // 当前地区横幅（屏幕上方居中）
    drawDebuffOverlay();
    drawKnockOverlay();
    drawDownedOverlay();
    if (BIGMAP.open) drawBigMap();   // 战术地图（M 开关）：画在一切之上
  }
}

/* 倒地：画面压红、四角收暗 —— 上面是倒地血条，下面是长按 F 的自救进度 */
function drawDownedOverlay() {
  if (!isDowned() || !P.alive) return;
  const k = clamp((P.downRev || 0) / SKILL.rescue.down, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(26,8,14,0.46)';
  ctx.fillRect(0, 0, VW, VH);

  const cx = VW / 2, cy = VH / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(VW, VH) * 0.2, cx, cy, Math.max(VW, VH) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  /* 自救进度（长按 F 累计） */
  const w = 260, h = 7;
  const bx = cx - w / 2, by = cy + 84;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  drawRoundRect(bx - 2, by - 2, w + 4, h + 4, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,255,180,0.85)';
  drawRoundRect(bx, by, Math.max(2, w * k), h, 3);
  ctx.fill();

  /* 倒地血条 */
  const hw = 200, hh = 5;
  const hx = cx - hw / 2, hy = cy + 64;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  drawRoundRect(hx - 2, hy - 2, hw + 4, hh + 4, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,90,110,0.9)';
  drawRoundRect(hx, hy, Math.max(2, hw * clamp((P.downHp || 0) / DOWNED_MAX_HP, 0, 1)), hh, 3);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a8f5c8';
  ctx.font = '800 17px ui-monospace, "Consolas", monospace';
  ctx.fillText('倒 地', cx, cy + 40);
  ctx.fillStyle = 'rgba(220,255,235,0.9)';
  ctx.font = '700 12px ui-monospace, "Consolas", monospace';
  ctx.fillText('倒地血 ' + Math.max(0, Math.ceil(P.downHp || 0)) + ' · 无护甲减伤 · 挨枪就没了', cx, cy + 106);
  ctx.fillStyle = k > 0 ? 'rgba(141,255,192,0.95)' : 'rgba(200,220,235,0.72)';
  ctx.fillText('长按 F 自救 · ' + (P.downRev || 0).toFixed(1) + ' / ' + SKILL.rescue.down.toFixed(0) + 's', cx, cy + 126);
  ctx.restore();
}

/* 被虎蹲炮掀翻：画面压一层灰、四角收紧，中间一行字告诉你「现在动不了」 */
function drawKnockOverlay() {
  if (!knockOn() || !P.alive) return;
  const k = clamp(P.kd / SKILL.shock.selfKd, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,22,' + (0.42 * k).toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);

  const cx = VW / 2, cy = VH / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(VW, VH) * 0.22, cx, cy, Math.max(VW, VH) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + (0.55 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  ctx.textAlign = 'center';
  ctx.font = '800 20px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,200,205,' + (0.55 + 0.35 * Math.sin(G.time * 9)).toFixed(2) + ')';
  ctx.fillText('被 掀 翻  ·  ' + P.kd.toFixed(1) + 's', cx, cy + 96);
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(200,220,235,0.7)';
  ctx.fillText('自己也在爆炸范围里', cx, cy + 116);
  ctx.restore();
  ctx.textAlign = 'left';
}

/* 贯穿伤的黑边 / 失血的压边。
   贯穿伤每层压一圈黑，止痛能把它压回去（视觉惩罚被屏蔽）；
   流血的红色压边止痛压不住——那是真在掉血。 */
function drawDebuffOverlay() {
  if (!P.alive) return;
  const red = redLayers();
  const bleed = P.deb.bleed;
  const pain = P.painT > 0;
  const redA = red * 0.085 * (pain ? 0.22 : 1);
  const bleedA = Math.min(0.20, bleed * 0.032);
  if (redA <= 0.001 && bleedA <= 0.001) return;

  const cx = VW / 2, cy = VH / 2;
  const rIn = Math.min(VW, VH) * 0.30;
  const rOut = Math.max(VW, VH) * 0.78;

  if (redA > 0.001) {
    const g = ctx.createRadialGradient(cx, cy, rIn, cx, cy, rOut);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.58, 'rgba(0,0,0,' + (redA * 0.42).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + redA.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    /* 视野发糊：极淡的一层米粒噪点跟着呼吸一样起伏，比真模糊便宜得多 */
    const pulse = (0.012 + 0.008 * Math.sin(G.time * 2.2)) * Math.min(3, red);
    ctx.fillStyle = 'rgba(0,0,0,' + pulse.toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  if (bleedA > 0.001) {
    const g2 = ctx.createRadialGradient(cx, cy, rIn * 0.88, cx, cy, rOut);
    g2.addColorStop(0, 'rgba(120,0,16,0)');
    g2.addColorStop(1, 'rgba(150,0,20,' + bleedA.toFixed(3) + ')');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, VW, VH);
  }

  /* 腿伤：画面底部一条晃动的橙光，跟着步伐一瘸一拐。
     止痛只能把这层光压淡一半 —— 走不动这件事它骗不过去。 */
  const legLv = P.deb.leg + P.deb.fissure;
  if (legLv > 0) {
    const limpH = VH * 0.18;
    const sway = Math.sin(P.walkPhase * 0.5) * 0.06 + 0.10;
    const g3 = ctx.createLinearGradient(0, VH - limpH, 0, VH);
    const a3 = (0.10 + 0.05 * Math.min(2, legLv)) * (pain ? 0.55 : 1);
    g3.addColorStop(0, 'rgba(255,120,60,0)');
    g3.addColorStop(1, 'rgba(255,110,50,' + (a3 * (1 + sway)).toFixed(3) + ')');
    ctx.fillStyle = g3;
    ctx.fillRect(0, VH - limpH, VW, limpH);
  }
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = ts;
  let dt = (ts - lastT) / 1000;
  lastT = ts;
  dt = Math.min(dt, 0.05);

  if (G.scene === 'playing') {
    update(dt);
  } else if (G.scene === 'dead' || G.scene === 'extracted') {
    updateParticles(dt);
    updateCamera(dt);
    G.time += dt;
  }

  if (G.scene !== 'lobby') render();
}

/* ══════════════════════════════════════════════════════════
   17. 大厅 / 商店 UI
   ══════════════════════════════════════════════════════════ */
