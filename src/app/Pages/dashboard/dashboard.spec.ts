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
  let refreshContextSpy: { (): Promise<never[]>; calls: { count(): number } };

  beforeEach(async () => {
    const calls: unknown[] = [];
    refreshContextSpy = Object.assign(
      () => {
        calls.push(true);
        return Promise.resolve([] as never[]);
      },
      {
        calls: {
          count: () => calls.length
        }
      }
    );

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureVerifiedWorkspaceContext: () => Promise.resolve({
              activeMembership: { id: 'member-1', status: 'active', member_role: 'owner' },
              activeBusinessProfile: { id: 'profile-1', company_name: 'Test Company', is_active: true },
              activeDepartment: null,
              activeMemberRole: 'owner'
            }),
            snapshot: () => ({
              context: {
                activeBusinessProfileId: 'profile-1',
                activeBusinessProfileName: 'Test Company',
                activeDepartmentId: null,
                activeDepartmentName: null,
                activeMemberRole: 'owner'
              }
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
          useValue: { refreshAuthAndWorkspaceContext: refreshContextSpy }
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
    expect(refreshContextSpy.calls.count()).toBe(0);
  });

  it('exposes actionable onboarding steps', () => {
    expect(component.onboardingSteps.find((step) => step.label === 'Complete company profile')?.route).toBe('/app/company');
    expect(component.onboardingSteps.find((step) => step.label === 'Add departments')?.queryParams).toEqual({ tab: 'departments' });
    expect(component.onboardingSteps.find((step) => step.label === 'Invite employees')?.queryParams).toEqual({ invite: '1' });
    expect(component.onboardingSteps.find((step) => step.label === 'Create your first scan request')?.state).toEqual({ openCreateRequest: true });
  });

  it('keeps verified workspace members on the dashboard without falling back to create-company state', async () => {
    expect(component.state).toBe('ready');
    expect(component.errorMessage).toBe('');
    expect(component.activeMemberRole).toBe('owner');
  });
});
