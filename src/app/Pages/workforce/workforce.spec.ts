import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { OperationsAdminService } from '../../services/operations-admin.service';
import { WorkforcePageComponent } from './workforce';

describe('WorkforcePageComponent', () => {
  let component: WorkforcePageComponent;
  let fixture: ComponentFixture<WorkforcePageComponent>;
  let rosterResponse$: any;

  beforeEach(async () => {
    rosterResponse$ = of({
      summary: {
        activeMembers: 1,
        scanEligible: 1,
        scanRequested: 0,
        scannedToday: 1,
        missingScans: 0,
        pendingInvites: 0,
        ownerCount: 1,
        hrCount: 0,
        managerCount: 0,
        employeeCount: 0,
        needsReviewCount: 0
      },
      rows: [],
      departments: [],
      scanRequestRows: [],
      relationWarning: null
    });

    await TestBed.configureTestingModule({
      imports: [WorkforcePageComponent],
      providers: [
        {
          provide: CompanyContextService,
          useValue: {
            snapshot: () => ({
              context: {
                authInitialized: true,
                workspaceInitialized: true,
                isAuthenticated: true,
                activeBusinessProfileId: 'profile-1',
                activeBusinessProfileName: 'Wellar',
                activeDepartmentId: null,
                activeDepartmentName: null,
                activeMemberRole: 'owner'
              }
            }),
            ensureLoaded: () =>
              of({
                context: {
                  authInitialized: true,
                  workspaceInitialized: true,
                  isAuthenticated: true,
                  activeBusinessProfileId: 'profile-1',
                  activeBusinessProfileName: 'Wellar',
                  activeDepartmentId: null,
                  activeDepartmentName: null,
                  activeMemberRole: 'owner'
              }
            })
          }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null
              }
            }
          }
        },
        {
          provide: OperationsAdminService,
          useValue: {
            getWorkforceRosterData: () => rosterResponse$
          }
        },
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: () => 'token'
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkforcePageComponent);
    component = fixture.componentInstance;
  });

  it('resolves to the workforce state instead of staying on loading', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.viewState).toBe('empty');
    expect(fixture.nativeElement.textContent).not.toContain('Loading organization...');
  });

  it('exits loading and shows a retryable error when the roster request fails', async () => {
    rosterResponse$ = throwError(() => ({ status: 503, error: { message: 'Unavailable' } }));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.viewState).toBe('error');
    expect(component.errorMessage).toBeTruthy();
  });

  it('keeps the workforce shell horizontally contained while the roster can scroll locally', async () => {
    rosterResponse$ = of({
      summary: {
        activeMembers: 1,
        scanEligible: 1,
        scanRequested: 0,
        scannedToday: 1,
        missingScans: 0,
        pendingInvites: 0,
        ownerCount: 1,
        hrCount: 0,
        managerCount: 0,
        employeeCount: 0,
        needsReviewCount: 0
      },
      rows: [
        {
          type: 'member',
          key: 'member-1',
          member_id: 'member-1',
          state: 'verified_member',
          member_role: 'employee',
          status: 'active',
          identity: {
            displayName: 'Alex Parker',
            email: 'alex@example.com'
          },
          department_name: 'Operations',
          scan_status: 'completed',
          readiness_label: 'Ready',
          last_scan_at: '2026-06-25T10:00:00.000Z'
        }
      ],
      departments: [{ id: 'dept-1', name: 'Operations' }],
      scanRequestRows: [],
      relationWarning: null
    });

    component.refresh();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.workforce-page') as HTMLElement;
    const table = fixture.nativeElement.querySelector('.workforce-table') as HTMLElement | null;
    const scroller = fixture.nativeElement.querySelector('.app-table-shell__scroller') as HTMLElement | null;

    expect(getComputedStyle(host).overflowX).toBe('clip');
    expect(table).toBeTruthy();
    expect(table?.className).toContain('w-full');
    expect(scroller).toBeTruthy();
  });

  it('allows verified hr, manager, and employee members to be scan-request targets while excluding owners', () => {
    expect(
      component.canSendScanRequest({
        type: 'member',
        key: 'member-hr',
        member_id: 'member-hr',
        member_role: 'hr',
        status: 'active',
        email: 'hr@example.com',
        state: 'verified_member'
      } as any)
    ).toBe(true);

    expect(
      component.canSendScanRequest({
        type: 'member',
        key: 'member-manager',
        member_id: 'member-manager',
        member_role: 'manager',
        status: 'active',
        email: 'manager@example.com',
        state: 'verified_member'
      } as any)
    ).toBe(true);

    expect(
      component.canSendScanRequest({
        type: 'member',
        key: 'member-employee',
        member_id: 'member-employee',
        member_role: 'employee',
        status: 'active',
        email: 'employee@example.com',
        state: 'verified_member'
      } as any)
    ).toBe(true);

    expect(
      component.canSendScanRequest({
        type: 'member',
        key: 'member-owner',
        member_id: 'member-owner',
        member_role: 'owner',
        status: 'active',
        email: 'owner@example.com',
        state: 'verified_member'
      } as any)
    ).toBe(false);
  });

  it('renders linked users, pending invitations, and broken memberships with honest identity labels', async () => {
    rosterResponse$ = of({
      summary: {
        activeMembers: 3,
        scanEligible: 2,
        scanRequested: 0,
        scannedToday: 1,
        missingScans: 1,
        pendingInvites: 1,
        ownerCount: 1,
        hrCount: 0,
        managerCount: 0,
        employeeCount: 2,
        needsReviewCount: 1
      },
      rows: [
        {
          type: 'member',
          key: 'member-1',
          member_id: 'member-1',
          user_id: 'user-1',
          member_role: 'employee',
          status: 'active',
          identity: {
            displayName: 'Alex Parker',
            email: 'alex@example.com'
          },
          identity_state: 'identified',
          name: 'Alex Parker',
          email: 'alex@example.com',
          department_name: 'Operations',
          scan_status: 'completed',
          readiness_label: 'Ready',
          last_scan_at: '2026-06-25T10:00:00.000Z'
        },
        {
          type: 'invite',
          key: 'invite-1',
          invite_id: 'invite-1',
          state: 'pending_invitation',
          member_role: 'employee',
          status: 'pending',
          identity: {
            displayName: 'Invitation pending',
            email: 'invitee@example.com'
          },
          identity_state: 'pending_onboarding',
          name: 'Invitation pending',
          email: 'invitee@example.com',
          invite_phone: null,
          department_name: 'Operations',
          scan_status: 'not_applicable',
          readiness_label: 'No scan',
          last_scan_at: null
        },
        {
          type: 'member',
          key: 'member-2',
          member_id: 'member-2',
          state: 'repair_required',
          user_id: null,
          linked_invite_email: null,
          member_role: 'employee',
          status: 'active',
          identity: {
            displayName: 'Data repair required',
            email: null
          },
          identity_state: 'identity_unavailable',
          name: 'Data repair required',
          email: null,
          reason: 'missing linked user',
          department_name: 'Operations',
          scan_status: 'missing',
          readiness_label: 'No scan',
          last_scan_at: null
        }
      ],
      departments: [{ id: 'dept-1', name: 'Operations' }],
      scanRequestRows: [],
      relationWarning: null
    });

    component.refresh();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alex Parker');
    expect(text).toContain('alex@example.com');
    expect(text).toContain('Invitation pending');
    expect(text).toContain('invitee@example.com');
    expect(text).toContain('Data repair required');
    expect(text).toContain('Missing linked user');

    const firstRow = component.filteredRows[0];
    component.selectedMember = firstRow;
    component.showDetailsModal = true;
    expect(component.showDetailsModal).toBe(true);
    component.onEscape();
    expect(component.showDetailsModal).toBe(false);
  });
});
