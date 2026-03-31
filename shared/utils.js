// Utils: formatting helpers for the ads dashboard
const locale = 'es-ES';

export function formatCurrency(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

export function formatPct(val) {
  if (val == null) return '—';
  return val.toFixed(2).replace('.', ',') + '%';
}

export function formatCount(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat(locale).format(val);
}

export function formatCompact(val) {
  if (val == null) return '—';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1).replace('.', ',') + 'K';
  return val.toString();
}

export function calcDelta(current, previous) {
  if (!previous || previous === 0) return { delta: 0, direction: 'neutral' };
  const delta = ((current - previous) / previous) * 100;
  return {
    delta: Math.abs(delta).toFixed(1),
    direction: delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'neutral',
    raw: delta
  };
}

// invertColor: true for metrics where DOWN is good (CPL, CPC)
export function deltaHtml(current, previous, invertColor = false) {
  const { delta, direction } = calcDelta(current, previous);
  if (direction === 'neutral') return '<span class="delta neutral">—</span>';

  const arrow = direction === 'up' ? '↑' : '↓';
  let colorClass;
  if (invertColor) {
    colorClass = direction === 'up' ? 'negative' : 'positive';
  } else {
    colorClass = direction === 'up' ? 'positive' : 'negative';
  }
  return `<span class="delta ${colorClass}">${arrow} ${delta}%</span>`;
}

export function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

export function formatMonthFull(monthStr) {
  const [year, month] = monthStr.split('-');
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
