// محرك العرض التحفيزي المؤقت — «الباقات بالطلب».
//
// القاعدة المعتمدة من العميل:
//   • الساعات التي لها باقة معلنة في دليل الأسعار (4/5/6/8/10) = باقات رسمية → سعرها كما هو، بلا مساس.
//   • ما عداها = باقة بالطلب → تُسعَّر بالأرخص من مسارين:
//       (1) كل الساعات × سعر الساعة في العرض (hourlyRate، افتراضياً 15.29 بدل 25)
//       (2) أقرب باقة أعلى مخصومة off% — سقف يمنع أن تصير الباقة بالطلب أغلى من الرسمية
//   • الساعة الواحدة تبقى بسعرها المعلن (minPromoHours).
//   • ضمانة monotonic: لا يدفع صاحب الساعات الأقل أكثر من صاحب الساعات الأكثر.
import { quote, defaults, clamp, ar, coverDays, HOUR_F, DAY_F, WEEK_F, KID_F } from './calc.js';

export const MAX_HOURS = 10;

export const DEFAULT_POLICY = {
  hourlyRate: 15.29, off: 15, roundTo: 5, roundMode: 'floor', minPromoHours: 2, monotonic: true
};

export function policy(promo) {
  const p = promo || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    hourlyRate: num(p.hourlyRate, DEFAULT_POLICY.hourlyRate),
    off: num(p.off, DEFAULT_POLICY.off),
    roundTo: num(p.roundTo, DEFAULT_POLICY.roundTo),
    roundMode: p.roundMode || DEFAULT_POLICY.roundMode,
    minPromoHours: num(p.minPromoHours, DEFAULT_POLICY.minPromoHours),
    monotonic: p.monotonic !== false
  };
}

/** الساعات التي لها باقة معلنة — مصدرها packages.json وحده، لا قائمة مكتوبة. */
export function officialHours(data) {
  return data.periods.morning.packages.map(p => p.hours).sort((a, b) => a - b);
}

/** هل هذه الساعات «باقة رسمية» لا تُمَس؟ */
export function isOfficial(data, h, pol) {
  return officialHours(data).includes(h) || h < pol.minPromoHours;
}

/** الساعات التي يشملها العرض فعلاً. */
export function promoHoursList(data, pol) {
  const out = [];
  for (let h = 1; h <= MAX_HOURS; h++) if (!isOfficial(data, h, pol)) out.push(h);
  return out;
}

/** تقريب مبلغ حسب سياسة العرض. */
export function roundPrice(v, pol) {
  const step = pol.roundTo > 1 ? pol.roundTo : 1;
  const r = pol.roundMode === 'nearest' ? Math.round(v / step) * step : Math.floor(v / step) * step;
  return Math.max(0, r);
}

export function discounted(price, pol) {
  return Math.min(price, roundPrice(price * (1 - pol.off / 100), pol));
}

/** تجاوز يدوي لمبلغ وحدة بعينها، أو null. */
export function override(promo, h, dpw, key) {
  const o = promo && promo.overrides;
  if (!o) return null;
  const cell = o[h + '/' + dpw] || o[h + '/*'];
  const v = cell && cell[key];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** تسعيرة ساعات بعينها بلا ضمانة الرتابة — تُستدعى داخلياً. */
function rawQuote(data, promo, pol, input, h) {
  const cfg = Object.assign(defaults(data), (promo && promo.rules) || {}, input.cfg || {});
  const period = input.period || 'morning';
  const dpw = clamp(input.daysPerWeek, 1, cfg.weekDays);
  const weeks = clamp(input.weeks, 1, cfg.maxWeeks);
  const kids = clamp(input.kids ?? 1, 1, cfg.maxKids);

  // التركيبة والسعر المعلنان — الأساس والسقف.
  const list = quote(data, { hours: h, daysPerWeek: dpw, weeks, kids, period });
  const active = !!promo && promo.active !== false;
  const official = isOfficial(data, h, pol);

  if (!active || official) {
    return {
      h, official, kind: 'official', cfg, list,
      items: list.items.map(i => ({ ...i, promo: false, listSum: i.sum })),
      perChild: list.perChild
    };
  }

  // (2) مسار الباقة: نفس التركيبة المعتمدة، كل سطر مخصوم off%.
  const pkgItems = list.items.map(i => {
    const ov = override(promo, h, dpw, i.key);
    const sum = ov !== null ? Math.min(ov * i.count, i.sum) : discounted(i.sum, pol);
    // يُحذف «X ريال للواحد» من التفصيل الأصلي كي لا يتكرر المبلغ مع «بدل X».
    const tail = i.detail.replace(/^\d+ ريال للواحد · /, '');
    return {
      ...i, promo: sum < i.sum, listSum: i.sum, sum, url: null,
      title: 'باقة بالطلب · ' + i.title,
      detail: sum + ' ريال بدل ' + i.sum + ' (−' + Math.round((1 - sum / i.sum) * 1000) / 10 + '%) · ' + tail
    };
  });
  const pkgTotal = pkgItems.reduce((a, i) => a + i.sum, 0);

  // (1) مسار سعر الساعة في العرض: كل ساعات الدوام × hourlyRate.
  const hourlyTotal = roundPrice(list.totalHours * pol.hourlyRate, pol);
  const hourlyItem = {
    key: 'ondemand', tier: null, promo: true, count: 1,
    unitCost: hourlyTotal, sum: hourlyTotal, listSum: list.perChild, url: null,
    title: 'باقة بالطلب · ' + ar(h, HOUR_F) + ' يومياً',
    detail: ar(list.totalHours, HOUR_F) + ' × ' + pol.hourlyRate + ' ريال (سعر الساعة في العرض بدل ' +
      cfg.hourly + ') · يغطي ' + coverDays(list.totalDays)
  };

  const useHourly = hourlyTotal < pkgTotal;
  return {
    h, official: false, kind: useHourly ? 'hourly' : 'package', cfg, list,
    items: useHourly ? [hourlyItem] : pkgItems,
    perChild: useHourly ? hourlyTotal : pkgTotal
  };
}

/**
 * تسعيرة العرض المؤقت. نفس مدخلات الأداة الرسمية.
 */
export function promoQuote(data, promo, input) {
  const pol = policy(promo);
  const cfg0 = Object.assign(defaults(data), (promo && promo.rules) || {}, input.cfg || {});
  const h = clamp(input.hours, 1, MAX_HOURS);

  let best = rawQuote(data, promo, pol, input, h);
  let pricedAs = h;
  // لا ترقية جزئية في العرض أيضاً: لو كان سعر ساعات أعلى أرخص، يُسعَّر عليه.
  if (pol.monotonic) {
    for (let h2 = h + 1; h2 <= MAX_HOURS; h2++) {
      const alt = rawQuote(data, promo, pol, input, h2);
      if (alt.perChild < best.perChild) { best = alt; pricedAs = h2; }
    }
  }

  const cfg = best.cfg;
  const list = quote(data, {
    hours: h, daysPerWeek: input.daysPerWeek, weeks: input.weeks, kids: input.kids, period: input.period || 'morning'
  });
  const dpw = list.daysPerWeek, weeks = list.weeks, kids = list.kids;
  const totalDays = list.totalDays;
  const totalHours = totalDays * h;

  const perChild = best.perChild;
  const gross = perChild * kids;
  const discount = kids >= 2 ? Math.round(gross * cfg.siblingOff / 100) : 0;
  const net = gross - discount;

  const listNet = list.net;
  const promoSaving = listNet - net;
  const hasPromo = net < listNet;
  const official = isOfficial(data, h, pol);

  let note;
  if (!(promo && promo.active !== false)) {
    note = 'العرض المؤقت متوقف حالياً — هذا هو السعر المعلن.';
  } else if (official && !hasPromo) {
    note = h < pol.minPromoHours
      ? 'الساعة الواحدة سعرها المعلن ' + cfg.hourly + ' ريال، وهو سعر رئيسي في دليل الأسعار فلا يتغير.'
      : 'باقة ' + h + ' ساعات باقة رسمية معلنة في دليل الأسعار، فسعرها لا يتغير في العرض.';
  } else if (pricedAs !== h) {
    note = 'سُعِّرت على أرخص تسعيرة أعلى (' + pricedAs + ' ساعات) — لا يدفع صاحب الساعات الأقل أكثر ' +
      'من صاحب الساعات الأكثر. السعر المعلن لنفس الدوام ' + listNet + ' ريال.';
  } else if (best.kind === 'hourly') {
    note = 'باقة بالطلب: ' + totalHours + ' ساعة × ' + pol.hourlyRate + ' ريال للساعة بدل ' + cfg.hourly +
      '. السعر المعلن لنفس الدوام ' + listNet + ' ريال. سعر العرض غير مرتبط بمنتج في المتجر — يُفعَّل عبر إدارة المركز.';
  } else {
    note = 'باقة بالطلب: لا توجد باقة ' + h + ' ساعات، فالحساب على أقرب باقة أعلى مخصومة ' + pol.off +
      '%. السعر المعلن لنفس الدوام ' + listNet + ' ريال. سعر العرض غير مرتبط بمنتج في المتجر — يُفعَّل عبر إدارة المركز.';
  }

  return {
    cfg, pol, official, pricedAs, kind: best.kind,
    active: !!(promo && promo.active !== false),
    promoLabel: (promo && promo.label) || 'عرض تحفيزي مؤقت',
    period: list.period,
    hours: h, daysPerWeek: dpw, weeks, kids, totalDays, totalHours, upTier: list.upTier,
    perChild, listPerChild: list.perChild, gross, discount, net, listNet, promoSaving, hasPromo,
    effectiveHourly: Math.round((net / (totalHours * kids)) * 100) / 100,
    items: best.items, note,
    labels: {
      hours: ar(h, HOUR_F),
      days: ar(dpw, DAY_F),
      weeks: ar(weeks, WEEK_F),
      kids: ar(kids, KID_F),
      discount: 'خصم الأخوة ' + cfg.siblingOff + '% — ' + discount + ' ريال',
      promoSaving: 'أقل من السعر المعلن بـ' + promoSaving + ' ريال',
      perDay: 'يعادل ' + Math.round(net / (totalDays * kids)) + ' ريال في اليوم للطفل',
      perHour: 'يعادل ' + (Math.round((net / (totalHours * kids)) * 100) / 100) + ' ريال للساعة'
    }
  };
}
