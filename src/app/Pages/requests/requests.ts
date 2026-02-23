import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs/operators';
import {
  CreateRequestModalComponent,
  type CreateRequestForm,
  REQUIRED_STATE_OPTIONS,
  type RequiredState,
  type SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { SubscriptionService } from '../../services/subscription.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests',
  standalone: true,
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
  hasBusinessAccess = false;
  canCreateRequests = false;

  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  readonly requiredStateOptions = REQUIRED_STATE_OPTIONS;

  requestStats = {
    total: 0,
    pending: 0,
    approved: 0,
    denied: 0
  };

  constructor(
    private http: HttpClient,
    private subscriptionService: SubscriptionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadPlanAccess();
  }

  badgeClass(state: string): string {
    const s = (state ?? '').toLowerCase();
    if (s.includes('stable')) return 'badge-stable';
    if (s.includes('focus')) return 'badge-low';
    if (s.includes('fatigue')) return 'badge-fatigue';
    if (s.includes('risk')) return 'badge-risk';
    return '';
  }

  openCreateModal() {
    if (!this.canCreateRequests) {
      return;
    }
    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

handleCreateRequest(form: CreateRequestForm) {

  if (!this.canCreateRequests) {
    this.submitFeedback = {
      type: 'error',
      message: 'You do not have permission to create requests.'
    };
    this.cdr.detectChanges();
    return;
  }

  const requestedForEmail = this.normalizeEmail(form.requestedForEmail);
  const requiredState = this.normalizeRequiredState(form.requiredState);

  if (!requestedForEmail) {
    this.submitFeedback = { type: 'error', message: 'Enter a valid recipient email.' };
    this.cdr.detectChanges();
    return;
  }

  if (!requiredState) {
    this.submitFeedback = { type: 'error', message: 'Select a required state.' };
    this.cdr.detectChanges();
    return;
  }

  const token = this.getUserToken();
  if (!token) {
    this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
    this.cdr.detectChanges();
    return;
  }

  const currentUserEmail = this.getUserEmailFromToken(token);
  if (currentUserEmail && requestedForEmail === currentUserEmail) {
    this.submitFeedback = { type: 'error', message: 'You cannot send a request to yourself.' };
    this.cdr.detectChanges();
    return;
  }

  this.submittingRequest = true;
  this.cdr.detectChanges();

  const payload = {
    requested_for_email: requestedForEmail,
    required_state: requiredState
  };

  const headers = new HttpHeaders({
    Authorization: `Bearer ${token}`
  });

  this.http.post<{ data?: { id?: string } }>(
    `${environment.API_URL}/items/requests`,
    payload,
    { headers, withCredentials: true }
  ).subscribe({

    next: (res) => {

      // 🚀 Optimistic Update
      const optimisticRow: RequestRow = {
        id: res?.data?.id ?? crypto.randomUUID(),
        target: requestedForEmail,
        required_state: requiredState,
        response_status: 'Pending',
        timestamp: new Date().toLocaleString(),
      };

      this.requests.unshift(optimisticRow);

      this.requestStats.total += 1;
      this.requestStats.pending += 1;

      this.showCreateModal = false;
      this.submittingRequest = false;

      this.submitFeedback = {
        type: 'success',
        message: 'Request sent successfully.'
      };

      this.cdr.detectChanges();

      // sync مع السيرفر بعد ثانية
      setTimeout(() => {
        this.loadRequests();
      }, 1000);
    },

    error: (err: unknown) => {

      console.error('Create request error:', err);

      this.submitFeedback = {
        type: 'error',
        message: 'Failed to send request.'
      };

      this.submittingRequest = false;
      this.cdr.detectChanges();
    }

  });
}

  private loadPlanAccess() {
    this.loadingPlanAccess = true;
    this.subscriptionService.getBusinessAccessSnapshot({ forceRefresh: true }).subscribe({
      next: snapshot => {
        this.hasBusinessAccess = snapshot.hasBusinessAccess;
        this.canCreateRequests = snapshot.hasBusinessAccess;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.loadingPlanAccess = false;
        this.loadRequests();
      },
      error: () => {
        this.hasBusinessAccess = false;
        this.canCreateRequests = false;
        this.loadingPlanAccess = false;
        this.loadRequests();
      }
    });
  }

  private loadRequests() {
    const token = this.getUserToken();
    const headers = this.buildAuthHeaders(token);

    if (!headers) {
      this.requests = [];
      this.updateStats();
      this.cdr.detectChanges();
      return;
    }

    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: '50',
      fields: [
        'id',
        'Target',
        'requested_for_user.id',
        'requested_for_user.first_name',
        'requested_for_user.last_name',
        'requested_for_user.email',
        'requested_for_email',
        'requested_for_phone',
        'required_state',
        'response_status',
        'timestamp'
      ].join(',')
    });

    if (!this.hasBusinessAccess) {
      const userId = this.getUserIdFromToken(token);
      if (!userId) {
        this.requests = [];
        this.updateStats();
        this.cdr.detectChanges();
        return;
      }
      params.set('filter[requested_for_user][_eq]', userId);
    }

    this.http.get<{ data?: RequestRecord[] }>(
      `${environment.API_URL}/items/requests?${params.toString()}`,
      { headers, withCredentials: true }
    ).pipe(
      map(res => res.data ?? [])
    ).subscribe({
      next: data => {
        this.requests = data.map(r => this.mapToRow(r));
        this.updateStats();
        this.cdr.detectChanges();
      },
      error: err => {
        console.error('Load requests error:', err);
        this.requests = [];
        this.updateStats();
        this.cdr.detectChanges();
      }
    });
  }

  private submitRequestPayload(
    requestedForEmail: string,
    requiredState: RequiredState,
    token: string
  ) {
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      this.cdr.detectChanges();
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request...' };
    this.cdr.detectChanges();

    const payload: CreateRequestPayload = {
      requested_for_email: requestedForEmail,
      required_state: requiredState
    };

    this.http.post<{ data?: { id?: unknown } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      { headers, withCredentials: true }
    ).subscribe({
      next: (res) => {
        const createdId = this.normalizeId(res?.data?.id);
        if (!createdId) {
          this.submittingRequest = false;
          this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
          this.showCreateModal = false;
          this.loadRequests();
          this.cdr.detectChanges();
          return;
        }

        const params = new URLSearchParams({
          fields: [
            'id',
            'Target',
            'requested_for_email',
            'required_state',
            'response_status',
            'timestamp'
          ].join(',')
        });

        this.http.get<{ data?: RequestRecord }>(
          `${environment.API_URL}/items/requests/${encodeURIComponent(createdId)}?${params.toString()}`,
          { headers, withCredentials: true }
        ).subscribe({
          next: () => {
            this.submittingRequest = false;
            this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
            this.showCreateModal = false;
            this.loadRequests();
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.submittingRequest = false;
            this.submitFeedback = {
              type: 'error',
              message: this.describeHttpError(err, 'Request created, but refresh failed.')
            };
            this.loadRequests();
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.submittingRequest = false;
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.cdr.detectChanges();
      }
    });
  }

  private mapToRow(r: RequestRecord): RequestRow {
    return {
      id: this.normalizeId(r.id) ?? '',
      target: this.formatTarget(r),
      required_state: r.required_state ?? 'Unknown',
      response_status: r.response_status ?? 'Pending',
      timestamp: this.formatTimestamp(r.timestamp)
    };
  }

  private formatTarget(r: RequestRecord): string {
    if (r.requested_for_user && typeof r.requested_for_user === 'object') {
      const u = r.requested_for_user as Record<string, unknown>;
      const first = typeof u['first_name'] === 'string' ? u['first_name'] : '';
      const last = typeof u['last_name'] === 'string' ? u['last_name'] : '';
      const email = typeof u['email'] === 'string' ? u['email'] : '';
      const name = [first, last].filter(Boolean).join(' ');
      if (name) return name;
      if (email) return email;
    }
    if (r.requested_for_email) return r.requested_for_email;
    if (r.requested_for_phone) return r.requested_for_phone;
    if (typeof r.target === 'string') return r.target;
    if (typeof r.Target === 'string') return r.Target;
    return 'Unknown';
  }

  private formatTimestamp(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  private updateStats() {
    const normalize = (s?: string) => (s ?? '').toLowerCase();

    this.requestStats = {
      total: this.requests.length,
      pending: this.requests.filter(r => normalize(r.response_status).includes('pending')).length,
      approved: this.requests.filter(r => normalize(r.response_status).includes('approved')).length,
      denied: this.requests.filter(r => normalize(r.response_status).includes('denied')).length
    };
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token) return null;
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private getUserToken(): string | null {
    return (
      localStorage.getItem('token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_token')
    );
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
    return this.normalizeId(id);
  }

  private getUserEmailFromToken(token: string | null): string | null {
    const payload = token ? this.decodeJwtPayload(token) : null;
    const payloadEmail = payload?.['email'];
    const storedEmail = typeof localStorage !== 'undefined'
      ? localStorage.getItem('user_email')
      : null;
    return this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return this.isValidEmail(email) ? email : null;
  }

  private normalizeRequiredState(value: unknown): RequiredState | null {
    if (typeof value !== 'string') return null;
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

  private describeHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      '';

    if (status >= 500) return `Server error (${status}): ${detail || fallback}`;
    if (status >= 400) return `Request error (${status}): ${detail || fallback}`;
    return detail || fallback;
  }
}

type RequestRecord = {
  id?: unknown;
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
  id: string;
  target: string;
  required_state: string;
  response_status: string;
  timestamp: string;
};

type CreateRequestPayload = {
  requested_for_email: string;
  required_state: RequiredState;
};
