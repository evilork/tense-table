'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

/** Deterministic PRNG so failures are reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pron = (en) => E.PRONOUNS.find((p) => p.en === en);
const verb = (base) => E.VERBS.find((v) => v.base === base);

function everyQuestion() {
  const out = [];
  for (const p of E.PRONOUNS) {
    for (const v of E.VERBS) {
      for (const tense of E.TENSES) {
        for (const form of E.FORMS) out.push(E.question(p, v, tense, form));
      }
    }
  }
  return out;
}

test('english() reproduces the table for "love"', () => {
  const love = verb('love');
  const expected = [
    ['I', 'future', 'question', 'Will I love?'],
    ['she', 'future', 'statement', 'She will love.'],
    ['they', 'future', 'negation', 'They will not love.'],
    ['you', 'present', 'question', 'Do you love?'],
    ['he', 'present', 'question', 'Does he love?'],
    ['we', 'present', 'statement', 'We love.'],
    ['she', 'present', 'statement', 'She loves.'],
    ['I', 'present', 'negation', "I don't love."],
    ['he', 'present', 'negation', "He doesn't love."],
    ['they', 'past', 'question', 'Did they love?'],
    ['she', 'past', 'statement', 'She loved.'],
    ['I', 'past', 'negation', 'I did not love.'],
  ];
  for (const [p, tense, form, text] of expected) {
    assert.equal(E.english(pron(p), love, tense, form), text);
  }
});

test('irregular verbs use the second form only in the past statement', () => {
  const see = verb('see');
  assert.equal(E.english(pron('he'), see, 'past', 'statement'), 'He saw.');
  assert.equal(E.english(pron('he'), see, 'past', 'question'), 'Did he see?');
  assert.equal(E.english(pron('he'), see, 'past', 'negation'), 'He did not see.');
  assert.equal(E.english(pron('she'), verb('go'), 'present', 'statement'), 'She goes.');
  assert.equal(E.english(pron('she'), verb('watch'), 'present', 'statement'), 'She watches.');
});

test('russian() builds the prompt for every tense and form', () => {
  const love = verb('love');
  assert.equal(E.russian(pron('she'), love, 'present', 'negation'), 'Она не любит.');
  assert.equal(E.russian(pron('I'), love, 'future', 'statement'), 'Я буду любить.');
  assert.equal(E.russian(pron('they'), love, 'future', 'negation'), 'Они не будут любить.');
  assert.equal(E.russian(pron('she'), love, 'past', 'question'), 'Она любила?');
  assert.equal(E.russian(pron('we'), love, 'past', 'statement'), 'Мы любили.');
  assert.equal(E.russian(pron('he'), verb('go'), 'past', 'negation'), 'Он не шёл.');
  assert.equal(E.russian(pron('you'), verb('eat'), 'present', 'question'), 'Ты ешь?');
});

test('every verb has complete Russian forms', () => {
  for (const v of E.VERBS) {
    assert.equal(v.ru.pres.length, 5, v.base);
    for (const form of v.ru.pres) assert.ok(form.length > 0, v.base);
    for (const key of ['m', 'f', 'pl']) assert.ok(v.ru.past[key], `${v.base} past ${key}`);
    assert.notEqual(v.base, v.s, v.base);
    assert.notEqual(v.base, v.past, v.base);
  }
});

test('normalize() ignores case, punctuation, apostrophes and extra spaces', () => {
  assert.equal(E.normalize('  She   DOESN’T love?! '), 'she doesnt love');
  assert.equal(E.normalize("I'll love."), 'ill love');
  assert.equal(E.normalize(''), '');
  assert.equal(E.normalize(null), '');
  assert.equal(E.normalize(undefined), '');
  assert.equal(E.normalize('Она любит'), '');
});

test('hasCyrillic() spots a wrong keyboard layout', () => {
  assert.equal(E.hasCyrillic('ыру дщмуы'), true);
  assert.equal(E.hasCyrillic('she loves'), false);
});

test('isCorrect() accepts contractions and full forms', () => {
  const love = verb('love');
  const neg = E.question(pron('she'), love, 'present', 'negation');
  for (const ok of ["She doesn't love.", 'she doesnt love', 'She does not love', 'SHE DOESN’T LOVE']) {
    assert.equal(E.isCorrect(ok, neg), true, ok);
  }
  const fut = E.question(pron('they'), love, 'future', 'negation');
  for (const ok of ['They will not love', "they won't love", "They'll not love"]) {
    assert.equal(E.isCorrect(ok, fut), true, ok);
  }
  assert.equal(E.isCorrect("I'll love", E.question(pron('I'), love, 'future', 'statement')), true);
  assert.equal(E.isCorrect("we didn't love", E.question(pron('we'), love, 'past', 'negation')), true);
});

test('isCorrect() rejects typical mistakes and empty input', () => {
  const love = verb('love');
  const neg = E.question(pron('she'), love, 'present', 'negation');
  for (const bad of ["She don't love", "She doesn't loves", 'She not love', '', '   ', '?!', 'Она не любит']) {
    assert.equal(E.isCorrect(bad, neg), false, bad);
  }
  const past = E.question(pron('he'), verb('see'), 'past', 'question');
  assert.equal(E.isCorrect('Did he saw?', past), false);
  assert.equal(E.isCorrect('He did see', past), false);
  assert.throws(() => E.isCorrect('x', null), TypeError);
});

test('traps() never contains an accepted answer', () => {
  for (const q of everyQuestion()) {
    const list = E.traps(q.pron, q.verb, q.tense, q.form);
    assert.ok(list.length >= 3, `${q.en}: ${list.length} traps`);
    for (const trap of list) assert.equal(E.isCorrect(trap, q), false, `${q.en} / ${trap}`);
  }
});

test('options() gives four distinct choices with exactly one correct', () => {
  const rng = seeded(7);
  for (const q of everyQuestion()) {
    const list = E.options(q, rng);
    assert.equal(list.length, 4, q.en);
    assert.equal(list.filter((o) => o.correct).length, 1, q.en);
    assert.equal(new Set(list.map((o) => E.normalize(o.text))).size, 4, q.en);
    for (const o of list) assert.equal(E.isCorrect(o.text, q), o.correct, `${q.en} / ${o.text}`);
  }
});

test('tiles() always lets the player build the canonical answer', () => {
  const rng = seeded(11);
  for (const q of everyQuestion()) {
    const list = E.tiles(q, rng);
    const words = list.map((t) => t.word);
    assert.equal(new Set(words).size, words.length, q.en);
    assert.equal(new Set(list.map((t) => t.id)).size, list.length, q.en);
    const need = E.canonicalTokens(q.pron, q.verb, q.tense, q.form);
    for (const word of need) assert.ok(words.includes(word), `${q.en}: missing ${word}`);
    assert.ok(words.length > need.length, `${q.en}: no distractors`);
    assert.equal(E.isCorrect(need.join(' '), q), true);
  }
});

test('lessonPlan() covers all twelve patterns with the right verbs', () => {
  const sizes = { map: 12, choice: 12, build: 12, type: 12, regular: 12, irregular: 16, exam: 24 };
  for (const lesson of E.LESSONS) {
    if (lesson.blitz) continue;
    for (let seed = 1; seed <= 20; seed += 1) {
      const plan = E.lessonPlan(lesson, seeded(seed));
      assert.equal(plan.length, sizes[lesson.id], lesson.id);
      const seen = new Set(plan.map((q) => `${q.key}:${q.tense === 'present' ? q.pron.third : 'any'}`));
      assert.equal(seen.size, 12, `${lesson.id} seed ${seed}`);
      if (lesson.verbs !== 'all') {
        for (const q of plan) assert.equal(q.verb.group, lesson.verbs, lesson.id);
      }
    }
  }
});

test('lessonPlan() rejects the blitz and unknown lessons', () => {
  const blitz = E.LESSONS.find((l) => l.blitz);
  assert.throws(() => E.lessonPlan(blitz), RangeError);
  assert.throws(() => E.lessonPlan({ id: 'fake' }), TypeError);
  assert.throws(() => E.lessonPlan(null), TypeError);
});

test('invalid tense, form, pronoun or verb is rejected', () => {
  const love = verb('love');
  assert.throws(() => E.english(pron('I'), love, 'perfect', 'question'), RangeError);
  assert.throws(() => E.english(pron('I'), love, 'past', 'shout'), RangeError);
  assert.throws(() => E.english({ en: 'it' }, love, 'past', 'question'), TypeError);
  assert.throws(() => E.english(pron('I'), { base: 'be' }, 'past', 'question'), TypeError);
  assert.throws(() => E.cellKey('x', 'y'), RangeError);
  assert.throws(() => E.makeQuestion({ tense: 'past', form: 'question', third: null }, love), TypeError);
  assert.throws(() => E.verbPool('nope'), RangeError);
});

test('grade() follows the school scale and validates input', () => {
  assert.equal(E.grade(12, 12), 6);
  assert.equal(E.grade(11, 12), 5);
  assert.equal(E.grade(9, 12), 4);
  assert.equal(E.grade(7, 12), 3);
  assert.equal(E.grade(6, 12), 2);
  assert.equal(E.grade(0, 12), 2);
  assert.equal(E.grade(22, 24), 5);
  assert.equal(E.grade(21, 24), 4);
  for (const bad of [[13, 12], [-1, 12], [1, 0], [1.5, 12], ['1', 12]]) {
    assert.throws(() => E.grade(bad[0], bad[1]), RangeError);
  }
});

test('blitzGrade() and gradeText()', () => {
  assert.equal(E.blitzGrade(24), 6);
  assert.equal(E.blitzGrade(19), 5);
  assert.equal(E.blitzGrade(14), 4);
  assert.equal(E.blitzGrade(9), 3);
  assert.equal(E.blitzGrade(8), 2);
  assert.equal(E.blitzGrade(0), 2);
  assert.throws(() => E.blitzGrade(-1), RangeError);
  assert.throws(() => E.blitzGrade(2.5), RangeError);
  assert.equal(E.gradeText(6), '5+');
  assert.equal(E.gradeText(3), '3');
  assert.throws(() => E.gradeText(1), RangeError);
  assert.throws(() => E.gradeText(7), RangeError);
});

test('nextStrength() stays within 0..MAX_STRENGTH', () => {
  assert.equal(E.nextStrength(0, true), 1);
  assert.equal(E.nextStrength(E.MAX_STRENGTH, true), E.MAX_STRENGTH);
  assert.equal(E.nextStrength(1, false), 0);
  assert.equal(E.nextStrength(4, false), 2);
  assert.equal(E.nextStrength(undefined, true), 1);
  assert.equal(E.nextStrength(99, false), E.MAX_STRENGTH - 2);
  assert.equal(E.nextStrength('junk', false), 0);
});

test('dayKey() and previousDay() handle month, year and leap-day borders', () => {
  assert.equal(E.dayKey(new Date(2026, 9, 4, 23, 59)), '2026-10-04');
  assert.equal(E.dayKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  assert.equal(E.previousDay('2026-10-04'), '2026-10-03');
  assert.equal(E.previousDay('2026-10-01'), '2026-09-30');
  assert.equal(E.previousDay('2026-01-01'), '2025-12-31');
  assert.equal(E.previousDay('2028-03-01'), '2028-02-29');
  assert.equal(E.isDayKey('2026-10-04'), true);
  for (const bad of ['', '04.10.2026', '2026-1-4', null, 20261004]) assert.equal(E.isDayKey(bad), false, String(bad));
  assert.throws(() => E.dayKey('2026-10-04'), TypeError);
  assert.throws(() => E.dayKey(new Date('nope')), TypeError);
  assert.throws(() => E.previousDay('yesterday'), TypeError);
});

test('streakAfter() grows on consecutive days and restarts after a gap', () => {
  assert.equal(E.streakAfter('', 0, '2026-10-04'), 1);
  assert.equal(E.streakAfter('2026-10-03', 4, '2026-10-04'), 5);
  assert.equal(E.streakAfter('2026-10-04', 5, '2026-10-04'), 5);
  assert.equal(E.streakAfter('2026-10-04', 0, '2026-10-04'), 1);
  assert.equal(E.streakAfter('2026-10-01', 9, '2026-10-04'), 1);
  assert.equal(E.streakAfter('2025-12-31', 2, '2026-01-01'), 3);
  assert.equal(E.streakAfter('2026-10-03', 'junk', '2026-10-04'), 1);
  assert.equal(E.streakAfter(undefined, -3, '2026-10-04'), 1);
  assert.throws(() => E.streakAfter('2026-10-03', 1, 'today'), TypeError);
});

test('streakNow() keeps the streak until a whole day is skipped', () => {
  assert.equal(E.streakNow('2026-10-04', 3, '2026-10-04'), 3);
  assert.equal(E.streakNow('2026-10-03', 3, '2026-10-04'), 3);
  assert.equal(E.streakNow('2026-10-02', 3, '2026-10-04'), 0);
  assert.equal(E.streakNow('', 3, '2026-10-04'), 0);
  assert.equal(E.streakNow('2026-10-04', 2.5, '2026-10-04'), 0);
  assert.throws(() => E.streakNow('2026-10-04', 3, null), TypeError);
});

test('weightedPattern() favours weak cells and survives bad input', () => {
  const strong = {};
  for (const tense of E.TENSES) {
    for (const form of E.FORMS) strong[E.cellKey(tense, form)] = E.MAX_STRENGTH;
  }
  strong[E.cellKey('past', 'question')] = 0;
  const rng = seeded(3);
  let hits = 0;
  for (let i = 0; i < 1100; i += 1) {
    const p = E.weightedPattern(strong, rng);
    assert.ok(E.PATTERNS.includes(p));
    if (p.tense === 'past' && p.form === 'question') hits += 1;
  }
  // Weight 6 against eleven patterns of weight 1: expected share is 6/17.
  assert.ok(hits > 300 && hits < 480, `hits=${hits}`);
  assert.ok(E.PATTERNS.includes(E.weightedPattern(null, () => 0.999999)));
  assert.ok(E.PATTERNS.includes(E.weightedPattern(undefined, () => 0)));
});
