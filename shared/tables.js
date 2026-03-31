import { formatCurrency, formatPct, formatCount } from './utils.js';

function formatCell(value, unit) {
  if (value == null) return '—';
  switch (unit) {
    case 'eur': return formatCurrency(value);
    case 'pct': return formatPct(value);
    case 'count': return formatCount(value);
    default: return String(value);
  }
}

export function renderSortableTable(containerId, columns, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let sortCol = null;
  let sortAsc = true;

  function render() {
    const sorted = [...rows];
    if (sortCol !== null) {
      const col = columns[sortCol];
      sorted.sort((a, b) => {
        const va = a[col.key];
        const vb = b[col.key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAsc ? va - vb : vb - va;
      });
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach((col, i) => {
      const th = document.createElement('th');
      th.textContent = col.label;
      th.style.cursor = 'pointer';
      if (sortCol === i) {
        th.textContent += sortAsc ? ' ▲' : ' ▼';
      }
      th.addEventListener('click', () => {
        if (sortCol === i) { sortAsc = !sortAsc; }
        else { sortCol = i; sortAsc = col.defaultDesc ? false : true; }
        render();
      });
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    sorted.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(col => {
        const td = document.createElement('td');
        td.textContent = formatCell(row[col.key], col.unit);
        if (col.align) td.style.textAlign = col.align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(table);
  }

  render();
}
