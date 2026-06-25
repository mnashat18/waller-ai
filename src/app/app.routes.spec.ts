import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';

import { CompanyContextService } from './core/context/company-context.service';
import { InviteService } from './services/invites';
import { SubscriptionService } from './services/subscription.service';
import { businessOnboardingGuard, dashboardWorkspaceGuard } from './app.routes';

describe('route guard recovery', () => {
  const inviteServiceMock = {
    getPendingInviteToken: () => null,
    getInviteTokenFromCurrentUrl: () => null,
    setInviteClaimError: () => undefined
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'header.payload.signature');
  });

  it('fails closed to workspace access when workspace bootstrap errors', async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            ensureLoaded: () => throwError(() => new Error('timeout')),
            snapshot: () => ({
              context: {
                activeBusinessProfileId: null,
                activeMemberRole: null
              }
            })
          }
        },
        {
          provide: InviteService,
          useValue: inviteServiceMock
        }
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    const result = await TestBed.runInInjectionContext(() =>
      dashboardWorkspaceGuard({} as never, { url: '/app/workforce?filter=open' } as never)
    );

    expect(typeof result).toBe('object');
    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/app/workspace-access?returnUrl=%2Fapp%2Fworkforce%3Ffilter%3Dopen'
    );
  });

  it('fails closed to workspace access when onboarding verification errors', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SubscriptionService,
          useValue: {
            isBusinessOnboardingComplete: () => throwError(() => new Error('network'))
          }
        }
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        businessOnboardingGuard({} as never, { url: '/app/dashboard' } as never)
      ) as any
    );

    expect(typeof result).toBe('object');
    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/app/workspace-access?returnUrl=%2Fapp%2Fdashboard'
    );
  });
});
