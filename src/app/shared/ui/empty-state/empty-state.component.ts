import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p class="text-sm font-semibold text-slate-900">{{ title }}</p>
      <p class="mx-auto mt-2 max-w-2xl text-sm text-slate-500">{{ message }}</p>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() title = 'Nothing to show';
  @Input() message = 'This area has not been configured yet.';
}
