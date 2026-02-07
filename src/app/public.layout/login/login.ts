import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
imports:[FormsModule,RouterModule],
  standalone: true,
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {

email = '';
password = '';
loading = false;

constructor(
  private auth: AuthService,
  private router: Router
) {}

login() {
  if (!this.email || !this.password) return;

  this.loading = true;

  this.auth.login(this.email, this.password).subscribe({
    next: () => {
      this.loading = false;
      this.router.navigate(['/dashboard']);
    },
    error: (err) => {
  this.loading = false;

  if (err.status === 401) {
    alert('Please verify your email before logging in.');
  } else {
    alert('Login failed');
  }
}
  })
}
}
