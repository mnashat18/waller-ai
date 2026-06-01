import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterModule } from '@angular/router';
import { of, Subscription as RxSubscription } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import {
  SIDEBAR_SECTIONS,
  getSidebarItemsForRole,
  normalizeActiveMemberRole,
  type ActiveMemberRole,
  type WorkspaceRouteDefinition
} from '../../ia/wellar-ia';
import { CompanyContextService } from '../../core/context/company-context.service';
import { BusinessCenterService } from '../../services/business-center.service';
import { SubscriptionService } from '../../services/subscription.service';

type SidebarSectionViewModel = {
  id: string;
  label: string;
  items: WorkspaceRouteDefinition[];
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterModule],
  templateUrl: './sidebar.html'
})
export class SidebarComponent implements OnInit, OnDestroy {
  loadingAccessState = true;
  activeCompanyLabel = 'Loading company...';
  activeDepartmentLabel = 'Loading scope...';
  memberRoleLabel = 'Loading role...';
  sections: SidebarSectionViewModel[] = [];

  private accessSub?: RxSubscription;
  private navSub?: RxSubscription;
  private refreshSub?: RxSubscription;
  private contextSub?: RxSubscription;
  private readonly accessTimeoutMs = 10000;

  constructor(
    private companyContext: CompanyContextService,
    private businessCenter: BusinessCenterService,
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.applySessionFallback();
    this.companyContext.ensureLoaded().subscribe();
    this.contextSub = this.companyContext.state$.subscribe((state) => {
      const role = normalizeActiveMemberRole(state.context.activeMemberRole);
      const activeBusinessProfile = state.context.activeBusinessProfileId;
      const activeDepartment = state.context.activeDepartmentId;
      const companyName =
        state.context.activeBusinessProfileName ||
        this.businessCenter.getCachedHubAccessState()?.profile?.company_name ||
        state.context.availableCompanies.find((item) => item.id === activeBusinessProfile)?.name ||
        activeBusinessProfile ||
        'No active company';

      this.activeCompanyLabel = companyName;
      this.activeDepartmentLabel = activeDepartment || 'Company-wide';
      this.memberRoleLabel = role ? this.toTitleCase(role) : 'No role';
      this.sections = this.buildSections(role, activeBusinessProfile, activeDepartment);
      this.loadingAccessState = state.loading;
    });

    this.loadAccessState(false);
    this.refreshSub = this.subscriptions.snapshotRefreshEvents().subscribe(() => {
      this.loadAccessState(true);
    });
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadAccessState(false);
      }
    });
  }

  ngOnDestroy() {
    this.accessSub?.unsubscribe();
    this.navSub?.unsubscribe();
    this.refreshSub?.unsubscribe();
    this.contextSub?.unsubscribe();
  }

  statusText(): string {
    if (this.loadingAccessState) {
      return 'Loading...';
    }
    return this.activeDepartmentLabel === 'Company-wide' ? 'Company scope' : 'Department scope';
  }

  companyInitial(): string {
    const label = this.activeCompanyLabel.trim();
    return label ? label.slice(0, 1).toUpperCase() : 'W';
  }

  onNavigate(item: WorkspaceRouteDefinition): void {
    console.log('[Sidebar] navigate', item.label, this.toAppRoute(item.path));
  }

  toAppRoute(path: string): string {
    return `/app/${path.replace(/^\/+/, '')}`;
  }

  private loadAccessState(forceRefresh = false): void {
    this.companyContext.ensureLoaded(forceRefresh).subscribe();
  }

  private buildSections(
    role: ActiveMemberRole | null,
    activeBusinessProfile: string | null,
    activeDepartment: string | null
  ): SidebarSectionViewModel[] {
    const items = getSidebarItemsForRole(role, activeBusinessProfile, activeDepartment);
    return SIDEBAR_SECTIONS
      .map((section) => ({
        id: section.id,
        label: section.label,
        items: items.filter((item) => item.section === section.id)
      }))
      .filter((section) => section.items.length > 0);
  }

  private applySessionFallback(): void {
    const role = normalizeActiveMemberRole(this.readStorage('active_member_role'));
    const activeBusinessProfile = this.readStorage('active_business_profile');
    const activeDepartment = this.readStorage('active_department');
    const cachedCompanyName = this.businessCenter.getCachedHubAccessState()?.profile?.company_name ?? null;

    this.activeCompanyLabel = cachedCompanyName || activeBusinessProfile || 'No active company';
    this.activeDepartmentLabel = activeDepartment || 'Company-wide';
    this.memberRoleLabel = role ? this.toTitleCase(role) : 'No role';
    this.sections = this.buildSections(role, activeBusinessProfile, activeDepartment);
  }

  private readStorage(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  }

  private toTitleCase(value: string): string {
    return value
      .split(' ')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');
  }
}
