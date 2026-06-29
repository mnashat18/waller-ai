import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import {
  formatDepartment,
  formatUserName,
  sanitizeDisplayValue
} from '../shared/utils/display-formatters';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { WorkforceRosterApiService, type WorkforceRosterQueueRow, type WorkforceRosterRow } from './workforce-roster-api.service';

export type ReportsDateRange = 'today' | 'last7' | 'last30' | 'custom';
export type ReportsReadinessFilter = 'all' | 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk' | 'No scan';
export type ReportsAlertSeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';

export type ReportsFilters = {
  dateRange: ReportsDateRange;
  department: string;
  readiness: ReportsReadinessFilter;
  alertSeverity: ReportsAlertSeverityFilter;
};

export type ExecutiveSummary = {
  averageComplianceRate: number | null;
  totalCompletedScans: number;
  missingScans: number | null;
  stableOutcomes: number;
  attentionOutcomes: number;
  openAlerts: number;
  overdueRequests: number;
  scanEligibleMembers: number;
};

export type ReadinessDistributionRow = {
  key: 'stable' | 'low_focus' | 'elevated_fatigue' | 'high_risk';
  label: 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk';
  count: number;
  percent: number;
};

export type ReadinessTrendDay = {
  dateKey: string;
  dateLabel: string;
  stable: number;
  lowFocus: number;
  elevatedFatigue: number;
  highRisk: number;
  total: number;
};

export type ReadinessTrends = {
  distribution: ReadinessDistributionRow[];
  daily: ReadinessTrendDay[];
  hasData: boolean;
};

export type ComplianceTrendRow = {
  dateKey: string;
  dateLabel: string;
  activeMembers: number;
  completed: number;
  missing: number;
  complianceRate: number;
};

export type MissingScanDetailRow = {
  key: string;
  dateKey: string;
  dateLabel: string;
  memberId: string;
  memberName: string;
  email: string;
  departmentId: string | null;
  departmentName: string;
  expectedCheck: 'Expected';
  scanStatus: 'Missing';
};

export type MissingScanDetails = {
  foundCount: number;
  shownCount: number;
  hiddenCount: number;
  rows: MissingScanDetailRow[];
};

export type DepartmentPerformanceRow = {
  key: string;
  departmentId: string | null;
  departmentName: string;
  activeMembers: number;
  completedScans: number;
  missingScans: number;
  complianceRate: number;
  attentionOutcomes: number;
  openAlerts: number;
};

export type AlertsBreakdownRow = {
  id: string;
  title: string;
  departmentName: string;
  severity: string;
  status: string;
  createdLabel: string;
  reviewedAtLabel: string;
  actionTypeLabel: string;
};

export type AlertsBreakdown = {
  byStatus: Array<{ label: string; count: number }>;
  bySeverity: Array<{ label: string; count: number }>;
  byDepartment: Array<{ label: string; count: number }>;
  rows: AlertsBreakdownRow[];
};

export type ScanRequestPerformance = {
  totalRequestsSent: number;
  completedRequests: number;
  pendingRequests: number;
  overdueRequests: number;
  cancelledRequests: number;
  completionRate: number;
  requestTypeBreakdown: Array<{ label: string; count: number }>;
  available: boolean;
};

export type OverdueRequestDetailRow = {
  id: string;
  requestedAt: string | null;
  requestedAtLabel: string;
  dueAt: string | null;
  dueAtLabel: string;
  targetName: string;
  departmentName: string;
  requestTypeLabel: string;
  statusLabel: string;
  targetMemberId: string | null;
};

export type ReportsSourceCounts = {
  members: number;
  departments: number;
  wellnessScans: number;
  scanResults: number;
  scanRequests: number;
  alerts: number;
};

export type ReportsViewData = {
  workspaceName: string;
  role: string;
  filters: ReportsFilters;
  executiveSummary: ExecutiveSummary;
  readinessTrends: ReadinessTrends;
  complianceTrend: ComplianceTrendRow[];
  missingScanDetails: MissingScanDetails;
  departmentPerformance: DepartmentPerformanceRow[];
  alertsBreakdown: AlertsBreakdown;
  scanRequestPerformance: ScanRequestPerformance;
  overdueRequestDetails: OverdueRequestDetailRow[];
  departmentOptions: Array<{ id: string; name: string }>;
  partialWarning: string | null;
  permissionDenied: boolean;
  hasAnyData: boolean;
  sourceCounts: ReportsSourceCounts;
};

type BusinessMemberRecord = {
  id?: string | number;
  status?: string | null;
  type?: string | null;
  state?: string | null;
  is_targetable?: boolean | null;
  user?: string | number | { id?: string | number; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  business_profile?: string | number | { id?: string | number } | null;
  member_role?: string | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  shift_template?: string | number | null;
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

type DepartmentRecord = {
  id?: string | number;
  date_created?: string | null;
  date_updated?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  name?: string | null;
  manager_member?: string | number | { id?: string | number } | null;
  is_active?: boolean | null;
};

type WellnessScanRecord = {
  id?: string | number;
  status?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  user?: string | number | { id?: string | number } | null;
  started_at?: string | null;
  completed_at?: string | null;
  consent_granted?: boolean | null;
  business_profile?: string | number | { id?: string | number } | null;
  member?: string | number | { id?: string | number } | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  request_source?: string | null;
  device_platform?: string | null;
  failure_reason?: string | null;
  department_name_snapshot?: string | null;
  member_role_snapshot?: string | null;
  shift_template_name_snapshot?: string | null;
};

type ScanResultRecord = {
  id?: string | number;
  date_created?: string | null;
  scan_id?: string | number | { id?: string | number } | null;
  risk_level?: string | null;
  readiness_score?: number | string | null;
};

type ScanRequestRecord = {
  id?: string | number;
  business_profile?: string | number | { id?: string | number } | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  requested_by_user?: string | number | { id?: string | number } | null;
  target_member?: string | number | { id?: string | number } | null;
  status?: string | null;
  cancelled?: boolean | string | null;
  requested_at?: string | null;
  due_at?: string | null;
  completed_scan?: string | number | { id?: string | number } | null;
  completed_at?: string | null;
  request_type?: string | null;
  scan_id?: string | number | { id?: string | number } | null;
  required_state?: string | null;
  response_status?: string | null;
  response_payload?: unknown;
  timestamp?: string | null;
  requested_for_user?: string | number | { id?: string | number } | null;
  requested_for_email?: string | null;
  requested_for_phone?: string | null;
  Target?: string | null;
};

type AlertRecord = {
  id?: string | number;
  date_created?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  target_member?: string | number | { id?: string | number } | null;
  target_user?: string | number | { id?: string | number } | null;
  scan?: string | number | { id?: string | number } | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  status?: string | null;
  reviewed_by?: string | number | { id?: string | number } | null;
  reviewed_at?: string | null;
  action_note?: string | null;
  action_type?: string | null;
};

type NormalizedMember = {
  id: string;
  name: string;
  email: string;
  status: string;
  memberRole: string;
  departmentId: string | null;
  departmentName: string;
  userId: string | null;
  lastScanAt: string | null;
  lastRiskLevel: string | null;
};

type NormalizedDepartment = {
  id: string;
  name: string;
  isActive: boolean;
};

type NormalizedScan = {
  id: string;
  status: string;
  memberId: string | null;
  userId: string | null;
  departmentId: string | null;
  completedAt: string | null;
  dateCreated: string | null;
};

type NormalizedResult = {
  id: string;
  scanId: string | null;
  riskLevel: string | null;
  readinessScore: number | null;
  dateCreated: string | null;
};

type NormalizedRequest = {
  id: string;
  departmentId: string | null;
  targetMemberId: string | null;
  status: string;
  cancelled: boolean;
  requestedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  requestType: string | null;
};

type NormalizedAlert = {
  id: string;
  departmentId: string | null;
  targetMemberId: string | null;
  severity: string;
  status: string;
  title: string;
  dateCreated: string | null;
  reviewedAt: string | null;
  actionType: string | null;
};

type RawReportsData = {
  members: NormalizedMember[];
  departments: NormalizedDepartment[];
  wellnessScans: NormalizedScan[];
  scanResults: NormalizedResult[];
  scanRequests: NormalizedRequest[];
  alerts: NormalizedAlert[];
};

type ReportsComputedState = {
  filters: ReportsFilters;
  executiveSummary: ExecutiveSummary;
  readinessTrends: ReadinessTrends;
  complianceTrend: ComplianceTrendRow[];
  missingScanDetails: MissingScanDetails;
  departmentPerformance: DepartmentPerformanceRow[];
  alertsBreakdown: AlertsBreakdown;
  scanRequestPerformance: ScanRequestPerformance;
  overdueRequestDetails: OverdueRequestDetailRow[];
};

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly api = environment.API_URL;
  private cache:
    | {
        workspaceId: string;
        role: string;
        raw: RawReportsData;
        unavailableSources: string[];
      }
    | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private workforceRosterApi: WorkforceRosterApiService
  ) {}

  async loadReports(
    activeContext: Awaited<ReturnType<CompanyContextService['ensureActiveContext']>>,
    filters: ReportsFilters,
    refresh = true
  ): Promise<ReportsViewData> {
    const role = this.normalizeText(activeContext?.activeMemberRole);
    const workspaceId = this.normalizeId(activeContext?.activeBusinessProfile?.id);
    const membershipId = this.normalizeId(activeContext?.activeMembership?.id);

    if (!workspaceId || !membershipId) {
      throw new Error('NO_ACTIVE_WORKSPACE');
    }
    if (!role || role === 'employee') {
      throw new Error('ROLE_FORBIDDEN');
    }

    const useCache = !refresh && this.cache?.workspaceId === workspaceId;
    const warnings = new Set<string>();
    let forbiddenSources = 0;

    let raw: RawReportsData;
    if (useCache && this.cache) {
      raw = this.cache.raw;
      for (const source of this.cache.unavailableSources) {
        warnings.add(source);
      }
    } else {
      const token = this.auth.getStoredAccessToken() ?? '';
      const activeDepartmentId =
        role === 'manager' ? this.normalizeId(activeContext?.activeMembership?.department) : null;
      if (role === 'manager' && !activeDepartmentId) {
        throw new Error('Scoped data unavailable: manager account has no active department context.');
      }
      const loadRange = this.resolveDateRange('last30');

      const membersPromise = this.loadMembers(token, workspaceId, activeDepartmentId);
      const departmentsPromise = this.loadDepartments(token, workspaceId, activeDepartmentId);
      const scansPromise = this.loadWellnessScans(token, workspaceId, activeDepartmentId, loadRange.startIso);
      const requestsPromise = this.loadScanRequests(token, workspaceId, activeDepartmentId, loadRange.startIso);
      const alertsPromise = this.loadAlerts(token, workspaceId, activeDepartmentId, loadRange.startIso);

      const [membersSettled, departmentsSettled, scansSettled, requestsSettled, alertsSettled] =
        await Promise.allSettled([
          membersPromise,
          departmentsPromise,
          scansPromise,
          requestsPromise,
          alertsPromise
        ]);

      const membersRaw = this.resolveSettled('workforce_roster', membersSettled, warnings, () => {
        forbiddenSources += 1;
      });
      const departmentsRaw = this.resolveSettled('departments', departmentsSettled, warnings, () => {
        forbiddenSources += 1;
      });
      const scansRaw = this.resolveSettled('wellness_scans', scansSettled, warnings, () => {
        forbiddenSources += 1;
      });
      const requestsRaw = this.resolveSettled('workforce_scan_requests', requestsSettled, warnings, () => {
        forbiddenSources += 1;
      });
      const alertsRaw = this.resolveSettled('alerts', alertsSettled, warnings, () => {
        forbiddenSources += 1;
      });

      const scanIds = scansRaw
        .map((scan) => this.normalizeId(scan.id))
        .filter((id): id is string => Boolean(id));

      let scanResultsRaw: ScanResultRecord[] = [];
      if (scanIds.length > 0) {
        try {
          scanResultsRaw = await this.loadScanResults(token, scanIds);
        } catch (error: unknown) {
          warnings.add('scan_results');
          if (this.httpStatus(error) === 401 || this.httpStatus(error) === 403) {
            forbiddenSources += 1;
          }
        }
      }

      const normalizedMembers = this.normalizeMembers(membersRaw);
      const normalizedDepartments = this.normalizeDepartments(departmentsRaw, normalizedMembers);
      const normalizedScans = this.normalizeScans(scansRaw, normalizedMembers);
      const normalizedResults = this.normalizeResults(scanResultsRaw);
      const normalizedRequests = this.normalizeRequests(requestsRaw, normalizedMembers);
      const normalizedAlerts = this.normalizeAlerts(alertsRaw);

      raw = {
        members: normalizedMembers,
        departments: normalizedDepartments,
        wellnessScans: normalizedScans,
        scanResults: normalizedResults,
        scanRequests: normalizedRequests,
        alerts: normalizedAlerts
      };

      this.cache = {
        workspaceId,
        role,
        raw,
        unavailableSources: Array.from(warnings.values())
      };
    }

    const computed = this.computeAll(raw, filters);
    if (warnings.has('requests')) {
      computed.scanRequestPerformance.available = false;
    }
    const hasAnyData =
      raw.members.length > 0 ||
      raw.wellnessScans.length > 0 ||
      raw.scanRequests.length > 0 ||
      raw.alerts.length > 0;

    return {
      workspaceName: activeContext?.activeBusinessProfile?.company_name?.trim() || 'Current workspace',
      role,
      filters,
      executiveSummary: computed.executiveSummary,
      readinessTrends: computed.readinessTrends,
      complianceTrend: computed.complianceTrend,
      missingScanDetails: computed.missingScanDetails,
      departmentPerformance: computed.departmentPerformance,
      alertsBreakdown: computed.alertsBreakdown,
      scanRequestPerformance: computed.scanRequestPerformance,
      overdueRequestDetails: computed.overdueRequestDetails,
      departmentOptions: this.buildDepartmentOptions(raw),
      partialWarning: warnings.size
        ? 'Some reporting sources are unavailable due to workspace permissions.'
        : null,
      permissionDenied: forbiddenSources >= 4 && !hasAnyData,
      hasAnyData,
      sourceCounts: {
        members: raw.members.length,
        departments: raw.departments.length,
        wellnessScans: raw.wellnessScans.length,
        scanResults: raw.scanResults.length,
        scanRequests: raw.scanRequests.length,
        alerts: raw.alerts.length
      }
    };
  }

  computeExecutiveSummary(rawData: RawReportsData, filters: ReportsFilters): ExecutiveSummary {
    const range = this.resolveDateRange(filters.dateRange);
    const filteredMembers = this.filteredActiveMembers(rawData.members, filters.department);
    const filteredScans = this.filterScans(rawData, filters, range);
    const filteredResults = this.filterResults(rawData, filters, range);
    const filteredAlerts = this.filterAlerts(rawData.alerts, filters, range);
    const filteredRequests = this.filterRequests(rawData.scanRequests, filters, range);

    const eligibleMemberCount = filteredMembers.length;

    const completedMemberIds = new Set<string>();
    for (const scan of filteredScans) {
      if (!this.isCompletedScanStatus(scan.status)) continue;
      const memberId = scan.memberId;
      if (!memberId) continue;
      const ts = this.scanTimestamp(scan);
      if (!ts || ts < range.start || ts >= range.end) continue;
      completedMemberIds.add(memberId);
    }

    const completedScans = completedMemberIds.size;
    const stableOutcomes = filteredResults.filter((item) => this.normalizeText(item.riskLevel) === 'stable').length;
    const attentionOutcomes = filteredResults.filter((item) => {
      const risk = this.normalizeText(item.riskLevel);
      return risk === 'elevated_fatigue' || risk === 'high_risk';
    }).length;
    const openAlerts = filteredAlerts.filter((item) => this.isOpenAlertStatus(item.status)).length;
    const overdueRequests = filteredRequests.filter((item) => this.isOverdueRequest(item)).length;
    const missingScans = eligibleMemberCount > 0 ? Math.max(eligibleMemberCount - completedScans, 0) : null;

    return {
      averageComplianceRate: eligibleMemberCount > 0 ? Math.round((completedScans / eligibleMemberCount) * 100) : null,
      totalCompletedScans: completedScans,
      missingScans,
      stableOutcomes,
      attentionOutcomes,
      openAlerts,
      overdueRequests,
      scanEligibleMembers: eligibleMemberCount
    };
  }

  computeReadinessTrends(rawData: RawReportsData, filters: ReportsFilters): ReadinessTrends {
    const range = this.resolveDateRange(filters.dateRange);
    const filteredResults = this.filterResults(rawData, filters, range);

    const distributionCounts = {
      stable: 0,
      low_focus: 0,
      elevated_fatigue: 0,
      high_risk: 0
    };
    const dayMap = new Map<string, ReadinessTrendDay>();

    for (const day of this.dayKeys(range.start, range.end)) {
      dayMap.set(day, {
        dateKey: day,
        dateLabel: this.dayLabel(day),
        stable: 0,
        lowFocus: 0,
        elevatedFatigue: 0,
        highRisk: 0,
        total: 0
      });
    }

    for (const result of filteredResults) {
      const risk = this.normalizeRiskLevel(result.riskLevel);
      if (!risk) continue;

      distributionCounts[risk] += 1;
      const ts = this.toTimestamp(result.dateCreated);
      const key = this.dayKey(ts);
      const bucket = dayMap.get(key);
      if (!bucket) continue;

      if (risk === 'stable') bucket.stable += 1;
      if (risk === 'low_focus') bucket.lowFocus += 1;
      if (risk === 'elevated_fatigue') bucket.elevatedFatigue += 1;
      if (risk === 'high_risk') bucket.highRisk += 1;
      bucket.total += 1;
    }

    const total = filteredResults.length;
    const distribution: ReadinessDistributionRow[] = [
      { key: 'stable', label: 'Stable', count: distributionCounts.stable, percent: total > 0 ? Math.round((distributionCounts.stable / total) * 100) : 0 },
      { key: 'low_focus', label: 'Low Focus', count: distributionCounts.low_focus, percent: total > 0 ? Math.round((distributionCounts.low_focus / total) * 100) : 0 },
      { key: 'elevated_fatigue', label: 'Elevated Fatigue', count: distributionCounts.elevated_fatigue, percent: total > 0 ? Math.round((distributionCounts.elevated_fatigue / total) * 100) : 0 },
      { key: 'high_risk', label: 'High Risk', count: distributionCounts.high_risk, percent: total > 0 ? Math.round((distributionCounts.high_risk / total) * 100) : 0 }
    ];

    return {
      distribution,
      daily: Array.from(dayMap.values()),
      hasData: total > 0
    };
  }

  computeComplianceTrend(rawData: RawReportsData, filters: ReportsFilters): ComplianceTrendRow[] {
    const range = this.resolveDateRange(filters.dateRange);
    const activeMembers = this.filteredActiveMembers(rawData.members, filters.department);
    const scans = this.filterScans(rawData, filters, range);
    const days = this.dayKeys(range.start, range.end);

    const rows: ComplianceTrendRow[] = [];
    for (const day of days) {
      const dayStart = this.toTimestamp(`${day}T00:00:00`);
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const completedMembers = new Set<string>();

      for (const scan of scans) {
        if (!this.isCompletedScanStatus(scan.status)) continue;
        const ts = this.scanTimestamp(scan);
        if (ts < dayStart || ts >= dayEnd) continue;
        if (scan.memberId) {
          completedMembers.add(scan.memberId);
        }
      }

      const completed = completedMembers.size;
      const activeCount = activeMembers.length;
      const missing = Math.max(activeCount - completed, 0);
      rows.push({
        dateKey: day,
        dateLabel: this.dayLabel(day),
        activeMembers: activeCount,
        completed,
        missing,
        complianceRate: activeCount > 0 ? Math.round((completed / activeCount) * 100) : 0
      });
    }

    return rows;
  }

  computeMissingScanDetails(rawData: RawReportsData, filters: ReportsFilters): MissingScanDetails {
    const range = this.resolveDateRange(filters.dateRange);
    const activeMembers = this.filteredActiveMembers(rawData.members, filters.department);
    const filteredScans = this.filterScans(rawData, filters, range);
    const completedMemberDay = new Set<string>();

    for (const scan of filteredScans) {
      if (!this.isCompletedScanStatus(scan.status)) continue;
      if (!scan.memberId) continue;
      const ts = this.scanTimestamp(scan);
      if (ts < range.start || ts >= range.end) continue;
      completedMemberDay.add(`${scan.memberId}:${this.dayKey(ts)}`);
    }

    const allRows: MissingScanDetailRow[] = [];
    for (const day of this.dayKeys(range.start, range.end)) {
      for (const member of activeMembers) {
        const key = `${member.id}:${day}`;
        if (completedMemberDay.has(key)) continue;
        allRows.push({
          key: `${day}:${member.id}`,
          dateKey: day,
          dateLabel: this.dayLabel(day),
          memberId: member.id,
          memberName: member.name || member.email || 'Assigned member',
          email: member.email || '-',
          departmentId: member.departmentId,
          departmentName: member.departmentName || 'Unassigned',
          expectedCheck: 'Expected',
          scanStatus: 'Missing'
        });
      }
    }

    const visibleRows = allRows.filter((row) => {
      if (filters.readiness === 'all' || filters.readiness === 'No scan') {
        return true;
      }
      return false;
    });

    return {
      foundCount: allRows.length,
      shownCount: visibleRows.length,
      hiddenCount: Math.max(allRows.length - visibleRows.length, 0),
      rows: visibleRows
    };
  }

  computeDepartmentPerformance(rawData: RawReportsData, filters: ReportsFilters): DepartmentPerformanceRow[] {
    const range = this.resolveDateRange(filters.dateRange);
    const activeMembers = this.filteredActiveMembers(rawData.members, '');
    const filteredScans = this.filterScans(rawData, { ...filters, department: '' }, range);
    const filteredResults = this.filterResults(rawData, { ...filters, department: '' }, range);
    const filteredAlerts = this.filterAlerts(rawData.alerts, { ...filters, department: '', alertSeverity: 'all', readiness: 'all', dateRange: filters.dateRange }, range);

    const departmentMap = new Map<string, { id: string | null; name: string }>();
    for (const department of rawData.departments) {
      departmentMap.set(department.id, { id: department.id, name: department.name });
    }
    for (const member of activeMembers) {
      if (member.departmentId) {
        departmentMap.set(member.departmentId, {
          id: member.departmentId,
          name: member.departmentName || departmentMap.get(member.departmentId)?.name || 'Unnamed Department'
        });
      }
    }
    if (activeMembers.some((member) => !member.departmentId)) {
      departmentMap.set('unassigned', { id: null, name: 'Unassigned' });
    }

    const scanToDepartment = new Map<string, string | null>();
    for (const scan of filteredScans) {
      scanToDepartment.set(scan.id, scan.departmentId);
    }

    const rows: DepartmentPerformanceRow[] = [];
    for (const [key, department] of departmentMap.entries()) {
      const deptMembers = activeMembers.filter((member) =>
        department.id ? member.departmentId === department.id : !member.departmentId
      );
      const memberIds = new Set(deptMembers.map((member) => member.id));
      const completedMemberIds = new Set<string>();

      for (const scan of filteredScans) {
        if (!this.isCompletedScanStatus(scan.status)) continue;
        if (!scan.memberId || !memberIds.has(scan.memberId)) continue;
        const ts = this.scanTimestamp(scan);
        if (ts < range.start || ts >= range.end) continue;
        completedMemberIds.add(scan.memberId);
      }

      let openAlerts = 0;
      for (const alert of filteredAlerts) {
        const belongs = department.id ? alert.departmentId === department.id : !alert.departmentId;
        if (belongs && this.isOpenAlertStatus(alert.status)) {
          openAlerts += 1;
        }
      }

      let attentionOutcomes = 0;
      for (const result of filteredResults) {
        const scanId = result.scanId;
        if (!scanId) continue;
        const resultDepartment = scanToDepartment.get(scanId) ?? null;
        const belongs = department.id ? resultDepartment === department.id : !resultDepartment;
        if (!belongs) continue;
        const risk = this.normalizeRiskLevel(result.riskLevel);
        if (risk === 'elevated_fatigue' || risk === 'high_risk') {
          attentionOutcomes += 1;
        }
      }

      const activeCount = deptMembers.length;
      const completedScans = completedMemberIds.size;
      const missingScans = Math.max(activeCount - completedScans, 0);
      rows.push({
        key,
        departmentId: department.id,
        departmentName: department.name,
        activeMembers: activeCount,
        completedScans,
        missingScans,
        complianceRate: activeCount > 0 ? Math.round((completedScans / activeCount) * 100) : 0,
        attentionOutcomes,
        openAlerts
      });
    }

    const filtered = this.applyDepartmentFilterToDepartmentRows(rows, filters.department);
    return filtered.sort((left, right) => {
      if (left.departmentName === 'Unassigned') return 1;
      if (right.departmentName === 'Unassigned') return -1;
      return left.departmentName.localeCompare(right.departmentName);
    });
  }

  computeAlertsBreakdown(rawData: RawReportsData, filters: ReportsFilters): AlertsBreakdown {
    const range = this.resolveDateRange(filters.dateRange);
    const alerts = this.filterAlerts(rawData.alerts, filters, range);
    const departmentNameById = new Map(rawData.departments.map((item) => [item.id, item.name]));

    const byStatusMap = new Map<string, number>();
    const bySeverityMap = new Map<string, number>();
    const byDepartmentMap = new Map<string, number>();

    for (const alert of alerts) {
      const statusLabel = this.statusLabel(alert.status);
      const severityLabel = this.severityLabel(alert.severity);
      const departmentLabel = alert.departmentId
        ? (departmentNameById.get(alert.departmentId) || 'Unassigned')
        : 'Unassigned';

      byStatusMap.set(statusLabel, (byStatusMap.get(statusLabel) ?? 0) + 1);
      bySeverityMap.set(severityLabel, (bySeverityMap.get(severityLabel) ?? 0) + 1);
      byDepartmentMap.set(departmentLabel, (byDepartmentMap.get(departmentLabel) ?? 0) + 1);
    }

    const rows = alerts
      .slice()
      .sort((left, right) => this.toTimestamp(right.dateCreated) - this.toTimestamp(left.dateCreated))
      .slice(0, 120)
      .map((alert) => ({
        id: alert.id,
        title: alert.title || 'Operational alert',
        departmentName: alert.departmentId
          ? (departmentNameById.get(alert.departmentId) || 'Unassigned')
          : 'Unassigned',
        severity: this.severityLabel(alert.severity),
        status: this.statusLabel(alert.status),
        createdLabel: this.formatDateTime(alert.dateCreated, '-'),
        reviewedAtLabel: this.formatDateTime(alert.reviewedAt, '-'),
        actionTypeLabel: this.actionTypeLabel(alert.actionType)
      }));

    return {
      byStatus: this.mapToSortedRows(byStatusMap),
      bySeverity: this.mapToSortedRows(bySeverityMap),
      byDepartment: this.mapToSortedRows(byDepartmentMap),
      rows
    };
  }

  computeScanRequestPerformance(rawData: RawReportsData, filters: ReportsFilters): ScanRequestPerformance {
    const range = this.resolveDateRange(filters.dateRange);
    const requests = this.filterRequests(rawData.scanRequests, filters, range);

    const totalRequestsSent = requests.length;
    const completedRequests = requests.filter((item) => this.isCompletedRequest(item)).length;
    const pendingRequests = requests.filter((item) => this.isPendingRequestStatus(item.status)).length;
    const overdueRequests = requests.filter((item) => this.isOverdueRequest(item)).length;
    const cancelledRequests = requests.filter((item) => this.isCancelledRequest(item)).length;

    const requestTypeMap = new Map<string, number>();
    for (const request of requests) {
      const label = request.requestType?.trim() || 'unspecified';
      requestTypeMap.set(label, (requestTypeMap.get(label) ?? 0) + 1);
    }

    return {
      totalRequestsSent,
      completedRequests,
      pendingRequests,
      overdueRequests,
      cancelledRequests,
      completionRate: totalRequestsSent > 0 ? Math.round((completedRequests / totalRequestsSent) * 100) : 0,
      requestTypeBreakdown: this.mapToSortedRows(requestTypeMap),
      available: true
    };
  }

  computeOverdueRequestDetails(rawData: RawReportsData, filters: ReportsFilters): OverdueRequestDetailRow[] {
    const range = this.resolveDateRange(filters.dateRange);
    const filteredRequests = this.filterRequests(rawData.scanRequests, filters, range);
    const departmentNameById = new Map(rawData.departments.map((department) => [department.id, department.name]));
    const memberById = new Map(rawData.members.map((member) => [member.id, member]));

    return filteredRequests
      .filter((request) => this.isOverdueRequest(request))
      .sort((left, right) => this.toTimestamp(right.dueAt) - this.toTimestamp(left.dueAt))
      .map((request) => {
        const member = request.targetMemberId ? (memberById.get(request.targetMemberId) ?? null) : null;
        const targetName = member?.name || member?.email || 'Assigned member';
        return {
          id: request.id,
          requestedAt: request.requestedAt,
          requestedAtLabel: this.formatDateTime(request.requestedAt, '-'),
          dueAt: request.dueAt,
          dueAtLabel: this.formatDateTime(request.dueAt, '-'),
          targetName,
          departmentName: request.departmentId ? (departmentNameById.get(request.departmentId) || 'Unassigned') : 'Unassigned',
          requestTypeLabel: this.requestTypeLabel(request.requestType),
          statusLabel: this.requestStatusLabel(request),
          targetMemberId: request.targetMemberId
        } satisfies OverdueRequestDetailRow;
      });
  }

  exportReportsCsv(viewState: ReportsViewData): void {
    const rows: string[] = [];
    rows.push('Section 1: Executive Summary');
    rows.push(this.toCsvLine(['Metric', 'Value']));
    rows.push(this.toCsvLine(['Average Compliance Rate', this.formatOptionalPercent(viewState.executiveSummary.averageComplianceRate)]));
    rows.push(this.toCsvLine(['Total Completed Scans', String(viewState.executiveSummary.totalCompletedScans)]));
    rows.push(this.toCsvLine(['Missing Scans', this.formatOptionalNumber(viewState.executiveSummary.missingScans)]));
    rows.push(this.toCsvLine(['Eligible Current Members', String(viewState.executiveSummary.scanEligibleMembers)]));
    rows.push(this.toCsvLine(['Stable Outcomes', String(viewState.executiveSummary.stableOutcomes)]));
    rows.push(this.toCsvLine(['Attention Outcomes', String(viewState.executiveSummary.attentionOutcomes)]));
    rows.push(this.toCsvLine(['Open Alerts', String(viewState.executiveSummary.openAlerts)]));
    rows.push(this.toCsvLine(['Overdue Requests', String(viewState.executiveSummary.overdueRequests)]));
    rows.push('');

    rows.push('Section 2: Compliance Trend');
    rows.push(this.toCsvLine(['Date', 'Active Members', 'Completed', 'Missing', 'Compliance Rate']));
    for (const item of viewState.complianceTrend) {
      rows.push(
        this.toCsvLine([
          item.dateLabel,
          String(item.activeMembers),
          String(item.completed),
          String(item.missing),
          item.activeMembers > 0 ? `${item.complianceRate}%` : 'Unavailable'
        ])
      );
    }
    rows.push('');

    rows.push('Section 3: Missing Scan Details');
    rows.push(this.toCsvLine(['Date', 'Member', 'Email', 'Department', 'Expected Check', 'Scan Status']));
    for (const item of viewState.missingScanDetails.rows) {
      rows.push(this.toCsvLine([
        item.dateLabel,
        item.memberName,
        item.email,
        item.departmentName,
        item.expectedCheck,
        item.scanStatus
      ]));
    }
    rows.push('');

    rows.push('Section 4: Department Performance');
    rows.push(this.toCsvLine([
      'Department',
      'Active Members',
      'Completed Scans',
      'Missing Scans',
      'Compliance Rate',
      'Attention Outcomes',
      'Open Alerts'
    ]));
    for (const item of viewState.departmentPerformance) {
      rows.push(this.toCsvLine([
        item.departmentName,
        String(item.activeMembers),
        String(item.completedScans),
        String(item.missingScans),
        `${item.complianceRate}%`,
        String(item.attentionOutcomes),
        String(item.openAlerts)
      ]));
    }
    rows.push('');

    rows.push('Section 5: Alerts Breakdown');
    rows.push(this.toCsvLine([
      'Alert Type / Title',
      'Department',
      'Severity',
      'Status',
      'Created',
      'Reviewed At',
      'Action Type'
    ]));
    for (const item of viewState.alertsBreakdown.rows) {
      rows.push(this.toCsvLine([
        item.title,
        item.departmentName,
        item.severity,
        item.status,
        item.createdLabel,
        item.reviewedAtLabel,
        item.actionTypeLabel
      ]));
    }
    rows.push('');

    rows.push('Section 6: Scan Request Performance');
    rows.push(this.toCsvLine(['Metric', 'Value']));
    rows.push(this.toCsvLine(['Total Requests Sent', String(viewState.scanRequestPerformance.totalRequestsSent)]));
    rows.push(this.toCsvLine(['Completed Requests', String(viewState.scanRequestPerformance.completedRequests)]));
    rows.push(this.toCsvLine(['Pending Requests', String(viewState.scanRequestPerformance.pendingRequests)]));
    rows.push(this.toCsvLine(['Overdue Requests', String(viewState.scanRequestPerformance.overdueRequests)]));
    rows.push(this.toCsvLine(['Cancelled Requests', String(viewState.scanRequestPerformance.cancelledRequests)]));
    rows.push(this.toCsvLine(['Completion Rate', `${viewState.scanRequestPerformance.completionRate}%`]));
    rows.push('');
    rows.push(this.toCsvLine(['Request Type', 'Count']));
    for (const item of viewState.scanRequestPerformance.requestTypeBreakdown) {
      rows.push(this.toCsvLine([item.label, String(item.count)]));
    }
    rows.push('');

    rows.push('Section 7: Overdue Request Details');
    rows.push(this.toCsvLine([
      'Requested At',
      'Due At',
      'Target',
      'Department',
      'Request Type',
      'Status'
    ]));
    for (const item of viewState.overdueRequestDetails) {
      rows.push(this.toCsvLine([
        item.requestedAtLabel,
        item.dueAtLabel,
        item.targetName,
        item.departmentName,
        item.requestTypeLabel,
        item.statusLabel
      ]));
    }

    this.downloadCsv(this.buildExportFileName('reports-summary', viewState.filters.dateRange, 'csv'), rows);
  }

  exportDepartmentReportCsv(viewState: ReportsViewData): void {
    const rows: string[] = [];
    rows.push(this.toCsvLine([
      'Department',
      'Active Members',
      'Completed Scans',
      'Missing Scans',
      'Compliance Rate',
      'Attention Outcomes',
      'Open Alerts'
    ]));
    for (const item of viewState.departmentPerformance) {
      rows.push(
        this.toCsvLine([
          item.departmentName,
          String(item.activeMembers),
          String(item.completedScans),
          String(item.missingScans),
          item.activeMembers > 0 ? `${item.complianceRate}%` : 'Unavailable',
          String(item.attentionOutcomes),
          String(item.openAlerts)
        ])
      );
    }
    this.downloadCsv(this.buildExportFileName('department-report', viewState.filters.dateRange, 'csv'), rows);
  }

  exportAlertsReportCsv(viewState: ReportsViewData): void {
    const rows: string[] = [];
    rows.push(this.toCsvLine([
      'Alert Type / Title',
      'Department',
      'Severity',
      'Status',
      'Created',
      'Reviewed At',
      'Action Type'
    ]));
    for (const item of viewState.alertsBreakdown.rows) {
      rows.push(
        this.toCsvLine([
          item.title,
          item.departmentName,
          item.severity,
          item.status,
          item.createdLabel,
          item.reviewedAtLabel,
          item.actionTypeLabel
        ])
      );
    }
    this.downloadCsv(this.buildExportFileName('alerts-report', viewState.filters.dateRange, 'csv'), rows);
  }

  private computeAll(rawData: RawReportsData, filters: ReportsFilters): ReportsComputedState {
    const executiveSummary = this.computeExecutiveSummary(rawData, filters);
    const readinessTrends = this.computeReadinessTrends(rawData, filters);
    const complianceTrend = this.computeComplianceTrend(rawData, filters);
    const missingScanDetails = this.computeMissingScanDetails(rawData, filters);
    const departmentPerformance = this.computeDepartmentPerformance(rawData, filters);
    const alertsBreakdown = this.computeAlertsBreakdown(rawData, filters);
    const scanRequestPerformance = this.computeScanRequestPerformance(rawData, filters);
    const overdueRequestDetails = this.computeOverdueRequestDetails(rawData, filters);

    return {
      filters,
      executiveSummary,
      readinessTrends,
      complianceTrend,
      missingScanDetails,
      departmentPerformance,
      alertsBreakdown,
      scanRequestPerformance,
      overdueRequestDetails
    };
  }

  private async loadMembers(
    token: string,
    workspaceId: string,
    activeDepartmentId: string | null
  ): Promise<BusinessMemberRecord[]> {
    void token;
    void workspaceId;
    void activeDepartmentId;
    const roster = await firstValueFrom(this.workforceRosterApi.getWorkforceRoster());
    return (roster.rows ?? [])
      .map((row) => this.mapRosterRowToMemberRecord(row))
      .filter((item): item is BusinessMemberRecord => Boolean(item));
  }

  private async loadDepartments(
    token: string,
    workspaceId: string,
    activeDepartmentId: string | null
  ): Promise<DepartmentRecord[]> {
    const isManager = Boolean(activeDepartmentId);
    const filters: Array<{ path: string[]; operator: string; value: string }> = [
      { path: ['business_profile'], operator: '_eq', value: workspaceId },
      { path: ['is_active'], operator: '_eq', value: 'true' }
    ];
    if (activeDepartmentId) {
      filters.push({ path: ['id'], operator: '_eq', value: activeDepartmentId });
    }

    try {
      return await this.queryWithFieldFallback<DepartmentRecord>(
        'departments',
        isManager
          ? [['id', 'name', 'is_active']]
          : [
              ['id', 'date_created', 'date_updated', 'business_profile', 'name', 'manager_member', 'is_active'],
              ['id', 'business_profile', 'name', 'manager_member', 'is_active'],
              ['id', 'name', 'is_active']
            ],
        token,
        { filters, sort: 'name', limit: 400 }
      );
    } catch (error: unknown) {
      if (!this.isFieldCompatibilityError(error)) {
        throw error;
      }
      return this.queryWithFieldFallback<DepartmentRecord>(
        'departments',
        isManager
          ? [['id', 'name', 'is_active']]
          : [
              ['id', 'date_created', 'date_updated', 'business_profile', 'name', 'manager_member', 'is_active'],
              ['id', 'business_profile', 'name', 'manager_member', 'is_active'],
              ['id', 'name', 'is_active']
            ],
        token,
        {
          filters: activeDepartmentId
            ? [
                { path: ['business_profile'], operator: '_eq', value: workspaceId },
                { path: ['id'], operator: '_eq', value: activeDepartmentId }
              ]
            : [{ path: ['business_profile'], operator: '_eq', value: workspaceId }],
          sort: 'name',
          limit: 400
        }
      );
    }
  }

  private async loadWellnessScans(
    token: string,
    workspaceId: string,
    activeDepartmentId: string | null,
    startIso: string
  ): Promise<WellnessScanRecord[]> {
    const filters: Array<{ path: string[]; operator: string; value: string }> = [
      { path: ['business_profile'], operator: '_eq', value: workspaceId },
      { path: ['date_created'], operator: '_gte', value: startIso }
    ];
    if (activeDepartmentId) {
      filters.push({ path: ['department'], operator: '_eq', value: activeDepartmentId });
    }

    return this.queryWithFieldFallback<WellnessScanRecord>(
      'wellness_scans',
      [
        [
          'id', 'status', 'date_created', 'date_updated', 'user', 'started_at', 'completed_at', 'consent_granted',
          'business_profile', 'member', 'department',
          'request_source', 'device_platform', 'failure_reason', 'department_name_snapshot',
          'member_role_snapshot', 'shift_template_name_snapshot'
        ],
        [
          'id', 'status', 'date_created', 'date_updated', 'user', 'completed_at',
          'business_profile', 'member', 'department'
        ],
        ['id', 'status', 'date_created', 'completed_at', 'member', 'department']
      ],
      token,
      { filters, sort: '-date_created', limit: 2500 }
    );
  }

  private async loadScanResults(token: string, scanIds: string[]): Promise<ScanResultRecord[]> {
    const chunkSize = 120;
    const chunks: string[][] = [];
    for (let i = 0; i < scanIds.length; i += chunkSize) {
      chunks.push(scanIds.slice(i, i + chunkSize));
    }

    const rows: ScanResultRecord[] = [];
    for (const chunk of chunks) {
      const part = await this.queryWithFieldFallback<ScanResultRecord>(
        'scan_results',
        [
          [
            'id', 'date_created', 'scan_id', 'risk_level', 'readiness_score'
          ],
          ['id', 'date_created', 'scan_id', 'risk_level', 'readiness_score'],
          ['id', 'date_created', 'scan_id', 'risk_level']
        ],
        token,
        {
          filters: [{ path: ['scan_id'], operator: '_in', value: chunk.join(',') }],
          sort: '-date_created',
          limit: 2500
        }
      );
      rows.push(...part);
    }
    return rows;
  }

  private async loadScanRequests(
    token: string,
    workspaceId: string,
    activeDepartmentId: string | null,
    startIso: string
  ): Promise<ScanRequestRecord[]> {
    void token;
    void workspaceId;
    void activeDepartmentId;
    void startIso;
    const roster = await firstValueFrom(this.workforceRosterApi.getWorkforceRoster());
    return (roster.scan_requests?.rows ?? []).map((row) => this.mapRosterQueueRowToRequestRecord(row));
  }

  private async loadAlerts(
    token: string,
    workspaceId: string,
    activeDepartmentId: string | null,
    startIso: string
  ): Promise<AlertRecord[]> {
    const isManager = Boolean(activeDepartmentId);
    const filters: Array<{ path: string[]; operator: string; value: string }> = [
      { path: ['business_profile'], operator: '_eq', value: workspaceId },
      { path: ['date_created'], operator: '_gte', value: startIso }
    ];
    if (activeDepartmentId) {
      filters.push({ path: ['department'], operator: '_eq', value: activeDepartmentId });
    }

    try {
      return await this.queryWithFieldFallback<AlertRecord>(
        'alerts',
        isManager
          ? [['id', 'date_created', 'department', 'severity', 'title', 'message', 'status']]
          : [
              [
                'id', 'date_created', 'business_profile', 'department', 'target_member', 'target_user',
                'scan', 'severity', 'title', 'message', 'status', 'reviewed_by', 'reviewed_at', 'action_note', 'action_type'
              ],
              [
                'id', 'date_created', 'department', 'target_member', 'severity', 'title', 'message',
                'status', 'reviewed_at', 'action_type'
              ],
              ['id', 'date_created', 'severity', 'title', 'status']
            ],
        token,
        { filters, sort: '-date_created', limit: 2500 }
      );
    } catch (error) {
      if (!isManager && (error as { status?: number } | null)?.status === 403) {
        return [];
      }
      throw error;
    }
  }

  private mapRosterRowToMemberRecord(row: WorkforceRosterRow): BusinessMemberRecord | null {
    const id = row.member_id ?? null;
    if (!id) {
      return null;
    }
    return {
      id,
      status: row.status,
      type: row.type,
      state: row.state,
      is_targetable: row.is_targetable,
      member_role: row.member_role,
      department: row.department_id
        ? {
            id: row.department_id,
            name: row.department_name
          }
        : null,
      user: row.user_id
        ? {
            id: row.user_id,
            email: row.email,
            first_name: row.display_name,
            last_name: null
          }
        : null,
      last_scan_at: row.last_scan_at,
      last_risk_level: row.last_risk_level
    };
  }

  private mapRosterQueueRowToRequestRecord(row: WorkforceRosterQueueRow): ScanRequestRecord {
    const targetUserId = row.target_member?.user?.id ?? null;
    const targetMemberId = row.target_member?.id ?? null;
    const departmentId = row.department?.id ?? row.target_member?.department?.id ?? null;
    return {
      id: row.id,
      business_profile: row.business_profile ? { id: row.business_profile.id } : null,
      department: departmentId ? { id: departmentId } : null,
      requested_by_user: row.requested_by_user ? { id: row.requested_by_user.id } : null,
      target_member: targetMemberId ? { id: targetMemberId } : null,
      request_type: row.request_type,
      status: row.status,
      cancelled: row.cancelled,
      requested_at: row.requested_at,
      due_at: row.due_at,
      completed_at: row.completed_at,
      completed_scan: null,
      scan_id: null,
      required_state: row.request_type,
      response_status: row.status,
      response_payload: null,
      timestamp: row.requested_at,
      requested_for_user: targetUserId ? { id: targetUserId } : null,
      requested_for_email: row.target_member?.user?.email ?? null,
      requested_for_phone: null,
      Target: null
    };
  }

  private normalizeMembers(rows: BusinessMemberRecord[]): NormalizedMember[] {
    const seen = new Set<string>();

    return (rows ?? [])
      .map((row) => {
        const id = this.normalizeId(row.id);
        if (!id) return null;
        const status = this.normalizeText(row.status);
        const type = this.normalizeText(row.type);
        const state = this.normalizeText(row.state);
        const isTargetable = row.is_targetable !== false;
        const userRecord = this.objectRecord(row.user);
        const email = sanitizeDisplayValue(userRecord?.['email'], '-') || '-';
        const userId = this.normalizeId(userRecord?.['id'] ?? row.user);
        const userLabel = formatUserName(userRecord, '');
        const departmentRecord = this.objectRecord(row.department);
        const departmentId = this.normalizeId(departmentRecord?.['id'] ?? row.department);
        const departmentName = formatDepartment(departmentRecord ?? row.department, 'Unassigned');
        const memberRole = this.normalizeText(row.member_role);

        if (status !== 'active') return null;
        if (type && type !== 'member') return null;
        if (state && state !== 'verified_member') return null;
        if (!isTargetable) return null;
        if (!userId || email === '-') return null;
        if (!['employee', 'manager', 'hr'].includes(memberRole)) return null;

        const dedupeKey = userId || id;
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);

        return {
          id,
          name: userLabel || email || 'Unknown member',
          email,
          status,
          memberRole,
          departmentId,
          departmentName: departmentId ? departmentName : 'Unassigned',
          userId,
          lastScanAt: row.last_scan_at ?? null,
          lastRiskLevel: this.pickString(row.last_risk_level)
        } satisfies NormalizedMember;
      })
      .filter((row) => Boolean(row)) as NormalizedMember[];
  }

  private normalizeDepartments(
    rows: DepartmentRecord[],
    members: NormalizedMember[]
  ): NormalizedDepartment[] {
    const map = new Map<string, NormalizedDepartment>();
    for (const row of rows ?? []) {
      const id = this.normalizeId(row.id);
      if (!id) continue;
      map.set(id, {
        id,
        name: formatDepartment(row, 'Unnamed Department'),
        isActive: row.is_active !== false
      });
    }

    for (const member of members) {
      if (!member.departmentId) continue;
      if (!map.has(member.departmentId)) {
        map.set(member.departmentId, {
          id: member.departmentId,
          name: member.departmentName || 'Unnamed Department',
          isActive: true
        });
      }
    }

    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  private normalizeScans(
    rows: WellnessScanRecord[],
    members: NormalizedMember[]
  ): NormalizedScan[] {
    const memberByUserId = new Map<string, string>();
    for (const member of members) {
      if (member.userId) {
        memberByUserId.set(member.userId, member.id);
      }
    }

    return (rows ?? [])
      .map((row) => {
        const id = this.normalizeId(row.id);
        if (!id) return null;
        const memberId = this.normalizeId(row.member);
        const userId = this.normalizeId(row.user);
        const fallbackMemberId = memberId || (userId ? memberByUserId.get(userId) ?? null : null);
        const departmentRecord = this.objectRecord(row.department);
        const departmentId = this.normalizeId(departmentRecord?.['id'] ?? row.department);
        return {
          id,
          status: this.normalizeText(row.status),
          memberId: fallbackMemberId,
          userId,
          departmentId,
          completedAt: row.completed_at ?? null,
          dateCreated: row.date_created ?? null
        } satisfies NormalizedScan;
      })
      .filter((row): row is NormalizedScan => Boolean(row));
  }

  private normalizeResults(rows: ScanResultRecord[]): NormalizedResult[] {
    return (rows ?? [])
      .map((row) => {
        const id = this.normalizeId(row.id);
        if (!id) return null;
        return {
          id,
          scanId: this.normalizeId(row.scan_id),
          riskLevel: this.pickString(row.risk_level),
          readinessScore: this.toNumber(row.readiness_score),
          dateCreated: row.date_created ?? null
        } satisfies NormalizedResult;
      })
      .filter((row): row is NormalizedResult => Boolean(row));
  }

  private normalizeRequests(rows: ScanRequestRecord[], members: NormalizedMember[]): NormalizedRequest[] {
    const memberByUserId = new Map<string, NormalizedMember>();
    const memberByMemberId = new Map<string, NormalizedMember>();
    for (const member of members ?? []) {
      if (member.userId) {
        memberByUserId.set(member.userId, member);
      }
      if (member.id) {
        memberByMemberId.set(member.id, member);
      }
    }

    return (rows ?? [])
      .map((row) => {
        const id = this.normalizeId(row.id);
        if (!id) return null;
        const responsePayload = this.objectRecord(row.response_payload);
        const targetMemberId = this.normalizeId(row.requested_for_user ?? row.target_member);
        const member = (targetMemberId ? memberByUserId.get(targetMemberId) : null) ?? (targetMemberId ? memberByMemberId.get(targetMemberId) : null);
        return {
          id,
          departmentId: member?.departmentId ?? this.normalizeId(row.department),
          targetMemberId,
          status: this.normalizeText(row.response_status ?? row.status),
          cancelled: this.toBoolean(row.cancelled) || this.normalizeText(row.response_status ?? row.status) === 'cancelled',
          requestedAt: row.requested_at ?? row.timestamp ?? null,
          dueAt: row.due_at ?? this.pickString(responsePayload?.['due_at']) ?? null,
          completedAt: row.completed_at ?? this.pickString(responsePayload?.['completed_at']) ?? null,
          requestType: this.pickString(row.required_state ?? row.request_type)
        } satisfies NormalizedRequest;
      })
      .filter((row): row is NormalizedRequest => Boolean(row));
  }

  private normalizeAlerts(rows: AlertRecord[]): NormalizedAlert[] {
    return (rows ?? [])
      .map((row) => {
        const id = this.normalizeId(row.id);
        if (!id) return null;
        const departmentRecord = this.objectRecord(row.department);
        const memberRecord = this.objectRecord(row.target_member);
        return {
          id,
          departmentId: this.normalizeId(departmentRecord?.['id'] ?? row.department),
          targetMemberId: this.normalizeId(memberRecord?.['id'] ?? row.target_member),
          severity: this.normalizeText(row.severity),
          status: this.normalizeText(row.status),
          title: this.pickString(row.title) || 'Operational alert',
          dateCreated: row.date_created ?? null,
          reviewedAt: row.reviewed_at ?? null,
          actionType: this.pickString(row.action_type)
        } satisfies NormalizedAlert;
      })
      .filter((row): row is NormalizedAlert => Boolean(row));
  }

  private filterScans(rawData: RawReportsData, filters: ReportsFilters, range: { start: number; end: number }): NormalizedScan[] {
    const memberIds = new Set(this.filteredActiveMembers(rawData.members, filters.department).map((item) => item.id));
    return rawData.wellnessScans.filter((scan) => {
      if (!scan.memberId || !memberIds.has(scan.memberId)) return false;
      const ts = this.scanTimestamp(scan);
      return ts >= range.start && ts < range.end;
    });
  }

  private filterResults(rawData: RawReportsData, filters: ReportsFilters, range: { start: number; end: number }): NormalizedResult[] {
    const scans = this.filterScans(rawData, filters, range);
    const scanIds = new Set(scans.map((scan) => scan.id));
    const readinessFilter = filters.readiness;
    return rawData.scanResults.filter((result) => {
      if (!result.scanId || !scanIds.has(result.scanId)) return false;
      const ts = this.toTimestamp(result.dateCreated);
      if (ts < range.start || ts >= range.end) return false;
      const label = this.mapRiskLevelToLabel(result.riskLevel);
      if (readinessFilter !== 'all' && label !== readinessFilter) {
        return false;
      }
      return true;
    });
  }

  private filterAlerts(alerts: NormalizedAlert[], filters: ReportsFilters, range: { start: number; end: number }): NormalizedAlert[] {
    return alerts.filter((alert) => {
      if (filters.department) {
        if (filters.department === 'unassigned' && alert.departmentId) return false;
        if (filters.department !== 'unassigned' && alert.departmentId !== filters.department) return false;
      }
      if (filters.alertSeverity !== 'all' && alert.severity !== filters.alertSeverity) {
        return false;
      }
      const ts = this.toTimestamp(alert.dateCreated);
      return ts >= range.start && ts < range.end;
    });
  }

  private filterRequests(requests: NormalizedRequest[], filters: ReportsFilters, range: { start: number; end: number }): NormalizedRequest[] {
    return requests.filter((request) => {
      if (filters.department) {
        if (filters.department === 'unassigned' && request.departmentId) return false;
        if (filters.department !== 'unassigned' && request.departmentId !== filters.department) return false;
      }
      const ts = this.toTimestamp(request.requestedAt);
      return ts >= range.start && ts < range.end;
    });
  }

  private filteredActiveMembers(members: NormalizedMember[], departmentFilter: string): NormalizedMember[] {
    const seen = new Set<string>();

    return members.filter((member) => {
      if (member.status !== 'active') return false;
      if (!member.userId || !member.email || member.email === '-') return false;
      const role = this.normalizeText(member.memberRole);
      if (!['employee', 'manager', 'hr'].includes(role)) return false;
      if (departmentFilter) {
        if (departmentFilter === 'unassigned') {
          if (member.departmentId) return false;
        } else if (member.departmentId !== departmentFilter) {
          return false;
        }
      }

      const dedupeKey = member.userId || member.id;
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    });
  }

  private buildDepartmentOptions(rawData: RawReportsData): Array<{ id: string; name: string }> {
    return rawData.departments
      .map((item) => ({ id: item.id, name: item.name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private mapRiskLevelToLabel(value: string | null | undefined): ReportsReadinessFilter {
    const risk = this.normalizeRiskLevel(value);
    if (risk === 'stable') return 'Stable';
    if (risk === 'low_focus') return 'Low Focus';
    if (risk === 'elevated_fatigue') return 'Elevated Fatigue';
    if (risk === 'high_risk') return 'High Risk';
    return 'No scan';
  }

  private statusLabel(value: string): string {
    const normalized = this.normalizeText(value);
    if (!normalized) return 'Unknown';
    if (normalized === 'new') return 'New';
    if (normalized === 'seen') return 'In review';
    if (normalized === 'reviewed') return 'Reviewed';
    if (normalized === 'resolved') return 'Resolved';
    if (normalized === 'overridden') return 'Overridden';
    if (normalized === 'open') return 'Open';
    return normalized.replace(/_/g, ' ');
  }

  private severityLabel(value: string): string {
    const normalized = this.normalizeText(value);
    if (!normalized) return 'Unknown';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private actionTypeLabel(value: string | null): string {
    const normalized = this.normalizeText(value);
    if (!normalized || normalized === 'none') return 'Operational review pending';
    return normalized.replace(/_/g, ' ');
  }

  private requestTypeLabel(value: string | null): string {
    const normalized = this.normalizeText(value);
    if (!normalized) return 'unspecified';
    return normalized.replace(/_/g, ' ');
  }

  private requestStatusLabel(request: NormalizedRequest): string {
    if (this.isOverdueRequest(request)) return 'Overdue';
    if (this.isCompletedRequest(request)) return 'Completed';
    if (this.isCancelledRequest(request)) return 'Cancelled';
    if (this.isPendingRequestStatus(request.status)) return 'Pending';
    return request.status || 'Unknown';
  }

  private applyDepartmentFilterToDepartmentRows(
    rows: DepartmentPerformanceRow[],
    departmentFilter: string
  ): DepartmentPerformanceRow[] {
    if (!departmentFilter) return rows;
    if (departmentFilter === 'unassigned') return rows.filter((row) => !row.departmentId);
    return rows.filter((row) => row.departmentId === departmentFilter);
  }

  private mapToSortedRows(map: Map<string, number>): Array<{ label: string; count: number }> {
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }

  private dayKeys(start: number, end: number): string[] {
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() < end) {
      keys.push(this.dayKey(cursor.getTime()));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  private dayKey(ts: number): string {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private dayLabel(dayKey: string): string {
    const ts = this.toTimestamp(`${dayKey}T00:00:00`);
    if (!ts) return dayKey;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ts));
  }

  private resolveDateRange(dateRange: ReportsDateRange): { start: number; end: number; startIso: string } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (dateRange === 'today') {
      return { start: todayStart, end: todayStart + dayMs, startIso: new Date(todayStart).toISOString() };
    }
    if (dateRange === 'last7') {
      const start = todayStart - 6 * dayMs;
      return { start, end: todayStart + dayMs, startIso: new Date(start).toISOString() };
    }
    const start = todayStart - 29 * dayMs;
    return { start, end: todayStart + dayMs, startIso: new Date(start).toISOString() };
  }

  private scanTimestamp(scan: NormalizedScan): number {
    return this.toTimestamp(scan.completedAt) || this.toTimestamp(scan.dateCreated);
  }

  private isCompletedScanStatus(status: string): boolean {
    if (!status) return true;
    return status === 'completed';
  }

  private isOpenAlertStatus(status: string): boolean {
    return status === 'new' || status === 'seen' || status === 'open';
  }

  private isPendingRequestStatus(status: string): boolean {
    return status === 'pending' || status === 'sent' || status === 'opened' || status === 'open';
  }

  private isCancelledRequest(request: NormalizedRequest): boolean {
    return request.cancelled || request.status === 'cancelled';
  }

  private isCompletedRequest(request: NormalizedRequest): boolean {
    return request.status === 'completed' || Boolean(request.completedAt);
  }

  private isOverdueRequest(request: NormalizedRequest): boolean {
    const dueTs = this.toTimestamp(request.dueAt);
    if (!dueTs || dueTs >= Date.now()) {
      return false;
    }
    if (this.isCancelledRequest(request) || this.isCompletedRequest(request)) {
      return false;
    }
    if (this.isPendingRequestStatus(request.status)) {
      return true;
    }
    return !request.cancelled && !request.completedAt;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const normalized = this.normalizeText(value);
    if (!normalized) return false;
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private async queryWithFieldFallback<T>(
    collection: string,
    fieldVariants: string[][],
    token: string,
    options?: {
      filters?: Array<{ path: string[]; operator: string; value: string }>;
      sort?: string;
      limit?: number;
    }
  ): Promise<T[]> {
    let lastError: unknown = null;
    for (const fields of fieldVariants) {
      try {
        return await this.queryItems<T>(collection, fields, token, options);
      } catch (error: unknown) {
        lastError = error;
        if (!this.isFieldCompatibilityError(error)) {
          throw error;
        }
      }
    }
    throw lastError ?? new Error(`${collection} could not be loaded.`);
  }

  private async queryItems<T>(
    collection: string,
    fields: string[],
    token: string,
    options?: {
      filters?: Array<{ path: string[]; operator: string; value: string }>;
      sort?: string;
      limit?: number;
    }
  ): Promise<T[]> {
    const params = new URLSearchParams({
      fields: fields.join(','),
      limit: String(options?.limit ?? 200),
      sort: options?.sort ?? '-id'
    });

    for (const filter of options?.filters ?? []) {
      this.setFilter(params, filter.path, filter.operator, filter.value);
    }

    const response = await firstValueFrom(
      this.http
        .get<{ data?: T[] }>(`${this.api}/items/${collection}?${params.toString()}`, {
          headers: this.headers(token),
          withCredentials: true
        })
        .pipe(timeout(25000))
    );
    return response.data ?? [];
  }

  private resolveSettled<T>(
    source: string,
    settled: PromiseSettledResult<T>,
    warnings: Set<string>,
    onForbidden: () => void
  ): T extends Array<infer U> ? U[] : T {
    if (settled.status === 'fulfilled') {
      return settled.value as T extends Array<infer U> ? U[] : T;
    }
    const status = this.httpStatus(settled.reason);
    if (status === 401 || status === 403) {
      onForbidden();
    }
    warnings.add(source);
    return [] as T extends Array<infer U> ? U[] : T;
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

  private httpStatus(error: unknown): number {
    if (!error || typeof error !== 'object') return 0;
    return Number((error as { status?: number }).status ?? 0);
  }

  private isFieldCompatibilityError(error: unknown): boolean {
    const status = this.httpStatus(error);
    const message = this.normalizeText(
      (error as {
        error?: { errors?: Array<{ message?: string; extensions?: { reason?: string } }>; message?: string };
        message?: string;
      } | null)?.error?.errors?.[0]?.extensions?.reason ??
        (error as {
          error?: { errors?: Array<{ message?: string }>; message?: string };
          message?: string;
        } | null)?.error?.errors?.[0]?.message ??
        (error as { error?: { message?: string }; message?: string } | null)?.error?.message ??
        (error as { message?: string } | null)?.message
    );

    if (status === 401 || status === 403) return true;
    if (status !== 400 && status !== 422) return false;

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

  private formatDateTime(value: string | null | undefined, fallback: string): string {
    const ts = this.toTimestamp(value);
    if (!ts) return fallback;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ts));
  }

  private normalizeRiskLevel(value: string | null | undefined): 'stable' | 'low_focus' | 'elevated_fatigue' | 'high_risk' | null {
    const normalized = this.normalizeText(value).replace(/\s+/g, '_');
    if (normalized === 'stable') return 'stable';
    if (normalized === 'low_focus') return 'low_focus';
    if (normalized === 'elevated_fatigue') return 'elevated_fatigue';
    if (normalized === 'high_risk') return 'high_risk';
    return null;
  }

  private downloadCsv(filename: string, lines: string[]): void {
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private buildExportFileName(reportType: string, dateRange: ReportsFilters['dateRange'], extension: 'csv'): string {
    return `wellar-ai-${reportType}-${this.dateRangeSlug(dateRange)}-${this.todayDateKey()}.${extension}`;
  }

  private dateRangeSlug(value: ReportsFilters['dateRange']): string {
    if (value === 'today') return 'today';
    if (value === 'last7') return 'last-7-days';
    if (value === 'last30') return 'last-30-days';
    return 'custom-range';
  }

  private toCsvLine(values: string[]): string {
    return values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
  }

  private todayDateKey(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
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
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatOptionalPercent(value: number | null | undefined): string {
    return value === null || value === undefined ? 'Unavailable' : `${value}%`;
  }

  private formatOptionalNumber(value: number | null | undefined): string {
    return value === null || value === undefined ? 'Unavailable' : String(value);
  }
}
