import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterModule } from '@angular/router';
import { Subscription as RxSubscription } from 'rxjs';
import { BusinessAccessSnapshot, SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterModule],
  templateUrl: './sidebar.html'
})
export class SidebarComponent implements OnInit, OnDestroy {
  planLabel = 'Free';
  hasBusinessAccess = false;
  isBusinessTrial = false;
  trialExpired = false;
  trialDaysRemaining: number | null = null;
  private snapshotSub?: RxSubscription;
  private navSub?: RxSubscription;

  constructor(
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSnapshot(true);
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadSnapshot(true);
      }
    });
  }

  ngOnDestroy() {
    this.snapshotSub?.unsubscribe();
    this.navSub?.unsubscribe();
  }

  statusText(): string {
    if (this.hasBusinessAccess && this.isBusinessTrial) {
      if (typeof this.trialDaysRemaining === 'number') {
        return `${this.trialDaysRemaining}d left`;
      }
      return 'Trial';
    }

    if (this.hasBusinessAccess) {
      return 'Active';
    }

    if (this.trialExpired) {
      return 'Expired';
    }

    return 'Free';
  }

  trialProgressPercent(): number {
    if (!this.isBusinessTrial || typeof this.trialDaysRemaining !== 'number') {
      return this.hasBusinessAccess ? 100 : 0;
    }
    const percent = Math.round((this.trialDaysRemaining / 14) * 100);
    if (percent < 0) {
      return 0;
    }
    if (percent > 100) {
      return 100;
    }
    return percent;
  }

  private applySnapshot(snapshot: BusinessAccessSnapshot) {
    this.hasBusinessAccess = snapshot.hasBusinessAccess;
    this.isBusinessTrial = snapshot.isBusinessTrial;
    this.trialExpired = snapshot.trialExpired;
    this.trialDaysRemaining = snapshot.daysRemaining;

    this.planLabel = snapshot.hasBusinessAccess ? 'Business' : 'Free';
  }

  private loadSnapshot(forceRefresh = false): void {
    this.snapshotSub?.unsubscribe();
    this.snapshotSub = this.subscriptions
      .getBusinessAccessSnapshot({ forceRefresh })
      .subscribe((snapshot) => {
        this.applySnapshot(snapshot);
      });
  }
}
