import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subscription as RxSubscription } from 'rxjs';

import { getWorkspaceRouteByPath } from '../../ia/wellar-ia';
import { CompanyContextService } from '../../core/context/company-context.service';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { AuthService } from '../../services/auth';
import { BusinessCenterService } from '../../services/business-center.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationsComponent],
  templateUrl: './header.html'
})
export class HeaderComponent {
  title = 'Wellar';
  subtitle = 'Operational control center';
  activeCompanyLabel = 'No active company';
  activeDepartmentLabel = 'Company-wide';
  activeRoleLabel = 'No role';
  switcherOpen = false;
  profileMenuOpen = false;

  private contextSub?: RxSubscription;

  constructor(
    private router: Router,
    private auth: AuthService,
    private businessCenter: BusinessCenterService,
    private companyContext: CompanyContextService
  ) {
    this.updateHeader();
    this.loadShellContext();
    this.companyContext.ensureLoaded().subscribe();
    this.contextSub = this.companyContext.state$.subscribe((state) => {
      this.activeCompanyLabel =
        state.context.activeBusinessProfileName ||
        this.businessCenter.getCachedHubAccessState()?.profile?.company_name ||
        state.context.availableCompanies.find((item) => item.id === state.context.activeBusinessProfileId)?.name ||
        state.context.activeBusinessProfileId ||
        'No active company';
      this.activeDepartmentLabel = state.context.activeDepartmentId || 'Company-wide';
      this.activeRoleLabel = state.context.activeMemberRole ? this.toTitleCase(state.context.activeMemberRole) : 'No role';
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateHeader();
        this.loadShellContext();
        this.switcherOpen = false;
        this.profileMenuOpen = false;
      }
    });
  }

  toggleCompanySwitcher(): void {
    this.switcherOpen = !this.switcherOpen;
    if (this.switcherOpen) {
      this.profileMenuOpen = false;
    }
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
    if (this.profileMenuOpen) {
      this.switcherOpen = false;
    }
  }

  logout(): void {
    this.auth.logout();
    this.profileMenuOpen = false;
    this.router.navigateByUrl('/login');
  }

  ngOnDestroy(): void {
    this.contextSub?.unsubscribe();
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.switcherOpen = false;
    this.profileMenuOpen = false;
  }

  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  private updateHeader() {
    const rawPath = this.router.url.replace(/^\/+/, '').split('?')[0];
    const config = getWorkspaceRouteByPath(rawPath);
    this.title = config?.title || 'Wellar';
    this.subtitle = config?.description || 'Operational control center';
  }

  private loadShellContext(): void {
    const state = this.companyContext.snapshot().context;
    this.activeCompanyLabel =
      state.activeBusinessProfileName ||
      this.businessCenter.getCachedHubAccessState()?.profile?.company_name ||
      state.availableCompanies.find((item) => item.id === state.activeBusinessProfileId)?.name ||
      state.activeBusinessProfileId ||
      'No active company';
    this.activeDepartmentLabel = state.activeDepartmentId || 'Company-wide';
    this.activeRoleLabel = state.activeMemberRole ? this.toTitleCase(state.activeMemberRole) : 'No role';
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');
  }
}
