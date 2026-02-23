import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { catchError, concatMap, finalize, map, timeout, toArray } from 'rxjs/operators';
import { Organization, OrganizationService } from '../../services/organization.service';
import { BusinessCenterService, BusinessHubAccessState } from '../../services/business-center.service';
import { environment } from 'src/environments/environment';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type RecipientKind = 'email';
type RequestTarget = 'scan';

type RequestRecipient = {
  id: string;
  kind: RecipientKind;
  value: string;
  display: string;
};

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './create-request.html',
  styleUrl: './create-request.css'
})
export class CreateRequestComponent implements OnInit, OnDestroy {
  isAdminUser = false;
  loadingBusinessProfile = true;
  businessProfileMissing = false;
  canCreateRequests = false;
  currentPlanName = 'Free';
  currentPlanCode = 'free';
  memberRoleLabel = 'User';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  businessAccessReason = '';
  accessState: BusinessHubAccessState | null = null;
  org: Organization | null = null;
  submittingRequest = false;
  submitFeedback: Feedback | null = null;
  private redirectAfterSubmitTimer: ReturnType<typeof setTimeout> | null = null;
  recipientInput = '';
  recipientError = '';
  recipients: RequestRecipient[] = [];
  private lastSubmitError = '';
  private readonly submitTimeoutMs = 30000;
  private readonly businessProfileTimeoutMs = 15000;
  readonly targetOptions: RequestTarget[] = ['scan'];
  form = {
    target: 'scan'
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private organizationService: OrganizationService,
    private businessCenterService: BusinessCenterService
  ) {}

  ngOnInit() {
    this.isAdminUser = this.checkAdminAccess();
    this.loadBusinessProfileState();
    this.loadOrganization();
  }

  ngOnDestroy(): void {
    if (this.redirectAfterSubmitTimer) {
      clearTimeout(this.redirectAfterSubmitTimer);
      this.redirectAfterSubmitTimer = null;
    }
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

  recipientInputPlaceholder(): string {
    return 'user@example.com';
  }

  recipientEntryHint(): string {
    return 'Add one or more emails with +. Each email will receive a scan request invitation.';
  }

  trackRecipientById(_: number, item: RequestRecipient) {
    return item.id;
  }

  addRecipient() {
    this.recipientError = '';
    const raw = this.recipientInput.trim();

    if (!raw) {
      this.recipientError = 'Enter email first.';
      return;
    }

    const email = raw.toLowerCase();
    if (!this.isValidEmail(email)) {
      this.recipientError = 'Please enter a valid email format.';
      return;
    }
    if (this.hasRecipient('email', email)) {
      this.recipientError = 'This email is already added.';
      return;
    }
    this.recipients = [
      ...this.recipients,
      {
        id: this.newRecipientId(),
        kind: 'email',
        value: email,
        display: email
      }
    ];
    this.recipientInput = '';
  }

  removeRecipient(id: string) {
    this.recipients = this.recipients.filter((item) => item.id !== id);
  }

  submitRequest() {
    if (this.businessProfileMissing) {
      this.submitFeedback = {
        type: 'error',
        message: 'No Business Profile Found. Create Business Profile first.'
      };
      return;
    }

    if (!this.canCreateRequests) {
      this.submitFeedback = {
        type: 'error',
        message: this.businessAccessReason || 'Your Business role cannot create requests.'
      };
      return;
    }

    const target = this.normalizeTarget(this.form.target);
    if (!target) {
      this.submitFeedback = { type: 'error', message: 'Select a valid target first.' };
      return;
    }
    if (!this.consumePendingRecipientInput()) {
      this.submitFeedback = { type: 'error', message: this.recipientError || 'Please fix recipient entry first.' };
      return;
    }
    if (!this.recipients.length) {
      this.submitFeedback = { type: 'error', message: 'Add at least one recipient email.' };
      return;
    }

    const token = this.getUserToken();
    if (!token) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      return;
    }
    const currentUser = this.getCurrentUserContext();
    if (!currentUser.id) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      return;
    }
    const authenticatedUser = { id: currentUser.id, email: currentUser.email };

    if (authenticatedUser.email && this.recipients.some((recipient) => recipient.value === authenticatedUser.email)) {
      this.submitFeedback = { type: 'error', message: "You can't send a request to yourself." };
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request(s)...' };
    this.lastSubmitError = '';

    const recipientsSnapshot = [...this.recipients];
    from(recipientsSnapshot).pipe(
      concatMap((recipient) =>
        this.submitRecipientWorkflow(
          target,
          recipient,
          token,
          authenticatedUser
        ).pipe(
          timeout(this.submitTimeoutMs),
          catchError((err) => {
            this.lastSubmitError = this.toFriendlyHttpError(
              err,
              'Request timed out. Please try again.'
            );
            return of(false);
          })
        )
      ),
      toArray(),
      finalize(() => {
        this.submittingRequest = false;
      })
    ).subscribe({
      next: (results) => {
        const successCount = results.filter(Boolean).length;

        if (!successCount) {
          this.submitFeedback = {
            type: 'error',
            message: this.lastSubmitError || 'Failed to send requests.'
          };
          return;
        }

        if (successCount < recipientsSnapshot.length) {
          this.submitFeedback = {
            type: 'info',
            message: `Sent ${successCount} of ${recipientsSnapshot.length} request(s). Some recipients failed.`
          };
        } else {
          this.submitFeedback = {
            type: 'success',
            message: `Request(s) sent successfully to ${successCount} recipient(s).`
          };
        }

        this.recipients = [];
        this.recipientInput = '';
        this.form.target = 'scan';
        if (this.redirectAfterSubmitTimer) {
          clearTimeout(this.redirectAfterSubmitTimer);
        }
        this.redirectAfterSubmitTimer = setTimeout(() => {
          this.router.navigate(['/requests']);
        }, 900);
      },
      error: (err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to send requests.')
        };
      }
    });
  }

  private submitRecipientWorkflow(
    target: RequestTarget,
    recipient: RequestRecipient,
    token: string,
    currentUser: { id: string; email: string | null }
  ): Observable<boolean> {
    return this.submitRequestPayload(
      target,
      recipient.value,
      token,
      currentUser
    ).pipe(
      catchError((err) => {
        this.lastSubmitError = this.toFriendlyHttpError(err, 'Failed to send request.');
        return of(false);
      })
    );
  }

  private consumePendingRecipientInput(): boolean {
    if (!this.recipientInput.trim()) {
      return true;
    }

    this.addRecipient();
    return !this.recipientError;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private hasRecipient(kind: RecipientKind, value: string): boolean {
    return this.recipients.some((item) => item.kind === kind && item.value === value);
  }

  private newRecipientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private loadOrganization() {
    this.organizationService.getUserOrganization().pipe(
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to load organization profile.')
        };
        return of(null);
      })
    ).subscribe((org) => {
      this.org = org;
      if (!this.form.target.trim()) {
        this.form.target = 'scan';
      }
    });
  }

  private loadBusinessProfileState() {
    this.loadingBusinessProfile = true;
    this.businessProfileMissing = false;
    this.businessAccessReason = '';
    this.canCreateRequests = false;
    this.accessState = null;

    this.businessCenterService.getHubAccessState().pipe(
      timeout(this.businessProfileTimeoutMs),
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to load business profile.')
        };
        return of(null);
      }),
      finalize(() => {
        this.loadingBusinessProfile = false;
      })
    ).subscribe((state) => {
      if (!state) {
        return;
      }

      this.accessState = state;
      const profile = state.profile;
      this.businessAccessReason = state.reason || '';
      this.memberRoleLabel = this.toTitleCase((state.memberRole ?? '').toString()) || 'User';

      if (!profile?.id) {
        this.businessProfileMissing = true;
        this.currentPlanCode = 'free';
        this.currentPlanName = 'Free';
        this.isBusinessTrial = false;
        this.trialDaysRemaining = null;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.canCreateRequests = false;
        return;
      }

      this.businessProfileMissing = false;
      const rawPlanCode = (profile.plan_code ?? '').toString().trim().toLowerCase();
      this.currentPlanCode = rawPlanCode || 'business';
      this.currentPlanName = this.currentPlanCode === 'business'
        ? 'Business'
        : this.toTitleCase(this.currentPlanCode);

      const billingStatus = (profile.billing_status ?? '').toString().trim().toLowerCase();
      this.isBusinessTrial = billingStatus === 'trial' && !state.trialExpired;
      this.trialDaysRemaining = this.isBusinessTrial
        ? this.daysUntil(state.trialExpiresAt)
        : null;
      this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
      this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email invites');

      this.canCreateRequests =
        Boolean(state.hasPaidAccess) &&
        Boolean(state.permissions?.canUseSystem) &&
        !state.trialExpired;

      if (!this.canCreateRequests && !this.businessAccessReason) {
        if (state.trialExpired) {
          this.businessAccessReason = 'Business trial expired. Please upgrade to continue.';
        } else if (state.permissions?.isReadOnly) {
          this.businessAccessReason = 'Your company role is viewer (read-only).';
        } else {
          this.businessAccessReason = 'Business access is not active for this account.';
        }
      }

      if (!this.org?.id && state.orgId) {
        const orgName = profile.business_name || profile.company_name || 'Business Profile';
        this.org = {
          id: state.orgId,
          name: orgName
        };
      }
    });
  }

  openCreateBusinessProfile() {
    this.router.navigate(['/payment'], {
      queryParams: { onboarding: 'required' }
    });
  }

  private submitRequestPayload(
    target: RequestTarget,
    requestedForEmail: string,
    token: string | null,
    currentUserContext?: { id: string; email: string | null }
  ): Observable<boolean> {
    const currentUser = currentUserContext ?? this.getCurrentUserContext();
    if (!currentUser.id) {
      this.lastSubmitError = 'Your session expired. Log in again.';
      return of(false);
    }

    const email = this.normalizeEmail(requestedForEmail);
    if (!email) {
      this.lastSubmitError = 'Add one valid recipient email.';
      return of(false);
    }

    if (currentUser.email && currentUser.email === email) {
      this.lastSubmitError = "You can't send a request to yourself.";
      return of(false);
    }

    const payload: CreateRequestPayload = {
      requested_for_email: email,
      target
    };

    return this.createRequest(payload, token).pipe(
      concatMap((res) => {
        const createdId = this.normalizeId(res?.data?.id);
        if (!createdId) {
          return of(true);
        }

        return this.fetchCreatedRequestById(createdId, token).pipe(
          map(() => true),
          catchError((err) => {
            this.lastSubmitError = this.toFriendlyHttpError(err, 'Request created, but refresh failed.');
            return of(false);
          })
        );
      }),
      catchError((err) => {
        this.lastSubmitError = this.toFriendlyHttpError(err, 'Failed to create request.');
        return of(false);
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

  private fetchCreatedRequestById(requestId: string, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
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
    return this.http.get<{ data?: Record<string, unknown> }>(
      `${environment.API_URL}/items/requests/${encodeURIComponent(requestId)}?${params.toString()}`,
      requestOptions
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

  private toFriendlyHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const raw = this.readApiError(err, fallback);
    const normalized = raw.toLowerCase();

    if (
      status === 0 ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('connection refused')
    ) {
      return `Network error: ${raw || fallback}`;
    }

    if (normalized.includes('timeout')) {
      return `Network error: ${raw || fallback}`;
    }

    if (status >= 500) {
      return `Server error (${status}): ${raw || fallback}`;
    }

    if (status >= 400) {
      return `Request error (${status}): ${raw || fallback}`;
    }

    return raw || fallback;
  }

  private readApiError(err: any, fallback = 'Failed to send request.'): string {
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.message ||
      err?.message ||
      fallback
    );
  }

  private daysUntil(value: string | null): number | null {
    if (!value) {
      return null;
    }
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return null;
    }
    const remainingMs = timestamp - Date.now();
    if (remainingMs <= 0) {
      return 0;
    }
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  }

  private toTitleCase(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  private getCurrentUserContext(): { id: string | null; email: string | null } {
    const token = this.getUserToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const storedId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_id') : null;
    const storedEmail =
      typeof localStorage !== 'undefined' ? localStorage.getItem('user_email') : null;

    const payloadId = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    const payloadEmail = payload?.['email'];
    const id = this.normalizeId(payloadId) ?? this.normalizeId(storedId);
    const email = this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
    return { id, email };
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return null;
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const email = value.trim().toLowerCase();
    return this.isValidEmail(email) ? email : null;
  }

  private normalizeTarget(value: unknown): RequestTarget | null {
    if (typeof value !== 'string') {
      return null;
    }
    const target = value.trim();
    return this.targetOptions.find((item) => item === target) ?? null;
  }

}

type CreateRequestPayload = {
  requested_for_email?: string;
  target: RequestTarget;
};


