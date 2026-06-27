import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  ComplianceService,
  type ComplianceExceptionRow,
  type ComplianceFilters,
  type ComplianceOverviewData,
  type DepartmentComplianceRow,
  type RecentComplianceActivityItem
} from '../../services/compliance.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';

type ComplianceViewState = 'loading' | 'ready' | 'error' | 'permission' | 'noWorkspace' | 'scopeUnavailable';
type FeedbackMessage = {
  type: 'info' | 'error';
  text: string;
};

@Component({
  selector: 'app-compliance-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    DashboardSectionComponent,
    FilterBarShellComponent,
    ErrorStateComponent,
    KpiCardComponent,
    TableShellComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    ViewportDialogComponent
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
  feedback: FeedbackMessage | null = null;
  selectedException: ComplianceExceptionRow | null = null;

  filters: ComplianceFilters = {
    dateRange: 'today',
    department: '',
    status: 'all',
    readiness: 'all'
  };

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private complianceService: ComplianceService,
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
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedException) {
      this.closeExceptionDetails();
    }
  }

  get currentRole(): string {
    return String(this.companyContext.snapshot().context.activeMemberRole ?? '').trim().toLowerCase();
  }

  get isManager(): boolean {
    return this.currentRole === 'manager';
  }

  get isOwnerOrHr(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get pageDescription(): string {
    if (this.isManager) {
      const department = this.managerDepartmentName;
      return department
        ? `Department-scoped coverage, exceptions, and evidence follow-up for ${department}.`
        : 'Department-scoped coverage and follow-up.';
    }

    return 'Organization-level coverage, exceptions, and evidence visibility for operational follow-up.';
  }

  get managerDepartmentName(): string {
    return this.companyContext.snapshot().context.activeDepartmentName || 'the active department';
  }

  get scopeLabel(): string {
    return this.isManager ? `${this.managerDepartmentName} scope` : 'Organization coverage';
  }

  get roleLabel(): string {
    if (this.currentRole === 'owner') return 'Owner';
    if (this.currentRole === 'hr') return 'HR';
    if (this.currentRole === 'manager') return 'Manager';
    if (this.currentRole === 'employee') return 'Employee';
    return 'Role unavailable';
  }

  get departmentRows(): DepartmentComplianceRow[] {
    return this.overview?.departmentRows ?? [];
  }

  get exceptionRows(): ComplianceExceptionRow[] {
    const rows = this.overview?.exceptionRows ?? [];
    return this.isManager ? rows.filter((row) => this.hasManagerOperationalReason(row)) : rows;
  }

  get evidenceRows(): RecentComplianceActivityItem[] {
    return this.overview?.activityRows ?? [];
  }

  get departmentDataQualityRows(): DepartmentComplianceRow[] {
    return this.departmentRows.filter((row) => row.departmentName === 'Department unavailable' || row.departmentName === 'Unknown department');
  }

  get departmentDataQualityCount(): number {
    return this.departmentDataQualityRows.reduce((total, row) => total + Math.max(row.activeMembers ?? 0, 0), 0);
  }

  get hasDepartmentDataQualityWarning(): boolean {
    return this.departmentDataQualityCount > 0;
  }

  get showCoverageSummary(): boolean {
    return Boolean(this.overview?.summary) && this.overview?.hasAnyData === true;
  }

  get showCoverageEmpty(): boolean {
    return this.viewState === 'ready' && this.overview?.hasAnyData === true && !this.departmentRows.length;
  }

  get showPageEmpty(): boolean {
    return this.viewState === 'ready' && this.overview?.hasAnyData === false;
  }

  get showFilteredEmpty(): boolean {
    return this.viewState === 'ready' && this.hasActiveFilters() && !this.exceptionRows.length && !this.evidenceRows.length;
  }

  get readinessUnavailable(): boolean {
    return this.overview?.summary?.highAttention === null || this.overview?.scanResultsAccess !== 'available';
  }

  get highAttentionDisplay(): string {
    const value = this.overview?.summary?.highAttention;
    return value === null || value === undefined ? 'Unavailable' : String(value);
  }

  get coverageRateDisplay(): string {
    const summary = this.overview?.summary;
    if (!summary || summary.scanEligibleMembersToday <= 0) {
      return 'Unavailable';
    }
    return `${summary.complianceRate}%`;
  }

  get coverageRateTone(): 'success' | 'warning' | 'neutral' {
    const summary = this.overview?.summary;
    if (!summary || summary.scanEligibleMembersToday <= 0) {
      return 'neutral';
    }
    return summary.complianceRate >= 80 ? 'success' : 'warning';
  }

  get coverageDescription(): string {
    return this.isManager
      ? 'Completion coverage for the active department using returned scoped data.'
      : 'Completion coverage across returned organization data, with department comparison when available.';
  }

  get exceptionsDescription(): string {
    return this.isManager
      ? 'Department members with missing scans, overdue requests, or open alerts.'
      : 'Members with missing, overdue, open-alert, or readiness follow-up signals in the authorized organization scope.';
  }

  get evidenceDescription(): string {
    return this.isManager
      ? 'Readable department-scoped compliance activity from returned scan, request, and alert summaries.'
      : 'Readable compliance activity from returned scan, request, and alert summaries.';
  }

  refresh(): void {
    void this.loadCompliance(true);
  }

  reviewAffectedMembers(): void {
    const reviewDepartmentId = this.departmentDataQualityRows.find((row) => row.departmentId)?.departmentId ?? '';
    void this.router.navigate(['/app/workforce'], {
      state: {
        workforceDepartmentId: reviewDepartmentId,
        workforceReviewReason: 'department-data-quality'
      }
    });
  }

  applyFilters(): void {
    if (this.isManager) {
      this.enforceManagerFilterSafety();
    }
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

  openExceptionDetails(row: ComplianceExceptionRow): void {
    this.selectedException = row;
  }

  closeExceptionDetails(): void {
    this.selectedException = null;
  }

  hasActiveFilters(): boolean {
    return Boolean(
      this.filters.dateRange !== 'today' ||
      (!this.isManager && this.filters.department) ||
      this.filters.status !== 'all' ||
      (!this.isManager && this.filters.readiness !== 'all')
    );
  }

  trackByDepartment(index: number, row: DepartmentComplianceRow): string {
    return row.departmentName || String(index);
  }

  trackByException(index: number, row: ComplianceExceptionRow): string {
    return `${row.memberName}-${row.departmentName}-${row.todayScan}-${index}`;
  }

  trackByEvidence(index: number, row: RecentComplianceActivityItem): string {
    return `${row.type}-${row.title}-${row.happenedAt}-${index}`;
  }

  exceptionProblemType(row: ComplianceExceptionRow): string {
    if (row.todayScan === 'Overdue') return 'Overdue request';
    if (row.alertStatus === 'Open') return 'Open alert';
    if (row.todayScan === 'Missing') return 'Missing scan';
    if (!this.isManager && (row.readiness === 'High Risk' || row.readiness === 'Elevated Fatigue')) {
      return 'Readiness review needed';
    }
    return 'Needs attention';
  }

  openRequestStatusLabel(row: ComplianceExceptionRow): string {
    const status = String(row.openRequestStatus ?? '').trim().toLowerCase();
    if (!status) return 'No request scheduled';
    if (status.includes('complete')) return 'Completed';
    if (status.includes('cancel')) return 'Cancelled';
    if (status.includes('expire')) return 'Expired';
    if (status.includes('overdue')) return 'Overdue';
    return 'Pending';
  }

  toDisplayRole(value: string | null | undefined): string {
    const role = String(value ?? '').trim().toLowerCase();
    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';
    return role ? role : 'Employee';
  }

  toDisplayStatus(value: string | null | undefined): string {
    const status = String(value ?? '').trim().toLowerCase();
    if (status === 'active') return 'Active';
    if (status === 'inactive') return 'Inactive';
    if (status === 'pending') return 'Pending';
    if (status === 'suspended') return 'Suspended';
    return status ? status : 'Unknown';
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

  evidenceTypeLabel(value: RecentComplianceActivityItem['type']): string {
    if (value === 'scan_completed') return 'Scan completion';
    if (value === 'request_sent') return 'Request sent';
    if (value === 'request_overdue') return 'Request overdue';
    if (value === 'alert_created') return 'Alert recorded';
    if (value === 'alert_resolved') return 'Alert closed';
    return 'Compliance activity';
  }

  evidenceDetail(row: RecentComplianceActivityItem): string {
    if (row.type === 'scan_completed') return 'Readiness check completed.';
    if (row.type === 'request_sent') return 'Scan request recorded.';
    if (row.type === 'request_overdue') return 'Request passed its due time.';
    if (row.type === 'alert_created') return 'Operational alert recorded.';
    if (row.type === 'alert_resolved') return 'Operational alert closed.';
    return 'Compliance activity recorded.';
  }

  private async loadCompliance(refresh = true): Promise<void> {
    this.loading = true;
    this.viewState = 'loading';
    this.errorMessage = '';
    this.partialWarning = '';

    try {
      const activeContext = await this.companyContext.ensureActiveContext();
      const role = String(activeContext?.activeMemberRole ?? '').toLowerCase();
      const activeDepartmentId = this.normalizeId(
        this.companyContext.snapshot().context.activeDepartmentId ?? activeContext?.activeMembership?.department
      );

      if (!activeContext?.activeMembership?.id || !activeContext?.activeBusinessProfile?.id) {
        this.overview = null;
        this.viewState = 'noWorkspace';
        return;
      }

      if (role === 'employee') {
        this.overview = null;
        this.viewState = 'permission';
        return;
      }

      if (role === 'manager' && !activeDepartmentId) {
        this.overview = null;
        this.viewState = 'scopeUnavailable';
        return;
      }

      if (role === 'manager') {
        this.enforceManagerFilterSafety();
      }

      const overview = await this.complianceService.loadComplianceOverview(activeContext, this.filters, refresh);
      this.overview = overview;
      this.partialWarning = overview.partialWarning ?? '';
      this.viewState = overview.permissionDenied ? 'permission' : 'ready';
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

  private pushFeedback(type: FeedbackMessage['type'], text: string): void {
    this.feedback = { type, text };
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }

    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      this.cdr.markForCheck();
    }, 3500);
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

  private hasManagerOperationalReason(row: ComplianceExceptionRow): boolean {
    return row.todayScan === 'Missing' || row.todayScan === 'Overdue' || row.alertStatus === 'Open';
  }

  private enforceManagerFilterSafety(): void {
    this.filters.department = '';
    this.filters.readiness = 'all';
    if (this.filters.status === 'attention') {
      this.filters.status = 'all';
    }
  }
}
