import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header';
import { SidebarComponent } from './sidebar/sidebar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  template: `
    <div class="flex h-screen bg-slate-50 dark:bg-slate-950">

      <!-- SIDEBAR -->
      <aside class="w-20 bg-slate-900 flex flex-col items-center">
        <app-sidebar></app-sidebar>
      </aside>

      <!-- MAIN -->
      <div class="flex flex-col flex-1 overflow-hidden">

        <!-- HEADER -->
        <app-header></app-header>

        <!-- CONTENT -->
        <main class="flex-1 overflow-y-auto p-8">
          <router-outlet></router-outlet>
        </main>

      </div>
    </div>
  `
})
export class LayoutComponent {}
