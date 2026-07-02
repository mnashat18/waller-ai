import assert from 'node:assert/strict';

import wellarEndpoint from '../src/index.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roleIds = {
  owner: '44444444-4444-4444-8444-444444444444',
  hr: '55555555-5555-4555-8555-555555555555',
  manager: '66666666-6666-4666-8666-666666666666',
  employee: '77777777-7777-4777-8777-777777777777'
};

function createFakeRouter() {
  const handlers = new Map();
  return {
    handlers,
    get(path, handler) {
      handlers.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      handlers.set(`POST ${path}`, handler);
    },
    patch(path, handler) {
      handlers.set(`PATCH ${path}`, handler);
    }
  };
}

function createFakeResponse() {
  return {
    statusCode: 0,
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function pickString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildRow(table, call, state) {
  const filters = call.filters ?? [];
  const eq = Object.fromEntries(filters.map((item) => [String(item.column).split('.').at(-1), item.value]));

  if (table === 'directus_users') {
    if (eq.id) {
      return state.usersById[String(eq.id)] ?? null;
    }
    if (eq.email) {
      return state.usersByEmail[normalizeText(eq.email)] ?? null;
    }
    return null;
  }

  if (table === 'business_profile_members as member') {
    if (eq.user && eq.business_profile) {
      const match = state.memberships.find((membership) =>
        membership.user === String(eq.user) &&
        membership.business_profile === String(eq.business_profile) &&
        (!eq.status || Array.isArray(eq.status) || normalizeText(membership.status) === normalizeText(eq.status)) &&
        (!call.whereInValues?.length || call.whereInValues.includes(normalizeText(membership.status)))
      ) ?? null;
      return match;
    }

    if (eq.user && eq.member_role === 'owner') {
      return state.ownerMemberships.find((membership) => membership.user === String(eq.user)) ?? null;
    }

    if (eq.user) {
      return state.activeMemberships.find((membership) => membership.user === String(eq.user)) ?? null;
    }
  }

  if (table === 'request_invites') {
    if (eq.id) {
      return state.invitesById[String(eq.id)] ?? null;
    }

    if (eq.business_profile && eq.email) {
      return state.pendingInvites.find((invite) =>
        invite.business_profile === String(eq.business_profile) &&
        normalizeText(invite.email) === normalizeText(eq.email) &&
        (!call.whereInValues?.length || call.whereInValues.includes(normalizeText(invite.status)))
      ) ?? null;
    }
  }

  if (table === 'request_invites as invite') {
    if (eq.id) {
      return state.invitesById[String(eq.id)] ?? null;
    }

    if (eq.business_profile && eq.email) {
      return state.pendingInvites.find((invite) =>
        invite.business_profile === String(eq.business_profile) &&
        normalizeText(invite.email) === normalizeText(eq.email) &&
        (!call.whereInValues?.length || call.whereInValues.includes(normalizeText(invite.status)))
      ) ?? null;
    }
  }

  if (table === 'notifications') {
    return state.notifications.find((notification) =>
      notification.user === String(eq.user) &&
      notification.link_type === String(eq.link_type) &&
      notification.link_id === String(eq.link_id)
    ) ?? null;
  }

  if (table === 'departments as department') {
    return state.departments[String(eq.id)] ?? null;
  }

  if (table === 'directus_roles' && eq.id) {
    return state.roleIds.includes(String(eq.id)) ? { id: String(eq.id) } : null;
  }

  return null;
}

function createQueryBuilder(table, state, scope) {
  const call = {
    table,
    scope,
    filters: [],
    whereInValues: []
  };

  const builder = {
    leftJoin() { return builder; },
    innerJoin() { return builder; },
    select() { return builder; },
    where(columnOrObject, value) {
      if (typeof columnOrObject === 'object' && columnOrObject !== null) {
    for (const [column, item] of Object.entries(columnOrObject)) {
          call.filters.push({ column, value: item });
        }
      } else {
        call.filters.push({ column: columnOrObject, value });
      }
      return builder;
    },
    andWhere(columnOrObject, value) {
      return builder.where(columnOrObject, value);
    },
    whereIn(column, values) {
      call.filters.push({ column, value: values });
      call.whereInValues = Array.isArray(values) ? values.map((item) => normalizeText(item)) : [];
      return builder;
    },
    orderBy() { return builder; },
    forUpdate() { return builder; },
    count() { return builder; },
    insert(payload) {
      state.calls.push({ type: 'insert', table, payload, scope });

      if (table === 'request_invites') {
        const invite = {
          id: `invite-${state.nextInviteId++}`,
          ...payload
        };
        state.invitesById[invite.id] = invite;
        state.pendingInvites.push(invite);
        return {
          returning: async () => [invite]
        };
      }

      if (table === 'notifications') {
        const notification = {
          id: `notification-${state.nextNotificationId++}`,
          ...payload
        };
        state.notifications.push(notification);
        return {
          returning: async () => [{ id: notification.id }]
        };
      }

      if (table === 'business_profile_members') {
        const membership = {
          id: `membership-${state.nextMembershipId++}`,
          ...payload
        };
        state.memberships.push(membership);
        return {
          returning: async () => [membership]
        };
      }

      return {
        returning: async () => []
      };
    },
    update(payload) {
      state.calls.push({ type: 'update', table, payload, scope, filters: [...call.filters] });

      if (table === 'request_invites') {
        const row = buildRow(table, call, state);
        if (row) {
          Object.assign(row, payload);
        }
        return Promise.resolve(1);
      }

      if (table === 'notifications') {
        const row = buildRow(table, call, state);
        if (row) {
          Object.assign(row, payload);
        }
        return Promise.resolve(1);
      }

      if (table === 'directus_users') {
        const row = buildRow(table, call, state);
        if (row) {
          Object.assign(row, payload);
        }
        return Promise.resolve(1);
      }

      return Promise.resolve(1);
    },
    first: async () => buildRow(table, call, state),
    then(resolve, reject) {
      if (table === 'directus_roles' && call.whereInValues.length) {
        const rows = call.whereInValues
          .map((id) => state.roleIds.includes(id) ? { id } : null)
          .filter(Boolean);
        return Promise.resolve(rows).then(resolve, reject);
      }

      const row = buildRow(table, call, state);
      return Promise.resolve(row ? [row] : []).then(resolve, reject);
    }
  };

  return builder;
}

function createFakeDatabase(scenario) {
  const state = {
    calls: [],
    nextInviteId: 1,
    nextNotificationId: 1,
    nextMembershipId: 1,
    roleIds: Object.values(roleIds),
    usersById: scenario.usersById ?? {},
    usersByEmail: scenario.usersByEmail ?? {},
    activeMemberships: scenario.activeMemberships ?? [],
    ownerMemberships: scenario.ownerMemberships ?? [],
    memberships: scenario.memberships ?? [],
    invitesById: scenario.invitesById ?? {},
    pendingInvites: scenario.pendingInvites ?? [],
    notifications: scenario.notifications ?? [],
    departments: scenario.departments ?? {}
  };

  const database = (table) => createQueryBuilder(table, state, 'outside');
  database.raw = async () => undefined;
  database.fn = {
    now: () => '2026-06-29T00:00:00.000Z'
  };
  database.transaction = async (callback) => {
    const trx = (table) => createQueryBuilder(table, state, 'transaction');
    trx.raw = async () => undefined;
    trx.fn = database.fn;
    return callback(trx);
  };
  database.state = state;
  return database;
}

function mountEndpoint(database, routeErrors = []) {
  const router = createFakeRouter();
  wellarEndpoint.handler(router, {
    database,
    logger: {
      error(meta, message) {
        routeErrors.push({ meta, message });
      }
    }
  });
  return router.handlers;
}

async function withRoleEnv(callback) {
  const previous = {
    owner: process.env.WELLAR_OWNER_ROLE_ID,
    hr: process.env.WELLAR_HR_ROLE_ID,
    manager: process.env.WELLAR_MANAGER_ROLE_ID,
    employee: process.env.WELLAR_EMPLOYEE_ROLE_ID,
    directusUrl: process.env.DIRECTUS_URL,
    apiUrl: process.env.API_URL
  };

  process.env.WELLAR_OWNER_ROLE_ID = roleIds.owner;
  process.env.WELLAR_HR_ROLE_ID = roleIds.hr;
  process.env.WELLAR_MANAGER_ROLE_ID = roleIds.manager;
  process.env.WELLAR_EMPLOYEE_ROLE_ID = roleIds.employee;
  process.env.DIRECTUS_URL = 'https://directus.example.com';
  process.env.API_URL = 'https://directus.example.com';

  try {
    await callback();
  } finally {
    process.env.WELLAR_OWNER_ROLE_ID = previous.owner;
    process.env.WELLAR_HR_ROLE_ID = previous.hr;
    process.env.WELLAR_MANAGER_ROLE_ID = previous.manager;
    process.env.WELLAR_EMPLOYEE_ROLE_ID = previous.employee;
    process.env.DIRECTUS_URL = previous.directusUrl;
    process.env.API_URL = previous.apiUrl;
  }
}

function routePayload(inviteId, userId, email = 'new.person@example.com') {
  return {
    accountability: { user: userId },
    params: inviteId ? { inviteId } : undefined,
    body: {
      email,
      member_role: 'manager',
      department: 'department-1'
    }
  };
}

await withRoleEnv(async () => {
  const database = createFakeDatabase({
    usersById: {
      'user-owner': {
        id: 'user-owner',
        email: 'owner@example.com',
        first_name: 'Owner',
        last_name: 'User'
      },
      'user-target': {
        id: 'user-target',
        email: 'new.person@example.com',
        first_name: 'New',
        last_name: 'Person'
      },
      'user-target-2': {
        id: 'user-target-2',
        email: 'second.person@example.com',
        first_name: 'Second',
        last_name: 'Person'
      }
    },
    usersByEmail: {
      'owner@example.com': {
        id: 'user-owner',
        email: 'owner@example.com',
        first_name: 'Owner',
        last_name: 'User'
      },
      'new.person@example.com': {
        id: 'user-target',
        email: 'new.person@example.com',
        first_name: 'New',
        last_name: 'Person'
      },
      'second.person@example.com': {
        id: 'user-target-2',
        email: 'second.person@example.com',
        first_name: 'Second',
        last_name: 'Person'
      }
    },
    activeMemberships: [
      {
        id: 'membership-owner',
        user: 'user-owner',
        status: 'active',
        member_role: 'owner',
        workspace_id: 'profile-1',
        department_id: null,
        company_name: 'Northwind Logistics',
        workspace_is_active: true,
        plan_code: 'free',
        billing_status: 'trialing'
      }
    ],
    invitesById: {},
    notifications: [],
    departments: {
      'department-1': {
        id: 'department-1',
        name: 'Operations',
        is_active: true,
        business_profile: 'profile-1'
      }
    }
  });
  const routeErrors = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Unexpected fetch during in-app invite flow.');
  };

  try {
    const handlers = mountEndpoint(database, routeErrors);
    const createInvite = handlers.get('POST /workspaces/invites');
    const getInvite = handlers.get('GET /workspaces/invites/:inviteId');
    const acceptInvite = handlers.get('POST /workspaces/invites/:inviteId/accept');
    const declineInvite = handlers.get('POST /workspaces/invites/:inviteId/decline');

    const inAppResponse = createFakeResponse();
    await createInvite(routePayload(null, 'user-owner'), inAppResponse);
    assert.equal(inAppResponse.statusCode, 201);
    assert.equal(inAppResponse.body.data.deliveryChannel, 'in_app');
    assert.equal(inAppResponse.body.data.message, 'Invitation sent in Wellar.');
    assert.equal(database.state.calls.filter((call) => call.table === 'notifications' && call.type === 'insert').length, 1);
    assert.equal(database.state.calls.filter((call) => call.table === 'business_profile_members' && call.type === 'insert').length, 0);
    assert.equal(database.state.calls.filter((call) => call.table === 'directus_users' && call.type === 'update').length, 0);
    assert.equal(database.state.calls.filter((call) => call.table === 'request_invites' && call.type === 'insert').length, 1);
    assert.equal(database.state.notifications[0].business_profile, null);
    assert.equal(database.state.notifications[0].link_type, 'invite');
    assert.equal(database.state.notifications[0].link_id, inAppResponse.body.data.inviteId);

    const duplicateInviteResponse = createFakeResponse();
    await createInvite(routePayload(null, 'user-owner'), duplicateInviteResponse);
    assert.equal(duplicateInviteResponse.statusCode, 200);
    assert.equal(duplicateInviteResponse.body.data.inviteId, inAppResponse.body.data.inviteId);
    assert.equal(database.state.calls.filter((call) => call.table === 'request_invites' && call.type === 'insert').length, 1);
    assert.equal(database.state.calls.filter((call) => call.table === 'notifications' && call.type === 'insert').length, 1);

    const inviteId = inAppResponse.body.data.inviteId;
    const detailResponse = createFakeResponse();
    await getInvite({ accountability: { user: 'user-target' }, params: { inviteId } }, detailResponse);
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.body.data.canAct, true);
    assert.equal(detailResponse.body.data.inviteType, 'in_app');

    const wrongUserResponse = createFakeResponse();
    await getInvite({ accountability: { user: 'user-owner' }, params: { inviteId } }, wrongUserResponse);
    assert.equal(wrongUserResponse.statusCode, 404);

    const acceptResponse = createFakeResponse();
    await acceptInvite({ accountability: { user: 'user-target' }, params: { inviteId } }, acceptResponse);
    assert.equal(acceptResponse.statusCode, 200, JSON.stringify({ body: acceptResponse.body, routeErrors }));
    assert.equal(acceptResponse.body.data.ok, true);
    assert.equal(acceptResponse.body.data.membershipId, 'membership-1');
    assert.equal(database.state.memberships.filter((item) => item.user === 'user-target' && item.business_profile === 'profile-1').length, 1);
    assert.equal(database.state.calls.filter((call) => call.table === 'directus_users' && call.type === 'update').length, 0);
    assert.equal(database.state.invitesById[inviteId].status, 'claimed');
    assert.equal(database.state.invitesById[inviteId].accepted_user, 'user-target');
    assert.ok(database.state.invitesById[inviteId].claimed_at);

    const acceptAgain = createFakeResponse();
    await acceptInvite({ accountability: { user: 'user-target' }, params: { inviteId } }, acceptAgain);
    assert.equal(acceptAgain.statusCode, 200);
    assert.equal(database.state.memberships.filter((item) => item.user === 'user-target' && item.business_profile === 'profile-1').length, 1);

    const declineInviteResponse = createFakeResponse();
    const declineCreate = createFakeResponse();
    await createInvite(routePayload(null, 'user-owner', 'second.person@example.com'), declineCreate);
    const declinedInviteId = declineCreate.body.data.inviteId;

    await declineInvite({ accountability: { user: 'user-target-2' }, params: { inviteId: declinedInviteId } }, declineInviteResponse);
    assert.equal(declineInviteResponse.statusCode, 200);
    assert.equal(database.state.invitesById[declinedInviteId].status, 'revoked');
    assert.equal(database.state.memberships.filter((item) => item.user === 'user-target-2' && item.business_profile === 'profile-1').length, 0);
    assert.equal(database.state.calls.filter((call) => call.table === 'directus_users' && call.type === 'update').length, 0);

    const declineAgain = createFakeResponse();
    await declineInvite({ accountability: { user: 'user-target-2' }, params: { inviteId: declinedInviteId } }, declineAgain);
    assert.equal(declineAgain.statusCode, 200);
    assert.equal(declineAgain.body.data.message, 'Invitation already declined.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await withRoleEnv(async () => {
  const database = createFakeDatabase({
    usersById: {
      'user-owner': {
        id: 'user-owner',
        email: 'owner@example.com'
      }
    },
    usersByEmail: {
      'external@example.com': null
    },
    activeMemberships: [
      {
        id: 'membership-owner',
        user: 'user-owner',
        status: 'active',
        member_role: 'owner',
        workspace_id: 'profile-1',
        department_id: null,
        company_name: 'Northwind Logistics',
        workspace_is_active: true,
        plan_code: 'free',
        billing_status: 'trialing'
      }
    ],
    pendingInvites: [],
    notifications: [],
    departments: {
      'department-1': {
        id: 'department-1',
        name: 'Operations',
        is_active: true,
        business_profile: 'profile-1'
      }
    }
  });

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    const payload = JSON.parse(options.body);
    const invite = {
      id: 'invite-external',
      ...payload,
      company_name: 'Northwind Logistics'
    };
    database.state.invitesById[invite.id] = invite;
    database.state.pendingInvites.push(invite);
    return {
      ok: true,
      status: 201,
      json: async () => ({ data: { id: invite.id } })
    };
  };

  try {
    const handlers = mountEndpoint(database);
    const createInvite = handlers.get('POST /workspaces/invites');
    const response = createFakeResponse();
    await createInvite(routePayload(null, 'user-owner', 'external@example.com'), response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.data.deliveryChannel, 'email');
    assert.equal(response.body.data.message, 'Email invitation sent.');
    assert.equal(fetchCalls.length, 1);
    assert.equal(database.state.calls.filter((call) => call.table === 'notifications' && call.type === 'insert').length, 0);
    assert.equal(database.state.calls.filter((call) => call.table === 'request_invites' && call.type === 'insert').length, 0);

    const duplicateExternal = createFakeResponse();
    await createInvite(routePayload(null, 'user-owner', 'external@example.com'), duplicateExternal);
    assert.equal(duplicateExternal.statusCode, 200);
    assert.equal(fetchCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await withRoleEnv(async () => {
  const database = createFakeDatabase({
    usersById: {
      'user-owner': {
        id: 'user-owner',
        email: 'owner@example.com'
      },
      'user-member': {
        id: 'user-member',
        email: 'new.person@example.com'
      }
    },
    usersByEmail: {
      'new.person@example.com': {
        id: 'user-member',
        email: 'new.person@example.com'
      }
    },
    activeMemberships: [
      {
        id: 'membership-owner',
        user: 'user-owner',
        status: 'active',
        member_role: 'owner',
        workspace_id: 'profile-1',
        department_id: null,
        company_name: 'Northwind Logistics',
        workspace_is_active: true,
        plan_code: 'free',
        billing_status: 'trialing'
      }
    ],
    memberships: [
      {
        id: 'existing-member',
        user: 'user-member',
        business_profile: 'profile-1',
        status: 'active',
        member_role: 'employee'
      }
    ],
    departments: {
      'department-1': {
        id: 'department-1',
        name: 'Operations',
        is_active: true,
        business_profile: 'profile-1'
      }
    }
  });

  const handlers = mountEndpoint(database);
  const createInvite = handlers.get('POST /workspaces/invites');
  const response = createFakeResponse();
  await createInvite(routePayload(null, 'user-owner'), response);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error.code, 'CONFLICT');
  assert.equal(database.state.calls.filter((call) => call.type === 'insert' && call.table === 'request_invites').length, 0);
  assert.equal(database.state.calls.filter((call) => call.type === 'insert' && call.table === 'notifications').length, 0);
});

console.log('invites-proof: ok');
