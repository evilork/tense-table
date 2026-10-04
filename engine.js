/*
 * Tense table engine: sentence generation, answer checking, lesson plans.
 * Pure logic with no DOM access. Loads as a classic script in the browser
 * (window.TenseEngine) and as a CommonJS module in Node for the tests.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TenseEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TENSES = Object.freeze(['future', 'present', 'past']);
  const FORMS = Object.freeze(['question', 'statement', 'negation']);
  const TENSE_LABEL = Object.freeze({ future: 'Будущее', present: 'Настоящее', past: 'Прошедшее' });
  const FORM_LABEL = Object.freeze({ question: 'Вопрос', statement: 'Утверждение', negation: 'Отрицание' });
  const MAX_STRENGTH = 5;

  // `pres` indexes the Russian present-tense form, `past` picks the gendered past form.
  const PRONOUNS = Object.freeze([
    Object.freeze({ en: 'I', ru: 'я', third: false, pres: 0, will: 'буду', past: 'm' }),
    Object.freeze({ en: 'you', ru: 'ты', third: false, pres: 1, will: 'будешь', past: 'm' }),
    Object.freeze({ en: 'we', ru: 'мы', third: false, pres: 2, will: 'будем', past: 'pl' }),
    Object.freeze({ en: 'they', ru: 'они', third: false, pres: 3, will: 'будут', past: 'pl' }),
    Object.freeze({ en: 'he', ru: 'он', third: true, pres: 4, will: 'будет', past: 'm' }),
    Object.freeze({ en: 'she', ru: 'она', third: true, pres: 4, will: 'будет', past: 'f' }),
  ]);

  function verb(base, s, past, group, inf, pres, pastRu) {
    return Object.freeze({
      base,
      s,
      past,
      group,
      ru: Object.freeze({
        inf,
        pres: Object.freeze(pres),
        past: Object.freeze({ m: pastRu[0], f: pastRu[1], pl: pastRu[2] }),
      }),
    });
  }

  // Russian present forms go in the order: я, ты, мы, они, он/она.
  const VERBS = Object.freeze([
    verb('love', 'loves', 'loved', 'love', 'любить', ['люблю', 'любишь', 'любим', 'любят', 'любит'], ['любил', 'любила', 'любили']),

    verb('work', 'works', 'worked', 'regular', 'работать', ['работаю', 'работаешь', 'работаем', 'работают', 'работает'], ['работал', 'работала', 'работали']),
    verb('live', 'lives', 'lived', 'regular', 'жить', ['живу', 'живёшь', 'живём', 'живут', 'живёт'], ['жил', 'жила', 'жили']),
    verb('open', 'opens', 'opened', 'regular', 'открывать', ['открываю', 'открываешь', 'открываем', 'открывают', 'открывает'], ['открывал', 'открывала', 'открывали']),
    verb('close', 'closes', 'closed', 'regular', 'закрывать', ['закрываю', 'закрываешь', 'закрываем', 'закрывают', 'закрывает'], ['закрывал', 'закрывала', 'закрывали']),
    verb('help', 'helps', 'helped', 'regular', 'помогать', ['помогаю', 'помогаешь', 'помогаем', 'помогают', 'помогает'], ['помогал', 'помогала', 'помогали']),
    verb('play', 'plays', 'played', 'regular', 'играть', ['играю', 'играешь', 'играем', 'играют', 'играет'], ['играл', 'играла', 'играли']),
    verb('ask', 'asks', 'asked', 'regular', 'спрашивать', ['спрашиваю', 'спрашиваешь', 'спрашиваем', 'спрашивают', 'спрашивает'], ['спрашивал', 'спрашивала', 'спрашивали']),
    verb('answer', 'answers', 'answered', 'regular', 'отвечать', ['отвечаю', 'отвечаешь', 'отвечаем', 'отвечают', 'отвечает'], ['отвечал', 'отвечала', 'отвечали']),
    verb('dance', 'dances', 'danced', 'regular', 'танцевать', ['танцую', 'танцуешь', 'танцуем', 'танцуют', 'танцует'], ['танцевал', 'танцевала', 'танцевали']),
    verb('watch', 'watches', 'watched', 'regular', 'смотреть', ['смотрю', 'смотришь', 'смотрим', 'смотрят', 'смотрит'], ['смотрел', 'смотрела', 'смотрели']),

    verb('see', 'sees', 'saw', 'irregular', 'видеть', ['вижу', 'видишь', 'видим', 'видят', 'видит'], ['видел', 'видела', 'видели']),
    verb('go', 'goes', 'went', 'irregular', 'идти', ['иду', 'идёшь', 'идём', 'идут', 'идёт'], ['шёл', 'шла', 'шли']),
    verb('come', 'comes', 'came', 'irregular', 'приходить', ['прихожу', 'приходишь', 'приходим', 'приходят', 'приходит'], ['приходил', 'приходила', 'приходили']),
    verb('know', 'knows', 'knew', 'irregular', 'знать', ['знаю', 'знаешь', 'знаем', 'знают', 'знает'], ['знал', 'знала', 'знали']),
    verb('think', 'thinks', 'thought', 'irregular', 'думать', ['думаю', 'думаешь', 'думаем', 'думают', 'думает'], ['думал', 'думала', 'думали']),
    verb('take', 'takes', 'took', 'irregular', 'брать', ['беру', 'берёшь', 'берём', 'берут', 'берёт'], ['брал', 'брала', 'брали']),
    verb('give', 'gives', 'gave', 'irregular', 'давать', ['даю', 'даёшь', 'даём', 'дают', 'даёт'], ['давал', 'давала', 'давали']),
    verb('speak', 'speaks', 'spoke', 'irregular', 'говорить', ['говорю', 'говоришь', 'говорим', 'говорят', 'говорит'], ['говорил', 'говорила', 'говорили']),
    verb('eat', 'eats', 'ate', 'irregular', 'есть', ['ем', 'ешь', 'едим', 'едят', 'ест'], ['ел', 'ела', 'ели']),
    verb('drink', 'drinks', 'drank', 'irregular', 'пить', ['пью', 'пьёшь', 'пьём', 'пьют', 'пьёт'], ['пил', 'пила', 'пили']),
    verb('sleep', 'sleeps', 'slept', 'irregular', 'спать', ['сплю', 'спишь', 'спим', 'спят', 'спит'], ['спал', 'спала', 'спали']),
    verb('write', 'writes', 'wrote', 'irregular', 'писать', ['пишу', 'пишешь', 'пишем', 'пишут', 'пишет'], ['писал', 'писала', 'писали']),
    verb('buy', 'buys', 'bought', 'irregular', 'покупать', ['покупаю', 'покупаешь', 'покупаем', 'покупают', 'покупает'], ['покупал', 'покупала', 'покупали']),
    verb('sing', 'sings', 'sang', 'irregular', 'петь', ['пою', 'поёшь', 'поём', 'поют', 'поёт'], ['пел', 'пела', 'пели']),
  ]);

  // Twelve drill patterns: the present tense splits into he/she and everyone else.
  const PATTERNS = Object.freeze(
    TENSES.flatMap((tense) =>
      FORMS.flatMap((form) =>
        tense === 'present'
          ? [Object.freeze({ tense, form, third: false }), Object.freeze({ tense, form, third: true })]
          : [Object.freeze({ tense, form, third: null })]
      )
    )
  );

  const LESSONS = Object.freeze([
    Object.freeze({
      id: 'map', mode: 'cell', verbs: 'love', peek: true,
      title: 'Где это в таблице?',
      brief: 'Английская фраза — найди её клетку.',
      how: 'На экране английская фраза. Нажми клетку, где она стоит: по строке — время, по столбцу — тип фразы.',
    }),
    Object.freeze({
      id: 'choice', mode: 'choice', verbs: 'love', peek: true, hint: true,
      title: 'Выбери перевод',
      brief: 'Четыре варианта, верный один.',
      how: 'Русская фраза и четыре английских варианта. Нужная клетка подсвечена на маленькой карте. Клавиши 1–4 работают.',
    }),
    Object.freeze({
      id: 'build', mode: 'build', verbs: 'love', peek: true,
      title: 'Собери фразу',
      brief: 'Составь перевод из слов. Лишние слова — ловушки.',
      how: 'Нажимай слова по порядку, чтобы получился перевод. Среди слов есть лишние — это ловушки.',
    }),
    Object.freeze({
      id: 'type', mode: 'type', verbs: 'love', peek: true,
      title: 'Напиши сам',
      brief: 'Перевод с клавиатуры, без вариантов.',
      how: 'Набери перевод с клавиатуры и нажми Enter. Сокращения принимаются: don’t и do not, won’t и will not.',
    }),
    Object.freeze({
      id: 'regular', mode: 'build', verbs: 'regular', peek: true,
      title: 'Новые глаголы',
      brief: 'Те же девять клеток, десять новых глаголов.',
      how: 'Таблица та же, глаголы новые. Для he и she — окончание -s, в прошедшем — окончание -ed.',
    }),
    Object.freeze({
      id: 'irregular', mode: 'type', verbs: 'irregular', peek: true, extraPast: true,
      title: 'Неправильные глаголы',
      brief: 'В прошедшем у них своя форма: see → saw.',
      how: 'У неправильных глаголов в прошедшем своя форма, но только в утверждении. После did глагол возвращается в первую форму.',
    }),
    Object.freeze({
      id: 'blitz', mode: 'choice', verbs: 'all', blitz: true, seconds: 90,
      title: 'Блиц',
      brief: '90 секунд. Сколько фраз получится?',
      how: '90 секунд, четыре варианта, клавиши 1–4. Верный ответ даёт очко, ошибка отнимает.',
    }),
    Object.freeze({
      id: 'exam', mode: 'type', verbs: 'all', rounds: 2, exam: true,
      title: 'Контрольная',
      brief: '24 фразы, все глаголы, без подсказок.',
      how: '24 фразы со всеми глаголами. Подсказок нет, таблицу открыть нельзя. Оценка 5 — таблица выучена на зубок.',
    }),
  ]);

  const AUX_TILES = Object.freeze(['do', 'does', 'did', 'will', 'not', "don't", "doesn't"]);
  const BLITZ_SCALE = Object.freeze([[24, 6], [19, 5], [14, 4], [9, 3]]);

  function cap(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function cellKey(tense, form) {
    assertCell(tense, form);
    return `${tense}:${form}`;
  }

  function assertCell(tense, form) {
    if (!TENSES.includes(tense)) throw new RangeError(`Unknown tense: ${String(tense)}`);
    if (!FORMS.includes(form)) throw new RangeError(`Unknown form: ${String(form)}`);
  }

  function assertWords(pron, verbItem) {
    if (!PRONOUNS.includes(pron)) throw new TypeError('Unknown pronoun');
    if (!VERBS.includes(verbItem)) throw new TypeError('Unknown verb');
  }

  /** Lowercases, drops apostrophes and punctuation, collapses spaces. */
  function normalize(text) {
    return String(text === null || text === undefined ? '' : text)
      .toLowerCase()
      .replace(/[‘’ʼ`']/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasCyrillic(text) {
    return /[Ѐ-ӿ]/.test(String(text));
  }

  /** Words of the sentence exactly as the table gives them. */
  function canonicalTokens(pron, verbItem, tense, form) {
    assertCell(tense, form);
    assertWords(pron, verbItem);
    const p = pron.en;
    const v = verbItem.base;
    if (tense === 'future') {
      if (form === 'question') return ['will', p, v];
      if (form === 'statement') return [p, 'will', v];
      return [p, 'will', 'not', v];
    }
    if (tense === 'present') {
      if (form === 'question') return [pron.third ? 'does' : 'do', p, v];
      if (form === 'statement') return [p, pron.third ? verbItem.s : v];
      return [p, pron.third ? "doesn't" : "don't", v];
    }
    if (form === 'question') return ['did', p, v];
    if (form === 'statement') return [p, verbItem.past];
    return [p, 'did', 'not', v];
  }

  function sentence(tokens, form) {
    return cap(tokens.join(' ')) + (form === 'question' ? '?' : '.');
  }

  function english(pron, verbItem, tense, form) {
    return sentence(canonicalTokens(pron, verbItem, tense, form), form);
  }

  /** Every spelling that counts as correct, including contractions. */
  function variants(pron, verbItem, tense, form) {
    const p = pron.en;
    const v = verbItem.base;
    const list = [canonicalTokens(pron, verbItem, tense, form).join(' ')];
    if (tense === 'future' && form === 'statement') list.push(`${p}'ll ${v}`);
    if (tense === 'future' && form === 'negation') list.push(`${p} won't ${v}`, `${p}'ll not ${v}`);
    if (tense === 'present' && form === 'negation') list.push(`${p} ${pron.third ? 'does' : 'do'} not ${v}`);
    if (tense === 'past' && form === 'negation') list.push(`${p} didn't ${v}`);
    return list;
  }

  function russian(pron, verbItem, tense, form) {
    assertCell(tense, form);
    assertWords(pron, verbItem);
    let predicate;
    if (tense === 'present') predicate = verbItem.ru.pres[pron.pres];
    else if (tense === 'past') predicate = verbItem.ru.past[pron.past];
    else predicate = `${pron.will} ${verbItem.ru.inf}`;
    const negation = form === 'negation' ? 'не ' : '';
    return cap(`${pron.ru} ${negation}${predicate}`) + (form === 'question' ? '?' : '.');
  }

  function rule(pron, verbItem, tense, form) {
    assertCell(tense, form);
    assertWords(pron, verbItem);
    if (tense === 'future') {
      if (form === 'question') return 'Будущее, вопрос: Will + кто + глагол.';
      if (form === 'statement') return 'Будущее: кто + will + глагол.';
      return 'Будущее, отрицание: кто + will not + глагол.';
    }
    if (tense === 'present') {
      if (form === 'question') {
        return pron.third
          ? 'Настоящее, вопрос про he/she: Does + кто + глагол без -s.'
          : 'Настоящее, вопрос: Do + кто + глагол.';
      }
      if (form === 'statement') {
        return pron.third
          ? `Настоящее, he/she: глагол с окончанием -s (${verbItem.s}).`
          : 'Настоящее: глагол без окончаний.';
      }
      return pron.third
        ? 'Настоящее, отрицание про he/she: doesn’t + глагол без -s.'
        : 'Настоящее, отрицание: don’t + глагол.';
    }
    if (form === 'question') return `Прошедшее, вопрос: Did + кто + первая форма (${verbItem.base}).`;
    if (form === 'statement') {
      return verbItem.group === 'irregular'
        ? `Прошедшее: неправильный глагол, ${verbItem.base} → ${verbItem.past}.`
        : `Прошедшее: глагол с окончанием -ed (${verbItem.past}).`;
    }
    return `Прошедшее, отрицание: did not + первая форма (${verbItem.base}).`;
  }

  function be(pron, past) {
    if (past) return pron.en === 'I' || pron.third ? 'was' : 'were';
    if (pron.en === 'I') return 'am';
    return pron.third ? 'is' : 'are';
  }

  function regularized(verbItem) {
    return verbItem.base.endsWith('e') ? `${verbItem.base}d` : `${verbItem.base}ed`;
  }

  /** Typical learner mistakes for this cell, as ready sentences. Never contains a correct answer. */
  function traps(pron, verbItem, tense, form) {
    assertCell(tense, form);
    assertWords(pron, verbItem);
    const p = pron.en;
    const v = verbItem.base;
    const s = verbItem.s;
    const d = verbItem.past;
    const doAux = pron.third ? 'does' : 'do';
    const doNeg = pron.third ? "doesn't" : "don't";
    const wrongAux = pron.third ? 'do' : 'does';
    const wrongNeg = pron.third ? "don't" : "doesn't";
    let list;
    if (tense === 'future') {
      if (form === 'question') list = [['will', p, s], ['will', p, d], [doAux, p, 'will', v], ['will', p, 'to', v]];
      else if (form === 'statement') list = [[p, 'will', s], [p, 'will', d], [p, 'wills', v], [p, 'will', 'to', v]];
      else list = [[p, 'not', 'will', v], [p, 'will', 'not', s], [p, doNeg, 'will', v], [p, 'will', 'not', d], [p, 'will', 'no', v]];
    } else if (tense === 'present') {
      if (form === 'question') list = [[wrongAux, p, v], [doAux, p, s], [be(pron, false), p, v], [doAux, p, d]];
      else if (form === 'statement') list = [[p, pron.third ? v : s], [p, be(pron, false), v], [p, doAux, s]];
      else list = [[p, wrongNeg, v], [p, doNeg, s], [p, 'not', v], [p, 'no', v], [p, doNeg, d]];
    } else if (form === 'question') {
      list = [['did', p, d], [doAux, p, d], [be(pron, true), p, v], ['did', p, s]];
    } else if (form === 'statement') {
      list = [[p, 'did', d], [p, be(pron, true), v], [p, 'will', d]];
      if (verbItem.group === 'irregular') list.push([p, regularized(verbItem)]);
    } else {
      list = [[p, 'did', 'not', d], [p, 'not', d], [p, doNeg, d], [p, 'did', 'not', s], [p, 'did', 'no', v]];
    }
    const accepted = new Set(variants(pron, verbItem, tense, form).map(normalize));
    const seen = new Set();
    const out = [];
    for (const tokens of list) {
      const text = sentence(tokens, form);
      const key = normalize(text);
      if (accepted.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  /** Correct sentences from the cells in the same row or column: right grammar, wrong meaning. */
  function neighbors(pron, verbItem, tense, form) {
    assertCell(tense, form);
    const out = [];
    for (const t of TENSES) {
      for (const f of FORMS) {
        const sameCell = t === tense && f === form;
        if (!sameCell && (t === tense || f === form)) out.push(english(pron, verbItem, t, f));
      }
    }
    return out;
  }

  function pick(list, rng) {
    if (!Array.isArray(list) || list.length === 0) throw new RangeError('Cannot pick from an empty list');
    return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  }

  /** Fisher–Yates shuffle, O(n). Returns a new array. */
  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function question(pron, verbItem, tense, form) {
    return Object.freeze({
      pron,
      verb: verbItem,
      tense,
      form,
      key: cellKey(tense, form),
      en: english(pron, verbItem, tense, form),
      ru: russian(pron, verbItem, tense, form),
      rule: rule(pron, verbItem, tense, form),
      accepted: Object.freeze(variants(pron, verbItem, tense, form).map(normalize)),
    });
  }

  function makeQuestion(pattern, verbItem, rng = Math.random) {
    if (!pattern || !PATTERNS.includes(pattern)) throw new TypeError('Unknown pattern');
    const candidates = PRONOUNS.filter((p) => pattern.third === null || p.third === pattern.third);
    return question(pick(candidates, rng), verbItem, pattern.tense, pattern.form);
  }

  function isCorrect(input, q) {
    if (!q || !Array.isArray(q.accepted)) throw new TypeError('A question is required');
    const given = normalize(input);
    return given.length > 0 && q.accepted.includes(given);
  }

  /** Four answer options: the right one, two traps and one neighbour, shuffled. */
  function options(q, rng = Math.random) {
    const taken = new Set(q.accepted);
    const wrong = [];
    const add = (text) => {
      const key = normalize(text);
      if (wrong.length >= 3 || taken.has(key)) return;
      taken.add(key);
      wrong.push(text);
    };
    const trapList = shuffle(traps(q.pron, q.verb, q.tense, q.form), rng);
    const nearList = shuffle(neighbors(q.pron, q.verb, q.tense, q.form), rng);
    trapList.slice(0, 2).forEach(add);
    nearList.slice(0, 1).forEach(add);
    trapList.slice(2).concat(nearList.slice(1)).forEach(add);
    const all = [{ text: q.en, correct: true }].concat(wrong.map((text) => ({ text, correct: false })));
    return shuffle(all, rng);
  }

  /** Word tiles for the build mode: the needed words plus distracting ones. */
  function tiles(q, rng = Math.random) {
    const need = canonicalTokens(q.pron, q.verb, q.tense, q.form);
    const forms = [q.verb.base, q.verb.s, q.verb.past].filter((w) => !need.includes(w));
    const aux = shuffle(AUX_TILES.filter((w) => !need.includes(w)), rng).slice(0, 3);
    const words = Array.from(new Set(need.concat(forms, aux)));
    return shuffle(words, rng).map((word, id) => ({ id, word }));
  }

  function verbPool(group) {
    if (group === 'all') return VERBS.slice();
    const pool = VERBS.filter((v) => v.group === group);
    if (pool.length === 0) throw new RangeError(`Unknown verb group: ${String(group)}`);
    return pool;
  }

  /** Shuffles patterns and keeps the same cell from coming twice in a row. O(n²), n ≤ 24. */
  function spread(patterns, rng) {
    const list = shuffle(patterns, rng);
    const same = (a, b) => a.tense === b.tense && a.form === b.form;
    for (let i = 1; i < list.length; i += 1) {
      if (!same(list[i], list[i - 1])) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        if (!same(list[j], list[i - 1])) {
          const tmp = list[i];
          list[i] = list[j];
          list[j] = tmp;
          break;
        }
      }
    }
    return list;
  }

  /** Ordered questions for a lesson. Every pattern appears `rounds` times. */
  function lessonPlan(lesson, rng = Math.random) {
    if (!lesson || !LESSONS.includes(lesson)) throw new TypeError('Unknown lesson');
    if (lesson.blitz) throw new RangeError('Blitz has no fixed plan');
    let patterns = [];
    for (let r = 0; r < (lesson.rounds || 1); r += 1) patterns = patterns.concat(PATTERNS);
    if (lesson.extraPast) {
      const past = PATTERNS.filter((p) => p.tense === 'past');
      patterns = patterns.concat(past, past.filter((p) => p.form === 'statement'));
    }
    const pool = verbPool(lesson.verbs);
    let bag = [];
    return spread(patterns, rng).map((pattern) => {
      if (bag.length === 0) bag = shuffle(pool, rng);
      return makeQuestion(pattern, bag.pop(), rng);
    });
  }

  function clampStrength(value) {
    return Number.isInteger(value) ? Math.max(0, Math.min(MAX_STRENGTH, value)) : 0;
  }

  /** One step up for a clean answer, two steps down for a mistake. */
  function nextStrength(current, ok) {
    return clampStrength(clampStrength(current) + (ok ? 1 : -2));
  }

  /** Picks a pattern for the blitz, favouring the cells the player knows worst. */
  function weightedPattern(strengths, rng = Math.random) {
    const weights = PATTERNS.map((p) => MAX_STRENGTH + 1 - clampStrength(strengths ? strengths[cellKey(p.tense, p.form)] : 0));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng() * total;
    for (let i = 0; i < PATTERNS.length; i += 1) {
      roll -= weights[i];
      if (roll < 0) return PATTERNS[i];
    }
    return PATTERNS[PATTERNS.length - 1];
  }

  /** School grade 2–5; 6 stands for "5+" (no mistakes at all). */
  function grade(correct, total) {
    if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) {
      throw new RangeError('grade() needs 0 <= correct <= total, total > 0');
    }
    const ratio = correct / total;
    if (ratio === 1) return 6;
    if (ratio >= 0.9) return 5;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.55) return 3;
    return 2;
  }

  function blitzGrade(score) {
    if (!Number.isInteger(score) || score < 0) throw new RangeError('blitzGrade() needs a non-negative integer');
    for (const [min, value] of BLITZ_SCALE) {
      if (score >= min) return value;
    }
    return 2;
  }

  function gradeText(value) {
    if (!Number.isInteger(value) || value < 2 || value > 6) throw new RangeError('Grade must be 2..6');
    return value === 6 ? '5+' : String(value);
  }

  const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

  function isDayKey(value) {
    return typeof value === 'string' && DAY_KEY.test(value);
  }

  /** Local calendar day as YYYY-MM-DD. */
  function dayKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('dayKey() needs a valid Date');
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function previousDay(key) {
    if (!isDayKey(key)) throw new TypeError('previousDay() needs YYYY-MM-DD');
    const [year, month, day] = key.split('-').map(Number);
    return dayKey(new Date(year, month - 1, day - 1));
  }

  function cleanStreak(streak) {
    return Number.isInteger(streak) && streak > 0 ? streak : 0;
  }

  /** Days-in-a-row count right after a lesson is finished on `today`. */
  function streakAfter(lastDay, streak, today) {
    if (!isDayKey(today)) throw new TypeError('streakAfter() needs today as YYYY-MM-DD');
    const count = cleanStreak(streak);
    if (lastDay === today) return Math.max(1, count);
    if (lastDay === previousDay(today)) return count + 1;
    return 1;
  }

  /** Days-in-a-row count to show on `today`: it lasts until a whole day is skipped. */
  function streakNow(lastDay, streak, today) {
    if (!isDayKey(today)) throw new TypeError('streakNow() needs today as YYYY-MM-DD');
    return lastDay === today || lastDay === previousDay(today) ? cleanStreak(streak) : 0;
  }

  return Object.freeze({
    TENSES, FORMS, TENSE_LABEL, FORM_LABEL, PRONOUNS, VERBS, PATTERNS, LESSONS, BLITZ_SCALE, MAX_STRENGTH,
    cap, cellKey, normalize, hasCyrillic, canonicalTokens, english, russian, variants, rule, traps, neighbors,
    question, makeQuestion, isCorrect, options, tiles, verbPool, lessonPlan, nextStrength, weightedPattern,
    grade, blitzGrade, gradeText, isDayKey, dayKey, previousDay, streakAfter, streakNow,
  });
});
