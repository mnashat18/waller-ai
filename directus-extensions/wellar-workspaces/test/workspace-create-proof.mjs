import assert from 'node:assert/strict';

import wellarEndpoint, {
  buildBusinessProfileInsertPayload,
  buildCompanyPayload,
  buildCreatedWorkspaceResponse,
  buildOwnerMembershipInsertPayload,
  buildWorkspaceCreatedActivityEventPayload,
  buildWorkspaceRecordIds,
  logWorkspaceCreatedActivityEvent
} from '../src/index.js';

const now = '2026-06-29T00:00:00.000Z';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deterministicIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
];

const payload = buildCompanyPayload(
  {
    company_name: '  Northwind Logistics  ',
    first_name: '  Jane  ',
    last_name: '  Owner  ',
    work_email: '  Jane.Owner@Example.com  ',
    phone: '  +1 (555) 010-1234  ',
    country: '  Egypt  '
  },
  'user-1',
  now
);

assert.equal(payload.error, undefined);
assert.equal(payload.value.company_name, 'Northwind Logistics');
assert.equal(payload.value.contact_name, 'Jane Owner');
assert.equal(payload.value.work_email, 'jane.owner@example.com');
assert.equal(payload.value.phone, '+1 (555) 010-1234');
assert.equal(payload.value.country, 'Egypt');

const recordIds = buildWorkspaceRecordIds(() => deterministicIds.shift());

assert.match(recordIds.businessProfileId, uuidPattern);
assert.match(recordIds.activityEventId, uuidPattern);
assert.notEqual(recordIds.businessProfileId, recordIds.activityEventId);
assert.equal(recordIds.membershipId, undefined);

const businessProfileInsert = buildBusinessProfileInsertPayload(payload.value, recordIds);
assert.match(businessProfileInsert.id, uuidPattern);
assert.equal(businessProfileInsert.company_name, 'Northwind Logistics');
assert.equal(businessProfileInsert.owner_user, 'user-1');

const ownerMembershipInsert = buildOwnerMembershipInsertPayload('user-1', businessProfileInsert.id, now);
assert.equal(Object.hasOwn(ownerMembershipInsert, 'id'), false);
assert.equal(ownerMembershipInsert.business_profile, businessProfileInsert.id);
assert.equal(ownerMembershipInsert.user, 'user-1');
assert.equal(ownerMembershipInsert.member_role, 'owner');
assert.equal(ownerMembershipInsert.status, 'active');

const activityInsert = buildWorkspaceCreatedActivityEventPayload({
  userId: 'user-1',
  businessProfileId: businessProfileInsert.id,
  membershipId: 101,
  activityEventId: recordIds.activityEventId,
  idempotencyKey: 'idem-1'
});
assert.match(activityInsert.id, uuidPattern);
assert.equal(activityInsert.business_profile, businessProfileInsert.id);
assert.equal(activityInsert.entity_id, businessProfileInsert.id);
assert.equal(JSON.parse(activityInsert.payload).membership_id, 101);

const placeholderResult = buildCompanyPayload(
  {
    company_name: 'Northwind Logistics',
    first_name: 'Test',
    last_name: 'Owner',
    work_email: 'jane.owner@example.com',
    country: 'Egypt'
  },
  'user-1',
  now
);

assert.equal(placeholderResult.error, 'First name must use a real value.');

const response = buildCreatedWorkspaceResponse(
  {
    id: 'profile-1',
    company_name: 'Northwind Logistics',
    is_active: true,
    plan_code: 'free',
    billing_status: 'trialing'
  },
  {
    id: 'member-1',
    status: 'active',
    member_role: 'owner'
  }
);

assert.equal(response.workspace.id, 'profile-1');
assert.equal(response.membership.id, 'member-1');
assert.equal(response.membership.businessProfileId, 'profile-1');
assert.equal(response.membership.memberRole, 'owner');

let logged = false;
const logger = {
  error(meta, message) {
    logged = true;
    assert.equal(message, '[wellar] workspace creation audit log failed');
    assert.equal(meta.table, 'activity_events');
    assert.equal(meta.action, 'workspace_created');
    assert.equal(meta.businessProfileId, 'profile-1');
    assert.equal(meta.membershipId, 'member-1');
  }
};

await logWorkspaceCreatedActivityEvent(
  () => ({
    insert: async () => {
      throw Object.assign(new Error('constraint violation'), {
        name: 'DatabaseError',
        code: '23514'
      });
    }
  }),
  logger,
  {
    userId: 'user-1',
    businessProfileId: 'profile-1',
    membershipId: 'member-1',
    activityEventId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'idem-1'
  }
);

assert.equal(logged, true);

function buildFakeRouter() {
  const handlers = new Map();
  return {
    handlers,
    get(path, handler) {
      handlers.set(`GET ${path}`, handler);
    },
    patch(path, handler) {
      handlers.set(`PATCH ${path}`, handler);
    },
    post(path, handler) {
      handlers.set(`POST ${path}`, handler);
    }
  };
}

function buildFakeResponse() {
  return {
    statusCode: null,
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

function assertRequiredUuidId(table, payload) {
  if (!payload?.id) {
    throw Object.assign(new Error(`${table}.id may not be null`), {
      name: 'DatabaseError',
      code: '23502',
      table,
      column: 'id'
    });
  }

  assert.match(payload.id, uuidPattern, `${table}.id must be a valid UUID`);
}

function extractEqualityFilters(filters) {
  return Object.fromEntries(filters.map(({ column, value }) => [String(column).split('.').at(-1), value]));
}

function createQueryBuilder(table, state, scope) {
  const filters = [];
  const executeRows = () => {
    const equalityFilters = extractEqualityFilters(filters);

    if (table === 'business_profile_members as member') {
      if (equalityFilters.id && equalityFilters.user) {
        return state.scenario.switchMembership ? [state.scenario.switchMembership] : [];
      }

      if (equalityFilters.user) {
        return state.scenario.activeMembershipRows ?? [];
      }
    }

    return [];
  };
  const builder = {
    leftJoin() {
      return builder;
    },
    innerJoin() {
      return builder;
    },
    select() {
      return builder;
    },
    where(columnOrObject, value) {
      if (typeof columnOrObject === 'object' && columnOrObject !== null) {
        for (const [column, filterValue] of Object.entries(columnOrObject)) {
          filters.push({ column, value: filterValue });
        }
      } else {
        filters.push({ column: columnOrObject, value });
      }
      return builder;
    },
    andWhere(columnOrObject, value) {
      return builder.where(columnOrObject, value);
    },
    whereIn() {
      return builder;
    },
    whereNotIn() {
      return builder;
    },
    orderBy() {
      return builder;
    },
    count() {
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve(executeRows()).then(resolve, reject);
    },
    first: async () => {
      const equalityFilters = extractEqualityFilters(filters);

      if (table === 'business_profile_members as member') {
        if (equalityFilters.id && equalityFilters.user) {
          return state.scenario.switchMembership;
        }

        if (equalityFilters.user) {
          return state.scenario.existingMembership;
        }
      }

      if (table === 'business_profile_members') {
        if (equalityFilters.user && equalityFilters.member_role === 'owner') {
          return state.scenario.duplicateOwnerMembership;
        }
      }

      if (table === 'directus_roles') {
        if (equalityFilters.id === state.scenario.ownerRoleId && state.scenario.ownerRoleExists !== false) {
          return { id: state.scenario.ownerRoleId };
        }

        return undefined;
      }

      if (table === 'directus_users' && equalityFilters.id) {
        return state.scenario.directusUserRow ?? { id: equalityFilters.id };
      }

      return undefined;
    },
    update: async (updatePayload) => {
      const call = {
        type: 'update',
        table,
        payload: updatePayload,
        scope
      };
      state.pendingCalls.push(call);

      if (table === 'directus_users' && state.scenario.failDirectusUserUpdate) {
        throw Object.assign(new Error('directus_users update failed'), {
          name: 'DatabaseError',
          code: '23514'
        });
      }

      return 1;
    },
    insert(insertPayload) {
      const call = {
        type: 'insert',
        table,
        payload: insertPayload,
        scope
      };
      state.pendingCalls.push(call);

      if (table === 'business_profiles') {
        assertRequiredUuidId(table, insertPayload);
      }

      if (table === 'business_profile_members') {
        assert.equal(Object.hasOwn(insertPayload, 'id'), false, 'business_profile_members.id must be database-generated');
      }

      if (table === 'departments') {
        assertRequiredUuidId(table, insertPayload);
        if (state.scenario.failDepartmentInsert) {
          throw Object.assign(new Error('department insert failed'), {
            name: 'DatabaseError',
            code: '23514'
          });
        }
      }

      if (table === 'activity_events') {
        if (scope === 'outside') {
          throw Object.assign(new Error('audit logging unavailable'), {
            name: 'DatabaseError',
            code: '23514'
          });
        }
      }

      return builder;
    },
    returning: async () => {
      const lastInsert = state.pendingCalls.findLast((call) => call.type === 'insert' && call.table === table);

      if (table === 'business_profiles') {
        return [
          {
            id: lastInsert.payload.id,
            company_name: lastInsert.payload.company_name,
            is_active: lastInsert.payload.is_active,
            plan_code: lastInsert.payload.plan_code,
            billing_status: lastInsert.payload.billing_status
          }
        ];
      }

      if (table === 'business_profile_members') {
        return [
          {
            id: 101,
            business_profile: lastInsert.payload.business_profile,
            member_role: lastInsert.payload.member_role,
            status: lastInsert.payload.status
          }
        ];
      }

      if (table === 'departments') {
        return [
          {
            id: lastInsert.payload.id,
            name: lastInsert.payload.name,
            is_active: lastInsert.payload.is_active,
            business_profile: lastInsert.payload.business_profile,
            manager_member: lastInsert.payload.manager_member,
            date_created: '2026-06-29T00:00:00.000Z',
            date_updated: '2026-06-29T00:00:00.000Z'
          }
        ];
      }

      return [];
    }
  };

  return builder;
}

function createFakeDatabase(scenario = {}) {
  const committedCalls = [];
  const state = {
    committedCalls,
    pendingCalls: committedCalls,
    scenario: {
      ownerRoleId: '44444444-4444-4444-8444-444444444444',
      ownerRoleExists: true,
      existingMembership: undefined,
      duplicateOwnerMembership: undefined,
      switchMembership: undefined,
      activeMembershipRows: [],
      directusUserRow: undefined,
      failDepartmentInsert: false,
      failDirectusUserUpdate: false,
      ...scenario
    }
  };

  const database = (table) => createQueryBuilder(table, state, 'outside');
  database.raw = async () => undefined;
  database.transaction = async (callback) => {
    const transactionCalls = [];
    const previousPendingCalls = state.pendingCalls;
    state.pendingCalls = transactionCalls;

    const trx = (table) => createQueryBuilder(table, state, 'transaction');
    trx.raw = async () => undefined;

    try {
      const result = await callback(trx);
      committedCalls.push(...transactionCalls);
      return result;
    } finally {
      state.pendingCalls = previousPendingCalls;
    }
  };
  database.calls = committedCalls;
  database.scenario = state.scenario;
  return database;
}

function buildTestHarness(scenario = {}) {
  const router = buildFakeRouter();
  const database = createFakeDatabase(scenario);
  const routeLoggerCalls = [];

  wellarEndpoint.handler(router, {
    database,
    logger: {
      error(meta, message) {
        routeLoggerCalls.push({ meta, message });
      }
    }
  });

  return {
    database,
    routeLoggerCalls,
    createWorkspaceHandler: router.handlers.get('POST /workspaces/create'),
    switchWorkspaceHandler: router.handlers.get('POST /workspaces/switch'),
    createDepartmentHandler: router.handlers.get('POST /organization/departments')
  };
}

async function withOwnerRoleEnv(value, callback) {
  const previousValue = process.env.WELLAR_OWNER_ROLE_ID;
  if (value === undefined) {
    delete process.env.WELLAR_OWNER_ROLE_ID;
  } else {
    process.env.WELLAR_OWNER_ROLE_ID = value;
  }

  try {
    await callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env.WELLAR_OWNER_ROLE_ID;
    } else {
      process.env.WELLAR_OWNER_ROLE_ID = previousValue;
    }
  }
}

const ownerRoleId = '44444444-4444-4444-8444-444444444444';

await withOwnerRoleEnv(ownerRoleId, async () => {
  const { database, routeLoggerCalls, createWorkspaceHandler } = buildTestHarness({ ownerRoleId });
  assert.equal(typeof createWorkspaceHandler, 'function');

  const createResponse = buildFakeResponse();
  await createWorkspaceHandler(
    {
      accountability: { user: 'user-1' },
      body: {
        idempotency_key: 'idem-route-1',
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.error, undefined);
  assert.match(createResponse.body.data.workspace.id, uuidPattern);
  assert.equal(createResponse.body.data.membership.id, '101');
  assert.equal(createResponse.body.data.membership.businessProfileId, createResponse.body.data.workspace.id);

  const createdProfileInsert = database.calls.find((call) => call.type === 'insert' && call.table === 'business_profiles');
  const createdMembershipInsert = database.calls.find(
    (call) => call.type === 'insert' && call.table === 'business_profile_members'
  );
  const createdActivityInsert = database.calls.find((call) => call.type === 'insert' && call.table === 'activity_events');
  const directusUserUpdate = database.calls.find((call) => call.type === 'update' && call.table === 'directus_users');

  assert.match(createdProfileInsert.payload.id, uuidPattern);
  assert.equal(Object.hasOwn(createdMembershipInsert.payload, 'id'), false);
  assert.match(createdActivityInsert.payload.id, uuidPattern);
  assert.equal(createdMembershipInsert.payload.business_profile, createdProfileInsert.payload.id);
  assert.equal(createdActivityInsert.payload.business_profile, createdProfileInsert.payload.id);
  assert.equal(directusUserUpdate.scope, 'transaction');
  assert.equal(directusUserUpdate.payload.role, ownerRoleId);
  assert.equal(directusUserUpdate.payload.active_business_profile, createdProfileInsert.payload.id);
  assert.equal(directusUserUpdate.payload.active_department, null);
  assert.equal(directusUserUpdate.payload.active_member_role, 'owner');

  assert.equal(routeLoggerCalls.length, 1);
  assert.equal(routeLoggerCalls[0].message, '[wellar] workspace creation audit log failed');
  assert.equal(routeLoggerCalls[0].meta.table, 'activity_events');
  assert.equal(routeLoggerCalls[0].meta.errorCode, '23514');
});

await withOwnerRoleEnv(undefined, async () => {
  const { database, createWorkspaceHandler } = buildTestHarness({ ownerRoleId });
  const createResponse = buildFakeResponse();

  await createWorkspaceHandler(
    {
      accountability: { user: 'user-2' },
      body: {
        idempotency_key: 'idem-missing-owner-role',
        company_name: 'Missing Role Co',
        first_name: 'Mina',
        last_name: 'Config',
        work_email: 'mina.config@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 500);
  assert.equal(createResponse.body.error.code, 'CONFIGURATION_ERROR');
  assert.equal(database.calls.some((call) => call.table === 'business_profiles'), false);
  assert.equal(database.calls.some((call) => call.table === 'business_profile_members'), false);
});

await withOwnerRoleEnv('not-a-uuid', async () => {
  const { database, createWorkspaceHandler } = buildTestHarness({ ownerRoleId });
  const createResponse = buildFakeResponse();

  await createWorkspaceHandler(
    {
      accountability: { user: 'user-3' },
      body: {
        idempotency_key: 'idem-invalid-owner-role',
        company_name: 'Invalid Role Co',
        first_name: 'Nadia',
        last_name: 'Config',
        work_email: 'nadia.config@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 500);
  assert.equal(createResponse.body.error.code, 'CONFIGURATION_ERROR');
  assert.equal(database.calls.some((call) => call.table === 'business_profiles'), false);
  assert.equal(database.calls.some((call) => call.table === 'business_profile_members'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const { database, createWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    ownerRoleExists: false
  });
  const createResponse = buildFakeResponse();

  await createWorkspaceHandler(
    {
      accountability: { user: 'user-4' },
      body: {
        idempotency_key: 'idem-missing-role-row',
        company_name: 'Missing Role Row Co',
        first_name: 'Omar',
        last_name: 'Config',
        work_email: 'omar.config@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 500);
  assert.equal(createResponse.body.error.code, 'CONFIGURATION_ERROR');
  assert.equal(database.calls.some((call) => call.table === 'business_profiles'), false);
  assert.equal(database.calls.some((call) => call.table === 'business_profile_members'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const { database, createWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    failDirectusUserUpdate: true
  });
  const createResponse = buildFakeResponse();

  await createWorkspaceHandler(
    {
      accountability: { user: 'user-5' },
      body: {
        idempotency_key: 'idem-atomic-owner-role',
        company_name: 'Atomic Co',
        first_name: 'Rana',
        last_name: 'Atomic',
        work_email: 'rana.atomic@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 500);
  assert.equal(createResponse.body.error.code, 'SERVER_ERROR');
  assert.equal(database.calls.some((call) => call.table === 'business_profiles'), false);
  assert.equal(database.calls.some((call) => call.table === 'business_profile_members'), false);
  assert.equal(database.calls.some((call) => call.table === 'directus_users'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const existingOwnerMembership = {
    id: 88,
    business_profile: 'existing-workspace',
    member_role: 'owner',
    status: 'active',
    owner_user: 'user-6',
    company_name: 'Existing Workspace',
    is_active: true,
    plan_code: 'free',
    billing_status: 'trialing'
  };
  const { database, createWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    existingMembership: existingOwnerMembership
  });
  const createResponse = buildFakeResponse();

  await createWorkspaceHandler(
    {
      accountability: { user: 'user-6' },
      body: {
        idempotency_key: 'idem-existing-owner',
        company_name: 'Existing Workspace',
        first_name: 'Sara',
        last_name: 'Owner',
        work_email: 'sara.owner@example.com',
        country: 'Egypt'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 200);
  const directusUserUpdate = database.calls.find((call) => call.type === 'update' && call.table === 'directus_users');
  assert.equal(directusUserUpdate.payload.role, undefined);
  assert.equal(directusUserUpdate.payload.active_business_profile, 'existing-workspace');
  assert.equal(database.calls.some((call) => call.table === 'business_profiles'), false);
  assert.equal(database.calls.some((call) => call.table === 'business_profile_members' && call.type === 'insert'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const switchMembership = {
    id: 77,
    user: 'user-7',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'switch-workspace',
    department_id: 'department-1',
    joined_at: now,
    company_name: 'Switch Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: 'department-1',
    department_name: 'Operations',
    department_business_profile: 'switch-workspace',
    department_is_active: true
  };
  const { database, switchWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    switchMembership
  });
  assert.equal(typeof switchWorkspaceHandler, 'function');

  const switchResponse = buildFakeResponse();
  await switchWorkspaceHandler(
    {
      accountability: { user: 'user-7' },
      body: {
        membership_id: '77'
      }
    },
    switchResponse
  );

  assert.equal(switchResponse.statusCode, 200);
  const directusUserUpdate = database.calls.find((call) => call.type === 'update' && call.table === 'directus_users');
  assert.equal(directusUserUpdate.payload.role, undefined);
  assert.equal(directusUserUpdate.payload.active_business_profile, 'switch-workspace');
  assert.equal(directusUserUpdate.payload.active_department, 'department-1');
  assert.equal(directusUserUpdate.payload.active_member_role, 'hr');
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 91,
    user: 'user-8',
    status: 'active',
    member_role: 'owner',
    workspace_id: 'trusted-workspace',
    department_id: null,
    joined_at: now,
    company_name: 'Trusted Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const { database, createDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    directusUserRow: {
      id: 'user-8',
      active_business_profile: 'stale-ui-workspace',
      active_department: null,
      active_member_role: 'owner'
    }
  });
  assert.equal(typeof createDepartmentHandler, 'function');

  const createResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-8' },
      body: {
        name: 'Operations'
      }
    },
    createResponse
  );

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.error, undefined);
  assert.match(createResponse.body.data.department.id, uuidPattern);
  assert.equal(createResponse.body.data.department.business_profile, 'trusted-workspace');

  const departmentInsert = database.calls.find((call) => call.type === 'insert' && call.table === 'departments');
  const departmentAuditInsert = database.calls.find(
    (call) =>
      call.type === 'insert' &&
      call.table === 'activity_events' &&
      call.payload.action === 'organization_department_created'
  );

  assert.match(departmentInsert.payload.id, uuidPattern);
  assert.equal(departmentInsert.payload.name, 'Operations');
  assert.equal(departmentInsert.payload.business_profile, activeMembership.workspace_id);
  assert.notEqual(departmentInsert.payload.business_profile, 'stale-ui-workspace');
  assert.equal(departmentInsert.payload.manager_member, null);
  assert.equal(departmentInsert.payload.is_active, true);
  assert.equal(departmentAuditInsert.payload.business_profile, activeMembership.workspace_id);
  assert.equal(departmentAuditInsert.payload.entity_id, departmentInsert.payload.id);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 92,
    user: 'user-9',
    status: 'active',
    member_role: 'employee',
    workspace_id: 'trusted-workspace',
    department_id: null,
    joined_at: now,
    company_name: 'Trusted Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const { database, createDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership]
  });

  const forbiddenResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-9' },
      body: {
        name: 'Operations'
      }
    },
    forbiddenResponse
  );

  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);
  assert.equal(database.calls.some((call) => call.table === 'activity_events'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 93,
    user: 'user-10',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'trusted-workspace',
    department_id: null,
    joined_at: now,
    company_name: 'Trusted Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const { database, createDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership]
  });

  const invalidResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-10' },
      body: {
        name: 'Operations',
        workspace_id: 'browser-value'
      }
    },
    invalidResponse
  );

  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);
  assert.equal(database.calls.some((call) => call.table === 'activity_events'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 94,
    user: 'user-11',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'trusted-workspace',
    department_id: null,
    joined_at: now,
    company_name: 'Trusted Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const { database, routeLoggerCalls, createDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    failDepartmentInsert: true
  });

  const errorResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-11' },
      body: {
        name: 'Operations'
      }
    },
    errorResponse
  );

  assert.equal(errorResponse.statusCode, 500);
  assert.equal(errorResponse.body.error.code, 'SERVER_ERROR');
  assert.equal(errorResponse.body.error.message, 'Department could not be created.');
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);
  assert.equal(database.calls.some((call) => call.table === 'activity_events'), false);
  assert.equal(routeLoggerCalls.at(-1).message, '[wellar] organization department creation failed');
  assert.equal(routeLoggerCalls.at(-1).meta.code, '23514');
});

console.log('workspace-create-proof: ok');
