/* probability.js — Optiver-style probability question bank */
(() => {
  'use strict';

  // ================================================================
  // QUESTION BANK
  // ================================================================
  const QUESTIONS = [
    // ---- Dice & Counting ----------------------------------------
    {
      id: 1, category: 'Dice & Counting',
      title: 'Six-Dice Even Sum',
      summary: 'Probability that the sum of six rolled dice is even.',
      source: 'Glassdoor',
      text: 'You roll six fair six-sided dice simultaneously. What is the probability that the sum of all six dice is even?',
      options: ['1/6 ≈ 16.7%', '1/3 ≈ 33.3%', '1/2 = 50%', '2/3 ≈ 66.7%'],
      answer: 2,
      explanation: 'Each die independently shows an odd or even number with equal probability ½ (three odd faces: 1, 3, 5; three even: 2, 4, 6). The sum is even when an even number of dice show odd values. The probability of an even number of successes in 6 independent Bernoulli(½) trials equals exactly ½ by symmetry of the binomial distribution. Answer: 1/2.',
    },
    {
      id: 2, category: 'Dice & Counting',
      title: 'Strictly Increasing Dice',
      summary: 'Three dice are rolled — probability all three show strictly increasing values.',
      source: 'Glassdoor',
      text: 'You roll three fair six-sided dice at the same time. What is the probability that the three results are strictly increasing (d₁ < d₂ < d₃)?',
      options: ['1/72 ≈ 1.4%', '5/54 ≈ 9.3%', '1/6 ≈ 16.7%', '1/8 = 12.5%'],
      answer: 1,
      explanation: 'Choose 3 distinct values from {1…6}: C(6,3) = 20 ways. Each set of 3 distinct values has exactly one strictly increasing ordering. Total outcomes = 6³ = 216. P = 20/216 = 5/54 ≈ 9.3%.',
    },
    {
      id: 3, category: 'Dice & Counting',
      title: 'Odd Product of Four Dice',
      summary: 'Four dice are rolled — probability their product is odd.',
      source: 'PracHub',
      text: 'Four fair six-sided dice are rolled. What is the probability that the product of all four results is odd?',
      options: ['1/4 = 25%', '3/16 = 18.75%', '1/8 = 12.5%', '1/16 = 6.25%'],
      answer: 3,
      explanation: 'A product is odd only when every factor is odd. P(one die shows odd) = 3/6 = 1/2. For four independent dice: P(all odd) = (1/2)⁴ = 1/16 = 6.25%.',
    },
    {
      id: 4, category: 'Dice & Counting',
      title: 'Sum of 11 or 12 on Two Dice',
      summary: 'Two fair dice are rolled — probability their sum equals 11 or 12.',
      source: 'PracHub',
      text: 'Two fair six-sided dice are rolled. What is the probability that the sum equals 11 or 12?',
      options: ['1/18 ≈ 5.6%', '1/12 ≈ 8.3%', '1/9 ≈ 11.1%', '5/36 ≈ 13.9%'],
      answer: 1,
      explanation: 'Sum = 11: outcomes (5,6) and (6,5) → 2 ways. Sum = 12: outcome (6,6) → 1 way. Total favourable = 3. Total outcomes = 36. P = 3/36 = 1/12 ≈ 8.3%.',
    },
    {
      id: 5, category: 'Dice & Counting',
      title: 'Expectation & Variance of a Die Face',
      summary: 'Rolling a die 12 times — expected count and variance for face "1".',
      source: 'PracHub',
      text: 'A fair die is rolled 12 times. Let X = number of times face "1" appears. What are E[X] and Var(X)?',
      options: [
        'E = 1, Var = 11/12',
        'E = 2, Var = 5/3',
        'E = 2, Var = 2',
        'E = 3, Var = 5/3',
      ],
      answer: 1,
      explanation: 'X ~ Binomial(n = 12, p = 1/6). E[X] = np = 12 × 1/6 = 2. Var(X) = np(1−p) = 12 × (1/6) × (5/6) = 10/6 = 5/3 ≈ 1.67.',
    },

    // ---- Coin Flipping & Sequences ------------------------------
    {
      id: 6, category: 'Coin Flipping & Sequences',
      title: 'HHH Before HTH',
      summary: 'Probability that the pattern HHH appears before HTH in an infinite coin sequence.',
      source: 'Glassdoor',
      text: 'A fair coin is flipped repeatedly. What is the probability that the pattern HHH appears before the pattern HTH?',
      options: ['1/3 ≈ 33%', '2/5 = 40%', '1/2 = 50%', '3/5 = 60%'],
      answer: 1,
      explanation: 'Track suffix states: ∅, H, HH, HT. Let p(s) = P(HHH wins | in state s). Equations: p(∅) = ½p(H) + ½p(∅); p(H) = ½·1_HHH + ½p(HT); p(HH) = ½·1 + ½p(HT); p(HT) = ½·0 + ½p(∅). Solving gives p(∅) = p(H) = 2/5.',
    },
    {
      id: 7, category: 'Coin Flipping & Sequences',
      title: 'Detecting a Biased Coin',
      summary: '100 flips yield 60 heads — is the coin biased at 95% confidence?',
      source: 'Interview Query',
      text: 'You flip a coin 100 times and observe 60 heads. Using a 95% confidence level (two-tailed test), should you conclude the coin is biased?',
      options: [
        'No — 60 heads is within normal variation for a fair coin',
        'Yes — the Z-score (2.0) exceeds the critical value of 1.96',
        'Yes — any heads count above 55 is automatically significant',
        'Cannot determine without knowing the true bias',
      ],
      answer: 1,
      explanation: 'Under H₀ (fair coin): E[X] = 50, σ = √(100 × 0.5 × 0.5) = 5. Z = (60 − 50)/5 = 2.0. The two-tailed 95% critical value is |Z| = 1.96. Since 2.0 > 1.96, reject H₀ — conclude the coin is biased.',
    },
    {
      id: 8, category: 'Coin Flipping & Sequences',
      title: "Gambler's Ruin",
      summary: 'Starting with $10, betting $1 per round toward a goal of $20 — probability of success.',
      source: 'PracHub',
      text: "In a fair-coin gambler's ruin setup, you start with $10 and want to reach $20. You bet $1 per round with absorbing barriers at $0 and $20. What is the probability of reaching $20 before going broke?",
      options: ['1/4 = 25%', '1/3 ≈ 33%', '1/2 = 50%', '2/3 ≈ 67%'],
      answer: 2,
      explanation: "For a fair game (p = q = ½), the gambler's ruin formula gives P(reach N | start at k) = k/N. Here k = 10, N = 20: P = 10/20 = 1/2.",
    },

    // ---- Card Problems ------------------------------------------
    {
      id: 9, category: 'Card Problems',
      title: 'Two Aces in a Row',
      summary: 'Drawing two consecutive aces from a shuffled 52-card deck.',
      source: 'VO Agent Interview',
      text: 'From a standard 52-card deck, two cards are drawn without replacement. What is the probability that both are aces?',
      options: ['1/663 ≈ 0.15%', '1/221 ≈ 0.45%', '1/169 ≈ 0.59%', '1/2652 ≈ 0.04%'],
      answer: 1,
      explanation: 'P(first is ace) = 4/52. P(second is ace | first was ace) = 3/51. P(both aces) = (4/52) × (3/51) = 12/2652 = 1/221 ≈ 0.45%.',
    },
    {
      id: 10, category: 'Card Problems',
      title: 'Red Card After Blind Discard',
      summary: 'Top 10 cards discarded unseen — probability the next card is red.',
      source: 'PracHub',
      text: 'From a well-shuffled 52-card deck, the top 10 cards are discarded face-down without looking at them. What is the probability the next card drawn is red?',
      options: [
        '≈ 38% — adjusted for expected red discards',
        '50% — identical to drawing from a full deck',
        '≈ 62% — because red cards are "more likely" remaining',
        'Cannot be determined without knowing the discards',
      ],
      answer: 1,
      explanation: "Since the 10 discarded cards are unseen, the remaining 42 form a uniformly random subset. By symmetry, E[red cards remaining] = 26 × 42/52 = 21, so P(next is red) = 21/42 = 1/2. The discard doesn't change the probability — it's still 50%.",
    },
    {
      id: 11, category: 'Card Problems',
      title: 'Exactly One Pair in a 5-Card Hand',
      summary: 'Classic combinatorics: probability of holding exactly one pair.',
      source: 'Glassdoor (Optiver)',
      text: 'You are dealt a random 5-card hand from a 52-card deck. What is the probability of getting exactly one pair (and no better poker hand)?',
      options: ['28.8%', '42.3%', '50.1%', '70.4%'],
      answer: 1,
      explanation: 'Favourable hands: choose pair rank C(13,1)=13 × choose pair suits C(4,2)=6 × choose 3 remaining different ranks C(12,3)=220 × choose suits for each 4³=64 = 1,098,240. Total = C(52,5) = 2,598,960. P ≈ 42.3%.',
    },

    // ---- Expected Value -----------------------------------------
    {
      id: 12, category: 'Expected Value',
      title: 'Kelly Criterion Bet Sizing',
      summary: 'Optimal fraction of bankroll to bet using the Kelly Criterion.',
      source: 'Glassdoor',
      text: 'A bet pays 2:1 (you win $2 per $1 risked) and wins with probability 0.6. Using the Kelly Criterion, what fraction of your bankroll should you bet?',
      options: ['10%', '20%', '40%', '60%'],
      answer: 2,
      explanation: 'Kelly formula: f* = p − q/b, where p = 0.6 (win), q = 0.4 (loss), b = 2 (net odds). f* = 0.6 − 0.4/2 = 0.6 − 0.2 = 0.4 = 40%. Betting above the Kelly fraction reduces long-run geometric growth.',
    },
    {
      id: 13, category: 'Expected Value',
      title: 'Expected Value of a Card Game',
      summary: 'Calculate EV and decide whether to play.',
      source: 'Linkjob',
      text: 'You pay $10 to play. If you draw a heart from a shuffled 52-card deck you win a $40 profit (net +$40); otherwise you lose your $10. What is the expected value of playing?',
      options: ['−$2.50', '$0.00', '+$2.50', '+$5.00'],
      answer: 2,
      explanation: 'P(heart) = 13/52 = 1/4. EV = (+40) × 1/4 + (−10) × 3/4 = $10 − $7.50 = +$2.50. Positive EV — you should play.',
    },
    {
      id: 14, category: 'Expected Value',
      title: 'Ruin Risk vs Positive EV',
      summary: 'A positive-EV strategy with a 10% ruin risk per trade — how likely is survival over 10 trades?',
      source: 'EverythingQuant',
      text: 'A trading strategy has positive expected value, but each trade independently carries a 10% chance of wiping out your entire account. If you make 10 trades, approximately what is the probability your account survives all of them?',
      options: ['≈ 10%', '≈ 35%', '≈ 65%', '≈ 90%'],
      answer: 1,
      explanation: 'P(survive one trade) = 0.9. P(survive 10 trades) = 0.9¹⁰ ≈ 0.349 ≈ 35%. Despite positive arithmetic EV, a 10% ruin rate is catastrophic: 65% of the time you go bankrupt. This is why geometric growth (Kelly) matters more than arithmetic EV in repeated betting.',
    },

    // ---- Conditional Probability & Bayes -----------------------
    {
      id: 15, category: 'Conditional Probability & Bayes',
      title: "Bayes' Theorem — Rare Disease",
      summary: 'A rare disease, a 99% accurate test, a positive result — what is the real probability you are ill?',
      source: 'EverythingQuant',
      text: 'A disease affects 1 in 1,000 people. A test is 99% accurate (99% sensitivity, 99% specificity). You test positive. What is the probability you actually have the disease?',
      options: ['< 1%', '≈ 9%', '≈ 50%', '≈ 99%'],
      answer: 1,
      explanation: "P(D) = 0.001, P(+|D) = 0.99, P(+|¬D) = 0.01. Bayes: P(D|+) = (0.99 × 0.001) / (0.99 × 0.001 + 0.01 × 0.999) = 0.00099 / 0.01098 ≈ 9%. The low base rate dominates — 91% of positive tests are false positives.",
    },
    {
      id: 16, category: 'Conditional Probability & Bayes',
      title: 'Two-Envelope Paradox',
      summary: 'You see $100 in your randomly chosen envelope — should you switch?',
      source: 'Glassdoor',
      text: 'You are given two envelopes. One contains twice as much money as the other. You randomly pick one and open it: $100 inside. Should you switch to the other envelope?',
      options: [
        'Yes — switching gives $125 in expectation vs. $100',
        'No — switching provides no consistent expected benefit',
        'Yes if $100 feels "low", No if it feels "high"',
        'Only switch if you can estimate the distribution of amounts',
      ],
      answer: 1,
      explanation: "The apparent EV argument (switch gives $50 or $200 with equal probability → $125 > $100) is a paradox: the exact same logic applies to the other envelope. Without knowing the prior distribution of amounts, you cannot consistently benefit from switching. Correct answer: no benefit.",
    },

    // ---- Large-Number & Combinatorics ---------------------------
    {
      id: 17, category: 'Large-Number & Combinatorics',
      title: 'Digit 7 in 1 to 1,000,000',
      summary: 'What fraction of integers from 1 to 1,000,000 contain at least one digit "7"?',
      source: 'Glassdoor (Graduate QR)',
      text: 'What is the probability that a uniformly chosen integer from 1 to 1,000,000 contains at least one digit "7"?',
      options: ['≈ 10%', '≈ 34.9%', '≈ 46.9%', '≈ 53.1%'],
      answer: 2,
      explanation: "Treat each number as a 6-digit string (000001–999999). P(a 6-digit string contains no '7') = (9/10)⁶ ≈ 0.531. P(at least one '7') = 1 − (9/10)⁶ ≈ 46.9%. The key insight: 9 choices per digit (anything but 7), raised to the power of the number of digits.",
    },
    {
      id: 18, category: 'Large-Number & Combinatorics',
      title: 'Sock Drawer Guarantee',
      summary: 'How many socks must you draw to guarantee a matching pair?',
      source: 'Princeton Career Development',
      text: 'A drawer contains 18 blue socks and 14 black socks. You draw socks in the dark. What is the minimum number you must draw to guarantee a matching pair?',
      options: ['2', '3', '14', '19'],
      answer: 1,
      explanation: 'There are only 2 colours. Worst case: the first two draws produce one blue and one black (no match). The third draw must match one of the first two. Answer: 3. The large counts of each colour are irrelevant — only the number of distinct colours matters.',
    },

    // ---- Distributions & Stochastic Processes ------------------
    {
      id: 19, category: 'Distributions & Stochastic Processes',
      title: 'Random Walk: Expected Steps to ±10',
      summary: 'Symmetric random walk starting at 0 — expected steps to hit +10 or −10.',
      source: 'Glassdoor',
      text: 'A symmetric random walk starts at 0. At each step it goes +1 or −1 with equal probability. Absorbing barriers are placed at +10 and −10. What is the expected number of steps before absorption?',
      options: ['10', '20', '50', '100'],
      answer: 3,
      explanation: 'Apply the Optional Stopping Theorem to the martingale Mₙ = Xₙ² − n. At stopping time T: E[X_T²] − E[T] = X₀² = 0, so E[T] = E[X_T²]. Since |X_T| = 10 always, E[T] = 10² = 100.',
    },
    {
      id: 20, category: 'Distributions & Stochastic Processes',
      title: 'Tennis Match: 2 or 3 Sets?',
      summary: 'Best-of-3 match with equally skilled players — which length finish is more likely?',
      source: 'Glassdoor',
      text: 'In a best-of-3 tennis match, each player wins any given set with probability ½. Would you bet on the match finishing in 2 sets or 3 sets?',
      options: [
        '2 sets more likely (P = 2/3)',
        '3 sets more likely (P = 2/3)',
        'Equally likely (P = ½ each)',
        '3 sets more likely (P = 3/4)',
      ],
      answer: 2,
      explanation: 'P(2-set finish) = P(A wins 2-0) + P(B wins 2-0) = ¼ + ¼ = ½. P(3-set finish) = 1 − ½ = ½. Both outcomes are equally likely. The bet only matters based on the offered payout odds.',
    },
  ];

  const CATEGORIES = [
    'Dice & Counting',
    'Coin Flipping & Sequences',
    'Card Problems',
    'Expected Value',
    'Conditional Probability & Bayes',
    'Large-Number & Combinatorics',
    'Distributions & Stochastic Processes',
  ];

  // ================================================================
  // STATE
  // ================================================================
  let testMode    = false;
  let testQueue   = [];
  let testIdx     = 0;
  let testAnswers = []; // { qId, correct }

  // ================================================================
  // DOM HELPERS
  // ================================================================
  const $ = id => document.getElementById(id);

  function showSection(id) {
    ['prob-list', 'prob-question', 'prob-results'].forEach(sid => {
      const el = $(sid);
      if (el) el.style.display = sid === id ? '' : 'none';
    });
    window.scrollTo(0, 0);
  }

  // ================================================================
  // RENDER QUESTION LIST
  // ================================================================
  function renderList() {
    const container = $('prob-category-list');
    if (!container) return;

    container.innerHTML = CATEGORIES.map(cat => {
      const qs = QUESTIONS.filter(q => q.category === cat);
      return `
        <div class="prob-cat-block">
          <div class="section-header" style="margin-bottom:var(--space-sm)">
            <span class="label">${cat}</span>
          </div>
          <ul class="prob-q-list">
            ${qs.map(q => `
              <li class="prob-q-item">
                <div class="prob-q-left">
                  <span class="prob-q-num">${String(q.id).padStart(2, '0')}</span>
                  <div>
                    <div class="prob-q-title">${q.title}</div>
                    <div class="prob-q-summary">${q.summary}</div>
                  </div>
                </div>
                <div class="prob-q-right">
                  <span class="prob-q-source">${q.source}</span>
                  <button class="btn btn-sm" data-practice="${q.id}">Practice</button>
                </div>
              </li>`).join('')}
          </ul>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-practice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = QUESTIONS.find(q => q.id === +btn.dataset.practice);
        if (q) startPractice(q);
      });
    });
  }

  // ================================================================
  // PRACTICE MODE (single question)
  // ================================================================
  function startPractice(q) {
    testMode = false;
    showSection('prob-question');
    $('pq-meta').textContent = `${q.category}  ·  Practice`;
    $('pq-back-btn').style.display = '';
    renderQuestion(q);
  }

  // ================================================================
  // FULL TEST MODE
  // ================================================================
  function startTest() {
    testMode    = true;
    testQueue   = [...QUESTIONS];
    testIdx     = 0;
    testAnswers = [];
    showSection('prob-question');
    advanceTest();
  }

  function advanceTest() {
    const q = testQueue[testIdx];
    $('pq-meta').textContent = `Question ${testIdx + 1} / ${testQueue.length}`;
    $('pq-back-btn').style.display = 'none';
    renderQuestion(q);
  }

  // ================================================================
  // RENDER A SINGLE QUESTION
  // ================================================================
  function renderQuestion(q) {
    $('pq-category').textContent      = q.category;
    $('pq-text').textContent          = q.text;
    $('pq-explanation').style.display = 'none';
    $('pq-explanation').innerHTML     = '';
    $('pq-next').style.display        = 'none';

    const choicesEl = $('pq-choices');
    choicesEl.innerHTML = q.options.map((opt, i) =>
      `<button class="btn prob-choice-btn" data-idx="${i}">${opt}</button>`
    ).join('');

    let answered = false;

    choicesEl.querySelectorAll('.prob-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        const chosen  = +btn.dataset.idx;
        const correct = chosen === q.answer;

        if (testMode) testAnswers.push({ qId: q.id, correct });

        choicesEl.querySelectorAll('.prob-choice-btn').forEach((b, i) => {
          b.disabled = true;
          if (i === q.answer)                     b.classList.add('prob-choice--correct');
          else if (i === chosen && !correct)      b.classList.add('prob-choice--wrong');
        });

        const expEl = $('pq-explanation');
        expEl.innerHTML   = `<strong>${correct ? '✓ Correct.' : '✗ Wrong.'}</strong> ${q.explanation}`;
        expEl.className   = `prob-explanation prob-explanation--${correct ? 'correct' : 'wrong'}`;
        expEl.style.display = '';

        const nextBtn = $('pq-next');
        nextBtn.style.display = '';

        if (!testMode) {
          nextBtn.textContent = 'Back to list';
          nextBtn.onclick = () => showSection('prob-list');
        } else if (testIdx < testQueue.length - 1) {
          nextBtn.textContent = 'Next →';
          nextBtn.onclick = () => { testIdx++; advanceTest(); };
        } else {
          nextBtn.textContent = 'See Results';
          nextBtn.onclick = showResults;
        }
      });
    });
  }

  // ================================================================
  // RESULTS
  // ================================================================
  function showResults() {
    showSection('prob-results');
    const total   = testAnswers.length;
    const correct = testAnswers.filter(a => a.correct).length;
    const pct     = Math.round(correct / total * 100);

    $('pr-score-text').textContent = `${correct} / ${total}`;
    $('pr-verdict').textContent    = pct >= 80 ? 'Strong performance.' : pct >= 60 ? 'Solid — a few gaps to review.' : 'Keep practising — review the explanations below.';

    // Category breakdown
    $('pr-categories').innerHTML = CATEGORIES.map(cat => {
      const catQs  = QUESTIONS.filter(q => q.category === cat);
      const ans    = testAnswers.filter(a => catQs.some(q => q.id === a.qId));
      if (!ans.length) return '';
      const right  = ans.filter(a => a.correct).length;
      const catPct = Math.round(right / ans.length * 100);
      return `
        <div class="prob-result-row">
          <span class="prob-result-cat">${cat}</span>
          <div class="prob-result-bar-wrap">
            <div class="prob-result-bar" style="width:${catPct}%"></div>
          </div>
          <span class="prob-result-score">${right} / ${ans.length}</span>
        </div>`;
    }).join('');

    // Wrong answers
    const wrong = testAnswers.filter(a => !a.correct);
    const wrongEl = $('pr-wrong');
    $('pr-wrong-heading').textContent = wrong.length ? 'Wrong answers' : 'Wrong answers';

    if (!wrong.length) {
      wrongEl.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem">Perfect score — no wrong answers.</p>';
    } else {
      wrongEl.innerHTML = wrong.map(a => {
        const q = QUESTIONS.find(q => q.id === a.qId);
        return `
          <div class="prob-wrong-item">
            <div class="prob-wrong-header">
              <span class="prob-wrong-num">${String(q.id).padStart(2,'0')}</span>
              <span class="prob-wrong-title">${q.title}</span>
            </div>
            <div class="prob-wrong-answer">Correct: ${q.options[q.answer]}</div>
            <div class="prob-wrong-exp">${q.explanation}</div>
          </div>`;
      }).join('');
    }

    $('pr-restart').onclick   = startTest;
    $('pr-back-list').onclick = () => showSection('prob-list');
  }

  // ================================================================
  // INIT
  // ================================================================
  document.addEventListener('DOMContentLoaded', () => {
    renderList();
    showSection('prob-list');

    const startBtn = $('prob-start-all');
    if (startBtn) startBtn.onclick = startTest;

    const backBtn = $('pq-back-btn');
    if (backBtn) backBtn.onclick = () => showSection('prob-list');
  });
})();
