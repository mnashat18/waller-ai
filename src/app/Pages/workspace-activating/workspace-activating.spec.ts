import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import {
  WorkspaceActivationService,
  type PendingWorkspaceActivation
} from '../../services/workspace-activation.service';
import { WorkspaceActivatingPageComponent } from './workspace-activating';

describe('WorkspaceActivatingPageComponent', () => {
  let fixture: ComponentFixture<WorkspaceActivatingPageComponent>;
  let routerSpy: any;
  let authSpy: any;
  let companyContextSpy: any;
  let postLoginRoutingSpy: any;
  let workspaceActivationSpy: any;

  const pendingActivation: PendingWorkspaceActivation = {
    businessProfileId: 'profile-1',
    companyName: 'Northwind Logistics',
    startedAt: Date.now()
  };

  beforeEach(async () => {
    routerSpy = {
      navigateByUrl: vi.fn(() => Promise.resolve(true))
    };
    authSpy = {
      refreshAuthTokenWithStoredRefreshToken: vi.fn(() => Promise.resolve('jwt-token')),
      getCurrentUserWithFields: vi.fn(() =>
        of({
          id: 'user-1',
          role: { id: 'role-1', name: 'Owner' },
          active_business_profile: 'profile-1',
          active_member_role: 'owner'
        })
      ),
      getStoredAccessToken: vi.fn(() => 'jwt-token'),
      clearAuthState: vi.fn(),
      setAuthNotice: vi.fn()
    };
    companyContextSpy = {
      snapshot: vi.fn(() => ({
        context: {
          isAuthenticated: true,
          authInitialized: true,
          workspaceInitialized: true,
          activeBusinessProfileId: 'profile-1',
          activeMemberRole: 'owner'
        }
      }))
    };
    postLoginRoutingSpy = {
      refreshAuthAndWorkspaceContext: vi.fn(() => Promise.resolve([])),
      resolveDestinationStrict: vi.fn(() => Promise.resolve('/app/dashboard'))
    };
    workspaceActivationSpy = {
      readActivation: vi.fn(() => pendingActivation),
      clearActivation: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [WorkspaceActivatingPageComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: CompanyContextService, useValue: companyContextSpy },
        { provide: PostLoginRoutingService, useValue: postLoginRoutingSpy },
        { provide: WorkspaceActivationService, useValue: workspaceActivationSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceActivatingPageComponent);
  });

  async function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const startedAt = Date.now();
    while (!predicate()) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Timed out waiting for workspace activation flow to settle.');
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('refreshes the session and replaces history to the dashboard after owner activation succeeds', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(authSpy.refreshAuthTokenWithStoredRefreshToken).toHaveBeenCalledTimes(1);
    expect(authSpy.getCurrentUserWithFields).toHaveBeenCalled();
    expect(postLoginRoutingSpy.refreshAuthAndWorkspaceContext).toHaveBeenCalledWith({ force: true, failOnError: true });
    expect(workspaceActivationSpy.clearActivation).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
  });

  it('logs out and redirects to login with a one-time notice after bounded refresh failure', async () => {
    authSpy.refreshAuthTokenWithStoredRefreshToken = vi.fn(() => Promise.resolve(null));

    fixture.detectChanges();
    await fixture.whenStable();
    await waitForCondition(() => authSpy.clearAuthState.mock.calls.length > 0);

    expect(authSpy.refreshAuthTokenWithStoredRefreshToken).toHaveBeenCalledTimes(3);
    expect(authSpy.clearAuthState).toHaveBeenCalled();
    expect(authSpy.setAuthNotice).toHaveBeenCalledWith(
      'Your workspace was created successfully. Please sign in once to activate your Owner access.'
    );
    expect(workspaceActivationSpy.clearActivation).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/?auth=login', { replaceUrl: true });
  });

  it('redirects without retrying creation when the activation page is revisited without pending state', async () => {
    workspaceActivationSpy.readActivation = vi.fn(() => null);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(postLoginRoutingSpy.resolveDestinationStrict).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect(authSpy.refreshAuthTokenWithStoredRefreshToken).not.toHaveBeenCalled();
  });
});
