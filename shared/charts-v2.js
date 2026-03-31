/**
 * charts-v2.js — Shared Chart.js chart factories for ads dashboards
 * Works with Chart.js 4.x loaded from CDN
 */

import { formatMonthLabel, getCssVar, formatCurrency } from './utils.js';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function destroy(canvasId) {
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
}

function font() {
  return getCssVar('--font-family') || "'Nunito', sans-serif";
}

function gridColor() { return '#E5E7EB'; }

// ──────────────────────────────────────────────
// 1. Daily Bar+Line Combo (leads bars + CPL line)
// ──────────────────────────────────────────────

export function createDailyCombo(canvasId, dailyData, { barColor = '#2D5016', lineColor = '#6B6B6B' } = {}) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const labels = dailyData.map(d => {
    const dt = new Date(d.date);
    return dt.getDate().toString();
  });

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Leads',
          type: 'bar',
          data: dailyData.map(d => d.leads),
          backgroundColor: barColor + 'CC',
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
          barPercentage: 0.75,
          categoryPercentage: 0.85
        },
        {
          label: 'CPL (€)',
          type: 'line',
          data: dailyData.map(d => d.cpl || null),
          borderColor: lineColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          yAxisID: 'y1',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'Leads', font: { family: font(), size: 11 } },
          beginAtZero: true,
          grid: { color: gridColor() },
          ticks: { font: { family: font(), size: 10 } }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'CPL (€)', font: { family: font(), size: 11 } },
          beginAtZero: true,
          grid: { display: false },
          ticks: { font: { family: font(), size: 10 }, callback: v => v.toFixed(0) + ' €' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: font(), size: 9 }, maxRotation: 0 }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: font(), size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.includes('CPL')) return `CPL: ${ctx.parsed.y.toFixed(2)} €`;
              return `Leads: ${ctx.parsed.y}`;
            }
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 2. Horizontal Bar (demographics)
// ──────────────────────────────────────────────

export function createHorizontalBar(canvasId, items, { color = '#2D5016', label = 'Leads' } = {}) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        label,
        data: items.map(i => i.leads),
        backgroundColor: color + 'BB',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} leads` } }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: gridColor() }, ticks: { font: { family: font(), size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { family: font(), size: 11 } } }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 3. Stacked Bar (HubSpot leads valid monthly)
// ──────────────────────────────────────────────

export function createStackedBar(canvasId, data, { datasets: dsConfig } = {}) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const labels = data.map(d => formatMonthLabel(d.month));
  const datasets = dsConfig.map(ds => ({
    label: ds.label,
    data: data.map(d => d[ds.key]),
    backgroundColor: ds.color,
    borderRadius: 3,
    barPercentage: 0.7,
    categoryPercentage: 0.85
  }));

  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { family: font(), size: 10 }, maxRotation: 45 } },
        y: { stacked: true, beginAtZero: true, grid: { color: gridColor() }, ticks: { font: { family: font(), size: 10 } } }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: font(), size: 11 } }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 4. Simple Monthly Bar (for individual HubSpot histories)
// ──────────────────────────────────────────────

export function createMonthlyBar(canvasId, data, { color = '#2D5016', label = 'Count' } = {}) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => formatMonthLabel(d.month)),
      datasets: [{
        label,
        data: data.map(d => d.count),
        backgroundColor: color + 'CC',
        borderRadius: 3,
        barPercentage: 0.7,
        categoryPercentage: 0.85
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: font(), size: 9 }, maxRotation: 45 } },
        y: { beginAtZero: true, grid: { color: gridColor() }, ticks: { font: { family: font(), size: 10 } } }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 5. Channel Mix Donut (kept for compatibility)
// ──────────────────────────────────────────────

export function createChannelMixDonut(canvasId, channelMix) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';
  const textColor = getCssVar('--color-text') || '#1A1A1A';
  const mutedColor = getCssVar('--color-text-muted') || '#6B6B6B';
  const total = channelMix.meta_ads.leads + channelMix.google_ads.leads;

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Meta Ads', 'Google Ads'],
      datasets: [{
        data: [channelMix.meta_ads.pct, channelMix.google_ads.pct],
        backgroundColor: [metaColor, googleColor],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { family: font(), size: 13 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const leads = ctx.dataIndex === 0 ? channelMix.meta_ads.leads : channelMix.google_ads.leads;
              return `${ctx.label}: ${ctx.parsed.toFixed(1)}% (${leads} leads)`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      beforeDraw(chart) {
        const { width, ctx } = chart;
        const yCenter = (chart.chartArea.top + chart.chartArea.bottom) / 2;
        ctx.save();
        ctx.font = `bold 32px ${font()}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, width / 2, yCenter - 12);
        ctx.font = `400 13px ${font()}`;
        ctx.fillStyle = mutedColor;
        ctx.fillText('Total Leads', width / 2, yCenter + 16);
        ctx.restore();
      }
    }]
  });
}

// ──────────────────────────────────────────────
// 6. History Combo (bars+lines for leads+CPL)
// ──────────────────────────────────────────────

export function createHistoryCombo(canvasId, history) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';

  const labels = history.map(h => formatMonthLabel(h.month));

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Leads Meta', type: 'bar', data: history.map(h => h.meta_ads.leads),
          backgroundColor: metaColor + 'BB', yAxisID: 'y', order: 2, barPercentage: 0.7, categoryPercentage: 0.85, borderRadius: 4
        },
        {
          label: 'Leads Google', type: 'bar', data: history.map(h => h.google_ads.leads),
          backgroundColor: googleColor + 'BB', yAxisID: 'y', order: 2, barPercentage: 0.7, categoryPercentage: 0.85, borderRadius: 4
        },
        {
          label: 'CPL Meta (€)', type: 'line', data: history.map(h => h.meta_ads.cpl),
          borderColor: metaColor, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 3,
          pointBackgroundColor: metaColor, tension: 0.35, yAxisID: 'y1', order: 1
        },
        {
          label: 'CPL Google (€)', type: 'line', data: history.map(h => h.google_ads.cpl),
          borderColor: googleColor, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 3,
          pointBackgroundColor: googleColor, borderDash: [6, 3], tension: 0.35, yAxisID: 'y1', order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: 'left', title: { display: true, text: 'Leads', font: { family: font() } }, beginAtZero: true, grid: { color: gridColor() } },
        y1: { position: 'right', title: { display: true, text: 'CPL (€)', font: { family: font() } }, beginAtZero: true, grid: { display: false } },
        x: { grid: { display: false }, ticks: { font: { family: font(), size: 11 } } }
      },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: font(), size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y;
              if (ctx.dataset.label.includes('CPL')) return `${ctx.dataset.label}: ${val.toFixed(2)} €`;
              return `${ctx.dataset.label}: ${val}`;
            }
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 7. Spend Trend Line
// ──────────────────────────────────────────────

export function createSpendTrend(canvasId, history) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: history.map(h => formatMonthLabel(h.month)),
      datasets: [
        {
          label: 'Meta Ads', data: history.map(h => h.meta_ads.spend),
          borderColor: metaColor, backgroundColor: metaColor + '20', fill: true,
          tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: metaColor
        },
        {
          label: 'Google Ads', data: history.map(h => h.google_ads.spend),
          borderColor: googleColor, backgroundColor: googleColor + '20', fill: true,
          tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: googleColor
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: 'Inversión (€)', font: { family: font() } }, beginAtZero: true, grid: { color: gridColor() }, ticks: { callback: v => v + ' €' } },
        x: { grid: { display: false }, ticks: { font: { family: font(), size: 11 } } }
      },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: font(), size: 12 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} €` } }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 8. Funnel Bar (horizontal)
// ──────────────────────────────────────────────

export function createFunnelBar(canvasId, funnelData) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const primaryColor = getCssVar('--color-primary') || '#2D5016';

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: funnelData.map(f => f.stage),
      datasets: [{
        data: funnelData.map(f => f.count),
        backgroundColor: funnelData.map((_, i, arr) => {
          const opacity = 0.35 + ((arr.length - 1 - i) / arr.length) * 0.65;
          return primaryColor + Math.round(opacity * 255).toString(16).padStart(2, '0');
        }),
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} leads` } }
      },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: 'Leads', font: { family: font() } }, grid: { color: gridColor() } },
        y: { grid: { display: false }, ticks: { font: { family: font(), size: 12 } } }
      }
    }
  });
}
