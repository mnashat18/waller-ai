import assert from 'node:assert/strict';

import extension from './index.js';

const UUID_V4_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createRouter() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler);
    },
    patch(path, handler) {
      routes.set(`PATCH ${path}`, handler);
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

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createQueryExecutor(state, tableName) {
  return function execute(query) {
    switch (tableName) {
      case 'business_profile_members as member':
        if (query.whereClauses.some((clause) => clause.field === 'member.user')) {
          if (query.whereClauses.some((clause) => clause.value === state.actorUserId)) {
            return Promise.resolve(state.membershipRows);
          }
        }

        if (query.whereClauses.some((clause) => clause.field === 'member.id')) {
          return Promise.resolve(state.targetMember ?? null);
        }

        return Promise.resolve([]);

      case 'directus_users':
        return Promise.resolve(
          state.directusUserRow ?? {
            id: state.actorUserId,
            active_business_profile: state.workspaceId,
            active_department: null,
            active_member_role: 'owner'
          }
        );

      case 'scan_requests':
        if (query.mode === 'select') {
          return Promise.resolve(state.openRequest ?? null);
        }

        if (query.mode === 'insert') {
          state.insertPayloads.push(query.insertPayload);
          return Promise.resolve([
            {
              id: query.insertPayload.id,
              business_profile: state.workspaceId,
              department: state.targetMember?.department_id ?? null,
              requested_by_user: state.actorUserId,
              target_member: state.targetMember?.id ?? null,
              request_type: query.insertPayload.request_type,
              status: 'pending',
              requested_at: query.insertPayload.requested_at,
              due_at: query.insertPayload.due_at ?? null,
              completed_at: null,
              cancelled: null
            }
          ]);
        }

        return Promise.resolve([]);

      case 'activity_events':
        state.activityEvents.push(query.insertPayload);
        return Promise.resolve([{ id: 'activity-1' }]);

      default:
        return Promise.resolve(query.firstResult ? null : []);
    }
  };
}

function createQueryBuilder(execute) {
  const query = {
    mode: null,
    whereClauses: [],
    firstResult: false,
    insertPayload: null
  };

  const builder = {
    innerJoin() {
      return builder;
    },
    leftJoin() {
      return builder;
    },
    select() {
      if (!query.mode) {
        query.mode = 'select';
      }
      return builder;
    },
    where(fieldOrObject, value) {
      if (typeof fieldOrObject === 'string') {
        query.whereClauses.push({ field: fieldOrObject, value });
      } else if (fieldOrObject && typeof fieldOrObject === 'object') {
        for (const [field, objectValue] of Object.entries(fieldOrObject)) {
          query.whereClauses.push({ field, value: objectValue });
        }
      }
      return builder;
    },
    andWhere(fieldOrObject, value) {
      return builder.where(fieldOrObject, value);
    },
    whereNotIn() {
      return builder;
    },
    orderBy() {
      return builder;
    },
    modify(callback) {
      if (typeof callback === 'function') {
        callback(builder);
      }
      return builder;
    },
    insert(payload) {
      query.mode = 'insert';
      query.insertPayload = payload;
      return builder;
    },
    returning() {
      return builder;
    },
    first() {
      query.firstResult = true;
      return execute(query);
    },
    then(resolve, reject) {
      return execute(query).then(resolve, reject);
    }
  };

  return builder;
}

function createDatabase(state) {
  const trx = (tableName) => createQueryBuilder(createQueryExecutor(state, tableName));
  trx.raw = async () => [];

  return {
    transaction(callback) {
      return callback(trx);
    }
  };
}

function createState(overrides = {}) {
  return {
    actorUserId: 'user-owner',
    workspaceId: 'workspace-1',
    membershipRows: [
      {
        id: 'member-owner',
        user: 'user-owner',
        status: 'active',
        member_role: 'owner',
        workspace_id: 'workspace-1',
        department_id: null,
        joined_at: '2026-06-26T10:00:00.000Z',
        company_name: 'Wellar Co',
        workspace_is_active: true,
        plan_code: 'free',
        billing_status: 'trialing',
        department_match_id: null,
        department_name: null,
        department_business_profile: null,
        department_is_active: null
      }
    ],
    directusUserRow: {
      id: 'user-owner',
      active_business_profile: 'workspace-1',
      active_department: null,
      active_member_role: 'owner'
    },
    targetMember: {
      id: 'member-employee',
      status: 'active',
      member_role: 'employee',
      workspace_id: 'workspace-1',
      department_id: 'department-1',
      joined_at: '2026-06-26T09:00:00.000Z',
      company_name: 'Wellar Co',
      workspace_is_active: true,
      department_match_id: 'department-1',
      department_name: 'Operations',
      department_business_profile: 'workspace-1',
      department_is_active: true,
      user_id: 'user-employee',
      user_email: 'employee@example.com',
      first_name: 'Demo',
      last_name: 'Employee'
    },
    openRequest: null,
    insertPayloads: [],
    activityEvents: [],
    ...overrides
  };
}

function createHandler(stateOverrides = {}) {
  const state = createState(stateOverrides);
  const router = createRouter();
  const logger = {
    errorCalls: [],
    warnCalls: [],
    error(payload, message) {
      this.errorCalls.push({ payload, message });
    },
    warn(payload, message) {
      this.warnCalls.push({ payload, message });
    }
  };
  extension.handler(router, {
    database: createDatabase(state),
    logger
  });

  return {
    state,
    logger,
    handler: router.routes.get('POST /scan-requests')
  };
}

async function testCreatesScanRequestWithCanonicalInsertPayload() {
  const originalFetch = globalThis.fetch;
  const originalWebhookUrl = process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  const originalDirectusSecret = process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    return { ok: true, status: 202 };
  };
  process.env.PUSH_NOTIFICATION_WEBHOOK_URL = 'https://push.example.test/webhook';
  process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET = 'super-secret';

  const { handler, state } = createHandler();
  const req = {
    accountability: { user: state.actorUserId },
    body: {
      target_member_id: state.targetMember.id,
      request_type: 'manual'
    }
  };
  const res = createResponse();

  await handler(req, res);
  await flushMicrotasks();

  assert.equal(res.statusCode, 201);
  assert.equal(state.insertPayloads.length, 1);
  assert.deepEqual(Object.keys(state.insertPayloads[0]).sort(), [
    'business_profile',
    'department',
    'id',
    'request_type',
    'requested_at',
    'requested_by_user',
    'status',
    'target_member'
  ]);
  assert.match(state.insertPayloads[0].id, UUID_V4_RX);
  assert.equal(state.insertPayloads[0].target_member, state.targetMember.id);
  assert.equal('due_at' in state.insertPayloads[0], false);
  assert.equal('completed_scan' in state.insertPayloads[0], false);
  assert.equal(state.activityEvents.length, 1);
  assert.match(state.activityEvents[0].id, UUID_V4_RX);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][0], 'https://push.example.test/webhook');
  assert.equal(fetchCalls[0][1].headers['X-Directus-Secret'], 'super-secret');
  assert.equal(fetchCalls[0][1].body, JSON.stringify({
    scan_request_id: state.insertPayloads[0].id,
    event: 'scan_request_created',
    target_member: state.targetMember.id,
    business_profile: state.workspaceId,
    requested_by_user: state.actorUserId
  }));

  globalThis.fetch = originalFetch;
  if (originalWebhookUrl === undefined) {
    delete process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  } else {
    process.env.PUSH_NOTIFICATION_WEBHOOK_URL = originalWebhookUrl;
  }
  if (originalDirectusSecret === undefined) {
    delete process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  } else {
    process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET = originalDirectusSecret;
  }
}

async function testRejectsInvalidTargetMemberAsBadRequest() {
  const { handler, state } = createHandler({ targetMember: null });
  const req = {
    accountability: { user: state.actorUserId },
    body: {
      target_member_id: 'missing-member',
      request_type: 'manual'
    }
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body?.error?.message,
    'The requested workforce member was not found in the active organization.'
  );
  assert.equal(state.insertPayloads.length, 0);
}

async function testWebhookFailureDoesNotChangeSuccessfulResponse() {
  const originalFetch = globalThis.fetch;
  const originalWebhookUrl = process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  const originalDirectusSecret = process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  globalThis.fetch = async () => {
    throw new Error('push endpoint unavailable');
  };
  process.env.PUSH_NOTIFICATION_WEBHOOK_URL = 'https://push.example.test/webhook';
  process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET = 'runtime-secret';

  const { handler, state, logger } = createHandler();
  const req = {
    accountability: { user: state.actorUserId },
    body: {
      target_member_id: state.targetMember.id,
      request_type: 'manual'
    }
  };
  const res = createResponse();

  await handler(req, res);
  await flushMicrotasks();

  assert.equal(res.statusCode, 201);
  assert.equal(state.insertPayloads.length, 1);
  assert.equal(state.activityEvents.length, 1);
  assert.equal(logger.warnCalls.length, 1);
  assert.equal(logger.warnCalls[0].message, '[wellar] scan request push dispatch failed');
  assert.equal(logger.warnCalls[0].payload.error_message, 'push endpoint unavailable');
  assert.equal(logger.warnCalls[0].payload.directus_secret, undefined);

  globalThis.fetch = originalFetch;
  if (originalWebhookUrl === undefined) {
    delete process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  } else {
    process.env.PUSH_NOTIFICATION_WEBHOOK_URL = originalWebhookUrl;
  }
  if (originalDirectusSecret === undefined) {
    delete process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  } else {
    process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET = originalDirectusSecret;
  }
}

async function testMissingWebhookConfigurationSkipsDispatchAndNeverHardcodesSecret() {
  const originalFetch = globalThis.fetch;
  const originalWebhookUrl = process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  const originalDirectusSecret = process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 202 };
  };
  delete process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  delete process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;

  const { handler, state, logger } = createHandler();
  const req = {
    accountability: { user: state.actorUserId },
    body: {
      target_member_id: state.targetMember.id,
      request_type: 'manual'
    }
  };
  const res = createResponse();

  await handler(req, res);
  await flushMicrotasks();

  assert.equal(res.statusCode, 201);
  assert.equal(fetchCalled, false);
  assert.equal(logger.warnCalls.length, 1);
  assert.equal(
    logger.warnCalls[0].message,
    '[wellar] scan request push dispatch skipped: missing webhook configuration'
  );
  assert.equal(logger.warnCalls[0].payload.missing_webhook_url, true);
  assert.equal(logger.warnCalls[0].payload.missing_directus_secret, true);

  globalThis.fetch = originalFetch;
  if (originalWebhookUrl === undefined) {
    delete process.env.PUSH_NOTIFICATION_WEBHOOK_URL;
  } else {
    process.env.PUSH_NOTIFICATION_WEBHOOK_URL = originalWebhookUrl;
  }
  if (originalDirectusSecret === undefined) {
    delete process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET;
  } else {
    process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET = originalDirectusSecret;
  }
}

async function run() {
  await testCreatesScanRequestWithCanonicalInsertPayload();
  await testRejectsInvalidTargetMemberAsBadRequest();
  await testWebhookFailureDoesNotChangeSuccessfulResponse();
  await testMissingWebhookConfigurationSkipsDispatchAndNeverHardcodesSecret();
  process.stdout.write('directus scan request route tests passed\n');
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
