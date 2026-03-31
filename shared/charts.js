import { formatMonthLabel, getCssVar, formatCurrency, formatPct } from './utils.js';

// Destroy existing chart on a canvas before creating a new one
function destroyIfExists(canvasId) {
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
}

export function createChannelMixDonut(canvasId, channelMix) {
  destroyIfExists(canvasId);
  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';
  const fontFamily = getCssVar('--font-family') || 'sans-serif';
  const textColor = getCssVar('--color-text') || '#1A1A1A';
  const mutedColor = getCssVar('--color-text-muted') || '#6B6B6B';
  const total = channelMix.meta_ads.leads + channelMix.google_ads.leads;

  return new Chart(document.getElementById(canvasId), {
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
          labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { family: fontFamily, size: 13 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
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
        const { width, height, ctx } = chart;
        const yCenter = (chart.chartArea.top + chart.chartArea.bottom) / 2;
        ctx.save();
        ctx.font = `bold 32px ${fontFamily}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, width / 2, yCenter - 12);
        ctx.font = `400 13px ${fontFamily}`;
        ctx.fillStyle = mutedColor;
        ctx.fillText('Total Leads', width / 2, yCenter + 16);
        ctx.restore();
      }
    }]
  });
}

export function createHistoryCombo(canvasId, history) {
  destroyIfExists(canvasId);
  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';
  const fontFamily = getCssVar('--font-family') || 'sans-serif';

  const labels = history.map(h => formatMonthLabel(h.month));
  const metaLeads = history.map(h => h.meta_ads.leads);
  const googleLeads = history.map(h => h.google_ads.leads);
  const metaCpl = history.map(h => h.meta_ads.cpl);
  const googleCpl = history.map(h => h.google_ads.cpl);

  return new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Leads Meta',
          type: 'bar',
          data: metaLeads,
          backgroundColor: metaColor + 'BB',
          yAxisID: 'y',
          order: 2,
          barPercentage: 0.7,
          categoryPercentage: 0.85,
          borderRadius: 4
        },
        {
          label: 'Leads Google',
          type: 'bar',
          data: googleLeads,
          backgroundColor: googleColor + 'BB',
          yAxisID: 'y',
          order: 2,
          barPercentage: 0.7,
          categoryPercentage: 0.85,
          borderRadius: 4
        },
        {
          label: 'CPL Meta (€)',
          type: 'line',
          data: metaCpl,
          borderColor: metaColor,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: metaColor,
          tension: 0.35,
          yAxisID: 'y1',
          order: 1
        },
        {
          label: 'CPL Google (€)',
          type: 'line',
          data: googleCpl,
          borderColor: googleColor,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: googleColor,
          borderDash: [6, 3],
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
          title: { display: true, text: 'Leads', font: { family: fontFamily } },
          beginAtZero: true,
          grid: { color: '#E5E7EB' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'CPL (€)', font: { family: fontFamily } },
          beginAtZero: true,
          grid: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: fontFamily, size: 11 } }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: fontFamily, size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
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

export function createSpendTrend(canvasId, history) {
  destroyIfExists(canvasId);
  const metaColor = getCssVar('--color-meta') || '#1877F2';
  const googleColor = getCssVar('--color-google') || '#34A853';
  const fontFamily = getCssVar('--font-family') || 'sans-serif';

  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: history.map(h => formatMonthLabel(h.month)),
      datasets: [
        {
          label: 'Meta Ads',
          data: history.map(h => h.meta_ads.spend),
          borderColor: metaColor,
          backgroundColor: metaColor + '20',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: metaColor
        },
        {
          label: 'Google Ads',
          data: history.map(h => h.google_ads.spend),
          borderColor: googleColor,
          backgroundColor: googleColor + '20',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: googleColor
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: 'Inversión (€)', font: { family: fontFamily } },
          beginAtZero: true,
          grid: { color: '#E5E7EB' },
          ticks: { callback: (v) => v + ' €' }
        },
        x: { grid: { display: false }, ticks: { font: { family: fontFamily, size: 11 } } }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { family: fontFamily, size: 12 } }
        },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} €` }
        }
      }
    }
  });
}

export function createFunnelBar(canvasId, funnelData) {
  destroyIfExists(canvasId);
  const primaryColor = getCssVar('--color-primary') || '#2D5016';
  const fontFamily = getCssVar('--font-family') || 'sans-serif';

  return new Chart(document.getElementById(canvasId), {
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
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.parsed.x} leads` }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Leads', font: { family: fontFamily } },
          grid: { color: '#E5E7EB' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: fontFamily, size: 12 } }
        }
      }
    }
  });
}
