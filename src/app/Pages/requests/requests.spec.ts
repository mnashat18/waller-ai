import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
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
  let getRequestModalOptionsCalls: number;

  const baseMembers = [
    {
      member_id: 'member-owner',
      user_id: 'user-owner',
      label: 'demo owner',
      email: 'owner@example.com',
      member_role: 'owner',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-hr',
      user_id: 'user-hr',
      label: 'demo hr',
      email: 'demo-hr@example.com',
      member_role: 'hr',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-manager',
      user_id: 'user-manager',
      label: 'demo manager',
      email: 'demo-manager@example.com',
      member_role: 'manager',
      department_id: 'dept-1',
      department_name: 'Operations',
      status: 'active'
    },
    {
      member_id: 'member-employee',
      user_id: 'user-employee',
      label: 'demo employee',
      email: 'demo-employee@example.com',
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

  const pageData: any = {
    rows: [],
    departments: [],
    members: [],
    requestTypeOptions: ['manual'],
    statusOptions: ['pending'],
    summary: { total: 0, pending: 0, completed: 0, overdue: 0 }
  };

  const requestModalOptions = {
    departments: [{ id: 'dept-1', name: 'Operations' }],
    members: baseMembers
      .filter((member) => ['hr', 'manager', 'employee'].includes(member.member_role) && member.status === 'active' && Boolean(member.email))
      .map((member) => ({ ...member }))
  };

  beforeEach(async () => {
    createScanRequestCalls = [];
    getRequestsPageDataCalls = 0;
    getRequestModalOptionsCalls = 0;
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
          target_member_name: 'demo employee',
          target_member_email: 'demo-employee@example.com',
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
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null
              }
            }
          }
        },
        {
          provide: OperationsWorkflowsService,
          useValue: {
            getRequestsPageData: () => {
              getRequestsPageDataCalls += 1;
              return of(pageData);
            },
            getRequestModalOptions: () => {
              getRequestModalOptionsCalls += 1;
              return of(requestModalOptions);
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

  it('opens the modal and submits scan requests through the protected workflow service', async () => {
    component.openCreateRequestModal();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.showCreateModal).toBe(true);
    expect(getRequestModalOptionsCalls).toBe(1);

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

    component.openCreateRequestModal();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.createRequestForm.targetMemberId = 'member-employee';
    component.createRequestForm.requestType = 'bulk';
    component.createRequestForm.dueAt = '';

    component.submitCreateRequest();

    expect(component.showCreateModal).toBe(true);
    expect(component.createRequestForm.targetMemberId).toBe('member-employee');
    expect(component.createRequestError).toBe('A pending request already exists.');
  });

  it('renders employee, manager, and hr roster targets in New Request and excludes owner', async () => {
    component.openCreateRequestModal();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const optionTexts = Array.from(
      fixture.nativeElement.querySelectorAll('select[name="requestTargetMemberId"] option') as NodeListOf<HTMLOptionElement>
    ).map((option) => option.textContent?.trim() ?? '');

    expect(optionTexts).toContain('demo employee — demo-employee@example.com · Employee');
    expect(optionTexts).toContain('demo manager — demo-manager@example.com · Manager');
    expect(optionTexts).toContain('demo hr — demo-hr@example.com · HR');
    expect(optionTexts.some((text) => text.includes('Owner'))).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('No eligible members');
  });

  it('renders the no-eligible-employees state when the modal has no valid targets', async () => {
    const originalOptions = requestModalOptions.members;
    try {
      requestModalOptions.members = [];

      const localFixture = TestBed.createComponent(RequestsPageComponent);
      const localComponent = localFixture.componentInstance;
      localFixture.detectChanges();
      await localFixture.whenStable();
      localFixture.detectChanges();
      localComponent.openCreateRequestModal();
      localFixture.detectChanges();
      await localFixture.whenStable();
      localFixture.detectChanges();

      expect(localComponent.showCreateModal).toBe(true);
      expect(localComponent.eligibleRequestMembers.length).toBe(0);
      expect(localFixture.nativeElement.textContent).toContain(
        'No eligible members are available. Complete an HR, manager, or employee invitation or repair the member profile before creating a scan request.'
      );
      expect(localFixture.nativeElement.querySelectorAll('.scan-requests-row-actions button').length).toBe(0);
    } finally {
      requestModalOptions.members = originalOptions;
    }
  });

  it('renders the request queue table inside an internal scroller', async () => {
    const originalRows = pageData.rows;
    try {
      pageData.rows = [
        {
          id: 'request-1',
          status: 'pending',
          request_type: 'manual',
          requested_at: '2026-06-25T10:00:00.000Z',
          due_at: '2026-06-26T10:00:00.000Z',
          completed_at: null,
          cancelled_note: null,
          target_member_id: 'member-employee',
          target_member_name: 'demo employee',
          target_member_email: 'demo-employee@example.com',
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
      ];

      const localFixture = TestBed.createComponent(RequestsPageComponent);
      localFixture.detectChanges();
      await localFixture.whenStable();
      localFixture.detectChanges();

      const queueSection = localFixture.nativeElement.querySelector('.scan-requests-queue-section');
      const scroller = localFixture.nativeElement.querySelector('.scan-requests-table-scroller');
      const table = localFixture.nativeElement.querySelector('.scan-requests-table');

      expect(queueSection).toBeTruthy();
      expect(scroller).toBeTruthy();
      expect(scroller?.contains(table)).toBe(true);
    } finally {
      pageData.rows = originalRows;
    }
  });

  it('opens request details in the modal layer and restores body scroll on close', async () => {
    const originalRows = pageData.rows;
    try {
      pageData.rows = [
        {
          id: 'request-1',
          status: 'pending',
          request_type: 'manual',
          requested_at: '2026-06-25T10:00:00.000Z',
          due_at: '2026-06-26T10:00:00.000Z',
          completed_at: null,
          cancelled_note: null,
          target_member_id: 'member-employee',
          target_member_name: 'demo employee',
          target_member_email: 'demo-employee@example.com',
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
      ];

      const localFixture = TestBed.createComponent(RequestsPageComponent);
      const localComponent = localFixture.componentInstance;
      localFixture.detectChanges();
      await localFixture.whenStable();
      localFixture.detectChanges();

      const viewButton = localFixture.nativeElement.querySelector('.scan-requests-row-action--view') as HTMLButtonElement | null;
      viewButton?.click();
      localFixture.detectChanges();

      const modal = localFixture.nativeElement.querySelector('app-viewport-dialog [role="dialog"]');
      const detailPanel = localFixture.nativeElement.querySelector('.scan-requests-dialog-panel');

      expect(modal).toBeTruthy();
      expect(detailPanel).toBeTruthy();
      expect(document.body.style.overflow).toBe('hidden');

      localComponent.closeRequestDetails();

      expect(document.body.style.overflow).toBe('');
      expect(localComponent.selectedRequest).toBeNull();
    } finally {
      document.body.style.overflow = '';
      pageData.rows = originalRows;
    }
  });
});
