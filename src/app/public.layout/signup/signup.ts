import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css']
})
export class SignupComponent {

  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  get passwordMismatch(): boolean {
    return this.password !== this.confirmPassword;
  }

  signup(form: NgForm) {
  if (form.invalid || this.passwordMismatch) return;

  this.loading = true;

  this.auth.signup({
    email: this.email,
    password: this.password,
    first_name: this.firstName,
    last_name: this.lastName
  }).subscribe({
    next: () => {
      this.loading = false;
      this.router.navigate(['/login']);
    },
    error: (err: any) => {
      this.loading = false;
      alert('Signup failed');
      console.error(err);
    }
  });
}

  continueWithGoogle() {
    this.auth.loginWithGoogle();
  }
}
