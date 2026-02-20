import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { of, Subscription } from 'rxjs';
import { catchError, filter, timeout } from 'rxjs/operators';

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

    this.submitting = true;
    this.feedback = 'Creating your account...';
    this.auth.signup({
      email: this.signup.email.trim(),
      password: this.signup.password,
      first_name: this.signup.firstName.trim(),
      last_name: this.signup.lastName.trim()
    }).pipe(
      timeout(this.authTimeoutMs),
      catchError((err) => {
        this.feedback = this.resolveSignupError(err);
        this.submitting = false;
        return of(null);
      })
    ).subscribe((result) => {
      if (!result) {
        return;
      }

      this.feedback = 'Account created. Log in now and complete Business setup to unlock your 14-day trial.';
      this.submitting = false;
      this.switchAuth('login');
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

  /* ===== TEXT ROTATION ===== */
  startTextRotation() {
    const el = document.getElementById('rotating-text');
    if (!el) {
      return;
    }
    let index = 0;

    const changeText = () => {
      el.classList.remove('show');
      setTimeout(() => {
        el.textContent = this.texts[index];
        el.classList.add('show');
        index = (index + 1) % this.texts.length;
      }, 400);
    };

    changeText();
    setInterval(changeText, 3000);
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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

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

      requestAnimationFrame(animate);
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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    elements.forEach((el) => {
      el.style.transitionDelay = '0s';
      observer.observe(el);
    });
  }

}
