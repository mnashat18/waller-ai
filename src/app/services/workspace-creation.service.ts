import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type CreateWorkspaceInput = {
  idempotency_key: string;
  company_name: string;
  contact_name?: string | null;
  work_email?: string | null;
  phone?: string | null;
  industry?: string | null;
  team_size?: number | null;
  country?: string | null;
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
      map((response) => {
        const data = this.extractContext(response);
        if (!data?.workspace?.id || !data?.membership?.businessProfileId) {
          throw new Error('Workspace creation response was incomplete.');
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
