import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  OrganizationApiError,
  OrganizationApiService,
  type OrganizationData,
  type OrganizationDepartment,
  type OrganizationMember,
  type OrganizationPermissions,
  type OrganizationProfile,
  type OrganizationProfileUpdateInput
} from '../../services/organization-api.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

type CompanyViewState = 'loading' | 'ready' | 'no_context' | 'permission_denied' | 'error';
type CompanyTab = 'overview' | 'departments';
type FeedbackMessage = { type: 'success' | 'error' | 'info'; text: string };
type DepartmentFormMode = 'create' | 'edit' | null;

type ProfileDraft = {
  company_name: string;
  contact_name: string;
  phone: string;
  industry: string;
  team_size: string;
  country: string;
  city: string;
  website: string;
  timezone: string;
  default_language: string;
};

type DepartmentDraft = {
  name: string;
  manager_member_id: string;
};

const EMPTY_PERMISSIONS: OrganizationPermissions = {
  canEditProfile: false,
  canManageDepartments: false,
  canViewMembers: false,
  canViewInvites: false,
  canUseComingSoonControls: false
};

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CardSkeletonLoaderComponent, ErrorStateComponent, PageHeaderComponent],
  templateUrl: './company.html',
  styleUrls: ['./company.css']
})
export class CompanyPageComponent implements OnInit {
  readonly unsupportedWorkflowMessage = 'Coming next: controlled access workflow.';

  viewState: CompanyViewState = 'loading';
  activeTab: CompanyTab = 'overview';
  loading = true;
  savingProfile = false;
  savingDepartment = false;
  departmentActionBusy = false;
  errorMessage = '';
  feedback: FeedbackMessage | null = null;
  pageData: OrganizationData | null = null;

  profileDraft: ProfileDraft = this.createEmptyProfileDraft();
  private profileBaseline = this.profileSignature(this.profileDraft);

  departmentSearch = '';
  departmentFormMode: DepartmentFormMode = null;
  departmentFormDepartmentId: string | null = null;
  private departmentFormBaseline = '';
  departmentForm: DepartmentDraft = { name: '', manager_member_id: '' };
  pendingDeactivateDepartment: OrganizationDepartment | null = null;
  departmentManagerOptions: Array<{ id: string; label: string }> = [];

  private loadRunId = 0;

  constructor(
    private readonly organizationApi: OrganizationApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.applyTabFromQueryParam();
    void this.loadPage();
  }

  private applyTabFromQueryParam(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    const allowedTabs: CompanyTab[] = ['overview', 'departments'];
    if (requestedTab && (allowedTabs as string[]).includes(requestedTab)) {
      this.activeTab = requestedTab as CompanyTab;
    }
  }

  setTab(tab: CompanyTab): void {
    this.activeTab = tab;
  }

  onTabKeydown(event: KeyboardEvent, currentTab: CompanyTab): void {
    const tabs: CompanyTab[] = ['overview', 'departments'];
    const currentIndex = tabs.indexOf(currentTab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    this.setTab(tabs[nextIndex]);
    window.setTimeout(() => document.getElementById(`company-tab-${tabs[nextIndex]}`)?.focus());
  }

  get profile(): OrganizationProfile | null {
    return this.pageData?.profile ?? null;
  }

  get permissions(): OrganizationPermissions {
    return this.pageData?.permissions ?? EMPTY_PERMISSIONS;
  }

  get canEditCompanyProfile(): boolean {
    return this.permissions.canEditProfile;
  }

  get canManageDepartments(): boolean {
    return this.permissions.canManageDepartments;
  }

  get pageDescription(): string {
    return 'Manage the active organization profile and department structure through protected server contracts.';
  }

  get organizationName(): string {
    return this.profile?.company_name || 'Active organization';
  }

  get organizationStatusLabel(): string {
    if (this.profile?.is_active === true) return 'Active';
    if (this.profile?.is_active === false) return 'Inactive';
    return 'Status unavailable';
  }

  get hasProfileChanges(): boolean {
    return this.profileSignature(this.profileDraft) !== this.profileBaseline;
  }

  get departments(): OrganizationDepartment[] {
    return this.pageData?.departments ?? [];
  }

  get filteredDepartments(): OrganizationDepartment[] {
    const keyword = this.normalizeText(this.departmentSearch);
    if (!keyword) return this.departments;

    return this.departments.filter((department) => {
      const manager = this.normalizeText(this.managerLabel(department));
      return this.normalizeText(department.name).includes(keyword) || manager.includes(keyword);
    });
  }

  get members(): OrganizationMember[] {
    return this.pageData?.members ?? [];
  }

  get activeMembers(): OrganizationMember[] {
    return this.members.filter((member) => this.normalizeText(member.status) === 'active');
  }

  get activeDepartmentsCount(): number {
    return this.departments.filter((department) => department.is_active).length;
  }

  get departmentFormTitle(): string {
    if (this.departmentFormMode === 'edit') return 'Edit department';
    return 'Create department';
  }

  get departmentFormActionLabel(): string {
    if (this.departmentFormMode === 'edit') return 'Save department';
    return 'Create department';
  }

  get canSubmitDepartmentForm(): boolean {
    return this.canManageDepartments && !this.savingDepartment && Boolean(this.departmentForm.name.trim());
  }

  get canDeactivateSelectedDepartment(): boolean {
    return this.canManageDepartments && !this.departmentActionBusy && Boolean(this.pendingDeactivateDepartment);
  }

  refresh(): void {
    void this.loadPage();
  }

  viewWorkforce(): void {
    void this.router.navigate(['/app/workforce']);
  }

  saveProfile(): void {
    if (!this.canEditCompanyProfile || this.savingProfile || !this.profile) {
      return;
    }

    const payload = this.buildProfilePayload();
    if (!payload) {
      this.feedback = { type: 'info', text: 'No editable organization fields were changed.' };
      this.cdr.markForCheck();
      return;
    }

    this.savingProfile = true;
    this.feedback = null;
    this.cdr.markForCheck();

    void firstValueFrom(this.organizationApi.updateProfile(payload))
      .then((profile) => {
        if (!this.pageData) return;
        this.pageData = { ...this.pageData, profile };
        this.profileDraft = this.createProfileDraft(profile);
        this.profileBaseline = this.profileSignature(this.profileDraft);
        this.feedback = { type: 'success', text: 'Organization profile saved.' };
      })
      .catch((error: unknown) => {
        this.feedback = { type: 'error', text: this.toUserMessage(error, 'Organization profile could not be saved.') };
      })
      .finally(() => {
        this.savingProfile = false;
        this.cdr.markForCheck();
      });
  }

  openCreateDepartmentForm(): void {
    if (!this.canManageDepartments) {
      this.showUnsupportedWorkflow();
      return;
    }

    this.departmentFormMode = 'create';
    this.departmentFormDepartmentId = null;
    this.departmentForm = { name: '', manager_member_id: '' };
    this.departmentFormBaseline = this.departmentSignature(this.departmentForm);
    this.pendingDeactivateDepartment = null;
    this.feedback = null;
  }

  openEditDepartmentForm(department: OrganizationDepartment): void {
    if (!this.canManageDepartments) {
      this.showUnsupportedWorkflow();
      return;
    }

    this.departmentFormMode = 'edit';
    this.departmentFormDepartmentId = department.id;
    this.departmentForm = {
      name: department.name ?? '',
      manager_member_id: this.departmentManagerMemberId(department.manager_member_id)
    };
    this.departmentFormBaseline = this.departmentSignature(this.departmentForm);
    this.pendingDeactivateDepartment = null;
    this.feedback = null;
  }

  cancelDepartmentForm(): void {
    if (this.savingDepartment) return;
    this.departmentFormMode = null;
    this.departmentFormDepartmentId = null;
    this.departmentForm = { name: '', manager_member_id: '' };
    this.departmentFormBaseline = this.departmentSignature(this.departmentForm);
  }

  saveDepartmentForm(): void {
    if (!this.canSubmitDepartmentForm || !this.departmentFormMode) {
      return;
    }

    const name = this.normalizeText(this.departmentForm.name);
    if (!name) {
      this.feedback = { type: 'error', text: 'Department name is required.' };
      this.cdr.markForCheck();
      return;
    }

    if (this.departmentSignature(this.departmentForm) === this.departmentFormBaseline) {
      this.feedback = { type: 'info', text: 'No department changes were made.' };
      this.cdr.markForCheck();
      return;
    }

    this.savingDepartment = true;
    this.feedback = null;
    this.cdr.markForCheck();

    const mode = this.departmentFormMode;
    const managerMemberId = this.toNullable(this.departmentForm.manager_member_id);
    const request = mode === 'edit' && this.departmentFormDepartmentId
      ? this.organizationApi.updateDepartment(this.departmentFormDepartmentId, { name, manager_member_id: managerMemberId })
      : this.organizationApi.createDepartment({ name, manager_member_id: managerMemberId });

    void firstValueFrom(request)
      .then((department) => {
        this.upsertDepartment(department);
        this.departmentFormMode = null;
        this.departmentFormDepartmentId = null;
        this.departmentForm = { name: '', manager_member_id: '' };
        this.departmentFormBaseline = this.departmentSignature(this.departmentForm);
        this.feedback = {
          type: 'success',
          text: mode === 'edit' ? 'Department saved.' : 'Department created.'
        };
      })
      .catch((error: unknown) => {
        this.feedback = { type: 'error', text: this.toUserMessage(error, 'Department could not be saved.') };
      })
      .finally(() => {
        this.savingDepartment = false;
        this.cdr.markForCheck();
      });
  }

  promptDeactivateDepartment(department: OrganizationDepartment): void {
    if (!this.canManageDepartments) {
      this.showUnsupportedWorkflow();
      return;
    }

    this.pendingDeactivateDepartment = department;
    this.departmentFormMode = null;
    this.departmentFormDepartmentId = null;
    this.feedback = null;
  }

  cancelDeactivateDepartment(): void {
    if (this.departmentActionBusy) return;
    this.pendingDeactivateDepartment = null;
  }

  confirmDeactivateDepartment(): void {
    if (!this.pendingDeactivateDepartment || !this.canDeactivateSelectedDepartment) {
      return;
    }

    const department = this.pendingDeactivateDepartment;
    this.departmentActionBusy = true;
    this.feedback = null;
    this.cdr.markForCheck();

    void firstValueFrom(this.organizationApi.deactivateDepartment(department.id))
      .then((updatedDepartment) => {
        this.upsertDepartment(updatedDepartment);
        this.pendingDeactivateDepartment = null;
        this.feedback = { type: 'success', text: 'Department deactivated.' };
      })
      .catch((error: unknown) => {
        this.feedback = { type: 'error', text: this.toDeactivateDepartmentMessage(error, 'Department could not be deactivated.') };
      })
      .finally(() => {
        this.departmentActionBusy = false;
        this.cdr.markForCheck();
      });
  }

  showUnsupportedWorkflow(): void {
    this.feedback = { type: 'info', text: this.unsupportedWorkflowMessage };
    this.cdr.markForCheck();
  }

  departmentActionDisabledReason(): string {
    return this.canManageDepartments ? '' : 'Only owner and HR can manage departments.';
  }

  departmentActiveMemberCount(departmentId: string | null): number {
    if (!departmentId) return 0;
    return this.activeMembers.filter((member) => member.department_id === departmentId).length;
  }

  managerLabel(department: OrganizationDepartment): string {
    const managerId = department.manager_member_id;
    if (!managerId) return 'Unassigned';

    const manager = this.members.find((member) => member.id === managerId);
    if (!manager) return 'Unassigned';

    return manager.user_name || manager.user_email || 'Unassigned';
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Not available';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return 'Not available';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(timestamp));
  }

  trackByDepartment(index: number, row: OrganizationDepartment): string {
    return row.id || String(index);
  }

  private async loadPage(showLoadingState = true): Promise<void> {
    const runId = ++this.loadRunId;

    if (showLoadingState) {
      this.viewState = 'loading';
      this.loading = true;
    }

    this.errorMessage = '';
    this.feedback = null;

    try {
      const data = await firstValueFrom(this.organizationApi.getOrganization());
      if (runId !== this.loadRunId) return;

      this.pageData = data;
      this.departmentFormMode = null;
      this.departmentFormDepartmentId = null;
      this.departmentForm = { name: '', manager_member_id: '' };
      this.departmentFormBaseline = this.departmentSignature(this.departmentForm);
      this.pendingDeactivateDepartment = null;
      this.rebuildDepartmentManagerOptions();

      if (!data.profile) {
        this.viewState = 'error';
        this.errorMessage = 'Organization profile data is unavailable for the active organization.';
      } else {
        this.profileDraft = this.createProfileDraft(data.profile);
        this.profileBaseline = this.profileSignature(this.profileDraft);
        this.viewState = 'ready';
      }
    } catch (error: unknown) {
      if (runId !== this.loadRunId) return;

      if (error instanceof OrganizationApiError && error.code === 'not_found') {
        this.viewState = 'no_context';
      } else if (error instanceof OrganizationApiError && error.code === 'forbidden') {
        this.viewState = 'permission_denied';
      } else {
        this.viewState = 'error';
        this.errorMessage = this.toUserMessage(error, 'Organization data could not be loaded.');
      }
    } finally {
      if (runId !== this.loadRunId) return;
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private buildProfilePayload(): OrganizationProfileUpdateInput | null {
    if (!this.profile) return null;

    const payload: OrganizationProfileUpdateInput = {};
    const companyName = this.normalizeText(this.profileDraft.company_name);
    if (!companyName) {
      this.feedback = { type: 'error', text: 'Organization name is required.' };
      return null;
    }

    payload.company_name = companyName;

    const contactName = this.normalizeText(this.profileDraft.contact_name);
    if (contactName) payload.contact_name = contactName;

    const phone = this.normalizeText(this.profileDraft.phone);
    if (phone) payload.phone = phone;

    const industry = this.normalizeText(this.profileDraft.industry);
    if (industry) payload.industry = industry;

    const teamSize = this.normalizePositiveInteger(this.profileDraft.team_size);
    if (teamSize !== null) payload.team_size = teamSize;

    const country = this.normalizeText(this.profileDraft.country);
    if (country) payload.country = country;

    const city = this.normalizeText(this.profileDraft.city);
    if (city) payload.city = city;

    const website = this.normalizeText(this.profileDraft.website);
    if (website) payload.website = website;

    const timezone = this.normalizeText(this.profileDraft.timezone);
    if (timezone) payload.timezone = timezone;

    const defaultLanguage = this.normalizeText(this.profileDraft.default_language);
    if (defaultLanguage) payload.default_language = defaultLanguage;

    return payload;
  }

  private createProfileDraft(profile: OrganizationProfile): ProfileDraft {
    return {
      company_name: profile.company_name ?? '',
      contact_name: profile.contact_name ?? '',
      phone: profile.phone ?? '',
      industry: profile.industry ?? '',
      team_size: profile.team_size === null || profile.team_size === undefined ? '' : String(profile.team_size),
      country: profile.country ?? '',
      city: profile.city ?? '',
      website: profile.website ?? '',
      timezone: profile.timezone ?? '',
      default_language: profile.default_language ?? ''
    };
  }

  private profileSignature(form: ProfileDraft): string {
    return [
      form.company_name,
      form.contact_name,
      form.phone,
      form.industry,
      form.team_size,
      form.country,
      form.city,
      form.website,
      form.timezone,
      form.default_language
    ]
      .map((value) => this.normalizeText(value))
      .join('||');
  }

  private departmentSignature(form: DepartmentDraft): string {
    return [this.normalizeText(form.name), this.normalizeText(form.manager_member_id)].join('||');
  }

  private createEmptyProfileDraft(): ProfileDraft {
    return {
      company_name: '',
      contact_name: '',
      phone: '',
      industry: '',
      team_size: '',
      country: '',
      city: '',
      website: '',
      timezone: '',
      default_language: ''
    };
  }

  private upsertDepartment(department: OrganizationDepartment): void {
    if (!this.pageData) return;
    const departments = [...this.pageData.departments];
    const index = departments.findIndex((row) => row.id === department.id);
    if (index >= 0) {
      departments[index] = department;
    } else {
      departments.unshift(department);
    }
    this.pageData = { ...this.pageData, departments };
  }

  private normalizePositiveInteger(value: string): number | null {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizeText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value).trim();
    return '';
  }

  private departmentManagerMemberId(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const id = record['id'];
      if (typeof id === 'string' || typeof id === 'number') {
        return String(id);
      }
    }
    return '';
  }

  private isEligibleDepartmentManager(member: OrganizationMember): boolean {
    const status = this.normalizeText(member.status).toLowerCase();
    const role = this.normalizeText(member.member_role).toLowerCase();
    return status === 'active' && ['owner', 'hr', 'manager'].includes(role) && Boolean(member.user_name || member.user_email);
  }

  private departmentManagerRoleLabel(role: string | null): string {
    const normalized = this.normalizeText(role).toLowerCase();
    if (normalized === 'hr') return 'HR';
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'manager') return 'Manager';
    return 'Member';
  }

  private toNullable(value: string | null | undefined): string | null {
    const normalized = this.normalizeText(value);
    return normalized ? normalized : null;
  }

  private rebuildDepartmentManagerOptions(): void {
    this.departmentManagerOptions = this.members
      .filter((member) => this.isEligibleDepartmentManager(member))
      .map((member) => ({
        id: member.id,
        label: `${member.user_name || member.user_email || 'Member'} — ${this.departmentManagerRoleLabel(member.member_role)}`
      }));
  }

  private toUserMessage(error: unknown, fallback: string): string {
    if (error instanceof OrganizationApiError) {
      if (error.code === 'forbidden') {
        return 'This organization action is not available for your access level.';
      }
      if (error.code === 'unauthorized') {
        return 'Session expired. Please sign in again.';
      }
      return error.userMessage || fallback;
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  private toDeactivateDepartmentMessage(error: unknown, fallback: string): string {
    if (error instanceof OrganizationApiError) {
      if (error.code === 'unauthorized') {
        return 'Session expired. Please sign in again.';
      }
      if (error.code === 'forbidden') {
        return 'This organization action is not available for your access level.';
      }

      const message = this.normalizeText(error.userMessage).toLowerCase();
      if (message.includes('active members')) {
        return 'Deactivate the department after reassigning its active members.';
      }

      return fallback;
    }

    if (error instanceof Error && error.message) {
      const message = error.message.toLowerCase();
      if (message.includes('active members')) {
        return 'Deactivate the department after reassigning its active members.';
      }
      if (message.includes('unauthorized') || message.includes('session expired')) {
        return 'Session expired. Please sign in again.';
      }
      if (message.includes('forbidden') || message.includes('permission')) {
        return 'This organization action is not available for your access level.';
      }
    }

    return fallback;
  }
}
