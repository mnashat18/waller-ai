import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, switchMap, take, timeout } from 'rxjs/operators';
import {
  ActivityQueryOptions,
  ActivityEventRecord,
  BusinessCenterService,
  BusinessHubAccessState,
  BusinessMemberRole,
  BusinessProfileMember,
  CreateScanRequestResult,
  ManageTeamMemberRole,
  ReportExportRecord,
  RequestInviteRecord,
  RequestRecord
} from '../../services/business-center.service';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type InviteMetrics = {
  pending: number;
  sent: number;
  claimed: number;
  expired: number;
};

type RequiredState = 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk';
const REQUIRED_STATE_OPTIONS: readonly RequiredState[] = [
  'Stable',
  'Low Focus',
  'Elevated Fatigue',
  'High Risk'
];

type ExportScope = 'team' | 'selected';

type ExportSelection = {
  scope: ExportScope;
  userIds: string[];
  labels: string[];
};

@Component({
  selector: 'app-business-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './business-center.html',
  styleUrl: './business-center.css'
})
export class BusinessCenterComponent implements OnInit, OnDestroy {
  loadingAccess = true;
  loadingData = false;

  hasBusinessAccess = false;
  missingBusinessProfile = false;

  accessReason = '';
  memberRoleLabel = '';

  canInvite = false;
  canUpgrade = false;
  canManageMembers = false;
  canUseSystem = false;
  isReadOnly = true;

  trialDaysRemaining: number | null = null;
  private readonly accessStateTimeoutMs = 15000;
  private readonly actionTimeoutMs = 15000;

  feedback: Feedback | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private memberSubmitFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
  private accessLoadFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
  private businessDataFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
  private accessResolveRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private accessResolveRetryAttempts = 0;
  private readonly maxAccessResolveRetryAttempts = 2;
  private teamMembersRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyModulesRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyModulesRetryAttempt = 0;
  private readonly maxEmptyModulesRetryAttempts = 1;
  private businessDataLoadSeq = 0;

  accessState: BusinessHubAccessState | null = null;
  orgScopeNote = '';

  // Keep profile loosely typed so template rendering stays safe on partial records.
  profile: any = null;

  teamMembers: any[] = [];
  requests: any[] = [];
  requestInvites: any[] = [];
  reportExports: any[] = [];
  activityEvents: ActivityEventRecord[] = [];
  filteredActivityEvents: ActivityEventRecord[] = [];
  private optimisticRequests = new Map<string, RequestRecord>();

  inviteMetrics: InviteMetrics = {
    pending: 0,
    sent: 0,
    claimed: 0,
    expired: 0
  };

  upgradeSubmitting = false;
  exportSubmitting = false;
  requestSubmitting = false;
  memberSubmitting = false;
  showTeamMemberManager = false;
  teamMembersLoading = false;
  readonly dailyRequestLimit: number;
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;
  todayRequestCount = 0;
  private currentMemberRole: BusinessMemberRole | null = null;

  readonly memberRoleOptions: Array<{ value: ManageTeamMemberRole; label: string }> = [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'member', label: 'Member' }
  ];
  assignableMemberRoleOptions: Array<{ value: ManageTeamMemberRole; label: string }> = [];

  teamMemberForm: {
    email: string;
    role: ManageTeamMemberRole;
  } = {
    email: '',
    role: 'member'
  };

  exportForm = {
    format: 'csv' as 'csv' | 'pdf',
    scope: 'team' as ExportScope,
    filters: '',
    selectedMemberIds: [] as string[]
  };

  requestForm: {
    recipientEmails: string[];
    requiredState: RequiredState | '';
  } = {
    recipientEmails: [''],
    requiredState: ''
  };

  constructor(private businessCenter: BusinessCenterService) {
    this.dailyRequestLimit = this.businessCenter.dailyRequestLimit;
  }

  ngOnInit(): void {
    this.assignableMemberRoleOptions = [...this.memberRoleOptions];
    // Use cached hub state first so first navigation renders immediately, then revalidate in background.
    this.loadAccessState(false);
  }

  ngOnDestroy(): void {
    this.clearFeedbackTimer();
    this.clearMemberSubmitFailSafeTimer();
    this.clearAccessLoadFailSafeTimer();
    this.clearAccessResolveRetryTimer();
    this.clearBusinessDataFailSafeTimer();
    this.clearTeamMembersRetryTimer();
    this.clearEmptyModulesRetryTimer();
  }

  // ===============================
  // Template safe helpers
  // ===============================

  safeProfile(key: string): any {
    return this.profile ? this.profile[key] : null;
  }

  requestRecipient(req: any): string {
    return req?.recipient || req?.requested_for_email || req?.requested_for_phone || '-';
  }

  requestTarget(req: any): string {
    return req?.target || req?.Target || 'scan';
  }

  // ===============================
  // UI Labels
  // ===============================

  formatDate(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  accessBadgeLabel(): string {
    if (this.loadingAccess) {
      return 'Plan: Loading...';
    }
    if (!this.profile) {
      return 'Plan: -';
    }

    const plan = (this.profile?.plan_code ?? 'free').toString().trim().toLowerCase();
    return plan === 'business' ? 'Plan: Business' : 'Plan: Free';
  }

  roleBadgeLabel(): string {
    if (this.loadingAccess) {
      return 'Role: Loading...';
    }
    return `Role: ${this.memberRoleLabel || '-'}`;
  }

  hasOrgScope(): boolean {
    return Boolean(this.pickId(this.accessState?.orgId));
  }

  formatBoolean(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      return value === 1 ? 'true' : value === 0 ? 'false' : '-';
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return 'true';
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return 'false';
      }
    }
    return '-';
  }

  trialBadgeLabel(): string {
    if (typeof this.trialDaysRemaining !== 'number') return '';
    if (this.trialDaysRemaining <= 1) return 'Trial ends today';
    return `${this.trialDaysRemaining}d trial left`;
  }

  requestStatusLabel(status?: string | null): string {
    const normalized = this.normalizeLooseText(status);
    if (normalized.includes('approved') || normalized.includes('accepted')) return 'Approved';
    if (normalized.includes('denied') || normalized.includes('rejected')) return 'Denied';
    return 'Pending';
  }

  canCreateRequestsFromCenter(): boolean {
    return this.hasBusinessAccess && this.canUseSystem && !this.isReadOnly;
  }

  dailyRequestsRemaining(): number {
    return Math.max(0, this.dailyRequestLimit - this.todayRequestCount);
  }

  inviteStatusLabel(invite: any): 'Pending' | 'Sent' | 'Claimed' | 'Expired' {
    if (invite?.claimed_at) return 'Claimed';

    const expiresAt = invite?.expires_at ? new Date(invite.expires_at).getTime() : NaN;
    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) return 'Expired';

    const normalized = this.normalizeLooseText(invite?.status);
    if (normalized.includes('claim')) return 'Claimed';
    if (normalized.includes('expire')) return 'Expired';
    if (normalized.includes('send')) return 'Sent';
    return 'Pending';
  }

  trackById(index: number, row: any): string {
    return row?.id ?? String(index);
  }

  exportMemberLabel(member: any): string {
    return member?.user_label || member?.user_id || '-';
  }

  selectedExportMembersCount(): number {
    return this.resolveExportSelection(false).userIds.length;
  }

  isExportMemberSelected(member: any): boolean {
    const memberId = this.pickId(member?.user_id);
    if (!memberId) {
      return false;
    }
    return this.exportForm.selectedMemberIds.includes(memberId);
  }

  setExportMemberSelection(member: any, checked: boolean): void {
    const memberId = this.pickId(member?.user_id);
    if (!memberId) {
      return;
    }

    const set = new Set(this.exportForm.selectedMemberIds);
    if (checked) {
      set.add(memberId);
    } else {
      set.delete(memberId);
    }
    this.exportForm.selectedMemberIds = Array.from(set);
    this.refreshFilteredActivityEvents();
  }

  selectAllExportMembers(): void {
    this.exportForm.selectedMemberIds = this.allTeamUserIds();
    this.refreshFilteredActivityEvents();
  }

  clearExportMemberSelection(): void {
    this.exportForm.selectedMemberIds = [];
    this.refreshFilteredActivityEvents();
  }

  onExportScopeChanged(): void {
    if (this.exportForm.scope === 'selected' && !this.exportForm.selectedMemberIds.length) {
      this.exportForm.selectedMemberIds = this.allTeamUserIds();
    }
    this.refreshFilteredActivityEvents();
  }

  // ===============================
  // Actions
  // ===============================

  submitUpgradeRequest(): void {
    if (!this.canUpgrade) {
      this.showFeedback('error', 'Only owner can submit upgrade requests.');
      return;
    }

    const orgId = this.accessState?.orgId ?? null;
    this.upgradeSubmitting = true;
    this.showFeedback('info', 'Submitting upgrade request...');

    this.businessCenter.submitUpgradeRequest(orgId, {
      profile: this.profile
    }).pipe(
      finalize(() => (this.upgradeSubmitting = false))
    ).subscribe((res: any) => {
      this.showFeedback(res?.ok ? 'success' : 'error', res?.message || 'Upgrade request finished.');
    });
  }

  submitExportRequest(): void {
    if (!this.hasBusinessAccess || !this.canUseSystem || this.isReadOnly) {
      this.showFeedback('error', 'Your company role cannot create export jobs.');
      return;
    }

    const selection = this.resolveExportSelection(true);
    if (this.exportForm.scope === 'selected' && !selection.userIds.length) {
      this.showFeedback('error', 'Select at least one team member before creating a separate report.');
      return;
    }

    this.exportSubmitting = true;
    this.showFeedback('info', `Preparing ${this.exportForm.format.toUpperCase()} export locally...`);

    try {
      if (this.exportForm.format === 'pdf') {
        this.downloadActivityPdfNow();
      } else {
        this.downloadActivityCsvNow();
      }
    } finally {
      this.exportSubmitting = false;
    }
  }

  downloadActivityCsvNow(): void {
    const selection = this.resolveExportSelection(true);
    if (this.exportForm.scope === 'selected' && !selection.userIds.length) {
      this.showFeedback('error', 'Select at least one team member before exporting.');
      return;
    }

    const rows = this.eventsForSelection(selection);
    if (!rows.length) {
      this.showFeedback('error', 'No activity events found for the selected scope.');
      return;
    }

    const header = ['Actor', 'Action', 'Entity', 'Target', 'Date'];
    const lines = rows.map((event) => [
      event.actor_label ?? '-',
      event.action ?? '-',
      `${event.entity_type ?? '-'} #${event.entity_id ?? '-'}`,
      event.target_user_label ?? '-',
      this.formatDate(event.date_created)
    ]);

    const csv = [
      header.map((cell) => this.escapeCsvCell(cell)).join(','),
      ...lines.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(','))
    ].join('\r\n');

    this.downloadTextFile(
      csv,
      `activity-report-${this.todayDateKey()}-${this.exportForm.scope}.csv`,
      'text/csv;charset=utf-8;'
    );
    this.showFeedback('success', `CSV exported (${rows.length} events).`);
  }

  downloadActivityPdfNow(): void {
    const selection = this.resolveExportSelection(true);
    if (this.exportForm.scope === 'selected' && !selection.userIds.length) {
      this.showFeedback('error', 'Select at least one team member before exporting.');
      return;
    }

    const rows = this.eventsForSelection(selection);
    if (!rows.length) {
      this.showFeedback('error', 'No activity events found for the selected scope.');
      return;
    }

    if (typeof window === 'undefined') {
      this.showFeedback('error', 'PDF export is only available in browser sessions.');
      return;
    }

    const scopeLabel = selection.scope === 'selected' ? 'Selected Members' : 'Entire Team';
    const generatedAt = this.formatDate(new Date().toISOString());

    const lines: string[] = [
      'Business Activity Report',
      `Scope: ${scopeLabel}`,
      `Generated at: ${generatedAt}`,
      `Events: ${rows.length}`,
      '',
      'Actor | Action | Entity | Target | Date'
    ];

    for (const event of rows) {
      const line = [
        event.actor_label ?? '-',
        event.action ?? '-',
        `${event.entity_type ?? '-'} #${event.entity_id ?? '-'}`,
        event.target_user_label ?? '-',
        this.formatDate(event.date_created)
      ].join(' | ');

      const wrapped = this.wrapPdfLine(line, 108);
      lines.push(...wrapped);
    }

    const pdfData = this.buildSimplePdfDocument(lines);
    this.downloadBlobFile(
      new Blob([pdfData], { type: 'application/pdf' }),
      `activity-report-${this.todayDateKey()}-${this.exportForm.scope}.pdf`
    );
    this.showFeedback('success', `PDF exported (${rows.length} events).`);
  }

  addRecipientEmailField(): void {
    const rows = this.requestForm.recipientEmails;
    if (!rows.length || rows[rows.length - 1].trim()) {
      this.requestForm.recipientEmails = [...rows, ''];
      return;
    }
    this.showFeedback('info', 'Enter the current email first, then add another one.');
  }

  removeRecipientEmailField(index: number): void {
    if (this.requestForm.recipientEmails.length <= 1) {
      this.requestForm.recipientEmails = [''];
      return;
    }

    this.requestForm.recipientEmails = this.requestForm.recipientEmails.filter((_, i) => i !== index);
  }

  submitRequests(): void {
    if (!this.canCreateRequestsFromCenter()) {
      this.showFeedback('error', 'Your role cannot create requests.');
      return;
    }

    const requiredState = this.normalizeRequiredState(this.requestForm.requiredState);
    if (!requiredState) {
      this.showFeedback('error', 'Select a required state.');
      return;
    }

    const normalizedEmails = this.requestForm.recipientEmails
      .map((email) => this.normalizeEmail(email))
      .filter((email) => Boolean(email));

    if (!normalizedEmails.length) {
      this.showFeedback('error', 'Enter at least one recipient email.');
      return;
    }

    const invalidEmail = normalizedEmails.find((email) => !this.isValidEmail(email));
    if (invalidEmail) {
      this.showFeedback('error', `Invalid email: ${invalidEmail}`);
      return;
    }

    const uniqueEmails = Array.from(new Set(normalizedEmails));
    const currentUserEmail = this.currentUserEmail();
    if (currentUserEmail && uniqueEmails.some((email) => email === currentUserEmail)) {
      this.showFeedback('error', 'You cannot send a request to yourself.');
      return;
    }

    const remaining = this.dailyRequestsRemaining();
    if (remaining <= 0) {
      this.showFeedback('error', `Daily limit reached. You can send up to ${this.dailyRequestLimit} requests per day.`);
      return;
    }
    if (uniqueEmails.length > remaining) {
      this.showFeedback(
        'error',
        `You can send ${remaining} more request(s) today. Reduce recipients and try again.`
      );
      return;
    }

    this.requestSubmitting = true;
    this.showFeedback('info', 'Sending requests...');

    const optimisticRows = uniqueEmails.map((email) =>
      this.createOptimisticRequestRow(email, requiredState)
    );
    this.requests = this.mergeRequestRows(this.requests, optimisticRows);
    this.syncDailyRequestCountFromRequests(this.requests);
    this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);

    const requestCalls = uniqueEmails.map((email) =>
      this.businessCenter.createScanRequest({
        requested_for_email: email,
        required_state: requiredState
      }, this.accessState?.orgId ?? null)
    );

    forkJoin(requestCalls).pipe(
      finalize(() => (this.requestSubmitting = false))
    ).subscribe((results: CreateScanRequestResult[]) => {
      const succeeded = results.filter((item) => item?.ok);
      const failed = results.filter((item) => !item?.ok);
      const fallbackError = failed[0]?.message || 'Failed to send requests.';

      results.forEach((result, index) => {
        const optimistic = optimisticRows[index];
        if (!optimistic) return;

        const optimisticId = this.pickId(optimistic.id);
        if (!optimisticId) return;

        if (!result?.ok) {
          this.dropOptimisticRequest(optimisticId);
          return;
        }

        const createdId = this.pickId(result?.id);
        if (createdId) {
          this.promoteOptimisticRequestId(optimisticId, createdId);
        }
      });

      this.requests = this.mergeRequestRows(this.requests, Array.from(this.optimisticRequests.values()));
      this.syncDailyRequestCountFromRequests(this.requests);
      this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);

      if (!succeeded.length) {
        this.showFeedback('error', fallbackError);
        return;
      }

      this.requestForm = {
        recipientEmails: [''],
        requiredState: ''
      };

      if (!failed.length) {
        this.showFeedback('success', `Sent ${succeeded.length} request(s) successfully.`);
      } else {
        this.showFeedback(
          'info',
          `Sent ${succeeded.length} request(s). ${failed.length} failed.`
        );
      }

      setTimeout(() => this.reloadRequestsAndInvites(), 1200);
    });
  }

  toggleTeamMemberManager(): void {
    if (!this.canManageMembers || this.isReadOnly) {
      this.showFeedback('error', 'Your role cannot manage team members.');
      return;
    }
    this.showTeamMemberManager = !this.showTeamMemberManager;
  }

  submitTeamMember(): void {
    if (!this.canManageMembers || this.isReadOnly) {
      this.showFeedback('error', 'Your role cannot manage team members.');
      return;
    }

    const profileId = this.pickId(this.profile?.id);
    if (!profileId) {
      this.showFeedback('error', 'Business profile is missing.');
      return;
    }

    const email = this.normalizeEmail(this.teamMemberForm.email);
    if (!this.isValidEmail(email)) {
      this.showFeedback('error', 'Enter a valid member email.');
      return;
    }

    const role = this.teamMemberForm.role;
    if (!this.assignableMemberRoleOptions.some((item) => item.value === role)) {
      this.showFeedback('error', 'Select a valid role.');
      return;
    }

    this.memberSubmitting = true;
    this.showFeedback('info', 'Saving team member...');
    this.clearMemberSubmitFailSafeTimer();
    this.memberSubmitFailSafeTimer = setTimeout(() => {
      if (!this.memberSubmitting) return;
      this.memberSubmitting = false;
      this.showFeedback(
        'error',
        'Saving team member took too long. Check network and Business permissions, then try again.'
      );
    }, this.actionTimeoutMs + 1500);

    this.businessCenter.upsertTeamMember(profileId, email, role, this.currentMemberRole).pipe(
      timeout(this.actionTimeoutMs),
      catchError((err) =>
        of({
          ok: false,
          message: this.describeHttpError(err, 'Saving team member timed out. Please try again.')
        })
      ),
      finalize(() => {
        this.memberSubmitting = false;
        this.clearMemberSubmitFailSafeTimer();
      })
    ).subscribe((res: any) => {
      this.showFeedback(res?.ok ? 'success' : 'error', res?.message || 'Member update finished.');
      if (!res?.ok) return;

      this.upsertOptimisticTeamMember(email, role);
      this.teamMemberForm.email = '';
      this.teamMemberForm.role = 'member';
      setTimeout(() => this.reloadTeamMembers(), 700);
    });
  }

  // ===============================
  // Loading
  // ===============================

  private loadAccessState(forceRefresh = false): void {
    this.loadingAccess = true;
    this.loadingData = false;
    this.missingBusinessProfile = false;
    this.orgScopeNote = '';
    this.memberRoleLabel = '';
    this.accessReason = '';
    this.clearAccessResolveRetryTimer();
    if (!forceRefresh) {
      this.accessResolveRetryAttempts = 0;
    }
    this.emptyModulesRetryAttempt = 0;
    this.clearEmptyModulesRetryTimer();

    this.clearAccessLoadFailSafeTimer();
    this.accessLoadFailSafeTimer = setTimeout(() => {
      if (!this.loadingAccess) return;
      this.loadingAccess = false;
      this.hasBusinessAccess = false;
      this.missingBusinessProfile = false;
      if (!this.accessReason) {
        this.accessReason = 'Loading Business access took too long. Please refresh and try again.';
      }
      this.showFeedback('error', this.accessReason, true);
    }, this.accessStateTimeoutMs + 1500);

    const cachedState = forceRefresh ? null : this.businessCenter.getCachedHubAccessState();
    const shouldForceRefresh = forceRefresh || Boolean(cachedState);
    if (cachedState) {
      this.loadingAccess = false;
      this.clearAccessLoadFailSafeTimer();
      try {
        this.applyResolvedAccessState(cachedState);
      } catch (err) {
        this.hasBusinessAccess = false;
        this.clearBusinessData();
        this.showFeedback(
          'error',
          this.describeHttpError(err, 'Unexpected error while preparing Business Center.')
        );
      }
    }

    let accessState$: Observable<BusinessHubAccessState>;
    try {
      accessState$ = this.businessCenter.getHubAccessState(shouldForceRefresh);
    } catch (err) {
      accessState$ = of({
        userId: null,
        orgId: null,
        profile: null,
        membership: null,
        hasPaidAccess: false,
        memberRole: null,
        permissions: {
          canInvite: false,
          canUpgrade: false,
          canManageMembers: false,
          canUseSystem: false,
          isReadOnly: true
        },
        trialExpired: false,
        trialExpiresAt: null,
        reason: this.describeHttpError(err, 'Failed to load Business profile and access state.')
      } as BusinessHubAccessState);
    }

    accessState$.pipe(
      timeout(this.accessStateTimeoutMs),
      take(1),
      catchError((err) =>
        of({
          userId: null,
          orgId: null,
          profile: null,
          membership: null,
          hasPaidAccess: false,
          memberRole: null,
          permissions: {
            canInvite: false,
            canUpgrade: false,
            canManageMembers: false,
            canUseSystem: false,
            isReadOnly: true
          },
          trialExpired: false,
          trialExpiresAt: null,
          reason: this.describeHttpError(err, 'Failed to load Business profile and access state.')
        } as BusinessHubAccessState)
      ),
      finalize(() => {
        this.loadingAccess = false;
        this.clearAccessLoadFailSafeTimer();
      })
    ).subscribe({
      next: (state) => {
        this.loadingAccess = false;
        this.clearAccessLoadFailSafeTimer();

        try {
          if (this.shouldRetryUnresolvedAccessState(state)) {
            this.scheduleAccessResolveRetry();
            return;
          }
          this.applyResolvedAccessState(state);
        } catch (err) {
          this.loadingAccess = false;
          this.hasBusinessAccess = false;
          this.clearBusinessData();
          this.showFeedback(
            'error',
            this.describeHttpError(err, 'Unexpected error while preparing Business Center.')
          );
        }
      },
      error: (err) => {
        this.loadingAccess = false;
        this.hasBusinessAccess = false;
        this.clearBusinessData();
        this.showFeedback('error', this.describeHttpError(err, 'Failed to load Business Center.'));
      }
    });
  }

  private loadBusinessData(state: BusinessHubAccessState): void {
    if (!this.profile) {
      this.clearBusinessData();
      this.showFeedback('error', 'Business profile is missing.');
      return;
    }

    const profileId = this.pickId((this.profile as any)?.id);
    if (!profileId) {
      this.clearBusinessData();
      this.showFeedback('error', 'Business profile is missing.');
      return;
    }

    this.loadingData = true;
    this.clearBusinessData();
    this.teamMembersLoading = true;
    this.clearTeamMembersRetryTimer();
    const loadSeq = ++this.businessDataLoadSeq;
    const businessProfileId = profileId;
    const ownerUserId = this.pickId(this.profile?.owner_user);
    this.clearBusinessDataFailSafeTimer();
    this.businessDataFailSafeTimer = setTimeout(() => {
      if (loadSeq !== this.businessDataLoadSeq || !this.loadingData) return;
      this.loadingData = false;
      this.showFeedback(
        'error',
        'Loading Business Ops modules took too long. Some sections were skipped. Please refresh and try again.'
      );
    }, this.actionTimeoutMs + 3000);

    this.businessCenter.listTeamMembers(profileId).pipe(
      take(1),
      timeout(this.actionTimeoutMs),
      catchError((err) => this.sectionFallback<BusinessProfileMember[]>(err, 'team members', [])),
      switchMap((teamRows) => {
        if (loadSeq !== this.businessDataLoadSeq) {
          return of({
            requests: [] as RequestRecord[],
            invites: [] as RequestInviteRecord[],
            exports: [] as ReportExportRecord[],
            events: [] as ActivityEventRecord[]
          });
        }

        const team = this.buildVisibleTeamMembers((teamRows as any[]) ?? []);
        this.teamMembers = team;
        this.teamMembersLoading = false;
        this.syncExportSelectionWithTeam();

        if (!team.length) {
          this.scheduleTeamMembersRetry(profileId, loadSeq, 1);
        }

        const activityOptions = this.activityQueryOptions(this.teamMembers, state);

        return forkJoin({
          requests: this.businessCenter.listRequestsForBusinessProfile(
            businessProfileId,
            60,
            ownerUserId
          ).pipe(
            take(1),
            timeout(this.actionTimeoutMs),
            catchError((err) => this.sectionFallback<RequestRecord[]>(err, 'requests', []))
          ),
          invites: this.businessCenter.listRequestInvitesForBusinessProfile(businessProfileId).pipe(
            take(1),
            timeout(this.actionTimeoutMs),
            catchError((err) => this.sectionFallback<RequestInviteRecord[]>(err, 'request invites', []))
          ),
          exports: this.businessCenter.listReportExportsForBusinessProfile(
            businessProfileId,
            40,
            activityOptions.teamUserIds
          ).pipe(
            take(1),
            timeout(this.actionTimeoutMs),
            catchError((err) => this.sectionFallback<ReportExportRecord[]>(err, 'export jobs', []))
          ),
          events: this.businessCenter.listActivityEventsForBusinessProfile(
            businessProfileId,
            80,
            activityOptions
          ).pipe(
            take(1),
            timeout(this.actionTimeoutMs),
            catchError((err) => this.sectionFallback<ActivityEventRecord[]>(err, 'activity log', []))
          )
        });
      }),
      catchError((err) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to load Business modules.'));
        return of({
          requests: [] as RequestRecord[],
          invites: [] as RequestInviteRecord[],
          exports: [] as ReportExportRecord[],
          events: [] as ActivityEventRecord[]
        });
      }),
      finalize(() => {
        if (loadSeq !== this.businessDataLoadSeq) {
          return;
        }
        this.loadingData = false;
        this.teamMembersLoading = false;
        this.clearBusinessDataFailSafeTimer();
      })
    ).subscribe(({ requests, invites, exports, events }) => {
      if (loadSeq !== this.businessDataLoadSeq) {
        return;
      }

      const requestRows = (requests as RequestRecord[]) ?? [];
      this.reconcileOptimisticRequests(requestRows);
      this.requests = this.mergeRequestRows(requestRows, Array.from(this.optimisticRequests.values()));
      this.syncDailyRequestCountFromRequests(this.requests);
      this.requestInvites = (invites as any[]) ?? [];
      this.reportExports = (exports as any[]) ?? [];
      this.activityEvents = (events as ActivityEventRecord[]) ?? [];
      this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);
      this.syncExportSelectionWithTeam();
      this.refreshFilteredActivityEvents();
      this.scheduleEmptyModulesRetryIfNeeded(loadSeq);
    });
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

  private applyResolvedAccessState(state: BusinessHubAccessState): void {
    this.accessState = state;
    this.hydrateDailyRequestCount();

    this.profile = (state as any)?.profile ?? null;

    this.hasBusinessAccess = Boolean((state as any)?.hasPaidAccess);
    this.accessReason = (state as any)?.reason || '';

    const role = ((state as any)?.memberRole ?? '').toString();
    this.memberRoleLabel = this.toTitleCase(role) || (this.profile ? 'Unknown' : '-');
    this.currentMemberRole = this.normalizeBusinessRole((state as any)?.memberRole);
    this.syncAssignableMemberRoleOptions();
    this.orgScopeNote = this.hasOrgScope()
      ? ''
      : 'org_id is missing. Request invites are not available; exports and activity use team/user fallback scope.';

    const perms = (state as any)?.permissions ?? {};
    this.canInvite = Boolean(perms.canInvite);
    this.canUpgrade = Boolean(perms.canUpgrade);
    this.canManageMembers = Boolean(perms.canManageMembers);
    this.canUseSystem = Boolean(perms.canUseSystem);
    this.isReadOnly = Boolean(perms.isReadOnly);

    this.trialDaysRemaining = (state as any)?.trialExpiresAt
      ? this.daysUntil((state as any).trialExpiresAt)
      : null;

    const reasonLower = (this.accessReason || '').toLowerCase();
    this.missingBusinessProfile = !this.profile && reasonLower.includes('no business profile');

    if (!this.hasBusinessAccess) {
      this.clearBusinessData();
      if (this.accessReason) this.showFeedback('info', this.accessReason, true);
      return;
    }

    this.loadBusinessData(state);
  }

  private createOptimisticRequestRow(email: string, requiredState: RequiredState): RequestRecord {
    const optimisticId = this.generateOptimisticId();
    const row: RequestRecord = {
      id: optimisticId,
      target: 'scan',
      recipient: email,
      requested_for_email: email,
      recipient_industry: null,
      required_state: requiredState,
      response_status: 'Pending',
      timestamp: new Date().toISOString(),
      org_id: this.accessState?.orgId ?? null
    };
    this.optimisticRequests.set(optimisticId, row);
    return row;
  }

  private promoteOptimisticRequestId(fromId: string, toId: string): void {
    const sourceId = this.pickId(fromId);
    const targetId = this.pickId(toId);
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const source = this.optimisticRequests.get(sourceId);
    if (source) {
      this.optimisticRequests.delete(sourceId);
      this.optimisticRequests.set(targetId, { ...source, id: targetId });
    }

    const idx = this.requests.findIndex((row) => this.pickId(row?.id) === sourceId);
    if (idx !== -1) {
      this.requests[idx] = {
        ...(this.requests[idx] ?? {}),
        id: targetId
      };
    }
  }

  private dropOptimisticRequest(optimisticId: string): void {
    const rowId = this.pickId(optimisticId);
    if (!rowId) {
      return;
    }

    this.optimisticRequests.delete(rowId);
    this.requests = this.requests.filter((row) => this.pickId(row?.id) !== rowId);
  }

  private reconcileOptimisticRequests(remoteRows: RequestRecord[]): void {
    const remoteIds = new Set(
      (remoteRows ?? [])
        .map((row) => this.pickId(row?.id))
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

      const optimisticEmail = this.normalizeEmail(optimistic.requested_for_email ?? optimistic.recipient ?? '');
      const optimisticState = this.pickString(optimistic.required_state)?.toLowerCase() ?? '';
      const optimisticTs = this.timestampMs(optimistic.timestamp);

      const matched = (remoteRows ?? []).some((row) => {
        const remoteEmail = this.normalizeEmail(row?.requested_for_email ?? row?.recipient ?? '');
        const remoteState = this.pickString(row?.required_state)?.toLowerCase() ?? '';
        if (!optimisticEmail || optimisticEmail !== remoteEmail || optimisticState !== remoteState) {
          return false;
        }
        const remoteTs = this.timestampMs(row?.timestamp);
        return Math.abs(remoteTs - optimisticTs) <= 2 * 60 * 1000;
      });

      if (matched) {
        this.optimisticRequests.delete(key);
      }
    }
  }

  private mergeRequestRows(baseRows: RequestRecord[], extraRows: RequestRecord[]): RequestRecord[] {
    const byId = new Map<string, RequestRecord>();
    const push = (row: RequestRecord | null | undefined) => {
      const id = this.pickId(row?.id);
      if (!id) return;

      const normalized: RequestRecord = {
        ...row,
        id,
        recipient:
          row?.recipient ??
          row?.requested_for_email ??
          '-'
      } as RequestRecord;

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, normalized);
        return;
      }

      const existingTs = this.timestampMs(existing.timestamp);
      const nextTs = this.timestampMs(normalized.timestamp);
      if (nextTs >= existingTs) {
        byId.set(id, { ...existing, ...normalized, id });
      }
    };

    for (const row of baseRows ?? []) push(row);
    for (const row of extraRows ?? []) push(row);

    return Array.from(byId.values()).sort((a, b) => this.timestampMs(b.timestamp) - this.timestampMs(a.timestamp));
  }

  private reloadRequestsAndInvites(): void {
    const businessProfileId = this.pickId(this.profile?.id);
    const ownerUserId = this.pickId(this.profile?.owner_user);
    if (!businessProfileId) {
      return;
    }

    forkJoin({
      requests: this.businessCenter.listRequestsForBusinessProfile(
        businessProfileId,
        60,
        ownerUserId
      ).pipe(
        catchError((err) => {
          this.showFeedback('error', this.describeHttpError(err, 'Failed to reload requests.'));
          return of([]);
        })
      ),
      invites: this.businessCenter.listRequestInvitesForBusinessProfile(businessProfileId).pipe(
        catchError((err) => {
          this.showFeedback('error', this.describeHttpError(err, 'Failed to reload invites.'));
          return of([]);
        })
      )
    }).subscribe(({ requests, invites }) => {
      const requestRows = (requests as RequestRecord[]) ?? [];
      this.reconcileOptimisticRequests(requestRows);
      this.requests = this.mergeRequestRows(requestRows, Array.from(this.optimisticRequests.values()));
      this.syncDailyRequestCountFromRequests(this.requests);
      this.requestInvites = (invites as any[]) ?? [];
      this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);
    });
  }

  private reloadTeamMembers(): void {
    const profileId = this.pickId(this.profile?.id);
    if (!profileId) {
      this.teamMembers = [];
      return;
    }

    this.teamMembersLoading = true;
    this.businessCenter.listTeamMembers(profileId).subscribe({
      next: (rows: any) => {
        this.teamMembersLoading = false;
        this.teamMembers = this.buildVisibleTeamMembers(rows ?? []);
        this.syncExportSelectionWithTeam();
        this.reloadExports();
        this.reloadActivityEvents();
      },
      error: (err: any) => {
        this.teamMembersLoading = false;
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload team members.'));
      }
    });
  }

  private reloadExports(): void {
    const businessProfileId = this.pickId(this.profile?.id);
    if (!businessProfileId) {
      this.reportExports = [];
      return;
    }

    this.businessCenter.listReportExportsForBusinessProfile(
      businessProfileId,
      40,
      this.allTeamUserIds()
    ).subscribe({
      next: (rows: any) => (this.reportExports = rows ?? []),
      error: (err: any) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload export jobs.'));
      }
    });
  }

  private reloadActivityEvents(): void {
    const businessProfileId = this.pickId(this.profile?.id);
    if (!businessProfileId) {
      this.activityEvents = [];
      this.filteredActivityEvents = [];
      return;
    }

    const options = this.activityQueryOptions(this.teamMembers, this.accessState);
    this.businessCenter.listActivityEventsForBusinessProfile(businessProfileId, 80, options).subscribe({
      next: (rows: any) => {
        this.activityEvents = (rows as ActivityEventRecord[]) ?? [];
        this.refreshFilteredActivityEvents();
      },
      error: (err: any) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload activity log.'));
      }
    });
  }

  private calculateInviteMetrics(requests: any[], invites: any[]): InviteMetrics {
    const pendingRequests = (requests ?? []).reduce((count, row) => {
      return count + (this.requestStatusLabel(row?.response_status) === 'Pending' ? 1 : 0);
    }, 0);

    const metrics: InviteMetrics = {
      pending: pendingRequests,
      sent: 0,
      claimed: 0,
      expired: 0
    };

    for (const invite of invites ?? []) {
      const status = this.inviteStatusLabel(invite);
      if (status === 'Sent') metrics.sent += 1;
      else if (status === 'Claimed') metrics.claimed += 1;
      else if (status === 'Expired') metrics.expired += 1;
    }

    return metrics;
  }

  private clearBusinessData(): void {
    this.teamMembers = [];
    this.teamMembersLoading = false;
    this.requests = [];
    this.todayRequestCount = 0;
    this.optimisticRequests.clear();
    this.requestInvites = [];
    this.reportExports = [];
    this.activityEvents = [];
    this.filteredActivityEvents = [];
    this.exportForm.selectedMemberIds = [];
    this.inviteMetrics = { pending: 0, sent: 0, claimed: 0, expired: 0 };
    this.clearTeamMembersRetryTimer();
    this.clearEmptyModulesRetryTimer();
  }

  private buildVisibleTeamMembers(rows: any[]): any[] {
    const source = Array.isArray(rows) ? rows : [];
    const visible: any[] = [];
    const seenByUserId = new Set<string>();

    for (const row of source) {
      const userId = this.pickId(row?.user_id);
      if (!userId) {
        visible.push(row);
        continue;
      }
      if (seenByUserId.has(userId)) {
        continue;
      }
      seenByUserId.add(userId);
      visible.push(row);
    }

    const fallbackOwner = this.buildFallbackOwnerMember();
    const fallbackOwnerUserId = this.pickId(fallbackOwner?.user_id);
    if (fallbackOwnerUserId && !seenByUserId.has(fallbackOwnerUserId)) {
      visible.unshift(fallbackOwner);
    }

    return visible;
  }

  private upsertOptimisticTeamMember(email: string, role: ManageTeamMemberRole): void {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return;
    }

    const normalizedRole = (role ?? 'member').toString().trim().toLowerCase();
    const nowId = `tmp_member_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const nextRows = [...(this.teamMembers ?? [])];
    const existingIndex = nextRows.findIndex((row) => {
      const label = this.normalizeEmail(row?.user_label ?? row?.user_id ?? '');
      return Boolean(label && label === normalizedEmail);
    });

    const optimisticRow = {
      id: existingIndex !== -1 ? nextRows[existingIndex]?.id ?? nowId : nowId,
      user_id: nextRows[existingIndex]?.user_id ?? null,
      user_label: normalizedEmail,
      member_role: normalizedRole || 'member',
      status: nextRows[existingIndex]?.status ?? 'active'
    };

    if (existingIndex !== -1) {
      nextRows[existingIndex] = {
        ...nextRows[existingIndex],
        ...optimisticRow
      };
    } else {
      nextRows.unshift(optimisticRow);
    }

    this.teamMembers = this.buildVisibleTeamMembers(nextRows);
    this.syncExportSelectionWithTeam();
    this.refreshFilteredActivityEvents();
  }

  private buildFallbackOwnerMember(): any | null {
    const ownerId = this.pickId(this.profile?.owner_user) ?? this.currentUserId();
    if (!ownerId) {
      return null;
    }

    const ownerEmail = this.pickString(this.profile?.work_email) ?? this.currentUserEmail() ?? ownerId;
    const fallbackRole: BusinessMemberRole =
      this.currentMemberRole ?? (ownerId === this.pickId(this.profile?.owner_user) ? 'owner' : 'member');

    return {
      id: `owner_${ownerId}`,
      user_id: ownerId,
      user_label: ownerEmail,
      member_role: fallbackRole,
      status: 'active'
    };
  }

  private scheduleTeamMembersRetry(profileId: string, loadSeq: number, attempt: number): void {
    if (attempt > 2) {
      return;
    }

    this.clearTeamMembersRetryTimer();
    this.teamMembersRetryTimer = setTimeout(() => {
      if (loadSeq !== this.businessDataLoadSeq) {
        return;
      }

      this.businessCenter.listTeamMembers(profileId).pipe(take(1)).subscribe({
        next: (rows) => {
          if (loadSeq !== this.businessDataLoadSeq) {
            return;
          }

          const resolved = this.buildVisibleTeamMembers((rows as any[]) ?? []);
          if (resolved.length) {
            this.teamMembers = resolved;
            this.syncExportSelectionWithTeam();
            this.refreshFilteredActivityEvents();
            this.reloadExports();
            this.reloadActivityEvents();
            return;
          }

          this.scheduleTeamMembersRetry(profileId, loadSeq, attempt + 1);
        },
        error: () => {
          if (loadSeq !== this.businessDataLoadSeq) {
            return;
          }
          this.scheduleTeamMembersRetry(profileId, loadSeq, attempt + 1);
        }
      });
    }, 700 * attempt);
  }

  private clearTeamMembersRetryTimer(): void {
    if (!this.teamMembersRetryTimer) {
      return;
    }
    clearTimeout(this.teamMembersRetryTimer);
    this.teamMembersRetryTimer = null;
  }

  private scheduleEmptyModulesRetryIfNeeded(loadSeq: number): void {
    if (this.emptyModulesRetryAttempt >= this.maxEmptyModulesRetryAttempts) {
      return;
    }
    if (!this.hasBusinessAccess || !this.profile) {
      return;
    }

    const appearsIncomplete =
      this.teamMembers.length <= 1 &&
      this.requests.length === 0 &&
      this.activityEvents.length === 0;

    if (!appearsIncomplete) {
      return;
    }

    this.emptyModulesRetryAttempt += 1;
    this.clearEmptyModulesRetryTimer();
    this.emptyModulesRetryTimer = setTimeout(() => {
      if (loadSeq !== this.businessDataLoadSeq) {
        return;
      }
      this.reloadTeamMembers();
      this.reloadRequestsAndInvites();
      this.reloadActivityEvents();
      this.reloadExports();
    }, 700);
  }

  private clearEmptyModulesRetryTimer(): void {
    if (!this.emptyModulesRetryTimer) {
      return;
    }
    clearTimeout(this.emptyModulesRetryTimer);
    this.emptyModulesRetryTimer = null;
  }

  private sectionFallback<T>(err: any, section: string, fallback: T): Observable<T> {
    this.showFeedback('error', this.describeHttpError(err, `Failed to load ${section}.`));
    return of(fallback);
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

    if (status === 401 || status === 403) return `Access denied (${status}): ${detail || fallback}`;
    if (status >= 500) return `Server error (${status}): ${detail || fallback}`;
    if (status >= 400) return `Request error (${status}): ${detail || fallback}`;

    return detail || fallback;
  }

  private showFeedback(type: Feedback['type'], message: string, sticky = false): void {
    this.feedback = { type, message };
    this.clearFeedbackTimer();
    if (sticky) return;

    this.feedbackTimer = setTimeout(() => {
      if (this.feedback?.message === message) this.feedback = null;
    }, 7000);
  }

  private clearFeedbackTimer(): void {
    if (!this.feedbackTimer) return;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
  }

  private clearMemberSubmitFailSafeTimer(): void {
    if (!this.memberSubmitFailSafeTimer) return;
    clearTimeout(this.memberSubmitFailSafeTimer);
    this.memberSubmitFailSafeTimer = null;
  }

  private clearAccessLoadFailSafeTimer(): void {
    if (!this.accessLoadFailSafeTimer) return;
    clearTimeout(this.accessLoadFailSafeTimer);
    this.accessLoadFailSafeTimer = null;
  }

  private shouldRetryUnresolvedAccessState(state: BusinessHubAccessState): boolean {
    if (!this.hasSessionToken()) {
      return false;
    }
    if (this.accessResolveRetryAttempts >= this.maxAccessResolveRetryAttempts) {
      return false;
    }
    if (state?.hasPaidAccess || this.pickId((state as any)?.profile?.id)) {
      return false;
    }

    const reason = ((state as any)?.reason ?? '').toString().toLowerCase();
    if (reason.includes('no business profile')) {
      return false;
    }
    return true;
  }

  private scheduleAccessResolveRetry(): void {
    this.accessResolveRetryAttempts += 1;
    this.loadingAccess = true;
    this.clearAccessResolveRetryTimer();
    this.accessResolveRetryTimer = setTimeout(() => {
      this.loadAccessState(true);
    }, 450 * this.accessResolveRetryAttempts);
  }

  private clearAccessResolveRetryTimer(): void {
    if (!this.accessResolveRetryTimer) {
      return;
    }
    clearTimeout(this.accessResolveRetryTimer);
    this.accessResolveRetryTimer = null;
  }

  private clearBusinessDataFailSafeTimer(): void {
    if (!this.businessDataFailSafeTimer) return;
    clearTimeout(this.businessDataFailSafeTimer);
    this.businessDataFailSafeTimer = null;
  }

  private daysUntil(value: string): number | null {
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  private toTitleCase(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return '';
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeEmail(value: string): string {
    return (value ?? '').trim().toLowerCase();
  }

  private normalizeRequiredState(value: string): RequiredState | null {
    const normalized = (value ?? '').trim();
    if ((this.requiredStateOptions as readonly string[]).includes(normalized)) {
      return normalized as RequiredState;
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

  private syncAssignableMemberRoleOptions(): void {
    const actorRole = this.currentMemberRole;

    if (actorRole === 'owner') {
      this.assignableMemberRoleOptions = [...this.memberRoleOptions];
    } else if (actorRole === 'admin') {
      this.assignableMemberRoleOptions = this.memberRoleOptions.filter(
        (option) => option.value !== 'owner'
      );
    } else {
      this.assignableMemberRoleOptions = this.memberRoleOptions.filter(
        (option) => option.value === 'member'
      );
    }

    if (!this.assignableMemberRoleOptions.some((option) => option.value === this.teamMemberForm.role)) {
      this.teamMemberForm.role = this.assignableMemberRoleOptions[0]?.value ?? 'member';
    }
  }

  private activityQueryOptions(teamRows: any[], state: BusinessHubAccessState | null): ActivityQueryOptions {
    const stateUserId = this.pickId((state as any)?.userId);
    const ownerUserId = this.pickId(this.profile?.owner_user);
    const teamUserIds = this.uniqueIds([
      ...(teamRows ?? []).map((row) => this.pickId(row?.user_id)),
      stateUserId,
      this.currentUserId(),
      ownerUserId
    ]);

    const ownerEmail = this.pickString(this.profile?.work_email);
    const teamUserEmails = this.uniqueStrings([
      ...(teamRows ?? []).map((row) => this.pickString(row?.user_label)),
      this.currentUserEmail(),
      ownerEmail
    ]).filter((value) => this.isValidEmail(value));

    return {
      teamUserIds,
      teamUserEmails
    };
  }

  private allTeamUserIds(): string[] {
    const options = this.activityQueryOptions(this.teamMembers, this.accessState);
    return options.teamUserIds ?? [];
  }

  private allTeamMemberLabels(): string[] {
    const labels = (this.teamMembers ?? []).map((member) => this.pickString(member?.user_label));
    const fallback = this.currentUserEmail();
    return this.uniqueStrings([...labels, fallback]);
  }

  private resolveExportSelection(requireSelectedMembers: boolean): ExportSelection {
    const scope = this.normalizeScope(this.exportForm.scope);
    const allTeamIds = this.allTeamUserIds();
    const allLabels = this.allTeamMemberLabels();

    if (scope === 'team') {
      return {
        scope,
        userIds: allTeamIds,
        labels: allLabels
      };
    }

    const allowedIds = new Set(allTeamIds);
    const selectedIds = this.uniqueIds(this.exportForm.selectedMemberIds).filter((id) => allowedIds.has(id));
    if (requireSelectedMembers && !selectedIds.length) {
      return { scope, userIds: [], labels: [] };
    }

    return {
      scope,
      userIds: selectedIds,
      labels: selectedIds
        .map((id) => this.memberLabelById(id))
        .filter((value): value is string => Boolean(value))
    };
  }

  private buildExportFilters(selection: ExportSelection): Record<string, unknown> {
    const parsedUserFilters = this.parseOptionalJson(this.exportForm.filters);
    const metadata: Record<string, unknown> = {
      report_type: 'activity_log',
      scope: selection.scope === 'selected' ? 'selected_members' : 'team',
      member_user_ids: selection.userIds,
      member_labels: selection.labels,
      generated_at: new Date().toISOString()
    };

    if (parsedUserFilters === null || parsedUserFilters === undefined) {
      return metadata;
    }
    if (typeof parsedUserFilters === 'object' && !Array.isArray(parsedUserFilters)) {
      return {
        ...(parsedUserFilters as Record<string, unknown>),
        ...metadata
      };
    }
    if (Array.isArray(parsedUserFilters)) {
      return {
        ...metadata,
        custom_filters: parsedUserFilters
      };
    }

    return {
      ...metadata,
      custom_filters_raw: String(parsedUserFilters)
    };
  }

  private eventsForSelection(selection: ExportSelection): ActivityEventRecord[] {
    if (!this.activityEvents.length) {
      return [];
    }

    // Team scope should always show full activity feed.
    if (selection.scope === 'team') {
      return [...this.activityEvents];
    }

    return this.activityEvents.filter((event) => this.eventMatchesSelection(event, selection));
  }

  private eventMatchesSelection(event: ActivityEventRecord, selection: ExportSelection): boolean {
    const actorId = this.pickId(event?.actor_id);
    const targetId = this.pickId(event?.target_user_id);
    const selectedIds = new Set(selection.userIds);

    if (selectedIds.size > 0 && ((actorId && selectedIds.has(actorId)) || (targetId && selectedIds.has(targetId)))) {
      return true;
    }

    if (!selection.labels.length) {
      return selection.scope === 'team' && selectedIds.size === 0;
    }

    const selectedLabels = new Set(selection.labels.map((value) => value.toLowerCase()));
    const actorLabel = this.pickString(event?.actor_label)?.toLowerCase() ?? '';
    const targetLabel = this.pickString(event?.target_user_label)?.toLowerCase() ?? '';
    return selectedLabels.has(actorLabel) || selectedLabels.has(targetLabel);
  }

  private syncExportSelectionWithTeam(): void {
    const allIds = this.allTeamUserIds();
    if (!allIds.length) {
      this.exportForm.selectedMemberIds = [];
      return;
    }

    const allowed = new Set(allIds);
    const current = this.uniqueIds(this.exportForm.selectedMemberIds).filter((id) => allowed.has(id));
    this.exportForm.selectedMemberIds = current.length ? current : [...allIds];
  }

  private refreshFilteredActivityEvents(): void {
    this.filteredActivityEvents = this.eventsForSelection(this.resolveExportSelection(false));
  }

  private memberLabelById(memberId: string): string | null {
    const normalizedMemberId = this.pickId(memberId);
    if (!normalizedMemberId) {
      return null;
    }

    const row = (this.teamMembers ?? []).find((member) => this.pickId(member?.user_id) === normalizedMemberId);
    return this.pickString(row?.user_label) ?? normalizedMemberId;
  }

  private normalizeScope(value: string | null | undefined): ExportScope {
    return (value ?? '').toLowerCase() === 'selected' ? 'selected' : 'team';
  }

  private parseOptionalJson(value: string): unknown {
    const raw = (value ?? '').trim();
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private uniqueIds(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    for (const value of values ?? []) {
      const id = this.pickId(value);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
    }
    return Array.from(seen);
  }

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Map<string, string>();
    for (const value of values ?? []) {
      const text = this.pickString(value);
      if (!text) {
        continue;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.set(key, text);
    }
    return Array.from(seen.values());
  }

  private escapeCsvCell(value: string): string {
    const raw = (value ?? '').toString();
    if (!/[",\r\n]/.test(raw)) {
      return raw;
    }
    return `"${raw.replace(/"/g, '""')}"`;
  }

  private escapeHtml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private downloadTextFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    this.downloadBlobFile(blob, filename);
  }

  private downloadBlobFile(blob: Blob, filename: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      this.showFeedback('error', 'Download is only available in browser sessions.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private wrapPdfLine(value: string, maxLen: number): string[] {
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return [''];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxLen) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (word.length > maxLen) {
        let start = 0;
        while (start < word.length) {
          lines.push(word.slice(start, start + maxLen));
          start += maxLen;
        }
        current = '';
      } else {
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  private sanitizePdfText(value: string): string {
    return (value ?? '').replace(/[^\x20-\x7E]/g, '?');
  }

  private escapePdfText(value: string): string {
    return this.sanitizePdfText(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private buildSimplePdfDocument(lines: string[]): string {
    const pageWidth = 612;
    const pageHeight = 792;
    const marginX = 42;
    const marginY = 42;
    const fontSize = 10;
    const lineHeight = 14;

    const usableHeight = pageHeight - marginY * 2;
    const linesPerPage = Math.max(1, Math.floor(usableHeight / lineHeight));

    const normalizedLines = lines.map((line) => this.escapePdfText(line));
    const pages: string[][] = [];
    for (let i = 0; i < normalizedLines.length; i += linesPerPage) {
      pages.push(normalizedLines.slice(i, i + linesPerPage));
    }
    if (!pages.length) {
      pages.push(['No data']);
    }

    const fontObjectId = 3;
    const pageObjectIds: number[] = [];
    const contentObjectIds: number[] = [];
    let nextObjectId = 4;

    for (let i = 0; i < pages.length; i += 1) {
      pageObjectIds.push(nextObjectId);
      nextObjectId += 1;
      contentObjectIds.push(nextObjectId);
      nextObjectId += 1;
    }

    const maxObjectId = nextObjectId - 1;
    const bodies = new Map<number, string>();

    bodies.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
    bodies.set(
      2,
      `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`
    );
    bodies.set(fontObjectId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    for (let i = 0; i < pages.length; i += 1) {
      const pageId = pageObjectIds[i];
      const contentId = contentObjectIds[i];
      const pageLines = pages[i];

      const streamLines = [
        'BT',
        `/F1 ${fontSize} Tf`,
        `${lineHeight} TL`,
        `${marginX} ${pageHeight - marginY} Td`
      ];

      for (const line of pageLines) {
        streamLines.push(`(${line}) Tj`);
        streamLines.push('T*');
      }
      streamLines.push('ET');

      const streamContent = `${streamLines.join('\n')}\n`;
      const streamBytes = this.utf8ByteLength(streamContent);

      bodies.set(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      bodies.set(contentId, `<< /Length ${streamBytes} >>\nstream\n${streamContent}endstream`);
    }

    const offsets: number[] = new Array(maxObjectId + 1).fill(0);
    let pdf = '%PDF-1.4\n';

    for (let id = 1; id <= maxObjectId; id += 1) {
      offsets[id] = this.utf8ByteLength(pdf);
      const body = bodies.get(id) ?? '';
      pdf += `${id} 0 obj\n${body}\nendobj\n`;
    }

    const xrefStart = this.utf8ByteLength(pdf);
    pdf += `xref\n0 ${maxObjectId + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= maxObjectId; id += 1) {
      pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return pdf;
  }

  private utf8ByteLength(value: string): number {
    return new TextEncoder().encode(value ?? '').length;
  }

  private generateOptimisticId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `tmp_${crypto.randomUUID()}`;
    }
    return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  private timestampMs(value: unknown): number {
    const raw = this.pickString(value);
    if (!raw) return 0;
    const parsed = new Date(raw).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private isTempRequestId(value: string): boolean {
    return value.startsWith('tmp_');
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return null;
  }

  private hydrateDailyRequestCount(): void {
    this.todayRequestCount = 0;
  }

  private syncDailyRequestCountFromRequests(rows: RequestRecord[]): void {
    this.todayRequestCount = this.businessCenter.countTodayRequests(rows ?? []);
  }

  private todayDateKey(): string {
    return this.dateKeyFromMs(Date.now());
  }

  private dateKeyFromMs(value: number): string {
    const date = new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private currentUserId(): string | null {
    const fromAccess = this.pickId(this.accessState?.userId);
    if (fromAccess) return fromAccess;

    if (typeof localStorage === 'undefined') return null;
    return this.pickId(localStorage.getItem('current_user_id'));
  }

  private currentUserEmail(): string | null {
    const token = this.getSessionToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = typeof payload?.['email'] === 'string' ? payload['email'] : '';
    const storedEmail =
      typeof localStorage !== 'undefined' ? (localStorage.getItem('user_email') ?? '') : '';

    const normalizedPayloadEmail = this.normalizeEmail(payloadEmail);
    if (this.isValidEmail(normalizedPayloadEmail)) return normalizedPayloadEmail;

    const normalizedStoredEmail = this.normalizeEmail(storedEmail);
    if (this.isValidEmail(normalizedStoredEmail)) return normalizedStoredEmail;

    return null;
  }

  private getSessionToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    const candidates = [
      localStorage.getItem('token'),
      localStorage.getItem('access_token'),
      localStorage.getItem('directus_token')
    ].filter((value): value is string => Boolean(value && value.trim()));

    for (const token of candidates) {
      if (!this.isTokenExpired(token)) {
        return token;
      }
    }

    return null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    return typeof exp === 'number' ? Math.floor(Date.now() / 1000) >= exp : false;
  }

  private pickId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
    return null;
  }

  private hasSessionToken(): boolean {
    return Boolean(this.getSessionToken());
  }
}
