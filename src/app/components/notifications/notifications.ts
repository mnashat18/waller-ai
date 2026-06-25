import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  NotificationsService,
  type WorkspaceNotification
} from '../../services/notifications.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css'
})
export class NotificationsComponent implements OnInit, OnDestroy {
  open = false;
  loading = false;
  errorMessage = '';
  notifications: NotificationItem[] = [];
  unreadCount = 0;
  selectedNotification: NotificationItem | null = null;

  private stateSub?: Subscription;

  constructor(
    private notificationsService: NotificationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.notificationsService.initialize();
    this.stateSub = this.notificationsService.state$.subscribe((state) => {
      this.loading = state.loading;
      this.errorMessage = state.error ?? '';
      this.unreadCount = state.unreadCount;
      this.notifications = (state.recentNotifications ?? []).map((row) => this.mapItem(row));
    });
    this.notificationsService.refresh('component-init');
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
  }

  toggleOpen(): void {
    this.open = !this.open;
    if (this.open) {
      this.notificationsService.refresh('panel-open');
    }
  }

  closePanel(): void {
    this.open = false;
  }

  refresh(): void {
    this.notificationsService.refresh('panel-refresh');
  }

  viewAll(): void {
    this.open = false;
    void this.router.navigateByUrl('/app/activity');
  }

  openDetails(notification: NotificationItem): void {
    if (this.isAlertNotification(notification)) {
      this.open = false;
      void this.router.navigate(['/app/alerts'], {
        queryParams: { alert: notification.linkId }
      });
      return;
    }
    this.selectedNotification = notification;
    this.open = false;
  }

  closeDetails(): void {
    this.selectedNotification = null;
  }

  isUnread(notification: NotificationItem): boolean {
    const status = this.normalize(notification.status);
    return status === 'new' || status === 'unread' || status === 'open' || status === '';
  }

  relativeTime(notification: NotificationItem): string {
    if (!notification.dateCreated) {
      return 'Just now';
    }

    const timestamp = new Date(notification.dateCreated).getTime();
    if (!Number.isFinite(timestamp)) {
      return 'Just now';
    }

    const diffSeconds = Math.max(Math.floor((Date.now() - timestamp) / 1000), 0);
    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(new Date(timestamp));
  }

  private mapItem(row: WorkspaceNotification): NotificationItem {
    return {
      id: row.id,
      title: row.title || 'Notification',
      message: row.message || 'No additional details.',
      status: row.status || 'new',
      dateCreated: row.dateCreated,
      iconKey: row.iconKey || 'general',
      linkType: row.linkType,
      linkId: row.linkId
    };
  }

  private isAlertNotification(notification: NotificationItem): boolean {
    const linkType = this.normalize(notification.linkType);
    return Boolean(notification.linkId) && linkType.includes('alert');
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }
}

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  status: string;
  dateCreated: string | null;
  iconKey: string;
  linkType: string | null;
  linkId: string | null;
};
