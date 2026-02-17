import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { timeout } from 'rxjs';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="auth-callback">
      <p *ngIf="status === 'loading'">Logging you in...</p>
      <p *ngIf="status === 'error'">{{ message }}</p>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {
  status: 'loading' | 'error' = 'loading';
  message = '';

  constructor(
    private router: Router,
    private auth: AuthService
  ) {}

 ngOnInit(): void {
  const result = this.auth.captureAuthFromUrl();

  const hasStoredToken = Boolean(
    localStorage.getItem('token') ?? localStorage.getItem('access_token')
  );

  // 1) If token already exists => finish
  if (result.stored || hasStoredToken) {
    this.finishLogin();
    return;
  }

  // 2) If Directus returned error
  if (result.reason || result.errorDescription) {
    const detail = result.errorDescription || result.reason || 'Google login failed.';
    this.setAuthError(detail);
    return;
  }

  // 3) If we received a code => exchange it with Directus
  if (result.code) {
    this.auth.exchangeGoogleCode(result.code).pipe(
      timeout(15000)
    ).subscribe({
      next: (ok) => {
        if (ok) {
          this.finishLogin();
          return;
        }
        const detail =
          localStorage.getItem('auth_error') ||
          'Google login failed: Code exchange did not return access token.';
        this.setAuthError(detail);
      },
      error: (err) => {
        const detail =
          localStorage.getItem('auth_error') ||
          err?.message ||
          'Google login failed: Unable to exchange code.';
        this.setAuthError(detail);
      }
    });

    return;
  }

  // 4) fallback: try refresh (old logic)
  this.auth.refreshSession().pipe(
    timeout(12000)
  ).subscribe({
    next: (ok) => {
      if (ok) {
        this.finishLogin();
        return;
      }

      const detail =
        localStorage.getItem('auth_error') ||
        'Unable to complete login session.';
      this.setAuthError(detail);
    },
    error: () => {
      const detail =
        localStorage.getItem('auth_error') ||
        'Unable to complete login session.';
      this.setAuthError(detail);
    }
  });
}


  private finishLogin() {
    this.auth.ensureTrialAccess().subscribe({
      next: () => {
        sessionStorage.removeItem('auth_callback_pending');
        sessionStorage.removeItem('auth_refresh_attempted');
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  private setAuthError(detail: string) {
    this.status = 'error';
    this.message = `Login failed: ${detail}`;

    sessionStorage.removeItem('auth_callback_pending');
    sessionStorage.removeItem('auth_refresh_attempted');

    try {
      localStorage.setItem('auth_error', detail);
    } catch {
      // ignore storage errors
    }
  }
}
