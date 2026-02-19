import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { BusinessAccessSnapshot, SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-subscription-expiry-ads',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './subscription-expiry-ads.html',
  styleUrl: './subscription-expiry-ads.css'
})
export class SubscriptionExpiryAdsComponent implements OnInit, OnDestroy {
  visible = false;
  currentSlot: number | null = null;
  trialEndsAt: string | null = null;

  private readonly dailySlots = [10, 15, 21];
  private readonly shownKeyPrefix = 'wellar_expiry_ads_shown_v1_';
  private readonly immediateQueue: number[] = [];
  private snapshotSub?: Subscription;
  private navSub?: Subscription;
  private timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    if (typeof window === 'undefined') {
      return;
    }

    this.refreshSchedule();
    window.addEventListener('focus', this.handleWindowFocus);
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.refreshSchedule();
      }
    });
  }

  ngOnDestroy() {
    this.snapshotSub?.unsubscribe();
    this.navSub?.unsubscribe();
    this.clearTimers();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus);
    }
  }

  dismiss() {
    this.markCurrentSlotAsShown();
    this.visible = false;
    this.currentSlot = null;
  }

  openPayment() {
    this.markCurrentSlotAsShown();
    this.visible = false;
    this.currentSlot = null;
    this.router.navigateByUrl('/payment');
  }

  adTitle(): string {
    if (this.currentSlot === 10) {
      return 'Morning Business Reminder';
    }
    if (this.currentSlot === 15) {
      return 'Afternoon Business Reminder';
    }
    return 'Evening Business Reminder';
  }

  adMessage(): string {
    const ended = this.trialEndsAt ? this.formatDate(this.trialEndsAt) : 'your trial end date';
    return `Your Business access ended on ${ended}. Continue with paid Business to keep all premium tools unlocked.`;
  }

  private handleWindowFocus = () => {
    this.refreshSchedule();
  };

  private refreshSchedule() {
    this.snapshotSub?.unsubscribe();
    this.clearTimers();

    this.snapshotSub = this.subscriptions.getBusinessAccessSnapshot().subscribe((snapshot) => {
      this.applySnapshot(snapshot);
    });
  }

  private applySnapshot(snapshot: BusinessAccessSnapshot) {
    this.trialEndsAt = snapshot.trialExpiresAt;
    const path = (this.router.url || '').split('?')[0];

    if (path === '/payment' || path === '/upgrade-plan' || path === '/login' || path === '/signup') {
      this.visible = false;
      this.currentSlot = null;
      this.immediateQueue.length = 0;
      return;
    }

    if (!snapshot.trialExpired || snapshot.hasBusinessAccess) {
      this.visible = false;
      this.currentSlot = null;
      this.immediateQueue.length = 0;
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      return;
    }

    const shown = this.readShownSlots(userId, this.todayKey());
    const now = new Date();

    const futureSlots: number[] = [];
    const dueSlots: number[] = [];

    this.dailySlots.forEach((slot) => {
      if (shown.has(slot)) {
        return;
      }

      const slotTime = this.slotDate(slot);
      if (slotTime.getTime() <= now.getTime()) {
        dueSlots.push(slot);
      } else {
        futureSlots.push(slot);
      }
    });

    if (dueSlots.length > 0) {
      const latestDueSlot = dueSlots[dueSlots.length - 1];
      this.enqueueImmediate(latestDueSlot);
    }

    futureSlots.forEach((slot) => {
      const ms = this.slotDate(slot).getTime() - now.getTime();
      const timer = setTimeout(() => {
        this.enqueueImmediate(slot);
      }, ms);
      this.timers.push(timer);
    });

    const midnightTimer = setTimeout(() => this.refreshSchedule(), this.msUntilTomorrow());
    this.timers.push(midnightTimer);
  }

  private enqueueImmediate(slot: number) {
    if (this.immediateQueue.includes(slot)) {
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      return;
    }

    const shown = this.readShownSlots(userId, this.todayKey());
    if (shown.has(slot)) {
      return;
    }

    if (this.visible) {
      this.immediateQueue.push(slot);
      return;
    }

    this.currentSlot = slot;
    this.visible = true;
  }

  private markCurrentSlotAsShown() {
    if (!this.currentSlot) {
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      return;
    }

    const key = this.storageKey(userId, this.todayKey());
    const shown = this.readShownSlots(userId, this.todayKey());
    shown.add(this.currentSlot);

    try {
      localStorage.setItem(key, JSON.stringify(Array.from(shown.values()).sort((a, b) => a - b)));
    } catch {
      // ignore storage errors
    }

    if (this.immediateQueue.length) {
      const next = this.immediateQueue.shift() ?? null;
      if (next !== null) {
        this.currentSlot = next;
        this.visible = true;
      }
    }
  }

  private readShownSlots(userId: string, dateKey: string): Set<number> {
    const key = this.storageKey(userId, dateKey);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return new Set<number>();
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return new Set<number>();
      }
      return new Set(parsed.filter((value) => typeof value === 'number'));
    } catch {
      return new Set<number>();
    }
  }

  private storageKey(userId: string, dateKey: string): string {
    return `${this.shownKeyPrefix}${userId}_${dateKey}`;
  }

  private todayKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private slotDate(hour: number): Date {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return date;
  }

  private msUntilTomorrow(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 3, 0);
    return Math.max(1000, tomorrow.getTime() - now.getTime());
  }

  private getUserId(): string | null {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    if (!token) {
      return null;
    }

    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    if (typeof id === 'string' && id) {
      return id;
    }
    if (typeof id === 'number' && !Number.isNaN(id)) {
      return String(id);
    }
    return null;
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

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('en-CA');
  }

  private clearTimers() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
  }
}
