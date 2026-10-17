# Architecture Notes

## Setup profile

- **Framework:** vanilla
- **Project profile:** interactive-experimental
- **Package manager detected:** npm
- **Profile intent:** A visually expressive experience with careful performance, accessibility, and motion lifecycle handling.

## Framework-specific rules

Use native ES modules and progressive enhancement. Link src/styles/global.css from the HTML entry and keep DOM-specific scripts explicit. Do not add a framework or state library without a concrete requirement.

## Shared conventions

- CSS class names use lowercase BEM-inspired kebab-case: .navbar, .navbar__header, .navbar__header-bottom, .navbar__link--active.
- Component filenames use kebab-case (for example, navbar.tsx); React component exports remain PascalCase. Hook names use camelCase (for example, useScrollProgress).
- Use shared generic utilities only when they are genuinely reusable across the application.
- Keep primitive tokens, semantic tokens, and component tokens separate. Component tokens are introduced when a component has meaningful variants or repeated design requirements.
- Responsive typography is fluid-first using clamp(); use explicit breakpoints where composition actually changes. Derive breakpoints from content/layout rather than device labels alone.
- Use local font assets when supplied, optimize the required weights, and avoid downloading fonts unless requested.
- Themes are added only when requested or required by the product.
- Prefer framework-native data loading where it fits. Use Zustand for shared client state and TanStack Query for server state only when the use case justifies them. Avoid duplicating server state in multiple stores.
- Keep feature-based directories optional. Start with the smallest useful structure and add domain boundaries when complexity warrants them.

## Project structure

```text
src/                          # publish directory (served as-is, no build step)
  index.html                  # home: what Mini Games is + links to each game
  404.html
  spin/index.html             # /spin/
  crowd-says/index.html       # /crowd-says/
  assets/favicon.svg
  styles/
    tokens.css                # primitive → semantic tokens (neo-brutalist palette)
    reset.css  typography.css  animations.css
    components.css            # shared shell + UI primitives (header, btn, tape, pill-input, chip, toggle, modal)
    global.css                # imports all of the above; linked from every page
    pages/                    # one stylesheet per page: home.css, spin.css, crowd-says.css
  scripts/
    lib/                      # shared ES modules: random, storage, sound, confetti, palette
    spin.js                   # Spin the Wheel
    crowd-says/
      main.js                 # game state machine + rendering
      boards.js               # fetch AI board → fall back to the offline bank
      match.js                # fuzzy answer matching
      question-bank.js        # offline boards
netlify/functions/crowd-says.mjs  # POST /api/crowd-says (holds the Groq key)
netlify/lib/generate.mjs          # guard check, prompt, schema, model fallback, board clean-up
scripts/check-groq.mjs        # terminal smoke test for the key and models
netlify.toml                  # publish dir, functions, redirects, headers
```

### Adding a game

1. Create `src/<game>/index.html` (copy the `<head>` and `.site-header` from an existing page and mark its nav link active).
2. Add `src/styles/pages/<game>.css` and `src/scripts/<game>.js` (or a `src/scripts/<game>/` folder once it needs more than one module).
3. Add a card to the games grid in `src/index.html`, a nav link to every page's header, and any alias redirects to `netlify.toml`.

## Rendering and routing

Plain multi-page site. Each game is a folder with an `index.html`, so Netlify's pretty URLs give `/spin/` and `/crowd-says/` with no client-side router. All asset paths are root-relative (`/styles/...`), so pages must be served over HTTP (`npm run dev` or `npm run serve`), not opened from disk.

## Secrets and the API

The Groq key is only ever read on the server (`process.env.GROQ_API_KEY` inside the Netlify Function). Locally it comes from `.env` (git-ignored); in production, from Netlify environment variables. The browser calls `/api/crowd-says`, which `netlify.toml` rewrites to the function.

The function screens custom topics with Prompt Guard, generates a board with a strict JSON schema, retries on a fallback model, and sanitises the result. AI text is always inserted with `textContent`. The client treats any failure as a cue to use the offline question bank, so the game never hard-depends on the API.

## Styling foundation

Tokens live in src/styles/tokens.css (primitive → semantic). Shared primitives are in components.css; each page adds one stylesheet under styles/pages/. Canvas drawing can't read CSS variables cheaply, so `scripts/lib/palette.js` mirrors the colour primitives. Keep the two in sync.

## Motion

Motion foundation enabled with CSS and native browser capabilities. Use the data-motion attributes and provided keyframes for simple self-contained effects. Add a timeline library only when sequencing, scroll-linked behavior, or dynamic text motion requires it. For Astro and Vanilla, keep scripts framework-free; do not add React islands only to animate content. Respect reduced-motion preferences.

## API layer

One endpoint, called from `scripts/crowd-says/boards.js`. If more endpoints appear, move the fetch helper into `scripts/lib/api.js`.

## Configuration

The machine-readable defaults are in frontend-architecture.config.json. Explicit project decisions and existing sound conventions take precedence over these defaults. Update that configuration and this document when material choices change.

## Dependency installation

No animation package is required for the selected native/CSS motion path. Add external libraries only when a concrete interaction requires them.

## Privacy and network behavior

This setup does not enable telemetry or upload project files. Framework detection uses limited local metadata. Catalog synchronization, if configured, is read-only and downloads JSON data only.
