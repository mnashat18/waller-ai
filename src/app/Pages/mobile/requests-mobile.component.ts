import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import {
  type CreateRequestForm,
  CreateRequestModalComponent,
  REQUIRED_STATE_OPTIONS,
  type RequiredState,
  type SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { BusinessCenterService } from '../../services/business-center.service';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateRequestModalComponent, NotificationsComponent],
  templateUrl: './requests-mobile.html'
})
export class RequestsMobileComponent implements OnInit, OnDestroy {
  showCreateModal = false;
  loadingPlanAccess = true;
  requests: RequestRow[] = [];
  submitFeedback: SubmitFeedback | null = null;
  submittingRequest = false;
  showPermissionNotice = false;
  hasBusinessAccess = false;
  canCreateRequests = false;
  currentPlanName = 'Free';
  currentPlanCode = 'free';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;
  private successToastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly accessTimeoutMs = 15000;
  requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };

  constructor(
    private http: HttpClient,
    private businessCenter: BusinessCenterService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadPlanAccess();
  }

  ngOnDestroy() {
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
      this.successToastTimer = null;
    }
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
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    const requestedFor = this.normalizeEmail(form.requestedForEmail);
    const requiredState = this.normalizeRequiredState(form.requiredState);

    if (!requestedFor) {
      this.submitFeedback = { type: 'error', message: 'Enter a valid recipient email.' };
      this.cdr.detectChanges();
      return;
    }

    if (!requiredState) {
      this.submitFeedback = { type: 'error', message: 'Select a required state.' };
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

    this.submitRequestPayload(requestedFor, requiredState, userToken);
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
    this.businessCenter.getHubAccessState().pipe(
      timeout(this.accessTimeoutMs),
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to load plan access.')
        };
        return of(null);
      })
    ).subscribe((state) => {
      if (!state) {
        this.hasBusinessAccess = false;
        this.canCreateRequests = false;
        this.currentPlanName = 'Free';
        this.currentPlanCode = 'free';
        this.isBusinessTrial = false;
        this.trialDaysRemaining = null;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.loadingPlanAccess = false;
        this.loadRequests();
        this.cdr.detectChanges();
        return;
      }

      this.hasBusinessAccess = Boolean(state.hasPaidAccess);
      this.currentPlanName = this.hasBusinessAccess ? 'Business' : 'Free';
      this.currentPlanCode = (state.profile?.plan_code ?? (this.hasBusinessAccess ? 'business' : 'free')).toString().toLowerCase();

      const billingStatus = (state.profile?.billing_status ?? '').toString().trim().toLowerCase();
      this.isBusinessTrial = billingStatus === 'trial' && !state.trialExpired;
      this.trialDaysRemaining = this.isBusinessTrial
        ? this.daysUntil(state.trialExpiresAt)
        : null;

      this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
      this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email invites');
      this.canCreateRequests =
        this.hasBusinessAccess &&
        Boolean(state.permissions?.canUseSystem) &&
        !Boolean(state.permissions?.isReadOnly) &&
        !Boolean(state.trialExpired);

      this.loadingPlanAccess = false;
      this.loadRequests();
      this.cdr.detectChanges();
    });
  }

  private loadRequests() {
    if (this.hasBusinessAccess) {
      this.loadBusinessRequests();
      return;
    }

    this.loadIncomingRequests();
  }

  private loadBusinessRequests() {
    const token = this.getUserToken();
    if (!token) {
      this.requests = [];
      this.requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };
      this.cdr.detectChanges();
      return;
    }

    this.fetchRequests(token, null).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => console.error('[requests-mobile] requests error:', fetchErr)
    });
  }

  private loadIncomingRequests() {
    const token = this.getUserToken();
    const userId = this.getUserIdFromToken(token);

    if (!token || !userId) {
      this.requests = [];
      this.requestStats = { total: 0, pending: 0, approved: 0, denied: 0 };
      this.cdr.detectChanges();
      return;
    }

    this.fetchRequests(token, { requestedForUserId: userId }).subscribe({
      next: (requests) => this.applyRequests(requests),
      error: (fetchErr) => {
        console.error('[requests-mobile] incoming requests error:', fetchErr);
        this.applyRequests([]);
      }
    });
  }

  private fetchRequests(
    token: string | null,
    filters: { requestedForUserId?: string } | null
  ) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return of([] as RequestRecord[]);
    }

    const fields = [
      'id',
      'requested_for_email',
      'requested_for_phone',
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

    return this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      { headers, withCredentials: true }
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
        'requested_for_email',
        'requested_for_phone',
        'required_state',
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
    if (!token || this.isTokenExpired(token)) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
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

  private submitRequestPayload(
    requestedForEmail: string,
    requiredState: RequiredState,
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
      required_state: requiredState
    };

    this.createRequest(payload, token).subscribe({
      next: (res) => {
        const createdId = this.normalizeId(res?.data?.id);
        if (!createdId) {
          this.showSuccessToast('Request sent successfully.');
          this.submittingRequest = false;
          this.showCreateModal = false;
          this.loadRequests();
          this.cdr.detectChanges();
          return;
        }

        this.fetchCreatedRequestById(createdId, token).subscribe({
          next: () => {
            this.showSuccessToast('Request sent successfully.');
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
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
  }

  private formatRequestTarget(request: RequestRecord): string {
    if (request.requested_for_email) return request.requested_for_email;
    if (request.requested_for_phone) return request.requested_for_phone;
    return 'scan';
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

  private normalizeRequiredState(value: unknown): RequiredState | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return (REQUIRED_STATE_OPTIONS as readonly string[]).includes(normalized)
      ? normalized as RequiredState
      : null;
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

  private getUserEmailFromToken(token: string | null): string | null {
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = payload?.['email'];
    const storedEmail = typeof localStorage !== 'undefined'
      ? localStorage.getItem('user_email')
      : null;
    return this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
  }

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  private showSuccessToast(message: string): void {
    this.submitFeedback = { type: 'success', message };
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
    }
    this.successToastTimer = setTimeout(() => {
      if (this.submitFeedback?.type === 'success') {
        this.submitFeedback = null;
        this.cdr.detectChanges();
      }
    }, 3000);
  }
}

type RequestRecord = {
  id?: string;
  target?: unknown;
  Target?: unknown;
  requested_for_user?: unknown;
  requested_for_email?: string;
  requested_for_phone?: string;
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
  requested_for_email: string;
  required_state: RequiredState;
};
