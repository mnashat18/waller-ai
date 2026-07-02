import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { CompanyContextService } from './company-context.service';
import { AuthService } from '../../services/auth';
import { WorkspaceContextApiService } from '../../services/workspace-context-api.service';

describe('CompanyContextService canonical organization context', () => {
  let service: CompanyContextService;
  let httpMock: HttpTestingController;
  let storedAccessToken: string;
  let refreshAuthTokenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storedAccessToken = 'access-token';
    refreshAuthTokenSpy = vi.fn(() => {
      storedAccessToken = 'refreshed-access-token';
      return Promise.resolve('refreshed-access-token');
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CompanyContextService,
        WorkspaceContextApiService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: vi.fn(() => storedAccessToken),
            getAuthHeaders: vi.fn((token?: string) => new HttpHeaders({ Authorization: `Bearer ${token ?? storedAccessToken}` })),
            getCurrentUserAfterRestore: vi.fn(() =>
              Promise.resolve({
                id: 'user-1',
                email: 'owner@example.com',
                first_name: 'Avery',
                last_name: 'Owner'
              })
            ),
            isLoggedIn: vi.fn(() => true),
            clearAuthState: vi.fn(),
            refreshAuthTokenWithStoredRefreshToken: refreshAuthTokenSpy
          }
        }
      ]
    });

    service = TestBed.inject(CompanyContextService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps two active memberships from the canonical context into availableCompanies and makes no collection read', async () => {
    const statePromise = firstValueFrom(service.ensureLoaded(true));

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.method).toBe('GET');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-1',
        active_department: null,
        active_member_role: 'owner'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.method).toBe('GET');
    profileRequest.flush({
      data: [
        {
          id: 'profile-1',
          company_name: 'Waller Demo Company',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const contextRequest = httpMock.expectOne((req) =>
      req.url === `${environment.API_URL}/wellar/workspaces/context` && req.params.has('_ts')
    );
    expect(contextRequest.request.method).toBe('GET');
    expect(contextRequest.request.params.get('_ts')).toBeTruthy();
    contextRequest.flush({
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
          },
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
          }
        ],
        invitations: []
      }
    });

    const state = await statePromise;

    expect(state.context.availableCompanies).toHaveLength(2);
    expect(state.context.availableCompanies.map((company) => company.name)).toEqual([
      'Northline Logistics',
      'Waller Demo Company'
    ]);
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.membershipId).toBe('membership-2');
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.departmentName).toBe('Operations');
    expect(state.context.availableCompanies.some((company) => company.isActive)).toBe(true);
    httpMock.expectNone((req) => req.url.includes('/items/business_profile_members'));
  });

  it('marks only the canonical active membership as current even when other memberships remain active', async () => {
    const statePromise = firstValueFrom(service.ensureLoaded(true));

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.method).toBe('GET');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-2',
        active_department: null,
        active_member_role: 'manager'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.method).toBe('GET');
    profileRequest.flush({ data: [] });

    const contextRequest = httpMock.expectOne((req) =>
      req.url === `${environment.API_URL}/wellar/workspaces/context` && req.params.has('_ts')
    );
    expect(contextRequest.request.method).toBe('GET');
    contextRequest.flush({
      data: {
        active: {
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
        },
        memberships: [
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
          },
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
          }
        ],
        invitations: []
      }
    });

    const state = await statePromise;

    expect(state.context.availableCompanies.find((company) => company.id === 'profile-1')?.isActive).toBe(false);
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.isActive).toBe(true);
    expect(state.context.availableCompanies.filter((company) => company.isActive)).toHaveLength(1);
    expect(state.context.activeBusinessProfileId).toBe('profile-2');
    expect(state.context.activeMemberRole).toBe('manager');
  });

  it('synchronizes the active membership through switch and token refresh before the first authenticated load', async () => {
    const statePromise = firstValueFrom(service.ensureLoaded(true));

    const syncContextRequest = httpMock.expectOne((req) =>
      req.url === `${environment.API_URL}/wellar/workspaces/context` && req.params.has('_ts')
    );
    expect(syncContextRequest.request.method).toBe('GET');
    syncContextRequest.flush({
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
          department: null
        },
        memberships: [
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
            department: null
          },
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
          }
        ],
        invitations: []
      }
    });

    const switchRequest = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    expect(switchRequest.request.method).toBe('POST');
    expect(switchRequest.request.body).toEqual({ membership_id: 'membership-1' });
    switchRequest.flush({
      data: {
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
        department: null
      }
    });

    expect(refreshAuthTokenSpy).toHaveBeenCalledTimes(1);
    expect(storedAccessToken).toBe('refreshed-access-token');

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-1',
        active_department: null,
        active_member_role: 'owner'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    profileRequest.flush({
      data: [
        {
          id: 'profile-1',
          company_name: 'Waller Demo Company',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const loadedContextRequest = httpMock.expectOne((req) =>
      req.url === `${environment.API_URL}/wellar/workspaces/context` && req.params.has('_ts')
    );
    expect(loadedContextRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    loadedContextRequest.flush({
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
          department: null
        },
        memberships: [
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
            department: null
          },
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
          }
        ],
        invitations: []
      }
    });

    const state = await statePromise;
    expect(state.context.activeBusinessProfileId).toBe('profile-1');
    expect(state.context.activeMemberRole).toBe('owner');
    expect(state.context.availableCompanies).toHaveLength(1);

    const repeatedState = await firstValueFrom(service.ensureLoaded(false));
    expect(repeatedState.context.activeBusinessProfileId).toBe('profile-1');
    expect(refreshAuthTokenSpy).toHaveBeenCalledTimes(1);
    httpMock.expectNone((req) => req.url === `${environment.API_URL}/wellar/workspaces/switch`);
  });

  it('refreshes the token before reloading canonical context when switching organizations', async () => {
    (service as any).stateSubject.next({
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
        activeBusinessProfileId: 'profile-1',
        activeBusinessProfileName: 'Waller Demo Company',
        activeDepartmentId: null,
        activeDepartmentName: null,
        activeMemberRole: 'owner',
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Waller Demo Company',
            role: 'owner',
            membershipStatus: 'active',
            departmentName: 'All departments',
            isActive: true
          },
          {
            id: 'profile-2',
            membershipId: 'membership-2',
            name: 'Northline Logistics',
            role: 'hr',
            membershipStatus: 'active',
            departmentName: 'Marketing',
            isActive: false
          }
        ],
        hubReason: null
      }
    });

    const statePromise = firstValueFrom(service.switchCompany('profile-2'));

    const switchRequest = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    expect(switchRequest.request.body).toEqual({ membership_id: 'membership-2' });
    switchRequest.flush({
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
          memberRole: 'hr'
        },
        department: {
          id: 'department-2',
          name: 'Marketing'
        }
      }
    });

    expect(refreshAuthTokenSpy).toHaveBeenCalledTimes(1);
    expect(storedAccessToken).toBe('refreshed-access-token');

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-2',
        active_department: 'department-2',
        active_member_role: 'hr'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    profileRequest.flush({
      data: [
        {
          id: 'profile-2',
          company_name: 'Northline Logistics',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const contextRequest = httpMock.expectOne((req) =>
      req.url === `${environment.API_URL}/wellar/workspaces/context` && req.params.has('_ts')
    );
    expect(contextRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    contextRequest.flush({
      data: {
        active: {
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
            memberRole: 'hr'
          },
          department: {
            id: 'department-2',
            name: 'Marketing'
          }
        },
        memberships: [
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
            department: null
          },
          {
            id: 'membership-2',
            status: 'active',
            memberRole: 'hr',
            workspace: {
              id: 'profile-2',
              companyName: 'Northline Logistics',
              isActive: true,
              planCode: null,
              billingStatus: null
            },
            department: {
              id: 'department-2',
              name: 'Marketing'
            }
          }
        ],
        invitations: []
      }
    });

    const state = await statePromise;
    expect(state.context.activeBusinessProfileId).toBe('profile-2');
    expect(state.context.activeMemberRole).toBe('hr');
    expect(state.context.availableCompanies.map((company) => company.id)).toEqual(['profile-1', 'profile-2']);
  });
});
