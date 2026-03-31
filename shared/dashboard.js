import { formatCurrency, formatPct, formatCount, formatCompact, deltaHtml, formatMonthFull, getCssVar } from './utils.js';
import { createChannelMixDonut, createHistoryCombo, createSpendTrend, createFunnelBar } from './charts.js';
import { renderSortableTable } from './tables.js';
import { exportToPdf } from './pdf-export.js';

let currentData = null;
let config = null;

export async function initDashboard(cfg) {
  config = cfg;

  // Set Chart.js global defaults
  const fontFamily = getCssVar('--font-family') || 'sans-serif';
  Chart.defaults.font.family = fontFamily;
  Chart.defaults.font.size = 13;
  Chart.defaults.color = getCssVar('--color-text-muted') || '#6B6B6B';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;

  // Load manifest
  const manifest = await fetchJson(`${config.dataBasePath}/manifest.json`);
  if (!manifest) { showError('No se pudo cargar el manifiesto de datos.'); return; }

  // Populate month selector
  const selector = document.getElementById('month-selector');
  if (selector) {
    selector.innerHTML = '';
    manifest.months.slice().reverse().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = formatMonthFull(m);
      selector.appendChild(opt);
    });
    selector.value = manifest.latestMonth;
    selector.addEventListener('change', () => loadMonth(selector.value));
  }

  // Export PDF button
  const btnPdf = document.getElementById('btn-export-pdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      if (currentData) exportToPdf(config.clientName, currentData.meta.month);
    });
  }

  // Load latest month
  await loadMonth(manifest.latestMonth);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.error('Fetch error:', url, e);
    return null;
  }
}

async function loadMonth(month) {
  const data = await fetchJson(`${config.dataBasePath}/${month}.json`);
  if (!data) { showError(`No se pudieron cargar los datos de ${month}.`); return; }
  currentData = data;
  renderAll(data);
}

function showError(msg) {
  const el = document.getElementById('dashboard-content');
  if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:#B91C1C;font-size:1.1rem;">${msg}</div>`;
}

function renderAll(data) {
  renderKpis(data);
  renderCharts(data);
  renderBusinessMetrics(data);
  renderTables(data);
  renderFooter(data);
}

function renderKpis(data) {
  const { kpis } = data;

  // Combined KPIs
  setKpi('kpi-total-leads', formatCount(kpis.combined.total_leads.value), deltaHtml(kpis.combined.total_leads.value, kpis.combined.total_leads.previous));
  setKpi('kpi-blended-cpl', formatCurrency(kpis.combined.blended_cpl.value), deltaHtml(kpis.combined.blended_cpl.value, kpis.combined.blended_cpl.previous, true));
  setKpi('kpi-total-spend', formatCurrency(kpis.combined.total_spend.value), deltaHtml(kpis.combined.total_spend.value, kpis.combined.total_spend.previous, true));

  // Meta KPIs
  setKpi('kpi-meta-leads', formatCount(kpis.meta_ads.leads.value), deltaHtml(kpis.meta_ads.leads.value, kpis.meta_ads.leads.previous));
  setKpi('kpi-meta-cpl', formatCurrency(kpis.meta_ads.cpl.value), deltaHtml(kpis.meta_ads.cpl.value, kpis.meta_ads.cpl.previous, true));
  setKpi('kpi-meta-spend', formatCurrency(kpis.meta_ads.spend.value), deltaHtml(kpis.meta_ads.spend.value, kpis.meta_ads.spend.previous, true));
  setKpi('kpi-meta-ctr', formatPct(kpis.meta_ads.ctr.value), deltaHtml(kpis.meta_ads.ctr.value, kpis.meta_ads.ctr.previous));

  // Google KPIs
  setKpi('kpi-google-leads', formatCount(kpis.google_ads.leads.value), deltaHtml(kpis.google_ads.leads.value, kpis.google_ads.leads.previous));
  setKpi('kpi-google-cpl', formatCurrency(kpis.google_ads.cpl.value), deltaHtml(kpis.google_ads.cpl.value, kpis.google_ads.cpl.previous, true));
  setKpi('kpi-google-spend', formatCurrency(kpis.google_ads.spend.value), deltaHtml(kpis.google_ads.spend.value, kpis.google_ads.spend.previous, true));
  setKpi('kpi-google-ctr', formatPct(kpis.google_ads.ctr.value), deltaHtml(kpis.google_ads.ctr.value, kpis.google_ads.ctr.previous));
}

function setKpi(id, value, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  const valueEl = el.querySelector('.kpi-value');
  const deltaEl = el.querySelector('.kpi-delta');
  if (valueEl) valueEl.textContent = value;
  if (deltaEl) deltaEl.innerHTML = delta;
}

function renderCharts(data) {
  createChannelMixDonut('chart-channel-mix', data.channelMix);
  createHistoryCombo('chart-history', data.history);
  createSpendTrend('chart-spend', data.history);
  createFunnelBar('chart-funnel', data.businessMetrics.funnel);
}

function renderBusinessMetrics(data) {
  const { businessMetrics } = data;

  const visitasEl = document.getElementById('visitas-value');
  if (visitasEl) {
    visitasEl.textContent = businessMetrics.visitasRealizadas != null ? businessMetrics.visitasRealizadas : '—';
  }

  const ocupEl = document.getElementById('ocupacion-value');
  const ocupBadge = document.getElementById('ocupacion-badge');
  if (ocupEl && businessMetrics.ocupacion.pct != null) {
    ocupEl.textContent = businessMetrics.ocupacion.pct + '%';
  } else if (ocupEl) {
    ocupEl.textContent = '—';
  }
  if (ocupBadge && businessMetrics.ocupacion.status) {
    ocupBadge.textContent = businessMetrics.ocupacion.status;
    ocupBadge.style.display = 'inline-block';
  } else if (ocupBadge) {
    ocupBadge.style.display = 'none';
  }
}

function renderTables(data) {
  const { campaigns } = data;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target)?.classList.add('active');
    });
  });

  // Meta creatives table
  renderSortableTable('table-meta-creatives', [
    { key: 'name', label: 'Creatividad', unit: 'text' },
    { key: 'leads', label: 'Leads', unit: 'count', align: 'right', defaultDesc: true },
    { key: 'cpl', label: 'CPL', unit: 'eur', align: 'right' },
    { key: 'spend', label: 'Inversión', unit: 'eur', align: 'right' }
  ], campaigns.meta_ads.creatives);

  // Meta campaigns table
  renderSortableTable('table-meta-campaigns', [
    { key: 'name', label: 'Campaña', unit: 'text' },
    { key: 'leads', label: 'Leads', unit: 'count', align: 'right', defaultDesc: true },
    { key: 'cpl', label: 'CPL', unit: 'eur', align: 'right' },
    { key: 'spend', label: 'Inversión', unit: 'eur', align: 'right' },
    { key: 'ctr', label: 'CTR', unit: 'pct', align: 'right' }
  ], campaigns.meta_ads.campaigns);

  // Google keywords table
  renderSortableTable('table-google-keywords', [
    { key: 'keyword', label: 'Keyword', unit: 'text' },
    { key: 'leads', label: 'Leads', unit: 'count', align: 'right', defaultDesc: true },
    { key: 'cpl', label: 'CPL', unit: 'eur', align: 'right' }
  ], campaigns.google_ads.keywords);

  // Google campaigns table
  renderSortableTable('table-google-campaigns', [
    { key: 'name', label: 'Campaña', unit: 'text' },
    { key: 'leads', label: 'Leads', unit: 'count', align: 'right', defaultDesc: true },
    { key: 'cpl', label: 'CPL', unit: 'eur', align: 'right' },
    { key: 'spend', label: 'Inversión', unit: 'eur', align: 'right' },
    { key: 'ctr', label: 'CTR', unit: 'pct', align: 'right' }
  ], campaigns.google_ads.campaigns);
}

function renderFooter(data) {
  const el = document.getElementById('last-updated');
  if (el && data.meta.generatedAt) {
    const d = new Date(data.meta.generatedAt);
    el.textContent = `Última actualización: ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }
}
