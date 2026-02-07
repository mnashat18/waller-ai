import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateRequestForm,
  CreateRequestModalComponent,
  SubmitFeedback
} from '../../components/create-request-modal/create-request-modal';
import { AdminTokenService } from '../../services/admin-token';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-requests',
  imports: [CommonModule, CreateRequestModalComponent],
  templateUrl: './requests.html',
  styleUrl: './requests.css',
})
export class Requests implements OnInit {
  showCreateModal = false;
  requests: RequestRow[] = [];
  submitFeedback: SubmitFeedback | null = null;
  submittingRequest = false;
  showPermissionNotice = false;
  isAdminUser = false;

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isAdminUser = this.checkAdminAccess();
    this.loadRequests();
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
    if (!this.isAdminUser) {
      this.submitFeedback = { type: 'error', message: 'Only admins can send requests.' };
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    const requestedBy = form.requestedBy.trim();
    const requestedFor = form.requestedFor.trim();
    const requiredState = form.requiredState.trim();
    const notes = form.notes.trim();

    if (!requestedBy) {
      this.submitFeedback = { type: 'error', message: 'Requested by is required.' };
      this.cdr.detectChanges();
      return;
    }

    if (!requestedFor) {
      this.submitFeedback = { type: 'error', message: 'Requested for is required.' };
      this.cdr.detectChanges();
      return;
    }

    if (!requiredState) {
      this.submitFeedback = { type: 'error', message: 'Required state is required.' };
      this.cdr.detectChanges();
      return;
    }

    this.adminTokens.getToken().subscribe({
      next: (adminToken) => {
        if (!adminToken) {
          this.submitFeedback = { type: 'error', message: 'Only admins can send requests.' };
          this.showPermissionNotice = true;
          this.submittingRequest = false;
          this.cdr.detectChanges();
          return;
        }

        this.submittingRequest = true;
        this.submitFeedback = { type: 'info', message: 'Sending request...' };
        this.cdr.detectChanges();

        const userToken = this.getUserToken();
        const token = adminToken ?? userToken;
        const tokenSource = adminToken ? 'admin' : userToken ? 'user' : 'none';
        console.info('[requests] submit using token source:', tokenSource);

        this.resolveRequestedFor(requestedFor, token).subscribe({
          next: (resolvedUserId) => {
            if (!resolvedUserId) {
              this.submitFeedback = { type: 'error', message: 'User email not found.' };
              this.submittingRequest = false;
              this.cdr.detectChanges();
              return;
            }

            const payload: CreateRequestPayload = {
              Target: requestedBy,
              requested_for: resolvedUserId,
              required_state: requiredState,
              response_status: 'Pending',
              response_payload: this.parseResponsePayload(notes),
              timestamp: new Date().toISOString()
            };

            this.createRequest(payload, token).subscribe({
              next: () => {
                console.info('[requests] request created');
                this.submitFeedback = { type: 'success', message: 'Request sent successfully.' };
                this.submittingRequest = false;
                this.showCreateModal = false;
                this.loadRequests();
                this.cdr.detectChanges();
              },
              error: (err) => {
                console.error('[requests] create request error:', err);
                this.submitFeedback = { type: 'error', message: 'Failed to send request.' };
                this.submittingRequest = false;
                this.cdr.detectChanges();
              }
            });
          },
          error: (err) => {
            console.error('[requests] resolve user error:', err);
            this.submitFeedback = { type: 'error', message: 'Failed to resolve user email.' };
            this.submittingRequest = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        console.error('[requests] admin token error:', err);
        this.submitFeedback = { type: 'error', message: 'Failed to get admin token.' };
        this.submittingRequest = false;
        this.cdr.detectChanges();
      }
    });
  }

  private loadRequests() {
    if (this.isAdminUser) {
      this.adminTokens.getToken().subscribe({
        next: (adminToken) => {
          const tokenSource = adminToken ? 'admin' : 'none';
          console.info('[requests] using token source:', tokenSource);

          this.fetchRequests(adminToken, null).subscribe({
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
    const userId = this.getUserIdFromToken(userToken);
    const tokenSource = userToken ? 'user' : 'none';
    console.info('[requests] using token source:', tokenSource);

    if (!userToken || !userId) {
      this.requests = [];
      this.cdr.detectChanges();
      return;
    }

    this.fetchRequests(userToken, userId).subscribe({
      next: (requests) => {
        console.info('[requests] requests count:', requests.length);
        this.applyRequests(requests);
      },
      error: (fetchErr) => {
        console.error('[requests] requests error:', fetchErr);
      }
    });
  }

  private fetchRequests(token: string | null, requestedForUserId: string | null) {
    const headers = this.buildAuthHeaders(token);
    const fields = [
      'id',
      'Target',
      'requested_for',
      'required_state',
      'response_status',
      'response_payload',
      'timestamp'
    ].join(',');
    const params = new URLSearchParams({
      'sort': '-timestamp',
      'limit': '50',
      'fields': fields
    });

    if (requestedForUserId) {
      params.set('filter[requested_for][_eq]', requestedForUserId);
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
    this.cdr.detectChanges();
  }

  private mapToRequestRow(request: RequestRecord): RequestRow {
    return {
      target: this.formatTarget(request.Target),
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

  private parseResponsePayload(notes: string): string | Record<string, unknown> | undefined {
    if (!notes) {
      return undefined;
    }
    if (notes.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(notes);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return notes;
      }
    }
    return notes;
  }

  private resolveRequestedFor(value: string, token: string | null) {
    if (!value) {
      return of(null);
    }

    if (!this.looksLikeEmail(value)) {
      return of(value);
    }

    const headers = this.buildAuthHeaders(token);
    const params = new URLSearchParams({
      'filter[email][_eq]': value,
      'fields': 'id',
      'limit': '1'
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
    return this.http.post(
      `${environment.API_URL}/items/requests`,
      payload,
      headers ? { headers } : {}
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
    const token = localStorage.getItem('token');
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
    const userToken = localStorage.getItem('token');
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

  openCreateModal() {
    if (!this.isAdminUser) {
      this.submitFeedback = { type: 'error', message: 'Only admins can send requests.' };
      this.showPermissionNotice = true;
      this.cdr.detectChanges();
      return;
    }

    this.submitFeedback = null;
    this.showCreateModal = true;
    this.cdr.detectChanges();
  }

}

type RequestRecord = {
  id?: string;
  Target?: unknown;
  requested_for?: string;
  required_state?: string;
  response_status?: string;
  response_payload?: unknown;
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
  requested_for: string;
  required_state: string;
  response_status: string;
  response_payload?: unknown;
  timestamp: string;
};
