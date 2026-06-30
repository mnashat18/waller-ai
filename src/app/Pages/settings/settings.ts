import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

import { CompanyContextService, type ActiveMembershipContext } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import {
  WorkspaceContextApiError,
  WorkspaceContextApiService,
  type WorkspaceContextInvitation,
  type WorkspaceContextMembership,
  type WorkspaceContextPayload
} from '../../services/workspace-context-api.service';

const PREF_KEYS = {
  reduceMotion: 'wellar_ui_reduce_motion_v1',
  compactMode: 'wellar_ui_compact_mode_v1',
  tableDensity: 'wellar_ui_table_density_v1',
  defaultDateRange: 'wellar_ui_default_date_range_v1',
  defaultLandingPage: 'wellar_ui_default_landing_page_v1'
} as const;

type SettingsTabId = 'profile' | 'preferences' | 'security';
type ToastType = 'success' | 'error' | 'info';
type TableDensity = 'comfortable' | 'compact';
type DefaultDateRange = 'today' | 'last_7_days' | 'last_30_days';
type DefaultLandingPage = 'dashboard' | 'workforce' | 'scan_requests';
type AccessRole = 'owner' | 'hr' | 'manager' | 'employee' | null;

type DirectusUserRow = {
  id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  provider?: string | null;
  external_identifier?: string | null;
  phone?: string | null;
  active_business_profile?:
    | string
    | number
    | {
        id?: string | number | null;
        company_name?: string | null;
      }
    | null;
  active_department?:
    | string
    | number
    | {
        id?: string | number | null;
        name?: string | null;
      }
    | null;
  active_member_role?: string | null;
  role?: string | { id?: string | null; name?: string | null } | null;
};

type AuthSessionUser = {
  id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  provider?: string | null;
  external_identifier?: string | null;
  phone?: string | null;
  role?: string | { id?: string | null; name?: string | null } | null;
};

type SettingsInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  departmentName: string | null;
};

type SettingsMembership = {
  id: string;
  status: string;
  memberRoleRaw: string;
  businessProfile: {
    id: string;
    companyName: string;
    isActive: boolean;
    planCode: string | null;
    billingStatus: string | null;
    dateCreated: string | null;
    dateUpdated: string | null;
  };
  department: {
    id: string;
    name: string;
  } | null;
};

type AccountForm = {
  firstName: string;
  lastName: string;
  phone: string;
};

const ACCEPTED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_FILE_SIZE_BYTES = 2 * 1024 * 1024;

type UiPreferences = {
  reduceMotion: boolean;
  compactMode: boolean;
  tableDensity: TableDensity;
  defaultDateRange: DefaultDateRange;
  defaultLandingPage: DefaultLandingPage;
};

type ToastMessage = {
  id: number;
  type: ToastType;
  text: string;
};

type ProfileSaveState = 'idle' | 'saving' | 'success' | 'error';

type SettingsViewState = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsPageComponent implements OnInit, OnDestroy {
  readonly tabs: Array<{ id: SettingsTabId; label: string; icon: string }> = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'preferences', label: 'Preferences', icon: 'preferences' },
    { id: 'security', label: 'Security', icon: 'security' }
  ];

  loading = true;
  viewState: SettingsViewState = 'loading';
  loadError = '';
  refreshing = false;
  switchingWorkspace = false;
  switchingMessage = '';
  membershipError = '';
  membershipForbidden = false;

  activeTab: SettingsTabId = 'profile';
  workspaceDropdownOpen = false;
  savingAccount = false;
  accountTouched = false;
  clearingWorkspaceCache = false;
  loggingOut = false;
  profileSaveState: ProfileSaveState = 'idle';
  profileSaveMessage = 'No unsaved changes.';
  avatarFile: File | null = null;
  avatarPreviewUrl: string | null = null;
  avatarUploadError = '';
  avatarFileLabel = '';
  protectedAvatarWrite = true;

  user: DirectusUserRow | null = null;
  memberships: SettingsMembership[] = [];
  activeMembership: SettingsMembership | null = null;
  invites: SettingsInvite[] = [];
  invitesError = '';

  accountForm: AccountForm = {
    firstName: '',
    lastName: '',
    phone: ''
  };

  private accountInitial: AccountForm = {
    firstName: '',
    lastName: '',
    phone: ''
  };

  preferences: UiPreferences = {
    reduceMotion: false,
    compactMode: false,
    tableDensity: 'comfortable',
    defaultDateRange: 'last_7_days',
    defaultLandingPage: 'dashboard'
  };
  preferencesHint = '';

  toasts: ToastMessage[] = [];
  private toastCounter = 0;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private companyContext: CompanyContextService,
    private workspaceContextApi: WorkspaceContextApiService
  ) {}

  ngOnInit(): void {
    this.loadPreferences();
    const requestedTab = this.normalizeInitialTab(this.route.snapshot.queryParamMap.get('tab'));
    if (requestedTab === 'organization') {
      void this.redirectLegacyOrganizationTab();
      return;
    }

    this.activeTab = requestedTab ?? 'profile';
    void this.loadSettings();
  }

  ngOnDestroy(): void {
    this.clearAvatarPreview();
  }

  @HostListener('document:click')
  closeWorkspaceDropdown(): void {
    this.workspaceDropdownOpen = false;
  }

  async refreshContext(): Promise<void> {
    this.refreshing = true;
    await this.loadSettings(true);
    this.refreshing = false;
  }

  selectTab(tab: SettingsTabId): void {
    this.activeTab = tab;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  avatarInitials(): string {
    const first = this.pickString(this.user?.first_name) ?? '';
    const last = this.pickString(this.user?.last_name) ?? '';
    const full = `${first} ${last}`.trim();
    if (full) {
      const parts = full.split(/\s+/).filter(Boolean);
      const firstInitial = parts[0]?.slice(0, 1) ?? '';
      const secondInitial = parts[1]?.slice(0, 1) ?? '';
      return `${firstInitial}${secondInitial}`.toUpperCase() || 'U';
    }

    const email = this.pickString(this.user?.email) ?? '';
    return email.slice(0, 1).toUpperCase() || 'U';
  }

  avatarUrl(): string | null {
    const avatar = this.pickString(this.user?.avatar);
    if (!avatar) {
      return null;
    }

    const base = `${this.apiUrl()}/assets/${avatar}`;
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return base;
    }

    return `${base}?access_token=${encodeURIComponent(token)}`;
  }

  currentWorkspaceName(): string {
    return this.activeMembership?.businessProfile.companyName ?? 'No active organization';
  }

  displayName(): string {
    const first = this.pickString(this.user?.first_name) ?? '';
    const last = this.pickString(this.user?.last_name) ?? '';
    const full = `${first} ${last}`.trim();
    return full || 'User';
  }

  roleBadgeLabel(role: string | null | undefined): string {
    const normalized = this.normalizeUiRole(role);
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee') return 'Employee';
    return 'Unknown';
  }

  roleBadgeClass(role: string | null | undefined): string {
    const normalized = this.normalizeUiRole(role);
    if (normalized === 'owner') return 'badge badge-owner';
    if (normalized === 'hr') return 'badge badge-hr';
    if (normalized === 'manager') return 'badge badge-manager';
    if (normalized === 'employee') return 'badge badge-employee';
    return 'badge badge-muted';
  }

  scopeBadgeClass(): string {
    return this.activeMembership?.department ? 'badge badge-scope-department' : 'badge badge-scope-company';
  }

  scopeLabel(): string {
    return this.activeMembership?.department ? 'Department scope' : 'Organization-wide scope';
  }

  scopeDetail(): string {
    return this.activeMembership?.department?.name ?? 'Organization-wide scope';
  }

  membershipStatusLabel(): string {
    const status = (this.activeMembership?.status ?? '').toLowerCase();
    return status === 'active' ? 'Active' : status || 'Unknown';
  }

  isOwnerAccess(): boolean {
    return this.resolveAccessRole(this.activeMembership?.memberRoleRaw ?? this.user?.active_member_role) === 'owner';
  }

  activeDirectusRoleLabel(): string {
    const role = this.user?.role;
    if (typeof role === 'string' && role.trim()) {
      return role.trim();
    }
    if (role && typeof role === 'object') {
      const named = this.pickString((role as { name?: string | null }).name);
      if (named) {
        return named;
      }
    }
    return 'Not available';
  }

  providerLabel(): string {
    const provider = (this.pickString(this.user?.provider) ?? '').toLowerCase();
    if (provider.includes('google')) return 'Google';
    if (provider.includes('password') || provider.includes('email')) return 'Email';
    return provider ? provider[0].toUpperCase() + provider.slice(1) : 'Not available';
  }

  hasAccountChanges(): boolean {
    return (
      this.accountInitial.firstName !== this.accountForm.firstName ||
      this.accountInitial.lastName !== this.accountForm.lastName ||
      this.accountInitial.phone !== this.accountForm.phone ||
      Boolean(this.avatarFile)
    );
  }

  onAccountChanged(): void {
    this.accountTouched = true;
    if (this.profileSaveState !== 'saving') {
      this.profileSaveState = 'idle';
      this.profileSaveMessage = this.hasAccountChanges() ? 'Changes are waiting to be saved.' : 'No unsaved changes.';
    }
  }

  cancelAccountChanges(): void {
    this.accountForm = {
      firstName: this.accountInitial.firstName,
      lastName: this.accountInitial.lastName,
      phone: this.accountInitial.phone
    };
    this.clearAvatarSelection();
    this.accountTouched = false;
    this.profileSaveState = 'idle';
    this.profileSaveMessage = 'No unsaved changes.';
  }

  async saveAccountChanges(): Promise<void> {
    if (!this.user?.id || this.savingAccount || !this.hasAccountChanges()) {
      return;
    }

    const token = this.auth.getStoredAccessToken();
    if (!token) {
      this.profileSaveState = 'error';
      this.profileSaveMessage = 'Session expired. Please sign in again.';
      return;
    }

    this.savingAccount = true;
    this.profileSaveState = 'saving';
    this.profileSaveMessage = 'Saving account settings...';

    try {
      const avatarId = await this.uploadAvatarIfNeeded(token);
      await firstValueFrom(
        this.http.patch(
          `${this.apiUrl()}/users/me`,
          {
            first_name: this.accountForm.firstName.trim() || null,
            last_name: this.accountForm.lastName.trim() || null,
            phone: this.accountForm.phone.trim() || null,
            ...(avatarId ? { avatar: avatarId } : {})
          },
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        )
      );

      this.accountInitial = { ...this.accountForm };
      this.accountTouched = false;
      this.clearAvatarSelection();
      this.profileSaveState = 'success';
      this.profileSaveMessage = 'Account settings saved.';
      try {
        await this.reloadCurrentUser();
      } catch {
        this.profileSaveMessage = 'Account settings saved. The profile view could not refresh.';
      }
      this.pushToast('success', 'Account profile updated successfully.');
    } catch (error) {
      this.profileSaveState = 'error';
      this.profileSaveMessage = this.readError(error, 'Could not save account profile changes.');
      this.pushToast('error', 'Could not save account profile changes.');
    } finally {
      this.savingAccount = false;
    }
  }

  clearAvatarSelection(): void {
    this.avatarFile = null;
    this.avatarFileLabel = '';
    this.avatarUploadError = '';
    this.clearAvatarPreview();
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.avatarUploadError = '';

    if (!file) {
      this.clearAvatarSelection();
      return;
    }

    if (!ACCEPTED_AVATAR_MIME_TYPES.has(file.type)) {
      this.clearAvatarSelection();
      this.avatarUploadError = 'Choose a JPG, PNG, or WebP image.';
      this.avatarFileLabel = '';
      if (input) {
        input.value = '';
      }
      return;
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      this.clearAvatarSelection();
      this.avatarUploadError = 'Choose an image smaller than 2 MB.';
      this.avatarFileLabel = '';
      if (input) {
        input.value = '';
      }
      return;
    }

    this.avatarFile = file;
    this.avatarFileLabel = file.name;
    this.updateAvatarPreview(file);
    this.onAccountChanged();
  }

  private async uploadAvatarIfNeeded(token: string): Promise<string | null> {
    if (!this.avatarFile) {
      return null;
    }

    const fileId = await firstValueFrom(this.uploadAvatarWithToken(token));
    if (!fileId) {
      throw new Error('The avatar upload could not be completed.');
    }

    const userId = this.normalizeId(this.user?.id);
    if (userId) {
      try {
        await firstValueFrom(this.assignFileOwner(fileId, userId, token));
      } catch {
        // Keep the uploaded file even if ownership reassignment is blocked.
      }
    }

    return fileId;
  }

  private uploadAvatarWithToken(token: string): Observable<string | null> {
    const formData = new FormData();
    formData.append('file', this.avatarFile as Blob);

    return this.http.post<{ data?: { id?: string } }>(
      `${this.apiUrl()}/files`,
      formData,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((res) => this.pickString(res?.data?.id) ?? null)
    );
  }

  private assignFileOwner(fileId: string, userId: string, token: string): Observable<unknown> {
    return this.http.patch(
      `${this.apiUrl()}/files/${encodeURIComponent(fileId)}`,
      { uploaded_by: userId },
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    );
  }

  private updateAvatarPreview(file: File | null): void {
    this.clearAvatarPreview();
    if (!file) {
      return;
    }

    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  private clearAvatarPreview(): void {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
    this.avatarPreviewUrl = null;
  }

  toggleWorkspaceDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.workspaceDropdownOpen = !this.workspaceDropdownOpen;
  }

  async switchWorkspace(membershipId: string): Promise<void> {
    if (this.switchingWorkspace || !membershipId || this.memberships.length <= 1) {
      return;
    }

    const selected = this.memberships.find((item) => item.id === membershipId) ?? null;
    const previous = this.activeMembership;

    if (!selected || !previous || selected.id === previous.id) {
      this.workspaceDropdownOpen = false;
      return;
    }

    const token = this.auth.getStoredAccessToken();
    if (!token) {
      this.pushToast('error', 'Session expired. Please sign in again.');
      return;
    }

    this.switchingWorkspace = true;
    this.switchingMessage = 'Switching organization...';

    try {
      await firstValueFrom(this.workspaceContextApi.switchMembership(selected.id));
      await this.loadSettings(true, false);
      this.workspaceDropdownOpen = false;
      this.pushToast('success', 'Organization switched successfully.');
      await this.router.navigateByUrl('/app/dashboard');
    } catch (error) {
      this.activeMembership = previous;
      this.pushToast(
        'error',
        this.readWorkspaceContextError(error, 'Organization switch failed. Your previous organization is still active.')
      );
    } finally {
      this.switchingWorkspace = false;
      this.switchingMessage = '';
    }
  }

  roleSummaryText(): string {
    const role = this.resolveAccessRole(this.activeMembership?.memberRoleRaw ?? this.user?.active_member_role);
    if (role === 'owner') {
      return 'Full operational control for organization administration, workforce, scan requests, alerts, reports, and settings.';
    }
    if (role === 'hr') {
      return 'Workforce and scan-request operations with access to operational readiness data.';
    }
    if (role === 'manager') {
      return 'Operational visibility and follow-up tools for the assigned scope.';
    }
    if (role === 'employee') {
      return 'Mobile scan experience and limited web access.';
    }
    return 'Access level information is unavailable.';
  }

  currentAccessChips(): string[] {
    const role = this.resolveAccessRole(this.activeMembership?.memberRoleRaw ?? this.user?.active_member_role);
    if (role === 'owner') {
      return ['Manage organization', 'Manage workforce', 'Send scan requests', 'Review reports'];
    }
    if (role === 'hr') {
      return ['Manage workforce', 'Send scan requests', 'Review operational data'];
    }
    if (role === 'manager') {
      return ['View assigned scope', 'Follow up on team readiness'];
    }
    if (role === 'employee') {
      return ['Mobile readiness checks only'];
    }
    return ['Access context unavailable'];
  }

  updatePreferenceBoolean(key: 'reduceMotion' | 'compactMode', value: boolean): void {
    this.preferences[key] = value;
    this.persistPreferences();
  }

  updatePreferenceSelect<K extends 'tableDensity' | 'defaultDateRange' | 'defaultLandingPage'>(
    key: K,
    value: UiPreferences[K]
  ): void {
    this.preferences[key] = value;
    this.persistPreferences();
  }

  async clearWorkspaceCache(): Promise<void> {
    if (this.clearingWorkspaceCache) {
      return;
    }

    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(
        'Clear the locally cached organization context from this browser? This does not delete any backend data, and the organization will reload.'
      );
    if (!confirmed) {
      return;
    }

    this.clearingWorkspaceCache = true;

    try {
      this.companyContext.clearActiveWorkspaceContext();
      await this.companyContext.ensureActiveContext();
      await firstValueFrom(this.companyContext.ensureLoaded(true));
      await this.loadSettings(true, false);
      this.pushToast('success', 'Organization cache cleared and reloaded.');
    } catch (error) {
      this.pushToast('error', this.readError(error, 'Could not refresh organization context.'));
    } finally {
      this.clearingWorkspaceCache = false;
    }
  }

  logout(): void {
    if (this.loggingOut) {
      return;
    }

    this.loggingOut = true;
    this.companyContext.clearActiveWorkspaceContext();
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }

  clearError(): void {
    this.loadError = '';
  }

  trackByMembershipId(_index: number, membership: SettingsMembership): string {
    return membership.id;
  }

  private normalizeInitialTab(value: string | null): SettingsTabId | 'organization' | null {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'profile' || normalized === 'preferences' || normalized === 'security') {
      return normalized;
    }
    if (normalized === 'organization') {
      return 'organization';
    }
    return null;
  }

  private async redirectLegacyOrganizationTab(): Promise<void> {
    const role = this.resolveAccessRole(this.companyContext.snapshot().context.activeMemberRole);
    if (role === 'owner' || role === 'hr') {
      await this.router.navigateByUrl('/app/company', { replaceUrl: true });
      return;
    }

    this.activeTab = 'profile';
  }

  private async loadSettings(forceRefresh = false, allowRedirect = true): Promise<void> {
    this.loading = true;
    this.viewState = 'loading';
    this.loadError = '';
    this.membershipError = '';
    this.membershipForbidden = false;

    try {
      const sessionUser = await this.auth.getCurrentUserAfterRestore();
      const userId = this.normalizeId(sessionUser?.id);

      if (!userId) {
        this.viewState = 'error';
        if (allowRedirect) {
          await this.router.navigateByUrl('/?auth=login');
        }
        return;
      }

      await this.companyContext.ensureActiveContext();
      this.user = await this.loadCurrentUserProfile(sessionUser);
      this.applyAccountForm();

      const workspaceContext = await firstValueFrom(this.workspaceContextApi.getContext());
      this.memberships = workspaceContext.memberships.map((membership) => this.normalizeMembership(membership));
      this.invites = workspaceContext.invitations.map((invite) => this.normalizeInvite(invite));
      this.invitesError = '';

      if (!this.memberships.length) {
        this.viewState = 'empty';
        this.companyContext.clearActiveWorkspaceContext();
        if (allowRedirect) {
          await this.router.navigateByUrl('/app/workspace-access');
        }
        return;
      }

      await this.ensureActiveMembershipConsistency(workspaceContext, forceRefresh);
      this.viewState = 'ready';

      await firstValueFrom(this.companyContext.ensureLoaded(forceRefresh));
    } catch (error) {
      if (error instanceof WorkspaceContextApiError && error.code === 'forbidden') {
        this.memberships = [];
        this.invites = [];
        this.invitesError = '';
        this.membershipForbidden = true;
        this.membershipError = 'You do not have permission to view organization settings for the active workspace.';
        this.viewState = 'forbidden';
        return;
      }

      const err = error as any;
      console.warn('[Settings] failed request', {
        status: err?.status ?? err?.error?.status ?? null,
        code: err?.error?.errors?.[0]?.extensions?.code ?? null,
        message: err?.message ?? null
      });
      this.loadError = this.readWorkspaceContextError(error, 'Failed to load settings.');
      this.viewState = 'error';
    } finally {
      this.loading = false;
    }
  }

  private async ensureActiveMembershipConsistency(
    workspaceContext: WorkspaceContextPayload,
    forceRefresh: boolean
  ): Promise<void> {
    const activeMembershipId = this.normalizeId(workspaceContext.active?.membership?.id);
    let selected = this.memberships.find((item) => item.id === activeMembershipId) ?? null;

    if (!selected) {
      const contextMembership = this.companyContext.getActiveMembership();
      const contextMembershipId = this.normalizeId(contextMembership?.id);
      selected = this.memberships.find((item) => item.id === contextMembershipId) ?? this.memberships[0] ?? null;
    }

    if (!selected) {
      this.companyContext.clearActiveWorkspaceContext();
      await this.router.navigateByUrl('/app/workspace-access');
      return;
    }

    this.activeMembership = selected;
    await this.activateMembershipInContext(selected);

    if (forceRefresh) {
      await firstValueFrom(this.companyContext.ensureLoaded(true));
    }
  }

  private async activateMembershipInContext(membership: SettingsMembership): Promise<void> {
    const userId = this.normalizeId(this.user?.id);
    const normalizedRole = this.normalizeUiRole(membership.memberRoleRaw);

    const contextMembership: ActiveMembershipContext = {
      id: membership.id,
      status: membership.status,
      member_role: normalizedRole ?? membership.memberRoleRaw,
      user: userId,
      business_profile: {
        id: membership.businessProfile.id,
        company_name: membership.businessProfile.companyName,
        is_active: membership.businessProfile.isActive
      },
      department: membership.department
        ? {
            id: membership.department.id,
            name: membership.department.name
          }
        : null,
      joined_at: null
    };

    this.companyContext.clearActiveWorkspaceContext();
    await this.companyContext.activateFromMembership(contextMembership as any);
    await firstValueFrom(this.companyContext.ensureLoaded(true));
  }

  private async reloadCurrentUser(): Promise<void> {
    const sessionUser = await this.auth.getCurrentUserAfterRestore();
    this.user = await this.loadCurrentUserProfile(sessionUser);
    this.applyAccountForm();
  }

  private async loadCurrentUserProfile(sessionUser: AuthSessionUser | null): Promise<DirectusUserRow> {
    let directusUser: DirectusUserRow | null = null;
    try {
      directusUser = await this.fetchCurrentUser();
    } catch {
      directusUser = null;
    }

    return this.mergeUserProfile(sessionUser, directusUser);
  }

  private async fetchCurrentUser(): Promise<DirectusUserRow> {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      throw new Error('Session expired. Please sign in again.');
    }

    const fields = [
      'id',
      'first_name',
      'last_name',
      'email',
      'avatar',
      'provider',
      'external_identifier',
      'phone',
      'role',
      'role.id',
      'role.name'
    ].join(',');

    const response = await firstValueFrom(
      this.http.get<{ data?: DirectusUserRow } | DirectusUserRow>(
        `${this.apiUrl()}/users/me?fields=${encodeURIComponent(fields)}&_ts=${Date.now()}`,
        {
          headers: this.auth.getAuthHeaders(token),
          withCredentials: true
        }
      )
    );

    const record = this.objectRecord((response as any)?.data) ?? this.objectRecord(response) ?? {};
    return {
      id: this.normalizeId(record['id']) ?? null,
      first_name: this.pickString(record['first_name']),
      last_name: this.pickString(record['last_name']),
      email: this.pickString(record['email']),
      avatar: this.pickString(record['avatar']),
      provider: this.pickString(record['provider']),
      external_identifier: this.pickString(record['external_identifier']),
      phone: this.pickString(record['phone']),
      active_business_profile: null,
      active_department: null,
      active_member_role: null,
      role: (record['role'] as any) ?? null
    };
  }

  private normalizeInvite(row: WorkspaceContextInvitation): SettingsInvite {
    return {
      id: row.id,
      email: row.email,
      role: this.roleBadgeLabel(row.memberRole),
      status: row.status,
      departmentName: row.department?.name ?? null
    };
  }

  private normalizeMembership(row: WorkspaceContextMembership): SettingsMembership {
    return {
      id: row.id,
      status: row.status.toLowerCase(),
      memberRoleRaw: row.memberRole.toLowerCase(),
      businessProfile: {
        id: row.workspace.id,
        companyName: row.workspace.companyName,
        isActive: row.workspace.isActive,
        planCode: row.workspace.planCode,
        billingStatus: row.workspace.billingStatus,
        dateCreated: null,
        dateUpdated: null
      },
      department: row.department
        ? {
            id: row.department.id,
            name: row.department.name
          }
        : null
    };
  }

  private applyAccountForm(): void {
    this.accountInitial = {
      firstName: this.pickString(this.user?.first_name) ?? '',
      lastName: this.pickString(this.user?.last_name) ?? '',
      phone: this.pickString(this.user?.phone) ?? ''
    };

    this.accountForm = { ...this.accountInitial };
    this.accountTouched = false;
    this.clearAvatarSelection();
    this.profileSaveState = 'idle';
    this.profileSaveMessage = 'No unsaved changes.';
  }

  private resolveAccessRole(value: unknown): AccessRole {
    const normalized = this.normalizeUiRole(value);
    if (normalized === 'owner' || normalized === 'hr' || normalized === 'manager' || normalized === 'employee') {
      return normalized;
    }
    return null;
  }

  private mergeUserProfile(
    sessionUser: AuthSessionUser | null,
    directusUser: DirectusUserRow | null
  ): DirectusUserRow {
    const context = this.companyContext.snapshot().context;

    const id =
      this.normalizeId(directusUser?.id) ??
      this.normalizeId(sessionUser?.id) ??
      this.normalizeId(context.userId) ??
      null;
    const firstName = this.pickString(directusUser?.first_name) ?? this.pickString(sessionUser?.first_name);
    const lastName = this.pickString(directusUser?.last_name) ?? this.pickString(sessionUser?.last_name);
    const email =
      this.pickString(directusUser?.email) ??
      this.pickString(sessionUser?.email) ??
      this.pickString(context.userEmail) ??
      this.readStorageString('user_email');
    const avatar = this.pickString(directusUser?.avatar);
    const provider =
      this.pickString(directusUser?.provider) ??
      this.pickString(sessionUser?.provider);
    const externalIdentifier =
      this.pickString(directusUser?.external_identifier) ??
      this.pickString(sessionUser?.external_identifier);
    const phone = this.pickString(directusUser?.phone) ?? this.pickString(sessionUser?.phone);

    return {
      id,
      first_name: firstName,
      last_name: lastName,
      email,
      avatar,
      provider,
      external_identifier: externalIdentifier,
      phone,
      active_business_profile:
        directusUser?.active_business_profile ??
        context.activeBusinessProfileId ??
        null,
      active_department:
        directusUser?.active_department ??
        context.activeDepartmentId ??
        null,
      active_member_role:
        this.pickString(directusUser?.active_member_role) ??
        this.pickString(context.activeMemberRole),
      role: directusUser?.role ?? sessionUser?.role ?? null
    };
  }

  private normalizeUiRole(value: unknown): AccessRole {
    const normalized = this.pickString(value)?.toLowerCase() ?? '';
    if (normalized === 'owner') return 'owner';
    if (normalized === 'hr' || normalized === 'admin') return 'hr';
    if (normalized === 'manager' || normalized === 'manger') return 'manager';
    if (normalized === 'employee' || normalized === 'member' || normalized === 'viewer') return 'employee';
    return null;
  }

  private loadPreferences(): void {
    this.preferences = {
      reduceMotion: this.readStoredBoolean(PREF_KEYS.reduceMotion, false),
      compactMode: this.readStoredBoolean(PREF_KEYS.compactMode, false),
      tableDensity: this.readStoredEnum<TableDensity>(PREF_KEYS.tableDensity, ['comfortable', 'compact'], 'comfortable'),
      defaultDateRange: this.readStoredEnum<DefaultDateRange>(
        PREF_KEYS.defaultDateRange,
        ['today', 'last_7_days', 'last_30_days'],
        'last_7_days'
      ),
      defaultLandingPage: this.readStoredEnum<DefaultLandingPage>(
        PREF_KEYS.defaultLandingPage,
        ['dashboard', 'workforce', 'scan_requests'],
        'dashboard'
      )
    };
  }

  private persistPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(PREF_KEYS.reduceMotion, String(this.preferences.reduceMotion));
    localStorage.setItem(PREF_KEYS.compactMode, String(this.preferences.compactMode));
    localStorage.setItem(PREF_KEYS.tableDensity, this.preferences.tableDensity);
    localStorage.setItem(PREF_KEYS.defaultDateRange, this.preferences.defaultDateRange);
    localStorage.setItem(PREF_KEYS.defaultLandingPage, this.preferences.defaultLandingPage);

    this.preferencesHint = 'Saved locally';
    setTimeout(() => {
      this.preferencesHint = '';
    }, 1400);
  }

  private readStoredBoolean(key: string, fallback: boolean): boolean {
    if (typeof localStorage === 'undefined') {
      return fallback;
    }

    const value = localStorage.getItem(key);
    if (!value) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return fallback;
  }

  private readStoredEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    if (typeof localStorage === 'undefined') {
      return fallback;
    }

    const value = localStorage.getItem(key)?.trim() as T | undefined;
    if (value && allowed.includes(value)) {
      return value;
    }
    return fallback;
  }

  private pushToast(type: ToastType, text: string): void {
    const toast: ToastMessage = {
      id: ++this.toastCounter,
      type,
      text
    };

    this.toasts = [...this.toasts, toast];

    setTimeout(() => {
      this.toasts = this.toasts.filter((item) => item.id !== toast.id);
    }, 3600);
  }

  private apiUrl(): string {
    return environment.API_URL;
  }

  private readError(error: unknown, fallback: string): string {
    const err = error as any;
    const status = Number(err?.status ?? err?.error?.status ?? 0);
    if (status === 401) {
      return 'Session expired. Please sign in again.';
    }
    if (status === 403) {
      return 'You do not have permission to change this account.';
    }
    if (status === 404) {
      return 'The requested account record was not found.';
    }
    if (status === 409 || status === 422) {
      return 'One or more values could not be saved.';
    }

    return fallback;
  }

  private readWorkspaceContextError(error: unknown, fallback: string): string {
    if (error instanceof WorkspaceContextApiError) {
      return error.userMessage || fallback;
    }

    return this.readError(error, fallback);
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

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readStorageString(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  }
}
