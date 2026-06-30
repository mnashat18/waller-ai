import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { InviteService } from './invites';
import { PostAuthWelcomeService } from './post-auth-welcome.service';
import { PostLoginRoutingService } from './post-login-routing.service';

describe('PostLoginRoutingService invite welcome handoff', () => {
  let service: PostLoginRoutingService;
  let authSpy: any;
  let companyContextSpy: any;
  let inviteSpy: any;
  let welcomeSpy: any;

  beforeEach(async () => {
    authSpy = {
      getCurrentUserAfterRestore: vi.fn(() => Promise.resolve({
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner'
      })),
      getStoredAccessToken: vi.fn(() => 'header.payload.signature'),
      refreshAuthTokenWithStoredRefreshToken: vi.fn(() => Promise.resolve('header.payload.signature')),
      clearAuthState: vi.fn()
    };
    companyContextSpy = {
      refreshCurrentUser: vi.fn(() => Promise.resolve()),
      refreshWorkspaceContext: vi.fn(() => Promise.resolve()),
      refreshMemberships: vi.fn(() => Promise.resolve([])),
      activateClaimedMembershipForCurrentUser: vi.fn(() => Promise.resolve({
        id: 'member-1',
        status: 'active',
        member_role: 'owner',
        business_profile: { id: 'profile-1', company_name: 'Northwind Logistics' }
      })),
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
          activeBusinessProfileName: 'Northwind Logistics',
          activeDepartmentId: null,
          activeDepartmentName: null,
          activeMemberRole: 'owner',
          availableCompanies: [],
          hubReason: null
        }
      }))
    };
    inviteSpy = {
      getInviteTokenFromCurrentUrl: vi.fn(() => null),
      getPendingInviteToken: vi.fn(() => 'wlr-invite-token'),
      setPendingInviteToken: vi.fn(),
      debugFlow: vi.fn(),
      clearInviteClaimError: vi.fn(),
      markClaimAttemptedForToken: vi.fn(),
      markClaimInProgressForToken: vi.fn(),
      markClaimSucceededForToken: vi.fn(),
      markClaimCompleted: vi.fn(),
      clearPendingInviteToken: vi.fn(),
      clearClaimAttemptedForToken: vi.fn(),
      clearClaimInProgressForToken: vi.fn(),
      setInviteClaimError: vi.fn(),
      hasClaimSucceededForToken: vi.fn(() => false),
      hasClaimAttemptedForToken: vi.fn(() => false),
      isClaimInProgressForToken: vi.fn(() => false),
      claimInvite: vi.fn(() => of({
        businessProfileId: 'profile-1',
        memberRole: 'owner',
        departmentId: null
      })),
      extractInviteErrorDetail: vi.fn(() => null),
      getReadableInviteError: vi.fn(() => 'Could not accept invite.'),
      isAlreadyClaimedError: vi.fn(() => false)
    };
    welcomeSpy = {
      queueReturningWelcome: vi.fn(),
      queueWorkspaceWelcome: vi.fn(),
      queueInviteWelcome: vi.fn()
    };

    await TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: CompanyContextService, useValue: companyContextSpy },
        { provide: InviteService, useValue: inviteSpy },
        { provide: PostAuthWelcomeService, useValue: welcomeSpy }
      ]
    }).compileComponents();

    service = TestBed.inject(PostLoginRoutingService);
  });

  it('queues the invite welcome only after the claim succeeds', async () => {
    const route = await service.resolveDestination();

    expect(route).toBe('/app/dashboard');
    expect(welcomeSpy.queueInviteWelcome).toHaveBeenCalledTimes(1);
    expect(welcomeSpy.queueInviteWelcome).toHaveBeenCalledWith('Northwind Logistics');
  });

  it('does not queue the invite welcome when the claim fails', async () => {
    inviteSpy.claimInvite = vi.fn(() => throwError(() => new Error('invite rejected')));

    const route = await service.resolveDestination();

    expect(route).toContain('/invites/claim');
    expect(welcomeSpy.queueInviteWelcome).not.toHaveBeenCalled();
  });
});
