import { Injectable } from '@angular/core';
import { Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { BusinessCenterService } from './business-center.service';

export type Plan = {
  id?: string | number;
  name: string;
  code: string;
  description?: string;
  monthly_price?: number;
  yearly_price?: number;
  features: string[];
  is_popular?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

export type UserSubscription = {
  id?: string | number;
  plan: Plan | null;
  status: string;
  billing_cycle: 'monthly' | 'yearly';
  date_created?: string;
  expires_at?: string;
  is_trial?: boolean;
  days_remaining?: number;
};

export type BusinessAccessSnapshot = {
  planCode: string;
  hasBusinessAccess: boolean;
  isBusinessTrial: boolean;
  daysRemaining: number | null;
  trialExpired: boolean;
  trialExpiresAt: string | null;
};

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly refreshSubject = new ReplaySubject<void>(1);

  constructor(private businessCenter: BusinessCenterService) {}

  snapshotRefreshEvents(): Observable<void> {
    return this.refreshSubject.asObservable();
  }

  notifyAuthStateChanged(): void {
    this.businessCenter.notifyAuthStateChanged();
    this.refreshSubject.next();
  }

  getPlans(): Observable<Plan[]> {
    return of([]);
  }

  getBusinessAccessSnapshot(_options?: { forceRefresh?: boolean }): Observable<BusinessAccessSnapshot> {
    return this.businessCenter.getHubAccessState(Boolean(_options?.forceRefresh)).pipe(
      map((state) => {
        const daysRemaining = this.daysUntil(state.trialExpiresAt);
        const planCode = state.hasPaidAccess ? 'business' : 'free';

        return {
          planCode,
          hasBusinessAccess: Boolean(state.hasPaidAccess),
          isBusinessTrial: typeof daysRemaining === 'number' && daysRemaining > 0,
          daysRemaining,
          trialExpired: Boolean(state.trialExpired),
          trialExpiresAt: state.trialExpiresAt
        };
      }),
      catchError(() =>
        of({
          planCode: 'free',
          hasBusinessAccess: false,
          isBusinessTrial: false,
          daysRemaining: null,
          trialExpired: false,
          trialExpiresAt: null
        })
      )
    );
  }

  getActiveSubscription(): Observable<UserSubscription | null> {
    return this.getBusinessAccessSnapshot({ forceRefresh: true }).pipe(
      map((snapshot) => {
        if (!snapshot.hasBusinessAccess) {
          return null;
        }

        return {
          id: 'workspace-access',
          plan: {
            id: snapshot.planCode || 'business',
            name: snapshot.planCode === 'free' ? 'Workspace' : 'Business Workspace',
            code: snapshot.planCode || 'business',
            features: []
          },
          status: 'Active',
          billing_cycle: 'monthly',
          expires_at: snapshot.trialExpiresAt ?? undefined,
          is_trial: snapshot.isBusinessTrial,
          days_remaining: snapshot.daysRemaining ?? undefined
        } as UserSubscription;
      })
    );
  }

  ensureBusinessTrial(): Observable<UserSubscription | null> {
    return this.getActiveSubscription();
  }

  hasActiveBusinessSubscription(): Observable<boolean> {
    return this.getBusinessAccessSnapshot({ forceRefresh: true }).pipe(
      map((snapshot) => snapshot.hasBusinessAccess),
      catchError(() => of(false))
    );
  }

  isBusinessTrialEligible(): Observable<boolean> {
    return of(false);
  }

  startBusinessTrial(): Observable<UserSubscription | null> {
    return this.getActiveSubscription();
  }

  activatePlan(_plan: Plan, _billingCycle: 'monthly' | 'yearly'): Observable<UserSubscription | null> {
    return this.getActiveSubscription();
  }

  hasPlanAccess(codes: string[]): Observable<boolean> {
    return this.getBusinessAccessSnapshot({ forceRefresh: true }).pipe(
      map((snapshot) => snapshot.hasBusinessAccess && codes.includes(snapshot.planCode))
    );
  }

  isBusinessOnboardingComplete(): Observable<boolean> {
    return this.businessCenter.getHubAccessState().pipe(
      map((state) => {
        const hasProfile = Boolean(state.profile?.id);
        const hasActiveMembership =
          Boolean(state.membership?.id) &&
          String(state.membership?.status ?? '').trim().toLowerCase() === 'active';
        return hasProfile || hasActiveMembership;
      }),
      catchError(() => of(true))
    );
  }

  markBusinessOnboardingComplete(): void {
    this.notifyAuthStateChanged();
  }

  grantLocalBusinessTrialNow(): void {
    this.notifyAuthStateChanged();
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
}
