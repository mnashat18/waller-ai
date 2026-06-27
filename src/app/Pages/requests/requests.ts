import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  type CreateScanRequestInput,
  OperationsWorkflowsService,
  type RequestModalOptions,
  type RequestRow,
  type RequestsPageData,
  type WorkflowMemberOption
} from '../../services/operations-workflows.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';

type PageState = 'loading' | 'ready' | 'error' | 'scopeUnavailable';
type FeedbackType = 'success' | 'error' | 'info';
type QueueStatus = 'pending' | 'completed' | 'overdue' | 'expired' | 'cancelled';

type FeedbackMessage = {
  type: FeedbackType;
  text: string;
};

type RequestFilters = {
  search: string;
  status: 'all' | QueueStatus;
  requestType: string;
  department: string;
  dueWindow: 'all' | 'today' | 'overdue' | 'not_set';
  sort: 'newest' | 'dueSoon' | 'overdueFirst';
};

type QueueRow = {
  source: RequestRow;
  status: QueueStatus;
  statusLabel: string;
  statusClass: string;
  requestTypeLabel: string;
  departmentName: string;
  requestedAtLabel: string;
  dueAtLabel: string;
  requestedAtTs: number;
  dueAtTs: number;
};

type QueueSummary = {
  pending: number;
  overdue: number;
  dueToday: number;
  completedOrClosed: number;
};

type RequestType = 'manual' | 'bulk' | 'reminder';

type CreateRequestForm = {
  targetMemberId: string;
  requestType: RequestType;
  dueAt: string;
};

const REQUEST_TYPE_OPTIONS: Array<{ value: RequestType; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'bulk', label: 'Bulk' },
  { value: 'reminder', label: 'Reminder' }
];

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    ErrorStateComponent,
    KpiCardComponent,
    TableShellComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    ViewportDialogComponent
  ],
  templateUrl: './requests.html',
  styleUrls: ['./requests.css']
})
export class RequestsPageComponent implements OnInit, OnDestroy {
  pageState: PageState = 'loading';
  loading = false;
  errorMessage = '';
  feedback: FeedbackMessage | null = null;
  pageData: RequestsPageData | null = null;
  rows: QueueRow[] = [];
  visibleRows: QueueRow[] = [];
  selectedRequest: QueueRow | null = null;
  showCreateModal = false;
  creatingRequest = false;
  createRequestError = '';
  createRequestForm: CreateRequestForm = this.defaultCreateRequestForm();
  requestModalOptions: RequestModalOptions = {
    members: [],
    departments: []
  };
  loadingRequestModalOptions = false;
  resultCountLabel = '0 of 0 shown';
  hasActiveFilters = false;
  summary: QueueSummary = {
    pending: 0,
    overdue: 0,
    dueToday: 0,
    completedOrClosed: 0
  };

  filters: RequestFilters = {
    search: '',
    status: 'all',
    requestType: '',
    department: '',
    dueWindow: 'all',
    sort: 'newest'
  };

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCreateTargetMemberId: string | null = null;
  private openCreateRequestOnLoad = false;

  constructor(
    private workflows: OperationsWorkflowsService,
    private companyContext: CompanyContextService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.pendingCreateTargetMemberId = this.readPrefilledTargetMemberId();
    this.openCreateRequestOnLoad = this.readOpenCreateRequestFlag();
    this.loadPage();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedRequest) {
      this.closeRequestDetails();
    }
  }

  get currentRole(): string {
    return String(this.companyContext.snapshot().context.activeMemberRole ?? '').toLowerCase();
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
        ? `Department-scoped request queue for ${department}.`
        : 'Department-scoped request queue.';
    }

    return 'Organization request queue for operational follow-up.';
  }

  get managerDepartmentName(): string {
    return this.companyContext.snapshot().context.activeDepartmentName || this.pageData?.departments?.[0]?.name || '';
  }

  get showCreateEntryPoint(): boolean {
    return this.isOwnerOrHr && this.pageState !== 'loading';
  }

  get requestTypeOptions(): string[] {
    return Array.from(new Set(this.rows.map((row) => row.requestTypeLabel).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  get departmentOptions(): Array<{ id: string; name: string }> {
    return this.pageData?.departments ?? [];
  }

  readonly createRequestTypeOptions = REQUEST_TYPE_OPTIONS;

  get eligibleRequestMembers(): WorkflowMemberOption[] {
    return this.requestModalOptions.members ?? [];
  }

  get showFilteredEmpty(): boolean {
    return this.pageState === 'ready' && this.rows.length > 0 && this.visibleRows.length === 0;
  }

  get showQueueEmpty(): boolean {
    return this.pageState === 'ready' && this.rows.length === 0;
  }

  refresh(): void {
    this.loadPage();
  }

  openCreateRequestModal(): void {
    if (!this.showCreateEntryPoint) {
      return;
    }

    this.createRequestError = '';
    this.createRequestForm = this.defaultCreateRequestForm();
    this.showCreateModal = true;
    this.loadRequestModalOptions();
  }

  closeCreateRequestModal(): void {
    this.showCreateModal = false;
    this.createRequestError = '';
    this.createRequestForm = this.defaultCreateRequestForm();
    this.loadingRequestModalOptions = false;
  }

  submitCreateRequest(): void {
    if (!this.showCreateEntryPoint || this.creatingRequest) {
      return;
    }

    const targetMember = this.eligibleRequestMembers.find((member) => member.member_id === this.createRequestForm.targetMemberId) ?? null;
    if (!targetMember) {
      this.createRequestError = 'Select an active workforce member with a real identity.';
      return;
    }

    this.creatingRequest = true;
    this.createRequestError = '';

    const payload: CreateScanRequestInput = {
      target_member_id: targetMember.member_id,
      request_type: this.createRequestForm.requestType,
      due_at: this.normalizeDateTimeInput(this.createRequestForm.dueAt)
    };

    this.workflows.createScanRequest(payload).pipe(
      finalize(() => {
        this.creatingRequest = false;
      })
    ).subscribe({
      next: () => {
        this.closeCreateRequestModal();
        this.pushFeedback('success', `Scan request created for ${targetMember.label}.`);
        this.loadPage();
      },
      error: (error: unknown) => {
        this.createRequestError = this.resolveCreateRequestError(error);
      }
    });
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      status: 'all',
      requestType: '',
      department: '',
      dueWindow: 'all',
      sort: 'newest'
    };
    this.recomputeVisibleRows();
  }

  onFiltersChanged(): void {
    this.recomputeVisibleRows();
  }

  openRequest(row: QueueRow): void {
    this.selectedRequest = row;
  }

  closeRequestDetails(): void {
    this.selectedRequest = null;
  }

  trackByRequest(index: number, row: QueueRow): string {
    return row.source.id || String(index);
  }

  trackByDepartment(index: number, item: { id: string; name: string }): string {
    return item.id || String(index);
  }

  trackByMember(index: number, item: WorkflowMemberOption): string {
    return item.member_id || String(index);
  }

  private loadPage(): void {
    const context = this.companyContext.snapshot().context;
    if (context.activeMemberRole === 'manager' && !context.activeDepartmentId) {
      this.pageData = null;
      this.rows = [];
      this.visibleRows = [];
      this.summary = { pending: 0, overdue: 0, dueToday: 0, completedOrClosed: 0 };
      this.pageState = 'scopeUnavailable';
      this.loading = false;
      this.errorMessage = '';
      return;
    }

    this.pageState = 'loading';
    this.loading = true;
    this.errorMessage = '';

    this.workflows.getRequestsPageData().pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (pageData) => {
        this.pageData = pageData;
        this.rows = this.buildRows(pageData.rows ?? []);
        this.recomputeSummary();
        this.recomputeVisibleRows();
        this.syncSelectedRequestAfterLoad();
        this.pageState = 'ready';
        if (this.openCreateRequestOnLoad) {
          this.openCreateRequestOnLoad = false;
          this.openCreateRequestModal();
        }
      },
      error: (error: unknown) => {
        this.pageData = null;
        this.rows = [];
        this.visibleRows = [];
        this.summary = { pending: 0, overdue: 0, dueToday: 0, completedOrClosed: 0 };
        this.errorMessage = this.resolveLoadErrorMessage(error);
        this.pageState = 'error';
      }
    });
  }

  private loadRequestModalOptions(): void {
    this.loadingRequestModalOptions = true;
    this.requestModalOptions = {
      members: [],
      departments: this.pageData?.departments ?? []
    };

    this.workflows.getRequestModalOptions().pipe(
      finalize(() => {
        this.loadingRequestModalOptions = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (options) => {
        this.requestModalOptions = {
          departments: options.departments ?? [],
          members: options.members ?? []
        };
        this.applyPendingTargetMember();
      },
      error: (error: unknown) => {
        this.requestModalOptions = {
          members: [],
          departments: this.pageData?.departments ?? []
        };
        this.createRequestError = this.resolveLoadErrorMessage(error);
      }
    });
  }

  private applyPendingTargetMember(): void {
    if (!this.pendingCreateTargetMemberId || !this.eligibleRequestMembers.length) {
      return;
    }

    const target = this.eligibleRequestMembers.find((member) => member.member_id === this.pendingCreateTargetMemberId) ?? null;
    if (target) {
      this.showCreateModal = true;
      this.createRequestForm = {
        targetMemberId: target.member_id,
        requestType: 'manual',
        dueAt: ''
      };
    }

    this.pendingCreateTargetMemberId = null;
  }

  private buildRows(rows: RequestRow[]): QueueRow[] {
    return (rows ?? []).map((row) => {
      const status = this.resolveStatus(row);
      return {
        source: row,
        status,
        statusLabel: this.statusLabel(status),
        statusClass: this.statusClassForStatus(status),
        requestTypeLabel: this.toDisplayLabel(row.request_type, 'Scan request'),
        departmentName: this.safeText(row.department_name, this.isManager ? this.managerDepartmentName || 'Department unavailable' : 'Unassigned'),
        requestedAtLabel: this.formatDateTimeLabel(row.requested_at),
        dueAtLabel: row.due_at ? this.formatDateTimeLabel(row.due_at) : 'No due time',
        requestedAtTs: this.toTimestamp(row.requested_at),
        dueAtTs: this.toTimestamp(row.due_at)
      } satisfies QueueRow;
    });
  }

  private recomputeSummary(): void {
    const today = this.todayRange();
    this.summary = {
      pending: this.rows.filter((row) => row.status === 'pending').length,
      overdue: this.rows.filter((row) => row.status === 'overdue').length,
      dueToday: this.rows.filter((row) => row.dueAtTs >= today.start && row.dueAtTs < today.end).length,
      completedOrClosed: this.rows.filter((row) => row.status === 'completed' || row.status === 'expired' || row.status === 'cancelled').length
    };
  }

  private recomputeVisibleRows(): void {
    const search = this.filters.search.trim().toLowerCase();
    this.hasActiveFilters = this.computeHasActiveFilters();

    let filtered = this.rows.filter((row) => {
      const matchesSearch =
        !search ||
        row.requestTypeLabel.toLowerCase().includes(search) ||
        row.departmentName.toLowerCase().includes(search) ||
        row.statusLabel.toLowerCase().includes(search);
      const matchesStatus = this.filters.status === 'all' || row.status === this.filters.status;
      const matchesType = !this.filters.requestType || row.requestTypeLabel === this.filters.requestType;
      const matchesDepartment = this.isManager || !this.filters.department || row.source.department_id === this.filters.department;
      const matchesDue = this.matchesDueWindow(row);
      return matchesSearch && matchesStatus && matchesType && matchesDepartment && matchesDue;
    });

    if (this.filters.sort === 'dueSoon') {
      filtered = [...filtered].sort((left, right) => {
        const leftDue = left.dueAtTs || Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAtTs || Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });
    } else if (this.filters.sort === 'overdueFirst') {
      filtered = [...filtered].sort((left, right) => {
        const leftRank = left.status === 'overdue' ? 0 : 1;
        const rightRank = right.status === 'overdue' ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return (left.dueAtTs || Number.MAX_SAFE_INTEGER) - (right.dueAtTs || Number.MAX_SAFE_INTEGER);
      });
    } else {
      filtered = [...filtered].sort((left, right) => right.requestedAtTs - left.requestedAtTs);
    }

    this.visibleRows = filtered;
    this.resultCountLabel = `${this.visibleRows.length} of ${this.rows.length} shown`;
  }

  private matchesDueWindow(row: QueueRow): boolean {
    if (this.filters.dueWindow === 'all') {
      return true;
    }

    if (this.filters.dueWindow === 'not_set') {
      return !row.dueAtTs;
    }

    if (this.filters.dueWindow === 'overdue') {
      return row.status === 'overdue';
    }

    const today = this.todayRange();
    return row.dueAtTs >= today.start && row.dueAtTs < today.end;
  }

  private syncSelectedRequestAfterLoad(): void {
    const selectedRequestId = this.selectedRequest?.source.id;
    if (!selectedRequestId) {
      this.selectedRequest = null;
      return;
    }

    this.selectedRequest = this.rows.find((row) => row.source.id === selectedRequestId) ?? null;
  }

  private resolveStatus(row: RequestRow): QueueStatus {
    const status = String(row.status ?? '').trim().toLowerCase();
    if (status.includes('cancel')) return 'cancelled';
    if (status.includes('expire')) return 'expired';
    if (status.includes('complete')) return 'completed';
    if (this.isOverdue(row)) return 'overdue';
    return 'pending';
  }

  private isOverdue(row: RequestRow): boolean {
    const status = String(row.status ?? '').trim().toLowerCase();
    if (!row.due_at || status.includes('complete') || status.includes('cancel') || status.includes('expire')) {
      return false;
    }

    const dueAt = this.toTimestamp(row.due_at);
    return dueAt > 0 && dueAt < Date.now();
  }

  private statusLabel(status: QueueStatus): string {
    if (status === 'pending') return 'Pending';
    if (status === 'completed') return 'Completed';
    if (status === 'overdue') return 'Overdue';
    if (status === 'expired') return 'Expired';
    return 'Cancelled';
  }

  private statusClassForStatus(status: QueueStatus): string {
    if (status === 'completed') return 'scan-request-status scan-request-status--completed';
    if (status === 'overdue') return 'scan-request-status scan-request-status--overdue';
    if (status === 'expired' || status === 'cancelled') return 'scan-request-status scan-request-status--neutral';
    return 'scan-request-status scan-request-status--pending';
  }

  private resolveLoadErrorMessage(error: unknown): string {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const message = (error as { message?: string } | null)?.message ?? '';

    if (message.toLowerCase().includes('manager account has no active department')) {
      this.pageState = 'scopeUnavailable';
      return '';
    }

    if (status === 403) {
      return 'Scan requests are unavailable for the current workspace scope.';
    }

    if (message.toLowerCase().includes('workspace')) {
      return 'Select an active workspace before opening Scan Requests.';
    }

    return 'Scan requests could not be loaded.';
  }

  private computeHasActiveFilters(): boolean {
    return Boolean(
      this.filters.search.trim() ||
      this.filters.status !== 'all' ||
      this.filters.requestType ||
      (!this.isManager && this.filters.department) ||
      this.filters.dueWindow !== 'all' ||
      this.filters.sort !== 'newest'
    );
  }

  private todayRange(): { start: number; end: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }

  private formatDateTimeLabel(value: string | null | undefined): string {
    const timestamp = this.toTimestamp(value);
    if (!timestamp) {
      return 'Unavailable';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toDisplayLabel(value: string | null | undefined, fallback: string): string {
    const clean = this.safeText(value, '');
    if (!clean) {
      return fallback;
    }

    return clean
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ');
  }

  formatRequestMemberOption(member: WorkflowMemberOption): string {
    const normalizedRole = this.safeText(member.member_role, '').toLowerCase();
    const roleLabel = normalizedRole === 'hr' ? 'HR' : this.toDisplayLabel(member.member_role, '');
    return `${member.label}${member.email ? ` — ${member.email}` : ''}${roleLabel ? ` · ${roleLabel}` : ''}`;
  }

  private safeText(value: string | null | undefined, fallback: string): string {
    const clean = String(value ?? '').trim();
    return clean || fallback;
  }

  private defaultCreateRequestForm(): CreateRequestForm {
    return {
      targetMemberId: '',
      requestType: 'manual',
      dueAt: ''
    };
  }

  private normalizeDateTimeInput(value: string): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private readPrefilledTargetMemberId(): string | null {
    if (typeof history === 'undefined') {
      return null;
    }

    const state = history.state as Record<string, unknown> | null | undefined;
    const candidate =
      state?.['workforceTargetMemberId'] ??
      state?.['workforceRequestTargetId'] ??
      state?.['targetMemberId'];
    const normalized = String(candidate ?? '').trim();
    return normalized || null;
  }

  private readOpenCreateRequestFlag(): boolean {
    if (typeof history === 'undefined') {
      return false;
    }

    const state = history.state as Record<string, unknown> | null | undefined;
    return state?.['openCreateRequest'] === true || state?.['scanRequestsOpenCreateModal'] === true;
  }

  private resolveCreateRequestError(error: unknown): string {
    if (error && typeof error === 'object' && 'userMessage' in error) {
      const userMessage = String((error as { userMessage?: unknown }).userMessage ?? '').trim();
      if (userMessage) {
        return userMessage;
      }
    }

    const fallback = this.resolveLoadErrorMessage(error);
    return fallback || 'Failed to create scan request.';
  }

  private pushFeedback(type: FeedbackType, text: string): void {
    this.feedback = { type, text };

    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }

    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      this.cdr.detectChanges();
    }, 3500);
  }

}
