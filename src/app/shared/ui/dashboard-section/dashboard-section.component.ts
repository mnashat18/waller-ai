import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="app-dashboard-section" [ngClass]="toneClass()">
      <div class="app-dashboard-section__header">
        <div class="app-dashboard-section__titles">
          <p *ngIf="eyebrow" class="dashboard-eyebrow">{{ eyebrow }}</p>
          <h2 class="dashboard-section-title">{{ title }}</h2>
          <p *ngIf="description" class="dashboard-section-description">{{ description }}</p>
        </div>

        <div class="app-dashboard-section__actions">
          <ng-content select="[sectionActions]"></ng-content>
        </div>
      </div>

      <div class="app-dashboard-section__body">
        <ng-content></ng-content>
      </div>
    </section>
  `
})
export class DashboardSectionComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
  @Input() tone: 'neutral' | 'blue' | 'amber' | 'violet' | 'emerald' | 'rose' | 'cyan' = 'neutral';

  toneClass(): string {
    return `app-dashboard-section--${this.tone}`;
  }
}
