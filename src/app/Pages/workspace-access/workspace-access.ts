import { CommonModule } from '@angular/common';
import { Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { CompanyContextService } from '../../core/context/company-context.service';
import {
  type WorkspaceAccessInvite,
  type WorkspaceAccessState,
  type WorkspaceAccessWorkspace,
  WorkspaceAccessService
} from '../../services/workspace-access.service';
import { catchError, finalize, from, map, of, switchMap, take } from 'rxjs';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';

@Component({
  selector: 'app-workspace-access-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './workspace-access.html',
  styleUrl: './workspace-access.css'
})
export class WorkspaceAccessPageComponent implements OnInit {
  state: WorkspaceAccessState = this.createEmptyState();
  loading = true;
  errorMessage = '';
  inviteClaimMessage = '';
  inviteDetailsOpen = false;
  showInviteForm = false;
  inviteCode = '';
  inviteCodeLoading = false;
  inviteCodeError = '';

  submittingInviteId: string | null = null;
  switchingWorkspaceId: string | null = null;

  constructor(
    private workspaceAccess: WorkspaceAccessService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private companyContext: CompanyContextService,
    private ngZone: NgZone,
    private postLoginRouting: PostLoginRoutingService,
    private invites: InviteService
  ) {}

  ngOnInit(): void {
    const inviteClaimError = this.invites.consumeInviteClaimError();
    if (inviteClaimError) {
      this.inviteClaimMessage = this.invites.formatInviteClaimError(inviteClaimError);
    }

    const joined = this.route.snapshot.queryParamMap.get('joined')?.trim();
    if (joined === '1') {
      this.inviteClaimMessage = 'Workspace joined. Reloading access...';
    }

    const inviteToken =
      this.route.snapshot.queryParamMap.get('invite')?.trim() ??
      this.route.snapshot.queryParamMap.get('token')?.trim() ??
      '';
    if (inviteToken) {
      this.persistPendingInviteToken(inviteToken);
      this.router.navigate(['/invites/claim'], {
        queryParams: { token: inviteToken },
        replaceUrl: true
      });
      return;
    }

    const pendingInviteToken = this.invites.getPendingInviteToken();
    if (
      pendingInviteToken &&
      !this.invites.hasClaimAttemptedForToken(pendingInviteToken) &&
      joined !== '1'
    ) {
      this.router.navigate(['/invites/claim'], {
        queryParams: { token: pendingInviteToken },
        replaceUrl: true
      });
      return;
    }

    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.auth.ensureSessionToken().pipe(
      take(1),
      switchMap((ready) => {
        if (!ready) {
          this.router.navigateByUrl('/login');
          return of(null);
        }

        return from(this.auth.getCurrentUserAfterRestore()).pipe(
          switchMap((currentUser) =>
            this.workspaceAccess.loadWorkspaceAccess(true).pipe(
              map((workspaceState) => ({ currentUser, workspaceState })),
              catchError((error) => {
                this.errorMessage = '';
                return of({
                  currentUser,
                  workspaceState: this.createEmptyState()
                });
              })
            )
          )
        );
      }),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (payload) => {
        if (!payload) {
          return;
        }
        const state = payload.workspaceState;

        const activeMemberships = state.activeWorkspaces.filter((membership) =>
          membership.status === 'active' && membership.isActive !== false
        );

        if (activeMemberships.length > 0) {
          const activeMembership = activeMemberships[0];
          const role = String(activeMembership.memberRole || '').toLowerCase();

          if (['owner', 'hr', 'manager'].includes(role)) {
            void this.redirectActiveWorkspace(activeMembership);
            return;
          }

          if (role === 'employee') {
            void this.redirectEmployeeWorkspace(activeMembership);
            return;
          }

          this.errorMessage = 'Your workspace role is not supported.';
          this.state = this.createEmptyState();
          return;
        }

        this.companyContext.clearActiveWorkspaceContext();

        this.state = state;

        if (state.mode === 'ready' && state.activeWorkspaces[0]) {
          void this.openWorkspace(state.activeWorkspaces[0]);
          return;
        }

        if (state.mode === 'employee-access' && state.employeeWorkspaces[0]) {
          void this.redirectEmployeeWorkspace(state.employeeWorkspaces[0]);
          return;
        }

        if (state.mode === 'restricted') {
          void this.router.navigateByUrl('/app/workspace-restricted');
        }
      },
      error: () => {
        this.state = this.createEmptyState();
        this.errorMessage = '';
      }
    });
  }

  retry(): void {
    this.load();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  toggleInviteDetails(): void {
    this.inviteDetailsOpen = !this.inviteDetailsOpen;
  }

  openInviteLink(): void {
    this.showInviteForm = true;
  }

  startWorkspaceSetup(): void {
    this.router.navigateByUrl('/app/workspace/request');
  }

  openMobileApp(): void {
    this.router.navigateByUrl('/download-app');
  }

  async acceptInvite(invite: WorkspaceAccessInvite): Promise<void> {
    if (this.submittingInviteId) {
      return;
    }

    this.submittingInviteId = invite.id;
    this.workspaceAccess.acceptInvite(invite).subscribe({
      next: (result) => {
        this.submittingInviteId = null;
        if (!result.ok) {
          this.errorMessage = result.message;
          return;
        }

        void this.completeInviteClaim(result, invite.token ?? null);
      },
      error: () => {
        this.submittingInviteId = null;
        this.errorMessage = 'We could not verify your invite right now.';
      }
    });
  }

  declineInvite(invite: WorkspaceAccessInvite): void {
    if (this.submittingInviteId) {
      return;
    }

    this.submittingInviteId = invite.id;
    this.workspaceAccess.declineInvite(invite.id).subscribe({
      next: (result) => {
        this.submittingInviteId = null;
        if (!result.ok) {
          this.errorMessage = result.message;
          return;
        }

        this.load();
      },
      error: () => {
        this.submittingInviteId = null;
        this.errorMessage = 'We could not update the invite right now.';
      }
    });
  }

  async openWorkspace(workspace: WorkspaceAccessWorkspace): Promise<void> {
    await this.redirectActiveWorkspace(workspace);
  }

  private async redirectActiveWorkspace(workspace: WorkspaceAccessWorkspace): Promise<void> {
    if (this.switchingWorkspaceId) {
      return;
    }

    this.switchingWorkspaceId = workspace.id;
    try {
      await this.companyContext.activateFromMembership({
        id: workspace.id,
        status: workspace.status,
        member_role: String(workspace.memberRole || '').toLowerCase(),
        business_profile: {
          id: workspace.id,
          company_name: workspace.companyName,
          is_active: workspace.isActive
        },
        department: workspace.departmentId ? { id: workspace.departmentId, name: workspace.departmentName ?? null } : null,
        joined_at: null
      });

      const success = await this.ngZone.run(() =>
        this.router.navigateByUrl('/app/dashboard', { replaceUrl: true })
      );

      if (!success) {
        this.errorMessage = 'We could not open that workspace.';
      }
    } catch (error) {
      this.errorMessage = 'We could not open that workspace.';
    } finally {
      this.switchingWorkspaceId = null;
    }
  }

  private async redirectEmployeeWorkspace(workspace: WorkspaceAccessWorkspace): Promise<void> {
    if (this.switchingWorkspaceId) {
      return;
    }

    this.switchingWorkspaceId = workspace.id;
    try {
      await this.companyContext.activateFromMembership({
        id: workspace.id,
        status: workspace.status,
        member_role: String(workspace.memberRole || '').toLowerCase(),
        business_profile: {
          id: workspace.id,
          company_name: workspace.companyName,
          is_active: workspace.isActive
        },
        department: workspace.departmentId ? { id: workspace.departmentId, name: workspace.departmentName ?? null } : null,
        joined_at: null
      });
      const success = await this.ngZone.run(() =>
        this.router.navigateByUrl('/app/my-readiness', { replaceUrl: true })
      );
      if (!success) {
        this.errorMessage = 'We could not open your workspace.';
      }
    } catch (error) {
      this.errorMessage = 'We could not open your workspace.';
    } finally {
      this.switchingWorkspaceId = null;
    }
  }

  private async routeAfterWorkspace(
    role: WorkspaceAccessWorkspace['memberRole'],
    profileId: string | null,
    departmentId: string | null
  ): Promise<void> {
    const normalizedRole = String(role || '').toLowerCase();

    if (normalizedRole === 'employee') {
      await this.redirectEmployeeWorkspace({
        id: profileId ?? '',
        companyName: '',
        memberRole: role,
        status: 'active',
        departmentId,
        departmentName: null,
        isActive: true,
        isOwnerWorkspace: false
      });
      return;
    }

    if (profileId) {
      await this.redirectActiveWorkspace({
        id: profileId,
        companyName: '',
        memberRole: role,
        status: 'active',
        departmentId,
        departmentName: null,
        isActive: true,
        isOwnerWorkspace: normalizedRole === 'owner'
      });
      return;
    }
  }

  workspaceScopeLabel(workspace: WorkspaceAccessWorkspace): string {
    if (workspace.memberRole === 'manager') {
      return workspace.departmentName || 'Department scope';
    }

    return 'Company-wide';
  }

  inviteScopeLabel(invite: WorkspaceAccessInvite): string {
    if (invite.memberRole === 'manager') {
      return invite.departmentName || 'Department scope';
    }

    return 'Company-wide';
  }

  trackByWorkspace(index: number, item: WorkspaceAccessWorkspace): string {
    return `${index}-${item.id}`;
  }

  trackByInvite(index: number, item: WorkspaceAccessInvite): string {
    return `${index}-${item.id}`;
  }

  joinWithInviteCode(): void {
    const code = this.inviteCode.trim();
    if (!code || this.inviteCodeLoading) {
      return;
    }

    this.inviteCodeLoading = true;
    this.inviteCodeError = '';
    this.inviteClaimMessage = '';
    this.errorMessage = '';

    this.workspaceAccess.claimInviteByToken(code).pipe(
      switchMap((result) => {
        if (!result.ok) {
          this.inviteCodeError = result.message;
          return of(null);
        }

        return from(this.completeInviteClaim(result, code)).pipe(map(() => null));
      }),
      finalize(() => {
        this.inviteCodeLoading = false;
      })
    ).subscribe();
  }

  private createEmptyState(): WorkspaceAccessState {
    return {
      loading: false,
      error: null,
      user: null,
      mode: 'no-workspace',
      workspaces: [],
      pendingInvites: [],
      pendingApplication: null,
      selectedInvite: null,
      activeWorkspaces: [],
      employeeWorkspaces: [],
      inactiveWorkspaces: [],
      hasWorkspace: false,
      hasDashboardAccess: false
    };
  }

  private persistPendingInviteToken(token: string): void {
    const normalized = token.trim();
    if (!normalized) {
      return;
    }

    this.invites.setPendingInviteToken(normalized);
  }

  private async completeInviteClaim(
    result: {
      businessProfileId?: string | null;
      memberRole?: WorkspaceAccessWorkspace['memberRole'] | null;
      departmentId?: string | null;
    },
    token: string | null
  ): Promise<void> {
    this.invites.clearPendingInviteToken();
    if (token) {
      this.invites.clearClaimAttemptedForToken(token);
    }
    this.invites.clearInviteClaimError();

    let nextRoute = '/app/workspace-access?joined=1';
    try {
      await this.postLoginRouting.refreshAuthTokenAfterInviteRoleChange();
      await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true });
      nextRoute = await this.postLoginRouting.navigateToPostInviteDestination(
        {
          businessProfileId: result.businessProfileId ?? null,
          memberRole: result.memberRole ?? null,
          departmentId: result.departmentId ?? null
        },
        token
      );
    } catch (error) {
      if ((error as { message?: unknown })?.message === 'Workspace joined successfully. Please sign in again to activate your access.') {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }

      nextRoute = '/app/workspace-access?joined=1';
    }

    this.inviteCode = '';
    await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
  }
}
