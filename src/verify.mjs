// اختبارات المحرك الحسابي والمخرجات المبنية. يفشل بخروج غير صفري عند أي خلل.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quote, periodTable, bestUnit, defaults, TIERS, ar, coverDays, DAY_F } from './calc.js';
import { promoQuote, policy, officialHours, promoHoursList, discounted } from './promo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'packages.json'), 'utf8'));
const PROMO = JSON.parse(readFileSync(join(ROOT, 'data', 'promo.json'), 'utf8'));
const CFG = defaults(DATA);
const POL = policy(PROMO);

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
        const b = brute(q.units.map(u => ({ days: u.days, cost: u.cost })), q.totalDays);
        if (q.perChild !== b) fails.push(`البحث الشامل يخالف المحرك عند h=${h} d=${dpw} w=${w} (${q.perChild} ≠ ${b})`);
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
for (const f of ['chat.js', 'chat-main.js', 'chat-promo.js', 'promo.js', 'counters.js', 'build.mjs', 'ui.js']) {
  const src = codeOnly(readFileSync(join(ROOT, 'src', f), 'utf8'));
  const hits = PRICE_LITERALS.filter(n => new RegExp('(?<![\\d.])' + n + '(?![\\d.])').test(src));
  eq('لا أسعار مكتوبة في src/' + f, hits.length, 0, hits.join(','));
}
ok('توقيتات المحادثة 650/700/850 كما في كراسة التسليم',
  /const MS = \{ intro: 650, step: 700, result: 850/.test(readFileSync(join(ROOT, 'src', 'chat.js'), 'utf8')));

/* ——————— 6) العرض التحفيزي المؤقت — الباقات بالطلب ——————— */

const OFFICIAL = officialHours(DATA);
const PQ = (h, d, w, k, pr) => promoQuote(DATA, pr || PROMO, { hours: h, daysPerWeek: d, weeks: w, kids: k || 1 });

// المثال الذي أكّده العميل: 3 ساعات × 3 أيام × شهر = 36 ساعة × 15.29 ← 550.
const p1 = PQ(3, 3, CFG.monthWeeks, 1);
eq('العرض: 3 ساعات × 3 أيام × شهر = 550', p1.net, 550);
eq('العرض: السعر المعلن لنفس الدوام 650', p1.listNet, 650);
ok('العرض: سعر الساعة الفعلي ≈ ' + POL.hourlyRate, p1.effectiveHourly <= POL.hourlyRate && p1.effectiveHourly > POL.hourlyRate - 0.5, String(p1.effectiveHourly));

// الخلل الذي رصده العميل: ساعتان كانتا أغلى من 3 ساعات لنفس الدوام.
const p2 = PQ(2, 3, CFG.monthWeeks, 1);
ok('العرض: ساعتان × 3 أيام × شهر أقل من 3 ساعات', p2.net < p1.net, p2.net + ' مقابل ' + p1.net);
eq('العرض: ساعتان × 3 أيام × شهر = 24 ساعة × ' + POL.hourlyRate, p2.net, Math.floor(24 * POL.hourlyRate / POL.roundTo) * POL.roundTo);

// ——— الضمانة الحاكمة: لا يدفع صاحب الساعات الأقل أكثر ———
let notMonotonic = 0, monoChecked = 0;
const worst = [];
for (let dpw = 1; dpw <= 5; dpw++) {
  for (let w = 1; w <= CFG.maxWeeks; w++) {
    for (const kids of [1, 2, 3, 4]) {
      let prev = -1;
      for (let h = 1; h <= 10; h++) {
        const n = PQ(h, dpw, w, kids).net;
        if (n < prev) { notMonotonic++; if (worst.length < 3) worst.push(`d=${dpw} w=${w} k=${kids} h=${h}: ${n} < ${prev}`); }
        prev = n; monoChecked++;
      }
    }
  }
}
eq('العرض: السعر لا ينقص أبداً كلما زادت الساعات (' + monoChecked + ' حالة)', notMonotonic, 0, worst.join(' · '));

// ——— ثوابت أخرى على كامل الفضاء ———
let officialTouched = 0, aboveList = 0, urlLeak = 0, nonPositive = 0, overHourly = 0, sweptP = 0;
for (let h = 1; h <= 10; h++) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    for (const w of [1, 2, 4, 8, 16, 32]) {
      for (const kids of [1, 2, 4]) {
        const list = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: w, kids });
        const p = PQ(h, dpw, w, kids);
        sweptP++;
        if (OFFICIAL.includes(h) && p.net !== list.net) officialTouched++;
        if (p.net > list.net) aboveList++;
        if (p.net <= 0) nonPositive++;
        // الباقة بالطلب لا تتجاوز أبداً سعر الساعة المخفَّض لكامل الدوام
        if (!OFFICIAL.includes(h) && h >= POL.minPromoHours &&
            p.perChild > Math.floor(p.totalHours * POL.hourlyRate / POL.roundTo) * POL.roundTo) overHourly++;
        for (const i of p.items) if (i.promo && i.url !== null) urlLeak++;
      }
    }
  }
}
eq('العرض: الباقات الرسمية ' + OFFICIAL.join('/') + ' بلا أي مساس (' + sweptP + ' حالة)', officialTouched, 0);
eq('العرض: لا يتجاوز السعر المعلن أبداً', aboveList, 0);
eq('العرض: لا مبلغ صفري أو سالب', nonPositive, 0);
eq('العرض: الباقة بالطلب لا تتجاوز سعر الساعة المخفَّض', overHourly, 0);
eq('العرض: لا رابط متجر على أي سعر عرض', urlLeak, 0);

// إيقاف العرض يُعيد الأداة إلى السعر المعلن حرفياً
let offMismatch = 0;
for (let h = 1; h <= 10; h++) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const list = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: 4, kids: 1 });
    if (PQ(h, dpw, 4, 1, Object.assign({}, PROMO, { active: false })).net !== list.net) offMismatch++;
  }
}
eq('العرض: active=false يعيد السعر المعلن تماماً', offMismatch, 0);

// الساعات المشمولة = ما ليس له باقة معلنة، والساعة الواحدة مستثناة بسياسة minPromoHours
ok('العرض: الباقات بالطلب هي ' + promoHoursList(DATA, POL).join(' · '),
  promoHoursList(DATA, POL).join(',') === '2,3,7,9', promoHoursList(DATA, POL).join(','));
ok('العرض: لا شيء رسمي داخل قائمة الطلب', promoHoursList(DATA, POL).every(h => !OFFICIAL.includes(h)));
eq('العرض: الساعة الواحدة × يوم = السعر المعلن ' + CFG.hourly, PQ(1, 1, 1, 1).net, CFG.hourly);

// سلامة سياسة العرض في الملف
ok('سياسة العرض: سعر الساعة أقل من المعلن', POL.hourlyRate > 0 && POL.hourlyRate < CFG.hourly, String(POL.hourlyRate));
ok('سياسة العرض: النسبة بين 1 و50%', POL.off > 0 && POL.off <= 50, String(POL.off));
ok('سياسة العرض: التقريب من مضاعفات 5', [1, 5, 10].includes(POL.roundTo));
eq('سياسة العرض: 650 مخصومة ' + POL.off + '% = 550', discounted(650, POL), 550);
const badOverride = Object.keys(PROMO.overrides || {}).filter(k => OFFICIAL.includes(Number(k.split('/')[0])));
eq('سياسة العرض: لا تجاوز يدوي على ساعات رسمية', badOverride.length, 0, badOverride.join(','));
eq('خصم الأخوة في العرض هو نفسه', (PROMO.rules && PROMO.rules.siblingOff) ?? CFG.siblingOff, CFG.siblingOff);

/* ——————— 7) المخرجات المبنية ——————— */

const PAGES = ['index.html', 'promo/index.html', 'table/index.html', 'parents/index.html', 'embed/index.html', '404.html'];
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

const promoPage = read('promo/index.html');
ok('صفحة العرض: بيانات العرض مطبوعة وقت البناء', promoPage.includes('id="rw-promo-data"'));
ok('صفحة العرض: بلا أزرار شراء', !promoPage.includes('class="rw-buy"'));
ok('صفحة العرض: بلا اختيار فترة', !promoPage.includes('rw-seg__btn'));
ok('صفحة العرض: بطاقة شرح قاعدة الخصم', promoPage.includes('كيف يُحسب سعر العرض') && promoPage.includes(POL.off + '%'));
ok('صفحة العرض: تذكر الباقات الرسمية صراحةً', promoPage.includes(OFFICIAL.join(' · ') + ' ساعات'));
ok('صفحة العرض: رابط رجوع للحاسبة الرسمية', /href="\/"/.test(promoPage));
ok('صفحة العرض: JSON العرض صالح',
  JSON.parse((promoPage.match(/<script type="application\/json" id="rw-promo-data">([\s\S]*?)<\/script>/) || [, '{}'])[1].replace(/\\u003c/g, '<')).off === POL.off);

/* ——— المدد المعتمدة ثلاث فقط: أسبوع · شهر · ترم ——— */
const chatSrc = readFileSync(join(ROOT, 'src', 'chat.js'), 'utf8');
ok('خطوة المدة: لا زر «شهران»', !/qbtn\('شهران'/.test(chatSrc) && !read('index.html').includes('>شهران<'));
ok('خطوة المدة: أسبوع · شهر · ترم فقط',
  ['أسبوع', 'شهر', 'ترم كامل'].every(t => chatSrc.includes("qbtn('" + t + "'")) &&
  (chatSrc.match(/qbtn\('(أسبوع|شهر|ترم كامل)'/g) || []).length === 3);

/* ——— جدول المقارنة الكامل ——— */
const tbl = read('table/index.html');
const DURS = [{ w: 1, n: 'أسبوع' }, { w: CFG.monthWeeks, n: 'شهر' }, { w: CFG.termWeeks, n: 'ترم' }];
eq('جدول المقارنة: 15 جدولاً (3 مدد × 5 أيام)', (tbl.match(/class="rw-mx"/g) || []).length, 15);
ok('جدول المقارنة: بلا خيار شهران', !tbl.includes('شهران'));
ok('جدول المقارنة: يشرح مصدر كل عمود', tbl.includes('كيف تقرأ الجدول') && tbl.includes(String(POL.hourlyRate)));
ok('جدول المقارنة: مربوط من الصفحة الرئيسية', read('index.html').includes('href="/table/"'));

// كل خلية في الصفحة مطابقة للمحرك — مسح كامل على 150 خلية
let cellBad = 0, cells = 0, promoCells = 0;
for (const d of DURS) {
  for (let dpw = 1; dpw <= 5; dpw++) {
    const block = tbl.split('<figure class="rw-mx">').find(b =>
      b.includes('<b>' + d.n + '</b> · ' + ar(dpw, DAY_F) + ' أسبوعياً') && b.includes(coverDays(dpw * d.w)));
    if (!block) { fails.push('جدول مفقود: ' + d.n + ' · ' + dpw + ' أيام'); continue; }
    for (let h = 1; h <= 10; h++) {
      const l = quote(DATA, { hours: h, daysPerWeek: dpw, weeks: d.w, kids: 1 });
      const p = promoQuote(DATA, PROMO, { hours: h, daysPerWeek: dpw, weeks: d.w, kids: 1 });
      const row = (block.match(new RegExp('<td>' + h + '</td>[\\s\\S]*?</tr>')) || [''])[0];
      cells++;
      const wantList = '<td>' + l.net + '</td>';
      const wantPromo = p.net < l.net ? '<td>' + p.net + '</td>' : '<span class="same">';
      if (!row.includes(wantList) || !row.includes(wantPromo)) cellBad++;
      if (p.net < l.net) promoCells++;
    }
  }
}
eq('جدول المقارنة: كل خلية مطابقة للمحرك (' + cells + ' خلية)', cellBad, 0);
ok('جدول المقارنة: فيه خلايا عرض فعلية (' + promoCells + ')', promoCells > 0);

const idx = read('index.html');
ok('الصفحة الرئيسية: رابط ظاهر لحاسبة العرض المؤقت', idx.includes('href="/promo/"') && idx.includes('حاسبة العرض المؤقت'));
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

for (const f of ['calc.js', 'promo.js', 'ui.js', 'chat.js', 'chat-main.js', 'chat-promo.js', 'counters.js']) {
  ok('assets/' + f + ' منسوخ', existsSync(join(SITE, 'assets', f)));
}

/* ——————— النتيجة ——————— */

console.log('\nنجح ' + pass + ' فحصاً' + (fails.length ? '، وفشل ' + fails.length : '، بلا أخطاء') + '.');
if (fails.length) {
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ الحاسبة مطابقة للقواعد المعتمدة في design_handoff_calculator/README.md');
