import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { InviteService } from './invites';

describe('InviteService invitation actions', () => {
  let service: InviteService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InviteService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: vi.fn(() => 'jwt-token'),
            getAuthHeaders: vi.fn((token?: string) => new HttpHeaders({ Authorization: `Bearer ${token ?? 'jwt-token'}` }))
          }
        }
      ]
    });

    service = TestBed.inject(InviteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads invite details through the canonical in-app invite route', () => {
    service.getInvite('invite-1').subscribe((invite) => {
      expect(invite.id).toBe('invite-1');
      expect(invite.canAct).toBe(true);
    });

    const req = httpMock.expectOne((request) =>
      request.url === `${environment.API_URL}/wellar/workspaces/invites/invite-1` &&
      request.params.has('_ts')
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'invite-1',
        email: 'new.person@example.com',
        inviteType: 'in_app',
        status: 'pending',
        memberRole: 'manager',
        businessProfileId: 'profile-1',
        companyName: 'Northwind Logistics',
        departmentId: 'department-1',
        departmentName: 'Operations',
        expiresAt: '2026-07-03T00:00:00.000Z',
        requestedByUser: {
          id: 'user-1',
          email: 'owner@example.com',
          displayName: 'Owner User'
        },
        canAct: true
      }
    });
  });

  it('accepts canonical invite details when email is omitted from the response payload', () => {
    service.getInvite('invite-1').subscribe((invite) => {
      expect(invite.id).toBe('invite-1');
      expect(invite.email).toBeNull();
      expect(invite.companyName).toBe('Waller Demo Company');
      expect(invite.status).toBe('pending');
    });

    const req = httpMock.expectOne((request) =>
      request.url === `${environment.API_URL}/wellar/workspaces/invites/invite-1` &&
      request.params.has('_ts')
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'invite-1',
        inviteType: 'in_app',
        status: 'pending',
        memberRole: 'manager',
        companyName: 'Waller Demo Company',
        departmentName: 'hala wallah',
        canAct: true
      }
    });
  });

  it('accepts invitations through the protected accept endpoint', () => {
    service.acceptInvite('invite-1').subscribe((response) => {
      expect(response.ok).toBe(true);
      expect(response.membershipId).toBe('membership-1');
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites/invite-1/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      data: {
        ok: true,
        message: 'Invitation accepted. The organization is now available in Profile → Switch Organization.',
        inviteId: 'invite-1',
        businessProfileId: 'profile-1',
        membershipId: 'membership-1',
        memberRole: 'manager',
        departmentId: 'department-1',
        inviteType: 'in_app',
        status: 'claimed',
        canAct: false
      }
    });
  });

  it('declines invitations through the protected decline endpoint', () => {
    service.declineInvite('invite-1').subscribe((response) => {
      expect(response.ok).toBe(true);
      expect(response.status).toBe('revoked');
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites/invite-1/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      data: {
        ok: true,
        message: 'Invitation declined.',
        inviteId: 'invite-1',
        businessProfileId: 'profile-1',
        membershipId: null,
        memberRole: 'manager',
        departmentId: 'department-1',
        inviteType: 'in_app',
        status: 'revoked',
        canAct: false
      }
    });
  });
});
