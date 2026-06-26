import { CommonModule } from '@angular/common';
import { Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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
import {
  type CreatedWorkspaceContext,
  WorkspaceCreationService
} from '../../services/workspace-creation.service';

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
  createCompanyOpen = false;
  createCompanyLoading = false;
  createCompanyError = '';
  private recoveryReturnUrl: string | null = null;
  createCompanyForm = {
    companyName: '',
    contactName: '',
    workEmail: '',
    phone: '',
    country: ''
  };

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
    private invites: InviteService,
    private workspaceCreation: WorkspaceCreationService
  ) {}

  ngOnInit(): void {
    const inviteClaimError = this.invites.consumeInviteClaimError();
    if (inviteClaimError) {
      this.inviteClaimMessage = this.invites.formatInviteClaimError(inviteClaimError);
    }

    const joined = this.route.snapshot.queryParamMap.get('joined')?.trim();
    if (joined === '1') {
      this.inviteClaimMessage = 'Organization joined. Reloading access...';
    }

    this.recoveryReturnUrl = this.readRecoveryReturnUrl();

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
          this.router.navigateByUrl('/?auth=login');
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
        if (payload.currentUser?.email && !this.createCompanyForm.workEmail) {
          this.createCompanyForm.workEmail = String(payload.currentUser.email);
        }
        const displayName = [payload.currentUser?.first_name, payload.currentUser?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (displayName && !this.createCompanyForm.contactName) {
          this.createCompanyForm.contactName = displayName;
        }

        const activeMemberships = state.activeWorkspaces.filter((membership) =>
          membership.status === 'active' && membership.isActive !== false
        );

        if (activeMemberships.length === 1) {
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

          this.errorMessage = 'Your organization access level is not supported.';
          this.state = this.createEmptyState();
          return;
        }

        if (activeMemberships.length > 1) {
          this.state = {
            ...state,
            mode: 'multiple-workspaces',
            workspaces: activeMemberships
          };
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
    this.router.navigateByUrl('/');
  }

  toggleInviteDetails(): void {
    this.inviteDetailsOpen = !this.inviteDetailsOpen;
  }

  openInviteLink(): void {
    this.showInviteForm = true;
  }

  openCreateCompany(): void {
    this.createCompanyOpen = true;
    this.createCompanyError = '';
  }

  createCompany(): void {
    if (this.createCompanyLoading) {
      return;
    }

    const companyName = this.createCompanyForm.companyName.trim();
    if (!companyName) {
      this.createCompanyError = 'Company name is required.';
      return;
    }

    this.createCompanyLoading = true;
    this.createCompanyError = '';

    this.workspaceCreation.createWorkspace({
      idempotency_key: this.createIdempotencyKey(),
      company_name: companyName,
      contact_name: this.emptyToNull(this.createCompanyForm.contactName),
      work_email: this.emptyToNull(this.createCompanyForm.workEmail),
      phone: this.emptyToNull(this.createCompanyForm.phone),
      country: this.emptyToNull(this.createCompanyForm.country)
    }).pipe(
      switchMap((result) =>
        from(this.activateCreatedWorkspaceContext(result.context)).pipe(map(() => result))
      ),
      switchMap(() => from(this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true }))),
      switchMap(() => from(this.postLoginRouting.resolveDestinationStrict())),
      finalize(() => {
        this.createCompanyLoading = false;
      })
    ).subscribe({
      next: async (route) => {
        const nextRoute = route === '/app/workspace-access' ? '/app/dashboard' : route;
        await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
      },
      error: (error) => {
        this.createCompanyError = this.toCreateCompanyError(error);
      }
    });
  }

  private async activateCreatedWorkspaceContext(context: CreatedWorkspaceContext): Promise<void> {
    await this.companyContext.activateFromMembership({
      id: context.membership.id,
      status: context.membership.status,
      member_role: context.membership.memberRole,
      business_profile: {
        id: context.workspace.id,
        company_name: context.workspace.companyName,
        is_active: context.workspace.isActive
      },
      department: null,
      joined_at: null
    });
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

        void this.completeInviteClaim(result, null);
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
    if (workspace.memberRole === 'employee') {
      await this.redirectEmployeeWorkspace(workspace);
      return;
    }

    await this.redirectActiveWorkspace(workspace);
  }

  private async redirectActiveWorkspace(workspace: WorkspaceAccessWorkspace): Promise<void> {
    if (this.switchingWorkspaceId) {
      return;
    }

    this.switchingWorkspaceId = workspace.id;
    try {
      const result = await firstValueFrom(this.workspaceAccess.openWorkspace(workspace));
      if (!result.ok) {
        this.errorMessage = result.message;
        return;
      }

      const nextRoute = this.resolveRecoveryReturnUrl('/app/dashboard');
      const success = await this.ngZone.run(() =>
        this.router.navigateByUrl(nextRoute, { replaceUrl: true })
      );

      if (!success) {
        this.errorMessage = 'We could not open that organization.';
      } else {
        this.clearRecoveryReturnUrl();
      }
    } catch (error) {
      this.errorMessage = 'We could not open that organization.';
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
      const result = await firstValueFrom(this.workspaceAccess.openWorkspace(workspace));
      if (!result.ok) {
        this.errorMessage = result.message;
        return;
      }
      const nextRoute = this.resolveRecoveryReturnUrl('/employee-web-access');
      const success = await this.ngZone.run(() =>
        this.router.navigateByUrl(nextRoute, { replaceUrl: true })
      );
      if (!success) {
        this.errorMessage = 'We could not open your organization.';
      } else {
        this.clearRecoveryReturnUrl();
      }
    } catch (error) {
      this.errorMessage = 'We could not open your organization.';
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

  private resolveRecoveryReturnUrl(defaultRoute: string): string {
    const candidate = this.normalizeRecoveryReturnUrl(this.recoveryReturnUrl);
    if (!candidate || candidate === '/app/workspace-access') {
      return defaultRoute;
    }

    return candidate;
  }

  private normalizeRecoveryReturnUrl(value: string | null): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized || !normalized.startsWith('/') || normalized.startsWith('//')) {
      return null;
    }

    if (
      normalized.startsWith('/app/workspace-access') ||
      normalized.startsWith('/app/workspace/request') ||
      normalized.startsWith('/app/workspace-restricted')
    ) {
      return null;
    }

    return normalized;
  }

  private readRecoveryReturnUrl(): string | null {
    const queryReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const queryCandidate = this.normalizeRecoveryReturnUrl(queryReturnUrl);
    if (queryCandidate) {
      return queryCandidate;
    }

    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    const storedReturnUrl = sessionStorage.getItem('wellar_workspace_recovery_return_url');
    return this.normalizeRecoveryReturnUrl(storedReturnUrl);
  }

  private clearRecoveryReturnUrl(): void {
    this.recoveryReturnUrl = null;

    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.removeItem('wellar_workspace_recovery_return_url');
  }

  workspaceScopeLabel(workspace: WorkspaceAccessWorkspace): string {
    if (workspace.memberRole === 'manager') {
      return workspace.departmentName || 'Assigned department';
    }

    return 'Organization-wide';
  }

  inviteScopeLabel(invite: WorkspaceAccessInvite): string {
    if (invite.memberRole === 'manager') {
      return invite.departmentName || 'Assigned department';
    }

    return 'Organization-wide';
  }

  accessLevelLabel(role: WorkspaceAccessWorkspace['memberRole'] | WorkspaceAccessInvite['memberRole']): string {
    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';
    return 'Unknown';
  }

  organizationStateLabel(workspace: WorkspaceAccessWorkspace): string {
    if (this.isCurrentOrganization(workspace)) {
      return 'Current';
    }

    return workspace.isActive ? 'Active' : this.toDisplayLabel(workspace.status || 'inactive');
  }

  isCurrentOrganization(workspace: WorkspaceAccessWorkspace): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    const activeId =
      localStorage.getItem('active_business_profile_id')?.trim() ||
      localStorage.getItem('active_business_profile')?.trim() ||
      '';
    return Boolean(activeId && activeId === workspace.id);
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
    ).subscribe({
      error: (error) => {
        // Surface claim-completion failures (network/permission errors rethrown by
        // the service, or a failed post-claim navigation) instead of absorbing them.
        // finalize() above still clears the loading state.
        this.inviteCodeError = this.invites.getReadableInviteError(error);
      }
    });
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

  private emptyToNull(value: string): string | null {
    const normalized = value.trim();
    return normalized || null;
  }

  private createIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private toCreateCompanyError(error: any): string {
    const code = String(error?.error?.error?.code ?? error?.error?.code ?? '').toUpperCase();
    const message =
      error?.error?.error?.message ||
      error?.error?.errors?.[0]?.message ||
      error?.message ||
      '';

    if (code === 'CONFLICT' || error?.status === 409) {
      return 'This account already belongs to an organization. Refresh organization access to continue.';
    }

    return message || 'We could not create your company right now.';
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
        await this.router.navigateByUrl('/?auth=login', { replaceUrl: true });
        return;
      }

      nextRoute = '/app/workspace-access?joined=1';
    }

    this.inviteCode = '';
    await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
  }

  private toDisplayLabel(value: string): string {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ');
  }
}
