import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
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

  async function renderLoginModal(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'login' });
    queryParams$.next(convertToParamMap({ auth: 'login' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function signupForm(): HTMLFormElement {
    return document.body.querySelector('form.auth-form') as HTMLFormElement;
  }

  function signupSubmitButton(): HTMLButtonElement {
    return document.body.querySelector('form.auth-form button[type="submit"]') as HTMLButtonElement;
  }

  function loginSubmitButton(): HTMLButtonElement {
    return document.body.querySelector('form.auth-form button[type="submit"]') as HTMLButtonElement;
  }

  async function setLoginInputValue(name: string, value: string): Promise<void> {
    const input = document.body.querySelector(`form.auth-form input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setSignupInputValue(name: string, value: string): Promise<void> {
    const input = document.body.querySelector(`form.auth-form input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

  it('shows a forgot password action in the login state', async () => {
    await renderLoginModal();

    const forgotLink = Array.from(document.body.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Forgot password?'
    ) as HTMLAnchorElement | undefined;

    expect(forgotLink).toBeTruthy();
    expect(forgotLink?.getAttribute('href')).toContain('/reset-password');
  });

  it('opens the signup modal when the auth query param is present', async () => {
    await renderSignupModal();

    const modal = document.body.querySelector('app-viewport-dialog');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Start your organization');
  });

  it('renders the signup form with novalidate and keeps the submit button usable before requests', async () => {
    await renderSignupModal();

    const form = signupForm();
    const button = signupSubmitButton();
    const note = document.body.querySelector('.trial-note')?.textContent ?? '';

    expect(form.hasAttribute('novalidate')).toBe(true);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Create account');
    expect(note).toContain('Create your account, then set up your organization in the next step.');
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

  it('shows inline errors and does not call the registration API on a real blank submit', async () => {
    await renderSignupModal();

    const form = signupForm();
    const button = signupSubmitButton();

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(component.submitting).toBe(false);
    expect(component.signupTouched).toEqual({
      firstName: true,
      lastName: true,
      email: true,
      password: true
    });
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('First name is required.');
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(document.body.querySelector('#signup-email-error')?.textContent).toContain('Email address is required.');
    expect(document.body.querySelector('#signup-password-error')?.textContent).toContain('Password is required.');
    expect(document.activeElement?.getAttribute('name')).toBe('firstName');
  });

  it('shows inline errors and does not call the registration API on a real invalid submit', async () => {
    await renderSignupModal();

    await setSignupInputValue('firstName', 'John!');
    await setSignupInputValue('lastName', '');
    await setSignupInputValue('email', 'invalid-email');
    await setSignupInputValue('password', '1234567890');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('Enter a valid first name.');
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(document.body.querySelector('#signup-email-error')?.textContent).toContain('Enter a valid email address.');
    expect(document.body.querySelector('#signup-password-error')?.textContent).toContain(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );
  });

  it('clears the last name inline error immediately after valid input without another blur or submit', async () => {
    await renderSignupModal();

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const lastNameInput = document.body.querySelector('input[name="lastName"]') as HTMLInputElement;
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(lastNameInput.getAttribute('aria-invalid')).toBe('true');
    expect(lastNameInput.getAttribute('aria-describedby')).toBe('signup-last-name-error');

    await setSignupInputValue('lastName', 'Carter');

    expect(document.body.querySelector('#signup-last-name-error')).toBeNull();
    expect(lastNameInput.getAttribute('aria-invalid')).toBeNull();
    expect(lastNameInput.getAttribute('aria-describedby')).toBeNull();
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('First name is required.');
  });

  it('submits normalized signup data from a real valid form submit', async () => {
    await renderSignupModal();

    await setSignupInputValue('firstName', '  Abdul   Rhman ');
    await setSignupInputValue('lastName', " O'Connor ");
    await setSignupInputValue('email', ' owner@gmail.com ');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.signup).toHaveBeenCalledWith({
      email: 'owner@gmail.com',
      password: 'ValidPass123',
      first_name: 'Abdul Rhman',
      last_name: "O'Connor"
    });
  });

  it('maps duplicate-email signup failures to the exact safe copy and shows a login action', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({
        status: 409,
        error: {
          errors: [
            {
              message: 'INVALID_PROVIDER duplicate directus detail'
            }
          ]
        }
      }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Abdul');
    await setSignupInputValue('lastName', 'Rhman');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    expect(text).toContain('An account already exists for this email. Sign in instead.');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(component.duplicateSignupRecovery).toBe(true);
    expect(component.login.email).toBe('owner@gmail.com');
    expect(
      Array.from(document.body.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Log in')
    ).toBe(true);
  });

  it('shows only the generic login failure copy for bad credentials', async () => {
    authSpy.login = vi.fn(() =>
      throwError(() => ({
        status: 401,
        error: {
          errors: [
            {
              message: 'INVALID_PROVIDER'
            }
          ]
        }
      }))
    );

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'WrongPassword123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Email or password is incorrect.');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('Directus');
  });

  it('keeps the normal successful login path unchanged', async () => {
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'ValidPass123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(authSpy.login).toHaveBeenCalledWith('owner@gmail.com', 'ValidPass123');
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/app/workspace-access', { replaceUrl: true });
  });
});
