import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { CompanyContextService } from '../../core/context/company-context.service';
import { ComplianceService } from '../../services/compliance.service';
import { CompliancePageComponent } from './compliance';

describe('CompliancePageComponent', () => {
  let fixture: ComponentFixture<CompliancePageComponent>;
  let component: CompliancePageComponent;
  let overviewResponse: any;
  let navigateCalls: Array<{ commands: unknown[]; extras?: unknown }> = [];

  const activeContext = {
    authInitialized: true,
    workspaceInitialized: true,
    isAuthenticated: true,
    activeBusinessProfileId: 'profile-1',
    activeBusinessProfileName: 'Wellar',
    activeBusinessProfile: {
      id: 'profile-1',
      company_name: 'Wellar'
    },
    activeDepartmentId: null,
    activeDepartmentName: null,
    activeMemberRole: 'owner',
    activeMembership: {
      id: 'member-1',
      status: 'active'
    }
  };

  const buildOverview = (departmentRows: any[]) => ({
    workspaceName: 'Wellar',
    role: 'owner',
    filters: {
      dateRange: 'today',
      department: '',
      status: 'all',
      readiness: 'all'
    },
    summary: {
      complianceRate: 67,
      completedScans: 2,
      missingScans: 1,
      openAlerts: 0,
      highAttention: 0,
      overdueRequests: 0,
      scanEligibleMembersToday: 7
    },
    departmentRows,
    exceptionRows: [],
    profileLinkageIssues: [],
    activityRows: [],
    departmentOptions: [],
    partialWarning: null,
    departmentGroupingWarning: null,
    readinessWarning: null,
    departmentMetadataBlocked: false,
    scanResultsAccess: 'available',
    permissionDenied: false,
    hasAnyData: true,
    sourceCounts: {
      members: 7,
      departments: 2,
      scanRequests: 0,
      alerts: 0,
      wellnessScans: 0,
      scanResults: 0
    }
  });

  beforeEach(async () => {
    navigateCalls = [];
    overviewResponse = buildOverview([
      {
        key: 'broken-department',
        departmentId: 'dept-broken',
        departmentName: 'Department unavailable',
        activeMembers: 2,
        scanEligible: 2,
        completedToday: 0,
        missingScans: 1,
        complianceRate: 50,
        openAlerts: 0,
        note: 'Department metadata is blocked or unreadable for this workspace.'
      },
      {
        key: 'unassigned',
        departmentId: null,
        departmentName: 'Unassigned members',
        activeMembers: 5,
        scanEligible: 5,
        completedToday: 2,
        missingScans: 0,
        complianceRate: 100,
        openAlerts: 0,
        note: null
      }
    ]);

    await TestBed.configureTestingModule({
      imports: [CompliancePageComponent, RouterTestingModule.withRoutes([])],
      providers: [
        {
          provide: CompanyContextService,
          useValue: {
            ensureActiveContext: () => Promise.resolve({ ...activeContext }),
            snapshot: () => ({ context: activeContext })
          }
        },
        {
          provide: ComplianceService,
          useValue: {
            loadComplianceOverview: () => Promise.resolve(overviewResponse)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    router.navigate = (commands: unknown[], extras?: unknown) => {
      navigateCalls.push({ commands, extras });
      return Promise.resolve(true);
    };
  });

  it('shows a data-quality warning only for broken department metadata and routes to review affected members', async () => {
    component.overview = overviewResponse;
    component.viewState = 'ready';
    fixture.detectChanges();

    expect(component.departmentDataQualityCount).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Department data quality issue');
    expect(fixture.nativeElement.textContent).toContain('Valid Unassigned members are not counted here.');

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const button = buttons.find((item) => item.textContent?.includes('Review affected members'));
    expect(button).toBeTruthy();
    button?.click();
    await fixture.whenStable();

    expect(navigateCalls[0]?.commands).toEqual(['/app/workforce']);
    expect(fixture.nativeElement.textContent).not.toContain('Follow up');
  });

  it('keeps the warning hidden when only valid unassigned members exist', async () => {
    overviewResponse = buildOverview([
      {
        key: 'unassigned',
        departmentId: null,
        departmentName: 'Unassigned members',
        activeMembers: 4,
        scanEligible: 4,
        completedToday: 2,
        missingScans: 0,
        complianceRate: 100,
        openAlerts: 0,
        note: null
      }
    ]);

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    component.overview = overviewResponse;
    component.viewState = 'ready';
    fixture.detectChanges();

    expect(component.departmentDataQualityCount).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Department data quality issue');
  });
});
