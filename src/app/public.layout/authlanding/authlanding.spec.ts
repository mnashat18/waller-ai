import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

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
  let authSpy: {
    consumeAuthNotice: ReturnType<typeof vi.fn>;
    signup: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    loginWithGoogle: ReturnType<typeof vi.fn>;
    setPostAuthRedirect: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject(convertToParamMap({ auth: 'signup' }));
    routeStub = {
      snapshot: {
        queryParamMap: convertToParamMap({ auth: 'signup' }),
        routeConfig: { path: '' },
        data: {}
      },
      queryParamMap: queryParams$.asObservable()
    };

    authSpy = {
      consumeAuthNotice: vi.fn(() => ''),
      signup: vi.fn(() => of({})),
      login: vi.fn(() => of({ access_token: 'token' })),
      loginWithGoogle: vi.fn(),
      setPostAuthRedirect: vi.fn()
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
          useValue: authSpy
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
  });

  async function renderSignupModal(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'signup' });
    queryParams$.next(convertToParamMap({ auth: 'signup' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the login modal when the auth query param is present', async () => {
    queryParams$.next(convertToParamMap({ auth: 'login' }));
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'login' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const modal = document.body.querySelector('app-viewport-dialog');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Welcome back');
  });

  it('opens the signup modal when the auth query param is present', async () => {
    await renderSignupModal();

    const modal = document.body.querySelector('app-viewport-dialog');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Start your organization');
  });

  it('shows inline required errors for blank first and last name on blur and submit', async () => {
    await renderSignupModal();

    component.markSignupFieldTouched('firstName');
    component.markSignupFieldTouched('lastName');

    expect(component.signupFieldError('firstName')).toBe('First name is required.');
    expect(component.signupFieldError('lastName')).toBe('Last name is required.');

    component.signup.email = 'owner@example.com';
    component.signup.password = 'Password123';
    component.submitSignup();

    expect(authSpy.signup).not.toHaveBeenCalled();
  });

  it('blocks names containing digits or unsupported symbols', async () => {
    await renderSignupModal();

    component.signup.firstName = 'John3';
    component.signup.lastName = 'Carter!';

    expect(component.signupFieldError('firstName')).toBe('Enter a valid first name.');
    expect(component.signupFieldError('lastName')).toBe('Enter a valid last name.');
  });

  it('accepts Arabic, hyphenated, and apostrophe names after whitespace normalization', async () => {
    await renderSignupModal();

    component.signup.firstName = '  عبد   الرحمن  ';
    component.signup.lastName = "  Anne-Marie O'Connor  ";
    component.markSignupFieldTouched('firstName');
    component.markSignupFieldTouched('lastName');

    expect(component.signup.firstName).toBe('عبد الرحمن');
    expect(component.signup.lastName).toBe("Anne-Marie O'Connor");
    expect(component.signupFieldError('firstName')).toBeNull();
    expect(component.signupFieldError('lastName')).toBeNull();
  });

  it('blocks malformed email addresses and accepts corporate and Gmail-style addresses', async () => {
    await renderSignupModal();

    component.signup.email = 'owner@invalid';
    expect(component.signupFieldError('email')).toBe('Enter a valid email address.');

    component.signup.email = 'owner@company.com';
    expect(component.signupFieldError('email')).toBeNull();

    component.signup.email = 'owner@gmail.com';
    expect(component.signupFieldError('email')).toBeNull();
  });

  it('enforces the exact password rule and accepts a valid password', async () => {
    await renderSignupModal();

    component.signup.password = '123';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = 'abcdefghij';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = '1234567890';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = 'ValidPass123';
    expect(component.signupFieldError('password')).toBeNull();
  });

  it('does not call the registration API when client validation fails', async () => {
    await renderSignupModal();

    component.signup.firstName = 'John!';
    component.signup.lastName = '';
    component.signup.email = 'invalid-email';
    component.signup.password = '1234567890';

    component.submitSignup();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(component.submitting).toBe(false);
  });

  it('submits normalized signup data when the client validation passes', async () => {
    await renderSignupModal();

    component.signup.firstName = '  Abdul   Rhman ';
    component.signup.lastName = " O'Connor ";
    component.signup.email = ' owner@gmail.com ';
    component.signup.password = 'ValidPass123';

    component.submitSignup();

    expect(authSpy.signup).toHaveBeenCalledWith({
      email: 'owner@gmail.com',
      password: 'ValidPass123',
      first_name: 'Abdul Rhman',
      last_name: "O'Connor"
    });
  });
});
