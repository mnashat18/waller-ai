import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { InviteService } from '../../services/invites';
import { OperationalDashboardService } from '../../services/operational-dashboard.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { Dashboard } from './dashboard';

const makeDashboardView = (companyName: string): any => ({
  generatedAt: new Date().toISOString(),
  company: { activeRole: 'owner', companyName },
  currentMember: { departmentName: null },
  scope: { departmentId: null, departmentName: null },
  kpis: [],
  attention: [],
  needsAttention: { items: [], error: null },
  readiness: [],
  readinessDistribution: { items: [], error: null },
  departments: [],
  requests: [],
  alerts: [],
  recentAlerts: { items: [], error: null },
  scanActivity: [],
  complianceByDepartment: { items: [], error: null },
  recentScans: { items: [], error: null },
  pendingRequests: { items: [], error: null }
});

type DashboardContextSnapshot = {
  activeBusinessProfileId: string;
  activeBusinessProfileName: string;
  activeDepartmentId: string | null;
  activeDepartmentName: string | null;
  activeMemberRole: string;
  userId: string;
};

describe('Dashboard organization switching', () => {
  let fixture: ComponentFixture<Dashboard>;
  let contextSubject: BehaviorSubject<DashboardContextSnapshot>;
  let resolveStaleRequest: (() => void) | null;

  beforeEach(async () => {
    contextSubject = new BehaviorSubject<DashboardContextSnapshot>({
      activeBusinessProfileId: 'profile-a',
      activeBusinessProfileName: 'Company A',
      activeDepartmentId: null,
      activeDepartmentName: null,
      activeMemberRole: 'owner',
      userId: 'user-1'
    });

    let requestCount = 0;
    resolveStaleRequest = null;

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            context$: contextSubject.asObservable(),
            ensureVerifiedWorkspaceContext: () =>
              Promise.resolve({
                activeMembership: {
                  id: contextSubject.value.activeBusinessProfileId === 'profile-a' ? 'membership-a' : 'membership-b',
                  status: 'active',
                  member_role: contextSubject.value.activeMemberRole
                },
                activeBusinessProfile: {
                  id: contextSubject.value.activeBusinessProfileId,
                  company_name: contextSubject.value.activeBusinessProfileName,
                  is_active: true
                },
                activeDepartment: null,
                activeMemberRole: contextSubject.value.activeMemberRole
              }),
            snapshot: () => ({
              context: {
                activeBusinessProfileId: contextSubject.value.activeBusinessProfileId,
                activeBusinessProfileName: contextSubject.value.activeBusinessProfileName,
                activeDepartmentId: contextSubject.value.activeDepartmentId,
                activeDepartmentName: contextSubject.value.activeDepartmentName,
                activeMemberRole: contextSubject.value.activeMemberRole,
                userId: contextSubject.value.userId
              }
            })
          }
        },
        {
          provide: OperationalDashboardService,
          useValue: {
            getDashboardData: vi.fn((businessProfileId: string) => {
              requestCount += 1;
              if (requestCount === 1) {
                return new Observable<any>((observer) => {
                  resolveStaleRequest = () => {
                    observer.next(makeDashboardView('Company A'));
                    observer.complete();
                  };
                });
              }

              return of(makeDashboardView(businessProfileId === 'profile-b' ? 'Company B' : 'Company A'));
            })
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: { refreshAuthAndWorkspaceContext: vi.fn(() => Promise.resolve([])) }
        },
        {
          provide: InviteService,
          useValue: {
            hasClaimCompleted: () => false,
            getPendingInviteToken: () => null
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('ignores stale Company A dashboard data after switching to Company B', async () => {
    for (let attempt = 0; attempt < 5 && !fixture.componentInstance.activeBusinessProfile; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }

    expect(fixture.componentInstance.activeBusinessProfile?.company_name).toBe('Company A');

    contextSubject.next({
      activeBusinessProfileId: 'profile-b',
      activeBusinessProfileName: 'Company B',
      activeDepartmentId: null,
      activeDepartmentName: null,
      activeMemberRole: 'hr',
      userId: 'user-1'
    });
    fixture.detectChanges();
    for (let attempt = 0; attempt < 5 && fixture.componentInstance.view?.company.companyName !== 'Company B'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
    expect(fixture.componentInstance.view?.company.companyName).toBe('Company B');

    resolveStaleRequest?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.view?.company.companyName).toBe('Company B');
    expect(fixture.componentInstance.activeBusinessProfile?.company_name).toBe('Company B');
    expect(fixture.componentInstance.roleDisplayLabel).toBe('HR');
  });
});
