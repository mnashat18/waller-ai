import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, firstValueFrom, finalize } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  OperationsWorkflowsService,
  type CreateScanRequestInput,
  type RequestModalOptions,
  type RequestActionResult,
  type RequestRow,
  type RequestsPageData,
  type WorkflowMemberOption
} from '../../services/operations-workflows.service';
import {
  OperationsAdminService,
  type WorkforceRosterPageData
} from '../../services/operations-admin.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import {
  formatBusinessProfile,
  formatDepartment,
  formatMember,
  formatUserName,
  isUuid,
  sanitizeDisplayValue
} from '../../shared/utils/display-formatters';

type PageState = 'loading' | 'ready' | 'error';

type ScanRequestStatus = 'pending' | 'completed' | 'overdue' | 'expired' | 'cancelled';

type RequestFilters = {
  search: string;
  status: 'all' | ScanRequestStatus;
  department: string;
  dateRange: 'all' | 'today' | 'last7' | 'custom';
  customStart: string;
  customEnd: string;
  sort: 'newest' | 'dueSoon' | 'overdueFirst';
};

type NewRequestForm = {
  targetType: '' | 'individual' | 'department' | 'workspace';
  memberId: string;
  departmentId: string;
  dueTime: '' | 'endOfToday' | 'in1Hour' | 'in2Hours' | 'custom';
  customDueAt: string;
};

type NewRequestFormErrors = {
  targetType: string;
  memberId: string;
  departmentId: string;
  dueTime: string;
  customDueAt: string;
};

type FeedbackType = 'success' | 'error' | 'info';

type FeedbackMessage = {
  type: FeedbackType;
  text: string;
};

type ScanRequestRow = {
  source: RequestRow;
  status: ScanRequestStatus;
  statusLabel: string;
  statusClass: string;
  memberName: string;
  memberEmail: string;
  memberSecondary: string | null;
  departmentName: string;
  businessProfileName: string;
  requestedBy: string;
  completedScanLabel: string;
  requestedAtTs: number;
  dueAtTs: number;
  completedAtTs: number;
  requestedAtLabel: string;
  dueAtLabel: string;
  completedAtLabel: string;
};

type SummaryCards = {
  pendingRequests: number;
  completedToday: number;
  overdueRequests: number;
  expiredOrCancelled: number;
  completionRate: number;
  totalSentToday: number;
};

@Component({
  selector: 'app-requests-page',
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
  templateUrl: './requests.html',
  styleUrls: ['./requests.css']
})
export class RequestsPageComponent implements OnInit, OnDestroy {
  pageState: PageState = 'loading';
  loading = false;
  rows: ScanRequestRow[] = [];
  visibleRows: ScanRequestRow[] = [];
  pageData: RequestsPageData | null = null;
  errorMessage = '';
  resultCountLabel = '0 of 0 shown';
  showNoMatchingState = false;
  hasActiveFilters = false;
  summary: SummaryCards = {
    pendingRequests: 0,
    completedToday: 0,
    overdueRequests: 0,
    expiredOrCancelled: 0,
    completionRate: 0,
    totalSentToday: 0
  };

  feedback: FeedbackMessage | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  selectedRequest: ScanRequestRow | null = null;
  private requestedMemberId: string | null = null;
  private autoOpenHandledMemberId: string | null = null;

  showCreateModal = false;
  submittingRequest = false;
  modalOptionsLoading = false;
  modalOptionsLoaded = false;
  modalOptionsError = '';
  memberSearch = '';
  availableMembers: WorkflowMemberOption[] = [];
  filteredMemberOptions: WorkflowMemberOption[] = [];
  hasMembers = false;
  availableDepartments: Array<{ id: string; name: string }> = [];
  hasDepartments = false;
  modalMembers: WorkflowMemberOption[] = [];
  modalDepartments: Array<{ id: string; name: string }> = [];
  requestForm: NewRequestForm = this.defaultRequestForm();
  formErrors: NewRequestFormErrors = this.emptyFormErrors();
  private loadRunId = 0;

  filters: RequestFilters = {
    search: '',
    status: 'all',
    department: '',
    dateRange: 'all',
    customStart: '',
    customEnd: '',
    sort: 'newest'
  };

  constructor(
    private workflows: OperationsWorkflowsService,
    private operationsAdmin: OperationsAdminService,
    private companyContext: CompanyContextService,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('[ScanRequests] route loaded');
    void this.loadPage();

    this.route.queryParamMap.subscribe((params) => {
      const requestId = params.get('request');
      if (!requestId) {
        this.selectedRequest = null;
      } else {
        this.selectedRequest = this.rows.find((row) => row.source.id === requestId) ?? null;
      }

      const memberId = params.get('member');
      this.requestedMemberId = memberId;
      if (memberId && this.pageData && this.autoOpenHandledMemberId !== memberId) {
        this.autoOpenHandledMemberId = memberId;
        this.openCreateModal(memberId);
      }
    });
  }

  ngOnDestroy(): void {
    this.togglePageScrollLock(false);
  }

  get canSubmitScanRequest(): boolean {
    if (this.submittingRequest || !this.canCreateRequests) {
      return false;
    }

    if (!this.requestForm.targetType || !this.requestForm.dueTime) {
      return false;
    }

    if (this.requestForm.targetType === 'individual' && !this.requestForm.memberId) {
      return false;
    }

    if (this.requestForm.targetType === 'department' && !this.requestForm.departmentId) {
      return false;
    }

    if (this.requestForm.dueTime === 'custom') {
      return this.toTimestamp(this.requestForm.customDueAt) > 0;
    }

    return true;
  }

  get hasActiveWorkspaceContext(): boolean {
    const context = this.companyContext.snapshot().context;
    const membership = this.companyContext.getActiveMembership();
    return Boolean(context.activeBusinessProfileId && membership?.id);
  }

  get activeMembershipStatus(): string {
    return this.normalizeText(this.companyContext.getActiveMembership()?.status);
  }

  get currentRole(): string {
    return this.normalizeText(this.companyContext.snapshot().context.activeMemberRole);
  }

  get canCreateRequests(): boolean {
    const role = this.currentRole;
    const allowedRole = role === 'owner' || role === 'hr';
    return this.hasActiveWorkspaceContext && this.activeMembershipStatus === 'active' && allowedRole;
  }

  get canManageRequestActions(): boolean {
    return this.canCreateRequests;
  }

  canRemindRequest(row: ScanRequestRow): boolean {
    return this.canManageRequestActions && (row.status === 'pending' || row.status === 'overdue');
  }

  canCancelRequest(row: ScanRequestRow): boolean {
    return this.canManageRequestActions && (row.status === 'pending' || row.status === 'overdue');
  }

  actionDisabledReason(action: 'remind' | 'cancel', row: ScanRequestRow): string {
    if (!this.canManageRequestActions) {
      return 'Only owner/hr can perform this action.';
    }
    if (action === 'remind' || action === 'cancel') {
      if (!(row.status === 'pending' || row.status === 'overdue')) {
        return 'Available only for pending or overdue requests.';
      }
    }
    return '';
  }

  get isEmployeeView(): boolean {
    return this.currentRole === 'employee';
  }

  get scopeChipLabel(): string {
    const context = this.companyContext.snapshot().context;
    if (context.activeDepartmentName) {
      return `${context.activeDepartmentName} scope`;
    }
    return 'Company-wide scope';
  }

  get roleChipLabel(): string {
    const role = this.companyContext.snapshot().context.activeMemberRole;
    if (!role) {
      return 'Role unavailable';
    }

    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';

    return role;
  }

  refresh(): void {
    void this.loadPage();
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      status: 'all',
      department: '',
      dateRange: 'all',
      customStart: '',
      customEnd: '',
      sort: 'newest'
    };
    this.recomputeVisibleRows();
  }

  trackByRequest(index: number, row: ScanRequestRow): string {
    return row.source.id || String(index);
  }

  private formatDateTimeLabel(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const timestamp = this.toTimestamp(value);
    if (!timestamp) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
  }

  openCreateModal(memberId: string | null = null): void {
    if (!this.canCreateRequests) {
      this.pushFeedback('error', 'Your workspace role cannot create scan requests.');
      return;
    }

    const form = this.defaultRequestForm();

    if (memberId) {
      const matchedMember = this.availableMembers.find(
        (member) => member.member_id === memberId || member.user_id === memberId
      );

      if (matchedMember) {
        form.targetType = 'individual';
        form.memberId = matchedMember.member_id;
      }
    }

    this.requestForm = form;
    this.formErrors = this.emptyFormErrors();
    this.memberSearch = '';
    this.modalOptionsError = '';
    this.showCreateModal = true;
    this.togglePageScrollLock(true);
    void this.loadModalOptions(memberId);
  }

  closeCreateModal(): void {
    if (this.submittingRequest) {
      return;
    }

    this.showCreateModal = false;
    this.modalOptionsLoading = false;
    this.formErrors = this.emptyFormErrors();
    this.togglePageScrollLock(Boolean(this.selectedRequest));
  }

  onTargetTypeChange(): void {
    this.formErrors = this.emptyFormErrors();
    this.requestForm.memberId = '';
    this.requestForm.departmentId = '';
    this.memberSearch = '';
    this.recomputeMemberOptions();
  }

  onMemberSearchChanged(): void {
    this.recomputeMemberOptions();
  }

  onFiltersChanged(): void {
    this.recomputeVisibleRows();
  }

  sendRequest(): void {
    if (!this.canCreateRequests) {
      this.pushFeedback('error', 'Your workspace role cannot create scan requests.');
      return;
    }

    this.formErrors = this.validateForm();
    if (this.hasFormErrors(this.formErrors)) {
      return;
    }

    const dueAt = this.resolveDueAtIso();
    if (!dueAt) {
      this.formErrors = {
        ...this.formErrors,
        dueTime: 'Due time is required.'
      };
      return;
    }

    const payload: CreateScanRequestInput = {
      request_type: this.requestForm.targetType === 'individual' ? 'manual' : 'bulk',
      status: 'pending',
      due_at: dueAt,
      requested_by_user: this.companyContext.snapshot().context.userId
    };

    if (this.requestForm.targetType === 'individual') {
      const member = this.availableMembers.find((item) => {
        return item.member_id === this.requestForm.memberId;
      });

      payload.target_member = member?.member_id ?? null;
      payload.department = member?.department_id ?? null;
    }

    if (this.requestForm.targetType === 'department') {
      payload.department = this.requestForm.departmentId;
      payload.target_member = null;
    }

    if (this.requestForm.targetType === 'workspace') {
      payload.department = null;
      payload.target_member = null;
    }

    this.submittingRequest = true;

    const submit$: Observable<unknown> =
      this.requestForm.targetType === 'workspace'
        ? this.workflows.createWorkspaceScanRequests(payload)
        : this.requestForm.targetType === 'department'
          ? this.workflows.createDepartmentScanRequests(payload)
        : this.workflows.createScanRequest(payload);

    submit$
      .pipe(
        finalize(() => {
          this.submittingRequest = false;
        })
      )
      .subscribe({
        next: (createdCount: unknown) => {
          const createdTotal = typeof createdCount === 'number' ? createdCount : 0;
          if (this.requestForm.targetType === 'workspace' && createdTotal === 0) {
            this.pushFeedback('info', 'No active members were found for this workspace target.');
            this.showCreateModal = false;
            this.togglePageScrollLock(Boolean(this.selectedRequest));
            void this.loadPage();
            return;
          }

          const message = this.requestForm.targetType === 'workspace'
            ? `Scan requests sent to ${createdTotal} members.`
            : 'Scan request sent successfully.';
          this.pushFeedback('success', message);
          this.showCreateModal = false;
          this.togglePageScrollLock(Boolean(this.selectedRequest));
          void this.loadPage();
        },
        error: (error: unknown) => {
          const message = error instanceof Error && error.message ? error.message : 'Failed to send scan request.';
          this.pushFeedback('error', message);
        }
      });
  }

  openRequest(row: ScanRequestRow): void {
    this.selectedRequest = row;
    this.togglePageScrollLock(true);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { request: row.source.id },
      queryParamsHandling: 'merge'
    });
  }

  closeRequestDetails(): void {
    this.selectedRequest = null;
    this.togglePageScrollLock(this.showCreateModal);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { request: null },
      queryParamsHandling: 'merge'
    });
  }

  remindRequest(row: ScanRequestRow): void {
    if (!this.canManageRequestActions) {
      this.pushFeedback('error', 'Your workspace role cannot send reminders.');
      return;
    }

    this.workflows.remindScanRequest(row.source.id, row.source.notification_count).subscribe({
      next: (result: RequestActionResult) => {
        this.pushFeedback(result.ok ? 'success' : 'info', result.message);
        if (result.ok) {
          void this.loadPage();
        }
      },
      error: (error: unknown) => {
        const message = error instanceof Error && error.message ? error.message : 'Failed to send reminder.';
        this.pushFeedback('error', message);
      }
    });
  }

  cancelRequest(row: ScanRequestRow): void {
    if (!this.canManageRequestActions) {
      this.pushFeedback('error', 'Your workspace role cannot cancel requests.');
      return;
    }

    this.workflows.cancelScanRequest(row.source.id).subscribe({
      next: (result: RequestActionResult) => {
        this.pushFeedback(result.ok ? 'success' : 'info', result.message);
        if (result.ok) {
          void this.loadPage();
        }
      },
      error: (error: unknown) => {
        const message = error instanceof Error && error.message ? error.message : 'Failed to cancel request.';
        this.pushFeedback('error', message);
      }
    });
  }

  viewResult(row: ScanRequestRow): void {
    if (row.source.completed_scan_id) {
      void this.router.navigate(['/app/compliance'], {
        queryParams: { scan: row.source.completed_scan_id, request: row.source.id }
      });
      return;
    }

    this.pushFeedback('info', 'The completed scan result is not available in this view yet.');
  }

  private async loadPage(): Promise<void> {
    const runId = ++this.loadRunId;
    this.commitViewMutation(() => {
      this.pageState = 'loading';
      this.loading = true;
      this.errorMessage = '';
    });
    console.log('[ScanRequests] loading started');

    const safetyTimeout = setTimeout(() => {
      if (runId !== this.loadRunId || this.pageState !== 'loading') {
        return;
      }

      this.commitViewMutation(() => {
        console.warn('[ScanRequests] forced exit from loading after timeout');
        this.pageData = this.pageData ?? { rows: [], departments: [], members: [], requestTypeOptions: [], statusOptions: [], summary: { total: 0, pending: 0, completed: 0, overdue: 0 } };
        this.rows = this.rows ?? [];
        this.visibleRows = this.visibleRows ?? [];
        this.recomputeSummary();
        this.recomputeVisibleRows();
        this.pageState = 'ready';
        this.loading = false;
      });
      console.log('[ScanRequests] viewState ready');
      console.log('[ScanRequests] loading finished');
    }, 8000);

    try {
      const context = await this.companyContext.ensureActiveContext();
      if (runId !== this.loadRunId) {
        return;
      }

      const activeProfileId = context?.activeBusinessProfile?.id ?? null;
      if (!activeProfileId) {
        this.commitViewMutation(() => {
          console.warn('[ScanRequests] no active business profile');
          this.pageData = { rows: [], departments: [], members: [], requestTypeOptions: [], statusOptions: [], summary: { total: 0, pending: 0, completed: 0, overdue: 0 } };
          this.rows = [];
          this.visibleRows = [];
          this.recomputeSummary();
          this.recomputeVisibleRows();
          this.pageState = 'ready';
        });
        return;
      }

      console.log('[ScanRequestsDebug] activeBusinessProfileId', activeProfileId);
      console.log('[ScanRequestsDebug] current filters', this.filters);
      console.log('[ScanRequests] active context ready');
      const workforceData = await firstValueFrom(this.operationsAdmin.getWorkforceRosterData());
      const result = this.buildRequestsPageDataFromWorkforce(
        workforceData,
        activeProfileId,
        sanitizeDisplayValue(context?.activeBusinessProfile?.company_name, 'Current workspace')
      );
      if (runId !== this.loadRunId || this.pageState !== 'loading') {
        return;
      }

      this.commitViewMutation(() => {
        this.pageData = result ?? null;
        this.rows = this.buildRows(result?.rows ?? []);
        this.applyStaticOptionsFromPageData();
        this.selectedRequest = this.resolveSelectedRequestFromQuery();
        this.pageState = 'ready';
        this.recomputeSummary();
        this.recomputeVisibleRows();
      });
      console.log('[ScanRequestsDebug] mapped scan requests count', this.rows.length);
      if (this.requestedMemberId && !this.showCreateModal) {
        this.openCreateModal(this.requestedMemberId);
      }
      console.log('[ScanRequests] requests loaded', this.rows.length);
      console.log('[ScanRequests] viewState ready');
    } catch (error: unknown) {
      if (runId !== this.loadRunId) {
        return;
      }

      console.error('[ScanRequests] load failed', error);
      this.commitViewMutation(() => {
        this.pageData = null;
        this.rows = [];
        this.visibleRows = [];
        this.applyStaticOptionsFromPageData();
        this.recomputeSummary();
        this.recomputeVisibleRows();
        this.errorMessage = this.resolveLoadErrorMessage(error);
        this.pageState = 'error';
      });
      console.log('[ScanRequests] viewState error');
    } finally {
      clearTimeout(safetyTimeout);
      if (runId !== this.loadRunId) {
        return;
      }
      this.commitViewMutation(() => {
        this.loading = false;
        if (this.pageState === 'loading') {
          this.pageState = this.errorMessage ? 'error' : 'ready';
          console.log(`[ScanRequests] viewState ${this.pageState}`);
        }
      });
      console.log('[ScanRequests] loading finished');
    }
  }

  private resolveLoadErrorMessage(error: unknown): string {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const message = (error as { message?: string } | null)?.message ?? '';

    if (message.includes('No active workspace context was found.')) {
      return 'No active workspace context was found.';
    }

    if (status === 403) {
      return 'We could not load scan requests for this workspace. Please check permissions or retry.';
    }

    return 'We could not load scan requests for this workspace.';
  }

  private buildRequestsPageDataFromWorkforce(
    workforceData: WorkforceRosterPageData,
    activeBusinessProfileId: string,
    activeBusinessProfileName: string
  ): RequestsPageData {
    const rows: RequestRow[] = (workforceData.scanRequestRows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      request_type: row.request_type,
      requested_at: row.requested_at,
      due_at: row.due_at,
      completed_at: row.completed_at,
      cancelled_note: row.cancelled_note,
      target_member_id: row.target_member_id,
      target_member_name: row.target_member_name,
      target_member_email: row.target_user_email,
      requested_by_user_id: row.requested_by_user_id,
      requested_by_user_name: row.requested_by_name,
      business_profile_id: activeBusinessProfileId,
      business_profile_name: activeBusinessProfileName,
      department_id: row.department_id,
      department_name: row.department_name,
      completed_scan_id: null,
      completed_scan_at: row.completed_at,
      notification_count: 0
    }));

    const departments = (workforceData.departments ?? []).map((item) => ({
      id: item.id,
      name: item.name
    }));

    const members: WorkflowMemberOption[] = [];
    for (const member of workforceData.memberRows ?? []) {
      if (!member.member_id) {
        continue;
      }
      members.push({
        member_id: member.member_id,
        user_id: member.user_id,
        label: sanitizeDisplayValue(member.name, 'Unknown member'),
        email: sanitizeDisplayValue(member.email, '') || null,
        department_id: member.department_id,
        department_name: sanitizeDisplayValue(member.department_name, 'Unassigned'),
        status: member.status
      });
    }

    return {
      rows,
      departments,
      members,
      requestTypeOptions: Array.from(new Set(rows.map((row) => this.normalizeText(row.request_type)).filter(Boolean))),
      statusOptions: Array.from(new Set(rows.map((row) => this.normalizeText(row.status)).filter(Boolean))),
      summary: {
        total: rows.length,
        pending: rows.filter((row) => this.normalizeText(row.status) === 'pending').length,
        completed: rows.filter((row) => this.normalizeText(row.status) === 'completed').length,
        overdue: rows.filter((row) => this.isOverdue({ ...row } as RequestRow)).length
      }
    };
  }

  private async loadModalOptions(preselectedMemberId: string | null): Promise<void> {
    this.modalOptionsLoading = true;
    this.modalOptionsLoaded = false;
    this.modalOptionsError = '';

    try {
      const options: RequestModalOptions = await firstValueFrom(this.workflows.getRequestModalOptions());
      if (!this.showCreateModal) {
        return;
      }

      this.modalMembers = options.members ?? [];
      this.modalDepartments = options.departments ?? [];
      this.modalOptionsLoaded = true;
      this.applyModalOptions();

      if (preselectedMemberId) {
        const matchedMember = this.availableMembers.find(
          (member) => member.member_id === preselectedMemberId || member.user_id === preselectedMemberId
        );
        if (matchedMember) {
          this.requestForm.targetType = 'individual';
          this.requestForm.memberId = matchedMember.member_id;
        }
      }
    } catch (error) {
      console.warn('[ScanRequests] modal options load failed', error);
      this.modalOptionsError = 'Workspace members and departments are unavailable right now.';
      this.modalMembers = this.pageData?.members ?? [];
      this.modalDepartments = (this.pageData?.departments ?? []).map((department) => ({
        id: department.id,
        name: department.name
      }));
      this.modalOptionsLoaded = true;
      this.applyModalOptions();
    } finally {
      this.modalOptionsLoading = false;
    }
  }

  private buildRows(rows: RequestRow[]): ScanRequestRow[] {
    return (rows ?? []).map((row) => {
      const status = this.resolveStatus(row);
      const statusClass = this.statusClassForStatus(status);
      const missingMemberRelation = !row.target_member_id;
      const missingUserProfile = !row.target_member_email;
      const rawMemberName = this.ensureSafeLabel(
        formatMember({
          user: {
            first_name: row.target_member_name,
            email: row.target_member_email
          }
        }, row.target_member_name || 'Unknown user'),
        'Unknown user'
      );
      const showUnknownUser = rawMemberName === 'Unknown user' || rawMemberName === 'Unknown member';
      const memberName = showUnknownUser ? 'Unknown user' : rawMemberName;
      const memberSecondary = showUnknownUser
        ? (missingMemberRelation ? 'Member relation missing' : 'No linked user profile')
        : null;
      const memberEmail = this.ensureSafeLabel(row.target_member_email, 'No linked user profile');
      const departmentName = this.ensureSafeLabel(
        formatDepartment(
          { name: row.department_name },
          row.department_id ? 'Deleted department' : 'Unassigned'
        ),
        row.department_id ? 'Deleted department' : 'Unassigned'
      );
      const requestedBy = this.ensureSafeLabel(row.requested_by_user_name, 'System');
      const businessProfileName = this.ensureSafeLabel(
        formatBusinessProfile({ name: row.business_profile_name }, 'Unknown workspace'),
        'Unknown workspace'
      );
      const completedScanLabel =
        row.completed_scan_id && !isUuid(row.completed_scan_id) ? 'Available' : row.completed_scan_id ? 'Available' : '-';
      return {
        source: row,
        status,
        statusLabel: this.statusLabel(status),
        statusClass,
        memberName,
        memberEmail,
        memberSecondary,
        departmentName,
        businessProfileName,
        requestedBy,
        completedScanLabel,
        requestedAtTs: this.toTimestamp(row.requested_at),
        dueAtTs: this.toTimestamp(row.due_at),
        completedAtTs: this.toTimestamp(row.completed_at),
        requestedAtLabel: this.formatDateTimeLabel(row.requested_at),
        dueAtLabel: row.due_at ? this.formatDateTimeLabel(row.due_at) : 'Not set',
        completedAtLabel: this.formatDateTimeLabel(row.completed_at)
      } satisfies ScanRequestRow;
    });
  }

  private statusClassForStatus(status: ScanRequestStatus): string {
    if (status === 'completed') return 'request-status request-status--completed';
    if (status === 'overdue') return 'request-status request-status--overdue';
    if (status === 'expired' || status === 'cancelled') return 'request-status request-status--neutral';
    return 'request-status request-status--pending';
  }

  private resolveStatus(row: RequestRow): ScanRequestStatus {
    const rawStatus = this.normalizeText(row.status);

    if (rawStatus.includes('cancel')) {
      return 'cancelled';
    }

    if (rawStatus.includes('expire')) {
      return 'expired';
    }

    if (rawStatus.includes('complete') || Boolean(row.completed_at) || Boolean(row.completed_scan_id)) {
      return 'completed';
    }

    if (this.isOverdue(row)) {
      return 'overdue';
    }

    return 'pending';
  }

  private statusLabel(status: ScanRequestStatus): string {
    if (status === 'pending') return 'Pending';
    if (status === 'completed') return 'Completed';
    if (status === 'overdue') return 'Overdue';
    if (status === 'expired') return 'Expired';
    return 'Cancelled';
  }

  private isOverdue(row: RequestRow): boolean {
    const status = this.normalizeText(row.status);
    if (!row.due_at) {
      return false;
    }

    if (status.includes('complete') || status.includes('cancel') || status.includes('expire')) {
      return false;
    }

    const dueAt = this.toTimestamp(row.due_at);
    return dueAt > 0 && dueAt < Date.now();
  }

  private resolveSelectedRequestFromQuery(): ScanRequestRow | null {
    const requestId = this.route.snapshot.queryParamMap.get('request');
    if (!requestId) {
      return null;
    }
    return this.rows.find((row) => row.source.id === requestId) ?? null;
  }

  private resolveFilterDateRange(): { start: number; end: number } | null {
    if (this.filters.dateRange === 'all') {
      return null;
    }

    if (this.filters.dateRange === 'today') {
      return this.todayRange();
    }

    if (this.filters.dateRange === 'last7') {
      const today = this.todayRange();
      const start = today.start - 6 * 24 * 60 * 60 * 1000;
      return {
        start,
        end: today.end - 1
      };
    }

    if (!this.filters.customStart || !this.filters.customEnd) {
      return null;
    }

    const start = this.toTimestamp(`${this.filters.customStart}T00:00:00`);
    const end = this.toTimestamp(`${this.filters.customEnd}T23:59:59`);

    if (!start || !end || end < start) {
      return null;
    }

    return { start, end };
  }

  private todayRange(): { start: number; end: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return { start, end };
  }

  private recomputeSummary(): void {
    const todayRange = this.todayRange();
    const pendingRequests = this.rows.filter((row) => row.status === 'pending').length;
    const completedToday = this.rows.filter(
      (row) => row.status === 'completed' && row.completedAtTs >= todayRange.start && row.completedAtTs < todayRange.end
    ).length;
    const overdueRequests = this.rows.filter((row) => row.status === 'overdue').length;
    const expiredOrCancelled = this.rows.filter((row) => row.status === 'expired' || row.status === 'cancelled').length;
    const totalSentToday = this.rows.filter(
      (row) =>
        row.requestedAtTs >= todayRange.start &&
        row.requestedAtTs < todayRange.end &&
        row.status !== 'expired' &&
        row.status !== 'cancelled'
    ).length;

    this.summary = {
      pendingRequests,
      completedToday,
      overdueRequests,
      expiredOrCancelled,
      completionRate: totalSentToday > 0 ? Math.round((completedToday / totalSentToday) * 100) : 0,
      totalSentToday
    };
  }

  private recomputeVisibleRows(): void {
    const search = this.filters.search.trim().toLowerCase();
    const dateRange = this.resolveFilterDateRange();
    this.hasActiveFilters = this.computeHasActiveFilters();

    let filtered = this.rows.filter((row) => {
      const searchMatch =
        !search ||
        row.memberName.toLowerCase().includes(search) ||
        row.memberEmail.toLowerCase().includes(search) ||
        row.departmentName.toLowerCase().includes(search) ||
        row.businessProfileName.toLowerCase().includes(search) ||
        row.requestedBy.toLowerCase().includes(search);
      const statusMatch = this.filters.status === 'all' || row.status === this.filters.status;
      const departmentMatch = !this.filters.department || row.source.department_id === this.filters.department;
      const dateMatch = !dateRange || (row.requestedAtTs >= dateRange.start && row.requestedAtTs <= dateRange.end);
      return searchMatch && statusMatch && departmentMatch && dateMatch;
    });

    if (this.filters.sort === 'dueSoon') {
      filtered = [...filtered].sort((left, right) => {
        const leftDue = left.dueAtTs || Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAtTs || Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });
    } else if (this.filters.sort === 'overdueFirst') {
      filtered = [...filtered].sort((left, right) => {
        const leftOverdue = left.status === 'overdue' ? 0 : 1;
        const rightOverdue = right.status === 'overdue' ? 0 : 1;
        if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
        const leftDue = left.dueAtTs || Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAtTs || Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });
    } else {
      filtered = [...filtered].sort((left, right) => right.requestedAtTs - left.requestedAtTs);
    }

    this.visibleRows = filtered;
    this.resultCountLabel = `${this.visibleRows.length} of ${this.rows.length} shown`;
    this.showNoMatchingState = this.pageState === 'ready' && this.visibleRows.length === 0;
  }

  private applyStaticOptionsFromPageData(): void {
    this.availableDepartments = (this.pageData?.departments ?? []).map((item) => ({ id: item.id, name: item.name }));
    this.hasDepartments = this.availableDepartments.length > 0;

    const source = this.pageData?.members ?? [];
    this.availableMembers = source.filter((member) => {
      const status = this.normalizeText(member.status);
      return status !== 'inactive' && status !== 'suspended';
    });
    this.hasMembers = this.availableMembers.length > 0;
    this.recomputeMemberOptions();
  }

  private applyModalOptions(): void {
    this.availableDepartments = this.modalDepartments;
    this.hasDepartments = this.availableDepartments.length > 0;

    this.availableMembers = this.modalMembers.filter((member) => {
      const status = this.normalizeText(member.status);
      return status !== 'inactive' && status !== 'suspended';
    });
    this.hasMembers = this.availableMembers.length > 0;
    this.recomputeMemberOptions();
  }

  private recomputeMemberOptions(): void {
    const search = this.memberSearch.trim().toLowerCase();
    if (!search) {
      this.filteredMemberOptions = [...this.availableMembers];
      return;
    }

    this.filteredMemberOptions = this.availableMembers.filter((member) => {
      const label = this.normalizeText(member.label);
      const email = this.normalizeText(member.email);
      return label.includes(search) || email.includes(search);
    });
  }

  trackByDepartment(index: number, item: { id: string; name: string }): string {
    return item.id || String(index);
  }

  trackByMember(index: number, item: WorkflowMemberOption): string {
    return item.member_id || String(index);
  }

  private defaultRequestForm(): NewRequestForm {
    return {
      targetType: '',
      memberId: '',
      departmentId: '',
      dueTime: '',
      customDueAt: ''
    };
  }

  private emptyFormErrors(): NewRequestFormErrors {
    return {
      targetType: '',
      memberId: '',
      departmentId: '',
      dueTime: '',
      customDueAt: ''
    };
  }

  private validateForm(): NewRequestFormErrors {
    const errors = this.emptyFormErrors();

    if (!this.requestForm.targetType) {
      errors.targetType = 'Target type is required.';
    }

    if (this.requestForm.targetType === 'individual' && !this.requestForm.memberId) {
      errors.memberId = 'Member is required.';
    }

    if (this.requestForm.targetType === 'department' && !this.requestForm.departmentId) {
      errors.departmentId = 'Department is required.';
    }

    if (!this.requestForm.dueTime) {
      errors.dueTime = 'Due time is required.';
    }

    if (this.requestForm.dueTime === 'custom' && !this.requestForm.customDueAt) {
      errors.customDueAt = 'Custom due date and time is required.';
    }

    return errors;
  }

  private hasFormErrors(errors: NewRequestFormErrors): boolean {
    return Boolean(
      errors.targetType ||
      errors.memberId ||
      errors.departmentId ||
      errors.dueTime ||
      errors.customDueAt
    );
  }

  private resolveDueAtIso(): string | null {
    const now = new Date();

    if (this.requestForm.dueTime === 'endOfToday') {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
      return endOfDay.toISOString();
    }

    if (this.requestForm.dueTime === 'in1Hour') {
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    }

    if (this.requestForm.dueTime === 'in2Hours') {
      return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    }

    if (this.requestForm.dueTime === 'custom' && this.requestForm.customDueAt) {
      const timestamp = this.toTimestamp(this.requestForm.customDueAt);
      if (!timestamp) {
        return null;
      }
      return new Date(timestamp).toISOString();
    }

    return null;
  }

  private pushFeedback(type: FeedbackType, text: string): void {
    this.feedback = { type, text };

    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }

    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
    }, 3500);
  }

  private computeHasActiveFilters(): boolean {
    return Boolean(
      this.filters.search.trim() ||
      this.filters.status !== 'all' ||
      this.filters.department ||
      this.filters.dateRange !== 'all' ||
      this.filters.customStart ||
      this.filters.customEnd ||
      this.filters.sort !== 'newest'
    );
  }

  private ensureSafeLabel(value: string | null | undefined, fallback: string): string {
    return sanitizeDisplayValue(value, fallback);
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private togglePageScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    const body = document.body;
    body.style.overflow = locked ? 'hidden' : '';
  }

  private commitViewMutation(update: () => void): void {
    this.ngZone.run(() => {
      update();
      this.cdr.detectChanges();
    });
  }
}
