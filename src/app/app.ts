import { Component, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from './services/auth';
import { NewUserGuideComponent } from './components/new-user-guide/new-user-guide';
import { SubscriptionExpiryAdsComponent } from './components/subscription-expiry-ads/subscription-expiry-ads';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NewUserGuideComponent, SubscriptionExpiryAdsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('wellar-ui');
  isRouteTransitioning = false;

  private navSub?: Subscription;
  private transitionStartTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private topRouteKey = '';

  constructor(
    private auth: AuthService,
    private router: Router
  ) {
    this.topRouteKey = this.getTopRouteKey();
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const nextTopRouteKey = this.getTopRouteKey();
        if (nextTopRouteKey !== this.topRouteKey) {
          this.topRouteKey = nextTopRouteKey;
          this.triggerTransition();
        }
      }
    });

    if (typeof window !== 'undefined') {
      const theme = window.localStorage.getItem('theme');
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        root.classList.add('dark');
        root.classList.remove('light');
      }

      const isAuthCallback = window.location.pathname === '/auth-callback';
      if (!isAuthCallback) {
        this.auth.captureAuthFromUrl();
        this.auth.ensureSessionToken().subscribe();
      }
    }
  }

  private getTopRouteKey(): string {
    const topRoute = this.router.routerState.snapshot.root.firstChild;
    if (!topRoute) {
      return '';
    }

    const topPath = topRoute.routeConfig?.path ?? '';
    const componentRef = topRoute.routeConfig?.component;
    const componentName = typeof componentRef === 'function' ? componentRef.name : '';
    return `${topPath}|${componentName}`;
  }

  private triggerTransition() {
    if (this.transitionStartTimer) {
      clearTimeout(this.transitionStartTimer);
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }

    this.isRouteTransitioning = false;
    this.transitionStartTimer = setTimeout(() => {
      this.isRouteTransitioning = true;
      this.transitionTimer = setTimeout(() => {
        this.isRouteTransitioning = false;
      }, 420);
    }, 0);
  }

  ngOnDestroy() {
    this.navSub?.unsubscribe();
    if (this.transitionStartTimer) {
      clearTimeout(this.transitionStartTimer);
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }
  }

}
