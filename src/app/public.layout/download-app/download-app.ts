import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-download-app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './download-app.html',
  styleUrls: ['./download-app.css']
})
export class DownloadAppLanding {
  qrCells = Array.from({ length: 25 }, (_, index) => index);

  trackByIndex(index: number): number {
    return index;
  }
}
