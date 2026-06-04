import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom, Subscription, timeout } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  OperationsWorkflowsService,
  type AlertActionInput,
  type AlertDetailsRow,
  type AlertRow,
  type WorkflowDepartmentOption
} from '../../services/operations-workflows.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { sanitizeDisplayValue } from '../../shared/utils/display-formatters';

type AlertsPageState = 'loading' | 'ready' | 'error';

type BackendAlertStatus = 'new' | 'seen' | 'reviewed' | 'resolved' | 'overridden' | 'unknown';

type AlertsFilterStatus = 'all' | 'new' | 'seen' | 'reviewed' | 'resolved' | 'overridden';

type AlertsFilters = {
  search: string;
  status: AlertsFilterStatus;
  severity: '' | 'low' | 'medium' | 'high' | 'critical';
  department: string;
  date: 'today' | 'last7' | 'last30' | 'all';
};

type AlertsSummary = {
  openAlerts: number;
  highRiskCriticalToday: number;
  reviewed: number;
  resolvedToday: number;
  overridden: number;
};

type AlertViewModel = {
  id: string;
  source: AlertRow;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  status: BackendAlertStatus;
  statusLabel: 'Open' | 'Seen' | 'Reviewed' | 'Resolved' | 'Overridden' | 'Unknown';
  departmentId: string | null;
  departmentName: string;
  targetMemberId: string | null;
  targetUserId: string | null;
  employeeName: string;
  employeeEmail: string;
  employeeHelperText: string;
  memberRole: string;
  workspaceName: string;
  scanId: string | null;
  scanStatusLabel: string;
  scanDateLabel: string;
  reviewedAt: string | null;
  reviewedAtLabel: string;
  reviewedById: string | null;
  reviewedByName: string;
  reviewedByEmail: string;
  reviewedByLabel: string;
  actionNote: string;
  actionType: string;
  actionTypeLabel: string;
  createdAt: string | null;
  createdTs: number;
  createdLabel: string;
  operationalAttention: string;
  scopeLabel: string;
  explanation: string;
  recommendedAction: string;
  readinessLabel: string;
  targetMemberDepartmentName: string;
  reviewedStatusLabel: string;
  relationWarnings: string[];
  permissionWarnings: string[];
};

type FollowUpDuePreset = 'end_of_today' | 'in_2_hours' | 'custom';

type FollowUpScanForm = {
  alertId: string;
  alertTitle: string;
  targetMemberId: string;
  targetUserLabel: string;
  targetUserEmail: string;
  departmentId: string;
  departmentLabel: string;
  workspaceLabel: string;
  message: string;
  priority: 'normal' | 'high';
  duePreset: FollowUpDuePreset;
  customDueAt: string;
};

@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    KpiCardComponent,
    TableShellComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent
  ],
  templateUrl: './alerts.html',
  styleUrls: ['./alerts.css']
})
export class AlertsPageComponent implements OnInit, OnDestroy {
  pageState: AlertsPageState = 'loading';
  alerts: AlertViewModel[] = [];
  filteredAlerts: AlertViewModel[] = [];
  summary: AlertsSummary = {
    openAlerts: 0,
    highRiskCriticalToday: 0,
    reviewed: 0,
    resolvedToday: 0,
    overridden: 0
  };
  departments: WorkflowDepartmentOption[] = [];
  selectedAlert: AlertViewModel | null = null;
  selectedAlertLoading = false;
  selectedAlertError = '';
  errorMessage = '';
  feedbackMessage = '';
  warningMessage = '';

  filters: AlertsFilters = {
    search: '',
    status: 'all',
    severity: '',
    department: '',
    date: 'all'
  };

  reviewNoteDraft = '';
  reviewActionTypeDraft = 'none';
  showFollowUpModal = false;
  followUpSubmitting = false;
  followUpForm: FollowUpScanForm = this.emptyFollowUpForm();

  readonly reviewActionTypeOptions = [
    'none',
    're_scan',
    'rest_advised',
    'reassigned',
    'held_from_task',
    'override',
    'escalated'
  ];

  private routeSub: Subscription | null = null;
  private loadRunId = 0;
  updateBusy = false;
  private updateBusyAlertId = '';
  private managerUpdateDenied = false;

  constructor(
    private workflows: OperationsWorkflowsService,
    private companyContext: CompanyContextService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape', ['$event'])
  onEscapePressed(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (this.showFollowUpModal) {
      keyboardEvent.preventDefault();
      this.closeFollowUpModal();
      return;
    }

    if (this.selectedAlert) {
      keyboardEvent.preventDefault();
      this.closeAlertDetails();
    }
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const alertId = params.get('alert');
      if (!alertId) {
        this.selectedAlert = null;
        this.selectedAlertLoading = false;
        this.selectedAlertError = '';
        this.togglePageScrollLock(false);
        return;
      }

      const selected = this.filteredAlerts.find((row) => row.id === alertId) ?? this.alerts.find((row) => row.id === alertId) ?? null;
      this.selectedAlert = selected;
      this.selectedAlertError = '';
      this.togglePageScrollLock(true);
      if (selected) {
        this.reviewNoteDraft = selected.actionNote;
        this.reviewActionTypeDraft = selected.actionType || 'none';
      }
      this.loadSelectedAlertDetails(alertId);
    });

    void this.loadAlerts();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.togglePageScrollLock(false);
  }

  get currentRole(): string {
    const role = this.companyContext.snapshot().context.activeMemberRole;
    const normalized = (role ?? '').toString().trim().toLowerCase();
    return normalized === 'manger' ? 'manager' : normalized;
  }

  get scopeChipLabel(): string {
    const context = this.companyContext.snapshot().context;
    return context.activeDepartmentName ? `${context.activeDepartmentName} scope` : 'Company-wide scope';
  }

  get roleChipLabel(): string {
    if (this.currentRole === 'owner') return 'Owner';
    if (this.currentRole === 'hr') return 'HR';
    if (this.currentRole === 'manager') return 'Manager';
    if (this.currentRole === 'employee') return 'Employee';
    return 'Role unavailable';
  }

  get canCreateFollowUp(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canManageAlerts(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canRequestFollowUpFromSelection(): boolean {
    return Boolean(this.selectedAlert?.targetMemberId) && this.canCreateFollowUp;
  }

  get followUpDisabledReason(): string {
    if (!this.canCreateFollowUp) {
      return 'Only owner and HR can request follow-up scans.';
    }
    return '';
  }

  get followUpDueAtPreview(): string {
    const dueAt = this.resolveFollowUpDueAt();
    return dueAt ? this.formatDateTime(dueAt) : '-';
  }

  refresh(): void {
    void this.loadAlerts(true);
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      status: 'all',
      severity: '',
      department: '',
      date: 'all'
    };
    this.applyFilters();
  }

  onFiltersChanged(): void {
    this.applyFilters();
  }

  trackByAlert(index: number, row: AlertViewModel): string {
    return row.id || String(index);
  }

  viewAlert(row: AlertViewModel): void {
    this.selectedAlert = row;
    this.selectedAlertError = '';
    this.selectedAlertLoading = true;
    this.reviewNoteDraft = row.actionNote;
    this.reviewActionTypeDraft = row.actionType || 'none';
    this.togglePageScrollLock(true);

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { alert: row.id },
      queryParamsHandling: 'merge'
    });
  }

  closeAlertDetails(): void {
    this.selectedAlert = null;
    this.selectedAlertLoading = false;
    this.selectedAlertError = '';
    this.reviewNoteDraft = '';
    this.reviewActionTypeDraft = 'none';
    this.togglePageScrollLock(false);

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { alert: null },
      queryParamsHandling: 'merge'
    });
  }

  requestFollowUpScan(row: AlertViewModel | null = null): void {
    const target = row ?? this.selectedAlert;

    if (!this.canCreateFollowUp) {
      this.feedbackMessage = 'Only owners and HR can request follow-up scans.';
      return;
    }

    const queryParams: Record<string, string> = {};
    if (target?.targetMemberId) {
      queryParams['member'] = target.targetMemberId;
    }
    void this.router.navigate(['/app/scan-requests'], { queryParams });
  }

  canUpdateAlerts(): boolean {
    return this.canManageAlerts && !this.managerUpdateDenied;
  }

  canMarkSeen(row: AlertViewModel): boolean {
    return this.canUpdateAlerts() && row.status === 'new';
  }

  canMarkReviewed(row: AlertViewModel): boolean {
    return this.canUpdateAlerts() && row.status !== 'reviewed' && row.status !== 'resolved' && row.status !== 'overridden';
  }

  canMarkResolved(row: AlertViewModel): boolean {
    return this.canUpdateAlerts() && row.status !== 'resolved';
  }

  canOverride(row: AlertViewModel): boolean {
    return this.canUpdateAlerts() && row.status !== 'overridden';
  }

  isRowBusy(row: AlertViewModel): boolean {
    return this.updateBusy && this.updateBusyAlertId === row.id;
  }

  openFollowUpModal(row: AlertViewModel): void {
    const highPriority = row.severity === 'critical' || row.severity === 'high';
    this.followUpForm = {
      alertId: row.id,
      alertTitle: row.title,
      targetMemberId: row.targetMemberId ?? '',
      targetUserLabel: row.employeeName,
      targetUserEmail: row.employeeEmail === '-' ? '' : row.employeeEmail,
      departmentId: row.departmentId ?? '',
      departmentLabel: row.departmentName,
      workspaceLabel: row.workspaceName,
      message: 'Follow-up readiness scan requested for this alert.',
      priority: highPriority ? 'high' : 'normal',
      duePreset: 'end_of_today',
      customDueAt: ''
    };
    this.showFollowUpModal = true;
    this.togglePageScrollLock(true);
  }

  closeFollowUpModal(): void {
    if (this.followUpSubmitting) {
      return;
    }
    this.showFollowUpModal = false;
    this.followUpForm = this.emptyFollowUpForm();
    this.togglePageScrollLock(Boolean(this.selectedAlert));
  }

  submitFollowUpScan(): void {
    if (!this.canCreateFollowUp) {
      this.feedbackMessage = 'Only owners and HR can request follow-up scans.';
      return;
    }

    if (!this.followUpForm.targetMemberId) {
      this.feedbackMessage = 'Target member is required for follow-up scan request.';
      return;
    }

    const dueAt = this.resolveFollowUpDueAt();
    if (!dueAt) {
      this.feedbackMessage = 'A valid due time is required.';
      return;
    }

    this.followUpSubmitting = true;
    this.updateBusy = true;
    this.updateBusyAlertId = this.followUpForm.alertId;

    this.workflows.createScanRequest({
      target_member: this.followUpForm.targetMemberId,
      department: this.followUpForm.departmentId || null,
      request_type: 're_scan',
      status: 'pending',
      due_at: dueAt
    }).subscribe({
      next: () => {
        this.followUpSubmitting = false;
        this.updateBusy = false;
        this.updateBusyAlertId = '';
        this.showFollowUpModal = false;
        this.feedbackMessage = 'Follow-up scan request sent.';
        this.togglePageScrollLock(Boolean(this.selectedAlert));

        const row = this.alerts.find((item) => item.id === this.followUpForm.alertId) ?? this.selectedAlert;
        if (row) {
          this.updateAlertAfterFollowUp(row);
          return;
        }
        void this.loadAlerts(true);
      },
      error: (error: unknown) => {
        this.followUpSubmitting = false;
        this.updateBusy = false;
        this.updateBusyAlertId = '';
        this.feedbackMessage = this.resolveActionError(error, 'Could not request a follow-up scan.');
      }
    });
  }

  markSeen(row: AlertViewModel): void {
    void this.patchAlert(row, {
      status: 'seen'
    }, 'Alert marked as seen.', 'mark_seen');
  }

  markReviewed(row: AlertViewModel): void {
    const actorId = this.companyContext.snapshot().context.userId;
    void this.patchAlert(row, {
      status: 'reviewed',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString()
    }, 'Alert marked as reviewed.', 'mark_reviewed');
  }

  markResolved(row: AlertViewModel): void {
    const actorId = this.companyContext.snapshot().context.userId;
    void this.patchAlert(row, {
      status: 'resolved',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString()
    }, 'Alert marked as resolved.', 'resolve');
  }

  overrideAlert(row: AlertViewModel): void {
    const actorId = this.companyContext.snapshot().context.userId;
    void this.patchAlert(row, {
      status: 'overridden',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString()
    }, 'Alert overridden.', 'override');
  }

  onQueueRowClick(row: AlertViewModel, event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    this.viewAlert(row);
  }

  statusBadgeClass(status: BackendAlertStatus): string {
    if (status === 'resolved') return 'alerts-status alerts-status--resolved';
    if (status === 'reviewed') return 'alerts-status alerts-status--reviewed';
    if (status === 'seen') return 'alerts-status alerts-status--seen';
    if (status === 'overridden') return 'alerts-status alerts-status--overridden';
    return 'alerts-status alerts-status--open';
  }

  severityBadgeClass(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized === 'critical') return 'alerts-severity alerts-severity--critical';
    if (normalized === 'high') return 'alerts-severity alerts-severity--high';
    if (normalized === 'medium') return 'alerts-severity alerts-severity--medium';
    return 'alerts-severity alerts-severity--low';
  }

  private async loadAlerts(force = false): Promise<void> {
    const runId = ++this.loadRunId;
    this.pageState = 'loading';
    this.errorMessage = '';

    try {
      const activeContext = await this.companyContext.ensureActiveContext();
      if (runId !== this.loadRunId) return;

      if (!activeContext?.activeMembership?.id || !activeContext.activeBusinessProfile?.id) {
        await this.router.navigate(['/app/workspace-access']);
        this.pageState = 'ready';
        return;
      }

      if (this.currentRole === 'employee') {
        await this.router.navigate(['/app/workspace-access']);
        this.pageState = 'ready';
        return;
      }

      const pageData = await firstValueFrom(this.workflows.getAlertsPageData(force).pipe(timeout(25000)));
      if (runId !== this.loadRunId) return;

      this.alerts = (pageData?.rows ?? []).map((raw) => this.normalizeAlert(raw));
      this.departments = pageData?.departments ?? [];

      this.applyFilters();
      if (!this.departments.length && this.alerts.length > 0) {
        this.warningMessage = 'Some optional sections could not load completely. Alert queue data is still available.';
      } else {
        this.warningMessage = '';
      }

      const alertId = this.route.snapshot.queryParamMap.get('alert');
      if (alertId) {
        this.selectedAlert = this.filteredAlerts.find((item) => item.id === alertId) ?? this.alerts.find((item) => item.id === alertId) ?? null;
        if (this.selectedAlert) {
          this.reviewNoteDraft = this.selectedAlert.actionNote;
          this.reviewActionTypeDraft = this.selectedAlert.actionType || 'none';
          this.togglePageScrollLock(true);
        }
        void this.loadSelectedAlertDetails(alertId);
      }

      this.pageState = 'ready';
    } catch (error: unknown) {
      if (runId !== this.loadRunId) return;

      console.error('[Alerts] load failed', error);
      this.errorMessage = 'Alerts could not be loaded.';
      this.pageState = 'error';
    } finally {
      if (runId === this.loadRunId && this.pageState === 'loading') {
        this.pageState = this.errorMessage ? 'error' : 'ready';
      }
      this.cdr.markForCheck();
    }
  }

  private normalizeAlert(raw: AlertRow): AlertViewModel {
    const context = this.companyContext.snapshot().context;
    const normalizedSeverity = this.normalizeSeverity(raw.severity);
    const status = this.normalizeStatus(raw.status);
    const createdTs = this.toTimestamp(raw.date_created);

    const hasProfileLink = Boolean(raw.target_user_id || raw.target_user_name || raw.target_user_email);
    const targetName = hasProfileLink
      ? sanitizeDisplayValue(raw.target_user_name ?? raw.target_member_label, 'Unknown member')
      : 'Unknown member';
    const targetEmail = sanitizeDisplayValue(raw.target_user_email, '-');
    const workspaceName = sanitizeDisplayValue(raw.business_profile_name || context.activeBusinessProfileName, 'Current workspace');
    const departmentName = sanitizeDisplayValue(raw.department_name || context.activeDepartmentName, 'Unassigned');
    const reviewedByName = sanitizeDisplayValue(raw.reviewed_by_name, '');
    const reviewedByEmail = sanitizeDisplayValue(raw.reviewed_by_email, '');
    const reviewedByLabel = reviewedByName || reviewedByEmail || 'Not reviewed yet';
    const reviewedAtLabel = this.formatDateTime(raw.reviewed_at);

    return {
      id: raw.id,
      source: raw,
      title: raw.title || 'Readiness needs attention',
      message: raw.message || 'This alert indicates the scan may need operational review.',
      severity: normalizedSeverity,
      status,
      statusLabel: this.statusLabel(status),
      departmentId: raw.department_id,
      departmentName,
      targetMemberId: raw.target_member_id,
      targetUserId: raw.target_user_id,
      employeeName: targetName,
      employeeEmail: targetEmail,
      employeeHelperText: hasProfileLink ? '' : 'Profile link missing',
      memberRole: raw.target_member_role || 'Not specified',
      workspaceName,
      scanId: raw.scan_id,
      scanStatusLabel: this.scanStatusLabel(raw.scan_status),
      scanDateLabel: this.formatDateTime(raw.scan_date_created),
      reviewedAt: raw.reviewed_at,
      reviewedAtLabel,
      reviewedById: raw.reviewed_by_id,
      reviewedByName: reviewedByName || '-',
      reviewedByEmail,
      reviewedByLabel,
      actionNote: raw.action_note || '',
      actionType: raw.action_type || 'none',
      actionTypeLabel: this.actionTypeLabel(raw.action_type || 'none'),
      createdAt: raw.date_created,
      createdTs,
      createdLabel: this.formatDateTime(raw.date_created),
      operationalAttention: this.operationalAttentionForSeverity(normalizedSeverity),
      scopeLabel: this.scopeChipLabel,
      explanation: raw.explanation || '',
      recommendedAction: raw.recommended_action || '',
      readinessLabel: raw.readiness_label || '',
      targetMemberDepartmentName: raw.department_name || departmentName,
      reviewedStatusLabel: raw.reviewed_at ? 'Reviewed' : 'Not reviewed',
      relationWarnings: [],
      permissionWarnings: []
    };
  }

  private loadSelectedAlertDetails(alertId: string): void {
    this.selectedAlertLoading = true;
    this.selectedAlertError = '';

    this.workflows.fetchAlertDetails(alertId).pipe(timeout(15000)).subscribe({
      next: (detail) => {
        const normalized = this.normalizeAlertDetails(detail);
        const index = this.alerts.findIndex((item) => item.id === normalized.id);
        if (index >= 0) {
          this.alerts[index] = normalized;
          this.applyFilters();
        }
        this.selectedAlert = normalized;
        this.reviewNoteDraft = normalized.actionNote;
        this.reviewActionTypeDraft = normalized.actionType || 'none';
        this.selectedAlertLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        this.selectedAlertLoading = false;
        this.selectedAlertError = status === 403
          ? 'Alert details are permission blocked for the current workspace role.'
          : 'Alert details could not be loaded.';
        this.cdr.markForCheck();
      }
    });
  }

  private normalizeAlertDetails(raw: AlertDetailsRow): AlertViewModel {
    const base = this.normalizeAlert(raw);
    return {
      ...base,
      departmentName: sanitizeDisplayValue(raw.department_name || raw.target_member_department_name, base.departmentName),
      targetMemberDepartmentName: sanitizeDisplayValue(raw.target_member_department_name || raw.department_name, base.departmentName),
      explanation: raw.explanation || '',
      recommendedAction: raw.recommended_action || '',
      readinessLabel: raw.readiness_label || '',
      reviewedStatusLabel: raw.reviewed_status_label || (raw.reviewed_at ? 'Reviewed' : 'Not reviewed'),
      relationWarnings: [...raw.relationWarnings],
      permissionWarnings: [...raw.permissionWarnings]
    };
  }

  private applyFilters(): void {
    const search = this.filters.search.trim().toLowerCase();
    const dateRange = this.resolveDateRange();

    this.filteredAlerts = this.alerts.filter((row) => {
      const matchesStatus = this.filters.status === 'all' || row.status === this.filters.status;
      const matchesSeverity = !this.filters.severity || row.severity === this.filters.severity;
      const matchesDepartment = !this.filters.department || row.departmentId === this.filters.department;
      const matchesDate = !dateRange || (row.createdTs >= dateRange.start && row.createdTs < dateRange.end);
      const matchesSearch =
        !search ||
        row.employeeName.toLowerCase().includes(search) ||
        row.employeeEmail.toLowerCase().includes(search) ||
        row.title.toLowerCase().includes(search) ||
        row.message.toLowerCase().includes(search);

      return matchesStatus && matchesSeverity && matchesDepartment && matchesDate && matchesSearch;
    }).sort((a, b) => b.createdTs - a.createdTs);

    this.computeSummary(this.alerts);
  }

  private computeSummary(source: AlertViewModel[]): void {
    const today = this.todayRange();
    const rows = source ?? [];

    this.summary = {
      openAlerts: rows.filter((row) => row.status === 'new').length,
      highRiskCriticalToday: rows.filter((row) => {
        const highOrCritical = row.severity === 'high' || row.severity === 'critical';
        return highOrCritical && row.createdTs >= today.start && row.createdTs < today.end;
      }).length,
      reviewed: rows.filter((row) => row.status === 'reviewed').length,
      resolvedToday: rows.filter((row) => {
        if (row.status !== 'resolved') return false;
        const ts = this.toTimestamp(row.reviewedAt) || row.createdTs;
        return ts >= today.start && ts < today.end;
      }).length,
      overridden: rows.filter((row) => row.status === 'overridden').length
    };
  }

  private resolveDateRange(): { start: number; end: number } | null {
    if (this.filters.date === 'all') {
      return null;
    }

    const today = this.todayRange();
    if (this.filters.date === 'today') {
      return today;
    }

    if (this.filters.date === 'last7') {
      return { start: today.start - (6 * 24 * 60 * 60 * 1000), end: today.end };
    }

    return { start: today.start - (29 * 24 * 60 * 60 * 1000), end: today.end };
  }

  private todayRange(): { start: number; end: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }

  private formatDateTime(value: string | null): string {
    const ts = this.toTimestamp(value);
    if (!ts) return '-';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ts));
  }

  private normalizeSeverity(value: string | null | undefined): 'low' | 'medium' | 'high' | 'critical' | 'unknown' {
    const normalized = (value ?? '').toString().trim().toLowerCase();
    if (normalized === 'low') return 'low';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'high') return 'high';
    if (normalized === 'critical') return 'critical';
    return 'unknown';
  }

  private normalizeStatus(value: string | null | undefined): BackendAlertStatus {
    const normalized = (value ?? '').toString().trim().toLowerCase();
    if (normalized === 'open') return 'new';
    if (normalized === 'new') return 'new';
    if (normalized === 'seen') return 'seen';
    if (normalized === 'reviewed') return 'reviewed';
    if (normalized === 'resolved') return 'resolved';
    if (normalized === 'overridden') return 'overridden';
    return 'unknown';
  }

  private statusLabel(status: BackendAlertStatus): 'Open' | 'Seen' | 'Reviewed' | 'Resolved' | 'Overridden' | 'Unknown' {
    if (status === 'new') return 'Open';
    if (status === 'seen') return 'Seen';
    if (status === 'reviewed') return 'Reviewed';
    if (status === 'resolved') return 'Resolved';
    if (status === 'overridden') return 'Overridden';
    return 'Unknown';
  }

  private operationalAttentionForSeverity(severity: AlertViewModel['severity']): string {
    if (severity === 'low') return 'Low operational attention';
    if (severity === 'medium') return 'Medium operational attention';
    if (severity === 'high') return 'High operational attention';
    if (severity === 'critical') return 'Critical operational attention';
    return 'Low operational attention';
  }

  private actionTypeLabel(value: string): string {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized || normalized === 'none') return 'Operational review pending';
    if (normalized === 're_scan') return 'Follow-up scan requested';
    if (normalized === 'rest_advised') return 'Rest advised';
    if (normalized === 'reassigned') return 'Task reassigned';
    if (normalized === 'held_from_task') return 'Held from task';
    if (normalized === 'override') return 'Overridden';
    if (normalized === 'escalated') return 'Escalated';
    return normalized.replace(/_/g, ' ');
  }

  private scanStatusLabel(value: string | null): string {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return 'Scan linked';
    return normalized.replace(/_/g, ' ');
  }

  private async patchAlert(
    row: AlertViewModel,
    payload: AlertActionInput,
    successMessage: string,
    actionName: 'mark_seen' | 'mark_reviewed' | 'resolve' | 'override'
  ): Promise<void> {
    if (!this.canUpdateAlerts() || this.updateBusy) {
      return;
    }

    this.updateBusy = true;
    this.updateBusyAlertId = row.id;

    this.workflows.updateAlert(row.id, payload).subscribe({
      next: (response) => {
        const patchedStatus = this.resolvePatchedStatus(response, payload);
        if (this.selectedAlert?.id === row.id && patchedStatus) {
          this.selectedAlert = {
            ...this.selectedAlert,
            status: patchedStatus,
            statusLabel: this.statusLabel(patchedStatus),
            reviewedAt: payload.reviewed_at ?? this.selectedAlert.reviewedAt,
            reviewedAtLabel: this.formatDateTime(payload.reviewed_at ?? this.selectedAlert.reviewedAt),
            reviewedById: payload.reviewed_by ?? this.selectedAlert.reviewedById,
            actionNote: payload.action_note ?? this.selectedAlert.actionNote,
            actionType: payload.action_type ?? this.selectedAlert.actionType,
            actionTypeLabel: this.actionTypeLabel(payload.action_type ?? this.selectedAlert.actionType)
          };
        }
        this.updateBusy = false;
        this.updateBusyAlertId = '';
        this.feedbackMessage = successMessage;
        void this.loadAlerts(true).then(() => {
          if (!patchedStatus) {
            return;
          }
          const refetchedStatus = this.alerts.find((item) => item.id === row.id)?.status ?? null;
          if (refetchedStatus && refetchedStatus !== patchedStatus) {
            console.warn('[Alerts] status rollback after refetch', {
              patchedStatus,
              refetchedStatus,
              alertId: row.id
            });
          }
        });
      },
      error: (error: unknown) => {
        this.updateBusy = false;
        this.updateBusyAlertId = '';

        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status === 403) {
          console.warn('[Alerts] action forbidden', actionName, error);
        }
        if (status === 403 && this.currentRole === 'manager') {
          this.managerUpdateDenied = true;
        }

        this.feedbackMessage = this.resolveActionError(error, 'Could not update this alert.');
      }
    });
  }

  private resolvePatchedStatus(
    response: Record<string, unknown> | null,
    payload: AlertActionInput
  ): BackendAlertStatus | null {
    const responseStatus = typeof response?.['status'] === 'string' ? response['status'] : null;
    const fallbackStatus = typeof payload.status === 'string' ? payload.status : null;
    const value = responseStatus || fallbackStatus;
    if (!value) {
      return null;
    }
    return this.normalizeStatus(value);
  }

  private updateAlertAfterFollowUp(row: AlertViewModel): void {
    const actorId = this.companyContext.snapshot().context.userId;
    const nextNote = row.actionNote?.trim() || this.reviewNoteDraft.trim() || 'Follow-up readiness scan requested for this alert.';
    const payload: AlertActionInput = {
      status: 'reviewed',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      action_type: 're_scan',
      action_note: nextNote
    };

    this.workflows.updateAlert(row.id, payload).subscribe({
      next: () => {
        if (this.selectedAlert?.id === row.id) {
          this.reviewNoteDraft = nextNote;
          this.reviewActionTypeDraft = 're_scan';
        }
        void this.loadAlerts(true);
      },
      error: (error: unknown) => {
        console.warn('[Alerts] follow-up alert patch skipped', error);
        void this.loadAlerts(true);
      }
    });
  }

  private resolveFollowUpDueAt(): string | null {
    const now = new Date();
    if (this.followUpForm.duePreset === 'end_of_today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0).toISOString();
    }
    if (this.followUpForm.duePreset === 'in_2_hours') {
      return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    }

    const parsed = this.toTimestamp(this.followUpForm.customDueAt);
    return parsed ? new Date(parsed).toISOString() : null;
  }

  private emptyFollowUpForm(): FollowUpScanForm {
    return {
      alertId: '',
      alertTitle: '',
      targetMemberId: '',
      targetUserLabel: '',
      targetUserEmail: '',
      departmentId: '',
      departmentLabel: 'Unassigned',
      workspaceLabel: 'Current workspace',
      message: '',
      priority: 'normal',
      duePreset: 'end_of_today',
      customDueAt: ''
    };
  }

  private resolveActionError(error: unknown, fallback: string): string {
    const status = (error as { status?: number } | null)?.status ?? 0;
    if (status === 403) {
      return 'This action is not allowed by workspace permissions.';
    }

    const message =
      (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.extensions?.reason ??
      (error as { error?: { errors?: Array<{ message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.message ??
      (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
      (error as { message?: string } | null)?.message;

    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    return fallback;
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private togglePageScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.style.overflow = locked ? 'hidden' : '';
  }
}
