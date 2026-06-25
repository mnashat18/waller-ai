import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { type ActiveMemberRole } from '../ia/wellar-ia';
import { AdminTokenService } from './admin-token';
import { AuthService } from './auth';
import { CompanyContextService } from '../core/context/company-context.service';
import {
  formatDepartment,
  formatUserName,
  isUuid,
  sanitizeDisplayValue
} from '../shared/utils/display-formatters';

export type DashboardSectionState<T> = {
  items: T[];
  error: string | null;
};

export type DashboardKpiCardData = {
  label: string;
  value: string;
  description: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  toneLabel: string;
};

export type DashboardScopeSummary = {
  companyWide: boolean;
  departmentId: string | null;
  departmentName: string | null;
  label: string;
  description: string;
};

export type DashboardMemberSummary = {
  memberId: string | null;
  employeeName: string;
  memberRole: ActiveMemberRole | null;
  status: string | null;
  joinedAt: string | null;
  departmentId: string | null;
  departmentName: string | null;
};

export type DashboardAttentionItem = {
  id: string;
  employeeName: string;
  department: string;
  reason: string;
  detail: string;
  timeLabel: string;
  riskLevel: string | null;
  primaryActionLabel: string;
  primaryActionRoute: string;
  secondaryActionLabel: string | null;
  secondaryActionRoute: string | null;
};

export type DashboardReadinessBucket = {
  key: 'stable' | 'low_focus' | 'elevated_fatigue' | 'high_risk';
  label: string;
  count: number;
  percentage: number;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
};

export type DashboardDepartmentCompliance = {
  id: string;
  name: string;
  activeEligibleMembers: number;
  completedToday: number;
  missingToday: number;
  complianceRate: number;
  progress: number;
  note: string | null;
};

export type DashboardScanActivityItem = {
  id: string;
  employeeName: string;
  department: string;
  completedLabel: string;
  readinessScore: string;
  riskLevel: string;
  sourceLabel: string;
  sourceKey: string;
  employeeRoute: string | null;
  resultRoute: string | null;
};

export type DashboardAlertItem = {
  id: string;
  employeeName: string;
  severity: string;
  title: string;
  createdLabel: string;
  statusLabel: string;
  route: string;
};

export type DashboardRequestItem = {
  id: string;
  employeeName: string;
  requestedBy: string;
  requestedAtLabel: string;
  dueAtLabel: string;
  statusLabel: string;
  department: string;
  route: string;
};

export type OperationalDashboardViewModel = {
  company: {
    businessProfileId: string;
    companyName: string;
    timezone: string | null;
    activeRole: ActiveMemberRole;
  };
  currentMember: DashboardMemberSummary;
  scope: DashboardScopeSummary;
  kpis: DashboardKpiCardData[];
  needsAttention: DashboardSectionState<DashboardAttentionItem>;
  readinessDistribution: DashboardSectionState<DashboardReadinessBucket>;
  complianceByDepartment: DashboardSectionState<DashboardDepartmentCompliance>;
  recentScans: DashboardSectionState<DashboardScanActivityItem>;
  recentAlerts: DashboardSectionState<DashboardAlertItem>;
  pendingRequests: DashboardSectionState<DashboardRequestItem>;
  recentActivity: DashboardScanActivityItem[];
  generatedAt: string;
  hasData: boolean;
};

type MembershipRecord = {
  id?: string | number;
  business_profile?: string | number | Record<string, unknown> | null;
  user?: string | number | Record<string, unknown> | null;
  member_role?: string | null;
  status?: string | null;
  department?: string | number | Record<string, unknown> | null;
  joined_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  user_id?: string | null;
  job_title?: string | null;
  employee_code?: string | null;
  last_scan_at?: string | null;
  last_readiness_score?: number | string | null;
  last_risk_level?: string | null;
};

type DepartmentRecord = {
  id?: string | number;
  name?: string | null;
  is_active?: boolean | null;
};

type WellnessScanRecord = {
  id?: string | number;
  business_profile?: string | number | Record<string, unknown> | null;
  member?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
  request_source?: string | null;
  status?: string | null;
  completed_at?: string | null;
  date_created?: string | null;
};

type ScanResultRecord = {
  id?: string | number;
  date_created?: string | null;
  scan_id?: string | number | Record<string, unknown> | null;
  risk_level?: string | null;
  readiness_score?: number | string | null;
};

type AlertRecord = {
  id?: string | number;
  date_created?: string | null;
  business_profile?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
  target_member?: string | number | Record<string, unknown> | null;
  target_user?: string | number | Record<string, unknown> | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  status?: string | null;
};

type RequestRecord = {
  id?: string | number;
  business_profile?: string | number | Record<string, unknown> | null;
  department?: string | number | Record<string, unknown> | null;
  requested_by_user?: string | number | Record<string, unknown> | null;
  target_member?: string | number | Record<string, unknown> | null;
  request_type?: string | null;
  status?: string | null;
  requested_at?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  cancelled?: string | null;
  completed_scan?: string | number | Record<string, unknown> | null;
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

type DirectusUserRecord = {
  id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

type QueryConfig = {
  collection: string;
  fields: string[];
  limit: number;
  sort?: string;
  businessProfileId?: string | null;
  businessProfileFilterPath?: string[] | null;
  departmentId?: string | null;
  departmentFilterPath?: string[] | null;
  extraFilters?: Array<{ path: string[]; operator: string; value: string }>;
};

type SourceBundle = {
  members: DashboardSectionState<MembershipRecord>;
  departments: DashboardSectionState<DepartmentRecord>;
  scans: DashboardSectionState<WellnessScanRecord>;
  alerts: DashboardSectionState<AlertRecord>;
  requests: DashboardSectionState<RequestRecord>;
};

@Injectable({ providedIn: 'root' })
export class OperationalDashboardService {
  private readonly api = environment.API_URL;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private adminTokens: AdminTokenService,
    private companyContext: CompanyContextService
  ) {}

  getDashboardData(businessProfileId?: string): Observable<OperationalDashboardViewModel> {
    return from(this.companyContext.ensureActiveContext()).pipe(
      switchMap((restoredContext) => {
        const resolvedBusinessProfileId =
          restoredContext?.activeBusinessProfile?.id ?? businessProfileId ?? null;

        if (!restoredContext?.activeMembership?.id || !resolvedBusinessProfileId) {
          return throwError(() => new Error('No active company context was found.'));
        }

        const role = String(
          restoredContext.activeMemberRole ||
          restoredContext.activeMembership.member_role ||
          ''
        ).toLowerCase() as ActiveMemberRole;

        if (!role) {
          return throwError(() => new Error('No active company context was found.'));
        }

        if (role === 'employee') {
          return throwError(() => new Error('You do not have dashboard access.'));
        }

        const businessProfileIdResolved = resolvedBusinessProfileId;
        const userId = this.companyContext.snapshot().context.userId;
        const departmentId = role === 'manager' ? this.companyContext.snapshot().context.activeDepartmentId : null;

        return this.companyContext.ensureLoaded(true).pipe(
          switchMap((state) => {
            const context = state.context;
            const resolvedBusinessProfileId = context.activeBusinessProfileId ?? businessProfileIdResolved;
            const resolvedRole = context.activeMemberRole ?? role;
            const resolvedDepartmentId = context.activeDepartmentId ?? departmentId;

            if (!resolvedBusinessProfileId || !resolvedRole) {
              return throwError(() => new Error('No active company context was found.'));
            }

            return this.adminTokens.getToken().pipe(
              map((adminToken) => adminToken ?? this.auth.getStoredAccessToken() ?? ''),
              switchMap((token) =>
                forkJoin({
                  members: this.querySection<MembershipRecord>({
                    collection: 'business_profile_members',
                    fields: [
                      'id',
                      'status',
                      'member_role',
                      'job_title',
                      'employee_code',
                      'last_scan_at',
                      'last_readiness_score',
                      'last_risk_level',
                      'department',
                      'user.id',
                      'user.first_name',
                      'user.last_name',
                      'user.email',
                      'joined_at'
                    ],
                    limit: 400,
                    sort: 'user.first_name',
                    businessProfileId: resolvedBusinessProfileId,
                    businessProfileFilterPath: ['business_profile'],
                    departmentId: resolvedDepartmentId,
                    departmentFilterPath: ['department']
                  }, token, 'Active members could not be loaded.'),
                  departments: this.querySection<DepartmentRecord>({
                    collection: 'departments',
                    fields: ['id', 'name', 'is_active'],
                    limit: 100,
                    sort: 'name',
                    businessProfileId: resolvedBusinessProfileId,
                    businessProfileFilterPath: ['business_profile'],
                    departmentId: resolvedDepartmentId,
                    departmentFilterPath: ['id']
                  }, token, 'Departments could not be loaded.'),
                  scans: this.querySection<WellnessScanRecord>({
                    collection: 'wellness_scans',
                    fields: [
                      'id',
                      'status',
                      'completed_at',
                      'request_source',
                      'member.id',
                      'member.user.id',
                      'member.user.first_name',
                      'member.user.last_name',
                      'member.user.email',
                      'department.id',
                      'department.name'
                    ],
                    limit: 300,
                    sort: '-completed_at',
                    businessProfileId: resolvedBusinessProfileId,
                    businessProfileFilterPath: ['business_profile'],
                    departmentId: resolvedDepartmentId,
                    departmentFilterPath: ['department']
                  }, token, 'Completed scans could not be loaded.'),
                  alerts: this.querySection<AlertRecord>({
                    collection: 'alerts',
                    fields: [
                      'id',
                      'severity',
                      'title',
                      'message',
                      'status',
                      'date_created',
                      'target_member.id',
                      'target_member.department.id',
                      'target_member.department.name',
                      'target_member.user.id',
                      'target_member.user.first_name',
                      'target_member.user.last_name',
                      'target_member.user.email',
                      'scan.id'
                    ],
                    limit: 80,
                    sort: '-date_created',
                    businessProfileId: resolvedBusinessProfileId,
                    businessProfileFilterPath: ['business_profile'],
                    departmentId: resolvedDepartmentId,
                    departmentFilterPath: ['department']
                  }, token, 'Alerts could not be loaded.'),
                  requests: this.querySection<RequestRecord>({
                    collection: 'scan_requests',
                    fields: [
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
                    ],
                    limit: 80,
                    sort: '-requested_at',
                    businessProfileId: resolvedBusinessProfileId,
                    businessProfileFilterPath: ['business_profile'],
                    departmentId: resolvedDepartmentId,
                    departmentFilterPath: ['department']
                  }, token, 'Scan requests could not be loaded.')
                }).pipe(
                  switchMap((sources) => {
                    const scanIds = this.uniqueIds(sources.scans.items.map((scan) => this.normalizeId(scan.id)));
                    const scanResults$ = scanIds.length
                      ? this.querySection<ScanResultRecord>({
                          collection: 'scan_results',
                          fields: ['id', 'date_created', 'scan_id', 'risk_level', 'readiness_score'],
                          limit: scanIds.length,
                          sort: '-date_created',
                          extraFilters: [{ path: ['scan_id'], operator: '_in', value: scanIds.join(',') }]
                        }, token, 'Readiness results could not be loaded.')
                      : of({ items: [] as ScanResultRecord[], error: null });

                    return scanResults$.pipe(
                      map((scanResults) =>
                        this.buildDashboardViewModel(
                          context,
                          sources,
                          scanResults,
                          userId,
                          resolvedBusinessProfileId,
                          resolvedRole,
                          resolvedDepartmentId,
                          context.activeBusinessProfileName ?? restoredContext.activeBusinessProfile.company_name ?? null
                        )
                      )
                    );
                  })
                )
              )
            );
          })
        );
      })
    ).pipe(timeout(20000));
  }

  private buildDashboardViewModel(
    context: {
      activeBusinessProfileId: string | null;
      activeBusinessProfileName: string | null;
      activeDepartmentId: string | null;
      activeDepartmentName: string | null;
      userId: string | null;
    },
    sources: SourceBundle,
    scanResults: DashboardSectionState<ScanResultRecord>,
    userId: string | null,
    businessProfileId: string,
    role: ActiveMemberRole,
    departmentId: string | null,
    companyName: string | null
  ): OperationalDashboardViewModel {
    const timezone = null;
    const departmentMap = this.buildDepartmentMap(sources.departments.items);
    const member = this.findCurrentMember(sources.members.items, userId, departmentMap, sources.departments.error);
    const memberMap = this.buildMemberMap(sources.members.items, departmentMap, sources.departments.error);
    const scanRows = this.buildScanResultRows(sources.scans.items, scanResults.items, memberMap, departmentMap, timezone);
    const completedToday = scanRows.filter((row) => row.isToday);
    const latestByMember = this.latestByMember(completedToday);
    const completedMemberIds = new Set(latestByMember.map((row) => row.memberId).filter((id): id is string => Boolean(id)));
    const eligibleMembers = this.eligibleMembers(sources.members.items, departmentId, role, memberMap);
    const activeMembers = eligibleMembers.filter((row) => row.isActive);
    const scanEligibleMembers = activeMembers.filter((row) => row.memberRole === 'employee');
    const scannedEligibleCount = scanEligibleMembers.filter((row) => completedMemberIds.has(row.userId)).length;
    const missingMembers = scanEligibleMembers.filter((row) => !completedMemberIds.has(row.userId));
    const latestResultsByMember = this.latestResultsByMember(latestByMember, scanResults.items, memberMap, timezone);
    const readinessBuckets = this.buildReadinessBuckets(latestResultsByMember);
    const avgReadiness = this.averageReadiness(latestResultsByMember);
    const highRiskToday = latestResultsByMember.filter((item) => this.normalizeRisk(item.riskLevel) === 'high_risk').length;
    const openAlerts = this.buildAlertRows(sources.alerts.items, memberMap, departmentMap, timezone);
    const requestRows = this.buildRequestRows(sources.requests.items, memberMap, departmentMap, timezone);
    const attentionItems = this.buildAttentionItems(
      latestResultsByMember,
      missingMembers,
      requestRows,
      openAlerts,
      memberMap,
      departmentMap,
      timezone
    );
    const departmentCompliance = this.buildDepartmentCompliance(
      activeMembers,
      completedMemberIds,
      departmentMap,
      sources.departments.error
    );

    const kpis: DashboardKpiCardData[] = [
      {
        label: 'Active Members',
        value: String(activeMembers.length),
        description: 'Active people in this workspace.',
        tone: 'neutral',
        toneLabel: 'Roster'
      },
      {
        label: 'Scanned Today',
        value: String(latestByMember.length),
        description: 'Completed readiness scans today.',
        tone: latestByMember.length ? 'success' : 'neutral',
        toneLabel: 'Today'
      },
      {
        label: 'Missing Scans',
        value: String(Math.max(0, scanEligibleMembers.length - scannedEligibleCount)),
        description: 'Scan-eligible people still missing today.',
        tone: missingMembers.length ? 'warning' : 'success',
        toneLabel: 'Follow-up'
      },
      {
        label: 'Compliance Rate',
        value: `${scanEligibleMembers.length ? Math.round((scannedEligibleCount / scanEligibleMembers.length) * 100) : 0}%`,
        description: 'Completed scans divided by scan-eligible members.',
        tone: scannedEligibleCount === scanEligibleMembers.length && scanEligibleMembers.length > 0 ? 'success' : 'warning',
        toneLabel: 'Compliance'
      },
      {
        label: 'Avg Readiness',
        value: scanResults.error ? '--' : avgReadiness,
        description: scanResults.error ? 'Readiness data unavailable.' : "Average readiness score from today's completed scans.",
        tone: scanResults.error ? 'warning' : 'neutral',
        toneLabel: 'Readiness'
      },
      {
        label: 'High Risk Today',
        value: scanResults.error ? '--' : String(highRiskToday),
        description: scanResults.error ? 'Readiness data unavailable.' : 'Completed scans marked High Risk today.',
        tone: scanResults.error ? 'warning' : highRiskToday > 0 ? 'danger' : 'success',
        toneLabel: 'Review'
      },
      {
        label: 'Open Alerts',
        value: String(openAlerts.filter((alert) => alert.statusLabel === 'New' || alert.statusLabel === 'Seen').length),
        description: 'Alerts waiting for review.',
        tone: openAlerts.length > 0 ? 'danger' : 'neutral',
        toneLabel: 'Alerts'
      }
    ];

    const needsAttentionState: DashboardSectionState<DashboardAttentionItem> = {
      items: attentionItems.slice(0, 10),
      error: this.combineErrors([
        scanResults.error,
        sources.alerts.error,
        sources.requests.error,
        sources.members.error
      ])
    };

    const readinessState: DashboardSectionState<DashboardReadinessBucket> = {
      items: readinessBuckets,
      error: scanResults.error
    };

    const complianceState: DashboardSectionState<DashboardDepartmentCompliance> = {
      items: departmentCompliance,
      error: sources.members.error || sources.scans.error
    };

    const recentScansState: DashboardSectionState<DashboardScanActivityItem> = {
      items: scanRows.slice(0, 10),
      error: sources.scans.error || scanResults.error
    };

    const recentAlertsState: DashboardSectionState<DashboardAlertItem> = {
      items: openAlerts.slice(0, 5),
      error: sources.alerts.error
    };

    const pendingRequestsState: DashboardSectionState<DashboardRequestItem> = {
      items: requestRows.slice(0, 5),
      error: sources.requests.error
    };

    const scope: DashboardScopeSummary = {
      companyWide: role !== 'manager',
      departmentId: role === 'manager' ? departmentId : null,
      departmentName: role === 'manager' ? context.activeDepartmentName : null,
      label: role === 'manager' ? `Department scope · ${context.activeDepartmentName || 'Active department'}` : 'Company-wide scope',
      description:
        role === 'manager'
          ? `Dashboard data is limited to ${context.activeDepartmentName || 'the active department'}.`
          : 'Dashboard data is scoped to the active business profile.'
    };

    const companyNameResolved = companyName?.trim() || context.activeBusinessProfileName?.trim() || 'Active company';

    return {
      company: {
        businessProfileId,
        companyName: companyNameResolved,
        timezone,
        activeRole: role
      },
      currentMember: {
        memberId: member?.memberId ?? null,
        employeeName: member?.employeeName ?? 'Team member',
        memberRole: member?.memberRole ?? role,
        status: member?.status ?? null,
        joinedAt: member?.joinedAt ?? null,
        departmentId: member?.departmentId ?? departmentId,
        departmentName: member?.departmentName ?? context.activeDepartmentName ?? null
      },
      scope,
      kpis,
      needsAttention: needsAttentionState,
      readinessDistribution: readinessState,
      complianceByDepartment: complianceState,
      recentScans: recentScansState,
      recentAlerts: recentAlertsState,
      pendingRequests: pendingRequestsState,
      recentActivity: recentScansState.items,
      generatedAt: new Date().toISOString(),
      hasData: Boolean(
        activeMembers.length ||
        latestByMember.length ||
        readinessBuckets.some((item) => item.count > 0) ||
        departmentCompliance.length ||
        attentionItems.length ||
        openAlerts.length ||
        requestRows.length
      )
    };
  }

  private querySection<T>(config: QueryConfig, token: string, fallbackError: string): Observable<DashboardSectionState<T>> {
    if (config.collection === 'scan_requests') {
      return this.queryRequestsSection<T>(config, token, fallbackError);
    }
    return this.querySectionSingle<T>(config, token, fallbackError);
  }

  private queryRequestsSection<T>(config: QueryConfig, token: string, fallbackError: string): Observable<DashboardSectionState<T>> {
    const layeredConfigs: QueryConfig[] = [
      config,
      {
        ...config,
        fields: [
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
        ]
      },
      {
        ...config,
        fields: [
          'id',
          'business_profile',
          'target_member',
          'requested_by_user',
          'status',
          'request_type',
          'requested_at'
        ]
      }
    ];

    return this.queryWithFallback<RequestRecord>(layeredConfigs, token, fallbackError).pipe(
      map((state) => ({
        ...state,
        items: (state.items ?? []).map((item) => this.normalizeRequestRecord(item)) as unknown as T[]
      }))
    );
  }

  private queryWithFallback<T>(configs: QueryConfig[], token: string, fallbackError: string): Observable<DashboardSectionState<T>> {
    const [first, ...rest] = configs;
    if (!first) {
      return of({ items: [] as T[], error: fallbackError });
    }

    return this.querySectionSingle<T>(first, token, fallbackError, true).pipe(
      switchMap((state) => {
        if (!state.error || !rest.length || !this.isFieldOrPermissionError(state.errorRaw)) {
          return of({ items: state.items, error: state.error });
        }

        if (!environment.production) {
          console.warn('[dashboard] retrying requests with safer fields');
        }
        return this.queryWithFallback<T>(rest, token, fallbackError);
      })
    );
  }

  private querySectionSingle<T>(
    config: QueryConfig,
    token: string,
    fallbackError: string,
    includeErrorRaw = false
  ): Observable<DashboardSectionState<T> & { errorRaw?: unknown }> {
    const params = new URLSearchParams({
      limit: String(config.limit),
      fields: config.fields.join(','),
      sort: config.sort ?? '-id'
    });

    if (config.businessProfileId && config.businessProfileFilterPath?.length) {
      this.setFilter(params, config.businessProfileFilterPath, '_eq', config.businessProfileId);
    }
    if (config.departmentId && config.departmentFilterPath?.length) {
      this.setFilter(params, config.departmentFilterPath, '_eq', config.departmentId);
    }
    for (const filter of config.extraFilters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    return this.http.get<{ data?: T[] }>(
      `${this.api}/items/${config.collection}?${params.toString()}`,
      {
        headers: this.auth.getAuthHeaders(token),
        withCredentials: true
      }
    ).pipe(
      map((response) => ({
        items: response.data ?? [],
        error: null
      })),
      timeout(15000),
      catchError((error) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (config.collection === 'departments' && (status === 401 || status === 403)) {
          console.warn('[DEPARTMENTS_PERMISSION_BLOCKED]', {
            requiredFields: ['id', 'name', 'business_profile'],
            collection: config.collection
          });
        }
        this.logSectionFailure(config.collection, error);
        return of({
          items: [] as T[],
          error: this.describeHttpError(error, fallbackError),
          ...(includeErrorRaw ? { errorRaw: error } : {})
        });
      })
    );
  }

  private normalizeRequestRecord(request: RequestRecord): RequestRecord {
    const responsePayload = request.response_payload && typeof request.response_payload === 'object'
      ? request.response_payload as Record<string, unknown>
      : null;
    const timestamp = request.timestamp ?? request.requested_at ?? null;
    const status = this.pickString(request.response_status ?? request.status) ?? 'pending';
    const requestType = this.pickString(request.required_state ?? request.request_type ?? null);
    const completedScanId = this.normalizeId(request.scan_id ?? request.completed_scan);
    return {
      ...request,
      target_member: request.target_member ?? request.requested_for_user ?? null,
      requested_by_user: request.requested_by_user ?? null,
      request_type: requestType,
      status,
      requested_at: timestamp,
      due_at: request.due_at ?? this.pickString(responsePayload?.['due_at']) ?? null,
      completed_at: request.completed_at ?? this.pickString(responsePayload?.['completed_at']) ?? null,
      cancelled: request.cancelled ?? (this.normalizeText(status) === 'cancelled' ? 'cancelled' : null),
      completed_scan: request.completed_scan ?? completedScanId,
      scan_id: request.scan_id ?? completedScanId,
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

  private logSectionFailure(collection: string, error: unknown): void {
    if (environment.production) {
      return;
    }
    console.warn(`[dashboard] ${collection} query failed`, error);
  }

  private isFieldOrPermissionError(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status ?? 0;
    if (status === 403) {
      return true;
    }
    if (status !== 400 && status !== 422) {
      return false;
    }
    const message = this.normalizeText(
      (error as { error?: { errors?: Array<{ extensions?: { reason?: string }; message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.extensions?.reason ??
      (error as { error?: { errors?: Array<{ message?: string }>; message?: string }; message?: string } | null)?.error?.errors?.[0]?.message ??
      (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
      (error as { message?: string } | null)?.message
    );
    return (
      message.includes('not allowed') ||
      message.includes('permission') ||
      message.includes('forbidden') ||
      message.includes('field') ||
      message.includes('does not exist') ||
      message.includes('invalid')
    );
  }

  private eligibleMembers(
    members: MembershipRecord[],
    departmentId: string | null,
    role: ActiveMemberRole,
    memberMap: Map<string, DashboardMemberSummary>
  ): Array<DashboardMemberSummary & { userId: string; isActive: boolean }> {
    const rows = members
      .map((row) => this.memberSummary(row, memberMap))
      .filter((row): row is DashboardMemberSummary & { userId: string; isActive: boolean } => Boolean(row));

    if (role !== 'manager' || !departmentId) {
      return rows;
    }

    return rows.filter((row) => row.departmentId === departmentId);
  }

  private memberSummary(
    row: MembershipRecord,
    memberMap: Map<string, DashboardMemberSummary>
  ): (DashboardMemberSummary & { userId: string; isActive: boolean }) | null {
    const userId = this.normalizeId(row.user);
    if (!userId) {
      return null;
    }
    const current = memberMap.get(userId) ?? null;
    const status = this.pickString(row.status) ?? current?.status ?? null;
    const memberRole = this.normalizeRole(row.member_role) ?? current?.memberRole ?? null;
    const departmentId = current?.departmentId ?? this.normalizeId(row.department);
    const departmentName = current?.departmentName ?? this.pickDepartmentName(row.department);
    const employeeName = this.pickDisplayName(row.user) ?? current?.employeeName ?? 'Team member';
    return {
      memberId: this.normalizeId(row.id),
      employeeName,
      userId,
      memberRole,
      status,
      joinedAt: this.pickString(row.joined_at) ?? this.pickString(row.date_created),
      departmentId,
      departmentName,
      isActive: this.isActiveStatus(status)
    };
  }

  private buildMemberMap(
    members: MembershipRecord[],
    departmentMap: Map<string, string>,
    departmentsError: string | null
  ): Map<string, DashboardMemberSummary> {
    const mapByUser = new Map<string, DashboardMemberSummary>();
    for (const row of members ?? []) {
      const userId = this.normalizeId(row.user);
      if (!userId) {
        continue;
      }
      const departmentId = this.normalizeId(row.department);
      mapByUser.set(userId, {
        memberId: this.normalizeId(row.id),
        employeeName: this.pickDisplayName(row.user) ?? 'Team member',
        memberRole: this.normalizeRole(row.member_role),
        status: this.pickString(row.status),
        joinedAt: this.pickString(row.joined_at) ?? this.pickString(row.date_created),
        departmentId,
        departmentName: this.resolveDepartmentLabel(
          departmentId,
          this.pickDepartmentName(row.department),
          departmentMap,
          departmentsError
        )
      });
    }
    return mapByUser;
  }

  private buildDepartmentMap(rows: DepartmentRecord[]): Map<string, string> {
    const mapById = new Map<string, string>();
    for (const row of rows ?? []) {
      const id = this.normalizeId(row.id);
      if (!id) {
        continue;
      }
      mapById.set(id, this.pickString(row.name) ?? `Department ${id}`);
    }
    return mapById;
  }

  private buildScanMap(
    scans: WellnessScanRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    const rows = (scans ?? [])
      .map((scan) => {
        const memberId = this.relatedUserId(scan.member);
        const member = memberId ? memberMap.get(memberId) ?? null : null;
        const completedAt = this.pickString(scan.completed_at) ?? this.pickString(scan.date_created);
        const completedTs = this.toTimestamp(completedAt);
        return {
          id: this.normalizeId(scan.id) ?? `scan-${Math.random().toString(16).slice(2)}`,
          employeeName: member ? this.memberName(memberId, memberMap) : this.memberNameFromScan(scan),
          department: member?.departmentName ?? this.resolveDepartmentLabel(
            this.normalizeId(scan.department),
            this.pickDepartmentName(scan.department),
            departmentMap,
            null
          ),
          completedLabel: this.formatDateTime(completedAt, timezone),
          readinessScore: '0',
          riskLevel: 'Stable',
          sourceLabel: this.sourceLabel(scan.request_source),
          sourceKey: this.normalizeText(scan.request_source) || 'self',
          employeeRoute: null,
          resultRoute: null,
          completedAt,
          memberId,
          isToday: this.isSameDayInTimeZone(completedAt, timezone),
          timestamp: completedTs
        };
      })
      .sort((left, right) => right.timestamp - left.timestamp);

    return rows;
  }

  private latestResultsByMember(
    scans: Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }>,
    results: ScanResultRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    timezone: string | null
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    const resultByScanId = new Map<string, ScanResultRecord>();
    for (const result of results ?? []) {
      const scanId = this.normalizeId(result.scan_id);
      if (!scanId) {
        continue;
      }
      resultByScanId.set(scanId, result);
    }

    return scans
      .filter((row) => row.isToday)
      .map((row) => {
        const result = resultByScanId.get(row.id) ?? null;
        const risk = this.normalizeRisk(result?.risk_level);
        const score = this.pickString(result?.readiness_score) ?? '0';
        return {
          ...row,
          readinessScore: score,
          riskLevel: this.riskLabel(risk),
          sourceLabel: row.sourceLabel,
          sourceKey: row.sourceKey
        };
      })
      .sort((left, right) => right.timestamp - left.timestamp)
      .map((row) => ({
        ...row,
        employeeName: row.memberId ? this.memberName(row.memberId, memberMap) : row.employeeName,
        completedLabel: this.formatDateTime(row.completedAt, timezone)
      }));
  }

  private buildReadinessBuckets(
    rows: Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }>
  ): DashboardReadinessBucket[] {
    const total = rows.length;
    const counts = {
      stable: 0,
      low_focus: 0,
      elevated_fatigue: 0,
      high_risk: 0
    };

    for (const row of rows ?? []) {
      const normalized = this.normalizeRisk(row.riskLevel);
      if (normalized === 'stable') counts.stable += 1;
      else if (normalized === 'low_focus') counts.low_focus += 1;
      else if (normalized === 'elevated_fatigue') counts.elevated_fatigue += 1;
      else if (normalized === 'high_risk') counts.high_risk += 1;
    }

    const build = (key: DashboardReadinessBucket['key'], label: string, count: number, tone: DashboardReadinessBucket['tone']): DashboardReadinessBucket => ({
      key,
      label,
      count,
      percentage: total ? Math.round((count / total) * 100) : 0,
      tone
    });

    return [
      build('stable', 'Stable', counts.stable, 'success'),
      build('low_focus', 'Low Focus', counts.low_focus, 'warning'),
      build('elevated_fatigue', 'Elevated Fatigue', counts.elevated_fatigue, 'warning'),
      build('high_risk', 'High Risk', counts.high_risk, 'danger')
    ];
  }

  private buildDepartmentCompliance(
    members: Array<DashboardMemberSummary & { userId: string; isActive: boolean }>,
    completedMemberIds: Set<string>,
    departments: Map<string, string>,
    departmentsError: string | null
  ): DashboardDepartmentCompliance[] {
    const buckets = new Map<string, { id: string; name: string; note: string | null }>();
    for (const member of members) {
      if (!member.isActive || member.memberRole !== 'employee' || !member.departmentId) {
        continue;
      }
      const name = this.resolveDepartmentLabel(member.departmentId, member.departmentName, departments, departmentsError);
      const note = (!member.departmentName && !departments.get(member.departmentId))
        ? (departmentsError
            ? 'Department metadata is unavailable for this workspace.'
            : 'Department id exists on members, but metadata was not returned.')
        : null;
      buckets.set(member.departmentId, {
        id: member.departmentId,
        name,
        note
      });
    }

    const rows: DashboardDepartmentCompliance[] = [];
    for (const bucket of buckets.values()) {
      const departmentMembers = members.filter((member) => member.departmentId === bucket.id && member.isActive && member.memberRole === 'employee');
      const completedToday = departmentMembers.filter((member) => completedMemberIds.has(member.userId)).length;
      const activeEligibleMembers = departmentMembers.length;
      const missingToday = Math.max(0, activeEligibleMembers - completedToday);
      const complianceRate = activeEligibleMembers > 0 ? Math.round((completedToday / activeEligibleMembers) * 100) : 0;
      rows.push({
        id: bucket.id,
        name: bucket.name,
        activeEligibleMembers,
        completedToday,
        missingToday,
        complianceRate,
        progress: complianceRate,
        note: activeEligibleMembers > 0 ? bucket.note : 'No scan-eligible members yet'
      });
    }

    return rows.sort((left, right) => left.name.localeCompare(right.name));
  }

  private buildAlertRows(
    alerts: AlertRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): DashboardAlertItem[] {
    return (alerts ?? [])
      .filter((alert) => this.isOpenAlertStatus(alert.status))
      .sort((left, right) => this.toTimestamp(right.date_created) - this.toTimestamp(left.date_created))
      .map((alert) => {
        const memberId = this.relatedUserId(alert.target_member) || this.relatedUserId(alert.target_user);
        const member = memberId ? memberMap.get(memberId) ?? null : null;
        return {
          id: this.normalizeId(alert.id) ?? 'alert',
          employeeName: member ? this.memberName(memberId, memberMap) : this.memberLabel(alert, memberMap),
          severity: this.severityLabel(alert.severity),
          title: this.pickString(alert.title) ?? this.pickString(alert.message) ?? 'Alert',
          createdLabel: this.formatDateTime(alert.date_created, timezone),
          statusLabel: this.alertStatusLabel(alert.status),
          route: '/app/alerts'
        };
      })
      .sort((left, right) => right.createdLabel.localeCompare(left.createdLabel));
  }

  private buildRequestRows(
    requests: RequestRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): DashboardRequestItem[] {
    return (requests ?? [])
      .filter((request) => this.isOpenRequest(request.status, request.cancelled, request.completed_at))
      .sort((left, right) => this.toTimestamp(right.requested_at ?? right.timestamp) - this.toTimestamp(left.requested_at ?? left.timestamp))
      .map((request) => {
        const memberId = this.relatedUserId(request.target_member);
        const requesterId = this.relatedUserId(request.requested_by_user);
        const member = memberId ? memberMap.get(memberId) ?? null : null;
        const requester = requesterId ? memberMap.get(requesterId) ?? null : null;
        const departmentId = this.normalizeId(request.department);
        return {
          id: this.normalizeId(request.id) ?? 'request',
          employeeName: member ? this.memberName(memberId, memberMap) : (this.relatedUserLabel(request.target_member) ?? this.pickString(request.requested_for_email) ?? this.pickString(request.Target) ?? 'Unassigned'),
          requestedBy: requester ? this.memberName(requesterId, memberMap) : this.relatedUserLabel(request.requested_by_user) ?? 'System',
          requestedAtLabel: this.formatDateTime(request.requested_at ?? request.timestamp, timezone),
          dueAtLabel: request.due_at ? this.formatDateTime(request.due_at, timezone) : 'No due time',
          statusLabel: this.requestStatusLabel(request.status, request.due_at),
          department: this.resolveDepartmentLabel(
            departmentId,
            this.pickDepartmentName(request.department),
            departmentMap,
            null
          ),
          route: '/app/scan-requests'
        };
      })
      .sort((left, right) => right.requestedAtLabel.localeCompare(left.requestedAtLabel));
  }

  private buildAttentionItems(
    latestResults: Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }>,
    missingMembers: Array<DashboardMemberSummary & { userId: string; isActive: boolean }>,
    requests: DashboardRequestItem[],
    alerts: DashboardAlertItem[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): DashboardAttentionItem[] {
    const items: DashboardAttentionItem[] = [];

    for (const row of latestResults.filter((item) => this.normalizeRisk(item.riskLevel) === 'high_risk').slice(0, 4)) {
      items.push({
        id: `scan-${row.id}`,
        employeeName: row.employeeName,
        department: row.department,
        reason: 'High Risk',
        detail: `Completed ${row.completedLabel}`,
        timeLabel: row.completedLabel,
        riskLevel: 'High Risk',
        primaryActionLabel: 'Review Scan',
        primaryActionRoute: '/app/compliance',
        secondaryActionLabel: 'Request Re-scan',
        secondaryActionRoute: '/app/scan-requests'
      });
    }

    for (const row of latestResults.filter((item) => this.normalizeRisk(item.riskLevel) === 'elevated_fatigue').slice(0, 4)) {
      items.push({
        id: `fatigue-${row.id}`,
        employeeName: row.employeeName,
        department: row.department,
        reason: 'Elevated Fatigue',
        detail: `Completed ${row.completedLabel}`,
        timeLabel: row.completedLabel,
        riskLevel: 'Elevated Fatigue',
        primaryActionLabel: 'Review Scan',
        primaryActionRoute: '/app/compliance',
        secondaryActionLabel: 'Request Re-scan',
        secondaryActionRoute: '/app/scan-requests'
      });
    }

    for (const member of missingMembers.slice(0, 4)) {
      items.push({
        id: `missing-${member.userId}`,
        employeeName: this.memberName(member.userId, memberMap),
        department: member.departmentName ?? this.resolveDepartmentLabel(member.departmentId, null, departmentMap, null),
        reason: 'Missing scan',
        detail: `No completed scan today`,
        timeLabel: 'Today',
        riskLevel: null,
        primaryActionLabel: 'Send Request',
        primaryActionRoute: '/app/scan-requests',
        secondaryActionLabel: null,
        secondaryActionRoute: null
      });
    }

    for (const request of requests.filter((row) => row.statusLabel === 'Overdue').slice(0, 4)) {
      items.push({
        id: `request-${request.id}`,
        employeeName: request.employeeName,
        department: request.department,
        reason: 'Pending request overdue',
        detail: `Due ${request.dueAtLabel}`,
        timeLabel: request.dueAtLabel,
        riskLevel: null,
        primaryActionLabel: 'Remind',
        primaryActionRoute: '/app/scan-requests',
        secondaryActionLabel: 'Open',
        secondaryActionRoute: '/app/scan-requests'
      });
    }

    for (const alert of alerts.slice(0, 4)) {
      items.push({
        id: `alert-${alert.id}`,
        employeeName: alert.employeeName,
        department: 'Company-wide',
        reason: 'Open alert',
        detail: alert.title,
        timeLabel: alert.createdLabel,
        riskLevel: alert.severity,
        primaryActionLabel: 'Review',
        primaryActionRoute: '/app/alerts',
        secondaryActionLabel: null,
        secondaryActionRoute: null
      });
    }

    return items
      .sort((left, right) => this.attentionPriority(left.reason) - this.attentionPriority(right.reason) || right.timeLabel.localeCompare(left.timeLabel))
      .slice(0, 10);
  }

  private latestByMember(
    rows: Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }>
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    const latest = new Map<string, typeof rows[number]>();
    for (const row of rows ?? []) {
      if (!row.memberId) {
        continue;
      }
      const current = latest.get(row.memberId);
      if (!current || row.timestamp > current.timestamp) {
        latest.set(row.memberId, row);
      }
    }
    return Array.from(latest.values()).sort((left, right) => right.timestamp - left.timestamp);
  }

  private averageReadiness(
    rows: Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }>
  ): string {
    const scores = rows
      .map((row) => this.toNumber(row.readinessScore))
      .filter((value): value is number => typeof value === 'number');
    if (!scores.length) {
      return '0.0';
    }
    return (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1);
  }

  private findCurrentMember(
    members: MembershipRecord[],
    userId: string | null,
    departmentMap: Map<string, string>,
    departmentsError: string | null
  ): DashboardMemberSummary | null {
    const normalizedUserId = this.normalizeId(userId);
    if (!normalizedUserId) {
      return null;
    }
    const row = (members ?? []).find((member) => this.normalizeId(member.user) === normalizedUserId);
    if (!row) {
      return null;
    }
    const departmentName = this.resolveDepartmentLabel(
      this.normalizeId(row.department),
      this.pickDepartmentName(row.department),
      departmentMap,
      departmentsError
    );
    return {
      memberId: this.normalizeId(row.id),
      employeeName: this.pickDisplayName(row.user) ?? 'Team member',
      memberRole: this.normalizeRole(row.member_role),
      status: this.pickString(row.status),
      joinedAt: this.pickString(row.joined_at) ?? this.pickString(row.date_created),
      departmentId: this.normalizeId(row.department),
      departmentName
    };
  }

  private memberNameFromScan(scan: WellnessScanRecord): string {
    return this.relatedUserLabel(scan.member) ?? 'Team member';
  }

  private memberLabel(alert: AlertRecord, memberMap: Map<string, DashboardMemberSummary>): string {
    const memberId = this.relatedUserId(alert.target_member) || this.relatedUserId(alert.target_user);
    if (memberId && memberMap.has(memberId)) {
      return this.memberName(memberId, memberMap);
    }
    return this.relatedUserLabel(alert.target_member) ?? this.relatedUserLabel(alert.target_user) ?? 'Team member';
  }

  private pickDisplayName(value: unknown): string | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const primitive = this.pickString(value);
      if (!primitive || isUuid(primitive)) {
        return null;
      }
      return primitive;
    }
    if (!value || typeof value !== 'object') {
      return null;
    }
    const record = value as Record<string, unknown>;
    const userLabel = formatUserName(record, '');
    if (userLabel) {
      return userLabel;
    }
    const fallbackLabel = sanitizeDisplayValue(
      this.pickString(record['name']) ?? this.pickString(record['label']),
      ''
    );
    return fallbackLabel || null;
  }

  private relatedUserRecord(value: unknown): Record<string, unknown> | null {
    const record = this.objectRecord(value);
    if (!record) {
      return null;
    }
    const user = record['user'];
    return this.objectRecord(user);
  }

  private relatedUserId(value: unknown): string | null {
    return this.normalizeId(this.relatedUserRecord(value));
  }

  private relatedUserLabel(value: unknown): string | null {
    const userRecord = this.relatedUserRecord(value);
    if (userRecord) {
      return this.pickDisplayName(userRecord);
    }
    return this.pickDisplayName(value);
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private buildScanRows(
    scans: WellnessScanRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    return this.buildScanMap(scans, memberMap, departmentMap, timezone);
  }

  private severityLabel(value: unknown): string {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return 'Normal';
    }
    return this.toTitleCase(normalized.replace(/[_-]+/g, ' '));
  }

  private alertStatusLabel(value: unknown): string {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return 'New';
    }
    if (normalized === 'new') return 'New';
    if (normalized === 'seen') return 'Seen';
    if (normalized === 'reviewed') return 'Reviewed';
    if (normalized === 'resolved') return 'Resolved';
    if (normalized === 'overridden') return 'Overridden';
    return this.toTitleCase(normalized.replace(/[_-]+/g, ' '));
  }

  private requestStatusLabel(status: unknown, dueAt?: string | null): string {
    const normalized = this.normalizeText(status);
    if (normalized.includes('cancel')) {
      return 'Canceled';
    }
    if (normalized.includes('complete')) {
      return 'Completed';
    }
    if (normalized.includes('sent')) {
      return 'Sent';
    }
    if (normalized.includes('overdue')) {
      return 'Overdue';
    }
    if (dueAt && this.toTimestamp(dueAt) < Date.now()) {
      return 'Overdue';
    }
    return 'Pending';
  }

  private isOpenAlertStatus(status: unknown): boolean {
    const normalized = this.normalizeText(status);
    return normalized === 'new' || normalized === 'seen';
  }

  private isOpenRequest(status: unknown, cancelled: unknown, completedAt: unknown): boolean {
    if (this.isTruthy(cancelled)) {
      return false;
    }
    if (this.pickString(completedAt)) {
      return false;
    }
    const normalized = this.normalizeText(status);
    return !normalized.includes('cancel') && !normalized.includes('complete');
  }

  private sourceLabel(value: unknown): string {
    const normalized = this.normalizeText(value);
    if (normalized === 'self' || normalized === 'self_scan') {
      return 'Self scan';
    }
    if (normalized === 'manager_request') {
      return 'Manager request';
    }
    if (normalized === 'scheduled') {
      return 'Scheduled';
    }
    if (normalized === 'bulk_request') {
      return 'Bulk request';
    }
    return 'Self scan';
  }

  private riskLabel(value: string | null): string {
    if (!value) {
      return 'Stable';
    }
    if (value === 'stable') return 'Stable';
    if (value === 'low_focus') return 'Low Focus';
    if (value === 'elevated_fatigue') return 'Elevated Fatigue';
    if (value === 'high_risk') return 'High Risk';
    return this.toTitleCase(value.replace(/[_-]+/g, ' '));
  }

  private normalizeRisk(value: unknown): 'stable' | 'low_focus' | 'elevated_fatigue' | 'high_risk' | null {
    const normalized = this.normalizeText(value);
    if (normalized === 'stable') return 'stable';
    if (normalized === 'low_focus' || normalized === 'low focus') return 'low_focus';
    if (normalized === 'elevated_fatigue' || normalized === 'elevated fatigue' || normalized === 'fatigue') return 'elevated_fatigue';
    if (normalized === 'high_risk' || normalized === 'high risk') return 'high_risk';
    return null;
  }

  private attentionPriority(reason: string): number {
    const normalized = this.normalizeText(reason);
    if (normalized.includes('high risk')) return 0;
    if (normalized.includes('elevated fatigue')) return 1;
    if (normalized.includes('pending request overdue')) return 2;
    if (normalized.includes('missing scan')) return 3;
    return 4;
  }

  private isSameDayInTimeZone(value: string | null, timeZone: string | null): boolean {
    if (!value) {
      return false;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const today = this.formatDateKey(new Date(), timeZone);
    return this.formatDateKey(date, timeZone) === today;
  }

  private formatDateTime(value: string | null | undefined, timeZone: string | null): string {
    if (!value) {
      return 'Unknown time';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  private formatDateKey(date: Date, timeZone: string | null): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    return `${year}-${month}-${day}`;
  }

  private buildScanRowsForSection(
    scans: WellnessScanRecord[],
    results: ScanResultRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    const scanRows = this.buildScanRows(scans, memberMap, departmentMap, timezone);
    const resultsByScan = new Map<string, ScanResultRecord>();
    for (const result of results ?? []) {
      const scanId = this.normalizeId(result.scan_id);
      if (scanId) {
        resultsByScan.set(scanId, result);
      }
    }

    return scanRows.map((row) => {
      const result = resultsByScan.get(row.id) ?? null;
      return {
        ...row,
        readinessScore: this.pickString(result?.readiness_score) ?? '0',
        riskLevel: this.riskLabel(this.normalizeRisk(result?.risk_level)),
        sourceLabel: row.sourceLabel
      };
    });
  }

  private combineErrors(errors: Array<string | null | undefined>): string | null {
    const unique = Array.from(new Set(errors.filter((value): value is string => Boolean(value && value.trim()))));
    if (!unique.length) {
      return null;
    }
    if (unique.length === 1) {
      return unique[0];
    }
    return 'Some dashboard sections could not be loaded.';
  }

  private normalizeRole(value: unknown): ActiveMemberRole | null {
    const normalized = this.normalizeText(value);
    if (normalized === 'owner') return 'owner';
    if (normalized === 'hr' || normalized === 'admin') return 'hr';
    if (normalized === 'manager') return 'manager';
    if (normalized === 'employee' || normalized === 'member' || normalized === 'viewer') return 'employee';
    return null;
  }

  private pickDepartmentName(value: unknown): string | null {
    const label = formatDepartment(value, '');
    return label || null;
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

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const raw = this.pickString(value);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isTruthy(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', '1', 'yes', 'active'].includes(normalized);
    }
    return false;
  }

  private isActiveStatus(value: string | null): boolean {
    const normalized = this.normalizeText(value);
    return normalized === 'active' || normalized === 'enabled';
  }

  private memberLabelForDepartment(member: DashboardMemberSummary, departmentMap: Map<string, string>): string {
    return this.resolveDepartmentLabel(member.departmentId, member.departmentName, departmentMap, null);
  }

  private buildDepartmentLabel(value: unknown, departmentMap: Map<string, string>): string {
    return this.resolveDepartmentLabel(
      this.normalizeId(value),
      this.pickDepartmentName(value),
      departmentMap,
      null
    );
  }

  private resolveDepartmentLabel(
    departmentId: string | null | undefined,
    departmentName: string | null | undefined,
    departmentMap: Map<string, string>,
    departmentsError: string | null
  ): string {
    const normalizedDepartmentId = this.normalizeId(departmentId);
    const directName = this.pickString(departmentName);
    if (!normalizedDepartmentId) {
      return 'Unassigned';
    }
    if (directName) {
      return directName;
    }
    const mappedName = departmentMap.get(normalizedDepartmentId);
    if (mappedName) {
      return mappedName;
    }
    return departmentsError ? 'Department unavailable' : 'Unknown department';
  }

  private buildScanResultRows(
    scans: WellnessScanRecord[],
    results: ScanResultRecord[],
    memberMap: Map<string, DashboardMemberSummary>,
    departmentMap: Map<string, string>,
    timezone: string | null
  ): Array<DashboardScanActivityItem & { completedAt: string | null; memberId: string | null; isToday: boolean; timestamp: number }> {
    const resultByScan = new Map<string, ScanResultRecord>();
    for (const result of results ?? []) {
      const scanId = this.normalizeId(result.scan_id);
      if (scanId) {
        resultByScan.set(scanId, result);
      }
    }

    return (scans ?? [])
      .map((scan) => {
        const memberId = this.normalizeId(scan.member);
        const member = memberId ? memberMap.get(memberId) ?? null : null;
        const completedAt = this.pickString(scan.completed_at) ?? this.pickString(scan.date_created);
        const result = this.normalizeId(scan.id) ? resultByScan.get(this.normalizeId(scan.id) as string) ?? null : null;
        return {
          id: this.normalizeId(scan.id) ?? 'scan',
          employeeName: memberId && member ? this.memberName(memberId, memberMap) : this.pickDisplayName(scan.member) ?? 'Team member',
          department: member ? this.memberLabelForDepartment(member, departmentMap) : this.buildDepartmentLabel(scan.department, departmentMap),
          completedLabel: this.formatDateTime(completedAt, timezone),
          readinessScore: this.pickString(result?.readiness_score) ?? '0',
          riskLevel: this.riskLabel(this.normalizeRisk(result?.risk_level)),
          sourceLabel: this.sourceLabel(scan.request_source),
          sourceKey: this.normalizeText(scan.request_source) || 'self',
          employeeRoute: null,
          resultRoute: null,
          completedAt,
          memberId,
          isToday: this.isSameDayInTimeZone(completedAt, timezone),
          timestamp: this.toTimestamp(completedAt)
        };
      })
      .sort((left, right) => right.timestamp - left.timestamp);
  }

  private memberName(userId: string | null, memberMap: Map<string, DashboardMemberSummary>): string {
    if (!userId) {
      return 'Team member';
    }
    const member = memberMap.get(userId);
    if (!member) {
      return 'Team member';
    }
    return member.employeeName || 'Team member';
  }

  private describeHttpError(_error: unknown, fallback: string): string {
    return fallback;
  }

  private setFilter(params: URLSearchParams, path: string[], operator: string, value: string): void {
    let key = 'filter';
    for (const part of path) {
      key += `[${part}]`;
    }
    key += `[${operator}]`;
    params.set(key, value);
  }

  private toTitleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
