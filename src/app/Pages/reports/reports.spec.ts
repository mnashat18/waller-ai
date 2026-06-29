import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { CompanyContextService } from '../../core/context/company-context.service';
import { ReportsPdfExportService, type ReportsPdfExportContext } from '../../services/reports-pdf-export.service';
import { ReportsService, type ReportsViewData } from '../../services/reports.service';
import { ReportsPageComponent } from './reports';

describe('ReportsPageComponent', () => {
  let fixture: ComponentFixture<ReportsPageComponent>;
  let component: ReportsPageComponent;

  const baseReport: ReportsViewData = {
    workspaceName: 'Wellar',
    role: 'owner',
    filters: {
      dateRange: 'last30',
      department: '',
      readiness: 'all',
      alertSeverity: 'high'
    },
    executiveSummary: {
      averageComplianceRate: 25,
      totalCompletedScans: 1,
      missingScans: 3,
      stableOutcomes: 0,
      attentionOutcomes: 0,
      openAlerts: 0,
      overdueRequests: 0,
      scanEligibleMembers: 4
    },
    readinessTrends: {
      distribution: [],
      daily: [],
      hasData: false
    },
    complianceTrend: [],
    missingScanDetails: {
      foundCount: 0,
      shownCount: 0,
      hiddenCount: 0,
      rows: []
    },
    departmentPerformance: [],
    alertsBreakdown: {
      byStatus: [],
      bySeverity: [],
      byDepartment: [],
      rows: []
    },
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
    overdueRequestDetails: [],
    departmentOptions: [],
    partialWarning: null,
    permissionDenied: false,
    hasAnyData: true,
    sourceCounts: {
      members: 4,
      departments: 0,
      wellnessScans: 1,
      scanResults: 1,
      scanRequests: 1,
      alerts: 0
    }
  };

  const csvExports: ReportsViewData[] = [];
  const pdfExports: Array<[ReportsViewData, ReportsViewData['filters'], ReportsPdfExportContext]> = [];
  let pdfShouldFail = false;

  const reportsServiceStub = {
    loadReports: async () => baseReport,
    exportReportsCsv: (viewState: ReportsViewData) => {
      csvExports.push(viewState);
    }
  };

  const reportsPdfExportServiceStub = {
    exportReportsPdf: async (
      viewState: ReportsViewData,
      filters: ReportsViewData['filters'],
      context: ReportsPdfExportContext
    ) => {
      if (pdfShouldFail) {
        throw new Error('pdf failed');
      }
      pdfExports.push([viewState, filters, context]);
    }
  };

  beforeEach(async () => {
    csvExports.length = 0;
    pdfExports.length = 0;
    pdfShouldFail = false;

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
        { provide: ReportsService, useValue: reportsServiceStub },
        { provide: ReportsPdfExportService, useValue: reportsPdfExportServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('keeps export controls visible and routes CSV/PDF exports through the loaded report snapshot', async () => {
    component.viewState = 'ready';
    component.report = baseReport;
    component.loading = false;
    fixture.detectChanges();
    component.filters.dateRange = 'last7';
    fixture.detectChanges();

    const exportButton = fixture.nativeElement.querySelector('.reports-export-control__toggle') as HTMLButtonElement;
    expect(exportButton).toBeTruthy();

    exportButton.click();
    fixture.detectChanges();

    const csvButton = fixture.nativeElement.querySelector('.reports-export-control__item') as HTMLButtonElement;
    expect(csvButton?.textContent?.trim()).toBe('Export CSV');
    csvButton.click();
    fixture.detectChanges();

    expect(csvExports.length).toBe(1);
    expect(csvExports[0]).toBe(baseReport);
    expect(component.feedback?.text).toBe('CSV export downloaded.');

    exportButton.click();
    fixture.detectChanges();

    const menuItems = Array.from(fixture.nativeElement.querySelectorAll('.reports-export-control__item') as NodeListOf<HTMLButtonElement>);
    const pdfButton = menuItems.find((button) => button.textContent?.includes('Export PDF'));
    expect(pdfButton).toBeTruthy();
    pdfButton!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(pdfExports.length).toBe(1);
    expect(pdfExports[0][0]).toBe(baseReport);
    expect(pdfExports[0][1]).toEqual(baseReport.filters);
    expect(pdfExports[0][2]).toEqual({
      workspaceName: 'Wellar',
      activeRole: 'owner',
      scopeLabel: 'Organization scope'
    });
    expect(component.feedback?.text).toBe('PDF export downloaded.');
  });

  it('hides export controls while loading or when reports are unavailable', () => {
    component.viewState = 'loading';
    component.report = null;
    component.loading = true;
    expect(component.canExport).toBeFalsy();

    component.viewState = 'error';
    component.loading = false;
    expect(component.canExport).toBeFalsy();

    component.viewState = 'noWorkspace';
    expect(component.canExport).toBeFalsy();
  });

  it('shows a safe retryable error when PDF export fails', async () => {
    pdfShouldFail = true;
    component.viewState = 'ready';
    component.report = baseReport;
    component.loading = false;
    fixture.detectChanges();

    const exportButton = fixture.nativeElement.querySelector('.reports-export-control__toggle') as HTMLButtonElement;
    exportButton.click();
    fixture.detectChanges();

    const pdfButton = Array.from(fixture.nativeElement.querySelectorAll('.reports-export-control__item') as NodeListOf<HTMLButtonElement>).find(
      (button) => button.textContent?.includes('Export PDF')
    );
    pdfButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.feedback?.type).toBe('error');
    expect(component.feedback?.text).toBe('Export failed. Try again.');
    expect(fixture.nativeElement.querySelector('.reports-export-control__toggle')).toBeTruthy();
  });

  it('maps canonical alert status labels to the expected report pill classes', () => {
    expect(component.statusPillClass('New')).toContain('danger');
    expect(component.statusPillClass('In review')).toContain('info');
    expect(component.statusPillClass('Reviewed')).toContain('info');
    expect(component.statusPillClass('Resolved')).toContain('success');
    expect(component.statusPillClass('Overridden')).toContain('success');
  });
});
