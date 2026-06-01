import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-company-context-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-context-chip">
      <p class="chip-label">{{ label }}</p>
      <p class="chip-value">{{ value || fallback }}</p>
      <p *ngIf="detail" class="chip-detail">{{ detail }}</p>
    </div>
  `
})
export class CompanyContextChipComponent {
  @Input() label = 'Context';
  @Input() value: string | null = null;
  @Input() detail: string | null = null;
  @Input() fallback = 'Not set';
}
