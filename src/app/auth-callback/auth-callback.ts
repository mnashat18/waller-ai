import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, take, timeout } from 'rxjs';
import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from '../services/auth';
import { InviteService } from '../services/invites';
import { PostAuthWelcomeService } from '../services/post-auth-welcome.service';
import { PostLoginRoutingService } from '../services/post-login-routing.service';
import { LoadingStateComponent } from '../shared/ui/loading-state/loading-state.component';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule, LoadingStateComponent],
  template: `
    <div class="auth-callback-shell">
      <app-loading-state
        *ngIf="status === 'loading'"
        title="Signing you in..."
        description="Please wait while we restore your organization session."
      />

      <div class="auth-callback-error" *ngIf="status === 'error'">
        <p>{{ message }}</p>
      </div>
    </div>
  `,
  styles: `
    .auth-callback-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1.25rem;
    }

    .auth-callback-error {
      width: min(100%, 40rem);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 1rem;
      background: rgba(127, 29, 29, 0.2);
      color: #fecaca;
      padding: 1rem 1.25rem;
      text-align: center;
    }
  `
})
export class AuthCallbackComponent implements OnInit {
  status: 'loading' | 'error' = 'loading';
  message = '';
  private readonly callbackTimeoutMs = 15000;

  constructor(
    private router: Router,
    private auth: AuthService,
    private invites: InviteService,
    private postLoginRouting: PostLoginRoutingService,
    private companyContext: CompanyContextService,
    private postAuthWelcome: PostAuthWelcomeService
  ) {}

  ngOnInit(): void {
    const capture = this.auth.captureAuthFromUrl();

    if (capture.reason || capture.errorDescription) {
      void this.recoverToLogin(this.auth.getSafeAuthCallbackFailureNotice(capture.reason));
      return;
    }

    const storedToken = capture.accessToken ?? this.auth.getStoredAccessToken?.() ?? null;
    const start$ = storedToken
      ? of(storedToken)
      : this.refreshAccessTokenFromCookie();

    start$
      .pipe(
        timeout(this.callbackTimeoutMs),
        switchMap((token) => {
          if (!token) return of(null);

          if (this.auth.storeAccessToken) {
            this.auth.storeAccessToken(token);
          }

          // Important: hydrate user/org/role/email caches from current token owner.
          return this.auth.getCurrentUser(token).pipe(
            catchError(() => of(null))
          );
        }),
        timeout(this.callbackTimeoutMs),
        take(1)
      )
      .subscribe({
        next: async (user) => {
          if (user) {
            try {
              const inviteToken = this.invites.getPendingInviteToken();
            if (inviteToken) {
              await this.router.navigate(['/invites/claim'], {
                queryParams: { token: inviteToken },
                replaceUrl: true
              });
              return;
            }
            const nextRoute = await this.postLoginRouting.resolveDestination();
            const shouldShowWelcome = this.queueReturningWelcomeIfReady(nextRoute);
            if (shouldShowWelcome) {
              await this.router.navigateByUrl('/app/welcome', { replaceUrl: true });
              return;
            }
            await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
          } catch (error) {
            this.fail((error as { message?: string })?.message || 'Unable to continue after login.');
          }
            return;
          }

          await this.recoverToLogin(this.auth.getSafeAuthCallbackFailureNotice());
        },
        error: (err) => {
          void this.recoverToLogin(this.auth.getSafeAuthCallbackFailureNotice());
        }
      });
  }

  private refreshAccessTokenFromCookie() {
    return this.auth.refreshFromCookie().pipe(
      map((token) => token ?? null),
      catchError(() => of(null))
    );
  }

  private async recoverToLogin(notice: string): Promise<void> {
    this.auth.clearAuthRecoveryState();
    this.auth.setAuthNotice(notice);

    try {
      await this.router.navigateByUrl('/?auth=login', { replaceUrl: true });
    } catch {
      this.fail(notice);
    }
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }

  private queueReturningWelcomeIfReady(nextRoute: string): boolean {
    if (!this.shouldQueueWelcomeForRoute(nextRoute)) {
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

  private shouldQueueWelcomeForRoute(nextRoute: string): boolean {
    const normalized = nextRoute.trim().toLowerCase();
    if (
      !normalized ||
      normalized.startsWith('/app/workspace-access') ||
      normalized.startsWith('/app/workspace-restricted') ||
      normalized.startsWith('/app/welcome')
    ) {
      return false;
    }

    return normalized.startsWith('/app/') || normalized.startsWith('/employee-web-access');
  }
}
