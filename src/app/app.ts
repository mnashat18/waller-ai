import { Component, OnDestroy, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('wellar-ui');

  constructor(
    private auth: AuthService,
    private router: Router
  ) {
    if (typeof window !== 'undefined') {
      const theme = window.localStorage.getItem('theme');
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        root.classList.add('dark');
        root.classList.remove('light');
      }

      this.captureInviteContextFromPath();

      const isAuthCallback = window.location.pathname === '/auth-callback';
      if (!isAuthCallback) {
        this.auth.captureAuthFromUrl();
        const callbackPending = sessionStorage.getItem('auth_callback_pending') === '1';

        if (callbackPending) {
          this.auth.ensureSessionToken().subscribe();
        }
      }
    }
  }

  private captureInviteContextFromPath(): void {
    const pathname = window.location.pathname ?? '';
    const match = pathname.match(/^\/invite\/([^/?#]+)/i);
    if (!match?.[1]) {
      return;
    }

    const inviteToken = decodeURIComponent(match[1]).trim();
    if (!inviteToken) {
      return;
    }

    try {
      window.sessionStorage.setItem('pending_invite_token', inviteToken);
      window.localStorage.removeItem('pending_invite_token');
    } catch {
      // ignore storage errors
    }

    this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(inviteToken)}`);

    const next = this.auth.isLoggedIn()
      ? `/invites/claim?token=${encodeURIComponent(inviteToken)}`
      : `/?invite=1&token=${encodeURIComponent(inviteToken)}&auth=signup`;

    const current = window.location.pathname + window.location.search;
    if (current !== next) {
      this.router.navigateByUrl(next, { replaceUrl: true });
    }
  }

  ngOnDestroy() {
  }

}
