import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-my-readiness-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="workpage-shell">
      <div class="workpage-shell__panel app-dashboard-panel">
        <p class="workpage-shell__eyebrow">Employee Access</p>
        <h1>My Readiness</h1>
        <p class="workpage-shell__copy">
          Your account is active, but the operational dashboard is reserved for owners, HR, and managers.
        </p>
        <div class="workpage-shell__actions">
          <a routerLink="/download-app" class="workpage-shell__button workpage-shell__button--primary">Open Mobile App</a>
          <a routerLink="/app/workspace-access" class="workpage-shell__button">Back to Workspace Access</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .workpage-shell {
      min-height: calc(100vh - 4rem);
      display: grid;
      place-items: center;
      padding: 1rem;
    }

    .workpage-shell__panel {
      width: min(100%, 44rem);
      padding: 1.5rem;
      border-radius: 1.8rem;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 46%),
        rgba(9, 14, 28, 0.9);
    }

    .workpage-shell__eyebrow {
      margin: 0;
      color: rgba(125, 211, 252, 0.88);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0.35rem 0 0;
      color: #f8fafc;
      font-family: 'Space Grotesk', 'Manrope', sans-serif;
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      letter-spacing: -0.05em;
    }

    .workpage-shell__copy {
      margin: 0.8rem 0 0;
      color: rgba(226, 232, 240, 0.72);
      line-height: 1.7;
    }

    .workpage-shell__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-top: 1.4rem;
    }

    .workpage-shell__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.7rem;
      padding: 0.6rem 1rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      color: #e2e8f0;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.04);
    }

    .workpage-shell__button--primary {
      border-color: rgba(56, 189, 248, 0.2);
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(20, 184, 166, 0.22));
      color: #f8fafc;
    }
  `]
})
export class MyReadinessPageComponent {
}
