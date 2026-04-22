# playwright-walkthrough

A Claude Code plugin that scaffolds **Playwright-driven walkthrough videos** of a web app — polished `.webm` tours you can drop into a PR description, release note, or stakeholder email.

It's an opinionated wrapper on top of Playwright 1.59+'s native `page.screencast` API. The plugin provides:

- Chapter cards between scenes (Playwright native)
- Action annotations during interactions (Playwright native)
- A fake cursor dot so clicks are visible on playback
- A [Driver.js](https://driverjs.com/) spotlight for explainer beats, animating between targets
- Smooth-scroll helpers tuned for filmable motion

## Install

```
/plugin marketplace add wreality/playwright-walkthrough
/plugin install playwright-walkthrough@wreality-playwright-walkthrough
```

Then ask Claude something like:

> Record a walkthrough of the new dashboard.

The skill activates and walks you through detecting Playwright in your project (or setting up a sibling walkthrough project if not), dropping in the overlay helpers, and scaffolding a spec you iterate on.

## Requirements in the target project

- **Playwright 1.59+** — the `page.screencast` API lands here
- **`driver.js`** in devDependencies — used by the spotlight helper

Both get installed during setup; no manual prep needed.

## What gets produced

```
<tests-dir>/walkthrough/
├── overlay.ts              ← generic helpers (Driver.js + cursor + scroll)
└── <feature>.spec.ts       ← your storyboard — one helper per scene
```

Run it:

```bash
npx playwright test walkthrough/<feature> --project=chromium
```

Output lands at `test-results/.../walkthrough.webm`.

## Differentiators

Closest neighbors:

- [`splitbrain/ndemo`](https://github.com/splitbrain/ndemo) — Claude authors a YAML playbook on the fly, runs it, renders a narrated mp4 with TTS. Fully dynamic.
- [`digitalsamba/claude-code-video-toolkit`](https://github.com/digitalsamba/claude-code-video-toolkit) — broad video workspace (Remotion, ElevenLabs, FFmpeg). Raw Playwright footage goes in as one clip among many.

This plugin is the scaffold-and-iterate alternative: the spec is a file you own, tweak, and re-run. Zero external services, no API keys, and a Driver.js spotlight neither of the above provides.

## License

MIT — see [LICENSE](LICENSE).
