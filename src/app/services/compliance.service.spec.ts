import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { OperationsAdminService, type WorkforceMemberRow } from './operations-admin.service';
import { OperationsWorkflowsService } from './operations-workflows.service';
import { WorkforceRosterApiService } from './workforce-roster-api.service';
import { ComplianceService, type ComplianceOverviewData } from './compliance.service';

describe('ComplianceService', () => {
  const activeContext = {
    authInitialized: true,
    workspaceInitialized: true,
    isAuthenticated: true,
    activeBusinessProfileId: 'profile-1',
    activeBusinessProfileName: 'Wellar',
    activeBusinessProfile: {
      id: 'profile-1',
      company_name: 'Wellar'
    },
    activeDepartmentId: null,
    activeDepartmentName: null,
    activeMemberRole: 'owner',
    activeMembership: {
      id: 'member-1',
      status: 'active',
      department: null
    }
  };

  const mockMembers: WorkforceMemberRow[] = [
    {
      id: 'member-1',
      status: 'active',
      member_role: 'employee',
      joined_at: '2026-06-01T10:00:00.000Z',
      business_profile: 'profile-1',
      department_id: 'dept-1',
      department_name: 'Engineering',
      user_id: 'user-1',
      user_first_name: 'Alex',
      user_last_name: 'Parker',
      user_email: 'alex@example.com',
      todays_scan: true,
      readiness_label: 'Stable',
      last_scan_at: '2026-06-28T09:00:00.000Z'
    },
    {
      id: 'member-2',
      status: 'active',
      member_role: 'employee',
      joined_at: '2026-06-02T10:00:00.000Z',
      business_profile: 'profile-1',
      department_id: 'dept-1',
      department_name: 'Engineering',
      user_id: 'user-2',
      user_first_name: 'Jordan',
      user_last_name: 'Smith',
      user_email: 'jordan@example.com',
      todays_scan: false,
      readiness_label: 'High Risk',
      last_scan_at: '2026-06-25T14:00:00.000Z'
    }
  ];

  let service: ComplianceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CompanyContextService,
          useValue: {
            ensureActiveContext: () => Promise.resolve({ ...activeContext }),
            snapshot: () => ({ context: activeContext })
          }
        },
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: () => 'test-token',
            getAuthHeaders: (token: string) => new HttpHeaders({ Authorization: `Bearer ${token}` })
          }
        },
        {
          provide: OperationsAdminService,
          useValue: {
            getWorkforcePageData: () => of({ rows: mockMembers })
          }
        },
        {
          provide: OperationsWorkflowsService,
          useValue: {
            loadScanRequestsSafe: () => Promise.resolve({ rows: [] }),
            getAlertsPageData: () => of({ rows: [] })
          }
        },
        {
          provide: WorkforceRosterApiService,
          useValue: {
            getWorkforceRoster: () =>
              of({
                active: {
                  workspace: { id: 'profile-1', companyName: 'Wellar', isActive: true, planCode: null, billingStatus: null },
                  membership: { id: 'member-1', status: 'active', memberRole: 'owner' },
                  department: null
                },
                permissions: {
                  canEditProfile: true,
                  canManageDepartments: true,
                  canViewMembers: true,
                  canViewInvites: true,
                  canUseComingSoonControls: false
                },
                departments: [],
                rows: [],
                eligible_scan_targets: [],
                scan_requests: { rows: [], summary: { total: 0, pending: 0, completed: 0, overdue: 0 } },
                summary: {
                  total: 0,
                  verified_members: 0,
                  pending_invitations: 0,
                  repair_required: 0,
                  inactive: 0,
                  eligible_scan_targets: 0,
                  open_scan_requests: 0,
                  completed_scan_requests: 0,
                  overdue_scan_requests: 0
                }
              })
          }
        }
      ]
    });

    service = TestBed.inject(ComplianceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  const settleDeferredRequests = async (): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  afterEach(() => {
    httpMock.verify();
  });

  it('requests scan_results with real fields only and excludes invalid fields', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    expect(wellnessScansReq.request.method).toBe('GET');
    wellnessScansReq.flush({
      data: [
        { id: 'scan-1', member: 'member-1', date_created: '2026-06-28T09:00:00.000Z', status: 'completed' }
      ]
    });

    await settleDeferredRequests();

    const scanResultsReq = httpMock.expectOne((req) => req.url.includes('/items/scan_results'));
    expect(scanResultsReq.request.method).toBe('GET');

    const fields = new URLSearchParams(scanResultsReq.request.urlWithParams.split('?')[1] ?? '').get('fields')?.split(',') ?? [];
    expect(fields).toEqual([
      'id',
      'date_created',
      'scan_id',
      'risk_level',
      'readiness_score',
      'confidence',
      'task_performance_score',
      'explanation',
      'suggested_action'
    ]);

    scanResultsReq.flush({
      data: [
        {
          id: 'result-1',
          scan_id: 'scan-1',
          risk_level: 'stable',
          readiness_score: 85,
          confidence: 0.95,
          task_performance_score: 88,
          explanation: 'Positive readiness indicators',
          suggested_action: 'Continue current routine',
          date_created: '2026-06-28T09:05:00.000Z'
        }
      ]
    });

    const overview = await overviewPromise;
    expect(overview.dataUnavailable).toBe(false);
    expect(overview.scanResultsAccess).toBe('available');
  });

  it('treats successful empty scan_results as available and does not set dataUnavailable', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    wellnessScansReq.flush({ data: [] });

    await settleDeferredRequests();

    const overview = await overviewPromise;
    expect(overview.dataUnavailable).toBe(false);
    expect(overview.sourceCounts.scanResults).toBe(0);
  });

  it('sets dataUnavailable when wellness_scans succeeds but scan_results fails', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    wellnessScansReq.flush({
      data: [
        { id: 'scan-1', member: 'member-1', date_created: '2026-06-28T09:00:00.000Z', status: 'completed' }
      ]
    });

    await settleDeferredRequests();

    const scanResultsReq = httpMock.expectOne((req) => req.url.includes('/items/scan_results'));
    scanResultsReq.flush(
      { error: { errors: [{ message: 'Forbidden' }] } },
      { status: 403, statusText: 'Forbidden' }
    );

    const overview = await overviewPromise;
    expect(overview.dataUnavailable).toBe(true);
    expect(overview.scanResultsAccess).toBe('permission_blocked');
  });

  it('maps suggested_action from scan_results onto exceptionRows', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    wellnessScansReq.flush({
      data: [
        { id: 'scan-1', member: 'member-2', date_created: '2026-06-25T14:00:00.000Z', status: 'completed' }
      ]
    });

    await settleDeferredRequests();

    const scanResultsReq = httpMock.expectOne((req) => req.url.includes('/items/scan_results'));
    scanResultsReq.flush({
      data: [
        {
          id: 'result-1',
          scan_id: 'scan-1',
          risk_level: 'high_risk',
          readiness_score: 45,
          confidence: 0.88,
          task_performance_score: 50,
          explanation: 'Elevated fatigue indicators detected',
          suggested_action: 'Schedule a wellness check-in and review workload',
          date_created: '2026-06-25T14:05:00.000Z'
        }
      ]
    });

    const overview = await overviewPromise;
    const exception = overview.exceptionRows.find((row) => row.memberId === 'member-2');
    expect(exception).toBeDefined();
    expect(exception?.suggestedAction).toBe('Schedule a wellness check-in and review workload');
  });

  it('does not call POST, PATCH, PUT, or DELETE', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    expect(departmentsReq.request.method).toBe('GET');
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    expect(wellnessScansReq.request.method).toBe('GET');
    wellnessScansReq.flush({ data: [] });

    await settleDeferredRequests();

    await overviewPromise;
  });

  it('sets coverageProven when members exist and scanEligibleMembersToday > 0', async () => {
    const overviewPromise = service.loadComplianceOverview(activeContext as any, {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    }, true);

    const departmentsReq = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentsReq.flush({ data: [] });

    const wellnessScansReq = httpMock.expectOne((req) => req.url.includes('/items/wellness_scans'));
    wellnessScansReq.flush({ data: [] });

    await settleDeferredRequests();

    const overview = await overviewPromise;
    expect(overview.coverageProven).toBe(mockMembers.length > 0 && overview.summary.scanEligibleMembersToday > 0);
  });
});
