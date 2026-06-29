import { ReportsPdfExportService } from './reports-pdf-export.service';
import type { ReportsViewData } from './reports.service';

describe('ReportsPdfExportService', () => {
  let service: ReportsPdfExportService;

  const viewState: ReportsViewData = {
    workspaceName: 'Wellar',
    role: 'owner',
    filters: {
      dateRange: 'last30',
      department: '',
      readiness: 'all',
      alertSeverity: 'all'
    },
    executiveSummary: {
      averageComplianceRate: null,
      totalCompletedScans: 1,
      missingScans: null,
      stableOutcomes: 0,
      attentionOutcomes: 0,
      openAlerts: 0,
      overdueRequests: 0,
      scanEligibleMembers: 0
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
      totalRequestsSent: 0,
      completedRequests: 0,
      pendingRequests: 0,
      overdueRequests: 0,
      cancelledRequests: 0,
      completionRate: 0,
      requestTypeBreakdown: [],
      available: true
    },
    overdueRequestDetails: [],
    departmentOptions: [],
    partialWarning: null,
    permissionDenied: false,
    hasAnyData: true,
    sourceCounts: {
      members: 0,
      departments: 0,
      wellnessScans: 0,
      scanResults: 0,
      scanRequests: 0,
      alerts: 0
    }
  };

  class MockPdf {
    internal = {
      pageSize: {
        getWidth: () => 595.28,
        getHeight: () => 841.89
      }
    };

    lastAutoTable?: { finalY?: number };
    constructor(private readonly saveCalls: string[]) {}

    save(filename: string): void {
      this.saveCalls.push(filename);
    }

    setFont(): this {
      return this;
    }

    setFontSize(): this {
      return this;
    }

    setTextColor(): this {
      return this;
    }

    text(): this {
      return this;
    }

    setDrawColor(): this {
      return this;
    }

    setLineWidth(): this {
      return this;
    }

    line(): this {
      return this;
    }

    setPage(): this {
      return this;
    }

    getNumberOfPages(): number {
      return 1;
    }

    splitTextToSize(text: string): string[] {
      return [text];
    }
  }

  beforeEach(() => {
    service = new ReportsPdfExportService();
  });

  it('exports unavailable coverage as Unavailable and names the PDF with the selected date range', async () => {
    const saveCalls: string[] = [];
    const autoTableCalls: Array<Record<string, unknown>> = [];
    const autoTableFn = (doc: MockPdf, options: Record<string, unknown>): void => {
      autoTableCalls.push(options);
      doc.lastAutoTable = { finalY: 100 };
    };

    (service as any).todayDateKey = () => '2026-06-29';
    (service as any).loadPdfDependencies = async () => ({
      JsPdfCtor: class extends MockPdf {
        constructor() {
          super(saveCalls);
        }
      },
      autoTableFn
    });

    await service.exportReportsPdf(
      viewState,
      {
        dateRange: 'last30',
        department: '',
        readiness: 'all',
        alertSeverity: 'all'
      },
      {
        workspaceName: 'Wellar',
        activeRole: 'owner',
        scopeLabel: 'Organization scope'
      }
    );

    expect(saveCalls).toEqual(['wellar-ai-reports-summary-last-30-days-2026-06-29.pdf']);

    const summaryTable = autoTableCalls[0]?.['body'] as Array<Array<string>>;
    expect(summaryTable).toContainEqual(['Average Compliance Rate', 'Unavailable']);
    expect(summaryTable).toContainEqual(['Missing Scans', 'Unavailable']);
  });
});
