import { CanMatchFn, Routes } from '@angular/router';

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

const isMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 768px)').matches;

const mobileDashboardMatch: CanMatchFn = () => isMobileViewport();
const mobileRequestsMatch: CanMatchFn = () => isMobileViewport();
const mobileHistoryMatch: CanMatchFn = () => isMobileViewport();
const mobileProfileMatch: CanMatchFn = () => isMobileViewport();
const mobileAuditLogsMatch: CanMatchFn = () => isMobileViewport();


export const routes: Routes = [


{
  path: 'dashboard',
  canMatch: [mobileDashboardMatch],
  component: DashboardMobileComponent
},
{
  path: 'audit-logs',
  canMatch: [mobileAuditLogsMatch],
  component: AuditLogsMobileComponent
},
{
  path: 'requests',
  canMatch: [mobileRequestsMatch],
  component: RequestsMobileComponent
},
{
  path: 'history',
  canMatch: [mobileHistoryMatch],
  component: HistoryMobileComponent
},
{
  path: 'profile',
  canMatch: [mobileProfileMatch],
  component: ProfileMobileComponent
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
      }
    ]
  },

  /* ================= APP (WITH SIDEBAR) ================= */
  {
    path: '',
    component: LayoutComponent,
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

