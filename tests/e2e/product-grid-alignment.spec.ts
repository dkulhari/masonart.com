/**
 * Product grid alignment regression
 *
 * This is the test that protects what the whole feature buys. Every other test
 * can pass while the grid still looks ragged.
 *
 * Method mirrors how mesonart.com was measured: bucket cards by their rounded
 * top coordinate, then assert each bucket contains exactly ONE distinct height.
 * Heights may differ BETWEEN rows — that is expected, and matches the reference
 * implementation, where titles wrapping to 3 or 4 lines produce 359.88 /
 * 376.88 / 379.88px rows that still align internally.
 *
 * Fails loudly if anyone reintroduces a ratio branch, restores a content-height
 * card wrapper, or ships a non-square asset.
 *
 * Note: `page.evaluate` / `locator.evaluate` below are Playwright's
 * browser-context APIs, not JavaScript `eval()`. Every function passed to them
 * is statically authored here; none is built from external input.
 */

import { test, expect, type Page } from '@playwright/test'

const WIDTHS = [
  { w: 1440, h: 900, cols: 4 },
  { w: 1024, h: 900, cols: 3 },
  { w: 375, h: 812, cols: 2 },
]

interface CardBox {
  top: number
  height: number
  mediaW: number
  mediaH: number
}

async function cardBoxes(page: Page): Promise<CardBox[]> {
  return page.$$eval('[data-testid="product-card"]', (els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect()
        const media = el.querySelector('[data-testid="media-box"]')
        if (!media) return null
        const m = media.getBoundingClientRect()
        return {
          top: Math.round(r.top),
          height: +r.height.toFixed(2),
          mediaW: +m.width.toFixed(2),
          mediaH: +m.height.toFixed(2),
        }
      })
      .filter((x): x is CardBox => x !== null)
  )
}

function byRow(boxes: CardBox[]): Map<number, CardBox[]> {
  const rows = new Map<number, CardBox[]>()
  for (const b of boxes) {
    if (!rows.has(b.top)) rows.set(b.top, [])
    rows.get(b.top)!.push(b)
  }
  return rows
}

for (const { w, h, cols } of WIDTHS) {
  test.describe(`grid at ${w}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/posters', { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="product-card"]')
    })

    test(`renders ${cols} columns`, async ({ page }) => {
      const rows = byRow(await cardBoxes(page))
      const widest = Math.max(...[...rows.values()].map((r) => r.length))
      expect(widest).toBe(cols)
    })

    test('every card in a row has an identical height', async ({ page }) => {
      const boxes = await cardBoxes(page)
      expect(boxes.length).toBeGreaterThan(0)
      for (const [top, row] of byRow(boxes)) {
        const heights = [...new Set(row.map((b) => b.height))]
        expect(heights, `row at y=${top} has heights ${heights.join(', ')}`).toHaveLength(1)
      }
    })

    test('every media box is square', async ({ page }) => {
      for (const b of await cardBoxes(page)) {
        expect(
          Math.abs(b.mediaW - b.mediaH),
          `media box ${b.mediaW}x${b.mediaH} is not square`
        ).toBeLessThanOrEqual(1)
      }
    })

    test('the grid does not scroll horizontally', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  })
}

test('home page featured grid does not shift as products resolve', async ({ page }) => {
  // Defect D3, and ticket #360's first acceptance criterion. The skeleton used
  // to reserve aspect-[2/3] while the card rendered aspect-[3/4].
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<{
        hadRecentInput: boolean
        value: number
      }>) {
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  expect(cls).toBeLessThan(0.1)
})

test.describe('hover', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // The multi-image fixture ("Wabi-Sabi Study", featuredOrder 0) leads the
    // home grid. The listing paginates it off page 1.
    await page.goto('/', { waitUntil: 'networkidle' })
    // 'attached', not the default 'visible': the dots are deliberately
    // invisible/opacity-0 until hover, so waiting for visibility never resolves.
    await page.waitForSelector('[data-testid="card-dots"]', { state: 'attached' })
  })

  test('swaps the image without moving the card', async ({ page }) => {
    const card = page
      .locator('[data-testid="product-card"]')
      .filter({ has: page.locator('[data-testid="card-dots"]') })
      .first()
    await card.scrollIntoViewIfNeeded()

    const before = await card.boundingBox()
    const box = (await card.locator('[data-testid="media-box"]').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 6 })
    await page.waitForTimeout(700)

    await expect(card.locator('img.absolute.opacity-100')).toHaveCount(1)
    expect(await card.boundingBox()).toEqual(before)
  })

  test('cursor position selects the slide, and resets on leave', async ({ page }) => {
    const card = page
      .locator('[data-testid="product-card"]')
      .filter({ has: page.locator('[data-testid="card-dots"]') })
      .first()
    await card.scrollIntoViewIfNeeded()
    const box = (await card.locator('[data-testid="media-box"]').boundingBox())!

    const activeIndex = () =>
      card.evaluate((el) =>
        [...el.querySelectorAll('img.absolute')].findIndex((i) =>
          i.className.includes('opacity-100')
        )
      )

    for (const [frac, expected] of [
      [0.15, 0],
      [0.5, 1],
      [0.9, 2],
    ] as Array<[number, number]>) {
      await page.mouse.move(box.x + box.width * frac, box.y + box.height * 0.5, { steps: 4 })
      await page.waitForTimeout(600)
      expect(await activeIndex(), `cursor at ${frac} should select slide ${expected}`).toBe(
        expected
      )
    }

    await page.mouse.move(5, 5)
    await page.waitForTimeout(700)
    expect(await activeIndex()).toBe(-1)
  })

  test('dots are visible on hover and not clipped by the rounded corners', async ({ page }) => {
    // Regression: the dots sit at bottom-[-14px], outside the image box. When
    // the overflow-hidden clip was on the link rather than an inner wrapper,
    // they were silently cut off.
    const card = page
      .locator('[data-testid="product-card"]')
      .filter({ has: page.locator('[data-testid="card-dots"]') })
      .first()
    await card.scrollIntoViewIfNeeded()
    const box = (await card.locator('[data-testid="media-box"]').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
    await page.waitForTimeout(700)

    const state = await card.evaluate((el) => {
      const dots = el.querySelector('[data-testid="card-dots"]')!
      const r = dots.getBoundingClientRect()
      let a = dots.parentElement
      let clipped = false
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflow === 'hidden') {
          clipped = true
          break
        }
        a = a.parentElement
      }
      return { visible: getComputedStyle(dots).visibility, w: r.width, h: r.height, clipped }
    })

    expect(state.clipped).toBe(false)
    expect(state.visible).toBe('visible')
    expect(state.w).toBeGreaterThan(0)
    expect(state.h).toBeGreaterThan(0)
  })

  test('renders n-1 dots — slide 0 is the rest state and gets none', async ({ page }) => {
    const dots = page.locator('[data-testid="card-dots"]').first()
    const slides = page
      .locator('[data-testid="product-card"]')
      .filter({ has: page.locator('[data-testid="card-dots"]') })
      .first()
      .locator('img.absolute')
    expect(await dots.locator('> *').count()).toBe(await slides.count())
  })
})

test('no hover affordances below md', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="product-card"]')
  await expect(page.locator('[data-testid="card-dots"]:visible')).toHaveCount(0)
  await expect(page.locator('[data-testid="quick-view"]:visible')).toHaveCount(0)
})
