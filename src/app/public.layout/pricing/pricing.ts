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
  feedback = '';
  selectedPlanCode = 'free';

  constructor(
    private subscriptionService: SubscriptionService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadPlans();
    this.subscriptionService.getActiveSubscription().subscribe((subscription) => {
      this.currentSubscription = subscription;
      this.selectedPlanCode = subscription?.plan?.code ?? 'free';
    });
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
    const currentCode = this.currentSubscription?.plan?.code;
    if (!currentCode) {
      return plan.code === 'free';
    }
    return currentCode === plan.code;
  }

  selectPlan(plan: Plan) {
    this.feedback = '';
    this.selectedPlanCode = plan.code;

    if (plan.code === 'free') {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/signup');
      return;
    }

    this.subscriptionService.activatePlan(plan, this.billingCycle).subscribe({
      next: () => {
        this.feedback = 'Plan activated. Refreshing your access...';
      },
      error: () => {
        this.feedback = 'We saved your request. A team member will confirm your upgrade.';
      }
    });
  }

  trackByPlan(_: number, plan: Plan) {
    return plan.id ?? plan.code;
  }

  ctaLabel(plan: Plan): string {
    if (plan.code === 'free' && this.isCurrentPlan(plan)) {
      return 'Your current plan';
    }
    if (this.isCurrentPlan(plan)) {
      return 'Current Plan';
    }
    return 'Upgrade Plan';
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
        monthly_price: 199,
        yearly_price: 1672,
        features: [
          'Everything in Free',
          'Bulk invites by email or phone',
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
