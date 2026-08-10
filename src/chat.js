// حاسبة التسعير بصيغة محادثة — الأداة الداخلية المعتمدة.
// سؤال واحد في كل خطوة، رجوع في كل خطوة، بلا اختيار فترة وبلا أزرار شراء.
import { quote, readEmbeddedData, defaults, ar, HOUR_F, DAY_F, KID_F } from './calc.js';
import { el, money, clear } from './ui.js';

const DATA = readEmbeddedData(document);
const CFG = defaults(DATA);
const LOGO = DATA.logo;

// توقيتات مؤشر الكتابة بالمللي ثانية — كما في كراسة التسليم.
const MS = { intro: 650, step: 700, result: 850, handoff: 30 };

const S = {
  msgs: [{ who: 'g', text: 'مرحباً. سأحسب لك السعر العادل من أسعار الباقات المعلنة — ثلاثة أسئلة قصيرة.' }],
  typing: false, stage: 'hours', hours: null, days: null, weeks: null, kids: 1, history: []
};

const timers = [];
function wait(ms, fn) { timers.push(setTimeout(fn, ms)); }
function stopTimers() { timers.splice(0).forEach(clearTimeout); }

const root = document.getElementById('rw-chat');
const thread = el('div', { class: 'rw-thread', id: 'rw-thread', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'مجرى المحادثة' });
const stepLabel = el('div', { class: 'rw-chat__step' }, el('span', { class: 'rw-dot' }), el('span', { id: 'rw-step-text' }, 'الخطوة 1 من 4 — الساعات'));
const replyLabel = el('div', { class: 'rw-reply__label' }, 'عدد الساعات في اليوم:');
const nav = el('div', { class: 'rw-nav' });
const quick = el('div', { class: 'rw-quick' });
let typingNode = null, rendered = 0;

function avatar(sm) {
  return el('div', { class: 'rw-avatar' + (sm ? ' rw-avatar--sm' : '') },
    el('img', { src: LOGO, alt: '', 'aria-hidden': 'true' }));
}

function boot() {
  clear(root);
  root.appendChild(el('div', { class: 'rw-chat' },
    el('div', { class: 'rw-chat__head' }, avatar(),
      el('div', { class: 'rw-chat__id' },
        el('div', { class: 'rw-chat__name' }, 'حاسبة التسعير'), stepLabel)),
    thread,
    el('div', { class: 'rw-reply' },
      el('div', { class: 'rw-reply__top' }, replyLabel, nav),
      quick)
  ));
  render();
  say('كم ساعة يبقى الطفل في المركز يومياً؟', MS.intro);
}

function say(text, delay, extra) {
  S.typing = true; render();
  wait(delay || MS.intro, () => {
    S.typing = false;
    S.msgs.push(Object.assign({ who: 'g', text }, extra || {}));
    render();
  });
}

function answer(field, value, label, next, question) {
  stopTimers();
  S.history.push({ stage: S.stage, hours: S.hours, days: S.days, weeks: S.weeks, kids: S.kids, msgsLen: S.msgs.length });
  S[field] = value;
  S.stage = next;
  S.typing = false;
  S.msgs.push({ who: 'u', text: label });
  render();
  if (next === 'done') wait(MS.handoff, finish);
  else say(question, MS.step);
}

function back() {
  stopTimers();
  if (!S.history.length) return;
  const p = S.history.pop();
  S.msgs.length = p.msgsLen;
  S.typing = false;
  S.stage = p.stage; S.hours = p.hours; S.days = p.days; S.weeks = p.weeks; S.kids = p.kids;
  render();
}

function reset() {
  stopTimers();
  S.msgs = [{ who: 'g', text: 'نبدأ من جديد. كم ساعة يبقى الطفل في المركز يومياً؟' }];
  S.typing = false; S.stage = 'hours'; S.hours = null; S.days = null; S.weeks = null; S.kids = 1; S.history = [];
  render();
}

function finish() {
  const q = quote(DATA, { hours: S.hours, daysPerWeek: S.days, weeks: S.weeks, kids: S.kids, period: 'morning' });
  say('هذا هو السعر العادل:', MS.result, { result: q });
}

/* ——— العرض ——— */

function resultCard(q) {
  const pills = [
    el('div', { class: 'rw-pill' }, q.labels.perDay),
    el('div', { class: 'rw-pill' }, q.labels.perHour)
  ];
  if (q.discount > 0) pills.push(el('div', { class: 'rw-pill rw-pill--solid' }, q.labels.discount));
  if (q.saving > 0) pills.push(el('div', { class: 'rw-pill rw-pill--gold' }, q.labels.saving));

  return el('div', { class: 'rw-mini' },
    el('div', { class: 'rw-mini__label' }, 'السعر العادل'),
    el('div', { class: 'rw-mini__amount' }, String(q.net), ' ', el('small', {}, 'ريال')),
    el('div', { class: 'rw-mini__summary' },
      q.labels.hours + ' يومياً · ' + q.labels.days + ' أسبوعياً · ' + q.labels.weeks + ' · ' + q.labels.kids),
    el('div', { class: 'rw-pills' }, pills),
    el('div', { class: 'rw-mini__rows' }, q.items.map(i =>
      el('div', { class: 'rw-mini__row' },
        el('div', { class: 'rw-item__text' },
          el('div', { class: 'rw-item__title' }, i.title),
          el('div', { class: 'rw-item__detail' }, i.detail)),
        money(i.sum))
    )),
    el('div', { class: 'rw-mini__note' },
      (q.upgradeNote ? q.upgradeNote + ' ' : '') +
      'كل مبلغ مأخوذ من أسعار الباقات المعلنة، والأسعار متطابقة في الفترتين.')
  );
}

function msgNode(m) {
  const g = m.who === 'g';
  const bubble = el('div', { class: 'rw-bubble' }, el('div', { class: 'rw-bubble__t' }, m.text));
  if (m.result) bubble.appendChild(resultCard(m.result));
  return el('div', { class: 'rw-msg rw-msg--' + (g ? 'g' : 'u') }, g ? avatar(true) : null, bubble);
}

function renderThread() {
  // يُزال مؤشر الكتابة أولاً حتى تبقى فهارس thread.children مطابقة لفهارس الرسائل.
  if (typingNode) { typingNode.remove(); typingNode = null; }
  while (rendered > S.msgs.length) { rendered--; thread.removeChild(thread.children[rendered]); }
  for (let i = rendered; i < S.msgs.length; i++) thread.appendChild(msgNode(S.msgs[i]));
  rendered = S.msgs.length;

  if (S.typing) {
    typingNode = el('div', { class: 'rw-msg rw-msg--g' }, avatar(true),
      el('div', { class: 'rw-bubble rw-typing', role: 'status', 'aria-label': 'يكتب الآن' },
        el('span'), el('span'), el('span')));
    thread.appendChild(typingNode);
  }
  thread.scrollTop = thread.scrollHeight;
}

function qbtn(label, sub, kind, onclick) {
  return el('button', { type: 'button', class: 'rw-qbtn' + (kind ? ' rw-qbtn--' + kind : ''), onclick },
    el('span', {}, label), sub ? el('small', {}, sub) : null);
}

function renderReplies() {
  let step = '', label = 'اختر الإجابة:', cols = 3, btns = [];

  if (S.stage === 'hours') {
    step = 'الخطوة 1 من 4 — الساعات'; label = 'عدد الساعات في اليوم:';
    btns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(h =>
      qbtn(String(h), h > 2 ? 'ساعات' : null, null,
        () => answer('hours', h, ar(h, HOUR_F) + ' يومياً', 'days', 'وكم يوماً في الأسبوع؟')));
  } else if (S.stage === 'days') {
    step = 'الخطوة 2 من 4 — الأيام'; label = 'عدد أيام الدوام في الأسبوع:';
    btns = [1, 2, 3, 4, 5].map(d =>
      qbtn(String(d), d > 2 ? 'أيام' : null, null,
        () => answer('days', d, ar(d, DAY_F) + ' أسبوعياً', 'weeks', 'وكم مدة الاشتراك؟')));
  } else if (S.stage === 'weeks') {
    step = 'الخطوة 3 من 4 — المدة'; label = 'مدة الاشتراك:'; cols = 2;
    btns = [
      qbtn('أسبوع', 'أسبوع واحد', null, () => answer('weeks', 1, 'أسبوع', 'kids', 'وكم عدد الأطفال؟')),
      qbtn('شهر', CFG.monthWeeks + ' أسابيع', null, () => answer('weeks', CFG.monthWeeks, 'شهر', 'kids', 'وكم عدد الأطفال؟')),
      qbtn('شهران', (CFG.monthWeeks * 2) + ' أسبوعاً', null, () => answer('weeks', CFG.monthWeeks * 2, 'شهران', 'kids', 'وكم عدد الأطفال؟')),
      qbtn('ترم كامل', CFG.termWeeks + ' أسبوعاً', 'gold', () => answer('weeks', CFG.termWeeks, 'ترم كامل', 'kids', 'وكم عدد الأطفال؟'))
    ];
  } else if (S.stage === 'kids') {
    step = 'الخطوة 4 من 4 — الأطفال'; label = 'عدد الأطفال:'; cols = 4;
    btns = [1, 2, 3, 4].map(k =>
      qbtn(String(k), k >= 2 ? 'خصم ' + CFG.siblingOff + '%' : 'طفل', k >= 2 ? 'gold' : null,
        () => answer('kids', k, ar(k, KID_F), 'done')));
  } else {
    step = 'اكتمل الحساب'; label = 'حساب آخر؟'; cols = 2;
    btns = [
      qbtn('احسب من جديد', null, 'primary', reset),
      qbtn('تعديل آخر إجابة', null, null, back)
    ];
  }

  document.getElementById('rw-step-text').textContent = step;
  replyLabel.textContent = label;
  quick.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
  clear(quick); btns.forEach(b => quick.appendChild(b));

  clear(nav);
  if (S.history.length) {
    nav.appendChild(el('button', { type: 'button', class: 'rw-nav__btn rw-nav__btn--back', onclick: back }, '← رجوع للخطوة السابقة'));
    nav.appendChild(el('button', { type: 'button', class: 'rw-nav__btn', onclick: reset }, 'من البداية'));
  }
}

function render() { renderThread(); renderReplies(); }

window.addEventListener('pagehide', stopTimers);
boot();
