/**
 * Actions `AUDIT_ACTIONS` declares that nothing under `packages/api/src` writes (#671)
 *
 * The registry's type safety runs one way. A call site that misspells an action
 * fails typecheck against `AuditAction`; an action declared with no call site at
 * all is invisible, because there is nothing to check it against. Ten of the
 * declared actions were dead when this was written, and the only symptom was
 * that the viewer's action filter offered them and returned nothing — which
 * reads as "never happened", not as "never recorded".
 *
 * `audit-action-coverage.test.ts` closes that direction: it scans every source
 * file under `packages/api/src` for each declared action and fails on the ones
 * no file writes. This is the escape hatch for the cases where that is the
 * correct state of the world, and it is deliberately a manifest rather than a
 * count, on the same principle as `src/database/raw-sql-objects.ts` (#663) — a
 * test that asserts "at most N failures" tells you nothing about which N.
 *
 * ## What this guard does and does not prove
 *
 * It proves every declared action is **written somewhere**. It does not prove
 * the write is reachable. A static scan sees a string literal; it cannot see
 * that the branch containing it is dead, that the guard function around it is
 * exported and called from nowhere, or that a flag feeding it is only ever
 * passed one way. Those were all real defects in this feature and all were
 * found by mutation testing and adversarial review, not by presence. Read a
 * green run as "nothing in the registry is a phantom", not as "every action
 * fires".
 *
 * Conversely the scan is deliberately permissive about *where* the write is: an
 * action emitted only on an error branch counts as wired. Requiring runtime
 * coverage would make this guard hostage to fixture completeness, and a guard
 * that fails for reasons unrelated to its subject is a guard people delete.
 *
 * ## If this test just failed on an action you added
 *
 * Wire the emitter. **An action is declared in the same phase as its emitter,
 * or not at all** — that rule is in the registry header and this test is what
 * enforces it. Parking a name here to be filled in later is what produced the
 * dead ten.
 *
 * A waiver is for the narrow case where the action names something the codebase
 * genuinely cannot do yet and the name is still worth keeping. It carries a
 * one-line reason naming what is missing. **A waiver with no reason is how this
 * list becomes a graveyard** — the test rejects one, and it also rejects a
 * waiver for an action that has since been wired, so the list cannot outlive
 * what it excuses.
 */

import type { AuditAction } from '@chobii/shared';

export interface DeadAuditActionWaiver {
  /** The declared action no source file writes. */
  action: AuditAction;
  /** Why nothing writes it — what route or capability is absent. One line. */
  reason: string;
}

/**
 * Both entries are actions describing a write the admin API does not expose.
 * Neither is a phase-ordering excuse; there is no ticket that fills them in.
 */
export const DEAD_AUDIT_ACTION_WAIVERS: readonly DeadAuditActionWaiver[] = [
  {
    action: 'wallet.adjusted',
    reason:
      'No admin balance-adjustment endpoint exists: /api/admin/wallet-config is two GETs and a PUT that writes wallet_config.updated, and services/wallet.ts adjustWalletBalance() is called by no route.',
  },
  {
    action: 'user.status_changed',
    reason:
      'users.status is filterable in admin/customers.ts but adminCustomersApp exposes only two GETs and the role-change PUT, which writes user.role_changed.',
  },
];

/**
 * The failure text for actions nothing writes.
 *
 * Names every dead action and both ways out, because the useful failure is not
 * "the registry drifted" — it is "this specific name is a phantom, and here is
 * the decision you have to make about it".
 */
export function deadAuditActionsMessage(dead: readonly string[]): string {
  return (
    `AUDIT_ACTIONS declares ${dead.length} action(s) that no file under packages/api/src writes:\n` +
    dead.map((action) => `  - ${action}`).join('\n') +
    `\n\nThe audit viewer offers every declared action as a filter, so a declared action ` +
    `nothing writes returns an empty page that reads as "never happened" rather than ` +
    `"never recorded".\n\n` +
    `Either wire the emitter (recordAudit with this action, in the route that performs it), ` +
    `or delete the action from AUDIT_ACTIONS in packages/shared/src/schemas/audit-log.ts.\n` +
    `If the action names something the API genuinely cannot do yet, add it to ` +
    `DEAD_AUDIT_ACTION_WAIVERS in packages/api/tests/lib/audit-action-waivers.ts with a ` +
    `one-line reason saying what is missing (#671).`
  );
}

/**
 * The failure text for a waiver that has outlived its excuse.
 *
 * This is the half that keeps the list honest: wiring an action without pruning
 * its waiver leaves a permanent "not implemented" note on something that is.
 */
export function staleAuditWaiversMessage(stale: readonly DeadAuditActionWaiver[]): string {
  return (
    `${stale.length} waived action(s) are now written by packages/api/src:\n` +
    stale.map((w) => `  - ${w.action} — waived because: ${w.reason}`).join('\n') +
    `\n\nRemove them from DEAD_AUDIT_ACTION_WAIVERS in ` +
    `packages/api/tests/lib/audit-action-waivers.ts. A waiver kept past its reason ` +
    `documents the codebase as less capable than it is, and hides the next real ` +
    `dead action behind an entry nobody rereads (#671).`
  );
}
