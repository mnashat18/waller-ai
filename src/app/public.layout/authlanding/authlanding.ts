import { Component, AfterViewInit } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-authlanding',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './authlanding.html',
  styleUrls: ['./authlanding.css']
})
export class Authlanding implements AfterViewInit {

  texts = [
    'Smart. Secure. Medical Intelligence.',
    'AI-powered cognitive wellness monitoring.',
    'Detect health risks before they escalate.',
    'Real-time insights for patients & doctors.',
    'Proactive healthcare powered by AI.'
  ];

  ngAfterViewInit() {
    this.startTextRotation();
    this.startSnow();
  }

  /* ===== TEXT ROTATION ===== */
  startTextRotation() {
    const el = document.getElementById('rotating-text')!;
    let index = 0;

    const changeText = () => {
      el.classList.remove('show');
      setTimeout(() => {
        el.textContent = this.texts[index];
        el.classList.add('show');
        index = (index + 1) % this.texts.length;
      }, 400);
    };

    changeText();
    setInterval(changeText, 3000);
  }

  /* ===== SNOW PARTICLES ===== */
  startSnow() {
    const canvas = document.getElementById('snow') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      vx: Math.random() * 0.3 - 0.15,
      vy: Math.random() * 0.6 + 0.3
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y > canvas.height) p.y = 0;
        if (p.x > canvas.width || p.x < 0) p.x = Math.random() * canvas.width;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }

}
