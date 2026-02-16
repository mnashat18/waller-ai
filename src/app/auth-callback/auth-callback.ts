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

    if (result.stored || hasStoredToken) {
      this.router.navigate(['/dashboard']);
      return;
    }

    if (result.reason || result.errorDescription) {
      const detail = result.errorDescription || result.reason || 'Login failed.';
      this.setAuthError(detail);
      return;
    }

    this.auth.refreshSession().pipe(
      timeout(12000)
    ).subscribe({
      next: (ok) => {
        if (ok) {
          this.router.navigate(['/dashboard']);
          return;
        }
        this.setAuthError('Unable to complete login session.');
      },
      error: () => {
        this.setAuthError('Unable to complete login session.');
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
