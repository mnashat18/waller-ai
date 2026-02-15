import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { HeaderComponent } from './header/header';
import { SidebarComponent } from './sidebar/sidebar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, SidebarComponent],
  template: `
    <!-- ========================= -->
    <!-- RESPONSIVE LAYOUT -->
    <!-- ========================= -->
    <div class="app-shell mobile-view">
      <div class="flex min-h-screen">

        <!-- SIDEBAR (Desktop only) -->
        <aside class="app-sidebar hidden md:flex">
          <app-sidebar></app-sidebar>
        </aside>

        <!-- MAIN -->
        <div class="flex flex-col flex-1">

          <!-- HEADER (Desktop only) -->
          <div class="hidden md:block">
            <app-header></app-header>
          </div>

          <!-- CONTENT -->
          <main class="app-content" [class.is-transitioning]="isTransitioning">
            <router-outlet></router-outlet>
          </main>

        </div>
      </div>
    </div>
  `
})
export class LayoutComponent implements OnDestroy {
  isTransitioning = false;
  private navSub: Subscription;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {
    this.navSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.triggerTransition();
      }
    });
  }

  private triggerTransition() {
    this.isTransitioning = true;
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }
    this.transitionTimer = setTimeout(() => {
      this.isTransitioning = false;
    }, 380);
  }

  ngOnDestroy() {
    this.navSub.unsubscribe();
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }
  }
}
