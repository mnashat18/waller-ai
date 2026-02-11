import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header';
import { SidebarComponent } from './sidebar/sidebar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  template: `
    <!-- ========================= -->
    <!-- RESPONSIVE LAYOUT -->
    <!-- ========================= -->
    <div class="min-h-screen bg-slate-950 md:bg-slate-50 dark:bg-slate-950 mobile-view">
      <div class="flex min-h-screen">

        <!-- SIDEBAR (Desktop only) -->
        <aside class="hidden md:flex w-20 bg-slate-900 flex-col items-center">
          <app-sidebar></app-sidebar>
        </aside>

        <!-- MAIN -->
        <div class="flex flex-col flex-1">

          <!-- HEADER (Desktop only) -->
          <div class="hidden md:block">
            <app-header></app-header>
          </div>

          <!-- CONTENT -->
          <main class="flex-1 overflow-y-auto p-0 md:p-8">
            <router-outlet></router-outlet>
          </main>

        </div>
      </div>
    </div>
  `
})
export class LayoutComponent {}
