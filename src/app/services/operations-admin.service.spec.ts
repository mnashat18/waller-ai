import { provideHttpClient } from '@angular/common/http';
import { HttpHeaders } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { OperationsAdminService } from './operations-admin.service';
import { WorkforceRosterApiService } from './workforce-roster-api.service';

const createScopedContextState = (role: 'owner' | 'hr' | 'manager' = 'owner') => ({
  loading: false,
  error: null,
  context: {
    currentUser: {
      id: 'user-1',
      email: 'owner@example.com',
      first_name: 'Avery',
      last_name: 'Owner'
    },
    userId: 'user-1',
    userDisplayName: 'Avery Owner',
    userEmail: 'owner@example.com',
    isAuthenticated: true,
    authInitialized: true,
    workspaceInitialized: true,
    activeBusinessProfileId: 'workspace-1',
    activeBusinessProfileName: 'Northwind Logistics',
    activeDepartmentId: null,
    activeDepartmentName: null,
    activeMemberRole: role,
    availableCompanies: [],
    hubReason: null
  }
});

describe('OperationsAdminService department manager assignment', () => {
  let service: OperationsAdminService;
  let httpMock: HttpTestingController;
  let companyContextMock: {
    ensureLoaded: ReturnType<typeof vi.fn>;
    snapshot: ReturnType<typeof vi.fn>;
    switchCompany?: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    companyContextMock = {
      ensureLoaded: vi.fn(() => of(createScopedContextState())),
      snapshot: vi.fn(() => createScopedContextState())
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        OperationsAdminService,
        {
          provide: AuthService,
          useValue: {
            ensureSessionToken: () => of(true),
            getStoredAccessToken: () => 'access-token',
            getAuthHeaders: () => new HttpHeaders({ Authorization: 'Bearer access-token' })
          }
        },
        { provide: CompanyContextService, useValue: companyContextMock },
        { provide: WorkforceRosterApiService, useValue: {} }
      ]
    });

    service = TestBed.inject(OperationsAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends null manager_member_id when creating a department without a manager', () => {
    service.createDepartment({ name: ' Operations ' }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Operations',
      manager_member_id: null
    });
    req.flush({ data: { department: { id: 'department-1' } } });
  });

  it('sends the selected membership id in the exact create payload', () => {
    service.createDepartment({ name: 'Operations', manager_member_id: 'member-1' }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Operations',
      manager_member_id: 'member-1'
    });
    req.flush({ data: { department: { id: 'department-1' } } });
  });

  it('sends null when clearing a department manager', () => {
    service.assignDepartmentManager('department-1', null).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments/department-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      manager_member_id: null
    });
    req.flush({ data: { department: { id: 'department-1' } } });
  });

  it('only exposes active owner hr and manager members as manager options', () => {
    const data = (service as any).buildDepartmentsPageData(
      [
        {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'workspace-1',
          manager_member: 'member-owner'
        }
      ],
      [
        {
          id: 'member-owner',
          status: 'active',
          member_role: 'owner',
          department: 'department-1',
          user: { id: 'user-owner', first_name: 'Olivia', last_name: 'Owner', email: 'owner@example.com' }
        },
        {
          id: 'member-hr',
          status: 'active',
          member_role: 'hr',
          department: null,
          user: { id: 'user-hr', first_name: 'Harper', last_name: 'HR', email: 'hr@example.com' }
        },
        {
          id: 'member-manager',
          status: 'active',
          member_role: 'manager',
          department: null,
          user: { id: 'user-manager', first_name: 'Mina', last_name: 'Manager', email: 'manager@example.com' }
        },
        {
          id: 'member-employee',
          status: 'active',
          member_role: 'employee',
          department: null,
          user: { id: 'user-employee', first_name: 'Eli', last_name: 'Employee', email: 'employee@example.com' }
        },
        {
          id: 'member-inactive',
          status: 'inactive',
          member_role: 'manager',
          department: null,
          user: { id: 'user-inactive', first_name: 'Ivy', last_name: 'Inactive', email: 'inactive@example.com' }
        }
      ],
      [],
      []
    );

    expect(data.managerOptions).toEqual([
      { id: 'member-owner', label: 'Olivia Owner — Owner' },
      { id: 'member-hr', label: 'Harper HR — HR' },
      { id: 'member-manager', label: 'Mina Manager — Manager' }
    ]);
    expect(data.rows[0].manager_name).toBe('Olivia Owner');
  });

  it('creates an invite with the original request_invites contract', () => {
    service.createInvite({
      email: ' new.person@example.com ',
      member_role: 'manager',
      department: 'department-2',
      invite_type: 'member_onboarding',
      note: 'ignore me'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/items/request_invites`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      status: 'pending',
      requested_by_user: 'user-1',
      business_profile: 'workspace-1',
      member_role: 'manager',
      invite_type: 'email',
      email: 'new.person@example.com',
      department: 'department-2'
    });
    req.flush({ data: { id: 'invite-1' } });
  });

  it('re-sends invites by rotating the expiry window and marking the invite sent', () => {
    service.resendInvite('invite-1').subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/items/request_invites/invite-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('sent');
    expect(new Date(req.request.body.sent_at).toString()).not.toBe('Invalid Date');
    expect(new Date(req.request.body.expires_at).toString()).not.toBe('Invalid Date');
    req.flush({ data: { id: 'invite-1' } });
  });

  it('revokes invites by clearing the active request state through the original patch contract', () => {
    service.revokeInvite('invite-1').subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/items/request_invites/invite-1`);
    expect(req.request.method).toBe('PATCH');
    expect(['cancelled', 'revoked']).toContain(req.request.body.status);
    req.flush({ data: { id: 'invite-1' } });
  });
});
