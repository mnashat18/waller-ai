import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, of, timeout } from 'rxjs';

import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css'
})
export class ResetPasswordComponent {
  private readonly authTimeoutMs = 20000;
  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;

  readonly requestSuccessMessage = 'If an account exists for this email, you’ll receive a reset link shortly.';
  readonly invalidTokenMessage = 'This reset link is invalid or has expired. Request a new link.';

  email = '';
  password = '';
  confirmPassword = '';
  feedback = '';
  submitting = false;
  requestSent = false;

  emailTouched = false;
  passwordTouched = false;
  confirmPasswordTouched = false;
  submitAttempted = false;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get token(): string | null {
    const value = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
    return value || null;
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  get emailError(): string | null {
    const normalized = this.email.trim();
    if (!normalized) {
      return 'Email address is required.';
    }

    return this.emailPattern.test(normalized) ? null : 'Enter a valid email address.';
  }

  get passwordError(): string | null {
    if (!this.password) {
      return 'Password is required.';
    }

    return this.passwordPattern.test(this.password)
      ? null
      : 'Password must be 10 to 128 characters and include at least one letter and one number.';
  }

  get confirmPasswordError(): string | null {
    if (!this.confirmPassword) {
      return 'Confirm your password.';
    }

    return this.password === this.confirmPassword ? null : 'Passwords do not match.';
  }

  get requestFormValid(): boolean {
    return this.emailError === null;
  }

  get resetFormValid(): boolean {
    return Boolean(this.token) && this.passwordError === null && this.confirmPasswordError === null;
  }

  get showEmailError(): boolean {
    return (this.emailTouched || this.submitAttempted) && this.emailError !== null;
  }

  get showPasswordError(): boolean {
    return (this.passwordTouched || this.submitAttempted) && this.passwordError !== null;
  }

  get showConfirmPasswordError(): boolean {
    return (this.confirmPasswordTouched || this.submitAttempted) && this.confirmPasswordError !== null;
  }

  submitRequest(): void {
    this.submitAttempted = true;
    this.emailTouched = true;
    this.feedback = '';

    if (!this.requestFormValid) {
      this.focusFirstInvalidRequestField();
      return;
    }

    this.submitting = true;
    this.requestSent = false;

    this.auth.requestPasswordReset(this.email.trim()).pipe(
      timeout(this.authTimeoutMs),
      catchError((error) => {
        if (this.isEnumerationSafeRequestError(error)) {
          return of(null);
        }

        this.feedback = 'Unable to send a reset link right now. Please try again.';
        return of('__request_failed__');
      })
    ).subscribe((result) => {
      this.submitting = false;

      if (result === '__request_failed__') {
        return;
      }

      this.requestSent = true;
      this.feedback = this.requestSuccessMessage;
    });
  }

  submitReset(): void {
    this.submitAttempted = true;
    this.passwordTouched = true;
    this.confirmPasswordTouched = true;
    this.feedback = '';

    if (!this.resetFormValid) {
      this.focusFirstInvalidResetField();
      return;
    }

    const token = this.token;
    if (!token) {
      this.feedback = this.invalidTokenMessage;
      return;
    }

    this.submitting = true;

    this.auth.resetPassword(token, this.password).pipe(
      timeout(this.authTimeoutMs),
      catchError(() => {
        this.submitting = false;
        this.feedback = this.invalidTokenMessage;
        return of('__reset_failed__');
      })
    ).subscribe(async (result) => {
      this.submitting = false;

      if (result === '__reset_failed__') {
        return;
      }

      this.password = '';
      this.confirmPassword = '';
      this.submitAttempted = false;
      this.passwordTouched = false;
      this.confirmPasswordTouched = false;
      this.auth.setAuthNotice('Password updated. Sign in with your new password.');
      await this.router.navigate(['/'], {
        queryParams: { auth: 'login' },
        replaceUrl: true
      });
    });
  }

  async startOver(): Promise<void> {
    this.password = '';
    this.confirmPassword = '';
    this.feedback = '';
    this.submitAttempted = false;
    this.passwordTouched = false;
    this.confirmPasswordTouched = false;
    await this.router.navigate(['/reset-password'], { replaceUrl: true });
  }

  private isEnumerationSafeRequestError(error: any): boolean {
    const status = typeof error?.status === 'number' ? error.status : 0;
    const message = (
      error?.error?.errors?.[0]?.extensions?.reason ||
      error?.error?.errors?.[0]?.message ||
      error?.error?.message ||
      error?.message ||
      ''
    ).toString().toLowerCase();

    if (status === 404) {
      return true;
    }

    return (status === 400 || status === 403) && (
      message.includes('not found') ||
      message.includes('no user') ||
      message.includes('no account') ||
      message.includes('user') && message.includes('found')
    );
  }

  private focusFirstInvalidRequestField(): void {
    if (typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      const input = document.querySelector('input[name="resetEmail"]') as HTMLInputElement | null;
      input?.focus();
    }, 0);
  }

  private focusFirstInvalidResetField(): void {
    if (typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      if (this.passwordError !== null) {
        (document.querySelector('input[name="newPassword"]') as HTMLInputElement | null)?.focus();
        return;
      }

      if (this.confirmPasswordError !== null) {
        (document.querySelector('input[name="confirmPassword"]') as HTMLInputElement | null)?.focus();
      }
    }, 0);
  }
}
