import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { environment } from '../../../environments/environment';

type AccountDeletionResponse = {
  accepted: boolean;
  message: string;
};

@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './delete-account.html',
  styleUrl: './delete-account.css'
})
export class DeleteAccountComponent {
  readonly endpoint = `${environment.API_URL}/wellar/account-deletion-requests`;
  readonly successFallback =
    'Your account deletion request has been received. If the account information matches our records, the Wellar team will process the request and contact you if additional verification is required.';
  readonly failureMessage =
    'We could not submit your account deletion request right now. Please try again later.';

  isSubmitting = false;
  successText = '';
  errorText = '';
  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      reason: ['', [Validators.maxLength(1000)]],
      confirmed: [false, [Validators.requiredTrue]]
    });
  }

  get emailControl() {
    return this.form.controls.email;
  }

  get reasonControl() {
    return this.form.controls.reason;
  }

  get confirmedControl() {
    return this.form.controls.confirmed;
  }

  get reasonLength(): number {
    return (this.reasonControl.value ?? '').trim().length;
  }

  submit(): void {
    this.successText = '';
    this.errorText = '';
    this.form.markAllAsTouched();

    if (this.form.invalid || this.isSubmitting) {
      return;
    }

    const email = this.normalizeEmail(this.emailControl.value);
    const reason = this.normalizeReason(this.reasonControl.value);
    if (!email) {
      this.errorText = this.failureMessage;
      return;
    }

    this.isSubmitting = true;
    this.http
      .post<AccountDeletionResponse>(this.endpoint, {
        email,
        reason,
        confirmed: true
      })
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (response) => {
          if (response?.accepted) {
            this.successText = response.message?.trim() || this.successFallback;
            this.form.patchValue({ reason: '' });
            this.form.get('confirmed')?.setValue(false);
            return;
          }

          this.errorText = this.failureMessage;
        },
        error: () => {
          this.errorText = this.failureMessage;
        }
      });
  }

  private normalizeEmail(value: unknown): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized || normalized.length > 254) {
      return '';
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  private normalizeReason(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return undefined;
    }

    return normalized.length > 1000 ? normalized.slice(0, 1000) : normalized;
  }
}
