import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../../services/auth';
import { ResetPasswordComponent } from './reset-password';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  let routeStub: {
    snapshot: {
      queryParamMap: ReturnType<typeof convertToParamMap>;
    };
  };
  let authSpy: {
    requestPasswordReset: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    setAuthNotice: ReturnType<typeof vi.fn>;
  };
  let requestResetSubject: Subject<unknown>;
  let cooldownTick: (() => void) | null;

  beforeEach(async () => {
    routeStub = {
      snapshot: {
        queryParamMap: convertToParamMap({})
      }
    };

    requestResetSubject = new Subject<unknown>();
    cooldownTick = null;

    authSpy = {
      requestPasswordReset: vi.fn(() => requestResetSubject.asObservable()),
      resetPassword: vi.fn(() => of(null)),
      setAuthNotice: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: AuthService, useValue: authSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderRequestScreen(): Promise<void> {
    fixture.destroy();
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function renderRequestScreenSync(): void {
    fixture.destroy();
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  async function renderResetScreen(): Promise<void> {
    fixture.destroy();
    routeStub.snapshot.queryParamMap = convertToParamMap({ token: 'reset-token' });
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function resolveRequestSuccess(): void {
    requestResetSubject.next(null);
    requestResetSubject.complete();
  }

  function resolveRequestError(error: unknown): void {
    requestResetSubject.error(error);
  }

  function setInputValue(name: string, value: string): void {
    const input = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (name === 'resetEmail') {
      component.email = value;
    } else if (name === 'newPassword') {
      component.password = value;
    } else if (name === 'confirmPassword') {
      component.confirmPassword = value;
    }
    fixture.detectChanges();
  }

  function flushRequestTransition(): void {
    fixture.detectChanges();
  }

  function submitRequestForm(): void {
    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  async function submitVisibleForm(): Promise<void> {
    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function clickButton(label: string): void {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (candidate) => (candidate as HTMLButtonElement).textContent?.trim() === label
    ) as HTMLButtonElement | undefined;

    button?.click();
    fixture.detectChanges();
  }

  function findButtonStartsWith(prefix: string): HTMLButtonElement | undefined {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (candidate) => (candidate as HTMLButtonElement).textContent?.trim().startsWith(prefix)
    ) as HTMLButtonElement | undefined;
  }

  function controlCooldownInterval(): void {
    const setIntervalDelegate = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler: TimerHandler, timeout?: number, ...args: any[]): number => {
      if (timeout === 1000) {
        cooldownTick = typeof handler === 'function' ? () => handler(...args) : null;
        return 1;
      }

      return setIntervalDelegate(handler, timeout, ...args);
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
  }

  function advanceCooldownSeconds(seconds: number): void {
    for (let i = 0; i < seconds; i += 1) {
      if (cooldownTick) {
        cooldownTick();
      } else if (component.resendCountdown <= 1) {
        component.resendCountdown = 0;
      } else {
        component.resendCountdown -= 1;
      }
    }
  }

  function renderTimerState(): void {
    fixture.componentRef.changeDetectorRef.detectChanges();
  }

  it('shows the exact success state for 204 reset-link requests and clears the raw input', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'owner@example.com');

    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();

    expect(authSpy.requestPasswordReset).toHaveBeenCalledWith('owner@example.com');
    expect(fixture.nativeElement.textContent).toContain('Check your inbox');
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for owne••••••@example.com, you’ll receive a reset link shortly.'
    );
    expect(fixture.nativeElement.querySelector('input[name="resetEmail"]')).toBeNull();
    expect(component.email).toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('owner@example.com');
  });

  it('shows the exact same success state for expected account-not-found responses', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'missing@example.com');

    submitRequestForm();
    resolveRequestError({
      status: 404,
      error: {
        errors: [{ message: 'User not found' }]
      }
    });
    flushRequestTransition();

    expect(fixture.nativeElement.textContent).toContain('Check your inbox');
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for miss••••••@example.com, you’ll receive a reset link shortly.'
    );
  });

  it('masks normalized emails with a fixed six-bullet suffix', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', '  mnashat2508@gmail.com  ');
    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for mnas••••••@gmail.com, you’ll receive a reset link shortly.'
    );

    clickButton('Use a different email');
    requestResetSubject = new Subject<unknown>();
    authSpy.requestPasswordReset.mockImplementation(() => requestResetSubject.asObservable());
    setInputValue('resetEmail', 'ab@gmail.com');
    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for ab••••••@gmail.com, you’ll receive a reset link shortly.'
    );

    clickButton('Use a different email');
    requestResetSubject = new Subject<unknown>();
    authSpy.requestPasswordReset.mockImplementation(() => requestResetSubject.asObservable());
    setInputValue('resetEmail', 'a@company.com');
    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for a••••••@company.com, you’ll receive a reset link shortly.'
    );
  });

  it('never renders the full email in the success DOM', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'mnashat2508@gmail.com');

    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).not.toContain('mnashat2508@gmail.com');
  });

  it('returns to a blank request form when using a different email', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'owner@example.com');

    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    clickButton('Use a different email');

    const input = fixture.nativeElement.querySelector('input[name="resetEmail"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe('');
    expect(component.email).toBe('');
  });

  it('disables resend for 60 seconds, then enables it', async () => {
    vi.useFakeTimers();
    controlCooldownInterval();
    renderRequestScreenSync();
    setInputValue('resetEmail', 'owner@example.com');

    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();

    let resend = findButtonStartsWith('Resend link') as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    expect(resend.textContent?.trim()).toBe('Resend link in 60s');

    advanceCooldownSeconds(59);
    renderTimerState();
    resend = findButtonStartsWith('Resend link') as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    expect(resend.textContent?.trim()).toBe('Resend link in 1s');

    advanceCooldownSeconds(1);
    renderTimerState();
    resend = findButtonStartsWith('Resend link') as HTMLButtonElement;
    expect(resend.disabled).toBe(false);
    expect(resend.textContent?.trim()).toBe('Resend link');
  });

  it('restarts the cooldown and resends the same trusted request contract', async () => {
    vi.useFakeTimers();
    controlCooldownInterval();
    renderRequestScreenSync();
    setInputValue('resetEmail', ' owner@example.com ');

    submitRequestForm();
    resolveRequestSuccess();
    flushRequestTransition();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    advanceCooldownSeconds(60);
    renderTimerState();

    requestResetSubject = new Subject<unknown>();
    authSpy.requestPasswordReset.mockImplementation(() => requestResetSubject.asObservable());
    const resend = findButtonStartsWith('Resend link') as HTMLButtonElement;
    resend.click();
    fixture.detectChanges();
    resolveRequestSuccess();
    renderTimerState();

    expect(authSpy.requestPasswordReset).toHaveBeenNthCalledWith(1, 'owner@example.com');
    expect(authSpy.requestPasswordReset).toHaveBeenNthCalledWith(2, 'owner@example.com');

    const cooldownButton = findButtonStartsWith('Resend link in') as HTMLButtonElement;
    expect(cooldownButton.disabled).toBe(true);
    expect(cooldownButton.textContent?.trim()).toBe('Resend link in 60s');
  });

  it('does not render raw backend request errors into the DOM', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'owner@example.com');

    submitRequestForm();
    resolveRequestError({
      status: 500,
      error: {
        errors: [{ message: 'DIRECTUS raw failure INVALID_PROVIDER token=abc' }]
      }
    });
    flushRequestTransition();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Unable to send a reset link right now. Please try again.');
    expect(text).not.toContain('DIRECTUS');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('token=abc');
  });

  it('does not call the request endpoint for invalid email input', async () => {
    await renderRequestScreen();
    setInputValue('resetEmail', 'owner@invalid');

    await submitVisibleForm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(authSpy.requestPasswordReset).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#reset-email-error')?.textContent).toContain('Enter a valid email address.');
    expect(document.activeElement?.getAttribute('name')).toBe('resetEmail');
  });

  it('blocks reset submission when the password rule fails or confirmation mismatches', async () => {
    await renderResetScreen();
    setInputValue('newPassword', 'short');
    setInputValue('confirmPassword', 'different');

    await submitVisibleForm();

    expect(authSpy.resetPassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#reset-password-error')?.textContent).toContain(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );
    expect(fixture.nativeElement.querySelector('#reset-confirm-password-error')?.textContent).toContain(
      'Passwords do not match.'
    );
  });

  it('calls the reset endpoint with the token and valid password', async () => {
    await renderResetScreen();
    setInputValue('newPassword', 'ValidPass123');
    setInputValue('confirmPassword', 'ValidPass123');

    await submitVisibleForm();

    expect(authSpy.resetPassword).toHaveBeenCalledWith('reset-token', 'ValidPass123');
  });

  it('removes the token from history and redirects to login with the exact notice after a successful reset', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await renderResetScreen();
    setInputValue('newPassword', 'ValidPass123');
    setInputValue('confirmPassword', 'ValidPass123');

    await submitVisibleForm();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authSpy.setAuthNotice).toHaveBeenCalledWith('Password updated. Sign in with your new password.');
    expect(navigateSpy).toHaveBeenCalledWith(['/'], {
      queryParams: { auth: 'login' },
      replaceUrl: true
    });
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
  });

  it('shows the exact safe invalid-link recovery message and request-new-link action', async () => {
    authSpy.resetPassword = vi.fn(() =>
      throwError(() => ({
        status: 400,
        error: {
          errors: [{ message: 'Token expired INVALID_PROVIDER reset-token' }]
        }
      }))
    );

    await renderResetScreen();
    setInputValue('newPassword', 'ValidPass123');
    setInputValue('confirmPassword', 'ValidPass123');

    await submitVisibleForm();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('This reset link is invalid or has expired. Request a new link.');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('reset-token');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).some(
        (button) => (button as HTMLButtonElement).textContent?.trim() === 'Request a new link'
      )
    ).toBe(true);
  });
});
