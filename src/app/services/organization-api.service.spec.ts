import { HttpHeaders } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { OrganizationApiService } from './organization-api.service';

describe('OrganizationApiService department contracts', () => {
  let service: OrganizationApiService;
  let httpMock: HttpTestingController;

  const authStub = {
    getStoredAccessToken: () => 'access-token',
    getAuthHeaders: () => new HttpHeaders({ Authorization: 'Bearer access-token' })
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OrganizationApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }
      ]
    });

    service = TestBed.inject(OrganizationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('POSTs department creation with manager_member_id null when no manager is selected', () => {
    service.createDepartment({ name: 'Operations' }).subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Operations',
      manager_member_id: null
    });

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'profile-1',
          manager_member_id: null
        }
      }
    });
  });

  it('PATCHes department updates with the selected manager membership id', () => {
    service.updateDepartment('department-1', {
      name: 'Operations',
      manager_member_id: 'member-manager'
    }).subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments/department-1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      name: 'Operations',
      manager_member_id: 'member-manager'
    });

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'profile-1',
          manager_member_id: 'member-manager'
        }
      }
    });
  });

  it('posts deactivation through the protected department deactivate endpoint', () => {
    service.deactivateDepartment('department-1').subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments/department-1/deactivate`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: false,
          business_profile: 'profile-1',
          manager_member_id: 'member-manager'
        }
      }
    });
  });
});
