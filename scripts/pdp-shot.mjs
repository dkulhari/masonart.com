#!/usr/bin/env node
// Screenshot harness for the PDP parity loop.
//
// Each invocation launches its own headless Chromium, so several agents can run this
// concurrently without fighting over a shared browser.
//
//   node scripts/pdp-shot.mjs --target ref   --out /tmp/a.png --width 1440 --scroll 900
//   node scripts/pdp-shot.mjs --target ours  --out /tmp/b.png --width 390  --full
//   node scripts/pdp-shot.mjs --target ours  --out /tmp/c.png --clip '[data-testid="buy-panel"]'
//   node scripts/pdp-shot.mjs --target ref   --probe '() => getComputedStyle(document.querySelector("h1")).fontSize'
//
// Flags:
//   --target ref|ours     shorthand for the two pages under comparison
//   --url <url>           explicit URL, overrides --target
//   --out <path>          where to write the png (omit when only probing)
//   --width/--height      viewport, defaults 1440x900
//   --scroll <px>         scroll to this offset before shooting
//   --full                full-page screenshot
//   --clip <selector>     screenshot just this element
//   --probe <js>          evaluate an arrow function in the page, print the JSON result
//   --wait <ms>           extra settle time (default 1200)

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const REF =
  'https://www.mesonart.com/collections/new/products/rainy-day-compassion-pac347'
const OURS = 'http://localhost:3001/posters/wabi-sabi-study'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const flag = name => argv.includes(`--${name}`)

const target = arg('target', 'ours')
const url = arg('url', target === 'ref' ? REF : OURS)
const out = arg('out')
const width = Number(arg('width', 1440))
const height = Number(arg('height', 900))
const scrollTo = Number(arg('scroll', 0))
const clip = arg('clip')
const probe = arg('probe')
const settle = Number(arg('wait', 1200))

// The reference site throws a newsletter modal, a chat bubble and a sticky promo over the
// page. None of them are part of the design we are matching, so they get hidden before
// anything is captured — otherwise every screenshot is of a popup.
const HIDE_OVERLAYS = () => {
  const hide = el => {
    el.style.setProperty('display', 'none', 'important')
  }
  document
    .querySelectorAll(
      '[class*="modal" i],[class*="popup" i],[id*="popup" i],[class*="omnisend" i],[class*="klaviyo" i],[class*="privy" i],shopify-chat,[class*="chat" i][class*="widget" i],' +
        // Our own JoinGalleryModal and the review toast are role-based with no matching
        // class, so a class-only sweep leaves them sitting over the page.
        '[role="dialog"],[role="alertdialog"],[data-testid*="modal" i],[data-testid*="toast" i]',
    )
    .forEach(hide)
  // Geometric sweep for overlays the selector list misses. Two things matter here:
  //
  //  - `position: sticky` is excluded. A sticky element is part of the layout, not on top of
  //    it — our own gallery column is sticky, and hiding it blanks the artwork out of every
  //    capture.
  //  - `z-index: auto` parses to NaN, and `NaN < 100` is false, so a bare `Number()` compare
  //    let every untiered element through the guard. Default it to 0.
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed') return
    if ((Number(cs.zIndex) || 0) < 100) return
    const r = el.getBoundingClientRect()
    if (r.width > 240 && r.height > 160) hide(el)
  })
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 2,
})

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
} catch {
  // networkidle never settles on pages with long-polling widgets; the DOM is up by now.
  await page.waitForLoadState('domcontentloaded')
}

// Force every lazy image to decode by walking the page once, then returning to the top.
await page.evaluate(async () => {
  const step = Math.round(window.innerHeight * 0.8)
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y)
    await new Promise(r => setTimeout(r, 120))
  }
  window.scrollTo(0, 0)
})
await page.evaluate(HIDE_OVERLAYS)
await page.waitForTimeout(settle)

if (scrollTo) {
  await page.evaluate(y => window.scrollTo(0, y), scrollTo)
  await page.waitForTimeout(600)
}

// Last line of defence before the shutter. A screenshot taken behind a lightbox or a
// consent banner still looks like a screenshot, and a critic comparing it will confidently
// judge the overlay instead of the design — so refuse to produce one rather than emit a
// corrupt comparison. Escape first, since our own expand overlay closes on it.
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
await page.evaluate(HIDE_OVERLAYS)

const blocking = await page.evaluate(() => {
  const covering = []
  document.querySelectorAll('[role="dialog"],[role="alertdialog"]').forEach(el => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
    const r = el.getBoundingClientRect()
    if (r.width < 200 || r.height < 150) return
    covering.push(el.getAttribute('aria-label') || el.className.toString().slice(0, 60))
  })
  const blurred = [...document.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el)
    if (cs.backdropFilter === 'none' || cs.position !== 'fixed') return false
    const r = el.getBoundingClientRect()
    return r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.8
  }).length
  return { covering, blurred }
})

if (blocking.covering.length || blocking.blurred) {
  throw new Error(
    `refusing to capture — the page is behind an overlay.\n` +
      `  dialogs: ${blocking.covering.join(', ') || 'none'}\n` +
      `  full-viewport backdrop-filter layers: ${blocking.blurred}\n` +
      `Fix the page or extend HIDE_OVERLAYS; do not judge this capture.`,
  )
}

if (probe) {
  // Playwright treats a bare string as an expression, so an arrow-function source would
  // evaluate to the function itself. Invoke it.
  const result = await page.evaluate(`(${probe})()`)
  console.log(JSON.stringify(result, null, 2))
}

if (out) {
  await mkdir(dirname(out), { recursive: true })
  if (clip) {
    const el = await page.$(clip)
    if (!el) throw new Error(`--clip selector matched nothing: ${clip}`)
    await el.screenshot({ path: out })
  } else {
    await page.screenshot({ path: out, fullPage: flag('full') })
  }
  console.log(out)
}

await browser.close()
