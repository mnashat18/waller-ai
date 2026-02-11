import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { DashboardService, DashboardSnapshot, DashboardStats, ScanResult } from '../../services/dashboard.service';

@Component({
  imports: [CommonModule, RouterModule, NotificationsComponent],
  selector: 'app-dashboard-mobile',
  standalone: true,
  templateUrl: './dashboard-mobile.html'
})
export class DashboardMobileComponent implements OnInit {
  loading = false;
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

  constructor(private dashboardService: DashboardService) {}

  ngOnInit() {
    this.loadDashboard();
  }

  private loadDashboard() {
    this.loading = true;
    this.dashboardService.getDashboardSnapshot(20).subscribe({
      next: (snapshot) => this.applySnapshot(snapshot),
      error: (err) => {
        console.error('[dashboard-mobile] scan_results error:', err);
        this.loading = false;
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
    this.loading = false;
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
}
