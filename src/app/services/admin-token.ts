import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, of } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';

type AdminTokenResponse = {
  access_token?: string;
  expires?: number;
};

@Injectable({ providedIn: 'root' })
export class AdminTokenService {
  private cachedToken: string | null = null;
  private cachedExp = 0;
  private blockedUntilTs = 0;
  private readonly errorCooldownMs = 2 * 60 * 1000;
  private inflight?: Observable<string | null>;

  constructor(private http: HttpClient) {}

  getToken(): Observable<string | null> {
    const endpoint = environment.ADMIN_TOKEN_ENDPOINT;
    if (!endpoint) {
      return of(null);
    }

    if (Date.now() < this.blockedUntilTs) {
      return of(null);
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedExp > now + 30) {
      return of(this.cachedToken);
    }

    if (this.inflight) {
      return this.inflight;
    }

    let headers: HttpHeaders | undefined;
    if (environment.ADMIN_TOKEN_SECRET) {
      headers = new HttpHeaders({
        'X-Admin-Secret': environment.ADMIN_TOKEN_SECRET
      });
    }

    this.inflight = this.http.get<AdminTokenResponse>(endpoint, headers ? { headers } : {}).pipe(
      map(res => res?.access_token ?? null),
      tap(token => {
        this.cachedToken = token;
        this.cachedExp = this.getTokenExp(token);
        if (token) {
          this.blockedUntilTs = 0;
          this.clearLastError();
        } else {
          this.blockedUntilTs = Date.now() + this.errorCooldownMs;
          this.saveLastError('Admin token endpoint returned an empty token.');
        }
      }),
      catchError((err) => {
        this.blockedUntilTs = Date.now() + this.errorCooldownMs;
        this.saveLastError(this.readError(err));
        return of(null);
      }),
      finalize(() => {
        this.inflight = undefined;
      })
    );

    return this.inflight;
  }

  private getTokenExp(token: string | null): number {
    if (!token) {
      return 0;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return 0;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      return typeof exp === 'number' ? exp : 0;
    } catch {
      return 0;
    }
  }

  private readError(err: any): string {
    return (
      err?.error?.error ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.message ||
      'Failed to fetch admin token.'
    );
  }

  private saveLastError(message: string) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem('admin_token_error', message);
    } catch {
      // ignore storage errors
    }
  }

  private clearLastError() {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem('admin_token_error');
  }
}
