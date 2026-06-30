import { CommonModule } from '@angular/common';
import {
  ApplicationRef,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EmbeddedViewRef,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  ReportsService,
  type AlertsBreakdownRow,
  type ComplianceTrendRow,
  type DepartmentPerformanceRow,
  type ReportsFilters,
  type ReportsViewData
} from '../../services/reports.service';
import { ReportsPdfExportService, type ReportsPdfExportContext } from '../../services/reports-pdf-export.service';
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
  viewState: ReportsViewState = 'loading';
  loading = true;
  errorMessage = '';
  partialWarning = '';
  report: ReportsViewData | null = null;
  feedback: FeedbackMessage | null = null;
  exportMenuOpen = false;
  exportMenuPlacement: 'above' | 'below' = 'below';
  exportMenuPosition = {
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 0
  };

  filters: ReportsFilters = this.defaultFilters();

  @ViewChild('exportMenuTrigger') private exportMenuTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('exportMenuTemplate') private exportMenuTemplate?: TemplateRef<unknown>;
  private exportMenuViewRef: EmbeddedViewRef<unknown> | null = null;
  private exportMenuElement: HTMLElement | null = null;
  private exportMenuCleanup: Array<() => void> = [];
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private exportBusy = false;
  private routerEventsSub?: Subscription;

  constructor(
    private appRef: ApplicationRef,
    private reportsService: ReportsService,
    private reportsPdfExportService: ReportsPdfExportService,
    private companyContext: CompanyContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routerEventsSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.closeExportMenu();
      }
    });
    void this.loadReports();
  }

  ngOnDestroy(): void {
    this.routerEventsSub?.unsubscribe();
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.destroyExportMenuOverlay();
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

  get canExport(): boolean {
    return this.viewState === 'ready' && this.report?.hasAnyData === true && !this.loading && !this.exportBusy;
  }

  get exportUnavailableMessage(): string {
    return 'Export is available when report data is available.';
  }

  get coverageRateDisplay(): string {
    const rate = this.report?.executiveSummary?.averageComplianceRate;
    return rate === null || rate === undefined ? 'Unavailable' : `${rate}%`;
  }

  get coverageRateTone(): 'success' | 'warning' | 'neutral' {
    const rate = this.report?.executiveSummary?.averageComplianceRate;
    if (rate === null || rate === undefined) {
      return 'neutral';
    }
    return rate >= 80 ? 'success' : 'warning';
  }

  get completedScansDisplay(): string {
    return String(this.report?.executiveSummary?.totalCompletedScans ?? 0);
  }

  get missingScansDisplay(): string {
    const missing = this.report?.executiveSummary?.missingScans;
    return missing === null || missing === undefined ? 'Unavailable' : String(missing);
  }

  get missingScansTone(): 'success' | 'warning' | 'neutral' {
    const missing = this.report?.executiveSummary?.missingScans;
    if (missing === null || missing === undefined) {
      return 'neutral';
    }
    return missing > 0 ? 'warning' : 'success';
  }

  refresh(): void {
    void this.loadReports(true);
  }

  applyFilters(): void {
    this.enforceScopeSafeFilters();
    this.exportMenuOpen = false;
    void this.loadReports(false);
  }

  clearFilters(): void {
    this.filters = this.defaultFilters();
    this.enforceScopeSafeFilters();
    this.exportMenuOpen = false;
    void this.loadReports(false);
  }

  toggleExportMenu(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canExport) {
      this.closeExportMenu();
      return;
    }
    if (this.exportMenuOpen) {
      this.closeExportMenu(true);
      return;
    }

    this.openExportMenu();
  }

  handleExportMenuKeydown(event: KeyboardEvent): void {
    if (!this.exportMenuOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeExportMenu(true);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const items = this.exportMenuItems();
    if (!items.length) {
      return;
    }

    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex =
      event.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : (currentIndex <= 0 ? items.length : currentIndex) - 1;
    items[nextIndex]?.focus();
  }

  async exportCsv(): Promise<void> {
    if (!this.canExport || !this.report) {
      return;
    }

    this.closeExportMenu(true);
    this.exportBusy = true;

    try {
      this.reportsService.exportReportsCsv(this.report);
      this.pushFeedback('info', 'CSV export downloaded.');
    } catch {
      this.pushFeedback('error', 'Export failed. Try again.');
    } finally {
      this.exportBusy = false;
      this.cdr.markForCheck();
    }
  }

  async exportPdf(): Promise<void> {
    if (!this.canExport || !this.report) {
      return;
    }

    this.closeExportMenu(true);
    this.exportBusy = true;

    try {
      const exportContext: ReportsPdfExportContext = {
        workspaceName: this.report.workspaceName,
        activeRole: this.currentRole,
        scopeLabel: this.scopeLabel
      };
      await this.reportsPdfExportService.exportReportsPdf(this.report, this.report.filters, exportContext);
      this.pushFeedback('info', 'PDF export downloaded.');
    } catch {
      this.pushFeedback('error', 'Export failed. Try again.');
    } finally {
      this.exportBusy = false;
      this.cdr.markForCheck();
    }
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
    if (normalized === 'new' || normalized === 'open') return 'reports-pill reports-pill--danger';
    if (normalized === 'in review' || normalized === 'reviewed' || normalized === 'seen') return 'reports-pill reports-pill--info';
    if (normalized === 'resolved' || normalized === 'overridden') return 'reports-pill reports-pill--success';
    return 'reports-pill reports-pill--neutral';
  }

  private async loadReports(refresh = true): Promise<void> {
    this.closeExportMenu();
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

  private closeExportMenu(restoreFocus = false): void {
    if (!this.exportMenuOpen) {
      if (restoreFocus) {
        this.exportMenuTrigger?.nativeElement.focus();
      }
      return;
    }

    this.exportMenuOpen = false;
    this.destroyExportMenuOverlay();
    this.cdr.markForCheck();

    if (restoreFocus) {
      this.exportMenuTrigger?.nativeElement.focus();
    }
  }

  private focusFirstExportMenuItem(): void {
    this.exportMenuItems()[0]?.focus();
  }

  private exportMenuItems(): HTMLButtonElement[] {
    return Array.from(this.exportMenuElement?.querySelectorAll<HTMLButtonElement>('.reports-export-control__item') ?? []);
  }

  private openExportMenu(): void {
    if (this.exportMenuOpen || !this.canExport) {
      return;
    }

    this.exportMenuOpen = true;
    this.mountExportMenuOverlay();
    this.cdr.markForCheck();
    this.focusFirstExportMenuItem();
  }

  private mountExportMenuOverlay(): void {
    this.destroyExportMenuOverlay();

    if (!this.exportMenuTemplate) {
      return;
    }

    const viewRef = this.exportMenuTemplate.createEmbeddedView({});
    this.appRef.attachView(viewRef);
    viewRef.detectChanges();

    const host = viewRef.rootNodes.find((node): node is HTMLElement => node instanceof HTMLElement);
    if (!host) {
      this.appRef.detachView(viewRef);
      viewRef.destroy();
      return;
    }

    document.body.appendChild(host);
    this.exportMenuViewRef = viewRef;
    this.exportMenuElement = host;
    this.repositionExportMenu();
    this.attachExportMenuListeners();
  }

  private repositionExportMenu(): void {
    if (!this.exportMenuElement || !this.exportMenuTrigger || !this.exportMenuOpen) {
      return;
    }

    const triggerRect = this.exportMenuTrigger.nativeElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const menuWidth = Math.max(192, Math.min(Math.ceil(triggerRect.width), viewportWidth - margin * 2));

    this.exportMenuElement.style.width = `${menuWidth}px`;
    this.exportMenuElement.style.left = '0px';
    this.exportMenuElement.style.top = '0px';
    this.exportMenuElement.style.maxHeight = 'none';

    const menuHeight = Math.ceil(this.exportMenuElement.getBoundingClientRect().height);
    const spaceBelow = viewportHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;
    const openBelow = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;

    const top = openBelow
      ? Math.max(margin, Math.min(triggerRect.bottom + 8, viewportHeight - menuHeight - margin))
      : Math.max(margin, triggerRect.top - menuHeight - 8);
    const left = Math.max(margin, Math.min(triggerRect.right - menuWidth, viewportWidth - menuWidth - margin));
    const maxHeight = Math.max(120, openBelow ? spaceBelow : spaceAbove);

    this.exportMenuPlacement = openBelow ? 'below' : 'above';
    this.exportMenuPosition = {
      top,
      left,
      width: menuWidth,
      maxHeight
    };

    this.exportMenuElement.style.top = `${top}px`;
    this.exportMenuElement.style.left = `${left}px`;
    this.exportMenuElement.style.maxHeight = `${maxHeight}px`;
  }

  private attachExportMenuListeners(): void {
    const updatePosition = () => this.repositionExportMenu();
    const onDocumentClick = (event: MouseEvent) => {
      if (!this.exportMenuOpen) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || !this.isExportMenuTarget(target)) {
        this.closeExportMenu();
      }
    };
    const onDocumentKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.exportMenuOpen) {
        event.preventDefault();
        this.closeExportMenu(true);
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown, true);

    this.exportMenuCleanup.push(
      () => window.removeEventListener('resize', updatePosition),
      () => window.removeEventListener('scroll', updatePosition, true),
      () => document.removeEventListener('click', onDocumentClick, true),
      () => document.removeEventListener('keydown', onDocumentKeydown, true)
    );
  }

  private destroyExportMenuOverlay(): void {
    while (this.exportMenuCleanup.length) {
      this.exportMenuCleanup.pop()?.();
    }

    if (this.exportMenuViewRef) {
      this.appRef.detachView(this.exportMenuViewRef);
      this.exportMenuViewRef.destroy();
      this.exportMenuViewRef = null;
    }

    if (this.exportMenuElement?.parentNode) {
      this.exportMenuElement.parentNode.removeChild(this.exportMenuElement);
    }

    this.exportMenuElement = null;
    this.exportMenuPlacement = 'below';
    this.exportMenuPosition = {
      top: 0,
      left: 0,
      width: 0,
      maxHeight: 0
    };
  }

  private isExportMenuTarget(target: Node): boolean {
    return Boolean(
      this.exportMenuElement?.contains(target) || this.exportMenuTrigger?.nativeElement.contains(target)
    );
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
