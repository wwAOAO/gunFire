"use strict";

/* js/art.js —— 美术主题层
   ══════════════════════════════════════════════════════════════════
   把「霓虹赛博」的视觉语言换成「战术写实」（三角洲行动那一路）。

   为什么要有这一层：
     原来的绘制是「纯色平面 + 发光描边」——没有方向光、没有材质、
     没有环境遮蔽。只要补上这三件事，同一个轮廓立刻从「霓虹」变成
     「军用装备」，不需要把模型画复杂。

   三条硬约束（决定了下面每一个实现细节）：
     1. ZOOM = 1.0，玩家半径 r = 16 → 屏幕上直径 32px（写实细节的下限尺寸）。
        27px 上能分辨的细节上限约 3 档明度 + 2 个轮廓特征。
        所以「更像」靠的是剪影分层 + 受光关系，不是堆多边形。
     2. 零外部资源。所有材质都是离屏 canvas 程序化烘焙，
        首次使用时生成一次，之后只做 drawImage / pattern 平铺。
     3. 测试跑在 jsdom 里，没有真 canvas。所有纹理生成必须可失败、
        失败后静默降级（返回 null，调用处跳过），不能抛。

   主题开关：ART.THEME = 'delta' | 'neon'
     'neon' 会退回旧配色，方便 A/B 对比。
   ══════════════════════════════════════════════════════════════════ */

const ART = {
  THEME: 'delta',

  /* ── 色板 ──────────────────────────────────────────────────────
     三角洲的色不是「军绿」一个词能概括的，它是一组低饱和、
     带暖灰偏移的土色系。关键：所有颜色都往黄绿方向偏一点点，
     纯中性灰会让画面显脏、显电子。 */
  C: {
    /* 地基 */
    ground:      '#3a3931',   // 裸土底色
    pave:        '#4b4a41',   // 混凝土铺装
    paveHi:      '#5a594e',   // 受光面
    paveLo:      '#33322b',   // 板缝 / 背光面
    asphalt:     '#31312d',
    dirt:        '#4a4133',
    sand:        '#5d5442',

    /* 结构件 */
    steel:       '#4a4e47',
    steelHi:     '#767b70',
    steelLo:     '#26292a',
    rust:        '#7b4426',
    rustLo:      '#4a2a18',
    wood:        '#5c4830',
    woodHi:      '#7a6242',

    /* 军用织物 / 涂装 */
    olive:       '#3d4830',   // 军械箱橄榄绿
    oliveHi:     '#535f3d',
    khaki:       '#6b6247',   // 卡其
    nylon:       '#2c2e28',   // 尼龙装具
    nylonHi:     '#3e4139',

    /* 强调 */
    warn:        '#c9a227',   // 警示黄
    amber:       '#d3923a',   // 琥珀（可交互）
    alert:       '#b8412f',   // 危险红（去饱和的砖红）
    cyan:        '#5c8f86',   // 冷色只留一丁点，做小面积点色

    /* 光 */
    light:       '#e6e0c9',   // 顶光高光
    rim:         '#9aa08c',   // 边缘光
    ink:         '#0e0e0b',   // 墨色 / 最深阴影
  },

  /* 光照方向：俯视角固定从左上打光（-0.55, -0.83 归一化） */
  LIGHT: { x: -0.55, y: -0.83 },

  /* q: 画质档 2 高 / 1 中 / 0 低 —— 纹理烘焙倍率、颗粒后处理、碎屑密度都看它 */
  q: 2,
  _tile: {},
  _pat: {},
  _patBS: {},
  _grain: null,
  _ok: typeof document !== 'undefined' && !!document.createElement,
};

/* ── 小工具 ──────────────────────────────────────────────────── */

/** 确定性哈希：同一格永远同一个值（纹理不能每帧闪） */
function artHash(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 建一张离屏 canvas；jsdom 下会抛，由调用方 catch */
function artCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w | 0;
  c.height = (h === undefined ? w : h) | 0;
  return c;
}

/* ── 烘焙倍率 ──────────────────────────────────────────────
   材质 tile 的世界尺寸是 256（平铺周期），但以前不管屏幕密度都只画 256 个
   像素。在 ZOOM*DPR = 2 的屏上，一个纹理像素摊到 2×2 个设备像素，板缝、
   石子、草叶全是糊的 —— 这是画质最大的损失点，而且改它几乎不花每帧开销。
   这里按 ZOOM*DPR 烘焙，pattern 再用 1/BS 把平铺周期压回世界单位。
   代价是内存 ×BS²（DPR2、7 种材质约 7MB）和一次性烘焙时间。 */
function artBakeScale() {
  const q = ART.q === undefined ? 2 : ART.q;
  if (q <= 0) return 1;
  const zoom = typeof ZOOM === 'number' ? ZOOM : 1;
  const dpr = typeof DPR === 'number' ? DPR : 1;
  const s = Math.round(zoom * dpr);
  return Math.max(1, Math.min(q >= 2 ? 3 : 2, s));
}

/** 材质画布：物理像素 = 世界尺寸 × 烘焙倍率，绘制坐标仍然是世界单位 */
function artBakeCanvas(size) {
  const bs = artBakeScale();
  const c = artCanvas(size * bs);
  const g = c.getContext('2d');
  if (bs !== 1) g.setTransform(bs, 0, 0, bs, 0, 0);
  c._bs = bs;
  return { c: c, g: g };
}

/* ── 材质烘焙 ──────────────────────────────────────────────────
   每种材质一张 256 的 tile，平铺周期 256 世界单位。
   ZOOM 0.85 下 256wu ≈ 218 屏幕像素 —— 颗粒大小刚好在
   「能感觉到」和「不噪」之间。 */

/** 噪声底：直接改像素，比几千个 fillRect 快一个量级 */
function artNoise(c, amp, tint) {
  const w = c.width, h = c.height;
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  /* 噪点按「世界像素」分块撒：烘焙倍率提高后颗粒的物理尺寸不变、只是边界更利，
     逐设备像素撒会让地面看起来变细发脆（还多 4 倍循环）。 */
  const bs = Math.max(1, Math.round(c._bs || 1));
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  for (let by = 0; by < h; by += bs) {
    const yEnd = Math.min(h, by + bs);
    for (let bx = 0; bx < w; bx += bs) {
      const n = (Math.random() * 2 - 1) * amp;
      const dr = n * tr, dg2 = n * tg, db = n * tb;
      const xEnd = Math.min(w, bx + bs);
      for (let y = by; y < yEnd; y++) {
        let i = (y * w + bx) * 4;
        for (let x = bx; x < xEnd; x++) {
          d[i] = Math.max(0, Math.min(255, d[i] + dr));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + dg2));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + db));
          i += 4;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** 洒几块不规则污渍（油 / 积水 / 磨损） */
function artStains(g, w, h, n, rgb, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = rMin + Math.random() * (rMax - rMin);
    const a = 0.04 + Math.random() * aMax;
    const gr = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.beginPath();
    /* 用几个抖动点画成不规则形状，纯圆太假 */
    for (let k = 0; k <= 8; k++) {
      const a2 = k / 8 * Math.PI * 2;
      const rr = r * (0.6 + Math.random() * 0.55);
      const px = x + Math.cos(a2) * rr, py = y + Math.sin(a2) * rr;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
  }
}

/* 混凝土铺装：四块板 + 板缝 + 裂纹 + 石子 */
function artPaveTile() {
  const S = 256, BK = S / 2;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;

  g.fillStyle = ART.C.paveLo;
  g.fillRect(0, 0, S, S);

  for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
    const k = artHash(bx, by, 7) * 0.14 - 0.07;
    const base = 74 + k * 255 * 0.5;
    g.fillStyle = 'rgb(' + (base | 0) + ',' + ((base - 1) | 0) + ',' + ((base - 9) | 0) + ')';
    g.fillRect(bx * BK + 1.5, by * BK + 1.5, BK - 3, BK - 3);
  }

  /* 板缝：深色 + 上沿一道极细的受光（这是「厚度」的来源） */
  g.strokeStyle = 'rgba(20,19,15,0.85)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(BK, 0); g.lineTo(BK, S);
  g.moveTo(0, BK); g.lineTo(S, BK);
  g.stroke();
  g.strokeStyle = 'rgba(150,146,126,0.14)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(BK + 2, 0); g.lineTo(BK + 2, S);
  g.moveTo(0, BK + 2); g.lineTo(S, BK + 2);
  g.stroke();

  /* 裂纹：随机走线，越走越细 */
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * S, y = Math.random() * S;
    g.strokeStyle = 'rgba(24,23,18,' + (0.25 + Math.random() * 0.3).toFixed(2) + ')';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y);
    let a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      a += (Math.random() - 0.5) * 1.5;
      x += Math.cos(a) * (8 + Math.random() * 16);
      y += Math.sin(a) * (8 + Math.random() * 16);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  artNoise(c, 17);
  artStains(g, S, S, 7, '26,24,18', 0.30, 14, 46);
  artStains(g, S, S, 3, '96,92,74', 0.10, 20, 60);
  return c;
}

/* 裸土 / 泥地：大颗粒 + 干裂 + 小石子 */
function artDirtTile() {
  const S = 256;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;
  g.fillStyle = ART.C.dirt;
  g.fillRect(0, 0, S, S);

  artStains(g, S, S, 14, '92,80,58', 0.22, 18, 70);
  artStains(g, S, S, 10, '44,38,28', 0.28, 10, 50);

  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 0.6 + Math.random() * 2.2;
    const lum = Math.random() < 0.5 ? 'rgba(24,21,15,0.5)' : 'rgba(126,116,90,0.42)';
    g.fillStyle = lum;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  artNoise(c, 22, [1, 0.95, 0.8]);
  return c;
}

/* 拉丝金属：竖纹 + 锈斑（集装箱 / 铁门 / 卷帘） */
function artMetalTile() {
  const S = 256;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;
  g.fillStyle = ART.C.steel;
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 2) {
    if (Math.random() < 0.35) continue;
    g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '150,155,140' : '30,33,30') + ',' + (0.03 + Math.random() * 0.07).toFixed(3) + ')';
    g.fillRect(x, 0, 1, S);
  }
  artStains(g, S, S, 9, '123,68,38', 0.34, 10, 42);   // 锈
  artStains(g, S, S, 6, '22,24,22', 0.26, 14, 50);    // 油污
  artNoise(c, 14);
  return c;
}

/* 木板：横向纹 + 钉眼（弹药箱 / 木托） */
function artWoodTile() {
  const S = 256;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;
  g.fillStyle = ART.C.wood;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 34; i++) {
    const y = Math.random() * S;
    g.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '28,22,14' : '128,106,74') + ',' + (0.05 + Math.random() * 0.16).toFixed(3) + ')';
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    g.stroke();
  }
  /* 板缝 */
  g.fillStyle = 'rgba(16,12,8,0.75)';
  for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 2);
  artNoise(c, 20, [1, 0.88, 0.7]);
  return c;
}

/* 草地：草叶簇 + 深浅斑驳 + 少量露土。
   关键不是「绿」，是「不均匀」—— 纯一个绿色调铺满会像塑料草皮，
   所以底下先铺三档色差的草皮斑，再把上千根短线按方向偏上画上去。 */
function artGrassTile() {
  const S = 256;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;

  g.fillStyle = '#3f472c';
  g.fillRect(0, 0, S, S);

  /* 草皮斑：受光的亮草 / 背光的暗草，两个尺度混着来 */
  artStains(g, S, S, 15, '88,100,58', 0.20, 34, 96);
  artStains(g, S, S, 12, '28,34,20', 0.26, 26, 84);
  artStains(g, S, S, 6, '94,80,54', 0.16, 16, 46);      // 露出来的土
  artStains(g, S, S, 4, '66,72,44', 0.14, 40, 110);

  /* 草叶：短弧线，向斜上收，避免整齐划一的「针毡」感 */
  for (let i = 0; i < 1150; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = 2.4 + Math.random() * 4.6;
    const lean = (Math.random() - 0.5) * 1.15;
    const u = Math.random();
    const col = u < 0.30 ? 'rgba(26,33,17,' : (u < 0.70 ? 'rgba(72,86,42,' : 'rgba(116,130,70,');
    g.strokeStyle = col + (0.20 + Math.random() * 0.42).toFixed(3) + ')';
    g.lineWidth = 0.7 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + lean * len * 0.45, y - len * 0.62, x + lean * len, y - len);
    g.stroke();
  }

  artNoise(c, 16, [0.86, 1, 0.72]);
  return c;
}

/* 铁皮铺装：压型钢板机坪。
   瓦楞（横向明暗周期）+ 钢板拼缝 + 缝上一排铆钉 + 锈迹油污。
   这是航天基地的「有点铁皮」—— 不是整片换材料，而是混凝土机坪上摊开的钢板区。 */
function artPlateTile() {
  const S = 256;
  const bake = artBakeCanvas(S), c = bake.c, g = bake.g;

  g.fillStyle = '#3d4038';
  g.fillRect(0, 0, S, S);

  /* 瓦楞：每 32px 一个周期，暗-亮-亮-暗，钢板的立体全靠这个 */
  for (let x = 0; x < S; x += 32) {
    const lg = g.createLinearGradient(x, 0, x + 32, 0);
    lg.addColorStop(0.00, 'rgba(22,24,20,0.44)');
    lg.addColorStop(0.28, 'rgba(96,102,90,0.10)');
    lg.addColorStop(0.52, 'rgba(128,134,118,0.18)');
    lg.addColorStop(0.74, 'rgba(70,74,66,0.06)');
    lg.addColorStop(1.00, 'rgba(20,22,18,0.40)');
    g.fillStyle = lg;
    g.fillRect(x, 0, 32, S);
  }

  /* 钢板拼缝：横竖各一条，深缝 + 下沿一点受光 */
  for (let k = 0; k < S; k += 128) {
    g.fillStyle = 'rgba(12,13,10,0.66)';
    g.fillRect(0, k, S, 2);
    g.fillRect(k, 0, 2, S);
    g.fillStyle = 'rgba(132,138,120,0.14)';
    g.fillRect(0, k + 2, S, 1);
    g.fillRect(k + 2, 0, 1, S);
  }

  /* 铆钉：沿拼缝排，亮顶 + 暗底 = 半球感 */
  for (let k = 0; k < S; k += 128) {
    for (let t = 10; t < S; t += 26) {
      g.fillStyle = 'rgba(152,158,140,0.32)';
      g.beginPath(); g.arc(t, k + 7, 1.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(12,13,10,0.46)';
      g.beginPath(); g.arc(t + 0.3, k + 8.3, 1.2, 0, Math.PI * 2); g.fill();
    }
  }

  artStains(g, S, S, 9, '122,68,36', 0.30, 12, 50);     // 锈
  artStains(g, S, S, 7, '16,18,15', 0.24, 16, 56);      // 油污
  artNoise(c, 12);
  return c;
}

/** 屏幕空间颗粒：整幅叠加，把所有矢量边缘「做旧」 */
function artGrainTile() {
  if (ART._grain) return ART._grain;
  const S = 128;
  const c = artCanvas(S), g = c.getContext('2d');      // 屏幕空间噪声：固定 1x
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 16;                       // 极低不透明度，只做质感
  }
  g.putImageData(img, 0, 0);
  ART._grain = c;
  return c;
}

const ART_BAKE = {
  pave: artPaveTile,
  grass: artGrassTile,
  plate: artPlateTile,
  dirt: artDirtTile,
  metal: artMetalTile,
  wood: artWoodTile,
  grain: artGrainTile,
};

/** 取材质 tile（惰性 + 缓存 + 失败静默） */
function artTile(name) {
  if (ART._tile[name]) return ART._tile[name];
  const fn = ART_BAKE[name];
  if (!fn || !ART._ok || !ctx) return null;   // 主画布都拿不到 context 时整体降级
  try {
    const cv = fn();
    if (!cv || !cv.width) return null;
    ART._tile[name] = cv;
    return cv;
  } catch (e) {
    ART._tile[name] = null;              // 记住失败，别每帧重试
    return null;
  }
}

/** 取材质 pattern（跟随当前变换，所以是世界空间对齐的） */
function artPattern(name) {
  const bs = name === 'grain' ? 1 : artBakeScale();
  if (ART._pat[name] !== undefined && ART._patBS[name] === bs) return ART._pat[name];
  /* 倍率变了（换屏 / 调画质）：旧 tile 作废，下次取用时重烘 */
  if (ART._patBS[name] !== undefined && ART._patBS[name] !== bs) {
    ART._tile = {};
    ART._pat = {};
    ART._patBS = {};
  }
  const cv = artTile(name);
  if (!cv || !ctx) { ART._pat[name] = null; ART._patBS[name] = bs; return null; }
  try {
    const pat = ctx.createPattern(cv, 'repeat');
    /* tile 有 bs 倍像素，1/bs 把平铺周期压回 256 世界单位，纹理才和屏幕 1:1 */
    if (pat && bs !== 1 && pat.setTransform) {
      try { pat.setTransform(1 / bs, 0, 0, 1 / bs, 0, 0); } catch (e2) {}
    }
    ART._pat[name] = pat;
  } catch (e) {
    ART._pat[name] = null;
  }
  ART._patBS[name] = bs;
  return ART._pat[name];
}

/* ── 光照 / 材质绘制工具 ──────────────────────────────────────── */

/** 方向投影：俯视角里「高度」唯一的表达方式，比任何描边都有效 */
function artShadow(x, y, w, h, r, dist, alpha) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,9,6,' + (alpha === undefined ? 0.5 : alpha) + ')';
  drawRoundRect(x + ART.LIGHT.x * dist, y + ART.LIGHT.y * dist, w, h, r);
  ctx.fill();
  ctx.restore();
}

/** 环境遮蔽：内圈一圈由暗到透明的描边，让物体「压」在地面上 */
function artAO(x, y, w, h, r, depth, alpha) {
  ctx.save();
  drawRoundRect(x, y, w, h, r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(8,8,5,' + (alpha === undefined ? 0.55 : alpha) + ')';
  for (let i = 0; i < depth; i++) {
    ctx.globalAlpha = 1 - i / depth;
    ctx.lineWidth = 2;
    drawRoundRect(x + i, y + i, w - i * 2, h - i * 2, Math.max(0, r - i));
    ctx.stroke();
  }
  ctx.restore();
}

/** 顶光边：左上两侧一条亮线，右下压暗 —— 一次性建立体积感 */
function artTopLight(x, y, w, h, r, strength) {
  const k = strength === undefined ? 0.5 : strength;
  ctx.save();
  drawRoundRect(x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w * 0.75, y + h);
  g.addColorStop(0, 'rgba(232,226,201,' + (k * 0.5).toFixed(3) + ')');
  g.addColorStop(0.35, 'rgba(232,226,201,0)');
  g.addColorStop(1, 'rgba(8,8,5,' + (k * 0.55).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(236,232,210,' + (k * 0.55).toFixed(3) + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y + 0.5); ctx.lineTo(x + w - r, y + 0.5);
  ctx.moveTo(x + 0.5, y + r); ctx.lineTo(x + 0.5, y + h - r);
  ctx.stroke();
  ctx.restore();
}

/** 在矩形内铺材质（带裁剪），用于箱子 / 掩体表面 */
function artFillMat(x, y, w, h, r, matName, alpha) {
  const p = artPattern(matName);
  ctx.save();
  drawRoundRect(x, y, w, h, r);
  ctx.clip();
  if (p) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = p;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** 磨损：角部 + 边缘的掉漆 / 磕碰，靠固定哈希保证不闪 */
function artWear(x, y, w, h, seed, count, rgb) {
  ctx.save();
  drawRoundRect(x, y, w, h, 2);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const t = artHash(i, seed, 3);
    const u = artHash(i, seed, 11);
    let px, py;
    if (t < 0.45) { px = x + (u < 0.5 ? t * w * 0.6 : w - t * w * 0.6); py = y + u * h; }
    else if (t < 0.75) { px = x + u * w; py = y + (t - 0.45) * h * 1.6; }
    else { px = x + u * w; py = y + h - (t - 0.75) * h * 2.2; }
    const rr = 0.8 + artHash(i, seed, 19) * 3.4;
    ctx.fillStyle = 'rgba(' + (rgb || '156,150,128') + ',' + (0.10 + artHash(i, seed, 23) * 0.25).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** 螺栓：四角一颗小圆点，机械感的关键细节（1.5px 就够） */
function artBolts(x, y, w, h, inset, col) {
  ctx.save();
  ctx.fillStyle = col || 'rgba(180,176,152,0.5)';
  const pts = [[x + inset, y + inset], [x + w - inset, y + inset],
               [x + inset, y + h - inset], [x + w - inset, y + h - inset]];
  for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/* ── 后处理 ────────────────────────────────────────────────────
   一次性给整幅画面上「胶片味」：颗粒 + 暗角 + 极轻微色差。
   三项加起来成本 < 1.5ms（1080p），远低于重绘一层场景。 */

function artGrain(alpha) {
  if (alpha <= 0) return;
  const pat = artPattern('grain');
  if (!pat || !ctx) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  /* 每帧把平铺原点抖一下 —— 静止的颗粒看着像屏幕脏了，抖动的才像胶片 */
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') {
    try {
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, (Math.random() * 128) | 0, (Math.random() * 128) | 0]));
    } catch (e) { /* 不支持就静止，无伤大雅 */ }
  }
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
}

/* 屏幕暗角 + 轻微冷调压边：把注意力收到中心 */
function artVignette(strength) {
  const k = strength === undefined ? 0.55 : strength;
  if (k <= 0) return;
  const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.32,
                                     VW / 2, VH / 2, Math.max(VW, VH) * 0.78);
  g.addColorStop(0, 'rgba(10,10,7,0)');
  g.addColorStop(1, 'rgba(10,10,7,' + k.toFixed(2) + ')');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
}
