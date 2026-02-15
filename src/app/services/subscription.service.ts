import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
};

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private api = environment.API_URL;

  constructor(private http: HttpClient) {}

  getPlans(): Observable<Plan[]> {
    const params = new URLSearchParams({
      'sort': 'sort_order',
      'filter[is_active][_eq]': 'true',
      'limit': '50'
    });
    return this.http.get<{ data?: Plan[] }>(
      `${this.api}/items/plans?${params.toString()}`
    ).pipe(
      map(res => (res.data ?? []).map((plan) => this.normalizePlan(plan))),
      catchError(() => of([]))
    );
  }

  getActiveSubscription(): Observable<UserSubscription | null> {
    const userId = this.getUserId();
    if (!userId) {
      return of(null);
    }

    const params = new URLSearchParams({
      'sort': '-date_created',
      'limit': '1',
      'filter[user_created][_eq]': userId,
      'filter[status][_eq]': 'Active',
      'fields': 'id,status,billing_cycle,date_created,expires_at,plan.id,plan.name,plan.code,plan.description,plan.monthly_price,plan.yearly_price,plan.features,plan.is_popular,plan.is_active,plan.sort_order'
    });

    return this.http.get<{ data?: Array<any> }>(
      `${this.api}/items/subscriptions?${params.toString()}`
    ).pipe(
      map(res => {
        const record = res.data?.[0];
        if (!record) {
          return null;
        }
        return {
          id: record.id,
          status: record.status,
          billing_cycle: this.fromApiBillingCycle(record.billing_cycle),
          date_created: record.date_created,
          expires_at: record.expires_at,
          plan: record.plan ? this.normalizePlan(record.plan) : null
        } as UserSubscription;
      }),
      catchError(() => of(null))
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
          return this.http.patch(
            `${this.api}/items/subscriptions/${encodeURIComponent(String(current.id))}`,
            { status: 'Canceled' }
          ).pipe(
            catchError(() => of(null)),
            switchMap(() => this.createSubscription(userId, plan, billingCycle))
          );
        }
        return this.createSubscription(userId, plan, billingCycle);
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

  private createSubscription(userId: string, plan: Plan, billingCycle: 'monthly' | 'yearly') {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt);
    if (billingCycle === 'yearly') {
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
        const record = res.data ?? payload;
        return {
          id: record.id,
          status: record.status,
          billing_cycle: this.fromApiBillingCycle(record.billing_cycle),
          date_created: record.date_created,
          expires_at: record.expires_at,
          plan: this.normalizePlan(plan)
        } as UserSubscription;
      })
    );
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
    const token = localStorage.getItem('token');
    if (!token) {
      return null;
    }
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' && id ? id : null;
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
}
