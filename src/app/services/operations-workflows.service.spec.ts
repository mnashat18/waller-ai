import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { WorkforceRosterApiService } from './workforce-roster-api.service';
import { OperationsWorkflowsService, ScanRequestApiError } from './operations-workflows.service';

describe('OperationsWorkflowsService', () => {
  const activeContext: {
    authInitialized: boolean;
    workspaceInitialized: boolean;
    isAuthenticated: boolean;
    activeBusinessProfileId: string;
    activeBusinessProfileName: string;
    activeDepartmentId: string | null;
    activeDepartmentName: string | null;
    activeMemberRole: 'owner' | 'hr' | 'manager' | 'employee';
  } = {
    authInitialized: true,
    workspaceInitialized: true,
    isAuthenticated: true,
    activeBusinessProfileId: 'profile-1',
    activeBusinessProfileName: 'Wellar',
    activeDepartmentId: null,
    activeDepartmentName: null,
    activeMemberRole: 'owner'
  };

  let service: OperationsWorkflowsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of({ context: activeContext }),
            snapshot: () => ({ context: activeContext }),
            getActiveMembership: () => ({ id: 'member-1', status: 'active' })
          }
        },
        {
          provide: AuthService,
          useValue: {
            ensureSessionToken: () => of(true),
            getStoredAccessToken: () => 'token',
            getAuthHeaders: (token: string) => new HttpHeaders({ Authorization: `Bearer ${token}` })
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

    service = TestBed.inject(OperationsWorkflowsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates scan requests through the protected workflow endpoint without touching collections directly', () => {
    let responseId = '';
    service.createScanRequest({
      target_member_id: 'member-1',
      request_type: 'manual',
      due_at: null
    }).subscribe((response) => {
      responseId = response.request.id;
    });

    const req = httpMock.expectOne('https://dash.conntinuity.com/wellar/scan-requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      target_member_id: 'member-1',
      request_type: 'manual'
    });
    expect(req.request.headers.get('Authorization')).toBe('Bearer token');

    req.flush({
      data: {
        request: {
          id: 'request-1',
          status: 'pending',
          request_type: 'manual',
          requested_at: '2026-06-25T10:00:00.000Z',
          due_at: null,
          completed_at: null,
          cancelled: null,
          target_member: {
            id: 'member-1',
            status: 'active',
            member_role: 'employee',
            user: {
              id: 'user-1',
              email: 'alex@example.com',
              first_name: 'Alex',
              last_name: 'Parker'
            },
            department: {
              id: 'dept-1',
              name: 'Operations'
            }
          },
          requested_by_user: {
            id: 'user-2',
            first_name: 'Nadia',
            last_name: 'Farah',
            email: 'nadia@example.com'
          },
          business_profile: {
            id: 'profile-1',
            company_name: 'Wellar'
          },
          department: {
            id: 'dept-1',
            name: 'Operations'
          },
          completed_scan: null
        }
      }
    });

    expect(responseId).toBe('request-1');
  });

  it('loads scan request queue data through the protected workflow endpoint', () => {
    let responseSummary = '';

    service.loadScanRequestQueue().subscribe((response) => {
      responseSummary = `${response.summary.total}:${response.rows.length}`;
    });

    const req = httpMock.expectOne('https://dash.conntinuity.com/wellar/scan-requests');
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toBe('https://dash.conntinuity.com/wellar/scan-requests');
    expect(req.request.urlWithParams).toBe('https://dash.conntinuity.com/wellar/scan-requests');
    req.flush({
      data: {
        rows: [],
        summary: {
          total: 0,
          pending: 0,
          completed: 0,
          overdue: 0
        }
      }
    });

    expect(responseSummary).toBe('0:0');
  });

  it('maps forbidden request creation into a user-safe error', () => {
    let captured: ScanRequestApiError | null = null;

    service.createScanRequest({
      target_member_id: 'member-1',
      request_type: 'manual'
    }).subscribe({
      next: () => {
        throw new Error('expected createScanRequest to reject');
      },
      error: (error: ScanRequestApiError) => {
        captured = error;
      }
    });

    const req = httpMock.expectOne('https://dash.conntinuity.com/wellar/scan-requests');
    req.flush(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Workspace access denied'
        }
      },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(captured).toBeTruthy();
    const error = captured as unknown as ScanRequestApiError;
    expect(error.code).toBe('forbidden');
    expect(error.status).toBe(403);
    expect(error.userMessage).toBe('Workspace access denied');
  });

  it('requests alerts from /items/alerts with department and review fields and resolves id and expanded department relations', async () => {
    activeContext.activeMemberRole = 'manager';
    activeContext.activeDepartmentId = 'department-1';

    const pagePromise = firstValueFrom(service.getAlertsPageData());

    const alertsRequest = httpMock.expectOne((request) => request.url.includes('/items/alerts'));
    expect(alertsRequest.request.method).toBe('GET');

    const fields = new URLSearchParams(alertsRequest.request.urlWithParams.split('?')[1] ?? '').get('fields')?.split(',') ?? [];
    expect(fields).toEqual(expect.arrayContaining([
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
    ]));

    alertsRequest.flush({
      data: [
        {
          id: 'alert-1',
          date_created: '2026-06-28T10:00:00.000Z',
          business_profile: { id: 'profile-1', company_name: 'Wellar' },
          department: 'department-1',
          status: 'new',
          severity: 'high',
          title: 'Returned alert',
          message: 'Returned alert message',
          reviewed_at: null
        },
        {
          id: 'alert-2',
          date_created: '2026-06-28T11:00:00.000Z',
          business_profile: { id: 'profile-1', company_name: 'Wellar' },
          department: { id: 'department-2', name: 'Safety' },
          status: 'open',
          severity: 'critical',
          title: 'Expanded alert',
          message: 'Expanded alert message',
          reviewed_at: '2026-06-28T11:05:00.000Z'
        }
      ]
    });

    const departmentsRequest = httpMock.expectOne((request) => request.url.includes('/items/departments'));
    const notificationsRequest = httpMock.expectOne((request) => request.url.includes('/items/notifications'));
    departmentsRequest.flush({
      data: [
        { id: 'department-1', name: 'Operations' },
        { id: 'department-2', name: 'Safety' }
      ]
    });
    notificationsRequest.flush({ data: [] });

    const result = await pagePromise;
    const idRow = result.rows.find((row: { id: string; department_name: string | null; reviewed_at: string | null }) => row.id === 'alert-1');
    const expandedRow = result.rows.find((row: { id: string; department_name: string | null; reviewed_at: string | null }) => row.id === 'alert-2');

    expect(idRow?.department_name).toBe('Operations');
    expect(idRow?.reviewed_at).toBeNull();
    expect(expandedRow?.department_name).toBe('Safety');
    expect(expandedRow?.reviewed_at).toBe('2026-06-28T11:05:00.000Z');
  });
});
