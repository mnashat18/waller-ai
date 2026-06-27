import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { OperationsSupportService, type ActivityPageData, type ActivityRow } from '../../services/operations-support.service';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { EmptyStateCtaComponent } from '../../shared/ui/empty-state-cta/empty-state-cta.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { CompanyContextChipComponent } from '../../shared/ui/company-context-chip/company-context-chip.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';

type ActivityFilters = {
  actor: string;
  department: string;
  action: string;
  entityType: string;
  startDate: string;
  endDate: string;
  search: string;
};

@Component({
  selector: 'app-activity-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    PageHeaderComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    KpiCardComponent,
    TableShellComponent,
    CompanyContextChipComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    EmptyStateCtaComponent,
    ErrorStateComponent,
    ViewportDialogComponent
  ],
  templateUrl: './activity.html'
})
export class ActivityPageComponent implements OnInit {
  loading = true;
  errorMessage = '';
  pageData: ActivityPageData | null = null;
  selectedEvent: ActivityRow | null = null;

  filters: ActivityFilters = {
    actor: '',
    department: '',
    action: '',
    entityType: '',
    startDate: '',
    endDate: '',
    search: ''
  };

  constructor(
    private support: OperationsSupportService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const eventId = params.get('event');
      if (eventId && this.pageData) {
        this.selectedEvent = this.pageData.rows.find((row) => row.id === eventId) ?? null;
      }
    });

    this.loadPage();
  }

  get filteredRows(): ActivityRow[] {
    const rows = this.pageData?.rows ?? [];
    const search = this.filters.search.trim().toLowerCase();
    const start = this.filters.startDate ? new Date(this.filters.startDate).getTime() : 0;
    const end = this.filters.endDate ? new Date(`${this.filters.endDate}T23:59:59`).getTime() : 0;

    return rows.filter((row) => {
      const matchesActor = !this.filters.actor || row.actor_label === this.filters.actor;
      const matchesDepartment = !this.filters.department || row.department_id === this.filters.department;
      const matchesAction = !this.filters.action || row.action === this.filters.action;
      const matchesEntityType = !this.filters.entityType || row.entity_type === this.filters.entityType;
      const matchesSearch =
        !search ||
        row.actor_label.toLowerCase().includes(search) ||
        row.action.toLowerCase().includes(search) ||
        row.entity_type.toLowerCase().includes(search) ||
        (row.target_label ?? '').toLowerCase().includes(search);
      const createdAt = row.date_created ? new Date(row.date_created).getTime() : 0;
      const matchesStart = !start || (createdAt && createdAt >= start);
      const matchesEnd = !end || (createdAt && createdAt <= end);
      return matchesActor && matchesDepartment && matchesAction && matchesEntityType && matchesSearch && matchesStart && matchesEnd;
    });
  }

  refresh(): void {
    this.loadPage();
  }

  clearFilters(): void {
    this.filters = {
      actor: '',
      department: '',
      action: '',
      entityType: '',
      startDate: '',
      endDate: '',
      search: ''
    };
  }

  viewEvent(row: ActivityRow): void {
    this.selectedEvent = row;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { event: row.id },
      queryParamsHandling: 'merge'
    });
  }

  closeDrawer(): void {
    this.selectedEvent = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { event: null },
      queryParamsHandling: 'merge'
    });
  }

  trackByEvent(index: number, row: ActivityRow): string {
    return row.id || String(index);
  }

  actionLabel(value: string | null | undefined): string {
    return this.toTitleLabel(value, 'Activity recorded');
  }

  entityLabel(value: string | null | undefined): string {
    return this.toTitleLabel(value, 'Record');
  }

  eventSummary(row: ActivityRow): string {
    const action = this.actionLabel(row.action).toLowerCase();
    const entity = this.entityLabel(row.entity_type).toLowerCase();
    const target = row.target_label?.trim();
    return target
      ? `${row.actor_label} ${action} for ${target}.`
      : `${row.actor_label} ${action} on ${entity}.`;
  }

  scopeLabel(row: ActivityRow): string {
    return row.department_name?.trim() || 'Organization-wide';
  }

  hasActiveFilters(): boolean {
    return Object.values(this.filters).some((value) => Boolean(value.trim()));
  }

  private loadPage(): void {
    this.loading = true;
    this.errorMessage = '';

    this.support.getActivityPageData().pipe(
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (pageData) => {
        this.pageData = pageData;
        const eventId = this.route.snapshot.queryParamMap.get('event');
        if (eventId) {
          this.selectedEvent = pageData.rows.find((row) => row.id === eventId) ?? null;
        }
      },
      error: (error) => {
        this.pageData = null;
        this.errorMessage = error?.message || 'Failed to load activity events.';
      }
    });
  }

  private toTitleLabel(value: string | null | undefined, fallback: string): string {
    const normalized = (value ?? '').trim();
    if (!normalized) {
      return fallback;
    }

    return normalized
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ');
  }
}
