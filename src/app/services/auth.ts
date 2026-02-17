import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { SubscriptionService } from './subscription.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private subscriptions: SubscriptionService
  ) {}

  /**
   * Session Mode:
   * We DO NOT parse tokens from URL.
   * We only clean any leftover query/hash params (code/state/error) for nicer UX.
   */
  captureAuthFromUrl() {
    if (typeof window === 'undefined') {
      return { stored: false };
    }

    const url = new URL(window.location.href);

    const hasAuthNoise =
      url.searchParams.has('code') ||
      url.searchParams.has('state') ||
      url.searchParams.has('error') ||
      url.searchParams.has('error_description') ||
      Boolean(url.hash);

    // Clean URL (remove oauth noise)
    if (hasAuthNoise) {
      const cleaned = new URL(window.location.href);
      const dropKeys = ['code', 'state', 'error', 'error_description', 'reason'];
      dropKeys.forEach((k) => cleaned.searchParams.delete(k));
      if (cleaned.hash) cleaned.hash = '';

      const next =
        cleaned.pathname +
        (cleaned.searchParams.toString()
          ? `?${cleaned.searchParams.toString()}`
          : '');

      window.history.replaceState({}, document.title, next);
    }

    // In session mode we don't "store" a token
    return { stored: false };
  }

  /**
   * Session Mode login (email/password)
   * Must use withCredentials so Directus can set cookie / session correctly.
   */
  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      { email, password },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/json'
        }),
        withCredentials: true
      }
    ).pipe(
      tap(() => {
        localStorage.setItem('user_email', email);
        localStorage.removeItem('auth_error');

        try {
          sessionStorage.removeItem('auth_callback_pending');
          sessionStorage.removeItem('auth_refresh_attempted');
          sessionStorage.removeItem('auth_callback_raw_url');
        } catch {
          // ignore
        }
      }),
      switchMap((res) =>
        this.ensureTrialAccess().pipe(
          map(() => res),
          catchError(() => of(res))
        )
      )
    );
  }

  signup(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) {
    // Register doesn't need credentials, but keeping consistent is fine.
    return this.http.post(
      `${this.api}/users/register`,
      {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name
      },
      { withCredentials: true }
    );
  }

  /**
   * Session-based logged-in check:
   * Best-effort sync check (cookie presence can't be read due to HttpOnly),
   * so we rely on sessionStorage flag (set when /users/me succeeds),
   * and/or you can always call getCurrentUser() for truth.
   */
  isLoggedIn(): boolean {
    return sessionStorage.getItem('is_logged_in') === '1';
  }

  /**
   * Get current user from Directus using cookies.
   * This is the KEY function for Session Mode.
   */
  getCurrentUser(): Observable<any | null> {
    return this.http.get<any>(`${this.api}/users/me`, { withCredentials: true }).pipe(
      tap(() => {
        sessionStorage.setItem('is_logged_in', '1');
        localStorage.removeItem('auth_error');
      }),
      catchError((err) => {
        sessionStorage.removeItem('is_logged_in');
        const detail = this.getAuthErrorDetail(err);
        try {
          localStorage.setItem('auth_error', detail);
        } catch {}
        return of(null);
      })
    );
  }

  /**
   * Google login via Directus (session/cookie based)
   * Directus will set directus_refresh_token cookie and redirect back.
   */
  loginWithGoogle() {
    if (typeof window === 'undefined') return;

    const redirect = `${window.location.origin}/auth-callback`;
    // Use this.api to avoid hardcoding dash.conntinuity.com
    window.location.href =
      `${this.api}/auth/login/google?redirect=${encodeURIComponent(redirect)}`;
  }

  /**
   * Logout:
   * Prefer calling Directus /auth/logout so it clears server-side session.
   * Then clear local flags.
   */
  logout() {
    this.http.post(
      `${this.api}/auth/logout`,
      {},
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    ).pipe(
      catchError(() => of(true))
    ).subscribe(() => {
      this.clearClientAuthState();
    });
  }

  private clearClientAuthState() {
    // Don't nuke all localStorage blindly (might contain app prefs).
    localStorage.removeItem('auth_error');
    localStorage.removeItem('user_email');

    sessionStorage.removeItem('is_logged_in');
    try {
      sessionStorage.removeItem('auth_refresh_attempted');
      sessionStorage.removeItem('auth_callback_pending');
      sessionStorage.removeItem('auth_callback_raw_url');
    } catch {
      // ignore
    }
  }

  /**
   * Kept for compatibility with old callers.
   * In Session Mode, there's no token to ensure/refresh here.
   * If you still call it somewhere, it will validate session by calling /users/me.
   */
  ensureSessionToken() {
    return this.getCurrentUser().pipe(map((u) => Boolean(u)));
  }

  /**
   * Kept for compatibility with old callers.
   * In Session Mode, refresh is handled by cookie + Directus internally.
   * We just re-check /users/me.
   */
  refreshSession() {
    return this.getCurrentUser().pipe(map((u) => Boolean(u)));
  }

  private getAuthErrorDetail(err: any): string {
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.message ||
      'Unable to complete login session.'
    );
  }

  ensureTrialAccess() {
    const maybeEnsureTrial = (this.subscriptions as any)?.ensureBusinessTrial;
    if (typeof maybeEnsureTrial !== 'function') {
      return of(true);
    }
    return maybeEnsureTrial.call(this.subscriptions).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
