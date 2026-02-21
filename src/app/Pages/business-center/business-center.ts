import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import {
  AutomationRule,
  BusinessCenterService,
  BusinessInvoice,
  BusinessLocation,
  ExportJob,
  MessageInvite
} from '../../services/business-center.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

@Component({
  selector: 'app-business-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './business-center.html',
  styleUrl: './business-center.css'
})
export class BusinessCenterComponent implements OnInit {
  loadingAccess = true;
  loadingData = false;
  hasBusinessAccess = false;
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  currentPlanName = 'Free';
  subscription: UserSubscription | null = null;
  feedback: Feedback | null = null;

  exportsLoading = false;
  invitesLoading = false;
  locationsLoading = false;
  rulesLoading = false;
  invoicesLoading = false;

  exportJobs: ExportJob[] = [];
  messageInvites: MessageInvite[] = [];
  locations: BusinessLocation[] = [];
  rules: AutomationRule[] = [];
  invoices: BusinessInvoice[] = [];

  exportForm = {
    name: 'Operations Snapshot',
    dataset: 'requests',
    format: 'csv' as 'csv' | 'pdf',
    scheduleType: 'one_time' as 'one_time' | 'daily' | 'weekly' | 'monthly',
    nextRunAt: ''
  };

  inviteForm = {
    recipientName: '',
    phone: '',
    channel: 'whatsapp' as 'whatsapp' | 'sms',
    messageTemplate: 'Your team scan invite is ready. Reply to start now.'
  };

  locationForm = {
    name: '',
    code: '',
    city: '',
    country: '',
    address: '',
    managerName: ''
  };

  ruleForm = {
    ruleName: '',
    triggerType: 'high_risk',
    actionType: 'whatsapp_alert',
    threshold: '',
    cooldownMinutes: '30',
    isActive: true
  };

  billingForm = {
    companyLegalName: '',
    taxId: '',
    billingEmail: '',
    accountsPhone: '',
    address: ''
  };

  renewalNote = '';

  constructor(
    private businessCenter: BusinessCenterService,
    private subscriptions: SubscriptionService
  ) {}

  ngOnInit() {
    this.loadAccessState();
  }

  trialBadgeText(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return 'Business trial active';
    }
    if (this.trialDaysRemaining <= 1) {
      return 'Business trial ends today';
    }
    return `${this.trialDaysRemaining} days left in trial`;
  }

  showPaidFeatureMessage(feature: string): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return `${feature} is a paid Business feature, unlocked for your trial now.`;
    }
    if (this.trialDaysRemaining <= 1) {
      return `${feature} is paid on Business. You can use it free today only.`;
    }
    return `${feature} is paid on Business. Free for you now (${this.trialDaysRemaining} days left).`;
  }

  submitExportJob() {
    const name = this.exportForm.name.trim();
    if (!name) {
      this.feedback = { type: 'error', message: 'Export name is required.' };
      return;
    }

    this.feedback = { type: 'info', message: 'Queueing export job...' };
    this.businessCenter.createExportJob({
      name,
      dataset: this.exportForm.dataset,
      format: this.exportForm.format,
      schedule_type: this.exportForm.scheduleType,
      next_run_at: this.toIsoFromDateTimeLocal(this.exportForm.nextRunAt)
    } as ExportJob).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.loadExportJobs();
      }
    });
  }

  submitMessageInvite() {
    const recipientName = this.inviteForm.recipientName.trim();
    const phone = this.inviteForm.phone.trim();
    if (!recipientName || !phone) {
      this.feedback = { type: 'error', message: 'Recipient name and phone are required.' };
      return;
    }

    this.feedback = { type: 'info', message: 'Queueing business message invite...' };
    this.businessCenter.createMessageInvite({
      recipient_name: recipientName,
      phone,
      channel: this.inviteForm.channel,
      message_template: this.inviteForm.messageTemplate.trim()
    } as MessageInvite).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.inviteForm.recipientName = '';
        this.inviteForm.phone = '';
        this.loadMessageInvites();
      }
    });
  }

  submitLocation() {
    const name = this.locationForm.name.trim();
    if (!name) {
      this.feedback = { type: 'error', message: 'Location name is required.' };
      return;
    }

    this.feedback = { type: 'info', message: 'Saving location...' };
    this.businessCenter.createLocation({
      name,
      code: this.locationForm.code.trim(),
      city: this.locationForm.city.trim(),
      country: this.locationForm.country.trim(),
      address: this.locationForm.address.trim(),
      manager_name: this.locationForm.managerName.trim(),
      is_active: true
    }).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.locationForm = {
          name: '',
          code: '',
          city: '',
          country: '',
          address: '',
          managerName: ''
        };
        this.loadLocations();
      }
    });
  }

  submitRule() {
    const ruleName = this.ruleForm.ruleName.trim();
    if (!ruleName) {
      this.feedback = { type: 'error', message: 'Rule name is required.' };
      return;
    }

    this.feedback = { type: 'info', message: 'Creating automation rule...' };
    this.businessCenter.createAutomationRule({
      rule_name: ruleName,
      trigger_type: this.ruleForm.triggerType,
      action_type: this.ruleForm.actionType,
      threshold: this.toOptionalNumber(this.ruleForm.threshold),
      cooldown_minutes: this.toOptionalNumber(this.ruleForm.cooldownMinutes),
      is_active: this.ruleForm.isActive
    }).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.ruleForm.ruleName = '';
        this.loadRules();
      }
    });
  }

  toggleRule(rule: AutomationRule) {
    this.businessCenter.toggleAutomationRule(rule).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.loadRules();
      }
    });
  }

  submitRenewal(cycle: 'monthly' | 'yearly') {
    this.feedback = { type: 'info', message: 'Submitting renewal request...' };
    this.businessCenter.requestRenewal(cycle, this.renewalNote.trim()).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
      if (res.ok) {
        this.renewalNote = '';
      }
    });
  }

  saveBillingProfile() {
    const legal = this.billingForm.companyLegalName.trim();
    const email = this.billingForm.billingEmail.trim();
    if (!legal || !email) {
      this.feedback = {
        type: 'error',
        message: 'Billing profile needs company legal name and billing email.'
      };
      return;
    }

    this.feedback = { type: 'info', message: 'Saving billing profile...' };
    this.businessCenter.saveBillingProfile({
      companyLegalName: legal,
      taxId: this.billingForm.taxId.trim(),
      billingEmail: email,
      accountsPhone: this.billingForm.accountsPhone.trim(),
      address: this.billingForm.address.trim()
    }).subscribe((res) => {
      this.feedback = { type: res.ok ? 'success' : 'error', message: res.message };
    });
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  formatMoney(value?: number): string {
    if (typeof value !== 'number') {
      return '-';
    }
    return `$${value.toFixed(2)}`;
  }

  private loadAccessState() {
    this.loadingAccess = true;
    this.subscriptions.ensureBusinessTrial().pipe(
      timeout(7000),
      catchError(() => {
        this.feedback = {
          type: 'error',
          message: 'Could not verify Business access right now. Refresh the page or open Billing.'
        };
        return of(null);
      })
    ).subscribe((subscription) => {
      this.subscription = subscription;
      this.currentPlanName = subscription?.plan?.name ?? (this.isBusinessSubscriptionActive(subscription) ? 'Business' : 'Free');
      this.isBusinessTrial = Boolean(subscription?.is_trial);
      this.trialDaysRemaining =
        typeof subscription?.days_remaining === 'number' ? subscription.days_remaining : null;
      this.hasBusinessAccess = this.isBusinessSubscriptionActive(subscription);
      this.loadingAccess = false;

      if (this.hasBusinessAccess) {
        this.loadAllBusinessData();
      }
    });
  }

  private loadAllBusinessData() {
    this.clearLastBusinessError();
    this.loadingData = true;
    this.loadExportJobs();
    this.loadMessageInvites();
    this.loadLocations();
    this.loadRules();
    this.loadInvoices();
    this.loadingData = false;
  }

  private loadExportJobs() {
    this.exportsLoading = true;
    this.businessCenter.listExportJobs().subscribe((rows) => {
      this.exportJobs = rows;
      this.exportsLoading = false;
      this.showAccessErrorIfAny();
    });
  }

  private loadMessageInvites() {
    this.invitesLoading = true;
    this.businessCenter.listMessageInvites().subscribe((rows) => {
      this.messageInvites = rows;
      this.invitesLoading = false;
      this.showAccessErrorIfAny();
    });
  }

  private loadLocations() {
    this.locationsLoading = true;
    this.businessCenter.listLocations().subscribe((rows) => {
      this.locations = rows;
      this.locationsLoading = false;
      this.showAccessErrorIfAny();
    });
  }

  private loadRules() {
    this.rulesLoading = true;
    this.businessCenter.listAutomationRules().subscribe((rows) => {
      this.rules = rows;
      this.rulesLoading = false;
      this.showAccessErrorIfAny();
    });
  }

  private loadInvoices() {
    this.invoicesLoading = true;
    this.businessCenter.listInvoices().subscribe((rows) => {
      this.invoices = rows;
      this.invoicesLoading = false;
      this.showAccessErrorIfAny();
    });
  }

  private clearLastBusinessError() {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem('business_center_last_error');
  }

  private showAccessErrorIfAny() {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const reason = localStorage.getItem('business_center_last_error');
    const adminTokenError = localStorage.getItem('admin_token_error');
    if (!reason && !adminTokenError) {
      return;
    }

    const details: string[] = [];
    if (reason) {
      details.push(reason);
    }
    if (adminTokenError) {
      details.push(`Admin token proxy error: ${adminTokenError}`);
    }

    this.feedback = {
      type: 'error',
      message: details.join(' ')
    };
  }

  private toIsoFromDateTimeLocal(value: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  }

  private toOptionalNumber(value: string): number | undefined {
    if (!value.trim()) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private isBusinessSubscriptionActive(subscription: UserSubscription | null): boolean {
    if (!subscription) {
      return false;
    }
    return (subscription.status ?? '').trim().toLowerCase() === 'active';
  }
}
