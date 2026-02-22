import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly apiOrigin = this.resolveOrigin(environment.API_URL);

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {

    let token = this.getStoredAccessToken();
    const isAuthRequest = req.url.includes('/auth/login') || req.url.includes('/users/register');
    const hasAuthHeader = req.headers.has('Authorization');
    const isAdminTokenRequest = req.headers.has('X-Admin-Token-Request') || req.url.includes('/admin-token');
    const shouldAttachAuth =
      !isAuthRequest &&
      !hasAuthHeader &&
      !isAdminTokenRequest &&
      this.isApiRequest(req.url);

    if (isAdminTokenRequest) {
      return next.handle(req);
    }

    if (token && this.isTokenExpired(token)) {
      this.clearStoredAuthState();
      token = null;
    }

    if (token) {
      this.syncAccessTokenAliases(token);
    }

    let authReq = req;
    let attachedAuth = false;

    if (token && shouldAttachAuth) {
      authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      attachedAuth = true;
    }

    return next.handle(authReq).pipe(
      catchError((err) => {
        const code = err?.error?.errors?.[0]?.extensions?.code;
        if (attachedAuth && code === 'TOKEN_EXPIRED') {
          this.clearStoredAuthState();
          return next.handle(req);
        }

        return throwError(() => err);
      })
    );
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') {
        return false;
      }
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private getStoredAccessToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const token =
      localStorage.getItem('token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_token');

    return typeof token === 'string' && token.trim() ? token : null;
  }

  private syncAccessTokenAliases(token: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      if (localStorage.getItem('token') !== token) {
        localStorage.setItem('token', token);
      }
      if (localStorage.getItem('access_token') !== token) {
        localStorage.setItem('access_token', token);
      }
      if (localStorage.getItem('directus_token') !== token) {
        localStorage.setItem('directus_token', token);
      }
    } catch {
      // ignore storage errors
    }
  }

  private clearStoredAuthState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('directus_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('directus_refresh_token');
  }

  private isApiRequest(url: string): boolean {
    if (!this.apiOrigin) {
      return false;
    }

    try {
      const base = typeof window !== 'undefined' ? window.location.origin : this.apiOrigin;
      const requestUrl = new URL(url, base);
      return requestUrl.origin === this.apiOrigin;
    } catch {
      return false;
    }
  }

  private resolveOrigin(url: string): string | null {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }
}
