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
  private readonly businessHubStateStorageKey = 'wellar_business_hub_access_state_v1';
  planLabel = 'Loading...';
  hasBusinessAccess = false;
  hasBusinessProfile = false;
  canUseBusinessFeatures = false;
  canOpenAuditLogs = true;
  canOpenRequestsCenter = true;
  canOpenBusinessCenter = false;
  isBusinessTrial = false;
  trialExpired = false;
  trialDaysRemaining: number | null = null;
  memberRoleLabel = '-';
  loadingAccessState = true;
  private accessSub?: RxSubscription;
  private navSub?: RxSubscription;
  private refreshSub?: RxSubscription;
  private accessRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly accessTimeoutMs = 10000;
  private readonly maxAccessRefreshAttempts = 2;
  private accessRefreshAttempts = 0;
  private currentUserId: string | null = null;

  constructor(
    private businessCenter: BusinessCenterService,
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.currentUserId = this.resolveCurrentUserId();
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
    if (this.accessRetryTimer) {
      clearTimeout(this.accessRetryTimer);
    }
  }

  statusText(): string {
    if (this.loadingAccessState) {
      return 'Loading...';
    }

    if (this.hasBusinessAccess && typeof this.trialDaysRemaining === 'number' && this.trialDaysRemaining > 0) {
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
    if (
      !this.isBusinessTrial ||
      typeof this.trialDaysRemaining !== 'number' ||
      this.trialDaysRemaining <= 0
    ) {
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
    if (this.accessRetryTimer) {
      clearTimeout(this.accessRetryTimer);
      this.accessRetryTimer = null;
    }

    const cachedState = this.businessCenter.getCachedHubAccessState();
    if (cachedState) {
      this.applyHubAccessState(cachedState);
      this.loadingAccessState = false;
      this.accessRefreshAttempts = 0;
    }

    this.accessSub?.unsubscribe();
    this.accessSub = this.businessCenter.getHubAccessState(_forceRefresh).pipe(
      timeout(this.accessTimeoutMs),
      catchError(() => of(null))
    ).subscribe((state) => {
      if (!state) {
        if (this.hasSessionToken() && this.accessRefreshAttempts < this.maxAccessRefreshAttempts) {
          this.accessRefreshAttempts += 1;
          this.accessRetryTimer = setTimeout(() => this.loadAccessState(true), 500 * this.accessRefreshAttempts);
          return;
        }
        this.loadingAccessState = false;
        this.applyFallbackFromSession();
        return;
      }

      const looksUnresolved = this.hasSessionToken() && !state.hasPaidAccess && !state.profile?.id;
      if (looksUnresolved && this.accessRefreshAttempts < this.maxAccessRefreshAttempts) {
        this.accessRefreshAttempts += 1;
        this.accessRetryTimer = setTimeout(() => this.loadAccessState(true), 500 * this.accessRefreshAttempts);
        return;
      }

      this.accessRefreshAttempts = 0;
      this.applyHubAccessState(state);
      this.loadingAccessState = false;
    });
  }

  private applyHubAccessState(state: {
    userId: string | null;
    profile: { id?: string | null; billing_status?: string | null; plan_code?: string | null } | null;
    hasPaidAccess: boolean;
    memberRole: string | null;
    permissions?: { canUseSystem?: boolean };
    trialExpired: boolean;
    trialExpiresAt: string | null;
  }): void {
    this.currentUserId = state.userId ?? this.currentUserId;

    this.hasBusinessProfile = Boolean(state.profile?.id);
    this.hasBusinessAccess = Boolean(state.hasPaidAccess);
    this.canUseBusinessFeatures =
      this.hasBusinessAccess &&
      Boolean(state.permissions?.canUseSystem);
    this.trialExpired = Boolean(state.trialExpired);

    const daysRemaining = this.daysUntil(state.trialExpiresAt);
    this.trialDaysRemaining =
      this.hasBusinessAccess && typeof daysRemaining === 'number' && daysRemaining >= 0
        ? daysRemaining
        : null;
    this.isBusinessTrial = this.hasBusinessAccess && typeof this.trialDaysRemaining === 'number';

    const planCode = (state.profile?.plan_code ?? '').toString().trim().toLowerCase();
    this.planLabel = planCode === 'business' || this.hasBusinessProfile
      ? 'Business'
      : 'Free';

    const role = (state.memberRole ?? '').toString().trim().toLowerCase();
    this.memberRoleLabel = role ? this.toTitleCase(role) : (this.hasBusinessProfile ? 'Business' : 'User');
    const canOpenOwnerViews = this.canOpenOwnerViews(role);
    this.canOpenAuditLogs = !this.hasBusinessAccess || canOpenOwnerViews;
    // Requests page is available for all signed-in users; non-owner roles are limited to personal scope.
    this.canOpenRequestsCenter = true;
    this.canOpenBusinessCenter =
      (this.hasBusinessProfile || this.hasBusinessAccess) &&
      canOpenOwnerViews;
    this.persistSidebarState();
  }

  private applyFallbackFromSession(): void {
    const cached = this.readSidebarState();
    if (cached) {
      const maxAgeMs = 5 * 60 * 1000;
      const isFresh = cached.updatedAt > 0 && Date.now() - cached.updatedAt <= maxAgeMs;

      if (this.currentUserId && cached.userId && cached.userId !== this.currentUserId) {
        this.clearSidebarState();
      } else {
        this.planLabel = cached.planLabel;
        this.memberRoleLabel = cached.memberRoleLabel;
        this.hasBusinessProfile = cached.hasBusinessProfile;
        this.hasBusinessAccess = cached.hasBusinessAccess;
        this.canUseBusinessFeatures = cached.canUseBusinessFeatures;
        this.canOpenAuditLogs = cached.canOpenAuditLogs;
        this.canOpenRequestsCenter = true;
        this.canOpenBusinessCenter = cached.canOpenBusinessCenter;
        this.isBusinessTrial = cached.isBusinessTrial;
        this.trialExpired = cached.trialExpired;
        this.trialDaysRemaining = cached.trialDaysRemaining;
        this.loadingAccessState = false;
        if (isFresh) {
          return;
        }
      }
    }

    const hubFallback = this.readStoredHubStateFallback();
    if (hubFallback) {
      this.planLabel = hubFallback.planLabel;
      this.memberRoleLabel = hubFallback.memberRoleLabel;
      this.hasBusinessProfile = hubFallback.hasBusinessProfile;
      this.hasBusinessAccess = hubFallback.hasBusinessAccess;
      this.canUseBusinessFeatures = hubFallback.canUseBusinessFeatures;
      this.canOpenAuditLogs = hubFallback.canOpenAuditLogs;
      this.canOpenRequestsCenter = true;
      this.canOpenBusinessCenter = hubFallback.canOpenBusinessCenter;
      this.isBusinessTrial = hubFallback.isBusinessTrial;
      this.trialExpired = hubFallback.trialExpired;
      this.trialDaysRemaining = hubFallback.trialDaysRemaining;
      this.loadingAccessState = false;
      return;
    }

    if (this.hasSessionToken()) {
      const roleHint = this.readSessionRoleHint();
      const hasBusinessHint = this.hasBusinessSessionHint(roleHint);

      this.planLabel = hasBusinessHint ? 'Business' : 'Free';
      this.memberRoleLabel = roleHint ?? 'User';
      this.hasBusinessProfile = hasBusinessHint;
      this.hasBusinessAccess = hasBusinessHint;
      this.canUseBusinessFeatures = hasBusinessHint;
      this.canOpenAuditLogs = !hasBusinessHint || this.canOpenOwnerViews((roleHint ?? '').toLowerCase());
      this.canOpenRequestsCenter = true;
      this.canOpenBusinessCenter = hasBusinessHint;
      this.isBusinessTrial = false;
      this.trialExpired = false;
      this.trialDaysRemaining = null;
      this.loadingAccessState = false;
      return;
    }

    this.planLabel = 'Free';
    this.memberRoleLabel = 'User';
    this.hasBusinessProfile = false;
    this.hasBusinessAccess = false;
    this.canUseBusinessFeatures = false;
    this.canOpenAuditLogs = true;
    this.canOpenRequestsCenter = true;
    this.canOpenBusinessCenter = false;
    this.isBusinessTrial = false;
    this.trialExpired = false;
    this.trialDaysRemaining = null;
    this.loadingAccessState = false;
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

  private canOpenOwnerViews(role: string): boolean {
    return role === 'owner' || role === 'admin' || role === 'manager';
  }

  private persistSidebarState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.sidebarStateStorageKey, JSON.stringify({
        updatedAt: Date.now(),
        userId: this.currentUserId,
        planLabel: this.planLabel,
        memberRoleLabel: this.memberRoleLabel,
        hasBusinessProfile: this.hasBusinessProfile,
        hasBusinessAccess: this.hasBusinessAccess,
        canUseBusinessFeatures: this.canUseBusinessFeatures,
        canOpenAuditLogs: this.canOpenAuditLogs,
        canOpenRequestsCenter: this.canOpenRequestsCenter,
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
    userId: string | null;
    hasBusinessProfile: boolean;
    hasBusinessAccess: boolean;
    canUseBusinessFeatures: boolean;
    canOpenAuditLogs: boolean;
    canOpenRequestsCenter: boolean;
    canOpenBusinessCenter: boolean;
    isBusinessTrial: boolean;
    trialExpired: boolean;
    trialDaysRemaining: number | null;
    updatedAt: number;
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
        updatedAt: typeof parsed['updatedAt'] === 'number' ? parsed['updatedAt'] : 0,
        userId: typeof parsed['userId'] === 'string' ? parsed['userId'] : null,
        planLabel: typeof parsed['planLabel'] === 'string' ? parsed['planLabel'] : 'Free',
        memberRoleLabel: typeof parsed['memberRoleLabel'] === 'string' ? parsed['memberRoleLabel'] : 'User',
        hasBusinessProfile: parsed['hasBusinessProfile'] === true,
        hasBusinessAccess: parsed['hasBusinessAccess'] === true,
        canUseBusinessFeatures: parsed['canUseBusinessFeatures'] === true,
        canOpenAuditLogs: parsed['canOpenAuditLogs'] !== false,
        canOpenRequestsCenter: parsed['canOpenRequestsCenter'] !== false,
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

  private resolveCurrentUserId(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const token = this.getSessionToken();
    if (!token) {
      return null;
    }

    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }

  private clearSidebarState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.sidebarStateStorageKey);
    } catch {
      // ignore storage errors
    }
  }

  private hasSessionToken(): boolean {
    return Boolean(this.getSessionToken());
  }

  private readStoredHubStateFallback(): {
    planLabel: string;
    memberRoleLabel: string;
    hasBusinessProfile: boolean;
    hasBusinessAccess: boolean;
    canUseBusinessFeatures: boolean;
    canOpenAuditLogs: boolean;
    canOpenRequestsCenter: boolean;
    canOpenBusinessCenter: boolean;
    isBusinessTrial: boolean;
    trialExpired: boolean;
    trialDaysRemaining: number | null;
  } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.businessHubStateStorageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const state = (parsed['state'] ?? null) as Record<string, unknown> | null;
      if (!state || typeof state !== 'object') {
        return null;
      }

      const stateUserId = this.pickString(state['userId']);
      if (this.currentUserId && stateUserId && this.currentUserId !== stateUserId) {
        return null;
      }

      const profile = (state['profile'] ?? null) as Record<string, unknown> | null;
      const permissions = (state['permissions'] ?? null) as Record<string, unknown> | null;

      const hasBusinessProfile = Boolean(this.pickString(profile?.['id']));
      const hasBusinessAccess = state['hasPaidAccess'] === true;
      const role = (this.pickString(state['memberRole']) ?? '').toLowerCase();
      const roleLabel = role ? this.normalizeRoleLabel(role) : (hasBusinessProfile ? 'Business' : 'User');
      const planCode = (this.pickString(profile?.['plan_code']) ?? '').toLowerCase();
      const planLabel = planCode === 'business' || hasBusinessProfile ? 'Business' : 'Free';
      const trialExpired = state['trialExpired'] === true;
      const trialDaysRemaining = this.daysUntil(this.pickString(state['trialExpiresAt']));
      const isBusinessTrial =
        hasBusinessAccess && typeof trialDaysRemaining === 'number' && trialDaysRemaining >= 0;
      const canUseSystem = permissions?.['canUseSystem'] === true;
      const canOpenOwnerViews = this.canOpenOwnerViews(role);

      return {
        planLabel,
        memberRoleLabel: roleLabel,
        hasBusinessProfile,
        hasBusinessAccess,
        canUseBusinessFeatures: hasBusinessAccess && canUseSystem,
        canOpenAuditLogs: !hasBusinessAccess || canOpenOwnerViews,
        canOpenRequestsCenter: true,
        canOpenBusinessCenter: (hasBusinessProfile || hasBusinessAccess) && canOpenOwnerViews,
        isBusinessTrial,
        trialExpired,
        trialDaysRemaining:
          hasBusinessAccess && typeof trialDaysRemaining === 'number' ? trialDaysRemaining : null
      };
    } catch {
      return null;
    }
  }

  private readSessionRoleHint(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedRoleName = this.pickString(localStorage.getItem('user_role_name'));
    if (storedRoleName) {
      return this.normalizeRoleLabel(storedRoleName);
    }

    const payload = this.readJwtPayload();
    if (!payload) {
      return null;
    }

    const businessRole =
      this.pickString(payload['member_role']) ??
      this.pickString(payload['business_role']) ??
      this.pickString(payload['role_name']) ??
      this.pickString(payload['role_label']);

    if (businessRole) {
      return this.normalizeRoleLabel(businessRole);
    }

    return null;
  }

  private hasBusinessSessionHint(roleLabel: string | null): boolean {
    const payload = this.readJwtPayload();
    const planCode = (this.pickString(payload?.['plan_code']) ?? '').toLowerCase();
    if (planCode === 'business') {
      return true;
    }

    const normalizedRole = (roleLabel ?? '').trim().toLowerCase();
    if (!normalizedRole) {
      return false;
    }

    return (
      normalizedRole.includes('business') ||
      normalizedRole === 'owner' ||
      normalizedRole === 'admin' ||
      normalizedRole === 'manager' ||
      normalizedRole === 'member' ||
      normalizedRole === 'viewer'
    );
  }

  private readJwtPayload(): Record<string, unknown> | null {
    const token = this.getSessionToken();
    if (!token) {
      return null;
    }

    return this.decodeJwtPayload(token);
  }

  private getSessionToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const candidates = [
      localStorage.getItem('token'),
      localStorage.getItem('access_token'),
      localStorage.getItem('directus_token')
    ].filter((value): value is string => Boolean(value && value.trim()));

    for (const token of candidates) {
      if (!this.isTokenExpired(token)) {
        return token;
      }
    }

    return null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    return typeof exp === 'number' ? Math.floor(Date.now() / 1000) >= exp : false;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return null;
  }

  private normalizeRoleLabel(value: string): string {
    const normalized = value
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    if (!normalized) {
      return 'User';
    }

    return normalized
      .split(' ')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');
  }
}
