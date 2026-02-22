import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export type Organization = {
  id: string;
  name: string;
  industry?: string;
  role?: string;
};

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private api = environment.API_URL;
  private endpointForbidden = false;

  constructor(private http: HttpClient) {}

  getUserOrganization(): Observable<Organization | null> {
    if (this.endpointForbidden) {
      return of(null);
    }

    const userId = this.getUserId();
    if (!userId) {
      return of(null);
    }

    const params = new URLSearchParams({
      'filter[user][_eq]': userId,
      'limit': '1',
      'fields': 'id,role,org.id,org.name'
    });

    return this.http.get<{ data?: Array<any> }>(
      `${this.api}/items/organization_members?${params.toString()}`
    ).pipe(
      map((res) => {
        const record = res.data?.[0];
        if (!record?.org) {
          return null;
        }
        return {
          id: record.org.id,
          name: record.org.name,
          industry: record.org.industry,
          role: record.role
        } as Organization;
      }),
      catchError((err) => {
        if (err?.status === 401 || err?.status === 403) {
          this.endpointForbidden = true;
        }
        return of(null);
      })
    );
  }

  private getUserId(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const token =
      localStorage.getItem('token') ??
      localStorage.getItem('access_token') ??
      localStorage.getItem('directus_token');
    if (!token) {
      return null;
    }
    const payload = this.decodeJwtPayload(token);
    const id = payload?.['id'] ?? payload?.['user_id'] ?? payload?.['sub'];
    return typeof id === 'string' && id ? id : null;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
