import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { NotificationsService } from '../../services/notifications.service';
import { NotificationsComponent } from './notifications';

describe('NotificationsComponent', () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        {
          provide: NotificationsService,
          useValue: {
            initialize: () => undefined,
            refresh: () => undefined,
            state$: of({
              loading: false,
              error: null,
              unreadCount: 0,
              recentNotifications: []
            })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
