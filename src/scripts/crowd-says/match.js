// Forgiving answer matching: typos, plurals, articles and "A / B" style answers all count.

const FILLER = new Set(["a", "an", "the", "my", "your", "their", "his", "her", "some", "to", "of", "and", "or", "go", "get"]);

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(ches|shes|xes|ses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function keyTokens(text) {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .map(stem);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - levenshtein(a, b) / longest : 1;
}

/** Every phrasing that should count for one answer: the text, its "A / B" parts, its bracketed parts, and aliases. */
function variants(answer) {
  const out = new Set();
  const add = (s) => {
    const k = keyTokens(s).join(" ");
    if (k) out.add(k);
  };
  add(answer.text);
  answer.text.split(/\s*\/\s*|\s*,\s*/).forEach(add);
  const paren = answer.text.match(/^(.*?)\((.*)\)\s*$/);
  if (paren) {
    add(paren[1]);
    paren[2].split(/,|\//).forEach(add);
  }
  (answer.aliases || []).forEach(add);
  return [...out];
}

function scorePair(guess, variant) {
  if (guess === variant) return 1;
  const g = guess.split(" ");
  const v = variant.split(" ");
  // whole-phrase typo tolerance
  const whole = similarity(guess, variant);
  // every meaningful word of the answer appears (fuzzily) in the guess, e.g. "i would check my phone" → "check phone"
  const covered = v.every((vw) => g.some((gw) => gw === vw || (vw.length >= 5 && similarity(gw, vw) >= 0.8)));
  const coverScore = covered ? 0.92 : 0;
  // one-word answers: a single strong word in the guess is enough ("snakes are scary" → "snake")
  const single = v.length === 1 && v[0].length >= 4 && g.some((gw) => similarity(gw, v[0]) >= 0.84) ? 0.88 : 0;
  return Math.max(whole, coverScore, single);
}

/**
 * Find the best-matching answer for a guess.
 * @returns {{ index: number, score: number } | null}
 */
export function matchGuess(guess, answers, threshold = 0.8) {
  const g = keyTokens(guess).join(" ");
  if (!g) return null;
  let best = null;
  answers.forEach((answer, index) => {
    for (const v of variants(answer)) {
      const score = scorePair(g, v);
      if (!best || score > best.score) best = { index, score };
    }
  });
  return best && best.score >= threshold ? best : null;
}
