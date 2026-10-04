/* Screens, input handling, sound and saved progress for the tense table game. */
(function () {
  'use strict';

  const E = window.TenseEngine;
  const view = document.getElementById('view');
  const peekDialog = document.getElementById('peek');
  const peekBody = document.getElementById('peekBody');
  const voiceBtn = document.getElementById('voiceBtn');
  const soundBtn = document.getElementById('soundBtn');
  const homeBtn = document.getElementById('homeBtn');

  if (!E || !view || !peekDialog || !peekBody || !voiceBtn || !soundBtn || !homeBtn) {
    document.body.textContent = 'Игра не загрузилась: файл повреждён. Открой его заново.';
    return;
  }

  const STORE_KEY = 'tense-table:v1';
  const PASS_GRADE = 3;
  const AUTO_NEXT_MS = 1400;
  const BLITZ_OK_MS = 350;
  const BLITZ_BAD_MS = 1500;
  const RETRY_GAP = 3;
  const CLOCK_CELLS = 30;
  const CLOCK_TICK_MS = 200;
  const MAX_SHOWN_MISTAKES = 10;
  const KEYBOARD_MIN_PX = 120;
  const VIEW_GAP_PX = 12;
  const BUZZ_MS = 60;

  const TASK_LABEL = {
    cell: 'В какой клетке эта фраза?',
    choice: 'Выбери перевод',
    build: 'Собери перевод',
    type: 'Напиши перевод',
  };

  const VERDICT = {
    6: 'Без единой ошибки!',
    5: 'Отлично.',
    4: 'Хорошо. Ошибки — ниже.',
    3: 'Зачёт. Повтори урок — будет твёрже.',
    2: 'Пока не зачёт. Загляни в таблицу и повтори.',
  };

  const SFX = {
    ok: [[660, 0, 0.09, 'sine'], [990, 0.08, 0.14, 'sine']],
    bad: [[196, 0, 0.22, 'triangle'], [147, 0.1, 0.25, 'triangle']],
    tap: [[520, 0, 0.05, 'sine']],
    grade: [[523, 0, 0.12, 'sine'], [659, 0.11, 0.12, 'sine'], [784, 0.22, 0.12, 'sine'], [1047, 0.33, 0.3, 'sine']],
  };

  const TICK = '<svg class="pen pen-tick" viewBox="0 0 32 28" aria-hidden="true"><path pathLength="1" d="M3 15 L11 24 L29 3"/></svg>';
  const RING = '<svg class="pen pen-ring" viewBox="0 0 120 120" aria-hidden="true"><path pathLength="1" d="M66 9 C30 2 6 30 10 62 C14 96 46 114 78 106 C108 98 118 62 104 34 C94 14 70 6 48 12"/></svg>';

  const WHO_ALL = 'I · you · we · they · he · she';
  const WHO_MANY = 'I · you · we · they';
  const WHO_THIRD = 'he · she';

  // Formula lines per cell; a part flagged `true` gets the highlighter.
  const CELL_LINES = {
    'future:question': [{ who: WHO_ALL, parts: [['Will', true], [' … love?']] }],
    'future:statement': [{ who: WHO_ALL, parts: [['… '], ['will', true], [' love']] }],
    'future:negation': [{ who: WHO_ALL, parts: [['… '], ['will not', true], [' love']] }],
    'present:question': [
      { who: WHO_MANY, parts: [['Do', true], [' … love?']] },
      { who: WHO_THIRD, parts: [['Does', true], [' … love?']] },
    ],
    'present:statement': [
      { who: WHO_MANY, parts: [['… love']] },
      { who: WHO_THIRD, parts: [['… love'], ['s', true]] },
    ],
    'present:negation': [
      { who: WHO_MANY, parts: [['… '], ['don’t', true], [' love']] },
      { who: WHO_THIRD, parts: [['… '], ['doesn’t', true], [' love']] },
    ],
    'past:question': [{ who: WHO_ALL, parts: [['Did', true], [' … love?']] }],
    'past:statement': [{ who: WHO_ALL, parts: [['… love'], ['d', true]], note: 'неправильные: see → saw' }],
    'past:negation': [{ who: WHO_ALL, parts: [['… '], ['did not', true], [' love']] }],
  };

  const ROW_AUX = { future: ['will'], present: ['do', 'does'], past: ['did'] };
  const MINI_ROWS = ['Б', 'Н', 'П'];
  const MINI_COLS = ['?', '+', '−'];

  // ---------- small DOM helpers ----------

  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [name, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (name === 'class') node.className = value;
        else if (name === 'text') node.textContent = value;
        else if (name === 'dataset') Object.assign(node.dataset, value);
        else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
        else node.setAttribute(name, value === true ? '' : String(value));
      }
    }
    append(node, kids);
    return node;
  }

  function append(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }

  function put(node, ...kids) {
    node.replaceChildren();
    append(node, kids);
  }

  // Only ever called with the static markup constants above.
  function svg(markup) {
    const holder = document.createElement('template');
    holder.innerHTML = markup;
    return holder.content.firstElementChild;
  }

  function cellName(key) {
    const [tense, form] = key.split(':');
    return `${E.TENSE_LABEL[tense]} · ${E.FORM_LABEL[form].toLowerCase()}`;
  }

  // ---------- saved progress ----------

  function defaults() {
    return { grades: {}, cells: {}, blitzBest: 0, voice: true, sound: true, lastDay: '', streak: 0 };
  }

  /** Keeps only well-formed values, so a damaged save cannot break the game. */
  function sanitize(data) {
    const clean = defaults();
    if (!data || typeof data !== 'object') return clean;
    const grades = data.grades && typeof data.grades === 'object' ? data.grades : {};
    const cells = data.cells && typeof data.cells === 'object' ? data.cells : {};
    for (const lesson of E.LESSONS) {
      const value = grades[lesson.id];
      if (Number.isInteger(value) && value >= 2 && value <= 6) clean.grades[lesson.id] = value;
    }
    for (const tense of E.TENSES) {
      for (const form of E.FORMS) {
        const key = E.cellKey(tense, form);
        const value = cells[key];
        if (Number.isInteger(value) && value >= 0 && value <= E.MAX_STRENGTH) clean.cells[key] = value;
      }
    }
    if (Number.isInteger(data.blitzBest) && data.blitzBest >= 0) clean.blitzBest = data.blitzBest;
    if (typeof data.voice === 'boolean') clean.voice = data.voice;
    if (typeof data.sound === 'boolean') clean.sound = data.sound;
    if (E.isDayKey(data.lastDay) && Number.isInteger(data.streak) && data.streak > 0) {
      clean.lastDay = data.lastDay;
      clean.streak = data.streak;
    }
    return clean;
  }

  let storageBroken = false;

  function loadStore() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : defaults();
    } catch (err) {
      console.warn('Saved progress is unreadable, starting clean:', err);
      storageBroken = true;
      return defaults();
    }
  }

  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
      storageBroken = false;
    } catch (err) {
      console.warn('Progress cannot be saved:', err);
      storageBroken = true;
    }
  }

  let store = loadStore();
  let session = null;
  let activeScreen = 'home';

  function today() {
    return E.dayKey(new Date());
  }

  // ---------- the phone's Back button ----------

  function hasInnerState(state) {
    return Boolean(state && typeof state === 'object' && state.inner === true);
  }

  // True while a lesson screen sits on top of the home screen in the browser history.
  let inner = hasInnerState(window.history.state);

  function enterInner() {
    if (inner) return;
    try {
      window.history.pushState({ inner: true }, '');
      inner = true;
    } catch (err) {
      console.warn('Browser history is unavailable:', err);
    }
  }

  function goHome() {
    const leave = inner;
    inner = false;
    renderHome();
    if (!leave) return;
    try {
      window.history.back();
    } catch (err) {
      console.warn('Browser history is unavailable:', err);
    }
  }

  // ---------- sound and voice ----------

  let audioCtx = null;

  function beep(notes) {
    if (!store.sound) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => console.warn('Audio stays suspended:', err));
      }
      const start = audioCtx.currentTime;
      for (const [freq, at, length, type] of notes) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(0.09, start + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start + at);
        osc.stop(start + at + length + 0.02);
      }
    } catch (err) {
      console.warn('Sound is unavailable:', err);
    }
  }

  function buzz() {
    if (!store.sound || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(BUZZ_MS);
    } catch (err) {
      console.warn('Vibration is unavailable:', err);
    }
  }

  const canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  function hush() {
    if (!canSpeak) return;
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.warn('Voice cannot be stopped:', err);
    }
  }

  /** Says the phrase aloud; `force` is for an explicit tap on "listen" while the voice is switched off. */
  function speak(text, force = false) {
    if (!canSpeak || (!store.voice && !force)) return;
    try {
      window.speechSynthesis.cancel();
      const phrase = new window.SpeechSynthesisUtterance(text);
      phrase.lang = 'en-US';
      phrase.rate = 0.92;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === 'en-US') ||
        window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'));
      if (voice) phrase.voice = voice;
      window.speechSynthesis.speak(phrase);
    } catch (err) {
      console.warn('Voice is unavailable:', err);
    }
  }

  function syncToggles() {
    voiceBtn.hidden = !canSpeak;
    voiceBtn.setAttribute('aria-pressed', String(store.voice));
    voiceBtn.textContent = store.voice ? 'Голос: вкл' : 'Голос: выкл';
    soundBtn.setAttribute('aria-pressed', String(store.sound));
    soundBtn.textContent = store.sound ? 'Звук: вкл' : 'Звук: выкл';
  }

  // ---------- on-screen keyboard ----------

  const viewport = window.visualViewport || null;

  /** Scrolls just enough to bring `bottoms` into the visible area, never pushing `top` out of it. */
  function keepInView(bottoms, top) {
    const edge = viewport ? viewport.offsetTop : 0;
    const height = viewport ? viewport.height : window.innerHeight;
    const lowest = Math.max(...bottoms.map((node) => node.getBoundingClientRect().bottom));
    const over = lowest + VIEW_GAP_PX - (edge + height);
    const room = top.getBoundingClientRect().top - edge - VIEW_GAP_PX;
    const by = Math.min(over, room);
    if (by > 0) window.scrollBy(0, by);
  }

  function showStage() {
    if (session) keepInView([session.ui.feedback, session.ui.actions], session.ui.task);
  }

  function focusInput() {
    const input = session ? session.ui.input : null;
    if (input && document.activeElement !== input) input.focus();
  }

  /** A button that leaves the focus, and with it the on-screen keyboard, where it was. */
  function holdFocus(button) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    return button;
  }

  /** The keyboard covers the page instead of resizing it: leave that much room under the sheet. */
  function syncKeyboard() {
    const zoomed = Math.abs(viewport.scale - 1) > 0.01;
    const covered = zoomed ? 0 : Math.round(window.innerHeight - viewport.height);
    const inset = covered >= KEYBOARD_MIN_PX ? covered : 0;
    document.documentElement.style.setProperty('--kb', `${inset}px`);
    if (session && session.ui.input && document.activeElement === session.ui.input) showStage();
  }

  // ---------- the table ----------

  function cellLines(key) {
    return CELL_LINES[key].map((line) =>
      el('span', { class: 'tline' },
        el('span', { class: 'who', text: line.who }),
        el('span', { class: 'formula', lang: 'en' },
          line.parts.map(([text, marked]) => (marked ? el('span', { class: 'k', text }) : text))),
        line.note ? el('span', { class: 'note', text: line.note }) : null));
  }

  function masteryDots(key) {
    const level = store.cells[key] || 0;
    const dots = [];
    for (let i = 0; i < E.MAX_STRENGTH; i += 1) dots.push(el('i', { class: i < level ? 'on' : null }));
    return el('span', { class: 'mastery', role: 'img', 'aria-label': `Выучено: ${level} из ${E.MAX_STRENGTH}` }, dots);
  }

  /** The 3×3 table. With `onPick` the cells are empty buttons; otherwise they show the formulas. */
  function buildTable({ onPick = null, mastery = false } = {}) {
    const table = el('div', { class: onPick ? 'ttable is-pick' : 'ttable' });
    table.append(el('div', { class: 'tcorner' }));
    for (const form of E.FORMS) table.append(el('div', { class: 'thead', text: E.FORM_LABEL[form] }));
    for (const tense of E.TENSES) {
      // In pick mode the helper words stay hidden: they would give the row away.
      table.append(el('div', { class: 'trow' },
        onPick ? null : ROW_AUX[tense].map((word) => el('span', { class: 'aux', lang: 'en', text: word })),
        el('span', { class: 'tense', text: E.TENSE_LABEL[tense] })));
      for (const form of E.FORMS) {
        const key = E.cellKey(tense, form);
        if (onPick) {
          table.append(el('button', {
            class: 'tcell', type: 'button', dataset: { key },
            'aria-label': `${E.TENSE_LABEL[tense]}, ${E.FORM_LABEL[form].toLowerCase()}`,
            onclick: () => onPick(key),
          }));
        } else {
          table.append(el('div', { class: 'tcell', dataset: { key } }, cellLines(key), mastery ? masteryDots(key) : null));
        }
      }
    }
    return table;
  }

  function miniMap(key) {
    const map = el('div', { class: 'mini', 'aria-hidden': 'true' });
    map.append(el('span', { class: 'mini-l' }));
    for (const sign of MINI_COLS) map.append(el('span', { class: 'mini-l', text: sign }));
    E.TENSES.forEach((tense, row) => {
      map.append(el('span', { class: 'mini-l', text: MINI_ROWS[row] }));
      for (const form of E.FORMS) {
        map.append(el('span', { class: E.cellKey(tense, form) === key ? 'mini-c on' : 'mini-c' }));
      }
    });
    return el('figure', { class: 'mini-wrap' }, map, el('figcaption', { text: cellName(key) }));
  }

  // ---------- home ----------

  function isUnlocked(index) {
    return index === 0 || (store.grades[E.LESSONS[index - 1].id] || 0) >= PASS_GRADE;
  }

  function buildDiary() {
    const diary = el('div', { class: 'diary' },
      el('div', { class: 'diary-head' }, el('span', { text: '№' }), el('span', { text: 'Урок' }), el('span', { text: 'Оценка' })));
    E.LESSONS.forEach((lesson, index) => {
      const open = isUnlocked(index);
      const best = store.grades[lesson.id];
      diary.append(el('button', { class: 'diary-row', type: 'button', disabled: !open, onclick: () => renderIntro(index) },
        el('span', { class: 'diary-n', text: String(index + 1) }),
        el('span', { class: 'diary-body' },
          el('span', { class: 'diary-title', text: lesson.title }),
          el('span', { class: 'diary-brief', text: open ? lesson.brief : `Откроется после зачёта по уроку ${index}.` })),
        el('span', { class: 'diary-grade' }, best ? el('b', { text: E.gradeText(best) }) : null)));
    });
    return diary;
  }

  function streakLine() {
    const day = today();
    const days = E.streakNow(store.lastDay, store.streak, day);
    if (days < 1) return null;
    const tail = store.lastDay === day ? '' : ' — сегодня урока ещё не было';
    return el('p', { class: 'streak', text: `Дней подряд: ${days}${tail}` });
  }

  function renderHome() {
    stopSession();
    activeScreen = 'home';
    const learned = (store.grades.exam || 0) >= 5;
    put(view, el('section', { class: 'home' },
      el('h1', { class: 'title', text: 'Таблица времён' }),
      learned ? el('p', { class: 'stamp', text: 'Выучено на зубок' }) : null,
      streakLine(),
      el('p', { class: 'lead', text: 'Три времени на три типа фразы — девять клеток. Восемь уроков: от «найди клетку» до контрольной без подсказок.' }),
      storageBroken ? el('p', { class: 'warn', text: 'Браузер не даёт сохранять оценки: они пропадут, когда закроешь вкладку.' }) : null,
      buildTable({ mastery: true }),
      el('p', { class: 'legend', text: 'Квадратики в углу клетки — насколько твёрдо она выучена. Пять закрашенных — клетка твоя.' }),
      el('h2', { class: 'section-title', text: 'Уроки' }),
      buildDiary(),
      el('p', { class: 'home-foot' },
        el('button', { class: 'link', type: 'button', onclick: resetProgress, text: 'Стереть оценки и начать заново' }))));
    window.scrollTo(0, 0);
  }

  function resetProgress() {
    if (!window.confirm('Стереть все оценки и начать заново?')) return;
    store = Object.assign(defaults(), { voice: store.voice, sound: store.sound });
    saveStore();
    renderHome();
  }

  // ---------- lesson intro ----------

  function vocabList(group, withPast) {
    return el('ul', { class: 'vocab' }, E.verbPool(group).map((v) =>
      el('li', null,
        el('b', { lang: 'en', text: v.base }),
        el('span', { text: v.ru.inf }),
        withPast ? el('i', { lang: 'en', text: v.past }) : null)));
  }

  function introMaterial(lesson) {
    if (lesson.id === 'regular') return [vocabList('regular', false)];
    if (lesson.id === 'irregular') {
      return [
        el('p', { class: 'examples', lang: 'en', text: 'She saw. · Did she see? · She did not see.' }),
        vocabList('irregular', true),
      ];
    }
    if (lesson.blitz) {
      const scale = E.BLITZ_SCALE.filter(([, value]) => value <= 5).map(([min, value]) => `${value} — от ${min} очков`).join(', ');
      return [
        el('p', { class: 'lead', text: `Оценки: ${scale}.` }),
        store.blitzBest > 0 ? el('p', { class: 'examples', text: `Твой рекорд: ${store.blitzBest}` }) : null,
      ];
    }
    if (lesson.exam) return [el('p', { class: 'lead', text: 'Оценки: 5 — не больше двух ошибок, 4 — до шести, 3 — до десяти.' })];
    return [
      buildTable(),
      el('p', { class: 'legend', text: 'В уроке таблица спрятана. Кнопка «Подсмотреть» её откроет, но такой ответ не идёт в оценку.' }),
    ];
  }

  function renderIntro(index) {
    stopSession();
    const lesson = E.LESSONS[index];
    if (!lesson || !isUnlocked(index)) {
      renderHome();
      return;
    }
    activeScreen = 'intro';
    enterInner();
    const start = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => startLesson(index), text: 'Начать урок' });
    put(view, el('section', { class: 'intro' },
      el('p', { class: 'eyebrow', text: `Урок ${index + 1}` }),
      el('h1', { class: 'title', text: lesson.title }),
      el('p', { class: 'lead', text: lesson.how }),
      introMaterial(lesson),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: goHome, text: 'К таблице' }),
        start)));
    window.scrollTo(0, 0);
    start.focus();
  }

  // ---------- play ----------

  function stopSession() {
    if (session) {
      window.clearTimeout(session.autoTimer);
      window.clearInterval(session.clock);
      session = null;
    }
    hush();
    if (peekDialog.open) peekDialog.close();
  }

  function startLesson(index) {
    stopSession();
    const lesson = E.LESSONS[index];
    if (!lesson || !isUnlocked(index)) {
      renderHome();
      return;
    }
    activeScreen = 'play';
    enterInner();
    // The stage is built once per lesson and updated in place: replacing the text
    // input between questions would close the on-screen keyboard.
    const ui = {
      meter: el('div', { class: 'meter' }),
      task: el('div', { class: 'task-row' }),
      answer: el('div', { class: 'answer' }),
      feedback: el('div', { class: 'feedback', 'aria-live': 'polite' }),
      actions: el('div', { class: 'actions' }),
      input: null, line: null, shown: '',
    };
    session = {
      index, lesson, ui,
      queue: [], pos: -1, total: 0, marks: [],
      mistakes: [], correct: 0, wrong: 0,
      current: null, answered: false, peeked: false,
      check: null, undo: null, lastVerb: null,
      autoTimer: 0, clock: 0, endsAt: 0, leftMs: 0,
    };
    if (lesson.blitz) {
      session.endsAt = Date.now() + lesson.seconds * 1000;
      session.clock = window.setInterval(tickClock, CLOCK_TICK_MS);
    } else {
      const plan = E.lessonPlan(lesson);
      session.total = plan.length;
      session.queue = plan.map((q, slot) => ({ q, slot }));
      session.marks = new Array(plan.length).fill(null);
    }
    put(view, el('section', { class: 'play' },
      el('header', { class: 'play-head' },
        el('p', { class: 'eyebrow', text: `Урок ${index + 1} · ${lesson.title}` }),
        el('div', { class: 'play-tools', 'data-keep-enter': true },
          lesson.peek ? el('button', { class: 'btn btn-small', type: 'button', onclick: openPeek, text: 'Подсмотреть' }) : null,
          el('button', { class: 'btn btn-small', type: 'button', onclick: goHome, text: 'Выйти' }))),
      ui.meter,
      el('div', { class: 'stage' }, ui.task, ui.answer, ui.feedback, ui.actions)));
    window.scrollTo(0, 0);
    nextQuestion();
  }

  /** The blitz clock stops while the page is hidden: a phone call must not eat the minute and a half. */
  function pauseClock() {
    if (!session || !session.lesson.blitz || session.clock === 0) return;
    session.leftMs = Math.max(0, session.endsAt - Date.now());
    window.clearInterval(session.clock);
    session.clock = 0;
  }

  function resumeClock() {
    if (!session || !session.lesson.blitz || session.clock !== 0) return;
    session.endsAt = Date.now() + session.leftMs;
    session.clock = window.setInterval(tickClock, CLOCK_TICK_MS);
    renderMeter();
  }

  function blitzScore() {
    return Math.max(0, session.correct - session.wrong);
  }

  function tickClock() {
    if (!session) return;
    if (Date.now() >= session.endsAt) finishLesson();
    else renderMeter();
  }

  function renderMeter() {
    if (!session) return;
    const { lesson, ui } = session;
    if (lesson.blitz) {
      const left = Math.max(0, session.endsAt - Date.now());
      const lit = Math.ceil((left / (lesson.seconds * 1000)) * CLOCK_CELLS);
      const cells = [];
      for (let i = 0; i < CLOCK_CELLS; i += 1) cells.push(el('span', { class: i < lit ? 'pg ok' : 'pg off' }));
      put(ui.meter,
        el('div', { class: 'meter-cells is-clock' }, cells),
        el('span', { class: 'meter-note', text: `${Math.ceil(left / 1000)} с · счёт ${blitzScore()}` }));
      return;
    }
    const slot = session.current ? session.current.slot : -1;
    const done = session.marks.filter(Boolean).length;
    put(ui.meter,
      el('div', { class: 'meter-cells' },
        session.marks.map((mark, i) => el('span', { class: mark ? `pg ${mark}` : i === slot ? 'pg now' : 'pg' }))),
      el('span', { class: 'meter-note', text: `${done} из ${session.total}` }));
  }

  function nextQuestion() {
    if (!session) return;
    window.clearTimeout(session.autoTimer);
    session.answered = false;
    session.peeked = false;
    session.check = null;
    session.undo = null;
    if (session.lesson.blitz) {
      const pool = E.verbPool(session.lesson.verbs).filter((v) => v !== session.lastVerb);
      session.lastVerb = pool[Math.floor(Math.random() * pool.length)];
      session.current = { q: E.makeQuestion(E.weightedPattern(store.cells), session.lastVerb), slot: -1 };
    } else {
      session.pos += 1;
      if (session.pos >= session.queue.length) {
        finishLesson();
        return;
      }
      session.current = session.queue[session.pos];
    }
    renderQuestion();
  }

  function renderQuestion() {
    if (!session) return;
    const { lesson, current, ui } = session;
    const q = current.q;
    const mode = lesson.mode;
    const isRetry = !lesson.blitz && current.slot < 0;
    put(ui.task,
      el('div', { class: 'task' },
        el('p', { class: 'task-label', text: isRetry ? 'Работа над ошибками' : TASK_LABEL[mode] }),
        mode === 'cell'
          ? el('p', { class: 'prompt prompt-hand', lang: 'en', text: q.en })
          : el('p', { class: 'prompt', text: q.ru }),
        mode === 'type' && lesson.verbs !== 'love'
          ? el('p', { class: 'verb-chip' }, 'глагол: ', el('b', { lang: 'en', text: q.verb.base }), ` — ${q.verb.ru.inf}`)
          : null),
      lesson.hint ? miniMap(q.key) : null);
    ui.feedback.className = 'feedback';
    put(ui.feedback);
    put(ui.actions);
    MOUNT[mode](q);
    renderMeter();
  }

  function mountCell(q) {
    const table = buildTable({
      onPick: (key) => {
        if (!session || session.answered) return;
        for (const cell of table.querySelectorAll('.tcell')) {
          cell.disabled = true;
          if (cell.dataset.key === q.key) {
            cell.classList.add('is-right');
            append(cell, cellLines(q.key));
          } else if (cell.dataset.key === key) {
            cell.classList.add('is-wrong');
          }
        }
        settle(key === q.key, cellName(key));
      },
    });
    put(session.ui.answer, table);
  }

  function mountChoice(q) {
    const list = el('div', { class: 'options' });
    E.options(q).forEach((option, i) => {
      const button = el('button', { class: 'option', type: 'button', lang: 'en', dataset: { correct: option.correct ? '1' : '0' } },
        el('span', { class: 'key', text: String(i + 1) }),
        el('span', { class: 'option-text', text: option.text }));
      button.addEventListener('click', () => {
        if (!session || session.answered) return;
        for (const other of list.querySelectorAll('.option')) {
          other.disabled = true;
          if (other.dataset.correct === '1') {
            other.classList.add('is-right');
            other.append(svg(TICK));
          }
        }
        if (!option.correct) button.classList.add('is-wrong');
        settle(option.correct, option.text);
      });
      list.append(button);
    });
    put(session.ui.answer, list);
  }

  function mountBuild(q) {
    const line = el('div', { class: 'line', lang: 'en' });
    const tray = el('div', { class: 'tiles' });
    const built = [];
    const check = el('button', { class: 'btn btn-primary', type: 'button', text: 'Проверить' });

    function redraw() {
      put(line, built.map((tile, i) => el('button', {
        class: 'word', type: 'button', title: 'Убрать слово',
        text: i === 0 ? E.cap(tile.word) : tile.word,
        onclick: () => remove(i),
      })));
      if (built.length === 0) line.append(el('span', { class: 'line-hint', lang: 'ru', text: 'нажимай слова по порядку' }));
      check.disabled = built.length === 0;
    }

    function remove(i) {
      if (!session || session.answered || i < 0 || i >= built.length) return;
      built[i].node.disabled = false;
      built[i].node.classList.remove('is-used');
      built.splice(i, 1);
      redraw();
    }

    for (const item of E.tiles(q)) {
      const tile = { word: item.word, node: null };
      tile.node = el('button', {
        class: 'tile', type: 'button', lang: 'en', text: item.word,
        onclick: () => {
          if (!session || session.answered) return;
          beep(SFX.tap);
          built.push(tile);
          tile.node.disabled = true;
          tile.node.classList.add('is-used');
          redraw();
        },
      });
      tray.append(tile.node);
    }

    function submit() {
      if (!session || session.answered || built.length === 0) return;
      const given = built.map((tile) => tile.word).join(' ');
      const ok = E.isCorrect(given, q);
      for (const node of line.querySelectorAll('.word')) node.disabled = true;
      for (const node of tray.querySelectorAll('.tile')) node.disabled = true;
      line.classList.add(ok ? 'is-right' : 'is-wrong');
      if (ok) line.append(svg(TICK));
      settle(ok, E.cap(given));
    }

    check.addEventListener('click', submit);
    session.check = submit;
    session.undo = () => remove(built.length - 1);
    redraw();
    put(session.ui.answer, line, tray);
    put(session.ui.actions, check);
  }

  function submitTyped() {
    if (!session || session.answered || !session.ui.input) return;
    const { ui } = session;
    const q = session.current.q;
    const given = ui.input.value.trim();
    if (E.hasCyrillic(given)) {
      note('Раскладка русская. Переключи на английскую.');
      return;
    }
    if (E.normalize(given).length === 0) {
      ui.line.classList.remove('nudge');
      void ui.line.offsetWidth; // restart the nudge animation
      ui.line.classList.add('nudge');
      return;
    }
    const ok = E.isCorrect(given, q);
    ui.shown = ok ? q.en : given;
    ui.input.value = ui.shown;
    ui.line.classList.add(ok ? 'is-right' : 'is-wrong');
    if (ok) ui.line.append(svg(TICK));
    settle(ok, given);
  }

  /** One input lives through the whole lesson, so a phone keeps its keyboard open between questions. */
  function buildTypeLine(ui) {
    const input = el('input', {
      class: 'line-input', type: 'text', lang: 'en', maxlength: '80', enterkeyhint: 'done',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      placeholder: 'пиши по-английски', 'aria-label': 'Перевод на английский',
    });
    // The answered line stays as written until the next question.
    input.addEventListener('beforeinput', (event) => {
      if (session && session.answered) event.preventDefault();
    });
    input.addEventListener('input', () => {
      if (session && session.answered && input.value !== ui.shown) input.value = ui.shown;
    });
    // A held Enter must not check the answer and skip to the next question in one go.
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.repeat) event.preventDefault();
    });
    ui.input = input;
    ui.line = el('div', { class: 'line' }, input);
    put(ui.answer, el('form', {
      class: 'type-form', novalidate: true,
      onsubmit: (event) => {
        event.preventDefault();
        if (!session) return;
        if (session.answered) nextQuestion();
        else submitTyped();
      },
    }, ui.line));
  }

  function mountType() {
    const { ui } = session;
    if (!ui.input) buildTypeLine(ui);
    const tick = ui.line.querySelector('.pen');
    if (tick) tick.remove();
    ui.line.className = 'line';
    ui.shown = '';
    ui.input.value = '';
    session.check = submitTyped;
    put(ui.actions, holdFocus(el('button', {
      class: 'btn btn-primary', type: 'button', text: 'Проверить',
      onclick: () => {
        submitTyped();
        focusInput();
      },
    })));
    focusInput();
    showStage();
  }

  const MOUNT = { cell: mountCell, choice: mountChoice, build: mountBuild, type: mountType };

  function note(text) {
    if (!session) return;
    const box = session.ui.feedback;
    box.className = 'feedback is-bad';
    put(box, el('div', { class: 'fb-text' }, el('p', { class: 'fb-rule', text })));
    showStage();
  }

  /** Records the answer, shows the teacher's mark and schedules the next question. */
  function settle(ok, given) {
    const { lesson, current } = session;
    const q = current.q;
    const counted = lesson.blitz || current.slot >= 0;
    const clean = ok && !session.peeked;
    session.answered = true;

    if (lesson.blitz) {
      if (ok) session.correct += 1;
      else session.wrong += 1;
    } else if (current.slot >= 0) {
      session.marks[current.slot] = clean ? 'ok' : ok ? 'peek' : 'bad';
    }
    if (counted && (clean || !ok)) {
      store.cells[q.key] = E.nextStrength(store.cells[q.key] || 0, ok);
      saveStore();
    }
    if (!ok) {
      session.mistakes.push(lesson.mode === 'cell'
        ? { prompt: q.en, right: cellName(q.key), given }
        : { prompt: q.ru, right: q.en, given });
      if (!lesson.blitz && !lesson.exam) {
        session.queue.splice(Math.min(session.pos + 1 + RETRY_GAP, session.queue.length), 0, { q, slot: -1 });
      }
    }

    beep(ok ? SFX.ok : SFX.bad);
    if (!ok) buzz();
    if (!lesson.blitz) speak(q.en);
    showFeedback(ok, q);
    renderMeter();

    if (lesson.blitz) {
      session.autoTimer = window.setTimeout(nextQuestion, ok ? BLITZ_OK_MS : BLITZ_BAD_MS);
      showStage();
      return;
    }
    const typing = Boolean(session.ui.input);
    const next = el('button', { class: 'btn btn-primary', type: 'button', text: 'Дальше', onclick: nextQuestion });
    put(session.ui.actions, typing ? holdFocus(next) : next);
    // While typing, the focus stays in the input: moving it would close the on-screen keyboard.
    if (!typing) next.focus({ preventScroll: true });
    showStage();
    if (ok) session.autoTimer = window.setTimeout(nextQuestion, AUTO_NEXT_MS);
  }

  /** Repeats the phrase on request and holds the question on screen until "next" is pressed. */
  function listen(text) {
    if (!session) return;
    window.clearTimeout(session.autoTimer);
    speak(text, true);
    focusInput();
  }

  function showFeedback(ok, q) {
    const { lesson, ui } = session;
    const isCell = lesson.mode === 'cell';
    const text = el('div', { class: 'fb-text' });
    if (ok) {
      const words = session.peeked ? 'Верно, но с подсказкой: в оценку не идёт.' : isCell ? `Верно. ${q.ru}` : 'Верно.';
      text.append(el('p', null, svg(TICK), words));
    } else {
      text.append(el('p', null, isCell ? `Клетка: ${cellName(q.key)}. Перевод: ${q.ru}` : `Правильно: ${q.en}`));
      text.append(el('p', { class: 'fb-rule', text: q.rule }));
    }
    if (canSpeak && !lesson.blitz) {
      text.append(el('p', { class: 'fb-tools' },
        holdFocus(el('button', { class: 'link', type: 'button', text: 'Послушать', onclick: () => listen(q.en) }))));
    }
    ui.feedback.className = ok ? 'feedback is-ok' : 'feedback is-bad';
    put(ui.feedback, text, isCell || lesson.hint || lesson.blitz ? null : miniMap(q.key));
  }

  function openPeek() {
    if (!session || !session.lesson.peek || session.answered) return;
    session.peeked = true;
    put(peekBody, buildTable(), el('p', { class: 'legend', text: 'Ответ на эту фразу не пойдёт в оценку.' }));
    if (typeof peekDialog.showModal === 'function') peekDialog.showModal();
    else peekDialog.setAttribute('open', '');
  }

  peekDialog.addEventListener('close', () => {
    const input = view.querySelector('.line-input');
    if (input) input.focus();
  });

  // ---------- result ----------

  function finishLesson() {
    if (!session) return;
    const { lesson, index } = session;
    let value;
    let summary;
    if (lesson.blitz) {
      const score = blitzScore();
      value = E.blitzGrade(score);
      summary = `Счёт ${score}: верных ответов ${session.correct}, ошибок ${session.wrong}.`;
      if (score > store.blitzBest) {
        store.blitzBest = score;
        summary += ' Это новый рекорд.';
      }
    } else {
      const right = session.marks.filter((mark) => mark === 'ok').length;
      value = E.grade(right, session.total);
      summary = `С первого раза и без подсказок: ${right} из ${session.total}.`;
    }
    if (value > (store.grades[lesson.id] || 0)) store.grades[lesson.id] = value;
    const day = today();
    store.streak = E.streakAfter(store.lastDay, store.streak, day);
    store.lastDay = day;
    saveStore();

    const seen = new Set();
    const mistakes = session.mistakes.filter((m) => {
      if (seen.has(m.prompt)) return false;
      seen.add(m.prompt);
      return true;
    }).slice(0, MAX_SHOWN_MISTAKES);
    stopSession();
    renderResult(index, value, summary, mistakes);
  }

  function renderResult(index, value, summary, mistakes) {
    const lesson = E.LESSONS[index];
    activeScreen = 'result';
    enterInner();
    const passed = value >= PASS_GRADE;
    const hasNext = passed && index + 1 < E.LESSONS.length;
    const learned = lesson.exam && value >= 5;
    const again = el('button', { class: hasNext ? 'btn' : 'btn btn-primary', type: 'button', onclick: () => startLesson(index), text: 'Повторить урок' });
    const next = hasNext
      ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderIntro(index + 1), text: 'Следующий урок' })
      : null;
    put(view, el('section', { class: 'result' },
      el('p', { class: 'eyebrow', text: `Урок ${index + 1} · ${lesson.title}` }),
      el('div', { class: 'result-top' },
        el('div', { class: 'grade', role: 'img', 'aria-label': `Оценка ${E.gradeText(value)}` },
          svg(RING), el('span', { class: 'grade-n', text: E.gradeText(value) })),
        el('div', null,
          el('p', { class: 'verdict', text: learned ? 'Таблица выучена на зубок.' : VERDICT[value] }),
          el('p', { class: 'lead', text: summary }))),
      store.streak > 1 ? el('p', { class: 'streak', text: `Дней подряд: ${store.streak}` }) : null,
      mistakes.length > 0 ? el('h2', { class: 'section-title', text: 'Ошибки' }) : null,
      mistakes.length > 0
        ? el('ul', { class: 'mistakes' }, mistakes.map((m) =>
          el('li', null,
            el('span', { text: m.prompt }),
            el('span', null,
              el('span', { class: 'm-right', text: m.right }),
              el('span', { class: 'm-given', text: m.given })))))
        : null,
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: goHome, text: 'К таблице' }),
        again, next)));
    window.scrollTo(0, 0);
    (next || again).focus();
    if (passed) beep(SFX.grade);
  }

  // ---------- keyboard ----------

  document.addEventListener('keydown', (event) => {
    if (!session || event.repeat || peekDialog.open) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('[data-keep-enter]')) return;
    // The answer input sits in a form: Enter there is handled by the form's submit.
    if (target && target === session.ui.input) return;
    const mode = session.lesson.mode;

    if (event.key === 'Enter') {
      if (session.answered) {
        if (session.lesson.blitz) return;
        event.preventDefault();
        nextQuestion();
      } else if (!(target instanceof HTMLButtonElement) && session.check) {
        event.preventDefault();
        session.check();
      }
      return;
    }
    if (session.answered) return;
    if (mode === 'choice' && /^[1-4]$/.test(event.key)) {
      const button = view.querySelectorAll('.option')[Number(event.key) - 1];
      if (button) {
        event.preventDefault();
        button.click();
      }
    } else if (mode === 'build' && event.key === 'Backspace' && session.undo) {
      event.preventDefault();
      session.undo();
    }
  });

  // ---------- wiring ----------

  /** Offline play: the worker keeps a copy of the game. Needs http(s); a page opened from disk has none. */
  function registerOffline() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode is unavailable:', err));
    });
  }

  homeBtn.addEventListener('click', goHome);
  voiceBtn.addEventListener('click', () => {
    store.voice = !store.voice;
    if (!store.voice) hush();
    saveStore();
    syncToggles();
  });
  soundBtn.addEventListener('click', () => {
    store.sound = !store.sound;
    saveStore();
    syncToggles();
  });
  window.addEventListener('popstate', (event) => {
    inner = hasInnerState(event.state);
    if (activeScreen !== 'home') renderHome();
  });
  window.addEventListener('pagehide', stopSession);
  window.addEventListener('pageshow', (event) => {
    // A page restored from the back/forward cache has lost its lesson.
    if (event.persisted && activeScreen === 'play' && !session) renderHome();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseClock();
    else resumeClock();
  });
  if (viewport) viewport.addEventListener('resize', syncKeyboard);

  syncToggles();
  renderHome();
  registerOffline();
})();
