import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import {
  OperationsAdminService,
  type CreateInviteInput,
  type InviteRow,
  type InvitesPageData
} from '../../services/operations-admin.service';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { EmptyStateCtaComponent } from '../../shared/ui/empty-state-cta/empty-state-cta.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageActionBarComponent } from '../../shared/ui/page-action-bar/page-action-bar.component';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';

type InviteForm = {
  email: string;
  phone: string;
  member_role: string;
  department: string;
  invite_type: string;
};

@Component({
  selector: 'app-invites-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DatePipe,
    PageActionBarComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    KpiCardComponent,
    RoleBadgeComponent,
    StatusBadgeComponent,
    TableShellComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    EmptyStateCtaComponent,
    ErrorStateComponent
  ],
  templateUrl: './invites.html'
})
export class InvitesPageComponent implements OnInit {
  loading = true;
  saving = false;
  errorMessage = '';
  feedbackMessage = '';
  pageData: InvitesPageData | null = null;
  showCreateModal = false;

  filters = {
    search: '',
    status: '',
    role: '',
    department: ''
  };

  inviteForm: InviteForm = this.defaultInviteForm();

  constructor(
    private operationsAdmin: OperationsAdminService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPage();
  }

  get filteredRows(): InviteRow[] {
    const rows = this.pageData?.rows ?? [];
    const search = this.filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !search ||
        (row.email ?? '').toLowerCase().includes(search) ||
        (row.phone ?? '').toLowerCase().includes(search) ||
        (row.claimed_member_name ?? '').toLowerCase().includes(search);

      const matchesStatus = !this.filters.status || (row.status ?? '') === this.filters.status;
      const matchesRole = !this.filters.role || (row.member_role ?? '') === this.filters.role;
      const matchesDepartment = !this.filters.department || row.department_id === this.filters.department;

      return matchesSearch && matchesStatus && matchesRole && matchesDepartment;
    });
  }

  get statusOptions(): string[] {
    return this.uniqueValues(this.pageData?.rows.map((row) => row.status));
  }

  get roleOptions(): string[] {
    return this.uniqueValues(this.pageData?.rows.map((row) => row.member_role));
  }

  refresh(): void {
    this.loadPage();
  }

  openCreateModal(): void {
    this.inviteForm = this.defaultInviteForm();
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  sendInvite(): void {
    if (!this.inviteForm.email.trim() && !this.inviteForm.phone.trim()) {
      this.feedbackMessage = 'Enter an email or phone number before sending an invite.';
      return;
    }

    this.saving = true;
    this.feedbackMessage = '';

    const payload: CreateInviteInput = {
      email: this.toNullable(this.inviteForm.email),
      phone: this.toNullable(this.inviteForm.phone),
      member_role: this.inviteForm.member_role,
      department: this.toNullable(this.inviteForm.department),
      invite_type: this.inviteForm.invite_type
    };

    this.operationsAdmin.createInvite(payload).subscribe({
      next: () => {
        this.saving = false;
        this.showCreateModal = false;
        this.feedbackMessage = 'Invite sent.';
        this.loadPage();
      },
      error: (error) => {
        this.saving = false;
        this.feedbackMessage = error?.message || 'Failed to send invite.';
      }
    });
  }

  resendInvite(row: InviteRow): void {
    this.feedbackMessage = '';
    this.operationsAdmin.resendInvite(row.id).subscribe({
      next: () => {
        this.feedbackMessage = 'Invite resent.';
        this.loadPage();
      },
      error: (error) => {
        this.feedbackMessage = error?.message || 'Failed to resend invite.';
      }
    });
  }

  expireInvite(row: InviteRow): void {
    if (typeof window !== 'undefined' && !window.confirm(`Expire invite for ${row.email || row.phone || row.id}?`)) {
      return;
    }

    this.feedbackMessage = '';
    this.operationsAdmin.expireInvite(row.id).subscribe({
      next: () => {
        this.feedbackMessage = 'Invite expired.';
        this.loadPage();
      },
      error: (error) => {
        this.feedbackMessage = error?.message || 'Failed to expire invite.';
      }
    });
  }

  revokeInvite(row: InviteRow): void {
    if (typeof window !== 'undefined' && !window.confirm(`Revoke invite for ${row.email || row.phone || row.id}?`)) {
      return;
    }

    this.feedbackMessage = '';
    this.operationsAdmin.revokeInvite(row.id).subscribe({
      next: () => {
        this.feedbackMessage = 'Invite revoked.';
        this.loadPage();
      },
      error: (error) => {
        this.feedbackMessage = error?.message || 'Failed to revoke invite.';
      }
    });
  }

  openClaimedMember(row: InviteRow): void {
    if (!row.claimed_member_id) {
      return;
    }

    this.router.navigate(['/app/workforce'], {
      queryParams: { member: row.claimed_member_id }
    });
  }

  canResend(row: InviteRow): boolean {
    const status = (row.status ?? '').trim().toLowerCase();
    return status !== 'revoked' && status !== 'claimed' && status !== 'accepted';
  }

  canExpire(row: InviteRow): boolean {
    const status = (row.status ?? '').trim().toLowerCase();
    return status === 'pending' || status === 'sent';
  }

  canRevoke(row: InviteRow): boolean {
    const status = (row.status ?? '').trim().toLowerCase();
    return status !== 'revoked' && status !== 'claimed' && status !== 'accepted';
  }

  trackByInvite(index: number, row: InviteRow): string {
    return row.id || String(index);
  }

  private loadPage(): void {
    this.loading = true;
    this.errorMessage = '';

    this.operationsAdmin.getInvitesPageData().pipe(
      finalize(() => {
        this.loading = false;
        console.log('invites loading', this.loading);
        console.log('invites data', this.pageData);
      })
    ).subscribe({
      next: (pageData) => {
        this.pageData = pageData;
      },
      error: (error) => {
        this.pageData = null;
        this.errorMessage = error?.message || 'Failed to load invites.';
      }
    });
  }

  private defaultInviteForm(): InviteForm {
    return {
      email: '',
      phone: '',
      member_role: 'employee',
      department: '',
      invite_type: 'member_onboarding'
    };
  }

  private uniqueValues(values: Array<string | null | undefined> | undefined): string[] {
    return Array.from(new Set((values ?? []).map((value) => (value ?? '').trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right)
    );
  }

  private toNullable(value: string | null | undefined): string | null {
    return value && value.trim() ? value.trim() : null;
  }
}
