import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  CreateRequestForm,
  CreateRequestModalComponent,
  SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { AdminTokenService } from '../../services/admin-token';
import { Organization, OrganizationService } from '../../services/organization.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
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
  currentSubscription: UserSubscription | null = null;
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
    const notes = form.notes.trim();
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
    const token = userToken;

    if (contact.userId) {
      this.submitRequestPayload(requestedBy, contact, requiredState, notes, token);
      return;
    }

    if (contact.email) {
      this.resolveRequestedFor(contact.email, token).subscribe({
        next: (resolvedUserId) => {
          if (resolvedUserId) {
            this.submitRequestPayload(requestedBy, { userId: resolvedUserId }, requiredState, notes, token);
            return;
          }
          this.submitRequestPayload(
            requestedBy,
            contact,
            requiredState,
            notes,
            token,
            true,
            inviteChannel
          );
        },
        error: () => {
          this.submitRequestPayload(
            requestedBy,
            contact,
            requiredState,
            notes,
            token,
            true,
            inviteChannel
          );
        }
      });
      return;
    }

    this.submitRequestPayload(
      requestedBy,
      contact,
      requiredState,
      notes,
      token,
      Boolean(contact.phone),
      inviteChannel
    );
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

    this.fetchRequests(userToken, userId).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => console.error('[requests-mobile] requests error:', fetchErr)
    });
  }

  private fetchRequests(token: string | null, requestedForUserId: string | null) {
    const headers = this.buildAuthHeaders(token);
    const fields = [
      'id',
      'Target',
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

    if (requestedForUserId) {
      params.set('filter[requested_for_user][_eq]', requestedForUserId);
    }

    return this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      headers ? { headers } : {}
    ).pipe(
      map(res => res.data ?? [])
    );
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

  private resolveRequestedFor(value: string, token: string | null) {
    if (!value) return of(null);
    if (!this.looksLikeEmail(value)) return of(value);

    const headers = this.buildAuthHeaders(token);
    const params = new URLSearchParams({
      'filter[email][_eq]': value,
      fields: 'id',
      limit: '1'
    });
    const url = `${environment.API_URL}/users?${params.toString()}`;

    return this.http.get<{ data?: Array<{ id?: string }> }>(
      url,
      headers ? { headers } : {}
    ).pipe(
      map(res => res?.data?.[0]?.id ?? null)
    );
  }

  private looksLikeEmail(value: string): boolean {
    return value.includes('@');
  }

  private createRequest(payload: CreateRequestPayload, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      headers ? { headers } : {}
    );
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private checkAdminAccess(): boolean {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
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
    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token');
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
    this.subscriptionService.ensureBusinessTrial().subscribe((subscription) => {
      this.currentSubscription = subscription;
      this.currentPlanName = subscription?.plan?.name ?? (this.isBusinessSubscriptionActive(subscription) ? 'Business' : 'Free');
      this.currentPlanCode = subscription?.plan?.code ?? 'free';
      this.isBusinessTrial = Boolean(subscription?.is_trial);
      this.trialDaysRemaining =
        typeof subscription?.days_remaining === 'number' ? subscription.days_remaining : null;
      this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
      this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email or phone invites');
      this.canCreateRequests = this.isBusinessSubscriptionActive(subscription);
      if (!this.requestedByDefault) {
        this.requestedByDefault = this.currentPlanName;
      }
      if (this.pendingCreateModal && this.canCreateRequests) {
        this.openCreateModal();
      }
      this.cdr.detectChanges();
    });
  }

  private loadOrganization() {
    this.organizationService.getUserOrganization().subscribe((org) => {
      this.org = org;
      this.requestedByDefault = org?.name ?? this.requestedByDefault;
      this.cdr.detectChanges();
    });
  }

  private submitRequestPayload(
    requestedBy: string,
    contact: { userId?: string; email?: string; phone?: string },
    requiredState: string,
    _notes: string,
    token: string | null,
    createInvite = false,
    inviteChannel: InviteChannel = 'auto'
  ) {
    const payload: CreateRequestPayload = {
      Target: requestedBy,
      org_id: this.org?.id ?? undefined,
      requested_by_org: this.org?.id ?? undefined,
      requested_for_user: contact.userId,
      requested_for_email: contact.email,
      requested_for_phone: contact.phone,
      required_state: requiredState
    };

    this.createRequest(payload, token).subscribe({
      next: (res) => {
        if (createInvite && res?.data?.id) {
          this.createInvite(res.data.id, contact, token, inviteChannel);
        }
        this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
        this.submittingRequest = false;
        this.showCreateModal = false;
        this.loadRequests();
        this.cdr.detectChanges();
      },
      error: () => {
        this.submitFeedback = { type: 'error', message: 'Failed to send request.' };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
  }

  private normalizeContact(value: string) {
    const cleaned = value.trim();
    if (!cleaned) return {};
    if (cleaned.includes('@')) return { email: cleaned };
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
      request: requestId,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      channel,
      token: inviteToken,
      status: 'Sent',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    const headers = this.buildAuthHeaders(token);
    this.http.post(
      `${environment.API_URL}/items/request_invites`,
      payload,
      headers ? { headers } : {}
    ).pipe(
      catchError(() => of(null))
    ).subscribe();
  }

  private buildInviteToken() {
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

  private isBusinessSubscriptionActive(subscription: UserSubscription | null): boolean {
    if (!subscription) {
      return false;
    }
    return (subscription.status ?? '').trim().toLowerCase() === 'active';
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
  requested_for_user?: string;
  requested_for_email?: string;
  requested_for_phone?: string;
  required_state: string;
};

type InviteChannel = 'auto' | 'email' | 'whatsapp' | 'sms';
