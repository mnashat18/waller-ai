import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, take, timeout } from 'rxjs';
import { AuthService } from '../services/auth';
import { InviteService } from '../services/invites';
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
        description="Please wait while we restore your workspace session."
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

  constructor(
    private router: Router,
    private auth: AuthService,
    private invites: InviteService,
    private postLoginRouting: PostLoginRoutingService
  ) {}

  ngOnInit(): void {
    this.auth.captureAuthFromUrl();

    const storedToken = this.auth.getStoredAccessToken?.() ?? null;
    const start$ = storedToken
      ? of(storedToken)
      : this.refreshAccessTokenFromCookie();

    start$
      .pipe(
        timeout(15000),
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
        timeout(15000),
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
              await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
            } catch (error) {
              this.fail((error as { message?: string })?.message || 'Unable to continue after login.');
            }
            return;
          }

          const backendError = localStorage.getItem('auth_error');
          this.fail(backendError || 'Unable to verify login session.');
        },
        error: (err) => {
          this.fail(err?.message || 'Authentication failed. Please try again.');
        }
      });
  }

  private refreshAccessTokenFromCookie() {
    return this.auth.refreshFromCookie().pipe(
      map((token) => token ?? null),
      catchError(() => of(null))
    );
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
