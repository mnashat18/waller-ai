import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { NotificationsService, type WorkspaceNotification } from '../../../services/notifications.service';

@Component({
  selector: 'app-global-notifications-panel',
  standalone: true,
  imports: [CommonModule, DatePipe, EmptyStateComponent, StatusBadgeComponent],
  templateUrl: './global-notifications-panel.component.html'
})
export class GlobalNotificationsPanelComponent implements OnInit {
  open = false;
  readonly notificationsState$;

  constructor(
    private notifications: NotificationsService,
    private router: Router
  ) {
    this.notificationsState$ = this.notifications.state$;
  }

  ngOnInit(): void {
    this.notifications.initialize();
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open = !this.open;
    if (this.open) {
      this.notifications.refresh('panel-open');
    }
  }

  refresh(event: MouseEvent): void {
    event.stopPropagation();
    this.notifications.refresh('manual-refresh');
  }

  viewAll(event: MouseEvent): void {
    event.stopPropagation();
  }

  openNotification(item: WorkspaceNotification, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isAlertNotification(item)) {
      this.open = false;
      void this.router.navigate(['/app/alerts'], {
        queryParams: { alert: item.linkId }
      });
    }
  }

  statusLabel(item: WorkspaceNotification): string {
    return this.toDisplayLabel(item.status ?? 'unread');
  }

  iconLabel(item: WorkspaceNotification): string {
    const iconKey = item.iconKey?.trim();
    if (!iconKey) {
      return 'N';
    }
    return iconKey.charAt(0).toUpperCase();
  }

  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  @HostListener('document:click')
  close(): void {
    this.open = false;
  }

  private toDisplayLabel(value: string): string {
    return value
      .trim()
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private isAlertNotification(item: WorkspaceNotification): boolean {
    const linkType = (item.linkType ?? '').trim().toLowerCase();
    return Boolean(item.linkId) && linkType.includes('alert');
  }
}
