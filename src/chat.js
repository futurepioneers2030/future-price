// هيكل الحاسبة بصيغة محادثة — سؤال واحد في كل خطوة، ورجوع في كل خطوة.
// المنطق الحسابي ليس هنا: المدخل (chat-main.js) يمرّر دالة result(state) تعيد نموذج بطاقة النتيجة.
import { defaults, ar, HOUR_F, DAY_F, KID_F } from './calc.js';
import { el, money, clear } from './ui.js';

// توقيتات مؤشر الكتابة بالمللي ثانية — كما في كراسة التسليم.
const MS = { intro: 650, step: 700, result: 850, handoff: 30 };

export function startChat(opts) {
  const DATA = opts.data;
  const CFG = defaults(DATA);
  const LOGO = DATA.logo;
  const INTRO = opts.intro || 'مرحباً. سأحسب لك السعر العادل من أسعار الباقات المعلنة — ثلاثة أسئلة قصيرة.';

  const S = {
    msgs: [{ who: 'g', text: INTRO }],
    typing: false, stage: 'hours', hours: null, days: null, weeks: null, duration: null, kids: 1, history: []
  };

  const timers = [];
  const wait = (ms, fn) => timers.push(setTimeout(fn, ms));
  const stopTimers = () => timers.splice(0).forEach(clearTimeout);

  const root = document.getElementById(opts.mount || 'rw-chat');
  const thread = el('div', { class: 'rw-thread', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'مجرى المحادثة' });
  const stepText = el('span', {}, 'الخطوة 1 من 4 — الساعات');
  const replyLabel = el('div', { class: 'rw-reply__label' }, 'عدد الساعات في اليوم:');
  const nav = el('div', { class: 'rw-nav' });
  const quick = el('div', { class: 'rw-quick' });
  let typingNode = null, rendered = 0;

  const avatar = sm => el('div', { class: 'rw-avatar' + (sm ? ' rw-avatar--sm' : '') },
    el('img', { src: LOGO, alt: '', 'aria-hidden': 'true' }));

  function boot() {
    clear(root);
    root.appendChild(el('div', { class: 'rw-chat' + (opts.variant ? ' rw-chat--' + opts.variant : '') },
      el('div', { class: 'rw-chat__head' }, avatar(),
        el('div', { class: 'rw-chat__id' },
          el('div', { class: 'rw-chat__name' }, opts.title || 'حاسبة التسعير'),
          el('div', { class: 'rw-chat__step' }, el('span', { class: 'rw-dot' }), stepText))),
      thread,
      el('div', { class: 'rw-reply' },
        el('div', { class: 'rw-reply__top' }, replyLabel, nav),
        quick)
    ));
    render();
    say(opts.firstQuestion || 'كم ساعة يبقى الطفل في المركز يومياً؟', MS.intro);
  }

  function say(text, delay, extra) {
    S.typing = true; render();
    wait(delay || MS.intro, () => {
      S.typing = false;
      S.msgs.push(Object.assign({ who: 'g', text }, extra || {}));
      render();
    });
  }

  function answer(field, value, label, next, question, extra) {
    stopTimers();
    // اللقطة تُؤخذ قبل أي تغيير، وإلا لأعاد الرجوع القيمة الجديدة لا القديمة.
    S.history.push({ stage: S.stage, hours: S.hours, days: S.days, weeks: S.weeks, duration: S.duration, kids: S.kids, msgsLen: S.msgs.length });
    if (extra) Object.assign(S, extra);
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
    S.stage = p.stage; S.hours = p.hours; S.days = p.days; S.weeks = p.weeks; S.duration = p.duration; S.kids = p.kids;
    render();
  }

  function reset() {
    stopTimers();
    S.msgs = [{ who: 'g', text: opts.resetIntro || 'نبدأ من جديد. كم ساعة يبقى الطفل في المركز يومياً؟' }];
    S.typing = false; S.stage = 'hours'; S.hours = null; S.days = null; S.weeks = null; S.duration = null; S.kids = 1; S.history = [];
    render();
  }

  function finish() {
    const model = opts.result({ hours: S.hours, daysPerWeek: S.days, weeks: S.weeks, duration: S.duration, kids: S.kids });
    say(model.lead || 'هذا هو السعر العادل:', MS.result, { card: model });
  }

  /* ——— العرض ——— */

  function resultCard(m) {
    return el('div', { class: 'rw-mini' + (m.variant ? ' rw-mini--' + m.variant : '') },
      el('div', { class: 'rw-mini__label' }, m.label),
      m.before ? el('div', { class: 'rw-mini__before' },
        m.before.label + ' ', el('s', {}, String(m.before.sum) + ' ريال')) : null,
      el('div', { class: 'rw-mini__amount' }, String(m.amount), ' ', el('small', {}, 'ريال')),
      el('div', { class: 'rw-mini__summary' }, m.summary),
      el('div', { class: 'rw-pills' }, (m.pills || []).map(p =>
        el('div', { class: 'rw-pill' + (p.kind ? ' rw-pill--' + p.kind : '') }, p.text))),
      el('div', { class: 'rw-mini__rows' }, (m.rows || []).map(r =>
        el('div', { class: 'rw-mini__row' + (r.promo ? ' rw-mini__row--promo' : '') },
          el('div', { class: 'rw-item__text' },
            el('div', { class: 'rw-item__title' }, r.title),
            el('div', { class: 'rw-item__detail' }, r.detail)),
          money(r.sum)))),
      el('div', { class: 'rw-mini__note' }, m.note)
    );
  }

  function msgNode(m) {
    const g = m.who === 'g';
    const bubble = el('div', { class: 'rw-bubble' }, el('div', { class: 'rw-bubble__t' }, m.text));
    if (m.card) bubble.appendChild(resultCard(m.card));
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

  const qbtn = (label, sub, kind, onclick) =>
    el('button', { type: 'button', class: 'rw-qbtn' + (kind ? ' rw-qbtn--' + kind : ''), onclick },
      el('span', {}, label), sub ? el('small', {}, sub) : null);

  function renderReplies() {
    let step = '', label = 'اختر الإجابة:', cols = 3, btns = [];

    if (S.stage === 'hours') {
      step = 'الخطوة 1 من 4 — الساعات'; label = 'عدد الساعات في اليوم:';
      btns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(h =>
        qbtn(String(h), h > 2 ? 'ساعات' : null, opts.markHours && opts.markHours(h) ? 'gold' : null,
          () => answer('hours', h, ar(h, HOUR_F) + ' يومياً', 'days', 'وكم يوماً في الأسبوع؟')));
    } else if (S.stage === 'days') {
      step = 'الخطوة 2 من 4 — الأيام'; label = 'عدد أيام الدوام في الأسبوع:';
      btns = [1, 2, 3, 4, 5].map(d =>
        qbtn(String(d), d > 2 ? 'أيام' : null, opts.markDays && opts.markDays(S.hours, d) ? 'gold' : null,
          () => answer('days', d, ar(d, DAY_F) + ' أسبوعياً', 'weeks', 'وكم مدة الاشتراك؟')));
    } else if (S.stage === 'weeks') {
      // المدد المعتمدة ثلاث فقط: أسبوع · شهر · ترم — لا «شهران».
      step = 'الخطوة 3 من 4 — المدة'; label = 'مدة الاشتراك:'; cols = 3;
      const pickWeeks = (w, key, text) => () =>
        answer('weeks', w, text, 'kids', 'وكم عدد الأطفال؟', { duration: key });
      btns = [
        qbtn('أسبوع', 'أسبوع واحد', null, pickWeeks(1, 'week', 'أسبوع')),
        qbtn('شهر', CFG.monthWeeks + ' أسابيع', null, pickWeeks(CFG.monthWeeks, 'month', 'شهر')),
        qbtn('ترم كامل', CFG.termWeeks + ' أسبوعاً', 'gold', pickWeeks(CFG.termWeeks, 'term', 'ترم كامل'))
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

    stepText.textContent = step;
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
}
