import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import {
  ActivityEventRecord,
  BusinessCenterService,
  BusinessHubAccessState,
  BusinessProfile,
  BusinessProfileMember,
  ReportExportRecord,
  RequestInviteRecord,
  RequestRecord
} from '../../services/business-center.service';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type InviteMetrics = {
  pending: number;
  sent: number;
  claimed: number;
  expired: number;
};

@Component({
  selector: 'app-business-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './business-center.html',
  styleUrl: './business-center.css'
})
export class BusinessCenterComponent implements OnInit, OnDestroy {
  loadingAccess = true;
  loadingData = false;
  hasBusinessAccess = false;
  accessReason = '';

  feedback: Feedback | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  accessState: BusinessHubAccessState | null = null;
  profile: BusinessProfile | null = null;

  teamMembers: BusinessProfileMember[] = [];
  requests: RequestRecord[] = [];
  requestInvites: RequestInviteRecord[] = [];
  reportExports: ReportExportRecord[] = [];
  activityEvents: ActivityEventRecord[] = [];

  inviteMetrics: InviteMetrics = {
    pending: 0,
    sent: 0,
    claimed: 0,
    expired: 0
  };

  upgradeSubmitting = false;
  exportSubmitting = false;
  inviteSubmitting = false;

  exportForm = {
    format: 'csv' as 'csv' | 'pdf',
    filters: ''
  };

  inviteForm = {
    requestId: '',
    email: '',
    phone: ''
  };

  constructor(private businessCenter: BusinessCenterService) {}

  ngOnInit(): void {
    this.loadAccessState();
  }

  ngOnDestroy(): void {
    this.clearFeedbackTimer();
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  accessBadgeLabel(): string {
    if (!this.profile) {
      return 'Plan: Free';
    }
    const plan = (this.profile.plan_code ?? 'free').toString();
    return `Plan: ${plan}`;
  }

  requestStatusLabel(status?: string | null): string {
    const normalized = (status ?? '').trim().toLowerCase();
    if (normalized.includes('approved') || normalized.includes('accepted')) {
      return 'Approved';
    }
    if (normalized.includes('denied') || normalized.includes('rejected')) {
      return 'Denied';
    }
    return 'Pending';
  }

  inviteStatusLabel(invite: RequestInviteRecord): 'Pending' | 'Sent' | 'Claimed' | 'Expired' {
    if (invite.claimed_at) {
      return 'Claimed';
    }

    const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : NaN;
    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
      return 'Expired';
    }

    const normalized = (invite.status ?? '').trim().toLowerCase();
    if (normalized.includes('claim')) {
      return 'Claimed';
    }
    if (normalized.includes('expire')) {
      return 'Expired';
    }
    if (normalized.includes('send')) {
      return 'Sent';
    }
    return 'Pending';
  }

  submitUpgradeRequest(): void {
    const orgId = this.accessState?.orgId ?? null;
    this.upgradeSubmitting = true;
    this.showFeedback('info', 'Submitting upgrade request...');

    this.businessCenter.submitUpgradeRequest(orgId).pipe(
      finalize(() => {
        this.upgradeSubmitting = false;
      })
    ).subscribe((res) => {
      this.showFeedback(res.ok ? 'success' : 'error', res.message);
    });
  }

  submitExportRequest(): void {
    if (!this.hasBusinessAccess) {
      return;
    }

    this.exportSubmitting = true;
    this.showFeedback('info', 'Submitting export request...');

    this.businessCenter.createReportExport(
      {
        format: this.exportForm.format,
        filters: this.exportForm.filters
      },
      this.accessState?.orgId ?? null
    ).pipe(
      finalize(() => {
        this.exportSubmitting = false;
      })
    ).subscribe((res) => {
      this.showFeedback(res.ok ? 'success' : 'error', res.message);
      if (res.ok) {
        this.reloadExports();
      }
    });
  }

  submitInvite(): void {
    if (!this.hasBusinessAccess) {
      return;
    }

    const requestId = this.inviteForm.requestId.trim();
    const email = this.inviteForm.email.trim();
    const phone = this.inviteForm.phone.trim();
    if (!requestId) {
      this.showFeedback('error', 'Request ID is required.');
      return;
    }
    if (!email && !phone) {
      this.showFeedback('error', 'Email or phone is required.');
      return;
    }

    this.inviteSubmitting = true;
    this.showFeedback('info', 'Sending invite...');
    this.businessCenter.createRequestInvite(
      { requestId, email, phone },
      this.accessState?.orgId ?? null
    ).pipe(
      finalize(() => {
        this.inviteSubmitting = false;
      })
    ).subscribe((res) => {
      this.showFeedback(res.ok ? 'success' : 'error', res.message);
      if (res.ok) {
        this.inviteForm.email = '';
        this.inviteForm.phone = '';
        this.reloadInvites();
      }
    });
  }

  trackById(_index: number, row: { id?: string | null }): string {
    return row.id ?? String(_index);
  }

  private loadAccessState(): void {
    this.loadingAccess = true;
    this.businessCenter.getHubAccessState().pipe(
      finalize(() => {
        this.loadingAccess = false;
      })
    ).subscribe((state) => {
      this.accessState = state;
      this.profile = state.profile;
      this.hasBusinessAccess = state.hasPaidAccess;
      this.accessReason = state.reason;

      if (!state.hasPaidAccess) {
        this.clearBusinessData();
        if (state.reason) {
          this.showFeedback('info', state.reason, true);
        }
        return;
      }

      this.loadBusinessData(state);
    });
  }

  private loadBusinessData(state: BusinessHubAccessState): void {
    if (!state.profile) {
      this.clearBusinessData();
      this.showFeedback('error', 'Business profile is missing.');
      return;
    }

    this.loadingData = true;
    this.clearBusinessData();

    const team$ = this.businessCenter.listTeamMembers(state.profile.id).pipe(
      catchError((err) => this.sectionFallback(err, 'team members'))
    );
    const requests$ = this.businessCenter.listRequests(state.orgId).pipe(
      catchError((err) => this.sectionFallback(err, 'requests'))
    );
    const invites$ = this.businessCenter.listRequestInvites(state.orgId).pipe(
      catchError((err) => this.sectionFallback(err, 'request invites'))
    );
    const exports$ = this.businessCenter.listReportExports(state.orgId).pipe(
      catchError((err) => this.sectionFallback(err, 'export jobs'))
    );
    const activity$ = this.businessCenter.listActivityEvents(state.orgId).pipe(
      catchError((err) => this.sectionFallback(err, 'activity log'))
    );

    forkJoin({
      team: team$ as Observable<BusinessProfileMember[]>,
      requests: requests$ as Observable<RequestRecord[]>,
      invites: invites$ as Observable<RequestInviteRecord[]>,
      exports: exports$ as Observable<ReportExportRecord[]>,
      events: activity$ as Observable<ActivityEventRecord[]>
    }).pipe(
      finalize(() => {
        this.loadingData = false;
      })
    ).subscribe(({ team, requests, invites, exports, events }) => {
      this.teamMembers = team;
      this.requests = requests;
      this.requestInvites = invites;
      this.reportExports = exports;
      this.activityEvents = events;
      this.inviteMetrics = this.calculateInviteMetrics(requests, invites);
    });
  }

  private reloadInvites(): void {
    this.businessCenter.listRequestInvites(this.accessState?.orgId ?? null).subscribe({
      next: (rows) => {
        this.requestInvites = rows;
        this.inviteMetrics = this.calculateInviteMetrics(this.requests, rows);
      },
      error: (err) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload invites.'));
      }
    });
  }

  private reloadExports(): void {
    this.businessCenter.listReportExports(this.accessState?.orgId ?? null).subscribe({
      next: (rows) => {
        this.reportExports = rows;
      },
      error: (err) => {
        this.showFeedback('error', this.describeHttpError(err, 'Failed to reload export jobs.'));
      }
    });
  }

  private calculateInviteMetrics(
    requests: RequestRecord[],
    invites: RequestInviteRecord[]
  ): InviteMetrics {
    const pendingRequests = requests.reduce((count, row) => {
      return count + (this.requestStatusLabel(row.response_status) === 'Pending' ? 1 : 0);
    }, 0);

    const metrics: InviteMetrics = {
      pending: pendingRequests,
      sent: 0,
      claimed: 0,
      expired: 0
    };

    for (const invite of invites) {
      const status = this.inviteStatusLabel(invite);
      if (status === 'Sent') {
        metrics.sent += 1;
      } else if (status === 'Claimed') {
        metrics.claimed += 1;
      } else if (status === 'Expired') {
        metrics.expired += 1;
      }
    }

    return metrics;
  }

  private clearBusinessData(): void {
    this.teamMembers = [];
    this.requests = [];
    this.requestInvites = [];
    this.reportExports = [];
    this.activityEvents = [];
    this.inviteMetrics = {
      pending: 0,
      sent: 0,
      claimed: 0,
      expired: 0
    };
  }

  private sectionFallback(err: any, section: string): Observable<never[]> {
    this.showFeedback('error', this.describeHttpError(err, `Failed to load ${section}.`));
    return of([]);
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

    if (status === 401 || status === 403) {
      return `Access denied (${status}): ${detail || fallback}`;
    }

    if (status >= 500) {
      return `Server error (${status}): ${detail || fallback}`;
    }

    if (status >= 400) {
      return `Request error (${status}): ${detail || fallback}`;
    }

    return detail || fallback;
  }

  private showFeedback(type: Feedback['type'], message: string, sticky = false): void {
    this.feedback = { type, message };
    this.clearFeedbackTimer();
    if (sticky) {
      return;
    }

    this.feedbackTimer = setTimeout(() => {
      if (this.feedback?.message === message) {
        this.feedback = null;
      }
    }, 7000);
  }

  private clearFeedbackTimer(): void {
    if (!this.feedbackTimer) {
      return;
    }
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
  }
}

