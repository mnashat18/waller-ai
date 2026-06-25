/**
 * Centralized classification of security/permission-related HTTP errors so that
 * front-end workflows surface consistent, professional messages.
 *
 * NOTE: This is a defense-in-depth UX layer only. It does NOT replace Directus
 * row-level / policy security — the backend remains the source of truth for
 * authorization. These helpers simply normalize how blocked or missing
 * resources are reported to the user.
 */

export type SecurityErrorKind =
  | 'session-expired'
  | 'permission-denied'
  | 'not-found'
  | 'invite-invalid'
  | 'restricted-role'
  | 'unknown';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const PERMISSION_DENIED_MESSAGE = 'You do not have permission to perform this action.';
const NOT_FOUND_MESSAGE = 'This item is not available in your active organization.';
const INVITE_INVALID_MESSAGE = 'This invitation is no longer valid or has expired.';
const RESTRICTED_ROLE_MESSAGE = 'Your access level does not allow this action.';

function readStatus(error: unknown): number {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

function readErrorMessage(error: unknown): string {
  const candidate =
    (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }> } } | null)
      ?.error?.errors?.[0]?.extensions?.reason ??
    (error as { error?: { errors?: Array<{ message?: string }> } } | null)?.error?.errors?.[0]?.message ??
    (error as { error?: { message?: string } } | null)?.error?.message ??
    (error as { message?: string } | null)?.message ??
    '';
  return (candidate ?? '').toString().toLowerCase();
}

/**
 * Classify an error (typically an HttpErrorResponse) into a coarse security kind.
 */
export function classifySecurityError(error: unknown): SecurityErrorKind {
  const status = readStatus(error);
  const message = readErrorMessage(error);

  if (status === 401) {
    return 'session-expired';
  }

  if (message.includes('invite') && (message.includes('expired') || message.includes('invalid') || message.includes('claimed'))) {
    return 'invite-invalid';
  }

  if (status === 403) {
    if (message.includes('role') || message.includes('restricted')) {
      return 'restricted-role';
    }
    return 'permission-denied';
  }

  if (status === 404) {
    return 'not-found';
  }

  if (message.includes('role') && (message.includes('cannot') || message.includes('not allow') || message.includes('restricted'))) {
    return 'restricted-role';
  }

  return 'unknown';
}

/**
 * Map an error to a clear, professional, user-facing message.
 * Falls back to the provided message when the error is not security-related.
 */
export function describeSecurityError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  switch (classifySecurityError(error)) {
    case 'session-expired':
      return SESSION_EXPIRED_MESSAGE;
    case 'permission-denied':
      return PERMISSION_DENIED_MESSAGE;
    case 'not-found':
      return NOT_FOUND_MESSAGE;
    case 'invite-invalid':
      return INVITE_INVALID_MESSAGE;
    case 'restricted-role':
      return RESTRICTED_ROLE_MESSAGE;
    default:
      return fallback;
  }
}

export const SecurityMessages = {
  sessionExpired: SESSION_EXPIRED_MESSAGE,
  permissionDenied: PERMISSION_DENIED_MESSAGE,
  notFound: NOT_FOUND_MESSAGE,
  inviteInvalid: INVITE_INVALID_MESSAGE,
  restrictedRole: RESTRICTED_ROLE_MESSAGE,
  /** Used before a by-ID mutation when the target row is outside the active organization. */
  notInWorkspace: NOT_FOUND_MESSAGE,
  /** Used when a by-ID mutation target exists but the user may not modify it. */
  cannotUpdateItem: 'You do not have permission to update this item.'
} as const;
