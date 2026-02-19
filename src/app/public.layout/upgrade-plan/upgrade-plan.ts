import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { BusinessUpgradeService } from '../../services/business-upgrade.service';
import { Plan, SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-upgrade-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './upgrade-plan.html',
  styleUrl: './upgrade-plan.css'
})
export class UpgradePlanComponent implements OnInit {
  loading = true;
  submitting = false;
  feedback = '';
  feedbackType: 'success' | 'error' | 'info' = 'info';
  isTrialEligible = false;
  basePriceUsd = 200;
  discountUsd = 0;
  totalTodayUsd = 200;
  requestId: string | number | null = null;

  businessPlan: Plan = {
    name: 'Business',
    code: 'business',
    monthly_price: 200,
    yearly_price: 1680,
    features: []
  };

  form = {
    ownerName: '',
    companyName: '',
    businessName: '',
    workEmail: '',
    phone: '',
    industry: '',
    teamSize: '',
    country: '',
    city: '',
    address: '',
    website: '',
    notes: '',
    acceptTerms: false
  };

  constructor(
    private router: Router,
    private auth: AuthService,
    private subscriptionService: SubscriptionService,
    private upgradeService: BusinessUpgradeService
  ) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/signup');
      return;
    }

    this.prefillFromToken();
    this.loadBusinessPlan();
    this.loadTrialEligibility();
  }

  submitUpgradeRequest() {
    if (this.submitting || !this.isFormValid()) {
      if (!this.isFormValid()) {
        this.feedbackType = 'error';
        this.feedback = 'Please complete all required fields and accept terms.';
      }
      return;
    }

    this.submitting = true;
    this.feedbackType = 'info';
    this.feedback = 'Submitting your payment activation request...';
    const normalizedPhone = this.form.phone.trim();

    this.upgradeService.syncUserPhone(normalizedPhone).pipe(
      switchMap((phoneSync) => {
        if (!phoneSync.ok) {
          this.submitting = false;
          this.feedbackType = 'error';
          this.feedback = phoneSync.reason ?? 'Please provide a valid phone number to continue.';
          return of(null);
        }

        return this.upgradeService.submitRequest({
          ownerName: this.form.ownerName.trim(),
          companyName: this.form.companyName.trim(),
          businessName: this.form.businessName.trim(),
          workEmail: this.form.workEmail.trim(),
          phone: normalizedPhone,
          industry: this.form.industry.trim(),
          teamSize: this.form.teamSize.trim(),
          country: this.form.country.trim(),
          city: this.form.city.trim(),
          address: this.form.address.trim(),
          website: this.form.website.trim(),
          notes: this.form.notes.trim(),
          billingCycle: 'monthly',
          basePriceUsd: this.basePriceUsd,
          discountUsd: this.discountUsd,
          finalPriceUsd: this.totalTodayUsd,
          isNewUserOffer: this.isTrialEligible
        });
      })
    ).subscribe((result) => {
      if (!result) {
        return;
      }

      if (!result.ok) {
        this.submitting = false;
        this.feedbackType = 'error';
        this.feedback = result.reason ?? 'Failed to submit payment activation request.';
        return;
      }

      this.requestId = result.id ?? null;
      this.subscriptionService.markBusinessOnboardingComplete();

      if (this.isTrialEligible) {
        this.activateBusinessTrialAfterSubmit();
        return;
      }

      this.submitting = false;
      this.feedbackType = 'success';
      this.feedback =
        'Payment activation request submitted successfully. Our team will review your details for paid Business activation.';
    });
  }

  private activateBusinessTrialAfterSubmit() {
    this.subscriptionService.startBusinessTrial().subscribe((subscription) => {
      this.submitting = false;
      const planCode = (subscription?.plan?.code ?? '').toLowerCase();
      if (planCode === 'business') {
        this.feedbackType = 'success';
        this.feedback =
          'Business trial activated successfully. Paid Business features are now unlocked for 14 days.';
        setTimeout(() => {
          this.router.navigateByUrl('/business-center');
        }, 1200);
        return;
      }

      this.feedbackType = 'success';
      this.feedback =
        'Request submitted successfully. Trial activation will be completed shortly.';
    });
  }

  private loadBusinessPlan() {
    this.subscriptionService.getPlans().subscribe((plans) => {
      const business = plans.find((plan) => (plan.code ?? '').toLowerCase() === 'business');
      if (business) {
        this.businessPlan = business;
      }
      this.basePriceUsd = this.resolveBasePrice();
      this.loading = false;
      this.updatePriceSummary();
    });
  }

  private loadTrialEligibility() {
    this.subscriptionService.isBusinessTrialEligible().subscribe((eligible) => {
      this.isTrialEligible = eligible;
      this.updatePriceSummary();
    });
  }

  private updatePriceSummary() {
    this.discountUsd = this.isTrialEligible ? this.basePriceUsd : 0;
    this.totalTodayUsd = Math.max(0, this.basePriceUsd - this.discountUsd);
  }

  private resolveBasePrice(): number {
    const monthly =
      typeof this.businessPlan.monthly_price === 'number' ? this.businessPlan.monthly_price : 200;
    return Math.round(monthly);
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.ownerName.trim() &&
      this.form.companyName.trim() &&
      this.form.businessName.trim() &&
      this.form.workEmail.trim() &&
      this.form.phone.trim() &&
      this.form.acceptTerms
    );
  }

  private prefillFromToken() {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token');
    const payload = token ? this.decodeJwtPayload(token) : null;

    const firstName = typeof payload?.['first_name'] === 'string' ? payload['first_name'] : '';
    const lastName = typeof payload?.['last_name'] === 'string' ? payload['last_name'] : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    const email =
      (typeof payload?.['email'] === 'string' ? payload['email'] : '') ||
      localStorage.getItem('user_email') ||
      '';

    if (fullName) {
      this.form.ownerName = fullName;
    }
    if (email) {
      this.form.workEmail = email;
    }
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
}
