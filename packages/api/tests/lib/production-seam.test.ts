/**
 * The label-readiness seam, guarded from both sides (#677).
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 *
 * `isOrderReadyToLabel` is the one function that crosses between
 * production-pipeline and order-dispatch-tracking. Two scans keep it that way,
 * in the same manifest-plus-scan shape as `database/raw-sql-objects.ts` and its
 * suite: the allow-list lives in `src/`, where a reviewer of the seam reads it,
 * and the scanning lives here.
 *
 *   forward   No file under `packages/api/src` calls `isOrderReadyToLabel(`
 *             unless the manifest admits it. A second consumer is a second
 *             place that has to agree about what "ready" means, which is the
 *             one thing a single shared predicate exists to prevent.
 *
 *   reverse   No file under `lib/production-*` imports anything named
 *             `shiprocket`. The forward scan stops dispatch's logic leaking
 *             into production; this stops production growing a courier. Either
 *             leak leaves the seam still *looking* like one function.
 *
 * ## Every scan here is proved able to fail
 *
 * A guard that cannot fail is worse than none, because it reads as coverage.
 * So both scanners are pure functions over a list of `{ path, contents }`, and
 * each is run twice: over the real tree, expecting nothing, and over a
 * synthetic corpus with a violation planted in it, expecting exactly that file
 * back. The negative case runs on every CI run, not once on the day it was
 * written.
 *
 * Both were also proved against the real tree by planting a violation on disk
 * and watching the scan below fail, before the probes were deleted:
 *
 *   src/routes/admin/__seam-probe.ts calling isOrderReadyToLabel(orderId)
 *     -> "finds no unauthorised caller" failed, naming routes/admin/__seam-probe.ts
 *   src/lib/production-probe.ts importing '../services/shiprocket'
 *     -> "finds no carrier import" failed, naming lib/production-probe.ts
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, resolve, sep } from 'path'

import {
  LABEL_READINESS_CONSUMERS,
  LABEL_READINESS_MODULE,
  PRODUCTION_LIB_FORBIDDEN_IMPORT,
  isAllowedReadinessConsumer,
  unauthorisedConsumerMessage,
  forbiddenCarrierImportMessage,
} from '../../src/lib/production-readiness'

const SRC_DIR = resolve(__dirname, '../../src')

/** The call token the forward scan looks for. A definition is not a call site. */
const GATE_CALL = 'isOrderReadyToLabel('

/** Everything under `lib/` whose name marks it as production-pipeline's. */
const PRODUCTION_LIB_PREFIX = 'lib/production-'

interface SourceFile {
  /** Relative to `packages/api/src`, with `/` separators on every platform. */
  path: string
  contents: string
}

function sourceFiles(dir: string = SRC_DIR, prefix = ''): SourceFile[] {
  const files: SourceFile[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      files.push(...sourceFiles(join(dir, entry.name), relative))
      continue
    }
    if (!entry.name.endsWith('.ts')) continue

    files.push({
      path: relative.split(sep).join('/'),
      contents: readFileSync(join(dir, entry.name), 'utf8'),
    })
  }

  return files
}

/**
 * Every import-ish statement in a file: static (single- and multi-line),
 * side-effect, dynamic, and `require`.
 *
 * Statements rather than whole files, so a module that *names* the forbidden
 * package in prose — `production-readiness.ts` has to, in the failure message —
 * is not reported for talking about it.
 */
function importStatements(contents: string): string[] {
  const patterns = [
    /(?:^|\n)[ \t]*import\s[\s\S]*?from\s*['"][^'"]+['"]/g,
    /(?:^|\n)[ \t]*import\s*['"][^'"]+['"]/g,
    /\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g,
    /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/g,
  ]

  return patterns.flatMap((pattern) => [...contents.matchAll(pattern)].map((m) => m[0]))
}

/** Files that call the gate but are not on the allow-list. */
function unauthorisedCallers(files: readonly SourceFile[]): string[] {
  return files
    .filter((file) => file.contents.includes(GATE_CALL))
    .map((file) => file.path)
    .filter((path) => !isAllowedReadinessConsumer(path))
}

/** Production modules that import the courier. */
function carrierImporters(files: readonly SourceFile[]): string[] {
  const forbidden = new RegExp(PRODUCTION_LIB_FORBIDDEN_IMPORT, 'i')

  return files
    .filter((file) => file.path.startsWith(PRODUCTION_LIB_PREFIX))
    .filter((file) => importStatements(file.contents).some((line) => forbidden.test(line)))
    .map((file) => file.path)
}

describe('the allow-list', () => {
  it('reads the real source tree at all', () => {
    const files = sourceFiles()

    // A scan over an empty list passes for the wrong reason. This is the
    // sanity check that the walk found the tree it thinks it did.
    expect(files.length).toBeGreaterThan(50)
    expect(files.map((f) => f.path)).toContain(LABEL_READINESS_MODULE)
  })

  it('admits the gate and the shipment library, and nothing else', () => {
    expect(isAllowedReadinessConsumer('routes/admin/shipments.ts')).toBe(true)
    expect(isAllowedReadinessConsumer('lib/shipment-create.ts')).toBe(true)
    // The defining module contains the definition, so it is admitted by name.
    expect(isAllowedReadinessConsumer(LABEL_READINESS_MODULE)).toBe(true)

    expect(isAllowedReadinessConsumer('routes/admin/orders.ts')).toBe(false)
    expect(isAllowedReadinessConsumer('routes/shipments.ts')).toBe(false)
    expect(isAllowedReadinessConsumer('services/notification.ts')).toBe(false)
    // A prefix entry must not admit an unrelated file that merely starts the
    // same way once the wildcard is stripped.
    expect(isAllowedReadinessConsumer('lib/shipping-config.ts')).toBe(false)
  })

  it('names files that exist, for every entry that is not forward-looking', () => {
    // A typo'd entry admits nothing while looking like it admits something,
    // which is the worst of both. Wildcards are exempt: `lib/shipment-*` is
    // deliberately written before order-dispatch-tracking creates the files.
    const paths = new Set(sourceFiles().map((f) => f.path))
    const missing = LABEL_READINESS_CONSUMERS.filter(
      (consumer) => !consumer.path.endsWith('*') && !paths.has(consumer.path)
    ).map((consumer) => consumer.path)

    expect(missing).toEqual([])
  })

  it('says why each consumer is admitted', () => {
    for (const consumer of LABEL_READINESS_CONSUMERS) {
      expect(consumer.owner.length).toBeGreaterThan(0)
      expect(consumer.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('forward scan: only the gate asks the gate question', () => {
  it('finds no unauthorised caller in packages/api/src', () => {
    const offenders = unauthorisedCallers(sourceFiles())

    expect(
      offenders,
      offenders.length === 0 ? '' : unauthorisedConsumerMessage(offenders)
    ).toEqual([])
  })

  it('CAN fail: it catches a caller planted outside the allow-list', () => {
    const offenders = unauthorisedCallers([
      { path: 'lib/production-readiness.ts', contents: 'export async function isOrderReadyToLabel(' },
      { path: 'routes/admin/shipments.ts', contents: 'await isOrderReadyToLabel(orderId, tx)' },
      { path: 'services/order-emails.ts', contents: 'if (await isOrderReadyToLabel(order.id)) {}' },
    ])

    expect(offenders).toEqual(['services/order-emails.ts'])
    expect(unauthorisedConsumerMessage(offenders)).toContain('services/order-emails.ts')
    expect(unauthorisedConsumerMessage(offenders)).toContain('LABEL_READINESS_CONSUMERS')
  })

  it('does not report a file that merely mentions the name without calling it', () => {
    const offenders = unauthorisedCallers([
      { path: 'routes/admin/orders.ts', contents: '// see isOrderReadyToLabel in lib/' },
    ])

    expect(offenders).toEqual([])
  })
})

describe('reverse scan: production never learns the courier', () => {
  it('finds no carrier import under lib/production-*', () => {
    const offenders = carrierImporters(sourceFiles())

    expect(
      offenders,
      offenders.length === 0 ? '' : forbiddenCarrierImportMessage(offenders)
    ).toEqual([])
  })

  it.each([
    ["import { createLabel } from '../services/shiprocket'", 'a static import'],
    ["import '../services/shiprocket'", 'a side-effect import'],
    ["const x = await import('../services/shiprocket')", 'a dynamic import'],
    ["const x = require('../services/shiprocket')", 'a require'],
    ["import { shiprocketClient } from '../services/carriers'", 'a named binding'],
    ["import {\n  createLabel,\n} from '../services/Shiprocket'", 'a multi-line import'],
  ])('CAN fail: it catches %s', (statement) => {
    const offenders = carrierImporters([
      { path: 'lib/production-transfers.ts', contents: statement },
    ])

    expect(offenders).toEqual(['lib/production-transfers.ts'])
    expect(forbiddenCarrierImportMessage(offenders)).toContain('lib/production-transfers.ts')
  })

  it('does not report a module that only names the courier in prose', () => {
    // `production-readiness.ts` has to say the word — it is the failure message.
    // A whole-file grep would report the guard for describing itself.
    const offenders = carrierImporters([
      {
        path: 'lib/production-readiness.ts',
        contents:
          "import { eq } from 'drizzle-orm'\n" +
          "export const PRODUCTION_LIB_FORBIDDEN_IMPORT = 'shiprocket'\n" +
          '// production must never import shiprocket\n',
      },
    ])

    expect(offenders).toEqual([])
  })

  it('does not police files outside lib/production-*', () => {
    // `routes/shipments.ts` legitimately talks to the carrier. The rule is
    // about which side of the seam the knowledge lives on, not about the word.
    const offenders = carrierImporters([
      { path: 'routes/shipments.ts', contents: "import { track } from '../services/shiprocket'" },
    ])

    expect(offenders).toEqual([])
  })
})
