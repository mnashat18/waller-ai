import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { WorkspaceCreationService } from './workspace-creation.service';

describe('WorkspaceCreationService', () => {
  let service: WorkspaceCreationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        WorkspaceCreationService,
        {
          provide: AuthService,
          useValue: {
            getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer access-token' }))
          }
        }
      ]
    });

    service = TestBed.inject(WorkspaceCreationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('treats a 201 with workspace.id as confirmed activation', async () => {
    const resultPromise = firstValueFrom(
      service.createWorkspace({
        idempotency_key: 'idem-1',
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      })
    );

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/create`);
    expect(req.request.method).toBe('POST');
    req.flush(
      {
        data: {
          workspace: {
            id: 'profile-1',
            company_name: 'Northwind Logistics',
            is_active: true,
            plan_code: 'free',
            billing_status: 'trialing'
          }
        }
      },
      { status: 201, statusText: 'Created' }
    );

    const result = await resultPromise;

    expect(result.status).toBe(201);
    expect(result.confirmed).toBe(true);
    expect(result.context.workspaceId).toBe('profile-1');
    expect(result.context.membershipId).toBeNull();
    expect(result.context.businessProfileId).toBe('profile-1');
    expect(result.context.companyName).toBe('Northwind Logistics');
  });

  it('treats a 201 with membership.business_profile_id as confirmed activation', async () => {
    const resultPromise = firstValueFrom(
      service.createWorkspace({
        idempotency_key: 'idem-2',
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      })
    );

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/create`);
    expect(req.request.method).toBe('POST');
    req.flush(
      {
        data: {
          workspace: {
            company_name: 'Northwind Logistics',
            is_active: true,
            plan_code: 'free',
            billing_status: 'trialing'
          },
          membership: {
            id: 'member-2',
            business_profile_id: 'profile-2'
          }
        }
      },
      { status: 201, statusText: 'Created' }
    );

    const result = await resultPromise;

    expect(result.status).toBe(201);
    expect(result.confirmed).toBe(true);
    expect(result.context.workspaceId).toBe('profile-2');
    expect(result.context.membershipId).toBe('member-2');
    expect(result.context.businessProfileId).toBe('profile-2');
  });

  it('returns a sparse 201 success without fabricating identifiers', async () => {
    const resultPromise = firstValueFrom(
      service.createWorkspace({
        idempotency_key: 'idem-3',
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      })
    );

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/create`);
    expect(req.request.method).toBe('POST');
    req.flush(
      {
        data: {
          workspace: {
            company_name: 'Northwind Logistics',
            is_active: true
          }
        }
      },
      { status: 201, statusText: 'Created' }
    );

    const result = await resultPromise;

    expect(result.status).toBe(201);
    expect(result.confirmed).toBe(false);
    expect(result.context.workspaceId).toBeNull();
    expect(result.context.membershipId).toBeNull();
    expect(result.context.businessProfileId).toBeNull();
    expect(result.context.companyName).toBe('Northwind Logistics');
  });
});
