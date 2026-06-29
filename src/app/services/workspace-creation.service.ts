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
  workspace: {
    id: string;
    companyName: string | null;
    isActive: boolean;
    planCode: string | null;
    billingStatus: string | null;
  };
  membership: {
    id: string | number;
    businessProfileId: string;
    memberRole: 'owner';
    status: 'active';
  };
};

export type CreateWorkspaceResult = {
  status: number;
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
    return this.http.post<{ data?: CreatedWorkspaceContext } | CreatedWorkspaceContext>(
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
        if (!data?.workspace?.id || !data?.membership?.businessProfileId) {
          const error = new Error('Workspace creation response was incomplete.');
          (error as Error & { code?: string }).code = 'INCOMPLETE_RESPONSE';
          throw error;
        }
        return {
          status: response.status,
          context: data
        };
      })
    );
  }

  private extractContext(
    response: HttpResponse<{ data?: CreatedWorkspaceContext } | CreatedWorkspaceContext>
  ): CreatedWorkspaceContext | undefined {
    const body = response.body;
    if (!body) {
      return undefined;
    }

    if (this.hasDataEnvelope(body)) {
      return body.data;
    }

    return body;
  }

  private hasDataEnvelope(
    body: { data?: CreatedWorkspaceContext } | CreatedWorkspaceContext
  ): body is { data?: CreatedWorkspaceContext } {
    return Object.prototype.hasOwnProperty.call(body, 'data');
  }
}
