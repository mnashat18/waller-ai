import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-authlanding',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './authlanding.html',
  styleUrls: ['./authlanding.css']
})
export class Authlanding implements AfterViewInit, OnInit, OnDestroy {

  texts = [
    'Enterprise wellness intelligence for every team.',
    'Daily mobile scans with real-time alerts.',
    'Operational risk insights for managers.',
    'Secure dashboards for clinics and factories.',
    'Upgrade to Admin or Business to scale.'
  ];

  showAuthModal = false;
  authMode: 'signup' | 'login' | 'mobile' = 'signup';
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

  mobile = {
    phone: ''
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

  openAuth(mode: 'signup' | 'login' | 'mobile' = 'signup') {
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

  switchAuth(mode: 'signup' | 'login' | 'mobile') {
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
    }).subscribe({
      next: () => {
        this.feedback = 'Account created. Please log in to continue.';
        this.submitting = false;
        this.switchAuth('login');
      },
      error: () => {
        this.feedback = 'Unable to create account right now.';
        this.submitting = false;
      }
    });
  }

  submitLogin() {
    if (this.submitting) {
      return;
    }

    this.submitting = true;
    this.feedback = 'Signing you in...';
    this.auth.login(this.login.email.trim(), this.login.password).subscribe({
      next: () => {
        this.submitting = false;
        this.closeAuth();
        this.router.navigateByUrl('/dashboard');
      },
      error: () => {
        this.feedback = 'Invalid email or password.';
        this.submitting = false;
      }
    });
  }

  continueWithGoogle() {
    this.auth.loginWithGoogle();
  }

  continueWithMobile() {
    this.closeAuth();
    this.router.navigateByUrl('/download-app');
  }

  private applyRouteAuthMode() {
    const dataMode = this.route.snapshot.data?.['authMode'];
    const queryMode = this.route.snapshot.queryParamMap.get('auth');
    const mode = queryMode ?? dataMode;

    if (mode === 'signup' || mode === 'login' || mode === 'mobile') {
      this.openAuth(mode);
    }
  }

  private isAuthRoute() {
    const path = this.route.snapshot.routeConfig?.path;
    const hasAuthQuery = this.route.snapshot.queryParamMap.has('auth');
    return path === 'login' || path === 'signup' || hasAuthQuery;
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
