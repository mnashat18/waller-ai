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
  highAttention: number;
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
  camera_confidence?: number | string | null;
  voice_confidence?: number | string | null;
  task_performance_score?: number | string | null;
  confidence_drift?: number | string | null;
  explanation?: string | null;
  internal_analysis?: string | null;
  ai_model_version?: string | null;
  baseline_used?: string | null;
  suggested_action?: string | null;
  face_metrics?: unknown;
  voice_metrics?: unknown;
  reaction_metrics?: unknown;
  date_created?: string | null;
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
      scanRequests = this.resolveSettled('scan_requests', requestsSettled, warnings, () => { forbiddenSources += 1; });
      alerts = this.resolveSettled('alerts', alertsSettled, warnings, () => { forbiddenSources += 1; });
      departments = this.resolveSettled('departments', departmentsSettled, warnings, () => { forbiddenSources += 1; });
      wellnessScans = this.resolveSettled('wellness_scans', wellnessScansSettled, warnings, () => { forbiddenSources += 1; });
      scanResults = this.resolveSettled('scan_results', scanResultsSettled, warnings, () => { forbiddenSources += 1; });
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
      filters
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
      partialWarning: warnings.size
        ? 'Some compliance sources are unavailable due to workspace permissions.'
        : null,
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
    const memberRiskLevelById = this.memberRiskLevelById(data);

    const openAlerts = this.applyDepartmentFilterToAlerts(data.alerts, data.filters.department).filter((alert) =>
      this.isOpenAlertStatus(alert.status)
    );

    const highAttentionAlerts = openAlerts.filter((alert) => {
      const severity = this.normalizeText(alert.severity);
      return severity === 'high' || severity === 'critical';
    });

    const highRiskMembersToday = members.filter((member) => {
      if (!member.todays_scan) return false;
      return this.resolveMemberReadiness(member, memberRiskLevelById) === 'High Risk';
    }).length;

    const overdueRequests = this.applyDepartmentFilterToRequests(data.scanRequests, data.filters.department).filter((request) =>
      this.isOverdueRequest(request.status, request.due_at)
    );

    const scanEligibleMembers = members.length;
    const completedInRange = members.filter((member) => completedMemberIdsInRange.has(member.id)).length;
    const missingScans = Math.max(scanEligibleMembers - completedInRange, 0);

    return {
      complianceRate: scanEligibleMembers > 0 ? Math.round((completedInRange / scanEligibleMembers) * 100) : 0,
      completedScans: completedInRange,
      missingScans,
      openAlerts: openAlerts.length,
      highAttention: highAttentionAlerts.length + highRiskMembersToday,
      overdueRequests: overdueRequests.length,
      scanEligibleMembersToday: scanEligibleMembers
    };
  }

  buildDepartmentCompliance(data: NormalizedSource): DepartmentComplianceRow[] {
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

    const departmentMap = new Map<string, { id: string | null; name: string }>();
    for (const department of data.departments) {
      if (!department.id) continue;
      departmentMap.set(department.id, { id: department.id, name: department.name || 'Unnamed Department' });
    }

    for (const member of members) {
      if (member.department_id) {
        departmentMap.set(member.department_id, {
          id: member.department_id,
          name: member.department_name || departmentMap.get(member.department_id)?.name || 'Unnamed Department'
        });
      }
    }

    const includeUnassigned = members.some((member) => !member.department_id);
    if (includeUnassigned) {
      departmentMap.set('unassigned', { id: null, name: 'Unassigned members' });
    }

    const rows: DepartmentComplianceRow[] = [];
    for (const [key, department] of departmentMap.entries()) {
      const departmentMembers = members.filter((member) =>
        department.id ? member.department_id === department.id : !member.department_id
      );

      const completedToday = departmentMembers.filter((member) => completedMemberIdsInRange.has(member.id)).length;
      const activeMembers = departmentMembers.length;
      const missingScans = Math.max(activeMembers - completedToday, 0);
      const openAlerts = alerts.filter((alert) =>
        department.id ? alert.department_id === department.id : !alert.department_id
      ).length;

      rows.push({
        key,
        departmentId: department.id,
        departmentName: department.name,
        activeMembers,
        scanEligible: activeMembers,
        completedToday,
        missingScans,
        complianceRate: activeMembers > 0 ? Math.round((completedToday / activeMembers) * 100) : 0,
        openAlerts
      });
    }

    const filtered = this.applyDepartmentFilterToDepartmentRows(rows, data.filters.department);
    return filtered.sort((left, right) => {
      if (left.departmentName === 'Unassigned members') return 1;
      if (right.departmentName === 'Unassigned members') return -1;
      return left.departmentName.localeCompare(right.departmentName);
    });
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
        departmentName: member.department_name || 'Unassigned members',
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
        department: member.department_name || 'Unassigned members',
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
          departmentName: request.department_name || 'Unassigned',
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
          departmentName: request.department_name || 'Unassigned',
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
          departmentName: alert.department_name || 'Unassigned',
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
          departmentName: alert.department_name || 'Unassigned',
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
        departmentName: this.departmentName(scan.department) || 'Unassigned',
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
      options.set(member.department_id, member.department_name || options.get(member.department_id) || 'Unnamed Department');
    }

    return Array.from(options.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
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

  private async loadScanResults(token: string): Promise<ScanResultRecord[]> {
    return this.queryWithFieldFallback<ScanResultRecord>(
      'scan_results',
      [
        [
          'id',
          'date_created',
          'scan_id',
          'risk_level',
          'readiness_score',
          'confidence',
          'camera_confidence',
          'voice_confidence',
          'task_performance_score',
          'confidence_drift',
          'explanation',
          'internal_analysis',
          'ai_model_version',
          'baseline_used',
          'suggested_action',
          'face_metrics',
          'voice_metrics',
          'reaction_metrics'
        ],
        ['id', 'date_created', 'scan_id', 'risk_level', 'readiness_score', 'confidence', 'task_performance_score'],
        ['id', 'date_created', 'scan_id', 'risk_level']
      ],
      token,
      {
        sort: '-date_created',
        limit: 1500
      }
    );
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

  private isFieldCompatibilityError(error: unknown): boolean {
    const status = this.httpStatus(error);
    const message = this.normalizeText(
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
