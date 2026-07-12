import { HttpHeaders } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { CompanyContextService } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { OperationsAdminService } from './operations-admin.service';

const createScopedContextState = () => ({
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
    activeMemberRole: 'owner' as const,
    availableCompanies: [],
    hubReason: null
  }
});

describe('OperationsAdminService invite payload', () => {
  let service: OperationsAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
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
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: vi.fn(() => of(createScopedContextState())),
            snapshot: vi.fn(() => createScopedContextState())
          }
        }
      ]
    });

    service = TestBed.inject(OperationsAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends only the canonical workspace invite payload', () => {
    service
      .createInvite({
        email: ' mnashat2000@gmail.com ',
        member_role: 'hr',
        department: 'department-2'
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'mnashat2000@gmail.com',
      member_role: 'hr',
      department: 'department-2'
    });
    expect(req.request.body).not.toHaveProperty('status');
    expect(req.request.body).not.toHaveProperty('requested_by_user');
    expect(req.request.body).not.toHaveProperty('business_profile');
    expect(req.request.body).not.toHaveProperty('invite_type');
    expect(req.request.body).not.toHaveProperty('phone');
    expect(req.request.body).not.toHaveProperty('note');
    req.flush({ data: { ok: true } });
  });

  it('surfaces a nested Directus backend invite message', async () => {
    let capturedError: unknown = null;

    service.createInvite({
      email: 'new.person@example.com',
      member_role: 'employee'
    }).subscribe({
      next: () => {
        throw new Error('Expected invite creation to fail.');
      },
      error: (error) => {
        capturedError = error;
      }
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'new.person@example.com',
      member_role: 'employee'
    });
    req.flush(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'Invite role must be employee, manager, or hr.'
        }
      },
      { status: 400, statusText: 'Bad Request' }
    );

    await Promise.resolve();

    expect(capturedError).toBeTruthy();
    expect((capturedError as Error).message).toContain('Invite role must be employee, manager, or hr.');
  });

  it('surfaces a standard Directus errors array message', async () => {
    let capturedError: unknown = null;

    service.createInvite({
      email: 'second.person@example.com',
      member_role: 'employee'
    }).subscribe({
      next: () => {
        throw new Error('Expected invite creation to fail.');
      },
      error: (error) => {
        capturedError = error;
      }
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    req.flush(
      {
        errors: [
          {
            message: 'Duplicate invite detected.'
          }
        ]
      },
      { status: 409, statusText: 'Conflict' }
    );

    await Promise.resolve();

    expect(capturedError).toBeTruthy();
    expect((capturedError as Error).message).toContain('Duplicate invite detected.');
  });

  it('exposes the full endpoint URL for the invite request', () => {
    service.createInvite({
      email: 'third.person@example.com',
      member_role: 'hr'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { ok: true } });
  });

  it('keeps authorization headers and credentials on invite requests', () => {
    service.createInvite({
      email: 'fourth.person@example.com',
      member_role: 'hr'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ data: { ok: true } });
  });

  it('does not add backend-owned invite fields', () => {
    service.createInvite({
      email: 'fifth.person@example.com',
      member_role: 'hr',
      department: null
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.body).toEqual({
      email: 'fifth.person@example.com',
      member_role: 'hr'
    });
    req.flush({ data: { ok: true } });
  });

  it('supports the createInvite URL without changing the delivery target', () => {
    service.createInvite({
      email: 'sixth.person@example.com',
      member_role: 'hr',
      department: 'department-2'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    expect(req.request.url).toBe(`${environment.API_URL}/wellar/workspaces/invites`);
    req.flush({ data: { ok: true } });
  });

  it('does not leak unexpected fields in invite payload assertions', () => {
    service.createInvite({
      email: 'seventh.person@example.com',
      member_role: 'hr',
      department: 'department-2'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites`);
    const body = req.request.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['department', 'email', 'member_role']);
    req.flush({ data: { ok: true } });
  });
});
