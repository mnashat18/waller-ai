import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { OperationsWorkflowsService } from '../../services/operations-workflows.service';
import { AlertsPageComponent } from './alerts';

describe('AlertsPageComponent', () => {
  let fixture: ComponentFixture<AlertsPageComponent>;
  let component: AlertsPageComponent;

  beforeEach(async () => {
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
          useValue: {
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
                    department_name: 'Operations'
                  }
                ]
              })
          }
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
});
