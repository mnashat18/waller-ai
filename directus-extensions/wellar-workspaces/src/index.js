import { randomUUID } from 'node:crypto';

const MAX_TEXT = 255;
const MAX_COMPANY_NAME = 120;
const PUSH_WEBHOOK_TIMEOUT_MS = 5000;
const MAX_PERSON_NAME = 80;
const MAX_PHONE = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_INPUT_KEYS = new Set([
  'user',
  'user_id',
  'userId',
  'requested_by_user',
  'role',
  'member_role',
  'memberRole',
  'owner',
  'is_owner',
  'isOwner',
  'business_profile',
  'businessProfile',
  'business_profile_id',
  'businessProfileId',
  'workspace',
  'workspace_id',
  'workspaceId',
  'membership',
  'membership_id',
  'membershipId'
]);
const WORKSPACE_PLACEHOLDER_VALUES = new Set([
  'test',
  'testing',
  'demo',
  'sample',
  'placeholder',
  'example',
  'lorem ipsum',
  'dummy',
  'temp',
  'n/a',
  'na',
  'none',
  'first name',
  'last name',
  'company name',
  'your company',
  'your name'
]);

function badRequest(res, message, details = undefined) {
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message, details } });
}
function unauthorized(res, message) {
  return res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
}

function forbidden(res, message) {
  return res.status(403).json({ error: { code: 'FORBIDDEN', message } });
}

function notFound(res, message) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function conflict(res, message) {
  return res.status(409).json({ error: { code: 'CONFLICT', message } });
}

function serverError(res, message) {
  return res.status(500).json({ error: { code: 'SERVER_ERROR', message } });
}

function configurationError(res, message) {
  return res.status(500).json({ error: { code: 'CONFIGURATION_ERROR', message } });
}

function pickString(value, max = MAX_TEXT) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
}

function pickInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) {
    return null;
  }

  return parsed;
}

function normalizeWebsite(value) {
  const raw = pickString(value, MAX_TEXT);
  if (!raw) {
    return null;
  }

  try {
    const normalized = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return normalized.toString().replace(/\/$/, '').slice(0, MAX_TEXT);
  } catch {
    return null;
  }
}

function normalizeWhitespace(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s+/g, ' ');
}

function isPlaceholderValue(value) {
  const normalized = normalizeWhitespace(value)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  return WORKSPACE_PLACEHOLDER_VALUES.has(normalized);
}

function validateNameField(value, label) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { error: `${label} is required.` };
  }

  if (normalized.length < 2 || normalized.length > MAX_PERSON_NAME) {
    return { error: `${label} must be between 2 and ${MAX_PERSON_NAME} characters.` };
  }

  if (!/^[\p{L}\p{M}][\p{L}\p{M}\p{N}\s.'-]*$/u.test(normalized)) {
    return { error: `${label} can contain letters, numbers, spaces, apostrophes, periods, and hyphens only.` };
  }

  if (isPlaceholderValue(normalized)) {
    return { error: `${label} must use a real value.` };
  }

  return { value: normalized };
}

function validateCompanyName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { error: 'Company name is required.' };
  }

  if (normalized.length < 2 || normalized.length > MAX_COMPANY_NAME) {
    return { error: `Company name must be between 2 and ${MAX_COMPANY_NAME} characters.` };
  }

  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s&'.,()\/-]*$/u.test(normalized)) {
    return { error: 'Company name contains unsupported characters.' };
  }

  if (isPlaceholderValue(normalized)) {
    return { error: 'Company name must use a real organization name.' };
  }

  return { value: normalized };
}

function validateWorkEmail(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { error: 'Work email is required.' };
  }

  if (normalized.length > MAX_TEXT) {
    return { error: 'Work email is too long.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: 'Work email must be a valid email address.' };
  }

  return { value: normalized.toLowerCase() };
}

function validateCountry(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { error: 'Country is required.' };
  }

  if (normalized.length < 2 || normalized.length > 80) {
    return { error: 'Country must be between 2 and 80 characters.' };
  }

  if (!/^[\p{L}\p{M}\p{N}\s.'/-]+$/u.test(normalized)) {
    return { error: 'Country contains unsupported characters.' };
  }

  if (isPlaceholderValue(normalized)) {
    return { error: 'Country must use a real value.' };
  }

  return { value: normalized };
}

function validateOptionalPhone(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { value: null };
  }

  if (normalized.length > MAX_PHONE) {
    return { error: `Phone number must be between 7 and ${MAX_PHONE} characters.` };
  }

  if (!/^[+()\d\s.-]+$/.test(normalized)) {
    return { error: 'Phone number contains unsupported characters.' };
  }

  if (normalized.replace(/\D/g, '').length < 7) {
    return { error: 'Phone number must include at least 7 digits.' };
  }

  return { value: normalized };
}

function splitLegacyContactName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return {
    firstName: parts.shift(),
    lastName: parts.join(' ')
  };
}

function hasForbiddenInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  return Object.keys(body).some((key) => FORBIDDEN_INPUT_KEYS.has(key));
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid UUID.`);
  }
}

function readOwnerRoleIdFromEnv(env = process.env) {
  const ownerRoleId = pickString(env.WELLAR_OWNER_ROLE_ID);
  if (!ownerRoleId) {
    return { error: 'WELLAR_OWNER_ROLE_ID must be configured to an existing Directus Owner role UUID.' };
  }

  if (!UUID_PATTERN.test(ownerRoleId)) {
    return { error: 'WELLAR_OWNER_ROLE_ID must be a valid UUID.' };
  }

  return { value: ownerRoleId };
}

function buildWorkspaceRecordIds(createId = randomUUID) {
  const ids = {
    businessProfileId: createId(),
    activityEventId: createId()
  };
  const values = Object.values(ids);

  assertUuid(ids.businessProfileId, 'business_profiles.id');
  assertUuid(ids.activityEventId, 'activity_events.id');

  if (new Set(values).size !== values.length) {
    throw new Error('Generated workspace record ids must be unique.');
  }

  return ids;
}

function buildDepartmentInsertPayload(name, businessProfileId, managerMemberId = null, createId = randomUUID) {
  const departmentId = createId();
  assertUuid(departmentId, 'departments.id');

  return {
    id: departmentId,
    business_profile: businessProfileId,
    name,
    is_active: true,
    manager_member: managerMemberId
  };
}

function buildBusinessProfileInsertPayload(companyPayload, recordIds) {
  return {
    id: recordIds.businessProfileId,
    ...companyPayload
  };
}

function buildOwnerMembershipInsertPayload(userId, businessProfileId, now) {
  return {
    user: userId,
    business_profile: businessProfileId,
    member_role: 'owner',
    status: 'active',
    joined_at: now
  };
}

function buildCompanyPayload(body, userId, now) {
  const companyNameResult = validateCompanyName(body?.company_name ?? body?.companyName);
  if (companyNameResult.error) {
    return { error: companyNameResult.error };
  }

  const legacyContactName = splitLegacyContactName(body?.contact_name ?? body?.contactName);
  const firstNameResult = validateNameField(
    body?.first_name ?? body?.firstName ?? legacyContactName?.firstName,
    'First name'
  );
  const lastNameResult = validateNameField(
    body?.last_name ?? body?.lastName ?? legacyContactName?.lastName,
    'Last name'
  );

  if (firstNameResult.error) {
    return { error: firstNameResult.error };
  }

  if (lastNameResult.error) {
    return { error: lastNameResult.error };
  }

  const workEmailResult = validateWorkEmail(body?.work_email ?? body?.workEmail);
  if (workEmailResult.error) {
    return { error: workEmailResult.error };
  }

  const countryResult = validateCountry(body?.country);
  if (countryResult.error) {
    return { error: countryResult.error };
  }

  const phoneResult = validateOptionalPhone(body?.phone);
  if (phoneResult.error) {
    return { error: phoneResult.error };
  }

  return {
    value: {
      owner_user: userId,
      company_name: companyNameResult.value,
      contact_name: `${firstNameResult.value} ${lastNameResult.value}`.trim(),
      work_email: workEmailResult.value,
      phone: phoneResult.value,
      industry: pickString(body?.industry, 80),
      team_size: pickInteger(body?.team_size ?? body?.teamSize),
      country: countryResult.value,
      city: pickString(body?.city, 80),
      website: normalizeWebsite(body?.website),
      billing_status: 'trialing',
      is_active: true,
      plan_code: 'free',
      trial_started_at: now,
      timezone: pickString(body?.timezone, 80),
      default_language: pickString(body?.default_language ?? body?.defaultLanguage, 20)
    }
  };
}

function normalizeRole(value) {
  const normalized = pickString(value)?.toLowerCase() ?? '';
  if (normalized === 'admin') return 'hr';
  if (normalized === 'manger') return 'manager';
  if (normalized === 'member' || normalized === 'viewer') return 'employee';
  return normalized || null;
}

function rolePriority(role) {
  if (role === 'owner') return 4;
  if (role === 'hr') return 3;
  if (role === 'manager') return 2;
  if (role === 'employee') return 1;
  return 0;
}

function publicWorkspace(row) {
  return {
    id: String(row.workspace_id ?? row.id ?? ''),
    companyName: row.company_name ?? 'Organization',
    isActive: row.workspace_is_active === true || row.is_active === true,
    planCode: row.plan_code ?? null,
    billingStatus: row.billing_status ?? null
  };
}

function publicDepartment(row) {
  const departmentId = pickString(row.department_id ?? row.department);
  if (!departmentId) {
    return null;
  }

  return {
    id: departmentId,
    name: row.department_name ?? 'Department'
  };
}

function publicMembershipSummary(row) {
  return {
    id: String(row.id),
    status: row.status ?? 'active',
    memberRole: normalizeRole(row.member_role) ?? 'employee'
  };
}

function publicCreatedMembership(workspaceId, row) {
  return {
    id: String(row.id),
    status: row.status ?? 'active',
    memberRole: normalizeRole(row.member_role) ?? 'owner',
    businessProfileId: String(workspaceId)
  };
}

function publicMembership(row) {
  return {
    id: String(row.id),
    status: row.status ?? 'active',
    memberRole: normalizeRole(row.member_role) ?? 'employee',
    workspace: publicWorkspace(row),
    department: publicDepartment(row)
  };
}

function publicInvitation(row) {
  return {
    id: String(row.id),
    email: row.email ?? 'Unavailable',
    memberRole: normalizeRole(row.member_role) ?? 'employee',
    status: row.status ?? 'pending',
    department: publicDepartment(row)
  };
}

function buildExistingContext(row) {
  return {
    workspace: publicWorkspace({
      workspace_id: row.business_profile,
      company_name: row.company_name,
      workspace_is_active: row.is_active,
      plan_code: row.plan_code,
      billing_status: row.billing_status
    }),
    membership: {
      id: String(row.id),
      status: row.status ?? 'active',
      memberRole: normalizeRole(row.member_role) ?? 'owner'
    },
    department: null
  };
}

function isPendingInviteStatus(status) {
  const normalized = pickString(status)?.toLowerCase() ?? '';
  return normalized === 'pending' || normalized === 'sent';
}

function validateMembershipRow(row) {
  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'The requested workspace membership was not found.' };
  }

  if ((row.status ?? '').toLowerCase() !== 'active') {
    return { ok: false, code: 'CONFLICT', message: 'The requested workspace membership is not active.' };
  }

  if (row.workspace_is_active !== true) {
    return { ok: false, code: 'CONFLICT', message: 'The requested workspace is not active.' };
  }

  if (row.department_id) {
    if (!row.department_match_id) {
      return { ok: false, code: 'CONFLICT', message: 'The membership department is no longer valid.' };
    }
    if (pickString(row.department_business_profile) !== pickString(row.workspace_id)) {
      return { ok: false, code: 'CONFLICT', message: 'The membership department does not belong to the active workspace.' };
    }
    if (row.department_is_active === false) {
      return { ok: false, code: 'CONFLICT', message: 'The membership department is inactive.' };
    }
  }

  return { ok: true };
}

function selectCanonicalMembership(rows) {
  if (!rows.length) {
    return null;
  }

  return [...rows].sort((left, right) => {
    const roleDifference = rolePriority(normalizeRole(right.member_role)) - rolePriority(normalizeRole(left.member_role));
    if (roleDifference !== 0) {
      return roleDifference;
    }

    const leftJoined = new Date(left.joined_at ?? 0).getTime();
    const rightJoined = new Date(right.joined_at ?? 0).getTime();
    if (Number.isFinite(rightJoined) && Number.isFinite(leftJoined) && rightJoined !== leftJoined) {
      return rightJoined - leftJoined;
    }

    const leftCompany = pickString(left.company_name) ?? '';
    const rightCompany = pickString(right.company_name) ?? '';
    return leftCompany.localeCompare(rightCompany);
  })[0];
}

async function loadActiveMembershipRows(trx, userId) {
  return trx('business_profile_members as member')
    .innerJoin('business_profiles as profile', 'profile.id', 'member.business_profile')
    .leftJoin('departments as department', 'department.id', 'member.department')
    .select(
      'member.id',
      'member.user',
      'member.status',
      'member.member_role',
      'member.business_profile as workspace_id',
      'member.department as department_id',
      'member.joined_at',
      'profile.company_name',
      'profile.is_active as workspace_is_active',
      'profile.plan_code',
      'profile.billing_status',
      'department.id as department_match_id',
      'department.name as department_name',
      'department.business_profile as department_business_profile',
      'department.is_active as department_is_active'
    )
    .where('member.user', userId)
    .andWhere('member.status', 'active')
    .andWhere('profile.is_active', true);
}

async function loadMembershipForSwitch(trx, membershipId, userId) {
  return trx('business_profile_members as member')
    .innerJoin('business_profiles as profile', 'profile.id', 'member.business_profile')
    .leftJoin('departments as department', 'department.id', 'member.department')
    .select(
      'member.id',
      'member.user',
      'member.status',
      'member.member_role',
      'member.business_profile as workspace_id',
      'member.department as department_id',
      'member.joined_at',
      'profile.company_name',
      'profile.is_active as workspace_is_active',
      'profile.plan_code',
      'profile.billing_status',
      'department.id as department_match_id',
      'department.name as department_name',
      'department.business_profile as department_business_profile',
      'department.is_active as department_is_active'
    )
    .where('member.id', membershipId)
    .andWhere('member.user', userId)
    .first();
}

async function syncDirectusUserContext(trx, userId, membershipRow) {
  await trx('directus_users')
    .where({ id: userId })
    .update({
      active_business_profile: membershipRow.workspace_id,
      active_department: membershipRow.department_id ?? null,
      active_member_role: normalizeRole(membershipRow.member_role) ?? null
    });
}

async function requireConfiguredOwnerRoleId(trx, env = process.env) {
  const configuredRole = readOwnerRoleIdFromEnv(env);
  if (configuredRole.error) {
    const error = new Error(configuredRole.error);
    error.code = 'CONFIGURATION_ERROR';
    throw error;
  }

  const roleRow = await trx('directus_roles')
    .select('id')
    .where({ id: configuredRole.value })
    .first();

  if (!roleRow?.id) {
    const error = new Error('WELLAR_OWNER_ROLE_ID does not match an existing Directus role.');
    error.code = 'CONFIGURATION_ERROR';
    throw error;
  }

  return configuredRole.value;
}

async function syncDirectusUserOwnerContext(trx, userId, businessProfileId, ownerRoleId) {
  await trx('directus_users')
    .where({ id: userId })
    .update({
      role: ownerRoleId,
      active_business_profile: businessProfileId,
      active_department: null,
      active_member_role: 'owner'
    });
}

async function loadPendingInvitations(trx, workspaceId) {
  return trx('request_invites as invite')
    .leftJoin('departments as department', 'department.id', 'invite.department')
    .select(
      'invite.id',
      'invite.email',
      'invite.member_role',
      'invite.status',
      'invite.department as department_id',
      'department.name as department_name'
    )
    .where('invite.business_profile', workspaceId)
    .whereIn('invite.status', ['pending', 'sent'])
    .orderBy('invite.id', 'desc');
}

function publicOrganizationProfile(row) {
  return {
    id: String(row.id),
    company_name: row.company_name ?? null,
    contact_name: row.contact_name ?? null,
    phone: row.phone ?? null,
    industry: row.industry ?? null,
    team_size: row.team_size ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    website: row.website ?? null,
    timezone: row.timezone ?? null,
    default_language: row.default_language ?? null,
    is_active: row.is_active === true,
    plan_code: row.plan_code ?? null,
    billing_status: row.billing_status ?? null,
    date_created: row.date_created ?? null,
    date_updated: row.date_updated ?? null
  };
}

async function logWorkspaceCreatedActivityEvent(database, logger, details) {
  try {
    await database('activity_events').insert(buildWorkspaceCreatedActivityEventPayload(details));
  } catch (error) {
    logger?.error?.(
      {
        errorClass: error?.name ?? 'Error',
        errorCode: error?.code ?? null,
        action: 'workspace_created',
        table: 'activity_events',
        entityType: 'company',
        businessProfileId: String(details.businessProfileId),
        membershipId: String(details.membershipId)
      },
      '[wellar] workspace creation audit log failed'
    );
  }
}

function buildWorkspaceCreatedActivityEventPayload(details) {
  return {
    id: details.activityEventId,
    actor: details.userId,
    target_user: details.userId,
    action: 'workspace_created',
    entity_type: 'company',
    entity_id: String(details.businessProfileId),
    business_profile: details.businessProfileId,
    payload: JSON.stringify({
      source: 'web_self_service_onboarding',
      idempotency_key: details.idempotencyKey,
      membership_id: details.membershipId,
      member_role: 'owner'
    })
  };
}

function buildCreatedWorkspaceResponse(profile, membership) {
  return {
    workspace: publicWorkspace({
      workspace_id: profile.id,
      company_name: profile.company_name,
      workspace_is_active: profile.is_active,
      plan_code: profile.plan_code,
      billing_status: profile.billing_status
    }),
    membership: publicCreatedMembership(profile.id, membership),
    department: null
  };
}

function publicOrganizationDepartment(row) {
  return {
    id: String(row.id),
    name: row.name ?? 'Department',
    is_active: row.is_active === true,
    business_profile: String(row.business_profile),
    manager_member_id: row.manager_member ?? null,
    date_created: row.date_created ?? null,
    date_updated: row.date_updated ?? null
  };
}

function publicOrganizationMember(row) {
  return {
    id: String(row.id),
    status: row.status ?? null,
    member_role: normalizeRole(row.member_role) ?? null,
    user_id: row.user_id ?? null,
    user_name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.user_email || 'Member',
    user_email: row.user_email ?? null,
    business_profile: row.business_profile ?? null,
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? null,
    joined_at: row.joined_at ?? null,
    date_created: row.date_created ?? null,
    date_updated: row.date_updated ?? null
  };
}

function publicOrganizationInvite(row) {
  return {
    id: String(row.id),
    email: row.email ?? 'Unavailable',
    member_role: normalizeRole(row.member_role) ?? null,
    status: row.status ?? null,
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? null
  };
}

function publicWorkforceMember(row, options = {}) {
  const canViewEmail = options.canViewEmail === true;
  const role = normalizeRole(row.member_role) ?? 'employee';
  const status = pickString(row.status) ?? 'active';
  const userId = pickString(row.user_id);
  const rawEmail = pickString(row.user_email);
  const email = canViewEmail ? rawEmail : null;
  const firstName = pickString(row.first_name);
  const lastName = pickString(row.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || (canViewEmail ? rawEmail : null) || 'Needs data repair';
  const state =
    status !== 'active'
      ? 'inactive'
      : (!userId || !rawEmail)
        ? 'repair_required'
        : 'verified_member';
  const reason =
    state === 'repair_required'
      ? (!userId
          ? 'missing linked user'
          : !rawEmail
            ? 'missing email'
            : 'invalid membership relationship')
      : null;

  return {
    id: String(row.id),
    type: 'member',
    state,
    member_id: String(row.id),
    invite_id: null,
    user_id: userId ?? null,
    member_role: role,
    status,
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? null,
    display_name: state === 'verified_member' ? displayName : state === 'inactive' ? displayName : 'Data repair required',
    email,
    invited_email: null,
    reason,
    is_targetable: state === 'verified_member' && ['hr', 'manager', 'employee'].includes(role) && Boolean(email),
    joined_at: row.joined_at ?? null,
    expires_at: null,
    last_scan_at: row.last_scan_at ?? null,
    last_readiness_score: row.last_readiness_score ?? null,
    last_risk_level: row.last_risk_level ?? null,
    scan_status: row.scan_status ?? null,
    todays_scan: row.todays_scan === true,
    readiness_label: row.readiness_label ?? null,
    presence_status: row.presence_status ?? null,
    presence_label: row.presence_label ?? null
  };
}

function publicWorkforceInvite(row, options = {}) {
  const canViewEmail = options.canViewEmail === true;
  const email = canViewEmail ? row.email ?? null : null;

  return {
    id: String(row.id),
    type: 'invite',
    state: 'pending_invitation',
    member_id: null,
    invite_id: String(row.id),
    user_id: null,
    member_role: normalizeRole(row.member_role) ?? 'employee',
    status: row.status ?? 'pending',
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? null,
    display_name: 'Invitation pending',
    email,
    invited_email: email,
    reason: email ? null : 'invitation email unavailable',
    is_targetable: false,
    joined_at: null,
    expires_at: row.expires_at ?? null,
    last_scan_at: null,
    last_readiness_score: null,
    last_risk_level: null,
    scan_status: 'not_applicable',
    todays_scan: false,
    readiness_label: 'No scan',
    presence_status: 'never',
    presence_label: 'Never active'
  };
}

function publicScanRequest(row, targetMember, requestedByUser = null) {
  const department = publicDepartment({
    department_id: targetMember.department_id,
    department_name: targetMember.department_name
  });

  return {
    id: String(row.id),
    status: row.status ?? 'pending',
    request_type: row.request_type ?? null,
    requested_at: row.requested_at ?? null,
    due_at: row.due_at ?? null,
    completed_at: row.completed_at ?? null,
    cancelled: row.cancelled ?? null,
    business_profile: publicWorkspace({
      workspace_id: row.business_profile,
      company_name: targetMember.company_name,
      workspace_is_active: true
    }),
    department,
    target_member: {
      id: String(targetMember.id),
      status: targetMember.status ?? 'active',
      member_role: normalizeRole(targetMember.member_role) ?? 'employee',
      user: targetMember.user_id
        ? {
            id: String(targetMember.user_id),
            email: targetMember.user_email ?? null,
            first_name: targetMember.first_name ?? null,
            last_name: targetMember.last_name ?? null
        }
        : null,
      department
    },
    requested_by_user: requestedByUser
      ? {
          id: String(requestedByUser.id ?? row.requested_by_user ?? ''),
          email: requestedByUser.email ?? null,
          first_name: requestedByUser.first_name ?? null,
          last_name: requestedByUser.last_name ?? null
        }
      : {
          id: String(row.requested_by_user ?? '')
        }
  };
}

async function loadWorkspaceScanRequests(trx, workspaceId, options = {}) {
  const rows = await trx('scan_requests as request')
    .innerJoin('business_profiles as profile', 'profile.id', 'request.business_profile')
    .leftJoin('business_profile_members as target_member', 'target_member.id', 'request.target_member')
    .leftJoin('departments as target_department', 'target_department.id', 'target_member.department')
    .leftJoin('directus_users as target_user', 'target_user.id', 'target_member.user')
    .leftJoin('departments as request_department', 'request_department.id', 'request.department')
    .leftJoin('directus_users as requested_by_user', 'requested_by_user.id', 'request.requested_by_user')
    .select(
      'request.id',
      'request.business_profile',
      'request.department',
      'request.requested_by_user',
      'request.target_member',
      'request.status',
      'request.request_type',
      'request.requested_at',
      'request.due_at',
      'request.completed_at',
      'request.cancelled',
      'profile.company_name',
      'requested_by_user.id as requested_by_user_id',
      'requested_by_user.email as requested_by_user_email',
      'requested_by_user.first_name as requested_by_user_first_name',
      'requested_by_user.last_name as requested_by_user_last_name',
      'target_member.status as target_member_status',
      'target_member.member_role as target_member_member_role',
      'target_member.user as target_member_user_id',
      'target_user.email as target_member_user_email',
      'target_user.first_name as target_member_user_first_name',
      'target_user.last_name as target_member_user_last_name',
      'target_member.department as target_member_department_id',
      'target_department.name as target_member_department_name',
      'target_department.business_profile as target_member_department_business_profile',
      'target_department.is_active as target_member_department_is_active',
      'request_department.name as request_department_name'
    )
    .where('request.business_profile', workspaceId)
    .modify((query) => {
      if (options.departmentId) {
        query.andWhere('request.department', options.departmentId);
      }
      if (options.memberId) {
        query.andWhere('request.target_member', options.memberId);
      }
      if (options.userId) {
        query.andWhere((builder) => {
          builder
            .where('request.requested_by_user', options.userId)
            .orWhere('target_member.user', options.userId);
        });
      }
    })
    .orderBy('request.requested_at', 'desc')
    .orderBy('request.id', 'desc');

  return rows.map((row) => {
    const targetMemberDepartmentId = row.target_member_department_id ?? row.department ?? null;
    const targetMemberDepartment = targetMemberDepartmentId
      ? {
          id: String(targetMemberDepartmentId),
          name: row.target_member_department_name ?? row.request_department_name ?? 'Department'
        }
      : null;

    const targetMember = {
      id: String(row.target_member ?? ''),
      status: row.target_member_status ?? 'active',
      member_role: normalizeRole(row.target_member_member_role) ?? 'employee',
      user_id: row.target_member_user_id ?? null,
      user_email: row.target_member_user_email ?? null,
      first_name: row.target_member_user_first_name ?? null,
      last_name: row.target_member_user_last_name ?? null,
      department_id: targetMemberDepartmentId,
      department_name: targetMemberDepartment?.name ?? null,
      company_name: row.company_name ?? null
    };

    const requestedByUser = row.requested_by_user_id
      ? {
          id: row.requested_by_user_id,
          email: row.requested_by_user_email ?? null,
          first_name: row.requested_by_user_first_name ?? null,
          last_name: row.requested_by_user_last_name ?? null
        }
      : null;

    return publicScanRequest(row, targetMember, requestedByUser);
  });
}

function summarizeScanRequests(rows) {
  const summary = {
    total: 0,
    pending: 0,
    completed: 0,
    overdue: 0
  };

  const isClosed = (status) => {
    const normalized = pickString(status)?.toLowerCase() ?? '';
    return normalized === 'completed' || normalized === 'expired' || normalized === 'cancelled' || normalized === 'canceled';
  };

  const requestTimestamp = (row) => {
    const value = pickString(row.requested_at ?? row.timestamp ?? null);
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const isOverdue = (row) => {
    if (!row.due_at || isClosed(row.status)) {
      return false;
    }
    const dueAt = new Date(pickString(row.due_at) ?? '').getTime();
    if (!Number.isFinite(dueAt)) {
      return false;
    }
    return dueAt > 0 && dueAt < Date.now();
  };

  for (const row of rows ?? []) {
    summary.total += 1;
    const normalized = pickString(row.status)?.toLowerCase() ?? '';
    if (normalized === 'completed') {
      summary.completed += 1;
    } else if (normalized === 'pending' || normalized === 'sent' || normalized === 'opened') {
      summary.pending += 1;
    } else if (!isClosed(normalized) && isOverdue(row)) {
      summary.overdue += 1;
    } else if (!isClosed(normalized) && !isOverdue(row) && requestTimestamp(row) > 0) {
      summary.pending += 1;
    }
  }

  return summary;
}

function publicOrganizationPermissions(role) {
  const normalized = normalizeRole(role);
  return {
    canEditProfile: normalized === 'owner',
    canManageDepartments: normalized === 'owner' || normalized === 'hr',
    canViewMembers: normalized === 'owner' || normalized === 'hr',
    canViewInvites: normalized === 'owner' || normalized === 'hr',
    canUseComingSoonControls: false
  };
}

function validateOrganizationProfilePayload(body) {
  const allowed = new Set([
    'company_name',
    'contact_name',
    'phone',
    'industry',
    'team_size',
    'country',
    'city',
    'website',
    'timezone',
    'default_language'
  ]);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const keys = Object.keys(body);
  if (!keys.length) {
    return { ok: false, message: 'At least one editable organization field is required.' };
  }

  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, message: 'Request contains unsupported organization fields.' };
  }

  const payload = {};
  for (const key of keys) {
    const value = body[key];
    if (key === 'team_size') {
      const parsed = pickInteger(value);
      if (parsed === null) {
        return { ok: false, message: 'team_size must be a positive integer.' };
      }
      payload[key] = parsed;
      continue;
    }

    if (key === 'website') {
      payload[key] = normalizeWebsite(value);
      continue;
    }

    const normalized = pickString(value, key === 'company_name' || key === 'contact_name' ? MAX_COMPANY_NAME : MAX_TEXT);
    payload[key] = normalized;
  }

  if (!payload.company_name) {
    return { ok: false, message: 'company_name is required.' };
  }

  return { ok: true, payload };
}

function normalizeDepartmentManagerInput(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }

  const managerMemberId = pickString(value);
  if (!managerMemberId) {
    return { ok: false, message: 'manager_member_id must be a valid membership id or null.' };
  }

  return { ok: true, value: managerMemberId };
}

function validateDepartmentCreatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const allowed = new Set(['name', 'manager_member_id']);
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !allowed.has(key))) {
    return { ok: false, message: 'Request contains unsupported department fields.' };
  }

  const name = pickString(body.name, MAX_COMPANY_NAME);
  if (!name) {
    return { ok: false, message: 'Department name is required.' };
  }

  const managerMember = normalizeDepartmentManagerInput(body.manager_member_id);
  if (!managerMember.ok) {
    return { ok: false, message: managerMember.message };
  }

  return { ok: true, payload: { name, managerMemberId: managerMember.value } };
}

function validateDepartmentUpdatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const allowed = new Set(['name', 'manager_member_id']);
  const keys = Object.keys(body);
  if (!keys.length) {
    return { ok: false, message: 'At least one editable department field is required.' };
  }

  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, message: 'Request contains unsupported department fields.' };
  }

  const payload = {};
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = pickString(body.name, MAX_COMPANY_NAME);
    if (!name) {
      return { ok: false, message: 'Department name is required.' };
    }
    payload.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'manager_member_id')) {
    const managerMember = normalizeDepartmentManagerInput(body.manager_member_id);
    if (!managerMember.ok) {
      return { ok: false, message: managerMember.message };
    }
    payload.managerMemberId = managerMember.value;
  }

  return { ok: true, payload };
}

function validateScanRequestPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const allowed = new Set(['target_member_id', 'request_type', 'due_at']);
  const keys = Object.keys(body);
  if (!keys.length) {
    return { ok: false, message: 'target_member_id is required.' };
  }

  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, message: 'Request contains unsupported scan request fields.' };
  }

  const targetMemberId = pickString(body.target_member_id);
  if (!targetMemberId) {
    return { ok: false, message: 'target_member_id is required.' };
  }

  const requestType = pickString(body.request_type, 60)?.toLowerCase() ?? 'manual';
  if (!['manual', 'bulk', 'reminder'].includes(requestType)) {
    return { ok: false, message: 'request_type must be manual, bulk, or reminder.' };
  }
  const dueAt = pickString(body.due_at, MAX_TEXT);
  if (dueAt) {
    const parsed = new Date(dueAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: 'due_at must be a valid ISO timestamp.' };
    }
  }

  return {
    ok: true,
    payload: {
      targetMemberId,
      requestType,
      dueAt: dueAt ?? null
    }
  };
}

async function loadOrganizationMembership(trx, userId) {
  const rows = await loadActiveMembershipRows(trx, userId);
  const normalized = rows.filter((row) => validateMembershipRow(row).ok);
  const userRow = await trx('directus_users')
    .select('id', 'active_business_profile', 'active_department', 'active_member_role')
    .where({ id: userId })
    .first();
  const active = selectCanonicalMembership(normalized);
  return { rows: normalized, active, userRow };
}

async function loadOrganizationMembershipForWorkspace(trx, userId, workspaceId) {
  const rows = await loadActiveMembershipRows(trx, userId);
  const normalized = rows.filter((row) => validateMembershipRow(row).ok && pickString(row.workspace_id) === pickString(workspaceId));
  const userRow = await trx('directus_users')
    .select('id', 'active_business_profile', 'active_department', 'active_member_role')
    .where({ id: userId })
    .first();
  const active = selectCanonicalMembership(normalized);
  return { rows: normalized, active, userRow };
}

async function loadAlertWorkflowRecord(trx, alertId) {
  return trx('alerts as alert')
    .leftJoin('business_profiles as profile', 'profile.id', 'alert.business_profile')
    .leftJoin('departments as department', 'department.id', 'alert.department')
    .leftJoin('directus_users as reviewer', 'reviewer.id', 'alert.reviewed_by')
    .select(
      'alert.id',
      'alert.business_profile',
      'alert.department',
      'alert.status',
      'alert.reviewed_by',
      'alert.reviewed_at',
      'alert.action_note',
      'alert.action_type',
      'alert.date_created',
      'alert.date_updated',
      'profile.company_name',
      'department.name as department_name',
      'reviewer.id as reviewed_by_id',
      'reviewer.email as reviewed_by_email',
      'reviewer.first_name as reviewed_by_first_name',
      'reviewer.last_name as reviewed_by_last_name'
    )
    .where('alert.id', alertId)
    .forUpdate()
    .first();
}

function publicAlertWorkflowRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    business_profile: row.business_profile ?? null,
    department: row.department ?? null,
    status: row.status ?? null,
    reviewed_by: row.reviewed_by_id
      ? {
          id: String(row.reviewed_by_id),
          email: row.reviewed_by_email ?? null,
          first_name: row.reviewed_by_first_name ?? null,
          last_name: row.reviewed_by_last_name ?? null
        }
      : row.reviewed_by ?? null,
    reviewed_at: row.reviewed_at ?? null,
    action_note: row.action_note ?? null,
    action_type: row.action_type ?? null,
    date_created: row.date_created ?? null,
    date_updated: row.date_updated ?? null
  };
}

function validateAlertWorkflowPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'action') {
    return { ok: false, message: 'Only action is accepted.' };
  }

  const action = pickString(body.action, 32);
  if (!action || !['start_review', 'mark_reviewed', 'resolve'].includes(action)) {
    return { ok: false, message: 'action must be start_review, mark_reviewed, or resolve.' };
  }

  return {
    ok: true,
    payload: { action }
  };
}

async function loadOrganizationProfile(trx, workspaceId) {
  return trx('business_profiles')
    .select([
      'id',
      'company_name',
      'contact_name',
      'phone',
      'industry',
      'team_size',
      'country',
      'city',
      'website',
      'timezone',
      'default_language',
      'is_active',
      'plan_code',
      'billing_status',
      'date_created',
      'date_updated'
    ])
    .where({ id: workspaceId })
    .first();
}

async function loadOrganizationDepartments(trx, workspaceId) {
  return trx('departments')
    .select([
      'id',
      'name',
      'is_active',
      'business_profile',
      'manager_member',
      'date_created',
      'date_updated'
    ])
    .where({ business_profile: workspaceId })
    .orderBy('name', 'asc');
}

async function loadOrganizationMembers(trx, workspaceId) {
  return trx('business_profile_members as member')
    .leftJoin('departments as department', 'department.id', 'member.department')
    .leftJoin('directus_users as user', 'user.id', 'member.user')
    .select(
      'member.id',
      'member.status',
      'member.member_role',
      'member.user as user_id',
      'member.business_profile',
      'member.department as department_id',
      'member.joined_at',
      'member.date_created',
      'member.date_updated',
      'department.name as department_name',
      'user.first_name',
      'user.last_name',
      'user.email as user_email'
    )
    .where('member.business_profile', workspaceId)
    .orderBy('member.id', 'desc');
}

async function loadOrganizationInvites(trx, workspaceId) {
  return trx('request_invites as invite')
    .leftJoin('departments as department', 'department.id', 'invite.department')
    .select(
      'invite.id',
      'invite.email',
      'invite.member_role',
      'invite.status',
      'invite.department as department_id',
      'department.name as department_name'
    )
    .where('invite.business_profile', workspaceId)
    .whereIn('invite.status', ['pending', 'sent'])
    .orderBy('invite.id', 'desc');
}

async function loadWorkforceRoster(trx, workspaceId, role, departmentId = null, userId = null) {
  const normalizedRole = normalizeRole(role);
  const canViewEmail = normalizedRole === 'owner' || normalizedRole === 'hr';
  const canViewInvites = normalizedRole === 'owner' || normalizedRole === 'hr';

  const [memberRows, inviteRows, departments, scanRequestRows] = await Promise.all([
    loadOrganizationMembers(trx, workspaceId),
    canViewInvites ? loadOrganizationInvites(trx, workspaceId) : Promise.resolve([]),
    loadOrganizationDepartments(trx, workspaceId),
    loadWorkspaceScanRequests(
      trx,
      workspaceId,
      normalizedRole === 'manager'
        ? { departmentId }
        : normalizedRole === 'employee'
          ? { userId }
          : {}
      )
  ]);

  const scanRequests = {
    rows: scanRequestRows ?? [],
    summary: summarizeScanRequests(scanRequestRows ?? [])
  };

  const normalizedMembers = (memberRows ?? []).map((row) => publicWorkforceMember(row, { canViewEmail }));
  const normalizedInvites = (inviteRows ?? []).map((row) => publicWorkforceInvite(row, { canViewEmail }));
  const rows =
    normalizedRole === 'manager'
      ? normalizedMembers.filter((row) => row.department_id && row.department_id === departmentId)
      : [...normalizedInvites, ...normalizedMembers];

  const eligibleScanTargets = rows
    .filter((row) => row.state === 'verified_member' && ['hr', 'manager', 'employee'].includes(row.member_role) && Boolean(row.email))
    .map((row) => ({
      member_id: row.member_id,
      user_id: row.user_id,
      label: row.display_name,
      email: row.email,
      department_id: row.department_id,
      department_name: row.department_name,
      member_role: row.member_role,
      status: row.status
    }));

  const summary = {
    total: rows.length,
    verified_members: rows.filter((row) => row.state === 'verified_member').length,
    pending_invitations: rows.filter((row) => row.state === 'pending_invitation').length,
    repair_required: rows.filter((row) => row.state === 'repair_required').length,
    inactive: rows.filter((row) => row.state === 'inactive').length,
    eligible_scan_targets: eligibleScanTargets.length,
    open_scan_requests: scanRequests.summary.pending + scanRequests.summary.overdue,
    completed_scan_requests: scanRequests.summary.completed,
    overdue_scan_requests: scanRequests.summary.overdue
  };

  return {
    workspace: publicWorkspace({
      workspace_id: workspaceId,
      company_name: rows[0]?.business_profile_name ?? 'Organization',
      workspace_is_active: true
    }),
    permissions: publicOrganizationPermissions(normalizedRole),
    departments: (departments ?? []).map((department) => ({
      id: String(department.id),
      name: department.name ?? 'Department',
      is_active: department.is_active === true
    })),
    rows,
    eligible_scan_targets: eligibleScanTargets,
    scan_requests: {
      rows: scanRequests.rows,
      summary: scanRequests.summary
    },
    summary
  };
}

async function loadDepartmentById(trx, workspaceId, departmentId) {
  return trx('departments')
    .select([
      'id',
      'name',
      'is_active',
      'business_profile',
      'manager_member',
      'date_created',
      'date_updated'
    ])
    .where({ id: departmentId, business_profile: workspaceId })
    .first();
}

async function resolveDepartmentManagerMemberId(trx, workspaceId, managerMemberId) {
  if (managerMemberId === null || managerMemberId === undefined || managerMemberId === '') {
    return null;
  }

  const member = await trx('business_profile_members as member')
    .leftJoin('directus_users as user', 'user.id', 'member.user')
    .select(
      'member.id',
      'member.status',
      'member.member_role',
      'member.business_profile',
      'user.id as user_id'
    )
    .where('member.id', managerMemberId)
    .first();

  const error = Object.assign(new Error('Selected manager is not eligible for this department.'), {
    code: 'BAD_REQUEST'
  });

  if (!member) {
    throw error;
  }

  if (pickString(member.business_profile) !== pickString(workspaceId)) {
    throw error;
  }

  if (String(member.status ?? '').toLowerCase() !== 'active') {
    throw error;
  }

  if (!member.user_id) {
    throw error;
  }

  const role = normalizeRole(member.member_role);
  if (!['owner', 'hr', 'manager'].includes(role ?? '')) {
    throw error;
  }

  return String(member.id);
}

async function loadScanRequestTargetMember(trx, workspaceId, memberId) {
  return trx('business_profile_members as member')
    .innerJoin('business_profiles as profile', 'profile.id', 'member.business_profile')
    .leftJoin('departments as department', 'department.id', 'member.department')
    .leftJoin('directus_users as user', 'user.id', 'member.user')
    .select(
      'member.id',
      'member.status',
      'member.member_role',
      'member.business_profile as workspace_id',
      'member.department as department_id',
      'member.joined_at',
      'profile.company_name',
      'profile.is_active as workspace_is_active',
      'department.id as department_match_id',
      'department.name as department_name',
      'department.business_profile as department_business_profile',
      'department.is_active as department_is_active',
      'user.id as user_id',
      'user.email as user_email',
      'user.first_name',
      'user.last_name'
    )
    .where('member.id', memberId)
    .andWhere('member.business_profile', workspaceId)
    .first();
}

async function loadOpenScanRequestForMember(trx, workspaceId, memberId) {
  return trx('scan_requests')
    .select([
      'id',
      'status',
      'request_type',
      'requested_at',
      'due_at',
      'completed_at',
      'cancelled'
    ])
    .where({
      business_profile: workspaceId,
      target_member: memberId
    })
    .whereNotIn('status', ['completed', 'expired', 'cancelled', 'canceled'])
    .first();
}

async function dispatchScanRequestCreatedWebhook(logger, createdRequest) {
  const webhookUrl = pickString(process.env.PUSH_NOTIFICATION_WEBHOOK_URL);
  const webhookSecret = pickString(process.env.PUSH_NOTIFICATION_DIRECTUS_SECRET);
  const eventName = 'scan_request_created';
  const scanRequestId = String(createdRequest?.id ?? '');
  const targetMemberId = String(createdRequest?.target_member ?? '');
  const businessProfileId = String(createdRequest?.business_profile ?? '');

  if (!webhookUrl || !webhookSecret) {
    logger?.info?.(
      `[wellar] scan request webhook skipped event=${eventName} scan_request_id=${scanRequestId} reason=missing_configuration`
    );
    return { ok: false, skipped: true };
  }

  if (typeof fetch !== 'function') {
    logger?.info?.(
      `[wellar] scan request webhook skipped event=${eventName} scan_request_id=${scanRequestId} reason=fetch_unavailable`
    );
    return { ok: false, skipped: true };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), PUSH_WEBHOOK_TIMEOUT_MS) : null;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Directus-Secret': webhookSecret
      },
      body: JSON.stringify({
        event: eventName,
        scan_request_id: scanRequestId,
        target_member: targetMemberId,
        business_profile: businessProfileId
      }),
      signal: controller?.signal
    });

    if (!response.ok) {
      logger?.info?.(
        `[wellar] scan request webhook failed event=${eventName} scan_request_id=${scanRequestId} status=${response.status}`
      );
      return { ok: false, status: response.status };
    }

    logger?.info?.(
      `[wellar] scan request webhook dispatched event=${eventName} scan_request_id=${scanRequestId} status=${response.status}`
    );
    return { ok: true, status: response.status };
  } catch (error) {
    logger?.info?.(
      `[wellar] scan request webhook failed event=${eventName} scan_request_id=${scanRequestId} error_class=${
        error?.name ?? 'Error'
      }`
    );
    return { ok: false, errorClass: error?.name ?? 'Error' };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export default {
  id: 'wellar',
  handler: (router, context) => {
    const { database, logger } = context;

    router.get('/organization', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-organization-context:user:${userId}`
          ]);

          const { rows, active, userRow } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const activeRole = normalizeRole(active.member_role);
          if (activeRole !== 'owner' && activeRole !== 'hr') {
            throw Object.assign(new Error('Owner or HR access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const workspaceId = active.workspace_id;
          const [profile, departments, members, invites] = await Promise.all([
            loadOrganizationProfile(trx, workspaceId),
            loadOrganizationDepartments(trx, workspaceId),
            loadOrganizationMembers(trx, workspaceId),
            loadPendingInvitations(trx, workspaceId)
          ]);

          if (!profile) {
            throw Object.assign(new Error('The active organization profile was not found.'), {
              code: 'NOT_FOUND'
            });
          }

          const currentPermissions = publicOrganizationPermissions(activeRole);

          const shouldSync =
            pickString(userRow?.active_business_profile) !== pickString(workspaceId) ||
            pickString(userRow?.active_department) !== pickString(active.department_id) ||
            normalizeRole(userRow?.active_member_role) !== activeRole;

          if (shouldSync) {
            await syncDirectusUserContext(trx, userId, active);
          }

          return {
            profile: publicOrganizationProfile(profile),
            departments: departments.map((row) => publicOrganizationDepartment(row)),
            members: members.map((row) => publicOrganizationMember(row)),
            invites: invites.map((row) => publicOrganizationInvite(row)),
            permissions: currentPermissions
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }

        logger?.error?.(error, '[wellar] organization context failed');
        return serverError(res, 'Organization data could not be loaded.');
      }
    });

    router.patch('/organization/profile', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const validation = validateOrganizationProfilePayload(req.body ?? {});
      if (!validation.ok) {
        return badRequest(res, validation.message);
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-organization-profile:user:${userId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const activeRole = normalizeRole(active.member_role);
          if (activeRole !== 'owner') {
            throw Object.assign(new Error('Only owners can edit the organization profile.'), {
              code: 'FORBIDDEN'
            });
          }

          const profile = await loadOrganizationProfile(trx, active.workspace_id);
          if (!profile) {
            throw Object.assign(new Error('The active organization profile was not found.'), {
              code: 'NOT_FOUND'
            });
          }

          const payload = validation.payload;
          await trx('business_profiles')
            .where({ id: active.workspace_id })
            .update(payload);

          const updatedProfile = await loadOrganizationProfile(trx, active.workspace_id);
          await trx('activity_events').insert({
            actor: userId,
            target_user: userId,
            action: 'organization_profile_updated',
            entity_type: 'company',
            entity_id: String(active.workspace_id),
            business_profile: active.workspace_id,
            payload: JSON.stringify({
              source: 'web_organization_admin',
              changed_fields: Object.keys(payload)
            })
          });

          return publicOrganizationProfile(updatedProfile ?? profile);
        });

        return res.status(200).json({ data: { profile: result } });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }

        logger?.error?.(error, '[wellar] organization profile update failed');
        return serverError(res, 'Organization profile could not be updated.');
      }
    });

    router.post('/organization/departments', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const validation = validateDepartmentCreatePayload(req.body ?? {});
      if (!validation.ok) {
        return badRequest(res, validation.message);
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-organization-department-create:user:${userId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr') {
            throw Object.assign(new Error('Owner or HR access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const managerMemberId = await resolveDepartmentManagerMemberId(
            trx,
            active.workspace_id,
            validation.payload.managerMemberId
          );

          const departmentInsert = buildDepartmentInsertPayload(
            validation.payload.name,
            active.workspace_id,
            managerMemberId
          );

          const [created] = await trx('departments')
            .insert(departmentInsert)
            .returning([
              'id',
              'name',
              'is_active',
              'business_profile',
              'manager_member',
              'date_created',
              'date_updated'
            ]);

          if (!created?.id) {
            throw new Error('Department creation did not return an id.');
          }

          const activityEventId = randomUUID();
          assertUuid(activityEventId, 'activity_events.id');
          if (activityEventId === String(created.id)) {
            throw new Error('Generated department activity event id must be unique.');
          }

          await trx('activity_events').insert({
            id: activityEventId,
            actor: userId,
            target_user: userId,
            action: 'organization_department_created',
            entity_type: 'department',
            entity_id: String(created.id),
            business_profile: active.workspace_id,
            payload: JSON.stringify({
              source: 'web_organization_admin',
              department_name: validation.payload.name,
              manager_member_id: managerMemberId
            })
          });

          return publicOrganizationDepartment(created);
        });

        return res.status(201).json({ data: { department: result } });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'BAD_REQUEST') {
          return badRequest(res, error.message);
        }

        logger?.error?.(error, '[wellar] organization department creation failed');
        return serverError(res, 'Department could not be created.');
      }
    });

    router.patch('/organization/departments/:departmentId', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const departmentId = pickString(req?.params?.departmentId);
      if (!departmentId) {
        return badRequest(res, 'departmentId is required.');
      }

      const validation = validateDepartmentUpdatePayload(req.body ?? {});
      if (!validation.ok) {
        return badRequest(res, validation.message);
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-organization-department-update:user:${userId}:${departmentId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr') {
            throw Object.assign(new Error('Owner or HR access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const department = await loadDepartmentById(trx, active.workspace_id, departmentId);
          if (!department) {
            throw Object.assign(new Error('The requested department was not found in the active organization.'), {
              code: 'NOT_FOUND'
            });
          }

          const updatePayload = {};
          const changedFields = [];

          if (Object.prototype.hasOwnProperty.call(validation.payload, 'name')) {
            updatePayload.name = validation.payload.name;
            changedFields.push('name');
          }

          if (Object.prototype.hasOwnProperty.call(validation.payload, 'managerMemberId')) {
            updatePayload.manager_member = await resolveDepartmentManagerMemberId(
              trx,
              active.workspace_id,
              validation.payload.managerMemberId
            );
            changedFields.push('manager_member');
          }

          await trx('departments')
            .where({ id: departmentId, business_profile: active.workspace_id })
            .update(updatePayload);

          const updatedDepartment = await loadDepartmentById(trx, active.workspace_id, departmentId);
          const activityEventId = randomUUID();
          assertUuid(activityEventId, 'activity_events.id');
          if (activityEventId === String(departmentId)) {
            throw new Error('Generated department update activity event id must be unique.');
          }

          await trx('activity_events').insert({
            id: activityEventId,
            actor: userId,
            target_user: userId,
            action: 'organization_department_updated',
            entity_type: 'department',
            entity_id: String(departmentId),
            business_profile: active.workspace_id,
            payload: JSON.stringify({
              source: 'web_organization_admin',
              changed_fields: changedFields
            })
          });

          return publicOrganizationDepartment(updatedDepartment ?? department);
        });

        return res.status(200).json({ data: { department: result } });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'BAD_REQUEST') {
          return badRequest(res, error.message);
        }

        logger?.error?.(error, '[wellar] organization department update failed');
        return serverError(res, 'Department could not be updated.');
      }
    });

    router.post('/organization/departments/:departmentId/deactivate', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const departmentId = pickString(req?.params?.departmentId);
      if (!departmentId) {
        return badRequest(res, 'departmentId is required.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-organization-department-deactivate:user:${userId}:${departmentId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr') {
            throw Object.assign(new Error('Owner or HR access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const department = await loadDepartmentById(trx, active.workspace_id, departmentId);
          if (!department) {
            throw Object.assign(new Error('The requested department was not found in the active organization.'), {
              code: 'NOT_FOUND'
            });
          }

          const assignedActiveMembers = await trx('business_profile_members')
            .count('* as count')
            .where({
              business_profile: active.workspace_id,
              department: departmentId,
              status: 'active'
            })
            .first();

          const activeMemberCount = Number(assignedActiveMembers?.count ?? 0);
          if (activeMemberCount > 0) {
            throw Object.assign(new Error('Deactivate the department after reassigning its active members.'), {
              code: 'CONFLICT'
            });
          }

          await trx('departments')
            .where({ id: departmentId, business_profile: active.workspace_id })
            .update({ is_active: false });

          const updatedDepartment = await loadDepartmentById(trx, active.workspace_id, departmentId);
          await trx('activity_events').insert({
            actor: userId,
            target_user: userId,
            action: 'organization_department_deactivated',
            entity_type: 'department',
            entity_id: String(departmentId),
            business_profile: active.workspace_id,
            payload: JSON.stringify({
              source: 'web_organization_admin'
            })
          });

          return publicOrganizationDepartment(updatedDepartment ?? department);
        });

        return res.status(200).json({ data: { department: result } });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] organization department deactivation failed');
        return serverError(res, 'Department could not be deactivated.');
      }
    });

    router.post('/scan-requests', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const validation = validateScanRequestPayload(req.body ?? {});
      if (!validation.ok) {
        return badRequest(res, validation.message);
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-scan-request-create:user:${userId}:${validation.payload.targetMemberId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr') {
            throw Object.assign(new Error('Owner or HR access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const targetMember = await loadScanRequestTargetMember(
            trx,
            active.workspace_id,
            validation.payload.targetMemberId
          );
          if (!targetMember) {
            throw Object.assign(new Error('The requested workforce member was not found in the active organization.'), {
              code: 'NOT_FOUND'
            });
          }

          if (!['hr', 'manager', 'employee'].includes(normalizeRole(targetMember.member_role))) {
            throw Object.assign(new Error('Scan requests can only target active HR, manager, or employee members.'), {
              code: 'CONFLICT'
            });
          }

          if ((targetMember.status ?? '').toLowerCase() !== 'active') {
            throw Object.assign(new Error('The selected workforce member is not active.'), {
              code: 'CONFLICT'
            });
          }

          if (!targetMember.user_id || !targetMember.user_email) {
            throw Object.assign(new Error('The selected workforce member needs data repair before a scan request can be created.'), {
              code: 'CONFLICT'
            });
          }

          if (targetMember.department_id) {
            if (!targetMember.department_match_id) {
              throw Object.assign(new Error('The selected workforce member department is no longer valid.'), {
                code: 'CONFLICT'
              });
            }

            if (pickString(targetMember.department_business_profile) !== pickString(active.workspace_id)) {
              throw Object.assign(new Error('The selected workforce member department does not belong to the active organization.'), {
                code: 'CONFLICT'
              });
            }

            if (targetMember.department_is_active === false) {
              throw Object.assign(new Error('The selected workforce member department is inactive.'), {
                code: 'CONFLICT'
              });
            }
          }

          const openRequest = await loadOpenScanRequestForMember(trx, active.workspace_id, targetMember.id);
          if (openRequest) {
            throw Object.assign(new Error('An open scan request already exists for the selected member.'), {
              code: 'CONFLICT'
            });
          }

          const now = new Date().toISOString();
          const [created] = await trx('scan_requests')
            .insert({
              business_profile: active.workspace_id,
              department: targetMember.department_id ?? null,
              requested_by_user: userId,
              target_member: targetMember.id,
              request_type: validation.payload.requestType,
              status: 'pending',
              requested_at: now,
              due_at: validation.payload.dueAt,
              completed_scan: null,
              completed_at: null,
              cancelled: null
            })
            .returning([
              'id',
              'business_profile',
              'department',
              'requested_by_user',
              'target_member',
              'request_type',
              'status',
              'requested_at',
              'due_at',
              'completed_at',
              'cancelled'
            ]);

          if (!created?.id) {
            throw new Error('Scan request creation did not return an id.');
          }

          const existingNotification = await trx('notifications')
            .select(['id'])
            .where({
              business_profile: active.workspace_id,
              user: targetMember.user_id,
              type: 'scan_request',
              link_type: 'scan_request',
              link_id: String(created.id)
            })
            .first();

          if (!existingNotification?.id) {
            const [notification] = await trx('notifications')
              .insert({
                user: targetMember.user_id,
                business_profile: active.workspace_id,
                title: 'New scan request',
                body: 'You have a new request to complete.',
                type: 'scan_request',
                status: 'unread',
                link_type: 'scan_request',
                link_id: String(created.id),
                read_at: null,
                meta: JSON.stringify({
                  type: 'scan_request_created',
                  screen: 'scan_request_detail',
                  scan_request_id: String(created.id)
                })
              })
              .returning(['id']);

            if (!notification?.id) {
              throw new Error('Notification creation did not return an id.');
            }
          }

          await trx('activity_events').insert({
            actor: userId,
            target_user: userId,
            action: 'scan_request_created',
            entity_type: 'scan_request',
            entity_id: String(created.id),
            business_profile: active.workspace_id,
            payload: JSON.stringify({
              source: 'web_requests_page',
              target_member_id: String(targetMember.id),
              request_type: validation.payload.requestType,
              due_at: validation.payload.dueAt
            })
          });

          return {
            request: publicScanRequest(created, targetMember)
          };
        });

        if (result?.request) {
          await dispatchScanRequestCreatedWebhook(logger, {
            id: result.request.id,
            target_member: result.request.target_member?.id ?? null,
            business_profile: result.request.business_profile?.id ?? null
          });
        }

        return res.status(201).json({ data: result });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] scan request creation failed');
        return serverError(res, 'Scan request could not be created.');
      }
    });

    router.get('/scan-requests', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-scan-requests:user:${userId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr' && role !== 'manager' && role !== 'employee') {
            throw Object.assign(new Error('A verified workspace role is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const queueFilter = {};
          if (role === 'manager') {
            if (!active.department_id) {
              throw Object.assign(new Error('Manager account has no active department.'), {
                code: 'CONFLICT'
              });
            }
            queueFilter.departmentId = active.department_id;
          } else if (role === 'employee') {
            queueFilter.userId = userId;
            queueFilter.memberId = active.id;
          }

          const rows = await loadWorkspaceScanRequests(trx, active.workspace_id, queueFilter);
          const visibleRows = rows.filter((row) => {
            if (role === 'owner' || role === 'hr') {
              return true;
            }

            const targetMemberId = String(row.target_member?.id ?? '');
            const targetUserId = String(row.target_member?.user?.id ?? '');
            const requestedByUserId = String(row.requested_by_user?.id ?? '');
            if (role === 'manager') {
              return String(row.department?.id ?? row.target_member?.department?.id ?? row.department_id ?? '') === String(active.department_id);
            }

            return targetMemberId === String(active.id) ||
              targetUserId === String(userId) ||
              requestedByUserId === String(userId);
          });

          return {
            rows: visibleRows,
            summary: summarizeScanRequests(visibleRows)
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] scan request queue failed');
        return serverError(res, 'Scan requests could not be loaded.');
      }
    });

    router.post('/alerts/:alertId/workflow', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const alertId = pickString(req?.params?.alertId);
      if (!alertId) {
        return badRequest(res, 'alertId is required.');
      }

      const validation = validateAlertWorkflowPayload(req.body ?? {});
      if (!validation.ok) {
        return badRequest(res, validation.message);
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-alert-workflow:alert:${alertId}`
          ]);

          const alert = await loadAlertWorkflowRecord(trx, alertId);
          if (!alert) {
            throw Object.assign(new Error('The requested alert was not found.'), {
              code: 'NOT_FOUND'
            });
          }

          const { active } = await loadOrganizationMembershipForWorkspace(trx, userId, alert.business_profile);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr' && role !== 'manager') {
            throw Object.assign(new Error('Owner, HR, or manager access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          if (role === 'manager' && pickString(active.department_id) !== pickString(alert.department)) {
            throw Object.assign(new Error('Manager workflow actions are limited to their own department.'), {
              code: 'FORBIDDEN'
            });
          }

          const currentStatus = pickString(alert.status)?.toLowerCase() ?? '';
          let updatePayload = null;

          if (validation.payload.action === 'start_review' && currentStatus === 'new') {
            updatePayload = {
              status: 'seen'
            };
          } else if (validation.payload.action === 'mark_reviewed' && currentStatus === 'seen') {
            updatePayload = {
              status: 'reviewed',
              reviewed_by: userId,
              reviewed_at: trx.fn.now()
            };
          } else if (validation.payload.action === 'resolve' && currentStatus === 'reviewed') {
            updatePayload = {
              status: 'resolved'
            };
          } else if (currentStatus === 'resolved' || currentStatus === 'overridden') {
            throw Object.assign(new Error('The selected alert workflow state can no longer be changed.'), {
              code: 'CONFLICT'
            });
          } else {
            throw Object.assign(new Error('The requested alert workflow transition is not valid.'), {
              code: 'CONFLICT'
            });
          }

          const updatedCount = await trx('alerts')
            .where({ id: alertId, business_profile: alert.business_profile, status: currentStatus })
            .update(updatePayload);

          if (updatedCount !== 1) {
            throw Object.assign(new Error('The alert workflow state changed before the action could be applied.'), {
              code: 'CONFLICT'
            });
          }

          const updatedAlert = await loadAlertWorkflowRecord(trx, alertId);
          if (!updatedAlert) {
            throw new Error('Alert workflow update did not return a row.');
          }

          return {
            alert: publicAlertWorkflowRecord(updatedAlert)
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] alert workflow update failed');
        return serverError(res, 'Alert workflow could not be updated.');
      }
    });

    router.get('/workforce', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-workforce-roster:user:${userId}`
          ]);

          const { active } = await loadOrganizationMembership(trx, userId);
          if (!active) {
            throw Object.assign(new Error('A verified active organization membership is required.'), {
              code: 'NOT_FOUND'
            });
          }

          const role = normalizeRole(active.member_role);
          if (role !== 'owner' && role !== 'hr' && role !== 'manager') {
            throw Object.assign(new Error('Owner, HR, or manager access is required.'), {
              code: 'FORBIDDEN'
            });
          }

          const roster = await loadWorkforceRoster(
            trx,
            active.workspace_id,
            role,
            active.department_id ?? null,
            userId
          );

          return {
            ...roster,
            active: {
              workspace: publicWorkspace(active),
              membership: publicMembershipSummary(active),
              department: publicDepartment(active)
            }
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') {
          return forbidden(res, error.message);
        }
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] workforce roster failed');
        return serverError(res, 'Workforce roster could not be loaded.');
      }
    });

    router.get('/workspaces/context', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-workspace-context:user:${userId}`
          ]);

          const userRow = await trx('directus_users')
            .select('id', 'active_business_profile', 'active_department', 'active_member_role')
            .where({ id: userId })
            .first();

          const membershipRows = await loadActiveMembershipRows(trx, userId);
          const validMembershipRows = membershipRows.filter((row) => validateMembershipRow(row).ok);
          const activeRow = selectCanonicalMembership(validMembershipRows);

          if (activeRow) {
            const activeWorkspaceId = pickString(userRow?.active_business_profile);
            const activeDepartmentId = pickString(userRow?.active_department);
            const activeRole = normalizeRole(userRow?.active_member_role);
            const shouldSync =
              activeWorkspaceId !== pickString(activeRow.workspace_id) ||
              activeDepartmentId !== pickString(activeRow.department_id) ||
              activeRole !== normalizeRole(activeRow.member_role);

            if (shouldSync) {
              await syncDirectusUserContext(trx, userId, activeRow);
            }
          }

          const invitations =
            activeRow && ['owner', 'hr'].includes(normalizeRole(activeRow.member_role) ?? '')
              ? (await loadPendingInvitations(trx, activeRow.workspace_id))
                .filter((row) => isPendingInviteStatus(row.status))
                .map((row) => publicInvitation(row))
              : [];

          return {
            active: activeRow
              ? {
                workspace: publicWorkspace(activeRow),
                membership: publicMembershipSummary(activeRow),
                department: publicDepartment(activeRow)
              }
              : null,
            memberships: validMembershipRows.map((row) => publicMembership(row)),
            invitations
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        logger?.error?.(error, '[wellar] workspace context failed');
        return serverError(res, 'Workspace context could not be loaded.');
      }
    });

    router.post('/workspaces/switch', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return unauthorized(res, 'Authentication is required.');
      }

      const body = req.body ?? {};
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return badRequest(res, 'Request body must be a JSON object.');
      }

      const membershipId = pickString(body.membership_id);
      if (!membershipId) {
        return badRequest(res, 'membership_id is required.');
      }

      const unexpectedKeys = Object.keys(body).filter((key) => key !== 'membership_id');
      if (unexpectedKeys.length) {
        return badRequest(res, 'Only membership_id is accepted.');
      }

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-workspace-switch:user:${userId}`
          ]);

          const membershipRow = await loadMembershipForSwitch(trx, membershipId, userId);
          const validation = validateMembershipRow(membershipRow);
          if (!validation.ok) {
            const error = new Error(validation.message);
            error.code = validation.code;
            throw error;
          }

          await syncDirectusUserContext(trx, userId, membershipRow);

          return {
            workspace: publicWorkspace(membershipRow),
            membership: publicMembershipSummary(membershipRow),
            department: publicDepartment(membershipRow)
          };
        });

        return res.status(200).json({ data: result });
      } catch (error) {
        if (error?.code === 'NOT_FOUND') {
          return notFound(res, error.message);
        }
        if (error?.code === 'CONFLICT') {
          return conflict(res, error.message);
        }

        logger?.error?.(error, '[wellar] workspace switch failed');
        return serverError(res, 'Workspace context could not be switched.');
      }
    });

    router.post('/workspaces/create', async (req, res) => {
      const userId = req?.accountability?.user;
      if (!userId) {
        return forbidden(res, 'Authentication is required.');
      }

      const body = req.body ?? {};
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return badRequest(res, 'Request body must be a JSON object.');
      }

      if (hasForbiddenInput(body)) {
        return badRequest(res, 'Request contains forbidden ownership or workspace fields.');
      }

      const idempotencyKey = pickString(body.idempotency_key ?? body.idempotencyKey, 120);
      if (!idempotencyKey) {
        return badRequest(res, 'idempotency_key is required.');
      }

      const now = new Date().toISOString();
      const companyPayload = buildCompanyPayload(body, userId, now);
      if (companyPayload.error) {
        return badRequest(res, companyPayload.error);
      }
      const recordIds = buildWorkspaceRecordIds();

      try {
        const result = await database.transaction(async (trx) => {
          await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [
            `wellar-workspace-create:user:${userId}`
          ]);

          const existingMembership = await trx('business_profile_members as member')
            .leftJoin('business_profiles as profile', 'profile.id', 'member.business_profile')
            .select(
              'member.id',
              'member.business_profile',
              'member.member_role',
              'member.status',
              'profile.owner_user',
              'profile.company_name',
              'profile.is_active',
              'profile.plan_code',
              'profile.billing_status'
            )
            .where('member.user', userId)
            .first();

          if (existingMembership) {
            const isExistingSelfOwnedWorkspace =
              existingMembership.owner_user === userId &&
              existingMembership.member_role === 'owner' &&
              existingMembership.status === 'active' &&
              existingMembership.business_profile;

          if (isExistingSelfOwnedWorkspace) {
            await trx('directus_users')
              .where({ id: userId })
              .update({
                active_business_profile: existingMembership.business_profile,
                active_department: null,
                active_member_role: 'owner'
              });

            const existingContext = buildExistingContext(existingMembership);
            return {
              status: 200,
              data: {
                ...existingContext,
                membership: {
                  ...existingContext.membership,
                  businessProfileId: String(existingMembership.business_profile)
                }
              }
            };
          }

            const error = new Error('This user already belongs to another workspace.');
            error.code = 'EXISTING_MEMBERSHIP';
            throw error;
          }

          const duplicateOwnerMembership = await trx('business_profile_members')
            .select('id')
            .where({ user: userId })
            .where({ member_role: 'owner' })
            .first();

          if (duplicateOwnerMembership) {
            const error = new Error('This user already has an owner membership.');
            error.code = 'EXISTING_OWNER_MEMBERSHIP';
            throw error;
          }

          const ownerRoleId = await requireConfiguredOwnerRoleId(trx);

          const [profile] = await trx('business_profiles')
            .insert(buildBusinessProfileInsertPayload(companyPayload.value, recordIds))
            .returning(['id', 'company_name', 'is_active', 'plan_code', 'billing_status']);

          if (!profile?.id) {
            throw new Error('Workspace creation did not return an id.');
          }

          const [membership] = await trx('business_profile_members')
            .insert(buildOwnerMembershipInsertPayload(userId, profile.id, now))
            .returning(['id', 'business_profile', 'member_role', 'status']);

          if (!membership?.id) {
            throw new Error('Owner membership creation did not return an id.');
          }

          await syncDirectusUserOwnerContext(trx, userId, profile.id, ownerRoleId);

          return {
            status: 201,
            data: buildCreatedWorkspaceResponse(profile, membership),
            audit: {
              userId,
              businessProfileId: profile.id,
              membershipId: membership.id,
              activityEventId: recordIds.activityEventId,
              idempotencyKey
            }
          };
        });

        if (result.status === 201 && result.audit) {
          await logWorkspaceCreatedActivityEvent(database, logger, result.audit);
        }

        return res.status(result.status).json({ data: result.data });
      } catch (error) {
        if (error?.code === 'EXISTING_MEMBERSHIP' || error?.code === 'EXISTING_OWNER_MEMBERSHIP') {
          return conflict(res, error.message);
        }
        if (error?.code === 'CONFIGURATION_ERROR') {
          return configurationError(res, error.message);
        }

        logger?.error?.(error, '[wellar] workspace creation failed');
        return serverError(res, 'Workspace could not be created.');
      }
    });
  }
};
export {
  buildBusinessProfileInsertPayload,
  buildCompanyPayload,
  buildCreatedWorkspaceResponse,
  buildOwnerMembershipInsertPayload,
  buildWorkspaceCreatedActivityEventPayload,
  buildWorkspaceRecordIds,
  logWorkspaceCreatedActivityEvent
};
