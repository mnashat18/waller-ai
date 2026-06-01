import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { finalize, timeout } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  OperationsAdminService,
  type CompanyDepartmentRecord,
  type CompanyMemberRecord,
  type CompanyPageData
} from '../../services/operations-admin.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';

type CompanyViewState = 'loading' | 'ready' | 'permission_denied' | 'error';
type CompanyTab = 'overview' | 'departments' | 'access' | 'settings';

type FeedbackMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

type DepartmentForm = {
  name: string;
  managerMemberId: string;
  isActive: boolean;
};

type RoleSummary = {
  totalActiveMembers: number;
  owners: number;
  hr: number;
  managers: number;
  employees: number;
  inactiveMembers: number;
  unassignedMembers: number;
  membersWithDepartments: number;
  membersWithShiftTemplate: number;
};

type SetupHealthItem = {
  key: string;
  label: string;
  completed: boolean;
};

type ShiftTemplateRow = {
  id: string;
  name: string;
  assignedMembers: number;
  isActive: boolean | null;
  dateCreated: string | null;
  dateUpdated: string | null;
};

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CardSkeletonLoaderComponent,
    ErrorStateComponent
  ],
  templateUrl: './company.html',
  styleUrls: ['./company.css']
})
export class CompanyPageComponent implements OnInit {
  viewState: CompanyViewState = 'loading';
  activeTab: CompanyTab = 'overview';
  loading = true;
  savingCompany = false;
  savingDepartment = false;
  errorMessage = '';
  feedback: FeedbackMessage | null = null;
  pageData: CompanyPageData | null = null;

  companyNameDraft = '';
  private companyNameInitial = '';

  departmentSearch = '';
  dangerZoneExpanded = false;

  showCreateDepartmentModal = false;
  showEditDepartmentModal = false;
  showDeactivateConfirmModal = false;
  selectedDepartment: CompanyDepartmentRecord | null = null;
  pendingDeactivateDepartment: CompanyDepartmentRecord | null = null;
  pendingEditNeedsDeactivateConfirm = false;

  departmentForm: DepartmentForm = this.defaultDepartmentForm();

  private loadRunId = 0;

  constructor(
    private operationsAdmin: OperationsAdminService,
    private companyContext: CompanyContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadPage();
  }

  setTab(tab: CompanyTab): void {
    this.activeTab = tab;
  }

  get profile(): CompanyPageData['profile'] {
    return this.pageData?.profile ?? null;
  }

  get currentRole(): string {
    return this.normalizeText(this.pageData?.activeRole ?? this.companyContext.snapshot().context.activeMemberRole);
  }

  get canEditCompanyProfile(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get canManageDepartments(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }

  get hasPendingCompanyChanges(): boolean {
    if (!this.canEditCompanyProfile || !this.profile) {
      return false;
    }
    return this.companyNameDraft.trim() !== this.companyNameInitial.trim();
  }

  get departments(): CompanyDepartmentRecord[] {
    return this.pageData?.departments ?? [];
  }

  get filteredDepartments(): CompanyDepartmentRecord[] {
    const keyword = this.normalizeText(this.departmentSearch);
    if (!keyword) {
      return this.departments;
    }

    return this.departments.filter((department) => {
      const manager = this.normalizeText(this.managerLabel(department));
      return this.normalizeText(department.name).includes(keyword) || manager.includes(keyword);
    });
  }

  get members(): CompanyMemberRecord[] {
    return this.pageData?.members ?? [];
  }

  get memberById(): Map<string, CompanyMemberRecord> {
    const map = new Map<string, CompanyMemberRecord>();
    for (const member of this.members) {
      if (member.id) {
        map.set(member.id, member);
      }
    }
    return map;
  }

  get managerOptions(): Array<{ id: string; label: string }> {
    const seen = new Set<string>();
    const rows: Array<{ id: string; label: string }> = [];

    for (const member of this.members) {
      const role = this.normalizeText(member.member_role);
      const status = this.normalizeText(member.status);
      if (!member.id || seen.has(member.id)) {
        continue;
      }
      if (!['owner', 'hr', 'manager', 'manger'].includes(role) || status !== 'active') {
        continue;
      }

      seen.add(member.id);
      const personLabel = member.user_name || member.user_email || 'Member';
      rows.push({
        id: member.id,
        label: `${personLabel} - ${this.roleDisplayLabel(role)}`
      });
    }

    return rows.sort((left, right) => left.label.localeCompare(right.label));
  }

  get canCreateDepartmentSubmit(): boolean {
    return !this.savingDepartment && Boolean(this.departmentForm.name.trim());
  }

  get roleSummary(): RoleSummary {
    const members = this.members;
    const activeMembers = members.filter((member) => this.normalizeText(member.status) === 'active');

    return {
      totalActiveMembers: activeMembers.length,
      owners: activeMembers.filter((member) => this.normalizeText(member.member_role) === 'owner').length,
      hr: activeMembers.filter((member) => this.normalizeText(member.member_role) === 'hr').length,
      managers: activeMembers.filter((member) => {
        const role = this.normalizeText(member.member_role);
        return role === 'manager' || role === 'manger';
      }).length,
      employees: activeMembers.filter((member) => this.normalizeText(member.member_role) === 'employee').length,
      inactiveMembers: members.filter(
        (member) => this.normalizeText(member.status) !== 'active' || Boolean(member.deactivated_at)
      ).length,
      unassignedMembers: activeMembers.filter((member) => !member.department_id).length,
      membersWithDepartments: activeMembers.filter((member) => Boolean(member.department_id)).length,
      membersWithShiftTemplate: activeMembers.filter((member) => Boolean(member.shift_template_id)).length
    };
  }

  get activeDepartmentsCount(): number {
    return this.departments.filter((department) => department.is_active).length;
  }

  get pendingInvitesCount(): number {
    return (this.pageData?.invites ?? []).filter((invite) => {
      const status = this.normalizeText(invite.status);
      return (status === 'pending' || status === 'sent') && !invite.claimed_at;
    }).length;
  }

  get setupNeedsAssignmentAttention(): boolean {
    return this.roleSummary.unassignedMembers > 0;
  }

  get latestInvites(): CompanyPageData['invites'] {
    return (this.pageData?.invites ?? []).slice(0, 8);
  }

  get setupHealth(): SetupHealthItem[] {
    const ownerCount = this.members.filter(
      (member) => this.normalizeText(member.status) === 'active' && this.normalizeText(member.member_role) === 'owner'
    ).length;

    return [
      { key: 'profile', label: 'Active workspace profile', completed: Boolean(this.profile?.id) },
      {
        key: 'membership',
        label: 'Active membership',
        completed: Boolean(this.companyContext.getActiveMembership()?.id)
      },
      { key: 'owner', label: 'Owner exists', completed: ownerCount > 0 },
      { key: 'department', label: 'Department exists', completed: this.departments.length > 0 },
      {
        key: 'assignment',
        label: 'Members assigned to departments',
        completed: this.roleSummary.unassignedMembers === 0
      }
    ];
  }

  get partialWarnings(): string[] {
    const warnings: string[] = [];
    if (this.pageData?.departmentsIssue?.message) warnings.push(this.pageData.departmentsIssue.message);
    if (this.pageData?.membersIssue?.message) warnings.push(this.pageData.membersIssue.message);
    if (this.pageData?.invitesIssue?.message) warnings.push(this.pageData.invitesIssue.message);
    if (this.pageData?.shiftTemplatesIssue?.message) warnings.push(this.pageData.shiftTemplatesIssue.message);
    return warnings;
  }

  get hasInviteData(): boolean {
    return !this.pageData?.invitesIssue;
  }

  get shiftTemplateRows(): ShiftTemplateRow[] {
    const assignedCounts = new Map<string, number>();
    for (const member of this.members) {
      if (!member.shift_template_id) {
        continue;
      }
      assignedCounts.set(
        member.shift_template_id,
        (assignedCounts.get(member.shift_template_id) ?? 0) + 1
      );
    }

    return (this.pageData?.shiftTemplates ?? []).map((template, index) => ({
      id: template.id,
      name: this.pickString(template.name) ?? `Template ${index + 1}`,
      assignedMembers: assignedCounts.get(template.id) ?? 0,
      isActive: template.is_active,
      dateCreated: template.date_created,
      dateUpdated: template.date_updated
    }));
  }

  get employeesWebPolicySummary(): string {
    return 'Employees are mobile-first. The web dashboard is intended for owners, HR, and managers.';
  }

  get workspaceStatusLabel(): string {
    return this.profile?.is_active ? 'Active' : 'Inactive';
  }

  get roleChipLabel(): string {
    if (this.currentRole === 'owner') return 'Owner';
    if (this.currentRole === 'hr') return 'HR';
    if (this.currentRole === 'manager') return 'Manager';
    if (this.currentRole === 'employee') return 'Employee';
    return 'Role unavailable';
  }

  refresh(): void {
    void this.loadPage();
  }

  saveCompanyProfile(): void {
    const profile = this.profile;
    if (!profile?.id || !this.canEditCompanyProfile || !this.hasPendingCompanyChanges || this.savingCompany) {
      return;
    }

    this.savingCompany = true;
    this.feedback = null;

    this.operationsAdmin
      .updateCompanyProfile(profile.id, { company_name: this.companyNameDraft.trim() })
      .pipe(finalize(() => {
        this.savingCompany = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.feedback = { type: 'success', text: 'Company profile updated successfully.' };
          void this.loadPage(false);
        },
        error: (error: unknown) => {
          this.feedback = {
            type: 'error',
            text: this.isPermissionError(error)
              ? 'You do not have permission to update the company profile.'
              : this.toErrorMessage(error, 'Failed to update company profile.')
          };
        }
      });
  }

  openCreateDepartmentModal(): void {
    if (!this.canManageDepartments) {
      return;
    }
    this.departmentForm = this.defaultDepartmentForm();
    this.showCreateDepartmentModal = true;
  }

  openEditDepartmentModal(department: CompanyDepartmentRecord): void {
    if (!this.canManageDepartments) {
      return;
    }
    this.selectedDepartment = department;
    this.departmentForm = {
      name: department.name,
      managerMemberId: department.manager_member_id ?? '',
      isActive: department.is_active
    };
    this.showEditDepartmentModal = true;
  }

  closeDepartmentModals(): void {
    if (this.savingDepartment) {
      return;
    }
    this.showCreateDepartmentModal = false;
    this.showEditDepartmentModal = false;
    this.selectedDepartment = null;
    this.pendingEditNeedsDeactivateConfirm = false;
  }

  createDepartment(): void {
    if (!this.canManageDepartments || this.savingDepartment) {
      return;
    }

    const name = this.departmentForm.name.trim();
    if (!name) {
      this.feedback = { type: 'error', text: 'Department name is required.' };
      return;
    }

    if (this.hasDuplicateDepartmentName(name)) {
      this.feedback = { type: 'error', text: 'Department name already exists in this workspace.' };
      return;
    }

    this.savingDepartment = true;
    this.feedback = null;

    this.operationsAdmin
      .createDepartment({
        name,
        is_active: this.departmentForm.isActive,
        manager_member: this.toDepartmentManagerValue(this.departmentForm.managerMemberId)
      })
      .pipe(finalize(() => {
        this.savingDepartment = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.showCreateDepartmentModal = false;
          this.feedback = { type: 'success', text: 'Department created successfully' };
          void this.loadPage(false);
        },
        error: (error: unknown) => {
          console.error('[Company] create department failed', error);
          this.feedback = {
            type: 'error',
            text: this.isPermissionError(error)
              ? 'You do not have permission to manage departments.'
              : this.toDepartmentErrorMessage(error, 'Failed to create department.')
          };
        }
      });
  }

  saveDepartment(): void {
    if (!this.canManageDepartments || !this.selectedDepartment || this.savingDepartment) {
      return;
    }

    const name = this.departmentForm.name.trim();
    if (!name) {
      this.feedback = { type: 'error', text: 'Department name is required.' };
      return;
    }

    if (this.hasDuplicateDepartmentName(name, this.selectedDepartment.id)) {
      this.feedback = { type: 'error', text: 'Department name already exists in this workspace.' };
      return;
    }

    if (this.selectedDepartment.is_active && !this.departmentForm.isActive) {
      this.pendingEditNeedsDeactivateConfirm = true;
      this.pendingDeactivateDepartment = this.selectedDepartment;
      this.showDeactivateConfirmModal = true;
      return;
    }

    this.submitDepartmentEdit();
  }

  toggleDepartmentActive(department: CompanyDepartmentRecord): void {
    if (!this.canManageDepartments || this.savingDepartment) {
      return;
    }

    if (department.is_active) {
      this.pendingEditNeedsDeactivateConfirm = false;
      this.pendingDeactivateDepartment = department;
      this.showDeactivateConfirmModal = true;
      return;
    }

    this.updateDepartmentState(department.id, {
      is_active: true
    });
  }

  closeDeactivateModal(): void {
    if (this.savingDepartment) {
      return;
    }
    this.showDeactivateConfirmModal = false;
    this.pendingDeactivateDepartment = null;
    this.pendingEditNeedsDeactivateConfirm = false;
  }

  confirmDeactivateDepartment(): void {
    const department = this.pendingDeactivateDepartment;
    if (!department || this.savingDepartment) {
      return;
    }

    this.showDeactivateConfirmModal = false;

    if (this.pendingEditNeedsDeactivateConfirm && this.selectedDepartment?.id === department.id) {
      this.submitDepartmentEdit();
      return;
    }

    this.updateDepartmentState(department.id, {
      is_active: false
    });
  }

  toggleDangerZone(): void {
    this.dangerZoneExpanded = !this.dangerZoneExpanded;
  }

  viewWorkforce(departmentId: string | null = null): void {
    void this.router.navigate(['/app/workforce'], {
      queryParams: departmentId ? { department: departmentId } : undefined
    });
  }

  openDepartmentsTab(): void {
    this.activeTab = 'departments';
  }

  assignOrChangeManager(department: CompanyDepartmentRecord): void {
    if (!this.canManageDepartments) {
      this.feedback = { type: 'info', text: 'Only owner and HR can assign or change department manager.' };
      return;
    }
    this.openEditDepartmentModal(department);
    this.feedback = { type: 'info', text: 'Use Edit Department to assign or change manager.' };
  }

  departmentActionDisabledReason(): string {
    return this.canManageDepartments ? '' : 'Only owner and HR can manage departments.';
  }

  departmentActiveMemberCount(departmentId: string | null): number {
    if (!departmentId) {
      return 0;
    }

    return this.members.filter(
      (member) => member.department_id === departmentId && this.normalizeText(member.status) === 'active'
    ).length;
  }

  managerLabel(department: CompanyDepartmentRecord): string {
    const managerId = department.manager_member_id;
    if (!managerId) {
      return 'No manager assigned';
    }

    const manager = this.memberById.get(managerId);
    if (!manager) {
      return 'Assigned';
    }

    return manager.user_name || manager.user_email || 'Assigned';
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return 'Not available';
    }

    const timestamp = this.toTimestamp(value);
    if (!timestamp) {
      return 'Not available';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
  }

  inviteStatusLabel(value: string | null | undefined): string {
    const normalized = this.normalizeText(value);
    if (!normalized) return 'Pending';
    if (normalized === 'sent') return 'Sent';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'accepted' || normalized === 'claimed') return 'Accepted';
    if (normalized === 'expired') return 'Expired';
    return value ?? 'Pending';
  }

  inviteInviterLabel(invite: CompanyPageData['invites'][number]): string {
    const name = this.pickString((invite as Record<string, unknown>)['invited_by_name']);
    const email = this.pickString((invite as Record<string, unknown>)['invited_by_email']);
    if (name) return name;
    if (email) return email;
    return 'System / unavailable';
  }

  trackByDepartment(index: number, row: CompanyDepartmentRecord): string {
    return row.id || String(index);
  }

  trackByInvite(index: number, row: CompanyPageData['invites'][number]): string {
    return row.id || String(index);
  }

  trackByShiftTemplate(index: number, row: ShiftTemplateRow): string {
    return row.id || String(index);
  }

  private async loadPage(showLoadingState = true): Promise<void> {
    const runId = ++this.loadRunId;

    if (showLoadingState) {
      this.viewState = 'loading';
      this.loading = true;
    }

    this.errorMessage = '';

    const safetyTimeout = setTimeout(() => {
      if (runId !== this.loadRunId || this.viewState !== 'loading') {
        return;
      }

      this.viewState = 'error';
      this.errorMessage = 'Company data is taking too long to load. Please refresh.';
      this.loading = false;
      this.cdr.markForCheck();
    }, 20000);

    try {
      const context = await this.companyContext.ensureActiveContext();
      if (runId !== this.loadRunId) {
        return;
      }

      if (!context?.activeMembership?.id || !context?.activeBusinessProfile?.id) {
        void this.router.navigate(['/app/workspace-access']);
        this.viewState = 'permission_denied';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      const role = this.normalizeText(context.activeMemberRole);
      if (role === 'employee') {
        this.viewState = 'permission_denied';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      const pageData = await firstValueFrom(
        this.operationsAdmin.getCompanyPageData().pipe(timeout(20000))
      );

      if (runId !== this.loadRunId) {
        return;
      }

      this.pageData = pageData ?? null;

      if (!this.pageData?.profile) {
        this.viewState = 'error';
        this.errorMessage = 'Company profile data is unavailable for the active workspace.';
      } else {
        this.companyNameDraft = this.pageData.profile.company_name ?? '';
        this.companyNameInitial = this.pageData.profile.company_name ?? '';

        this.viewState = 'ready';
      }
    } catch (error: unknown) {
      if (runId !== this.loadRunId) {
        return;
      }

      console.warn('[Company] load failed', error);
      this.viewState = this.isPermissionError(error) ? 'permission_denied' : 'error';
      this.errorMessage = this.toErrorMessage(error, 'Company page failed to load.');
    } finally {
      clearTimeout(safetyTimeout);
      if (runId !== this.loadRunId) {
        return;
      }

      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private submitDepartmentEdit(): void {
    const selected = this.selectedDepartment;
    if (!selected) {
      return;
    }

    this.pendingEditNeedsDeactivateConfirm = false;
    this.pendingDeactivateDepartment = null;

    this.updateDepartmentState(
      selected.id,
      {
        name: this.departmentForm.name.trim(),
        is_active: this.departmentForm.isActive,
        manager_member: this.toDepartmentManagerValue(this.departmentForm.managerMemberId)
      },
      true
    );
  }

  private updateDepartmentState(
    departmentId: string,
    payload: { name?: string; is_active?: boolean; manager_member?: string | null },
    closeModal = false
  ): void {
    this.savingDepartment = true;
    this.feedback = null;

    this.operationsAdmin
      .updateDepartment(departmentId, payload)
      .pipe(finalize(() => {
        this.savingDepartment = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          if (closeModal) {
            this.showEditDepartmentModal = false;
            this.selectedDepartment = null;
          }

          this.feedback = { type: 'success', text: 'Department updated successfully.' };
          void this.loadPage(false);
        },
        error: (error: unknown) => {
          this.feedback = {
            type: 'error',
            text: this.isPermissionError(error)
              ? 'You do not have permission to manage departments.'
              : this.toDepartmentErrorMessage(error, 'Failed to update department.')
          };
        }
      });
  }

  private hasDuplicateDepartmentName(name: string, excludeDepartmentId: string | null = null): boolean {
    const normalized = this.normalizeText(name);
    return this.departments.some((department) => {
      if (excludeDepartmentId && department.id === excludeDepartmentId) {
        return false;
      }
      return this.normalizeText(department.name) === normalized;
    });
  }

  private defaultDepartmentForm(): DepartmentForm {
    return {
      name: '',
      managerMemberId: '',
      isActive: true
    };
  }

  private toDepartmentManagerValue(value: string | null | undefined): string | null {
    const trimmed = this.pickString(value);
    return trimmed || null;
  }

  private toDepartmentErrorMessage(error: unknown, fallback: string): string {
    const message = this.toErrorMessage(error, fallback);
    const normalized = this.normalizeText(message);
    if (normalized.includes('departments') && normalized.includes('business_profile') && normalized.includes('unique')) {
      return 'Remove unique constraint from departments.business_profile because a company must have many departments.';
    }
    return message;
  }

  private roleDisplayLabel(role: string): string {
    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager' || role === 'manger') return 'Manager';
    return 'Member';
  }

  private isPermissionError(error: unknown): boolean {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) {
        return true;
      }

      const message = [
        error.error?.errors?.[0]?.extensions?.reason,
        error.error?.errors?.[0]?.message,
        error.error?.message,
        error.message
      ]
        .map((part) => this.normalizeText(part))
        .join(' ');

      return (
        message.includes('permission') ||
        message.includes('forbidden') ||
        message.includes('access denied') ||
        message.includes('not allowed')
      );
    }

    const message = this.normalizeText((error as Error | null)?.message);
    return message.includes('permission') || message.includes('forbidden');
  }

  private toErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message =
        error.error?.errors?.[0]?.extensions?.reason ||
        error.error?.errors?.[0]?.message ||
        error.error?.message ||
        error.message;

      const normalized = this.pickString(message);
      if (normalized) {
        return normalized;
      }
    }

    const direct = this.pickString((error as Error | null)?.message);
    if (direct) {
      return direct;
    }

    return fallback;
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeText(value: unknown): string {
    return this.pickString(value)?.toLowerCase() ?? '';
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }
}
