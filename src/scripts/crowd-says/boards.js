// Where survey boards come from: the AI endpoint first, the offline bank as a fallback.
import { QUESTION_BANK } from "./question-bank.js";
import { shuffle } from "../lib/random.js";

const ENDPOINT = "/api/crowd-says";
const TIMEOUT_MS = 25000;

let bankQueue = [];
const askedQuestions = new Set();

/** Coerce anything into a well-formed board, or null if it can't be played. */
export function sanitizeBoard(raw, source) {
  if (!raw || typeof raw.question !== "string" || !Array.isArray(raw.answers)) return null;
  const answers = raw.answers
    .filter((a) => a && typeof a.text === "string" && a.text.trim())
    .map((a) => ({
      text: a.text.trim().slice(0, 48),
      points: Math.max(1, Math.round(Number(a.points) || 1)),
      aliases: Array.isArray(a.aliases) ? a.aliases.filter((s) => typeof s === "string").slice(0, 8) : [],
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 8);
  if (answers.length < 4) return null;
  return { question: raw.question.trim().slice(0, 140), category: raw.category || "", answers, source };
}

function fromBank(topic) {
  const wanted = (topic || "").toLowerCase();
  if (!bankQueue.length) bankQueue = shuffle(QUESTION_BANK.slice());
  // prefer a matching category when a topic was picked from the chips
  let idx = bankQueue.findIndex((b) => !askedQuestions.has(b.question) && wanted && b.category.toLowerCase() === wanted);
  if (idx < 0) idx = bankQueue.findIndex((b) => !askedQuestions.has(b.question));
  if (idx < 0) {
    askedQuestions.clear();
    bankQueue = shuffle(QUESTION_BANK.slice());
    idx = 0;
  }
  const [board] = bankQueue.splice(idx, 1);
  return sanitizeBoard(board, "bank");
}

/**
 * Get the next board. Never throws — resolves with { board, notice, reason };
 * reason is "" for an AI board, otherwise why the offline bank was used (offline | blocked | malformed).
 */
export async function nextBoard({ topic = "", useAI = true } = {}) {
  let notice = "";
  let reason = "";
  if (useAI) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, exclude: [...askedQuestions].slice(-12) }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const board = sanitizeBoard(data, "ai");
        if (board) {
          askedQuestions.add(board.question);
          return { board, notice, reason };
        }
        reason = "malformed";
        notice = "The AI board came back malformed, so here's one from the bank.";
      } else if (data.code === "blocked_topic") {
        reason = "blocked";
        notice = data.error || "That topic can't be used. Here's one from the bank instead.";
      } else {
        reason = "offline";
        notice = "AI boards are offline right now, so these come from the built-in bank.";
      }
    } catch {
      reason = "offline";
      notice = "AI boards are offline right now, so these come from the built-in bank.";
    } finally {
      clearTimeout(timer);
    }
  }
  const board = fromBank(topic);
  askedQuestions.add(board.question);
  return { board, notice, reason };
}
