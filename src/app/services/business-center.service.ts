import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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

export type BusinessMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

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
  required_state: string;
  response_status: string;
  timestamp?: string | null;
  org_id?: string | null;
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

export type ActivityEventRecord = {
  id: string;
  actor_label?: string | null;
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

@Injectable({ providedIn: 'root' })
export class BusinessCenterService {
  private api = environment.API_URL;
  private readonly trialDays = 14;

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

        return this.ensureBusinessProfileForUserId(resolved.userId, resolved.token).pipe(
          switchMap(() => this.fetchOwnedProfile(resolved.userId as string, resolved.token)),
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

        return this.createOwnedProfile(user, userId, token).pipe(
          switchMap((created) => {
            if (!created?.id) {
              return of(null);
            }
            return this.ensureOwnerMembership(created.id, userId, token).pipe(
              map(() => created)
            );
          })
        );
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
      map((res) => (res.data ?? []).map((row) => this.normalizeMember(row)))
    );
  }

  listRequests(orgId: string | null, limit = 60): Observable<RequestRecord[]> {
    const access = this.getAccessContext();
    if (!orgId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: String(limit),
      fields: [
        'id',
        'Target',
        'required_state',
        'response_status',
        'timestamp',
        'org_id',
        'requested_by_org',
        'requested_for_user.id',
        'requested_for_user.email',
        'requested_for_user.first_name',
        'requested_for_user.last_name',
        'requested_for_email',
        'requested_for_phone'
      ].join(',')
    });
    params.set('filter[_or][0][org_id][_eq]', orgId);
    params.set('filter[_or][1][requested_by_org][_eq]', orgId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/requests?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeRequest(row)))
    );
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
      status: 'Sent',
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
      map(() => ({ ok: true, message: 'Invite sent successfully.' })),
      catchError((err) =>
        of({
          ok: false,
          message: this.toFriendlyError(err, 'Failed to send invite.')
        })
      )
    );
  }

  listReportExports(orgId: string | null, limit = 40): Observable<ReportExportRecord[]> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,format,status,file,filters,completed_at,org_id,user,date_created'
    });
    if (orgId) {
      params.set('filter[org_id][_eq]', orgId);
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

  createReportExport(
    input: { format: 'csv' | 'pdf'; filters?: string | null },
    orgId: string | null
  ): Observable<ActionResult> {
    const access = this.getAccessContext();
    if (!access.token && !access.userId) {
      return of({ ok: false, message: 'Please sign in first.' });
    }

    const primary: Record<string, unknown> = {
      format: input.format,
      filters: this.parseFilters(input.filters)
    };
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
      map(() => ({ ok: true, message: 'Export request queued.' })),
      catchError((err) => {
        if (!this.shouldRetryWithMinimalPayload(err)) {
          return of({
            ok: false,
            message: this.toFriendlyError(err, 'Failed to queue export request.')
          });
        }

        const fallback: Record<string, unknown> = { format: input.format };
        if (orgId) {
          fallback['org_id'] = orgId;
        }

        return this.http.post(
          `${this.api}/items/reports_exports`,
          fallback,
          this.requestOptions(access.token)
        ).pipe(
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
  }

  listActivityEvents(orgId: string | null, limit = 60): Observable<ActivityEventRecord[]> {
    const access = this.getAccessContext();
    if (!orgId) {
      return of([]);
    }

    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: [
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
      ].join(',')
    });
    params.set('filter[org_id][_eq]', orgId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/activity_events?${params.toString()}`,
      this.requestOptions(access.token)
    ).pipe(
      map((res) => (res.data ?? []).map((row) => this.normalizeActivity(row)))
    );
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
      limit: '1',
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
      map((res) => this.normalizeProfile((res.data ?? [])[0])),
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
    return {
      id: this.normalizeId(raw?.id) ?? '',
      target: this.pickString(raw?.Target) ?? 'Business',
      recipient: this.requestRecipient(raw),
      required_state: this.pickString(raw?.required_state) ?? 'Unknown',
      response_status: this.pickString(raw?.response_status) ?? 'Pending',
      timestamp: this.pickString(raw?.timestamp),
      org_id: this.normalizeId(raw?.org_id) ?? this.normalizeId(raw?.requested_by_org)
    };
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
      status: this.pickString(raw?.status),
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
      actor_label: this.userLabel(raw?.actor),
      target_user_label: this.userLabel(raw?.target_user),
      action: this.pickString(raw?.action),
      entity_type: this.pickString(raw?.entity_type),
      entity_id: this.pickString(raw?.entity_id),
      payload,
      org_id: this.normalizeId(raw?.org_id),
      date_created: this.pickString(raw?.date_created)
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
    const first = this.pickString(raw?.first_name);
    const last = this.pickString(raw?.last_name);
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    if (fullName) {
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

  private parseFilters(value: string | null | undefined): unknown {
    const raw = (value ?? '').trim();
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private buildInviteToken(): string {
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

    const storedUserId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_id') : null;
    const storedOrgId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_org_id') : null;

    return {
      token,
      userId: this.normalizeId(userIdValue) ?? this.normalizeId(storedUserId),
      orgId: this.normalizeId(orgIdValue) ?? this.normalizeId(storedOrgId)
    };
  }

  private resolveAccessContext(access: AccessContext): Observable<AccessContext> {
    if (access.userId) {
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
      `${this.api}/users/me?fields=id,org_id,organization_id,organization.id`,
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

  private ensureBusinessProfileForUserId(
    userId: string,
    token: string | null
  ): Observable<BusinessProfile | null> {
    return this.fetchOwnedProfile(userId, token).pipe(
      switchMap((owned) => {
        if (owned?.id) {
          return this.ensureOwnerMembership(owned.id, userId, token).pipe(
            map(() => owned)
          );
        }

        const user = {
          id: userId,
          email: this.readString(typeof localStorage !== 'undefined' ? localStorage.getItem('user_email') : '')
        } as Record<string, unknown>;

        return this.createOwnedProfile(user, userId, token).pipe(
          switchMap((created) => {
            if (!created?.id) {
              return of(null);
            }
            return this.ensureOwnerMembership(created.id, userId, token).pipe(
              map(() => created)
            );
          })
        );
      }),
      catchError(() => of(null))
    );
  }

  private createOwnedProfile(
    user: Record<string, unknown> | null | undefined,
    userId: string,
    token: string | null
  ): Observable<BusinessProfile | null> {
    const fullName = this.buildName(
      this.readString(user?.['first_name']),
      this.readString(user?.['last_name'])
    );
    const email = this.readString(user?.['email']);
    const companyFallback = fullName || email || 'Business Account';
    const businessFallback = fullName ? `${fullName} Business` : 'My Business';
    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + this.trialDays * 24 * 60 * 60 * 1000);

    const payload: Record<string, unknown> = {
      owner_user: userId,
      company_name: companyFallback,
      business_name: businessFallback,
      contact_name: fullName || companyFallback,
      work_email: email || null,
      plan_code: 'business',
      billing_status: 'trial',
      trial_started_at: now.toISOString(),
      trial_expires_at: trialExpiresAt.toISOString(),
      is_active: true
    };

    return this.http.post<{ data?: any }>(
      `${this.api}/items/business_profiles`,
      payload,
      this.requestOptions(token)
    ).pipe(
      map((res) => this.normalizeProfile(res?.data)),
      catchError(() => of(null))
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

  private getToken(): string | null {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return token;
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
    if (raw === 'owner' || raw === 'admin' || raw === 'member' || raw === 'viewer') {
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
        canInvite: false,
        canUpgrade: false,
        canManageMembers: true,
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

  private buildName(first: string, last: string): string {
    return [first.trim(), last.trim()].filter(Boolean).join(' ').trim();
  }

  private toTimestamp(value: string | null | undefined): number | null {
    const raw = this.pickString(value);
    if (!raw) {
      return null;
    }
    const ts = new Date(raw).getTime();
    return Number.isNaN(ts) ? null : ts;
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

