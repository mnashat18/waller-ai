import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

type LocalTrialState = {
  started_at: string;
  expires_at: string;
};

type SubscriptionOwnerField = 'user';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private api = environment.API_URL;
  private readonly businessPlanCode = 'business';
  private readonly businessTrialDays = 14;
  private readonly dayMs = 24 * 60 * 60 * 1000;
  private readonly localTrialStoragePrefix = 'wellar_business_trial_v1_';
  private readonly businessOnboardingStoragePrefix = 'wellar_business_onboarding_v1_';
  private readonly fallbackBusinessMonthlyPrice = 200;
  private readonly fallbackBusinessYearlyPrice = 1680;
  private plansEndpointForbidden = false;
  private subscriptionsEndpointForbidden = false;
  private subscriptionOwnerFilterUnavailable = false;
  private businessUpgradeRequestsEndpointForbidden = false;
  private readonly subscriptionFields = [
    'id',
    'status',
    'billing_cycle',
    'date_created',
    'expires_at',
    'plan.id',
    'plan.name',
    'plan.code',
    'plan.description',
    'plan.monthly_price',
    'plan.yearly_price',
    'plan.features',
    'plan.is_popular',
    'plan.is_active',
    'plan.sort_order'
  ].join(',');

  constructor(private http: HttpClient) {}

  getPlans(): Observable<Plan[]> {
    if (this.plansEndpointForbidden) {
      return of([]);
    }

    const params = new URLSearchParams({
      'sort': 'sort_order',
      'filter[is_active][_eq]': 'true',
      'limit': '50'
    });
    return this.http.get<{ data?: Plan[] }>(
      `${this.api}/items/plans?${params.toString()}`
    ).pipe(
      map(res => (res.data ?? []).map((plan) => this.normalizePlan(plan))),
      catchError((err) => {
        if (this.isForbiddenError(err)) {
          this.plansEndpointForbidden = true;
        }
        return of([]);
      })
    );
  }

  getBusinessAccessSnapshot(): Observable<BusinessAccessSnapshot> {
    const userId = this.getUserId();
    if (!userId) {
      return of({
        planCode: 'free',
        hasBusinessAccess: false,
        isBusinessTrial: false,
        daysRemaining: null,
        trialExpired: false,
        trialExpiresAt: null
      });
    }

    return this.getActiveSubscription().pipe(
      map((subscription) => this.buildBusinessAccessSnapshot(userId, subscription)),
      catchError(() => of(this.buildBusinessAccessSnapshot(userId, null)))
    );
  }

  getActiveSubscription(): Observable<UserSubscription | null> {
    const userId = this.getUserId();
    if (!userId) {
      return of(null);
    }

    return this.fetchSubscriptionRecords(userId, 'Active', 10).pipe(
      map((records) => {
        let remoteActive: UserSubscription | null = null;
        for (const record of records) {
          const subscription = this.normalizeSubscription(record);
          if (this.hasActiveBusinessStatus(subscription)) {
            remoteActive = subscription;
            break;
          }
        }
        return this.resolveEffectiveSubscription(userId, remoteActive);
      }),
      catchError(() => of(this.resolveEffectiveSubscription(userId, null)))
    );
  }

  ensureBusinessTrial(): Observable<UserSubscription | null> {
    return this.getActiveSubscription().pipe(
      catchError(() => of(null))
    );
  }

  hasActiveBusinessSubscription(): Observable<boolean> {
    return this.getActiveSubscription().pipe(
      map((subscription) => this.hasActiveBusinessStatus(subscription)),
      catchError(() => of(false))
    );
  }

  isBusinessTrialEligible(): Observable<boolean> {
    const userId = this.getUserId();
    if (!userId) {
      return of(false);
    }

    return this.fetchSubscriptionRecords(userId, undefined, 50).pipe(
      map((records) => {
        const hadBusinessBefore = records.some((record) => {
          const code = (record?.plan?.code ?? '').toString().toLowerCase();
          return code === this.businessPlanCode;
        });
        return !hadBusinessBefore;
      }),
      catchError(() => of(true))
    );
  }

  startBusinessTrial(): Observable<UserSubscription | null> {
    const userId = this.getUserId();
    if (!userId) {
      return of(null);
    }

    return this.ensureBusinessTrial().pipe(
      switchMap((existing) => {
        const planCode = (existing?.plan?.code ?? '').toLowerCase();
        if (planCode === this.businessPlanCode && existing && this.isSubscriptionCurrentlyActive(existing)) {
          return of(existing);
        }

        return this.isBusinessTrialEligible().pipe(
          switchMap((eligible) => {
            if (!eligible) {
              return this.ensureBusinessTrial();
            }
            return this.createBusinessTrial().pipe(
              switchMap((created) => {
                if (created) {
                  return this.ensureBusinessTrial().pipe(
                    map((synced) => synced ?? created)
                  );
                }

                // Fallback only after explicit activation attempt.
                this.ensureLocalTrialState(userId);
                const localTrial = this.getLocalTrialSubscription(userId, false);
                if (localTrial) {
                  return of(localTrial);
                }
                return this.ensureBusinessTrial();
              }),
              catchError(() => {
                this.ensureLocalTrialState(userId);
                const localTrial = this.getLocalTrialSubscription(userId, false);
                if (localTrial) {
                  return of(localTrial);
                }
                return this.ensureBusinessTrial();
              })
            );
          })
        );
      }),
      catchError(() =>
        this.ensureBusinessTrial().pipe(
          catchError(() => of(null))
        )
      )
    );
  }

  activatePlan(plan: Plan, billingCycle: 'monthly' | 'yearly'): Observable<UserSubscription | null> {
    const userId = this.getUserId();
    if (!userId) {
      return of(null);
    }

    return this.getActiveSubscription().pipe(
      switchMap((current) => {
        if (current?.id) {
          return this.cancelSubscription(current.id).pipe(
            catchError(() => of(null)),
            switchMap(() => this.createSubscription(plan, billingCycle))
          );
        }
        return this.createSubscription(plan, billingCycle);
      })
    );
  }

  hasPlanAccess(codes: string[]): Observable<boolean> {
    return this.getActiveSubscription().pipe(
      map((sub) => {
        const code = (sub?.plan?.code ?? '').toLowerCase();
        return !!code && codes.includes(code);
      })
    );
  }

  isBusinessOnboardingComplete(): Observable<boolean> {
    const userId = this.getUserId();
    if (!userId) {
      return of(true);
    }

    const localMarker = this.readBusinessOnboardingMarker(userId);
    if (localMarker) {
      return of(true);
    }

    return this.getActiveSubscription().pipe(
      switchMap((subscription) => {
        if (this.hasActiveBusinessStatus(subscription)) {
          this.writeBusinessOnboardingMarker(userId, true);
          return of(true);
        }

        return this.fetchLatestBusinessUpgradeRequest(userId).pipe(
          map((hasUpgradeRequest) => {
            if (hasUpgradeRequest) {
              this.writeBusinessOnboardingMarker(userId, true);
            }
            return hasUpgradeRequest;
          }),
          catchError(() => of(false))
        );
      }),
      catchError(() =>
        this.fetchLatestBusinessUpgradeRequest(userId).pipe(
          map((hasUpgradeRequest) => {
            if (hasUpgradeRequest) {
              this.writeBusinessOnboardingMarker(userId, true);
            }
            return hasUpgradeRequest;
          }),
          catchError(() => of(localMarker))
        )
      )
    );
  }

  markBusinessOnboardingComplete(): void {
    const userId = this.getUserId();
    if (!userId) {
      return;
    }
    this.writeBusinessOnboardingMarker(userId, true);
  }

  private createSubscription(
    plan: Plan,
    billingCycle: 'monthly' | 'yearly',
    durationDays?: number
  ) {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt);
    if (typeof durationDays === 'number' && durationDays > 0) {
      expiresAt.setDate(expiresAt.getDate() + durationDays);
    } else if (billingCycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    const payload = {
      plan: plan.id ?? plan.code,
      status: 'Active',
      billing_cycle: this.toApiBillingCycle(billingCycle),
      expires_at: expiresAt.toISOString()
    };

    return this.http.post<{ data?: any }>(
      `${this.api}/items/subscriptions`,
      payload
    ).pipe(
      map((res) => {
        const record = res.data ?? {};
        const created: UserSubscription = {
          id: record.id,
          status: typeof record.status === 'string' ? record.status : payload.status,
          billing_cycle: this.fromApiBillingCycle(record.billing_cycle ?? payload.billing_cycle),
          date_created: typeof record.date_created === 'string' ? record.date_created : startedAt.toISOString(),
          expires_at: typeof record.expires_at === 'string' ? record.expires_at : payload.expires_at,
          plan: this.normalizePlan(plan)
        };
        return this.withDerivedState(created);
      })
    );
  }

  private createBusinessTrial(): Observable<UserSubscription | null> {
    return this.getPlans().pipe(
      map((plans) => plans.find((plan) => (plan.code ?? '').toLowerCase() === this.businessPlanCode) ?? null),
      switchMap((businessPlan) => {
        if (!businessPlan) {
          return of(null);
        }
        return this.createSubscription(businessPlan, 'monthly', this.businessTrialDays).pipe(
          catchError(() => of(null))
        );
      }),
      catchError(() => of(null))
    );
  }

  private resolveEffectiveSubscription(
    userId: string,
    remoteSubscription: UserSubscription | null
  ): UserSubscription | null {
    if (this.hasActiveBusinessStatus(remoteSubscription)) {
      return remoteSubscription;
    }

    const localTrial = this.getLocalTrialSubscription(userId, false);
    if (localTrial && this.isSubscriptionCurrentlyActive(localTrial)) {
      return localTrial;
    }

    if (remoteSubscription && this.isSubscriptionCurrentlyActive(remoteSubscription)) {
      return remoteSubscription;
    }

    return null;
  }

  private buildBusinessAccessSnapshot(
    userId: string,
    subscription: UserSubscription | null
  ): BusinessAccessSnapshot {
    const hasBusinessAccess = this.hasActiveBusinessStatus(subscription);
    const planCode = hasBusinessAccess
      ? (subscription?.plan?.code ?? this.businessPlanCode).toLowerCase()
      : 'free';

    const localTrial = this.readLocalTrialState(userId);
    const localTrialExpiresAt = localTrial?.expires_at ?? null;
    const localTrialExpiryTs = this.toTimestamp(localTrialExpiresAt ?? undefined);
    const trialExpired =
      !hasBusinessAccess &&
      Boolean(localTrial) &&
      localTrialExpiryTs !== null &&
      localTrialExpiryTs <= Date.now();

    return {
      planCode,
      hasBusinessAccess,
      isBusinessTrial: Boolean(subscription?.is_trial),
      daysRemaining:
        typeof subscription?.days_remaining === 'number'
          ? subscription.days_remaining
          : null,
      trialExpired,
      trialExpiresAt: localTrialExpiresAt ?? subscription?.expires_at ?? null
    };
  }

  private getLocalTrialSubscription(userId: string, createIfMissing = true): UserSubscription | null {
    const state = createIfMissing
      ? this.ensureLocalTrialState(userId)
      : this.readLocalTrialState(userId);

    if (!state) {
      return null;
    }

    const expiresAt = this.toTimestamp(state.expires_at);
    if (expiresAt === null || expiresAt <= Date.now()) {
      return null;
    }

    const subscription: UserSubscription = {
      id: `local-trial-${userId}`,
      status: 'Active',
      billing_cycle: 'monthly',
      date_created: state.started_at,
      expires_at: state.expires_at,
      plan: {
        id: 'local-business-trial',
        name: 'Business',
        code: this.businessPlanCode,
        description: 'New user Business trial',
        monthly_price: this.fallbackBusinessMonthlyPrice,
        yearly_price: this.fallbackBusinessYearlyPrice,
        features: [],
        is_active: true
      }
    };

    return this.withDerivedState(subscription);
  }

  private ensureLocalTrialState(userId: string): LocalTrialState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const existing = this.readLocalTrialState(userId);
    if (existing) {
      return existing;
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + this.businessTrialDays * this.dayMs);
    const created: LocalTrialState = {
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    this.writeLocalTrialState(userId, created);
    return created;
  }

  private fetchLatestBusinessUpgradeRequest(userId: string): Observable<boolean> {
    if (this.businessUpgradeRequestsEndpointForbidden) {
      // If role cannot read this collection, do not block onboarding flow.
      return of(true);
    }

    const token = this.getUserToken();
    const headers = token
      ? new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
      : undefined;

    const params = new URLSearchParams({
      'filter[requested_by_user][_eq]': userId,
      'sort': '-requested_at',
      'limit': '1',
      'fields': 'id'
    });

    return this.http.get<{ data?: Array<{ id?: string | number }> }>(
      `${this.api}/items/business_upgrade_requests?${params.toString()}`,
      headers ? { headers } : {}
    ).pipe(
      map((res) => Array.isArray(res?.data) && res.data.length > 0),
      catchError((err) => {
        if (this.isForbiddenError(err)) {
          this.businessUpgradeRequestsEndpointForbidden = true;
          return of(true);
        }
        return of(false);
      })
    );
  }

  private readLocalTrialState(userId: string): LocalTrialState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(this.localTrialStorageKey(userId));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<LocalTrialState>;
      if (
        typeof parsed?.started_at !== 'string' ||
        !parsed.started_at ||
        typeof parsed?.expires_at !== 'string' ||
        !parsed.expires_at
      ) {
        return null;
      }

      return {
        started_at: parsed.started_at,
        expires_at: parsed.expires_at
      };
    } catch {
      return null;
    }
  }

  private writeLocalTrialState(userId: string, state: LocalTrialState): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.localTrialStorageKey(userId), JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }

  private localTrialStorageKey(userId: string): string {
    return `${this.localTrialStoragePrefix}${userId}`;
  }

  private businessOnboardingStorageKey(userId: string): string {
    return `${this.businessOnboardingStoragePrefix}${userId}`;
  }

  private readBusinessOnboardingMarker(userId: string): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    return localStorage.getItem(this.businessOnboardingStorageKey(userId)) === '1';
  }

  private writeBusinessOnboardingMarker(userId: string, completed: boolean): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      if (completed) {
        localStorage.setItem(this.businessOnboardingStorageKey(userId), '1');
      } else {
        localStorage.removeItem(this.businessOnboardingStorageKey(userId));
      }
    } catch {
      // ignore storage errors
    }
  }

  private fetchSubscriptionRecords(userId: string, status?: string, limit = 1): Observable<any[]> {
    if (this.subscriptionsEndpointForbidden) {
      return of([]);
    }

    if (this.subscriptionOwnerFilterUnavailable) {
      return this.fetchSubscriptionRecordsWithoutOwnerFilter(status, limit).pipe(
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.subscriptionsEndpointForbidden = true;
          }
          return of([]);
        })
      );
    }

    const ownerField: SubscriptionOwnerField = 'user';

    return this.fetchSubscriptionRecordsByOwnerField(userId, ownerField, status, limit).pipe(
      catchError((err) => {
        if (!this.isForbiddenError(err)) {
          return of([]);
        }

        if (this.isOwnerFieldFilterUnavailable(err)) {
          this.subscriptionOwnerFilterUnavailable = true;
          return this.fetchSubscriptionRecordsWithoutOwnerFilter(status, limit).pipe(
            catchError((noOwnerErr) => {
              if (this.isForbiddenError(noOwnerErr)) {
                this.subscriptionsEndpointForbidden = true;
              }
              return of([]);
            })
          );
        }

        this.subscriptionsEndpointForbidden = true;
        return of([]);
      })
    );
  }

  private fetchSubscriptionRecordsWithoutOwnerFilter(status?: string, limit = 1): Observable<any[]> {
    const params = new URLSearchParams({
      'sort': '-date_created',
      'limit': String(limit),
      'fields': this.subscriptionFields
    });

    if (status) {
      params.set('filter[status][_eq]', status);
    }

    return this.http.get<{ data?: Array<any> }>(
      `${this.api}/items/subscriptions?${params.toString()}`
    ).pipe(
      map((res) => res.data ?? []),
      catchError((err) => {
        if (this.isForbiddenError(err)) {
          throw err;
        }
        return of([]);
      })
    );
  }

  private fetchSubscriptionRecordsByOwnerField(
    userId: string,
    ownerField: SubscriptionOwnerField,
    status?: string,
    limit = 1
  ): Observable<any[]> {
    const params = new URLSearchParams({
      'sort': '-date_created',
      'limit': String(limit),
      'fields': this.subscriptionFields
    });
    params.set(`filter[${ownerField}][_eq]`, userId);

    if (status) {
      params.set('filter[status][_eq]', status);
    }

    return this.http.get<{ data?: Array<any> }>(
      `${this.api}/items/subscriptions?${params.toString()}`
    ).pipe(
      map((res) => res.data ?? []),
      catchError((err) => {
        if (this.isForbiddenError(err)) {
          throw err;
        }
        return of([]);
      })
    );
  }

  private normalizeSubscription(record: any | null | undefined): UserSubscription | null {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const subscription: UserSubscription = {
      id: record.id,
      status: typeof record.status === 'string' ? record.status : '',
      billing_cycle: this.fromApiBillingCycle(record.billing_cycle),
      date_created: typeof record.date_created === 'string' ? record.date_created : undefined,
      expires_at: typeof record.expires_at === 'string' ? record.expires_at : undefined,
      plan: record.plan ? this.normalizePlan(record.plan) : null
    };

    return this.withDerivedState(subscription);
  }

  private withDerivedState(subscription: UserSubscription): UserSubscription {
    const daysRemaining = this.calculateDaysRemaining(subscription.expires_at);
    return {
      ...subscription,
      is_trial: this.isBusinessTrial(subscription),
      days_remaining: daysRemaining
    };
  }

  private normalizePlan(plan: any): Plan {
    return {
      id: plan.id,
      name: plan.name ?? plan.code ?? 'Plan',
      code: (plan.code ?? plan.name ?? 'free').toString().toLowerCase(),
      description: plan.description ?? '',
      monthly_price: this.toNumber(plan.monthly_price),
      yearly_price: this.toNumber(plan.yearly_price),
      features: Array.isArray(plan.features) ? plan.features : [],
      is_popular: Boolean(plan.is_popular),
      is_active: plan.is_active !== false,
      sort_order: this.toNumber(plan.sort_order)
    };
  }

  private toApiBillingCycle(cycle: 'monthly' | 'yearly'): 'Monthly' | 'Yearly' {
    return cycle === 'yearly' ? 'Yearly' : 'Monthly';
  }

  private fromApiBillingCycle(value?: string): 'monthly' | 'yearly' {
    return (value ?? '').toString().toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
  }

  private cancelSubscription(subscriptionId: string | number) {
    return this.http.patch(
      `${this.api}/items/subscriptions/${encodeURIComponent(String(subscriptionId))}`,
      { status: 'Canceled' }
    );
  }

  private isStatusActive(status: string): boolean {
    return status.trim().toLowerCase() === 'active';
  }

  private isSubscriptionCurrentlyActive(subscription: UserSubscription): boolean {
    if (!this.isStatusActive(subscription.status)) {
      return false;
    }

    const expiresAt = this.toTimestamp(subscription.expires_at);
    if (expiresAt === null) {
      return true;
    }
    return expiresAt > Date.now();
  }

  private calculateDaysRemaining(expiresAt?: string): number | undefined {
    const expiresAtTs = this.toTimestamp(expiresAt);
    if (expiresAtTs === null) {
      return undefined;
    }
    const remainingMs = expiresAtTs - Date.now();
    if (remainingMs <= 0) {
      return 0;
    }
    return Math.ceil(remainingMs / this.dayMs);
  }

  private isBusinessTrial(subscription: UserSubscription): boolean {
    const code = (subscription.plan?.code ?? '').toLowerCase();
    if (code !== this.businessPlanCode) {
      return false;
    }

    const startedAtTs = this.toTimestamp(subscription.date_created);
    const expiresAtTs = this.toTimestamp(subscription.expires_at);
    if (startedAtTs === null || expiresAtTs === null || expiresAtTs <= startedAtTs) {
      return false;
    }

    const durationDays = (expiresAtTs - startedAtTs) / this.dayMs;
    return durationDays <= this.businessTrialDays + 1;
  }

  private toTimestamp(value?: string): number | null {
    if (!value) {
      return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private hasActiveBusinessStatus(subscription: UserSubscription | null): boolean {
    if (!subscription) {
      return false;
    }
    return this.isStatusActive(subscription.status);
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private getUserId(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (!token) {
      return null;
    }
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    if (typeof id === 'string' && id) {
      return id;
    }
    if (typeof id === 'number' && !Number.isNaN(id)) {
      return String(id);
    }
    return null;
  }

  private getUserToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (!token) {
      return null;
    }
    return this.isTokenExpired(token) ? null : token;
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

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    if (typeof exp !== 'number') {
      return false;
    }
    return Math.floor(Date.now() / 1000) >= exp;
  }

  private isForbiddenError(err: any): boolean {
    return err?.status === 401 || err?.status === 403;
  }

  private isOwnerFieldFilterUnavailable(err: any): boolean {
    const reason =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.message ||
      '';
    const normalized = String(reason).toLowerCase();

    if (!normalized.includes('permission to access field')) {
      return false;
    }

    return (
      normalized.includes('"user"') ||
      normalized.includes("'user'") ||
      normalized.includes('"user_created"') ||
      normalized.includes("'user_created'")
    );
  }

}
