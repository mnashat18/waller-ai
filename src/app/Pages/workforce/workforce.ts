import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize, take } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { type ActiveMemberRole } from '../../ia/wellar-ia';
import { AuthService } from '../../services/auth';
import {
  OperationsAdminService,
  type CreateInviteInput,
  type WorkforceRosterPageData,
  type WorkforceRosterRow,
  type WorkforceScanRequestRow,
  type WorkforceScanStatus,
  type WorkforceSummary
} from '../../services/operations-admin.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';

type ViewState = 'loading' | 'ready' | 'empty' | 'error';
type FeedbackType = 'success' | 'error' | 'info';

type FeedbackMessage = {
  type: FeedbackType;
  text: string;
};

type WorkforceFilters = {
  search: string;
  role: string;
  department: string;
  status: string;
  todayScan: string;
};

type InviteForm = {
  email: string;
  role: string;
  department: string;
};

type StatusFilterOption = {
  value: string;
  label: string;
};

type DestructiveAction = {
  kind: 'remove_member' | 'cancel_invite';
  row: WorkforceRosterRow;
  title: string;
  description: string;
  confirmLabel: string;
};

@Component({
  selector: 'app-workforce-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    KpiCardComponent,
    TableShellComponent,
    ErrorStateComponent,
    CardSkeletonLoaderComponent,
    ViewportDialogComponent
  ],
  templateUrl: './workforce.html',
  styleUrls: ['./workforce.css']
})
export class WorkforcePageComponent implements OnInit, OnDestroy {
  @ViewChild('detailsCloseButton') private detailsCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('detailsDrawerPanel') private detailsDrawerPanel?: ElementRef<HTMLElement>;

  viewState: ViewState = 'loading';
  feedback: FeedbackMessage | null = null;
  errorMessage = '';
  errorDetails = '';
  relationWarning: string | null = null;

  pageData: WorkforceRosterPageData | null = null;
  summary: WorkforceSummary = {
    activeMembers: 0,
    scanEligible: 0,
    scanRequested: 0,
    scannedToday: 0,
    missingScans: 0,
    pendingInvites: 0,
    ownerCount: 0,
    hrCount: 0,
    managerCount: 0,
    employeeCount: 0,
    needsReviewCount: 0
  };

  filters: WorkforceFilters = {
    search: '',
    role: '',
    department: '',
    status: 'all',
    todayScan: 'all'
  };

  readonly statusFilterOptions: StatusFilterOption[] = [
    { value: 'all', label: 'All rows' },
    { value: 'active_member', label: 'Active members' },
    { value: 'pending_invite', label: 'Pending invitations' }
  ];

  readonly todayScanFilterOptions: StatusFilterOption[] = [
    { value: 'all', label: 'All scan states' },
    { value: 'eligible', label: 'Scan Eligible' },
    { value: 'requested', label: 'Scan Requested' },
    { value: 'none_assigned', label: 'No Scan Assigned' }
  ];

  showInviteModal = false;
  savingInvite = false;
  inviteFormError = '';
  inviteForm: InviteForm = this.defaultInviteForm();

  selectedMember: WorkforceRosterRow | null = null;
  showDetailsModal = false;

  showRoleModal = false;
  roleModalMember: WorkforceRosterRow | null = null;
  roleModalValue = 'employee';
  savingRole = false;

  showDepartmentModal = false;
  departmentModalMember: WorkforceRosterRow | null = null;
  departmentModalValue = '';
  savingDepartment = false;

  showDestructiveModal = false;
  destructiveAction: DestructiveAction | null = null;
  destructiveLoading = false;

  private requestInFlight = false;
  private blockedByForbidden = false;
  private previouslyFocusedElement: HTMLElement | null = null;
  private readonly expandedKeys = new Set<string>();

  constructor(
    private operationsAdmin: OperationsAdminService,
    private companyContext: CompanyContextService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.applyNavigationState();
    if (this.route.snapshot.queryParamMap.get('invite') === '1') {
      this.openInviteModal();
    }
    this.loadPage();
  }

  ngOnDestroy(): void {
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showDetailsModal) {
      this.closeMemberView();
    }
  }

  trapDetailsFocus(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!this.showDetailsModal || keyboardEvent.key !== 'Tab') {
      return;
    }

    const panel = this.detailsDrawerPanel?.nativeElement;
    if (!panel) {
      return;
    }

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((item) => item.offsetParent !== null);

    if (!focusable.length) {
      keyboardEvent.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (keyboardEvent.shiftKey && active === first) {
      keyboardEvent.preventDefault();
      last.focus();
      return;
    }

    if (!keyboardEvent.shiftKey && active === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }

  get canInviteMember(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get isManager(): boolean {
    return this.currentRole === 'manager';
  }

  get isOwnerOrHr(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canShowInvitations(): boolean {
    return this.isOwnerOrHr && this.canInviteMember;
  }

  get workforceDescription(): string {
    if (this.isManager) {
      const department = this.managerDepartmentLabel;
      return department
        ? `Assigned department workforce overview for ${department}.`
        : 'Assigned department workforce overview.';
    }

    if (this.isOwnerOrHr) {
      const organization = this.companyContext.snapshot().context.activeBusinessProfileName || 'the active organization';
      return `Organization workforce overview for ${organization}.`;
    }

    return 'Workforce overview for the active workspace.';
  }

  get managerDepartmentLabel(): string {
    return (
      this.companyContext.snapshot().context.activeDepartmentName ||
      this.pageData?.departments?.[0]?.name ||
      ''
    );
  }

  get scopeLabel(): string {
    if (this.isManager) {
      return this.managerDepartmentLabel ? `Department: ${this.managerDepartmentLabel}` : 'Department scope';
    }

    return 'Organization scope';
  }

  get showNoActiveDepartmentState(): boolean {
    return this.isManager && !this.companyContext.snapshot().context.activeDepartmentId && this.viewState !== 'loading';
  }

  get currentRole(): ActiveMemberRole | null {
    return this.companyContext.snapshot().context.activeMemberRole;
  }

  get departmentOptions(): Array<{ id: string; name: string }> {
    return this.pageData?.departments ?? [];
  }

  get hasDepartments(): boolean {
    return this.departmentOptions.length > 0;
  }

  get roleOptions(): string[] {
    const rows = this.rosterRows;
    return Array.from(new Set(rows.map((row) => row.member_role).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  get visibleStatusFilterOptions(): StatusFilterOption[] {
    return this.statusFilterOptions.filter((option) => option.value !== 'pending_invite' || this.canShowInvitations);
  }

  get rosterRows(): WorkforceRosterRow[] {
    const rows = this.pageData?.rows ?? [];
    return this.canShowInvitations ? rows : rows.filter((row) => row.type === 'member');
  }

  get filteredRows(): WorkforceRosterRow[] {
    const rows = this.rosterRows;
    const search = this.filters.search.trim().toLowerCase();
    const roleFilter = this.normalizeRoleForUi(this.filters.role);

    return rows.filter((row) => {
      const matchesSearch =
        !search ||
        this.memberName(row).toLowerCase().includes(search) ||
        (row.identity?.email ?? '').toLowerCase().includes(search) ||
        (row.department_name ?? '').toLowerCase().includes(search);

      const matchesRole =
        !roleFilter || this.normalizeRoleForUi(row.member_role) === roleFilter;

      const matchesDepartment =
        !this.filters.department || row.department_id === this.filters.department;

      const matchesStatus = this.matchesStatusFilter(row, this.filters.status);
      const matchesScan = this.matchesScanFilter(row, this.filters.todayScan);

      return (
        matchesSearch &&
        matchesRole &&
        matchesDepartment &&
        matchesStatus &&
        matchesScan
      );
    });
  }

  get filteredMemberRows(): WorkforceRosterRow[] {
    return this.filteredRows.filter((row) => row.type === 'member');
  }

  get filteredInviteRows(): WorkforceRosterRow[] {
    if (!this.canShowInvitations) {
      return [];
    }

    return this.filteredRows.filter(
      (row) => row.type === 'invite' && ['pending', 'sent'].includes(this.normalizeStatus(row.status))
    );
  }

  get needsReviewRows(): WorkforceRosterRow[] {
    return [];
  }

  get resultCountLabel(): string {
    const total = this.rosterRows.length;
    const visible = this.filteredRows.length;
    return `${visible} of ${total} shown`;
  }

  get departmentSummaryValue(): string {
    if (this.isManager) {
      return this.managerDepartmentLabel || 'Unavailable';
    }

    return String(this.departmentOptions.length);
  }

  get departmentSummaryLabel(): string {
    return this.isManager ? 'Scoped Department' : 'Departments';
  }

  get departmentSummaryHelper(): string {
    return this.isManager
      ? 'Assigned department returned for this manager scope.'
      : 'Departments returned for the active organization.';
  }

  get scanCoverageLabel(): string {
    const eligible = this.summary.scanEligible;
    const completed = this.summary.scannedToday;
    if (!eligible) {
      return '0%';
    }

    return `${Math.round((completed / eligible) * 100)}%`;
  }

  get scanCoverageHelper(): string {
    return `${this.summary.scannedToday} of ${this.summary.scanEligible} scan-eligible members scanned today.`;
  }

  get rosterEmptyTitle(): string {
    if (this.showNoActiveDepartmentState) {
      return 'No active department context';
    }

    if (this.isManager) {
      return 'No members in this department';
    }

    return 'No active workforce members';
  }

  get rosterEmptyMessage(): string {
    if (this.showNoActiveDepartmentState) {
      return 'This manager account needs an assigned active department before Workforce data can be shown.';
    }

    if (this.isManager) {
      return 'No active members were returned for the assigned department.';
    }

    return this.canInviteMember
      ? 'No active members were returned for this organization. Invitation actions remain available where supported.'
      : 'No active members were returned for this workspace.';
  }

  get showOpenScanRequests(): boolean {
    return this.openScanRequestRows.length > 0;
  }

  get openScanRequestRows(): WorkforceScanRequestRow[] {
    const rows = this.pageData?.scanRequestRows ?? [];
    return rows.filter((row) => !row.cancelled && !this.isClosedRequestStatus(row.status)).slice(0, 5);
  }

  get hasOpenScanRequests(): boolean {
    return this.openScanRequestRows.length > 0;
  }

  refresh(): void {
    this.blockedByForbidden = false;
    this.loadPage(true);
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      role: '',
      department: '',
      status: 'all',
      todayScan: 'all'
    };
  }

  toggleExpanded(row: WorkforceRosterRow): void {
    if (!row.key) {
      return;
    }
    if (this.expandedKeys.has(row.key)) {
      this.expandedKeys.delete(row.key);
      return;
    }
    this.expandedKeys.add(row.key);
  }

  isExpanded(row: WorkforceRosterRow): boolean {
    return !!row.key && this.expandedKeys.has(row.key);
  }

  openInviteModal(): void {
    if (!this.canShowInvitations) {
      return;
    }

    this.inviteForm = this.defaultInviteForm();
    this.inviteFormError = '';
    this.showInviteModal = true;
  }

  closeInviteModal(): void {
    this.showInviteModal = false;
    this.inviteFormError = '';
  }

  sendInvite(): void {
    if (!this.canShowInvitations || this.savingInvite) {
      return;
    }

    const email = this.toNullable(this.inviteForm.email);
    if (!email) {
      this.inviteFormError = 'Email is required.';
      return;
    }

    const inviteInput: CreateInviteInput = {
      email,
      member_role: this.normalizeRoleForUi(this.inviteForm.role || 'employee'),
      department: this.toNullable(this.inviteForm.department)
    };

    this.savingInvite = true;
    this.inviteFormError = '';

    this.operationsAdmin.createInvite(inviteInput).pipe(
      finalize(() => {
        this.savingInvite = false;
      })
    ).subscribe({
      next: (result) => {
        this.showInviteModal = false;
        void result;
        this.pushFeedback('success', 'Invitation sent.');
        this.loadPage();
      },
      error: (error) => {
        this.inviteFormError = this.toFriendlyError(error, 'Failed to send invite.');
      }
    });
  }

  openMemberView(row: WorkforceRosterRow): void {
    if (row.state === 'pending_invitation' && !this.canShowInvitations) {
      return;
    }

    this.selectedMember = row;
    this.showDetailsModal = true;
    this.previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => this.detailsCloseButton?.nativeElement.focus());
  }

  closeMemberView(): void {
    this.selectedMember = null;
    this.showDetailsModal = false;
    queueMicrotask(() => this.previouslyFocusedElement?.focus());
    this.previouslyFocusedElement = null;
  }

  canSendScanRequest(row: WorkforceRosterRow): boolean {
    return row.state === 'verified_member' && ['hr', 'manager', 'employee'].includes(row.member_role) && Boolean(row.email) && (this.currentRole === 'owner' || this.currentRole === 'hr');
  }

  sendScanRequest(row: WorkforceRosterRow): void {
    if (!this.canSendScanRequest(row) || !row.member_id) {
      return;
    }

    this.router.navigate(['/app/scan-requests'], {
      state: {
        openCreateRequest: true,
        workforceTargetMemberId: row.member_id,
        workforceTargetName: this.memberName(row),
        workforceTargetEmail: this.memberSecondaryLabel(row)
      }
    });
  }

  canEditRole(row: WorkforceRosterRow | null): boolean {
    if (!row || row.state !== 'verified_member' || !row.member_id) {
      return false;
    }

    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  openRoleModal(row: WorkforceRosterRow): void {
    if (!this.canEditRole(row)) {
      return;
    }

    this.roleModalMember = row;
    this.roleModalValue = this.normalizeRoleForUi(row.member_role || 'employee') || 'employee';
    this.showRoleModal = true;
  }

  closeRoleModal(): void {
    this.showRoleModal = false;
    this.roleModalMember = null;
  }

  roleEditOptions(member: WorkforceRosterRow | null): string[] {
    if (!member) {
      return ['employee'];
    }

    const currentRole = this.currentRole;
    if (currentRole === 'owner') {
      return ['owner', 'hr', 'manager', 'employee'];
    }

    if (currentRole === 'hr') {
      return ['hr', 'manager', 'employee'];
    }

    return ['employee'];
  }

  saveRole(): void {
    const member = this.roleModalMember;
    if (!member?.member_id || !this.canEditRole(member) || this.savingRole) {
      return;
    }

    this.savingRole = true;
    const role = this.normalizeRoleForUi(this.roleModalValue);

    this.operationsAdmin.updateMember(member.member_id, { member_role: role }).pipe(
      finalize(() => {
        this.savingRole = false;
      })
    ).subscribe({
      next: () => {
        this.closeRoleModal();
        this.pushFeedback('success', 'Member role updated.');
        this.loadPage();
      },
      error: (error) => {
        this.pushFeedback('error', this.toFriendlyError(error, 'Failed to update role.'));
      }
    });
  }

  canAssignDepartment(row: WorkforceRosterRow | null): boolean {
    if (!row || row.state !== 'verified_member' || !row.member_id) {
      return false;
    }
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  openDepartmentModal(row: WorkforceRosterRow): void {
    if (!this.canAssignDepartment(row)) {
      return;
    }

    this.departmentModalMember = row;
    this.departmentModalValue = row.department_id ?? '';
    this.showDepartmentModal = true;
  }

  closeDepartmentModal(): void {
    this.showDepartmentModal = false;
    this.departmentModalMember = null;
  }

  saveDepartment(): void {
    const member = this.departmentModalMember;
    if (!member?.member_id || !this.canAssignDepartment(member) || this.savingDepartment) {
      return;
    }

    this.savingDepartment = true;

    this.operationsAdmin.updateMember(member.member_id, {
      department: this.toNullable(this.departmentModalValue)
    }).pipe(
      finalize(() => {
        this.savingDepartment = false;
      })
    ).subscribe({
      next: () => {
        this.closeDepartmentModal();
        this.pushFeedback('success', 'Department updated.');
        this.loadPage();
      },
      error: (error) => {
        this.pushFeedback('error', this.toFriendlyError(error, 'Failed to update department.'));
      }
    });
  }

  canDeactivate(row: WorkforceRosterRow | null): boolean {
    if (!row || row.state !== 'verified_member' || !row.member_id) {
      return false;
    }
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  requestDeactivate(row: WorkforceRosterRow): void {
    if (!this.canDeactivate(row)) {
      return;
    }

    const label = this.memberName(row);
    this.destructiveAction = {
      kind: 'remove_member',
      row,
      title: 'Remove Member',
      description: `Deactivate ${label} from active workforce?`,
      confirmLabel: 'Remove Member'
    };
    this.showDestructiveModal = true;
  }

  canResendInvite(row: WorkforceRosterRow): boolean {
    return this.canShowInvitations && row.state === 'pending_invitation' && Boolean(row.invite_id);
  }

  resendInvite(row: WorkforceRosterRow): void {
    if (!this.canShowInvitations) {
      return;
    }

    if (!row.invite_id) {
      return;
    }

    this.operationsAdmin.resendInvite(row.invite_id).subscribe({
      next: () => {
        this.pushFeedback('success', 'Invite resent.');
        this.loadPage();
      },
      error: (error) => {
        this.pushFeedback('error', this.toFriendlyError(error, 'Failed to resend invite.'));
      }
    });
  }

  requestCancelInvite(row: WorkforceRosterRow): void {
    if (!this.canShowInvitations) {
      return;
    }

    if (!row.invite_id) {
      return;
    }

    const label = this.inviteContact(row);
    this.destructiveAction = {
      kind: 'cancel_invite',
      row,
      title: 'Cancel Invite',
      description: `Cancel pending invite for ${label}?`,
      confirmLabel: 'Cancel Invite'
    };
    this.showDestructiveModal = true;
  }

  canRevokeInvite(row: WorkforceRosterRow): boolean {
    return this.canShowInvitations && row.state === 'pending_invitation' && Boolean(row.invite_id);
  }

  openInScanRequests(request: WorkforceScanRequestRow): void {
    this.router.navigate(['/app/scan-requests'], {
      state: {
        workforceRequestTargetName: request.target_identity.displayName,
        workforceRequestTargetEmail: request.target_identity.email
      }
    });
  }

  closeDestructiveModal(): void {
    if (this.destructiveLoading) {
      return;
    }
    this.showDestructiveModal = false;
    this.destructiveAction = null;
  }

  confirmDestructiveAction(): void {
    if (!this.destructiveAction || this.destructiveLoading) {
      return;
    }

    this.destructiveLoading = true;
    const action = this.destructiveAction;

    if (action.kind === 'remove_member') {
      const memberId = action.row.member_id;
      if (!memberId) {
        this.destructiveLoading = false;
        this.closeDestructiveModal();
        return;
      }

      this.operationsAdmin.deactivateMember(memberId).pipe(
        finalize(() => {
          this.destructiveLoading = false;
        })
      ).subscribe({
        next: () => {
          this.closeDestructiveModal();
          this.pushFeedback('success', 'Member removed from active roster.');
          this.loadPage();
        },
        error: (error: unknown) => {
          this.pushFeedback('error', this.toFriendlyError(error, 'Failed to deactivate member.'));
        }
      });
      return;
    }

    const inviteId = action.row.invite_id;
    if (!inviteId || !this.canShowInvitations) {
      this.destructiveLoading = false;
      this.closeDestructiveModal();
      return;
    }

    this.operationsAdmin.revokeInvite(inviteId).pipe(
      finalize(() => {
        this.destructiveLoading = false;
      })
    ).subscribe({
      next: () => {
        this.closeDestructiveModal();
        this.pushFeedback('success', 'Invite cancelled.');
        this.loadPage();
      },
      error: (error) => {
        this.pushFeedback('error', this.toFriendlyError(error, 'Failed to cancel invite.'));
      }
    });
  }

  roleLabel(value: string | null | undefined): string {
    const normalized = this.normalizeRoleForUi(value);
    if (normalized === 'owner') return 'OWNER';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'MANAGER';
    if (normalized === 'employee') return 'EMPLOYEE';
    return value?.trim() || 'Unknown';
  }

  statusLabel(value: string | null | undefined): string {
    const normalized = this.normalizeStatus(value);
    if (normalized === 'active') return 'Active';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'cancelled') return 'Cancelled';
    if (normalized === 'revoked') return 'Revoked';
    if (normalized === 'expired') return 'Expired';
    if (normalized === 'accepted') return 'Accepted';
    return value?.trim() || 'Unknown';
  }

  rowBadgeLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      if (this.normalizeStatus(row.status) === 'accepted' || this.normalizeStatus(row.status) === 'claimed') {
        return 'Invite Claimed';
      }
      if (this.isInviteExpired(row)) {
        return 'Invite Expired';
      }
      return 'Pending invitation';
    }

    if (row.state === 'repair_required') {
      return 'Data repair required';
    }

    if (row.state === 'inactive') {
      return 'Inactive Member';
    }

    if (row.state === 'verified_member' && this.normalizeStatus(row.status) === 'active') {
      return 'Verified Active Member';
    }

    return `${this.statusLabel(row.status)} Member`;
  }

  rowBadgeClass(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      if (this.normalizeStatus(row.status) === 'accepted' || this.normalizeStatus(row.status) === 'claimed') {
        return 'workforce-badge workforce-badge--claimed';
      }
      if (this.isInviteExpired(row)) {
        return 'workforce-badge workforce-badge--expired';
      }
      return 'workforce-badge workforce-badge--pending';
    }

    if (row.state === 'repair_required') {
      return 'workforce-badge workforce-badge--neutral';
    }

    if (row.state === 'inactive') {
      return 'workforce-badge workforce-badge--inactive';
    }

    if (this.normalizeStatus(row.status) === 'active') {
      return 'workforce-badge workforce-badge--active';
    }

    return 'workforce-badge workforce-badge--inactive';
  }

  scanBadgeLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') return 'Not applicable';
    if (row.scan_status === 'completed') return 'Scan Completed';
    if (row.scan_status === 'requested') return 'Scan Requested';
    if (row.scan_status === 'missing') return 'Missing Scan';
    if (row.scan_status === 'none_assigned') return 'No Scan Assigned';
    return 'No Scan Assigned';
  }

  scanBadgeClass(row: WorkforceRosterRow): string {
    if (row.scan_status === 'completed') return 'workforce-badge workforce-badge--scan-completed';
    if (row.scan_status === 'requested') return 'workforce-badge workforce-badge--scan-requested';
    if (row.scan_status === 'missing') return 'workforce-badge workforce-badge--scan-missing';
    return 'workforce-badge workforce-badge--neutral';
  }

  presenceBadgeClass(row: WorkforceRosterRow): string {
    if (row.presence_status === 'online') return 'workforce-badge workforce-badge--online';
    if (row.presence_status === 'idle') return 'workforce-badge workforce-badge--idle';
    if (row.presence_status === 'offline') return 'workforce-badge workforce-badge--offline';
    return 'workforce-badge workforce-badge--neutral';
  }

  readinessLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      return 'Not applicable';
    }

    if (row.scan_status !== 'completed') {
      return 'No scan data';
    }

    return row.readiness_label || 'No scan data';
  }

  isScanEligible(row: WorkforceRosterRow): boolean {
    if (row.type !== 'member') {
      return false;
    }
    return this.normalizeStatus(row.status) === 'active' && this.normalizeRoleForUi(row.member_role) === 'employee';
  }

  lastScanLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      return 'Not applicable';
    }

    const timestamp = row.last_scan_at;
    if (!timestamp) {
      return 'No scan data';
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'No scan data';
    }

    if (this.isSameDay(date, new Date())) {
      return `Today ${this.formatTime(date)}`;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (this.isSameDay(date, yesterday)) {
      return 'Yesterday';
    }

    return this.formatShortDateTime(date);
  }

  memberName(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      return 'Invitation pending';
    }

    if (row.state === 'repair_required') {
      return 'Data repair required';
    }

    if (!row.user_id && !row.linked_invite_email && !row.identity?.displayName) {
      return 'Data repair required';
    }

    if (row.identity_state === 'identity_unavailable') {
      return row.identity?.displayName || row.name || 'Data repair required';
    }

    return row.identity?.displayName || row.name || 'Identity unavailable';
  }

  memberEmail(row: WorkforceRosterRow): string {
    if (row.identity?.email) {
      return row.identity.email;
    }
    return 'Email unavailable';
  }

  hasActualEmail(row: WorkforceRosterRow | null): boolean {
    return Boolean(row?.identity?.email?.trim());
  }

  memberSecondaryLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      return row.email || row.invite_phone || 'Invitation pending';
    }

    if (row.state === 'repair_required') {
      return this.repairReasonLabel(row.reason);
    }

    if (row.state === 'verified_member' || row.state === 'inactive') {
      return row.identity?.email?.trim() || 'Email unavailable';
    }

    if (!row.user_id && !row.linked_invite_email) {
      return 'Data repair required';
    }

    if (row.identity?.email?.trim()) {
      return row.identity.email.trim();
    }

    if (row.linked_invite_email?.trim()) {
      return row.linked_invite_email.trim();
    }

    return 'Data repair required';
  }

  inviteContact(row: WorkforceRosterRow): string {
    return row.email || row.invite_phone || 'Invitation pending';
  }

  detailsTitle(row: WorkforceRosterRow | null): string {
    if (!row) return 'Details';
    if (row.type === 'invite') {
      return 'Invite Details';
    }

    if (row.state === 'repair_required') {
      return 'Data repair required';
    }

    return 'Member Details';
  }

  rowTypeLabel(row: WorkforceRosterRow): string {
    return row.type === 'invite' ? 'Invitation' : 'Person';
  }

  departmentLabel(row: WorkforceRosterRow): string {
    return row.department_name || (this.isManager ? this.managerDepartmentLabel : '') || 'Unassigned';
  }

  employmentLabel(row: WorkforceRosterRow): string {
    if (row.type === 'invite') {
      return statusLabel(row.status);
    }

    if (row.state === 'repair_required') {
      return 'Data repair required';
    }

    if (row.state === 'inactive') {
      return 'Inactive';
    }

    return statusLabel(row.status);

    function statusLabel(value: string | null | undefined): string {
      const normalized = (value ?? '').trim().toLowerCase();
      if (normalized === 'active') return 'Active';
      if (normalized === 'inactive') return 'Inactive';
      if (normalized === 'pending') return 'Pending';
      if (normalized === 'cancelled') return 'Cancelled';
      if (normalized === 'revoked') return 'Revoked';
      if (normalized === 'expired') return 'Expired';
      if (normalized === 'accepted') return 'Accepted';
      return value?.trim() || 'Unknown';
    }
  }

  repairReasonLabel(reason: string | null | undefined): string {
    const normalized = (reason ?? '').trim().toLowerCase();
    if (!normalized) {
      return 'Data repair required';
    }
    if (normalized.includes('missing linked user')) {
      return 'Missing linked user';
    }
    if (normalized.includes('missing email')) {
      return 'Missing email';
    }
    if (normalized.includes('invalid membership relationship')) {
      return 'Invalid membership relationship';
    }
    return 'Data repair required';
  }

  detailUnavailableLabel(value: string | null | undefined, fallback = 'Unavailable'): string {
    return value && value.trim() ? value.trim() : fallback;
  }

  hasActiveFilters(): boolean {
    return (
      Boolean(this.filters.search.trim()) ||
      Boolean(this.filters.role) ||
      Boolean(this.filters.department) ||
      this.filters.status !== 'all' ||
      this.filters.todayScan !== 'all'
    );
  }

  memberInitials(row: WorkforceRosterRow): string {
    const label = this.memberName(row);
    const parts = label.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part.charAt(0));
    return initials.join('').toUpperCase() || 'W';
  }

  trackByMember(index: number, row: WorkforceRosterRow): string {
    return row.key || row.member_id || row.invite_id || String(index);
  }

  trackByScanRequest(index: number, row: WorkforceScanRequestRow): string {
    return row.id || String(index);
  }

  private applyNavigationState(): void {
    if (typeof history === 'undefined') {
      return;
    }

    const state = history.state as Record<string, unknown> | null | undefined;
    const departmentId = String(state?.['workforceDepartmentId'] ?? '').trim();
    if (departmentId) {
      this.filters.department = departmentId;
    }
  }

  requestStatusLabel(status: string): string {
    const normalized = this.normalizeStatus(status);
    if (normalized === 'completed') return 'Completed';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
    if (normalized === 'opened' || normalized === 'open') return 'Open';
    if (normalized === 'sent') return 'Sent';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'expired') return 'Expired';
    return status || 'Pending';
  }

  dateOrDash(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  private loadPage(manualRetry = false): void {
    if (this.blockedByForbidden && !manualRetry) {
      return;
    }
    if (this.requestInFlight) {
      return;
    }

    const context = this.companyContext.snapshot().context;
    const token = this.auth.getStoredAccessToken();
    if (
      !context.authInitialized ||
      !context.workspaceInitialized ||
      !context.isAuthenticated ||
      !token ||
      !context.activeBusinessProfileId
    ) {
      this.viewState = 'loading';
      this.errorMessage = '';
      this.errorDetails = '';
      this.relationWarning = null;

      this.companyContext.ensureLoaded().pipe(take(1)).subscribe({
        next: () => {
          const settled = this.companyContext.snapshot().context;
          const settledToken = this.auth.getStoredAccessToken();
          if (
            settled.authInitialized &&
            settled.workspaceInitialized &&
            settled.isAuthenticated &&
            settledToken &&
            settled.activeBusinessProfileId
          ) {
            queueMicrotask(() => this.loadPage(manualRetry));
            return;
          }

          if (!settledToken || !settled.isAuthenticated) {
            this.viewState = 'error';
            this.errorMessage = 'Please sign in to load workforce data.';
            this.errorDetails = '';
            return;
          }

          this.viewState = 'error';
          this.errorMessage = 'Select an active workspace before opening Workforce.';
          this.errorDetails = '';
        },
        error: (error: unknown) => {
          this.viewState = 'error';
          this.errorMessage = this.resolveSetupError(error);
          this.errorDetails = '';
        }
      });
      return;
    }

    if (context.activeMemberRole === 'manager' && !context.activeDepartmentId) {
      this.pageData = null;
      this.summary = {
        activeMembers: 0,
        scanEligible: 0,
        scanRequested: 0,
        scannedToday: 0,
        missingScans: 0,
        pendingInvites: 0,
        ownerCount: 0,
        hrCount: 0,
        managerCount: 0,
        employeeCount: 0,
        needsReviewCount: 0
      };
      this.viewState = 'empty';
      this.errorMessage = '';
      this.errorDetails = '';
      this.relationWarning = null;
      return;
    }

    this.requestInFlight = true;
    this.viewState = 'loading';
    this.errorMessage = '';
    this.errorDetails = '';
    this.relationWarning = null;

    this.operationsAdmin.getWorkforceRosterData().pipe(
      finalize(() => {
        this.requestInFlight = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (pageData) => {
        this.pageData = pageData;
        this.summary = pageData.summary;
        this.relationWarning = pageData.relationWarning;

        if (pageData.relationWarning === 'Workforce data access is not configured for this role.') {
          this.blockedByForbidden = true;
          this.viewState = 'error';
          this.errorMessage = pageData.relationWarning;
          this.errorDetails = 'Ask an administrator to grant read access for workforce collections.';
          return;
        }

        const hasRows = pageData.rows.length > 0;
        this.viewState = hasRows ? 'ready' : 'empty';
      },
      error: (error) => {
        this.pageData = null;
        this.summary = {
          activeMembers: 0,
          scanEligible: 0,
          scanRequested: 0,
          scannedToday: 0,
          missingScans: 0,
          pendingInvites: 0,
          ownerCount: 0,
          hrCount: 0,
          managerCount: 0,
          employeeCount: 0,
          needsReviewCount: 0
        };
        this.viewState = 'error';
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status === 403) {
          this.blockedByForbidden = true;
          this.errorMessage = 'Workforce data access is not configured for this role.';
          this.errorDetails = 'Directus returned 403 FORBIDDEN for workforce collections.';
          return;
        }
        const normalized = this.toFriendlyError(error, 'Failed to load workforce data.');
        if (normalized === 'AUTH_REQUIRED' || normalized === 'AUTH_TOKEN_MISSING') {
          this.errorMessage = 'Your session has expired. Please sign in again.';
          this.errorDetails = '';
          void this.router.navigateByUrl('/?auth=login&reason=session');
          return;
        }
        if (normalized === 'WORKSPACE_CONTEXT_MISSING') {
          this.errorMessage = 'Select an active workspace before opening Workforce.';
          this.errorDetails = '';
          void this.router.navigateByUrl('/app/workspace-access');
          return;
        }
        this.errorMessage = normalized;
        this.errorDetails = this.extractErrorDetails(error);
      }
    });
  }

  private resolveSetupError(error: unknown): string {
    const normalized = this.toFriendlyError(error, 'Workforce setup is not ready.');
    if (
      normalized === 'AUTH_REQUIRED' ||
      normalized === 'AUTH_TOKEN_MISSING' ||
      normalized.toLowerCase().includes('token')
    ) {
      return 'Please sign in to load workforce data.';
    }
    return normalized;
  }

  private matchesStatusFilter(row: WorkforceRosterRow, filter: string): boolean {
    if (!filter || filter === 'all') {
      return true;
    }

    if (filter === 'active_member') {
      return row.type === 'member' && this.normalizeStatus(row.status) === 'active';
    }

    if (filter === 'pending_invite') {
      return row.type === 'invite' && ['pending', 'sent'].includes(this.normalizeStatus(row.status)) && !this.isInviteExpired(row);
    }

    return false;
  }

  private matchesScanFilter(row: WorkforceRosterRow, filter: string): boolean {
    if (!filter || filter === 'all') {
      return true;
    }

    if (row.type === 'invite') {
      return true;
    }
    if (filter === 'eligible') {
      return this.isScanEligible(row);
    }
    return row.scan_status === (filter as WorkforceScanStatus);
  }

  private defaultInviteForm(): InviteForm {
    return {
      email: '',
      role: 'employee',
      department: ''
    };
  }

  private pushFeedback(type: FeedbackType, text: string): void {
    this.feedback = { type, text };
  }

  private normalizeStatus(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private isClosedRequestStatus(status: string): boolean {
    const normalized = this.normalizeStatus(status);
    return normalized === 'completed' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'expired';
  }

  private normalizeRoleForUi(value: string | null | undefined): string {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'manger') {
      return 'manager';
    }
    return normalized;
  }

  private isInviteExpired(row: WorkforceRosterRow): boolean {
    const explicitStatus = this.normalizeStatus(row.status);
    if (explicitStatus === 'expired') {
      return true;
    }

    if (!row.expires_at) {
      return false;
    }

    const expiresTs = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresTs)) {
      return false;
    }

    return expiresTs < Date.now();
  }

  private isSameDay(left: Date, right: Date): boolean {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  private formatShortDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  private toNullable(value: string | null | undefined): string | null {
    return value && value.trim() ? value.trim() : null;
  }

  private toFriendlyError(error: unknown, fallback: string): string {
    const anyError = error as {
      error?: {
        errors?: Array<{ extensions?: { reason?: string }; message?: string }>;
        message?: string;
      };
      message?: string;
    };

    const backendMessage =
      anyError?.error?.errors?.[0]?.extensions?.reason ||
      anyError?.error?.errors?.[0]?.message ||
      anyError?.error?.message;

    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage.trim();
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return fallback;
  }

  private extractErrorDetails(error: unknown): string {
    const anyError = error as {
      status?: number;
      error?: {
        errors?: Array<{ message?: string; extensions?: { reason?: string; code?: string } }>;
        message?: string;
      };
      message?: string;
    };

    const status = typeof anyError?.status === 'number' ? anyError.status : null;
    const reason =
      anyError?.error?.errors?.[0]?.extensions?.reason ||
      anyError?.error?.errors?.[0]?.message ||
      anyError?.error?.message ||
      anyError?.message ||
      null;

    if (!reason && status === null) {
      return '';
    }

    const statusPart = status !== null ? `HTTP ${status}` : '';
    const reasonPart = reason ? String(reason).trim() : '';
    return [statusPart, reasonPart].filter(Boolean).join(' - ');
  }

}
