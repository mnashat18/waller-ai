import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PostAuthWelcomeService } from '../../../services/post-auth-welcome.service';
import { PostAuthWelcomeComponent } from './post-auth-welcome.component';

describe('PostAuthWelcomeComponent', () => {
  let fixture: ComponentFixture<PostAuthWelcomeComponent>;
  let service: PostAuthWelcomeService;
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

    await TestBed.configureTestingModule({
      imports: [PostAuthWelcomeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PostAuthWelcomeComponent);
    service = TestBed.inject(PostAuthWelcomeService);
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('shows the welcome card once and consumes the queued intent', async () => {
    service.queueReturningWelcome('Avery');
    fixture.componentInstance.activeIntent = service.consumeWelcome();
    fixture.componentInstance.showing = true;
    fixture.componentInstance.isVisible = true;

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Welcome back, Avery');
    expect(host.textContent).toContain('Your workspace is ready.');
    expect(service.consumeWelcome()).toBeNull();
  });

  it('dismisses the card without leaving a pending intent behind', async () => {
    service.queueWorkspaceWelcome('Avery');
    fixture.componentInstance.activeIntent = service.consumeWelcome();
    fixture.componentInstance.showing = true;
    fixture.componentInstance.isVisible = true;

    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.post-auth-welcome__dismiss') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Welcome to Wellar, Avery');
    expect(service.consumeWelcome()).toBeNull();
  });

  it('applies the reduced-motion presentation contract when motion is reduced', async () => {
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

    fixture.destroy();
    fixture = TestBed.createComponent(PostAuthWelcomeComponent);
    service = TestBed.inject(PostAuthWelcomeService);
    service.queueInviteWelcome('Wellar');
    fixture.componentInstance.activeIntent = service.consumeWelcome();
    fixture.componentInstance.showing = true;
    fixture.componentInstance.isVisible = true;

    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('is-reduced-motion')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Welcome to Wellar');
  });
});
