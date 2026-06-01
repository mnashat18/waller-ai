import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';

import { DashboardService, ScanResult } from '../../services/dashboard.service';

@Component({
  selector: 'app-history',
  imports: [CommonModule, RouterModule],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History implements OnInit {
  private static readonly scanState = {
    stable: 'Stable',
    low: 'Low Focus',
    fatigue: 'Elevated Fatigue',
    risk: 'High Risk'
  } as const;

  scans: HistoryScan[] = [];
  selectedScan: HistoryScan | null = null;

  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.dashboardService.getScanResults(50).subscribe((scans) => {
      this.scans = scans.map((scan) => this.mapToHistoryScan(scan));
      this.cdr.detectChanges();
    });
  }

  openScan(scan: HistoryScan): void {
    this.selectedScan = scan;
    this.cdr.detectChanges();
  }

  closeScan(): void {
    this.selectedScan = null;
    this.cdr.detectChanges();
  }

  private mapToHistoryScan(scan: ScanResult): HistoryScan {
    const createdAt = scan.date_created ? new Date(scan.date_created) : null;
    const date = createdAt ? createdAt.toLocaleDateString('en-CA') : '';
    const time = createdAt
      ? createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '';
    const result = this.coerceState(scan.overall_state);
      const report = scan.explanation ?? 'No readiness summary available';
      const recommendation = scan.explanation ?? 'No next-step guidance available';

    return {
      id: scan.id ?? '',
      date,
      time,
      result,
      report,
      recommendation,
      fatigueLevel: this.stateToFatigueLevel(result),
      focusScore: this.formatFocusScore(scan)
    };
  }

  private normalizeState(state?: string): string {
    return (state ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private coerceState(state?: string): string {
    const normalized = this.normalizeState(state);
    if (normalized === 'stable') {
      return History.scanState.stable;
    }
    if (normalized === 'low focus') {
      return History.scanState.low;
    }
    if (normalized === 'elevated fatigue' || normalized === 'fatigue') {
      return History.scanState.fatigue;
    }
    if (normalized === 'high risk') {
      return History.scanState.risk;
    }
    return state ?? 'Unknown';
  }

  private stateToFatigueLevel(state: string): string {
    switch (state) {
      case History.scanState.stable:
        return 'Low';
      case History.scanState.low:
        return 'Moderate';
      case History.scanState.fatigue:
        return 'High';
      case History.scanState.risk:
        return 'Critical';
      default:
        return 'Unknown';
    }
  }

  private formatFocusScore(scan: ScanResult): string {
    const taskScore = this.toNumber(scan.task_performance_score);
    if (taskScore !== null) {
      return `${Math.round(taskScore)}`;
    }

    const confidence = this.toNumber(scan.confidence);
    if (confidence !== null) {
      const normalized = confidence <= 1 ? confidence * 100 : confidence;
      return `${Math.round(normalized)}`;
    }

    return 'N/A';
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}

type HistoryScan = {
  id: string;
  date: string;
  time: string;
  result: string;
  report: string;
  recommendation: string;
  fatigueLevel: string;
  focusScore: string;
};
