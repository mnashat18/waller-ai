import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, Routes, UrlMatcher } from '@angular/router';
import { environment } from '../environments/environment';

import { PublicLayout } from './public.layout/public.layout';
import { Authlanding } from './public.layout/authlanding/authlanding';
import { DownloadAppLanding } from './public.layout/download-app/download-app';

import { DashboardMobileComponent } from './Pages/mobile/dashboard-mobile.component';
import { RequestsMobileComponent } from './Pages/mobile/requests-mobile.component';
import { HistoryMobileComponent } from './Pages/mobile/history-mobile.component';
import { ProfileMobileComponent } from './Pages/mobile/profile-mobile.component';
import { AuditLogsMobileComponent } from './Pages/mobile/audit-logs-mobile.component';

import { CompanyContextService } from './core/context/company-context.service';
import { InviteService } from './services/invites';
import { PostAuthWelcomeService } from './services/post-auth-welcome.service';
import { PostLoginRoutingService } from './services/post-login-routing.service';
import { AppShellComponent } from './dashboard-shell/app-shell.component';

const isLikelyJwt = (token: string): boolean => {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.trim().length > 0);
};

const isInviteLikeToken = (token: string): boolean =>
  /^wlr-[a-z0-9_-]+$/i.test(token.trim());

const clearStoredAuthAliases = (): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('directus_token');
};

const INVITE_CLAIM_SUCCESS_PREFIX = 'invite_claim_success_';
const INVITE_CLAIM_COMPLETED_KEY = 'invite_claim_completed';
const INVITE_CLAIM_IN_PROGRESS_PREFIX = 'invite_claim_in_progress_';
const WORKSPACE_RECOVERY_RETURN_URL_KEY = 'wellar_workspace_recovery_return_url';

const storeWorkspaceRecoveryTarget = (requestedUrl: string): void => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  const normalized = requestedUrl.trim();
  if (!normalized) {
    return;
  }

  sessionStorage.setItem(WORKSPACE_RECOVERY_RETURN_URL_KEY, normalized);
};

const createWorkspaceRecoveryTree = (router: Router, requestedUrl: string) => {
  storeWorkspaceRecoveryTarget(requestedUrl);
  return router.createUrlTree(['/app/workspace-access'], {
    queryParams: { returnUrl: requestedUrl }
  });
};

const getPendingInviteToken = (): string | null => {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const token = sessionStorage.getItem('pending_invite_token')?.trim() ?? '';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pending_invite_token');
    }
    return token || null;
  } catch {
    return null;
  }
};

const hasInviteClaimSuccessMarker = (): boolean => {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key || !key.startsWith(INVITE_CLAIM_SUCCESS_PREFIX)) {
        continue;
      }

      if (sessionStorage.getItem(key) === 'true' || sessionStorage.getItem(key) === '1') {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
};

const hasInviteClaimCompletedMarker = (): boolean => {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  return sessionStorage.getItem(INVITE_CLAIM_COMPLETED_KEY) === '1';
};

const hasInviteClaimInProgressMarker = (): boolean => {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key || !key.startsWith(INVITE_CLAIM_IN_PROGRESS_PREFIX)) {
        continue;
      }

      if (sessionStorage.getItem(key) === 'true') {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
};

const normalizeRole = (value: unknown): string => {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'manger') return 'manager';
  if (role === 'admin') return 'hr';
  if (role === 'member' || role === 'viewer') return 'employee';
  return role;
};

const resolveWorkspaceLandingRoute = (roleValue: string | null | undefined): string => {
  const role = normalizeRole(roleValue);
  if (role === 'owner' || role === 'hr' || role === 'manager') {
    return '/app/dashboard';
  }

  if (role === 'employee') {
    return '/employee-web-access';
  }

  return '/app/workspace-access';
};

const resolveVerifiedWorkspaceContext = async (companyContext: CompanyContextService, forceRefresh = false) => {
  try {
    return await companyContext.ensureVerifiedWorkspaceContext(forceRefresh);
  } catch {
    return null;
  }
};

const debugRouteGuard = (message: string, details?: Record<string, unknown>): void => {
  if (environment.production) {
    return;
  }

  if (details) {
    console.debug(`[RouteGuard] ${message}`, details);
    return;
  }

  console.debug(`[RouteGuard] ${message}`);
};

const getStoredToken = (): string | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const token = (
    localStorage.getItem('token') ??
    localStorage.getItem('access_token') ??
    localStorage.getItem('directus_token')
  );
  const normalized = token?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  if (!isLikelyJwt(normalized) || isInviteLikeToken(normalized)) {
    clearStoredAuthAliases();
    return null;
  }

  return normalized;
};

const isMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const supportsMatchMedia = typeof window.matchMedia === 'function';
  const isNarrow = supportsMatchMedia
    ? window.matchMedia('(max-width: 768px)').matches
    : window.innerWidth <= 768;

  const hasTouch =
    typeof navigator !== 'undefined' &&
    ((typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));

  // Prevent desktop browsers, for example DevTools narrow resize,
  // from being routed into mobile-only pages.
  return isNarrow && hasTouch;
};

const mobileDashboardMatch: CanMatchFn = () => isMobileViewport();
const mobileRequestsMatch: CanMatchFn = () => isMobileViewport();
const mobileHistoryMatch: CanMatchFn = () => isMobileViewport();
const mobileProfileMatch: CanMatchFn = () => isMobileViewport();
const mobileAuditLogsMatch: CanMatchFn = () => isMobileViewport();

const appAuthGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = getStoredToken();

  if (!token) {
    return router.createUrlTree(['/']);
  }

  return true;
};

const paymentAccessGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const token = getStoredToken();
  const pendingInviteToken = getPendingInviteToken();

  if (pendingInviteToken) {
    return router.createUrlTree(['/invites/claim'], {
      queryParams: { token: pendingInviteToken }
    });
  }

  if (!token) {
    return true;
  }

  const companyContext = inject(CompanyContextService);
  const context = await resolveVerifiedWorkspaceContext(companyContext, false);
  if (context?.activeBusinessProfile?.id) {
    debugRouteGuard('dashboard allowed because active workspace exists', {
      target: '/payment'
    });
    return router.parseUrl(resolveWorkspaceLandingRoute(context.activeMemberRole));
  }

  return createWorkspaceRecoveryTree(router, '/payment');
};

export const businessOnboardingGuard: CanActivateFn = (_, state) => {
  const token = getStoredToken();

  if (!token) {
    return true;
  }

  const targetPath = state.url.split('?')[0];

  const publicOrAuthPaths = new Set([
    '/',
    '/auth-callback',
    '/verify-email',
    '/download-app',
    '/delete-account',
    '/request-welcome',
    '/about',
    '/contact',
    '/careers',
    '/privacy',
    '/terms',
    '/security',
    '/pricing',
    '/payment',
    '/upgrade-plan',
    '/app/workspace-activating',
    '/app/workspace-access',
    '/app/workspace/request',
    '/app/workspace-restricted'
  ]);

  if (publicOrAuthPaths.has(targetPath)) {
    return true;
  }

  const pendingInviteToken = getPendingInviteToken();
  if (pendingInviteToken) {
    const router = inject(Router);
    return router.createUrlTree(['/invites/claim'], {
      queryParams: { token: pendingInviteToken }
    });
  }

  const router = inject(Router);
  const companyContext = inject(CompanyContextService);

  return resolveVerifiedWorkspaceContext(companyContext, false).then((context) => {
    if (context?.activeBusinessProfile?.id) {
      debugRouteGuard('dashboard allowed because active workspace exists', {
        target: state.url
      });
      return true;
    }

    return createWorkspaceRecoveryTree(router, state.url);
  });
};

export const dashboardWorkspaceGuard: CanActivateFn = async (_, state) => {
  const router = inject(Router);
  const token = getStoredToken();
  if (!token) {
    return router.createUrlTree(['/']);
  }

  const pendingInviteToken = getPendingInviteToken();
  if (pendingInviteToken) {
    return router.createUrlTree(['/invites/claim'], {
      queryParams: { token: pendingInviteToken }
    });
  }

  const invites = inject(InviteService);
  const companyContext = inject(CompanyContextService);
  const claimFlowActive =
    hasInviteClaimSuccessMarker() ||
    hasInviteClaimCompletedMarker() ||
    hasInviteClaimInProgressMarker();

  try {
    await resolveVerifiedWorkspaceContext(companyContext, true);
  } catch {
    return createWorkspaceRecoveryTree(router, state.url);
  }

  const context = companyContext.snapshot().context;
  const hasActiveWorkspace =
    Boolean(context.activeBusinessProfileId) && Boolean(context.activeMemberRole);
  if (hasActiveWorkspace) {
    debugRouteGuard('dashboard allowed because active workspace exists', {
      activeBusinessProfileId: context.activeBusinessProfileId ?? null,
      activeMemberRole: context.activeMemberRole ?? null
    });
    return true;
  }

  if (!claimFlowActive) {
    return createWorkspaceRecoveryTree(router, state.url);
  }

  const inviteToken =
    invites.getPendingInviteToken() ??
    invites.getInviteTokenFromCurrentUrl();
  invites.setInviteClaimError('Invite accepted, but workspace context could not be loaded.');
  return router.createUrlTree(['/invites/claim'], {
    queryParams: inviteToken ? { token: inviteToken } : undefined
  });
};

const employeeWebOperationalGuard: CanActivateFn = (_, state) => {
  const router = inject(Router);
  const companyContext = inject(CompanyContextService);

  return resolveVerifiedWorkspaceContext(companyContext, false).then((context) => {
    if (!context?.activeBusinessProfile?.id) {
      return createWorkspaceRecoveryTree(router, state.url);
    }

    if (normalizeRole(context.activeMemberRole) !== 'employee') {
      return true;
    }

    const blockedPaths = new Set([
      '/app/dashboard',
      '/app/workforce',
      '/app/scan-requests',
      '/app/compliance',
      '/app/alerts',
      '/app/activity',
      '/app/reports',
      '/app/company',
      '/app/settings'
    ]);
    const targetPath = state.url.split('?')[0].toLowerCase();

    if (blockedPaths.has(targetPath)) {
      return router.createUrlTree(['/employee-web-access']);
    }

    return true;
  });
};

const activeRoleRouteGuard = (allowedRoles: string[]): CanActivateFn => (_, state) => {
  const router = inject(Router);
  const companyContext = inject(CompanyContextService);

  return resolveVerifiedWorkspaceContext(companyContext, false).then((context) => {
    const role = normalizeRole(context?.activeMemberRole);
    if (context?.activeBusinessProfile?.id && allowedRoles.includes(role)) {
      return true;
    }

    const redirectTo = role === 'employee' ? '/employee-web-access' : '/app/workspace-access';
    return router.createUrlTree([redirectTo], {
      queryParams: { restricted: state.url.split('?')[0].toLowerCase() }
    });
  });
};

const ownerHrRouteGuard = activeRoleRouteGuard(['owner', 'hr']);

const welcomeIntentGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const postAuthWelcome = inject(PostAuthWelcomeService);
  const postLoginRouting = inject(PostLoginRoutingService);

  if (postAuthWelcome.hasPendingIntent()) {
    return true;
  }

  try {
    const nextRoute = await postLoginRouting.resolveDestinationStrict();
    return router.parseUrl(nextRoute || '/app/workspace-access');
  } catch {
    return router.parseUrl('/app/workspace-access');
  }
};

const appWelcomeMatcher: UrlMatcher = (segments) => {
  if (segments.length !== 2) {
    return null;
  }

  if (segments[0]?.path !== 'app' || segments[1]?.path !== 'welcome') {
    return null;
  }

  return { consumed: segments.slice(0, 2) };
};

export const ownerWorkspaceGuard: CanActivateFn = (_, state) => {
  const token = getStoredToken();

  if (!token) {
    return true;
  }

  const companyContext = inject(CompanyContextService);
  const router = inject(Router);
  const targetPath = state.url.split('?')[0];

  return resolveVerifiedWorkspaceContext(companyContext, false).then((verifiedContext) => {
    const role = normalizeRole(verifiedContext?.activeMemberRole);
    if (verifiedContext?.activeBusinessProfile?.id && (role === 'owner' || role === 'hr' || role === 'manager')) {
      return true;
    }

    if (targetPath === '/requests' || targetPath === '/app/scan-requests') {
      return true;
    }

    if (targetPath === '/app/company') {
      return router.createUrlTree(['/app/dashboard'], {
        queryParams: { restricted: 'company' }
      });
    }

    return router.createUrlTree(['/app/dashboard'], {
      queryParams: { restricted: 'team' }
    });
  });
};

export const routes: Routes = [
  /* ================= MOBILE ONLY LEGACY PATHS ================= */
  {
    path: 'dashboard',
    canMatch: [mobileDashboardMatch],
    canActivate: [businessOnboardingGuard],
    component: DashboardMobileComponent
  },
  {
    path: 'audit-logs',
    canMatch: [mobileAuditLogsMatch],
    canActivate: [businessOnboardingGuard, ownerWorkspaceGuard],
    component: AuditLogsMobileComponent
  },
  {
    path: 'requests',
    canMatch: [mobileRequestsMatch],
    canActivate: [businessOnboardingGuard],
    component: RequestsMobileComponent
  },
  {
    path: 'history',
    canMatch: [mobileHistoryMatch],
    canActivate: [businessOnboardingGuard],
    component: HistoryMobileComponent
  },
  {
    path: 'profile',
    canMatch: [mobileProfileMatch],
    canActivate: [businessOnboardingGuard],
    component: ProfileMobileComponent
  },

  /* ================= OLD DESKTOP URLS -> NEW APP URLS ================= */
  {
    path: 'dashboard',
    pathMatch: 'full',
    redirectTo: '/app/dashboard'
  },
  {
    path: 'requests',
    pathMatch: 'full',
    redirectTo: '/app/scan-requests'
  },
  {
    path: 'history',
    pathMatch: 'full',
    redirectTo: '/app/dashboard'
  },
  {
    path: 'profile',
    pathMatch: 'full',
    redirectTo: '/app/workspace-access'
  },
  {
    path: 'audit-logs',
    pathMatch: 'full',
    redirectTo: '/app/dashboard'
  },

  /* ================= PUBLIC WEBSITE ================= */
  {
    path: '',
    component: PublicLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: Authlanding
      },
      {
        path: 'download-app',
        component: DownloadAppLanding
      },
      {
        path: 'delete-account',
        loadComponent: () =>
          import('./public.layout/delete-account/delete-account').then(
            (m) => m.DeleteAccountComponent
          )
      },
      {
        path: 'request-welcome',
        loadComponent: () =>
          import('./public.layout/request-welcome/request-welcome').then(
            (m) => m.RequestWelcomeComponent
          )
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./public.layout/about/about').then((m) => m.AboutComponent)
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./public.layout/contact/contact').then((m) => m.ContactComponent)
      },
      {
        path: 'careers',
        loadComponent: () =>
          import('./public.layout/careers/careers').then((m) => m.CareersComponent)
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./public.layout/privacy/privacy').then((m) => m.PrivacyComponent)
      },
      {
        path: 'terms',
        loadComponent: () =>
          import('./public.layout/terms/terms').then((m) => m.TermsComponent)
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./public.layout/security/security').then((m) => m.SecurityComponent)
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./public.layout/pricing/pricing').then((m) => m.PricingComponent)
      },
      {
        path: 'upgrade-plan',
        canActivate: [paymentAccessGuard],
        loadComponent: () =>
          import('./public.layout/upgrade-plan/upgrade-plan').then(
            (m) => m.UpgradePlanComponent
          )
      },
      {
        path: 'payment',
        canActivate: [paymentAccessGuard],
        loadComponent: () =>
          import('./public.layout/upgrade-plan/upgrade-plan').then(
            (m) => m.UpgradePlanComponent
          )
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./public.layout/reset-password/reset-password').then(
            (m) => m.ResetPasswordComponent
          )
      }
    ]
  },

  /* ========= LEGACY AUTH PATHS -> LANDING MODAL ========= */
  // Login/Signup are a modal overlay on the landing page, not standalone
  // pages. Any deep link to /login or /signup opens that modal via the
  // ?auth= query param handled by Authlanding.applyRouteAuthMode().
  {
    path: 'login',
    redirectTo: () => inject(Router).parseUrl('/?auth=login')
  },
  {
    path: 'signup',
    redirectTo: () => inject(Router).parseUrl('/?auth=signup')
  },

  /* ================= NEW AUTHENTICATED APP ================= */
  {
    matcher: appWelcomeMatcher,
    canActivate: [appAuthGuard, businessOnboardingGuard, welcomeIntentGuard],
    loadComponent: () =>
      import('./Pages/welcome/welcome').then((m) => m.WelcomePageComponent)
  },
  {
    path: 'app',
    component: AppShellComponent,
    canActivate: [appAuthGuard, businessOnboardingGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/dashboard/dashboard').then((m) => m.Dashboard)
      },
      {
        path: 'workforce',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/workforce/workforce').then((m) => m.WorkforcePageComponent)
      },
      {
        path: 'scan-requests',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/requests/requests').then((m) => m.RequestsPageComponent)
      },
      {
        path: 'requests',
        redirectTo: 'scan-requests',
        pathMatch: 'full'
      },
      {
        path: 'company',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard, ownerHrRouteGuard],
        loadComponent: () =>
          import('./Pages/company/company').then((m) => m.CompanyPageComponent)
      },
      {
        path: 'company/settings',
        pathMatch: 'full',
        redirectTo: 'company'
      },
      {
        path: 'business-center',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'invites',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard, ownerHrRouteGuard],
        loadComponent: () =>
          import('./Pages/invites/invites').then((m) => m.InvitesPageComponent)
      },
      {
        path: 'compliance',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/compliance/compliance').then((m) => m.CompliancePageComponent)
      },
      {
        path: 'alerts',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/alerts/alerts').then((m) => m.AlertsPageComponent)
      },
      {
        path: 'activity',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard, ownerHrRouteGuard],
        loadComponent: () =>
          import('./Pages/activity/activity').then((m) => m.ActivityPageComponent)
      },
      {
        path: 'reports',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/reports/reports').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'settings',
        canActivate: [dashboardWorkspaceGuard, employeeWebOperationalGuard, ownerHrRouteGuard],
        loadComponent: () =>
          import('./Pages/settings/settings').then((m) => m.SettingsPageComponent)
      },
      {
        path: 'workspace-access',
        loadComponent: () =>
          import('./Pages/workspace-access/workspace-access').then(
            (m) => m.WorkspaceAccessPageComponent
          )
      },
      {
        path: 'workspace-activating',
        loadComponent: () =>
          import('./Pages/workspace-activating/workspace-activating').then(
            (m) => m.WorkspaceActivatingPageComponent
          )
      },
      {
        path: 'workspace/request',
        canActivate: [dashboardWorkspaceGuard],
        loadComponent: () =>
          import('./Pages/workspace-request/workspace-request').then(
            (m) => m.WorkspaceRequestPageComponent
          )
      },
      {
        path: 'my-readiness',
        pathMatch: 'full',
        redirectTo: '/employee-web-access'
      },
      {
        path: 'workspace-restricted',
        canActivate: [dashboardWorkspaceGuard],
        loadComponent: () =>
          import('./Pages/workspace-restricted/workspace-restricted').then(
            (m) => m.WorkspaceRestrictedPageComponent
          )
      }
    ]
  },

  /* ================= STANDALONE SYSTEM ROUTES ================= */
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./verifyemail/verifyemail').then((m) => m.VerifyEmailComponent)
  },
  {
    path: 'auth-callback',
    loadComponent: () =>
      import('./auth-callback/auth-callback').then((m) => m.AuthCallbackComponent)
  },
  {
    path: 'invites/claim',
    loadComponent: () =>
      import('./Pages/invites-claim/invites-claim').then((m) => m.InviteClaimPageComponent)
  },
  {
    path: 'employee-web-access',
    canActivate: [appAuthGuard, dashboardWorkspaceGuard],
    loadComponent: () =>
      import('./Pages/employee-web-access/employee-web-access').then(
        (m) => m.EmployeeWebAccessPageComponent
      )
  },

  /* ================= FALLBACK ================= */
  {
    path: '**',
    loadComponent: () =>
      import('./Pages/not-found/not-found').then((m) => m.NotFoundComponent)
  }
];
