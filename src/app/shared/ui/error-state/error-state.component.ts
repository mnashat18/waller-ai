import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-3xl border border-red-200 bg-red-50 px-6 py-8 shadow-sm">
      <p class="text-sm font-semibold text-red-700">{{ title }}</p>
      <p class="mt-2 text-sm text-red-600">{{ message }}</p>
      <button
        *ngIf="showRetry"
        type="button"
        (click)="retry.emit()"
        class="mt-4 inline-flex items-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white">
        Retry
      </button>
    </div>
  `
})
export class ErrorStateComponent {
  @Input() title = 'Something went wrong';
  @Input() message = 'The requested dashboard state could not be loaded.';
  @Input() showRetry = true;
  @Output() retry = new EventEmitter<void>();
}
