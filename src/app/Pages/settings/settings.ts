import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

import { CompanyContextService, type ActiveMembershipContext } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { BusinessCenterService } from '../../services/business-center.service';

const PREF_KEYS = {
  reduceMotion: 'wellar_ui_reduce_motion_v1',
  compactMode: 'wellar_ui_compact_mode_v1',
  tableDensity: 'wellar_ui_table_density_v1',
  defaultDateRange: 'wellar_ui_default_date_range_v1',
  defaultLandingPage: 'wellar_ui_default_landing_page_v1'
} as const;

type SettingsTabId = 'profile' | 'workspace' | 'preferences' | 'security';
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

type MembershipRow = {
  id?: string | number | null;
  status?: string | null;
  member_role?: string | null;
  user?: string | number | null;
  business_profile?:
    | string
    | number
    | {
        id?: string | number | null;
        company_name?: string | null;
        is_active?: boolean | null;
        plan_code?: string | null;
        billing_status?: string | null;
        date_created?: string | null;
        date_updated?: string | null;
      }
    | null;
  department?:
    | string
    | number
    | {
        id?: string | number | null;
        name?: string | null;
      }
    | null;
};

type InviteRow = {
  id?: string | number | null;
  email?: string | null;
  member_role?: string | null;
  status?: string | null;
  sent_at?: string | null;
  claimed_at?: string | null;
  department?:
    | string
    | number
    | {
        id?: string | number | null;
        name?: string | null;
      }
    | null;
  requested_by_user?:
    | string
    | number
    | {
        id?: string | number | null;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
      }
    | null;
};

type SettingsInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  sentAt: string | null;
  claimedAt: string | null;
  departmentName: string | null;
  invitedBy: string;
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

type SettingsViewState = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsPageComponent implements OnInit {
  readonly tabs: Array<{ id: SettingsTabId; label: string; icon: string }> = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'workspace', label: 'Workspace', icon: 'workspace' },
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
    private router: Router,
    private companyContext: CompanyContextService,
    private businessCenter: BusinessCenterService
  ) {}

  ngOnInit(): void {
    this.loadPreferences();
    void this.loadSettings();
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

  currentWorkspaceName(): string {
    return this.activeMembership?.businessProfile.companyName ?? 'No active workspace';
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
    return this.activeMembership?.department ? 'Department scope' : 'Company-wide scope';
  }

  scopeDetail(): string {
    return this.activeMembership?.department?.name ?? 'Company-wide scope';
  }

  membershipStatusLabel(): string {
    const status = (this.activeMembership?.status ?? '').toLowerCase();
    return status === 'active' ? 'Active' : status || 'Unknown';
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
      this.accountInitial.phone !== this.accountForm.phone
    );
  }

  onAccountChanged(): void {
    this.accountTouched = true;
  }

  cancelAccountChanges(): void {
    this.accountForm = {
      firstName: this.accountInitial.firstName,
      lastName: this.accountInitial.lastName,
      phone: this.accountInitial.phone
    };
    this.accountTouched = false;
  }

  async saveAccountChanges(): Promise<void> {
    if (!this.user?.id || this.savingAccount || !this.hasAccountChanges()) {
      return;
    }

    const token = this.auth.getStoredAccessToken();
    if (!token) {
      this.pushToast('error', 'Session expired. Please sign in again.');
      return;
    }

    this.savingAccount = true;

    try {
      await firstValueFrom(
        this.http.patch(
          `${this.apiUrl()}/users/me`,
          {
            first_name: this.accountForm.firstName.trim() || null,
            last_name: this.accountForm.lastName.trim() || null,
            phone: this.accountForm.phone.trim() || null
          },
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        )
      );

      this.accountInitial = { ...this.accountForm };
      this.accountTouched = false;
      await this.reloadCurrentUser();
      this.pushToast('success', 'Account profile updated successfully.');
    } catch (error) {
      this.pushToast('error', this.readError(error, 'Could not save account profile changes.'));
    } finally {
      this.savingAccount = false;
    }
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
    this.switchingMessage = 'Switching workspace...';

    try {
      await this.persistActiveWorkspace(selected, token);
      await this.activateMembershipInContext(selected);
      this.activeMembership = selected;
      this.workspaceDropdownOpen = false;
      this.pushToast('success', 'Workspace switched successfully.');
      await this.router.navigateByUrl('/app/dashboard');
    } catch {
      if (previous) {
        await this.activateMembershipInContext(previous).catch(() => void 0);
        this.activeMembership = previous;
      }
      this.pushToast('error', 'Workspace switch failed. Your previous workspace is still active.');
    } finally {
      this.switchingWorkspace = false;
      this.switchingMessage = '';
    }
  }

  roleSummaryText(): string {
    const role = this.resolveAccessRole(this.activeMembership?.memberRoleRaw ?? this.user?.active_member_role);
    if (role === 'owner') {
      return 'Full operational control if backend permissions allow it.';
    }
    if (role === 'hr') {
      return 'Workforce and scan-request operations if backend permissions allow it.';
    }
    if (role === 'manager') {
      return 'Operational visibility for assigned scope if backend permissions allow it.';
    }
    if (role === 'employee') {
      return 'Mobile scan experience and limited web access.';
    }
    return 'Role information is unavailable.';
  }

  currentAccessChips(): string[] {
    const role = this.resolveAccessRole(this.activeMembership?.memberRoleRaw ?? this.user?.active_member_role);
    if (role === 'owner') {
      return ['Manage workspace', 'Manage workforce', 'Send scan requests', 'Review reports'];
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

    this.clearingWorkspaceCache = true;

    try {
      this.companyContext.clearActiveWorkspaceContext();
      await this.companyContext.ensureActiveContext();
      await firstValueFrom(this.companyContext.ensureLoaded(true));
      await this.loadSettings(true, false);
      this.pushToast('success', 'Workspace cache cleared and reloaded.');
    } catch (error) {
      this.pushToast('error', this.readError(error, 'Could not refresh workspace context.'));
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
    this.businessCenter.notifyAuthStateChanged();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  clearError(): void {
    this.loadError = '';
  }

  trackByMembershipId(_index: number, membership: SettingsMembership): string {
    return membership.id;
  }

  private async loadSettings(forceRefresh = false, allowRedirect = true): Promise<void> {
    console.debug('[Settings] load start', { forceRefresh, allowRedirect });
    this.loading = true;
    this.viewState = 'loading';
    this.loadError = '';
    this.membershipError = '';
    this.membershipForbidden = false;

    try {
      const sessionUser = await this.auth.getCurrentUserAfterRestore();
      const userId = this.normalizeId(sessionUser?.id);
      console.debug('[Settings] current user loaded', { userId });

      if (!userId) {
        this.viewState = 'error';
        if (allowRedirect) {
          await this.router.navigateByUrl('/login');
        }
        return;
      }

      await this.companyContext.ensureActiveContext();
      this.user = await this.loadCurrentUserProfile(sessionUser);
      this.applyAccountForm();
      console.debug('[Settings] workspace context loaded');

      const membershipResult = await this.fetchMemberships(userId);
      if (membershipResult.forbidden) {
        this.memberships = [];
        this.membershipForbidden = true;
        this.membershipError = 'Workspace memberships could not be loaded. Please check your access or contact an owner.';
        this.viewState = 'forbidden';
      } else {
        this.memberships = membershipResult.items;
        if (!this.memberships.length) {
          this.viewState = 'empty';
          this.companyContext.clearActiveWorkspaceContext();
          if (allowRedirect) {
            await this.router.navigateByUrl('/app/workspace-access');
          }
          return;
        }

        await this.ensureActiveMembershipConsistency(forceRefresh);
        this.viewState = 'ready';
      }

      await firstValueFrom(this.companyContext.ensureLoaded(forceRefresh));
      // Optional: never block base settings rendering.
      void this.loadInvitesSafely();
    } catch (error) {
      const err = error as any;
      console.warn('[Settings] failed request', {
        status: err?.status ?? err?.error?.status ?? null,
        code: err?.error?.errors?.[0]?.extensions?.code ?? null,
        message: err?.message ?? null
      });
      this.loadError = this.readError(error, 'Failed to load settings.');
      this.viewState = 'error';
    } finally {
      this.loading = false;
      console.debug('[Settings] load finished', { viewState: this.viewState });
    }
  }

  private async ensureActiveMembershipConsistency(forceRefresh: boolean): Promise<void> {
    const activeProfileId = this.normalizeId(this.user?.active_business_profile);
    let selected = this.memberships.find((item) => item.businessProfile.id === activeProfileId) ?? null;

    const staleContext = Boolean(activeProfileId && !selected);

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

    if (staleContext) {
      this.companyContext.clearActiveWorkspaceContext();
      const token = this.auth.getStoredAccessToken();
      if (token) {
        try {
          await this.persistActiveWorkspace(selected, token);
        } catch {
          this.pushToast('error', 'Active workspace context was stale and could not be refreshed.');
        }
      }
    }

    this.activeMembership = selected;
    await this.activateMembershipInContext(selected);

    if (forceRefresh) {
      this.businessCenter.notifyAuthStateChanged();
    }
  }

  private async persistActiveWorkspace(membership: SettingsMembership, token: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.apiUrl()}/users/me`,
        {
          active_business_profile: membership.businessProfile.id,
          active_department: membership.department?.id ?? null,
          active_member_role: this.toBackendRole(membership.memberRoleRaw)
        },
        {
          headers: this.auth.getAuthHeaders(token),
          withCredentials: true
        }
      )
    );
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
    this.businessCenter.notifyAuthStateChanged();
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
      'active_business_profile',
      'active_business_profile.id',
      'active_business_profile.company_name',
      'active_department',
      'active_department.id',
      'active_department.name',
      'active_member_role',
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
      active_business_profile: (record['active_business_profile'] as any) ?? null,
      active_department: (record['active_department'] as any) ?? null,
      active_member_role: this.pickString(record['active_member_role']),
      role: (record['role'] as any) ?? null
    };
  }

  private async fetchMemberships(userId: string): Promise<{ items: SettingsMembership[]; forbidden: boolean }> {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return { items: [], forbidden: false };
    }

    const params = new URLSearchParams({
      limit: '100',
      sort: '-id',
      fields: [
        'id',
        'status',
        'member_role',
        'business_profile.id',
        'business_profile.company_name',
        'business_profile.is_active',
        'business_profile.plan_code',
        'business_profile.billing_status',
        'department.id',
        'department.name'
      ].join(',')
    });
    params.set('filter[user][_eq]', userId);
    params.set('filter[status][_eq]', 'active');

    try {
      const response = await firstValueFrom(
        this.http.get<{ data?: MembershipRow[] }>(
          `${this.apiUrl()}/items/business_profile_members?${params.toString()}&_ts=${Date.now()}`,
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        )
      );

      const normalized = (response?.data ?? [])
        .map((row) => this.normalizeMembership(row))
        .filter((row): row is SettingsMembership => Boolean(row))
        .sort((left, right) => left.businessProfile.companyName.localeCompare(right.businessProfile.companyName));

      return { items: normalized, forbidden: false };
    } catch (error: any) {
      if (error?.status === 403) {
        return {
          items: [],
          forbidden: true
        };
      }

      throw error;
    }
  }

  private async loadInvitesSafely(): Promise<void> {
    this.invites = [];
    this.invitesError = '';

    if (!this.activeMembership?.businessProfile?.id) {
      return;
    }

    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return;
    }

    const params = new URLSearchParams({
      limit: '50',
      sort: '-sent_at',
      fields: [
        'id',
        'email',
        'member_role',
        'status',
        'sent_at',
        'claimed_at',
        'department.id',
        'department.name',
        'requested_by_user.id',
        'requested_by_user.first_name',
        'requested_by_user.last_name',
        'requested_by_user.email'
      ].join(',')
    });
    params.set('filter[business_profile][_eq]', this.activeMembership.businessProfile.id);

    try {
      const response = await firstValueFrom(
        this.http.get<{ data?: InviteRow[] }>(
          `${this.apiUrl()}/items/request_invites?${params.toString()}&_ts=${Date.now()}`,
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        ).pipe(timeout(9000))
      );
      this.invites = (response?.data ?? [])
        .map((row) => this.normalizeInvite(row))
        .filter((row): row is SettingsInvite => Boolean(row));
    } catch (error: any) {
      console.warn('[Settings] failed request', {
        request: 'request_invites',
        status: error?.status ?? error?.error?.status ?? null,
        code: error?.error?.errors?.[0]?.extensions?.code ?? null
      });
      if (error?.status === 403) {
        this.invitesError = 'Pending invites are not available for your current access.';
        return;
      }
      this.invitesError = 'Could not load pending invites right now.';
    }
  }

  private normalizeInvite(row: InviteRow): SettingsInvite | null {
    const id = this.normalizeId(row?.id);
    if (!id) {
      return null;
    }

    const departmentRecord = this.objectRecord(row?.department);
    const inviterRecord = this.objectRecord(row?.requested_by_user);
    const inviterName = `${this.pickString(inviterRecord?.['first_name']) ?? ''} ${
      this.pickString(inviterRecord?.['last_name']) ?? ''
    }`.trim();
    const inviterEmail = this.pickString(inviterRecord?.['email']);
    const invitedBy = inviterName || inviterEmail || 'Inviter unavailable';

    return {
      id,
      email: this.pickString(row?.email) ?? 'Unavailable',
      role: this.roleBadgeLabel(this.pickString(row?.member_role) ?? 'employee'),
      status: this.pickString(row?.status) ?? 'pending',
      sentAt: this.pickString(row?.sent_at),
      claimedAt: this.pickString(row?.claimed_at),
      departmentName: this.pickString(departmentRecord?.['name']),
      invitedBy
    };
  }

  private normalizeMembership(row: MembershipRow): SettingsMembership | null {
    const id = this.normalizeId(row?.id);
    const businessProfileRecord = this.objectRecord(row?.business_profile);
    const businessProfileId = this.normalizeId(businessProfileRecord?.['id'] ?? row?.business_profile);

    if (!id || !businessProfileId) {
      return null;
    }

    const companyName =
      this.pickString(businessProfileRecord?.['company_name']) ??
      'Workspace';

    const departmentRecord = this.objectRecord(row?.department);
    const departmentId = this.normalizeId(departmentRecord?.['id'] ?? row?.department);
    const departmentName = this.pickString(departmentRecord?.['name']);

    return {
      id,
      status: (this.pickString(row?.status) ?? 'active').toLowerCase(),
      memberRoleRaw: (this.pickString(row?.member_role) ?? 'employee').toLowerCase(),
      businessProfile: {
        id: businessProfileId,
        companyName,
        isActive: businessProfileRecord?.['is_active'] === true,
        planCode: this.pickString(businessProfileRecord?.['plan_code']),
        billingStatus: this.pickString(businessProfileRecord?.['billing_status']),
        dateCreated: null,
        dateUpdated: null
      },
      department: departmentId
        ? {
            id: departmentId,
            name: departmentName ?? 'Department'
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

  private toBackendRole(value: unknown): string {
    const normalized = this.pickString(value)?.toLowerCase() ?? '';
    if (normalized === 'manager' || normalized === 'manger') {
      return 'manager';
    }
    if (normalized === 'owner' || normalized === 'hr' || normalized === 'employee') {
      return normalized;
    }
    return 'employee';
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
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.message ||
      err?.message ||
      fallback
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
