import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs/operators';
import { AdminTokenService } from '../../services/admin-token';
import { NotificationsComponent } from '../../components/notifications/notifications';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-history-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationsComponent],
  templateUrl: './history-mobile.html'
})
export class HistoryMobileComponent implements OnInit {
  private static readonly scanState = {
    stable: 'Stable',
    low: 'Low Focus',
    fatigue: 'Elevated Fatigue',
    risk: 'High Risk'
  } as const;

  scans: HistoryScan[] = [];
  selectedScan: HistoryScan | null = null;

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadHistory();
  }

  openScan(scan: HistoryScan): void {
    this.selectedScan = scan;
    this.cdr.detectChanges();
  }

  closeScan(): void {
    this.selectedScan = null;
    this.cdr.detectChanges();
  }

  private loadHistory() {
    const userToken = this.getUserToken();
    const userId = this.getUserId(userToken);
    const isAdminUser = this.isAdminUser(userToken);
    const filterByUser = true;

    if (!userId) {
      this.applyScans([]);
      return;
    }

    if (!isAdminUser) {
      this.fetchScans(userToken, userId, filterByUser).subscribe({
        next: (scans) => this.applyScans(scans),
        error: (fetchErr) => console.error('[history-mobile] scan_results error:', fetchErr)
      });
      return;
    }

    this.adminTokens.getToken().subscribe({
      next: (adminToken) => {
        const token = adminToken ?? userToken;
        this.fetchScans(token, userId, filterByUser).subscribe({
          next: (scans) => this.applyScans(scans),
          error: (err) => console.error('[history-mobile] scan_results error:', err)
        });
      },
      error: () => {
        this.fetchScans(userToken, userId, filterByUser).subscribe({
          next: (scans) => this.applyScans(scans),
          error: (fetchErr) => console.error('[history-mobile] scan_results error:', fetchErr)
        });
      }
    });
  }

  private fetchScans(token: string | null, userId: string | null, filterByUser: boolean) {
    const headers = this.buildAuthHeaders(token);
    const url = this.buildScanResultsUrl(50, userId, filterByUser);

    return this.http.get<{ data?: ScanResult[] }>(
      url,
      headers ? { headers } : {}
    ).pipe(
      map(res => res.data ?? [])
    );
  }

  private buildScanResultsUrl(limit: number, userId: string | null, filterByUser: boolean): string {
    const base = `${environment.API_URL}/items/scan_results?sort=-date_created&limit=${limit}`;
    if (!filterByUser || !userId) {
      return base;
    }

    const encodedId = encodeURIComponent(userId);
    return `${base}&filter[scan_id][user][_eq]=${encodedId}`;
  }

  private applyScans(scans: ScanResult[]) {
    this.scans = scans.map((scan) => this.mapToHistoryScan(scan));
    this.cdr.detectChanges();
  }

  private mapToHistoryScan(scan: ScanResult): HistoryScan {
    const createdAt = scan.date_created ? new Date(scan.date_created) : null;
    const date = createdAt ? createdAt.toLocaleDateString('en-CA') : '';
    const time = createdAt
      ? createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : '';
    const result = this.coerceState(scan.overall_state);
    const report = scan.explanation ?? scan.medical_report ?? 'No report available';
    const recommendation = scan.medical_report ?? scan.explanation ?? 'No recommendation available';

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

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token');
    if (!userToken || this.isTokenExpired(userToken)) {
      return null;
    }
    return userToken;
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

  private isAdminUser(token: string | null): boolean {
    if (!token || this.isTokenExpired(token)) {
      return false;
    }

    const payload = this.decodeJwtPayload(token);
    return payload?.['admin_access'] === true;
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

  private getUserId(token: string | null): string | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'];
    return typeof id === 'string' && id ? id : null;
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
    if (normalized === 'stable') return HistoryMobileComponent.scanState.stable;
    if (normalized === 'low focus') return HistoryMobileComponent.scanState.low;
    if (normalized === 'elevated fatigue' || normalized === 'fatigue') return HistoryMobileComponent.scanState.fatigue;
    if (normalized === 'high risk') return HistoryMobileComponent.scanState.risk;
    return state ?? 'Unknown';
  }

  private stateToFatigueLevel(state: string): string {
    switch (state) {
      case HistoryMobileComponent.scanState.stable:
        return 'Low';
      case HistoryMobileComponent.scanState.low:
        return 'Moderate';
      case HistoryMobileComponent.scanState.fatigue:
        return 'High';
      case HistoryMobileComponent.scanState.risk:
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

type ScanResult = {
  id?: string;
  date_created?: string;
  overall_state?: string;
  explanation?: string;
  medical_report?: string;
  task_performance_score?: number | string;
  confidence?: number | string;
};

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
