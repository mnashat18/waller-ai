import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export type WorkforceRosterState = 'verified_member' | 'pending_invitation' | 'repair_required' | 'inactive';

export type WorkforceRosterUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type WorkforceRosterWorkspace = {
  id: string;
  companyName: string | null;
  isActive: boolean;
  planCode: string | null;
  billingStatus: string | null;
};

export type WorkforceRosterMembership = {
  id: string;
  status: string;
  memberRole: string;
};

export type WorkforceRosterActive = {
  workspace: WorkforceRosterWorkspace;
  membership: WorkforceRosterMembership;
  department: WorkforceRosterDepartment | null;
} | null;

export type WorkforceRosterSummary = {
  total: number;
  verified_members: number;
  pending_invitations: number;
  repair_required: number;
  inactive: number;
  eligible_scan_targets: number;
  open_scan_requests: number;
  completed_scan_requests: number;
  overdue_scan_requests: number;
};

export type WorkforceRosterRow = {
  id: string;
  type: 'member' | 'invite';
  state: WorkforceRosterState;
  member_id: string | null;
  invite_id: string | null;
  user_id: string | null;
  member_role: string | null;
  status: string | null;
  department_id: string | null;
  department_name: string | null;
  display_name: string;
  email: string | null;
  invited_email: string | null;
  reason: string | null;
  is_targetable: boolean;
  joined_at: string | null;
  expires_at: string | null;
  last_scan_at: string | null;
  last_readiness_score: number | null;
  last_risk_level: string | null;
  scan_status: string | null;
  todays_scan: boolean;
  readiness_label: string | null;
  presence_status: string | null;
  presence_label: string | null;
  business_profile_name?: string | null;
};

export type WorkforceRosterDepartment = {
  id: string;
  name: string;
  is_active: boolean;
};

export type WorkforceEligibleTarget = {
  member_id: string;
  user_id: string | null;
  label: string;
  email: string;
  department_id: string | null;
  department_name: string | null;
  member_role: string;
  status: string;
};

export type WorkforceRosterQueueRow = {
  id: string;
  status: string;
  request_type: string | null;
  requested_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled: string | null;
  business_profile: {
    id: string;
    companyName: string | null;
    isActive: boolean;
  } | null;
  department: {
    id: string;
    name: string;
  } | null;
  target_member: {
    id: string;
    status: string;
    member_role: string;
    user: WorkforceRosterUser | null;
    department: {
      id: string;
      name: string;
    } | null;
  };
  requested_by_user: WorkforceRosterUser | null;
};

export type WorkforceRosterQueueSummary = {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
};

export type WorkforceRosterPayload = {
  active: WorkforceRosterActive;
  permissions: {
    canEditProfile: boolean;
    canManageDepartments: boolean;
    canViewMembers: boolean;
    canViewInvites: boolean;
    canUseComingSoonControls: boolean;
  };
  departments: WorkforceRosterDepartment[];
  rows: WorkforceRosterRow[];
  eligible_scan_targets: WorkforceEligibleTarget[];
  scan_requests: {
    rows: WorkforceRosterQueueRow[];
    summary: WorkforceRosterQueueSummary;
  };
  summary: WorkforceRosterSummary;
};

@Injectable({ providedIn: 'root' })
export class WorkforceRosterApiService {
  private readonly api = environment.API_URL;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  getWorkforceRoster(): Observable<WorkforceRosterPayload> {
    const token = this.requireToken();
    return this.http.get<unknown>(`${this.api}/wellar/workforce`, {
      headers: this.auth.getAuthHeaders(token),
      withCredentials: true
    }).pipe(
      timeout(12000),
      map((response) => this.parseRosterResponse(response)),
      catchError((error) => this.handleError(error, 'Workforce roster could not be loaded.'))
    );
  }

  private requireToken(): string {
    const token = this.auth.getStoredAccessToken();
    if (!token) {
      throw new Error('Session expired. Please sign in again.');
    }
    return token;
  }

  private parseRosterResponse(response: unknown): WorkforceRosterPayload {
    const root = this.asRecord(response);
    const data = this.asRecord(root?.['data']);
    if (!data) {
      throw new Error('Workforce roster response was invalid.');
    }

    return {
      active: this.parseActive(data['active']),
      permissions: this.parsePermissions(data['permissions']),
      departments: this.asArray(data['departments']).map((item) => this.parseDepartment(item)).filter((item): item is WorkforceRosterDepartment => Boolean(item)),
      rows: this.asArray(data['rows']).map((item) => this.parseRosterRow(item)).filter((item): item is WorkforceRosterRow => Boolean(item)),
      eligible_scan_targets: this.asArray(data['eligible_scan_targets']).map((item) => this.parseEligibleTarget(item)).filter((item): item is WorkforceEligibleTarget => Boolean(item)),
      scan_requests: this.parseQueue(data['scan_requests']),
      summary: this.parseRosterSummary(data['summary'])
    };
  }

  private parseActive(value: unknown): WorkforceRosterActive {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }
    return {
      workspace: this.parseWorkspace(record['workspace'])!,
      membership: this.parseMembership(record['membership'])!,
      department: this.parseDepartment(record['department'])
    };
  }

  private parsePermissions(value: unknown): WorkforceRosterPayload['permissions'] {
    const record = this.asRecord(value) ?? {};
    return {
      canEditProfile: record['canEditProfile'] === true,
      canManageDepartments: record['canManageDepartments'] === true,
      canViewMembers: record['canViewMembers'] === true,
      canViewInvites: record['canViewInvites'] === true,
      canUseComingSoonControls: record['canUseComingSoonControls'] === true
    };
  }

  private parseWorkspace(value: unknown): WorkforceRosterWorkspace | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      companyName: this.pickString(record['companyName']),
      isActive: record['isActive'] === true,
      planCode: this.pickString(record['planCode']),
      billingStatus: this.pickString(record['billingStatus'])
    };
  }

  private parseMembership(value: unknown): WorkforceRosterMembership | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const memberRole = this.pickString(record['memberRole'])?.toLowerCase() ?? '';
    if (!id || !memberRole) {
      return null;
    }

    return {
      id,
      status: this.pickString(record['status']) ?? 'active',
      memberRole
    };
  }

  private parseDepartment(value: unknown): WorkforceRosterDepartment | null {
    const record = this.asRecord(value);
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
      is_active: record['is_active'] === true || record['isActive'] === true
    };
  }

  private parseEligibleTarget(value: unknown): WorkforceEligibleTarget | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const member_id = this.pickString(record['member_id']);
    const email = this.pickString(record['email']);
    const label = this.pickString(record['label']);
    const member_role = this.pickString(record['member_role']);
    const status = this.pickString(record['status']);
    if (!member_id || !email || !label || !member_role || !status) {
      return null;
    }

    return {
      member_id,
      user_id: this.pickString(record['user_id']),
      label,
      email,
      department_id: this.pickString(record['department_id']),
      department_name: this.pickString(record['department_name']),
      member_role,
      status
    };
  }

  private parseRosterRow(value: unknown): WorkforceRosterRow | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    const type = this.pickString(record['type']) === 'invite' ? 'invite' : 'member';
    const state = this.pickString(record['state']) as WorkforceRosterState | null;
    if (!id || !state) {
      return null;
    }

    return {
      id,
      type,
      state,
      member_id: this.pickString(record['member_id']),
      invite_id: this.pickString(record['invite_id']),
      user_id: this.pickString(record['user_id']),
      member_role: this.pickString(record['member_role']),
      status: this.pickString(record['status']),
      department_id: this.pickString(record['department_id']),
      department_name: this.pickString(record['department_name']),
      display_name: this.pickString(record['display_name']) ?? 'Needs data repair',
      email: this.pickString(record['email']),
      invited_email: this.pickString(record['invited_email']),
      reason: this.pickString(record['reason']),
      is_targetable: record['is_targetable'] === true,
      joined_at: this.pickString(record['joined_at']),
      expires_at: this.pickString(record['expires_at']),
      last_scan_at: this.pickString(record['last_scan_at']),
      last_readiness_score: this.toNumber(record['last_readiness_score']),
      last_risk_level: this.pickString(record['last_risk_level']),
      scan_status: this.pickString(record['scan_status']),
      todays_scan: record['todays_scan'] === true,
      readiness_label: this.pickString(record['readiness_label']),
      presence_status: this.pickString(record['presence_status']),
      presence_label: this.pickString(record['presence_label']),
      business_profile_name: this.pickString(record['business_profile_name'])
    };
  }

  private parseQueue(value: unknown): WorkforceRosterPayload['scan_requests'] {
    const record = this.asRecord(value) ?? {};
    return {
      rows: this.asArray(record['rows']).map((item) => this.parseQueueRow(item)).filter((item): item is WorkforceRosterQueueRow => Boolean(item)),
      summary: this.parseQueueSummary(record['summary'])
    };
  }

  private parseQueueRow(value: unknown): WorkforceRosterQueueRow | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      status: this.pickString(record['status']) ?? 'pending',
      request_type: this.pickString(record['request_type']),
      requested_at: this.pickString(record['requested_at']),
      due_at: this.pickString(record['due_at']),
      completed_at: this.pickString(record['completed_at']),
      cancelled: this.pickString(record['cancelled']),
      business_profile: this.parseQueueWorkspace(record['business_profile']),
      department: this.parseQueueDepartment(record['department']),
      target_member: this.parseQueueTargetMember(record['target_member']),
      requested_by_user: this.parseQueueUser(record['requested_by_user'])
    };
  }

  private parseQueueWorkspace(value: unknown): WorkforceRosterQueueRow['business_profile'] {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    return {
      id,
      companyName: this.pickString(record['companyName'] ?? record['company_name']),
      isActive: record['isActive'] === true || record['is_active'] === true
    };
  }

  private parseQueueDepartment(value: unknown): WorkforceRosterQueueRow['department'] {
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

  private parseQueueTargetMember(value: unknown): WorkforceRosterQueueRow['target_member'] {
    const record = this.asRecord(value);
    if (!record) {
      return {
        id: '',
        status: 'active',
        member_role: 'employee',
        user: null,
        department: null
      };
    }

    return {
      id: this.pickString(record['id']) ?? '',
      status: this.pickString(record['status']) ?? 'active',
      member_role: this.pickString(record['member_role']) ?? 'employee',
      user: this.parseQueueUser(record['user']),
      department: this.parseQueueDepartment(record['department'])
    };
  }

  private parseQueueUser(value: unknown): WorkforceRosterQueueRow['requested_by_user'] | WorkforceRosterQueueRow['target_member']['user'] {
    const record = this.asRecord(value);
    if (!record) {
      return {
        id: '',
        email: null,
        first_name: null,
        last_name: null
      };
    }

    return {
      id: this.pickString(record['id']) ?? '',
      email: this.pickString(record['email']),
      first_name: this.pickString(record['first_name']),
      last_name: this.pickString(record['last_name'])
    };
  }

  private parseQueueSummary(value: unknown): WorkforceRosterQueueSummary {
    const record = this.asRecord(value) ?? {};
    return {
      total: this.toNumber(record['total']) ?? 0,
      pending: this.toNumber(record['pending']) ?? 0,
      completed: this.toNumber(record['completed']) ?? 0,
      overdue: this.toNumber(record['overdue']) ?? 0
    };
  }

  private parseRosterSummary(value: unknown): WorkforceRosterSummary {
    const record = this.asRecord(value) ?? {};
    return {
      total: this.toNumber(record['total']) ?? 0,
      verified_members: this.toNumber(record['verified_members']) ?? 0,
      pending_invitations: this.toNumber(record['pending_invitations']) ?? 0,
      repair_required: this.toNumber(record['repair_required']) ?? 0,
      inactive: this.toNumber(record['inactive']) ?? 0,
      eligible_scan_targets: this.toNumber(record['eligible_scan_targets']) ?? 0,
      open_scan_requests: this.toNumber(record['open_scan_requests']) ?? 0,
      completed_scan_requests: this.toNumber(record['completed_scan_requests']) ?? 0,
      overdue_scan_requests: this.toNumber(record['overdue_scan_requests']) ?? 0
    };
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
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private handleError(error: unknown, fallback: string): Observable<never> {
    const httpError = error as HttpErrorResponse;
    const status = Number(httpError?.status ?? 0);
    if (status === 401) {
      return throwError(() => new Error('Session expired. Please sign in again.'));
    }
    if (status === 403) {
      return throwError(() => new Error('Workforce data access is not available for this role.'));
    }
    if (status === 404) {
      return throwError(() => new Error('An active organization membership is required.'));
    }
    if (status === 409) {
      return throwError(() => new Error('The workforce roster could not be synchronized.'));
    }
    return throwError(() => new Error(fallback));
  }
}
