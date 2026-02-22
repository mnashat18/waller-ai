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
      this.cdr.detectChanges();
    });
  }

  trackByIndex(index: number): number {
    return index;
  }
}
