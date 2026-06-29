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

  function setReadyReport(report: ReportsViewData = baseReport): void {
    component.viewState = 'ready';
    component.report = report;
    component.loading = false;
    fixture.detectChanges();
  }

  function exportButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.reports-export-control__toggle') as HTMLButtonElement;
  }

  function exportMenuItems(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.reports-export-control__item') as NodeListOf<HTMLButtonElement>
    );
  }

  function activateExportWithNativeKeyboard(key: 'Enter' | ' '): void {
    const button = exportButton();
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    button.click();
    fixture.detectChanges();
  }

  it('opens an accessible export menu and routes CSV/PDF exports through the loaded report snapshot', async () => {
    setReadyReport();
    component.filters.dateRange = 'last7';
    fixture.detectChanges();

    const button = exportButton();
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-controls')).toBe('reports-export-menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect((fixture.nativeElement.querySelector('app-filter-bar-shell > div') as HTMLElement).style.overflow).toBe('visible');
    const menu = fixture.nativeElement.querySelector('#reports-export-menu') as HTMLElement;
    expect(menu?.getAttribute('role')).toBe('menu');
    const menuItems = exportMenuItems();
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual(['Download CSV', 'Download PDF']);

    const csvButton = menuItems[0];
    csvButton.click();
    fixture.detectChanges();

    expect(csvExports.length).toBe(1);
    expect(csvExports[0]).toBe(baseReport);
    expect(component.feedback?.text).toBe('CSV export downloaded.');
    expect(component.exportMenuOpen).toBe(false);

    button.click();
    fixture.detectChanges();

    const pdfButton = exportMenuItems().find((item) => item.textContent?.includes('Download PDF'));
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
    expect(component.exportMenuOpen).toBe(false);
  });

  it('disables export with a clear helper when the loaded report has no exportable data', async () => {
    const emptyReport: ReportsViewData = {
      ...baseReport,
      hasAnyData: false,
      sourceCounts: {
        members: 0,
        departments: 0,
        wellnessScans: 0,
        scanResults: 0,
        scanRequests: 0,
        alerts: 0
      }
    };

    setReadyReport(emptyReport);

    const button = exportButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Export is available when report data is available.');
    expect(fixture.nativeElement.querySelector('.reports-export-control__helper')?.textContent).toContain(
      'Export is available when report data is available.'
    );

    button.click();
    fixture.detectChanges();
    await component.exportCsv();
    await component.exportPdf();

    expect(component.exportMenuOpen).toBe(false);
    expect(csvExports.length).toBe(0);
    expect(pdfExports.length).toBe(0);
  });

  it('uses native Enter activation without double-toggling the export menu', () => {
    setReadyReport();

    activateExportWithNativeKeyboard('Enter');
    expect(component.exportMenuOpen).toBe(true);
    expect(fixture.nativeElement.querySelector('#reports-export-menu')).toBeTruthy();

    activateExportWithNativeKeyboard('Enter');
    expect(component.exportMenuOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('#reports-export-menu')).toBeFalsy();
  });

  it('uses native Space activation without double-toggling the export menu', () => {
    setReadyReport();

    activateExportWithNativeKeyboard(' ');
    expect(component.exportMenuOpen).toBe(true);
    expect(fixture.nativeElement.querySelector('#reports-export-menu')).toBeTruthy();

    activateExportWithNativeKeyboard(' ');
    expect(component.exportMenuOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('#reports-export-menu')).toBeFalsy();
  });

  it('keeps arrow navigation in the export menu and restores focus to Export on Escape', async () => {
    setReadyReport();

    exportButton().click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [csvButton, pdfButton] = exportMenuItems();
    expect(document.activeElement).toBe(csvButton);

    csvButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(pdfButton);

    pdfButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(csvButton);

    csvButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.exportMenuOpen).toBe(false);
    expect(document.activeElement).toBe(exportButton());
  });

  it('does not allow export while loading or when reports are unavailable', () => {
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

  it('closes the export menu on Escape and outside click', () => {
    setReadyReport();

    exportButton().click();
    fixture.detectChanges();
    expect(component.exportMenuOpen).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.exportMenuOpen).toBe(false);

    exportButton().click();
    fixture.detectChanges();
    expect(component.exportMenuOpen).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(component.exportMenuOpen).toBe(false);
  });

  it('keeps existing filter behavior while closing the export menu', async () => {
    setReadyReport();
    component.exportMenuOpen = true;
    component.filters = {
      ...component.filters,
      dateRange: 'today'
    };

    component.applyFilters();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.filters.dateRange).toBe('today');
    expect(component.exportMenuOpen).toBe(false);
  });

  it('shows a safe retryable error when PDF export fails', async () => {
    pdfShouldFail = true;
    component.viewState = 'ready';
    component.report = baseReport;
    component.loading = false;
    fixture.detectChanges();

    exportButton().click();
    fixture.detectChanges();

    const pdfButton = exportMenuItems().find((button) => button.textContent?.includes('Download PDF'));
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
