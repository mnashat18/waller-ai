import { Component, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-public.layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './public.layout.html',
  styleUrl: './public.layout.css'
})
export class PublicLayout implements AfterViewInit {

  ngAfterViewInit() {
    this.startSnow();
  }

  startSnow() {
    const canvas = document.getElementById('snow') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 180 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 1.3,
      vy: Math.random() * 0.9 + 0.4
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';

      particles.forEach(p => {
        p.y += p.vy;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }
}
