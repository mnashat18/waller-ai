import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  ReportsService,
  type AlertsBreakdownRow,
  type ComplianceTrendRow,
  type DepartmentPerformanceRow,
  type MissingScanDetailRow,
  type OverdueRequestDetailRow,
  type ReportsFilters,
  type ReportsViewData
} from '../../services/reports.service';
import { ReportsPdfExportService } from '../../services/reports-pdf-export.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';

type ReportsViewState = 'loading' | 'ready' | 'error' | 'permission' | 'noWorkspace';

@Component({
  selector: 'app-reports-page',
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
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  @ViewChild('missingDetailsSection') missingDetailsSection?: ElementRef<HTMLElement>;
  viewState: ReportsViewState = 'loading';
  loading = true;
  exporting = false;
  pdfExporting = false;
  errorMessage = '';
  partialWarning = '';
  report: ReportsViewData | null = null;
  feedback: { type: 'success' | 'error'; text: string } | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  missingDetailsHighlighted = false;
  missingRowsVisible = 6;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  filters: ReportsFilters = {
    dateRange: 'last7',
    department: '',
    readiness: 'all',
    alertSeverity: 'all'
  };

  constructor(
    private reportsService: ReportsService,
    private reportsPdfExportService: ReportsPdfExportService,
    private companyContext: CompanyContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadReports();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
  }

  get currentRole(): string {
    return (this.companyContext.snapshot().context.activeMemberRole ?? '').toString().toLowerCase();
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

  get exportDisabled(): boolean {
    return this.loading || this.exporting || this.pdfExporting || this.viewState === 'noWorkspace' || this.viewState === 'permission';
  }

  get exportButtonLabel(): string {
    if (this.loading) return 'Preparing...';
    if (this.exporting) return 'Exporting...';
    return 'Export CSV';
  }

  get exportPdfDisabled(): boolean {
    return this.loading || this.exporting || this.pdfExporting || this.viewState === 'noWorkspace' || this.viewState === 'permission';
  }

  get exportPdfButtonLabel(): string {
    if (this.loading) return 'Preparing...';
    if (this.pdfExporting) return 'Exporting...';
    return 'Export PDF';
  }

  get departmentRows(): DepartmentPerformanceRow[] {
    return this.report?.departmentPerformance ?? [];
  }

  get complianceRows(): ComplianceTrendRow[] {
    return this.report?.complianceTrend ?? [];
  }

  get missingScanRows(): MissingScanDetailRow[] {
    return (this.report?.missingScanDetails.rows ?? []).slice(0, this.missingRowsVisible);
  }

  get missingFoundCount(): number {
    return this.report?.missingScanDetails.foundCount ?? 0;
  }

  get missingShownCount(): number {
    return this.report?.missingScanDetails.shownCount ?? 0;
  }

  get missingHiddenCount(): number {
    const total = this.report?.missingScanDetails.rows.length ?? 0;
    return Math.max(total - this.missingRowsVisible, 0);
  }

  get overdueRows(): OverdueRequestDetailRow[] {
    return this.report?.overdueRequestDetails ?? [];
  }

  get alertRows(): AlertsBreakdownRow[] {
    return this.report?.alertsBreakdown.rows ?? [];
  }

  get maxComplianceCompleted(): number {
    return Math.max(1, ...this.complianceRows.map((row) => row.completed));
  }

  get customRangeDisabled(): boolean {
    return true;
  }

  get canSendRequest(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get reportSummaryLines(): string[] {
    const summary = this.report?.executiveSummary;
    if (!summary) return [];
    return [
      `Date range: ${this.dateRangeLabel}`,
      `${summary.missingScans} expected checks are missing in the selected range.`,
      `${summary.totalCompletedScans} completed readiness scans were found.`,
      `${summary.overdueRequests} scan requests are overdue.`
    ];
  }

  get reportSummaryRecommendation(): string {
    const summary = this.report?.executiveSummary;
    if (!summary) return '';
    if (summary.missingScans > 0) return 'Recommended action: send scan requests to missing members.';
    if (summary.overdueRequests > 0) return 'Recommended action: follow up on overdue scan requests.';
    if (summary.openAlerts > 0) return 'Recommended action: review open operational alerts.';
    return 'Recommended action: workspace is stable for the selected range.';
  }

  get dateRangeLabel(): string {
    if (this.filters.dateRange === 'today') return 'Today';
    if (this.filters.dateRange === 'last7') return 'Last 7 days';
    if (this.filters.dateRange === 'last30') return 'Last 30 days';
    return 'Custom range';
  }

  refresh(): void {
    void this.loadReports(true);
  }

  applyFilters(): void {
    void this.loadReports(false);
  }

  clearFilters(): void {
    this.filters = {
      dateRange: 'last7',
      department: '',
      readiness: 'all',
      alertSeverity: 'all'
    };
    this.missingRowsVisible = 6;
    void this.loadReports(false);
  }

  exportCurrentReportCsv(): void {
    if (!this.report || this.exportDisabled) {
      return;
    }

    this.exporting = true;
    try {
      this.reportsService.exportReportsCsv(this.report);
      this.pushFeedback('success', 'Report exported.');
    } catch {
      this.pushFeedback('error', 'Could not export report.');
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  exportDepartmentSummaryCsv(): void {
    if (!this.report || this.exportDisabled) {
      return;
    }
    this.exporting = true;
    try {
      this.reportsService.exportDepartmentReportCsv(this.report);
      this.pushFeedback('success', 'Report exported.');
    } catch {
      this.pushFeedback('error', 'Could not export report.');
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  exportAlertsSummaryCsv(): void {
    if (!this.report || this.exportDisabled) {
      return;
    }
    this.exporting = true;
    try {
      this.reportsService.exportAlertsReportCsv(this.report);
      this.pushFeedback('success', 'Report exported.');
    } catch {
      this.pushFeedback('error', 'Could not export report.');
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  async exportPdfReport(): Promise<void> {
    if (!this.report || this.exportPdfDisabled) {
      return;
    }

    this.pdfExporting = true;
    try {
      await this.reportsPdfExportService.exportReportsPdf(this.report, this.filters, {
        workspaceName: this.report.workspaceName || 'Current workspace',
        activeRole: this.currentRole,
        scopeLabel: this.scopeChipLabel
      });
      this.pushFeedback('success', 'PDF report exported.');
    } catch (error: unknown) {
      console.error('[ReportsPDF] export failed', error);
      const message = (error as { message?: string } | null)?.message ?? '';
      if (message.includes('PDF_DEPENDENCIES_MISSING')) {
        this.pushFeedback('error', 'PDF export is not available. Please check PDF dependencies.');
      } else {
        this.pushFeedback('error', 'Could not export PDF report.');
      }
    } finally {
      this.pdfExporting = false;
      this.cdr.markForCheck();
    }
  }

  scrollToMissingDetails(): void {
    const element = this.missingDetailsSection?.nativeElement;
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.missingDetailsHighlighted = true;
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightTimer = setTimeout(() => {
      this.missingDetailsHighlighted = false;
      this.cdr.markForCheck();
    }, 1800);
  }

  viewDepartmentWorkforce(row: DepartmentPerformanceRow): void {
    void this.router.navigate(['/app/workforce'], {
      queryParams: row.departmentId ? { department: row.departmentId } : { department: 'unassigned' }
    });
  }

  viewDepartmentCompliance(row: DepartmentPerformanceRow): void {
    void this.router.navigate(['/app/compliance'], {
      queryParams: row.departmentId ? { department: row.departmentId } : { department: 'unassigned' }
    });
  }

  sendMissingScanRequest(row: MissingScanDetailRow): void {
    if (row.memberId) {
      void this.router.navigate(['/app/scan-requests'], { queryParams: { member: row.memberId } });
      return;
    }
    void this.router.navigate(['/app/scan-requests']);
  }

  showMoreMissingRows(): void {
    this.missingRowsVisible += 10;
  }

  missingMemberLabel(row: MissingScanDetailRow): string {
    return row.memberName?.trim() ? row.memberName : 'Unlinked member';
  }

  missingEmailLabel(row: MissingScanDetailRow): string {
    return row.email?.trim() ? row.email : 'Unavailable';
  }

  isUnlinkedMissingRow(row: MissingScanDetailRow): boolean {
    const member = (row.memberName ?? '').trim().toLowerCase();
    const email = (row.email ?? '').trim().toLowerCase();
    return !row.memberId || !member || member.includes('unknown') || email === '' || email === 'unavailable';
  }

  sendOverdueRequestFollowUp(row: OverdueRequestDetailRow): void {
    if (row.targetMemberId) {
      void this.router.navigate(['/app/scan-requests'], { queryParams: { member: row.targetMemberId } });
      return;
    }
    void this.router.navigate(['/app/scan-requests']);
  }

  trackByDepartment(index: number, row: DepartmentPerformanceRow): string {
    return row.key || String(index);
  }

  trackByAlert(index: number, row: AlertsBreakdownRow): string {
    return row.id || String(index);
  }

  trackByMissing(index: number, row: MissingScanDetailRow): string {
    return row.key || String(index);
  }

  trackByOverdue(index: number, row: OverdueRequestDetailRow): string {
    return row.id || String(index);
  }

  complianceBarWidth(row: ComplianceTrendRow): string {
    const pct = Math.round((row.completed / this.maxComplianceCompleted) * 100);
    return `${Math.max(pct, row.completed > 0 ? 8 : 0)}%`;
  }

  readinessPillClass(label: string): string {
    if (label === 'Stable') return 'reports-pill reports-pill--success';
    if (label === 'Low Focus') return 'reports-pill reports-pill--info';
    if (label === 'Elevated Fatigue') return 'reports-pill reports-pill--warning';
    if (label === 'High Risk') return 'reports-pill reports-pill--danger';
    return 'reports-pill reports-pill--neutral';
  }

  severityPillClass(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized === 'critical') return 'reports-pill reports-pill--danger';
    if (normalized === 'high') return 'reports-pill reports-pill--warning';
    if (normalized === 'medium') return 'reports-pill reports-pill--info';
    if (normalized === 'low') return 'reports-pill reports-pill--success';
    return 'reports-pill reports-pill--neutral';
  }

  statusPillClass(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized === 'open') return 'reports-pill reports-pill--danger';
    if (normalized === 'reviewed' || normalized === 'seen') return 'reports-pill reports-pill--info';
    if (normalized === 'resolved' || normalized === 'overridden') return 'reports-pill reports-pill--success';
    return 'reports-pill reports-pill--neutral';
  }

  private async loadReports(refresh = true): Promise<void> {
    this.loading = true;
    this.viewState = 'loading';
    this.errorMessage = '';
    this.partialWarning = '';
    try {
      const context = await this.companyContext.ensureActiveContext();

      if (!context?.activeMembership?.id || !context?.activeBusinessProfile?.id) {
        this.report = null;
        this.viewState = 'noWorkspace';
        return;
      }

      if ((context.activeMemberRole ?? '').toLowerCase() === 'employee') {
        this.report = null;
        this.viewState = 'permission';
        return;
      }

      const result = await this.reportsService.loadReports(context, this.filters, refresh);
      this.report = result;
      this.missingRowsVisible = 6;
      this.partialWarning = result.partialWarning ?? '';

      if (result.permissionDenied) {
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
        this.errorMessage = 'Reports data could not be loaded.';
      }
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
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
}
