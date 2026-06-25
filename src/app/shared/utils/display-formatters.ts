const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function pickField(record: Record<string, unknown>, keys: Array<string>): string | undefined {
  for (const key of keys) {
    const value = pickText(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function isForbiddenIdentityLabel(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return true;
  }
  if (isUuid(text)) {
    return true;
  }
  if (/^member\s*#?\s*\d+$/i.test(text)) {
    return true;
  }
  return /^\d+$/.test(text);
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export function sanitizeDisplayValue(value: unknown, fallback: string): string {
  const text = pickText(value);
  if (!text) {
    return fallback;
  }
  return isUuid(text) ? fallback : text;
}

export function formatUserName(user: unknown, fallback = 'Unknown user'): string {
  const record = toRecord(user);
  if (!record) {
    return sanitizeDisplayValue(user, fallback);
  }

  const firstName = pickText(record['first_name']);
  const lastName = pickText(record['last_name']);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName && !isUuid(fullName)) {
    return fullName;
  }

  const email = pickText(record['email']);
  if (email && !isUuid(email)) {
    return email;
  }

  const namedFallback = pickField(record, ['name', 'label', 'title']);
  if (namedFallback && !isUuid(namedFallback)) {
    return namedFallback;
  }

  return fallback;
}

export function formatDepartment(department: unknown, fallback = 'Unassigned'): string {
  const record = toRecord(department);
  if (!record) {
    return sanitizeDisplayValue(department, fallback);
  }

  const value = pickField(record, ['name', 'title', 'label']);
  if (value && !isUuid(value)) {
    return value;
  }

  return fallback;
}

export function formatBusinessProfile(profile: unknown, fallback = 'Unknown organization'): string {
  const record = toRecord(profile);
  if (!record) {
    return sanitizeDisplayValue(profile, fallback);
  }

  const value = pickField(record, ['company_name', 'name', 'legal_name', 'title', 'label']);
  if (value && !isUuid(value)) {
    return value;
  }

  return fallback;
}

export function formatMember(member: unknown, fallback = 'Unknown member'): string {
  const record = toRecord(member);
  if (!record) {
    return sanitizeDisplayValue(member, fallback);
  }

  const nestedUser = record['user'];
  if (nestedUser) {
    const userLabel = formatUserName(nestedUser, '');
    if (userLabel) {
      return userLabel;
    }
  }

  const memberLabel = formatUserName(record, '');
  if (memberLabel) {
    return memberLabel;
  }

  const email = pickText(record['email']);
  if (email && !isUuid(email)) {
    return email;
  }

  return fallback;
}

export type WorkforceIdentity = {
  displayName: string;
  email: string | null;
  hasApprovedDisplayName: boolean;
  dataQualityIssue: string | null;
};

export function formatWorkforceIdentity(
  user: unknown,
  authorizedEmail: unknown = null,
  fallback = 'Team member'
): WorkforceIdentity {
  const record = toRecord(user);
  const firstName = record ? pickText(record['first_name']) : undefined;
  const lastName = record ? pickText(record['last_name']) : undefined;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const email = pickText(authorizedEmail) ?? (record ? pickText(record['email']) : undefined) ?? null;
  const hasApprovedDisplayName = Boolean(fullName && !isForbiddenIdentityLabel(fullName));

  return {
    displayName: hasApprovedDisplayName ? fullName : fallback,
    email: email && isLikelyEmail(email) && !isUuid(email) ? email : null,
    hasApprovedDisplayName,
    dataQualityIssue: hasApprovedDisplayName ? null : 'Approved user display name unavailable'
  };
}
