/* 成就系统：表结构 / 解锁判定 / 奖金发放 / 幂等 / 面板渲染 / 存档字段 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadDom } = require('./loader');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = loadDom(html);
const w = dom.window;
w.requestAnimationFrame = cb => setTimeout(() => cb(16), 0);
let pass = 0, fail = 0;
const T = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };

setTimeout(() => {
  try {
    // ── 1. 数据结构 ──
    const meta = JSON.parse(w.eval(`JSON.stringify({
      n: ACHIEVEMENTS.length,
      ids: ACHIEVEMENTS.map(a => a.id),
      allHaveTest: ACHIEVEMENTS.every(a => typeof a.test === 'function' && a.reward > 0 && a.name && a.desc),
      saved: typeof SAVE.achieved === 'object'
    })`));
    T('成就表 50 条', meta.n === 50);
    T('id 不重复', new Set(meta.ids).size === meta.ids.length);
    T('每条都有 name/desc/reward/test', meta.allHaveTest);
    T('存档有 achieved 字段', meta.saved);

    // ── 2. 解锁判定与奖金 ──
    const r = JSON.parse(w.eval(`
      (function(){
        SAVE.achieved = {};
        SAVE.credits = 1000;
        SAVE.stats = { raids: 1, extracts: 1, deaths: 0, loot: 0, kills: 25, sold: 0 };
        var run = { success: true, kills: 25, relics: 16, blinds: 9, swarmHits: 5,
                    bleedHits: 11, silentKills: 3, noArmor: true, tier: 'top' };
        var got = checkAchievements(run);
        var first = { n: got.length, credit: SAVE.credits, names: got.map(a => a.id) };
        var again = checkAchievements(run);        // 同一局再判一次：不应重复发
        var second = { n: again.length, credit: SAVE.credits };
        return JSON.stringify({ first: first, second: second, achieved: Object.keys(SAVE.achieved).length });
      })()`));
    T('一局全达成时解锁 10 项（不含累计 10 撤离 / 200 击杀）', r.first.n === 10);
    T('奖金按条目累计发放（10 项合计 ¥30,000）', r.first.credit === 1000 + 30000);
    T('重复判定不重复发奖（幂等）', r.second.n === 0 && r.second.credit === r.first.credit);
    T('解锁写进 SAVE.achieved', r.achieved === 10);

    // ── 3. 累计类成就 ──
    const cum = JSON.parse(w.eval(`
      (function(){
        SAVE.achieved = {};
        SAVE.stats = { raids: 20, extracts: 10, deaths: 5, loot: 0, kills: 200, sold: 0 };
        var got = checkAchievements({ success: false, kills: 0, relics: 0, blinds: 0,
          swarmHits: 0, bleedHits: 0, silentKills: 0, noArmor: false, tier: 'standard' });
        return JSON.stringify(got.map(a => a.id));
      })()`));
    T('累计撤离 10 次解锁「老练」', cum.includes('veteran'));
    T('累计击杀 200 解锁「尸山血海」', cum.includes('executioner'));
    T('失败局不误解锁撤离类成就', !cum.includes('first_extract') && !cum.includes('top_clear'));

    // ── 4. 面板渲染 ──
    const ui = JSON.parse(w.eval(`
      (function(){
        SAVE.achieved = { first_kill: 1, first_extract: 1 };
        openAchievements();
        var list = document.getElementById('achList');
        var open = !document.getElementById('ach').classList.contains('hidden');
        var cnt = document.getElementById('achCount').textContent;
        var total = document.getElementById('achTotal').textContent;
        var worth = document.getElementById('achWorth').textContent;
        closeAchievements();
        var closed = document.getElementById('ach').classList.contains('hidden');
        return JSON.stringify({ open: open, closed: closed, chips: list.children.length, cnt: cnt, total: total, worth: worth });
      })()`));
    T('成就面板能打开并列出 50 张卡', ui.open && ui.chips === 50);
    T('面板统计：已解锁 2 / 50', ui.cnt === '2' && ui.total === '50');
    T('累计奖金 ¥2,500（500+2000）', ui.worth.indexOf('2,500') >= 0 || ui.worth.indexOf('2500') >= 0);
    T('面板能关闭', ui.closed);

    // ── 5. 局内计数器接入（startRaid 需要 canvas，jsdom 里只查字段与接线点） ──
    const wire = JSON.parse(w.eval(`JSON.stringify({
      b: G.blinds, s: G.swarmHits, l: G.bleedHits, k: G.silentKills,
      reset: /G\\.blinds = 0/.test(startRaid.toString()),
      inFlash: /G\\.blinds\\+\\+/.test(flashBlast.toString()) || /G\\.blinds\\+\\+/.test(updateMists.toString()),
      inSwarm: /G\\.swarmHits\\+\\+/.test(attachSwarm.toString()),
      inKill: /G\\.silentKills\\+\\+/.test(killEnemy.toString())
    })`));
    T('G 对象带四个局内计数器', wire.b === 0 && wire.s === 0 && wire.l === 0 && wire.k === 0);
    T('startRaid 重置计数器', wire.reset);
    T('致盲计数接在闪光/毒雾上', wire.inFlash);
    T('集群命中计数接在 attachSwarm 上', wire.inSwarm);
    T('静默击杀计数接在 killEnemy 上', wire.inKill);

    console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  } catch (e) {
    fail++;
    console.log('FAIL  测试崩溃: ' + e.message + '\n' + (e.stack || ''));
    process.exit(1);
  }
}, 1500);
