// محرك تسعير الاشتراكات — مصدر الحقيقة الوحيد للحساب.
// وحدة ES تعمل كما هي في المتصفح وفي Node (src/verify.mjs يستوردها حرفياً).
// كل مبلغ هنا مأخوذ من data/packages.json — لا سعر مكتوب في الكود.

export const TIERS = [4, 5, 6, 8, 10];

export const HOUR_F = ['ساعة', 'ساعتان', 'ساعات', 'ساعةً'];
export const DAY_F = ['يوم', 'يومان', 'أيام', 'يوماً'];
export const WEEK_F = ['أسبوع', 'أسبوعان', 'أسابيع', 'أسبوعاً'];
export const MONTH_F = ['شهر', 'شهران', 'أشهر', 'شهراً'];
export const TERM_F = ['ترم', 'ترمان', 'ترمات', 'ترماً'];
export const KID_F = ['طفل', 'طفلان', 'أطفال', 'طفلاً'];

/** صيغة الجمع العربية: مفرد · مثنى · جمع قلة (3–10) · تمييز مفرد منصوب (11+) */
export function ar(n, forms) {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n <= 10) return n + ' ' + forms[2];
  return n + ' ' + forms[3];
}

/** «يغطي N يوم دوام» — تمييز مضاف بلا تنوين، كما في نص كراسة التسليم. */
export function coverDays(n) {
  if (n === 1) return 'يوم دوام';
  if (n === 2) return 'يومين دوام';
  return n + ' يوم دوام';
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));
}

/** الأساس الحسابي المعتمد من العميل. يُستبدل من data.rules إن وُجد. */
export function defaults(data) {
  const r = (data && data.rules) || {};
  return {
    weekDays: r.weekDays ?? 5,
    monthWeeks: r.monthWeeks ?? 4,
    termWeeks: r.termWeeks ?? 16,
    siblingOff: r.siblingOff ?? 10,
    maxWeeks: r.maxWeeks ?? 32,
    maxKids: r.maxKids ?? 4,
    hourly: (data && data.hourlyRate) ?? 25
  };
}

/** يسطّح فترة واحدة من packages.json إلى جدول أسعار سريع الوصول. */
export function periodTable(data, periodKey) {
  const p = data.periods[periodKey];
  if (!p) throw new Error('فترة غير معروفة: ' + periodKey);
  const tiers = {};
  p.packages.forEach(pk => { tiers[pk.hours] = pk.prices; });
  return { key: periodKey, label: p.label, categoryUrl: p.categoryUrl, hour: p.hour, tiers };
}

/**
 * أقل تكلفة لوحدة اشتراك واحدة تغطي unitDays يوم دوام عند h ساعة يومياً.
 * القاعدة المعتمدة: لا ترقية جزئية — تُستبعد كل شريحة أصغر من h،
 * ويُقارَن أرخص شريحة مؤهلة بالحساب بالساعة (منتج «ساعة واحدة»).
 * tier = null يعني أن السعر جاء من مسار الساعة، فلا يُسمّى باسم باقة.
 */
export function bestUnit(tab, key, unitDays, h, cfg, opts) {
  // share < 1 يعني تناسب سعر الباقة مع أيام الدوام الفعلية (الأسعار المعلنة لدوام 5 أيام).
  const share = (opts && opts.share) ?? 1;
  const round = (opts && opts.round) || (v => v);
  let out = { cost: h * cfg.hourly * unitDays, tier: null, url: tab.hour.url, unitPrice: cfg.hourly, prorated: false, listPrice: null };
  for (const t of TIERS) {
    if (t < h) continue;
    const cell = tab.tiers[t] && tab.tiers[t][key];
    if (!cell) continue;
    const price = share < 1 ? round(cell.price * share) : cell.price;
    if (price < out.cost) {
      // السعر المتناسب لا يقابله منتج في المتجر (المتجر يبيع بالسعر الكامل)، فلا رابط له.
      out = { cost: price, tier: t, url: share < 1 ? null : cell.url, unitPrice: price, prorated: share < 1, listPrice: cell.price };
    }
  }
  return out;
}

/** برمجة ديناميكية: أقل تكلفة لتغطية totalDays يوماً بالوحدات المتاحة (يُسمح بالتغطية الزائدة). */
export function solve(units, totalDays) {
  const cost = [0], pick = [null];
  for (let i = 1; i <= totalDays; i++) {
    let bc = Infinity, bu = null;
    for (const u of units) {
      const prev = cost[Math.max(0, i - u.days)];
      if (prev + u.cost < bc) { bc = prev + u.cost; bu = u; }
    }
    cost[i] = bc; pick[i] = bu;
  }
  const counts = new Map();
  let i = totalDays;
  while (i > 0 && pick[i]) {
    const u = pick[i];
    counts.set(u.key, (counts.get(u.key) || 0) + 1);
    i = Math.max(0, i - u.days);
  }
  return { total: totalDays > 0 ? cost[totalDays] : 0, counts };
}

/* ——— خصم الدوام المرن ——— */

/** سياسة الخصم، مصدرها data/discount.json المدموج في البيانات وقت البناء. */
export function discountPolicy(data) {
  const d = (data && data.discount) || {};
  return {
    active: d.active !== false,
    // سعر ساعة محدد لكل (مدة × عدد ساعات) لا تقابله باقة معلنة.
    hourlyRates: d.hourlyRates || {},
    roundTo: d.roundTo ?? 5,
    // تناسب سعر الباقة مع أيام الدوام: الأسعار المعلنة لدوام prorateBase أيام أسبوعياً.
    prorate: d.prorate !== false,
    prorateBase: d.prorateBase ?? 5,
    // لا يدفع صاحب الساعات الأقل أكثر من صاحب الساعات الأكثر.
    monotonic: d.monotonic !== false,
    label: d.label || 'خصم الدوام المرن'
  };
}

/** سعر الساعة المعتمد لهذه المدة وعدد الساعات، أو null إن كانت الساعات لها باقة معلنة. */
export function flexRate(pol, duration, hours) {
  const t = pol.hourlyRates && pol.hourlyRates[duration];
  const r = t && t[String(hours)];
  return typeof r === 'number' && r > 0 ? r : null;
}

/** كل الساعات التي لها سعر ساعة معتمد في أي مدة. */
export function flexHours(pol) {
  const set = new Set();
  for (const d of Object.keys(pol.hourlyRates || {})) {
    for (const h of Object.keys(pol.hourlyRates[d])) set.add(Number(h));
  }
  return [...set].sort((a, b) => a - b);
}

/** هل لهذه الساعات باقة معلنة؟ */
export function hasOfficialPackage(data, h) {
  return data.periods.morning.packages.some(p => p.hours === h);
}

/** المدة المطلوبة من عدد الأسابيع. */
export function durationOf(weeks, cfg) {
  if (weeks === 1) return 'week';
  if (weeks === cfg.monthWeeks) return 'month';
  if (weeks === cfg.termWeeks) return 'term';
  return 'custom';
}

/**
 * التسعيرة الكاملة.
 * input: { hours, daysPerWeek, weeks, kids, period, duration }
 */
export function quote(data, input) {
  const base = rawQuote(data, input);
  const pol = base.pol;
  // ضمانة الرتابة: لا يدفع صاحب الساعات الأقل أكثر من صاحب الساعات الأكثر.
  // تُطبَّق فقط على من لا تقابل ساعاتِه باقةٌ معلنة، فلا يُمَس سعر باقة معلنة أبداً.
  if (!pol.monotonic || hasOfficialPackage(data, base.hours)) return base;

  let best = base;
  for (let h2 = base.hours + 1; h2 <= TIERS[TIERS.length - 1]; h2++) {
    const alt = rawQuote(data, Object.assign({}, input, { hours: h2 }));
    if (alt.perChild < best.perChild) best = alt;
  }
  if (best === base) return base;

  // تسعيرة ساعات أعلى أرخص: نأخذها ونُبقي الساعات المطلوبة في العرض.
  const kids = base.kids, totalDays = base.totalDays, totalHours = base.totalHours;
  const perChild = best.perChild;
  const gross = perChild * kids;
  const discount = kids >= 2 ? Math.round(gross * base.cfg.siblingOff / 100) : 0;
  const net = gross - discount;
  return Object.assign({}, best, {
    hours: base.hours, pricedAs: best.hours, totalHours, listPerChild: base.listPerChild,
    flexSaving: base.listPerChild - perChild, perChild, gross, discount, net,
    perDay: Math.round(net / (totalDays * kids)),
    perHour: Math.round((net / (totalHours * kids)) * 10) / 10,
    upgradeNote: 'سُعِّرت على أرخص تسعيرة أعلى (' + best.hours + ' ساعات) — لا يدفع صاحب ' +
      'الساعات الأقل أكثر من صاحب الساعات الأكثر.',
    labels: Object.assign({}, best.labels, {
      hours: ar(base.hours, HOUR_F),
      perDay: 'يعادل ' + Math.round(net / (totalDays * kids)) + ' ريال في اليوم للطفل',
      perHour: 'يعادل ' + (Math.round((net / (totalHours * kids)) * 10) / 10) + ' ريال للساعة',
      flexSaving: 'أقل من السعر المعلن بـ' + (base.listPerChild - perChild) * kids + ' ريال'
    })
  });
}

function rawQuote(data, input) {
  const cfg = Object.assign(defaults(data), input.cfg || {});
  const tab = periodTable(data, input.period || 'morning');

  const h = clamp(input.hours, 1, TIERS[TIERS.length - 1]);
  const dpw = clamp(input.daysPerWeek, 1, cfg.weekDays);
  const weeks = clamp(input.weeks, 1, cfg.maxWeeks);
  const kids = clamp(input.kids ?? 1, 1, cfg.maxKids);

  const totalDays = dpw * weeks;
  const totalHours = totalDays * h;

  const pol0 = discountPolicy(data);
  const step0 = pol0.roundTo > 1 ? pol0.roundTo : 1;
  const roundDown = v => Math.floor(v / step0) * step0;
  // الأسعار المعلنة لدوام prorateBase أيام أسبوعياً؛ من يدوم أقل يدفع بنسبة أيامه.
  const share = pol0.prorate ? Math.min(1, dpw / pol0.prorateBase) : 1;
  const daysLabel = ar(dpw, DAY_F) + ' من ' + pol0.prorateBase;

  const units = [
    { key: 'day', days: 1, label: 'اشتراك باليوم' },
    { key: 'week', days: dpw, label: 'اشتراك أسبوعي' },
    { key: 'month', days: dpw * cfg.monthWeeks, label: 'اشتراك شهري' },
    { key: 'term', days: dpw * cfg.termWeeks, label: 'اشتراك بالترم' }
    // الاشتراك اليومي مُسعَّر بالأصل لليوم الواحد، فلا يتناسب مرة أخرى.
  ].map(u => Object.assign({}, u, bestUnit(tab, u.key, u.days, h, cfg,
    u.key === 'day' ? null : { share, round: roundDown })));

  const { total: listPerChild, counts } = solve(units, totalDays);

  const items = [];
  for (const u of units) {
    const n = counts.get(u.key);
    if (!n) continue;
    items.push({
      key: u.key, tier: u.tier, count: n, unitCost: u.cost, sum: u.cost * n, url: u.url,
      flex: false, prorated: !!u.prorated,
      title: (u.tier ? u.label + ' · ' + u.tier + ' ساعات' : 'اشتراك بالساعة') + (n > 1 ? ' × ' + n : ''),
      detail: u.tier
        ? u.cost + ' ريال للواحد' + (u.prorated ? ' (بدل ' + u.listPrice + ' — ' + daysLabel + ')' : '') +
          ' · يغطي ' + coverDays(u.days)
        : ar(h, HOUR_F) + ' × ' + ar(u.days, DAY_F) + ' × ' + cfg.hourly + ' ريال'
    });
  }

  /* الباقات غير الرسمية (2/3/7/9 ساعات) تُسعَّر بسعر ساعة محدد لكل مدة:
     السعر = عدد الساعات الكلي × سعر الساعة. فمن يطلب 36 ساعة لا يدفع كمن يطلب 48 ساعة.
     ويُؤخذ الأرخص بينه وبين السعر المعلن، فلا يتجاوزه أبداً.
     الساعات التي لها باقة معلنة (والساعة الواحدة) لا تُمَس. */
  const pol = pol0;
  const duration = input.duration || durationOf(weeks, cfg);
  const rate = pol.active && !hasOfficialPackage(data, h) ? flexRate(pol, duration, h) : null;
  const down = roundDown;

  const flexCost = rate !== null ? down(totalHours * rate) : Infinity;
  const flex = flexCost < listPerChild;

  let perChild = listPerChild;
  if (flex) {
    perChild = flexCost;
    // سعر الساعة لا يقابله منتج في المتجر، فلا رابط شراء له.
    items.length = 0;
    items.push({
      key: 'flex', tier: null, count: 1, unitCost: flexCost, sum: flexCost, url: null,
      flex: true, prorated: false,
      title: 'اشتراك مرن · ' + ar(h, HOUR_F) + ' يومياً',
      detail: ar(totalHours, HOUR_F) + ' × ' + rate + ' ريال للساعة · يغطي ' + coverDays(totalDays)
    });
  }

  const gross = perChild * kids;
  const discount = kids >= 2 ? Math.round(gross * cfg.siblingOff / 100) : 0;
  const net = gross - discount;

  const hourlyPerChild = totalHours * cfg.hourly;
  const saving = hourlyPerChild * kids - net;

  // تنبيه الترقية يظهر فقط إذا استُخدمت باقة حقيقية بشريحة أعلى من ساعات الطفل.
  const upTier = items.reduce((a, i) => (i.tier && i.tier !== h ? Math.max(a, i.tier) : a), 0);
  const upgraded = upTier > 0;

  // المقارنة لكل طفل، وتُخفى أي طريقة لا تقابلها باقة حقيقية (tier === null).
  const byKey = k => units.find(u => u.key === k);
  const rows = [
    { key: 'best', label: 'الأقل تكلفة (المعروض أعلاه)', detail: flex ? 'اشتراك مرن بسعر ساعة ' + rate + ' ريال' : 'تركيبة باقات المركز', sum: perChild, win: true }
  ];
  if (flex) rows.push({ key: 'list', label: 'بالأسعار المعلنة', detail: 'أقل تركيبة من باقات المركز', sum: listPerChild });
  rows.push({ key: 'hourly', label: 'كل الأيام بالساعة', detail: ar(totalHours, HOUR_F) + ' × ' + cfg.hourly + ' ريال', sum: hourlyPerChild });
  const d = byKey('day'), w = byKey('week'), m = byKey('month'), t = byKey('term');
  if (d.tier) rows.push({ key: 'day', label: 'كل الأيام باشتراك يومي', detail: ar(totalDays, DAY_F) + ' × ' + d.cost + ' ريال', sum: d.cost * totalDays });
  if (w.tier) { const n = Math.ceil(totalDays / w.days); rows.push({ key: 'week', label: 'اشتراك أسبوعي', detail: ar(n, WEEK_F) + ' × ' + w.cost + ' ريال', sum: w.cost * n }); }
  if (m.tier) { const n = Math.ceil(totalDays / m.days); rows.push({ key: 'month', label: 'اشتراك شهري', detail: ar(n, MONTH_F) + ' × ' + m.cost + ' ريال', sum: m.cost * n }); }
  if (t.tier) { const n = Math.ceil(totalDays / t.days); rows.push({ key: 'term', label: 'اشتراك بالترم', detail: ar(n, TERM_F) + ' × ' + t.cost + ' ريال', sum: t.cost * n }); }

  const upgradeNote = flex
    ? 'لا توجد باقة ' + h + ' ساعات، فحُسب اشتراك مرن بسعر ساعة ' + rate + ' ريال: ' +
      totalHours + ' ساعة × ' + rate + ' = ' + perChild + ' ريال، بدل ' + listPerChild + ' بالأسعار المعلنة.'
    : (upgraded ? 'لا توجد باقة ' + h + ' ساعات، فحُسبت على أقرب باقة أعلى: ' + upTier + ' ساعات.' : '');

  return {
    cfg, pol, duration, flex, flexRate: rate, listPerChild, flexSaving: listPerChild - perChild,
    prorated: share < 1, share, pricedAs: h,
    period: { key: tab.key, label: tab.label, categoryUrl: tab.categoryUrl, hourUrl: tab.hour.url },
    hours: h, daysPerWeek: dpw, weeks, kids, totalDays, totalHours,
    perChild, gross, discount, net, saving, hourlyPerChild,
    items, units, rows, upgraded, upTier, upgradeNote,
    perDay: Math.round(net / (totalDays * kids)),
    perHour: Math.round((net / (totalHours * kids)) * 10) / 10,
    labels: {
      hours: ar(h, HOUR_F),
      days: ar(dpw, DAY_F),
      weeks: ar(weeks, WEEK_F),
      totalDays: ar(totalDays, DAY_F),
      kids: ar(kids, KID_F),
      discount: 'خصم الأخوة ' + cfg.siblingOff + '% — ' + discount + ' ريال',
      saving: 'توفير ' + saving + ' ريال عن الحساب بالساعة',
      flexSaving: 'أقل من السعر المعلن بـ' + (listPerChild - perChild) * kids + ' ريال',
      perDay: 'يعادل ' + Math.round(net / (totalDays * kids)) + ' ريال في اليوم للطفل',
      perHour: 'يعادل ' + (Math.round((net / (totalHours * kids)) * 10) / 10) + ' ريال للساعة',
      chosen: items.map(i => i.title).join(' + ')
    }
  };
}

/** سطر الأساس الحسابي المعروض في الصفحتين. */
export function assumptionsLine(cfg) {
  return 'الأسبوع = أسبوع تقويمي (حتى ' + cfg.weekDays + ' أيام دوام) · الشهر = ' + cfg.monthWeeks +
    ' أسابيع · الترم = ' + cfg.termWeeks + ' أسبوعاً (4 أشهر) · الباقة تُحسب بسعرها كاملاً حتى لو كان حضور الطفل أقل · ' +
    'لا توجد ساعات إضافية بالتجزئة — يُرقّى إلى أقرب باقة أعلى · خصم الأخوة ' + cfg.siblingOff +
    '% من طفلين · سعر الساعة المفردة ' + cfg.hourly + ' ريال';
}

/** يقرأ البيانات المطبوعة وقت البناء داخل الصفحة. */
export function readEmbeddedData(doc, id) {
  const node = (doc || document).getElementById(id || 'rw-calc-data');
  if (!node) throw new Error('بيانات غير موجودة في الصفحة: ' + (id || 'rw-calc-data'));
  return JSON.parse(node.textContent);
}
