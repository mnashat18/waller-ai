import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  api = environment.API_URL;

  constructor(private http: HttpClient) {}

  private headers() {
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${localStorage.getItem('token')}`
      })
    };
  }

  getScanResults() {
    return this.http.get<any>(
      `${this.api}/items/scan_results?sort=-date_created&limit=20`,
      this.headers()
    );
  }
}
