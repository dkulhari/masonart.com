/**
 * Background workers startup.
 *
 * Two periodic sweeps existed for months and were never called by anything:
 * `startGiftCardDeliveryScheduler` and `startDeadlineChecker`. A scheduled
 * gift card was therefore paid for and never delivered (#573).
 *
 * The property under test is that the app starts them — not that the sweeps
 * themselves work, which their own suites cover against live Postgres. Both
 * service modules are mocked here so this suite needs no database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const startGiftCardDeliverySchedulerMock = vi.fn();
const startDeadlineCheckerMock = vi.fn();
const startQcPhotoRetentionWorkerMock = vi.fn();

vi.mock("../src/services/gift-card-delivery", () => ({
  startGiftCardDeliveryScheduler: (...args: unknown[]) =>
    startGiftCardDeliverySchedulerMock(...args),
}));

vi.mock("../src/services/approval-deadline", () => ({
  startDeadlineChecker: (...args: unknown[]) =>
    startDeadlineCheckerMock(...args),
}));

// Mocked for the same reason as the two above, and for one more: the real
// starter sweeps immediately, which would reach a live database and a live
// bucket from a suite that is only asking whether startup calls it.
vi.mock("../src/queues/qc-photo-retention", () => ({
  startQcPhotoRetentionWorker: (...args: unknown[]) =>
    startQcPhotoRetentionWorkerMock(...args),
}));

let startBackgroundWorkers: typeof import("../src/background").startBackgroundWorkers;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.DISABLE_BACKGROUND_WORKERS;

  startGiftCardDeliverySchedulerMock.mockReturnValue(
    setTimeout(() => {}, 1_000_000) as unknown as NodeJS.Timeout,
  );
  startDeadlineCheckerMock.mockReturnValue({ stop: vi.fn() });
  startQcPhotoRetentionWorkerMock.mockReturnValue({ stop: vi.fn() });

  ({ startBackgroundWorkers } = await import("../src/background"));
});

afterEach(() => {
  // The fake handles are real timers; leaving them pinned would hold the
  // process open for the whole suite run.
  const handle = startGiftCardDeliverySchedulerMock.mock.results[0]?.value;
  if (handle) clearTimeout(handle as NodeJS.Timeout);
  delete process.env.DISABLE_BACKGROUND_WORKERS;
});

describe("startBackgroundWorkers", () => {
  it("starts the gift card delivery sweep", () => {
    const workers = startBackgroundWorkers();

    expect(startGiftCardDeliverySchedulerMock).toHaveBeenCalledTimes(1);

    workers.stop();
  });

  it("starts the approval deadline checker in the same place", () => {
    const workers = startBackgroundWorkers();

    expect(startDeadlineCheckerMock).toHaveBeenCalledTimes(1);

    workers.stop();
  });

  it("starts the QC photo retention sweep", () => {
    // #697. Unstarted, QC photographs accumulate in R2 forever and the rows
    // that name them get cascaded away by unrelated job deletions.
    const workers = startBackgroundWorkers();

    expect(startQcPhotoRetentionWorkerMock).toHaveBeenCalledTimes(1);

    workers.stop();
  });

  it("stops the QC photo retention sweep too", () => {
    const qcStop = vi.fn();
    startQcPhotoRetentionWorkerMock.mockReturnValue({ stop: qcStop });

    const workers = startBackgroundWorkers();
    workers.stop();

    expect(qcStop).toHaveBeenCalledTimes(1);
  });

  it("stops everything it started", () => {
    const deadlineStop = vi.fn();
    startDeadlineCheckerMock.mockReturnValue({ stop: deadlineStop });
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const workers = startBackgroundWorkers();
    workers.stop();

    expect(deadlineStop).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it("is idempotent, so a double stop cannot throw during shutdown", () => {
    const deadlineStop = vi.fn();
    startDeadlineCheckerMock.mockReturnValue({ stop: deadlineStop });

    const workers = startBackgroundWorkers();
    workers.stop();
    workers.stop();

    expect(deadlineStop).toHaveBeenCalledTimes(1);
  });

  it("starts nothing when DISABLE_BACKGROUND_WORKERS is set", () => {
    // A second API instance can opt out. Two instances sweeping concurrently
    // is safe — the unique constraint on gift_card.purchase_order_id settles
    // the race — but the polling doubles, so the opt-out is deliberate.
    process.env.DISABLE_BACKGROUND_WORKERS = "true";

    const workers = startBackgroundWorkers();

    expect(startGiftCardDeliverySchedulerMock).not.toHaveBeenCalled();
    expect(startDeadlineCheckerMock).not.toHaveBeenCalled();
    expect(startQcPhotoRetentionWorkerMock).not.toHaveBeenCalled();

    workers.stop();
  });
});

describe("the app wires the workers up", () => {
  // The startup block in src/index.ts is guarded by NODE_ENV !== "test", so
  // importing it here proves nothing. Read the source instead: the whole
  // point of #573 is that an exported starter nobody calls is not started.
  const indexSource = readFileSync(
    join(__dirname, "../src/index.ts"),
    "utf-8",
  );

  it("calls startBackgroundWorkers from src/index.ts", () => {
    expect(indexSource).toMatch(/startBackgroundWorkers\(\)/);
  });

  it("stops them on shutdown", () => {
    expect(indexSource).toMatch(/backgroundWorkers\??\.stop\(\)/);
  });
});
