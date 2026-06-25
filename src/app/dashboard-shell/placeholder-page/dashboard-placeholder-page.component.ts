import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { CompanyContextService } from '../../core/context/company-context.service';
import { getWorkspaceRouteById, type WorkspaceRouteDefinition } from '../../ia/wellar-ia';
import { CompanyContextChipComponent } from '../../shared/ui/company-context-chip/company-context-chip.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state/loading-state.component';
import { PageHeaderComponent, type PageBreadcrumb } from '../../shared/ui/page-header/page-header.component';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';

@Component({
  selector: 'app-dashboard-placeholder-page',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    RoleBadgeComponent,
    CompanyContextChipComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent
  ],
  templateUrl: './dashboard-placeholder-page.component.html'
})
export class DashboardPlaceholderPageComponent {
  readonly state$;
  readonly page = this.resolvePage();
  readonly breadcrumbs: PageBreadcrumb[] = [
    { label: 'Dashboard', url: '/app/dashboard' },
    { label: this.page.title }
  ];

  constructor(
    private route: ActivatedRoute,
    private companyContext: CompanyContextService
  ) {
    this.state$ = this.companyContext.state$;
  }

  retry(): void {
    this.companyContext.ensureLoaded(true).subscribe();
  }

  roleScopeSummary(role: string | null, departmentName: string | null, departmentId: string | null): string {
    if (role === 'owner') {
      return 'Owner access: organization-wide control across operational and administrative dashboard pages.';
    }
    if (role === 'hr') {
      return 'HR access: organization-wide operational access across dashboard workflows.';
    }
    if (role === 'manager') {
      const department = departmentName || departmentId || 'active department';
      return `Manager scope: restricted to department-level operations for ${department}.`;
    }
    return 'No dashboard access level is currently active.';
  }

  companyScopeSummary(companyName: string | null, companyId: string | null): string {
    const company = companyName || companyId || 'No active organization';
    return `All page data is expected to remain scoped to ${company}.`;
  }

  private resolvePage(): WorkspaceRouteDefinition {
    const pageId = this.route.snapshot.data['pageId'];
    const page = pageId ? getWorkspaceRouteById(pageId) : null;

    if (!page) {
      throw new Error('Dashboard placeholder page requires route data.pageId.');
    }

    return page;
  }
}
