// اختبارات المحرك الحسابي والمخرجات المبنية. يفشل بخروج غير صفري عند أي خلل.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  quote, periodTable, bestUnit, defaults, TIERS, ar, coverDays, DAY_F,
  discountPolicy, flexRate, flexHours, hasOfficialPackage, durationOf
} from './calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'packages.json'), 'utf8'));
const DISCOUNT = JSON.parse(readFileSync(join(ROOT, 'data', 'discount.json'), 'utf8'));
DATA.discount = DISCOUNT;
const CFG = defaults(DATA);
const POL = discountPolicy(DATA);
const RATES = POL.hourlyRates;
const FLEX_H = flexHours(POL);
const OFFICIAL = DATA.periods.morning.packages.map(p => p.hours);

let pass = 0; const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else fails.push(name + (extra ? ' → ' + extra : '')); };
const eq = (name, got, want) => ok(name, got === want, 'المتوقع ' + want + ' والناتج ' + got);
const read = rel => readFileSync(join(SITE, rel), 'utf8');

/* ——————— 1) أمثلة التحقق المعتمدة في كراسة التسليم ——————— */

const q1 = quote(DATA, { hours: 6, daysPerWeek: 5, weeks: 4, kids: 1 });
eq('6 ساعات × 5 أيام × 4 أسابيع = 850', q1.net, 850);
ok('المثال 1 يستخدم الاشتراك الشهري', q1.items.length === 1 && q1.items[0].key === 'month' && q1.items[0].tier === 6, JSON.stringify(q1.items.map(i => i.key + '/' + i.tier)));

// «لا ترقية جزئية» تبقى قاعدة مسار الأسعار المعلنة: 9 ساعات تُحسب على باقة 10 لا 8+ساعة.
// (السعر النهائي لـ9 ساعات صار بسعر الساعة الخاص بها، وهو أرخص من باقة 10.)
const q2 = quote(DATA, { hours: 9, daysPerWeek: 5, weeks: 4, kids: 1 });
ok('9 ساعات: مسار الأسعار المعلنة على باقة 10 لا 8+ساعة',
  q2.units.every(u => u.tier === null || u.tier === 10), JSON.stringify(q2.units.map(u => u.key + '/' + u.tier)));
ok('9 ساعات: السعر النهائي أقل من باقة 10 المعلنة', q2.net < q2.listPerChild);
const day9 = bestUnit(periodTable(DATA, 'morning'), 'day', 1, 9, CFG);
eq('سعر اليوم عند 9 ساعات = 125 (باقة 10)', day9.cost, 125);
eq('شريحة اليوم عند 9 ساعات = 10', day9.tier, 10);

const q3 = quote(DATA, { hours: 1, daysPerWeek: 1, weeks: 1, kids: 1 });
eq('ساعة × يوم × أسبوع = 25', q3.net, 25);
ok('لا اسم باقة عند مسار الساعة', q3.items.every(i => i.tier === null && i.title.startsWith('اشتراك بالساعة')), JSON.stringify(q3.items.map(i => i.title)));
ok('لا صفوف أسبوعي/شهري/ترم في المقارنة عند مسار الساعة',
  q3.rows.every(r => ['best', 'hourly'].includes(r.key)), JSON.stringify(q3.rows.map(r => r.key)));
ok('لا تنبيه ترقية عندما لا تُستخدم أي باقة', q3.upgraded === false);

// ⚠ تغيّر عن كراسة التسليم: العميل ألغى قاعدة «الحضور الجزئي بلا خصم»، وصار سعر الباقة
// يتناسب مع أيام الدوام. فـ6 ساعات × 3 أيام × أسبوع = 350 × 3/5 = 210 بدل 225 (3 × 75).
const q4 = quote(DATA, { hours: 6, daysPerWeek: 3, weeks: 1, kids: 1 });
eq('6 ساعات × 3 أيام × أسبوع = 210 (الأسبوعي متناسباً مع الأيام)', q4.net, 210);
ok('المثال 4 يستخدم الأسبوعي المتناسب', q4.items.length === 1 && q4.items[0].key === 'week' && q4.items[0].prorated === true);

const q5 = quote(DATA, { hours: 6, daysPerWeek: 5, weeks: 4, kids: 2 });
eq('طفلان بالباقة الشهرية: الإجمالي قبل الخصم 1700', q5.gross, 1700);
eq('خصم الأخوة 10% = 170', q5.discount, 170);
eq('الصافي 1530', q5.net, 1530);

const q6 = quote(DATA, { hours: 6, daysPerWeek: 5, weeks: 4, kids: 1, period: 'evening' });
eq('الفترتان متطابقتان في السعر', q6.net, q1.net);
ok('رابط المنتج يختلف بين الفترتين', q6.items[0].url !== q1.items[0].url);

/* ——————— 2) مقارنة المحرك ببحث شامل مستقل ——————— */

/** أقل تكلفة بالبحث الشامل على تركيبات الوحدات (تغطية ≥ الأيام المطلوبة). */
function brute(units, D) {
  const cap = units.map(u => Math.ceil(D / u.days));
  let best = Infinity;
  const walk = (i, days, cost) => {
    if (cost >= best) return;
    if (days >= D) { best = Math.min(best, cost); return; }
    if (i >= units.length) return;
    for (let n = 0; n <= cap[i]; n++) walk(i + 1, days + n * units[i].days, cost + n * units[i].cost);
  };
  walk(0, 0, 0);
  return best;
}

let bruteChecked = 0;
for (const period of ['morning', 'evening']) {
  for (let h = 1; h <= 10; h++) {
    for (let dpw = 1; dpw <= 5; dpw++) {
      for (const w of [1, 2, 3, 4, 6, 8]) {
        const q = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: w, kids: 1, period });
        // المقارنة على السعر المعلن (قبل خصم الدوام المرن) — فهو ناتج البرمجة الديناميكية.
        const b = brute(q.units.map(u => ({ days: u.days, cost: u.cost })), q.totalDays);
        if (q.listPerChild !== b) fails.push(`البحث الشامل يخالف المحرك عند h=${h} d=${dpw} w=${w} (${q.listPerChild} ≠ ${b})`);
        bruteChecked++;
      }
    }
  }
}
ok('المحرك يطابق البحث الشامل في ' + bruteChecked + ' حالة', true);

/* ——————— 3) مسح شامل: الثوابت التي يجب ألا تُخرق أبداً ——————— */

const URLS = new Set();
for (const key of Object.keys(DATA.periods)) {
  const p = DATA.periods[key];
  URLS.add(p.hour.url); URLS.add(p.categoryUrl);
  p.packages.forEach(pk => Object.values(pk.prices).forEach(c => URLS.add(c.url)));
}

let swept = 0, urlBad = 0, nameBad = 0, notCheapest = 0, cmpBad = 0, discBad = 0;
for (const period of ['morning', 'evening']) {
  for (let h = 1; h <= 10; h++) {
    for (let dpw = 1; dpw <= 5; dpw++) {
      for (let w = 1; w <= CFG.maxWeeks; w++) {
        for (let kids = 1; kids <= CFG.maxKids; kids++) {
          const q = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: w, kids, period });
          swept++;
          for (const it of q.items) {
            // العنصر المرن سعرٌ لا يقابله منتج، ويُفحص في قسم الخصم أدناه.
            if (it.flex) { if (it.url !== null || !it.title.startsWith('اشتراك مرن')) nameBad++; continue; }
            // السعر المتناسب مع أيام أقل لا يقابله منتج أيضاً — المتجر يبيع بالسعر الكامل.
            if (it.prorated) { if (it.url !== null) urlBad++; continue; }
            if (!URLS.has(it.url)) urlBad++;
            if (it.tier === null && it.title !== 'اشتراك بالساعة' && !it.title.startsWith('اشتراك بالساعة ×')) nameBad++;
            if (it.tier !== null && it.tier < h) nameBad++;
          }
          // الأقل تكلفة يجب ألا يتجاوز أي طريقة أخرى معروضة في المقارنة
          for (const r of q.rows) if (r.key !== 'best' && q.perChild > r.sum) notCheapest++;
          // لا صف مقارنة لطريقة بلا باقة حقيقية
          for (const r of q.rows) {
            if (['day', 'week', 'month', 'term'].includes(r.key)) {
              const u = q.units.find(x => x.key === r.key);
              if (!u.tier) cmpBad++;
            }
          }
          const expected = kids >= 2 ? Math.round(q.perChild * kids * CFG.siblingOff / 100) : 0;
          if (q.discount !== expected || q.net !== q.gross - q.discount) discBad++;
        }
      }
    }
  }
}
eq('كل رابط معروض موجود حرفياً في packages.json (' + swept + ' حالة)', urlBad, 0);
eq('لا يُسمّى أي مبلغ باسم باقة غير موجودة', nameBad, 0);
eq('التركيبة المختارة ليست أغلى من أي بديل معروض', notCheapest, 0);
eq('لا صف مقارنة لطريقة بلا باقة حقيقية', cmpBad, 0);
eq('خصم الأخوة والصافي صحيحان في كل الحالات', discBad, 0);

/* ——————— 4) سلامة بيانات الأسعار ——————— */

const seen = new Map();
let dup = 0, notHttps = 0, priceMismatch = 0;
for (const key of Object.keys(DATA.periods)) {
  const p = DATA.periods[key];
  const all = [p.hour.url, p.categoryUrl, ...p.packages.flatMap(pk => Object.values(pk.prices).map(c => c.url))];
  all.forEach(u => {
    if (!/^https:\/\//.test(u)) notHttps++;
    if (seen.has(u)) dup++; else seen.set(u, key);
  });
}
const M = periodTable(DATA, 'morning'), E = periodTable(DATA, 'evening');
TIERS.forEach(t => ['day', 'week', 'month', 'term'].forEach(k => {
  if (M.tiers[t][k].price !== E.tiers[t][k].price) priceMismatch++;
}));
eq('كل الروابط https', notHttps, 0);
eq('لا رابط مكرر بين المنتجات', dup, 0);
eq('الأسعار متطابقة بين الفترتين', priceMismatch, 0);
eq('سعر الساعة المفردة 25', CFG.hourly, 25);
ok('الشرائح المعلنة 4/5/6/8/10', TIERS.every(t => M.tiers[t]) && Object.keys(M.tiers).length === TIERS.length);

/* ——————— 5) لا سعر مكتوب في الكود ——————— */

const PRICE_LITERALS = [55, 65, 75, 90, 125, 250, 300, 350, 425, 600, 650, 750, 850, 1050, 1250, 2100, 2500, 2700, 3300, 4000];

/** يُبقي رموز الكود فقط: بلا تعليقات وبلا نصوص (فالأرقام داخلها ليست أسعاراً). */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^\\'])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^\\"])*"/g, '""')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/const MS = \{[^}]*\};/, ''); // توقيتات المحادثة، لا أسعار
}
for (const f of ['chat.js', 'chat-main.js', 'counters.js', 'build.mjs', 'ui.js']) {
  const src = codeOnly(readFileSync(join(ROOT, 'src', f), 'utf8'));
  const hits = PRICE_LITERALS.filter(n => new RegExp('(?<![\\d.])' + n + '(?![\\d.])').test(src));
  eq('لا أسعار مكتوبة في src/' + f, hits.length, 0, hits.join(','));
}
ok('توقيتات المحادثة 650/700/850 كما في كراسة التسليم',
  /const MS = \{ intro: 650, step: 700, result: 850/.test(readFileSync(join(ROOT, 'src', 'chat.js'), 'utf8')));

/* ——————— 7) المخرجات المبنية ——————— */

const PAGES = ['index.html', 'table/index.html', 'parents/index.html', 'embed/index.html', '404.html'];
ok('مجلد site/ موجود', existsSync(SITE));
for (const rel of PAGES) {
  if (!existsSync(join(SITE, rel))) { fails.push('ملف مفقود: site/' + rel); continue; }
  const html = read(rel);
  ok(rel + ': اتجاه RTL ولغة عربية', /<html lang="ar" dir="rtl">/.test(html));
  ok(rel + ': خطا Baloo وAlmarai محمّلان', html.includes('Baloo+Bhaijaan+2') && html.includes('Almarai'));
  ok(rel + ': غير مفهرس', html.includes('name="robots" content="noindex, nofollow"'));
  ok(rel + ': ورقة الأنماط مربوطة', html.includes('/assets/styles.css'));
  ok(rel + ': بيانات الأسعار مطبوعة وقت البناء', html.includes('id="rw-calc-data"'));
  ok(rel + ': لا كسر لوسم script داخل JSON', !/<\/script>\s*<\/script>/.test(html));
  const json = html.match(/<script type="application\/json" id="rw-calc-data">([\s\S]*?)<\/script>/);
  ok(rel + ': JSON المضمّن صالح', !!json && JSON.parse(json[1].replace(/\\u003c/g, '<')).hourlyRate === DATA.hourlyRate);
}

/* ——— المدد المعتمدة ثلاث فقط: أسبوع · شهر · ترم ——— */
const chatSrc = readFileSync(join(ROOT, 'src', 'chat.js'), 'utf8');
ok('خطوة المدة: لا زر «شهران»', !/qbtn\('شهران'/.test(chatSrc) && !read('index.html').includes('>شهران<'));
ok('خطوة المدة: أسبوع · شهر · ترم فقط',
  ['أسبوع', 'شهر', 'ترم كامل'].every(t => chatSrc.includes("qbtn('" + t + "'")) &&
  (chatSrc.match(/qbtn\('(أسبوع|شهر|ترم كامل)'/g) || []).length === 3);

/* ——— جدول المقارنة الكامل ——— */
const tbl = read('table/index.html');
const DURS = [{ w: 1, n: 'أسبوع', k: 'week' }, { w: CFG.monthWeeks, n: 'شهر', k: 'month' }, { w: CFG.termWeeks, n: 'ترم', k: 'term' }];
eq('جدول المقارنة: 15 جدولاً (3 مدد × 5 أيام)', (tbl.match(/class="rw-mx"/g) || []).length, 15);
ok('جدول المقارنة: بلا خيار شهران', !tbl.includes('شهران'));
ok('جدول المقارنة: يشرح مصدر كل عمود', tbl.includes('كيف تقرأ الجدول') && tbl.includes(String(RATES.month['3'])));
ok('جدول المقارنة: عمود «بعد الخصم»', tbl.includes('بعد الخصم'));

// كل خلية في الصفحة مطابقة للمحرك — مسح كامل على 150 خلية
let cellBad = 0, cells = 0, flexCells = 0;
for (const d of DURS) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const block = tbl.split('<figure class="rw-mx">').find(b =>
      b.includes('<b>' + d.n + '</b> · ' + ar(dpw, DAY_F) + ' أسبوعياً') && b.includes(coverDays(dpw * d.w)));
    if (!block) { fails.push('جدول مفقود: ' + d.n + ' · ' + dpw + ' أيام'); continue; }
    for (let h = 1; h <= 10; h++) {
      const q = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: d.w, duration: d.k, kids: 1 });
      const row = (block.match(new RegExp('<td>' + h + '</td>[\\s\\S]*?</tr>')) || [''])[0];
      cells++;
      const wantList = '<td>' + q.listPerChild + '</td>';
      const wantNet = q.flex ? '<td>' + q.perChild + '</td>' : '<span class="same">';
      if (!row.includes(wantList) || !row.includes(wantNet)) cellBad++;
      if (q.flex) flexCells++;
    }
  }
}
eq('جدول المقارنة: كل خلية مطابقة للمحرك (' + cells + ' خلية)', cellBad, 0);
ok('جدول المقارنة: فيه خلايا مخصومة فعلاً (' + flexCells + ')', flexCells > 0);

const idx = read('index.html');
ok('الصفحة الرئيسية: بلا رابط لصفحة العروض المحذوفة', !idx.includes('/promo/'));
ok('الصفحة الرئيسية: بلا حبّة «جدول الأسعار الكامل»', !idx.includes('جدول الأسعار الكامل ↗'));
ok('الصفحة الرئيسية: بلا حبّة «نسخة الأهالي»', !idx.includes('نسخة الأهالي مع روابط الشراء ↗'));
ok('صفحة /promo/ محذوفة', !existsSync(join(SITE, 'promo')));
ok('تحويل أي رابط /promo/ قديم إلى الحاسبة', read('_redirects').includes('/promo/* / 301'));

/* ——— خصم الدوام المرن في قاعدة الأسعار الرئيسية ——— */

const Q = (h, d, w, k, dur) => quote(DATA, { hours: h, daysPerWeek: d, weeks: w, kids: k || 1, duration: dur });

/* ——— تسعير الباقات غير الرسمية بسعر الساعة ——— */

const DUR3 = [{ w: 1, k: 'week' }, { w: CFG.monthWeeks, k: 'month' }, { w: CFG.termWeeks, k: 'term' }];

ok('الساعات غير الرسمية 2 · 3 · 7 · 9', FLEX_H.join(',') === '2,3,7,9', FLEX_H.join(','));
ok('لا سعر ساعة لأي ساعات لها باقة معلنة', FLEX_H.every(h => !hasOfficialPackage(DATA, h)));
ok('لكل مدة جدول أسعار ساعة كامل',
  DUR3.every(d => FLEX_H.every(h => typeof flexRate(POL, d.k, h) === 'number')));

// السعر = عدد الساعات × سعر الساعة (مقرَّباً لأسفل)، وهذا ما يمنع تطابق الأسعار
let rateMismatch = 0;
for (const d of DUR3) {
  for (const h of FLEX_H) {
    for (let dpw = 1; dpw <= 5; dpw++) {
      const q = Q(h, dpw, d.w, 1, d.k);
      const want = Math.floor(h * dpw * d.w * flexRate(POL, d.k, h) / POL.roundTo) * POL.roundTo;
      if (q.perChild !== Math.min(want, q.listPerChild)) rateMismatch++;
    }
  }
}
eq('السعر = الساعات × سعر الساعة في كل الحالات', rateMismatch, 0);

// الثابت الحاكم الذي طلبه العميل: اختلاف الساعات ⇒ اختلاف السعر
let sameForDiffHours = 0; const sameSample = [];
for (const d of DUR3) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const seen = new Map();
    for (let h = 1; h <= 10; h++) {
      const q = Q(h, dpw, d.w, 1, d.k);
      const prev = seen.get(q.net);
      // التطابق مقبول فقط بين ساعات تشترك في نفس الباقة المعلنة (7 و8 مثلاً بعد الترقية)
      if (prev !== undefined && !(hasOfficialPackage(DATA, h) && hasOfficialPackage(DATA, prev))) {
        const a = Q(prev, dpw, d.w, 1, d.k), b = q;
        if (a.totalHours !== b.totalHours && (a.flex || b.flex)) {
          sameForDiffHours++;
          if (sameSample.length < 3) sameSample.push(d.k + ' d=' + dpw + ' h=' + prev + '/' + h + ' = ' + q.net);
        }
      }
      seen.set(q.net, h);
    }
  }
}
eq('لا يدفع صاحب 36 ساعة كصاحب 48 ساعة', sameForDiffHours, 0, sameSample.join(' · '));

// الثوابت العامة
let officialTouched = 0, aboveList = 0, flexUrl = 0, notMono = 0, sweptD = 0, dayDup2 = 0;
for (const d of DUR3) {
  for (const kids of [1, 2, 4]) {
    for (let dpw = 1; dpw <= 5; dpw++) {
      let prev = -1;
      for (let h = 1; h <= 10; h++) {
        const q = Q(h, dpw, d.w, kids, d.k);
        sweptD++;
        if (hasOfficialPackage(DATA, h) && q.flex) officialTouched++;
        if (q.perChild > q.listPerChild) aboveList++;
        if (q.net < prev) notMono++;
        prev = q.net;
        for (const i of q.items) if ((i.flex || i.prorated) && i.url !== null) flexUrl++;
      }
    }
    for (let h = 1; h <= 10; h++) {
      const v = [1, 2, 3, 4, 5].map(dpw => Q(h, dpw, d.w, kids, d.k).net);
      for (let i = 1; i < 5; i++) if (v[i] === v[i - 1]) dayDup2++;
    }
  }
}
eq('الباقات المعلنة بلا أي مساس (' + sweptD + ' حالة)', officialTouched, 0);
eq('لا يتجاوز السعر المعلن أبداً', aboveList, 0);
eq('السعر لا ينقص كلما زادت الساعات', notMono, 0);
eq('لا تكرار في السعر بين عدد الأيام', dayDup2, 0);
eq('كل سعر لا يطابق المعلن بلا رابط متجر', flexUrl, 0);

// دوام 5 أيام = السعر المعلن حرفياً للباقات المعلنة
let fullWeekChanged = 0;
for (const d of DUR3) {
  for (const t of TIERS) if (Q(t, CFG.weekDays, d.w, 1, d.k).perChild !== M.tiers[t][d.k].price) fullWeekChanged++;
}
eq('دوام 5 أيام: الأسعار المعلنة كما هي', fullWeekChanged, 0);

// أمثلة صريحة من الجدول المعتمد
eq('3 ساعات × 3 أيام × شهر = 350', Q(3, 3, CFG.monthWeeks, 1, 'month').net, 350);
eq('3 ساعات × 4 أيام × شهر = 465', Q(3, 4, CFG.monthWeeks, 1, 'month').net, 465);
eq('ساعتان × 3 أيام × شهر = 315', Q(2, 3, CFG.monthWeeks, 1, 'month').net, 315);
eq('7 ساعات × 5 أيام × شهر = 910', Q(7, 5, CFG.monthWeeks, 1, 'month').net, 910);
eq('9 ساعات × 5 أيام × شهر = 1125', Q(9, 5, CFG.monthWeeks, 1, 'month').net, 1125);
eq('6 ساعات × 5 أيام × شهر = 850 معلنة', Q(6, 5, CFG.monthWeeks, 1, 'month').net, 850);
eq('الساعة الواحدة × يوم × أسبوع = 25', Q(1, 1, 1, 1, 'week').net, CFG.hourly);

// إيقاف السياسة يعيد الأسعار المعلنة كاملة
const OFFDATA = Object.assign({}, DATA, { discount: Object.assign({}, DISCOUNT, { active: false, prorate: false }) });
let offMismatch = 0;
for (let h = 1; h <= 10; h++) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const a = quote(OFFDATA, { hours: h, daysPerWeek: dpw, weeks: CFG.monthWeeks, kids: 1, duration: 'month' });
    if (a.flex || a.prorated || a.net !== a.listPerChild) offMismatch++;
  }
}
eq('active=false يعيد الأسعار المعلنة', offMismatch, 0);

/* ——————— النتيجة ——————— */

console.log('\nنجح ' + pass + ' فحصاً' + (fails.length ? '، وفشل ' + fails.length : '، بلا أخطاء') + '.');
if (fails.length) {
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ الحاسبة مطابقة للقواعد المعتمدة في design_handoff_calculator/README.md');
