// يولّد site/ من data/packages.json — لا سعر ولا رابط مكتوب هنا.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, assumptionsLine, TIERS } from './calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data', 'packages.json'), 'utf8'));
const CFG = defaults(DATA);

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
const dataScript = () =>
  `<script type="application/json" id="rw-calc-data">${JSON.stringify(DATA).replace(/</g, '\\u003c')}</script>`;

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
${dataScript()}`;

const headerBlock = ({ h1, lede, chips = [] }) => `<header class="rw-head">
  <img class="rw-logo" src="${esc(DATA.logo)}" alt="${esc(DATA.brand)}">
  <h1 class="rw-h1${h1.length > 22 ? ' rw-h1--sm' : ''}">${esc(h1)}</h1>
  <p class="rw-lede">${esc(lede)}</p>
  ${chips.length ? `<div class="rw-chips rw-chips--top">${chips.join('')}</div>` : ''}
</header>`;

const chip = t => `<span class="rw-chip">${esc(t)}</span>`;
const chipLink = (t, href) => `<a class="rw-chip rw-chip--link" href="${esc(href)}">${esc(t)}</a>`;

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
      <caption>${esc(p.label)} — الأسعار بالريال</caption>
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
  script: '/assets/chat.js',
  body: `<a class="rw-skip" href="#rw-chat">تخطَّ إلى الحاسبة</a>
<div class="rw-shell">
  <div class="rw-bar"></div>
  ${headerBlock({
    h1: 'حاسبة تسعير الاشتراكات',
    lede: 'أداة داخلية لإدارة المركز — تحسب السعر العادل من الباقات المعلنة',
    chips: [chip('الأسعار متطابقة في الفترتين الصباحية والمسائية'), chipLink('نسخة الأهالي مع روابط الشراء ↗', '/parents/')]
  })}
  <main class="rw-wrap rw-wrap--narrow">
    <div id="rw-chat">${fallback(false)}</div>
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
    <div class="rw-chips" style="margin-top:16px">${DATA.notes.map(chip).join('')}</div>
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

const notFoundHtml = page({
  title: 'الصفحة غير موجودة — ' + DATA.brand,
  desc: 'الصفحة المطلوبة غير موجودة.',
  script: '/assets/noop.js',
  body: `<div class="rw-shell">
  <div class="rw-bar"></div>
  ${headerBlock({ h1: 'الصفحة غير موجودة', lede: 'الرابط الذي فتحته غير صحيح أو تغيّر.', chips: [chipLink('أداة التسعير الداخلية ↗', '/'), chipLink('حاسبة الأهالي ↗', '/parents/')] })}
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
  write('parents/index.html', parentsHtml),
  write('embed/index.html', embedHtml),
  write('404.html', notFoundHtml),
  write('robots.txt', 'User-agent: *\nDisallow: /\n'),
  write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()

/assets/*
  Cache-Control: public, max-age=300, must-revalidate
`),
  write('assets/noop.js', 'export {};\n')
];

for (const f of ['calc.js', 'ui.js', 'chat.js', 'counters.js', 'styles.css']) {
  mkdirSync(join(SITE, 'assets'), { recursive: true });
  copyFileSync(join(ROOT, 'src', f), join(SITE, 'assets', f));
  out.push('assets/' + f);
}

console.log('بُنيت ' + out.length + ' ملفاً في site/:');
out.forEach(f => console.log('  · ' + f));
console.log('الشرائح: ' + TIERS.join('، ') + ' ساعات · سعر الساعة ' + CFG.hourly + ' ريال');
