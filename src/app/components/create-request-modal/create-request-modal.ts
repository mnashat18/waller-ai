import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-create-request-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './create-request-modal.html'
})
export class CreateRequestModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<CreateRequestForm>();
  @Input() feedback: SubmitFeedback | null = null;
  @Input() submitting = false;
  @Input() businessTrialNotice = '';
  @Input() businessInviteTrialNotice = '';

  onSubmit(requestedFor: string): void {
    this.submitRequest.emit({
      target: 'scan',
      requestedFor
    });
  }
}

export type CreateRequestForm = {
  target: RequestTarget;
  requestedFor: string;
};

export type SubmitFeedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export type RequestTarget = 'scan';
