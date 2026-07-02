import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../../core/context/company-context.service';
import { InviteService } from '../../../services/invites';
import { NotificationsService } from '../../../services/notifications.service';
import { GlobalNotificationsPanelComponent } from './global-notifications-panel.component';

describe('GlobalNotificationsPanelComponent', () => {
  let fixture: ComponentFixture<GlobalNotificationsPanelComponent>;
  let notificationsState$: BehaviorSubject<any>;
  let inviteDetails$: BehaviorSubject<any>;
  let refreshCompanyContext: ReturnType<typeof vi.fn>;
  let openInvite: ReturnType<typeof vi.fn>;
  let acceptInvite: ReturnType<typeof vi.fn>;
  let declineInvite: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    notificationsState$ = new BehaviorSubject({
      unreadCount: 4,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: 'profile-1'
    });
    inviteDetails$ = new BehaviorSubject({
      id: 'invite-1',
      email: 'new.person@example.com',
      inviteType: 'in_app',
      status: 'pending',
      memberRole: 'manager',
      businessProfileId: 'profile-1',
      companyName: 'Northwind Logistics',
      departmentId: 'department-1',
      departmentName: 'Operations',
      expiresAt: '2026-07-03T00:00:00.000Z',
      requestedByUser: {
        id: 'user-1',
        email: 'owner@example.com',
        displayName: 'Owner User'
      },
      canAct: true
    });
    refreshCompanyContext = vi.fn(() => of({}));
    openInvite = vi.fn(() => inviteDetails$.asObservable());
    acceptInvite = vi.fn(() => of({
      ok: true,
      message: 'Invitation accepted. The organization is now available in Profile → Switch Organization.',
      inviteId: 'invite-1',
      businessProfileId: 'profile-1',
      membershipId: 'membership-1',
      memberRole: 'manager',
      departmentId: 'department-1',
      inviteType: 'in_app',
      status: 'claimed',
      canAct: false
    }));
    declineInvite = vi.fn(() => of({
      ok: true,
      message: 'Invitation declined.',
      inviteId: 'invite-1',
      businessProfileId: 'profile-1',
      membershipId: null,
      memberRole: 'manager',
      departmentId: 'department-1',
      inviteType: 'in_app',
      status: 'revoked',
      canAct: false
    }));

    await TestBed.configureTestingModule({
      imports: [GlobalNotificationsPanelComponent],
      providers: [
        provideRouter([]),
        {
          provide: NotificationsService,
          useValue: {
            state$: notificationsState$.asObservable(),
            initialize: vi.fn(),
            refresh: vi.fn()
          }
        },
        {
          provide: InviteService,
          useValue: {
            getInvite: openInvite,
            acceptInvite,
            declineInvite,
            getReadableInviteError: vi.fn(() => 'Could not load invite.')
          }
        },
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: refreshCompanyContext
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalNotificationsPanelComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('shows only a bell button with a count badge and opens the notifications panel', () => {
    const bell = fixture.nativeElement.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement;

    expect(bell).toBeTruthy();
    expect(bell.textContent).not.toContain('Notifications');
    expect(bell.textContent).toContain('4');

    bell.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Notifications');
    expect(fixture.nativeElement.textContent).toContain('Active organization notification center');
    expect(fixture.nativeElement.textContent).not.toContain('Refresh');
  });

  it('loads actionable invite details and accepts them without switching organization automatically', async () => {
    notificationsState$.next({
      unreadCount: 1,
      loading: false,
      error: null,
      activeWorkspaceId: 'profile-1',
      recentNotifications: [
        {
          id: 'notification-1',
          title: 'Northwind Logistics invitation',
          message: 'You have been invited to join Northwind Logistics as Manager.',
          status: 'unread',
          dateCreated: '2026-07-01T12:00:00.000Z',
          iconKey: 'invite',
          linkType: 'invite',
          linkId: 'invite-1'
        }
      ]
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const bell = fixture.nativeElement.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement;
    bell.click();
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('article');
    expect(item.textContent).toContain('Northwind Logistics invitation');
    item.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(openInvite).toHaveBeenCalledWith('invite-1');
    expect(fixture.nativeElement.textContent).toContain('Invitation details');
    expect(fixture.nativeElement.textContent).toContain('Accept');
    expect(fixture.nativeElement.textContent).toContain('Decline');

    const acceptButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((button) =>
      (button as HTMLButtonElement).textContent?.includes('Accept')
    ) as HTMLButtonElement;

    acceptButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(acceptInvite).toHaveBeenCalledWith('invite-1');
    expect(refreshCompanyContext).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.textContent).toContain('Invitation accepted');
    expect(fixture.nativeElement.textContent).toContain('organization is now available in Profile');
  });

  it('renders informational notifications without action buttons', async () => {
    notificationsState$.next({
      unreadCount: 1,
      loading: false,
      error: null,
      activeWorkspaceId: 'profile-1',
      recentNotifications: [
        {
          id: 'notification-2',
          title: 'Read me',
          message: 'This notification is informational only.',
          status: 'unread',
          dateCreated: '2026-07-01T12:00:00.000Z',
          iconKey: 'info',
          linkType: 'info',
          linkId: 'notification-2'
        }
      ]
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const bell = fixture.nativeElement.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement;
    bell.click();
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('article');
    item.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Read-only notification details');
    expect(fixture.nativeElement.textContent).not.toContain('Accept');
    expect(fixture.nativeElement.textContent).not.toContain('Decline');
  });
});
