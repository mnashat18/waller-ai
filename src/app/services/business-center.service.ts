import { take } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type WorkspaceCreateInput = {
  companyName: string;
  contactName: string;
  workEmail: string;
  phone?: string | null;
  industry?: string | null;
  teamSize?: string | null;
  country?: string | null;
  city?: string | null;
  website?: string | null;
  timezone?: string | null;
  defaultLanguage?: string | null;
};

export type WorkspaceCreateResult = ActionResult & {
  businessProfileId: string | null;
};

export type BusinessProfile = {
  id: string;
  owner_user?: string | null;
  billing_status?: string | null;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
  timezone?: string | null;
  is_active?: boolean | null;
  company_name?: string | null;
  contact_name?: string | null;
  work_email?: string | null;
  phone?: string | null;
  industry?: string | null;
  team_size?: string | null;
  country?: string | null;
  city?: string | null;
  website?: string | null;
};

export type BusinessProfileMember = {
  id: string;
  business_profile?: string | null;
  user_id?: string | null;
  user_label?: string | null;
  member_role?: string | null;
  status?: string | null;
};

export type BusinessMemberRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export type ManageTeamMemberRole = 'owner' | 'admin' | 'manager' | 'member';

export type BusinessUpgradeRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Needs_Info'
  | 'Canceled';

export type BusinessRolePermissions = {
  canInvite: boolean;
  canUpgrade: boolean;
  canManageMembers: boolean;
  canUseSystem: boolean;
  isReadOnly: boolean;
};

export type RequestRecord = {
  id: string;
  target: string;
  recipient: string;
  requested_by_user?: string | null;
  target_member?: string | null;
  business_profile?: string | null;
  department?: string | null;
  recipient_industry?: string | null;
  request_type?: string | null;
  status: string;
  cancelled?: string | null;
  requested_at?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  completed_scan?: string | null;
  scan_id?: string | null;
  required_state?: string | null;
  response_status?: string | null;
  response_payload?: unknown;
  timestamp?: string | null;
  requested_for_user?: string | null;
  requested_for_email?: string | null;
  requested_for_phone?: string | null;
  Target?: string | null;
  [key: string]: unknown;
};

export type CreateScanRequestPayload = {
  recipient_email: string;
  request_type?: string | null;
  status?: string | null;
  due_at?: string | null;
};

export type CreateScanRequestResult = ActionResult & {
  id?: string | null;
};

export type RequestInviteRecord = {
  id: string;
  request?: string | null;
  business_profile?: string | null;
  requested_by_user?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  token?: string | null;
  sent_at?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  date_created?: string | null;
};

export type ReportExportRecord = {
  id: string;
  format: string;
  status?: string | null;
  file?: string | null;
  filters?: string | null;
  completed_at?: string | null;
  business_profile?: string | null;
  user?: string | null;
  date_created?: string | null;
};

export type ExportAudience = 'team' | 'selected';

export type CreateReportExportInput = {
  format: 'csv' | 'pdf';
  filters?: string | Record<string, unknown> | null;
  scope?: ExportAudience;
  memberUserIds?: string[];
  memberLabels?: string[];
};

export type ActivityEventRecord = {
  id: string;
  actor_id?: string | null;
  actor_label?: string | null;
  target_user_id?: string | null;
  target_user_label?: string | null;
  action?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: string | null;
  business_profile?: string | null;
  date_created?: string | null;
};

export type BusinessHubAccessState = {
  userId: string | null;
  // Legacy compatibility field; no longer used for tenancy.
  orgId?: string | null;
  profile: BusinessProfile | null;
  membership: BusinessProfileMember | null;
  hasPaidAccess: boolean;
  memberRole: BusinessMemberRole | null;
  permissions: BusinessRolePermissions;
  trialExpired: boolean;
  trialExpiresAt: string | null;
  reason: string;
};

type AccessContext = {
  token: string | null;
  userId: string | null;
  activeBusinessProfileId?: string | null;
  activeDepartmentId?: string | null;
  activeMemberRole?: string | null;
};

export type SubmitUpgradeRequestInput = {
  profile?: BusinessProfile | null;
  requestedPlan?: string | null;
  currentPlan?: string | null;
  billingCycle?: string | null;
  notes?: string | null;
  basePriceUsd?: number | null;
  discountUsd?: number | null;
  finalPriceUsd?: number | null;
  isNewUserOffer?: boolean | null;
};

export type ActivityQueryOptions = {
  teamUserIds?: string[];
  teamUserEmails?: string[];
};

@Injectable({ providedIn: 'root' })
export class BusinessCenterService {
  private api = environment.API_URL;
  private readonly requestTimeoutMs = 15000;
  readonly dailyRequestLimit = 5;
  private lastHubAccessState: BusinessHubAccessState | null = null;
  private lastHubAccessStateAt = 0;
  private readonly hubAccessCacheTtlMs = 30000;
  private readonly hubAccessStateStorageKey = 'wellar_business_hub_access_state_v1';
  private hubAccessInFlight$: Observable<BusinessHubAccessState> | null = null;

  constructor(private http: HttpClient) {}

  notifyAuthStateChanged(): void {
    this.lastHubAccessState = null;
    this.lastHubAccessStateAt = 0;
    this.hubAccessInFlight$ = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.hubAccessStateStorageKey);
    }
  }

  getHubAccessState(forceRefresh = false): Observable<BusinessHubAccessState> {
    const access = this.getAccessContext();
    const cachedState = forceRefresh ? null : this.getRecentHubAccessState(access.userId);

    if (cachedState) {
      this.debug('getHubAccessState:cacheHit', {
        userId: cachedState.userId,
        profileId: cachedState.profile?.id ?? null,
        memberRole: cachedState.memberRole,
        hasPaidAccess: cachedState.hasPaidAccess
      });
      return of(cachedState);
    }

    if (forceRefresh) {
      this.hubAccessInFlight$ = null;
    }

    if (this.hubAccessInFlight$) {
      this.debug('getHubAccessState:reuseInFlight', {
        userId: access.userId
      });
      return this.hubAccessInFlight$;
    }

    this.debug('getHubAccessState:start', {
      hasToken: Boolean(access.token),
      userId: access.userId
    });

    const request$ = this.resolveAccessContext(access).pipe(
      take(1),
      tap((resolved) =>
        this.debug('getHubAccessState:resolvedAccess', {
          userId: resolved.userId
        })
      ),
      switchMap((resolved) => {
        if (!resolved?.userId) {
          return of({
            userId: null,
            profile: null,
            membership: null,
            hasPaidAccess: false,
            memberRole: null,
            permissions: this.resolvePermissions(null),
            trialExpired: false,
            trialExpiresAt: null,
            reason: 'Please sign in first.'
          } as BusinessHubAccessState);
        }

        const userId = resolved.userId;
        const token = resolved.token;
        const activeBusinessProfileId = this.normalizeId(resolved.activeBusinessProfileId);

        return this.fetchOwnedProfile(userId, token, activeBusinessProfileId).pipe(
          take(1),
          switchMap((ownedProfile) => {
            if (ownedProfile?.id) {
              return of({
                profile: ownedProfile,
                membership: null
              });
            }

            return this.fetchMemberProfile(userId, token, activeBusinessProfileId).pipe(
              take(1),
              map((result) => ({
                profile: result?.profile ?? null,
                membership: result?.membership ?? null
              }))
            );
          }),
          map(({ profile, membership }) =>
            this.buildAccessState(resolved, profile, membership)
          ),
          catchError((err) =>
            of({
              userId,
              profile: null,
              membership: null,
              hasPaidAccess: false,
              memberRole: null,
              permissions: this.resolvePermissions(null),
              trialExpired: false,
              trialExpiresAt: null,
              reason: this.resolveAccessErrorReason(err, 'Failed to verify Business access.')
            } as BusinessHubAccessState)
          )
        );
      }),
      timeout(this.requestTimeoutMs),
      catchError((err) =>
        of({
          userId: access.userId ?? null,
          profile: null,
          membership: null,
          hasPaidAccess: false,
          memberRole: null,
          permissions: this.resolvePermissions(null),
          trialExpired: false,
          trialExpiresAt: null,
          reason: this.resolveAccessErrorReason(err, 'Failed to verify Business access.')
        } as BusinessHubAccessState)
      ),
      tap((state) => {
        this.lastHubAccessState = state;
        this.lastHubAccessStateAt = Date.now();
        this.persistHubAccessState(state, this.lastHubAccessStateAt);

        this.debug('getHubAccessState:result', {
          userId: state.userId,
          profileId: state.profile?.id ?? null,
          memberRole: state.memberRole,
          hasPaidAccess: state.hasPaidAccess,
          permissions: state.permissions,
          reason: state.reason
        });
      }),
      finalize(() => {
        this.hubAccessInFlight$ = null;
      }),
      shareReplay(1)
    );

    this.hubAccessInFlight$ = request$;
    return request$;
  }

  getCachedHubAccessState(): BusinessHubAccessState | null {
    return this.getRecentHubAccessState(this.getAccessContext().userId);
  }

  ensureBusinessProfileForUser(
    user: Record<string, unknown> | null | undefined,
    accessToken?: string
  ): Observable<BusinessProfile | null> {
    const userId = this.normalizeId(user?.['id']);
    if (!userId) {
      return of(null);
    }
    const token = accessToken ?? this.getToken();

    return this.fetchOwnedProfile(userId, token, null).pipe(
      switchMap((owned) => {
        if (owned?.id) {
          return this.ensureOwnerMembershipRecord(owned.id, userId, token).pipe(
            map(() => owned)
          );
        }
        return of(null);
      }),
      timeout(this.requestTimeoutMs),
      catchError(() => of(null))
    );
  }

  ensureOwnerMembershipRecord(
    profileId: string,
    userId: string,
    token?: string | null
  ): Observable<boolean> {
    return this.ensureOwnerMembership(profileId, userId, token ?? this.getToken()).pipe(
      catchError(() => of(false))
    );
  }

  createWorkspace(
    input: WorkspaceCreateInput,
    ownerUserId: string | null,
    token?: string | null
  ): Observable<WorkspaceCreateResult> {
    const normalizedOwnerUserId = this.normalizeId(ownerUserId);
    const accessToken = token ?? this.getToken();

    if (!normalizedOwnerUserId) {
      return of({
        ok: false,
        message: 'Please sign in first.',
        businessProfileId: null
      });
    }

    if (!accessToken) {
      return of({
        ok: false,
        message: 'Please sign in first.',
        businessProfileId: null
      });
    }

    const now = new Date().toISOString();
    const payload = {
      owner_user: normalizedOwnerUserId,
      company_name: input.companyName,
      contact_name: input.contactName,
      work_email: input.workEmail,
      phone: input.phone || null,
      industry: input.industry || null,
      team_size: input.teamSize || null,
      country: input.country || null,
      city: input.city || null,
      website: input.website || null,
      timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      default_language: input.defaultLanguage || 'en',
      is_active: true,
      plan_code: 'free',
      billing_status: 'trialing',
      employee_limit: 20,
      trial_started_at: now,
      trial_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    };

    return this.http.post<{ data?: { id?: string | number | null } | Array<{ id?: string | number | null }> }>(
      `${this.api}/items/business_profiles`,
      payload,
      this.requestOptions(accessToken)
    ).pipe(
      map((res) => {
        const created = Array.isArray(res?.data) ? res.data[0] : res?.data;
        return this.normalizeId((created as Record<string, unknown> | null | undefined)?.['id']);
      }),
      switchMap((businessProfileId) => {
        if (!businessProfileId) {
          return of({
            ok: false,
            message: 'We could not create the workspace.',
            businessProfileId: null
          });
        }

        return this.ensureOwnerMembership(businessProfileId, normalizedOwnerUserId, accessToken).pipe(
          map((created) => ({
            ok: Boolean(created),
            message: created
              ? 'Workspace created.'
              : 'Workspace created, but membership could not be verified.',
            businessProfileId
          })),
          catchError((error) =>
            of({
              ok: false,
              message: this.toFriendlyError(error, 'We could not create the workspace.'),
              businessProfileId
            })
          )
        );
      }),
      catchError((error) =>
        of({
          ok: false,
          message: this.toFriendlyError(error, 'We could not create the workspace.'),
          businessProfileId: null
        })
      )
    );
  }

  listTeamMembers(profileId: string | null, limit = 50): Observable<BusinessProfileMember[]> {
    const access = this.getAccessContext();
    if (!profileId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-id',
      limit: String(limit),
      fields: [
        'id',
        'member_role',
        'status',
        'business_profile',
        'user.id',
        'user.email',
        'user.first_name',
        'user.last_name'
      ].join(',')
    });
    params.set('filter[business_profile][_eq]', profileId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profile_members?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => this.dedupeMembers((res.data ?? []).map((row) => this.normalizeMember(row)))),
      timeout(this.requestTimeoutMs),
      catchError(() => of([]))
    );
  }

  upsertTeamMember(
    profileId: string | null,
    userEmail: string,
    role: ManageTeamMemberRole,
    actorRole?: BusinessMemberRole | null
  ): Observable<ActionResult> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    const normalizedEmail = this.pickString(userEmail)?.toLowerCase() ?? null;
    const normalizedActorRole = this.normalizeBusinessMemberRole(actorRole);

    if (!normalizedProfileId) {
      return of({ ok: false, message: 'Business profile is missing.' });
    }
    if (!normalizedEmail) {
      return of({ ok: false, message: 'Member email is required.' });
    }

    const backendRole = this.mapManagedRole(role);
    if (normalizedActorRole && !this.resolvePermissions(normalizedActorRole).canManageMembers) {
      return of({ ok: false, message: 'Your role cannot manage team members.' });
    }
    if (normalizedActorRole && !this.isRoleAssignableByActor(normalizedActorRole, backendRole)) {
      return of({
        ok: false,
        message: 'Your role cannot assign this member role.'
      });
    }

    return this.findUserIdByEmail(normalizedEmail, access.token).pipe(
      switchMap((userId) => {
        if (!userId) {
          return of({
            ok: false,
            message: 'No registered account found for this email. Ask the member to sign up first.'
          });
        }

        return this.upsertBusinessProfileMember(
          normalizedProfileId,
          userId,
          backendRole,
          access.token
        );
      }),
      timeout(this.requestTimeoutMs),
      catchError((err) =>
        of({
          ok: false,
          message: this.describeMemberLookupError(err)
        })
      )
    );
  }

  listRequests(_businessProfileHint: string | null, limit = 60): Observable<RequestRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        if (scope.hasBusinessAccess) {
          if (!scope.businessProfileId) {
            this.debug('listRequests:missingBusinessProfile', {
              userId: scope.userId
            });
            return of([] as RequestRecord[]);
          }
          return this.fetchRequestsByBusinessProfile(scope.businessProfileId, limit, access.token);
        }

        if (!scope.userId) {
          return of([] as RequestRecord[]);
        }

        return this.fetchRequestsByRequestedUser(scope.userId, limit, access.token);
      }),
      map((rows) => this.mergeRequestsById(rows)),
      switchMap((rows) => this.attachRecipientIndustries(rows, access.token)),
      catchError(() => of([]))
    );
  }

  listRequestsForBusinessProfile(
    profileId: string | null,
    limit = 60,
    fallbackUserId?: string | null
  ): Observable<RequestRecord[]> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    const userId = this.normalizeId(access.userId) ?? this.normalizeId(fallbackUserId ?? null);

    const profileRequests$ = normalizedProfileId
      ? this.fetchRequestsByBusinessProfile(normalizedProfileId, limit, access.token)
      : of([] as RequestRecord[]);

    return profileRequests$.pipe(
      switchMap((rows) => {
        if (rows.length || !userId) {
          return of(rows);
        }
        // Fallback for legacy rows that may not have business_profile populated.
        return this.fetchRequestsForUserFallback(userId, limit, access.token);
      }),
      map((rows) => this.mergeRequestsById(rows)),
      switchMap((rows) => this.attachRecipientIndustries(rows, access.token)),
      catchError(() => of([]))
    );
  }

  hasRequestForEmail(email: string): Observable<boolean> {
    const normalizedEmail = this.pickString(email)?.toLowerCase() ?? '';
    if (!this.isEmailLike(normalizedEmail)) {
      return of(false);
    }

    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of(false);
    }

    return this.findUserIdByEmail(normalizedEmail, access.token).pipe(
      switchMap((requestedForUserId) => {
        if (!requestedForUserId) {
          return of(false);
        }

        const params = this.buildRequestsParams(1);
        params.set('filter[requested_for_user][_eq]', requestedForUserId);

        return this.http.get<{ data?: any[] }>(
          `${this.api}/items/requests?${params.toString()}`,
          this.requestOptions(access.token)
        ).pipe(
          map((res) => (res.data ?? []).length > 0),
          catchError(() => of(false))
        );
      }),
      catchError(() => of(false))
    );
  }

  countTodayRequests(rows: Array<{ requested_at?: string | null | undefined }>): number {
    const today = this.localDateKey(Date.now());
    if (!today) {
      return 0;
    }

    let count = 0;
    for (const row of rows ?? []) {
      const key = this.localDateKey(row?.requested_at ?? null);
      if (key === today) {
        count += 1;
      }
    }
    return count;
  }

  remainingTodayRequests(
    rows: Array<{ requested_at?: string | null | undefined }>,
    limit = this.dailyRequestLimit
  ): number {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : this.dailyRequestLimit;
    return Math.max(0, safeLimit - this.countTodayRequests(rows));
  }

  createScanRequest(
    payload: CreateScanRequestPayload,
    _businessProfileHint?: string | null
  ): Observable<CreateScanRequestResult> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const requestedForEmail = this.pickString(payload.recipient_email)?.toLowerCase() ?? '';
    const requestType = this.pickString(payload.request_type) ?? 'manual';

    if (!this.isEmailLike(requestedForEmail)) {
      return of({ ok: false, message: 'Recipient email is invalid.' });
    }

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        const requestedByUser = this.normalizeId(scope.userId ?? access.userId);
        if (!requestedByUser) {
          return of({
            ok: false,
            message: 'Failed to resolve the current user context. Please sign in again.'
          } as CreateScanRequestResult);
        }

        if (scope.hasBusinessAccess && !scope.businessProfileId) {
          return of({
            ok: false,
            message: 'Business profile is missing for this account. Please refresh and try again.'
          } as CreateScanRequestResult);
        }

        return this.findUserIdByEmail(requestedForEmail, access.token).pipe(
          switchMap((requestedForUserId) => {
            if (!requestedForUserId) {
              return of({
                ok: false,
                message: 'Recipient email is not linked to a registered user.'
              } as CreateScanRequestResult);
            }

            const body: Record<string, unknown> = {
              business_profile: scope.businessProfileId,
              requested_for_user: requestedForUserId,
              requested_for_email: requestedForEmail,
              Target: requestedForEmail,
              required_state: requestType,
              response_status: this.pickString(payload.status) ?? 'pending',
              timestamp: new Date().toISOString()
            };

            this.debug('createScanRequest:payload', {
              requestedByUser,
              businessProfileId: scope.businessProfileId,
              hasBusinessAccess: scope.hasBusinessAccess,
              requestedForUserId
            });

            return this.postRequestWithRetry(body, access.token);
          })
        );
      })
    );
  }

  private fetchRequestsByBusinessProfile(
    businessProfileId: string,
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    const params = this.buildRequestsParams(limit);
    params.set('filter[business_profile][_eq]', businessProfileId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row))),
      catchError(() => of([]))
    );
  }

  private fetchRequestsByRequestedUser(
    userId: string,
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    const params = this.buildRequestsParams(limit);
    params.set('filter[requested_for_user][_eq]', userId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row))),
      catchError(() => of([]))
    );
  }

  private fetchRequestsByRequesterUser(
    userId: string,
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    const params = this.buildRequestsParams(limit);
    params.set('filter[requested_for_user][_eq]', userId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row))),
      catchError(() => of([]))
    );
  }

  private fetchRequestsForUserFallback(
    userId: string,
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    return forkJoin({
      requestedFor: this.fetchRequestsByRequestedUser(userId, limit, token),
      requestedBy: this.fetchRequestsByRequesterUser(userId, limit, token)
    }).pipe(
      map(({ requestedFor, requestedBy }) =>
        this.mergeRequestsById([...(requestedFor ?? []), ...(requestedBy ?? [])])
      ),
      catchError(() => of([]))
    );
  }

  private buildRequestsParams(limit: number): URLSearchParams {
    return new URLSearchParams({
      sort: '-timestamp',
      limit: String(limit),
      fields: [
        'id',
        'business_profile',
        'scan_id',
        'required_state',
        'response_status',
        'response_payload',
        'timestamp',
        'requested_for_user',
        'requested_for_email',
        'requested_for_phone',
        'Target'
      ].join(',')
    });
  }

  private resolveRequestScope(): Observable<{
    userId: string | null;
    hasBusinessAccess: boolean;
    businessProfileId: string | null;
  }> {
    const access = this.getAccessContext();
    const cachedState = this.getRecentHubAccessState(access.userId);
    if (cachedState) {
      return of({
        userId: this.normalizeId(cachedState.userId),
        hasBusinessAccess: Boolean(cachedState.hasPaidAccess),
        businessProfileId: this.normalizeId(cachedState.profile?.id)
      });
    }

    return this.getHubAccessState().pipe(
      timeout(this.requestTimeoutMs),
      map((state) => ({
        userId: this.normalizeId(state.userId ?? access.userId),
        hasBusinessAccess: Boolean(state.hasPaidAccess),
        businessProfileId: this.normalizeId(state.profile?.id)
      })),
      catchError(() =>
        of({
          userId: this.normalizeId(access.userId),
          hasBusinessAccess: false,
          businessProfileId: null
        })
      )
    );
  }

  private postRequestWithRetry(
    body: Record<string, unknown>,
    token: string | null
  ): Observable<CreateScanRequestResult> {
    return this.http.post<{ data?: { id?: unknown } }>(
      `${this.api}/items/requests`,
      body,
      this.requestOptions(token)
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => ({
        ok: true,
        message: 'Request sent successfully.',
        id: this.normalizeId(res?.data?.id)
      })),
      catchError((err) => {
        if (!this.shouldRetryWithMinimalPayload(err)) {
          return of({
            ok: false,
            message: this.toFriendlyError(err, 'Failed to send request.')
          });
        }

        return this.http.post<{ data?: { id?: unknown } }>(
          `${this.api}/items/requests`,
          body,
          this.requestOptions(token)
        ).pipe(
          timeout(this.requestTimeoutMs),
          map((res) => ({
            ok: true,
            message: 'Request sent successfully.',
            id: this.normalizeId(res?.data?.id)
          })),
          catchError(() =>
            this.http.post<{ data?: { id?: unknown } }>(
              `${this.api}/items/requests`,
              body,
              this.requestOptions(token)
            ).pipe(
              timeout(this.requestTimeoutMs),
              map((res) => ({
                ok: true,
                message: 'Request sent successfully.',
                id: this.normalizeId(res?.data?.id)
              })),
              catchError((retryErr) =>
                of({
                  ok: false,
                  message: this.toFriendlyError(retryErr, 'Failed to send request.')
                })
              )
            )
          )
        );
      })
    );
  }

  private mergeRequestsById(rows: RequestRecord[]): RequestRecord[] {
    const byId = new Map<string, RequestRecord>();
    for (const row of rows ?? []) {
      const id = this.pickString(row?.id);
      if (!id) {
        continue;
      }

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, row);
        continue;
      }

      const existingTs = this.toTimestamp(existing.requested_at);
      const nextTs = this.toTimestamp(row.requested_at);
      if ((nextTs ?? 0) >= (existingTs ?? 0)) {
        byId.set(id, row);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const aTs = this.toTimestamp(a.requested_at) ?? 0;
      const bTs = this.toTimestamp(b.requested_at) ?? 0;
      return bTs - aTs;
    });
  }

  listRequestInvites(_scopeHint: string | null, limit = 80): Observable<RequestInviteRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        if (!scope.hasBusinessAccess || !scope.businessProfileId) {
          return of([] as RequestInviteRecord[]);
        }

        const params = new URLSearchParams({
          sort: '-sent_at',
          limit: String(limit),
          fields: [
            'id',
            'request',
            'business_profile',
            'requested_by_user',
            'email',
            'phone',
            'status',
            'token',
            'sent_at',
            'claimed_at',
            'expires_at'
          ].join(',')
        });
        params.set('filter[business_profile][_eq]', scope.businessProfileId);

        return this.http.get<{ data?: any[] }>(
          `${this.api}/items/request_invites?${params.toString()}`,
          this.requestOptions(access.token)
        ).pipe(
          map((res) => (res.data ?? []).map((row) => this.normalizeInvite(row))),
          catchError(() => of([]))
        );
      })
    );
  }

  listRequestInvitesForBusinessProfile(
    profileId: string | null,
    limit = 80
  ): Observable<RequestInviteRecord[]> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    if (!normalizedProfileId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-sent_at',
      limit: String(limit),
      fields: [
        'id',
        'request',
        'business_profile',
        'requested_by_user',
        'email',
        'phone',
        'status',
        'token',
        'sent_at',
        'claimed_at',
        'expires_at'
      ].join(',')
    });
    params.set('filter[business_profile][_eq]', normalizedProfileId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/request_invites?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeInvite(row))),
      catchError(() => of([]))
    );
  }

  createRequestInvite(
    payload: { requestId: string; email?: string; phone?: string },
    _scopeHint: string | null
  ): Observable<ActionResult> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const requestId = this.pickString(payload.requestId);
    const email = this.pickString(payload.email);
    const phone = this.pickString(payload.phone);
    if (!requestId) {
      return of({ ok: false, message: 'Request ID is required.' });
    }
    if (!email && !phone) {
      return of({ ok: false, message: 'Email or phone is required.' });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        const requestedByUser = this.normalizeId(scope.userId ?? access.userId);
        if (!scope.businessProfileId || !requestedByUser) {
          return of({
            ok: false,
            message: 'Business profile context is missing. Refresh and try again.'
          });
        }

        const body: Record<string, unknown> = {
          request: requestId,
          business_profile: scope.businessProfileId,
          requested_by_user: requestedByUser,
          email: email ?? null,
          phone: phone ?? null,
          token: this.buildInviteToken(),
          status: 'pending',
          sent_at: now.toISOString(),
          expires_at: expiresAt.toISOString()
        };

        return this.http.post(
          `${this.api}/items/request_invites`,
          body,
          this.requestOptions(access.token)
        ).pipe(
          timeout(this.requestTimeoutMs),
          map(() => ({ ok: true, message: 'Invite created successfully.' })),
          catchError((err) =>
            of({
              ok: false,
              message: this.toFriendlyError(err, 'Failed to create invite.')
            })
          )
        );
      })
    );
  }

  claimPendingInviteForUser(
    user: Record<string, unknown> | null | undefined,
    accessToken?: string
  ): Observable<boolean> {
    const userId = this.normalizeId(user?.['id']);
    const userEmail = this.pickString(user?.['email'])?.toLowerCase() ?? null;
    const token = accessToken ?? this.getToken();

    if (!userId || !token) {
      return of(false);
    }
    return this.linkRequestsToUserByEmail(userId, userEmail, token).pipe(
      catchError(() => of(false))
    );
  }

  private linkRequestsToUserByEmail(
    userId: string,
    userEmail: string | null,
    token: string
  ): Observable<boolean> {
    if (!userEmail || !this.isEmailLike(userEmail)) {
      return of(false);
    }

    const params = new URLSearchParams({
      sort: '-sent_at',
      limit: '60',
      fields: 'id,request,email'
    });
    params.set('filter[_or][0][email][_eq]', userEmail);
    params.set('filter[_or][1][email][_icontains]', userEmail);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/request_invites?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => (res.data ?? [])
        .map((row) => ({
          id: this.normalizeId(row?.request)
        }))
        .filter((row) => Boolean(row.id))
        .map((row) => row.id as string)),
      switchMap((requestIds) => {
        if (!requestIds.length) {
          return of(false);
        }

        const linkCalls = requestIds.map((requestId) =>
          this.http.patch(
            `${this.api}/items/requests/${encodeURIComponent(requestId)}`,
            {
              requested_for_user: userId
            },
            this.requestOptions(token)
          ).pipe(
            map(() => true),
            catchError((err) => {
              if (!this.shouldRetryWithMinimalPayload(err)) {
                return of(false);
              }

              return this.http.patch(
                `${this.api}/items/requests/${encodeURIComponent(requestId)}`,
                { requested_for_user: userId },
                this.requestOptions(token)
              ).pipe(
                map(() => true),
                catchError(() => of(false))
              );
            })
          )
        );

        return forkJoin(linkCalls).pipe(
          map((results) => results.some(Boolean))
        );
      }),
      catchError(() => of(false))
    );
  }

  listReportExports(
    _scopeHint: string | null,
    limit = 40,
    teamUserIds?: string[] | null
  ): Observable<ReportExportRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const normalizedTeamUserIds = this.uniqueIds(teamUserIds ?? []);

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        const params = new URLSearchParams({
          sort: '-date_created',
          limit: String(limit),
          fields: 'id,format,status,file,filters,completed_at,business_profile,user,date_created'
        });

        if (scope.hasBusinessAccess && scope.businessProfileId) {
          params.set('filter[business_profile][_eq]', scope.businessProfileId);
        } else if (normalizedTeamUserIds.length) {
          params.set('filter[user][_in]', normalizedTeamUserIds.join(','));
        } else if (scope.userId ?? access.userId) {
          params.set('filter[user][_eq]', (scope.userId ?? access.userId) as string);
        } else {
          return of([] as ReportExportRecord[]);
        }

        return this.http.get<{ data?: any[] }>(
          `${this.api}/items/reports_exports?${params.toString()}`,
          this.requestOptions(access.token)
        ).pipe(
          map((res) => (res.data ?? []).map((row) => this.normalizeExport(row))),
          catchError(() => of([]))
        );
      })
    );
  }

  listReportExportsForBusinessProfile(
    profileId: string | null,
    limit = 40,
    teamUserIds?: string[] | null
  ): Observable<ReportExportRecord[]> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    if (!normalizedProfileId) {
      return of([]);
    }

    const normalizedTeamUserIds = this.uniqueIds(teamUserIds ?? []);
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,format,status,file,filters,completed_at,business_profile,user,date_created'
    });

    params.set('filter[business_profile][_eq]', normalizedProfileId);
    if (!normalizedTeamUserIds.length && access.userId) {
      params.set('filter[user][_eq]', access.userId);
    }

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/reports_exports?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeExport(row))),
      catchError(() => of([]))
    );
  }

  createReportExport(input: CreateReportExportInput, _scopeHint: string | null): Observable<ActionResult> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const normalizedFormat = this.normalizeExportFormat(input.format);
    const preparedFilters = this.buildReportExportFilters(input);

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        if (scope.hasBusinessAccess && !scope.businessProfileId) {
          return of({
            ok: false,
            message: 'Business profile is missing. Refresh and try again.'
          });
        }

        const primary: Record<string, unknown> = {
          format: normalizedFormat,
          status: 'pending'
        };
        if (preparedFilters !== null) {
          primary['filters'] = preparedFilters;
        }
        if (scope.hasBusinessAccess && scope.businessProfileId) {
          primary['business_profile'] = scope.businessProfileId;
        }
        if (scope.userId ?? access.userId) {
          primary['user'] = scope.userId ?? access.userId;
        }

        return this.http.post(
          `${this.api}/items/reports_exports`,
          primary,
          this.requestOptions(access.token)
        ).pipe(
          timeout(this.requestTimeoutMs),
          map(() => ({ ok: true, message: 'Export request queued.' })),
          catchError((err) => {
            if (!this.shouldRetryWithMinimalPayload(err)) {
              return of({
                ok: false,
                message: this.toFriendlyError(err, 'Failed to queue export request.')
              });
            }

            const fallbackWithSerializedFilters: Record<string, unknown> = { format: normalizedFormat };
            fallbackWithSerializedFilters['status'] = 'pending';
            if (scope.hasBusinessAccess && scope.businessProfileId) {
              fallbackWithSerializedFilters['business_profile'] = scope.businessProfileId;
            }
            if (scope.userId ?? access.userId) {
              fallbackWithSerializedFilters['user'] = scope.userId ?? access.userId;
            }
            if (preparedFilters !== null && preparedFilters !== undefined) {
              fallbackWithSerializedFilters['filters'] =
                typeof preparedFilters === 'string'
                  ? preparedFilters
                  : JSON.stringify(preparedFilters);
            }

            return this.http.post(
              `${this.api}/items/reports_exports`,
              fallbackWithSerializedFilters,
              this.requestOptions(access.token)
            ).pipe(
              timeout(this.requestTimeoutMs),
              map(() => ({ ok: true, message: 'Export request queued.' })),
              catchError(() => {
                const fallback: Record<string, unknown> = { format: normalizedFormat };
                if (scope.hasBusinessAccess && scope.businessProfileId) {
                  fallback['business_profile'] = scope.businessProfileId;
                }
                if (scope.userId ?? access.userId) {
                  fallback['user'] = scope.userId ?? access.userId;
                }

                return this.http.post(
                  `${this.api}/items/reports_exports`,
                  fallback,
                  this.requestOptions(access.token)
                ).pipe(
                  timeout(this.requestTimeoutMs),
                  map(() => ({ ok: true, message: 'Export request queued.' })),
                  catchError((retryErr) =>
                    of({
                      ok: false,
                      message: this.toFriendlyError(retryErr, 'Failed to queue export request.')
                    })
                  )
                );
              })
            );
          })
        );
      })
    );
  }

  listActivityEvents(
    _scopeHint: string | null,
    limit = 60,
    options?: ActivityQueryOptions
  ): Observable<ActivityEventRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const storedEmail =
      typeof localStorage !== 'undefined' ? this.pickString(localStorage.getItem('user_email')) : null;
    const teamUserIds = this.uniqueIds([...(options?.teamUserIds ?? []), access.userId]);
    const teamUserEmails = this.uniqueNonEmptyStrings([...(options?.teamUserEmails ?? []), storedEmail]);

    return this.resolveRequestScope().pipe(
      switchMap((scope) => {
        const source$ = scope.hasBusinessAccess && scope.businessProfileId
          ? this.fetchActivityEventsByBusinessProfile(scope.businessProfileId, limit, access.token)
          : teamUserIds.length
            ? this.fetchActivityEventsByUsers(teamUserIds, limit, access.token)
            : of([] as ActivityEventRecord[]);

        return source$.pipe(
          switchMap((events) => {
            if (events.length) {
              return of(events);
            }

            if (teamUserIds.length) {
              return this.fetchActivityEventsByUsers(teamUserIds, limit, access.token).pipe(
                switchMap((fallbackEvents) => of(fallbackEvents))
              );
            }

            return of([] as ActivityEventRecord[]);
          }),
          catchError(() => of([]))
        );
      })
    );
  }

  listActivityEventsForBusinessProfile(
    profileId: string | null,
    limit = 60,
    options?: ActivityQueryOptions
  ): Observable<ActivityEventRecord[]> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    if (!normalizedProfileId) {
      return of([]);
    }

    const storedEmail =
      typeof localStorage !== 'undefined' ? this.pickString(localStorage.getItem('user_email')) : null;
    const teamUserIds = this.uniqueIds([...(options?.teamUserIds ?? []), access.userId]);
    const teamUserEmails = this.uniqueNonEmptyStrings([...(options?.teamUserEmails ?? []), storedEmail]);

    return this.fetchActivityEventsByBusinessProfile(normalizedProfileId, limit, access.token).pipe(
      switchMap((events) => {
        if (events.length) {
          return of(events);
        }

        if (teamUserIds.length) {
          return this.fetchActivityEventsByUsers(teamUserIds, limit, access.token).pipe(
            switchMap((fallbackEvents) => of(fallbackEvents))
          );
        }

        return of([] as ActivityEventRecord[]);
      }),
      catchError(() => of([]))
    );
  }

  private fetchActivityEventsByBusinessProfile(
    businessProfileId: string,
    limit: number,
    token: string | null
  ): Observable<ActivityEventRecord[]> {
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: this.activityEventFields()
    });
    params.set('filter[business_profile][_eq]', businessProfileId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/activity_events?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeActivity(row))),
      catchError(() => of([]))
    );
  }

  private fetchActivityEventsByUsers(
    userIds: string[],
    limit: number,
    token: string | null
  ): Observable<ActivityEventRecord[]> {
    const normalizedUserIds = this.uniqueIds(userIds);
    if (!normalizedUserIds.length) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: this.activityEventFields()
    });
    params.set('filter[_or][0][actor][_in]', normalizedUserIds.join(','));
    params.set('filter[_or][1][target_user][_in]', normalizedUserIds.join(','));

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/activity_events?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeActivity(row))),
      catchError(() => of([]))
    );
  }

  private fetchAuditActivityEvents(
    userIds: string[],
    emails: string[],
    limit: number,
    token: string | null
  ): Observable<ActivityEventRecord[]> {
    void userIds;
    void emails;
    void limit;
    void token;
    return of([]);
  }

  private activityEventFields(): string {
    return [
      'id',
      'action',
      'entity_type',
      'entity_id',
      'payload',
      'business_profile',
      'date_created',
      'actor.id',
      'actor.email',
      'actor.first_name',
      'actor.last_name',
      'target_user.id',
      'target_user.email',
      'target_user.first_name',
      'target_user.last_name'
    ].join(',');
  }

  submitUpgradeRequest(_scopeHint: string | null, input?: SubmitUpgradeRequestInput): Observable<ActionResult> {
    void _scopeHint;
    void input;
    return of({
      ok: false,
      message: 'Workspace activation requests are no longer handled from the web app.'
    });
  }

  private fetchOwnedProfile(
    userId: string,
    token: string | null,
    activeBusinessProfileId?: string | null
  ): Observable<BusinessProfile | null> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: activeBusinessProfileId ? '1' : '20',
      fields: [
        'id',
        'owner_user',
        'company_name',
        'contact_name',
        'work_email',
        'phone',
        'industry',
        'team_size',
        'country',
        'city',
        'website',
        'billing_status',
        'trial_started_at',
        'trial_expires_at',
        'timezone',
        'is_active'
      ].join(',')
    });
    if (activeBusinessProfileId) {
      params.set('filter[id][_eq]', activeBusinessProfileId);
      params.set('filter[owner_user][_eq]', userId);
    } else {
      params.set('filter[owner_user][_eq]', userId);
    }

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profiles?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => this.pickBestOwnedProfile(res.data ?? []))
    );
  }

  private fetchMemberProfile(
    userId: string,
    token: string | null,
    activeBusinessProfileId?: string | null
  ): Observable<{ profile: BusinessProfile | null; membership: BusinessProfileMember | null }> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: activeBusinessProfileId ? '1' : '20',
      fields: [
        'id',
        'member_role',
        'status',
        'user',
        'business_profile',
        'user.id',
        'user.email',
        'user.first_name',
        'user.last_name',
        'business_profile.id',
        'business_profile.owner_user',
        'business_profile.company_name',
        'business_profile.contact_name',
        'business_profile.work_email',
        'business_profile.phone',
        'business_profile.industry',
        'business_profile.team_size',
        'business_profile.country',
        'business_profile.city',
        'business_profile.website',
        'business_profile.billing_status',
        'business_profile.trial_started_at',
        'business_profile.trial_expires_at',
        'business_profile.timezone',
        'business_profile.is_active'
      ].join(',')
    });
    params.set('filter[user][_eq]', userId);
    if (activeBusinessProfileId) {
      params.set('filter[business_profile][_eq]', activeBusinessProfileId);
    }

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profile_members?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => {
        const rows = res.data ?? [];
        const normalized = rows.map((row) => ({
          membership: this.normalizeMember(row),
          profile: this.normalizeProfile(row?.business_profile)
        })).filter((row) => row.profile);

        if (!normalized.length) {
          return { profile: null, membership: null };
        }

        const active = normalized.find((row) =>
          this.isMembershipActive(row.membership?.status)
        );
        if (!active) {
          return { profile: null, membership: null };
        }
        return active;
      })
    );
  }

  private buildAccessState(
    access: AccessContext,
    profile: BusinessProfile | null,
    membership: BusinessProfileMember | null
  ): BusinessHubAccessState {
    if (!profile) {
      return {
        userId: access.userId,
        profile: null,
        membership,
        hasPaidAccess: false,
        memberRole: null,
        permissions: this.resolvePermissions(null),
        trialExpired: false,
        trialExpiresAt: null,
        reason: 'No Business profile found for your account.'
      };
    }

    const isActive = this.coerceBoolean(profile.is_active);
    const trialExpiresAt = this.pickString(profile.trial_expires_at);
    const trialExpiresAtTs = this.toTimestamp(trialExpiresAt);
    const trialExpired = trialExpiresAtTs !== null && trialExpiresAtTs < Date.now();
    const trialActive = trialExpiresAtTs !== null && trialExpiresAtTs >= Date.now();
    const hasBusinessAccess = isActive || trialActive;
    const memberRole = this.resolveMemberRole(access.userId, profile, membership, access.activeMemberRole);
    const permissions = this.resolvePermissions(memberRole);

    let reason = '';
    if (!hasBusinessAccess) {
      if (trialExpired) {
        reason = 'Active workspace needs to be renewed.';
      } else if (!isActive) {
        reason = 'Active workspace is disabled.';
      } else {
        reason = 'Active workspace context is not available.';
      }
    }

    this.debug('buildAccessState:evaluation', {
      userId: access.userId,
      profileId: profile.id,
      activeBusinessProfileId: access.activeBusinessProfileId ?? null,
      billing_status: profile.billing_status ?? null,
      is_active: profile.is_active ?? null,
      trial_expires_at: trialExpiresAt,
      trialActive,
      memberRole,
      permissions
    });

    return {
      userId: access.userId,
      profile,
      membership,
      hasPaidAccess: hasBusinessAccess,
      memberRole,
      permissions,
      trialExpired,
      trialExpiresAt,
      reason
    };
  }

  private normalizeProfile(raw: any): BusinessProfile | null {
    const id = this.normalizeId(raw?.id);
    if (!id) {
      return null;
    }

    return {
      id,
      owner_user: this.normalizeId(raw?.owner_user),
      company_name: this.pickString(raw?.company_name),
      contact_name: this.pickString(raw?.contact_name),
      work_email: this.pickString(raw?.work_email),
      phone: this.pickString(raw?.phone),
      industry: this.pickString(raw?.industry),
      team_size: this.pickString(raw?.team_size),
      country: this.pickString(raw?.country),
      city: this.pickString(raw?.city),
      website: this.pickString(raw?.website),
      billing_status: this.pickString(raw?.billing_status),
      trial_started_at: this.pickString(raw?.trial_started_at),
      trial_expires_at: this.pickString(raw?.trial_expires_at),
      timezone: this.pickString(raw?.timezone),
      is_active: this.coerceBoolean(raw?.is_active)
    };
  }

  private normalizeMember(raw: any): BusinessProfileMember {
    return {
      id: this.normalizeId(raw?.id) ?? '',
      business_profile: this.normalizeId(raw?.business_profile),
      user_id: this.normalizeId(raw?.user?.id ?? raw?.user),
      user_label: this.userLabel(raw?.user),
      member_role: this.pickString(raw?.member_role),
      status: this.pickString(raw?.status)
    };
  }

  private normalizeRequest(raw: any): RequestRecord {
    const targetMember = this.normalizeId(raw?.target_member ?? raw?.requested_for_user);
    const requestType = this.pickString(raw?.request_type) ?? this.pickString(raw?.required_state) ?? 'pending';
    const status = this.pickString(raw?.status) ?? this.pickString(raw?.response_status) ?? 'pending';
    const completedScan = this.normalizeId(raw?.completed_scan ?? raw?.scan_id);
    const requestedAt = this.pickString(raw?.requested_at) ?? this.pickString(raw?.timestamp);
    return {
      id: this.normalizeId(raw?.id) ?? '',
      target: this.pickString(raw?.Target) ?? 'scan',
      recipient: this.requestRecipient(raw),
      requested_by_user: this.normalizeId(raw?.requested_by_user),
      target_member: targetMember,
      requested_for_user: this.normalizeId(raw?.requested_for_user) ?? targetMember,
      business_profile: this.normalizeId(raw?.business_profile),
      department: this.normalizeId(raw?.department),
      recipient_industry: null,
      request_type: requestType,
      status,
      response_status: status,
      required_state: requestType,
      cancelled: this.pickString(raw?.cancelled),
      requested_at: requestedAt,
      due_at: this.pickString(raw?.due_at),
      completed_at: this.pickString(raw?.completed_at),
      completed_scan: completedScan,
      scan_id: this.normalizeId(raw?.scan_id),
      response_payload: raw?.response_payload,
      timestamp: requestedAt,
      requested_for_email: this.pickString(raw?.requested_for_email),
      requested_for_phone: this.pickString(raw?.requested_for_phone),
      Target: this.pickString(raw?.Target)
    };
  }

  private attachRecipientIndustries(
    rows: RequestRecord[],
    token: string | null
  ): Observable<RequestRecord[]> {
    void token;
    return of(rows);
  }

  private normalizeInvite(raw: any): RequestInviteRecord {
    return {
      id: this.normalizeId(raw?.id) ?? '',
      request: this.normalizeId(raw?.request),
      email: this.pickString(raw?.email),
      phone: this.pickString(raw?.phone),
      status: this.pickString(raw?.status),
      token: this.pickString(raw?.token),
      sent_at: this.pickString(raw?.sent_at),
      claimed_at: this.pickString(raw?.claimed_at),
      expires_at: this.pickString(raw?.expires_at),
      business_profile: this.normalizeId(raw?.business_profile),
      requested_by_user: this.normalizeId(raw?.requested_by_user),
      date_created: this.pickString(raw?.date_created) ?? this.pickString(raw?.sent_at)
    };
  }

  private normalizeExport(raw: any): ReportExportRecord {
    const filters =
      typeof raw?.filters === 'string'
        ? raw.filters
        : raw?.filters
          ? JSON.stringify(raw.filters)
          : null;

    const file =
      this.pickString(raw?.file?.id) ??
      this.pickString(raw?.file?.filename_download) ??
      this.pickString(raw?.file);

    return {
      id: this.normalizeId(raw?.id) ?? '',
      format: (this.pickString(raw?.format) ?? 'csv').toLowerCase(),
      status: this.pickString(raw?.status) ?? (file ? 'ready' : 'pending'),
      file,
      filters,
      completed_at: this.pickString(raw?.completed_at),
      business_profile: this.normalizeId(raw?.business_profile),
      user: this.normalizeId(raw?.user),
      date_created: this.pickString(raw?.date_created)
    };
  }

  private normalizeActivity(raw: any): ActivityEventRecord {
    const payload =
      typeof raw?.payload === 'string'
        ? raw.payload
        : raw?.payload
          ? JSON.stringify(raw.payload)
          : null;

    return {
      id: this.normalizeId(raw?.id) ?? '',
      actor_id: this.normalizeId(raw?.actor?.id ?? raw?.actor),
      actor_label: this.userLabel(raw?.actor),
      target_user_id: this.normalizeId(raw?.target_user?.id ?? raw?.target_user),
      target_user_label: this.userLabel(raw?.target_user),
      action: this.pickString(raw?.action),
      entity_type: this.pickString(raw?.entity_type),
      entity_id: this.pickString(raw?.entity_id),
      payload,
      business_profile: this.normalizeId(raw?.business_profile),
      date_created: this.pickString(raw?.date_created)
    };
  }

  private normalizeAuditActivity(raw: any): ActivityEventRecord {
    const actor = raw?.user;
    const actorId = this.normalizeId(actor?.id ?? actor ?? raw?.user_id);
    const actorLabel =
      this.userLabel(actor) ??
      this.pickString(raw?.user_email) ??
      this.pickString(raw?.created_by) ??
      actorId;

    const metadata = raw?.metadata ?? raw?.meta ?? null;
    const payload = metadata
      ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
      : this.pickString(raw?.description);

    return {
      id: this.normalizeId(raw?.id) ?? '',
      actor_id: actorId,
      actor_label: actorLabel,
      target_user_id: null,
      target_user_label: null,
      action: this.pickString(raw?.type) ?? 'audit_log',
      entity_type: 'audit_log',
      entity_id: this.normalizeId(raw?.id),
      payload,
      date_created: this.pickString(raw?.date_created)
    };
  }

  private requestRecipient(raw: any): string {
    const user = raw?.target_member ?? raw?.requested_for_user;
    const userName = this.userLabel(user);
    if (userName) {
      return userName;
    }
    const email = this.pickString(raw?.requested_for_email) ?? this.pickString(raw?.Target);
    if (email) {
      return email;
    }
    return '-';
  }

  private userLabel(raw: any): string | null {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'string') {
      return raw;
    }
    const first = this.readString(raw?.first_name);
    const last = this.readString(raw?.last_name);
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    if (fullName && /[A-Za-z\u0600-\u06FF]/.test(fullName)) {
      return fullName;
    }
    const email = this.pickString(raw?.email);
    if (email) {
      return email;
    }
    return this.normalizeId(raw?.id);
  }

  private isMembershipActive(status: string | null | undefined): boolean {
    const normalized = (status ?? '').trim().toLowerCase();
    return normalized === 'active' || normalized === 'approved' || normalized === 'accepted';
  }

  private parseFilters(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    if (typeof value === 'object') {
      return value;
    }
    return value;
  }

  private buildReportExportFilters(input: CreateReportExportInput): unknown {
    const parsed = this.parseFilters(input.filters);
    const scope = input.scope === 'selected' ? 'selected_members' : 'team';
    const memberUserIds = this.uniqueIds(input.memberUserIds ?? []);
    const memberLabels = this.uniqueNonEmptyStrings(input.memberLabels ?? []);

    const metadata: Record<string, unknown> = {
      report_type: 'activity_log',
      scope,
      member_user_ids: memberUserIds,
      member_labels: memberLabels,
      generated_at: new Date().toISOString()
    };

    if (parsed === null || parsed === undefined) {
      return metadata;
    }
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        ...(parsed as Record<string, unknown>),
        ...metadata
      };
    }
    if (Array.isArray(parsed)) {
      return {
        ...metadata,
        custom_filters: parsed
      };
    }

    return {
      ...metadata,
      custom_filters_raw: String(parsed)
    };
  }

  private normalizeExportFormat(value: unknown): 'csv' | 'pdf' {
    const normalized = (this.pickString(value) ?? 'csv').trim().toLowerCase();
    return normalized === 'pdf' ? 'pdf' : 'csv';
  }

  private buildInviteToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2, 12);
    const time = Date.now().toString(36);
    return `${time}${random}`.slice(0, 20);
  }

  private requestOptions(token: string | null): { headers?: HttpHeaders; withCredentials: boolean } {
    const headers = this.buildAuthHeaders(token);
    return headers ? { headers, withCredentials: true } : { withCredentials: true };
  }

  private readStoredAccessContext(): {
    userId: string | null;
    activeBusinessProfileId: string | null;
    activeBusinessProfileName: string | null;
    activeDepartmentId: string | null;
    activeDepartmentName: string | null;
    activeMemberRole: string | null;
  } {
    if (typeof localStorage === 'undefined') {
      return {
        userId: null,
        activeBusinessProfileId: null,
        activeBusinessProfileName: null,
        activeDepartmentId: null,
        activeDepartmentName: null,
        activeMemberRole: null
      };
    }

    return {
      userId: this.normalizeId(localStorage.getItem('current_user_id')),
      activeBusinessProfileId: this.normalizeId(localStorage.getItem('active_business_profile')),
      activeBusinessProfileName: this.pickString(localStorage.getItem('active_business_profile_name')),
      activeDepartmentId: this.normalizeId(localStorage.getItem('active_department')),
      activeDepartmentName: this.pickString(localStorage.getItem('active_department_name')),
      activeMemberRole: this.pickString(localStorage.getItem('active_member_role'))
    };
  }

  private getAccessContext(): AccessContext {
    const token = this.getToken();
    const stored = this.readStoredAccessContext();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const userIdValue = token
      ? (
        payload?.['id'] ??
        payload?.['user_id'] ??
        payload?.['sub'] ??
        payload?.['user'] ??
        payload?.['userId'] ??
        stored.userId
      )
      : null;
    return {
      token,
      userId: this.normalizeId(userIdValue),
      activeBusinessProfileId: this.normalizeId(
        payload?.['active_business_profile'] ??
        payload?.['activeBusinessProfile'] ??
        stored.activeBusinessProfileId
      ),
      activeDepartmentId: this.normalizeId(
        payload?.['active_department'] ??
        payload?.['activeDepartment'] ??
        stored.activeDepartmentId
      ),
      activeMemberRole: this.pickString(
        payload?.['active_member_role'] ??
        payload?.['activeMemberRole'] ??
        stored.activeMemberRole
      )
    };
  }

  private resolveAccessContext(access: AccessContext): Observable<AccessContext> {
    const stored = this.readStoredAccessContext();
    const fallback: AccessContext = {
      token: access.token,
      userId: access.token ? (access.userId ?? stored.userId) : null,
      activeBusinessProfileId: access.activeBusinessProfileId ?? stored.activeBusinessProfileId,
      activeDepartmentId: access.activeDepartmentId ?? stored.activeDepartmentId,
      activeMemberRole: access.activeMemberRole ?? stored.activeMemberRole
    };

    if (!access.token) {
      return this.resolveCurrentUserFromSession(null).pipe(
        map((resolved) => ({
          token: null,
          userId: resolved.userId ?? null,
          activeBusinessProfileId: resolved.activeBusinessProfileId ?? null,
          activeDepartmentId: resolved.activeDepartmentId ?? null,
          activeMemberRole: resolved.activeMemberRole ?? null
        })),
        catchError(() =>
          of({
            token: null,
            userId: null,
            activeBusinessProfileId: null,
            activeDepartmentId: null,
            activeMemberRole: null
          })
        )
      );
    }

    if (fallback.userId && fallback.activeBusinessProfileId) {
      this.debug('resolveAccessContext:tokenUserIdFastPath', {
        userId: fallback.userId,
        activeBusinessProfileId: fallback.activeBusinessProfileId
      });
      return of(fallback);
    }

    return this.resolveCurrentUserFromSession(access.token).pipe(
      map((resolved) => ({
        token: fallback.token,
        userId: resolved.userId ?? fallback.userId,
        activeBusinessProfileId: resolved.activeBusinessProfileId ?? fallback.activeBusinessProfileId,
        activeDepartmentId: resolved.activeDepartmentId ?? fallback.activeDepartmentId,
        activeMemberRole: resolved.activeMemberRole ?? fallback.activeMemberRole
      })),
      catchError((err) => {
        this.debug('resolveAccessContext:fallback', {
          status: err?.status ?? null,
          reason: this.readError(err, ''),
          userId: fallback.userId
        });
        return of(fallback);
      })
    );
  }

  private resolveCurrentUserFromSession(token: string | null): Observable<{
    userId: string | null;
    activeBusinessProfileId: string | null;
    activeBusinessProfileName: string | null;
    activeDepartmentId: string | null;
    activeDepartmentName: string | null;
    activeMemberRole: string | null;
  }> {
    const stored = this.readStoredAccessContext();

    return this.http.get<any>(
      `${this.api}/users/me?fields=id,email,first_name,last_name`,
      this.requestOptions(token)
    ).pipe(
      switchMap((res) => {
        const user = res?.data ?? res ?? {};
        const userId = this.normalizeId(user?.id) ?? stored.userId;
        const activeBusinessProfileId = stored.activeBusinessProfileId;
        const activeDepartmentId = stored.activeDepartmentId;
        const activeMemberRole = stored.activeMemberRole;

        return forkJoin({
          companyName: this.resolveBusinessProfileName(activeBusinessProfileId, token),
          departmentName: this.resolveDepartmentName(activeDepartmentId, token)
        }).pipe(
          map(({ companyName, departmentName }) => ({
            userId,
            hasActiveBusinessProfileField: false,
            hasActiveDepartmentField: false,
            activeBusinessProfileId,
            activeBusinessProfileName: companyName ?? stored.activeBusinessProfileName,
            activeDepartmentId,
            activeDepartmentName: departmentName ?? stored.activeDepartmentName,
            activeMemberRole
          })),
          tap((resolved) => {
            if (typeof localStorage !== 'undefined') {
              if (resolved.userId) {
                localStorage.setItem('current_user_id', resolved.userId);
              }
              if (resolved.activeBusinessProfileId) {
                localStorage.setItem('active_business_profile', resolved.activeBusinessProfileId);
              } else if (resolved.hasActiveBusinessProfileField) {
                localStorage.removeItem('active_business_profile');
              }
              if (resolved.activeBusinessProfileName) {
                localStorage.setItem('active_business_profile_name', resolved.activeBusinessProfileName);
              } else if (resolved.hasActiveBusinessProfileField) {
                localStorage.removeItem('active_business_profile_name');
              }
              if (resolved.activeDepartmentId) {
                localStorage.setItem('active_department', resolved.activeDepartmentId);
              } else if (resolved.hasActiveDepartmentField) {
                localStorage.removeItem('active_department');
              }
              if (resolved.activeDepartmentName) {
                localStorage.setItem('active_department_name', resolved.activeDepartmentName);
              } else if (resolved.hasActiveDepartmentField) {
                localStorage.removeItem('active_department_name');
              }
              if (resolved.activeMemberRole) {
                localStorage.setItem('active_member_role', resolved.activeMemberRole);
              }
            }

            this.debug('resolveCurrentUserFromSession:resolved', {
              userId: resolved.userId,
              activeBusinessProfileId: resolved.activeBusinessProfileId,
              activeBusinessProfileName: resolved.activeBusinessProfileName,
              activeDepartmentId: resolved.activeDepartmentId,
              activeDepartmentName: resolved.activeDepartmentName,
              activeMemberRole: resolved.activeMemberRole
            });
          }),
          map(({ hasActiveBusinessProfileField, hasActiveDepartmentField, ...resolved }) => resolved)
        );
      }),
      catchError((err) => {
        const status = typeof err?.status === 'number' ? err.status : 0;
        const unauthorized = status === 401 || status === 403;
        const fallbackUserId = unauthorized ? null : stored.userId;

        if (unauthorized && typeof localStorage !== 'undefined') {
          localStorage.removeItem('current_user_id');
          localStorage.removeItem('active_business_profile');
          localStorage.removeItem('active_department');
          localStorage.removeItem('active_member_role');
        }

        this.debug('resolveCurrentUserFromSession:fallback', {
          status: err?.status ?? null,
          reason: this.readError(err, ''),
          userId: fallbackUserId
        });
        return of({
          userId: fallbackUserId,
          activeBusinessProfileId: unauthorized ? null : stored.activeBusinessProfileId,
          activeBusinessProfileName: unauthorized ? null : stored.activeBusinessProfileName,
          activeDepartmentId: unauthorized ? null : stored.activeDepartmentId,
          activeDepartmentName: unauthorized ? null : stored.activeDepartmentName,
          activeMemberRole: unauthorized ? null : stored.activeMemberRole
        });
      })
    );
  }

  private ensureOwnerMembership(
    profileId: string,
    userId: string,
    token: string | null
  ): Observable<boolean> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: '1',
      fields: 'id,member_role,status,user,business_profile'
    });
    params.set('filter[business_profile][_eq]', profileId);
    params.set('filter[user][_eq]', userId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profile_members?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      switchMap((res) => {
        const existing = Array.isArray(res?.data) ? res.data[0] : null;
        if (existing?.id) {
          return of(true);
        }

        const payload = {
          business_profile: profileId,
          user: userId,
          member_role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString()
        };

        return this.http.post(
          `${this.api}/items/business_profile_members`,
          payload,
          this.requestOptions(token)
        ).pipe(
          map(() => true),
          catchError(() => of(false))
        );
      }),
      catchError(() => of(false))
    );
  }

  private findUserIdByEmail(email: string, token: string | null): Observable<string | null> {
    const params = new URLSearchParams({
      limit: '1',
      fields: 'id,email'
    });
    params.set('filter[email][_eq]', email);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/users?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => this.normalizeId((res.data ?? [])[0]?.id))
    );
  }

  private describeMemberLookupError(err: any): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail = this.readError(err, '');

    if (status === 401 || status === 403) {
      return 'Permission denied while finding user by email. Allow reading users for this role or use an admin token.';
    }

    if (status === 404) {
      return 'User lookup endpoint is not available on this backend.';
    }

    return this.toFriendlyError(err, 'Failed to manage team member.');
  }

  private upsertBusinessProfileMember(
    profileId: string,
    userId: string,
    role: BusinessMemberRole,
    token: string | null
  ): Observable<ActionResult> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: '1',
      fields: 'id,member_role,status,user,business_profile'
    });
    params.set('filter[business_profile][_eq]', profileId);
    params.set('filter[user][_eq]', userId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profile_members?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      switchMap((res) => {
        const existing = Array.isArray(res?.data) ? res.data[0] : null;
        const payload: Record<string, unknown> = {
          member_role: role,
          status: 'active'
        };

        if (existing?.id) {
          return this.http.patch(
            `${this.api}/items/business_profile_members/${existing.id}`,
            payload,
            this.requestOptions(token)
          ).pipe(
            map(() => ({ ok: true, message: 'Team member updated successfully.' })),
            catchError((err) =>
              of({
                ok: false,
                message: this.toFriendlyError(err, 'Failed to update team member.')
              })
            )
          );
        }

        return this.http.post(
          `${this.api}/items/business_profile_members`,
          {
            business_profile: profileId,
            user: userId,
            ...payload
          },
          this.requestOptions(token)
        ).pipe(
          map(() => ({ ok: true, message: 'Team member added successfully.' })),
          catchError((err) =>
            of({
              ok: false,
              message: this.toFriendlyError(err, 'Failed to add team member.')
            })
          )
        );
      }),
      catchError((err) =>
        of({
          ok: false,
          message: this.toFriendlyError(err, 'Failed to load team member state.')
        })
      )
    );
  }

  private getToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const candidates = [
        localStorage.getItem('token'),
        localStorage.getItem('access_token'),
        localStorage.getItem('directus_token')
      ].filter((value): value is string => Boolean(value && value.trim()));

      for (const token of candidates) {
        if (!this.isTokenExpired(token)) {
          return token;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token) {
      return null;
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    if (typeof exp !== 'number') {
      return false;
    }
    return Math.floor(Date.now() / 1000) >= exp;
  }

  private resolveAccessErrorReason(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    if (status === 401 || status === 403) {
      return 'Session expired or unauthorized. Please sign in again.';
    }
    return this.toFriendlyError(err, fallback);
  }

  private getRecentHubAccessState(currentUserId: string | null): BusinessHubAccessState | null {
    if (!currentUserId) {
      return null;
    }

    const memoryState = this.lastHubAccessState;
    if (memoryState && this.isHubAccessStateUsable(memoryState, this.lastHubAccessStateAt, currentUserId)) {
      return memoryState;
    }

    const stored = this.readStoredHubAccessState();
    if (!stored) {
      return null;
    }

    if (!this.isHubAccessStateUsable(stored.state, stored.updatedAt, currentUserId)) {
      return null;
    }

    this.lastHubAccessState = stored.state;
    this.lastHubAccessStateAt = stored.updatedAt;
    return stored.state;
  }

  private isHubAccessStateUsable(
    state: BusinessHubAccessState | null,
    updatedAt: number,
    currentUserId: string | null
  ): boolean {
    if (!state || !currentUserId) {
      return false;
    }
    if (updatedAt <= 0 || Date.now() - updatedAt > this.hubAccessCacheTtlMs) {
      return false;
    }

    const cachedUserId = this.normalizeId(state.userId);
    return Boolean(cachedUserId && cachedUserId === currentUserId);
  }

  private persistHubAccessState(state: BusinessHubAccessState, updatedAt: number): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(
        this.hubAccessStateStorageKey,
        JSON.stringify({
          updatedAt,
          state
        })
      );
    } catch {
      // ignore storage errors
    }
  }

  private readStoredHubAccessState(): { state: BusinessHubAccessState; updatedAt: number } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.hubAccessStateStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const updatedAt = typeof parsed['updatedAt'] === 'number' ? parsed['updatedAt'] : 0;
      const state = (parsed['state'] ?? null) as BusinessHubAccessState | null;
      if (!state || typeof state !== 'object') {
        return null;
      }
      return { state, updatedAt };
    } catch {
      return null;
    }
  }

  private toFriendlyError(err: any, fallback: string): string {
    const detail = this.readError(err, '');
    const status = typeof err?.status === 'number' ? err.status : 0;
    const normalized = detail.toLowerCase();

    if (
      status === 0 ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('connection refused') ||
      normalized.includes('timeout')
    ) {
      return `Network error: ${detail || fallback}`;
    }
    if (status >= 500) {
      return `Server error (${status}): ${detail || fallback}`;
    }
    if (status >= 400) {
      return `Request error (${status}): ${detail || fallback}`;
    }
    return detail || fallback;
  }

  private readError(err: any, fallback: string): string {
    if (!err) {
      return fallback;
    }
    if (typeof err?.error === 'string' && err.error.trim()) {
      return err.error;
    }
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      fallback
    );
  }

  private shouldRetryWithMinimalPayload(err: any): boolean {
    const status = typeof err?.status === 'number' ? err.status : 0;
    if (status !== 400 && status !== 422) {
      return false;
    }

    const message = this.readError(err, '').toLowerCase();
    return (
      message.includes('field') ||
      message.includes('payload') ||
      message.includes('invalid') ||
      message.includes('unknown') ||
      message.includes('does not exist')
    );
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return null;
  }

  private resolveBusinessProfileName(profileId: string | null, token: string | null): Observable<string | null> {
    if (!profileId) {
      return of(null);
    }

    const params = new URLSearchParams({
      limit: '1',
      fields: 'id,company_name'
    });
    params.set('filter[id][_eq]', profileId);

    return this.http.get<{ data?: Array<{ company_name?: string | null }> }>(
      `${this.api}/items/business_profiles?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => this.pickString(res?.data?.[0]?.company_name)),
      catchError(() => of(null))
    );
  }

  private resolveDepartmentName(departmentId: string | null, token: string | null): Observable<string | null> {
    if (!departmentId) {
      return of(null);
    }

    const params = new URLSearchParams({
      limit: '1',
      fields: 'id,name'
    });
    params.set('filter[id][_eq]', departmentId);

    return this.http.get<{ data?: Array<{ name?: string | null }> }>(
      `${this.api}/items/departments?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => {
        const row = res?.data?.[0] ?? null;
        return this.pickString(row?.name);
      }),
      catchError(() => of(null))
    );
  }

  private assignString(target: Record<string, unknown>, key: string, value: unknown): void {
    const normalized = this.pickString(value);
    if (normalized !== null) {
      target[key] = normalized;
    }
  }

  private assignNumber(target: Record<string, unknown>, key: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }
    target[key] = value;
  }

  private assignBoolean(target: Record<string, unknown>, key: string, value: unknown): void {
    if (typeof value !== 'boolean') {
      return;
    }
    target[key] = value;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private uniqueIds(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    for (const value of values ?? []) {
      const id = this.normalizeId(value);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
    }
    return Array.from(seen);
  }

  private uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Map<string, string>();
    for (const value of values ?? []) {
      const normalized = this.pickString(value);
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.set(key, normalized);
    }
    return Array.from(seen.values());
  }

  private coerceBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'active';
    }
    return false;
  }

  private isDebugEnabled(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const raw = (localStorage.getItem('business_center_debug') ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  private debug(message: string, details?: unknown): void {
    if (!this.isDebugEnabled()) {
      return;
    }
    if (details === undefined) {
      console.debug(`[BusinessCenter] ${message}`);
      return;
    }
    console.debug(`[BusinessCenter] ${message}`, details);
  }

  private resolveMemberRole(
    userId: string | null,
    profile: BusinessProfile | null,
    membership: BusinessProfileMember | null,
    activeMemberRole?: string | null
  ): BusinessMemberRole | null {
    if (!profile) {
      return null;
    }

    const activeRole = this.readString(activeMemberRole).toLowerCase();
    if (activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'member' || activeRole === 'viewer') {
      return activeRole;
    }

    const ownerUserId = this.normalizeId(profile.owner_user);
    if (userId && ownerUserId && userId === ownerUserId) {
      return 'owner';
    }

    const raw = this.readString(membership?.member_role).toLowerCase();
    if (raw === 'owner' || raw === 'admin' || raw === 'manager' || raw === 'member' || raw === 'viewer') {
      return raw;
    }

    if (membership?.id) {
      return 'member';
    }

    return null;
  }

  private resolvePermissions(role: BusinessMemberRole | null): BusinessRolePermissions {
    if (role === 'owner') {
      return {
        canInvite: true,
        canUpgrade: true,
        canManageMembers: true,
        canUseSystem: true,
        isReadOnly: false
      };
    }
    if (role === 'admin') {
      return {
        canInvite: true,
        canUpgrade: false,
        canManageMembers: true,
        canUseSystem: true,
        isReadOnly: false
      };
    }
    if (role === 'manager') {
      return {
        canInvite: true,
        canUpgrade: false,
        canManageMembers: false,
        canUseSystem: true,
        isReadOnly: false
      };
    }
    if (role === 'member') {
      return {
        canInvite: false,
        canUpgrade: false,
        canManageMembers: false,
        canUseSystem: true,
        isReadOnly: false
      };
    }
    if (role === 'viewer') {
      return {
        canInvite: false,
        canUpgrade: false,
        canManageMembers: false,
        canUseSystem: false,
        isReadOnly: true
      };
    }

    return {
      canInvite: false,
      canUpgrade: false,
      canManageMembers: false,
      canUseSystem: false,
      isReadOnly: true
    };
  }

  private normalizeBusinessMemberRole(value: unknown): BusinessMemberRole | null {
    const raw = this.readString(value).toLowerCase();
    if (raw === 'owner' || raw === 'admin' || raw === 'manager' || raw === 'member' || raw === 'viewer') {
      return raw;
    }
    return null;
  }

  private isRoleAssignableByActor(
    actorRole: BusinessMemberRole,
    targetRole: BusinessMemberRole
  ): boolean {
    if (actorRole === 'owner') {
      return true;
    }
    if (actorRole === 'admin') {
      return targetRole !== 'owner';
    }
    return false;
  }

  private pickBestOwnedProfile(rows: any[]): BusinessProfile | null {
    const profiles = (rows ?? [])
      .map((row) => this.normalizeProfile(row))
      .filter((row): row is BusinessProfile => Boolean(row));

    if (!profiles.length) {
      return null;
    }

    const scored = profiles.map((profile) => ({
      profile,
      score: this.profileCompletenessScore(profile)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].profile;
  }

  private profileCompletenessScore(profile: BusinessProfile): number {
    const fields = [
      profile.company_name,
      profile.contact_name,
      profile.work_email,
      profile.phone,
      profile.industry,
      profile.team_size,
      profile.country,
      profile.city,
      profile.website
    ];

    let score = fields.reduce((sum, value) => sum + (this.pickString(value) ? 1 : 0), 0);

    if (this.isEmailLike(profile.company_name)) {
      score -= 3;
    }

    return score;
  }

  private dedupeMembers(rows: BusinessProfileMember[]): BusinessProfileMember[] {
    const mapByUser = new Map<string, BusinessProfileMember>();

    for (const row of rows ?? []) {
      const key = this.pickString(row.user_id) ?? this.pickString(row.id);
      if (!key) {
        continue;
      }
      if (!mapByUser.has(key)) {
        mapByUser.set(key, row);
      }
    }

    return Array.from(mapByUser.values());
  }

  private isEmailLike(value: string | null | undefined): boolean {
    const raw = this.pickString(value);
    if (!raw) {
      return false;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  }

  private mapManagedRole(role: ManageTeamMemberRole): BusinessMemberRole {
    const normalized = (role ?? 'member').toString().trim().toLowerCase();
    if (normalized === 'owner') return 'owner';
    if (normalized === 'admin') return 'admin';
    if (normalized === 'manager') return 'manager';
    if (normalized === 'business') return 'admin';
    if (normalized === 'viewer') return 'member';
    return 'member';
  }

  private toTimestamp(value: string | null | undefined): number | null {
    const raw = this.pickString(value);
    if (!raw) {
      return null;
    }
    const ts = new Date(raw).getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  private localDateKey(value: unknown): string | null {
    let date: Date | null = null;

    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      date = new Date(value);
    } else {
      const raw = this.pickString(value);
      if (!raw) {
        return null;
      }
      date = new Date(raw);
    }

    const ts = date.getTime();
    if (Number.isNaN(ts)) {
      return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private readString(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return '';
  }
}
