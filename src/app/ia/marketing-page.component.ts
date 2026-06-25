import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-marketing-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="page-shell mx-auto max-w-6xl px-6 py-16 text-white">
      <div class="page-hero">
        <p class="text-xs uppercase tracking-[0.22em] text-amber-300">Wellar AI</p>
        <h1 class="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{{ title }}</h1>
        <p class="mt-4 max-w-3xl text-slate-300">{{ description }}</p>

        <div class="mt-10 grid gap-4 md:grid-cols-3">
          <article class="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 class="text-lg font-medium">Mobile-to-Web Flow</h2>
            <p class="mt-3 text-sm text-slate-300">
              Employees complete scans on mobile, then owners, HR, and managers act from the web control center.
            </p>
          </article>
          <article class="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 class="text-lg font-medium">Operational Language</h2>
            <p class="mt-3 text-sm text-slate-300">
              Outcomes use non-medical labels such as Stable, Low Focus, Elevated Fatigue, and High Risk.
            </p>
          </article>
          <article class="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 class="text-lg font-medium">Company Scope</h2>
            <p class="mt-3 text-sm text-slate-300">
              Every dashboard view stays scoped to the active business profile to prevent cross-company leakage.
            </p>
          </article>
        </div>

        <div class="mt-8 flex flex-wrap gap-3">
          <a routerLink="/contact" class="rounded-full bg-[#f5c451] px-5 py-3 text-sm font-semibold text-slate-900">
            Request Demo
          </a>
          <a routerLink="/" [queryParams]="{ auth: 'login' }" class="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white">
            Log In
          </a>
        </div>
      </div>
    </section>
  `
})
export class MarketingPageComponent {
  private readonly route = inject(ActivatedRoute);

  get title(): string {
    return (this.route.snapshot.data['title'] as string) || 'Wellar AI';
  }

  get description(): string {
    return (
      (this.route.snapshot.data['description'] as string) ||
      'Operational control for readiness and compliance workflows.'
    );
  }
}
