import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import type { CompanyContextState } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { NotificationsService } from './notifications.service';
import { CompanyContextService } from '../core/context/company-context.service';

const readyContext = (): CompanyContextState['context'] => ({
  currentUser: {
    id: 'user-1',
    email: 'owner@example.com',
    first_name: 'Owner',
    last_name: 'User'
  },
  userId: 'user-1',
  userDisplayName: 'Owner User',
  userEmail: 'owner@example.com',
  isAuthenticated: true,
  authInitialized: true,
  workspaceInitialized: true,
  activeBusinessProfileId: 'profile-1',
  activeBusinessProfileName: 'Northwind Logistics',
  activeDepartmentId: null,
  activeDepartmentName: null,
  activeMemberRole: 'owner',
  availableCompanies: [],
  hubReason: null
});

describe('NotificationsService', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    window.history.replaceState({}, '', originalPathname || '/');
  });

  it('does not start notification reads while workspace activation route is active', () => {
    window.history.replaceState({}, '', '/app/workspace-activating');

    const state$ = new BehaviorSubject<CompanyContextState>({
      loading: false,
      error: null,
      context: readyContext()
    });
    const http = {
      get: vi.fn(() => of({ data: [] }))
    };
    const auth = {
      getStoredAccessToken: vi.fn(() => 'jwt-token'),
      getAuthHeaders: vi.fn(() => ({}))
    };

    const service = new NotificationsService(
      http as any,
      auth as any,
      {
        state$: state$.asObservable(),
        snapshot: () => state$.value
      } as any
    );

    service.initialize();

    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('NotificationsService notification filters', () => {
  let service: NotificationsService;
  let httpMock: HttpTestingController;
  let state$: BehaviorSubject<CompanyContextState>;

  beforeEach(() => {
    state$ = new BehaviorSubject<CompanyContextState>({
      loading: false,
      error: null,
      context: readyContext()
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        NotificationsService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: vi.fn(() => 'jwt-token'),
            getAuthHeaders: vi.fn((token?: string) => new HttpHeaders({ Authorization: `Bearer ${token ?? 'jwt-token'}` }))
          }
        },
        {
          provide: CompanyContextService,
          useValue: {
            state$: state$.asObservable(),
            snapshot: () => state$.value
          }
        }
      ]
    });

    service = TestBed.inject(NotificationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('includes personal notifications alongside workspace notifications when a user scope field exists', async () => {
    service.initialize();
    state$.next({
      loading: false,
      error: null,
      context: readyContext()
    });

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'recipient' },
        { field: 'read_at' },
        { field: 'type' },
        { field: 'link_type' },
        { field: 'link_id' }
      ]
    });

    const notificationsRequest = httpMock.expectOne((req) =>
      req.url.includes('/items/notifications') &&
      req.params.get('filter[_or][0][business_profile][_eq]') === 'profile-1' &&
      req.params.get('filter[_or][1][business_profile][_null]') === 'true' &&
      req.params.get('filter[_or][1][recipient][_eq]') === 'user-1'
    );
    notificationsRequest.flush({ data: [] });
  });
});
