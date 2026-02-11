import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { WeeklyChartComponent } from '../../components/weekly-chart/weekly-chart';
import { DashboardService, DashboardStats, ScanResult } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, WeeklyChartComponent],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  loading = false;
  showScanModal = false;

  stats: DashboardStats = {
    stable: 0,
    low_focus: 0,
    fatigue: 0,
    high_risk: 0
  };

  recentScans: ScanResult[] = [];

  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDashboard();
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
}
