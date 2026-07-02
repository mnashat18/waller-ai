import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, finalize, map } from 'rxjs/operators';

import { CompanyContextService } from '../../core/context/company-context.service';
import { InviteService } from '../../services/invites';
import {
  OperationalDashboardService,
  type DashboardAlertItem,
  type DashboardAttentionItem,
  type DashboardDepartmentCompliance,
  type DashboardKpiCardData,
  type DashboardReadinessBucket,
  type DashboardRequestItem,
  type DashboardScanActivityItem,
  type OperationalDashboardViewModel
} from '../../services/operational-dashboard.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { RiskBadgeComponent } from '../../shared/ui/risk-badge/risk-badge.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DashboardSectionComponent,
    KpiCardComponent,
    RiskBadgeComponent,
    StatusBadgeComponent,
    CardSkeletonLoaderComponent,
    PageHeaderComponent,
    ErrorStateComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  loading = true;
  state: 'loadingContext' | 'loadingDashboard' | 'ready' | 'error' = 'loadingContext';
  errorMessage = '';
  view: OperationalDashboardViewModel | null = null;
  activeMembership: any = null;
  activeBusinessProfile: any = null;
  activeMemberRole: string | null = null;
  onboardingDismissed = false;

  private readonly onboardingDismissKey = 'wellar_onboarding_checklist_dismissed_v1';
  private contextSubscription?: Subscription;
  private bootstrapGeneration = 0;
  private watchedContextKey: string | null = null;
  private currentDashboardContextKey: string | null = null;

  constructor(
    private dashboardService: OperationalDashboardService,
    private workspaceContext: CompanyContextService,
    private postLoginRouting: PostLoginRoutingService,
    private invites: InviteService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.onboardingDismissed = this.readOnboardingDismissed();
    this.startWatchingContext();
    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.contextSubscription?.unsubscribe();
  }

  refresh(): void {
    void this.bootstrap();
  }

  get freshnessLabel(): string {
    const generatedAt = this.view?.generatedAt;
    if (!generatedAt) {
      return '';
    }

    const then = new Date(generatedAt).getTime();
    if (Number.isNaN(then)) {
      return '';
    }

    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes <= 0) {
      return 'Updated just now';
    }
    if (minutes === 1) {
      return 'Updated 1 min ago';
    }
    if (minutes < 60) {
      return `Updated ${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours === 1) {
      return 'Updated 1 hour ago';
    }
    if (hours < 24) {
      return `Updated ${hours} hours ago`;
    }
    return 'Updated over a day ago';
  }

  get activeRole(): string {
    return String(this.view?.company.activeRole ?? this.activeMemberRole ?? '').toLowerCase();
  }

  get isManager(): boolean {
    return this.activeRole === 'manager';
  }

  get isOwnerOrHr(): boolean {
    return this.activeRole === 'owner' || this.activeRole === 'hr';
  }

  get dashboardDescription(): string {
    if (this.isManager) {
      const department = this.managerDepartmentName;
      return department
        ? `Department-scoped view of readiness, scan requests, alerts, and compliance for ${department}.`
        : 'Department-scoped view of readiness, scan requests, alerts, and compliance for the active department.';
    }

    if (this.isOwnerOrHr) {
      const company = this.view?.company.companyName || 'the active organization';
      return `Organization-level view of readiness, scan requests, alerts, and compliance for ${company}.`;
    }

    return 'Operational readiness view for the active workspace.';
  }

  get managerDepartmentName(): string {
    return this.view?.currentMember.departmentName || this.view?.scope.departmentName || '';
  }

  get scopeDisplayLabel(): string {
    if (this.isManager) {
      return this.managerDepartmentName ? `Department scope: ${this.managerDepartmentName}` : 'Department scope';
    }

    return 'Organization scope';
  }

  get roleDisplayLabel(): string {
    const role = this.view?.company.activeRole ?? this.activeMemberRole ?? '';
    if (!role) {
      return 'Active role';
    }
    return role === 'hr' ? 'HR' : role.charAt(0).toUpperCase() + role.slice(1);
  }

  get showSetupCallout(): boolean {
    return this.showOnboarding && this.isOwnerOrHr;
  }

  get hasActiveDepartmentContext(): boolean {
    return !this.isManager || Boolean(this.managerDepartmentName || this.view?.scope.departmentId);
  }

  get noOperationalDataTitle(): string {
    return this.isManager ? 'No department activity yet' : 'No operational activity yet';
  }

  get noOperationalDataMessage(): string {
    return this.isManager
      ? 'This department view will populate after members, scan requests, alerts, or completed scans are available in your scope.'
      : 'This organization view will populate after members, scan requests, alerts, or completed scans are available.';
  }

  get setupProgressLabel(): string {
    return `${this.onboardingDoneCount} of ${this.onboardingSteps.length} setup items complete`;
  }

  get showOnboarding(): boolean {
    if (this.onboardingDismissed || !this.view) {
      return false;
    }

    if (!this.isOwnerOrHr) {
      return false;
    }

    return !this.onboardingComplete;
  }

  get onboardingSteps(): Array<{
    label: string;
    description: string;
    route: string;
    queryParams: Record<string, string> | null;
    state: Record<string, unknown> | null;
    cta: string;
    done: boolean;
  }> {
    const vm = this.view;
    const departments = vm?.complianceByDepartment.items ?? [];
    const hasDepartments = departments.length > 0;
    const hasScans = (vm?.recentScans.items.length ?? 0) > 0;
    const hasRequests = (vm?.pendingRequests.items.length ?? 0) > 0 || hasScans;
    const hasMembers =
      departments.some((department) => department.activeEligibleMembers > 0) ||
      hasScans ||
      hasRequests;

    return [
      {
        label: 'Complete company profile',
        description: 'Confirm organization details before relying on readiness reporting.',
        route: '/app/company',
        queryParams: null,
        state: null,
        cta: 'Open Company',
        done: Boolean(vm?.company.companyName)
      },
      {
        label: 'Add departments',
        description: 'Create workforce groups for team-level scans and compliance coverage.',
        route: '/app/company',
        queryParams: { tab: 'departments' },
        state: null,
        cta: 'Open Departments',
        done: hasDepartments
      },
      {
        label: 'Invite employees',
        description: 'Bring your team into the workspace.',
        route: '/app/workforce',
        queryParams: { invite: '1' },
        state: null,
        cta: 'Invite Team',
        done: hasMembers
      },
      {
        label: 'Connect employees to the mobile app',
        description: 'Employees complete readiness scans on mobile.',
        route: '/app/workforce',
        queryParams: null,
        state: { workforceGuide: 'mobile-app' },
        cta: 'Open Workforce',
        done: hasScans
      },
      {
        label: 'Create your first scan request',
        description: 'Send a readiness scan to a person or a team.',
        route: '/app/scan-requests',
        queryParams: null,
        state: { openCreateRequest: true },
        cta: 'Send Request',
        done: hasRequests
      }
    ];
  }

  get onboardingDoneCount(): number {
    return this.onboardingSteps.filter((step) => step.done).length;
  }

  get onboardingComplete(): boolean {
    return this.onboardingSteps.every((step) => step.done);
  }

  dismissOnboarding(): void {
    this.onboardingDismissed = true;
    try {
      localStorage.setItem(this.onboardingDismissKey, '1');
    } catch {
      // ignore storage errors
    }
  }

  openOnboardingStep(step: {
    route: string;
    queryParams: Record<string, string> | null;
    state: Record<string, unknown> | null;
  }): void {
    if (!step.route) {
      return;
    }

    void this.router.navigate([step.route], {
      queryParams: step.queryParams ?? undefined,
      state: step.state ?? undefined
    });
  }

  private readOnboardingDismissed(): boolean {
    try {
      return localStorage.getItem(this.onboardingDismissKey) === '1';
    } catch {
      return false;
    }
  }

  trackByKpi(index: number, item: DashboardKpiCardData): string {
    return `${index}-${item.label}`;
  }

  trackByAttention(index: number, item: DashboardAttentionItem): string {
    return `${index}-${item.id}`;
  }

  trackByBucket(index: number, item: DashboardReadinessBucket): string {
    return `${index}-${item.key}`;
  }

  trackByDepartment(index: number, item: DashboardDepartmentCompliance): string {
    return `${index}-${item.id}`;
  }

  trackByScan(index: number, item: DashboardScanActivityItem): string {
    return `${index}-${item.id}`;
  }

  trackByAlert(index: number, item: DashboardAlertItem): string {
    return `${index}-${item.id}`;
  }

  trackByRequest(index: number, item: DashboardRequestItem): string {
    return `${index}-${item.id}`;
  }

  private async bootstrap(): Promise<void> {
    const generation = ++this.bootstrapGeneration;
    let resolvedContextKey: string | null = null;
    try {
      this.state = 'loadingContext';
      this.loading = true;
      this.errorMessage = '';
      this.view = null;

      const context = await this.resolveDashboardContext();
      if (generation !== this.bootstrapGeneration) {
        return;
      }

      if (!context?.activeMembership?.id || !context?.activeBusinessProfile?.id) {
        const inviteFlowDetected = this.hasInviteClaimSignal();
        if (inviteFlowDetected) {
          this.state = 'error';
          this.errorMessage = 'Invite accepted, but workspace context could not be loaded.';
          return;
        }

        await this.router.navigateByUrl('/app/workspace-access', { replaceUrl: true });
        return;
      }

      resolvedContextKey = this.contextKey({
        userId: context.activeMembership?.user?.id ?? this.workspaceContext.snapshot().context.userId ?? null,
        activeBusinessProfileId: context.activeBusinessProfile?.id ?? null,
        activeMemberRole: context.activeMemberRole ?? null,
        activeDepartmentId: this.workspaceContext.snapshot().context.activeDepartmentId ?? null
      });
      this.activeMembership = context.activeMembership;
      this.activeBusinessProfile = context.activeBusinessProfile;
      this.activeMemberRole = context.activeMemberRole;
      this.currentDashboardContextKey = resolvedContextKey;

      this.state = 'loadingDashboard';

      await this.loadDashboardData(context.activeBusinessProfile.id, generation);
      if (generation !== this.bootstrapGeneration) {
        return;
      }

      this.state = 'ready';
    } catch {
      if (generation !== this.bootstrapGeneration) {
        return;
      }
      this.state = 'error';
      this.errorMessage = 'Dashboard failed to load.';
    } finally {
      if (generation !== this.bootstrapGeneration) {
        return;
      }
      this.loading = this.state !== 'ready' && this.state !== 'error';
      this.cdr.detectChanges();
      if (
        resolvedContextKey &&
        this.watchedContextKey &&
        this.watchedContextKey !== resolvedContextKey
      ) {
        void this.bootstrap();
      }
    }
  }

  private loadDashboardData(_businessProfileId: string, generation: number): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.view = null;

    return new Promise((resolve, reject) => {
      this.dashboardService.getDashboardData(_businessProfileId).pipe(
        finalize(() => {
          if (generation !== this.bootstrapGeneration) {
            return;
          }
          this.loading = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: (view) => {
          if (generation !== this.bootstrapGeneration) {
            resolve();
            return;
          }
          this.view = view;
          resolve();
        },
        error: (error) => {
          if (generation !== this.bootstrapGeneration) {
            resolve();
            return;
          }
          this.errorMessage = error?.message || 'Failed to load dashboard data.';
          reject(error);
        }
      });
    });
  }

  private async resolveDashboardContext(): Promise<{
    activeMembership: any;
    activeBusinessProfile: any;
    activeMemberRole: string;
  } | null> {
    const inviteFlowDetected = this.hasInviteClaimSignal();
    const maxAttempts = inviteFlowDetected ? 3 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const context = await Promise.race([
        this.workspaceContext.ensureVerifiedWorkspaceContext(attempt > 0),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
      ]);

      if (context?.activeMembership?.id && context?.activeBusinessProfile?.id) {
        return context;
      }

      if (!inviteFlowDetected || attempt >= maxAttempts - 1) {
        return context;
      }

      try {
        await this.postLoginRouting.refreshAuthAndWorkspaceContext({ force: true });
      } catch {
        // Keep retrying with best-effort context restore.
      }
    }

    return null;
  }

  private hasInviteClaimSignal(): boolean {
    if (this.invites.hasClaimCompleted()) {
      return true;
    }

    const pendingToken = this.invites.getPendingInviteToken();
    if (pendingToken) {
      return true;
    }

    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const prefix = 'invite_claim_success_';
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(prefix)) {
          continue;
        }

        if (localStorage.getItem(key) === 'true') {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  private startWatchingContext(): void {
    if (this.contextSubscription) {
      return;
    }

    this.watchedContextKey = this.contextKey(this.workspaceContext.snapshot().context);
    this.contextSubscription = this.workspaceContext.context$.pipe(
      map((context) => this.contextKey(context)),
      distinctUntilChanged()
    ).subscribe((contextKey) => {
      if (contextKey === this.watchedContextKey) {
        return;
      }

      this.watchedContextKey = contextKey;
      if (!this.currentDashboardContextKey) {
        return;
      }

      if (contextKey === this.currentDashboardContextKey) {
        return;
      }

      void this.bootstrap();
    });
  }

  private contextKey(context: {
    activeBusinessProfileId: string | null;
    activeMemberRole: string | null;
    activeDepartmentId: string | null;
    userId: string | null;
  }): string {
    return [
      context.userId ?? '',
      context.activeBusinessProfileId ?? '',
      context.activeMemberRole ?? '',
      context.activeDepartmentId ?? ''
    ].join('|');
  }
}
