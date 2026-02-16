import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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
    const result = this.auth.captureAuthFromUrl();
    if (result.stored) {
      this.router.navigate(['/dashboard']);
      return;
    }

    if (result.reason || result.errorDescription) {
      const detail = result.errorDescription || result.reason || 'Login failed.';
      this.status = 'error';
      this.message = `Login failed: ${detail}`;
      try {
        localStorage.setItem('auth_error', detail);
      } catch {
        // ignore storage errors
      }
    }

    this.auth.refreshSession().subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.router.navigate(['/dashboard']);
      }
    });
  }
}
