import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import type { CompanyContextState } from '../core/context/company-context.service';
import { NotificationsService } from './notifications.service';

const readyContext = (): CompanyContextState['context'] => ({
  currentUser: {
    id: 'user-1',
    email: 'owner@example.com',
    first_name: 'Owner',
    last_name: 'User'
  },
  userId: 'user-1',
  userDisplayName: 'Owner User',
  userEmail: 'owner@example.com',
  isAuthenticated: true,
  authInitialized: true,
  workspaceInitialized: true,
  activeBusinessProfileId: 'profile-1',
  activeBusinessProfileName: 'Northwind Logistics',
  activeDepartmentId: null,
  activeDepartmentName: null,
  activeMemberRole: 'owner',
  availableCompanies: [],
  hubReason: null
});

describe('NotificationsService', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    window.history.replaceState({}, '', originalPathname || '/');
  });

  it('does not start notification reads while workspace activation route is active', () => {
    window.history.replaceState({}, '', '/app/workspace-activating');

    const state$ = new BehaviorSubject<CompanyContextState>({
      loading: false,
      error: null,
      context: readyContext()
    });
    const http = {
      get: vi.fn(() => of({ data: [] }))
    };
    const auth = {
      getStoredAccessToken: vi.fn(() => 'jwt-token'),
      getAuthHeaders: vi.fn(() => ({}))
    };

    const service = new NotificationsService(
      http as any,
      auth as any,
      {
        state$: state$.asObservable(),
        snapshot: () => state$.value
      } as any
    );

    service.initialize();

    expect(http.get).not.toHaveBeenCalled();
  });
});
