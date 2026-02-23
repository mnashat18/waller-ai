import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import {
  type CreateRequestForm,
  CreateRequestModalComponent,
  REQUIRED_STATE_OPTIONS,
  type RequiredState,
  type SubmitFeedback,
  type TeamMemberRoleOption
} from '../../components/create-request-modal/create-request-modal';
import {
  type ActionResult,
  BusinessCenterService,
  type BusinessMemberRole,
  type CreateScanRequestResult,
  type ManageTeamMemberRole
} from '../../services/business-center.service';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateRequestModalComponent, NotificationsComponent],
  templateUrl: './requests-mobile.html'
})
export class RequestsMobileComponent implements OnInit, OnDestroy {
  readonly maxRecipientEmails = 5;
  readonly memberRoleOptions: TeamMemberRoleOption[] = [
    { value: 'member', label: 'Member' },
    { value: 'manager', label: 'Manager' },
    { value: 'admin', label: 'Admin' }
  ];
  assignableMemberRoleOptions: TeamMemberRoleOption[] = [...this.memberRoleOptions];
  defaultInviteMemberRole: ManageTeamMemberRole = 'member';

  showCreateModal = false;
  loadingPlanAccess = true;
  requests: RequestRow[] = [];
  submitFeedback: SubmitFeedback | null = null;
  submittingRequest = false;
  showPermissionNotice = false;

  hasBusinessAccess = false;
  canViewRequestCenter = true;
  canCreateRequests = false;
  canOpenBusinessCenter = false;
  canAssignMemberRole = false;

  currentPlanName = 'Free';
  currentPlanCode = 'free';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;

  private successToastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly accessTimeoutMs = 15000;
  private currentMemberRole: BusinessMemberRole | null = null;
  private currentBusinessProfileId: string | null = null;
  private currentOrgId: string | null = null;

  requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };

  constructor(
    private http: HttpClient,
    private businessCenter: BusinessCenterService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadPlanAccess();
  }

  ngOnDestroy() {
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
      this.successToastTimer = null;
    }
  }

  badgeClass(state: string): string {
    const normalized = (state ?? '').toLowerCase();
    if (normalized.includes('stable')) return 'badge-stable';
    if (normalized.includes('focus')) return 'badge-low';
    if (normalized.includes('fatigue')) return 'badge-fatigue';
    if (normalized.includes('risk')) return 'badge-risk';
    return '';
  }

  handleCreateRequest(form: CreateRequestForm) {
    if (!this.canCreateRequests) {
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    const { uniqueEmails, invalidEntries } = this.normalizeRecipientEmails(form.requestedForEmails);
    const selectedMemberRole = this.resolveSelectedMemberRole(form.memberRole);
    const requiredState = this.normalizeRequiredState(form.requiredState);

    if (invalidEntries.length > 0) {
      this.submitFeedback = { type: 'error', message: `Invalid email: ${invalidEntries[0]}` };
      this.cdr.detectChanges();
      return;
    }

    if (!uniqueEmails.length) {
      this.submitFeedback = { type: 'error', message: 'Enter at least one recipient email.' };
      this.cdr.detectChanges();
      return;
    }

    if (uniqueEmails.length > this.maxRecipientEmails) {
      this.submitFeedback = {
        type: 'error',
        message: `You can add up to ${this.maxRecipientEmails} recipient emails per submit.`
      };
      this.cdr.detectChanges();
      return;
    }

    if (!requiredState) {
      this.submitFeedback = { type: 'error', message: 'Select a required state.' };
      this.cdr.detectChanges();
      return;
    }

    const userToken = this.getUserToken();
    const currentUserEmail = this.getUserEmailFromToken(userToken);
    if (!userToken) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.cdr.detectChanges();
      return;
    }

    if (currentUserEmail && uniqueEmails.some((email) => email === currentUserEmail)) {
      this.submitFeedback = { type: 'error', message: 'You cannot send a request to yourself.' };
      this.cdr.detectChanges();
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending requests...' };
    this.cdr.detectChanges();

    this.submitRequestBatch(uniqueEmails, requiredState, selectedMemberRole);
  }

  dismissPermissionNotice() {
    this.showPermissionNotice = false;
    this.cdr.detectChanges();
  }

  trialDaysLabel(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return 'Paid Business features are currently unlocked for your trial.';
    }
    if (this.trialDaysRemaining <= 1) {
      return 'Paid Business features are free today only (last trial day).';
    }
    return `Paid Business features are free for now - ${this.trialDaysRemaining} day(s) left.`;
  }

  businessPaidFeatureNotice(featureLabel: string): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return `${featureLabel} is a paid Business feature, currently unlocked in your trial.`;
    }
    if (this.trialDaysRemaining <= 1) {
      return `${featureLabel} is a paid Business feature, free for today only.`;
    }
    return `${featureLabel} is a paid Business feature, free for ${this.trialDaysRemaining} day(s) left.`;
  }

  openCreateModal() {
    if (!this.canCreateRequests) {
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    this.showPermissionNotice = false;
    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

  private loadPlanAccess() {
    this.loadingPlanAccess = true;
    this.businessCenter.getHubAccessState().pipe(
      timeout(this.accessTimeoutMs),
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to load plan access.')
        };
        return of(null);
      })
    ).subscribe((state) => {
      if (!state) {
        this.hasBusinessAccess = false;
        this.canViewRequestCenter = true;
        this.canCreateRequests = false;
        this.canOpenBusinessCenter = false;
        this.canAssignMemberRole = false;
        this.currentPlanName = 'Free';
        this.currentPlanCode = 'free';
        this.isBusinessTrial = false;
        this.trialDaysRemaining = null;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.currentMemberRole = null;
        this.currentBusinessProfileId = null;
        this.currentOrgId = null;
        this.syncAssignableMemberRoleOptions();
        this.loadingPlanAccess = false;
        this.loadRequests();
        this.cdr.detectChanges();
        return;
      }

      this.hasBusinessAccess = Boolean(state.hasPaidAccess);
      this.currentPlanName = this.hasBusinessAccess ? 'Business' : 'Free';
      this.currentPlanCode = (state.profile?.plan_code ?? (this.hasBusinessAccess ? 'business' : 'free')).toString().toLowerCase();

      this.currentMemberRole = this.normalizeBusinessRole(state.memberRole);
      this.currentBusinessProfileId = this.normalizeId(state.profile?.id);
      this.currentOrgId = this.normalizeId(state.orgId);

      this.canViewRequestCenter =
        !this.hasBusinessAccess || this.canRoleAccessRequests(this.currentMemberRole);

      const billingStatus = (state.profile?.billing_status ?? '').toString().trim().toLowerCase();
      this.isBusinessTrial = billingStatus === 'trial' && !state.trialExpired;
      this.trialDaysRemaining = this.isBusinessTrial
        ? this.daysUntil(state.trialExpiresAt)
        : null;

      this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
      this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email invites');

      const hasWritableRequestAccess =
        this.hasBusinessAccess &&
        this.canRoleAccessRequests(this.currentMemberRole) &&
        Boolean(state.permissions?.canUseSystem) &&
        !Boolean(state.permissions?.isReadOnly) &&
        !Boolean(state.trialExpired);

      this.canCreateRequests = hasWritableRequestAccess;
      this.canOpenBusinessCenter =
        this.hasBusinessAccess && this.canRoleAccessRequests(this.currentMemberRole);
      this.canAssignMemberRole =
        hasWritableRequestAccess &&
        Boolean(state.permissions?.canManageMembers) &&
        Boolean(this.currentBusinessProfileId);

      this.syncAssignableMemberRoleOptions();

      this.loadingPlanAccess = false;
      this.loadRequests();
      this.cdr.detectChanges();
    });
  }

  private loadRequests() {
    if (this.hasBusinessAccess && !this.canViewRequestCenter) {
      this.applyRequests([]);
      return;
    }

    if (this.hasBusinessAccess) {
      this.loadBusinessRequests();
      return;
    }

    this.loadIncomingRequests();
  }

  private loadBusinessRequests() {
    const token = this.getUserToken();
    if (!token) {
      this.applyRequests([]);
      return;
    }

    this.fetchRequests(token, null).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => {
        console.error('[requests-mobile] requests error:', fetchErr);
        this.applyRequests([]);
      }
    });
  }

  private loadIncomingRequests() {
    const token = this.getUserToken();
    const userId = this.getUserIdFromToken(token);

    if (!token || !userId) {
      this.applyRequests([]);
      return;
    }

    this.fetchRequests(token, { requestedForUserId: userId }).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => {
        console.error('[requests-mobile] incoming requests error:', fetchErr);
        this.applyRequests([]);
      }
    });
  }

  private fetchRequests(
    token: string | null,
    filters: { requestedForUserId?: string } | null
  ) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return of([] as RequestRecord[]);
    }

    const fields = [
      'id',
      'requested_for_email',
      'requested_for_phone',
      'required_state',
      'response_status',
      'timestamp'
    ].join(',');
    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: '50',
      fields
    });

    if (filters?.requestedForUserId) {
      params.set('filter[requested_for_user][_eq]', filters.requestedForUserId);
    }

    return this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      { headers, withCredentials: true }
    ).pipe(
      map(res => res.data ?? [])
    );
  }

  private applyRequests(requests: RequestRecord[]) {
    this.requests = requests.map((request) => this.mapToRequestRow(request));
    this.requestStats = this.requests.reduce(
      (acc, req) => {
        acc.total += 1;
        if (req.status === 'Approved') acc.approved += 1;
        if (req.status === 'Denied') acc.denied += 1;
        if (req.status === 'Pending') acc.pending += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, denied: 0 }
    );
    this.cdr.detectChanges();
  }

  private mapToRequestRow(request: RequestRecord): RequestRow {
    return {
      target: this.formatRequestTarget(request),
      required_state: request.required_state ?? 'Unknown',
      status: this.normalizeStatus(request.response_status),
      timestamp: this.formatTimestamp(request.timestamp ?? '')
    };
  }

  private normalizeStatus(status?: string): RequestRow['status'] {
    const normalized = (status ?? '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('accepted')) return 'Approved';
    if (normalized.includes('denied') || normalized.includes('rejected')) return 'Denied';
    return 'Pending';
  }

  private formatTimestamp(value: string | number | Date): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private getUserIdFromToken(token: string | null): string | null {
    if (!token) return null;
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return this.normalizeId(id);
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!userToken || this.isTokenExpired(userToken)) return null;
    return userToken;
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') return false;
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private submitRequestBatch(
    recipientEmails: string[],
    requiredState: RequiredState,
    selectedMemberRole: ManageTeamMemberRole
  ) {
    const createCalls = recipientEmails.map((email) =>
      this.businessCenter.createScanRequest({
        requested_for_email: email,
        required_state: requiredState
      }, this.currentOrgId).pipe(
        catchError((err) =>
          of({
            ok: false,
            message: this.describeHttpError(err, 'Failed to send request.')
          } as CreateScanRequestResult)
        )
      )
    );

    forkJoin(createCalls).subscribe({
      next: (results) => {
        const successEmails: string[] = [];
        let successCount = 0;
        let failedCount = 0;
        let firstError = '';

        results.forEach((result, index) => {
          if (result?.ok) {
            successCount += 1;
            successEmails.push(recipientEmails[index]);
            return;
          }
          failedCount += 1;
          if (!firstError) {
            firstError = result?.message || 'Failed to send request.';
          }
        });

        if (!successCount) {
          this.submittingRequest = false;
          this.submitFeedback = {
            type: 'error',
            message: firstError || 'Failed to send request.'
          };
          this.cdr.detectChanges();
          return;
        }

        if (this.canAssignMemberRole && this.currentBusinessProfileId) {
          this.assignRoleToRecipients(successEmails, selectedMemberRole).subscribe((roleResult) => {
            this.completeRequestSubmit(successCount, failedCount, firstError, roleResult);
          });
          return;
        }

        this.completeRequestSubmit(successCount, failedCount, firstError);
      },
      error: (err) => {
        this.submittingRequest = false;
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.cdr.detectChanges();
      }
    });
  }

  private completeRequestSubmit(
    successCount: number,
    failedCount: number,
    firstError: string,
    roleResult?: RoleAssignmentSummary
  ): void {
    const roleSummary = roleResult
      ? this.buildRoleSummaryMessage(roleResult)
      : '';

    const baseMessage =
      failedCount === 0
        ? `Sent ${successCount} request(s) successfully.`
        : `Sent ${successCount} request(s). ${failedCount} failed.`;

    const errorHint = failedCount > 0 && firstError ? ` ${firstError}` : '';
    const fullMessage = `${baseMessage}${roleSummary}${errorHint}`.trim();

    this.submittingRequest = false;
    this.showCreateModal = false;

    const hasRoleFailure = Boolean(roleResult && roleResult.failedCount > 0);
    if (failedCount === 0 && !hasRoleFailure) {
      this.showSuccessToast(fullMessage);
    } else {
      this.submitFeedback = { type: 'info', message: fullMessage };
    }

    this.loadRequests();
    this.cdr.detectChanges();
  }

  private buildRoleSummaryMessage(summary: RoleAssignmentSummary): string {
    if (summary.successCount > 0 && summary.failedCount === 0) {
      return ` Team role updated for ${summary.successCount} recipient(s).`;
    }
    if (summary.successCount > 0 && summary.failedCount > 0) {
      return ` Role updated for ${summary.successCount} recipient(s), ${summary.failedCount} failed.`;
    }
    if (summary.failedCount > 0) {
      return ` Failed to update member role. ${summary.errorMessage}`;
    }
    return '';
  }

  private assignRoleToRecipients(
    recipientEmails: string[],
    role: ManageTeamMemberRole
  ) {
    const profileId = this.currentBusinessProfileId;
    if (!profileId || !recipientEmails.length) {
      return of({ successCount: 0, failedCount: 0, errorMessage: '' } as RoleAssignmentSummary);
    }

    const memberCalls = recipientEmails.map((email) =>
      this.businessCenter.upsertTeamMember(profileId, email, role).pipe(
        catchError((err) =>
          of({
            ok: false,
            message: this.describeHttpError(err, 'Failed to update team member role.')
          } as ActionResult)
        )
      )
    );

    return forkJoin(memberCalls).pipe(
      map((results) => {
        let successCount = 0;
        let failedCount = 0;
        let errorMessage = '';

        for (const item of results) {
          if (item?.ok) {
            successCount += 1;
            continue;
          }
          failedCount += 1;
          if (!errorMessage) {
            errorMessage = item?.message || 'Permission denied while updating member role.';
          }
        }

        return {
          successCount,
          failedCount,
          errorMessage
        } as RoleAssignmentSummary;
      })
    );
  }

  private formatRequestTarget(request: RequestRecord): string {
    if (request.requested_for_email) return request.requested_for_email;
    if (request.requested_for_phone) return request.requested_for_phone;
    return 'scan';
  }

  private describeHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      '';
    const normalized = String(detail).toLowerCase();

    if (
      status === 0 ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('connection refused') ||
      normalized.includes('timeout')
    ) {
      return `Network error: ${detail || fallback}`;
    }

    if (status >= 500) {
      return `Server error (${status}): ${detail || fallback}`;
    }

    if (status >= 400) {
      return `Request error (${status}): ${detail || fallback}`;
    }

    return detail || fallback;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return this.isValidEmail(normalized) ? normalized : null;
  }

  private normalizeRecipientEmails(values: unknown): {
    uniqueEmails: string[];
    invalidEntries: string[];
  } {
    const unique = new Set<string>();
    const invalid: string[] = [];
    const source = Array.isArray(values) ? values : [values];

    for (const raw of source) {
      if (typeof raw !== 'string') {
        continue;
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimmed.toLowerCase();
      if (!this.isValidEmail(normalized)) {
        invalid.push(trimmed);
        continue;
      }

      unique.add(normalized);
    }

    return {
      uniqueEmails: Array.from(unique),
      invalidEntries: invalid
    };
  }

  private normalizeRequiredState(value: unknown): RequiredState | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return (REQUIRED_STATE_OPTIONS as readonly string[]).includes(normalized)
      ? normalized as RequiredState
      : null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private normalizeBusinessRole(value: unknown): BusinessMemberRole | null {
    const normalized = (value ?? '').toString().trim().toLowerCase();
    if (
      normalized === 'owner' ||
      normalized === 'admin' ||
      normalized === 'manager' ||
      normalized === 'member' ||
      normalized === 'viewer'
    ) {
      return normalized;
    }
    return null;
  }

  private canRoleAccessRequests(role: BusinessMemberRole | null): boolean {
    return role === 'owner' || role === 'admin' || role === 'manager';
  }

  private syncAssignableMemberRoleOptions(): void {
    if (!this.canAssignMemberRole) {
      this.assignableMemberRoleOptions = [{ value: 'member', label: 'Member' }];
      this.defaultInviteMemberRole = 'member';
      return;
    }

    if (this.currentMemberRole === 'owner') {
      this.assignableMemberRoleOptions = [...this.memberRoleOptions];
    } else if (this.currentMemberRole === 'admin') {
      this.assignableMemberRoleOptions = this.memberRoleOptions.filter(
        (option) => option.value === 'manager' || option.value === 'member'
      );
    } else {
      this.assignableMemberRoleOptions = [{ value: 'member', label: 'Member' }];
    }

    if (!this.assignableMemberRoleOptions.some((option) => option.value === this.defaultInviteMemberRole)) {
      this.defaultInviteMemberRole = this.assignableMemberRoleOptions[0]?.value ?? 'member';
    }
  }

  private resolveSelectedMemberRole(value: unknown): ManageTeamMemberRole {
    const normalized = (value ?? '').toString().trim().toLowerCase();
    const allowed = this.assignableMemberRoleOptions.map((option) => option.value);

    if (
      (normalized === 'admin' || normalized === 'manager' || normalized === 'member') &&
      allowed.includes(normalized as ManageTeamMemberRole)
    ) {
      return normalized as ManageTeamMemberRole;
    }

    return this.defaultInviteMemberRole;
  }

  private getUserEmailFromToken(token: string | null): string | null {
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = payload?.['email'];
    const storedEmail = typeof localStorage !== 'undefined'
      ? localStorage.getItem('user_email')
      : null;
    return this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
  }

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  private showSuccessToast(message: string): void {
    this.submitFeedback = { type: 'success', message };
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
    }
    this.successToastTimer = setTimeout(() => {
      if (this.submitFeedback?.type === 'success') {
        this.submitFeedback = null;
        this.cdr.detectChanges();
      }
    }, 3000);
  }
}

type RequestRecord = {
  id?: string;
  target?: unknown;
  Target?: unknown;
  requested_for_user?: unknown;
  requested_for_email?: string;
  requested_for_phone?: string;
  required_state?: string;
  response_status?: string;
  timestamp?: string;
};

type RequestRow = {
  target: string;
  required_state: string;
  status: 'Approved' | 'Pending' | 'Denied';
  timestamp: string;
};

type RoleAssignmentSummary = {
  successCount: number;
  failedCount: number;
  errorMessage: string;
};
