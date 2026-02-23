import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, take, timeout } from 'rxjs';
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

  // Fallback refresh origin when callback opens without a stored token.
  private readonly DIRECTUS_URL = 'https://dash.conntinuity.com';

  constructor(
    private router: Router,
    private auth: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.auth.captureAuthFromUrl();

    const storedToken = this.auth.getStoredAccessToken?.() ?? null;
    const start$ = storedToken
      ? of(storedToken)
      : this.refreshAccessTokenFromCookie();

    start$
      .pipe(
        timeout(15000),
        switchMap((token) => {
          if (!token) return of(null);

          if (this.auth.storeAccessToken) {
            this.auth.storeAccessToken(token);
          }

          // Important: hydrate user/org/role/email caches from current token owner.
          return this.auth.getCurrentUser(token).pipe(
            catchError(() => of(null))
          );
        }),
        timeout(15000),
        take(1)
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
          this.fail(err?.message || 'Authentication failed. Please try again.');
        }
      });
  }

  private refreshAccessTokenFromCookie() {
    return this.http
      .post<any>(`${this.DIRECTUS_URL}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        map((res) => res?.data?.access_token ?? res?.access_token ?? null),
        catchError(() => of(null))
      );
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
