import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { RouterModule } from '@angular/router';
import { WeeklyChartComponent } from '../../components/weekly-chart/weekly-chart';
import { AdminTokenService } from '../../services/admin-token';
import { environment } from 'src/environments/environment';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, WeeklyChartComponent],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  private static readonly stateKeys = {
    stable: 'stable',
    lowFocus: 'low_focus',
    fatigue: 'fatigue',
    highRisk: 'high_risk',
    unknown: 'unknown'
  } as const;

  private static readonly scanState = {
    stable: 'Stable',
    low: 'Low Focus',
    fatigue: 'Elevated Fatigue',
    risk: 'High Risk'
  } as const;

  loading = false;
  showScanModal = false;

  stats = {
    stable: 0,
    low_focus: 0,
    fatigue: 0,
    high_risk: 0
  };

  recentScans: ScanResult[] = [];

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDashboard();
  }

  loadDashboard() {
    const userToken = this.getUserToken();
    const userId = this.getUserId(userToken);
    const isAdminUser = this.isAdminUser(userToken);
    const filterByUser = true;

    if (!userId) {
      console.warn('[dashboard] missing user id; skipping scan_results fetch');
      this.applyScans([]);
      return;
    }

    if (!isAdminUser) {
      const tokenSource = userToken ? 'user' : 'none';
      console.info('[dashboard] using token source:', tokenSource);

      this.fetchScans(userToken, userId, filterByUser).subscribe({
        next: (scans) => {
          console.info('[dashboard] scan_results count:', scans.length);
          this.applyScans(scans);
        },
        error: (fetchErr) => {
          console.error('[dashboard] scan_results error:', fetchErr);
          this.loading = false;
        }
      });
      return;
    }

    this.adminTokens.getToken().subscribe({
      next: (adminToken) => {
        const token = adminToken ?? userToken;
        const tokenSource = adminToken ? 'admin' : userToken ? 'user' : 'none';
        console.info('[dashboard] using token source:', tokenSource);

        this.fetchScans(token, userId, filterByUser).subscribe({
          next: (scans) => {
            console.info('[dashboard] scan_results count:', scans.length);
            this.applyScans(scans);
          },
          error: (err) => {
            console.error('[dashboard] scan_results error:', err);
            this.loading = false;
          }
        });
      },
      error: (err) => {
        console.error('[dashboard] admin token error:', err);
        const tokenSource = userToken ? 'user' : 'none';
        console.info('[dashboard] using token source:', tokenSource);

        this.fetchScans(userToken, userId, filterByUser).subscribe({
          next: (scans) => {
            console.info('[dashboard] scan_results count:', scans.length);
            this.applyScans(scans);
          },
          error: (fetchErr) => {
            console.error('[dashboard] scan_results error:', fetchErr);
            this.loading = false;
          }
        });
      }
    });
  }

  private fetchScans(token: string | null, userId: string | null, filterByUser: boolean) {
    const headers = this.buildAuthHeaders(token);
    const url = this.buildScanResultsUrl(20, userId, filterByUser);

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
    const normalizedScans = scans.map((scan) => ({
      ...scan,
      overall_state_key: this.toStateKey(scan.overall_state),
      overall_state_label: this.toDisplayState(scan.overall_state)
    }));

    this.recentScans = normalizedScans;
    this.stats = {
      stable: normalizedScans.filter((s) => s.overall_state_key === Dashboard.stateKeys.stable).length,
      low_focus: normalizedScans.filter((s) => s.overall_state_key === Dashboard.stateKeys.lowFocus).length,
      fatigue: normalizedScans.filter((s) => s.overall_state_key === Dashboard.stateKeys.fatigue).length,
      high_risk: normalizedScans.filter((s) => s.overall_state_key === Dashboard.stateKeys.highRisk).length
    };
    this.loading = false;
    this.cdr.detectChanges();
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
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

  private toStateKey(state?: string) {
    const normalized = this.normalizeState(state);
    if (normalized === 'stable') {
      return Dashboard.stateKeys.stable;
    }
    if (normalized === 'low focus') {
      return Dashboard.stateKeys.lowFocus;
    }
    if (normalized === 'elevated fatigue' || normalized === 'fatigue') {
      return Dashboard.stateKeys.fatigue;
    }
    if (normalized === 'high risk') {
      return Dashboard.stateKeys.highRisk;
    }
    return Dashboard.stateKeys.unknown;
  }

  private toDisplayState(state?: string): string {
    const key = this.toStateKey(state);
    if (key === Dashboard.stateKeys.stable) {
      return Dashboard.scanState.stable;
    }
    if (key === Dashboard.stateKeys.lowFocus) {
      return Dashboard.scanState.low;
    }
    if (key === Dashboard.stateKeys.fatigue) {
      return Dashboard.scanState.fatigue;
    }
    if (key === Dashboard.stateKeys.highRisk) {
      return Dashboard.scanState.risk;
    }
    return (state ?? '').trim() || 'Unknown';
  }

  openScanModal() {
    this.showScanModal = true;
  }

  closeScanModal() {
    this.showScanModal = false;
  }
}

type ScanResult = {
medical_report: any;
date_created: string|number|Date;
  overall_state?: string;
  overall_state_label?: string;
  overall_state_key?: 'stable' | 'low_focus' | 'fatigue' | 'high_risk' | 'unknown';
};
