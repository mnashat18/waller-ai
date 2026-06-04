import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, of } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AuthService } from './auth';
import { CompanyContextService } from '../core/context/company-context.service';
import { InviteService } from './invites';
import {
  type WorkspaceApplicationRecord,
  WorkspaceApplicationsService
} from './workspace-applications.service';

export type WorkspaceAccessUser = {
  id: string;
  displayName: string;
  email: string | null;
};

export type WorkspaceAccessWorkspace = {
  id: string;
  companyName: string;
  memberRole: ActiveMemberRole;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
  isOwnerWorkspace: boolean;
};

export type WorkspaceAccessInvite = {
  id: string;
  companyName: string;
  businessProfileId: string | null;
  invitedEmail: string | null;
  memberRole: ActiveMemberRole;
  departmentId: string | null;
  departmentName: string | null;
  status: string;
  token: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  claimedAt: string | null;
  acceptedUserId: string | null;
  rawStatus: string;
};

export type WorkspaceAccessMode =
  | 'loading'
  | 'no-workspace'
  | 'pending-application'
  | 'needs-more-info'
  | 'application-rejected'
  | 'pending-invite'
  | 'multiple-workspaces'
  | 'employee-access'
  | 'restricted'
  | 'ready'
  | 'error';

export type WorkspaceAccessState = {
  loading: boolean;
  error: string | null;
  user: WorkspaceAccessUser | null;
  mode: WorkspaceAccessMode;
  pendingApplication: WorkspaceApplicationRecord | null;
  workspaces: WorkspaceAccessWorkspace[];
  pendingInvites: WorkspaceAccessInvite[];
  selectedInvite: WorkspaceAccessInvite | null;
  activeWorkspaces: WorkspaceAccessWorkspace[];
  employeeWorkspaces: WorkspaceAccessWorkspace[];
  inactiveWorkspaces: WorkspaceAccessWorkspace[];
  hasWorkspace: boolean;
  hasDashboardAccess: boolean;
};

export type WorkspaceActionResult = {
  ok: boolean;
  message: string;
  businessProfileId?: string | null;
  memberRole?: ActiveMemberRole | null;
  departmentId?: string | null;
  membershipId?: string | null;
};

type DirectusUserResponse = {
  id?: string | number | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type WorkspaceProfileRow = {
  id?: string | number | null;
  company_name?: string | null;
  owner_user?: string | number | { id?: string | number | null } | null;
  is_active?: boolean | null;
  plan_code?: string | null;
  billing_status?: string | null;
};

type WorkspaceLookupResult<T> = {
  items: T;
  error: string | null;
  status: number | null;
};

type WorkspaceMembershipRow = {
  id?: string | number | null;
  member_role?: string | null;
  status?: string | null;
  joined_at?: string | null;
  business_profile?:
    | string
    | number
    | {
        id?: string | number | null;
        company_name?: string | null;
        owner_user?: string | number | { id?: string | number | null } | null;
        is_active?: boolean | null;
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

type WorkspaceInviteRow = {
  id?: string | number | null;
  email?: string | null;
  business_profile?:
    | string
    | number
    | {
        id?: string | number | null;
        company_name?: string | null;
      }
    | null;
  member_role?: string | null;
  department?:
    | string
    | number
    | {
        id?: string | number | null;
        name?: string | null;
      }
    | null;
  status?: string | null;
  token?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  claimed_at?: string | null;
  accepted_user?:
    | string
    | number
    | {
        id?: string | number | null;
      }
    | null;
};

@Injectable({ providedIn: 'root' })
export class WorkspaceAccessService {
  private readonly api = environment.API_URL;
  private readonly requestTimeoutMs = 15000;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companyContext: CompanyContextService,
    private invites: InviteService,
    private workspaceApplications: WorkspaceApplicationsService
  ) {}

  loadWorkspaceAccess(forceRefresh = false): Observable<WorkspaceAccessState> {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return of(this.buildErrorState('Please sign in first.'));
    }

    return this.auth.getCurrentUser(token, { hydrateWorkspace: false }).pipe(
      switchMap((user) => {
        const userId = this.normalizeId(user?.id);
        const email = this.pickString(user?.email);

        if (!userId) {
          return of(this.buildErrorState('We could not load your workspace access.'));
        }


        const baseUser = {
          id: userId,
          displayName: this.buildDisplayName(user),
          email
        };

        return this.queryMemberships(userId, token, forceRefresh).pipe(
          switchMap((membershipResult) => {

            if (membershipResult.error) {
              return of(this.buildErrorState(membershipResult.error));
            }

            const memberships = membershipResult.items;
            const initialState = this.buildState(baseUser, memberships, [], []);

            if (initialState.activeWorkspaces.length > 0) {
              return of(initialState);
            }

            this.companyContext.clearActiveWorkspaceContext();

            return this.queryOwnedProfiles(userId, token).pipe(
              switchMap((ownedResult) => {

                if (ownedResult.error) {
                  return of(this.buildErrorState(ownedResult.error));
                }

                const ownedProfiles = ownedResult.items;
                const activeOwnedProfiles = ownedProfiles.filter((profile) => profile.is_active === true);
                const createOwnedMemberships = activeOwnedProfiles.filter((profile) =>
                  !memberships.some((membership) => {
                    const workspace = this.normalizeWorkspaceFromMembership(membership);
                    return workspace?.id === this.normalizeId(profile.id);
                  })
                );

                const normalizeOwnedMemberships$ = createOwnedMemberships.length
                  ? forkJoin(
                      createOwnedMemberships.map((profile) =>
                        this.upsertMembership(
                          this.normalizeId(profile.id) ?? '',
                          userId,
                          'owner',
                          null,
                          token
                        )
                      )
                    )
                  : of([]);

                return normalizeOwnedMemberships$.pipe(
                  switchMap(() => this.queryMemberships(userId, token, true)),
                  switchMap((updatedMembershipResult) => {

                    if (updatedMembershipResult.error) {
                      return of(this.buildErrorState(updatedMembershipResult.error));
                    }

                    const updatedMemberships = updatedMembershipResult.items;
                    const membershipState = this.buildState(baseUser, updatedMemberships, [], []);

                    if (membershipState.activeWorkspaces.length > 0) {
                      return of(membershipState);
                    }

                    return forkJoin({
                      invites: this.queryInvites(userId, email, token, forceRefresh),
                      applications: from(this.workspaceApplications.getMyApplications(userId, token))
                    }).pipe(
                      map(({ invites, applications }) => {
                        const state = this.buildState(baseUser, updatedMemberships, invites, applications);
                        return state;
                      })
                    );
                  })
                );
              })
            );
          }),
          catchError((error) =>
            of(this.buildErrorState(this.toFriendlyError(error, 'We could not load your workspace access.')))
          )
        );
      }),
      timeout(this.requestTimeoutMs),
      catchError((error) => of(this.buildErrorState(this.toFriendlyError(error, 'We could not load your workspace access.'))))
    );
  }

  openWorkspace(workspace: WorkspaceAccessWorkspace): Observable<WorkspaceActionResult> {
    return this.companyContext.activateWorkspace(workspace.id, workspace.memberRole, workspace.departmentId).pipe(
      map(() => ({
        ok: true,
        message: 'Workspace opened.'
      })),
      catchError((error) =>
        of({
          ok: false,
          message: this.toFriendlyError(error, 'We could not open that workspace.')
        })
      )
    );
  }

  acceptInvite(invite: WorkspaceAccessInvite): Observable<WorkspaceActionResult> {
    if (!invite.token?.trim()) {
      return of({ ok: false, message: 'Invite token is missing.' });
    }

    if (!this.auth.getStoredAccessToken()) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    return this.claimInviteByToken(invite.token);
  }

  declineInvite(inviteId: string): Observable<WorkspaceActionResult> {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    return this.http.patch(
      `${this.api}/items/request_invites/${encodeURIComponent(inviteId)}`,
      {
        status: 'declined'
      },
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map(() => ({
        ok: true,
        message: 'Invite declined.'
      })),
      catchError((error) =>
        of({
          ok: false,
          message: this.toFriendlyError(error, 'We could not update the invite right now.')
        })
      )
    );
  }

  claimInviteByToken(inviteToken: string): Observable<WorkspaceActionResult> {
    const normalizedToken = inviteToken.trim();

    if (!this.auth.getStoredAccessToken()) {
      return of({ ok: false, message: 'Please sign in first.' });
    }
    if (!normalizedToken) {
      return of({ ok: false, message: 'Please enter an invite code.' });
    }

    return this.invites.claimInvite(normalizedToken).pipe(
      map((response) => ({
        ok: response.ok,
        message: 'Invite accepted.',
        businessProfileId: response.businessProfileId,
        departmentId: response.departmentId,
        memberRole: this.normalizeRole(response.memberRole) ?? 'employee',
        membershipId: response.membershipId
      })),
      catchError((error) =>
        of({
          ok: false,
          message: this.invites.getReadableInviteError(error)
        })
      )
    );
  }

  refreshWorkspaceContext(): Observable<void> {
    return this.companyContext.ensureLoaded(true).pipe(map(() => void 0));
  }

  private queryMemberships(userId: string, token: string, forceRefresh: boolean): Observable<WorkspaceLookupResult<WorkspaceMembershipRow[]>> {
    const params = new URLSearchParams({
      limit: '100',
      sort: '-id',
      fields: [
        'id',
        'member_role',
        'status',
        'joined_at',
        'business_profile.id',
        'business_profile.company_name',
        'business_profile.is_active',
        'business_profile.plan_code',
        'business_profile.billing_status',
        'department'
      ].join(',')
    });
    params.set('filter[user][_eq]', userId);

    return this.http.get<{ data?: WorkspaceMembershipRow[] }>(
      `${this.api}/items/business_profile_members?${params.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => ({
        items: response.data ?? [],
        error: null,
        status: null
      })),
      catchError((error) =>
        of({
          items: [] as WorkspaceMembershipRow[],
          error: this.toFriendlyError(error, 'We could not verify your workspace memberships.'),
          status: typeof error?.status === 'number' ? error.status : null
        })
      )
    );
  }

  private queryOwnedProfiles(userId: string, token: string): Observable<WorkspaceLookupResult<WorkspaceProfileRow[]>> {
    const params = new URLSearchParams({
      limit: '50',
      sort: '-id',
      fields: [
        'id',
        'company_name',
        'is_active',
        'plan_code',
        'billing_status',
        'owner_user'
      ].join(',')
    });
    params.set('filter[owner_user][_eq]', userId);

    return this.http.get<{ data?: WorkspaceProfileRow[] }>(
      `${this.api}/items/business_profiles?${params.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => ({
        items: response.data ?? [],
        error: null,
        status: null
      })),
      catchError((error) =>
        of({
          items: [] as WorkspaceProfileRow[],
          error: this.toFriendlyError(error, 'We could not verify your owned workspace profiles.'),
          status: typeof error?.status === 'number' ? error.status : null
        })
      )
    );
  }

  private queryInvites(
    userId: string,
    email: string | null,
    token: string,
    forceRefresh: boolean
  ): Observable<WorkspaceInviteRow[]> {
    const emailParams = new URLSearchParams({
      limit: '50',
      sort: '-sent_at',
      fields: [
        'id',
        'email',
        'business_profile.id',
        'business_profile.company_name',
        'member_role',
        'department',
        'status',
        'token',
        'sent_at',
        'expires_at',
        'claimed_at',
        'accepted_user',
        'invite_type'
      ].join(',')
    });

    if (email) {
      emailParams.set('filter[email][_eq]', email);
      emailParams.set('filter[status][_in]', 'pending,sent');
    } else {
      emailParams.set('filter[id][_eq]', '__none__');
    }

    const byEmail$ = this.http.get<{ data?: WorkspaceInviteRow[] }>(
      `${this.api}/items/request_invites?${emailParams.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => response.data ?? []),
      catchError(() => of([]))
    );
    return byEmail$;
  }

  private upsertMembership(
    profileId: string,
    userId: string,
    role: ActiveMemberRole,
    departmentId: string | null,
    token: string
  ): Observable<unknown> {
    const lookup = new URLSearchParams({
      limit: '1',
      sort: '-id',
      fields: 'id,member_role,status,business_profile,user,department'
    });
    lookup.set('filter[business_profile][_eq]', profileId);
    lookup.set('filter[user][_eq]', userId);

    return this.http.get<{ data?: Array<{ id?: string | number | null }> }>(
      `${this.api}/items/business_profile_members?${lookup.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      switchMap((response) => {
        const existingId = this.normalizeId(response?.data?.[0]?.id);
        const payload: Record<string, unknown> = {
          business_profile: profileId,
          user: userId,
          member_role: this.toBackendRole(role),
          status: 'active',
          joined_at: new Date().toISOString(),
          department: departmentId ?? null
        };

        if (existingId) {
          return this.http.patch(
            `${this.api}/items/business_profile_members/${encodeURIComponent(existingId)}`,
            payload,
            {
              headers: this.auth.getAuthHeaders(token),
              withCredentials: true
            }
          );
        }

        return this.http.post(
          `${this.api}/items/business_profile_members`,
          payload,
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        );
      })
    );
  }

  private buildState(
    user: WorkspaceAccessUser,
    memberships: WorkspaceMembershipRow[],
    invites: WorkspaceInviteRow[],
    applications: WorkspaceApplicationRecord[]
  ): WorkspaceAccessState {
    const membershipByProfile = new Map<string, WorkspaceAccessWorkspace>();
    const normalizedInvites = invites
      .map((invite) => this.normalizeInvite(invite))
      .filter((invite): invite is WorkspaceAccessInvite => Boolean(invite.id));
    const pendingInvites = normalizedInvites.filter((invite) => this.isPendingInvite(invite.rawStatus));
    const selectedInvite = pendingInvites[0] ?? null;
    const pendingApplication = applications[0] ?? null;

    for (const row of memberships ?? []) {
      const workspace = this.normalizeWorkspaceFromMembership(row);
      if (!workspace) {
        continue;
      }
      membershipByProfile.set(workspace.id, workspace);
    }

    const workspaces = Array.from(membershipByProfile.values()).sort((left, right) =>
      left.companyName.localeCompare(right.companyName)
    );
    const activeWorkspaces = workspaces.filter((item) => item.isActive);
    const employeeWorkspaces = activeWorkspaces.filter((item) => item.memberRole === 'employee');
    const dashboardWorkspaces = activeWorkspaces.filter((item) => item.memberRole !== 'employee');
    const inactiveWorkspaces = workspaces.filter((item) => !item.isActive);
    const hasWorkspace = workspaces.length > 0;
    const hasDashboardAccess = dashboardWorkspaces.length > 0;
    const applicationStatus = (pendingApplication?.status ?? '').toString().trim().toLowerCase();

    let mode: WorkspaceAccessMode = 'no-workspace';
    if (inactiveWorkspaces.length && !activeWorkspaces.length) {
      mode = 'restricted';
    } else if (activeWorkspaces.length > 1) {
      mode = 'multiple-workspaces';
    } else if (dashboardWorkspaces.length === 1) {
      mode = 'ready';
    } else if (employeeWorkspaces.length === 1 && dashboardWorkspaces.length === 0) {
      mode = 'employee-access';
    } else if (applicationStatus === 'pending_review') {
      mode = 'pending-application';
    } else if (applicationStatus === 'needs_more_info') {
      mode = 'needs-more-info';
    } else if (applicationStatus === 'rejected') {
      mode = 'application-rejected';
    } else if (pendingInvites.length) {
      mode = 'pending-invite';
    }

    return {
      loading: false,
      error: null,
      user,
      mode,
      pendingApplication,
      workspaces,
      pendingInvites,
      selectedInvite,
      activeWorkspaces,
      employeeWorkspaces,
      inactiveWorkspaces,
      hasWorkspace,
      hasDashboardAccess
    };
  }

  private normalizeWorkspaceFromMembership(row: WorkspaceMembershipRow): WorkspaceAccessWorkspace | null {
    const profile = this.objectRecord(row.business_profile);
    const profileId = this.normalizeId(profile?.['id'] ?? row.business_profile);
    if (!profileId) {
      return null;
    }

    const role = this.normalizeRole(row.member_role) ?? 'employee';
    const status = this.pickString(row.status) ?? 'active';
    const department = this.objectRecord(row.department);
    const isOwnerWorkspace = role === 'owner';

    return {
      id: profileId,
      companyName: this.pickString(profile?.['company_name']) ?? `Workspace ${profileId}`,
      memberRole: role,
      status,
      departmentId: this.normalizeId(department?.['id'] ?? row.department),
      departmentName: this.pickString(department?.['name']) ?? null,
      isActive: this.isMembershipActive(status) && profile?.['is_active'] === true,
      isOwnerWorkspace
    };
  }

  private normalizeInvite(row: WorkspaceInviteRow): WorkspaceAccessInvite {
    const profile = this.objectRecord(row.business_profile);
    const department = this.objectRecord(row.department);
    return {
      id: this.normalizeId(row.id) ?? '',
      companyName: this.pickString(profile?.['company_name']) ?? 'Workspace invitation',
      businessProfileId: this.normalizeId(profile?.['id'] ?? row.business_profile),
      invitedEmail: this.pickString(row.email),
      memberRole: this.normalizeRole(row.member_role) ?? 'employee',
      departmentId: this.normalizeId(department?.['id'] ?? row.department),
      departmentName: this.pickString(department?.['name']) ?? null,
      status: this.pickString(row.status) ?? 'pending',
      token: this.pickString(row.token),
      sentAt: this.pickString(row.sent_at),
      expiresAt: this.pickString(row.expires_at),
      claimedAt: this.pickString(row.claimed_at),
      acceptedUserId: this.normalizeId(row.accepted_user),
      rawStatus: this.pickString(row.status) ?? 'pending'
    };
  }

  private buildErrorState(message: string): WorkspaceAccessState {
    return {
      loading: false,
      error: message,
      user: null,
      mode: 'error',
      pendingApplication: null,
      workspaces: [],
      pendingInvites: [],
      selectedInvite: null,
      activeWorkspaces: [],
      employeeWorkspaces: [],
      inactiveWorkspaces: [],
      hasWorkspace: false,
      hasDashboardAccess: false
    };
  }

  private buildDisplayName(user: DirectusUserResponse | null): string {
    const first = this.pickString(user?.first_name);
    const last = this.pickString(user?.last_name);
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    return fullName || this.pickString(user?.email) || 'User';
  }

  private normalizeRole(value: unknown): ActiveMemberRole | null {
    const raw = this.pickString(value)?.toLowerCase() ?? '';
    if (raw === 'owner') return 'owner';
    if (raw === 'hr' || raw === 'admin') return 'hr';
    if (raw === 'manager' || raw === 'manger') return 'manager';
    if (raw === 'employee' || raw === 'member' || raw === 'viewer') return 'employee';
    return null;
  }

  private toBackendRole(value: ActiveMemberRole): string {
    return value;
  }

  private isMembershipActive(status: string): boolean {
    const normalized = status.trim().toLowerCase();
    return !normalized || normalized === 'active' || normalized === 'enabled' || normalized === 'current';
  }

  private isPendingInvite(status: string): boolean {
    const normalized = status.trim().toLowerCase();
    return normalized === 'pending' || normalized === 'sent' || normalized === 'invited';
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
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private toFriendlyError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.message ||
      err?.message ||
      '';

    if (status === 401 || status === 403) {
      return 'We could not verify your workspace access.';
    }
    return detail || fallback;
  }
}
