import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { environment } from '../../../environments/environment';

type SessionReadinessResult = {
  status: 'authenticated' | 'unauthenticated' | 'failed' | 'timed-out';
};

@Component({
  selector: 'app-invite-claim-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="claim-shell">
      <div class="claim-shell__panel app-dashboard-panel">
        <p class="claim-shell__eyebrow">Organization Access</p>
        <h1>{{ loading ? 'Joining your workspace...' : 'Accept Invitation' }}</h1>

        <p class="claim-shell__note" *ngIf="loading">{{ statusMessage }}</p>
        <p class="claim-shell__note" *ngIf="loading && statusSubtext">{{ statusSubtext }}</p>
        <p class="claim-shell__success" *ngIf="!loading && successMessage">{{ successMessage }}</p>
        <p class="claim-shell__error" *ngIf="!loading && errorMessage">{{ errorMessage }}</p>

        <div class="claim-shell__actions" *ngIf="!loading">
          <button
            *ngIf="showRetryAction && currentInviteToken"
            type="button"
            class="claim-shell__button"
            (click)="retryClaim()">
            Retry
          </button>
          <button
            *ngIf="showCancelAction && currentInviteToken"
            type="button"
            class="claim-shell__button"
            (click)="cancelInvitation()">
            Cancel invitation
          </button>
          <a [routerLink]="['/']" [queryParams]="signupQueryParams" class="claim-shell__button">
            Continue sign up
          </a>
          <a [routerLink]="['/']" [queryParams]="loginQueryParams" class="claim-shell__button">
            Sign in instead
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .claim-shell {
      min-height: calc(100vh - 4rem);
      display: grid;
      place-items: center;
      padding: 1rem;
    }

    .claim-shell__panel {
      width: min(100%, 42rem);
      padding: 1.4rem;
      border-radius: 1.8rem;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 46%),
        rgba(9, 14, 28, 0.92);
    }

    .claim-shell__eyebrow {
      margin: 0;
      color: rgba(125, 211, 252, 0.88);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0.35rem 0 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: clamp(1.8rem, 4vw, 2.4rem);
      letter-spacing: -0.05em;
    }

    .claim-shell__note,
    .claim-shell__success,
    .claim-shell__error {
      margin: 1rem 0 0;
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      line-height: 1.65;
    }

    .claim-shell__note {
      color: rgba(226, 232, 240, 0.82);
      border: 1px solid rgba(56, 189, 248, 0.18);
      background: rgba(56, 189, 248, 0.08);
    }

    .claim-shell__success {
      color: rgba(220, 252, 231, 0.92);
      border: 1px solid rgba(34, 197, 94, 0.22);
      background: rgba(22, 163, 74, 0.15);
    }

    .claim-shell__error {
      color: rgba(254, 226, 226, 0.9);
      border: 1px solid rgba(248, 113, 113, 0.24);
      background: rgba(127, 29, 29, 0.22);
    }

    .claim-shell__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-top: 1rem;
    }

    .claim-shell__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.7rem;
      padding: 0.6rem 1rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      color: #e2e8f0;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.04);
    }
  `]
})
export class InviteClaimPageComponent implements OnInit {
  private readonly sessionReadyTimeoutMs = 12000;

  loading = true;
  statusMessage = 'Checking your session...';
  statusSubtext = '';
  successMessage = '';
  errorMessage = '';
  authLoading = true;
  authResolved = false;
  currentUser: Record<string, unknown> | null = null;
  currentInviteToken = '';
  showRetryAction = false;
  showCancelAction = false;
  signupQueryParams: Record<string, string> = { invite: '1', auth: 'signup' };
  loginQueryParams: Record<string, string> = { invite: '1', auth: 'login' };

  constructor(
    private auth: AuthService,
    private invites: InviteService,
    private postLoginRouting: PostLoginRoutingService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    void this.startClaimFlow();
  }

  retryClaim(): void {
    const token = this.currentInviteToken || this.resolveInviteTokenFromRoute();
    if (token) {
      this.invites.clearClaimAttemptedForToken(token);
      this.invites.clearClaimInProgressForToken(token);
      this.invites.clearInviteClaimError();
    }

    this.loading = true;
    this.statusMessage = 'Checking your session...';
    this.statusSubtext = '';
    this.successMessage = '';
    this.errorMessage = '';
    this.showRetryAction = false;
    this.showCancelAction = false;
    void this.startClaimFlow();
  }

  cancelInvitation(): void {
    this.invites.clearPendingInviteToken();
    if (this.currentInviteToken) {
      this.invites.clearClaimAttemptedForToken(this.currentInviteToken);
      this.invites.clearClaimInProgressForToken(this.currentInviteToken);
    }
    this.auth.consumePostAuthRedirect('');
    void this.router.navigate(['/'], { replaceUrl: true });
  }

  private async startClaimFlow(): Promise<void> {
    this.logInviteClaim('route loaded');

    const token = this.resolveInviteTokenFromRoute();
    this.currentInviteToken = token ?? '';
    if (!token) {
      this.loading = false;
      this.errorMessage = 'Invitation token is missing.';
      this.showRetryAction = false;
      this.showCancelAction = false;
      return;
    }

    this.invites.setPendingInviteToken(token);
    this.logInviteClaim('saved pending_invite_token');
    this.signupQueryParams = { invite: '1', token, auth: 'signup' };
    this.loginQueryParams = { invite: '1', token, auth: 'login' };
    this.showRetryAction = false;
    this.showCancelAction = false;

    this.logInviteClaim('checking auth token');
    const accessToken = this.resolveAccessToken();
    const tokenDiagnostics = this.getTokenDiagnostics(accessToken);
    this.logInviteClaim('session readiness token diagnostics', tokenDiagnostics);

    if (!tokenDiagnostics.exists || !tokenDiagnostics.validJwt || tokenDiagnostics.expired) {
      await this.redirectToInviteSignupOnHomepage(token);
      return;
    }

    const authState = await this.resolveAuthStateWithTimeout(this.sessionReadyTimeoutMs);
    this.logInviteClaim('session readiness verification result', {
      status: authState.status,
      hasUser: Boolean(this.currentUser?.['id'])
    });
    if (authState.status !== 'authenticated') {
      this.showSessionVerificationError(token);
      return;
    }

    try {
      this.logInviteClaim('valid auth token found, accepting invite');
      this.statusMessage = 'Joining your workspace...';
      this.statusSubtext = 'We are connecting your account to the organization.';
      const nextRoute = await this.postLoginRouting.resolveDestination();
      if (nextRoute.startsWith('/invites/claim')) {
        this.loading = false;
        this.statusSubtext = '';
        const storedError = this.invites.consumeInviteClaimError();
        this.clearTerminalInviteState(token);
        this.showRetryAction = true;
        this.showCancelAction = true;
        this.errorMessage = storedError
          ? this.invites.formatInviteClaimError(storedError)
          : 'Could not accept invitation. Please verify the invitation link and account, then retry.';
        return;
      }
      await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
    } catch (error) {
      this.loading = false;
      this.statusSubtext = '';
      const storedError = this.invites.consumeInviteClaimError();
      this.clearTerminalInviteState(token);
      this.showRetryAction = true;
      this.showCancelAction = true;
      this.errorMessage = storedError
        ? this.invites.formatInviteClaimError(storedError)
        : this.invites.formatInviteClaimError(this.invites.getReadableInviteError(error));
    }
  }

  private async resolveAuthStateWithTimeout(
    timeoutMs = this.sessionReadyTimeoutMs
  ): Promise<SessionReadinessResult> {
    this.authLoading = true;
    this.authResolved = false;
    this.currentUser = null;

    try {
      const currentUserCheck: Promise<SessionReadinessResult> = this.auth.getCurrentUserAfterRestore().then((user) => {
        if (user?.id) {
          this.currentUser = user as Record<string, unknown>;
          return { status: 'authenticated' } as SessionReadinessResult;
        }
        return { status: 'unauthenticated' } as SessionReadinessResult;
      }).catch(() => ({ status: 'failed' } as SessionReadinessResult));
      const timeoutCheck: Promise<SessionReadinessResult> = this.sleep(timeoutMs).then(
        () => ({ status: 'timed-out' } as SessionReadinessResult)
      );
      const resolved = await Promise.race<SessionReadinessResult>([
        currentUserCheck,
        timeoutCheck
      ]);

      this.authLoading = false;
      this.authResolved = true;
      return resolved;
    } catch {
      this.authLoading = false;
      this.authResolved = true;
      return { status: 'failed' };
    }
  }

  private resolveInviteTokenFromRoute(): string | null {
    const tokenParam = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
    const inviteParam = this.route.snapshot.queryParamMap.get('invite')?.trim() ?? '';
    const codeParam = this.route.snapshot.queryParamMap.get('code')?.trim() ?? '';

    const token = tokenParam || (inviteParam && inviteParam !== '1' ? inviteParam : '') || codeParam;
    if (!token) {
      return null;
    }

    return token;
  }

  private resolveAccessToken(): string | null {
    const authAny = this.auth as unknown as {
      getAccessToken?: () => string | null | undefined;
      getStoredAccessToken?: () => string | null | undefined;
    };

    const fromStorage =
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_access_token') ??
      localStorage.getItem('directus_token') ??
      localStorage.getItem('token');
    const fromService =
      (typeof authAny.getAccessToken === 'function' ? authAny.getAccessToken() : null) ??
      (typeof authAny.getStoredAccessToken === 'function' ? authAny.getStoredAccessToken() : null);

    const token = (fromStorage ?? fromService ?? '').trim();
    return token || null;
  }

  private isValidJwt(value: string | null): boolean {
    if (!value) {
      return false;
    }
    return value.split('.').length === 3;
  }

  private showSessionVerificationError(token: string): void {
    this.loading = false;
    this.statusSubtext = '';
    this.currentInviteToken = token;
    this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(token)}`);
    this.loginQueryParams = { invite: '1', token, auth: 'login' };
    this.signupQueryParams = { invite: '1', token, auth: 'signup' };
    this.showRetryAction = true;
    this.showCancelAction = true;
    this.errorMessage = 'We could not verify your signed-in session. Please sign in again and retry your invitation.';
  }

  private getTokenDiagnostics(token: string | null): { exists: boolean; validJwt: boolean; expired: boolean } {
    return {
      exists: Boolean(token),
      validJwt: this.isValidJwt(token),
      expired: this.isJwtExpired(token)
    };
  }

  private isJwtExpired(token: string | null): boolean {
    if (!this.isValidJwt(token)) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      return typeof exp === 'number' && Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private async redirectToInviteSignupOnHomepage(token: string): Promise<void> {
    this.statusMessage = 'Redirecting to authentication...';
    this.statusSubtext = '';
    this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(token)}`);
    this.logInviteClaim('no valid auth token, redirecting to invite signup on homepage');
    const navigated = await this.router.navigate(['/'], {
      queryParams: { invite: '1', token, auth: 'signup' },
      replaceUrl: true
    });
    if (!navigated) {
      this.loading = false;
      this.errorMessage = 'Please sign in to accept this invitation.';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clearTerminalInviteState(token: string): void {
    this.invites.clearPendingInviteToken();
    this.invites.clearClaimAttemptedForToken(token);
    this.invites.clearClaimInProgressForToken(token);
  }

  private logInviteClaim(message: string, details?: Record<string, unknown>): void {
    if (environment.production) {
      return;
    }

    if (details) {
      console.debug(`[InviteClaim] ${message}`, this.maskInviteClaimDetails(details));
      return;
    }

    console.debug(`[InviteClaim] ${message}`);
  }

  private maskInviteClaimDetails(details: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('token') ||
        normalizedKey.includes('userid') ||
        normalizedKey.includes('membershipid') ||
        normalizedKey.includes('businessprofileid') ||
        normalizedKey.includes('departmentid')
      ) {
        safe[key] = value ? '[redacted]' : value;
      } else if (typeof value === 'string' && value.includes('token=')) {
        safe[key] = '[redacted-url]';
      } else {
        safe[key] = value;
      }
    }
    return safe;
  }
}
