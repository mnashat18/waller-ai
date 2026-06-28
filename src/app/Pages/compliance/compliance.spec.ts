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

  const settle = async (): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

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
    component.ngOnInit = () => {};
    component.overview = overviewResponse;
    component.viewState = 'ready';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.departmentDataQualityCount).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Department data quality issue');
  });

  it('renders compliance-unavailable when dataUnavailable is true while hasAnyData is true', async () => {
    overviewResponse = {
      ...buildOverview([]),
      dataUnavailable: true,
      hasAnyData: true,
      scanResultsAccess: 'permission_blocked'
    };

    const complianceService = TestBed.inject(ComplianceService);
    complianceService.loadComplianceOverview = () => Promise.resolve(overviewResponse);

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    await settle();
    fixture.detectChanges();

    const unavailableSection = fixture.nativeElement.querySelector('[data-testid="compliance-unavailable"]');
    expect(unavailableSection).toBeTruthy();
    expect(unavailableSection.textContent).toContain('Compliance data unavailable');
    expect(unavailableSection.textContent).toContain('We could not load the authorized compliance data for this workspace.');
  });

  it('in unavailable state, hides KPI cards, filters, distributions, coverage section, exception table, and exception detail', async () => {
    overviewResponse = {
      ...buildOverview([]),
      dataUnavailable: true,
      hasAnyData: true,
      scanResultsAccess: 'permission_blocked'
    };

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    component.ngOnInit = () => {};
    component.overview = overviewResponse;
    component.viewState = 'unavailable';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-kpi-card')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-filter-bar-shell')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('table.compliance-table')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('app-viewport-dialog')).toBeFalsy();
  });

  it('retry button calls refresh', async () => {
    let loadCallCount = 0;
    overviewResponse = {
      ...buildOverview([]),
      dataUnavailable: true,
      hasAnyData: true,
      scanResultsAccess: 'permission_blocked',
      coverageProven: false
    } as any;
    const complianceService = TestBed.inject(ComplianceService);
    complianceService.loadComplianceOverview = () => {
      loadCallCount++;
      return Promise.resolve(overviewResponse);
    };

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    await settle();
    fixture.detectChanges();

    let refreshCalls = 0;
    const originalRefresh = component.refresh.bind(component);
    component.refresh = () => {
      refreshCalls++;
      originalRefresh();
    };
    const unavailableSection = fixture.nativeElement.querySelector('[data-testid="compliance-unavailable"]') as HTMLElement | null;
    expect(unavailableSection).toBeTruthy();

    const retryButton = Array.from(unavailableSection?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Retry'
    ) as HTMLButtonElement | undefined;
    expect(retryButton).toBeTruthy();

    retryButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(refreshCalls).toBe(1);
    expect(loadCallCount).toBeGreaterThan(0);
    expect(component.loading).toBe(false);
  });

  it('coverage KPI is absent when coverageProven is false', async () => {
    overviewResponse = {
      ...buildOverview([]),
      coverageProven: false
    };

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    component.ngOnInit = () => {};
    component.overview = overviewResponse;
    component.viewState = 'ready';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const kpiCards = fixture.nativeElement.querySelectorAll('app-kpi-card');
    const coverageCard = Array.from(kpiCards).find((card: any) =>
      card.textContent?.includes('Coverage') || card.textContent?.includes('Scan Eligible')
    );
    expect(coverageCard).toBeFalsy();
  });

  it('suggested action appears in detail dialog only when suggestedAction has a real value', async () => {
    const exceptionWithAction = {
      memberId: 'member-1',
      memberName: 'Alex Parker',
      memberEmail: 'alex@example.com',
      memberRole: 'employee',
      membershipStatus: 'active',
      joinedAt: '2026-06-01T10:00:00.000Z',
      userId: 'user-1',
      departmentId: 'dept-1',
      departmentName: 'Engineering',
      expectedCheck: 'Daily',
      todayScan: 'Missing' as const,
      readiness: 'High Risk' as const,
      alertStatus: 'None' as const,
      lastScanAt: '2026-06-25T14:00:00.000Z',
      lastScanLabel: '3 days ago',
      openAlertId: null,
      openRequestId: null,
      openRequestStatus: null,
      requestDueAt: null,
      requestRequestedAt: null,
      linkedInviteEmail: null,
      invitedBy: null,
      reason: null,
      suggestedAction: 'Schedule a wellness check-in and review workload'
    };

    const exceptionWithoutAction = {
      ...exceptionWithAction,
      memberId: 'member-2',
      memberName: 'Jordan Smith',
      suggestedAction: null
    };

    overviewResponse = {
      ...buildOverview([]),
      exceptionRows: [exceptionWithAction, exceptionWithoutAction]
    };

    const complianceService = TestBed.inject(ComplianceService);
    complianceService.loadComplianceOverview = () => Promise.resolve(overviewResponse);

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    component.ngOnInit = () => {};
    component.overview = overviewResponse;
    component.viewState = 'ready';
    component.selectedException = exceptionWithAction;
    fixture.detectChanges();
    await settle();
    await settle();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Schedule a wellness check-in and review workload');
    const suggestedAction = document.body.querySelector('[data-testid="suggested-action"]') as HTMLElement | null;
    expect(suggestedAction).toBeTruthy();
    expect(suggestedAction?.querySelector('span')?.textContent?.trim()).toBe('Suggested action');
    expect(suggestedAction?.querySelector('strong')?.textContent?.trim()).toBe('Schedule a wellness check-in and review workload');

    fixture.destroy();

    fixture = TestBed.createComponent(CompliancePageComponent);
    component = fixture.componentInstance;
    component.ngOnInit = () => {};
    component.overview = overviewResponse;
    component.viewState = 'ready';
    component.selectedException = exceptionWithoutAction;
    fixture.detectChanges();
    await settle();
    await settle();
    fixture.detectChanges();

    expect(document.body.querySelector('[data-testid="suggested-action"]')).toBeFalsy();
  });
});
