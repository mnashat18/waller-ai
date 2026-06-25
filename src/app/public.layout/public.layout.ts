import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
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
  mobileMenuOpen = false;
  isCompactNav = false;

  @ViewChild('menuTrigger') private menuTrigger?: ElementRef<HTMLButtonElement>;

  private navSub?: Subscription;
  private transitionStartTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private navMediaQuery: MediaQueryList | null = null;
  private navMediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(private router: Router) {}

  ngAfterViewInit() {
    this.setupCompactNavigationState();
    // Defer first check to the next tick to avoid NG0100 during first render cycle.
    setTimeout(() => this.updateScrollTop(), 0);

    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.mobileMenuOpen = false;
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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (!this.mobileMenuOpen) {
      return;
    }

    this.closeMobileMenu();
    if (this.isCompactNav) {
      this.menuTrigger?.nativeElement.focus();
    }
  }

  scrollToTop() {
    if (typeof window === 'undefined') {
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  isActiveRoute(path: string): boolean {
    const current = this.router.url.split('?')[0].split('#')[0] || '/';
    return current === path;
  }

  get navHiddenFromAssistiveTechnology(): boolean {
    return this.isCompactNav && !this.mobileMenuOpen;
  }

  get navInert(): '' | null {
    return this.navHiddenFromAssistiveTechnology ? '' : null;
  }

  private setupCompactNavigationState(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    this.navMediaQuery = window.matchMedia('(max-width: 900px)');
    this.isCompactNav = this.navMediaQuery.matches;
    this.navMediaListener = (event: MediaQueryListEvent) => {
      this.isCompactNav = event.matches;
      if (!this.isCompactNav) {
        this.mobileMenuOpen = false;
      }
    };
    this.navMediaQuery.addEventListener('change', this.navMediaListener);
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
    if (this.navMediaQuery && this.navMediaListener) {
      this.navMediaQuery.removeEventListener('change', this.navMediaListener);
    }
    if (this.transitionStartTimer) {
      clearTimeout(this.transitionStartTimer);
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }
  }
}
