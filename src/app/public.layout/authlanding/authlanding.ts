import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, AfterViewInit, OnDestroy, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { of, Subscription } from 'rxjs';
import { catchError, filter, finalize, map, switchMap, timeout } from 'rxjs/operators';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';

@Component({
  selector: 'app-authlanding',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ViewportDialogComponent],
  templateUrl: './authlanding.html',
  styleUrls: ['./authlanding.css']
})
export class Authlanding implements AfterViewInit, OnInit, OnDestroy {
  private readonly authTimeoutMs = 20000;
  private readonly namePattern = /^[\p{L}\p{M}' -]+$/u;
  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly signupPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;

  presentationStates = [
    {
      shortLabel: 'Scope',
      label: 'Organization Scope',
      kicker: 'Define the operating frame',
      title: 'Start with the team structure.',
      body: 'Align Organization, Company, and Department context before teams coordinate daily workforce operations.'
    },
    {
      shortLabel: 'Requests',
      label: 'Scan Requests',
      kicker: 'Coordinate the next step',
      title: 'Keep requests moving.',
      body: 'Create a clear web workflow for coordinating Scan Requests and follow-up across operational teams.'
    },
    {
      shortLabel: 'Alerts',
      label: 'Alerts',
      kicker: 'Review what needs attention',
      title: 'See returned alerts in one inbox.',
      body: 'Bring operational alert visibility into a focused web surface for review and follow-up.'
    },
    {
      shortLabel: 'Reports',
      label: 'Compliance & Reports',
      kicker: 'Close the loop',
      title: 'Track coverage and reporting.',
      body: 'Review Compliance coverage and reporting surfaces as part of the same operational rhythm.'
    }
  ];

  activePresentationIndex = 0;
  authMode: 'signup' | 'login' | null = null;
  submitting = false;
  resolvingOrganizationAccess = false;
  feedback = '';
  inviteMode = false;
  showSignupPassword = false;
  showLoginPassword = false;
  loginEmailTouched = false;
  signupSubmitAttempted = false;
  duplicateSignupRecovery = false;
  signupTouched = {
    firstName: false,
    lastName: false,
    email: false,
    password: false
  };
  signupErrors: Record<keyof typeof this.signupTouched, string | null> = {
    firstName: null,
    lastName: null,
    email: null,
    password: null
  };

  signup = {
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  };

  login = {
    email: '',
    password: ''
  };

  private routeSub?: Subscription;
  private authQuerySub?: Subscription;
  private revealObserver: IntersectionObserver | null = null;
  private pendingAuthNotice = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private invites: InviteService,
    private postLoginRouting: PostLoginRoutingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const authNotice = this.auth.consumeAuthNotice();
    if (authNotice) {
      this.pendingAuthNotice = authNotice;
      this.feedback = authNotice;
    }
    this.applyRouteAuthMode();
    this.authQuerySub = this.route.queryParamMap.subscribe(() => {
      this.applyRouteAuthMode();
    });
    this.routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.focusProductFragment();
      });
  }

  ngAfterViewInit() {
    this.setupReveal();
    setTimeout(() => this.focusProductFragment(), 0);
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.authQuerySub?.unsubscribe();
    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showAuthModal && !this.authBusy) {
      this.closeAuth();
    }
  }

  get showAuthModal(): boolean {
    return this.authMode === 'signup' || this.authMode === 'login';
  }

  get authBusy(): boolean {
    return this.submitting || this.resolvingOrganizationAccess;
  }

  get authPanelClass(): string[] {
    return ['auth-card', this.authMode === 'login' ? 'auth-card--login' : 'auth-card--signup'];
  }

  openAuth(mode: 'signup' | 'login' = 'signup') {
    this.authMode = mode;
    this.feedback = this.pendingAuthNotice;
    this.resolvingOrganizationAccess = false;
    this.duplicateSignupRecovery = false;
    if (mode === 'signup') {
      this.resetSignupValidationState();
    }
    this.cdr.detectChanges();
    this.focusFirstField();
  }

  private isValidEmail(value: string): boolean {
    return this.emailPattern.test((value ?? '').trim());
  }

  get loginEmailInvalid(): boolean {
    return (
      this.loginEmailTouched &&
      this.login.email.trim().length > 0 &&
      !this.isValidEmail(this.login.email)
    );
  }

  get signupPasswordChecklist(): { label: string; met: boolean }[] {
    const password = this.signup.password ?? '';
    return [
      { label: 'At least 10 characters', met: password.length >= 10 },
      { label: 'Includes a letter', met: /[A-Za-z]/.test(password) },
      { label: 'Includes a number', met: /\d/.test(password) }
    ];
  }

  get signupFormValid(): boolean {
    return (
      this.computeSignupFieldError('firstName') === null &&
      this.computeSignupFieldError('lastName') === null &&
      this.computeSignupFieldError('email') === null &&
      this.computeSignupFieldError('password') === null
    );
  }

  get loginFormValid(): boolean {
    return this.isValidEmail(this.login.email) && this.login.password.trim().length > 0;
  }

  get activePresentation() {
    return this.presentationStates[this.activePresentationIndex] ?? this.presentationStates[0];
  }

  selectPresentationState(index: number): void {
    if (index < 0 || index >= this.presentationStates.length) {
      return;
    }
    this.activePresentationIndex = index;
    this.cdr.detectChanges();
  }

  private focusFirstField(): void {
    if (typeof document === 'undefined') {
      return;
    }
    setTimeout(() => {
      const input = document.querySelector('.auth-card input') as HTMLInputElement | null;
      input?.focus();
    }, 60);
  }

  closeAuth(navigateHome = true) {
    this.authMode = null;
    this.feedback = this.pendingAuthNotice;
    this.submitting = false;
    this.resolvingOrganizationAccess = false;
    this.duplicateSignupRecovery = false;
    this.cdr.detectChanges();
    if (navigateHome && this.isAuthRoute()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { auth: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  switchAuth(mode: 'signup' | 'login') {
    this.authMode = mode;
    this.feedback = this.pendingAuthNotice;
    this.resolvingOrganizationAccess = false;
    this.duplicateSignupRecovery = false;
    if (mode === 'signup') {
      this.resetSignupValidationState();
    }
    this.cdr.detectChanges();
    this.focusFirstField();
  }

  toggleSignupPasswordVisibility() {
    this.showSignupPassword = !this.showSignupPassword;
  }

  toggleLoginPasswordVisibility() {
    this.showLoginPassword = !this.showLoginPassword;
  }

  markSignupFieldTouched(field: keyof typeof this.signupTouched): void {
    this.signupTouched[field] = true;

    if (field === 'firstName' || field === 'lastName') {
      this.signup[field] = this.normalizeName(this.signup[field]);
    } else if (field === 'email') {
      this.signup.email = this.signup.email.trim();
    }

    this.refreshSignupFieldError(field);
  }

  handleSignupFieldInput(field: keyof typeof this.signupTouched, value: string): void {
    this.signup[field] = value;

    if (this.shouldShowSignupError(field)) {
      this.refreshSignupFieldError(field);
    }
  }

  shouldShowSignupError(field: keyof typeof this.signupTouched): boolean {
    return this.signupTouched[field] || this.signupSubmitAttempted;
  }

  hasSignupFieldError(field: keyof typeof this.signupTouched): boolean {
    return this.shouldShowSignupError(field) && this.signupErrors[field] !== null;
  }

  signupFieldError(field: keyof typeof this.signupTouched): string | null {
    return this.signupErrors[field] ?? this.computeSignupFieldError(field);
  }

  private computeSignupFieldError(field: keyof typeof this.signupTouched): string | null {
    if (field === 'firstName') {
      return this.validateName(this.signup.firstName, 'First name');
    }

    if (field === 'lastName') {
      return this.validateName(this.signup.lastName, 'Last name');
    }

    if (field === 'email') {
      const email = this.signup.email.trim();
      if (!email) {
        return 'Email address is required.';
      }
      return this.isValidEmail(email) ? null : 'Enter a valid email address.';
    }

    const password = this.signup.password ?? '';
    if (!password) {
      return 'Password is required.';
    }
    return this.signupPasswordPattern.test(password)
      ? null
      : 'Password must be 10 to 128 characters and include at least one letter and one number.';
  }

  submitSignup() {
    if (this.authBusy) {
      return;
    }

    this.signupSubmitAttempted = true;
    this.signupTouched = {
      firstName: true,
      lastName: true,
      email: true,
      password: true
    };
    this.normalizeSignupFields();
    this.refreshSignupErrors();

    if (!this.signupFormValid) {
      this.focusFirstInvalidSignupField();
      return;
    }

    const email = this.signup.email.trim();
    const password = this.signup.password;

    this.submitting = true;
    this.duplicateSignupRecovery = false;
    this.feedback = 'Creating your account...';
    this.auth.signup({
      email,
      password,
      first_name: this.signup.firstName,
      last_name: this.signup.lastName
    }).pipe(
      timeout(this.authTimeoutMs),
      switchMap(() => {
        this.feedback = 'Account created. Signing you in...';
        return this.auth.login(email, password).pipe(
          timeout(this.authTimeoutMs),
          // Legacy old-`requests` pending-request check removed.
          map((loginResult) => ({
            loginResult,
            hasRequest: false
          })),
          catchError((err) => {
            this.authMode = 'login';
            this.login.email = email;
            this.feedback = this.resolvePostSignupLoginError(err);
            this.submitting = false;
            return of(null);
          })
        );
      }),
      catchError((err) => {
        this.feedback = this.resolveSignupError(err);
        this.submitting = false;
        return of(null);
      })
    ).subscribe(async (result) => {
      if (!result?.loginResult) {
        return;
      }

      this.submitting = false;

      const inviteToken = this.resolveInviteTokenFromContext();
      if (inviteToken) {
        this.closeAuth(false);
        await this.router.navigate(['/invites/claim'], {
          queryParams: { token: inviteToken },
          replaceUrl: true
        });
        return;
      }

      this.closeAuth(false);
      const nextRoute = await this.resolvePostLoginDestinationOrShowAccessError();
      await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
    });
  }

  submitLogin() {
    if (this.authBusy) {
      return;
    }

    this.submitting = true;
    this.resolvingOrganizationAccess = false;
    this.duplicateSignupRecovery = false;
    this.feedback = 'Signing you in...';
    this.auth.login(this.login.email.trim(), this.login.password).pipe(
      timeout(this.authTimeoutMs),
      catchError((err) => {
        this.feedback = this.resolveLoginError(err);
        return of(null);
      }),
      finalize(() => {
        this.submitting = false;
        this.cdr.detectChanges();
      })
    ).subscribe(async (result) => {
      if (!result) {
        return;
      }

      const inviteToken = this.resolveInviteTokenFromContext();
      if (inviteToken) {
        this.closeAuth(false);
        await this.router.navigate(['/invites/claim'], {
          queryParams: { token: inviteToken },
          replaceUrl: true
        });
        return;
      }

      const nextRoute = await this.resolvePostLoginDestinationOrShowAccessError();
      if (!nextRoute) {
        return;
      }

      this.closeAuth(false);
      await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
    });
  }

  continueWithGoogle() {
    const inviteToken = this.resolveInviteTokenFromContext();
    if (inviteToken) {
      this.invites.setPendingInviteToken(inviteToken);
      this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(inviteToken)}`);
    }
    this.auth.loginWithGoogle();
  }

  private applyRouteAuthMode() {
    this.captureInviteFromQuery();

    const hasInvite = this.route.snapshot.queryParamMap.has('invite');
    const path = this.route.snapshot.routeConfig?.path;
    if (hasInvite && path === 'login') {
      this.openAuth('signup');
      return;
    }

    const dataMode = this.route.snapshot.data?.['authMode'];
    const queryMode = this.route.snapshot.queryParamMap.get('auth');
    const mode = queryMode ?? dataMode;

    if (mode === 'signup' || mode === 'login') {
      this.openAuth(mode);
      return;
    }

    if (!this.hasInviteContext()) {
      this.authMode = null;
      this.feedback = '';
      this.resolvingOrganizationAccess = false;
    }
  }

  private async resolvePostLoginDestinationOrShowAccessError(): Promise<string | null> {
    this.resolvingOrganizationAccess = true;
    this.feedback = 'Preparing your organization access...';
    this.cdr.detectChanges();

    try {
      const nextRoute = await this.postLoginRouting.resolveDestination();
      this.resolvingOrganizationAccess = false;
      this.feedback = '';
      this.pendingAuthNotice = '';
      this.cdr.detectChanges();
      return nextRoute;
    } catch {
      this.resolvingOrganizationAccess = false;
      this.feedback = '';
      this.pendingAuthNotice = '';
      this.cdr.detectChanges();
      return '/app/workspace-access';
    }
  }

  private isAuthRoute() {
    const path = this.route.snapshot.routeConfig?.path;
    const hasAuthQuery = this.route.snapshot.queryParamMap.has('auth');
    return path === 'login' || path === 'signup' || hasAuthQuery;
  }

  private captureInviteFromQuery() {
    const tokenParam =
      this.route.snapshot.queryParamMap.get('token')?.trim() ??
      this.route.snapshot.queryParamMap.get('code')?.trim() ??
      '';
    const inviteParam = this.route.snapshot.queryParamMap.get('invite')?.trim() ?? '';
    const inviteFlag = inviteParam === '1';
    const inviteToken = tokenParam || (inviteParam && inviteParam !== '1' ? inviteParam : '');

    if (inviteToken) {
      try {
        sessionStorage.setItem('pending_invite_token', inviteToken);
        localStorage.removeItem('pending_invite_token');
      } catch {
        // ignore storage errors
      }

      this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(inviteToken)}`);
    }

    this.inviteMode = Boolean(inviteFlag || inviteToken || this.invites.getPendingInviteToken());

    if (inviteFlag || inviteToken) {
      const requestedMode = (this.route.snapshot.queryParamMap.get('auth') ?? '').trim().toLowerCase();
      this.openAuth(requestedMode === 'login' ? 'login' : 'signup');
    }
  }

  private hasInviteContext(): boolean {
    const query = this.route.snapshot.queryParamMap;
    if (query.has('token') || query.has('code')) {
      return true;
    }

    const inviteParam = query.get('invite')?.trim() ?? '';
    if (inviteParam && inviteParam !== '0') {
      return true;
    }

    return Boolean(this.invites.getPendingInviteToken());
  }

  private resolveInviteTokenFromContext(): string | null {
    const query = this.route.snapshot.queryParamMap;
    const tokenParam = query.get('token')?.trim() ?? '';
    const codeParam = query.get('code')?.trim() ?? '';
    const inviteParam = query.get('invite')?.trim() ?? '';

    const token = tokenParam || codeParam || (inviteParam && inviteParam !== '1' ? inviteParam : '');
    if (token) {
      return token;
    }

    return this.invites.getPendingInviteToken();
  }

  private focusProductFragment(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    if (this.route.snapshot.fragment !== 'product') {
      return;
    }
    const product = document.getElementById('product');
    if (!product) {
      return;
    }
    const reduceMotion = this.prefersReducedMotion();
    product.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    product.focus({ preventScroll: true });
  }

  private resolveSignupError(err: any): string {
    const message =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.message ||
      '';
    const normalized = String(message).toLowerCase();

    if (normalized.includes('timeout')) {
      return 'Signup is taking too long. Please try again.';
    }
    if (err?.status === 409 || normalized.includes('already')) {
      this.duplicateSignupRecovery = true;
      this.login.email = this.signup.email.trim();
      return 'An account already exists for this email. Sign in instead.';
    }
    if (err?.status === 400) {
      return 'Signup data is invalid. Please check your input.';
    }
    return 'Unable to create account right now.';
  }

  private resolveLoginError(err: any): string {
    const message = this.extractAuthErrorMessage(err);
    const normalized = String(message).toLowerCase();

    if (err?.status === 401 || normalized.includes('invalid')) {
      return 'Email or password is incorrect.';
    }
    return 'Unable to sign in right now. Please try again.';
  }

  private extractAuthErrorMessage(err: any): string {
    return (
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.message ||
      ''
    );
  }

  private resolvePostSignupLoginError(err: any): string {
    const message =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.message ||
      '';
    const normalized = String(message).toLowerCase();

    if (normalized.includes('timeout')) {
      return 'Account created, but auto-login timed out. Please log in manually.';
    }
    if (err?.status === 401 || normalized.includes('invalid') || normalized.includes('verify')) {
      return 'Account created successfully. Please verify your email if required, then log in.';
    }
    return 'Account created successfully. Please log in to continue.';
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  setupReveal() {
    if (typeof window === 'undefined') {
      return;
    }

    const elements = Array.from(document.querySelectorAll('.reveal')) as HTMLElement[];
    const reduceMotion = this.prefersReducedMotion();

    if (reduceMotion) {
      elements.forEach((el) => {
        el.classList.add('visible');
        el.style.transitionDelay = '0ms';
      });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('visible'));
      return;
    }

    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    elements.forEach((el, index) => {
      el.style.transitionDelay = `${Math.min(index * 70, 280)}ms`;
      this.revealObserver?.observe(el);
    });
  }

  private normalizeSignupFields(): void {
    this.signup.firstName = this.normalizeName(this.signup.firstName);
    this.signup.lastName = this.normalizeName(this.signup.lastName);
    this.signup.email = this.signup.email.trim();
  }

  private normalizeName(value: string): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/gu, ' ');
  }

  private validateName(value: string, label: string): string | null {
    const normalized = this.normalizeName(value);
    if (!normalized) {
      return `${label} is required.`;
    }

    if (!/[\p{L}\p{M}]/u.test(normalized) || !this.namePattern.test(normalized)) {
      return `Enter a valid ${label.toLowerCase()}.`;
    }

    return null;
  }

  private resetSignupValidationState(): void {
    this.signupSubmitAttempted = false;
    this.signupTouched = {
      firstName: false,
      lastName: false,
      email: false,
      password: false
    };
    this.signupErrors = {
      firstName: null,
      lastName: null,
      email: null,
      password: null
    };
  }

  private focusFirstInvalidSignupField(): void {
    if (typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      const firstInvalid = document.querySelector(
        'input[name="firstName"], input[name="lastName"], input[name="email"], input[name="password"]'
      ) as HTMLInputElement | null;
      const invalidFields = [
        { name: 'firstName', invalid: this.signupErrors.firstName !== null },
        { name: 'lastName', invalid: this.signupErrors.lastName !== null },
        { name: 'email', invalid: this.signupErrors.email !== null },
        { name: 'password', invalid: this.signupErrors.password !== null }
      ];
      const target = invalidFields.find((field) => field.invalid);
      if (!target) {
        return;
      }

      const input = document.querySelector(`input[name="${target.name}"]`) as HTMLInputElement | null;
      (input ?? firstInvalid)?.focus();
    }, 0);
  }

  private refreshSignupFieldError(field: keyof typeof this.signupTouched): void {
    this.signupErrors[field] = this.computeSignupFieldError(field);
  }

  private refreshSignupErrors(): void {
    this.refreshSignupFieldError('firstName');
    this.refreshSignupFieldError('lastName');
    this.refreshSignupFieldError('email');
    this.refreshSignupFieldError('password');
  }

}
