import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap, take, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
  formatUserName
} from '../shared/utils/display-formatters';

import { CompanyContextService, type CompanyContext } from '../core/context/company-context.service';
import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AuthService } from './auth';

export type CompanyProfileRecord = {
  id: string;
  company_name: string | null;
  is_active: boolean | null;
  plan_code: string | null;
  billing_status: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type CompanyPageIssue = {
  unavailable: boolean;
  permissionDenied: boolean;
  message: string;
};

export type CompanyDepartmentRecord = {
  id: string;
  name: string;
  is_active: boolean;
  business_profile: string | null;
  manager_member_id: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type CompanyMemberRecord = {
  id: string;
  status: string | null;
  member_role: string | null;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  business_profile: string | null;
  department_id: string | null;
  department_name: string | null;
  shift_template_id: string | null;
  shift_template_name: string | null;
  employee_code: string | null;
  job_title: string | null;
  joined_at: string | null;
  deactivated_at: string | null;
  last_scan_at: string | null;
  last_readiness_score: number | null;
  last_risk_level: string | null;
  date_created: string | null;
  date_updated: string | null;
};

export type CompanyInviteRecord = {
  id: string;
  email: string | null;
  member_role: string | null;
  status: string | null;
  sent_at: string | null;
  expires_at: string | null;
  claimed_at: string | null;
  department_id: string | null;
  department_name: string | null;
  invited_by_name: string | null;
  invited_by_email: string | null;
};

export type CompanyShiftTemplateRecord = {
  id: string;
  name: string | null;
  is_active: boolean | null;
  date_created: string | null;
  date_updated: string | null;
};

export type CompanyPageData = {
  profile: CompanyProfileRecord | null;
  activeRole: ActiveMemberRole;
  activeDepartmentId: string | null;
  departments: CompanyDepartmentRecord[];
  members: CompanyMemberRecord[];
  invites: CompanyInviteRecord[];
  shiftTemplates: CompanyShiftTemplateRecord[];
  departmentsIssue: CompanyPageIssue | null;
  membersIssue: CompanyPageIssue | null;
  invitesIssue: CompanyPageIssue | null;
  shiftTemplatesIssue: CompanyPageIssue | null;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

export type MemberDirectoryRow = {
  id: string;
  avatar: string | null;
  name: string;
  email: string | null;
  member_role: string | null;
  status: string | null;
  department_id: string | null;
  department_name: string | null;
  job_title: string | null;
  employee_code: string | null;
  joined_at: string | null;
  last_scan_at: string | null;
  last_readiness_score: number | null;
  last_risk_level: string | null;
  scan_eligible: boolean;
  department_alert_count: number;
  pending_invite_id: string | null;
  pending_invite_status: string | null;
  pending_invite_sent_at: string | null;
  pending_invite_expires_at: string | null;
  user_id: string | null;
};

export type MembersPageData = {
  rows: MemberDirectoryRow[];
  departments: DepartmentOption[];
  summary: {
    total: number;
    active: number;
    scanEligible: number;
    pendingInvites: number;
    managers: number;
    inactive: number;
  };
};

export type WorkforceMemberRow = {
  id: string;
  status: string;
  member_role: string;
  joined_at: string | null;
  business_profile: string | null;
  department_id: string | null;
  department_name: string | null;
  user_id: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string | null;
  todays_scan: boolean;
  readiness_label: 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk' | 'No scan today';
  last_scan_at: string | null;
};

export type WorkforceSummary = {
  activeMembers: number;
  scanEligible: number;
  scanRequested: number;
  scannedToday: number;
  missingScans: number;
  pendingInvites: number;
  ownerCount: number;
  hrCount: number;
  managerCount: number;
  employeeCount: number;
  needsReviewCount: number;
};

export type WorkforceRowType = 'member' | 'invite';
export type WorkforceScanStatus =
  | 'none_assigned'
  | 'requested'
  | 'completed'
  | 'missing'
  | 'not_applicable';
export type WorkforcePresenceStatus = 'online' | 'idle' | 'offline' | 'never';

export type WorkforceRosterRow = {
  type: WorkforceRowType;
  key: string;
  member_id: string | null;
  invite_id: string | null;
  user_id: string | null;
  name: string;
  email: string | null;
  member_role: string;
  department_id: string | null;
  department_name: string | null;
  status: string;
  joined_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  claimed_at: string | null;
  invite_token: string | null;
  scan_status: WorkforceScanStatus;
  todays_scan: boolean;
  readiness_label: 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk' | 'No scan';
  last_scan_at: string | null;
  last_readiness_score: number | null;
  last_risk_level: string | null;
  last_seen_at: string | null;
  last_active_at: string | null;
  presence_status: WorkforcePresenceStatus;
  presence_label: string;
  is_profile_incomplete: boolean;
  invited_by_name: string | null;
  invite_phone: string | null;
  needs_review_reason: string | null;
  linked_invite_email: string | null;
  linked_invite_status: string | null;
  linked_invite_sent_at: string | null;
  linked_invite_requested_by: string | null;
  business_profile_id: string | null;
  business_profile_name: string | null;
};

export type WorkforceScanRequestRow = {
  id: string;
  status: string;
  request_type: string | null;
  requested_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled: boolean;
  department_id: string | null;
  department_name: string | null;
  target_member_id: string | null;
  target_member_name: string;
  target_user_id: string | null;
  target_user_email: string | null;
  requested_by_user_id: string | null;
  requested_by_name: string;
  cancelled_note: string | null;
};

export type WorkforceRosterPageData = {
  rows: WorkforceRosterRow[];
  memberRows: WorkforceRosterRow[];
  inviteRows: WorkforceRosterRow[];
  scanRequestRows: WorkforceScanRequestRow[];
  departments: DepartmentOption[];
  roles: string[];
  statuses: string[];
  summary: WorkforceSummary;
  relationWarning: string | null;
};

export type WorkforcePageData = {
  rows: WorkforceMemberRow[];
  departments: DepartmentOption[];
  roles: string[];
  statuses: string[];
  summary: WorkforceSummary;
  relationWarning: string | null;
};

export type MemberUpdateInput = {
  member_role?: string | null;
  status?: string | null;
  department?: string | null;
  job_title?: string | null;
  employee_code?: string | null;
  deactivated_at?: string | null;
};

export type DepartmentRow = {
  id: string;
  name: string;
  is_active: boolean;
  business_profile: string;
  manager_member: string | number | {
    id?: string | number;
    user?: {
      id?: string | number;
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | string | number | null;
  } | null;
  manager_name: string | null;
  employee_count: number;
  average_readiness_score: number | null;
  active_shift_template_count: number;
  open_alerts_count: number;
};

export type DepartmentsPageData = {
  rows: DepartmentRow[];
  shift_template_count: number;
  managerOptions: Array<{ id: string; label: string }>;
};

export type DepartmentMutationInput = {
  name: string;
  is_active?: boolean | null;
  manager_member?: string | number | null;
};

export type InviteRow = {
  id: string;
  email: string | null;
  phone: string | null;
  member_role: string | null;
  department_id: string | null;
  department_name: string | null;
  invite_type: string | null;
  status: string | null;
  sent_at: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  claimed_member_id: string | null;
  claimed_member_name: string | null;
};

export type InvitesPageData = {
  rows: InviteRow[];
  departments: DepartmentOption[];
  summary: {
    pending: number;
    sent: number;
    claimed: number;
    expired: number;
  };
};

export type CreateInviteInput = {
  email?: string | null;
  phone?: string | null;
  member_role?: string | null;
  department?: string | null;
  invite_type?: string | null;
  note?: string | null;
};

type MemberRecord = {
  id?: string | number;
  member_role?: string | null;
  status?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  job_title?: string | null;
  employee_code?: string | null;
  deactivated_at?: string | null;
  joined_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  last_scan_at?: string | null;
  last_readiness_score?: number | string | null;
  last_risk_level?: string | null;
  shift_template?: {
    id?: string | number;
    name?: string | null;
  } | string | number | null;
  department?: {
    id?: string | number;
    name?: string | null;
  } | string | number | null;
  user?: {
    id?: string | number;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    avatar?: string | null;
  } | null;
};

type WorkforceMemberRecord = {
  id?: string | number;
  status?: string | null;
  member_role?: string | null;
  employee_code?: string | null;
  job_title?: string | null;
  joined_at?: string | null;
  deactivated_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  department?: {
    id?: string | number;
    name?: string | null;
  } | string | number | null;
  user?: {
    id?: string | number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    active_business_profile?: string | number | { id?: string | number } | null;
    active_department?: string | number | { id?: string | number } | null;
    active_member_role?: string | null;
    last_seen_at?: string | null;
    last_active_at?: string | null;
  } | string | number | null;
  last_scan_at?: string | null;
  last_risk_level?: string | null;
  last_readiness_score?: number | string | null;
};

type DepartmentRecord = {
  id?: string | number;
  name?: string | null;
  is_active?: boolean | null;
  date_created?: string | null;
  date_updated?: string | null;
  business_profile?: string | number | Record<string, unknown> | null;
  manager_member?: {
    id?: string | number;
    user?: {
      id?: string | number;
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | string | number | null;
  } | string | number | null;
};

type RequestInviteRecord = {
  id?: string | number;
  email?: string | null;
  phone?: string | null;
  token?: string | null;
  accepted_user?: string | number | { id?: string | number } | null;
  member_role?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  department?: {
    id?: string | number;
    name?: string | null;
  } | string | number | null;
  invite_type?: string | null;
  status?: string | null;
  sent_at?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
  requested_by_user?:
    | string
    | number
    | {
      id?: string | number;
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }
    | null;
};

type DirectoryUserRecord = {
  id?: string | number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ScanRequestRecord = {
  id?: string | number;
  status?: string | null;
  request_type?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  due_at?: string | null;
  cancelled?: string | null;
  requested_by_user?: string | number | { id?: string | number; email?: string | null; first_name?: string | null; last_name?: string | null } | null;
  target_member?: string | number | {
    id?: string | number;
    status?: string | null;
    member_role?: string | null;
    user?: {
      id?: string | number;
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | string | number | null;
    department?: {
      id?: string | number;
      name?: string | null;
    } | string | number | null;
  } | null;
  business_profile?: string | number | { id?: string | number } | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  completed_scan?: { id?: string | number; status?: string | null; completed_at?: string | null } | string | number | null;
};

type ScanResultRecord = {
  id?: string | number;
  date_created?: string | null;
  risk_level?: string | null;
  task_performance_score?: string | number | null;
  scan_request?: {
    target_member?: {
      id?: string | number;
      email?: string | null;
    } | string | number | null;
    requested_for_user?: {
      id?: string | number;
      email?: string | null;
    } | string | number | null;
    department?: {
      id?: string | number;
      name?: string | null;
    } | string | number | null;
  } | null;
};

type WellnessScanRecord = {
  id?: string | number;
  date_created?: string | null;
  scan_request?: {
    target_member?: {
      id?: string | number;
      email?: string | null;
    } | string | number | null;
    requested_for_user?: {
      id?: string | number;
      email?: string | null;
    } | string | number | null;
    department?: {
      id?: string | number;
      name?: string | null;
    } | string | number | null;
  } | null;
};

type AlertRecord = {
  id?: string | number;
  status?: string | null;
  department?: {
    id?: string | number;
    name?: string | null;
  } | string | number | null;
};

type ShiftTemplateRecord = {
  id?: string | number;
  name?: string | null;
  is_active?: boolean | null;
  date_created?: string | null;
  date_updated?: string | null;
};

type ScopedContext = {
  token: string;
  company: CompanyContext;
  businessProfileId: string;
  activeRole: ActiveMemberRole;
  activeDepartmentId: string | null;
};

@Injectable({ providedIn: 'root' })
export class OperationsAdminService {
  private readonly api = environment.API_URL;
  private readonly inviteExpiryDays = 7;
  private readonly collectionFieldCache = new Map<string, string[]>();
  private readonly loggedIncompleteMemberIds = new Set<string>();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companyContext: CompanyContextService
  ) {}

  getCompanyPageData(): Observable<CompanyPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const profile$ = this.queryItemsStrict<CompanyProfileRecord>(
          'business_profiles',
          ['id', 'company_name', 'is_active', 'plan_code', 'billing_status', 'date_created', 'date_updated'],
          context.token,
          {
            filters: [{ path: ['id'], operator: '_eq', value: context.businessProfileId }],
            limit: 1
          }
        ).pipe(
          map((rows) => rows[0] ?? null),
          switchMap((profile) => {
            if (profile) {
              return of(profile);
            }
            return throwError(() => new Error('No business profile was returned for the active workspace.'));
          })
        );

        const departmentFilters = [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }];
        if (context.activeRole === 'manager' && context.activeDepartmentId) {
          departmentFilters.push({ path: ['id'], operator: '_eq', value: context.activeDepartmentId });
        }

        const departments$ = this.queryItemsStrict<DepartmentRecord>(
          'departments',
          ['id', 'name', 'is_active', 'business_profile', 'manager_member', 'date_created', 'date_updated'],
          context.token,
          {
            filters: departmentFilters,
            sort: 'name',
            limit: 250
          }
        ).pipe(
          map((rows) => ({
            rows: rows.map((row) => this.mapCompanyDepartmentRecord(row)),
            issue: null as CompanyPageIssue | null
          })),
          catchError((error) =>
            of({
              rows: [] as CompanyDepartmentRecord[],
              issue: this.buildSectionIssue(error, 'Department data is unavailable for this workspace.')
            })
          )
        );

        const members$ = this.queryCompanyMembersForCompanyPage(context).pipe(
          catchError((error) =>
            of({
              rows: [] as CompanyMemberRecord[],
              issue: this.buildSectionIssue(error, 'Workspace member data is unavailable for this workspace.')
            })
          )
        );

        const invites$ = this.queryItemsStrict<RequestInviteRecord>(
          'request_invites',
          [
            'id',
            'email',
            'member_role',
            'status',
            'sent_at',
            'expires_at',
            'claimed_at',
            'department.id',
            'department.name',
            'requested_by_user.id',
            'requested_by_user.first_name',
            'requested_by_user.last_name',
            'requested_by_user.email'
          ],
          context.token,
          {
            filters: this.scopeFilters(context, ['business_profile'], ['department']),
            sort: '-sent_at',
            limit: 50
          }
        ).pipe(
          map((rows) => ({
            rows: rows.map((row) => this.mapCompanyInviteRecord(row)),
            issue: null as CompanyPageIssue | null
          })),
          catchError((error) =>
            of({
              rows: [] as CompanyInviteRecord[],
              issue: this.buildSectionIssue(error, 'Invite data is unavailable due to workspace permissions.')
            })
          )
        );

        const shiftTemplates$ = this.queryItemsStrict<ShiftTemplateRecord>(
          'shift_templates',
          ['id', 'name', 'is_active', 'date_created', 'date_updated'],
          context.token,
          {
            filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
            sort: 'name',
            limit: 200
          }
        ).pipe(
          map((rows) => ({
            rows: rows.map((row) => this.mapCompanyShiftTemplateRecord(row)),
            issue: null as CompanyPageIssue | null
          })),
          catchError((error) =>
            of({
              rows: [] as CompanyShiftTemplateRecord[],
              issue: this.buildSectionIssue(error, 'Shift template management is not available for this workspace yet.')
            })
          )
        );

        return profile$.pipe(
          switchMap((profile) =>
            forkJoin({
              departmentsResult: departments$,
              membersResult: members$,
              invitesResult: invites$,
              shiftTemplatesResult: shiftTemplates$
            }).pipe(
              map(({ departmentsResult, membersResult, invitesResult, shiftTemplatesResult }) => ({
                profile,
                activeRole: context.activeRole,
                activeDepartmentId: context.activeDepartmentId,
                departments: departmentsResult.rows,
                members: membersResult.rows,
                invites: invitesResult.rows,
                shiftTemplates: shiftTemplatesResult.rows,
                departmentsIssue: departmentsResult.issue,
                membersIssue: membersResult.issue,
                invitesIssue: invitesResult.issue,
                shiftTemplatesIssue: shiftTemplatesResult.issue
              }))
            )
          )
        );
      })
    );
  }

  updateCompanyProfile(profileId: string, input: Partial<CompanyProfileRecord>): Observable<void> {
    const payload: Record<string, unknown> = {};
    if (typeof input.company_name === 'string') {
      payload['company_name'] = input.company_name;
    }
    if (typeof input.is_active === 'boolean') {
      payload['is_active'] = input.is_active;
    }

    if (!Object.keys(payload).length) {
      return of(void 0);
    }

    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch(
          `${this.api}/items/business_profiles/${encodeURIComponent(profileId)}`,
          payload,
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(
          map(() => void 0)
        )
      )
    );
  }

  getMembersPageData(): Observable<MembersPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          members: this.queryItems<MemberRecord>(
            'business_profile_members',
            [
              'id',
              'member_role',
              'status',
              'job_title',
              'employee_code',
              'joined_at',
              'date_created',
              'department.id',
              'department.name',
              'user.id',
              'user.avatar',
              'user.email',
              'user.first_name',
              'user.last_name'
            ],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              sort: '-date_created',
              limit: 300
            }
          ),
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: 'name',
              limit: 120
            }
          ),
          invites: this.queryItems<RequestInviteRecord>(
            'request_invites',
            [
              'id',
              'email',
              'member_role',
              'department.id',
              'department.name',
              'status',
              'sent_at',
              'expires_at',
              'claimed_at'
            ],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              sort: '-sent_at',
              limit: 200
            }
          ),
          scans: this.queryItems<WellnessScanRecord>(
            'wellness_scans',
            ['id', 'date_created'],
            context.token,
            { sort: '-date_created', limit: 400 }
          ),
          results: this.queryItems<ScanResultRecord>(
            'scan_results',
            [
              'id',
              'date_created',
              'risk_level',
              'task_performance_score'
            ],
            context.token,
            {
              sort: '-date_created',
              limit: 400
            }
          ),
          alerts: this.queryItems<AlertRecord>(
            'alerts',
            ['id', 'status', 'department.id', 'department.name'],
            context.token,
            {
              filters: this.scopeFilters(context, ['business_profile'], ['department']),
              sort: '-id',
              limit: 200
            }
          )
        }).pipe(map(({ members, departments, invites, scans, results, alerts }) => this.buildMembersPageData(members, departments, invites, scans, results, alerts)))
      )
    );
  }

  getWorkforcePageData(): Observable<WorkforcePageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const filters = [
          ...this.scopeFilters(context, ['business_profile'], ['department']),
          { path: ['status'], operator: '_in', value: 'active,pending' }
        ];

        const safeFields = [
          'id',
          'status',
          'member_role',
          'joined_at',
          'business_profile',
          'department',
          'user',
          'last_scan_at',
          'last_risk_level'
        ];

        const expandedFields = [
          'id',
          'status',
          'member_role',
          'joined_at',
          'business_profile',
          'department.id',
          'department.name',
          'user.id',
          'user.first_name',
          'user.last_name',
          'user.email',
          'last_scan_at',
          'last_risk_level'
        ];

        return this.queryItems<DepartmentRecord>(
          'departments',
          ['id', 'name', 'is_active'],
          context.token,
          {
            filters: [
              { path: ['business_profile'], operator: '_eq', value: context.businessProfileId },
              { path: ['is_active'], operator: '_eq', value: 'true' }
            ],
            sort: 'name',
            limit: 250
          }
        ).pipe(
          map((rows) =>
            rows
              .map((row) => ({
                id: this.normalizeId(row.id) ?? '',
                name: this.pickString(row.name) ?? 'Unnamed Department'
              }))
              .filter((row) => row.id)
          ),
          switchMap((scopedDepartments) =>
            this.queryItemsStrict<WorkforceMemberRecord>(
              'business_profile_members',
              safeFields,
              context.token,
              {
                filters,
                sort: '-joined_at',
                limit: 500
              }
            ).pipe(
              switchMap((safeMembers) =>
                this.queryItemsStrict<WorkforceMemberRecord>(
                  'business_profile_members',
                  expandedFields,
                  context.token,
                  {
                    filters,
                    sort: '-joined_at',
                    limit: 500
                  }
                ).pipe(
                  map((expandedMembers) => this.buildWorkforcePageData(expandedMembers, null, scopedDepartments)),
                  catchError((error) => {
                    if (!this.isRelationPermissionError(error)) {
                      return throwError(() => error);
                    }

                    const relationWarning =
                      'Workforce data could not be loaded. Your role does not have permission to read member profile fields.';
                    return of(this.buildWorkforcePageData(safeMembers, relationWarning, scopedDepartments));
                  })
                )
              )
            )
          )
        );
      })
    );
  }

  getWorkforceRosterData(): Observable<WorkforceRosterPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          membersResult: this.getActiveMembers(context).pipe(
            map((rows) => ({ rows, failed: false })),
            catchError(() => of({ rows: [] as WorkforceMemberRecord[], failed: true }))
          ),
          invitesResult: this.getPendingInvites(context).pipe(
            map((rows) => ({ rows, failed: false, permissionDenied: false })),
            catchError((error) =>
              of({
                rows: [] as RequestInviteRecord[],
                failed: true,
                permissionDenied: this.isRelationPermissionError(error)
              })
            )
          ),
          acceptedInvitesResult: this.getAcceptedInvitesForMembers(context).pipe(
            map((rows) => ({ rows, failed: false })),
            catchError(() => of({ rows: [] as RequestInviteRecord[], failed: true }))
          ),
          scanRequestsResult: this.getScanRequestsForMembers(context).pipe(
            map((rows) => ({ rows, failed: false })),
            catchError(() => of({ rows: [] as ScanRequestRecord[], failed: true }))
          ),
          todaysScansResult: this.getTodaysScans(context).pipe(
            map((rows) => ({ rows, failed: false })),
            catchError(() => of({ rows: [] as WellnessScanRecord[], failed: true }))
          ),
          departmentsResult: this.getActiveDepartmentsForWorkforce(context).pipe(
            map((rows) => ({ rows, failed: false })),
            catchError(() => of({ rows: [] as DepartmentOption[], failed: true }))
          )
        }).pipe(
          switchMap(({ membersResult, invitesResult, acceptedInvitesResult, scanRequestsResult, todaysScansResult, departmentsResult }) => {
            const warningParts: string[] = [];
            if (membersResult.failed) warningParts.push('member records');
            if (invitesResult.failed) {
              warningParts.push(
                invitesResult.permissionDenied
                  ? 'Pending invites could not be loaded. Check request_invites read permission.'
                  : 'pending invites'
              );
            }
            if (acceptedInvitesResult.failed) warningParts.push('accepted invite mappings');
            if (scanRequestsResult.failed) warningParts.push('Scan request status could not be loaded. Check scan_requests read permission.');
            if (todaysScansResult.failed) warningParts.push("today's scans");
            if (departmentsResult.failed) warningParts.push('departments');
            const relationWarning =
              membersResult.failed
                ? 'Workforce data access is not configured for this role.'
                : warningParts.length
                  ? warningParts.join(' ')
                  : null;
            const userIds = this.uniqueIds([
              ...membersResult.rows.map((row) => this.normalizeId(row.user)),
              ...acceptedInvitesResult.rows.map((row) => this.normalizeId(row.accepted_user)),
              ...invitesResult.rows.map((row) => this.normalizeId(row.requested_by_user)),
              ...acceptedInvitesResult.rows.map((row) => this.normalizeId(row.requested_by_user))
            ]);

            return this.loadUsersByIds(context.token, userIds).pipe(
              map((usersById) =>
                this.buildWorkforceRosterData(
                  membersResult.rows,
                  invitesResult.rows,
                  acceptedInvitesResult.rows,
                  scanRequestsResult.rows,
                  todaysScansResult.rows,
                  departmentsResult.rows,
                  usersById,
                  relationWarning
                )
              )
            );
          })
        )
      )
    );
  }

  updateMember(memberId: string, input: MemberUpdateInput): Observable<void> {
    const payload: MemberUpdateInput = { ...input };
    if (typeof input.member_role === 'string') {
      payload.member_role = this.toBackendMemberRole(input.member_role);
    }

    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch(
          `${this.api}/items/business_profile_members/${encodeURIComponent(memberId)}`,
          payload,
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(map(() => void 0))
      )
    );
  }

  deactivateMember(memberId: string): Observable<void> {
    return this.updateMember(memberId, {
      status: 'inactive',
      deactivated_at: new Date().toISOString()
    });
  }

  getDepartmentsPageData(): Observable<DepartmentsPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            [
              'id',
              'name',
              'is_active',
              'business_profile',
              'manager_member',
              'manager_member.id',
              'manager_member.user',
              'manager_member.user.email',
              'manager_member.user.first_name',
              'manager_member.user.last_name'
            ],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: 'name',
              limit: 120
            }
          ),
          members: this.queryItems<MemberRecord>(
            'business_profile_members',
            ['id', 'member_role', 'status', 'department.id', 'department.name', 'user.id', 'user.email', 'user.first_name', 'user.last_name', 'last_scan_at', 'last_readiness_score', 'last_risk_level'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 400
            }
          ),
          shiftTemplates: this.queryItems<ShiftTemplateRecord>(
            'shift_templates',
            ['id', 'is_active'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 300
            }
          ),
          alerts: this.queryItems<AlertRecord>(
            'alerts',
            ['id', 'status', 'department.id', 'department.name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 300
            }
          )
        }).pipe(
          map(({ departments, members, shiftTemplates, alerts }) =>
            this.buildDepartmentsPageData(departments, members, shiftTemplates, alerts)
          )
        )
      )
    );
  }

  createDepartment(input: DepartmentMutationInput): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.post(
          `${this.api}/items/departments`,
          {
            business_profile: context.businessProfileId,
            name: input.name,
            is_active: input.is_active ?? true,
            manager_member: input.manager_member ?? null
          },
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(map(() => void 0))
      )
    );
  }

  updateDepartment(departmentId: string, input: Partial<DepartmentMutationInput>): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch(
          `${this.api}/items/departments/${encodeURIComponent(departmentId)}`,
          input,
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(map(() => void 0))
      )
    );
  }

  assignDepartmentManager(departmentId: string, managerId: string | null): Observable<void> {
    return this.updateDepartment(departmentId, { manager_member: managerId });
  }

  getInvitesPageData(): Observable<InvitesPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          invites: this.queryItems<RequestInviteRecord>(
            'request_invites',
            [
              'id',
              'email',
              'phone',
              'member_role',
              'department.id',
              'department.name',
              'invite_type',
              'status',
              'sent_at',
              'claimed_at',
              'expires_at'
            ],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: '-sent_at',
              limit: 200
            }
          ),
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              sort: 'name',
              limit: 120
            }
          ),
          members: this.queryItems<MemberRecord>(
            'business_profile_members',
            [
              'id',
              'member_role',
              'status',
              'department.id',
              'department.name',
              'user.id',
              'user.email',
              'user.first_name',
              'user.last_name'
            ],
            context.token,
            {
              filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
              limit: 400
            }
          )
        }).pipe(
          map(({ invites, departments, members }) => this.buildInvitesPageData(invites, departments, members))
        )
      )
    );
  }

  createInvite(input: CreateInviteInput): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const normalizedRole = this.normalizeMemberRole(input.member_role);
        const normalizedEmail = this.pickString(input.email);
        const normalizedDepartmentId = this.normalizeId(input.department);
        const normalizedNote = this.pickString(input.note);

        if (context.activeRole !== 'owner' && context.activeRole !== 'hr') {
          return throwError(() => new Error('You do not have permission to send invites from this workspace.'));
        }
        if (!normalizedEmail || !this.isValidEmail(normalizedEmail)) {
          return throwError(() => new Error('Enter a valid email address.'));
        }
        if (!['employee', 'manager', 'hr', 'owner'].includes(normalizedRole)) {
          return throwError(() => new Error('Select a valid member role.'));
        }

        return this.queryItems<DepartmentRecord>(
          'departments',
          ['id', 'name', 'is_active'],
          context.token,
          {
            filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
            sort: 'name',
            limit: 250
          }
        ).pipe(
          map((rows) =>
            rows
              .filter((row) => row.is_active !== false)
              .map((row) => ({
                id: this.normalizeId(row.id) ?? '',
                name: this.pickString(row.name) ?? 'Unnamed Department'
              }))
              .filter((row) => row.id)
          ),
          switchMap((departments) => {
            if (normalizedDepartmentId && !departments.some((department) => department.id === normalizedDepartmentId)) {
              return throwError(() => new Error('Select a valid department for this workspace.'));
            }

            return this.getCollectionFieldNames('request_invites', context.token).pipe(
              switchMap((fieldNames) => {
                const payload = this.buildInviteCreatePayload({
                  context,
                  input: {
                    ...input,
                    email: normalizedEmail,
                    member_role: normalizedRole,
                    department: normalizedDepartmentId,
                    note: normalizedNote
                  },
                  fieldNames
                });
                const endpoint = `${this.api}/items/request_invites`;

                return this.http.post<{ data?: { id?: string | number } }>(
                  endpoint,
                  payload,
                  {
                    headers: this.headers(context.token),
                    withCredentials: true
                  }
                ).pipe(
                  map(() => void 0)
                );
              })
            );
          })
        );

      })
    );
  }

  resendInvite(inviteId: string): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const now = new Date();
        const expiresAt = new Date(now.getTime());
        expiresAt.setDate(expiresAt.getDate() + this.inviteExpiryDays);
        return this.http.patch(
          `${this.api}/items/request_invites/${encodeURIComponent(inviteId)}`,
          {
            status: 'sent',
            sent_at: now.toISOString(),
            expires_at: expiresAt.toISOString()
          },
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(map(() => void 0));
      })
    );
  }

  expireInvite(inviteId: string): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch(
          `${this.api}/items/request_invites/${encodeURIComponent(inviteId)}`,
          {
            status: 'expired',
            expires_at: new Date().toISOString()
          },
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(map(() => void 0))
      )
    );
  }

  revokeInvite(inviteId: string): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const endpoint = `${this.api}/items/request_invites/${encodeURIComponent(inviteId)}`;
        const request = (status: string) =>
          this.http.patch(
            endpoint,
            { status },
            {
              headers: this.headers(context.token),
              withCredentials: true
            }
          ).pipe(map(() => void 0));

        return request('cancelled').pipe(
          catchError(() => request('revoked'))
        );
      })
    );
  }

  private ensureScopedContext(): Observable<ScopedContext> {
    return this.auth.ensureSessionToken().pipe(
      take(1),
      switchMap((ready) => {
        if (!ready) {
          return throwError(() => new Error('AUTH_REQUIRED'));
        }

        return this.companyContext.ensureLoaded().pipe(
          map((state) => {
            const context = state.context;
            const token = this.auth.getStoredAccessToken() ?? '';
            const businessProfileId = context.activeBusinessProfileId;
            const activeRole = context.activeMemberRole;
            const activeDepartmentId = activeRole === 'manager' ? context.activeDepartmentId : null;

            if (!context.authInitialized || !context.isAuthenticated) {
              throw new Error('AUTH_REQUIRED');
            }
            if (!token) {
              throw new Error('AUTH_TOKEN_MISSING');
            }
            if (!businessProfileId || !activeRole || activeRole === 'employee') {
              throw new Error('WORKSPACE_CONTEXT_MISSING');
            }

            return {
              token,
              company: context,
              businessProfileId,
              activeRole,
              activeDepartmentId
            };
          })
        );
      }),
      catchError((error) => throwError(() => error))
    );
  }

  private queryCompanyMembersForCompanyPage(
    context: ScopedContext
  ): Observable<{ rows: CompanyMemberRecord[]; issue: CompanyPageIssue | null }> {
    const filters = this.scopeFilters(context, ['business_profile'], ['department']);
    const safeFields = [
      'id',
      'status',
      'member_role',
      'user',
      'business_profile',
      'department',
      'shift_template',
      'employee_code',
      'job_title',
      'joined_at',
      'deactivated_at',
      'last_scan_at',
      'last_readiness_score',
      'last_risk_level',
      'date_created',
      'date_updated'
    ];
    const expandedFields = [
      'id',
      'status',
      'member_role',
      'user.id',
      'user.email',
      'user.first_name',
      'user.last_name',
      'business_profile',
      'department.id',
      'department.name',
      'shift_template.id',
      'shift_template.name',
      'employee_code',
      'job_title',
      'joined_at',
      'deactivated_at',
      'last_scan_at',
      'last_readiness_score',
      'last_risk_level',
      'date_created',
      'date_updated'
    ];

    return this.queryItemsStrict<MemberRecord>(
      'business_profile_members',
      safeFields,
      context.token,
      { filters, sort: '-joined_at', limit: 600 }
    ).pipe(
      switchMap((safeRows) =>
        this.queryItemsStrict<MemberRecord>(
          'business_profile_members',
          expandedFields,
          context.token,
          { filters, sort: '-joined_at', limit: 600 }
        ).pipe(
          map((expandedRows) => ({
            rows: expandedRows.map((row) => this.mapCompanyMemberRecord(row)),
            issue: null as CompanyPageIssue | null
          })),
          catchError((error) => {
            if (!this.isRelationPermissionError(error)) {
              return throwError(() => error);
            }

            return of({
              rows: safeRows.map((row) => this.mapCompanyMemberRecord(row)),
              issue: this.buildSectionIssue(
                error,
                'Workspace member details are partially unavailable due to workspace permissions.'
              )
            });
          })
        )
      )
    );
  }

  private mapCompanyDepartmentRecord(row: DepartmentRecord): CompanyDepartmentRecord {
    return {
      id: this.normalizeId(row.id) ?? '',
      name: this.pickString(row.name) ?? 'Unnamed Department',
      is_active: row.is_active !== false,
      business_profile: this.normalizeId(row.business_profile),
      manager_member_id: this.normalizeId(row.manager_member),
      date_created: this.pickString(row.date_created),
      date_updated: this.pickString(row.date_updated)
    };
  }

  private mapCompanyMemberRecord(row: MemberRecord): CompanyMemberRecord {
    return {
      id: this.normalizeId(row.id) ?? '',
      status: this.pickString(row.status),
      member_role: this.pickString(row.member_role),
      user_id: this.normalizeId(row.user),
      user_name: this.userLabel(row.user),
      user_email: this.pickString((row.user as Record<string, unknown> | null)?.['email']),
      business_profile: this.normalizeId(row.business_profile),
      department_id: this.normalizeId(row.department),
      department_name: this.departmentName(row.department),
      shift_template_id: this.normalizeId(row.shift_template),
      shift_template_name: this.pickString((row.shift_template as Record<string, unknown> | null)?.['name']),
      employee_code: this.pickString(row.employee_code),
      job_title: this.pickString(row.job_title),
      joined_at: this.pickString(row.joined_at),
      deactivated_at: this.pickString(row.deactivated_at),
      last_scan_at: this.pickString(row.last_scan_at),
      last_readiness_score: this.toNumber(row.last_readiness_score),
      last_risk_level: this.pickString(row.last_risk_level),
      date_created: this.pickString(row.date_created),
      date_updated: this.pickString(row.date_updated)
    };
  }

  private mapCompanyInviteRecord(row: RequestInviteRecord): CompanyInviteRecord {
    const invitedByName = this.userLabel(row.requested_by_user);
    const invitedByEmail = this.pickString((row.requested_by_user as Record<string, unknown> | null)?.['email']);
    return {
      id: this.normalizeId(row.id) ?? '',
      email: this.pickString(row.email),
      member_role: this.pickString(row.member_role),
      status: this.pickString(row.status),
      sent_at: this.pickString(row.sent_at),
      expires_at: this.pickString(row.expires_at),
      claimed_at: this.pickString(row.claimed_at),
      department_id: this.normalizeId(row.department),
      department_name: this.departmentName(row.department),
      invited_by_name: invitedByName,
      invited_by_email: invitedByEmail
    };
  }

  private getActiveMembers(context: ScopedContext): Observable<WorkforceMemberRecord[]> {
    const filters = [
      ...this.scopeFilters(context, ['business_profile'], ['department']),
      { path: ['status'], operator: '_eq', value: 'active' }
    ];

    const baseFields = [
      'id',
      'status',
      'member_role',
      'employee_code',
      'job_title',
      'joined_at',
      'deactivated_at',
      'date_created',
      'date_updated',
      'business_profile',
      'business_profile.id',
      'business_profile.company_name',
      'department.id',
      'department.name',
      'shift_template',
      'shift_template.id',
      'shift_template.name',
      'user.id',
      'user.first_name',
      'user.last_name',
      'user.email',
      'user.active_business_profile',
      'user.active_department',
      'user.active_member_role',
      'last_scan_at',
      'last_risk_level',
      'last_readiness_score'
    ];

    const optionalPresenceFields = [
      ...baseFields,
      'user.last_seen_at',
      'user.last_active_at'
    ];

    return this.queryItemsStrict<WorkforceMemberRecord>(
      'business_profile_members',
      optionalPresenceFields,
      context.token,
      {
        filters,
        sort: '-joined_at',
        limit: 500
      }
    ).pipe(
      catchError(() =>
        this.queryItemsStrict<WorkforceMemberRecord>(
          'business_profile_members',
          baseFields,
          context.token,
          {
            filters,
            sort: '-joined_at',
            limit: 500
          }
        )
      )
    );
  }

  private getPendingInvites(context: ScopedContext): Observable<RequestInviteRecord[]> {
    const filters = [
      ...this.scopeFilters(context, ['business_profile'], ['department']),
      { path: ['claimed_at'], operator: '_null', value: 'true' },
      { path: ['accepted_user'], operator: '_null', value: 'true' },
      { path: ['token'], operator: '_nnull', value: 'true' }
    ];

    const expandedFields = [
      'id',
      'email',
      'phone',
      'status',
      'token',
      'sent_at',
      'claimed_at',
      'expires_at',
      'requested_by_user',
      'requested_by_user.id',
      'requested_by_user.email',
      'requested_by_user.first_name',
      'requested_by_user.last_name',
      'business_profile',
      'business_profile.id',
      'business_profile.company_name',
      'member_role',
      'department',
      'department.id',
      'department.name',
      'accepted_user',
      'accepted_user.id',
      'accepted_user.email',
      'accepted_user.first_name',
      'accepted_user.last_name',
      'invite_type',
      'request'
    ];
    const fallbackFields = [
      'id',
      'email',
      'status',
      'token',
      'member_role',
      'invite_type',
      'sent_at',
      'expires_at',
      'claimed_at',
      'business_profile',
      'department',
      'requested_by_user',
      'accepted_user',
      'request'
    ];

    return this.queryItemsStrict<RequestInviteRecord>(
      'request_invites',
      expandedFields,
      context.token,
      {
        filters,
        sort: '-sent_at',
        limit: 300
      }
    ).pipe(
      catchError(() =>
        this.queryItemsStrict<RequestInviteRecord>(
          'request_invites',
          fallbackFields,
          context.token,
          {
            filters,
            sort: '-sent_at',
            limit: 300
          }
        )
      )
    );
  }

  private getAcceptedInvitesForMembers(context: ScopedContext): Observable<RequestInviteRecord[]> {
    const filters = [
      ...this.scopeFilters(context, ['business_profile'], ['department']),
      { path: ['accepted_user'], operator: '_nnull', value: 'true' }
    ];

    const expandedFields = [
      'id',
      'email',
      'phone',
      'status',
      'token',
      'sent_at',
      'claimed_at',
      'expires_at',
      'requested_by_user',
      'requested_by_user.id',
      'requested_by_user.email',
      'requested_by_user.first_name',
      'requested_by_user.last_name',
      'business_profile',
      'business_profile.id',
      'business_profile.company_name',
      'member_role',
      'department',
      'department.id',
      'department.name',
      'accepted_user',
      'accepted_user.id',
      'accepted_user.email',
      'accepted_user.first_name',
      'accepted_user.last_name',
      'invite_type',
      'request'
    ];
    const fallbackFields = [
      'id',
      'email',
      'status',
      'token',
      'member_role',
      'invite_type',
      'sent_at',
      'expires_at',
      'claimed_at',
      'business_profile',
      'department',
      'requested_by_user',
      'accepted_user',
      'request'
    ];

    return this.queryItemsStrict<RequestInviteRecord>(
      'request_invites',
      expandedFields,
      context.token,
      {
        filters,
        sort: '-sent_at',
        limit: 500
      }
    ).pipe(
      catchError(() =>
        this.queryItemsStrict<RequestInviteRecord>(
          'request_invites',
          fallbackFields,
          context.token,
          {
            filters,
            sort: '-sent_at',
            limit: 500
          }
        )
      )
    );
  }

  private getScanRequestsForMembers(context: ScopedContext): Observable<ScanRequestRecord[]> {
    const filters = this.scopeFilters(context, ['business_profile'], ['department']);

    const expandedFields = [
      'id',
      'status',
      'request_type',
      'business_profile',
      'business_profile.id',
      'business_profile.company_name',
      'department',
      'department.id',
      'department.name',
      'requested_by_user',
      'requested_by_user.id',
      'requested_by_user.email',
      'requested_by_user.first_name',
      'requested_by_user.last_name',
      'target_member',
      'target_member.id',
      'target_member.status',
      'target_member.member_role',
      'target_member.user',
      'target_member.user.id',
      'target_member.user.email',
      'target_member.user.first_name',
      'target_member.user.last_name',
      'target_member.department',
      'target_member.department.id',
      'target_member.department.name',
      'completed_scan',
      'completed_scan.id',
      'completed_scan.status',
      'completed_scan.completed_at',
      'requested_at',
      'due_at',
      'completed_at',
      'cancelled'
    ];
    const fallbackFields = [
      'id',
      'status',
      'request_type',
      'business_profile',
      'department',
      'requested_by_user',
      'target_member',
      'completed_scan',
      'cancelled',
      'requested_at',
      'due_at',
      'completed_at'
    ];

    return this.queryItemsStrict<ScanRequestRecord>(
      'scan_requests',
      expandedFields,
      context.token,
      {
        filters,
        sort: '-requested_at',
        limit: 800
      }
    ).pipe(
      catchError(() =>
        this.queryItemsStrict<ScanRequestRecord>(
          'scan_requests',
          fallbackFields,
          context.token,
          {
            filters,
            sort: '-requested_at',
            limit: 800
          }
        )
      )
    );
  }

  private getTodaysScans(context: ScopedContext): Observable<WellnessScanRecord[]> {
    const { startIso, endIso } = this.currentDayUtcRange();
    const filters = [
      ...this.scopeFilters(context, ['business_profile'], ['department']),
      { path: ['date_created'], operator: '_gte', value: startIso },
      { path: ['date_created'], operator: '_lt', value: endIso }
    ];

    return this.queryItems<WellnessScanRecord>(
      'wellness_scans',
      [
        'id',
        'date_created',
        'scan_request.target_member.id',
        'scan_request.requested_for_user.id',
        'scan_request.requested_for_user.email',
        'scan_request.department.id',
        'scan_request.department.name'
      ],
      context.token,
      {
        filters,
        sort: '-date_created',
        limit: 800
      }
    );
  }

  private getActiveDepartmentsForWorkforce(context: ScopedContext): Observable<DepartmentOption[]> {
    return this.queryItems<DepartmentRecord>(
      'departments',
      ['id', 'name', 'is_active'],
      context.token,
      {
        filters: [
          { path: ['business_profile'], operator: '_eq', value: context.businessProfileId },
          { path: ['is_active'], operator: '_eq', value: 'true' }
        ],
        sort: 'name',
        limit: 250
      }
    ).pipe(
      map((rows) =>
        rows
          .map((row) => ({
            id: this.normalizeId(row.id) ?? '',
            name: this.pickString(row.name) ?? 'Unnamed Department'
          }))
          .filter((row) => row.id)
      )
    );
  }

  private buildWorkforceRosterData(
    members: WorkforceMemberRecord[],
    invites: RequestInviteRecord[],
    acceptedInvites: RequestInviteRecord[],
    scanRequests: ScanRequestRecord[],
    todaysScans: WellnessScanRecord[],
    scopedDepartments: DepartmentOption[],
    usersById: Map<string, DirectoryUserRecord>,
    relationWarning: string | null = null
  ): WorkforceRosterPageData {
    const nowTs = Date.now();
    const departmentNameById = new Map(
      (scopedDepartments ?? [])
        .filter((item) => Boolean(item.id))
        .map((item) => [item.id, item.name] as const)
    );
    const resolveDepartmentName = (
      departmentId: string | null,
      fallbackName: string | null
    ): string | null => {
      if (departmentId && departmentNameById.has(departmentId)) {
        return departmentNameById.get(departmentId) ?? fallbackName;
      }
      if (fallbackName && departmentNameById.has(fallbackName)) {
        return departmentNameById.get(fallbackName) ?? fallbackName;
      }
      return fallbackName;
    };
    const scanCompletionByIdentity = new Map<string, string>();
    const scanRequestByIdentity = new Map<string, { status: string; dueAt: string | null; createdAt: string | null }>();

    for (const scan of todaysScans ?? []) {
      const keys = this.scanIdentityKeys(scan.scan_request);
      const createdAt = this.pickString(scan.date_created) ?? null;
      for (const key of keys) {
        const current = scanCompletionByIdentity.get(key) ?? null;
        if (!current || this.toTimestamp(createdAt) >= this.toTimestamp(current)) {
          scanCompletionByIdentity.set(key, createdAt ?? '');
        }
      }
    }

    for (const request of scanRequests ?? []) {
      const status = this.normalizeText(request.status);
      if (['completed', 'cancelled', 'canceled', 'resolved', 'closed', 'rejected', 'declined'].includes(status)) {
        continue;
      }

      const keys = this.scanIdentityKeys({
        target_member: request.target_member ?? null,
        requested_for_user:
          (request.target_member && typeof request.target_member === 'object'
            ? ((request.target_member as Record<string, unknown>)['user'] ?? null)
            : null) as any,
        department: request.department ?? null
      });
      const requestState = {
        status: status || 'requested',
        dueAt: this.pickString(request.due_at),
        createdAt: this.pickString(request.requested_at)
      };

      for (const key of keys) {
        const current = scanRequestByIdentity.get(key);
        if (!current || this.toTimestamp(requestState.createdAt) >= this.toTimestamp(current.createdAt)) {
          scanRequestByIdentity.set(key, requestState);
        }
      }
    }

    const acceptedInviteByUserId = new Map<string, RequestInviteRecord>();
    for (const invite of acceptedInvites ?? []) {
      const acceptedUserId = this.normalizeId(invite.accepted_user);
      if (!acceptedUserId) continue;
      const current = acceptedInviteByUserId.get(acceptedUserId) ?? null;
      if (!current || this.toTimestamp(invite.sent_at) >= this.toTimestamp(current.sent_at)) {
        acceptedInviteByUserId.set(acceptedUserId, invite);
      }
    }
    const candidateInvites = [...(invites ?? []), ...(acceptedInvites ?? [])];

    const memberRows: WorkforceRosterRow[] = (members ?? []).map((member) => {
      const memberId = this.normalizeId(member.id);
      const user = (member.user && typeof member.user === 'object') ? member.user as Record<string, unknown> : null;
      const userId = this.normalizeId(user?.['id'] ?? member.user);
      const directoryUser = userId ? usersById.get(userId) ?? null : null;
      const email = this.pickString(user?.['email']) ?? this.pickString(directoryUser?.email);
      const identityKeys = this.memberIdentityKeys(userId, email);
      const todaysScanAt = this.pickLatestTimestamp(identityKeys, scanCompletionByIdentity);
      const openRequest = this.pickScanRequestForIdentity(identityKeys, scanRequestByIdentity);
      const hasScanToday = Boolean(todaysScanAt);
      const isMissingScan = Boolean(openRequest) && !hasScanToday && this.isOverdue(openRequest?.dueAt, nowTs);
      const scanStatus: WorkforceScanStatus = hasScanToday
        ? 'completed'
        : openRequest
          ? (isMissingScan ? 'missing' : 'requested')
          : 'none_assigned';
      const lastScanAt = this.pickString(member.last_scan_at);
      const lastRisk = this.pickString(member.last_risk_level);
      const readinessScore = this.toNumber(member.last_readiness_score);
      const resolvedReadiness = hasScanToday ? this.resolveReadinessLabel(lastRisk, true) : 'No scan';
      const readinessLabel: WorkforceRosterRow['readiness_label'] =
        resolvedReadiness === 'No scan today' ? 'No scan' : resolvedReadiness;
      const lastSeenAt =
        this.pickString(user?.['last_seen_at']) ??
        this.pickString(user?.['last_active_at']) ??
        null;
      const lastActiveAt =
        this.pickString(user?.['last_active_at']) ??
        this.pickString(user?.['last_seen_at']) ??
        null;
      const presenceStatus: WorkforcePresenceStatus = lastSeenAt
        ? this.resolvePresenceStatus(lastSeenAt, nowTs)
        : 'never';
      const presenceLabel = lastSeenAt
        ? this.resolvePresenceLabel(lastSeenAt, presenceStatus, nowTs)
        : 'Presence unavailable';
      const firstName = this.pickString(user?.['first_name']) ?? this.pickString(directoryUser?.first_name);
      const lastName = this.pickString(user?.['last_name']) ?? this.pickString(directoryUser?.last_name);
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const profileIncomplete = !email || !userId;
      const departmentId = this.normalizeId(member.department);

      const sourceInvite = userId ? acceptedInviteByUserId.get(userId) ?? null : null;
      const invitedById = this.normalizeId(sourceInvite?.requested_by_user);
      const invitedByUser = invitedById ? usersById.get(invitedById) ?? null : null;
      const invitedByName =
        formatUserName(invitedByUser ?? sourceInvite?.requested_by_user, '') || null;
      const linkedInvite = candidateInvites.find((invite) => {
        const inviteRole = this.normalizeMemberRole(invite.member_role);
        const memberRole = this.normalizeMemberRole(member.member_role);
        if (inviteRole !== memberRole) return false;
        const inviteDepartmentId = this.normalizeId(invite.department);
        const sameDepartment = inviteDepartmentId === departmentId || (!inviteDepartmentId && !departmentId);
        if (!sameDepartment) return false;
        const inviteBusinessProfileId = this.normalizeId(invite.business_profile);
        const memberBusinessProfileId = this.normalizeId(member.business_profile);
        return inviteBusinessProfileId && memberBusinessProfileId && inviteBusinessProfileId === memberBusinessProfileId;
      }) ?? null;
      const linkedInviteRequesterId = this.normalizeId(linkedInvite?.requested_by_user);
      const linkedInviteRequesterUser = linkedInviteRequesterId ? usersById.get(linkedInviteRequesterId) ?? null : null;
      const linkedInviteRequestedBy = formatUserName(linkedInviteRequesterUser ?? linkedInvite?.requested_by_user, '') || null;
      const linkedInviteEmail = this.pickString(linkedInvite?.email);
      const acceptedInviteEmail = this.pickString(sourceInvite?.email);
      const resolvedEmail = email ?? linkedInviteEmail ?? acceptedInviteEmail ?? null;
      const linkedInviteName = linkedInviteEmail?.split('@')[0]?.trim() || null;
      const name = fullName || resolvedEmail || linkedInviteName || this.pickString(member.employee_code) || `Member #${memberId ?? ''}`;
      const departmentName = resolveDepartmentName(
        departmentId,
        this.departmentName(member.department) ?? 'Unassigned'
      );
      const needsReviewReason = (() => {
        if (!member.user) {
          return 'User relation missing';
        }
        if (member.user && typeof member.user !== 'object') {
          return 'User relation not readable';
        }
        if (!email) {
          return 'Accepted invite did not link to user';
        }
        return 'User relation missing';
      })();

      if (profileIncomplete && !environment.production && memberId && !this.loggedIncompleteMemberIds.has(memberId)) {
        this.loggedIncompleteMemberIds.add(memberId);
        console.warn('[Workforce] profile incomplete member record', {
          memberId,
          userId
        });
      }

      return {
        type: 'member',
        key: `member:${memberId ?? userId ?? 'unknown'}`,
        member_id: memberId,
        invite_id: null,
        user_id: userId,
        name,
        email: resolvedEmail,
        member_role: this.normalizeMemberRole(member.member_role),
        department_id: departmentId,
        department_name: departmentName,
        status: this.normalizeText(member.status) || 'active',
        joined_at: this.pickString(member.joined_at),
        sent_at: null,
        expires_at: null,
        claimed_at: null,
        invite_token: null,
        invite_phone: null,
        scan_status: scanStatus,
        todays_scan: hasScanToday,
        readiness_label: readinessLabel,
        last_scan_at: lastScanAt,
        last_readiness_score: readinessScore,
        last_risk_level: lastRisk,
        last_seen_at: lastSeenAt,
        last_active_at: lastActiveAt,
        presence_status: presenceStatus,
        presence_label: presenceLabel,
        is_profile_incomplete: profileIncomplete,
        invited_by_name: invitedByName,
        needs_review_reason: profileIncomplete ? needsReviewReason : null,
        linked_invite_email: this.pickString(linkedInvite?.email),
        linked_invite_status: this.pickString(linkedInvite?.status),
        linked_invite_sent_at: this.pickString(linkedInvite?.sent_at),
        linked_invite_requested_by: linkedInviteRequestedBy,
        business_profile_id: this.normalizeId(member.business_profile),
        business_profile_name: this.pickString((member.business_profile as Record<string, unknown> | null)?.['company_name']) ?? null
      } satisfies WorkforceRosterRow;
    });

    const inviteRows: WorkforceRosterRow[] = (invites ?? []).map((invite) => {
      const inviteId = this.normalizeId(invite.id);
      const role = this.normalizeMemberRole(invite.member_role);
      const email = this.pickString(invite.email);
      const phone = this.pickString(invite.phone);
      const departmentId = this.normalizeId(invite.department);
      const departmentName = resolveDepartmentName(
        departmentId,
        this.departmentName(invite.department)
      );
      const invitedById = this.normalizeId(invite.requested_by_user);
      const invitedByUser = invitedById ? usersById.get(invitedById) ?? null : null;
      const invitedByName =
        formatUserName(invitedByUser ?? invite.requested_by_user, '') || null;
      return {
        type: 'invite',
        key: `invite:${inviteId ?? email ?? 'unknown'}`,
        member_id: null,
        invite_id: inviteId,
        user_id: null,
        name: email || phone || 'Invite contact unavailable',
        email,
        member_role: role,
        department_id: departmentId,
        department_name: departmentName,
        status: this.normalizeText(invite.status) || 'pending',
        joined_at: null,
        sent_at: this.pickString(invite.sent_at),
        expires_at: this.pickString(invite.expires_at),
        claimed_at: this.pickString(invite.claimed_at),
        invite_token: this.pickString(invite.token),
        invite_phone: phone,
        scan_status: 'not_applicable',
        todays_scan: false,
        readiness_label: 'No scan',
        last_scan_at: null,
        last_readiness_score: null,
        last_risk_level: null,
        last_seen_at: null,
        last_active_at: null,
        presence_status: 'never',
        presence_label: 'Never active',
        is_profile_incomplete: false,
        invited_by_name: invitedByName ?? 'System',
        needs_review_reason: null,
        linked_invite_email: null,
        linked_invite_status: null,
        linked_invite_sent_at: null,
        linked_invite_requested_by: null,
        business_profile_id: this.normalizeId(invite.business_profile),
        business_profile_name: this.pickString((invite.business_profile as Record<string, unknown> | null)?.['company_name']) ?? null
      } satisfies WorkforceRosterRow;
    });

    const memberByMemberId = new Map<string, WorkforceRosterRow>();
    const memberByUserId = new Map<string, WorkforceRosterRow>();
    const memberByEmail = new Map<string, WorkforceRosterRow>();
    for (const row of memberRows) {
      if (row.member_id) memberByMemberId.set(row.member_id, row);
      if (row.user_id) memberByUserId.set(row.user_id, row);
      if (row.email) memberByEmail.set(row.email.toLowerCase(), row);
    }

    const scanRequestRows: WorkforceScanRequestRow[] = (scanRequests ?? [])
      .map((request) => {
        const requestId = this.normalizeId(request.id) ?? '';
        if (!requestId) return null;

        const targetMemberId = this.normalizeId(request.target_member);
        const targetMemberRecord =
          request.target_member && typeof request.target_member === 'object'
            ? (request.target_member as Record<string, unknown>)
            : null;
        const targetUserRecord =
          targetMemberRecord?.['user'] && typeof targetMemberRecord['user'] === 'object'
            ? (targetMemberRecord['user'] as Record<string, unknown>)
            : null;
        const targetUserId = this.normalizeId(targetUserRecord?.['id'] ?? targetMemberRecord?.['user']);
        const targetUserEmail = this.pickString(targetUserRecord?.['email']);
        const requestedBy =
          request.requested_by_user && typeof request.requested_by_user === 'object'
            ? (request.requested_by_user as Record<string, unknown>)
            : null;
        const requestedByName = this.userLabel(requestedBy) || 'Requester';
        const requestedByUserId = this.normalizeId(requestedBy);

        const matchedMember =
          (targetMemberId ? memberByMemberId.get(targetMemberId) : null) ??
          (targetUserId ? memberByUserId.get(targetUserId) : null) ??
          (targetUserEmail ? memberByEmail.get(targetUserEmail.toLowerCase()) : null) ??
          null;

        const departmentId = this.normalizeId(request.department);
        const departmentName = resolveDepartmentName(
          departmentId,
          this.departmentName(request.department) ??
          this.departmentName(targetMemberRecord?.['department']) ??
          'Unassigned'
        );
        const cancelled = this.normalizeText(request.status) === 'cancelled';

        return {
          id: requestId,
          status: this.normalizeText(request.status) || 'pending',
          request_type: this.pickString(request.request_type),
          requested_at: this.pickString(request.requested_at),
          due_at: this.pickString(request.due_at),
          completed_at: this.pickString(request.completed_at),
          cancelled,
          department_id: departmentId,
          department_name: departmentName,
          target_member_id: targetMemberId,
          target_member_name: matchedMember?.name || this.userLabel(targetUserRecord) || 'Assigned member',
          target_user_id: targetUserId,
          target_user_email: targetUserEmail,
          requested_by_user_id: requestedByUserId,
          requested_by_name: requestedByName,
          cancelled_note: this.pickString(request.cancelled)
        } satisfies WorkforceScanRequestRow;
      })
      .filter((row): row is WorkforceScanRequestRow => Boolean(row))
      .sort((left, right) => this.toTimestamp(right.requested_at) - this.toTimestamp(left.requested_at));

    const rows = [...inviteRows, ...memberRows];
    const departments = (scopedDepartments ?? [])
      .filter((item) => Boolean(item.id))
      .sort((left, right) => left.name.localeCompare(right.name));
    const roles = Array.from(new Set(rows.map((row) => row.member_role).filter(Boolean))).sort();
    const statuses = Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort();
      const activeMemberRows = memberRows.filter((row) => this.normalizeText(row.status) === 'active');
      const activeMembers = activeMemberRows.length;
      const scanEligible = activeMemberRows.filter((row) => row.member_role === 'employee').length;
      const scanRequested = activeMemberRows.filter((row) => row.scan_status === 'requested').length;
      const scannedToday = activeMemberRows.filter((row) => row.scan_status === 'completed').length;
      const missingScans = activeMemberRows.filter((row) => row.scan_status === 'missing').length;
      const pendingInvites = inviteRows.filter((row) => ['pending', 'sent'].includes(this.normalizeText(row.status))).length;
      const ownerCount = activeMemberRows.filter((row) => row.member_role === 'owner').length;
      const hrCount = activeMemberRows.filter((row) => row.member_role === 'hr').length;
      const managerCount = activeMemberRows.filter((row) => row.member_role === 'manager').length;
      const employeeCount = activeMemberRows.filter((row) => row.member_role === 'employee').length;
      const needsReviewCount = memberRows.filter((row) => row.is_profile_incomplete).length;

    return {
      rows,
      memberRows,
      inviteRows,
      scanRequestRows,
      departments,
      roles,
      statuses,
      summary: {
        activeMembers,
        scanEligible,
        scanRequested,
        scannedToday,
        missingScans,
        pendingInvites,
        ownerCount,
        hrCount,
        managerCount,
        employeeCount,
        needsReviewCount
      },
      relationWarning
    };
  }

  private mapCompanyShiftTemplateRecord(row: ShiftTemplateRecord): CompanyShiftTemplateRecord {
    return {
      id: this.normalizeId(row.id) ?? '',
      name: this.pickString(row.name),
      is_active: typeof row.is_active === 'boolean' ? row.is_active : null,
      date_created: this.pickString(row.date_created),
      date_updated: this.pickString(row.date_updated)
    };
  }

  private buildSectionIssue(error: unknown, fallback: string): CompanyPageIssue {
    const message =
      (error as HttpErrorResponse | null)?.error?.errors?.[0]?.extensions?.reason ||
      (error as HttpErrorResponse | null)?.error?.errors?.[0]?.message ||
      (error as HttpErrorResponse | null)?.error?.message ||
      (error as HttpErrorResponse | null)?.message ||
      fallback;

    return {
      unavailable: true,
      permissionDenied: this.isRelationPermissionError(error),
      message: this.pickString(message) ?? fallback
    };
  }

  private buildMembersPageData(
    members: MemberRecord[],
    departments: DepartmentRecord[],
    invites: RequestInviteRecord[],
    scans: WellnessScanRecord[],
    results: ScanResultRecord[],
    alerts: AlertRecord[]
  ): MembersPageData {
    const latestScanByKey = new Map<string, string>();
    const latestResultByKey = new Map<string, { score: number | null; risk: string | null; timestamp: string | null }>();
    const latestInviteByEmail = new Map<string, RequestInviteRecord>();

    for (const scan of scans ?? []) {
      const keys = this.scanIdentityKeys(scan.scan_request);
      const timestamp = scan.date_created ?? null;
      for (const key of keys) {
        const current = latestScanByKey.get(key);
        if (!current || this.toTimestamp(timestamp) >= this.toTimestamp(current)) {
          latestScanByKey.set(key, timestamp || '');
        }
      }
    }

    for (const result of results ?? []) {
      const keys = this.scanIdentityKeys(result.scan_request);
      const payload = {
        score: this.toNumber(result.task_performance_score),
        risk: result.risk_level?.trim() || null,
        timestamp: result.date_created ?? null
      };
      for (const key of keys) {
        const current = latestResultByKey.get(key);
        if (!current || this.toTimestamp(payload.timestamp) >= this.toTimestamp(current.timestamp)) {
          latestResultByKey.set(key, payload);
        }
      }
    }

    for (const invite of invites ?? []) {
      const email = this.pickString(invite.email)?.toLowerCase();
      if (!email) {
        continue;
      }

      const current = latestInviteByEmail.get(email);
      const currentTimestamp = this.toTimestamp(current?.sent_at ?? null);
      const nextTimestamp = this.toTimestamp(invite.sent_at ?? null);
      if (!current || nextTimestamp >= currentTimestamp) {
        latestInviteByEmail.set(email, invite);
      }
    }

    const openAlertsByDepartment = new Map<string, number>();
    for (const alert of alerts ?? []) {
      if (!this.isOpenAlertStatus(alert.status)) {
        continue;
      }
      const departmentId = this.normalizeId(alert.department);
      if (!departmentId) {
        continue;
      }
      openAlertsByDepartment.set(departmentId, (openAlertsByDepartment.get(departmentId) ?? 0) + 1);
    }

    const rows = (members ?? []).map((member) => {
      const user = member.user ?? null;
      const userId = this.normalizeId(user?.id);
      const email = this.pickString(user?.email);
      const identityKeys = this.memberIdentityKeys(userId, email);
      const latestScanAt = this.pickLatestTimestamp(identityKeys, latestScanByKey);
      const latestResult = this.pickLatestResult(identityKeys, latestResultByKey);
      const departmentId = this.normalizeId(member.department);
      const invite = email ? latestInviteByEmail.get(email.toLowerCase()) ?? null : null;
      const scanEligible = this.isScanEligibleMember(member.status, member.member_role);

      return {
        id: this.normalizeId(member.id) ?? '',
        avatar: this.pickString(user?.avatar),
        name: this.userLabel(user),
        email,
        member_role: member.member_role ?? null,
        status: member.status ?? null,
        department_id: departmentId,
        department_name: this.departmentName(member.department),
        job_title: member.job_title ?? null,
        employee_code: member.employee_code ?? null,
        joined_at: member.joined_at ?? member.date_created ?? null,
        last_scan_at: latestScanAt,
        last_readiness_score: latestResult?.score ?? null,
        last_risk_level: latestResult?.risk ?? null,
        scan_eligible: scanEligible,
        department_alert_count: departmentId ? (openAlertsByDepartment.get(departmentId) ?? 0) : 0,
        pending_invite_id: this.normalizeId(invite?.id),
        pending_invite_status: invite?.status ?? null,
        pending_invite_sent_at: invite?.sent_at ?? null,
        pending_invite_expires_at: invite?.expires_at ?? null,
        user_id: userId
      } satisfies MemberDirectoryRow;
    });

    return {
      rows,
      departments: (departments ?? []).map((department) => ({
        id: this.normalizeId(department.id) ?? '',
        name: department.name?.trim() || 'Unnamed Department'
      })).filter((item) => item.id),
      summary: {
        total: rows.length,
        active: rows.filter((item) => this.normalizeText(item.status) === 'active').length,
        scanEligible: rows.filter((item) => item.scan_eligible).length,
        pendingInvites: (invites ?? []).filter((item) => {
          const normalizedStatus = this.normalizeText(item.status);
          return ['pending', 'sent'].includes(normalizedStatus) && !item.claimed_at;
        }).length,
        managers: rows.filter((item) => this.isManagerRole(item.member_role)).length,
        inactive: rows.filter((item) => ['inactive', 'suspended'].includes(this.normalizeText(item.status))).length
      }
    };
  }

  private buildDepartmentsPageData(
    departments: DepartmentRecord[],
    members: MemberRecord[],
    shiftTemplates: ShiftTemplateRecord[],
    alerts: AlertRecord[]
  ): DepartmentsPageData {
    const employeeCountByDepartment = new Map<string, number>();
    for (const member of members ?? []) {
      const departmentId = this.normalizeId(member.department);
      if (!departmentId) continue;
      employeeCountByDepartment.set(departmentId, (employeeCountByDepartment.get(departmentId) ?? 0) + 1);
    }

    const readinessByDepartment = new Map<string, { total: number; count: number }>();
    for (const member of members ?? []) {
      const departmentId = this.normalizeId(member.department);
      const score = this.toNumber(member.last_readiness_score);
      if (!departmentId || score === null) continue;
      const current = readinessByDepartment.get(departmentId) ?? { total: 0, count: 0 };
      current.total += score;
      current.count += 1;
      readinessByDepartment.set(departmentId, current);
    }

    const activeShiftTemplateCount = (shiftTemplates ?? []).filter((template) => template.is_active !== false).length;

    const openAlertsByDepartment = new Map<string, number>();
    for (const alert of alerts ?? []) {
      const departmentId = this.normalizeId(alert.department);
      if (!departmentId || !this.isOpenAlertStatus(alert.status)) continue;
      openAlertsByDepartment.set(departmentId, (openAlertsByDepartment.get(departmentId) ?? 0) + 1);
    }

    const managerOptions = (members ?? [])
      .filter((member) => {
        const role = this.normalizeText(member.member_role);
        const status = this.normalizeText(member.status);
        const canManageDepartment = role === 'owner' || role === 'hr' || role === 'admin' || role === 'manager' || role === 'manger';
        return canManageDepartment && status === 'active';
      })
      .map((member) => ({
        id: this.normalizeId(member.id) ?? '',
        label: `${this.userLabel(member.user)} - ${this.toDisplayLabel(this.normalizeMemberRole(member.member_role))}`
      }))
      .filter((item) => item.id);

    const memberLabelById = new Map<string, string>();
    for (const member of members ?? []) {
      const memberId = this.normalizeId(member.id);
      if (!memberId) continue;
      memberLabelById.set(memberId, this.userLabel(member.user));
    }

    return {
      rows: (departments ?? []).map((department) => {
        const departmentId = this.normalizeId(department.id) ?? '';
        const readiness = readinessByDepartment.get(departmentId);
        const managerMember = department.manager_member ?? null;
        const managerMemberId = this.normalizeId(managerMember);
        return {
          id: departmentId,
          name: department.name?.trim() || 'Unnamed Department',
          is_active: department.is_active !== false,
          business_profile: this.normalizeId(department.business_profile) ?? '',
          manager_member: managerMember,
          manager_name: this.managerMemberLabel(managerMember) ?? (managerMemberId ? memberLabelById.get(managerMemberId) ?? null : null),
          employee_count: employeeCountByDepartment.get(departmentId) ?? 0,
          average_readiness_score: readiness && readiness.count ? Math.round((readiness.total / readiness.count) * 10) / 10 : null,
          active_shift_template_count: 0,
          open_alerts_count: openAlertsByDepartment.get(departmentId) ?? 0
        } satisfies DepartmentRow;
      }),
      shift_template_count: activeShiftTemplateCount,
      managerOptions
    };
  }

  private buildInvitesPageData(
    invites: RequestInviteRecord[],
    departments: DepartmentRecord[],
    members: MemberRecord[]
  ): InvitesPageData {
    const memberByEmail = new Map<string, { id: string; name: string }>();
    for (const member of members ?? []) {
      const email = this.pickString(member.user?.email)?.toLowerCase();
      const memberId = this.normalizeId(member.id);
      if (!email || !memberId) continue;
      memberByEmail.set(email, {
        id: memberId,
        name: this.userLabel(member.user)
      });
    }

    const rows = (invites ?? []).map((invite) => {
      const email = this.pickString(invite.email);
      const claimedMember = email ? memberByEmail.get(email.toLowerCase()) : null;
      return {
        id: this.normalizeId(invite.id) ?? '',
        email,
        phone: invite.phone ?? null,
        member_role: invite.member_role ?? null,
        department_id: this.normalizeId(invite.department),
        department_name: this.departmentName(invite.department),
        invite_type: invite.invite_type ?? null,
        status: invite.status ?? null,
        sent_at: invite.sent_at ?? null,
        claimed_at: invite.claimed_at ?? null,
        expires_at: invite.expires_at ?? null,
        claimed_member_id: claimedMember?.id ?? null,
        claimed_member_name: claimedMember?.name ?? null
      } satisfies InviteRow;
    });

    return {
      rows,
      departments: (departments ?? []).map((department) => ({
        id: this.normalizeId(department.id) ?? '',
        name: department.name?.trim() || 'Unnamed Department'
      })).filter((item) => item.id),
      summary: {
        pending: rows.filter((item) => this.normalizeText(item.status) === 'pending').length,
        sent: rows.filter((item) => this.normalizeText(item.status) === 'sent').length,
        claimed: rows.filter((item) => item.claimed_at || this.normalizeText(item.status) === 'claimed').length,
        expired: rows.filter((item) => this.normalizeText(item.status) === 'expired').length
      }
    };
  }

  private buildWorkforcePageData(
    members: WorkforceMemberRecord[],
    relationWarning: string | null,
    scopedDepartments: DepartmentOption[]
  ): WorkforcePageData {
    const rows = (members ?? []).map((member) => {
      const status = this.pickString(member.status)?.toLowerCase() ?? 'active';
      const memberRole = this.normalizeMemberRole(member.member_role);
      const lastScanAt = this.pickString(member.last_scan_at);
      const todaysScan = this.isToday(lastScanAt);

      return {
        id: this.normalizeId(member.id) ?? '',
        status,
        member_role: memberRole,
        joined_at: this.pickString(member.joined_at),
        business_profile: this.normalizeId(member.business_profile),
        department_id: this.normalizeId(member.department),
        department_name: this.departmentName(member.department),
        user_id: this.normalizeId(member.user),
        user_first_name: this.pickString((member.user as Record<string, unknown> | null)?.['first_name']),
        user_last_name: this.pickString((member.user as Record<string, unknown> | null)?.['last_name']),
        user_email: this.pickString((member.user as Record<string, unknown> | null)?.['email']),
        todays_scan: todaysScan,
        readiness_label: this.resolveReadinessLabel(member.last_risk_level, todaysScan),
        last_scan_at: lastScanAt
        } satisfies WorkforceMemberRow;
    });

    const departments = (scopedDepartments ?? [])
      .filter((item) => Boolean(item.id))
      .sort((left, right) => left.name.localeCompare(right.name));

    const roles = Array.from(
      new Set(
        rows.map((row) => row.member_role).filter((role) => Boolean(role))
      )
    ).sort();

    const statuses = Array.from(
      new Set(
        rows.map((row) => row.status).filter((status) => Boolean(status))
      )
    ).sort();

    const activeMembers = rows.filter((row) => row.status === 'active').length;
    const scanEligible = rows.filter((row) => row.status === 'active' && row.member_role === 'employee').length;
    const scanRequested = 0;
    const scannedToday = rows.filter((row) => row.todays_scan).length;
    const missingScans = rows.filter((row) => row.status === 'active' && !row.todays_scan).length;
    const pendingInvites = rows.filter((row) => row.status === 'pending').length;

    return {
      rows,
      departments,
      roles,
      statuses,
      summary: {
        activeMembers,
        scanEligible,
        scanRequested,
        scannedToday,
        missingScans,
        pendingInvites,
        ownerCount: rows.filter((row) => row.member_role === 'owner').length,
        hrCount: rows.filter((row) => row.member_role === 'hr').length,
        managerCount: rows.filter((row) => row.member_role === 'manager').length,
        employeeCount: rows.filter((row) => row.member_role === 'employee').length,
        needsReviewCount: rows.filter((row) => !row.user_id || !row.user_email).length
      },
      relationWarning
    };
  }

  private queryItems<T>(
    collection: string,
    fields: string[],
    token: string,
    options?: {
      filters?: Array<{ path: string[]; operator: string; value: string }>;
      sort?: string;
      limit?: number;
    }
  ): Observable<T[]> {
    const params = new URLSearchParams({
      fields: fields.join(','),
      limit: String(options?.limit ?? 100),
      sort: options?.sort ?? '-id'
    });

    for (const filter of options?.filters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${collection}?${params.toString()}`,
      {
        headers: this.headers(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => response.data ?? []),
      catchError(() => of([]))
    );
  }

  private queryItemsStrict<T>(
    collection: string,
    fields: string[],
    token: string,
    options?: {
      filters?: Array<{ path: string[]; operator: string; value: string }>;
      sort?: string;
      limit?: number;
    }
  ): Observable<T[]> {
    const params = new URLSearchParams({
      fields: fields.join(','),
      limit: String(options?.limit ?? 100),
      sort: options?.sort ?? '-id'
    });

    for (const filter of options?.filters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    const url = `${this.api}/items/${collection}?${params.toString()}`;
    if (collection === 'scan_requests') {
      console.log('[ScanRequestsDebug] final scan_requests query URL', url);
    }

    return this.http.get<{ data?: T[] }>(
      url,
      {
        headers: this.headers(token),
        withCredentials: true
      }
    ).pipe(
      timeout(15000),
      map((response) => {
        const rows = response.data ?? [];
        if (collection === 'scan_requests') {
          console.log('[ScanRequestsDebug] raw API response count', Array.isArray(rows) ? rows.length : 0);
        }
        return rows;
      })
    );
  }

  private loadUsersByIds(token: string, userIds: string[]): Observable<Map<string, DirectoryUserRecord>> {
    if (!userIds.length) {
      return of(new Map<string, DirectoryUserRecord>());
    }

    const params = new URLSearchParams({
      fields: 'id,email,first_name,last_name',
      limit: String(Math.min(Math.max(userIds.length, 1), 500))
    });
    this.setFilter(params, ['id'], '_in', userIds.join(','));

    return this.http.get<{ data?: DirectoryUserRecord[] }>(
      `${this.api}/users?${params.toString()}`,
      {
        headers: this.headers(token),
        withCredentials: true
      }
    ).pipe(
      timeout(12000),
      map((response) => {
        const mapById = new Map<string, DirectoryUserRecord>();
        for (const row of response.data ?? []) {
          const id = this.normalizeId(row.id);
          if (!id) continue;
          mapById.set(id, row);
        }
        return mapById;
      }),
      catchError(() => of(new Map<string, DirectoryUserRecord>()))
    );
  }

  private headers(token: string): HttpHeaders {
    return this.auth.getAuthHeaders(token);
  }

  private uniqueIds(values: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const value of values ?? []) {
      const id = this.normalizeId(value);
      if (id) {
        set.add(id);
      }
    }
    return Array.from(set);
  }

  private setFilter(params: URLSearchParams, path: string[], operator: string, value: string): void {
    let key = 'filter';
    for (const part of path) {
      key += `[${part}]`;
    }
    key += `[${operator}]`;
    params.set(key, value);
  }

  private scopeFilters(
    context: ScopedContext,
    businessPath: string[],
    departmentPath?: string[]
  ): Array<{ path: string[]; operator: string; value: string }> {
    const filters = [{ path: businessPath, operator: '_eq', value: context.businessProfileId }];
    if (context.activeRole === 'manager' && context.activeDepartmentId && departmentPath?.length) {
      filters.push({ path: departmentPath, operator: '_eq', value: context.activeDepartmentId });
    }
    return filters;
  }

  private scanIdentityKeys(scanRequest: WellnessScanRecord['scan_request'] | ScanResultRecord['scan_request']): string[] {
    const keys: string[] = [];
    const userId = this.normalizeId(scanRequest?.target_member ?? scanRequest?.requested_for_user);
    const email = this.pickString((scanRequest?.target_member as Record<string, unknown> | null)?.['email'] ?? (scanRequest?.requested_for_user as Record<string, unknown> | null)?.['email']);

    if (userId) {
      keys.push(`user:${userId}`);
    }
    if (email) {
      keys.push(`email:${email.toLowerCase()}`);
    }
    return keys;
  }

  private memberIdentityKeys(userId: string | null, email: string | null): string[] {
    const keys: string[] = [];
    if (userId) {
      keys.push(`user:${userId}`);
    }
    if (email) {
      keys.push(`email:${email.toLowerCase()}`);
    }
    return keys;
  }

  private pickLatestTimestamp(keys: string[], mapByKey: Map<string, string>): string | null {
    let latest: string | null = null;
    for (const key of keys) {
      const candidate = mapByKey.get(key) ?? null;
      if (!candidate) continue;
      if (!latest || this.toTimestamp(candidate) >= this.toTimestamp(latest)) {
        latest = candidate;
      }
    }
    return latest;
  }

  private pickLatestResult(
    keys: string[],
    mapByKey: Map<string, { score: number | null; risk: string | null; timestamp: string | null }>
  ): { score: number | null; risk: string | null; timestamp: string | null } | null {
    let latest: { score: number | null; risk: string | null; timestamp: string | null } | null = null;
    for (const key of keys) {
      const candidate = mapByKey.get(key) ?? null;
      if (!candidate) continue;
      if (!latest || this.toTimestamp(candidate.timestamp) >= this.toTimestamp(latest.timestamp)) {
        latest = candidate;
      }
    }
    return latest;
  }

  private pickScanRequestForIdentity(
    keys: string[],
    mapByKey: Map<string, { status: string; dueAt: string | null; createdAt: string | null }>
  ): { status: string; dueAt: string | null; createdAt: string | null } | null {
    let latest: { status: string; dueAt: string | null; createdAt: string | null } | null = null;
    for (const key of keys) {
      const candidate = mapByKey.get(key) ?? null;
      if (!candidate) continue;
      if (!latest || this.toTimestamp(candidate.createdAt) >= this.toTimestamp(latest.createdAt)) {
        latest = candidate;
      }
    }
    return latest;
  }

  private isOverdue(dueAt: string | null | undefined, nowTs: number): boolean {
    if (!dueAt) {
      return false;
    }
    const dueTs = this.toTimestamp(dueAt);
    if (!dueTs) {
      return false;
    }
    return dueTs < nowTs;
  }

  private currentDayUtcRange(): { startIso: string; endIso: string } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString()
    };
  }

  private resolvePresenceStatus(lastSeenAt: string | null, nowTs: number): WorkforcePresenceStatus {
    const lastSeenTs = this.toTimestamp(lastSeenAt);
    if (!lastSeenTs) {
      return 'never';
    }
    const diffMs = Math.max(nowTs - lastSeenTs, 0);
    const diffMinutes = diffMs / 60000;
    if (diffMinutes <= 2) {
      return 'online';
    }
    if (diffMinutes <= 15) {
      return 'idle';
    }
    return 'offline';
  }

  private resolvePresenceLabel(lastSeenAt: string | null, status: WorkforcePresenceStatus, nowTs: number): string {
    if (!lastSeenAt) {
      return 'Never active';
    }
    if (status === 'online') {
      return 'Online now';
    }
    const lastSeenTs = this.toTimestamp(lastSeenAt);
    if (!lastSeenTs) {
      return 'Never active';
    }
    const diffMinutes = Math.max(Math.floor((nowTs - lastSeenTs) / 60000), 0);
    if (status === 'idle') {
      return `Active ${Math.max(diffMinutes, 1)} min ago`;
    }
    if (diffMinutes >= 1440) {
      return 'Last seen yesterday';
    }
    return `Last seen ${Math.max(diffMinutes, 1)} min ago`;
  }

  private userLabel(user: unknown): string {
    return formatUserName(user, 'Unknown user');
  }

  private departmentName(value: unknown): string | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const directName = this.pickString(record['name']);
      const aliasName = this.pickString(record['department_name']);
      return directName ?? aliasName ?? null;
    }
    return null;
  }

  private managerMemberLabel(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const user = record['user'];
    if (user && typeof user === 'object') {
      return this.userLabel(user);
    }

    return this.userLabel(record['user']);
  }

  private isOpenAlertStatus(value: string | null | undefined): boolean {
    const normalized = this.normalizeText(value);
    return !['resolved', 'closed', 'dismissed', 'completed'].includes(normalized);
  }

  private isScanEligibleMember(status: string | null | undefined, role: string | null | undefined): boolean {
    const normalizedStatus = this.normalizeText(status);
    const normalizedRole = this.normalizeMemberRole(role);
    return normalizedStatus === 'active' && normalizedRole === 'employee';
  }

  private isManagerRole(role: string | null | undefined): boolean {
    return this.normalizeMemberRole(role) === 'manager';
  }

  private normalizeMemberRole(value: unknown): string {
    const normalized = this.normalizeText(value);
    if (normalized === 'manager' || normalized === 'manger') {
      return 'manager';
    }
    if (normalized === 'hr' || normalized === 'admin') {
      return 'hr';
    }
    if (normalized === 'employee' || normalized === 'member' || normalized === 'viewer') {
      return 'employee';
    }
    if (normalized === 'owner') {
      return 'owner';
    }
    return normalized || 'employee';
  }

  private toBackendMemberRole(value: unknown): string {
    const normalized = this.normalizeMemberRole(value);
    return normalized;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private getCollectionFieldNames(collection: string, token: string): Observable<string[]> {
    const cacheKey = collection.trim().toLowerCase();
    const cached = this.collectionFieldCache.get(cacheKey);
    if (cached?.length) {
      return of(cached);
    }

    const url = `${this.api}/fields/${encodeURIComponent(collection)}?limit=500&fields=field`;
    return this.http.get<{ data?: Array<{ field?: string | null }> }>(
      url,
      {
        headers: this.headers(token),
        withCredentials: true
      }
    ).pipe(
      map((response) =>
        (response.data ?? [])
          .map((row) => this.pickString(row.field)?.toLowerCase() ?? '')
          .filter(Boolean)
      ),
      map((fields) => {
        if (!fields.length) {
          return this.defaultRequestInviteFieldNames();
        }
        this.collectionFieldCache.set(cacheKey, fields);
        return fields;
      }),
      catchError(() => of(this.defaultRequestInviteFieldNames()))
    );
  }

  private defaultRequestInviteFieldNames(): string[] {
    return [
      'email',
      'invited_email',
      'recipient_email',
      'business_profile',
      'member_role',
      'department',
      'requested_by_user',
      'status',
      'note',
      'message',
      'phone',
      'invite_type'
    ];
  }

  private buildInviteCreatePayload(input: {
    context: ScopedContext;
    input: CreateInviteInput;
    fieldNames: string[];
  }): Record<string, unknown> {
    const fieldSet = new Set((input.fieldNames ?? []).map((field) => this.normalizeText(field)));
    const payload: Record<string, unknown> = {};
    const choose = (keys: string[]): string | null => {
      for (const key of keys) {
        if (fieldSet.has(this.normalizeText(key))) {
          return key;
        }
      }
      return null;
    };

    const emailField = choose(['email', 'invited_email', 'recipient_email']);
    if (!emailField) {
      throw new Error('request_invites email field is missing in Directus schema.');
    }
    payload[emailField] = input.input.email ?? null;

    const businessProfileField = choose(['business_profile']);
    if (!businessProfileField) {
      throw new Error('request_invites.business_profile field is missing in Directus schema.');
    }
    payload[businessProfileField] = input.context.businessProfileId;

    const roleField = choose(['member_role']);
    if (roleField) {
      payload[roleField] = this.toBackendMemberRole(input.input.member_role);
    }

    const departmentField = choose(['department']);
    if (departmentField) {
      payload[departmentField] = input.input.department ?? null;
    }

    const requesterField = choose(['requested_by_user']);
    if (requesterField && input.context.company.userId) {
      payload[requesterField] = input.context.company.userId;
    }

    const statusField = choose(['status']);
    if (statusField) {
      payload[statusField] = 'pending';
    }

    const noteField = choose(['note', 'message']);
    if (noteField && input.input.note) {
      payload[noteField] = input.input.note;
    }

    const phoneField = choose(['phone']);
    if (phoneField && input.input.phone) {
      payload[phoneField] = input.input.phone;
    }

    const inviteTypeField = choose(['invite_type']);
    if (inviteTypeField && input.input.invite_type) {
      payload[inviteTypeField] = input.input.invite_type;
    }

    return payload;
  }

  private isRelationPermissionError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    if (error.status === 401 || error.status === 403) {
      return true;
    }

    const message = [
      error.error?.errors?.[0]?.extensions?.reason,
      error.error?.errors?.[0]?.message,
      error.error?.message,
      error.message
    ]
      .map((part) => this.pickString(part)?.toLowerCase() ?? '')
      .join(' ');

    return (
      message.includes('forbidden') ||
      message.includes('permission') ||
      message.includes('not allowed') ||
      message.includes('access denied') ||
      message.includes('field')
    );
  }

  private isToday(value: string | null): boolean {
    if (!value) {
      return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  private resolveReadinessLabel(
    risk: string | null | undefined,
    todaysScan: boolean
  ): WorkforceMemberRow['readiness_label'] {
    if (!todaysScan) {
      return 'No scan today';
    }

    const normalizedRisk = this.normalizeText(risk);
    if (normalizedRisk === 'high_risk' || normalizedRisk === 'high risk') {
      return 'High Risk';
    }
    if (normalizedRisk === 'elevated_fatigue' || normalizedRisk === 'elevated fatigue' || normalizedRisk === 'fatigue') {
      return 'Elevated Fatigue';
    }
    if (normalizedRisk === 'low_focus' || normalizedRisk === 'low focus') {
      return 'Low Focus';
    }
    return 'Stable';
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

  private normalizeText(value: unknown): string {
    return this.pickString(value)?.toLowerCase() ?? '';
  }

  private resolveWorkspaceAccessLabel(
    profile: Pick<CompanyProfileRecord, 'billing_status' | 'is_active'> | null | undefined
  ): string {
    const billingStatus = this.normalizeText(profile?.billing_status);
    if (billingStatus === 'trial') {
      return 'Business Trial';
    }
    if (Boolean(profile?.is_active)) {
      return 'Business';
    }
    if (billingStatus) {
      return this.toDisplayLabel(billingStatus);
    }
    return 'Free';
  }

  private toDisplayLabel(value: string): string {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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

  private toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
