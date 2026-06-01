import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div *ngFor="let item of skeletonItems()" class="app-dashboard-panel rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div class="h-3 w-28 animate-pulse rounded-full bg-slate-200"></div>
        <div class="mt-4 h-9 w-20 animate-pulse rounded-2xl bg-slate-200"></div>
        <div class="mt-4 h-3 w-40 animate-pulse rounded-full bg-slate-100"></div>
      </div>
    </div>
  `
})
export class CardSkeletonLoaderComponent {
  @Input() count = 4;

  skeletonItems(): number[] {
    return Array.from({ length: Math.max(1, this.count) }, (_, index) => index);
  }
}
