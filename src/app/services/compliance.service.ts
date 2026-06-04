import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { formatDepartment } from '../shared/utils/display-formatters';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import {
  OperationsAdminService,
  type WorkforceMemberRow
} from './operations-admin.service';
import {
  OperationsWorkflowsService,
  type AlertRow,
  type RequestRow
} from './operations-workflows.service';

export type ComplianceDateRange = 'today' | 'last7' | 'last30';

export type ComplianceFilters = {
  dateRange: ComplianceDateRange;
  department: string;
  status: 'all' | 'completed' | 'missing' | 'attention' | 'overdue';
  readiness: 'all' | 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk' | 'No scan';
};

export type ComplianceSummaryCardData = {
  complianceRate: number;
  completedScans: number;
  missingScans: number;
  openAlerts: number;
  highAttention: number | null;
  overdueRequests: number;
  scanEligibleMembersToday: number;
};

export type DepartmentComplianceRow = {
  key: string;
  departmentId: string | null;
  departmentName: string;
  activeMembers: number;
  scanEligible: number;
  completedToday: number;
  missingScans: number;
  complianceRate: number;
  openAlerts: number;
  note?: string | null;
};

export type ComplianceExceptionRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberRole: string;
  membershipStatus: string;
  joinedAt: string | null;
  userId: string | null;
  departmentId: string | null;
  departmentName: string;
  expectedCheck: string;
  todayScan: 'Completed' | 'Missing' | 'No request scheduled' | 'Overdue';
  readiness: 'Stable' | 'Low Focus' | 'Elevated Fatigue' | 'High Risk' | 'No scan';
  alertStatus: 'None' | 'Open' | 'Reviewed' | 'Resolved';
  lastScanAt: string | null;
  lastScanLabel: string;
  openAlertId: string | null;
  openRequestId: string | null;
  openRequestStatus: string | null;
  requestDueAt: string | null;
  requestRequestedAt: string | null;
  linkedInviteEmail: string | null;
  invitedBy: string | null;
  reason: string | null;
};

export type ProfileLinkageIssueRow = {
  membershipId: string;
  role: string;
  department: string;
  joinedAt: string | null;
  inviteEmail: string | null;
  reason: string;
};

export type RecentComplianceActivityItem = {
  id: string;
  type: 'scan_completed' | 'alert_created' | 'request_sent' | 'request_overdue' | 'alert_resolved';
  title: string;
  detail: string;
  departmentName: string;
  happenedAt: string;
  happenedTs: number;
};

export type ComplianceOverviewData = {
  workspaceName: string;
  role: string;
  filters: ComplianceFilters;
  summary: ComplianceSummaryCardData;
  departmentRows: DepartmentComplianceRow[];
  exceptionRows: ComplianceExceptionRow[];
  profileLinkageIssues: ProfileLinkageIssueRow[];
  activityRows: RecentComplianceActivityItem[];
  departmentOptions: Array<{ id: string; name: string }>;
  partialWarning: string | null;
  departmentGroupingWarning: string | null;
  readinessWarning: string | null;
  departmentMetadataBlocked: boolean;
  scanResultsAccess: 'available' | 'permission_blocked' | 'degraded';
  permissionDenied: boolean;
  hasAnyData: boolean;
  sourceCounts: {
    members: number;
    departments: number;
    scanRequests: number;
    alerts: number;
    wellnessScans: number;
    scanResults: number;
  };
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
  date_updated?: string | null;
  user?: string | number | { id?: string | number } | null;
  started_at?: string | null;
  member?: string | number | { id?: string | number } | null;
  department?: string | number | { id?: string | number; name?: string | null } | null;
  request_source?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  device_platform?: string | null;
  failure_reason?: string | null;
  completed_at?: string | null;
  consent_granted?: boolean | null;
  date_created?: string | null;
};

type ScanResultRecord = {
  id?: string | number;
  scan_id?: string | number | { id?: string | number } | null;
  risk_level?: string | null;
  readiness_score?: number | string | null;
  confidence?: number | string | null;
  task_performance_score?: number | string | null;
  readiness_summary?: string | null;
  operational_summary?: string | null;
  recommended_action?: string | null;
  explanation?: string | null;
  suggested_action?: string | null;
  date_created?: string | null;
};

type ScanResultsLoadState = 'available' | 'permission_blocked' | 'degraded';

type ScanResultsLoadResult = {
  rows: ScanResultRecord[];
  state: ScanResultsLoadState;
  missingFields: string[];
};

type MemberRiskRecord = {
  id?: string | number;
  status?: string | null;
  business_profile?: string | number | { id?: string | number } | null;
  member_role?: string | null;
  department?: string | number | { id?: string | number } | null;
  last_scan_at?: string | null;
  last_risk_level?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  user?: string | number | { id?: string | number } | null;
};

type NormalizedSource = {
  members: WorkforceMemberRow[];
  departments: Array<{ id: string; name: string }>;
  scanRequests: RequestRow[];
  alerts: AlertRow[];
  wellnessScans: WellnessScanRecord[];
  scanResults: ScanResultRecord[];
  memberLastRiskById: Map<string, string>;
  filters: ComplianceFilters;
  departmentMetadataBlocked: boolean;
  departmentMetadataUnreadable: boolean;
  scanResultsAccess: ScanResultsLoadState;
};

type ResolvedDepartmentGroup = {
  key: string;
  departmentId: string | null;
  departmentName: string;
  note: string | null;
};

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private readonly api = environment.API_URL;
  private cache:
    | {
        workspaceId: string;
        role: string;
        members: WorkforceMemberRow[];
        departments: Array<{ id: string; name: string }>;
        scanRequests: RequestRow[];
        alerts: AlertRow[];
        wellnessScans: WellnessScanRecord[];
        scanResults: ScanResultRecord[];
        departmentMetadataBlocked: boolean;
        departmentMetadataUnreadable: boolean;
        scanResultsAccess: ScanResultsLoadState;
        memberLastRiskByIdEntries: Array<[string, string]>;
      }
    | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private operationsAdmin: OperationsAdminService,
    private workflows: OperationsWorkflowsService
  ) {}

  async loadComplianceOverview(
    activeContext: Awaited<ReturnType<CompanyContextService['ensureActiveContext']>>,
    filters: ComplianceFilters,
    refresh = true
  ): Promise<ComplianceOverviewData> {
    const role = (activeContext?.activeMemberRole ?? '').toString().toLowerCase();
    const workspaceId = this.normalizeId(activeContext?.activeBusinessProfile?.id);

    if (!workspaceId || !activeContext?.activeMembership?.id) {
      throw new Error('NO_ACTIVE_WORKSPACE');
    }

    if (!role || role === 'employee') {
      throw new Error('ROLE_FORBIDDEN');
    }

    const useCache = !refresh && this.cache?.workspaceId === workspaceId;
    let members: WorkforceMemberRow[] = [];
    let scanRequests: RequestRow[] = [];
    let alerts: AlertRow[] = [];
    let departments: Array<{ id: string; name: string }> = [];
    let wellnessScans: WellnessScanRecord[] = [];
    let scanResults: ScanResultRecord[] = [];
    let departmentMetadataBlocked = false;
    let departmentMetadataUnreadable = false;
    let scanResultsAccess: ScanResultsLoadState = 'available';
    let memberLastRiskById = new Map<string, string>();
    const warnings = new Set<string>();
    let forbiddenSources = 0;

    if (useCache) {
      members = this.cache?.members ?? [];
      scanRequests = this.cache?.scanRequests ?? [];
      alerts = this.cache?.alerts ?? [];
      departments = this.cache?.departments ?? [];
      wellnessScans = this.cache?.wellnessScans ?? [];
      scanResults = this.cache?.scanResults ?? [];
      departmentMetadataBlocked = this.cache?.departmentMetadataBlocked ?? false;
      departmentMetadataUnreadable = this.cache?.departmentMetadataUnreadable ?? false;
      scanResultsAccess = this.cache?.scanResultsAccess ?? 'available';
      memberLastRiskById = new Map(this.cache?.memberLastRiskByIdEntries ?? []);
    } else {
      const token = this.auth.getStoredAccessToken() ?? '';
      const activeDepartmentId = role === 'manager'
        ? this.normalizeId(activeContext.activeMembership.department)
        : null;

      const membersPromise = firstValueFrom(this.operationsAdmin.getWorkforcePageData().pipe(timeout(25000)))
        .then((result) => result.rows ?? []);

      const requestsPromise = this.workflows.loadScanRequestsSafe(workspaceId)
        .then((result) => result.rows ?? []);

      const alertsPromise = firstValueFrom(this.workflows.getAlertsPageData().pipe(timeout(25000)))
        .then((result) => result.rows ?? []);

      const departmentsPromise = this.loadDepartments(token, workspaceId);
      const wellnessScansPromise = this.loadWellnessScans(token, workspaceId, activeDepartmentId);
      const scanResultsPromise = this.loadScanResults(token);
      const memberRiskPromise = this.loadMemberRiskProfiles(token, workspaceId, activeDepartmentId);

      const [
        membersSettled,
        requestsSettled,
        alertsSettled,
        departmentsSettled,
        wellnessScansSettled,
        scanResultsSettled,
        memberRiskSettled
      ] = await Promise.allSettled([
        membersPromise,
        requestsPromise,
        alertsPromise,
        departmentsPromise,
        wellnessScansPromise,
        scanResultsPromise,
        memberRiskPromise
      ]);

      members = this.resolveSettled('members', membersSettled, warnings, () => { forbiddenSources += 1; });
      scanRequests = this.resolveSettled('requests', requestsSettled, warnings, () => { forbiddenSources += 1; });
      alerts = this.resolveSettled('alerts', alertsSettled, warnings, () => { forbiddenSources += 1; });
      departments = this.resolveSettled('departments', departmentsSettled, warnings, () => { forbiddenSources += 1; });
      departmentMetadataBlocked = this.isPermissionBlocked(departmentsSettled);
      departmentMetadataUnreadable = departmentsSettled.status === 'rejected';
      if (departmentMetadataBlocked) {
        console.warn('[DEPARTMENTS_PERMISSION_BLOCKED]', {
          workspaceId,
          requiredFields: ['id', 'name', 'business_profile']
        });
      }
      wellnessScans = this.resolveSettled('wellness_scans', wellnessScansSettled, warnings, () => { forbiddenSources += 1; });
      const scanResultsLoad = this.resolveScanResultsSettled(scanResultsSettled, warnings, () => { forbiddenSources += 1; });
      scanResults = scanResultsLoad.rows;
      scanResultsAccess = scanResultsLoad.state;
      if (scanResultsAccess !== 'available') {
        console.warn('[COMPLIANCE_STATS_DEGRADED]', {
          reason: scanResultsAccess,
          workspaceId
        });
      }
      const memberRiskRows = this.resolveSettled('business_profile_members', memberRiskSettled, warnings, () => { forbiddenSources += 1; });
      memberLastRiskById = this.buildMemberLastRiskMap(memberRiskRows);

      this.cache = {
        workspaceId,
        role,
        members,
        departments,
        scanRequests,
        alerts,
        wellnessScans,
        scanResults,
        departmentMetadataBlocked,
        departmentMetadataUnreadable,
        scanResultsAccess,
        memberLastRiskByIdEntries: Array.from(memberLastRiskById.entries())
      };
    }

    const normalized: NormalizedSource = {
      members,
      departments,
      scanRequests,
      alerts,
      wellnessScans,
      scanResults,
      memberLastRiskById,
      filters,
      departmentMetadataBlocked,
      departmentMetadataUnreadable,
      scanResultsAccess
    };

    const summary = this.buildComplianceSummary(normalized);
    const departmentRows = this.buildDepartmentCompliance(normalized);
    const exceptionRows = this.buildComplianceExceptions(normalized);
    const profileLinkageIssues = this.buildProfileLinkageIssues(normalized);
    const activityRows = this.buildRecentComplianceActivity(normalized);

    const hasAnyData =
      members.length > 0 ||
      scanRequests.length > 0 ||
      alerts.length > 0 ||
      wellnessScans.length > 0;

    return {
      workspaceName:
        activeContext.activeBusinessProfile.company_name?.trim() ||
        'Current workspace',
      role,
      filters,
      summary,
      departmentRows,
      exceptionRows,
      profileLinkageIssues,
      activityRows,
      departmentOptions: this.buildDepartmentOptions(normalized),
      partialWarning: this.buildPartialWarning(warnings, scanResultsAccess),
      departmentGroupingWarning: this.buildDepartmentGroupingWarning(normalized),
      readinessWarning: scanResultsAccess === 'available' ? null : 'Readiness data unavailable',
      departmentMetadataBlocked,
      scanResultsAccess,
      permissionDenied: forbiddenSources >= 3 && !hasAnyData,
      hasAnyData,
      sourceCounts: {
        members: members.length,
        departments: departments.length,
        scanRequests: scanRequests.length,
        alerts: alerts.length,
        wellnessScans: wellnessScans.length,
        scanResults: scanResults.length
      }
    };
  }

  buildComplianceSummary(data: NormalizedSource): ComplianceSummaryCardData {
    const members = this.applyDepartmentFilterToMembers(data.members, data.filters.department).filter(
      (member) => this.normalizeText(member.status) === 'active'
    );
    const range = this.resolveDateRange(data.filters.dateRange);
    const scansInRange = this.applyDepartmentFilterToWellnessScans(data.wellnessScans, data.filters.department).filter((scan) => {
      const happenedAt = this.pickString(scan.completed_at) || this.pickString(scan.date_created);
      const happenedTs = this.toTimestamp(happenedAt);
      return happenedTs >= range.start && happenedTs < range.end && this.isCompletedScanStatus(scan.status);
    });
    const completedMemberIdsInRange = new Set(
      scansInRange
        .map((scan) => this.normalizeId(scan.member))
        .filter((id): id is string => Boolean(id))
    );
    const openAlerts = this.applyDepartmentFilterToAlerts(data.alerts, data.filters.department).filter((alert) =>
      this.isOpenAlertStatus(alert.status)
    );

    const overdueRequests = this.applyDepartmentFilterToRequests(data.scanRequests, data.filters.department).filter((request) =>
      this.isOverdueRequest(request.status, request.due_at)
    );

    const scanEligibleMembers = members.length;
    const completedInRange = members.filter((member) => completedMemberIdsInRange.has(member.id)).length;
    const missingScans = Math.max(scanEligibleMembers - completedInRange, 0);
    const highAttention = data.scanResultsAccess === 'available'
      ? this.buildComplianceExceptions(data).filter((row) =>
          row.readiness === 'High Risk' ||
          row.readiness === 'Elevated Fatigue' ||
          row.alertStatus === 'Open'
        ).length
      : null;

    return {
      complianceRate: scanEligibleMembers > 0 ? Math.round((completedInRange / scanEligibleMembers) * 100) : 0,
      completedScans: completedInRange,
      missingScans,
      openAlerts: openAlerts.length,
      highAttention,
      overdueRequests: overdueRequests.length,
      scanEligibleMembersToday: scanEligibleMembers
    };
  }

  buildDepartmentCompliance(data: NormalizedSource): DepartmentComplianceRow[] {
    console.info('[COMPLIANCE_GROUPING_START]', {
      memberCount: data.members.length,
      departmentCount: data.departments.length,
      departmentMetadataBlocked: data.departmentMetadataBlocked,
      departmentMetadataUnreadable: data.departmentMetadataUnreadable
    });

    const members = data.members.filter((member) => this.normalizeText(member.status) === 'active');
    const alerts = data.alerts.filter((alert) => this.isOpenAlertStatus(alert.status));
    const range = this.resolveDateRange(data.filters.dateRange);
    const scansInRange = this.applyDepartmentFilterToWellnessScans(data.wellnessScans, data.filters.department).filter((scan) => {
      const happenedAt = this.pickString(scan.completed_at) || this.pickString(scan.date_created);
      const happenedTs = this.toTimestamp(happenedAt);
      return happenedTs >= range.start && happenedTs < range.end && this.isCompletedScanStatus(scan.status);
    });
    const completedMemberIdsInRange = new Set(
      scansInRange
        .map((scan) => this.normalizeId(scan.member))
        .filter((id): id is string => Boolean(id))
    );

    const groups = this.resolveDepartmentGroups(data, members);

    const rows: DepartmentComplianceRow[] = [];
    for (const department of groups) {
      const departmentMembers = members.filter((member) =>
        department.departmentId ? member.department_id === department.departmentId : !member.department_id
      );

      const completedToday = departmentMembers.filter((member) => completedMemberIdsInRange.has(member.id)).length;
      const activeMembers = departmentMembers.length;
      const missingScans = Math.max(activeMembers - completedToday, 0);
      const openAlerts = alerts.filter((alert) =>
        department.departmentId ? alert.department_id === department.departmentId : !alert.department_id
      ).length;

      rows.push({
        key: department.key,
        departmentId: department.departmentId,
        departmentName: department.departmentName,
        activeMembers,
        scanEligible: activeMembers,
        completedToday,
        missingScans,
        complianceRate: activeMembers > 0 ? Math.round((completedToday / activeMembers) * 100) : 0,
        openAlerts,
        note: department.note
      });
    }

    const filtered = this.applyDepartmentFilterToDepartmentRows(rows, data.filters.department);
    const sorted = filtered.sort((left, right) => {
      if (left.departmentName === 'Unassigned members') return 1;
      if (right.departmentName === 'Unassigned members') return -1;
      return left.departmentName.localeCompare(right.departmentName);
    });
    console.info('[COMPLIANCE_GROUPING_DONE]', {
      groupCount: sorted.length,
      unassignedCount: sorted.filter((row) => row.departmentName === 'Unassigned members').length,
      unavailableCount: sorted.filter((row) => row.departmentName === 'Department unavailable').length,
      unknownCount: sorted.filter((row) => row.departmentName === 'Unknown department').length
    });
    return sorted;
  }

  buildComplianceExceptions(data: NormalizedSource): ComplianceExceptionRow[] {
    const memberRiskLevelById = this.memberRiskLevelById(data);
    const activeMembers = this.applyDepartmentFilterToMembers(data.members, data.filters.department)
      .filter((member) => this.normalizeText(member.status) === 'active');

    const requestsByMember = new Map<string, RequestRow[]>();
    for (const request of this.applyDepartmentFilterToRequests(data.scanRequests, data.filters.department)) {
      if (!request.target_member_id) continue;
      const bucket = requestsByMember.get(request.target_member_id) ?? [];
      bucket.push(request);
      requestsByMember.set(request.target_member_id, bucket);
    }

    const alertsByMember = new Map<string, AlertRow[]>();
    for (const alert of this.applyDepartmentFilterToAlerts(data.alerts, data.filters.department)) {
      if (!alert.target_member_id) continue;
      const bucket = alertsByMember.get(alert.target_member_id) ?? [];
      bucket.push(alert);
      alertsByMember.set(alert.target_member_id, bucket);
    }

    const rows: ComplianceExceptionRow[] = [];

    for (const member of activeMembers) {
      const memberRequests = (requestsByMember.get(member.id) ?? [])
        .slice()
        .sort((left, right) => this.toTimestamp(right.requested_at) - this.toTimestamp(left.requested_at));
      const memberAlerts = (alertsByMember.get(member.id) ?? [])
        .slice()
        .sort((left, right) => this.toTimestamp(right.date_created) - this.toTimestamp(left.date_created));

      const hasCompletedToday = member.todays_scan;
      const hasOverdue = memberRequests.some((request) => this.isOverdueRequest(request.status, request.due_at));
      const hasPending = memberRequests.some((request) => this.isPendingRequestStatus(request.status));
      const openAlert = memberAlerts.find((alert) => this.isOpenAlertStatus(alert.status)) ?? null;
      const readiness = this.resolveMemberReadiness(member, memberRiskLevelById);
      const hasAttentionReadiness = readiness === 'High Risk' || readiness === 'Elevated Fatigue';

      const includeRow = !hasCompletedToday || hasOverdue || Boolean(openAlert) || hasAttentionReadiness;
      if (!includeRow) {
        continue;
      }

      const latestRequest = memberRequests[0] ?? null;
      const latestAlert = memberAlerts[0] ?? null;

      const todayScan: ComplianceExceptionRow['todayScan'] = hasCompletedToday
        ? 'Completed'
        : hasOverdue
          ? 'Overdue'
          : hasPending
            ? 'Missing'
            : 'No request scheduled';

      let alertStatus: ComplianceExceptionRow['alertStatus'] = 'None';
      if (openAlert) {
        alertStatus = 'Open';
      } else if (latestAlert) {
        const normalizedStatus = this.normalizeText(latestAlert.status);
        if (normalizedStatus === 'reviewed' || normalizedStatus === 'seen') {
          alertStatus = 'Reviewed';
        }
        if (normalizedStatus === 'resolved' || normalizedStatus === 'overridden') {
          alertStatus = 'Resolved';
        }
      }

      const fallbackInviteEmail = this.pickString((member as unknown as Record<string, unknown>)['pending_invite_email']);
      const linkedInviteEmail =
        fallbackInviteEmail ||
        this.pickString((member as unknown as Record<string, unknown>)['user_email']) ||
        null;
      const memberName = this.memberName(member);
      const memberEmail = member.user_email || linkedInviteEmail || 'Email unavailable';
      const profileIncomplete = !member.user_id;
      if (profileIncomplete) {
        continue;
      }
      const reason = null;
      const latestRequestStatus = latestRequest?.status ?? null;

      rows.push({
        memberId: member.id,
        memberName: profileIncomplete ? 'Profile incomplete' : memberName,
        memberEmail,
        memberRole: member.member_role || 'employee',
        membershipStatus: member.status || 'active',
        joinedAt: member.joined_at,
        userId: member.user_id,
        departmentId: member.department_id ?? null,
        departmentName: this.resolveMemberDepartmentGroup(data, member).departmentName,
        expectedCheck: this.expectedCheckLabel(latestRequest),
        todayScan,
        readiness,
        alertStatus,
        lastScanAt: member.last_scan_at,
        lastScanLabel: this.formatDateTime(member.last_scan_at, 'No scan yet'),
        openAlertId: openAlert?.id ?? null,
        openRequestId: latestRequest?.id ?? null,
        openRequestStatus: latestRequestStatus,
        requestDueAt: latestRequest?.due_at ?? null,
        requestRequestedAt: latestRequest?.requested_at ?? null,
        linkedInviteEmail,
        invitedBy: null,
        reason
      });
    }

    const statusFiltered = rows.filter((row) => this.matchesStatusFilter(row, data.filters.status));
    const readinessFiltered = statusFiltered.filter((row) => this.matchesReadinessFilter(row, data.filters.readiness));

    return readinessFiltered.sort((left, right) => {
      const severityOrder = this.exceptionSeverityRank(left) - this.exceptionSeverityRank(right);
      if (severityOrder !== 0) return severityOrder;
      return this.toTimestamp(right.lastScanAt) - this.toTimestamp(left.lastScanAt);
    });
  }

  buildProfileLinkageIssues(data: NormalizedSource): ProfileLinkageIssueRow[] {
    const activeMembers = this.applyDepartmentFilterToMembers(data.members, data.filters.department)
      .filter((member) => this.normalizeText(member.status) === 'active');

    return activeMembers
      .filter((member) => !member.user_id || !member.user_email)
      .map((member) => ({
        membershipId: member.id,
        role: member.member_role || 'employee',
        department: this.resolveMemberDepartmentGroup(data, member).departmentName,
        joinedAt: member.joined_at,
        inviteEmail: this.pickString((member as unknown as Record<string, unknown>)['pending_invite_email']) || null,
        reason: 'User relation missing or inaccessible'
      }))
      .sort((left, right) => this.toTimestamp(right.joinedAt) - this.toTimestamp(left.joinedAt));
  }

  buildRecentComplianceActivity(data: NormalizedSource): RecentComplianceActivityItem[] {
    const range = this.resolveDateRange(data.filters.dateRange);
    const events: RecentComplianceActivityItem[] = [];

    const requests = this.applyDepartmentFilterToRequests(data.scanRequests, data.filters.department);
    const alerts = this.applyDepartmentFilterToAlerts(data.alerts, data.filters.department);

    for (const request of requests) {
      const requestedTs = this.toTimestamp(request.requested_at);
      if (requestedTs >= range.start && requestedTs < range.end) {
        events.push({
          id: `request-sent-${request.id}`,
          type: 'request_sent',
          title: 'Request sent',
          detail: this.requestActivityDetail(request),
          departmentName: this.resolveGenericDepartmentLabel(
            request.department_id ?? null,
            request.department_name ?? null,
            data
          ),
          happenedAt: request.requested_at ?? '',
          happenedTs: requestedTs
        });
      }

      const dueTs = this.toTimestamp(request.due_at);
      if (dueTs >= range.start && dueTs < range.end && this.isOverdueRequest(request.status, request.due_at)) {
        events.push({
          id: `request-overdue-${request.id}`,
          type: 'request_overdue',
          title: 'Request overdue',
          detail: this.requestActivityDetail(request),
          departmentName: this.resolveGenericDepartmentLabel(
            request.department_id ?? null,
            request.department_name ?? null,
            data
          ),
          happenedAt: request.due_at ?? '',
          happenedTs: dueTs
        });
      }
    }

    for (const alert of alerts) {
      const createdTs = this.toTimestamp(alert.date_created);
      if (createdTs >= range.start && createdTs < range.end) {
        events.push({
          id: `alert-created-${alert.id}`,
          type: 'alert_created',
          title: 'Alert created',
          detail: alert.message || alert.title || 'Operational alert recorded',
          departmentName: this.resolveGenericDepartmentLabel(
            alert.department_id ?? null,
            alert.department_name ?? null,
            data
          ),
          happenedAt: alert.date_created ?? '',
          happenedTs: createdTs
        });
      }

      const status = this.normalizeText(alert.status);
      const resolvedTs = this.toTimestamp(alert.reviewed_at);
      if ((status === 'resolved' || status === 'overridden') && resolvedTs >= range.start && resolvedTs < range.end) {
        events.push({
          id: `alert-resolved-${alert.id}`,
          type: 'alert_resolved',
          title: status === 'overridden' ? 'Alert overridden' : 'Alert resolved',
          detail: alert.message || alert.title || 'Operational alert reviewed',
          departmentName: this.resolveGenericDepartmentLabel(
            alert.department_id ?? null,
            alert.department_name ?? null,
            data
          ),
          happenedAt: alert.reviewed_at ?? '',
          happenedTs: resolvedTs
        });
      }
    }

    for (const scan of this.applyDepartmentFilterToWellnessScans(data.wellnessScans, data.filters.department)) {
      const happenedAt = this.pickString(scan.completed_at) || this.pickString(scan.date_created) || '';
      const happenedTs = this.toTimestamp(happenedAt);
      if (!happenedTs || happenedTs < range.start || happenedTs >= range.end) {
        continue;
      }

      if (!this.isCompletedScanStatus(scan.status)) {
        continue;
      }

      events.push({
        id: `scan-completed-${this.normalizeId(scan.id) ?? Math.random().toString(36).slice(2)}`,
        type: 'scan_completed',
        title: 'Scan completed',
        detail: 'Readiness check completed by a workspace member.',
        departmentName: this.resolveGenericDepartmentLabel(
          this.normalizeId(scan.department),
          this.departmentName(scan.department),
          data
        ),
        happenedAt,
        happenedTs
      });
    }

    return events
      .sort((left, right) => right.happenedTs - left.happenedTs)
      .slice(0, 24);
  }

  private buildDepartmentOptions(data: NormalizedSource): Array<{ id: string; name: string }> {
    const options = new Map<string, string>();

    for (const department of data.departments) {
      if (!department.id) continue;
      options.set(department.id, department.name || 'Unnamed Department');
    }

    for (const member of data.members) {
      if (!member.department_id) continue;
      options.set(
        member.department_id,
        this.resolveMemberDepartmentGroup(data, member).departmentName || options.get(member.department_id) || 'Unnamed Department'
      );
    }

    return Array.from(options.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveDepartmentGroups(
    data: NormalizedSource,
    members: WorkforceMemberRow[]
  ): ResolvedDepartmentGroup[] {
    const groups = new Map<string, ResolvedDepartmentGroup>();
    const loggedMissingMetadata = new Set<string>();

    for (const member of members) {
      const group = this.resolveMemberDepartmentGroup(data, member);
      groups.set(group.key, group);

      if (group.departmentId && (group.departmentName === 'Department unavailable' || group.departmentName === 'Unknown department')) {
        const logKey = `${group.departmentId}:${group.departmentName}`;
        if (!loggedMissingMetadata.has(logKey)) {
          loggedMissingMetadata.add(logKey);
          console.warn('[COMPLIANCE_DEPARTMENT_METADATA_MISSING]', {
            departmentId: group.departmentId,
            label: group.departmentName,
            memberId: member.id
          });
        }
      }
    }

    return Array.from(groups.values());
  }

  private resolveMemberDepartmentGroup(
    data: NormalizedSource,
    member: WorkforceMemberRow
  ): ResolvedDepartmentGroup {
    return this.resolveGenericDepartmentGroup(member.department_id, member.department_name, data);
  }

  private resolveGenericDepartmentGroup(
    departmentId: string | null | undefined,
    departmentName: string | null | undefined,
    data: NormalizedSource
  ): ResolvedDepartmentGroup {
    const normalizedDepartmentId = this.normalizeId(departmentId);
    const directName = this.pickString(departmentName);
    const departmentMap = new Map(data.departments.map((department) => [department.id, department.name] as const));

    if (!normalizedDepartmentId) {
      return {
        key: 'unassigned',
        departmentId: null,
        departmentName: 'Unassigned members',
        note: null
      };
    }

    if (directName) {
      return {
        key: normalizedDepartmentId,
        departmentId: normalizedDepartmentId,
        departmentName: directName,
        note: null
      };
    }

    const mappedName = departmentMap.get(normalizedDepartmentId);
    if (mappedName) {
      return {
        key: normalizedDepartmentId,
        departmentId: normalizedDepartmentId,
        departmentName: mappedName,
        note: null
      };
    }

    if (data.departmentMetadataBlocked || data.departmentMetadataUnreadable || data.departments.length === 0) {
      return {
        key: normalizedDepartmentId,
        departmentId: normalizedDepartmentId,
        departmentName: 'Department unavailable',
        note: 'Department metadata is blocked or unreadable for this workspace.'
      };
    }

    return {
      key: normalizedDepartmentId,
      departmentId: normalizedDepartmentId,
      departmentName: 'Unknown department',
      note: 'Department id exists on members, but the matching metadata row was not returned.'
    };
  }

  private resolveGenericDepartmentLabel(
    departmentId: string | null | undefined,
    departmentName: string | null | undefined,
    data: NormalizedSource
  ): string {
    return this.resolveGenericDepartmentGroup(departmentId, departmentName, data).departmentName;
  }

  private buildDepartmentGroupingWarning(data: NormalizedSource): string | null {
    if (data.departmentMetadataBlocked) {
      return 'Department metadata is unavailable. Members with department ids are grouped under Department unavailable until departments.read is allowed.';
    }

    const hasUnavailableGroups = data.members.some((member) => {
      const group = this.resolveMemberDepartmentGroup(data, member);
      return group.departmentName === 'Department unavailable' || group.departmentName === 'Unknown department';
    });

    if (hasUnavailableGroups) {
      return 'Some member department metadata is missing. Those members are grouped under Department unavailable or Unknown department instead of Unassigned.';
    }

    return null;
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

  private resolveScanResultsSettled(
    settled: PromiseSettledResult<ScanResultsLoadResult>,
    warnings: Set<string>,
    onForbidden: () => void
  ): ScanResultsLoadResult {
    if (settled.status === 'fulfilled') {
      if (settled.value.state === 'permission_blocked') {
        warnings.add('scan_results');
        onForbidden();
      } else if (settled.value.state === 'degraded') {
        warnings.add('scan_results');
      }
      return settled.value;
    }

    const status = this.httpStatus(settled.reason);
    if (status === 401 || status === 403) {
      onForbidden();
    }
    warnings.add('scan_results');
    return {
      rows: [],
      state: status === 401 || status === 403 ? 'permission_blocked' : 'degraded',
      missingFields: []
    };
  }

  private buildPartialWarning(
    warnings: Set<string>,
    scanResultsAccess: ScanResultsLoadState
  ): string | null {
    if (scanResultsAccess === 'permission_blocked') {
      return 'Readiness data unavailable due to permissions.';
    }
    if (scanResultsAccess === 'degraded') {
      return 'Scan result enrichment is partially unavailable.';
    }
    if (warnings.size) {
      return 'Some compliance sources are unavailable due to workspace permissions.';
    }
    return null;
  }

  private isPermissionBlocked<T>(settled: PromiseSettledResult<T>): boolean {
    if (settled.status !== 'rejected') {
      return false;
    }
    const status = this.httpStatus(settled.reason);
    return status === 401 || status === 403;
  }

  private async loadDepartments(token: string, businessProfileId: string): Promise<Array<{ id: string; name: string }>> {
    let rows: DepartmentRecord[] = [];
    try {
      rows = await this.queryWithFieldFallback<DepartmentRecord>(
        'departments',
        [
          ['id', 'date_created', 'date_updated', 'business_profile', 'name', 'manager_member', 'is_active'],
          ['id', 'business_profile', 'name', 'is_active'],
          ['id', 'name']
        ],
        token,
        {
          filters: [
            { path: ['business_profile'], operator: '_eq', value: businessProfileId },
            { path: ['is_active'], operator: '_eq', value: 'true' }
          ],
          sort: 'name',
          limit: 250
        }
      );
    } catch (error) {
      if (!this.isFieldCompatibilityError(error)) {
        throw error;
      }

      rows = await this.queryWithFieldFallback<DepartmentRecord>(
        'departments',
        [
          ['id', 'date_created', 'date_updated', 'business_profile', 'name', 'manager_member', 'is_active'],
          ['id', 'business_profile', 'name', 'is_active'],
          ['id', 'name']
        ],
        token,
        {
          filters: [{ path: ['business_profile'], operator: '_eq', value: businessProfileId }],
          sort: 'name',
          limit: 250
        }
      );
    }

    return (rows ?? [])
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        id: this.normalizeId(row.id) ?? '',
        name: this.pickString(row.name) || 'Unnamed Department'
      }))
      .filter((row) => Boolean(row.id));
  }

  private async loadWellnessScans(
    token: string,
    businessProfileId: string,
    activeDepartmentId: string | null
  ): Promise<WellnessScanRecord[]> {
    const filters: Array<{ path: string[]; operator: string; value: string }> = [
      { path: ['business_profile'], operator: '_eq', value: businessProfileId }
    ];

    if (activeDepartmentId) {
      filters.push({ path: ['department'], operator: '_eq', value: activeDepartmentId });
    }

    return this.queryWithFieldFallback<WellnessScanRecord>(
      'wellness_scans',
      [
        [
          'id',
          'status',
          'date_created',
          'date_updated',
          'user',
          'started_at',
          'completed_at',
          'consent_granted',
          'business_profile',
          'member',
          'department',
          'request_source',
          'device_platform',
          'failure_reason'
        ],
        ['id', 'status', 'date_created', 'completed_at', 'business_profile', 'member', 'department'],
        ['id', 'date_created']
      ],
      token,
      {
        filters,
        sort: '-date_created',
        limit: 1500
      }
    );
  }

  private async loadScanResults(token: string): Promise<ScanResultsLoadResult> {
    const fieldVariants: string[][] = [
      [
        'id',
        'date_created',
        'scan_id',
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
        'date_created',
        'scan_id',
        'risk_level',
        'readiness_score',
        'confidence',
        'task_performance_score',
        'explanation',
        'suggested_action'
      ],
      ['id', 'date_created', 'scan_id', 'risk_level', 'readiness_score', 'confidence', 'explanation'],
      ['id', 'date_created', 'scan_id', 'risk_level']
    ];
    const missingFields = new Set<string>();

    console.info('[SCAN_RESULTS_FETCH_START]', {
      fields: fieldVariants[0].join(',')
    });

    for (let index = 0; index < fieldVariants.length; index += 1) {
      const fields = fieldVariants[index];

      try {
        const rows = await this.queryItems<ScanResultRecord>(
          'scan_results',
          fields,
          token,
          {
            sort: '-date_created',
            limit: 1500
          }
        );

        const degradedFields = Array.from(missingFields);
        if (degradedFields.length) {
          console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
            reason: 'optional_fields_unavailable',
            missingFields: degradedFields
          });
        }

        console.info('[SCAN_RESULTS_FETCH_SUCCESS]', {
          resultCount: rows.length,
          fields: fields.join(',')
        });
        return {
          rows,
          state: degradedFields.length ? 'degraded' : 'available',
          missingFields: degradedFields
        };
      } catch (error) {
        const status = this.httpStatus(error);

        if (status === 401 || status === 403) {
          console.warn('[SCAN_RESULTS_PERMISSION_BLOCKED]', {
            status,
            fields: fields.join(',')
          });
          return {
            rows: [],
            state: 'permission_blocked',
            missingFields: []
          };
        }

        if (this.isFieldCompatibilityError(error)) {
          const nextFields = fieldVariants[index + 1] ?? [];
          const removedFields = fields.filter((field) => !nextFields.includes(field));
          removedFields.forEach((field) => missingFields.add(field));
          console.warn('[SCAN_RESULTS_FIELD_MISSING]', {
            status,
            fields: fields.join(','),
            removedFields: removedFields.join(','),
            message: this.errorMessage(error)
          });
          continue;
        }

        console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
          status,
          fields: fields.join(','),
          message: this.errorMessage(error)
        });
        return {
          rows: [],
          state: 'degraded',
          missingFields: Array.from(missingFields)
        };
      }
    }

    console.warn('[SCAN_RESULTS_DEGRADED_STATE]', {
      reason: 'no_compatible_field_set',
      missingFields: Array.from(missingFields)
    });
    return {
      rows: [],
      state: 'degraded',
      missingFields: Array.from(missingFields)
    };
  }

  private async loadMemberRiskProfiles(
    token: string,
    businessProfileId: string,
    activeDepartmentId: string | null
  ): Promise<MemberRiskRecord[]> {
    const filters: Array<{ path: string[]; operator: string; value: string }> = [
      { path: ['business_profile'], operator: '_eq', value: businessProfileId },
      { path: ['status'], operator: '_eq', value: 'active' }
    ];

    if (activeDepartmentId) {
      filters.push({ path: ['department'], operator: '_eq', value: activeDepartmentId });
    }

    return this.queryWithFieldFallback<MemberRiskRecord>(
      'business_profile_members',
      [
        [
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
        [
          'id',
          'status',
          'user',
          'business_profile',
          'member_role',
          'department',
          'last_scan_at',
          'last_risk_level',
          'date_created',
          'date_updated'
        ],
        ['id', 'status', 'department', 'last_scan_at', 'last_risk_level']
      ],
      token,
      {
        filters,
        sort: '-date_updated',
        limit: 1200
      }
    );
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
      } catch (error) {
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
      this.http.get<{ data?: T[] }>(
        `${this.api}/items/${collection}?${params.toString()}`,
        {
          headers: this.headers(token),
          withCredentials: true
        }
      ).pipe(timeout(25000))
    );

    return response.data ?? [];
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

  private applyDepartmentFilterToMembers(members: WorkforceMemberRow[], departmentFilter: string): WorkforceMemberRow[] {
    if (!departmentFilter) {
      return members ?? [];
    }

    if (departmentFilter === 'unassigned') {
      return (members ?? []).filter((member) => !member.department_id);
    }

    return (members ?? []).filter((member) => member.department_id === departmentFilter);
  }

  private applyDepartmentFilterToRequests(requests: RequestRow[], departmentFilter: string): RequestRow[] {
    if (!departmentFilter) {
      return requests ?? [];
    }

    if (departmentFilter === 'unassigned') {
      return (requests ?? []).filter((request) => !request.department_id);
    }

    return (requests ?? []).filter((request) => request.department_id === departmentFilter);
  }

  private applyDepartmentFilterToAlerts(alerts: AlertRow[], departmentFilter: string): AlertRow[] {
    if (!departmentFilter) {
      return alerts ?? [];
    }

    if (departmentFilter === 'unassigned') {
      return (alerts ?? []).filter((alert) => !alert.department_id);
    }

    return (alerts ?? []).filter((alert) => alert.department_id === departmentFilter);
  }

  private applyDepartmentFilterToWellnessScans(
    scans: WellnessScanRecord[],
    departmentFilter: string
  ): WellnessScanRecord[] {
    if (!departmentFilter) {
      return scans ?? [];
    }

    return (scans ?? []).filter((scan) => {
      const departmentId = this.normalizeId(scan.department);
      if (departmentFilter === 'unassigned') {
        return !departmentId;
      }
      return departmentId === departmentFilter;
    });
  }

  private applyDepartmentFilterToDepartmentRows(
    rows: DepartmentComplianceRow[],
    departmentFilter: string
  ): DepartmentComplianceRow[] {
    if (!departmentFilter) {
      return rows;
    }

    if (departmentFilter === 'unassigned') {
      return rows.filter((row) => !row.departmentId);
    }

    return rows.filter((row) => row.departmentId === departmentFilter);
  }

  private resolveDateRange(value: ComplianceDateRange): { start: number; end: number } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    if (value === 'last7') {
      return { start: todayStart - 6 * dayMs, end: todayStart + dayMs };
    }

    if (value === 'last30') {
      return { start: todayStart - 29 * dayMs, end: todayStart + dayMs };
    }

    return { start: todayStart, end: todayStart + dayMs };
  }

  private isOpenAlertStatus(value: string | null | undefined): boolean {
    const normalized = this.normalizeText(value);
    return normalized === 'new' || normalized === 'open';
  }

  private isPendingRequestStatus(value: string | null | undefined): boolean {
    const normalized = this.normalizeText(value);
    return normalized === 'pending' || normalized === 'sent' || normalized === 'opened';
  }

  private isOverdueRequest(status: string | null | undefined, dueAt: string | null | undefined): boolean {
    if (!dueAt) {
      return false;
    }

    const normalized = this.normalizeText(status);
    if (normalized === 'completed' || normalized === 'cancelled' || normalized === 'expired') {
      return false;
    }

    const dueTs = this.toTimestamp(dueAt);
    return dueTs > 0 && dueTs < Date.now();
  }

  private isCompletedScanStatus(value: string | null | undefined): boolean {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return true;
    }
    return normalized === 'completed';
  }

  private normalizeReadinessLabel(value: string | null | undefined): ComplianceExceptionRow['readiness'] {
    const normalized = this.normalizeText(value);

    if (!normalized || normalized === 'no scan today' || normalized === 'no scan') {
      return 'No scan';
    }

    if (normalized === 'high risk' || normalized === 'high_risk') {
      return 'High Risk';
    }

    if (normalized === 'elevated fatigue' || normalized === 'elevated_fatigue' || normalized === 'fatigue') {
      return 'Elevated Fatigue';
    }

    if (normalized === 'low focus' || normalized === 'low_focus') {
      return 'Low Focus';
    }

    return 'Stable';
  }

  private buildMemberLastRiskMap(rows: MemberRiskRecord[]): Map<string, string> {
    const map = new Map<string, string>();

    for (const row of rows ?? []) {
      const memberId = this.normalizeId(row.id);
      const risk = this.normalizeText(row.last_risk_level);
      if (!memberId || !risk) {
        continue;
      }
      map.set(memberId, risk);
    }

    return map;
  }

  private memberRiskLevelById(data: NormalizedSource): Map<string, string> {
    const scanToMember = new Map<string, string>();
    for (const scan of data.wellnessScans ?? []) {
      const scanId = this.normalizeId(scan.id);
      const memberId = this.normalizeId(scan.member);
      if (!scanId || !memberId) continue;
      scanToMember.set(scanId, memberId);
    }

    const latestByMember = new Map<string, { risk: string; ts: number }>();
    for (const result of data.scanResults ?? []) {
      const scanId = this.normalizeId(result.scan_id);
      if (!scanId) continue;
      const memberId = scanToMember.get(scanId);
      if (!memberId) continue;
      const risk = this.normalizeText(result.risk_level);
      if (!risk) continue;
      const ts = this.toTimestamp(result.date_created);
      const current = latestByMember.get(memberId);
      if (!current || ts >= current.ts) {
        latestByMember.set(memberId, { risk, ts });
      }
    }

    const merged = new Map<string, string>();
    for (const [memberId, payload] of latestByMember.entries()) {
      merged.set(memberId, payload.risk);
    }
    for (const [memberId, risk] of data.memberLastRiskById.entries()) {
      if (!merged.has(memberId) && risk) {
        merged.set(memberId, risk);
      }
    }
    return merged;
  }

  private resolveMemberReadiness(
    member: WorkforceMemberRow,
    memberRiskById: Map<string, string>
  ): ComplianceExceptionRow['readiness'] {
    const riskFromResult = memberRiskById.get(member.id) ?? null;
    const riskFromMember = this.normalizeText(this.pickMemberLastRisk(member)) || null;
    const risk = riskFromResult || riskFromMember || this.normalizeText(member.readiness_label);
    return this.normalizeReadinessLabel(risk);
  }

  private pickMemberLastRisk(member: WorkforceMemberRow): string | null {
    const record = member as unknown as Record<string, unknown>;
    return this.pickString(record['last_risk_level']);
  }

  private memberName(member: WorkforceMemberRow): string {
    const first = this.pickString(member.user_first_name);
    const last = this.pickString(member.user_last_name);
    const full = [first, last].filter(Boolean).join(' ').trim();
    return full || member.user_email || 'Member';
  }

  private expectedCheckLabel(request: RequestRow | null): string {
    if (!request) {
      return 'No request scheduled';
    }

    if (request.due_at) {
      return `Due ${this.formatDateTime(request.due_at, '-')}`;
    }

    if (request.requested_at) {
      return `Requested ${this.formatDateTime(request.requested_at, '-')}`;
    }

    return 'No request scheduled';
  }

  private requestActivityDetail(request: RequestRow): string {
    const member = request.target_member_name || 'Member';
    const status = this.pickString(request.status) || 'pending';
    return `${member} (${status})`;
  }

  private matchesStatusFilter(
    row: ComplianceExceptionRow,
    filter: ComplianceFilters['status']
  ): boolean {
    if (filter === 'all') return true;
    if (filter === 'completed') return row.todayScan === 'Completed';
    if (filter === 'missing') return row.todayScan === 'Missing';
    if (filter === 'overdue') return row.todayScan === 'Overdue';

    return row.readiness === 'High Risk' || row.readiness === 'Elevated Fatigue' || row.alertStatus === 'Open';
  }

  private matchesReadinessFilter(
    row: ComplianceExceptionRow,
    filter: ComplianceFilters['readiness']
  ): boolean {
    if (filter === 'all') return true;
    return row.readiness === filter;
  }

  private exceptionSeverityRank(row: ComplianceExceptionRow): number {
    if (row.todayScan === 'Overdue') return 0;
    if (row.alertStatus === 'Open') return 1;
    if (row.readiness === 'High Risk') return 2;
    if (row.readiness === 'Elevated Fatigue') return 3;
    if (row.todayScan === 'Missing') return 4;
    if (row.todayScan === 'No request scheduled') return 5;
    return 6;
  }

  private departmentName(value: unknown): string | null {
    const label = formatDepartment(value, '');
    return label || null;
  }

  private httpStatus(error: unknown): number {
    if (!error || typeof error !== 'object') {
      return 0;
    }

    return Number((error as { status?: number }).status ?? 0);
  }

  private errorMessage(error: unknown): string {
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
    const message = this.errorMessage(error);

    if (status === 403 || status === 401) {
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

  private formatDateTime(value: string | null | undefined, fallback: string): string {
    const ts = this.toTimestamp(value);
    if (!ts) {
      return fallback;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ts));
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

  private toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
