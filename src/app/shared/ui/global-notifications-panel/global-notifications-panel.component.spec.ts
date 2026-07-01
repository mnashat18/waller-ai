import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { NotificationsService } from '../../../services/notifications.service';
import { GlobalNotificationsPanelComponent } from './global-notifications-panel.component';

describe('GlobalNotificationsPanelComponent', () => {
  let fixture: ComponentFixture<GlobalNotificationsPanelComponent>;
  let notificationsState$: BehaviorSubject<any>;

  beforeEach(async () => {
    notificationsState$ = new BehaviorSubject({
      unreadCount: 4,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: 'profile-1'
    });

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
});
