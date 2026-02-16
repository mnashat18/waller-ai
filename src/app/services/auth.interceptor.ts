import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {

    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const isAuthRequest = req.url.includes('/auth/login') || req.url.includes('/users/register');
    const hasAuthHeader = req.headers.has('Authorization');
    const isAdminTokenRequest = req.headers.has('X-Admin-Token-Request') || req.url.includes('/admin-token');
    const isExpired = token ? this.isTokenExpired(token) : false;

    if (isAdminTokenRequest) {
      return next.handle(req);
    }

    if (token && !localStorage.getItem('token')) {
      localStorage.setItem('token', token);
    }

    if (isExpired) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('access_token');
    }

    let authReq = req;
    let attachedAuth = false;

    if (token && !isAuthRequest && !hasAuthHeader && !isExpired) {
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
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
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
}
