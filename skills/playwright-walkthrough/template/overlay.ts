/**
 * playwright-walkthrough overlay helpers.
 *
 * Adds the two things Playwright's native `page.screencast` API doesn't
 * provide out of the box:
 *
 *   1. A fake cursor dot — browser video captures the page render,
 *      which omits the OS cursor. This mirrors the real pointer so
 *      clicks and hovers are visible on playback.
 *   2. A Driver.js-powered spotlight — dim veil with a clear cutout
 *      around the highlighted element, used for explainer beats.
 *
 * Plus smooth-scroll helpers (CSS `scroll-behavior: smooth` is too fast
 * and not tunable enough for filmable motion).
 *
 * For scene cards and action annotations, call `page.screencast.show*`
 * directly — this file deliberately doesn't re-wrap those.
 *
 * Requires `driver.js` in the project's devDependencies.
 */

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { Locator, Page } from "@playwright/test"

// Resolve driver.js assets from the project's node_modules.
// Using process.cwd() works under both CJS and ESM specs.
const req = createRequire(process.cwd() + "/package.json")
const DRIVER_JS = readFileSync(
  req.resolve("driver.js/dist/driver.js.iife.js"),
  "utf-8",
)
const DRIVER_CSS = readFileSync(
  req.resolve("driver.js/dist/driver.css"),
  "utf-8",
)

export const SCROLL_DURATION_MS = 1500

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface InstallOverlayOptions {
  /** Stage padding around the spotlight target. Default 8. */
  stagePadding?: number
  /** Corner radius of the spotlight cutout. Default 10. */
  stageRadius?: number
  /** Opacity of the dim veil outside the spotlight (0..1). Default 0.6. */
  overlayOpacity?: number
}

/**
 * Inject Driver.js, its CSS, the fake-cursor element, and a mousemove
 * listener into every page load. Call once before any navigation.
 *
 * The overlay DOM is attached to `document.body`, which survives SPA
 * route changes, so it keeps working after client-side navigation.
 */
export async function installOverlay(
  page: Page,
  opts: InstallOverlayOptions = {},
): Promise<void> {
  const driverConfig = {
    stagePadding: opts.stagePadding ?? 8,
    stageRadius: opts.stageRadius ?? 10,
    overlayOpacity: opts.overlayOpacity ?? 0.6,
  }

  // 1. Driver.js UMD bundle — exposes window.driver.js.driver.
  await page.addInitScript({ content: DRIVER_JS })

  // 2. Driver.js stylesheet + cursor styles + spotlight config sidecar.
  await page.addInitScript(
    ({ css, config }) => {
      if (document.getElementById("pw-walk-style")) return
      const install = () => {
        const style = document.createElement("style")
        style.id = "pw-walk-style"
        style.textContent = `
          ${css}
          #pw-walk-cursor {
            position: fixed; left: 0; top: 0;
            width: 22px; height: 22px; margin: -11px 0 0 -11px;
            z-index: 2147483646; pointer-events: none;
            border-radius: 50%;
            background: rgba(255, 96, 96, 0.85);
            box-shadow: 0 0 0 2px #fff, 0 0 12px rgba(255, 60, 60, 0.6);
            transition: transform 40ms linear;
            will-change: transform;
            display: none;
          }
          /* Hide the fake cursor while the spotlight is up — the
             cutout is doing the pointing. */
          body.pw-walk-spotlight #pw-walk-cursor { display: none !important; }
        `
        document.head.appendChild(style)

        const cursor = document.createElement("div")
        cursor.id = "pw-walk-cursor"
        document.body.appendChild(cursor)

        const move = (e: MouseEvent) => {
          cursor.style.display = "block"
          cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
        }
        window.addEventListener("mousemove", move, { capture: true })
        window.addEventListener("click", move, { capture: true })

        // Stash Driver config for highlight() to read on first use.
        ;(window as unknown as { __pwWalkConfig: unknown }).__pwWalkConfig =
          config
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install)
      } else {
        install()
      }
    },
    { css: DRIVER_CSS, config: driverConfig },
  )
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export async function pause(page: Page, ms = 900): Promise<void> {
  await page.waitForTimeout(ms)
}

export async function smoothScrollTo(
  page: Page,
  locator: Locator,
  settleMs = 500,
  durationMs = SCROLL_DURATION_MS,
): Promise<void> {
  await locator.first().evaluate(
    (el, duration) =>
      new Promise<void>((resolve) => {
        const rect = (el as HTMLElement).getBoundingClientRect()
        const targetY =
          window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
        const startY = window.scrollY
        const delta = targetY - startY
        if (Math.abs(delta) < 2) {
          resolve()
          return
        }
        const t0 = performance.now()
        const step = (now: number) => {
          const t = Math.min((now - t0) / duration, 1)
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
          window.scrollTo(0, startY + delta * eased)
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      }),
    durationMs,
  )
  await page.waitForTimeout(settleMs)
}

export async function smoothScrollBy(
  page: Page,
  deltaY: number,
  settleMs = 500,
  durationMs = SCROLL_DURATION_MS,
): Promise<void> {
  await page.evaluate(
    ({ dy, duration }) =>
      new Promise<void>((resolve) => {
        const startY = window.scrollY
        const t0 = performance.now()
        const step = (now: number) => {
          const t = Math.min((now - t0) / duration, 1)
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
          window.scrollTo(0, startY + dy * eased)
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      }),
    { dy: deltaY, duration: durationMs },
  )
  await page.waitForTimeout(settleMs)
}

// ---------------------------------------------------------------------------
// Spotlight (Driver.js)
// ---------------------------------------------------------------------------

/**
 * Highlight an element with a dim-veil spotlight. Successive calls
 * animate the cutout from the previous target to the new one — so a
 * scene that walks through 3 regions needs 3 `highlight()` calls, not
 * 3 pairs of highlight/clear.
 *
 * Call `clearSpotlight()` at the end of a spotlight scene so the
 * cursor comes back for the next interaction scene.
 */
export async function highlight(
  page: Page,
  target: Locator,
  opts?: { hold?: number },
): Promise<void> {
  const handle = await target.elementHandle()
  if (!handle) return
  await page.evaluate((el) => {
    const w = window as unknown as {
      driver?: { js: { driver: (cfg: unknown) => unknown } }
      __pwWalkDriver?: { highlight: (step: unknown) => void }
      __pwWalkConfig?: unknown
    }
    if (!w.__pwWalkDriver) {
      const factory = w.driver?.js?.driver
      if (!factory) {
        throw new Error(
          "Driver.js not loaded — call installOverlay(page) before highlight().",
        )
      }
      w.__pwWalkDriver = factory({
        animate: true,
        ...(w.__pwWalkConfig as object),
      }) as { highlight: (step: unknown) => void }
    }
    w.__pwWalkDriver.highlight({ element: el })
    document.body.classList.add("pw-walk-spotlight")
  }, handle)
  if (opts?.hold) await page.waitForTimeout(opts.hold)
}

/** Tear down the spotlight and restore the fake cursor. */
export async function clearSpotlight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __pwWalkDriver?: { destroy: () => void }
    }
    w.__pwWalkDriver?.destroy()
    w.__pwWalkDriver = undefined
    document.body.classList.remove("pw-walk-spotlight")
  })
  await page.waitForTimeout(300)
}
