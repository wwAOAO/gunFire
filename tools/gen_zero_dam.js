/* 零号大坝地图生成器（参考三角洲行动零号大坝地区布局）
 * 输出：maps/zero-dam.json（与 index.html BUILTIN_MAPS['zero-dam'] 保持一致）
 * 校验：实体不压墙、实体不重叠、出生点连通全部撤离点/容器/据点/守军/BOSS 驻守区
 *      各地区地形复杂度（块数 + 覆盖率），避免出现大片空白
 */
'use strict';
const fs = require('fs');

const W = 4400, H = 3200;

/* ── 地区（局内地面虚线框 + 地区名，进图提示当前地区） ── */
const regions = [
  { name: '大坝坝顶', x: 0,    y: 0,    w: 4400, h: 470 },
  { name: '管道区域', x: 40,   y: 500,  w: 680,  h: 620 },
  { name: '军营',     x: 780,  y: 500,  w: 740,  h: 640 },
  { name: '行政辖区', x: 1600, y: 500,  w: 1560, h: 760 },
  { name: '水泥厂',   x: 100,  y: 1220, w: 920,  h: 880 },
  { name: '泄洪河谷', x: 1080, y: 1220, w: 560,  h: 1860 },
  { name: '主变电站', x: 2040, y: 1360, w: 1000, h: 780 },
  { name: '游客中心', x: 3120, y: 2040, w: 1040, h: 840 },
  { name: '东侧坡地', x: 3680, y: 500,  w: 720,  h: 1400 },
  { name: '南货场',   x: 1640, y: 2140, w: 1480, h: 1060 },
];

/* ── BOSS 驻守区：行政楼中央大厅（赤霄只在这里活动） ── */
const bossZone = { x: 2320, y: 666, w: 316, h: 228 };

/* ── 小工具：一排方块（沙袋 / 巨石 / 花坛 / 料堆） ── */
const R = (x, y, w, h) => ({ x, y, w, h });
const rowX = (x, y, n, step, w, h) => Array.from({ length: n }, (_, i) => R(x + i * step, y, w, h));
const rowY = (x, y, n, step, w, h) => Array.from({ length: n }, (_, i) => R(x, y + i * step, w, h));

/* ── 建筑与掩体 ── */
const obstacles = [
  /* ══════ 大坝坝顶 ══════ */
  R(0, 0, 4400, 120),                                       // 北缘水库
  R(380, 130, 80, 90), R(980, 130, 80, 90), R(2080, 130, 80, 90),
  R(2600, 130, 80, 90), R(3180, 130, 80, 90),               // 五座闸门塔
  R(1500, 140, 130, 64), R(2300, 140, 100, 64),             // 坝中机房
  R(1150, 145, 110, 70), R(2760, 150, 120, 66),             // 闸门控制房
  R(560, 250, 100, 54), R(1900, 255, 90, 50), R(3060, 246, 110, 58),  // 材料堆 / 绞车
  R(700, 236, 60, 18), R(1660, 240, 80, 18), R(3480, 250, 70, 18),    // 护栏段
  R(2500, 240, 50, 50), R(860, 250, 44, 44), R(3560, 300, 60, 40),
  /* 坝体四段（三处过坝口保留：856~920 / 1580~1740 / 2740~2880） */
  R(0, 340, 780, 130), R(920, 340, 660, 130), R(1740, 340, 1000, 130), R(2880, 340, 520, 130),

  /* ══════ 管道区域 ══════ */
  R(110, 560, 320, 22), R(110, 630, 320, 22), R(110, 700, 320, 22),   // 三排输水管
  ...rowX(140, 592, 4, 70, 34, 34),                          // 管墩
  R(560, 520, 22, 240), R(620, 560, 22, 200),                // 立管
  R(120, 660, 22, 180), R(150, 742, 240, 20),                // 检修栈桥
  R(120, 800, 120, 100), R(420, 790, 130, 110),              // 泵房 / 控制室
  R(560, 880, 96, 96), R(300, 890, 96, 96), R(600, 640, 86, 86),      // 储油罐
  R(200, 1000, 190, 18), R(200, 1046, 130, 18),              // 管沟
  R(90, 960, 80, 18), R(90, 1060, 180, 18),                  // 料架围栏

  /* ══════ 军营 ══════ */
  R(840, 560, 240, 70), R(840, 660, 240, 70), R(840, 760, 240, 70),   // 三排营房
  R(1160, 540, 240, 110), R(1160, 700, 220, 100),            // 食堂 + 车库
  R(1300, 540, 26, 110),                                     // 食堂后厨隔断
  R(840, 900, 180, 36), R(1060, 900, 180, 36),               // 训练场矮墙
  ...rowX(860, 960, 3, 100, 60, 60),                         // 跨栏 / 沙袋堆
  R(1380, 540, 80, 80), R(1360, 880, 120, 26), R(1340, 940, 26, 80),  // 军械库 + 围墙
  R(1460, 940, 40, 40),                                      // 瞭望塔
  R(900, 1040, 60, 110), R(1000, 1040, 60, 110),             // 停车场军卡
  R(800, 820, 20, 180), R(1180, 1010, 220, 16),              // 铁丝网

  /* ══════ 行政辖区 ══════ */
  /* 行政楼：围合可进入，中央大厅是赤霄的驻守区 */
  R(2140, 560, 690, 26),                                     // 北墙
  R(2140, 964, 250, 26), R(2560, 964, 270, 26),              // 南墙（中门 2390~2560）
  R(2140, 560, 26, 190), R(2140, 850, 26, 140),              // 西墙（侧门 750~850）
  R(2804, 560, 26, 430),                                     // 东墙
  R(2166, 586, 140, 74), R(2330, 586, 100, 74), R(2600, 586, 204, 74),  // 北侧办公室
  R(2166, 900, 150, 64), R(2640, 900, 164, 64),              // 南侧服务间
  R(2180, 700, 120, 40),                                     // 大厅西侧接待台
  R(2700, 610, 100, 50),                                     // 大厅东侧隔间（靠北墙）
  /* 院落：围墙、警卫室、旗杆、花坛、车棚、翼楼 */
  R(1680, 560, 24, 300), R(1680, 880, 24, 240),              // 西围墙（留中段缺口）
  R(1700, 1140, 300, 22), R(2100, 1140, 200, 22),            // 南围墙（留口）
  R(1900, 580, 70, 70),                                      // 警卫室
  R(1720, 1050, 110, 60),                                    // 车棚
  R(2200, 1100, 26, 26),                                     // 旗杆
  ...rowX(2000, 1200, 2, 80, 60, 60),                        // 花坛
  R(1840, 1000, 140, 90), R(1840, 1120, 140, 90),            // 西翼楼
  R(2900, 1000, 140, 90), R(2900, 1120, 140, 90),            // 东翼楼
  R(2860, 880, 120, 70),                                     // 停车棚
  R(2980, 700, 90, 80),                                      // 配电房

  /* ══════ 水泥厂 ══════ */
  R(240, 1280, 360, 220),                                    // 主厂房
  R(700, 1260, 90, 90), R(810, 1260, 90, 90), R(700, 1370, 90, 90), R(810, 1370, 90, 90),  // 四筒仓
  R(700, 1470, 200, 20),                                     // 筒仓平台
  R(240, 1520, 420, 30),                                     // 输送廊
  R(180, 1640, 300, 140), R(560, 1640, 160, 90),             // 仓库
  R(240, 1860, 420, 80),                                     // 装车台
  R(830, 1520, 70, 70), R(930, 1280, 50, 50),                // 窑炉 / 烟囱
  R(620, 1700, 26, 300),                                     // 输送立管
  R(120, 2020, 320, 20), R(120, 2060, 200, 20),              // 轨道 / 挡墙
  R(700, 1900, 130, 130),                                    // 料仓
  R(880, 1760, 90, 90),                                      // 堆料区
  R(100, 1740, 60, 90),                                      // 检修棚
  ...rowX(300, 1990, 4, 60, 40, 40),                         // 露天料堆

  /* ══════ 泄洪河谷（两岸堤墙留过河缺口，河床巨石 / 桥墩 / 涵洞 / 阶梯） ══════ */
  R(1090, 1260, 26, 180), R(1090, 1540, 26, 150), R(1090, 1880, 26, 220),
  R(1090, 2260, 26, 240), R(1090, 2700, 26, 200),            // 西岸堤墙
  R(1570, 1300, 26, 200), R(1570, 1600, 26, 180), R(1570, 1940, 26, 260),
  R(1570, 2380, 26, 240), R(1570, 2780, 26, 180),            // 东岸堤墙
  R(1200, 1500, 56, 56), R(1400, 1500, 56, 56), R(1300, 1560, 40, 40),  // 断桥桥墩
  R(1240, 2050, 110, 22), R(1240, 2150, 110, 22), R(1240, 2072, 22, 78),// 涵洞
  R(1130, 2450, 120, 20), R(1290, 2490, 120, 20),
  R(1130, 2530, 120, 20), R(1290, 2570, 120, 20),            // 排水阶梯
  ...rowX(1160, 1340, 3, 80, 60, 60),
  ...rowX(1200, 1780, 3, 90, 70, 70),
  ...rowX(1380, 2040, 2, 90, 60, 60),
  ...rowX(1150, 2200, 2, 80, 65, 65),
  ...rowX(1250, 2860, 3, 90, 70, 70),
  ...rowX(1150, 2960, 2, 80, 60, 60),

  /* ══════ 主变电站 ══════ */
  R(2080, 1400, 420, 26), R(2580, 1400, 420, 26),            // 北围栏（中门）
  R(2080, 2080, 420, 26), R(2580, 2080, 420, 26),            // 南围栏（中门）
  R(2080, 1400, 26, 300), R(2080, 1780, 26, 326),            // 西围栏（侧门）
  R(2994, 1400, 26, 300), R(2994, 1780, 26, 326),            // 东围栏（侧门）
  /* 主控楼：可进入，南墙留门 2500~2600 */
  R(2420, 1560, 240, 26),
  R(2420, 1560, 26, 120), R(2634, 1560, 26, 120),
  R(2420, 1706, 80, 26), R(2600, 1706, 60, 26),
  R(2470, 1600, 60, 40),                                     // 室内操作台（掩体）
  /* 变压器排 */
  R(2180, 1700, 90, 56), R(2300, 1700, 90, 56), R(2660, 1700, 90, 56), R(2780, 1700, 90, 56),
  R(2180, 1810, 90, 56), R(2300, 1810, 90, 56), R(2660, 1810, 90, 56), R(2780, 1810, 90, 56),
  R(2150, 1640, 20, 200), R(2930, 1640, 20, 200),            // 防火墙
  R(2200, 1880, 300, 18), R(2700, 1880, 220, 18),            // 电缆沟
  R(2140, 1460, 56, 56), R(2900, 1460, 56, 56),              // 构架塔
  R(2140, 1990, 56, 56), R(2900, 1990, 56, 56),
  R(2680, 1470, 60, 60),                                     // 检修间
  R(2360, 2010, 70, 50),                                     // 消防砂箱

  /* ══════ 游客中心 ══════ */
  /* 主展厅：可进入，南门 3480~3590，西侧门 2340~2400 */
  R(3360, 2260, 340, 24),
  R(3360, 2436, 120, 24), R(3590, 2436, 110, 24),
  R(3360, 2260, 24, 80), R(3360, 2400, 24, 60),
  R(3676, 2260, 24, 200),
  R(3540, 2284, 20, 110),                                    // 展厅内部隔断
  R(3800, 2260, 220, 140),                                   // 纪念品店
  R(3180, 2140, 120, 80),                                    // 售票亭
  R(3300, 2620, 120, 36), R(3460, 2620, 120, 36), R(3620, 2620, 120, 36),  // 停车位
  R(4020, 2140, 110, 50),                                    // 巴士站
  R(3180, 2440, 70, 70),                                     // 绿化池
  R(3830, 2480, 60, 60), R(3930, 2520, 60, 60),              // 广场雕塑 / 花坛
  R(3200, 2700, 220, 18), R(3520, 2700, 220, 18),            // 车道分隔
  R(3740, 2380, 26, 220),                                    // 连廊
  R(3960, 2700, 180, 60),                                    // 服务房
  R(3260, 2560, 20, 140), R(3760, 2560, 20, 140),            // 停车场围栏

  /* ══════ 东侧坡地（盘山路挡墙 + 巨石群 + 岩缝） ══════ */
  R(3720, 560, 180, 24), R(3900, 620, 200, 24), R(3720, 740, 160, 24), R(3880, 860, 220, 24),
  R(3740, 1020, 180, 24), R(3960, 1120, 200, 24), R(3720, 1280, 160, 24), R(3940, 1400, 200, 24),
  R(3760, 1560, 160, 24), R(4000, 1660, 180, 24),            // 盘山路挡墙（阶梯状）
  ...rowX(3800, 920, 3, 90, 70, 70),
  ...rowX(4100, 1200, 2, 90, 70, 70),
  ...rowX(3800, 1780, 2, 90, 70, 70),
  R(4080, 700, 120, 80), R(4080, 840, 120, 80),              // 岩缝（中间 60 宽可钻）
  R(4220, 600, 60, 60),                                      // 岗亭
  R(4100, 1500, 60, 110),                                    // 废弃军卡
  R(4300, 1000, 20, 200), R(3700, 1600, 20, 160),            // 护栏

  /* ══════ 南部公路与散点 ══════ */
  R(1900, 2700, 80, 80), R(2900, 2600, 80, 80),
  R(200, 2500, 80, 80), R(420, 2700, 70, 70),
  R(1800, 2300, 90, 90), R(2000, 2600, 70, 70),
  R(1700, 1320, 80, 80), R(3200, 700, 80, 80), R(3300, 1000, 80, 80), R(1560, 700, 70, 70),
  R(1200, 3000, 140, 30), R(2200, 3000, 140, 30), R(3000, 2950, 140, 30),

  /* ══════ 南货场（旧集装箱堆场改建：货柜排 + 装卸台 + 地磅房） ══════ */
  ...rowX(2050, 2200, 3, 110, 90, 50),                       // 集装箱排一
  ...rowX(2650, 2200, 2, 110, 90, 50),                       // 集装箱排二
  R(1950, 3050, 90, 50), R(2060, 3050, 90, 50),              // 集装箱排三（南墙）
  R(2500, 2350, 110, 60),                                    // 装卸台
  R(2750, 2450, 90, 90),                                     // 双层货柜
  R(2950, 2300, 80, 60),                                     // 地磅房
  R(1750, 2600, 60, 60),                                     // 配电箱
  R(3040, 2750, 70, 70),                                     // 磅秤墩
];

/* ── 出生点（6） ── */
const spawns = [
  { x: 600, y: 260 },    // 坝顶西段
  { x: 150, y: 1560 },   // 水泥厂西侧
  { x: 1150, y: 2900 },  // 泄洪河谷南口
  { x: 4000, y: 900 },   // 东侧坡地
  { x: 4200, y: 2200 },  // 游客中心东侧
  { x: 2400, y: 2950 },  // 南部公路
];

/* ── 撤离点（2） ── */
const extracts = [
  { x: 2600, y: 1180, name: 'A', mode: 'hold' },   // 行政辖区坝下广场
  { x: 4150, y: 3000, name: 'B', mode: 'hold' },   // 东南角公路
];

/* ── 容器（44） ── */
const crates = [
  /* 大坝坝顶 3（原为 0：出生点①所在，落地就有起步物资） */
  { x: 700, y: 300 }, { x: 1650, y: 300 }, { x: 2800, y: 300 },
  /* 管道区域 3 */
  { x: 420, y: 620 }, { x: 700, y: 780 }, { x: 250, y: 950 },
  /* 军营 4 */
  { x: 1120, y: 640 }, { x: 1340, y: 880 }, { x: 1300, y: 500 }, { x: 900, y: 1000 },
  /* 行政辖区 6（1 个在楼里大厅） */
  { x: 2000, y: 760 }, { x: 2760, y: 720 }, { x: 2380, y: 1180 }, { x: 1850, y: 650 }, { x: 3020, y: 1100 },
  { x: 2450, y: 1150 },
  /* 水泥厂 6 */
  { x: 450, y: 1230 }, { x: 660, y: 1240 }, { x: 400, y: 1600 }, { x: 740, y: 1800 }, { x: 880, y: 1700 },
  { x: 700, y: 2050 },
  /* 泄洪河谷 4 */
  { x: 1480, y: 1900 }, { x: 1330, y: 2380 }, { x: 1230, y: 1900 }, { x: 1450, y: 2650 },
  /* 主变电站 5 */
  { x: 2330, y: 1560 }, { x: 2560, y: 1990 }, { x: 2900, y: 1900 }, { x: 2240, y: 1960 }, { x: 2840, y: 1620 },
  /* 游客中心 4 */
  { x: 3450, y: 2200 }, { x: 3900, y: 2500 }, { x: 3300, y: 2760 }, { x: 4100, y: 2600 },
  /* 东侧坡地 5 */
  { x: 3900, y: 1000 }, { x: 4170, y: 1300 }, { x: 3800, y: 1550 }, { x: 4100, y: 1800 }, { x: 3800, y: 1350 },
  /* 南货场 4 */
  { x: 1914, y: 2814 }, { x: 2700, y: 2800 }, { x: 2200, y: 2400 }, { x: 2900, y: 2850 },
];

/* ── 据点（12） ── */
const nests = [
  { x: 600, y: 820 }, { x: 1120, y: 800 }, { x: 2000, y: 900 },
  { x: 740, y: 1600 }, { x: 1320, y: 2250 }, { x: 2450, y: 1950 },
  { x: 3700, y: 2520 }, { x: 4000, y: 1200 }, { x: 2300, y: 2500 },
  { x: 3760, y: 660 }, { x: 1180, y: 2320 }, { x: 2900, y: 1100 },
];

/* ── 守军（58，含赤霄 BOSS：行政楼大厅） ── */
const U = (x, y, type) => ({ x, y, type });
const units = [
  /* 大坝坝顶 6（原 4：北线守军太薄） */
  U(1200, 280, 'runner'), U(2350, 280, 'runner'), U(2900, 280, 'runner'), U(3450, 300, 'sniper'),
  U(1000, 280, 'shooter'), U(2050, 290, 'shooter'),
  /* 管道区域 3 */
  U(200, 940, 'runner'), U(500, 940, 'runner'), U(480, 700, 'shooter'),
  /* 军营 5 */
  U(1110, 780, 'runner'), U(1270, 860, 'shooter'), U(1400, 850, 'brute'), U(1450, 700, 'sniper'), U(1110, 525, 'runner'),
  /* 行政辖区 8（2 个守在大厅里，赤霄在中央） */
  U(2700, 690, 'shooter'), U(2700, 800, 'runner'), U(2220, 820, 'runner'), U(2650, 1030, 'shooter'),
  U(2350, 1060, 'brute'), U(2500, 760, 'boss'), U(2050, 620, 'sniper'), U(3000, 660, 'runner'),
  /* 水泥厂 5 */
  U(350, 1600, 'runner'), U(630, 1440, 'runner'), U(960, 1480, 'shooter'), U(940, 1620, 'shooter'), U(320, 1240, 'runner'),
  /* 泄洪河谷 6（原 3：主通路加巡逻，南口含原公路哨位） */
  U(1300, 1700, 'runner'), U(1250, 2300, 'shooter'), U(1400, 2800, 'rocket'),
  U(1200, 1450, 'runner'), U(1500, 2300, 'runner'), U(1600, 2950, 'shooter'),
  /* 主变电站 7 */
  U(2300, 1500, 'runner'), U(2700, 2000, 'runner'), U(2500, 1500, 'shooter'), U(2600, 1640, 'shooter'),
  U(2350, 1950, 'brute'), U(2600, 1930, 'flamer'), U(2240, 1480, 'shooter'),
  /* 游客中心 5 */
  U(3300, 2350, 'runner'), U(3900, 2700, 'runner'), U(3760, 2200, 'shooter'), U(3500, 2560, 'brute'), U(4100, 2250, 'sniper'),
  /* 东侧坡地 5 */
  U(3850, 800, 'runner'), U(4000, 1460, 'runner'), U(4200, 1050, 'shooter'), U(4000, 1850, 'nader'),
  U(4300, 1400, 'runner'),
  /* 南货场 6（原「南部公路」散点全部收编进地区） */
  U(2000, 2900, 'runner'), U(2800, 2850, 'runner'), U(2400, 2600, 'brute'), U(1900, 2450, 'runner'),
  U(2200, 2350, 'runner'), U(2900, 2750, 'shooter'),
  /* 散点 2 */
  U(150, 2000, 'runner'), U(1300, 1100, 'flamer'),
];

/* 守军编成（增援波次用，沿承旧表） */
const squad = ['runner', 'shooter', 'brute', 'runner', 'runner', 'shooter', 'brute', 'runner',
               'runner', 'shooter', 'brute', 'runner', 'runner', 'runner', 'shooter', 'shooter',
               'brute', 'runner', 'runner', 'runner', 'shooter', 'shooter', 'brute', 'boss',
               'runner', 'runner', 'runner', 'sniper', 'sniper', 'rocket', 'rocket', 'flamer', 'flamer'];

/* ═══════ 校验 ═══════ */
const errors = [], warnings = [];
const hitsObst = (x, y, r) => {
  for (const o of obstacles) {
    const nx = Math.max(o.x, Math.min(x, o.x + o.w)), ny = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
};

const unitR = { runner: 21, shooter: 27, brute: 39, sniper: 23, rocket: 29, flamer: 30, nader: 28, boss: 54, cryo: 30, cryoT: 30, cryoS: 30 };

/* 找出压墙的障碍（调试用） */
function hitWhich(x, y, r) {
  for (const o of obstacles) {
    const nx = Math.max(o.x, Math.min(x, o.x + o.w)), ny = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return o;
  }
  return null;
}

/* 螺旋外扩找最近空位（步长 10，最远 300） */
function nudge(x, y, r, tag) {
  if (!hitsObst(x, y, r)) return { x, y, moved: false };
  for (let rad = 10; rad <= 300; rad += 10) {
    for (let a = 0; a < 24; a++) {
      const nx = Math.round(x + Math.cos(a / 24 * Math.PI * 2) * rad);
      const ny = Math.round(y + Math.sin(a / 24 * Math.PI * 2) * rad);
      if (nx < 60 || ny < 60 || nx > W - 60 || ny > H - 60) continue;
      if (!hitsObst(nx, ny, r)) return { x: nx, y: ny, moved: true };
    }
  }
  errors.push(`挪不到位: ${tag} (${x},${y})`);
  return { x, y, moved: false };
}

const movedLog = [];
function place(x, y, r, tag) {
  const p = nudge(x, y, r, tag);
  if (p.moved) movedLog.push(`${tag}: (${x},${y}) → (${p.x},${p.y})  压到 ${JSON.stringify(hitWhich(x, y, r))}`);
  return p;
}

for (let i = 0; i < spawns.length; i++) { const p = place(spawns[i].x, spawns[i].y, 24, 'spawn' + i); spawns[i] = { x: p.x, y: p.y }; }
for (let i = 0; i < extracts.length; i++) { const p = place(extracts[i].x, extracts[i].y, 120, 'extract'); extracts[i].x = p.x; extracts[i].y = p.y; }
for (const c of crates) { const p = place(c.x, c.y, 34, 'crate'); c.x = p.x; c.y = p.y; }
for (const n of nests) { const p = place(n.x, n.y, 46, 'nest'); n.x = p.x; n.y = p.y; }
for (const u of units) { const p = place(u.x, u.y, unitR[u.type] || 24, u.type); u.x = p.x; u.y = p.y; }
if (movedLog.length) { console.log('── 自动挪位 ──'); movedLog.forEach(l => console.log('  ' + l)); }

for (const s of spawns) if (hitsObst(s.x, s.y, 24)) errors.push(`出生点压墙 (${s.x},${s.y})`);
for (const e of extracts) if (hitsObst(e.x, e.y, 120)) errors.push(`撤离点场地不够 (${e.x},${e.y})`);
for (const c of crates) if (hitsObst(c.x, c.y, 34)) errors.push(`容器压墙 (${c.x},${c.y})`);
for (const n of nests) if (hitsObst(n.x, n.y, 46)) errors.push(`据点压墙 (${n.x},${n.y})`);
for (const u of units) if (hitsObst(u.x, u.y, unitR[u.type] || 24)) errors.push(`守军压墙 (${u.x},${u.y},${u.type})`);

/* ═══ 出生点安全：落地不能一睁眼就被守军看见 ═══
   感知模型对齐 index.html 的 canSeePlayer：守军按兵种 sight 视野、开局朝向随机、
   巡逻在家点 200px 内游荡。判定：视线通畅 且 (家点距离 − 巡逻半径) ≤ max(sight, 520)
   ⇒ 落地几秒内就有被发现的概率。
   自动修复：优先把肇事的贴脸守军螺旋挪走（限本区、≤300、不压墙不叠实体），
   挪不动再螺旋挪出生点本身（≤500）——两步都失败才报错。 */
const GUARD_SIGHT = { runner: 320, shooter: 350, brute: 300, boss: 520, sniper: 500,
                      rocket: 460, flamer: 300, nader: 440 };
const PATROL_WANDER = 200, SPAWN_SAFE_DIST = 520;

function segHitsRectG(x1, y1, x2, y2, o) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - o.x, o.x + o.w - x1, y1 - o.y, o.y + o.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}
function losClearG(ax, ay, bx, by) {
  for (const o of obstacles) if (segHitsRectG(ax, ay, bx, by, o)) return false;
  return true;
}
/* 对出生点构成威胁的守军（视线通 + 巡逻后够得着视野距离） */
function unsafeGuardsFor(sx, sy) {
  return units.filter(u => {
    const sight = GUARD_SIGHT[u.type] || 320;
    const d = Math.hypot(u.x - sx, u.y - sy);
    if (d - PATROL_WANDER > Math.max(sight, SPAWN_SAFE_DIST)) return false;
    return losClearG(u.x, u.y, sx, sy);
  });
}
/* 单个守军在 (ux,uy) 是否威胁出生点 */
function threatensSpawn(ux, uy, type, sx, sy) {
  const sight = GUARD_SIGHT[type] || 320;
  const d = Math.hypot(ux - sx, uy - sy);
  return (d - PATROL_WANDER <= Math.max(sight, SPAWN_SAFE_DIST)) && losClearG(ux, uy, sx, sy);
}
/* 螺旋外扩找满足条件的点（步长 20，最远 maxR） */
function spiralSafe(x0, y0, maxR, ok) {
  for (let rad = 20; rad <= maxR; rad += 20) {
    for (let a = 0; a < 24; a++) {
      const x = Math.round(x0 + Math.cos(a / 24 * Math.PI * 2) * rad);
      const y = Math.round(y0 + Math.sin(a / 24 * Math.PI * 2) * rad);
      if (x < 60 || y < 60 || x > W - 60 || y > H - 60) continue;
      if (ok(x, y)) return { x, y };
    }
  }
  return null;
}
/* 新位置不与任何实体过近（不制造新的「实体过近」警告） */
function clearOfEntities(x, y, r, skip) {
  const pts = [
    ...crates.map(c => ({ x: c.x, y: c.y, r: 34 })),
    ...nests.map(n => ({ x: n.x, y: n.y, r: 46 })),
    ...spawns.map(s2 => ({ x: s2.x, y: s2.y, r: 24 })),
    ...units.filter(u2 => !skip.has(u2)).map(u2 => ({ x: u2.x, y: u2.y, r: unitR[u2.type] || 24 })),
  ];
  return pts.every(p => Math.hypot(p.x - x, p.y - y) >= (p.r + r) * 0.9);
}

const spawnFixLog = [];
for (let pass = 0; pass < 2; pass++) {          // 两轮：给 A 挪守军可能波及 B，第二轮兜住
  for (const s of spawns) {
    let guardMoves = 0;
    while (unsafeGuardsFor(s.x, s.y).length && guardMoves < 8) {
      const u = unsafeGuardsFor(s.x, s.y)[0];
      if (u.type === 'boss') break;             // 赤霄锁在驻守区，不动
      const r = unitR[u.type] || 24;
      const reg = regions.find(g => u.x >= g.x && u.x < g.x + g.w && u.y >= g.y && u.y < g.y + g.h);
      const p = spiralSafe(u.x, u.y, 300, (x, y) =>
        !threatensSpawn(x, y, u.type, s.x, s.y) &&
        !hitsObst(x, y, r) &&
        (!reg || (x >= reg.x && x < reg.x + reg.w && y >= reg.y && y < reg.y + reg.h)) &&
        clearOfEntities(x, y, r, new Set([u])));
      if (!p) break;                            // 这个守军挪不动 → 交给出生点挪位
      const ox = u.x, oy = u.y;
      u.x = p.x; u.y = p.y;
      spawnFixLog.push(`守军 ${u.type} (${ox},${oy}) → (${p.x},${p.y})  给出生点 (${s.x},${s.y}) 让位`);
      guardMoves++;
    }
    if (unsafeGuardsFor(s.x, s.y).length) {
      const p = spiralSafe(s.x, s.y, 500, (x, y) =>
        !hitsObst(x, y, 24) && clearOfEntities(x, y, 24, new Set()) && !unsafeGuardsFor(x, y).length);
      if (p) {
        spawnFixLog.push(`出生点 (${s.x},${s.y}) → (${p.x},${p.y})  原位置视野太暴露`);
        s.x = p.x; s.y = p.y;
      }
    }
  }
}
/* 终检：每个出生点都必须无视线威胁，守军不得被挪出地区 */
for (const s of spawns) {
  const bad = unsafeGuardsFor(s.x, s.y);
  if (bad.length) errors.push(`出生点不安全 (${s.x},${s.y}) ← ${bad.map(u => `${u.type}@${u.x},${u.y}`).join(' / ')}`);
}
for (const u of units) if (!regions.some(g => u.x >= g.x && u.x < g.x + g.w && u.y >= g.y && u.y < g.y + g.h))
  errors.push(`安全修复把守军挪出地区 (${u.x},${u.y},${u.type})`);
if (spawnFixLog.length) { console.log('\n── 出生点安全修复 ──'); spawnFixLog.forEach(l => console.log('  ' + l)); }

/* BOSS 必须在驻守区内，且驻守区里要有能站人的空腔 */
const bosses = units.filter(u => u.type === 'boss');
if (bosses.length !== 1) errors.push('BOSS 数量不为 1（real=' + bosses.length + '）');
for (const b of bosses) {
  const z = bossZone;
  if (!(b.x >= z.x && b.x <= z.x + z.w && b.y >= z.y && b.y <= z.y + z.h))
    errors.push(`BOSS 不在驻守区内 (${b.x},${b.y})`);
  if (hitsObst(b.x, b.y, unitR.boss)) errors.push('BOSS 出生点压墙');
}
/* 驻守区里至少留出 3×3 个 40px 格子的自由活动空间 */
{
  let free = 0;
  for (let gy = bossZone.y; gy + 40 <= bossZone.y + bossZone.h; gy += 40)
    for (let gx = bossZone.x; gx + 40 <= bossZone.x + bossZone.w; gx += 40)
      if (!hitsObst(gx + 20, gy + 20, 60)) free++;
  const need = Math.floor(bossZone.w / 40) * Math.floor(bossZone.h / 40) * 0.6;
  if (free < need) errors.push(`BOSS 驻守区过于拥塞：可用格 ${free} < ${Math.round(need)}`);
}

/* 实体互相不叠 */
const allPts = [
  ...crates.map(c => ({ x: c.x, y: c.y, r: 34, tag: 'crate' })),
  ...nests.map(n => ({ x: n.x, y: n.y, r: 46, tag: 'nest' })),
  ...units.map(u => ({ x: u.x, y: u.y, r: unitR[u.type] || 24, tag: u.type })),
  ...spawns.map(s => ({ x: s.x, y: s.y, r: 24, tag: 'spawn' })),
];
for (let i = 0; i < allPts.length; i++) {
  for (let j = i + 1; j < allPts.length; j++) {
    const a = allPts[i], b = allPts[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < (a.r + b.r) * 0.9) warnings.push(`实体过近: ${a.tag}(${a.x},${a.y}) vs ${b.tag}(${b.x},${b.y}) d=${Math.round(d)}`);
  }
}

/* 连通性：40px 网格 BFS，从任一出生点出发要能到达全部撤离点/容器/据点/守军 */
const GS = 40, GW = Math.floor(W / GS), GH = Math.floor(H / GS);
const blocked = new Uint8Array(GW * GH);
for (const o of obstacles) {
  const x0 = Math.max(0, Math.floor(o.x / GS)), x1 = Math.min(GW - 1, Math.floor((o.x + o.w) / GS));
  const y0 = Math.max(0, Math.floor(o.y / GS)), y1 = Math.min(GH - 1, Math.floor((o.y + o.h) / GS));
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) blocked[gy * GW + gx] = 1;
}
const seen = new Uint8Array(GW * GH);
const q = [];
for (const s of spawns) {
  const gx = Math.min(GW - 1, Math.floor(s.x / GS)), gy = Math.min(GH - 1, Math.floor(s.y / GS));
  if (blocked[gy * GW + gx]) continue;
  q.push([gx, gy]); seen[gy * GW + gx] = 1;
}
while (q.length) {
  const [gx, gy] = q.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const id = ny * GW + nx;
    if (seen[id] || blocked[id]) continue;
    seen[id] = 1; q.push([nx, ny]);
  }
}
const reach = (x, y, tag) => {
  const gx = Math.min(GW - 1, Math.max(0, Math.floor(x / GS))), gy = Math.min(GH - 1, Math.max(0, Math.floor(y / GS)));
  if (seen[gy * GW + gx]) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    if (seen[ny * GW + nx]) return true;
  }
  errors.push(`不可达: ${tag} (${x},${y})`);
  if (process.env.DUMP) {
    const g0x = Math.max(0, gx - 3), g0y = Math.max(0, gy - 3);
    console.log(`  grid around ${tag} (${x},${y})  x:${g0x}.. y:${g0y}..`);
    for (let j = 0; j < 7; j++) {
      let line = '';
      for (let i = 0; i < 7; i++) {
        const id = (g0y + j) * GW + (g0x + i);
        line += blocked[id] ? '#' : (seen[id] ? '.' : '?');
      }
      console.log('    ' + (g0y + j) + ' ' + line);
    }
  }
  return false;
};
for (const e of extracts) reach(e.x, e.y, 'extract');
for (const c of crates) reach(c.x, c.y, 'crate');
for (const n of nests) reach(n.x, n.y, 'nest');
for (const u of units) reach(u.x, u.y, 'unit ' + u.type);
/* BOSS 驻守区必须能走进去（玩家得进得了楼） */
reach(bossZone.x + bossZone.w / 2, bossZone.y + bossZone.h / 2, 'bossZone');

/* 地区名与边框合法性 */
if (regions.length > 10) errors.push('地区过多');
for (const r of regions) {
  if (!r.name || r.name.length > 10) errors.push('地区名非法: ' + r.name);
  if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) errors.push('地区越界: ' + r.name);
}
/* 容器/据点/守军必须落在某个地区里（撤离点允许在公路散点） */
const inAnyRegion = (x, y) => regions.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
for (const c of crates) if (!inAnyRegion(c.x, c.y)) errors.push(`容器不在任何地区内 (${c.x},${c.y})`);
for (const n of nests) if (!inAnyRegion(n.x, n.y)) errors.push(`据点不在任何地区内 (${n.x},${n.y})`);
for (const u of units) if (!inAnyRegion(u.x, u.y)) errors.push(`守军不在任何地区内 (${u.x},${u.y},${u.type})`);

/* 地形复杂度：障碍中心落在区内的块数 + 区内被挡面积占比（只统计区内坐标，避免跨区墙刷高） */
const density = [];
for (const r of regions) {
  let n = 0, area = 0;
  for (const o of obstacles) {
    const ix = Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x));
    const iy = Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y));
    if (ix <= 0 || iy <= 0) continue;
    n++;
    area += ix * iy;
  }
  const cover = area / (r.w * r.h);
  density.push({ name: r.name, n, cover });
}
console.log('\n── 各地区地形复杂度 ──');
for (const d of density) console.log(`  ${d.name.padEnd(6, '　')} 块 ${String(d.n).padStart(3)} · 覆盖 ${(d.cover * 100).toFixed(0)}%`);

/* 除「大坝坝顶」（长廊 + 水面）与「泄洪河谷」（要留出行洪通道）外，其余区都要够碎 */
const sparse = density.filter(d => d.n < 16 && d.name !== '大坝坝顶' && d.name !== '泄洪河谷');
if (sparse.length) errors.push('地形过于简单: ' + sparse.map(d => `${d.name}(${d.n}块)`).join(' / '));
const overpacked = density.filter(d => d.cover > 0.42 && d.name !== '大坝坝顶');
if (overpacked.length) errors.push('地形过于拥塞（可能堵死通路）: ' + overpacked.map(d => `${d.name}(${(d.cover * 100).toFixed(0)}%)`).join(' / '));

console.log(`\n障碍 ${obstacles.length} · 容器 ${crates.length} · 据点 ${nests.length} · 守军 ${units.length}（boss ${bosses.length}） · 出生 ${spawns.length}`);
if (errors.length || warnings.length) {
  console.log('ERRORS:', errors.length); errors.slice(0, 24).forEach(e => console.log('  ✗ ' + e));
  console.log('WARNINGS:', warnings.length); warnings.slice(0, 24).forEach(w => console.log('  ⚠ ' + w));
  process.exit(1);
}
console.log('校验通过：无压墙、无过近、出生点可达全部目标、BOSS 锁在行政楼大厅');

const map = {
  format: 'neonpurge-map', version: 1, name: '零号大坝·普通',
  w: W, h: H,
  spawns, obstacles, crates, extracts, nests, units, squad,
  regions, bossZone,
};
fs.writeFileSync('maps/zero-dam.json', JSON.stringify(map));
console.log('已写入 maps/zero-dam.json (' + Math.round(fs.statSync('maps/zero-dam.json').size / 1024) + ' KB)');
