import { CanMatchFn, Routes } from '@angular/router';

import { PublicLayout } from './public.layout/public.layout';
import { Authlanding } from './public.layout/authlanding/authlanding';
import { DownloadAppLanding } from './public.layout/download-app/download-app';

import { AuthLayout } from './auth.layout/auth.layout';
import { LoginComponent } from './public.layout/login/login';
import { SignupComponent } from './public.layout/signup/signup';

import { LayoutComponent } from './Layout/Layout';
import { AuditLogs } from './Pages/audit-logs/audit-logs';
import { DashboardMobileComponent } from './Pages/mobile/dashboard-mobile.component';

const isMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 768px)').matches;

const mobileDashboardMatch: CanMatchFn = () => isMobileViewport();


export const routes: Routes = [


{
  path: 'dashboard',
  canMatch: [mobileDashboardMatch],
  component: DashboardMobileComponent
},

  /* ================= PUBLIC ================= */
  {
    path: '',
    component: PublicLayout,
    children: [
      { path: '', component: Authlanding },
      { path: 'download-app', component: DownloadAppLanding },
    ]
  },

  /* ================= AUTH ================= */
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'signup', component: SignupComponent },
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

      /* 👇 مثال صفحات تانية للـ Sidebar */
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

  /* ================= FALLBACK ================= */
  { path: '**', redirectTo: '' },


];
