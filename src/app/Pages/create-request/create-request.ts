import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, finalize, map, timeout, toArray } from 'rxjs/operators';
import { Organization, OrganizationService } from '../../services/organization.service';
import { BusinessCenterService, BusinessHubAccessState } from '../../services/business-center.service';
import { environment } from 'src/environments/environment';

type Feedback = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type RecipientKind = 'email' | 'phone';

type RequestRecipient = {
  id: string;
  kind: RecipientKind;
  value: string;
  display: string;
};

type PhoneCountry = {
  name: string;
  dial: string;
};

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './create-request.html',
  styleUrl: './create-request.css'
})
export class CreateRequestComponent implements OnInit, OnDestroy {
  isAdminUser = false;
  loadingBusinessProfile = true;
  businessProfileMissing = false;
  canCreateRequests = false;
  currentPlanName = 'Free';
  currentPlanCode = 'free';
  memberRoleLabel = 'User';
  isBusinessTrial = false;
  trialDaysRemaining: number | null = null;
  businessTrialNotice = '';
  businessInviteTrialNotice = '';
  businessAccessReason = '';
  accessState: BusinessHubAccessState | null = null;
  org: Organization | null = null;
  submittingRequest = false;
  submitFeedback: Feedback | null = null;
  private redirectAfterSubmitTimer: ReturnType<typeof setTimeout> | null = null;
  recipientMode: RecipientKind = 'email';
  recipientInput = '';
  selectedCountryCode = '+20';
  recipientError = '';
  recipients: RequestRecipient[] = [];
  private lastSubmitError = '';
  private readonly submitTimeoutMs = 30000;
  private readonly businessProfileTimeoutMs = 15000;
  readonly phoneCountries: PhoneCountry[] = [
    { name: 'Afghanistan', dial: '+93' },
    { name: 'Albania', dial: '+355' },
    { name: 'Algeria', dial: '+213' },
    { name: 'Andorra', dial: '+376' },
    { name: 'Angola', dial: '+244' },
    { name: 'Antigua and Barbuda', dial: '+1' },
    { name: 'Argentina', dial: '+54' },
    { name: 'Armenia', dial: '+374' },
    { name: 'Aruba', dial: '+297' },
    { name: 'Australia', dial: '+61' },
    { name: 'Austria', dial: '+43' },
    { name: 'Azerbaijan', dial: '+994' },
    { name: 'Bahamas', dial: '+1' },
    { name: 'Bahrain', dial: '+973' },
    { name: 'Bangladesh', dial: '+880' },
    { name: 'Barbados', dial: '+1' },
    { name: 'Belarus', dial: '+375' },
    { name: 'Belgium', dial: '+32' },
    { name: 'Belize', dial: '+501' },
    { name: 'Benin', dial: '+229' },
    { name: 'Bermuda', dial: '+1' },
    { name: 'Bhutan', dial: '+975' },
    { name: 'Bolivia', dial: '+591' },
    { name: 'Bosnia and Herzegovina', dial: '+387' },
    { name: 'Botswana', dial: '+267' },
    { name: 'Brazil', dial: '+55' },
    { name: 'Brunei', dial: '+673' },
    { name: 'Bulgaria', dial: '+359' },
    { name: 'Burkina Faso', dial: '+226' },
    { name: 'Burundi', dial: '+257' },
    { name: 'Cambodia', dial: '+855' },
    { name: 'Cameroon', dial: '+237' },
    { name: 'Canada', dial: '+1' },
    { name: 'Cape Verde', dial: '+238' },
    { name: 'Cayman Islands', dial: '+1' },
    { name: 'Central African Republic', dial: '+236' },
    { name: 'Chad', dial: '+235' },
    { name: 'Chile', dial: '+56' },
    { name: 'China', dial: '+86' },
    { name: 'Colombia', dial: '+57' },
    { name: 'Comoros', dial: '+269' },
    { name: 'Congo (Brazzaville)', dial: '+242' },
    { name: 'Congo (Kinshasa)', dial: '+243' },
    { name: 'Costa Rica', dial: '+506' },
    { name: 'Croatia', dial: '+385' },
    { name: 'Cuba', dial: '+53' },
    { name: 'Cyprus', dial: '+357' },
    { name: 'Czech Republic', dial: '+420' },
    { name: 'Denmark', dial: '+45' },
    { name: 'Djibouti', dial: '+253' },
    { name: 'Dominica', dial: '+1' },
    { name: 'Dominican Republic', dial: '+1' },
    { name: 'Ecuador', dial: '+593' },
    { name: 'Egypt', dial: '+20' },
    { name: 'El Salvador', dial: '+503' },
    { name: 'Equatorial Guinea', dial: '+240' },
    { name: 'Eritrea', dial: '+291' },
    { name: 'Estonia', dial: '+372' },
    { name: 'Eswatini', dial: '+268' },
    { name: 'Ethiopia', dial: '+251' },
    { name: 'Fiji', dial: '+679' },
    { name: 'Finland', dial: '+358' },
    { name: 'France', dial: '+33' },
    { name: 'French Guiana', dial: '+594' },
    { name: 'French Polynesia', dial: '+689' },
    { name: 'Gabon', dial: '+241' },
    { name: 'Gambia', dial: '+220' },
    { name: 'Georgia', dial: '+995' },
    { name: 'Germany', dial: '+49' },
    { name: 'Ghana', dial: '+233' },
    { name: 'Gibraltar', dial: '+350' },
    { name: 'Greece', dial: '+30' },
    { name: 'Greenland', dial: '+299' },
    { name: 'Grenada', dial: '+1' },
    { name: 'Guadeloupe', dial: '+590' },
    { name: 'Guam', dial: '+1' },
    { name: 'Guatemala', dial: '+502' },
    { name: 'Guernsey', dial: '+44' },
    { name: 'Guinea', dial: '+224' },
    { name: 'Guinea-Bissau', dial: '+245' },
    { name: 'Guyana', dial: '+592' },
    { name: 'Haiti', dial: '+509' },
    { name: 'Honduras', dial: '+504' },
    { name: 'Hong Kong', dial: '+852' },
    { name: 'Hungary', dial: '+36' },
    { name: 'Iceland', dial: '+354' },
    { name: 'India', dial: '+91' },
    { name: 'Indonesia', dial: '+62' },
    { name: 'Iran', dial: '+98' },
    { name: 'Iraq', dial: '+964' },
    { name: 'Ireland', dial: '+353' },
    { name: 'Isle of Man', dial: '+44' },
    { name: 'Israel', dial: '+972' },
    { name: 'Italy', dial: '+39' },
    { name: 'Ivory Coast', dial: '+225' },
    { name: 'Jamaica', dial: '+1' },
    { name: 'Japan', dial: '+81' },
    { name: 'Jersey', dial: '+44' },
    { name: 'Jordan', dial: '+962' },
    { name: 'Kazakhstan', dial: '+7' },
    { name: 'Kenya', dial: '+254' },
    { name: 'Kiribati', dial: '+686' },
    { name: 'Korea, North', dial: '+850' },
    { name: 'Korea, South', dial: '+82' },
    { name: 'Kuwait', dial: '+965' },
    { name: 'Kyrgyzstan', dial: '+996' },
    { name: 'Laos', dial: '+856' },
    { name: 'Latvia', dial: '+371' },
    { name: 'Lebanon', dial: '+961' },
    { name: 'Lesotho', dial: '+266' },
    { name: 'Liberia', dial: '+231' },
    { name: 'Libya', dial: '+218' },
    { name: 'Liechtenstein', dial: '+423' },
    { name: 'Lithuania', dial: '+370' },
    { name: 'Luxembourg', dial: '+352' },
    { name: 'Macao', dial: '+853' },
    { name: 'Madagascar', dial: '+261' },
    { name: 'Malawi', dial: '+265' },
    { name: 'Malaysia', dial: '+60' },
    { name: 'Maldives', dial: '+960' },
    { name: 'Mali', dial: '+223' },
    { name: 'Malta', dial: '+356' },
    { name: 'Marshall Islands', dial: '+692' },
    { name: 'Martinique', dial: '+596' },
    { name: 'Mauritania', dial: '+222' },
    { name: 'Mauritius', dial: '+230' },
    { name: 'Mayotte', dial: '+262' },
    { name: 'Mexico', dial: '+52' },
    { name: 'Micronesia', dial: '+691' },
    { name: 'Moldova', dial: '+373' },
    { name: 'Monaco', dial: '+377' },
    { name: 'Mongolia', dial: '+976' },
    { name: 'Montenegro', dial: '+382' },
    { name: 'Morocco', dial: '+212' },
    { name: 'Mozambique', dial: '+258' },
    { name: 'Myanmar', dial: '+95' },
    { name: 'Namibia', dial: '+264' },
    { name: 'Nauru', dial: '+674' },
    { name: 'Nepal', dial: '+977' },
    { name: 'Netherlands', dial: '+31' },
    { name: 'New Caledonia', dial: '+687' },
    { name: 'New Zealand', dial: '+64' },
    { name: 'Nicaragua', dial: '+505' },
    { name: 'Niger', dial: '+227' },
    { name: 'Nigeria', dial: '+234' },
    { name: 'North Macedonia', dial: '+389' },
    { name: 'Norway', dial: '+47' },
    { name: 'Oman', dial: '+968' },
    { name: 'Pakistan', dial: '+92' },
    { name: 'Palau', dial: '+680' },
    { name: 'Palestine', dial: '+970' },
    { name: 'Panama', dial: '+507' },
    { name: 'Papua New Guinea', dial: '+675' },
    { name: 'Paraguay', dial: '+595' },
    { name: 'Peru', dial: '+51' },
    { name: 'Philippines', dial: '+63' },
    { name: 'Poland', dial: '+48' },
    { name: 'Portugal', dial: '+351' },
    { name: 'Puerto Rico', dial: '+1' },
    { name: 'Qatar', dial: '+974' },
    { name: 'Reunion', dial: '+262' },
    { name: 'Romania', dial: '+40' },
    { name: 'Russia', dial: '+7' },
    { name: 'Rwanda', dial: '+250' },
    { name: 'Saint Kitts and Nevis', dial: '+1' },
    { name: 'Saint Lucia', dial: '+1' },
    { name: 'Saint Vincent and the Grenadines', dial: '+1' },
    { name: 'Samoa', dial: '+685' },
    { name: 'San Marino', dial: '+378' },
    { name: 'Sao Tome and Principe', dial: '+239' },
    { name: 'Saudi Arabia', dial: '+966' },
    { name: 'Senegal', dial: '+221' },
    { name: 'Serbia', dial: '+381' },
    { name: 'Seychelles', dial: '+248' },
    { name: 'Sierra Leone', dial: '+232' },
    { name: 'Singapore', dial: '+65' },
    { name: 'Slovakia', dial: '+421' },
    { name: 'Slovenia', dial: '+386' },
    { name: 'Solomon Islands', dial: '+677' },
    { name: 'Somalia', dial: '+252' },
    { name: 'South Africa', dial: '+27' },
    { name: 'South Sudan', dial: '+211' },
    { name: 'Spain', dial: '+34' },
    { name: 'Sri Lanka', dial: '+94' },
    { name: 'Sudan', dial: '+249' },
    { name: 'Suriname', dial: '+597' },
    { name: 'Sweden', dial: '+46' },
    { name: 'Switzerland', dial: '+41' },
    { name: 'Syria', dial: '+963' },
    { name: 'Taiwan', dial: '+886' },
    { name: 'Tajikistan', dial: '+992' },
    { name: 'Tanzania', dial: '+255' },
    { name: 'Thailand', dial: '+66' },
    { name: 'Timor-Leste', dial: '+670' },
    { name: 'Togo', dial: '+228' },
    { name: 'Tonga', dial: '+676' },
    { name: 'Trinidad and Tobago', dial: '+1' },
    { name: 'Tunisia', dial: '+216' },
    { name: 'Turkey', dial: '+90' },
    { name: 'Turkmenistan', dial: '+993' },
    { name: 'Tuvalu', dial: '+688' },
    { name: 'Uganda', dial: '+256' },
    { name: 'Ukraine', dial: '+380' },
    { name: 'UAE', dial: '+971' },
    { name: 'United Arab Emirates', dial: '+971' },
    { name: 'United Kingdom', dial: '+44' },
    { name: 'United States', dial: '+1' },
    { name: 'Uruguay', dial: '+598' },
    { name: 'Uzbekistan', dial: '+998' },
    { name: 'Vanuatu', dial: '+678' },
    { name: 'Venezuela', dial: '+58' },
    { name: 'Vietnam', dial: '+84' },
    { name: 'Yemen', dial: '+967' },
    { name: 'Zambia', dial: '+260' },
    { name: 'Zimbabwe', dial: '+263' }
  ];

  readonly targetOptions = ['Business', 'Ops'];
  form = {
    target: 'Business',
    inviteChannel: 'auto' as InviteChannel,
    requiredState: 'Stable',
    notes: ''
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private organizationService: OrganizationService,
    private businessCenterService: BusinessCenterService
  ) {}

  ngOnInit() {
    this.isAdminUser = this.checkAdminAccess();
    this.loadBusinessProfileState();
    this.loadOrganization();
  }

  ngOnDestroy(): void {
    if (this.redirectAfterSubmitTimer) {
      clearTimeout(this.redirectAfterSubmitTimer);
      this.redirectAfterSubmitTimer = null;
    }
  }

  trialDaysLabel(): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return 'Paid Business features are currently unlocked for your trial.';
    }
    if (this.trialDaysRemaining <= 1) {
      return 'Paid Business features are free today only (last trial day).';
    }
    return `Paid Business features are free for now - ${this.trialDaysRemaining} day(s) left.`;
  }

  businessPaidFeatureNotice(featureLabel: string): string {
    if (!this.isBusinessTrial) {
      return '';
    }
    if (typeof this.trialDaysRemaining !== 'number') {
      return `${featureLabel} is a paid Business feature, currently unlocked in your trial.`;
    }
    if (this.trialDaysRemaining <= 1) {
      return `${featureLabel} is a paid Business feature, free for today only.`;
    }
    return `${featureLabel} is a paid Business feature, free for ${this.trialDaysRemaining} day(s) left.`;
  }

  setRecipientMode(mode: RecipientKind) {
    this.recipientMode = mode;
    this.recipientError = '';
  }

  recipientInputPlaceholder(): string {
    return this.recipientMode === 'email'
      ? 'user@example.com'
      : 'Phone number without country code, e.g. 1012345678';
  }

  recipientEntryHint(): string {
    if (this.recipientMode === 'email') {
      return 'Add one or more emails with +. Each email will receive a Business request invitation.';
    }
    return 'Choose country code, type number, then press +. We will use this number for WhatsApp/SMS invite.';
  }

  trackRecipientById(_: number, item: RequestRecipient) {
    return item.id;
  }

  addRecipient() {
    this.recipientError = '';
    const raw = this.recipientInput.trim();

    if (!raw) {
      this.recipientError = 'Enter email or phone number first.';
      return;
    }

    if (this.recipientMode === 'email') {
      const email = raw.toLowerCase();
      if (!this.isValidEmail(email)) {
        this.recipientError = 'Please enter a valid email format.';
        return;
      }
      if (this.hasRecipient('email', email)) {
        this.recipientError = 'This email is already added.';
        return;
      }

      this.recipients = [
        ...this.recipients,
        {
          id: this.newRecipientId(),
          kind: 'email',
          value: email,
          display: email
        }
      ];
      this.recipientInput = '';
      return;
    }

    const phone = this.normalizePhone(raw);
    if (!phone) {
      this.recipientError = 'Please enter a valid phone number.';
      return;
    }
    if (!this.isValidE164(phone)) {
      this.recipientError = 'Phone must be in E.164 format, for example +201012345678.';
      return;
    }
    if (this.hasRecipient('phone', phone)) {
      this.recipientError = 'This phone number is already added.';
      return;
    }

    this.recipients = [
      ...this.recipients,
      {
        id: this.newRecipientId(),
        kind: 'phone',
        value: phone,
        display: phone
      }
    ];
    this.recipientInput = '';
  }

  removeRecipient(id: string) {
    this.recipients = this.recipients.filter((item) => item.id !== id);
  }

  submitRequest() {
    if (this.businessProfileMissing) {
      this.submitFeedback = {
        type: 'error',
        message: 'No Business Profile Found. Create Business Profile first.'
      };
      return;
    }

    if (!this.canCreateRequests) {
      this.submitFeedback = {
        type: 'error',
        message: this.businessAccessReason || 'Your Business role cannot create requests.'
      };
      return;
    }

    const target = this.form.target.trim();
    const requiredState = this.form.requiredState.trim();
    const inviteChannel = this.normalizeInviteChannel(this.form.inviteChannel);

    if (!target) {
      this.submitFeedback = { type: 'error', message: 'Target is required.' };
      return;
    }
    if (!requiredState) {
      this.submitFeedback = { type: 'error', message: 'Required scan state is required.' };
      return;
    }
    if (!this.consumePendingRecipientInput()) {
      this.submitFeedback = { type: 'error', message: this.recipientError || 'Please fix recipient entry first.' };
      return;
    }
    if (!this.recipients.length) {
      this.submitFeedback = { type: 'error', message: 'Add at least one recipient (email or phone).' };
      return;
    }

    const token = this.getUserToken();
    if (!token) {
      this.submitFeedback = { type: 'error', message: 'Your session expired. Log in again.' };
      return;
    }

    this.submittingRequest = true;
    this.submitFeedback = { type: 'info', message: 'Sending request(s)...' };
    this.lastSubmitError = '';

    const recipientsSnapshot = [...this.recipients];
    from(recipientsSnapshot).pipe(
      concatMap((recipient) =>
        this.submitRecipientWorkflow(
          target,
          recipient,
          requiredState,
          token,
          inviteChannel
        ).pipe(
          timeout(this.submitTimeoutMs),
          catchError((err) => {
            this.lastSubmitError = this.toFriendlyHttpError(
              err,
              'Request timed out. Please try again.'
            );
            return of(false);
          })
        )
      ),
      toArray(),
      finalize(() => {
        this.submittingRequest = false;
      })
    ).subscribe({
      next: (results) => {
        const successCount = results.filter(Boolean).length;

        if (!successCount) {
          this.submitFeedback = {
            type: 'error',
            message: this.lastSubmitError || 'Failed to send requests.'
          };
          return;
        }

        if (successCount < recipientsSnapshot.length) {
          this.submitFeedback = {
            type: 'info',
            message: `Sent ${successCount} of ${recipientsSnapshot.length} request(s). Some recipients failed.`
          };
        } else {
          this.submitFeedback = {
            type: 'success',
            message: `Request(s) sent successfully to ${successCount} recipient(s).`
          };
        }

        this.recipients = [];
        this.recipientInput = '';
        this.form.notes = '';
        this.form.inviteChannel = 'auto';
        this.form.requiredState = 'Stable';
        if (this.redirectAfterSubmitTimer) {
          clearTimeout(this.redirectAfterSubmitTimer);
        }
        this.redirectAfterSubmitTimer = setTimeout(() => {
          this.router.navigate(['/requests']);
        }, 900);
      },
      error: (err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to send requests.')
        };
      }
    });
  }

  private submitRecipientWorkflow(
    target: string,
    recipient: RequestRecipient,
    requiredState: string,
    token: string,
    inviteChannel: InviteChannel
  ): Observable<boolean> {
    const contact = recipient.kind === 'email'
      ? { email: recipient.value }
      : { phone: recipient.value };

    return this.submitRequestPayload(
      target,
      contact,
      requiredState,
      token,
      Boolean(contact.email || contact.phone),
      inviteChannel
    ).pipe(
      catchError((err) => {
        this.lastSubmitError = this.toFriendlyHttpError(err, 'Failed to send request.');
        return of(false);
      })
    );
  }

  private consumePendingRecipientInput(): boolean {
    if (!this.recipientInput.trim()) {
      return true;
    }

    this.addRecipient();
    return !this.recipientError;
  }

  private normalizePhone(raw: string): string | null {
    const cleaned = raw.trim();
    if (!cleaned) {
      return null;
    }

    if (cleaned.startsWith('+')) {
      const digits = cleaned.replace(/[^\d]/g, '');
      if (digits.length < 8 || digits.length > 15) {
        return null;
      }
      return `+${digits}`;
    }

    const localDigits = cleaned.replace(/[^\d]/g, '');
    const withoutLeadingZero = localDigits.replace(/^0+/, '');
    if (withoutLeadingZero.length < 7 || withoutLeadingZero.length > 15) {
      return null;
    }

    const countryCode = this.selectedCountryCode.startsWith('+')
      ? this.selectedCountryCode
      : `+${this.selectedCountryCode}`;

    return `${countryCode}${withoutLeadingZero}`;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isValidE164(value: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(value);
  }

  private hasRecipient(kind: RecipientKind, value: string): boolean {
    return this.recipients.some((item) => item.kind === kind && item.value === value);
  }

  private newRecipientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private loadOrganization() {
    this.organizationService.getUserOrganization().pipe(
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to load organization profile.')
        };
        return of(null);
      })
    ).subscribe((org) => {
      this.org = org;
      if (!this.form.target.trim()) {
        this.form.target = 'Business';
      }
    });
  }

  private loadBusinessProfileState() {
    this.loadingBusinessProfile = true;
    this.businessProfileMissing = false;
    this.businessAccessReason = '';
    this.canCreateRequests = false;
    this.accessState = null;

    this.businessCenterService.getHubAccessState().pipe(
      timeout(this.businessProfileTimeoutMs),
      catchError((err) => {
        this.submitFeedback = {
          type: 'error',
          message: this.toFriendlyHttpError(err, 'Failed to load business profile.')
        };
        return of(null);
      }),
      finalize(() => {
        this.loadingBusinessProfile = false;
      })
    ).subscribe((state) => {
      if (!state) {
        return;
      }

      this.accessState = state;
      const profile = state.profile;
      this.businessAccessReason = state.reason || '';
      this.memberRoleLabel = this.toTitleCase((state.memberRole ?? '').toString()) || 'User';

      if (!profile?.id) {
        this.businessProfileMissing = true;
        this.currentPlanCode = 'free';
        this.currentPlanName = 'Free';
        this.isBusinessTrial = false;
        this.trialDaysRemaining = null;
        this.businessTrialNotice = '';
        this.businessInviteTrialNotice = '';
        this.canCreateRequests = false;
        return;
      }

      this.businessProfileMissing = false;
      const rawPlanCode = (profile.plan_code ?? '').toString().trim().toLowerCase();
      this.currentPlanCode = rawPlanCode || 'business';
      this.currentPlanName = this.currentPlanCode === 'business'
        ? 'Business'
        : this.toTitleCase(this.currentPlanCode);

      const billingStatus = (profile.billing_status ?? '').toString().trim().toLowerCase();
      this.isBusinessTrial = billingStatus === 'trial' && !state.trialExpired;
      this.trialDaysRemaining = this.isBusinessTrial
        ? this.daysUntil(state.trialExpiresAt)
        : null;
      this.businessTrialNotice = this.businessPaidFeatureNotice('Create requests');
      this.businessInviteTrialNotice = this.businessPaidFeatureNotice('Email or phone invites');

      this.canCreateRequests =
        Boolean(state.hasPaidAccess) &&
        Boolean(state.permissions?.canUseSystem) &&
        !state.trialExpired;

      if (!this.canCreateRequests && !this.businessAccessReason) {
        if (state.trialExpired) {
          this.businessAccessReason = 'Business trial expired. Please upgrade to continue.';
        } else if (state.permissions?.isReadOnly) {
          this.businessAccessReason = 'Your company role is viewer (read-only).';
        } else {
          this.businessAccessReason = 'Business access is not active for this account.';
        }
      }

      if (!this.org?.id && state.orgId) {
        const orgName = profile.business_name || profile.company_name || 'Business Profile';
        this.org = {
          id: state.orgId,
          name: orgName
        };
      }
    });
  }

  openCreateBusinessProfile() {
    this.router.navigate(['/payment'], {
      queryParams: { onboarding: 'required' }
    });
  }

  private submitRequestPayload(
    target: string,
    contact: { userId?: string; email?: string; phone?: string },
    requiredState: string,
    token: string | null,
    createInvite = false,
    inviteChannel: InviteChannel = 'auto'
  ): Observable<boolean> {
    const recipientPayload = this.buildRecipientPayload(contact);
    if (!recipientPayload) {
      this.lastSubmitError = 'Add one valid recipient (user, email, or phone).';
      return of(false);
    }

    const currentUser = this.getCurrentUserContext();
    const requestedForUser =
      recipientPayload.requested_for_user ??
      currentUser.id ??
      undefined;
    const requestedForEmail =
      recipientPayload.requested_for_email ??
      currentUser.email ??
      undefined;

    const payload: CreateRequestPayload = {
      Target: target,
      required_state: requiredState,
      ...(this.org?.id ? { org_id: this.org.id } : {}),
      ...(this.org?.id ? { requested_by_org: this.org.id } : {}),
      ...recipientPayload,
      requested_for_user: requestedForUser,
      requested_for_email: requestedForEmail
    };

    return this.createRequest(payload, token).pipe(
      map((res) => {
        if (createInvite && res?.data?.id) {
          this.createInvite(res.data.id, contact, token, inviteChannel);
        }
        return true;
      }),
      catchError((err) => {
        this.lastSubmitError = this.toFriendlySubmitError(err);
        return of(false);
      })
    );
  }

  private createRequest(payload: CreateRequestPayload, token: string | null) {
    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    console.info('[create-request] final payload -> /items/requests', payload);
    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/items/requests`,
      payload,
      requestOptions
    ).pipe(
      catchError((err) => {
        if (err?.status === 500) {
          console.error('[create-request] requests API 500 response body:', err?.error ?? err);
        } else {
          console.error('[create-request] requests API error response body:', err?.error ?? err);
        }

        if (!this.shouldRetryWithLowercaseTarget(err)) {
          return throwError(() => err);
        }

        const fallbackPayload = this.createTargetFallbackPayload(payload);
        if (!fallbackPayload) {
          return throwError(() => err);
        }

        return this.http.post<{ data?: { id?: string } }>(
          `${environment.API_URL}/items/requests`,
          fallbackPayload,
          requestOptions
        );
      })
    );
  }

  private createInvite(
    requestId: string | number,
    contact: { email?: string; phone?: string },
    token: string | null,
    inviteChannel: InviteChannel
  ) {
    const inviteToken = this.buildInviteToken();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const channel = this.resolveInviteChannel(contact, inviteChannel);
    const payload = {
      org_id: this.org?.id ?? undefined,
      request: requestId,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      channel,
      token: inviteToken,
      status: 'Sent',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    const headers = this.buildAuthHeaders(token);
    const requestOptions = headers ? { headers, withCredentials: true } : { withCredentials: true };
    this.http.post(
      `${environment.API_URL}/items/request_invites`,
      payload,
      requestOptions
    ).pipe(
      catchError(() => of(null))
    ).subscribe();
  }

  private buildAuthHeaders(token: string | null): HttpHeaders | null {
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private normalizeInviteChannel(value: string): InviteChannel {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'email' || normalized === 'whatsapp' || normalized === 'sms') {
      return normalized;
    }
    return 'auto';
  }

  private resolveInviteChannel(
    contact: { email?: string; phone?: string },
    inviteChannel: InviteChannel
  ): 'email' | 'whatsapp' | 'sms' {
    if (inviteChannel === 'email' && contact.email) {
      return 'email';
    }
    if (inviteChannel === 'whatsapp' && contact.phone) {
      return 'whatsapp';
    }
    if (inviteChannel === 'sms' && contact.phone) {
      return 'sms';
    }
    if (contact.email) {
      return 'email';
    }
    if (contact.phone) {
      return inviteChannel === 'sms' ? 'sms' : 'whatsapp';
    }
    return 'email';
  }

  private buildInviteToken() {
    const random = Math.random().toString(36).slice(2, 12);
    const time = Date.now().toString(36);
    return `${time}${random}`.slice(0, 20);
  }

  private checkAdminAccess(): boolean {
    const token = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!token) {
      return false;
    }

    const payload = this.decodeJwtPayload(token);
    return payload?.['admin_access'] === true;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private getUserToken(): string | null {
    const userToken = localStorage.getItem('token') ?? localStorage.getItem('access_token') ?? localStorage.getItem('directus_token');
    if (!userToken || this.isTokenExpired(userToken)) {
      return null;
    }
    return userToken;
  }

  private isTokenExpired(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (typeof exp !== 'number') {
        return false;
      }
      return Math.floor(Date.now() / 1000) >= exp;
    } catch {
      return false;
    }
  }

  private shouldRetryWithLowercaseTarget(err: any): boolean {
    const message = this.readApiError(err).toLowerCase();
    return message.includes('target') && (message.includes('field') || message.includes('payload'));
  }

  private createTargetFallbackPayload(payload: CreateRequestPayload): Record<string, unknown> | null {
    if (!payload.Target) {
      return null;
    }

    const { Target, ...rest } = payload;
    return {
      ...rest,
      target: Target
    };
  }

  private buildRecipientPayload(contact: {
    userId?: string;
    email?: string;
    phone?: string;
  }): Pick<CreateRequestPayload, 'requested_for_user' | 'requested_for_email' | 'requested_for_phone'> | null {
    const userId = (contact.userId ?? '').trim();
    const email = (contact.email ?? '').trim().toLowerCase();
    const phone = (contact.phone ?? '').trim();

    const provided = [userId, email, phone].filter((value) => value.length > 0);
    if (provided.length !== 1) {
      return null;
    }

    if (userId) {
      return { requested_for_user: userId };
    }
    if (email) {
      if (!this.isValidEmail(email)) {
        return null;
      }
      return { requested_for_email: email };
    }
    if (phone) {
      if (!this.isValidE164(phone)) {
        return null;
      }
      return { requested_for_phone: phone };
    }
    return null;
  }

  private toFriendlySubmitError(err: any): string {
    return this.toFriendlyHttpError(err, 'Failed to create request.');
  }

  private toFriendlyHttpError(err: any, fallback: string): string {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const raw = this.readApiError(err, fallback);
    const normalized = raw.toLowerCase();

    if (
      status === 0 ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('connection refused')
    ) {
      return `Network error: ${raw || fallback}`;
    }

    if (normalized.includes('timeout')) {
      return `Network error: ${raw || fallback}`;
    }

    if (status >= 500) {
      return `Server error (${status}): ${raw || fallback}`;
    }

    if (status >= 400) {
      return `Request error (${status}): ${raw || fallback}`;
    }

    return raw || fallback;
  }

  private readApiError(err: any, fallback = 'Failed to send request.'): string {
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.message ||
      err?.message ||
      fallback
    );
  }

  private daysUntil(value: string | null): number | null {
    if (!value) {
      return null;
    }
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return null;
    }
    const remainingMs = timestamp - Date.now();
    if (remainingMs <= 0) {
      return 0;
    }
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  }

  private toTitleCase(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  private getCurrentUserContext(): { id: string | null; email: string | null } {
    const token = this.getUserToken();
    const payload = token ? this.decodeJwtPayload(token) : null;
    const storedId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('current_user_id') : null;
    const storedEmail =
      typeof localStorage !== 'undefined' ? localStorage.getItem('user_email') : null;

    const payloadId = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    const payloadEmail = payload?.['email'];
    const id = this.normalizeId(payloadId) ?? this.normalizeId(storedId);
    const email = this.normalizeEmail(payloadEmail) ?? this.normalizeEmail(storedEmail);
    return { id, email };
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value);
    }
    return null;
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const email = value.trim().toLowerCase();
    return this.isValidEmail(email) ? email : null;
  }

}

type CreateRequestPayload = {
  Target: string;
  org_id?: string;
  requested_by_org?: string;
  scan_id?: string;
  requested_for_user?: string;
  requested_for_email?: string;
  requested_for_phone?: string;
  required_state: string;
};

type InviteChannel = 'auto' | 'email' | 'whatsapp' | 'sms';

