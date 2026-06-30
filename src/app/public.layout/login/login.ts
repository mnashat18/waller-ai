import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostAuthWelcomeService } from '../../services/post-auth-welcome.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterModule],
  standalone: true,
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  loading = false;
  inviteMode = false;
  authNotice = '';

  private pendingInviteToken: string | null = null;

  constructor(
    private auth: AuthService,
    private invites: InviteService,
    private route: ActivatedRoute,
    private router: Router,
    private postLoginRouting: PostLoginRoutingService,
    private companyContext: CompanyContextService,
    private postAuthWelcome: PostAuthWelcomeService
  ) {
    this.syncInviteContext();
    this.authNotice = this.auth.consumeAuthNotice() ?? '';
  }

  ngOnInit(): void {
    void this.handleInviteEntryRoute();
  }

  private async handleInviteEntryRoute(): Promise<void> {
    this.syncInviteContext();
    const inviteFromQuery = this.hasInviteQueryParams();
    const inviteToken = this.pendingInviteToken ?? this.invites.getPendingInviteToken();
    if (inviteFromQuery && inviteToken && !this.auth.isLoggedIn()) {
      await this.router.navigate(['/'], {
        queryParams: { invite: '1', token: inviteToken, auth: 'signup' },
        replaceUrl: true
      });
      return;
    }

    if (inviteToken && this.auth.isLoggedIn()) {
      await this.router.navigate(['/invites/claim'], {
        queryParams: { token: inviteToken },
        replaceUrl: true
      });
    }
  }

  login() {
    if (!this.email || !this.password) {
      return;
    }

    this.syncInviteContext();
    this.loading = true;

    this.auth.login(this.email, this.password).subscribe({
      next: async () => {
        this.loading = false;
        try {
          this.invites.debugFlow('auth success');
          const inviteToken = this.pendingInviteToken ?? this.invites.getPendingInviteToken();
          if (inviteToken) {
            await this.router.navigate(['/invites/claim'], {
              queryParams: { token: inviteToken },
              replaceUrl: true
            });
            return;
          }
          const nextRoute = await this.postLoginRouting.resolveDestination();
          const shouldShowWelcome = this.queueWelcomeIfReady(nextRoute);
          if (shouldShowWelcome) {
            await this.router.navigateByUrl('/app/welcome', { replaceUrl: true });
            return;
          }
          await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
        } catch {
          this.authNotice = 'Unable to continue after login. Please try again.';
        }
      },
      error: (err) => {
        this.loading = false;

        if (err?.status === 401) {
          alert('Please verify your email before logging in.');
          return;
        }

        alert('Login failed');
      }
    });
  }

  continueWithGoogle() {
    this.syncInviteContext();
    if (this.pendingInviteToken) {
      this.invites.setPendingInviteToken(this.pendingInviteToken);
      this.auth.setPostAuthRedirect(
        `/invites/claim?token=${encodeURIComponent(this.pendingInviteToken)}`
      );
    }
    this.auth.loginWithGoogle();
  }

  private syncInviteContext(): void {
    const queryToken = this.readInviteTokenFromQuery();
    if (queryToken) {
      this.pendingInviteToken = queryToken;
      this.invites.setPendingInviteToken(queryToken);
    } else {
      this.pendingInviteToken = this.invites.getPendingInviteToken();
    }

    if (this.pendingInviteToken) {
      this.auth.setPostAuthRedirect(
        `/invites/claim?token=${encodeURIComponent(this.pendingInviteToken)}`
      );
    }

    const inviteFlag = this.route.snapshot.queryParamMap.get('invite') === '1';
    this.inviteMode = inviteFlag || Boolean(this.pendingInviteToken);
  }

  private readInviteTokenFromQuery(): string | null {
    const tokenParam =
      this.route.snapshot.queryParamMap.get('token') ??
      this.route.snapshot.queryParamMap.get('code');
    const inviteParam = this.route.snapshot.queryParamMap.get('invite');
    const inviteToken = inviteParam && inviteParam !== '1' ? inviteParam : null;
    const normalized = (tokenParam ?? inviteToken ?? '').trim();
    return normalized || null;
  }

  private hasInviteQueryParams(): boolean {
    const query = this.route.snapshot.queryParamMap;
    return (
      query.has('invite') ||
      query.has('token') ||
      query.has('code')
    );
  }

  private queueWelcomeIfReady(nextRoute: string): boolean {
    const normalized = nextRoute.trim().toLowerCase();
    if (
      !normalized ||
      normalized.startsWith('/app/workspace-access') ||
      normalized.startsWith('/app/workspace-restricted') ||
      normalized.startsWith('/app/welcome')
    ) {
      return false;
    }

    if (!normalized.startsWith('/app/') && !normalized.startsWith('/employee-web-access')) {
      return false;
    }

    const context = this.companyContext.snapshot().context;
    if (!context.activeBusinessProfileId || !context.activeMemberRole) {
      return false;
    }

    const firstName = String(context.currentUser?.first_name ?? context.userDisplayName ?? '').trim().split(/\s+/u)[0] || 'there';
    this.postAuthWelcome.queueReturningWelcome(firstName, nextRoute);
    return true;
  }
}
