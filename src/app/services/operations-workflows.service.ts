import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
  department_id: string | null;
  department_name: string | null;
  status: string | null;
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
  target_member?: string | null;
  department?: string | null;
  request_type?: string | null;
  status?: string | null;
  completed_scan?: string | null;
  cancelled?: string | null;
  due_at?: string | null;
  requested_by_user?: string | null;
};

export type RequestActionResult = {
  ok: boolean;
  message: string;
  configured?: boolean;
};

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
    open: number;
    reviewed: number;
    escalated: number;
  };
};

export type AlertActionInput = {
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  action_note?: string | null;
  action_type?: string | null;
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
    private companyContext: CompanyContextService
  ) {}

  getCompliancePageData(): Observable<CompliancePageData> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        forkJoin({
          departments: this.queryItems<DepartmentRecord>(
            'departments',
            ['id', 'name'],
            context.token,
            { filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }], sort: 'name', limit: 120 }
          ),
          members: this.queryItems<MemberRecord>(
            'business_profile_members',
            ['id', 'status', 'department', 'user.id', 'user.email', 'user.first_name', 'user.last_name'],
            context.token,
            { filters: this.scopeFilters(context, ['business_profile'], ['department']), sort: '-id', limit: 400 }
          ),
          shiftTemplates: this.queryItems<ShiftTemplateRecord>(
            'shift_templates',
            ['id', 'name', 'title', 'start_time', 'scan_window_start_minutes', 'scan_window_end_minutes', 'is_active'],
            context.token,
            { filters: this.scopeFilters(context, ['business_profile']), sort: 'name', limit: 200 }
          ),
          requests: this.queryItems<ScanRequestRecord>(
            'requests',
            [
              'id',
              'business_profile',
              'scan_id',
              'required_state',
              'response_status',
              'response_payload',
              'timestamp',
              'requested_for_user',
              'requested_for_email',
              'requested_for_phone',
              'Target'
            ],
            context.token,
            { filters: this.scopeFilters(context, ['business_profile']), sort: '-timestamp', limit: 800 }
          ),
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
          map(({ departments, members, shiftTemplates, requests, scans, results, consents, exports }) =>
            this.buildCompliancePageData(departments, members, shiftTemplates, requests, scans, results, consents, exports)
          )
        )
      )
    );
  }

  getRequestsPageData(): Observable<RequestsPageData> {
    return this.ensureScopedContext(true).pipe(
      tap(() => {
        console.log('[ScanRequests] active context ready');
      }),
      switchMap((context) =>
        this.loadScanRequestsForPage(context).pipe(
          tap((requests) => {
            console.log('[ScanRequests] scan requests result', Array.isArray(requests) ? requests.length : 0);
          }),
          switchMap((requests) =>
            forkJoin({
              departments: this.loadDepartmentsForRequests(context).pipe(
                timeout(12000),
                catchError((error) => {
                  console.warn('[ScanRequests] optional departments failed, using []', error);
                  return of([] as DepartmentRecord[]);
                })
              ),
              members: this.loadMembersForRequests(context).pipe(
                timeout(12000),
                catchError((error) => {
                  console.warn('[ScanRequests] optional members failed, using []', error);
                  return of([] as MemberRecord[]);
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
              map(({ departments, members, scans, notifications }) => {
                const pageData = this.buildRequestsPageData(
                  departments,
                  members,
                  requests,
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
      requests = await firstValueFrom(this.loadScanRequestsForPage(context).pipe(take(1), timeout(8000)));
      console.log('[ScanRequests] scan requests result', Array.isArray(requests) ? requests.length : 0);
    } catch (error) {
      console.error('[OperationsWorkflows] requests failed', error);
      requests = [];
      warning = 'requests_load_failed';
    }

    const [departmentsResult, membersResult, scansResult, notificationsResult] = await Promise.allSettled([
      firstValueFrom(this.loadDepartmentsForRequests(context).pipe(take(1), timeout(4000))),
      firstValueFrom(this.loadMembersForRequests(context).pipe(take(1), timeout(4000))),
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

    const departments = departmentsResult.status === 'fulfilled'
      ? (departmentsResult.value ?? [])
      : (console.warn('[ScanRequests] optional departments failed, using []', departmentsResult.reason), [] as DepartmentRecord[]);
    const members = membersResult.status === 'fulfilled'
      ? (membersResult.value ?? [])
      : (console.warn('[ScanRequests] optional members failed, using []', membersResult.reason), [] as MemberRecord[]);
    const scans = scansResult.status === 'fulfilled'
      ? (scansResult.value ?? [])
      : (console.warn('[ScanRequests] optional scans failed, using []', scansResult.reason), [] as WellnessScanRecord[]);
    const notifications = notificationsResult.status === 'fulfilled'
      ? (notificationsResult.value ?? [])
      : (console.warn('[ScanRequests] optional notifications failed, using []', notificationsResult.reason), [] as NotificationRecord[]);

    const pageData = this.buildRequestsPageData(departments, members, requests, scans, notifications);
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
        forkJoin({
          departments: this.optionalList(
            'departments',
            this.loadDepartmentsForRequests(context)
          ),
          members: this.optionalList(
            'business_profile_members',
            this.loadMembersForRequests(context)
          )
        }).pipe(
          map(({ departments, members }) => ({
            departments: (departments ?? [])
              .map((department) => ({
                id: this.normalizeId(department.id) ?? '',
                name: formatDepartment(department, 'Unnamed Department')
              }))
              .filter((item) => item.id),
            members: (members ?? [])
              .map((member) => ({
                member_id: this.normalizeId(member.id) ?? '',
                user_id: this.normalizeId(member.user),
                label: formatMember(member, 'Unknown member'),
                email: sanitizeDisplayValue(this.objectRecord(member.user)?.['email'], ''),
                department_id: this.normalizeId(member.department),
                department_name: formatDepartment(member.department, 'Unassigned'),
                status: member.status ?? null
              }))
              .filter((item) => item.member_id)
          }))
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

  createScanRequest(input: CreateScanRequestInput): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const role = context.activeRole;
        if (role !== 'owner' && role !== 'hr') {
          return throwError(() => new Error('Your workspace role cannot create scan requests.'));
        }

        const now = new Date().toISOString();
        const payload: Record<string, unknown> = {
          business_profile: context.businessProfileId,
          requested_for_user: input.target_member ?? null,
          requested_for_email: null,
          requested_for_phone: null,
          Target: null,
          required_state: input.request_type ?? 'manual',
          response_status: input.status ?? 'pending',
          timestamp: now,
          response_payload: input.completed_scan ? { completed_scan: input.completed_scan } : null
        };

        if (!this.normalizeId(payload['requested_for_user'])) {
          return throwError(() => new Error('Target member is required.'));
        }

        return this.postWithFallback('requests', context.token, [payload]).pipe(
          map(() => void 0),
          switchMap(() =>
            this.logActivityEvent(
              context,
              'scan_request_created',
              null,
              {
                target_member: input.target_member ?? null,
                department: input.department ?? null
              }
            )
          )
        );
      })
    );
  }

  createDepartmentScanRequests(input: CreateScanRequestInput): Observable<number> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const role = context.activeRole;
        if (role !== 'owner' && role !== 'hr') {
          return throwError(() => new Error('Your workspace role cannot create scan requests.'));
        }

        const departmentId = this.normalizeId(input.department);
        if (!departmentId) {
          return throwError(() => new Error('Department is required.'));
        }

        return this.loadMembersForRequests(context).pipe(
          switchMap((members) => {
            const eligibleMembers = (members ?? []).filter((member) => {
              const memberDepartmentId = this.normalizeId(member.department);
              return this.isScanEligibleMember(member) && memberDepartmentId === departmentId;
            });

            if (!eligibleMembers.length) {
              return of(0);
            }

            return this.filterBulkEligibleMembers(context, eligibleMembers, input.due_at).pipe(
              switchMap((targetMembers) => {
                if (!targetMembers.length) {
                  return of(0);
                }

                return forkJoin(
                  targetMembers.map((member) =>
                    this.createScanRequest({
                      ...input,
                      request_type: input.request_type ?? 'bulk',
                      department: departmentId,
                      target_member: this.normalizeId(member.id)
                    }).pipe(catchError((error) => throwError(() => error)))
                  )
                ).pipe(map((rows) => rows.length));
              })
            );
          })
        );
      })
    );
  }

  createUnassignedScanRequests(input: CreateScanRequestInput): Observable<number> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const role = context.activeRole;
        if (role !== 'owner' && role !== 'hr') {
          return throwError(() => new Error('Your workspace role cannot create scan requests.'));
        }

        return this.loadMembersForRequests(context).pipe(
          switchMap((members) => {
            const eligibleMembers = (members ?? []).filter((member) =>
              this.isScanEligibleMember(member) && !this.normalizeId(member.department)
            );

            if (!eligibleMembers.length) {
              return of(0);
            }

            return this.filterBulkEligibleMembers(context, eligibleMembers, input.due_at).pipe(
              switchMap((targetMembers) => {
                if (!targetMembers.length) {
                  return of(0);
                }

                return forkJoin(
                  targetMembers.map((member) =>
                    this.createScanRequest({
                      ...input,
                      request_type: input.request_type ?? 'bulk',
                      department: null,
                      target_member: this.normalizeId(member.id)
                    }).pipe(catchError((error) => throwError(() => error)))
                  )
                ).pipe(map((rows) => rows.length));
              })
            );
          })
        );
      })
    );
  }

  createWorkspaceScanRequests(input: CreateScanRequestInput): Observable<number> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const role = context.activeRole;
        if (role !== 'owner' && role !== 'hr') {
          return throwError(() => new Error('Your workspace role cannot create scan requests.'));
        }

        return this.loadMembersForRequests(context).pipe(
          switchMap((members) => {
            const activeMembers = (members ?? []).filter((member) => this.isScanEligibleMember(member));

            if (!activeMembers.length) {
              return of(0);
            }

            return this.filterBulkEligibleMembers(context, activeMembers, input.due_at).pipe(
              switchMap((targetMembers) => {
                if (!targetMembers.length) {
                  return of(0);
                }

                return forkJoin(
                  targetMembers.map((member) =>
                    this.createScanRequest({
                      ...input,
                      request_type: input.request_type ?? 'bulk',
                      target_member: this.normalizeId(member.id),
                      department: this.normalizeId(member.department) ?? input.department ?? null
                    }).pipe(catchError((error) => throwError(() => error)))
                  )
                ).pipe(map((rows) => rows.length));
              })
            );
          })
        );
      })
    );
  }

  cancelScanRequest(requestId: string): Observable<RequestActionResult> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        const payloads: Array<Record<string, unknown>> = [
          { response_status: 'cancelled', response_payload: { cancelled: 'Cancelled by workspace operator' } },
          { response_status: 'cancelled' }
        ];

        return this.patchWithFallback('requests', requestId, context.token, payloads).pipe(
          switchMap(() =>
            this.logActivityEvent(context, 'scan_request_cancelled', requestId, null).pipe(
              map(() => ({
                ok: true,
                message: 'Scan request cancelled.'
              } satisfies RequestActionResult))
            )
          ),
          catchError((error) => {
            console.error('[OperationsWorkflows] cancel request failed', error);
            return throwError(() => error);
          })
        );
      })
    );
  }

  remindScanRequest(requestId: string, currentCount: number): Observable<RequestActionResult> {
    return this.ensureScopedContext().pipe(
      switchMap((context) => {
        void currentCount;
        const notificationPayload = {
          business_profile: context.businessProfileId,
          user: null,
          link_type: 'request',
          link_id: requestId,
          title: 'Readiness scan reminder sent',
          body: 'A reminder was sent for a pending readiness scan request.',
          type: 'request_reminder',
          status: 'unread'
        };

        return this.safeCreateNotification(context.token, notificationPayload).pipe(
          switchMap(() =>
            this.logActivityEvent(context, 'scan_request_reminded', requestId, null).pipe(
              map(() => ({
                ok: false,
                configured: false,
                message: 'Reminder workflow is not configured yet.'
              } satisfies RequestActionResult))
            )
          ),
          catchError((error) => {
            console.error('[OperationsWorkflows] remind request failed', error);
            return throwError(() => error);
          })
        );
      })
    );
  }

  duplicateRequest(row: RequestRow): Observable<void> {
    return this.createScanRequest({
      target_member: row.target_member_id,
      department: row.department_id,
      request_type: row.request_type,
      status: row.status,
      due_at: row.due_at
    });
  }

  requestAllMissing(rows: ComplianceWorkerRow[], departmentId: string | null, shiftTemplateId: string | null): Observable<void> {
    const targets = rows.filter((row) => row.missing_today || row.overdue_requests > 0);
    if (!targets.length) {
      return of(void 0);
    }

    return forkJoin(
      targets.map((row) =>
        this.createScanRequest({
          target_member: row.member_id,
          department: departmentId ?? row.department_id,
          request_type: 'reminder',
          status: 'pending'
        }).pipe(catchError(() => of(void 0)))
      )
    ).pipe(map(() => void 0));
  }

  queueComplianceExport(filters: {
    department?: string | null;
    shift_template?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  }): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.post(
          `${this.api}/items/reports_exports`,
          {
            business_profile: context.businessProfileId,
            user: context.company.userId,
            format: 'csv',
            status: 'pending',
            filters: {
              export_type: 'compliance',
              department: filters.department ?? null,
              shift_template: filters.shift_template ?? null,
              status: filters.status ?? null,
              start_date: filters.start_date ?? null,
              end_date: filters.end_date ?? null
            }
          },
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(map(() => void 0))
      )
    );
  }

  updateAlert(alertId: string, input: AlertActionInput): Observable<Record<string, unknown> | null> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.http.patch<{ data?: Record<string, unknown> }>(
          `${this.api}/items/alerts/${encodeURIComponent(alertId)}?fields=id,status,reviewed_by,reviewed_at,action_note,action_type`,
          input,
          { headers: this.headers(context.token), withCredentials: true }
        ).pipe(map((response) => response.data ?? null))
      )
    );
  }

  markAlertReviewed(alertId: string): Observable<void> {
    return this.ensureScopedContext().pipe(
      switchMap((context) =>
        this.updateAlert(alertId, {
          reviewed_at: new Date().toISOString(),
          reviewed_by: context.company.userId
        }).pipe(map(() => void 0))
      )
    );
  }

  private loadDepartmentsForRequests(context: ScopedContext): Observable<DepartmentRecord[]> {
    const richFields = ['id', 'name'];
    const fallbackFields = ['id', 'name'];
    const options = {
      filters: [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
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
    const richFields = [
      'id',
      'status',
      'member_role',
      'department',
      'user.id',
      'user.email',
      'user.first_name',
      'user.last_name'
    ];
    const fallbackFields = ['id', 'status', 'member_role', 'department', 'user'];

    return this.queryItemsStrict<MemberRecord>(
      'business_profile_members',
      richFields,
      context.token,
      {
        filters: [...this.scopeFilters(context, ['business_profile'], ['department']), { path: ['status'], operator: '_eq', value: 'active' }],
        sort: '-id',
        limit: 500
      }
    ).pipe(
      catchError((error) => {
        if (this.isFieldCompatibilityError(error)) {
          console.warn('[OperationsWorkflows] members query fallback without nested user fields', error);
          return this.queryItemsStrict<MemberRecord>(
            'business_profile_members',
            fallbackFields,
            context.token,
            {
              filters: [...this.scopeFilters(context, ['business_profile'], ['department']), { path: ['status'], operator: '_eq', value: 'active' }],
              sort: '-id',
              limit: 500
            }
          );
        }
        console.error('[OperationsWorkflows] members query failed', error);
        return throwError(() => error);
      })
    );
  }

  private loadScanRequestsForPage(context: ScopedContext): Observable<ScanRequestRecord[]> {
    const filterVariants: Array<Array<{ path: string[]; operator: string; value: string }>> = [
      [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }],
      [{ path: ['business_profile', 'id'], operator: '_eq', value: context.businessProfileId }]
    ];
    const sortVariants = ['-timestamp', '-id'];
    const expandedFields = [
      'id',
      'business_profile',
      'scan_id',
      'required_state',
      'response_status',
      'response_payload',
      'timestamp',
      'requested_for_user',
      'requested_for_email',
      'requested_for_phone',
      'Target'
    ];
    const baseFields = [
      'id',
      'business_profile',
      'scan_id',
      'required_state',
      'response_status',
      'timestamp',
      'requested_for_user',
      'requested_for_email',
      'requested_for_phone',
      'Target'
    ];
    const fieldVariants: string[][] = [expandedFields, baseFields];
    let failureLogged = false;

    const buildQueryUrl = (
      fields: string[],
      sort: string,
      filters: Array<{ path: string[]; operator: string; value: string }>
    ): string => {
      const params = new URLSearchParams({
        fields: fields.join(','),
        sort,
        limit: '1000'
      });
      for (const filter of filters) {
        this.setFilter(params, filter.path, filter.operator, filter.value);
      }
      return `${this.api}/items/requests?${params.toString()}`;
    };

    const run = (
      fields: string[],
      sort: string,
      filters: Array<{ path: string[]; operator: string; value: string }>
    ): Observable<ScanRequestRecord[]> => {
      const url = buildQueryUrl(fields, sort, filters);
      return this.http.get<{ data?: ScanRequestRecord[] }>(
        url,
        { headers: this.headers(context.token), withCredentials: true }
      ).pipe(
        timeout(25000),
        map((response) => (response.data ?? []).map((row) => this.normalizeRequestRecord(row))),
        catchError((error) => {
          const status = (error as { status?: number } | null)?.status ?? 0;
          if ((status === 403 || status === 400) && !failureLogged) {
            failureLogged = true;
            console.error('[OperationsWorkflows] requests failing request', {
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
    ): Observable<ScanRequestRecord[]> => {
      if (sortIndex >= sortVariants.length) {
        return throwError(() => new Error('Scan requests could not be loaded.'));
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
    ): Observable<ScanRequestRecord[]> => {
      if (fieldIndex >= fieldVariants.length) {
        return throwError(() => new Error('Scan requests could not be loaded.'));
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

    const tryFilters = (index = 0): Observable<ScanRequestRecord[]> => {
      if (index >= filterVariants.length) {
        return throwError(() => new Error('Scan requests could not be loaded.'));
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

    if (context.activeRole === 'employee' && context.userId) {
      const userId = context.userId;
      const withRequestedForUserFilterVariants = filterVariants.map((base) => [
        ...base,
        { path: ['requested_for_user'], operator: '_eq', value: userId }
      ]);

      const tryFilterSet = (sets: Array<Array<{ path: string[]; operator: string; value: string }>>, index = 0): Observable<ScanRequestRecord[]> => {
        if (index >= sets.length) {
          return throwError(() => new Error('Scan requests could not be loaded.'));
        }
        return tryFields(sets[index]).pipe(
          catchError((error) => {
            if (!this.isFieldCompatibilityError(error)) {
              return throwError(() => error);
            }
            return tryFilterSet(sets, index + 1);
          })
        );
      };

      return tryFilterSet(withRequestedForUserFilterVariants).pipe(timeout(25000));
    }

    return tryFilters().pipe(timeout(25000));
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
    const baseFilterVariants: Array<Array<{ path: string[]; operator: string; value: string }>> = [
      [{ path: ['business_profile'], operator: '_eq', value: context.businessProfileId }]
    ];
    const filterVariants = context.activeRole === 'manager' && context.activeDepartmentId
      ? baseFilterVariants.flatMap((base) => ([
          [...base, { path: ['department'], operator: '_eq', value: context.activeDepartmentId as string }],
          base
        ]))
      : baseFilterVariants;

    const sortVariants = ['-date_created', '-id'];
    const baseFields = [
      'id',
      'date_created',
      'business_profile',
      'department',
      'target_member',
      'target_user',
      'scan',
      'severity',
      'title',
      'message',
      'body',
      'summary',
      'status',
      'reviewed_by',
      'reviewed_at',
      'action_note',
      'action_type',
      'recommended_action',
      'explanation',
      'readiness_label',
      'risk_label'
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
    const fieldVariants: string[][] = [expandedFields, baseFields];
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
          if (status === 403) {
            return of([] as AlertRecord[]);
          }
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

  private buildAlertsPageData(
    departments: DepartmentRecord[],
    alerts: AlertRecord[],
    notifications: NotificationRecord[]
  ): AlertsPageData {
    const notificationCountByLink = this.notificationCounts(notifications);

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
        department_id: this.normalizeId(alert.department) ?? this.normalizeId(targetMemberDepartment),
        department_name: formatDepartment(alert.department ?? targetMemberDepartment, 'Unassigned'),
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
        open: rows.filter((row) => this.normalizeText(row.status) === 'new').length,
        reviewed: rows.filter((row) => this.normalizeText(row.status) === 'reviewed').length,
        escalated: rows.filter((row) => this.normalizeText(row.action_type) === 'escalated').length
      }
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
        'recommended_action',
        'explanation',
        'readiness_label',
        'risk_label',
        'message',
        'body',
        'summary',
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
        'recommended_action',
        'explanation',
        'message',
        'body',
        'summary',
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

  private postWithFallback(
    collection: string,
    token: string,
    payloads: Array<Record<string, unknown>>
  ): Observable<Record<string, unknown> | null> {
    const validPayloads = payloads.filter((payload) => Boolean(payload && Object.keys(payload).length));
    if (!validPayloads.length) {
      return of(null);
    }

    const [first, ...rest] = validPayloads;
    return this.http.post<{ data?: Record<string, unknown> }>(
      `${this.api}/items/${collection}`,
      first,
      { headers: this.headers(token), withCredentials: true }
    ).pipe(
      map((response) => response.data ?? null),
      catchError((error) => {
        if (!rest.length || !this.isFieldCompatibilityError(error)) {
          return throwError(() => error);
        }
        return this.postWithFallback(collection, token, rest);
      })
    );
  }

  private patchWithFallback(
    collection: string,
    itemId: string,
    token: string,
    payloads: Array<Record<string, unknown>>
  ): Observable<Record<string, unknown> | null> {
    const validPayloads = payloads.filter((payload) => Boolean(payload && Object.keys(payload).length));
    if (!validPayloads.length) {
      return of(null);
    }

    const [first, ...rest] = validPayloads;
    return this.http.patch<{ data?: Record<string, unknown> }>(
      `${this.api}/items/${collection}/${encodeURIComponent(itemId)}`,
      first,
      { headers: this.headers(token), withCredentials: true }
    ).pipe(
      map((response) => response.data ?? null),
      catchError((error) => {
        if (!rest.length || !this.isFieldCompatibilityError(error)) {
          return throwError(() => error);
        }
        return this.patchWithFallback(collection, itemId, token, rest);
      })
    );
  }

  private safeCreateNotification(token: string, payload: Record<string, unknown>): Observable<void> {
    // TODO(push): when Firebase/FCM is configured, extend this flow to enqueue mobile push delivery
    // from backend notification records. Do not send push directly from web clients.
    return this.postWithFallback('notifications', token, [payload]).pipe(
      map(() => void 0),
      catchError((error) => {
        console.warn('[OperationsWorkflows] notification create skipped', error);
        return of(void 0);
      })
    );
  }

  private logActivityEvent(
    context: ScopedContext,
    action: string,
    entityId: string | null,
    meta: Record<string, unknown> | null
  ): Observable<void> {
    const payload = {
      action,
      entity_type: 'scan_request',
      entity_id: entityId,
      actor: context.userId ?? null,
      business_profile: context.businessProfileId,
      department: context.activeDepartmentId ?? null,
      meta: meta ?? null
    };

    return this.postWithFallback('activity_events', context.token, [payload]).pipe(
      map(() => void 0),
      catchError((error) => {
        console.warn('[OperationsWorkflows] activity log skipped', error);
        return of(void 0);
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

    return this.loadScanRequestsForPage(context).pipe(
      map((requests) => {
        const blockedMemberIds = new Set(
          (requests ?? [])
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

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
