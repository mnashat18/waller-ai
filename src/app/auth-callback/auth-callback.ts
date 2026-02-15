import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<p>Logging you in...</p>`
})
export class AuthCallbackComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    const hash = window.location.hash;

    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');

      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('token', accessToken);
        this.router.navigate(['/dashboard']);
        return;
      }
    }

    this.router.navigate(['/dashboard']);
  }
}
