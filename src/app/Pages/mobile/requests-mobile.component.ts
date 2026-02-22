import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  CreateRequestForm,
  CreateRequestModalComponent,
  SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { AdminTokenService } from '../../services/admin-token';
import { Organization, OrganizationService } from '../../services/organization.service';
import { SubscriptionService } from '../../services/subscription.service';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateRequestModalComponent, NotificationsComponent],
  templateUrl: './requests-mobile.html'
})
export class RequestsMobileComponent implements OnInit {
  showCreateModal = false;
  requests: RequestRow[] = [];
  submitFeedback: SubmitFeedback | null = null;
  submittingRequest = false;
  showPermissionNotice = false;
  isAdminUser = false;
  canCreateRequests = false;
  currentPlanName = 'Free';
  currentPlanCode = 'free';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  org: Organization | null = null;
  requestedByDefault = '';
  pendingCreateModal = false;
  requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService,
    private route: ActivatedRoute,
    private router: Router,
    private subscriptionService: SubscriptionService,
    private organizationService: OrganizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isAdminUser = this.checkAdminAccess();
    this.loadPlanAccess();
    this.loadOrganization();
    this.loadRequests();
    this.openCreateFromQuery();
  }

  badgeClass(state: string): string {
    const normalized = (state ?? '').toLowerCase();
    if (normalized.includes('stable')) return 'badge-stable';
    if (normalized.includes('focus')) return 'badge-low';
    if (normalized.includes('fatigue')) return 'badge-fatigue';
    if (normalized.includes('risk')) return 'badge-risk';
    return '';
  }

  handleCreateRequest(form: CreateRequestForm) {
    if (!this.canCreateRequests) {
      this.router.navigate(['/payment']);
      return;
    }

    const requestedBy = form.requestedBy.trim() || this.requestedByDefault;
    const requestedFor = form.requestedFor.trim();
    const requiredState = form.requiredState.trim();
    const inviteChannel = this.normalizeInviteChannel(form.inviteChannel);

    if (!requestedBy || !requestedFor || !requiredState) {
      this.submitFeedback = { type: 'error', message: 'Please fill all required fields.' };
      this.cdr.detectChanges();
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request...' };
    this.cdr.detectChanges();

    const contact = this.normalizeContact(requestedFor);
    const canInvite = this.canCreateRequests;

    if ((contact.email || contact.phone) && !canInvite) {
      this.submitFeedback = {
        type: 'error',
        message: 'Email/phone invites are paid Business features. Open Billing to activate Business.'
      };
      this.submittingRequest = false;
      this.cdr.detectChanges();
      return;
    }

    const userToken = this.getUserToken();
    const currentUserId = this.getUserIdFromToken(userToken);
    if (!userToken || !currentUserId) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.submittingRequest = false;
      this.cdr.detectChanges();
      return;
    }

    this.resolveRequestedFor(contact, userToken).subscribe({
      next: (resolvedContact) => {
        if (!resolvedContact) {
          this.submitFeedback = {
            type: 'error',
            message: 'Please provide a valid recipient.'
          };
          this.submittingRequest = false;
          this.cdr.detectChanges();
          return;
        }

        const shouldCreateInvite = Boolean(
          resolvedContact.shouldInvite && (resolvedContact.email || resolvedContact.phone)
        );

        this.submitRequestPayload(
          requestedBy,
          resolvedContact,
          requiredState,
          userToken,
          shouldCreateInvite,
          inviteChannel,
          currentUserId
        );
      },
      error: (err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to resolve user account.')
        };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
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
      this.router.navigate(['/payment']);
      return;
    }

    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

  private loadRequests() {
    if (this.isAdminUser) {
      this.adminTokens.getToken().subscribe({
        next: (adminToken) => {
          this.fetchRequests(adminToken, null).subscribe({
            next: (requests) => this.applyRequests(requests),
            error: (err) => console.error('[requests-mobile] requests error:', err)
          });
        },
        error: (err) => console.error('[requests-mobile] admin token error:', err)
      });
      return;
    }

    const userToken = this.getUserToken();
    const userId = this.getUserIdFromToken(userToken);

    if (!userToken || !userId) {
      this.requests = [];
      this.cdr.detectChanges();
      return;
    }

    forkJoin({
      incoming: this.fetchRequests(userToken, { requestedForUserId: userId }).pipe(
        catchError((err) => {
          console.error('[requests-mobile] incoming requests error:', err);
          return of([] as RequestRecord[]);
        })
      ),
      outgoing: this.fetchRequests(userToken, { requestedByUserId: userId }).pipe(
        catchError((err) => {
          console.error('[requests-mobile] outgoing requests error:', err);
          return of([] as RequestRecord[]);
        })
      )
    }).pipe(
      map(({ incoming, outgoing }) => this.mergeUniqueRequests([...incoming, ...outgoing]))
    ).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => console.error('[requests-mobile] requests error:', fetchErr)
    });
  }

  private fetchRequests(
    token: string | null,
    filters: { requestedForUserId?: string; requestedByUserId?: string } | null
  ) {
    const headers = this.buildAuthHeaders(token);
    const fields = [
      'id',
      'Target',
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
      'requested_by_org.id',
      'requested_by_org.name',
      'required_state',
      'response_status',
      'timestamp'
    ].join(',');
    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: '50',
      fields
    });

    if (filters?.requestedForUserId) {
      params.set('filter[requested_for_user][_eq]', filters.requestedForUserId);
    }
    if (filters?.requestedByUserId) {
      params.set('filter[requested_by_user][_eq]', filters.requestedByUserId);
    }

    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    return this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      requestOptions
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
    if (normalized.includes('approved') || normalized.includes('accepted')) return 'Approved';
    if (normalized.includes('denied') || normalized.includes('rejected')) return 'Denied';
    return 'Pending';
  }

  private formatTimestamp(value: string | number | Date): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private resolveRequestedFor(
    contact: { userId?: string; email?: string; phone?: string },
    token: string | null
  ): Observable<ResolvedContact | null> {
    const userId = (contact.userId ?? '').trim();
    if (userId) {
      return of({
        userId,
        email: contact.email,
        phone: contact.phone,
        shouldInvite: false
      });
    }

    const email = (contact.email ?? '').trim().toLowerCase();
    const phone = (contact.phone ?? '').trim();
    if (!email && !phone) {
      return of(null);
    }

    const filterField: 'email' | 'phone' = email ? 'email' : 'phone';
    const filterValue = email || phone;
    const headers = this.buildAuthHeaders(token);
    const params = new URLSearchParams({
      [`filter[${filterField}][_eq]`]: filterValue,
      fields: 'id,email,phone',
      limit: '1'
    });
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };

    return this.http.get<{ data?: Array<{ id?: string; email?: string; phone?: string }> }>(
      `${environment.API_URL}/users?${params.toString()}`,
      requestOptions
    ).pipe(
      map((res) => {
        const user = res?.data?.[0];
        const resolvedUserId = typeof user?.id === 'string' ? user.id.trim() : '';
        if (resolvedUserId) {
          return {
            userId: resolvedUserId,
            email: email || undefined,
            phone: phone || undefined,
            shouldInvite: false
          };
        }

        return {
          email: email || undefined,
          phone: phone || undefined,
          shouldInvite: true
        };
      })
    );
  }

  private createRequest(payload: CreateRequestPayload, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      requestOptions
    );
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private checkAdminAccess(): boolean {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!token) return false;
    const payload = this.decodeJwtPayload(token);
    return payload?.['admin_access'] === true;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private getUserIdFromToken(token: string | null): string | null {
    if (!token) return null;
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' ? id : null;
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!userToken || this.isTokenExpired(userToken)) return null;
    return userToken;
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') return false;
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private loadPlanAccess() {
    this.subscriptionService.getBusinessAccessSnapshot({ forceRefresh: true }).subscribe({
      next: (snapshot) => {
        this.currentPlanName = snapshot.hasBusinessAccess ? 'Business' : 'Free';
        this.currentPlanCode = snapshot.planCode || 'free';
        this.isBusinessTrial = snapshot.isBusinessTrial;
        this.trialDaysRemaining =
          typeof snapshot.daysRemaining === 'number' ? snapshot.daysRemaining : null;
        this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
        this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email or phone invites');
        this.canCreateRequests = snapshot.hasBusinessAccess;
        if (!this.requestedByDefault) {
          this.requestedByDefault = this.currentPlanName;
        }
        if (this.pendingCreateModal && this.canCreateRequests) {
          this.openCreateModal();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to load plan access.')
        };
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
      this.cdr.detectChanges();
    });
  }

  private submitRequestPayload(
    requestedBy: string,
    contact: ResolvedContact,
    requiredState: string,
    token: string | null,
    createInvite = false,
    inviteChannel: InviteChannel = 'auto',
    currentUserId?: string
  ) {
    const requestedByUser = currentUserId ?? this.getUserIdFromToken(token);
    if (!requestedByUser) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.submittingRequest = false;
      this.cdr.detectChanges();
      return;
    }

    const payload: CreateRequestPayload = {
      Target: requestedBy,
      org_id: this.org?.id ?? undefined,
      requested_by_org: this.org?.id ?? undefined,
      requested_by_user: requestedByUser,
      requested_for_user: contact.userId,
      requested_for_email: contact.email,
      requested_for_phone: contact.phone,
      required_state: requiredState,
      response_status: 'Pending'
    };

    this.createRequest(payload, token).subscribe({
      next: (res) => {
        if (!createInvite) {
          this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
          this.submittingRequest = false;
          this.showCreateModal = false;
          this.loadRequests();
          this.cdr.detectChanges();
          return;
        }

        if (!res?.data?.id) {
          this.submitFeedback = {
            type: 'error',
            message: 'Request created, but invitation could not be linked.'
          };
          this.submittingRequest = false;
          this.loadRequests();
          this.cdr.detectChanges();
          return;
        }

        this.createInvite(res.data.id, contact, token, inviteChannel).subscribe({
          next: (inviteCreated) => {
            if (inviteCreated) {
              this.submitFeedback = {
                type: 'success',
                message: 'Invitation sent. Ask them to sign up.'
              };
              this.showCreateModal = false;
            } else {
              this.submitFeedback = {
                type: 'error',
                message: 'Request created, but invitation could not be sent.'
              };
            }
            this.submittingRequest = false;
            this.loadRequests();
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
  }

  private normalizeContact(value: string) {
    const cleaned = value.trim();
    if (!cleaned) return {};
    if (cleaned.includes('@')) return { email: cleaned.toLowerCase() };
    if (/^[+\d][\d\s-]{6,}$/.test(cleaned)) return { phone: cleaned.replace(/\s+/g, '') };
    return { userId: cleaned };
  }

  private createInvite(
    requestId: string | number,
    contact: { email?: string; phone?: string },
    token: string | null,
    inviteChannel: InviteChannel
  ) {
    const inviteToken = this.buildInviteToken();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const channel = this.resolveInviteChannel(contact, inviteChannel);
    const payload = {
      org_id: this.org?.id ?? undefined,
      request: requestId,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      channel,
      token: inviteToken,
      status: 'pending',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    return this.http.post(
      `${environment.API_URL}/items/request_invites`,
      payload,
      requestOptions
    ).pipe(
      map(() => true),
      catchError((err) => {
        console.error('[requests-mobile] create invite error:', err);
        return of(false);
      })
    );
  }

  private buildInviteToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2, 12);
    const time = Date.now().toString(36);
    return `${time}${random}`.slice(0, 20);
  }

  private normalizeInviteChannel(value: string): InviteChannel {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'email' || normalized === 'whatsapp' || normalized === 'sms') {
      return normalized;
    }
    return 'auto';
  }

  private resolveInviteChannel(
    contact: { email?: string; phone?: string },
    inviteChannel: InviteChannel
  ): 'email' | 'whatsapp' | 'sms' {
    if (inviteChannel === 'email' && contact.email) {
      return 'email';
    }
    if (inviteChannel === 'whatsapp' && contact.phone) {
      return 'whatsapp';
    }
    if (inviteChannel === 'sms' && contact.phone) {
      return 'sms';
    }

    if (contact.email) {
      return 'email';
    }
    if (contact.phone) {
      return inviteChannel === 'sms' ? 'sms' : 'whatsapp';
    }
    return 'email';
  }

  private formatRequestTarget(request: RequestRecord): string {
    if (request.requested_for_user) {
      const user = request.requested_for_user as Record<string, unknown>;
      const first = typeof user['first_name'] === 'string' ? user['first_name'] : '';
      const last = typeof user['last_name'] === 'string' ? user['last_name'] : '';
      const name = [first, last].filter(Boolean).join(' ');
      if (name) return name;
      const email = typeof user['email'] === 'string' ? user['email'] : '';
      if (email) return email;
    }
    if (request.requested_for_email) return request.requested_for_email;
    if (request.requested_for_phone) return request.requested_for_phone;
    return this.formatTarget(request.Target);
  }

  private formatTarget(value: unknown): string {
    if (!value) return 'Unknown';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const target = value as Record<string, unknown>;
      const name = typeof target['name'] === 'string' ? target['name'] : '';
      const email = typeof target['email'] === 'string' ? target['email'] : '';
      if (name) return name;
      if (email) return email;
      if (typeof target['id'] === 'string') return target['id'];
    }
    return 'Unknown';
  }

  private openCreateFromQuery() {
    const createParam = this.route.snapshot.queryParamMap.get('create');
    if (createParam === '1' || createParam === 'true') {
      this.pendingCreateModal = true;
      this.openCreateModal();
    }
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

}

type RequestRecord = {
  id?: string;
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
  Target: string;
  org_id?: string;
  requested_by_org?: string;
  requested_by_user?: string;
  requested_for_user?: string;
  requested_for_email?: string;
  requested_for_phone?: string;
  required_state: string;
  response_status?: string;
};

type InviteChannel = 'auto' | 'email' | 'whatsapp' | 'sms';

type ResolvedContact = {
  userId?: string;
  email?: string;
  phone?: string;
  shouldInvite: boolean;
};

