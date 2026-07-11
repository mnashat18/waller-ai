import assert from 'node:assert/strict';

import extension from '../src/index.js';

function captureRoutes() {
  const routes = new Map();
  const router = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler);
    },
    delete(path, handler) {
      routes.set(`DELETE ${path}`, handler);
    },
    patch(path, handler) {
      routes.set(`PATCH ${path}`, handler);
    }
  };

  return { router, routes };
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

function createLogger() {
  const entries = [];
  return {
    entries,
    info(message) {
      entries.push(['info', message]);
    },
    error(message) {
      entries.push(['error', message]);
    }
  };
}

function createMailServiceMock(record) {
  return class MailServiceMock {
    constructor(options) {
      record.constructors.push(options);
      this.options = options;
    }

    async send(payload) {
      record.sends.push(payload);
      if (record.failSend) {
        throw new Error('mail failed');
      }
    }
  };
}

function createDatabaseProxy() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('database should not be queried for account deletion requests');
      }
    }
  );
}

async function invokeAccountDeletion(route, { body, envEmail, ip, mailRecord, schema, logger }) {
  const originalRecipient = process.env.ACCOUNT_DELETION_RECIPIENT_EMAIL;
  if (envEmail === undefined) {
    delete process.env.ACCOUNT_DELETION_RECIPIENT_EMAIL;
  } else {
    process.env.ACCOUNT_DELETION_RECIPIENT_EMAIL = envEmail;
  }

  const req = {
    body,
    headers: ip ? { 'x-forwarded-for': ip } : {},
    ip: ip ? '203.0.113.9' : undefined
  };
  const res = createResponse();

  try {
    await route(req, res);
  } finally {
    if (originalRecipient === undefined) {
      delete process.env.ACCOUNT_DELETION_RECIPIENT_EMAIL;
    } else {
      process.env.ACCOUNT_DELETION_RECIPIENT_EMAIL = originalRecipient;
    }
  }

  return { req, res, mailRecord, schema, logger };
}

async function main() {
  const { router, routes } = captureRoutes();
  const logger = createLogger();
  const mailRecord = { constructors: [], sends: [], failSend: false };
  const database = createDatabaseProxy();
  const schema = { tables: true };
  const services = { MailService: createMailServiceMock(mailRecord) };

  extension.handler(router, {
    database,
    getSchema: async () => schema,
    logger,
    services
  });

  const expectedRoutes = new Set([
    'GET /organization',
    'GET /scan-requests',
    'GET /workforce',
    'GET /workspaces/context',
    'GET /workspaces/invites/:inviteId',
    'PATCH /organization/departments/:departmentId',
    'PATCH /organization/profile',
    'POST /account-deletion-requests',
    'POST /alerts/:alertId/workflow',
    'POST /organization/departments',
    'POST /organization/departments/:departmentId/deactivate',
    'POST /scan-requests',
    'POST /workspaces/create',
    'POST /workspaces/invites',
    'POST /workspaces/invites/:inviteId/accept',
    'POST /workspaces/invites/:inviteId/decline',
    'POST /workspaces/switch'
  ]);

  assert.deepEqual(new Set(routes.keys()), expectedRoutes);
  const accountDeletionRoute = routes.get('POST /account-deletion-requests');
  assert.equal(typeof accountDeletionRoute, 'function');

  let result = await invokeAccountDeletion(accountDeletionRoute, {
    body: { email: '  Person@Example.com  ', reason: 'Need account removal', confirmed: true },
    envEmail: '  deletions@example.com  ',
    ip: '198.51.100.25',
    mailRecord,
    schema,
    logger
  });

  assert.equal(result.res.statusCode, 202);
  assert.deepEqual(result.res.body, {
    accepted: true,
    message:
      'Your account deletion request has been received. If the account information matches our records, the Wellar team will process the request and contact you if additional verification is required.'
  });
  assert.equal(mailRecord.constructors.length, 1);
  assert.deepEqual(mailRecord.constructors[0], {
    schema,
    accountability: null,
    knex: database
  });
  assert.equal(mailRecord.sends.length, 1);
  const sentText = mailRecord.sends[0].text;
  assert.deepEqual(mailRecord.sends[0], {
    to: 'deletions@example.com',
    subject: 'Wellar account deletion request',
    text: sentText
  });
  assert.match(
    sentText,
    /^Request type: account_deletion\nNormalized account email: person@example\.com\nOptional reason: Need account removal\nRequested timestamp \(UTC\): .+\nStaff must verify identity before deletion\.$/
  );
  assert.ok(logger.entries.some(([level, message]) => level === 'info' && message === '[ACCOUNT_DELETION_REQUEST] accepted=true mail_sent=true'));
  assert.equal(String(logger.entries.map((entry) => entry.join(' ')).join('\n')).includes('Person@Example.com'), false);
  assert.equal(String(logger.entries.map((entry) => entry.join(' ')).join('\n')).includes('Need account removal'), false);

  const constructorCountAfterSuccess = mailRecord.constructors.length;
  const sendCountAfterSuccess = mailRecord.sends.length;
  result = await invokeAccountDeletion(accountDeletionRoute, {
    body: { email: 'person@example.com', reason: 'Need account removal', confirmed: true },
    envEmail: 'deletions@example.com',
    ip: '198.51.100.25',
    mailRecord,
    schema,
    logger
  });
  assert.equal(result.res.statusCode, 202);
  assert.equal(mailRecord.constructors.length, constructorCountAfterSuccess);
  assert.equal(mailRecord.sends.length, sendCountAfterSuccess);
  assert.ok(logger.entries.some(([level, message]) => level === 'info' && message === '[ACCOUNT_DELETION_REQUEST] accepted=true duplicate_suppressed=true'));

  result = await invokeAccountDeletion(accountDeletionRoute, {
    body: { email: 'other@example.com', reason: 'Need account removal', confirmed: true },
    envEmail: undefined,
    ip: '198.51.100.26',
    mailRecord,
    schema,
    logger
  });
  const constructorCountBeforeMissingRecipient = mailRecord.constructors.length;
  assert.equal(result.res.statusCode, 503);
  assert.equal(mailRecord.constructors.length, constructorCountBeforeMissingRecipient);
  assert.equal(mailRecord.sends.length, sendCountAfterSuccess);
  assert.ok(logger.entries.some(([level, message]) => level === 'error' && message === '[ACCOUNT_DELETION_REQUEST] accepted=false reason=mail_unavailable'));

  const validationBodies = [
    { email: 123, reason: 'x', confirmed: true },
    { email: 'x@example.com', reason: 123, confirmed: true },
    { email: 'x@example.com', reason: 'a'.repeat(1001), confirmed: true },
    { email: 'x@example.com', reason: 'ok', confirmed: false },
    { email: 'x@example.com', reason: 'ok', confirmed: true, extra: true }
  ];

  for (const body of validationBodies) {
    const constructorCountBeforeValidation = mailRecord.constructors.length;
    const sendCountBeforeValidation = mailRecord.sends.length;
    result = await invokeAccountDeletion(accountDeletionRoute, {
      body,
      envEmail: 'deletions@example.com',
      ip: '198.51.100.27',
      mailRecord,
      schema,
      logger
    });
    assert.equal(result.res.statusCode, 400);
    assert.equal(mailRecord.constructors.length, constructorCountBeforeValidation);
    assert.equal(mailRecord.sends.length, sendCountBeforeValidation);
  }

  const ipEmailBase = 'bulk';
  for (let index = 0; index < 5; index += 1) {
    result = await invokeAccountDeletion(accountDeletionRoute, {
      body: {
        email: `${ipEmailBase}${index}@example.com`,
        reason: 'ok',
        confirmed: true
      },
      envEmail: 'deletions@example.com',
      ip: '203.0.113.45',
      mailRecord,
      schema,
      logger
    });
    assert.equal(result.res.statusCode, 202);
  }

  const sendsBeforeSixth = mailRecord.sends.length;
  result = await invokeAccountDeletion(accountDeletionRoute, {
    body: {
      email: 'bulk5@example.com',
      reason: 'ok',
      confirmed: true
    },
    envEmail: 'deletions@example.com',
    ip: '203.0.113.45',
    mailRecord,
    schema,
    logger
  });
  assert.equal(result.res.statusCode, 202);
  assert.equal(mailRecord.sends.length, sendsBeforeSixth);
  assert.ok(logger.entries.some(([level, message]) => level === 'info' && message === '[ACCOUNT_DELETION_REQUEST] accepted=true duplicate_suppressed=true'));

  console.log('account-deletion assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
