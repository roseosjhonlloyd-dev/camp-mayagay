/**
 * dashboard-payments.js
 * "Payment Transactions" page (shared by dashboard-admin.html and dashboard-staff.html).
 * Lists every reservation with Total / Paid / Balance, grouped Paid / Partial / Unpaid,
 * lets staff record money received, and exports the list to Excel or PDF.
 * Depends on adminApiCall() and showAdminToast() from dashboard-admin.js.
 */
(function () {
  var rows = [];
  var loaded = false;
  var activeTab = '';
  var recordTarget = null;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyPlain(n) { return 'PHP ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateOnly(s) { return s ? String(s).slice(0, 10) : ''; }
  function sourceLabel(r) { return r.source === 'walk-in' ? 'Walk-in' : 'Website'; }
  function statusLabel(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function toast(msg, err) { if (typeof showAdminToast === 'function') showAdminToast(msg, !!err); }

  function load() {
    if (typeof adminApiCall !== 'function') return;
    adminApiCall('payments_list', {}).then(function (res) {
      if (!res || !res.success) {
        $('payTableBody').innerHTML = '<tr><td colspan="10" class="empty-admin-note">' + esc((res && res.message) || 'Could not load payments.') + '</td></tr>';
        return;
      }
      rows = res.payments || [];
      loaded = true;
      render();
    });
  }

  function filtered(ignoreTab) {
    var q = ($('paySearch').value || '').trim().toLowerCase();
    var src = $('paySourceFilter').value;
    var from = $('payDateFrom').value;
    var to = $('payDateTo').value;
    return rows.filter(function (r) {
      if (!ignoreTab && activeTab && r.payment_status !== activeTab) return false;
      if (src && r.source !== src) return false;
      var d = dateOnly(r.check_in);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q) {
        var hay = (r.guest_name + ' ' + r.code + ' ' + r.cabin_name).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    // Summary + tab counts use the search/source/date filters but ignore the tab.
    var base = filtered(true);
    var c = { paid: 0, partial: 0, unpaid: 0 };
    var paidAmt = 0, partialBal = 0, unpaidDue = 0, collected = 0, outstanding = 0;
    base.forEach(function (r) {
      if (r.payment_status === 'refunded') return;
      if (c[r.payment_status] !== undefined) c[r.payment_status]++;
      collected += r.amount_paid;
      outstanding += r.balance;
      if (r.payment_status === 'paid') paidAmt += r.amount_paid;
      if (r.payment_status === 'partial') partialBal += r.balance;
      if (r.payment_status === 'unpaid') unpaidDue += r.balance;
    });
    $('payCntAll').textContent = base.length;
    $('payCntPaid').textContent = c.paid;
    $('payCntPartial').textContent = c.partial;
    $('payCntUnpaid').textContent = c.unpaid;
    $('paySumPaidCount').textContent = c.paid;
    $('paySumPartialCount').textContent = c.partial;
    $('paySumUnpaidCount').textContent = c.unpaid;
    $('paySumPaidAmt').textContent = money(paidAmt) + ' collected';
    $('paySumPartialAmt').textContent = money(partialBal) + ' balance';
    $('paySumUnpaidAmt').textContent = money(unpaidDue) + ' due';
    $('paySumCollected').textContent = money(collected);
    $('paySumOutstanding').textContent = money(outstanding) + ' outstanding';

    var list = filtered(false);
    var body = $('payTableBody');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="10" class="empty-admin-note">No transactions found.</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (r) {
      var canPay = r.payment_status !== 'paid' && r.payment_status !== 'refunded';
      return '<tr>' +
        '<td>' + esc(r.code) + '</td>' +
        '<td>' + esc(r.guest_name) + '</td>' +
        '<td>' + esc(r.cabin_name) + '</td>' +
        '<td>' + esc(dateOnly(r.check_in)) + '</td>' +
        '<td><span class="pill pay-src-' + esc(r.source) + '">' + sourceLabel(r) + '</span></td>' +
        '<td>' + money(r.total_amount) + '</td>' +
        '<td>' + money(r.amount_paid) + '</td>' +
        '<td>' + money(r.balance) + '</td>' +
        '<td><span class="pill pay-st-' + esc(r.payment_status) + '">' + statusLabel(r.payment_status) + '</span></td>' +
        '<td>' + (canPay ? '<button type="button" class="btn-secondary pay-act" data-pay-id="' + r.id + '">Record payment</button>' : '') + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- Record payment modal ---------- */
  function openRecord(id) {
    var r = rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    recordTarget = r;
    $('payRecordInfo').textContent = r.guest_name + ' · ' + r.code + ' · Total ' + money(r.total_amount) +
      ' · Paid ' + money(r.amount_paid) + ' · Balance ' + money(r.balance);
    $('payRecordAmount').value = r.balance > 0 ? r.balance.toFixed(2) : '';
    $('payRecordAmount').max = r.balance.toFixed(2);
    $('payRecordError').style.display = 'none';
    $('payRecordModal').classList.remove('hidden');
  }
  function closeRecord() { $('payRecordModal').classList.add('hidden'); recordTarget = null; }
  function showRecError(msg) { var e = $('payRecordError'); e.textContent = msg; e.style.display = 'block'; }
  function submitRecord(body) {
    if (!recordTarget) return;
    body.id = recordTarget.id;
    adminApiCall('payments_record', body).then(function (res) {
      if (!res || !res.success) { showRecError((res && res.message) || 'Could not save the payment.'); return; }
      closeRecord();
      toast(res.payment_status === 'paid' ? 'Marked as Paid.' : 'Payment recorded.');
      load();
      if (typeof loadAllReservations === 'function') loadAllReservations();
    });
  }

  /* ---------- Export ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
  }
  function exportRows() {
    return filtered(false).map(function (r) {
      return [r.code, r.guest_name, r.cabin_name, dateOnly(r.check_in), sourceLabel(r), r.payment_method || '',
        r.total_amount, r.amount_paid, r.balance, statusLabel(r.payment_status)];
    });
  }
  var HEAD = ['Code', 'Guest', 'Accommodation', 'Check-in', 'Source', 'Method', 'Total', 'Paid', 'Balance', 'Status'];
  function stamp() { return new Date().toISOString().slice(0, 10); }
  function label() { return activeTab ? statusLabel(activeTab) : 'All'; }

  function exportExcel() {
    var data = exportRows();
    if (!data.length) { toast('Nothing to export.', true); return; }
    var go = function () {
      var ws = XLSX.utils.aoa_to_sheet([HEAD].concat(data));
      ws['!cols'] = [14, 24, 22, 12, 10, 14, 12, 12, 12, 10].map(function (w) { return { wch: w }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payments');
      XLSX.writeFile(wb, 'camp-mayagay-payments-' + label().toLowerCase() + '-' + stamp() + '.xlsx');
    };
    if (window.XLSX) { go(); return; }
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').then(go).catch(function () {
      toast('Could not load the Excel library. Check your internet connection.', true);
    });
  }

  function exportPdf() {
    var data = exportRows();
    if (!data.length) { toast('Nothing to export.', true); return; }
    var go = function () {
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      var total = 0, paid = 0, bal = 0;
      data.forEach(function (d) { total += d[6]; paid += d[7]; bal += d[8]; });
      doc.setFontSize(15);
      doc.text('Camp Mayagay - Payment Transactions (' + label() + ')', 40, 40);
      doc.setFontSize(9);
      doc.text('Generated ' + new Date().toLocaleString() + '  |  ' + data.length + ' record(s)  |  Total ' + moneyPlain(total) +
        '  |  Paid ' + moneyPlain(paid) + '  |  Balance ' + moneyPlain(bal), 40, 58);
      doc.autoTable({
        startY: 70,
        head: [HEAD],
        body: data.map(function (d) {
          var c = d.slice(); c[6] = moneyPlain(d[6]); c[7] = moneyPlain(d[7]); c[8] = moneyPlain(d[8]); return c;
        }),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [45, 90, 39] }
      });
      doc.save('camp-mayagay-payments-' + label().toLowerCase() + '-' + stamp() + '.pdf');
    };
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) { go(); return; }
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      .then(function () { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'); })
      .then(go)
      .catch(function () { toast('Could not load the PDF library. Check your internet connection.', true); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('view-payments')) return;

    document.querySelectorAll('.nav-item[data-view="payments"]').forEach(function (btn) {
      btn.addEventListener('click', load);
    });
    document.querySelectorAll('[data-pay-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        activeTab = b.getAttribute('data-pay-tab') || '';
        document.querySelectorAll('[data-pay-tab]').forEach(function (x) { x.classList.toggle('active', x === b); });
        render();
      });
    });
    ['paySearch', 'paySourceFilter', 'payDateFrom', 'payDateTo'].forEach(function (id) {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });
    $('payTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pay-id]');
      if (btn) openRecord(Number(btn.getAttribute('data-pay-id')));
    });
    $('payRecordClose').addEventListener('click', closeRecord);
    $('payRecordModal').addEventListener('click', function (e) { if (e.target.id === 'payRecordModal') closeRecord(); });
    $('payRecordForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var amt = Number($('payRecordAmount').value);
      if (!(amt > 0)) { showRecError('Enter an amount greater than 0.'); return; }
      if (recordTarget && amt > recordTarget.balance + 0.004) { showRecError('Amount is more than the balance of ' + money(recordTarget.balance) + '.'); return; }
      submitRecord({ add_amount: amt });
    });
    $('payRecordPaidBtn').addEventListener('click', function () { submitRecord({ mark_paid: true }); });
    $('payExportXlsx').addEventListener('click', exportExcel);
    $('payExportPdf').addEventListener('click', exportPdf);
  });
})();
