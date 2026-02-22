import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, Routes } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { PublicLayout } from './public.layout/public.layout';
import { Authlanding } from './public.layout/authlanding/authlanding';
import { DownloadAppLanding } from './public.layout/download-app/download-app';


import { LayoutComponent } from './Layout/Layout';
import { AuditLogs } from './Pages/audit-logs/audit-logs';
import { DashboardMobileComponent } from './Pages/mobile/dashboard-mobile.component';
import { RequestsMobileComponent } from './Pages/mobile/requests-mobile.component';
import { HistoryMobileComponent } from './Pages/mobile/history-mobile.component';
import { ProfileMobileComponent } from './Pages/mobile/profile-mobile.component';
import { AuditLogsMobileComponent } from './Pages/mobile/audit-logs-mobile.component';
import { SubscriptionService } from './services/subscription.service';

const isMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 768px)').matches;

const mobileDashboardMatch: CanMatchFn = () => isMobileViewport();
const mobileRequestsMatch: CanMatchFn = () => isMobileViewport();
const mobileCreateRequestMatch: CanMatchFn = () => isMobileViewport();
const mobileHistoryMatch: CanMatchFn = () => isMobileViewport();
const mobileProfileMatch: CanMatchFn = () => isMobileViewport();
const mobileAuditLogsMatch: CanMatchFn = () => isMobileViewport();
const mobileBusinessCenterMatch: CanMatchFn = () => isMobileViewport();

const paymentAccessGuard: CanActivateFn = () => {
  const subscriptions = inject(SubscriptionService);
  const router = inject(Router);

  if (typeof localStorage === 'undefined') {
    return true;
  }

  const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
  if (!token) {
    return true;
  }

  return subscriptions.isBusinessOnboardingComplete().pipe(
    map((completed) =>
      completed ? router.createUrlTree(['/dashboard']) : true
    ),
    catchError(() => of(true))
  );
};

const businessOnboardingGuard: CanActivateFn = (_, state) => {
  if (typeof localStorage === 'undefined') {
    return true;
  }

  const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
  if (!token) {
    return true;
  }

  const targetPath = state.url.split('?')[0];
  if (
    targetPath === '/payment' ||
    targetPath === '/upgrade-plan' ||
    targetPath === '/login' ||
    targetPath === '/signup' ||
    targetPath === '/auth-callback'
  ) {
    return true;
  }

  const subscriptions = inject(SubscriptionService);
  const router = inject(Router);

  return subscriptions.isBusinessOnboardingComplete().pipe(
    map((completed) =>
      completed
        ? true
        : router.createUrlTree(['/payment'], {
          queryParams: { onboarding: 'required' }
        })
    ),
    catchError(() =>
      of(
        router.createUrlTree(['/payment'], {
          queryParams: { onboarding: 'required' }
        })
      )
    )
  );
};


export const routes: Routes = [


{
  path: 'dashboard',
  canMatch: [mobileDashboardMatch],
  canActivate: [businessOnboardingGuard],
  component: DashboardMobileComponent
},
{
  path: 'audit-logs',
  canMatch: [mobileAuditLogsMatch],
  canActivate: [businessOnboardingGuard],
  component: AuditLogsMobileComponent
},
{
  path: 'requests/create',
  canMatch: [mobileCreateRequestMatch],
  canActivate: [businessOnboardingGuard],
  loadComponent: () =>
    import('./Pages/create-request/create-request')
      .then(m => m.CreateRequestComponent)
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
  loadComponent: () =>
    import('./Pages/business-center/business-center')
      .then(m => m.BusinessCenterComponent)
},

  /* ================= PUBLIC ================= */
  {
    path: '',
    component: PublicLayout,
    children: [
      { path: '', component: Authlanding },
      { path: 'login', component: Authlanding, data: { authMode: 'login' } },
      { path: 'signup', component: Authlanding, data: { authMode: 'signup' } },
      { path: 'download-app', component: DownloadAppLanding },
      {
        path: 'about',
        loadComponent: () =>
          import('./public.layout/about/about')
            .then(m => m.AboutComponent)
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./public.layout/contact/contact')
            .then(m => m.ContactComponent)
      },
      {
        path: 'careers',
        loadComponent: () =>
          import('./public.layout/careers/careers')
            .then(m => m.CareersComponent)
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./public.layout/privacy/privacy')
            .then(m => m.PrivacyComponent)
      },
      {
        path: 'terms',
        loadComponent: () =>
          import('./public.layout/terms/terms')
            .then(m => m.TermsComponent)
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./public.layout/security/security')
            .then(m => m.SecurityComponent)
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./public.layout/pricing/pricing')
            .then(m => m.PricingComponent)
      },
      {
        path: 'upgrade-plan',
        canActivate: [paymentAccessGuard],
        loadComponent: () =>
          import('./public.layout/upgrade-plan/upgrade-plan')
            .then(m => m.UpgradePlanComponent)
      },
      {
        path: 'payment',
        canActivate: [paymentAccessGuard],
        loadComponent: () =>
          import('./public.layout/upgrade-plan/upgrade-plan')
            .then(m => m.UpgradePlanComponent)
      }
    ]
  },

  /* ================= APP (WITH SIDEBAR) ================= */
  {
    path: '',
    component: LayoutComponent,
    canActivate: [businessOnboardingGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./Pages/dashboard/dashboard')
            .then(m => m.Dashboard)
      },
      /* Example sidebar pages */
      {
        path: 'history',
        loadComponent: () =>
          import('./Pages/history/history')
            .then(m => m.History)
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./Pages/audit-logs/audit-logs')
            .then(m => m.AuditLogs)
      },
      {
        path: 'requests/create',
        canActivate: [businessOnboardingGuard],
        loadComponent: () =>
          import('./Pages/create-request/create-request')
            .then(m => m.CreateRequestComponent)
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('./Pages/requests/requests')
            .then(m => m.Requests)
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./Pages/profile/profile')
            .then(m => m.Profile)
      },
      {
        path: 'business-center',
        canActivate: [businessOnboardingGuard],
        loadComponent: () =>
          import('./Pages/business-center/business-center')
            .then(m => m.BusinessCenterComponent)
      }
    ]
  },
{
  path: 'verify-email',
  loadComponent: () =>
    import('./verifyemail/verifyemail').then(m => m.VerifyEmailComponent)
},
{
  path: 'auth-callback',
  loadComponent: () =>
    import('./auth-callback/auth-callback').then(m => m.AuthCallbackComponent)
},

  /* ================= FALLBACK ================= */
  { path: '**', redirectTo: '' },


];


