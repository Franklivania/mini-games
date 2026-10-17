# Mini Games

A small arcade of party games for game nights, classrooms and group calls.

| Route | Game |
| --- | --- |
| `/` | Home: what this is, links to every game |
| `/spin/` | **Spin the Wheel**: enter names, spin, the pointer picks one |
| `/crowd-says/` | **Crowd Says**: two-team survey game (guess the crowd's top answers, three strikes, steal the pot) |

Aliases: `/wheel` and `/spinner` → `/spin/`; `/feud` and `/survey` → `/crowd-says/`.

## Run it locally

```sh
npm install
cp .env.example .env        # then paste your Groq key into .env
npm run dev                 # → http://localhost:8888 (pages + /api function)
```

`npm run dev` uses the local `netlify-cli` and loads `.env` so `GROQ_API_KEY` reaches the function.

- `npm run serve`: static pages only (no API). Crowd Says detects this and uses its built-in offline boards.
- `npm run check:groq`: checks your key, the guard model and board generation from the terminal. Add a topic: `npm run check:groq -- "campus life"`.

Opening the HTML files straight from disk (`file://`) won't work. Pages use root paths like `/styles/...` and ES modules, so use one of the commands above.

## Deploy to Netlify

1. Push this folder to GitHub and import the repo in Netlify, or run `npx netlify-cli deploy --prod` from here.
2. Build settings come from `netlify.toml`: publish `src`, functions `netlify/functions`, no build command.
3. Add the key: **Site configuration → Environment variables → Add a variable**
   - Key: `GROQ_API_KEY`, Value: your key, Scopes: at least **Functions**.

   Or from the terminal: `npx netlify-cli env:set GROQ_API_KEY <your-key>`.
4. Redeploy so the function picks up the variable.

The key only ever lives in Netlify's environment and your local `.env` (git-ignored). The browser calls `/api/crowd-says`, and the function talks to Groq. You don't need GitHub Secrets for this, because Netlify builds and runs the function itself. GitHub Secrets would only matter if you later deploy through a GitHub Action.

## Models

| Purpose | Default | Env override |
| --- | --- | --- |
| Writes survey boards (strict JSON schema) | `openai/gpt-oss-20b` | `GROQ_MODEL` |
| Backup if the first fails | `llama-3.3-70b-versatile` | `GROQ_FALLBACK_MODEL` |
| Screens custom topics for prompt-injection | `meta-llama/llama-prompt-guard-2-22m` | `GROQ_GUARD_MODEL` |

Prompt Guard is a classifier, not a writer. It only decides whether a player-typed topic is an attempt to hijack the prompt. It is a Groq *preview* model, so if it disappears the function skips the check and carries on.

If the API is unreachable, unconfigured or rate-limited, Crowd Says falls back to the 24 boards in `src/scripts/crowd-says/question-bank.js`, so the game always works.

See `ARCHITECTURE.md` for structure and conventions.
