import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { Plan, SubscriptionService, UserSubscription } from '../../services/subscription.service';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css'
})
export class PricingComponent implements OnInit {
  billingCycle: 'monthly' | 'yearly' = 'monthly';
  plans: Plan[] = [];
  loading = true;
  currentSubscription: UserSubscription | null = null;
  isTrialOfferEligible = false;
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  trialEndsAt: string | null = null;
  feedback = '';
  selectedPlanCode = 'free';

  constructor(
    private subscriptionService: SubscriptionService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadPlans();
    this.subscriptionService.ensureBusinessTrial().subscribe((subscription) => {
      this.setSubscription(subscription);
    });
    this.loadTrialOfferEligibility();
  }

  private loadPlans() {
    this.loading = true;
    this.subscriptionService.getPlans().subscribe((plans) => {
      const allowed = ['free', 'business'];
      const filtered = plans.filter((plan) =>
        allowed.includes((plan.code ?? '').toLowerCase())
      );
      this.plans = filtered.length ? filtered : this.getDefaultPlans();
      this.loading = false;
    });
  }

  toggleBilling(cycle: 'monthly' | 'yearly') {
    this.billingCycle = cycle;
  }

  priceFor(plan: Plan): number {
    if (this.billingCycle === 'yearly') {
      if (typeof plan.yearly_price === 'number' && !Number.isNaN(plan.yearly_price)) {
        return plan.yearly_price;
      }
      const monthly = typeof plan.monthly_price === 'number' ? plan.monthly_price : 0;
      return Math.round(monthly * 12 * 0.7);
    }
    return typeof plan.monthly_price === 'number' ? plan.monthly_price : 0;
  }

  billingLabel(plan: Plan): string {
    if (this.billingCycle === 'yearly') {
      return 'per year';
    }
    return 'per month';
  }

  isCurrentPlan(plan: Plan): boolean {
    const planCode = this.normalizePlanCode(plan.code);
    const currentCode = this.normalizePlanCode(this.currentSubscription?.plan?.code ?? '');
    if (!currentCode) {
      return planCode === 'free';
    }
    if (this.isBusinessTrial && planCode === 'business' && currentCode === 'business') {
      return false;
    }
    return currentCode === planCode;
  }

  selectPlan(plan: Plan) {
    this.feedback = '';
    this.selectedPlanCode = this.normalizePlanCode(plan.code);

    const code = this.normalizePlanCode(plan.code);
    if (code === 'free') {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/signup');
      return;
    }

    if (code === 'business') {
      this.router.navigate(['/payment'], {
        queryParams: { plan: 'business', cycle: this.billingCycle }
      });
      return;
    }
  }

  upgradeToBusinessNow() {
    const businessPlan = this.plans.find(
      (plan) => this.normalizePlanCode(plan.code) === 'business'
    );
    if (!businessPlan) {
      return;
    }
    this.selectPlan(businessPlan);
  }

  trackByPlan(_: number, plan: Plan) {
    return plan.id ?? plan.code;
  }

  ctaLabel(plan: Plan): string {
    const code = this.normalizePlanCode(plan.code);
    if (this.isBusinessTrial && code === 'business') {
      return 'Keep Business Access';
    }
    if (this.hasNewUserDiscount(plan)) {
      return 'Activate Business (Free Today)';
    }
    if (code === 'free' && this.isCurrentPlan(plan)) {
      return 'Your current plan';
    }
    if (this.isCurrentPlan(plan)) {
      return 'Current Plan';
    }
    return 'Activate Business';
  }

  trialBannerTitle(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return 'Business trial is active';
    }
    if (this.trialDaysRemaining <= 1) {
      return 'Your Business trial ends today';
    }
    return `Your Business trial ends in ${this.trialDaysRemaining} days`;
  }

  trialBannerMessage(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (!this.trialEndsAt) {
      return 'Keep requests, team invites, and analytics active by upgrading now.';
    }
    return `Keep requests, team invites, and analytics active after ${this.formatDate(this.trialEndsAt)} by upgrading now.`;
  }

  hasNewUserDiscount(plan: Plan): boolean {
    const code = this.normalizePlanCode(plan.code);
    return code === 'business' && this.isTrialOfferEligible && !this.isBusinessTrial;
  }

  discountFor(plan: Plan): number {
    if (!this.hasNewUserDiscount(plan)) {
      return 0;
    }
    return this.priceFor(plan);
  }

  totalDueToday(plan: Plan): number {
    const total = this.priceFor(plan) - this.discountFor(plan);
    return total > 0 ? total : 0;
  }

  private setSubscription(subscription: UserSubscription | null) {
    this.currentSubscription = subscription;
    this.selectedPlanCode = this.normalizePlanCode(subscription?.plan?.code ?? 'free');
    this.isBusinessTrial = Boolean(subscription?.is_trial);
    this.trialDaysRemaining =
      typeof subscription?.days_remaining === 'number' ? subscription.days_remaining : null;
    this.trialEndsAt = subscription?.expires_at ?? null;
  }

  private loadTrialOfferEligibility() {
    if (!this.auth.isLoggedIn()) {
      this.isTrialOfferEligible = true;
      return;
    }

    this.subscriptionService.isBusinessTrialEligible().subscribe((eligible) => {
      this.isTrialOfferEligible = eligible;
    });
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('en-CA');
  }

  private normalizePlanCode(code: string): string {
    return (code ?? '').toLowerCase();
  }

  private getDefaultPlans(): Plan[] {
    return [
      {
        name: 'Free',
        code: 'free',
        description: 'For individuals and pilots who want to run basic scans.',
        monthly_price: 0,
        yearly_price: 0,
        features: [
          'Daily mobile scan access',
          'Personal scan history',
          'Basic wellness insights',
          'Standard email support',
          'Single user account',
          'Mobile app access'
        ],
        is_popular: false,
        is_active: true,
        sort_order: 1
      },
      {
        name: 'Business',
        code: 'business',
        description: 'For enterprise teams running daily scans across departments.',
        monthly_price: 200,
        yearly_price: 1680,
        features: [
          'Everything in Free',
          'Bulk invites by email or phone',
          'WhatsApp/SMS invite center',
          'CSV/PDF export center with scheduling',
          'Automation rules and escalation flows',
          'Business billing portal and renewal requests',
          'WhatsApp onboarding messages',
          'Organization-level dashboards',
          'Advanced analytics and trends',
          'Compliance exports (CSV/PDF)',
          'Multi-location management',
          'Dedicated success manager'
        ],
        is_popular: true,
        is_active: true,
        sort_order: 3
      }
    ];
  }
}
