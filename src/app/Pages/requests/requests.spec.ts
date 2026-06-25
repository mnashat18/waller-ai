import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { RequestsPageComponent } from './requests';

describe('RequestsPageComponent', () => {
  let component: RequestsPageComponent;
  let fixture: ComponentFixture<RequestsPageComponent>;
  let createScanRequestImpl: any;
  let createScanRequestCalls: unknown[];
  let getRequestsPageDataCalls: number;

  const baseMembers = [
    {
      member_id: 'member-owner',
      user_id: 'user-owner',
      label: 'Demo Owner',
      email: 'owner@example.com',
      member_role: 'owner',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-hr',
      user_id: 'user-hr',
      label: 'Demo HR',
      email: 'hr@example.com',
      member_role: 'hr',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-manager',
      user_id: 'user-manager',
      label: 'Demo Manager',
      email: 'manager@example.com',
      member_role: 'manager',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-employee',
      user_id: 'user-employee',
      label: 'Alex Parker',
      email: 'alex@example.com',
      member_role: 'employee',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-needs-repair',
      user_id: 'user-repair',
      label: 'Needs Repair',
      email: '',
      member_role: 'employee',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-inactive',
      user_id: 'user-inactive',
      label: 'Inactive Employee',
      email: 'inactive@example.com',
      member_role: 'employee',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'inactive'
    }
  ];

  const pageData = {
    rows: [],
    departments: [],
    members: baseMembers,
    requestTypeOptions: ['manual'],
    statusOptions: ['pending'],
    summary: { total: 0, pending: 0, completed: 0, overdue: 0 }
  };

  beforeEach(async () => {
    createScanRequestCalls = [];
    getRequestsPageDataCalls = 0;
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
          target_member_id: 'member-employee',
          target_member_name: 'Alex Parker',
          target_member_email: 'alex@example.com',
          requested_by_user_id: 'user-owner',
          requested_by_user_name: 'Demo Owner',
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
            getRequestsPageData: () => {
              getRequestsPageDataCalls += 1;
              return of(pageData);
            },
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

  it('filters request targets to active linked employees only', () => {
    expect(component.eligibleRequestMembers.map((member) => member.member_id)).toEqual(['member-employee']);
  });

  it('opens the modal and submits scan requests through the protected workflow service', async () => {
    component.showCreateModal = true;

    expect(component.showCreateModal).toBe(true);

    component.createRequestForm.targetMemberId = 'member-employee';
    component.createRequestForm.requestType = 'manual';
    component.createRequestForm.dueAt = '';
    component.submitCreateRequest();

    expect(createScanRequestCalls).toHaveLength(1);
    expect(createScanRequestCalls[0]).toEqual({
      target_member_id: 'member-employee',
      request_type: 'manual',
      due_at: null
    });
    expect(component.showCreateModal).toBe(false);
    expect(component.createRequestError).toBe('');
    expect(getRequestsPageDataCalls).toBe(2);
  });

  it('preserves the entered request values when creation fails', async () => {
    createScanRequestImpl = () => throwError(() => ({ userMessage: 'A pending request already exists.' }));

    component.showCreateModal = true;
    component.createRequestForm.targetMemberId = 'member-employee';
    component.createRequestForm.requestType = 'bulk';
    component.createRequestForm.dueAt = '';

    component.submitCreateRequest();

    expect(component.showCreateModal).toBe(true);
    expect(component.createRequestForm.targetMemberId).toBe('member-employee');
    expect(component.createRequestError).toBe('A pending request already exists.');
  });

  it('renders the no-eligible-employees state when the modal has no valid targets', async () => {
    const originalMembers = pageData.members;
    try {
      pageData.members = [
        {
          member_id: 'member-owner',
          user_id: 'user-owner',
          label: 'Demo Owner',
          email: 'owner@example.com',
          member_role: 'owner',
          department_id: 'dept-1',
          department_name: 'Operations',
          status: 'active'
        }
      ];

      const localFixture = TestBed.createComponent(RequestsPageComponent);
      const localComponent = localFixture.componentInstance;
      localComponent.showCreateModal = true;
      localFixture.detectChanges();
      await localFixture.whenStable();
      localFixture.detectChanges();

      expect(localComponent.showCreateModal).toBe(true);
      expect(localComponent.eligibleRequestMembers.length).toBe(0);
      expect(localFixture.nativeElement.textContent).toContain(
        'No eligible employees are available. Complete an employee invitation or repair the employee profile before creating a scan request.'
      );
    } finally {
      pageData.members = originalMembers;
    }
  });
});
