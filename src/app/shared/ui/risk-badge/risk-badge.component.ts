import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-risk-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="app-risk-badge" [ngClass]="badgeClass()">
      {{ label() }}
    </span>
  `
})
export class RiskBadgeComponent {
  @Input() risk: string | null = null;

  label(): string {
    const normalized = this.normalize();
    if (normalized === 'stable') return 'Stable';
    if (normalized === 'low_focus' || normalized === 'low focus') return 'Low Focus';
    if (normalized === 'fatigue' || normalized === 'elevated fatigue') return 'Elevated Fatigue';
    if (normalized === 'high_risk' || normalized === 'high risk') return 'High Risk';
    return this.risk?.trim() || 'Unknown';
  }

  badgeClass(): string {
    const normalized = this.normalize();
    if (normalized === 'stable') return 'risk-stable';
    if (normalized === 'low_focus' || normalized === 'low focus') return 'risk-low';
    if (normalized === 'fatigue' || normalized === 'elevated fatigue') return 'risk-fatigue';
    if (normalized === 'high_risk' || normalized === 'high risk') return 'risk-high';
    return 'risk-neutral';
  }

  private normalize(): string {
    return (this.risk ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
