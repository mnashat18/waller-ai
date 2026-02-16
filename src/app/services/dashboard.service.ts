import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { AdminTokenService } from './admin-token';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

export type ScanResult = {
  medical_report: any;
  date_created: string | number | Date;
  overall_state?: string;
  overall_state_label?: string;
  overall_state_key?: 'stable' | 'low_focus' | 'fatigue' | 'high_risk' | 'unknown';
};

export type DashboardStats = {
  stable: number;
  low_focus: number;
  fatigue: number;
  high_risk: number;
};

export type DashboardSnapshot = {
  scans: ScanResult[];
  stats: DashboardStats;
  latest: ScanResult | null;
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
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

  api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private adminTokens: AdminTokenService
  ) {}

  getDashboardSnapshot(limit = 20, filterByUser = true): Observable<DashboardSnapshot> {
    return this.getRecentScans(limit, filterByUser).pipe(
      map((scans) => ({
        scans,
        stats: this.buildStats(scans),
        latest: scans[0] ?? null
      }))
    );
  }

  getRecentScans(limit = 20, filterByUser = true): Observable<ScanResult[]> {
    const userToken = this.getUserToken();
    const userId = this.getUserId(userToken);

    if (filterByUser && !userId) {
      return of([]);
    }

    if (!this.isAdminUser(userToken)) {
      return this.fetchScans(limit, userToken, userId, filterByUser);
    }

    return this.adminTokens.getToken().pipe(
      catchError((err) => {
        console.error('[dashboard] admin token error:', err);
        return of(null);
      }),
      switchMap((adminToken) => {
        const token = adminToken ?? userToken;
        return this.fetchScans(limit, token, userId, filterByUser);
      })
    );
  }

  getScanResults(limit = 20) {
    return this.fetchScans(limit, this.getUserToken(), this.getUserId(this.getUserToken()), false);
  }

  private fetchScans(limit: number, token: string | null, userId: string | null, filterByUser: boolean) {
    const headers = this.buildAuthHeaders(token);
    const url = this.buildScanResultsUrl(limit, userId, filterByUser);

    return this.http.get<{ data?: ScanResult[] }>(
      url,
      headers ? { headers } : {}
    ).pipe(
      map(res => this.normalizeScans(res.data ?? []))
    );
  }

  private buildScanResultsUrl(limit: number, userId: string | null, filterByUser: boolean): string {
    const base = `${this.api}/items/scan_results?sort=-date_created&limit=${limit}`;
    if (!filterByUser || !userId) {
      return base;
    }

    const encodedId = encodeURIComponent(userId);
    return `${base}&filter[scan_id][user][_eq]=${encodedId}`;
  }

  private buildStats(scans: ScanResult[]): DashboardStats {
    return {
      stable: scans.filter((s) => s.overall_state_key === DashboardService.stateKeys.stable).length,
      low_focus: scans.filter((s) => s.overall_state_key === DashboardService.stateKeys.lowFocus).length,
      fatigue: scans.filter((s) => s.overall_state_key === DashboardService.stateKeys.fatigue).length,
      high_risk: scans.filter((s) => s.overall_state_key === DashboardService.stateKeys.highRisk).length
    };
  }

  private normalizeScans(scans: ScanResult[]) {
    return scans.map((scan) => ({
      ...scan,
      overall_state_key: this.toStateKey(scan.overall_state),
      overall_state_label: this.toDisplayState(scan.overall_state)
    }));
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
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token');
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
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
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
      return DashboardService.stateKeys.stable;
    }
    if (normalized === 'low focus') {
      return DashboardService.stateKeys.lowFocus;
    }
    if (normalized === 'elevated fatigue' || normalized === 'fatigue') {
      return DashboardService.stateKeys.fatigue;
    }
    if (normalized === 'high risk') {
      return DashboardService.stateKeys.highRisk;
    }
    return DashboardService.stateKeys.unknown;
  }

  private toDisplayState(state?: string): string {
    const key = this.toStateKey(state);
    if (key === DashboardService.stateKeys.stable) {
      return DashboardService.scanState.stable;
    }
    if (key === DashboardService.stateKeys.lowFocus) {
      return DashboardService.scanState.low;
    }
    if (key === DashboardService.stateKeys.fatigue) {
      return DashboardService.scanState.fatigue;
    }
    if (key === DashboardService.stateKeys.highRisk) {
      return DashboardService.scanState.risk;
    }
    return (state ?? '').trim() || 'Unknown';
  }
}
