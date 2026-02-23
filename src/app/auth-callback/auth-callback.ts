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

  // عدّلها لو عندك env
  private readonly DIRECTUS_URL = 'https://dash.conntinuity.com';

  constructor(
    private router: Router,
    private auth: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // بيقرأ أي error من الـ URL لو موجود
    this.auth.captureAuthFromUrl();

    // 1) جرّب Session بالكوكيز (ده الصح في mode=cookie)
    this.getMeWithCookie()
      .pipe(
        timeout(15000),

        // 2) لو فشل، جرّب fallback بتاع التوكن (لو عندك mode=json أو تخزين سابق)
        switchMap((user) => {
          if (user) return of(user);
          return this.tryTokenFallback();
        }),

        timeout(15000),
        take(1)
      )
      .subscribe({
        next: (user) => {
          if (user) {
            // نجاح
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
   * Verify login using Directus cookie session (mode=cookie)
   */
  private getMeWithCookie() {
    return this.http.get<any>(`${this.DIRECTUS_URL}/users/me`, {
      withCredentials: true
    }).pipe(
      map((res) => res?.data ?? res ?? null),
      catchError(() => of(null))
    );
  }

  /**
   * Fallback لو عندك access token في localStorage أو refreshFromCookie بيرجّع access token
   */
  private tryTokenFallback() {
    return this.auth.refreshFromCookie().pipe(
      catchError(() => of(null)),
      switchMap((accessToken) => {
        const token = accessToken ?? this.auth.getStoredAccessToken();
        if (!token) return of(null);
        return this.auth.getCurrentUser(token).pipe(
          catchError(() => of(null))
        );
      })
    );
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
