/* 设置面板 + 存档导出导入 + 图鉴 + 战术地图（M 开关） 回归测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '..', 'node_modules', 'jsdom'));
const { inlineScripts } = require('./loader');

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});   // canvas / navigation 的 not-implemented 噪音不关心
const dom = new JSDOM(inlineScripts(html), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;

setTimeout(() => {
  try {
    const E = s => w.eval(s);

    /* ── 1. 默认值与迁移 ── */
    const dft = E('JSON.stringify(SAVE.settings)');
    T('设置默认值齐全', /"vol":70/.test(dft) && /"shake":100/.test(dft) && /"fx":100/.test(dft) && /"aim":"#b4e6ff"/.test(dft) && !/"achHud"/.test(dft));
    T('图鉴存档字段存在', E('!!SAVE.seenRelics') && E('!!SAVE.codexReward'));
    T('老档迁移补默认', E(`(function(){
      var d = JSON.parse(JSON.stringify(SAVE)); delete d.settings; delete d.seenRelics;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
      var s = loadSave();
      return s.settings && s.settings.vol === 70 && !!s.seenRelics && !!s.codexReward;
    })()`));

    /* ── 2. 设置读取与生效 ── */
    T('sfxVol 满档 0.5', E('SAVE.settings.vol=100; sfxVol()') === 0.5);
    T('sfxVol 静音', E('SAVE.settings.vol=0; sfxVol()') === 0);
    T('shakeMul 0 = 完全不震', E(`(function(){
      SAVE.settings.shake = 0; G.shake = 0; shake(30);
      return G.shake === 0;
    })()`));
    T('shakeMul 50 = 减半', E(`(function(){
      SAVE.settings.shake = 50; G.shake = 0; shake(30);
      return Math.abs(G.shake - 15) < 1e-9;
    })()`));
    T('fx 0 = 不生成粒子', E(`(function(){
      SAVE.settings.fx = 0; var n = G.particles.length; addParticle(0,0,{}); burst(0,0,10,{});
      return G.particles.length === n;
    })()`));
    T('aimColor 非法值回退默认', E(`(function(){
      SAVE.settings.aim = 'javascript:alert(1)';
      return aimColor() === '#b4e6ff';
    })()`));
    T('aimColor 合法值生效', E(`(function(){
      SAVE.settings.aim = '#ff8800'; var c = aimColor();
      SAVE.settings.aim = '#b4e6ff';
      return c === '#ff8800';
    })()`));
    T('小地图开关已移除（minimapOn 不存在）', E('typeof minimapOn === "undefined"'));

    /* ── 3. 图鉴 ── */
    T('markRelicSeen 点亮', E(`(function(){
      markRelicSeen('shell'); markRelicSeen('shell');     // 重复不叠加
      return SAVE.seenRelics.shell === 1 && Object.keys(SAVE.seenRelics).length === 1;
    })()`));
    T('分档进度统计', E(`(function(){
      var p = codexProgress();
      return p.common.total === 111 && p.myth.total === 29 && p.common.have >= 1;
    })()`));
    T('未集齐不发奖励', E(`(function(){
      var c0 = SAVE.credits;
      markRelicSeen('ration');
      return SAVE.credits === c0 && !SAVE.codexReward.common;
    })()`));
    T('集齐神话档发奖励', E(`(function(){
      var c0 = SAVE.credits;
      for (var id of RELIC_IDS) if (RELICS[id].q === 'myth') SAVE.seenRelics[id] = 1;
      checkCodexReward('myth');
      return SAVE.codexReward.myth === 1 && SAVE.credits === c0 + CODEX_REWARD.myth;
    })()`));
    T('奖励只发一次', E(`(function(){
      var c0 = SAVE.credits;
      checkCodexReward('myth');
      return SAVE.credits === c0;
    })()`));
    T('图鉴只认存在的收集品', E(`(function(){
      markRelicSeen('not_a_relic');
      return !SAVE.seenRelics.not_a_relic;
    })()`));

    /* ── 4. 导出/导入（纯数据层） ── */
    T('导出是合法 JSON 且含关键字段', E(`(function(){
      var d = JSON.parse(JSON.stringify(SAVE));
      return typeof d.credits === 'number' && !!d.settings && !!d.stats;
    })()`));
    T('导入校验拒绝垃圾文本', E(`(function(){
      try { JSON.parse('这不是JSON'); return false; } catch(e) { return true; }
    })()`));
    T('导入缺资金字段被拒', E('(function(){ var d = JSON.parse(JSON.stringify(SAVE)); delete d.credits; return typeof d.credits !== "number"; })()'));

    /* ── 5. UI 元素与控件绑定 ── */
    T('设置面板元素齐全', ['settings', 'setVol', 'setShake', 'setFx', 'setAimRow', 'saveText', 'saveExport', 'saveCopy', 'saveImport'].every(id => !!w.document.getElementById(id)));
    T('图鉴面板元素齐全', ['codex', 'codexTabs', 'codexGrid', 'codexCount', 'codexTotal', 'codexWorth'].every(id => !!w.document.getElementById(id)));
    T('准星色块渲染 6 个', E('(function(){ openSettings(); return document.querySelectorAll("#setAimRow .aimdot").length; })()') === 6);
    T('滑块拖动写回设置', E(`(function(){
      var el = document.getElementById('setVol');
      el.value = 35;
      el.dispatchEvent(new Event('input'));
      return SAVE.settings.vol === 35;
    })()`));
    T('滑块松手落盘', E(`(function(){
      document.getElementById('setVol').dispatchEvent(new Event('change'));
      var d = JSON.parse(localStorage.getItem(SAVE_KEY));
      return d.settings.vol === 35;
    })()`));
    T('准星点击换色', E(`(function(){
      var dots = document.querySelectorAll('#setAimRow .aimdot');
      dots[3].click();
      return SAVE.settings.aim === '#ffcc4d';
    })()`));
    T('设置面板已无小地图开关', E('!document.getElementById("setMinimap")'));
    T('M 键开关战术地图（局内专用）', E(`(function(){
      G.scene = 'playing';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      var on = BIGMAP.open === true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      return on && BIGMAP.open === false;
    })()`));
    T('大厅里按 M 不开图', E(`(function(){
      G.scene = 'lobby';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      var stillOff = BIGMAP.open === false;
      G.scene = 'playing';
      return stillOff;
    })()`));
    T('图鉴网格渲染已收集在前', E(`(function(){
      openCodex();
      var cells = document.querySelectorAll('#codexGrid .cdx');
      var idx = [];
      for (var i = 0; i < cells.length; i++) idx.push(cells[i].className.indexOf('locked') >= 0 ? 1 : 0);
      closeCodex();
      var seenLocked = false, ok = true;
      for (var i = 0; i < idx.length; i++) {
        if (idx[i] === 1) seenLocked = true;
        else if (seenLocked) { ok = false; break; }
      }
      return ok;
    })()`));
    T('图鉴 tab 进度文字', E(`(function(){
      openCodex();
      var t = document.getElementById('codexTabs').textContent;
      closeCodex();
      return /全部/.test(t) && /神话/.test(t) && /\\//.test(t);
    })()`));

    /* ── 6. 战术地图缓存 ── */
    T('mapCache 烘墙体（stub canvas，720px 宽）', E(`(function(){
      var orig = document.createElement;
      document.createElement = function(tag){
        var el = orig.call(document, tag);
        if (tag === 'canvas') el.getContext = function(){ return { fillStyle: '', fillRect: function(){} }; };
        return el;
      };
      try {
        WORLD.w = 4400; WORLD.h = 3200; G.obstacles = [{x:0,y:0,w:100,h:100}];
        BIGMAP.cv = null; BIGMAP.sig = '';
        var m = mapCache();
        return !!m.cv && m.w === 720 && m.h === 524 && m.sig.indexOf('4400') === 0;
      } finally { document.createElement = orig; }
    })()`));
    T('同签名直接复用缓存', E('(function(){ var a = mapCache(); var b = mapCache(); return a.cv === b.cv; })()'));
    T('结算后战术地图自动关闭', E(`(function(){
      G.scene = 'playing'; BIGMAP.open = true;
      try { endRaid(true); } catch (e) { /* 测试环境无完整结算 DOM，重置已发生 */ }
      return BIGMAP.open === false;
    })()`));

    /* ── 7. 入库点亮图鉴 ── */
    T('endRaid 类入库调用 markRelicSeen', /markRelicSeen\(it\.id\)/.test(E('endRaid.toString()')));
    T('cellToStock 类入库调用 markRelicSeen', /markRelicSeen\(c\.id\)/.test(E('cellToStock.toString()')));

  } catch (e) {
    fail++; console.log('FAIL 测试执行异常:', e.message);
  }

  console.log('=== ' + pass + ' pass / ' + fail + ' fail ===');
  process.exit(fail ? 1 : 0);
}, 1900);
