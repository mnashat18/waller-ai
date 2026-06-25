import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="notfound-shell">
      <div class="notfound-shell__panel app-dashboard-panel">
        <p class="notfound-shell__eyebrow">Error 404</p>
        <h1>Page not found</h1>
        <p class="notfound-shell__copy">
          The page you were looking for doesn’t exist, may have moved, or the link is no longer valid.
        </p>
        <div class="notfound-shell__actions">
          <a routerLink="/" class="notfound-shell__button notfound-shell__button--primary">Back to home</a>
          <a routerLink="/app/dashboard" class="notfound-shell__button">Go to dashboard</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .notfound-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1rem;
      background:
        radial-gradient(38rem circle at 16% 18%, rgba(56, 189, 248, 0.18), transparent 60%),
        radial-gradient(34rem circle at 84% 82%, rgba(99, 102, 241, 0.16), transparent 60%),
        #050a17;
    }

    .notfound-shell__panel {
      width: min(100%, 44rem);
      padding: 1.5rem;
      border-radius: 1.8rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 46%),
        rgba(9, 14, 28, 0.9);
      box-shadow: 0 28px 70px rgba(2, 6, 23, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .notfound-shell__eyebrow {
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

    .notfound-shell__copy {
      margin: 0.8rem 0 0;
      color: rgba(226, 232, 240, 0.72);
      line-height: 1.7;
    }

    .notfound-shell__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-top: 1.4rem;
    }

    .notfound-shell__button {
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

    .notfound-shell__button--primary {
      border-color: rgba(56, 189, 248, 0.2);
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(20, 184, 166, 0.22));
      color: #f8fafc;
    }
  `]
})
export class NotFoundComponent {}
