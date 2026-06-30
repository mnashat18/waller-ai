import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostBinding, Input, OnDestroy, OnChanges, SimpleChanges, ViewChild } from '@angular/core';

import { PostAuthWelcomeIntent, PostAuthWelcomeService } from '../../../services/post-auth-welcome.service';

@Component({
  selector: 'app-post-auth-welcome',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section
      *ngIf="showing && activeIntent"
      class="post-auth-welcome"
      [class.is-visible]="isVisible"
      role="status"
      aria-live="polite"
      aria-atomic="true">
      <div class="post-auth-welcome__card">
        <span class="post-auth-welcome__icon" aria-hidden="true">&#10003;</span>

        <div class="post-auth-welcome__copy">
          <p class="post-auth-welcome__eyebrow">Welcome</p>
          <h2 #heading tabindex="-1">{{ headingText }}</h2>
          <p>{{ bodyText }}</p>
        </div>

        <button type="button" class="post-auth-welcome__dismiss" (click)="dismiss()" aria-label="Dismiss welcome">
          Dismiss
        </button>
      </div>
    </section>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 40;
      display: block;
      width: min(24rem, calc(100vw - 2rem));
      pointer-events: none;
    }

    .post-auth-welcome {
      pointer-events: auto;
      opacity: 0;
      transform: translate3d(0, -0.45rem, 0);
      transition: opacity 280ms ease, transform 280ms ease;
    }

    :host(.is-reduced-motion) .post-auth-welcome {
      transition: opacity 180ms ease;
      transform: none;
    }

    .post-auth-welcome.is-visible {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }

    .post-auth-welcome__card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.85rem;
      align-items: start;
      padding: 1rem 1rem 0.95rem;
      border: 1px solid rgba(125, 211, 252, 0.2);
      border-radius: 1rem;
      background:
        linear-gradient(180deg, rgba(8, 12, 24, 0.96), rgba(11, 17, 33, 0.94));
      box-shadow: 0 22px 48px rgba(2, 6, 23, 0.32);
      backdrop-filter: blur(12px);
    }

    .post-auth-welcome__icon {
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: rgba(34, 197, 94, 0.16);
      color: #86efac;
      font-size: 1rem;
      font-weight: 800;
      margin-top: 0.1rem;
    }

    .post-auth-welcome__copy {
      min-width: 0;
    }

    .post-auth-welcome__eyebrow {
      margin: 0 0 0.24rem;
      color: rgba(125, 211, 252, 0.9);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h2 {
      margin: 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: 1rem;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    p {
      margin: 0.35rem 0 0;
      color: rgba(226, 232, 240, 0.78);
      font-size: 0.88rem;
      line-height: 1.5;
    }

    .post-auth-welcome__dismiss {
      border: 0;
      background: transparent;
      color: rgba(226, 232, 240, 0.8);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0.1rem 0.1rem 0.25rem;
      white-space: nowrap;
      transition: color 120ms ease;
    }

    .post-auth-welcome__dismiss:hover,
    .post-auth-welcome__dismiss:focus-visible {
      color: #f8fafc;
    }

    .post-auth-welcome__dismiss:focus-visible {
      outline: 2px solid rgba(125, 211, 252, 0.7);
      outline-offset: 2px;
      border-radius: 0.5rem;
    }

    @media (max-width: 640px) {
      :host {
        left: 1rem;
        right: 1rem;
        width: auto;
      }

      .post-auth-welcome__card {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .post-auth-welcome__dismiss {
        grid-column: 2;
        justify-self: start;
        padding-left: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .post-auth-welcome {
        transition: opacity 180ms ease;
        transform: none;
      }

      .post-auth-welcome.is-visible {
        transform: none;
      }
    }
  `]
})
export class PostAuthWelcomeComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('heading') private heading?: ElementRef<HTMLHeadingElement>;
  @Input() intent: PostAuthWelcomeIntent | null = null;

  showing = false;
  isVisible = false;
  activeIntent: PostAuthWelcomeIntent | null = null;
  readonly reducedMotion = this.prefersReducedMotion();

  private pendingIntent: PostAuthWelcomeIntent | null = null;
  private enterTimer?: ReturnType<typeof setTimeout>;
  private dismissTimer?: ReturnType<typeof setTimeout>;
  private showTimer?: ReturnType<typeof setTimeout>;

  constructor(private welcome: PostAuthWelcomeService) {}

  @HostBinding('class.is-reduced-motion')
  get reducedMotionClass(): boolean {
    return this.reducedMotion;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['intent']) {
      return;
    }

    const current = changes['intent'].currentValue as PostAuthWelcomeIntent | null;
    if (!current) {
      this.clearTimers();
      if (!this.showing) {
        this.isVisible = false;
        this.activeIntent = null;
        this.pendingIntent = null;
      }
      return;
    }

    this.clearTimers();
    this.pendingIntent = current;
    this.showTimer = setTimeout(() => this.show(this.pendingIntent ?? current), 0);
  }

  ngAfterViewInit(): void {
    if (this.showing && this.activeIntent) {
      this.scheduleFocus();
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  dismiss(): void {
    this.welcome.clear();
    this.clearTimers();
    this.showing = false;
    this.isVisible = false;
    this.activeIntent = null;
    this.pendingIntent = null;
    this.intent = null;
  }

  get headingText(): string {
    const intent = this.activeIntent ?? this.intent;
    if (!intent) {
      return '';
    }

    if (intent.kind === 'invite') {
      return `Welcome to ${intent.organizationName ?? 'your organization'}`;
    }

    const firstName = intent.firstName ?? 'there';
    return intent.kind === 'workspace'
      ? `Welcome to Wellar, ${firstName}`
      : `Welcome back, ${firstName}`;
  }

  get bodyText(): string {
    const intent = this.activeIntent ?? this.intent;
    if (!intent) {
      return '';
    }

    if (intent.kind === 'invite') {
      return 'Your access is ready.';
    }

    return intent.kind === 'workspace'
      ? 'Your workspace is ready to go.'
      : 'Your workspace is ready.';
  }

  private show(intent: PostAuthWelcomeIntent): void {
    this.clearTimers();
    this.intent = intent;
    this.activeIntent = intent;
    this.pendingIntent = null;
    this.showing = true;
    this.isVisible = false;
    this.welcome.clear();

    this.enterTimer = setTimeout(() => {
      this.isVisible = true;
      this.scheduleFocus();
    }, 20);

    this.dismissTimer = setTimeout(() => this.dismiss(), 3200);
  }

  private scheduleFocus(): void {
    setTimeout(() => {
      try {
        this.heading?.nativeElement.focus({ preventScroll: true });
      } catch {
        // ignore focus failures
      }
    }, 0);
  }

  private clearTimers(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
    }

    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = undefined;
    }

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
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
