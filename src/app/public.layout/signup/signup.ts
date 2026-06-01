import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css']
})
export class SignupComponent implements OnInit {

  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  inviteMode = false;
  authNotice = '';

  private pendingInviteToken: string | null = null;

  constructor(
    private auth: AuthService,
    private invites: InviteService,
    private route: ActivatedRoute,
    private router: Router,
    private postLoginRouting: PostLoginRoutingService
  ) {
    this.syncInviteContext();
    this.authNotice = this.auth.consumeAuthNotice() ?? '';
  }

  ngOnInit(): void {
    void this.redirectAuthenticatedInviteUser();
  }

  private async redirectAuthenticatedInviteUser(): Promise<void> {
    this.syncInviteContext();
    const inviteToken = this.pendingInviteToken ?? this.invites.getPendingInviteToken();
    if (inviteToken && this.auth.isLoggedIn()) {
      await this.router.navigate(['/invites/claim'], {
        queryParams: { token: inviteToken },
        replaceUrl: true
      });
    }
  }

  get passwordMismatch(): boolean {
    return this.password !== this.confirmPassword;
  }

  signup(form: NgForm) {
    if (form.invalid || this.passwordMismatch) {
      return;
    }

    this.syncInviteContext();
    this.loading = true;
    const normalizedEmail = this.email.trim();

    this.auth.signup({
      email: normalizedEmail,
      password: this.password,
      first_name: this.firstName,
      last_name: this.lastName
    }).pipe(
      switchMap(() => this.auth.login(normalizedEmail, this.password))
    ).subscribe({
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
          await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
        } catch {
          this.authNotice = 'Unable to continue after signup. Please sign in again.';
        }
      },
      error: (err: any) => {
        this.loading = false;
        if (err?.status === 409) {
          alert('This email is already registered.');
          return;
        }
        alert('Signup failed');
        console.error(err);
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
}
