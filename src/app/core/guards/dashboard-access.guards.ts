const AUTH_ONLY_PATHS = new Set([
  '/auth-callback',
  '/verify-email',
  '/download-app'
]);

export function isAuthOnlyRoute(url: string): boolean {
  const path = (url || '').split('?')[0].trim().toLowerCase();
  if (!path) {
    return false;
  }
  return AUTH_ONLY_PATHS.has(path);
}
