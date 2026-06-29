import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type OrganizationProfile = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  industry: string | null;
  team_size: number | null;
  country: string | null;
  city: string | null;
  website: string | null;
  timezone: string | null;
  default_language: string | null;
  is_active: boolean | null;
  plan_code: string | null;
  billing_status: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type OrganizationDepartment = {
  id: string;
  name: string;
  is_active: boolean;
  business_profile: string;
  manager_member_id: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type OrganizationMember = {
  id: string;
  status: string | null;
  member_role: string | null;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  business_profile: string | null;
  department_id: string | null;
  department_name: string | null;
  joined_at: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type OrganizationInvite = {
  id: string;
  email: string;
  member_role: string | null;
  status: string | null;
  department_id: string | null;
  department_name: string | null;
};

export type OrganizationPermissions = {
  canEditProfile: boolean;
  canManageDepartments: boolean;
  canViewMembers: boolean;
  canViewInvites: boolean;
  canUseComingSoonControls: boolean;
};

export type OrganizationData = {
  profile: OrganizationProfile | null;
  departments: OrganizationDepartment[];
  members: OrganizationMember[];
  invites: OrganizationInvite[];
  permissions: OrganizationPermissions;
};

export type OrganizationProfileUpdateInput = Partial<Pick<
  OrganizationProfile,
  'company_name' | 'contact_name' | 'phone' | 'industry' | 'team_size' | 'country' | 'city' | 'website' | 'timezone' | 'default_language'
>>;

export type OrganizationDepartmentInput = {
  name?: string;
  manager_member_id?: string | number | null;
};

export type OrganizationApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'server_error'
  | 'network_error'
  | 'invalid_response'
  | 'unknown';

export class OrganizationApiError extends Error {
  constructor(
    public readonly code: OrganizationApiErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
    public readonly details?: unknown
  ) {
    super(userMessage);
    this.name = 'OrganizationApiError';
  }
}
@Injectable({ providedIn: 'root' })
export class OrganizationApiService {
  private readonly api = environment.API_URL;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  getOrganization(): Observable<OrganizationData> {
    return this.http.get<unknown>(`${this.api}/wellar/organization`, {
      headers: this.auth.getAuthHeaders(this.requireToken()),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseOrganizationResponse(response)),
      catchError((error) => this.handleError(error, 'Organization data could not be loaded.'))
    );
  }

  updateProfile(input: OrganizationProfileUpdateInput): Observable<OrganizationProfile> {
    const body = this.pickObject(input);
    const allowedKeys = [
      'company_name',
      'contact_name',
      'phone',
      'industry',
      'team_size',
      'country',
      'city',
      'website',
      'timezone',
      'default_language'
    ] as const;

    const payload: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        payload[key] = (body as Record<string, unknown>)[key];
      }
    }

    if (!Object.keys(payload).length) {
      return throwError(() => new OrganizationApiError('validation', 400, 'No editable organization fields were provided.'));
    }

    return this.http.patch<unknown>(`${this.api}/wellar/organization/profile`, payload, {
      headers: this.auth.getAuthHeaders(this.requireToken()),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseProfileResponse(response)),
      catchError((error) => this.handleError(error, 'Organization profile could not be saved.'))
    );
  }

  createDepartment(input: OrganizationDepartmentInput): Observable<OrganizationDepartment> {
    const name = this.pickString(input?.name);
    if (!name) {
      return throwError(() => new OrganizationApiError('validation', 400, 'Department name is required.'));
    }

    const payload = {
      name,
      manager_member_id: this.pickString(input.manager_member_id) ?? null
    };

    return this.http.post<unknown>(`${this.api}/wellar/organization/departments`, payload, {
      headers: this.auth.getAuthHeaders(this.requireToken()),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseDepartmentResponse(response)),
      catchError((error) => this.handleError(error, 'Department could not be created.'))
    );
  }

  updateDepartment(departmentId: string, input: OrganizationDepartmentInput): Observable<OrganizationDepartment> {
    const id = this.pickString(departmentId);
    if (!id) {
      return throwError(() => new OrganizationApiError('validation', 400, 'Department id is required.'));
    }

    const payload: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(input ?? {}, 'name')) {
      const name = this.pickString(input?.name);
      if (!name) {
        return throwError(() => new OrganizationApiError('validation', 400, 'Department name is required.'));
      }
      payload['name'] = name;
    }
    if (Object.prototype.hasOwnProperty.call(input ?? {}, 'manager_member_id')) {
      payload['manager_member_id'] = this.pickString(input?.manager_member_id) ?? null;
    }

    if (!Object.keys(payload).length) {
      return throwError(() => new OrganizationApiError('validation', 400, 'No editable department fields were provided.'));
    }

    return this.http.patch<unknown>(`${this.api}/wellar/organization/departments/${encodeURIComponent(id)}`, payload, {
      headers: this.auth.getAuthHeaders(this.requireToken()),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseDepartmentResponse(response)),
      catchError((error) => this.handleError(error, 'Department could not be updated.'))
    );
  }

  deactivateDepartment(departmentId: string): Observable<OrganizationDepartment> {
    const id = this.pickString(departmentId);
    if (!id) {
      return throwError(() => new OrganizationApiError('validation', 400, 'Department id is required.'));
    }

    return this.http.post<unknown>(`${this.api}/wellar/organization/departments/${encodeURIComponent(id)}/deactivate`, {}, {
      headers: this.auth.getAuthHeaders(this.requireToken()),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseDepartmentResponse(response)),
      catchError((error) => this.handleError(error, 'Department could not be deactivated.'))
    );
  }

  private requireToken(): string {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      throw new OrganizationApiError('unauthorized', 401, 'Session expired. Please sign in again.');
    }
    return token;
  }

  private parseOrganizationResponse(response: unknown): OrganizationData {
    const root = this.pickObject(response) ?? {};
    const data = this.pickObject(root['data']);
    if (!data) {
      throw new OrganizationApiError('invalid_response', 0, 'Organization response was invalid.');
    }

    return {
      profile: this.parseProfile(data['profile']),
      departments: this.pickArray(data['departments']).map((item) => this.parseDepartment(item)).filter((item): item is OrganizationDepartment => Boolean(item)),
      members: this.pickArray(data['members']).map((item) => this.parseMember(item)).filter((item): item is OrganizationMember => Boolean(item)),
      invites: this.pickArray(data['invites']).map((item) => this.parseInvite(item)).filter((item): item is OrganizationInvite => Boolean(item)),
      permissions: this.parsePermissions(data['permissions'])
    };
  }

  private parseProfileResponse(response: unknown): OrganizationProfile {
    const root = this.pickObject(response) ?? {};
    const data = this.pickObject(root['data']);
    const profile = this.parseProfile(data?.['profile'] ?? data);
    if (!profile) {
      throw new OrganizationApiError('invalid_response', 0, 'Organization profile response was incomplete.');
    }
    return profile;
  }

  private parseDepartmentResponse(response: unknown): OrganizationDepartment {
    const root = this.pickObject(response) ?? {};
    const data = this.pickObject(root['data']);
    const department = this.parseDepartment(data?.['department'] ?? data);
    if (!department) {
      throw new OrganizationApiError('invalid_response', 0, 'Department response was incomplete.');
    }
    return department;
  }

  private parseProfile(value: unknown): OrganizationProfile | null {
    const record = this.pickObject(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      company_name: this.pickString(record['company_name']),
      contact_name: this.pickString(record['contact_name']),
      phone: this.pickString(record['phone']),
      industry: this.pickString(record['industry']),
      team_size: this.pickNumber(record['team_size']),
      country: this.pickString(record['country']),
      city: this.pickString(record['city']),
      website: this.pickString(record['website']),
      timezone: this.pickString(record['timezone']),
      default_language: this.pickString(record['default_language']),
      is_active: this.pickBoolean(record['is_active']),
      plan_code: this.pickString(record['plan_code']),
      billing_status: this.pickString(record['billing_status']),
      date_created: this.pickString(record['date_created']),
      date_updated: this.pickString(record['date_updated'])
    };
  }

  private parseDepartment(value: unknown): OrganizationDepartment | null {
    const record = this.pickObject(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const name = this.pickString(record['name']);
    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      is_active: this.pickBoolean(record['is_active']) ?? false,
      business_profile: this.pickString(record['business_profile']) ?? '',
      manager_member_id: this.pickString(record['manager_member_id'] ?? this.pickNestedId(record['manager_member'])),
      date_created: this.pickString(record['date_created']),
      date_updated: this.pickString(record['date_updated'])
    };
  }

  private parseMember(value: unknown): OrganizationMember | null {
    const record = this.pickObject(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      status: this.pickString(record['status']),
      member_role: this.pickString(record['member_role']),
      user_id: this.pickString(record['user_id'] ?? this.pickNestedId(record['user'])),
      user_name: this.pickString(record['user_name']) ?? this.pickDisplayName(record['user']) ?? 'Member',
      user_email: this.pickString(record['user_email'] ?? this.pickNestedEmail(record['user'])),
      business_profile: this.pickString(record['business_profile']),
      department_id: this.pickString(record['department_id'] ?? this.pickNestedId(record['department'])),
      department_name: this.pickString(record['department_name']) ?? this.pickString(this.pickObject(record['department'])?.['name']),
      joined_at: this.pickString(record['joined_at']),
      date_created: this.pickString(record['date_created']),
      date_updated: this.pickString(record['date_updated'])
    };
  }

  private parseInvite(value: unknown): OrganizationInvite | null {
    const record = this.pickObject(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const email = this.pickString(record['email']);
    if (!id || !email) {
      return null;
    }

    return {
      id,
      email,
      member_role: this.pickString(record['member_role']),
      status: this.pickString(record['status']),
      department_id: this.pickString(record['department_id'] ?? this.pickNestedId(record['department'])),
      department_name: this.pickString(record['department_name']) ?? this.pickString(this.pickObject(record['department'])?.['name'])
    };
  }

  private parsePermissions(value: unknown): OrganizationPermissions {
    const record = this.pickObject(value) ?? {};
    return {
      canEditProfile: this.pickBoolean(record['canEditProfile']) ?? false,
      canManageDepartments: this.pickBoolean(record['canManageDepartments']) ?? false,
      canViewMembers: this.pickBoolean(record['canViewMembers']) ?? false,
      canViewInvites: this.pickBoolean(record['canViewInvites']) ?? false,
      canUseComingSoonControls: this.pickBoolean(record['canUseComingSoonControls']) ?? false
    };
  }

  private handleError(error: unknown, fallbackMessage: string): Observable<never> {
    if (error instanceof OrganizationApiError) {
      return throwError(() => error);
    }

    const httpError = error as HttpErrorResponse;
    const status = Number(httpError?.status ?? 0);
    const body = this.pickObject(httpError?.error);
    const errorBody = this.pickObject(body?.['error']) ?? body;
    const backendCode = this.pickString(errorBody?.['code'])?.toUpperCase() ?? '';
    const backendMessage = this.pickString(errorBody?.['message']) ?? this.pickString(body?.['message']);

    if (status === 0) {
      return throwError(() => new OrganizationApiError('network_error', 0, fallbackMessage, error));
    }
    if (status === 401 || backendCode === 'UNAUTHORIZED') {
      return throwError(() => new OrganizationApiError('unauthorized', 401, 'Session expired. Please sign in again.', error));
    }
    if (status === 403 || backendCode === 'FORBIDDEN') {
      return throwError(() => new OrganizationApiError('forbidden', 403, backendMessage ?? 'You do not have permission for this organization action.', error));
    }
    if (status === 404 || backendCode === 'NOT_FOUND') {
      return throwError(() => new OrganizationApiError('not_found', 404, backendMessage ?? 'The requested organization record was not found.', error));
    }
    if (status === 409 || backendCode === 'CONFLICT') {
      return throwError(() => new OrganizationApiError('conflict', 409, backendMessage ?? 'The organization change could not be completed.', error));
    }
    if (status === 422 || backendCode === 'VALIDATION') {
      return throwError(() => new OrganizationApiError('validation', 422, backendMessage ?? 'Please correct the highlighted fields.', error));
    }
    if (status >= 500 || backendCode === 'SERVER_ERROR') {
      return throwError(() => new OrganizationApiError('server_error', status || 500, backendMessage ?? fallbackMessage, error));
    }

    return throwError(() => new OrganizationApiError('unknown', status, backendMessage ?? fallbackMessage, error));
  }

  private pickObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private pickArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
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

  private pickNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private pickBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return null;
  }

  private pickNestedId(value: unknown): string | null {
    const record = this.pickObject(value);
    return record ? this.pickString(record['id']) : null;
  }

  private pickNestedEmail(value: unknown): string | null {
    const record = this.pickObject(value);
    return record ? this.pickString(record['email']) : null;
  }

  private pickDisplayName(value: unknown): string | null {
    const record = this.pickObject(value);
    if (!record) {
      return null;
    }
    const first = this.pickString(record['first_name']) ?? '';
    const last = this.pickString(record['last_name']) ?? '';
    const full = `${first} ${last}`.trim();
    return full || this.pickString(record['email']);
  }
}
