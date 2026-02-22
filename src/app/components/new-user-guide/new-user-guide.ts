import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subscription, of } from 'rxjs';
import { catchError, filter, map, startWith, switchMap } from 'rxjs/operators';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';

type RouteGuide = {
  title: string;
  summary: string;
  points: string[];
  ctaLabel?: string;
  ctaLink?: string;
};

type GuideState = {
  routeKey: string | null;
  shouldShow: boolean;
  guide: RouteGuide | null;
  trialDaysRemaining: number | null;
};

const ROUTE_GUIDES: Record<string, RouteGuide> = {
  dashboard: {
    title: 'Welcome to your dashboard',
    summary: 'This page gives you a live snapshot of team health and recent activity.',
    points: [
      'Use KPI cards to track urgent vs stable trends quickly.',
      'Open Business Center for exports, automation rules, and billing tools.',
      'Use Requests to invite team members and trigger new scans.'
    ],
    ctaLabel: 'Open Requests',
    ctaLink: '/requests'
  },
  requests: {
    title: 'How requests work',
    summary: 'Create scan requests, send invites, and monitor response status from one place.',
    points: [
      'Target can be a user ID, email, or phone.',
      'Business plan unlocks invite channels like email, WhatsApp, and SMS.',
      'Pending rows update as users complete their scans.'
    ],
    ctaLabel: 'Open Business Center',
    ctaLink: '/business-center'
  },
  history: {
    title: 'Scan history explained',
    summary: 'History keeps each scan result with timeline context for follow-up.',
    points: [
      'Review trends over time and compare behavior patterns.',
      'Use this to validate policy impact after new rules.',
      'Export snapshots from Business Center when needed for compliance.'
    ]
  },
  profile: {
    title: 'Profile and account settings',
    summary: 'Manage identity data, credentials, and account details here.',
    points: [
      'Keep contact information updated for team-level workflows.',
      'Security-sensitive changes are handled through authenticated calls.',
      'Your access level is controlled by active subscription and permissions.'
    ]
  },
  'audit-logs': {
    title: 'Audit logs',
    summary: 'This page is your compliance timeline for key operational events.',
    points: [
      'Filter events to investigate incidents quickly.',
      'Track who did what and when across your workspace.',
      'Pair logs with scheduled exports for external audits.'
    ]
  },
  'business-center': {
    title: 'Business Center',
    summary: 'Paid operational tools are grouped here: exports, invites, locations, automation, and billing.',
    points: [
      'Each block is marked as paid and unlocked during your trial.',
      'Create automation rules to speed up response workflows.',
      'Use billing and renewal controls before trial ends.'
    ],
    ctaLabel: 'Compare Plans',
    ctaLink: '/pricing'
  },
  pricing: {
    title: 'Free vs Business plans',
    summary: 'This page shows exactly what is included in each plan and your current offer.',
    points: [
      'Business pricing is shown with a new-user discount where eligible.',
      'Feature comparison clearly marks what is paid.',
      'Use Payment to submit company and billing details.'
    ],
    ctaLabel: 'Open Payment',
    ctaLink: '/payment'
  },
  'upgrade-plan': {
    title: 'Payment flow',
    summary: 'Complete business and company details to activate advanced access.',
    points: [
      'Base price is shown first, then new-user discount is applied.',
      'If eligible, total today becomes 0 for trial activation.',
      'The request payload is saved for backend and billing processing.'
    ]
  },
  payment: {
    title: 'Payment flow',
    summary: 'Complete business and company details to activate advanced access.',
    points: [
      'Base price is shown first, then new-user discount is applied.',
      'If eligible, total today becomes 0 for trial activation.',
      'The request payload is saved for backend and billing processing.'
    ]
  }
};

@Component({
  selector: 'app-new-user-guide',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './new-user-guide.html',
  styleUrl: './new-user-guide.css'
})
export class NewUserGuideComponent implements OnInit, OnDestroy {
  visible = false;
  guide: RouteGuide | null = null;
  trialDaysRemaining: number | null = null;

  private currentRouteKey: string | null = null;
  private currentUserId: string | null = null;
  private seenRoutes = new Set<string>();
  private navSub?: Subscription;

  constructor(
    private router: Router,
    private subscriptions: SubscriptionService
  ) {}

  ngOnInit() {
    this.navSub = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects || event.url),
      startWith(this.router.url),
      switchMap((url) => this.resolveGuideState(url))
    ).subscribe((state) => this.applyGuideState(state));
  }

  ngOnDestroy() {
    this.navSub?.unsubscribe();
  }

  dismiss() {
    if (this.currentRouteKey) {
      this.markRouteSeen(this.currentRouteKey);
    }
    this.visible = false;
  }

  skipAll() {
    Object.keys(ROUTE_GUIDES).forEach((routeKey) => this.markRouteSeen(routeKey));
    this.visible = false;
  }

  private resolveGuideState(url: string) {
    const routeKey = this.extractRouteKey(url);
    const guide = routeKey ? ROUTE_GUIDES[routeKey] ?? null : null;

    if (!guide) {
      return of({
        routeKey,
        shouldShow: false,
        guide: null,
        trialDaysRemaining: null
      } as GuideState);
    }

    const safeRouteKey = routeKey as string;
    const token = this.getToken();
    const userId = token ? this.getUserIdFromToken(token) : null;
    if (!token || !userId) {
      return of({
        routeKey: safeRouteKey,
        shouldShow: false,
        guide,
        trialDaysRemaining: null
      } as GuideState);
    }

    this.ensureSeenRoutesLoaded(userId);

    return this.subscriptions.ensureBusinessTrial().pipe(
      map((subscription) => this.buildGuideState(safeRouteKey, guide, subscription)),
      catchError(() =>
        of({
          routeKey: safeRouteKey,
          shouldShow: false,
          guide,
          trialDaysRemaining: null
        } as GuideState)
      )
    );
  }

  private buildGuideState(
    routeKey: string,
    guide: RouteGuide,
    subscription: UserSubscription | null
  ): GuideState {
    const isActiveSubscription = (subscription?.status ?? '').trim().toLowerCase() === 'active';
    const trialDaysRemaining =
      typeof subscription?.days_remaining === 'number' ? subscription.days_remaining : null;
    const isTrialActive =
      isActiveSubscription &&
      Boolean(subscription?.is_trial) &&
      (trialDaysRemaining === null || trialDaysRemaining > 0);

    return {
      routeKey,
      shouldShow: isTrialActive && !this.seenRoutes.has(routeKey),
      guide,
      trialDaysRemaining
    };
  }

  private applyGuideState(state: GuideState) {
    const activeRouteKey = this.extractRouteKey(this.router.url);
    if (state.routeKey !== activeRouteKey) {
      return;
    }

    this.currentRouteKey = state.routeKey;
    this.trialDaysRemaining = state.trialDaysRemaining;
    if (!state.shouldShow || !state.guide) {
      this.visible = false;
      this.guide = null;
      return;
    }
    this.guide = state.guide;
    this.visible = true;
  }

  private extractRouteKey(url: string): string | null {
    const pathOnly = url.split('?')[0].split('#')[0];
    const segments = pathOnly.split('/').filter(Boolean);
    const first = segments[0];
    if (!first) {
      return null;
    }
    return first.split(';')[0].toLowerCase();
  }

  private ensureSeenRoutesLoaded(userId: string) {
    if (this.currentUserId === userId) {
      return;
    }

    this.currentUserId = userId;
    this.seenRoutes.clear();

    const stored = localStorage.getItem(this.storageKey(userId));
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        parsed
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
          .forEach((route) => this.seenRoutes.add(route));
      }
    } catch {
      // ignore malformed storage
    }
  }

  private markRouteSeen(routeKey: string) {
    const userId = this.currentUserId;
    if (!userId) {
      return;
    }
    this.seenRoutes.add(routeKey);
    localStorage.setItem(this.storageKey(userId), JSON.stringify(Array.from(this.seenRoutes)));
  }

  private storageKey(userId: string): string {
    return `wellar_new_user_guide_seen_${userId}`;
  }

  private getToken(): string | null {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!token || this.isTokenExpired(token)) {
      return null;
    }
    return token;
  }

  private getUserIdFromToken(token: string): string | null {
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' && id ? id : null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.['exp'];
    if (typeof exp !== 'number') {
      return false;
    }
    return Math.floor(Date.now() / 1000) >= exp;
  }
}

