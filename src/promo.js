// محرك العرض التحفيزي المؤقت.
//
// القاعدة المعتمدة من العميل:
//   • الساعات التي لها باقة معلنة في دليل الأسعار (4/5/6/8/10) = باقات رسمية → سعرها كما هو، بلا مساس.
//   • من يُرقَّى إلى باقة أعلى مما يحتاج (3 → 4، 7 → 8، 9 → 10) = باقة غير رسمية → خصم off%.
//   • الحساب بالساعة سعر معلن رسمي (25 ريال) → لا يُخصم منه (إلا بتفعيل applyToHourly).
//
// العرض خصم على **نفس التركيبة المعتمدة**، لا إعادة حساب: الأداة الرسمية تختار الأرخص،
// ثم يُطبَّق الخصم على أسعار عناصرها. هكذا لا ينقلب الشهري إلى اشتراكات يومية بسبب التقريب.
import { quote, defaults, clamp, ar, HOUR_F, DAY_F, WEEK_F, KID_F } from './calc.js';

export const DEFAULT_POLICY = { off: 15, roundTo: 5, roundMode: 'floor', applyToHourly: false };

export function policy(promo) {
  return Object.assign({}, DEFAULT_POLICY, {
    off: promo && typeof promo.off === 'number' ? promo.off : DEFAULT_POLICY.off,
    roundTo: promo && typeof promo.roundTo === 'number' ? promo.roundTo : DEFAULT_POLICY.roundTo,
    roundMode: (promo && promo.roundMode) || DEFAULT_POLICY.roundMode,
    applyToHourly: !!(promo && promo.applyToHourly)
  });
}

/** الساعات التي لها باقة معلنة — مصدرها packages.json وحده، لا قائمة مكتوبة. */
export function officialHours(data) {
  return data.periods.morning.packages.map(p => p.hours).sort((a, b) => a - b);
}

export function isOfficialHours(data, h) {
  return officialHours(data).includes(h);
}

/** سعر بعد الخصم، مقرَّباً. لا يتجاوز الأصل ولا ينزل تحت الصفر. */
export function discounted(price, pol) {
  const raw = price * (1 - pol.off / 100);
  const step = pol.roundTo > 1 ? pol.roundTo : 1;
  const v = pol.roundMode === 'nearest'
    ? Math.round(raw / step) * step
    : Math.floor(raw / step) * step;
  return Math.max(0, Math.min(price, v));
}

/** تجاوز يدوي لسعر وحدة بعينها، أو null. */
export function override(promo, h, dpw, key) {
  const o = promo && promo.overrides;
  if (!o) return null;
  const cell = o[h + '/' + dpw] || o[h + '/*'];
  const v = cell && cell[key];
  return typeof v === 'number' && v > 0 ? v : null;
}

/**
 * تسعيرة العرض المؤقت لنفس مدخلات الأداة الرسمية.
 */
export function promoQuote(data, promo, input) {
  const pol = policy(promo);
  const cfg = Object.assign(defaults(data), (promo && promo.rules) || {}, input.cfg || {});
  const period = input.period || 'morning';

  const h = clamp(input.hours, 1, 10);
  const dpw = clamp(input.daysPerWeek, 1, cfg.weekDays);
  const weeks = clamp(input.weeks, 1, cfg.maxWeeks);
  const kids = clamp(input.kids ?? 1, 1, cfg.maxKids);

  // التركيبة المعتمدة بالأسعار المعلنة — الأساس الذي يُخصم منه.
  const list = quote(data, { hours: h, daysPerWeek: dpw, weeks, kids, period });

  const active = !!promo && promo.active !== false;
  const official = isOfficialHours(data, h);

  const items = list.items.map(i => {
    // العنصر مؤهل للخصم إذا كان سعره من باقة أعلى مما يحتاجه الطفل (ترقية = باقة غير رسمية)،
    // أو من مسار الساعة عند تفعيل applyToHourly.
    const upgraded = i.tier !== null && i.tier > h;
    const hourly = i.tier === null;
    const eligible = active && !official && (upgraded || (hourly && pol.applyToHourly));

    const ov = eligible ? override(promo, h, dpw, i.key) : null;
    const unit = eligible ? (ov !== null ? Math.min(ov, i.unitCost) : discounted(i.unitCost, pol)) : i.unitCost;
    const off = i.unitCost > 0 ? Math.round((1 - unit / i.unitCost) * 1000) / 10 : 0;

    return {
      key: i.key, tier: i.tier, count: i.count, promo: unit < i.unitCost,
      unitCost: unit, listUnitCost: i.unitCost, sum: unit * i.count, listSum: i.sum,
      offPct: off,
      // سعر العرض غير مرتبط بمنتج في المتجر، فلا رابط شراء له.
      url: unit < i.unitCost ? null : i.url,
      title: (unit < i.unitCost ? 'سعر العرض · ' : '') + i.title,
      detail: unit < i.unitCost
        ? unit + ' ريال بدل ' + i.unitCost + ' للواحد (−' + off + '%) · ' + i.detail.replace(/^[\d]+ ريال للواحد · /, '')
        : i.detail
    };
  });

  const perChild = items.reduce((a, i) => a + i.sum, 0);
  const gross = perChild * kids;
  const discount = kids >= 2 ? Math.round(gross * cfg.siblingOff / 100) : 0;
  const net = gross - discount;

  const hasPromo = items.some(i => i.promo);
  const listNet = list.net;
  const promoSaving = listNet - net;
  const totalDays = list.totalDays, totalHours = list.totalHours;
  const upTier = list.upTier;

  let note;
  if (!active) {
    note = 'العرض المؤقت متوقف حالياً — هذا هو السعر المعلن.';
  } else if (official) {
    note = 'باقة ' + h + ' ساعات باقة رسمية معلنة في دليل الأسعار، فسعرها لا يتغير في العرض.';
  } else if (hasPromo) {
    note = 'لا توجد باقة ' + h + ' ساعات، فالحساب على باقة ' + upTier + ' ساعات ثم خصم ' + pol.off +
      '% تحفيزاً للتسجيل. السعر المعلن لنفس الدوام ' + listNet +
      ' ريال. سعر العرض غير مرتبط بمنتج في المتجر — يُفعَّل عبر إدارة المركز.';
  } else {
    note = 'الحساب هنا بسعر الساعة المعلن (' + cfg.hourly +
      ' ريال) — لا ترقية إلى باقة أعلى، فلا خصم. السعر هو المعلن نفسه.';
  }

  return {
    cfg, pol, official, active,
    promoLabel: (promo && promo.label) || 'عرض تحفيزي مؤقت',
    period: { key: period, label: list.period.label, categoryUrl: list.period.categoryUrl },
    hours: h, daysPerWeek: dpw, weeks, kids, totalDays, totalHours, upTier,
    perChild, listPerChild: list.perChild, gross, discount, net, listNet, promoSaving, hasPromo,
    items, note,
    labels: {
      hours: ar(h, HOUR_F),
      days: ar(dpw, DAY_F),
      weeks: ar(weeks, WEEK_F),
      kids: ar(kids, KID_F),
      discount: 'خصم الأخوة ' + cfg.siblingOff + '% — ' + discount + ' ريال',
      promoSaving: 'أقل من السعر المعلن بـ' + promoSaving + ' ريال',
      perDay: 'يعادل ' + Math.round(net / (totalDays * kids)) + ' ريال في اليوم للطفل',
      perHour: 'يعادل ' + (Math.round((net / (totalHours * kids)) * 10) / 10) + ' ريال للساعة'
    }
  };
}
