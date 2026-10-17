// POST /api/crowd-says  →  { question, category, answers: [{ text, points, aliases }] }
// The Groq key is read from the GROQ_API_KEY environment variable (Netlify site settings, or .env locally).
import Groq from "groq-sdk";
import { generateBoard, isTopicSafe } from "../lib/generate.mjs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json(503, { code: "not_configured", error: "GROQ_API_KEY is not set on the server." });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "bad_request", error: "Send a JSON body." });
  }

  const topic = typeof body?.topic === "string" ? body.topic.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const avoid = Array.isArray(body?.exclude)
    ? body.exclude.filter((q) => typeof q === "string").map((q) => q.slice(0, 140)).slice(0, 12)
    : [];

  // Keep total time under the browser's 25 s timeout: two models × one 10 s attempt each.
  const groq = new Groq({ apiKey, maxRetries: 0, timeout: 10_000 });

  if (topic && !(await isTopicSafe(groq, topic))) {
    return json(422, { code: "blocked_topic", error: "That topic looked like an instruction, not a theme. Using a built-in board instead." });
  }

  try {
    const board = await generateBoard(groq, { topic, avoid });
    return json(200, board);
  } catch (err) {
    console.error("[crowd-says] generation failed:", err?.message || err);
    const status = err?.status === 429 ? 429 : 502;
    return json(status, { code: status === 429 ? "rate_limited" : "upstream_error", error: "Couldn't generate a board right now." });
  }
};
