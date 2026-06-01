import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-upgrade-plan',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="mx-auto max-w-3xl px-6 py-20 text-center text-white">
      <p class="text-sm uppercase tracking-[0.2em] text-slate-400">Wellar Workspace</p>
      <h1 class="mt-4 text-4xl font-semibold">Workspace activation has moved.</h1>
      <p class="mt-4 text-slate-300">
        Use the main dashboard after sign-in and select the active company workspace to continue.
      </p>
      <div class="mt-8 flex items-center justify-center gap-3">
        <a routerLink="/dashboard" class="rounded-full bg-[#f5c451] px-6 py-3 text-slate-900">Open Dashboard</a>
        <a routerLink="/contact" class="rounded-full border border-white/15 px-6 py-3 text-white">Contact Wellar</a>
      </div>
    </section>
  `
})
export class UpgradePlanComponent {}
