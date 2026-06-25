import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { OperationsWorkflowsService, ScanRequestApiError } from './operations-workflows.service';

describe('OperationsWorkflowsService', () => {
  const activeContext = {
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
});
