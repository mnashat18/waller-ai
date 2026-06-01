import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { InviteService } from '../../services/invites';
import {
  OperationalDashboardService,
  type DashboardAlertItem,
  type DashboardAttentionItem,
  type DashboardDepartmentCompliance,
  type DashboardKpiCardData,
  type DashboardReadinessBucket,
  type DashboardRequestItem,
  type DashboardScanActivityItem,
  type OperationalDashboardViewModel
} from '../../services/operational-dashboard.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { RiskBadgeComponent } from '../../shared/ui/risk-badge/risk-badge.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DashboardSectionComponent,
    KpiCardComponent,
    RiskBadgeComponent,
    StatusBadgeComponent,
    CardSkeletonLoaderComponent,
    ErrorStateComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  loading = true;
  state: 'loadingContext' | 'loadingDashboard' | 'ready' | 'error' = 'loadingContext';
  errorMessage = '';
  view: OperationalDashboardViewModel | null = null;
  activeMembership: any = null;
  activeBusinessProfile: any = null;
  activeMemberRole: string | null = null;

  constructor(
    private dashboardService: OperationalDashboardService,
    private workspaceContext: CompanyContextService,
    private postLoginRouting: PostLoginRoutingService,
    private invites: InviteService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.bootstrap();
  }

  refresh(): void {
    void this.bootstrap();
  }

  trackByKpi(index: number, item: DashboardKpiCardData): string {
    return `${index}-${item.label}`;
  }

  trackByAttention(index: number, item: DashboardAttentionItem): string {
    return `${index}-${item.id}`;
  }

  trackByBucket(index: number, item: DashboardReadinessBucket): string {
    return `${index}-${item.key}`;
  }

  trackByDepartment(index: number, item: DashboardDepartmentCompliance): string {
    return `${index}-${item.id}`;
  }

  trackByScan(index: number, item: DashboardScanActivityItem): string {
    return `${index}-${item.id}`;
  }

  trackByAlert(index: number, item: DashboardAlertItem): string {
    return `${index}-${item.id}`;
  }

  trackByRequest(index: number, item: DashboardRequestItem): string {
    return `${index}-${item.id}`;
  }

  private async bootstrap(): Promise<void> {
    try {
      this.state = 'loadingContext';
      this.loading = true;
      this.errorMessage = '';
      this.view = null;

      const context = await this.resolveDashboardContext();

      console.log('[Dashboard] context result', context);

      if (!context?.activeMembership?.id || !context?.activeBusinessProfile?.id) {
        const inviteFlowDetected = this.hasInviteClaimSignal();
        if (inviteFlowDetected) {
          this.state = 'error';
          this.errorMessage = 'Invite accepted, but workspace context could not be loaded.';
          return;
        }

        console.warn('[Dashboard] missing context, redirecting to workspace access');
        await this.router.navigateByUrl('/app/workspace-access', { replaceUrl: true });
        return;
      }

      this.activeMembership = context.activeMembership;
      this.activeBusinessProfile = context.activeBusinessProfile;
      this.activeMemberRole = context.activeMemberRole;

      this.state = 'loadingDashboard';

      await this.loadDashboardData(context.activeBusinessProfile.id);

      this.state = 'ready';
    } catch (error) {
      console.error('[Dashboard] failed to load', error);
      this.state = 'error';
      this.errorMessage = 'Dashboard failed to load.';
    } finally {
      this.loading = this.state !== 'ready' && this.state !== 'error';
      this.cdr.detectChanges();
    }
  }

  private loadDashboardData(_businessProfileId: string): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.view = null;

    return new Promise((resolve, reject) => {
      this.dashboardService.getDashboardData(_businessProfileId).pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: (view) => {
          this.view = view;
          resolve();
        },
        error: (error) => {
          this.errorMessage = error?.message || 'Failed to load dashboard data.';
          reject(error);
        }
      });
    });
  }

  private async resolveDashboardContext(): Promise<{
    activeMembership: any;
    activeBusinessProfile: any;
    activeMemberRole: string;
  } | null> {
    const inviteFlowDetected = this.hasInviteClaimSignal();
    const maxAttempts = inviteFlowDetected ? 3 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const context = await Promise.race([
        this.workspaceContext.ensureActiveContext(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
      ]);

      if (context?.activeMembership?.id && context?.activeBusinessProfile?.id) {
        return context;
      }

      if (!inviteFlowDetected || attempt >= maxAttempts - 1) {
        return context;
      }

      try {
        await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true });
      } catch {
        // Keep retrying with best-effort context restore.
      }
    }

    return null;
  }

  private hasInviteClaimSignal(): boolean {
    if (this.invites.hasClaimCompleted()) {
      return true;
    }

    const pendingToken = this.invites.getPendingInviteToken();
    if (pendingToken) {
      return true;
    }

    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const prefix = 'invite_claim_success_';
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(prefix)) {
          continue;
        }

        if (localStorage.getItem(key) === 'true') {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }
}
