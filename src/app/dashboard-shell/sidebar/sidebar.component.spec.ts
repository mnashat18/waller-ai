import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService, type CompanyContextState } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { SidebarComponent } from './sidebar.component';

@Component({
  standalone: true,
  template: '<p>route</p>'
})
class DummyRouteComponent {}

const createContextState = (overrides: Partial<CompanyContextState['context']> = {}): CompanyContextState => ({
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
    hubReason: null,
    ...overrides
  }
});

const collectStyleRules = (): CSSStyleRule[] => {
  const rules: CSSStyleRule[] = [];

  const visit = (list: CSSRuleList | undefined | null): void => {
    if (!list) {
      return;
    }

    Array.from(list).forEach((rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        rules.push(rule as CSSStyleRule);
      }

      const nestedRules = (rule as CSSGroupingRule & { cssRules?: CSSRuleList }).cssRules;
      if (nestedRules?.length) {
        visit(nestedRules);
      }
    });
  };

  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      visit(sheet.cssRules);
    } catch {
      // Ignore cross-origin or inaccessible sheets in the test environment.
    }
  });

  return rules;
};

const findRule = (selectorText: string): CSSStyleRule | undefined =>
  collectStyleRules().find((rule) => rule.selectorText === selectorText);

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let router: Router;
  let state$: BehaviorSubject<CompanyContextState>;
  let activeMembership$: BehaviorSubject<any>;
  let activeBusinessProfile$: BehaviorSubject<any>;
  let authLogoutSpy: any;
  let switchCompanySpy: any;

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
    switchCompanySpy = vi.fn(() => of(createContextState()));

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([
          {
            path: 'app',
            children: [
              {
                path: 'dashboard',
                component: DummyRouteComponent,
                children: [{ path: 'anything', component: DummyRouteComponent }]
              },
              {
                path: 'workforce',
                component: DummyRouteComponent,
                children: [{ path: 'member/:id', component: DummyRouteComponent }]
              },
              { path: 'scan-requests', component: DummyRouteComponent },
              { path: 'compliance', component: DummyRouteComponent },
              { path: 'alerts', component: DummyRouteComponent },
              {
                path: 'reports',
                component: DummyRouteComponent,
                children: [{ path: 'export', component: DummyRouteComponent }]
              },
              {
                path: 'company',
                component: DummyRouteComponent,
                children: [{ path: 'departments', component: DummyRouteComponent }]
              }
            ]
          }
        ]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of(null),
            state$: state$.asObservable(),
            activeMembership$: activeMembership$.asObservable(),
            activeBusinessProfile$: activeBusinessProfile$.asObservable(),
            clearActiveWorkspaceContext: () => undefined,
            snapshot: () => state$.value,
            switchCompany: switchCompanySpy
          }
        },
        {
          provide: AuthService,
          useValue: {
            logout: () => undefined
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    authLogoutSpy = vi.spyOn(TestBed.inject(AuthService), 'logout').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/app/workforce');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    document.body.querySelector('.app-sidebar__account-menu')?.remove();
  });

  it('renders organization navigation without a standalone Settings item', async () => {
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.app-sidebar__nav-item') as NodeListOf<HTMLElement>).map(
      (item) => item.textContent?.replace(/\s+/g, ' ').trim()
    );

    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Workforce');
    expect(labels).toContain('Scan Requests');
    expect(labels).not.toContain('Settings');
  });

  it('keeps Workforce active on direct route entry and exposes aria-current', () => {
    const activeItems = Array.from(fixture.nativeElement.querySelectorAll('.app-sidebar__nav-item.is-active')) as HTMLAnchorElement[];
    const workforce = activeItems.find((item) => item.textContent?.includes('Workforce')) as HTMLAnchorElement | undefined;

    expect(workforce).toBeTruthy();
    expect(workforce?.getAttribute('aria-current')).toBe('page');
    expect(Array.from(activeItems).some((item) => item.textContent?.includes('Dashboard'))).toBe(false);
  });

  it('keeps section navigation active on nested routes while Dashboard remains exact', async () => {
    const findItem = (label: string): HTMLAnchorElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('.app-sidebar__nav-item')).find((item) =>
        (item as HTMLAnchorElement).textContent?.includes(label)
      ) as HTMLAnchorElement | undefined;

    const navigateTo = async (url: string): Promise<void> => {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    await navigateTo('/app/workforce/member/123');
    expect(findItem('Workforce')?.classList.contains('is-active')).toBe(true);
    expect(findItem('Workforce')?.getAttribute('aria-current')).toBe('page');
    expect(findItem('Dashboard')?.classList.contains('is-active')).toBe(false);

    await navigateTo('/app/reports/export');
    expect(findItem('Reports')?.classList.contains('is-active')).toBe(true);
    expect(findItem('Reports')?.getAttribute('aria-current')).toBe('page');

    await navigateTo('/app/company/departments');
    expect(findItem('Organization')?.classList.contains('is-active')).toBe(true);
    expect(findItem('Organization')?.getAttribute('aria-current')).toBe('page');

    await navigateTo('/app/dashboard/anything');
    expect(findItem('Dashboard')?.classList.contains('is-active')).toBe(false);
    expect(findItem('Dashboard')?.getAttribute('aria-current')).toBeNull();
  });

  it('renders the account control with identity and role', () => {
    const control = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    expect(control).toBeTruthy();
    expect(control.textContent).toContain('Owner User');
    expect(control.textContent).toContain('owner@example.com');
    expect(control.textContent).toContain('Owner');
  });

  it('hides Switch organization when only one verified membership is available', async () => {
    state$.next(
      createContextState({
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Wellar',
            role: 'owner',
            membershipStatus: 'active',
            isActive: true
          }
        ]
      })
    );
    activeMembership$.next({
      id: 'membership-1',
      member_role: 'owner',
      status: 'active',
      business_profile: { id: 'profile-1', company_name: 'Wellar' },
      department: null
    });
    activeBusinessProfile$.next({ id: 'profile-1', company_name: 'Wellar' });
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menu = document.body.querySelector('.app-sidebar__account-menu') as HTMLElement;
    expect(menu.textContent).not.toContain('Switch organization');
  });

  it('shows Switch organization for multiple verified memberships and opens the compact picker', async () => {
    state$.next(
      createContextState({
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Waller Demo Company',
            role: 'owner',
            membershipStatus: 'active',
            isActive: true
          },
          {
            id: 'profile-2',
            membershipId: 'membership-2',
            name: 'Northline Logistics',
            role: 'manager',
            membershipStatus: 'active',
            isActive: false
          }
        ]
      })
    );
    activeMembership$.next({
      id: 'membership-1',
      member_role: 'owner',
      status: 'active',
      business_profile: { id: 'profile-1', company_name: 'Waller Demo Company' },
      department: null
    });
    activeBusinessProfile$.next({ id: 'profile-1', company_name: 'Waller Demo Company' });
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menu = document.body.querySelector('.app-sidebar__account-menu') as HTMLElement;
    expect(menu.textContent).toContain('Switch organization');

    const switchButton = Array.from(menu.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Switch organization')
    ) as HTMLButtonElement;
    switchButton.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const picker = document.body.querySelector('.app-sidebar__organization-switcher-panel') as HTMLElement;
    expect(picker).toBeTruthy();
    expect(picker.textContent).toContain('Switch organization');
    expect(picker.textContent).toContain('Choose the organization you want to work in');
    expect(picker.textContent).toContain('Waller Demo Company');
    expect(picker.textContent).toContain('Northline Logistics');
  });

  it('prevents duplicate switch clicks, reloads context, and routes to the dashboard after switching', async () => {
    const pendingSwitch$ = new Subject<CompanyContextState>();
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    state$.next(
      createContextState({
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Waller Demo Company',
            role: 'owner',
            membershipStatus: 'active',
            isActive: true
          },
          {
            id: 'profile-2',
            membershipId: 'membership-2',
            name: 'Northline Logistics',
            role: 'manager',
            membershipStatus: 'active',
            isActive: false
          }
        ]
      })
    );
    activeMembership$.next({
      id: 'membership-1',
      member_role: 'owner',
      status: 'active',
      business_profile: { id: 'profile-1', company_name: 'Waller Demo Company' },
      department: null
    });
    activeBusinessProfile$.next({ id: 'profile-1', company_name: 'Waller Demo Company' });

    switchCompanySpy.mockImplementation((companyId: string) => {
      expect(companyId).toBe('profile-2');
      const nextState = createContextState({
        activeBusinessProfileId: 'profile-2',
        activeBusinessProfileName: 'Northline Logistics',
        activeMemberRole: 'manager',
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Waller Demo Company',
            role: 'owner',
            membershipStatus: 'active',
            isActive: false
          },
          {
            id: 'profile-2',
            membershipId: 'membership-2',
            name: 'Northline Logistics',
            role: 'manager',
            membershipStatus: 'active',
            isActive: true
          }
        ]
      });

      state$.next(nextState);
      activeMembership$.next({
        id: 'membership-2',
        member_role: 'manager',
        status: 'active',
        business_profile: { id: 'profile-2', company_name: 'Northline Logistics' },
        department: null
      });
      activeBusinessProfile$.next({ id: 'profile-2', company_name: 'Northline Logistics' });
      return pendingSwitch$.asObservable();
    });

    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menu = document.body.querySelector('.app-sidebar__account-menu') as HTMLElement;
    const switchButton = Array.from(menu.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Switch organization')
    ) as HTMLButtonElement;
    switchButton.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const picker = document.body.querySelector('.app-sidebar__organization-switcher-panel') as HTMLElement;
    const targetRow = Array.from(picker.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Northline Logistics')
    ) as HTMLButtonElement;
    expect(targetRow.disabled).toBe(false);

    targetRow.click();
    targetRow.click();
    expect(switchCompanySpy).toHaveBeenCalledTimes(1);

    pendingSwitch$.next(state$.value);
    pendingSwitch$.complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(document.body.querySelector('.app-sidebar__account-menu')).toBeFalsy();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect(fixture.nativeElement.textContent).toContain('Northline Logistics');
    expect(fixture.nativeElement.textContent).toContain('Manager');
  });

  it('keeps the account footer anchored without sticky positioning', () => {
    const body = fixture.nativeElement.querySelector('.app-sidebar__body') as HTMLElement;
    const footer = fixture.nativeElement.querySelector('.app-sidebar__footer') as HTMLElement;
    const bodyStyles = getComputedStyle(body);
    const footerStyles = getComputedStyle(footer);

    expect(bodyStyles.overflowY).not.toBe('auto');
    expect(footerStyles.position).toBe('static');
    expect(footerStyles.position).not.toBe('sticky');
  });

  it('keeps sidebar hover behavior free of whole-shell transforms', () => {
    expect(findRule('.app-shell .app-sidebar__panel:hover')).toBeUndefined();

    const navHoverRule = collectStyleRules().find((rule) => rule.selectorText.includes('.app-sidebar__nav-item:hover'));
    const navActiveRule = collectStyleRules().find((rule) => rule.selectorText.includes('.app-sidebar__nav-item.is-active'));

    expect(navHoverRule?.style.getPropertyValue('transform') ?? '').toBe('');
    expect(navHoverRule?.style.getPropertyValue('transition') ?? '').not.toContain('all');
    expect(navActiveRule?.style.getPropertyValue('transform') ?? '').toBe('');
  });

  it('opens a body-level account menu that routes to personal settings and closes on Escape', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const trigger = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menu = document.body.querySelector('.app-sidebar__account-menu') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.textContent).toContain('Profile & settings');
    expect(menu.textContent).toContain('Sign out');
    expect(menu.textContent).not.toContain('Switch organization');

    const profileButton = menu.querySelector('.app-sidebar__account-menu-item') as HTMLButtonElement;
    profileButton.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/app/settings'], {
      queryParams: { tab: 'profile' },
      replaceUrl: false
    });

    trigger.click();
    fixture.detectChanges();

    const focusedMenuItem = document.body.querySelector('.app-sidebar__account-menu-item') as HTMLButtonElement;
    focusedMenuItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.body.querySelector('.app-sidebar__account-menu')).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the account menu on outside clicks and signs out through the existing flow', () => {
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const trigger = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.querySelector('.app-sidebar__account-menu')).toBeFalsy();

    trigger.click();
    fixture.detectChanges();

    const menu = document.body.querySelector('.app-sidebar__account-menu') as HTMLElement;
    const signOutButton = Array.from(menu.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Sign out')
    ) as HTMLButtonElement;
    signOutButton.click();

    expect(authLogoutSpy).toHaveBeenCalledTimes(1);
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/');
  });
});
