import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, forkJoin, from, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

import { type ActiveMemberRole } from '../../ia/wellar-ia';
import { AuthService } from '../../services/auth';
import {
  WorkspaceContextApiError,
  WorkspaceContextApiService,
  type WorkspaceContextDepartment,
  type WorkspaceContextPayload,
  type WorkspaceContextMembership,
  type WorkspaceContextWorkspace
} from '../../services/workspace-context-api.service';

export type CompanyOption = {
  id: string;
  membershipId: string;
  name: string;
  role: ActiveMemberRole;
  membershipStatus: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  isActive: boolean;
};

export type CompanyContext = {
  currentUser: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  userId: string | null;
  userDisplayName: string;
  userEmail: string | null;
  isAuthenticated: boolean;
  authInitialized: boolean;
  workspaceInitialized: boolean;
  activeBusinessProfileId: string | null;
  activeBusinessProfileName: string | null;
  activeDepartmentId: string | null;
  activeDepartmentName: string | null;
  activeMemberRole: ActiveMemberRole | null;
  availableCompanies: CompanyOption[];
  hubReason: string | null;
};

export type ActiveMembershipContext = {
  id: string;
  status: string;
  member_role: string;
  user?: string | {
    id?: string | number;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  business_profile: string | {
    id?: string | number;
    company_name?: string | null;
    is_active?: boolean | null;
  } | null;
  department?: string | {
    id?: string | number;
    name?: string | null;
  } | null;
  joined_at?: string | null;
};

type BusinessProfileRecord = {
  id: string;
  company_name?: string | null;
  is_active?: boolean | null;
  plan_code?: string | null;
  billing_status?: string | null;
  timezone?: string | null;
  default_language?: string | null;
};

type ActiveMembershipInput = {
  id?: string | number | null;
  member_role?: string | null;
  status?: string | null;
  user?: ActiveMembershipContext['user'];
  business_profile?: ActiveMembershipContext['business_profile'];
  department?: ActiveMembershipContext['department'];
  joined_at?: string | null;
};

export type CompanyContextState = {
  loading: boolean;
  error: string | null;
  context: CompanyContext;
};

type UserContextResponse = {
  currentUser: CompanyContext['currentUser'];
  userId: string | null;
  userDisplayName: string;
  userEmail: string | null;
  isAuthenticated: boolean;
  authInitialized: boolean;
  activeBusinessProfileId: string | null;
  activeBusinessProfileName: string | null;
  activeDepartmentId: string | null;
  activeDepartmentName: string | null;
  activeMemberRole: ActiveMemberRole | null;
  activeCompanyName?: string | null;
};

type BusinessProfileRow = {
  id?: string | number;
  company_name?: string | null;
  is_active?: boolean | null;
  plan_code?: string | null;
  billing_status?: string | null;
  timezone?: string | null;
  default_language?: string | null;
};

type MembershipRow = {
  id?: string | number;
  member_role?: string | null;
  status?: string | null;
  business_profile?: {
    id?: string | number;
    company_name?: string | null;
  } | string | number | null;
};

const INITIAL_CONTEXT: CompanyContext = {
  currentUser: null,
  userId: null,
  userDisplayName: '',
  userEmail: null,
  isAuthenticated: false,
  authInitialized: false,
  workspaceInitialized: false,
  activeBusinessProfileId: null,
  activeBusinessProfileName: null,
  activeDepartmentId: null,
  activeDepartmentName: null,
  activeMemberRole: null,
  availableCompanies: [],
  hubReason: null
};

const INITIAL_STATE: CompanyContextState = {
  loading: false,
  error: null,
  context: INITIAL_CONTEXT
};

const ACTIVE_MEMBERSHIP_STORAGE_KEY = 'active_workspace_membership_v1';
type RefreshOptions = { force?: boolean; failOnError?: boolean };

type VerifiedWorkspaceContext = {
  activeMembership: ActiveMembershipContext;
  activeBusinessProfile: BusinessProfileRecord;
  activeDepartment: WorkspaceContextDepartment | null;
  activeMemberRole: ActiveMemberRole;
};

@Injectable({ providedIn: 'root' })
export class CompanyContextService {
  private readonly api = environment.API_URL;
  private readonly stateSubject = new BehaviorSubject<CompanyContextState>(INITIAL_STATE);
  private readonly activeMembershipSubject = new BehaviorSubject<ActiveMembershipContext | null>(this.readStoredMembership());
  private readonly activeBusinessProfileSubject = new BehaviorSubject<BusinessProfileRecord | null>(this.readStoredBusinessProfile());
  private readonly activeMemberRoleSubject = new BehaviorSubject<ActiveMemberRole | null>(
    this.normalizeUiRole(this.readStoredValue('active_member_role'))
  );
  private inFlight$: Observable<CompanyContextState> | null = null;
  private verifiedWorkspaceContext: VerifiedWorkspaceContext | null = null;
  private verifiedWorkspaceContextInFlight: Promise<VerifiedWorkspaceContext | null> | null = null;

  readonly state$ = this.stateSubject.asObservable();
  readonly context$ = this.state$.pipe(map((state) => state.context));
  readonly activeMembership$ = this.activeMembershipSubject.asObservable();
  readonly activeBusinessProfile$ = this.activeBusinessProfileSubject.asObservable();
  readonly activeMemberRole$ = this.activeMemberRoleSubject.asObservable();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private workspaceContextApi: WorkspaceContextApiService
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('wellar-auth-state-reset', this.onAuthStateReset);
    }
  }

  async initializeAppContext(forceRefresh = false): Promise<CompanyContextState> {
    await this.initializeAuthContext(forceRefresh);
    await this.initializeWorkspaceContext(forceRefresh);
    return this.snapshot();
  }

  async refreshCurrentUser(options: RefreshOptions = {}): Promise<void> {
    const forceRefresh = options.force ?? true;
    await this.initializeAuthContext(forceRefresh);
    const token = this.auth.getStoredAccessToken() ?? '';
    if (!token) {
      return;
    }

    await firstValueFrom(this.ensureLoaded(forceRefresh));
  }

  async refreshWorkspaceContext(options: RefreshOptions = {}): Promise<void> {
    const forceRefresh = options.force ?? true;
    await this.ensureVerifiedWorkspaceContext(forceRefresh, options.failOnError ?? false);
  }

  async ensureVerifiedWorkspaceContext(forceRefresh = false, failOnError = false): Promise<VerifiedWorkspaceContext | null> {
    const current = this.verifiedWorkspaceContext;
    if (!forceRefresh && current) {
      return current;
    }

    if (!forceRefresh && this.verifiedWorkspaceContextInFlight) {
      return this.verifiedWorkspaceContextInFlight;
    }

    const run = async (): Promise<VerifiedWorkspaceContext | null> => {
      const token = this.auth.getStoredAccessToken() ?? '';
      if (!token) {
        this.verifiedWorkspaceContext = null;
        this.clearActiveWorkspaceContext();
        return null;
      }

      try {
        const response = await firstValueFrom(this.workspaceContextApi.getContext().pipe(timeout(10000)));
        const active = response.active;
        if (!active?.workspace?.id || !active?.membership?.id || !active.membership.memberRole) {
          this.verifiedWorkspaceContext = null;
          this.clearActiveWorkspaceContext();
          return null;
        }

        const workspace = this.normalizeBusinessProfileFromWorkspace(active.workspace);
        const membership = this.normalizeVerifiedMembership(active, workspace);
        this.applyVerifiedWorkspaceContext(membership, workspace, active.department ?? null);
        return this.verifiedWorkspaceContext;
      } catch (error) {
        if (error instanceof WorkspaceContextApiError) {
          if (error.code === 'unauthorized') {
            this.auth.clearAuthState();
            this.clearActiveWorkspaceContext();
            this.stateSubject.next(this.buildSignedOutState(true, true));
            return null;
          }
          if (error.code === 'forbidden' || error.code === 'not_found' || error.code === 'conflict') {
            this.verifiedWorkspaceContext = null;
            this.clearActiveWorkspaceContext();
            if (failOnError) {
              throw error;
            }
            return null;
          }
        }

        if (failOnError) {
          throw error;
        }

        this.verifiedWorkspaceContext = null;
        this.clearActiveWorkspaceContext();
        return null;
      }
    };

    const promise = run().finally(() => {
      this.verifiedWorkspaceContextInFlight = null;
    });

    this.verifiedWorkspaceContextInFlight = promise;
    return promise;
  }

  async refreshMemberships(options: RefreshOptions = {}): Promise<ActiveMembershipContext[]> {
    const forceRefresh = options.force ?? true;
    await this.initializeAuthContext(forceRefresh);

    const user = await this.auth.getCurrentUserAfterRestore();
    const userId = this.normalizeId(user?.id);
    const token = this.auth.getStoredAccessToken() ?? '';

    if (!userId || !token) {
      this.clearActiveWorkspaceContext();
      return [];
    }

    let memberships: ActiveMembershipContext[] = [];
    try {
      memberships = await this.fetchActiveMembershipsForUser(userId, token);
    } catch (error) {
      if (options.failOnError) {
        throw error;
      }
      return [];
    }

    if (!memberships.length) {
      this.clearActiveWorkspaceContext();
      return [];
    }

    const preferredMembership = this.pickPreferredActiveMembership(memberships);
    if (preferredMembership) {
      await this.activateFromMembership(preferredMembership as ActiveMembershipInput);
    }

    return memberships;
  }

  async activateClaimedMembershipForCurrentUser(businessProfileId: string | null): Promise<ActiveMembershipContext | null> {
    const profileId = this.normalizeId(businessProfileId);
    const user = await this.auth.getCurrentUserAfterRestore();
    const userId = this.normalizeId(user?.id);
    const token = this.auth.getStoredAccessToken() ?? '';

    if (!profileId || !userId || !token) {
      return null;
    }

    const memberships = await this.fetchActiveMembershipsForUser(userId, token);
    const claimedMembership =
      memberships.find((membership) =>
        this.normalizeId(membership.business_profile) === profileId &&
        this.normalizeId(membership.user) === userId &&
        String(membership.status ?? '').trim().toLowerCase() === 'active'
      ) ?? null;

    if (!claimedMembership) {
      return null;
    }

    await firstValueFrom(this.workspaceContextApi.switchMembership(String(claimedMembership.id)));
    await this.activateFromMembership(claimedMembership as ActiveMembershipInput);
    await firstValueFrom(this.ensureLoaded(true));
    await this.ensureVerifiedWorkspaceContext(true, true);

    const activeMembership = this.activeMembershipSubject.value;
    if (
      activeMembership?.id &&
      this.normalizeId(activeMembership.business_profile) === profileId &&
      this.normalizeId(activeMembership.user) === userId
    ) {
      return activeMembership;
    }

    await this.activateFromMembership(claimedMembership as ActiveMembershipInput);
    return this.activeMembershipSubject.value;
  }

  async initializeAuthContext(forceRefresh = false): Promise<void> {
    const current = this.snapshot();
    if (!forceRefresh && current.context.authInitialized) {
      return;
    }

    this.stateSubject.next({
      ...current,
      loading: true,
      error: null,
      context: {
        ...current.context,
        authInitialized: false,
        workspaceInitialized: false
      }
    });

    try {
      const user = await this.auth.getCurrentUserAfterRestore();
      if (!user?.id) {
        this.clearActiveWorkspaceContext();
        this.stateSubject.next(this.buildSignedOutState(true, true));
        return;
      }

      const storedContext = this.readStoredContext();
      const snapshotContext = this.snapshot().context;
      const currentUserId = this.normalizeId(user?.id);
      if (!currentUserId) {
        this.clearActiveWorkspaceContext();
        this.stateSubject.next(this.buildSignedOutState(true, true));
        return;
      }

      const resolvedEmail =
        this.pickString(user?.email) ??
        this.pickString(snapshotContext.currentUser?.email) ??
        this.pickString(snapshotContext.userEmail) ??
        this.pickString(storedContext.currentUser?.email) ??
        this.pickString(storedContext.userEmail) ??
        this.readStoredValue('user_email');
      const resolvedFirstName =
        this.pickString(user?.first_name) ??
        this.pickString(snapshotContext.currentUser?.first_name) ??
        this.pickString(storedContext.currentUser?.first_name) ??
        this.readStoredValue('user_first_name');
      const resolvedLastName =
        this.pickString(user?.last_name) ??
        this.pickString(snapshotContext.currentUser?.last_name) ??
        this.pickString(storedContext.currentUser?.last_name) ??
        this.readStoredValue('user_last_name');
      const currentUser = {
        id: currentUserId,
        email: resolvedEmail,
        first_name: resolvedFirstName,
        last_name: resolvedLastName
      };
      const nextContext: CompanyContext = {
        ...this.snapshot().context,
        currentUser,
        userId: currentUser.id,
        userDisplayName: this.buildDisplayName(resolvedFirstName, resolvedLastName, resolvedEmail),
        userEmail: resolvedEmail,
        isAuthenticated: true,
        authInitialized: true,
        workspaceInitialized: false
      };
      this.persistStoredContext(nextContext);
      this.stateSubject.next({
        ...this.snapshot(),
        loading: false,
        error: null,
        context: nextContext
      });
    } catch (error) {
      if (this.isUnauthorizedError(error)) {
        this.auth.clearAuthState();
        this.clearActiveWorkspaceContext();
        this.stateSubject.next(this.buildSignedOutState(true, true));
        return;
      }

      this.stateSubject.next({
        ...this.snapshot(),
        loading: false,
        error: this.describeError(error, 'Failed to restore session.'),
        context: {
          ...this.snapshot().context,
          authInitialized: true,
          workspaceInitialized: true,
          isAuthenticated: false,
          currentUser: null,
          userId: null,
          userDisplayName: '',
          userEmail: null
        }
      });
    }
  }

  async initializeWorkspaceContext(forceRefresh = false): Promise<void> {
    await this.initializeAuthContext(forceRefresh);
    const state = this.snapshot();
    if (state.context.workspaceInitialized && !forceRefresh) {
      return;
    }

    if (!state.context.isAuthenticated || !state.context.currentUser?.id) {
      this.stateSubject.next({
        ...state,
        loading: false,
        error: null,
        context: {
          ...state.context,
          workspaceInitialized: true
        }
      });
      return;
    }

    this.stateSubject.next({
      ...state,
      loading: true,
      error: null,
      context: {
        ...state.context,
        workspaceInitialized: false
      }
    });

    try {
      await this.ensureActiveContext();
      await firstValueFrom(this.ensureLoaded(forceRefresh));
    } catch (error) {
      if (this.isUnauthorizedError(error)) {
        this.auth.clearAuthState();
        this.clearActiveWorkspaceContext();
        this.stateSubject.next(this.buildSignedOutState(true, true));
        return;
      }

      this.stateSubject.next({
        ...this.snapshot(),
        loading: false,
        error: this.describeError(error, 'Failed to initialize workspace context.'),
        context: {
          ...this.snapshot().context,
          workspaceInitialized: true
        }
      });
      return;
    }

    this.stateSubject.next({
      ...this.snapshot(),
      loading: false,
      error: null,
      context: {
        ...this.snapshot().context,
        workspaceInitialized: true
      }
    });
  }

  clearActiveWorkspaceContext(): void {
    const current = this.snapshot();
    const isAuthenticated = current.context.isAuthenticated || this.auth.isLoggedIn();

    this.activeMembershipSubject.next(null);
    this.activeBusinessProfileSubject.next(null);
    this.activeMemberRoleSubject.next(null);
    this.verifiedWorkspaceContext = null;
    this.stateSubject.next({
      loading: false,
      error: null,
      context: {
        ...INITIAL_CONTEXT,
        currentUser: isAuthenticated ? current.context.currentUser : null,
        userId: isAuthenticated ? current.context.userId : null,
        userDisplayName: isAuthenticated ? current.context.userDisplayName : '',
        userEmail: isAuthenticated ? current.context.userEmail : null,
        isAuthenticated,
        authInitialized: current.context.authInitialized || !isAuthenticated,
        workspaceInitialized: current.context.workspaceInitialized
      }
    });

    this.persistStoredValue('active_member_id', null);
    this.persistStoredValue('active_business_profile_id', null);
    this.persistStoredValue('active_business_profile', null);
    this.persistStoredValue('active_business_profile_name', null);
    this.persistStoredValue('active_member_role', null);
    this.persistStoredValue('active_workspace', null);
    this.persistStoredValue('active_company', null);
    this.persistStoredValue('active_department', null);
    this.persistStoredValue('active_department_name', null);
    this.persistStoredValue('active_workspace_membership_user_id', null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACTIVE_MEMBERSHIP_STORAGE_KEY);
    }

  }

  snapshot(): CompanyContextState {
    return this.stateSubject.value;
  }

  setActiveMembership(membership: ActiveMembershipContext | null): void {
    this.persistStoredMembership(membership);
    this.activeMembershipSubject.next(membership);
    if (membership?.business_profile) {
      this.activeBusinessProfileSubject.next(this.normalizeBusinessProfile(membership.business_profile));
    }
    if (membership?.member_role) {
      this.activeMemberRoleSubject.next(this.normalizeUiRole(membership.member_role));
    }
    const normalizedProfile = this.normalizeBusinessProfile(membership?.business_profile);
    this.persistStoredValue('active_business_profile_id', normalizedProfile?.id);
    this.persistStoredValue('active_business_profile', normalizedProfile?.id);
    this.persistStoredValue('active_business_profile_name', normalizedProfile?.company_name);
    this.persistStoredValue('active_company', normalizedProfile?.company_name);
    this.persistStoredValue('active_workspace', normalizedProfile?.id);
    this.persistStoredValue('active_workspace_membership_user_id', this.normalizeId(membership?.user));
    this.syncActiveContextState();
  }

  getActiveMembership(): ActiveMembershipContext | null {
    return this.activeMembershipSubject.value ?? this.readStoredMembership();
  }

  setActiveBusinessProfile(profile: ActiveMembershipContext['business_profile']): void {
    const normalized = this.normalizeBusinessProfile(profile);
    const profileId = this.normalizeId(profile);
    const profileName = this.pickProfileName(profile);

    this.activeBusinessProfileSubject.next(normalized);
    this.persistStoredValue('active_business_profile_id', profileId);
    this.persistStoredValue('active_business_profile', profileId);
    this.persistStoredValue('active_business_profile_name', profileName);
    this.persistStoredValue('active_company', profileName);
    this.persistStoredValue('active_workspace', profileId);
    this.syncActiveContextState();
  }

  setActiveMemberRole(role: string | null): void {
    this.activeMemberRoleSubject.next(this.normalizeUiRole(role));
    this.persistStoredValue('active_member_role', role);
    this.syncActiveContextState();
  }

  async activateFromMembership(membership: ActiveMembershipInput): Promise<void> {
    if (!membership) {
      throw new Error('Missing membership');
    }

    const membershipId = this.normalizeId(membership.id);
    const status = this.pickString(membership.status) ?? '';
    const rawRole = this.pickString(membership.member_role)?.toLowerCase() ?? '';
    const normalizedRole = this.normalizeUiRole(rawRole) ?? this.normalizeUiRole(membership.member_role) ?? null;
    const token = this.auth.getStoredAccessToken() ?? '';

    if (!membershipId) {
      throw new Error('Missing membership id');
    }
    if (!status) {
      throw new Error('Missing membership status');
    }
    if (!membership.business_profile) {
      throw new Error('Membership has no business_profile');
    }

    let profile = this.normalizeBusinessProfile(membership.business_profile);
    if (profile?.id && (!profile.company_name || profile.company_name.trim() === '')) {
      const reloaded = await this.loadBusinessProfileById(profile.id, token);
      if (reloaded) {
        profile = reloaded;
      }
    }

    if (!profile?.id) {
      throw new Error('Membership has no business_profile id');
    }

    this.activeMembershipSubject.next({
      id: membershipId,
      status,
      member_role: normalizedRole ?? rawRole,
      user: membership.user ?? null,
      business_profile: profile,
      department: membership.department ?? null,
      joined_at: membership.joined_at ?? null
    });
    this.activeBusinessProfileSubject.next(profile);
    this.activeMemberRoleSubject.next(normalizedRole);

    this.persistStoredMembership({
      id: membershipId,
      status,
      member_role: normalizedRole ?? rawRole,
      user: membership.user ?? null,
      business_profile: profile,
      department: membership.department ?? null,
      joined_at: membership.joined_at ?? null
    });

    this.persistStoredValue('active_member_id', membershipId);
    this.persistStoredValue('active_member_role', normalizedRole ?? rawRole);
    this.persistStoredValue('active_business_profile_id', profile.id);
    this.persistStoredValue('active_business_profile', profile.id);
    this.persistStoredValue('active_business_profile_name', profile.company_name ?? null);
    this.persistStoredValue('active_company', profile.company_name ?? null);
    this.persistStoredValue('active_workspace', profile.id);
    this.persistStoredValue('active_workspace_membership_user_id', this.normalizeId(membership.user));

    const department = this.objectRecord(membership.department);
    this.persistStoredValue('active_department', this.normalizeId(department?.['id'] ?? membership.department));
    this.persistStoredValue('active_department_name', this.pickString(department?.['name']));

    this.syncActiveContextState();

  }

  async ensureActiveContext(): Promise<{
    activeMembership: ActiveMembershipContext;
    activeBusinessProfile: BusinessProfileRecord;
    activeMemberRole: string;
  } | null> {

    const currentUser = await this.auth.getCurrentUserAfterRestore();
    if (!currentUser?.id) {
      this.clearActiveWorkspaceContext();
      return null;
    }

    const currentUserId = this.normalizeId(currentUser.id);
    if (!currentUserId) {
      this.clearActiveWorkspaceContext();
      return null;
    }

    const existingMembership = this.activeMembershipSubject.value;
    const existingProfile = this.activeBusinessProfileSubject.value;
    if (existingMembership?.id && existingProfile?.id) {
      const memberUserId = this.normalizeId(existingMembership.user);
      if (memberUserId === currentUserId) {
        return {
          activeMembership: existingMembership,
          activeBusinessProfile: existingProfile,
          activeMemberRole: String(existingMembership.member_role || '').toLowerCase()
        };
      }

      console.warn('[WorkspaceContext] in-memory context belongs to another user, clearing');
      this.clearActiveWorkspaceContext();
    }

    const storedMembership = this.readStoredMembership();
    if (storedMembership) {
      try {
        const membershipToUse = storedMembership;
        const memberUserId = this.normalizeId(membershipToUse?.user);
        const belongsToCurrentUser = memberUserId === currentUserId;


        if (!membershipToUse?.id || !belongsToCurrentUser) {
          console.warn('[WorkspaceContext] stored membership invalid or belongs to another user, clearing');
          this.clearActiveWorkspaceContext();
        } else if (String(membershipToUse.status || '').toLowerCase() === 'active') {
          await this.activateFromMembership(membershipToUse as ActiveMembershipInput);

          return {
            activeMembership: this.activeMembershipSubject.value as ActiveMembershipContext,
            activeBusinessProfile: this.activeBusinessProfileSubject.value as BusinessProfileRecord,
            activeMemberRole: String(this.activeMemberRoleSubject.value ?? '').toLowerCase()
          };
        } else {
          console.warn('[WorkspaceContext] stored membership is not active, clearing');
          this.clearActiveWorkspaceContext();
        }
      } catch (error) {
        console.warn('[WorkspaceContext] stored membership restore failed', error);
        this.clearActiveWorkspaceContext();
      }
    }

    const token = this.auth.getStoredAccessToken() ?? '';
    if (!token) {
      this.clearActiveWorkspaceContext();
      return null;
    }

    const activeContext = await this.loadAuthoritativeUserContext(token);
    const memberships = await this.fetchActiveMembershipsForUser(String(currentUser.id), token, activeContext);
    const activeMembership = memberships[0] ?? null;
    if (!activeMembership) {
      this.clearActiveWorkspaceContext();
      return null;
    }

    const activeMemberUserId = this.normalizeId(activeMembership.user);
    if (activeMemberUserId !== currentUserId) {
      console.warn('[WorkspaceContext] fetched membership belongs to another user, clearing');
      this.clearActiveWorkspaceContext();
      return null;
    }

    await this.activateFromMembership(activeMembership as ActiveMembershipInput);

    return {
      activeMembership: this.activeMembershipSubject.value as ActiveMembershipContext,
      activeBusinessProfile: this.activeBusinessProfileSubject.value as BusinessProfileRecord,
      activeMemberRole: String(this.activeMemberRoleSubject.value ?? '').toLowerCase()
    };
  }

  async getActiveMembershipsForCurrentUser(): Promise<ActiveMembershipContext[]> {
    const user = await this.auth.getCurrentUserAfterRestore();
    const userId = this.normalizeId(user?.id);
    const token = this.auth.getStoredAccessToken() ?? '';

    if (!userId || !token) {
      return [];
    }

    try {
      return await this.fetchActiveMembershipsForUser(userId, token);
    } catch {
      return [];
    }
  }

  ensureLoaded(forceRefresh = false): Observable<CompanyContextState> {
    const current = this.snapshot();
    const token = this.auth.getStoredAccessToken() ?? '';
    if (!token) {
      const signedOutState = this.buildSignedOutState(true, true);
      this.stateSubject.next(signedOutState);
      return of(signedOutState);
    }

    const hasCurrentUserIdentity = Boolean(current.context.currentUser?.id || current.context.userId);
    const hasCurrentUserEmail = Boolean(
      this.pickString(current.context.currentUser?.email) ||
      this.pickString(current.context.userEmail)
    );
    const alreadyLoaded = Boolean(
      hasCurrentUserIdentity &&
      hasCurrentUserEmail &&
      current.context.workspaceInitialized &&
      current.context.availableCompanies.length > 1 &&
      !current.error
    );

    if (!forceRefresh && alreadyLoaded && !current.loading) {
      return of(current);
    }

    if (!forceRefresh && this.inFlight$) {
      return this.inFlight$;
    }

    this.stateSubject.next({
      ...current,
      loading: true,
      error: null
    });

    const request$ = this.fetchCurrentUserContext(token).pipe(
      timeout(15000),
      switchMap((user) =>
        from(this.loadWorkspaceContext(token)).pipe(
          catchError(() => of(null)),
          map((workspaceContext) => this.buildState(user, workspaceContext))
        )
      ),
      tap((state) => this.stateSubject.next(state)),
      catchError((error) => {
        if (this.isUnauthorizedError(error)) {
          this.auth.clearAuthState();
          const signedOutState = this.buildSignedOutState(true, true);
          this.stateSubject.next(signedOutState);
          return of(signedOutState);
        }

        const failedState: CompanyContextState = {
          loading: false,
          error: this.describeError(error, 'Failed to load company context.'),
          context: {
            ...this.snapshot().context,
            ...this.readStoredContext(),
            authInitialized: true,
            workspaceInitialized: true
          }
        };
        this.stateSubject.next(failedState);
        return of(failedState);
      }),
      finalize(() => {
        this.inFlight$ = null;
      }),
      shareReplay(1)
    );

    this.inFlight$ = request$;
    return request$;
  }

  switchCompany(companyId: string): Observable<CompanyContextState> {
    const company = this.snapshot().context.availableCompanies.find((item) => item.id === companyId);
    if (!company?.membershipId) {
      return of(this.snapshot());
    }

    return this.workspaceContextApi.switchMembership(company.membershipId).pipe(
      switchMap(() => this.ensureLoaded(true)),
      switchMap(() => from(this.ensureVerifiedWorkspaceContext(true, true))),
      map(() => this.snapshot()),
      catchError((error) => this.handleMutationError(error, 'Failed to switch company context.'))
    );
  }

  clearDepartmentScope(): Observable<CompanyContextState> {
    return of(this.snapshot());
  }

  activateWorkspace(
    businessProfileId: string,
    memberRole: ActiveMemberRole | null,
    departmentId: string | null = null
  ): Observable<CompanyContextState> {
    const profileId = this.normalizeId(businessProfileId);
    if (!profileId) {
      return of(this.snapshot());
    }

    const matchingCompany = this.snapshot().context.availableCompanies.find((item) => item.id === profileId);
    if (!matchingCompany?.membershipId) {
      return of(this.snapshot());
    }

    return this.workspaceContextApi.switchMembership(matchingCompany.membershipId).pipe(
      switchMap(() => this.ensureLoaded(true)),
      switchMap(() => from(this.ensureVerifiedWorkspaceContext(true, true))),
      map(() => this.snapshot()),
      catchError((error) => this.handleMutationError(error, 'Failed to update workspace context.'))
    );
  }

  private fetchCurrentUserContext(token: string): Observable<UserContextResponse> {
    const stored = this.readStoredContext();
    const fields = [
      'id',
      'email',
      'first_name',
      'last_name',
      'active_business_profile',
      'active_department',
      'active_member_role'
    ].join(',');

    return this.http.get<any>(
      `${this.api}/users/me?fields=${encodeURIComponent(fields)}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      switchMap((response) => {
        const user = response?.data ?? response ?? {};
        const hasActiveBusinessProfileField = Object.prototype.hasOwnProperty.call(user, 'active_business_profile');
        const hasActiveMemberRoleField = Object.prototype.hasOwnProperty.call(user, 'active_member_role');
        const hasActiveDepartmentField = Object.prototype.hasOwnProperty.call(user, 'active_department');
        const activeBusinessProfileId = hasActiveBusinessProfileField
          ? this.normalizeId(user?.active_business_profile)
          : stored.activeBusinessProfileId;
        const activeDepartmentId = hasActiveDepartmentField
          ? this.normalizeId(user?.active_department)
          : stored.activeDepartmentId;
        const activeMemberRole = hasActiveMemberRoleField
          ? this.normalizeUiRole(user?.active_member_role)
          : stored.activeMemberRole;

        const companyName$ =
          activeBusinessProfileId && !this.pickProfileName(user?.active_business_profile)
            ? this.resolveBusinessProfileName(activeBusinessProfileId, token)
            : of(this.pickProfileName(user?.active_business_profile) ?? stored.activeBusinessProfileName ?? null);
        const departmentName$ =
          activeDepartmentId && !this.pickDepartmentName(user?.active_department)
            ? this.resolveDepartmentName(activeDepartmentId, token)
            : of(this.pickDepartmentName(user?.active_department) ?? stored.activeDepartmentName ?? null);

        return forkJoin({
          companyName: companyName$,
          departmentName: departmentName$
        }).pipe(
          map(({ companyName, departmentName }) => {
            const userId = this.normalizeId(user?.id) ?? stored.userId;
            const resolvedEmail =
              this.pickString(user?.email) ??
              this.pickString(stored.currentUser?.email) ??
              this.pickString(stored.userEmail) ??
              this.readStoredValue('user_email');
            const resolvedFirstName =
              this.pickString(user?.first_name) ??
              this.pickString(stored.currentUser?.first_name) ??
              this.readStoredValue('user_first_name');
            const resolvedLastName =
              this.pickString(user?.last_name) ??
              this.pickString(stored.currentUser?.last_name) ??
              this.readStoredValue('user_last_name');

            return ({
              currentUser: userId
                ? {
                    id: userId,
                    email: resolvedEmail,
                    first_name: resolvedFirstName,
                    last_name: resolvedLastName
                  }
                : null,
              userId,
              userDisplayName: this.buildDisplayName(resolvedFirstName, resolvedLastName, resolvedEmail),
              userEmail: resolvedEmail,
              isAuthenticated: Boolean(userId),
              authInitialized: true,
              activeBusinessProfileId,
              activeBusinessProfileName:
                companyName ??
                this.pickProfileName(user?.active_business_profile) ??
                stored.activeBusinessProfileName,
              activeDepartmentId,
              activeDepartmentName:
                departmentName ??
                this.pickDepartmentName(user?.active_department) ??
                stored.activeDepartmentName,
              activeMemberRole
            }) satisfies UserContextResponse;
          })
        );
      }),
      tap((user) => this.persistStoredContext(user))
    );
  }

  private fetchAccessibleCompanies(
    userId: string | null,
    token: string,
    activeBusinessProfileId: string | null
  ): Observable<CompanyOption[]> {
    return from(this.loadWorkspaceContext(token)).pipe(
      map((workspaceContext) => this.mapWorkspaceContextToCompanies(workspaceContext, activeBusinessProfileId))
    );
  }

  private buildState(
    user: UserContextResponse,
    workspaceContext: WorkspaceContextPayload | null
  ): CompanyContextState {
    const companies = this.mapWorkspaceContextToCompanies(workspaceContext, user.activeBusinessProfileId);
    const storedContext = this.readStoredContext();
    const isSameUser = !storedContext.userId || !user.userId || storedContext.userId === user.userId;
    const storedActiveProfileId = storedContext.activeBusinessProfileId;
    const verifiedMembership = this.getVerifiedActiveMembershipForUser(user.userId);
    const verifiedProfile = this.normalizeBusinessProfile(verifiedMembership?.business_profile);
    const verifiedRole = this.normalizeUiRole(verifiedMembership?.member_role);
    const firstAccessibleCompany = companies[0] ?? null;
    const storedCompany =
      isSameUser && storedActiveProfileId && companies.some((item) => item.id === storedActiveProfileId)
        ? storedActiveProfileId
        : null;
    const fallbackProfileId = firstAccessibleCompany?.id ?? null;
    const userSelectedProfileId =
      user.activeBusinessProfileId && companies.some((item) => item.id === user.activeBusinessProfileId)
        ? user.activeBusinessProfileId
        : null;
    const activeBusinessProfileId =
      userSelectedProfileId ??
      storedCompany ??
      verifiedProfile?.id ??
      fallbackProfileId;

    const matchingCompany = companies.find((item) => item.id === activeBusinessProfileId) ?? null;
    const activeMemberRole = matchingCompany?.role ?? verifiedRole ?? null;

    const resolvedUserEmail =
      this.pickString(user.userEmail) ??
      this.pickString(user.currentUser?.email) ??
      (isSameUser ? this.pickString(storedContext.userEmail) : null) ??
      (isSameUser ? this.pickString(storedContext.currentUser?.email) : null) ??
      this.readStoredValue('user_email');
    const resolvedFirstName =
      this.pickString(user.currentUser?.first_name) ??
      (isSameUser ? this.pickString(storedContext.currentUser?.first_name) : null) ??
      this.readStoredValue('user_first_name');
    const resolvedLastName =
      this.pickString(user.currentUser?.last_name) ??
      (isSameUser ? this.pickString(storedContext.currentUser?.last_name) : null) ??
      this.readStoredValue('user_last_name');
    const resolvedUserId = user.userId ?? (isSameUser ? storedContext.userId : null);
    const context: CompanyContext = {
      currentUser: resolvedUserId
        ? {
            id: resolvedUserId,
            email: resolvedUserEmail,
            first_name: resolvedFirstName,
            last_name: resolvedLastName
          }
        : null,
      userId: resolvedUserId,
      userDisplayName:
        this.buildDisplayName(resolvedFirstName, resolvedLastName, resolvedUserEmail),
      userEmail: resolvedUserEmail,
      isAuthenticated: true,
      authInitialized: true,
      workspaceInitialized: true,
      activeBusinessProfileId,
      activeBusinessProfileName:
        user.activeBusinessProfileName ??
        user.activeCompanyName ??
        matchingCompany?.name ??
        verifiedProfile?.company_name ??
        (isSameUser ? storedContext.activeBusinessProfileName : null) ??
        firstAccessibleCompany?.name ??
        null,
      activeDepartmentId:
        user.activeDepartmentId ??
        this.normalizeId(verifiedMembership?.department) ??
        (isSameUser ? storedContext.activeDepartmentId : null),
      activeDepartmentName:
        user.activeDepartmentName ??
        this.pickDepartmentName(verifiedMembership?.department) ??
        (isSameUser ? storedContext.activeDepartmentName : null) ??
        (isSameUser ? storedContext.activeDepartmentId : null) ??
        null,
      activeMemberRole,
      availableCompanies: companies.map((item) => ({
        ...item,
        isActive: item.id === activeBusinessProfileId
      })),
      hubReason: null
    };

    this.persistStoredContext(context);

    return {
      loading: false,
      error: null,
      context
    };
  }

  private getVerifiedActiveMembershipForUser(userId: string | null): ActiveMembershipContext | null {
    const normalizedUserId = this.normalizeId(userId);
    if (!normalizedUserId) {
      return null;
    }

    const candidates = [
      this.activeMembershipSubject.value,
      this.readStoredMembership()
    ];

    for (const membership of candidates) {
      if (!membership?.id) {
        continue;
      }

      const memberUserId = this.normalizeId(membership.user);
      const profileId = this.normalizeId(membership.business_profile);
      const role = this.normalizeUiRole(membership.member_role);
      const status = String(membership.status ?? '').trim().toLowerCase();
      if (memberUserId === normalizedUserId && profileId && role && status === 'active') {
        return membership;
      }
    }

    return null;
  }

  private async loadWorkspaceContext(token: string): Promise<WorkspaceContextPayload | null> {
    try {
      return await firstValueFrom(this.workspaceContextApi.getContext().pipe(timeout(10000)));
    } catch {
      return null;
    }
  }

  private mapWorkspaceContextToCompanies(
    workspaceContext: WorkspaceContextPayload | null,
    activeBusinessProfileId: string | null = null
  ): CompanyOption[] {
    if (!workspaceContext?.memberships?.length) {
      return [];
    }

    const options = new Map<string, CompanyOption>();
    const activeMembershipId = this.normalizeId(workspaceContext.active?.membership?.id);
    const activeWorkspaceId = this.normalizeId(workspaceContext.active?.workspace?.id);
    const preferredActiveProfileId = this.normalizeId(activeBusinessProfileId) ?? activeWorkspaceId;

    for (const membership of workspaceContext.memberships) {
      const option = this.mapWorkspaceMembershipToCompany(membership, activeMembershipId, preferredActiveProfileId);
      if (!option) {
        continue;
      }

      const currentOption = options.get(option.id);
      if (!currentOption || this.rolePriority(option.role) > this.rolePriority(currentOption.role)) {
        options.set(option.id, option);
      }
    }

    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  private mapWorkspaceMembershipToCompany(
    membership: WorkspaceContextMembership,
    activeMembershipId: string | null,
    preferredActiveProfileId: string | null
  ): CompanyOption | null {
    const workspace = membership.workspace;
    const profileId = this.normalizeId(workspace?.id);
    const membershipId = this.normalizeId(membership.id);
    if (!profileId || !membershipId) {
      return null;
    }

    return {
      id: profileId,
      membershipId,
      name: workspace.companyName ?? `Company ${profileId}`,
      role: this.normalizeUiRole(membership.memberRole) ?? 'employee',
      membershipStatus: membership.status,
      departmentId: membership.department?.id ?? null,
      departmentName: membership.department?.name ?? null,
      isActive:
        membershipId === activeMembershipId ||
        profileId === preferredActiveProfileId ||
        Boolean(workspace.isActive)
    };
  }

  private mapWorkspaceMembershipToActiveMembership(
    membership: WorkspaceContextMembership,
    currentUser: { id: string | null; email: string | null; first_name: string | null; last_name: string | null }
  ): ActiveMembershipContext | null {
    const workspace = this.normalizeBusinessProfileFromWorkspace(membership.workspace);
    const membershipId = this.normalizeId(membership.id);
    const role = this.normalizeUiRole(membership.memberRole);
    if (!membershipId || !workspace?.id || !role) {
      return null;
    }

    return {
      id: membershipId,
      status: membership.status ?? 'active',
      member_role: role,
      user: currentUser.id
        ? {
            id: currentUser.id,
            email: currentUser.email,
            first_name: currentUser.first_name,
            last_name: currentUser.last_name
          }
        : null,
      business_profile: workspace,
      department: membership.department
        ? {
            id: membership.department.id,
            name: membership.department.name
          }
        : null,
      joined_at: null
    };
  }

  private readStoredContext(): UserContextResponse {
    const storedUserId = this.readStoredValue('current_user_id');
    const storedEmail = this.readStoredValue('user_email');
    const storedFirstName = this.readStoredValue('user_first_name');
    const storedLastName = this.readStoredValue('user_last_name');
    return {
      currentUser: storedUserId
        ? {
            id: storedUserId,
            email: storedEmail,
            first_name: storedFirstName,
            last_name: storedLastName
          }
        : null,
      userId: storedUserId,
      userDisplayName:
        this.readStoredValue('user_display_name') ??
        this.buildDisplayName(storedFirstName, storedLastName, storedEmail),
      userEmail: storedEmail,
      isAuthenticated: Boolean(storedUserId),
      authInitialized: Boolean(storedUserId),
      activeBusinessProfileId:
        this.readStoredValue('active_business_profile_id') ??
        this.readStoredValue('active_business_profile') ??
        this.readStoredValue('active_workspace'),
      activeBusinessProfileName:
        this.readStoredValue('active_business_profile_name') ??
        this.readStoredValue('active_company'),
      activeDepartmentId: this.readStoredValue('active_department'),
      activeDepartmentName:
        this.readStoredValue('active_department_name') ??
        this.readStoredValue('active_department'),
      activeMemberRole: this.normalizeUiRole(this.readStoredValue('active_member_role'))
    };
  }

  private persistStoredContext(context: Partial<UserContextResponse> | Partial<CompanyContext>): void {
    const currentUser = context.currentUser;
    if (currentUser !== undefined) {
      this.persistStoredValue('current_user_id', currentUser?.id ?? null);
      this.persistStoredValue('user_email', currentUser?.email ?? null);
      this.persistStoredValue('user_first_name', currentUser?.first_name ?? null);
      this.persistStoredValue('user_last_name', currentUser?.last_name ?? null);
    }
    if (context.userId !== undefined) {
      this.persistStoredValue('current_user_id', context.userId);
    }
    if (context.userDisplayName !== undefined) {
      this.persistStoredValue('user_display_name', context.userDisplayName);
    }
    if (context.userEmail !== undefined) {
      this.persistStoredValue('user_email', context.userEmail);
    }
    if (context.activeBusinessProfileId !== undefined) {
      this.persistStoredValue('active_business_profile_id', context.activeBusinessProfileId);
      this.persistStoredValue('active_business_profile', context.activeBusinessProfileId);
    }
    if (context.activeBusinessProfileName !== undefined) {
      this.persistStoredValue('active_business_profile_name', context.activeBusinessProfileName);
      this.persistStoredValue('active_company', context.activeBusinessProfileName);
    }
    if (context.activeDepartmentId !== undefined) {
      this.persistStoredValue('active_department', context.activeDepartmentId);
    }
    if (context.activeMemberRole !== undefined) {
      this.persistStoredValue('active_member_role', context.activeMemberRole);
    }
  }

  private persistStoredMembership(membership: ActiveMembershipContext | null): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (!membership) {
      localStorage.removeItem(ACTIVE_MEMBERSHIP_STORAGE_KEY);
      return;
    }

    localStorage.setItem(ACTIVE_MEMBERSHIP_STORAGE_KEY, JSON.stringify(membership));
  }

  private readStoredMembership(): ActiveMembershipContext | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(ACTIVE_MEMBERSHIP_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as ActiveMembershipContext;
      const id = this.normalizeId(parsed?.id);
      const status = this.pickString(parsed?.status) ?? '';
      const role = this.pickString(parsed?.member_role) ?? '';
      if (!id || !status || !role) {
        return null;
      }

      return {
        ...parsed,
        id,
        status,
        member_role: role,
        user: parsed?.user ?? null
      };
    } catch {
      return null;
    }
  }

  private readStoredBusinessProfile(): BusinessProfileRecord | null {
    const profileId = this.readStoredValue('active_business_profile_id') ?? this.readStoredValue('active_business_profile');
    if (!profileId) {
      return null;
    }

    return {
      id: profileId,
      company_name: this.readStoredValue('active_business_profile_name'),
      is_active: true
    };
  }

  private persistStoredValue(key: string, value: string | null | undefined): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (value && value.toString().trim()) {
      localStorage.setItem(key, value.toString().trim());
      return;
    }

    localStorage.removeItem(key);
  }

  private onAuthStateReset = (event?: Event): void => {
    const reason = (event as CustomEvent<{ reason?: string }>)?.detail?.reason ?? '';
    this.clearActiveWorkspaceContext();
    this.persistStoredValue('current_user_id', null);
    this.persistStoredValue('user_email', null);
    this.persistStoredValue('user_display_name', null);
    this.persistStoredValue('user_first_name', null);
    this.persistStoredValue('user_last_name', null);

    if (reason === 'logout') {
      this.stateSubject.next(this.buildSignedOutState(true, true));
      return;
    }

    this.stateSubject.next(INITIAL_STATE);
  };

  private normalizeBusinessProfile(
    profile: ActiveMembershipContext['business_profile'] | BusinessProfileRecord | null | undefined
  ): BusinessProfileRecord | null {
    if (!profile) {
      return null;
    }

    if (typeof profile === 'string' || typeof profile === 'number') {
      const id = this.normalizeId(profile);
      return id
        ? {
            id,
            company_name: this.readStoredValue('active_business_profile_name'),
            is_active: true
          }
        : null;
    }

    const record = profile as Record<string, unknown>;
    const id = this.normalizeId(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      company_name: this.pickString(record['company_name']) ?? this.readStoredValue('active_business_profile_name'),
      is_active: typeof record['is_active'] === 'boolean' ? record['is_active'] : true,
      plan_code: this.pickString(record['plan_code']),
      billing_status: this.pickString(record['billing_status']),
      timezone: this.pickString(record['timezone']),
      default_language: this.pickString(record['default_language'])
    };
  }

  private normalizeBusinessProfileFromWorkspace(workspace: WorkspaceContextWorkspace): BusinessProfileRecord {
    return {
      id: workspace.id,
      company_name: workspace.companyName,
      is_active: workspace.isActive,
      plan_code: workspace.planCode,
      billing_status: workspace.billingStatus,
      timezone: null,
      default_language: null
    };
  }

  private normalizeVerifiedMembership(
    active: WorkspaceContextPayload['active'],
    workspace: BusinessProfileRecord
  ): ActiveMembershipContext {
    const currentMembership = this.activeMembershipSubject.value ?? this.readStoredMembership();
    const membershipId = active?.membership?.id ?? currentMembership?.id ?? '';
    const activeMembership: ActiveMembershipContext = {
      id: membershipId,
      status: active?.membership?.status ?? currentMembership?.status ?? 'active',
      member_role: active?.membership?.memberRole ?? currentMembership?.member_role ?? '',
      user: currentMembership?.user ?? null,
      business_profile: workspace,
      department: active?.department ?? currentMembership?.department ?? null,
      joined_at: currentMembership?.joined_at ?? null
    };

    return activeMembership;
  }

  private applyVerifiedWorkspaceContext(
    membership: ActiveMembershipContext,
    profile: BusinessProfileRecord,
    department: WorkspaceContextDepartment | null
  ): void {
    this.verifiedWorkspaceContext = {
      activeMembership: membership,
      activeBusinessProfile: profile,
      activeDepartment: department,
      activeMemberRole: this.normalizeUiRole(membership.member_role) ?? 'employee'
    };

    this.activeMembershipSubject.next(membership);
    this.activeBusinessProfileSubject.next(profile);
    this.activeMemberRoleSubject.next(this.normalizeUiRole(membership.member_role));

    this.persistStoredMembership(membership);
    this.persistStoredValue('active_member_id', membership.id);
    this.persistStoredValue('active_member_role', membership.member_role);
    this.persistStoredValue('active_business_profile_id', profile.id);
    this.persistStoredValue('active_business_profile', profile.id);
    this.persistStoredValue('active_business_profile_name', profile.company_name ?? null);
    this.persistStoredValue('active_company', profile.company_name ?? null);
    this.persistStoredValue('active_workspace', profile.id);
    this.persistStoredValue('active_workspace_membership_user_id', this.normalizeId(membership.user));
    this.persistStoredValue('active_department', department?.id ?? null);
    this.persistStoredValue('active_department_name', department?.name ?? null);

    this.syncActiveContextState();
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private syncActiveContextState(): void {
    const current = this.stateSubject.value;
    const activeBusinessProfile = this.activeBusinessProfileSubject.value;
    const activeMemberRole = this.activeMemberRoleSubject.value;

    this.stateSubject.next({
      ...current,
      context: {
        ...current.context,
        activeBusinessProfileId: activeBusinessProfile?.id ?? current.context.activeBusinessProfileId,
        activeBusinessProfileName:
          activeBusinessProfile?.company_name ?? current.context.activeBusinessProfileName,
        activeMemberRole: activeMemberRole ?? current.context.activeMemberRole,
        authInitialized: current.context.authInitialized || Boolean(current.context.currentUser?.id),
        isAuthenticated: current.context.isAuthenticated || Boolean(current.context.currentUser?.id),
        workspaceInitialized: true
      }
    });
  }

  private async loadBusinessProfileById(profileId: string | null, token: string): Promise<BusinessProfileRecord | null> {
    const normalizedId = this.normalizeId(profileId);
    if (!normalizedId) {
      return null;
    }

    const params = new URLSearchParams({
      limit: '1',
      fields: [
        'id',
        'company_name',
        'is_active',
        'plan_code',
        'billing_status',
        'timezone',
        'default_language'
      ].join(',')
    });
    params.set('filter[id][_eq]', normalizedId);

    try {
      const response = await firstValueFrom(
        this.http.get<{ data?: BusinessProfileRecord[] }>(
          `${this.api}/items/business_profiles?${params.toString()}&_ts=${Date.now()}`,
          {
            headers: this.auth.getAuthHeaders(token),
            withCredentials: true
          }
        ).pipe(timeout(7000))
      );

      const row = (response.data ?? [])[0] ?? null;
      if (!row) {
        return null;
      }

      return {
        id: this.normalizeId(row.id) ?? normalizedId,
        company_name: this.pickString(row.company_name) ?? `Company ${normalizedId}`,
        is_active: row.is_active ?? true,
        plan_code: this.pickString(row.plan_code),
        billing_status: this.pickString(row.billing_status),
        timezone: this.pickString(row.timezone),
        default_language: this.pickString(row.default_language)
      };
    } catch {
      return null;
    }
  }

  private async loadMembershipById(memberId: string | null, token: string): Promise<ActiveMembershipContext | null> {
    const normalizedId = this.normalizeId(memberId);
    if (!normalizedId) {
      return null;
    }

    const workspaceContext = await this.loadWorkspaceContext(token);
    if (!workspaceContext?.memberships?.length) {
      return null;
    }

    const currentUser = await this.auth.getCurrentUserAfterRestore();
    const currentUserRecord = currentUser
      ? {
          id: this.normalizeId(currentUser.id) ?? null,
          email: this.pickString(currentUser.email) ?? null,
          first_name: this.pickString(currentUser.first_name) ?? null,
          last_name: this.pickString(currentUser.last_name) ?? null
        }
      : {
          id: null,
          email: null,
          first_name: null,
          last_name: null
        };

    const row = workspaceContext.memberships.find((membership) => this.normalizeId(membership.id) === normalizedId) ?? null;
    return row ? this.mapWorkspaceMembershipToActiveMembership(row, currentUserRecord) : null;
  }

  private async fetchActiveMembershipsForUser(
    userId: string,
    token: string,
    activeContext?: Pick<UserContextResponse, 'activeBusinessProfileId' | 'activeDepartmentId' | 'activeMemberRole'> | null
  ): Promise<ActiveMembershipContext[]> {
    const workspaceContext = await this.loadWorkspaceContext(token);
    if (!workspaceContext?.memberships?.length) {
      return [];
    }

    const currentUser = await this.auth.getCurrentUserAfterRestore();
    const currentUserRecord = currentUser
      ? {
          id: this.normalizeId(currentUser.id) ?? userId,
          email: this.pickString(currentUser.email) ?? null,
          first_name: this.pickString(currentUser.first_name) ?? null,
          last_name: this.pickString(currentUser.last_name) ?? null
        }
      : {
          id: userId,
          email: null,
          first_name: null,
          last_name: null
        };

    return workspaceContext.memberships
      .map((membership) => this.mapWorkspaceMembershipToActiveMembership(membership, currentUserRecord))
      .filter((row): row is ActiveMembershipContext => Boolean(row?.id) && Boolean(this.normalizeId(row?.business_profile)));
  }

  private async loadAuthoritativeUserContext(token: string): Promise<Pick<UserContextResponse, 'activeBusinessProfileId' | 'activeDepartmentId' | 'activeMemberRole'> | null> {
    try {
      const userContext = await firstValueFrom(this.fetchCurrentUserContext(token).pipe(timeout(7000)));
      return {
        activeBusinessProfileId: userContext.activeBusinessProfileId,
        activeDepartmentId: userContext.activeDepartmentId,
        activeMemberRole: userContext.activeMemberRole
      };
    } catch {
      return null;
    }
  }

  private pickPreferredActiveMembership(memberships: ActiveMembershipContext[]): ActiveMembershipContext | null {
    if (!memberships.length) {
      return null;
    }

    const snapshot = this.snapshot().context;
    const activeProfileId =
      snapshot.activeBusinessProfileId ??
      this.readStoredValue('active_business_profile_id') ??
      this.readStoredValue('active_business_profile');
    const activeMembershipId = this.normalizeId(this.activeMembershipSubject.value?.id ?? this.readStoredMembership()?.id);
    const activeRole =
      snapshot.activeMemberRole ??
      this.normalizeUiRole(this.activeMembershipSubject.value?.member_role) ??
      this.normalizeUiRole(this.readStoredValue('active_member_role'));

    const membershipForActiveProfile =
      memberships.find((membership) =>
        activeProfileId &&
        this.normalizeId(membership.business_profile) === activeProfileId
      ) ?? null;
    if (membershipForActiveProfile) {
      return membershipForActiveProfile;
    }

    const membershipForActiveId =
      memberships.find((membership) =>
        activeMembershipId &&
        this.normalizeId(membership.id) === activeMembershipId
      ) ?? null;
    if (membershipForActiveId) {
      return membershipForActiveId;
    }

    if (activeRole && activeRole !== 'employee') {
      const dashboardMembership = memberships.find((membership) => this.isDashboardRole(membership.member_role)) ?? null;
      if (dashboardMembership) {
        return dashboardMembership;
      }
    }

    return (
      memberships.find((membership) => this.isDashboardRole(membership.member_role)) ??
      memberships.find((membership) => this.normalizeUiRole(membership.member_role) === 'employee') ??
      memberships[0] ??
      null
    );
  }

  private readStoredValue(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  }

  private buildDisplayName(firstName: unknown, lastName: unknown, email: unknown): string {
    const first = this.pickString(firstName);
    const last = this.pickString(lastName);
    const fullName = [first, last].filter(Boolean).join(' ').trim();

    if (fullName) {
      return fullName;
    }

    return this.pickString(email) ?? 'User';
  }

  private normalizeCurrentUser(user: any): CompanyContext['currentUser'] {
    const id = this.normalizeId(user?.id);
    if (!id) {
      return null;
    }

    return {
      id,
      email: this.pickString(user?.email),
      first_name: this.pickString(user?.first_name),
      last_name: this.pickString(user?.last_name)
    };
  }

  private buildSignedOutState(authInitialized: boolean, workspaceInitialized: boolean): CompanyContextState {
    return {
      loading: false,
      error: null,
      context: {
        ...INITIAL_CONTEXT,
        authInitialized,
        workspaceInitialized
      }
    };
  }

  private isUnauthorizedError(error: any): boolean {
    const status = Number(error?.status ?? error?.error?.status ?? 0);
    if (status === 401 || status === 403) {
      return true;
    }

    const code = String(
      error?.error?.errors?.[0]?.extensions?.code ??
      error?.error?.code ??
      ''
    ).toUpperCase();
    return code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN' || code === 'FORBIDDEN';
  }

  private normalizeUiRole(value: unknown): ActiveMemberRole | null {
    const normalized = this.pickString(value)?.toLowerCase() ?? '';
    if (normalized === 'owner') {
      return 'owner';
    }
    if (normalized === 'hr' || normalized === 'admin') {
      return 'hr';
    }
    if (normalized === 'manager' || normalized === 'manger') {
      return 'manager';
    }
    if (normalized === 'employee' || normalized === 'member' || normalized === 'viewer') {
      return 'employee';
    }
    return null;
  }

  private isDashboardRole(value: unknown): boolean {
    const normalized = this.normalizeUiRole(value);
    return normalized === 'owner' || normalized === 'hr' || normalized === 'manager';
  }

  private rolePriority(role: ActiveMemberRole): number {
    if (role === 'owner') return 4;
    if (role === 'hr') return 3;
    if (role === 'manager') return 2;
    return 1;
  }

  private pickProfileName(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    return this.pickString(record['company_name']);
  }

  private pickDepartmentName(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    return this.pickString(record['name']) ?? this.pickString(record['label']) ?? this.normalizeId(record);
  }

  private resolveBusinessProfileName(profileId: string | null, token: string): Observable<string | null> {
    if (!profileId) {
      return of(null);
    }

    const params = new URLSearchParams({
      limit: '1',
      fields: 'id,company_name'
    });
    params.set('filter[id][_eq]', profileId);

    return this.http.get<{ data?: Array<{ company_name?: string | null }> }>(
      `${this.api}/items/business_profiles?${params.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => this.pickString(response?.data?.[0]?.company_name)),
      catchError(() => of(null))
    );
  }

  private resolveDepartmentName(departmentId: string | null, token: string): Observable<string | null> {
    if (!departmentId) {
      return of(null);
    }

    const params = new URLSearchParams({
      limit: '1',
      fields: 'id,name'
    });
    params.set('filter[id][_eq]', departmentId);

    return this.http.get<{ data?: Array<{ name?: string | null; label?: string | null }> }>(
      `${this.api}/items/departments?${params.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => {
        const row = response?.data?.[0] ?? null;
        return this.pickString(row?.name);
      }),
      catchError(() => of(null))
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

  private describeError(error: any, fallback: string): string {
    return (
      error?.error?.errors?.[0]?.extensions?.reason ||
      error?.error?.errors?.[0]?.message ||
      error?.error?.message ||
      error?.message ||
      fallback
    );
  }

  private handleMutationError(error: any, fallback: string): Observable<CompanyContextState> {
    const nextState: CompanyContextState = {
      ...this.snapshot(),
      loading: false,
      error: this.describeError(error, fallback)
    };
    this.stateSubject.next(nextState);
    return of(nextState);
  }
}
