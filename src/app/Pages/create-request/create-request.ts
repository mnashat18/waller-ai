import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, finalize, map, timeout, toArray } from 'rxjs/operators';
import { Organization, OrganizationService } from '../../services/organization.service';
import { BusinessCenterService, BusinessHubAccessState } from '../../services/business-center.service';
import { environment } from 'src/environments/environment';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type RecipientKind = 'email';

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
  private inviteSentCount = 0;
  private readonly submitTimeoutMs = 30000;
  private readonly businessProfileTimeoutMs = 15000;
  readonly targetOptions = ['Business', 'Ops'];
  form = {
    target: 'Business',
    requiredState: 'Stable',
    notes: ''
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
    return 'Add one or more emails with +. Each email will receive a Business request invitation.';
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

    const target = this.form.target.trim();
    const requiredState = this.form.requiredState.trim();
    if (!target) {
      this.submitFeedback = { type: 'error', message: 'Target is required.' };
      return;
    }
    if (!requiredState) {
      this.submitFeedback = { type: 'error', message: 'Required scan state is required.' };
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

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request(s)...' };
    this.lastSubmitError = '';
    this.inviteSentCount = 0;

    const recipientsSnapshot = [...this.recipients];
    from(recipientsSnapshot).pipe(
      concatMap((recipient) =>
        this.submitRecipientWorkflow(
          target,
          recipient,
          requiredState,
          token
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
          const inviteNote = this.inviteSentCount
            ? ` ${this.inviteSentCount} invitation(s) sent. Ask them to sign up.`
            : '';
          this.submitFeedback = {
            type: 'info',
            message: `Sent ${successCount} of ${recipientsSnapshot.length} request(s). Some recipients failed.${inviteNote}`
          };
        } else {
          const inviteNote = this.inviteSentCount
            ? ` ${this.inviteSentCount} invitation(s) sent. Ask them to sign up.`
            : '';
          this.submitFeedback = {
            type: 'success',
            message: `Request(s) sent successfully to ${successCount} recipient(s).${inviteNote}`
          };
        }

        this.recipients = [];
        this.recipientInput = '';
        this.form.notes = '';
        this.form.requiredState = 'Stable';
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
    target: string,
    recipient: RequestRecipient,
    requiredState: string,
    token: string
  ): Observable<boolean> {
    const contact = { email: recipient.value };

    return this.submitRequestPayload(
      target,
      contact,
      requiredState,
      token,
      Boolean(contact.email)
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
        this.form.target = 'Business';
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
    target: string,
    contact: { email?: string },
    requiredState: string,
    token: string | null,
    createInvite = false
  ): Observable<boolean> {
    const currentUser = this.getCurrentUserContext();
    if (!currentUser.id) {
      this.lastSubmitError = 'Your session expired. Log in again.';
      return of(false);
    }

    return this.resolveRequestedFor(contact, token).pipe(
      concatMap((resolvedContact) => {
        if (!resolvedContact) {
          this.lastSubmitError = 'Add one valid recipient email.';
          return of(false);
        }

        const shouldCreateInvite = createInvite && Boolean(
          resolvedContact.shouldInvite && resolvedContact.email
        );

        const payload: CreateRequestPayload = {
          Target: target,
          required_state: requiredState,
          ...(this.org?.id ? { org_id: this.org.id } : {}),
          ...(this.org?.id ? { requested_by_org: this.org.id } : {}),
          requested_by_user: currentUser.id ?? undefined,
          requested_for_user: resolvedContact.userId,
          requested_for_email: resolvedContact.email,
          response_status: 'Pending'
        };

        return this.createRequest(payload, token).pipe(
          concatMap((res) => {
            if (!shouldCreateInvite) {
              return of(true);
            }

            if (!res?.data?.id) {
              this.lastSubmitError = 'Request created, but invitation could not be linked.';
              return of(false);
            }

            return this.createInvite(
              res.data.id,
              { email: resolvedContact.email },
              token
            ).pipe(
              map((inviteCreated) => {
                if (!inviteCreated) {
                  this.lastSubmitError = 'Request created, but invitation could not be sent.';
                  return false;
                }
                this.inviteSentCount += 1;
                return true;
              })
            );
          }),
          catchError((err) => {
            this.lastSubmitError = this.toFriendlySubmitError(err);
            return of(false);
          })
        );
      }),
      catchError((err) => {
        this.lastSubmitError = this.toFriendlyHttpError(err, 'Failed to resolve user account.');
        return of(false);
      })
    );
  }

  private createRequest(payload: CreateRequestPayload, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    console.info('[create-request] final payload -> /items/requests', payload);
    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      requestOptions
    ).pipe(
      catchError((err) => {
        if (err?.status === 500) {
          console.error('[create-request] requests API 500 response body:', err?.error ?? err);
        } else {
          console.error('[create-request] requests API error response body:', err?.error ?? err);
        }

        if (!this.shouldRetryWithLowercaseTarget(err)) {
          return throwError(() => err);
        }

        const fallbackPayload = this.createTargetFallbackPayload(payload);
        if (!fallbackPayload) {
          return throwError(() => err);
        }

        return this.http.post<{ data?: { id?: string } }>(
          `${environment.API_URL}/items/requests`,
          fallbackPayload,
          requestOptions
        );
      })
    );
  }

  private createInvite(
    requestId: string | number,
    contact: { email?: string },
    token: string | null
  ): Observable<boolean> {
    const inviteToken = this.buildInviteToken();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const payload = {
      org_id: this.org?.id ?? undefined,
      request: requestId,
      email: contact.email ?? undefined,
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
        console.error('[create-request] create invite error:', err);
        return of(false);
      })
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

  private buildInviteToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2, 12);
    const time = Date.now().toString(36);
    return `${time}${random}`.slice(0, 20);
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

  private shouldRetryWithLowercaseTarget(err: any): boolean {
    const message = this.readApiError(err).toLowerCase();
    return message.includes('target') && (message.includes('field') || message.includes('payload'));
  }

  private createTargetFallbackPayload(payload: CreateRequestPayload): Record<string, unknown> | null {
    if (!payload.Target) {
      return null;
    }

    const { Target, ...rest } = payload;
    return {
      ...rest,
      target: Target
    };
  }

  private resolveRequestedFor(
    contact: {
      email?: string;
    },
    token: string | null
  ): Observable<{ userId?: string; email?: string; shouldInvite: boolean } | null> {
    const email = this.normalizeEmail(contact.email);
    if (!email) {
      return of(null);
    }

    const headers = this.buildAuthHeaders(token);
    const params = new URLSearchParams({
      'filter[email][_eq]': email,
      fields: 'id,email',
      limit: '1'
    });
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };

    return this.http.get<{ data?: Array<{ id?: string; email?: string }> }>(
      `${environment.API_URL}/users?${params.toString()}`,
      requestOptions
    ).pipe(
      map((res) => {
        const user = res?.data?.[0];
        const resolvedUserId = this.normalizeId(user?.id);
        if (resolvedUserId) {
          return {
            userId: resolvedUserId,
            email: email ?? undefined,
            shouldInvite: false
          };
        }

        return {
          email: email ?? undefined,
          shouldInvite: true
        };
      })
    );
  }

  private toFriendlySubmitError(err: any): string {
    return this.toFriendlyHttpError(err, 'Failed to create request.');
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

}

type CreateRequestPayload = {
  Target: string;
  org_id?: string;
  requested_by_org?: string;
  requested_by_user?: string;
  scan_id?: string;
  requested_for_user?: string;
  requested_for_email?: string;
  required_state: string;
  response_status?: string;
};


