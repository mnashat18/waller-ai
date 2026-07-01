import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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
  let httpMock: HttpTestingController;

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
        provideHttpClient(),
        provideHttpClientTesting(),
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
                email: 'owner@example.com',
                provider: 'email',
                avatar: null,
                role: { name: 'Member' }
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
    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(SettingsPageComponent);
    component = fixture.componentInstance;
    vi.spyOn(component as any, 'loadSettings').mockResolvedValue(undefined);
    vi.spyOn(component as any, 'reloadCurrentUser').mockResolvedValue(undefined);
    component.loading = false;
    component.loadError = '';
    component.viewState = 'ready';
    component.user = {
      id: 'user-1',
      first_name: 'Owner',
      last_name: 'User',
      email: 'owner@example.com',
      provider: 'email',
      role: { name: 'Member' },
      avatar: null
    };
    component.accountForm = {
      firstName: 'Owner',
      lastName: 'User',
      phone: '555-1000'
    };
    (component as any).accountInitial = {
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
    httpMock?.verify();
  });

  it('defaults to Profile and keeps only the supported secondary tabs visible', async () => {
    await createComponent();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.settings-tab') as NodeListOf<HTMLElement>
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

    expect(labels).toEqual(['Profile', 'Preferences', 'Security']);
    expect(component.activeTab).toBe('profile');
    expect(fixture.nativeElement.textContent).toContain('Account settings');
    expect(fixture.nativeElement.textContent).not.toContain('Organization');
  });

  it('switches to Preferences and Security through the tab controls', async () => {
    await createComponent();

    const tabs = fixture.nativeElement.querySelectorAll('.settings-tab') as NodeListOf<HTMLButtonElement>;
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

  it('keeps the save action disabled until the profile is dirty and rejects invalid avatar files', async () => {
    await createComponent();

    const saveButton = fixture.nativeElement.querySelector('.settings-save-bar .btn-primary') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    component.accountForm = {
      firstName: 'Owner',
      lastName: 'Updated',
      phone: '555-1000'
    };

    expect(component.hasAccountChanges()).toBe(true);

    component.onAvatarSelected({
      target: {
        files: [new File(['test'], 'avatar.txt', { type: 'text/plain' })],
        value: ''
      }
    } as unknown as Event);

    expect(component.avatarUploadError).toBe('Choose a JPG, PNG, or WebP image.');
    expect(component.hasAccountChanges()).toBe(true);
  });

  it('submits supported profile changes through /users/me and refreshes the local state', async () => {
    await createComponent();

    component.accountForm = {
      firstName: 'Owner',
      lastName: 'Updated',
      phone: '555-2000'
    };

    const savePromise = component.saveAccountChanges();
    await Promise.resolve();

    const request = httpMock.expectOne((req) => req.url.endsWith('/users/me'));
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      first_name: 'Owner',
      last_name: 'Updated',
      phone: '555-2000'
    });
    request.flush({ data: { id: 'user-1' } });

    await savePromise;

    expect(component.profileSaveState).toBe('success');
    expect(component.profileSaveMessage).toContain('Account settings saved');
    expect((component as any).reloadCurrentUser).toHaveBeenCalled();
  });

  it('ignores the legacy organization tab and stays on Profile', async () => {
    await createComponent('organization', 'owner');

    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/app/company', { replaceUrl: true });
    expect(component.activeTab).toBe('profile');
  });
});
