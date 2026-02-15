import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { interval, of, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

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
  selectedNotification: NotificationItem | null = null;
  notifications: NotificationItem[] = [];

  private refreshSub?: Subscription;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadNotifications();
    this.refreshSub = interval(30000).subscribe(() => this.loadNotifications());
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
  }

  toggleOpen() {
    this.open = !this.open;
    if (this.open) {
      this.loadNotifications();
    }
  }

  closePanel() {
    this.open = false;
  }

  openDetails(notification: NotificationItem) {
    this.markAsRead(notification);
    this.selectedNotification = notification;
    this.open = false;
  }

  closeDetails() {
    this.selectedNotification = null;
  }

  statusClass(notification: NotificationItem): string {
    const label = this.normalizeLabel(notification.status);
    const type = this.normalizeLabel(notification.type);

    if (type.includes('scan')) {
      if (label.includes('stable')) {
        return 'status-stable';
      }
      if (label.includes('low')) {
        return 'status-low';
      }
      if (label.includes('fatigue')) {
        return 'status-fatigue';
      }
      if (label.includes('risk')) {
        return 'status-risk';
      }
      return 'status-stable';
    }

    if (label.includes('denied') || label.includes('rejected')) {
      return 'status-denied';
    }
    if (label.includes('approved') || label.includes('accepted')) {
      return 'status-approved';
    }
    if (label.includes('delayed') || label.includes('pending')) {
      return 'status-delayed';
    }
    return 'status-delayed';
  }

  private loadNotifications() {
    const token = this.getUserToken();
    const userId = this.getUserId(token);

    if (!token || !userId) {
      this.notifications = [];
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      this.notifications = [];
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.fetchNotifications(headers, userId).subscribe({
      next: (items) => {
        const merged = items
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 100);

        this.notifications = merged;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.notifications = [];
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private fetchNotifications(headers: HttpHeaders, userId: string) {
    const fields = [
      'id',
      'date_created',
      'user',
      'title',
      'body',
      'type',
      'status',
      'link_type',
      'link_id',
      'meta'
    ].join(',');

    const params = new URLSearchParams({
      'sort': '-date_created',
      'limit': '100',
      'fields': fields
    });
    params.set('filter[user][_eq]', userId);

    return this.http.get<{ data?: NotificationRecord[] }>(
      `${environment.API_URL}/items/notifications?${params.toString()}`,
      { headers }
    ).pipe(
      map(res => (res.data ?? []).map((record) => this.mapNotification(record))),
      catchError(() => of([]))
    );
  }

  private mapNotification(record: NotificationRecord): NotificationItem {
    const title = this.formatText(record.title, 'Notification');
    const description = this.formatBody(record.body);
    const status = this.formatText(record.status, 'Unread');
    const type = this.formatText(record.type, 'General');
    const date = this.formatTimestamp(record.date_created ?? '');
    const statusLabel = this.normalizeLabel(status);
    const isRead = statusLabel === 'read';

    return {
      id: record.id ? `notification-${record.id}` : `notification-${record.date_created ?? ''}`,
      sourceId: record.id,
      type,
      title,
      description,
      status,
      date,
      timestamp: this.toMillis(record.date_created),
      isRead,
      details: {
        link_type: record.link_type ?? '',
        link_id: record.link_id ?? '',
        meta: record.meta ?? null
      }
    };
  }

  private normalizeLabel(value?: string): string {
    return (value ?? '').toLowerCase();
  }

  private formatText(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : fallback;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return fallback;
  }

  private formatBody(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return 'You have a new notification.';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'You have a new notification.';
    }
  }

  private formatTimestamp(value: string | number | Date): string {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private toMillis(value?: string | number | Date): number {
    if (!value) {
      return 0;
    }
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token');
    if (!userToken || this.isTokenExpired(userToken)) {
      return null;
    }

    return userToken;
  }

  private getUserId(token: string | null): string | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' && id ? id : null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') {
        return false;
      }
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.isRead).length;
  }

  private markAsRead(notification: NotificationItem) {
    if (notification.isRead) {
      return;
    }

    const token = this.getUserToken();
    const headers = token ? this.buildAuthHeaders(token) : null;
    if (!headers || !notification.sourceId) {
      notification.isRead = true;
      notification.status = 'Read';
      return;
    }

    notification.isRead = true;
    notification.status = 'Read';

    this.http.patch(
      `${environment.API_URL}/items/notifications/${encodeURIComponent(String(notification.sourceId))}`,
      { status: 'Read' },
      { headers }
    ).pipe(
      catchError(() => {
        notification.isRead = false;
        notification.status = 'Unread';
        return of(null);
      })
    ).subscribe();
  }
}

type NotificationItem = {
  id: string;
  sourceId?: string | number;
  type: string;
  title: string;
  description: string;
  status: string;
  date: string;
  timestamp: number;
  isRead: boolean;
  details: Record<string, unknown>;
};

type NotificationRecord = {
  id?: string | number;
  date_created?: string;
  user?: string | number | Record<string, unknown>;
  title?: string;
  body?: unknown;
  type?: string;
  status?: string;
  link_type?: string;
  link_id?: string | number;
  meta?: unknown;
};
