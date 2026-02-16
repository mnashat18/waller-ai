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
    const search = window.location.search;

    const hashParams = hash ? new URLSearchParams(hash.replace('#', '?')) : null;
    const searchParams = search ? new URLSearchParams(search) : null;
    const accessToken =
      hashParams?.get('access_token') ??
      searchParams?.get('access_token') ??
      searchParams?.get('token');
    const refreshToken =
      hashParams?.get('refresh_token') ??
      searchParams?.get('refresh_token');

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('token', accessToken);
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }
      this.router.navigate(['/dashboard']);
      return;
    }

    this.router.navigate(['/dashboard']);
  }
}
