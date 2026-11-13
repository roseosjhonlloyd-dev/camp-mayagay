/* Camp Mayagay - formal PDF reports (admin > Reports).
 *   downloadReportsPdf('single', key)  one report (reservation | accommodation | feedback), current filters
 *   downloadReportsPdf('all')          all three reports in one PDF, current filters
 *   downloadReportsPdf('week')         all reports for this week (Mon - Sun)
 *   downloadReportsPdf('month')        all reports for this month
 * Uses jsPDF + autoTable (loaded in dashboard-admin.html). Everything is built in the browser from the
 * same data the Reports page already shows. */
(function () {
  var GREEN = [31, 74, 46];
  var CAMP = 'CAMP MAYAGAY';
  var ADDRESS = 'Barangay Sampaloc, Tanay, Philippines';

  function pad(n) { return String(n).padStart(2, '0'); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nice(k) {
    var d = new Date(k + 'T00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function clean(v) { return String(v == null ? '' : v).replace(/₱/g, 'PHP '); }   // PDF base fonts have no peso sign

  function weekRange() {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: key(mon), to: key(sun) };
  }
  function monthRange() {
    var t = new Date();
    return { from: key(new Date(t.getFullYear(), t.getMonth(), 1)), to: key(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  }

  var logoCache = null;
  function loadLogo() {
    if (logoCache) return Promise.resolve(logoCache);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = 600, h = Math.round(600 * img.naturalHeight / img.naturalWidth);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        logoCache = { data: c.toDataURL('image/png'), ratio: w / h };
        resolve(logoCache);
      };
      img.onerror = function () { resolve(null); };
      img.src = 'assets/images/Camp%20Mayagay%20logo.png';
    });
  }

  function build(opts, logo) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var d = opts.data;

    // Letterhead: dark green band (the logo is white) with logo + camp name.
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(0, 0, W, 30, 'F');
    var x = 12;
    if (logo) { var lh = 22; var lw = lh * logo.ratio; doc.addImage(logo.data, 'PNG', 10, 4, lw, lh); x = 10 + lw + 6; }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(CAMP, x, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(ADDRESS, x, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('OFFICIAL REPORT', W - 12, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Generated ' + d.generated_at, W - 12, 20, { align: 'right' });

    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(opts.title, 12, 42);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Period: ' + opts.period, 12, 48);
    doc.text('Prepared by: System Admin', 12, 53);

    var y = 58;
    doc.autoTable({
      startY: y, theme: 'grid', margin: { left: 12, right: 12 },
      head: [['Summary', 'Value']],
      body: [
        ['Total reservations', d.total_reservations],
        ['Revenue collected', clean(window.reportPeso ? reportPeso(d.total_revenue) : d.total_revenue)],
        ['Guests', d.guests_total],
        ['Feedback received', d.total_feedback],
        ['Reservations by status', Object.keys(d.status_breakdown || {}).map(function (k) { return k + ': ' + d.status_breakdown[k]; }).join('   ') || '-']
      ],
      styles: { fontSize: 9.5 }, headStyles: { fillColor: GREEN },
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } }
    });

    opts.keys.forEach(function (k) {
      var t = buildReportTable(k, d);
      var startY = doc.lastAutoTable.finalY + 10;
      if (startY > H - 40) { doc.addPage(); startY = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.text(t.title, 12, startY);
      doc.autoTable({
        startY: startY + 3, theme: 'striped', margin: { left: 12, right: 12 },
        head: [t.headers],
        body: t.rows.length ? t.rows.map(function (r) { return r.map(clean); }) : [[{ content: 'No data for this period.', colSpan: t.headers.length, styles: { halign: 'center', fontStyle: 'italic' } }]],
        styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: GREEN }
      });
    });

    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(200); doc.line(12, H - 11, W - 12, H - 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
      doc.text(CAMP + ' • ' + ADDRESS + ' • Confidential', 12, H - 6);
      doc.text('Page ' + i + ' of ' + pages, W - 12, H - 6, { align: 'right' });
    }
    return doc;
  }

  window.downloadReportsPdf = function (mode, singleKey) {
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('The PDF tool could not load. Check your internet connection and refresh the page.'); return; }
    var all = ['reservation', 'accommodation', 'feedback'];
    var titles = { reservation: 'Reservation Report', accommodation: 'Accommodation Report', feedback: 'Feedback Report' };
    var filters = getReportsFilters();
    var opts, file;
    var today = key(new Date());

    if (mode === 'week' || mode === 'month') {
      var rg = mode === 'week' ? weekRange() : monthRange();
      opts = { title: (mode === 'week' ? 'Weekly' : 'Monthly') + ' Report', period: nice(rg.from) + ' to ' + nice(rg.to), keys: all,
               data: computeReportsData({ from: rg.from, to: rg.to }) };
      file = 'camp-mayagay-' + mode + 'ly-report-' + rg.from + '_to_' + rg.to + '.pdf';
    } else {
      var period = (filters.from || filters.to)
        ? (filters.from ? nice(filters.from) : 'Start') + ' to ' + (filters.to ? nice(filters.to) : 'Present')
        : 'All dates (as of ' + nice(today) + ')';
      var one = mode === 'single' && titles[singleKey];
      opts = { title: one ? titles[singleKey] : 'Formal Reports (All)', period: period, keys: one ? [singleKey] : all, data: computeReportsData(filters) };
      file = 'camp-mayagay-' + (one ? singleKey + '-report-' : 'all-reports-') + today + '.pdf';
    }
    loadLogo().then(function (logo) {
      build(opts, logo).save(file);
      if (typeof logReportExport === 'function') { var keep = lastReportsData; lastReportsData = opts.data; logReportExport(); lastReportsData = keep; }
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    [['downloadWeeklyPdfBtn', 'week'], ['downloadMonthlyPdfBtn', 'month'], ['downloadAllPdfBtn', 'all']].forEach(function (p) {
      var b = document.getElementById(p[0]);
      if (b) b.addEventListener('click', function () { window.downloadReportsPdf(p[1]); });
    });
  });
})();
