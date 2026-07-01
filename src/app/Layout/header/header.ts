import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription as RxSubscription } from 'rxjs';

import { getWorkspaceRouteByPath } from '../../ia/wellar-ia';
import { GlobalNotificationsPanelComponent } from '../../shared/ui/global-notifications-panel/global-notifications-panel.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, GlobalNotificationsPanelComponent],
  templateUrl: './header.html'
})
export class HeaderComponent implements OnDestroy {
  title = 'Wellar';
  subtitle = 'Operational control center';

  private routeSub?: RxSubscription;

  constructor(private router: Router) {
    this.updateHeader();
    this.routeSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateHeader();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private updateHeader() {
    const rawPath = this.router.url.replace(/^\/+/, '').split('?')[0];
    const config = getWorkspaceRouteByPath(rawPath);
    this.title = config?.title || 'Wellar';
    this.subtitle = config?.description || 'Operational control center';
  }
}
