import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-invite-claim-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="claim-shell">
      <div class="claim-shell__panel app-dashboard-panel">
        <p class="claim-shell__eyebrow">Workspace Access</p>
        <h1>Accept Invite</h1>

        <p class="claim-shell__note" *ngIf="loading">{{ statusMessage }}</p>
        <p class="claim-shell__note" *ngIf="loading && statusSubtext">{{ statusSubtext }}</p>
        <p class="claim-shell__success" *ngIf="!loading && successMessage">{{ successMessage }}</p>
        <p class="claim-shell__error" *ngIf="!loading && errorMessage">{{ errorMessage }}</p>

        <div class="claim-shell__actions" *ngIf="!loading">
          <a [routerLink]="['/signup']" [queryParams]="signupQueryParams" class="claim-shell__button">
            Create Account
          </a>
          <a [routerLink]="['/login']" [queryParams]="loginQueryParams" class="claim-shell__button">
            Log In
          </a>
          <a routerLink="/app/workspace-access" class="claim-shell__button">
            Go to Workspace Access
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
  loading = true;
  statusMessage = 'Checking your session...';
  statusSubtext = '';
  successMessage = '';
  errorMessage = '';
  authLoading = true;
  authResolved = false;
  currentUser: Record<string, unknown> | null = null;
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

  private async startClaimFlow(): Promise<void> {
    this.logInviteClaim('route loaded');

    const token = this.resolveInviteTokenFromRoute();
    if (!token) {
      this.loading = false;
      this.errorMessage = 'Invite token is missing.';
      return;
    }

    this.logInviteClaim(`token: ${token}`);
    this.invites.setPendingInviteToken(token);
    this.logInviteClaim('saved pending_invite_token');
    this.signupQueryParams = { invite: '1', token, auth: 'signup' };
    this.loginQueryParams = { invite: '1', token, auth: 'login' };

    this.logInviteClaim('checking auth token');
    const accessToken = this.resolveAccessToken();
    const hasValidAuthToken = this.isValidJwt(accessToken);
    this.logInviteClaim(`hasValidAuthToken: ${hasValidAuthToken}`);

    if (!hasValidAuthToken) {
      await this.redirectToInviteSignupOnHomepage(token);
      return;
    }

    const authState = await this.resolveAuthStateWithTimeout();
    if (authState !== 'authenticated') {
      await this.redirectToInviteSignupOnHomepage(token);
      return;
    }

    try {
      this.logInviteClaim('valid auth token found, accepting invite');
      this.statusMessage = 'Accepting invite...';
      this.statusSubtext = 'We are connecting your account to the workspace.';
      const nextRoute = await this.postLoginRouting.resolveDestination();
      if (nextRoute.startsWith('/invites/claim')) {
        this.loading = false;
        this.statusSubtext = '';
        const storedError = this.invites.consumeInviteClaimError();
        this.errorMessage = storedError
          ? this.invites.formatInviteClaimError(storedError)
          : 'Could not accept invite. Please verify the invite link and account.';
        return;
      }
      await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
    } catch (error) {
      this.loading = false;
      this.statusSubtext = '';
      const storedError = this.invites.consumeInviteClaimError();
      this.errorMessage = storedError
        ? this.invites.formatInviteClaimError(storedError)
        : this.invites.formatInviteClaimError(this.invites.getReadableInviteError(error));
    }
  }

  private async resolveAuthStateWithTimeout(timeoutMs = 1500): Promise<'authenticated' | 'unauthenticated'> {
    this.authLoading = true;
    this.authResolved = false;
    this.currentUser = null;

    try {
      const resolved = await Promise.race<'authenticated' | 'unauthenticated'>([
        this.auth.getCurrentUserAfterRestore().then((user) => {
          if (user?.id) {
            this.currentUser = user as Record<string, unknown>;
            return 'authenticated';
          }
          return 'unauthenticated';
        }).catch(() => 'unauthenticated'),
        this.sleep(timeoutMs).then(() => 'unauthenticated')
      ]);

      this.authLoading = false;
      this.authResolved = true;
      return resolved;
    } catch {
      this.authLoading = false;
      this.authResolved = true;
      return 'unauthenticated';
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
      this.errorMessage = 'Please sign in to accept this invite.';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logInviteClaim(message: string, details?: Record<string, unknown>): void {
    if (environment.production) {
      return;
    }

    if (details) {
      console.debug(`[InviteClaim] ${message}`, details);
      return;
    }

    console.debug(`[InviteClaim] ${message}`);
  }
}
