/**
 * A Shiprocket that buys nothing (#736).
 *
 * The E2E for dispatch has to drive the real route, the real transaction, the
 * real database and the real tracking page — and must never place a real
 * courier order, mint a real waybill or bill a real label. So the courier is
 * stubbed at the ONE boundary where stubbing is honest: the network. This
 * process answers the handful of Shiprocket calls `services/shiprocket.ts`
 * makes, in the documented shapes the client's own fixtures are transcribed
 * from, and the API is pointed at it with `SHIPROCKET_BASE_URL`.
 *
 * It also keeps a ledger of every call so a spec can assert that a Ship click
 * created ONE order, assigned ONE waybill and generated ONE label — the
 * double-buy the whole feature exists to prevent is a count, not a status.
 *
 * Started by `playwright.config.ts` as a web server; run by hand with
 *   bun scripts/e2e/shiprocket-stub.ts
 * and point the API at it with
 *   SHIPROCKET_BASE_URL=http://127.0.0.1:4977/v1/external
 *   SHIPROCKET_EMAIL=stub@example.test SHIPROCKET_PASSWORD=stub
 *
 * Nothing here is a real credential, and the label it serves is nine bytes
 * of PDF signature.
 */

const PORT = Number(process.env.SHIPROCKET_STUB_PORT ?? 4977)
const PREFIX = '/v1/external'

/** Every call, in order: method, path, and the JSON body if any. */
const calls: Array<{ method: string; path: string; body: unknown }> = []

let nextOrderId = 900_000_000
let nextShipmentId = 950_000_000

/** A token shaped enough for `readExpiry`: three parts, a JSON payload with `exp`. */
function token(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60 })
  ).toString('base64url')
  return `${header}.${payload}.stub`
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const PDF = new TextEncoder().encode('%PDF-1.4\n% chobii e2e stub label\n%%EOF\n')

async function readBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text()
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const body = req.method === 'POST' ? await readBody(req) : null

    if (path === '/health') return json({ ok: true, calls: calls.length })

    // The ledger, for the spec. `?reset=1` clears it between runs.
    if (path === '/__calls') {
      if (url.searchParams.get('reset') === '1') calls.length = 0
      return json({ calls })
    }

    if (path.startsWith('/labels/') && req.method === 'GET') {
      calls.push({ method: req.method, path, body: null })
      return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } })
    }

    if (!path.startsWith(PREFIX)) return json({ message: 'not a shiprocket path' }, 404)
    const route = `${req.method} ${path.slice(PREFIX.length)}`
    calls.push({ method: req.method, path: path.slice(PREFIX.length), body })

    switch (route) {
      case 'POST /auth/login':
        return json({ token: token() })

      case 'GET /courier/serviceability/':
        return json({
          status: 200,
          data: {
            available_courier_companies: [
              {
                courier_company_id: 51,
                courier_name: 'Delhivery Surface (stub)',
                rate: 153.15,
                etd: 'Sep 05, 2026',
                cod: 1,
                blocked: 0,
              },
            ],
          },
        })

      case 'POST /orders/create/adhoc':
        return json({
          order_id: nextOrderId++,
          shipment_id: nextShipmentId++,
          status: 'NEW',
          status_code: 1,
          onboarding_completed_now: 0,
          awb_code: '',
          courier_company_id: '',
          courier_name: '',
        })

      case 'POST /courier/assign/awb': {
        const shipmentId = (body as { shipment_id?: unknown } | null)?.shipment_id
        return json({
          awb_assign_status: 1,
          response: {
            data: {
              courier_company_id: 51,
              courier_name: 'Delhivery Surface (stub)',
              awb_code: `E2E${String(shipmentId ?? Date.now())}`,
              shipment_id: shipmentId,
              order_id: nextOrderId - 1,
            },
          },
        })
      }

      case 'POST /courier/generate/label': {
        const ids = (body as { shipment_id?: unknown[] } | null)?.shipment_id ?? []
        const first = Array.isArray(ids) ? ids[0] : ids
        return json({
          label_created: 1,
          // Plain http to loopback: the client admits it for 127.0.0.1 only.
          label_url: `http://127.0.0.1:${PORT}/labels/${String(first ?? 'label')}.pdf`,
          response: 'Label generated successfully',
          not_created: [],
        })
      }

      case 'POST /courier/generate/pickup':
        return json({
          pickup_status: 1,
          response: {
            pickup_scheduled_date: '2026-09-05 14:00:00',
            pickup_token_number: 'PKP-STUB-0001',
            status: 1,
            others: '',
            data: 'Pickup scheduled successfully.',
          },
        })

      case 'POST /orders/cancel/shipment/awbs':
        return json({ message: 'Shipment(s) cancelled successfully' })

      default:
        return json({ message: `stub has no answer for ${route}` }, 404)
    }
  },
})

console.log(`shiprocket stub listening on http://127.0.0.1:${PORT}${PREFIX} (ledger at /__calls)`)
