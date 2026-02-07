import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-weekly-chart',
  standalone: true,
  template: `<canvas #canvas></canvas>`
})
export class WeeklyChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() scans: Array<{ overall_state?: string; date_created?: string | number | Date }> = [];
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit() {
    this.chart = new Chart(this.canvasRef?.nativeElement ?? 'weeklyChart', {
      type: 'line',
      data: this.buildChartData(),
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8' }
          }
        },
        scales: {
          y: {
            ticks: { color: '#94a3b8' },
            grid: { color: '#e5e7eb' }
          },
          x: {
            ticks: { color: '#94a3b8' },
            grid: { display: false }
          }
        }
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['scans'] || !this.chart) {
      return;
    }

    const data = this.buildChartData();
    this.chart.data.labels = data.labels;
    this.chart.data.datasets = data.datasets;
    this.chart.update();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  private buildChartData() {
    const { labels, buckets } = this.buildWeekBuckets();
    const datasets = [
      {
        label: 'Stable',
        data: buckets.stable,
        borderColor: '#22C55E',
        tension: 0.4
      },
      {
        label: 'Low Focus',
        data: buckets.low,
        borderColor: '#F97316',
        tension: 0.4
      },
      {
        label: 'Fatigue',
        data: buckets.fatigue,
        borderColor: '#EAB308',
        tension: 0.4
      },
      {
        label: 'High Risk',
        data: buckets.risk,
        borderColor: '#EF4444',
        tension: 0.4
      }
    ];

    return { labels, datasets };
  }

  private buildWeekBuckets() {
    const labels: string[] = [];
    const buckets = {
      stable: Array(7).fill(0),
      low: Array(7).fill(0),
      fatigue: Array(7).fill(0),
      risk: Array(7).fill(0)
    };

    const today = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - 6);

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    this.scans.forEach((scan) => {
      const createdAt = scan.date_created ? new Date(scan.date_created) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) {
        return;
      }
      const diff = createdAt.setHours(0, 0, 0, 0) - start.getTime();
      const dayIndex = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (dayIndex < 0 || dayIndex > 6) {
        return;
      }

      const normalized = this.normalizeStateKey(scan.overall_state);
      if (normalized === 'stable') {
        buckets.stable[dayIndex] += 1;
      } else if (normalized === 'low focus') {
        buckets.low[dayIndex] += 1;
      } else if (normalized === 'elevated fatigue') {
        buckets.fatigue[dayIndex] += 1;
      } else if (normalized === 'high risk') {
        buckets.risk[dayIndex] += 1;
      }
    });

    return { labels, buckets };
  }

  private normalizeStateKey(state?: string): string {
    return (state ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
