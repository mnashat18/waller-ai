import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { WeeklyChartComponent } from '../../components/weekly-chart/weekly-chart';
import { DashboardService, DashboardStats, ScanResult } from '../../services/dashboard.service';
import { SubscriptionService } from '../../services/subscription.service';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, WeeklyChartComponent],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  loading = false;
  showScanModal = false;
  hasBusinessAccess = false;
  isUserRole = true;
  skeletonCards = [0, 1, 2, 3];

  stats: DashboardStats = {
    stable: 0,
    low_focus: 0,
    fatigue: 0,
    high_risk: 0
  };

  recentScans: ScanResult[] = [];

  constructor(
    private dashboardService: DashboardService,
    private subscriptions: SubscriptionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDashboard();
    this.loadPlanState();
  }

  loadDashboard() {
    this.dashboardService.getDashboardSnapshot(20).subscribe({
      next: (snapshot) => {
        this.recentScans = snapshot.scans;
        this.stats = snapshot.stats;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (fetchErr) => {
        console.error('[dashboard] scan_results error:', fetchErr);
        this.loading = false;
      }
    });
  }

  openScanModal() {
    this.showScanModal = true;
  }

  closeScanModal() {
    this.showScanModal = false;
  }

  private loadPlanState() {
    this.subscriptions.getBusinessAccessSnapshot({ forceRefresh: true }).subscribe((snapshot) => {
      this.hasBusinessAccess = snapshot.hasBusinessAccess;
      this.isUserRole = this.resolveIsUserRole();
      this.cdr.detectChanges();
    });
  }

  private resolveIsUserRole(): boolean {
    const role = this.readRoleHint();
    return role === '' || role === 'user';
  }

  private readRoleHint(): string {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    const storedRoleName = this.pickLowerString(localStorage.getItem('user_role_name'));
    if (storedRoleName) {
      return storedRoleName;
    }

    const payload = this.decodeJwtPayload(this.getSessionToken());
    if (!payload) {
      return '';
    }

    const roleCandidates: unknown[] = [
      payload['member_role'],
      payload['business_role'],
      payload['role_name'],
      payload['role_label'],
      payload['account_type'],
      payload['role']
    ];

    for (const candidate of roleCandidates) {
      const value = this.pickLowerString(candidate);
      if (value) {
        return value;
      }
    }

    return '';
  }

  private getSessionToken(): string {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    const tokenCandidates = [
      localStorage.getItem('token'),
      localStorage.getItem('access_token'),
      localStorage.getItem('directus_token')
    ];

    for (const tokenCandidate of tokenCandidates) {
      const value = this.pickLowerString(tokenCandidate);
      if (value) {
        return tokenCandidate ?? '';
      }
    }

    return '';
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    if (!token) {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private pickLowerString(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      return trimmed;
    }

    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value).toLowerCase();
    }

    return '';
  }

  trackByIndex(index: number): number {
    return index;
  }
}
