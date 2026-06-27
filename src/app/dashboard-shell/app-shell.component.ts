import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet
} from '@angular/router';
import { Subscription } from 'rxjs';

import { CompanyContextService } from '../core/context/company-context.service';
import { isAuthOnlyRoute } from '../core/guards/dashboard-access.guards';
import { getWorkspaceRouteByUrlPath } from '../ia/wellar-ia';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div
      class="app-shell"
      [class.is-sidebar-open]="mobileSidebarOpen"
      [class.is-mobile-shell]="isMobileViewport"
      *ngIf="!isAuthOnlyRouteActive">
      <ng-container *ngIf="shellMounted; else workspaceLoading">
      <div class="app-shell__ambient" aria-hidden="true">
        <span class="app-shell__orb app-shell__orb--a"></span>
        <span class="app-shell__orb app-shell__orb--b"></span>
        <span class="app-shell__orb app-shell__orb--c"></span>
      </div>

      <div class="app-shell__grid">
        <app-dashboard-sidebar
          *ngIf="!isMobileViewport || mobileSidebarOpen"
          id="app-sidebar-navigation"
          class="app-sidebar"
          (closeRequested)="closeMobileSidebar()">
        </app-dashboard-sidebar>
        <button
          type="button"
          class="app-sidebar-backdrop"
          aria-label="Close navigation"
          *ngIf="isMobileViewport && mobileSidebarOpen"
          (click)="closeMobileSidebar()">
        </button>

        <div
          class="app-main"
          [attr.inert]="isMobileViewport && mobileSidebarOpen ? '' : null"
          [attr.aria-hidden]="isMobileViewport && mobileSidebarOpen ? 'true' : null">
          <button
            type="button"
            #mobileMenuButton
            class="app-mobile-menu-button"
            aria-controls="app-sidebar-navigation"
            [attr.aria-expanded]="mobileSidebarOpen"
            (click)="toggleMobileSidebar()">
            <span aria-hidden="true"></span>
            <span>Menu</span>
          </button>

          <app-dashboard-topbar
            class="app-header"
            >
          </app-dashboard-topbar>

          <div class="app-breadcrumbs" *ngIf="breadcrumbs.length > 1">
            <nav>
              <ng-container *ngFor="let crumb of breadcrumbs; let last = last">
                <span [class.is-current]="last">{{ crumb }}</span>
                <span *ngIf="!last">/</span>
              </ng-container>
            </nav>
          </div>

          <main class="app-content">
            <div class="app-content-frame" [class.is-transitioning]="isTransitioning">
              <router-outlet></router-outlet>
            </div>
          </main>
        </div>
      </div>
      </ng-container>

      <ng-template #workspaceLoading>
        <div class="app-shell__loading">
          <div class="app-shell__loading-stage" role="status" aria-live="polite">
            <div class="app-shell__loader" aria-hidden="true">
              <span class="app-shell__loader-ring app-shell__loader-ring--outer"></span>
              <span class="app-shell__loader-ring app-shell__loader-ring--inner"></span>
              <span class="app-shell__loader-core"></span>
            </div>

            <div class="app-shell__loading-bars" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div class="app-shell__loading-copy">
              <p>{{ loadingTitle }}</p>
              <span>{{ loadingSubtitle }}</span>
            </div>

            <div *ngIf="showRetryAction" class="app-shell__loading-actions">
              <button type="button" class="app-shell__retry-button" (click)="retryWorkspaceBootstrap()">
                Retry
              </button>
            </div>
          </div>
        </div>
      </ng-template>
    </div>

    <router-outlet *ngIf="isAuthOnlyRouteActive"></router-outlet>
  `,
  styles: [`
    .app-shell__loading {
      position: relative;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2rem;
      overflow: hidden;
      isolation: isolate;
    }

    .app-shell__loading::before {
      content: '';
      position: absolute;
      inset: -22%;
      background:
        radial-gradient(42rem circle at 14% 18%, rgba(56, 189, 248, 0.2), transparent 62%),
        radial-gradient(38rem circle at 86% 18%, rgba(99, 102, 241, 0.18), transparent 62%),
        radial-gradient(34rem circle at 54% 84%, rgba(245, 196, 81, 0.12), transparent 62%);
      filter: blur(8px);
      animation: app-shell-loader-drift 10s ease-in-out infinite;
      z-index: 0;
      pointer-events: none;
    }

    .app-shell__loading-stage {
      position: relative;
      z-index: 1;
      width: min(28rem, 100%);
      padding: 1.6rem 1.25rem 1.4rem;
      border-radius: 1.5rem;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background:
        radial-gradient(circle at top left, rgba(125, 211, 252, 0.1), transparent 46%),
        linear-gradient(145deg, rgba(9, 14, 28, 0.92), rgba(8, 12, 24, 0.84));
      box-shadow:
        0 28px 70px rgba(2, 6, 23, 0.48),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(10px);
      display: grid;
      justify-items: center;
      gap: 0.9rem;
    }

    .app-shell__loader {
      position: relative;
      width: 6.4rem;
      height: 6.4rem;
      display: grid;
      place-items: center;
    }

    .app-shell__loader-ring {
      position: absolute;
      border-radius: 999px;
      border: 2px solid transparent;
      will-change: transform;
    }

    .app-shell__loader-ring--outer {
      inset: 0;
      border-top-color: rgba(125, 211, 252, 0.96);
      border-right-color: rgba(99, 102, 241, 0.88);
      animation: app-shell-loader-spin 1.15s linear infinite;
    }

    .app-shell__loader-ring--inner {
      inset: 0.82rem;
      border-top-color: rgba(245, 196, 81, 0.92);
      border-left-color: rgba(125, 211, 252, 0.72);
      animation: app-shell-loader-spin-reverse 1.75s linear infinite;
    }

    .app-shell__loader-core {
      width: 1.18rem;
      height: 1.18rem;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #f8fafc, #38bdf8 56%, #6366f1 100%);
      box-shadow:
        0 0 22px rgba(56, 189, 248, 0.6),
        0 0 44px rgba(99, 102, 241, 0.42);
      animation: app-shell-loader-pulse 1.1s ease-in-out infinite;
    }

    .app-shell__loading-bars {
      width: 8.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.34rem;
    }

    .app-shell__loading-bars > span {
      flex: 1;
      height: 0.3rem;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(125, 211, 252, 0.35), rgba(99, 102, 241, 0.95), rgba(245, 196, 81, 0.62));
      opacity: 0.38;
      animation: app-shell-loader-bars 1.2s ease-in-out infinite;
    }

    .app-shell__loading-bars > span:nth-child(2) {
      animation-delay: 0.18s;
    }

    .app-shell__loading-bars > span:nth-child(3) {
      animation-delay: 0.36s;
    }

    .app-shell__loading-copy {
      text-align: center;
      display: grid;
      gap: 0.32rem;
    }

    .app-shell__loading-copy p {
      margin: 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: clamp(1.02rem, 2.3vw, 1.3rem);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .app-shell__loading-copy span {
      color: rgba(226, 232, 240, 0.78);
      font-size: 0.86rem;
      line-height: 1.42;
      letter-spacing: 0.01em;
    }

    .app-shell__loading-actions {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .app-shell__retry-button {
      border: 1px solid rgba(125, 211, 252, 0.35);
      background: rgba(15, 23, 42, 0.8);
      color: #e2e8f0;
      border-radius: 999px;
      padding: 0.7rem 1.1rem;
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0;
      cursor: pointer;
      transition:
        transform 120ms ease,
        border-color 120ms ease,
        background-color 120ms ease;
    }

    .app-shell__retry-button:hover {
      transform: translateY(-1px);
      border-color: rgba(125, 211, 252, 0.65);
      background: rgba(15, 23, 42, 0.92);
    }

    .app-shell__retry-button:focus-visible {
      outline: 2px solid rgba(125, 211, 252, 0.85);
      outline-offset: 2px;
    }

    @keyframes app-shell-loader-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes app-shell-loader-spin-reverse {
      to {
        transform: rotate(-360deg);
      }
    }

    @keyframes app-shell-loader-pulse {
      0%,
      100% {
        transform: scale(0.9);
        opacity: 0.85;
      }
      50% {
        transform: scale(1.05);
        opacity: 1;
      }
    }

    @keyframes app-shell-loader-bars {
      0%,
      100% {
        transform: scaleX(0.86);
        opacity: 0.36;
      }
      50% {
        transform: scaleX(1);
        opacity: 0.95;
      }
    }

    @keyframes app-shell-loader-drift {
      0%,
      100% {
        transform: translate3d(0, 0, 0) scale(1);
      }
      50% {
        transform: translate3d(-2.3%, 2.3%, 0) scale(1.05);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .app-shell__loading::before,
      .app-shell__loader-ring,
      .app-shell__loader-core,
      .app-shell__loading-bars > span {
        animation: none !important;
      }
    }
  `]
})
export class AppShellComponent implements OnInit, OnDestroy {
  breadcrumbs: string[] = ['Dashboard'];
  isTransitioning = false;
  isAuthOnlyRouteActive = false;
  isMobileViewport = false;
  shellMounted = false;
  loadingTitle = 'Loading session...';
  loadingSubtitle = 'Loading organization...';
  showRetryAction = false;
  mobileSidebarOpen = false;

  @ViewChild('mobileMenuButton') mobileMenuButton?: ElementRef<HTMLButtonElement>;

  private navSubscription?: Subscription;
  private contextSubscription?: Subscription;
  private bootstrapTimeoutHandle?: ReturnType<typeof setTimeout>;
  private mobileScrollTop = 0;
  private bodyScrollLocked = false;
  private readonly bootstrapTimeoutMs = 15000;

  constructor(
    private router: Router,
    private companyContext: CompanyContextService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.updateViewportState();
    this.updateRouteState();
    this.contextSubscription = this.companyContext.state$.subscribe((state) => {
      const hasResolvedContext =
        state.context.isAuthenticated &&
        state.context.authInitialized &&
        state.context.workspaceInitialized &&
        Boolean(state.context.activeBusinessProfileId);

      if (hasResolvedContext) {
        this.shellMounted = true;
        this.showRetryAction = false;
        this.clearBootstrapTimeout();
      } else if (!state.context.isAuthenticated && state.context.authInitialized && state.context.workspaceInitialized) {
        this.shellMounted = false;
        this.showRetryAction = false;
        this.clearBootstrapTimeout();
      } else if (state.loading && !this.shellMounted) {
        this.startBootstrapTimeout();
      }

      this.loadingTitle = state.context.authInitialized ? 'Loading organization...' : 'Loading session...';
      this.loadingSubtitle = state.error
        ? state.error
        : state.context.workspaceInitialized
          ? 'Loading access level...'
          : 'Restoring organization context...';
      this.showRetryAction =
        !this.shellMounted &&
        (Boolean(state.error) || this.showRetryAction);
      this.scheduleViewRefresh();
    });
    if (!this.isAuthOnlyRouteActive) {
      void this.bootstrapWorkspaceContext();
      this.updateRouteMeta();
    }

    this.navSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.isTransitioning = true;
        this.scheduleViewRefresh();
        return;
      }

      if (event instanceof NavigationEnd) {
        this.updateRouteState();
        this.updateRouteMeta();
        this.isTransitioning = false;
        this.closeMobileSidebar();
        this.scheduleViewRefresh();
        return;
      }

      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.isTransitioning = false;
        this.scheduleViewRefresh();
      }
    });
  }

  ngOnDestroy(): void {
    this.navSubscription?.unsubscribe();
    this.contextSubscription?.unsubscribe();
    this.clearBootstrapTimeout();
    this.unlockBodyScroll();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeMobileSidebar();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportState();
  }

  toggleMobileSidebar(): void {
    if (this.mobileSidebarOpen) {
      this.closeMobileSidebar();
      return;
    }

    this.openMobileSidebar();
  }

  closeMobileSidebar(): void {
    if (!this.mobileSidebarOpen) {
      return;
    }

    this.mobileSidebarOpen = false;
    this.unlockBodyScroll();
    this.scheduleViewRefresh();
    queueMicrotask(() => {
      this.mobileMenuButton?.nativeElement.focus();
    });
  }

  private openMobileSidebar(): void {
    if (this.mobileSidebarOpen || !this.isMobileViewport || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.mobileScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    this.mobileSidebarOpen = true;
    this.lockBodyScroll();
    this.scheduleViewRefresh();
    queueMicrotask(() => {
      const closeButton = document.querySelector('.app-sidebar__mobile-close') as HTMLButtonElement | null;
      closeButton?.focus();
    });
  }

  private async bootstrapWorkspaceContext(): Promise<void> {
    try {
      await this.companyContext.initializeAppContext();
    } catch {
      this.showRetryAction = true;
      this.scheduleViewRefresh();
    }
  }

  retryWorkspaceBootstrap(): void {
    this.showRetryAction = false;
    this.clearBootstrapTimeout();
    void this.bootstrapWorkspaceContext();
  }

  private updateRouteState(): void {
    this.isAuthOnlyRouteActive = isAuthOnlyRoute(this.router.url);
  }

  private updateViewportState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const nextIsMobileViewport = window.innerWidth <= 900;
    if (nextIsMobileViewport === this.isMobileViewport) {
      return;
    }

    this.isMobileViewport = nextIsMobileViewport;

    if (!nextIsMobileViewport) {
      this.closeMobileSidebar();
      this.unlockBodyScroll();
    }
  }

  private lockBodyScroll(): void {
    if (this.bodyScrollLocked || typeof document === 'undefined') {
      return;
    }

    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.mobileScrollTop}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    this.bodyScrollLocked = true;
  }

  private unlockBodyScroll(): void {
    if (!this.bodyScrollLocked || typeof document === 'undefined') {
      return;
    }

    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    this.bodyScrollLocked = false;

    if (typeof window !== 'undefined') {
      window.scrollTo(0, this.mobileScrollTop);
    }
  }

  private updateRouteMeta(): void {
    if (this.isAuthOnlyRouteActive) {
      this.breadcrumbs = [];
      return;
    }

    const currentUrl = this.router.url.split('?')[0];
    const page = getWorkspaceRouteByUrlPath(currentUrl);

    this.breadcrumbs = page ? [page.title] : [];
  }

  private scheduleViewRefresh(): void {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        try {
          this.cdr.detectChanges();
        } catch {
          // no-op if change detection runs during teardown
        }
      });
      return;
    }

    setTimeout(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // no-op if change detection runs during teardown
      }
    });
  }

  private startBootstrapTimeout(): void {
    if (this.bootstrapTimeoutHandle || this.shellMounted) {
      return;
    }

    this.bootstrapTimeoutHandle = setTimeout(() => {
      this.showRetryAction = !this.shellMounted;
      this.scheduleViewRefresh();
    }, this.bootstrapTimeoutMs);
  }

  private clearBootstrapTimeout(): void {
    if (!this.bootstrapTimeoutHandle) {
      return;
    }

    clearTimeout(this.bootstrapTimeoutHandle);
    this.bootstrapTimeoutHandle = undefined;
  }
}
