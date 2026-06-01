import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export type BusinessUpgradeRequestInput = {
  businessName: string;
  companyName?: string;
  contactName?: string;
  workEmail?: string;
  phone?: string;
  industry?: string;
  teamSize?: string;
  country?: string;
  city?: string;
  address?: string;
  website?: string;
  billingCycle?: 'monthly' | 'yearly';
};

export type BusinessUpgradeSubmitResult = {
  ok: boolean;
  id?: string | null;
  reason?: string;
};

@Injectable({ providedIn: 'root' })
export class BusinessUpgradeService {
  syncUserPhone(_phone: string): Observable<BusinessUpgradeSubmitResult> {
    return of({
      ok: false,
      reason: 'Workspace activation is no longer handled from this screen.'
    });
  }

  submitRequest(_input: BusinessUpgradeRequestInput): Observable<BusinessUpgradeSubmitResult> {
    return of({
      ok: false,
      reason: 'Workspace activation is no longer handled from this screen.'
    });
  }
}
