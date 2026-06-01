import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="app-status-badge" [ngClass]="badgeClass()">
      {{ label() }}
    </span>
  `
})
export class StatusBadgeComponent {
  @Input() status: string | null = null;

  label(): string {
    const normalized = (this.status ?? '').trim().toLowerCase();

    if (normalized === 'active') return 'Active';
    if (normalized === 'invited') return 'Invited';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr' || normalized === 'admin') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee' || normalized === 'member') return 'Employee';
    return this.status?.trim() || 'Unknown';
  }

  badgeClass(): string {
    const normalized = (this.status ?? '').trim().toLowerCase();

    if (
      normalized.includes('active') ||
      normalized.includes('approved') ||
      normalized.includes('read') ||
      normalized.includes('sent')
    ) {
      return 'status-success';
    }

    if (
      normalized.includes('pending') ||
      normalized.includes('queued') ||
      normalized.includes('new') ||
      normalized.includes('unread')
    ) {
      return 'status-warning';
    }

    if (
      normalized.includes('denied') ||
      normalized.includes('closed') ||
      normalized.includes('dismissed') ||
      normalized.includes('resolved') ||
      normalized.includes('failed')
    ) {
      return 'status-neutral';
    }

    return 'status-info';
  }
}
