import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import {
  CreateRequestModalComponent,
  type CreateRequestForm,
  REQUIRED_STATE_OPTIONS,
  type RequiredState,
  type SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { BusinessCenterService } from '../../services/business-center.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateRequestModalComponent],
  templateUrl: './requests.html',
  styleUrl: './requests.css',
})
export class Requests implements OnInit, OnDestroy {
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

  private successToastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly accessTimeoutMs = 15000;

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

  // ===============================
  // UI Helpers
  // ===============================

  badgeClass(state: string): string {
    const s = (state ?? '').toLowerCase();
    if (s.includes('stable')) return 'badge-stable';
    if (s.includes('focus')) return 'badge-low';
    if (s.includes('fatigue')) return 'badge-fatigue';
    if (s.includes('risk')) return 'badge-risk';
    return '';
  }

  openCreateModal() {
    if (!this.canCreateRequests) return;
    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

  // ===============================
  // Create Request (Optimistic)
  // ===============================

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
    this.submitFeedback = { type: 'info', message: 'Sending request...' };
    this.cdr.detectChanges();

    const payload: CreateRequestPayload = {
      requested_for_email: requestedForEmail,
      required_state: requiredState
    };

    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      this.submittingRequest = false;
      this.submitFeedback = { type: 'error', message: 'Authorization token is missing.' };
      this.cdr.detectChanges();
      return;
    }

    // ✅ Optimistic Row (مرة واحدة فقط)
    const optimisticId =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const optimisticRow: RequestRow = {
      id: optimisticId,
      target: requestedForEmail,
      required_state: requiredState,
      response_status: 'Pending',
      timestamp: new Date().toLocaleString()
    };

    // ضيفه فورًا للـ UI
    this.requests.unshift(optimisticRow);
    this.updateStats();
    this.showCreateModal = false;
    this.cdr.detectChanges();

    this.http.post<{ data?: { id?: unknown } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      { headers, withCredentials: true }
    ).subscribe({
      next: (res) => {
        // لو رجع id حقيقي من السيرفر.. بدّل الـ temp id
        const createdId = this.normalizeId(res?.data?.id);
        if (createdId) {
          const idx = this.requests.findIndex(r => r.id === optimisticId);
          if (idx !== -1) this.requests[idx] = { ...this.requests[idx], id: createdId };
        }

        this.submittingRequest = false;
        this.showSuccessToast('Request sent successfully.');
        this.cdr.detectChanges();

        // ✅ Refresh هادي بعد شوية (من غير ما نكسر ال UI)
        setTimeout(() => this.loadRequests(true), 1500);
      },
      error: (err: unknown) => {
        console.error('Create request error:', err);

        // ✅ Rollback: شيل الـ optimistic row لو فشل
        this.requests = this.requests.filter(r => r.id !== optimisticId);
        this.updateStats();

        this.submittingRequest = false;
        this.submitFeedback = {
          type: 'error',
          message: this.describeHttpError(err, 'Failed to send request.')
        };
        this.cdr.detectChanges();
      }
    });
  }

  private showSuccessToast(message: string) {
    this.submitFeedback = { type: 'success', message };

    if (this.successToastTimer) clearTimeout(this.successToastTimer);

    this.successToastTimer = setTimeout(() => {
      // امسح النجاح لو لسه ظاهر
      if (this.submitFeedback?.type === 'success') {
        this.submitFeedback = null;
        this.cdr.detectChanges();
      }
    }, 2500);
  }

  // ===============================
  // Loading
  // ===============================

  private loadPlanAccess() {
    this.loadingPlanAccess = true;

    this.businessCenter.getHubAccessState().pipe(
      timeout(this.accessTimeoutMs),
      catchError(() => of(null))
    ).subscribe((state) => {
      if (!state) {
        this.hasBusinessAccess = false;
        this.canCreateRequests = false;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.loadingPlanAccess = false;
        this.loadRequests(true);
        return;
      }

      this.hasBusinessAccess = Boolean(state.hasPaidAccess);
      this.canCreateRequests =
        this.hasBusinessAccess &&
        Boolean(state.permissions?.canUseSystem) &&
        !Boolean(state.permissions?.isReadOnly) &&
        !Boolean(state.trialExpired);

      const billingStatus = (state.profile?.billing_status ?? '').toString().trim().toLowerCase();
      const trialDaysRemaining = this.daysUntil(state.trialExpiresAt);
      const trialActive = billingStatus === 'trial' && !state.trialExpired;

      if (trialActive && trialDaysRemaining !== null && trialDaysRemaining > 0) {
        this.businessTrialNotice = `Create requests is a paid Business feature, free for ${trialDaysRemaining} day(s) left.`;
        this.businessInviteTrialNotice = `Email invites are a paid Business feature, free for ${trialDaysRemaining} day(s) left.`;
      } else if (trialActive) {
        this.businessTrialNotice = 'Create requests is a paid Business feature, currently unlocked in your trial.';
        this.businessInviteTrialNotice = 'Email invites are a paid Business feature, currently unlocked in your trial.';
      } else {
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
      }

      this.loadingPlanAccess = false;
      this.loadRequests(true);
    });
  }

  /**
   * @param bustCache لما يبقى true بنضيف param عشوائي عشان نتفادى 304/caching
   */
  private loadRequests(bustCache = false) {
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
        'requested_for_email',
        'requested_for_phone',
        'required_state',
        'response_status',
        'timestamp'
      ].join(',')
    });

    // ✅ كسر كاش (حل مشكلة 304 + data: [])
    if (bustCache) params.set('_', Date.now().toString());

    // لو مش Business: اعرض incoming فقط
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

  // ===============================
  // Mapping + Stats
  // ===============================

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
    if (r.requested_for_email) return r.requested_for_email;
    if (r.requested_for_phone) return r.requested_for_phone;
    if (typeof r.target === 'string') return r.target;
    if (typeof r.Target === 'string') return r.Target;
    return 'scan';
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

  // ===============================
  // Auth + Helpers
  // ===============================

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
    const storedEmail =
      typeof localStorage !== 'undefined' ? localStorage.getItem('user_email') : null;
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
      ? (normalized as RequiredState)
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

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }
}

type RequestRecord = {
  id?: unknown;
  target?: unknown;
  Target?: unknown;
  requested_for_user?: unknown;
  requested_by_user?: unknown;
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
