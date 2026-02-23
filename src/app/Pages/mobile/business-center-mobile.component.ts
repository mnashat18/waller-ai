import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { NotificationsComponent } from '../../components/notifications/notifications';
import {
  BusinessCenterService,
  BusinessHubAccessState,
  RequestRecord
} from '../../services/business-center.service';

@Component({
  selector: 'app-business-center-mobile',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationsComponent],
  templateUrl: './business-center-mobile.html'
})
export class BusinessCenterMobileComponent implements OnInit {
  loading = true;
  loadingSummary = false;
  hasBusinessAccess = false;
  accessReason = '';
  errorMessage = '';
  planLabel = 'Free';
  roleLabel = 'User';
  trialLabel = '';
  canUseSystem = false;
  canManageMembers = false;
  isReadOnly = true;

  stats = {
    teamMembers: 0,
    requests: 0,
    pending: 0,
    events: 0
  };

  private readonly accessTimeoutMs = 12000;
  private readonly summaryTimeoutMs = 12000;

  constructor(private businessCenter: BusinessCenterService) {}

  ngOnInit(): void {
    this.loadAccess();
  }

  retry(): void {
    this.loadAccess();
  }

  private loadAccess(): void {
    this.loading = true;
    this.loadingSummary = false;
    this.errorMessage = '';
    this.accessReason = '';
    this.trialLabel = '';
    this.stats = { teamMembers: 0, requests: 0, pending: 0, events: 0 };

    let accessState$: Observable<BusinessHubAccessState>;
    try {
      accessState$ = this.businessCenter.getHubAccessState();
    } catch (err) {
      this.errorMessage = this.describeHttpError(err, 'Failed to load Business access.');
      this.loading = false;
      return;
    }

    accessState$.pipe(
      timeout(this.accessTimeoutMs),
      catchError((err) => {
        this.errorMessage = this.describeHttpError(err, 'Failed to load Business access.');
        return of(null);
      })
    ).subscribe((state) => {
      if (!state) {
        this.hasBusinessAccess = false;
        this.planLabel = 'Free';
        this.roleLabel = 'User';
        this.loading = false;
        return;
      }

      this.applyAccessState(state);
    });
  }

  private applyAccessState(state: BusinessHubAccessState): void {
    this.hasBusinessAccess = Boolean(state.hasPaidAccess);
    this.planLabel = this.hasBusinessAccess ? 'Business' : 'Free';
    this.roleLabel = this.toTitleCase((state.memberRole ?? 'user').toString()) || 'User';
    this.accessReason = state.reason || '';

    this.canUseSystem = Boolean(state.permissions?.canUseSystem);
    this.canManageMembers = Boolean(state.permissions?.canManageMembers);
    this.isReadOnly = Boolean(state.permissions?.isReadOnly);

    const daysRemaining = this.daysUntil(state.trialExpiresAt);
    if (typeof daysRemaining === 'number' && !state.trialExpired) {
      this.trialLabel = daysRemaining <= 1 ? 'Trial ends today' : `${daysRemaining}d trial left`;
    } else {
      this.trialLabel = '';
    }

    if (!this.hasBusinessAccess) {
      this.loading = false;
      return;
    }

    const profileId = this.pickId(state.profile?.id);
    if (!profileId) {
      this.hasBusinessAccess = false;
      this.accessReason = 'Business profile is missing.';
      this.loading = false;
      return;
    }

    this.loadSummary(profileId, this.pickId(state.orgId));
  }

  private loadSummary(profileId: string, orgId: string | null): void {
    this.loadingSummary = true;

    forkJoin({
      teamMembers: this.businessCenter.listTeamMembers(profileId).pipe(catchError(() => of([]))),
      requests: this.businessCenter.listRequests(orgId).pipe(catchError(() => of([]))),
      events: this.businessCenter.listActivityEvents(orgId, 40).pipe(catchError(() => of([])))
    }).pipe(
      timeout(this.summaryTimeoutMs),
      catchError((err) => {
        this.errorMessage = this.describeHttpError(err, 'Failed to load Business metrics.');
        return of({ teamMembers: [], requests: [], events: [] });
      })
    ).subscribe(({ teamMembers, requests, events }) => {
      const rows = (requests as RequestRecord[]) ?? [];

      this.stats = {
        teamMembers: (teamMembers as any[])?.length ?? 0,
        requests: rows.length,
        pending: rows.filter((row) => this.isPendingStatus(row?.response_status)).length,
        events: (events as any[])?.length ?? 0
      };

      this.loadingSummary = false;
      this.loading = false;
    });
  }

  private isPendingStatus(value: string | null | undefined): boolean {
    const normalized = (value ?? '').toLowerCase();
    return normalized.includes('pending');
  }

  private describeHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.error?.message ||
      err?.message ||
      '';

    const normalized = String(detail).toLowerCase();

    if (
      status === 0 ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('connection refused') ||
      normalized.includes('timeout')
    ) {
      return `Network error: ${detail || fallback}`;
    }

    if (status >= 500) return `Server error (${status}): ${detail || fallback}`;
    if (status >= 400) return `Request error (${status}): ${detail || fallback}`;
    return detail || fallback;
  }

  private daysUntil(value: string | null): number | null {
    if (!value) return null;
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return null;
    const remaining = ts - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  private toTitleCase(value: string): string {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return '';
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  private pickId(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.pickId((value as Record<string, unknown>)['id']);
    }
    return null;
  }
}
