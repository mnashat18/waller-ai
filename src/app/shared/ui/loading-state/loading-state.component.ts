import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
      <div class="flex items-center gap-3">
        <span class="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"></span>
        <div>
          <p class="text-sm font-semibold text-slate-900">{{ title }}</p>
          <p class="text-sm text-slate-500">{{ description }}</p>
        </div>
      </div>
    </div>
  `
})
export class LoadingStateComponent {
  @Input() title = 'Loading';
  @Input() description = 'Please wait while the organization context loads.';
}
