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
  styles: [`
    .app-page-header__breadcrumbs,
    .app-page-header__layout {
      width: min(100%, 68rem);
      margin-inline: auto;
    }

    .app-page-header__layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 1rem 1.25rem;
    }

    .app-page-header__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.65rem;
      min-width: 0;
      max-width: 100%;
    }

    @media (max-width: 1199px) {
      .app-page-header__breadcrumbs,
      .app-page-header__layout {
        width: 100%;
      }

      .app-page-header__layout {
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
      }

      .app-page-header__actions {
        justify-content: flex-start;
      }
    }
  `],
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
        <div class="app-page-header__intro">
          <p *ngIf="eyebrow" class="app-page-header__eyebrow">{{ eyebrow }}</p>

          <div class="app-page-header__title-block">
            <h1>{{ title }}</h1>
            <p *ngIf="description" class="app-page-header__description">{{ description }}</p>
          </div>
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
