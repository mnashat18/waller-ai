import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  ComplianceService,
  type ComplianceExceptionRow,
  type ComplianceFilters,
  type ComplianceOverviewData,
  type DepartmentComplianceRow,
  type ProfileLinkageIssueRow
} from '../../services/compliance.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';

type ComplianceViewState = 'loading' | 'ready' | 'error' | 'permission' | 'noWorkspace';
type DepartmentRequestDueTime = '' | 'endOfToday' | 'in1Hour' | 'in2Hours' | 'custom';
type DepartmentRequestPriority = 'normal' | 'high' | 'urgent';

type DepartmentRequestForm = {
  dueTime: DepartmentRequestDueTime;
  customDueAt: string;
  priority: DepartmentRequestPriority;
  message: string;
};

@Component({
  selector: 'app-compliance-page',
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
  templateUrl: './compliance.html',
  styleUrls: ['./compliance.css']
})
export class CompliancePageComponent implements OnInit, OnDestroy {
  viewState: ComplianceViewState = 'loading';
  loading = true;
  errorMessage = '';
  partialWarning = '';
  overview: ComplianceOverviewData | null = null;
  exporting = false;
  feedback: { type: 'success' | 'error'; text: string } | null = null;
  showDepartmentRequestModal = false;
  sendingDepartmentRequest = false;
  departmentRequestTarget: DepartmentComplianceRow | null = null;
  departmentRequestErrorMessage = '';
  departmentRequestForm: DepartmentRequestForm = this.defaultDepartmentRequestForm();
  selectedException: ComplianceExceptionRow | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  filters: ComplianceFilters = {
    dateRange: 'today',
    department: '',
    status: 'all',
    readiness: 'all'
  };

  constructor(
    private complianceService: ComplianceService,
    private workflows: OperationsWorkflowsService,
    private companyContext: CompanyContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadCompliance();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.togglePageScrollLock(false);
  }

  get currentRole(): string {
    const role = this.companyContext.snapshot().context.activeMemberRole;
    return (role ?? '').toString().trim().toLowerCase();
  }

  get roleChipLabel(): string {
    if (this.currentRole === 'owner') return 'Owner';
    if (this.currentRole === 'hr') return 'HR';
    if (this.currentRole === 'manager') return 'Manager';
    if (this.currentRole === 'employee') return 'Employee';
    return 'Role unavailable';
  }

  get scopeChipLabel(): string {
    const name = this.companyContext.snapshot().context.activeDepartmentName;
    return name ? `${name} scope` : 'Company-wide scope';
  }

  get canSendScanRequest(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get exportButtonLabel(): string {
    if (this.loading) return 'Preparing...';
    if (this.exporting) return 'Exporting...';
    return 'Export Summary';
  }

  get exportDisabled(): boolean {
    return this.loading || this.exporting || this.viewState === 'noWorkspace' || this.viewState === 'permission';
  }

  get departmentRows(): DepartmentComplianceRow[] {
    return this.overview?.departmentRows ?? [];
  }

  get exceptionRows(): ComplianceExceptionRow[] {
    return this.overview?.exceptionRows ?? [];
  }

  get profileLinkageIssues(): ProfileLinkageIssueRow[] {
    return this.overview?.profileLinkageIssues ?? [];
  }

  get actionSummaryItems(): string[] {
    const summary = this.overview?.summary;
    if (!summary) return [];
    return [
      `${summary.missingScans} members are missing scans`,
      `${summary.overdueRequests} scan requests are overdue`,
      `${summary.highAttention ?? '--'} high attention readiness cases`,
      `${summary.openAlerts} open alerts need review`
    ];
  }

  get actionSummaryRecommendation(): string {
    const summary = this.overview?.summary;
    if (!summary) return '';
    if (summary.highAttention === null) return 'Recommended action: Restore scan_results access to review readiness outcomes.';
    if (summary.missingScans > 0) return 'Recommended action: Send scan requests to missing members.';
    if (summary.overdueRequests > 0) return 'Recommended action: Follow up on overdue scan requests.';
    if (summary.openAlerts > 0) return 'Recommended action: Review open alerts.';
    return 'Workspace is clear for the selected range.';
  }

  get summaryMissingScans(): number {
    return this.overview?.summary?.missingScans ?? 0;
  }

  get summaryOverdueRequests(): number {
    return this.overview?.summary?.overdueRequests ?? 0;
  }

  get summaryHighAttention(): number {
    return this.overview?.summary?.highAttention ?? 0;
  }

  get summaryOpenAlerts(): number {
    return this.overview?.summary?.openAlerts ?? 0;
  }

  get highAttentionDisplay(): string {
    const value = this.overview?.summary?.highAttention;
    return value === null || value === undefined ? '--' : String(value);
  }

  get highAttentionHelper(): string {
    return this.overview?.readinessWarning ?? 'Needs follow-up';
  }

  get departmentGroupingWarning(): string {
    return this.overview?.departmentGroupingWarning ?? '';
  }

  get readinessWarning(): string {
    return this.overview?.readinessWarning ?? '';
  }

  get isWorkspaceClear(): boolean {
    const summary = this.overview?.summary;
    if (!summary) return false;
    if (summary.highAttention === null) return false;
    return (
      summary.missingScans === 0 &&
      summary.overdueRequests === 0 &&
      summary.highAttention === 0 &&
      summary.openAlerts === 0
    );
  }

  refresh(): void {
    void this.loadCompliance(true);
  }

  applyFilters(): void {
    void this.loadCompliance(false);
  }

  clearFilters(): void {
    this.filters = {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    };
    void this.loadCompliance(false);
  }

  goToScanRequests(): void {
    void this.router.navigate(['/app/scan-requests'], {
      queryParams: { create: '1' }
    });
  }

  exportComplianceSummaryCsv(): void {
    if (this.exportDisabled) {
      return;
    }

    this.exporting = true;
    try {
      const summary = this.overview?.summary ?? {
        complianceRate: 0,
        completedScans: 0,
        missingScans: 0,
        openAlerts: 0,
        highAttention: 0,
        overdueRequests: 0,
        scanEligibleMembersToday: 0
      };
      const departmentRows = this.departmentRows ?? [];
      const exceptionRows = this.exceptionRows ?? [];

      const lines: string[] = [];
      lines.push('Section 1: Summary');
      lines.push(this.toCsvLine(['Metric', 'Value']));
      lines.push(this.toCsvLine(['Compliance Rate', `${summary.complianceRate}%`]));
      lines.push(this.toCsvLine(['Completed Scans', String(summary.completedScans)]));
      lines.push(this.toCsvLine(['Missing Scans', String(summary.missingScans)]));
      lines.push(this.toCsvLine(['Open Alerts', String(summary.openAlerts)]));
      lines.push(this.toCsvLine(['High Attention', String(summary.highAttention)]));
      lines.push(this.toCsvLine(['Overdue Requests', String(summary.overdueRequests)]));
      lines.push('');

      lines.push('Section 2: Department Compliance');
      lines.push(this.toCsvLine([
        'Department',
        'Active Members',
        'Scan Eligible',
        'Completed Today',
        'Missing Scans',
        'Compliance Rate',
        'Open Alerts'
      ]));
      for (const row of departmentRows) {
        lines.push(this.toCsvLine([
          row.departmentName,
          String(row.activeMembers),
          String(row.scanEligible),
          String(row.completedToday),
          String(row.missingScans),
          `${row.complianceRate}%`,
          String(row.openAlerts)
        ]));
      }
      lines.push('');

      lines.push('Section 3: Compliance Exceptions');
      lines.push(this.toCsvLine([
        'Member',
        'Email',
        'Department',
        'Expected Check',
        'Today Scan',
        'Readiness',
        'Alert Status',
        'Last Scan'
      ]));
      for (const row of exceptionRows) {
        lines.push(this.toCsvLine([
          row.memberName,
          row.memberEmail,
          row.departmentName,
          row.expectedCheck,
          row.todayScan,
          row.readiness,
          row.alertStatus,
          row.lastScanLabel
        ]));
      }

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const filename = `wellar-compliance-summary-${yyyy}-${mm}-${dd}.csv`;
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.pushFeedback('success', 'Compliance summary exported.');
    } catch {
      this.pushFeedback('error', 'Could not export compliance summary.');
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  viewDepartmentInWorkforce(row: DepartmentComplianceRow): void {
    void this.router.navigate(['/app/workforce'], {
      queryParams: row.departmentId ? { department: row.departmentId } : { department: 'unassigned' }
    });
  }

  viewMemberInWorkforce(row: ComplianceExceptionRow): void {
    void this.router.navigate(['/app/workforce'], {
      queryParams: row.departmentId ? { department: row.departmentId, member: row.memberId } : { department: 'unassigned', member: row.memberId }
    });
  }

  reviewLinkageIssueInWorkforce(row: ProfileLinkageIssueRow): void {
    void this.router.navigate(['/app/workforce'], {
      queryParams: { member: row.membershipId }
    });
  }

  sendDepartmentRequest(row: DepartmentComplianceRow): void {
    if (!this.canSendScanRequest) {
      this.pushFeedback('error', 'Only Owner or HR can send scan requests.');
      return;
    }

    if (!this.canSendDepartmentRequest(row)) {
      this.pushFeedback('error', 'No eligible members');
      return;
    }

    this.departmentRequestTarget = row;
    this.departmentRequestErrorMessage = '';
    this.departmentRequestForm = this.defaultDepartmentRequestForm();
    this.showDepartmentRequestModal = true;
    this.togglePageScrollLock(true);
  }

  closeDepartmentRequestModal(): void {
    if (this.sendingDepartmentRequest) {
      return;
    }

    this.showDepartmentRequestModal = false;
    this.departmentRequestTarget = null;
    this.departmentRequestErrorMessage = '';
    this.departmentRequestForm = this.defaultDepartmentRequestForm();
    if (!this.selectedException) {
      this.togglePageScrollLock(false);
    }
  }

  canSendDepartmentRequest(row: DepartmentComplianceRow): boolean {
    return row.scanEligible > 0 || row.missingScans > 0;
  }

  isDepartmentRequestActionDisabled(row: DepartmentComplianceRow): boolean {
    return !this.canSendScanRequest || !this.canSendDepartmentRequest(row);
  }

  get canSubmitDepartmentRequest(): boolean {
    if (!this.departmentRequestTarget || !this.canSendScanRequest || this.sendingDepartmentRequest) {
      return false;
    }

    if (!this.canSendDepartmentRequest(this.departmentRequestTarget)) {
      return false;
    }

    if (this.departmentRequestForm.dueTime === 'custom') {
      return this.toTimestamp(this.departmentRequestForm.customDueAt) > 0;
    }

    return this.departmentRequestForm.dueTime !== '';
  }

  async submitDepartmentRequest(): Promise<void> {
    const row = this.departmentRequestTarget;
    if (!row || !this.canSubmitDepartmentRequest) {
      return;
    }

    const dueAt = this.resolveDepartmentDueAtIso();
    if (!dueAt) {
      this.departmentRequestErrorMessage = 'Due time is required.';
      this.cdr.markForCheck();
      return;
    }

    this.departmentRequestErrorMessage = '';
    this.sendingDepartmentRequest = true;
    this.cdr.markForCheck();

    try {
      const payload = {
        request_type: 'bulk',
        status: 'pending',
        due_at: dueAt,
        requested_by_user: this.companyContext.snapshot().context.userId,
        department: row.departmentId ?? null
      };

      const createdCount = row.departmentId
        ? await firstValueFrom(this.workflows.createDepartmentScanRequests(payload))
        : await firstValueFrom(this.workflows.createUnassignedScanRequests(payload));

      if (!createdCount || createdCount <= 0) {
        this.departmentRequestErrorMessage = row.departmentId
          ? 'This department has no active scan-eligible members.'
          : 'Unassigned members have no active scan-eligible members.';
        this.cdr.markForCheck();
        return;
      }

      this.showDepartmentRequestModal = false;
      this.departmentRequestTarget = null;
      this.departmentRequestForm = this.defaultDepartmentRequestForm();
      this.togglePageScrollLock(false);

      await Promise.allSettled([this.loadCompliance(true), this.refreshScanRequestsData()]);
      this.pushFeedback('success', 'Scan request sent to eligible members.');
    } catch (error: unknown) {
      console.error('[Compliance] department scan request failed', error);
      this.departmentRequestErrorMessage = this.describeDepartmentRequestError(error);
      this.cdr.markForCheck();
    } finally {
      this.sendingDepartmentRequest = false;
      this.cdr.markForCheck();
    }
  }

  departmentRequestButtonLabel(row: DepartmentComplianceRow): string {
    if (!this.canSendScanRequest) {
      return 'Not allowed';
    }
    return this.canSendDepartmentRequest(row) ? 'Send request' : 'No eligible members';
  }

  departmentRequestTooltip(row: DepartmentComplianceRow): string | null {
    if (!this.canSendScanRequest) {
      return 'Only Owner or HR can send scan requests.';
    }
    if (!this.canSendDepartmentRequest(row)) {
      return 'This department has no active scan-eligible members.';
    }
    return null;
  }

  departmentRequestReason(row: DepartmentComplianceRow): string {
    if (!this.canSendScanRequest) {
      return 'Only Owner or HR can send scan requests.';
    }
    if (this.canSendDepartmentRequest(row)) {
      return `Eligible members: ${row.scanEligible}`;
    }
    return 'No active scan-eligible members in this department.';
  }

  departmentRequestTargetName(row: DepartmentComplianceRow): string {
    return row.departmentId ? row.departmentName : 'Unassigned members';
  }

  departmentFollowUpLabel(row: DepartmentComplianceRow): string {
    if (row.scanEligible <= 0) return 'No eligible members';
    if (row.missingScans > 0) return 'Needs follow-up';
    return 'Clear';
  }

  departmentFollowUpClass(row: DepartmentComplianceRow): string {
    if (row.scanEligible <= 0) return 'compliance-pill compliance-pill--neutral';
    if (row.missingScans > 0) return 'compliance-pill compliance-pill--warning';
    return 'compliance-pill compliance-pill--success';
  }

  viewMember(row: ComplianceExceptionRow): void {
    this.selectedException = row;
    this.togglePageScrollLock(true);
  }

  closeMemberModal(): void {
    this.selectedException = null;
    if (!this.showDepartmentRequestModal) {
      this.togglePageScrollLock(false);
    }
  }

  reviewAlert(row: ComplianceExceptionRow): void {
    if (!row.openAlertId) {
      return;
    }

    void this.router.navigate(['/app/alerts'], {
      queryParams: { alert: row.openAlertId }
    });
  }

  sendMemberRequest(row: ComplianceExceptionRow): void {
    if (!this.canSendScanRequest || this.currentRole === 'employee') {
      return;
    }

    void this.router.navigate(['/app/scan-requests'], {
      queryParams: { member: row.memberId }
    });
  }

  trackByDepartment(index: number, row: DepartmentComplianceRow): string {
    return row.key || String(index);
  }

  trackByException(index: number, row: ComplianceExceptionRow): string {
    return row.memberId || String(index);
  }

  trackByActivity(index: number, row: { id: string }): string {
    return row.id || String(index);
  }

  trackByLinkage(index: number, row: ProfileLinkageIssueRow): string {
    return row.membershipId || String(index);
  }

  openRequestStatusLabel(row: ComplianceExceptionRow): string {
    const status = (row.openRequestStatus ?? '').trim().toLowerCase();
    if (!status) return 'No request scheduled';
    if (status.includes('complete')) return 'Completed';
    if (status.includes('cancel')) return 'Cancelled';
    if (status.includes('expire')) return 'Expired';
    if (status.includes('overdue')) return 'Overdue';
    return 'Pending';
  }

  toDisplayRole(value: string | null | undefined): string {
    const role = (value ?? '').trim().toLowerCase();
    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';
    return role ? role : 'Employee';
  }

  toDisplayStatus(value: string | null | undefined): string {
    const status = (value ?? '').trim().toLowerCase();
    if (status === 'active') return 'Active';
    if (status === 'inactive') return 'Inactive';
    if (status === 'pending') return 'Pending';
    if (status === 'suspended') return 'Suspended';
    return status ? status : 'Unknown';
  }

  exceptionProblemType(row: ComplianceExceptionRow): string {
    if (row.todayScan === 'Overdue') return 'Overdue request';
    if (row.alertStatus === 'Open') return 'Open alert';
    if (row.readiness === 'High Risk' || row.readiness === 'Elevated Fatigue') return 'High attention';
    if (row.todayScan === 'Missing') return 'Missing scan';
    return 'Needs attention';
  }

  readinessBadgeClass(value: string): string {
    if (value === 'High Risk') return 'compliance-pill compliance-pill--danger';
    if (value === 'Elevated Fatigue') return 'compliance-pill compliance-pill--warning';
    if (value === 'Low Focus') return 'compliance-pill compliance-pill--info';
    if (value === 'Stable') return 'compliance-pill compliance-pill--success';
    return 'compliance-pill compliance-pill--neutral';
  }

  todayScanBadgeClass(value: ComplianceExceptionRow['todayScan']): string {
    if (value === 'Overdue') return 'compliance-pill compliance-pill--danger';
    if (value === 'Missing') return 'compliance-pill compliance-pill--warning';
    if (value === 'Completed') return 'compliance-pill compliance-pill--success';
    return 'compliance-pill compliance-pill--neutral';
  }

  alertBadgeClass(value: ComplianceExceptionRow['alertStatus']): string {
    if (value === 'Open') return 'compliance-pill compliance-pill--danger';
    if (value === 'Reviewed') return 'compliance-pill compliance-pill--info';
    if (value === 'Resolved') return 'compliance-pill compliance-pill--success';
    return 'compliance-pill compliance-pill--neutral';
  }

  private async loadCompliance(refresh = true): Promise<void> {
    this.loading = true;
    this.viewState = 'loading';
    this.errorMessage = '';
    this.partialWarning = '';
    try {
      const context = await this.companyContext.ensureActiveContext();

      if (!context?.activeMembership?.id || !context?.activeBusinessProfile?.id) {
        this.overview = null;
        this.viewState = 'noWorkspace';
        return;
      }

      if ((context.activeMemberRole ?? '').toLowerCase() === 'employee') {
        this.overview = null;
        this.viewState = 'permission';
        return;
      }

      const overview = await this.complianceService.loadComplianceOverview(context, this.filters, refresh);
      this.overview = overview;
      this.partialWarning = overview.partialWarning ?? '';

      if (overview.permissionDenied) {
        this.viewState = 'permission';
      } else {
        this.viewState = 'ready';
      }
    } catch (error: unknown) {
      const status = (error as { status?: number } | null)?.status ?? 0;
      const message = (error as { message?: string } | null)?.message ?? '';

      if (message.includes('NO_ACTIVE_WORKSPACE')) {
        this.viewState = 'noWorkspace';
      } else if (message.includes('ROLE_FORBIDDEN') || status === 403) {
        this.viewState = 'permission';
      } else {
        this.viewState = 'error';
        this.errorMessage = 'Compliance data could not be loaded.';
      }
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private toCsvLine(values: string[]): string {
    return values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
  }

  private defaultDepartmentRequestForm(): DepartmentRequestForm {
    return {
      dueTime: 'endOfToday',
      customDueAt: '',
      priority: 'normal',
      message: ''
    };
  }

  private resolveDepartmentDueAtIso(): string | null {
    const now = new Date();
    const dueTime = this.departmentRequestForm.dueTime;

    if (dueTime === 'endOfToday') {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
      return endOfDay.toISOString();
    }

    if (dueTime === 'in1Hour') {
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    }

    if (dueTime === 'in2Hours') {
      return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    }

    if (dueTime === 'custom') {
      const ts = this.toTimestamp(this.departmentRequestForm.customDueAt);
      return ts > 0 ? new Date(ts).toISOString() : null;
    }

    return null;
  }

  private async refreshScanRequestsData(): Promise<void> {
    const context = await this.companyContext.ensureActiveContext();
    const businessProfileId = this.normalizeId(context?.activeBusinessProfile?.id);
    if (!businessProfileId) {
      return;
    }
    await this.workflows.loadScanRequestsSafe(businessProfileId);
  }

  private pushFeedback(type: 'success' | 'error', text: string): void {
    this.feedback = { type, text };
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      this.cdr.markForCheck();
    }, 3200);
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private describeDepartmentRequestError(error: unknown): string {
    const response = error as {
      status?: number;
      message?: string;
      error?: {
        message?: string;
        errors?: Array<{ message?: string; extensions?: { reason?: string } }>;
      };
    };
    const status = typeof response?.status === 'number' ? response.status : 0;
    const detail =
      response?.error?.errors?.[0]?.extensions?.reason ??
      response?.error?.errors?.[0]?.message ??
      response?.error?.message ??
      response?.message ??
      '';

    if (status === 403 || detail.toLowerCase().includes('cannot create scan requests')) {
      return 'You do not have permission to send scan requests for this workspace.';
    }

    return detail || 'Failed to send scan request.';
  }

  private togglePageScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }
}
