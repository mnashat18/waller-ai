import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-request-welcome',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './request-welcome.html',
  styleUrl: './request-welcome.css'
})
export class RequestWelcomeComponent implements OnInit {
  hasRequest = false;
  email = '';
  nextPath = '/dashboard';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    this.hasRequest = query.get('hasRequest') === '1';
    this.email = this.normalizeEmail(query.get('email'));
    this.nextPath = this.normalizePath(query.get('next'));
  }

  get heading(): string {
    return this.hasRequest
      ? 'Your email already has a scan request.'
      : 'No request is linked to your email yet.';
  }

  get message(): string {
    return this.hasRequest
      ? 'Please open Request Center now and complete your request.'
      : 'Please create your first request now from Request Center.';
  }

  get primaryActionLabel(): string {
    return this.hasRequest ? 'Open Request Center' : 'Create a Request';
  }

  get showSecondaryAction(): boolean {
    return this.nextPath !== '/requests';
  }

  private normalizeEmail(value: string | null): string {
    const raw = (value ?? '').trim().toLowerCase();
    if (!raw) {
      return '';
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : '';
  }

  private normalizePath(value: string | null): string {
    const raw = (value ?? '').trim();
    if (!raw || !raw.startsWith('/')) {
      return '/dashboard';
    }
    return raw;
  }
}
