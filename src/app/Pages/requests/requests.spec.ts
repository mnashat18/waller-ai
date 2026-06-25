import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { RequestsPageComponent } from './requests';

describe('RequestsPageComponent', () => {
  let component: RequestsPageComponent;
  let fixture: ComponentFixture<RequestsPageComponent>;
  let createScanRequestImpl: any;
  let createScanRequestCalls: any[];

  const pageData = {
    rows: [],
    departments: [],
    members: [
      {
        member_id: 'member-1',
        user_id: 'user-1',
        label: 'Alex Parker',
        email: 'alex@example.com',
        department_id: 'dept-1',
        department_name: 'Operations',
        status: 'active'
      }
    ],
    requestTypeOptions: ['manual'],
    statusOptions: ['pending'],
    summary: { total: 0, pending: 0, completed: 0, overdue: 0 }
  };

  beforeEach(async () => {
    createScanRequestCalls = [];
    createScanRequestImpl = () =>
      of({
        request: {
          id: 'request-1',
          status: 'pending',
          request_type: 'manual',
          requested_at: '2026-06-25T10:00:00.000Z',
          due_at: null,
          completed_at: null,
          cancelled_note: null,
          target_member_id: 'member-1',
          target_member_name: 'Alex Parker',
          target_member_email: 'alex@example.com',
          requested_by_user_id: 'user-2',
          requested_by_user_name: 'Nadia Farah',
          business_profile_id: 'profile-1',
          business_profile_name: 'Wellar',
          department_id: 'dept-1',
          department_name: 'Operations',
          completed_scan_id: null,
          completed_scan_at: null,
          notification_count: 0
        }
      });

    await TestBed.configureTestingModule({
      imports: [RequestsPageComponent],
      providers: [
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () =>
              of({
                context: {
                  authInitialized: true,
                  workspaceInitialized: true,
                  isAuthenticated: true,
                  activeBusinessProfileId: 'profile-1',
                  activeBusinessProfileName: 'Wellar',
                  activeDepartmentId: null,
                  activeDepartmentName: null,
                  activeMemberRole: 'owner'
                }
              }),
            snapshot: () => ({
              context: {
                authInitialized: true,
                workspaceInitialized: true,
                isAuthenticated: true,
                activeBusinessProfileId: 'profile-1',
                activeBusinessProfileName: 'Wellar',
                activeDepartmentId: null,
                activeDepartmentName: null,
                activeMemberRole: 'owner'
              }
            })
          }
        },
        {
          provide: OperationsWorkflowsService,
          useValue: {
            getRequestsPageData: () => of(pageData),
            createScanRequest: (input: unknown) => {
              createScanRequestCalls.push(input);
              return createScanRequestImpl(input);
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('opens the modal and submits scan requests through the protected workflow service', async () => {
    component.showCreateModal = true;

    expect(component.showCreateModal).toBe(true);

    component.createRequestForm.targetMemberId = 'member-1';
    component.createRequestForm.requestType = 'manual';
    component.createRequestForm.dueAt = '';
    component.submitCreateRequest();

    expect(createScanRequestCalls).toHaveLength(1);
    expect(createScanRequestCalls[0]).toEqual({
      target_member_id: 'member-1',
      request_type: 'manual',
      due_at: null
    });
    expect(component.showCreateModal).toBe(false);
    expect(component.createRequestError).toBe('');
  });

  it('preserves the entered request values when creation fails', async () => {
    createScanRequestImpl = () => throwError(() => ({ userMessage: 'A pending request already exists.' }));

    component.showCreateModal = true;
    component.createRequestForm.targetMemberId = 'member-1';
    component.createRequestForm.requestType = 'bulk';
    component.createRequestForm.dueAt = '';

    component.submitCreateRequest();

    expect(component.showCreateModal).toBe(true);
    expect(component.createRequestForm.targetMemberId).toBe('member-1');
    expect(component.createRequestError).toBe('A pending request already exists.');
  });
});
