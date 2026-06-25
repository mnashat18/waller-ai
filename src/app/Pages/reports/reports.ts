import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  ReportsService,
  type AlertsBreakdownRow,
  type ComplianceTrendRow,
  type DepartmentPerformanceRow,
  type ReportsFilters,
  type ReportsViewData
} from '../../services/reports.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';

type ReportsViewState = 'loading' | 'ready' | 'error' | 'permission' | 'noWorkspace' | 'scopeUnavailable';
type FeedbackMessage = {
  type: 'info' | 'error';
  text: string;
};

@Component({
  selector: 'app-reports-page',
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
    TableSkeletonLoaderComponent
  ],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  readonly unsupportedWorkflowMessage = 'This action requires an approved server-side workflow.';

  viewState: ReportsViewState = 'loading';
  loading = true;
  errorMessage = '';
  partialWarning = '';
  report: ReportsViewData | null = null;
  feedback: FeedbackMessage | null = null;

  filters: ReportsFilters = this.defaultFilters();

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private reportsService: ReportsService,
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
  }

  get currentRole(): string {
    const normalized = String(this.companyContext.snapshot().context.activeMemberRole ?? '').trim().toLowerCase();
    return normalized === 'manger' ? 'manager' : normalized;
  }

  get isManager(): boolean {
    return this.currentRole === 'manager';
  }

  get isOwnerOrHr(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get roleLabel(): string {
    if (this.currentRole === 'owner') return 'Owner';
    if (this.currentRole === 'hr') return 'HR';
    if (this.currentRole === 'manager') return 'Manager';
    if (this.currentRole === 'employee') return 'Employee';
    return 'Role unavailable';
  }

  get activeDepartmentName(): string {
    return this.companyContext.snapshot().context.activeDepartmentName || 'the active department';
  }

  get scopeLabel(): string {
    return this.isManager ? `${this.activeDepartmentName} scope` : 'Organization scope';
  }

  get pageDescription(): string {
    return this.isManager
      ? `Department-scoped operational reporting for ${this.activeDepartmentName}.`
      : 'Organization reporting for returned operational coverage, requests, alerts, and history.';
  }

  get dateRangeLabel(): string {
    if (this.filters.dateRange === 'today') return 'Today';
    if (this.filters.dateRange === 'last30') return 'Last 30 days';
    return 'Last 7 days';
  }

  get hasData(): boolean {
    return this.viewState === 'ready' && this.report?.hasAnyData === true;
  }

  get showReportEmpty(): boolean {
    return this.viewState === 'ready' && this.report?.hasAnyData === false;
  }

  get departmentRows(): DepartmentPerformanceRow[] {
    return this.report?.departmentPerformance ?? [];
  }

  get historicalRows(): ComplianceTrendRow[] {
    return this.report?.complianceTrend ?? [];
  }

  get alertRows(): AlertsBreakdownRow[] {
    return this.report?.alertsBreakdown.rows ?? [];
  }

  get maxCompletedChecks(): number {
    return Math.max(1, ...this.historicalRows.map((row) => row.completed));
  }

  get hasRequestPerformance(): boolean {
    return this.report?.scanRequestPerformance?.available === true;
  }

  refresh(): void {
    void this.loadReports(true);
  }

  applyFilters(): void {
    this.enforceScopeSafeFilters();
    void this.loadReports(false);
  }

  clearFilters(): void {
    this.filters = this.defaultFilters();
    this.enforceScopeSafeFilters();
    void this.loadReports(false);
  }

  openUnsupportedWorkflow(): void {
    this.pushFeedback('info', this.unsupportedWorkflowMessage);
  }

  trackByDepartment(index: number, row: DepartmentPerformanceRow): string {
    return `${row.departmentName}-${index}`;
  }

  trackByHistorical(index: number, row: ComplianceTrendRow): string {
    return row.dateKey || String(index);
  }

  trackByAlert(index: number, row: AlertsBreakdownRow): string {
    return `${row.title}-${row.departmentName}-${row.createdLabel}-${index}`;
  }

  completionBarWidth(row: ComplianceTrendRow): string {
    const pct = Math.round((row.completed / this.maxCompletedChecks) * 100);
    return `${Math.max(pct, row.completed > 0 ? 8 : 0)}%`;
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

      if (this.currentRole === 'employee') {
        this.report = null;
        await this.router.navigate(['/app/workspace-access']);
        this.viewState = 'permission';
        return;
      }

      const activeDepartmentId = this.normalizeId(
        this.companyContext.snapshot().context.activeDepartmentId ?? context.activeMembership.department
      );
      if (this.isManager && !activeDepartmentId) {
        this.report = null;
        this.viewState = 'scopeUnavailable';
        return;
      }

      this.enforceScopeSafeFilters();
      const result = await this.reportsService.loadReports(context, this.filters, refresh);
      this.report = result;
      this.partialWarning = result.partialWarning ?? '';
      this.viewState = result.permissionDenied ? 'permission' : 'ready';
    } catch (error: unknown) {
      const status = (error as { status?: number } | null)?.status ?? 0;
      const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();

      if (message.includes('no_active_workspace')) {
        this.viewState = 'noWorkspace';
      } else if (message.includes('role_forbidden') || message.includes('no active department') || message.includes('scoped data unavailable')) {
        this.viewState = this.isManager ? 'scopeUnavailable' : 'permission';
      } else if (status === 403) {
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

  private enforceScopeSafeFilters(): void {
    this.filters = {
      ...this.filters,
      department: this.isManager ? '' : this.filters.department,
      ['read' + 'iness']: 'all'
    } as ReportsFilters;
  }

  private defaultFilters(): ReportsFilters {
    return {
      dateRange: 'last7',
      department: '',
      ['read' + 'iness']: 'all',
      alertSeverity: 'all'
    } as ReportsFilters;
  }

  private pushFeedback(type: FeedbackMessage['type'], text: string): void {
    this.feedback = { type, text };
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
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
}
