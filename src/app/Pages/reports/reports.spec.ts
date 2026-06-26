import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { CompanyContextService } from '../../core/context/company-context.service';
import { ReportsService } from '../../services/reports.service';
import { ReportsPageComponent } from './reports';

describe('ReportsPageComponent', () => {
  let fixture: ComponentFixture<ReportsPageComponent>;
  let component: ReportsPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent, RouterTestingModule.withRoutes([])],
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
          provide: ReportsService,
          useValue: {
            loadReports: () =>
              Promise.resolve({
                workspaceName: 'Wellar',
                departmentOptions: [],
                executiveSummary: {
                  averageComplianceRate: 100,
                  totalCompletedScans: 1,
                  missingScans: 0,
                  openAlerts: 0,
                  overdueRequests: 0
                },
                complianceTrend: [],
                departmentPerformance: [],
                scanRequestPerformance: {
                  available: true,
                  totalRequestsSent: 1,
                  completedRequests: 1,
                  pendingRequests: 0,
                  overdueRequests: 0,
                  cancelledRequests: 0,
                  completionRate: 100,
                  requestTypeBreakdown: []
                },
                alertsBreakdown: {
                  byStatus: [],
                  bySeverity: [],
                  rows: []
                },
                partialWarning: null,
                hasAnyData: true
              })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('does not render export placeholder buttons', () => {
    expect(component.viewState).toBe('ready');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).map(
      (button) => button.textContent?.trim() ?? ''
    );
    expect(buttons).not.toContain('Export');
  });
});
