import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import {
  OperationsAdminService,
  type DepartmentMutationInput,
  type DepartmentRow,
  type DepartmentsPageData
} from '../../services/operations-admin.service';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { EmptyStateCtaComponent } from '../../shared/ui/empty-state-cta/empty-state-cta.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageActionBarComponent } from '../../shared/ui/page-action-bar/page-action-bar.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';

type DepartmentForm = {
  name: string;
  is_active: boolean;
  manager_member: string;
};

@Component({
  selector: 'app-departments-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageActionBarComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    KpiCardComponent,
    StatusBadgeComponent,
    CardSkeletonLoaderComponent,
    EmptyStateCtaComponent,
    ErrorStateComponent
  ],
  templateUrl: './departments.html'
})
export class DepartmentsPageComponent implements OnInit {
  loading = true;
  saving = false;
  errorMessage = '';
  feedbackMessage = '';
  pageData: DepartmentsPageData | null = null;
  selectedDepartment: DepartmentRow | null = null;
  showCreateModal = false;
  showEditModal = false;
  showManagerModal = false;
  search = '';
  statusFilter = '';
  form: DepartmentForm = this.defaultForm();

  constructor(
    private operationsAdmin: OperationsAdminService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadPage();
  }

  get filteredRows(): DepartmentRow[] {
    const rows = this.pageData?.rows ?? [];
    const search = this.search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        (row.manager_name ?? '').toLowerCase().includes(search);

      const matchesStatus = !this.statusFilter || this.departmentStatus(row) === this.statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  get totalEmployees(): number {
    return (this.pageData?.rows ?? []).reduce((sum, row) => sum + row.employee_count, 0);
  }

  get totalTemplates(): number {
    return this.pageData?.shift_template_count ?? 0;
  }

  get openAlerts(): number {
    return (this.pageData?.rows ?? []).reduce((sum, row) => sum + row.open_alerts_count, 0);
  }

  get statusOptions(): string[] {
    return Array.from(
      new Set((this.pageData?.rows ?? []).map((row) => this.departmentStatus(row)).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }

  refresh(): void {
    this.loadPage();
  }

  openCreateModal(): void {
    this.form = this.defaultForm();
    this.showCreateModal = true;
  }

  openEditModal(row: DepartmentRow): void {
    this.selectedDepartment = row;
    this.form = {
      name: row.name,
      is_active: row.is_active,
      manager_member: this.departmentManagerMemberId(row.manager_member)
    };
    this.showEditModal = true;
  }

  openManagerModal(row: DepartmentRow): void {
    this.selectedDepartment = row;
    this.form = {
      name: row.name,
      is_active: row.is_active,
      manager_member: this.departmentManagerMemberId(row.manager_member)
    };
    this.showManagerModal = true;
  }

  closeModal(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.showManagerModal = false;
    this.selectedDepartment = null;
  }

  createDepartment(): void {
    if (!this.form.name.trim()) {
      this.feedbackMessage = 'Department name is required.';
      return;
    }

    this.saving = true;
    this.feedbackMessage = '';

    const payload: DepartmentMutationInput = {
      name: this.form.name.trim(),
      is_active: this.form.is_active,
      manager_member: this.toNullable(this.form.manager_member)
    };

    this.operationsAdmin.createDepartment(payload).subscribe({
      next: () => {
        this.saving = false;
        this.showCreateModal = false;
        this.feedbackMessage = 'Department created.';
        this.loadPage();
      },
      error: (error: unknown) => {
        this.saving = false;
        this.feedbackMessage = this.toDepartmentErrorMessage(error, 'Failed to create department.');
      }
    });
  }

  saveDepartment(): void {
    if (!this.selectedDepartment?.id || !this.form.name.trim()) {
      return;
    }

    this.saving = true;
    this.feedbackMessage = '';

    const payload: Partial<DepartmentMutationInput> = {
      name: this.form.name.trim(),
      is_active: this.form.is_active,
      manager_member: this.toNullable(this.form.manager_member)
    };

    this.operationsAdmin.updateDepartment(this.selectedDepartment.id, payload).subscribe({
      next: () => {
        this.saving = false;
        this.showEditModal = false;
        this.feedbackMessage = 'Department updated.';
        this.loadPage();
      },
      error: (error: unknown) => {
        this.saving = false;
        this.feedbackMessage = this.toDepartmentErrorMessage(error, 'Failed to update department.');
      }
    });
  }

  assignManager(): void {
    if (!this.selectedDepartment?.id) {
      return;
    }

    this.saving = true;
    this.feedbackMessage = '';

    this.operationsAdmin
      .assignDepartmentManager(this.selectedDepartment.id, this.toNullable(this.form.manager_member))
      .subscribe({
        next: () => {
          this.saving = false;
          this.showManagerModal = false;
          this.feedbackMessage = 'Manager assignment updated.';
          this.loadPage();
        },
        error: (error: unknown) => {
          this.saving = false;
          this.feedbackMessage = this.toDepartmentErrorMessage(error, 'Failed to assign manager.');
        }
      });
  }

  reviewMembers(row: DepartmentRow): void {
    this.router.navigate(['/app/workforce'], {
      queryParams: { department: row.id }
    });
  }

  trackByDepartment(index: number, row: DepartmentRow): string {
    return row.id || String(index);
  }

  private loadPage(): void {
    this.loading = true;
    this.errorMessage = '';

    this.operationsAdmin.getDepartmentsPageData().pipe(
      finalize(() => {
        queueMicrotask(() => {
          this.loading = false;
          console.log('departments loading', this.loading);
          console.log('departments data', this.pageData);
          this.cdr.detectChanges();
        });
      })
    ).subscribe({
      next: (pageData) => {
        this.pageData = pageData;
      },
      error: (error) => {
        this.pageData = null;
        this.errorMessage = error?.message || 'Failed to load departments.';
      }
    });
  }

  private defaultForm(): DepartmentForm {
    return {
      name: '',
      is_active: true,
      manager_member: ''
    };
  }

  departmentStatus(row: DepartmentRow): string {
    return row.is_active ? 'active' : 'inactive';
  }

  departmentManagerMemberId(value: DepartmentRow['manager_member']): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const id = record['id'];
      if (typeof id === 'string' || typeof id === 'number') {
        return String(id);
      }
    }

    return '';
  }

  private toNullable(value: string | null | undefined): string | null {
    return value && value.trim() ? value.trim() : null;
  }

  private toDepartmentErrorMessage(error: unknown, fallback: string): string {
    const anyError = error as {
      error?: {
        errors?: Array<{ extensions?: { reason?: string }; message?: string }>;
        message?: string;
      };
      message?: string;
    };
    const message =
      anyError?.error?.errors?.[0]?.extensions?.reason ||
      anyError?.error?.errors?.[0]?.message ||
      anyError?.error?.message ||
      anyError?.message ||
      fallback;
    const normalized = String(message || '').toLowerCase();
    if (normalized.includes('departments') && normalized.includes('business_profile') && normalized.includes('unique')) {
      return 'Remove unique constraint from departments.business_profile because a company must have many departments.';
    }
    return String(message || fallback);
  }
}
