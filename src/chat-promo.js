// مدخل حاسبة العرض المؤقت — سياسة الخصم في data/promo.json.
import { readEmbeddedData, defaults } from './calc.js';
import { promoQuote } from './promo.js';
import { startChat } from './chat.js';

const DATA = readEmbeddedData(document);
const PROMO = readEmbeddedData(document, 'rw-promo-data');
const CFG = defaults(DATA);

/** هل ينطبق العرض فعلاً على هذه الساعات/الأيام؟ يُحسب من المحرك نفسه، لا بقائمة مكتوبة. */
const applies = (h, d) =>
  promoQuote(DATA, PROMO, { hours: h, daysPerWeek: d, weeks: CFG.monthWeeks, kids: 1 }).hasPromo;

startChat({
  data: DATA,
  variant: 'promo',
  title: 'حاسبة العرض المؤقت',
  intro: 'مرحباً. هذه حاسبة العرض التحفيزي المؤقت — الباقات الرسمية بسعرها المعلن، ومن يُرقَّى إلى باقة أعلى مما يحتاج له خصم.',
  resetIntro: 'نبدأ من جديد. كم ساعة يبقى الطفل في المركز يومياً؟',
  markHours: h => [1, 2, 3, 4, 5].some(d => applies(h, d)),
  markDays: (h, d) => applies(h, d),
  result(s) {
    const q = promoQuote(DATA, PROMO, { hours: s.hours, daysPerWeek: s.daysPerWeek, weeks: s.weeks, kids: s.kids, period: 'morning' });
    const pills = [{ text: q.labels.perDay }, { text: q.labels.perHour }];
    if (q.discount > 0) pills.push({ text: q.labels.discount, kind: 'solid' });
    if (q.promoSaving > 0) pills.push({ text: q.labels.promoSaving, kind: 'gold' });
    return {
      lead: q.hasPromo ? 'هذا سعر العرض المؤقت:' : 'لا ينطبق العرض على هذا الدوام — وهذا السعر المعلن:',
      label: q.hasPromo ? 'سعر العرض المؤقت' : 'السعر المعلن',
      variant: q.hasPromo ? 'promo' : null,
      amount: q.net,
      before: q.promoSaving > 0 ? { label: 'بدل', sum: q.listNet } : null,
      summary: q.labels.hours + ' يومياً · ' + q.labels.days + ' أسبوعياً · ' + q.labels.weeks + ' · ' + q.labels.kids,
      pills,
      rows: q.items.map(i => ({ title: i.title, detail: i.detail, sum: i.sum, promo: i.promo })),
      note: q.note
    };
  }
});
