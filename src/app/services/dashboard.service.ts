import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
  formatBusinessProfile,
  formatDepartment,
  formatUserName,
  isUuid,
  sanitizeDisplayValue
} from '../shared/utils/display-formatters';

import { type ActiveMemberRole } from '../ia/wellar-ia';
import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { BusinessCenterService, type BusinessProfile } from './business-center.service';

export type ScanResult = {
  id?: string;
  date_created: string | number | Date;
  scan_id: string | null;
  risk_level?: string | null;
  readiness_score?: number | string | null;
  readiness_summary?: string | null;
  operational_summary?: string | null;
  recommended_action?: string | null;
  explanation?: string | null;
  task_performance_score?: number | string | null;
  confidence?: number | string | null;
  suggested_action?: string | null;
  overall_state?: string;
  overall_state_label?: string;
  overall_state_key?: 'stable' | 'low_focus' | 'fatigue' | 'high_risk' | 'unknown';
};

export type ScanResultsAccessInfo = {
  state: 'available' | 'permission_blocked' | 'degraded';
  message: string | null;
  missingFields: string[];
};

export type DashboardStats = {
  stable: number;
  low_focus: number;
  fatigue: number;
  high_risk: number;
};

export type DashboardSnapshot = {
  scans: ScanResult[];
  stats: DashboardStats;
  latest: ScanResult | null;
  resultsAccess: ScanResultsAccessInfo;
};

export type DashboardMetricCount = {
  label: string;
  value: string;
  count: number;
};

export type DashboardCompanySummary = {
  businessProfileId: string;
  companyName: string;
  accessLabel: string | null;
  billingStatus: string | null;
  activeRole: ActiveMemberRole;
  teamMemberCount: number;
  shiftTemplateCount: number;
};

export type DashboardScopeIndicator = {
  isDepartmentScoped: boolean;
  departmentId: string | null;
  departmentName: string | null;
  label: string;
  description: string;
};

export type DashboardComplianceToday = {
  requestsToday: number;
  completedScansToday: number;
  pendingRequestsToday: number;
  completionRate: number | null;
  activeShiftTemplates: number;
};

export type DashboardAlertPreview = {
  id: string;
  status: string;
  actionType: string;
  title: string;
  description: string;
  dateCreated: string | null;
};

export type DashboardOpenAlertsSummary = {
  total: number;
  openCount: number;
  byStatus: DashboardMetricCount[];
  byActionType: DashboardMetricCount[];
  recent: DashboardAlertPreview[];
};

export type DashboardPendingRequestPreview = {
  id: string;
  target: string;
  requestType: string;
  status: string;
  timestamp: string | null;
};

export type DashboardPendingRequestsSummary = {
  total: number;
  pendingCount: number;
  byRequestType: DashboardMetricCount[];
  recent: DashboardPendingRequestPreview[];
};

export type DashboardAttentionItem = {
  id: string;
  kind: 'alert' | 'scan' | 'request';
  title: string;
  subtitle: string;
  status: string | null;
  risk: string | null;
  timestamp: string | null;
  route: string;
};

export type DashboardActivityPreview = {
  id: string;
  action: string;
  entityType: string;
  actorLabel: string;
  targetLabel: string;
  dateCreated: string | null;
};

export type DashboardNotificationPreview = {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  dateCreated: string | null;
  route: string;
};

export type OperationalDashboardSummary = {
  company: DashboardCompanySummary;
  scope: DashboardScopeIndicator;
  complianceToday: DashboardComplianceToday;
  readinessDistribution: Array<{
    key: NonNullable<ScanResult['overall_state_key']>;
    label: string;
    count: number;
  }>;
  openAlertsSummary: DashboardOpenAlertsSummary;
  pendingRequestsSummary: DashboardPendingRequestsSummary;
  needsAttention: DashboardAttentionItem[];
  recentActivity: DashboardActivityPreview[];
  notifications: DashboardNotificationPreview[];
  hasData: boolean;
  generatedAt: string;
};

type ScopedRequestRecord = {
  id?: string | number;
  business_profile?: string | number | Record<string, unknown>;
  department?: string | number | Record<string, unknown>;
  requested_by_user?: string | number | Record<string, unknown> | null;
  target_member?: string | number | Record<string, unknown> | null;
  request_type?: string | null;
  status?: string | null;
  cancelled?: string | null;
  requested_at?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  completed_scan?: string | number | Record<string, unknown> | null;
  date_created?: string | null;
  scan_id?: string | number | Record<string, unknown> | null;
  required_state?: string | null;
  response_status?: string | null;
  response_payload?: unknown;
  timestamp?: string | null;
  requested_for_user?: string | number | Record<string, unknown> | null;
  requested_for_email?: string | null;
  requested_for_phone?: string | null;
  Target?: string | null;
};

type WellnessScanRecord = {
  id?: string | number;
  business_profile?: string | number | Record<string, unknown> | null;
  member?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
  request_source?: string | number | Record<string, unknown> | null;
  device_platform?: string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  consent_granted?: boolean | null;
  device_info?: unknown;
  environment_info?: unknown;
  date_created?: string | null;
  date_updated?: string | null;
  task_metrics?: unknown;
  failure_reason?: string | null;
  department_name_snapshot?: string | null;
  member_role_snapshot?: string | null;
  shift_template_name_snapshot?: string | null;
};

type AlertRecord = {
  id?: string | number;
  date_created?: string | null;
  business_profile?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
  target_member?: string | number | Record<string, unknown> | null;
  target_user?: string | number | Record<string, unknown> | null;
  scan?: string | number | Record<string, unknown> | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  status?: string | null;
  reviewed_by?: string | number | Record<string, unknown> | null;
  reviewed_at?: string | null;
  action_note?: string | null;
  action_type?: string | null;
  description?: string | null;
};

type ActivityRecord = {
  id?: string | number;
  date_created?: string | null;
  actor?: string | number | Record<string, unknown> | null;
  target_user?: string | number | Record<string, unknown> | null;
  action?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: unknown;
  business_profile?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
};

type NotificationRecord = {
  id?: string | number;
  date_created?: string | null;
  user?: string | number | Record<string, unknown> | null;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  status?: string | null;
  link_type?: string | null;
  link_id?: string | number | null;
  meta?: unknown;
  business_profile?: string | number | Record<string, unknown> | null;
  read_at?: string | null;
};

type ShiftTemplateRecord = {
  id?: string | number;
  date_created?: string | null;
  date_updated?: string | null;
  business_profile?: string | number | Record<string, unknown> | null;
  name?: string | null;
  start_time?: string | null;
  scan_window_start_minutes?: number | null;
  scan_window_end_minutes?: number | null;
  is_active?: boolean | null;
};

type DepartmentRecord = {
  id?: string | number;
  date_created?: string | null;
  date_updated?: string | null;
  business_profile?: string | number | Record<string, unknown> | null;
  name?: string | null;
  manager_member?: string | number | Record<string, unknown> | null;
  is_active?: boolean | null;
};

type BusinessProfileMemberRecord = {
  id?: string | number;
  status?: string | null;
  user?: string | number | Record<string, unknown> | null;
  business_profile?: string | number | Record<string, unknown> | null;
  member_role?: string | null;
  department?: string | number | Record<string, unknown> | null;
  shift_template?: string | number | Record<string, unknown> | null;
  employee_code?: string | null;
  job_title?: string | null;
  joined_at?: string | null;
  deactivated_at?: string | null;
  last_scan_at?: string | null;
  last_readiness_score?: number | string | null;
  last_risk_level?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
};

type QueryConfig = {
  collection: string;
  fields: string[];
  limit: number;
  sort?: string;
  businessProfileId?: string;
  businessFilterPath?: string[];
  extraFilters?: Array<{ path: string[]; operator: string; value: string }>;
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private static readonly stateKeys = {
    stable: 'stable',
    lowFocus: 'low_focus',
    fatigue: 'fatigue',
    highRisk: 'high_risk',
    unknown: 'unknown'
  } as const;

  private static readonly displayStates = {
    stable: 'Stable',
    low: 'Low Focus',
    fatigue: 'Elevated Fatigue',
    risk: 'High Risk'
  } as const;

  private readonly api = environment.API_URL;
  private readonly alertClosedStatuses = new Set(['closed', 'resolved', 'dismissed', 'completed']);
  private readonly scanResultsAccessSubject = new BehaviorSubject<ScanResultsAccessInfo>({
    state: 'available',
    message: null,
    missingFields: []
  });
  private readonly scanResultsFieldVariants: string[][] = [
    [
      'id',
      'scan_id',
      'date_created',
      'risk_level',
      'readiness_score',
      'confidence',
      'task_performance_score',
      'readiness_summary',
      'operational_summary',
      'recommended_action',
      'explanation',
      'suggested_action'
    ],
    [
      'id',
      'scan_id',
      'date_created',
      'risk_level',
      'readiness_score',
      'confidence',
      'task_performance_score',
      'explanation',
      'suggested_action'
    ],
    [
      'id',
      'scan_id',
      'date_created',
      'risk_level',
      'readiness_score',
      'confidence',
      'explanation'
    ],
    ['id', 'scan_id', 'date_created', 'risk_level']
  ];

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private businessCenter: BusinessCenterService,
    private companyContext: CompanyContextService
  ) {}

  getDashboardSnapshot(limit = 20): Observable<DashboardSnapshot> {
    return this.getRecentScans(limit).pipe(
      map((scans) => ({
        scans,
        stats: this.buildStats(scans),
        latest: scans[0] ?? null,
        resultsAccess: this.scanResultsAccessSubject.value
      }))
    );
  }

  getRecentScans(limit = 20): Observable<ScanResult[]> {
    return this.companyContext.ensureLoaded().pipe(
      switchMap((state) => {
        const profileId = state.context.activeBusinessProfileId;
        const role = state.context.activeMemberRole;
        const departmentId = role === 'manager' ? state.context.activeDepartmentId : null;
        const token = this.auth.getStoredAccessToken() ?? '';

        if (!profileId || !role) {
          return of([] as ScanResult[]);
        }

        return this.fetchWellnessScans(profileId, role, departmentId, token, limit).pipe(
          switchMap((wellnessScans) => this.fetchScanResultsForScans(wellnessScans, token)),
          map((rows) => this.normalizeScans(rows))
        );
      }),
      catchError((error) => {
        console.warn('[dashboard] recent scans failed', error);
        return of([]);
      })
    );
  }

  getScanResults(limit = 20): Observable<ScanResult[]> {
    return this.getRecentScans(limit);
  }

  getScanResultsAccessInfo(): Observable<ScanResultsAccessInfo> {
    return this.scanResultsAccessSubject.asObservable();
  }

  getOperationalDashboardSummary(): Observable<OperationalDashboardSummary> {
    return forkJoin({
      contextState: this.companyContext.ensureLoaded(),
      hubState: this.businessCenter.getHubAccessState()
    }).pipe(
      switchMap(({ contextState, hubState }) => {
        const token = this.auth.getStoredAccessToken() ?? '';
        const context = contextState.context;
        const businessProfileId = context.activeBusinessProfileId;
        const activeRole = context.activeMemberRole;
        const activeDepartmentId = activeRole === 'manager' ? context.activeDepartmentId : null;
        const userId = context.userId;

        if (!businessProfileId || !activeRole) {
          return throwError(() => new Error('Active company context is missing.'));
        }

        console.info('[dashboard] active business profile filter', {
          businessProfileId,
          activeRole,
          activeDepartmentId,
          companyName: context.activeBusinessProfileName ?? null
        });

        const summaryRequests$ = forkJoin({
          requestsRecent: this.fetchRequests(businessProfileId, activeRole, activeDepartmentId, token, 80),
          wellnessRecent: this.fetchWellnessScans(businessProfileId, activeRole, activeDepartmentId, token, 200),
          alertsRecent: this.fetchAlerts(businessProfileId, activeRole, activeDepartmentId, token, 80),
          shiftTemplates: this.fetchShiftTemplates(businessProfileId, activeRole, activeDepartmentId, token, 50),
          activityRecent: this.fetchActivity(businessProfileId, activeRole, activeDepartmentId, token, 6),
          notificationsRecent: userId
            ? this.fetchNotifications(userId, businessProfileId, activeRole, activeDepartmentId, token, 6)
            : of([] as NotificationRecord[]),
          teamMembers: this.fetchBusinessProfileMembers(businessProfileId, token, 250),
          departments: this.fetchDepartments(businessProfileId, token, 120)
        });

        return summaryRequests$.pipe(
          switchMap((payload) =>
            this.fetchScanResultsForScans(payload.wellnessRecent, token).pipe(
              map((scanResultsRecent) =>
                this.buildOperationalSummary(hubState, activeRole, context, {
                  ...payload,
                  scanResultsRecent
                })
              )
            )
          ),
          catchError((error) => throwError(() => new Error(this.describeHttpError(error, 'Failed to load dashboard data.'))))
        );
      })
    );
  }

  private fetchRequests(
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number,
    extraFilters: Array<{ path: string[]; operator: string; value: string }> = []
  ): Observable<ScopedRequestRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<ScopedRequestRecord>({
      collection: 'requests',
      fields: [
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
      limit,
      sort: '-timestamp',
      businessProfileId,
      businessFilterPath: ['business_profile'],
      extraFilters
    }, token).pipe(
      map((rows) => rows.map((row) => this.normalizeRequestRecord(row)))
    );
  }

  private normalizeRequestRecord(request: ScopedRequestRecord): ScopedRequestRecord {
    const responsePayload = request.response_payload && typeof request.response_payload === 'object'
      ? request.response_payload as Record<string, unknown>
      : null;
    const timestamp = request.timestamp ?? request.requested_at ?? request.date_created ?? null;
    const status = this.pickString(request.response_status ?? request.status) ?? 'pending';
    const requestType = this.pickString(request.required_state ?? request.request_type ?? null);
    const completedScan = this.normalizeId(request.scan_id ?? request.completed_scan);
    return {
      ...request,
      target_member: request.target_member ?? request.requested_for_user ?? null,
      requested_by_user: request.requested_by_user ?? null,
      request_type: requestType,
      status,
      cancelled: request.cancelled ?? (this.normalizeText(status) === 'cancelled' ? 'cancelled' : null),
      requested_at: timestamp,
      completed_scan: request.completed_scan ?? completedScan,
      completed_at: request.completed_at ?? this.pickString(responsePayload?.['completed_at']) ?? null,
      due_at: request.due_at ?? this.pickString(responsePayload?.['due_at']) ?? null,
      scan_id: request.scan_id ?? completedScan,
      required_state: request.required_state ?? requestType,
      response_status: request.response_status ?? status,
      response_payload: request.response_payload ?? responsePayload,
      timestamp,
      requested_for_user: request.requested_for_user ?? request.target_member ?? null,
      requested_for_email: request.requested_for_email ?? this.pickString(responsePayload?.['requested_for_email']) ?? null,
      requested_for_phone: request.requested_for_phone ?? this.pickString(responsePayload?.['requested_for_phone']) ?? null,
      Target: request.Target ?? this.pickString(responsePayload?.['Target']) ?? null
    };
  }

  private fetchWellnessScans(
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number
  ): Observable<WellnessScanRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<WellnessScanRecord>({
      collection: 'wellness_scans',
      fields: [
        'id',
        'status',
        'date_updated',
        'user',
        'started_at',
        'completed_at',
        'consent_granted',
        'device_info',
        'environment_info',
        'date_created',
        'task_metrics',
        'business_profile',
        'member',
        'department',
        'request_source',
        'device_platform',
        'failure_reason',
        'department_name_snapshot',
        'member_role_snapshot',
        'shift_template_name_snapshot'
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private fetchScanResultsForScans(wellnessScans: WellnessScanRecord[], token: string): Observable<ScanResult[]> {
    const scanIds = this.uniqueScanIds(wellnessScans);
    if (!scanIds.length) {
      this.updateScanResultsAccess({
        state: 'available',
        message: null,
        missingFields: []
      });
      return of([]);
    }

    return of(null).pipe(
      switchMap(() => this.loadScanResultsForScans(scanIds, token)),
      map((rows) => this.normalizeScans(rows))
    );
  }

  private async loadScanResultsForScans(scanIds: string[], token: string): Promise<ScanResult[]> {
    const missingFields = new Set<string>();
    console.info('[SCAN_RESULTS_FETCH_START]', {
      scanCount: scanIds.length,
      fields: this.scanResultsFieldVariants[0].join(',')
    });

    for (let index = 0; index < this.scanResultsFieldVariants.length; index += 1) {
      const fields = this.scanResultsFieldVariants[index];

      try {
        const rows = await firstValueFrom(this.queryItemsStrict<ScanResult>({
          collection: 'scan_results',
          fields,
          limit: scanIds.length,
          sort: '-date_created',
          extraFilters: [{ path: ['scan_id'], operator: '_in', value: scanIds.join(',') }]
        }, token).pipe(timeout(15000)));

        const degradedFields = Array.from(missingFields);
        if (degradedFields.length) {
          console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
            reason: 'optional_fields_unavailable',
            missingFields: degradedFields
          });
        }

        this.updateScanResultsAccess({
          state: degradedFields.length ? 'degraded' : 'available',
          message: degradedFields.length ? 'Some scan result enrichment fields are unavailable.' : null,
          missingFields: degradedFields
        });
        console.info('[SCAN_RESULTS_FETCH_SUCCESS]', {
          scanCount: scanIds.length,
          resultCount: rows.length,
          fields: fields.join(',')
        });
        return rows;
      } catch (error) {
        const status = this.httpStatus(error);

        if (status === 401 || status === 403) {
          console.warn('[SCAN_RESULTS_PERMISSION_BLOCKED]', {
            status,
            fields: fields.join(',')
          });
          this.updateScanResultsAccess({
            state: 'permission_blocked',
            message: 'Result data is unavailable due to permissions',
            missingFields: []
          });
          return [];
        }

        if (this.isFieldCompatibilityError(error)) {
          const nextFields = this.scanResultsFieldVariants[index + 1] ?? [];
          const removedFields = fields.filter((field) => !nextFields.includes(field));
          removedFields.forEach((field) => missingFields.add(field));
          console.warn('[SCAN_RESULTS_FIELD_MISSING]', {
            status,
            fields: fields.join(','),
            removedFields: removedFields.join(','),
            message: this.httpMessage(error)
          });
          continue;
        }

        console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
          status,
          fields: fields.join(','),
          message: this.httpMessage(error)
        });
        this.updateScanResultsAccess({
          state: 'degraded',
          message: 'Some scan result enrichment fields are unavailable.',
          missingFields: Array.from(missingFields)
        });
        return [];
      }
    }

    console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
      reason: 'no_compatible_field_set',
      missingFields: Array.from(missingFields)
    });
    this.updateScanResultsAccess({
      state: 'degraded',
      message: 'Some scan result enrichment fields are unavailable.',
      missingFields: Array.from(missingFields)
    });
    return [];
  }

  private fetchAlerts(
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number
  ): Observable<AlertRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<AlertRecord>({
      collection: 'alerts',
      fields: [
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
        'status',
        'reviewed_by',
        'reviewed_at',
        'action_note',
        'action_type'
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private fetchActivity(
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number
  ): Observable<ActivityRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<ActivityRecord>({
      collection: 'activity_events',
      fields: [
        'id',
        'date_created',
        'actor',
        'target_user',
        'action',
        'entity_type',
        'entity_id',
        'payload',
        'business_profile',
        'department'
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private fetchNotifications(
    userId: string,
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number
  ): Observable<NotificationRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<NotificationRecord>({
      collection: 'notifications',
      fields: [
        'id',
        'date_created',
        'user',
        'title',
        'body',
        'type',
        'status',
        'link_id',
        'meta',
        'business_profile',
        'read_at',
        'link_type'
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile'],
      extraFilters: [{ path: ['user'], operator: '_eq', value: userId }]
    }, token);
  }

  private fetchShiftTemplates(
    businessProfileId: string,
    activeRole: ActiveMemberRole,
    activeDepartmentId: string | null,
    token: string,
    limit: number
  ): Observable<ShiftTemplateRecord[]> {
    void activeRole;
    void activeDepartmentId;
    return this.queryItems<ShiftTemplateRecord>({
      collection: 'shift_templates',
      fields: [
        'id',
        'date_created',
        'date_updated',
        'business_profile',
        'name',
        'start_time',
        'scan_window_start_minutes',
        'scan_window_end_minutes',
        'is_active'
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private fetchBusinessProfileMembers(
    businessProfileId: string,
    token: string,
    limit: number
  ): Observable<BusinessProfileMemberRecord[]> {
    return this.queryItems<BusinessProfileMemberRecord>({
      collection: 'business_profile_members',
      fields: [
        'id',
        'status',
        'user',
        'business_profile',
        'member_role',
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
      ],
      limit,
      sort: '-date_created',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private fetchDepartments(
    businessProfileId: string,
    token: string,
    limit: number
  ): Observable<DepartmentRecord[]> {
    return this.queryItems<DepartmentRecord>({
      collection: 'departments',
      fields: [
        'id',
        'date_created',
        'date_updated',
        'business_profile',
        'name',
        'manager_member',
        'is_active'
      ],
      limit,
      sort: 'name',
      businessProfileId,
      businessFilterPath: ['business_profile']
    }, token);
  }

  private queryItems<T>(config: QueryConfig, token: string): Observable<T[]> {
    const params = new URLSearchParams({
      limit: String(config.limit),
      fields: config.fields.join(','),
      sort: config.sort ?? '-id'
    });

    if (config.businessProfileId && config.businessFilterPath?.length) {
      this.setFilter(params, config.businessFilterPath, '_eq', config.businessProfileId);
    }

    for (const filter of config.extraFilters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${config.collection}?${params.toString()}`,
      {
        headers: this.buildHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => response.data ?? []),
      timeout(15000),
      catchError((error) => {
        console.warn(`[dashboard] ${config.collection} query failed`, error);
        return of([] as T[]);
      })
    );
  }

  private queryItemsStrict<T>(config: QueryConfig, token: string): Observable<T[]> {
    const params = new URLSearchParams({
      limit: String(config.limit),
      fields: config.fields.join(','),
      sort: config.sort ?? '-id'
    });

    if (config.businessProfileId && config.businessFilterPath?.length) {
      this.setFilter(params, config.businessFilterPath, '_eq', config.businessProfileId);
    }

    for (const filter of config.extraFilters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${config.collection}?${params.toString()}`,
      {
        headers: this.buildHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => response.data ?? [])
    );
  }

  private buildOperationalSummary(
    hubState: { profile: BusinessProfile | null; hasPaidAccess: boolean },
    activeRole: ActiveMemberRole,
    context: {
      activeBusinessProfileId: string | null;
      activeBusinessProfileName: string | null;
      activeDepartmentId: string | null;
      activeDepartmentName: string | null;
    },
    payload: {
      requestsRecent: ScopedRequestRecord[];
      wellnessRecent: WellnessScanRecord[];
      scanResultsRecent: ScanResult[];
      alertsRecent: AlertRecord[];
      shiftTemplates: ShiftTemplateRecord[];
      activityRecent: ActivityRecord[];
      notificationsRecent: NotificationRecord[];
      teamMembers: Array<unknown>;
      departments: Array<unknown>;
    }
  ): OperationalDashboardSummary {
    const profile = hubState.profile;
    const requestsRecent = payload.requestsRecent ?? [];
    const wellnessRecent = payload.wellnessRecent ?? [];
    const resultsRecent = payload.scanResultsRecent ?? [];
    const alertsRecent = payload.alertsRecent ?? [];
    const shiftTemplates = payload.shiftTemplates ?? [];
    const activityRecent = payload.activityRecent ?? [];
    const notificationsRecent = payload.notificationsRecent ?? [];
    const todayStart = this.startOfDayIso();
    const requestsToday = requestsRecent.filter((request) => this.toTimestamp(request.requested_at) >= this.toTimestamp(todayStart));
    const wellnessToday = wellnessRecent.filter((scan) => this.toTimestamp(scan.date_created) >= this.toTimestamp(todayStart));

    const pendingRequests = requestsRecent.filter((request) => this.isPendingRequestStatus(request.status));
    const openAlerts = alertsRecent.filter((alert) => this.isOpenAlertStatus(alert.status));
    const readinessDistribution = this.buildReadinessDistribution(resultsRecent);

    const complianceToday: DashboardComplianceToday = {
      requestsToday: requestsToday.length,
      completedScansToday: wellnessToday.length,
      pendingRequestsToday: requestsToday.filter((request) => this.isPendingRequestStatus(request.status)).length,
      completionRate: requestsToday.length ? Math.round((wellnessToday.length / requestsToday.length) * 100) : null,
      activeShiftTemplates: shiftTemplates.filter((item) => item.is_active !== false).length
    };

    const openAlertsSummary: DashboardOpenAlertsSummary = {
      total: alertsRecent.length,
      openCount: openAlerts.length,
      byStatus: this.buildMetricCounts(alertsRecent.map((alert) => alert.status), 'Unknown status'),
      byActionType: this.buildMetricCounts(alertsRecent.map((alert) => alert.action_type), 'Unspecified action'),
      recent: alertsRecent.slice(0, 5).map((alert) => ({
        id: this.normalizeId(alert.id) ?? 'alert',
        status: alert.status?.trim() || 'Unknown',
        actionType: alert.action_type?.trim() || 'Unspecified',
        title: alert.title?.trim() || alert.action_type?.trim() || 'Alert',
        description: alert.description?.trim() || alert.message?.trim() || 'Operational alert recorded.',
        dateCreated: alert.date_created ?? null
      }))
    };

    const pendingRequestsSummary: DashboardPendingRequestsSummary = {
      total: requestsRecent.length,
      pendingCount: pendingRequests.length,
      byRequestType: this.buildMetricCounts(
        pendingRequests.map((request) => request.request_type),
        'Unspecified type'
      ),
      recent: pendingRequests.slice(0, 5).map((request) => ({
        id: this.normalizeId(request.id) ?? 'request',
        target:
          this.pickString(
            request.Target ??
            request.requested_for_email ??
            (typeof request.target_member === 'object' && request.target_member
              ? (request.target_member as Record<string, unknown>)['email']
              : null)
          )?.trim() ||
          'Pending request',
        requestType: request.request_type?.trim() || 'Unspecified type',
        status: request.status?.trim() || 'Unknown',
        timestamp: request.requested_at ?? request.timestamp ?? null
      }))
    };

    const needsAttention = this.buildNeedsAttention(openAlerts, resultsRecent, pendingRequests);
    const recentActivity = activityRecent.slice(0, 5).map((item) => ({
      id: this.normalizeId(item.id) ?? 'activity',
      action: item.action?.trim() || 'activity_recorded',
      entityType: item.entity_type?.trim() || 'record',
      actorLabel: this.resolveRecordLabel(item.actor) || 'System',
      targetLabel: this.resolveRecordLabel(item.target_user) || 'Scope target',
      dateCreated: item.date_created ?? null
    }));
    const notifications = notificationsRecent.slice(0, 5).map((item) => ({
      id: this.normalizeId(item.id) ?? 'notification',
      title: item.title?.trim() || 'Notification',
      body: item.body?.trim() || 'No notification body was provided.',
      type: item.type?.trim() || 'General',
      status: item.status?.trim() || 'Unknown',
      dateCreated: item.date_created ?? null,
      route: this.notificationRoute(item.link_type, item.link_id)
    }));

    const company: DashboardCompanySummary = {
      businessProfileId: context.activeBusinessProfileId ?? '',
      companyName:
        context.activeBusinessProfileName ||
        sanitizeDisplayValue(profile?.company_name, '') ||
        'Active company',
      accessLabel: this.resolveWorkspaceAccessLabel(profile, hubState.hasPaidAccess),
      billingStatus: profile?.billing_status?.trim() ?? null,
      activeRole,
      teamMemberCount: payload.teamMembers.length,
      shiftTemplateCount: shiftTemplates.length
    };

    const scope: DashboardScopeIndicator = {
      isDepartmentScoped: activeRole === 'manager',
      departmentId: activeRole === 'manager' ? context.activeDepartmentId : null,
      departmentName: activeRole === 'manager' ? context.activeDepartmentName : null,
      label: activeRole === 'manager' ? 'Department scope' : 'Company scope',
      description:
        activeRole === 'manager'
          ? `Dashboard data is limited to ${sanitizeDisplayValue(context.activeDepartmentName, 'the active department')}.`
          : 'Dashboard data is scoped to the active business profile.'
    };

    const hasData =
      readinessDistribution.some((item) => item.count > 0) ||
      requestsRecent.length > 0 ||
      wellnessRecent.length > 0 ||
      alertsRecent.length > 0 ||
      activityRecent.length > 0 ||
      notificationsRecent.length > 0 ||
      shiftTemplates.length > 0 ||
      payload.departments.length > 0 ||
      payload.teamMembers.length > 0;

    return {
      company,
      scope,
      complianceToday,
      readinessDistribution,
      openAlertsSummary,
      pendingRequestsSummary,
      needsAttention,
      recentActivity,
      notifications,
      hasData,
      generatedAt: new Date().toISOString()
    };
  }

  private buildNeedsAttention(
    openAlerts: AlertRecord[],
    results: ScanResult[],
    pendingRequests: ScopedRequestRecord[]
  ): DashboardAttentionItem[] {
    const alertItems = openAlerts.slice(0, 3).map((alert) => ({
      id: `alert-${this.normalizeId(alert.id) ?? 'item'}`,
      kind: 'alert' as const,
      title: alert.title?.trim() || alert.action_type?.trim() || 'Open alert',
      subtitle: alert.description?.trim() || alert.message?.trim() || 'Alert requires follow-up.',
      status: alert.status?.trim() || null,
      risk: null,
      timestamp: alert.date_created ?? null,
      route: '/app/alerts'
    }));

    const scanItems = results
      .filter((scan) => scan.overall_state_key === 'high_risk' || scan.overall_state_key === 'fatigue')
      .slice(0, 3)
      .map((scan) => ({
        id: `scan-${scan.id ?? scan.scan_id ?? 'item'}`,
        kind: 'scan' as const,
        title: scan.overall_state_label || 'Readiness review required',
        subtitle: scan.explanation?.trim() || 'Review the latest readiness result.',
        status: null,
        risk: scan.overall_state_label || scan.overall_state || null,
        timestamp: typeof scan.date_created === 'string' ? scan.date_created : new Date(scan.date_created).toISOString(),
        route: '/app/compliance'
      }));

    const requestItems = pendingRequests.slice(0, 2).map((request) => ({
      id: `request-${this.normalizeId(request.id) ?? 'item'}`,
      kind: 'request' as const,
      title:
        this.pickString(
          request.Target ??
          request.requested_for_email ??
          (typeof request.target_member === 'object' && request.target_member
            ? (request.target_member as Record<string, unknown>)['email']
            : null)
        )?.trim() ||
        'Pending request',
      subtitle: `Request type: ${request.request_type?.trim() || 'Unspecified'}`,
      status: request.status?.trim() || null,
      risk: request.request_type?.trim() || null,
      timestamp: request.requested_at ?? request.timestamp ?? null,
      route: '/app/scan-requests'
    }));

    return [...alertItems, ...scanItems, ...requestItems]
      .sort((left, right) => this.toTimestamp(right.timestamp) - this.toTimestamp(left.timestamp))
      .slice(0, 6);
  }

  private buildReadinessDistribution(results: ScanResult[]) {
    const stats = this.buildStats(results);
    return [
      { key: 'stable' as const, label: 'Stable', count: stats.stable },
      { key: 'low_focus' as const, label: 'Low Focus', count: stats.low_focus },
      { key: 'fatigue' as const, label: 'Elevated Fatigue', count: stats.fatigue },
      { key: 'high_risk' as const, label: 'High Risk', count: stats.high_risk }
    ];
  }

  private buildMetricCounts(values: Array<string | null | undefined>, fallbackLabel: string): DashboardMetricCount[] {
    const counts = new Map<string, DashboardMetricCount>();

    for (const value of values) {
      const label = value?.trim() || fallbackLabel;
      const key = label.toLowerCase();
      const current = counts.get(key);
      if (current) {
        current.count += 1;
        current.value = label;
        continue;
      }

      counts.set(key, {
        label,
        value: label,
        count: 1
      });
    }

    return Array.from(counts.values())
      .sort((left, right) => right.count - left.count)
      .slice(0, 4);
  }

  private buildStats(scans: ScanResult[]): DashboardStats {
    return {
      stable: scans.filter((scan) => scan.overall_state_key === DashboardService.stateKeys.stable).length,
      low_focus: scans.filter((scan) => scan.overall_state_key === DashboardService.stateKeys.lowFocus).length,
      fatigue: scans.filter((scan) => scan.overall_state_key === DashboardService.stateKeys.fatigue).length,
      high_risk: scans.filter((scan) => scan.overall_state_key === DashboardService.stateKeys.highRisk).length
    };
  }

  private normalizeScans(scans: ScanResult[]): ScanResult[] {
    return scans.map((scan) => ({
      ...scan,
      overall_state: scan.risk_level ?? scan.overall_state,
      overall_state_key: this.toStateKey(scan.risk_level ?? scan.overall_state),
      overall_state_label: this.toDisplayState(scan.risk_level ?? scan.overall_state)
    }));
  }

  private updateScanResultsAccess(access: ScanResultsAccessInfo): void {
    this.scanResultsAccessSubject.next(access);
  }

  private uniqueScanIds(scans: WellnessScanRecord[]): string[] {
    const ids = new Set<string>();
    for (const scan of scans ?? []) {
      const id = this.normalizeId(scan.id);
      if (id) {
        ids.add(id);
      }
    }
    return Array.from(ids.values());
  }

  private describeHttpError(error: unknown, fallback: string): string {
    const response = error as { status?: number; message?: string; error?: { message?: string; errors?: Array<{ message?: string }> } };
    const status = typeof response?.status === 'number' ? response.status : null;
    const nestedMessage = response?.error?.errors?.[0]?.message ?? response?.error?.message ?? response?.message ?? '';

    if (status === 403) {
      return nestedMessage || 'Forbidden while loading dashboard data.';
    }
    if (status === 404) {
      return nestedMessage || 'Dashboard data collection was not found.';
    }
    if (status && status >= 500) {
      return nestedMessage || `Server error (${status}) while loading dashboard data.`;
    }
    return nestedMessage || fallback;
  }

  private httpStatus(error: unknown): number {
    if (!error || typeof error !== 'object') {
      return 0;
    }
    return Number((error as { status?: number }).status ?? 0);
  }

  private httpMessage(error: unknown): string {
    return this.normalizeText(
      (error as {
        error?: {
          errors?: Array<{ message?: string; extensions?: { reason?: string } }>;
          message?: string;
        };
        message?: string;
      } | null)?.error?.errors?.[0]?.extensions?.reason ??
      (error as {
        error?: {
          errors?: Array<{ message?: string }>;
          message?: string;
        };
        message?: string;
      } | null)?.error?.errors?.[0]?.message ??
      (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
      (error as { message?: string } | null)?.message
    );
  }

  private isFieldCompatibilityError(error: unknown): boolean {
    const status = this.httpStatus(error);
    const message = this.httpMessage(error);

    if (status !== 400 && status !== 422) {
      return false;
    }

    return (
      message.includes('field') ||
      message.includes('payload') ||
      message.includes('invalid') ||
      message.includes('unknown') ||
      message.includes('does not exist') ||
      message.includes('not allowed')
    );
  }

  private notificationRoute(linkType?: string | null, linkId?: string | number | null): string {
    const normalizedType = this.normalizeText(linkType);
    const normalizedId = this.normalizeId(linkId);

    if (normalizedType.includes('alert')) {
      return normalizedId ? `/app/alerts?notification=${normalizedId}` : '/app/alerts';
    }
    if (normalizedType.includes('request')) {
      return normalizedId ? `/app/scan-requests?notification=${normalizedId}` : '/app/scan-requests';
    }
    if (normalizedType.includes('activity')) {
      return '/app/activity';
    }
    return '/app/dashboard';
  }

  private isOpenAlertStatus(status?: string | null): boolean {
    const normalized = this.normalizeText(status);
    if (!normalized) {
      return true;
    }
    return !this.alertClosedStatuses.has(normalized);
  }

  private isPendingRequestStatus(status?: string | null): boolean {
    const normalized = this.normalizeText(status);
    return normalized.includes('pending');
  }

  private normalizeState(state?: string): string {
    return (state ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toStateKey(state?: string) {
    const normalized = this.normalizeState(state);
    if (normalized === 'stable') {
      return DashboardService.stateKeys.stable;
    }
    if (normalized === 'low focus') {
      return DashboardService.stateKeys.lowFocus;
    }
    if (normalized === 'elevated fatigue' || normalized === 'fatigue') {
      return DashboardService.stateKeys.fatigue;
    }
    if (normalized === 'high risk') {
      return DashboardService.stateKeys.highRisk;
    }
    return DashboardService.stateKeys.unknown;
  }

  private toDisplayState(state?: string): string {
    const key = this.toStateKey(state);
    if (key === DashboardService.stateKeys.stable) {
      return DashboardService.displayStates.stable;
    }
    if (key === DashboardService.stateKeys.lowFocus) {
      return DashboardService.displayStates.low;
    }
    if (key === DashboardService.stateKeys.fatigue) {
      return DashboardService.displayStates.fatigue;
    }
    if (key === DashboardService.stateKeys.highRisk) {
      return DashboardService.displayStates.risk;
    }
    return (state ?? '').trim() || 'Unknown';
  }

  private buildHeaders(token: string): HttpHeaders {
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

  private startOfDayIso(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
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

  private normalizeText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value).trim().toLowerCase();
    }
    return '';
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

  private resolveRecordLabel(value: unknown): string | null {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const businessProfileLabel = formatBusinessProfile(record, '');
      if (businessProfileLabel) {
        return businessProfileLabel;
      }
      const departmentLabel = formatDepartment(record, '');
      if (departmentLabel) {
        return departmentLabel;
      }
      const userLabel = formatUserName(record, '');
      if (userLabel) {
        return userLabel;
      }
      const label = sanitizeDisplayValue(
        this.pickString(record['label']) ??
          this.pickString(record['name']) ??
          this.pickString(record['title']),
        ''
      );
      return label || null;
    }

    const primitive = this.pickString(value);
    if (!primitive || isUuid(primitive)) {
      return null;
    }
    return primitive;
  }

  private resolveWorkspaceAccessLabel(
    profile: Pick<BusinessProfile, 'billing_status'> | null,
    hasPaidAccess: boolean
  ): string {
    if (hasPaidAccess) {
      return this.normalizeText(profile?.billing_status) === 'trial' ? 'Business Trial' : 'Business';
    }

    const billingStatus = this.normalizeText(profile?.billing_status);
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
}
