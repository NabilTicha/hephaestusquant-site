// 80-in-8: Optiver-style mental-math drill.
// 80 multiple-choice arithmetic questions in 8 minutes.
// Scoring: +1 correct, -2 wrong or skipped.

(() => {
  const TOTAL_QUESTIONS = 80;
  const TIME_LIMIT_MS = 8 * 60 * 1000;

  // ---- State ----
  let questions = [];
  let qIdx = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let startedAt = 0;
  let timerHandle = null;
  let testActive = false;

  // ---- Utility ----
  const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const round = (x, dp) => +x.toFixed(dp);
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Format a number for display: trim trailing zeros from decimals.
  function fmt(n) {
    if (typeof n === 'string') return n;
    if (Number.isInteger(n)) return String(n);
    return parseFloat(n.toFixed(6)).toString();
  }

  // ---- Distractor helpers ----
  function intDistractors(ans) {
    const set = new Set([ans]);
    const candidates = [
      ans + 1, ans - 1, ans + 2, ans - 2,
      ans + 10, ans - 10, ans * 2, Math.floor(ans / 2),
      ans + (ans >= 10 ? 10 : 1),
      -ans,
    ];
    const out = [];
    for (const c of shuffle(candidates)) {
      if (out.length >= 3) break;
      if (set.has(c)) continue;
      set.add(c);
      out.push(c);
    }
    while (out.length < 3) {
      const c = ans + randInt(-15, 15);
      if (!set.has(c)) { set.add(c); out.push(c); }
    }
    return out.map(fmt);
  }

  function decDistractors(ans) {
    const set = new Set([fmt(ans)]);
    const candidates = [
      ans * 10, ans / 10, ans * 100, ans / 100,
      ans + 0.1, ans - 0.1, ans + 1, ans - 1,
      -ans, ans * 2, ans / 2,
    ];
    const out = [];
    for (const c of shuffle(candidates)) {
      if (out.length >= 3) break;
      const cs = fmt(round(c, 6));
      if (set.has(cs)) continue;
      set.add(cs);
      out.push(cs);
    }
    while (out.length < 3) {
      const c = round(ans + (Math.random() - 0.5) * Math.max(1, Math.abs(ans)), 4);
      const cs = fmt(c);
      if (!set.has(cs)) { set.add(cs); out.push(cs); }
    }
    return out;
  }

  function fracDistractors(num, den) {
    const correct = `${num}/${den}`;
    const set = new Set([correct]);
    const candidates = [
      `${num + 1}/${den}`, `${Math.max(1, num - 1)}/${den}`,
      `${num}/${den + 1}`, `${num}/${Math.max(2, den - 1)}`,
      `${den}/${num}`,
      `${num + 1}/${den + 1}`,
    ];
    const out = [];
    for (const c of shuffle(candidates)) {
      if (out.length >= 3) break;
      if (set.has(c)) continue;
      set.add(c);
      out.push(c);
    }
    while (out.length < 3) {
      const c = `${num + randInt(-2, 3)}/${den + randInt(-1, 2)}`;
      if (!set.has(c) && !c.includes('-')) { set.add(c); out.push(c); }
    }
    return out;
  }

  // ---- Question generators ----
  // Each returns: { q: HTML string, a: correct-as-string, choices: [4 strings] }
  function makeQuestion(q, ans, distractors) {
    const all = shuffle([ans, ...distractors]);
    return { q, a: ans, choices: all };
  }

  function genIntAdd() {
    const a = randInt(20, 99);
    const b = randInt(20, 99);
    const ans = a + b;
    return makeQuestion(`${a} + ${b} = ?`, fmt(ans), intDistractors(ans));
  }

  function genIntSub() {
    const a = randInt(50, 199);
    const b = randInt(20, a - 5);
    const ans = a - b;
    return makeQuestion(`${a} − ${b} = ?`, fmt(ans), intDistractors(ans));
  }

  function genIntMul() {
    const variants = [
      () => [randInt(2, 9), randInt(11, 19)],
      () => [randInt(11, 19), randInt(11, 19)],
      () => [randInt(2, 9), randInt(2, 9)],
      () => [randInt(20, 25), randInt(2, 9)],
    ];
    const [a, b] = pick(variants)();
    const ans = a * b;
    return makeQuestion(`${a} × ${b} = ?`, fmt(ans), intDistractors(ans));
  }

  function genIntDiv() {
    const divisor = randInt(2, 15);
    const quotient = randInt(3, 18);
    const dividend = divisor * quotient;
    return makeQuestion(`${dividend} ÷ ${divisor} = ?`, fmt(quotient), intDistractors(quotient));
  }

  function genDecMul() {
    const variants = [
      () => {
        const a = pick([0.2, 0.4, 0.5, 0.6, 0.8, 0.25, 0.75]);
        const b = randInt(4, 20);
        return [a, b, round(a * b, 3)];
      },
      () => {
        const a = pick([0.1, 0.2, 0.3, 0.4, 0.5]);
        const b = pick([0.04, 0.05, 0.2, 0.3, 0.6]);
        return [a, b, round(a * b, 4)];
      },
      () => {
        const a = pick([0.01, 0.02, 0.04, 0.05]);
        const b = pick([0.4, 0.5, 0.8, 0.04, 0.05]);
        return [a, b, round(a * b, 5)];
      },
    ];
    const [a, b, ans] = pick(variants)();
    return makeQuestion(`${a} × ${b} = ?`, fmt(ans), decDistractors(ans));
  }

  function genDecDiv() {
    const variants = [
      () => {
        const q = pick([2, 4, 5, 8, 10, 12, 15, 20, 25]);
        const d = pick([0.1, 0.2, 0.25, 0.4, 0.5, 0.8]);
        return [round(d * q, 3), d, q];
      },
      () => {
        const q = pick([0.5, 1.5, 2.5, 0.25, 0.75]);
        const d = pick([2, 4, 5, 8, 10]);
        return [round(d * q, 3), d, q];
      },
    ];
    const [a, b, ans] = pick(variants)();
    return makeQuestion(`${a} ÷ ${b} = ?`, fmt(ans), decDistractors(ans));
  }

  function genFracTimesInt() {
    const denom = pick([2, 3, 4, 5, 6, 8, 10]);
    const num = randInt(1, denom - 1);
    const multiplier = randInt(2, 10);
    const integer = denom * multiplier;
    const ans = num * multiplier;
    return makeQuestion(`${num}/${denom} × ${integer} = ?`, fmt(ans), intDistractors(ans));
  }

  function genFracToDec() {
    const choices = [
      [1, 2, 0.5], [1, 4, 0.25], [3, 4, 0.75], [1, 5, 0.2], [2, 5, 0.4],
      [3, 5, 0.6], [4, 5, 0.8], [1, 8, 0.125], [3, 8, 0.375], [5, 8, 0.625],
      [7, 8, 0.875], [1, 10, 0.1], [3, 10, 0.3], [7, 10, 0.7], [9, 10, 0.9],
      [1, 20, 0.05], [3, 20, 0.15], [7, 20, 0.35], [13, 20, 0.65],
      [1, 25, 0.04], [3, 25, 0.12], [7, 25, 0.28],
      [1, 16, 0.0625], [3, 16, 0.1875], [5, 16, 0.3125],
    ];
    const [n, d, v] = pick(choices);
    return makeQuestion(`${n}/${d} as a decimal`, fmt(v), decDistractors(v));
  }

  function genFracAdd() {
    // Pick from common-denominator-friendly pairs.
    const sets = [
      [[1,4],[1,4],[1,2]], [[1,4],[1,2],[3,4]], [[1,3],[1,6],[1,2]],
      [[1,4],[1,3],[7,12]], [[2,3],[1,6],[5,6]], [[1,5],[3,10],[1,2]],
      [[1,8],[1,4],[3,8]], [[3,4],[1,8],[7,8]], [[1,2],[1,5],[7,10]],
      [[1,2],[1,3],[5,6]], [[2,5],[1,10],[1,2]],
    ];
    const [[an, ad], [bn, bd], [rn, rd]] = pick(sets);
    const q = `${an}/${ad} + ${bn}/${bd} = ?`;
    const ans = `${rn}/${rd}`;
    return makeQuestion(q, ans, fracDistractors(rn, rd));
  }

  function genAlgebraMissing() {
    // ? × N = M  or  N × ? = M
    const x = randInt(2, 12);
    const a = randInt(3, 12);
    const product = x * a;
    return makeQuestion(`? × ${a} = ${product}`, fmt(x), intDistractors(x));
  }

  function genAlgebraFraction() {
    // Solve  fraction × ? = fraction
    // e.g.  5/20 × ? = 1/5  ⇒  ? = 4/5
    const sets = [
      ['5/20', '1/5', '4/5'],
      ['1/4', '1/2', '2'],
      ['2/3', '1/2', '3/4'],
      ['3/8', '3/4', '2'],
      ['1/3', '1/6', '1/2'],
      ['2/5', '1/5', '1/2'],
      ['3/4', '1/2', '2/3'],
    ];
    const [lhs, rhs, ans] = pick(sets);
    const q = `${lhs} × ? = ${rhs}`;
    let distractors;
    if (ans.includes('/')) {
      const [n, d] = ans.split('/').map(Number);
      distractors = fracDistractors(n, d);
    } else {
      distractors = intDistractors(parseInt(ans, 10));
    }
    return makeQuestion(q, ans, distractors);
  }

  // Weighted pool reflecting Optiver's reported emphasis on
  // fractions/decimals/conversions.
  const GENERATORS = [
    [genIntAdd, 1], [genIntSub, 1],
    [genIntMul, 2], [genIntDiv, 2],
    [genDecMul, 2], [genDecDiv, 2],
    [genFracTimesInt, 2], [genFracToDec, 2],
    [genFracAdd, 1],
    [genAlgebraMissing, 1], [genAlgebraFraction, 1],
  ];

  function generateQuestionPool(n) {
    const pool = [];
    const totalWeight = GENERATORS.reduce((s, g) => s + g[1], 0);
    for (let i = 0; i < n; i++) {
      let r = Math.random() * totalWeight;
      for (const [gen, w] of GENERATORS) {
        r -= w;
        if (r <= 0) { pool.push(gen()); break; }
      }
    }
    return pool;
  }

  // ---- Test flow ----
  function startTest() {
    questions = generateQuestionPool(TOTAL_QUESTIONS);
    qIdx = 0; correct = 0; wrong = 0; skipped = 0;
    testActive = true;
    startedAt = Date.now();

    document.getElementById('intro-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('test-section').style.display = '';

    renderQuestion();
    renderStatus();
    timerHandle = setInterval(tick, 200);
  }

  function tick() {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
    document.getElementById('timer').textContent = formatTime(remaining);
    if (remaining <= 0) endTest();
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderStatus() {
    document.getElementById('counter').textContent = `${Math.min(qIdx + 1, TOTAL_QUESTIONS)} / ${TOTAL_QUESTIONS}`;
  }

  function renderQuestion() {
    const q = questions[qIdx];
    if (!q) return;
    document.getElementById('question').textContent = q.q;
    const container = document.getElementById('choices');
    container.innerHTML = '';
    for (const choice of q.choices) {
      const btn = document.createElement('button');
      btn.className = 'eighty-choice';
      btn.textContent = choice;
      btn.addEventListener('click', () => answer(choice));
      container.appendChild(btn);
    }
  }

  function answer(choice) {
    if (!testActive) return;
    const q = questions[qIdx];
    if (choice === q.a) correct++; else wrong++;
    advance();
  }

  function skip() {
    if (!testActive) return;
    skipped++;
    advance();
  }

  function advance() {
    qIdx++;
    renderStatus();
    if (qIdx >= TOTAL_QUESTIONS) {
      endTest();
    } else {
      renderQuestion();
    }
  }

  function endTest() {
    if (!testActive) return;
    testActive = false;
    clearInterval(timerHandle);

    // Any unanswered remaining questions count as skipped.
    const remaining = TOTAL_QUESTIONS - qIdx;
    if (remaining > 0) skipped += remaining;

    const score = correct - 2 * wrong - 2 * skipped;
    const penalty = 2 * (wrong + skipped);
    document.getElementById('test-section').style.display = 'none';
    document.getElementById('results-section').style.display = '';
    document.getElementById('results-title').textContent = `Score: ${score}`;
    document.getElementById('results-formula').textContent =
      `${correct} correct − 2 × ${wrong + skipped} (wrong + skipped) = ${correct} − ${penalty} = ${score}`;
    document.getElementById('results-correct').textContent = String(correct);
    document.getElementById('results-wrong').textContent = String(wrong);
    document.getElementById('results-skipped').textContent = String(skipped);

    let verdict;
    if (score >= 70) verdict = 'Competitive — at or above what Optiver looks for.';
    else if (score >= 56) verdict = 'Pass. Above the rough Optiver threshold.';
    else if (score >= 30) verdict = 'Below pass. The penalty for wrong answers is steep — consider skipping less and being more selective.';
    else verdict = 'Net loss territory. Slow down on the questions you do answer; the -2 wrong penalty bites hard.';
    document.getElementById('results-verdict').textContent = verdict;
  }

  function restart() {
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('intro-section').style.display = '';
  }

  // ---- Wire up ----
  document.getElementById('start-btn').addEventListener('click', startTest);
  document.getElementById('skip-btn').addEventListener('click', skip);
  document.getElementById('restart-btn').addEventListener('click', restart);

  // Keyboard: 1-4 for choices, S for skip
  document.addEventListener('keydown', e => {
    if (!testActive) return;
    if (e.key >= '1' && e.key <= '4') {
      const choices = document.querySelectorAll('.eighty-choice');
      const idx = parseInt(e.key, 10) - 1;
      if (choices[idx]) choices[idx].click();
    } else if (e.key === 's' || e.key === 'S') {
      skip();
    }
  });
})();
