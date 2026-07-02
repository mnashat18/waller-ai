import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { CompanyContextService } from '../../../core/context/company-context.service';
import { InviteService, type WorkspaceInviteDetail } from '../../../services/invites';
import { NotificationsService, type WorkspaceNotification } from '../../../services/notifications.service';

@Component({
  selector: 'app-global-notifications-panel',
  standalone: true,
  imports: [CommonModule, DatePipe, EmptyStateComponent, StatusBadgeComponent],
  templateUrl: './global-notifications-panel.component.html'
})
export class GlobalNotificationsPanelComponent implements OnInit {
  open = false;
  detailOpen = false;
  detailLoading = false;
  detailError = '';
  detailMessage = '';
  detailActionInFlight = false;
  selectedNotification: WorkspaceNotification | null = null;
  selectedInvite: WorkspaceInviteDetail | null = null;
  readonly notificationsState$;

  constructor(
    private notifications: NotificationsService,
    private inviteService: InviteService,
    private companyContext: CompanyContextService,
    private router: Router
  ) {
    this.notificationsState$ = this.notifications.state$;
  }

  ngOnInit(): void {
    this.notifications.initialize();
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.closeDetail();
    this.open = !this.open;
    if (this.open) {
      this.notifications.refresh('panel-open');
    }
  }

  openNotification(item: WorkspaceNotification, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isAlertNotification(item)) {
      this.closeDetail();
      this.open = false;
      void this.router.navigate(['/app/alerts'], {
        queryParams: { alert: item.linkId }
      });
      return;
    }

    this.open = false;
    this.detailOpen = true;
    this.selectedNotification = item;
    this.selectedInvite = null;
    this.detailError = '';
    this.detailMessage = '';
    this.detailLoading = this.isInviteNotification(item);

    if (this.isInviteNotification(item) && item.linkId) {
      this.inviteService.getInvite(item.linkId).subscribe({
        next: (invite) => {
          this.selectedInvite = invite;
          this.detailLoading = false;
          this.detailError = '';
        },
        error: (error) => {
          this.detailLoading = false;
          this.detailError = this.inviteService.getReadableInviteError(error);
        }
      });
      return;
    }

    this.detailLoading = false;
  }

  acceptInvite(): void {
    if (!this.selectedInvite?.canAct || this.detailActionInFlight) {
      return;
    }

    this.runInviteAction('accept');
  }

  declineInvite(): void {
    if (!this.selectedInvite?.canAct || this.detailActionInFlight) {
      return;
    }

    this.runInviteAction('decline');
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
    this.closeDetail();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close();
  }

  closeDetail(): void {
    this.detailOpen = false;
    this.detailLoading = false;
    this.detailError = '';
    this.detailMessage = '';
    this.detailActionInFlight = false;
    this.selectedNotification = null;
    this.selectedInvite = null;
  }

  inviteActionLabel(): string {
    if (!this.selectedInvite) {
      return '';
    }

    const role = this.toDisplayLabel(this.selectedInvite.memberRole);
    const department = this.selectedInvite.departmentName?.trim();
    return department ? `${role} · ${department}` : role;
  }

  isInviteActionable(): boolean {
    return Boolean(this.selectedInvite?.canAct && !this.detailActionInFlight);
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

  private isInviteNotification(item: WorkspaceNotification): boolean {
    const linkType = (item.linkType ?? '').trim().toLowerCase();
    return Boolean(item.linkId) && linkType.includes('invite');
  }

  private runInviteAction(action: 'accept' | 'decline'): void {
    const invite = this.selectedInvite;
    if (!invite?.id) {
      return;
    }

    this.detailActionInFlight = true;
    this.detailError = '';
    this.detailMessage = '';

    const request$ = action === 'accept'
      ? this.inviteService.acceptInvite(invite.id)
      : this.inviteService.declineInvite(invite.id);

    request$.subscribe({
      next: async (result) => {
        this.detailActionInFlight = false;
        if (!result.ok) {
          this.detailError = result.message;
          return;
        }

        this.selectedInvite = {
          ...invite,
          status: result.status ?? (action === 'accept' ? 'claimed' : 'revoked'),
          canAct: false
        };
        this.detailMessage = result.message;
        this.notifications.refresh('invite-action');

        try {
          await firstValueFrom(this.companyContext.ensureLoaded(true));
        } catch {
          // Keep the success state visible even if the refresh is not available.
        }
      },
      error: (error) => {
        this.detailActionInFlight = false;
        this.detailError = this.inviteService.getReadableInviteError(error);
      }
    });
  }
}
