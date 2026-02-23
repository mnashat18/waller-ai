import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs/operators';
import {
  CreateRequestModalComponent,
  REQUIRED_STATE_OPTIONS
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
export class Requests implements OnInit, OnDestroy {

  showCreateModal = false;
  loadingPlanAccess = true;
  requests: RequestRow[] = [];
  submittingRequest = false;
  hasBusinessAccess = false;
  canCreateRequests = false;

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

  ngOnDestroy() {}

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

  private formatTimestamp(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  // ===============================
  // Load Plan
  // ===============================

  private loadPlanAccess() {
    this.subscriptionService.getBusinessAccessSnapshot({ forceRefresh: true }).subscribe({
      next: snapshot => {
        this.hasBusinessAccess = snapshot.hasBusinessAccess;
        this.canCreateRequests = snapshot.hasBusinessAccess;
        this.loadRequests();
      },
      error: () => {
        this.hasBusinessAccess = false;
        this.canCreateRequests = false;
        this.loadRequests();
      }
    });
  }

  // ===============================
  // Load Requests
  // ===============================

  private loadRequests() {
    const token = this.getUserToken();
    const headers = this.buildAuthHeaders(token);

    if (!headers) {
      this.requests = [];
      this.updateStats();
      return;
    }

    const params = new URLSearchParams({
      sort: '-timestamp',
      limit: '50',
      fields: [
        'id',
        'Target',
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

  private mapToRow(r: RequestRecord): RequestRow {
    return {
      id: r.id ?? '',
      target: this.formatTarget(r),
      required_state: r.required_state ?? 'Unknown',
      response_status: (r.response_status ?? 'Pending'),
      timestamp: this.formatTimestamp(r.timestamp)
    };
  }

  private formatTarget(r: RequestRecord): string {
    if (r.requested_for_user && typeof r.requested_for_user === 'object') {
      const u: any = r.requested_for_user;
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
      if (name) return name;
      if (u.email) return u.email;
    }
    if (r.requested_for_email) return r.requested_for_email;
    if (r.requested_for_phone) return r.requested_for_phone;
    return String(r.Target ?? 'Unknown');
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
  // Auth
  // ===============================

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token) return null;
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private getUserToken(): string | null {
    return (
      localStorage.getItem('token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_token')
    );
  }
}

// ===============================
// Types
// ===============================

type RequestRecord = {
  id?: string;
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
