import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-table-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="app-table-shell overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <ng-content select="[tableHeader]"></ng-content>
      </div>

      <div class="app-table-shell__scroller overflow-x-auto pb-1 [scrollbar-gutter:stable]">
        <ng-content></ng-content>
      </div>
    </section>
  `
})
export class TableShellComponent {}
