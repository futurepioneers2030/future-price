// اختبارات المحرك الحسابي والمخرجات المبنية. يفشل بخروج غير صفري عند أي خلل.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  quote, periodTable, bestUnit, defaults, TIERS, ar, coverDays, DAY_F,
  discountPolicy, flexRate, hasOfficialPackage, durationOf
} from './calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'packages.json'), 'utf8'));
const DISCOUNT = JSON.parse(readFileSync(join(ROOT, 'data', 'discount.json'), 'utf8'));
DATA.discount = DISCOUNT;
const CFG = defaults(DATA);
const POL = discountPolicy(DATA);
const RATE = flexRate(DATA, POL);
const OFFICIAL = DATA.periods.morning.packages.map(p => p.hours);

let pass = 0; const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else fails.push(name + (extra ? ' → ' + extra : '')); };
const eq = (name, got, want) => ok(name, got === want, 'المتوقع ' + want + ' والناتج ' + got);
const read = rel => readFileSync(join(SITE, rel), 'utf8');

/* ——————— 1) أمثلة التحقق المعتمدة في كراسة التسليم ——————— */

const q1 = quote(DATA, { hours: 6, daysPerWeek: 5, weeks: 4, kids: 1 });
eq('6 ساعات × 5 أيام × 4 أسابيع = 850', q1.net, 850);
ok('المثال 1 يستخدم الاشتراك الشهري', q1.items.length === 1 && q1.items[0].key === 'month' && q1.items[0].tier === 6, JSON.stringify(q1.items.map(i => i.key + '/' + i.tier)));

const q2 = quote(DATA, { hours: 9, daysPerWeek: 5, weeks: 4, kids: 1 });
ok('9 ساعات تُحسب على شريحة 10 لا على 8+ساعة', q2.items.every(i => i.tier === null || i.tier === 10) && q2.upTier === 10, 'upTier=' + q2.upTier);
const day9 = bestUnit(periodTable(DATA, 'morning'), 'day', 1, 9, CFG);
eq('سعر اليوم عند 9 ساعات = 125 (باقة 10)', day9.cost, 125);
eq('شريحة اليوم عند 9 ساعات = 10', day9.tier, 10);

const q3 = quote(DATA, { hours: 1, daysPerWeek: 1, weeks: 1, kids: 1 });
eq('ساعة × يوم × أسبوع = 25', q3.net, 25);
ok('لا اسم باقة عند مسار الساعة', q3.items.every(i => i.tier === null && i.title.startsWith('اشتراك بالساعة')), JSON.stringify(q3.items.map(i => i.title)));
ok('لا صفوف أسبوعي/شهري/ترم في المقارنة عند مسار الساعة',
  q3.rows.every(r => ['best', 'hourly'].includes(r.key)), JSON.stringify(q3.rows.map(r => r.key)));
ok('لا تنبيه ترقية عندما لا تُستخدم أي باقة', q3.upgraded === false);

const q4 = quote(DATA, { hours: 6, daysPerWeek: 3, weeks: 1, kids: 1 });
eq('6 ساعات × 3 أيام × أسبوع = 225 (اليومي أرخص من الأسبوعي)', q4.net, 225);
ok('المثال 4 يستخدم اشتراك اليوم ×3', q4.items.length === 1 && q4.items[0].key === 'day' && q4.items[0].count === 3);

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
ok('جدول المقارنة: يشرح مصدر كل عمود', tbl.includes('كيف تقرأ الجدول') && tbl.includes(String(RATE)));
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

eq('سعر الساعة بعد الخصم = ' + RATE, RATE, Math.round(CFG.hourly * (1 - POL.hourlyOff / 100) * 100) / 100);
eq('الخصم: ساعتان × 4 أيام × شهر = 520 (بدل 650)', Q(2, 4, CFG.monthWeeks, 1).net, 520);
eq('الخصم: نفس المثال بالأسعار المعلنة 650', Q(2, 4, CFG.monthWeeks, 1).listPerChild, 650);
eq('الخصم: ساعتان × 3 أيام × شهر = 390 (بدل 600)', Q(2, 3, CFG.monthWeeks, 1).net, 390);
eq('الخصم: 3 ساعات × 3 أيام × شهر = 550 (بدل 650)', Q(3, 3, CFG.monthWeeks, 1).net, 550);

// خصم النسبة على الباقة — يفيد 7 و9 ساعات
eq('الخصم: 7 ساعات × 5 أيام × شهر = 890 (بدل 1050)', Q(7, 5, CFG.monthWeeks, 1).net, 890);
eq('الخصم: 9 ساعات × 5 أيام × شهر = 1060 (بدل 1250)', Q(9, 5, CFG.monthWeeks, 1).net, 1060);
ok('الخصم: 7 و9 يسلكان مسار الباقة لا الساعة',
  Q(7, 5, CFG.monthWeeks, 1).flexKind === 'package' && Q(9, 5, CFG.monthWeeks, 1).flexKind === 'package');
ok('الخصم: 7 ساعات تبقى أغلى من 6 ساعات المعلنة',
  Q(7, 5, CFG.monthWeeks, 1).net > Q(6, 5, CFG.monthWeeks, 1).net,
  Q(7, 5, CFG.monthWeeks, 1).net + ' مقابل ' + Q(6, 5, CFG.monthWeeks, 1).net);
ok('الخصم: 9 ساعات تبقى أغلى من 8 ساعات المعلنة',
  Q(9, 5, CFG.monthWeeks, 1).net > Q(8, 5, CFG.monthWeeks, 1).net);
ok('سياسة الخصم: نسبة الباقة ≤ 16% (فوقها ينكسر ترتيب الأسعار)',
  POL.packageOff > 0 && POL.packageOff <= 16, String(POL.packageOff));
ok('الخصم: سطر الباقة المخصومة بلا رابط متجر',
  Q(7, 5, CFG.monthWeeks, 1).items.every(i => !i.flex || i.url === null));
ok('الخصم: سعر الساعة الفعلي = ' + RATE + ' في المثال', Q(2, 4, CFG.monthWeeks, 1).net / 32 === RATE);
ok('الخصم: العنصر المرن بلا رابط متجر', Q(2, 4, CFG.monthWeeks, 1).items.every(i => !i.flex || i.url === null));

let officialTouched = 0, aboveList = 0, weekTermTouched = 0, oneHourTouched = 0, flexUrl = 0, notMono = 0, sweptD = 0;
for (let h = 1; h <= 10; h++) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    for (const d of [{ w: 1, k: 'week' }, { w: CFG.monthWeeks, k: 'month' }, { w: CFG.termWeeks, k: 'term' }]) {
      for (const kids of [1, 2, 4]) {
        const q = Q(h, dpw, d.w, kids, d.k);
        sweptD++;
        if (OFFICIAL.includes(h) && q.flex) officialTouched++;
        if (h === 1 && q.flex) oneHourTouched++;
        if (!POL.durations.includes(d.k) && q.flex) weekTermTouched++;
        if (q.perChild > q.listPerChild) aboveList++;
        for (const i of q.items) if (i.flex && i.url !== null) flexUrl++;
      }
    }
  }
}
eq('الخصم: الباقات المعلنة ' + OFFICIAL.join('/') + ' بلا أي مساس (' + sweptD + ' حالة)', officialTouched, 0);
eq('الخصم: الساعة الواحدة بلا مساس', oneHourTouched, 0);
eq('الخصم: مقصور على ' + POL.durations.join('/'), weekTermTouched, 0);
eq('الخصم: لا يتجاوز السعر المعلن أبداً', aboveList, 0);
eq('الخصم: لا رابط متجر على أي سعر مرن', flexUrl, 0);

// الرتابة: لا يدفع صاحب الساعات الأقل أكثر
for (let dpw = 1; dpw <= 5; dpw++) {
  for (const d of [{ w: 1, k: 'week' }, { w: CFG.monthWeeks, k: 'month' }, { w: CFG.termWeeks, k: 'term' }]) {
    for (const kids of [1, 2, 4]) {
      let prev = -1;
      for (let h = 1; h <= 10; h++) {
        const n = Q(h, dpw, d.w, kids, d.k).net;
        if (n < prev) notMono++;
        prev = n;
      }
    }
  }
}
eq('الخصم: السعر لا ينقص كلما زادت الساعات', notMono, 0);

// إيقاف الخصم يعيد كل شيء إلى السعر المعلن
let offMismatch = 0;
const OFFDATA = Object.assign({}, DATA, { discount: Object.assign({}, DISCOUNT, { active: false }) });
for (let h = 1; h <= 10; h++) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const a = quote(OFFDATA, { hours: h, daysPerWeek: dpw, weeks: CFG.monthWeeks, kids: 1, duration: 'month' });
    if (a.flex || a.net !== a.listPerChild) offMismatch++;
  }
}
eq('الخصم: active=false يعيد الأسعار المعلنة', offMismatch, 0);

ok('سياسة الخصم: النسبة بين 1 و60%', POL.hourlyOff > 0 && POL.hourlyOff <= 60, String(POL.hourlyOff));
ok('سياسة الخصم: الساعات المشمولة 2 · 3 · 7 · 9',
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(h => h >= POL.minHours && !hasOfficialPackage(DATA, h)).join(',') === '2,3,7,9');
eq('durationOf يميّز الشهر', durationOf(CFG.monthWeeks, CFG), 'month');
ok('بطاقة شرح الخصم في الأداة الداخلية', idx.includes(POL.label) && idx.includes(String(RATE)));
ok('الأداة الداخلية: بلا أزرار شراء', !idx.includes('class="rw-buy"'));
ok('الأداة الداخلية: بلا اختيار فترة', !idx.includes('rw-seg__btn'));
ok('الأداة الداخلية: تنبيه تطابق الفترتين', idx.includes('الأسعار متطابقة في الفترتين'));
ok('الأداة الداخلية: بديل بدون JavaScript = جدول الأسعار الكامل', idx.includes('جدول الأسعار المعلن') && idx.includes('الحاسبة تحتاج JavaScript'));
ok('الأداة الداخلية: بلا روابط شراء في الجدول البديل', !/rw-table[\s\S]*?<a href="https:\/\/futurepioneers\.net\/[^"]*p\d/.test(idx));
ok('الأداة الداخلية: تذييل مختصر بلا أزرار تواصل', !idx.includes('rw-fbtn'));

const par = read('parents/index.html');
ok('نسخة الأهالي: رابط شراء لكل عنصر متاح', par.includes('id="rw-calc"'));
ok('نسخة الأهالي: تذييل تواصل كامل', par.includes('rw-fbtn--wa') && par.includes(DATA.contact.whatsapp));
ok('نسخة الأهالي: الشريحتان (تابي وتمارا · اشتراك مرن)', DATA.notes.every(n => par.includes(n)));
ok('نسخة الأهالي: رابط قسم المتجر', par.includes('id="rw-cat"'));

const emb = read('embed/index.html');
ok('نسخة التضمين: بلا ترويسة ولا تذييل', !emb.includes('rw-head') && !emb.includes('rw-foot'));
ok('نسخة التضمين: صنف rw-embed على body', emb.includes('<body class="rw-embed">'));

/* ——————— 7) أهداف اللمس والأنماط ——————— */

const css = read('assets/styles.css');
const MIN = { '.rw-bump': 68, '.rw-qbtn': 62, '.rw-nav__btn': 48, '.rw-seg__btn': 56, '.rw-buy': 52, '.rw-fbtn': 56, '.rw-chip--link': 44 };
for (const [sel, px] of Object.entries(MIN)) {
  const block = css.match(new RegExp(sel.replace('.', '\\.') + '\\{([^}]*)\\}'));
  const m = block && block[1].match(/(?:min-)?height:(\d+)px/);
  ok('هدف اللمس ' + sel + ' ≥ 44px', !!m && Number(m[1]) >= 44 && Number(m[1]) === px, m ? m[1] + 'px' : 'غير موجود');
}
ok('كل الألوان من رموز التصميم', !/#(?!D60859|941249|5E0B30|E8BD4B|2A1B22|4A323E|FBF2E7|F0DECC|EAD9C6|F3D9E4|FFF7E8|FFE9C4|FFEBC7|fff\b)[0-9a-fA-F]{3,6}\b/.test(css));
ok('احترام تقليل الحركة', css.includes('prefers-reduced-motion'));
ok('مؤشر تركيز ظاهر', css.includes(':focus-visible'));

for (const f of ['calc.js', 'ui.js', 'chat.js', 'chat-main.js', 'counters.js']) {
  ok('assets/' + f + ' منسوخ', existsSync(join(SITE, 'assets', f)));
}

/* ——————— النتيجة ——————— */

console.log('\nنجح ' + pass + ' فحصاً' + (fails.length ? '، وفشل ' + fails.length : '، بلا أخطاء') + '.');
if (fails.length) {
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ الحاسبة مطابقة للقواعد المعتمدة في design_handoff_calculator/README.md');
