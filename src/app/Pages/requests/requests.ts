import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  CreateRequestModalComponent,
  type CreateRequestForm,
  type RequestTarget,
  type SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { AdminTokenService } from '../../services/admin-token';
import { Organization, OrganizationService } from '../../services/organization.service';
import { SubscriptionService } from '../../services/subscription.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests',
  imports: [CommonModule, RouterModule, CreateRequestModalComponent],
  templateUrl: './requests.html',
  styleUrl: './requests.css',
})
export class Requests implements OnInit {
  showCreateModal = false;
  loadingPlanAccess = true;
  requests: RequestRow[] = [];
  submitFeedback: SubmitFeedback | null = null;
  submittingRequest = false;
  showPermissionNotice = false;
  isAdminUser = false;
  hasBusinessAccess = false;
  canCreateRequests = false;
  currentPlanName = 'Free';
  currentPlanCode = 'free';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  org: Organization | null = null;
  requestedByDefault = '';
  readonly fixedRequestTarget: RequestTarget = 'scan';
  pendingCreateModal = false;
  requestStats = {
    total: 0,
    pending: 0,
    approved: 0,
    denied: 0
  };

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService,
    private route: ActivatedRoute,
    private subscriptionService: SubscriptionService,
    private organizationService: OrganizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isAdminUser = this.checkAdminAccess();
    this.loadPlanAccess();
    this.loadOrganization();
    this.openCreateFromQuery();
  }

  badgeClass(state: string): string {
    const normalized = (state ?? '').toLowerCase();
    if (normalized.includes('stable')) {
      return 'badge-stable';
    }
    if (normalized.includes('focus')) {
      return 'badge-low';
    }
    if (normalized.includes('fatigue')) {
      return 'badge-fatigue';
    }
    if (normalized.includes('risk')) {
      return 'badge-risk';
    }
    return '';
  }

  handleCreateRequest(form: CreateRequestForm) {
    if (!this.canCreateRequests) {
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    const requestedFor = this.normalizeEmail(form.requestedFor);

    if (!requestedFor) {
      this.submitFeedback = { type: 'error', message: 'Enter a valid recipient email.' };
      this.cdr.detectChanges();
      return;
    }

    const userToken = this.getUserToken();
    const currentUserEmail = this.getUserEmailFromToken(userToken);
    if (!userToken) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.cdr.detectChanges();
      return;
    }

    if (currentUserEmail && requestedFor === currentUserEmail) {
      this.submitFeedback = { type: 'error', message: 'You cannot send a request to yourself.' };
      this.cdr.detectChanges();
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request...' };
    this.cdr.detectChanges();

    this.submitRequestPayload(this.fixedRequestTarget, requestedFor, userToken);
  }

  private loadRequests() {
    if (this.canViewOrgRequests()) {
      this.loadOrgScopedRequests();
      return;
    }

    this.loadUserScopedRequests();
  }

  private loadOrgScopedRequests() {
    const orgId = this.resolveOrgId();
    if (!orgId) {
      this.loadUserScopedRequests();
      return;
    }

    if (this.isAdminUser) {
      this.adminTokens.getToken().subscribe({
        next: (adminToken) => {
          const token = adminToken ?? this.getUserToken();
          const tokenSource = token ? (adminToken ? 'admin' : 'user') : 'none';
          console.info('[requests] using token source:', tokenSource);

          this.fetchRequests(token, { orgId }).subscribe({
            next: (requests) => {
              console.info('[requests] requests count:', requests.length);
              this.applyRequests(requests);
            },
            error: (err) => {
              console.error('[requests] requests error:', err);
            }
          });
        },
        error: (err) => {
          console.error('[requests] admin token error:', err);
        }
      });
      return;
    }

    const userToken = this.getUserToken();
    if (!userToken) {
      this.requests = [];
      this.requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };
      this.cdr.detectChanges();
      return;
    }

    this.fetchRequests(userToken, { orgId }).subscribe({
      next: (requests) => {
        console.info('[requests] requests count:', requests.length);
        this.applyRequests(requests);
      },
      error: (fetchErr) => {
        console.error('[requests] requests error:', fetchErr);
      }
    });
  }

  private loadUserScopedRequests() {
    const userToken = this.getUserToken();
    const userId = this.getUserIdFromToken(userToken);
    const tokenSource = userToken ? 'user' : 'none';
    console.info('[requests] using token source:', tokenSource);

    if (!userToken || !userId) {
      this.requests = [];
      this.requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };
      this.cdr.detectChanges();
      return;
    }

    forkJoin({
      incoming: this.fetchRequests(userToken, { requestedForUserId: userId }).pipe(
        catchError((err) => {
          console.error('[requests] incoming requests error:', err);
          return of([] as RequestRecord[]);
        })
      ),
      outgoing: this.fetchRequests(userToken, { requestedByUserId: userId }).pipe(
        catchError((err) => {
          console.error('[requests] outgoing requests error:', err);
          return of([] as RequestRecord[]);
        })
      )
    }).pipe(
      map(({ incoming, outgoing }) => this.mergeUniqueRequests([...incoming, ...outgoing]))
    ).subscribe({
      next: (requests) => {
        console.info('[requests] requests count:', requests.length);
        this.applyRequests(requests);
      },
      error: (fetchErr) => {
        console.error('[requests] requests error:', fetchErr);
      }
    });
  }

  private canViewOrgRequests(): boolean {
    return this.isAdminUser || this.hasBusinessAccess;
  }

  private fetchRequests(
    token: string | null,
    filters: { requestedForUserId?: string; requestedByUserId?: string; orgId?: string } | null
  ) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return of([] as RequestRecord[]);
    }

    const fields = [
      'id',
      'target',
      'Target',
      'org_id',
      'requested_by_user.id',
      'requested_by_user.email',
      'requested_by_user.first_name',
      'requested_by_user.last_name',
      'requested_for_user.id',
      'requested_for_user.email',
      'requested_for_user.first_name',
      'requested_for_user.last_name',
      'requested_for_email',
      'requested_for_phone',
      'requested_by_org',
      'requested_by_org.id',
      'requested_by_org.name',
      'required_state',
      'response_status',
      'timestamp'
    ].join(',');
    const params = new URLSearchParams({
      'sort': '-timestamp',
      'limit': '50',
      'fields': fields
    });

    if (filters?.orgId) {
      params.set('filter[_or][0][org_id][_eq]', filters.orgId);
      params.set('filter[_or][1][requested_by_org][_eq]', filters.orgId);
    } else {
      if (filters?.requestedForUserId) {
        params.set('filter[requested_for_user][_eq]', filters.requestedForUserId);
      }
      if (filters?.requestedByUserId) {
        params.set('filter[requested_by_user][_eq]', filters.requestedByUserId);
      }
    }

    return this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      { headers, withCredentials: true }
    ).pipe(
      map(res => res.data ?? [])
    );
  }

  private mergeUniqueRequests(requests: RequestRecord[]): RequestRecord[] {
    const mapById = new Map<string, RequestRecord>();
    const withoutId: RequestRecord[] = [];

    for (const request of requests) {
      const id = typeof request.id === 'string' ? request.id : '';
      if (!id) {
        withoutId.push(request);
        continue;
      }
      if (!mapById.has(id)) {
        mapById.set(id, request);
      }
    }

    return [...mapById.values(), ...withoutId].sort(
      (a, b) => this.toTimestampValue(b.timestamp) - this.toTimestampValue(a.timestamp)
    );
  }

  private toTimestampValue(value: string | number | Date | undefined): number {
    if (!value) {
      return 0;
    }
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private applyRequests(requests: RequestRecord[]) {
    this.requests = requests.map((request) => this.mapToRequestRow(request));
    this.requestStats = this.requests.reduce(
      (acc, req) => {
        acc.total += 1;
        if (req.status === 'Approved') acc.approved += 1;
        if (req.status === 'Denied') acc.denied += 1;
        if (req.status === 'Pending') acc.pending += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, denied: 0 }
    );
    this.cdr.detectChanges();
  }

  private mapToRequestRow(request: RequestRecord): RequestRow {
    return {
      target: this.formatRequestTarget(request),
      required_state: request.required_state ?? 'Unknown',
      status: this.normalizeStatus(request.response_status),
      timestamp: this.formatTimestamp(request.timestamp ?? '')
    };
  }

  private normalizeStatus(status?: string): RequestRow['status'] {
    const normalized = (status ?? '').toLowerCase();
    if (normalized.includes('approved') || normalized.includes('accepted')) {
      return 'Approved';
    }
    if (normalized.includes('denied') || normalized.includes('rejected')) {
      return 'Denied';
    }
    return 'Pending';
  }

  private formatTimestamp(value: string | number | Date): string {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private formatTarget(value: unknown): string {
    if (!value) {
      return 'Unknown';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      const target = value as Record<string, unknown>;
      const name = typeof target['name'] === 'string' ? target['name'] : '';
      const email = typeof target['email'] === 'string' ? target['email'] : '';
      if (name) {
        return name;
      }
      if (email) {
        return email;
      }
      if (typeof target['id'] === 'string') {
        return target['id'];
      }
    }
    return 'Unknown';
  }

  private createRequest(payload: CreateRequestPayload, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return throwError(() => new Error('Authorization token is missing.'));
    }
    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      { headers, withCredentials: true }
    );
  }

  private fetchCreatedRequestById(requestId: string, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return throwError(() => new Error('Authorization token is missing.'));
    }
    const params = new URLSearchParams({
      fields: [
        'id',
        'target',
        'Target',
        'requested_for_email',
        'requested_for_user.id',
        'requested_by_user.id',
        'response_status',
        'timestamp'
      ].join(',')
    });
    return this.http.get<{ data?: RequestRecord }>(
      `${environment.API_URL}/items/requests/${encodeURIComponent(requestId)}?${params.toString()}`,
      { headers, withCredentials: true }
    );
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private checkAdminAccess(): boolean {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!token) {
      return false;
    }

    const payload = this.decodeJwtPayload(token);
    return payload?.['admin_access'] === true;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private getUserIdFromToken(token: string | null): string | null {
    if (!token) {
      return null;
    }

    const payload = this.decodeJwtPayload(token);
    if (!payload) {
      return null;
    }

    const id = payload['id'] ?? payload['user_id'] ?? payload['sub'];
    return typeof id === 'string' ? id : null;
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!userToken || this.isTokenExpired(userToken)) {
      return null;
    }

    return userToken;
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') {
        return false;
      }
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  dismissPermissionNotice() {
    this.showPermissionNotice = false;
    this.cdr.detectChanges();
  }

  trialDaysLabel(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return 'Paid Business features are currently unlocked for your trial.';
    }
    if (this.trialDaysRemaining <= 1) {
      return 'Paid Business features are free today only (last trial day).';
    }
    return `Paid Business features are free for now - ${this.trialDaysRemaining} day(s) left.`;
  }

  businessPaidFeatureNotice(featureLabel: string): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return `${featureLabel} is a paid Business feature, currently unlocked in your trial.`;
    }
    if (this.trialDaysRemaining <= 1) {
      return `${featureLabel} is a paid Business feature, free for today only.`;
    }
    return `${featureLabel} is a paid Business feature, free for ${this.trialDaysRemaining} day(s) left.`;
  }

  openCreateModal() {
    if (!this.canCreateRequests) {
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    this.showPermissionNotice = false;
    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

  private loadPlanAccess() {
    this.loadingPlanAccess = true;
    this.subscriptionService.getBusinessAccessSnapshot({ forceRefresh: true }).subscribe({
      next: (snapshot) => {
        this.currentPlanCode = snapshot.planCode || 'free';
        this.hasBusinessAccess = snapshot.hasBusinessAccess;
        this.currentPlanName = snapshot.hasBusinessAccess || this.isAdminUser ? 'Business' : 'Free';
        this.isBusinessTrial = snapshot.isBusinessTrial;
        this.trialDaysRemaining =
          typeof snapshot.daysRemaining === 'number' ? snapshot.daysRemaining : null;
        this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
        this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email invites');
        this.canCreateRequests = snapshot.hasBusinessAccess || this.isAdminUser;
        if (!this.requestedByDefault) {
          this.requestedByDefault = this.currentPlanName;
        }
        if (this.pendingCreateModal) {
          this.openCreateModal();
        }
        this.loadRequests();
        this.loadingPlanAccess = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.hasBusinessAccess = false;
        this.canCreateRequests = this.isAdminUser;
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to load plan access.')
        };
        this.loadRequests();
        this.loadingPlanAccess = false;
        this.cdr.detectChanges();
      }
    });
  }

  private loadOrganization() {
    this.organizationService.getUserOrganization().pipe(
      catchError(() => of(null))
    ).subscribe((org) => {
      this.org = org;
      this.requestedByDefault = org?.name ?? this.requestedByDefault;
      this.loadRequests();
      this.cdr.detectChanges();
    });
  }

  private submitRequestPayload(
    target: RequestTarget,
    requestedForEmail: string,
    token: string | null
  ) {
    const email = this.normalizeEmail(requestedForEmail);
    if (!email) {
      this.submitFeedback = { type: 'error', message: 'Enter a valid recipient email.' };
      this.submittingRequest = false;
      this.cdr.detectChanges();
      return;
    }

    const payload: CreateRequestPayload = {
      requested_for_email: email,
      target
    };

    this.createRequest(payload, token).subscribe({
      next: (res) => {
        const createdId = this.normalizeId(res?.data?.id);
        if (!createdId) {
          this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
          this.submittingRequest = false;
          this.showCreateModal = false;
          this.loadRequests();
          this.cdr.detectChanges();
          return;
        }

        this.fetchCreatedRequestById(createdId, token).subscribe({
          next: () => {
            this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
            this.submittingRequest = false;
            this.showCreateModal = false;
            this.loadRequests();
            this.cdr.detectChanges();
          },
          error: (fetchErr) => {
            this.submitFeedback = {
              type: 'error',
              message: this.describeHttpError(fetchErr, 'Request created, but refresh failed.')
            };
            this.submittingRequest = false;
            this.loadRequests();
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        console.error('[requests] create request error:', err);
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
  }

  private describeHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      '';
    const normalized = String(detail).toLowerCase();

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

  private formatRequestTarget(request: RequestRecord): string {
    if (request.requested_for_user) {
      const user = request.requested_for_user as Record<string, unknown>;
      const first = typeof user['first_name'] === 'string' ? user['first_name'] : '';
      const last = typeof user['last_name'] === 'string' ? user['last_name'] : '';
      const name = [first, last].filter(Boolean).join(' ');
      if (name) {
        return name;
      }
      const email = typeof user['email'] === 'string' ? user['email'] : '';
      if (email) {
        return email;
      }
    }
    if (request.requested_for_email) {
      return request.requested_for_email;
    }
    if (request.requested_for_phone) {
      return request.requested_for_phone;
    }
    return this.formatTarget(request.target ?? request.Target);
  }

  private openCreateFromQuery() {
    const createParam = this.route.snapshot.queryParamMap.get('create');
    if (createParam === '1' || createParam === 'true') {
      this.pendingCreateModal = true;
      if (!this.loadingPlanAccess) {
        this.openCreateModal();
      }
    }
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return this.isValidEmail(normalized) ? normalized : null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private resolveOrgId(): string | null {
    const token = this.getUserToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadOrgId =
      payload?.['org_id'] ??
      payload?.['organization_id'] ??
      payload?.['org'] ??
      payload?.['organization'];
    const storedOrgId = typeof localStorage !== 'undefined'
      ? localStorage.getItem('current_user_org_id')
      : null;
    return this.normalizeId(this.org?.id) ??
      this.normalizeId(payloadOrgId) ??
      this.normalizeId(storedOrgId);
  }

  private getUserEmailFromToken(token: string | null): string | null {
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = payload?.['email'];
    const storedEmail = typeof localStorage !== 'undefined'
      ? localStorage.getItem('user_email')
      : null;
    return this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
  }

}

type RequestRecord = {
  id?: string;
  target?: unknown;
  Target?: unknown;
  requested_for_user?: unknown;
  requested_for_email?: string;
  requested_for_phone?: string;
  requested_by_org?: unknown;
  required_state?: string;
  response_status?: string;
  timestamp?: string;
};

type RequestRow = {
  target: string;
  required_state: string;
  status: 'Approved' | 'Pending' | 'Denied';
  timestamp: string;
};

type CreateRequestPayload = {
  target: RequestTarget;
  requested_for_email?: string;
};



