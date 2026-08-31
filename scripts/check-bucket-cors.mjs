#!/usr/bin/env node
/**
 * Does the object store allow a browser GET from the app's origin?
 *
 * The vendor portal displays QC photographs by FETCHING the bytes and rendering
 * them from a local `blob:` URL, rather than putting a presigned URL in an
 * `<img src>`. That is not a style choice: R2 of the customer-data rule forbids
 * a signed URL being parked in the portal's DOM, and
 * `packages/web/tests/routes/vendor/no-customer-data.test.tsx` bans
 * `X-Amz-Signature` from that screen's markup.
 *
 * The consequence is a runtime dependency no unit test can see. The presigned
 * PUT already needs CORS, so UPLOAD works and looks healthy. The GET is new. If
 * the bucket allows only PUT, every photo slot renders "could not be shown"
 * while nothing else looks wrong — and photo QC is what gates the shipping
 * label, so a vendor cannot prove they did the work.
 *
 * 149 vendor tests pass against a mocked store. This script is the only thing
 * that asks the real one.
 *
 * Usage:  node scripts/check-bucket-cors.mjs [origin]
 * Reads R2_ENDPOINT / R2_BUCKET from the environment.
 */

const endpoint = process.env.R2_ENDPOINT
const bucket = process.env.R2_BUCKET || 'poster-app-dev'
const origin = process.argv[2] || process.env.FRONTEND_URL || 'http://localhost:4321'

if (!endpoint) {
  console.error('R2_ENDPOINT is not set. Nothing to check.')
  process.exit(2)
}

const url = `${endpoint.replace(/\/$/, '')}/${bucket}/production-qc/.cors-probe`

/** A preflight is what the browser sends before a cross-origin fetch. */
const preflight = await fetch(url, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'GET',
  },
}).catch((err) => ({ error: err }))

if (preflight.error) {
  console.error(`Could not reach ${endpoint} — ${preflight.error.message}`)
  process.exit(2)
}

const allowOrigin = preflight.headers?.get('access-control-allow-origin')
const allowMethods = preflight.headers?.get('access-control-allow-methods') ?? ''

const originOk = allowOrigin === '*' || allowOrigin === origin
const getOk = allowMethods.toUpperCase().includes('GET')

console.log(`endpoint            ${endpoint}`)
console.log(`bucket              ${bucket}`)
console.log(`origin asked for    ${origin}`)
console.log(`allow-origin        ${allowOrigin ?? '(absent)'}`)
console.log(`allow-methods       ${allowMethods || '(absent)'}`)
console.log('')

/**
 * A store that echoes back whatever Origin it is sent is effectively `*`, and a
 * pass against it proves nothing about a real policy. Dev MinIO does this, so
 * this script is green locally no matter what — it only has teeth against the
 * production bucket. Say so rather than imply otherwise.
 */
const probe = await fetch(url, {
  method: 'OPTIONS',
  headers: { Origin: 'https://cors-probe.invalid', 'Access-Control-Request-Method': 'GET' },
}).catch(() => null)
const echoesAnything = probe?.headers?.get('access-control-allow-origin') === 'https://cors-probe.invalid'

if (originOk && getOk) {
  if (echoesAnything) {
    console.log('INCONCLUSIVE — this store echoes back any Origin it is sent, so it is')
    console.log('effectively a wildcard and this check cannot fail against it. That is')
    console.log('normal for dev MinIO. Run this against the PRODUCTION bucket; a pass')
    console.log('here says nothing about R2.')
    process.exit(0)
  }
  console.log('OK — a browser on this origin may GET an object. QC photographs will display.')
  process.exit(0)
}

console.error('FAIL — the vendor portal will not be able to display QC photographs.')
if (!originOk) console.error(`  The origin ${origin} is not allowed.`)
if (!getOk) console.error('  GET is not in the allowed methods. Upload will still work, which is why this hides.')
console.error('')
console.error('Fix the bucket CORS policy, not the application. See docs/OPERATIONS.md §3c.')
process.exit(1)
