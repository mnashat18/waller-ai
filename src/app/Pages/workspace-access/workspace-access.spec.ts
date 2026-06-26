import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import {
  type WorkspaceAccessState,
  WorkspaceAccessService
} from '../../services/workspace-access.service';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { WorkspaceCreationService } from '../../services/workspace-creation.service';
import { WorkspaceAccessPageComponent } from './workspace-access';

describe('WorkspaceAccessPageComponent recovery routing', () => {
  let fixture: ComponentFixture<WorkspaceAccessPageComponent>;
  let routerSpy: { navigateByUrl: (url: string, extras?: { replaceUrl?: boolean }) => Promise<boolean> };
  let navigatedTo: { url: string; extras?: { replaceUrl?: boolean } } | null = null;

  const workspaceState: WorkspaceAccessState = {
    loading: false,
    error: null,
    user: {
      id: 'user-1',
      displayName: 'Owner User',
      email: 'owner@example.com'
    },
    mode: 'ready',
    pendingApplication: null,
    workspaces: [
      {
        id: 'workspace-1',
        companyName: 'Wellar',
        memberRole: 'owner',
        status: 'active',
        departmentId: null,
        departmentName: null,
        isActive: true,
        isOwnerWorkspace: true
      }
    ],
    pendingInvites: [],
    selectedInvite: null,
    activeWorkspaces: [
      {
        id: 'workspace-1',
        companyName: 'Wellar',
        memberRole: 'owner',
        status: 'active',
        departmentId: null,
        departmentName: null,
        isActive: true,
        isOwnerWorkspace: true
      }
    ],
    employeeWorkspaces: [],
    inactiveWorkspaces: [],
    hasWorkspace: true,
    hasDashboardAccess: true
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    navigatedTo = null;
    routerSpy = {
      navigateByUrl: (url: string, extras?: { replaceUrl?: boolean }) => {
        navigatedTo = { url, extras };
        return Promise.resolve(true);
      }
    };

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
            loadWorkspaceAccess: () => of(workspaceState),
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
            activateFromMembership: () => Promise.resolve(),
            clearActiveWorkspaceContext: () => undefined
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
          useValue: {}
        },
        {
          provide: WorkspaceCreationService,
          useValue: {}
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceAccessPageComponent);
  });

  it('returns to the originally requested route after recovery succeeds', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await (fixture.componentInstance as any).redirectActiveWorkspace(workspaceState.activeWorkspaces[0]);

    expect(navigatedTo).toEqual({
      url: '/app/workforce',
      extras: {
        replaceUrl: true
      }
    });
  });
});
