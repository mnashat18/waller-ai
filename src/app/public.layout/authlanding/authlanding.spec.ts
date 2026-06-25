import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { Authlanding } from './authlanding';

describe('Authlanding', () => {
  let component: Authlanding;
  let fixture: ComponentFixture<Authlanding>;
  let routeStub: {
    snapshot: {
      queryParamMap: ReturnType<typeof convertToParamMap>;
      routeConfig: { path: string };
      data: Record<string, unknown>;
    };
    queryParamMap: any;
  };
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject(convertToParamMap({ auth: 'login' }));
    routeStub = {
      snapshot: {
        queryParamMap: convertToParamMap({ auth: 'login' }),
        routeConfig: { path: '' },
        data: {}
      },
      queryParamMap: queryParams$.asObservable()
    };

    await TestBed.configureTestingModule({
      imports: [Authlanding],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: routeStub
        },
        {
          provide: AuthService,
          useValue: {
            signup: () => undefined,
            login: () => undefined,
            loginWithGoogle: () => undefined,
            setPostAuthRedirect: () => undefined
          }
        },
        {
          provide: InviteService,
          useValue: {
            getPendingInviteToken: () => null,
            setPendingInviteToken: () => undefined
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: { resolveDestination: () => Promise.resolve('/app/workspace-access') }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Authlanding);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the login modal when the auth query param is present', async () => {
    queryParams$.next(convertToParamMap({ auth: 'login' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.auth-modal');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Welcome back');
  });

  it('opens the signup modal when the auth query param is present', async () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'signup' });
    queryParams$.next(convertToParamMap({ auth: 'signup' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.auth-modal');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Start your organization');
  });
});
