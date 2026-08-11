// يولّد site/ من data/packages.json — لا سعر ولا رابط مكتوب هنا.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaults, assumptionsLine, TIERS, quote as quoteFn, ar, coverDays, DAY_F,
  discountPolicy, flexRate, flexHours, hasOfficialPackage
} from './calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'packages.json'), 'utf8'));
const DISCOUNT = JSON.parse(readFileSync(join(ROOT, 'data', 'discount.json'), 'utf8'));
const CFG = defaults(DATA);
// سياسة الخصم تُدمج في البيانات المطبوعة، فيراها المتصفح والاختبار معاً.
DATA.discount = DISCOUNT;
const POL = discountPolicy(DATA);
const RATES = POL.hourlyRates;
const OFFICIAL = DATA.periods.morning.packages.map(p => p.hours);
const FLEX_HOURS = POL.active ? flexHours(POL).filter(h => !hasOfficialPackage(DATA, h)) : [];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (rel, body) => {
  const p = join(SITE, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
  return rel;
};

/* ——— قطع مشتركة ——— */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@600;700;800&amp;family=Almarai:wght@400;700;800&amp;display=swap" rel="stylesheet">`;

// البيانات تُطبع وقت البناء — لا جلب ولا API وقت التشغيل.
const jsonScript = (id, obj) =>
  `<script type="application/json" id="${id}">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const head = ({ title, desc, extra = '' }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#D60859">
<meta name="description" content="${esc(desc)}">
<title>${esc(title)}</title>
<link rel="icon" href="${esc(DATA.logo)}">
${FONTS}
<link rel="stylesheet" href="/assets/styles.css">
${extra}
${jsonScript('rw-calc-data', DATA)}`;

const headerBlock = ({ h1, lede, chips = [] }) => `<header class="rw-head">
  <img class="rw-logo" src="${esc(DATA.logo)}" alt="${esc(DATA.brand)}">
  <h1 class="rw-h1${h1.length > 22 ? ' rw-h1--sm' : ''}">${esc(h1)}</h1>
  <p class="rw-lede">${esc(lede)}</p>
  ${chips.length ? `<div class="rw-chips rw-chips--top">${chips.join('')}</div>` : ''}
</header>`;

const chip = (t, kind) => `<span class="rw-chip${kind ? ' rw-chip--' + kind : ''}">${esc(t)}</span>`;
const chipLink = (t, href, kind) => `<a class="rw-chip rw-chip--link${kind ? ' rw-chip--' + kind : ''}" href="${esc(href)}">${esc(t)}</a>`;

const ICON_WA = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5 13.6c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"/></svg>`;
const ICON_TEL = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg>`;
const ICON_MAP = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

const footFull = () => `<footer class="rw-foot">
  <div class="rw-foot__title">تواصل معنا</div>
  <div class="rw-foot__links">
    <a class="rw-fbtn rw-fbtn--wa" href="${esc(DATA.contact.whatsapp)}" target="_blank" rel="noopener">${ICON_WA} واتساب</a>
    <a class="rw-fbtn rw-fbtn--tel" href="tel:${esc(DATA.contact.phone)}">${ICON_TEL} اتصال ${esc(DATA.contact.phone)}</a>
    <a class="rw-fbtn rw-fbtn--map" href="${esc(DATA.contact.mapsUrl)}" target="_blank" rel="noopener">${ICON_MAP} موقعنا على الخريطة</a>
  </div>
  <p class="rw-foot__addr">${esc(DATA.contact.address)}<br>${esc(DATA.contact.hours)}</p>
  <p class="rw-foot__brand">${esc(DATA.brand)}</p>
</footer>`;

const footSlim = () => `<footer class="rw-foot rw-foot--slim">
  <p class="rw-foot__addr">${esc(DATA.contact.address)}<br>${esc(DATA.contact.hours)}</p>
  <p class="rw-foot__brand">${esc(DATA.brand)}</p>
</footer>`;

const assumptionsCard = () => `<section class="rw-card rw-card--dashed" aria-label="الأساس الحسابي">
  <h2 class="rw-card__title">الأساس الحسابي</h2>
  <p class="rw-prose">${esc(assumptionsLine(CFG))}</p>
</section>`;

/* ——— خصم الدوام المرن ——— */

const DUR_AR = { week: 'الأسبوع', month: 'الشهر', term: 'الترم' };

const discountRulesCard = () => !POL.active ? '' : `<section class="rw-card rw-card--dashed" aria-label="خصم الدوام المرن">
  <h2 class="rw-card__title">${esc(POL.label)}</h2>
  <ul class="rw-rules">
    <li><b>الأسعار المعلنة لدوام ${POL.prorateBase} أيام أسبوعياً</b> — ومن يدوم أياماً أقل يدفع
      <b>بنسبة أيامه</b> (3 أيام = ⅗ السعر). فلكل عدد أيام سعرٌ مختلف، ولا يتكرر السعر.</li>
    <li><b>الباقات المعلنة (${OFFICIAL.join(' · ')} ساعات)</b> — عند الدوام الكامل بسعرها في الدليل، بلا أي تغيير.</li>
    <li><b>الساعة الواحدة</b> — بسعرها المعلن ${CFG.hourly} ريال، وهو سعر رئيسي في الدليل.</li>
    <li><b>من ساعاته لا تقابلها باقة (${FLEX_HOURS.join(' · ')} ساعات)</b> — له
      <b>سعر ساعة محدد</b>، والسعر = عدد الساعات الكلي × سعر الساعة. فمن يطلب 36 ساعة
      لا يدفع أبداً كمن يطلب 48 ساعة:
      <div class="rw-table-wrap"><table class="rw-table rw-table--mx">
        <thead><tr><th scope="col">المدة</th>${FLEX_HOURS.map(h => `<th scope="col">${h} ساعات</th>`).join('')}</tr></thead>
        <tbody>${Object.keys(RATES).map(d => `<tr><td>${esc(DUR_AR[d] || d)}</td>${FLEX_HOURS.map(h => `<td>${RATES[d][h] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></li>
    <li><b>التقريب لأسفل لأقرب ${POL.roundTo} ريالات</b>، ولا يتجاوز السعر المعلن أبداً.</li>
    <li><b>خصم الأخوة ${CFG.siblingOff}%</b> من طفلين — يُطبَّق بعد ذلك كالمعتاد.</li>
  </ul>
  <p class="rw-prose">السعر المرن غير مرتبط بمنتج في المتجر — يُفعَّل عبر إدارة المركز.</p>
</section>`;

/** جدول الأسعار الكامل لفترة واحدة — البديل الثابت عند تعطيل JavaScript. */
function priceTable(periodKey, withLinks) {
  const p = DATA.periods[periodKey];
  const cols = ['day', 'week', 'month', 'term'];
  const th = cols.map(c => `<th scope="col">${esc(DATA.durations[c])}</th>`).join('');
  const cell = (cellData) => withLinks
    ? `<td><a href="${esc(cellData.url)}" target="_blank" rel="noopener">${cellData.price}</a></td>`
    : `<td>${cellData.price}</td>`;
  const rows = p.packages.map(pk =>
    `<tr><td>${esc(pk.label)}</td>${cols.map(c => cell(pk.prices[c])).join('')}</tr>`).join('\n      ');
  const hourRow = withLinks
    ? `<tr><td>${esc(p.hour.label)}</td><td><a href="${esc(p.hour.url)}" target="_blank" rel="noopener">${p.hour.price}</a></td><td colspan="3">—</td></tr>`
    : `<tr><td>${esc(p.hour.label)}</td><td>${p.hour.price}</td><td colspan="3">—</td></tr>`;
  return `<div class="rw-table-wrap"><table class="rw-table">
      <caption>${esc(p.label)} — الأسعار بالريال لدوام ${POL.prorateBase} أيام أسبوعياً</caption>
      <thead><tr><th scope="col">الباقة</th>${th}</tr></thead>
      <tbody>
      ${hourRow}
      ${rows}
      </tbody></table></div>`;
}

/** المحتوى الظاهر قبل تشغيل الحاسبة (وعند تعطيل JavaScript أو فشل تحميلها). */
function fallback(withLinks) {
  return `<section class="rw-card" aria-label="جدول الأسعار">
    <h2 class="rw-card__title">جدول الأسعار المعلن</h2>
    <p class="rw-card__note">الحاسبة تحتاج JavaScript. هذه أسعار الباقات كاملة كما هي في المتجر — والأسعار متطابقة في الفترتين، ويختلف رابط المنتج فقط.</p>
    ${priceTable('morning', withLinks)}
    ${priceTable('evening', withLinks)}
    <p class="rw-cat"><a href="${esc(DATA.periods.morning.categoryUrl)}" target="_blank" rel="noopener">تصفح كل الباقات في المتجر ↗</a></p>
  </section>`;
}

/* ——— جدول المقارنة الكامل ——— */

// المدد المعتمدة ثلاث فقط: أسبوع · شهر · ترم.
const DURATIONS = [
  { key: 'week', label: 'أسبوع', weeks: 1, sub: 'أسبوع واحد' },
  { key: 'month', label: 'شهر', weeks: CFG.monthWeeks, sub: CFG.monthWeeks + ' أسابيع' },
  { key: 'term', label: 'ترم', weeks: CFG.termWeeks, sub: CFG.termWeeks + ' أسبوعاً (4 أشهر)' }
];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DAYS = [1, 2, 3, 4, 5];

function matrixTable(dur, dpw) {
  const rows = HOURS.map(h => {
    const q = quoteFn(DATA, { hours: h, daysPerWeek: dpw, weeks: dur.weeks, duration: dur.key, kids: 1 });
    const list = q.listPerChild;
    const diff = list - q.perChild;
    const off = diff > 0 ? Math.round((diff / list) * 1000) / 10 : 0;
    const official = OFFICIAL.includes(h);
    return `<tr class="${diff > 0 ? 'is-promo' : (official ? 'is-official' : '')}">
      <td>${h}</td><td>${list}</td><td>${diff > 0 ? q.perChild : '<span class="same">نفسه</span>'}</td>
      <td>${diff > 0 ? '−' + diff + ' <small>(−' + off + '%)</small>' : (official ? '<span class="tag">معلنة</span>' : '—')}</td>
    </tr>`;
  }).join('\n      ');
  return `<figure class="rw-mx">
    <figcaption><b>${esc(dur.label)}</b> · ${esc(ar(dpw, DAY_F))} أسبوعياً
      <span>${esc(coverDays(dpw * dur.weeks))}</span></figcaption>
    <table class="rw-table rw-table--mx">
      <thead><tr><th scope="col">ساعات</th><th scope="col">قبل الخصم</th><th scope="col">بعد الخصم</th><th scope="col">الفرق</th></tr></thead>
      <tbody>
      ${rows}
      </tbody>
    </table>
  </figure>`;
}

const matrixSection = () => DURATIONS.map(dur => `<section class="rw-card" aria-label="جدول ${esc(dur.label)}">
  <h2 class="rw-card__title">اشتراك ${esc(dur.label)} <span class="rw-card__sub">${esc(dur.sub)}</span></h2>
  <div class="rw-mx-grid">${DAYS.map(d => matrixTable(dur, d)).join('\n')}</div>
</section>`).join('\n');

const page = ({ title, desc, bodyClass = '', extraHead = '', body, script }) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
${head({ title, desc, extra: extraHead })}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
<script type="module" src="${script}"></script>
</body>
</html>
`;

/* ——— الصفحات ——— */

// 1) الأداة الداخلية (المعتمدة) — محادثة، بلا فترة وبلا أزرار شراء.
const indexHtml = page({
  title: 'حاسبة تسعير الاشتراكات — ' + DATA.brand,
  desc: 'أداة داخلية لإدارة المركز تحسب السعر العادل لأي دوام من أسعار الباقات المعلنة.',
  script: '/assets/chat-main.js',
  body: `<a class="rw-skip" href="#rw-chat">تخطَّ إلى الحاسبة</a>
<div class="rw-shell">
  <div class="rw-bar"></div>
  ${headerBlock({
    h1: 'حاسبة تسعير الاشتراكات',
    lede: 'أداة داخلية لإدارة المركز — تحسب السعر العادل من الباقات المعلنة',
    chips: [
      chip('الأسعار متطابقة في الفترتين الصباحية والمسائية')
    ].filter(Boolean)
  })}
  <main class="rw-wrap rw-wrap--narrow">
    <div id="rw-chat">${fallback(false)}</div>
    ${discountRulesCard()}
    ${assumptionsCard()}
  </main>
  ${footSlim()}
  <div class="rw-bar rw-bar--end"></div>
</div>`
});

// 2) نسخة الأهالي — عدّادات + فترة + روابط شراء + مقارنة.
const parentsBody = (embed) => `<div class="rw-shell">
  ${embed ? '' : '<div class="rw-bar"></div>'}
  ${embed ? '' : headerBlock({
    h1: 'حاسبة أسعار الاشتراك',
    lede: 'حدد أيام وساعات دوام طفلك، ونحسب لك السعر العادل من باقاتنا',
    chips: [chipLink('أداة التسعير الداخلية ↗', '/')]
  })}
  <main class="rw-wrap" id="rw-calc-main">
    <div id="rw-calc">${fallback(true)}</div>
    ${assumptionsCard()}
    <div class="rw-chips" style="margin-top:16px">${DATA.notes.map(n => chip(n)).join('')}</div>
    <p class="rw-cat"><a id="rw-cat" href="${esc(DATA.periods.morning.categoryUrl)}" target="_blank" rel="noopener">تصفح كل باقات ${esc(DATA.periods.morning.label)} في المتجر ↗</a></p>
  </main>
  ${embed ? '' : footFull()}
  ${embed ? '' : '<div class="rw-bar rw-bar--end"></div>'}
</div>`;

const parentsHtml = page({
  title: 'حاسبة أسعار الاشتراك — ' + DATA.brand,
  desc: 'احسب السعر العادل لاشتراك طفلك من باقات المركز المعلنة، مع رابط شراء لكل عنصر.',
  script: '/assets/counters.js',
  body: `<a class="rw-skip" href="#rw-calc">تخطَّ إلى الحاسبة</a>\n` + parentsBody(false)
});

const embedHtml = page({
  title: 'حاسبة أسعار الاشتراك (تضمين)',
  desc: 'نسخة قابلة للتضمين داخل المتجر.',
  bodyClass: 'rw-embed',
  script: '/assets/counters.js',
  body: parentsBody(true)
});

// 3) جدول المقارنة الكامل — المعلن مقابل العرض، لكل الساعات والأيام والمدد.
const tableHtml = page({
  title: 'جدول الأسعار الكامل — ' + DATA.brand,
  desc: 'مقارنة كاملة بين الأسعار المعلنة والأسعار بعد الخصم لكل الساعات والأيام والمدد.',
  script: '/assets/noop.js',
  body: `<div class="rw-shell">
  <div class="rw-bar"></div>
  ${headerBlock({
    h1: 'جدول الأسعار الكامل',
    lede: 'الأسعار المعلنة مقابل الأسعار بعد الخصم — لكل طفل، قبل خصم الأخوة',
    chips: [
      chipLink('← الحاسبة الرسمية', '/'),
      chipLink('حاسبة الأهالي ↗', '/parents/')
    ]
  })}
  <main class="rw-wrap rw-wrap--wide">
    <section class="rw-card rw-card--dashed" aria-label="كيف تقرأ الجدول">
      <h2 class="rw-card__title">كيف تقرأ الجدول</h2>
      <ul class="rw-rules">
        <li><b>قبل الخصم</b> — أقل تركيبة من باقات الدليل، <b>متناسبةً مع أيام الدوام</b>: الأسعار المعلنة لدوام ${POL.prorateBase} أيام، ومن يدوم 3 أيام يدفع ⅗ السعر.</li>
        <li><b>بعد الخصم</b> — من ساعاته لا تقابلها باقة (${FLEX_HOURS.join(' · ')} ساعات) يُحسب بسعر ساعة محدد: عدد الساعات الكلي × سعر الساعة. أسعار الساعة ${Object.keys(RATES).map(d => (DUR_AR[d] || d) + ': ' + FLEX_HOURS.map(h => h + '‏س=' + RATES[d][h]).join(' · ')).join(' — ')}.</li>
        <li><b>نفسه</b> — الساعات لها باقة معلنة أو الخصم لا ينطبق، فالسعر هو المتناسب بلا خصم إضافي.</li>
        <li>كل المبالغ <b>لكل طفل</b> وقبل خصم الأخوة ${CFG.siblingOff}% (من طفلين فأكثر).</li>
        <li>المدد المعتمدة ثلاث: <b>أسبوع · شهر · ترم</b>. والأسعار متطابقة في الفترتين الصباحية والمسائية.</li>
        <li><b>عمود 5 أيام يساوي السعر المعلن حرفياً</b> — لم يتغيّر شيء لمن يدوم دواماً كاملاً.</li>
      </ul>
    </section>
    ${matrixSection()}
    ${assumptionsCard()}
  </main>
  ${footSlim()}
  <div class="rw-bar rw-bar--end"></div>
</div>`
});

const notFoundHtml = page({
  title: 'الصفحة غير موجودة — ' + DATA.brand,
  desc: 'الصفحة المطلوبة غير موجودة.',
  script: '/assets/noop.js',
  body: `<div class="rw-shell">
  <div class="rw-bar"></div>
  ${headerBlock({ h1: 'الصفحة غير موجودة', lede: 'الرابط الذي فتحته غير صحيح أو تغيّر.', chips: [chipLink('أداة التسعير الداخلية ↗', '/'), chipLink('حاسبة الأهالي ↗', '/parents/')].filter(Boolean) })}
  <main class="rw-wrap rw-wrap--narrow"></main>
  ${footSlim()}
  <div class="rw-bar rw-bar--end"></div>
</div>`
});

/* ——— الكتابة ——— */

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

const out = [
  write('index.html', indexHtml),
  write('table/index.html', tableHtml),
  write('parents/index.html', parentsHtml),
  write('embed/index.html', embedHtml),
  write('404.html', notFoundHtml),
  write('robots.txt', 'User-agent: *\nDisallow: /\n'),
  // صفحة العروض المؤقتة أُلغيت وانتقل الخصم إلى الحاسبة الرئيسية —
  // أي رابط قديم محفوظ يُحوَّل إليها بدل أن يعرض أسعاراً متجاوَزة.
  write('_redirects', '/promo/* / 301\n/promo / 301\n'),
  write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()

/assets/*
  Cache-Control: public, max-age=300, must-revalidate
`),
  write('assets/noop.js', 'export {};\n')
];

for (const f of ['calc.js', 'ui.js', 'chat.js', 'chat-main.js', 'counters.js', 'styles.css']) {
  mkdirSync(join(SITE, 'assets'), { recursive: true });
  copyFileSync(join(ROOT, 'src', f), join(SITE, 'assets', f));
  out.push('assets/' + f);
}

console.log('بُنيت ' + out.length + ' ملفاً في site/:');
out.forEach(f => console.log('  · ' + f));
console.log('الشرائح الرسمية: ' + TIERS.join('، ') + ' ساعات · سعر الساعة ' + CFG.hourly + ' ريال');
console.log(POL.active
  ? POL.label + ': ' + FLEX_HOURS.join('، ') + ' ساعات · ' +
    Object.keys(RATES).map(d => (DUR_AR[d] || d) + ' [' +
      FLEX_HOURS.map(h => h + 'س=' + RATES[d][h]).join('، ') + ']').join(' · ')
  : 'الخصم: متوقف (active = false)');
