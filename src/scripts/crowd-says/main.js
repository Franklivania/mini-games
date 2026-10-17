// Crowd Says — a two-team survey game. Guess the crowd's top answers; three strikes hands the other team a steal.
import { nextBoard } from "./boards.js";
import { matchGuess } from "./match.js";
import { sound } from "../lib/sound.js";
import { confetti } from "../lib/confetti.js";
import { loadJSON, saveJSON } from "../lib/storage.js";

const SETTINGS_KEY = "crowd-says.settings.v1";
const MAX_STRIKES = 3;

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  setup: $("setup"),
  setupForm: $("setupForm"),
  teamA: $("teamA"),
  teamB: $("teamB"),
  customTopic: $("customTopic"),
  useAI: $("useAI"),
  play: $("play"),
  teamCards: [$("teamCardA"), $("teamCardB")],
  teamNames: [$("teamNameA"), $("teamNameB")],
  teamScores: [$("teamScoreA"), $("teamScoreB")],
  roundLabel: $("roundLabel"),
  pot: $("pot"),
  multLabel: $("multLabel"),
  questionMeta: $("questionMeta"),
  questionText: $("questionText"),
  board: $("board"),
  strikes: [...document.querySelectorAll(".strikes__box")],
  status: $("status"),
  guessForm: $("guessForm"),
  guessInput: $("guessInput"),
  roundEnd: $("roundEnd"),
  roundEndText: $("roundEndText"),
  revealRestBtn: $("revealRestBtn"),
  nextRoundBtn: $("nextRoundBtn"),
  strikeBtn: $("strikeBtn"),
  skipBtn: $("skipBtn"),
  quitBtn: $("quitBtn"),
  notice: $("notice"),
  loading: $("loading"),
  bigX: $("bigX"),
  gameOver: $("gameOver"),
  gameOverTag: $("gameOverTag"),
  winnerName: $("winnerName"),
  finalScore: $("finalScore"),
  rematchBtn: $("rematchBtn"),
  newGameBtn: $("newGameBtn"),
  confetti: $("confetti"),
};

/* ---------- State ---------- */
const game = {
  teams: [
    { name: "Team A", score: 0 },
    { name: "Team B", score: 0 },
  ],
  totalRounds: 5,
  round: 1,
  topic: "",
  useAI: true,
  board: null,
  revealed: new Map(), // answer index -> "hit" | "stolen" | "missed"
  strikes: 0,
  pot: 0,
  phase: "idle", // idle | play | steal | over
  pending: null, // prefetched board promise
};

const controlling = () => (game.round - 1) % 2; // teams alternate who starts each round
const other = (i) => 1 - i;
const multiplier = () => (game.totalRounds >= 3 && game.round === game.totalRounds ? 2 : 1);
const activeTeam = () => (game.phase === "steal" ? other(controlling()) : controlling());

/* ---------- Setup ---------- */
function restoreSettings() {
  const s = loadJSON(SETTINGS_KEY, null);
  if (!s) return;
  if (s.teamA) el.teamA.value = s.teamA;
  if (s.teamB) el.teamB.value = s.teamB;
  const r = el.setupForm.querySelector(`input[name="rounds"][value="${s.rounds}"]`);
  if (r) r.checked = true;
  if (typeof s.useAI === "boolean") el.useAI.checked = s.useAI;
}

function readSettings() {
  const custom = el.customTopic.value.trim();
  const chip = el.setupForm.querySelector('input[name="topic"]:checked');
  return {
    teamA: el.teamA.value.trim() || "Team A",
    teamB: el.teamB.value.trim() || "Team B",
    rounds: Number(el.setupForm.querySelector('input[name="rounds"]:checked')?.value) || 5,
    topic: custom || chip?.value || "",
    useAI: el.useAI.checked,
  };
}

// Typing a custom topic visually takes over from the chips; picking a chip clears it.
el.customTopic.addEventListener("input", () => {
  const active = el.customTopic.value.trim().length > 0;
  el.customTopic.closest(".pill-input").classList.toggle("is-active", active);
  if (active) el.setupForm.querySelectorAll('input[name="topic"]').forEach((r) => (r.checked = false));
});
el.setupForm.querySelectorAll('input[name="topic"]').forEach((r) =>
  r.addEventListener("change", () => {
    el.customTopic.value = "";
    el.customTopic.closest(".pill-input").classList.remove("is-active");
  })
);

el.setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = readSettings();
  saveJSON(SETTINGS_KEY, { teamA: s.teamA, teamB: s.teamB, rounds: s.rounds, useAI: s.useAI });
  startGame(s);
});

/* ---------- Game flow ---------- */
function startGame(s) {
  game.teams = [
    { name: s.teamA, score: 0 },
    { name: s.teamB, score: 0 },
  ];
  game.totalRounds = s.rounds;
  game.topic = s.topic;
  game.useAI = s.useAI;
  game.round = 1;
  game.pending = null;
  el.notice.hidden = true;
  el.teamNames.forEach((n, i) => (n.textContent = game.teams[i].name));
  renderScores();
  el.setup.hidden = true;
  el.play.hidden = false;
  el.gameOver.hidden = true;
  window.scrollTo({ top: 0 });
  loadRound();
}

function fetchBoard() {
  return nextBoard({ topic: game.topic, useAI: game.useAI });
}

async function takeBoard() {
  const promise = game.pending || fetchBoard();
  game.pending = null;
  // only flash the loader if the board isn't already waiting
  const loaderTimer = setTimeout(() => (el.loading.hidden = false), 120);
  const result = await promise;
  clearTimeout(loaderTimer);
  el.loading.hidden = true;

  if (result.notice) showNotice(result.notice);
  if (result.reason === "offline") game.useAI = false; // stop waiting on a dead endpoint for the rest of the game
  if (result.reason === "blocked") game.topic = "";
  return result.board;
}

async function loadRound() {
  game.phase = "idle";
  setInputEnabled(false);
  const board = await takeBoard();
  game.board = board;
  game.revealed = new Map();
  game.strikes = 0;
  game.pot = 0;
  game.phase = "play";
  if (game.round < game.totalRounds) game.pending = fetchBoard(); // warm up the next board while this one plays

  el.roundEnd.hidden = true;
  el.roundLabel.textContent = `Round ${game.round} / ${game.totalRounds}`;
  el.multLabel.hidden = multiplier() === 1;
  const where = board.source === "ai" ? "AI-estimated survey" : "We asked 100 people";
  el.questionMeta.textContent = board.category ? `${where} · ${board.category}` : where;
  el.questionText.textContent = board.question;
  renderBoard();
  renderStrikes();
  renderPot();
  renderTurn();
  setInputEnabled(true);
  sound.whoosh();
}

function handleGuess(text) {
  if (!text || (game.phase !== "play" && game.phase !== "steal")) return;
  const match = matchGuess(text, game.board.answers);

  if (match && game.revealed.has(match.index)) {
    setStatus(`<b>${escapeHTML(game.board.answers[match.index].text)}</b> is already on the board — try another.`);
    return;
  }

  if (game.phase === "play") {
    if (match) award(match.index);
    else strike(text);
  } else {
    if (match) {
      award(match.index, "stolen");
    } else {
      showBigX(1);
      sound.buzz();
      endRound(controlling(), "keep the pot after a missed steal");
    }
  }
}

function award(index, how = "hit") {
  const stealing = game.phase === "steal";
  revealTile(index, how);
  game.pot += game.board.answers[index].points * multiplier();
  renderPot();
  sound.ding();

  if (stealing) {
    endRound(other(controlling()), "steal the pot");
  } else if (game.revealed.size === game.board.answers.length) {
    endRound(controlling(), "clear the whole board");
  } else {
    renderTurn();
  }
}

function strike(guessText) {
  game.strikes = Math.min(MAX_STRIKES, game.strikes + 1);
  renderStrikes();
  showBigX(game.strikes);
  sound.buzz();
  el.guessForm.classList.remove("is-shake");
  void el.guessForm.offsetWidth;
  el.guessForm.classList.add("is-shake");

  if (game.strikes >= MAX_STRIKES) {
    game.phase = "steal";
    renderTurn(guessText);
  } else {
    renderTurn(guessText);
  }
}

function endRound(winner, reason) {
  game.phase = "over";
  const won = game.pot;
  game.teams[winner].score += won;
  renderScores(winner);
  setInputEnabled(false);
  el.teamCards.forEach((c) => c.classList.remove("is-active"));
  el.status.classList.remove("is-steal");
  el.guessInput.placeholder = "Round over";

  el.roundEndText.textContent = `${game.teams[winner].name} ${reason}! +${won}`;
  el.nextRoundBtn.firstChild.textContent = game.round >= game.totalRounds ? "See who won " : "Next round ";
  el.revealRestBtn.hidden = game.revealed.size === game.board.answers.length;
  el.roundEnd.hidden = false;
  setStatus(`Round ${game.round} goes to <b>${escapeHTML(game.teams[winner].name)}</b>.`);
  if (won > 0) sound.fanfare();
}

function revealRest() {
  game.board.answers.forEach((_, i) => {
    if (!game.revealed.has(i)) revealTile(i, "missed");
  });
  el.revealRestBtn.hidden = true;
}

function nextRound() {
  if (game.round >= game.totalRounds) return finishGame();
  game.round += 1;
  loadRound();
}

function finishGame() {
  game.phase = "idle";
  setInputEnabled(false);
  const [a, b] = game.teams;
  if (a.score === b.score) {
    el.gameOverTag.textContent = "Dead heat";
    el.winnerName.textContent = "It's a tie!";
  } else {
    const w = a.score > b.score ? a : b;
    el.gameOverTag.textContent = "The crowd has spoken";
    el.winnerName.textContent = w.name;
  }
  el.finalScore.textContent = `${a.name} ${a.score} — ${b.score} ${b.name}`;
  el.gameOver.hidden = false;
  el.rematchBtn.focus();
  sound.fanfare();
  confetti(el.confetti);
}

/* ---------- Rendering ---------- */
function slotCount(n) {
  return n <= 4 ? 4 : n <= 6 ? 6 : 8;
}

function renderBoard() {
  const { answers } = game.board;
  const slots = slotCount(answers.length);
  el.board.style.gridTemplateRows = `repeat(${slots / 2}, auto)`;
  el.board.innerHTML = "";
  for (let i = 0; i < slots; i++) {
    const li = document.createElement("li");
    if (i >= answers.length) {
      li.className = "tile--empty";
      li.setAttribute("aria-hidden", "true");
      el.board.append(li);
      continue;
    }
    li.className = "tile";
    li.dataset.index = i;
    li.innerHTML = `
      <button type="button" class="tile__btn" aria-label="Answer ${i + 1}, hidden">
        <span class="tile__face tile__front"><span>${i + 1}</span></span>
        <span class="tile__face tile__back">
          <span class="tile__answer"></span>
          <span class="tile__points"></span>
        </span>
      </button>`;
    // fill the back with textContent so AI text can never inject markup
    li.querySelector(".tile__answer").textContent = answers[i].text;
    li.querySelector(".tile__points").textContent = answers[i].points;
    el.board.append(li);
  }
}

function revealTile(index, how) {
  game.revealed.set(index, how);
  const tile = el.board.querySelector(`.tile[data-index="${index}"]`);
  if (!tile) return;
  tile.classList.add("is-open");
  if (how === "missed") tile.classList.add("is-missed");
  if (how === "stolen") tile.classList.add("is-stolen");
  const a = game.board.answers[index];
  tile.querySelector(".tile__btn").setAttribute("aria-label", `Answer ${index + 1}: ${a.text}, ${a.points} points`);
}

function renderStrikes() {
  el.strikes.forEach((box, i) => box.classList.toggle("is-on", i < game.strikes));
}

function renderPot() {
  el.pot.textContent = game.pot;
}

function renderScores(bumpIndex) {
  game.teams.forEach((t, i) => {
    el.teamScores[i].textContent = t.score;
    if (i === bumpIndex) {
      el.teamScores[i].classList.remove("is-bump");
      void el.teamScores[i].offsetWidth;
      el.teamScores[i].classList.add("is-bump");
    }
  });
}

function renderTurn(lastMiss) {
  const t = activeTeam();
  el.teamCards.forEach((c, i) => c.classList.toggle("is-active", i === t));
  const name = escapeHTML(game.teams[t].name);
  if (game.phase === "steal") {
    el.status.classList.add("is-steal");
    setStatus(`STEAL! <b>${name}</b>, one guess to take all ${game.pot} points.`);
    el.guessInput.placeholder = `${game.teams[t].name}: one guess to steal…`;
  } else {
    el.status.classList.remove("is-steal");
    const left = game.board.answers.length - game.revealed.size;
    const miss = lastMiss ? `“${escapeHTML(lastMiss)}” isn't up there. ` : "";
    setStatus(`${miss}<b>${name}</b> has the board · ${left} answer${left === 1 ? "" : "s"} left`);
    el.guessInput.placeholder = `${game.teams[t].name}, what did the crowd say?`;
  }
  el.guessInput.focus({ preventScroll: true });
}

function setStatus(html) {
  el.status.innerHTML = html;
}

function setInputEnabled(on) {
  el.guessInput.disabled = !on;
  el.guessForm.querySelector("button").disabled = !on;
  el.strikeBtn.disabled = !on;
  el.skipBtn.disabled = !on;
}

function showNotice(text) {
  el.notice.textContent = text;
  el.notice.hidden = false;
}

function showBigX(n) {
  el.bigX.innerHTML = "<span>✕</span>".repeat(n);
  el.bigX.classList.remove("is-showing");
  void el.bigX.offsetWidth;
  el.bigX.classList.add("is-showing");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/* ---------- Events ---------- */
el.guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.guessInput.value.trim();
  el.guessInput.value = "";
  handleGuess(text);
});

// Host override: click a hidden tile to award it (or just flip it once the round is over).
el.board.addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  const index = Number(tile.dataset.index);
  if (game.revealed.has(index)) return;
  if (game.phase === "play") award(index);
  else if (game.phase === "steal") award(index, "stolen");
  else if (game.phase === "over") revealTile(index, "missed");
});

el.strikeBtn.addEventListener("click", () => {
  if (game.phase === "play") strike();
  else if (game.phase === "steal") {
    showBigX(1);
    sound.buzz();
    endRound(controlling(), "keep the pot after a missed steal");
  }
});

el.skipBtn.addEventListener("click", () => {
  if (game.phase !== "play" && game.phase !== "steal") return;
  if (game.pot > 0 && !confirm("Skip this board? The points in the pot will be lost.")) return;
  loadRound();
});

el.quitBtn.addEventListener("click", () => {
  if (game.phase === "idle" && !el.gameOver.hidden) return;
  if (confirm("End the game now and see the scores?")) finishGame();
});

el.revealRestBtn.addEventListener("click", revealRest);
el.nextRoundBtn.addEventListener("click", nextRound);

el.rematchBtn.addEventListener("click", () => {
  const s = readSettings();
  startGame({ ...s, teamA: game.teams[0].name, teamB: game.teams[1].name, useAI: el.useAI.checked });
});
el.newGameBtn.addEventListener("click", () => {
  el.gameOver.hidden = true;
  el.play.hidden = true;
  el.setup.hidden = false;
  game.phase = "idle";
  window.scrollTo({ top: 0 });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.gameOver.hidden) el.gameOver.hidden = true;
});

restoreSettings();
