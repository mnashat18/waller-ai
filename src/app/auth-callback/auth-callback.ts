import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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

  // عدّلها لو عندك env
  private readonly DIRECTUS_URL = 'https://dash.conntinuity.com';

  constructor(
    private router: Router,
    private auth: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // يمسك أي بيانات/أخطاء جاية في الـ URL (لو عندك mode=json أو auth_error)
    this.auth.captureAuthFromUrl();

    // 1) لو عندك access_token مخزن (mode=json أو قديم) جرّبه الأول
    const storedToken = this.auth.getStoredAccessToken?.() ?? null;

    const start$ = storedToken
      ? of(storedToken)
      : this.refreshAccessTokenFromCookie(); // 2) وإلا هات access_token من refresh cookie

    start$
      .pipe(
        timeout(15000),
        switchMap((token) => {
          if (!token) return of(null);

          // خزّنه عندك لو AuthService فيها setter
          if (this.auth.storeAccessToken) this.auth.storeAccessToken(token);

          return this.getMeWithBearer(token);
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

  /**
   * يطلع access_token باستخدام directus_refresh_token cookie
   * (ده اللي عندك موجود في الطلب فعلاً)
   */
  private refreshAccessTokenFromCookie() {
    return this.http
      .post<any>(`${this.DIRECTUS_URL}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        map((res) => res?.data?.access_token ?? res?.access_token ?? null),
        catchError(() => of(null))
      );
  }

  /**
   * /users/me لازم Bearer token (مش refresh cookie)
   */
  private getMeWithBearer(token: string) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    return this.http
      .get<any>(`${this.DIRECTUS_URL}/users/me`, {
        headers,
        withCredentials: true
      })
      .pipe(
        map((res) => res?.data ?? res ?? null),
        catchError(() => of(null))
      );
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
