import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
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

  beforeEach(async () => {
    routeStub = {
      snapshot: {
        queryParamMap: convertToParamMap({})
      }
    };

    authSpy = {
      requestPasswordReset: vi.fn(() => of(null)),
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

  async function renderRequestScreen(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function renderResetScreen(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({ token: 'reset-token' });
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setInputValue(name: string, value: string): Promise<void> {
    const input = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the same generic confirmation for 204 reset-link requests', async () => {
    await renderRequestScreen();
    await setInputValue('resetEmail', 'owner@example.com');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authSpy.requestPasswordReset).toHaveBeenCalledWith('owner@example.com');
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for this email, you’ll receive a reset link shortly.'
    );
  });

  it('shows the same generic confirmation for expected account-not-found responses', async () => {
    authSpy.requestPasswordReset = vi.fn(() =>
      throwError(() => ({
        status: 404,
        error: {
          errors: [{ message: 'User not found' }]
        }
      }))
    );

    await renderRequestScreen();
    await setInputValue('resetEmail', 'missing@example.com');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for this email, you’ll receive a reset link shortly.'
    );
  });

  it('does not render raw backend request errors into the DOM', async () => {
    authSpy.requestPasswordReset = vi.fn(() =>
      throwError(() => ({
        status: 500,
        error: {
          errors: [{ message: 'DIRECTUS raw failure INVALID_PROVIDER token=abc' }]
        }
      }))
    );

    await renderRequestScreen();
    await setInputValue('resetEmail', 'owner@example.com');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Unable to send a reset link right now. Please try again.');
    expect(text).not.toContain('DIRECTUS');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('token=abc');
  });

  it('does not call the request endpoint for invalid email input', async () => {
    await renderRequestScreen();
    await setInputValue('resetEmail', 'owner@invalid');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(authSpy.requestPasswordReset).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#reset-email-error')?.textContent).toContain('Enter a valid email address.');
    expect(document.activeElement?.getAttribute('name')).toBe('resetEmail');
  });

  it('blocks reset submission when the password rule fails or confirmation mismatches', async () => {
    await renderResetScreen();
    await setInputValue('newPassword', 'short');
    await setInputValue('confirmPassword', 'different');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

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
    await setInputValue('newPassword', 'ValidPass123');
    await setInputValue('confirmPassword', 'ValidPass123');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.resetPassword).toHaveBeenCalledWith('reset-token', 'ValidPass123');
  });

  it('removes the token from history and redirects to login with the exact notice after a successful reset', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await renderResetScreen();
    await setInputValue('newPassword', 'ValidPass123');
    await setInputValue('confirmPassword', 'ValidPass123');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
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
    await setInputValue('newPassword', 'ValidPass123');
    await setInputValue('confirmPassword', 'ValidPass123');

    fixture.nativeElement.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

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
