import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-filter-bar-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="app-dashboard-panel app-dashboard-panel--compact min-w-0 max-w-full box-border"
      [style.overflow]="overflowVisible ? 'visible' : null">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class FilterBarShellComponent {
  @Input() overflowVisible = false;
}
