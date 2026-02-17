import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { timeout } from 'rxjs';
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

    // Step 1: force refresh from cookie
    this.auth.refreshFromCookie()
      .pipe(timeout(15000))
      .subscribe({
        next: () => {

          // Step 2: now check current user
          this.auth.getCurrentUser()
            .pipe(timeout(15000))
            .subscribe({
              next: (user) => {
                if (user) {
                  this.router.navigate(['/dashboard']);
                  return;
                }
                this.fail('Unable to verify login session.');
              },
              error: () => {
                this.fail('Unable to verify login session.');
              }
            });

        },
        error: () => {
          this.fail('Unable to refresh session.');
        }
      });
  }

  private fail(msg: string) {
    this.status = 'error';
    this.message = msg;
  }
}
