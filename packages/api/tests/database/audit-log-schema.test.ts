/**
 * Schema support for the append-only admin audit log.
 *
 * Shape assertions on the drizzle objects, matching promotions-schema.test.ts
 * and shipping-config-schema.test.ts: the route and lib suites mock `db`, so
 * nothing else in the API catches a column that does not exist.
 *
 * Two properties are asserted here rather than left to a comment, because both
 * are the whole point of the table:
 *
 * 1. The actor is REFERENCED and SNAPSHOTTED. `actor_user_id` may go null when
 *    the account is deleted; `actor_email` and `actor_role` must survive it. An
 *    admin who deletes their own account must not thereby erase who they were.
 * 2. `actor_user_id` is ON DELETE SET NULL, never cascade. Cascading would let
 *    deleting a user delete the evidence of what that user did.
 *
 * The immutability trigger itself needs a real database and is covered in
 * tests/database/audit-log-immutability.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  adminAuditLog,
  auditCategoryEnum,
  auditOutcomeEnum,
} from '../../src/database/schema/audit-log';

describe('admin_audit_log table', () => {
  it('is named admin_audit_log', () => {
    expect(getTableConfig(adminAuditLog).name).toBe('admin_audit_log');
  });

  it('records who acted, by reference and by snapshot', () => {
    expect(adminAuditLog.actorUserId).toBeDefined();
    expect(adminAuditLog.actorEmail).toBeDefined();
    expect(adminAuditLog.actorRole).toBeDefined();
  });

  it('never cascades the actor reference — deleting a user must not delete the evidence', () => {
    const { foreignKeys } = getTableConfig(adminAuditLog);
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.onDelete).toBe('set null');
  });

  it('records what happened, to what, and how it came out', () => {
    expect(adminAuditLog.action).toBeDefined();
    expect(adminAuditLog.action.notNull).toBe(true);
    expect(adminAuditLog.category).toBeDefined();
    expect(adminAuditLog.category.notNull).toBe(true);
    expect(adminAuditLog.outcome).toBeDefined();
    expect(adminAuditLog.outcome.notNull).toBe(true);
    expect(adminAuditLog.entityType).toBeDefined();
    expect(adminAuditLog.entityId).toBeDefined();
    expect(adminAuditLog.summary).toBeDefined();
  });

  it('carries the before/after evidence and the request metadata as jsonb', () => {
    for (const column of ['before', 'after', 'metadata'] as const) {
      expect(adminAuditLog[column]).toBeDefined();
      expect(adminAuditLog[column].dataType).toBe('json');
    }
  });

  it('carries the provenance a dispute needs: request id, IP and user agent', () => {
    expect(adminAuditLog.requestId).toBeDefined();
    expect(adminAuditLog.ipAddress).toBeDefined();
    expect(adminAuditLog.userAgent).toBeDefined();
  });

  it('timestamps with a time zone, so a cross-region dispute has one clock', () => {
    expect(adminAuditLog.createdAt.notNull).toBe(true);
    expect(adminAuditLog.createdAt.hasDefault).toBe(true);
    expect(adminAuditLog.createdAt.getSQLType()).toContain('with time zone');
  });

  it('indexes every column the viewer filters on', () => {
    const indexed = getTableConfig(adminAuditLog).indexes.map((i) =>
      i.config.columns.map((c) => ('name' in c ? c.name : '')).join(',')
    );

    expect(indexed).toContain('created_at');
    expect(indexed).toContain('actor_user_id');
    expect(indexed).toContain('action');
    expect(indexed).toContain('category');
    expect(indexed).toContain('entity_type,entity_id');
    expect(indexed).toContain('request_id');
  });
});

describe('audit enums', () => {
  it('files a row under one of the five scope tiers', () => {
    expect(auditCategoryEnum.enumValues).toEqual([
      'money',
      'privilege',
      'catalogue',
      'config',
      'content',
    ]);
  });

  it('records a refusal as an outcome rather than dropping the row', () => {
    expect(auditOutcomeEnum.enumValues).toEqual(['success', 'failure']);
  });
});
