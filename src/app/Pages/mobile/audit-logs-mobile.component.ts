import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { AdminTokenService } from '../../services/admin-token';
import { SubscriptionService } from '../../services/subscription.service';
import { AuditLogs } from '../audit-logs/audit-logs';

@Component({
  selector: 'app-audit-logs-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationsComponent],
  templateUrl: './audit-logs-mobile.html'
})
export class AuditLogsMobileComponent extends AuditLogs {
  hasBusinessAccess = false;

  constructor(
    http: HttpClient,
    adminTokens: AdminTokenService,
    cdr: ChangeDetectorRef,
    private subscriptions: SubscriptionService
  ) {
    super(http, adminTokens, cdr);
  }

  override ngOnInit() {
    super.ngOnInit();
    this.subscriptions.getBusinessAccessSnapshot().subscribe((snapshot) => {
      this.hasBusinessAccess = snapshot.hasBusinessAccess;
    });
  }
}
