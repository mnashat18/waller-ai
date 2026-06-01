import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import { type ActiveMemberRole } from '../../../ia/wellar-ia';

@Component({
  selector: 'app-role-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]"
      [ngClass]="badgeClass()">
      {{ badgeLabel() }}
    </span>
  `
})
export class RoleBadgeComponent {
  @Input() role: ActiveMemberRole | string | null = null;

  private normalizedRole(): ActiveMemberRole | null {
    const normalized = (this.role ?? '').toString().trim().toLowerCase();
    if (normalized === 'owner') return 'owner';
    if (normalized === 'hr' || normalized === 'admin') return 'hr';
    if (normalized === 'manager' || normalized === 'manger') return 'manager';
    if (normalized === 'employee' || normalized === 'member') return 'employee';
    return null;
  }

  badgeLabel(): string {
    const normalized = this.normalizedRole();
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee') return 'Employee';
    return 'No Role';
  }

  badgeClass(): string {
    const normalized = this.normalizedRole();
    if (normalized === 'owner') return 'border-slate-900 bg-slate-900 text-white';
    if (normalized === 'hr') return 'border-sky-200 bg-sky-50 text-sky-700';
    if (normalized === 'manager') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (normalized === 'employee') return 'border-slate-200 bg-slate-50 text-slate-600';
    return 'border-slate-200 bg-white text-slate-500';
  }
}
