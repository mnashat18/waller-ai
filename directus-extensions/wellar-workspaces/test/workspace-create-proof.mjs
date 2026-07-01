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
        const switchMembership =
          state.scenario.switchMembershipsById?.[String(equalityFilters.id)] ?? state.scenario.switchMembership;
        return switchMembership ? [switchMembership] : [];
      }

      if (equalityFilters.id) {
        const manager = state.scenario.managerMembersById?.[String(equalityFilters.id)];
        return manager ? [manager] : [];
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
          return state.scenario.switchMembershipsById?.[String(equalityFilters.id)] ?? state.scenario.switchMembership;
        }

        if (equalityFilters.id) {
          return state.scenario.managerMembersById?.[String(equalityFilters.id)];
        }

        if (equalityFilters.user) {
          return state.scenario.existingMembership;
        }
      }

      if (table === 'departments') {
        if (equalityFilters.id && equalityFilters.business_profile) {
          return state.scenario.departmentRowsById?.[String(equalityFilters.id)];
        }
      }

      if (table === 'business_profile_members') {
        if (equalityFilters.business_profile && equalityFilters.department && equalityFilters.status === 'active') {
          return { count: state.scenario.departmentActiveMemberCountsById?.[String(equalityFilters.department)] ?? 0 };
        }

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

      if (table === 'directus_users') {
        state.scenario.directusUserRow = {
          ...(state.scenario.directusUserRow ?? { id: state.scenario.userId ?? null }),
          ...updatePayload
        };
      }

      if (table === 'departments' && filters.some((filter) => String(filter.column).split('.').at(-1) === 'id')) {
        const equalityFilters = extractEqualityFilters(filters);
        const departmentId = String(equalityFilters.id);
        const current = state.scenario.departmentRowsById?.[departmentId];
        if (current) {
          state.scenario.departmentRowsById[departmentId] = {
            ...current,
            ...updatePayload
          };
        }
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
        assertRequiredUuidId(table, insertPayload);
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
      switchMembershipsById: {},
      activeMembershipRows: [],
      managerMembersById: {},
      departmentRowsById: {},
      departmentActiveMemberCountsById: {},
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
    contextHandler: router.handlers.get('GET /workspaces/context'),
    createDepartmentHandler: router.handlers.get('POST /organization/departments'),
    updateDepartmentHandler: router.handlers.get('PATCH /organization/departments/:departmentId'),
    deactivateDepartmentHandler: router.handlers.get('POST /organization/departments/:departmentId/deactivate')
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
  assert.equal(database.calls.some((call) => call.table === 'directus_users'), false);
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
  assert.equal(database.calls.some((call) => call.table === 'directus_users'), false);
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
  assert.equal(database.calls.some((call) => call.table === 'directus_users'), false);
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
  assert.equal(directusUserUpdate.payload.role, ownerRoleId);
  assert.equal(directusUserUpdate.payload.active_business_profile, 'existing-workspace');
  assert.equal(directusUserUpdate.payload.active_department, null);
  assert.equal(directusUserUpdate.payload.active_member_role, 'owner');
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
  const ownerMembership = {
    id: 'membership-owner',
    user: 'user-context',
    status: 'active',
    member_role: 'owner',
    workspace_id: 'company-a',
    department_id: null,
    joined_at: now,
    company_name: 'Waller Demo Company',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const hrMembership = {
    id: 'membership-hr',
    user: 'user-context',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'company-b',
    department_id: 'department-marketing',
    joined_at: now,
    company_name: 'abo ali',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: 'department-marketing',
    department_name: 'Marketing & Sales',
    department_business_profile: 'company-b',
    department_is_active: true
  };
  const { database, contextHandler, switchWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [ownerMembership, hrMembership],
    directusUserRow: {
      id: 'user-context',
      active_business_profile: 'company-a',
      active_department: null,
      active_member_role: 'owner'
    },
    switchMembershipsById: {
      [String(ownerMembership.id)]: ownerMembership,
      [String(hrMembership.id)]: hrMembership
    }
  });

  const switchResponse = buildFakeResponse();
  await switchWorkspaceHandler(
    {
      accountability: { user: 'user-context' },
      body: {
        membership_id: 'membership-hr'
      }
    },
    switchResponse
  );

  assert.equal(switchResponse.statusCode, 200);
  const switchUpdate = database.calls.find((call) => call.type === 'update' && call.table === 'directus_users');
  assert.equal(switchUpdate.payload.role, undefined);
  assert.equal(switchUpdate.payload.active_business_profile, 'company-b');
  assert.equal(switchUpdate.payload.active_department, 'department-marketing');
  assert.equal(switchUpdate.payload.active_member_role, 'hr');

  const contextResponse = buildFakeResponse();
  await contextHandler(
    {
      accountability: { user: 'user-context' }
    },
    contextResponse
  );

  assert.equal(contextResponse.statusCode, 200);
  assert.equal(contextResponse.body.data.active.membership.id, 'membership-hr');
  assert.equal(contextResponse.body.data.active.workspace.id, 'company-b');
  assert.equal(contextResponse.body.data.active.membership.memberRole, 'hr');
  assert.equal(contextResponse.body.data.memberships.length, 2);
  assert.deepEqual(
    contextResponse.body.data.memberships.map((membership) => [membership.id, membership.workspace.id, membership.memberRole]),
    [
      ['membership-owner', 'company-a', 'owner'],
      ['membership-hr', 'company-b', 'hr']
    ]
  );

  const ownerSwitchResponse = buildFakeResponse();
  await switchWorkspaceHandler(
    {
      accountability: { user: 'user-context' },
      body: {
        membership_id: 'membership-owner'
      }
    },
    ownerSwitchResponse
  );

  assert.equal(ownerSwitchResponse.statusCode, 200);

  const ownerContextResponse = buildFakeResponse();
  await contextHandler(
    {
      accountability: { user: 'user-context' }
    },
    ownerContextResponse
  );

  assert.equal(ownerContextResponse.statusCode, 200);
  assert.equal(ownerContextResponse.body.data.active.membership.id, 'membership-owner');
  assert.equal(ownerContextResponse.body.data.active.workspace.id, 'company-a');
  assert.equal(ownerContextResponse.body.data.active.membership.memberRole, 'owner');
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const ownerMembership = {
    id: 'membership-owner-stale',
    user: 'user-stale',
    status: 'active',
    member_role: 'owner',
    workspace_id: 'company-a',
    department_id: null,
    joined_at: now,
    company_name: 'Waller Demo Company',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const hrMembership = {
    id: 'membership-hr-stale',
    user: 'user-stale',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'company-b',
    department_id: 'department-marketing',
    joined_at: now,
    company_name: 'abo ali',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: 'department-marketing',
    department_name: 'Marketing & Sales',
    department_business_profile: 'company-b',
    department_is_active: true
  };
  const { contextHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [ownerMembership, hrMembership],
    directusUserRow: {
      id: 'user-stale',
      active_business_profile: 'stale-workspace',
      active_department: null,
      active_member_role: 'owner'
    }
  });

  const contextResponse = buildFakeResponse();
  await contextHandler(
    {
      accountability: { user: 'user-stale' }
    },
    contextResponse
  );

  assert.equal(contextResponse.statusCode, 200);
  assert.equal(contextResponse.body.data.active.membership.id, 'membership-owner-stale');
  assert.equal(contextResponse.body.data.active.workspace.id, 'company-a');
  assert.equal(contextResponse.body.data.memberships.length, 2);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const switchMembership = {
    id: 'membership-switch-validate',
    user: 'user-switch-validate',
    status: 'active',
    member_role: 'hr',
    workspace_id: 'switch-workspace',
    department_id: null,
    joined_at: now,
    company_name: 'Switch Workspace',
    workspace_is_active: true,
    plan_code: 'pro',
    billing_status: 'active',
    department_match_id: null,
    department_name: null,
    department_business_profile: null,
    department_is_active: null
  };
  const { database, switchWorkspaceHandler } = buildTestHarness({
    ownerRoleId,
    switchMembership
  });

  const switchResponse = buildFakeResponse();
  await switchWorkspaceHandler(
    {
      accountability: { user: 'user-switch-validate' },
      body: {
        membership_id: 'membership-switch-validate',
        workspace_id: 'forbidden'
      }
    },
    switchResponse
  );

  assert.equal(switchResponse.statusCode, 400);
  assert.equal(switchResponse.body.error.message, 'Only membership_id is accepted.');
  assert.equal(database.calls.some((call) => call.table === 'directus_users'), false);
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
  assert.match(departmentAuditInsert.payload.id, uuidPattern);
  assert.notEqual(departmentAuditInsert.payload.id, departmentInsert.payload.id);
  assert.equal(departmentAuditInsert.payload.business_profile, activeMembership.workspace_id);
  assert.notEqual(departmentAuditInsert.payload.business_profile, 'stale-ui-workspace');
  assert.equal(departmentAuditInsert.payload.entity_id, departmentInsert.payload.id);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 95,
    user: 'user-12',
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
    activeMembershipRows: [activeMembership],
    managerMembersById: {
      'manager-1': {
        id: 'manager-1',
        status: 'active',
        member_role: 'manager',
        business_profile: 'trusted-workspace',
        user_id: 'directus-user-1'
      }
    }
  });

  const createResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-12' },
      body: {
        name: 'Safety',
        manager_member_id: 'manager-1',
        workspace_id: 'browser-value'
      }
    },
    createResponse
  );
  assert.equal(createResponse.statusCode, 400);
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);

  const validResponse = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-12' },
      body: {
        name: 'Safety',
        manager_member_id: 'manager-1'
      }
    },
    validResponse
  );

  assert.equal(validResponse.statusCode, 201);
  assert.equal(validResponse.body.data.department.manager_member_id, 'manager-1');

  const departmentInsert = database.calls.find((call) => call.type === 'insert' && call.table === 'departments');
  const departmentAuditInsert = database.calls.find(
    (call) =>
      call.type === 'insert' &&
      call.table === 'activity_events' &&
      call.payload.action === 'organization_department_created'
  );

  assert.match(departmentInsert.payload.id, uuidPattern);
  assert.equal(departmentInsert.payload.business_profile, 'trusted-workspace');
  assert.equal(departmentInsert.payload.manager_member, 'manager-1');
  assert.match(departmentAuditInsert.payload.id, uuidPattern);
  assert.notEqual(departmentAuditInsert.payload.id, departmentInsert.payload.id);
  assert.equal(departmentAuditInsert.payload.business_profile, 'trusted-workspace');
});

for (const [scenarioName, managerRow] of [
  [
    'cross-workspace',
    {
      id: 'manager-cross',
      status: 'active',
      member_role: 'manager',
      business_profile: 'other-workspace',
      user_id: 'directus-user-2'
    }
  ],
  [
    'inactive',
    {
      id: 'manager-inactive',
      status: 'inactive',
      member_role: 'manager',
      business_profile: 'trusted-workspace',
      user_id: 'directus-user-3'
    }
  ],
  [
    'employee',
    {
      id: 'manager-employee',
      status: 'active',
      member_role: 'employee',
      business_profile: 'trusted-workspace',
      user_id: 'directus-user-4'
    }
  ],
  [
    'missing-user',
    {
      id: 'manager-missing-user',
      status: 'active',
      member_role: 'manager',
      business_profile: 'trusted-workspace',
      user_id: null
    }
  ]
]) {
  await withOwnerRoleEnv(ownerRoleId, async () => {
    const activeMembership = {
      id: `active-${scenarioName}`,
      user: `user-${scenarioName}`,
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
      managerMembersById: {
        [String(managerRow.id)]: managerRow
      }
    });

    const response = buildFakeResponse();
    await createDepartmentHandler(
      {
        accountability: { user: `user-${scenarioName}` },
        body: {
          name: 'Operations',
          manager_member_id: managerRow.id
        }
      },
      response
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.code, 'BAD_REQUEST');
    assert.equal(response.body.error.message, 'Selected manager is not eligible for this department.');
    assert.equal(database.calls.some((call) => call.table === 'departments'), false);
    assert.equal(database.calls.some((call) => call.table === 'activity_events'), false);
  });
}

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 96,
    user: 'user-unknown-manager',
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
    managerMembersById: {}
  });

  const response = buildFakeResponse();
  await createDepartmentHandler(
    {
      accountability: { user: 'user-unknown-manager' },
      body: {
        name: 'Operations',
        manager_member_id: 'unknown-member'
      }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.message, 'Selected manager is not eligible for this department.');
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 97,
    user: 'user-update-manager',
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
  const { database, updateDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    managerMembersById: {
      'hr-1': {
        id: 'hr-1',
        status: 'active',
        member_role: 'hr',
        business_profile: 'trusted-workspace',
        user_id: 'directus-user-5'
      }
    },
    departmentRowsById: {
      'department-1': {
        id: 'department-1',
        name: 'Operations',
        is_active: true,
        business_profile: 'trusted-workspace',
        manager_member: null,
        date_created: now,
        date_updated: now
      }
    }
  });

  assert.equal(typeof updateDepartmentHandler, 'function');

  const assignResponse = buildFakeResponse();
  await updateDepartmentHandler(
    {
      accountability: { user: 'user-update-manager' },
      params: { departmentId: 'department-1' },
      body: {
        manager_member_id: 'hr-1'
      }
    },
    assignResponse
  );

  assert.equal(assignResponse.statusCode, 200);
  assert.equal(assignResponse.body.data.department.manager_member_id, 'hr-1');
  assert.equal(database.scenario.departmentRowsById['department-1'].manager_member, 'hr-1');

  const clearResponse = buildFakeResponse();
  await updateDepartmentHandler(
    {
      accountability: { user: 'user-update-manager' },
      params: { departmentId: 'department-1' },
      body: {
        name: 'Operations',
        manager_member_id: null
      }
    },
    clearResponse
  );

  assert.equal(clearResponse.statusCode, 200);
  assert.equal(clearResponse.body.data.department.manager_member_id, null);
  assert.equal(database.scenario.departmentRowsById['department-1'].manager_member, null);

  const updateCalls = database.calls.filter((call) => call.type === 'update' && call.table === 'departments');
  assert.deepEqual(updateCalls[0].payload, { manager_member: 'hr-1' });
  assert.deepEqual(updateCalls[1].payload, { name: 'Operations', manager_member: null });
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 98,
    user: 'user-deactivate',
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
  const { database, deactivateDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    departmentRowsById: {
      'department-1': {
        id: 'department-1',
        name: 'Operations',
        is_active: true,
        business_profile: 'trusted-workspace',
        manager_member: 'hr-1',
        date_created: now,
        date_updated: now
      }
    }
  });

  const response = buildFakeResponse();
  await deactivateDepartmentHandler(
    {
      accountability: { user: 'user-deactivate' },
      params: { departmentId: 'department-1' }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.department.is_active, false);
  assert.equal(response.body.data.department.manager_member_id, 'hr-1');

  const departmentUpdate = database.calls.find((call) => call.type === 'update' && call.table === 'departments');
  const auditInsert = database.calls.find(
    (call) =>
      call.type === 'insert' &&
      call.table === 'activity_events' &&
      call.payload.action === 'organization_department_deactivated'
  );

  assert.deepEqual(departmentUpdate.payload, { is_active: false });
  assert.match(auditInsert.payload.id, uuidPattern);
  assert.notEqual(auditInsert.payload.id, 'department-1');
  assert.equal(auditInsert.payload.entity_id, 'department-1');
  assert.equal(database.scenario.departmentRowsById['department-1'].is_active, false);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 99,
    user: 'user-deactivate-conflict',
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
  const { database, deactivateDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    departmentRowsById: {
      'department-2': {
        id: 'department-2',
        name: 'Support',
        is_active: true,
        business_profile: 'trusted-workspace',
        manager_member: null,
        date_created: now,
        date_updated: now
      }
    },
    departmentActiveMemberCountsById: {
      'department-2': 2
    }
  });

  const response = buildFakeResponse();
  await deactivateDepartmentHandler(
    {
      accountability: { user: 'user-deactivate-conflict' },
      params: { departmentId: 'department-2' }
    },
    response
  );

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error.message, 'Deactivate the department after reassigning its active members.');
  assert.equal(database.calls.some((call) => call.type === 'update' && call.table === 'departments'), false);
  assert.equal(database.calls.some((call) => call.type === 'insert' && call.table === 'activity_events'), false);
  assert.equal(database.scenario.departmentRowsById['department-2'].is_active, true);
});

await withOwnerRoleEnv(ownerRoleId, async () => {
  const activeMembership = {
    id: 100,
    user: 'user-deactivate-forbidden',
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
  const { database, deactivateDepartmentHandler } = buildTestHarness({
    ownerRoleId,
    activeMembershipRows: [activeMembership],
    departmentRowsById: {
      'department-3': {
        id: 'department-3',
        name: 'Finance',
        is_active: true,
        business_profile: 'trusted-workspace',
        manager_member: null,
        date_created: now,
        date_updated: now
      }
    }
  });

  const response = buildFakeResponse();
  await deactivateDepartmentHandler(
    {
      accountability: { user: 'user-deactivate-forbidden' },
      params: { departmentId: 'department-3' }
    },
    response
  );

  assert.equal(response.statusCode, 403);
  assert.equal(database.calls.some((call) => call.table === 'departments'), false);
  assert.equal(database.calls.some((call) => call.table === 'activity_events'), false);
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
        name: 'Operations',
        manager_member_id: 'manager-1'
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
