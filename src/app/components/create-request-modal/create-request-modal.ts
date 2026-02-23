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
  @Input() requiredStateOptions: readonly RequiredState[] = REQUIRED_STATE_OPTIONS;

  onSubmit(requestedForEmail: string, requiredState: string): void {
    const normalizedState = this.isRequiredState(requiredState) ? requiredState : '';
    this.submitRequest.emit({
      requestedForEmail,
      requiredState: normalizedState
    });
  }

  private isRequiredState(value: string): value is RequiredState {
    return (REQUIRED_STATE_OPTIONS as readonly string[]).includes(value);
  }
}

export type CreateRequestForm = {
  requestedForEmail: string;
  requiredState: RequiredState | '';
};

export type SubmitFeedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export type RequiredState = 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk';

export const REQUIRED_STATE_OPTIONS: readonly RequiredState[] = [
  'Stable',
  'Low Focus',
  'Elevated Fatigue',
  'High Risk'
];
