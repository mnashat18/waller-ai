import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { firstValueFrom, from, of } from 'rxjs';
import { SubscriptionService } from './subscription.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private subscriptions: SubscriptionService
  ) {}

  /**
   * Captures auth params from callback URL:
   * - Directus token mode returns: access_token, refresh_token (query or hash)
   * - Some flows might include: token, code, error, error_description
   */
  captureAuthFromUrl() {
    if (typeof window === 'undefined') {
      return { stored: false };
    }

    const url = new URL(window.location.href);

    // Some apps store a raw callback URL before navigation; keep this logic
    let sourceUrl = url;
    const rawCallbackUrl = sessionStorage.getItem('auth_callback_raw_url');
    if (rawCallbackUrl) {
      try {
        const parsed = new URL(rawCallbackUrl);
        const candidate = `${parsed.search}${parsed.hash}`;
        if (
          candidate.includes('access_token=') ||
          candidate.includes('refresh_token=') ||
          candidate.includes('code=') ||
          candidate.includes('error=')
        ) {
          sourceUrl = parsed;
        }
      } catch {
        // ignore invalid URL
      }
      sessionStorage.removeItem('auth_callback_raw_url');
    }

    const hashParams = sourceUrl.hash
      ? new URLSearchParams(sourceUrl.hash.replace('#', '?'))
      : null;
    const searchParams = sourceUrl.search
      ? new URLSearchParams(sourceUrl.search)
      : null;

    const hasCode =
      hashParams?.has('code') === true ||
      searchParams?.has('code') === true;

    const accessToken =
      hashParams?.get('access_token') ??
      hashParams?.get('token') ??
      searchParams?.get('access_token') ??
      searchParams?.get('token') ??
      undefined;

    const refreshToken =
      hashParams?.get('refresh_token') ??
      searchParams?.get('refresh_token') ??
      undefined;

    const reason =
      searchParams?.get('reason') ??
      hashParams?.get('reason') ??
      searchParams?.get('error') ??
      hashParams?.get('error') ??
      undefined;

    const errorDescription =
      searchParams?.get('error_description') ??
      hashParams?.get('error_description') ??
      undefined;

    if (accessToken) {
      localStorage.setItem('token', accessToken);
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (accessToken || refreshToken) {
      localStorage.removeItem('auth_error');
      sessionStorage.removeItem('auth_refresh_attempted');
      sessionStorage.removeItem('auth_callback_pending');
    }

    // If we got a code only, mark callback pending (optional)
    if (hasCode && !reason && !errorDescription && !accessToken && !refreshToken) {
      sessionStorage.setItem('auth_callback_pending', '1');
      sessionStorage.removeItem('auth_refresh_attempted');
    }

    // Clean URL to remove tokens/codes/errors from address bar
    if (accessToken || refreshToken || reason || errorDescription || hasCode) {
      const cleaned = new URL(window.location.href);
      const dropKeys = [
        'access_token',
        'token',
        'refresh_token',
        'expires',
        'expires_in',
        'code',
        'state',
        'reason',
        'error',
        'error_description'
      ];
      dropKeys.forEach((key) => cleaned.searchParams.delete(key));
      if (cleaned.hash) cleaned.hash = '';

      const next =
        cleaned.pathname +
        (cleaned.searchParams.toString()
          ? `?${cleaned.searchParams.toString()}`
          : '');

      window.history.replaceState({}, document.title, next);
    }

    return {
      stored: Boolean(accessToken),
      accessToken,
      refreshToken,
      reason,
      errorDescription,
      hasCode
    };
  }

  /**
   * Ensure we have a valid access token:
   * - If access token exists => true
   * - Else if refresh token exists => try refresh
   */
  ensureSessionToken() {
    const existing =
      localStorage.getItem('token') ??
      localStorage.getItem('access_token');

    if (existing) {
      return of(true);
    }

    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (!storedRefreshToken) {
      return of(false);
    }

    if (sessionStorage.getItem('auth_refresh_attempted')) {
      return of(false);
    }
    sessionStorage.setItem('auth_refresh_attempted', '1');

    return this.refreshSession();
  }

  refreshSession() {
    return from(this.refreshSessionInternal());
  }

  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      { email, password },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/json'
        })
      }
    ).pipe(
      tap((res) => {
        const access = res?.data?.access_token;
        const refresh = res?.data?.refresh_token;

        if (access) {
          localStorage.setItem('token', access);
          localStorage.setItem('access_token', access);
        }
        if (refresh) {
          localStorage.setItem('refresh_token', refresh);
        }

        localStorage.setItem('user_email', email);
        localStorage.removeItem('auth_error');
        sessionStorage.removeItem('auth_callback_pending');
        sessionStorage.removeItem('auth_refresh_attempted');
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
    return this.http.post(`${this.api}/users/register`, {
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name
    });
  }

  isLoggedIn(): boolean {
    return !!(localStorage.getItem('token') || localStorage.getItem('access_token'));
  }

  logout() {
    // Optional: call Directus logout if you want (requires refresh token)
    // We'll keep it simple: clear local tokens
    localStorage.clear();
    try {
      sessionStorage.removeItem('auth_refresh_attempted');
      sessionStorage.removeItem('auth_callback_pending');
      sessionStorage.removeItem('auth_callback_raw_url');
    } catch {
      // ignore storage errors
    }
  }

  /**
   * Google login via Directus.
   *
   * IMPORTANT:
   * Use mode=token so Directus returns access_token + refresh_token
   * to the redirect URL, avoiding cross-domain cookie/session issues.
   */
  loginWithGoogle() {
    if (typeof window === 'undefined') return;

    const redirect = `${window.location.origin}/auth-callback`;

    const params = new URLSearchParams({
      redirect,
      mode: 'token'
    });

    window.location.href = `${this.api}/auth/login/google?${params.toString()}`;
  }

  /**
   * Directus refresh: MUST send refresh_token in payload
   * POST /auth/refresh { refresh_token }
   */
  private async refreshSessionInternal(): Promise<boolean> {
    const storedRefreshToken = localStorage.getItem('refresh_token');

    if (!storedRefreshToken) {
      try {
        localStorage.setItem('auth_error', 'No refresh token found.');
      } catch {}
      return false;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<any>(
          `${this.api}/auth/refresh`,
          { refresh_token: storedRefreshToken },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json'
            })
          }
        )
      );

      const ok = this.storeTokensFromResponse(res);
      if (ok) {
        await firstValueFrom(this.ensureTrialAccess().pipe(catchError(() => of(true))));
        return true;
      }

      try {
        localStorage.setItem('auth_error', 'Refresh succeeded but no access token returned.');
      } catch {}
      return false;
    } catch (err) {
      const detail = this.getAuthErrorDetail(err);
      try {
        localStorage.setItem('auth_error', detail);
      } catch {}
      return false;
    } finally {
      // allow future attempts if needed
      sessionStorage.removeItem('auth_refresh_attempted');
    }
  }

  private storeTokensFromResponse(res: any): boolean {
    const accessToken = res?.data?.access_token;
    const refreshToken = res?.data?.refresh_token;

    if (accessToken) {
      localStorage.setItem('token', accessToken);
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }

    if (accessToken || refreshToken) {
      localStorage.removeItem('auth_error');
      sessionStorage.removeItem('auth_callback_pending');
      sessionStorage.removeItem('auth_refresh_attempted');
    }

    return Boolean(accessToken);
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
