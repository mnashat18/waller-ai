import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type ExportJob = {
  id?: string | number;
  name: string;
  dataset: string;
  format: 'csv' | 'pdf';
  schedule_type: 'one_time' | 'daily' | 'weekly' | 'monthly';
  next_run_at?: string;
  status?: string;
  file_url?: string;
  date_created?: string;
};

export type MessageInvite = {
  id?: string | number;
  recipient_name: string;
  phone: string;
  channel: 'whatsapp' | 'sms';
  message_template: string;
  status?: string;
  sent_at?: string;
  date_created?: string;
};

export type BusinessLocation = {
  id?: string | number;
  name: string;
  code?: string;
  city?: string;
  country?: string;
  address?: string;
  manager_name?: string;
  is_active?: boolean;
  date_created?: string;
};

export type AutomationRule = {
  id?: string | number;
  rule_name: string;
  trigger_type: string;
  action_type: string;
  threshold?: number;
  cooldown_minutes?: number;
  is_active: boolean;
  status?: string;
  date_created?: string;
};

export type BusinessInvoice = {
  id?: string | number;
  invoice_number?: string;
  amount_usd?: number;
  due_date?: string;
  status?: string;
  billing_cycle?: string;
  date_created?: string;
};

export type BillingProfileInput = {
  companyLegalName: string;
  taxId: string;
  billingEmail: string;
  accountsPhone: string;
  address: string;
};

type AccessContext = {
  token: string | null;
  userId: string | null;
};

type ActionResult = {
  ok: boolean;
  message: string;
};

@Injectable({ providedIn: 'root' })
export class BusinessCenterService {
  private api = environment.API_URL;
  private exportJobsForbidden = false;
  private messageInvitesForbidden = false;
  private locationsForbidden = false;
  private rulesForbidden = false;
  private invoicesForbidden = false;

  constructor(private http: HttpClient) {}

  listExportJobs(limit = 25): Observable<ExportJob[]> {
    if (this.exportJobsForbidden) {
      return of([]);
    }

    const access = this.getAccessContext();
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,name,dataset,format,schedule_type,next_run_at,status,file_url,date_created'
    });
    return this.withActiveBusinessListAccess(() =>
      this.http.get<{ data?: ExportJob[] }>(
        `${this.api}/items/business_export_jobs?${params.toString()}`,
        this.requestOptions(access.token)
      ).pipe(
        map((res) => res.data ?? []),
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.exportJobsForbidden = true;
          }
          this.rememberAccessError(err, 'Business export center is not accessible with your current backend permissions.');
          return of([]);
        })
      )
    );
  }

  createExportJob(payload: ExportJob): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      name: payload.name,
      dataset: payload.dataset,
      format: payload.format,
      schedule_type: payload.schedule_type,
      next_run_at: payload.next_run_at ?? null,
      status: 'Queued',
      requested_by_user: access.userId ?? undefined,
      requested_at: new Date().toISOString()
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_export_jobs`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Export job queued successfully.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to queue export job.') }))
      )
    );
  }

  listMessageInvites(limit = 25): Observable<MessageInvite[]> {
    if (this.messageInvitesForbidden) {
      return of([]);
    }

    const access = this.getAccessContext();
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,recipient_name,phone,channel,message_template,status,sent_at,date_created'
    });
    return this.withActiveBusinessListAccess(() =>
      this.http.get<{ data?: MessageInvite[] }>(
        `${this.api}/items/business_message_invites?${params.toString()}`,
        this.requestOptions(access.token)
      ).pipe(
        map((res) => res.data ?? []),
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.messageInvitesForbidden = true;
          }
          this.rememberAccessError(err, 'Business invites are not accessible with your current backend permissions.');
          return of([]);
        })
      )
    );
  }

  createMessageInvite(payload: MessageInvite): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      recipient_name: payload.recipient_name,
      phone: payload.phone,
      channel: payload.channel,
      message_template: payload.message_template,
      status: 'Queued',
      requested_by_user: access.userId ?? undefined,
      sent_at: new Date().toISOString()
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_message_invites`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Message invite queued.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to queue message invite.') }))
      )
    );
  }

  listLocations(limit = 50): Observable<BusinessLocation[]> {
    if (this.locationsForbidden) {
      return of([]);
    }

    const access = this.getAccessContext();
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,name,code,city,country,address,manager_name,is_active,date_created'
    });
    return this.withActiveBusinessListAccess(() =>
      this.http.get<{ data?: BusinessLocation[] }>(
        `${this.api}/items/business_locations?${params.toString()}`,
        this.requestOptions(access.token)
      ).pipe(
        map((res) => res.data ?? []),
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.locationsForbidden = true;
          }
          this.rememberAccessError(err, 'Business locations are not accessible with your current backend permissions.');
          return of([]);
        })
      )
    );
  }

  createLocation(payload: BusinessLocation): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      name: payload.name,
      code: payload.code ?? null,
      city: payload.city ?? null,
      country: payload.country ?? null,
      address: payload.address ?? null,
      manager_name: payload.manager_name ?? null,
      is_active: payload.is_active !== false,
      owner_user: access.userId ?? undefined
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_locations`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Location added.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to add location.') }))
      )
    );
  }

  listAutomationRules(limit = 50): Observable<AutomationRule[]> {
    if (this.rulesForbidden) {
      return of([]);
    }

    const access = this.getAccessContext();
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,rule_name,trigger_type,action_type,threshold,cooldown_minutes,is_active,status,date_created'
    });
    return this.withActiveBusinessListAccess(() =>
      this.http.get<{ data?: AutomationRule[] }>(
        `${this.api}/items/business_automation_rules?${params.toString()}`,
        this.requestOptions(access.token)
      ).pipe(
        map((res) => res.data ?? []),
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.rulesForbidden = true;
          }
          this.rememberAccessError(err, 'Business automation rules are not accessible with your current backend permissions.');
          return of([]);
        })
      )
    );
  }

  createAutomationRule(payload: AutomationRule): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      rule_name: payload.rule_name,
      trigger_type: payload.trigger_type,
      action_type: payload.action_type,
      threshold: payload.threshold ?? null,
      cooldown_minutes: payload.cooldown_minutes ?? null,
      is_active: payload.is_active,
      status: payload.is_active ? 'Active' : 'Paused',
      owner_user: access.userId ?? undefined
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_automation_rules`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Automation rule created.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to create automation rule.') }))
      )
    );
  }

  toggleAutomationRule(rule: AutomationRule): Observable<ActionResult> {
    if (!rule.id) {
      return of({ ok: false, message: 'Rule ID is missing.' });
    }
    const access = this.getAccessContext();
    const isActive = !rule.is_active;
    return this.withActiveBusinessActionAccess(() =>
      this.http.patch(
        `${this.api}/items/business_automation_rules/${encodeURIComponent(String(rule.id))}`,
        {
          is_active: isActive,
          status: isActive ? 'Active' : 'Paused'
        },
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: isActive ? 'Rule activated.' : 'Rule paused.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to update rule.') }))
      )
    );
  }

  listInvoices(limit = 25): Observable<BusinessInvoice[]> {
    if (this.invoicesForbidden) {
      return of([]);
    }

    const access = this.getAccessContext();
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: String(limit),
      fields: 'id,invoice_number,amount_usd,due_date,status,billing_cycle,date_created'
    });
    return this.withActiveBusinessListAccess(() =>
      this.http.get<{ data?: BusinessInvoice[] }>(
        `${this.api}/items/business_invoices?${params.toString()}`,
        this.requestOptions(access.token)
      ).pipe(
        map((res) => (res.data ?? []).map((invoice) => ({
          ...invoice,
          amount_usd: this.toNumber(invoice.amount_usd)
        }))),
        catchError((err) => {
          if (this.isForbiddenError(err)) {
            this.invoicesForbidden = true;
          }
          this.rememberAccessError(err, 'Business billing data is not accessible with your current backend permissions.');
          return of([]);
        })
      )
    );
  }

  requestRenewal(cycle: 'monthly' | 'yearly', note: string): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      desired_cycle: cycle === 'yearly' ? 'Yearly' : 'Monthly',
      note: note || null,
      status: 'Pending',
      requested_by_user: access.userId ?? undefined,
      requested_at: new Date().toISOString()
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_renewal_requests`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Renewal request submitted.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to submit renewal request.') }))
      )
    );
  }

  saveBillingProfile(profile: BillingProfileInput): Observable<ActionResult> {
    const access = this.getAccessContext();
    const body = {
      company_legal_name: profile.companyLegalName,
      tax_id: profile.taxId || null,
      billing_email: profile.billingEmail,
      accounts_phone: profile.accountsPhone || null,
      address: profile.address || null,
      status: 'Active'
    };
    return this.withActiveBusinessActionAccess(() =>
      this.http.post(
        `${this.api}/items/business_billing_profiles`,
        body,
        this.requestOptions(access.token)
      ).pipe(
        map(() => ({ ok: true, message: 'Billing profile saved.' })),
        catchError((err) => of({ ok: false, message: this.readError(err, 'Failed to save billing profile.') }))
      )
    );
  }

  private withActiveBusinessListAccess<T>(factory: () => Observable<T[]>): Observable<T[]> {
    return factory().pipe(
      catchError(() => of([] as T[]))
    );
  }

  private withActiveBusinessActionAccess(factory: () => Observable<ActionResult>): Observable<ActionResult> {
    return factory().pipe(
      catchError(() =>
        of({
          ok: false,
          message: 'Business access validation failed.'
        })
      )
    );
  }

  private requestOptions(token: string | null) {
    const headers = this.buildAuthHeaders(token);
    return headers ? { headers } : {};
  }

  private getAccessContext(): AccessContext {
    const token = this.getToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const userIdValue = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    const userId = typeof userIdValue === 'string' && userIdValue ? userIdValue : null;
    return { token, userId };
  }

  private getToken(): string | null {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return token;
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token) {
      return null;
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
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

  private readError(err: any, fallback: string): string {
    return (
      err?.error?.errors?.[0]?.message ||
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.message ||
      fallback
    );
  }

  private rememberAccessError(err: any, fallback: string) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const reason = this.readError(err, fallback);
    try {
      localStorage.setItem('business_center_last_error', reason);
    } catch {
      // ignore storage errors
    }
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private isForbiddenError(err: any): boolean {
    return err?.status === 401 || err?.status === 403;
  }
}

