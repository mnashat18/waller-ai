import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';
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
  recipient_industry?: string | null;
  required_state: string;
  response_status: string;
  timestamp?: string | null;
  org_id?: string | null;
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
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  token?: string | null;
  sent_at?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  org_id?: string | null;
  date_created?: string | null;
};

export type ReportExportRecord = {
  id: string;
  format: string;
  status?: string | null;
  file?: string | null;
  filters?: string | null;
  completed_at?: string | null;
  org_id?: string | null;
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
  org_id?: string | null;
  date_created?: string | null;
};

export type BusinessHubAccessState = {
  userId: string | null;
  orgId: string | null;
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
  orgId: string | null;
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

  constructor(private http: HttpClient) {}

  getHubAccessState(): Observable<BusinessHubAccessState> {
    const access = this.getAccessContext();
    return this.resolveAccessContext(access).pipe(
      switchMap((resolved) => {
        if (!resolved.userId) {
          return of({
            userId: resolved.userId,
            orgId: resolved.orgId,
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

        return this.fetchOwnedProfile(resolved.userId as string, resolved.token).pipe(
          switchMap((ownedProfile) => {
            if (ownedProfile) {
              return of({
                profile: ownedProfile,
                membership: null
              });
            }
            return this.fetchMemberProfile(resolved.userId as string, resolved.token);
          }),
          map(({ profile, membership }) =>
            this.buildAccessState(resolved, profile, membership)
          ),
          catchError((err) =>
            of({
              userId: resolved.userId,
              orgId: resolved.orgId,
              profile: null,
              membership: null,
              hasPaidAccess: false,
              memberRole: null,
              permissions: this.resolvePermissions(null),
              trialExpired: false,
              trialExpiresAt: null,
              reason: this.toFriendlyError(err, 'Failed to verify Business access.')
            })
          )
        );
      }),
      catchError((err) =>
        of({
          userId: access.userId,
          orgId: access.orgId,
          profile: null,
          membership: null,
          hasPaidAccess: false,
          memberRole: null,
          permissions: this.resolvePermissions(null),
          trialExpired: false,
          trialExpiresAt: null,
          reason: this.toFriendlyError(err, 'Failed to verify Business access.')
        })
      )
    );
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
    role: ManageTeamMemberRole
  ): Observable<ActionResult> {
    const access = this.getAccessContext();
    const normalizedProfileId = this.normalizeId(profileId);
    const normalizedEmail = this.pickString(userEmail)?.toLowerCase() ?? null;

    if (!normalizedProfileId) {
      return of({ ok: false, message: 'Business profile is missing.' });
    }
    if (!normalizedEmail) {
      return of({ ok: false, message: 'Member email is required.' });
    }

    const backendRole = this.mapManagedRole(role);

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

  listRequests(orgId: string | null, limit = 60): Observable<RequestRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const source$ = orgId
      ? this.fetchRequestsByOrg(orgId, limit, access.token).pipe(
          catchError(() => this.fetchRequestsVisible(limit, access.token))
        )
      : this.fetchRequestsVisible(limit, access.token);

    return source$.pipe(
      map((rows) => this.mergeRequestsById(rows)),
      switchMap((rows) => this.attachRecipientIndustries(rows, access.token))
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
    _orgId?: string | null
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

    const body: CreateScanRequestPayload = {
      requested_for_email: requestedForEmail,
      required_state: requiredState
    };

    return this.http.post<{ data?: { id?: unknown } }>(
      `${this.api}/items/requests`,
      body,
      this.requestOptions(access.token)
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
          this.requestOptions(access.token)
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
              this.requestOptions(access.token)
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

  private fetchRequestsByOrg(
    orgId: string,
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    const params = this.buildRequestsParams(limit);
    params.set('filter[_or][0][org_id][_eq]', orgId);
    params.set('filter[_or][1][requested_by_org][_eq]', orgId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row)))
    );
  }

  private fetchRequestsVisible(
    limit: number,
    token: string | null
  ): Observable<RequestRecord[]> {
    const params = this.buildRequestsParams(limit);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row))),
      catchError(() => of([]))
    );
  }

  private buildRequestsParams(limit: number): URLSearchParams {
    return new URLSearchParams({
      sort: '-timestamp',
      limit: String(limit),
      fields: [
        'id',
        'required_state',
        'response_status',
        'timestamp',
        'requested_for_email',
        'requested_for_phone'
      ].join(',')
    });
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

  listRequestInvites(orgId: string | null, limit = 80): Observable<RequestInviteRecord[]> {
    const access = this.getAccessContext();
    if (!orgId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: [
        'id',
        'request',
        'email',
        'phone',
        'status',
        'token',
        'sent_at',
        'claimed_at',
        'expires_at',
        'org_id',
        'date_created'
      ].join(',')
    });
    params.set('filter[org_id][_eq]', orgId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/request_invites?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeInvite(row)))
    );
  }

  createRequestInvite(
    payload: { requestId: string; email?: string; phone?: string },
    orgId: string | null
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

    const body: Record<string, unknown> = {
      request: requestId,
      email: email ?? null,
      phone: phone ?? null,
      token: this.buildInviteToken(),
      status: 'pending',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };
    if (orgId) {
      body['org_id'] = orgId;
    }

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
  }

  listReportExports(
    orgId: string | null,
    limit = 40,
    teamUserIds?: string[] | null
  ): Observable<ReportExportRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const normalizedTeamUserIds = this.uniqueIds(teamUserIds ?? []);

    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,format,status,file,filters,completed_at,org_id,user,date_created'
    });
    if (orgId) {
      params.set('filter[org_id][_eq]', orgId);
    } else if (normalizedTeamUserIds.length) {
      params.set('filter[user][_in]', normalizedTeamUserIds.join(','));
    } else if (access.userId) {
      params.set('filter[user][_eq]', access.userId);
    } else {
      return of([]);
    }

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/reports_exports?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeExport(row)))
    );
  }

  createReportExport(input: CreateReportExportInput, orgId: string | null): Observable<ActionResult> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const normalizedFormat = this.normalizeExportFormat(input.format);
    const preparedFilters = this.buildReportExportFilters(input);

    const primary: Record<string, unknown> = {
      format: normalizedFormat,
      status: 'pending'
    };
    if (preparedFilters !== null) {
      primary['filters'] = preparedFilters;
    }
    if (orgId) {
      primary['org_id'] = orgId;
    }
    if (access.userId) {
      primary['user'] = access.userId;
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
        if (orgId) {
          fallbackWithSerializedFilters['org_id'] = orgId;
        }
        if (access.userId) {
          fallbackWithSerializedFilters['user'] = access.userId;
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
            if (orgId) {
              fallback['org_id'] = orgId;
            }
            if (access.userId) {
              fallback['user'] = access.userId;
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
  }

  listActivityEvents(
    orgId: string | null,
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

    const source$ = orgId
      ? this.fetchActivityEventsByOrg(orgId, limit, access.token)
      : teamUserIds.length
        ? this.fetchActivityEventsByUsers(teamUserIds, limit, access.token)
        : of([]);

    return source$.pipe(
      switchMap((events) => {
        if (events.length) {
          return of(events);
        }

        if (orgId && teamUserIds.length) {
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

  private fetchActivityEventsByOrg(
    orgId: string,
    limit: number,
    token: string | null
  ): Observable<ActivityEventRecord[]> {
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: this.activityEventFields()
    });
    params.set('filter[org_id][_eq]', orgId);

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
      'org_id',
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

  submitUpgradeRequest(orgId: string | null): Observable<ActionResult> {
    const access = this.getAccessContext();
    if (!access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const primary: Record<string, unknown> = {
      requested_by_user: access.userId,
      requested_at: new Date().toISOString(),
      status: 'Pending'
    };
    if (orgId) {
      primary['org_id'] = orgId;
    }

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
          { requested_by_user: access.userId },
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
      map((res) => this.pickBestOwnedProfile(res.data ?? [])),
      catchError(() => of(null))
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
      }),
      catchError(() => of({ profile: null, membership: null }))
    );
  }

  private buildAccessState(
    access: AccessContext,
    profile: BusinessProfile | null,
    membership: BusinessProfileMember | null
  ): BusinessHubAccessState {
    const orgId = access.orgId ?? null;

    if (!profile) {
      return {
        userId: access.userId,
        orgId,
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

    return {
      userId: access.userId,
      orgId,
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
      recipient_industry: null,
      required_state: this.pickString(raw?.required_state) ?? 'Unknown',
      response_status: this.pickString(raw?.response_status) ?? 'Pending',
      timestamp: this.pickString(raw?.timestamp),
      org_id: this.normalizeId(raw?.org_id) ?? this.normalizeId(raw?.requested_by_org)
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
      org_id: this.normalizeId(raw?.org_id),
      date_created: this.pickString(raw?.date_created)
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
      org_id: this.normalizeId(raw?.org_id),
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
      org_id: this.normalizeId(raw?.org_id),
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
      org_id: this.normalizeId(raw?.org_id),
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

  private getAccessContext(): AccessContext {
    const token = this.getToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const userIdValue = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    const orgIdValue =
      payload?.['org_id'] ??
      payload?.['organization_id'] ??
      payload?.['org'] ??
      payload?.['organization'];
    return {
      token,
      userId: this.normalizeId(userIdValue),
      orgId: this.normalizeId(orgIdValue)
    };
  }

  private resolveAccessContext(access: AccessContext): Observable<AccessContext> {
    if (!access.token) {
      return of(access);
    }

    if (access.userId && access.orgId) {
      return of(access);
    }

    return this.resolveCurrentUserFromSession(access.token).pipe(
      map((resolved) => ({
        token: access.token,
        userId: resolved.userId ?? access.userId,
        orgId: resolved.orgId ?? access.orgId
      })),
      catchError(() => of(access))
    );
  }

  private resolveCurrentUserFromSession(token: string | null): Observable<{ userId: string | null; orgId: string | null }> {
    return this.http.get<any>(
    `${this.api}/users/me?fields=id,org_id,organization_id,organization.id&_=${Date.now()}`,
    this.requestOptions(token)
    ).pipe(
      map((res) => {
        const user = res?.data ?? res ?? {};
        const userId = this.normalizeId(user?.id);
        const orgId = this.normalizeId(
          user?.org_id ??
          user?.organization_id ??
          user?.organization?.id
        );

        if (typeof localStorage !== 'undefined') {
          if (userId) {
            localStorage.setItem('current_user_id', userId);
          }
          if (orgId) {
            localStorage.setItem('current_user_org_id', orgId);
          } else {
            localStorage.removeItem('current_user_org_id');
          }
        }

        return { userId, orgId };
      }),
      catchError(() => of({ userId: null, orgId: null }))
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
      const token =
        localStorage.getItem('token') ??
        localStorage.getItem('access_token') ??
        localStorage.getItem('directus_token');

      if (!token || this.isTokenExpired(token)) {
        return null;
      }

      return token;
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

