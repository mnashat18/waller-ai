import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { WorkforceRosterApiService } from './workforce-roster-api.service';

describe('WorkforceRosterApiService', () => {
  let service: WorkforceRosterApiService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        WorkforceRosterApiService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: () => 'token',
            getAuthHeaders: () => ({ Authorization: 'Bearer token' })
          }
        }
      ]
    }).compileComponents();

    service = TestBed.inject(WorkforceRosterApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('returns workforce roster data with a zeroed scan request summary when the queue is empty', async () => {
    const rosterPromise = firstValueFrom(service.getWorkforceRoster());

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workforce`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);

    req.flush({
      data: {
        active: null,
        permissions: {
          canEditProfile: false,
          canManageDepartments: false,
          canViewMembers: true,
          canViewInvites: false,
          canUseComingSoonControls: false
        },
        departments: [],
        rows: [],
        eligible_scan_targets: [],
        scan_requests: {
          rows: [],
          summary: {
            total: 0,
            pending: 0,
            completed: 0,
            overdue: 0
          }
        },
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
      }
    });

    const roster = await rosterPromise;

    expect(roster.scan_requests.rows).toEqual([]);
    expect(roster.scan_requests.summary).toEqual({
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0
    });
  });

  it('does not throw when the workforce endpoint returns an empty scan request list', async () => {
    const rosterPromise = firstValueFrom(service.getWorkforceRoster());

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workforce`);
    req.flush({
      data: {
        active: null,
        permissions: {
          canEditProfile: false,
          canManageDepartments: false,
          canViewMembers: true,
          canViewInvites: false,
          canUseComingSoonControls: false
        },
        departments: [],
        rows: [],
        eligible_scan_targets: [],
        scan_requests: {
          rows: [],
          summary: {
            total: 0,
            pending: 0,
            completed: 0,
            overdue: 0
          }
        },
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
      }
    });

    const roster = await rosterPromise;
    expect(roster.scan_requests.rows.length).toBe(0);
  });
});
