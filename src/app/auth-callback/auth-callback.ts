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

    const accessToken =
      localStorage.getItem('token') ??
      localStorage.getItem('access_token');

    // ✅ الحالة 1: Directus رجع access_token
    if (accessToken) {
      this.finishLogin();
      return;
    }

    // ❌ الحالة 2: Directus رجع code بدل token
    if (result.hasCode) {
      this.setAuthError(
        'Login returned authorization code instead of tokens. Make sure AUTH_GOOGLE_MODE=token and redeploy Directus.'
      );
      return;
    }

    // ❌ الحالة 3: Google رجع error
    if (result.reason || result.errorDescription) {
      const detail =
        result.errorDescription ||
        result.reason ||
        'Google login failed.';
      this.setAuthError(detail);
      return;
    }

    // ❌ مفيش توكن ومفيش كود
    this.setAuthError(
      'No access token received from Directus. Check Google provider configuration.'
    );
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
