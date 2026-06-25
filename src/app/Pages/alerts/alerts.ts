import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService, type AlertRow } from '../../services/operations-workflows.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { sanitizeDisplayValue } from '../../shared/utils/display-formatters';

type AlertsPageState = 'loading' | 'ready' | 'error' | 'permission' | 'noWorkspace' | 'scopeUnavailable';
type AlertStatus = 'new' | 'seen' | 'reviewed' | 'resolved' | 'overridden' | 'unknown';
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

type AlertsFilters = {
  search: string;
  status: 'all' | AlertStatus;
  severity: 'all' | AlertSeverity;
  department: string;
};

type AlertViewModel = {
  key: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  severityLabel: string;
  status: AlertStatus;
  statusLabel: string;
  departmentName: string;
  departmentKey: string;
  createdAt: string | null;
  createdTs: number;
  createdLabel: string;
};

type DistributionRow = {
  key: string;
  label: string;
  count: number;
};

@Component({
  selector: 'app-alerts-page',
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
  templateUrl: './alerts.html',
  styleUrls: ['./alerts.css']
})
export class AlertsPageComponent implements OnInit, OnDestroy {
  readonly unsupportedWorkflowMessage = 'This action requires an approved server-side workflow.';

  pageState: AlertsPageState = 'loading';
  alerts: AlertViewModel[] = [];
  filteredAlerts: AlertViewModel[] = [];
  selectedAlert: AlertViewModel | null = null;
  errorMessage = '';
  feedbackMessage = '';
  warningMessage = '';

  filters: AlertsFilters = {
    search: '',
    status: 'all',
    severity: 'all',
    department: ''
  };

  statusDistribution: DistributionRow[] = [];
  severityDistribution: DistributionRow[] = [];
  departmentOptions: DistributionRow[] = [];

  private loadRunId = 0;

  constructor(
    private workflows: OperationsWorkflowsService,
    private companyContext: CompanyContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadAlerts();
  }

  ngOnDestroy(): void {
    this.setBodyScrollLocked(false);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.selectedAlert) {
      this.closeAlertDetails();
    }
  }

  get currentRole(): string {
    const role = this.companyContext.snapshot().context.activeMemberRole;
    const normalized = String(role ?? '').trim().toLowerCase();
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

  get pageDescription(): string {
    return this.isManager
      ? `Department-scoped operational alert inbox for ${this.activeDepartmentName}.`
      : 'Organization alert inbox for returned operational alerts across authorized departments.';
  }

  get scopeLabel(): string {
    return this.isManager ? `${this.activeDepartmentName} scope` : 'Organization scope';
  }

  get hasAlerts(): boolean {
    return this.alerts.length > 0;
  }

  get hasFilteredEmpty(): boolean {
    return this.hasAlerts && this.filteredAlerts.length === 0;
  }

  get openAlertsCount(): number {
    return this.alerts.filter((row) => this.isOpenStatus(row.status)).length;
  }

  get highSeverityCount(): number {
    return this.alerts.filter((row) => row.severity === 'high' || row.severity === 'critical').length;
  }

  get returnedStatusCount(): number {
    return this.statusDistribution.length;
  }

  get returnedSeverityCount(): number {
    return this.severityDistribution.length;
  }

  refresh(): void {
    void this.loadAlerts(true);
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      status: 'all',
      severity: 'all',
      department: ''
    };
    this.applyFilters();
  }

  onFiltersChanged(): void {
    if (this.isManager) {
      this.filters.department = '';
    }
    this.applyFilters();
  }

  viewAlert(row: AlertViewModel): void {
    this.selectedAlert = row;
    this.setBodyScrollLocked(true);
  }

  closeAlertDetails(): void {
    this.selectedAlert = null;
    this.setBodyScrollLocked(false);
  }

  openUnsupportedWorkflow(): void {
    this.feedbackMessage = this.unsupportedWorkflowMessage;
  }

  trackByAlert(index: number, row: AlertViewModel): string {
    return row.key || String(index);
  }

  trackByDistribution(index: number, row: DistributionRow): string {
    return row.key || String(index);
  }

  statusBadgeClass(status: AlertStatus): string {
    if (status === 'resolved') return 'alerts-status alerts-status--resolved';
    if (status === 'reviewed') return 'alerts-status alerts-status--reviewed';
    if (status === 'seen') return 'alerts-status alerts-status--seen';
    if (status === 'overridden') return 'alerts-status alerts-status--overridden';
    if (status === 'unknown') return 'alerts-status alerts-status--neutral';
    return 'alerts-status alerts-status--open';
  }

  severityBadgeClass(value: AlertSeverity): string {
    if (value === 'critical') return 'alerts-severity alerts-severity--critical';
    if (value === 'high') return 'alerts-severity alerts-severity--high';
    if (value === 'medium') return 'alerts-severity alerts-severity--medium';
    if (value === 'unknown') return 'alerts-severity alerts-severity--neutral';
    return 'alerts-severity alerts-severity--low';
  }

  private async loadAlerts(force = false): Promise<void> {
    const runId = ++this.loadRunId;
    this.pageState = 'loading';
    this.errorMessage = '';
    this.warningMessage = '';

    try {
      const activeContext = await this.companyContext.ensureActiveContext();
      if (runId !== this.loadRunId) return;

      if (!activeContext?.activeMembership?.id || !activeContext.activeBusinessProfile?.id) {
        this.pageState = 'noWorkspace';
        return;
      }

      if (this.currentRole === 'employee') {
        await this.router.navigate(['/app/workspace-access']);
        this.pageState = 'permission';
        return;
      }

      const activeDepartmentId = this.normalizeId(
        this.companyContext.snapshot().context.activeDepartmentId ?? activeContext.activeMembership.department
      );
      if (this.isManager && !activeDepartmentId) {
        this.alerts = [];
        this.filteredAlerts = [];
        this.pageState = 'scopeUnavailable';
        return;
      }

      const pageData = await firstValueFrom(this.workflows.getAlertsPageData(force).pipe(timeout(25000)));
      if (runId !== this.loadRunId) return;

      this.alerts = (pageData?.rows ?? []).map((raw, index) => this.normalizeAlert(raw, index));
      this.buildFilterOptions();
      this.applyFilters();
      this.pageState = 'ready';
    } catch (error: unknown) {
      if (runId !== this.loadRunId) return;

      const message = String((error as { message?: string } | null)?.message ?? '');
      const status = (error as { status?: number } | null)?.status ?? 0;
      this.alerts = [];
      this.filteredAlerts = [];

      if (message.toLowerCase().includes('no active department')) {
        this.pageState = 'scopeUnavailable';
      } else if (status === 403 || message.toLowerCase().includes('forbidden') || message.toLowerCase().includes('cannot access')) {
        this.pageState = 'permission';
      } else {
        this.errorMessage = 'Alerts could not be loaded.';
        this.pageState = 'error';
      }
    } finally {
      this.cdr.markForCheck();
    }
  }

  private normalizeAlert(raw: AlertRow, index: number): AlertViewModel {
    const severity = this.normalizeSeverity(raw.severity);
    const status = this.normalizeStatus(raw.status);
    const createdTs = this.toTimestamp(raw.date_created);
    const departmentName = sanitizeDisplayValue(raw.department_name, 'Unassigned');

    return {
      key: this.normalizeId(raw.id) || `${createdTs}-${index}`,
      title: sanitizeDisplayValue(raw.title, 'Untitled alert'),
      message: sanitizeDisplayValue(raw.message, 'No alert summary was returned.'),
      severity,
      severityLabel: this.toTitleCase(severity),
      status,
      statusLabel: this.statusLabel(status),
      departmentName,
      departmentKey: departmentName.toLowerCase(),
      createdAt: raw.date_created,
      createdTs,
      createdLabel: this.formatDateTime(raw.date_created)
    };
  }

  private applyFilters(): void {
    const search = this.filters.search.trim().toLowerCase();
    const departmentFilter = this.isManager ? '' : this.filters.department;

    this.filteredAlerts = this.alerts
      .filter((row) => {
        const matchesStatus = this.filters.status === 'all' || row.status === this.filters.status;
        const matchesSeverity = this.filters.severity === 'all' || row.severity === this.filters.severity;
        const matchesDepartment = !departmentFilter || row.departmentKey === departmentFilter;
        const matchesSearch =
          !search ||
          row.title.toLowerCase().includes(search) ||
          row.message.toLowerCase().includes(search) ||
          row.departmentName.toLowerCase().includes(search) ||
          row.statusLabel.toLowerCase().includes(search) ||
          row.severityLabel.toLowerCase().includes(search);

        return matchesStatus && matchesSeverity && matchesDepartment && matchesSearch;
      })
      .sort((left, right) => right.createdTs - left.createdTs);
  }

  private buildFilterOptions(): void {
    this.statusDistribution = this.buildDistribution(this.alerts.map((row) => ({ key: row.status, label: row.statusLabel })));
    this.severityDistribution = this.buildDistribution(this.alerts.map((row) => ({ key: row.severity, label: row.severityLabel })));
    this.departmentOptions = this.buildDistribution(this.alerts.map((row) => ({ key: row.departmentKey, label: row.departmentName })));
  }

  private buildDistribution(values: Array<{ key: string; label: string }>): DistributionRow[] {
    const map = new Map<string, DistributionRow>();

    for (const value of values) {
      if (!value.key || value.key === 'unknown') {
        continue;
      }
      const current = map.get(value.key) ?? { key: value.key, label: value.label, count: 0 };
      current.count += 1;
      map.set(value.key, current);
    }

    return Array.from(map.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }

  private normalizeSeverity(value: string | null | undefined): AlertSeverity {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'low') return 'low';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'high') return 'high';
    if (normalized === 'critical') return 'critical';
    return 'unknown';
  }

  private normalizeStatus(value: string | null | undefined): AlertStatus {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'open' || normalized === 'new') return 'new';
    if (normalized === 'seen') return 'seen';
    if (normalized === 'reviewed') return 'reviewed';
    if (normalized === 'resolved') return 'resolved';
    if (normalized === 'overridden') return 'overridden';
    return 'unknown';
  }

  private statusLabel(status: AlertStatus): string {
    if (status === 'new') return 'Open';
    return this.toTitleCase(status);
  }

  private isOpenStatus(status: AlertStatus): boolean {
    return status === 'new' || status === 'seen' || status === 'reviewed';
  }

  private formatDateTime(value: string | null): string {
    const ts = this.toTimestamp(value);
    if (!ts) return 'Unavailable';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ts));
  }

  private toTitleCase(value: string): string {
    if (!value || value === 'unknown') return 'Unknown';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
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

  private setBodyScrollLocked(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }
}
