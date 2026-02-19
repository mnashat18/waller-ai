import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { DashboardService, DashboardSnapshot, DashboardStats, ScanResult } from '../../services/dashboard.service';
import { SubscriptionService } from '../../services/subscription.service';
import { of } from 'rxjs';
import { catchError, delay, finalize, timeout } from 'rxjs/operators';

@Component({
  imports: [CommonModule, RouterModule, NotificationsComponent],
  selector: 'app-dashboard-mobile',
  standalone: true,
  templateUrl: './dashboard-mobile.html'
})
export class DashboardMobileComponent implements OnInit {
  loading = false;
  refreshing = false;
  stats: DashboardStats = {
    stable: 0,
    low_focus: 0,
    fatigue: 0,
    high_risk: 0
  };
  recentScans: ScanResult[] = [];
  totalScans = 0;
  latestStateLabel = 'Unknown';
  latestStateKey: ScanResult['overall_state_key'] = 'unknown';
  barHeights = {
    stable: 6,
    low_focus: 6,
    fatigue: 6,
    high_risk: 6
  };
  hasBusinessAccess = false;
  planLabel = 'Free';

  private readonly cacheKey = 'dashboard_snapshot_v1';
  private readonly cacheTsKey = 'dashboard_snapshot_ts';
  private readonly cacheTtlMs = 1000 * 60 * 15;

  constructor(
    private dashboardService: DashboardService,
    private subscriptions: SubscriptionService
  ) {}

  ngOnInit() {
    const cached = this.readCachedSnapshot();
    if (cached) {
      this.applySnapshot(cached);
    }
    this.loadDashboard(!cached);
    this.loadPlanState();
  }

  private loadDashboard(showLoading: boolean) {
    this.loading = showLoading;
    this.refreshing = true;
    this.dashboardService.getDashboardSnapshot(20).pipe(
      delay(0),
      timeout(8000),
      catchError((err) => {
        console.error('[dashboard-mobile] scan_results error:', err);
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
        this.refreshing = false;
      })
    ).subscribe((snapshot) => {
      if (snapshot) {
        this.applySnapshot(snapshot);
        this.storeCachedSnapshot(snapshot);
      }
    });
  }

  private applySnapshot(snapshot: DashboardSnapshot) {
    this.recentScans = snapshot.scans;
    this.stats = snapshot.stats;
    this.totalScans = Object.values(snapshot.stats).reduce((sum, value) => sum + value, 0);
    this.latestStateLabel = snapshot.latest?.overall_state_label
      ?? snapshot.latest?.overall_state
      ?? 'Unknown';
    this.latestStateKey = snapshot.latest?.overall_state_key ?? 'unknown';
    this.barHeights = this.buildBarHeights(snapshot.stats);
  }

  private buildBarHeights(stats: DashboardStats) {
    const values = [stats.stable, stats.low_focus, stats.fatigue, stats.high_risk];
    const max = Math.max(...values, 1);
    const scale = 72;

    return {
      stable: Math.max(6, Math.round((stats.stable / max) * scale)),
      low_focus: Math.max(6, Math.round((stats.low_focus / max) * scale)),
      fatigue: Math.max(6, Math.round((stats.fatigue / max) * scale)),
      high_risk: Math.max(6, Math.round((stats.high_risk / max) * scale))
    };
  }

  private readCachedSnapshot(): DashboardSnapshot | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const ts = localStorage.getItem(this.cacheTsKey);
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) {
        return null;
      }
      if (ts) {
        const age = Date.now() - Number(ts);
        if (!Number.isNaN(age) && age > this.cacheTtlMs) {
          return null;
        }
      }
      return JSON.parse(raw) as DashboardSnapshot;
    } catch {
      return null;
    }
  }

  private storeCachedSnapshot(snapshot: DashboardSnapshot) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(snapshot));
      localStorage.setItem(this.cacheTsKey, String(Date.now()));
    } catch {
      // Ignore cache write errors
    }
  }

  private loadPlanState() {
    this.subscriptions.getBusinessAccessSnapshot().subscribe((snapshot) => {
      this.hasBusinessAccess = snapshot.hasBusinessAccess;
      this.planLabel = snapshot.hasBusinessAccess ? 'Business' : 'Free';
    });
  }
}
