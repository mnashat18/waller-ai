import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import {
  type WorkspaceAccessState,
  WorkspaceAccessService
} from '../../services/workspace-access.service';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { WorkspaceCreationService } from '../../services/workspace-creation.service';
import { WorkspaceActivationService } from '../../services/workspace-activation.service';
import { WorkspaceAccessPageComponent } from './workspace-access';

describe('WorkspaceAccessPageComponent', () => {
  let fixture: ComponentFixture<WorkspaceAccessPageComponent>;
  let routerSpy: any;
  let workspaceCreationSpy: any;
  let activateFromMembershipSpy: any;
  let refreshAuthAndWorkspaceContextSpy: any;
  let resolveDestinationStrictSpy: any;
  let startActivationSpy: any;
  let companyContextSnapshot: any;

  const noWorkspaceState: WorkspaceAccessState = {
    loading: false,
    error: null,
    user: {
      id: 'user-1',
      displayName: 'Owner User',
      email: 'owner@example.com'
    },
    mode: 'no-workspace',
    pendingApplication: null,
    workspaces: [],
    pendingInvites: [],
    selectedInvite: null,
    activeWorkspaces: [],
    employeeWorkspaces: [],
    inactiveWorkspaces: [],
    hasWorkspace: false,
    hasDashboardAccess: false
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    routerSpy = {
      navigateByUrl: vi.fn(() => Promise.resolve(true))
    };
    workspaceCreationSpy = {
      createWorkspace: vi.fn()
    };
    activateFromMembershipSpy = vi.fn(() => Promise.resolve());
    companyContextSnapshot = {
      context: {
        activeBusinessProfileId: null,
        activeBusinessProfileName: null,
        activeMemberRole: null,
        availableCompanies: []
      }
    };
    refreshAuthAndWorkspaceContextSpy = vi.fn(() => Promise.resolve());
    resolveDestinationStrictSpy = vi.fn(() => Promise.resolve('/app/dashboard'));
    startActivationSpy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [WorkspaceAccessPageComponent],
      providers: [
        {
          provide: Router,
          useValue: routerSpy
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'returnUrl' ? '/app/workforce' : null)
              }
            }
          }
        },
        {
          provide: AuthService,
          useValue: {
            ensureSessionToken: () => of(true),
            getCurrentUserAfterRestore: () =>
              Promise.resolve({
                id: 'user-1',
                email: 'owner@example.com',
                first_name: 'Owner',
                last_name: 'User'
              }),
            logout: () => undefined
          }
        },
        {
          provide: WorkspaceAccessService,
          useValue: {
            loadWorkspaceAccess: () => of(noWorkspaceState),
            openWorkspace: () => of({ ok: true, message: 'Workspace opened.' }),
            claimInviteByToken: () => of({ ok: false, message: 'n/a' }),
            declineInvite: () => of({ ok: false, message: 'n/a' }),
            getPendingInviteToken: () => null,
            setPendingInviteToken: () => undefined,
            clearPendingInviteToken: () => undefined,
            hasClaimAttemptedForToken: () => false,
            consumeInviteClaimError: () => null,
            clearInviteClaimError: () => undefined,
            getInviteTokenFromCurrentUrl: () => null
          }
        },
        {
          provide: CompanyContextService,
          useValue: {
            activateFromMembership: activateFromMembershipSpy,
            clearActiveWorkspaceContext: () => undefined,
            snapshot: () => companyContextSnapshot
          }
        },
        {
          provide: InviteService,
          useValue: {
            consumeInviteClaimError: () => null,
            getPendingInviteToken: () => null,
            hasClaimAttemptedForToken: () => false,
            clearPendingInviteToken: () => undefined,
            clearClaimAttemptedForToken: () => undefined,
            clearInviteClaimError: () => undefined,
            setPendingInviteToken: () => undefined
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: {
            refreshAuthAndWorkspaceContext: refreshAuthAndWorkspaceContextSpy,
            resolveDestinationStrict: resolveDestinationStrictSpy
          }
        },
        {
          provide: WorkspaceCreationService,
          useValue: workspaceCreationSpy
        },
        {
          provide: WorkspaceActivationService,
          useValue: {
            startActivation: startActivationSpy
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceAccessPageComponent);
  });

  function loadPage(): void {
    fixture.detectChanges();
  }

  async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const startedAt = Date.now();
    while (!predicate()) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Timed out waiting for asynchronous workspace creation side effects.');
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('renders one clear workspace setup flow for new users', async () => {
    loadPage();
    await fixture.whenStable();

    const cards = fixture.nativeElement.querySelectorAll('.workspace-access-card');
    expect(cards.length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Create Company Workspace');
    expect(fixture.nativeElement.textContent).toContain('Join with an invitation');
    expect(fixture.nativeElement.textContent).toContain('Request organization access');
  });

  it('routes a confirmed 201 with workspace.id through workspace activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: true,
        context: {
          workspaceId: 'profile-1',
          businessProfileId: 'profile-1',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';
    component.createCompanyForm.phone = '+1 555 010 1234';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaceCreationSpy.createWorkspace.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      })
    );
    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-1',
      companyName: 'Northwind Logistics'
    });
    expect(activateFromMembershipSpy).not.toHaveBeenCalled();
    expect(refreshAuthAndWorkspaceContextSpy).not.toHaveBeenCalled();
    expect(resolveDestinationStrictSpy).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanySuccessMessage).toBe('Workspace created. Activating your access...');
  });

  it('routes a confirmed 201 with membership.business_profile_id through workspace activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: true,
        context: {
          workspaceId: 'profile-2',
          businessProfileId: 'profile-2',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-2',
      companyName: 'Northwind Logistics'
    });
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
  });

  it('confirms a sparse 201 only after refreshed canonical context verifies owner activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: false,
        context: {
          workspaceId: null,
          businessProfileId: null,
          companyName: 'Northwind Logistics',
          isActive: null,
          planCode: null,
          billingStatus: null
        }
      })
    );

    refreshAuthAndWorkspaceContextSpy.mockImplementation(async () => {
      companyContextSnapshot.context = {
        activeBusinessProfileId: 'profile-3',
        activeBusinessProfileName: 'Northwind Logistics',
        activeMemberRole: 'owner',
        availableCompanies: [
          {
            id: 'profile-3',
            isActive: true
          }
        ]
      };
    });

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalled();
    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-3',
      companyName: 'Northwind Logistics'
    });
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanySuccessMessage).toBe('Workspace created. Activating your access...');
  });

  it('locks sparse 201 creation when canonical context still cannot confirm activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: false,
        context: {
          workspaceId: null,
          businessProfileId: null,
          companyName: 'Northwind Logistics',
          isActive: null,
          planCode: null,
          billingStatus: null
        }
      })
    );

    refreshAuthAndWorkspaceContextSpy.mockImplementation(async () => {
      companyContextSnapshot.context = {
        activeBusinessProfileId: null,
        activeBusinessProfileName: null,
        activeMemberRole: null,
        availableCompanies: []
      };
    });

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await fixture.whenStable();
    await waitForCondition(() => component.createCompanyLocked);

    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalledTimes(3);
    expect(startActivationSpy).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanySuccessMessage).toBe(
      'Your company was created, but access is still activating. Please refresh this page in a moment.'
    );

    component.createCompany();
    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);
  });

  it('keeps existing-workspace recovery on the direct post-create route flow', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 200,
        confirmed: true,
        context: {
          workspaceId: 'profile-1',
          businessProfileId: 'profile-1',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(startActivationSpy).not.toHaveBeenCalled();
    expect(activateFromMembershipSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'profile-1',
        status: 'active',
        member_role: 'owner',
        business_profile: expect.objectContaining({ id: 'profile-1' })
      })
    );
    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalledWith({ force: true });
    expect(resolveDestinationStrictSpy).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect(component.createCompanyError).toBe('');
  });

  it('prevents duplicate submissions while the first request is in flight', async () => {
    const createSubject = new Subject<{ status: number; confirmed: boolean; context: unknown }>();
    workspaceCreationSpy.createWorkspace.mockReturnValue(createSubject.asObservable());

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);

    createSubject.next({
      status: 201,
      confirmed: true,
      context: {
        workspaceId: 'profile-1',
        businessProfileId: 'profile-1',
        companyName: 'Northwind Logistics',
        isActive: true,
        planCode: 'free',
        billingStatus: 'trialing'
      }
    });
    createSubject.complete();
    await fixture.whenStable();
  });

  it('preserves the draft and shows a safe error code on server failure', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      throwError(() => ({
        status: 500,
        error: {
          code: 'SERVER_ERROR',
          message: 'Database exploded'
        }
      }))
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();

    expect(component.createCompanyLoading).toBe(false);
    expect(component.createCompanyForm.companyName).toBe('Northwind Logistics');
    expect(component.createCompanyErrorCode).toBe('SERVER_ERROR');
    expect(component.createCompanyError).toContain('We could not create your company right now.');
  });

  it('preserves the draft and shows a safe error code on network failure', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      throwError(() => ({
        status: 0,
        error: null
      }))
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();

    expect(component.createCompanyLoading).toBe(false);
    expect(component.createCompanyForm.companyName).toBe('Northwind Logistics');
    expect(component.createCompanyErrorCode).toBe('NETWORK');
    expect(component.createCompanyError).toContain('We could not reach the server.');
  });

  it('rejects invalid drafts before calling the backend', async () => {
    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = '';
    component.createCompanyForm.firstName = '';
    component.createCompanyForm.lastName = '';
    component.createCompanyForm.workEmail = '';
    component.createCompanyForm.country = '';

    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).not.toHaveBeenCalled();
    expect(component.createCompanyErrorCode).toBe('VALIDATION');
    expect(component.createCompanyError).toBe('Company name is required.');
  });
});
