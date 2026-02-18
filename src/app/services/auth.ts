import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, firstValueFrom, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { SubscriptionService } from './subscription.service';

type AuthCaptureResult = {
  stored: boolean;
  accessToken?: string;
  refreshToken?: string;
  reason?: string;
  errorDescription?: string;
  hasCode: boolean;
};

type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private subscriptions: SubscriptionService
  ) {}

  captureAuthFromUrl(): AuthCaptureResult {
    if (typeof window === 'undefined') {
      return { stored: false, hasCode: false };
    }

    const current = new URL(window.location.href);
    let source = current;
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
          source = parsed;
        }
      } catch {
        // ignore invalid stored URL
      }
      sessionStorage.removeItem('auth_callback_raw_url');
    }

    const hashParams = source.hash ? new URLSearchParams(source.hash.replace('#', '?')) : null;
    const searchParams = source.search ? new URLSearchParams(source.search) : null;

    const hasCode = hashParams?.has('code') === true || searchParams?.has('code') === true;

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
      this.storeAccessToken(accessToken);
    }
    if (refreshToken) {
      this.storeRefreshToken(refreshToken);
    }

    if (hasCode && !reason && !errorDescription) {
      sessionStorage.setItem('auth_callback_pending', '1');
      sessionStorage.removeItem('auth_refresh_attempted');
    }

    if (accessToken || refreshToken) {
      sessionStorage.removeItem('auth_callback_pending');
      localStorage.removeItem('auth_error');
    }

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
      if (cleaned.hash) {
        cleaned.hash = '';
      }
      const next =
        cleaned.pathname +
        (cleaned.searchParams.toString() ? `?${cleaned.searchParams.toString()}` : '');
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

  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      {
        email,
        password,
        mode: 'json'
      },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    ).pipe(
      tap((res) => {
        this.storeTokensFromAuthResponse(res);
        localStorage.setItem('user_email', email);
      }),
      switchMap((res) =>
        this.getCurrentUser(this.getStoredAccessToken() ?? undefined).pipe(
          map(() => res)
        )
      ),
      switchMap((res) =>
        this.ensureTrialAccess().pipe(
          map(() => res),
          catchError(() => of(res))
        )
      ),
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  signup(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) {
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

  requestPhoneOtp(phone: string) {
    // Placeholder endpoint for future OTP driver integration.
    return this.http.post(
      `${this.api}/auth/phone/request`,
      { phone },
      { withCredentials: true }
    ).pipe(
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  verifyPhoneOtp(phone: string, otp: string) {
    // Placeholder endpoint; when backend returns auth tokens, they are stored
    // with the same shared logic as email/password and Google.
    return this.http.post<any>(
      `${this.api}/auth/phone/verify`,
      {
        phone,
        otp,
        mode: 'json'
      },
      { withCredentials: true }
    ).pipe(
      tap((res) => this.storeTokensFromAuthResponse(res)),
      switchMap((res) =>
        this.getCurrentUser(this.getStoredAccessToken() ?? undefined).pipe(
          map(() => res)
        )
      ),
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  loginWithGoogle() {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams({
      redirect: `${window.location.origin}/auth-callback`,
      mode: 'cookie'
    });
    window.location.href = `${this.api}/auth/login/google?${params.toString()}`;
  }

  refreshFromCookie(): Observable<string | null> {
    return from(this.refreshFromCookieInternal());
  }

  refreshSession() {
    return this.refreshUserFromCookie().pipe(
      map((user) => Boolean(user))
    );
  }

  ensureSessionToken() {
    const existing = this.getStoredAccessToken();
    if (existing) {
      return this.getCurrentUser(existing).pipe(
        switchMap((user) => {
          if (user) {
            return of(true);
          }
          if (sessionStorage.getItem('auth_refresh_attempted')) {
            return of(false);
          }
          sessionStorage.setItem('auth_refresh_attempted', '1');
          return this.refreshUserFromCookie().pipe(map((refreshedUser) => Boolean(refreshedUser)));
        })
      );
    }

    if (sessionStorage.getItem('auth_refresh_attempted')) {
      return of(false);
    }
    sessionStorage.setItem('auth_refresh_attempted', '1');

    return this.refreshUserFromCookie().pipe(
      map((user) => Boolean(user))
    );
  }

  getCurrentUser(accessToken?: string): Observable<any | null> {
    return this.http.get<any>(
      `${this.api}/users/me`,
      {
        headers: this.getAuthHeaders(accessToken),
        withCredentials: true
      }
    ).pipe(
      map((res) => res?.data ?? null),
      tap((user) => {
        if (user) {
          sessionStorage.setItem('is_logged_in', '1');
          localStorage.removeItem('auth_error');
          if (typeof user?.email === 'string' && user.email) {
            localStorage.setItem('user_email', user.email);
          }
        }
      }),
      catchError((err) => {
        sessionStorage.removeItem('is_logged_in');
        this.storeAuthError(err);
        return of(null);
      })
    );
  }

  getStoredAccessToken(): string | null {
    return localStorage.getItem('token') ?? localStorage.getItem('access_token');
  }

  storeAccessToken(token: string) {
    localStorage.setItem('token', token);
    localStorage.setItem('access_token', token);
    sessionStorage.setItem('is_logged_in', '1');
    localStorage.removeItem('auth_error');
  }

  storeRefreshToken(token: string) {
    localStorage.setItem('refresh_token', token);
  }

  clearAuthState() {
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_error');
    localStorage.removeItem('user_email');

    sessionStorage.removeItem('is_logged_in');
    sessionStorage.removeItem('auth_callback_pending');
    sessionStorage.removeItem('auth_refresh_attempted');
    sessionStorage.removeItem('auth_callback_raw_url');
  }

  getAuthHeaders(accessToken?: string): HttpHeaders {
    const token = accessToken ?? this.getStoredAccessToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  isLoggedIn(): boolean {
    return Boolean(this.getStoredAccessToken()) || sessionStorage.getItem('is_logged_in') === '1';
  }

  logout() {
    const refreshToken = localStorage.getItem('refresh_token');
    const body = refreshToken ? { refresh_token: refreshToken } : {};

    this.http.post(
      `${this.api}/auth/logout`,
      body,
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    ).pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      this.clearAuthState();
    });
  }

  ensureTrialAccess() {
    const maybeEnsureTrial = (
      this.subscriptions as { ensureBusinessTrial?: () => Observable<unknown> }
    ).ensureBusinessTrial;

    if (typeof maybeEnsureTrial !== 'function') {
      return of(true);
    }

    return maybeEnsureTrial.call(this.subscriptions).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  private refreshUserFromCookie(): Observable<any | null> {
    return this.refreshFromCookie().pipe(
      switchMap((token) => this.getCurrentUser(token ?? undefined))
    );
  }

  private async refreshFromCookieInternal(): Promise<string | null> {
    const storedRefreshToken = this.getStoredRefreshToken();
    const attempts: Array<Record<string, string>> = [];

    if (storedRefreshToken) {
      attempts.push({ mode: 'json', refresh_token: storedRefreshToken });
    }
    attempts.push({ mode: 'json' });
    attempts.push({});

    let lastErr: any = null;

    for (const payload of attempts) {
      try {
        const res = await firstValueFrom(
          this.http.post<any>(
            `${this.api}/auth/refresh`,
            payload,
            { withCredentials: true }
          )
        );
        const tokens = this.storeTokensFromAuthResponse(res);
        if (tokens.accessToken) {
          sessionStorage.removeItem('auth_callback_pending');
          sessionStorage.removeItem('auth_refresh_attempted');
          return tokens.accessToken;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    this.storeAuthError(lastErr);
    return null;
  }

  private getStoredRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  private storeTokensFromAuthResponse(res: any): StoredTokens {
    const container = res?.data ?? res ?? {};
    const accessToken =
      typeof container?.access_token === 'string'
        ? container.access_token
        : typeof container?.token === 'string'
          ? container.token
          : null;

    const refreshToken =
      typeof container?.refresh_token === 'string'
        ? container.refresh_token
        : null;

    if (accessToken) {
      this.storeAccessToken(accessToken);
    }
    if (refreshToken) {
      this.storeRefreshToken(refreshToken);
    }
    if (accessToken || refreshToken) {
      localStorage.removeItem('auth_error');
    }

    return { accessToken, refreshToken };
  }

  private storeAuthError(err: any) {
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.message ||
      'Unable to complete login session.';

    try {
      localStorage.setItem('auth_error', String(detail));
    } catch {
      // ignore storage errors
    }
  }
}
