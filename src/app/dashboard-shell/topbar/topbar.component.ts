import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { NotificationsService } from '../../services/notifications.service';
import { GlobalNotificationsPanelComponent } from '../../shared/ui/global-notifications-panel/global-notifications-panel.component';
import { RoleBadgeComponent } from '../../shared/ui/role-badge/role-badge.component';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [
    CommonModule,
    GlobalNotificationsPanelComponent,
    RoleBadgeComponent
  ],
  templateUrl: './topbar.component.html'
})
export class TopbarComponent implements OnInit {
  readonly state$;

  userMenuOpen = false;
  private routerNavigationSubscription?: Subscription;

  constructor(
    private companyContext: CompanyContextService,
    private auth: AuthService,
    private notifications: NotificationsService,
    private router: Router
  ) {
    this.state$ = this.companyContext.state$.pipe(
      map((state) => {
        const email = this.resolveDisplayEmail(state.context.currentUser?.email, state.context.userEmail);
        const displayName = this.resolveDisplayName(
          state.context.currentUser?.first_name,
          state.context.currentUser?.last_name,
          email
        );
        const sessionLabel = !state.context.authInitialized
          ? 'Loading session...'
          : !state.context.isAuthenticated
            ? 'Signed out'
            : displayName;
        const sessionSubLabel = !state.context.authInitialized
          ? 'Loading session...'
          : !state.context.isAuthenticated
            ? 'Signed out'
            : email ?? 'No email available';

        return {
          ...state,
          ui: {
            sessionLabel,
            sessionSubLabel,
            showSignedOut: state.context.authInitialized && !state.context.isAuthenticated,
            showSessionLoading: !state.context.authInitialized
          }
        };
      })
    );
  }

  ngOnInit(): void {
    void this.companyContext.initializeAppContext();
    this.notifications.initialize();
    this.routerNavigationSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart || event instanceof NavigationEnd) {
        this.userMenuOpen = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.routerNavigationSubscription?.unsubscribe();
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
  }

  logout(): void {
    this.auth.logout();
    this.userMenuOpen = false;
    this.router.navigateByUrl('/');
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
    this.userMenuOpen = false;
  }
}
