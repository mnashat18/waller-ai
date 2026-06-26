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
  scopeValue: string;
  departmentValue: string;
  roleLabel: string;
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
      const departmentName = this.resolveDepartmentName(
        activeMembership?.department,
        state.context.activeDepartmentName,
        role
      );
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
        scopeValue:
          role === 'manager' || role === 'employee'
            ? (departmentName ? 'Department' : 'Organization')
            : 'Organization',
        departmentValue: departmentName ?? 'All departments',
        roleLabel: this.roleLabel(role),
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

  private resolveDepartmentName(
    department: unknown,
    contextDepartmentName: string | null | undefined,
    role: ActiveMemberRole | null
  ): string | null {
    const membershipDepartmentName =
      department && typeof department === 'object'
        ? this.sanitizeDepartmentName((department as { name?: unknown }).name)
        : null;

    if (membershipDepartmentName) {
      return membershipDepartmentName;
    }

    if (role !== 'manager' && role !== 'employee') {
      return null;
    }

    return this.sanitizeDepartmentName(contextDepartmentName);
  }

  private sanitizeDepartmentName(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    const lower = normalized.toLowerCase();
    if (
      lower === 'owner' ||
      lower === 'hr' ||
      lower === 'manager' ||
      lower === 'employee' ||
      lower === 'organization' ||
      lower === 'organization-wide' ||
      lower === 'all departments' ||
      normalized.includes('@') ||
      /^member[-_\s]/i.test(normalized) ||
      /^user[-_\s]/i.test(normalized) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalized)
    ) {
      return null;
    }

    return normalized;
  }

  private roleLabel(role: ActiveMemberRole | null): string {
    if (role === 'owner') return 'Owner';
    if (role === 'hr') return 'HR';
    if (role === 'manager') return 'Manager';
    if (role === 'employee') return 'Employee';
    return 'No access';
  }
}
