/**
 * The label and the pickup (#727).
 *
 * `generateLabel` asks Shiprocket to render the shipping label and comes back
 * with the PDF's BYTES; `schedulePickup` asks a courier to collect. The first is
 * billable and the second is not, and that difference is what this file is
 * about: a label generated twice is charged twice, so the client must send
 * nothing when the caller already holds one, while a pickup asked for twice is
 * answered "already in the queue" and costs nobody anything.
 *
 * ## Nothing in this file may reach apiv2.shiprocket.in
 *
 * The same three overlapping mechanisms as `shiprocket-courier-writes.test.ts`:
 * `fetch` is a `vi.fn()`, the base URL points at the reserved `.invalid` host,
 * and every URL the stub is handed is recorded and checked at the end — by a
 * block that makes its own traffic first, so the check cannot pass on an empty
 * list. The label file lives on a `.invalid` host too, because that URL is a
 * second request the client makes on its own.
 *
 * ## The three properties the ticket names
 *
 * - a label URL fetched and returned as BYTES, never as the URL;
 * - a second call short-circuiting when `label_object_token` is already held;
 * - a pickup failure leaving the label intact.
 *
 * ## Why the URL is the thing this file guards
 *
 * A label URL is a customer's name and address behind a link, which is exactly
 * what `routes/vendor.ts` refuses to leak. So the URL never appears in a result,
 * an error message or a log line, and the PDF is fetched from it WITHOUT our
 * bearer token: the file is on a third-party host, and a token sent there is a
 * credential handed to whoever runs it.
 *
 * @see packages/api/src/services/shiprocket.ts
 * @see plan/tracker-data/tickets/ticket-0727-shiprocket-client-fetch-the-la.yaml
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
  REDACTED_LOG_PATHS: [],
}));

import {
  generateLabel,
  schedulePickup,
  LABEL_PDF_MAX_BYTES,
  SHIPROCKET_REFUSAL_STATUS,
  ShiprocketError,
  ShiprocketLabelFetchFailedError,
  ShiprocketLabelRefusedError,
  ShiprocketPickupNotScheduledError,
  ShiprocketWriteOutcomeUnknownError,
  resetShiprocketAuthCacheForTests,
} from '../../src/services/shiprocket';

// ============================================================================
// Fixtures — transcribed from Shiprocket's documented shapes, never measured
// ============================================================================

const SR_SHIPMENT_ID = '912345678';

/**
 * Where the fixture label lives. A `.invalid` host, because the client fetches
 * this URL itself and the recorder below must stay clean.
 */
const LABEL_URL = 'https://labels.shiprocket.invalid/label/912345678.pdf';

/** A token the caller might already hold on `order_shipments.label_object_token`. */
const HELD_TOKEN = '7f0c2a6e-1d3b-4c5a-9e8f-2b1a0c9d8e7f';

/** The smallest thing that is unmistakably a PDF: the signature, then anything. */
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function labelGeneratedResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        label_created: 1,
        label_url: LABEL_URL,
        response: 'Label generated successfully',
        not_created: [],
        ...over,
      }),
  } as unknown as Response;
}

function pickupScheduledResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        pickup_status: 1,
        response: {
          pickup_scheduled_date: '2026-09-04 14:00:00',
          pickup_token_number: 'PKP-20260904-0042',
          status: 1,
          others: '',
          data: 'Pickup scheduled successfully.',
          ...over,
        },
      }),
  } as unknown as Response;
}

function refusedResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** The label host answering with a file. */
function fileResponse(
  bytes: Uint8Array,
  over: { status?: number; ok?: boolean; contentLength?: string } = {}
) {
  return {
    ok: over.ok ?? true,
    status: over.status ?? 200,
    headers: new Headers(
      over.contentLength === undefined ? {} : { 'content-length': over.contentLength }
    ),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

function authResponse() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60 })
  ).toString('base64url');
  return {
    ok: true,
    status: 200,
    json: async () => ({ token: `${header}.${payload}.sig` }),
  } as unknown as Response;
}

/** Every URL the stub has been handed since the file started. Never reset. */
const EVERY_URL: string[] = [];

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * Login always answers; the label host and the API are the test's to decide.
 * The handler sees the `init` too, because two properties here are about the
 * headers the client did NOT send.
 */
function stubFetch(handler: (url: string, init: RequestInit | undefined) => Promise<Response>) {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    EVERY_URL.push(String(url));
    if (String(url).includes('/auth/login')) return authResponse();
    return handler(String(url), init);
  });
}

/** The ordinary happy path: a label is generated, and its file arrives. */
function stubLabelHappyPath() {
  stubFetch(async (url) => {
    if (url.includes('courier/generate/label')) return labelGeneratedResponse();
    if (url === LABEL_URL) return fileResponse(PDF_BYTES);
    if (url.includes('courier/generate/pickup')) return pickupScheduledResponse();
    throw new Error(`unexpected request to ${url}`);
  });
}

const callsTo = (fragment: string) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes(fragment));

const initOf = (fragment: string, nth = 0): RequestInit | undefined =>
  callsTo(fragment)[nth]?.[1] as RequestInit | undefined;

/** Everything the logger was handed, flattened, so a leak is one `toContain`. */
function loggedText(): string {
  return JSON.stringify([
    ...loggerMock.error.mock.calls,
    ...loggerMock.warn.mock.calls,
    ...loggerMock.info.mock.calls,
    ...loggerMock.debug.mock.calls,
  ]);
}

async function failureOf(run: () => Promise<unknown>): Promise<Error> {
  const error = await run()
    .then(() => null)
    .catch((e: Error) => e);
  expect(error, 'the call did not fail').not.toBeNull();
  return error!;
}

beforeEach(() => {
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.info.mockReset();
  loggerMock.debug.mockReset();
  resetShiprocketAuthCacheForTests();
  process.env.SHIPROCKET_EMAIL = 'api-user@example.test';
  process.env.SHIPROCKET_PASSWORD = 'irrelevant-here';
  process.env.SHIPROCKET_BASE_URL = 'https://shiprocket.invalid/v1/external';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SHIPROCKET_EMAIL;
  delete process.env.SHIPROCKET_PASSWORD;
  delete process.env.SHIPROCKET_BASE_URL;
});

// ============================================================================
// generateLabel — the bytes, and the URL that never leaves
// ============================================================================

describe('generateLabel', () => {
  it('returns the PDF as bytes, fetched from the URL Shiprocket answered with', async () => {
    stubLabelHappyPath();

    const result = await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });

    expect(result.generated).toBe(true);
    if (!result.generated) throw new Error('unreachable');
    expect(result.pdf).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(result.pdf).equals(Buffer.from(PDF_BYTES))).toBe(true);
  });

  it('posts to courier/generate/label with the bearer token and the shipment id', async () => {
    stubLabelHappyPath();

    await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });

    const init = initOf('courier/generate/label');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
    // Their documented shape: an ARRAY of shipment ids, even for one.
    expect(JSON.parse(String(init?.body))).toEqual({ shipment_id: [Number(SR_SHIPMENT_ID)] });
  });

  it('fetches the file WITHOUT the bearer token', async () => {
    // The label URL is on a third-party file host. A token sent there is a
    // credential handed to whoever runs it, and it buys nothing: the URL is
    // already signed.
    stubLabelHappyPath();

    await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });

    const init = initOf(LABEL_URL);
    expect(callsTo(LABEL_URL)).toHaveLength(1);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('never puts the label URL in the result, the error, or the log', async () => {
    stubLabelHappyPath();
    const result = await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });
    expect(JSON.stringify(result)).not.toContain(LABEL_URL);
    expect(JSON.stringify(result)).not.toContain('labels.shiprocket.invalid');

    // ...and on the path where the URL is the thing that went wrong.
    stubFetch(async (url) => {
      if (url.includes('courier/generate/label')) return labelGeneratedResponse();
      throw new TypeError(`fetch failed: ${url}`);
    });
    const error = await failureOf(() =>
      generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
    );

    expect(error.message).not.toContain(LABEL_URL);
    expect(error.message).not.toContain('labels.shiprocket.invalid');
    expect(loggedText()).not.toContain(LABEL_URL);
    expect(loggedText()).not.toContain('labels.shiprocket.invalid');
  });

  describe('a label already held is never bought again', () => {
    it('sends NOTHING when the caller already holds a label token', async () => {
      stubLabelHappyPath();

      const result = await generateLabel({
        shipmentId: SR_SHIPMENT_ID,
        heldLabelObjectToken: HELD_TOKEN,
      });

      expect(result).toEqual({ generated: false, labelObjectToken: HELD_TOKEN });
      // Not the label, not the file, and not even the login.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('the control: with no held token, the label IS requested', async () => {
      stubLabelHappyPath();

      await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });

      expect(callsTo('courier/generate/label')).toHaveLength(1);
    });

    it('a blank token is no token', async () => {
      stubLabelHappyPath();

      const result = await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: '  ' });

      expect(result.generated).toBe(true);
      expect(callsTo('courier/generate/label')).toHaveLength(1);
    });

    it('two overlapping calls for one shipment share ONE label request', async () => {
      stubLabelHappyPath();

      const [a, b] = await Promise.all([
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null }),
        generateLabel({ shipmentId: ` ${SR_SHIPMENT_ID} `, heldLabelObjectToken: null }),
      ]);

      expect(callsTo('courier/generate/label')).toHaveLength(1);
      expect(callsTo(LABEL_URL)).toHaveLength(1);
      expect(a.generated && b.generated).toBe(true);
    });

    it('releases the join when the leader settles, so the next call is a new request', async () => {
      stubLabelHappyPath();

      await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });
      await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });

      // Two SEQUENTIAL calls with no held token are two requests: the join
      // covers overlap only. Holding the promise would be a cache of a
      // billable write, and the held-token argument is what stops the second
      // purchase, not this map.
      expect(callsTo('courier/generate/label')).toHaveLength(2);
    });
  });

  describe('before the network', () => {
    it('refuses a blank shipment id without sending anything', async () => {
      stubLabelHappyPath();

      const error = await failureOf(() =>
        generateLabel({ shipmentId: '   ', heldLabelObjectToken: null })
      );

      expect((error as ShiprocketError).code).toBe('SHIPROCKET_SHIPMENT_ID_MISSING');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('a refused label request', () => {
    it('a 5xx is an unknown outcome — the label may have been billed', async () => {
      stubFetch(async () => refusedResponse(502, { message: 'Bad Gateway' }));

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
      expect(SHIPROCKET_REFUSAL_STATUS[(error as ShiprocketError).code]).toBe(409);
    });

    it('a 401 drops the token, and the next call logs in again', async () => {
      stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );
      expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');

      stubLabelHappyPath();
      await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });
      expect(callsTo('/auth/login')).toHaveLength(2);
    });

    it('a 4xx that decided against the label is safe to correct and ask again', async () => {
      stubFetch(async () => refusedResponse(400, { message: 'Bad Request' }));

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketLabelRefusedError);
      expect((error as ShiprocketError).code).toBe('SHIPROCKET_LABEL_REFUSED');
      expect(SHIPROCKET_REFUSAL_STATUS.SHIPROCKET_LABEL_REFUSED).toBe(422);
    });

    it('a request that never answers is an unknown outcome, not a refusal', async () => {
      stubFetch(async () => {
        throw new Error('socket hang up');
      });

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    });
  });

  describe('an accepted answer that made no label, or one we cannot use', () => {
    it('`label_created: 0` is a definite refusal', async () => {
      stubFetch(async () =>
        labelGeneratedResponse({ label_created: 0, label_url: '', not_created: [SR_SHIPMENT_ID] })
      );

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketLabelRefusedError);
      expect(callsTo(LABEL_URL)).toHaveLength(0);
    });

    it('a label they say exists but gave no URL for is an unknown outcome', async () => {
      stubFetch(async () => labelGeneratedResponse({ label_url: '' }));

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
      expect(error.message).toContain('do not ask for another');
    });

    it('a label URL that is not https is an unknown outcome, and is not fetched', async () => {
      stubFetch(async () =>
        labelGeneratedResponse({ label_url: 'http://labels.shiprocket.invalid/plain.pdf' })
      );

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
      expect(callsTo('plain.pdf')).toHaveLength(0);
      expect(error.message).not.toContain('plain.pdf');
    });

    it('admits plain http to the loopback address only — the E2E stub, and nothing on a network', async () => {
      const bytes = PDF_BYTES
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) {
          return labelGeneratedResponse({ label_url: 'http://127.0.0.1:4977/labels/912345678.pdf' })
        }
        if (url === 'http://127.0.0.1:4977/labels/912345678.pdf') return fileResponse(bytes)
        throw new Error(`unexpected request to ${url}`)
      })

      const result = await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })

      expect(result.generated).toBe(true)
      expect(callsTo('127.0.0.1:4977/labels')).toHaveLength(1)

      // ...and `localhost` is a hostname, not the loopback address.
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) {
          return labelGeneratedResponse({ label_url: 'http://localhost:4977/labels/x.pdf' })
        }
        throw new Error(`unexpected request to ${url}`)
      })
      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      )
      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError)
      expect(callsTo('localhost:4977')).toHaveLength(0)
    })

    it('an HTTP 200 that is not our body at all is an unknown outcome', async () => {
      stubFetch(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => '<html><body>502 Bad Gateway</body></html>',
          }) as unknown as Response
      );

      const error = await failureOf(() =>
        generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
      );

      expect(error).toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
    });
  });

  describe('the file, once the label exists', () => {
    // Every failure here is `SHIPROCKET_LABEL_FETCH_FAILED`, and every message
    // says the label EXISTS: the purchase happened, the download did not, and a
    // caller that read this as "no label" would buy a second one.
    const fetchFailed = async (error: Error) => {
      expect(error).toBeInstanceOf(ShiprocketLabelFetchFailedError);
      expect((error as ShiprocketError).code).toBe('SHIPROCKET_LABEL_FETCH_FAILED');
      expect(error.message).toContain('EXISTS');
      expect(SHIPROCKET_REFUSAL_STATUS.SHIPROCKET_LABEL_FETCH_FAILED).toBe(502);
    };

    it('a host that never answers', async () => {
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        throw new Error('socket hang up');
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
    });

    it('a host that refuses', async () => {
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        return fileResponse(new Uint8Array(), { ok: false, status: 403 });
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
    });

    it('a file that is not a PDF', async () => {
      // A signed URL that has expired answers 200 with an XML error document
      // on some hosts. Storing that under `fulfilment/labels/<token>.pdf` is a
      // label nobody can print and a token that says one exists.
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        return fileResponse(new TextEncoder().encode('<?xml version="1.0"?><Error/>'));
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
    });

    it('a file larger than LABEL_PDF_MAX_BYTES, refused on the header before it is read', async () => {
      const arrayBuffer = vi.fn(async () => PDF_BYTES.buffer);
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': String(LABEL_PDF_MAX_BYTES + 1) }),
          arrayBuffer,
        } as unknown as Response;
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
      expect(arrayBuffer).not.toHaveBeenCalled();
    });

    it('a file larger than LABEL_PDF_MAX_BYTES with no header, refused once read', async () => {
      const big = new Uint8Array(LABEL_PDF_MAX_BYTES + 1);
      big.set(new TextEncoder().encode('%PDF-1.4'), 0);
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        return fileResponse(big);
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
    });

    it('a body that stops arriving', async () => {
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
          },
        } as unknown as Response;
      });

      await fetchFailed(
        await failureOf(() =>
          generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null })
        )
      );
    });
  });
});

// ============================================================================
// schedulePickup — a write that mints nothing, so every refusal is retryable
// ============================================================================

describe('schedulePickup', () => {
  it('posts to courier/generate/pickup and returns the schedule', async () => {
    stubLabelHappyPath();

    const result = await schedulePickup({ shipmentId: SR_SHIPMENT_ID });

    expect(result).toEqual({
      scheduledFor: '2026-09-04 14:00:00',
      tokenNumber: 'PKP-20260904-0042',
      alreadyScheduled: false,
    });
    const init = initOf('courier/generate/pickup');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ shipment_id: [Number(SR_SHIPMENT_ID)] });
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer .+/);
  });

  it('reads "already in pickup queue" as scheduled, not as a refusal', async () => {
    // Asking twice is the ordinary shape of a retry after a pickup request
    // that did not answer. Their 400 for it is a fact about the queue, and it
    // is the fact the caller wanted.
    stubFetch(async () =>
      refusedResponse(400, {
        message: 'Already in Pickup Queue. Pickup Scheduled Date: 2026-09-04 14:00:00',
        status_code: 400,
      })
    );

    const result = await schedulePickup({ shipmentId: SR_SHIPMENT_ID });

    expect(result.alreadyScheduled).toBe(true);
    expect(result.scheduledFor).toBe('2026-09-04 14:00:00');
  });

  it('a pickup Shiprocket would not schedule is a RETRYABLE refusal', async () => {
    stubFetch(async () => refusedResponse(400, { message: 'No pickup slots available today' }));

    const error = await failureOf(() => schedulePickup({ shipmentId: SR_SHIPMENT_ID }));

    expect(error).toBeInstanceOf(ShiprocketPickupNotScheduledError);
    expect((error as ShiprocketPickupNotScheduledError).retryable).toBe(true);
    expect((error as ShiprocketError).code).toBe('SHIPROCKET_PICKUP_NOT_SCHEDULED');
    expect(SHIPROCKET_REFUSAL_STATUS.SHIPROCKET_PICKUP_NOT_SCHEDULED).toBe(503);
  });

  it('a pickup request that never answers is retryable too — asking again is harmless', async () => {
    stubFetch(async () => {
      throw new Error('socket hang up');
    });

    const error = await failureOf(() => schedulePickup({ shipmentId: SR_SHIPMENT_ID }));

    expect(error).toBeInstanceOf(ShiprocketPickupNotScheduledError);
    expect(error).not.toBeInstanceOf(ShiprocketWriteOutcomeUnknownError);
  });

  it('an accepted answer that scheduled nothing is retryable', async () => {
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ pickup_status: 0, response: 'No slot' }),
        }) as unknown as Response
    );

    const error = await failureOf(() => schedulePickup({ shipmentId: SR_SHIPMENT_ID }));

    expect(error).toBeInstanceOf(ShiprocketPickupNotScheduledError);
  });

  it('a dead token is the credential refusal, not a pickup one', async () => {
    stubFetch(async () => refusedResponse(401, { message: 'Unauthorized' }));

    const error = await failureOf(() => schedulePickup({ shipmentId: SR_SHIPMENT_ID }));

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_AUTH_EXPIRED');
  });

  it('refuses a blank shipment id without sending anything', async () => {
    stubLabelHappyPath();

    const error = await failureOf(() => schedulePickup({ shipmentId: '' }));

    expect((error as ShiprocketError).code).toBe('SHIPROCKET_SHIPMENT_ID_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('two overlapping pickup requests for one shipment share ONE request', async () => {
    stubLabelHappyPath();

    await Promise.all([
      schedulePickup({ shipmentId: SR_SHIPMENT_ID }),
      schedulePickup({ shipmentId: SR_SHIPMENT_ID }),
    ]);

    expect(callsTo('courier/generate/pickup')).toHaveLength(1);
  });

  describe('a pickup failure leaves the label intact', () => {
    // The ticket's third property. Within this client "intact" means: the
    // label result the caller already holds is untouched, no request that
    // could void or cancel anything was made, and the refusal's remedy is a
    // retry — never a void. Storage of the label is phase 7's, and phase 7
    // reads `retryable` to decide what to do with the parcel.
    it('a failed pickup after a generated label makes no cancelling request and asks for a retry', async () => {
      stubFetch(async (url) => {
        if (url.includes('courier/generate/label')) return labelGeneratedResponse();
        if (url === LABEL_URL) return fileResponse(PDF_BYTES);
        if (url.includes('courier/generate/pickup')) {
          return refusedResponse(400, { message: 'No pickup slots available today' });
        }
        throw new Error(`unexpected request to ${url}`);
      });

      const label = await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });
      const error = await failureOf(() => schedulePickup({ shipmentId: SR_SHIPMENT_ID }));

      expect(label.generated).toBe(true);
      expect(error).toBeInstanceOf(ShiprocketPickupNotScheduledError);
      expect((error as ShiprocketPickupNotScheduledError).retryable).toBe(true);
      expect(error.message).toMatch(/label/i);
      expect(error.message).not.toMatch(/void|cancel/i);

      const paths = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(paths.filter((p) => /cancel|void/i.test(p))).toEqual([]);
      expect(paths.filter((p) => p.includes('courier/generate/label'))).toHaveLength(1);
    });
  });
});

// ============================================================================
// The guard, proved able to fail
// ============================================================================

describe('nothing in this file reached the live courier', () => {
  function liveCourierUrls(urls: readonly string[]): string[] {
    return urls.filter((url) => url.includes('apiv2.shiprocket.in') || url.includes('shiprocket.in/'));
  }

  it('addressed only reserved .invalid hosts', () => {
    const live = liveCourierUrls(EVERY_URL);
    expect(live, `live Shiprocket calls: ${live.join(', ')}`).toEqual([]);
  });

  it('is not vacuous: this block drives both writes and inspects the recorder', async () => {
    const before = EVERY_URL.length;
    stubLabelHappyPath();

    await generateLabel({ shipmentId: SR_SHIPMENT_ID, heldLabelObjectToken: null });
    await schedulePickup({ shipmentId: SR_SHIPMENT_ID });

    const mine = EVERY_URL.slice(before);
    expect(mine.some((url) => url.includes('courier/generate/label'))).toBe(true);
    expect(mine.some((url) => url === LABEL_URL)).toBe(true);
    expect(mine.some((url) => url.includes('courier/generate/pickup'))).toBe(true);
    expect(mine.every((url) => url.includes('.invalid'))).toBe(true);
    expect(liveCourierUrls(mine)).toEqual([]);
  });

  it('CAN fail: the same predicate catches a live URL planted in a corpus', () => {
    expect(
      liveCourierUrls([
        'https://shiprocket.invalid/v1/external/courier/generate/label',
        'https://apiv2.shiprocket.in/v1/external/courier/generate/label',
      ])
    ).toEqual(['https://apiv2.shiprocket.in/v1/external/courier/generate/label']);
  });
});
