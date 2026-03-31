export async function exportToPdf(clientName, month) {
  // Lazy load html2pdf.js
  if (!window.html2pdf) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
  }

  const element = document.getElementById('dashboard-content');
  const btn = document.getElementById('btn-export-pdf');
  if (btn) { btn.textContent = 'Generando PDF...'; btn.disabled = true; }

  element.classList.add('pdf-mode');

  const filename = `Dashboard_${clientName.replace(/\s+/g, '_')}_${month}.pdf`;

  try {
    await html2pdf().set({
      margin: [8, 8, 8, 8],
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(element).save();
  } finally {
    element.classList.remove('pdf-mode');
    if (btn) { btn.textContent = 'Exportar PDF'; btn.disabled = false; }
  }
}
