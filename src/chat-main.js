// مدخل الأداة الداخلية المعتمدة — الأسعار المعلنة في data/packages.json.
import { quote, readEmbeddedData } from './calc.js';
import { startChat } from './chat.js';

const DATA = readEmbeddedData(document);

startChat({
  data: DATA,
  title: 'حاسبة التسعير',
  intro: 'مرحباً. سأحسب لك السعر العادل من أسعار الباقات المعلنة — ثلاثة أسئلة قصيرة.',
  result(s) {
    const q = quote(DATA, { hours: s.hours, daysPerWeek: s.daysPerWeek, weeks: s.weeks, kids: s.kids, period: 'morning' });
    const pills = [{ text: q.labels.perDay }, { text: q.labels.perHour }];
    if (q.discount > 0) pills.push({ text: q.labels.discount, kind: 'solid' });
    if (q.saving > 0) pills.push({ text: q.labels.saving, kind: 'gold' });
    return {
      lead: 'هذا هو السعر العادل:',
      label: 'السعر العادل',
      amount: q.net,
      summary: q.labels.hours + ' يومياً · ' + q.labels.days + ' أسبوعياً · ' + q.labels.weeks + ' · ' + q.labels.kids,
      pills,
      rows: q.items.map(i => ({ title: i.title, detail: i.detail, sum: i.sum })),
      note: (q.upgradeNote ? q.upgradeNote + ' ' : '') +
        'كل مبلغ مأخوذ من أسعار الباقات المعلنة، والأسعار متطابقة في الفترتين.'
    };
  }
});
