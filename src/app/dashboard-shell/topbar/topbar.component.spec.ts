import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { NotificationsService } from '../../services/notifications.service';
import { TopbarComponent } from './topbar.component';

describe('TopbarComponent', () => {
  let fixture: ComponentFixture<TopbarComponent>;
  let notificationsState$: BehaviorSubject<any>;

  beforeEach(async () => {
    notificationsState$ = new BehaviorSubject({
      unreadCount: 3,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: null
    });

    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([{ path: 'app/dashboard', component: TopbarComponent }]),
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

    fixture = TestBed.createComponent(TopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('renders a compact accessible notification bell without identity text', () => {
    const header = fixture.nativeElement.querySelector('.app-header__panel') as HTMLElement;
    const actions = fixture.nativeElement.querySelector('.app-header__actions') as HTMLElement;
    const text = fixture.nativeElement.textContent as string;
    const bell = fixture.nativeElement.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement;

    expect(bell).toBeTruthy();
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    expect(header.style.getPropertyValue('justify-content')).toBe('flex-end');
    expect(header.style.getPropertyValue('width')).toBe('100%');
    expect(actions.classList.contains('app-header__actions')).toBe(true);
    expect(text).not.toContain('Owner User');
    expect(text).not.toContain('owner@example.com');
    expect(text).not.toContain('Organization Switcher');
    expect(text).not.toContain('Refresh');
    expect(text).toContain('3');

    bell.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Notifications');
    expect(fixture.nativeElement.textContent).toContain('Active organization notification center');
  });
});
