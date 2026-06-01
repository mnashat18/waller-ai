import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { type ActiveMemberRole } from '../../ia/wellar-ia';
import {
  OperationsAdminService,
  type CreateInviteInput,
  type MemberDirectoryRow,
  type MemberUpdateInput,
  type MembersPageData
} from '../../services/operations-admin.service';
import { CompanyContextChipComponent } from '../../shared/ui/company-context-chip/company-context-chip.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { RiskBadgeComponent } from '../../shared/ui/risk-badge/risk-badge.component';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';

type MemberFilters = {
  search: string;
  role: string;
  status: string;
  department: string;
  readiness: string;
};

type InviteForm = {
  email: string;
  member_role: string;
  department: string;
};

type EditMemberForm = {
  member_role: string;
  status: string;
  department: string;
  job_title: string;
  employee_code: string;
};

type InviteMode = 'invite' | 'add';

@Component({
  selector: 'app-members-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    DashboardSectionComponent,
    KpiCardComponent,
    TableShellComponent,
    CompanyContextChipComponent,
    RoleBadgeComponent,
    StatusBadgeComponent,
    RiskBadgeComponent,
  ],
  templateUrl: './members.html',
  styleUrls: ['./members.css']
})
export class MembersPageComponent implements OnInit {
  loading = true;
  savingMember = false;
  savingInvite = false;
  errorMessage = '';
  feedbackMessage = '';
  pageData: MembersPageData | null = null;
  selectedMember: MemberDirectoryRow | null = null;
  editingMember: MemberDirectoryRow | null = null;
  showInviteModal = false;
  showEditModal = false;
  showMobileFilters = false;
  inviteMode: InviteMode = 'invite';
  private requestedMemberId = '';
  private requestedDepartmentId = '';

  filters: MemberFilters = {
    search: '',
    role: '',
    status: '',
    department: '',
    readiness: ''
  };

  inviteForm: InviteForm = this.defaultInviteForm();
  editForm: EditMemberForm = this.defaultEditForm();

  readonly roleFilterOptions = ['owner', 'hr', 'manager', 'employee'];
  readonly statusFilterOptions = ['active', 'invited', 'suspended', 'inactive'];
  readonly readinessFilterOptions = ['stable', 'low focus', 'elevated fatigue', 'high risk', 'no result', 'no recent scan'];

  constructor(
    private operationsAdmin: OperationsAdminService,
    private companyContext: CompanyContextService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.requestedMemberId = params.get('member') ?? '';
      this.requestedDepartmentId = params.get('department') ?? '';
      this.applyScopedDefaults();
      this.applyRequestedSelection();
    });

    this.loadPage();
  }

  get currentRole(): ActiveMemberRole | null {
    return this.companyContext.snapshot().context.activeMemberRole;
  }

  get currentCompanyName(): string {
    return this.companyContext.snapshot().context.activeBusinessProfileName || 'Active company';
  }

  get currentDepartmentName(): string {
    return this.companyContext.snapshot().context.activeDepartmentName || 'Company-wide';
  }

  get scopeLabel(): string {
    return this.currentRole === 'manager' ? this.currentDepartmentName : 'Company-wide';
  }

  get canManageRoster(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canSendRequest(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr' || this.currentRole === 'manager';
  }

  get canExportRoster(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canViewRoster(): boolean {
    return Boolean(this.companyContext.snapshot().context.activeBusinessProfileId) &&
      (this.currentRole === 'owner' || this.currentRole === 'hr' || this.currentRole === 'manager');
  }

  get filteredRows(): MemberDirectoryRow[] {
    const rows = this.pageData?.rows ?? [];
    const search = this.filters.search.trim().toLowerCase();
    const roleFilter = this.normalizeRoleForUi(this.filters.role);

    return rows.filter((row) => {
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        (row.email ?? '').toLowerCase().includes(search) ||
        (row.employee_code ?? '').toLowerCase().includes(search) ||
        (row.job_title ?? '').toLowerCase().includes(search);

      const matchesRole = !roleFilter || this.normalizeRoleForUi(row.member_role) === roleFilter;
      const matchesStatus = !this.filters.status || this.normalizeValue(row.status) === this.filters.status;
      const matchesDepartment = !this.filters.department || row.department_id === this.filters.department;
      const matchesReadiness = !this.filters.readiness || this.readinessFilterValue(row) === this.filters.readiness;

      return matchesSearch && matchesRole && matchesStatus && matchesDepartment && matchesReadiness;
    });
  }

  refresh(): void {
    this.loadPage();
  }

  clearFilters(): void {
    this.filters = {
      search: '',
      role: '',
      status: '',
      department: this.currentRole === 'manager' ? this.companyContext.snapshot().context.activeDepartmentId ?? '' : '',
      readiness: ''
    };
    this.showMobileFilters = false;
  }

  openInviteModal(mode: InviteMode = 'invite'): void {
    this.inviteMode = mode;
    this.inviteForm = this.defaultInviteForm();
    this.showInviteModal = true;
  }

  closeInviteModal(): void {
    this.showInviteModal = false;
  }

  createInvite(): void {
    if (!this.inviteForm.email.trim()) {
      this.feedbackMessage = 'Enter an email before sending an invite.';
      return;
    }

    if (!this.canManageRoster) {
      this.feedbackMessage = 'You do not have permission to send invites.';
      return;
    }

    this.savingInvite = true;
    this.feedbackMessage = '';

    const payload: CreateInviteInput = {
      email: this.toNullable(this.inviteForm.email),
      member_role: this.toBackendRole(this.inviteForm.member_role || 'employee'),
      department:
        this.currentRole === 'manager'
          ? this.companyContext.snapshot().context.activeDepartmentId ?? null
          : this.toNullable(this.inviteForm.department),
      invite_type: 'member_onboarding'
    };

    this.operationsAdmin.createInvite(payload).subscribe({
      next: () => {
        this.savingInvite = false;
        this.showInviteModal = false;
        this.feedbackMessage = `Invite sent to ${this.inviteForm.email.trim()}`;
        this.loadPage();
      },
      error: (error) => {
        this.savingInvite = false;
        console.error('[members] invite create failed', error);
        this.feedbackMessage = this.toFriendlyError(error, 'Failed to send invite.');
      }
    });
  }

  openEditModal(row: MemberDirectoryRow): void {
    if (!this.canManageRoster) {
      return;
    }

    this.editingMember = row;
    this.editForm = {
      member_role: this.normalizeRoleForUi(row.member_role ?? 'employee') || 'employee',
      status: row.status ?? 'active',
      department: row.department_id ?? '',
      job_title: row.job_title ?? '',
      employee_code: row.employee_code ?? ''
    };
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingMember = null;
  }

  saveMember(): void {
    if (!this.editingMember?.id || !this.canManageRoster) {
      return;
    }

    this.savingMember = true;
    this.feedbackMessage = '';

    const payload: MemberUpdateInput = {
      member_role: this.toBackendRole(this.toNullable(this.editForm.member_role) ?? 'employee'),
      status: this.toNullable(this.editForm.status),
      department: this.toNullable(this.editForm.department),
      job_title: this.toNullable(this.editForm.job_title),
      employee_code: this.toNullable(this.editForm.employee_code)
    };

    this.operationsAdmin.updateMember(this.editingMember.id, payload).subscribe({
      next: () => {
        this.savingMember = false;
        this.showEditModal = false;
        this.feedbackMessage = 'Member record updated.';
        this.loadPage();
      },
      error: (error) => {
        this.savingMember = false;
        console.error('[members] update member failed', error);
        this.feedbackMessage = this.toFriendlyError(error, 'Failed to update member.');
      }
    });
  }

  viewMemberDetails(row: MemberDirectoryRow): void {
    this.selectedMember = row;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { member: row.id },
      queryParamsHandling: 'merge'
    });
  }

  closeMemberDrawer(): void {
    this.selectedMember = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { member: null },
      queryParamsHandling: 'merge'
    });
  }

  sendScanRequest(row?: MemberDirectoryRow): void {
    const member = row ?? this.selectedMember;
    const memberId = member?.user_id ?? member?.id;

    if (memberId) {
      this.router.navigate(['/app/scan-requests'], {
        queryParams: { member: memberId }
      });
      return;
    }

    this.router.navigate(['/app/scan-requests']);
  }

  resendInvite(row: MemberDirectoryRow): void {
    if (!this.canManageRoster || !row.pending_invite_id) {
      return;
    }

    this.feedbackMessage = '';
    this.operationsAdmin.resendInvite(row.pending_invite_id).subscribe({
      next: () => {
        this.feedbackMessage = 'Invite resent.';
        this.loadPage();
      },
      error: (error) => {
        console.error('[members] resend invite failed', error);
        this.feedbackMessage = this.toFriendlyError(error, 'Failed to resend invite.');
      }
    });
  }

  deactivateMember(row: MemberDirectoryRow): void {
    if (!this.canManageRoster || !row.id || typeof window === 'undefined') {
      return;
    }

    const nextStatus = this.normalizeValue(row.status) === 'invited' ? 'suspended' : 'inactive';
    if (!window.confirm(`Deactivate ${row.name}?`)) {
      return;
    }

    this.feedbackMessage = '';
    this.operationsAdmin.updateMember(row.id, { status: nextStatus }).subscribe({
      next: () => {
        this.feedbackMessage = 'Member deactivated.';
        this.loadPage();
      },
      error: (error) => {
        console.error('[members] deactivate failed', error);
        this.feedbackMessage = this.toFriendlyError(error, 'Failed to deactivate member.');
      }
    });
  }

  exportRoster(): void {
    if (!this.canExportRoster || typeof window === 'undefined') {
      return;
    }

    const rows = this.filteredRows;
    const headers = ['Member', 'Email', 'Role', 'Department', 'Status', 'Scan Eligible', 'Last Scan', 'Last Readiness', 'Employee Code', 'Job Title'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.name,
          row.email ?? '',
          this.roleLabel(row.member_role),
          row.department_name ?? 'Unassigned',
          this.statusLabel(row.status),
          row.scan_eligible ? 'Yes' : 'No',
          this.lastScanLabel(row),
          this.readinessLabel(row),
          row.employee_code ?? '',
          row.job_title ?? ''
        ]
          .map((value) => this.escapeCsv(value))
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wellar-workforce-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  openFilters(): void {
    this.showMobileFilters = true;
  }

  closeFilters(): void {
    this.showMobileFilters = false;
  }

  trackByMember(index: number, row: MemberDirectoryRow): string {
    return row.id || String(index);
  }

  memberInitials(row: MemberDirectoryRow): string {
    const parts = row.name.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part.charAt(0));
    return initials.join('').toUpperCase() || 'M';
  }

  lastScanLabel(row: MemberDirectoryRow): string {
    const timestamp = row.last_scan_at;
    if (!timestamp || this.isNoRecentScan(row)) {
      return 'No recent scan';
    }

    const date = new Date(timestamp);
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

  readinessLabel(row: MemberDirectoryRow): string {
    if (this.isNoRecentScan(row)) {
      return 'No recent scan';
    }

    const normalized = this.normalizeValue(row.last_risk_level);
    if (normalized === 'stable') return 'Stable';
    if (normalized === 'low_focus' || normalized === 'low focus') return 'Low Focus';
    if (normalized === 'elevated_fatigue' || normalized === 'elevated fatigue' || normalized === 'fatigue') {
      return 'Elevated Fatigue';
    }
    if (normalized === 'high_risk' || normalized === 'high risk') return 'High Risk';
    return 'No result';
  }

  readinessFilterValue(row: MemberDirectoryRow): string {
    return this.readinessLabel(row).toLowerCase();
  }

  statusLabel(value: string | null): string {
    const normalized = this.normalizeValue(value);
    if (normalized === 'active') return 'Active';
    if (normalized === 'invited') return 'Invited';
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'inactive') return 'Inactive';
    return value?.trim() || 'Unknown';
  }

  roleLabel(value: string | null): string {
    const normalized = this.normalizeRoleForUi(value);
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr' || normalized === 'admin') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee' || normalized === 'member') return 'Employee';
    return value?.trim() || 'Unknown';
  }

  isInviteAvailable(row: MemberDirectoryRow): boolean {
    return Boolean(row.pending_invite_id) || this.normalizeValue(row.status) === 'invited';
  }

  canRowBeEdited(): boolean {
    return this.canManageRoster;
  }

  hasFilteredRows(): boolean {
    return this.filteredRows.length > 0;
  }

  private loadPage(): void {
    const context = this.companyContext.snapshot().context;

    if (!context.activeBusinessProfileId) {
      void this.router.navigate(['/app/workspace-access']);
      return;
    }

    if (this.currentRole === 'manager' && !context.activeDepartmentId) {
      void this.router.navigate(['/app/dashboard'], { queryParams: { reason: 'restricted' } });
      return;
    }

    if (!this.currentRole || this.currentRole === 'employee') {
      void this.router.navigate(['/app/my-readiness']);
      return;
    }

    if (!this.canViewRoster) {
      this.loading = false;
      this.pageData = null;
      this.errorMessage = 'You do not have access to the workforce roster.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.operationsAdmin
      .getMembersPageData()
      .pipe(
        finalize(() => {
          queueMicrotask(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (pageData) => {
          this.pageData = pageData;
          this.applyScopedDefaults();
          this.applyRequestedSelection();
        },
        error: (error) => {
          this.pageData = null;
          console.error('[members] page load failed', error);
          this.errorMessage = 'We could not load the workforce roster.';
        }
      });
  }

  private applyScopedDefaults(): void {
    if (this.requestedDepartmentId) {
      this.filters.department = this.requestedDepartmentId;
      return;
    }

    if (this.currentRole === 'manager') {
      this.filters.department = this.companyContext.snapshot().context.activeDepartmentId ?? '';
    }
  }

  private applyRequestedSelection(): void {
    if (!this.pageData) {
      return;
    }

    if (this.requestedMemberId) {
      this.selectedMember = this.pageData.rows.find((row) => row.id === this.requestedMemberId) ?? null;
      if (!this.selectedMember) {
        this.selectedMember = this.pageData.rows.find((row) => row.user_id === this.requestedMemberId) ?? null;
      }
    }
  }

  private defaultInviteForm(): InviteForm {
    return {
      email: '',
      member_role: 'employee',
      department: this.resolveInviteDepartmentId()
    };
  }

  private defaultEditForm(): EditMemberForm {
    return {
      member_role: 'employee',
      status: 'active',
      department: '',
      job_title: '',
      employee_code: ''
    };
  }

  private resolveInviteDepartmentId(): string {
    if (this.currentRole === 'manager') {
      return this.companyContext.snapshot().context.activeDepartmentId ?? '';
    }
    return '';
  }

  private normalizeValue(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private normalizeRoleForUi(value: string | null | undefined): string {
    const normalized = this.normalizeValue(value);
    if (normalized === 'manger') {
      return 'manager';
    }
    return normalized;
  }

  private toBackendRole(value: string): string {
    return this.normalizeRoleForUi(value);
  }

  private isNoRecentScan(row: MemberDirectoryRow): boolean {
    if (!row.last_scan_at) {
      return true;
    }

    const scannedAt = new Date(row.last_scan_at).getTime();
    if (!Number.isFinite(scannedAt)) {
      return true;
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - scannedAt > sevenDaysMs;
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

  private escapeCsv(value: string): string {
    const normalized = value ?? '';
    if (/[",\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
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
}
