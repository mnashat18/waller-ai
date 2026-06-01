import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="app-kpi-card">
      <div class="kpi-card-accent" [ngClass]="toneClass()"></div>

      <div class="kpi-card-head">
        <div class="kpi-card-copy">
          <p class="kpi-label">{{ label }}</p>
          <p class="kpi-value">{{ value }}</p>
          <p *ngIf="helper" class="kpi-helper">{{ helper }}</p>
        </div>

        <span
          *ngIf="toneLabel && showToneLabel"
          class="kpi-tone-badge"
          [ngClass]="toneClass()">
          {{ toneLabel }}
        </span>
      </div>

      <div *ngIf="footer" class="kpi-footer">
        {{ footer }}
      </div>
    </article>
  `
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value = '0';
  @Input() helper = '';
  @Input() footer = '';
  @Input() tone: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral';
  @Input() toneLabel = '';
  @Input() showToneLabel = true;

  toneClass(): string {
    if (this.tone === 'success') {
      return 'tone-success';
    }
    if (this.tone === 'warning') {
      return 'tone-warning';
    }
    if (this.tone === 'danger') {
      return 'tone-danger';
    }
    return 'tone-neutral';
  }
}
