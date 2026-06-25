import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verifyemail.html',
  styleUrls: ['./verifyemail.css'],
  imports: [RouterLink]
})
export class VerifyEmailComponent implements OnInit {

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Simple waiting UX page
    setTimeout(() => {
      this.router.navigate(['/'], { queryParams: { auth: 'login' } });
    }, 3000);
  }
}
