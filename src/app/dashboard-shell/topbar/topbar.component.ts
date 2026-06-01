import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { map } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { NotificationsService } from '../../services/notifications.service';
import { GlobalNotificationsPanelComponent } from '../../shared/ui/global-notifications-panel/global-notifications-panel.component';
import { CompanyContextChipComponent } from '../../shared/ui/company-context-chip/company-context-chip.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [
    CommonModule,
    GlobalNotificationsPanelComponent,
    CompanyContextChipComponent,
    EmptyStateComponent,
    RoleBadgeComponent
  ],
  templateUrl: './topbar.component.html'
})
export class TopbarComponent implements OnInit {
  readonly state$;

  companyMenuOpen = false;
  userMenuOpen = false;
  switchingCompanyId: string | null = null;
  refreshingContext = false;

  constructor(
    private companyContext: CompanyContextService,
    private auth: AuthService,
    private notifications: NotificationsService,
    private router: Router
  ) {
    this.state$ = combineLatest({
      state: this.companyContext.state$,
      activeMembership: this.companyContext.activeMembership$,
      activeBusinessProfile: this.companyContext.activeBusinessProfile$,
      activeMemberRole: this.companyContext.activeMemberRole$
    }).pipe(
      map(({ state, activeMembership, activeBusinessProfile, activeMemberRole }) => {
        const mergedContext = {
          ...state.context,
          activeBusinessProfileId: activeBusinessProfile?.id ?? state.context.activeBusinessProfileId,
          activeBusinessProfileName:
            activeBusinessProfile?.company_name ?? state.context.activeBusinessProfileName,
          activeMemberRole:
            activeMemberRole ??
            (activeMembership?.member_role ? (String(activeMembership.member_role).toLowerCase() as any) : state.context.activeMemberRole)
        };

        const email = this.resolveDisplayEmail(mergedContext.currentUser?.email, mergedContext.userEmail);
        const displayName = this.resolveDisplayName(
          mergedContext.currentUser?.first_name,
          mergedContext.currentUser?.last_name,
          email
        );
        const sessionLabel = !mergedContext.authInitialized
          ? 'Loading session...'
          : !mergedContext.isAuthenticated
            ? 'Signed out'
            : displayName;
        const sessionSubLabel = !mergedContext.authInitialized
          ? 'Loading session...'
          : !mergedContext.isAuthenticated
            ? 'Signed out'
            : email ?? 'No email available';

        return {
          ...state,
          context: mergedContext,
          ui: {
            sessionLabel,
            sessionSubLabel,
            showSignedOut: mergedContext.authInitialized && !mergedContext.isAuthenticated,
            showSessionLoading: !mergedContext.authInitialized,
            showWorkspaceLoading: !mergedContext.workspaceInitialized,
            hasActiveWorkspace: Boolean(mergedContext.activeBusinessProfileId)
          }
        };
      })
    );
  }

  ngOnInit(): void {
    void this.companyContext.initializeAppContext();
    this.notifications.initialize();
  }

  toggleCompanyMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.companyMenuOpen = !this.companyMenuOpen;
    this.userMenuOpen = false;
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
    this.companyMenuOpen = false;
  }

  refreshContext(): void {
    this.refreshingContext = true;
    void this.companyContext.initializeAppContext(true).finally(() => {
      this.refreshingContext = false;
      this.notifications.refresh('context-refresh');
    });
  }

  switchCompany(companyId: string): void {
    this.switchingCompanyId = companyId;
    this.companyContext.switchCompany(companyId).pipe(
      finalize(() => {
        this.switchingCompanyId = null;
        this.companyMenuOpen = false;
      })
    ).subscribe({
      next: () => {
        if (typeof window !== 'undefined') {
          window.location.assign('/app/dashboard');
          return;
        }
        this.router.navigateByUrl('/app/dashboard');
      }
    });
  }

  clearDepartmentScope(): void {
    this.companyContext.clearDepartmentScope().subscribe({
      next: () => {
        this.companyMenuOpen = false;
        if (typeof window !== 'undefined') {
          window.location.assign('/app/dashboard');
          return;
        }
        this.router.navigateByUrl('/app/dashboard');
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.userMenuOpen = false;
    this.router.navigateByUrl('/login');
  }

  goToWorkspaceAccess(): void {
    this.companyMenuOpen = false;
    this.router.navigateByUrl('/app/workspace-access');
  }

  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  private resolveDisplayName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    email: string | null | undefined
  ): string {
    const fullName = [firstName, lastName]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fullName) {
      return fullName;
    }
    if (email?.trim()) {
      return email.trim();
    }
    return 'User';
  }

  private resolveDisplayEmail(
    currentUserEmail: string | null | undefined,
    contextEmail: string | null | undefined
  ): string | null {
    const normalizedCurrentUserEmail = currentUserEmail?.trim() ?? '';
    if (normalizedCurrentUserEmail) {
      return normalizedCurrentUserEmail;
    }

    const normalizedContextEmail = contextEmail?.trim() ?? '';
    if (normalizedContextEmail) {
      return normalizedContextEmail;
    }

    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedEmail = localStorage.getItem('user_email')?.trim() ?? '';
    return storedEmail || null;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.companyMenuOpen = false;
    this.userMenuOpen = false;
  }
}
