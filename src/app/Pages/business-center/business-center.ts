import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, switchMap, timeout } from 'rxjs/operators';
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
  memberRoleLabel = 'User';

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

  accessState: BusinessHubAccessState | null = null;

  // ✅ نخلي profile any عشان الـ template ما يقفش لو الـ interface ناقصة fields
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
  readonly dailyRequestLimit = 5;
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;
  todayRequestCount = 0;
  private currentMemberRole: BusinessMemberRole | null = null;

  readonly memberRoleOptions: Array<{ value: ManageTeamMemberRole; label: string }> = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'member', label: 'Member' },
    { value: 'owner', label: 'Owner' }
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

  constructor(private businessCenter: BusinessCenterService) {}

  ngOnInit(): void {
    this.assignableMemberRoleOptions = [...this.memberRoleOptions];
    this.loadAccessState();
  }

  ngOnDestroy(): void {
    this.clearFeedbackTimer();
    this.clearMemberSubmitFailSafeTimer();
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
    if (this.loadingAccess || this.hasBusinessAccess) {
      return 'Plan: Business';
    }

    const plan = (this.profile?.plan_code ?? 'free').toString().trim().toLowerCase();
    return plan === 'business' ? 'Plan: Business' : 'Plan: Free';
  }

  roleBadgeLabel(): string {
    return `Role: ${this.memberRoleLabel}`;
  }

  trialBadgeLabel(): string {
    if (typeof this.trialDaysRemaining !== 'number') return '';
    if (this.trialDaysRemaining <= 1) return 'Trial ends today';
    return `${this.trialDaysRemaining}d trial left`;
  }

  requestStatusLabel(status?: string | null): string {
    const normalized = (status ?? '').trim().toLowerCase();
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

    const normalized = (invite?.status ?? '').trim().toLowerCase();
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

    this.businessCenter.submitUpgradeRequest(orgId).pipe(
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

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=820');
    if (!popup) {
      this.showFeedback('error', 'Popup blocked. Allow popups to export PDF.');
      return;
    }

    const scopeLabel = selection.scope === 'selected' ? 'Selected Members' : 'Entire Team';
    const generatedAt = this.formatDate(new Date().toISOString());
    const tableRows = rows.map((event) => `
      <tr>
        <td>${this.escapeHtml(event.actor_label ?? '-')}</td>
        <td>${this.escapeHtml(event.action ?? '-')}</td>
        <td>${this.escapeHtml(`${event.entity_type ?? '-'} #${event.entity_id ?? '-'}`)}</td>
        <td>${this.escapeHtml(event.target_user_label ?? '-')}</td>
        <td>${this.escapeHtml(this.formatDate(event.date_created))}</td>
      </tr>
    `).join('');

    popup.document.open();
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Activity Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            p { margin: 0 0 12px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #e2e8f0; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>Business Activity Report</h1>
          <p>Scope: ${this.escapeHtml(scopeLabel)}</p>
          <p>Generated at: ${this.escapeHtml(generatedAt)}</p>
          <p>Events: ${rows.length}</p>
          <table>
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Target</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
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
      this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);

      if (!succeeded.length) {
        this.showFeedback('error', fallbackError);
        return;
      }

      this.incrementDailyRequestCount(succeeded.length);
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

    this.businessCenter.upsertTeamMember(profileId, email, role).pipe(
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

      this.teamMemberForm.email = '';
      this.teamMemberForm.role = 'member';
      this.reloadTeamMembers();
    });
  }

  // ===============================
  // Loading
  // ===============================

  private loadAccessState(): void {
    this.loadingAccess = true;
    this.missingBusinessProfile = false;

    let accessState$: Observable<BusinessHubAccessState>;
    try {
      accessState$ = this.businessCenter.getHubAccessState();
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
        // ✅ مهما حصل: اقفل loadingAccess
        this.loadingAccess = false;
      })
    ).subscribe((state) => {
      this.accessState = state;
      this.hydrateDailyRequestCount();

      // profile any عشان template
      this.profile = (state as any)?.profile ?? null;

      this.hasBusinessAccess = Boolean((state as any)?.hasPaidAccess);
      this.accessReason = (state as any)?.reason || '';

      const role = ((state as any)?.memberRole ?? '').toString();
      this.memberRoleLabel = this.toTitleCase(role) || 'User';
      this.currentMemberRole = this.normalizeBusinessRole((state as any)?.memberRole);
      this.syncAssignableMemberRoleOptions();

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
    const orgId = (state as any)?.orgId ?? null;

    this.businessCenter.listTeamMembers(profileId).pipe(
      catchError((err) => this.sectionFallback<BusinessProfileMember[]>(err, 'team members', [])),
      switchMap((teamRows) => {
        const team = (teamRows as any[]) ?? [];
        const activityOptions = this.activityQueryOptions(team, state);

        return forkJoin({
          team: of(team) as Observable<BusinessProfileMember[]>,
          requests: this.businessCenter.listRequests(orgId).pipe(
            catchError((err) => this.sectionFallback<RequestRecord[]>(err, 'requests', []))
          ),
          invites: this.businessCenter.listRequestInvites(orgId).pipe(
            catchError((err) => this.sectionFallback<RequestInviteRecord[]>(err, 'request invites', []))
          ),
          exports: this.businessCenter.listReportExports(orgId, 40, activityOptions.teamUserIds).pipe(
            catchError((err) => this.sectionFallback<ReportExportRecord[]>(err, 'export jobs', []))
          ),
          events: this.businessCenter.listActivityEvents(orgId, 80, activityOptions).pipe(
            catchError((err) => this.sectionFallback<ActivityEventRecord[]>(err, 'activity log', []))
          )
        });
      }),
      finalize(() => (this.loadingData = false))
    ).subscribe(({ team, requests, invites, exports, events }) => {
      this.teamMembers = (team as any[]) ?? [];
      const requestRows = (requests as RequestRecord[]) ?? [];
      this.reconcileOptimisticRequests(requestRows);
      this.requests = this.mergeRequestRows(requestRows, Array.from(this.optimisticRequests.values()));
      this.requestInvites = (invites as any[]) ?? [];
      this.reportExports = (exports as any[]) ?? [];
      this.activityEvents = (events as ActivityEventRecord[]) ?? [];
      this.inviteMetrics = this.calculateInviteMetrics(this.requests, this.requestInvites);
      this.syncExportSelectionWithTeam();
      this.refreshFilteredActivityEvents();
    });
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
      org_id: this.accessState?.orgId ?? null,
      user_created: this.currentUserId()
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
    const orgId = this.accessState?.orgId ?? null;

    forkJoin({
      requests: this.businessCenter.listRequests(orgId).pipe(
        catchError((err) => {
          this.showFeedback('error', this.describeHttpError(err, 'Failed to reload requests.'));
          return of([]);
        })
      ),
      invites: this.businessCenter.listRequestInvites(orgId).pipe(
        catchError((err) => {
          this.showFeedback('error', this.describeHttpError(err, 'Failed to reload invites.'));
          return of([]);
        })
      )
    }).subscribe(({ requests, invites }) => {
      const requestRows = (requests as RequestRecord[]) ?? [];
      this.reconcileOptimisticRequests(requestRows);
      this.requests = this.mergeRequestRows(requestRows, Array.from(this.optimisticRequests.values()));
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

    this.businessCenter.listTeamMembers(profileId).subscribe({
      next: (rows: any) => {
        this.teamMembers = rows ?? [];
        this.syncExportSelectionWithTeam();
        this.reloadExports();
        this.reloadActivityEvents();
      },
      error: (err: any) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload team members.'));
      }
    });
  }

  private reloadExports(): void {
    this.businessCenter.listReportExports(
      this.accessState?.orgId ?? null,
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
    const options = this.activityQueryOptions(this.teamMembers, this.accessState);
    this.businessCenter.listActivityEvents(this.accessState?.orgId ?? null, 80, options).subscribe({
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
    this.requests = [];
    this.optimisticRequests.clear();
    this.requestInvites = [];
    this.reportExports = [];
    this.activityEvents = [];
    this.filteredActivityEvents = [];
    this.exportForm.selectedMemberIds = [];
    this.inviteMetrics = { pending: 0, sent: 0, claimed: 0, expired: 0 };
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
    const teamUserIds = this.uniqueIds([
      ...(teamRows ?? []).map((row) => this.pickId(row?.user_id)),
      stateUserId,
      this.currentUserId()
    ]);

    const teamUserEmails = this.uniqueStrings([
      ...(teamRows ?? []).map((row) => this.pickString(row?.user_label)),
      this.currentUserEmail()
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

    if (selection.scope === 'team' && !selection.userIds.length && !selection.labels.length) {
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
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      this.showFeedback('error', 'Download is only available in browser sessions.');
      return;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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
    this.todayRequestCount = this.readDailyRequestCount();
  }

  private incrementDailyRequestCount(incrementBy: number): void {
    if (incrementBy <= 0) return;
    this.todayRequestCount = this.readDailyRequestCount() + incrementBy;
    this.writeDailyRequestCount(this.todayRequestCount);
  }

  private readDailyRequestCount(): number {
    const key = this.dailyRequestStorageKey();
    if (!key || typeof localStorage === 'undefined') return 0;

    const raw = localStorage.getItem(key);
    if (!raw) return 0;

    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private writeDailyRequestCount(value: number): void {
    const key = this.dailyRequestStorageKey();
    if (!key || typeof localStorage === 'undefined') return;
    localStorage.setItem(key, String(Math.max(0, Math.floor(value))));
  }

  private dailyRequestStorageKey(): string | null {
    const userId = this.currentUserId();
    if (!userId) return null;
    return `wellar_business_request_daily_v1:${userId}:${this.todayDateKey()}`;
  }

  private todayDateKey(): string {
    return new Date().toISOString().slice(0, 10);
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
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private pickId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
    return null;
  }
}
