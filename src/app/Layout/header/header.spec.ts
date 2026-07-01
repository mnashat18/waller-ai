import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { NotificationsService } from '../../services/notifications.service';
import { HeaderComponent } from './header';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    const notificationsState$ = new BehaviorSubject({
      unreadCount: 0,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: null
    });

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: NotificationsService,
          useValue: {
            state$: notificationsState$.asObservable(),
            initialize: () => undefined,
            refresh: () => undefined
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders only the compact notification bell in the header actions area', () => {
    expect(component).toBeTruthy();
    const bell = fixture.nativeElement.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement;
    const text = fixture.nativeElement.textContent as string;

    expect(bell).toBeTruthy();
    expect(text).not.toContain('Organization Switcher');
    expect(text).not.toContain('Refresh');
    expect(text).not.toContain('owner@example.com');
  });
});
