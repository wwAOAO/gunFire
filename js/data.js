"use strict";

/* js/data.js —— 基础工具、存档、数据表。
   由 index.html 内联脚本拆出：经典 <script src> 按下述顺序加载（file:// 下可用），
   全局作用域共享、顺序不可调换；改完跑 npm run verify 与 npm test。 */


/* ══════════════════════════════════════════════════════════
   0. 基础工具
   ══════════════════════════════════════════════════════════ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let DPR = 1, VW = 0, VH = 0;
/* 相机缩放：<1 = 镜头拉远，一屏装下更多世界，屏幕上的位移整体变小。
   1.0 = 原生比例，角色 32px —— 士兵的头盔 / 背心 / 枪械剪影细节在这个尺寸下才读得出来。
   只改世界→屏幕的映射：射程、弹速、AI 距离这些世界内比例一个都不动。 */
const ZOOM = 1.0;

const WORLD = { w: 3000, h: 2200 };
const TAU = Math.PI * 2;

/* ═══════ 地表材质分区 ═══════
   地图 JSON 的 regions 只给了名字和矩形，地面材质就按**区域名关键词**推：
   河谷 / 坡地 / 游客中心是草地，军营 / 水泥厂 / 货场 / 管道是裸土，其余（坝体、厂区、
   行政区、变电站）是混凝土铺装。名字里一个关键词都没命中的区域，以及所有区域之外的
   空隙，一律走 pave —— 那些空隙本来就是厂区里的铺装空地，不是荒野。
   新地图加区域时不用改代码：区域名带上「草 / 坡 / 林 / 河」这类词就会自动变成草地。 */
const TERRAIN_RULES = [
  ['草',   'grass'], ['坡',   'grass'], ['林',   'grass'], ['绿',   'grass'],
  ['河',   'grass'], ['游客', 'grass'], ['公园', 'grass'],
  ['军营', 'dirt'],  ['水泥', 'dirt'],  ['货场', 'dirt'],  ['管道', 'dirt'],
  ['工地', 'dirt'],  ['废墟', 'dirt'],
  ['机库', 'plate'], ['坪',   'plate'], ['钢',   'plate'],
];
/* 区域名 → 地表类型；没命中就是混凝土 */
function terrainForRegion(name) {
  const n = String(name || '');
  for (let i = 0; i < TERRAIN_RULES.length; i++) {
    if (n.indexOf(TERRAIN_RULES[i][0]) >= 0) return TERRAIN_RULES[i][1];
  }
  return 'pave';
}
/* 航天基地：没有 regions，基底就是整片混凝土机坪，再按大格哈希摊上钢板铺装。
   「清一色的地板，但有点铁皮」—— 铁皮是点缀，不是换底。 */
function terrainIsSpaceBase() {
  return /航天/.test(String((typeof G !== 'undefined' && G && G.mapName) || ''));
}

/* 外部文本 → HTML 的唯一出口：地图 JSON / 存档文件由玩家导入，其中的名称
   必须转义后才能拼进 innerHTML，否则 <svg onload=...> 之类会直接执行。
   能直接用 textContent 的地方优先用 textContent。 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const fmtMoney = n => Math.round(n).toLocaleString('en-US');

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
}
window.addEventListener('resize', resize);
resize();

/* ── 收集品：搜出来的是「货」，不是钱 ──
   局内只能捡、只能带，一分钱都拿不到；撤出来先进仓库，
   在仓库里卖掉才是资金。品质决定价格档位。 */
const QUALITY = {
  common: { name: '普通', color: '#9db2c4', dim: 'rgba(157,178,196,' },
  rare:   { name: '稀有', color: '#4fa8ff', dim: 'rgba(79,168,255,' },
  epic:   { name: '史诗', color: '#c07bff', dim: 'rgba(192,123,255,' },
  legend: { name: '传说', color: '#ffb02e', dim: 'rgba(255,176,46,' },
  myth:   { name: '神话', color: '#ff3d5a', dim: 'rgba(255,61,90,' },
};
const QUALITY_ORDER = ['myth', 'legend', 'epic', 'rare', 'common'];
/* 白绿蓝紫金红的品质字 → 颜色（补给品 grade / 装备 q 共用） */
const GRADE_COLORS = { '白': '#dfe9f2', '绿': '#63d68a', '蓝': '#4fa8ff', '紫': '#b782ff', '金': '#ffcc4d', '红': '#ff7a9c' };
const gradeColor = g => GRADE_COLORS[g] || '#cfe6f2';

/* ── 物资容器 ──
   地图上的搜刮点不再只有一种补给箱。八种容器外观、体积、
   翻找耗时和货色都不一样，而且收集品有主题偏好：
     武器箱偏军械件、医疗箱偏医疗件、文件柜偏情报件、陈列柜偏贵重件，
     补给箱 / 保险柜照旧出全目录（保险柜仍是品质最高的出货点）。
     主题箱也能直抽大红（mythChance），概率统一压得比保险柜低。
     speed 是翻找耗时倍率（>1 更慢，越慢的箱子越肥）
     n     是货物件数区间
     weight 是随机生成 / 老地图没写 t 时的抽取权重
   地图 JSON 里用 t 字段指定种类，缺省按权重随机。 */
const CONTAINERS = {
  crate: {
    id: 'crate', name: '补给箱', en: 'SUPPLY CRATE', tag: '补给',
    color: '#ffd08a', dim: 'rgba(255,208,138,', body: '#2a2118',
    r: 20, w: 32, h: 26, speed: 1.00, n: [2, 3], weight: 30, loud: 0,
    hint: '杂项：收集品 / 药 / 子弹 / 偶尔一把枪或一件护甲',
  },
  ammo: {
    id: 'ammo', name: '弹药箱', en: 'AMMO CRATE', tag: '弹药',
    color: '#ff9a3c', dim: 'rgba(255,154,60,', body: '#2b2317',
    r: 18, w: 28, h: 22, speed: 0.55, n: [2, 3], weight: 18, loud: 0,
    hint: '翻得最快：1-6 级子弹，口径与弹级都随机',
  },
  med: {
    id: 'med', name: '医疗箱', en: 'MEDICAL BOX', tag: '医疗',
    color: '#4ee39a', dim: 'rgba(78,227,154,', body: '#17261f',
    r: 18, w: 28, h: 24, speed: 0.70, n: [2, 3], weight: 16, loud: 0,
    hint: '一整箱医疗包，偶尔混一件货',
  },
  tool: {
    id: 'tool', name: '工具箱', en: 'TOOLBOX', tag: '工具',
    color: '#6ec6ff', dim: 'rgba(110,198,255,', body: '#182530',
    r: 19, w: 30, h: 22, speed: 0.85, n: [1, 2], weight: 16, loud: 220,
    hint: '改枪配件的主要来源',
  },
  weapon: {
    id: 'weapon', name: '武器箱', en: 'WEAPON CASE', tag: '军械',
    color: '#c9a3ff', dim: 'rgba(201,163,255,', body: '#231a2e',
    r: 24, w: 48, h: 18, speed: 1.35, n: [1, 2], weight: 12, loud: 470,
    hint: '必出一把枪，也常压着一件护甲；翻得慢、动静大',
  },
  safe: {
    id: 'safe', name: '保险柜', en: 'SAFE', tag: '金库',
    color: '#ff5c7a', dim: 'rgba(255,92,122,', body: '#2a1820',
    r: 21, w: 26, h: 28, speed: 1.55, n: [2, 3], weight: 8, loud: 540,
    hint: '最慢最肥：高品质货与史诗配件，开柜很响',
  },
  docs: {
    id: 'docs', name: '文件柜', en: 'FILE CABINET', tag: '档案',
    color: '#8fd6a0', dim: 'rgba(143,214,160,', body: '#18261e',
    r: 19, w: 26, h: 30, speed: 0.95, n: [2, 3], weight: 12, loud: 90,
    hint: '情报与文件：账本 / 图纸 / 密钥 / 数据 · 偶尔压着大红',
  },
  lux: {
    id: 'lux', name: '陈列柜', en: 'DISPLAY CASE', tag: '贵重',
    color: '#ffd166', dim: 'rgba(255,209,102,', body: '#2b1e2e',
    r: 20, w: 30, h: 24, speed: 1.30, n: [1, 2], weight: 7, loud: 320,
    hint: '贵重品专柜：珠宝 / 古董 / 硬通货 · 动静不小，大红比保险柜难出',
  },
};
const CONTAINER_IDS = Object.keys(CONTAINERS);

function containerOf(id) { return CONTAINERS[id] || CONTAINERS.crate; }

/* 收集品：z 标记产地 —— 'dam' 只在零号大坝出、'space' 只在航天基地出、不写 = 两张图都出。
   航天基地是哈夫克军管区，搜出来的全是有军工味的东西，配件档位也更高。 */
const RELICS = {
  /* 普通（零号大坝） */
  shell:    { q: 'common', z: 'dam',  name: '弹壳风铃',   icon: '铃', price: 180,  desc: '用弹壳串成的风铃，坝区的人挂在门口驱邪。' },
  ration:   { q: 'common', z: 'dam',  name: '军用口粮',   icon: '罐', price: 240,  desc: '过期三年的压缩口粮，饿了还是能吃。' },
  canteen:  { q: 'common', z: 'dam',  name: '锈蚀水壶',   icon: '壶', price: 300,  desc: '从水泥厂废墟里挖出来的，壶身刻着编号。' },
  badge:    { q: 'common', z: 'dam',  name: '坝区工牌',   icon: '牌', price: 380,  desc: '一张旧工牌，照片上的人已经不在了。' },
  scrap:    { q: 'common',            name: '武器零件箱', icon: '件', price: 420,  desc: '拆解用的枪机与弹簧，回收站按斤收。' },
  /* 稀有 */
  drone:    { q: 'rare',              name: '无人机残骸', icon: '机', price: 980,  desc: '侦察无人机的主板还完整，能拆出好料。' },
  hdd:      { q: 'rare',              name: '加密硬盘',   icon: '盘', price: 1350, desc: '外壳有烧灼痕迹，拆开说不定还有数据。' },
  gasmask:  { q: 'rare',              name: '防毒面具',   icon: '罩', price: 1600, desc: '滤毒罐没拆封，收的人愿意出高价。' },
  scope:    { q: 'rare',              name: '精密瞄具',   icon: '镜', price: 1850, desc: '狙击镜片完好，是硬通货。' },
  /* 史诗 */
  belt:     { q: 'epic',   z: 'dam',  name: '赤霄的弹链', icon: '链', price: 3600, desc: '重机枪上扯下来的一截弹链，还留着焦痕。' },
  core:     { q: 'epic',   z: 'dam',  name: '核电池组',   icon: '核', price: 4400, desc: '水坝控制系统的备用电芯，沉得压手。' },
  terminal: { q: 'epic',              name: '情报终端',   icon: '端', price: 5200, desc: '军方制式终端，开机要指纹。' },
  /* 传说 */
  /* 神话：翻一次要蹲近五秒；定价整体抬进六位数（均价 ≈ 10 万，红色档的身价） */
  blackbox: { q: 'myth',   z: 'dam',  name: '坝区黑匣子',   icon: '匣', price: 78000, desc: '控制室最后三分钟的录音，买家们抢破头。' },
  reactor:  { q: 'myth',   z: 'dam',  name: '赤霄反应核心', icon: '芯', price: 84000, desc: '从重机枪残骸里撬出的军用动力核心，通电还在跳。' },
  masterkey:{ q: 'legend', z: 'dam',  name: '总闸钥匙',     icon: '钥', price: 12000, desc: '一把能开整座大坝的钥匙，黑市上开价惊人。' },
  nameplate:{ q: 'legend', z: 'dam',  name: '「赤霄」铭牌', icon: '铭', price: 15000, desc: '黄铜铭牌，边角被子弹削掉一块。' },

  /* ── 航天基地特产（z:'space'，零号大坝不出） ── */
  pcb:      { q: 'common', z: 'space', name: '回收电路板',   icon: '板', price: 460,  desc: '哈夫克军管区的报废航电板，金手指还亮闪闪。' },
  ration_s: { q: 'common', z: 'space', name: '空勤口粮',     icon: '管', price: 340,  desc: '牙膏式压缩口粮，管身上印着发射日历。' },
  solar:    { q: 'rare',   z: 'space', name: '太阳能板残片', icon: '伏', price: 1220, desc: '整片太阳翼上剪下来的一角，还能发电。' },
  nozzle:   { q: 'rare',   z: 'space', name: '推进器喷管',   icon: '喷', price: 1650, desc: '耐高温合金喷管，车床党抢着收。' },
  gyro:     { q: 'epic',   z: 'space', name: '惯性陀螺仪',   icon: '陀', price: 4800, desc: '导弹级惯性导航核心，校准一次要恒温间。' },
  fuelbar:  { q: 'epic',   z: 'space', name: '火箭燃料样本', icon: '料', price: 4400, desc: '密封管里的蓝色推进剂，隔着管子都发凉。' },
  satnav:   { q: 'legend', z: 'space', name: '军用卫星导航模块', icon: '卫', price: 13500, desc: '能直连哈夫克军星的接收模块，黑市按克卖。' },
  access:   { q: 'legend', z: 'space', name: '「安全总监」权限卡', icon: '卡', price: 15000, desc: '整座航天基地的最高通行卡，血还没擦干净。' },
  engine:   { q: 'myth',   z: 'space', name: '液体火箭发动机样机', icon: '发', price: 90000, desc: '从总装厂房拖出来的原型机，点着了能把半个区送上天。' },
  radchip:  { q: 'myth',   z: 'space', name: '抗辐射加固芯片', icon: '芯', price: 72000, desc: '航天级三模冗余芯片，摔不坏也烤不糊。' },
  /* 超稀有神话 1x1：两图都有概率出，六位数身价里的两颗明珠 */
  africaheart: { q: 'myth',  name: '非洲之心', icon: '心', price: 131452, desc: '一枚血红的枕形切割钻石，内嵌一点天然针尖包体，鉴定书上写着「无价」——黑市给它标了个数。' },
  oceantear:   { q: 'myth',  name: '海洋之泪', icon: '泪', price: 333333, desc: '一颗海水蓝的梨形海珠，传闻出自沉没邮轮的船长保险柜，握久了总觉得它在凉。' },
  /* 大件神话（3x3 四件 / 2x2 五件）：不带 z，两图都有概率出 */
  tsarchest:   { q: 'myth',  name: '沙皇沉箱', icon: '箱', price: 118000, desc: '罗曼诺夫王朝的军需沉箱整只打捞上来，锁环上还挂着打捞队的编号牌。' },
  meteorcore:  { q: 'myth',  name: '陨铁星核', icon: '陨', price: 106000, desc: '从半吨陨石里切出的完整铁镍晶核，剖面亮得像镜面，靠近了指南针全乱。' },
  jadeboulder: { q: 'myth',  name: '帝王绿原石', icon: '玉', price: 138000, desc: '赌石行当梦寐以求的整块帝王绿，皮壳都没剥，老行家隔着皮就敢喊到六位数。' },
  goldcrown:   { q: 'myth',  name: '鎏金冠冕', icon: '冠', price: 126000, desc: '某位末代君主的鎏金冠冕，拍卖行流拍三次之后，出现在了禁区的黑市清单上。' },
  ammonite:    { q: 'myth',  name: '菊石王化石', icon: '石', price: 92000, desc: '一整块菊石化石的对切面，螺线里泛着虹彩，收藏家按克拉给钱。' },
  amberblock:  { q: 'myth',  name: '蜜蜡原砖', icon: '蜡', price: 88000, desc: '老矿里整块挖出的蜜蜡砖，灯光一打里面全是岁月的絮。' },
  starlabe:    { q: 'myth',  name: '鎏金环形星盘', icon: '盘', price: 98000, desc: '黄铜环圈层层嵌套，转到哪一晚都能读出那晚的星空，博物馆出价被压了三回。' },
  observlens:  { q: 'myth',  name: '主镜毛坯', icon: '镜', price: 96000, desc: '口径一米的天文台主镜毛坯，抛光抛到一半停了工，镜面里能照出半张脸。' },
  ambergris:   { q: 'myth',  name: '龙涎香砖', icon: '香', price: 84000, desc: '潮水送上岸的龙涎香砖，香水行当按克论价，这一整块没人敢报总数。' },
};
/* ═══════ 扩展收集品：零号大坝 84 件 + 航天基地 84 件 ═══════
   紧凑表：[id, 品质, 图标, 名称, 价格, 描述]
   id 前缀决定产地：d_ = 零号大坝，s_ = 航天基地（跟 RELICS 里的 z 同一个意思）。 */
const RELIC_EXT = [
  ['d_screw','common','螺','锈螺丝罐',190,'一整罐从闸门拆下来的锈螺丝，五金店按斤收。'],
  ['d_mess','common','盒','坝区饭盒',170,'铝制三层饭盒，底层还粘着干掉的米饭。'],
  ['d_helmet','common','帽','破损安全帽',200,'帽壳裂了一道口子，内衬上写着工号。'],
  ['d_cement','common','泥','水泥样本',210,'从坝体钻出来的芯样，标号高得吓人。'],
  ['d_cable','common','缆','旧电缆盘',230,'半盘铜芯电缆，剥了皮能卖钱。'],
  ['d_shellbag','common','壳','空弹壳袋',240,'帆布袋里塞满弹壳，走一步响一声。'],
  ['d_wrench','common','扳','生锈扳手',250,'开口都磨圆了，拧不动任何东西。'],
  ['d_torch','common','电','手摇电筒',260,'摇十下亮三秒，但永远不会没电。'],
  ['d_waterbag','common','袋','帆布水袋',270,'军绿色水袋，胶味很重。'],
  ['d_glove','common','套','坝工手套',280,'掌心磨穿，指节上全是水泥灰。'],
  ['d_biscuit','common','饼','压缩饼干罐',290,'铁罐装的军用饼干，硬得能当砖。'],
  ['d_walkie','common','讲','老式对讲机',300,'只能收到白噪音，电池仓锈死了。'],
  ['d_net','common','网','破渔网',310,'坝下渔民留下的，网眼被水草堵满。'],
  ['d_battery','common','瓶','铅酸电瓶',320,'沉得压手，回收站给现钱。'],
  ['d_boot','common','靴','旧工装靴',330,'鞋底还厚，就是左脚少一根鞋带。'],
  ['d_spoon','common','勺','铁皮饭勺',340,'食堂大锅饭的标配，勺柄被磨得发亮。'],
  ['d_sandbag','common','沙','防洪沙袋',350,'干硬得像块石头，倒出来全是细沙。'],
  ['d_pipe','common','管','锈蚀水管',360,'两米长的铸铁管，接口还缠着麻丝。'],
  ['d_paper','common','报','旧报纸捆',370,'头版是三十年前的汛情通报。'],
  ['d_buoy','common','球','塑料浮球',380,'橙色浮球，上面印着水位警戒线。'],
  ['d_compass','common','罗','破损罗盘',390,'指针卡住了，但黄铜外壳值钱。'],
  ['d_nail','common','钉','水泥钉盒',400,'半盒水泥钉，钉子都锈在一起。'],
  ['d_camera','common','照','旧照相机',410,'胶卷早就曝光了，镜头倒是干净。'],
  ['d_valve','common','阀','黄铜阀门',420,'拆下来的老闸阀，铜味很正。'],
  ['d_cup','common','杯','军用水杯',430,'搪瓷掉了半边，杯底刻着名字。'],
  ['d_shovel','common','铲','折叠工兵铲',440,'铲刃有豁口，还能挖个坑埋东西。'],
  ['d_tape','common','胶','绝缘胶带',450,'电工胶带一整套，颜色都还在。'],
  ['d_watch','common','表','老式怀表',460,'上了弦还能走，就是慢五分钟。'],
  ['d_copper','common','铜','铜线卷',470,'剥好的裸铜线，成色极好。'],
  ['d_map','common','图','坝区地图残页',480,'手绘的巡查路线，边角标着数字。'],
  ['d_prop','rare','桨','无人机螺旋桨',920,'碳纤维桨叶，断了一叶，另外两叶完好。'],
  ['d_cell','rare','池','军用电池组',980,'军规锂电池，电量还有八成。'],
  ['d_secure','rare','密','加密对讲机',1040,'频道锁死，只有特定的人能听。'],
  ['d_nvlens','rare','夜','夜视仪镜片',1100,'增像管没坏，缺的是整个外壳。'],
  ['d_ammobox','rare','箱','防潮弹药箱',1160,'密封圈完整，里面是空的。'],
  ['d_valveset','rare','阀','铜制阀门组',1220,'四个口径成套，管道工的宝贝。'],
  ['d_oil','rare','油','液压油桶',1280,'半桶军用液压油，标签还没撕。'],
  ['d_survey','rare','测','测绘仪器',1340,'水准仪，气泡还能对齐。'],
  ['d_telegraph','rare','报','老式电报机',1400,'通电还能打点，键帽磨得发亮。'],
  ['d_scope','rare','镜','狙击镜支架',1460,'军规快拆支架，缺一只锁紧螺丝。'],
  ['d_gatectrl','rare','控','闸门控制器',1520,'水坝闸门的控制板，接线图还在背面。'],
  ['d_relay','rare','继','军工级继电器',1580,'哈夫克军工体系里的通用件。'],
  ['d_jammer','rare','扰','信号干扰器',1640,'开机三秒能让半个街区收不到信号。'],
  ['d_oxygen','rare','氧','潜水氧气瓶',1700,'小号氧气瓶，压力表还有一半。'],
  ['d_ledger','rare','账','黑市账本',1760,'记着一串代号和数字，没有名字。'],
  ['d_evidence','rare','证','铅封证物袋',1820,'封条完好，里面是几枚弹头。'],
  ['d_toolbox','rare','具','合金工具箱',1880,'航空铝箱，卡扣断了一个。'],
  ['d_radio','rare','台','短波电台',1940,'能收到远处的呼号，就是听不懂。'],
  ['d_collar','rare','犬','军犬项圈',2000,'皮带上钉着编号牌，狗不见了。'],
  ['d_epaulet','rare','章','旧军衔肩章',2060,'两枚少校肩章，绒面被虫蛀了。'],
  ['d_plate','rare','插','破损防弹插板',2120,'陶瓷板裂成三块，还能挡一发。'],
  ['d_seal','rare','印','铜制印章',2180,'印面是坝区管理处的旧称。'],
  ['d_manifest','rare','单','走私货单',2240,'货名全是暗语，落款只有一个字母。'],
  ['d_balloon','rare','气','气象气球残骸',2300,'破了个洞，电子仓还在。'],
  ['d_spare','rare','闸','备用闸阀',2360,'整只铸铁闸阀，重得像块铁碑。'],
  ['d_sounder','rare','深','水库测深仪',2420,'老式机械测深仪，绞盘还能转。'],
  ['d_chip','epic','片','坝区主控芯片',3400,'主控系统的核心板，脚针完好。'],
  ['d_gen','epic','机','军用柴油发电机',3600,'半个冰箱大小，摇两下就能点着。'],
  ['d_gangle','epic','簿','赤霄帮派账簿',3800,'每一笔抽成都写得很清楚，包括名字。'],
  ['d_core','epic','芯','混凝土钻芯样本',4000,'一米长的芯样，压出来的纹路像年轮。'],
  ['d_pump','epic','泵','防洪闸液压泵',4200,'整台液压泵，油管让人剪断了。'],
  ['d_crypto','epic','模','军用级加密模块',4400,'哈夫克军规加密机，缺一张密钥卡。'],
  ['d_gold','epic','金','走私黄金条',4600,'巴掌大的金条，边角有锉痕。'],
  ['d_mine','epic','雷','老式水雷',4800,'引信已拆，壳子沉得搬不动。'],
  ['d_stress','epic','应','坝体应力记录仪',5000,'连续记录了三十年，最后一页是空白。'],
  ['d_token','epic','物','赤霄帮信物',5200,'黄铜令牌，正面一只虎，背面一串数字。'],
  ['d_nvg','epic','目','军用夜视双目',5400,'双筒四眼，电池仓还封着。'],
  ['d_subpart','epic','潜','深水潜航器部件',5600,'推进器总成，线束被人整根剪走。'],
  ['d_mercury','epic','银','高纯度水银罐',3800,'双层铅封，罐身上画着骷髅。'],
  ['d_encradio','epic','频','军用加密电台',4000,'跳频电台，缺一截天线。'],
  ['d_blastmap','epic','纸','爆破工程图纸',4600,'整座水坝的装药点位，红笔圈了三处。'],
  ['d_barrel','epic','枪','赤霄重机枪枪管',5000,'半米长的重管，膛线还锋利。'],
  ['d_notes','legend','记','坝区总工程师笔记',11000,'最后一页写着“闸门不能开”，字迹被水泡开。'],
  ['d_vaultkey','legend','库','赤霄帮金库钥匙',11800,'黄铜钥匙，齿口复杂得不像民用锁。'],
  ['d_satphone','legend','星','军用卫星电话',12600,'能直连军星，通话记录停在某个夜里。'],
  ['d_mainterm','legend','主','水坝主控终端机',13400,'整座大坝的控制台核心，缺电源。'],
  ['d_seal2','legend','帮','赤霄帮主印',14200,'青铜大印，印钮是一只蹲虎。'],
  ['d_engine','legend','引','两栖装甲车引擎',15000,'八缸柴油机，吊出来时还在滴油。'],
  ['d_auction','legend','拍','黑市拍卖名录',15100,'一整册买家名单，每页都值钱。'],
  ['d_vaultbook','legend','册','赤霄帮金库账册',15800,'账面数字足够买下半座坝区。'],
  ['d_sunken','myth','沉','坝底沉箱文物',76000,'从水下七十二米捞出来的青铜器，锈成了绿色。'],
  ['d_arsenal','myth','械','赤霄私人军械库清单',79000,'清单最后一行写着“还剩一发”。'],
  ['d_fuelrod','myth','燃','军用级核燃料棒',83000,'铅壳完好，计数器靠近就叫。'],
  ['d_sword','myth','刀','赤霄的指挥刀',86000,'刀鞘上镶着一排弹壳，刀身有豁口。'],
  ['s_pcbfrag','common','板','电路板碎片',200,'从航电板上掰下来的一角，金手指还在。'],
  ['s_oring','common','圈','密封胶圈',180,'耐低温氟橡胶圈，一整盒。'],
  ['s_rivet','common','铆','铆钉盒',190,'航空铝铆钉，盒子摔扁了。'],
  ['s_tape','common','带','航天胶带',210,'银色的耐高温胶带，粘性吓人。'],
  ['s_insul','common','棉','隔热棉块',220,'摸起来像石头，其实轻得离谱。'],
  ['s_oxvalve','common','阀','氧气阀门',230,'小号手动阀，手柄是绿色的。'],
  ['s_glass','common','玻','仪表玻璃',240,'圆形观察窗玻璃，边缘有密封槽。'],
  ['s_marker','common','笔','标记笔',250,'能在真空里写字的笔，还有半管。'],
  ['s_alu','common','铝','铝型材段',260,'一节导轨铝材，切口平整。'],
  ['s_bolts','common','栓','螺栓盒',270,'一整盒内六角螺栓，规格统一。'],
  ['s_spool','common','轴','绕线轴',280,'缠着银线的线轴，线头剪断了。'],
  ['s_esd','common','袋','防静电袋',290,'银灰袋子，印着静电敏感符号。'],
  ['s_leak','common','检','检漏液',300,'一小瓶发泡检漏液，标签是俄文。'],
  ['s_badge','common','章','退役徽章',310,'哈夫克航天部的旧徽章，别针断了。'],
  ['s_tray','common','餐','发射场餐盒',320,'不锈钢餐盘，分格里还有干掉的酱。'],
  ['s_blanket','common','毯','铝箔毯',330,'折叠得像巴掌大，展开能裹住一个人。'],
  ['s_filter','common','滤','空气滤芯',340,'整只滤芯，外壳上贴着更换日期。'],
  ['s_conn','common','接','接插件',350,'一包航空插头，针脚齐全。'],
  ['s_gauge','common','表','压力表',360,'量程吓人，指针停在零位。'],
  ['s_rope','common','绳','凯夫拉绳',370,'五米长的芳纶绳，拉不断。'],
  ['s_earmuff','common','罩','降噪耳罩',380,'发射时的标准配置，棉垫还软。'],
  ['s_patch','common','臂','工装臂章',390,'绣着火箭与齿轮，线头有些散。'],
  ['s_coolant','common','冷','水冷管',400,'半米长的波纹管，接头是快拆的。'],
  ['s_rod','common','焊','焊条盒',410,'航天级焊条，防潮袋还没开。'],
  ['s_hourglass','common','漏','沙漏计时器',420,'值班室的老物件，沙子还是干的。'],
  ['s_starchart','common','星','星图卡片',430,'一叠打印星图，边角写满批注。'],
  ['s_clamp','common','夹','燃料管夹',440,'铜制管夹，防松垫圈完整。'],
  ['s_probe','common','探','测试探针',450,'一组测试探针，线还连着插头。'],
  ['s_bulb','common','灯','备用灯泡',460,'军规灯泡，灯丝没断。'],
  ['s_plug','common','塞','航天胶塞',470,'橡胶塞一包，尺寸从大到小。'],
  ['s_star','rare','敏','星敏感器',960,'卫星姿态测量的眼睛，镜片没划痕。'],
  ['s_gymotor','rare','陀','陀螺电机',1020,'每分钟六万转的电机，轴承还顺。'],
  ['s_hinge','rare','铰','太阳翼铰链',1080,'太阳翼展开机构的铰链，带扭簧。'],
  ['s_tibolt','rare','钛','钛合金紧固件',1140,'一整包钛螺栓，轻得不真实。'],
  ['s_telemetry','rare','遥','遥测发射机',1200,'下传数据的发射机，缺一截馈线。'],
  ['s_rcs','rare','喷','姿控喷口',1260,'四只一组的小喷口，内壁烧得发蓝。'],
  ['s_fuelcell','rare','膜','燃料电池膜',1320,'质子交换膜，密封包装没拆。'],
  ['s_suitglove','rare','手','宇航服手套',1380,'加压手套，指尖磨白了。'],
  ['s_cablight','rare','照','舱内照明组件',1440,'一整条舱内灯带，接头完好。'],
  ['s_disk','rare','储','黑匣子存储单元',1500,'抗过载存储单元，外壳焦黑。'],
  ['s_lrf','rare','距','激光测距仪',1560,'军规测距仪，能测到三公里。'],
  ['s_vacuumpump','rare','泵','真空泵',1620,'小型分子泵，转子转得很顺。'],
  ['s_seal','rare','条','耐高温密封条',1680,'陶瓷纤维密封条，一卷还没用完。'],
  ['s_datacard','rare','卡','数据记录卡',1740,'军规存储卡，标签上是一串试验编号。'],
  ['s_tvc','rare','舵','推力矢量舵机',1800,'整只舵机，连杆被掰弯了。'],
  ['s_iridium','rare','天','铱星天线',1860,'螺旋天线，馈电点还有点氧化。'],
  ['s_coolpump','rare','泵','冷却回路泵',1920,'循环泵，叶轮完好。'],
  ['s_tile','rare','瓦','返回舱隔热瓦',1980,'一块黑色的隔热瓦，轻得像泡沫。'],
  ['s_astro','rare','志','宇航员日志',2040,'写满手写数据的本子，最后几页空着。'],
  ['s_dock','rare','环','对接环部件',2100,'对接机构的导向环，缺三个滚轮。'],
  ['s_mmod','rare','盾','微流星防护板',2160,'蜂窝结构的防护板，被穿了两个洞。'],
  ['s_escape','rare','塔','逃逸塔引信',2220,'固体发动机点火引信，封在防潮筒里。'],
  ['s_imu','rare','惯','惯性测量单元',2280,'三轴惯组，标定标签还没过期。'],
  ['s_lis','rare','锂','军用锂硫电池',2340,'高能电池组，外壳冰凉。'],
  ['s_obc','rare','算','星载计算机板',2400,'整块主板，芯片上打着自己的编号。'],
  ['s_fuse','rare','丝','航天级保险丝',2460,'一盒军规熔断器，全是未开封的。'],
  ['s_turbo','epic','涡','液氧涡轮泵',3500,'拳头大的叶轮，转速能上三万。'],
  ['s_rcs2','epic','姿','姿控发动机',3700,'整台小推力发动机，喷管还没烧过。'],
  ['s_radar','epic','雷','星载雷达组件',3900,'合成孔径雷达的收发组件，金壳。'],
  ['s_guidance','epic','导','三级制导舱',4100,'制导舱整体，惯组被人拔走了。'],
  ['s_lifepack','epic','生','生命维持包',4300,'氧气与二氧化碳吸收一体机。'],
  ['s_camera','epic','巡','轨道侦察相机',4500,'哈夫克侦察卫星的镜组，口径吓人。'],
  ['s_deepspace','epic','阵','深空通信阵列',4700,'相控阵面板，缺供电模块。'],
  ['s_carbon','epic','碳','航天级碳纤维壳',4900,'一体成型的承力壳，轻得能单手举。'],
  ['s_bladder','epic','膜','推进剂贮箱隔膜',5100,'钛制隔膜，没有一丝褶皱。'],
  ['s_siloTerm','epic','终','发射井控制终端',5300,'发射井的本地控制台，键盘还在。'],
  ['s_satprop','epic','推','卫星推进模块',5500,'整组推进模块，管路全在。'],
  ['s_emerg','epic','急','航天员应急包',3600,'应急氧气与海水染色剂，全未拆封。'],
  ['s_atomic','epic','钟','星载原子钟',4000,'铷原子钟，频率锁还没解开。'],
  ['s_quantum','epic','量','军用量子通信模块',4600,'量子密钥分发终端，哈夫克封条完好。'],
  ['s_blackbox2','epic','匣','返回舱黑匣子',5000,'抗烧蚀外壳，接口是军规圆形插头。'],
  ['s_flightdata','epic','盘','试飞数据盘',5400,'一整盘试飞遥测数据，标着“不得外传”。'],
  ['s_satkey','legend','钥','卫星主控密钥',11200,'一把物理密钥，插进任何一颗哈夫克卫星都认。'],
  ['s_strikecoord','legend','标','轨道打击坐标盘',12000,'一张坐标盘，圈着三座城市。'],
  ['s_turbopump','legend','组','一级发动机泵组',12800,'火箭一级的涡轮泵组，整体拆下来的。'],
  ['s_spysat','legend','卫','军用侦察卫星整星',13600,'整颗小卫星，还没上过天。'],
  ['s_siloCore','legend','核','发射井主控核心',14400,'发射井的大脑，缺一张授权卡。'],
  ['s_havkList','legend','单','哈夫克航天军械清单',15200,'清单上的编号一直排到四位数。'],
  ['s_capsule','legend','舱','宇航员返回舱座舱',16000,'整只座舱，座椅上还绑着安全带。'],
  ['s_fuelkey','legend','油','燃料加注站钥匙',16400,'加注站的机械钥匙，齿口有三重。'],
  ['s_return','myth','返','载人飞船返回舱',88000,'整只返回舱，舱门从里面锁着。'],
  ['s_asat','myth','光','反卫星激光模块',81000,'军规激光器，镜组比人还高。'],
  ['s_orbitcore','myth','轨','哈夫克轨道指挥核心',94000,'能接管整片轨道的指挥中枢，还带着余温。'],
  ['s_reusable','myth','复','可重复使用发动机原型',96000,'试车过的原型机，喷管上有三次点火的痕。'],
];
for (const [id, q, icon, name, price, desc] of RELIC_EXT) {
  RELICS[id] = { q, z: id[0] === 'd' ? 'dam' : 'space', icon, name, price, desc };
}

/* ═══════ 扩展收集品 · 第二批：坝区 53 件 + 航天 53 件（总目录凑满 300） ═══════
   紧凑表同 RELIC_EXT：[id, 品质, 图标, 名称, 价格, 描述] */
const RELIC_EXT2 = [
  /* ── 坝区第二批 ── */
  ['d_bottle','common','瓶','旧汽水瓶',170,'汽水厂早就关了，瓶子还印着当年的厂徽。'],
  ['d_charcoal','common','炭','木炭袋',180,'半袋烧剩的木炭，冬天还能派上用场。'],
  ['d_umbrella','common','伞','断骨雨伞',190,'伞面补了三次，骨架断了两根。'],
  ['d_fanblade','common','叶','吊扇叶片',200,'食堂吊扇拆下来的叶片，灰厚得能种菜。'],
  ['d_gasket','common','圈','橡胶垫圈包',210,'耐油橡胶垫圈一包，规格全。'],
  ['d_mirror','common','镜','裂镜框',220,'木框镜子裂成蛛网，照人还能认出来。'],
  ['d_kettle','common','壶','烧水铝壶',230,'壶底一层厚水垢，把手换了三次铁丝。'],
  ['d_tube_old','common','管','电子管',240,'收音机里的电子管，玻璃壳还透亮。'],
  ['d_broom','common','帚','竹扫帚',250,'坝区门房用的老扫帚，竹条磨秃了一半。'],
  ['d_chalk','common','笔','粉笔盒',260,'半盒粉笔，当班记录都写在黑板上。'],
  ['d_padlock','common','锁','锈挂锁',270,'钥匙早丢了，锁梁还咬得死紧。'],
  ['d_scale','common','秤','弹簧台秤',280,'菜市场淘汰的台秤，指针还会动。'],
  ['d_mug','common','缸','搪瓷缸子',290,'缸身印着「安全生产」，磕掉几块瓷。'],
  ['d_oillamp','common','灯','煤油灯',300,'灯罩熏黑了，油壶里还有半两油。'],
  ['d_toolbag','common','袋','帆布工具袋',310,'袋底磨穿了一个洞，工具倒剩三件。'],
  ['d_pail','common','桶','铁皮提桶',320,'桶底锈穿了，提手还结实。'],
  ['d_thermo','common','计','老温度计',330,'水银柱卡在半截，外壳黄铜的。'],
  ['d_hook','common','钩','起重吊钩',340,'吊钩磨出亮茬，钩身上打着吨位钢印。'],
  ['d_sealring','common','垫','紫铜密封垫',350,'退过火的紫铜垫，软得能掐出印。'],
  ['d_banner','common','旗','褪色锦旗',360,'「防洪标兵」四个字，红布晒成了粉色。'],
  ['d_trans','rare','芯','变压器铁芯',920,'硅钢片叠的铁芯，漆包线拆下来就是钱。'],
  ['d_dynamo','rare','机','老式发电机转子',980,'转子还能转，铜绕组完好。'],
  ['d_turbineblade','rare','轮','水轮机叶片',1040,'冲刷得只剩刃口的叶片，钢口极好。'],
  ['d_winch','rare','绞','卷扬机绞盘',1100,'钢丝绳缠得整整齐齐，刹车片还厚。'],
  ['d_theodolite','rare','仪','老式经纬仪',1160,'黄铜镜筒，三脚架缺一条腿。'],
  ['d_gasflask','rare','炔','乙炔气瓶',1220,'瓶身检验钢印齐全，阀门封着铅。'],
  ['d_ammoseal','rare','盒','密封弹药盒',1280,'锡皮内衬，盒盖上的封条没揭。'],
  ['d_flarekit','rare','火','信号弹组',1340,'三发信号弹，防潮筒完好。'],
  ['d_fieldradio','rare','步','军用步话机',1400,'皮盒磨白了，天线还能拉出三节。'],
  ['d_coldbox','rare','冷','胰岛素冷藏盒',1460,'内外胆完好，冰袋早就化了。'],
  ['d_medbag','rare','医','军用急救包',1520,'止血带和磺胺粉都还在，过期十二年。'],
  ['d_sandbox','rare','盘','军用沙盘残件',1580,'坝区的地形模型，缺了东南角。'],
  ['d_smokecarton','rare','烟','走私香烟箱',1640,'整条没开封的老烟，牌子早就绝版。'],
  ['d_signalamp','rare','灯','防水信号灯',1700,'玻璃罩没裂，灯座触点还亮。'],
  ['d_leadbelt','rare','铅','潜水配重铅带',1760,'五块铅块串在帆布带上，沉手。'],
  ['d_genset','rare','电','手摇发电机',1820,'摇柄还能转，输出端子发烫。'],
  ['d_acceptfile','rare','书','工程验收报告',1880,'一册验收签字，盖着二十几个红章。'],
  ['d_yuancoin','rare','银','袁大头银元',2460,'边齿完好，吹一口气还有回音。'],
  ['d_shaft','epic','轴','水轮机组主轴',3400,'两米长的锻钢主轴，轴瓦磨损均匀。'],
  ['d_exciter','epic','励','备用励磁机',3600,'励磁机整流子完好，碳刷换过新的。'],
  ['d_turfmap','epic','图','赤霄地盘划分图',3800,'手绘的势力范围，每个码头都标了价。'],
  ['d_helmwheel','epic','舵','巡逻艇舵轮',4000,'柚木舵轮，握把上有一圈刀痕。'],
  ['d_bronzesafe','epic','箱','铜皮保险柜',4200,'柜门焊死了，锁芯被人钻断在里面。'],
  ['d_miltrans','epic','变','军用变压器',4400,'油浸变压器，铭牌打了军字号。'],
  ['d_paintcan','epic','光','荧光涂料罐',4600,'罐底结块的夜光涂料，黑暗里还在亮。'],
  ['d_craneboom','epic','臂','起重机液压臂',4800,'整段液压臂，密封圈老化渗油。'],
  ['d_warbadge','epic','徽','赤霄督战徽章',5000,'铁皮烤漆的徽章，背面刻着督战令编号。'],
  ['d_towerscope','epic','望','哨塔望远镜',5600,'军用双筒镜，镜片没长霉。'],
  ['d_tigerfu','legend','符','赤霄虎符',11400,'铜虎一分为二，合缝处对得上齿口。'],
  ['d_floodkey','legend','钥','泄洪闸主钥匙',12200,'三公斤的黄铜钥匙，齿口深得像锯子。'],
  ['d_stonerub','legend','拓','坝基石刻拓片',13400,'整卷拓片，碑文里提到「永不开闸」。'],
  ['d_jeepmotor','legend','引','军用越野车发动机',16000,'整台 V8 发动机，缸体还带着机油味。'],
  ['d_trident','myth','戟','镇坝三叉戟',89000,'三米长的仪仗戟，叉尖淬过火，传说开闸的人要举着它走完全程。'],

  /* ── 航天第二批 ── */
  ['s_washer','common','垫','精密垫片盒',170,'厚度从 0.1 到 1.0 全套，格子里码得整齐。'],
  ['s_nametag','common','牌','航天铭牌',180,'设备铭牌，编号末尾带着「HVK」。'],
  ['s_qrlabel','common','签','二维码标签贴',190,'一版打印的资产标签，扫码全是乱码。'],
  ['s_snapclip','common','卡','弹性卡箍',200,'不锈钢快装卡箍，一捏就锁死。'],
  ['s_drypack','common','燥','干燥剂罐',210,'变色硅胶半罐，还能再烘一次。'],
  ['s_magmat','common','磁','磁性工具垫',220,'零件吸在上面一颗都跑不掉。'],
  ['s_spencil','common','笔','太空铅笔',230,'不用墨水的按压铅笔，笔芯是石墨圈。'],
  ['s_latexglove','common','套','洁净手套',240,'无尘车间的一次性手套，还剩半盒。'],
  ['s_esdbrush','common','刷','防静电毛刷',250,'刷毛软得像羽毛，扫电路板专用。'],
  ['s_tapeline','common','尺','军规卷尺',260,'刻度是公制与英寸双排，外壳钢制。'],
  ['s_sampletube','common','管','试样管',270,'带旋盖的玻璃试样管，管壁刻着刻度。'],
  ['s_cabletie','common','带','线束扎带',280,'航天级扎带，拉断不脱扣。'],
  ['s_dustcover','common','罩','防尘罩',290,'定制的设备防尘罩，四个角都有松紧口。'],
  ['s_thermogauge','common','温','舱温计',300,'量程 -60℃ 到 80℃，指针还活着。'],
  ['s_caphat','common','帽','洁净帽',310,'无尘车间的隔离帽，帽檐印着批次。'],
  ['s_flask','common','瓶','采样瓶',320,'棕色避光采样瓶，瓶口封蜡完好。'],
  ['s_logbook','common','本','实验记录本',330,'方格纸写满公式，最后一页画着火箭。'],
  ['s_coilwire','common','圈','漆包线圈',340,'绕得极齐的漆包线，线径只有头发丝粗。'],
  ['s_springkit','common','簧','精密弹簧组',350,'一盒不同劲度的弹簧，连卡簧都有。'],
  ['s_foilfilm','common','箔','屏蔽箔片',360,'铝箔覆膜的屏蔽片，折痕都是直的。'],
  ['s_thrustport','rare','口','姿控推力器',960,'巴掌大的推力器，喷口烧蚀纹清晰。'],
  ['s_beaconlamp','rare','灯','信标灯组',1020,'四颗高频闪灯，透镜没老化。'],
  ['s_ablator','rare','蚀','烧蚀防热材料',1080,'蜂窝填充的烧蚀层，切面像蜂巢饼干。'],
  ['s_gyroscope2','rare','陀','备份陀螺仪',1140,'机械陀螺，转子启动还有嗡鸣。'],
  ['s_solenoid','rare','阀','高压电磁阀',1200,'通电「咔」一声就吸合，密封没漏。'],
  ['s_dishseg','rare','面','抛物面天线段',1260,'一段抛物面反射板，焦点馈源还在。'],
  ['s_proptank','rare','罐','推进剂取样罐',1320,'双层真空罐，罐身结着白霜。'],
  ['s_weldhead','rare','焊','自动焊枪头',1380,'轨道焊枪头，钨极只磨掉一半。'],
  ['s_opticsgrp','rare','组','光学镜组',1440,'三片胶合的镜组，膜层泛蓝紫。'],
  ['s_solbat','rare','池','太阳能蓄电池',1500,'镍氢电池组，容量还剩七成。'],
  ['s_moonsoil','rare','壤','月壤模拟样本',1560,'密封罐里的模拟月壤，灰色像水泥粉。'],
  ['s_harness','rare','束','线束总成',1620,'几百根线编成的线束，每根都有编号。'],
  ['s_meterpump','rare','泵','微型计量泵',1680,'隔膜计量泵，流量标定牌没撕。'],
  ['s_crewtag','rare','牌','乘组名牌',1740,'飞行乘组的金属名牌，背面刻着任务代号。'],
  ['s_porthole','rare','窗','舷窗玻璃',1800,'双层密封的舷窗玻璃，边缘有烧蚀痕。'],
  ['s_tempsensor','rare','感','温度传感器阵列',1860,'一片阵列式传感器，焊点均匀得像印刷的。'],
  ['s_canopy','rare','伞','降落伞伞衣',1920,'折叠整齐的主伞衣，伞绳一根没乱。'],
  ['s_dockprobe','rare','探','对接探头',1980,'对接机构的伸缩探头，行程还很顺。'],
  ['s_injector','epic','注','发动机喷注器',3500,'几百个喷孔的黄铜盘，孔距用放大镜才看得清。'],
  ['s_heatex','epic','换','换热器芯体',3700,'翅片密得像书页，通道里没有一点积垢。'],
  ['s_gncunit','epic','制','制导导航控制机',3900,'整台 GNC 控制机，接插件都盖着防尘帽。'],
  ['s_pdu','epic','电','电源分配单元',4100,'军规配电单元，每一路都带保险。'],
  ['s_gearbox','epic','轮','展开机构齿轮箱',4300,'太阳翼的齿轮箱，润滑脂还是新的。'],
  ['s_mirrorblank','epic','坯','大型主镜坯',4500,'半人高的镜坯，表面还没抛光。'],
  ['s_hptank','epic','瓶','高压气瓶',4700,'钛合金气瓶，水压试验标签没过期。'],
  ['s_radpcb','epic','板','抗辐射主板',4900,'整块三模冗余主板，芯片全部 triples 锁定。'],
  ['s_payloadrack','epic','柜','科学载荷柜',5100,'一柜子的实验模块，标签全是代号。'],
  ['s_dsprobe','epic','探','深空探测器部件',5400,'探测器的遥测舱段，太阳翼接口还在。'],
  ['s_centerstage','legend','级','火箭中央级段',11200,'整段中央级结构，焊接环缝像艺术品。'],
  ['s_codeline','legend','码','发射授权码本',12000,'牛皮纸包着的码本，页码用打孔机编的。'],
  ['s_payloadbay','legend','舱','保密载荷舱',13400,'整只载荷舱，舱门上贴着三道封条。'],
  ['s_acsset','legend','姿','轨道器姿态控制总成',16200,'整套姿态控制总成，飞轮还能自由转。'],
  ['s_padconsole','myth','台','发射工位总控台',75000,'整个发射工位的大脑，按钮上的防尘盖一个没少。'],
  /* 新形状神话：竖条与竖版大件 —— 红色档也有细长的身价 */
  ['d_goldbrick','myth','金','赤霄金砖',96000,'两根烙着「赤霄」徽记的金条用油纸捆成一束，行家掂一下就知道成色。'],
  ['d_gatepin','myth','销','闸门主承力销',91000,'泄洪闸主铰链的合金销轴，直径比手腕还粗，据说整座坝就铸了三根备件。'],
  ['s_escortmotor','myth','擎','逃逸塔固体引擎',104000,'发射中止系统的小型固体发动机，药柱完好，懂行的人把它当艺术品看。'],
  ['s_moonlocker','myth','柜','月样封存柜',118000,'阿波罗时代规格的月球样本封存柜，氮气密封，标签上的日期是五十年前。'],
];
for (const [id, q, icon, name, price, desc] of RELIC_EXT2) {
  RELICS[id] = { q, z: id[0] === 'd' ? 'dam' : 'space', icon, name, price, desc };
}

/* ═══════ 医疗类收集品：医疗箱的主题货（不带 z，两张图都出） ═══════
   主题掉落之前目录里医疗件几乎空白，这里补一批撑起医疗箱的货色。 */
const RELIC_MED = [
  ['m_bandage',   'common', '绷', '军用绷带卷',       220,  '急救标准品，卷得整整齐齐，一包十条。'],
  ['m_iodine',    'common', '碘', '碘酒小瓶',         250,  '棕玻璃小瓶，瓶口缠着的棉线还是湿的。'],
  ['m_sulfa',     'common', '粉', '磺胺粉罐',         290,  '战地消炎粉，标签上的年份很有历史感。'],
  ['m_tourniquet','common', '带', '旋压式止血带',     320,  '卡扣还灵，旋杆上全是使用刻痕。'],
  ['m_plasma',    'rare',   '浆', '战地血浆包',       1250, '干血浆，温水化开就能用，冷链断过一次。'],
  ['m_morphine',  'rare',   '注', '吗啡自动注射剂',   1580, '三针装，针帽上有前任主人的牙印。'],
  ['m_triage',    'rare',   '册', '战地分诊手册',     1420, '扉页写着「先救能跑的」，页边写满批注。'],
  ['m_surgkit',   'epic',   '械', '军医手术器械箱',   4300, '整箱不锈钢器械，消毒指示条还没变色。'],
  ['m_serumbox',  'epic',   '清', '低温血清箱',       4900, '续航还剩四小时，箱缝里冒着白气。'],
  ['m_medcode',   'legend', '典', '军医规程 · 加密版', 13600, '全套战场救治规程，附录页被撕走了两页。'],
];
for (const [id, q, icon, name, price, desc] of RELIC_MED) {
  RELICS[id] = { q, icon, name, price, desc };   // 不写 z：两张图都出
}

/* ═══════ 贵重类补批：陈列柜的主题货（不带 z，两图都出） ═══════
   贵重类原本只有 myth/epic/common 档，补 rare 与 legend 各两件，
   让陈列柜在任何品质段都能出「珠宝古董」而不是兜底杂货。 */
const RELIC_LUX = [
  ['v_jade',   'rare',   '镯', '翡翠手镯',   1150,  '满绿正圈口，棉絮藏在内侧，懂行的照样抢。'],
  ['v_pearl',  'rare',   '链', '南洋珍珠链', 1300,  '三十七颗珠子，光泽还在线，扣头是后配的。'],
  ['v_brooch', 'legend', '钻', '钻石胸针',   12200, '老式镶嵌，主石两克拉，Partition 上有拍卖编号。'],
  ['v_screen', 'legend', '玉', '玉雕插屏',   14600, '整块山料雕的山水插屏，底座是紫檀的。'],
];
for (const [id, q, icon, name, price, desc] of RELIC_LUX) {
  RELICS[id] = { q, icon, name, price, desc };   // 不写 z：两张图都出
}

const RELIC_IDS = Object.keys(RELICS);

/* ═══════ 收集品主题分类 ═══════
   容器出货按主题偏好过滤池子：武器箱偏军械(mil)、医疗箱偏医疗(med)、
   文件柜偏情报(intel)、陈列柜偏贵重(val)。按名字关键词归类，先到先得，
   个别两可的用 OVERRIDE 点名；其余归 misc（杂项，任何箱子都可能带）。 */
const RELIC_CAT_RULES = [
  ['med',   /药剂|药品|医|绷|血清|血浆|手术|急救|疫苗|消毒|纱布|碘|磺胺|担架|病历|输液|针剂|急诊|血袋|生命维持|应急|止血/],
  ['val',   /鎏金|冠|冕|玉|钻|珠|宝|琥珀|蜜蜡|化石|龙涎|原石|翡翠|水晶|黄金|水银|怀表|星盘/],
  ['intel', /账|图纸|加密|密码|密钥|绝密|机密|档|文件|记录|日志|笔记|名单|名录|硬盘|磁带|终端|地图|印章?|证|数据|电台|对讲|电话|通讯|权限|坐标|清单|手册|规程|黑匣子/],
  ['mil',   /枪|弹|军|雷|炮|甲|夜视|瞄|狙|械|防弹|榴|坦克|装甲|工兵|战|武|刀|毒剂|哨/],
];
const RELIC_CAT_OVERRIDE = {
  africaheart: 'val', oceantear: 'val', tsarchest: 'val', goldcrown: 'val',
  jadeboulder: 'val', amberblock: 'val', ammonite: 'val', ambergris: 'val',
  starlabe: 'val', d_sunken: 'val', d_gold: 'val', d_mercury: 'val', d_watch: 'val',
};
function relicCat(id) {
  if (RELIC_CAT_OVERRIDE[id]) return RELIC_CAT_OVERRIDE[id];
  const r = RELICS[id];
  if (!r) return 'misc';
  for (const [cat, re] of RELIC_CAT_RULES) if (re.test(r.name)) return cat;
  return 'misc';
}

/* ═══════ 成就：结算时逐条判定，解锁即发奖金（只发一次） ═══════
   test(run, st)：run = 本局数据（success/kills/relics/blinds/swarmHits/bleedHits/
   silentKills/noArmor/tier），st = SAVE.stats（累计）。 */
const ACHIEVEMENTS = [
  { id: 'first_kill', name: '见血', desc: '完成第一次击杀', reward: 500, goal: 1, live: 'kills',
    test: (r, st) => st.kills >= 1 },
  { id: 'first_extract', name: '首战告捷', desc: '第一次成功撤离', reward: 2000,
    test: (r) => r.success },
  { id: 'heavy_haul', name: '满载而归', desc: '单局撤离携带 15 件收集品', reward: 3000, goal: 15, live: 'relics',
    test: (r) => r.success && r.relics >= 15 },
  { id: 'no_armor', name: '赤裸的勇气', desc: '不穿护甲完成一次撤离', reward: 2500,
    test: (r) => r.success && r.noArmor },
  { id: 'butcher', name: '屠夫', desc: '单局击杀 20 名敌人', reward: 4000, goal: 20, live: 'kills',
    test: (r) => r.kills >= 20 },
  { id: 'blind_master', name: '致盲大师', desc: '单局致盲 8 名敌人', reward: 3000, goal: 8, live: 'blinds',
    test: (r) => r.blinds >= 8 },
  { id: 'swarm_lord', name: '蜂群之主', desc: '单局流荧集群缠住 4 名敌人', reward: 3000, goal: 4, live: 'swarmHits',
    test: (r) => r.swarmHits >= 4 },
  { id: 'blood_letter', name: '血书', desc: '单局让 10 名敌人流血', reward: 2500, goal: 10, live: 'bleedHits',
    test: (r) => r.bleedHits >= 10 },
  { id: 'silent_edge', name: '无声之刃', desc: '静默潜袭期间单局击杀 3 人', reward: 3500, goal: 3, live: 'silentKills',
    test: (r) => r.silentKills >= 3 },
  { id: 'veteran', name: '老练', desc: '累计成功撤离 10 次', reward: 5000, goal: 10, live: 'extracts',
    test: (r, st) => st.extracts >= 10 },
  { id: 'executioner', name: '尸山血海', desc: '累计击杀 200 名敌人', reward: 8000, goal: 200, live: 'totalKills',
    test: (r, st) => st.kills >= 200 },
  { id: 'top_clear', name: '禁区归来', desc: '从顶级图成功撤离', reward: 6000,
    test: (r) => r.success && r.tier === 'top' },

  /* ── 扩编成就（共 50 条）：击杀 / 撤离 / 收集 / 买卖 / 折腾史 / 图鉴 / 枪匠 ── */
  { id: 'ach_kill35', name: '火力覆盖', desc: '单局击杀 35 名敌人', reward: 5500, goal: 35, live: 'kills',
    test: (r) => r.kills >= 35 },
  { id: 'ach_kill50', name: '无人生还', desc: '单局击杀 50 名敌人', reward: 9000, goal: 50, live: 'kills',
    test: (r) => r.kills >= 50 },
  { id: 'ach_ext25', name: '常客', desc: '累计成功撤离 25 次', reward: 7000, goal: 25, live: 'extracts',
    test: (r, st) => st.extracts >= 25 },
  { id: 'ach_ext50', name: '回家专家', desc: '累计成功撤离 50 次', reward: 12000, goal: 50, live: 'extracts',
    test: (r, st) => st.extracts >= 50 },
  { id: 'ach_ext100', name: '百战老兵', desc: '累计成功撤离 100 次', reward: 25000, goal: 100, live: 'extracts',
    test: (r, st) => st.extracts >= 100 },
  { id: 'ach_kill500', name: '百人斩', desc: '累计击杀 500 名敌人', reward: 12000, goal: 500, live: 'totalKills',
    test: (r, st) => st.kills >= 500 },
  { id: 'ach_kill1000', name: '千杀之人', desc: '累计击杀 1000 名敌人', reward: 25000, goal: 1000, live: 'totalKills',
    test: (r, st) => st.kills >= 1000 },
  { id: 'ach_kill2000', name: '活着的传说', desc: '累计击杀 2000 名敌人', reward: 40000, goal: 2000, live: 'totalKills',
    test: (r, st) => st.kills >= 2000 },
  { id: 'ach_ghost', name: '幽灵行动', desc: '一枪不放完成一次撤离（击杀 0）', reward: 4000,
    test: (r) => r.success && r.kills === 0 },
  { id: 'ach_blind15', name: '灯全熄了', desc: '单局致盲 15 名敌人', reward: 4800, goal: 15, live: 'blinds',
    test: (r) => r.blinds >= 15 },
  { id: 'ach_swarm8', name: '蜂潮', desc: '单局流荧集群缠住 8 名敌人', reward: 4500, goal: 8, live: 'swarmHits',
    test: (r) => r.swarmHits >= 8 },
  { id: 'ach_bleed20', name: '放血师', desc: '单局让 20 名敌人流血', reward: 4500, goal: 20, live: 'bleedHits',
    test: (r) => r.bleedHits >= 20 },
  { id: 'ach_silent6', name: '死寂', desc: '静默潜袭期间单局击杀 6 人', reward: 5200, goal: 6, live: 'silentKills',
    test: (r) => r.silentKills >= 6 },
  { id: 'ach_rel20', name: '搬家公司', desc: '单局撤离携带 20 件收集品', reward: 4200, goal: 20, live: 'relics',
    test: (r) => r.success && r.relics >= 20 },
  { id: 'ach_rel40', name: '移动仓库', desc: '单局撤离携带 40 件收集品', reward: 8000, goal: 40, live: 'relics',
    test: (r) => r.success && r.relics >= 40 },
  { id: 'ach_rel100', name: '囤货成瘾', desc: '累计带出 100 件收集品', reward: 6000,
    test: (r, st) => (st.relics | 0) >= 100 },
  { id: 'ach_rel500', name: '物流大亨', desc: '累计带出 500 件收集品', reward: 20000,
    test: (r, st) => (st.relics | 0) >= 500 },
  { id: 'ach_blind100', name: '暗影施法者', desc: '累计致盲 100 名敌人', reward: 8000,
    test: (r, st) => (st.blinds | 0) >= 100 },
  { id: 'ach_bleed200', name: '血债累累', desc: '累计让 200 名敌人流血', reward: 8000,
    test: (r, st) => (st.bleed | 0) >= 200 },
  { id: 'ach_value40k', name: '大单', desc: '单局撤离携带收集品估值 ¥40,000', reward: 5000, goal: 40000, live: 'value',
    test: (r) => r.success && (r.value | 0) >= 40000 },
  { id: 'ach_value100k', name: '天价包裹', desc: '单局撤离携带收集品估值 ¥100,000', reward: 12000, goal: 100000, live: 'value',
    test: (r) => r.success && (r.value | 0) >= 100000 },
  { id: 'ach_loot500k', name: '身家清白', desc: '累计撤离战利品估值 ¥500,000', reward: 10000,
    test: (r, st) => (st.loot | 0) >= 500000 },
  { id: 'ach_sold100k', name: '销冠', desc: '累计卖出 ¥100,000 的货', reward: 6000,
    test: (r, st) => (st.sold | 0) >= 100000 },
  { id: 'ach_sold1m', name: '黑市红人', desc: '累计卖出 ¥1,000,000 的货', reward: 18000,
    test: (r, st) => (st.sold | 0) >= 1000000 },
  { id: 'ach_die10', name: '学费交满', desc: '累计阵亡 10 次', reward: 1500,
    test: (r, st) => (st.deaths | 0) >= 10 },
  { id: 'ach_raid100', name: '全勤标兵', desc: '累计出勤 100 次行动', reward: 8000,
    test: (r, st) => (st.raids | 0) >= 100 },
  { id: 'ach_secret10', name: '高机密', desc: '从机密或绝密行动撤离 10 次', reward: 10000,
    test: (r, st) => (st.secret | 0) >= 10 },
  { id: 'ach_top5', name: '禁区熟客', desc: '从绝密行动撤离 5 次', reward: 12000,
    test: (r, st) => (st.top | 0) >= 5 },
  { id: 'ach_noarmor3', name: '裸奔三次', desc: '不穿护甲成功撤离 3 次', reward: 5000,
    test: (r, st) => (st.noArmor | 0) >= 3 },
  { id: 'ach_stash20', name: '囤积癖', desc: '仓库同时囤着 20 种收集品', reward: 4000,
    test: () => Object.keys(SAVE.stash || {}).length >= 20 },
  { id: 'ach_stash1m', name: '压仓之宝', desc: '仓库囤货总估值达 ¥1,000,000', reward: 20000,
    test: () => { let v = 0; for (const id in (SAVE.stash || {})) { const rr = RELICS[id]; if (rr) v += rr.price * (SAVE.stash[id] | 0); } return v >= 1000000; } },
  { id: 'ach_codex50', name: '半个行家', desc: '图鉴收录 50 种收集品', reward: 5000,
    test: () => Object.keys(SAVE.seenRelics || {}).filter(id => RELICS[id]).length >= 50 },
  { id: 'ach_codex150', name: '鉴定专家', desc: '图鉴收录 150 种收集品', reward: 15000,
    test: () => Object.keys(SAVE.seenRelics || {}).filter(id => RELICS[id]).length >= 150 },
  { id: 'ach_codexall', name: '坝区百科', desc: '图鉴收录全部收集品', reward: 60000,
    test: () => Object.keys(SAVE.seenRelics || {}).filter(id => RELICS[id]).length >= RELIC_IDS.length },
  { id: 'ach_mod20', name: '枪匠学徒', desc: '配件库存达到 20 件', reward: 3500,
    test: () => { let n = 0; for (const id in (SAVE.modBag || {})) n += SAVE.modBag[id] | 0; return n >= 20; } },
  { id: 'ach_modkind15', name: '配件收藏家', desc: '配件库收过 15 种不同配件', reward: 4000,
    test: () => Object.keys(SAVE.modBag || {}).filter(id => MODS[id]).length >= 15 },
  { id: 'ach_fullmod', name: '武装到牙齿', desc: '任意一把枪装满全部改装槽', reward: 5000,
    test: () => Object.keys(SAVE.mods || {}).some(wid => KNOWN_WEAPON_IDS[wid] &&
      Object.keys(SAVE.mods[wid]).length >= modSlotTotal(wid) && modSlotTotal(wid) > 0) },
  { id: 'ach_rich', name: '坝区首富', desc: '资金达到 ¥200,000', reward: 8000,
    test: () => (SAVE.credits | 0) >= 200000 },
];

/* ═══════ 委托：每日三份，进度跨局累计，回大厅领钱 ═══════
   metric 决定结算时加什么：kills/extracts/relics/value/blinds/swarmHits/
   bleedHits/silentKills/topExtracts/highExtracts/raids。
   目标值按 1~3 局设计 —— 一天清完是「多打两把」的量，不是签到。 */
const CONTRACTS = [
  { id: 'ct_kill25',  name: '清场行动', desc: '累计击杀 25 名敌人',                    metric: 'kills',        goal: 25,      reward: 3500 },
  { id: 'ct_kill45',  name: '血债血偿', desc: '累计击杀 45 名敌人',                    metric: 'kills',        goal: 45,      reward: 6000 },
  { id: 'ct_ext3',    name: '活着回来', desc: '成功撤离 3 次',                         metric: 'extracts',     goal: 3,       reward: 3000 },
  { id: 'ct_relic12', name: '搬空仓库', desc: '带出 12 件收集品',                      metric: 'relics',       goal: 12,      reward: 3000 },
  { id: 'ct_value',   name: '大单生意', desc: '带出收集品总估值 ¥40,000',              metric: 'value',        goal: 40000,   reward: 4000, money: 1 },
  { id: 'ct_blind6',  name: '熄灯',     desc: '致盲 6 名敌人',                          metric: 'blinds',       goal: 6,       reward: 2800 },
  { id: 'ct_swarm3',  name: '蜂群战术', desc: '流荧集群命中 3 次',                      metric: 'swarmHits',    goal: 3,       reward: 2600 },
  { id: 'ct_bleed8',  name: '放血',     desc: '让 8 名敌人流血',                        metric: 'bleedHits',    goal: 8,       reward: 2600 },
  { id: 'ct_silent2', name: '无声清点', desc: '静默潜袭期间击杀 2 人',                  metric: 'silentKills',  goal: 2,       reward: 3200 },
  { id: 'ct_top1',    name: '禁区一行', desc: '从绝密行动成功撤离 1 次',                metric: 'topExtracts',  goal: 1,       reward: 5000 },
  { id: 'ct_high1',   name: '机密档案', desc: '从机密或绝密行动成功撤离 1 次',          metric: 'highExtracts', goal: 1,       reward: 3000 },
  { id: 'ct_raids4',  name: '连续出勤', desc: '完成 4 次行动（无论成败）',              metric: 'raids',        goal: 4,       reward: 2200 },
];
const CONTRACT_BY_ID = {};
for (const c of CONTRACTS) CONTRACT_BY_ID[c.id] = c;

function contractDay() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* 按日期种子洗三份（同一天同一个人每次打开都是同一批） */
function pickContracts(seedStr, exclude) {
  let seed = hashStr(seedStr) || 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const skip = exclude || {};
  const pool = CONTRACTS.filter(c => !skip[c.id]);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.map(t => ({ id: t.id, prog: 0, done: 0 }));
}

function ensureContracts() {
  if (!SAVE.contracts || !Array.isArray(SAVE.contracts.list) || SAVE.contracts.day !== contractDay() || SAVE.contracts.list.length < 3) {
    SAVE.contracts = { day: contractDay(), list: pickContracts(contractDay()) };
    saveGame();
  }
  return SAVE.contracts;
}

/* 结算时推进委托：成功与否都算击杀 / 控场，收集品与撤离类只在成功时算 */
function updateContracts(success) {
  const C = ensureContracts();
  const gain = {
    kills: G.kills | 0,
    extracts: success ? 1 : 0,
    relics: success ? relicCount() : 0,
    value: success ? (G.lootValue | 0) : 0,
    blinds: G.blinds | 0,
    swarmHits: G.swarmHits | 0,
    bleedHits: G.bleedHits | 0,
    silentKills: G.silentKills | 0,
    topExtracts: success && G.tier === 'top' ? 1 : 0,
    highExtracts: success && G.tier !== 'standard' ? 1 : 0,
    raids: 1,
  };
  let doneN = 0;
  for (const e of C.list) {
    const t = CONTRACT_BY_ID[e.id];
    if (!t || e.done) continue;
    const before = e.prog | 0;
    const add = gain[t.metric] | 0;
    if (add > 0) e.prog = Math.min(t.goal, before + add);
    if (before < t.goal && (e.prog | 0) >= t.goal) doneN++;   // 只在「这一局刚好达标」时提示
  }
  saveGame();
  return doneN;
}

function contractReadyN() {
  ensureContracts();
  let n = 0;
  for (const e of SAVE.contracts.list) {
    const t = CONTRACT_BY_ID[e.id];
    if (t && !e.done && (e.prog | 0) >= t.goal) n++;
  }
  return n;
}

/* 结算时调用：返回本局新解锁的成就列表（并已写入存档、加了奖金） */
function checkAchievements(run) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (SAVE.achieved[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(run, SAVE.stats); } catch (e) { ok = false; }
    if (!ok) continue;
    SAVE.achieved[a.id] = 1;
    SAVE.credits += a.reward;
    out.push(a);
  }
  return out;
}

/* ── 局内成就进度追踪 ──
   只有带 live 字段（能实时算出来）的成就进追踪面板：
   击杀 / 收集品 / 致盲 / 集群 / 流血 / 静默击杀 / 累计撤离 / 累计击杀。
   「撤离成功」这类只能等结算的（首战告捷 / 赤裸的勇气 / 禁区归来）不列。 */
const ACH_LIVE = {
  kills:      () => G.kills | 0,
  relics:     () => relicCount(),
  value:      () => G.lootValue | 0,
  blinds:     () => G.blinds | 0,
  swarmHits:  () => G.swarmHits | 0,
  bleedHits:  () => G.bleedHits | 0,
  silentKills:() => G.silentKills | 0,
  extracts:   () => SAVE.stats.extracts | 0,
  totalKills: () => (SAVE.stats.kills | 0) + (G.kills | 0),
};

function achLiveRows() {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (!a.live || !a.goal) continue;
    if (SAVE.achieved && SAVE.achieved[a.id]) continue;
    const fn = ACH_LIVE[a.live];
    if (!fn) continue;
    let v = 0;
    try { v = Math.max(0, Math.min(a.goal, fn() | 0)); } catch (e) { v = 0; }
    out.push({ a, v, n: a.goal, r: v / a.goal });
  }
  out.sort((x, y) => y.r - x.r);
  return out;
}

/* 每帧（局内）跑一次：某条第一次达标时飘一条提示 —— 奖金仍留到结算发 */
function updateAchTracker() {
  if (!G.achReady) G.achReady = {};
  const rows = achLiveRows();
  for (const row of rows) {
    if (row.r < 1 || G.achReady[row.a.id]) continue;
    G.achReady[row.a.id] = 1;
    uiToast('成就达成 · ' + row.a.name + ' · 撤离结算发放', 'small');
  }
}
/* ── 收集品占格：按体积感逐件写死成 [宽, 高]，共八档 ——
      1x1 卡片/印章/小零件   2x1 饭盒/水壶/工具   2x2 方箱/仪器
      3x2 大件（发电机、泵、卫星部件 —— 史诗 / 传说的上限）
      3x3 特大 / 3x4 巨型 —— 只给红色（神话）品质，白蓝紫金一律不超过 3x2
      1x3 竖条（枪管、水管、弹链）   1x4 细长（氧气瓶、天线、燃料棒）
      舱列宽不够时 shapeOf 自动躺倒（3x2 进 2 列舱 → 2x3）；3x4 只有大背包塞得进。 ── */
const RELIC_GRID = {
  /* 1x1 · 卡片 / 印章 / 小零件 */
  badge: [1, 1], masterkey: [1, 1], nameplate: [1, 1], access: [1, 1], radchip: [1, 1],
  d_screw: [1, 1], d_biscuit: [1, 1], d_spoon: [1, 1], d_compass: [1, 1], d_nail: [1, 1],
  d_cup: [1, 1], d_tape: [1, 1], d_watch: [1, 1],
  s_oring: [1, 1], s_rivet: [1, 1], s_tape: [1, 1], s_marker: [1, 1], s_bolts: [1, 1],
  s_leak: [1, 1], s_badge: [1, 1], s_conn: [1, 1], s_gauge: [1, 1], s_patch: [1, 1],
  s_starchart: [1, 1], s_clamp: [1, 1], s_bulb: [1, 1], s_plug: [1, 1],
  d_collar: [1, 1], d_epaulet: [1, 1], d_seal: [1, 1], d_manifest: [1, 1],
  s_tibolt: [1, 1], s_datacard: [1, 1], s_escape: [1, 1], s_fuse: [1, 1],
  d_chip: [1, 1], d_token: [1, 1],
  d_vaultkey: [1, 1], d_seal2: [1, 1], s_satkey: [1, 1], s_fuelkey: [1, 1],
  africaheart: [1, 1], oceantear: [1, 1],   // 超稀有神话 1x1

  /* 1x2 · 竖直小件（神话金砖：红色档也有小体格） */
  d_goldbrick: [1, 2],

  /* 2x1 · 横向中型件 */
  shell: [2, 1], ration: [2, 1], canteen: [2, 1], hdd: [2, 1], ration_s: [2, 1],
  d_mess: [2, 1], d_cement: [2, 1], d_torch: [2, 1], d_glove: [2, 1], d_walkie: [2, 1],
  d_boot: [2, 1], d_camera: [2, 1], d_valve: [2, 1], d_map: [2, 1],
  s_pcbfrag: [2, 1], s_oxvalve: [2, 1], s_glass: [2, 1], s_spool: [2, 1], s_esd: [2, 1],
  s_tray: [2, 1], s_filter: [2, 1], s_hourglass: [2, 1],
  d_secure: [2, 1], d_scope: [2, 1], d_relay: [2, 1], d_ledger: [2, 1], d_evidence: [2, 1],
  s_hinge: [2, 1], s_rcs: [2, 1], s_fuelcell: [2, 1], s_lrf: [2, 1], s_astro: [2, 1],
  d_gangle: [2, 1], d_gold: [2, 1], d_blastmap: [2, 1], s_flightdata: [2, 1],
  d_notes: [2, 1], d_satphone: [2, 1], d_auction: [2, 1], d_vaultbook: [2, 1],
  s_strikecoord: [2, 1], s_havkList: [2, 1], d_arsenal: [2, 1],

  /* 2x2 · 方箱 / 仪器 */
  scrap: [2, 2], gasmask: [2, 2], core: [2, 2], blackbox: [2, 2], pcb: [2, 2],
  nozzle: [2, 2], gyro: [2, 2],
  d_helmet: [2, 2], d_cable: [2, 2], d_shellbag: [2, 2], d_waterbag: [2, 2], d_net: [2, 2],
  d_battery: [2, 2], d_paper: [2, 2], d_buoy: [2, 2], d_copper: [2, 2],
  s_insul: [2, 2], s_blanket: [2, 2], s_earmuff: [2, 2],
  d_cell: [2, 2], d_nvlens: [2, 2], d_valveset: [2, 2], d_oil: [2, 2], d_survey: [2, 2],
  d_jammer: [2, 2], d_plate: [2, 2], d_balloon: [2, 2], d_spare: [2, 2], d_sounder: [2, 2],
  s_star: [2, 2], s_gymotor: [2, 2], s_telemetry: [2, 2], s_suitglove: [2, 2], s_disk: [2, 2],
  s_tvc: [2, 2], s_coolpump: [2, 2], s_tile: [2, 2], s_imu: [2, 2], s_lis: [2, 2], s_obc: [2, 2],
  d_crypto: [2, 2], d_stress: [2, 2], d_nvg: [2, 2], d_mercury: [2, 2],
  s_rcs2: [2, 2], s_lifepack: [2, 2], s_bladder: [2, 2], s_satprop: [2, 2], s_emerg: [2, 2],
  s_atomic: [2, 2], s_quantum: [2, 2], s_blackbox2: [2, 2],
  /* 大件神话 2x2（两图通用）：红色档的方仪器级身价 */
  ammonite: [2, 2], amberblock: [2, 2], starlabe: [2, 2], observlens: [2, 2], ambergris: [2, 2],

  s_moonlocker: [2, 3],                          // 新形状神话：竖版大件
  /* 3x2 · 大件（机柜 / 泵 / 卫星部件）—— 史诗 / 传说的东西最大就到这里 */
  drone: [3, 2], terminal: [3, 2], solar: [3, 2], satnav: [3, 2],
  d_sandbag: [3, 2],
  d_ammobox: [3, 2], d_telegraph: [3, 2], d_gatectrl: [3, 2], d_toolbox: [3, 2], d_radio: [3, 2],
  s_vacuumpump: [3, 2], s_dock: [3, 2], s_mmod: [3, 2],
  d_pump: [3, 2], d_subpart: [3, 2], d_encradio: [3, 2],
  s_turbo: [3, 2], s_radar: [3, 2], s_camera: [3, 2], s_carbon: [3, 2],
  d_gen: [3, 2], d_mine: [3, 2],
  s_guidance: [3, 2], s_deepspace: [3, 2], s_siloTerm: [3, 2],
  d_mainterm: [3, 2], d_engine: [3, 2], s_turbopump: [3, 2], s_siloCore: [3, 2],
  s_spysat: [3, 2], s_capsule: [3, 2],

  /* 3x3 · 特大 —— 只有红色（神话）品质才给这么大 */
  reactor: [3, 3],
  d_sunken: [3, 3], s_asat: [3, 3],
  /* 大件神话 3x3（两图通用） */
  tsarchest: [3, 3], meteorcore: [3, 3], jadeboulder: [3, 3], goldcrown: [3, 3],

  /* 3x4 · 巨型 —— 同样只有红色（神话）品质 */
  engine: [3, 4],
  s_return: [3, 4], s_orbitcore: [3, 4], s_reusable: [3, 4],

  /* 1x3 · 竖条（枪管 / 水管 / 弹链 / 探针） */
  scope: [1, 3], belt: [1, 3], fuelbar: [1, 3],
  d_wrench: [1, 3], d_shovel: [1, 3], s_coolant: [1, 3], s_rod: [1, 3], s_probe: [1, 3],
  s_cablight: [1, 3], d_core: [1, 3],
  d_gatepin: [1, 3], s_escortmotor: [1, 3],      // 新形状神话：竖条

  /* 1x4 · 细长（氧气瓶 / 天线 / 燃料棒 / 刀） */
  d_pipe: [1, 4], s_alu: [1, 4], s_rope: [1, 4],
  d_prop: [1, 4], d_oxygen: [1, 4], s_seal: [1, 4], s_iridium: [1, 4],
  d_barrel: [1, 4], d_fuelrod: [1, 4], d_sword: [1, 4],

  /* ── 第二批收集品的大件占格：神话 3x3 / 传说 3x2，史诗偶有 2x2 ── */
  d_trident: [3, 3], s_padconsole: [3, 3],
  d_tigerfu: [1, 1], d_floodkey: [1, 1], s_codeline: [1, 1],
  d_jeepmotor: [3, 2], d_shaft: [1, 4], d_stonerub: [2, 2], d_bronzesafe: [2, 2],
  d_towerscope: [2, 1], d_turbineblade: [1, 3], d_winch: [2, 2], d_trans: [2, 1],
  s_centerstage: [3, 2], s_acsset: [3, 2], s_payloadbay: [2, 2], s_mirrorblank: [2, 2],
  s_canopy: [2, 2], s_harness: [2, 1], s_hptank: [1, 3], s_dishseg: [2, 1],
  d_banner: [2, 1], d_yuancoin: [1, 1], s_crewtag: [1, 1], s_moonsoil: [1, 1],
};
function relicShape(id) {
  const s = RELIC_GRID[id] || [1, 1];
  /* 3x3 / 3x4 只属于红色（神话）：万一以后有人给别的品质写大了，这里兜底压回 3x2 */
  if (s[0] === 3 && s[1] >= 3) {
    const r = RELICS[id];
    if (!r || r.q !== 'myth') return [3, 2];
  }
  return s;
}

/* 物品稀有度权重：rollRelicOf 在同品质池里按这个加权抽，没写的默认 1。
   超稀有 1x1 两明珠的身价是标出来的，掉率也得跟上 —— 份额 ≈ 同档其他红件的 1/4。 */
const RELIC_RARITY = {
  africaheart: 0.25,   // 非洲之心
  oceantear:   0.25,   // 海洋之泪
};

/* 当前战利品产地：拉闸图（航天基地）出太空货，其余出坝区货 */
function lootZone() { return G.extMode === 'switch' ? 'space' : 'dam'; }

/* ══════════════════════════════════════════════════════════
   改枪：配件表
   ──────────────────────────────────────────────────────────
   配件是「物资」不是解锁 —— 得在地图里搜出来，撤出去才留得住。
   eff 里全是乘算系数（1 = 不变），pierce 是加算。
   ══════════════════════════════════════════════════════════ */
const MOD_SLOTS = [
  { id: 'muzzle', cn: '枪口', en: 'MUZZLE' },
  { id: 'optic',  cn: '瞄具', en: 'OPTIC'  },
  { id: 'grip',   cn: '握把', en: 'GRIP'   },
  { id: 'mag',    cn: '弹匣', en: 'MAG'    },
  { id: 'stock',  cn: '枪托', en: 'STOCK'  },
];

const MODS = {
  /* ── 枪口 ── */
  supp: {
    slot: 'muzzle', q: 'rare', name: '消音器', icon: '抑', price: 1500,
    desc: '把枪声压成一声闷响，远处的人再难循声包过来；代价是初速和伤害略降。',
    eff: { noise: 0.40, dmg: 0.96, bspeed: 0.94, range: 0.96 },
  },
  comp: {
    slot: 'muzzle', q: 'epic', name: '战术补偿器', icon: '补', price: 2700,
    desc: '两道斜向导气槽把枪口上跳压回去，连发时准星听话得多；枪声更炸。',
    eff: { recoil: 0.74, spread: 0.94, noise: 1.15 },
  },
  barrel: {
    slot: 'muzzle', q: 'epic', name: '加长枪管', icon: '管', price: 3100,
    desc: '更长的膛线换来更高初速与伤害，远距离掉伤更晚；抬枪会沉一些。',
    eff: { dmg: 1.10, range: 1.22, bspeed: 1.08, adsTime: 1.12, move: 0.97 },
  },
  /* MK4 专属：连发改装枪管 —— eff.mode 覆写基础射击模式（weaponStats 里处理），
     三连点射 → 全自动。guns 白名单限定只有 MK4 能装。 */
  mk4_auto: {
    slot: 'muzzle', q: 'epic', name: 'MK4 连发改装枪管', icon: '连', price: 3000,
    desc: 'MK4 专用的连发改装套件：开放节套 + 强制挂机枪管，把出厂的三连点射改成真正的全自动 —— 装上之后扣住扳机不放就是泼水。',
    eff: { mode: 'auto' },
    guns: ['mk4'],
  },

  /* ── 瞄具 ── */
  reddot: {
    slot: 'optic', q: 'common', name: '红点镜', icon: '点', price: 700,
    desc: '最基础的开放式红点，抬枪快、视野干净，正面交锋的首选。',
    eff: { adsTime: 0.84, adsSpread: 0.90 },
  },
  holo: {
    slot: 'optic', q: 'rare', name: '全息镜', icon: '全', price: 1800,
    desc: '全息分划在中距离更好压点，代价是抬枪稍慢一点点。',
    eff: { adsSpread: 0.84, adsTime: 0.94 },
  },
  scope4x: {
    slot: 'optic', q: 'epic', name: '四倍镜', icon: '倍', price: 3200,
    desc: '把远处的人拉到眼前。开镜精度高得吓人，但抬枪慢、开镜后几乎挪不动。',
    eff: { adsSpread: 0.62, adsTime: 1.35, adsMove: 0.88, spread: 0.96 },
  },

  /* ── 握把 ── */
  lgrip: {
    slot: 'grip', q: 'common', name: '轻型握把', icon: '轻', price: 650,
    desc: '塑料壳体，几乎不压枪，但走位更轻快 —— 拿命换脚的改法。',
    eff: { move: 1.06, adsMove: 1.06, recoil: 1.05 },
  },
  vgrip: {
    slot: 'grip', q: 'rare', name: '垂直握把', icon: '垂', price: 1600,
    desc: '最实用的握把：把纵向后坐压掉两成，长点射不再朝天。',
    eff: { recoil: 0.80 },
  },
  laser: {
    slot: 'grip', q: 'epic', name: '激光指示器', icon: '激', price: 2600,
    desc: '腰射散布大幅收紧，冲进屋子时不用抬枪也能打准；开镜反而略受影响。',
    eff: { spread: 0.80, adsSpread: 1.02 },
  },

  /* ── 弹匣 ── */
  lightmag: {
    slot: 'mag', q: 'common', name: '轻量弹匣', icon: '容', price: 600,
    desc: '换成聚合物壳体，背着轻、走得快；装弹量少一点。',
    eff: { move: 1.04, mag: 0.95 },
  },
  extmag: {
    slot: 'mag', q: 'rare', name: '扩容弹匣', icon: '扩', price: 1900,
    desc: '加长弹匣多装四成子弹，一个弹匣能多放倒两个人；换弹更笨重。',
    eff: { mag: 1.45, reload: 1.15, move: 0.98 },
  },
  quickmag: {
    slot: 'mag', q: 'epic', name: '速拔弹匣', icon: '快', price: 2900,
    desc: '快拔套 + 漏斗口，换弹快三成，火力断档短得几乎听不出来；容量缩水。',
    eff: { reload: 0.68, mag: 0.85 },
  },

  /* ── 枪托 ── */
  folding: {
    slot: 'stock', q: 'common', name: '折叠枪托', icon: '折', price: 550,
    desc: '折起来挂身上不碍事，跑动更快；抵肩不实，后坐略涨。',
    eff: { move: 1.07, recoil: 1.06 },
  },
  heavy: {
    slot: 'stock', q: 'rare', name: '重型枪托', icon: '重', price: 1700,
    desc: '实心托底把后坐顶回肩膀里，代价是开镜时挪得更慢。',
    eff: { recoil: 0.78, adsMove: 0.94 },
  },
  tactic: {
    slot: 'stock', q: 'epic', name: '战术枪托', icon: '战', price: 2800,
    desc: '可调托腮 + 缓冲垫，抬枪更快、散布更小，几乎是一把新枪。',
    eff: { adsTime: 0.76, spread: 0.93, recoil: 0.94 },
  },

  /* ── 航天基地军工配件（z:'space'，只在航天基地产出，档位更高） ── */
  brake_s: {
    slot: 'muzzle', q: 'epic', z: 'space', name: '哈夫克制退器', icon: '退', price: 3300,
    desc: '军规三室制退器，连发时枪口几乎不上跳；代价是枪声大得像在打信号弹。',
    eff: { recoil: 0.62, spread: 0.90, noise: 1.18 },
  },
  hygrip: {
    slot: 'grip', q: 'epic', z: 'space', name: '液压阻尼握把', icon: '液', price: 3050,
    desc: '内置液压缓冲的握把，把后坐力吃掉一大截；握着像握着一小块稳如老狗的地面。',
    eff: { recoil: 0.70, adsSpread: 0.90, move: 0.99 },
  },
  carstock: {
    slot: 'stock', q: 'epic', z: 'space', name: '碳纤维战术枪托', icon: '碳', price: 3200,
    desc: '航空级碳纤维一体托，又轻又稳，抬枪快、跑得动、后坐还小。',
    eff: { adsTime: 0.82, move: 1.05, recoil: 0.92 },
  },
  drummag: {
    slot: 'mag', q: 'epic', z: 'space', name: '哈夫克快拔弹鼓', icon: '鼓', price: 3400,
    desc: '军规快拔弹鼓：容量、换速两头都要 —— 厂里说这是给「安全总监的卫队」配的。',
    eff: { mag: 1.55, reload: 0.85 },
  },
  supp_s: {
    slot: 'muzzle', q: 'legend', z: 'space', name: '特制消音模块', icon: '默', price: 6800,
    desc: '哈夫克军工厂的旗舰消音模块：压住枪声的同时不牺牲初速与杀伤，疯抢级别的硬货。',
    eff: { noise: 0.30, dmg: 1.00, bspeed: 0.97, range: 1.00 },
  },
  thermal: {
    slot: 'optic', q: 'legend', z: 'space', name: '热成像瞄具', icon: '热', price: 7200,
    desc: '军用热成像通道：开镜精度拉满，掩体后面的体温都藏不住；抬枪偏慢是唯一缺点。',
    eff: { adsSpread: 0.55, adsTime: 1.20, adsMove: 0.92, spread: 0.94 },
  },
};

/* ═══════ 扩展配件：零号大坝 16 件 + 航天基地 16 件 ═══════
   紧凑表：[id, 槽位, 品质, 名称, 图标, 价格, 描述, 效果] */
const MOD_EXT = [
  ['d_mz_flash','muzzle','common','短管消焰器','焰',720,'削掉枪口的大半火光，夜里不至于像举着信号灯。', { noise: 0.85, spread: 0.97 }],
  ['d_mz_can','muzzle','rare','老式消音碗','碗',1900,'坝区黑作坊的土制消音碗：声是小了，动能也掉了。', { noise: 0.55, dmg: 0.95, range: 0.92 }],
  ['d_mz_hammer','muzzle','epic','重锤制退器','锤',3200,'一块实心钢块顶在枪口，后坐被硬生生吃掉；动静也大得离谱。', { recoil: 0.7, noise: 1.2, move: 0.98 }],
  ['d_op_iron','optic','common','机械瞄具','机',420,'最朴素的准星，抬枪快得没话说，精度全靠手。', { adsTime: 0.9, adsSpread: 1.02 }],
  ['d_op_prism','optic','rare','二倍棱镜','棱',1750,'中距离点射的甜点倍率，视野还留得住。', { adsSpread: 0.85, adsTime: 1.05 }],
  ['d_op_night','optic','epic','夜视镜','夜',3100,'坝区夜里能看穿暗角，抬枪会慢上一拍。', { adsSpread: 0.72, adsTime: 1.18 }],
  ['d_op_long','optic','legend','长焦观察镜','焦',6400,'把三百米外的人拉到眼前，代价是开镜后几乎动不了。', { adsSpread: 0.5, adsTime: 1.45, adsMove: 0.85 }],
  ['d_gr_rag','grip','common','缠布握把','布',380,'布条一圈圈缠上去，握着不打滑，聊胜于无。', { move: 1.03, recoil: 1.04 }],
  ['d_gr_rubber','grip','rare','橡胶握把','胶',1500,'实心橡胶把后坐吃得干净，握久了手不麻。', { recoil: 0.88 }],
  ['d_gr_bipod','grip','epic','前握把支架','架',2900,'折叠支架撑住枪身，连发时稳得不像同一把枪。', { recoil: 0.76, adsMove: 0.95 }],
  ['d_mg_tin','mag','common','铁皮弹匣','匣',560,'铁皮敲出来的弹匣，能装一点，换弹慢一点。', { mag: 1.12, reload: 1.1 }],
  ['d_mg_quick','mag','rare','快速弹匣套','套',1800,'快拔套加漏斗口，换弹干脆利落。', { reload: 0.85, mag: 0.95 }],
  ['d_mg_clamp','mag','epic','双联弹匣夹','夹',2950,'两个弹匣并排夹住，换弹只花一半时间。', { reload: 0.72, move: 0.97 }],
  ['d_st_wood','stock','common','木托','木',500,'老木托，抵肩扎实，就是有点沉。', { recoil: 0.94, move: 0.98 }],
  ['d_st_cheek','stock','rare','可调托腮板','腮',1650,'托腮高度可调，抬枪找镜更快。', { adsTime: 0.9, recoil: 0.95 }],
  ['d_st_pad','stock','epic','缓冲托底','垫',2700,'聚氨酯托底把后坐顶回肩膀里，连发不再散架。', { recoil: 0.8, adsTime: 0.94 }],
  ['s_mz_ti','muzzle','rare','钛制消焰器','钛',2100,'航天级钛合金消焰器，几乎不增重。', { noise: 0.9, recoil: 0.96 }],
  ['s_mz_supp','muzzle','epic','定向抑制器','抑',3600,'军规抑制器：声压砍掉一半，弹道几乎不变。', { noise: 0.45, dmg: 0.98, range: 0.98 }],
  ['s_mz_em','muzzle','legend','电磁制退环','磁',7000,'通电的制退环把枪口上跳按死，开火像在打气枪。', { recoil: 0.58, spread: 0.88, noise: 1.1 }],
  ['s_op_micro','optic','common','微型反射镜','微',680,'指甲盖大的反射镜，抬枪快得像是没有配件。', { adsTime: 0.88 }],
  ['s_op_holo2','optic','rare','全息投影镜','投',1950,'投影分划在强光下也清楚，中距离好压点。', { adsSpread: 0.88, adsTime: 0.96 }],
  ['s_op_var','optic','epic','变倍战术镜','变',3400,'一倍到四倍连续可调，一镜走完远近。', { adsSpread: 0.66, adsTime: 1.28 }],
  ['s_op_quantum','optic','legend','军用量子瞄具','量',7400,'哈夫克军规量子瞄具：分划自动补偿弹道，开镜还快。', { adsSpread: 0.52, adsTime: 0.92, spread: 0.9 }],
  ['s_gr_carbon','grip','common','碳纤维前握','碳',620,'轻得像塑料，压枪效果一般，走位没负担。', { recoil: 0.94, move: 1.03 }],
  ['s_gr_alu','grip','rare','铝合金骨架握把','架',1700,'镂空骨架握把，稳且不重。', { recoil: 0.84, move: 1.02 }],
  ['s_gr_mag','grip','epic','磁吸稳定握把','磁',3000,'内部磁阻尼吃掉枪身抖动，腰射也跟着准。', { recoil: 0.68, adsSpread: 0.92 }],
  ['s_mg_twin','mag','common','军用双排弹匣','排',700,'军规双排结构，容量比民用款大一圈。', { mag: 1.2, reload: 1.05 }],
  ['s_mg_well','mag','rare','快拆弹匣井','井',1850,'漏斗形弹匣井，闭着眼睛也能插进去。', { reload: 0.8 }],
  ['s_mg_lightdrum','mag','epic','轻量化弹鼓','鼓',3500,'航空铝弹鼓，容量大还不太坠手。', { mag: 1.5, move: 0.96 }],
  ['s_st_frame','stock','common','折叠骨架托','骨',560,'钢架折叠托，跑动轻快，抵肩一般。', { move: 1.05, recoil: 0.97 }],
  ['s_st_pneu','stock','rare','气动缓冲托','气',1750,'气动缓冲把后坐吸进去，连发节奏更稳。', { recoil: 0.74, adsTime: 0.98 }],
  ['s_st_tel','stock','epic','军规伸缩托','伸',3100,'六档伸缩＋托腮，抬枪快、后坐小、跑得动。', { adsTime: 0.86, recoil: 0.9, move: 1.02 }],
];
for (const [id, slot, q, name, icon, price, desc, eff] of MOD_EXT) {
  MODS[id] = { slot, q, z: id[0] === 'd' ? 'dam' : 'space', name, icon, price, desc, eff };
}

/* ═══════ 扩展配件 · 第二批：22 件通用 + 8 件专属 ═══════
   紧凑表：[id, 槽位, 品质, 名称, 图标, 价格, 描述, 效果, 适用类目(可省), 专属枪(可省)]
   fit   = 武器类目白名单（省略 = 全类目通用）—— 不是所有枪都能装同一种配件
   guns  = 专属枪 id 列表（写了 guns 就只有这几把枪能装） */
const MOD_EXT2 = [
  /* ── 通用新配件（带类目适配） ── */
  ['d_mz_brake2','muzzle','rare','双室制退器','双',1650,'两室开孔把后坐分成两口气泄掉，比单室温和得多。', { recoil: 0.84, noise: 1.08 }, ['rifle','dmr','lmg','sniper']],
  ['d_mz_poly','muzzle','common','聚合消音管','聚',900,'塑料壳的便宜消音管，声音小一半，动能也小一半。', { noise: 0.6, dmg: 0.94 }, ['smg','pistol']],
  ['d_op_ring','optic','common','微光准星','芒',500,'一圈发光的荧光准星，抬枪时眼睛不用重新找点。', { adsTime: 0.92, spread: 0.98 }],
  ['d_op_6x','optic','epic','六倍镜','六',3600,'六倍放大的精确镜，八百米外看得见帽徽；抬枪慢得像换弹。', { adsSpread: 0.58, adsTime: 1.4, adsMove: 0.86 }, ['dmr','sniper']],
  ['d_gr_angled','grip','rare','斜角前握','斜',1550,'四十五度斜握把，手腕不吃劲，长点射手感极顺。', { recoil: 0.86, adsTime: 0.96 }, ['rifle','smg','shotgun','lmg']],
  ['d_gr_thumb','grip','common','拇指止滑套','指',420,'握把上套一圈防滑纹，手汗多的人有福了。', { adsTime: 0.95, recoil: 0.97 }, ['pistol','smg']],
  ['d_mg_plus','mag','common','加厚弹匣簧','簧',640,'换一根硬一点的托弹簧，容量涨一成半，供弹更稳。', { mag: 1.15, reload: 1.04 }, ['pistol','smg','rifle']],
  ['d_mg_drum2','mag','epic','野战弹鼓','鼓',3300,'七十五发的野战弹鼓，火力断档这个词跟你无缘。', { mag: 1.4, reload: 1.2, move: 0.97 }, ['smg','rifle','lmg']],
  ['d_st_skel','stock','rare','骨架折叠托','骨',1600,'钢架骨架托，折起来是一根小棍，展开抵肩也扎实。', { move: 1.04, recoil: 0.93 }, ['rifle','smg','dmr']],
  ['d_st_ball','stock','epic','平衡配重托','衡',3000,'托尾灌了配重铅，整枪重心后移，抬枪稳得像端着秤。', { recoil: 0.82, adsSpread: 0.95, move: 0.96 }, ['dmr','sniper']],
  ['s_mz_rail','muzzle','epic','消焰制退一体','合',3800,'制退孔与消焰槽开在同一节枪口件上，军工厂的抠门杰作。', { recoil: 0.78, noise: 0.95 }, ['rifle','lmg','dmr']],
  ['s_op_eco','optic','epic','轻量无框镜','无',2800,'无边框镜片只有一层玻璃，抬枪快得像没装镜。', { adsTime: 0.8, adsSpread: 0.94 }, ['smg','rifle','pistol']],
  ['s_gr_hybrid','grip','epic','复合斜握把','复',2900,'斜握加阻尼垫的复合设计，压枪和腰射两头都占。', { recoil: 0.82, spread: 0.94 }, ['rifle','smg']],
  ['s_mg_cask','mag','epic','备用弹匣袋','袋',3100,'枪托侧面挂两个满弹匣，换弹时手不用往腰上摸。', { reload: 0.78, move: 0.98 }],
  ['s_st_ergo','stock','epic','人机工学托','工',3050,'托底角度照着几百份士兵问卷调的，肩感无可挑剔。', { adsTime: 0.85, recoil: 0.9, spread: 0.96 }, ['rifle','dmr','smg']],
  ['s_mz_hush','muzzle','rare','微声管','微',2000,'蜂巢式内壁吃掉大部分声压，代价是弹速。', { noise: 0.5, dmg: 0.95, range: 0.95 }, ['smg','pistol']],
  ['s_op_cqh','optic','rare','快瞄镜','快',1900,'为大窗口近距离交火设计的快瞄镜，抬枪快、视野阔。', { adsTime: 0.78, adsSpread: 1.04 }, ['pistol','smg','shotgun']],
  ['d_gr_rod','grip','rare','铝合金握把','铝',1500,'整根铝棒铣出来的握把，轻且不变形。', { recoil: 0.87, move: 1.01 }, ['rifle','lmg','dmr']],
  ['d_mg_mark','mag','rare','刻度弹匣','刻',1750,'弹匣侧面开观察孔，还剩几发一眼扫出来，换弹时机掐得准。', { reload: 0.9, mag: 1.05 }, ['rifle','dmr','sniper']],
  ['d_st_recoil','stock','rare','减震托底板','减',1700,'聚氨酯托底夹层，重枪的 kickoff 被垫掉一截。', { recoil: 0.85, adsMove: 0.97 }, ['shotgun','lmg','rifle']],
  ['s_mg_chain','mag','epic','弹链转换器','链',4200,'把弹匣枪改成弹链供弹的军改套件，厂里只给重枪班组配。', { mag: 1.6, reload: 0.9, move: 0.95 }, ['lmg']],
  ['s_gr_claw','grip','legend','机械稳定爪','爪',6900,'哈夫克为总监卫队的重枪手定制的伺服稳定爪，后坐被机械臂按在原地。', { recoil: 0.6, adsSpread: 0.88 }, ['lmg']],

  /* ── 专属配件（guns 指定枪，别家装不上） ── */
  ['d_ak_dust','optic','rare','AK 侧轨镜桥','桥',1850,'卡在 AK 系机匣侧面的镜桥，装完依旧留着那个经典导轨间隙。', { adsSpread: 0.88, adsTime: 0.98 }, null, ['akm','ak12','rpk']],
  ['d_asval_int','muzzle','epic','一体式微声枪口','默',3600,'AS 与 SR-3M 的原厂微声枪口，与消音短枪管一体加工，声压低到只剩机械音。', { noise: 0.32, dmg: 1.0, bspeed: 0.98 }, null, ['asval','sr3m']],
  ['d_bull_kit','stock','epic','无托缓冲组件','托',2900,'无托结构的贴腮与缓冲垫整套，后坐直接顶进肩窝里，抬枪也顺了。', { recoil: 0.85, adsTime: 0.9 }, null, ['qbz95','qbz192','aug']],
  ['d_pistol_comp','muzzle','rare','手枪补偿器','枪',1400,'巴掌小的手枪补偿器，开一枪手腕少歪一次。', { recoil: 0.82, noise: 1.05 }, null, ['g17','93r','g18']],
  ['d_sg_port','muzzle','epic','霰弹散热护套','套',3100,'枪管外的散热护套带 M24 式通风孔，连喷两管不烫手，霰弹收束更紧。', { spread: 0.88, dmg: 1.02, move: 0.98 }, null, ['m870']],
  ['d_sniper_bipod','grip','legend','狙击重型两脚架','架',6200,'狙击枪专用的液压阻尼两脚架，架住之后枪几乎长在地上。', { recoil: 0.55, adsSpread: 0.85, adsMove: 0.9 }, ['sniper']],
  ['d_lmg_sled','stock','epic','供弹手稳定托','托',3400,'机枪手专用的宽大稳定托，蹲下压制时枪身稳得像焊在掩体上。', { recoil: 0.8, move: 1.03 }, ['lmg']],
  ['s_director_kit','optic','legend','「总监」瞄准组件','督',8800,'安全总监的护卫队用顶级瞄具组件：自动归零、弹道补偿，只匹配最大的那支反器材枪。', { adsSpread: 0.45, adsTime: 1.1, spread: 0.92 }, ['sniper'], ['awm']],
];
for (const [id, slot, q, name, icon, price, desc, eff, fit, guns] of MOD_EXT2) {
  MODS[id] = { slot, q, z: id[0] === 'd' ? 'dam' : 'space', name, icon, price, desc, eff };
  if (fit) MODS[id].fit = fit;
  if (guns) MODS[id].guns = guns;
}

/* 老配件补类目适配：倍率越高的镜 / 弹鼓 / 脚架越不该人手一个 */
const MOD_FIT = {
  scope4x: ['rifle', 'dmr', 'sniper', 'lmg'],
  thermal: ['rifle', 'dmr', 'sniper', 'lmg'],
  s_op_var: ['rifle', 'dmr', 'sniper', 'lmg'],
  d_op_long: ['sniper', 'dmr'],
  d_op_night: ['rifle', 'dmr', 'sniper', 'smg'],
  d_op_prism: ['rifle', 'dmr', 'smg'],
  drummag: ['smg', 'lmg'],
  s_mg_lightdrum: ['smg', 'lmg'],
  d_gr_bipod: ['dmr', 'sniper', 'lmg'],
  barrel: ['rifle', 'dmr', 'sniper', 'lmg'],
  comp: ['pistol', 'smg', 'rifle', 'dmr', 'lmg'],
  quickmag: ['pistol', 'smg', 'rifle', 'dmr'],
  d_mg_clamp: ['pistol', 'smg', 'rifle'],
  s_mg_twin: ['smg', 'rifle', 'lmg'],
  heavy: ['rifle', 'dmr', 'sniper', 'lmg'],
  tactic: ['rifle', 'dmr', 'smg'],
  carstock: ['rifle', 'smg', 'dmr'],
};
for (const k in MOD_FIT) if (MODS[k]) MODS[k].fit = MOD_FIT[k];

/* ══════════════════════════════════════════════════════════
   1. 存档
   ══════════════════════════════════════════════════════════ */
/* key 里的 neonpurge 是旧名，故意不改：换 key 等于清空所有老玩家的存档 */
const SAVE_KEY = 'neonpurge_extract_v1';

/* 携行装备全量 key 表 —— 必须定义在 loadSave() 执行（let SAVE = loadSave()）之前，
   因为 cleanGearOwned 在读档阶段就要用（那时 GEAR 表还没初始化）。
   新增弹挂 / 背包时同步在这里加 key。 */
const GEAR_KEYS = ['dar', 'heijiang', 'jufeng', 'gir', 'drc', 'raider', 'xiqiang', 'g01', 'dsa', 'hd3',
  'jyd', 'ty', 'd01', 'hk3', 'nylon', 'gzd', 'qxs', 'scout', 'bxb',
  'pack_sling', 'pack_sport', 'pack_travel', 'pack_canvas', 'pack_outdoor', 'pack_dgsport',
  'pack_bolt', 'pack_raidpk', 'pack_camp', 'pack_bigmtn', 'pack_3h', 'pack_ga', 'pack_dash',
  'pack_jungle', 'pack_d2', 'pack_march', 'pack_map', 'pack_gt1', 'pack_d3', 'pack_hls',
  'pack_als', 'pack_surv', 'pack_gt5', 'pack_d7', 'pack_heavymtn', 'pack_gto'];
/* 老弹挂 key → 新弹挂 key（按容量就近映射；读档时把所有权 / 穿着状态搬过去） */
const RIG_KEY_MIGRATE = { rig_basic: 'd01', rig_ext: 'dsa', rig_light: 'g01', rig_tactic: 'raider',
  rig_elite: 'drc', rig_storm: 'gir', rig_havk: 'dar' };
/* 旧背包 key → 新背包 key（按容量就近映射，读档时搬所有权 / 穿着状态） */
const PACK_KEY_MIGRATE = { pack_assault: 'pack_sling', pack_large: 'pack_sport', pack_hike: 'pack_outdoor',
  pack_exp: 'pack_bigmtn', pack_alpine: 'pack_3h', pack_mil: 'pack_ga', pack_air: 'pack_d2',
  pack_delta: 'pack_gt1', pack_logi: 'pack_gt5', pack_chixiao: 'pack_heavymtn', pack_director: 'pack_gto' };

/* ── 物品占格表（字面量）──
   必须定义在 loadSave() 执行之前：读档清洗 / 老档重排会调 cellSize()，
   那时 WEAPONS / MEDKITS 这些运行期数据表还没初始化。
   没登记的 id 按类型兜底：枪 4 / 手术·修理·近战 2 / 护甲 6 / 其余 1。 */
const CELLS = {
  /* 枪：手枪 2（1x2），冲锋枪 6（3x2），短身突击步枪 8（4x2），
     标准步枪 / 精确射手 / 轻机枪 10（5x2），霰弹 8（4x2），狙击 5~7（横条）
     —— 体积越大越占地方：一把 HK416 换出来的空间不再是两把 AKM 的量 */
  g17: 2, '93r': 2, g18: 2,
  bizon: 6,
  mk4: 6, thompson: 6, mp7: 6, vector: 6,
  aug: 8, mcx: 8, sr3m: 8,
  akm: 10, m4a1: 10, qbz95: 10, ak12: 10, qbz192: 10, qbz191: 10, sr9: 10,
  hk416: 10, k437: 10, asval: 10,
  rpk: 10, m249: 10, pkm: 10,
  sks: 10, m14: 10, sr25: 10, svd: 10,
  m870: 8, r93: 5, awm: 7, m700: 5,
  /* 医疗包：注射器 1，软包 2，医疗箱 4 */
  inject_s: 1, inject_m: 1, kit_vehicle: 2, kit_field: 2, box_outdoor: 4, box_battle: 4,
  /* 止血 / 止痛：一律 1 格 */
  bandage: 1, tourniquet: 1, pain_release: 1, pain_antibio: 1, pain_dve: 1,
  /* 手术包：简易 1，战术快拆 2，DEK 3 */
  surg_simple: 1, surg_tactical: 2, surg_dek: 3,
  /* 甲修包：蓝 / 紫 2，金 / 红 4 */
  repair_b: 2, repair_p: 2, repair_g: 4, repair_r: 4,
};
/* 显式占格形状 [宽, 高]：宽 = 横排格数，高 = 行数。表里没有的按 cellSize + 舱列数自动取近似方形。
   舱放不下这个宽度时会自动躺倒（宽高互换）—— 比如 AWM 7x1 进 5 列背包格就竖成 1x7。 */
const SHAPES = {
  akm: [5, 2], m4a1: [5, 2], qbz95: [5, 2], ak12: [5, 2], qbz192: [5, 2], qbz191: [5, 2], sr9: [5, 2],
  hk416: [5, 2], k437: [5, 2], asval: [5, 2],
  rpk: [5, 2], m249: [5, 2], pkm: [5, 2],
  sks: [5, 2], m14: [5, 2], sr25: [5, 2], svd: [5, 2],
  aug: [4, 2], mcx: [4, 2], sr3m: [4, 2],
  mk4: [3, 2], thompson: [3, 2], mp7: [3, 2], vector: [3, 2],
  g17: [2, 1], '93r': [2, 1], g18: [2, 1],
  bizon: [3, 2],
  m870: [4, 2], r93: [5, 1], awm: [7, 1], m700: [5, 1],
  surg_simple: [1, 1], surg_tactical: [2, 1], surg_dek: [3, 1],
};

/* ═══════ 配件占格：按体积分四档 ═══════
   小件 1x1（1 格）—— 单格小零件：小瞄具 / 小握把 / 民用小弹匣 / 折叠托 / 消焰器
   中件 2x1（2 格）—— 一整块机构或一个短组件：消音器 / 常规瞄具 / 扩容弹匣 / 战术托 / 制退环
   长件 3x1（3 格）—— 一根管、一条轨、一付架：枪管 / 倍镜 / 抑制器 / 两脚架 / 弹链 / 供弹托
   鼓件 2x2（4 格）—— 只有弹鼓这种又粗又圆的东西：三种鼓（哈夫克 / 轻量 / 野战）
   3x1 是弹挂最主流的舱形（blocks 里 [3,1] 遍地都是），长件横着正好卡进一格；
   进不去就自动躺倒成 1x3，竖舱也吃得下。
   口袋是 5 个独立的单格舱，所以中件以上的配件塞不进裤兜，只能进弹挂或背包 ——
   搜到一根长枪管就得腾地方，这是配件该有的运输成本。
   新增配件请往这四张表里挑一档，否则会落到 cellSize 的「1 格」兜底。 */
const MOD_FOOT = [
  [1, 1, [
    'd_mz_flash', 'd_mz_poly', 'd_mz_brake2', 'd_pistol_comp', 's_mz_ti',
    'd_op_iron', 'd_op_ring', 's_op_micro', 'reddot', 's_op_cqh',
    'd_gr_rag', 'd_gr_thumb', 's_gr_carbon', 'lgrip', 'd_gr_rod', 'd_gr_rubber',
    'd_mg_tin', 'lightmag', 's_mg_twin', 'd_mg_plus', 'd_mg_quick', 's_mg_well', 'd_mg_mark',
    'd_st_wood', 'folding', 's_st_frame', 'd_st_cheek', 'd_st_skel',
  ]],
  [2, 1, [
    'supp', 'd_mz_can', 's_mz_hush', 'comp', 'd_mz_hammer', 's_mz_rail', 'd_sg_port', 'brake_s',
    'holo', 's_op_holo2', 'd_op_prism', 's_op_eco', 'd_ak_dust',
    'vgrip', 's_gr_alu', 'd_gr_angled', 's_gr_hybrid', 'laser', 'hygrip', 's_gr_mag',
    'extmag', 'quickmag', 'd_mg_clamp', 's_mg_cask',
    'heavy', 'tactic', 'carstock', 'd_st_pad', 's_st_pneu', 's_st_tel',
    'd_st_ball', 's_st_ergo', 'd_st_recoil', 'd_bull_kit',
    's_mz_em',
  ]],
  [3, 1, [
    /* 枪管：长过枪身的整根管 */
    'barrel', 'mk4_auto',
    /* 消音 / 抑制：一整节管件 */
    'supp_s', 's_mz_supp', 'd_asval_int',
    /* 倍镜：一条带筒身的光学轨 */
    'scope4x', 'd_op_6x', 'thermal', 'd_op_night', 'd_op_long', 's_op_var', 's_op_quantum',
    's_director_kit',
    /* 架：折起来是一根横杆 */
    'd_gr_bipod', 'd_sniper_bipod', 's_gr_claw',
    /* 供弹：弹链箱与宽稳定托 */
    's_mg_chain', 'd_lmg_sled',
  ]],
  [2, 2, [
    /* 只剩弹鼓：又粗又圆，横竖都占两格 */
    'drummag', 's_mg_lightdrum', 'd_mg_drum2',
  ]],
];
for (const [w, h, ids] of MOD_FOOT) for (const id of ids) SHAPES[id] = [w, h];


/* 基准枪：只在「查不到 id」时给数值表兜底，不代表玩家拥有它。
   G17 现在是一把要花钱买的手枪，不再白送、也不再自动塞进手枪槽。 */
const BASE_WEAPON = 'g17';

/* ── 近战武器 ──
   刀不占枪的弹药，槽位独立（数字键 3）。判定是"身前一段扇形"，
   一次挥击能同时扫到扇区里的所有敌人。近战无视盾牌 —— 贴身就是贴到盾后了。
   reach 是加在 玩家半径 + 敌人半径 之上的额外距离。 */
const MELEES = {
  knife_tactical: {
    name: '战术匕首', code: 'TACTICAL KNIFE', price: 0,
    dmg: 55, reach: 30, arc: 0.72, rate: 0.42, knock: 120,
    desc: '制式战术匕首。静音、不耗弹药，普通小兵一刀一个；被贴脸时的最后手段。',
    color: '#cfd8e3',
  },
  knife_blackhawk: {
    name: '黑鹰匕首', code: 'BLACK HAWK', price: 2600,
    dmg: 92, reach: 36, arc: 0.80, rate: 0.36, knock: 190,
    desc: '加长刃的重型战术刀。单刀伤害接近步枪单发，出手更长、挥速更快，机密图也能一刀带走小兵。',
    color: '#ffd08a',
  },
};
const MELEE_ORDER = ['knife_tactical', 'knife_blackhawk'];
const STARTER_MELEE = 'knife_tactical';

/* ── 医疗包 ──
   一支包 = 一个耐久池，用起来是一整条读条，长度由「这次要回多少血」决定：
     总读条 = wind（启动）+ ceil(缺口 / 每秒回血)
   例：血上限 100、当前 20 血、战地箱（30 血/秒、启动 3.5s）→ 缺 80，
   80/30 = 2.67 向上取整 3s，总共读 6.5s，读完血满。
   启动段一滴血都不回；过了启动段才开始按 hps 每秒回血，
   回的血从 dur 里扣，血满了自动停手，剩下的耐久留到下一次。
   中途右键打断：已经灌进去的血留着，剩下的窗口作废（耐久按实际回血扣，不返还）。
   perk：move 挂水不减速 / cure 开始回血即治伤口 + 止痛。 */
const MEDKITS = {
  inject_s: {
    name: '简易注射器', short: '简易针', icon: '针', code: 'SIMPLE INJECTOR',
    grade: '白', dur: 30, hps: 5, wind: 3.5, price: 50, color: '#7fe3a8', size: 0.55,
    desc: '30 点耐久，5 血/秒，启动 3.5s。读条按缺口补时（缺 30 血要读 3.5+6=9.5s）。便宜、随身，扎一针先止血。',
    perk: '',
  },
  inject_m: {
    name: '强效注射器', short: '强效针', icon: '剂', code: 'COMBAT INJECTOR',
    grade: '绿', dur: 60, hps: 12, wind: 3, price: 100, color: '#74a35c', size: 0.62,
    desc: '60 点耐久，12 血/秒，启动 3s。缺 60 血读 3+5=8s，打架首选：单段读条最短。',
    perk: '',
  },
  kit_vehicle: {
    name: '车载急救包', short: '车载包', icon: '包', code: 'VEHICLE FIRST AID',
    grade: '白', dur: 90, hps: 6, wind: 5, price: 20, color: '#58c4d8', size: 0.82,
    desc: '90 点耐久，6 血/秒，启动 5s。回血最慢（缺 90 血要读 5+15=20s），但挂水时走路不减速——被追着撤的时候唯一能边走边灌的一支。',
    perk: 'move',
  },
  kit_field: {
    name: '野战急救包', short: '野战包', icon: '救', code: 'FIELD TRAUMA KIT',
    grade: '蓝', dur: 220, hps: 20, wind: 6, price: 300, color: '#9ef2c8', size: 1.02,
    desc: '220 点耐久，20 血/秒，启动 6s（最长的启动）。缺 100 血读 6+5=11s，一支顶好几条命，配着掩体用。',
    perk: '',
  },
  box_outdoor: {
    name: '户外医疗箱', short: '户外箱', icon: '箱', code: 'OUTDOOR MED BOX',
    grade: '紫', dur: 350, hps: 20, wind: 4, price: 500, color: '#7fd4ff', size: 1.32,
    desc: '350 点耐久，20 血/秒，启动 4s。缺 100 血读 4+5=9s；开箱即处理伤口、注射止痛剂（30 秒减伤 10%），还带止血敷料：起效时一把压住全部流血层，每压 1 层额外烧 12 点耐久。',
    perk: 'cure', pain: 30,
  },
  box_battle: {
    name: '战地医疗箱', short: '战地箱', icon: '医', code: 'BATTLEFIELD MED CRATE',
    grade: '金', dur: 800, hps: 30, wind: 3.5, price: 800, color: '#ffd66b', size: 1.66,
    desc: '800 点耐久，30 血/秒，启动 3.5s。缺 80 血读 3.5+3=6.5s、缺 100 血读 3.5+4=7.5s；治伤口 + 60 秒止痛，还带战地止血钳：起效时一把压住全部流血层，每压 1 层额外烧 12 点耐久。一支撑满一个据点。',
    perk: 'cure', pain: 60,
  },
};
const MEDKIT_ORDER = ['inject_s', 'inject_m', 'kit_vehicle', 'kit_field', 'box_outdoor', 'box_battle'];
const STARTER_MEDKIT = 'inject_s';
const PAIN_DR = 0.10;      // 止痛效果：受伤减免
const WOUND_HEAL_K = 0.75; // 带伤口时包扎效率
const MEDBOX_STOP_COST = 12; // 医疗箱止血：每压 1 层流血额外扣的耐久

/* ── 止血 / 止痛消耗品 ──
   流血只能靠前两种东西止住：绷带做局部压迫，止血带把近心端的血流掐住。
   后三种都是止疼药：只骗过脑子，压不住流血，也接不上骨头。
   uses 是「一次买到的份数」，库存按份记，用一份扣一份。 */
const STOPS = {
  bandage: {
    name: '弹力绷带', short: '绷带', code: 'ELASTIC BANDAGE',
    grade: '白', uses: 1, sec: 1.8, price: 10, layers: 1, color: '#cfe6f2',
    desc: '一次性。压迫包扎一处创口，止住 1 层流血。便宜，多带几卷。',
  },
  tourniquet: {
    name: '止血带', short: '止血带', code: 'TOURNIQUET',
    grade: '绿', uses: 1, sec: 2.6, price: 20, layers: 99, color: '#ff9b6b',
    desc: '一次性。扎紧近心端，一次压住全部流血层。失血太多时这是保命的东西。',
  },
  pain_release: {
    name: '缓释止痛片', short: '缓释片', code: 'SUSTAINED RELEASE',
    grade: '白', uses: 1, sec: 4, price: 50, pain: 200, color: '#e8eef4',
    desc: '1 次。含服后药效慢慢铺开，200 秒里受伤 -10%，臂折的负面被压住、腿伤减速减半（能拖着腿跑）、贯穿伤黑边淡下去。骨头还得手术接，压不住流血。',
  },
  pain_antibio: {
    name: '瓶装抗生素', short: '抗生素', code: 'BOTTLED ANTIBIOTICS',
    grade: '绿', uses: 3, sec: 4, price: 80, pain: 240, color: '#74a35c',
    desc: '3 次。抗生素把炎症压下去，疼痛跟着退：单次 240 秒止痛。一瓶三片，一片一片吃。',
  },
  pain_dve: {
    name: 'DVE 止疼片', short: 'DVE 片', code: 'DVE ANALGESIC',
    grade: '紫', uses: 5, sec: 3, price: 200, pain: 360, color: '#b46bff',
    desc: '5 次。DEK 的战地止疼片，单次 360 秒，读条只要 3 秒 —— 打完一波蹲下就能含一片。',
  },
};
const STOP_ORDER = ['bandage', 'tourniquet', 'pain_release', 'pain_antibio', 'pain_dve'];
/* 只是止疼、不处理创口的那几件 */
const STOP_PAINS = ['pain_release', 'pain_antibio', 'pain_dve'];

/* ── 手术包 ──
   不是回血用的：它把贯穿伤缝上、把断骨接回去、把骨裂固定住。
   一次读条处理一项，每用一次扣一次，剩余次数跟着你进下一局。 */
const SURGERIES = {
  surg_simple: {
    name: '简易手术包', short: '简易手术', code: 'SIMPLE SURGERY KIT',
    grade: '白', uses: 2, sec: 10, price: 80, color: '#e8eef4',
    desc: '2 次 · 单次读条 10 秒。缝合与正骨的基础器械，慢，但能把命拼回来。',
  },
  surg_tactical: {
    name: '战术快拆手术包', short: '战术手术', code: 'TACTICAL SURGERY KIT',
    grade: '绿', uses: 4, sec: 7, price: 150, color: '#74a35c',
    desc: '4 次 · 单次读条 7 秒。预拆封的快取器械，摊开就能动刀，适合边打边处理。',
  },
  surg_dek: {
    name: 'DEK 野战手术包', short: 'DEK 手术', code: 'DEK FIELD SURGERY',
    grade: '紫', uses: 7, sec: 5, price: 300, color: '#b46bff',
    desc: '7 次 · 单次读条 5 秒。DEK 的野战外科箱，五次呼吸就能缝完一道贯穿伤。',
  },
};
const SURG_ORDER = ['surg_simple', 'surg_tactical', 'surg_dek'];

/* ── 创伤 debuff 的数值 ──
   流血：每层每秒扣血，但锁 1 血，不会自己流死。
   贯穿伤：每层 -10% 血量上限，黑边 + 视野发糊；止痛只屏蔽视觉。
   骨折：手术包才治得了；手臂的负面止痛能压住，腿的减速减半（能拖着腿跑）。 */
const DEBUFF = {
  baseHp: 100,
  bleedMax: 3, bleedDps: 0.9, bleedLock: 1,   /* 流血最多叠 3 层（叠满 2.7 血/秒） */
  redMax: 2, redHp: 0.10,
  weakHp: 0.20,
  armAds: 1.6, armReload: 1.35, armHeal: 1.3, armSpread: 1.35,
  legMove: 0.60, fissureMove: 0.12,
};

/* ── 跑步与体力 ──
   走是常态，跑（Shift）是资源：按住就跑、松手就停，跑动不能开镜。
   体力只在「不在跑」的时候回：站着回得快，边走边回要慢一半。
   见底进入「力竭」：2.2 秒锁死起跑，移速压到 132 —— 比最快的突击兵（134）还慢一点，
   这就是跑过头的代价：那两秒里你拉不开距离，只能硬扛或者原地反打。
   护甲按 load 折算成两件事：走路更慢（loadWalk）、跑起来更费（loadDrain）。 */
const SPRINT = {
  mul: 1.48,            // 跑步相对走路的速度倍率
  max: 100,
  drain: 15,            // 每秒耗体力（无甲）
  regen: 16,            // 站着每秒回
  regenWalk: 9,         // 边走边回
  resumeAt: 25,         // 想重新起跑至少要有这么多体力
  exhaustT: 2.2,        // 力竭锁定时长（跑空要付 2.2s 的代价：慢走 + 不能起跑）
  exhaustMul: 0.75,     // 力竭期间移速（165×0.75 ≈ 124，落在最快小兵 runner 134 之下）
  exhaustRegen: 0.55,   // 力竭期间回体力打折
  loadWalk: 0.05,       // 每点负重 -5% 移速
  loadDrain: 0.32,      // 每点负重 +32% 体力消耗
  spreadMul: 1.45,      // 跑动中开枪的散布惩罚
};

/* 治疗物品的统一 key：'med:inject_s' / 'stop:bandage' / 'surg:surg_dek' */
function careKeyMake(kind, id) { return kind + ':' + id; }
function careKindOf(key) {
  if (typeof key !== 'string') return 'med';
  const i = key.indexOf(':');
  return i < 0 ? 'med' : key.slice(0, i);
}
function careIdOf(key) {
  if (typeof key !== 'string') return '';
  const i = key.indexOf(':');
  return i < 0 ? key : key.slice(i + 1);
}
/* 把任意来源（老档的纯 id、新档的复合 key）规范化成合法 key */
function normCareKey(v) {
  if (typeof v !== 'string' || !v) return careKeyMake('med', STARTER_MEDKIT);
  const i = v.indexOf(':');
  if (i < 0) return MEDKITS[v] ? careKeyMake('med', v) : careKeyMake('med', STARTER_MEDKIT);
  const k = v.slice(0, i), id = v.slice(i + 1);
  if (k === 'med' && MEDKITS[id]) return v;
  if (k === 'stop' && STOPS[id]) return v;
  if (k === 'stop' && id === 'painkiller') return careKeyMake('stop', 'pain_release');   // 老档的止痛药
  if (k === 'surg' && SURGERIES[id]) return v;
  return careKeyMake('med', STARTER_MEDKIT);
}

const DEFAULT_SAVE = () => ({
  credits: 50000,
  /* 出战干员：决定局内能按 V / X / G / C 放什么（技能表在 OPERATORS 里） */
  operator: 'redwolf',
  /* 新档一把枪都没有：G17 也要去军火库买，只有匕首是白送的 */
  owned: {},
  /* 护甲是仓库里的实体件：armorPieces = [{ id, hp, max }]，wornPiece = 身上穿的那件（null = 裸奔）。
     id 是 ARMORS 目录编号（1-17，同一甲级有多件具名甲）；hp/max 是这件自己的耐久。
     穿上 = 从仓库拿出一件；阵亡丢的是身上这件，仓库里的还在。 */
  armorPieces: [],
  wornPiece: null,
  /* 头盔：和护甲并行的第二个防具槽，没有耐久条。helmetOwned { 头盔 id: 件数 }（头上那顶也算在件数里），
     wornHelmet 是头上这顶。阵亡丢头上这顶（件数减一），撤离原样保留。 */
  helmetOwned: {},
  wornHelmet: null,
  /* 甲修包库存：n 是没开封的份数，left 是当前拆开那份的剩余点数 */
  repairs: {},
  /* 出击配装：主武器 / 副武器（都只能放长枪）/ 手枪。空槽是 null */
  loadout: { primary: null, secondary: null, pistol: null },
  ownedMelee: { [STARTER_MELEE]: true },
  equippedMelee: STARTER_MELEE,
  /* 每种医疗包的库存：n 是没开封的支数，left 是当前拆开那支的剩余耐久 */
  meds: { [STARTER_MEDKIT]: { n: 2, left: 0 } },
  /* 止血 / 止痛：按份数算（止痛片一瓶三片 / 五片，进包就是三份五份） */
  stops: { bandage: 1, tourniquet: 0, pain_release: 1, pain_antibio: 0, pain_dve: 0 },
  /* 手术包：uses 是这包还能动几次刀 */
  surgs: { surg_simple: { uses: 2 } },
  carePick: 'med:' + STARTER_MEDKIT,   // 上次用的那种 —— 选择盘默认高亮它（短按 5 走自动阶梯）
  /* 弹药库存：按口径 × 弹级存「还剩几发」。新档只送 68 发 9×19 一级白弹
     （正好 4 个 G17 弹匣），别的口径自己买。整张表按 CAL_ORDER 铺满，
     免得新口径上架后存档里缺桶、写库存时踩 undefined。 */
  ammo: freshAmmo(),
  ammoPick: { '919': 1 },     // 每个口径选用哪一级弹
  /* 携行装备：弹挂 / 背包是实体物品。新档白送一件基础弹挂（不穿上），
     背包要自己买 —— 都在大厅整备界面从仓库穿上。 */
  gearOwned: { d01: 1 },
  worn: { rig: null, pack: null },   // 当前穿着的弹挂 / 背包（null = 没穿）
  carry: null,                // 随身容器：{ rig:[弹挂], pocket:[口袋], pack:[背包] } —— 懒初始化，见 ensureCarry()
  pistolAmmo: 0,              // 已废弃：老档的「手枪弹盒」，迁移时折算成 9×19 白弹
  stash: {},          // 仓库里的收集品：{ 收集品id: 数量 }
  modBag: {},         // 配件库存：{ 配件id: 数量 }
  mods: {},           // 每把枪装了什么：{ 枪id: { 槽位id: 配件id } }
  stats: { raids: 0, extracts: 0, deaths: 0, loot: 0, kills: 0, sold: 0,
           relics: 0, blinds: 0, swarm: 0, bleed: 0, silent: 0,
           secret: 0, top: 0, noArmor: 0 },
  achieved: {},        // 已解锁成就：{ 成就id: 1 }（奖励在撤离结算时一次性发放）
  contracts: { day: '', list: [] },   // 每日委托：{ day:'YYYY-MM-DD', list:[{ id, prog, done }] }
  presets: [null, null, null],        // 整备预设：3 个槽，各存一份装备快照（不含容器内容）
  soldN: {},           // 每件收集品累计卖出的件数（决定市场价衰减）
  /* 设置：音量 / 震动强度 / 粒子密度 都是 0-100，aim 是准星颜色，
     gfx 是画质档（2 高 / 1 均衡 / 0 流畅），掉帧时游戏会自己往下调 */
  settings: { vol: 70, shake: 100, fx: 100, aim: '#b4e6ff', gfx: 2 },
  seenRelics: {},      // 图鉴：曾经带出来过的收集品 { 收集品id: 1 }（卖掉了也算见过）
  codexReward: {},     // 图鉴：已领取的档位奖励 { common: 1, ... }
});

/* 旧存档的武器 id（smg/shotgun/rifle/sniper）迁到具体的枪上。
   早期的免费手枪 id 就是 'pistol'（93R），现在 93R 改成收费枪，
   但老档既然曾经白拿，就保留这份所有权，不要凭空没收。
   注意：这里不能引用 WEAPONS —— 存档在数据表之前就加载了。 */
const WEAPON_ID_MIGRATE = { smg: 'bizon', shotgun: 'm870', rifle: 'm4a1', sniper: 'r93', pistol: '93r' };
const KNOWN_WEAPON_IDS = { g17: 1, '93r': 1, g18: 1, bizon: 1, m870: 1,
                           akm: 1, ak12: 1, qbz95: 1, qbz191: 1, qbz192: 1,
                           m4a1: 1, sr9: 1, r93: 1, awm: 1 };
/* 手枪不能装枪托 —— 存档加载时就要判断，同样不能等 WEAPONS 表。
   以后加手枪，这里和 KNOWN_WEAPON_IDS 都要补上。 */
const PISTOL_IDS = { g17: 1, '93r': 1, g18: 1 };

/* 干员白名单：存档加载比 OPERATORS 表更早执行，这里只放 id，别引用表本身 */
const OP_IDS = { redwolf: 1, weilong: 1, luna: 1, beeser: 1, uluru: 1, nameless: 1, gu: 1 };

/* 空弹药表：CAL_ORDER 个口径 × 8 个弹级，全 0。
   新档和清洗共用一份，加口径时不用再改两处。 */
function emptyAmmo() {
  const out = {};
  for (const cal of CAL_ORDER) {
    out[cal] = {};
    for (let lv = 0; lv <= AMMO_LV_MAX; lv++) out[cal][lv] = 0;
  }
  return out;
}
/* 新档：整张空表 + 68 发 9×19 一级白弹（4 个 G17 弹匣） */
function freshAmmo() {
  const a = emptyAmmo();
  a['919'][1] = 68;
  return a;
}

/* 弹药清洗：补齐所有口径 × 8 个弹级。
   老档（没有 ammo 字段）按拥有的枪各补 3 个弹匣的起步弹（该口径上架的最便宜弹级），
   当年买的「手枪弹盒」按一盒 51 发折算成 9×19 白弹，不白没收。
   老档里买过「现在不上架」的弹级（比如 9×19 的金弹）：折进最近的上架级，不白没收。 */
function cleanAmmo(raw, owned, legacyPistolBoxes) {
  const out = emptyAmmo();
  const has = raw && typeof raw === 'object';
  if (has) {
    for (const cal of CAL_ORDER) {
      const src = raw[cal];
      if (!src || typeof src !== 'object') continue;
      for (let lv = 0; lv <= AMMO_LV_MAX; lv++) {
        const n = Math.floor(Number(src[lv]) || 0);
        if (n <= 0) continue;
        if (calHasTier(cal, lv)) out[cal][lv] = Math.min(n, 9999);
        else {
          const t = foldTierOf(cal, lv);
          if (t >= 0) out[cal][t] = Math.min(9999, out[cal][t] + n);
        }
      }
    }
  } else {
    for (const id in owned) {
      if (!owned[id]) continue;
      const cal = CAL_OF_WEAPON[id];
      if (cal && STARTER_AMMO[cal]) out[cal][defaultTierOf(cal)] += STARTER_AMMO[cal];
    }
  }
  const boxes = Math.max(0, legacyPistolBoxes | 0);
  if (boxes) out['919'][1] += boxes * 51;
  return out;
}

function cleanAmmoPick(raw) {
  const out = {};
  for (const cal of CAL_ORDER) out[cal] = defaultTierOf(cal);
  if (!raw || typeof raw !== 'object') return out;
  for (const cal of CAL_ORDER) {
    const lv = raw[cal];
    if (lv == null) continue;
    const n = Math.floor(Number(lv));
    if (!Number.isFinite(n) || n < 0 || n > AMMO_LV_MAX) continue;
    out[cal] = calHasTier(cal, n) ? n : (foldTierOf(cal, n) >= 0 ? foldTierOf(cal, n) : out[cal]);
  }
  return out;
}

function migrateWeaponIds(owned) {
  /* 老档当年是白送 G17 的，这里保留这份所有权，不凭空没收；
     新档走 DEFAULT_SAVE（owned 是空的），想用手枪得自己买。
     值是实例计数：1 = 有一把，2 = 有两把（缴获可囤同款枪）。 */
  const out = {};
  for (const id in owned) {
    const v = owned[id];
    const n = typeof v === 'number' ? (v | 0) : (v ? 1 : 0);
    if (n <= 0) continue;
    const to = WEAPON_ID_MIGRATE[id] || id;
    if (KNOWN_WEAPON_IDS[to]) out[to] = Math.min(9, (out[to] | 0) + n);
  }
  /* 老档白送的 G17 保留 —— 但只算一把，别和 owned 里那条 g17 重复计 */
  if (!(out[BASE_WEAPON] > 0)) out[BASE_WEAPON] = 1;
  return out;
}

function loadSave() {
  const base = DEFAULT_SAVE();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const d = JSON.parse(raw);
    const owned = migrateWeaponIds(Object.assign({}, DEFAULT_SAVE().owned, d.owned || {}));
    const gear = cleanGearOwned(d.gearOwned);
    const AR = cleanArmor(d);
    const HM = cleanHelmets(d);
    const S = {
      credits: typeof d.credits === 'number' ? d.credits : base.credits,
      operator: OP_IDS[d.operator] ? d.operator : base.operator,
      owned: owned,
      armorPieces: AR.pieces,
      wornPiece: AR.worn,
      helmetOwned: HM.owned,
      wornHelmet: HM.worn,
      loadout: cleanLoadout(d, owned),
      ownedMelee: cleanOwnedMelee(d.ownedMelee),
      equippedMelee: MELEES[d.equippedMelee] ? d.equippedMelee : STARTER_MELEE,
      meds: cleanMeds(d.meds, d.medkits),
      repairs: cleanRepairs(d.repairs),
      stops: cleanStops(d.stops),
      surgs: cleanSurgs(d.surgs),
      carePick: normCareKey(d.carePick || d.medPick),
      ammo: cleanAmmo(d.ammo, owned, d.pistolAmmo),
      ammoPick: cleanAmmoPick(d.ammoPick),
      gearOwned: gear,
      worn: cleanWorn(d.worn, gear),
      carry: rawCarry(d.carry),
      pistolAmmo: 0,
      stash: cleanStash(d.stash),
      modBag: cleanModBag(d.modBag),
      mods: cleanGunMods(d.mods),
      stats: Object.assign({ raids: 0, extracts: 0, deaths: 0, loot: 0, kills: 0, sold: 0,
        relics: 0, blinds: 0, swarm: 0, bleed: 0, silent: 0, secret: 0, top: 0, noArmor: 0 }, d.stats || {}),
      achieved: Object.assign({}, d.achieved || {}),
      contracts: cleanContracts(d.contracts),
      presets: cleanPresets(d.presets),
      soldN: Object.assign({}, d.soldN || {}),
      settings: Object.assign({ vol: 70, shake: 100, fx: 100, aim: '#b4e6ff', gfx: 2 }, d.settings || {}),
      seenRelics: Object.assign({}, d.seenRelics || {}),
      codexReward: Object.assign({}, d.codexReward || {}),
    };
    return S;
  } catch (e) { return base; }
}

/* 委托清洗：未知 id 丢掉，进度夹在 0~目标之间 */
function cleanContracts(raw) {
  const out = { day: '', list: [] };
  if (!raw || typeof raw !== 'object') return out;
  out.day = typeof raw.day === 'string' ? raw.day : '';
  if (Array.isArray(raw.list)) {
    for (const e of raw.list) {
      const t = e && CONTRACT_BY_ID[e.id];
      if (!t) continue;
      out.list.push({ id: t.id, prog: clamp(Math.floor(Number(e.prog) || 0), 0, t.goal), done: e.done ? 1 : 0 });
    }
  }
  return out;
}

/* 配装清洗：三把枪各自只能放对应类别的枪，而且必须真的拥有。
   旧档没有 loadout 字段，只有 equippedWeapon（唯一一把），按类别塞进对应槽。 */
function cleanLoadout(d, owned) {
  /* 手枪槽可以是空的 —— 没买手枪就空着出击（只能靠刀） */
  const LO = { primary: null, secondary: null, pistol: null };
  const pick = (rawId, kind) => {
    const to = WEAPON_ID_MIGRATE[rawId] || rawId;
    if (!to || !KNOWN_WEAPON_IDS[to]) return null;
    if (!owned[to]) return null;
    const isPistol = !!PISTOL_IDS[to];
    if (kind === 'pistol') return isPistol ? to : null;
    return isPistol ? null : to;
  };

  const src = (d && d.loadout && typeof d.loadout === 'object') ? d.loadout : null;
  if (src) {
    LO.primary = pick(src.primary, 'long');
    LO.secondary = pick(src.secondary, 'long');
    if (LO.secondary === LO.primary) LO.secondary = null;
    LO.pistol = pick(src.pistol, 'pistol');
  } else {
    /* 老档：只有一把装备，按它是长枪还是手枪归位 */
    const eq = d.equippedWeapon;
    const one = pick(eq, 'long');
    if (one) LO.primary = one;
    LO.pistol = pick(eq, 'pistol');
  }
  return LO;
}

/* 整备预设清洗：3 个槽；枪必须认识、甲/弹挂/背包必须还在目录里。
   槽位重复的枪让副武器空着（一把枪不能同时占两个槽）。 */
function cleanPresets(raw) {
  const out = [null, null, null];
  if (!Array.isArray(raw)) return out;
  const gun = (id, kind) => {
    if (!id || !KNOWN_WEAPON_IDS[id]) return null;
    const isP = !!PISTOL_IDS[id];
    return kind === 'pistol' ? (isP ? id : null) : (isP ? null : id);
  };
  for (let i = 0; i < 3; i++) {
    const p = raw[i];
    if (!p || typeof p !== 'object') continue;
    const g = (p.guns && typeof p.guns === 'object') ? p.guns : {};
    const primary = gun(g.primary, 'long');
    let secondary = gun(g.secondary, 'long');
    if (secondary === primary) secondary = null;
    const armor = Math.max(0, Math.min(ARMORS.length - 1, Number(p.armor) | 0));
    const rig = (p.rig && GEAR[p.rig] && GEAR[p.rig].kind === 'rig') ? p.rig : null;
    const pack = (p.pack && GEAR[p.pack] && GEAR[p.pack].kind === 'pack') ? p.pack : null;
    out[i] = {
      name: (typeof p.name === 'string' && p.name) ? p.name.slice(0, 16) : ('预设 ' + (i + 1)),
      guns: { primary, secondary, pistol: gun(g.pistol, 'pistol') },
      melee: MELEES[p.melee] ? p.melee : STARTER_MELEE,
      armor, rig, pack,
      care: (typeof p.care === 'string') ? p.care : '',
      at: Number(p.at) || 0,
    };
  }
  return out;
}

function cleanOwnedMelee(raw) {
  const out = { [STARTER_MELEE]: true };
  if (!raw || typeof raw !== 'object') return out;
  for (const id in raw) if (raw[id] && MELEES[id]) out[id] = true;
  return out;
}

/* 医疗包库存清洗：未知 id 丢掉，数量取整数，剩余耐久不能超过这一支的上限。
   老档只有一个 medkits 数字（旧医疗包），统一折算成简易注射器，别让老玩家白丢补给。 */
function cleanMeds(raw, legacyCount) {
  const out = {};
  for (const id of MEDKIT_ORDER) out[id] = { n: 0, left: 0 };
  if (raw && typeof raw === 'object') {
    for (const id of MEDKIT_ORDER) {
      const s = raw[id];
      if (!s || typeof s !== 'object') continue;
      const n = Math.floor(Number(s.n) || 0);
      out[id].n = n > 0 ? Math.min(n, 99) : 0;
      const left = Number(s.left);
      out[id].left = left > 0 ? Math.min(left, MEDKITS[id].dur) : 0;
      if (out[id].left < 0.5) out[id].left = 0;
    }
  }
  const lc = Math.floor(Number(legacyCount) || 0);
  if (lc > 0 && !(raw && raw[STARTER_MEDKIT])) {
    out[STARTER_MEDKIT].n = Math.min(99, out[STARTER_MEDKIT].n + lc);
  }
  return out;
}

/* 甲修包清洗：和医疗包同一套 n/left 记账 */
function cleanRepairs(raw) {
  const out = {};
  for (const id of REPAIR_ORDER) out[id] = { n: 0, left: 0 };
  if (raw && typeof raw === 'object') {
    for (const id of REPAIR_ORDER) {
      const v = raw[id];
      if (!v || typeof v !== 'object') continue;
      const n = Math.floor(Number(v.n) || 0);
      out[id].n = n > 0 ? Math.min(n, 99) : 0;
      const left = Number(v.left);
      out[id].left = left > 0 ? Math.min(left, REPAIRS[id].dur) : 0;
      if (out[id].left < 0.5) out[id].left = 0;
    }
  }
  return out;
}

/* 止血 / 止痛清洗：数量是「还剩几份」，老档的止痛药折成缓释片 */
function cleanStops(raw) {
  const out = {};
  for (const id of STOP_ORDER) out[id] = 0;
  if (!raw || typeof raw !== 'object') return out;
  for (const id of STOP_ORDER) {
    let n = Math.floor(Number(raw[id]) || 0);
    if (id === 'pain_release') n += Math.floor(Number(raw.painkiller) || 0);   // 老档只有一种止痛药
    out[id] = n > 0 ? Math.min(n, 99) : 0;
  }
  return out;
}

/* 手术包清洗：次数夹在 [0, 这包上限]，不认识的 id 直接丢 */
function cleanSurgs(raw) {
  const out = {};
  for (const id of SURG_ORDER) out[id] = { uses: 0 };
  if (!raw || typeof raw !== 'object') return out;
  for (const id of SURG_ORDER) {
    const s = raw[id];
    if (!s || typeof s !== 'object') continue;
    const u = Math.floor(Number(s.uses) || 0);
    out[id].uses = u > 0 ? Math.min(u, SURGERIES[id].uses) : 0;
  }
  return out;
}

/* 仓库数据清洗：只留已知收集品，数量取正整数 */
function cleanStash(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id in raw) {
    if (!RELICS[id]) continue;
    const n = Math.floor(raw[id]);
    if (n > 0) out[id] = Math.min(n, 999);
  }
  return out;
}

/* 配件库存清洗：未知 id、非法数量一律丢掉 */
function cleanModBag(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id in raw) {
    if (!MODS[id]) continue;
    const n = Math.floor(raw[id]);
    if (n > 0) out[id] = Math.min(n, 99);
  }
  return out;
}

/* 这把枪总共有几个可装槽位（手枪没有枪托，只有 4 个） */
function modSlotTotal(wid) {
  return PISTOL_IDS[wid] ? MOD_SLOTS.length - 1 : MOD_SLOTS.length;
}

/* 枪上的配件：槽位必须对得上，枪必须是已知的。
   老档里 93R 的 id 是 'pistol'，这里顺手迁到新 id 上。 */
function cleanGunMods(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const wid0 in raw) {
    const wid = WEAPON_ID_MIGRATE[wid0] || wid0;
    if (!KNOWN_WEAPON_IDS[wid]) continue;
    const src = raw[wid0];
    if (!src || typeof src !== 'object') continue;
    const gun = {};
    for (const s of MOD_SLOTS) {
      const mid = src[s.id];
      const m = mid && MODS[mid];
      if (m && m.slot === s.id && slotAllowed(wid, s.id) && modAllowed(wid, mid)) gun[s.id] = mid;
    }
    if (Object.keys(gun).length) out[wid] = gun;
  }
  return out;
}

/* 手枪没有枪托 —— 别把托装到手枪上 */
function slotAllowed(wid, slotId) {
  if (slotId === 'stock' && PISTOL_IDS[wid]) return false;
  return true;
}

/* 配件兼容性：不是所有枪都能装同一种配件。
   · fit  = 武器类目白名单（rifle/smg/dmr/sniper/lmg/shotgun/pistol）
   · guns = 专属枪 id 白名单（AK 侧轨只有 AK 系装得上，总监瞄具只有 AWM 配）
   两张表都没写 = 全枪通用。 */
function modAllowed(wid, mid) {
  const m = MODS[mid], w = WEAPONS[wid];
  if (!m || !w) return false;
  if (!slotAllowed(wid, m.slot)) return false;
  if (m.guns && !m.guns.includes(wid)) return false;
  if (m.fit && !m.fit.includes(w.cat)) return false;
  return true;
}
/* 为什么装不上：给改装台一句人话 */
function modBanReason(wid, mid) {
  const m = MODS[mid], w = WEAPONS[wid];
  if (!m || !w) return '不适用';
  if (m.guns && !m.guns.includes(wid)) return '专属配件';
  if (m.fit && !m.fit.includes(w.cat)) return weaponCatOf(w).cn + '不可用';
  if (!slotAllowed(wid, m.slot)) return '无此槽位';
  return '不适用';
}


/* ══════════════════════════════════════════════════════════
   弹药：口径 × 弹级
   ──────────────────────────────────────────────────────────
   每把枪吃一种真实规格的弹（G17/G18 打 9×19mm，M4A1 打 5.56×45mm…），
   同一口径下再分 0~7 级，级别决定「啃得动几级甲」：
     弹级 - 甲级 ≥ 2  → 100% 肉伤
     弹级 - 甲级 = 1  →  75%
     弹级 - 甲级 = 0  →  50%
     弹级 < 甲级      →   0%（全被甲吃住，只磨损护甲）
   0 级是 RIP/CT 修脚弹：一点甲都穿不动，但打无甲目标肉伤暴涨。
   这张表必须排在 loadSave 之前 —— 老档清洗要用它。
   ══════════════════════════════════════════════════════════ */
const CALIBERS = {
  '919': { id:'919', name:'9×19mm 帕拉贝鲁姆', short:'9×19', full:'9×19mm', tag:'9×19', box:50, base:4,
           desc:'最通用的手枪弹，G17 / 93R / G18 共用。只上架到 4 级紫弹。' },
  '918': { id:'918', name:'9×18mm 马卡洛夫', short:'9×18', full:'9×18mm', tag:'9×18', box:50, base:3,
           desc:'野牛冲锋枪的螺旋弹鼓装的就是它，便宜量大。只上架到 4 级紫弹。' },
  '762x39': { id:'762x39', name:'7.62×39mm 苏制中间威力弹', short:'7.62×39', full:'7.62×39mm', tag:'7.62×39', box:30, base:6,
           desc:'AKM 的短弹：弹头重、存速低，近距离一发顶两发，出了两百米掉得厉害。最高上架 5 级金弹。' },
  '545': { id:'545', name:'5.45×39mm 苏制小口径弹', short:'5.45×39', full:'5.45×39mm', tag:'5.45', box:30, base:6,
           desc:'AK-12 的小口径弹：弹道平、后坐小，靠射速和连发精度吃饭。最高上架 5 级金弹。' },
  '58': { id:'58', name:'5.8×42mm 国造步枪弹', short:'5.8×42', full:'5.8×42mm', tag:'5.8', box:30, base:8,
           desc:'QBZ 系列的制式弹：初速高、弹形细长，远距离存速比 5.45 更稳。最高上架 5 级金弹。' },
  '12g': { id:'12g', name:'12 号霰弹', short:'12Ga', full:'12 Gauge', tag:'12G', box:25, base:9,
           desc:'M870 一次喷 8 枚弹丸，每颗单独结算。只上架到 4 级紫弹。' },
  '556': { id:'556', name:'5.56×45mm NATO', short:'5.56×45', full:'5.56×45mm', tag:'5.56', box:30, base:7,
           desc:'M4A1 的制式步枪弹，穿甲与手感最均衡。最高上架 5 级金弹。' },
  '762': { id:'762', name:'7.62×51mm NATO', short:'7.62×51', full:'7.62×51mm', tag:'7.62×51', box:20, base:12,
           desc:'全威力步枪弹：SR9 拿它打半自动，R93 拿它拉栓，同一盒弹喂两把枪。不卖白弹绿弹，上架从蓝弹起步，最高 6 级红弹。' },
  '762x54': { id:'762x54', name:'7.62×54mmR 莫辛-纳甘凸缘弹', short:'7.62×54R', full:'7.62×54mmR', tag:'7.62R', box:20, base:13,
           desc:'俄制凸缘全威力弹：PKM 的弹链和 SVD 的弹匣装的是同一盒，弹壳底部带一圈凸缘，上膛比 NATO 弹粗暴。不卖白弹绿弹，上架从蓝弹起步，最高 6 级红弹。' },
  '338': { id:'338', name:'.338 Lapua Magnum', short:'.338 LM', full:'.338 Lapua Magnum', tag:'.338', box:10, base:25,
           desc:'AWM 的远程重弹，一发就是一笔钱。全游戏唯一上架 7 级顶级弹的口径，而且只卖高级弹：5 级金弹起步，6 级红弹、7 级顶级弹。' },
  '9x39': { id:'9x39', name:'9×39mm 亚音速穿甲弹', short:'9×39', full:'9×39mm SP-6', tag:'9×39', box:20, base:12,
           desc:'AS VAL / SR-3M 的专用重弹：弹头又重又硬，弹级天生偏向穿甲，近距离一发顶 5.56 一发半；代价是亚音速，弹道衰减全步枪系最狠。最高上架 6 级红弹。' },
  '300blk': { id:'300blk', name:'.300 BLK 亚音速弹', short:'.300 BLK', full:'.300 AAC Blackout', tag:'.300', box:20, base:9,
           desc:'MCX 的模块化口径：重弹头中等穿透，开火动静比小口径步枪小一截，配消音器几乎贴脸才听得见。最高上架 5 级金弹。' },
  '46': { id:'46', name:'4.6×30mm PDW 弹', short:'4.6×30', full:'4.6×30mm', tag:'4.6', box:40, base:6,
           desc:'MP7 专属的个人防卫弹：又小又快，穿甲是冲锋枪口径里最好的，打肉偏软。只上架到 4 级紫弹。' },
  '45acp': { id:'45acp', name:'.45 ACP 柯尔特自动手枪弹', short:'.45 ACP', full:'.45 ACP', tag:'.45', box:25, base:6,
           desc:'汤姆逊 / Vector 的大口径手枪弹：弹头重、停顿感强，打无甲目标一发顶 9×19 一发半；穿甲一般，只上架到 4 级紫弹。' },
};
const CAL_ORDER = ['919', '918', '45acp', '46', '762x39', '545', '58', '9x39', '12g', '556', '300blk', '762', '762x54', '338'];

/* 0~7 级：颜色 / 肉伤倍率 / 护甲伤害倍率 / 价格倍率（价格 = 口径基价 × 倍率 × 每盒发数）
   armorMul 只影响「磨护甲耐久」的速率，与肉伤 dmgMul 是两条独立曲线：
   修脚弹磨甲最差（0.55），顶级穿甲最快（1.38）—— 高弹级是「打到肉」与「磨穿甲」双收益。 */
const AMMO_TIERS = [
  { lv:0, key:'rip', name:'RIP 修脚弹', grade:'0 级', color:'#ff7a9c', dmgMul:0.72, fleshMul:1.9, armorMul:0.55, priceMul:0.45,
    desc:'空尖碎裂弹。一级甲都啃不动，但打无甲目标肉伤接近两倍。' },
  { lv:1, key:'fmj', name:'白弹', grade:'1 级', color:'#dfe9f2', dmgMul:1.00, fleshMul:1, armorMul:0.82, priceMul:1,
    desc:'普通全金属被甲弹。压得住 1 级甲，最便宜的通用弹。' },
  { lv:2, key:'steel', name:'绿弹', grade:'2 级', color:'#63d68a', dmgMul:1.02, fleshMul:1, armorMul:0.90, priceMul:1.75,
    desc:'钢芯弹。压 2 级甲，打小兵和盾兵够用。' },
  { lv:3, key:'ap', name:'蓝弹', grade:'3 级', color:'#4fa8ff', dmgMul:1.04, fleshMul:1, armorMul:1.00, priceMul:2.9,
    desc:'标准穿甲弹。3 级甲正面也能咬进一半伤害。' },
  { lv:4, key:'apcr', name:'紫弹', grade:'4 级', color:'#b782ff', dmgMul:1.06, fleshMul:1, armorMul:1.08, priceMul:4.6,
    desc:'硬芯穿甲。4 级甲及以下全通，机枪兵的重甲开始扛不住。' },
  { lv:5, key:'tungsten', name:'金弹', grade:'5 级', color:'#ffcc4d', dmgMul:1.08, fleshMul:1, armorMul:1.16, priceMul:7.2,
    desc:'钨芯穿甲。5 级甲也只剩一半吸收。' },
  { lv:6, key:'m995', name:'红弹', grade:'6 级', color:'#ff5d5d', dmgMul:1.10, fleshMul:1, armorMul:1.26, priceMul:11,
    desc:'M995 / M61 级军用穿甲，6 级甲正面 50%。' },
  { lv:7, key:'apex', name:'顶级穿甲', grade:'7 级', color:'#ff2fd0', dmgMul:1.13, fleshMul:1, armorMul:1.38, priceMul:17,
    desc:'实验性顶级弹。打 6 级甲仍有 75% 肉伤，最贵也最不讲道理。' },
];
const AMMO_LV_MAX = AMMO_TIERS.length - 1;

/* ── 各口径上架的弹级 ──
   没列进来的级别：军火库不卖、老档库存折算、选用自动跳过。
   逻辑是「弹越贵越只给大口径」：
     手枪 / 霰弹（9×19、9×18、.45 ACP、12Ga）→ 0~4 级，最多到紫
     PDW 4.6×30                              → 0~4 级，到紫为止
     中间威力 / 小口径步枪（39 系、556、58、.300 BLK）→ 0~5 级，到金为止
     9×39 亚音速重弹                          → 0~6 级（天生穿甲，给到红弹）
     全威力 7.62×51                        → 0、3~6 级（不卖白绿，起步就是蓝弹）
     凸缘全威力 7.62×54R（PKM / SVD）       → 同上，0、3~6 级
     .338 LM                               → 只卖高级弹 5~7 级（金弹起步，7 级顶级弹是 AWM 专属） */
const CAL_TIERS = {
  '919':    [0, 1, 2, 3, 4],
  '918':    [0, 1, 2, 3, 4],
  '45acp':  [0, 1, 2, 3, 4],
  '46':     [0, 1, 2, 3, 4],
  '12g':    [0, 1, 2, 3, 4],
  '762x39': [0, 1, 2, 3, 4, 5],
  '545':    [0, 1, 2, 3, 4, 5],
  '58':     [0, 1, 2, 3, 4, 5],
  '556':    [0, 1, 2, 3, 4, 5],
  '300blk': [0, 1, 2, 3, 4, 5],
  '9x39':   [0, 1, 2, 3, 4, 5, 6],
  '762':    [0, 3, 4, 5, 6],
  '762x54': [0, 3, 4, 5, 6],
  '338':    [5, 6, 7],
};
function calHasTier(cal, lv) {
  const t = CAL_TIERS[cal];
  return !!t && t.indexOf(lv | 0) >= 0;
}
/* 这个口径默认装填的弹级：上架里最便宜的一级（≥1 级，没有就 0 级） */
function defaultTierOf(cal) {
  const t = (CAL_TIERS[cal] || []).filter(lv => lv >= 1);
  return t.length ? Math.min.apply(null, t) : 0;
}
/* 老档里买过「现在不上架」的弹级：先往上调到最近的上架级，调不动再往下调 */
function foldTierOf(cal, lv) {
  const tiers = CAL_TIERS[cal] || [];
  for (let t = lv; t <= AMMO_LV_MAX; t++) if (tiers.indexOf(t) >= 0) return t;
  for (let t = lv; t >= 0; t--) if (tiers.indexOf(t) >= 0) return t;
  return -1;
}
/* 1~6 级甲的颜色，敌人血条外圈用 */
const ARMOR_LV_COLOR = ['#5a6b78', '#dfe9f2', '#63d68a', '#4fa8ff', '#b782ff', '#ffcc4d', '#ff5d5d'];

/* 枪 → 口径。以后加枪，这里必须补一条，否则默认按 9×19 算。
   R93 改成 7.62×51 之后，.338 就是 AWM 专属的重弹。 */
const CAL_OF_WEAPON = {
  g17: '919', '93r': '919', g18: '919',
  bizon: '918', m870: '12g',
  thompson: '45acp', vector: '45acp', mk4: '919', mp7: '46',
  akm: '762x39', sks: '762x39',
  ak12: '545',
  qbz95: '58', qbz191: '58', qbz192: '58',
  m4a1: '556', hk416: '556', aug: '556', k437: '556',
  mcx: '300blk', sr3m: '9x39', asval: '9x39',
  rpk: '762x39', m249: '556', pkm: '762x54',
  sr9: '762', m14: '762', sr25: '762', svd: '762x54',
  r93: '762', m700: '762', awm: '338',
};
/* 老档迁移时按「3 个弹匣」补的起步弹（发数按口径定；弹级取该口径上架的最便宜一级，
   7.62×51 不卖白绿，所以补的是 3 级蓝弹） */
const STARTER_AMMO = { '919': 51, '918': 64, '45acp': 75, '46': 120, '762x39': 90, '545': 90, '58': 90,
                       '9x39': 60, '12g': 21, '556': 90, '300blk': 90, '762': 54, '762x54': 54, '338': 15 };

/* 存档读取不在这里 —— loadSave 会用到 REPAIRS / GEAR 等后定义的数据表，
   提前读会踩 TDZ 被 catch 吞掉，等于每次刷新都重置。真正的读取点在 GEAR 表之后。 */

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   2. 数据表
   ══════════════════════════════════════════════════════════ */
/* ── 武器分类：军火库按这个顺序分组，每类先放一把 ── */
const WEAPON_CATS = [
  { id: 'pistol',  cn: '手枪',         en: 'PISTOL',  trait: '近身自保 · 最便宜的枪' },
  { id: 'smg',     cn: '冲锋枪',       en: 'SMG',     trait: '射速压制 · 大弹容' },
  { id: 'shotgun', cn: '霰弹枪',       en: 'SHOTGUN', trait: '贴脸爆发 · 破盾' },
  { id: 'rifle',   cn: '步枪',         en: 'RIFLE',   trait: '全能主力 · 穿透 1 人' },
  { id: 'lmg',     cn: '机枪',         en: 'LMG',     trait: '持续压制 · 大弹容重枪' },
  { id: 'dmr',     cn: '精确射手步枪', en: 'DMR',     trait: '中远半自动 · 高精度' },
  { id: 'sniper',  cn: '狙击枪',       en: 'SNIPER',  trait: '超远一击 · 穿透 3 人' },
];

/* ── 两套伤害 ──
   dmg      = 身体伤害：打裸体、或打穿护甲之后进肉的伤害（决定 TTK 与 DPS）
   armorDmg = 护甲伤害：每发削掉多少护甲耐久（决定「磨穿重甲」要几发）
   两者独立：AKM 身体最重但磨甲一般，QBZ-95/191 磨甲最快，霰弹贴脸最疼但啃甲最差。
   结算见 bulletDamage：穿透时 armorDmg 全额，跳弹只留 65%，再乘弹级 armorMul。 */
/* mode：auto 扣住连发 / semi 每发都要重新扣扳机 / burst 一次三连点射 */
const WEAPONS = {
  g17: {
    cat: 'pistol', label: '手枪 · G17', short: 'G17', name: 'G17', code: 'GLOCK 17', price: 700, cal: '919',
    desc: '制式手枪，最便宜的入门枪。17 发弹匣、单发点射，吃 9×19mm 弹 —— 备弹只有 4 个弹匣，打空了要么局内捡，要么出击前在「弹药」页多买两盒。',
    dmg: 25, armorDmg: 8, rate: 0.21, spread: 0.042, count: 1, mode: 'semi',
    bspeed: 1250, mag: 17, reload: 1.15, recoil: 2.0, size: 3.1, reserveMul: 4,
        ads: { spread: 0.56, move: 0.80, time: 0.12 },
    color: '#ffe08a', range: 900, knock: 55, sound: 'pistol', noise: 620,
    bars: { dmg: .30, rate: .34, mag: .42, acc: .68 },
  },
  '93r': {
    cat: 'pistol', label: '手枪 · 93R', short: '93R', name: '93R', code: 'BERETTA 93R', price: 1200, cal: '919',
    desc: '三连发点射手枪。单发不重，但一轮三发刚好放倒小兵；冲锋枪买不起的时候，它是最便宜的爆发。',
    dmg: 26, armorDmg: 9, rate: 0.44, spread: 0.048, count: 1, mode: 'burst', burst: 3, burstGap: 0.055,
    bspeed: 1300, mag: 20, reload: 1.25, recoil: 2.2, size: 3.2, reserveMul: 8,
        ads: { spread: 0.55, move: 0.78, time: 0.13 },
    color: '#ffd66b', range: 950, knock: 60, sound: '93r', noise: 640,
    bars: { dmg: .26, rate: .50, mag: .50, acc: .66 },
  },
  g18: {
    cat: 'pistol', label: '手枪 · G18', short: 'G18', name: 'G18', code: 'GLOCK 18', price: 2200, cal: '919',
    desc: '全自动手枪。33 发长弹匣，扣住扳机就是一片弹雨，走廊和房间里贴脸极凶；散布与后坐都大，出了十米基本靠运气。',
    dmg: 17, armorDmg: 5, rate: 0.072, spread: 0.105, count: 1, mode: 'auto',
    bspeed: 1150, mag: 33, reload: 1.55, recoil: 2.8, size: 3.0, reserveMul: 6,
        ads: { spread: 0.70, move: 0.86, time: 0.12 },
    color: '#ffc46b', range: 700, knock: 38, sound: 'g18', noise: 700,
    bars: { dmg: .22, rate: .66, mag: .62, acc: .34 },
  },
  bizon: {
    cat: 'smg', label: '冲锋枪 · 野牛', short: '野牛', name: '野牛', code: 'PP-19 BIZON', price: 1400, cal: '918',
    desc: '64 发螺旋弹鼓，一个弹匣能扫穿半个据点，几乎不用为换弹发愁。单发很轻，靠泼水压制。',
    dmg: 14, armorDmg: 10, rate: 0.065, spread: 0.072, count: 1, mode: 'auto',
    bspeed: 1120, mag: 64, reload: 2.3, recoil: 1.3, size: 2.8, reserveMul: 4,
        ads: { spread: 0.62, move: 0.64, time: 0.16 },
    color: '#e6e0c9', range: 780, knock: 42, sound: 'smg', noise: 560,
    bars: { dmg: .28, rate: .96, mag: 1.0, acc: .40 },
  },
  m870: {
    cat: 'shotgun', label: '霰弹枪 · M870', short: 'M870', name: 'M870', code: 'REMINGTON M870', price: 2400, cal: '12g',
    desc: '泵动霰弹枪，一次糊出 8 枚弹丸。一发打碎盾兵的盾，两发送走重甲。远一点就基本打空。',
    dmg: 13, armorDmg: 3.5, rate: 0.85, spread: 0.215, count: 8, mode: 'semi',
    bspeed: 1000, mag: 7, reload: 2.6, recoil: 10, size: 3.0, reserveMul: 4,
        ads: { spread: 0.70, move: 0.62, time: 0.22 },
    color: '#ffab5e', range: 520, knock: 170, sound: 'shotgun', noise: 860,
    bars: { dmg: .90, rate: .22, mag: .22, acc: .12 },
  },
  akm: {
    cat: 'rifle', label: '步枪 · AKM', short: 'AKM', name: 'AKM', code: 'KALASHNIKOV AKM', price: 3600, cal: '762x39',
    role: '重击 · 近距', desc: '7.62×39 的老家伙。单发 44 点，全系步枪里单发最重、贴脸 TTK 最短 —— 八发就能把机枪兵按倒；代价是后坐与散布最大、弹道衰减最狠，中距离必须点射，出了三百步就别指望它。',
    dmg: 44, armorDmg: 11, rate: 0.117, spread: 0.030, count: 1, mode: 'auto',
    bspeed: 1650, mag: 30, reload: 2.3, recoil: 4.6, size: 3.7, reserveMul: 5,
        ads: { spread: 0.52, move: 0.58, time: 0.19 },
    color: '#ff8f5e', range: 1250, knock: 130, sound: 'ak', pierce: 1, noise: 960,
    fb: { d0: 340, min: 0.72 },
    vis: { frame: 'ak', mag: 'curved', wood: true },
    bars: { dmg: .66, rate: .68, mag: .60, acc: .72 },
  },
  m4a1: {
    cat: 'rifle', label: '步枪 · M4A1', short: 'M4A1', name: 'M4A1', code: 'COLT M4A1', price: 4000, cal: '556',
    role: '均衡 · 中距', desc: '全自动主力步枪。没有一项是全系第一，但射速、精度、手感、衰减都在中上，子弹还能穿透一名敌人 —— 不知道带什么的时候带它，什么距离都能打。',
    dmg: 33, armorDmg: 12, rate: 0.100, spread: 0.021, count: 1, mode: 'auto',
    bspeed: 1700, mag: 30, reload: 1.85, recoil: 3.4, size: 3.6, reserveMul: 5,
        ads: { spread: 0.42, move: 0.62, time: 0.18 },
    color: '#c9a3ff', range: 1500, knock: 100, sound: 'rifle', pierce: 1, noise: 900,
    fb: { d0: 380, min: 0.86 },
    vis: { frame: 'ar', mag: 'straight' },
    bars: { dmg: .52, rate: .73, mag: .60, acc: .82 },
  },
  qbz95: {
    cat: 'rifle', label: '步枪 · QBZ-95', short: 'QBZ-95', name: 'QBZ-95', code: 'NORINCO QBZ-95', price: 4400, cal: '58',
    role: '抬枪 · 中远', desc: '无托结构的 5.8mm 制式步枪。抬枪全系最快（0.15s）、换弹顺手，存速好 —— 中远距离几乎不掉伤，是六把步枪里远射最稳的一把；单发只有 32 点，贴脸换血略吃亏，加装配件的余地也小。',
    dmg: 32, armorDmg: 15, rate: 0.096, spread: 0.020, count: 1, mode: 'auto',
    bspeed: 1800, mag: 30, reload: 1.80, recoil: 3.2, size: 3.4, reserveMul: 5,
        ads: { spread: 0.44, move: 0.64, time: 0.15 },
    color: '#b6f07a', range: 1400, knock: 95, sound: 'rifle', pierce: 1, noise: 880,
    fb: { d0: 420, min: 0.90 },
    vis: { mag: 'curved', bullpup: true, carry: true },
    bars: { dmg: .50, rate: .74, mag: .60, acc: .86 },
  },
  ak12: {
    cat: 'rifle', label: '步枪 · AK-12', short: 'AK-12', name: 'AK-12', code: 'KALASHNIKOV AK-12', price: 4600, cal: '545',
    role: '持续 · 压枪', desc: '5.45×39 的新一代 AK。后坐全系最小、连续点射最稳，单发只有 30 点靠弹速和节奏补伤害；打软目标要两枪，换血时靠稳定性把弹着点全糊在一个人身上。',
    dmg: 30, armorDmg: 13, rate: 0.090, spread: 0.019, count: 1, mode: 'auto',
    bspeed: 1750, mag: 30, reload: 1.90, recoil: 2.9, size: 3.5, reserveMul: 5,
        ads: { spread: 0.42, move: 0.62, time: 0.17 },
    color: '#8fd4ff', range: 1450, knock: 95, sound: 'rifle', pierce: 1, noise: 900,
    fb: { d0: 360, min: 0.82 },
    vis: { frame: 'ak', mag: 'curved', carry: true },
    bars: { dmg: .50, rate: .77, mag: .60, acc: .84 },
  },
  qbz192: {
    cat: 'rifle', label: '步枪 · QBZ-192', short: 'QBZ-192', name: 'QBZ-192', code: 'NORINCO QBZ-192', price: 5000, cal: '58',
    role: '贴脸 · 快突', desc: '短管卡宾型。射速全系最高、抬枪最快、走位最灵活，室内和拐角贴脸最凶；枪管太短，两百步外伤害一路掉到七成，弹匣打空之前必须解决战斗。',
    dmg: 28, armorDmg: 11, rate: 0.077, spread: 0.026, count: 1, mode: 'auto',
    bspeed: 1650, mag: 30, reload: 1.70, recoil: 2.7, size: 3.2, reserveMul: 5,
        ads: { spread: 0.50, move: 0.66, time: 0.13 },
    color: '#f2b8ff', range: 1000, knock: 78, sound: 'rifle', pierce: 1, noise: 860,
    fb: { d0: 260, min: 0.68 },
    vis: { mag: 'curved', bullpup: true, carry: true },
    bars: { dmg: .46, rate: .86, mag: .60, acc: .74 },
  },
  qbz191: {
    cat: 'rifle', label: '步枪 · QBZ-191', short: 'QBZ-191', name: 'QBZ-191', code: 'NORINCO QBZ-191', price: 5400, cal: '58',
    role: '远射 · 精度', desc: 'QBZ 三代的长管型。单发 35 点、散布全系最小、弹道几乎不衰减，是全系唯一能在远距离稳定点掉探头目标的步枪；代价是射速最慢、抬枪最沉，被贴脸时非常吃亏。',
    dmg: 35, armorDmg: 15, rate: 0.112, spread: 0.015, count: 1, mode: 'auto',
    bspeed: 1900, mag: 30, reload: 1.95, recoil: 3.2, size: 3.6, reserveMul: 5,
        ads: { spread: 0.40, move: 0.62, time: 0.20 },
    color: '#7af0d8', range: 1600, knock: 100, sound: 'rifle', pierce: 1, noise: 910,
    fb: { d0: 460, min: 0.95 },
    vis: { frame: 'ar', mag: 'curved', carry: true },
    bars: { dmg: .54, rate: .70, mag: .60, acc: .90 },
  },
  sr9: {
    cat: 'dmr', label: '精确射手步枪 · SR9', short: 'SR9', name: 'SR9', code: 'SR-9 DMR', price: 5200, cal: '762',
    desc: '半自动精确射手步枪。单发 70 点、后坐极轻，两三发一个点射就能清掉远处探头的人。',
    dmg: 70, armorDmg: 26, rate: 0.33, spread: 0.009, count: 1, mode: 'semi',
    bspeed: 2100, mag: 18, reload: 2.1, recoil: 7, size: 3.8, reserveMul: 5,
        ads: { spread: 0.30, move: 0.55, time: 0.24 },
    color: '#9ef2c8', range: 1900, knock: 150, sound: 'dmr', pierce: 1, noise: 1080,
    bars: { dmg: .72, rate: .46, mag: .42, acc: .94 },
    vis: { frame: 'ar' },
  },
  r93: {
    cat: 'sniper', label: '狙击枪 · R93', short: 'R93', name: 'R93', code: 'BLASER R93', price: 6800, cal: '762',
    desc: '栓动狙击枪，吃 7.62×51 全威力弹 —— 和 SR9 共用一盒弹，养起来比大口径便宜一半。单发 310 点，一枪一个重甲兵，子弹能穿三名目标。',
    dmg: 310, armorDmg: 85, rate: 1.35, spread: 0.003, count: 1, mode: 'semi',
    bspeed: 2800, mag: 5, reload: 2.7, recoil: 16, size: 4.2, reserveMul: 5,
        ads: { spread: 0.18, move: 0.44, time: 0.30 },
    color: '#9fd4ff', range: 2600, knock: 260, sound: 'sniper', pierce: 3, noise: 1250,
    vis: { frame: 'chassis', bolt: true },
    bars: { dmg: .95, rate: .10, mag: .14, acc: 1.0 },
  },
  awm: {
    cat: 'sniper', label: '狙击枪 · AWM', short: 'AWM', name: 'AWM', code: 'ACCURACY INT. AWM', price: 8800, cal: '338',
    desc: '.338 拉普马格南的顶级栓动。单发 400 点，能穿四名目标、隔着大半个图点人 —— 一发白弹就要 ¥25，打空一个弹匣比挨一枪更心疼。',
    dmg: 400, armorDmg: 110, rate: 1.62, spread: 0.002, count: 1, mode: 'semi',
    bspeed: 2900, mag: 5, reload: 3.0, recoil: 18, size: 4.4, reserveMul: 5,
        ads: { spread: 0.15, move: 0.40, time: 0.33 },
    color: '#e8f4ff', range: 2800, knock: 300, sound: 'sniper', pierce: 4, noise: 1300,
    vis: { frame: 'chassis', bolt: true },
    bars: { dmg: 1.0, rate: .09, mag: .14, acc: 1.0 },
  },

  /* ══════ 冲锋枪扩编 ══════ */
  mk4: {
    cat: 'smg', label: '冲锋枪 · MK4', short: 'MK4', name: 'MK4', code: 'MK-4 SMG', price: 1800, cal: '919',
    desc: '制式冲锋枪，吃最便宜的 9×19。出厂是三连点射：一轮三发刚好放倒无甲小兵，节奏稳还省弹；装上专属的「连发改装枪管」后解锁全自动，35 发长匣直接泼水。',
    dmg: 17, armorDmg: 9, rate: 0.26, spread: 0.058, count: 1, mode: 'burst', burst: 3, burstGap: 0.062,
    bspeed: 1150, mag: 35, reload: 1.70, recoil: 1.6, size: 2.8, reserveMul: 4,
        ads: { spread: 0.60, move: 0.66, time: 0.14 },
    color: '#a8e6ff', range: 700, knock: 44, sound: 'smg', noise: 600,
    vis: { mag: 'straight', len: 17, sidel: 58 },
    bars: { dmg: .34, rate: .92, mag: .78, acc: .42 },
  },
  thompson: {
    cat: 'smg', label: '冲锋枪 · 汤姆逊', short: '汤姆逊', name: '汤姆逊', code: 'M1928 THOMPSON', price: 2400, cal: '45acp',
    desc: '坝区黑市里的老家伙。.45 大弹头一发顶 9mm 一发半，打无甲目标格外疼；枪老、散布大、远距离掉得快，适合贴脸换血。',
    dmg: 23, armorDmg: 10, rate: 0.082, spread: 0.056, count: 1, mode: 'auto',
    bspeed: 1050, mag: 30, reload: 2.30, recoil: 2.4, size: 3.0, reserveMul: 4,
        ads: { spread: 0.62, move: 0.62, time: 0.16 },
    color: '#ffc9a3', range: 640, knock: 68, sound: 'smg', noise: 640,
    fb: { d0: 180, min: 0.60 },
    vis: { mag: 'drum', wood: true, len: 21, sidel: 66 },
    bars: { dmg: .42, rate: .80, mag: .68, acc: .40 },
  },
  mp7: {
    cat: 'smg', label: '冲锋枪 · MP7', short: 'MP7', name: 'MP7', code: 'H&K MP7', price: 2800, cal: '46',
    desc: 'PDW 定位的异类：4.6×30 弹又小又快，穿甲是冲锋枪里最好的，磨重甲几乎和步枪一样快；单发肉伤偏软，靠射速把伤害灌满。',
    dmg: 15, armorDmg: 12, rate: 0.055, spread: 0.060, count: 1, mode: 'auto',
    bspeed: 1250, mag: 40, reload: 1.60, recoil: 1.3, size: 2.6, reserveMul: 4,
        ads: { spread: 0.58, move: 0.68, time: 0.13 },
    color: '#b0ffd8', range: 720, knock: 40, sound: 'smg', noise: 560,
    vis: { mag: 'stick', len: 14, sidel: 50 },
    bars: { dmg: .30, rate: .96, mag: .86, acc: .38 },
  },
  vector: {
    cat: 'smg', label: '冲锋枪 · Vector', short: 'Vector', name: 'Vector', code: 'KRISS VECTOR', price: 3600, cal: '45acp',
    desc: '后坐力系统吹出来的怪物：全系射速最高，.45 弹头泼出去像水流，贴脸一瞬间就能灌完半个弹匣；弹匣小、枪口乱，两秒内解决不了战斗就得换弹。',
    dmg: 19, armorDmg: 10, rate: 0.048, spread: 0.054, count: 1, mode: 'auto',
    bspeed: 1100, mag: 25, reload: 1.90, recoil: 1.5, size: 2.7, reserveMul: 4,
        ads: { spread: 0.58, move: 0.66, time: 0.14 },
    color: '#d6c8ff', range: 600, knock: 52, sound: 'smg', noise: 580,
    fb: { d0: 160, min: 0.58 },
    vis: { mag: 'stick', len: 15, sidel: 52 },
    bars: { dmg: .36, rate: 1.0, mag: .62, acc: .44 },
  },

  /* ══════ 机枪（新类目）：大弹容 · 持续压制，代价是散布、后坐与换弹 ══════ */
  rpk: {
    cat: 'lmg', label: '机枪 · RPK', short: 'RPK', name: 'RPK', code: 'KALASHNIKOV RPK', price: 4600, cal: '762x39',
    role: '压制 · 轻机枪', desc: 'AKM 的机枪版：加重枪管、40 发长弹匣，单发和 AKM 一样重，能多泼十发；散布比 AKM 大一号，远距衰减也狠，适合卡着中距离一梭子压死一个据点。',
    dmg: 42, armorDmg: 12, rate: 0.125, spread: 0.034, count: 1, mode: 'auto',
    bspeed: 1600, mag: 40, reload: 3.0, recoil: 5.2, size: 3.9, reserveMul: 4,
        ads: { spread: 0.54, move: 0.52, time: 0.22 },
    color: '#ff8f5e', range: 1200, knock: 125, sound: 'lmg', pierce: 1, noise: 1000,
    fb: { d0: 320, min: 0.70 },
    vis: { frame: 'ak', mag: 'curved', len: 30, sidel: 80 },
    bars: { dmg: .64, rate: .62, mag: .72, acc: .68 },
  },
  m249: {
    cat: 'lmg', label: '机枪 · M249', short: 'M249', name: 'M249', code: 'FN M249 SAW', price: 6400, cal: '556',
    role: '压制 · 弹箱', desc: '100 发弹箱的班用机枪：抬一次枪管就能从据点这头泼到那头，5.56 弹的射速和弹道都不吃亏；散布大、换弹慢得像换轮胎，开打前先把位置想好。',
    dmg: 31, armorDmg: 15, rate: 0.082, spread: 0.037, count: 1, mode: 'auto',
    bspeed: 1700, mag: 100, reload: 4.8, recoil: 4.4, size: 4.0, reserveMul: 3,
        ads: { spread: 0.56, move: 0.46, time: 0.26 },
    color: '#c9a3ff', range: 1400, knock: 100, sound: 'lmg', pierce: 1, noise: 1050,
    fb: { d0: 360, min: 0.82 },
    vis: { frame: 'lmg', mag: 'box', len: 32, sidel: 84 },
    bars: { dmg: .50, rate: .80, mag: 1.0, acc: .60 },
  },
  pkm: {
    cat: 'lmg', label: '机枪 · PKM', short: 'PKM', name: 'PKM', code: 'KALASHNIKOV PKM', price: 7600, cal: '762x54',
    role: '重压制 · 泼水', desc: '7.62×54R 凸缘全威力弹的重机枪：单发 47 点、两发破盾，80 发弹链泼出去就是一面墙，子弹还能穿透两名目标；全游戏最沉的枪，走位慢、换弹更慢，架住了就是据点死神。',
    dmg: 47, armorDmg: 17, rate: 0.108, spread: 0.040, count: 1, mode: 'auto',
    bspeed: 1750, mag: 80, reload: 5.6, recoil: 6.4, size: 4.2, reserveMul: 3,
        ads: { spread: 0.58, move: 0.42, time: 0.28 },
    color: '#ff6f8f', range: 1350, knock: 140, sound: 'lmg', pierce: 2, noise: 1150,
    fb: { d0: 330, min: 0.72 },
    vis: { frame: 'lmg', mag: 'box', len: 34, sidel: 88 },
    bars: { dmg: .68, rate: .66, mag: .90, acc: .56 },
  },

  /* ══════ 步枪扩编 ══════ */
  mcx: {
    cat: 'rifle', label: '步枪 · MCX', short: 'MCX', name: 'MCX', code: 'SIG MCX', price: 4800, cal: '300blk',
    role: '模块 · 亚音速', desc: '.300 BLK 的模块化步枪：重弹头单发 36 点，开火动静比小口径小一截，配消音器几乎就是一把长管冲锋枪；枪管短，两百步外伤害一路掉。',
    dmg: 36, armorDmg: 14, rate: 0.088, spread: 0.024, count: 1, mode: 'auto',
    bspeed: 1500, mag: 30, reload: 1.80, recoil: 3.3, size: 3.3, reserveMul: 5,
        ads: { spread: 0.44, move: 0.64, time: 0.15 },
    color: '#ffc98f', range: 1100, knock: 92, sound: 'rifle', pierce: 1, noise: 700,
    fb: { d0: 300, min: 0.76 },
    vis: { frame: 'ar', mag: 'straight', len: 23, sidel: 70 },
    bars: { dmg: .56, rate: .78, mag: .60, acc: .78 },
  },
  aug: {
    cat: 'rifle', label: '步枪 · AUG', short: 'AUG', name: 'AUG', code: 'STEYR AUG A3', price: 5200, cal: '556',
    role: '无托 · 快瞄', desc: '自带瞄准镜的无托步枪：抬枪速度仅次于 QBZ-192，5.56 弹手感扎实、弹道规整；无托结构换弹偏慢，被近身时第二枪总是慢半拍。',
    dmg: 33, armorDmg: 14, rate: 0.092, spread: 0.021, count: 1, mode: 'auto',
    bspeed: 1720, mag: 30, reload: 2.15, recoil: 3.1, size: 3.5, reserveMul: 5,
        ads: { spread: 0.40, move: 0.62, time: 0.13 },
    color: '#9fffc4', range: 1450, knock: 95, sound: 'rifle', pierce: 1, noise: 890,
    fb: { d0: 380, min: 0.86 },
    vis: { mag: 'straight', bullpup: true, len: 25, sidel: 74 },
    bars: { dmg: .52, rate: .74, mag: .60, acc: .84 },
  },
  hk416: {
    cat: 'rifle', label: '步枪 · HK416', short: 'HK416', name: 'HK416', code: 'H&K 416', price: 5600, cal: '556',
    role: '精工 · 全能', desc: '短行程活塞版 M4：把 M4 的每一项短板都补了半格 —— 射速快一点、散布小一点、衰减轻一点，单项都不冒尖但没有任何缺点；贵，是它唯一的门槛。',
    dmg: 34, armorDmg: 13, rate: 0.095, spread: 0.019, count: 1, mode: 'auto',
    bspeed: 1750, mag: 30, reload: 1.85, recoil: 3.0, size: 3.6, reserveMul: 5,
        ads: { spread: 0.40, move: 0.62, time: 0.16 },
    color: '#8fb8ff', range: 1550, knock: 100, sound: 'rifle', pierce: 1, noise: 900,
    fb: { d0: 390, min: 0.88 },
    vis: { frame: 'ar', mag: 'straight' },
    bars: { dmg: .53, rate: .72, mag: .60, acc: .88 },
  },
  sr3m: {
    cat: 'rifle', label: '步枪 · SR-3M', short: 'SR-3M', name: 'SR-3M', code: 'TSNIITOCHMASH SR-3M', price: 5600, cal: '9x39',
    role: '重弹 · 近中距', desc: '缩小的「旋风」：吃 9×39 亚音速重弹，单发 38 点、磨甲快得不像步枪，两百步内换血几乎无敌；亚音速弹出了两百步一路掉到六成，只适合往里冲。',
    dmg: 38, armorDmg: 17, rate: 0.098, spread: 0.028, count: 1, mode: 'auto',
    bspeed: 1300, mag: 20, reload: 1.95, recoil: 3.8, size: 3.2, reserveMul: 5,
        ads: { spread: 0.48, move: 0.64, time: 0.16 },
    color: '#ffb8a0', range: 850, knock: 105, sound: 'rifle', pierce: 1, noise: 820,
    fb: { d0: 220, min: 0.60 },
    vis: { frame: 'ak', mag: 'straight', supp: true, len: 21, sidel: 62 },
    bars: { dmg: .58, rate: .72, mag: .44, acc: .70 },
  },
  k437: {
    cat: 'rifle', label: '步枪 · K437', short: 'K437', name: 'K437', code: 'K437 CARBINE', price: 6000, cal: '556',
    role: '稳定 · 中远', desc: '慢射速、低后坐的 precision 卡宾：单发 32 点但弹着点极其老实，d0 四百一步的存速让它在中远距离几乎不掉伤；泼水不如 M4 系，点射才是它的用法。',
    dmg: 32, armorDmg: 15, rate: 0.086, spread: 0.020, count: 1, mode: 'auto',
    bspeed: 1780, mag: 30, reload: 1.90, recoil: 2.8, size: 3.6, reserveMul: 5,
        ads: { spread: 0.40, move: 0.62, time: 0.17 },
    color: '#a0e8ff', range: 1500, knock: 95, sound: 'rifle', pierce: 1, noise: 880,
    fb: { d0: 410, min: 0.90 },
    vis: { frame: 'ar', mag: 'straight' },
    bars: { dmg: .50, rate: .76, mag: .60, acc: .88 },
  },
  asval: {
    cat: 'rifle', label: '步枪 · AS VAL', short: 'AS VAL', name: 'AS VAL', code: 'TSNIITOCHMASH AS VAL', price: 6400, cal: '9x39',
    role: '消音 · 潜袭', desc: '自带整体消音器的特种步枪：开一枪的动静比跺一脚还小，敌人几乎不会循声找你；9×39 重弹单发 40 点、磨甲凶狠 —— 近距离是刺客，远距离亚音速弹掉得你怀疑人生。',
    dmg: 40, armorDmg: 18, rate: 0.104, spread: 0.027, count: 1, mode: 'auto',
    bspeed: 1320, mag: 20, reload: 2.0, recoil: 3.9, size: 3.4, reserveMul: 5,
        ads: { spread: 0.46, move: 0.62, time: 0.17 },
    color: '#c0b8ff', range: 900, knock: 110, sound: 'rifle', pierce: 1, noise: 340,
    fb: { d0: 240, min: 0.62 },
    vis: { frame: 'ak', mag: 'straight', supp: true, len: 23, sidel: 68 },
    bars: { dmg: .60, rate: .70, mag: .44, acc: .72 },
  },

  /* ══════ 精确射手步枪扩编 ══════ */
  sks: {
    cat: 'dmr', label: '精确射手步枪 · SKS', short: 'SKS', name: 'SKS', code: 'SIMONOV SKS', price: 3400, cal: '762x39',
    desc: '最便宜的半自动射手步枪：吃 AKM 同款 7.62×39，单发 54 点、桥夹供弹装得慢，但胜在一发是一发、枪枪有谱；预算不够上 SR9 时的过渡选择。',
    dmg: 54, armorDmg: 19, rate: 0.30, spread: 0.012, count: 1, mode: 'semi',
    bspeed: 1600, mag: 15, reload: 2.6, recoil: 6, size: 3.7, reserveMul: 5,
        ads: { spread: 0.34, move: 0.58, time: 0.22 },
    color: '#e8c88f', range: 1350, knock: 130, sound: 'dmr', pierce: 1, noise: 960,
    fb: { d0: 300, min: 0.72 },
    vis: { frame: 'sporter', mag: 'straight', wood: true, bolt: true },
    bars: { dmg: .60, rate: .44, mag: .36, acc: .88 },
  },
  m14: {
    cat: 'dmr', label: '精确射手步枪 · M14', short: 'M14', name: 'M14', code: 'SPRINGFIELD M14', price: 5600, cal: '762',
    desc: '全威力半自动的中间档：单发 64 点、20 发弹匣、后坐比 SR9 稍重，弹道和 SR9 同一套 7.62×51；比 SR9 贵一截，换来的是更整齐的中远点射手感。',
    dmg: 64, armorDmg: 24, rate: 0.32, spread: 0.010, count: 1, mode: 'semi',
    bspeed: 2000, mag: 20, reload: 2.3, recoil: 6.5, size: 3.8, reserveMul: 5,
        ads: { spread: 0.32, move: 0.56, time: 0.23 },
    color: '#aef2b0', range: 1800, knock: 145, sound: 'dmr', pierce: 1, noise: 1040,
    vis: { frame: 'sporter', mag: 'straight', wood: true, bolt: true },
    bars: { dmg: .66, rate: .42, mag: .46, acc: .92 },
  },
  sr25: {
    cat: 'dmr', label: '精确射手步枪 · SR-25', short: 'SR-25', name: 'SR-25', code: 'KNIGHT SR-25', price: 7000, cal: '762',
    desc: '7.62 半自动的天花板：单发 78 点、散布比狙击枪只差一线，子弹能穿透两名目标 —— 一轮点射就能清掉一个双人巡逻组；后坐沉、弹匣金贵，扣扳机之前先想好。',
    dmg: 78, armorDmg: 30, rate: 0.35, spread: 0.008, count: 1, mode: 'semi',
    bspeed: 2100, mag: 20, reload: 2.5, recoil: 7.5, size: 4.0, reserveMul: 5,
        ads: { spread: 0.28, move: 0.52, time: 0.26 },
    color: '#b8f2ff', range: 2000, knock: 160, sound: 'dmr', pierce: 2, noise: 1100,
    vis: { frame: 'ar', mag: 'straight' },
    bars: { dmg: .74, rate: .40, mag: .46, acc: .95 },
  },
  svd: {
    cat: 'dmr', label: '精确射手步枪 · SVD', short: 'SVD', name: 'SVD', code: 'DRAGUNOV SVD', price: 6400, cal: '762x54',
    role: '半自动 · 远点', desc: '德拉贡诺夫半自动射手步枪：吃 7.62×54R 凸缘全威力弹，和 PKM 共用一盒弹。单发 76 点、10 发弹匣，弹道比 M14 更平，420 外几乎不掉伤；射速慢、后坐沉，靠枪枪到肉的准头吃饭。',
    dmg: 76, armorDmg: 28, rate: 0.40, spread: 0.0095, count: 1, mode: 'semi',
    bspeed: 2050, mag: 10, reload: 2.4, recoil: 7.2, size: 4.1, reserveMul: 5,
        ads: { spread: 0.30, move: 0.54, time: 0.25 },
    color: '#ffdda6', range: 1950, knock: 155, sound: 'dmr', pierce: 2, noise: 1090,
    fb: { d0: 420, min: 0.93 },
    vis: { frame: 'sporter', mag: 'straight', wood: true, bolt: true },
    bars: { dmg: .73, rate: .38, mag: .30, acc: .95 },
  },

  /* ══════ 狙击枪扩编 ══════ */
  m700: {
    cat: 'sniper', label: '狙击枪 · M700', short: 'M700', name: 'M700', code: 'REMINGTON M700', price: 7600, cal: '762',
    desc: '雷明登 M700 栓动，吃 7.62×51：单发 340 点、弹道比 R93 再稳一线，一枪一个重甲兵、子弹穿三名目标；价格卡在 R93 与 AWM 中间，是「再攒一点钱上 .338」之前的体面选择。',
    dmg: 340, armorDmg: 92, rate: 1.45, spread: 0.0028, count: 1, mode: 'semi',
    bspeed: 2850, mag: 5, reload: 2.8, recoil: 17, size: 4.3, reserveMul: 5,
        ads: { spread: 0.16, move: 0.42, time: 0.31 },
    color: '#c8e4ff', range: 2700, knock: 270, sound: 'sniper', pierce: 3, noise: 1280,
    vis: { frame: 'sporter', bolt: true, sidel: 88 },
    bars: { dmg: .97, rate: .10, mag: .14, acc: 1.0 },
  },
};

/* 开镜参数：spread 散布倍率 / move 移速倍率 / time 抬枪耗时（重枪更慢） */
function adsOf(w) {
  return (w && w.ads) || { spread: 0.5, move: 0.6, time: 0.18 };
}

/* 军火库 / 改装台 / 掉落池的枚举顺序（不直接等于快捷栏）
   同一类里按价格从低到高排，军火库一行读下来就是升级路线。 */
const WEAPON_ORDER = ['g17', '93r', 'g18',
                      'mk4', 'bizon', 'thompson', 'mp7', 'vector', 'm870',
                      'akm', 'm4a1', 'hk416', 'aug', 'mcx', 'qbz95', 'ak12', 'sr3m', 'qbz192', 'k437', 'asval', 'qbz191',
                      'rpk', 'm249', 'pkm',
                      'sks', 'sr9', 'm14', 'sr25', 'svd',
                      'r93', 'm700', 'awm'];


/* 装备槽：数字键 1~5 一一对应 */
const SLOT_DEFS = [
  { id: 'primary',   key: '1', cn: '主武器', en: 'PRIMARY' },
  { id: 'secondary', key: '2', cn: '副武器', en: 'SECONDARY' },
  { id: 'melee',     key: '3', cn: '近战',   en: 'MELEE' },
  { id: 'pistol',    key: '4', cn: '手枪',   en: 'PISTOL' },
  { id: 'medkit',    key: '5', cn: '医疗',   en: 'MEDKIT' },
];
/* 哪些槽装的是枪 */
const GUN_SLOTS = ['primary', 'secondary', 'pistol'];

/* ══════════════════════════════════════════════════════════
   改枪：把「基础枪 + 已装配件」算成一份生效数值
   ──────────────────────────────────────────────────────────
   返回的对象和 WEAPONS 里的结构完全一致，游戏逻辑只要改读
   weaponStats() 就不用关心配件存在。带签名缓存，每帧随便调。
   ══════════════════════════════════════════════════════════ */
const WSTAT_CACHE = {};

function weaponStats(id) {
  const base = WEAPONS[id] || WEAPONS[BASE_WEAPON];
  const wid = WEAPONS[id] ? id : BASE_WEAPON;
  const eq = (SAVE.mods && SAVE.mods[wid]) || {};

  let sig = wid;
  for (const s of MOD_SLOTS) sig += '|' + (eq[s.id] || '');
  const hit = WSTAT_CACHE[sig];
  if (hit) return hit;

  const st = Object.assign({}, base);
  st.ads = Object.assign({}, base.ads || { spread: 0.5, move: 0.6, time: 0.18 });
  const slots = {};

  for (const s of MOD_SLOTS) {
    const mid = eq[s.id];
    const m = mid && MODS[mid];
    if (!m || m.slot !== s.id || !slotAllowed(wid, s.id)) continue;
    slots[s.id] = mid;
    const e = m.eff || {};
    if (e.dmg)   { st.dmg      *= e.dmg;
                   st.armorDmg  = (st.armorDmg || 0) * e.dmg; }   // 加伤配件同样放大磨甲
    if (e.spread)  st.spread   *= e.spread;
    if (e.recoil)  st.recoil   *= e.recoil;
    if (e.mag)     st.mag      *= e.mag;
    if (e.reload)  st.reload   *= e.reload;
    if (e.range)   st.range    *= e.range;
    if (e.bspeed)  st.bspeed   *= e.bspeed;
    if (e.noise)   st.noise    *= e.noise;
    if (e.pierce)  st.pierce    = (st.pierce || 0) + e.pierce;
    if (e.mode)    st.mode      = e.mode;          // MK4 连发枪管：burst → auto
    if (e.adsTime)   st.ads.time   *= e.adsTime;
    if (e.adsSpread) st.ads.spread *= e.adsSpread;
    if (e.adsMove)   st.ads.move   *= e.adsMove;
    if (e.move)      st.moveMul     = (st.moveMul || 1) * e.move;
  }

  st.mag = Math.max(1, Math.round(st.mag));
  st.dmg = Math.round(st.dmg * 10) / 10;
  st.recoil = Math.round(st.recoil * 100) / 100;
  st.spread = Math.round(st.spread * 10000) / 10000;
  st.ads.time = clamp(st.ads.time, 0.06, 1.2);
  st.ads.spread = clamp(st.ads.spread, 0.05, 1);
  st.ads.move = clamp(st.ads.move, 0.15, 1.1);
  st.moveMul = st.moveMul || 1;
  st.slots = slots;
  st.modCount = Object.keys(slots).length;
  st.sig = sig;

  WSTAT_CACHE[sig] = st;
  return st;
}

/* 枪上装了几件 —— HUD / 列表里的小标记 */
function gunModCount(wid) {
  const eq = (SAVE.mods && SAVE.mods[wid]) || {};
  let n = 0;
  for (const s of MOD_SLOTS) if (eq[s.id] && MODS[eq[s.id]]) n++;
  return n;
}


/* ── 弹药库存 ──
   SAVE.ammo[口径][弹级] = 剩余发数。出击装弹时扣，局内捡到的直接加进弹匣。 */
function calOfWeapon(id) { return CAL_OF_WEAPON[id] || '919'; }
function caliberOf(id) { return CALIBERS[calOfWeapon(id)] || CALIBERS['919']; }
function ammoTier(lv) { return AMMO_TIERS[clamp(lv | 0, 0, AMMO_LV_MAX)] || AMMO_TIERS[1]; }
function ammoTierName(cal, lv) {
  const C = CALIBERS[cal], T = ammoTier(lv);
  return (C ? C.short : '?') + ' · ' + T.grade + ' ' + T.name;
}
function ammoStock(cal, lv) {
  const b = SAVE.ammo && SAVE.ammo[cal];
  return b ? Math.max(0, b[lv] | 0) : 0;
}
function takeAmmoStock(cal, lv, n) {
  if (!SAVE.ammo) SAVE.ammo = {};
  if (!SAVE.ammo[cal]) SAVE.ammo[cal] = {};
  const have = Math.max(0, SAVE.ammo[cal][lv] | 0);
  const take = Math.min(have, Math.max(0, Math.round(n)));
  SAVE.ammo[cal][lv] = have - take;
  return take;
}
function addAmmoStock(cal, lv, n) {
  if (!CALIBERS[cal] || lv < 0 || lv > AMMO_LV_MAX) return 0;
  if (!calHasTier(cal, lv)) return 0;   // 不上架的级别进不了库存
  if (!SAVE.ammo) SAVE.ammo = {};
  if (!SAVE.ammo[cal]) SAVE.ammo[cal] = {};
  const add = Math.max(0, Math.round(n));
  SAVE.ammo[cal][lv] = Math.min(9999, Math.max(0, SAVE.ammo[cal][lv] | 0) + add);
  return add;
}
function ammoTotalOf(cal) {
  let n = 0;
  for (let lv = 0; lv <= AMMO_LV_MAX; lv++) n += ammoStock(cal, lv);
  return n;
}
/* 一盒的价格：口径基价 × 弹级倍率 × 每盒发数 */
function ammoPrice(cal, lv) {
  const C = CALIBERS[cal], T = ammoTier(lv);
  if (!C || !T) return 0;
  return Math.max(1, Math.round(C.base * T.priceMul * C.box));
}
/* 这个口径现在实际会装进枪里的弹级：
   优先用玩家选的；那一级没货，就找最近的有货的级别，差得最少的那一档。 */
function ammoPickOf(cal) {
  const pick = (SAVE.ammoPick && SAVE.ammoPick[cal] != null &&
                calHasTier(cal, SAVE.ammoPick[cal] | 0))
    ? clamp(SAVE.ammoPick[cal] | 0, 0, AMMO_LV_MAX) : defaultTierOf(cal);
  if (ammoStock(cal, pick) > 0) return pick;
  /* 没货就找最近的有货弹级 —— 只在上架的级别里找，不上架的直接跳过 */
  for (let d = 1; d <= AMMO_LV_MAX; d++) {
    const lo = pick - d, hi = pick + d;
    if (lo >= 0 && calHasTier(cal, lo) && ammoStock(cal, lo) > 0) return lo;
    if (hi <= AMMO_LV_MAX && calHasTier(cal, hi) && ammoStock(cal, hi) > 0) return hi;
  }
  return pick;
}

/* 弹级打甲级 —— 完全照抄那张对照表：
   弹级比甲级高 2 级以上 = 全穿透；高 1 级 = 75%；同级 = 50%；比甲低 = 一点不进。 */
function penRatio(pen, armorLv) {
  const lv = armorLv | 0;
  if (lv <= 0) return 1;
  const d = lv - (pen | 0);
  if (d <= -2) return 1;
  if (d === -1) return 0.75;
  if (d === 0) return 0.5;
  return 0;
}
/* 这颗弹对某级甲能打出百分之多少 —— 一行塞得下：
   「对甲 1-6 级 100/75/50/×/×/×」 */
function penTableText(pen) {
  const parts = [];
  for (let lv = 1; lv <= 6; lv++) {
    const r = penRatio(pen, lv);
    parts.push(r > 0 ? String(Math.round(r * 100)) : '×');
  }
  return '对甲 1-6 级 ' + parts.join('/');
}

/* 护甲：仓库里的一件件实体（每件有自己的耐久），穿上 = 从仓库拿出那件。
   17 件具名护甲覆盖 3-6 级，同等级按定位分化（耐久 / 瞄准惩罚 / 移速惩罚 / 维修效率 / 耐久损耗）：
   lv 是甲级 —— 决定「几级弹才打得进」（与敌人护甲同一张对照表 penRatio）；
   hp/max 是耐久 —— 挡弹会磨甲，磨光就裸奔；dr 只对没弹级的伤害（爆炸/近战/火/冻）生效；
   aim 是瞄准惩罚 —— 开火散布 ×(1+aim)；move 是移速惩罚 —— 走速 ×(1-move)；
   eff 是维修效率 —— 1 点甲修剂恢复 eff 点耐久；loss 是耐久损耗 —— 每恢复 1 点上限磨 loss 点。
   件与格子里一律记 id（目录编号），不再记甲级。 */
const ARMORS = [
  { id: 0,  name: '无护甲', short: '无护甲', lv: 0, dr: 0, hp: 0, aim: 0, move: 0, price: 0, load: 0, eff: 0, effName: '—', loss: 0, lossName: '—',
    desc: '没有任何防护，承受全额伤害 —— 但身上最轻，走得最快、枪口最稳。' },
  /* ── 3 级甲：挡 1-2 级弹，同级弹减半，4 级弹 75% 穿入 ── */
  { id: 1,  name: '射手战术背心', short: '射手背心', lv: 3, dr: 0.20, hp: 85, aim: 0.04, move: 0.02, price: 3400, load: 0.6, eff: 0.59, effName: '低', loss: 0.075, lossName: '中',
    desc: '射手兼职的软质背心。3 级甲里耐久最高，但材料吃修（1 点甲修剂只恢复 0.59 耐久）；4% 瞄准惩罚对架枪党基本无感。' },
  { id: 2,  name: 'TG-H 防弹衣', short: 'TG-H', lv: 3, dr: 0.20, hp: 75, aim: 0.03, move: 0.01, price: 2800, load: 0.3, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '均衡型 3 级防弹衣：耐久、机动、维修成本都取中间值，主力过渡甲。' },
  { id: 3,  name: 'Hvk 快拆防弹衣', short: 'Hvk 快拆', lv: 3, dr: 0.20, hp: 60, aim: 0.01, move: 0.01, price: 2200, load: 0.3, eff: 0.9, effName: '中', loss: 0.06, lossName: '低',
    desc: '快拆结构牺牲了覆盖面积换轻便：几乎不影响枪口和走位，损耗低、修起来不心疼 —— 跑刀局的体面选择。' },
  { id: 4,  name: '制式防弹背心', short: '制式背心', lv: 3, dr: 0.20, hp: 50, aim: 0, move: 0.01, price: 1600, load: 0.3, eff: 1.2, effName: '高', loss: 0.06, lossName: '低',
    desc: '量产制式装备：3 级甲里最便宜、最好修（1 点修 1.2 耐久、修满只磨 6% 上限），代价是全表最薄的 50 点耐久。' },
  /* ── 4 级甲：挡 1-3 级弹，同级弹减半，5 级弹 75% 穿入 ── */
  { id: 5,  name: 'MK-2 战术背心', short: 'MK-2', lv: 4, dr: 0.25, hp: 110, aim: 0.05, move: 0.05, price: 8200, load: 1.5, eff: 0.9, effName: '中', loss: 0.06, lossName: '低',
    desc: '4 级甲的耐久王：110 点扛得住同级的持续对枪，损耗低越修越保值；5% + 5% 的双惩罚是它的重量税。' },
  { id: 6,  name: 'DT-AVS 防弹衣', short: 'DT-AVS', lv: 4, dr: 0.25, hp: 100, aim: 0.04, move: 0.03, price: 6800, load: 0.9, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '全防护体系的中间档：耐久充裕、惩罚可控，没有短板也没有惊喜。' },
  { id: 7,  name: '突击手防弹背心', short: '突击手', lv: 4, dr: 0.25, hp: 90, aim: 0.02, move: 0.01, price: 5600, load: 0.3, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '为拉枪线设计的轻量 4 级甲：2% + 1% 的惩罚几乎无感，适合喜欢近身缠斗的突击位。' },
  { id: 8,  name: '武士防弹背心', short: '武士', lv: 4, dr: 0.25, hp: 80, aim: 0.05, move: 0.05, price: 4800, load: 1.5, eff: 1.2, effName: '高', loss: 0.06, lossName: '低',
    desc: '老派插板硬做到 4 级：80 点耐久不算厚，但 1 点修 1.2、损耗 6% —— 全表最好养活的 4 级甲。' },
  { id: 9,  name: 'HMP 特勤防弹衣', short: 'HMP 特勤', lv: 4, dr: 0.25, hp: 80, aim: 0, move: 0, price: 4200, load: 0, eff: 0.9, effName: '中', loss: 0.09, lossName: '高',
    desc: '特勤狙击手的隐形护甲：零瞄准惩罚、零移速惩罚，穿上像没穿；代价是损耗高 —— 每修满一次磨 9% 上限，基本是消耗品。' },
  /* ── 5 级甲：挡 1-4 级弹，同级弹减半，6 级弹 75% 穿入 ── */
  { id: 10, name: '重型突击背心', short: '重型突击', lv: 5, dr: 0.30, hp: 125, aim: 0.10, move: 0.05, price: 18000, load: 1.5, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '5 级甲的耐久顶点：125 点硬抗总监的扫射；10% 瞄准惩罚让远距离对枪开始吃力 —— 这是堡垒甲，不是射手甲。' },
  { id: 11, name: 'Hvk-2 防弹衣', short: 'Hvk-2', lv: 5, dr: 0.30, hp: 115, aim: 0.08, move: 0.07, price: 15400, load: 2.1, eff: 1.2, effName: '高', loss: 0.09, lossName: '高',
    desc: '哈夫克量产 5 级：唯一高效率的大甲（1 点修 1.2），后勤压力全表最低；8% + 7% 的惩罚和高损耗是它的出厂设定。' },
  { id: 12, name: 'FS 复合防弹衣', short: 'FS 复合', lv: 5, dr: 0.30, hp: 105, aim: 0.05, move: 0.03, price: 12600, load: 0.9, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '复合材料把 5 级防护压进了可机动的重量：5% + 3% 的惩罚在 5 级甲里最斯文，各项都是中庸的可靠。' },
  { id: 13, name: '精英防弹背心', short: '精英背心', lv: 5, dr: 0.30, hp: 95, aim: 0.01, move: 0, price: 9800, load: 0, eff: 1.2, effName: '高', loss: 0.09, lossName: '高',
    desc: '精英射手的招牌：1% 瞄准惩罚、零移速惩罚 —— 穿着 5 级甲打狙击不是梦；95 点耐久和高损耗提醒你它是玻璃大炮。' },
  /* ── 6 级甲：只有 6 级弹能对穿 ── */
  { id: 14, name: '泰坦防弹装甲', short: '泰坦', lv: 6, dr: 0.35, hp: 150, aim: 0.12, move: 0.08, price: 38000, load: 2.4, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '全表耐久最高：150 点 + 6 级防护，正面的移动堡垒；12% 瞄准 + 8% 移速，穿它就别想着当狙击手了。' },
  { id: 15, name: '金刚防弹衣', short: '金刚', lv: 6, dr: 0.35, hp: 140, aim: 0.08, move: 0.07, price: 32000, load: 2.1, eff: 0.9, effName: '中', loss: 0.09, lossName: '高',
    desc: '泰坦的轻量竞品：耐久只差 10 点、惩罚小一圈；高损耗意味着每修满一次都掉 9% 上限 —— 修着修着就薄了。' },
  { id: 16, name: '特里克 MAS2.0', short: '特里克', lv: 6, dr: 0.35, hp: 125, aim: 0.06, move: 0.05, price: 27000, load: 1.5, eff: 0.9, effName: '中', loss: 0.06, lossName: '低',
    desc: '三代复合材料旗舰：6 级防护 + 低损耗（越修越保值），6% + 5% 的惩罚在 6 级甲里最收敛 —— 长线玩家的答案。' },
  { id: 17, name: 'HA-2 重型防弹衣', short: 'HA-2', lv: 6, dr: 0.35, hp: 115, aim: 0.03, move: 0.01, price: 22000, load: 0.3, eff: 0.9, effName: '中', loss: 0.075, lossName: '中',
    desc: '6 级甲的入门价：115 点耐久刚过线，但 3% + 1% 的惩罚轻得像件 4 级甲 —— 想要 6 级兜底又不想变成铁罐头，就是它。' },
];
/* 甲的耐久条颜色随等级走（和敌人装甲同色系：1 白 2 绿 3 蓝 4 紫 5 金 6 红） */
function armorLvColor(lv) {
  return ARMOR_LV_COLOR[lv | 0] || '#5e87a0';
}
const ARMOR_MAX_HP = 150;
/* 按甲级取同级的所有具名护甲 / 随机抽一件（敌人穿甲、图内掉落用） */
function armorsOfLv(lv) { return ARMORS.filter(a => a.lv === (lv | 0)); }
function rollArmorId(lv) {
  const pool = armorsOfLv(lv).filter(a => a.id > 0);
  return pool.length ? pick(pool).id : 0;
}

/* ── 头盔：和护甲并行的第二个防具槽。护甲管「身子」，头盔管「脑子 + 耳朵」。
   lv      头盔等级（1-3），只是一个档位标识，不影响减伤强度；
   drLv/dr 「几级及以下的子弹」吃多少平减 —— 只对子弹生效（pen 0 的爆炸 / 近战 / 火 / 冻不吃），
           高一级的弹照旧打穿，所以 3 级头在绝密局里几乎只是块铁皮；
   hear    拾音范围增量：+0.10 = 听敌人脚步的范围放大 10%，负数是隔音变差；
   quiet   降噪：自己发出的动静（脚步 / 枪声 / 搜刮）传播半径 ×(1-quiet)，越静越难被人摸到位置；
   aim     开镜时间惩罚（adsTime ×(1+aim)）；move 移速惩罚（走速 ×(1-move)）。
   头盔不磨耐久：挡不挡得住只看等级，阵亡会丢 —— 它卖的是「信息」，不是「厚度」。 */
const HELMETS = [
  { id: 0, name: '不戴头盔', short: '无头盔', lv: 0, drLv: 0, dr: 0, hear: 0, quiet: 0, quietName: '—', aim: 0, move: 0, price: 0,
    desc: '脑袋光着：耳朵是原装的，听得见多远就是多远。' },
  /* ── 1 级头：只有耳朵，没有防护 ── */
  { id: 1, name: '户外棒球帽', short: '棒球帽', lv: 1, drLv: 0, dr: 0, hear: 0.10, quiet: 0.04, quietName: '低', aim: 0, move: 0, price: 600,
    desc: '帽檐压住顶光，反而听得更清：拾音范围 +10%，自己动静小 4%（警戒涨慢 12%、方位偏 ±28px）。没有任何防护 —— 子弹照样从布上穿过去。' },
  /* ── 2 级头：挡 1-2 级弹 ── */
  { id: 2, name: '复古摩托头盔', short: '摩托盔', lv: 2, drLv: 2, dr: 0.10, hear: -0.05, quiet: 0.10, quietName: '中', aim: 0, move: 0, price: 2400,
    desc: '玻璃钢外壳垫着一层海绵：2 级及以下子弹伤害 -10%，自己动静小 10%（警戒涨慢 30%、方位偏 ±70px）。代价是闷 —— 拾音范围 -5%。' },
  /* ── 3 级头：挡 1-3 级弹，两件取向相反：厚 vs 听得远 ── */
  { id: 3, name: '防暴头盔', short: '防暴盔', lv: 3, drLv: 3, dr: 0.12, hear: -0.05, quiet: 0.10, quietName: '中', aim: 0.03, move: 0.01, price: 5200,
    desc: '带面罩的全罩式防暴盔：3 级及以下子弹伤害 -12%，全表最厚。自己动静小 10%（警戒涨慢 30%、方位偏 ±70px），代价是抬枪 -3%、走位 -1%、拾音 -5%。' },
  { id: 4, name: 'MC201 防弹头盔', short: 'MC201', lv: 3, drLv: 3, dr: 0.10, hear: 0.20, quiet: 0.10, quietName: '中', aim: 0.01, move: 0.01, price: 6800,
    desc: '带电子拾音模块的战术盔：拾音范围 +20%（断层式领先），3 级及以下子弹伤害 -10%，自己动静小 10%（警戒涨慢 30%、方位偏 ±70px）。防护比防暴盔薄两格，但戴上它你能先听见别人。' },
  /* ── 4 级头：能挡 4 级弹，视野开始成为代价 / 卖点 ── */
  { id: 5, name: 'MHS 战术头盔', short: 'MHS', lv: 4, drLv: 4, dr: 0.10, hear: 0.30, quiet: 0.10, quietName: '中', aim: 0.03, move: 0.01, fov: 1.00, fovName: '持平', price: 9200,
    desc: '模块化战术盔：4 级及以下子弹伤害 -10%，拾音范围 +30%（第二好），自己动静小 10%（警戒涨慢 30%、方位偏 ±70px）。抬枪 -3%、走位 -1%，视野不赔不赚。' },
  { id: 6, name: 'D6 战术头盔', short: 'D6', lv: 4, drLv: 4, dr: 0.25, hear: -0.10, quiet: 0.18, quietName: '高', aim: 0.06, move: 0.04, fov: 0.82, fovName: '下降 高', price: 17500,
    desc: '全封闭重型盔：4 级及以下子弹伤害 -25%，全表最厚；自己动静小 18%（警戒涨慢 54%、方位偏 ±126px）。代价是闷罐子 —— 拾音 -10%、视野收窄 18%、抬枪 -6%、走位 -4%。' },
  { id: 7, name: 'DICH 训练头盔', short: 'DICH', lv: 4, drLv: 4, dr: 0.03, hear: 0.50, quiet: 0.18, quietName: '高', aim: 0, move: 0.02, fov: 1.15, fovName: '上升 中', price: 9800,
    desc: '开放式训练盔：几乎不防弹（-3%），但耳朵是全表最强 —— 拾音 +50%、自己动静小 18%、视野宽 15%。走位 -2%，抬枪无惩罚。适合当「眼睛」，别当盾牌。' },
  { id: 8, name: 'GT1 战术头盔', short: 'GT1', lv: 4, drLv: 4, dr: 0.12, hear: 0.20, quiet: 0.10, quietName: '中', aim: 0.04, move: 0.04, fov: 1.08, fovName: '上升 低', price: 13500,
    desc: '带侧轨的通用战术盔：4 级及以下子弹伤害 -12%，拾音 +20%、动静小 10%、视野宽 8%。抬枪 -4%、走位 -4% —— 样样都行，样样都不极致。' },
];
function helmetOf(id) { return HELMETS[id | 0] || HELMETS[0]; }
/* 拾音倍率：+20% → 听力半径 1.2 倍；-5% → 0.95 */
function helmetHearMul(h) { return Math.max(0.3, 1 + ((h && h.hear) || 0)); }
/* 降噪：自己发出的动静打几折（0.90 = 少传 10%） */
function helmetNoiseMul(h) { return Math.max(0.4, 1 - ((h && h.quiet) || 0)); }
/* 降噪不只是「传得近」，还让敌人「听着软、方位糊」 —— 两个系数就是手感旋钮：
   HELMET_QUIET_HARD：警戒硬度削减。quiet 0.10 → ×(1-0.30)=0.70，警戒条涨慢三成；
   HELMET_QUIET_BLUR：方位误差半径（px）。quiet 0.10 → 敌人猜的落点偏离 ±70px。 */
const HELMET_QUIET_HARD = 3.0;
const HELMET_QUIET_BLUR = 700;
/* 视野：头盔改的是「视锥半角倍率」（fov） —— 主视野等比缩放，余光只吃 60%，
   否则 84° 的余光一放大就顶到屁股后面去了。 */
const HELMET_FOV_EDGE_K = 0.6;
/* 视野标签：只有不是 1 倍时才出现（商店 / 整备 / 仓库 / 大厅简报共用） */
function helmetFovTag(h) {
  const f = (h && h.fov) || 1;
  if (Math.abs(f - 1) < 0.001) return '';
  return ' · 视野 ' + (f > 1 ? '+' : '') + Math.round((f - 1) * 100) + '%';
}

/* ── 甲修包：修护甲用的消耗品，跟医疗包一样有耐久（点数）。
   恢复量 = 消耗点数 × 甲的维修效率（1 点修几耐久）；上限损耗 = 恢复量 × 甲的耐久损耗率。
   capLv：能修的最高甲级 —— 蓝修 1-3 级，紫修 1-4，金修 1-5，红修全甲。 ── */
const REPAIRS = {
  repair_b: {
    name: '甲修包 · 蓝', short: '蓝甲修', code: 'ARMOR KIT II',
    grade: '蓝',
    dur: 30, capLv: 3, wind: 2.4, price: 600, color: '#4aa8ff', size: 0.55,
    desc: '30 点甲修剂，可修 3 级及以下护甲。制式背心（高效率）打空修满一次只要 42 点；射手背心（低效率）要 144 点。每修 1 点耐久，上限按甲的损耗率（6%~9%）磨掉一点。',
  },
  repair_p: {
    name: '甲修包 · 紫', short: '紫甲修', code: 'ARMOR KIT IV',
    grade: '紫',
    dur: 75, capLv: 4, wind: 3.0, price: 1600, color: '#b46bff', size: 0.62,
    desc: '75 点甲修剂，可修 4 级及以下护甲。修满一件 MK-2 要约 122 点（1 块半）；武士 / 制式这类高效率甲要省得多。',
  },
  repair_g: {
    name: '甲修包 · 金', short: '金甲修', code: 'ARMOR KIT V',
    grade: '金',
    dur: 120, capLv: 5, wind: 3.6, price: 3600, color: '#ffc94a', size: 0.78,
    desc: '120 点甲修剂，可修 5 级及以下护甲。军规陶瓷修补剂：重型突击（中效率）打空修满一次约 139 点，精英背心（高效率）只要 79 点。',
  },
  repair_r: {
    name: '甲修包 · 红', short: '红甲修', code: 'ARMOR KIT VI',
    grade: '红',
    dur: 200, capLv: 6, wind: 4.2, price: 7200, color: '#ff5c5c', size: 0.95,
    desc: '200 点甲修剂，可修全部 6 级护甲。泰坦装甲打空修满一次约 167 点 —— 一块正好够，最好再备半块。',
  },
};
const REPAIR_ORDER = ['repair_b', 'repair_p', 'repair_g', 'repair_r'];

/* ═══════════ 行动门票 ═══════════
   机密/绝密先掏钱再进场：高收入图把「风险投资」前置，正好对准
   高手这种不阵亡、免缴隐形水槽的人群。阵亡门票不退。 */
const ENTRY_FEE = { standard: 0, secret: 8000, top: 20000 };
function entryFeeOf(tier) { return ENTRY_FEE[tier] | 0; }

/* ═══════════ 武器磨损与保养 ═══════════
   把「买枪」这个一次性大水槽变成持续水槽。磨损记在枪型上（同款多把共用，
   简化：保养一次全款清零）；近战刀不在 GUN_SLOTS 里，永不磨损 —— 保底不收钱。
   数值 rationale：满磨保养 = 枪价 25%（serviceK 0.0025 × 100 磨损），
   普通图 100/8 ≈ 12 局磨满 → 每局均摊 ≈ 枪价 2%，机密 3%，绝密 4%。
   [PLACEHOLDER] 磨损速率与哑火率未经 playtest；验证路径：毕业期每局
   保养支出应落在枪价 2~4%，哑火要烦到想保养、不至于摔键盘。 */
const GUN_WEAR = {
  perRaid: { standard: 8, secret: 12, top: 16 },
  serviceK: 0.0025,   // 每 1 点磨损收枪价的 0.25%
  jam: 0.12,          // 磨满 100 后每发哑火概率
  spreadK: 0.35,      // 磨满时散布 ×1.35，按磨损线性插值
};
function gunWearOf(id) { return Math.max(0, Math.min(100, (SAVE.gunWear && SAVE.gunWear[id]) | 0)); }
function gunWearAdd(id, n) {
  if (!WEAPONS[id]) return;
  if (!SAVE.gunWear) SAVE.gunWear = {};
  SAVE.gunWear[id] = gunWearOf(id) + Math.max(0, n);
}
function gunServiceCost(id) { return Math.round(WEAPONS[id].price * GUN_WEAR.serviceK * gunWearOf(id)); }
function gunSpreadMul(id) { return 1 + (gunWearOf(id) / 100) * GUN_WEAR.spreadK; }

/* ═══════════ 黑市轮售 ═══════════
   每天按日期种子刷 3 件限量货（同一天打开几次都是同一批）。
   定位：自愿水槽 —— 批量顶级弹药九折 + 限量红甲修，给毕业期的富余资金一个出口。
   [PLACEHOLDER] 货池宽度与九折未经验证；验证路径：毕业期玩家若从不光顾
   说明定价不对味，若每天都清空说明池子太窄。 */
function ensureBlackMarket() {
  const day = contractDay();
  if (SAVE.blackMarket && SAVE.blackMarket.day === day &&
      Array.isArray(SAVE.blackMarket.items)) return SAVE.blackMarket;
  const pool = [];
  /* 手上有枪的口径：整车顶级弹（3 盒捆装九折）—— 量大、单发便宜，诱导大额消费 */
  for (const cal of CAL_ORDER) {
    if (!WEAPON_ORDER.some(id => SAVE.owned[id] && calOfWeapon(id) === cal)) continue;
    let lv = -1;
    for (let i = AMMO_LV_MAX; i >= 0; i--) if (calHasTier(cal, i)) { lv = i; break; }
    if (lv < 1) continue;                       // 只有修脚弹的口径不上桌
    const C = CALIBERS[cal], T = ammoTier(lv);
    pool.push({
      t: 'ammo', cal, lv, n: C.box * 3, stock: 1,
      name: C.short + ' ' + T.grade + '弹 ×' + (C.box * 3) + ' 发',
      desc: '黑市整车弹：3 盒捆装，单价九折。出门前最后一次补货的机会。',
      price: Math.round(ammoPrice(cal, lv) * 3 * 0.9),
      color: T.color,
    });
  }
  /* 甲修包三件套：军火库常年有售，黑市版限量但不加价 —— 限量本身就是稀缺。
     三档全进池子，保证就算玩家只有一把枪，货池也 ≥ 3 件（每天固定上 3 件）。 */
  for (const rid of ['repair_r', 'repair_g', 'repair_p']) {
    const R = REPAIRS[rid];
    if (R) pool.push({ t: 'repair', id: rid, stock: 2, name: R.name, desc: R.desc, price: R.price, color: R.color });
  }
  /* 按日期种子洗牌取 3 件 */
  let seed = hashStr('bm-' + day) || 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const items = [];
  const p = pool.slice();
  while (items.length < 3 && p.length) items.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
  SAVE.blackMarket = { day, items };
  saveGame();
  return SAVE.blackMarket;
}

/* ══════════════════════════════════════════════════════════
   干员
   ──────────────────────────────────────────────────────────
   每人 4 个能力：G 战术道具 / V 小技能 / X 大招 / 被动。
   技能不花钱买，选定干员后每局自带 —— 储备与冷却都随开局重置，
   所以「储备 2 颗」是每局 2 颗，不是仓库里的存货。
   三条主动各自独立冷却，互不占用；被动不占键位资源，只要求状态。
   ══════════════════════════════════════════════════════════ */
/* 全局比例尺：1 米 ≈ 18 像素。技能说明里的「10 米 / 20 米 / 65 米」都按这个换算，
   所以 20m = 360px（烟幕射程 340 正好是 19 米，两边对得上） */
const METER = 18;

const SKILL = {
  /* 烟雾弹：落点即起烟，0.3s 铺满、8s 总时长、最后 1.2s 收烟（起烟快、散得也快） */
  smoke: { r: 118, life: 8.0, grow: 0.30, fade: 1.2, range: 340 },
  /* 三联装手炮：V 端出来 → 左键射向准星 100 米内的那个点；
     到点不会立刻炸：弹体带着余速惯性滑一小段，引信固定 3 秒后才起爆。
     glide = 过点后每秒的速度衰减系数，越大滑得越短（900 / glide ≈ 滑行距离） */
  gl: { dmg: 52, radius: 100, speed: 900, range: 100 * 18, spread: 26,
        fuse: 3.0, glide: 18, slideMin: 8,
        stun: 1.6, cripple: 6.0, selfMul: 0.5 },
  /* 滑铲：奔跑中才能起手，0.45s 位移，无冷却（只吃一点体力） */
  slide: { dur: 0.45, mul: 2.6, cost: 10 },
  /* 动力外骨骼：移速与滑铲距离同时抬一档 */
  exo: { move: 1.22, slide: 1.55, slideDur: 1.18 },

  /* ── 威龙的四件套 ── */
  /* 磁吸炸弹：最远 20 米，贴附 3 秒引爆；吸附后跟着宿主（墙/敌人）走 */
  mag: { range: 20 * 18, min: 40, def: 5 * 18, speed: 520, fuse: 3.0, dmg: 130, radius: 120,
         armorBreak: 260, selfMul: 0.5, hold: 0.28, arc: 46 },
  /* 动力推进：0.22s 推 10 米（正前），侧/后按 0.62 打折；击杀扣 10 秒冷却 */
  dash: { dist: 10 * 18, dur: 0.22, sideMul: 0.62, cost: 12, killCd: 10 },
  /* 虎蹲炮：压缩空气弹，2.5 秒引信 + 撞墙反弹；半径 5 米强制击倒 */
  shock: { radius: 5 * 18, speed: Math.round(65 * 18 / 2.5), life: 2.5, dmg: 12,
           kd: 3.0, bossKd: 1.0, selfKd: 2.0, knock: 70 },
  /* 动能辅助：技能 / 被掀翻后短暂加速，爆炸伤害与骨裂都打折 */
  kine: { dur: 2.6, move: 1.18, blastMul: 0.55, fissureDodge: 0.75 },

  /* ── 露娜（侦察）── */
  /* 增强破片手雷：按住左键点引信（5s），松手投出；引信烧完就在手上炸 */
  frag: { dmg: 84, radius: 6 * 18, fuse: 5.0, near: 9 * 18, lob: 18 * 18,
          speed: 660, selfMul: 0.7, bleed: 2, holdMax: 12 * 18, slide: 0.38, glide: 5.0, slideMin: 26 },
  /* 电击箭矢：射出后落地成 5 米电圈，持续电击 + 减速（骨折）；可反弹一次 */
  arc: { speed: 780, range: 30 * 18, zoneR: 5 * 18, zoneLife: 4.2, tick: 0.42,
         dmg: 9, cripple: 3.5, bounce: 1, healSlow: 5 },
  /* 侦察箭矢：穿墙飞 200 米，沿途 9 米内敌人全部标记；
     落地开出 10 米「侦察视野」8 秒 —— 无遮挡判定，隔墙整片亮 */
  scan: { speed: 1150, range: 200 * 18, mark: 9, scanR: 9 * 18, hitR: 26, ping: 8, pingR: 10 * 18 },

  /* ── 蜂医（支援）── */
  /* 蜂巢烟：15 秒，被激素枪打中转化成 60 秒绿色治疗场 */
  bee: { life: 15, r: 118, healLife: 60, healR: 122, healRate: 3.4, tick: 0.5 },
  /* 烟幕无人机：可手控飞行；点按 V 派出自动机全速沿射向拉直线长烟 */
  drone: { life: 16, speed: 330, step: 0.17, r: 92, smokeLife: 15, trailR: 96, autoSpeed: 560, autoRange: 30 * 18 },
  /* 激素枪：充能 24s/发、上限 3 发；打烟染色、打敌人穿甲 0 级、长按 X 自用 */
  heal: { charges: 3, recharge: 24, dmg: 8, pen: 0, heal: 34, regen: 4.2, regenT: 8,
          speed: 940, homing: 3.0, range: 34 * 18 },
  /* 专业救援：倒地后 WASD 爬行 + 长按 F 六秒自救，10 血复活；每局一次（CD 360s） */
  rescue: { down: 6.0, hp: 10, cd: 360, weakCut: 1 },

  /* ── 乌鲁鲁（工程）── */
  /* 复合燃烧弹：落地爆燃（中心 30 伤，边缘衰减到 40%）+ 5 米火场 12 秒。
     火场每 0.55s 对敌 6.5 伤；自己吃半伤（3.25）且不会被点燃（不挂灼烧）。 */
  firebomb: { r: 5 * 18, life: 12, dmg: 6.5, tick: 0.55, near: 9 * 18, lob: 19 * 18,
              speed: 640, selfMul: 0.6, blast: 30, blastFall: 0.4, selfFire: 0.5 },
  /* 速凝掩体：20 米内指定位置立一块板，横/竖可切，存在 60 秒 */
  cover: { life: 60, range: 20 * 18, long: 132, thin: 26, selfMul: 0.5 },
  /* 巡飞弹：手控制导，最远 180 米、最多控 9 秒（超时原地引爆）；
     弹上带 8 米视野（迷雾里看得见导弹周围）；由慢到快自动加速到满速 */
  loiter: { speed: 400, accel: 320, turn: 2.4, range: 180 * 18, radius: 6 * 18,
            dmg: 95, subs: 4, subDmg: 36, subR: 4 * 18, subDelay: 0.55, selfMul: 0.5,
            ctl: 9, vision: 8 * 18, startMul: 0.25 },
  /* 久经沙场：骨折 / 减速类 debuff 抗性 */
  tough: { traumaMul: 0.45, legMul: 0.55, fissureMul: 0.5, chillMul: 0.6 },

  /* ── 无名（突击）── */
  /* 突破型闪光弹：抛出后撞墙 0.35 秒起爆（一直没撞墙就 1.5 秒自爆）。
     爆点 210 内、面朝爆点（±110°）且视线通畅的敌人被致盲 2.4 秒；
     自己站在同一片光里也会被闪到（屏幕炸白 + 眩晕）。 */
  flash: { speed: 560, range: 15 * 18, radius: 210, blind: 2.4, fuse: 1.5,
           wallFuse: 0.35, bounce: 0.5, selfMul: 0.55, selfConcuss: 1.1, glide: 6.5, slideMin: 26 },
  /* 旋刃飞行器：短按直掷（碰墙弹一次，第二次撞墙 / 撞人 / 引信到点爆）；
     长按锁定后追踪，从背后锁定速度快 2.4 倍（lockBehind 越小越快） */
  blade: { launch: 640, speed: 700, range: 26 * 18, radius: 4 * 18, dmg: 46,
           bleed: 2, cripple: 3.2, selfMul: 0.45, fissureP: 0.35,
           lockRange: 26 * 18, lockTime: 1.15, lockBehind: 0.42, turn: 3.2,
           life: 3.2, bounce: 1, bounceKeep: 0.55, near: 20 },
  /* 静默潜袭：12 秒。噪音压到 12%、不留脚印、免疫敌方侦察标记；
     开大瞬间把所有正在追你的敌人打回「只知道你刚才站哪」的状态。 */
  silent: { dur: 12, noiseMul: 0.12, hardMul: 0.45 },
  /* 重伤延滞：被无名打中的敌人 8 秒内打药 / 起身都变慢，而且更容易挂上流血 */
  trauma: { dur: 8, bleedChance: 0.55, bleedHeavy: 0.25,
            careMul: 2.0, healMul: 0.5, bandageTime: 4.5, bandageHeal: 0.35,
            bandageCd: 14, kdMul: 1.5 },
  /* 敌人流血（只有无名的「重伤延滞」才挂得上）：每层每秒掉血，最多 3 层 */
  ebleed: { dps: 1.1, max: 3, life: 5.0 },

  /* ── 蛊（支援）── */
  /* 高效治疗（被动）：全队打药 / 修甲 / 用医疗品的读条 -20%，倒地自救也快 20% */
  med: 0.8,
  /* 致盲毒雾：瓦斯弹落地或撞墙就地扩散，烟区 15 秒。
     敌人必须待在烟里满 0.75 秒才会被致盲（致盲 2.2 秒），离开后还残留 1.2 秒 —— 自己一样吃。 */
  gas: { speed: 520, range: 16 * 18, r: 132, life: 15, grow: 0.6, fade: 2.2,
         delay: 0.75, blind: 2.2, residual: 1.2, selfMul: 1, maxFuse: 1.6, glide: 8.0, slideMin: 30 },
  /* 肾上腺素激活：增益无人机半径 12.75 米、15 秒；前 10 秒抹掉装备带来的移速 / 开镜惩罚。
     每层强度 +15%，最多 10 层；层数整局保留，倒地 / 阵亡清空。 */
  adr: { r: 12.75 * 18, life: 15, gearClear: 10, linger: 1.6,
         ads: 0.25, move: 0.08, recoil: 0.20, kick: 0.55, shake: 0.35,
         stackMax: 10, stackGain: 0.15, passBuff: 12 },
  /* 流荧集群：自动绕障寻路的无人机群，最远 55 米；
     小兵缠 3 秒、BOSS 2 秒后自己拔掉；上限最低压到 10%（BOSS 50%），
     拔完 6 秒慢慢回满，被扣掉的血也一起还回来。 */
  swarm: { count: 6, speed: 300, range: 55 * 18, life: 22, radius: 42,
           attach: 3.0, bossAttach: 2.0, ramp: 3.0, bossRamp: 2.0, recover: 6.0,
           capFloor: 0.10, bossCapFloor: 0.50, sightMul: 0.38, fovMul: 0.62, hearMul: 0.22,
           turn: 3.8, retarget: 1.2 },
};

/* 旋刃飞行器的锁定状态：长按 V 时一直在跑，松手才发射 */
const BLADE_LOCK = { on: false, prog: 0, target: null, behind: false, t: 0 };

const OPERATORS = {
  redwolf: {
    id: 'redwolf', name: '红狼', role: '突击', en: 'RED WOLF',
    color: '#ff5a3c', glow: '#ff2a12',
    desc: '破门手。先用烟把走廊糊上，再用手炮把烟里的人炸出来；外骨骼一开，这一分钟就是你的。',
    g: {
      name: '突破型烟雾弹', short: '烟雾弹', tag: '战术道具', kind: 'smoke',
      desc: '朝准星抛出一枚快速成烟的烟雾弹（射程 340），落点立刻起烟：0.3 秒铺满、持续 8 秒、最后 1.2 秒收干净。烟里烟外互相看不见 —— 烟里的敌人睁眼也望不到外面。储备 2 枚可以连放，放掉一枚后按冷却 45 秒回充下一枚。',
      cd: 45, charges: 2,
    },
    v: {
      name: '三联装手炮', sub: '三头犬', short: '三头犬', tag: '小技能', kind: 'gl',
      desc: '按 V 把三联装手炮端出来，左键朝准星位置打出一组三发榴弹（左右各偏 26px，间隔 0.11s），最远 100 米；打墙上就贴墙停住。弹体到点不会立刻炸 —— 它会带着余速继续往前蹭两三米，引信从出膛算起固定 3 秒，时间到才引爆。爆炸半径 100、中心 52 伤：被炸到的敌人眩晕 1.6 秒并骨折（移速 -40%，持续 6 秒）。自炸只有一半伤害。储备 2 组可连放，打掉一组按冷却 70 秒回充。右键或再按 V 收炮。',
      cd: 70, charges: 2, shots: 3,
    },
    x: {
      name: '动力外骨骼', short: '外骨骼', tag: '大招', kind: 'exo',
      desc: '外骨骼撑起 25 秒：移速 +22%、滑铲更远更快，免疫骨折、腿断了也能跑。期间每击倒一名敌人延长 5 秒，并快速回复 30 血、回满体力（约 1.5 秒灌完，不是瞬间跳满）。冷却从启动那刻开始算。',
      cd: 90, dur: 25, killExtend: 5, killHeal: 30,
    },
    passive: {
      name: '战术滑铲', short: '战术滑铲', tag: '被动', kind: 'slide',
      desc: '奔跑途中按 C 滑铲：0.45 秒的低身位突进（约 5 个身位，比纯跑步远 1/3），没有冷却，只吃 10 点体力。外骨骼期间滑得更远、不耗体力。',
    },
  },

  weilong: {
    id: 'weilong', name: '威龙', role: '突击', en: 'WYVERN',
    color: '#4ad1ff', glow: '#1f9fe0',
    desc: '推进手。磁吸炸弹先贴到墙或人身上，动力推进把自己塞进缺口，虎蹲炮把整间屋按在地上 —— 代价是自己也别站在爆炸里。',
    g: {
      name: '磁吸炸弹', short: '磁吸弹', tag: '战术道具', kind: 'magbomb',
      desc: '朝准星抛出磁吸炸弹（最远 20 米）：吸附在墙面或敌人身上，贴附 3 秒后引爆。爆炸 130 伤、半径 6.7 米，还会把护甲炸掉一大截（贴脸的敌人直接裸甲）。长按 G 边瞄边选落点，短按直接按上次的距离扔（初始 5 米）。储备 2 颗可连放，打掉一颗按冷却 55 秒回充。',
      cd: 55, charges: 2,
    },
    v: {
      name: '动力推进', short: '推进', tag: '小技能', kind: 'dash',
      desc: '朝指定方向喷气突进：正前方约 10 米，侧向、向后更短。突进过程不能开火、也不能开镜 —— 这是位移，不是冲锋枪。CD 20 秒；每击杀一名敌人直接扣 10 秒冷却。',
      cd: 20, charges: 1,
    },
    x: {
      name: '虎蹲炮', short: '虎蹲炮', tag: '大招', kind: 'shock',
      desc: '发射一枚可反弹的压缩空气弹，飞行 2.5 秒后起爆（最远约 65 米）。半径 5 米内的敌人被强制击倒，倒地硬控 3 秒（BOSS 1 秒），期间无法操作。自己在爆炸范围内同样会被击倒 —— 别贴着自己打。',
      cd: 70, charges: 1,
    },
    passive: {
      name: '动能辅助系统', short: '动能辅助', tag: '被动', kind: 'kinetic',
      desc: '使用技能、被爆炸掀翻时会回收动能：2.6 秒内移速 +18%。爆炸类伤害对自己只吃 55%，也有 75% 概率直接免掉骨裂。没有冷却。',
    },
  },

  luna: {
    id: 'luna', name: '露娜', role: '侦察', en: 'LUNA',
    color: '#8ef2b0', glow: '#2fd47a',
    desc: '眼睛。箭比枪安静，也比枪看得远 —— 被她标上的人，隔着三堵墙也躲不掉下一发。',
    g: {
      name: '增强破片手雷', short: '破片雷', tag: '战术道具', kind: 'frag',
      desc: '按 G 把雷拿到手上：按住左键开始烧引信（5 秒），松手投出 —— 雷飞到准星位置（右键直接抛出更远，超距落在最远处），落地后带惯性往前滑一小段（滑到墙就停），引信到点就炸。引信在手上烧完会炸自己。爆炸半径 6 米、中心 84 伤并挂流血。储备 2 颗，打掉一颗按 40 秒回充。',
      cd: 40, charges: 2,
    },
    v: {
      name: '电击箭矢', short: '电箭', tag: '小技能', kind: 'shockbow',
      desc: '按 V 张弓，左键射出电箭：落点炸出 5 米电圈，持续 4.2 秒电击（每 0.42 秒 9 伤）+ 减速 3.5 秒；被电到的敌人连治疗都变慢（回血速率 -70%，持续 5 秒）。弓上按右键切换「反弹」，开启后这支箭能弹墙一次。储备 2 支，按 40 秒回充。',
      cd: 40, charges: 2,
    },
    x: {
      name: '侦察箭矢', short: '侦察箭', tag: '大招', kind: 'scanbow',
      desc: '按 X 张弓，左键射出侦察箭：无视地形穿墙飞满 200 米（穿人而过），沿途 9 米内的敌人全部被标记 9 秒 —— 标记期间隔着迷雾、隔着墙都能看见他的位置。落地后炸开一圈雷达：以落点为中心开出 10 米「侦察视野」持续 8 秒，无遮挡判定（墙后也整片亮），视野里的敌人全部标记、直接可见。储备 1 支，CD 66 秒。',
      cd: 66, charges: 1,
    },
    passive: {
      name: '敌情分析', short: '敌情分析', tag: '被动', kind: 'spot',
      desc: '你打中的敌人会被标记 4 秒：头顶一个绿色三角，位置在迷雾里也照样显示给你。没有冷却 —— 打中就标，标上就看得见。',
    },
  },

  beeser: {
    id: 'beeser', name: '蜂医', role: '支援', en: 'HIVES',
    color: '#7dffb0', glow: '#26d96f',
    desc: '队医。烟是自己的手术室，激素针是自己的止血钳 —— 倒下了也会先扑出一团烟，然后按着 F 把自己从地上捞起来。',
    g: {
      name: '蜂巢科技烟雾弹', short: '蜂巢烟', tag: '战术道具', kind: 'beesmoke',
      desc: '按 G 直接投出一枚蜂巢烟：15 秒大烟，和普通烟一样遮断视线。用激素枪打中这团烟（左键或长按 X 自扎都算）会把它染成绿色治疗场：范围 6.8 米，持续 60 秒，敌我站进去都按每秒 3.4 点回血 —— 包括敌人。储备 2 颗，按 40 秒回充。',
      cd: 40, charges: 2,
    },
    v: {
      name: '烟幕无人机', short: '烟幕机', tag: '小技能', kind: 'drone',
      desc: '点按 V：派一台烟幕无人机全速沿准星方向飞出（约 560 速），一路留下烟迹拉成 30 米直线长烟，撞墙或到头就地撤离。按住 V 超过 0.3 秒再松开：放出一台烟幕无人机，WASD 直接操控飞行、一路不停留下烟迹（最多 16 秒），再按一次 V 收回。这烟是机器喷的，染不成治疗场。储备 1 台，按 60 秒回充。',
      cd: 60, charges: 1,
    },
    x: {
      name: '激素枪', short: '激素枪', tag: '大招', kind: 'healgun',
      desc: '按 X 切出激素枪：左键射出追踪激素针 —— 命中烟雾把它染成治疗场，命中敌人按 0 级弹算伤害。右键抬枪收束。**按住 X 满 0.3 秒立即给自己来一针**（不用等松手，按住瞬间就打）：立刻 +34 血，之后 8 秒内再回 4.2/秒。充能 24 秒发一发、最多存 3 发（不是冷却，是弹匣）；开局没有存量，先等第一发充能。',
      cd: SKILL.heal.recharge, charges: 3, dur: 0,
    },
    passive: {
      name: '专业救援', short: '专业救援', tag: '被动', kind: 'rescue',
      desc: '血量见底时不是直接死，而是倒地：倒地瞬间自动扑出一团蜂巢烟把手术室铺上，之后只能用 WASD 慢慢爬（打不了枪、用不了技能）。倒地有独立的 100 点血条，无护甲减伤 —— 敌人打多少扣多少，扣光直接阵亡。长按 F 累计 6 秒完成自救：10 点血爬起来，松手进度暂停但不回退。每局只有一次（CD 360 秒）。',
    },
  },

  uluru: {
    id: 'uluru', name: '乌鲁鲁', role: '工程', en: 'ULURU',
    color: '#ffb457', glow: '#ff8a1f',
    desc: '工兵。别人找掩体，他自己浇一个；别人躲爆炸，他把爆炸送到一百八十米外。',
    g: {
      name: '复合型燃烧弹', short: '燃烧弹', tag: '战术道具', kind: 'firebomb',
      desc: '按 G 取出燃烧弹：左键投掷、右键抛出（更远）。落地爆燃（中心 30 伤，边缘衰减到 40%），同时烧起一片火场：半径 5 米、持续 12 秒，每 0.55 秒 6.5 伤。自己踩进火里只吃半伤，也不会被点燃。储备 2 颗，按 45 秒回充。',
      cd: 45, charges: 2,
    },
    v: {
      name: '速凝掩体', short: '速凝掩体', tag: '小技能', kind: 'coverdev',
      desc: '按 V 切换速凝掩体装置：左键在准星处（20 米内）喷出一块速凝板 —— 挡子弹、挡视线、也挡人。右键切换横向 / 竖向。掩体存在 60 秒。储备 1 个，按 55 秒回充。',
      cd: 55, charges: 1,
    },
    x: {
      name: '巡飞弹', short: '巡飞弹', tag: '大招', kind: 'loiter',
      desc: '按 X 举起巡飞弹发射器：左键直接发射（按准星方向平飞），右键进入瞄准、左键发射后由你手动遥控（WASD 转向、镜头跟着导弹）。导弹由慢到快自动加速到满速，弹上带 8 米视野 —— 迷雾里也看得见导弹周围。**最多遥控 9 秒**，超时在当前位置原地引爆；飞满 180 米或手动引爆同样起爆：半径 6 米、95 伤，随后分裂 4 枚子炸弹向四周散开再炸一轮。储备 1 发，CD 90 秒。',
      cd: 90, charges: 1,
    },
    passive: {
      name: '久经沙场', short: '久经沙场', tag: '被动', kind: 'tough',
      desc: '骨折类创伤的判定概率 -55%，骨裂伤害与腿部 / 冻伤的减速效果也各打一半 —— 同样的爆炸，别人断腿，他只是踉跄一下。没有冷却。',
    },
  },

  nameless: {
    id: 'nameless', name: '无名', role: '突击', en: 'NAMELESS',
    color: '#a99bff', glow: '#6a4cff',
    desc: '影子。一记闪光掀开房间，旋刃从背后咬上去；被他一刀划开的人血流不止，连包扎都拖半天 —— 等他们缓过来，他已经不在了。',
    g: {
      name: '突破型闪光弹', short: '闪光弹', tag: '战术道具', kind: 'flash',
      desc: '朝准星抛出一枚突破型闪光弹（最远 15 米，鼠标超距就落在最远处）：弹罐飞到落点后带着余速惯性滑行一小段；撞墙 0.35 秒后就地起爆，一直没撞墙则 1.5 秒后自爆。爆点 5.8 米内、面朝爆光的敌人致盲 2.4 秒 —— 致盲期间看不见你、也开不了枪，只会朝记忆里的位置乱走。自己站在爆光里同样会中招（屏幕炸白 + 眩晕）。储备 1 枚，按 40 秒回充。',
      cd: 40, charges: 1,
    },
    v: {
      name: '旋刃飞行器', short: '旋刃', tag: '小技能', kind: 'blade',
      desc: '按 V 把旋刃拿在手上：**短按松手 = 直接投掷**，撞墙弹一次，第二次撞墙 / 撞到人 / 飞满 26 米就引爆 —— 拿它弹墙炸掩体后面的敌人、封窄通道。**按住 V 进入锁定**：准星附近 26 米内、视线通畅的目标会被框住，锁定条满后松手，旋刃自动追踪；从敌人背后锁定速度 ×2.4（lockBehind）。命中半径 4 米、中心 46 伤，附加流血 ×2、减速 3.2 秒、骨折。自己也会被炸到（45% 伤害）。CD 50 秒，储备 1 枚。',
      cd: 50, charges: 1,
    },
    x: {
      name: '静默潜袭', short: '静默', tag: '大招', kind: 'silent',
      desc: '按 X 进入 12 秒静默：枪声 / 刀声 / 翻箱 / 脚步的动静全部压到 12%，地上不再留脚印，并且免疫敌方侦察扫描（安全总监的标记对你失效）。启动瞬间所有正在追你的敌人被打回搜索状态，只知道你开大那一刻站的位置 —— 后续无法持续追踪。CD 80 秒。',
      cd: 80, dur: 12,
    },
    passive: {
      name: '重伤延滞', short: '重伤延滞', tag: '被动', kind: 'trauma',
      desc: '被无名打中的敌人挂上 8 秒「重伤」：打药（战地包扎）耗时翻倍、回血只回一半，被击倒后起身也更慢（×1.5）；同时每一击有 55% 概率（重击额外 +25%）撕开流血，最多叠 3 层、每层每秒掉血。没有冷却。',
    },
  },

  gu: {
    id: 'gu', name: '蛊', role: '支援', en: 'GU',
    color: '#a6ef5e', glow: '#5fbf18',
    desc: '队医的另一半：别人靠药，她靠针和雾。无人机把整队的状态顶上去，瓦斯把走廊变成毒气室 —— 被她缠上的敌人，血条会一直往下掉，连上限一起。',
    g: {
      name: '致盲毒雾', short: '毒雾', tag: '战术道具', kind: 'gas',
      desc: '朝准星抛出一枚瓦斯弹（最远 16 米，鼠标超距就落在最远处）：弹体飞到落点后带惯性滑行一小段，滑停或撞上障碍物就地炸开，铺出一片半径 7.3 米的毒雾，持续 15 秒。<b>敌人在雾里待满 0.75 秒才会被致盲</b>（致盲 2.2 秒，期间看不见你、也开不了枪），离开雾区后效果还会残留 1.2 秒 —— 冲进去时便宜，退出来时还得再瞎一会儿。这雾不认人，自己站在里面一样会被致盲。储备 2 枚，按 50 秒回充。',
      cd: 50, charges: 2,
    },
    v: {
      name: '肾上腺素激活', short: '肾上腺素', tag: '小技能', kind: 'adr',
      desc: '放出一台增益无人机（原地悬停 15 秒，半径 12.75 米）：站在圈里的队友立刻提升开镜速度（-25%）、枪械操控，并压低受击枪口上抬与视野抖动；<b>前 10 秒还额外清掉装备带来的移速 / 开镜负面</b>，另附小幅移速加成（+8%）。<b>叠层</b>：buff 期间由蛊本人击杀敌人会 +1 层强度（每层再 +15%，最多 10 层），层数整局保留、倒地或阵亡清空，下次开 V 直接继承 —— 越打越强。CD 45 秒。',
      cd: 45, charges: 1, dur: 15,
    },
    x: {
      name: '流荧集群系统', short: '流荧集群', tag: '大招', kind: 'swarm',
      desc: '放出一群自动寻路的无人机（最远 55 米）：绕开障碍、自己找敌人，路上经过队友先给对方挂一份「肾上腺素」。<b>命中敌人</b>：视野模糊、听力大幅衰减，并持续压低生命上限（最低压到 10%，BOSS 压到 50%）；被缠住的敌人会<b>停火站桩、专心拔除</b>——小兵 3 秒、BOSS 2 秒拔完，<b>拔完 6 秒上限慢慢回满、被扣掉的血也一起还回来</b>。这段时间就是你上前的击杀窗口。CD 120 秒。',
      cd: 120, charges: 1,
    },
    passive: {
      name: '高效治疗', short: '高效治疗', tag: '被动', kind: 'medic',
      desc: '全队生效（同小队不限距离，蛊活着就有效）：打药、修甲、使用医疗消耗品的速度全部 +20%（读条 -20%，回血速率同步提高），救援动作也快 20%。没有冷却 —— 她什么都不用做，站着就是治疗加成。',
    },
  },
};

const OP_ORDER = ['redwolf', 'weilong', 'luna', 'beeser', 'uluru', 'nameless', 'gu'];

function opDef() { return OPERATORS[SAVE.operator] || null; }
/* 定位 → 色条分类：突击橙 / 侦察青 / 支援绿 / 工程黄（其它角色回退默认蓝灰） */
function roleClassOf(role) {
  if (!role) return '';
  if (role.includes('突击')) return 'assault';
  if (role.includes('侦察')) return 'recon';
  if (role.includes('支援')) return 'support';
  if (role.includes('工程')) return 'engineer';
  return '';
}
function exoOn() { return !!(P.op && P.op.x && P.op.x.on); }


/* 携行装备：弹挂 / 背包是仓库里的实体物品 —— 买一次永久拥有（SAVE.gearOwned 记账），
   但要在大厅整备界面「穿上」才生效（SAVE.worn 记当前穿的是哪件）。穿上之前：
   没有弹挂 = 弹挂 0 格（备弹没地方放），没有背包 = 背包 0 格。口袋是衣服自带的，永远 5 格（五个单格舱）。
   品质：白(基础) → 绿 → 蓝 → 紫 → 金 → 红，颜色沿用弹药档位色板。 */
const GEAR = {
  /* ── 弹挂（隔舱制：blocks = [格数,列数,(排断点:1=强制换行 2=强制同行)]，总和 = cap = 携带空间，
        排布逐件对照实物图：高度变化自动换行，同排高低舱混排用 2 压住。
        物品占格查 SHAPES 表（宽×高）：手枪 2、冲锋枪 3x2、短身步枪 4x2、标准步枪 / 精确射手 / 轻机枪 5x2、
        M870 4x2、狙击 5~7 横条，
        手术包 1~3 格，甲修包 2~4 格，护甲按等级（3 级 3x2 / 4 级 4x2 / 5·6 级 5x2），
        弹挂 2x2、背包 2x2（金红 3x2），
        配件按体积四档（见 MOD_FOOT）：小件 1x1 / 中件 2x1 / 长件 3x1 / 弹鼓 2x2（4 格）
        —— 必须整个塞进同一个隔舱的连续空格里。
        ads / spd = 瞄准速度 / 移动速度 修正（负数为惩罚，百分比）── */
  dar:      { name: 'DAR突击手胸挂',   kind: 'rig', cap: 24, price: 16000, q: '金', color: '#ffcc4d', ads: -5, spd: -1,
              blocks: [[2, 2], [2, 2], [4, 2], [4, 2], [3, 1], [3, 1], [6, 2]],
              desc: '二十四格突击手胸挂。两条双格弹匣袋、两个 2x2 大舱、两条竖弹匣舱加一个 2x3 弹链舱。' },
  heijiang: { name: '黑僵野战胸挂',     kind: 'rig', cap: 22, price: 12200, q: '金', color: '#ffcc4d', ads: -3, spd: -1,
              blocks: [[2, 1], [6, 2, 2], [2, 1, 2], [3, 1], [4, 2, 2], [3, 1, 2], [2, 2]],
              desc: '二十二格野战胸挂。上层双侧竖袋夹中央 2x3 弹链舱，中层两侧三格竖舱夹 2x2 杂物舱，底部横快取袋。' },
  jufeng:   { name: '飓风战术胸挂',     kind: 'rig', cap: 22, price: 10800, q: '金', color: '#ffcc4d', ads: -2,
              blocks: [[3, 1], [4, 2, 2], [3, 1, 2], [2, 1], [3, 1, 2], [3, 1], [2, 1, 2], [1, 1, 1], [1, 1]],
              desc: '二十二格战术胸挂。上层两侧三格竖舱夹中央 2x2，中层两条竖双格袋夹两条三格竖舱，底下两个零钱袋。' },
  gir:      { name: 'GIR野战胸挂',      kind: 'rig', cap: 20, price: 8800,  q: '紫', color: '#b782ff',
              blocks: [[4, 2], [4, 2], [3, 1], [3, 1], [3, 1], [3, 1]],
              desc: '二十格野战胸挂。两个 2x2 杂物舱配四条竖式弹匣舱（1x3），为压满弹匣而生的经典布局。' },
  drc:      { name: 'DRC先进侦察胸挂',  kind: 'rig', cap: 17, price: 6400,  q: '紫', color: '#b782ff',
              blocks: [[4, 2], [4, 2], [3, 1], [3, 1], [3, 1]],
              desc: '十七格先进侦察胸挂。两个 2x2 大舱加三条竖式弹匣舱，大舱小袋混排。' },
  raider:   { name: '突击者战术背心',   kind: 'rig', cap: 16, price: 5200,  q: '紫', color: '#b782ff', spd: -1,
              blocks: [[3, 1], [2, 1, 2], [2, 1, 2], [3, 1, 2], [2, 2, 1, 87], [4, 2, 1, 87]],
              desc: '十六格突击背心。两条竖弹匣舱、两个竖双格袋、一个居中的横快取袋加 2x2 杂物舱（都压在中线正下方）。' },
  xiqiang:  { name: '强袭战术背心',     kind: 'rig', cap: 14, price: 4000,  q: '蓝', color: '#4fa8ff', ads: -1,
              blocks: [[2, 1], [2, 1], [2, 1], [3, 1, 2], [3, 1], [1, 1, 2, -370, 112], [1, 1, 0, 0, 112]],
              desc: '十四格强袭背心。三条竖双格袋配两条三格竖舱，两个零钱袋挂在左边两条袋的正下方。' },
  g01:      { name: 'G01战术弹挂',      kind: 'rig', cap: 13, price: 3200,  q: '蓝', color: '#4fa8ff',
              blocks: [[2, 1], [3, 3, 2], [2, 1, 2], [2, 1, 1, 74], [2, 1], [2, 1]],
              desc: '十三格战术弹挂。顶层竖双格袋夹中央三格横排，底排三条竖双格袋对齐横排正下方。' },
  dsa:      { name: 'DSA战术胸挂',      kind: 'rig', cap: 12, price: 2600,  q: '蓝', color: '#4fa8ff',
              blocks: [[2, 2], [2, 2], [2, 1], [2, 1], [2, 1], [2, 1]],
              desc: '十二格战术胸挂。两个横双格袋配四条竖双格袋，六舱整整齐齐。' },
  hd3:      { name: 'HD3战术胸挂',      kind: 'rig', cap: 12, price: 2600,  q: '蓝', color: '#4fa8ff',
              blocks: [[3, 1], [2, 1, 2], [2, 1, 2], [3, 1, 2], [2, 2, 2, -222, 114]],
              desc: '十二格战术胸挂。两条三格竖弹匣舱夹两条竖双格袋，底行中缝一条横快取袋。' },
  jyd:      { name: '简易携行弹挂',     kind: 'rig', cap: 10, price: 1700,  q: '蓝', color: '#4fa8ff',
              blocks: [[1, 1], [1, 1, 2, -74, 66], [2, 1, 2], [2, 1, 2], [1, 1, 2], [1, 1, 2, -74, 66], [2, 2, 2, -222, 114]],
              desc: '十格简易弹挂。民兵训练款，中缝两条竖双格袋夹两列零钱小袋，底下一条横快取袋。' },
  ty:       { name: '通用战术胸挂',     kind: 'rig', cap: 9,  price: 1300,  q: '绿', color: '#63d68a',
              blocks: [[2, 1], [2, 1], [2, 1], [1, 1], [2, 2]],
              desc: '九格通用胸挂。三条竖双格袋配一个零钱袋和一个横快取袋。' },
  d01:      { name: 'D01轻型弹挂',      kind: 'rig', cap: 8,  price: 800,   q: '白', color: '#dfe9f2',
              blocks: [[1, 1], [2, 1, 2], [2, 1, 2], [2, 1, 2], [1, 1, 2, -296, 64]],
              desc: '八格轻型弹挂。入门标准款，左边上下两个零钱袋，右边三条竖双格袋。' },
  hk3:      { name: 'HK3便携胸挂',      kind: 'rig', cap: 8,  price: 800,   q: '白', color: '#dfe9f2',
              blocks: [[1, 1, 0, 74], [1, 1, 2, 74], [2, 1, 0, 74], [2, 1, 2, 74], [1, 1, 2, 0, 48, -222], [1, 1, 2, -148, 48]],
              desc: '八格便携胸挂。两条竖双格袋顶天立地，顶上各压一个零钱袋，脚下两侧还各挂一个。' },
  nylon:    { name: '尼龙挎包',         kind: 'rig', cap: 8,  price: 1000,  q: '绿', color: '#63d68a',
              blocks: [[1, 1], [1, 1, 2, -74, 66], [1, 1, 2, -74, 132], [2, 1, 2], [1, 1, 2], [1, 1, 2, -74, 66], [1, 1, 2, -74, 132]],
              desc: '八格尼龙挎包。斜挎式老古董，中缝一条竖双格袋，两侧各挂三个独立零钱小袋。' },
  gzd:      { name: '简易挂载包',       kind: 'rig', cap: 6,  price: 600,   q: '白', color: '#dfe9f2',
              blocks: [[2, 1], [1, 1, 2], [1, 1, 2], [1, 1, 2, -148, 64], [1, 1, 0, 0, 64]],
              desc: '六格挂载包。左边一条竖双格袋，右边两列各叠两个零钱小袋，缝线歪歪扭扭但轻。' },
  qxs:      { name: '轻型战术胸挂',     kind: 'rig', cap: 6,  price: 500,   q: '白', color: '#dfe9f2',
              blocks: [[1, 1], [1, 1, 2, -74, 66], [2, 1, 2], [1, 1, 2], [1, 1, 2, -74, 66]],
              desc: '六格轻型胸挂。中缝一条竖双格袋，两侧各挂两个独立零钱小袋，轻得像没穿。' },
  scout:    { name: '快速侦察胸挂',     kind: 'rig', cap: 6,  price: 500,  q: '白', color: '#dfe9f2',
              blocks: [[1, 1], [1, 1], [1, 1], [1, 1, 1], [1, 1], [1, 1]],
              desc: '六格侦察胸挂。六个独立零钱小袋贴身两排收拢，跑起来不晃不响。' },
  bxb:      { name: '便携胸包',         kind: 'rig', cap: 6,  price: 500,   q: '白', color: '#dfe9f2',
              blocks: [[1, 1], [1, 1], [1, 1], [1, 1, 1], [1, 1], [1, 1]],
              desc: '六格胸包。街头货色改的战场款，六个独立小袋两排排开，拉链头换成了伞绳。' },
  /* ── 背包（26 件，按三角洲实物布局；[格数,列数] 指定每舱横竖）── */
  pack_sling:  { name: '斜挎包',           kind: 'pack', cap: 6,  price: 600,   q: '白', color: '#dfe9f2',
                 blocks: [[6, 2]],
                 desc: '六格斜挎包。两列窄仓贴身一挂，装点绷带弹药刚够跑一趟短的。' },
  pack_sport:  { name: '运动背包',         kind: 'pack', cap: 8,  price: 1000,  q: '白', color: '#dfe9f2',
                 blocks: [[8, 2]],
                 desc: '八格运动背包。健身房同款，拉绳束口，搜东西得把整个包翻开。' },
  pack_travel: { name: '旅行背包',         kind: 'pack', cap: 10, price: 1300,  q: '白', color: '#dfe9f2',
                 blocks: [[10, 2]],
                 desc: '十格旅行背包。竖长的主仓一次吞两条竖着的物资，出门十分能装。' },
  pack_canvas: { name: '帆布背囊',         kind: 'pack', cap: 10, price: 1300,  q: '白', color: '#dfe9f2',
                 blocks: [[10, 5]],
                 desc: '十格帆布背囊。又宽又扁的老式背囊，横着铺开塞扁平物件正好。' },
  pack_outdoor:{ name: '轻型户外背包',     kind: 'pack', cap: 12, price: 1900,  q: '绿', color: '#63d68a',
                 blocks: [[12, 3]],
                 desc: '十二格轻型户外包。三列主仓透气网背，徒步爱好者的入门选择。' },
  pack_dgsport:{ name: 'DG运动背包',       kind: 'pack', cap: 12, price: 1900,  q: '绿', color: '#63d68a',
                 blocks: [[12, 4]],
                 desc: '十二格运动背包。四列宽仓，装球鞋的包现在装战术物资。' },
  pack_bolt:   { name: '战术快拆背包',     kind: 'pack', cap: 15, price: 2400,  q: '绿', color: '#63d68a',
                 blocks: [[15, 3]],
                 desc: '十五格快拆背包。快拆扣具一扯就脱，落地交火前先扔包再拔枪。' },
  pack_raidpk: { name: '突袭战术背包',     kind: 'pack', cap: 15, price: 2400,  q: '绿', color: '#63d68a',
                 blocks: [[15, 3]],
                 desc: '十五格突袭背包。突击单位标配，三列窄仓深，长条物件好归位。' },
  pack_camp:   { name: '露营背包',         kind: 'pack', cap: 15, price: 2400,  q: '绿', color: '#63d68a',
                 blocks: [[15, 5]],
                 desc: '十五格露营背包。宽扁五列大仓，露营装备和战利品都能平铺。' },
  pack_bigmtn: { name: '大型登山包',       kind: 'pack', cap: 16, price: 3000,  q: '绿', color: '#63d68a',
                 blocks: [[2, 2], [2, 2], [12, 4]],
                 desc: '十六格大型登山包。顶袋两个 2x2 小仓，下方 4x3 主仓压着重心。' },
  pack_3h:     { name: '3H战术背包',       kind: 'pack', cap: 18, price: 3600,  q: '蓝', color: '#4fa8ff',
                 blocks: [[18, 3]],
                 desc: '十八格 3H 战术包。三列深仓模块化内衬，军规面料防水耐磨。' },
  pack_ga:     { name: 'GA野战背包',       kind: 'pack', cap: 20, price: 4500,  q: '蓝', color: '#4fa8ff',
                 blocks: [[20, 5]],
                 desc: '二十格 GA 野战背包。五列宽仓野战标准款，能横着吞整支卡宾枪。' },
  pack_dash:   { name: 'DASH战术背包',     kind: 'pack', cap: 20, price: 4500,  q: '蓝', color: '#4fa8ff',
                 blocks: [[4, 2], [4, 2], [12, 4]],
                 desc: '二十格 DASH 战术包。顶仓两个 2x2 快取袋，主仓 4x3 装大头。' },
  pack_jungle: { name: '雨林猎手背包',     kind: 'pack', cap: 21, price: 5000,  q: '蓝', color: '#4fa8ff',
                 blocks: [[21, 3]],
                 desc: '二十一格雨林猎手包。三列超深竖仓，雨林渗透七天不掉链子。' },
  pack_d2:     { name: 'D2战术登山包',     kind: 'pack', cap: 24, price: 6200,  q: '紫', color: '#b782ff',
                 blocks: [[24, 4]],
                 desc: '二十四格 D2 登山包。四列大主仓带铝合金骨架，重装也压得住。' },
  pack_march:  { name: '野战徒步背包',     kind: 'pack', cap: 24, price: 6200,  q: '紫', color: '#b782ff',
                 blocks: [[20, 4], [2, 2], [2, 2]],
                 desc: '二十四格野战徒步包。4x5 主仓加两个 2x1 侧袋，长途行军好搭档。' },
  pack_map:    { name: 'MAP侦察背包',      kind: 'pack', cap: 24, price: 6200,  q: '紫', color: '#b782ff',
                 blocks: [[16, 4], [4, 2], [4, 2]],
                 desc: '二十四格 MAP 侦察包。4x4 地图主仓加两个 2x2 附仓，侦察特供。' },
  pack_gt1:    { name: 'GT1户外登山包',    kind: 'pack', cap: 25, price: 6800,  q: '紫', color: '#b782ff',
                 blocks: [[25, 5]],
                 desc: '二十五格 GT1 登山包。五列方正大仓，老练登山客的万能容量。' },
  pack_d3:     { name: 'D3战术登山包',     kind: 'pack', cap: 28, price: 8000,  q: '紫', color: '#b782ff',
                 blocks: [[28, 4]],
                 desc: '二十八格 D3 登山包。四列七行深仓，垂直补给单位的重载选择。' },
  pack_hls:    { name: 'HLS-2重型背包',    kind: 'pack', cap: 28, price: 8000,  q: '金', color: '#ffcc4d',
                 blocks: [[3, 1], [6, 2], [3, 1], [16, 4]],
                 desc: '二十八格 HLS-2 重型包。顶袋 1x3 / 2x3 / 1x3 错落排布，下接 4x4 主仓。' },
  pack_als:    { name: 'ALS背负系统',      kind: 'pack', cap: 28, price: 8000,  q: '金', color: '#ffcc4d',
                 blocks: [[20, 4], [2, 2], [2, 2], [2, 2, 1], [2, 2]],
                 desc: '二十八格 ALS 背负系统。模块化装载理念：4x5 主仓外挂四个 2x1 附包（分两排）。' },
  pack_surv:   { name: '生存战术背包',     kind: 'pack', cap: 28, price: 8000,  q: '紫', color: '#b782ff',
                 blocks: [[6, 2], [6, 2], [4, 2, 1], [4, 2], [4, 2, 1], [4, 2]],
                 desc: '二十八格生存背包。六个 2 宽分舱三排码放，物资分类一目了然，末日生存派最爱。' },
  pack_gt5:    { name: 'GT5野战背包',      kind: 'pack', cap: 30, price: 10500, q: '金', color: '#ffcc4d',
                 blocks: [[30, 5]],
                 desc: '三十格 GT5 野战背包。五列六行的整仓巨胃，一次出击的极限容量。' },
  pack_d7:     { name: 'D7战术背包',       kind: 'pack', cap: 35, price: 14000, q: '金', color: '#ffcc4d',
                 blocks: [[35, 5]],
                 desc: '三十五格 D7 战术背包。五列七行旗舰装载，背它的人从不空手而归。' },
  pack_heavymtn:{ name: '重型登山包',      kind: 'pack', cap: 40, price: 19000, q: '红', color: '#ff7a9c',
                 blocks: [[2, 1], [6, 3], [2, 1], [30, 5]],
                 desc: '四十格重型登山包。顶袋 1x2 / 3x2 / 1x2 一排，下方 5x6 主仓吞天吞地。' },
  pack_gto:    { name: 'GTO重型战术包',    kind: 'pack', cap: 45, price: 24000, q: '红', color: '#ff7a9c',
                 blocks: [[45, 5]],
                 desc: '四十五格 GTO 重型战术包。五列九行的最终答案，装下一整次战役。' },
};

/* ── 随身容器 ──
   弹挂 rig（快捷可用：按 5 打药、R 换弹都从这儿读）—— 格数 = 穿着的弹挂
   口袋 pocket（快捷可用）—— 固定五个独立单格舱，只能装 1 格的小件（绷带 / 针 / 弹药）
   背包 pack（仓库格：Tab 打开倒腾，里面的东西不能直接用）—— 格数 = 穿着的背包
   格子 = null 或 { t:'med'|'stop'|'surg'|'ammo', ... }，一格一件（弹药格按口径装）。 */
const POCKET_BLOCKS = [1, 1, 1, 1, 1];    // 口袋固定：五个独立单格舱（不可升级）
function wornGear(kind) {
  const k = SAVE.worn && SAVE.worn[kind];
  return (k && GEAR[k] && GEAR[k].kind === kind) ? GEAR[k] : null;
}
function gearOwnedOf(key) { return !!(SAVE.gearOwned && SAVE.gearOwned[key]); }
/* 背包格子里存着的同款装备件数：这些件数已算在 gearOwned 里，但不算「仓库备用」。
   局内看 P.rig / P.pack（living 数组），大厅看 SAVE.carry（存档数组）—— 两边不同步，不能混着数。 */
function carriedGearCount(key) {
  let n = 0;
  const inRaid = typeof G !== 'undefined' && G && (G.scene === 'playing' || G.scene === 'paused');
  const zones = inRaid
    ? allCarryZones()
    : (SAVE && SAVE.carry ? [SAVE.carry.rig, SAVE.carry.pocket, SAVE.carry.pack] : []);
  for (const arr of zones) {
    if (!Array.isArray(arr)) continue;
    for (const c of arr) if (c && !c.cont && c.t === 'gear' && c.key === key) n++;
  }
  return n;
}
/* 穿着的弹挂带来的修正：ads = 瞄准速度 %（负 = 抬枪更慢），spd = 移动速度 %（负 = 更慢） */
function rigWornMods() {
  const g = wornGear('rig');
  return { ads: (g && g.ads) || 0, spd: (g && g.spd) || 0 };
}
function rigCap() { const g = wornGear('rig'); return g ? g.cap : 0; }
function packCap() { const g = wornGear('pack'); return g ? g.cap : 0; }
/* 口袋隔舱布局（只在运行期调：loadSave 不经过这里，无 TDZ 风险） */
function pocketBlocks() { return POCKET_BLOCKS; }
function pocketCap() { const b = pocketBlocks(); let n = 0; for (const x of b) n += x; return n; }

/* 存档读取点：必须放在它依赖的最后一张数据表（GEAR / REPAIRS）之后，
   否则清洗函数会踩 const TDZ 抛错、被 loadSave 的 catch 吞掉 → 每次刷新存档全没。 */
let SAVE = loadSave();

/* 一格备弹的容量：这个口径下已拥有枪里弹匣最大的那把 × 2 发 */
function ammoCellCap(cal, owned) {
  let mag = 0;
  for (const id of WEAPON_ORDER) {
    if (owned && !owned[id]) continue;
    if (calOfWeapon(id) !== cal) continue;
    mag = Math.max(mag, weaponStats(id).mag || 0);
  }
  return Math.max(20, mag * 2);
}
/* 局内算弹格上限用「仓库里拥有的枪 ∪ 这一局带进来的枪」。
   只认 P.owned（仅本局携带）的话，没带这个口径的枪上限就被压到 20，
   跟背包里已有的 60 发格子对不上，堆叠永远合不拢。 */
function ownedMapLive() {
  const out = {};
  if (typeof SAVE !== 'undefined' && SAVE.owned) Object.assign(out, SAVE.owned);
  if (typeof P !== 'undefined' && P.owned) Object.assign(out, P.owned);
  return out;
}
function emptyCells(n) { const a = []; for (let i = 0; i < n; i++) a.push(null); return a; }
function emptyCarry() { return { rig: emptyCells(rigCap()), pocket: emptyCells(pocketCap()), pack: emptyCells(packCap()) }; }

/* 格子清洗：未知物品 / 超上限的数值一律砍掉，返回合法格子或 null。
   rot（自动朝向标记）在多格物品上原样保留 —— 读档后摆放和渲染都要用它。 */
function cellValid(c) {
  const o = cellValidBase(c);
  if (o && c.rot && o.cont !== 1) o.rot = 1;
  return o;
}
function cellValidBase(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.t === 'med' && MEDKITS[c.id]) {
    const left = Number(c.left);
    return { t: 'med', id: c.id, left: clamp(left > 0.01 ? left : MEDKITS[c.id].dur, 0, MEDKITS[c.id].dur) };
  }
  if (c.t === 'repair' && REPAIRS[c.id]) {
    const left = Number(c.left);
    return { t: 'repair', id: c.id, left: clamp(left > 0.01 ? left : REPAIRS[c.id].dur, 0, REPAIRS[c.id].dur) };
  }
  if (c.t === 'stop' && STOPS[c.id]) {           // 瓶装类：n 是格子里剩几片（老档没有 = 1）
    const cap = Math.max(1, (STOPS[c.id].uses | 0) || 1);
    return { t: 'stop', id: c.id, n: clamp(Math.floor(Number(c.n)) || 1, 1, cap) };
  }
  if (c.t === 'surg' && SURGERIES[c.id]) {
    return { t: 'surg', id: c.id, uses: clamp(Math.floor(Number(c.uses)) || 0, 0, SURGERIES[c.id].uses) };
  }
  if (c.t === 'ammo' && CALIBERS[c.cal]) {
    let lv = Math.floor(Number(c.lv));
    if (!Number.isFinite(lv) || !calHasTier(c.cal, lv)) lv = defaultTierOf(c.cal);
    const cap = ammoCellCap(c.cal, SAVE.owned);
    return { t: 'ammo', cal: c.cal, lv, n: clamp(Math.floor(Number(c.n)) || 0, 0, cap) };
  }
  if (c.t === 'relic' && RELICS[c.id]) return { t: 'relic', id: c.id };
  if (c.t === 'mod' && MODS[c.id]) return { t: 'mod', id: c.id };
  if (c.t === 'gun' && WEAPONS[c.id]) return { t: 'gun', id: c.id };
  /* 护甲成了能捡、能塞背包、能带出去的实体件：id 记目录编号，hp / max 记这件自己的耐久 */
  if (c.t === 'armor') {
    const A = ARMORS[Math.floor(Number(c.id))];
    if (!A || A.lv <= 0) return null;
    const m = clamp(Math.max(1, Math.round(Number(c.max)) || A.hp), 1, A.hp);
    return { t: 'armor', id: A.id, hp: clamp(Math.round(Number(c.hp)) || 0, 0, m), max: m };
  }
  /* 弹挂 / 背包格子：key 必须在 GEAR 里；里面装的东西（cells）逐件复核 */
  if (c.t === 'gear' && GEAR[c.key]) {
    const o = { t: 'gear', key: c.key };
    if (Array.isArray(c.cells)) o.cells = c.cells.map(cellValid).filter(Boolean);
    return o;
  }
  return null;
}

/* 溢出格子回仓库：医疗包 / 止血止痛 / 手术次数 / 弹药发数 */
function mergeCarryOverflow(S, overflow) {
  if (!overflow || !overflow.length) return;
  for (const c of overflow) {
    if (c.t === 'med') {
      const s = S.meds[c.id] || (S.meds[c.id] = { n: 0, left: 0 });
      s.n = Math.min(99, (s.n | 0) + 1);
    } else if (c.t === 'repair') {
      const s = S.repairs[c.id] || (S.repairs[c.id] = { n: 0, left: 0 });
      s.n = Math.min(99, (s.n | 0) + 1);
    } else if (c.t === 'stop') {
      S.stops[c.id] = Math.min(99, ((S.stops[c.id] | 0) + ((c.n | 0) || 1)));
    } else if (c.t === 'surg') {
      const s = S.surgs[c.id] || (S.surgs[c.id] = { uses: 0 });
      s.uses = Math.min(SURGERIES[c.id].uses, (s.uses | 0) + c.uses);
    } else if (c.t === 'ammo') {
      addAmmoStock(c.cal, c.lv, c.n);
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
    /* gear：件数一直记在 gearOwned 里（穿着 / 包里 / 备用都算），格子腾出来就等于回到备用列表，
       这里什么都不用做；gun：所有权本来就记在 SAVE.owned 里，格子装不下就丢弃，枪还在军火库 */
  }
}

/* 携行装备所有权清洗：老档旧弹挂 key 经 RIG_KEY_MIGRATE 迁移、旧背包 key 经 PACK_KEY_MIGRATE 迁移
   （件数并入目标 key）。新档 key 全量保留（多实例按件计数）。注意：loadSave 在 GEAR 表初始化之前执行，
   这里只许用字面量 key —— 新增装备时记得把 key 加进 GEAR_KEYS。 */
function cleanGearOwned(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const k of GEAR_KEYS) {
      const n = raw[k] | 0;
      if (n > 0) out[k] = Math.min(99, n);
    }
    /* 老弹挂 key → 新 key（件数并入，容量就近） */
    for (const ok in RIG_KEY_MIGRATE) {
      const n = raw[ok] | 0;
      if (n > 0) out[RIG_KEY_MIGRATE[ok]] = Math.min(99, (out[RIG_KEY_MIGRATE[ok]] | 0) + n);
    }
    /* 旧背包 key → 新 key（件数并入，容量就近） */
    for (const ok in PACK_KEY_MIGRATE) {
      const n = raw[ok] | 0;
      if (n > 0) out[PACK_KEY_MIGRATE[ok]] = Math.min(99, (out[PACK_KEY_MIGRATE[ok]] | 0) + n);
    }
  }
  if (!(out.d01 > 0)) out.d01 = 1;                     // 新档 / 老档都保底一件入门弹挂
  return out;
}

/* 穿戴状态清洗：只能穿自己拥有的那件。老档没有 worn 字段 → 自动穿上
   拥有的最好的一套，别让老玩家裸奔。 */
function cleanWorn(raw, gear) {
  const out = { rig: null, pack: null };
  if (raw && typeof raw === 'object') {
    const rk = RIG_KEY_MIGRATE[raw.rig] || raw.rig;      // 老弹挂 key 搬到新 key
    if (rk && gear[rk]) out.rig = rk;
    const pk = PACK_KEY_MIGRATE[raw.pack] || raw.pack;   // 旧背包 key 搬到新 key
    if (pk && gear[pk]) out.pack = pk;
    return out;
  }
  /* 老档没有 worn：自动穿上拥有的最好的弹挂（按字面量顺序，从好到差），别让老玩家裸奔 */
  for (const k of ['dar', 'heijiang', 'jufeng', 'gir', 'drc', 'raider', 'xiqiang', 'g01', 'dsa', 'hd3',
    'jyd', 'ty', 'hk3', 'nylon', 'd01', 'gzd', 'qxs', 'scout', 'bxb']) {
    if (gear[k]) { out.rig = k; break; }
  }
  /* 背包同理：按容量从好到差挑一件拥有的穿上 */
  for (const k of ['pack_gto', 'pack_heavymtn', 'pack_d7', 'pack_gt5', 'pack_d3', 'pack_hls', 'pack_als',
    'pack_surv', 'pack_gt1', 'pack_d2', 'pack_march', 'pack_map', 'pack_jungle', 'pack_ga', 'pack_dash',
    'pack_3h', 'pack_bigmtn', 'pack_camp', 'pack_bolt', 'pack_raidpk', 'pack_outdoor', 'pack_dgsport',
    'pack_travel', 'pack_canvas', 'pack_sport', 'pack_sling']) {
    if (gear[k]) { out.pack = k; break; }
  }
  return out;
}

/* 护甲改「件」制：armorPieces = [{ id, hp, max }, ...]，wornPiece = 身上那件（或 null）。
   id 是 ARMORS 目录编号（同一甲级有多件具名甲）。
   老档语义兼容：旧件记 { lv(甲级), hp, max }（无 id 字段）—— 按甲级映射到最接近的新甲，
   耐久 / 上限按新甲满耐久等比缩放（保住磨损状态）；新档记 { id, hp, max } 原样收下。 */
function cleanArmor(d) {
  /* 旧六级通用甲 → 新具名甲的映射（旧 lv1/2 已取消，就近并入 3 级）
     注意旧表满耐久要查 OLD_HP：现在的 ARMORS 已经是新目录，不能拿旧 lv 当下标 */
  const OLD2NEW = { 1: 3, 2: 1, 3: 2, 4: 6, 5: 12, 6: 14 };
  const OLD_HP = { 1: 60, 2: 90, 3: 130, 4: 170, 5: 220, 6: 300 };
  const pieces = [];
  let worn = null;
  const push = (aid, hp, max) => {
    const A = ARMORS[aid | 0];
    if (!A || A.lv <= 0) return;
    const m = Math.max(1, Math.round(max != null ? max : A.hp));
    pieces.push({ id: A.id, hp: clamp(Math.round(hp != null ? hp : A.hp), 0, m), max: m });
  };
  /* 旧件 { lv, hp, max } → 新件：换目录 id + 耐久等比缩放 */
  const pushOld = (lv, hp, max) => {
    const oldHp = OLD_HP[lv | 0];
    const newA = ARMORS[OLD2NEW[lv | 0]];
    if (!oldHp || !newA || newA.lv <= 0) return;
    const k = newA.hp / oldHp;
    const m = Math.max(1, Math.min(newA.hp, Math.round((max != null ? max : oldHp) * k)));
    push(newA.id, clamp(Math.round((hp != null ? hp : oldHp) * k), 0, m), m);
  };
  const pieceIsNew = p => p && typeof p === 'object' && p.id != null && ARMORS[p.id | 0] && ARMORS[p.id | 0].lv > 0;
  if (Array.isArray(d.armorPieces)) {
    for (const p of d.armorPieces.slice(0, 36)) {
      if (!p || typeof p !== 'object') continue;
      if (pieceIsNew(p)) push(p.id, p.hp, p.max);
      else pushOld(p.lv, p.hp, p.max);            // 老语义：lv 记甲级
    }
  } else if (d.armorStash && typeof d.armorStash === 'object') {
    /* 更老的档：armorStash { 甲级: 件数 } → 按旧表满耐久展开再映射 */
    for (let t = 1; t <= 6; t++) {
      const n = Math.min(9, Math.max(0, Math.floor(Number(d.armorStash[t])) || 0));
      for (let k = 0; k < n; k++) pushOld(t);
    }
    const wl = Math.floor(Number(d.wornArmor)) || 0;
    const k = wl ? pieces.findIndex(pc => pc.id === OLD2NEW[wl]) : -1;
    if (k >= 0) worn = pieces.splice(k, 1)[0];
  } else {
    /* 最老的档：armorMax = 护甲等级上限，equippedArmor = 穿的那级 —— 每级补一件 */
    const mx = d.armorMax | 0;
    for (let t = 1; t <= 6; t++) if (t <= mx) pushOld(t);
    const wl = d.equippedArmor | 0;
    const k = wl ? pieces.findIndex(pc => pc.id === OLD2NEW[wl]) : -1;
    if (k >= 0) worn = pieces.splice(k, 1)[0];
  }
  if (!worn && d.wornPiece && typeof d.wornPiece === 'object') {
    if (pieceIsNew(d.wornPiece)) {
      push(d.wornPiece.id, d.wornPiece.hp, d.wornPiece.max);
      worn = pieces.pop();
    } else if (OLD_HP[d.wornPiece.lv | 0]) {
      const oldLv = d.wornPiece.lv | 0;
      const newA = ARMORS[OLD2NEW[oldLv]];
      const k = newA.hp / OLD_HP[oldLv];
      const m = Math.max(1, Math.min(newA.hp, Math.round((Number(d.wornPiece.max) || OLD_HP[oldLv]) * k)));
      worn = { id: newA.id, hp: clamp(Math.round((Number(d.wornPiece.hp) || OLD_HP[oldLv]) * k), 0, m), max: m };
    }
  }
  if (worn && !(ARMORS[worn.id] && ARMORS[worn.id].lv >= 1)) worn = null;
  return { pieces, worn };
}

/* 头盔清算：只认表里存在的 id（0 = 不戴），件数夹在 0-9；头上那顶不在库存里就当没戴 */
function cleanHelmets(d) {
  const owned = {};
  const raw = d && d.helmetOwned;
  if (raw && typeof raw === 'object') {
    for (const k in raw) {
      const id = k | 0;
      const n = Math.min(9, Math.max(0, Math.floor(Number(raw[k])) || 0));
      if (HELMETS[id] && HELMETS[id].lv > 0 && n > 0) owned[id] = n;
    }
  }
  let worn = d ? (d.wornHelmet | 0) : 0;
  if (!worn || !HELMETS[worn] || HELMETS[worn].lv <= 0 || !owned[worn]) worn = null;
  return { owned, worn };
}

/* loadSave 阶段只留原始结构 —— 数据表（WEAPON_ORDER 等）在这之后才初始化，
   格子的真正清洗放到 ensureCarry()（大厅渲染 / 出击前的运行期）里做。 */
function rawCarry(v) {
  if (!v || typeof v !== 'object') return null;
  if (!Array.isArray(v.rig) || !Array.isArray(v.pocket) || !Array.isArray(v.pack)) return null;
  return { rig: v.rig.slice(), pocket: v.pocket.slice(), pack: v.pack.slice() };
}

/* 懒初始化 / 懒清洗随身容器（大厅渲染与出击前都会调）：
   老档没有 carry → 按默认布局从仓库抓一份；有 carry → 逐格校验、按当前容量截断，
   装不下的格子原物回仓，别凭空消失。 */
function ensureCarry() {
  if (SAVE.carry && Array.isArray(SAVE.carry.rig)) {
    const overflow = [];
    const zones = [['rig', SAVE.carry.rig, rigCap()], ['pocket', SAVE.carry.pocket, pocketCap()], ['pack', SAVE.carry.pack, packCap()]];
    for (const [z, arr, cap] of zones) {
    /* cont 占位格也要原样留下：cellValid 只认「真物品」，会把占位格判成 null，
       多格物品（枪 / 药箱 / 手术包）的占位一丢，格子就被当成空的、能被别的东西压上去 */
    const valid = arr.map(c => (c && c.cont) ? { cont: 1, head: c.head | 0 } : cellValid(c));
    arr.length = cap;
    for (let i = 0; i < cap; i++) arr[i] = valid[i] || null;
    const blocks = zoneBlocks(z);
    /* 坏档清洗：弹挂 / 口袋里不该有装备格；背包里不该再套「穿着中的这只背包」自己（自己装自己会坏档，东西凭空消失）。
       背包里存弹挂 / 另一只背包是合法的，保留。 */
    for (let i = 0; i < cap; i++) {
      const c = arr[i];
      if (c && !c.cont && c.t === 'gear' && (z !== 'pack' || c.key === SAVE.worn.pack)) {
        overflow.push(c); clearSpanAt(arr, i, blocks);
      }
    }
    sanitizeSpans(arr, blocks);
    /* 占格规则改过（枪 4→2/6、药箱 1→4、DEK 2→4…）：老档里对不上的矩形整舱重排，摆不下的回仓 */
    const ov = reflowZone(arr, blocks);
    if (ov) for (const c of ov) overflow.push(c);
    for (let i = cap; i < valid.length; i++) if (valid[i] && !valid[i].cont) overflow.push(valid[i]);
    }
    /* 口袋一律是五个单格舱：老档（含买过扩展板的 6 格档）里多格大件（手术包 / 修理包 / 近战）塞不下，原物退回仓库 */
    {
      const pk = SAVE.carry.pocket;
      for (let i = 0; i < pk.length; i++) {
        const c = pk[i];
        if (c && !c.cont && cellSize(c) > 1) { overflow.push(c); clearSpanAt(pk, i, zoneBlocks('pocket')); }
      }
      sanitizeSpans(pk, zoneBlocks('pocket'));
    }
    mergeCarryOverflow(SAVE, overflow);
    if (overflow.length) saveGame();
    return SAVE.carry;
  }
  const carry = emptyCarry();
  /* 口袋：先塞两支绷带 */
  for (let i = 0; i < 2 && i < pocketCap(); i++) {
    if (((SAVE.stops && SAVE.stops.bandage) | 0) > 0) {
      SAVE.stops.bandage--;
      carry.pocket[i] = { t: 'stop', id: 'bandage' };
    }
  }
  /* 弹挂：一支简易针 + 每个有枪有弹的口径一格备弹（都从仓库真扣）。
     没穿弹挂 = 弹挂 0 格，什么都不抓，仓库里的原封不动。 */
  if (((SAVE.meds && SAVE.meds[STARTER_MEDKIT] && SAVE.meds[STARTER_MEDKIT].n) | 0) > 0 && rigCap() > 0) {
    SAVE.meds[STARTER_MEDKIT].n--;
    carry.rig[0] = { t: 'med', id: STARTER_MEDKIT, left: MEDKITS[STARTER_MEDKIT].dur };
  }
  let ai = 1;
  for (const cal of CAL_ORDER) {
    if (ai >= rigCap()) break;
    const hasGun = WEAPON_ORDER.some(id => SAVE.owned[id] && calOfWeapon(id) === cal);
    if (!hasGun) continue;
    const lv = ammoPickOf(cal);
    const take = takeAmmoStock(cal, lv, Math.min(ammoCellCap(cal, SAVE.owned), ammoStock(cal, lv)));
    if (take <= 0) continue;
    carry.rig[ai++] = { t: 'ammo', cal, lv, n: take };
  }
  SAVE.carry = carry;
  saveGame();
  return carry;
}

/* 容量变化后（换了弹挂 / 背包）把格子数组补齐/截断，溢出回仓；顺手清孤儿占位 */
function trimCarryToCap() {
  if (!SAVE.carry) return;
  const c = SAVE.carry;
  const zones = [['rig', c.rig, rigCap()], ['pocket', c.pocket, pocketCap()], ['pack', c.pack, packCap()]];
  for (const [z, arr, cap] of zones) {
    const overflow = [];
    while (arr.length < cap) arr.push(null);
    while (arr.length > cap) { const x = arr.pop(); if (x && !x.cont) overflow.push(x); }
    const blocks = zoneBlocks(z);
    sanitizeSpans(arr, blocks);
    const ov = reflowZone(arr, blocks);        // 换装后隔舱布局变了：装不下的重排回仓
    if (ov) for (const x of ov) overflow.push(x);
    mergeCarryOverflow(SAVE, overflow);
  }
}


const ENEMY_TYPES = {
  /* 阿萨拉小兵：全家最小的个头、跑得最快，边冲边短点射，贴脸还有一记近身 */
  /* 突击兵是全线唯一无甲的：RIP 修脚弹就是给他们准备的 */
  runner:  { hp: 34,  r: 11, speed: 134, dmg: 9,  score: 12,  armor: 0, pen: 1,
             color: '#ff4d6d', glow: '#ff2d55', shape: 'tri',
             sight: 320, fov: 1.0,
             burst: { n: 3, gap: 0.11, dmg: 5.2, spd: 560, spread: 0.055, cd: [1.9, 2.7], range: 520 } },
  /* 阿萨拉盾兵：中等身板，正面一块厚盾挡子弹（能被打碎），盾后探头点射 */
  shooter: { hp: 34,  r: 17, speed: 83, dmg: 8,  score: 22,  armor: 2,  pen: 1, color: '#ffa23a', glow: '#ff8a1f', shape: 'sq',
             sight: 350, fov: 0.9, keep: 300, shield: 120, shieldArc: 0.78,
             burst: { n: 2, gap: 0.18, dmg: 6.5, spd: 560, spread: 0.045, cd: [2.1, 2.9], range: 620 } },
  /* 阿萨拉机枪兵：大块头、慢吞吞，一挺加特林先转后喷，血厚得像堵墙 */
  brute:   { hp: 280, r: 29, speed: 46,  dmg: 24, score: 48,  armor: 4,  pen: 2, color: '#b46bff', glow: '#a040ff', shape: 'hex',
             sight: 300, fov: 1.15, keep: 330,
             gat: { spin: 0.55, rounds: 20, rate: 0.075, cd: [2.1, 3.1],
                    spd: 780, dmg: 6, spread: 0.05, bloom: 0.05, range: 820 } },
  /* BOSS「赤霄」：守着据点不动窝，扛一挺重机枪打压制，燃烧瓶封锁走位，翻滚拉开距离 */
  boss:    { hp: 1400, r: 44, speed: 77, dmg: 36, score: 450,  armor: 5, pen: 3, color: '#ff2d55', glow: '#ff0040', shape: 'boss',
             sight: 520, fov: 1.45, keep: 330, leash: 260,
             // 重机枪：预热 → 长点射 → 过热冷却；后坐力会让弹道越打越散
             hmg: { spin: 0.44, rounds: 26, rate: 0.05, cd: [2.6, 3.6],
                    spd: 900, dmg: 9, spread: 0.028, bloom: 0.075, range: 900 },
             molotovCd: [7.2, 9.6], rollCd: [3.8, 5.2], rollSpd: 470, rollTime: 0.34 },

  /* BOSS「安全总监」（哈夫克专属）：M700 狙击、连发狙、放自爆小车、
     无人作战小车护卫、发现干员就呼叫增援并持续标记位置一分钟。
     每局在航天基地核心控制区随机位置出生（不走增援波）。 */
  director: { hp: 1050, r: 32, speed: 64, dmg: 22, score: 520, armor: 5, pen: 5, color: '#ffb02e', glow: '#ff7a1f', shape: 'dir',
              sight: 680, fov: 1.4, keep: 430, leash: 320,
              // M700：激光锁定 1.05 秒 → 三连发狙（连发间隔 0.17 秒），一梭子能撕掉大半管血
              snipe: { charge: 1.05, dmg: 27, spd: 1650, spread: 0.006, cd: [2.8, 3.8], range: 700, burst: 3, gap: 0.17 },
              seekerCd: [11, 15], maxSeekers: 2, mark: 10 },   // mark：发现干员后位置暴露的秒数

  /* 安全总监的护卫「无人作战小车」：跟在总监边上，机枪扫射 + 直飞炮弹。
     总监阵亡 → 自爆程序启动（1.2 秒后炸）；小车被击毁 → 对总监没影响。 */
  escort:  { hp: 420, r: 23, speed: 58, dmg: 12, score: 130, armor: 3, pen: 3, color: '#aebccb', glow: '#7c93a6', shape: 'esc',
             sight: 540, fov: 1.5, keep: 250,
             gat: { spin: 0.5, rounds: 12, rate: 0.085, cd: [2.4, 3.4],
                    spd: 760, dmg: 5.5, spread: 0.055, bloom: 0.06, range: 700 },
             cannon: { load: 1.05, spd: 460, radius: 96, dmg: 38, life: 3.2, cd: [4.6, 6.6], range: 640 } },

  /* 「寻敌爆破小车」：安全总监放出，锁死干员位置一路猛冲，贴脸自爆。
     血量很低，打爆它也会炸 —— 但炸的是它自己站的地方，提前打掉等于拆弹。 */
  seeker:  { hp: 55, r: 13, speed: 172, dmg: 0, score: 30, armor: 0, color: '#ff4d4d', glow: '#ff2020', shape: 'seek',
             sight: 9999, fov: TAU, keep: 0,
             boom: { radius: 118, dmg: 52, fuse: 0.45 } },

  /* 阿萨拉狙击兵：视野最远但视锥很窄，开火前有一道瞄准激光，一枪见血 */
  sniper:  { hp: 30, r: 13, speed: 77, dmg: 10, score: 34,  armor: 1, pen: 3, color: '#5ce1e6', glow: '#18a8bd', shape: 'dia',
             sight: 500, fov: 0.62, keep: 470,
             /* charge 是激光锁定的时间——看到红线就开始走位；dmg 38 一枪能打掉小半管血 */
             snipe: { charge: 0.9, dmg: 38, spd: 1500, spread: 0.006, cd: [2.4, 3.3], range: 520 } },

  /* 阿萨拉火箭筒兵：慢吞吞地扛着筒子，装填完打一发直飞的火箭，范围爆炸 */
  rocket:  { hp: 72, r: 19, speed: 58, dmg: 12, score: 40,  armor: 2, color: '#8ad34a', glow: '#4d9a1a', shape: 'roc',
             sight: 460, fov: 0.85, keep: 380,
             /* load 装填（有预警），火箭飞得慢，侧身就能躲；打爆半空的火箭会提前炸 */
             rkt: { load: 0.75, spd: 300, radius: 112, dmg: 48, life: 3.6, cd: [3.4, 4.4], range: 560 } },

  /* 阿萨拉喷火兵：逼近到十来米就开喷，火舌绕过掩体边缘会持续烧，地上还会留火 */
  flamer:  { hp: 130, r: 20, speed: 67, dmg: 14, score: 44,  armor: 3, color: '#ffd24a', glow: '#ff8a1f', shape: 'flm',
             sight: 300, fov: 1.05, keep: 165,
             flame: { dur: 1.9, tick: 0.3, dmg: 4.5, range: 228, arc: 0.34, cd: [2.4, 3.2],
                      fireR: 44, fireLife: 2.0, fireDmg: 2.0 } },

  /* ── 阿萨拉冰冻军团：三个兵种共用一套「冻伤」底层，打法完全不同 ──
     它们都不负责打死你，负责让你跑不掉：伤害很低，真正致命的是把人钉在原地，
     等机枪兵、手雷兵、喷火兵到位。

     投射兵：远远地射冰弹，落地炸开一片霜区（远距离封锁）
     投掷兵：把霜瓶抛到你脚下，落点先亮一个冰圈（中距离赶人，逼你离开掩体）
     喷射兵：贴到跟前按着冷雾管喷一片锥形冰雾（近距离沾上就叠冻伤） */
  cryo:    { hp: 160, r: 23, speed: 45, dmg: 12, score: 56, armor: 3, color: '#7fd4ff', glow: '#2f9fe0', shape: 'cry',
             sight: 420, fov: 0.95, keep: 320,
             ice: { load: 0.8, spd: 420, radius: 104, life: 5.0, dmg: 12, cd: [4.4, 5.8], range: 540 } },

  cryoT:   { hp: 145, r: 21, speed: 50, dmg: 10, score: 52, armor: 3, color: '#8fe0ff', glow: '#35b8f0', shape: 'cryt',
             sight: 400, fov: 0.95, keep: 360,
             /* pot：霜瓶抛物线飞 1 秒，落点先亮冰圈；砸开是一片更大的霜（半径 132、6 秒） */
             pot: { throw: 1.0, radius: 132, life: 6.0, dmg: 16, cd: [5.2, 6.6], range: 560, near: 210 } },

  cryoS:   { hp: 185, r: 24, speed: 52, dmg: 13, score: 58, armor: 3, color: '#c9f2ff', glow: '#66ccff', shape: 'crys',
             sight: 330, fov: 1.05, keep: 150,
             /* spray：贴脸按住冷雾管 1.7 秒，锥形范围里每 0.26 秒掉一点血 + 叠冻伤；
                喷完地上留一串小霜点，封住退路 */
             spray: { dur: 1.7, tick: 0.26, dmg: 3.2, range: 196, arc: 0.42, cd: [2.9, 3.9],
                      patchR: 46, patchLife: 1.9, chill: 0.3 } },

  /* 阿萨拉手雷兵：不打枪，只往你脚下丢雷。落点先亮一个红圈倒计时，
     逼你从掩体后面挪窝；空中的雷还能被子弹打爆提前引爆 —— 这是留给玩家的操作空间。 */
  nader:   { hp: 85, r: 18, speed: 74, dmg: 11, score: 46, armor: 2, color: '#ffb347', glow: '#ff7a1f', shape: 'grd',
             sight: 440, fov: 1.0, keep: 340,
             nad: { throw: 0.95, fuse: 1.3, radius: 118, dmg: 52, cd: [3.6, 5.0], range: 540, near: 200 } },
};

/* ══════════════════════════════════════════════════════════
   机密模式数值（「零号大坝·机密」专用）
   ──────────────────────────────────────────────────────────
   普通模式保持原表不变；机密模式换一套血量与伤害。
   dmgMul 是该兵种「全部伤害」的统一倍率 —— 远程弹丸在读取处乘，
   近战直接用 e.dmg，避免同一发伤害被乘两次。
   ══════════════════════════════════════════════════════════ */
const SECRET = {
  hp: { runner: 68, shooter: 60, sniper: 55, rocket: 105, flamer: 170, brute: 360, boss: 2400,
        director: 1550, escort: 520, seeker: 70,
        cryo: 220, cryoT: 195, cryoS: 250, nader: 120 },
  /* 机密甲抬升：只对「本来就穿甲」的兵种生效 —— 突击兵裸奔，机密图里还是裸奔，
     RIP 修脚弹和「一枪一个小兵」的手感都留着。
     封顶 5 级：再往上（6 级）就只有红弹 / 顶级弹啃得动，等于硬墙。
     顶到封顶的（赤霄 5→6 被截回 5）拿耐久补回来，重甲只是更耐磨，不换成「无解」。 */
  armorAdd: 1,
  penAdd: 1,           // 敌人子弹弹级 +1（5 级弹开始撕 5 级甲）
  armorLvCap: 5,
  armorOverCapHp: 1.5,
  dmgMul: { runner: 1.35, shooter: 1.23, sniper: 0.84, rocket: 0.83, flamer: 1.33, brute: 1.33, boss: 1.33,
            director: 1.22, escort: 1.12, seeker: 1.0,
            cryo: 1.2, cryoT: 1.15, cryoS: 1.25, nader: 1.15 },
  shield: 140,          // 盾兵的盾，普通是 120
  playerInvuln: 0.30,   // 玩家挨打后的无敌帧，普通是 0.55（围攻才开始有压力）
  firstWave: 72,        // 首波增援
  gapBase: 56, gapK: 2.6, gapMin: 34,
  bossWave: 4,          // 第 4 波带赤霄
  loot: {
    relicCommon: 0.42,  // 普通货权重 ×0.42
    relicRare: 1.30,
    relicHigh: 1.90,    // 史诗
    relicTop: 3.20,     // 传说 / 神话
    modHigh: 2.00,      // 配件史诗
    gunChance: 0.34,    // 补给箱出枪（普通 0.20）
    weaponModChance: 0.70,
    safeExtraChance: 0.75,
    safeModChance: 0.55,
  },
};
function isSecret() { return G.tier === 'secret' || G.tier === 'top'; }
function isTop() { return G.tier === 'top'; }

/* ══════════════════════════════════════════════════════════
   绝密模式数值（「航天基地·绝密」专用）
   ──────────────────────────────────────────────────────────
   在机密表的基础上再抬一档：血更厚、伤害更高、甲再 +1，
   增援更快、BOSS 更早，战利品权重整体再往高品质倾斜。
   ══════════════════════════════════════════════════════════ */
const TOP = {
  hpMul: 1.22,          // 在机密血量上再 ×1.22
  dmgMul: 1.12,         // 在机密伤害倍率上再 ×1.12
  armorAdd: 2,          // 穿甲的兵甲级 +2（封顶仍是 5 级）
  penAdd: 2,            // 敌人子弹弹级 +2
  shieldMul: 1.15,
  playerInvuln: 0.26,
  firstWave: 52, gapBase: 46, gapK: 2.4, gapMin: 28,
  bossWave: 3,
  loot: {
    relicCommon: 0.30, relicRare: 1.15, relicHigh: 2.20, relicTop: 3.80,
    modHigh: 2.40, gunChance: 0.44, weaponModChance: 0.80,
    safeExtraChance: 0.90, safeModChance: 0.68,
  },
};
function lootTable() { return isTop() ? TOP.loot : (isSecret() ? SECRET.loot : null); }
/* ── 警戒传播与增援：一次「看见」能惊动多大一片，以及谁能真的追上来 ──
   老实现里 enterCombat 一次就把 520px 内所有人喊成 alert，被喊的人再去喊它周围
   440px 的人，三跳下去 ≈1300px —— 半张图的守军都会拎着枪朝你走，看着就像
   「一个人看见 = 全图 AI 来抓我」。现在拆成五道闸：
     ① 喊话只传 maxHop 跳，首跳 hopR，逐跳收缩 hopDecay；
     ② chaseR 硬闸：离发现点超过这个距离的人根本进不了追杀，只在原地犯疑；
     ③ maxResponders：这一轮已经有多少人在扑你，凑满了剩下的人就当没听见；
     ④ giveUpR：追出去这么远还没再咬住，就放弃回防；
     ⑤ 增援不再「喊一声就到」：先挂 ETA（backupEta），到点才从集结点进场。 */
const ALERT = {
  hopR: 330,             // 首跳喊话半径（原 520）
  hopDecay: 70,          // 每多传一跳收缩多少
  maxHop: 2,             // 连锁深度（原 3）
  chaseR: 700,           // 硬闸：离发现点超过这个距离 → 不进战斗
  giveUpR: 1150,         // 追到这个距离之外还没咬住 → 放弃回防
  maxResponders: 8,      // 同一轮在场追兵上限（在打你的 + 被喊来正在赶的）
  markR: 900,            // 安全总监的坐标共享半径（原来是无差别全场）
  waveAwareR: 860,       // 增援波只对这个范围内的警报有反应，远了照常巡逻
  backupEta: [22, 32],   // 呼叫增援的抵达时间（秒）—— 无线电要时间
  backupCd: 26,          // 两次呼叫之间的最小间隔
  backupMax: 2,          // 同时最多几批增援在路上
  backupMinDist: 300,    // 增援集结点离玩家至少这么远（不许贴脸刷出来）
};

/* 增援节奏：普通慢、机密紧、绝密更紧 */

function firstReinforceDelay() {
  return isTop() ? TOP.firstWave : (isSecret() ? SECRET.firstWave : 115);
}
function reinforceGap(wave) {
  if (isTop()) return Math.max(TOP.gapMin, TOP.gapBase - wave * TOP.gapK);
  return isSecret() ? Math.max(SECRET.gapMin, SECRET.gapBase - wave * SECRET.gapK)
                    : Math.max(40, 76 - wave * 3);
}
function bossWaveNo() {
  return isTop() ? TOP.bossWave : (isSecret() ? SECRET.bossWave : 5);
}

/* 近战攻击参数（贴身不再是"合体掉血"，而是在玩家体积之外抬手 → 突进 → 挥一刀）
   reach: 出手距离（加在 玩家半径 + 敌人半径 之上）  wind: 抬手预警时长（可躲窗口）
   cd:    收招冷却    arc: 命中扇区半角    lunge: 突进位移    kick: 命中后把玩家顶开的距离 */
const MELEE = {
  runner:  { reach: 30, wind: 0.26, cd: 0.95, arc: 0.52, lunge: 30, kick: 30 },   // 小兵：又快又碎的刺击
  shooter: { reach: 32, wind: 0.34, cd: 1.25, arc: 0.46, lunge: 22, kick: 34 },   // 盾兵：用盾缘撞一下
  brute:   { reach: 46, wind: 0.52, cd: 1.70, arc: 0.80, lunge: 34, kick: 74 },   // 机枪兵：抡枪托横扫
  sniper:  { reach: 28, wind: 0.30, cd: 1.20, arc: 0.42, lunge: 18, kick: 26 },   // 狙击兵：枪托短刺
  rocket:  { reach: 36, wind: 0.42, cd: 1.40, arc: 0.52, lunge: 24, kick: 46 },   // 火箭兵：筒子横砸
  flamer:  { reach: 34, wind: 0.38, cd: 1.35, arc: 0.50, lunge: 22, kick: 38 },   // 喷火兵：喷管一记闷棍
  cryo:    { reach: 38, wind: 0.52, cd: 1.65, arc: 0.58, lunge: 18, kick: 54 },   // 冰冻军团·投射兵：冰壳正面一撞
  cryoT:   { reach: 32, wind: 0.40, cd: 1.35, arc: 0.48, lunge: 16, kick: 38 },   // 冰冻军团·投掷兵：霜瓶砸一下
  cryoS:   { reach: 36, wind: 0.46, cd: 1.55, arc: 0.54, lunge: 20, kick: 46 },   // 冰冻军团·喷射兵：冷雾管横扫
  nader:   { reach: 30, wind: 0.32, cd: 1.20, arc: 0.46, lunge: 18, kick: 30 },   // 手雷兵：雷柄敲一下

  /* 载具型敌人不出近战：reach 负数让出手距离永远够不着 */
  director: { reach: -60, wind: 0.3, cd: 1.0, arc: 0.4, lunge: 0, kick: 0 },
  escort:   { reach: -60, wind: 0.3, cd: 1.0, arc: 0.4, lunge: 0, kick: 0 },
  seeker:   { reach: -60, wind: 0.3, cd: 1.0, arc: 0.4, lunge: 0, kick: 0 },
  boss:    { reach: 62, wind: 0.58, cd: 1.90, arc: 0.95, lunge: 40, kick: 104 },  // 赤霄：重踏，范围最大
};
function meleeOf(e) { return MELEE[e.type] || MELEE.runner; }
/* 出手判定距离：玩家半径 + 敌人半径 + 出手距离 —— 永远打在体积之外 */
function meleeReach(e) { return P.r + e.r + meleeOf(e).reach; }

/* 敌人可布置的兵种清单（地图文件与编辑器共用这个顺序） */
const ENEMY_ORDER = ['runner', 'shooter', 'brute', 'sniper', 'rocket', 'flamer',
                     'cryo', 'cryoT', 'cryoS', 'nader', 'boss', 'director', 'escort', 'seeker'];
const ENEMY_LABEL = {
  runner: '阿萨拉小兵', shooter: '阿萨拉盾兵', brute: '阿萨拉机枪兵',
  sniper: '阿萨拉狙击兵', rocket: '阿萨拉火箭筒兵', flamer: '阿萨拉喷火兵',
  cryo: '阿萨拉冰冻军团-投射兵', cryoT: '阿萨拉冰冻军团-投掷兵', cryoS: '阿萨拉冰冻军团-喷射兵',
  nader: '阿萨拉手雷兵',
  boss: '赤霄',
  director: '安全总监', escort: '无人作战小车', seeker: '寻敌爆破小车',
};
const ENEMY_SHORT = {
  runner: '小兵', shooter: '盾兵', brute: '机枪兵',
  sniper: '狙击兵', rocket: '火箭兵', flamer: '喷火兵',
  cryo: '投射兵', cryoT: '投掷兵', cryoS: '喷射兵', nader: '手雷兵',
  boss: '赤霄',
  director: '总监', escort: '护卫车', seeker: '爆破车',
};
const BOSS_NAME = '赤霄';

/* ══════════════════════════════════════════════════════════
   阵营：阿萨拉 / 哈夫克
   ──────────────────────────────────────────────────────────
   两套守军共用同一套兵种数值与 AI —— 「一模一样的小兵，只换阵营和前缀名」。
   零号大坝只有阿萨拉，航天基地只有哈夫克；自定义地图可以混编。
   敌对关系：「玩家 ↔ 阿萨拉」「玩家 ↔ 哈夫克」「阿萨拉 ↔ 哈夫克」全部敌对，
   同阵营互为友军（子弹不会误伤，也不会互相开火）。
   ══════════════════════════════════════════════════════════ */
const FACTIONS = {
  asara: { id: 'asara', name: '阿萨拉', color: '#ff5c7a', glow: '#ff2d55' },
  havk:  { id: 'havk',  name: '哈夫克', color: '#b8a26b', glow: '#18a8bd' },
};
const FACTION_ORDER = ['asara', 'havk'];
function factionOf(id) { return FACTIONS[id] || FACTIONS.asara; }
/* 兵种显示名：「阿萨拉小兵」→「哈夫克小兵」；赤霄没有前缀，两个阵营同名 */
function enemyLabel(type, fac) {
  const base = ENEMY_LABEL[type] || type;
  return factionOf(fac).id === 'asara' ? base : base.replace(/^阿萨拉/, factionOf(fac).name);
}
function enemyShort(type, fac) {
  const base = ENEMY_SHORT[type] || type;
  if (base === '赤霄' || factionOf(fac).id === 'asara') return base;
  return factionOf(fac).name + base;
}
/* 阵营敌对矩阵：玩家是独立阵营 'player' */
function factionsHostile(a, b) {
  if (!a || !b || a === b) return false;
  return true;                     // 三个阵营两两敌对，同阵营才是友军
}

const BOSS_FIRE = { r: 112, life: 4.6, dmg: 7, warm: 1.6, breed: 0.4 };
