import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { GlobalNotificationsPanelComponent } from '../../shared/ui/global-notifications-panel/global-notifications-panel.component';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [CommonModule, GlobalNotificationsPanelComponent],
  templateUrl: './topbar.component.html'
})
export class TopbarComponent {}
