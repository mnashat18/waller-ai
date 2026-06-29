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

function createQueryBuilder(table, calls) {
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
    where() {
      return builder;
    },
    andWhere() {
      return builder;
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
    first: async () => undefined,
    update: async (updatePayload) => {
      calls.push({ type: 'update', table, payload: updatePayload });
      return 1;
    },
    insert(insertPayload) {
      calls.push({ type: 'insert', table, payload: insertPayload });

      if (table === 'business_profiles') {
        assertRequiredUuidId(table, insertPayload);
      }

      if (table === 'business_profile_members') {
        assert.equal(Object.hasOwn(insertPayload, 'id'), false, 'business_profile_members.id must be database-generated');
      }

      if (table === 'activity_events') {
        assertRequiredUuidId(table, insertPayload);
        throw Object.assign(new Error('audit logging unavailable'), {
          name: 'DatabaseError',
          code: '23514'
        });
      }

      return builder;
    },
    returning: async () => {
      const lastInsert = calls.findLast((call) => call.type === 'insert' && call.table === table);

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

      return [];
    }
  };

  return builder;
}

function createFakeDatabase() {
  const calls = [];
  const makeDatabase = () => {
    const database = (table) => createQueryBuilder(table, calls);
    database.raw = async () => undefined;
    database.transaction = async (callback) => {
      const trx = (table) => createQueryBuilder(table, calls);
      trx.raw = async () => undefined;
      return callback(trx);
    };
    database.calls = calls;
    return database;
  };

  return makeDatabase();
}

const router = buildFakeRouter();
const database = createFakeDatabase();
const routeLoggerCalls = [];
wellarEndpoint.handler(router, {
  database,
  logger: {
    error(meta, message) {
      routeLoggerCalls.push({ meta, message });
    }
  }
});

const createWorkspaceHandler = router.handlers.get('POST /workspaces/create');
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

assert.match(createdProfileInsert.payload.id, uuidPattern);
assert.equal(Object.hasOwn(createdMembershipInsert.payload, 'id'), false);
assert.match(createdActivityInsert.payload.id, uuidPattern);
assert.equal(createdMembershipInsert.payload.business_profile, createdProfileInsert.payload.id);
assert.equal(createdActivityInsert.payload.business_profile, createdProfileInsert.payload.id);

assert.equal(routeLoggerCalls.length, 1);
assert.equal(routeLoggerCalls[0].message, '[wellar] workspace creation audit log failed');
assert.equal(routeLoggerCalls[0].meta.table, 'activity_events');
assert.equal(routeLoggerCalls[0].meta.errorCode, '23514');

console.log('workspace-create-proof: ok');
