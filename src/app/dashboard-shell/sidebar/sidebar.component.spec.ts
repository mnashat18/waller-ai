import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { CompanyContextService, type CompanyContextState } from '../../core/context/company-context.service';
import { SidebarComponent } from './sidebar.component';

@Component({
  standalone: true,
  template: '<p>route</p>'
})
class DummyRouteComponent {}

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

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let router: Router;
  let state$: BehaviorSubject<CompanyContextState>;
  let activeMembership$: BehaviorSubject<any>;
  let activeBusinessProfile$: BehaviorSubject<any>;

  beforeEach(async () => {
    state$ = new BehaviorSubject<CompanyContextState>(createContextState());
    activeMembership$ = new BehaviorSubject({
      id: 'membership-1',
      member_role: 'owner',
      status: 'active',
      business_profile: { id: 'profile-1', company_name: 'Wellar' },
      department: null
    });
    activeBusinessProfile$ = new BehaviorSubject({ id: 'profile-1', company_name: 'Wellar' });

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([
          { path: 'app/dashboard', component: DummyRouteComponent },
          { path: 'app/workforce', component: DummyRouteComponent }
        ]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => state$.asObservable(),
            state$: state$.asObservable(),
            activeMembership$: activeMembership$.asObservable(),
            activeBusinessProfile$: activeBusinessProfile$.asObservable()
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await router.navigateByUrl('/app/workforce');
    fixture.detectChanges();
  });

  it('highlights the active route when navigation changes', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const activeLink = fixture.nativeElement.querySelector('.app-sidebar__nav-item.is-active');
    expect(activeLink).toBeTruthy();
    expect(activeLink.textContent).toContain('Workforce');

    await router.navigateByUrl('/app/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const nextActiveLink = fixture.nativeElement.querySelector('.app-sidebar__nav-item.is-active');
    expect(nextActiveLink.textContent).toContain('Dashboard');
  });
});
