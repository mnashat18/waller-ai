import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { timeout, switchMap, of } from 'rxjs';
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
    this.auth.captureAuthFromUrl();

    this.auth.refreshFromCookie()
      .pipe(
        timeout(15000),
        switchMap((accessToken) => {
          const token = accessToken ?? this.auth.getStoredAccessToken();
          if (!token) {
            return of(null);
          }
          return this.auth.getCurrentUser(token);
        }),
        timeout(15000)
      )
      .subscribe({
        next: (user) => {
          if (user) {
            this.router.navigate(['/dashboard']);
            return;
          }

          const backendError = localStorage.getItem('auth_error');
          this.fail(backendError || 'Unable to verify login session.');
        },
        error: (err) => {
          this.fail(
            err?.message ||
            'Authentication failed. Please try again.'
          );
        }
      });
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
