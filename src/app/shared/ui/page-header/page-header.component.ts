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
    <section class="app-page-header app-dashboard-panel">
      <nav *ngIf="breadcrumbs.length" class="app-page-header__breadcrumbs">
        <ng-container *ngFor="let crumb of breadcrumbs; let last = last">
          <a *ngIf="crumb.url && !last" [routerLink]="crumb.url">{{ crumb.label }}</a>
          <span *ngIf="!crumb.url || last" [class.is-current]="last">{{ crumb.label }}</span>
          <span *ngIf="!last" aria-hidden="true">/</span>
        </ng-container>
      </nav>

      <div class="app-page-header__layout">
        <div>
          <p *ngIf="eyebrow" class="app-page-header__eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
          <p *ngIf="description" class="app-page-header__description">{{ description }}</p>
        </div>

        <div class="app-page-header__actions">
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
