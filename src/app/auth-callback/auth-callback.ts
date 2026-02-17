import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { timeout, switchMap, of } from 'rxjs';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="auth-callback">
      <p *ngIf="status === 'loading'">Logging you in...</p>
      <p *ngIf="status === 'error'">{{ message }}</p>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {

  status: 'loading' | 'error' = 'loading';
  message = '';

  constructor(
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit(): void {

    this.auth.refreshFromCookie()
      .pipe(
        timeout(15000),

        // Step 2: extract access token
        switchMap((res: any) => {

          const accessToken = res?.data?.access_token;

          if (!accessToken) {
            this.fail('No access token returned from refresh.');
            return of(null);
          }

          // Step 3: call /users/me with Bearer token
          return this.auth.getCurrentUser(accessToken);
        }),

        timeout(15000)
      )
      .subscribe({
        next: (user) => {

          if (user) {
            this.router.navigate(['/dashboard']);
          } else {
            this.fail('Unable to verify login session.');
          }

        },
        error: (err) => {
          this.fail(
            err?.message ||
            'Authentication failed. Please try again.'
          );
        }
      });
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
