import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, HostListener, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-public.layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule],
  templateUrl: './public.layout.html',
  styleUrl: './public.layout.css'
})
export class PublicLayout implements AfterViewInit, OnDestroy {
  showScrollTop = false;
  isTransitioning = false;

  private navSub?: Subscription;
  private transitionStartTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientFrame: number | null = null;
  private ambientCanvas: HTMLCanvasElement | null = null;
  private ambientResizeHandler: (() => void) | null = null;

  constructor(private router: Router) {}

  ngAfterViewInit() {
    this.startSnow();
    // Defer first check to the next tick to avoid NG0100 during first render cycle.
    setTimeout(() => this.updateScrollTop(), 0);

    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.triggerTransition();
      }
    });
  }

  @HostListener('window:scroll')
  updateScrollTop() {
    if (typeof window === 'undefined') {
      this.showScrollTop = false;
      return;
    }
    this.showScrollTop = window.scrollY > 200;
  }

  scrollToTop() {
    if (typeof window === 'undefined') {
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startSnow() {
    const canvas = document.getElementById('snow') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    this.ambientResizeHandler = resize;
    window.addEventListener('resize', resize);
    this.ambientCanvas = canvas;

    const particles = Array.from({ length: 54 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.6,
      vx: Math.random() * 0.12 - 0.06,
      vy: Math.random() * 0.22 + 0.05,
      hue: [188, 212, 260, 42][Math.floor(Math.random() * 4)],
      phase: Math.random() * Math.PI * 2,
      twinkle: Math.random() * 0.45 + 0.2
    }));

    const animate = () => {
      ctx.fillStyle = 'rgba(5, 8, 22, 0.12)';
      ctx.fillRect(0, 0, width, height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > height + 20) p.y = -20;
        if (p.x > width + 20) p.x = -20;
        if (p.x < -20) p.x = width + 20;

        const alpha = 0.2 + Math.sin(Date.now() * 0.001 + p.phase) * 0.14;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        gradient.addColorStop(0, `hsla(${p.hue}, 92%, 74%, ${Math.max(alpha, 0.05)})`);
        gradient.addColorStop(0.35, `hsla(${p.hue}, 92%, 60%, ${Math.max(alpha * p.twinkle, 0.025)})`);
        gradient.addColorStop(1, 'hsla(0, 0%, 100%, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4.2, 0, Math.PI * 2);
        ctx.fill();
      });

      this.ambientFrame = requestAnimationFrame(animate);
    };

    animate();
  }

  private triggerTransition() {
    if (this.transitionStartTimer) {
      clearTimeout(this.transitionStartTimer);
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }

    this.isTransitioning = false;
    this.transitionStartTimer = setTimeout(() => {
      this.isTransitioning = true;
      this.transitionTimer = setTimeout(() => {
        this.isTransitioning = false;
      }, 420);
    }, 0);
  }

  ngOnDestroy() {
    this.navSub?.unsubscribe();
    if (this.transitionStartTimer) {
      clearTimeout(this.transitionStartTimer);
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }
    if (this.ambientFrame !== null) {
      cancelAnimationFrame(this.ambientFrame);
      this.ambientFrame = null;
    }
    if (this.ambientResizeHandler) {
      window.removeEventListener('resize', this.ambientResizeHandler);
      this.ambientResizeHandler = null;
    }
    this.ambientCanvas = null;
  }
}
