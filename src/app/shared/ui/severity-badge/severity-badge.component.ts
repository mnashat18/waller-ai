import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]"
      [ngClass]="badgeClass()">
      {{ label() }}
    </span>
  `
})
export class SeverityBadgeComponent {
  @Input() severity: string | null = null;

  label(): string {
    return this.severity?.trim() || 'Unknown';
  }

  badgeClass(): string {
    const normalized = (this.severity ?? '').trim().toLowerCase();
    if (normalized.includes('critical') || normalized.includes('high')) {
      return 'bg-red-50 text-red-700';
    }
    if (normalized.includes('medium') || normalized.includes('moderate')) {
      return 'bg-amber-50 text-amber-700';
    }
    if (normalized.includes('low') || normalized.includes('stable')) {
      return 'bg-sky-50 text-sky-700';
    }
    return 'bg-slate-100 text-slate-600';
  }
}
