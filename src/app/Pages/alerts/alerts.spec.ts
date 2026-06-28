import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { AlertsPageComponent } from './alerts';

function createObservableRecorder<T>(factory: () => T): ((...args: unknown[]) => T) & { calls: number } {
  const fn = ((..._args: unknown[]) => {
    fn.calls += 1;
    return factory();
  }) as ((...args: unknown[]) => T) & { calls: number };
  fn.calls = 0;
  return fn;
}

describe('AlertsPageComponent', () => {
  let fixture: ComponentFixture<AlertsPageComponent>;
  let component: AlertsPageComponent;
  let workflowsService: any;

  const initialRows = [
    {
      id: 'alert-1',
      date_created: '2026-06-26T10:00:00.000Z',
      status: 'new',
      severity: 'high',
      title: 'Returned alert',
      message: 'Returned alert message',
      department_id: 'dept-1',
      department_name: 'Operations',
      target_member_id: null,
      target_member_status: null,
      target_member_role: null,
      target_member_label: 'Assigned member',
      target_user_id: null,
      target_user_name: null,
      target_user_email: null,
      scan_id: null,
      scan_date_created: null,
      scan_status: null,
      reviewed_by_id: null,
      reviewed_by_name: null,
      reviewed_by_email: null,
      reviewed_at: null,
      action_note: null,
      action_type: null,
      explanation: null,
      recommended_action: null,
      readiness_label: null,
      notification_count: 0
    },
    {
      id: 'alert-2',
      date_created: '2026-06-26T11:00:00.000Z',
      status: 'resolved',
      severity: 'medium',
      title: 'Resolved alert',
      message: 'Resolved alert message',
      department_id: 'dept-1',
      department_name: 'Operations',
      target_member_id: null,
      target_member_status: null,
      target_member_role: null,
      target_member_label: 'Assigned member',
      target_user_id: null,
      target_user_name: null,
      target_user_email: null,
      scan_id: null,
      scan_date_created: null,
      scan_status: null,
      reviewed_by_id: 'user-2',
      reviewed_by_name: 'Nadia Farah',
      reviewed_by_email: 'nadia@example.com',
      reviewed_at: '2026-06-26T11:15:00.000Z',
      action_note: null,
      action_type: 'none',
      explanation: null,
      recommended_action: null,
      readiness_label: null,
      notification_count: 0
    }
  ];

  const refreshedRows = [
    {
      ...initialRows[0],
      status: 'seen'
    },
    initialRows[1]
  ];

  beforeEach(async () => {
    let loadCount = 0;
    workflowsService = {
      getAlertsPageData: createObservableRecorder(() =>
        of({
          rows: loadCount++ === 0 ? initialRows : refreshedRows
        } as any)
      ),
      startAlertReview: createObservableRecorder(() =>
        of({
          alert: {
            id: 'alert-1',
            status: 'seen',
            reviewed_by: null,
            reviewed_at: null,
            action_note: null,
            action_type: null
          }
        } as any)
      ),
      markAlertReviewed: createObservableRecorder(() => of({ alert: { id: 'alert-1', status: 'reviewed', reviewed_by: { id: 'user-1' }, reviewed_at: '2026-06-26T10:05:00.000Z', action_note: null, action_type: null } } as any)),
      resolveAlert: createObservableRecorder(() => of({ alert: { id: 'alert-1', status: 'resolved', reviewed_by: { id: 'user-1' }, reviewed_at: '2026-06-26T10:05:00.000Z', action_note: null, action_type: null } } as any))
    };

    await TestBed.configureTestingModule({
      imports: [AlertsPageComponent, RouterTestingModule.withRoutes([])],
      providers: [
        {
          provide: CompanyContextService,
          useValue: {
            snapshot: () => ({
              context: {
                activeBusinessProfileId: 'profile-1',
                activeBusinessProfileName: 'Wellar',
                activeDepartmentId: null,
                activeDepartmentName: null,
                activeMemberRole: 'owner'
              }
            }),
            ensureActiveContext: () =>
              Promise.resolve({
                activeMembership: { id: 'member-1', department: null },
                activeBusinessProfile: { id: 'profile-1' },
                activeMemberRole: 'owner'
              })
          }
        },
        {
          provide: OperationsWorkflowsService,
          useValue: workflowsService
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AlertsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('does not write when opening the alert dialog', () => {
    expect(component.pageState).toBe('ready');
    component.viewAlert(component.alerts[0]);
    fixture.detectChanges();

    expect(workflowsService.startAlertReview.calls).toBe(0);
    expect(workflowsService.markAlertReviewed.calls).toBe(0);
    expect(workflowsService.resolveAlert.calls).toBe(0);
    expect(component.selectedAlert?.statusLabel).toBe('New');
  });

  it('shows in-review labels and runs only the valid action for the current status', async () => {
    expect((component as any).statusLabel('seen')).toBe('In review');
    expect(component.newAlertsCount).toBe(1);
    expect(component.highCriticalCount).toBe(1);
    expect(component.needsReviewCount).toBe(1);

    component.viewAlert(component.alerts[0]);
    fixture.detectChanges();

    expect(component.selectedAlertWorkflowAction).toBe('start_review');
    expect(component.selectedAlertWorkflowLabel).toBe('Start review');

    await component.runSelectedAlertWorkflowAction();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(workflowsService.startAlertReview.calls).toBe(1);
    expect(component.selectedAlert?.status).toBe('seen');
    expect(component.selectedAlert?.statusLabel).toBe('In review');
    expect(fixture.nativeElement.textContent as string).toContain('In review');
    expect(component.selectedAlertWorkflowAction).toBe('mark_reviewed');
  });

  it('does not expose a workflow action for resolved alerts', () => {
    component.viewAlert(component.alerts[1]);

    expect(component.selectedAlert?.statusLabel).toBe('Resolved');
    expect(component.selectedAlertWorkflowAction).toBeNull();
    expect(component.selectedAlertWorkflowLabel).toBe('');
  });
});
