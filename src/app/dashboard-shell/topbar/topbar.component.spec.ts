import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService, type CompanyContextState } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { NotificationsService } from '../../services/notifications.service';
import { TopbarComponent } from './topbar.component';

const createContextState = (): CompanyContextState => ({
  loading: false,
  error: null,
  context: {
    currentUser: {
      id: 'user-1',
      email: 'owner@example.com',
      first_name: 'Owner',
      last_name: 'User'
    },
    userId: 'user-1',
    userDisplayName: 'Owner User',
    userEmail: 'owner@example.com',
    isAuthenticated: true,
    authInitialized: true,
    workspaceInitialized: true,
    activeBusinessProfileId: 'profile-1',
    activeBusinessProfileName: 'Wellar',
    activeDepartmentId: null,
    activeDepartmentName: null,
    activeMemberRole: 'owner',
    availableCompanies: [],
    hubReason: null
  }
});

describe('TopbarComponent', () => {
  let fixture: ComponentFixture<TopbarComponent>;
  let state$: BehaviorSubject<CompanyContextState>;
  let notificationsState$: BehaviorSubject<any>;

  beforeEach(async () => {
    state$ = new BehaviorSubject<CompanyContextState>(createContextState());
    notificationsState$ = new BehaviorSubject({
      unreadCount: 0,
      recentNotifications: [],
      loading: false,
      error: null,
      activeWorkspaceId: null
    });

    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([
          { path: 'app/dashboard', component: TopbarComponent }
        ]),
        {
          provide: CompanyContextService,
          useValue: {
            state$: state$.asObservable(),
            initializeAppContext: () => Promise.resolve(),
            snapshot: () => state$.value
          }
        },
        {
          provide: AuthService,
          useValue: {
            logout: vi.fn()
          }
        },
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

  it('no longer renders the header organization switcher or refresh context action', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).not.toContain('Organization Switcher');
    expect(text).not.toContain('Refresh context');
    expect(text).not.toContain('Active Organization');
  });
});
