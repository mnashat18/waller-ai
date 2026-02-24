import { take } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type BusinessProfile = {
  id: string;
  owner_user?: string | null;
  source_request?: string | null;
  plan_code?: string | null;
  billing_status?: string | null;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
  is_active?: boolean | null;
  company_name?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  work_email?: string | null;
  phone?: string | null;
  industry?: string | null;
  team_size?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
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
  requested_for_email?: string | null;
  requested_by_user?: string | null;
  requested_for_user?: string | null;
  business_profile?: string | null;
  recipient_industry?: string | null;
  required_state: string;
  response_status: string;
  timestamp?: string | null;
  [key: string]: unknown;
};

export type CreateScanRequestPayload = {
  requested_for_email: string;
  required_state: string;
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

type InviteRequestView = {
  id?: unknown;
  request?: unknown;
  email?: unknown;
  status?: unknown;
  sent_at?: unknown;
  claimed_at?: unknown;
  date_created?: unknown;
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

        return this.fetchOwnedProfile(userId, token).pipe(
          take(1),
          switchMap((ownedProfile) => {
            this.debug('getHubAccessState:ownedProfileLookup', {
              userId,
              found: Boolean(ownedProfile?.id),
              profileId: ownedProfile?.id ?? null
            });

            if (ownedProfile?.id) {
              return of({
                profile: ownedProfile,
                membership: null
              });
            }

            return this.fetchMemberProfile(userId, token).pipe(
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

    return this.fetchOwnedProfile(userId, token).pipe(
      switchMap((owned) => {
        if (owned?.id) {
          return this.ensureOwnerMembership(owned.id, userId, token).pipe(
            map(() => owned)
          );
        }
        return of(null);
      }),
      catchError(() => of(null))
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
      map((res) => this.dedupeMembers((res.data ?? []).map((row) => this.normalizeMember(row))))
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

    const params = this.buildRequestsParams(1);
    params.set('filter[_or][0][requested_for_email][_eq]', normalizedEmail);
    params.set('filter[_or][1][requested_for_email][_icontains]', normalizedEmail);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).length > 0),
      catchError(() => of(false))
    );
  }

  countTodayRequests(rows: Array<{ timestamp?: string | null | undefined }>): number {
    const today = this.localDateKey(Date.now());
    if (!today) {
      return 0;
    }

    let count = 0;
    for (const row of rows ?? []) {
      const key = this.localDateKey(row?.timestamp ?? null);
      if (key === today) {
        count += 1;
      }
    }
    return count;
  }

  remainingTodayRequests(
    rows: Array<{ timestamp?: string | null | undefined }>,
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

    const requestedForEmail = this.pickString(payload.requested_for_email)?.toLowerCase() ?? '';
    const requiredState = this.pickString(payload.required_state) ?? '';

    if (!this.isEmailLike(requestedForEmail)) {
      return of({ ok: false, message: 'Recipient email is invalid.' });
    }
    if (!requiredState) {
      return of({ ok: false, message: 'Required state is missing.' });
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

        const body: Record<string, unknown> = {
          requested_for_email: requestedForEmail,
          required_state: requiredState,
          requested_by_user: requestedByUser
        };
        if (scope.hasBusinessAccess) {
          body['business_profile'] = scope.businessProfileId;
        }

        this.debug('createScanRequest:payload', {
          requestedByUser,
          businessProfileId: scope.businessProfileId,
          hasBusinessAccess: scope.hasBusinessAccess,
          requestedForEmail
        });

        return this.postRequestWithRetry(body, access.token);
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
    params.set('filter[requested_by_user][_eq]', userId);

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
        'requested_by_user',
        'requested_for_user',
        'required_state',
        'response_status',
        'timestamp',
        'requested_for_email',
        'requested_for_phone'
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

      const existingTs = this.toTimestamp(existing.timestamp);
      const nextTs = this.toTimestamp(row.timestamp);
      if ((nextTs ?? 0) >= (existingTs ?? 0)) {
        byId.set(id, row);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const aTs = this.toTimestamp(a.timestamp) ?? 0;
      const bTs = this.toTimestamp(b.timestamp) ?? 0;
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

  listInvitedRequestsByEmail(email: string, limit = 60): Observable<RequestRecord[]> {
    const normalizedEmail = this.pickString(email)?.toLowerCase() ?? '';
    if (!this.isEmailLike(normalizedEmail)) {
      return of([]);
    }

    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-sent_at',
      limit: String(limit),
      fields: [
        'id',
        'email',
        'status',
        'sent_at',
        'claimed_at',
        'date_created',
        'request.id',
        'request.requested_for_email',
        'request.requested_by_user',
        'request.requested_for_user',
        'request.required_state',
        'request.response_status',
        'request.timestamp'
      ].join(',')
    });
    params.set('filter[_or][0][email][_eq]', normalizedEmail);
    params.set('filter[_or][1][email][_icontains]', normalizedEmail);

    return this.http.get<{ data?: InviteRequestView[] }>(
      `${this.api}/items/request_invites?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => (res.data ?? []).map((row) => this.normalizeRequestFromInvite(row, normalizedEmail))),
      map((rows) => this.mergeRequestsById(rows)),
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

    const linkByEmail$ = this.linkRequestsToUserByEmail(userId, userEmail, token);
    const inviteToken = this.readPendingInviteToken();
    if (!inviteToken) {
      return linkByEmail$;
    }

    const params = new URLSearchParams({
      sort: '-sent_at',
      limit: '1',
      fields: 'id,request,email,status,claimed_at,expires_at,token'
    });
    params.set('filter[token][_eq]', inviteToken);

    const nowIso = new Date().toISOString();

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/request_invites?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => (Array.isArray(res?.data) ? res.data[0] ?? null : null)),
      switchMap((invite) => {
        const inviteId = this.normalizeId(invite?.id);
        if (!inviteId) {
          this.clearPendingInviteToken();
          return linkByEmail$;
        }

        const inviteEmail = this.pickString(invite?.email)?.toLowerCase() ?? null;
        if (inviteEmail && userEmail && inviteEmail !== userEmail) {
          return linkByEmail$;
        }

        const expiresAtRaw = this.pickString(invite?.expires_at);
        const expiresTs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : NaN;
        if (Number.isFinite(expiresTs) && expiresTs < Date.now()) {
          this.clearPendingInviteToken();
          return linkByEmail$;
        }

        const requestId = this.normalizeId(invite?.request);
        const statusRaw = this.pickString(invite?.status)?.toLowerCase() ?? '';
        const inviteAlreadyClaimed = statusRaw.includes('claim') || Boolean(this.pickString(invite?.claimed_at));

        const claimInvite$ = inviteAlreadyClaimed
          ? of(true)
          : this.http.patch(
              `${this.api}/items/request_invites/${encodeURIComponent(inviteId)}`,
              {
                status: 'claimed',
                claimed_at: nowIso
              },
              this.requestOptions(token)
            ).pipe(
              map(() => true),
              catchError(() => of(false))
            );

        const requestPatchPayload: Record<string, unknown> = {
          requested_for_user: userId
        };
        if (userEmail) {
          requestPatchPayload['requested_for_email'] = userEmail;
        }

        const linkRequest$ = requestId
          ? this.http.patch(
              `${this.api}/items/requests/${encodeURIComponent(requestId)}`,
              requestPatchPayload,
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
          : of(false);

        return forkJoin([claimInvite$, linkRequest$, linkByEmail$]).pipe(
          map(([inviteClaimed, requestLinked, emailLinked]) => inviteClaimed || requestLinked || emailLinked),
          tap((ok) => {
            if (ok || inviteAlreadyClaimed) {
              this.clearPendingInviteToken();
            }
          })
        );
      }),
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
      sort: '-timestamp',
      limit: '60',
      fields: 'id,requested_for_user,requested_for_email'
    });
    params.set('filter[_or][0][requested_for_email][_eq]', userEmail);
    params.set('filter[_or][1][requested_for_email][_icontains]', userEmail);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => (res.data ?? [])
        .map((row) => ({
          id: this.normalizeId(row?.id),
          requestedForUserId: this.normalizeId(row?.requested_for_user)
        }))
        .filter((row) => Boolean(row.id) && row.requestedForUserId !== userId)
        .map((row) => row.id as string)),
      switchMap((requestIds) => {
        if (!requestIds.length) {
          return of(false);
        }

        const linkCalls = requestIds.map((requestId) =>
          this.http.patch(
            `${this.api}/items/requests/${encodeURIComponent(requestId)}`,
            {
              requested_for_user: userId,
              requested_for_email: userEmail
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
                switchMap((fallbackEvents) =>
                  fallbackEvents.length
                    ? of(fallbackEvents)
                    : this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token)
                )
              );
            }

            return this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token);
          }),
          catchError(() =>
            this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token).pipe(
              catchError(() => of([]))
            )
          )
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
            switchMap((fallbackEvents) =>
              fallbackEvents.length
                ? of(fallbackEvents)
                : this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token)
            )
          );
        }

        return this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token);
      }),
      catchError(() =>
        this.fetchAuditActivityEvents(teamUserIds, teamUserEmails, limit, access.token).pipe(
          catchError(() => of([]))
        )
      )
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
    const normalizedUserIds = this.uniqueIds(userIds);
    const normalizedEmails = this.uniqueNonEmptyStrings(emails).filter((value) => this.isEmailLike(value));
    if (!normalizedUserIds.length && !normalizedEmails.length) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: String(limit),
      fields: [
        'id',
        'type',
        'description',
        'timestamp',
        'date_created',
        'user',
        'user.id',
        'user.email',
        'user.first_name',
        'user.last_name',
        'user_email',
        'metadata',
        'meta'
      ].join(',')
    });

    let clause = 0;
    if (normalizedUserIds.length) {
      params.set(`filter[_or][${clause}][user][_in]`, normalizedUserIds.join(','));
      clause += 1;
    }
    if (normalizedEmails.length) {
      params.set(`filter[_or][${clause}][user_email][_in]`, normalizedEmails.join(','));
    }

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/audit_logs?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeAuditActivity(row))),
      catchError(() => of([]))
    );
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
    const access = this.getAccessContext();
    if (!access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const profile = this.normalizeProfile(input?.profile);
    const requestedPlan = this.pickString(input?.requestedPlan) ?? 'business';
    const currentPlan = this.pickString(input?.currentPlan) ?? profile?.plan_code ?? null;

    const primary: Record<string, unknown> = {
      requested_by_user: access.userId,
      requested_at: new Date().toISOString(),
      status: 'Pending'
    };
    this.assignString(primary, 'requested_plan', requestedPlan);
    this.assignString(primary, 'current_plan', currentPlan);
    this.assignString(primary, 'billing_cycle', input?.billingCycle);
    this.assignString(primary, 'notes', input?.notes);
    this.assignNumber(primary, 'base_price_usd', input?.basePriceUsd);
    this.assignNumber(primary, 'discount_usd', input?.discountUsd);
    this.assignNumber(primary, 'final_price_usd', input?.finalPriceUsd);
    this.assignBoolean(primary, 'is_new_user_offer', input?.isNewUserOffer);

    if (profile) {
      this.assignString(primary, 'company_name', profile.company_name);
      this.assignString(primary, 'business_name', profile.business_name);
      this.assignString(primary, 'contact_name', profile.contact_name);
      this.assignString(primary, 'work_email', profile.work_email);
      this.assignString(primary, 'phone', profile.phone);
      this.assignString(primary, 'industry', profile.industry);
      this.assignString(primary, 'team_size', profile.team_size);
      this.assignString(primary, 'country', profile.country);
      this.assignString(primary, 'city', profile.city);
      this.assignString(primary, 'website', profile.website);
      this.assignString(primary, 'address', profile.address);
    }
    this.debug('submitUpgradeRequest:payload', {
      userId: access.userId,
      profileId: profile?.id ?? null,
      fields: Object.keys(primary)
    });

    return this.http.post(
      `${this.api}/items/business_upgrade_requests`,
      primary,
      this.requestOptions(access.token)
    ).pipe(
      map(() => ({ ok: true, message: 'Upgrade request submitted successfully.' })),
      catchError((err) => {
        if (!this.shouldRetryWithMinimalPayload(err)) {
          return of({
            ok: false,
            message: this.toFriendlyError(err, 'Failed to submit upgrade request.')
          });
        }

        return this.http.post(
          `${this.api}/items/business_upgrade_requests`,
          {
            requested_by_user: access.userId,
            requested_at: primary['requested_at'],
            status: 'Pending'
          },
          this.requestOptions(access.token)
        ).pipe(
          map(() => ({ ok: true, message: 'Upgrade request submitted successfully.' })),
          catchError((retryErr) =>
            of({
              ok: false,
              message: this.toFriendlyError(retryErr, 'Failed to submit upgrade request.')
            })
          )
        );
      })
    );
  }

  private fetchOwnedProfile(userId: string, token: string | null): Observable<BusinessProfile | null> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: '20',
      fields: [
        'id',
        'owner_user',
        'source_request',
        'company_name',
        'business_name',
        'contact_name',
        'work_email',
        'phone',
        'industry',
        'team_size',
        'country',
        'city',
        'address',
        'website',
        'plan_code',
        'billing_status',
        'trial_started_at',
        'trial_expires_at',
        'is_active'
      ].join(',')
    });
    params.set('filter[owner_user][_eq]', userId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profiles?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => this.pickBestOwnedProfile(res.data ?? []))
    );
  }

  private fetchMemberProfile(
    userId: string,
    token: string | null
  ): Observable<{ profile: BusinessProfile | null; membership: BusinessProfileMember | null }> {
    const params = new URLSearchParams({
      sort: '-id',
      limit: '20',
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
        'business_profile.source_request',
        'business_profile.company_name',
        'business_profile.business_name',
        'business_profile.contact_name',
        'business_profile.work_email',
        'business_profile.phone',
        'business_profile.industry',
        'business_profile.team_size',
        'business_profile.country',
        'business_profile.city',
        'business_profile.address',
        'business_profile.website',
        'business_profile.plan_code',
        'business_profile.billing_status',
        'business_profile.trial_started_at',
        'business_profile.trial_expires_at',
        'business_profile.is_active'
      ].join(',')
    });
    params.set('filter[user][_eq]', userId);

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

    const planCode = (profile.plan_code ?? '').toString().trim().toLowerCase();
    const billingStatus = (profile.billing_status ?? '').toString().trim().toLowerCase();
    const isActive = this.coerceBoolean(profile.is_active);
    const trialExpiresAt = this.pickString(profile.trial_expires_at);
    const trialExpiresAtTs = this.toTimestamp(trialExpiresAt);
    const trialExpired = trialExpiresAtTs !== null && trialExpiresAtTs < Date.now();
    const trialActive = trialExpiresAtTs !== null && trialExpiresAtTs >= Date.now();

    const paidActive =
      planCode === 'business' &&
      billingStatus === 'active' &&
      isActive;
    const hasBusinessAccess = paidActive || trialActive;
    const memberRole = this.resolveMemberRole(access.userId, profile, membership);
    const permissions = this.resolvePermissions(memberRole);

    let reason = '';
    if (!hasBusinessAccess) {
      if (trialExpired) {
        reason = 'Business trial expired. Please upgrade to continue.';
      } else if (!trialActive && !paidActive && billingStatus === 'trial') {
        reason = 'Business trial is not active. Please upgrade to continue.';
      } else if (planCode !== 'business') {
        reason = 'Business profile exists, but plan_code is not "business".';
      } else if (!isActive) {
        reason = 'Business profile exists, but is_active is false.';
      } else if (!paidActive && !trialActive) {
        reason = 'Business access is not active for this profile.';
      } else {
        reason = 'Business paid access is not active.';
      }
    }

    this.debug('buildAccessState:evaluation', {
      userId: access.userId,
      profileId: profile.id,
      plan_code: profile.plan_code ?? null,
      billing_status: profile.billing_status ?? null,
      is_active: profile.is_active ?? null,
      trial_expires_at: trialExpiresAt,
      paidActive,
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
      source_request: this.normalizeId(raw?.source_request),
      company_name: this.pickString(raw?.company_name),
      business_name: this.pickString(raw?.business_name),
      contact_name: this.pickString(raw?.contact_name),
      work_email: this.pickString(raw?.work_email),
      phone: this.pickString(raw?.phone),
      industry: this.pickString(raw?.industry),
      team_size: this.pickString(raw?.team_size),
      country: this.pickString(raw?.country),
      city: this.pickString(raw?.city),
      address: this.pickString(raw?.address),
      website: this.pickString(raw?.website),
      plan_code: this.pickString(raw?.plan_code),
      billing_status: this.pickString(raw?.billing_status),
      trial_started_at: this.pickString(raw?.trial_started_at),
      trial_expires_at: this.pickString(raw?.trial_expires_at),
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
    const requestedForEmail = this.pickString(raw?.requested_for_email);
    return {
      id: this.normalizeId(raw?.id) ?? '',
      target: 'scan',
      recipient: this.requestRecipient(raw),
      requested_for_email: requestedForEmail,
      requested_by_user: this.normalizeId(raw?.requested_by_user),
      requested_for_user: this.normalizeId(raw?.requested_for_user),
      business_profile: this.normalizeId(raw?.business_profile),
      recipient_industry: null,
      required_state: this.pickString(raw?.required_state) ?? 'Unknown',
      response_status: this.pickString(raw?.response_status) ?? 'Pending',
      timestamp: this.pickString(raw?.timestamp)
    };
  }

  private normalizeRequestFromInvite(raw: InviteRequestView, fallbackEmail: string): RequestRecord {
    const linkedRequest = raw?.request as Record<string, unknown> | null | undefined;
    const linkedRequestId = this.normalizeId(linkedRequest?.['id']);
    const inviteId = this.normalizeId(raw?.id) ?? '';
    const statusRaw = this.pickString(raw?.status)?.toLowerCase() ?? '';
    const claimed = Boolean(this.pickString(raw?.claimed_at)) || statusRaw.includes('claim');
    const responseStatus =
      this.pickString(linkedRequest?.['response_status']) ??
      (claimed ? 'Pending' : 'Pending');
    const requiredState =
      this.pickString(linkedRequest?.['required_state']) ??
      'Pending';
    const timestamp =
      this.pickString(linkedRequest?.['timestamp']) ??
      this.pickString(raw?.sent_at) ??
      this.pickString(raw?.date_created);
    const requestedForEmail =
      this.pickString(linkedRequest?.['requested_for_email']) ??
      this.pickString(raw?.email) ??
      fallbackEmail;

    return {
      id: linkedRequestId ?? `invite-${inviteId}`,
      target: 'scan',
      recipient: requestedForEmail ?? fallbackEmail,
      requested_for_email: requestedForEmail ?? fallbackEmail,
      requested_by_user: this.normalizeId(linkedRequest?.['requested_by_user']),
      requested_for_user: this.normalizeId(linkedRequest?.['requested_for_user']),
      business_profile: null,
      recipient_industry: null,
      required_state: requiredState,
      response_status: responseStatus,
      timestamp
    };
  }

  private attachRecipientIndustries(
    rows: RequestRecord[],
    token: string | null
  ): Observable<RequestRecord[]> {
    const emails = Array.from(
      new Set(
        (rows ?? [])
          .map((row) => this.pickString(row.requested_for_email)?.toLowerCase())
          .filter((row): row is string => Boolean(row))
      )
    );

    if (!emails.length) {
      return of(rows);
    }

    const params = new URLSearchParams({
      limit: String(Math.max(100, emails.length)),
      fields: 'id,work_email,industry'
    });
    params.set('filter[work_email][_in]', emails.join(','));

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/business_profiles?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => {
        const industryByEmail = new Map<string, string>();

        for (const row of res.data ?? []) {
          const email = this.pickString(row?.work_email)?.toLowerCase();
          const industry = this.pickString(row?.industry);
          if (!email || !industry || industryByEmail.has(email)) {
            continue;
          }
          industryByEmail.set(email, industry);
        }

        return (rows ?? []).map((row) => {
          const email = this.pickString(row.requested_for_email)?.toLowerCase();
          return {
            ...row,
            recipient_industry: email ? (industryByEmail.get(email) ?? null) : null
          };
        });
      }),
      catchError(() => of(rows))
    );
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
      date_created: this.pickString(raw?.timestamp) ?? this.pickString(raw?.date_created)
    };
  }

  private requestRecipient(raw: any): string {
    const user = raw?.requested_for_user;
    const userName = this.userLabel(user);
    if (userName) {
      return userName;
    }
    const email = this.pickString(raw?.requested_for_email);
    if (email) {
      return email;
    }
    const phone = this.pickString(raw?.requested_for_phone);
    if (phone) {
      return phone;
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

  private readPendingInviteToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const token = localStorage.getItem('pending_invite_token');
      return this.pickString(token);
    } catch {
      return null;
    }
  }

  private clearPendingInviteToken(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem('pending_invite_token');
    } catch {
      // ignore storage errors
    }
  }

  private readStoredAccessContext(): { userId: string | null } {
    if (typeof localStorage === 'undefined') {
      return { userId: null };
    }

    return {
      userId: this.normalizeId(localStorage.getItem('current_user_id'))
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
      userId: this.normalizeId(userIdValue)
    };
  }

  private resolveAccessContext(access: AccessContext): Observable<AccessContext> {
    const stored = this.readStoredAccessContext();
    const fallback: AccessContext = {
      token: access.token,
      userId: access.token ? (access.userId ?? stored.userId) : null
    };

    if (!access.token) {
      return this.resolveCurrentUserFromSession(null).pipe(
        map((resolved) => ({
          token: null,
          userId: resolved.userId ?? null
        })),
        catchError(() =>
          of({
            token: null,
            userId: null
          })
        )
      );
    }

    // Fast path: when token already carries user id, avoid an extra /users/me call.
    // This removes unnecessary latency/race during first navigation.
    if (fallback.userId) {
      this.debug('resolveAccessContext:tokenUserIdFastPath', {
        userId: fallback.userId
      });
      return of(fallback);
    }

    return this.resolveCurrentUserFromSession(access.token).pipe(
      map((resolved) => ({
        token: fallback.token,
        userId: resolved.userId ?? fallback.userId
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

  private resolveCurrentUserFromSession(token: string | null): Observable<{ userId: string | null }> {
    const stored = this.readStoredAccessContext();

    return this.http.get<any>(
      `${this.api}/users/me?fields=id`,
      this.requestOptions(token)
    ).pipe(
      map((res) => {
        const user = res?.data ?? res ?? {};
        const userId = this.normalizeId(user?.id) ?? stored.userId;

        if (typeof localStorage !== 'undefined') {
          if (userId) {
            localStorage.setItem('current_user_id', userId);
          }
        }

        this.debug('resolveCurrentUserFromSession:resolved', {
          userId
        });

        return { userId };
      }),
      catchError((err) => {
        const status = typeof err?.status === 'number' ? err.status : 0;
        const unauthorized = status === 401 || status === 403;
        const fallbackUserId = unauthorized ? null : stored.userId;

        if (unauthorized && typeof localStorage !== 'undefined') {
          localStorage.removeItem('current_user_id');
        }

        this.debug('resolveCurrentUserFromSession:fallback', {
          status: err?.status ?? null,
          reason: this.readError(err, ''),
          userId: fallbackUserId
        });
        return of({ userId: fallbackUserId });
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
          status: 'active'
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
    membership: BusinessProfileMember | null
  ): BusinessMemberRole | null {
    if (!profile) {
      return null;
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
      profile.business_name,
      profile.contact_name,
      profile.work_email,
      profile.phone,
      profile.industry,
      profile.team_size,
      profile.country,
      profile.city,
      profile.address,
      profile.website
    ];

    let score = fields.reduce((sum, value) => sum + (this.pickString(value) ? 1 : 0), 0);

    if (this.isEmailLike(profile.company_name)) {
      score -= 3;
    }
    if (this.isEmailLike(profile.business_name)) {
      score -= 2;
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

