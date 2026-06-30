import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { PostAuthWelcomeService } from '../../services/post-auth-welcome.service';
import { WelcomePageComponent } from './welcome';

describe('WelcomePageComponent', () => {
  let fixture: ComponentFixture<WelcomePageComponent>;
  let routerSpy: { navigateByUrl: ReturnType<typeof vi.fn> };
  let welcomeService: PostAuthWelcomeService;
  const matchMediaMock = vi.fn();

  beforeEach(async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    });

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMediaMock
    });

    routerSpy = {
      navigateByUrl: vi.fn(() => Promise.resolve(true))
    };

    await TestBed.configureTestingModule({
      imports: [WelcomePageComponent],
      providers: [
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  function createWithIntent(intent: { kind: 'returning' | 'workspace' | 'invite'; firstName: string | null; organizationName: string | null; destinationRoute: string }): void {
    welcomeService = TestBed.inject(PostAuthWelcomeService);
    if (intent.kind === 'returning') {
      welcomeService.queueReturningWelcome(intent.firstName, intent.destinationRoute);
    } else if (intent.kind === 'workspace') {
      welcomeService.queueWorkspaceWelcome(intent.firstName, intent.destinationRoute);
    } else {
      welcomeService.queueInviteWelcome(intent.organizationName, intent.destinationRoute);
    }

    fixture = TestBed.createComponent(WelcomePageComponent);
  }

  it('shows the returning welcome copy and counts down to the destination once', async () => {
    vi.useFakeTimers();
    createWithIntent({
      kind: 'returning',
      firstName: 'Avery',
      organizationName: null,
      destinationRoute: '/app/dashboard'
    });

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Welcome back, Avery');
    expect(host.textContent).toContain('Your workspace is ready.');
    expect(host.textContent).toContain('Opening your workspace in 5s');

    await vi.advanceTimersByTimeAsync(1000);
    expect(host.textContent).toContain('Opening your workspace in 4s');

    await vi.advanceTimersByTimeAsync(4000);
    await fixture.whenStable();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect(welcomeService.consumeWelcome()).toBeNull();
  });

  it('shows workspace and invite copy with the exact destination handoff', async () => {
    vi.useFakeTimers();

    createWithIntent({
      kind: 'workspace',
      firstName: 'Avery',
      organizationName: null,
      destinationRoute: '/app/workspace-access'
    });

    fixture.detectChanges();

    let host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Welcome to Wellar, Avery');
    expect(host.textContent).toContain('Your workspace is ready to go.');

    fixture.destroy();

    createWithIntent({
      kind: 'invite',
      firstName: null,
      organizationName: 'Northwind Logistics',
      destinationRoute: '/app/dashboard'
    });

    fixture.detectChanges();

    host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Welcome to Northwind Logistics');
    expect(host.textContent).toContain('Your access is ready.');
  });

  it('enters the workspace immediately when the primary action is clicked', async () => {
    createWithIntent({
      kind: 'returning',
      firstName: 'Avery',
      organizationName: null,
      destinationRoute: '/app/dashboard'
    });

    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.welcome-page__enter') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
  });

  it('redirects safely when no welcome intent is available and does not replay after refresh', async () => {
    createWithIntent({
      kind: 'returning',
      firstName: 'Avery',
      organizationName: null,
      destinationRoute: '/app/dashboard'
    });

    fixture.detectChanges();
    await fixture.whenStable();
    expect(welcomeService.consumeWelcome()).toBeNull();

    fixture.destroy();
    fixture = TestBed.createComponent(WelcomePageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/dashboard', { replaceUrl: true });
    expect((fixture.nativeElement as HTMLElement).textContent ?? '').not.toContain('Welcome back, Avery');
  });

  it('applies the reduced-motion presentation contract', async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    });

    createWithIntent({
      kind: 'returning',
      firstName: 'Avery',
      organizationName: null,
      destinationRoute: '/app/dashboard'
    });

    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('is-reduced-motion')).toBe(true);
  });
});
