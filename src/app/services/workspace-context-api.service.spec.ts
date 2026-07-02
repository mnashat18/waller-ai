import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { WorkspaceContextApiService } from './workspace-context-api.service';

describe('WorkspaceContextApiService', () => {
  let service: WorkspaceContextApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        WorkspaceContextApiService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: vi.fn(() => 'access-token'),
            getAuthHeaders: vi.fn(() => new HttpHeaders({ Authorization: 'Bearer access-token' }))
          }
        }
      ]
    });

    service = TestBed.inject(WorkspaceContextApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('parses the canonical context response with all active memberships intact', () => {
    service.getContext().subscribe((payload) => {
      expect(payload.active?.membership.id).toBe('membership-1');
      expect(payload.memberships).toHaveLength(2);
      expect(payload.memberships.map((membership) => membership.workspace.companyName)).toEqual([
        'Northline Logistics',
        'Waller Demo Company'
      ]);
    });

    const req = httpMock.expectOne((request) =>
      request.url === `${environment.API_URL}/wellar/workspaces/context` &&
      request.params.has('_ts')
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('_ts')).toBeTruthy();
    req.flush({
      data: {
        active: {
          workspace: {
            id: 'profile-1',
            companyName: 'Waller Demo Company',
            isActive: true,
            planCode: null,
            billingStatus: null
          },
          membership: {
            id: 'membership-1',
            status: 'active',
            memberRole: 'owner'
          },
          department: {
            id: 'department-1',
            name: 'All departments'
          }
        },
        memberships: [
          {
            id: 'membership-2',
            status: 'active',
            memberRole: 'manager',
            workspace: {
              id: 'profile-2',
              companyName: 'Northline Logistics',
              isActive: true,
              planCode: null,
              billingStatus: null
            },
            department: {
              id: 'department-2',
              name: 'Operations'
            }
          },
          {
            id: 'membership-1',
            status: 'active',
            memberRole: 'owner',
            workspace: {
              id: 'profile-1',
              companyName: 'Waller Demo Company',
              isActive: true,
              planCode: null,
              billingStatus: null
            },
            department: {
              id: 'department-1',
              name: 'All departments'
            }
          }
        ],
        invitations: []
      }
    });
  });

  it('switches using the selected membership id only', () => {
    service.switchMembership('membership-2').subscribe();

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ membership_id: 'membership-2' });
    req.flush({
      data: {
        workspace: {
          id: 'profile-2',
          companyName: 'Northline Logistics',
          isActive: true,
          planCode: null,
          billingStatus: null
        },
        membership: {
          id: 'membership-2',
          status: 'active',
          memberRole: 'manager'
        },
        department: {
          id: 'department-2',
          name: 'Operations'
        }
      }
    });
  });
});
