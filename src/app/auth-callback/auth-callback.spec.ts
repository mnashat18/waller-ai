import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { InviteService } from '../services/invites';
import { PostLoginRoutingService } from '../services/post-login-routing.service';
import { AuthService } from '../services/auth';
import { AuthCallbackComponent } from './auth-callback';

describe('AuthCallbackComponent', () => {
  let fixture: ComponentFixture<AuthCallbackComponent>;
  let routerSpy: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let authSpy: any;
  let inviteSpy: any;
  let postLoginRoutingSpy: any;

  beforeEach(async () => {
    routerSpy = {
      navigate: vi.fn(() => Promise.resolve(true)),
      navigateByUrl: vi.fn(() => Promise.resolve(true))
    };
    authSpy = {
      captureAuthFromUrl: vi.fn(() => ({ stored: false, hasCode: false })),
      getStoredAccessToken: vi.fn(() => null),
      refreshFromCookie: vi.fn(() => of(null)),
      storeAccessToken: vi.fn(),
      getCurrentUser: vi.fn(() => of(null)),
      clearAuthRecoveryState: vi.fn(),
      setAuthNotice: vi.fn(),
      getSafeAuthCallbackFailureNotice: vi.fn(() => 'We couldn’t complete sign-in. Please try again.')
    };
    inviteSpy = {
      getPendingInviteToken: vi.fn(() => null)
    };
    postLoginRoutingSpy = {
      resolveDestination: vi.fn(() => Promise.resolve('/app/dashboard'))
    };

    await TestBed.configureTestingModule({
      imports: [AuthCallbackComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: InviteService, useValue: inviteSpy },
        { provide: PostLoginRoutingService, useValue: postLoginRoutingSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuthCallbackComponent);
  });

  it('redirects INVALID_PROVIDER callbacks to login with the exact safe notice', async () => {
    authSpy.captureAuthFromUrl.mockReturnValue({
      stored: false,
      reason: 'INVALID_PROVIDER',
      hasCode: false
    });
    authSpy.getSafeAuthCallbackFailureNotice.mockReturnValue(
      'We couldn’t complete Google sign-in. Try signing in with your password, reset your password, or use a different Google account.'
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.clearAuthRecoveryState).toHaveBeenCalledTimes(1);
    expect(authSpy.setAuthNotice).toHaveBeenCalledWith(
      'We couldn’t complete Google sign-in. Try signing in with your password, reset your password, or use a different Google account.'
    );
    expect(authSpy.refreshFromCookie).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/?auth=login', { replaceUrl: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('Directus');
  });

  it('clears stale callback state and stops after one failed refresh cycle', async () => {
    authSpy.captureAuthFromUrl.mockReturnValue({
      stored: false,
      hasCode: true
    });
    authSpy.refreshFromCookie.mockReturnValue(of(null));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.refreshFromCookie).toHaveBeenCalledTimes(1);
    expect(authSpy.clearAuthRecoveryState).toHaveBeenCalledTimes(1);
    expect(authSpy.setAuthNotice).toHaveBeenCalledWith('We couldn’t complete sign-in. Please try again.');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/?auth=login', { replaceUrl: true });
  });

  it('keeps the successful callback path unchanged for a restored Google session', async () => {
    authSpy.captureAuthFromUrl.mockReturnValue({
      stored: true,
      accessToken: 'header.payload.signature',
      hasCode: false
    });
    authSpy.getCurrentUser.mockReturnValue(of({ id: 'user-1' }));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.storeAccessToken).toHaveBeenCalledWith('header.payload.signature');
    expect(postLoginRoutingSpy.resolveDestination).toHaveBeenCalledTimes(1);
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect(authSpy.clearAuthRecoveryState).not.toHaveBeenCalled();
  });
});
