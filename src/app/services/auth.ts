import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthService {
  api = environment.API_URL;

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      {
        email,
        password
      },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/json'
        })
      }
    ).pipe(
      tap(res => {
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('access_token', res.data.access_token);
        localStorage.setItem('refresh_token', res.data.refresh_token);
        localStorage.setItem('user_email', email);
      })
    );
  }
signup(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) {
    return this.http.post(`${this.api}/users/register`, {
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name
    });
  }


  isLoggedIn(): boolean {
    return !!(localStorage.getItem('token') || localStorage.getItem('access_token'));
  }

  logout() {
    localStorage.clear();
  }

  loginWithGoogle() {
    if (typeof window === 'undefined') {
      return;
    }
    const redirect = encodeURIComponent(`${window.location.origin}/auth-callback`);
    window.location.href = `${this.api}/auth/login/google?redirect=${redirect}`;
  }
}
