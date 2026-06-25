import { NO_ERRORS_SCHEMA, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

import { CompanyContextService, type CompanyContextState } from '../core/context/company-context.service';
import { AppShellComponent } from './app-shell.component';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  template: '<div>sidebar</div>'
})
class SidebarStubComponent {}

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  template: '<div>topbar</div>'
})
class TopbarStubComponent {}

const baseContext: CompanyContextState['context'] = {
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
};

const createContextState = (
  overrides: {
    loading?: boolean;
    error?: string | null;
    context?: Partial<CompanyContextState['context']>;
  } = {}
): CompanyContextState => {
  const state = {
    loading: false,
    error: null,
    context: {
      ...baseContext,
      ...(overrides.context ?? {})
    },
    ...overrides
  };

  return state as CompanyContextState;
};

describe('AppShellComponent', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let component: AppShellComponent;
  let routerEvents$: Subject<unknown>;
  let routerStub: { url: string; events: Subject<unknown> };
  let contextState$: BehaviorSubject<CompanyContextState>;
  let initializeCallCount = 0;

  beforeEach(async () => {
    initializeCallCount = 0;
    routerEvents$ = new Subject<unknown>();
    routerStub = {
      url: '/app/dashboard',
      events: routerEvents$
    };
    contextState$ = new BehaviorSubject<CompanyContextState>(
      createContextState({
        loading: true,
        context: {
          authInitialized: false,
          workspaceInitialized: false,
          isAuthenticated: true,
          activeBusinessProfileId: null,
          activeBusinessProfileName: null,
          activeMemberRole: null
        }
      })
    );
    await TestBed.configureTestingModule({
      imports: [AppShellComponent, SidebarStubComponent, TopbarStubComponent],
      providers: [
        {
          provide: Router,
          useValue: routerStub
        },
        {
          provide: CompanyContextService,
          useValue: {
            state$: contextState$.asObservable(),
            initializeAppContext: () => {
              initializeCallCount += 1;
              return Promise.resolve(createContextState());
            }
          }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
      .overrideComponent(AppShellComponent, {
        set: {
          imports: [CommonModule, SidebarStubComponent, TopbarStubComponent]
        }
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
  });

  it('boots context once and keeps the shell mounted across route changes', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(initializeCallCount).toBe(1);
    expect(component.shellMounted).toBe(false);

    contextState$.next(createContextState());
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(component.shellMounted).toBe(true);

    routerStub.url = '/app/workforce';
    routerEvents$.next(new NavigationEnd(1, '/app/dashboard', '/app/workforce'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(initializeCallCount).toBe(1);
    expect(component.shellMounted).toBe(true);
  });

  it('shows retry after the bootstrap timeout and retries without a browser refresh', async () => {
    (component as any).bootstrapTimeoutMs = 1;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();

    expect(component.showRetryAction).toBe(true);

    component.retryWorkspaceBootstrap();
    await fixture.whenStable();

    expect(initializeCallCount).toBe(2);
  });
});
