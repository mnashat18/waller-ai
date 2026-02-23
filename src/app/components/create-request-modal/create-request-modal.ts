import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-create-request-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-request-modal.html'
})
export class CreateRequestModalComponent implements OnChanges {
  @Output() close = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<CreateRequestForm>();
  @Input() feedback: SubmitFeedback | null = null;
  @Input() submitting = false;
  @Input() businessTrialNotice = '';
  @Input() businessInviteTrialNotice = '';
  @Input() maxRecipients = 5;
  @Input() allowRoleSelection = false;
  @Input() memberRoleOptions: readonly TeamMemberRoleOption[] = DEFAULT_MEMBER_ROLE_OPTIONS;
  @Input() defaultMemberRole: TeamMemberRole = 'member';
  @Input() requiredStateOptions: readonly RequiredState[] = REQUIRED_STATE_OPTIONS;

  form: ModalFormModel = this.buildDefaultFormModel();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultMemberRole']) {
      this.form.memberRole = this.normalizeTeamMemberRole(this.defaultMemberRole);
    }

    if (changes['maxRecipients']) {
      const allowed = this.safeMaxRecipients();
      if (this.form.requestedForEmails.length > allowed) {
        this.form.requestedForEmails = this.form.requestedForEmails.slice(0, allowed);
      }
    }
  }

  onSubmit(): void {
    const normalizedState = this.isRequiredState(this.form.requiredState)
      ? this.form.requiredState
      : '';

    this.submitRequest.emit({
      requestedForEmails: [...this.form.requestedForEmails],
      requiredState: normalizedState,
      memberRole: this.normalizeTeamMemberRole(this.form.memberRole)
    });
  }

  addRecipientField(): void {
    const rows = this.form.requestedForEmails;
    if (rows.length >= this.safeMaxRecipients()) {
      return;
    }

    if (!rows.length || rows[rows.length - 1].trim()) {
      this.form.requestedForEmails = [...rows, ''];
    }
  }

  removeRecipientField(index: number): void {
    if (this.form.requestedForEmails.length <= 1) {
      this.form.requestedForEmails = [''];
      return;
    }

    this.form.requestedForEmails = this.form.requestedForEmails.filter((_, i) => i !== index);
  }

  canAddRecipientField(): boolean {
    return this.form.requestedForEmails.length < this.safeMaxRecipients();
  }

  recipientCountLabel(): string {
    const count = this.form.requestedForEmails.filter((email) => email.trim().length > 0).length;
    return `${count}/${this.safeMaxRecipients()}`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByRoleValue(index: number, item: TeamMemberRoleOption): string {
    return item?.value ?? String(index);
  }

  private isRequiredState(value: string): value is RequiredState {
    return (REQUIRED_STATE_OPTIONS as readonly string[]).includes(value);
  }

  private buildDefaultFormModel(): ModalFormModel {
    return {
      requestedForEmails: [''],
      requiredState: '',
      memberRole: this.normalizeTeamMemberRole(this.defaultMemberRole)
    };
  }

  private normalizeTeamMemberRole(value: unknown): TeamMemberRole {
    const normalized = (value ?? '').toString().trim().toLowerCase();
    if (
      normalized === 'owner' ||
      normalized === 'admin' ||
      normalized === 'manager' ||
      normalized === 'member'
    ) {
      return normalized;
    }
    return 'member';
  }

  private safeMaxRecipients(): number {
    const max = Math.floor(Number(this.maxRecipients));
    if (!Number.isFinite(max) || max < 1) {
      return 1;
    }
    return Math.min(10, max);
  }
}

export type CreateRequestForm = {
  requestedForEmails: string[];
  requiredState: RequiredState | '';
  memberRole: TeamMemberRole;
};

export type SubmitFeedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

export type RequiredState = 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk';
export type TeamMemberRole = 'owner' | 'admin' | 'manager' | 'member';
export type TeamMemberRoleOption = {
  value: TeamMemberRole;
  label: string;
};

export const REQUIRED_STATE_OPTIONS: readonly RequiredState[] = [
  'Stable',
  'Low Focus',
  'Elevated Fatigue',
  'High Risk'
];

export const DEFAULT_MEMBER_ROLE_OPTIONS: readonly TeamMemberRoleOption[] = [
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' }
];

type ModalFormModel = {
  requestedForEmails: string[];
  requiredState: string;
  memberRole: TeamMemberRole;
};
