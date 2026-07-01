import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type CreateWorkspaceInput = {
  idempotency_key: string;
  company_name: string;
  first_name: string;
  last_name: string;
  work_email: string;
  country: string;
  phone?: string | null;
  industry?: string | null;
  team_size?: number | null;
  city?: string | null;
  website?: string | null;
  timezone?: string | null;
  default_language?: string | null;
};

export type CreatedWorkspaceContext = {
  workspaceId: string | null;
  membershipId: string | null;
  businessProfileId: string | null;
  companyName: string | null;
  isActive: boolean | null;
  planCode: string | null;
  billingStatus: string | null;
};

type WorkspaceCreationResponseContext = {
  workspace?: {
    id?: string | number | null;
    companyName?: string | null;
    company_name?: string | null;
    isActive?: boolean | null;
    is_active?: boolean | null;
    planCode?: string | null;
    plan_code?: string | null;
    billingStatus?: string | null;
    billing_status?: string | null;
  } | null;
  membership?: {
    id?: string | number | null;
    businessProfileId?: string | number | null;
    business_profile_id?: string | number | null;
    business_profile?: {
      id?: string | number | null;
    } | string | number | null;
    memberRole?: string | null;
    member_role?: string | null;
    status?: string | null;
  } | null;
};

export type CreateWorkspaceResult = {
  status: number;
  confirmed: boolean;
  context: CreatedWorkspaceContext;
};

@Injectable({ providedIn: 'root' })
export class WorkspaceCreationService {
  private readonly requestTimeoutMs = 15000;
  private readonly endpoint =
    (environment as { WORKSPACE_CREATE_ENDPOINT?: string }).WORKSPACE_CREATE_ENDPOINT ||
    `${environment.API_URL}/wellar/workspaces/create`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  createWorkspace(input: CreateWorkspaceInput): Observable<CreateWorkspaceResult> {
    return this.http.post<{ data?: WorkspaceCreationResponseContext } | WorkspaceCreationResponseContext>(
      this.endpoint,
      input,
      {
        headers: this.auth.getAuthHeaders(),
        withCredentials: true,
        observe: 'response'
      }
    ).pipe(
      timeout({
        first: this.requestTimeoutMs,
        with: () =>
          throwError(() => {
            const error = new Error('Workspace creation timed out.');
            (error as Error & { code?: string }).code = 'TIMEOUT';
            return error;
          })
      }),
      map((response) => {
        const data = this.extractContext(response);
        return {
          status: response.status,
          confirmed: Boolean(data?.workspaceId || data?.businessProfileId),
          context: data ?? this.buildSparseContext()
        };
      })
    );
  }

  private extractContext(
    response: HttpResponse<{ data?: WorkspaceCreationResponseContext } | WorkspaceCreationResponseContext>
  ): CreatedWorkspaceContext | undefined {
    const body = response.body;
    if (!body) {
      return undefined;
    }

    if (this.hasDataEnvelope(body)) {
      return this.normalizeContext(body.data);
    }

    return this.normalizeContext(body);
  }

  private hasDataEnvelope(
    body: { data?: WorkspaceCreationResponseContext } | WorkspaceCreationResponseContext
  ): body is { data?: WorkspaceCreationResponseContext } {
    return Object.prototype.hasOwnProperty.call(body, 'data');
  }

  private normalizeContext(value: WorkspaceCreationResponseContext | undefined): CreatedWorkspaceContext | undefined {
    if (!value) {
      return undefined;
    }

    const workspaceId =
      this.normalizeId(value.workspace?.id) ??
      this.normalizeId(value.membership?.businessProfileId) ??
      this.normalizeId(value.membership?.business_profile_id) ??
      this.normalizeId(this.objectRecord(value.membership?.business_profile)?.['id']);
    const companyName =
      this.pickString(value.workspace?.companyName) ??
      this.pickString(value.workspace?.company_name) ??
      null;
    const isActive = this.pickBoolean(value.workspace?.isActive) ?? this.pickBoolean(value.workspace?.is_active) ?? null;
    const planCode = this.pickString(value.workspace?.planCode) ?? this.pickString(value.workspace?.plan_code) ?? null;
    const billingStatus =
      this.pickString(value.workspace?.billingStatus) ?? this.pickString(value.workspace?.billing_status) ?? null;

    return {
      workspaceId,
      membershipId: this.normalizeId(value.membership?.id),
      businessProfileId: workspaceId,
      companyName,
      isActive,
      planCode,
      billingStatus
    };
  }

  private buildSparseContext(): CreatedWorkspaceContext {
    return {
      workspaceId: null,
      membershipId: null,
      businessProfileId: null,
      companyName: null,
      isActive: null,
      planCode: null,
      billingStatus: null
    };
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      return normalized || null;
    }
    return null;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }
    return null;
  }

  private pickBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    return null;
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
