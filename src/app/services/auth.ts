import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  api = environment.API_URL;

  constructor(private http: HttpClient) {}

  captureAuthFromUrl() {
    if (typeof window === 'undefined') {
      return { stored: false };
    }

    const url = new URL(window.location.href);
    const hashParams = url.hash ? new URLSearchParams(url.hash.replace('#', '?')) : null;
    const searchParams = url.search ? new URLSearchParams(url.search) : null;

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
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }
    }

    if (hasCode) {
      sessionStorage.removeItem('auth_refresh_attempted');
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
        (cleaned.searchParams.toString() ? `?${cleaned.searchParams.toString()}` : '') +
        cleaned.hash;
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

  refreshSession() {
    return this.http.post<any>(
      `${this.api}/auth/refresh`,
      {},
      { withCredentials: true }
    ).pipe(
      tap((res) => {
        const accessToken = res?.data?.access_token;
        const refreshToken = res?.data?.refresh_token;
        if (accessToken) {
          localStorage.setItem('token', accessToken);
          localStorage.setItem('access_token', accessToken);
        }
        if (refreshToken) {
          localStorage.setItem('refresh_token', refreshToken);
        }
      }),
      map((res) => Boolean(res?.data?.access_token)),
      catchError(() => of(false))
    );
  }

  ensureSessionToken() {
    const existing = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (existing) {
      return of(true);
    }

    if (sessionStorage.getItem('auth_refresh_attempted')) {
      return of(false);
    }
    sessionStorage.setItem('auth_refresh_attempted', '1');
    return this.refreshSession();
  }

  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      {
        email,
        password
      },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/json'
        })
      }
    ).pipe(
      tap(res => {
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('access_token', res.data.access_token);
        localStorage.setItem('refresh_token', res.data.refresh_token);
        localStorage.setItem('user_email', email);
      })
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
    localStorage.clear();
    try {
      sessionStorage.removeItem('auth_refresh_attempted');
    } catch {
      // ignore storage errors
    }
  }

  loginWithGoogle() {
    if (typeof window === 'undefined') {
      return;
    }
    const redirect = encodeURIComponent(`${window.location.origin}/auth-callback`);
    window.location.href = `${this.api}/auth/login/google?redirect=${redirect}`;
  }
}
