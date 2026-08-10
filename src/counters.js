// حاسبة الأهالي — عدّادات (±) + اختيار الفترة + روابط شراء لكل عنصر + جدول مقارنة.
import { quote, readEmbeddedData, defaults, clamp, ar, coverDays, HOUR_F, DAY_F, KID_F } from './calc.js';
import { el, money, clear } from './ui.js';

const DATA = readEmbeddedData(document);
const CFG = defaults(DATA);
const ROOT = document.getElementById('rw-calc');
const EMBED = document.body.classList.contains('rw-embed');

const S = readUrl();

function readUrl() {
  const p = new URLSearchParams(location.search);
  const n = (k, d, lo, hi) => (p.has(k) ? clamp(p.get(k), lo, hi) : d);
  return {
    hours: n('h', 6, 1, 10),
    days: n('d', 5, 1, CFG.weekDays),
    weeks: n('w', CFG.monthWeeks, 1, CFG.maxWeeks),
    kids: n('k', 1, 1, CFG.maxKids),
    period: p.get('p') === 'e' ? 'evening' : 'morning'
  };
}

function writeUrl() {
  const q = new URLSearchParams({
    h: S.hours, d: S.days, w: S.weeks, k: S.kids, p: S.period === 'evening' ? 'e' : 'm'
  });
  history.replaceState(null, '', location.pathname + '?' + q.toString());
}

function bump(field, delta, lo, hi) {
  S[field] = clamp(S[field] + delta, lo, hi);
  render();
}

function stepper(o) {
  const dec = el('button', { type: 'button', class: 'rw-bump rw-bump--dec', 'aria-label': 'إنقاص ' + o.label, onclick: () => bump(o.field, -1, o.lo, o.hi) }, '−');
  const inc = el('button', { type: 'button', class: 'rw-bump rw-bump--inc', 'aria-label': 'زيادة ' + o.label, onclick: () => bump(o.field, 1, o.lo, o.hi) }, '+');
  dec.disabled = S[o.field] <= o.lo;
  inc.disabled = S[o.field] >= o.hi;
  return el('div', { class: 'rw-step' },
    el('div', { class: 'rw-step__top' },
      el('div', { class: 'rw-step__label', id: 'lbl-' + o.field }, o.label),
      el('div', { class: 'rw-step__hint' }, o.hint)),
    el('div', { class: 'rw-step__row' }, dec,
      el('div', { class: 'rw-val', role: 'status', 'aria-labelledby': 'lbl-' + o.field },
        el('span', { class: 'rw-val__n' }, String(S[o.field])),
        el('span', { class: 'rw-val__u' }, o.unit)),
      inc));
}

function inputsCard() {
  const seg = (key, label) => el('button', {
    type: 'button', class: 'rw-seg__btn', 'aria-pressed': String(S.period === key),
    onclick: () => { S.period = key; render(); }
  }, label);

  return el('section', { class: 'rw-card', 'aria-label': 'مدخلات الحاسبة' },
    el('div', { class: 'rw-inputs' },
      stepper({ field: 'hours', label: 'ساعات الدوام في اليوم', hint: 'من ساعة إلى 10 ساعات', unit: ar(S.hours, HOUR_F).replace(/^\d+\s/, ''), lo: 1, hi: 10 }),
      stepper({ field: 'days', label: 'أيام الدوام في الأسبوع', hint: 'من يوم إلى ' + CFG.weekDays + ' أيام', unit: ar(S.days, DAY_F).replace(/^\d+\s/, ''), lo: 1, hi: CFG.weekDays }),
      stepper({ field: 'weeks', label: 'عدد أسابيع الاشتراك', hint: 'الشهر = ' + CFG.monthWeeks + ' أسابيع · الترم = ' + CFG.termWeeks + ' أسبوعاً', unit: S.weeks === 1 ? 'أسبوع' : (S.weeks === 2 ? 'أسبوعان' : 'أسابيع'), lo: 1, hi: CFG.maxWeeks }),
      stepper({ field: 'kids', label: 'عدد الأطفال', hint: 'خصم الأخوة ' + CFG.siblingOff + '% من طفلين', unit: ar(S.kids, KID_F).replace(/^\d+\s/, ''), lo: 1, hi: CFG.maxKids }),
      el('div', { class: 'rw-step' },
        el('div', { class: 'rw-step__label' }, 'الفترة'),
        el('div', { class: 'rw-seg', role: 'group', 'aria-label': 'الفترة' },
          seg('morning', DATA.periods.morning.label),
          seg('evening', DATA.periods.evening.label)))
    ));
}

function resultCard(q) {
  const pills = [
    el('div', { class: 'rw-pill' }, q.labels.perDay),
    el('div', { class: 'rw-pill' }, q.labels.perHour)
  ];
  if (q.saving > 0) pills.push(el('div', { class: 'rw-pill rw-pill--solid' }, q.labels.saving));

  return el('section', { class: 'rw-result', 'aria-live': 'polite', 'aria-label': 'النتيجة' },
    el('div', { class: 'rw-badge' }, 'السعر العادل لاشتراكك'),
    el('div', { class: 'rw-amount' }, String(q.net), ' ', el('small', {}, 'ريال')),
    el('div', { class: 'rw-summary' },
      q.period.label + ' · ' + q.labels.hours + ' يومياً · ' + q.labels.days + ' أسبوعياً · ' +
      q.labels.weeks + ' (' + coverDays(q.totalDays) + ')'),
    q.kids > 1 ? el('div', { class: 'rw-perkid' }, 'السعر لكل طفل ' + q.perChild + ' ريال × ' + q.labels.kids) : null,
    q.discount > 0 ? el('div', { class: 'rw-disc' }, 'خصم الأخوة ' + q.cfg.siblingOff + '% (' + q.labels.kids + ') — ' + q.discount + ' ريال') : null,
    el('div', { class: 'rw-pills' }, pills)
  );
}

function basketCard(q) {
  return el('section', { class: 'rw-card', 'aria-label': 'كيف حسبنا السعر' },
    el('h2', { class: 'rw-card__title' }, 'كيف حسبنا السعر'),
    el('div', { class: 'rw-card__note' }, 'اخترنا لك: ' + q.labels.chosen),
    el('div', { class: 'rw-card__hint' }, q.upgraded
      ? 'لا توجد باقة ' + q.hours + ' ساعات — الحساب على أقرب باقة أعلى: ' + q.upTier + ' ساعات'
      : 'باقة ' + q.hours + ' ساعات متاحة مباشرة'),
    el('div', { class: 'rw-basket' }, q.items.map(i =>
      el('div', { class: 'rw-item' },
        el('div', { class: 'rw-item__top' },
          el('div', { class: 'rw-item__text' },
            el('div', { class: 'rw-item__title' }, i.title),
            el('div', { class: 'rw-item__detail' }, i.detail)),
          el('div', { class: 'rw-item__side' }, money(i.sum),
            el('a', { class: 'rw-buy', href: i.url, target: '_blank', rel: 'noopener' },
              'اشترك', el('span', { class: 'rw-sr' }, ' في ' + i.title))))))),
    el('div', { class: 'rw-total' },
      el('div', { class: 'rw-total__label' }, q.kids > 1 ? 'الإجمالي لكل طفل' : 'الإجمالي'),
      el('div', { class: 'rw-total__sum' }, String(q.perChild), ' ', el('small', {}, 'ريال')))
  );
}

function compareCard(q) {
  return el('section', { class: 'rw-card', 'aria-label': 'مقارنة الطرق' },
    el('h2', { class: 'rw-card__title' }, 'مقارنة الطرق الأخرى لنفس الدوام'),
    el('div', { class: 'rw-card__note' }, q.kids > 1 ? 'المقارنة لكل طفل، قبل خصم الأخوة' : 'المقارنة لنفس عدد أيام الدوام'),
    el('div', { class: 'rw-cmp' }, q.rows.map(r =>
      el('div', { class: 'rw-cmp__row' + (r.win ? ' rw-cmp__row--win' : '') },
        el('div', {},
          el('div', { class: 'rw-cmp__label' }, r.label),
          el('div', { class: 'rw-cmp__detail' }, r.detail)),
        el('div', { class: 'rw-cmp__sum' }, String(r.sum), ' ', el('small', {}, 'ريال')))))
  );
}

function render() {
  const q = quote(DATA, { hours: S.hours, daysPerWeek: S.days, weeks: S.weeks, kids: S.kids, period: S.period });
  writeUrl();
  clear(ROOT);
  ROOT.appendChild(inputsCard());
  ROOT.appendChild(resultCard(q));
  ROOT.appendChild(basketCard(q));
  ROOT.appendChild(compareCard(q));
  if (!EMBED) {
    const cat = document.getElementById('rw-cat');
    if (cat) {
      cat.href = q.period.categoryUrl;
      cat.textContent = 'تصفح كل باقات ' + q.period.label + ' في المتجر ↗';
    }
  }
}

render();
