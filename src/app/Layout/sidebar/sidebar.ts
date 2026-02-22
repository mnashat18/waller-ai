import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterModule } from '@angular/router';
import { of, Subscription as RxSubscription } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { BusinessCenterService } from '../../services/business-center.service';
import { SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterModule],
  templateUrl: './sidebar.html'
})
export class SidebarComponent implements OnInit, OnDestroy {
  private readonly sidebarStateStorageKey = 'wellar_sidebar_business_state_v1';
  planLabel = 'Free';
  hasBusinessAccess = false;
  hasBusinessProfile = false;
  canUseBusinessFeatures = false;
  canOpenBusinessCenter = false;
  isBusinessTrial = false;
  trialExpired = false;
  trialDaysRemaining: number | null = null;
  memberRoleLabel = 'User';
  private accessSub?: RxSubscription;
  private navSub?: RxSubscription;
  private refreshSub?: RxSubscription;
  private readonly accessTimeoutMs = 10000;

  constructor(
    private businessCenter: BusinessCenterService,
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.applyFallbackFromSession();
    this.loadAccessState(true);
    this.refreshSub = this.subscriptions.snapshotRefreshEvents().subscribe(() => {
      this.loadAccessState(true);
    });
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadAccessState(false);
      }
    });
  }

  ngOnDestroy() {
    this.accessSub?.unsubscribe();
    this.navSub?.unsubscribe();
    this.refreshSub?.unsubscribe();
  }

  statusText(): string {
    if (this.hasBusinessAccess && typeof this.trialDaysRemaining === 'number') {
      return `${this.trialDaysRemaining}d left`;
    }

    if (this.hasBusinessAccess && this.isBusinessTrial) {
      return 'Trial';
    }

    if (this.hasBusinessAccess) {
      return 'Active';
    }

    if (this.trialExpired) {
      return 'Expired';
    }

    return 'Free';
  }

  trialProgressPercent(): number {
    if (!this.isBusinessTrial || typeof this.trialDaysRemaining !== 'number') {
      return this.hasBusinessAccess ? 100 : 0;
    }
    const percent = Math.round((this.trialDaysRemaining / 14) * 100);
    if (percent < 0) {
      return 0;
    }
    if (percent > 100) {
      return 100;
    }
    return percent;
  }

  private loadAccessState(_forceRefresh = false): void {
    this.accessSub?.unsubscribe();
    this.accessSub = this.businessCenter.getHubAccessState().pipe(
      timeout(this.accessTimeoutMs),
      catchError(() => of(null))
    ).subscribe((state) => {
      if (!state) {
        this.applyFallbackFromSession();
        return;
      }

      this.hasBusinessProfile = Boolean(state.profile?.id);
      this.hasBusinessAccess = Boolean(state.hasPaidAccess);
      this.canUseBusinessFeatures =
        this.hasBusinessAccess &&
        Boolean(state.permissions?.canUseSystem);
      this.canOpenBusinessCenter = this.hasBusinessProfile || this.hasBusinessAccess;
      this.trialExpired = Boolean(state.trialExpired);

      const billingStatus = (state.profile?.billing_status ?? '').toString().trim().toLowerCase();
      this.isBusinessTrial = billingStatus === 'trial' && !this.trialExpired;
      this.trialDaysRemaining = this.isBusinessTrial
        ? this.daysUntil(state.trialExpiresAt)
        : null;

      const planCode = (state.profile?.plan_code ?? '').toString().trim().toLowerCase();
      this.planLabel = planCode === 'business' || this.hasBusinessProfile
        ? 'Business'
        : 'Free';

      const role = (state.memberRole ?? '').toString().trim().toLowerCase();
      this.memberRoleLabel = role ? this.toTitleCase(role) : (this.hasBusinessProfile ? 'Business' : 'User');
      this.persistSidebarState();
    });
  }

  private applyFallbackFromSession(): void {
    const cached = this.readSidebarState();
    if (cached) {
      this.planLabel = cached.planLabel;
      this.memberRoleLabel = cached.memberRoleLabel;
      this.hasBusinessProfile = cached.hasBusinessProfile;
      this.hasBusinessAccess = cached.hasBusinessAccess;
      this.canUseBusinessFeatures = cached.canUseBusinessFeatures;
      this.canOpenBusinessCenter = cached.canOpenBusinessCenter;
      this.isBusinessTrial = cached.isBusinessTrial;
      this.trialExpired = cached.trialExpired;
      this.trialDaysRemaining = cached.trialDaysRemaining;
      return;
    }

    this.planLabel = 'Free';
    this.memberRoleLabel = 'User';
    this.hasBusinessProfile = false;
    this.hasBusinessAccess = false;
    this.canUseBusinessFeatures = false;
    this.canOpenBusinessCenter = false;
    this.isBusinessTrial = false;
    this.trialExpired = false;
    this.trialDaysRemaining = null;
  }

  private daysUntil(value: string | null): number | null {
    if (!value) {
      return null;
    }
    const ts = new Date(value).getTime();
    if (Number.isNaN(ts)) {
      return null;
    }
    const remainingMs = ts - Date.now();
    if (remainingMs <= 0) {
      return 0;
    }
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  }

  private toTitleCase(value: string): string {
    if (!value) {
      return value;
    }
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  private persistSidebarState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.sidebarStateStorageKey, JSON.stringify({
        planLabel: this.planLabel,
        memberRoleLabel: this.memberRoleLabel,
        hasBusinessProfile: this.hasBusinessProfile,
        hasBusinessAccess: this.hasBusinessAccess,
        canUseBusinessFeatures: this.canUseBusinessFeatures,
        canOpenBusinessCenter: this.canOpenBusinessCenter,
        isBusinessTrial: this.isBusinessTrial,
        trialExpired: this.trialExpired,
        trialDaysRemaining: this.trialDaysRemaining
      }));
    } catch {
      // ignore storage errors
    }
  }

  private readSidebarState(): {
    planLabel: string;
    memberRoleLabel: string;
    hasBusinessProfile: boolean;
    hasBusinessAccess: boolean;
    canUseBusinessFeatures: boolean;
    canOpenBusinessCenter: boolean;
    isBusinessTrial: boolean;
    trialExpired: boolean;
    trialDaysRemaining: number | null;
  } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.sidebarStateStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        planLabel: typeof parsed['planLabel'] === 'string' ? parsed['planLabel'] : 'Free',
        memberRoleLabel: typeof parsed['memberRoleLabel'] === 'string' ? parsed['memberRoleLabel'] : 'User',
        hasBusinessProfile: parsed['hasBusinessProfile'] === true,
        hasBusinessAccess: parsed['hasBusinessAccess'] === true,
        canUseBusinessFeatures: parsed['canUseBusinessFeatures'] === true,
        canOpenBusinessCenter: parsed['canOpenBusinessCenter'] === true,
        isBusinessTrial: parsed['isBusinessTrial'] === true,
        trialExpired: parsed['trialExpired'] === true,
        trialDaysRemaining:
          typeof parsed['trialDaysRemaining'] === 'number' ? parsed['trialDaysRemaining'] : null
      };
    } catch {
      return null;
    }
  }
}
