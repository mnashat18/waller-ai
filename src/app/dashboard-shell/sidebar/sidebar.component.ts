import { CommonModule } from '@angular/common';
import { ApplicationRef, EmbeddedViewRef, ElementRef, Component, OnDestroy, TemplateRef, ViewChild, inject } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import {
  getSidebarNavForRole,
  normalizeActiveMemberRole,
  type ActiveMemberRole,
  type SidebarNavGroup,
  type SidebarNavItem
} from '../../ia/wellar-ia';
import { AuthService } from '../../services/auth';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';

type SidebarNavGroupVm = {
  group: SidebarNavGroup['group'];
  items: SidebarNavItem[];
};

type SidebarVm = {
  loading: boolean;
  role: ActiveMemberRole | null;
  companyName: string | null;
  companyInitial: string;
  scopeValue: string;
  departmentValue: string;
  roleLabel: string;
  userDisplayName: string;
  userInitials: string;
  userEmail: string | null;
  groups: SidebarNavGroupVm[];
  emptyStateTitle: string;
  emptyStateDescription: string;
};

type AccountMenuPlacement = 'above' | 'below';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RoleBadgeComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent implements OnDestroy {
  private readonly companyContext = inject(CompanyContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);

  readonly vm$ = combineLatest({
    state: this.companyContext.state$,
    activeMembership: this.companyContext.activeMembership$,
    activeBusinessProfile: this.companyContext.activeBusinessProfile$
  }).pipe(
    map(({ state, activeMembership, activeBusinessProfile }) => {
      const role = normalizeActiveMemberRole(activeMembership?.member_role ?? state.context.activeMemberRole);
      const companyName = activeBusinessProfile?.company_name ?? state.context.activeBusinessProfileName ?? null;
      const departmentName = this.resolveDepartmentName(
        activeMembership?.department,
        state.context.activeDepartmentName,
        role
      );
      const userDisplayName = this.resolveUserDisplayName(state.context);
      const userEmail = this.resolveUserEmail(state.context);
      const userInitials = this.resolveUserInitials(userDisplayName, userEmail);
      const navGroups = getSidebarNavForRole(role).map((group) => ({
        group: group.group,
        items: group.items
      }));
      const isEmployee = role === 'employee';

      this.accountDisplayName = userDisplayName;
      this.accountEmail = userEmail;
      this.accountInitials = userInitials;
      this.accountRole = role;

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
        userDisplayName,
        userInitials,
        userEmail,
        groups: navGroups,
        emptyStateTitle: isEmployee ? 'Employee access' : 'Organization unavailable',
        emptyStateDescription: isEmployee
          ? 'Operational controls are reserved for organization leads.'
          : 'Resolve your organization access to continue.'
      } satisfies SidebarVm;
    })
  );

  accountMenuOpen = false;
  accountMenuPlacement: AccountMenuPlacement = 'above';
  accountMenuPosition = {
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 0
  };

  accountDisplayName = 'User';
  accountEmail: string | null = null;
  accountInitials = 'U';
  accountRole: ActiveMemberRole | null = null;
  private accountMenuViewRef: EmbeddedViewRef<unknown> | null = null;
  private accountMenuElement: HTMLElement | null = null;
  private accountMenuCleanup: Array<() => void> = [];

  @ViewChild('accountMenuTrigger') private accountMenuTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('accountMenuTemplate') private accountMenuTemplate?: TemplateRef<unknown>;

  onNavigate(_item: SidebarNavItem): void {}

  routerLinkActiveOptions(_item: SidebarNavItem): IsActiveMatchOptions {
    return {
      paths: 'exact',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored'
    };
  }

  ngOnDestroy(): void {
    this.destroyAccountMenuOverlay();
  }

  toggleAccountMenu(event: MouseEvent): void {
    event.stopPropagation();

    if (this.accountMenuOpen) {
      this.closeAccountMenu(true);
      return;
    }

    this.openAccountMenu();
  }

  openAccountSettings(tab: 'profile' | 'preferences' | 'security'): void {
    this.closeAccountMenu();
    void this.router.navigate(['/app/settings'], {
      queryParams: { tab },
      replaceUrl: false
    });
  }

  handleAccountMenuKeydown(event: KeyboardEvent): void {
    if (!this.accountMenuOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAccountMenu(true);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const items = this.accountMenuItems();
    if (!items.length) {
      return;
    }

    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex =
      event.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : (currentIndex <= 0 ? items.length : currentIndex) - 1;
    items[nextIndex]?.focus();
  }

  logout(): void {
    this.closeAccountMenu();
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }

  private companyInitial(name: string | null): string {
    const value = (name ?? '').trim();
    return value ? value.slice(0, 1).toUpperCase() : 'W';
  }

  private resolveUserDisplayName(context: {
    userDisplayName: string;
    currentUser: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
    userEmail: string | null;
  }): string {
    const direct = (context.userDisplayName ?? '').trim();
    if (direct) {
      return direct;
    }

    const first = (context.currentUser?.first_name ?? '').trim();
    const last = (context.currentUser?.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full) {
      return full;
    }

    const email = this.resolveUserEmail(context);
    return email ?? 'User';
  }

  private resolveUserEmail(context: {
    userEmail: string | null;
    currentUser: { email?: string | null } | null;
  }): string | null {
    const direct = (context.userEmail ?? '').trim();
    if (direct) {
      return direct;
    }

    const current = (context.currentUser?.email ?? '').trim();
    return current || null;
  }

  private resolveUserInitials(displayName: string, email: string | null): string {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length) {
      const first = parts[0]?.slice(0, 1) ?? '';
      const second = parts[1]?.slice(0, 1) ?? '';
      const initials = `${first}${second}`.trim();
      if (initials) {
        return initials.toUpperCase();
      }
    }

    const fallback = (email ?? '').trim();
    return fallback ? fallback.slice(0, 1).toUpperCase() : 'U';
  }

  private resolveDepartmentName(
    department: unknown,
    contextDepartmentName: string | null | undefined,
    role: ActiveMemberRole | null
  ): string | null {
    if (role !== 'manager' && role !== 'employee') {
      return null;
    }

    const membershipDepartmentName =
      department && typeof department === 'object'
        ? this.sanitizeDepartmentName((department as { name?: unknown }).name)
        : null;

    if (membershipDepartmentName) {
      return membershipDepartmentName;
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

  private openAccountMenu(): void {
    if (this.accountMenuOpen) {
      return;
    }

    this.accountMenuOpen = true;
    this.mountAccountMenuOverlay();
  }

  private closeAccountMenu(restoreFocus = false): void {
    if (!this.accountMenuOpen) {
      if (restoreFocus) {
        this.accountMenuTrigger?.nativeElement.focus();
      }
      return;
    }

    this.accountMenuOpen = false;
    this.destroyAccountMenuOverlay();

    if (restoreFocus) {
      this.accountMenuTrigger?.nativeElement.focus();
    }
  }

  private mountAccountMenuOverlay(): void {
    this.destroyAccountMenuOverlay();

    if (!this.accountMenuTemplate) {
      return;
    }

    const viewRef = this.accountMenuTemplate.createEmbeddedView({});
    this.appRef.attachView(viewRef);
    viewRef.detectChanges();

    const host = viewRef.rootNodes.find((node): node is HTMLElement => node instanceof HTMLElement);
    if (!host) {
      this.appRef.detachView(viewRef);
      viewRef.destroy();
      return;
    }

    document.body.appendChild(host);
    this.accountMenuViewRef = viewRef;
    this.accountMenuElement = host;
    this.repositionAccountMenu();
    this.attachAccountMenuListeners();
    this.focusFirstAccountMenuItem();
  }

  private repositionAccountMenu(): void {
    if (!this.accountMenuElement || !this.accountMenuTrigger || !this.accountMenuOpen) {
      return;
    }

    const triggerRect = this.accountMenuTrigger.nativeElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const menuWidth = Math.max(220, Math.min(276, viewportWidth - margin * 2));

    this.accountMenuElement.style.width = `${menuWidth}px`;
    this.accountMenuElement.style.left = '0px';
    this.accountMenuElement.style.top = '0px';
    this.accountMenuElement.style.maxHeight = 'none';

    const menuHeight = Math.ceil(this.accountMenuElement.getBoundingClientRect().height);
    const spaceBelow = viewportHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;
    const openBelow = spaceBelow >= menuHeight || spaceBelow >= spaceAbove;

    const top = openBelow
      ? Math.max(margin, Math.min(triggerRect.bottom + 8, viewportHeight - menuHeight - margin))
      : Math.max(margin, triggerRect.top - menuHeight - 8);
    const left = Math.max(margin, Math.min(triggerRect.left, viewportWidth - menuWidth - margin));
    const maxHeight = Math.max(140, openBelow ? spaceBelow : spaceAbove);

    this.accountMenuPlacement = openBelow ? 'below' : 'above';
    this.accountMenuPosition = {
      top,
      left,
      width: menuWidth,
      maxHeight
    };

    this.accountMenuElement.style.top = `${top}px`;
    this.accountMenuElement.style.left = `${left}px`;
    this.accountMenuElement.style.maxHeight = `${maxHeight}px`;
  }

  private attachAccountMenuListeners(): void {
    const updatePosition = () => this.repositionAccountMenu();
    const onDocumentClick = (event: MouseEvent) => {
      if (!this.accountMenuOpen) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || !this.isAccountMenuTarget(target)) {
        this.closeAccountMenu();
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('click', onDocumentClick, true);

    this.accountMenuCleanup.push(
      () => window.removeEventListener('resize', updatePosition),
      () => window.removeEventListener('scroll', updatePosition, true),
      () => document.removeEventListener('click', onDocumentClick, true)
    );
  }

  private destroyAccountMenuOverlay(): void {
    while (this.accountMenuCleanup.length) {
      this.accountMenuCleanup.pop()?.();
    }

    if (this.accountMenuViewRef) {
      this.appRef.detachView(this.accountMenuViewRef);
      this.accountMenuViewRef.destroy();
      this.accountMenuViewRef = null;
    }

    if (this.accountMenuElement?.parentNode) {
      this.accountMenuElement.parentNode.removeChild(this.accountMenuElement);
    }

    this.accountMenuElement = null;
    this.accountMenuPlacement = 'above';
    this.accountMenuPosition = {
      top: 0,
      left: 0,
      width: 0,
      maxHeight: 0
    };
  }

  private focusFirstAccountMenuItem(): void {
    this.accountMenuItems()[0]?.focus();
  }

  private accountMenuItems(): HTMLButtonElement[] {
    return Array.from(
      this.accountMenuElement?.querySelectorAll<HTMLButtonElement>('.app-sidebar__account-menu-item') ?? []
    );
  }

  private isAccountMenuTarget(target: Node): boolean {
    return Boolean(
      this.accountMenuElement?.contains(target) || this.accountMenuTrigger?.nativeElement.contains(target)
    );
  }
}
