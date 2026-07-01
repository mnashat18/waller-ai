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
import { WorkspaceActivationService } from '../../services/workspace-activation.service';

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
  createCompanyLocked = this.readCreateCompanyLock();
  createCompanyError = '';
  createCompanyErrorCode = '';
  createCompanySuccessMessage = '';
  readonly createCompanyActivationPendingMessage =
    'Your company was created, but access is still activating. Please refresh this page in a moment.';
  private recoveryReturnUrl: string | null = null;
  private createCompanyIdempotencyKey: string | null = null;
  createCompanyForm = {
    companyName: '',
    firstName: '',
    lastName: '',
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
    private workspaceCreation: WorkspaceCreationService,
    private workspaceActivation: WorkspaceActivationService
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
        if (payload.currentUser?.first_name && !this.createCompanyForm.firstName) {
          this.createCompanyForm.firstName = String(payload.currentUser.first_name);
        }
        if (payload.currentUser?.last_name && !this.createCompanyForm.lastName) {
          this.createCompanyForm.lastName = String(payload.currentUser.last_name);
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
    if (this.createCompanyLocked) {
      return;
    }

    this.createCompanyOpen = true;
    this.createCompanyError = '';
    this.createCompanyErrorCode = '';
    this.createCompanySuccessMessage = '';
    this.ensureCreateCompanyIdempotencyKey();
  }

  createCompany(): void {
    if (this.createCompanyLoading || this.createCompanyLocked) {
      return;
    }

    const validation = this.validateCreateCompanyDraft();
    if (!validation.ok) {
      this.createCompanyError = validation.message;
      this.createCompanyErrorCode = 'VALIDATION';
      return;
    }

    this.createCompanyLoading = true;
    this.createCompanyError = '';
    this.createCompanyErrorCode = '';
    this.createCompanySuccessMessage = '';
    const idempotencyKey = this.ensureCreateCompanyIdempotencyKey();

    this.workspaceCreation.createWorkspace({
      idempotency_key: idempotencyKey,
      company_name: validation.payload.company_name,
      first_name: validation.payload.first_name,
      last_name: validation.payload.last_name,
      work_email: validation.payload.work_email,
      phone: this.emptyToNull(this.createCompanyForm.phone),
      country: validation.payload.country
    }).pipe(
      switchMap((result) => from(this.handleCreatedWorkspace(result))),
      finalize(() => {
        this.createCompanyLoading = false;
      })
    ).subscribe({
      next: async (route) => {
        this.createCompanySuccessMessage = route === '/app/workspace-activating'
          ? 'Workspace created. Activating your access...'
          : route === '/app/dashboard'
            ? 'Workspace created. Opening your dashboard...'
            : this.createCompanyActivationPendingMessage;
        this.createCompanyError = '';
        this.createCompanyErrorCode = '';
        if (route) {
          this.createCompanyIdempotencyKey = null;
          if (route !== '/app/workspace-access') {
            await this.router.navigateByUrl(route, { replaceUrl: true });
          }
        }
      },
      error: (error) => {
        const parsed = this.toCreateCompanyError(error);
        this.createCompanyError = parsed.message;
        this.createCompanyErrorCode = parsed.code;
      }
    });
  }

  private async activateCreatedWorkspaceContext(context: CreatedWorkspaceContext): Promise<void> {
    await this.companyContext.activateFromMembership({
      id: String(context.businessProfileId ?? ''),
      status: 'active',
      member_role: 'owner',
      business_profile: {
        id: String(context.businessProfileId ?? ''),
        company_name: context.companyName,
        is_active: context.isActive ?? true
      },
      department: null,
      joined_at: null
    });
  }

  private async handleCreatedWorkspace(
    result: { status: number; confirmed: boolean; context: CreatedWorkspaceContext }
  ): Promise<string> {
    if (result.status === 201) {
      const activation = await this.resolveCreatedWorkspaceActivation(result);
      if (activation) {
        this.createCompanyLocked = true;
        this.persistCreateCompanyLock(true);
        this.workspaceActivation.startActivation(activation);
        return '/app/workspace-activating';
      }

      this.createCompanyLocked = true;
      this.persistCreateCompanyLock(true);
      return '/app/workspace-access';
    }

    await this.activateCreatedWorkspaceContext(result.context);
    await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true });
    const route = await this.postLoginRouting.resolveDestinationStrict();
    return route === '/app/workspace-access' ? '/app/dashboard' : route;
  }

  private async resolveCreatedWorkspaceActivation(
    result: { status: number; confirmed: boolean; context: CreatedWorkspaceContext }
  ): Promise<{ businessProfileId: string; companyName: string | null } | null> {
    const directWorkspaceId = this.normalizeText(String(result.context.businessProfileId ?? ''), 120);
    if (result.status === 201 && result.confirmed && directWorkspaceId) {
      return {
        businessProfileId: directWorkspaceId,
        companyName: result.context.companyName ?? null
      };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true, failOnError: true });
        const snapshot = this.companyContext.snapshot().context;
        const activeBusinessProfileId = this.normalizeText(String(snapshot.activeBusinessProfileId ?? ''), 120);
        const activeMemberRole = this.normalizeText(String(snapshot.activeMemberRole ?? ''), 40)?.toLowerCase() ?? '';
        const hasActiveCompany = Boolean(
          activeBusinessProfileId &&
          snapshot.availableCompanies.some((company) => company.id === activeBusinessProfileId && company.isActive)
        );

        if (activeBusinessProfileId && activeMemberRole === 'owner' && hasActiveCompany) {
          return {
            businessProfileId: activeBusinessProfileId,
            companyName: snapshot.activeBusinessProfileName ?? result.context.companyName ?? null
          };
        }
      } catch {
        // Retry with the next bounded refresh attempt.
      }

      if (attempt < 2) {
        await this.delay(250);
      }
    }

    return null;
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

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readCreateCompanyLock(): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }

    try {
      return sessionStorage.getItem('wellar_workspace_creation_lock_v1') === '1';
    } catch {
      return false;
    }
  }

  private persistCreateCompanyLock(locked: boolean): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    try {
      if (locked) {
        sessionStorage.setItem('wellar_workspace_creation_lock_v1', '1');
      } else {
        sessionStorage.removeItem('wellar_workspace_creation_lock_v1');
      }
    } catch {
      // ignore storage errors
    }
  }

  private ensureCreateCompanyIdempotencyKey(): string {
    if (this.createCompanyIdempotencyKey) {
      return this.createCompanyIdempotencyKey;
    }

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      this.createCompanyIdempotencyKey = crypto.randomUUID();
      return this.createCompanyIdempotencyKey;
    }

    this.createCompanyIdempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return this.createCompanyIdempotencyKey;
  }

  private toCreateCompanyError(error: any): { message: string; code: string } {
    const code = String(
      error?.code ??
      error?.error?.error?.code ??
      error?.error?.code ??
      error?.error?.error?.error?.code ??
      ''
    ).toUpperCase();
    const message =
      error?.error?.error?.message ||
      error?.error?.message ||
      error?.error?.errors?.[0]?.message ||
      error?.message ||
      '';

    if (code === 'CONFLICT' || error?.status === 409) {
      return {
        message:
          message ||
          'This account already belongs to an organization. Refresh organization access to continue.',
        code: code || 'CONFLICT'
      };
    }

    if (code === 'BAD_REQUEST' || error?.status === 400) {
      return {
        message: message || 'Please check the workspace details and try again.',
        code: code || 'BAD_REQUEST'
      };
    }

    if (code === 'FORBIDDEN' || error?.status === 403) {
      return {
        message: message || 'You are not allowed to create a company workspace.',
        code: code || 'FORBIDDEN'
      };
    }

    if (code === 'TIMEOUT') {
      return {
        message: 'The request took too long. Please retry.',
        code: code || 'TIMEOUT'
      };
    }

    if (error?.status === 0) {
      return {
        message: 'We could not reach the server. Check your connection and retry.',
        code: 'NETWORK'
      };
    }

    return {
      message: 'We could not create your company right now.',
      code: code || String(error?.status ?? 'SERVER_ERROR')
    };
  }

  private validateCreateCompanyDraft(): {
    ok: boolean;
    message: string;
    payload: {
      company_name: string;
      first_name: string;
      last_name: string;
      work_email: string;
      country: string;
    };
  } {
    const companyName = this.normalizeRequiredText(this.createCompanyForm.companyName, 120);
    const firstName = this.normalizeRequiredText(this.createCompanyForm.firstName, 80);
    const lastName = this.normalizeRequiredText(this.createCompanyForm.lastName, 80);
    const workEmail = this.normalizeRequiredText(this.createCompanyForm.workEmail, 120).toLowerCase();
    const country = this.normalizeRequiredText(this.createCompanyForm.country, 80);

    if (!companyName) {
      return { ok: false, message: 'Company name is required.', payload: this.emptyCreateCompanyPayload() };
    }
    if (companyName.length > 120) {
      return {
        ok: false,
        message: 'Company name must be between 2 and 120 characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!firstName) {
      return { ok: false, message: 'First name is required.', payload: this.emptyCreateCompanyPayload() };
    }
    if (firstName.length > 80) {
      return {
        ok: false,
        message: 'First name must be between 2 and 80 characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!lastName) {
      return { ok: false, message: 'Last name is required.', payload: this.emptyCreateCompanyPayload() };
    }
    if (lastName.length > 80) {
      return {
        ok: false,
        message: 'Last name must be between 2 and 80 characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!this.isValidCompanyName(companyName)) {
      return {
        ok: false,
        message: 'Company name can only include letters, numbers, spaces, and basic punctuation.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!this.isValidPersonName(firstName)) {
      return {
        ok: false,
        message: 'First name must use a real name.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!this.isValidPersonName(lastName)) {
      return {
        ok: false,
        message: 'Last name must use a real name.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!this.isValidEmail(workEmail)) {
      return {
        ok: false,
        message: 'Work email must be a valid email address.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (workEmail.length > 120) {
      return {
        ok: false,
        message: 'Work email must be between 3 and 120 characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!country) {
      return { ok: false, message: 'Country is required.', payload: this.emptyCreateCompanyPayload() };
    }
    if (country.length > 80) {
      return {
        ok: false,
        message: 'Country must be between 2 and 80 characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }
    if (!this.isValidCountry(country)) {
      return {
        ok: false,
        message: 'Country contains unsupported characters.',
        payload: this.emptyCreateCompanyPayload()
      };
    }

    const phone = this.normalizeOptionalPhone(this.createCompanyForm.phone);
    if (phone === null && this.createCompanyForm.phone.trim()) {
      return {
        ok: false,
        message: 'Phone number must contain only valid characters and at least 7 digits.',
        payload: this.emptyCreateCompanyPayload()
      };
    }

    return {
      ok: true,
      message: '',
      payload: {
        company_name: companyName,
        first_name: firstName,
        last_name: lastName,
        work_email: workEmail,
        country
      }
    };
  }

  private normalizeRequiredText(value: string, max: number): string {
    return this.normalizeText(value, max);
  }

  private normalizeText(value: string, max = 255): string {
    void max;
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeOptionalPhone(value: string): string | null {
    const normalized = this.normalizeText(value, 30);
    if (!normalized) {
      return null;
    }

    if (normalized.length > 30) {
      return null;
    }

    if (!/^[+()\d\s.-]+$/.test(normalized)) {
      return null;
    }

    return normalized.replace(/\s+/g, ' ');
  }

  private isValidCompanyName(value: string): boolean {
    return /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s&'.,()/-]*$/u.test(value) && !this.isPlaceholderValue(value);
  }

  private isValidPersonName(value: string): boolean {
    return /^[\p{L}\p{M}][\p{L}\p{M}\p{N}\s.'-]*$/u.test(value) && !this.isPlaceholderValue(value);
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isValidCountry(value: string): boolean {
    return /^[\p{L}\p{M}\p{N}\s.'/-]+$/u.test(value) && !this.isPlaceholderValue(value);
  }

  private isPlaceholderValue(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return new Set([
      'test',
      'testing',
      'demo',
      'sample',
      'placeholder',
      'example',
      'lorem ipsum',
      'dummy',
      'temp',
      'n/a',
      'na',
      'none',
      'first name',
      'last name',
      'company name',
      'your company',
      'your name'
    ]).has(normalized);
  }

  private emptyCreateCompanyPayload(): {
    company_name: string;
    first_name: string;
    last_name: string;
    work_email: string;
    country: string;
  } {
    return {
      company_name: '',
      first_name: '',
      last_name: '',
      work_email: '',
      country: ''
    };
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
