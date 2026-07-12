import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of, throwError, firstValueFrom } from 'rxjs';
import { catchError, map, switchMap, take, tap, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
  formatBusinessProfile,
  formatDepartment,
  formatMember,
  formatUserName,
  isUuid,
  sanitizeDisplayValue
} from '../shared/utils/display-formatters';

import { CompanyContextService, type CompanyContext } from '../core/context/company-context.service';
import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AuthService } from './auth';
import { SecurityMessages } from '../shared/utils/security-error';
import { WorkforceRosterApiService, type WorkforceRosterPayload } from './workforce-roster-api.service';

export type WorkflowDepartmentOption = {
  id: string;
  name: string;
};

export type WorkflowShiftTemplateOption = {
  id: string;
  label: string;
  is_active: boolean | null;
};

export type WorkflowMemberOption = {
  member_id: string;
  user_id: string | null;
  label: string;
  email: string | null;
  member_role: string | null;
  department_id: string | null;
  department_name: string | null;
  status: string | null;
  has_open_request?: boolean;
  open_request_id?: string | null;
  open_request_status?: string | null;
};

export type ComplianceWorkerRow = {
  member_id: string;
  user_id: string | null;
  employee_name: string;
  email: string | null;
  department_id: string | null;
  department_name: string | null;
  member_status: string | null;
  latest_request_id: string | null;
  latest_request_status: string | null;
  latest_request_type: string | null;
  latest_shift_template_id: string | null;
  latest_shift_template_label: string | null;
  requested_count: number;
  completed_count: number;
  scanned_today: number;
  missing_today: boolean;
  overdue_requests: number;
  last_scan_at: string | null;
  last_readiness_score: number | null;
  last_risk_level: string | null;
  consent_logged: boolean;
  compliance_status: string;
};

export type ComplianceBreakdownRow = {
  id: string;
  label: string;
  requested: number;
  completed: number;
  missing: number;
  overdue: number;
  scanned_today: number;
};

export type ComplianceSummary = {
  active_members: number;
  scanned_today: number;
  missing_today: number;
  requested_total: number;
  completed_total: number;
  overdue_requests: number;
  consent_coverage: number;
};

export type CompliancePageData = {
  summary: ComplianceSummary;
  departments: WorkflowDepartmentOption[];
  shiftTemplates: WorkflowShiftTemplateOption[];
  workers: ComplianceWorkerRow[];
  departmentBreakdown: ComplianceBreakdownRow[];
  shiftBreakdown: ComplianceBreakdownRow[];
  latestExportStatus: string | null;
};

export type CreateShiftTemplateInput = {
  name: string;
  start_time?: string | null;
  scan_window_start_minutes?: number | null;
  scan_window_end_minutes?: number | null;
  is_active?: boolean | null;
};

export type CreateScanRequestInput = {
  target_member_id: string;
  request_type?: string | null;
  due_at?: string | null;
};

export type RequestActionResult = {
  ok: boolean;
  message: string;
  configured?: boolean;
};

export type CreateScanRequestResponse = {
  request: RequestRow;
};

export type ScanRequestQueueSummary = {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
};

export type ScanRequestQueueResponse = {
  rows: ScanRequestRecord[];
  summary: ScanRequestQueueSummary;
};

export type ScanRequestApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server_error'
  | 'network_error'
  | 'invalid_response'
  | 'unknown';

export class ScanRequestApiError extends Error {
  constructor(
    public readonly code: ScanRequestApiErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
    public readonly details?: unknown
  ) {
    super(userMessage);
    this.name = 'ScanRequestApiError';
  }
}

export type AlertWorkflowApiErrorCode = ScanRequestApiErrorCode;

export class AlertWorkflowApiError extends Error {
  constructor(
    public readonly code: AlertWorkflowApiErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
    public readonly details?: unknown
  ) {
    super(userMessage);
    this.name = 'AlertWorkflowApiError';
  }
}

export type RequestRow = {
  id: string;
  status: string | null;
  request_type: string | null;
  requested_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled_note: string | null;
  target_member_id: string | null;
  target_member_name: string;
  target_member_email: string | null;
  requested_by_user_id: string | null;
  requested_by_user_name: string;
  business_profile_id: string | null;
  business_profile_name: string | null;
  department_id: string | null;
  department_name: string | null;
  completed_scan_id: string | null;
  completed_scan_at: string | null;
  notification_count: number;
};

export type RequestsPageData = {
  rows: RequestRow[];
  departments: WorkflowDepartmentOption[];
  members: WorkflowMemberOption[];
  requestTypeOptions: string[];
  statusOptions: string[];
  summary: {
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  };
};

export type RequestModalOptions = {
  members: WorkflowMemberOption[];
  departments: WorkflowDepartmentOption[];
};

export type AlertRow = {
  id: string;
  date_created: string | null;
  business_profile_id: string | null;
  business_profile_name: string | null;
  status: string | null;
  severity: string | null;
  title: string;
  message: string | null;
  department_id: string | null;
  department_name: string | null;
  target_member_id: string | null;
  target_member_status: string | null;
  target_member_role: string | null;
  target_member_label: string;
  target_user_id: string | null;
  target_user_name: string | null;
  target_user_email: string | null;
  scan_id: string | null;
  scan_date_created: string | null;
  scan_status: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  action_note: string | null;
  action_type: string | null;
  explanation: string | null;
  recommended_action: string | null;
  readiness_label: string | null;
  notification_count: number;
};

export type AlertDetailsRow = AlertRow & {
  target_member_department_id: string | null;
  target_member_department_name: string | null;
  reviewed_status_label: string;
  relationWarnings: string[];
  permissionWarnings: string[];
};

export type AlertsPageData = {
  rows: AlertRow[];
  departments: WorkflowDepartmentOption[];
  severityOptions: string[];
  statusOptions: string[];
  summary: {
    total: number;
    new: number;
    reviewed: number;
    escalated: number;
  };
};

export type AlertWorkflowAction = 'start_review' | 'mark_reviewed' | 'resolve';

export type AlertWorkflowRecord = {
  id: string;
  status: string | null;
  reviewed_by: string | number | Record<string, unknown> | null;
  reviewed_at: string | null;
  action_note: string | null;
  action_type: string | null;
  date_created?: string | null;
  date_updated?: string | null;
};

export type AlertWorkflowResponse = {
  alert: AlertWorkflowRecord;
};

type UserRecord = {
  id?: string | number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type DepartmentRecord = {
  id?: string | number;
  name?: string | null;
};

type ShiftTemplateRecord = {
  id?: string | number;
  name?: string | null;
  title?: string | null;
  label?: string | null;
  start_time?: string | null;
  scan_window_start_minutes?: number | null;
  scan_window_end_minutes?: number | null;
  is_active?: boolean | null;
};

type MemberRecord = {
  id?: string | number;
  status?: string | null;
  member_role?: string | null;
  department?: DepartmentRecord | string | number | null;
  user?: UserRecord | null;
};

type ScanRequestRecord = {
  id?: string | number;
  business_profile?:
    | {
        id?: string | number;
        company_name?: string | null;
        name?: string | null;
        legal_name?: string | null;
      }
    | string
    | number
    | null;
  department?: DepartmentRecord | string | number | null;
  requested_by_user?: UserRecord | string | number | null;
  target_member?: MemberRecord | UserRecord | string | number | null;
  request_type?: string | null;
  status?: string | null;
  cancelled?: string | null;
  requested_at?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  completed_scan?: {
    id?: string | number;
    status?: string | null;
    completed_at?: string | null;
  } | string | number | null;
  scan_id?: {
    id?: string | number;
    status?: string | null;
    completed_at?: string | null;
  } | string | number | null;
  required_state?: string | null;
  response_status?: string | null;
  response_payload?: unknown;
  timestamp?: string | null;
  requested_for_user?: UserRecord | string | number | null;
  requested_for_email?: string | null;
  requested_for_phone?: string | null;
  Target?: string | null;
};

type WellnessScanRecord = {
  id?: string | number;
  date_created?: string | null;
  scan_request?: {
    id?: string | number;
    target_member?: UserRecord | string | number | null;
    department?: DepartmentRecord | string | number | null;
    shift_template?: ShiftTemplateRecord | string | number | null;
    requested_for_user?: UserRecord | string | number | null;
  } | null;
};

type ScanResultRecord = {
  id?: string | number;
  date_created?: string | null;
  risk_level?: string | null;
  task_performance_score?: string | number | null;
  scan_request?: {
    id?: string | number;
    target_member?: UserRecord | string | number | null;
    department?: DepartmentRecord | string | number | null;
    shift_template?: ShiftTemplateRecord | string | number | null;
    requested_for_user?: UserRecord | string | number | null;
  } | null;
};

type ConsentLogRecord = {
  id?: string | number;
  date_created?: string | null;
  user?: UserRecord | string | number | null;
};

type ReportsExportRecord = {
  id?: string | number;
  status?: string | null;
  format?: string | null;
  completed_at?: string | null;
  date_created?: string | null;
};

type NotificationRecord = {
  id?: string | number;
  link_type?: string | null;
  link_id?: string | number | null;
};

type AlertRecord = {
  id?: string | number;
  date_created?: string | null;
  business_profile?: { id?: string | number; company_name?: string | null } | string | number | null;
  department?: DepartmentRecord | string | number | null;
  target_member?: {
    id?: string | number;
    status?: string | null;
    member_role?: string | null;
    user?: UserRecord | string | number | null;
  } | string | number | null;
  target_user?: UserRecord | string | number | null;
  scan?: {
    id?: string | number;
    date_created?: string | null;
    status?: string | null;
  } | string | number | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  summary?: string | null;
  status?: string | null;
  alert_type?: string | null;
  reviewed_by?: UserRecord | string | number | null;
  reviewed_at?: string | null;
  action_note?: string | null;
  action_type?: string | null;
  recommended_action?: string | null;
  explanation?: string | null;
  readiness_label?: string | null;
  risk_label?: string | null;
  scan_id?: { id?: string | number; date_created?: string | null; status?: string | null } | string | number | null;
  scan_request?: { id?: string | number } | string | number | null;
};

type AlertScanResultRecord = {
  id?: string | number;
  scan_id?: string | number | { id?: string | number } | null;
  risk_level?: string | null;
  overall_state?: string | null;
  explanation?: string | null;
  suggested_action?: string | null;
  readiness_score?: string | number | null;
  date_created?: string | null;
};

type ScopedContext = {
  token: string;
  company: CompanyContext;
  businessProfileId: string;
  activeRole: ActiveMemberRole;
  activeDepartmentId: string | null;
  activeMembershipId: string;
  activeMembershipStatus: string;
  userId: string | null;
};

@Injectable({ providedIn: 'root' })
export class OperationsWorkflowsService {
  private readonly api = environment.API_URL;
  private readonly closedAlertStatuses = new Set(['resolved', 'overridden']);
  private readonly closedRequestStatuses = new Set(['completed', 'expired', 'cancelled']);

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companyContext: CompanyContextService,
    private workforceRosterApi: WorkforceRosterApiService
  ) {}

  getCompliancePageData(): Observable<CompliancePageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        this.assertManagerDepartmentScope(context);
        return forkJoin({
          departments: this.loadDepartmentsForRequests(context),
          members: this.loadMembersForRequests(context),
          shiftTemplates: this.queryItems<ShiftTemplateRecord>(
            'shift_templates',
            ['id', 'name', 'title', 'start_time', 'scan_window_start_minutes', 'scan_window_end_minutes', 'is_active'],
            context.token,
            { filters: this.scopeFilters(context, ['business_profile']), sort: 'name', limit: 200 }
          ),
          queue: this.fetchScanRequestQueue(context),
          scans: this.queryItems<WellnessScanRecord>(
            'wellness_scans',
            ['id', 'date_created'],
            context.token,
            { sort: '-date_created', limit: 800 }
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
            { sort: '-date_created', limit: 800 }
          ),
          consents: this.queryItems<ConsentLogRecord>(
            'consent_logs',
            ['id', 'date_created', 'user.id', 'user.email'],
            context.token,
            { sort: '-date_created', limit: 800 }
          ),
          exports: this.queryItems<ReportsExportRecord>(
            'reports_exports',
            ['id', 'status', 'format', 'completed_at', 'date_created'],
            context.token,
            { filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }], sort: '-date_created', limit: 20 }
          )
        }).pipe(
          map(({ departments, members, shiftTemplates, queue, scans, results, consents, exports }) =>
            this.buildCompliancePageData(departments, members, shiftTemplates, queue.rows, scans, results, consents, exports)
          )
        );
      })
    );
  }

  getRequestsPageData(): Observable<RequestsPageData> {
    return this.ensureScopedContext(true).pipe(
      tap(() => {

      }),
      switchMap((context) =>
        forkJoin({
          roster: this.workforceRosterApi.getWorkforceRoster().pipe(
            map((payload) => payload),
            catchError((error) => {
              if (context.activeRole === 'manager') {
                return throwError(() => error);
              }
              console.warn('[ScanRequests] workforce roster failed, using fallback scan-target list', error);
              return of(null);
            })
          ),
          queue: this.fetchScanRequestQueue(context).pipe(
            tap((requests) => {

            })
          ),
          departments: this.loadDepartmentsForRequests(context).pipe(
            timeout(12000),
            catchError((error) => {
              if (context.activeRole === 'manager') {
                return throwError(() => error);
              }
              console.warn('[ScanRequests] optional departments failed, using []', error);
              return of([] as DepartmentRecord[]);
            })
          ),
          scans: this.queryItems<WellnessScanRecord>(
            'wellness_scans',
            ['id', 'date_created'],
            context.token,
            { sort: '-date_created', limit: 800 }
          ).pipe(
            timeout(12000),
            catchError((error) => {
              console.warn('[ScanRequests] optional scans failed, using []', error);
              return of([] as WellnessScanRecord[]);
            })
          ),
          notifications: this.queryItems<NotificationRecord>(
            'notifications',
            ['id', 'link_type', 'link_id'],
            context.token,
            { filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }], sort: '-id', limit: 400 }
          ).pipe(
            timeout(12000),
            catchError((error) => {
              console.warn('[ScanRequests] optional notifications failed, using []', error);
              return of([] as NotificationRecord[]);
            })
          )
        }).pipe(
          map(({ roster, queue, departments, scans, notifications }) => {
            const pageData = this.buildRequestsPageData(
              departments,
              roster ? this.mapEligibleTargets(roster) : [],
              queue.rows,
              scans,
              notifications
            );

            if (context.activeRole !== 'employee' || !context.userId) {
              return pageData;
            }

            const userId = context.userId;
            const employeeRows = pageData.rows.filter(
              (row) => row.target_member_id === context.activeMembershipId || row.target_member_id === userId || row.requested_by_user_id === userId
            );

            const filteredDepartments = pageData.departments.filter((department) =>
              employeeRows.some((row) => row.department_id === department.id)
            );

            return {
              ...pageData,
              rows: employeeRows,
              departments: filteredDepartments,
              members: [],
              summary: {
                total: employeeRows.length,
                pending: employeeRows.filter((row) => this.isPendingRequestStatus(row.status)).length,
                completed: employeeRows.filter((row) => this.normalizeText(row.status) === 'completed').length,
                overdue: employeeRows.filter((row) => this.isOverdueRequestStatus(row.status, row.due_at)).length
              }
            } satisfies RequestsPageData;
          })
        )
      )
    );
  }

  async loadScanRequestsSafe(businessProfileId: string): Promise<RequestsPageData & { warning?: string }> {
    const context = await firstValueFrom(this.ensureScopedContext(true).pipe(take(1), timeout(8000)));
    if (!context.businessProfileId || context.businessProfileId !== businessProfileId) {
      const empty = this.buildRequestsPageData([], [], [], [], []);
      return { ...empty, warning: 'no_active_business_profile' };
    }

    let requests: ScanRequestRecord[] = [];
    let warning: string | undefined;
    try {
      const queue = await firstValueFrom(this.fetchScanRequestQueue(context).pipe(take(1), timeout(8000)));
      requests = queue.rows ?? [];

    } catch (error) {
      console.error('[OperationsWorkflows] requests failed', error);
      requests = [];
      warning = 'requests_load_failed';
    }

    const [rosterResult, departmentsResult, scansResult, notificationsResult] = await Promise.allSettled([
      firstValueFrom(this.workforceRosterApi.getWorkforceRoster().pipe(take(1), timeout(4000))),
      firstValueFrom(this.loadDepartmentsForRequests(context).pipe(take(1), timeout(4000))),
      firstValueFrom(
        this.queryItems<WellnessScanRecord>('wellness_scans', ['id', 'date_created'], context.token, { sort: '-date_created', limit: 800 })
          .pipe(take(1), timeout(4000))
      ),
      firstValueFrom(
        this.queryItems<NotificationRecord>(
          'notifications',
          ['id', 'link_type', 'link_id'],
          context.token,
          { filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }], sort: '-id', limit: 400 }
        ).pipe(take(1), timeout(4000))
      )
    ]);

    const roster = rosterResult.status === 'fulfilled'
      ? rosterResult.value
      : (console.warn('[ScanRequests] workforce roster failed, using []', rosterResult.reason), null);
    const departments = departmentsResult.status === 'fulfilled'
      ? (departmentsResult.value ?? [])
      : (console.warn('[ScanRequests] optional departments failed, using []', departmentsResult.reason), [] as DepartmentRecord[]);
    const scans = scansResult.status === 'fulfilled'
      ? (scansResult.value ?? [])
      : (console.warn('[ScanRequests] optional scans failed, using []', scansResult.reason), [] as WellnessScanRecord[]);
    const notifications = notificationsResult.status === 'fulfilled'
      ? (notificationsResult.value ?? [])
      : (console.warn('[ScanRequests] optional notifications failed, using []', notificationsResult.reason), [] as NotificationRecord[]);

    const pageData = this.buildRequestsPageData(
      departments,
      roster ? this.mapEligibleTargets(roster) : [],
      requests,
      scans,
      notifications
    );
    if (context.activeRole !== 'employee' || !context.userId) {
      return warning ? { ...pageData, warning } : pageData;
    }

    const userId = context.userId;
    const employeeRows = pageData.rows.filter(
      (row) => row.target_member_id === context.activeMembershipId || row.target_member_id === userId || row.requested_by_user_id === userId
    );
    const filteredDepartments = pageData.departments.filter((department) =>
      employeeRows.some((row) => row.department_id === department.id)
    );

    const employeeData: RequestsPageData = {
      ...pageData,
      rows: employeeRows,
      departments: filteredDepartments,
      members: [],
      summary: {
        total: employeeRows.length,
        pending: employeeRows.filter((row) => this.isPendingRequestStatus(row.status)).length,
        completed: employeeRows.filter((row) => this.normalizeText(row.status) === 'completed').length,
        overdue: employeeRows.filter((row) => this.isOverdueRequestStatus(row.status, row.due_at)).length
      }
    };

    return warning ? { ...employeeData, warning } : employeeData;
  }

  getRequestModalOptions(): Observable<RequestModalOptions> {
    return this.ensureScopedContext(true).pipe(
      switchMap((context) =>
        this.workforceRosterApi.getWorkforceRoster().pipe(
          map((payload) => {
            const openRequestByIdentity = new Map<string, { requestId: string | null; status: string | null; timestamp: number }>();
            for (const request of payload.scan_requests?.rows ?? []) {
              const status = this.requestStatus(request);
              if (this.closedRequestStatuses.has(this.normalizeText(status))) {
                continue;
              }
              const requestId = this.normalizeId(request.id);
              if (!requestId) {
                continue;
              }
              for (const identity of this.requestIdentityKeys(request)) {
                const existing = openRequestByIdentity.get(identity);
                if (!existing || this.requestTimestamp(request) >= existing.timestamp) {
                  openRequestByIdentity.set(identity, {
                    requestId,
                    status,
                    timestamp: this.requestTimestamp(request)
                  });
                }
              }
            }

            return {
              departments: (payload.departments ?? [])
                .map((department) => ({
                  id: department.id,
                  name: department.name
                }))
                .filter((item) => Boolean(item.id && item.name)),
              members: (payload.eligible_scan_targets ?? [])
                .map((target) => {
                  const identities = this.memberIdentityKeys(target.member_id, target.user_id, target.email);
                  let openRequestId: string | null = null;
                  let openRequestStatus: string | null = null;
                  for (const identity of identities) {
                    const match = openRequestByIdentity.get(identity);
                    if (!match) {
                      continue;
                    }
                    openRequestId = match.requestId;
                    openRequestStatus = match.status;
                    break;
                  }

                  return {
                    member_id: target.member_id,
                    user_id: target.user_id,
                    label: target.label,
                    email: target.email,
                    member_role: this.normalizeMemberRole(target.member_role),
                    department_id: target.department_id,
                    department_name: target.department_name,
                    status: target.status,
                    has_open_request: Boolean(openRequestId),
                    open_request_id: openRequestId,
                    open_request_status: openRequestStatus
                  };
                })
                .filter((item) => Boolean(item.member_id && item.label && item.email))
            } satisfies RequestModalOptions;
          })
        )
      )
    );
  }

  getAlertsPageData(forceRefresh = false): Observable<AlertsPageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.loadAlertsForPage(context, forceRefresh).pipe(
          switchMap((alerts) =>
            forkJoin({
              departments: this.loadDepartmentsForRequests(context).pipe(
                timeout(12000),
                catchError((error) => {
                  console.warn('[OperationsWorkflows] alerts departments fallback []', error);
                  return of([] as DepartmentRecord[]);
                })
              ),
              notifications: this.queryItems<NotificationRecord>(
                'notifications',
                ['id', 'link_type', 'link_id'],
                context.token,
                { filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }], sort: '-id', limit: 400 }
              ).pipe(
                timeout(12000),
                catchError((error) => {
                  console.warn('[OperationsWorkflows] alerts notifications fallback []', error);
                  return of([] as NotificationRecord[]);
                })
              )
            }).pipe(
              map(({ departments, notifications }) => this.buildAlertsPageData(departments, alerts, notifications))
            )
          )
        )
      )
    );
  }

  fetchAlertDetails(alertId: string): Observable<AlertDetailsRow> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const normalizedAlertId = this.normalizeId(alertId);
        if (!normalizedAlertId) {
          return throwError(() => new Error('Alert id is missing.'));
        }

        console.info('[ALERT_DETAIL_FETCH_START]', { alertId: normalizedAlertId });

        return this.fetchAlertRecordWithFallback(context, normalizedAlertId).pipe(
          switchMap((alert) => {
            const warnings: string[] = [];
            const permissionWarnings: string[] = [];
            const relatedScanId = this.normalizeId(alert.scan ?? alert.scan_id);

            if (!relatedScanId && (alert.scan || alert.scan_id)) {
              warnings.push('Alert has a scan relation, but the linked scan id could not be resolved.');
              console.warn('[ALERT_DETAIL_RELATION_MISSING]', {
                alertId: normalizedAlertId,
                relation: 'scan'
              });
            }

            return this.fetchAlertScanResult(context, relatedScanId, normalizedAlertId).pipe(
              map((scanResult) => {
                if (relatedScanId && !scanResult) {
                  const message = 'Alert exists, but related scan result is missing or inaccessible.';
                  warnings.push(message);
                  console.warn('[ALERT_DETAIL_RELATION_MISSING]', {
                    alertId: normalizedAlertId,
                    relation: 'scan_result',
                    scanId: relatedScanId
                  });
                }

                if (relatedScanId && scanResult === null) {
                  permissionWarnings.push('Alert exists, but related scan result is missing or inaccessible.');
                }

                const detail = this.mapAlertDetailsRow(alert, scanResult, warnings, permissionWarnings);
                console.info('[ALERT_DETAIL_FETCH_SUCCESS]', {
                  alertId: normalizedAlertId,
                  scanId: detail.scan_id,
                  targetMemberId: detail.target_member_id
                });
                return detail;
              })
            );
          }),
          catchError((error) => {
            const status = (error as { status?: number } | null)?.status ?? 0;
            if (status === 403) {
              console.warn('[ALERT_DETAIL_PERMISSION_BLOCKED]', {
                alertId: normalizedAlertId,
                status
              });
            }
            return throwError(() => error);
          })
        );
      })
    );
  }

  createShiftTemplate(input: CreateShiftTemplateInput): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.post(
          `${this.api}/items/shift_templates`,
          {
            business_profile: context.businessProfileId,
            name: input.name.trim(),
            start_time: input.start_time ?? null,
            scan_window_start_minutes: input.scan_window_start_minutes ?? null,
            scan_window_end_minutes: input.scan_window_end_minutes ?? null,
            is_active: input.is_active ?? true
          },
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(map(() => void 0))
      )
    );
  }

  createScanRequest(input: CreateScanRequestInput): Observable<CreateScanRequestResponse> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        this.assertManagerDepartmentScope(context);

        const targetMemberId = this.normalizeId(input.target_member_id);
        if (!targetMemberId) {
          return throwError(() =>
            new ScanRequestApiError('invalid_response', 0, 'Select an active workforce member.')
          );
        }

        const requestType = this.pickString(input.request_type)?.toLowerCase() ?? 'manual';
        const body: Record<string, unknown> = {
          target_member_id: targetMemberId,
          request_type: requestType
        };

        const dueAt = this.pickString(input.due_at);
        if (dueAt) {
          if (!this.isIsoDateTime(dueAt)) {
            return throwError(() =>
              new ScanRequestApiError('invalid_response', 0, 'Due date must be a valid ISO date.')
            );
          }
          body['due_at'] = dueAt;
        }

        return this.http.post<unknown>(
          `${this.api}/wellar/scan-requests`,
          body,
          {
            headers: this.headers(context.token),
            withCredentials: true
          }
        ).pipe(
          timeout(15000),
          map((response) => this.parseCreateScanRequestResponse(response)),
          catchError((error) => this.handleCreateScanRequestError(error))
        );
      })
    );
  }

  createDepartmentScanRequests(input: CreateScanRequestInput): Observable<number> {
    void input;
    return throwError(() => new Error(this.scanRequestFlowPrerequisiteMessage()));
  }

  createUnassignedScanRequests(input: CreateScanRequestInput): Observable<number> {
    void input;
    return throwError(() => new Error(this.scanRequestFlowPrerequisiteMessage()));
  }

  createWorkspaceScanRequests(input: CreateScanRequestInput): Observable<number> {
    void input;
    return throwError(() => new Error(this.scanRequestFlowPrerequisiteMessage()));
  }

  cancelScanRequest(requestId: string): Observable<RequestActionResult> {
    void requestId;
    return of({
      ok: false,
      configured: false,
      message: this.scanRequestFlowPrerequisiteMessage()
    } satisfies RequestActionResult);
  }

  remindScanRequest(requestId: string, currentCount: number): Observable<RequestActionResult> {
    void requestId;
    void currentCount;
    return of({
      ok: false,
      configured: false,
      message: this.scanRequestFlowPrerequisiteMessage()
    } satisfies RequestActionResult);
  }

  duplicateRequest(row: RequestRow): Observable<void> {
    return this.createScanRequest({
      target_member_id: row.target_member_id ?? '',
      request_type: row.request_type,
      due_at: row.due_at
    }).pipe(map(() => void 0));
  }

  requestAllMissing(rows: ComplianceWorkerRow[], departmentId: string | null, shiftTemplateId: string | null): Observable<void> {
    void rows;
    void departmentId;
    void shiftTemplateId;
    return throwError(() => new Error(this.scanRequestFlowPrerequisiteMessage()));
  }

  queueComplianceExport(filters: {
    department?: string | null;
    shift_template?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  }): Observable<void> {
    void filters;
    return throwError(() => new Error(this.scanRequestFlowPrerequisiteMessage()));
  }

  private scanRequestFlowPrerequisiteMessage(): string {
    return 'This action requires an approved server-side workflow.';
  }

  private parseCreateScanRequestResponse(response: unknown): CreateScanRequestResponse {
    const root = this.objectRecord(response);
    const data = this.objectRecord(root?.['data']);
    if (!data) {
      throw new ScanRequestApiError('invalid_response', 0, 'Scan request response was invalid.');
    }

    const request = this.parseScanRequestRow(data['request'] ?? data);
    if (!request) {
      throw new ScanRequestApiError('invalid_response', 0, 'Scan request response was incomplete.');
    }

    return { request };
  }

  private parseScanRequestRow(value: unknown): RequestRow | null {
    const record = this.objectRecord(value);
    if (!record) {
      return null;
    }

    const id = this.pickString(record['id']);
    if (!id) {
      return null;
    }

    const targetMember = this.objectRecord(record['target_member']);
    const targetUser = this.objectRecord(targetMember?.['user']);
    const requestedBy = this.objectRecord(record['requested_by_user']);
    const department = this.objectRecord(record['department']) ?? this.objectRecord(targetMember?.['department']);
    const businessProfile = this.objectRecord(record['business_profile']);

    return {
      id,
      status: this.pickString(record['status']) ?? 'pending',
      request_type: this.pickString(record['request_type']) ?? null,
      requested_at: this.pickString(record['requested_at']) ?? null,
      due_at: this.pickString(record['due_at']) ?? null,
      completed_at: this.pickString(record['completed_at']) ?? null,
      cancelled_note: this.pickString(record['cancelled']) ?? null,
      target_member_id: this.normalizeId(targetMember?.['id'] ?? record['target_member']),
      target_member_name: this.firstReadableLabel([
        this.pickString(targetMember?.['name']),
        this.pickString(targetUser?.['first_name']),
        this.pickString(targetUser?.['last_name']),
        this.pickString(targetUser?.['email'])
      ], 'Unknown member'),
      target_member_email: this.pickString(targetUser?.['email']),
      requested_by_user_id: this.normalizeId(requestedBy?.['id'] ?? record['requested_by_user']),
      requested_by_user_name: this.firstReadableLabel([
        this.pickString(requestedBy?.['first_name']),
        this.pickString(requestedBy?.['last_name']),
        this.pickString(requestedBy?.['email'])
      ], 'System'),
      business_profile_id: this.normalizeId(businessProfile?.['id'] ?? record['business_profile']),
      business_profile_name: this.firstReadableLabel([
        this.pickString(businessProfile?.['company_name']),
        this.pickString(record['business_profile_name'])
      ], 'Unknown workspace'),
      department_id: this.normalizeId(department?.['id'] ?? record['department']),
      department_name: this.firstReadableLabel([
        this.pickString(department?.['name']),
        this.pickString(record['department_name'])
      ], 'Unassigned'),
      completed_scan_id: this.normalizeId(record['completed_scan']),
      completed_scan_at: this.pickString(record['completed_scan_at']) ?? null,
      notification_count: 0
    };
  }

  private handleCreateScanRequestError(error: unknown): Observable<never> {
    if (error instanceof ScanRequestApiError) {
      return throwError(() => error);
    }

    const httpError = error as HttpErrorResponse;
    const status = Number(httpError?.status ?? 0);
    const body = this.objectRecord(httpError?.error);
    const directusError = this.objectRecord(body?.['error']);
    const backendCode = this.pickString(directusError?.['code'])?.toUpperCase() ?? '';
    const backendMessage = this.pickString(directusError?.['message']);

    if (status === 0) {
      return throwError(() => new ScanRequestApiError('network_error', status, 'Scan request creation could not reach the server.', error));
    }
    if (status === 401 || backendCode === 'UNAUTHORIZED') {
      return throwError(() => new ScanRequestApiError('unauthorized', 401, 'Session expired. Please sign in again.', error));
    }
    if (status === 403 || backendCode === 'FORBIDDEN') {
      return throwError(() => new ScanRequestApiError('forbidden', 403, backendMessage ?? 'You do not have permission to create scan requests.', error));
    }
    if (status === 404 || backendCode === 'NOT_FOUND') {
      return throwError(() => new ScanRequestApiError('not_found', 404, backendMessage ?? 'The selected workforce member was not found.', error));
    }
    if (status === 409 || backendCode === 'CONFLICT') {
      return throwError(() => new ScanRequestApiError('conflict', 409, backendMessage ?? 'A conflicting scan request already exists.', error));
    }
    if (status >= 500 || backendCode === 'SERVER_ERROR') {
      return throwError(() => new ScanRequestApiError('server_error', status || 500, backendMessage ?? 'Scan request creation failed.', error));
    }

    return throwError(() => new ScanRequestApiError('unknown', status, backendMessage ?? 'Scan request creation failed.', error));
  }

  alertReviewFlowPrerequisiteMessage(): string {
    return 'This action requires an approved server-side workflow.';
  }

  updateAlert(alertId: string, action: AlertWorkflowAction): Observable<AlertWorkflowRecord> {
    return this.performAlertWorkflowAction(alertId, action);
  }

  startAlertReview(alertId: string): Observable<AlertWorkflowRecord> {
    return this.performAlertWorkflowAction(alertId, 'start_review');
  }

  markAlertReviewed(alertId: string): Observable<AlertWorkflowRecord> {
    return this.performAlertWorkflowAction(alertId, 'mark_reviewed');
  }

  resolveAlert(alertId: string): Observable<AlertWorkflowRecord> {
    return this.performAlertWorkflowAction(alertId, 'resolve');
  }

  private loadDepartmentsForRequests(context: ScopedContext): Observable<DepartmentRecord[]> {
    this.assertManagerDepartmentScope(context);
    const richFields = context.activeRole === 'manager' ? ['id', 'name', 'is_active'] : ['id', 'name'];
    const fallbackFields = richFields;
    const options = {
      filters: context.activeRole === 'manager'
        ? [
            { path: ['business_profile'], operator: '_eq', value: context.businessProfileId },
            { path: ['id'], operator: '_eq', value: context.activeDepartmentId as string }
          ]
        : [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
      sort: 'name',
      limit: 120
    };

    return this.queryItemsStrict<DepartmentRecord>('departments', richFields, context.token, options).pipe(
      catchError((error) => {
        if (this.isFieldCompatibilityError(error)) {
          return this.queryItemsStrict<DepartmentRecord>('departments', fallbackFields, context.token, options);
        }
        console.error('[OperationsWorkflows] departments query failed', error);
        return throwError(() => error);
      })
    );
  }

  private loadMembersForRequests(context: ScopedContext): Observable<MemberRecord[]> {
    void context;
    return this.workforceRosterApi.getWorkforceRoster().pipe(
      map((payload) =>
        (payload.rows ?? [])
          .map((row) => {
            const id = row.member_id ?? null;
            if (!id) {
              return null;
            }
            return {
              id,
              status: row.status,
              member_role: row.member_role,
              department: row.department_id ? { id: row.department_id, name: row.department_name } : null,
              user: row.user_id
                ? {
                    id: row.user_id,
                    email: row.email,
                    first_name: row.display_name,
                    last_name: null
                  }
                : null
            };
          })
          .filter(Boolean) as MemberRecord[]
      )
    );
  }

  loadScanRequestQueue(): Observable<ScanRequestQueueResponse> {
    return this.ensureScopedContext(true).pipe(
      switchMap((context) => this.fetchScanRequestQueue(context))
    );
  }

  private fetchScanRequestQueue(context: ScopedContext): Observable<ScanRequestQueueResponse> {
    this.assertManagerDepartmentScope(context);

    const url = `${this.api}/wellar/scan-requests`;
    return this.http.get<{ data?: ScanRequestQueueResponse }>(
      url,
      { headers: this.headers(context.token), withCredentials: true }
    ).pipe(
      timeout(25000),
      map((response) => {
        const queue = response.data ?? { rows: [], summary: { total: 0, pending: 0, completed: 0, overdue: 0 } };
        return {
          rows: (queue.rows ?? []).map((row) => this.normalizeRequestRecord(row)),
          summary: {
            total: this.toNumber(queue.summary?.total) ?? 0,
            pending: this.toNumber(queue.summary?.pending) ?? 0,
            completed: this.toNumber(queue.summary?.completed) ?? 0,
            overdue: this.toNumber(queue.summary?.overdue) ?? 0
          }
        } satisfies ScanRequestQueueResponse;
      }),
      catchError((error) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status === 403 || status === 400) {
          console.error('[OperationsWorkflows] requests queue failed', {
            url,
            status,
            message:
              (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.extensions?.reason ??
              (error as { error?: { errors?: Array<{ message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.message ??
              (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
              (error as { message?: string } | null)?.message ??
              'unknown'
          });
        }
        return throwError(() => error);
      })
    );
  }

  private normalizeRequestRecord(raw: ScanRequestRecord): ScanRequestRecord {
    const responsePayload = raw.response_payload && typeof raw.response_payload === 'object'
      ? raw.response_payload as Record<string, unknown>
      : null;
    const requestedAt = raw.requested_at ?? raw.timestamp ?? null;
    const responseStatus = this.normalizeText(raw.response_status ?? raw.status ?? null);
    const requestType = this.pickString(raw.required_state ?? raw.request_type ?? null);
    const scanId = this.normalizeId(raw.scan_id ?? raw.completed_scan);
    return {
      ...raw,
      requested_by_user: raw.requested_by_user ?? null,
      target_member: raw.target_member ?? raw.requested_for_user ?? null,
      request_type: requestType,
      status: this.pickString(raw.status ?? raw.response_status) ?? 'pending',
      cancelled: raw.cancelled ?? (responseStatus === 'cancelled' ? 'Cancelled' : null),
      requested_at: requestedAt,
      due_at: raw.due_at ?? this.pickString(responsePayload?.['due_at']) ?? null,
      completed_at: raw.completed_at ?? this.pickString(responsePayload?.['completed_at']) ?? null,
      completed_scan: raw.completed_scan ?? scanId,
      scan_id: raw.scan_id ?? scanId,
      required_state: raw.required_state ?? requestType,
      response_status: raw.response_status ?? raw.status ?? null,
      response_payload: raw.response_payload ?? responsePayload,
      timestamp: requestedAt,
      requested_for_user: raw.requested_for_user ?? raw.target_member ?? null,
      requested_for_email: raw.requested_for_email ?? this.pickString(responsePayload?.['requested_for_email']) ?? null,
      requested_for_phone: raw.requested_for_phone ?? this.pickString(responsePayload?.['requested_for_phone']) ?? null,
      Target: raw.Target ?? this.pickString(responsePayload?.['Target']) ?? null
    };
  }

  private loadAlertsForPage(context: ScopedContext, forceRefresh = false): Observable<AlertRecord[]> {
    this.assertManagerDepartmentScope(context);
    const baseFilterVariants: Array<Array<{ path: string[]; operator: string; value: string }>> = [
      [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }]
    ];
    const filterVariants = context.activeRole === 'manager' && context.activeDepartmentId
      ? baseFilterVariants.flatMap((base) => ([
          [...base, { path: ['department'], operator: '_eq', value: context.activeDepartmentId as string }]
        ]))
      : baseFilterVariants;

    const sortVariants = ['-date_created', '-id'];
    const baseFields = [
      'id',
      'date_created',
      'department',
      'department.id',
      'department.name',
      'severity',
      'title',
      'message',
      'status',
      'reviewed_at'
    ];
    const expandedFields = [
      ...baseFields,
      'business_profile.id',
      'business_profile.company_name',
      'department.id',
      'department.name',
      'target_member.id',
      'target_member.status',
      'target_member.member_role',
      'target_member.department',
      'target_member.department.id',
      'target_member.department.name',
      'target_member.user.id',
      'target_member.user.first_name',
      'target_member.user.last_name',
      'target_member.user.email',
      'target_user.id',
      'target_user.first_name',
      'target_user.last_name',
      'target_user.email',
      'scan.id',
      'scan.date_created',
      'scan.status',
      'reviewed_by.id',
      'reviewed_by.first_name',
      'reviewed_by.last_name',
      'reviewed_by.email'
    ];
    const fieldVariants: string[][] = context.activeRole === 'manager'
      ? [baseFields]
      : [[
          'id',
          'date_created',
          'business_profile',
          'department',
          'department.id',
          'department.name',
          'target_member',
          'target_user',
          'scan',
          'severity',
          'title',
          'message',
          'status',
          'reviewed_by',
          'reviewed_at',
          'action_note',
          'action_type'
        ]];
    let failureLogged = false;

    const buildQueryUrl = (
      fields: string[],
      sort: string,
      filters: Array<{ path: string[]; operator: string; value: string }>
    ): string => {
      const params = new URLSearchParams({
        fields: fields.join(','),
        sort,
        limit: '800'
      });
      if (forceRefresh) {
        params.set('_ts', String(Date.now()));
      }
      for (const filter of filters) {
        this.setFilter(params, filter.path, filter.operator, filter.value);
      }
      return `${this.api}/items/alerts?${params.toString()}`;
    };

    const run = (
      fields: string[],
      sort: string,
      filters: Array<{ path: string[]; operator: string; value: string }>
    ): Observable<AlertRecord[]> => {
      const url = buildQueryUrl(fields, sort, filters);
      return this.http.get<{ data?: AlertRecord[] }>(
        url,
        { headers: this.headers(context.token), withCredentials: true }
      ).pipe(
        timeout(25000),
        map((response) => response.data ?? []),
        catchError((error) => {
          const status = (error as { status?: number } | null)?.status ?? 0;
          if (status === 400 && !failureLogged) {
            failureLogged = true;
            console.error('[OperationsWorkflows] alerts failing request', {
              url,
              fields,
              filters,
              sort,
              status,
              message:
                (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.extensions?.reason ??
                (error as { error?: { errors?: Array<{ message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.message ??
                (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
                (error as { message?: string } | null)?.message ??
                'unknown'
            });
          }
          return throwError(() => error);
        })
      );
    };

    const trySorts = (
      fields: string[],
      filters: Array<{ path: string[]; operator: string; value: string }>,
      sortIndex = 0
    ): Observable<AlertRecord[]> => {
      if (sortIndex >= sortVariants.length) {
        return throwError(() => new Error('Alerts could not be loaded.'));
      }
      return run(fields, sortVariants[sortIndex], filters).pipe(
        catchError((error) => {
          if (!this.isFieldCompatibilityError(error)) {
            return throwError(() => error);
          }
          return trySorts(fields, filters, sortIndex + 1);
        })
      );
    };

    const tryFields = (
      filters: Array<{ path: string[]; operator: string; value: string }>,
      fieldIndex = 0
    ): Observable<AlertRecord[]> => {
      if (fieldIndex >= fieldVariants.length) {
        return throwError(() => new Error('Alerts could not be loaded.'));
      }
      return trySorts(fieldVariants[fieldIndex], filters).pipe(
        catchError((error) => {
          if (!this.isFieldCompatibilityError(error)) {
            return throwError(() => error);
          }
          return tryFields(filters, fieldIndex + 1);
        })
      );
    };

    const tryFilters = (index = 0): Observable<AlertRecord[]> => {
      if (index >= filterVariants.length) {
        return throwError(() => new Error('Alerts could not be loaded.'));
      }
      return tryFields(filterVariants[index]).pipe(
        catchError((error) => {
          if (!this.isFieldCompatibilityError(error)) {
            return throwError(() => error);
          }
          return tryFilters(index + 1);
        })
      );
    };

    return tryFilters().pipe(timeout(25000));
  }

  private ensureScopedContext(allowEmployee = false): Observable<ScopedContext> {
    return this.companyContext.ensureLoaded().pipe(
      take(1),
      map((state) => {
        const token = this.auth.getStoredAccessToken() ?? '';
        const businessProfileId = state.context.activeBusinessProfileId;
        const activeRole = state.context.activeMemberRole;
        const activeMembership = this.companyContext.getActiveMembership();
        const activeDepartmentId = activeRole === 'manager' ? state.context.activeDepartmentId : null;

        if (!businessProfileId || !activeRole || !activeMembership?.id) {
          throw new Error('No active workspace context was found.');
        }

        if (this.normalizeText(activeMembership.status) !== 'active') {
          throw new Error('Your active workspace membership is not active.');
        }

        if (!allowEmployee && activeRole === 'employee') {
          throw new Error('Your workspace role cannot access this request workflow.');
        }

        return {
          token,
          company: state.context,
          businessProfileId,
          activeRole,
          activeDepartmentId,
          activeMembershipId: this.normalizeId(activeMembership.id) ?? '',
          activeMembershipStatus: this.pickString(activeMembership.status) ?? '',
          userId: state.context.userId
        } satisfies ScopedContext;
      }),
      catchError((error) => throwError(() => error))
    );
  }

  private buildCompliancePageData(
    departments: DepartmentRecord[],
    members: MemberRecord[],
    shiftTemplates: ShiftTemplateRecord[],
    requests: ScanRequestRecord[],
    scans: WellnessScanRecord[],
    results: ScanResultRecord[],
    consents: ConsentLogRecord[],
    exports: ReportsExportRecord[]
  ): CompliancePageData {
    const todayStart = this.startOfToday();
    const todayStartMs = todayStart.getTime();

    const latestResultByKey = new Map<string, { score: number | null; risk: string | null; timestamp: string | null }>();
    const scanCountsByKey = new Map<string, { total: number; today: number; lastScanAt: string | null }>();
    const consentKeys = new Set<string>();
    const requestRowsByKey = new Map<string, ScanRequestRecord[]>();

    for (const consent of consents ?? []) {
      const userId = this.normalizeId(consent.user);
      const email = this.pickString((consent.user as UserRecord | null)?.email);
      if (userId) consentKeys.add(`user:${userId}`);
      if (email) consentKeys.add(`email:${email.toLowerCase()}`);
    }

    for (const scan of scans ?? []) {
      const keys = this.scanIdentityKeys(scan.scan_request);
      const timestamp = scan.date_created ?? null;
      const isToday = this.toTimestamp(timestamp) >= todayStartMs;
      for (const key of keys) {
        const current = scanCountsByKey.get(key) ?? { total: 0, today: 0, lastScanAt: null };
        current.total += 1;
        current.today += isToday ? 1 : 0;
        if (!current.lastScanAt || this.toTimestamp(timestamp) >= this.toTimestamp(current.lastScanAt)) {
          current.lastScanAt = timestamp;
        }
        scanCountsByKey.set(key, current);
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

    for (const request of requests ?? []) {
      const keys = this.requestIdentityKeys(request);
      for (const key of keys) {
        const rows = requestRowsByKey.get(key) ?? [];
        rows.push(request);
        requestRowsByKey.set(key, rows);
      }
    }

    const workers = (members ?? []).map((member) => {
      const memberId = this.normalizeId(member.id);
      const userId = this.normalizeId(member.user);
      const email = this.pickString(member.user?.email);
      const keys = this.memberIdentityKeys(memberId, userId, email);
      const requestsForMember = keys.flatMap((key) => requestRowsByKey.get(key) ?? []);
      const uniqueRequests = this.uniqueById(requestsForMember, (item) => this.normalizeId(item.id) ?? `${item.requested_at ?? ''}`);
      const latestRequest = [...uniqueRequests].sort((left, right) => this.requestTimestamp(right) - this.requestTimestamp(left))[0] ?? null;
      const latestResult = this.pickLatestResult(keys, latestResultByKey);
      const scanStats = this.pickLatestScanStats(keys, scanCountsByKey);
      const overdueRequests = uniqueRequests.filter((request) => this.isOverdueRequest(request)).length;
      const completedCount = uniqueRequests.filter((request) => this.isCompletedRequest(request)).length;
      const scannedToday = scanStats?.today ?? 0;
      const missingToday = (member.status ?? '').toLowerCase() !== 'inactive' && scannedToday === 0;
      const complianceStatus = overdueRequests > 0
        ? 'overdue'
        : scannedToday > 0 || completedCount > 0
          ? 'completed'
          : latestRequest
            ? this.requestStatus(latestRequest)
            : 'missing';

      return {
        member_id: this.normalizeId(member.id) ?? '',
        user_id: userId,
        employee_name: this.userLabel(member.user),
        email,
        department_id: this.normalizeId(member.department),
        department_name: this.departmentName(member.department),
        member_status: member.status ?? null,
        latest_request_id: this.normalizeId(latestRequest?.id),
        latest_request_status: latestRequest ? this.requestStatus(latestRequest) : null,
        latest_request_type: latestRequest?.request_type?.trim() || latestRequest?.status?.trim() || null,
        latest_shift_template_id: null,
        latest_shift_template_label: null,
        requested_count: uniqueRequests.length,
        completed_count: completedCount,
        scanned_today: scannedToday,
        missing_today: missingToday,
        overdue_requests: overdueRequests,
        last_scan_at: scanStats?.lastScanAt ?? null,
        last_readiness_score: latestResult?.score ?? null,
        last_risk_level: latestResult?.risk ?? null,
        consent_logged: keys.some((key) => consentKeys.has(key)),
        compliance_status: complianceStatus
      } satisfies ComplianceWorkerRow;
    }).filter((row) => row.member_id);

    const departmentBreakdownMap = new Map<string, ComplianceBreakdownRow>();
    for (const worker of workers) {
      const key = worker.department_id ?? 'unassigned';
      const label = worker.department_name || 'Unassigned';
      const current = departmentBreakdownMap.get(key) ?? {
        id: key,
        label,
        requested: 0,
        completed: 0,
        missing: 0,
        overdue: 0,
        scanned_today: 0
      };
      current.requested += worker.requested_count;
      current.completed += worker.completed_count;
      current.missing += worker.missing_today ? 1 : 0;
      current.overdue += worker.overdue_requests;
      current.scanned_today += worker.scanned_today;
      departmentBreakdownMap.set(key, current);
    }

    const shiftBreakdownMap = new Map<string, ComplianceBreakdownRow>();
    for (const request of requests ?? []) {
      const key = this.normalizeText(request.request_type) || 'all-requests';
      const label = request.request_type?.trim() || 'All Requests';
      const current = shiftBreakdownMap.get(key) ?? {
        id: key,
        label,
        requested: 0,
        completed: 0,
        missing: 0,
        overdue: 0,
        scanned_today: 0
      };
      current.requested += 1;
      current.completed += this.isCompletedRequest(request) ? 1 : 0;
      current.overdue += this.isOverdueRequest(request) ? 1 : 0;
      shiftBreakdownMap.set(key, current);
    }

    for (const scan of scans ?? []) {
      const key = this.normalizeText((scan.scan_request as Record<string, unknown> | null)?.['request_type']) || 'all-requests';
      const current = shiftBreakdownMap.get(key);
      if (!current) {
        continue;
      }
      if (this.toTimestamp(scan.date_created) >= todayStartMs) {
        current.scanned_today += 1;
      }
    }

    const activeMembers = workers.filter((row) => this.normalizeText(row.member_status) !== 'inactive');
    const scannedToday = workers.reduce((sum, row) => sum + row.scanned_today, 0);
    const missingToday = activeMembers.filter((row) => row.missing_today).length;
    const requestedTotal = workers.reduce((sum, row) => sum + row.requested_count, 0);
    const completedTotal = workers.reduce((sum, row) => sum + row.completed_count, 0);
    const overdueRequests = workers.reduce((sum, row) => sum + row.overdue_requests, 0);
    const consentCoverage = activeMembers.length
      ? Math.round((activeMembers.filter((row) => row.consent_logged).length / activeMembers.length) * 100)
      : 0;

    return {
      summary: {
        active_members: activeMembers.length,
        scanned_today: scannedToday,
        missing_today: missingToday,
        requested_total: requestedTotal,
        completed_total: completedTotal,
        overdue_requests: overdueRequests,
        consent_coverage: consentCoverage
      },
      departments: (departments ?? []).map((department) => ({
        id: this.normalizeId(department.id) ?? '',
        name: department.name?.trim() || 'Unnamed Department'
      })).filter((item) => item.id),
      shiftTemplates: (shiftTemplates ?? []).map((template) => ({
        id: this.normalizeId(template.id) ?? '',
        label: this.shiftTemplateLabel(template) || 'Unnamed Shift Template',
        is_active: template.is_active ?? null
      })).filter((item) => item.id),
      workers,
      departmentBreakdown: Array.from(departmentBreakdownMap.values()).sort((left, right) => left.label.localeCompare(right.label)),
      shiftBreakdown: Array.from(shiftBreakdownMap.values()).sort((left, right) => left.label.localeCompare(right.label)),
      latestExportStatus: exports?.[0]?.status?.trim() || null
    };
  }

  private buildRequestsPageData(
    departments: DepartmentRecord[],
    members: MemberRecord[],
    requests: ScanRequestRecord[],
    scans: WellnessScanRecord[],
    notifications: NotificationRecord[]
  ): RequestsPageData {
    const departmentNameById = new Map<string, string>();
    for (const department of departments ?? []) {
      const id = this.normalizeId(department.id);
      if (!id) continue;
      departmentNameById.set(id, formatDepartment(department, 'Unnamed Department'));
    }

    const memberOptions = (members ?? []).map((member) => ({
      member_id: this.normalizeId(member.id) ?? '',
      user_id: this.normalizeId(member.user),
      label: formatMember(member, 'Unknown member'),
      email: sanitizeDisplayValue(this.objectRecord(member.user)?.['email'], ''),
      member_role: this.normalizeMemberRole(member.member_role),
      department_id: this.normalizeId(member.department),
      department_name:
        departmentNameById.get(this.normalizeId(member.department) ?? '') ??
        formatDepartment(member.department, 'Unassigned'),
      status: member.status ?? null
    })).filter((item) => item.member_id);
    const memberByUserId = new Map<string, WorkflowMemberOption>();
    const memberByMemberId = new Map<string, WorkflowMemberOption>();
    for (const member of memberOptions) {
      if (member.user_id) {
        memberByUserId.set(member.user_id, member);
      }
      if (member.member_id) {
        memberByMemberId.set(member.member_id, member);
      }
    }
    const completedScanByRequest = new Map<string, { id: string | null; completedAt: string | null }>();
    for (const scan of scans ?? []) {
      const requestId = this.normalizeId(scan.scan_request?.id);
      if (!requestId) continue;
      const current = completedScanByRequest.get(requestId);
      if (!current || this.toTimestamp(scan.date_created) >= this.toTimestamp(current.completedAt)) {
        completedScanByRequest.set(requestId, {
          id: this.normalizeId(scan.id),
          completedAt: scan.date_created ?? null
        });
      }
    }

    const notificationCountByLink = this.notificationCounts(notifications);

    const rows = (requests ?? []).map((request) => {
      const requestId = this.normalizeId(request.id) ?? '';
      const completedScan = completedScanByRequest.get(requestId);
      const completedScanDate = this.pickString(this.objectRecord(request.completed_scan ?? request.scan_id)?.['completed_at']) ?? this.pickString(request.timestamp);
      const targetMemberRecord = this.objectRecord(request.target_member ?? request.requested_for_user);
      const targetMemberUser = this.objectRecord(targetMemberRecord?.['user']);
      const requestedByUser = this.objectRecord(request.requested_by_user) as UserRecord | null;
      const targetEmail = sanitizeDisplayValue(
        this.pickString(request.requested_for_email) ?? targetMemberUser?.['email'] ?? request.Target,
        ''
      );
      const targetMemberId = this.normalizeId(request.target_member ?? request.requested_for_user);
      const requestedById = this.normalizeId(request.requested_by_user);
      const targetMemberDirectory =
        (targetMemberId ? memberByMemberId.get(targetMemberId) : undefined) ??
        (targetMemberId ? memberByUserId.get(targetMemberId) : undefined);
      const requestedByDirectory =
        (requestedById ? memberByUserId.get(requestedById) : undefined) ??
        (requestedById ? memberByMemberId.get(requestedById) : undefined);
      const targetMemberName = this.firstReadableLabel([
        formatMember(targetMemberRecord, ''),
        targetMemberDirectory?.label ?? '',
        targetEmail,
        this.pickString(request.Target) ?? ''
      ], 'Unknown member');
      const requestedByName = this.firstReadableLabel([
        formatUserName(requestedByUser, ''),
        requestedByDirectory?.label ?? '',
        sanitizeDisplayValue(requestedByUser?.email, '')
      ], 'System');
      const businessProfileName = this.firstReadableLabel([
        formatBusinessProfile(request.business_profile, ''),
        formatBusinessProfile(this.objectRecord(request.business_profile), '')
      ], 'Unknown workspace');
      const targetDepartmentId =
        this.normalizeId(targetMemberRecord?.['department']) ??
        targetMemberDirectory?.department_id ??
        null;
      const directDepartmentName = formatDepartment(request.department, '');
      const memberDepartmentName = formatDepartment(targetMemberRecord?.['department'], '');
      const targetDepartmentName = this.firstReadableLabel([
        directDepartmentName,
        memberDepartmentName,
        targetDepartmentId ? departmentNameById.get(targetDepartmentId) ?? '' : ''
      ], targetDepartmentId ? 'Deleted department' : 'Unassigned');
      const notificationReminderCount = notificationCountByLink.get(`request:${requestId}`) ?? 0;
      const requestStatus = this.requestStatus(request);
      const requestType = this.requestType(request);
      return {
        id: requestId,
        status: requestStatus,
        request_type: requestType,
        requested_at: request.requested_at ?? request.timestamp ?? null,
        due_at: request.due_at ?? null,
        completed_at: request.completed_at ?? completedScanDate ?? completedScan?.completedAt ?? null,
        cancelled_note: request.cancelled ?? null,
        target_member_id: targetMemberId,
        target_member_name: targetMemberName,
        target_member_email: this.firstReadableLabel([targetEmail, targetMemberDirectory?.email ?? ''], '-'),
        requested_by_user_id: requestedById,
        requested_by_user_name: requestedByName,
        business_profile_id: this.normalizeId(request.business_profile),
        business_profile_name: businessProfileName,
        department_id: targetDepartmentId,
        department_name: targetDepartmentName,
        completed_scan_id: this.normalizeId(request.completed_scan ?? request.scan_id) ?? completedScan?.id ?? null,
        completed_scan_at: completedScanDate ?? completedScan?.completedAt ?? null,
        notification_count: notificationReminderCount
      } satisfies RequestRow;
    }).filter((row) => row.id);

    const statusOptions = this.uniqueValues(rows.map((row) => row.status), ['pending', 'sent', 'opened', 'completed', 'expired', 'cancelled']);
    const requestTypeOptions = this.uniqueValues(rows.map((row) => row.request_type));

    return {
      rows,
      departments: (departments ?? []).map((department) => ({
        id: this.normalizeId(department.id) ?? '',
        name: formatDepartment(department, 'Unnamed Department')
      })).filter((item) => item.id),
      members: memberOptions,
      requestTypeOptions,
      statusOptions,
      summary: {
        total: rows.length,
        pending: rows.filter((row) => this.isPendingRequestStatus(row.status)).length,
        completed: rows.filter((row) => this.normalizeText(row.status) === 'completed').length,
        overdue: rows.filter((row) => this.isOverdueRequestStatus(row.status, row.due_at)).length
      }
    };
  }

  private mapEligibleTargets(payload: WorkforceRosterPayload | null): WorkflowMemberOption[] {
    if (!payload?.eligible_scan_targets?.length) {
      return [];
    }

    return payload.eligible_scan_targets.map((target) => ({
      member_id: target.member_id,
      user_id: target.user_id,
      label: target.label,
      email: target.email,
      member_role: target.member_role,
      department_id: target.department_id,
      department_name: target.department_name,
      status: target.status
    }));
  }

  private buildAlertsPageData(
    departments: DepartmentRecord[],
    alerts: AlertRecord[],
    notifications: NotificationRecord[]
  ): AlertsPageData {
    const notificationCountByLink = this.notificationCounts(notifications);
    const departmentNameById = new Map<string, string>();
    for (const department of departments ?? []) {
      const id = this.normalizeId(department.id);
      if (!id) continue;
      departmentNameById.set(id, formatDepartment(department, 'Unnamed Department'));
    }

    const rows = (alerts ?? []).map((alert) => {
      const alertId = this.normalizeId(alert.id) ?? '';
      const targetMemberRecord = this.objectRecord(alert.target_member);
      const targetMemberUser = this.objectRecord(targetMemberRecord?.['user']);
      const targetMemberDepartment = this.objectRecord(targetMemberRecord?.['department']);
      const targetUserRecord = this.objectRecord(alert.target_user);
      const reviewedByRecord = this.objectRecord(alert.reviewed_by);
      const scanRecord = this.objectRecord(alert.scan);

      const targetMemberId = this.normalizeId(alert.target_member);
      const targetUserId = this.normalizeId(alert.target_user) ?? this.normalizeId(targetMemberUser);
      const targetUserName = this.firstReadableLabel([
        formatUserName(targetUserRecord, ''),
        formatUserName(targetMemberUser, '')
      ], '') || null;
      const targetUserEmail =
        sanitizeDisplayValue(targetUserRecord?.['email'], '') ||
        sanitizeDisplayValue(targetMemberUser?.['email'], '') ||
        null;
      const targetMemberStatus = this.pickString(targetMemberRecord?.['status']);
      const targetMemberRole = this.pickString(targetMemberRecord?.['member_role']);
      const alertDepartmentId = this.normalizeId(alert.department);
      const targetMemberDepartmentId = this.normalizeId(targetMemberDepartment);
      const alertDepartmentName = this.resolveDepartmentLabel(alert.department, departmentNameById, '');
      const targetMemberDepartmentName = this.resolveDepartmentLabel(targetMemberDepartment, departmentNameById, '');
      const departmentName = alertDepartmentName || targetMemberDepartmentName || 'Unassigned';
      const targetMemberLabel =
        this.firstReadableLabel([targetUserName ?? '', targetUserEmail ?? '', formatMember(targetMemberRecord, '')], 'Assigned member');

      return {
        id: alertId,
        date_created: alert.date_created ?? null,
        business_profile_id: this.normalizeId(alert.business_profile),
        business_profile_name: formatBusinessProfile(alert.business_profile, 'Unknown workspace'),
        status: alert.status?.trim() || null,
        severity: alert.severity?.trim() || null,
        title: alert.title?.trim() || 'Alert',
        message: alert.message?.trim() || alert.body?.trim() || alert.summary?.trim() || null,
        department_id: alertDepartmentId ?? targetMemberDepartmentId,
        department_name: departmentName,
        target_member_id: targetMemberId,
        target_member_status: targetMemberStatus,
        target_member_role: targetMemberRole,
        target_member_label: targetMemberLabel,
        target_user_id: targetUserId,
        target_user_name: targetUserName,
        target_user_email: targetUserEmail,
        scan_id: this.normalizeId(alert.scan),
        scan_date_created: this.pickString(scanRecord?.['date_created']),
        scan_status: this.pickString(scanRecord?.['status']),
        reviewed_by_id: this.normalizeId(alert.reviewed_by),
        reviewed_by_name: this.firstReadableLabel([
          formatUserName(reviewedByRecord, ''),
          formatUserName(alert.reviewed_by, '')
        ], ''),
        reviewed_by_email: sanitizeDisplayValue(reviewedByRecord?.['email'], ''),
        reviewed_at: alert.reviewed_at ?? null,
        action_note: alert.action_note?.trim() || null,
        action_type: alert.action_type?.trim() || null,
        explanation: alert.explanation?.trim() || null,
        recommended_action: alert.recommended_action?.trim() || null,
        readiness_label: alert.readiness_label?.trim() || alert.risk_label?.trim() || null,
        notification_count: notificationCountByLink.get(`alert:${alertId}`) ?? 0,
      } satisfies AlertRow;
    }).filter((row) => row.id);

    return {
      rows,
      departments: (departments ?? []).map((department) => ({
        id: this.normalizeId(department.id) ?? '',
        name: formatDepartment(department, 'Unnamed Department')
      })).filter((item) => item.id),
      severityOptions: this.uniqueValues(rows.map((row) => row.severity)),
      statusOptions: this.uniqueValues(rows.map((row) => row.status), ['new', 'seen', 'reviewed', 'resolved', 'overridden']),
      summary: {
        total: rows.length,
        new: rows.filter((row) => this.normalizeText(row.status) === 'new').length,
        reviewed: rows.filter((row) => this.normalizeText(row.status) === 'reviewed').length,
        escalated: rows.filter((row) => this.normalizeText(row.action_type) === 'escalated').length
      }
    };
  }

  private performAlertWorkflowAction(alertId: string, action: AlertWorkflowAction): Observable<AlertWorkflowRecord> {
    return this.ensureScopedContext(true).pipe(
      switchMap((context) => {
        const normalizedAlertId = this.normalizeId(alertId);
        if (!normalizedAlertId) {
          return throwError(() => new AlertWorkflowApiError('invalid_response', 0, 'Alert id is missing.'));
        }

        return this.http.post<{ data?: AlertWorkflowResponse }>(
          `${this.api}/wellar/alerts/${encodeURIComponent(normalizedAlertId)}/workflow`,
          { action },
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(
          timeout(25000),
          map((response) => {
            const alert = response.data?.alert;
            if (!alert?.id || !alert.status) {
              throw new AlertWorkflowApiError('invalid_response', 0, 'Alert workflow response was invalid.');
            }
            return this.normalizeAlertWorkflowRecord(alert);
          }),
          catchError((error) => this.handleAlertWorkflowError(error))
        );
      })
    );
  }

  private normalizeAlertWorkflowRecord(record: AlertWorkflowRecord): AlertWorkflowRecord {
    return {
      id: this.normalizeId(record.id) ?? '',
      status: this.pickString(record.status),
      reviewed_by: record.reviewed_by ?? null,
      reviewed_at: record.reviewed_at ?? null,
      action_note: record.action_note?.trim() || null,
      action_type: record.action_type?.trim() || null,
      date_created: record.date_created ?? null,
      date_updated: record.date_updated ?? null
    };
  }

  private handleAlertWorkflowError(error: unknown): Observable<never> {
    if (error instanceof AlertWorkflowApiError) {
      return throwError(() => error);
    }

    const status = (error as { status?: number } | null)?.status ?? 0;
    const directusError = this.objectRecord((error as { error?: unknown } | null)?.error);
    const backendCode = this.pickString(directusError?.['code'])?.toUpperCase() ?? '';
    const backendMessage = this.pickString(directusError?.['message']);

    if (status === 0) {
      return throwError(() => new AlertWorkflowApiError('network_error', status, 'Alert workflow update could not reach the server.', error));
    }
    if (status === 401 || backendCode === 'UNAUTHORIZED') {
      return throwError(() => new AlertWorkflowApiError('unauthorized', 401, 'Session expired. Please sign in again.', error));
    }
    if (status === 403 || backendCode === 'FORBIDDEN') {
      return throwError(() => new AlertWorkflowApiError('forbidden', 403, backendMessage ?? 'You do not have permission to change this alert.', error));
    }
    if (status === 404 || backendCode === 'NOT_FOUND') {
      return throwError(() => new AlertWorkflowApiError('not_found', 404, backendMessage ?? 'The selected alert was not found.', error));
    }
    if (status === 409 || backendCode === 'CONFLICT') {
      return throwError(() => new AlertWorkflowApiError('conflict', 409, backendMessage ?? 'The alert workflow state changed before the action could be applied.', error));
    }
    if (status >= 500 || backendCode === 'SERVER_ERROR') {
      return throwError(() => new AlertWorkflowApiError('server_error', status || 500, backendMessage ?? 'Alert workflow update failed.', error));
    }

    return throwError(() => new AlertWorkflowApiError('unknown', status, backendMessage ?? 'Alert workflow update failed.', error));
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
      { headers: this.headers(token), withCredentials: true }
    ).pipe(
      map((response) => response.data ?? []),
      catchError(() => of([]))
    );
  }

  private fetchAlertRecordWithFallback(context: ScopedContext, alertId: string): Observable<AlertRecord> {
    const fieldVariants: string[][] = [
      [
        'id',
        'title',
        'status',
        'severity',
        'business_profile',
        'business_profile.id',
        'business_profile.company_name',
        'department',
        'department.id',
        'department.name',
        'target_member',
        'target_member.id',
        'target_member.status',
        'target_member.member_role',
        'target_member.department',
        'target_member.department.id',
        'target_member.department.name',
        'target_member.user.id',
        'target_member.user.email',
        'target_member.user.first_name',
        'target_member.user.last_name',
        'target_user',
        'target_user.id',
        'target_user.email',
        'target_user.first_name',
        'target_user.last_name',
        'scan',
        'scan.id',
        'scan.date_created',
        'scan.status',
        'date_created',
        'reviewed_by',
        'reviewed_by.id',
      'reviewed_by.email',
      'reviewed_by.first_name',
      'reviewed_by.last_name',
      'reviewed_at',
      'message',
      'action_note',
      'action_type',
        'scan_id',
        'scan_request',
        'alert_type'
      ],
      [
        'id',
        'title',
        'status',
        'severity',
        'business_profile',
        'department',
        'target_member',
        'target_user',
      'scan',
      'date_created',
      'reviewed_by',
      'reviewed_at',
      'message',
      'action_note',
        'action_type',
        'scan_id',
        'scan_request',
        'alert_type'
      ]
    ];

    const tryFields = (variants: string[][]): Observable<AlertRecord> => {
      const [fields, ...rest] = variants;
      if (!fields) {
        return throwError(() => new Error('Alert details could not be loaded.'));
      }

      const params = new URLSearchParams({ fields: fields.join(',') });
      return this.http.get<{ data?: AlertRecord }>(
        `${this.api}/items/alerts/${encodeURIComponent(alertId)}?${params.toString()}`,
        { headers: this.headers(context.token), withCredentials: true }
      ).pipe(
        timeout(25000),
        map((response) => response.data ?? {}),
        catchError((error) => {
          if (!rest.length || !this.isFieldCompatibilityError(error)) {
            return throwError(() => error);
          }
          console.warn('[ALERT_DETAIL_PARSE_FALLBACK]', {
            alertId,
            droppedToFallbackFields: true
          });
          return tryFields(rest);
        })
      );
    };

    return tryFields(fieldVariants);
  }

  private fetchAlertScanResult(
    context: ScopedContext,
    scanId: string | null,
    alertId: string
  ): Observable<AlertScanResultRecord | null> {
    if (!scanId) {
      return of(null);
    }

    const fieldVariants = [
      ['id', 'scan_id', 'risk_level', 'overall_state', 'explanation', 'suggested_action', 'readiness_score', 'date_created'],
      ['id', 'scan_id', 'risk_level', 'explanation', 'suggested_action', 'date_created'],
      ['id', 'scan_id', 'risk_level', 'date_created']
    ];

    const tryFields = (variants: string[][]): Observable<AlertScanResultRecord | null> => {
      const [fields, ...rest] = variants;
      if (!fields) {
        return of(null);
      }

      return this.queryItemsStrict<AlertScanResultRecord>('scan_results', fields, context.token, {
        filters: [{ path: ['scan_id'], operator: '_eq', value: scanId }],
        sort: '-date_created',
        limit: 1
      }).pipe(
        map((rows) => rows[0] ?? null),
        catchError((error) => {
          const status = (error as { status?: number } | null)?.status ?? 0;
          if (status === 403) {
            console.warn('[ALERT_DETAIL_PERMISSION_BLOCKED]', {
              alertId,
              relation: 'scan_result',
              scanId
            });
            return of(null);
          }
          if (!rest.length || !this.isFieldCompatibilityError(error)) {
            return throwError(() => error);
          }
          console.warn('[ALERT_DETAIL_PARSE_FALLBACK]', {
            alertId,
            relation: 'scan_result'
          });
          return tryFields(rest);
        })
      );
    };

    return tryFields(fieldVariants);
  }

  private mapAlertDetailsRow(
    alert: AlertRecord,
    scanResult: AlertScanResultRecord | null,
    relationWarnings: string[],
    permissionWarnings: string[]
  ): AlertDetailsRow {
    const targetMemberRecord = this.objectRecord(alert.target_member);
    const targetMemberUser = this.objectRecord(targetMemberRecord?.['user']);
    const targetMemberDepartment = this.objectRecord(targetMemberRecord?.['department']);
    const targetUserRecord = this.objectRecord(alert.target_user) ?? targetMemberUser;
    const reviewedByRecord = this.objectRecord(alert.reviewed_by);
    const businessProfileRecord = this.objectRecord(alert.business_profile);
    const departmentRecord = this.objectRecord(alert.department) ?? targetMemberDepartment;
    const scanRecord = this.objectRecord(alert.scan) ?? this.objectRecord(alert.scan_id);

    const targetUserName = this.firstReadableLabel([
      formatUserName(targetUserRecord, ''),
      formatUserName(targetMemberUser, '')
    ], '') || null;
    const targetUserEmail = sanitizeDisplayValue(
      targetUserRecord?.['email'] ?? targetMemberUser?.['email'],
      ''
    ) || null;

    const normalizedScanId =
      this.normalizeId(alert.scan) ??
      this.normalizeId(alert.scan_id) ??
      this.normalizeId(alert.scan_request);

    return {
      id: this.normalizeId(alert.id) ?? '',
      date_created: alert.date_created ?? null,
      business_profile_id: this.normalizeId(alert.business_profile),
      business_profile_name: formatBusinessProfile(businessProfileRecord ?? alert.business_profile, 'Unknown workspace'),
      status: alert.status?.trim() || null,
      severity: alert.severity?.trim() || null,
      title: alert.title?.trim() || 'Alert',
      message:
        alert.message?.trim() ||
        alert.body?.trim() ||
        alert.summary?.trim() ||
        scanResult?.explanation?.trim() ||
        null,
      department_id: this.normalizeId(departmentRecord ?? alert.department),
      department_name: formatDepartment(departmentRecord ?? alert.department, 'Unassigned'),
      target_member_id: this.normalizeId(alert.target_member),
      target_member_status: this.pickString(targetMemberRecord?.['status']),
      target_member_role: this.pickString(targetMemberRecord?.['member_role']),
      target_member_label: this.firstReadableLabel([
        targetUserName ?? '',
        targetUserEmail ?? '',
        formatMember(targetMemberRecord, '')
      ], 'Assigned member'),
      target_user_id: this.normalizeId(alert.target_user) ?? this.normalizeId(targetMemberUser),
      target_user_name: targetUserName,
      target_user_email: targetUserEmail,
      scan_id: normalizedScanId,
      scan_date_created: this.pickString(scanRecord?.['date_created']) ?? scanResult?.date_created ?? null,
      scan_status: this.pickString(scanRecord?.['status']) ?? null,
      reviewed_by_id: this.normalizeId(alert.reviewed_by),
      reviewed_by_name: this.firstReadableLabel([
        formatUserName(reviewedByRecord, ''),
        formatUserName(alert.reviewed_by, '')
      ], ''),
      reviewed_by_email: sanitizeDisplayValue(reviewedByRecord?.['email'], ''),
      reviewed_at: alert.reviewed_at ?? null,
      action_note: alert.action_note?.trim() || null,
      action_type: alert.action_type?.trim() || alert.alert_type?.trim() || null,
      explanation: alert.explanation?.trim() || scanResult?.explanation?.trim() || null,
      recommended_action: alert.recommended_action?.trim() || scanResult?.suggested_action?.trim() || null,
      readiness_label:
        alert.readiness_label?.trim() ||
        alert.risk_label?.trim() ||
        scanResult?.risk_level?.trim() ||
        scanResult?.overall_state?.trim() ||
        null,
      notification_count: 0,
      target_member_department_id: this.normalizeId(targetMemberDepartment),
      target_member_department_name: formatDepartment(targetMemberDepartment, 'Unassigned'),
      reviewed_status_label: alert.reviewed_at ? 'Reviewed' : 'Not reviewed',
      relationWarnings,
      permissionWarnings
    };
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

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${collection}?${params.toString()}`,
      { headers: this.headers(token), withCredentials: true }
    ).pipe(
      timeout(25000),
      map((response) => response.data ?? [])
    );
  }

  private optionalList<T>(label: string, source$: Observable<T[]>): Observable<T[]> {
    return source$.pipe(
      timeout(12000),
      catchError((error) => {
        console.warn(`[OperationsWorkflows] optional ${label} load skipped`, error);
        return of([] as T[]);
      })
    );
  }

  /**
   * Fetch a single row by id and confirm it belongs to the active workspace
   * (business_profile) before a by-id mutation. Returns the row on success,
   * otherwise errors with a clear, professional message.
   *
   * This is a front-end defense-in-depth check only - it does NOT replace
   * Directus row-level security, which remains the authoritative guard.
   */
  private verifyTenantOwnership(
    collection: string,
    itemId: string,
    context: ScopedContext,
    extraFields: string[] = []
  ): Observable<Record<string, unknown>> {
    const id = this.normalizeId(itemId);
    if (!id) {
      return throwError(() => new Error(SecurityMessages.notInWorkspace));
    }

    const fields = ['id', 'business_profile', ...extraFields].join(',');
    return this.http.get<{ data?: Record<string, unknown> | null }>(
      `${this.api}/items/${collection}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
      { headers: this.headers(context.token), withCredentials: true }
    ).pipe(
      timeout(15000),
      map((response) => {
        const row = response?.data ?? null;
        if (!row) {
          // Missing row or filtered out by backend policy => treat as not in workspace.
          throw new Error(SecurityMessages.notInWorkspace);
        }
        const rowBusinessId = this.normalizeId(row['business_profile']);
        if (!rowBusinessId || rowBusinessId !== context.businessProfileId) {
          throw new Error(SecurityMessages.notInWorkspace);
        }
        return row;
      }),
      catchError((error) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status === 403) {
          return throwError(() => new Error(SecurityMessages.cannotUpdateItem));
        }
        if (status === 404) {
          return throwError(() => new Error(SecurityMessages.notInWorkspace));
        }
        // Re-throw our own thrown Errors (status 0) and any unexpected transport errors.
        return throwError(() => error);
      })
    );
  }

  private headers(token: string): HttpHeaders {
    return this.auth.getAuthHeaders(token);
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

  private assertManagerDepartmentScope(context: ScopedContext): void {
    if (context.activeRole === 'manager' && !context.activeDepartmentId) {
      throw new Error('Scoped data unavailable: manager account has no active department context.');
    }
  }

  private managerDepartmentFilters(
    context: ScopedContext,
    businessPath: string[],
    departmentPath?: string[]
  ): Array<{ path: string[]; operator: string; value: string }> {
    this.assertManagerDepartmentScope(context);
    return this.scopeFilters(context, businessPath, departmentPath);
  }

  private managerRequestFields(context: ScopedContext): string[] {
    if (context.activeRole === 'manager') {
      return ['id', 'department', 'status', 'request_type', 'requested_at', 'due_at'];
    }

    return [
      'id',
      'business_profile',
      'department',
      'requested_by_user',
      'target_member',
      'completed_scan',
      'status',
      'cancelled',
      'request_type',
      'requested_at',
      'due_at',
      'completed_at'
    ];
  }

  private notificationCounts(rows: NotificationRecord[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of rows ?? []) {
      const type = this.normalizeText(item.link_type);
      const id = this.normalizeId(item.link_id);
      if (!type || !id) continue;
      const key = type.includes('alert') ? `alert:${id}` : type.includes('request') ? `request:${id}` : '';
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private scanIdentityKeys(
    scanRequest:
      | WellnessScanRecord['scan_request']
      | ScanResultRecord['scan_request']
      | null
      | undefined
  ): string[] {
    const direct = this.objectRecord(scanRequest);
    const request =
      (direct && ('target_member' in direct || 'requested_for_user' in direct) ? direct : null) ??
      this.objectRecord(direct?.['scan_request']);

    const keys: string[] = [];
    const userRecord = request?.['target_member'] ?? request?.['requested_for_user'];
    const userId = this.normalizeId(userRecord);
    const email = this.pickString(this.objectRecord(userRecord)?.['email']);

    if (userId) keys.push(`user:${userId}`);
    if (email) keys.push(`email:${email.toLowerCase()}`);
    return keys;
  }

  private requestIdentityKeys(request: ScanRequestRecord): string[] {
    const keys: string[] = [];
    const memberId = this.normalizeId(request.target_member);
    const targetMemberRecord = this.objectRecord(request.target_member);
    const targetUser = this.objectRecord(targetMemberRecord?.['user']);
    const userId = this.normalizeId(targetUser);
    const email = this.pickString(targetUser?.['email']);
    if (memberId) keys.push(`member:${memberId}`);
    if (userId) keys.push(`user:${userId}`);
    if (email) keys.push(`email:${email.toLowerCase()}`);
    return keys;
  }

  private memberIdentityKeys(memberId: string | null, userId: string | null, email: string | null): string[] {
    const keys: string[] = [];
    if (memberId) keys.push(`member:${memberId}`);
    if (userId) keys.push(`user:${userId}`);
    if (email) keys.push(`email:${email.toLowerCase()}`);
    return keys;
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

  private pickLatestScanStats(
    keys: string[],
    mapByKey: Map<string, { total: number; today: number; lastScanAt: string | null }>
  ): { total: number; today: number; lastScanAt: string | null } | null {
    let aggregate: { total: number; today: number; lastScanAt: string | null } | null = null;
    for (const key of keys) {
      const candidate = mapByKey.get(key);
      if (!candidate) continue;
      if (!aggregate) {
        aggregate = { ...candidate };
        continue;
      }
      aggregate.total = Math.max(aggregate.total, candidate.total);
      aggregate.today = Math.max(aggregate.today, candidate.today);
      if (!aggregate.lastScanAt || this.toTimestamp(candidate.lastScanAt) >= this.toTimestamp(aggregate.lastScanAt)) {
        aggregate.lastScanAt = candidate.lastScanAt;
      }
    }
    return aggregate;
  }

  private requestStatus(value: ScanRequestRecord): string {
    return value.status?.trim() || 'pending';
  }

  private requestType(value: ScanRequestRecord): string | null {
    return value.request_type?.trim() || null;
  }

  private requestTimestamp(value: ScanRequestRecord): number {
    return this.toTimestamp(value.requested_at ?? value.completed_at ?? null);
  }

  private isCompletedRequest(value: ScanRequestRecord): boolean {
    const status = this.normalizeText(this.requestStatus(value));
    return status === 'completed' || Boolean(this.normalizeId(value.completed_scan)) || Boolean(value.completed_at);
  }

  private isPendingRequestStatus(value: string | null | undefined): boolean {
    const status = this.normalizeText(value);
    return status === 'pending' || status === 'sent' || status === 'opened';
  }

  private hasConflictingOpenRequest(request: ScanRequestRecord, nextDueAtTs: number): boolean {
    const memberId = this.normalizeId(request.target_member);
    if (!memberId) {
      return false;
    }

    const status = this.requestStatus(request);
    const normalizedStatus = this.normalizeText(status);
    if (this.closedRequestStatuses.has(normalizedStatus)) {
      return false;
    }

    const compareTs = this.toTimestamp(request.due_at ?? null) || this.requestTimestamp(request);
    if (compareTs <= 0) {
      return this.isPendingRequestStatus(status) || this.isOverdueRequest(request);
    }

    return this.isSameRequestWindow(compareTs, nextDueAtTs);
  }

  private isSameRequestWindow(leftTs: number, rightTs: number): boolean {
    const diffMs = Math.abs(leftTs - rightTs);
    if (diffMs <= 5 * 60 * 1000) {
      return true;
    }

    const left = new Date(leftTs);
    const right = new Date(rightTs);
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  private isOverdueRequest(value: ScanRequestRecord): boolean {
    return this.isOverdueRequestStatus(this.requestStatus(value), value.due_at ?? null);
  }

  private isOverdueRequestStatus(status: string | null | undefined, dueAt: string | null | undefined): boolean {
    const normalized = this.normalizeText(status);
    if (!dueAt || this.closedRequestStatuses.has(normalized)) {
      return false;
    }
    return this.toTimestamp(dueAt) > 0 && this.toTimestamp(dueAt) < Date.now();
  }

  private isScanEligibleMember(member: MemberRecord): boolean {
    const status = this.normalizeText(member.status);
    const role = this.normalizeMemberRole(member.member_role);
    return status === 'active' && role === 'employee';
  }

  private filterBulkEligibleMembers(
    context: ScopedContext,
    members: MemberRecord[],
    dueAt: string | null | undefined
  ): Observable<MemberRecord[]> {
    const nextDueAtTs = this.toTimestamp(dueAt ?? null);
    if (!members.length || nextDueAtTs <= 0) {
      return of(members);
    }

    return this.fetchScanRequestQueue(context).pipe(
      map((queue) => {
        const blockedMemberIds = new Set(
          (queue.rows ?? [])
            .filter((request) => this.hasConflictingOpenRequest(request, nextDueAtTs))
            .map((request) => this.normalizeId(request.target_member))
            .filter((memberId): memberId is string => Boolean(memberId))
        );

        return members.filter((member) => {
          const memberId = this.normalizeId(member.id);
          return !memberId || !blockedMemberIds.has(memberId);
        });
      }),
      catchError((error) => {
        console.warn('[OperationsWorkflows] duplicate request guard skipped', error);
        return of(members);
      })
    );
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

  private isOpenAlertStatus(status: string | null | undefined): boolean {
    const normalized = this.normalizeText(status);
    if (!normalized) return true;
    return !this.closedAlertStatuses.has(normalized);
  }

  private uniqueValues(values: Array<string | null | undefined>, seed: string[] = []): string[] {
    const set = new Set(seed.filter(Boolean).map((item) => item.trim()).filter(Boolean));
    for (const value of values ?? []) {
      const normalized = value?.trim();
      if (normalized) set.add(normalized);
    }
    return Array.from(set.values()).sort((left, right) => left.localeCompare(right));
  }

  private uniqueById<T>(items: T[], keyFn: (item: T) => string): T[] {
    const map = new Map<string, T>();
    for (const item of items ?? []) {
      const key = keyFn(item);
      if (key) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  }

  private shiftTemplateLabel(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      const label = sanitizeDisplayValue(value, '');
      return label || null;
    }
    const record = value as Record<string, unknown>;
    return sanitizeDisplayValue(
      this.pickString(record['name']) ?? this.pickString(record['title']) ?? this.pickString(record['label']),
      ''
    ) || null;
  }

  private departmentName(value: unknown): string | null {
    const label = formatDepartment(value, '');
    return label || null;
  }

  private resolveDepartmentLabel(
    value: unknown,
    departmentNameById: Map<string, string>,
    fallback: string
  ): string {
    const departmentRecord = this.objectRecord(value);
    if (departmentRecord) {
      const departmentId = this.normalizeId(departmentRecord);
      if (departmentId && departmentNameById.has(departmentId)) {
        return departmentNameById.get(departmentId) ?? fallback;
      }

      const explicitLabel = this.firstReadableLabel([
        this.pickString(departmentRecord['name']),
        this.pickString(departmentRecord['title']),
        this.pickString(departmentRecord['label'])
      ], '');
      if (explicitLabel) {
        return explicitLabel;
      }
    }

    const departmentId = this.normalizeId(value);
    if (departmentId) {
      return departmentNameById.get(departmentId) ?? fallback;
    }

    const directLabel = formatDepartment(value, '');
    return directLabel || fallback;
  }

  private userLabel(user: unknown): string {
    return formatUserName(user, '');
  }

  private firstReadableLabel(values: Array<string | null | undefined>, fallback: string): string {
    for (const value of values) {
      const picked = this.pickString(value);
      if (!picked || isUuid(picked)) {
        continue;
      }
      return picked;
    }
    return fallback;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') return this.normalizeId((value as Record<string, unknown>)['id']);
    return null;
  }

  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  private normalizeText(value: unknown): string {
    return this.pickString(value)?.toLowerCase() ?? '';
  }

  private isFieldCompatibilityError(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const message = this.normalizeText(
      (error as { error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.extensions?.reason ??
      (error as { error?: { errors?: Array<{ message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.message ??
      (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
      (error as { message?: string } | null)?.message
    );

    if (status === 403) {
      return true;
    }

    if (status !== 400 && status !== 422) {
      return false;
    }

    return (
      message.includes('field') ||
      message.includes('payload') ||
      message.includes('invalid') ||
      message.includes('unknown') ||
      message.includes('does not exist') ||
      message.includes('not allowed') ||
      message.includes('permission')
    );
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
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

  private isIsoDateTime(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }

    const normalized = value.trim();
    if (!normalized) {
      return false;
    }

    const parsed = new Date(normalized);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(normalized.slice(0, 10));
  }

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
