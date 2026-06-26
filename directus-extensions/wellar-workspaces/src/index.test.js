import assert from 'node:assert/strict';

import extension from './index.js';

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
              id: 'scan-request-1',
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
  const logger = { errorCalls: [], error(payload, message) { this.errorCalls.push({ payload, message }); } };
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

  assert.equal(res.statusCode, 201);
  assert.equal(state.insertPayloads.length, 1);
  assert.deepEqual(Object.keys(state.insertPayloads[0]).sort(), [
    'business_profile',
    'department',
    'request_type',
    'requested_at',
    'requested_by_user',
    'status',
    'target_member'
  ]);
  assert.equal(state.insertPayloads[0].target_member, state.targetMember.id);
  assert.equal('due_at' in state.insertPayloads[0], false);
  assert.equal('completed_scan' in state.insertPayloads[0], false);
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

async function run() {
  await testCreatesScanRequestWithCanonicalInsertPayload();
  await testRejectsInvalidTargetMemberAsBadRequest();
  process.stdout.write('directus scan request route tests passed\n');
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
