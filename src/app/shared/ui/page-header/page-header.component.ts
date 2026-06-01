import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type PageBreadcrumb = {
  label: string;
  url?: string | null;
};

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
      <nav *ngIf="breadcrumbs.length" class="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
        <ng-container *ngFor="let crumb of breadcrumbs; let last = last">
          <a *ngIf="crumb.url && !last" [routerLink]="crumb.url" class="transition hover:text-slate-700">{{ crumb.label }}</a>
          <span *ngIf="!crumb.url || last" [class.text-slate-700]="last">{{ crumb.label }}</span>
          <span *ngIf="!last">/</span>
        </ng-container>
      </nav>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p *ngIf="eyebrow" class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{{ eyebrow }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{{ title }}</h1>
          <p *ngIf="description" class="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{{ description }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <ng-content select="[pageActions]"></ng-content>
        </div>
      </div>
    </section>
  `
})
export class PageHeaderComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
  @Input() breadcrumbs: PageBreadcrumb[] = [];
}
