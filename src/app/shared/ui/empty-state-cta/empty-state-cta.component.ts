import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state-cta',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="app-empty-state-cta rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
      <p class="text-lg font-semibold tracking-tight text-slate-950">{{ title }}</p>
      <p class="mx-auto mt-2 max-w-2xl text-sm text-slate-500">{{ message }}</p>

      <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
        <a
          *ngIf="ctaLabel && ctaRoute"
          [routerLink]="ctaRoute"
          class="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {{ ctaLabel }}
        </a>

        <a
          *ngIf="secondaryLabel && secondaryRoute"
          [routerLink]="secondaryRoute"
          class="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          {{ secondaryLabel }}
        </a>
      </div>
    </div>
  `
})
export class EmptyStateCtaComponent {
  @Input() title = 'Nothing to show';
  @Input() message = 'There is no data available yet.';
  @Input() ctaLabel = '';
  @Input() ctaRoute = '';
  @Input() secondaryLabel = '';
  @Input() secondaryRoute = '';
}
