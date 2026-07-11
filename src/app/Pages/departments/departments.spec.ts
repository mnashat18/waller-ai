import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import {
  OperationsAdminService,
  type DepartmentMutationInput,
  type DepartmentsPageData
} from '../../services/operations-admin.service';
import { DepartmentsPageComponent } from './departments';

describe('DepartmentsPageComponent manager assignment', () => {
  let fixture: ComponentFixture<DepartmentsPageComponent>;
  let component: DepartmentsPageComponent;
  let pageData: DepartmentsPageData;
  let operationsAdmin: {
    getDepartmentsPageData: ReturnType<typeof vi.fn>;
    createDepartment: ReturnType<typeof vi.fn>;
    updateDepartment: ReturnType<typeof vi.fn>;
    assignDepartmentManager: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    pageData = {
      rows: [
        {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'workspace-1',
          manager_member: 'member-1',
          manager_name: 'Olivia Owner',
          employee_count: 4,
          average_readiness_score: null,
          active_shift_template_count: 0,
          open_alerts_count: 0
        }
      ],
      shift_template_count: 0,
      managerOptions: [
        { id: 'member-1', label: 'Olivia Owner — Owner' },
        { id: 'member-2', label: 'Harper HR — HR' }
      ]
    };

    operationsAdmin = {
      getDepartmentsPageData: vi.fn(() => of(pageData)),
      createDepartment: vi.fn(() => of(undefined)),
      updateDepartment: vi.fn(() => of(undefined)),
      assignDepartmentManager: vi.fn(() => of(undefined))
    };

    await TestBed.configureTestingModule({
      imports: [DepartmentsPageComponent],
      providers: [
        provideRouter([]),
        { provide: OperationsAdminService, useValue: operationsAdmin }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function renderComponent(): void {
    fixture.componentRef.changeDetectorRef.detectChanges();
  }

  it('shows the optional manager selector and default create option', () => {
    component.openCreateModal();
    renderComponent();

    const text = document.body.textContent ?? '';
    const select = document.body.querySelector('select[name="departmentManagerCreate"]') as HTMLSelectElement;

    expect(text).toContain('Department manager (optional)');
    expect(text).toContain('Choose an active Owner, HR, or Manager from this organization.');
    expect(select.options[0].textContent?.trim()).toBe('No manager assigned');
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toContain('Olivia Owner — Owner');
  });

  it('shows the empty eligible-manager message when no options exist', () => {
    component.pageData = {
      ...pageData,
      managerOptions: []
    };
    component.openCreateModal();
    renderComponent();

    expect(document.body.textContent).toContain(
      'No eligible managers are available. Add or promote a manager in Workforce first.'
    );
  });

  it('creates with no manager by default and sends selected membership id when chosen', () => {
    component.openCreateModal();
    component.form.name = 'Operations';
    component.createDepartment();

    expect(operationsAdmin.createDepartment).toHaveBeenCalledWith({
      name: 'Operations',
      is_active: true,
      manager_member: null
    } satisfies DepartmentMutationInput);

    component.openCreateModal();
    component.form.name = 'Safety';
    component.form.manager_member_id = 'member-2';
    component.createDepartment();

    expect(operationsAdmin.createDepartment).toHaveBeenLastCalledWith({
      name: 'Safety',
      is_active: true,
      manager_member: 'member-2'
    } satisfies DepartmentMutationInput);
  });

  it('displays the assigned manager and sends null when clearing it', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Olivia Owner');

    component.openManagerModal(pageData.rows[0]);
    component.form.manager_member_id = '';
    component.assignManager();

    expect(operationsAdmin.assignDepartmentManager).toHaveBeenCalledWith('department-1', null);
  });

  it('updates department name and manager together', () => {
    component.openEditModal(pageData.rows[0]);
    component.form.name = 'Field Operations';
    component.form.manager_member_id = 'member-2';
    component.saveDepartment();

    expect(operationsAdmin.updateDepartment).toHaveBeenCalledWith('department-1', {
      name: 'Field Operations',
      is_active: true,
      manager_member: 'member-2'
    });
  });
});
