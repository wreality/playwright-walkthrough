---
name: playwright-walkthrough
description: Scaffold a Playwright-driven walkthrough video of a web app — chapter cards, action annotations, smooth scrolling, fake cursor, and a Driver.js spotlight for explainer beats. Use when the user asks to record / produce / regenerate a feature walkthrough, demo, or preview video.
---

# Playwright Walkthrough

A reusable pattern for producing a polished **walkthrough video** — a scripted tour of a web app recorded by Playwright. The output is a `.webm` that drops into a PR description, release note, stakeholder email, or docs page.

Builds on **Playwright 1.59+'s native `page.screencast` API** for chapter cards and action annotations. The skill adds only what Playwright doesn't: a fake cursor dot (browser video omits the OS cursor), a [Driver.js](https://driverjs.com/) spotlight for explainer scenes, and smooth-scroll helpers.

## When to invoke this skill

User asks for any of:

- "record a walkthrough / screencast / demo of this branch"
- "make a video showing the new X page"
- "regenerate the preview video"
- "add a scene to the existing walkthrough"

## What it produces

A Playwright spec (e.g. `<tests-dir>/walkthrough/<name>.spec.ts`) that, when run, records a video with:

- **Chapter cards** — full-screen title cards between scenes, via `page.screencast.showChapter()`
- **Action annotations** — small labels next to each click/fill, via `page.screencast.showActions()`
- **Fake cursor dot** — follows the real mouse so viewers can see interactions
- **Spotlight** — clear cutout around a target element with a dim veil over the rest, powered by Driver.js; animates between targets
- **Smooth scroll** — `requestAnimationFrame` with ease-in-out, tunable duration

## Requirements

- Playwright **1.59+** (for the `page.screencast` API)
- `driver.js` as a devDependency (used by the spotlight helper)

## Setup paths

Record from whatever branch the user is already on — no dedicated preview branch required. The walkthrough spec is just another Playwright file; leave staging and commits to the user.

### A. Project already has Playwright

Look for `playwright.config.*`, a `playwright/` dir, or `@playwright/test` in `package.json`. If found, use the existing harness — you get fixtures for free (login helpers, `globalSetup` for DB seeding, baseURL, stored auth state).

Bump `@playwright/test` to 1.59+ if it isn't already, and `npm install --save-dev driver.js`.

### B. Project has no Playwright

**Default to a hidden subdirectory** — `.walkthrough/` — following the same convention as `.vscode/`, `.venv/`, `.terraform/`. Self-contained, scoped to the project, trivially gitignorable:

```
<project-root>/
├── <project's normal files>
└── .walkthrough/                ← self-contained Playwright install
    ├── package.json
    ├── playwright.config.ts     (baseURL → the running dev server)
    ├── overlay.ts
    ├── feature.spec.ts
    └── node_modules/
```

Setup (run inside `.walkthrough/`):

```bash
npm init -y
npm install --save-dev @playwright/test@^1.59 driver.js
npx playwright install chromium
```

Then add `.walkthrough/` to the project's `.gitignore` (or leave it untracked). Run specs from inside that directory so the local `node_modules` and `playwright.config.ts` resolve:

```bash
cd .walkthrough && npx playwright test feature.spec.ts --project=chromium
```

**Don't install Playwright at the project root** unless the user explicitly asks. Playwright pulls in browser binaries (~200MB) and `driver.js` that likely shouldn't be committed to a non-test codebase.

**Sibling directory** (`../<repo>-walkthrough/`) is an option if the user prefers zero footprint in the project — but ask first, since it means writing outside the current directory.

## Step-by-step

When the user asks for a new walkthrough, walk through these steps. Don't create branches or commits unless the user asks.

### 1. Detect the Playwright setup

Check for `playwright.config.*`, a `playwright/` dir, or `@playwright/test` in `package.json`.

- **Found (path A)** → use the existing harness. Confirm Playwright is 1.59+; if not, bump it.
- **Not found (path B)** → create `.walkthrough/` in the project root and set up Playwright there as described above. Remind the user to add `.walkthrough/` to `.gitignore`.

Then `npm install --save-dev driver.js` in whichever directory Playwright lives in.

### 2. Copy the overlay helpers

Drop `template/overlay.ts` from this skill alongside the walkthrough spec — for path A, inside a `walkthrough/` subfolder of the project's tests directory; for path B, at the root of `.walkthrough/`. The file is generic — no project-specific references inside.

### 3. Write the spec

Start from `template/walkthrough.spec.ts.template`. Customize:

- `test.use({ viewport })` — HD default (1440×900) works well
- `test.setTimeout(5 * 60_000)` — default is 30s, which fires mid-recording
- Auth / starting URL (use the project's fixture if one exists; otherwise navigate directly)
- The scene helpers — one per logical flow step

### 4. Run it

```bash
PLAYWRIGHT_HTML_OPEN=never \
npx playwright test walkthrough/<feature> --project=chromium
```

Use whatever package manager / script the project already uses (`yarn playwright test …`, `pnpm …`). Wire `baseURL` in however the project expects — config, env var, or `--config` flag.

Output lands at `test-results/<spec-name>-<test-title>-<project>/walkthrough.webm`. Playwright wipes `test-results/` on every run, so copy the file out before re-running.

**Record locally, not in CI.** Headless CI runners often lack the GPU, font rendering, and viewport stability needed for a polished recording.

### 5. Convert / trim (optional)

```bash
ffmpeg -i walkthrough.webm out.mp4                            # re-container
ffmpeg -i walkthrough.webm -ss 00:00:02 -to 00:03:00 out.mp4  # trim
ffmpeg -i in.webm -vf "pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=#0c101c" out.mp4   # pad narrow recordings
```

## Recording scenes separately and stitching with ffmpeg

Useful once a walkthrough has enough scenes that re-recording the whole thing to tweak one is painful, and it's the cleanest way to mix viewport sizes. Requires `ffmpeg` on PATH.

Split into one `test()` per scene (or one spec file per scene). Each calls `page.screencast.start/stop` around its own segment and produces its own `.webm`. To iterate, re-record only the scene you changed.

```bash
cat > scenes.txt <<'EOF'
file 'scene-01-intro.webm'
file 'scene-02-filter.webm'
file 'scene-03-detail.webm'
EOF

# Fast path — scenes share codec/resolution/framerate
ffmpeg -f concat -safe 0 -i scenes.txt -c copy combined.webm

# Fallback if codecs/dimensions disagree
ffmpeg -f concat -safe 0 -i scenes.txt -c:v libvpx-vp9 -b:v 2M combined.webm
```

Each scene boots cold (re-auth, re-navigate). Open each with `page.screencast.showChapter()` — the card covers the initial-render flash.

### Mixing desktop and mobile scenes

Record a mobile scene in its own spec at a phone viewport, then `pad` it up to the desktop canvas before concatenation. The phone-shaped frame sits centered on a dark stage — the "DevTools device toolbar" look, no CDP hackery.

```bash
ffmpeg -i mobile-scene.webm \
  -vf "pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=#0c101c" \
  -c:v libvpx-vp9 -b:v 2M mobile-scene-padded.webm
```

Then list `mobile-scene-padded.webm` in `scenes.txt` alongside desktop scenes.

## The helpers

All exported from `overlay.ts`.

### Setup

- `installOverlay(page, opts?)` — injects Driver.js, cursor element, and mousemove tracking via `addInitScript`. Call **once**, before any navigation. Options: `stagePadding`, `stageRadius`, `overlayOpacity`.

### Motion

- `pause(page, ms = 900)` — a `waitForTimeout`. Reads better than `waitForTimeout(900)` scattered through a spec.
- `smoothScrollTo(page, locator, settleMs?, durationMs?)` — animated scroll that centers the locator. Ease-in-out.
- `smoothScrollBy(page, deltaY, settleMs?, durationMs?)` — animated relative scroll.

### Spotlight

- `highlight(page, locator, { hold? })` — moves the dim-veil spotlight to the locator. Successive calls animate between targets. Hides the fake cursor while active.
- `clearSpotlight(page)` — tears down the spotlight and restores the cursor. Call at the end of a spotlight scene before one that needs the cursor back.

### Native Playwright APIs you'll also use

Not wrapped — call directly:

- `page.screencast.start({ path, size })` / `page.screencast.stop()` — begin/end recording
- `page.screencast.showChapter(title, { description, duration })` — full-screen title card with blurred backdrop
- `page.screencast.showActions({ position, duration, fontSize })` — toggle action annotations on/off for the rest of the test
- `page.screencast.showOverlay(html, { duration })` — custom HTML overlay (use for one-off callouts)

## Patterns + gotchas

### Spotlight vs. cursor

Use the **spotlight for explainer scenes** ("here's what this page is"). Use the **cursor for action scenes** ("click this to filter"). Mixing them reads as noisy. Convention:

- Scene 1 (orientation) → spotlight
- Scene 2+ (interactions) → cursor

`highlight` hides the cursor while active; `clearSpotlight` brings it back.

### Mobile / small-viewport scenes

Don't change viewport mid-recording — `video.size` is locked at context creation. Instead, record the mobile scene in its own spec at a phone viewport, then pad it up during stitching (see "Mixing desktop and mobile scenes" above).

### SPA navigations and `addInitScript`

`addInitScript` runs on every **document** load. Vue Router / React Router SPA routes don't re-run it — but the overlay DOM is attached to `document.body`, which survives SPA nav, so the cursor keeps working. The Driver.js singleton is stored on `window`, which also survives SPA nav.

### Route hash scrolling is flaky

If the target app has a `scrollBehavior` override in Vue Router or similar, hash-anchor navigation may not fire. `smoothScrollTo` / `smoothScrollBy` explicitly animate window scroll to dodge this.

### Seed IDs drift

If the spec hardcodes a numeric ID (e.g. `/posts/42`) and the app's data comes from a seed, that ID can shift on reseed. Two approaches:

- Look it up by a stable attribute (name / slug) at the start of the test — or in `globalSetup` if the harness supports it
- Hardcode and update when it drifts (fine if the walkthrough is short-lived)

### Driver.js z-index

Driver.js sets its overlays at `z-index: 10000` by default, which is below our cursor (`z-index: 2147483646`). If your app reaches into that territory, Driver.js exposes `stageRadius` and `popoverOffset` but not a `z-index` knob — worst case, bump the cursor's `z-index` in `overlay.ts`.

## Naming conventions

- **DOM IDs / classes the overlay injects:** prefix with `pw-walk-` so nothing collides with app IDs.
- **Spec file:** `<feature-name>.spec.ts` under the project's `walkthrough/` test folder.
- **Video output:** copy the raw `.webm` somewhere stable after a good take — Playwright wipes `test-results/` on the next run.

## Reference pacing

A ~3-minute walkthrough typically comprises 8–10 scenes: one orientation / spotlight tour of the main surface, several interaction scenes, and a closing chapter card. Budget 15–30 seconds per scene — longer for spotlight explainers, shorter for crisp click-through demos. Err on the side of more, shorter scenes rather than a few long ones; the chapter transitions give the viewer a breather and make the whole thing feel deliberate.
