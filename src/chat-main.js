// مدخل الأداة الداخلية — الأسعار المعلنة + خصم الدوام المرن.
import { quote, readEmbeddedData } from './calc.js';
import { startChat } from './chat.js';

const DATA = readEmbeddedData(document);

startChat({
  data: DATA,
  title: 'حاسبة التسعير',
  intro: 'مرحباً. سأحسب لك السعر العادل من أسعار الباقات المعلنة — ثلاثة أسئلة قصيرة.',
  result(s) {
    const q = quote(DATA, {
      hours: s.hours, daysPerWeek: s.daysPerWeek, weeks: s.weeks,
      duration: s.duration, kids: s.kids, period: 'morning'
    });
    const pills = [{ text: q.labels.perDay }, { text: q.labels.perHour }];
    if (q.discount > 0) pills.push({ text: q.labels.discount, kind: 'solid' });
    if (q.flex) pills.push({ text: q.labels.flexSaving, kind: 'gold' });
    else if (q.saving > 0) pills.push({ text: q.labels.saving, kind: 'gold' });
    return {
      lead: q.flex ? 'هذا السعر بعد خصم الدوام المرن:' : 'هذا هو السعر العادل:',
      label: q.flex ? 'السعر بعد الخصم' : 'السعر العادل',
      variant: q.flex ? 'promo' : null,
      amount: q.net,
      before: q.flex ? { label: 'بدل', sum: q.listPerChild * q.kids - (q.kids >= 2 ? Math.round(q.listPerChild * q.kids * q.cfg.siblingOff / 100) : 0) } : null,
      summary: q.labels.hours + ' يومياً · ' + q.labels.days + ' أسبوعياً · ' + q.labels.weeks + ' · ' + q.labels.kids,
      pills,
      rows: q.items.map(i => ({ title: i.title, detail: i.detail, sum: i.sum, promo: i.flex })),
      note: (q.upgradeNote ? q.upgradeNote + ' ' : '') +
        (q.flex
          ? 'السعر المرن غير مرتبط بمنتج في المتجر — يُفعَّل عبر إدارة المركز.'
          : (q.prorated
            ? 'الأسعار المعلنة لدوام ' + q.pol.prorateBase + ' أيام أسبوعياً، وهذا السعر متناسب مع أيام الدوام الفعلية.'
            : 'كل مبلغ مأخوذ من أسعار الباقات المعلنة، والأسعار متطابقة في الفترتين.'))
    };
  }
});
