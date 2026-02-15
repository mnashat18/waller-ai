import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { NotificationsComponent } from '../../components/notifications/notifications';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [NotificationsComponent],
  templateUrl: './header.html'
})
export class HeaderComponent {
  title = '';
  today = '';

  constructor(private router: Router) {
    this.updateHeader();

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.updateHeader();
      }
    });
  }

  updateHeader() {
    const rawPath = this.router.url.replace(/^\/+/, '');
    const path = rawPath.startsWith('app/') ? rawPath.slice(4) : rawPath;

    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      history: 'History',
      'audit-logs': 'Audit Logs',
      requests: 'Requests',
      profile: 'Profile'
    };

    this.title = titles[path] || 'Wellar';

    const date = new Date();
    this.today = date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  toggleDark(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    if (isDark) {
      root.classList.remove('dark');
      root.classList.add('light');
      window.localStorage.setItem('theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      window.localStorage.setItem('theme', 'dark');
    }
  }
}
