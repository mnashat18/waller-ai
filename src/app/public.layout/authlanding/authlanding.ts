import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { of, Subscription } from 'rxjs';
import { catchError, filter, switchMap, timeout } from 'rxjs/operators';

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
  private snowAnimationFrame: number | null = null;
  private revealObserver: IntersectionObserver | null = null;
  private snowCanvas: HTMLCanvasElement | null = null;
  private readonly handleWindowResize = () => {
    if (!this.snowCanvas) {
      return;
    }
    this.snowCanvas.width = window.innerWidth;
    this.snowCanvas.height = window.innerHeight;
  };

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.applyRouteAuthMode();
    this.routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.applyRouteAuthMode());
  }

  ngAfterViewInit() {
    this.startTextRotation();
    this.startSnow();
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
    if (this.snowAnimationFrame !== null) {
      cancelAnimationFrame(this.snowAnimationFrame);
      this.snowAnimationFrame = null;
    }
    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }
    this.snowCanvas = null;
    window.removeEventListener('resize', this.handleWindowResize);
  }

  openAuth(mode: 'signup' | 'login' = 'signup') {
    this.authMode = mode;
    this.showAuthModal = true;
    this.feedback = '';
  }

  closeAuth() {
    this.showAuthModal = false;
    this.feedback = '';
    this.submitting = false;
    if (this.isAuthRoute()) {
      this.router.navigateByUrl('/');
    }
  }

  switchAuth(mode: 'signup' | 'login') {
    this.authMode = mode;
    this.feedback = '';
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
    ).subscribe((result) => {
      if (!result) {
        return;
      }

      this.submitting = false;
      this.closeAuth();
      this.router.navigateByUrl('/dashboard');
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
    ).subscribe((result) => {
      if (!result) {
        return;
      }

      this.submitting = false;
      this.closeAuth();
      this.router.navigateByUrl('/dashboard');
    });
  }

  continueWithGoogle() {
    this.auth.loginWithGoogle();
  }

  private applyRouteAuthMode() {
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

  /* ===== SNOW PARTICLES ===== */
  startSnow() {
    const canvas = document.getElementById('snow') as HTMLCanvasElement | null;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.snowCanvas = canvas;
    this.handleWindowResize();
    window.addEventListener('resize', this.handleWindowResize);

    const particles = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      vx: Math.random() * 0.3 - 0.15,
      vy: Math.random() * 0.6 + 0.3
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y > canvas.height) p.y = 0;
        if (p.x > canvas.width || p.x < 0) p.x = Math.random() * canvas.width;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      this.snowAnimationFrame = requestAnimationFrame(animate);
    };

    animate();
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

    elements.forEach((el) => {
      el.style.transitionDelay = '0s';
      this.revealObserver?.observe(el);
    });
  }

}
