import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('clears stale auth recovery state without removing pending invite recovery context', () => {
    localStorage.setItem('token', 'header.payload.signature');
    localStorage.setItem('access_token', 'header.payload.signature');
    localStorage.setItem('directus_token', 'header.payload.signature');
    localStorage.setItem('refresh_token', 'refresh-token');
    localStorage.setItem('auth_error', 'INVALID_PROVIDER');
    localStorage.setItem('user_email', 'owner@example.com');
    sessionStorage.setItem('is_logged_in', '1');
    sessionStorage.setItem('auth_callback_pending', '1');
    sessionStorage.setItem('auth_refresh_attempted', '1');
    sessionStorage.setItem('auth_callback_raw_url', 'https://example.com/auth-callback?reason=INVALID_PROVIDER');
    sessionStorage.setItem('auth_session_established_at', '1');
    sessionStorage.setItem('pending_invite_token', 'invite-token');
    sessionStorage.setItem('post_auth_redirect', '/invites/claim?token=invite-token');

    service.clearAuthRecoveryState();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('directus_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('auth_error')).toBeNull();
    expect(localStorage.getItem('user_email')).toBeNull();
    expect(sessionStorage.getItem('is_logged_in')).toBeNull();
    expect(sessionStorage.getItem('auth_callback_pending')).toBeNull();
    expect(sessionStorage.getItem('auth_refresh_attempted')).toBeNull();
    expect(sessionStorage.getItem('auth_callback_raw_url')).toBeNull();
    expect(sessionStorage.getItem('auth_session_established_at')).toBeNull();
    expect(sessionStorage.getItem('pending_invite_token')).toBe('invite-token');
    expect(sessionStorage.getItem('post_auth_redirect')).toBe('/invites/claim?token=invite-token');
  });

  it('maps provider callback failures to the exact safe Google notice', () => {
    expect(service.getSafeAuthCallbackFailureNotice('INVALID_PROVIDER')).toBe(
      'We couldn’t complete Google sign-in. Try signing in with your password, reset your password, or use a different Google account.'
    );
    expect(service.getSafeAuthCallbackFailureNotice('provider_error')).toBe(
      'We couldn’t complete sign-in. Please try again.'
    );
  });
  it('fails login when the current user cannot be resolved after auth/login succeeds', async () => {
    const loginPromise = firstValueFrom(service.login('owner@example.com', 'WrongPassword123'));

    const loginRequest = httpMock.expectOne((req) => req.url.endsWith('/auth/login'));
    expect(loginRequest.request.method).toBe('POST');
    loginRequest.flush({ data: { access_token: 'header.payload.signature' } });

    const meRequest = httpMock.expectOne((req) => req.url.endsWith('/users/me'));
    expect(meRequest.request.method).toBe('GET');
    meRequest.flush(
      { errors: [{ message: 'Invalid user credentials.' }] },
      { status: 401, statusText: 'Unauthorized' }
    );

    await expect(loginPromise).rejects.toMatchObject({ status: 401 });
  });

  it('times out login requests after the bounded auth timeout', async () => {
    let capturedError: any;
    let emitted = false;

    vi.useFakeTimers();
    try {
      service.login('owner@example.com', 'WrongPassword123').subscribe({
        next: () => {
          emitted = true;
        },
        error: (err) => {
          capturedError = err;
        }
      });

      httpMock.expectOne((req) => req.url.endsWith('/auth/login'));

      await vi.advanceTimersByTimeAsync(20001);

      expect(emitted).toBe(false);
      expect(capturedError?.name).toBe('TimeoutError');
    } finally {
      vi.useRealTimers();
    }
  });
});
