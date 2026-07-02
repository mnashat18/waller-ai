import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';

import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AuthService } from './auth';
import { CompanyContextService } from '../core/context/company-context.service';
import { InviteService } from './invites';
import {
  type WorkspaceApplicationRecord,
  WorkspaceApplicationsService
} from './workspace-applications.service';
import {
  WorkspaceContextApiService,
  type WorkspaceContextInvitation,
  type WorkspaceContextMembership
} from './workspace-context-api.service';

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
  expiresAt: string | null;
  rawStatus: string;
};

export type WorkspaceAccessMode =
  | 'loading'
  | 'no-workspace'
  | 'pending-application'
  | 'needs-more-info'
  | 'application-rejected'
  | 'application-approved'
  | 'application-closed'
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
  expires_at?: string | null;
};

@Injectable({ providedIn: 'root' })
export class WorkspaceAccessService {
  private readonly requestTimeoutMs = 15000;

  constructor(
    private auth: AuthService,
    private companyContext: CompanyContextService,
    private invites: InviteService,
    private workspaceApplications: WorkspaceApplicationsService,
    private workspaceContextApi: WorkspaceContextApiService
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

        return this.workspaceContextApi.getContext().pipe(
          switchMap((workspaceContext) => {
            const memberships = this.mapWorkspaceMemberships(workspaceContext.memberships);
            const invites = this.mapWorkspaceInvitations(workspaceContext.invitations, email);
            const initialState = this.buildState(baseUser, memberships, invites, []);

            if (initialState.activeWorkspaces.length > 0) {
              return of(initialState);
            }

            this.companyContext.clearActiveWorkspaceContext();

            return from(this.workspaceApplications.getMyApplications(userId, token)).pipe(
              map((applications) => this.buildState(baseUser, memberships, invites, applications))
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
    return this.invites.acceptInvite(invite.id).pipe(
      map((response) => ({
        ok: response.ok,
        message: response.message,
        businessProfileId: response.businessProfileId,
        memberRole: this.normalizeRole(response.memberRole) ?? invite.memberRole,
        departmentId: response.departmentId,
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

  declineInvite(inviteId: string): Observable<WorkspaceActionResult> {
    return this.invites.declineInvite(inviteId).pipe(
      map((response) => ({
        ok: response.ok,
        message: response.message,
        businessProfileId: response.businessProfileId,
        memberRole: this.normalizeRole(response.memberRole) ?? null,
        departmentId: response.departmentId,
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
    return from(this.companyContext.ensureVerifiedWorkspaceContext(true)).pipe(map(() => void 0));
  }

  private mapWorkspaceMemberships(memberships: WorkspaceContextMembership[]): WorkspaceMembershipRow[] {
    return (memberships ?? []).map((membership) => ({
      id: membership.id,
      member_role: membership.memberRole,
      status: membership.status,
      joined_at: null,
      business_profile: {
        id: membership.workspace.id,
        company_name: membership.workspace.companyName,
        is_active: membership.workspace.isActive
      },
      department: membership.department
    }));
  }

  private mapWorkspaceInvitations(
    invitations: WorkspaceContextInvitation[],
    email: string | null
  ): WorkspaceInviteRow[] {
    void email;
    return (invitations ?? []).map((invite) => ({
      id: invite.id,
      email: invite.email,
      business_profile: null,
      member_role: invite.memberRole,
      department: invite.department,
      status: invite.status,
      expires_at: null
    }));
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
    } else if (pendingInvites.length) {
      // A pending invite is always actionable and must not be hidden behind an
      // existing application. Declining the invite lets any application below
      // resurface on the next load.
      mode = 'pending-invite';
    } else if (applicationStatus === 'pending_review') {
      mode = 'pending-application';
    } else if (applicationStatus === 'needs_more_info') {
      mode = 'needs-more-info';
    } else if (applicationStatus === 'rejected') {
      mode = 'application-rejected';
    } else if (applicationStatus === 'approved') {
      mode = 'application-approved';
    } else if (applicationStatus === 'closed') {
      mode = 'application-closed';
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
      expiresAt: this.pickString(row.expires_at),
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
