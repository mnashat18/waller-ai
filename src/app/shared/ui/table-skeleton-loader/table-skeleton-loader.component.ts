import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-table-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-table-shell rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-100 px-5 py-4">
        <div class="h-4 w-40 rounded-full bg-slate-200"></div>
      </div>

      <div class="px-5 py-4">
        <div *ngFor="let row of rowItems()" class="grid gap-4 border-b border-slate-100 py-4 last:border-b-0 md:grid-cols-4">
          <div *ngFor="let col of columnItems()" class="h-4 rounded-full bg-slate-100"></div>
        </div>
      </div>
    </div>
  `
})
export class TableSkeletonLoaderComponent {
  @Input() rows = 4;
  @Input() columns = 4;

  rowItems(): number[] {
    return Array.from({ length: Math.max(1, this.rows) }, (_, index) => index);
  }

  columnItems(): number[] {
    return Array.from({ length: Math.max(1, this.columns) }, (_, index) => index);
  }
}
