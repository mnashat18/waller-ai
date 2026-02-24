import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, take, timeout } from 'rxjs/operators';
import {
  CreateRequestModalComponent,
  type CreateRequestForm,
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
import { AuthService } from '../../services/auth';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateRequestModalComponent],
  templateUrl: './requests.html',
  styleUrl: './requests.css',
})
export class Requests implements OnInit, OnDestroy {
  readonly maxRecipientEmails = 5;
  readonly dailyRequestLimit: number;
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

  hasBusinessAccess = false;
  canViewRequestCenter = true;
  canViewAllBusinessRequests = false;
  canCreateRequests = false;
  canOpenBusinessCenter = false;
  canAssignMemberRole = false;

  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;

  requestStats = {
    total: 0,
    pending: 0,
    approved: 0,
    denied: 0
  };
  todayRequestCount = 0;

  private successToastTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyResultRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly accessTimeoutMs = 15000;
  private readonly postAuthRetryDelaysMs = [900, 1800, 3000];
  private recoveringSession = false;
  private currentAccessUserId: string | null = null;
  private currentMemberRole: BusinessMemberRole | null = null;
  private currentBusinessProfileId: string | null = null;
  private optimisticRequests = new Map<string, RequestRow>();

  constructor(
    private http: HttpClient,
    private businessCenter: BusinessCenterService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.dailyRequestLimit = this.businessCenter.dailyRequestLimit;
  }

  ngOnInit() {
    this.loadPlanAccess();
  }

  ngOnDestroy() {
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
      this.successToastTimer = null;
    }
    if (this.emptyResultRetryTimer) {
      clearTimeout(this.emptyResultRetryTimer);
      this.emptyResultRetryTimer = null;
    }
  }

  // ===============================
  // UI Helpers
  // ===============================

  badgeClass(state: string): string {
    const s = (state ?? '').toLowerCase();
    if (s.includes('stable')) return 'badge-stable';
    if (s.includes('focus')) return 'badge-low';
    if (s.includes('fatigue')) return 'badge-fatigue';
    if (s.includes('risk')) return 'badge-risk';
    return '';
  }

  dailyRequestsRemaining(): number {
    return Math.max(0, this.dailyRequestLimit - this.todayRequestCount);
  }

  maxRecipientsForCurrentDay(): number {
    const remaining = this.dailyRequestsRemaining();
    if (remaining <= 0) {
      return 1;
    }
    return Math.min(this.maxRecipientEmails, remaining);
  }

  openCreateModal() {
    if (!this.canCreateRequests) return;
    const remaining = this.dailyRequestsRemaining();
    if (remaining <= 0) {
      this.submitFeedback = {
        type: 'error',
        message: `Daily limit reached. You can send up to ${this.dailyRequestLimit} requests per day.`
      };
      this.cdr.detectChanges();
      return;
    }
    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

  // ===============================
  // Create Request (Optimistic)
  // ===============================

  handleCreateRequest(form: CreateRequestForm) {
    if (!this.canCreateRequests) {
      this.submitFeedback = {
        type: 'error',
        message: 'You do not have permission to create requests.'
      };
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

    const remaining = this.dailyRequestsRemaining();
    if (remaining <= 0) {
      this.submitFeedback = {
        type: 'error',
        message: `Daily limit reached. You can send up to ${this.dailyRequestLimit} requests per day.`
      };
      this.cdr.detectChanges();
      return;
    }
    if (uniqueEmails.length > remaining) {
      this.submitFeedback = {
        type: 'error',
        message: `You can send ${remaining} more request(s) today. Reduce recipients and try again.`
      };
      this.cdr.detectChanges();
      return;
    }

    const token = this.getUserToken();
    if (!token) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.cdr.detectChanges();
      return;
    }

    const currentUserEmail = this.getUserEmailFromToken(token);
    if (currentUserEmail && uniqueEmails.some((email) => email === currentUserEmail)) {
      this.submitFeedback = { type: 'error', message: 'You cannot send a request to yourself.' };
      this.cdr.detectChanges();
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending requests...' };
    this.cdr.detectChanges();

    const optimisticRows = uniqueEmails.map((email) =>
      this.buildOptimisticRow(email, requiredState)
    );

    for (const row of optimisticRows) {
      this.optimisticRequests.set(row.id, row);
    }
    this.requests = this.mergeRequestRows(this.requests, optimisticRows);
    this.updateStats();
    this.showCreateModal = false;
    this.cdr.detectChanges();

    const createCalls = uniqueEmails.map((email) =>
      this.businessCenter.createScanRequest({
        requested_for_email: email,
        required_state: requiredState
      }, this.currentBusinessProfileId).pipe(
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
        const summary = this.processCreateResults(results, uniqueEmails, optimisticRows);
        if (!summary.successEmails.length) {
          this.submittingRequest = false;
          this.submitFeedback = {
            type: 'error',
            message: summary.firstError || 'Failed to send request.'
          };
          this.cdr.detectChanges();
          return;
        }

        if (this.canAssignMemberRole && this.currentBusinessProfileId) {
          this.assignRoleToRecipients(summary.successEmails, selectedMemberRole).subscribe((roleResult) => {
            this.completeRequestSubmit(summary.successCount, summary.failedCount, summary.firstError, roleResult);
          });
          return;
        }

        this.completeRequestSubmit(summary.successCount, summary.failedCount, summary.firstError);
      },
      error: (err: unknown) => {
        this.rollbackOptimisticRows(optimisticRows);
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

    const hasRoleFailure = Boolean(roleResult && roleResult.failedCount > 0);
    if (failedCount === 0 && !hasRoleFailure) {
      this.showSuccessToast(fullMessage);
    } else {
      this.submitFeedback = { type: 'info', message: fullMessage };
    }

    this.cdr.detectChanges();
    setTimeout(() => this.loadRequests(true), 1200);
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
      this.businessCenter.upsertTeamMember(profileId, email, role, this.currentMemberRole).pipe(
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

  private processCreateResults(
    results: CreateScanRequestResult[],
    recipientEmails: string[],
    optimisticRows: RequestRow[]
  ): CreateRequestSummary {
    let successCount = 0;
    let failedCount = 0;
    let firstError = '';
    const successEmails: string[] = [];

    results.forEach((result, index) => {
      const optimistic = optimisticRows[index];
      if (!optimistic) {
        return;
      }

      if (result?.ok) {
        successCount += 1;
        successEmails.push(recipientEmails[index]);

        const createdId = this.normalizeId(result?.id);
        if (createdId) {
          this.promoteOptimisticRequestId(optimistic.id, createdId);
        }
        return;
      }

      failedCount += 1;
      if (!firstError) {
        firstError = result?.message || 'Failed to send request.';
      }
      this.dropOptimisticRequest(optimistic.id);
    });

    this.requests = this.mergeRequestRows(this.requests, Array.from(this.optimisticRequests.values()));
    this.updateStats();

    return {
      successCount,
      failedCount,
      firstError,
      successEmails
    };
  }

  private rollbackOptimisticRows(rows: RequestRow[]): void {
    for (const row of rows) {
      this.dropOptimisticRequest(row.id);
    }
    this.requests = this.mergeRequestRows(this.requests, Array.from(this.optimisticRequests.values()));
    this.updateStats();
  }

  private buildOptimisticRow(email: string, requiredState: RequiredState): RequestRow {
    const optimisticId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `tmp_${crypto.randomUUID()}`
        : `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timestampRaw = new Date().toISOString();

    return {
      id: optimisticId,
      target: email,
      required_state: requiredState,
      response_status: 'Pending',
      timestamp: this.formatTimestamp(timestampRaw),
      timestampRaw
    };
  }

  private showSuccessToast(message: string) {
    this.submitFeedback = { type: 'success', message };

    if (this.successToastTimer) clearTimeout(this.successToastTimer);

    this.successToastTimer = setTimeout(() => {
      if (this.submitFeedback?.type === 'success') {
        this.submitFeedback = null;
        this.cdr.detectChanges();
      }
    }, 2500);
  }

  // ===============================
  // Loading
  // ===============================

  private loadPlanAccess() {
    this.loadingPlanAccess = true;

    this.businessCenter.getHubAccessState().pipe(
      timeout(this.accessTimeoutMs),
      catchError(() => of(null))
    ).subscribe((state) => {
      if (!state) {
        this.hasBusinessAccess = false;
        this.canViewRequestCenter = true;
        this.canViewAllBusinessRequests = false;
        this.canCreateRequests = false;
        this.canOpenBusinessCenter = false;
        this.canAssignMemberRole = false;
        this.currentAccessUserId = null;
        this.currentMemberRole = null;
        this.currentBusinessProfileId = null;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.syncAssignableMemberRoleOptions();
        this.loadingPlanAccess = false;
        this.loadRequests(true);
        return;
      }

      this.hasBusinessAccess = Boolean(state.hasPaidAccess);
      this.currentAccessUserId = this.normalizeId(state.userId);
      this.currentMemberRole = this.normalizeBusinessRole(state.memberRole);
      this.currentBusinessProfileId = this.normalizeId(state.profile?.id);
      this.canViewAllBusinessRequests = this.hasBusinessAccess && this.currentMemberRole === 'owner';
      this.canViewRequestCenter = true;

      const hasWritableRequestAccess =
        this.canViewAllBusinessRequests &&
        Boolean(state.permissions?.canUseSystem) &&
        !Boolean(state.permissions?.isReadOnly) &&
        !Boolean(state.trialExpired);

      this.canCreateRequests = hasWritableRequestAccess;
      this.canOpenBusinessCenter =
        this.canViewAllBusinessRequests;
      this.canAssignMemberRole =
        hasWritableRequestAccess &&
        Boolean(state.permissions?.canManageMembers) &&
        Boolean(this.currentBusinessProfileId);

      this.syncAssignableMemberRoleOptions();

      const billingStatus = (state.profile?.billing_status ?? '').toString().trim().toLowerCase();
      const trialDaysRemaining = this.daysUntil(state.trialExpiresAt);
      const trialActive = billingStatus === 'trial' && !state.trialExpired;

      if (trialActive && trialDaysRemaining !== null && trialDaysRemaining > 0) {
        this.businessTrialNotice = `Create requests is a paid Business feature, free for ${trialDaysRemaining} day(s) left.`;
        this.businessInviteTrialNotice = `Email invites are a paid Business feature, free for ${trialDaysRemaining} day(s) left.`;
      } else if (trialActive) {
        this.businessTrialNotice = 'Create requests is a paid Business feature, currently unlocked in your trial.';
        this.businessInviteTrialNotice = 'Email invites are a paid Business feature, currently unlocked in your trial.';
      } else {
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
      }

      this.loadingPlanAccess = false;
      this.loadRequests(true);
    });
  }

  private loadRequests(bustCache = false, retryAttempt = 0) {
    const token = this.getUserToken();
    const headers = this.buildAuthHeaders(token);

    if (!headers) {
      this.tryRecoverSessionAndReload();
      this.requests = this.mergeRequestRows([], Array.from(this.optimisticRequests.values()));
      this.updateStats();
      this.cdr.detectChanges();
      return;
    }

    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: '50',
      fields: [
        'id',
        'requested_for_email',
        'requested_for_phone',
        'requested_for_user',
        'requested_by_user',
        'business_profile',
        'required_state',
        'response_status',
        'timestamp'
      ].join(',')
    });

    if (bustCache) params.set('_', Date.now().toString());

    const useBusinessScope = this.hasBusinessAccess && this.canViewAllBusinessRequests;

    if (useBusinessScope) {
      if (!this.currentBusinessProfileId) {
        this.requests = this.mergeRequestRows([], Array.from(this.optimisticRequests.values()));
        this.updateStats();
        this.submitFeedback = {
          type: 'error',
          message: 'Business profile is missing. Refresh Business access and try again.'
        };
        this.cdr.detectChanges();
        return;
      }
      params.set('filter[business_profile][_eq]', this.currentBusinessProfileId);
    } else {
      const userId = this.resolveCurrentUserId(token);
      const userEmail = this.getUserEmailFromToken(token);

      if (!userId && !userEmail) {
        this.tryRecoverSessionAndReload();
        this.requests = this.mergeRequestRows([], Array.from(this.optimisticRequests.values()));
        this.updateStats();
        this.cdr.detectChanges();
        return;
      }

      if (userId && userEmail) {
        params.set('filter[_or][0][requested_for_user][_eq]', userId);
        params.set('filter[_or][1][requested_for_email][_eq]', userEmail);
        params.set('filter[_or][2][requested_by_user][_eq]', userId);
      } else if (userId) {
        params.set('filter[_or][0][requested_for_user][_eq]', userId);
        params.set('filter[_or][1][requested_by_user][_eq]', userId);
      } else if (userEmail) {
        params.set('filter[requested_for_email][_eq]', userEmail);
      }
    }

    this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      { headers, withCredentials: true }
    ).pipe(
      map(res => res.data ?? [])
    ).subscribe({
      next: data => {
        const remoteRows = data.map(r => this.mapToRow(r));
        this.reconcileOptimisticRequests(remoteRows);
        this.requests = this.mergeRequestRows(remoteRows, Array.from(this.optimisticRequests.values()));
        this.updateStats();
        this.cdr.detectChanges();

        if (!useBusinessScope && this.shouldRetryEmptyResult(remoteRows.length, retryAttempt)) {
          this.scheduleEmptyResultRetry(retryAttempt + 1);
        }
      },
      error: err => {
        console.error('Load requests error:', err);
        if (err?.status === 401 || err?.status === 403) {
          this.tryRecoverSessionAndReload();
        }
        this.requests = this.mergeRequestRows([], Array.from(this.optimisticRequests.values()));
        this.updateStats();
        this.cdr.detectChanges();
      }
    });
  }

  private scheduleEmptyResultRetry(nextAttempt: number): void {
    if (this.emptyResultRetryTimer) {
      clearTimeout(this.emptyResultRetryTimer);
      this.emptyResultRetryTimer = null;
    }

    const delayIndex = Math.max(0, Math.min(nextAttempt - 1, this.postAuthRetryDelaysMs.length - 1));
    const delayMs = this.postAuthRetryDelaysMs[delayIndex];
    this.emptyResultRetryTimer = setTimeout(() => {
      this.emptyResultRetryTimer = null;
      this.loadRequests(true, nextAttempt);
    }, delayMs);
  }

  private shouldRetryEmptyResult(totalRows: number, retryAttempt: number): boolean {
    if (totalRows > 0) {
      return false;
    }
    if (retryAttempt >= this.postAuthRetryDelaysMs.length) {
      return false;
    }
    return this.isRecentAuthWindow();
  }

  private isRecentAuthWindow(windowMs = 60000): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }

    if (sessionStorage.getItem('auth_callback_pending') === '1') {
      return true;
    }

    const raw = sessionStorage.getItem('auth_session_established_at');
    const ts = raw ? Number(raw) : NaN;
    if (!Number.isFinite(ts)) {
      return false;
    }

    const delta = Date.now() - ts;
    return delta >= 0 && delta <= windowMs;
  }

  private tryRecoverSessionAndReload(): void {
    if (this.recoveringSession) {
      return;
    }

    this.recoveringSession = true;
    this.auth.ensureSessionToken().pipe(
      take(1),
      catchError(() => of(false))
    ).subscribe((ok) => {
      this.recoveringSession = false;
      if (!ok) {
        return;
      }
      this.loadPlanAccess();
    });
  }

  // ===============================
  // Mapping + Stats
  // ===============================

  private mapToRow(r: RequestRecord): RequestRow {
    const timestampRaw = r.timestamp ?? '';
    return {
      id: this.normalizeId(r.id) ?? '',
      target: this.formatTarget(r),
      required_state: r.required_state ?? 'Unknown',
      response_status: r.response_status ?? 'Pending',
      timestamp: this.formatTimestamp(timestampRaw),
      timestampRaw
    };
  }

  private formatTarget(r: RequestRecord): string {
    if (r.requested_for_email) return r.requested_for_email;
    if (r.requested_for_phone) return r.requested_for_phone;
    if (typeof r.target === 'string') return r.target;
    if (typeof r.Target === 'string') return r.Target;
    return 'scan';
  }

  private formatTimestamp(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  private updateStats() {
    const normalize = (s?: string) => (s ?? '').toLowerCase();

    this.requestStats = {
      total: this.requests.length,
      pending: this.requests.filter(r => normalize(r.response_status).includes('pending')).length,
      approved: this.requests.filter(r => normalize(r.response_status).includes('approved')).length,
      denied: this.requests.filter(r => normalize(r.response_status).includes('denied')).length
    };

    this.todayRequestCount = this.businessCenter.countTodayRequests(
      this.requests.map((row) => ({ timestamp: row.timestampRaw }))
    );
  }

  // ===============================
  // Auth + Helpers
  // ===============================

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private getUserToken(): string | null {
    return (
      localStorage.getItem('token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_token')
    );
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

  private resolveCurrentUserId(token: string | null): string | null {
    if (this.currentAccessUserId) {
      return this.currentAccessUserId;
    }

    const tokenUserId = this.getUserIdFromToken(token);
    if (tokenUserId) {
      return tokenUserId;
    }

    if (typeof localStorage === 'undefined') {
      return null;
    }

    return this.normalizeId(localStorage.getItem('current_user_id'));
  }

  private getUserEmailFromToken(token: string | null): string | null {
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = payload?.['email'];
    const storedEmail =
      typeof localStorage !== 'undefined' ? localStorage.getItem('user_email') : null;
    return this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return this.isValidEmail(email) ? email : null;
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
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return (REQUIRED_STATE_OPTIONS as readonly string[]).includes(normalized)
      ? (normalized as RequiredState)
      : null;
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

  private promoteOptimisticRequestId(fromId: string, toId: string): void {
    const sourceId = this.normalizeId(fromId);
    const targetId = this.normalizeId(toId);
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const source = this.optimisticRequests.get(sourceId);
    if (source) {
      this.optimisticRequests.delete(sourceId);
      this.optimisticRequests.set(targetId, { ...source, id: targetId });
    }

    const idx = this.requests.findIndex((row) => row.id === sourceId);
    if (idx !== -1) {
      this.requests[idx] = {
        ...this.requests[idx],
        id: targetId
      };
    }
  }

  private dropOptimisticRequest(rowId: string): void {
    const id = this.normalizeId(rowId);
    if (!id) {
      return;
    }
    this.optimisticRequests.delete(id);
    this.requests = this.requests.filter((row) => row.id !== id);
  }

  private reconcileOptimisticRequests(remoteRows: RequestRow[]): void {
    const remoteIds = new Set(
      (remoteRows ?? [])
        .map((row) => this.normalizeId(row?.id))
        .filter((value): value is string => Boolean(value))
    );

    for (const [key, optimistic] of Array.from(this.optimisticRequests.entries())) {
      if (remoteIds.has(key)) {
        this.optimisticRequests.delete(key);
        continue;
      }

      if (!this.isTempRequestId(key)) {
        continue;
      }

      const optimisticTarget = this.normalizeEmail(optimistic.target) ?? this.normalizeLooseText(optimistic.target);
      const optimisticState = this.normalizeLooseText(optimistic.required_state);
      const optimisticTs = this.timestampMs(optimistic.timestampRaw);

      const matched = (remoteRows ?? []).some((row) => {
        const remoteTarget = this.normalizeEmail(row?.target) ?? this.normalizeLooseText(row?.target);
        const remoteState = this.normalizeLooseText(row?.required_state);
        if (!optimisticTarget || optimisticTarget !== remoteTarget || optimisticState !== remoteState) {
          return false;
        }
        const remoteTs = this.timestampMs(row?.timestampRaw);
        return Math.abs(remoteTs - optimisticTs) <= 2 * 60 * 1000;
      });

      if (matched) {
        this.optimisticRequests.delete(key);
      }
    }
  }

  private mergeRequestRows(baseRows: RequestRow[], extraRows: RequestRow[]): RequestRow[] {
    const byId = new Map<string, RequestRow>();
    const push = (row: RequestRow | null | undefined) => {
      const id = this.normalizeId(row?.id);
      if (!id) {
        return;
      }
      const normalized = {
        ...row,
        id,
        target: row?.target ?? '-',
        required_state: row?.required_state ?? 'Unknown',
        response_status: row?.response_status ?? 'Pending',
        timestampRaw: row?.timestampRaw ?? '',
        timestamp: row?.timestamp ?? this.formatTimestamp(row?.timestampRaw ?? '')
      } as RequestRow;

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, normalized);
        return;
      }

      const existingTs = this.timestampMs(existing.timestampRaw);
      const nextTs = this.timestampMs(normalized.timestampRaw);
      if (nextTs >= existingTs) {
        byId.set(id, { ...existing, ...normalized, id });
      }
    };

    for (const row of baseRows ?? []) push(row);
    for (const row of extraRows ?? []) push(row);

    return Array.from(byId.values()).sort((a, b) =>
      this.timestampMs(b.timestampRaw) - this.timestampMs(a.timestampRaw)
    );
  }

  private timestampMs(value: unknown): number {
    const input = typeof value === 'string' ? value : '';
    const ts = input ? new Date(input).getTime() : NaN;
    return Number.isNaN(ts) ? 0 : ts;
  }

  private normalizeLooseText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim().toLowerCase();
    }
    return '';
  }

  private isTempRequestId(id: string): boolean {
    return id.startsWith('tmp_');
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

  private describeHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      '';

    if (status >= 500) return `Server error (${status}): ${detail || fallback}`;
    if (status >= 400) return `Request error (${status}): ${detail || fallback}`;
    return detail || fallback;
  }

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }
}

type RequestRecord = {
  id?: unknown;
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
  id: string;
  target: string;
  required_state: string;
  response_status: string;
  timestamp: string;
  timestampRaw: string;
};

type CreateRequestSummary = {
  successCount: number;
  failedCount: number;
  firstError: string;
  successEmails: string[];
};

type RoleAssignmentSummary = {
  successCount: number;
  failedCount: number;
  errorMessage: string;
};
