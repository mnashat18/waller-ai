import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, startWith } from 'rxjs';
import { map } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  getSidebarNavForRole,
  normalizeActiveMemberRole,
  type ActiveMemberRole,
  type SidebarNavGroup,
  type SidebarNavItem
} from '../../ia/wellar-ia';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';

type SidebarNavItemVm = SidebarNavItem & { active: boolean };

type SidebarNavGroupVm = {
  group: SidebarNavGroup['group'];
  items: SidebarNavItemVm[];
};

type SidebarVm = {
  loading: boolean;
  role: ActiveMemberRole | null;
  companyName: string | null;
  companyInitial: string;
  scopeLabel: string;
  scopeDetail: string | null;
  groups: SidebarNavGroupVm[];
  emptyStateTitle: string;
  emptyStateDescription: string;
};

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RoleBadgeComponent],
  templateUrl: './sidebar.component.html'
})
export class SidebarComponent {
  private readonly companyContext = inject(CompanyContextService);
  private readonly router = inject(Router);

  readonly vm$ = combineLatest({
    state: this.companyContext.state$,
    activeMembership: this.companyContext.activeMembership$,
    activeBusinessProfile: this.companyContext.activeBusinessProfile$,
    currentUrl: this.router.events.pipe(
      startWith(null),
      map(() => this.router.url.split('?')[0].split('#')[0])
    )
  }).pipe(
    map(({ state, activeMembership, activeBusinessProfile, currentUrl }) => {
      const role = normalizeActiveMemberRole(activeMembership?.member_role ?? state.context.activeMemberRole);
      const companyName = activeBusinessProfile?.company_name ?? state.context.activeBusinessProfileName ?? null;
      const department = activeMembership?.department;
      const departmentName =
        typeof department === 'string'
          ? state.context.activeDepartmentName
          : department && typeof department === 'object'
            ? department.name ?? state.context.activeDepartmentName
            : state.context.activeDepartmentName;
      const navGroups = getSidebarNavForRole(role).map((group) => ({
        group: group.group,
        items: group.items.map((item) => ({
          ...item,
          active: this.isActive(item.matchRoutes, currentUrl)
        }))
      }));
      const isEmployee = role === 'employee';

      return {
        loading: state.loading,
        role,
        companyName,
        companyInitial: this.companyInitial(companyName),
        scopeLabel: departmentName ? 'Department' : 'Organization-wide',
        scopeDetail: departmentName ?? null,
        groups: navGroups,
        emptyStateTitle: isEmployee ? 'Employee access' : 'Organization unavailable',
        emptyStateDescription: isEmployee
          ? 'Operational controls are reserved for organization leads.'
          : 'Resolve your organization access to continue.'
      } satisfies SidebarVm;
    })
  );

  onNavigate(_item: SidebarNavItem): void {}

  private isActive(matchRoutes: string[], currentUrl: string): boolean {
    const normalizedCurrent = this.normalizeUrl(currentUrl);
    return matchRoutes.some((route) => {
      const normalizedRoute = this.normalizeUrl(route);
      return normalizedCurrent === normalizedRoute || normalizedCurrent.startsWith(`${normalizedRoute}/`);
    });
  }

  private normalizeUrl(url: string): string {
    return (url ?? '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '') || '/';
  }

  private companyInitial(name: string | null): string {
    const value = (name ?? '').trim();
    return value ? value.slice(0, 1).toUpperCase() : 'W';
  }
}
