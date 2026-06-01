import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-page-action-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-dashboard-panel">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <ng-content select="[actionBarMeta]"></ng-content>
        <div class="flex flex-wrap items-center gap-3">
          <ng-content select="[actionBarActions]"></ng-content>
        </div>
      </div>
    </div>
  `
})
export class PageActionBarComponent {}
