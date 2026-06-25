import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { InviteService } from '../../services/invites';
import { OperationalDashboardService } from '../../services/operational-dashboard.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureActiveContext: () => Promise.resolve({
              activeMembership: { id: 'member-1' },
              activeBusinessProfile: { id: 'profile-1' },
              activeMemberRole: 'owner'
            })
          }
        },
        {
          provide: OperationalDashboardService,
          useValue: {
            getDashboardData: () => of({
              generatedAt: new Date().toISOString(),
              company: { activeRole: 'owner', companyName: 'Test Company' },
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
            })
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: { refreshAuthAndWorkspaceContext: () => Promise.resolve([]) }
        },
        {
          provide: InviteService,
          useValue: {
            hasClaimCompleted: () => false,
            getPendingInviteToken: () => null
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
