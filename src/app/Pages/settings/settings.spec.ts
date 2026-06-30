import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { WorkspaceContextApiService } from '../../services/workspace-context-api.service';
import { SettingsPageComponent } from './settings';

describe('SettingsPageComponent', () => {
  let fixture: ComponentFixture<SettingsPageComponent>;
  let component: SettingsPageComponent;
  let router: Router;

  const createCompanyContextStub = (role: 'owner' | 'manager' | 'hr' = 'owner') => ({
    snapshot: () => ({
      context: {
        activeMemberRole: role,
        activeBusinessProfileId: 'profile-1',
        activeBusinessProfileName: 'Wellar',
        activeDepartmentId: null,
        activeDepartmentName: null,
        currentUser: {
          id: 'user-1',
          email: 'owner@example.com',
          first_name: 'Owner',
          last_name: 'User'
        },
        userDisplayName: 'Owner User',
        userEmail: 'owner@example.com'
      }
    }),
    clearActiveWorkspaceContext: () => undefined,
    ensureActiveContext: () => Promise.resolve(),
    ensureLoaded: () => of(null),
    activateFromMembership: () => Promise.resolve()
  });

  async function createComponent(tab: string | null = null, role: 'owner' | 'manager' | 'hr' = 'owner'): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [
        provideRouter([
          { path: 'app/company', component: SettingsPageComponent },
          { path: 'app/settings', component: SettingsPageComponent }
        ]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(tab ? { tab } : {})
            }
          }
        },
        {
          provide: CompanyContextService,
          useValue: createCompanyContextStub(role)
        },
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: () => 'token',
            getAuthHeaders: () => ({}),
            getCurrentUserAfterRestore: () =>
              Promise.resolve({
                id: 'user-1',
                first_name: 'Owner',
                last_name: 'User',
                email: 'owner@example.com'
              }),
            logout: () => undefined
          }
        },
        {
          provide: WorkspaceContextApiService,
          useValue: {
            getContext: () =>
              of({
                memberships: [
                  {
                    id: 'membership-1',
                    status: 'active',
                    memberRole: role,
                    workspace: {
                      id: 'profile-1',
                      companyName: 'Wellar',
                      isActive: true,
                      planCode: 'pilot',
                      billingStatus: 'trial'
                    },
                    department: null
                  }
                ],
                invitations: [],
                active: {
                  membership: { id: 'membership-1' },
                  workspace: { id: 'profile-1', company_name: 'Wellar', is_active: true },
                  department: null
                }
              })
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(SettingsPageComponent);
    component = fixture.componentInstance;
    vi.spyOn(component as any, 'loadSettings').mockResolvedValue(undefined);
    component.loading = false;
    component.loadError = '';
    component.viewState = 'ready';
    component.user = {
      id: 'user-1',
      first_name: 'Owner',
      last_name: 'User',
      email: 'owner@example.com',
      provider: 'email'
    };
    component.accountForm = {
      firstName: 'Owner',
      lastName: 'User',
      phone: '555-1000'
    };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  it('defaults to Profile and hides the Organization tab', async () => {
    await createComponent();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.settings-menu-item') as NodeListOf<HTMLElement>
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

    expect(labels).toEqual(['Profile', 'Preferences', 'Security']);
    expect(component.activeTab).toBe('profile');
    expect(fixture.nativeElement.textContent).toContain('Account settings');
    expect(fixture.nativeElement.textContent).not.toContain('Organization');
  });

  it('switches to Preferences and Security through the tab controls', async () => {
    await createComponent();

    const tabs = fixture.nativeElement.querySelectorAll('.settings-menu-item') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.detectChanges();
    expect(component.activeTab).toBe('preferences');
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { tab: 'preferences' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });

    tabs[2].click();
    fixture.detectChanges();
    expect(component.activeTab).toBe('security');
  });

  it('redirects legacy organization tab URLs for owners and HR users', async () => {
    await createComponent('organization', 'owner');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/company', { replaceUrl: true });
  });

  it('falls back to Profile when the legacy organization tab is requested without owner or HR access', async () => {
    await createComponent('organization', 'manager');

    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/app/company', { replaceUrl: true });
    expect(component.activeTab).toBe('profile');
  });
});
