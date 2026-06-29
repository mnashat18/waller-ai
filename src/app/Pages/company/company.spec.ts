import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { OrganizationApiError, OrganizationApiService, type OrganizationData, type OrganizationDepartment } from '../../services/organization-api.service';
import { CompanyPageComponent } from './company';

describe('CompanyPageComponent department controls', () => {
  let fixture: ComponentFixture<CompanyPageComponent>;
  let component: CompanyPageComponent;

  const departments: OrganizationDepartment[] = [
    {
      id: 'dept-1',
      name: 'Operations',
      is_active: true,
      business_profile: 'profile-1',
      manager_member_id: 'member-owner',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'dept-2',
      name: 'Support',
      is_active: true,
      business_profile: 'profile-1',
      manager_member_id: null,
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    }
  ];

  const eligibleMembers: OrganizationData['members'] = [
    {
      id: 'member-owner',
      status: 'active',
      member_role: 'owner',
      user_id: 'user-owner',
      user_name: 'Avery Owner',
      user_email: 'avery@example.com',
      business_profile: 'profile-1',
      department_id: 'dept-1',
      department_name: 'Operations',
      joined_at: '2026-06-01T08:00:00.000Z',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'member-hr',
      status: 'active',
      member_role: 'hr',
      user_id: 'user-hr',
      user_name: 'Harper HR',
      user_email: 'harper@example.com',
      business_profile: 'profile-1',
      department_id: 'dept-2',
      department_name: 'Support',
      joined_at: '2026-06-01T08:00:00.000Z',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'member-manager',
      status: 'active',
      member_role: 'manager',
      user_id: 'user-manager',
      user_name: 'Mina Manager',
      user_email: 'mina@example.com',
      business_profile: 'profile-1',
      department_id: null,
      department_name: null,
      joined_at: '2026-06-01T08:00:00.000Z',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'member-employee',
      status: 'active',
      member_role: 'employee',
      user_id: 'user-employee',
      user_name: 'Eli Employee',
      user_email: 'eli@example.com',
      business_profile: 'profile-1',
      department_id: null,
      department_name: null,
      joined_at: '2026-06-01T08:00:00.000Z',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'member-inactive',
      status: 'inactive',
      member_role: 'manager',
      user_id: 'user-inactive',
      user_name: 'Inactive Manager',
      user_email: 'inactive@example.com',
      business_profile: 'profile-1',
      department_id: null,
      department_name: null,
      joined_at: '2026-06-01T08:00:00.000Z',
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    }
  ];

  const baseData: OrganizationData = {
    profile: {
      id: 'profile-1',
      company_name: 'Wellar',
      contact_name: 'Ops Lead',
      phone: null,
      industry: null,
      team_size: 20,
      country: 'Egypt',
      city: 'Cairo',
      website: null,
      timezone: 'Africa/Cairo',
      default_language: 'en',
      is_active: true,
      plan_code: null,
      billing_status: null,
      date_created: '2026-06-01T08:00:00.000Z',
      date_updated: '2026-06-01T08:00:00.000Z'
    },
    departments,
    members: eligibleMembers,
    invites: [],
    permissions: {
      canEditProfile: true,
      canManageDepartments: true,
      canViewMembers: true,
      canViewInvites: true,
      canUseComingSoonControls: true
    }
  };

  let organizationData: OrganizationData = baseData;
  const createCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<[string, Record<string, unknown>]> = [];
  const deactivateCalls: string[] = [];
  let deactivateError: unknown | null = null;

  const organizationApiStub = {
    getOrganization: () => of(organizationData),
    updateProfile: () => of(baseData.profile),
    createDepartment: (input: Record<string, unknown>) => {
      createCalls.push(input);
      return of({
        id: 'dept-created',
        name: String(input['name'] ?? ''),
        is_active: true,
        business_profile: 'profile-1',
        manager_member_id: input['manager_member_id'] ?? null,
        date_created: '2026-06-01T08:00:00.000Z',
        date_updated: '2026-06-01T08:00:00.000Z'
      });
    },
    updateDepartment: (departmentId: string, input: Record<string, unknown>) => {
      updateCalls.push([departmentId, input]);
      return of({
        id: departmentId,
        name: String(input['name'] ?? 'Operations'),
        is_active: true,
        business_profile: 'profile-1',
        manager_member_id: input['manager_member_id'] ?? null,
        date_created: '2026-06-01T08:00:00.000Z',
        date_updated: '2026-06-01T08:00:00.000Z'
      });
    },
    deactivateDepartment: (departmentId: string) => {
      deactivateCalls.push(departmentId);
      if (deactivateError) {
        return throwError(() => deactivateError);
      }
      return of({
        id: departmentId,
        name: 'Operations',
        is_active: false,
        business_profile: 'profile-1',
        manager_member_id: 'member-owner',
        date_created: '2026-06-01T08:00:00.000Z',
        date_updated: '2026-06-02T08:00:00.000Z'
      });
    }
  };

  beforeEach(async () => {
    organizationData = baseData;
    createCalls.length = 0;
    updateCalls.length = 0;
    deactivateCalls.length = 0;
    deactivateError = null;

    await TestBed.configureTestingModule({
      imports: [CompanyPageComponent, RouterTestingModule.withRoutes([])],
      providers: [{ provide: OrganizationApiService, useValue: organizationApiStub }]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyPageComponent);
    component = fixture.componentInstance;
    component.activeTab = 'departments';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function openDepartmentForm(buttonText: string): void {
    const button = Array.from(document.body.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === buttonText
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
  }

  function departmentFormSelect(): HTMLSelectElement {
    return document.body.querySelector('select[name="department_manager"]') as HTMLSelectElement;
  }

  function submitDepartmentForm(): void {
    component.saveDepartmentForm();
  }

  function departmentRow(name: string): HTMLTableRowElement {
    const row = Array.from(document.body.querySelectorAll('tbody tr')).find((item) =>
      item.textContent?.includes(name)
    ) as HTMLTableRowElement | undefined;
    expect(row).toBeTruthy();
    return row!;
  }

  function departmentRowButton(rowName: string, buttonText: string): HTMLButtonElement {
    const button = Array.from(departmentRow(rowName).querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === buttonText
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    return button!;
  }

  it('renders the optional manager selector and eligible manager options for department creation', () => {
    openDepartmentForm('New department');
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    const select = departmentFormSelect();
    expect(text).toContain('Department manager (optional)');
    expect(text).toContain('Choose an active Owner, HR, or Manager from this organization.');
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'No manager assigned',
      'Avery Owner — Owner',
      'Harper HR — HR',
      'Mina Manager — Manager'
    ]);
  });

  it('shows the empty-manager message when no eligible candidates exist', () => {
    const employeeMember = eligibleMembers.find((member) => member.id === 'member-employee');
    const inactiveMember = eligibleMembers.find((member) => member.id === 'member-inactive');
    expect(employeeMember).toBeTruthy();
    expect(inactiveMember).toBeTruthy();

    organizationData = {
      ...baseData,
      members: [
        {
          ...employeeMember!,
          id: 'employee-only',
          member_role: 'employee'
        },
        {
          ...inactiveMember!,
          id: 'inactive-only',
          status: 'inactive'
        }
      ]
    };

    component.refresh();
    fixture.detectChanges();
    return fixture.whenStable().then(() => {
      fixture.detectChanges();
      openDepartmentForm('New department');
      fixture.detectChanges();
      expect(document.body.textContent).toContain(
        'No eligible managers are available. Add or promote a manager in Workforce first.'
      );
    });
  });

  it('submits the create payload with manager_member_id null by default and the selected membership id when chosen', async () => {
    openDepartmentForm('New department');
    component.departmentForm = { name: 'Research', manager_member_id: '' };

    submitDepartmentForm();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createCalls[0]).toEqual({
      name: 'Research',
      manager_member_id: null
    });

    openDepartmentForm('New department');
    component.departmentForm = { name: 'Delivery', manager_member_id: 'member-manager' };

    submitDepartmentForm();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createCalls[1]).toEqual({
      name: 'Delivery',
      manager_member_id: 'member-manager'
    });
  });

  it('displays the assigned manager in the department list and allows clearing it during edit', async () => {
    expect(departmentRow('Operations').textContent).toContain('Avery Owner');
    expect(departmentRow('Support').textContent).toContain('Unassigned');

    openDepartmentForm('Edit');
    component.departmentForm = { name: 'Operations', manager_member_id: '' };
    submitDepartmentForm();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateCalls[0]).toEqual([
      'dept-1',
      {
        name: 'Operations',
        manager_member_id: null
      }
    ]);
    expect(departmentRow('Operations').textContent).toContain('Unassigned');
  });

  it('deactivates through the protected confirmation flow and refreshes the row state', async () => {
    departmentRowButton('Operations', 'Deactivate').click();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Deactivate the department after reassigning its active members.');

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Deactivate department'
    ) as HTMLButtonElement;
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(deactivateCalls).toEqual(['dept-1']);
    expect(component.departmentActionBusy).toBeFalsy();
    expect(component.pendingDeactivateDepartment).toBeNull();
    expect(component.pageData?.departments.find((department) => department.id === 'dept-1')?.is_active).toBeFalsy();
  });

  it('shows the safe active-members message when deactivation is blocked', async () => {
    deactivateError = new OrganizationApiError(
      'conflict',
      409,
      'Deactivate the department after reassigning its active members.'
    );

    departmentRowButton('Operations', 'Deactivate').click();
    fixture.detectChanges();
    Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Deactivate department')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.departmentActionBusy).toBeFalsy();
    expect(component.feedback?.text).toBe('Deactivate the department after reassigning its active members.');
  });

  it('clears the busy state and hides raw backend text on unexpected deactivation failures', async () => {
    deactivateError = new Error('SQL timeout while writing activity log');

    departmentRowButton('Operations', 'Deactivate').click();
    fixture.detectChanges();
    Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Deactivate department')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.departmentActionBusy).toBeFalsy();
    expect(component.feedback?.text).not.toContain('SQL timeout');
  });
});
