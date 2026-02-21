import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type BusinessUpgradeRequestInput = {
  companyName: string;
  businessName: string;
  ownerName: string;
  workEmail: string;
  phone: string;
  industry: string;
  teamSize: string;
  country: string;
  city: string;
  address: string;
  website: string;
  notes: string;
  billingCycle: 'monthly' | 'yearly';
  basePriceUsd: number;
  discountUsd: number;
  finalPriceUsd: number;
  isNewUserOffer: boolean;
};

export type BusinessUpgradeSubmitResult = {
  ok: boolean;
  id?: string | number;
  reason?: string;
};

@Injectable({ providedIn: 'root' })
export class BusinessUpgradeService {
  private api = environment.API_URL;
  private readonly requestTimeoutMs = 15000;

  constructor(private http: HttpClient) {}

  syncUserPhone(phone: string): Observable<BusinessUpgradeSubmitResult> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      return of({
        ok: false,
        reason: 'Phone number is required to activate Business access.'
      });
    }

    const token = this.getToken();
    const headers = this.buildAuthHeaders(token);

    if (!headers) {
      return of({
        ok: false,
        reason: 'Session expired. Please login again before payment activation.'
      });
    }

    return this.http.patch(
      `${this.api}/users/me`,
      { phone: normalizedPhone },
      { headers }
    ).pipe(
      timeout(this.requestTimeoutMs),
      map(() => ({ ok: true })),
      catchError((err) =>
        of({
          ok: false,
          reason: this.resolvePhoneSyncError(err)
        } as BusinessUpgradeSubmitResult)
      )
    );
  }

  submitRequest(input: BusinessUpgradeRequestInput): Observable<BusinessUpgradeSubmitResult> {
    const token = this.getToken();
    const headers = this.buildAuthHeaders(token);
    if (!headers) {
      return of({
        ok: false,
        reason: 'Session expired. Please login again before payment activation.'
      });
    }

    // Keep create payload limited to business profile fields.
    // System fields (requested_by_user/requested_at/status/plan fields) are expected
    // to be injected by Directus presets/policies.
    const payload = {
      company_name: input.companyName,
      business_name: input.businessName,
      owner_name: input.ownerName,
      work_email: input.workEmail,
      phone: input.phone,
      industry: input.industry,
      team_size: input.teamSize,
      country: input.country,
      city: input.city,
      address: input.address,
      website: input.website
    };

    return this.http.post<{ data?: { id?: string | number } }>(
      `${this.api}/items/business_upgrade_requests`,
      payload,
      { headers }
    ).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => ({ ok: true, id: res?.data?.id })),
      catchError((err) =>
        of({
          ok: false,
          reason: this.resolveUpgradeSubmitError(err)
        } as BusinessUpgradeSubmitResult)
      )
    );
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private getToken(): string | null {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return token;
  }

  private getUserIdFromToken(token: string | null): string | null {
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

  private normalizePhone(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/\s+/g, '');
  }

  private resolvePhoneSyncError(err: any): string {
    const message = this.readErrorMessage(err, '');
    const normalized = message.toLowerCase();

    if (
      normalized.includes('permission') ||
      normalized.includes('directus_users') ||
      normalized.includes("doesn't have permission") ||
      normalized.includes('forbidden')
    ) {
      return 'Phone could not be saved to your account profile because backend permissions for users are missing. Please allow updating Users (own), then try again.';
    }

    if (
      normalized.includes('connection refused') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror')
    ) {
      return 'Could not reach backend services while saving phone number. Please retry shortly.';
    }

    return 'Could not save phone number to your account profile right now. Please try again shortly.';
  }

  private resolveUpgradeSubmitError(err: any): string {
    const message = this.readErrorMessage(err, '');
    const normalized = message.toLowerCase();

    if (
      normalized.includes('permission to access field') ||
      normalized.includes('field') && normalized.includes('queried in root')
    ) {
      return 'Create permission موجودة، لكن في حقول داخل payload مش متاحة في Field Permissions. فعّل الحقول المستخدمة في Create أو خفّض الحقول المرسلة.';
    }

    if (
      normalized.includes('permission') ||
      normalized.includes("doesn't have permission") ||
      normalized.includes('forbidden')
    ) {
      return 'Your account cannot create Business activation requests right now. In Directus, allow Create on business_upgrade_requests for authenticated users.';
    }

    if (
      normalized.includes('unauthorized') ||
      normalized.includes('invalid token') ||
      normalized.includes('token')
    ) {
      return 'Session expired. Please login again before payment activation.';
    }

    if (
      normalized.includes('connection refused') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('timeout')
    ) {
      return 'Could not reach backend services while submitting payment activation request. Please retry shortly.';
    }

    return 'Failed to submit payment activation request.';
  }

  private readErrorMessage(err: any, fallback: string): string {
    if (!err) {
      return fallback;
    }
    return (
      err?.error?.errors?.[0]?.message ||
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.error ||
      err?.message ||
      fallback
    );
  }
}
