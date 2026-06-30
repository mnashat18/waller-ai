import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPushSubscriptionRevokePlan,
  buildPushSubscriptionSyncPlan,
  handlePushSubscriptionRevokeRequest,
  handlePushSubscriptionSyncRequest,
  revokePushSubscriptionTransaction,
  syncPushSubscriptionTransaction,
  validatePushSubscriptionRevokePayload,
  validatePushSubscriptionSyncPayload
} from './src/index.js';

function createDataset(overrides = {}) {
  return {
    business_profile_members: overrides.business_profile_members ?? [],
    business_profiles: overrides.business_profiles ?? [],
    departments: overrides.departments ?? [],
    directus_users: overrides.directus_users ?? [],
    push_subscriptions: overrides.push_subscriptions ?? [],
    locks: []
  };
}

const PUSH_SUBSCRIPTION_FIELDS = [
  'id',
  'user',
  'business_profile',
  'device_id',
  'token',
  'platform',
  'device_label',
  'app_version',
  'os_version',
  'is_active',
  'last_seen_at'
];

function resolveField(row, field) {
  if (!field) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) {
    return row[field];
  }
  if (field.includes('.')) {
    const [prefix, ...rest] = field.split('.');
    const path = rest.join('.');
    const source = row[prefix];
    return source && typeof source === 'object' ? resolveField(source, path) : undefined;
  }

  return row[field];
}

function applySelectMap(row, fields) {
  if (!fields || !fields.length) {
    return { ...row };
  }

  const mapped = {};
  for (const field of fields) {
    const aliasIndex = typeof field === 'string' ? field.toLowerCase().lastIndexOf(' as ') : -1;
    if (aliasIndex > -1) {
      const source = field.slice(0, aliasIndex).trim();
      const alias = field.slice(aliasIndex + 4).trim();
      mapped[alias] = resolveField(row, source);
      continue;
    }

    const value = resolveField(row, field);
    const key = field.includes('.') ? field.split('.').pop() : field;
    mapped[key] = value;
  }

  return mapped;
}

function sortRows(rows, orderByClauses) {
  if (!orderByClauses.length) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const clause of orderByClauses) {
      const leftValue = resolveField(left, clause.field);
      const rightValue = resolveField(right, clause.field);
      if (leftValue === rightValue) continue;

      const multiplier = clause.direction === 'desc' ? -1 : 1;
      if (leftValue == null) return 1 * multiplier;
      if (rightValue == null) return -1 * multiplier;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * multiplier;
      }
      return String(leftValue).localeCompare(String(rightValue)) * multiplier;
    }

    return 0;
  });
}

class FakeQuery {
  constructor(dataset, tableSpec) {
    this.dataset = dataset;
    this.tableSpec = tableSpec;
    this.filters = [];
    this.notFilters = [];
    this.orderClauses = [];
    this.selectedFields = [];
    this.operation = 'select';
    this.payload = null;
  }

  select(fields) {
    this.selectedFields = Array.isArray(fields) ? fields : Array.from(arguments);
    return this;
  }

  where(arg1, arg2) {
    if (typeof arg1 === 'string') {
      this.filters.push({ field: arg1, value: arg2 });
    } else {
      for (const [key, value] of Object.entries(arg1 ?? {})) {
        this.filters.push({ field: key, value });
      }
    }
    return this;
  }

  andWhere(arg1, arg2) {
    return this.where(arg1, arg2);
  }

  whereNot(arg1, arg2) {
    if (typeof arg1 === 'string') {
      this.notFilters.push({ field: arg1, value: arg2 });
    } else {
      for (const [key, value] of Object.entries(arg1 ?? {})) {
        this.notFilters.push({ field: key, value });
      }
    }
    return this;
  }

  innerJoin() {
    return this;
  }

  leftJoin() {
    return this;
  }

  orderBy(field, direction = 'asc') {
    this.orderClauses.push({ field, direction: String(direction).toLowerCase() });
    return this;
  }

  first() {
    return this.execute(true);
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  returning() {
    return this.execute(false, true);
  }

  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }

  catch(reject) {
    return this.execute(false).catch(reject);
  }

  async execute(firstOnly = false, returnRows = false) {
    if (this.operation === 'update') {
      return this.executeUpdate(returnRows);
    }
    if (this.operation === 'insert') {
      return this.executeInsert(returnRows);
    }

    const rows = this.executeSelect();
    return firstOnly ? rows[0] ?? null : rows;
  }

  executeSelect() {
    if (this.tableSpec.startsWith('business_profile_members')) {
      const rows = (this.dataset.business_profile_members ?? []).map((member) => {
        const profile = (this.dataset.business_profiles ?? []).find((item) => String(item.id) === String(member.business_profile)) ?? null;
        const department = (this.dataset.departments ?? []).find((item) => String(item.id) === String(member.department)) ?? null;
        return {
          member: {
            id: member.id,
            user: member.user,
            status: member.status,
            member_role: member.member_role,
            business_profile: member.business_profile,
            department: member.department,
            joined_at: member.joined_at
          },
          profile: profile
            ? {
                id: profile.id,
                company_name: profile.company_name,
                is_active: profile.is_active,
                plan_code: profile.plan_code,
                billing_status: profile.billing_status
              }
            : null,
          department: department
            ? {
                id: department.id,
                name: department.name,
                business_profile: department.business_profile,
                is_active: department.is_active
              }
            : null
        };
      });

      const filtered = rows.filter((row) =>
        this.filters.every(({ field, value }) => resolveField(row, field) === value) &&
        this.notFilters.every(({ field, value }) => resolveField(row, field) !== value)
      );
      const ordered = sortRows(filtered, this.orderClauses);
      return ordered.map((row) => {
        const member = row.member ?? {};
        const profile = row.profile ?? {};
        const department = row.department ?? {};
        const output = { member, profile, department };
        return applySelectMap(output, this.selectedFields);
      });
    }

    const rows = (this.dataset[this.tableSpec] ?? []).filter((row) =>
      this.filters.every(({ field, value }) => resolveField(row, field) === value) &&
      this.notFilters.every(({ field, value }) => resolveField(row, field) !== value)
    );
    const ordered = sortRows(rows, this.orderClauses);
    return ordered.map((row) => applySelectMap(row, this.selectedFields));
  }

  async executeUpdate(returnRows) {
    const rows = this.dataset[this.tableSpec] ?? [];
    const matches = rows.filter((row) =>
      this.filters.every(({ field, value }) => resolveField(row, field) === value) &&
      this.notFilters.every(({ field, value }) => resolveField(row, field) !== value)
    );

    for (const row of matches) {
      assert.ok(!Object.prototype.hasOwnProperty.call(this.payload, 'status'));
      assert.ok(!Object.prototype.hasOwnProperty.call(this.payload, 'date_created'));
      assert.ok(!Object.prototype.hasOwnProperty.call(this.payload, 'date_updated'));
      Object.assign(row, this.payload);
    }

    if (returnRows) {
      return matches.map((row) => applySelectMap(row, this.selectedFields));
    }

    return matches.length;
  }

  async executeInsert(returnRows) {
    const rows = this.dataset[this.tableSpec] ?? [];
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const inserted = payloads.map((payload, index) => {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'status'));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'date_created'));
      assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'date_updated'));
      const row = {
        id: String(rows.length + index + 1),
        ...payload
      };
      rows.push(row);
      return row;
    });

    if (returnRows) {
      return inserted.map((row) => applySelectMap(row, this.selectedFields));
    }

    return inserted.length;
  }
}

function createFakeDatabase(dataset) {
  return {
    async transaction(callback) {
      const trx = Object.assign((tableSpec) => new FakeQuery(dataset, tableSpec), {
        raw: async (sql, params) => {
          dataset.locks.push({ sql, params });
        }
      });
      return callback(trx);
    }
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function seedMembership(dataset, { userId, workspaceId, role = 'employee', status = 'active', departmentId = null }) {
  dataset.business_profiles.push({
    id: workspaceId,
    company_name: 'Acme',
    is_active: true,
    plan_code: 'free',
    billing_status: 'trialing'
  });
  if (departmentId) {
    dataset.departments.push({
      id: departmentId,
      name: 'Operations',
      business_profile: workspaceId,
      is_active: true
    });
  }
  dataset.business_profile_members.push({
    id: `${userId}-${workspaceId}`,
    user: userId,
    status,
    member_role: role,
    business_profile: workspaceId,
    department: departmentId,
    joined_at: '2026-01-01T00:00:00.000Z'
  });
  dataset.directus_users.push({
    id: userId,
    active_business_profile: workspaceId,
    active_department: departmentId,
    active_member_role: role
  });
}

test('validates push subscription payloads', () => {
  assert.ok(
    validatePushSubscriptionSyncPayload({
      token: 'token-a',
      device_id: 'device-a',
      platform: 'android'
    }).ok
  );
  assert.ok(validatePushSubscriptionRevokePayload({ device_id: 'device-a' }).ok);
  const tooLongToken = 'x'.repeat(256);
  const invalid = validatePushSubscriptionSyncPayload({
    token: tooLongToken,
    device_id: 'device-a',
    platform: 'android'
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.message, 'token must be 255 characters or fewer.');
});

test('sync route enforces auth before payload validation and hides conflict details', async () => {
  const unauthorizedRes = createResponse();
  await handlePushSubscriptionSyncRequest({ database: createFakeDatabase(createDataset()), logger: null }, { accountability: {}, body: {} }, unauthorizedRes);
  assert.equal(unauthorizedRes.statusCode, 401);

  const forbiddenInvalidRes = createResponse();
  const inactiveDataset = createDataset();
  inactiveDataset.business_profiles.push({
    id: 'workspace-a',
    company_name: 'Acme',
    is_active: true,
    plan_code: 'free',
    billing_status: 'trialing'
  });
  inactiveDataset.business_profile_members.push({
    id: 'user-a-workspace-a',
    user: 'user-a',
    status: 'inactive',
    member_role: 'employee',
    business_profile: 'workspace-a',
    department: null,
    joined_at: '2026-01-01T00:00:00.000Z'
  });
  inactiveDataset.directus_users.push({
    id: 'user-a',
    active_business_profile: 'workspace-a',
    active_department: null,
    active_member_role: 'employee'
  });
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(inactiveDataset), logger: null },
    { accountability: { user: 'user-a' }, body: {} },
    forbiddenInvalidRes
  );
  assert.equal(forbiddenInvalidRes.statusCode, 403);

  const invalidRes = createResponse();
  const activeDataset = createDataset();
  seedMembership(activeDataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(activeDataset), logger: null },
    { accountability: { user: 'user-a' }, body: { device_id: 'device-a' } },
    invalidRes
  );
  assert.equal(invalidRes.statusCode, 400);

  const forbiddenAuthRes = createResponse();
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(createDataset()), logger: null },
    {
      accountability: { user: 'user-a' },
      body: { token: 'token-a', device_id: 'device-a', platform: 'android' }
    },
    forbiddenAuthRes
  );
  assert.equal(forbiddenAuthRes.statusCode, 403);

  const forbiddenRes = createResponse();
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(createDataset()), logger: null },
    {
      accountability: { user: 'user-a' },
      body: { token: 'token-a', device_id: 'device-a', platform: 'android' }
    },
    forbiddenRes
  );
  assert.equal(forbiddenRes.statusCode, 403);

  const conflictDataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-a',
        platform: 'android',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ]
  });
  seedMembership(conflictDataset, { userId: 'user-b', workspaceId: 'workspace-b' });
  const conflictRes = createResponse();
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(conflictDataset), logger: null },
    {
      accountability: { user: 'user-b' },
      body: { token: 'token-a', device_id: 'device-a', platform: 'ios' }
    },
    conflictRes
  );
  assert.equal(conflictRes.statusCode, 409);
  assert.deepEqual(conflictRes.body, {
    error: {
      code: 'CONFLICT',
      message: 'Push subscription conflict.'
    }
  });

  const okDataset = createDataset();
  seedMembership(okDataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const okRes = createResponse();
  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(okDataset), logger: null },
    {
      accountability: { user: 'user-a' },
      body: { token: 'token-a', device_id: 'device-a', platform: 'android' }
    },
    okRes
  );
  assert.equal(okRes.statusCode, 200);
  assert.deepEqual(okRes.body, { ok: true });

  const serverErrorRes = createResponse();
  await handlePushSubscriptionSyncRequest(
    {
      database: {
        async transaction() {
          throw new Error('boom');
        }
      },
      logger: null
    },
    {
      accountability: { user: 'user-a' },
      body: { token: 'token-a', device_id: 'device-a', platform: 'android' }
    },
    serverErrorRes
  );
  assert.equal(serverErrorRes.statusCode, 500);
});

test('revoke route enforces auth before payload validation and succeeds on the current device row', async () => {
  const unauthorizedRes = createResponse();
  await handlePushSubscriptionRevokeRequest({ database: createFakeDatabase(createDataset()), logger: null }, { accountability: {}, body: {} }, unauthorizedRes);
  assert.equal(unauthorizedRes.statusCode, 401);

  const forbiddenInvalidRes = createResponse();
  const inactiveDataset = createDataset();
  inactiveDataset.business_profiles.push({
    id: 'workspace-a',
    company_name: 'Acme',
    is_active: true,
    plan_code: 'free',
    billing_status: 'trialing'
  });
  inactiveDataset.business_profile_members.push({
    id: 'user-a-workspace-a',
    user: 'user-a',
    status: 'inactive',
    member_role: 'employee',
    business_profile: 'workspace-a',
    department: null,
    joined_at: '2026-01-01T00:00:00.000Z'
  });
  inactiveDataset.directus_users.push({
    id: 'user-a',
    active_business_profile: 'workspace-a',
    active_department: null,
    active_member_role: 'employee'
  });
  await handlePushSubscriptionRevokeRequest(
    { database: createFakeDatabase(inactiveDataset), logger: null },
    { accountability: { user: 'user-a' }, body: {} },
    forbiddenInvalidRes
  );
  assert.equal(forbiddenInvalidRes.statusCode, 403);

  const invalidRes = createResponse();
  const activeDataset = createDataset();
  seedMembership(activeDataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  await handlePushSubscriptionRevokeRequest(
    { database: createFakeDatabase(activeDataset), logger: null },
    { accountability: { user: 'user-a' }, body: { other: 'field' } },
    invalidRes
  );
  assert.equal(invalidRes.statusCode, 400);

  const dataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-a',
        platform: 'android',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ]
  });
  seedMembership(dataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const successRes = createResponse();
  await handlePushSubscriptionRevokeRequest(
    { database: createFakeDatabase(dataset), logger: null },
    { accountability: { user: 'user-a' }, body: { device_id: 'device-a' } },
    successRes
  );
  assert.equal(successRes.statusCode, 200);
  assert.deepEqual(successRes.body, { ok: true });
  assert.equal(dataset.push_subscriptions[0].is_active, false);
});

test('syncing the same user and token twice keeps one active current-token record', async () => {
  const dataset = createDataset();
  seedMembership(dataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const database = createFakeDatabase(dataset);

  await database.transaction((trx) =>
    syncPushSubscriptionTransaction(trx, {
      userId: 'user-a',
      workspaceId: 'workspace-a',
      payload: {
        token: 'token-a',
        deviceId: 'device-a',
        platform: 'android',
        deviceLabel: 'Pixel',
        appVersion: '1.0.0',
        osVersion: '15'
      },
      now: '2026-01-01T10:00:00.000Z'
    })
  );

  await database.transaction((trx) =>
    syncPushSubscriptionTransaction(trx, {
      userId: 'user-a',
      workspaceId: 'workspace-a',
      payload: {
        token: 'token-a',
        deviceId: 'device-a',
        platform: 'android',
        deviceLabel: 'Pixel',
        appVersion: '1.0.1',
        osVersion: '15'
      },
      now: '2026-01-01T11:00:00.000Z'
    })
  );

  assert.equal(dataset.push_subscriptions.length, 1);
  assert.deepEqual(Object.keys(dataset.push_subscriptions[0]).sort(), [...PUSH_SUBSCRIPTION_FIELDS].sort());
  assert.equal(dataset.push_subscriptions[0].user, 'user-a');
  assert.equal(dataset.push_subscriptions[0].business_profile, 'workspace-a');
  assert.equal(dataset.push_subscriptions[0].device_id, 'device-a');
  assert.equal(dataset.push_subscriptions[0].token, 'token-a');
  assert.equal(dataset.push_subscriptions[0].platform, 'android');
  assert.equal(dataset.push_subscriptions[0].device_label, 'Pixel');
  assert.equal(dataset.push_subscriptions[0].app_version, '1.0.1');
  assert.equal(dataset.push_subscriptions[0].os_version, '15');
  assert.equal(dataset.push_subscriptions[0].is_active, true);
  assert.equal(dataset.push_subscriptions[0].last_seen_at, '2026-01-01T11:00:00.000Z');
  assert.equal('status' in dataset.push_subscriptions[0], false);
  assert.equal('date_created' in dataset.push_subscriptions[0], false);
  assert.equal('date_updated' in dataset.push_subscriptions[0], false);
});

test('sync rotation updates the current device row and retains other devices', async () => {
  const dataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-old',
        platform: 'android',
        device_label: 'Old phone',
        app_version: '1.0.0',
        os_version: '14',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      },
      {
        id: '2',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-b',
        token: 'token-other',
        platform: 'ios',
        device_label: 'Tablet',
        app_version: '2.0.0',
        os_version: '17',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ]
  });
  seedMembership(dataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const database = createFakeDatabase(dataset);

  await database.transaction((trx) =>
    syncPushSubscriptionTransaction(trx, {
      userId: 'user-a',
      workspaceId: 'workspace-a',
      payload: {
        token: 'token-new',
        deviceId: 'device-a',
        platform: 'android',
        deviceLabel: 'Pixel',
        appVersion: '1.1.0',
        osVersion: '15'
      },
      now: '2026-01-01T12:00:00.000Z'
    })
  );

  assert.equal(dataset.push_subscriptions.length, 2);
  assert.equal(dataset.push_subscriptions[0].token, 'token-new');
  assert.equal(dataset.push_subscriptions[0].is_active, true);
  assert.equal(dataset.push_subscriptions[0].last_seen_at, '2026-01-01T12:00:00.000Z');
  assert.equal('status' in dataset.push_subscriptions[0], false);
  assert.equal(dataset.push_subscriptions[1].token, 'token-other');
});

test('revoke affects only the authenticated user current device row', async () => {
  const dataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-a',
        platform: 'android',
        device_label: 'Pixel',
        app_version: '1.0.0',
        os_version: '15',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      },
      {
        id: '2',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-b',
        token: 'token-b',
        platform: 'ios',
        device_label: 'Tablet',
        app_version: '2.0.0',
        os_version: '17',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ]
  });
  seedMembership(dataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const database = createFakeDatabase(dataset);

  await database.transaction((trx) =>
    revokePushSubscriptionTransaction(trx, {
      userId: 'user-a',
      deviceId: 'device-a',
      now: '2026-01-01T13:00:00.000Z'
    })
  );

  assert.equal(dataset.push_subscriptions[0].is_active, false);
  assert.equal(dataset.push_subscriptions[0].last_seen_at, '2026-01-01T13:00:00.000Z');
  assert.equal(dataset.push_subscriptions[1].is_active, true);
  assert.equal(dataset.push_subscriptions[1].last_seen_at, '2026-01-01T09:00:00.000Z');
  assert.equal('status' in dataset.push_subscriptions[0], false);
});

test('a different authenticated user cannot reclaim an active token', async () => {
  const dataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-a',
        platform: 'android',
        device_label: 'Pixel',
        app_version: '1.0.0',
        os_version: '15',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ]
  });
  seedMembership(dataset, { userId: 'user-b', workspaceId: 'workspace-b' });
  const database = createFakeDatabase(dataset);

  await assert.rejects(
    database.transaction((trx) =>
      syncPushSubscriptionTransaction(trx, {
        userId: 'user-b',
        workspaceId: 'workspace-b',
        payload: {
          token: 'token-a',
          deviceId: 'device-a',
          platform: 'ios'
        },
        now: '2026-01-01T14:00:00.000Z'
      })
    ),
    /push subscription conflict/i
  );

  assert.equal(dataset.push_subscriptions[0].user, 'user-a');
  assert.equal(dataset.push_subscriptions[0].token, 'token-a');
});

test('token ownership cannot be rebound through an inactive foreign row', () => {
  const dataset = createDataset({
    push_subscriptions: [
      {
        id: '1',
        user: 'user-old',
        business_profile: 'workspace-old',
        device_id: 'device-a',
        token: 'token-old',
        platform: 'android',
        device_label: 'Old phone',
        app_version: '1.0.0',
        os_version: '14',
        is_active: false,
        last_seen_at: '2026-01-01T08:00:00.000Z'
      }
    ]
  });

  const plan = buildPushSubscriptionSyncPlan({
    tokenRow: dataset.push_subscriptions[0],
    deviceRows: dataset.push_subscriptions,
    userId: 'user-new',
    workspaceId: 'workspace-new',
    deviceId: 'device-a',
    token: 'token-new',
    platform: 'ios',
    deviceLabel: 'New phone',
    appVersion: '2.0.0',
    osVersion: '17',
    now: '2026-01-01T15:00:00.000Z'
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'CONFLICT');
  assert.equal(plan.message, 'Push subscription conflict.');
});

test('revoke plan is a no-op when no current row exists', () => {
  const plan = buildPushSubscriptionRevokePlan({
    deviceRows: [],
    userId: 'user-a',
    deviceId: 'device-a',
    now: '2026-01-01T16:00:00.000Z'
  });

  assert.equal(plan.action, 'noop');
});

test('sync route rejects token longer than 255 as payload validation 400', async () => {
  const dataset = createDataset();
  seedMembership(dataset, { userId: 'user-a', workspaceId: 'workspace-a' });
  const res = createResponse();

  await handlePushSubscriptionSyncRequest(
    { database: createFakeDatabase(dataset), logger: null },
    {
      accountability: { user: 'user-a' },
      body: { token: 'x'.repeat(256), device_id: 'device-a', platform: 'android' }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(dataset.push_subscriptions.length, 0);
});

test('canonical row selection depends only on is_active, last_seen_at, and string id ordering', () => {
  const plan = buildPushSubscriptionRevokePlan({
    deviceRows: [
      {
        id: '9',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-a',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      },
      {
        id: '10',
        user: 'user-a',
        business_profile: 'workspace-a',
        device_id: 'device-a',
        token: 'token-b',
        is_active: true,
        last_seen_at: '2026-01-01T09:00:00.000Z'
      }
    ],
    userId: 'user-a',
    deviceId: 'device-a',
    now: '2026-01-01T16:00:00.000Z'
  });

  assert.equal(plan.rowId, '9');
});
