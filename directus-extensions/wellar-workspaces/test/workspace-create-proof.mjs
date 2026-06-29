import assert from 'node:assert/strict';

import {
  buildCompanyPayload,
  buildCreatedWorkspaceResponse,
  logWorkspaceCreatedActivityEvent
} from '../src/index.js';

const now = '2026-06-29T00:00:00.000Z';

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
    idempotencyKey: 'idem-1'
  }
);

assert.equal(logged, true);

console.log('workspace-create-proof: ok');
