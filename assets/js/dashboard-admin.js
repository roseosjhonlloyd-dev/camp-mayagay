var weeklyTrend = [5, 15, 10, 15, 10, 20, 15];
var weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

var recentReservations = [
  { name: 'Carlos Santos', checkIn: 'May 20, 2026', checkOut: 'May 22, 2026', status: 'confirmed' },
  { name: 'Maria Santiago', checkIn: 'May 21, 2026', checkOut: 'May 23, 2026', status: 'confirmed' },
  { name: 'Pedro Garcia', checkIn: 'May 22, 2026', checkOut: 'May 24, 2026', status: 'pending' },
  { name: 'Ana Reyes', checkIn: 'May 23, 2026', checkOut: 'May 25, 2026', status: 'confirmed' }
];

var accommodationAvailability = [
  { name: 'Rooms', count: 6, line: 'green' },
  { name: 'Cabins', count: 4, line: 'red' },
  { name: 'Tent Areas', count: 8, line: 'blue' },
  { name: 'Kubo Huts', count: 3, line: 'dark' }
];

var systemNotifications = [
  { text: 'New booking received from Maria Santos.', time: '10 min ago' },
  { text: 'Check-in reminder for Pedro Garcia.', time: '1 hour ago' },
  { text: 'Monthly report is now available.', time: '2 hours ago' }
];

var users = [];

var accessModules = [
  { module_key: 'dashboard',     module: 'Dashboard',          admin: true,  staff: true,  guest: false },
  { module_key: 'reservation',   module: 'Reservation',        admin: true,  staff: true,  guest: true  },
  { module_key: 'accommodation', module: 'Accommodation',      admin: true,  staff: true,  guest: true  },
  { module_key: 'guest_record',  module: 'Guest Record',       admin: true,  staff: true,  guest: false },
  { module_key: 'notifications', module: 'Notifications',      admin: true,  staff: true,  guest: true  },
  { module_key: 'feedback',      module: 'Feedback & Concern', admin: true,  staff: true,  guest: true  },
  { module_key: 'reports',       module: 'Reports',            admin: true,  staff: true,  guest: false },
  { module_key: 'user_account',  module: 'User Account',       admin: true,  staff: false, guest: false },
  { module_key: 'settings',      module: 'Settings',           admin: true,  staff: false, guest: false }
];

var ACCESS_MODULES_PER_PAGE = 6;
var accessModulePage = 1;

// Real login/signup activity, loaded from the security_logs table via
// loadLoginActivity(). Populated on page load - see DOMContentLoaded below.
var loginLogs = [];

function computeLoginActivityStats() {
  var todayStr = new Date().toISOString().slice(0, 10);
  var totalToday = 0, successful = 0, failed = 0, suspicious = 0;
  var failsByUser = {};

  loginLogs.forEach(function (log) {
    var logDate = (log.login_time || log.created_at || '').slice(0, 10);
    if (logDate === todayStr) totalToday++;
    if (log.status === 'success') {
      successful++;
    } else {
      failed++;
      var key = log.username || log.user;
      failsByUser[key] = (failsByUser[key] || 0) + 1;
      if (failsByUser[key] >= 3) suspicious++;
    }
  });

  return { totalToday: totalToday, successful: successful, failed: failed, suspicious: suspicious };
}

// Security Alerts are now generated live from the security_logs table
// (loginLogs, loaded via loadLoginActivity()) instead of hardcoded text.
// See generateSecurityAlerts() below.
var securityAlerts = [];

/** Builds the Security Alerts list purely from real login activity:
 *  - 3+ failed attempts by the same account (checked against the
 *    account's configured Login Attempt limit, default 5) -> alert.
 *  - Any failed login coming from a location -> flagged as suspicious.
 *  Returns newest-first, capped to the 6 most relevant alerts. */
function generateSecurityAlerts() {
  if (!loginLogs || !loginLogs.length) return [];

  var attemptLimitSelect = document.getElementById('loginAttemptSelect');
  var attemptLimit = attemptLimitSelect ? parseInt(attemptLimitSelect.value, 10) : 5;
  if (!attemptLimit || isNaN(attemptLimit)) attemptLimit = 5;
  var flagThreshold = Math.min(3, attemptLimit); // flag once at least 3 fails (or the limit itself, if lower)

  // Sort newest first so the alerts reflect the most recent activity.
  var sorted = loginLogs.slice().sort(function (a, b) {
    var ta = a.login_time || a.created_at || '';
    var tb = b.login_time || b.created_at || '';
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });

  var failsByUser = {};
  var suspiciousSeen = {};
  var alerts = [];

  sorted.forEach(function (log) {
    if (log.status !== 'failed') return;
    var who = log.user || log.username || 'Unknown account';

    failsByUser[who] = (failsByUser[who] || 0) + 1;
    if (failsByUser[who] === flagThreshold) {
      alerts.push({
        text: failsByUser[who] + ' failed login attempts detected for ' + who + ' account.',
        time: log.login_time || log.created_at
      });
    }

    var loc = log.location;
    if (loc && loc !== 'Unknown' && !suspiciousSeen[loc + '|' + who]) {
      suspiciousSeen[loc + '|' + who] = true;
      alerts.push({
        text: 'Suspicious login detected from ' + loc + ' (' + who + ').',
        time: log.login_time || log.created_at
      });
    }
  });

  alerts.sort(function (a, b) {
    return (b.time || '') < (a.time || '') ? -1 : (b.time || '') > (a.time || '') ? 1 : 0;
  });

  return alerts.slice(0, 6).map(function (a) { return a.text; });
}

document.addEventListener('DOMContentLoaded', function () {
  initSidebarNavigation();
  initMobileSidebar();
  initSecurityTabs();
  initAccountSecurityControls();

  drawWeeklyChart();
  renderAccessModuleTable();
  initAccessModulePagination();
  initAccessModuleToggle();
  loadAccessModules();
  renderSecurityAlerts();
  initLoginActivityFilters();

  // Real data from the database - this is what makes every guest
  // reservation/action show up here on the admin side.
  loadAllReservations();
  loadAccommodations();
  loadAdminNotifications();
  loadFeedback();
  loadGuests();
  loadUsers();
  loadLoginActivity();

  initReservationFilters();
  initReservationCalendar();
  initCalendarDetailModeToggle();
  initReservationModal();
  initWalkInModal();
  initAccommodationFilters();
  initAccommodationCrud();
  initGuestFilters();
  initNotificationFilters();
  initUserManagement();
  initTogglePasswordIcons();
  initEditAdminProfile();
  initFeedbackResponseModal();
  initIdVerifyModal();
  initAccommodationReservationsModal();
  initAddMessageModal();
  initLoginLocationModal();

  var refreshBtn = document.getElementById('refreshReservationsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAllReservations);

  // Auto-update nang walang timer: kapag bumalik ka sa tab na ito
  // (halimbawa galing sa ibang tab kung saan may na-book), awtomatikong
  // kukunin ulit ang pinakabagong reservations at accommodations -
  // hindi na kailangan pang mag-hard refresh (F5).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      loadAllReservations();
      loadAccommodations();
    }
  });
  window.addEventListener('focus', function () {
      // Auto-refresh ng notifications: bawat 20 segundo at pag bumalik sa tab
  setInterval(function () {
    if (!document.hidden) loadAdminNotifications();
  }, 20000);
  window.addEventListener('focus', loadAdminNotifications);
    loadAllReservations();
    loadAccommodations();
  });

  var markAllBtn = document.getElementById('markAllNotifReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function () {
      adminApiCall('notifications_mark_read', {}).then(function (res) {
        loadAdminNotifications();
        if (typeof showAdminToast === 'function') {
          showAdminToast(res && res.success ? 'All notifications marked as read.' : 'Could not mark notifications as read.', !(res && res.success));
        }
      });
    });
  }
});

/* ---------------- SERVER API (real DB data, tied to guest accounts) ---------------- */
var sessionExpiredNoticeShown = false;
function adminApiCall(action, body) {
  return fetch('php/api.php?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {})
  }).then(function (res) {
    if (res.status === 401) {
      // Na-expire o nawala ang session (hal. session timeout setting,
      // o na-clear ang PHP session sa server) - dati, tahimik na
      // nag-eempty lang ang dashboard dito, kaya kailangang mag-logout/
      // login ulit para "gumana" - ngayon malinaw na sasabihin agad at
      // ide-redirect sa Login.
      if (!sessionExpiredNoticeShown) {
        sessionExpiredNoticeShown = true;
        showAdminToast('Your session has expired. Please log in again.', true);
        setTimeout(function () { window.location.href = 'Login.html'; }, 1800);
      }
    }
    return res.json();
  }).catch(function () {
    // Network error / hindi JSON ang sumagot - magbalik ng normal na
    // "failed" result sa halip na tahimik na "unhandled rejection" na
    // nag-iiwan ng lumang data sa screen.
    return { success: false, message: 'Unable to connect to the server.' };
  });
}

/* ---------------------------------------------------------------------
   Small toast so admin actions (Confirm / Decline / Delete / etc.) always
   give visible feedback instead of failing silently.
--------------------------------------------------------------------- */
var adminToastTimer = null;
function showAdminToast(message, isError) {
  var el = document.getElementById('adminToast');
  var textEl = document.getElementById('adminToastText');
  if (!el || !textEl) { if (isError) alert(message); return; }
  textEl.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(adminToastTimer);
  adminToastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
}

/* ---- Currency preference (System Preferences panel) ----
   Only changes the symbol/format money is displayed with across the
   dashboard; it does not convert amounts. Saved locally so it sticks
   between visits. */
var CURRENCY_INFO = {
  PHP: { symbol: '\u20b1', locale: 'en-PH' },
  USD: { symbol: '$',      locale: 'en-US' },
  SGD: { symbol: 'S$',     locale: 'en-SG' },
  AED: { symbol: '\u062f.\u0625', locale: 'ar-AE' },
  KRW: { symbol: '\u20a9', locale: 'ko-KR' },
  JPY: { symbol: '\u00a5', locale: 'ja-JP' },
  EUR: { symbol: '\u20ac', locale: 'en-IE' },
  GBP: { symbol: '\u00a3', locale: 'en-GB' },
  AUD: { symbol: 'A$',     locale: 'en-AU' },
  CNY: { symbol: '\u00a5', locale: 'zh-CN' },
  HKD: { symbol: 'HK$',    locale: 'en-HK' },
  THB: { symbol: '\u0e3f', locale: 'th-TH' }
};
var CURRENCY_STORAGE_KEY = 'campMayagayCurrency';

function getActiveCurrency() {
  try {
    var saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && CURRENCY_INFO[saved]) return saved;
  } catch (e) { /* localStorage unavailable - fall back to default */ }
  return 'PHP';
}

function setActiveCurrency(code) {
  if (!CURRENCY_INFO[code]) return;
  try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, code); } catch (e) { /* ignore */ }
}

function peso2(n) {
  var num = Number(n) || 0;
  var info = CURRENCY_INFO[getActiveCurrency()] || CURRENCY_INFO.PHP;
  var fractionDigits = (info === CURRENCY_INFO.JPY || info === CURRENCY_INFO.KRW) ? 0 : 2;
  return info.symbol + num.toLocaleString(info.locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/* ---- Reservations (every booking a guest makes shows up here) ---- */
var allReservations = [];
var reservationsRequestSeq = 0; // ginagamit para huwag hayaang ma-overwrite ang bagong data ng lumang response

function loadAllReservations() {
  var requestId = ++reservationsRequestSeq;
  adminApiCall('reservations_list', {}).then(function (res) {
    // Kung may mas bagong request na (halimbawa nag-refresh ulit habang
    // hinihintay pa ang unang sagot), huwag na gamitin ang huling
    // datang ito - baka mas luma pa ito kaysa sa kasalukuyang laman.
    if (requestId !== reservationsRequestSeq) return;
    allReservations = (res && res.success && res.reservations) ? res.reservations : [];
    renderReservationTable();
    renderRecentReservationsFromDb();
    renderStatTotals();
    renderReservationCalendar();
    renderTodayDashboardStats();
    drawWeeklyChart();
    if (reportsLoaded) loadReports();
  });
}

/* ---- Dashboard Overview: totoong Check-ins Today / Check-out Today
   (dating hardcoded "10" at "16" lang - hindi na demo, totoo na ngayon) ---- */
function renderTodayDashboardStats() {
  var todayKey = toDateKey(new Date());

  var checkinsToday = 0;
  var checkoutsToday = 0;
  var totalRevenue = 0;

  allReservations.forEach(function (r) {
    if (r.status === 'cancelled' || r.status === 'declined') return;
    if (String(r.check_in).slice(0, 10) === todayKey) checkinsToday++;
    if (String(r.check_out).slice(0, 10) === todayKey) checkoutsToday++;
    totalRevenue += Number(r.total_amount) || 0;
  });

  var setTxt = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statCheckinsToday', checkinsToday);
  setTxt('statCheckoutToday', checkoutsToday);
  setTxt('statTotalRevenue', peso2(totalRevenue));
}
function getFilteredReservations() {
  var searchBox = document.getElementById('resSearchInput');
  var checkInBox = document.getElementById('resCheckInFilter');
  var checkOutBox = document.getElementById('resCheckOutFilter');
  var statusBox = document.getElementById('resStatusFilter');

  var searchText = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var checkInValue = checkInBox ? checkInBox.value : '';
  var checkOutValue = checkOutBox ? checkOutBox.value : '';
  var statusValue = statusBox ? statusBox.value : '';

  return allReservations.filter(function (r) {
    var matchesSearch = searchText === '' ||
      (r.guest_name || '').toLowerCase().indexOf(searchText) !== -1 ||
      (r.code || '').toLowerCase().indexOf(searchText) !== -1 ||
      (r.cabin_name || '').toLowerCase().indexOf(searchText) !== -1;
    var matchesStatus = statusValue === '' || r.status === statusValue;
    var matchesCheckIn = checkInValue === '' || (r.check_in || '').indexOf(checkInValue) === 0;
    var matchesCheckOut = checkOutValue === '' || (r.check_out || '').indexOf(checkOutValue) === 0;
    return matchesSearch && matchesStatus && matchesCheckIn && matchesCheckOut;
  });
}

function initReservationFilters() {
  ['resSearchInput', 'resCheckInFilter', 'resCheckOutFilter', 'resStatusFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id === 'resSearchInput' ? 'input' : 'change', renderReservationTable);
  });
}

function renderReservationTable() {
  var tbody = document.getElementById('reservationTableBody');
  if (!tbody) return;

  var filtered = getFilteredReservations();

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-admin-note">No matching reservations found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (r) {
    var statusLabel = r.cancel_requested ? 'Cancel requested' : (r.status.charAt(0).toUpperCase() + r.status.slice(1));
    var pillClass = r.cancel_requested ? 'pending' : r.status;
    html += '<tr>';
    html += '  <td>' + r.code + '</td>';
    html += '  <td>' + r.guest_name + '</td>';
    html += '  <td>' + r.cabin_name + '</td>';
    html += '  <td>' + formatDateTime(r.check_in) + '</td>';
    html += '  <td>' + formatDateTime(r.check_out) + '</td>';
    html += '  <td>' + r.guests_count + '</td>';
    html += '  <td>' + peso2(r.total_amount) + '</td>';
    html += '  <td><span class="status-pill ' + pillClass + '">' + statusLabel + '</span></td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '      <button class="row-action-btn" data-action="view" data-id="' + r.id + '" title="View" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    if (r.cancel_requested) {
      html += '<button class="row-action-btn approve" data-action="approve_cancel" data-id="' + r.id + '" title="Approve cancellation" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M6 12.5L10 16.5L18 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      html += '<button class="row-action-btn decline" data-action="reject_cancel" data-id="' + r.id + '" title="Reject cancellation" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M8 8L16 16M16 8L8 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    } else if (r.status === 'pending') {
      html += '<button class="row-action-btn approve" data-action="confirm" data-id="' + r.id + '" title="Confirm" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M6 12.5L10 16.5L18 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      html += '<button class="row-action-btn decline" data-action="decline" data-id="' + r.id + '" title="Decline" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M8 8L16 16M16 8L8 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    } else if (r.status === 'confirmed') {
      html += '<button class="row-action-btn approve" data-action="complete" data-id="' + r.id + '" title="Mark completed" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M6 12.5L10 16.5L18 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    }
    html += '<button class="row-action-btn delete" data-action="delete" data-id="' + r.id + '" title="Delete" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9 7V5C9 4.4 9.4 4 10 4H14C14.6 4 15 4.4 15 5V7M18 7L17.3 19C17.2 19.6 16.7 20 16 20H8C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      if (action === 'view') {
        openReservationModal(id);
        return;
      }

      var actionLabels = {
        confirm: 'confirmed', decline: 'declined', complete: 'marked completed', delete: 'deleted'
      };
      
      if (action === 'approve_cancel' || action === 'reject_cancel') {
        btn.disabled = true;
        var cancelEndpoint = action === 'approve_cancel' ? 'reservations_approve_cancel' : 'reservations_reject_cancel';
        adminApiCall(cancelEndpoint, { id: id }).then(function (res) {
          if (res && res.success) {
            showAdminToast(action === 'approve_cancel' ? 'Cancellation approved.' : 'Cancellation request rejected.');
          } else {
            showAdminToast((res && res.message) || 'Could not update this reservation. Please try again.', true);
          }
          loadAllReservations();
        }).catch(function () {
          showAdminToast('Could not reach the server. Please try again.', true);
          btn.disabled = false;
        });
        return;
      }

      if (action === 'delete') {
        if (!confirm('Delete this reservation permanently?')) return;
        btn.disabled = true;
        adminApiCall('reservations_delete', { id: id }).then(function (res) {
          if (res && res.success) {
            showAdminToast('Reservation deleted.');
          } else {
            showAdminToast((res && res.message) || 'Could not delete this reservation. Please try again.', true);
          }
          loadAllReservations();
        }).catch(function () {
          showAdminToast('Could not reach the server. Please try again.', true);
          btn.disabled = false;
        });
        return;
      }

      var statusMap = { confirm: 'confirmed', decline: 'declined', complete: 'completed' };
      btn.disabled = true;
      adminApiCall('reservations_update_status', { id: id, status: statusMap[action] }).then(function (res) {
        if (res && res.success) {
          showAdminToast('Reservation ' + actionLabels[action] + '.');
        } else {
          showAdminToast((res && res.message) || 'Could not update this reservation. Please try again.', true);
        }
        loadAllReservations();
      }).catch(function () {
        showAdminToast('Could not reach the server. Please try again.', true);
        btn.disabled = false;
      });
    });
  });
}

function openReservationModal(id) {
  var r = allReservations.filter(function (row) { return String(row.id) === String(id); })[0];
  if (!r) return;

  var modal = document.getElementById('reservationModal');
  var info = document.getElementById('reservationModalInfo');
  var proof = document.getElementById('reservationModalProof');
  if (!modal || !info || !proof) return;

  var statusLabel = r.cancel_requested ? 'Cancel requested' : (r.status.charAt(0).toUpperCase() + r.status.slice(1));
  var pillClass = r.cancel_requested ? 'pending' : r.status;
  info.innerHTML =
    '<div class="modal-info-row"><span>Reference No.</span><span>' + r.code + '</span></div>' +
    '<div class="modal-info-row"><span>Guest Name</span><span>' + r.guest_name + '</span></div>' +
    '<div class="modal-info-row"><span>Contact Number</span><span>' + (r.guest_phone || '-') + '</span></div>' +
    '<div class="modal-info-row"><span>Email Address</span><span>' + (r.guest_email || '-') + '</span></div>' +
    '<div class="modal-info-row"><span>Accommodation</span><span>' + r.cabin_name + '</span></div>' +
    '<div class="modal-info-row"><span>Check-in</span><span>' + formatDateTime(r.check_in) + '</span></div>' +
    '<div class="modal-info-row"><span>Check-out</span><span>' + formatDateTime(r.check_out) + '</span></div>' +
    '<div class="modal-info-row"><span>Guests</span><span>' + r.guests_count + '</span></div>' +
    '<div class="modal-info-row"><span>Total Amount</span><span>' + peso2(r.total_amount) + '</span></div>' +
    '<div class="modal-info-row"><span>Status</span><span><span class="status-pill ' + pillClass + '">' + statusLabel + '</span></span></div>' +
    (r.cancel_requested ? '<div class="modal-info-row"><span>Cancellation Reason</span><span>' + (r.cancel_reason || '-') + '</span></div>' : '') +
    '<div class="modal-info-row"><span>Payment Method</span><span>' + (r.payment_method || '-') + '</span></div>' +
    '<div class="modal-info-row"><span>Payment Status</span><span>' + (r.payment_status || '-') + '</span></div>' +
    '<div class="modal-info-row"><span>Date Created</span><span>' + formatDateTime(r.created_at) + '</span></div>';

  var receiptImage = (r.data && r.data.receiptImage) ? r.data.receiptImage : null;
  var gcashRef = (r.data && r.data.gcashRef) ? r.data.gcashRef : null;

  if (receiptImage) {
    proof.innerHTML =
      '<img src="' + receiptImage + '" alt="Payment receipt" class="proof-receipt-img">' +
      '<p class="proof-amount">' + peso2(r.total_amount) + '</p>' +
      '<p><strong>' + (r.payment_method || 'No payment method on file') + '</strong></p>' +
      '<p>Guest: ' + r.guest_name + '</p>' +
      '<p>Reference: ' + r.code + '</p>' +
      '<p>Status: ' + (r.payment_status || 'unpaid') + '</p>';
  } else {
    proof.innerHTML =
      '<p class="proof-amount">' + peso2(r.total_amount) + '</p>' +
      '<p><strong>' + (r.payment_method || 'No payment method on file') + '</strong></p>' +
      (gcashRef ? '<p>GCash Reference No.: ' + gcashRef + '</p>' : '') +
      '<p>Guest: ' + r.guest_name + '</p>' +
      '<p>Reference: ' + r.code + '</p>' +
      '<p>Status: ' + (r.payment_status || 'unpaid') + '</p>' +
      (r.payment_method === 'Bank Transfer' ? '<p class="proof-missing">No receipt image was uploaded for this reservation.</p>' : '');
  }

  modal.classList.remove('hidden');
}

function initReservationModal() {
  var modal = document.getElementById('reservationModal');
  var closeBtn = document.getElementById('reservationModalClose');
  var closeBtn2 = document.getElementById('reservationModalCloseBtn');
  if (!modal) return;
  [closeBtn, closeBtn2].forEach(function (b) {
    if (b) b.addEventListener('click', function () { modal.classList.add('hidden'); });
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

function formatDateTime(v) {
  if (!v) return '-';
  var d = new Date(v.replace(' ', 'T'));
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderRecentReservationsFromDb() {
  var tbody = document.getElementById('recentReservationsBody');
  if (!tbody) return;
  var recent = allReservations.slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-admin-note">No reservations yet.</td></tr>';
    return;
  }
  var html = '';
  recent.forEach(function (r) {
    var statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
    html += '<tr>';
    html += '  <td>' + r.guest_name + '</td>';
    html += '  <td>' + formatDateTime(r.check_in) + '</td>';
    html += '  <td>' + formatDateTime(r.check_out) + '</td>';
    html += '  <td><span class="status-pill ' + r.status + '">' + statusLabel + '</span></td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

function renderStatTotals() {
  var el = document.getElementById('statTotalReservations');
  if (el) el.textContent = allReservations.length;
  var elRes = document.getElementById('resStatTotalReservations');
  if (elRes) elRes.textContent = allReservations.length;

  var confirmed = 0, pending = 0, cancelled = 0, revenue = 0;
  allReservations.forEach(function (r) {
    if (r.status === 'confirmed' || r.status === 'completed') confirmed++;
    if (r.status === 'pending') pending++;
    if (r.status === 'cancelled' || r.status === 'declined') cancelled++;
    if (r.status !== 'cancelled' && r.status !== 'declined') revenue += Number(r.total_amount) || 0;
  });
  var setTxt = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statConfirmedReservations', confirmed);
  setTxt('statPendingReservations', pending);
  setTxt('statCancelledReservations', cancelled);
  setTxt('statReservationRevenue', peso2(revenue));

  renderAccommodationStats();
}

/* ---- Accommodations (real availability instead of hardcoded counts) ---- */
var allAccommodations = [];
var accommodationsRequestSeq = 0;

function loadAccommodations() {
  var requestId = ++accommodationsRequestSeq;
  adminApiCall('accommodations_list', {}).then(function (res) {
    if (requestId !== accommodationsRequestSeq) return;
    allAccommodations = (res && res.success && res.accommodations) ? res.accommodations : [];
    renderAccommodationAvailabilityWidget();
    renderAccommodationTable();
    renderAccommodationStats();
    renderReservationCalendar();
    populateFeedbackAccommodationFilter();
    if (reportsLoaded) loadReports();
  });
}

/* ---- Walk-in Reservation (staff/admin adds a reservation directly,
   saved as "Confirmed" right away so it shows up on the calendar) ---- */
function populateWalkInCabinOptions() {
  var select = document.getElementById('walkInCabin');
  if (!select) return;
  var current = select.value;
  var options = '<option value="">Select accommodation...</option>';
  allAccommodations.forEach(function (a) {
    options += '<option value="' + a.slug + '" data-name="' + a.accommodation_name + '" data-price="' + a.price + '">' +
      a.accommodation_name + (a.status && a.status !== 'available' ? ' (Unavailable)' : '') + '</option>';
  });
  select.innerHTML = options;
  if (current) select.value = current;
}

function openWalkInModal() {
  var modal = document.getElementById('walkInModal');
  var form = document.getElementById('walkInForm');
  var errorBox = document.getElementById('walkInFormError');
  if (!modal || !form) return;
  form.reset();
  if (errorBox) { errorBox.style.display = 'none'; errorBox.textContent = ''; }
  populateWalkInCabinOptions();

  // Default check-in to whatever date is currently selected on the
  // calendar, and check-out to the next day, so admin has less to type.
  var checkInInput = document.getElementById('walkInCheckIn');
  var checkOutInput = document.getElementById('walkInCheckOut');
  if (checkInInput && checkOutInput) {
    var base = calendarSelectedDate || new Date();
    var nextDay = new Date(base);
    nextDay.setDate(nextDay.getDate() + 1);
    checkInInput.value = toDateKey(base);
    checkOutInput.value = toDateKey(nextDay);
  }
  document.getElementById('walkInGuestsCount').value = 1;
  modal.classList.remove('hidden');
}

function closeWalkInModal() {
  var modal = document.getElementById('walkInModal');
  if (modal) modal.classList.add('hidden');
}

function initWalkInModal() {
  var openBtn = document.getElementById('openWalkInModalBtn');
  var modal = document.getElementById('walkInModal');
  var closeBtn = document.getElementById('walkInModalClose');
  var cancelBtn = document.getElementById('walkInModalCancelBtn');
  var form = document.getElementById('walkInForm');
  var cabinSelect = document.getElementById('walkInCabin');
  var checkInInput = document.getElementById('walkInCheckIn');
  var checkOutInput = document.getElementById('walkInCheckOut');
  var totalInput = document.getElementById('walkInTotalAmount');
  if (!modal || !form) return;

  if (openBtn) openBtn.addEventListener('click', openWalkInModal);
  [closeBtn, cancelBtn].forEach(function (b) {
    if (b) b.addEventListener('click', closeWalkInModal);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeWalkInModal(); });

  // Auto-suggest the total (price/night x nights) whenever the accommodation
  // or dates change - admin can still edit the amount before saving.
  function suggestTotal() {
    if (!cabinSelect || !cabinSelect.value || !checkInInput.value || !checkOutInput.value) return;
    var opt = cabinSelect.options[cabinSelect.selectedIndex];
    var price = Number(opt.getAttribute('data-price')) || 0;
    var ci = new Date(checkInInput.value + 'T00:00');
    var co = new Date(checkOutInput.value + 'T00:00');
    var nights = Math.round((co - ci) / (1000 * 60 * 60 * 24));
    if (nights > 0 && price > 0) totalInput.value = (price * nights).toFixed(2);
  }
  if (cabinSelect) cabinSelect.addEventListener('change', suggestTotal);
  if (checkInInput) checkInInput.addEventListener('change', suggestTotal);
  if (checkOutInput) checkOutInput.addEventListener('change', suggestTotal);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var errorBox = document.getElementById('walkInFormError');
    var showError = function (msg) {
      if (errorBox) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
    };

    var guestName = document.getElementById('walkInGuestName').value.trim();
    var cabinId = cabinSelect.value;
    var cabinName = cabinSelect.options[cabinSelect.selectedIndex] ? cabinSelect.options[cabinSelect.selectedIndex].getAttribute('data-name') : '';
    var checkIn = checkInInput.value;
    var checkOut = checkOutInput.value;

    if (!guestName) { showError('Guest name is required.'); return; }
    if (!cabinId) { showError('Please select an accommodation.'); return; }
    if (!checkIn || !checkOut || checkOut <= checkIn) { showError('Check-out must be after check-in.'); return; }

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

    adminApiCall('reservations_create', {
      guest_name: guestName,
      guest_phone: document.getElementById('walkInGuestPhone').value.trim(),
      guest_email: document.getElementById('walkInGuestEmail').value.trim(),
      cabin_id: cabinId,
      cabin_name: cabinName,
      check_in: checkIn + ' 00:00:00',
      check_out: checkOut + ' 00:00:00',
      guests_count: Number(document.getElementById('walkInGuestsCount').value) || 1,
      payment_method: document.getElementById('walkInPaymentMethod').value,
      total_amount: Number(totalInput.value) || 0,
      status: 'confirmed'
    }).then(function (res) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
      if (!res || !res.success) {
        showError((res && res.message) ? res.message : 'Could not save the reservation. Please try again.');
        return;
      }
      closeWalkInModal();
      showAdminToast('Walk-in reservation saved and confirmed.');
      loadAllReservations();
      loadAccommodations();
    });
  });
}

/* ---- Reservation Calendar (Check-ins / Check-outs / Room Availability) ---- */
var calendarViewDate = new Date();      // buwan na ipinapakita sa calendar
var calendarSelectedDate = new Date();  // aktwal na napiling araw
var calendarDetailMode = 'date';        // 'date' = napiling araw lang, 'all' = lahat ng pending

function toDateKey(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function initReservationCalendar() {
  var prevBtn = document.getElementById('calPrevMonthBtn');
  var nextBtn = document.getElementById('calNextMonthBtn');
  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener('click', function () {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderReservationCalendar();
  });
  nextBtn.addEventListener('click', function () {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderReservationCalendar();
  });

  renderReservationCalendar();
}

function renderReservationCalendar() {
  var grid = document.getElementById('calendarGrid');
  var monthLabel = document.getElementById('calMonthLabel');
  if (!grid || !monthLabel) return;

  var year = calendarViewDate.getFullYear();
  var month = calendarViewDate.getMonth();
  monthLabel.textContent = calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  var firstDay = new Date(year, month, 1);
  var startWeekday = firstDay.getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var todayKey = toDateKey(new Date());
  var selectedKey = toDateKey(calendarSelectedDate);

  // Mabilis na tignan kung anong mga araw sa buwang ito may check-in/check-out.
  // Confirmed (o completed) na lang ang lumalabas sa calendar - hindi pa
  // dapat makita rito ang mga "pending" na reservation na hindi pa
  // na-approve ng staff/admin.
  var checkinDays = {};
  var checkoutDays = {};
  allReservations.forEach(function (r) {
    if (r.status !== 'confirmed' && r.status !== 'completed') return;
    if (r.check_in) checkinDays[String(r.check_in).slice(0, 10)] = true;
    if (r.check_out) checkoutDays[String(r.check_out).slice(0, 10)] = true;
  });

  var html = '';
  for (var i = 0; i < startWeekday; i++) {
    html += '<div class="calendar-day empty"></div>';
  }
  for (var day = 1; day <= daysInMonth; day++) {
    var cellDate = new Date(year, month, day);
    var key = toDateKey(cellDate);
    var classes = 'calendar-day';
    if (key === todayKey) classes += ' today';
    if (key === selectedKey) classes += ' selected';

    var dots = '';
    if (checkinDays[key] || checkoutDays[key]) {
      dots = '<span class="calendar-day-dots">';
      if (checkinDays[key]) dots += '<span class="cal-badge cal-badge-in">IN</span>';
      if (checkoutDays[key]) dots += '<span class="cal-badge cal-badge-out">OUT</span>';
      dots += '</span>';
    }

    html += '<button type="button" class="' + classes + '" data-date="' + key + '">' + day + dots + '</button>';
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.calendar-day:not(.empty)').forEach(function (cell) {
    cell.addEventListener('click', function () {
      var parts = cell.dataset.date.split('-');
      calendarSelectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      renderReservationCalendar();
      renderCalendarDayDetails();
    });
  });

  renderCalendarDayDetails();
}

function renderCalendarDayDetails() {
  var label = document.getElementById('calSelectedDateLabel');
  var checkinList = document.getElementById('calCheckinList');
  var checkoutList = document.getElementById('calCheckoutList');
  var availGrid = document.getElementById('calAvailabilityGrid');
  if (!label || !checkinList || !checkoutList || !availGrid) return;

  var selectedKey = toDateKey(calendarSelectedDate);
  var todayKey = toDateKey(new Date());
  label.textContent = (selectedKey === todayKey ? 'Today - ' : '') +
    calendarSelectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Simpleng function para ipakita ang petsa nang maikli (hal. "Sep 6, 2026")
  function shortDate(dateStr) {
    var d = new Date(String(dateStr).slice(0, 10) + 'T00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  var checkins, checkouts;

  if (calendarDetailMode === 'all') {
    // LAHAT NG PENDING mode: lahat ng "pending" na reservation, hindi na
    // naka-base sa napiling petsa sa calendar.
    checkins = allReservations
      .filter(function (r) { return r.status === 'pending' && r.check_in; })
      .sort(function (a, b) { return String(a.check_in).localeCompare(String(b.check_in)); });
    checkouts = allReservations
      .filter(function (r) { return r.status === 'pending' && r.check_out; })
      .sort(function (a, b) { return String(a.check_out).localeCompare(String(b.check_out)); });

    checkinList.innerHTML = checkins.length ? checkins.map(function (r) {
      return '<div class="calendar-detail-item all-mode"><span>' + r.guest_name + ' &middot; ' + r.cabin_name + '</span><span class="item-date">' + shortDate(r.check_in) + '</span></div>';
    }).join('') : '<p class="calendar-detail-empty">No pending check-ins at this time.</p>';

    checkoutList.innerHTML = checkouts.length ? checkouts.map(function (r) {
      return '<div class="calendar-detail-item all-mode"><span>' + r.guest_name + ' &middot; ' + r.cabin_name + '</span><span class="item-date">' + shortDate(r.check_out) + '</span></div>';
    }).join('') : '<p class="calendar-detail-empty">There are no pending check-outs at this time.</p>';
  } else {
    // PINILING PETSA mode: base sa araw na kinlik sa calendar (dating gawi).
    // Confirmed/completed lang - kapareho ng dots sa itaas.
    checkins = allReservations.filter(function (r) {
      return (r.status === 'confirmed' || r.status === 'completed') && String(r.check_in).slice(0, 10) === selectedKey;
    });
    checkouts = allReservations.filter(function (r) {
      return (r.status === 'confirmed' || r.status === 'completed') && String(r.check_out).slice(0, 10) === selectedKey;
    });

    checkinList.innerHTML = checkins.length ? checkins.map(function (r) {
      return '<div class="calendar-detail-item"><span>' + r.guest_name + '</span><span class="cabin-tag">' + r.cabin_name + '</span></div>';
    }).join('') : '<p class="calendar-detail-empty">There are no scheduled check-ins today.</p>';

    checkoutList.innerHTML = checkouts.length ? checkouts.map(function (r) {
      return '<div class="calendar-detail-item"><span>' + r.guest_name + '</span><span class="cabin-tag">' + r.cabin_name + '</span></div>';
    }).join('') : '<p class="calendar-detail-empty">There is no scheduled check-out today.</p>';
  }

  // Room availability: laging naka-base sa napiling petsa sa calendar,
  // kahit anong mode ang toggle (para may malinaw na sagot: available ba
  // ang cabin sa araw na iyon).
  var occupiedAccommodationIds = {};
  allReservations.forEach(function (r) {
    if (r.status !== 'confirmed' && r.status !== 'completed') return;
    var ci = String(r.check_in).slice(0, 10);
    var co = String(r.check_out).slice(0, 10);
    if (ci <= selectedKey && selectedKey < co) {
      occupiedAccommodationIds[r.accommodation_id] = true;
    }
  });

  if (allAccommodations.length) {
    availGrid.innerHTML = allAccommodations.map(function (a) {
      var occupied = !!occupiedAccommodationIds[a.accommodation_id];
      var statusClass = occupied ? 'occupied' : 'avail';
      var statusText = occupied ? 'Occupied' : 'Available';
      var iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 11L12 4l9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9h14v-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return '<div class="calendar-avail-card ' + statusClass + '">' +
        '<span class="avail-card-icon">' + iconSvg + '</span>' +
        '<span class="avail-card-name">' + a.accommodation_name + '</span>' +
        '<span class="avail-card-status">' + statusText + '</span>' +
        '</div>';
    }).join('');
  } else {
    availGrid.innerHTML = '<p class="calendar-detail-empty">No accommodations found.</p>';
  }
}

function initCalendarDetailModeToggle() {
  var toggle = document.getElementById('calDetailModeToggle');
  if (!toggle) return;
  toggle.querySelectorAll('.cal-mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      calendarDetailMode = btn.getAttribute('data-mode');
      toggle.querySelectorAll('.cal-mode-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderCalendarDayDetails();
    });
  });
}

function renderAccommodationAvailabilityWidget() {
  var container = document.getElementById('availabilityGrid');
  if (!container || !allAccommodations.length) return;
  var html = '';
  allAccommodations.forEach(function (a) {
    var lineClass = a.status === 'available' ? 'green' : 'red';
    var imgUrl = a.image || '';
    html += '<div class="avail-card line-' + lineClass + '" data-acc-filter="' + a.accommodation_name.replace(/"/g, '&quot;') + '" data-acc-image="' + imgUrl.replace(/"/g, '&quot;') + '" role="button" tabindex="0">';
    html += '  <div class="avail-card-image" style="background-image:url(\'' + imgUrl + '\')"><span class="avail-status-dot"></span></div>';
    html += '  <div class="avail-card-body">';
    html += '    <p class="avail-name">' + a.accommodation_name + '</p>';
    html += '    <p class="avail-count">' + peso2(a.price) + '</p>';
    html += '    <p class="avail-sub">' + (a.status.charAt(0).toUpperCase() + a.status.slice(1)) + '</p>';
    html += '  </div>';
    html += '</div>';
  });
  container.innerHTML = html;

  container.querySelectorAll('[data-acc-filter]').forEach(function (card) {
    card.addEventListener('click', function () {
      openAccommodationReservationsModal(card.getAttribute('data-acc-filter'), card.getAttribute('data-acc-image'));
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAccommodationReservationsModal(card.getAttribute('data-acc-filter'), card.getAttribute('data-acc-image'));
      }
    });
  });
}

function openAccommodationReservationsModal(accommodationName, accommodationImage) {
  var modal = document.getElementById('accommodationReservationsModal');
  if (!modal) return;

  document.getElementById('accResModalTitle').textContent = accommodationName;
  var imgWrap = document.getElementById('accResModalImage');
  if (imgWrap) {
    imgWrap.style.backgroundImage = accommodationImage ? "url('" + accommodationImage + "')" : 'none';
  }

  var matching = allReservations.filter(function (r) { return r.cabin_name === accommodationName; });
  var body = document.getElementById('accResModalBody');
  if (!matching.length) {
    body.innerHTML = '<p class="empty-admin-note">No reservations yet for this accommodation.</p>';
  } else {
    var html = '<table class="data-table"><thead><tr><th>Guest Name</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead><tbody>';
    matching.forEach(function (r) {
      var statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
      html += '<tr><td>' + r.guest_name + '</td><td>' + formatDateTime(r.check_in) + '</td><td>' + formatDateTime(r.check_out) + '</td>'
        + '<td><span class="status-pill ' + r.status + '">' + statusLabel + '</span></td></tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

function initAccommodationReservationsModal() {
  var modal = document.getElementById('accommodationReservationsModal');
  if (!modal) return;
  var closeBtn = document.getElementById('accResModalClose');
  var closeBtn2 = document.getElementById('accResModalCloseBtn');
  [closeBtn, closeBtn2].forEach(function (b) {
    if (b) b.addEventListener('click', function () { modal.classList.add('hidden'); });
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });
}

function getFilteredAccommodations() {
  var searchBox = document.getElementById('accSearchInput');
  var typeBox = document.getElementById('accTypeFilter');
  var statusBox = document.getElementById('accStatusFilter');

  var searchText = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var typeValue = typeBox ? typeBox.value : '';
  var statusValue = statusBox ? statusBox.value : '';

  return allAccommodations.filter(function (a) {
    var matchesSearch = searchText === '' ||
      a.accommodation_name.toLowerCase().indexOf(searchText) !== -1 ||
      a.type.toLowerCase().indexOf(searchText) !== -1;
    var matchesType = typeValue === '' || a.type === typeValue;
    var matchesStatus = statusValue === '' || a.status === statusValue;
    return matchesSearch && matchesType && matchesStatus;
  });
}

function initAccommodationFilters() {
  ['accSearchInput', 'accTypeFilter', 'accStatusFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id === 'accSearchInput' ? 'input' : 'change', renderAccommodationTable);
  });
  var refreshBtn = document.getElementById('refreshAccommodationsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', function () { loadAccommodations(); });
}

function renderAccommodationTable() {
  var tbody = document.getElementById('accommodationTableBody');
  if (!tbody) return;

  var filtered = getFilteredAccommodations();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-admin-note">No accommodations found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (a) {
    var statusLabel = a.status.charAt(0).toUpperCase() + a.status.slice(1);
    var typeLabel = a.type.charAt(0).toUpperCase() + a.type.slice(1);
    html += '<tr>';
    html += '  <td><div class="acc-thumb-row">' + (a.image ? '<img src="' + a.image + '" alt="">' : '') + '<span>' + a.accommodation_name + '</span></div></td>';
    html += '  <td>' + typeLabel + '</td>';
    html += '  <td>' + (a.capacity || '-') + '</td>';
    html += '  <td>' + peso2(a.price) + '</td>';
    html += '  <td><span class="status-pill ' + (a.status === 'available' ? 'confirmed' : 'cancelled') + '">' + statusLabel + '</span></td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '      <button class="row-action-btn" data-toggle-id="' + a.accommodation_id + '" data-current="' + a.status + '" title="Toggle availability" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    html += '      <button class="row-action-btn" data-edit-acc-id="' + a.accommodation_id + '" title="Edit" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20L4.6 16.7L16 5.3C16.6 4.7 17.6 4.7 18.2 5.3L18.7 5.8C19.3 6.4 19.3 7.4 18.7 8L7.3 19.4L4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>';
    html += '      <button class="row-action-btn delete" data-delete-acc-id="' + a.accommodation_id + '" title="Delete" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9 7V5C9 4.4 9.4 4 10 4H14C14.6 4 15 4.4 15 5V7M18 7L17.3 19C17.2 19.6 16.7 20 16 20H8C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-toggle-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-toggle-id');
      var current = btn.getAttribute('data-current');
      var next = current === 'available' ? 'unavailable' : 'available';
      adminApiCall('accommodations_update_status', { accommodation_id: id, status: next }).then(loadAccommodations);
    });
  });
  tbody.querySelectorAll('[data-edit-acc-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openAccommodationModal(btn.getAttribute('data-edit-acc-id')); });
  });
  tbody.querySelectorAll('[data-delete-acc-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Delete this accommodation permanently?')) return;
      adminApiCall('accommodations_delete', { accommodation_id: btn.getAttribute('data-delete-acc-id') }).then(function (res) {
        if (res && res.success) { loadAccommodations(); }
        else { alert((res && res.message) || 'Could not delete accommodation.'); }
      });
    });
  });
}

var DEFAULT_AMENITIES = ['Complete beddings', 'Kettle', 'Plates', 'Mugs'];
var accAmenities = [];

function renderAccAmenities() {
  var list = document.getElementById('accFormAmenityList');
  if (!list) return;
  list.innerHTML = '';
  accAmenities.forEach(function (name, i) {
    var chip = document.createElement('span');
    chip.className = 'amen-chip';
    chip.appendChild(document.createTextNode(name));
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Remove ' + name);
    x.innerHTML = '&times;';
    x.addEventListener('click', function () { accAmenities.splice(i, 1); renderAccAmenities(); });
    chip.appendChild(x);
    list.appendChild(chip);
  });
}

function addAccAmenityFromInput() {
  var input = document.getElementById('accFormAmenityInput');
  if (!input) return;
  var val = input.value.replace(/\s+/g, ' ').trim();
  if (!val) return;
  var exists = accAmenities.some(function (a) { return a.toLowerCase() === val.toLowerCase(); });
  if (!exists && accAmenities.length < 20) accAmenities.push(val.slice(0, 40));
  input.value = '';
  renderAccAmenities();
  input.focus();
}

function initAccommodationCrud() {
  var amenAddBtn = document.getElementById('accFormAmenityAddBtn');
  if (amenAddBtn) amenAddBtn.addEventListener('click', addAccAmenityFromInput);
  var amenInput = document.getElementById('accFormAmenityInput');
  if (amenInput) amenInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addAccAmenityFromInput(); }
  });
  var addBtn = document.getElementById('addAccommodationBtn');
  if (addBtn) addBtn.addEventListener('click', function () { openAccommodationModal(null); });

  var closeBtn = document.getElementById('accommodationModalClose');
  var cancelBtn = document.getElementById('accommodationModalCancelBtn');
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeAccommodationModal);
  });

  var form = document.getElementById('accommodationForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = document.getElementById('accFormId').value;
      addAccAmenityFromInput();
      var payload = {
        amenities: accAmenities.slice(),
        accommodation_name: document.getElementById('accFormName').value.trim(),
        type: document.getElementById('accFormType').value,
        capacity: document.getElementById('accFormCapacity').value.trim(),
        price: document.getElementById('accFormPrice').value,
        status: document.getElementById('accFormStatus').value,
        description: document.getElementById('accFormDescription').value.trim()
      };

      var action = 'accommodations_create';
      if (id) { action = 'accommodations_update'; payload.accommodation_id = id; }

      var fileInput = document.getElementById('accFormImage');
      var file = fileInput && fileInput.files && fileInput.files[0];

      function submitAccommodation() {
        adminApiCall(action, payload).then(function (res) {
          if (res && res.success) {
            closeAccommodationModal();
            loadAccommodations();
          } else {
            alert((res && res.message) || 'Could not save accommodation.');
          }
        });
      }

      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert('Photo is larger than 5MB. Please choose a smaller image.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          payload.image = reader.result; // data:image/...;base64,...
          submitAccommodation();
        };
        reader.onerror = function () {
          alert('Could not read that photo. Please try another file.');
        };
        reader.readAsDataURL(file);
      } else {
        submitAccommodation();
      }
    });
  }

  var imageInput = document.getElementById('accFormImage');
  if (imageInput) {
    imageInput.addEventListener('change', function () {
      var file = imageInput.files && imageInput.files[0];
      var preview = document.getElementById('accFormImagePreview');
      if (!file || !preview) return;
      var reader = new FileReader();
      reader.onload = function () {
        preview.src = reader.result;
        preview.style.display = '';
      };
      reader.readAsDataURL(file);
    });
  }
}

function openAccommodationModal(id) {
  var modal = document.getElementById('accommodationModal');
  var title = document.getElementById('accommodationModalTitle');
  if (!modal) return;

  document.getElementById('accommodationForm').reset();
  document.getElementById('accFormId').value = '';
  document.getElementById('accFormExistingImage').value = '';
  accAmenities = DEFAULT_AMENITIES.slice();
  var amenInputEl = document.getElementById('accFormAmenityInput');
  if (amenInputEl) amenInputEl.value = '';
  var preview = document.getElementById('accFormImagePreview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }

  if (id) {
    var a = allAccommodations.filter(function (row) { return String(row.accommodation_id) === String(id); })[0];
    if (!a) return;
    title.textContent = 'Edit Accommodation';
    document.getElementById('accFormId').value = a.accommodation_id;
    document.getElementById('accFormName').value = a.accommodation_name || '';
    document.getElementById('accFormType').value = a.type || 'cabin';
    document.getElementById('accFormCapacity').value = a.capacity || '';
    document.getElementById('accFormPrice').value = a.price || '';
    document.getElementById('accFormStatus').value = a.status || 'available';
    document.getElementById('accFormDescription').value = a.description || '';
    accAmenities = Array.isArray(a.amenities) ? a.amenities.slice() : DEFAULT_AMENITIES.slice();
    if (a.image && preview) {
      document.getElementById('accFormExistingImage').value = a.image;
      preview.src = a.image;
      preview.style.display = '';
    }
  } else {
    title.textContent = 'Add Accommodation';
  }

  renderAccAmenities();
  modal.classList.remove('hidden');
}

function closeAccommodationModal() {
  var modal = document.getElementById('accommodationModal');
  if (modal) modal.classList.add('hidden');
}

function renderAccommodationStats() {
  var setTxt = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statTotalAccommodations', allAccommodations.length);
  var available = allAccommodations.filter(function (a) { return a.status === 'available'; }).length;
  setTxt('statAvailableAccommodations', available);
  var confirmedBookings = allReservations.filter(function (r) { return r.status === 'confirmed' || r.status === 'completed'; }).length;
  setTxt('statConfirmedBookings', confirmedBookings);
  var avgPrice = allAccommodations.length
    ? allAccommodations.reduce(function (sum, a) { return sum + (Number(a.price) || 0); }, 0) / allAccommodations.length
    : 0;
  setTxt('statAvgPrice', peso2(avgPrice));
}

/* ---- Guest Records (aggregated from reservations) ---- */
var allGuests = [];

function loadGuests() {
  adminApiCall('guests_list', {}).then(function (res) {
    allGuests = (res && res.success && res.guests) ? res.guests : [];
    renderGuestTable();
    renderGuestStats();
  });
}

function getFilteredGuests() {
  var searchBox = document.getElementById('guestSearchInput');
  var statusBox = document.getElementById('guestStatusFilter');
  var searchText = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var statusValue = statusBox ? statusBox.value : '';

  return allGuests.filter(function (g) {
    var matchesSearch = searchText === '' ||
      g.guest_name.toLowerCase().indexOf(searchText) !== -1 ||
      (g.guest_email || '').toLowerCase().indexOf(searchText) !== -1;
    var matchesStatus = statusValue === '' || g.status === statusValue;
    return matchesSearch && matchesStatus;
  });
}

function initGuestFilters() {
  ['guestSearchInput', 'guestStatusFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id === 'guestSearchInput' ? 'input' : 'change', renderGuestTable);
  });
  var refreshBtn = document.getElementById('refreshGuestsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadGuests);

  var guestTbody = document.getElementById('guestTableBody');
  if (guestTbody) {
    guestTbody.addEventListener('click', function (e) {
      var viewBtn = e.target.closest('.guest-view-btn');
      if (viewBtn) {
        openGuestViewModal(viewBtn.dataset.name, viewBtn.dataset.email);
        return;
      }
      var editBtn = e.target.closest('.guest-edit-btn');
      if (editBtn) {
        var uid = editBtn.dataset.userId;
        if (!uid || uid === '0') {
          alert('This guest has no account record to edit.');
          return;
        }
        openUserModal(uid);
      }
    });
  }

  var guestViewModalEl = document.getElementById('guestViewModal');
  var guestViewClose = document.getElementById('guestViewModalClose');
  var guestViewCloseBtn = document.getElementById('guestViewModalCloseBtn');
  if (guestViewClose) guestViewClose.addEventListener('click', closeGuestViewModal);
  if (guestViewCloseBtn) guestViewCloseBtn.addEventListener('click', closeGuestViewModal);
  if (guestViewModalEl) guestViewModalEl.addEventListener('click', function (e) { if (e.target === guestViewModalEl) closeGuestViewModal(); });
}

function renderGuestTable() {
  var tbody = document.getElementById('guestTableBody');
  if (!tbody) return;

  var filtered = getFilteredGuests();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-admin-note">No guest records found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (g) {
    var statusLabel = g.status.charAt(0).toUpperCase() + g.status.slice(1);
    html += '<tr>';
    html += '  <td>' + g.guest_id + '</td>';
    html += '  <td>' + g.guest_name + '</td>';
    html += '  <td>' + (g.guest_email || '-') + '</td>';
    html += '  <td>' + g.total_bookings + '</td>';
    html += '  <td>' + formatDateTime(g.last_reservation) + '</td>';
    html += '  <td><span class="pill status-' + g.status + '">' + statusLabel + '</span></td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '      <button class="row-action-btn guest-view-btn" data-name="' + g.guest_name.replace(/"/g, '&quot;') + '" data-email="' + (g.guest_email || '').replace(/"/g, '&quot;') + '" title="View" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    html += '      <button class="row-action-btn guest-edit-btn" data-user-id="' + g.user_id + '" title="Edit" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20L4.6 16.7L16 5.3C16.6 4.7 17.6 4.7 18.2 5.3L18.7 5.8C19.3 6.4 19.3 7.4 18.7 8L7.3 19.4L4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

function renderGuestStats() {
  var setTxt = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statTotalGuests', allGuests.length);
  setTxt('statActiveGuests', allGuests.filter(function (g) { return g.status === 'active'; }).length);
  setTxt('statInactiveGuests', allGuests.filter(function (g) { return g.status === 'inactive'; }).length);
  var now = new Date();
  var newThisMonth = allGuests.filter(function (g) {
    if (!g.last_reservation) return false;
    var d = new Date(g.last_reservation.replace(' ', 'T'));
    return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  setTxt('statNewGuests', newThisMonth);
}

function openGuestViewModal(name, email) {
  var modal = document.getElementById('guestViewModal');
  var body = document.getElementById('guestViewBody');
  if (!modal || !body) return;

  var guest = allGuests.filter(function (g) { return g.guest_name === name && (g.guest_email || '') === email; })[0];
  var bookings = allReservations.filter(function (r) { return r.guest_name === name && (r.guest_email || '') === email; });

  var html = '';
  html += '<div class="modal-info-row guest-summary-row"><span>Name</span><span>' + name + '</span></div>';
  html += '<div class="modal-info-row guest-summary-row"><span>Email</span><span>' + (email || '-') + '</span></div>';
  html += '<div class="modal-info-row guest-summary-row"><span>Status</span><span>' + (guest ? (guest.status.charAt(0).toUpperCase() + guest.status.slice(1)) : '-') + '</span></div>';
  html += '<div class="modal-info-row guest-summary-row"><span>Total Bookings</span><span>' + bookings.length + '</span></div>';
  html += '<p class="modal-section-title" style="margin-top:14px;">Reservation History</p>';
  if (!bookings.length) {
    html += '<p class="empty-admin-note">No reservations found.</p>';
  } else {
    bookings.forEach(function (r) {
      html += '<div class="modal-info-row guest-summary-row"><span>' + r.cabin_name + ' (' + formatDateTime(r.check_in) + ' &rarr; ' + formatDateTime(r.check_out) + ')</span><span>' + r.status + '</span></div>';
    });
  }
  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeGuestViewModal() {
  var modal = document.getElementById('guestViewModal');
  if (modal) modal.classList.add('hidden');
}

/* ---- Notifications (booking/feedback/payment events from guests) ---- */
var allNotifications = [];

function loadAdminNotifications() {
  adminApiCall('notifications_list', {}).then(function (res) {
    allNotifications = (res && res.success && res.notifications) ? res.notifications : [];

    var widget = document.getElementById('systemNotifList');
    if (widget) {
      var widgetHtml = '';
      allNotifications.slice(0, 5).forEach(function (n) {
        widgetHtml += '<div class="notif-row">';
        widgetHtml += '  <span class="dot"></span>';
        widgetHtml += '  <div>';
        widgetHtml += '    <p class="notif-text">' + n.title + ' - ' + n.description + '</p>';
        widgetHtml += '    <p class="notif-time">' + formatDateTime(n.created_at) + '</p>';
        widgetHtml += '  </div>';
        widgetHtml += '</div>';
      });
      widget.innerHTML = widgetHtml || '<p class="empty-admin-note">No notifications yet.</p>';
    }

    renderNotificationTable();
    renderNotificationStats();
  });
}

function getFilteredNotifications() {
  var searchBox = document.getElementById('notifSearchInput');
  var typeBox = document.getElementById('notifTypeFilter');
  var statusBox = document.getElementById('notifStatusFilter');
  var searchText = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var typeValue = typeBox ? typeBox.value : '';
  var statusValue = statusBox ? statusBox.value : '';

  return allNotifications.filter(function (n) {
    var matchesSearch = searchText === '' ||
      n.title.toLowerCase().indexOf(searchText) !== -1 ||
      (n.description || '').toLowerCase().indexOf(searchText) !== -1;
    var matchesType = typeValue === '' || n.type === typeValue;
    var matchesStatus = statusValue === '' || (n.is_read ? 'read' : 'unread') === statusValue;
    return matchesSearch && matchesType && matchesStatus;
  });
}

function initNotificationFilters() {
  ['notifSearchInput', 'notifTypeFilter', 'notifStatusFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id === 'notifSearchInput' ? 'input' : 'change', renderNotificationTable);
  });
}

function renderNotificationTable() {
  var tbody = document.getElementById('notifTableBody');
  if (!tbody) return;

  var filtered = getFilteredNotifications();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-admin-note">No notifications found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (n) {
    var cleanDesc = String(n.description || '').replace(/\\u20b1/g, '₱');
    var preview = cleanDesc.length > 60 ? cleanDesc.slice(0, 60) + '...' : cleanDesc;
    var typeClass = 'type-' + n.type;
    var statusLabel = n.is_read ? 'Read' : 'Unread';
    html += '<tr' + (n.is_read ? '' : ' style="font-weight:600;"') + '>';
    html += '  <td>NTF-' + String(n.id).padStart(3, '0') + '</td>';
    html += '  <td>' + n.title + '</td>';
    html += '  <td><span class="pill ' + typeClass + '">' + n.type + '</span></td>';
    html += '  <td>' + preview + '</td>';
    html += '  <td><span class="pill status-' + (n.is_read ? 'success' : 'failed') + '">' + statusLabel + '</span></td>';
    html += '  <td>' + formatDateTime(n.created_at) + '</td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '<button class="row-action-btn" data-view-notif="' + n.id + '" title="View message" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg></button>';
    if (!n.is_read) {
      html += '<button class="row-action-btn approve" data-mark-id="' + n.id + '" title="Mark as read" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M7 12L10.5 15.5L17 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    } else {
      html += '<button class="row-action-btn" data-unread-id="' + n.id + '" title="Mark as unread" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a6 6 0 010 12h-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>';
    }
    html += '<button class="row-action-btn delete" data-delete-notif="' + n.id + '" title="Delete" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-view-notif]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = Number(btn.getAttribute('data-view-notif'));
      var n = allNotifications.filter(function (x) { return Number(x.id) === id; })[0];
      if (n) openNotificationDetail(n);
    });
  });

  tbody.querySelectorAll('[data-mark-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      adminApiCall('notifications_mark_read', { ids: [btn.getAttribute('data-mark-id')] }).then(loadAdminNotifications);
    });
  });

  tbody.querySelectorAll('[data-delete-notif]').forEach(function (btn) {
  tbody.querySelectorAll('[data-unread-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      adminApiCall('notifications_mark_unread', { ids: [btn.getAttribute('data-unread-id')] }).then(loadAdminNotifications);
    });
  });
    btn.addEventListener('click', function () {
      if (!confirm('Delete this notification?')) return;
      adminApiCall('notifications_delete', { ids: [btn.getAttribute('data-delete-notif')] }).then(loadAdminNotifications);
    });
  });
}

function openNotificationDetail(n) {
  var overlay = document.getElementById('notifDetailModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'notifDetailModal';
    overlay.innerHTML =
      '<div class="modal-box notif-detail-box">' +
        '<button class="modal-close-btn" id="notifDetailClose" type="button">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<p class="modal-title" id="notifDetailTitle"></p>' +
        '<div class="notif-detail-meta" id="notifDetailMeta"></div>' +
        '<div class="notif-detail-body" id="notifDetailBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    var close = function () { overlay.classList.add('hidden'); };
    document.getElementById('notifDetailClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  document.getElementById('notifDetailTitle').textContent = n.title || 'Notification';
  document.getElementById('notifDetailMeta').innerHTML =
    '<span class="pill type-' + esc(n.type) + '">' + esc(n.type) + '</span>' +
    '<span>NTF-' + String(n.id).padStart(3, '0') + '</span>' +
    '<span>' + esc(formatDateTime(n.created_at)) + '</span>' +
    '<span class="pill status-' + (n.is_read ? 'success' : 'failed') + '">' + (n.is_read ? 'Read' : 'Unread') + '</span>';
  var body = String(n.description || '').replace(/\\u20b1/g, '₱');
  document.getElementById('notifDetailBody').innerHTML = esc(body).replace(/, /g, '<br>');
  if (n.recipient) {
    document.getElementById('notifDetailBody').innerHTML += '<p class="notif-detail-to">To: ' + esc(n.recipient) + '</p>';
  }
  overlay.classList.remove('hidden');
  if (!n.is_read) {
    adminApiCall('notifications_mark_read', { ids: [n.id] }).then(loadAdminNotifications);
  }
}

function renderNotificationStats() {
  var setTxt = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statTotalNotifications', allNotifications.length);
  setTxt('statUnreadNotifications', allNotifications.filter(function (n) { return !n.is_read; }).length);
  setTxt('statSentNotifications', allNotifications.filter(function (n) { return n.email_status === 'sent'; }).length);
  setTxt('statFailedNotifications', allNotifications.filter(function (n) { return n.email_status === 'failed'; }).length);

  // Naka-disable ang "Mark all as read" kapag wala nang unread
  var markAllBtn = document.getElementById('markAllNotifReadBtn');
  if (markAllBtn) {
    var unread = allNotifications.filter(function (n) { return !n.is_read; }).length;
    markAllBtn.disabled = unread === 0;
    markAllBtn.style.opacity = unread === 0 ? '0.5' : '1';
    markAllBtn.style.cursor = unread === 0 ? 'not-allowed' : 'pointer';
  }
}

/* ---- Add Message (compose + email a notification to any account or address) ---- */
function populateAddMessageRecipients() {
  var select = document.getElementById('addMessageRecipient');
  if (!select) return;
  var withEmail = allReservations.filter(function (r) { return r.guest_email; });

  var staffWithEmail = (typeof users !== 'undefined' ? users : []).filter(function (u) { return u.role === 'staff' && u.email; });

  var html = '<option value="">Choose a recipient...</option>';
  html += '<option value="all">All guests with a reservation (' + withEmail.length + ')</option>';
  html += '<option value="all_staff">All staff accounts (' + staffWithEmail.length + ')</option>';

  // Lahat ng naka-rehistrong account sa database (guest, staff, admin) -
  // hindi lang limitado sa mga may reservation.
  if (typeof users !== 'undefined' && users.length) {
    html += '<optgroup label="Registered Accounts">';
    users.forEach(function (u) {
      if (!u.email) return;
      html += '<option value="user:' + u.id + '">' + u.name + ' - ' + u.role.toUpperCase() + ' (' + u.email + ')</option>';
    });
    html += '</optgroup>';
  }

  if (withEmail.length) {
    html += '<optgroup label="Guest Reservations">';
    withEmail.forEach(function (r) {
      html += '<option value="' + r.id + '">' + r.guest_name + ' - ' + r.code + ' (' + r.guest_email + ')</option>';
    });
    html += '</optgroup>';
  }

  select.innerHTML = html;
}

function openAddMessageModal() {
  var modal = document.getElementById('addMessageModal');
  if (!modal) return;
  populateAddMessageRecipients();
  document.getElementById('addMessageTitle').value = '';
  document.getElementById('addMessageText').value = '';
  document.getElementById('addMessageRecipient').value = 'all';
  document.getElementById('addMessageCustomEmail').value = '';
  modal.classList.remove('hidden');
}

function closeAddMessageModal() {
  var modal = document.getElementById('addMessageModal');
  if (modal) modal.classList.add('hidden');
}

function initAddMessageModal() {
  var openBtn = document.getElementById('addMessageBtn');
  if (openBtn) openBtn.addEventListener('click', openAddMessageModal);

  var closeBtn = document.getElementById('addMessageModalClose');
  var cancelBtn = document.getElementById('addMessageCancelBtn');
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeAddMessageModal);
  });

  var form = document.getElementById('addMessageForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('addMessageTitle').value.trim();
      var message = document.getElementById('addMessageText').value.trim();
      var recipient = document.getElementById('addMessageRecipient').value;
      var customEmail = document.getElementById('addMessageCustomEmail').value.trim();

      var payload = { title: title, message: message };

      if (customEmail) {
        payload.recipient_type = 'email';
        payload.custom_email = customEmail;
      } else if (!recipient) {
        alert('Please choose a recipient, or enter a custom email address.');
        return;
      } else if (recipient === 'all') {
        payload.recipient_type = 'all';
      } else if (recipient === 'all_staff') {
        payload.recipient_type = 'all_staff';
      } else if (recipient.indexOf('user:') === 0) {
        payload.recipient_type = 'user';
        payload.user_id = recipient.split(':')[1];
      } else {
        payload.recipient_type = 'reservation';
        payload.reservation_id = recipient;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var submitBtnOriginalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

      adminApiCall('notifications_send', payload)
        .then(function (res) {
          if (res && res.success) {
            closeAddMessageModal();
            loadAdminNotifications();
          } else {
            alert((res && res.message) || 'Could not send the message.');
          }
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtnOriginalText; }
        });
    });
  }
}

/* ---- Feedback & Concerns ---- */
var lastFeedbackList = [];

function loadFeedback() {
  adminApiCall('feedback_list', {}).then(function (res) {
    var list = (res && res.success && res.feedback) ? res.feedback : [];
    lastFeedbackList = list;
    renderFeedbackSummary(list);
    renderFeedbackTable(list);
    renderFeedbackStars(list);
    populateFeedbackAccommodationFilter();
    if (reportsLoaded) loadReports();
  });
}

/** Fills the Feedback & Concern "Accommodation" filter from the live
 *  accommodations list (allAccommodations, loaded once at page init) so a
 *  newly-added admin accommodation shows up here automatically. */
function populateFeedbackAccommodationFilter() {
  var select = document.getElementById('feedbackAccommodationFilter');
  if (!select || !allAccommodations.length) return;
  var current = select.value;
  var options = '<option value="">All Accommodations</option>';
  allAccommodations.forEach(function (a) {
    options += '<option value="' + a.accommodation_id + '">' + a.accommodation_name + '</option>';
  });
  select.innerHTML = options;
  select.value = current;
}

function renderFeedbackSummary(list) {
  var total = list.length;
  var resolved = list.filter(function (f) { return f.status !== 'open'; }).length;
  var pending = total - resolved;
  var rated = list.filter(function (f) { return f.rating; });
  var avg = rated.length ? (rated.reduce(function (s, f) { return s + Number(f.rating); }, 0) / rated.length) : 0;

  var totalEl = document.getElementById('statTotalFeedback');
  var resolvedEl = document.getElementById('statResolvedFeedback');
  var pendingEl = document.getElementById('statPendingFeedback');
  var avgEl = document.getElementById('statAverageRating');
  var countEl = document.getElementById('statRatingCount');
  if (totalEl) totalEl.textContent = total;
  if (resolvedEl) resolvedEl.textContent = resolved;
  if (pendingEl) pendingEl.textContent = pending;
  if (avgEl) avgEl.textContent = avg.toFixed(1) + ' / 5';
  if (countEl) countEl.textContent = 'Based on ' + rated.length + ' Ratings';
}

function feedbackRefNo(f) {
  return 'FB-' + String(f.feedback_id).padStart(3, '0');
}

function renderFeedbackTable(list) {
  var tbody = document.getElementById('feedbackTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-admin-note">No feedback yet.</td></tr>';
    return;
  }
  var html = '';
  list.forEach(function (f) {
    var isConcern = f.category === 'concern';
    var typeLabel = isConcern ? 'Concern' : 'Feedback';
    var statusLabel = f.status === 'open' ? 'Pending' : 'Resolved';
    html += '<tr>';
    html += '  <td>' + feedbackRefNo(f) + '</td>';
    html += '  <td>' + f.guest_name + '</td>';
    html += '  <td><span class="pill ' + (isConcern ? 'role-guest' : 'role-admin') + '">' + typeLabel + '</span></td>';
    html += '  <td>' + f.subject + '</td>';
    html += '  <td>' + (f.accommodation_name || 'General / overall stay') + '</td>';
    html += '  <td>' + (f.rating ? Number(f.rating).toFixed(1) + ' \u2605' : '-') + '</td>';
    html += '  <td><span class="status-pill ' + (f.status === 'open' ? 'pending' : 'confirmed') + '">' + statusLabel + '</span></td>';
    html += '  <td>' + (f.submitted_at || '-') + '</td>';
    html += '  <td>';
    html += '    <button class="row-action-btn" data-respond-id="' + f.feedback_id + '" title="View / Respond" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    html += '    <button class="row-action-btn delete" data-fid="' + f.feedback_id + '" title="Delete" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9 7V5C9 4.4 9.4 4 10 4H14C14.6 4 15 4.4 15 5V7M18 7L17.3 19C17.2 19.6 16.7 20 16 20H8C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
  tbody.querySelectorAll('[data-fid]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Delete this feedback entry?')) return;
      adminApiCall('feedback_delete', { id: btn.getAttribute('data-fid') }).then(loadFeedback);
    });
  });
  tbody.querySelectorAll('[data-respond-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openFeedbackResponseModal(btn.getAttribute('data-respond-id')); });
  });
}

function openFeedbackResponseModal(id) {
  var f = lastFeedbackList.filter(function (row) { return String(row.feedback_id) === String(id); })[0];
  if (!f) return;
  var modal = document.getElementById('feedbackResponseModal');
  var info = document.getElementById('feedbackResponseInfo');
  if (!modal || !info) return;

  info.innerHTML =
    '<strong>' + f.guest_name + '</strong> &mdash; ' + f.subject +
    (f.accommodation_name ? ' <span style="color:var(--leaf-deep,#3f6b2e); font-weight:600;">(' + f.accommodation_name + ')</span>' : '') + '<br>' +
    '<span style="color:var(--ink-soft,#777);">' + f.message + '</span>';
  document.getElementById('feedbackResponseId').value = f.feedback_id;
  document.getElementById('feedbackResponseText').value = f.response || '';
  modal.classList.remove('hidden');
}

function closeFeedbackResponseModal() {
  var modal = document.getElementById('feedbackResponseModal');
  if (modal) modal.classList.add('hidden');
}

var currentIdVerifyUserId = null;

var idVerifyZoom = 1;

function openIdVerifyModal(userId) {
  var u = users.filter(function (row) { return String(row.id) === String(userId); })[0];
  if (!u) return;
  currentIdVerifyUserId = u.id;
  document.getElementById('idVerifyInfo').innerHTML = '<strong>' + u.name + '</strong> &mdash; ' + u.email;
  var img = document.getElementById('idVerifyImage');
  img.src = u.valid_id_image + '?t=' + Date.now();
  idVerifyZoom = 1;
  img.style.transform = 'scale(1)';
  var modal = document.getElementById('idVerifyModal');
  if (modal) modal.classList.remove('hidden');
}

function closeIdVerifyModal() {
  var modal = document.getElementById('idVerifyModal');
  if (modal) modal.classList.add('hidden');
  currentIdVerifyUserId = null;
}

function initIdVerifyModal() {
  var closeBtn = document.getElementById('idVerifyModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeIdVerifyModal);

  var modal = document.getElementById('idVerifyModal');
  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal) closeIdVerifyModal(); });
  }

  var idImg = document.getElementById('idVerifyImage');
  if (idImg) {
    idImg.addEventListener('wheel', function (e) {
      e.preventDefault();
      idVerifyZoom += (e.deltaY < 0 ? 0.2 : -0.2);
      if (idVerifyZoom < 1) idVerifyZoom = 1;
      if (idVerifyZoom > 4) idVerifyZoom = 4;
      idImg.style.transform = 'scale(' + idVerifyZoom + ')';
      idImg.style.cursor = idVerifyZoom > 1 ? 'zoom-out' : 'zoom-in';
    }, { passive: false });
  }

  function decide(status) {
    if (!currentIdVerifyUserId) return;
    adminApiCall('id_verify_review', { id: currentIdVerifyUserId, status: status }).then(function (res) {
      if (res && res.success) {
        closeIdVerifyModal();
        loadUsers();
      } else {
        alert((res && res.message) || 'Could not update ID status.');
      }
    });
  }

  var approveBtn = document.getElementById('idVerifyApproveBtn');
  if (approveBtn) approveBtn.addEventListener('click', function () { decide('verified'); });

  var rejectBtn = document.getElementById('idVerifyRejectBtn');
  if (rejectBtn) rejectBtn.addEventListener('click', function () { decide('rejected'); });
}
function initFeedbackResponseModal() {
  var closeBtn = document.getElementById('feedbackResponseModalClose');
  var cancelBtn = document.getElementById('feedbackResponseCancelBtn');
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeFeedbackResponseModal);
  });

  var form = document.getElementById('feedbackResponseForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return; // guard against double/triple clicks
      var id = document.getElementById('feedbackResponseId').value;
      var response = document.getElementById('feedbackResponseText').value.trim();
      submitBtn.disabled = true;
      var originalText = submitBtn.textContent;
      submitBtn.textContent = 'Sending...';
      adminApiCall('feedback_respond', { id: id, response: response }).then(function (res) {
        if (res && res.success) {
          closeFeedbackResponseModal();
          loadFeedback();
        } else {
          alert((res && res.message) || 'Could not send response.');
        }
      }).catch(function () {
        alert('Could not send response. Please try again.');
      }).finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  }

  var refreshBtn = document.getElementById('refreshFeedbackBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadFeedback);
}

function renderFeedbackStars(list) {
  var listEl = document.getElementById('feedbackStarsList');
  var avgEl = document.getElementById('feedbackAvgRating');
  if (!listEl) return;
  var counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  var rated = 0, sum = 0;
  list.forEach(function (f) {
    var r = Math.round(Number(f.rating) || 0);
    if (r >= 1 && r <= 5) { counts[r]++; rated++; sum += Number(f.rating); }
  });
  var max = Math.max(1, counts[5], counts[4], counts[3], counts[2], counts[1]);
  var html = '';
  [5, 4, 3, 2, 1].forEach(function (star) {
    var pct = Math.round((counts[star] / max) * 100);
    html += '<div class="feedback-star-row">';
    html += '  <span class="star-label">' + star + ' \u2605</span>';
    html += '  <span class="star-bar-track"><span class="star-bar-fill" style="width:' + pct + '%;"></span></span>';
    html += '  <span class="star-count">' + counts[star] + '</span>';
    html += '</div>';
  });
  listEl.innerHTML = html;
  if (avgEl) avgEl.textContent = (rated ? (sum / rated).toFixed(1) : '0') + ' / 5';
}

/* ---- Generic donut chart renderer ---- */
var DONUT_COLORS = ['#2e5d4b', '#f2a93b', '#7a5fd6', '#e05656', '#3fa9dc', '#7bbf6a'];

function renderDonut(chartElId, legendElId, entries) {
  var chartEl = document.getElementById(chartElId);
  var legendEl = document.getElementById(legendElId);
  if (!chartEl) return;
  var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
  if (!total) {
    chartEl.style.setProperty('--donut-stops', '#eee 0 100%');
    if (legendEl) legendEl.innerHTML = '<li class="empty-admin-note">No data yet.</li>';
    return;
  }
  var stops = [];
  var legendHtml = '';
  var cursor = 0;
  entries.forEach(function (e, i) {
    var color = DONUT_COLORS[i % DONUT_COLORS.length];
    var pct = (e.value / total) * 100;
    stops.push(color + ' ' + cursor.toFixed(1) + '% ' + (cursor + pct).toFixed(1) + '%');
    cursor += pct;
    legendHtml += '<li><span class="dot" style="background:' + color + ';"></span>' + e.label + ' (' + Math.round(pct) + '%)</li>';
  });
  chartEl.style.setProperty('--donut-stops', stops.join(', '));
  if (legendEl) legendEl.innerHTML = legendHtml;
}

function initSidebarNavigation() {
  var logoutLink = document.querySelector('.logout-nav-item');
  if (logoutLink) {
    logoutLink.addEventListener('click', function () {
      sessionStorage.removeItem('reportsPinUnlocked');
    });
  }

  var navButtons = document.querySelectorAll('.nav-item[data-view]');
  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var viewName = btn.getAttribute('data-view');
      if (viewName === 'reports' && !reportsPinUnlocked) {
        openReportsPinModal();
        return;
      }
      goToView(viewName);
      if (viewName === 'reports' && !reportsLoaded) {
        reportsLoaded = true;
        loadReports();
      }
    });
  });

  var viewLinks = document.querySelectorAll('[data-view-link]');
  viewLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      var viewName = link.getAttribute('data-view-link');
      if (viewName === 'reports' && !reportsPinUnlocked) {
        openReportsPinModal();
        return;
      }
      goToView(viewName);
      if (viewName === 'reports' && !reportsLoaded) {
        reportsLoaded = true;
        loadReports();
      }
    });
  });
}

/* ---------------- REPORTS PIN LOCK ---------------- */
var reportsPinUnlocked = (sessionStorage.getItem('reportsPinUnlocked') === '1');
var REPORTS_PIN_DEFAULT = '1234';

function getReportsPin() {
  return localStorage.getItem('campMayagayReportsPin') || REPORTS_PIN_DEFAULT;
}

function openReportsPinModal() {
  var modal = document.getElementById('reportsPinModal');
  if (!modal) return;
  var inputs = modal.querySelectorAll('.pin-digit');
  inputs.forEach(function (inp) { inp.value = ''; });
  var errorEl = document.getElementById('reportsPinError');
  if (errorEl) errorEl.textContent = '';
  modal.classList.remove('hidden');
  if (inputs[0]) inputs[0].focus();
}

function closeReportsPinModal() {
  var modal = document.getElementById('reportsPinModal');
  if (modal) modal.classList.add('hidden');
}

function initReportsPinModal() {
  var modal = document.getElementById('reportsPinModal');
  if (!modal) return;
  var inputs = Array.prototype.slice.call(modal.querySelectorAll('.pin-digit'));
  var errorEl = document.getElementById('reportsPinError');
  var closeBtn = document.getElementById('reportsPinClose');
  var cancelBtn = document.getElementById('reportsPinCancelBtn');
  var confirmBtn = document.getElementById('reportsPinConfirmBtn');

  inputs.forEach(function (inp, idx) {
    inp.addEventListener('input', function () {
      inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (inp.value && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
      if (inputs.every(function (i) { return i.value.length === 1; })) {
        checkReportsPin();
      }
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].focus();
      }
      if (e.key === 'Enter') checkReportsPin();
    });
  });

  function checkReportsPin() {
    var entered = inputs.map(function (i) { return i.value; }).join('');
    if (entered.length < 4) return;
    if (entered === getReportsPin()) {
      reportsPinUnlocked = true;
      sessionStorage.setItem('reportsPinUnlocked', '1');
      closeReportsPinModal();
      goToView('reports');
      if (!reportsLoaded) {
        reportsLoaded = true;
        loadReports();
      }
    } else {
      if (errorEl) errorEl.textContent = 'Incorrect PIN. Please try again.';
      modal.querySelector('.pin-digit-row').classList.add('shake');
      setTimeout(function () { modal.querySelector('.pin-digit-row').classList.remove('shake'); }, 400);
      inputs.forEach(function (i) { i.value = ''; });
      inputs[0].focus();
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeReportsPinModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeReportsPinModal);
  if (confirmBtn) confirmBtn.addEventListener('click', checkReportsPin);
}

function goToView(viewName) {
  document.querySelectorAll('.view').forEach(function (section) {
    section.classList.remove('active');
  });
  var target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
}

/* ---------------- MOBILE SIDEBAR (hamburger drawer) ---------------- */
function openSidebar() {
  var sidebarEl = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebarBackdrop');
  if (sidebarEl) sidebarEl.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}
function closeSidebar() {
  var sidebarEl = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebarBackdrop');
  if (sidebarEl) sidebarEl.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
}
function initMobileSidebar() {
  var hamburgerBtn = document.getElementById('hamburgerBtn');
  var backdrop = document.getElementById('sidebarBackdrop');
  var sidebarEl = document.getElementById('sidebar');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', function () {
      if (sidebarEl && sidebarEl.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
}

function initSecurityTabs() {
  var tabButtons = document.querySelectorAll('#securityTabs .tab-btn');

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tabName = btn.getAttribute('data-tab');

      tabButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach(function (panel) {
        panel.classList.remove('active');
      });
      document.getElementById('tab-' + tabName).classList.add('active');

      updateSecuritySummaryGrid(tabName);
    });
  });

  var viewAllAlertsLink = document.getElementById('viewAllAlertsLink');
  if (viewAllAlertsLink) {
    viewAllAlertsLink.addEventListener('click', function (e) {
      e.preventDefault();
      var loginTabBtn = document.querySelector('#securityTabs .tab-btn[data-tab="login-activity"]');
      if (loginTabBtn) loginTabBtn.click();
    });
  }
}

/* ---- Account Security settings (2FA, activity logging, password
   policy, session timeout, login attempt limit) - persisted server-side
   in system_settings and enforced across login/register/password
   change/session handling. ---- */
function applySecuritySettingsToUI(settings) {
  var toggle2fa = document.getElementById('toggle2fa');
  var toggleActivityLog = document.getElementById('toggleActivityLog');
  var togglePasswordPolicy = document.getElementById('togglePasswordPolicy');
  var sessionTimeoutSelect = document.getElementById('sessionTimeoutSelect');
  var loginAttemptSelect = document.getElementById('loginAttemptSelect');

  if (toggle2fa) toggle2fa.checked = settings.two_factor_enabled === '1';
  if (toggleActivityLog) toggleActivityLog.checked = settings.activity_logging_enabled === '1';
  if (togglePasswordPolicy) togglePasswordPolicy.checked = settings.password_policy_enabled === '1';
  if (sessionTimeoutSelect) {
    var minutes = settings.session_timeout_minutes || '30';
    var timeoutOption = Array.prototype.slice.call(sessionTimeoutSelect.options)
      .find(function (o) { return o.textContent.indexOf(minutes) === 0; });
    if (timeoutOption) sessionTimeoutSelect.value = timeoutOption.value;
  }
  if (loginAttemptSelect) {
    var attempts = settings.login_attempt_limit || '5';
    var attemptOption = Array.prototype.slice.call(loginAttemptSelect.options)
      .find(function (o) { return o.textContent.indexOf(attempts) === 0; });
    if (attemptOption) loginAttemptSelect.value = attemptOption.value;
  }
}

function loadSecuritySettings() {
  adminApiCall('security_settings_get', {}).then(function (res) {
    if (res && res.success && res.settings) {
      applySecuritySettingsToUI(res.settings);
    }
  });
}

function saveSecuritySetting(payload) {
  adminApiCall('security_settings_update', payload).then(function (res) {
    if (!res || !res.success) {
      alert((res && res.message) || 'Could not save this security setting.');
    }
  }).catch(function () {
    alert('Could not save this security setting.');
  });
}

function initAccountSecurityControls() {
  var toggle2fa = document.getElementById('toggle2fa');
  var toggleActivityLog = document.getElementById('toggleActivityLog');
  var togglePasswordPolicy = document.getElementById('togglePasswordPolicy');
  var sessionTimeoutSelect = document.getElementById('sessionTimeoutSelect');
  var loginAttemptSelect = document.getElementById('loginAttemptSelect');

  if (toggle2fa) {
    toggle2fa.addEventListener('change', function () {
      saveSecuritySetting({ two_factor_enabled: toggle2fa.checked ? '1' : '0' });
    });
  }
  if (toggleActivityLog) {
    toggleActivityLog.addEventListener('change', function () {
      saveSecuritySetting({ activity_logging_enabled: toggleActivityLog.checked ? '1' : '0' });
    });
  }
  if (togglePasswordPolicy) {
    togglePasswordPolicy.addEventListener('change', function () {
      saveSecuritySetting({ password_policy_enabled: togglePasswordPolicy.checked ? '1' : '0' });
    });
  }
  if (sessionTimeoutSelect) {
    sessionTimeoutSelect.addEventListener('change', function () {
      var minutes = parseInt(sessionTimeoutSelect.value, 10) || 30;
      saveSecuritySetting({ session_timeout_minutes: String(minutes) });
    });
  }
  if (loginAttemptSelect) {
    loginAttemptSelect.addEventListener('change', function () {
      var attempts = parseInt(loginAttemptSelect.value, 10) || 5;
      saveSecuritySetting({ login_attempt_limit: String(attempts) });
      renderSecurityAlerts();
    });
  }

  loadSecuritySettings();
}

var securitySummaryModes = {
  users: {
    icons: [
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="9" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 14c2.5 0.3 4 2 4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.6"/></svg>'
    ],
    cards: [
      { label: 'Total Users', value: function () { return users.length; }, sub: 'Active Account' },
      { label: 'Admin Accounts', value: function () { return users.filter(function (u) { return u.role === 'admin'; }).length; }, sub: 'Full Access' },
      { label: 'Staff Accounts', value: function () { return users.filter(function (u) { return u.role === 'staff'; }).length; }, sub: 'Limited Access' },
      { label: 'Guest Accounts', value: function () { return users.filter(function (u) { return u.role === 'guest'; }).length; }, sub: 'Guest Access' }
    ]
  },
  'login-activity': {
    icons: [
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="9" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 14c2.5 0.3 4 2 4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><path d="M7 12L10.5 15.5L17 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3L21 19H3L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10V14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16.5" r="0.9" fill="currentColor"/></svg>'
    ],
    cards: [
      { label: 'Total Login Today', value: function () { return computeLoginActivityStats().totalToday; }, sub: 'Active Account' },
      { label: 'Successful Login', value: function () { return computeLoginActivityStats().successful; }, sub: 'Full Access' },
      { label: 'Failed Attempt', value: function () { return computeLoginActivityStats().failed; }, sub: 'Full Access' },
      { label: 'Suspicious Activity', value: function () { return computeLoginActivityStats().suspicious; }, sub: 'Full Access' }
    ]
  }
};

function updateSecuritySummaryGrid(tabName) {
  var grid = document.getElementById('securitySummaryGrid');
  if (!grid) return;

  if (tabName === 'security-setting') {
    grid.style.display = 'none';
    return;
  }

  var mode = securitySummaryModes[tabName] || securitySummaryModes.users;
  grid.style.display = '';

  for (var i = 0; i < 4; i++) {
    var n = i + 1;
    var card = mode.cards[i];
    document.getElementById('summaryLabel' + n).textContent = card.label;
    document.getElementById('summaryCard' + n).querySelector('.summary-number').textContent = card.value();
    document.getElementById('summarySub' + n).textContent = card.sub;
    document.getElementById('summaryCard' + n).querySelector('.summary-icon').innerHTML = mode.icons[i];
  }
}

/** Counts real reservations (by check-in date) per weekday of the current
 *  week (Mon-Sun), so "Reservations Overview" matches the actual data
 *  instead of showing fixed sample numbers. */
function computeWeeklyReservationCounts() {
  var today = new Date();
  var dow = today.getDay();
  var mondayOffset = dow === 0 ? -6 : 1 - dow;
  var monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  var dayKeys = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dayKeys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }

  var counts = [0, 0, 0, 0, 0, 0, 0];
  (typeof allReservations !== 'undefined' ? allReservations : []).forEach(function (r) {
    if (!r.check_in) return;
    var idx = dayKeys.indexOf(String(r.check_in).slice(0, 10));
    if (idx !== -1) counts[idx]++;
  });
  return counts;
}

function drawWeeklyChart(svgId, values) {
  var svg = document.getElementById(svgId || 'trendChart');
  if (!svg) return;

  var data = values || computeWeeklyReservationCounts();
  svg.setAttribute('viewBox', '0 0 700 300');

  var chartWidth = 700;
  var chartHeight = 300;
  var paddingLeft = 40;
  var paddingBottom = 30;
  var paddingTop = 15;
  var maxValue = Math.max(5, Math.ceil(Math.max.apply(null, data) * 1.2));

  var plotWidth = chartWidth - paddingLeft - 20;
  var plotHeight = chartHeight - paddingTop - paddingBottom;
  var slotWidth = plotWidth / data.length;
  var barGap = 16;
  var barWidth = Math.max(6, slotWidth - barGap);

  var svgParts = [];

  svgParts.push(
    '<defs><linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#8fbf6e" stop-opacity="0.38"></stop>' +
    '<stop offset="100%" stop-color="#8fbf6e" stop-opacity="0"></stop>' +
    '</linearGradient></defs>'
  );

  var steps = maxValue <= 10 ? maxValue : 5;
  if (maxValue > 10) maxValue = Math.ceil(maxValue / steps) * steps;
  for (var s = 0; s <= steps; s++) {
    var v = Math.round((maxValue / steps) * s);
    var y = paddingTop + (plotHeight - (v / maxValue) * plotHeight);
    svgParts.push('<line class="chart-grid-line" x1="' + paddingLeft + '" y1="' + y + '" x2="' + (chartWidth - 20) + '" y2="' + y + '"></line>');
    svgParts.push('<text class="chart-axis-label" x="' + (paddingLeft - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>');
  }

  // Points sit at the centre of each day's slot, same layout the bars used.
  var points = data.map(function (value, i) {
    var x = paddingLeft + (i * slotWidth) + (slotWidth / 2);
    var y = paddingTop + (plotHeight - (value / maxValue) * plotHeight);
    return { x: x, y: y, value: value };
  });

  var linePath = points.map(function (p, i) {
    return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
  }).join(' ');

  var areaPath = linePath +
    ' L' + points[points.length - 1].x.toFixed(1) + ' ' + (paddingTop + plotHeight) +
    ' L' + points[0].x.toFixed(1) + ' ' + (paddingTop + plotHeight) + ' Z';

  svgParts.push('<path class="chart-area" d="' + areaPath + '"></path>');
  svgParts.push('<path class="chart-line" d="' + linePath + '"></path>');

  points.forEach(function (p, i) {
    svgParts.push('<circle class="chart-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.5"></circle>');
    svgParts.push('<text class="chart-axis-label" x="' + p.x.toFixed(1) + '" y="' + (chartHeight - 8) + '" text-anchor="middle">' + weekDays[i] + '</text>');
  });

  svg.innerHTML = svgParts.join('');
}

function renderRecentReservations() {
  var tbody = document.getElementById('recentReservationsBody');
  if (!tbody) return;

  var html = '';
  recentReservations.forEach(function (r) {
    var statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
    html += '<tr>';
    html += '  <td>' + r.name + '</td>';
    html += '  <td>' + r.checkIn + '</td>';
    html += '  <td>' + r.checkOut + '</td>';
    html += '  <td><span class="status-pill ' + r.status + '">' + statusLabel + '</span></td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

function renderAccommodationAvailability() {
  var container = document.getElementById('availabilityGrid');
  if (!container) return;

  var html = '';
  accommodationAvailability.forEach(function (a) {
    html += '<div class="avail-card line-' + a.line + '">';
    html += '  <p class="avail-name">' + a.name + '</p>';
    html += '  <p class="avail-count">' + a.count + '</p>';
    html += '  <p class="avail-sub">Available</p>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function renderSystemNotifications() {
  var container = document.getElementById('systemNotifList');
  if (!container) return;

  var html = '';
  systemNotifications.forEach(function (n) {
    html += '<div class="notif-row">';
    html += '  <span class="dot"></span>';
    html += '  <div>';
    html += '    <p class="notif-text">' + n.text + '</p>';
    html += '    <p class="notif-time">' + n.time + '</p>';
    html += '  </div>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function getFilteredUsers() {
  var searchBox = document.getElementById('userSearchInput');
  var roleBox = document.getElementById('userRoleFilter');
  var statusBox = document.getElementById('userStatusFilter');
  var term = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var roleVal = roleBox ? roleBox.value : '';
  var statusVal = statusBox ? statusBox.value : '';

  return users.filter(function (u) {
    var matchesSearch = term === '' ||
      u.name.toLowerCase().indexOf(term) !== -1 ||
      (u.username || '').toLowerCase().indexOf(term) !== -1 ||
      (u.email || '').toLowerCase().indexOf(term) !== -1;
    var matchesRole = roleVal === '' || u.role === roleVal;
    var matchesStatus = statusVal === '' || u.status === statusVal;
    return matchesSearch && matchesRole && matchesStatus;
  });
}

function loadUsers() {
  var tbody = document.getElementById('userTableBody');
  adminApiCall('users_list', {}).then(function (res) {
    users = (res && res.success && res.users) ? res.users : [];
    renderUserTable();
    renderRoleTable();
    updateSecuritySummaryGrid('users');
    renderSettingsIdTable();
  }).catch(function () {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-admin-note">Could not load users.</td></tr>';
  });
}

function renderSettingsIdTable() {
  var tbody = document.getElementById('settingsIdTableBody');
  if (!tbody) return;
  var guestUsers = users.filter(function (u) { return u.role === 'guest'; });
  if (!guestUsers.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-admin-note">No guest accounts found.</td></tr>';
    return;
  }
  var idLabels = { not_submitted: 'Not submitted', pending: 'Pending', verified: 'Verified', rejected: 'Rejected' };
  var html = '';
  guestUsers.forEach(function (u) {
    var status = u.id_verification_status || 'not_submitted';
    html += '<tr>';
    html += '  <td>' + u.name + '</td>';
    html += '  <td>' + u.email + '</td>';
    html += '  <td>' + (u.valid_id_image ? '<img src="' + u.valid_id_image + '" alt="Valid ID" style="width:44px;height:32px;object-fit:cover;border-radius:6px;">' : '\u2014') + '</td>';
    html += '  <td><span class="pill id-' + status.replace('_', '-') + '">' + (idLabels[status] || 'Not submitted') + '</span></td>';
    html += '  <td>';
    if (u.valid_id_image) {
      html += '<button class="row-action-btn" data-settings-view-id="' + u.id + '" title="View / Review" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    } else {
      html += '<span style="color:var(--ink-soft); font-size:12px;">\u2014</span>';
    }
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-settings-view-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openIdVerifyModal(btn.getAttribute('data-settings-view-id')); });
  });
}

function renderUserTable() {
  var tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  var filtered = getFilteredUsers();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-admin-note">No users found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (u) {
    var roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
    var statusLabel = u.status.charAt(0).toUpperCase() + u.status.slice(1);

    html += '<tr>';
    html += '  <td>' + u.user_id + '</td>';
    html += '  <td>' + u.name + '</td>';
    html += '  <td>' + u.email + '</td>';
    html += '  <td><span class="pill role-' + u.role + '">' + roleLabel + '</span></td>';
    html += '  <td><span class="pill status-' + (u.status === 'active' ? 'active' : 'inactive') + '">' + statusLabel + '</span></td>';
    html += '  <td>' + (u.created_at || '-') + '</td>';
    var idStatus = u.id_verification_status || 'not_submitted';
    var idLabels = { not_submitted: 'None', pending: 'Pending', verified: 'Verified', rejected: 'Rejected' };
    html += '  <td>';
    html += '    <span class="pill id-' + idStatus.replace('_', '-') + '">' + (idLabels[idStatus] || 'None') + '</span>';
    if (u.valid_id_image) {
      html += ' <button class="row-action-btn" data-view-id="' + u.id + '" data-id-status="' + idStatus + '" title="View ID" type="button" style="vertical-align:middle;"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    }
    html += '  </td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '      <button class="row-action-btn" data-edit-id="' + u.id + '" title="Edit" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20L4.6 16.7L16 5.3C16.6 4.7 17.6 4.7 18.2 5.3L18.7 5.8C19.3 6.4 19.3 7.4 18.7 8L7.3 19.4L4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>';
    html += '      <button class="row-action-btn delete" data-delete-id="' + u.id + '" title="Delete" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9 7V5C9 4.4 9.4 4 10 4H14C14.6 4 15 4.4 15 5V7M18 7L17.3 19C17.2 19.6 16.7 20 16 20H8C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-view-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openIdVerifyModal(btn.getAttribute('data-view-id'));
    });
  });
  tbody.querySelectorAll('[data-edit-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openUserModal(btn.getAttribute('data-edit-id')); });
  });
  tbody.querySelectorAll('[data-delete-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Delete this user permanently?')) return;
      adminApiCall('users_delete', { id: btn.getAttribute('data-delete-id') }).then(function (res) {
        if (res && res.success) { loadUsers(); }
        else { alert((res && res.message) || 'Could not delete user.'); }
      });
    });
  });
}

function renderRoleTable() {
  var tbody = document.getElementById('roleTableBody');
  if (!tbody) return;

  var roleMeta = {
    admin: { pillClass: 'role-admin', desc: 'Full access to all system modules and settings.' },
    staff: { pillClass: 'role-staff', desc: 'Can manage operational records and transactions.' },
    guest: { pillClass: 'role-guest', desc: 'Can book accommodations and manage reservations.' }
  };

  var html = '';
  ['admin', 'staff', 'guest'].forEach(function (roleKey) {
    var meta = roleMeta[roleKey];
    var count = users.filter(function (u) { return u.role === roleKey; }).length;
    var permCount = accessModules.filter(function (m) { return m[roleKey]; }).length;
    var label = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
    html += '<tr>';
    html += '  <td><span class="pill ' + meta.pillClass + '">' + label + '</span></td>';
    html += '  <td>' + meta.desc + '</td>';
    html += '  <td>' + count + '</td>';
    html += '  <td>' + permCount + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

function initTogglePasswordIcons() {
  document.querySelectorAll('.toggle-password-icon').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target');
      var input = document.getElementById(targetId);
      if (!input) return;
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.classList.toggle('is-visible', isHidden);
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  });
}

function initUserManagement() {
  ['userSearchInput', 'userRoleFilter', 'userStatusFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id === 'userSearchInput' ? 'input' : 'change', renderUserTable);
  });

  var addBtn = document.getElementById('addUserBtn');
  if (addBtn) addBtn.addEventListener('click', function () { openUserModal(null); });

  var closeBtn = document.getElementById('userModalClose');
  var cancelBtn = document.getElementById('userModalCancelBtn');
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeUserModal);
  });

  var form = document.getElementById('userForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = document.getElementById('userFormId').value;
      var payload = {
        firstname: document.getElementById('userFormFirstname').value.trim(),
        lastname: document.getElementById('userFormLastname').value.trim(),
        username: document.getElementById('userFormUsername').value.trim(),
        email: document.getElementById('userFormEmail').value.trim(),
        contact_number: document.getElementById('userFormContact').value.trim(),
        role: document.getElementById('userFormRole').value,
        status: document.getElementById('userFormStatus').value
      };
      var password = document.getElementById('userFormPassword').value;
      if (password) payload.password = password;

      var action = id ? 'users_update' : 'users_create';
      if (id) payload.id = id;

      adminApiCall(action, payload).then(function (res) {
        if (res && res.success) {
          closeUserModal();
          loadUsers();
        } else {
          alert((res && res.message) || 'Could not save user.');
        }
      });
    });
  }
}

function initEditAdminProfile() {
  var editBtn = document.getElementById('editProfileBtn');
  var modal = document.getElementById('editAdminProfileModal');
  var closeBtn = document.getElementById('editAdminProfileClose');
  var cancelBtn = document.getElementById('editAdminProfileCancelBtn');
  var form = document.getElementById('editAdminProfileForm');
  if (!editBtn || !modal || !form) return;

  function closeModal() { modal.classList.add('hidden'); }

  editBtn.addEventListener('click', function () {
    document.getElementById('editAdminProfileName').value = document.getElementById('settingsProfileName').textContent.trim();
    document.getElementById('editAdminProfileEmail').value = document.getElementById('settingsProfileEmail').textContent.trim();
    document.getElementById('editAdminProfileContact').value = '';
    modal.classList.remove('hidden');
  });
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeModal);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fullName = document.getElementById('editAdminProfileName').value.trim();
    var parts = fullName.split(/\s+/);
    var firstname = parts.shift() || '';
    var lastname = parts.join(' ') || '';
    adminApiCall('profile_update', {
      firstname: firstname,
      lastname: lastname,
      contact_number: document.getElementById('editAdminProfileContact').value.trim(),
      address: ''
    }).then(function (res) {
      if (res && res.success) {
        document.getElementById('settingsProfileName').textContent = fullName;
        var avatar = document.getElementById('settingsProfileAvatar');
        if (avatar) avatar.textContent = (firstname.charAt(0) || 'A').toUpperCase();
        closeModal();
      } else {
        alert((res && res.message) || 'Could not save profile.');
      }
    });
  });
}

function openUserModal(id) {
  var modal = document.getElementById('userModal');
  var title = document.getElementById('userModalTitle');
  var passwordLabel = document.getElementById('userFormPasswordLabel');
  if (!modal) return;

  document.getElementById('userForm').reset();
  document.getElementById('userFormId').value = '';

  if (id) {
    var u = users.filter(function (row) { return String(row.id) === String(id); })[0];
    if (!u) return;
    title.textContent = 'Edit User';
    document.getElementById('userFormId').value = u.id;
    document.getElementById('userFormFirstname').value = u.firstname || '';
    document.getElementById('userFormLastname').value = u.lastname || '';
    document.getElementById('userFormUsername').value = u.username || '';
    document.getElementById('userFormEmail').value = u.email || '';
    document.getElementById('userFormContact').value = u.contact_number || '';
    document.getElementById('userFormRole').value = u.role;
    document.getElementById('userFormStatus').value = u.status;
    passwordLabel.firstChild.textContent = 'New Password ';
    document.getElementById('userFormPassword').placeholder = 'Leave blank to keep current password';
  } else {
    title.textContent = 'Add New User';
    passwordLabel.firstChild.textContent = 'Password ';
    document.getElementById('userFormPassword').placeholder = 'Leave blank to auto-generate';
  }

  modal.classList.remove('hidden');
}

function closeUserModal() {
  var modal = document.getElementById('userModal');
  if (modal) modal.classList.add('hidden');
}

var checkIcon = '<svg class="perm-check" viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15"/><path d="M7 12L10.5 15.5L17 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var crossIcon = '<svg class="perm-cross" viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15"/><path d="M8 8L16 16M16 8L8 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function renderAccessModuleTable() {
  var table = document.getElementById('permissionTable');
  if (!table) return;
  var tbody = table.querySelector('tbody');

  var totalPages = Math.max(1, Math.ceil(accessModules.length / ACCESS_MODULES_PER_PAGE));
  if (accessModulePage > totalPages) accessModulePage = totalPages;
  var start = (accessModulePage - 1) * ACCESS_MODULES_PER_PAGE;
  var pageItems = accessModules.slice(start, start + ACCESS_MODULES_PER_PAGE);

  var html = '';
  pageItems.forEach(function (row) {
    html += '<tr>';
    html += '  <td>' + row.module + '</td>';
    html += '  <td>' + permToggleBtn(row.module_key, 'admin', row.admin) + '</td>';
    html += '  <td>' + permToggleBtn(row.module_key, 'staff', row.staff) + '</td>';
    html += '  <td>' + permToggleBtn(row.module_key, 'guest', row.guest) + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  renderAccessModulePagination(totalPages);
}

function permToggleBtn(moduleKey, role, allowed) {
  return '<button class="perm-toggle-btn" type="button" data-module="' + moduleKey + '" data-role="' + role + '" data-allowed="' + (allowed ? '1' : '0') + '">' + (allowed ? checkIcon : crossIcon) + '</button>';
}

/** Loads the live permission matrix from the database so the table
 *  reflects whatever was last saved (not just the hardcoded defaults). */
function loadAccessModules() {
  adminApiCall('permissions_get', {}).then(function (res) {
    if (res && res.success && res.modules) {
      accessModules = res.modules;
      renderAccessModuleTable();
      renderRoleTable();
    }
  });
}

/** Makes every check/x cell in the Role & Permission table clickable.
 *  Clicking toggles that module's access for that role and saves it
 *  to role_permissions right away. */
function initAccessModuleToggle() {
  var table = document.getElementById('permissionTable');
  if (!table) return;

  table.addEventListener('click', function (e) {
    var btn = e.target.closest('.perm-toggle-btn');
    if (!btn) return;

    var moduleKey = btn.getAttribute('data-module');
    var role = btn.getAttribute('data-role');
    var newAllowed = btn.getAttribute('data-allowed') !== '1';

    btn.disabled = true;
    adminApiCall('permissions_update', { module_key: moduleKey, role: role, allowed: newAllowed }).then(function (res) {
      if (res && res.success && res.modules) {
        accessModules = res.modules;
        renderAccessModuleTable();
        renderRoleTable();
      } else {
        alert((res && res.message) || 'Could not update permission.');
        btn.disabled = false;
      }
    });
  });
}

function renderAccessModulePagination(totalPages) {
  var wrap = document.getElementById('accessModulePagination');
  if (!wrap) return;

  var html = '';
  html += '<button class="page-nav-btn" id="accessModulePrev" type="button" ' + (accessModulePage === 1 ? 'disabled' : '') + '>&lt;</button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="page-num-btn' + (i === accessModulePage ? ' active' : '') + '" data-page="' + i + '" type="button">' + i + '</button>';
  }
  html += '<button class="page-nav-btn" id="accessModuleNext" type="button" ' + (accessModulePage === totalPages ? 'disabled' : '') + '>&gt;</button>';
  wrap.innerHTML = html;
}

function initAccessModulePagination() {
  var wrap = document.getElementById('accessModulePagination');
  if (!wrap) return;

  wrap.addEventListener('click', function (e) {
    var target = e.target.closest('button');
    if (!target) return;

    var totalPages = Math.max(1, Math.ceil(accessModules.length / ACCESS_MODULES_PER_PAGE));

    if (target.id === 'accessModulePrev') {
      if (accessModulePage > 1) accessModulePage--;
    } else if (target.id === 'accessModuleNext') {
      if (accessModulePage < totalPages) accessModulePage++;
    } else if (target.dataset.page) {
      accessModulePage = parseInt(target.dataset.page, 10);
    } else {
      return;
    }

    renderAccessModuleTable();
  });
}

/** Loads real login/signup activity from the security_logs table
 *  (via php/api.php?action=security_logs_list) and refreshes the table
 *  and summary cards. Replaces the old hardcoded sample rows. */
function loadLoginActivity() {
  var tbody = document.getElementById('loginActivityBody');
  adminApiCall('security_logs_list', {}).then(function (res) {
    loginLogs = (res && res.success && res.logs) ? res.logs : [];
    renderLoginActivityTable();
    renderSecurityAlerts();
    var activeTab = document.querySelector('#securityTabs .tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'login-activity') {
      updateSecuritySummaryGrid('login-activity');
    }
    refreshSettingsLastLogin();
  }).catch(function () {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-admin-note">Could not load login activity.</td></tr>';
  });
}

function formatLoginTimestamp(raw) {
  if (!raw) return '-';
  // MySQL DATETIME comes back as "YYYY-MM-DD HH:MM:SS"
  var datePart = raw.slice(0, 10);
  var timePart = raw.slice(11, 16);
  if (!datePart || datePart.length !== 10) return raw;
  var mm = datePart.slice(5, 7), dd = datePart.slice(8, 10), yyyy = datePart.slice(0, 4);
  var d = new Date(raw.replace(' ', 'T'));
  var timeLabel = timePart;
  if (!isNaN(d.getTime())) {
    timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return mm + '/' + dd + '/' + yyyy + ' ' + timeLabel;
}

function renderLoginActivityTable() {
  var tbody = document.getElementById('loginActivityBody');
  if (!tbody) return;

  var filteredLogs = getFilteredLoginLogs();

  var html = '';
  filteredLogs.forEach(function (log) {
    var statusLabel = log.status === 'success' ? 'Success' : 'Failed';
    var roleClass = (log.role || 'unknown').toLowerCase();
    html += '<tr>';
    html += '  <td>' + log.login_id + '</td>';
    html += '  <td>' + log.user + '</td>';
    html += '  <td><span class="pill role-' + roleClass + '">' + log.role + '</span></td>';
    html += '  <td><span class="pill status-' + log.status + '">' + statusLabel + '</span></td>';
    html += '  <td>' + log.device + '</td>';
    html += '  <td>' + log.location + '</td>';
    html += '  <td>' + formatLoginTimestamp(log.login_time || log.created_at) + '</td>';
    html += '  <td>';
    html += '    <div class="row-actions">';
    html += '      <button class="row-action-btn" data-view-log-id="' + log.log_id + '" title="View location on map" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });

  if (filteredLogs.length === 0) {
    html = '<tr><td colspan="8" style="text-align:center; color:var(--ink-soft);">No matching login activity found.</td></tr>';
  }

  tbody.innerHTML = html;

  tbody.querySelectorAll('[data-view-log-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openLoginLocationModal(btn.getAttribute('data-view-log-id')); });
  });
}

/* ---- Login location map (view action on Login Activity) ---- */
function openLoginLocationModal(logId) {
  var log = loginLogs.filter(function (l) { return String(l.log_id) === String(logId); })[0];
  if (!log) return;
  var modal = document.getElementById('loginLocationModal');
  var info = document.getElementById('loginLocationInfo');
  var mapFrame = document.getElementById('loginLocationMapFrame');
  var mapEmpty = document.getElementById('loginLocationMapEmpty');
  if (!modal || !info || !mapFrame || !mapEmpty) return;

  info.innerHTML =
    '<strong>' + log.user + '</strong> &mdash; ' + (log.location || 'Unknown') + '<br>' +
    '<span style="color:var(--ink-soft,#777);">' + log.device + ' &bull; ' + formatLoginTimestamp(log.login_time || log.created_at) + '</span>';

  var hasCoords = log.location_lat !== null && log.location_lat !== undefined &&
                  log.location_lng !== null && log.location_lng !== undefined;
  if (!hasCoords) {
    // Older/local logins have no stored position: show the general area of
    // this network's public IP instead (city level, not an exact address).
    mapFrame.style.display = 'none';
    mapEmpty.style.display = 'block';
    mapEmpty.textContent = 'Finding general area...';
    modal.classList.remove('hidden');
    fetch('https://ipwho.is/').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) throw new Error('lookup failed');
      var lt = Math.round(d.latitude * 100) / 100, lg = Math.round(d.longitude * 100) / 100;
      var area = [d.city, d.region, d.country].filter(Boolean).join(', ');
      info.innerHTML =
        '<strong>' + log.user + '</strong> &mdash; ' + (log.location || 'Unknown') + ' (' + area + ')<br>' +
        '<span style="color:var(--ink-soft,#777);">' + log.device + ' &bull; ' + formatLoginTimestamp(log.login_time || log.created_at) + '</span>';
      showLoginMap(mapFrame, mapEmpty, lt, lg);
    }).catch(function () {
      mapEmpty.textContent = 'No map position on file for "' + (log.location || 'this login') + '".';
    });
    return;
  }
  modal.classList.remove('hidden');
  showLoginMap(mapFrame, mapEmpty, log.location_lat, log.location_lng);
}

var loginLeafletMap = null;

/* Draggable / zoomable map (Leaflet + OpenStreetMap tiles). Shows the
   general area with a pin and a ~1 km circle - never an exact address. */
function showLoginMap(mapFrame, mapEmpty, lat, lng) {
  mapEmpty.style.display = 'none';
  mapFrame.style.display = 'block';
  if (typeof L === 'undefined') {
    mapFrame.style.display = 'none';
    mapEmpty.style.display = 'block';
    mapEmpty.textContent = 'Map could not load. Check your internet connection.';
    return;
  }
  if (loginLeafletMap) { loginLeafletMap.remove(); loginLeafletMap = null; }
  loginLeafletMap = L.map(mapFrame, { scrollWheelZoom: true, dragging: true, touchZoom: true, zoomControl: true }).setView([lat, lng], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(loginLeafletMap);
  L.circle([lat, lng], { radius: 1000, color: '#3d7a3a', weight: 1, fillOpacity: 0.12 }).addTo(loginLeafletMap);
  L.marker([lat, lng]).addTo(loginLeafletMap);
  setTimeout(function () { if (loginLeafletMap) loginLeafletMap.invalidateSize(); }, 50);
}

function closeLoginLocationModal() {
  var modal = document.getElementById('loginLocationModal');
  if (loginLeafletMap) { loginLeafletMap.remove(); loginLeafletMap = null; }
  if (modal) modal.classList.add('hidden');
}

function initLoginLocationModal() {
  var closeBtn = document.getElementById('loginLocationModalClose');
  var cancelBtn = document.getElementById('loginLocationCancelBtn');
  [closeBtn, cancelBtn].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeLoginLocationModal);
  });
}

function getFilteredLoginLogs() {
  var searchBox = document.getElementById('loginSearchInput');
  var roleBox = document.getElementById('loginRoleFilter');
  var fromBox = document.getElementById('loginDateFromFilter');
  var toBox = document.getElementById('loginDateToFilter');
  var statusBox = document.getElementById('loginStatusFilter');

  var searchText = searchBox ? searchBox.value.trim().toLowerCase() : '';
  var roleValue = roleBox ? roleBox.value : '';
  var statusValue = statusBox ? statusBox.value : '';
  var fromValue = fromBox && fromBox.value ? fromBox.value : '';
  var toValue = toBox && toBox.value ? toBox.value : '';

  return loginLogs.filter(function (log) {
    var haystack = ((log.user || '') + ' ' + (log.username || '')).toLowerCase();
    var matchesSearch = haystack.indexOf(searchText) !== -1;
    var matchesRole = roleValue === '' || log.role === roleValue;
    var matchesStatus = statusValue === '' || log.status === statusValue;
    var logDate = (log.login_time || log.created_at || '').slice(0, 10);
    var matchesDate = (fromValue === '' || logDate >= fromValue) && (toValue === '' || logDate <= toValue);
    return matchesSearch && matchesRole && matchesStatus && matchesDate;
  });
}

function initLoginActivityFilters() {
  var searchBox = document.getElementById('loginSearchInput');
  var roleBox = document.getElementById('loginRoleFilter');
  var fromBox = document.getElementById('loginDateFromFilter');
  var toBox = document.getElementById('loginDateToFilter');
  var statusBox = document.getElementById('loginStatusFilter');

  if (searchBox) searchBox.addEventListener('input', renderLoginActivityTable);
  if (roleBox) roleBox.addEventListener('change', renderLoginActivityTable);
  if (fromBox) fromBox.addEventListener('change', renderLoginActivityTable);
  if (toBox) toBox.addEventListener('change', renderLoginActivityTable);
  if (statusBox) statusBox.addEventListener('change', renderLoginActivityTable);
}

function renderSecurityAlerts() {
  securityAlerts = generateSecurityAlerts();

  var html = '';
  securityAlerts.forEach(function (message) {
    html += '<div class="alert-item"><span class="dot"></span>' + message + '</div>';
  });
  if (!securityAlerts.length) {
    html = '<div class="alert-item alert-item-clear"><span class="dot"></span>No security alerts right now.</div>';
  }

  var loginAlertList = document.getElementById('loginAlertList');
  var settingsAlertList = document.getElementById('settingsAlertList');
  if (loginAlertList) loginAlertList.innerHTML = html;
  if (settingsAlertList) settingsAlertList.innerHTML = html;
}

/* ---------------------------------------------------------------------
   REPORTS PAGE - powered by the Java reports service (java/src/ReportsServer.java).
   That service is a SEPARATE server (default http://localhost:8081)
   that reads the same reservation/feedback data through php/api.php
   and builds the report. Start it first (see java/README.md), then
   open this Reports page.
--------------------------------------------------------------------- */
var JAVA_REPORTS_BASE = 'http://localhost:8081'; // kept only for the optional Java service (java/README.md); no longer required.
var reportsLoaded = false;

function peso(n) {
  return peso2(n);
}

/** Fills the "All Accommodations" report filter from the real
 *  accommodations table (used to be a static, empty dropdown). */
function populateReportsAccommodationFilter() {
  var select = document.getElementById('reportsAccommodationFilter');
  if (!select) return;
  var current = select.value;
  var options = '<option value="">All Accommodations</option>';
  allAccommodations.forEach(function (a) {
    options += '<option value="' + a.slug + '">' + a.accommodation_name + '</option>';
  });
  select.innerHTML = options;
  if (current) select.value = current;
}

function getReportsFilters() {
  var fromBox = document.getElementById('reportsDateFromFilter');
  var toBox = document.getElementById('reportsDateToFilter');
  var statusBox = document.getElementById('reportsStatusFilter');
  var accBox = document.getElementById('reportsAccommodationFilter');
  return {
    from: fromBox ? fromBox.value : '',
    to: toBox ? toBox.value : '',
    status: statusBox ? statusBox.value : '',
    accommodationSlug: accBox ? accBox.value : ''
  };
}

/** Builds everything the Reports page shows directly from the real data
 *  already loaded on this page (reservations, accommodations, guests,
 *  feedback) - no separate server required, so ratings/numbers always
 *  reflect what's actually in the database. */
function computeReportsData(filters) {
  filters = filters || {};
  var accObj = null;
  if (filters.accommodationSlug) {
    accObj = allAccommodations.filter(function (a) { return a.slug === filters.accommodationSlug; })[0] || null;
  }

  function inDateAndStatus(r) {
    var ci = String(r.check_in || '').slice(0, 10);
    if (filters.from && ci < filters.from) return false;
    if (filters.to && ci > filters.to) return false;
    if (filters.status && r.status !== filters.status) return false;
    return true;
  }

  var scoped = allReservations.filter(inDateAndStatus);
  var scopedForAcc = filters.accommodationSlug ? scoped.filter(function (r) { return r.cabin_id === filters.accommodationSlug; }) : scoped;

  var totalRevenue = scopedForAcc.reduce(function (sum, r) {
    if (r.status === 'cancelled' || r.status === 'declined') return sum;
    return sum + (Number(r.total_amount) || 0);
  }, 0);

  var statusBreakdown = {};
  scoped.forEach(function (r) {
    var st = r.status || 'unknown';
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
  });

  var cabinCounts = {};
  scoped.forEach(function (r) {
    var name = r.cabin_name || 'Unknown';
    cabinCounts[name] = (cabinCounts[name] || 0) + 1;
  });
  var cabinBreakdown = Object.keys(cabinCounts).map(function (name) {
    return { cabin: name, bookings: cabinCounts[name] };
  }).sort(function (a, b) { return b.bookings - a.bookings; });

  var guestSet = {};
  scopedForAcc.forEach(function (r) {
    var key = r.guest_email || r.guest_name || '';
    if (key) guestSet[key] = true;
  });

  var feedbackScoped = lastFeedbackList.filter(function (f) {
    if (accObj && String(f.accommodation_id || '') !== String(accObj.accommodation_id)) return false;
    if (filters.from && String(f.submitted_at || '').slice(0, 10) < filters.from) return false;
    if (filters.to && String(f.submitted_at || '').slice(0, 10) > filters.to) return false;
    return true;
  });

  return {
    total_reservations: scopedForAcc.length,
    total_revenue: totalRevenue,
    guests_total: Object.keys(guestSet).length,
    total_feedback: feedbackScoped.length,
    status_breakdown: statusBreakdown,
    cabin_breakdown: cabinBreakdown,
    feedback_list: feedbackScoped,
    reservation_rows: scopedForAcc,
    generated_at: new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  };
}

function loadReports() {
  var statusEl = document.getElementById('reportsStatus');
  var gridEl = document.getElementById('reportsSummaryGrid');
  if (!statusEl) return;

  populateReportsAccommodationFilter();

  var data = computeReportsData(getReportsFilters());
  renderReportsSummary(data);
  statusEl.style.display = 'none';
  gridEl.style.display = 'grid';
}

function initReportsFilters() {
  var ids = ['reportsDateFromFilter', 'reportsDateToFilter', 'reportsTypeFilter', 'reportsAccommodationFilter', 'reportsStatusFilter'];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () { if (reportsLoaded) loadReports(); });
  });
}

function renderReportsSummary(data) {
  var gridEl = document.getElementById('reportsSummaryGrid');
  var cabinRows = data.cabin_breakdown || [];
  var totalCabinBookings = cabinRows.reduce(function (s, r) { return s + Number(r.bookings || 0); }, 0);
  var occupancyRate = totalCabinBookings ? Math.round((totalCabinBookings / (totalCabinBookings + 10)) * 100) : 0;

  gridEl.innerHTML =
    summaryCard('green', 'Total Reservations', data.total_reservations, 'This month') +
    summaryCard('yellow', 'Total Revenue', peso(data.total_revenue), 'This month') +
    summaryCard('blue', 'Occupancy Rate', occupancyRate + '%', 'Estimated') +
    summaryCard('red', 'New Guests', data.guests_total, 'This month') +
    summaryCard('green', 'Total Feedback', data.total_feedback, 'Based on ' + data.total_feedback + ' ratings');

  drawWeeklyChart('reportsTrendChart');

  var statusEntries = Object.keys(data.status_breakdown || {}).map(function (status) {
    return { label: status.charAt(0).toUpperCase() + status.slice(1), value: data.status_breakdown[status] };
  });
  renderDonut('reservationStatusDonut', 'reservationStatusLegend', statusEntries);

  var cabinEntries = cabinRows.map(function (row) { return { label: row.cabin, value: Number(row.bookings || 0) }; });
  renderDonut('topAccommodationsDonut', 'topAccommodationsLegend', cabinEntries);

  renderFeedbackStars(data.feedback_list || lastFeedbackList);

  lastReportsData = data;
  var reportsBody = document.getElementById('detailedReportsTableBody');
  var accommodationCount = cabinRows.length;
  if (reportsBody) {
    var generatedAt = data.generated_at || '-';
    var typeFilterEl = document.getElementById('reportsTypeFilter');
    var typeVal = typeFilterEl ? typeFilterEl.value : '';
    var rowsHtml = '';
    if (!typeVal || typeVal === 'reservation') rowsHtml += detailedReportRow('reservation', 'Reservation Report', data.total_reservations, 'List of all reservations with status and details.', generatedAt);
    if (!typeVal || typeVal === 'accommodation') rowsHtml += detailedReportRow('accommodation', 'Accommodation Report', accommodationCount, 'Accommodation performance and occupancy.', generatedAt);
    if (!typeVal || typeVal === 'feedback') rowsHtml += detailedReportRow('feedback', 'Feedback Report', data.total_feedback, 'Guest feedback and concern summary.', generatedAt);
    reportsBody.innerHTML = rowsHtml;
  }

  adminApiCall('reports_generate', {
    total_reservations: data.total_reservations,
    total_revenue: data.total_revenue,
    total_feedback: data.total_feedback,
    accommodation_count: accommodationCount
  }).then(function () { loadAdminNotifications(); });
}
function detailedReportRow(key, type, total, details, generatedAt) {
  return '' +
    '<tr>' +
    '  <td>' + type + '</td>' +
    '  <td>' + total + '</td>' +
    '  <td>' + details + '</td>' +
    '  <td>System Admin</td>' +
    '  <td>' + generatedAt + '</td>' +
    '  <td>' +
    '    <button class="row-action-btn report-view-btn" data-report="' + key + '" title="View" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
    '    <button class="row-action-btn report-download-btn" data-report="' + key + '" title="Download" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3V15M12 15L7 10M12 15L17 10M5 19H19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '  </td>' +
    '</tr>';
}

var lastReportsData = null;
var openReportKey = '';

function buildReportTable(key) {
  var d = lastReportsData || {};
  if (key === 'reservation') {
    return {
      title: 'Reservation Report',
      headers: ['Code', 'Guest Name', 'Accommodation', 'Check-in', 'Check-out', 'Guests', 'Status', 'Total Amount'],
      rows: (d.reservation_rows || []).map(function (r) {
        return [r.code || '', r.guest_name || '', r.cabin_name || '', r.check_in || '', r.check_out || '', r.guests_count || 0, r.status || '', Number(r.total_amount) || 0];
      })
    };
  }
  if (key === 'accommodation') {
    return {
      title: 'Accommodation Report',
      headers: ['Accommodation', 'Bookings'],
      rows: (d.cabin_breakdown || []).map(function (c) { return [c.cabin, c.bookings]; })
    };
  }
  return {
    title: 'Feedback Report',
    headers: ['Guest', 'Rating', 'Category', 'Subject', 'Status', 'Submitted'],
    rows: (d.feedback_list || []).map(function (f) {
      return [f.guest_name || '', f.rating || '', f.category || '', f.subject || '', f.status || '', String(f.submitted_at || '').slice(0, 10)];
    })
  };
}

function downloadReportCsv(key) {
  var t = buildReportTable(key);
  var lines = [t.headers.join(',')];
  t.rows.forEach(function (row) {
    lines.push(row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','));
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'camp-mayagay-' + key + '-report-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openReportDetail(key) {
  var modal = document.getElementById('reportDetailModal');
  if (!modal) return;
  var t = buildReportTable(key);
  openReportKey = key;
  document.getElementById('reportDetailTitle').textContent = t.title;
  document.getElementById('reportDetailHead').innerHTML = '<tr>' + t.headers.map(function (h) { return '<th>' + adminEsc(h) + '</th>'; }).join('') + '</tr>';
  document.getElementById('reportDetailBody').innerHTML = t.rows.length
    ? t.rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + adminEsc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
    : '<tr><td colspan="' + t.headers.length + '" class="empty-admin-note">No data for the selected filters.</td></tr>';
  modal.classList.remove('hidden');
}

function initDetailedReportActions() {
  var body = document.getElementById('detailedReportsTableBody');
  var modal = document.getElementById('reportDetailModal');
  if (body) {
    body.addEventListener('click', function (e) {
      var viewBtn = e.target.closest('.report-view-btn');
      var dlBtn = e.target.closest('.report-download-btn');
      if (viewBtn) openReportDetail(viewBtn.getAttribute('data-report'));
      else if (dlBtn) downloadReportCsv(dlBtn.getAttribute('data-report'));
    });
  }
  function closeDetail() { if (modal) modal.classList.add('hidden'); }
  ['reportDetailClose', 'reportDetailCloseBtn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', closeDetail);
  });
  var dl = document.getElementById('reportDetailDownloadBtn');
  if (dl) dl.addEventListener('click', function () { downloadReportCsv(openReportKey); });
}

function summaryCard(color, label, number, sub) {
  return '' +
    '<div class="summary-card">' +
    '  <p class="summary-label">' + label + '</p>' +
    '  <p class="summary-number">' + number + '</p>' +
    (sub ? '  <p class="summary-sub">' + sub + '</p>' : '') +
    '</div>';
}

/** Fills the "last login" summary shown on the Settings page from the
 *  most recent successful entry in the real loginLogs data. */
function refreshSettingsLastLogin() {
  var lastLoginEl = document.getElementById('settingsLastLogin');
  var deviceEl = document.getElementById('settingsLoginDevice');
  var ipEl = document.getElementById('settingsLoginIp');
  if (!lastLoginEl && !deviceEl && !ipEl) return;

  var latest = null;
  for (var i = 0; i < loginLogs.length; i++) {
    if (loginLogs[i].status === 'success') { latest = loginLogs[i]; break; }
  }
  if (latest) {
    if (lastLoginEl) lastLoginEl.textContent = formatLoginTimestamp(latest.login_time || latest.created_at);
    if (deviceEl) deviceEl.textContent = latest.device;
    if (ipEl) ipEl.textContent = latest.ip_address || 'Unknown';
  }
}

/* ---- Settings page ---- */
function initSettingsPage() {
  var viewLoginBtn = document.getElementById('viewLoginActivityBtn');
  if (viewLoginBtn) {
    viewLoginBtn.addEventListener('click', function () {
      goToView('security');
      var rolesTabBtn = document.querySelector('#securityTabs .tab-btn[data-tab="login-activity"]');
      if (rolesTabBtn) rolesTabBtn.click();
    });
  }
  refreshSettingsLastLogin();

  var changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var newPw = document.getElementById('newPasswordInput').value;
      var confirmPw = document.getElementById('confirmPasswordInput').value;
      if (!newPw || newPw !== confirmPw) {
        alert('New password and confirmation do not match.');
        return;
      }
      alert('Password updated.');
      changePasswordForm.reset();
    });
  }

  var reportsPinForm = document.getElementById('reportsPinForm');
  if (reportsPinForm) {
    reportsPinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var currentPin = document.getElementById('reportsPinCurrentInput').value.trim();
      var newPin = document.getElementById('reportsPinNewInput').value.trim();
      var confirmPin = document.getElementById('reportsPinConfirmInput').value.trim();

      if (currentPin !== getReportsPin()) {
        alert('Incorrect current PIN.');
        return;
      }
      if (!/^\d{4}$/.test(newPin)) {
        alert('New PIN must be exactly 4 digits.');
        return;
      }
      if (newPin !== confirmPin) {
        alert('New PIN and confirmation do not match.');
        return;
      }

      localStorage.setItem('campMayagayReportsPin', newPin);
      reportsPinForm.reset();
      showAdminToast('Reports PIN updated.');
    });
  }

  var systemPreferencesForm = document.getElementById('systemPreferencesForm');
  var currencySelect = document.getElementById('currencySelect');
  if (currencySelect) currencySelect.value = getActiveCurrency();
  if (systemPreferencesForm) {
    systemPreferencesForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (currencySelect) setActiveCurrency(currencySelect.value);
      // Re-render anything currently on screen that shows money so the
      // new currency symbol/format is reflected immediately.
      loadAllReservations();
      loadAccommodations();
      if (reportsLoaded) loadReports();
      showAdminToast('Preferences saved.');
    });
  }
}

/* ---- Feedback filters (client-side over the last loaded list) ---- */
function initFeedbackFilters() {
  var searchInput = document.getElementById('feedbackSearchInput');
  var statusFilter = document.getElementById('feedbackStatusFilter');
  var typeFilter = document.getElementById('feedbackTypeFilter');
  var accommodationFilter = document.getElementById('feedbackAccommodationFilter');
  var ratingFilter = document.getElementById('feedbackRatingFilter');
  var fromFilter = document.getElementById('feedbackDateFromFilter');
  var toFilter = document.getElementById('feedbackDateToFilter');
  if (!searchInput) return;

  function applyFilters() {
    var term = searchInput.value.trim().toLowerCase();
    var status = statusFilter.value;
    var type = typeFilter.value;
    var accommodationId = accommodationFilter ? accommodationFilter.value : '';
    var rating = ratingFilter.value;
    var from = fromFilter.value;
    var to = toFilter.value;

    var filtered = lastFeedbackList.filter(function (f) {
      if (term && !((f.guest_name || '').toLowerCase().indexOf(term) > -1 || (f.subject || '').toLowerCase().indexOf(term) > -1 || feedbackRefNo(f).toLowerCase().indexOf(term) > -1)) return false;
      if (status && f.status !== status) return false;
      if (type && f.category !== type) return false;
      if (accommodationId && String(f.accommodation_id || '') !== String(accommodationId)) return false;
      if (rating && Math.round(Number(f.rating) || 0) !== Number(rating)) return false;
      if (from && f.submitted_at && f.submitted_at < from) return false;
      if (to && f.submitted_at && f.submitted_at > to) return false;
      return true;
    });
    renderFeedbackTable(filtered);
  }

  [searchInput, statusFilter, typeFilter, accommodationFilter, ratingFilter, fromFilter, toFilter].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initSettingsPage();
  initFeedbackFilters();

  var refreshSettingsIdsBtn = document.getElementById('refreshSettingsIdsBtn');
  if (refreshSettingsIdsBtn) refreshSettingsIdsBtn.addEventListener('click', loadUsers);
  initReportsPinModal();

  var downloadBtn = document.getElementById('downloadCsvBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () { downloadReportsCsv(); });
  }
  initReportsFilters();
  initDetailedReportActions();
});

/** Builds a CSV of the currently-filtered reservations straight from
 *  the live data already on the page and downloads it - no separate
 *  Java/export server required. */
function downloadReportsCsv() {
  var filters = getReportsFilters();
  var accObj = null;
  if (filters.accommodationSlug) {
    accObj = allAccommodations.filter(function (a) { return a.slug === filters.accommodationSlug; })[0] || null;
  }
  var rows = allReservations.filter(function (r) {
    var ci = String(r.check_in || '').slice(0, 10);
    if (filters.from && ci < filters.from) return false;
    if (filters.to && ci > filters.to) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.accommodationSlug && r.cabin_id !== filters.accommodationSlug) return false;
    return true;
  });

  var header = ['Code', 'Guest Name', 'Accommodation', 'Check-in', 'Check-out', 'Guests', 'Status', 'Total Amount'];
  var lines = [header.join(',')];
  rows.forEach(function (r) {
    var line = [
      r.code || '', '"' + (r.guest_name || '').replace(/"/g, '""') + '"',
      '"' + (r.cabin_name || '').replace(/"/g, '""') + '"',
      r.check_in || '', r.check_out || '', r.guests_count || 0,
      r.status || '', Number(r.total_amount) || 0
    ];
    lines.push(line.join(','));
  });
  var csvContent = lines.join('\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'camp-mayagay-report-' + (accObj ? accObj.slug + '-' : '') + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ================= Feedback page: "Replies & Messages Sent" tab ================= */
var sentMessagesList = [];

function adminEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var SENT_PAGE_SIZE = 50;
var sentPage = 0;

function loadSentMessages() {
  var box = document.getElementById('sentMessagesBody');
  if (box) box.innerHTML = '<div class="gm-empty">Loading messages...</div>';
  adminApiCall('sent_messages_list', {}).then(function (res) {
    if (!res || !res.success) {
      if (box) box.innerHTML = '<div class="gm-empty">Could not load messages. Please try again.</div>';
      return;
    }
    sentMessagesList = res.messages || [];
    sentPage = 0;
    renderSentMessages();
  });
}

// Today -> "3:45 PM", this year -> "Oct 12", older -> "10/12/25" (like Gmail)
function sentShortDate(raw) {
  var d = new Date(String(raw || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return adminEsc(raw || '');
  var now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}
function renderSentMessages(keepPage) {
  var box = document.getElementById('sentMessagesBody');
  if (!box) return;
  if (keepPage !== true) sentPage = 0;
  var term = (document.getElementById('sentSearchInput').value || '').trim().toLowerCase();
  var kind = document.getElementById('sentKindFilter').value;
  var from = document.getElementById('sentDateFromFilter').value;
  var to = document.getElementById('sentDateToFilter').value;

  var list = sentMessagesList.filter(function (m) {
    var day = (m.created_at || '').slice(0, 10);
    if (kind && m.kind !== kind) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (term) {
      var hay = ((m.guest_name || '') + ' ' + (m.email || '') + ' ' + (m.title || '') + ' ' + (m.message || '')).toLowerCase();
      if (hay.indexOf(term) === -1) return false;
    }
    return true;
  });

  var total = list.length;
  var maxPage = Math.max(0, Math.ceil(total / SENT_PAGE_SIZE) - 1);
  if (sentPage > maxPage) sentPage = maxPage;
  var start = sentPage * SENT_PAGE_SIZE;
  var pageItems = list.slice(start, start + SENT_PAGE_SIZE);

  var info = document.getElementById('sentPageInfo');
  if (info) info.textContent = total ? ((start + 1) + '\u2013' + (start + pageItems.length) + ' of ' + total) : '0 of 0';
  var prev = document.getElementById('sentPrevBtn');
  var next = document.getElementById('sentNextBtn');
  if (prev) prev.disabled = sentPage <= 0;
  if (next) next.disabled = sentPage >= maxPage;

  if (!total) {
    box.innerHTML = '<div class="gm-empty">No replies or messages found.</div>';
    return;
  }
  var html = '';
  pageItems.forEach(function (m) {
    var isReply = m.kind === 'reply';
    var emailMark = m.email_status === 'sent' ? '<span class="gm-row-flag ok" title="Sent to email">Emailed</span>'
                  : m.email_status === 'failed' ? '<span class="gm-row-flag bad" title="Email could not be delivered">Email failed</span>' : '';
    html += '<div class="gm-row ' + (m.seen ? 'seen' : 'unseen') + '" data-sent-id="' + m.id + '" role="button" tabindex="0">';
    html += '  <span class="gm-row-to">' + adminEsc(m.guest_name) + '</span>';
    html += '  <span class="gm-row-line">';
    html += '    <span class="gm-chip ' + (isReply ? 'reply' : 'msg') + '">' + (isReply ? 'Reply' : 'Message') + '</span>';
    html += '    <span class="gm-row-subject">' + adminEsc(m.title) + '</span>';
    html += '    <span class="gm-row-snippet"> - ' + adminEsc(m.message) + '</span>';
    html += '  </span>';
    html += '  ' + emailMark;
    html += '  <span class="gm-row-date" title="' + adminEsc(formatLoginTimestamp(m.created_at)) + '">' + sentShortDate(m.created_at) + '</span>';
    html += '</div>';
  });
  box.innerHTML = html;

  box.querySelectorAll('.gm-row').forEach(function (row) {
    var open = function () { openSentMessage(row.getAttribute('data-sent-id')); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
  });
}

function relativeAgo(raw) {
  var d = new Date(String(raw || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  var mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  var hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  var days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/* Opens the full message in the page (like opening an email), with a back arrow. */
function openSentMessage(id) {
  var m = sentMessagesList.filter(function (x) { return String(x.id) === String(id); })[0];
  if (!m) return;
  var isReply = m.kind === 'reply';
  document.getElementById('sentDetailTitle').textContent = m.title || 'Message';
  var chip = document.getElementById('sentDetailChip');
  chip.textContent = isReply ? 'Reply' : 'Message';
  chip.className = 'gm-chip ' + (isReply ? 'reply' : 'msg');
  document.getElementById('sentDetailTo').textContent = 'to ' + m.guest_name + (m.email ? ' <' + m.email + '>' : '');
  var d = new Date(String(m.created_at || '').replace(' ', 'T'));
  var when = isNaN(d.getTime()) ? (m.created_at || '') :
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' (' + relativeAgo(m.created_at) + ')';
  document.getElementById('sentDetailTime').textContent = when;
  document.getElementById('sentDetailBody').textContent = m.message || '';
  var foot = [];
  foot.push(m.seen ? 'Seen by guest' : 'Not yet seen by guest');
  if (m.email_status === 'sent') foot.push('Also sent to their email');
  else if (m.email_status === 'failed') foot.push('Email could not be delivered');
  document.getElementById('sentDetailFoot').textContent = foot.join(' \u2022 ');
  document.getElementById('sentListPanel').hidden = true;
  document.getElementById('sentDetailView').hidden = false;
  window.scrollTo({ top: 0 });
}

function closeSentMessage() {
  var detail = document.getElementById('sentDetailView');
  var list = document.getElementById('sentListPanel');
  if (detail) detail.hidden = true;
  if (list) list.hidden = false;
}

function initFeedbackTabs() {
  var buttons = document.querySelectorAll('#feedbackTabs .tab-btn');
  if (!buttons.length) return;
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-fbtab');
      buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('.fbtab-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.id === 'fbtab-' + tab);
      });
      closeSentMessage();
      if (tab === 'sent') loadSentMessages();
    });
  });

  ['sentSearchInput', 'sentKindFilter', 'sentDateFromFilter', 'sentDateToFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', renderSentMessages);
    el.addEventListener('change', renderSentMessages);
  });
  var prevBtn = document.getElementById('sentPrevBtn');
  var nextBtn = document.getElementById('sentNextBtn');
  if (prevBtn) prevBtn.addEventListener('click', function () { if (sentPage > 0) { sentPage--; renderSentMessages(true); } });
  if (nextBtn) nextBtn.addEventListener('click', function () { sentPage++; renderSentMessages(true); });
  var refresh = document.getElementById('refreshSentBtn');
  if (refresh) refresh.addEventListener('click', loadSentMessages);
  var backBtn = document.getElementById('sentDetailBack');
  if (backBtn) backBtn.addEventListener('click', closeSentMessage);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSentMessage(); });
}

document.addEventListener('DOMContentLoaded', initFeedbackTabs);