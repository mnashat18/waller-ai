import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { NewUserGuideComponent } from './components/new-user-guide/new-user-guide';
import { SubscriptionExpiryAdsComponent } from './components/subscription-expiry-ads/subscription-expiry-ads';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NewUserGuideComponent, SubscriptionExpiryAdsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('wellar-ui');

  constructor(private auth: AuthService) {
    if (typeof window !== 'undefined') {
      const theme = window.localStorage.getItem('theme');
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        root.classList.add('dark');
        root.classList.remove('light');
      }

      const isAuthCallback = window.location.pathname === '/auth-callback';
      if (!isAuthCallback) {
        this.auth.captureAuthFromUrl();
        this.auth.ensureSessionToken().subscribe();
      }
    }
  }

}
