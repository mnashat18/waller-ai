const directusUrl = (process.env.DIRECTUS_URL || process.env.API_URL || '').trim().replace(/\/+$/, '');
const adminToken = (process.env.DIRECTUS_ADMIN_TOKEN || '').trim();
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').trim().toLowerCase());

if (!directusUrl) {
  console.error('Missing DIRECTUS_URL (or API_URL).');
  process.exit(1);
}

if (!adminToken) {
  console.error('Missing DIRECTUS_ADMIN_TOKEN.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${adminToken}`,
  'Content-Type': 'application/json'
};

async function request(path, options = {}) {
  const response = await fetch(`${directusUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchIds(path) {
  const data = await request(path);
  return Array.isArray(data?.data) ? data.data : [];
}

async function patchItem(path, payload) {
  if (dryRun) {
    return;
  }
  await request(path, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

async function updateCollectionRoles(collection, roleField = 'member_role') {
  const rows = await fetchIds(
    `/items/${collection}?fields=id,${roleField}&filter[${roleField}][_eq]=manger&limit=-1`
  );

  for (const row of rows) {
    await patchItem(`/items/${collection}/${encodeURIComponent(String(row.id))}`, {
      [roleField]: 'manager'
    });
  }

  return rows.length;
}

async function updateUserActiveRoles() {
  const rows = await fetchIds('/users?fields=id,active_member_role&filter[active_member_role][_eq]=manger&limit=-1');

  for (const row of rows) {
    await patchItem(`/users/${encodeURIComponent(String(row.id))}`, {
      active_member_role: 'manager'
    });
  }

  return rows.length;
}

async function main() {
  const requestInvites = await updateCollectionRoles('request_invites');
  const businessProfileMembers = await updateCollectionRoles('business_profile_members');
  const users = await updateUserActiveRoles();

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        updated: {
          request_invites: requestInvites,
          business_profile_members: businessProfileMembers,
          users_active_member_role: users
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Failed to repair manager role typo.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
