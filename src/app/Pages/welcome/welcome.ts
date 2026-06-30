import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, HostBinding, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { PostAuthWelcomeIntent, PostAuthWelcomeService } from '../../services/post-auth-welcome.service';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="welcome-page" role="status" aria-live="polite" aria-atomic="true">
      <div class="welcome-page__ambient" aria-hidden="true"></div>

      <div class="welcome-page__panel">
        <div class="welcome-page__mark" aria-hidden="true">
          <span class="welcome-page__mark-core"></span>
        </div>

        <p class="welcome-page__eyebrow">{{ eyebrow }}</p>
        <h1>{{ headingText }}</h1>
        <p class="welcome-page__body">{{ bodyText }}</p>

        <div class="welcome-page__progress" aria-live="polite">
          <span class="welcome-page__progress-label">{{ countdownLabel }}</span>
          <button
            type="button"
            class="welcome-page__enter"
            (click)="enterWorkspace()"
            [disabled]="isEntering">
            Enter workspace
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background:
        radial-gradient(72rem circle at 18% 8%, rgba(56, 189, 248, 0.12), transparent 42%),
        radial-gradient(56rem circle at 100% 0%, rgba(99, 102, 241, 0.18), transparent 40%),
        radial-gradient(40rem circle at 78% 100%, rgba(240, 189, 95, 0.08), transparent 44%),
        linear-gradient(180deg, #050814 0%, #070c18 48%, #090f1d 100%);
      color: #f8fbff;
      isolation: isolate;
    }

    .welcome-page {
      position: relative;
      min-height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      padding: clamp(1.25rem, 4vw, 3rem);
    }

    .welcome-page__ambient {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(36rem circle at 8% 18%, rgba(56, 189, 248, 0.12), transparent 62%),
        radial-gradient(32rem circle at 92% 20%, rgba(99, 102, 241, 0.16), transparent 64%),
        radial-gradient(24rem circle at 50% 88%, rgba(240, 189, 95, 0.08), transparent 68%);
      opacity: 0.9;
    }

    .welcome-page__panel {
      position: relative;
      z-index: 1;
      width: min(36rem, 100%);
      display: grid;
      justify-items: center;
      text-align: center;
      gap: 0.9rem;
      padding: clamp(1.5rem, 4vw, 2.35rem);
      border-radius: 1.4rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background:
        linear-gradient(180deg, rgba(8, 12, 24, 0.82), rgba(6, 10, 20, 0.88));
      box-shadow:
        0 28px 72px rgba(2, 6, 23, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
      animation: welcome-page-enter 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    :host(.is-reduced-motion) .welcome-page__panel,
    :host(.is-reduced-motion) .welcome-page__enter {
      transition: opacity 180ms ease;
      transform: none;
      animation: none;
    }

    .welcome-page__mark {
      width: 3.5rem;
      height: 3.5rem;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 1px solid rgba(125, 211, 252, 0.24);
      background: linear-gradient(180deg, rgba(14, 165, 233, 0.22), rgba(15, 23, 42, 0.72));
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.03), 0 16px 36px rgba(14, 165, 233, 0.16);
    }

    .welcome-page__mark-core {
      width: 1.15rem;
      height: 1.15rem;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #f8fbff, #9ed8eb 52%, #38bdf8 100%);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.42);
    }

    .welcome-page__eyebrow {
      margin: 0;
      color: #9ed8eb;
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: #f8fbff;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: clamp(2rem, 4vw, 3.35rem);
      line-height: 1.04;
      letter-spacing: -0.05em;
      text-wrap: balance;
    }

    .welcome-page__body {
      margin: 0;
      max-width: 26rem;
      color: rgba(226, 232, 240, 0.8);
      font-size: 1.02rem;
      line-height: 1.68;
    }

    .welcome-page__progress {
      width: 100%;
      display: grid;
      justify-items: center;
      gap: 0.9rem;
      margin-top: 0.35rem;
    }

    .welcome-page__progress-label {
      color: rgba(226, 232, 240, 0.74);
      font-size: 0.92rem;
      line-height: 1.45;
    }

    .welcome-page__enter {
      min-width: 13rem;
      min-height: 2.9rem;
      border: 1px solid rgba(240, 189, 95, 0.12);
      border-radius: 999px;
      background: linear-gradient(135deg, #f6ca68, #e99c2f);
      color: #08111f;
      font-size: 0.94rem;
      font-weight: 800;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 18px 40px rgba(233, 156, 47, 0.22);
      transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
    }

    .welcome-page__enter:hover {
      transform: translateY(-1px);
      box-shadow: 0 22px 46px rgba(233, 156, 47, 0.28);
    }

    .welcome-page__enter:focus-visible {
      outline: 2px solid rgba(125, 211, 252, 0.7);
      outline-offset: 3px;
    }

    .welcome-page__enter:disabled {
      cursor: not-allowed;
      opacity: 0.72;
    }

    @media (max-width: 640px) {
      .welcome-page {
        padding: 1rem;
      }

      .welcome-page__panel {
        width: 100%;
        border-radius: 1.2rem;
      }

      .welcome-page__enter {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .welcome-page__panel,
      .welcome-page__enter {
        transition: opacity 180ms ease;
        transform: none;
        animation: none;
      }
    }

    @keyframes welcome-page-enter {
      from {
        opacity: 0;
        transform: translate3d(0, 14px, 0) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }
  `]
})
export class WelcomePageComponent implements OnInit, OnDestroy {
  @HostBinding('class.is-reduced-motion')
  readonly reducedMotion = this.prefersReducedMotion();

  isEntering = false;
  private intent: PostAuthWelcomeIntent | null = null;
  private countdownSeconds = 5;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private enterTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private router: Router,
    private postAuthWelcome: PostAuthWelcomeService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.intent = this.postAuthWelcome.consumeWelcome();
    if (!this.intent) {
      void this.redirectSafely();
      return;
    }

    this.countdownSeconds = 5;

    this.ngZone.runOutsideAngular(() => {
      this.enterTimer = setTimeout(() => {
        void this.enterWorkspace();
      }, 5000);

      this.countdownTimer = setInterval(() => {
        if (this.countdownSeconds <= 1) {
          this.countdownSeconds = 0;
          this.clearCountdownTimer();
          this.cdr.detectChanges();
          return;
        }

        this.countdownSeconds -= 1;
        this.cdr.detectChanges();
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    this.clearCountdownTimer();
    this.clearEnterTimer();
  }

  get eyebrow(): string {
    if (this.intent?.kind === 'invite') {
      return 'Invite accepted';
    }

    if (this.intent?.kind === 'workspace') {
      return 'Workspace ready';
    }

    return 'Welcome back';
  }

  get headingText(): string {
    if (!this.intent) {
      return '';
    }

    if (this.intent.kind === 'invite') {
      return `Welcome to ${this.intent.organizationName ?? 'your organization'}`;
    }

    const firstName = this.intent.firstName ?? 'there';
    return this.intent.kind === 'workspace'
      ? `Welcome to Wellar, ${firstName}`
      : `Welcome back, ${firstName}`;
  }

  get bodyText(): string {
    if (!this.intent) {
      return '';
    }

    if (this.intent.kind === 'invite') {
      return 'Your access is ready.';
    }

    return this.intent.kind === 'workspace'
      ? 'Your workspace is ready to go.'
      : 'Your workspace is ready.';
  }

  get countdownLabel(): string {
    return this.countdownSeconds > 0
      ? `Opening your workspace in ${this.countdownSeconds}s`
      : 'Opening your workspace';
  }

  async enterWorkspace(): Promise<void> {
    if (!this.intent || this.isEntering) {
      return;
    }

    await this.ngZone.run(async () => {
      this.isEntering = true;
      this.clearCountdownTimer();
      this.clearEnterTimer();
      this.cdr.detectChanges();

      const nextRoute = this.intent?.destinationRoute || '/app/dashboard';
      try {
        await this.router.navigateByUrl(nextRoute, { replaceUrl: true });
      } finally {
        this.postAuthWelcome.clear();
        this.isEntering = false;
        this.cdr.detectChanges();
      }
    });
  }

  private async redirectSafely(): Promise<void> {
    try {
      const fallback = await this.router.navigateByUrl('/app/dashboard', { replaceUrl: true });
      if (!fallback) {
        await this.router.navigateByUrl('/app/workspace-access', { replaceUrl: true });
      }
    } catch {
      await this.router.navigateByUrl('/app/workspace-access', { replaceUrl: true });
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  }

  private clearEnterTimer(): void {
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = undefined;
    }
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
