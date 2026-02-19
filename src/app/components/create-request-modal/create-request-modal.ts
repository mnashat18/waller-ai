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
  @Input() requestedByDefault = '';
  @Input() businessTrialNotice = '';
  @Input() businessInviteTrialNotice = '';

  onSubmit(
    requestedBy: string,
    requestedFor: string,
    requiredState: string,
    notes: string,
    inviteChannel: string
  ): void {
    this.submitRequest.emit({
      requestedBy,
      requestedFor,
      requiredState,
      notes,
      inviteChannel
    });
  }
}

export type CreateRequestForm = {
  requestedBy: string;
  requestedFor: string;
  requiredState: string;
  notes: string;
  inviteChannel: string;
};

export type SubmitFeedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};
