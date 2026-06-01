import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { of, Subscription } from 'rxjs';
import { catchError, filter, map, switchMap, timeout } from 'rxjs/operators';
import { BusinessCenterService } from '../../services/business-center.service';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';

@Component({
  selector: 'app-authlanding',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './authlanding.html',
  styleUrls: ['./authlanding.css']
})
export class Authlanding implements AfterViewInit, OnInit, OnDestroy {
  private readonly authTimeoutMs = 20000;

  texts = [
    'Enterprise wellness intelligence for every team.',
    'Daily mobile scans with real-time alerts.',
    'Operational risk insights for managers.',
    'Secure dashboards for clinics and factories.',
    'New users unlock 14 days of Business after completing setup.',
    'Activate Admin or Business to scale.'
  ];

  showAuthModal = false;
  authMode: 'signup' | 'login' = 'signup';
  submitting = false;
  feedback = '';
  inviteMode = false;
  showSignupPassword = false;
  showLoginPassword = false;

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
  private textRotationInterval: ReturnType<typeof setInterval> | null = null;
  private textRotationSwapTimer: ReturnType<typeof setTimeout> | null = null;
  private revealObserver: IntersectionObserver | null = null;

  constructor(
    private auth: AuthService,
    private businessCenter: BusinessCenterService,
    private router: Router,
    private route: ActivatedRoute,
    private invites: InviteService,
    private postLoginRouting: PostLoginRoutingService
  ) {}

  ngOnInit() {
    this.applyRouteAuthMode();
    this.routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.applyRouteAuthMode());
  }

  ngAfterViewInit() {
    this.startTextRotation();
    this.setupReveal();
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    if (this.textRotationInterval) {
      clearInterval(this.textRotationInterval);
      this.textRotationInterval = null;
    }
    if (this.textRotationSwapTimer) {
      clearTimeout(this.textRotationSwapTimer);
      this.textRotationSwapTimer = null;
    }
    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }
  }

  openAuth(mode: 'signup' | 'login' = 'signup') {
    this.authMode = mode;
    this.showAuthModal = true;
    this.feedback = '';
  }

  closeAuth(navigateHome = true) {
    this.showAuthModal = false;
    this.feedback = '';
    this.submitting = false;
    if (navigateHome && this.isAuthRoute()) {
      this.router.navigateByUrl('/');
    }
  }

  switchAuth(mode: 'signup' | 'login') {
    this.authMode = mode;
    this.feedback = '';
  }

  toggleSignupPasswordVisibility() {
    this.showSignupPassword = !this.showSignupPassword;
  }

  toggleLoginPasswordVisibility() {
    this.showLoginPassword = !this.showLoginPassword;
  }

  submitSignup() {
    if (this.submitting) {
      return;
    }

    const email = this.signup.email.trim();
    const password = this.signup.password;

    this.submitting = true;
    this.feedback = 'Creating your account...';
    this.auth.signup({
      email,
      password,
      first_name: this.signup.firstName.trim(),
      last_name: this.signup.lastName.trim()
    }).pipe(
      timeout(this.authTimeoutMs),
      switchMap(() => {
        this.feedback = 'Account created. Signing you in...';
        return this.auth.login(email, password).pipe(
          timeout(this.authTimeoutMs),
          switchMap((loginResult) =>
            this.businessCenter.hasRequestForEmail(email).pipe(
              map((hasRequest) => ({
                loginResult,
                hasRequest
              }))
            )
          ),
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
      this.closeAuth(false);

      const inviteToken = this.resolveInviteTokenFromContext();
      if (inviteToken) {
        await this.router.navigate(['/invites/claim'], {
          queryParams: { token: inviteToken },
          replaceUrl: true
        });
        return;
      }

      const nextRoute = await this.postLoginRouting.resolveDestination();
      const hasActiveWorkspace = this.hasActiveWorkspaceContext();
      const shouldSkipRequestWelcome =
        this.inviteMode ||
        hasActiveWorkspace ||
        (nextRoute && nextRoute !== '/app/workspace-access');

      if (shouldSkipRequestWelcome) {
        await this.router.navigateByUrl(nextRoute || '/app/workspace-access', { replaceUrl: true });
        return;
      }

      const postAuthRedirect = this.auth.consumePostAuthRedirect('/dashboard');
      this.router.navigate(['/request-welcome'], {
        queryParams: {
          hasRequest: result.hasRequest ? '1' : '0',
          email,
          next: postAuthRedirect
        }
      });
    });
  }

  submitLogin() {
    if (this.submitting) {
      return;
    }

    this.submitting = true;
    this.feedback = 'Signing you in...';
    this.auth.login(this.login.email.trim(), this.login.password).pipe(
      timeout(this.authTimeoutMs),
      catchError((err) => {
        this.feedback = this.resolveLoginError(err);
        this.submitting = false;
        return of(null);
      })
    ).subscribe(async (result) => {
      if (!result) {
        return;
      }

      this.submitting = false;
      this.closeAuth(false);

      const inviteToken = this.resolveInviteTokenFromContext();
      if (inviteToken) {
        await this.router.navigate(['/invites/claim'], {
          queryParams: { token: inviteToken },
          replaceUrl: true
        });
        return;
      }

      const nextRoute = await this.postLoginRouting.resolveDestination();
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
        localStorage.setItem('pending_invite_token', inviteToken);
      } catch {
        // ignore storage errors
      }

      this.auth.setPostAuthRedirect(`/invites/claim?token=${encodeURIComponent(inviteToken)}`);
    }

    this.inviteMode = Boolean(inviteFlag || inviteToken || this.invites.getPendingInviteToken());

    if (inviteToken && this.auth.isLoggedIn()) {
      void this.router.navigate(['/invites/claim'], {
        queryParams: { token: inviteToken },
        replaceUrl: true
      });
      return;
    }

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

  private hasActiveWorkspaceContext(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    const activeBusinessProfileId =
      localStorage.getItem('active_business_profile_id')?.trim() ??
      localStorage.getItem('active_business_profile')?.trim() ??
      '';
    const activeRole = (localStorage.getItem('active_member_role') ?? '').trim().toLowerCase();
    return Boolean(activeBusinessProfileId && activeRole);
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
      return 'This email is already registered. Try logging in instead.';
    }
    if (err?.status === 400) {
      return 'Signup data is invalid. Please check your input.';
    }
    return 'Unable to create account right now.';
  }

  private resolveLoginError(err: any): string {
    const message =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.error?.error ||
      err?.message ||
      '';
    const normalized = String(message).toLowerCase();

    if (normalized.includes('timeout')) {
      return 'Login is taking too long. Please try again.';
    }
    if (err?.status === 401 || normalized.includes('invalid')) {
      return 'Invalid email or password.';
    }
    return 'Unable to login right now.';
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

  /* ===== TEXT ROTATION ===== */
  startTextRotation() {
    const el = document.getElementById('rotating-text');
    if (!el) {
      return;
    }

    if (this.textRotationInterval) {
      clearInterval(this.textRotationInterval);
      this.textRotationInterval = null;
    }
    if (this.textRotationSwapTimer) {
      clearTimeout(this.textRotationSwapTimer);
      this.textRotationSwapTimer = null;
    }

    let index = 0;

    const changeText = () => {
      el.classList.remove('show');
      if (this.textRotationSwapTimer) {
        clearTimeout(this.textRotationSwapTimer);
      }
      this.textRotationSwapTimer = setTimeout(() => {
        el.textContent = this.texts[index];
        el.classList.add('show');
        index = (index + 1) % this.texts.length;
      }, 400);
    };

    changeText();
    this.textRotationInterval = setInterval(changeText, 3000);
  }

  setupReveal() {
    if (typeof window === 'undefined') {
      return;
    }

    const elements = Array.from(document.querySelectorAll('.reveal')) as HTMLElement[];
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
      el.style.transitionDelay = `${Math.min(index * 90, 450)}ms`;
      this.revealObserver?.observe(el);
    });
  }

}
