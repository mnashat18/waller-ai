import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface WorkspaceContextWorkspace {
  id: string;
  companyName: string;
  isActive: boolean;
  planCode: string | null;
  billingStatus: string | null;
}

export interface WorkspaceContextDepartment {
  id: string;
  name: string;
}

export interface WorkspaceContextMembership {
  id: string;
  status: string;
  memberRole: string;
  workspace: WorkspaceContextWorkspace;
  department: WorkspaceContextDepartment | null;
}

export interface WorkspaceContextInvitation {
  id: string;
  email: string;
  memberRole: string;
  status: string;
  department: WorkspaceContextDepartment | null;
}

export interface WorkspaceContextActive {
  workspace: WorkspaceContextWorkspace;
  membership: {
    id: string;
    status: string;
    memberRole: string;
  };
  department: WorkspaceContextDepartment | null;
}

export interface WorkspaceContextPayload {
  active: WorkspaceContextActive | null;
  memberships: WorkspaceContextMembership[];
  invitations: WorkspaceContextInvitation[];
}

export interface WorkspaceSwitchPayload {
  workspace: WorkspaceContextWorkspace;
  membership: {
    id: string;
    status: string;
    memberRole: string;
  };
  department: WorkspaceContextDepartment | null;
}

export type WorkspaceContextApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server_error'
  | 'network_error'
  | 'invalid_response'
  | 'unknown';

export class WorkspaceContextApiError extends Error {
  constructor(
    public readonly code: WorkspaceContextApiErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
    public readonly details?: unknown
  ) {
    super(userMessage);
    this.name = 'WorkspaceContextApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class WorkspaceContextApiService {
  private readonly api = environment.API_URL;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  getContext(): Observable<WorkspaceContextPayload> {
    const token = this.requireToken();

    return this.http.get<unknown>(`${this.api}/wellar/workspaces/context`, {
      headers: this.auth.getAuthHeaders(token),
      withCredentials: true
    }).pipe(
      timeout(10000),
      map((response) => this.parseContextResponse(response)),
      catchError((error) => this.handleError(error, 'Could not load organization context.'))
    );
  }

  switchMembership(membershipId: string): Observable<WorkspaceSwitchPayload> {
    const normalizedMembershipId = this.pickString(membershipId);
    if (!normalizedMembershipId) {
      return throwError(() =>
        new WorkspaceContextApiError('invalid_response', 0, 'A valid organization membership is required.')
      );
    }

    const token = this.requireToken();

    return this.http.post<unknown>(
      `${this.api}/wellar/workspaces/switch`,
      { membership_id: normalizedMembershipId },
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      timeout(10000),
      map((response) => this.parseSwitchResponse(response)),
      catchError((error) => this.handleError(error, 'Could not switch organization context.'))
    );
  }

  private requireToken(): string {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      throw new WorkspaceContextApiError('unauthorized', 401, 'Session expired. Please sign in again.');
    }
    return token;
  }

  private parseContextResponse(response: unknown): WorkspaceContextPayload {
    const root = this.asRecord(response);
    const data = this.asRecord(root?.['data']);
    if (!data) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Organization context response was invalid.');
    }

    const memberships = this.asArray(data['memberships'])
      .map((item) => this.parseMembership(item))
      .filter((item): item is WorkspaceContextMembership => Boolean(item));
    const invitations = this.asArray(data['invitations'])
      .map((item) => this.parseInvitation(item))
      .filter((item): item is WorkspaceContextInvitation => Boolean(item));
    const active = this.parseActive(data['active']);

    return { active, memberships, invitations };
  }

  private parseSwitchResponse(response: unknown): WorkspaceSwitchPayload {
    const root = this.asRecord(response);
    const data = this.asRecord(root?.['data']);
    if (!data) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Organization switch response was invalid.');
    }

    const workspace = this.parseWorkspace(data['workspace']);
    const membership = this.parseActiveMembership(data['membership']);
    if (!workspace || !membership) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Organization switch response was incomplete.');
    }

    return {
      workspace,
      membership,
      department: this.parseDepartment(data['department'])
    };
  }

  private parseActive(value: unknown): WorkspaceContextActive | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const workspace = this.parseWorkspace(record['workspace']);
    const membership = this.parseActiveMembership(record['membership']);
    if (!workspace || !membership) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Active organization context was incomplete.');
    }

    return {
      workspace,
      membership,
      department: this.parseDepartment(record['department'])
    };
  }

  private parseMembership(value: unknown): WorkspaceContextMembership | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const status = this.pickString(record['status']) ?? 'active';
    const memberRole = this.pickString(record['memberRole'])?.toLowerCase() ?? '';
    const workspace = this.parseWorkspace(record['workspace']);
    if (!id || !memberRole || !workspace) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Membership data was incomplete.');
    }

    return {
      id,
      status,
      memberRole,
      workspace,
      department: this.parseDepartment(record['department'])
    };
  }

  private parseInvitation(value: unknown): WorkspaceContextInvitation | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const email = this.pickString(record['email']);
    const memberRole = this.pickString(record['memberRole'])?.toLowerCase() ?? '';
    const status = this.pickString(record['status']) ?? 'pending';
    if (!id || !email || !memberRole) {
      throw new WorkspaceContextApiError('invalid_response', 0, 'Invitation data was incomplete.');
    }

    return {
      id,
      email,
      memberRole,
      status,
      department: this.parseDepartment(record['department'])
    };
  }

  private parseWorkspace(value: unknown): WorkspaceContextWorkspace | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const companyName = this.pickString(record['companyName']);
    if (!id || !companyName) {
      return null;
    }

    return {
      id,
      companyName,
      isActive: record['isActive'] === true,
      planCode: this.pickString(record['planCode']),
      billingStatus: this.pickString(record['billingStatus'])
    };
  }

  private parseDepartment(value: unknown): WorkspaceContextDepartment | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const name = this.pickString(record['name']);
    if (!id || !name) {
      return null;
    }

    return { id, name };
  }

  private parseActiveMembership(value: unknown): WorkspaceSwitchPayload['membership'] | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const status = this.pickString(record['status']) ?? 'active';
    const memberRole = this.pickString(record['memberRole'])?.toLowerCase() ?? '';
    if (!id || !memberRole) {
      return null;
    }

    return { id, status, memberRole };
  }

  private handleError(error: unknown, fallbackMessage: string): Observable<never> {
    if (error instanceof WorkspaceContextApiError) {
      return throwError(() => error);
    }

    const httpError = error as HttpErrorResponse;
    const status = Number(httpError?.status ?? 0);
    const body = this.asRecord(httpError?.error);
    const directusError = this.asRecord(body?.['error']);
    const backendCode = this.pickString(directusError?.['code'])?.toUpperCase() ?? '';
    const backendMessage = this.pickString(directusError?.['message']);

    if (status === 0) {
      return throwError(() => new WorkspaceContextApiError('network_error', status, fallbackMessage, error));
    }
    if (status === 401 || backendCode === 'UNAUTHORIZED') {
      return throwError(() => new WorkspaceContextApiError('unauthorized', 401, 'Session expired. Please sign in again.', error));
    }
    if (status === 403 || backendCode === 'FORBIDDEN') {
      return throwError(() => new WorkspaceContextApiError('forbidden', 403, backendMessage ?? 'You do not have permission to use this organization context.', error));
    }
    if (status === 404 || backendCode === 'NOT_FOUND') {
      return throwError(() => new WorkspaceContextApiError('not_found', 404, backendMessage ?? 'The requested organization membership was not found.', error));
    }
    if (status === 409 || backendCode === 'CONFLICT') {
      return throwError(() => new WorkspaceContextApiError('conflict', 409, backendMessage ?? 'The organization context is no longer valid.', error));
    }
    if (status >= 500 || backendCode === 'SERVER_ERROR') {
      return throwError(() => new WorkspaceContextApiError('server_error', status || 500, backendMessage ?? fallbackMessage, error));
    }

    return throwError(() => new WorkspaceContextApiError('unknown', status, backendMessage ?? fallbackMessage, error));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private pickString(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
  }
}
