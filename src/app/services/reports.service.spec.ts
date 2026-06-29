import { ReportsService } from './reports.service';

describe('ReportsService status mapping', () => {
  it('maps canonical alert statuses consistently in alert breakdowns', () => {
    const service = new ReportsService({} as any, {} as any, {} as any);
    const today = new Date().toISOString();

    const result = service.computeAlertsBreakdown(
      {
        members: [],
        departments: [{ id: 'dept-1', name: 'Operations', isActive: true }],
        wellnessScans: [],
        scanResults: [],
        scanRequests: [],
        alerts: [
          { id: 'alert-1', departmentId: 'dept-1', targetMemberId: null, severity: 'high', status: 'new', title: 'New alert', dateCreated: today, reviewedAt: null, actionType: null },
          { id: 'alert-2', departmentId: 'dept-1', targetMemberId: null, severity: 'medium', status: 'seen', title: 'In review alert', dateCreated: today, reviewedAt: null, actionType: null },
          { id: 'alert-3', departmentId: 'dept-1', targetMemberId: null, severity: 'medium', status: 'reviewed', title: 'Reviewed alert', dateCreated: today, reviewedAt: today, actionType: null },
          { id: 'alert-4', departmentId: 'dept-1', targetMemberId: null, severity: 'medium', status: 'resolved', title: 'Resolved alert', dateCreated: today, reviewedAt: today, actionType: null },
          { id: 'alert-5', departmentId: 'dept-1', targetMemberId: null, severity: 'medium', status: 'overridden', title: 'Overridden alert', dateCreated: today, reviewedAt: today, actionType: null },
          { id: 'alert-6', departmentId: 'dept-1', targetMemberId: null, severity: 'medium', status: 'open', title: 'Legacy open alert', dateCreated: today, reviewedAt: null, actionType: null }
        ]
      },
      {
        dateRange: 'today',
        department: '',
        readiness: 'all',
        alertSeverity: 'all'
      }
    );

    expect(result.byStatus.map((item) => item.label)).toEqual(
      expect.arrayContaining(['New', 'In review', 'Reviewed', 'Resolved', 'Overridden', 'Open'])
    );
    expect(result.rows.map((item) => item.status)).toEqual(
      expect.arrayContaining(['New', 'In review', 'Reviewed', 'Resolved', 'Overridden', 'Open'])
    );
  });
});
