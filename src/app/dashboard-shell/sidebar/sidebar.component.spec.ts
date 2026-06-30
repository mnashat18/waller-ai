import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService, type CompanyContextState } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
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
          {
            path: 'app/dashboard',
            component: DummyRouteComponent,
            children: [{ path: 'child', component: DummyRouteComponent }]
          },
          { path: 'app/workforce', component: DummyRouteComponent },
          { path: 'app/scan-requests', component: DummyRouteComponent },
          { path: 'app/compliance', component: DummyRouteComponent },
          { path: 'app/alerts', component: DummyRouteComponent },
          { path: 'app/reports', component: DummyRouteComponent },
          { path: 'app/company', component: DummyRouteComponent }
        ]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => of(null),
            state$: state$.asObservable(),
            activeMembership$: activeMembership$.asObservable(),
            activeBusinessProfile$: activeBusinessProfile$.asObservable(),
            clearActiveWorkspaceContext: () => undefined
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

  it('uses exact Dashboard matching so child routes do not activate Dashboard', async () => {
    await router.navigateByUrl('/app/dashboard/child');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dashboard = Array.from(fixture.nativeElement.querySelectorAll('.app-sidebar__nav-item')) as HTMLAnchorElement[];
    const dashboardItem = dashboard.find((item) => item.textContent?.includes('Dashboard')) as HTMLAnchorElement | undefined;

    expect(dashboardItem?.classList.contains('is-active')).toBe(false);
    expect(dashboardItem?.getAttribute('aria-current')).toBeNull();
  });

  it('renders the account control with identity and role', () => {
    const control = fixture.nativeElement.querySelector('.app-sidebar__account-control') as HTMLButtonElement;
    expect(control).toBeTruthy();
    expect(control.textContent).toContain('Owner User');
    expect(control.textContent).toContain('owner@example.com');
    expect(control.textContent).toContain('Owner');
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
    expect(menu.textContent).toContain('Profile');
    expect(menu.textContent).toContain('Preferences');
    expect(menu.textContent).toContain('Security');
    expect(menu.textContent).toContain('Sign out');

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
