import { ReportsService } from './reports.service';

describe('ReportsService status mapping', () => {
  const todayIso = new Date().toISOString();

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

  it('uses eligible current members as the denominator and returns 25% for 4 eligible with 1 completion', () => {
    const service = new ReportsService({} as any, {} as any, {} as any);
    const rawData = {
      members: [
        { id: 'member-1', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-1', email: 'alex@example.com' },
        { id: 'member-2', status: 'active', memberRole: 'manager', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-2', email: 'jordan@example.com' },
        { id: 'member-3', status: 'active', memberRole: 'hr', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-3', email: 'sam@example.com' },
        { id: 'member-4', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-4', email: 'taylor@example.com' },
        { id: 'member-dup', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-4', email: 'taylor@example.com' },
        { id: 'member-pending', status: 'pending', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-5', email: 'pending@example.com' },
        { id: 'member-inactive', status: 'inactive', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-6', email: 'inactive@example.com' },
        { id: 'member-unlinked', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: null, email: 'unlinked@example.com' },
        { id: 'member-broken', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-7', email: '-' },
        { id: 'member-owner', status: 'active', memberRole: 'owner', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-8', email: 'owner@example.com' }
      ],
      departments: [{ id: 'dept-1', name: 'Engineering', isActive: true }],
      wellnessScans: [
        { id: 'scan-1', status: 'completed', memberId: 'member-1', userId: 'user-1', departmentId: 'dept-1', completedAt: todayIso, dateCreated: todayIso }
      ],
      scanResults: [],
      scanRequests: [],
      alerts: []
    };

    const result = (service as any).computeExecutiveSummary(rawData, {
      dateRange: 'last7',
      department: '',
      readiness: 'all',
      alertSeverity: 'all'
    });

    expect(result.scanEligibleMembers).toBe(4);
    expect(result.totalCompletedScans).toBe(1);
    expect(result.missingScans).toBe(3);
    expect(result.averageComplianceRate).toBe(25);
  });

  it('treats an unavailable denominator as unavailable instead of fabricating a percentage', () => {
    const service = new ReportsService({} as any, {} as any, {} as any);
    const rawData = {
      members: [
        { id: 'member-pending', status: 'pending', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-1', email: 'pending@example.com' },
        { id: 'member-broken', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-2', email: '-' }
      ],
      departments: [{ id: 'dept-1', name: 'Engineering', isActive: true }],
      wellnessScans: [
        { id: 'scan-1', status: 'completed', memberId: 'member-pending', userId: 'user-1', departmentId: 'dept-1', completedAt: todayIso, dateCreated: todayIso }
      ],
      scanResults: [],
      scanRequests: [],
      alerts: []
    };

    const result = (service as any).computeExecutiveSummary(rawData, {
      dateRange: 'today',
      department: '',
      readiness: 'all',
      alertSeverity: 'all'
    });

    expect(result.scanEligibleMembers).toBe(0);
    expect(result.totalCompletedScans).toBe(0);
    expect(result.missingScans).toBeNull();
    expect(result.averageComplianceRate).toBeNull();
  });

  it('keeps department coverage tied to the eligible current roster only', () => {
    const service = new ReportsService({} as any, {} as any, {} as any);
    const rawData = {
      members: [
        { id: 'member-1', status: 'active', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-1', email: 'alex@example.com' },
        { id: 'member-2', status: 'active', memberRole: 'manager', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-2', email: 'jordan@example.com' },
        { id: 'member-3', status: 'active', memberRole: 'employee', departmentId: 'dept-2', departmentName: 'Support', userId: 'user-3', email: 'casey@example.com' },
        { id: 'member-pending', status: 'pending', memberRole: 'employee', departmentId: 'dept-1', departmentName: 'Engineering', userId: 'user-4', email: 'pending@example.com' }
      ],
      departments: [
        { id: 'dept-1', name: 'Engineering', isActive: true },
        { id: 'dept-2', name: 'Support', isActive: true }
      ],
      wellnessScans: [
        { id: 'scan-1', status: 'completed', memberId: 'member-1', userId: 'user-1', departmentId: 'dept-1', completedAt: todayIso, dateCreated: todayIso }
      ],
      scanResults: [],
      scanRequests: [],
      alerts: []
    };

    const rows = (service as any).computeDepartmentPerformance(rawData, {
      dateRange: 'last7',
      department: '',
      readiness: 'all',
      alertSeverity: 'all'
    });

    const engineering = rows.find((row: { departmentId: string }) => row.departmentId === 'dept-1');
    expect(engineering?.activeMembers).toBe(2);
    expect(engineering?.completedScans).toBe(1);
    expect(engineering?.missingScans).toBe(1);
    expect(engineering?.complianceRate).toBe(50);
  });
});
