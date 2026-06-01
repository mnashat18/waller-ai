import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, Routes } from '@angular/router';
import { catchError, map, of, timeout } from 'rxjs';
import { environment } from '../environments/environment';

import { PublicLayout } from './public.layout/public.layout';
import { Authlanding } from './public.layout/authlanding/authlanding';
import { DownloadAppLanding } from './public.layout/download-app/download-app';
import { SignupComponent } from './public.layout/signup/signup';
import { LoginComponent } from './public.layout/login/login';

import { DashboardMobileComponent } from './Pages/mobile/dashboard-mobile.component';
import { RequestsMobileComponent } from './Pages/mobile/requests-mobile.component';
import { HistoryMobileComponent } from './Pages/mobile/history-mobile.component';
import { ProfileMobileComponent } from './Pages/mobile/profile-mobile.component';
import { AuditLogsMobileComponent } from './Pages/mobile/audit-logs-mobile.component';
import { BusinessCenterMobileComponent } from './Pages/mobile/business-center-mobile.component';

import { BusinessCenterService } from './services/business-center.service';
import { CompanyContextService } from './core/context/company-context.service';
import { InviteService } from './services/invites';
import { PostLoginRoutingService } from './services/post-login-routing.service';
import { SubscriptionService } from './services/subscription.service';
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
const ACTIVE_MEMBERSHIP_STORAGE_KEY = 'active_workspace_membership_v1';

const getPendingInviteToken = (): string | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const token = localStorage.getItem('pending_invite_token')?.trim() ?? '';
  return token || null;
};

const hasInviteClaimSuccessMarker = (): boolean => {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(INVITE_CLAIM_SUCCESS_PREFIX)) {
        continue;
      }

      if (localStorage.getItem(key) === 'true' || sessionStorage.getItem(key) === '1') {
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

const hasStoredActiveWorkspaceContext = (): boolean => {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  const activeBusinessProfileId =
    localStorage.getItem('active_business_profile_id')?.trim() ??
    localStorage.getItem('active_business_profile')?.trim() ??
    '';
  const activeRole = normalizeStoredRole();
  if (activeBusinessProfileId && activeRole) {
    return true;
  }

  const rawMembership = localStorage.getItem(ACTIVE_MEMBERSHIP_STORAGE_KEY);
  if (!rawMembership) {
    return false;
  }

  try {
    const membership = JSON.parse(rawMembership) as {
      status?: unknown;
      business_profile?: unknown;
      member_role?: unknown;
    };

    const status = String(membership?.status ?? '').trim().toLowerCase();
    const businessProfile = membership?.business_profile;
    const memberRole = normalizeRole(membership?.member_role);
    const businessProfileId =
      (typeof businessProfile === 'string' && businessProfile.trim()) ||
      (typeof businessProfile === 'object' && businessProfile !== null
        ? String((businessProfile as { id?: unknown }).id ?? '').trim()
        : '');

    return status === 'active' && Boolean(businessProfileId) && Boolean(memberRole);
  } catch {
    return false;
  }
};

const hasStoredActiveWorkspace = (): boolean => {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  const activeBusinessProfileId =
    localStorage.getItem('active_business_profile_id')?.trim() ??
    localStorage.getItem('active_business_profile')?.trim() ??
    '';
  const role = normalizeStoredRole();
  if (activeBusinessProfileId && role) {
    return true;
  }

  return hasStoredActiveWorkspaceContext();
};

const shouldBypassOnboardingForInvite = (): boolean =>
  hasStoredActiveWorkspace() ||
  hasInviteClaimSuccessMarker() ||
  hasInviteClaimCompletedMarker() ||
  hasInviteClaimInProgressMarker();

const normalizeStoredRole = (): string => {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  return normalizeRole(localStorage.getItem('active_member_role'));
};

const resolveInviteMemberLandingRoute = (): string => {
  const role = normalizeStoredRole();
  if (role === 'owner' || role === 'hr' || role === 'manager') {
    return '/app/dashboard';
  }

  if (role === 'employee') {
    return '/employee-web-access';
  }

  if (hasStoredActiveWorkspace()) {
    return '/app/dashboard';
  }

  return '/app/workspace-access';
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
const mobileBusinessCenterMatch: CanMatchFn = () => isMobileViewport();

const appAuthGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = getStoredToken();

  if (!token) {
    return router.createUrlTree(['/']);
  }

  return true;
};

const paymentAccessGuard: CanActivateFn = () => {
  const subscriptions = inject(SubscriptionService);
  const router = inject(Router);
  const token = getStoredToken();
  const pendingInviteToken = getPendingInviteToken();

  if (pendingInviteToken) {
    return router.createUrlTree(['/invites/claim'], {
      queryParams: { token: pendingInviteToken }
    });
  }

  if (token && hasStoredActiveWorkspace()) {
    debugRouteGuard('dashboard allowed because active workspace exists', {
      target: '/payment'
    });
    return router.parseUrl(resolveInviteMemberLandingRoute());
  }

  if (token && shouldBypassOnboardingForInvite()) {
    debugRouteGuard('skipped payment onboarding because user is invited member', {
      target: '/payment'
    });
    return router.parseUrl(resolveInviteMemberLandingRoute());
  }

  if (!token) {
    return true;
  }

  return subscriptions.isBusinessOnboardingComplete().pipe(
    timeout(8000),
    map((completed) => (completed ? router.createUrlTree(['/app/dashboard']) : true)),
    catchError(() => of(true))
  );
};

const businessOnboardingGuard: CanActivateFn = (_, state) => {
  const token = getStoredToken();

  if (!token) {
    return true;
  }

  const targetPath = state.url.split('?')[0];

  const publicOrAuthPaths = new Set([
    '/',
    '/login',
    '/signup',
    '/auth-callback',
    '/verify-email',
    '/download-app',
    '/request-welcome',
    '/about',
    '/contact',
    '/careers',
    '/privacy',
    '/terms',
    '/security',
    '/pricing',
    '/payment',
    '/upgrade-plan'
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

  if (hasStoredActiveWorkspace()) {
    debugRouteGuard('dashboard allowed because active workspace exists', {
      target: state.url
    });
    return true;
  }

  if (shouldBypassOnboardingForInvite()) {
    debugRouteGuard('skipped payment onboarding because user is invited member', {
      target: state.url
    });
    return true;
  }

  const subscriptions = inject(SubscriptionService);
  const router = inject(Router);

  return subscriptions.isBusinessOnboardingComplete().pipe(
    timeout(8000),
    map((completed) => {
      if (completed || hasStoredActiveWorkspace()) {
        if (hasStoredActiveWorkspace()) {
          debugRouteGuard('dashboard allowed because active workspace exists', {
            target: state.url
          });
        }
        return true;
      }

      return router.createUrlTree(['/payment'], {
        queryParams: { onboarding: 'required' }
      });
    }),
    // Fail-open on network/timeout so routes do not get stuck.
    catchError(() => of(true))
  );
};

const dashboardWorkspaceGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const token = getStoredToken();
  if (!token) {
    return router.createUrlTree(['/']);
  }

  if (hasStoredActiveWorkspace()) {
    debugRouteGuard('dashboard allowed because active workspace exists');
    return true;
  }

  const pendingInviteToken = getPendingInviteToken();
  if (pendingInviteToken) {
    return router.createUrlTree(['/invites/claim'], {
      queryParams: { token: pendingInviteToken }
    });
  }

  const claimFlowActive =
    hasInviteClaimSuccessMarker() ||
    hasInviteClaimCompletedMarker() ||
    hasInviteClaimInProgressMarker();
  if (!claimFlowActive) {
    return true;
  }

  const invites = inject(InviteService);
  const postLoginRouting = inject(PostLoginRoutingService);
  const companyContext = inject(CompanyContextService);

  try {
    await postLoginRouting.refreshAuthAndWorkspaceContext({ force: true });
  } catch {
    // Continue with best effort checks below.
  }

  const context = companyContext.snapshot().context;
  const hasActiveWorkspace =
    Boolean(context.activeBusinessProfileId) && Boolean(context.activeMemberRole);
  if (hasActiveWorkspace || hasStoredActiveWorkspace()) {
    debugRouteGuard('dashboard allowed because active workspace exists', {
      activeBusinessProfileId: context.activeBusinessProfileId ?? null,
      activeMemberRole: context.activeMemberRole ?? null
    });
    return true;
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
  const role = normalizeStoredRole();
  if (role !== 'employee') {
    return true;
  }

  const router = inject(Router);
  const blockedPaths = new Set([
    '/app/dashboard',
    '/app/workforce',
    '/app/scan-requests',
    '/app/compliance',
    '/app/alerts',
    '/app/reports',
    '/app/company',
    '/app/settings'
  ]);
  const targetPath = state.url.split('?')[0].toLowerCase();

  if (blockedPaths.has(targetPath)) {
    return router.createUrlTree(['/employee-web-access']);
  }

  return true;
};

const ownerWorkspaceGuard: CanActivateFn = (_, state) => {
  const token = getStoredToken();

  if (!token) {
    return true;
  }

  const businessCenter = inject(BusinessCenterService);
  const router = inject(Router);
  const targetPath = state.url.split('?')[0];

  return businessCenter.getHubAccessState().pipe(
    timeout(8000),
    map((accessState) => {
      if (!accessState?.hasPaidAccess) {
        return true;
      }

      const role = (accessState.memberRole ?? '').toString().trim().toLowerCase();
      if (role === 'owner' || role === 'admin' || role === 'manager') {
        return true;
      }

      if (targetPath === '/requests' || targetPath === '/app/scan-requests') {
        // Non-owner roles can access Requests in personal scope only.
        return true;
      }

      if (targetPath === '/business-center' || targetPath === '/app/company') {
        return router.createUrlTree(['/app/dashboard'], {
          queryParams: { restricted: 'business-center' }
        });
      }

      return router.createUrlTree(['/app/dashboard'], {
        queryParams: { restricted: 'team' }
      });
    }),
    catchError(() => of(true))
  );
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
  {
    path: 'business-center',
    canMatch: [mobileBusinessCenterMatch],
    canActivate: [businessOnboardingGuard],
    component: BusinessCenterMobileComponent
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
    path: 'business-center',
    pathMatch: 'full',
    redirectTo: '/app/company'
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
        path: '',
        component: LoginComponent
      },
      {
        path: '',
        component: SignupComponent
      },
      {
        path: 'download-app',
        component: DownloadAppLanding
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
      }
    ]
  },

  /* ================= AUTH ================= */
  {
    path: 'auth',
    component: PublicLayout,
    children: [
      {
        path: 'login',
        component: LoginComponent
      }
    ]
  },

  /* ================= NEW AUTHENTICATED APP ================= */
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
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/workforce/workforce').then((m) => m.WorkforcePageComponent)
      },
      {
        path: 'scan-requests',
        canActivate: [employeeWebOperationalGuard],
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
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/company/company').then((m) => m.CompanyPageComponent)
      },
      {
        path: 'compliance',
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/compliance/compliance').then((m) => m.CompliancePageComponent)
      },
      {
        path: 'alerts',
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/alerts/alerts').then((m) => m.AlertsPageComponent)
      },
      {
        path: 'reports',
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/reports/reports').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'settings',
        canActivate: [employeeWebOperationalGuard],
        loadComponent: () =>
          import('./Pages/settings/settings').then((m) => m.SettingsPageComponent)
      },
      {
        path: 'workspace-access',
        loadComponent: () =>
          import('./Pages/workspace-access/workspace-access').then(
            (m) => m.WorkspaceAccessPageComponent
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
    canActivate: [appAuthGuard],
    loadComponent: () =>
      import('./Pages/employee-web-access/employee-web-access').then(
        (m) => m.EmployeeWebAccessPageComponent
      )
  },

  /* ================= FALLBACK ================= */
  {
    path: '**',
    redirectTo: ''
  }
];
