import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type WorkspaceApplicationStatus = 'pending_review' | 'approved' | 'rejected' | 'closed';

export type WorkspaceApplicationRecord = {
  id: string;
  requestedByUserId: string | null;
  companyName: string | null;
  contactName: string | null;
  jobTitle: string | null;
  workEmail: string | null;
  industry: string | null;
  teamSize: string | null;
  country: string | null;
  useCase: string | null;
  phone: string | null;
  city: string | null;
  website: string | null;
  companyRegistrationNumber: string | null;
  expectedLaunchDate: string | null;
  message: string | null;
  status: WorkspaceApplicationStatus | string;
  submittedAt: string | null;
  reviewNote: string | null;
  createdBusinessProfileId: string | null;
};

export type WorkspaceApplicationInput = {
  company_name: string;
  contact_name: string;
  job_title: string;
  work_email: string;
  industry: string;
  team_size: string | number;
  country: string;
  use_case: string;
  phone?: string | null;
  city?: string | null;
  website?: string | null;
  company_registration_number?: string | null;
  expected_launch_date?: string | null;
  message?: string | null;
};

@Injectable({ providedIn: 'root' })
export class WorkspaceApplicationsService {
  private readonly api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listMyPendingApplications(userId: string | null, token?: string | null): Observable<WorkspaceApplicationRecord[]> {
    const normalizedUserId = this.normalizeId(userId);
    const accessToken = token ?? this.auth.getStoredAccessToken();

    if (!normalizedUserId || !accessToken) {
      return of([]);
    }

    const params = new URLSearchParams({
      limit: '1',
      sort: '-date_created',
      fields: [
        'id',
        'requested_by_user',
        'company_name',
        'contact_name',
        'job_title',
        'work_email',
        'industry',
        'team_size',
        'country',
        'use_case',
        'phone',
        'city',
        'website',
        'company_registration_number',
        'expected_launch_date',
        'message',
        'status',
        'review_note',
        'created_business_profile',
        'date_created'
      ].join(',')
    });
    params.set('filter[requested_by_user][_eq]', normalizedUserId);

    return this.http.get<{ data?: any[] }>(
      `${this.api}/items/workspace_applications?${params.toString()}&_ts=${Date.now()}`,
      {
        headers: this.auth.getAuthHeaders(accessToken),
        withCredentials: true
      }
    ).pipe(
      map((response) => (response.data ?? []).map((row) => this.normalizeRecord(row)).filter((row) => Boolean(row.id))),
      catchError((error) => {
        console.warn('[WorkspaceApplications] Could not load applications', error);
        return of([]);
      })
    );
  }

  async getMyApplications(userId: string | null, token?: string | null): Promise<WorkspaceApplicationRecord[]> {
    const normalizedUserId = this.normalizeId(userId);
    const accessToken = token ?? this.auth.getStoredAccessToken();

    if (!normalizedUserId || !accessToken) {
      return [];
    }

    const params = new URLSearchParams({
      limit: '1',
      sort: '-date_created',
      fields: [
        'id',
        'requested_by_user',
        'company_name',
        'contact_name',
        'job_title',
        'work_email',
        'industry',
        'team_size',
        'country',
        'use_case',
        'phone',
        'city',
        'website',
        'company_registration_number',
        'expected_launch_date',
        'message',
        'status',
        'review_note',
        'created_business_profile',
        'date_created'
      ].join(',')
    });
    params.set('filter[requested_by_user][_eq]', normalizedUserId);

    const response = await firstValueFrom(
      this.http.get<{ data?: any[] }>(
        `${this.api}/items/workspace_applications?${params.toString()}&_ts=${Date.now()}`,
        {
          headers: this.auth.getAuthHeaders(accessToken),
          withCredentials: true
        }
      )
    );

    return (response?.data ?? []).map((row) => this.normalizeRecord(row)).filter((row) => Boolean(row.id));
  }

  createApplication(
    input: WorkspaceApplicationInput,
    currentUserId: string | null,
    token?: string | null
  ): Observable<WorkspaceApplicationRecord | null> {
    const normalizedUserId = this.normalizeId(currentUserId);
    const accessToken = token ?? this.auth.getStoredAccessToken();

    if (!normalizedUserId || !accessToken) {
      return of(null);
    }

    const payload = {
      requested_by_user: normalizedUserId,
      status: 'pending_review',
      company_name: input.company_name,
      contact_name: input.contact_name,
      job_title: input.job_title,
      work_email: input.work_email,
      industry: input.industry,
      team_size: input.team_size,
      country: input.country,
      use_case: input.use_case,
      phone: input.phone ?? null,
      city: input.city ?? null,
      website: input.website ?? null,
      company_registration_number: input.company_registration_number ?? null,
      expected_launch_date: input.expected_launch_date ?? null,
      message: input.message ?? null
    };

    return this.http.post<{ data?: any }>(
      `${this.api}/items/workspace_applications`,
      payload,
      {
        headers: this.auth.getAuthHeaders(accessToken),
        withCredentials: true
      }
    ).pipe(
      map((response) => this.normalizeRecord(response?.data ?? response)),
      catchError((error) => {
        console.warn('[WorkspaceApplications] Could not create application', error);
        return of(null);
      })
    );
  }

  updateApplication(
    applicationId: string,
    input: WorkspaceApplicationInput,
    currentUserId: string | null,
    token?: string | null
  ): Observable<WorkspaceApplicationRecord | null> {
    const normalizedApplicationId = this.normalizeId(applicationId);
    const normalizedUserId = this.normalizeId(currentUserId);
    const accessToken = token ?? this.auth.getStoredAccessToken();

    if (!normalizedApplicationId || !normalizedUserId || !accessToken) {
      return of(null);
    }

    const payload = {
      requested_by_user: normalizedUserId,
      status: 'pending_review',
      company_name: input.company_name,
      contact_name: input.contact_name,
      job_title: input.job_title,
      work_email: input.work_email,
      industry: input.industry,
      team_size: input.team_size,
      country: input.country,
      use_case: input.use_case,
      phone: input.phone ?? null,
      city: input.city ?? null,
      website: input.website ?? null,
      company_registration_number: input.company_registration_number ?? null,
      expected_launch_date: input.expected_launch_date ?? null,
      message: input.message ?? null
    };

    return this.http.patch<{ data?: any }>(
      `${this.api}/items/workspace_applications/${encodeURIComponent(normalizedApplicationId)}`,
      payload,
      {
        headers: this.auth.getAuthHeaders(accessToken),
        withCredentials: true
      }
    ).pipe(
      map((response) => this.normalizeRecord(response?.data ?? response)),
      catchError((error) => {
        console.warn('[WorkspaceApplications] Could not update application', error);
        return of(null);
      })
    );
  }

  private normalizeRecord(raw: any): WorkspaceApplicationRecord {
    return {
      id: this.normalizeId(raw?.id) ?? '',
      requestedByUserId: this.normalizeId(raw?.requested_by_user),
      companyName: this.pickString(raw?.company_name),
      contactName: this.pickString(raw?.contact_name),
      jobTitle: this.pickString(raw?.job_title),
      workEmail: this.pickString(raw?.work_email),
      industry: this.pickString(raw?.industry),
      teamSize: this.pickString(raw?.team_size),
      country: this.pickString(raw?.country),
      useCase: this.pickString(raw?.use_case),
      phone: this.pickString(raw?.phone),
      city: this.pickString(raw?.city),
      website: this.pickString(raw?.website),
      companyRegistrationNumber: this.pickString(raw?.company_registration_number),
      expectedLaunchDate: this.pickString(raw?.expected_launch_date),
      message: this.pickString(raw?.message),
      status: this.pickString(raw?.status) ?? 'pending_review',
      submittedAt: this.pickString(raw?.date_created),
      reviewNote: this.pickString(raw?.review_note),
      createdBusinessProfileId: this.normalizeId(raw?.created_business_profile)
    };
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as Record<string, unknown>)['id']);
    }
    return null;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }
}
