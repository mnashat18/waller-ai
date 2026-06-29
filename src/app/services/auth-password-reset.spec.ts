import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from 'src/environments/environment';

import { AuthService } from './auth';

describe('AuthService password reset contracts', () => {
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
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('uses the trusted password-reset request contract', () => {
    service.requestPasswordReset('owner@example.com').subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/auth/password/request`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      email: 'owner@example.com',
      reset_url: environment.PASSWORD_RESET_URL
    });

    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('uses the Directus password-reset completion contract', () => {
    service.resetPassword('reset-token', 'ValidPass123').subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/auth/password/reset`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      token: 'reset-token',
      password: 'ValidPass123'
    });

    request.flush(null, { status: 204, statusText: 'No Content' });
  });
});
