/* 零号大坝重规划：地区字段 / 内置地图规整 / 机密变体继承 / 小地图与地面标注接线 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadDom, fullSource } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = fullSource();   // index.html + 全部 js 模块源码（源码正则断言用）
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    // ── 1. 内置地图与新地区 ──
    const m = JSON.parse(w.eval(`
      (function(){
        var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam'])));
        return JSON.stringify({ ok: r.ok, warn: r.warnings, err: r.errors,
          w: r.map.w, h: r.map.h,
          regions: r.map.regions || [], obst: r.map.obstacles.length,
          crates: r.map.crates.length, nests: r.map.nests.length,
          units: r.map.units.length, extracts: r.map.extracts,
          cratePts: r.map.crates, nestPts: r.map.nests, unitPts: r.map.units,
          boss: r.map.units.filter(u => u.type === 'boss').map(u => ({ x: u.x, y: u.y })),
          bossZone: r.map.bossZone || null,
          spawns: r.map.spawns.length,
          builtin: r.map.builtin,
          freeInZone: (function(){
            var z = r.map.bossZone; if (!z) return -1;
            var bad = 0;
            for (var i = 0; i <= 4; i++) for (var j = 0; j <= 4; j++) {
              var x = z.x + 50 + (z.w - 100) * i / 4, y = z.y + 50 + (z.h - 100) * j / 4;
              if (r.map.obstacles.some(function(o){
                var nx = Math.max(o.x, Math.min(x, o.x + o.w)), ny = Math.max(o.y, Math.min(y, o.y + o.h));
                return (x - nx) * (x - nx) + (y - ny) * (y - ny) < 50 * 50;
              })) bad++;
            }
            return bad;
          })() });
      })()`));
    T('内置地图规整通过', m.ok);
    T('规整零警告零错误', m.warn.length === 0 && m.err.length === 0);
    T('地图 4400×3200', m.w === 4400 && m.h === 3200);
    T('地区 10 块', m.regions.length === 10);
    const names = m.regions.map(r => r.name);
    T('地区含参考图六大地名（管道区域/军营/行政辖区/水泥厂/主变电站/游客中心）',
      ['管道区域', '军营', '行政辖区', '水泥厂', '主变电站', '游客中心'].every(n => names.includes(n)));
    T('南货场地区收编南部空白带', names.includes('南货场'));
    T('地区名 ≤ 10 字且带矩形', m.regions.every(r => r.name.length <= 10 && r.w >= 80 && r.h >= 80));
    T('容器 44 · 据点 12 · 守军 58 · 出生 6 · 撤离 2',
      m.crates === 44 && m.nests === 12 && m.units === 58 && m.spawns === 6 && m.extracts.length === 2);
    const bz = m.bossZone;
    T('地图带 BOSS 驻守区', !!bz && bz.w >= 200 && bz.h >= 180);
    T('赤霄出生点在驻守区内', m.boss.length === 1 && !!bz &&
      m.boss[0].x >= bz.x && m.boss[0].x <= bz.x + bz.w &&
      m.boss[0].y >= bz.y && m.boss[0].y <= bz.y + bz.h);
    T('驻守区整块含在行政楼体里（赤霄只在楼内）', !!bz &&
      bz.x >= 2140 && bz.x + bz.w <= 2830 && bz.y >= 560 && bz.y + bz.h <= 990);
    T('驻守区内没有建筑挡路（BOSS 能在里面走）', m.freeInZone === 0);
    T('撤离点 A 在行政辖区（坝下广场）· B 在东南角',
      m.extracts.some(e => e.name === 'A' && e.x > 1600 && e.x < 3160 && e.y > 500 && e.y < 1260) &&
      m.extracts.some(e => e.name === 'B' && e.x > 3600 && e.y > 2600));

    // ── 2. 布局方位（对齐参考图） ──
    const reg = n => m.regions.find(r => r.name === n);
    const cx = r => r.x + r.w / 2, cy = r => r.y + r.h / 2;
    T('管道区域在军营西北（x 更小）', cx(reg('管道区域')) < cx(reg('军营')));
    T('军营在行政辖区西侧', reg('军营').x + reg('军营').w <= reg('行政辖区').x);
    T('行政辖区紧贴坝体（上边缘 ≤ 坝体下缘附近）', reg('行政辖区').y >= 340 && reg('行政辖区').y <= 600);
    T('水泥厂在西侧（中心 x < 1/3 图宽）', cx(reg('水泥厂')) < m.w / 3);
    T('主变电站居中偏南（中心 x 在 40%~75%）', cx(reg('主变电站')) > m.w * 0.4 && cx(reg('主变电站')) < m.w * 0.75);
    T('游客中心在东南（中心 x > 2/3, y > 1/2）', cx(reg('游客中心')) > m.w * 2 / 3 && cy(reg('游客中心')) > m.h / 2);
    T('泄洪河谷纵向贯穿西南（高 > 宽 × 2）', reg('泄洪河谷').h > reg('泄洪河谷').w * 2);
    T('南货场在主变电站正南、游客中心正西',
      reg('南货场').y >= reg('主变电站').y + reg('主变电站').h - 1 &&
      reg('南货场').x + reg('南货场').w <= reg('游客中心').x);

    // ── 2.5 点位归属：容器与守军必须全部落在地区里 ──
    const inReg = (x, y, rs) => rs.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    T('全部容器落在地区内（无散点漂移）', m.cratePts.every(c => inReg(c.x, c.y, m.regions)));
    T('全部据点落在地区内', m.nestPts.every(n => inReg(n.x, n.y, m.regions)));
    T('全部守军落在地区内', m.unitPts.every(u => inReg(u.x, u.y, m.regions)));
    T('大坝坝顶至少 2 个容器（出生点①不再是空地）', m.cratePts.filter(c => inReg(c.x, c.y, [reg('大坝坝顶')])).length >= 2);
    T('泄洪河谷至少 4 个容器 · 南货场至少 3 个容器',
      m.cratePts.filter(c => inReg(c.x, c.y, [reg('泄洪河谷')])).length >= 4 &&
      m.cratePts.filter(c => inReg(c.x, c.y, [reg('南货场')])).length >= 3);

    // ── 3. 运行时应用 ──
    const app = w.eval(`
      (function(){
        var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam'])));
        r.map.builtin = 'zero-dam';
        applyMapData(r.map);
        return JSON.stringify({ n: G.regions.length, first: G.regions[0] || null,
          cur: G.curRegion, banner: G.regionBanner });
      })()`);
    const a = JSON.parse(app);
    T('applyMapData 写入 G.regions', a.n === 10);
    T('初始无当前地区 / 横幅计时为 0', a.cur === '' && a.banner === 0);

    // ── 4. 地区横幅：玩家进区触发 ──
    const ban = w.eval(`
      (function(){
        P.x = 2500; P.y = 1700;            // 主变电站内
        updateRegionBanner(0.016);
        var enter = { cur: G.curRegion, banner: G.regionBanner };
        updateRegionBanner(1.0); updateRegionBanner(1.0); updateRegionBanner(1.0);
        var decay = G.regionBanner;
        P.x = 700; P.y = 1800;             // 水泥厂
        updateRegionBanner(0.016);
        var toCement = G.curRegion;
        P.x = 3260; P.y = 1500;            // 行政辖区与坡地之间的无名通道
        updateRegionBanner(0.016);
        return JSON.stringify({ enter: enter, decay: decay, toCement: toCement, blank: G.curRegion });
      })()`);
    const b = JSON.parse(ban);
    T('进入主变电站触发横幅', b.enter.cur === '主变电站' && b.enter.banner > 2);
    T('横幅随时间衰减', b.decay < b.enter.banner && b.decay >= 0);
    T('走进水泥厂切当前地区', b.toCement === '水泥厂');
    T('走出地区后当前地区清空', b.blank === '');

    // ── 5. 机密变体继承 ──
    const sec = JSON.parse(w.eval(`
      (function(){
        var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam-secret'])));
        return JSON.stringify({ ok: r.ok, regions: (r.map.regions || []).length,
          name: r.map.name, tier: r.map.tier, crates: r.map.crates.length,
          typed: r.map.crates.filter(c => c.t).length });
      })()`));
    T('机密变体规整通过且继承 10 地区', sec.ok && sec.regions === 10);
    T('机密变体名/难度正确', sec.name === '零号大坝·机密' && sec.tier === 'secret');
    T('机密变体容器全部带种类', sec.crates === 44 && sec.typed === 44);

    // ── 5.5 运行时：BOSS 刷点锁在驻守区 / 导出保留 bossZone / 非法值丢弃 ──
    const sp = JSON.parse(w.eval(`
      (function(){
        var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam'])));
        r.map.builtin = 'zero-dam';
        applyMapData(r.map);
        G.enemies.length = 0;
        var e = spawnEnemy('boss');
        var out = buildMapData('导出测试');
        return JSON.stringify({
          zone: G.bossZone,
          x: e ? e.x : null, y: e ? e.y : null,
          hx: e ? e.homeX : null, hy: e ? e.homeY : null,
          exported: out.bossZone || null,
        });
      })()`));
    T('applyMapData 写入 G.bossZone', !!sp.zone && sp.zone.w === m.bossZone.w);
    T('spawnEnemy 把赤霄刷在驻守区内（增援也回楼里）',
      sp.x >= sp.zone.x && sp.x <= sp.zone.x + sp.zone.w &&
      sp.y >= sp.zone.y && sp.y <= sp.zone.y + sp.zone.h);
    T('赤霄的 home 也在驻守区内（拴绳不把它拉出去）',
      sp.hx >= sp.zone.x && sp.hx <= sp.zone.x + sp.zone.w &&
      sp.hy >= sp.zone.y && sp.hy <= sp.zone.y + sp.zone.h);
    T('buildMapData 导出 bossZone', !!sp.exported && sp.exported.x === m.bossZone.x);

    const badZone = JSON.parse(w.eval(`
      (function(){
        var raw = JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam']));
        raw.bossZone = { x: 100, y: 100, w: 60, h: 60 };     // 太小
        var a = normalizeMap(raw);
        raw.bossZone = { x: 99999, y: 0, w: 400, h: 400 };   // 越界
        var b = normalizeMap(raw);
        raw.bossZone = { x: 2300, y: 700, w: 300, h: 200 };  // 合法
        var c = normalizeMap(raw);
        return JSON.stringify({ small: !!a.map.bossZone, out: !!b.map.bossZone, ok: !!c.map.bossZone });
      })()`));
    T('非法 bossZone 被丢弃并警告，合法值保留', !badZone.small && !badZone.out && badZone.ok);

    // ── 6. 导出回写 regions ──
    const exp = JSON.parse(w.eval(`
      (function(){
        var r = normalizeMap(JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam'])));
        r.map.builtin = 'zero-dam';
        applyMapData(r.map);
        var out = buildMapData('导出测试');
        return JSON.stringify({ n: (out.regions || []).length, name0: (out.regions || [])[0] });
      })()`));
    T('buildMapData 导出 regions', exp.n === 10 && exp.name0 && exp.name0.name === '大坝坝顶');

    // ── 7. 未知 regions 清洗 ──
    const bad = JSON.parse(w.eval(`
      (function(){
        var raw = JSON.parse(JSON.stringify(BUILTIN_MAPS['zero-dam']));
        raw.regions = [null, { name: '' }, { name: '没坐标' },
                       { name: '越界', x: 99999, y: 0, w: 100, h: 100 },
                       { name: '太小', x: 10, y: 10, w: 30, h: 30 }].concat(raw.regions.slice(0, 2));
        var r = normalizeMap(raw);
        return JSON.stringify({ ok: r.ok, n: r.map.regions.length });
      })()`));
    T('非法地区条目全部丢弃，合法的保留', bad.ok && bad.n === 2);

    // ── 8. 增援闸门随开局驻军规模伸缩（旧固定 42 会被 57 开局守军掐死） ──
    const capT = w.eval(`
      (function(){
        var before = G.enemyCap;
        G.enemies.length = 0;
        for (var i = 0; i < 64; i++) G.enemies.push({ alive: true });
        G.enemyCap = Math.max(42, G.enemies.length + 8);
        var big = G.enemyCap;
        G.enemies.length = 0;
        for (var i = 0; i < 30; i++) G.enemies.push({ alive: true });
        G.enemyCap = Math.max(42, G.enemies.length + 8);
        var small = G.enemyCap;
        G.enemyCap = before;
        return JSON.stringify({ def: before, big: big, small: small });
      })()`);
    const cap = JSON.parse(capT);
    T('G.enemyCap 默认存在（42）', cap.def === 42);
    T('增援闸门随开局规模伸缩：64 守军 → 72，30 守军 → 42', cap.big === 72 && cap.small === 42);
    T('增援触发条件引用 enemyCap（源码检查）', /G\.enemies\.length < \(G\.enemyCap \|\| 42\)/.test(src) &&
      /G\.enemies\.length > \(G\.enemyCap \|\| 42\)/.test(src) &&
      /G\.enemyCap = Math\.max\(42, G\.enemies\.length \+ 8\)/.test(src));

    // ── 9. 地图 JSON 文件与内置一致 ──
    const disk = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', 'zero-dam.json'), 'utf8'));
    const same = w.eval(`JSON.stringify(BUILTIN_MAPS['zero-dam'])`) === JSON.stringify(disk);
    T('maps/zero-dam.json 与 index.html 内置地图逐字节一致', same);

  } catch (e) {
    fail++; console.log('FAIL  异常: ' + e.message);
  }
  console.log(`\\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 1500);
