import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { InviteService } from '../services/invites';
import { PostAuthWelcomeService } from '../services/post-auth-welcome.service';
import { PostLoginRoutingService } from '../services/post-login-routing.service';
import { AuthService } from '../services/auth';
import { CompanyContextService } from '../core/context/company-context.service';
import { AuthCallbackComponent } from './auth-callback';

describe('AuthCallbackComponent', () => {
  let fixture: ComponentFixture<AuthCallbackComponent>;
  let routerSpy: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let authSpy: any;
  let inviteSpy: any;
  let postLoginRoutingSpy: any;
  let companyContextSpy: any;
  let welcomeSpy: any;

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
    companyContextSpy = {
      snapshot: vi.fn(() => ({
        context: {
          currentUser: {
            id: 'user-1',
            email: 'owner@example.com',
            first_name: 'Avery',
            last_name: 'Owner'
          },
          userId: 'user-1',
          userDisplayName: 'Avery Owner',
          userEmail: 'owner@example.com',
          isAuthenticated: true,
          authInitialized: true,
          workspaceInitialized: true,
          activeBusinessProfileId: 'profile-1',
          activeBusinessProfileName: 'Wellar',
          activeDepartmentId: null,
          activeDepartmentName: null,
          activeMemberRole: 'owner',
          availableCompanies: [],
          hubReason: null
        }
      }))
    };
    welcomeSpy = {
      queueReturningWelcome: vi.fn(),
      queueWorkspaceWelcome: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AuthCallbackComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: InviteService, useValue: inviteSpy },
        { provide: PostLoginRoutingService, useValue: postLoginRoutingSpy },
        { provide: CompanyContextService, useValue: companyContextSpy },
        { provide: PostAuthWelcomeService, useValue: welcomeSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuthCallbackComponent);
  });

  afterEach(() => {
    fixture?.destroy();
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

  it('queues a returning-user welcome after a restored callback session resolves to the dashboard', async () => {
    authSpy.captureAuthFromUrl.mockReturnValue({
      stored: true,
      accessToken: 'header.payload.signature',
      hasCode: false
    });
    authSpy.getCurrentUser.mockReturnValue(of({ id: 'user-1' }));
    postLoginRoutingSpy.resolveDestination.mockResolvedValue('/app/dashboard');

    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(welcomeSpy.queueReturningWelcome).toHaveBeenCalledTimes(1);
    expect(welcomeSpy.queueReturningWelcome).toHaveBeenCalledWith('Avery');
    expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();
  });
});
