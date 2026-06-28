import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { AlertsPageComponent } from './alerts';

function createRecorder(): ((...args: unknown[]) => void) & { calls: number } {
  const fn = ((..._args: unknown[]) => {
    fn.calls += 1;
  }) as ((...args: unknown[]) => void) & { calls: number };
  fn.calls = 0;
  return fn;
}

describe('AlertsPageComponent', () => {
  let fixture: ComponentFixture<AlertsPageComponent>;
  let component: AlertsPageComponent;
  let workflowsService: any;

  beforeEach(async () => {
    workflowsService = {
      getAlertsPageData: () =>
        of({
        rows: [
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
          }
        ]
        } as any),
      updateAlert: createRecorder(),
      markAlertReviewed: createRecorder(),
      fetchAlertDetails: createRecorder()
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

  it('does not render workflow placeholder buttons', () => {
    expect(component.pageState).toBe('ready');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).map(
      (button) => button.textContent?.trim() ?? ''
    );
    expect(buttons).not.toContain('Workflow');
    expect(buttons).not.toContain('Follow up');
  });

  it('shows truthful status labels and summary metrics without invoking write methods when opening details', () => {
    expect((component as any).statusLabel('new')).toBe('New');
    expect(component.newAlertsCount).toBe(1);
    expect(component.highCriticalCount).toBe(1);
    expect(component.needsReviewCount).toBe(1);

    component.viewAlert(component.alerts[0]);
    fixture.detectChanges();

    expect(workflowsService.updateAlert.calls).toBe(0);
    expect(workflowsService.markAlertReviewed.calls).toBe(0);
    expect(workflowsService.fetchAlertDetails.calls).toBe(0);
    expect(component.selectedAlert?.departmentName).toBe('Operations');
    expect(component.selectedAlert?.statusLabel).toBe('New');
    expect(fixture.nativeElement.textContent as string).toContain('New alerts');
    expect(fixture.nativeElement.textContent as string).not.toContain('Open Alerts');
  });
});
