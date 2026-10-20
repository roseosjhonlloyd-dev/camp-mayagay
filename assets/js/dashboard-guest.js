(function(){

  const ICONS = {
    hut: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 30L32 12L56 30" stroke="#2c5138" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 28V52H50V28" stroke="#4f7d54" stroke-width="3" stroke-linejoin="round"/><path d="M27 52V38H37V52" stroke="#2c5138" stroke-width="3" stroke-linejoin="round"/><path d="M8 30L32 12L38 16.3" stroke="#8fbf6e" stroke-width="3" stroke-linecap="round"/></svg>`,
    glass: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="14" width="40" height="38" rx="2" stroke="#2c5138" stroke-width="3"/><path d="M32 14V52" stroke="#4f7d54" stroke-width="3"/><path d="M12 30H52" stroke="#4f7d54" stroke-width="3"/><path d="M18 40H26" stroke="#8fbf6e" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    tent: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 14L52 50H12L32 14Z" stroke="#2c5138" stroke-width="3" stroke-linejoin="round"/><path d="M32 14L44 50" stroke="#4f7d54" stroke-width="2.6"/><path d="M32 14L20 50" stroke="#4f7d54" stroke-width="2.6"/><path d="M25 50V38L32 44L39 38V50" stroke="#8fbf6e" stroke-width="2.6" stroke-linejoin="round"/></svg>`,
    house: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 26L32 10L54 26" stroke="#2c5138" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="16" y="26" width="32" height="26" stroke="#4f7d54" stroke-width="3"/><rect x="22" y="34" width="8" height="8" stroke="#8fbf6e" stroke-width="2.4"/><rect x="34" y="34" width="8" height="8" stroke="#8fbf6e" stroke-width="2.4"/><path d="M16 44H48" stroke="#4f7d54" stroke-width="2"/></svg>`
  };
  const ART_BG = { hut:'#F1FEC8', glass:'#B2D5E5', tent:'#E5BDDF', house:'#D2C3F6' };

  const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  // Dating hardcoded ang listahan ng cabins dito - kaya kahit magdagdag
  // pa ang admin ng bagong accommodation sa Accommodations page, hindi
  // ito lumalabas sa Guest side. Ngayon, kinukuha na ito mula sa totoong
  // accommodations table (parehong pinagmumulan ng Admin dashboard).
  let CABINS = [];
  // Raw accommodation rows (accommodation_id + accommodation_name) exactly
  // as the database returns them - used to list ALL accommodations in the
  // feedback form and the reviews filter, kahit wala pang reservation ang
  // guest dito, at automatic na kasama ang bagong idinagdag ng admin.
  let ACCOMMODATIONS_RAW = [];

  // Type -> icon/unit mapping, ginagamit lang kung walang sariling
  // larawan ang isang accommodation (fallback), at para malaman kung
  // "night", "tent", o "night room" ang tamang unit label.
  const TYPE_ICON = { nipa: 'hut', cabin: 'glass', 'tent area': 'tent', room: 'house' };
  const TYPE_UNIT = { nipa: 'night', cabin: 'night', 'tent area': 'tent', room: 'night room' };

  function mapAccommodationToCabin(a){
    const icon = TYPE_ICON[a.type] || 'hut';
    return {
      id: a.slug,
      accId: a.accommodation_id ? Number(a.accommodation_id) : null,
      name: a.accommodation_name,
      note: a.capacity || a.description || '',
      price: Number(a.price) || 0,
      unit: TYPE_UNIT[a.type] || 'night',
      icon: icon,
      code: (a.slug || 'CMY').slice(0, 3).toUpperCase(),
      image: a.image || null,
      amenities: Array.isArray(a.amenities) ? a.amenities : ['Complete beddings', 'Kettle', 'Plates', 'Mugs']
    };
  }

  const state = {
    favorites: new Set(),
    favCounts: {},
    selectedDate: '',
    availability: {},
    reservations: [],
    feedback: [],
    allFeedback: [],
    reservationSeq: 0,
    notifications: [
      { id:'n0', type:'announcement', title:'Welcome to Camp Mayagay', desc:'Explore our huts, tents and houses to plan your next trip.', timestamp:'Today \u00b7 9:00 AM', read:false }
    ]
  };

  const NOTIF_ICONS = {
    confirmation: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 8H16M8 12H16M8 16H12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    payment: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/><path d="M7 15H11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    announcement: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 10V14H7L13 18V6L7 10H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16 9.5C17 10.4 17 13.6 16 14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`
  };

  let sessionExpiredNoticeShown = false;
  function apiCall(action, body){
    return fetch('php/api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(res => {
      if (res.status === 401 && !sessionExpiredNoticeShown) {
        sessionExpiredNoticeShown = true;
        showToast('Your session has expired or you are logged in elsewhere. Please log in again.');
        setTimeout(() => { window.location.href = 'Login.html'; }, 1800);
      }
      return res.json();
    });
  }

  // Totoong detalye ng naka-login na account - ginagamit para i-prefill
  // ang booking form (advisor requirement: "check user details for booking").
  let sessionUser = null;

  function loadSession(){
    return apiCall('session', {}).then(res => {
      if (!res || !res.success || !res.user) return;
      sessionUser = res.user;
      const fullName = (res.user.firstname + ' ' + res.user.lastname).trim();
      const initials = ((res.user.firstname[0] || '') + (res.user.lastname[0] || '')).toUpperCase();
      const nameEl = document.getElementById('profileDropdownName');
      if (nameEl) nameEl.textContent = fullName || 'Guest';

      // Kung may naka-save na profile photo, ipakita yun sa halip na
      // initials. Dati, palaging tina-text lang ang avatar dito kaya
      // pag tinawag ulit ang loadSession() (hal. pagkatapos mag-save),
      // na-o-overwrite agad pabalik yung photo na kakalagay lang.
      const savedPhoto = res.user.profile_image ? (res.user.profile_image + '?t=' + Date.now()) : null;
      const avatarBtn = document.getElementById('profileBtn');
      if (avatarBtn) {
        avatarBtn.innerHTML = savedPhoto
          ? `<img src="${savedPhoto}" alt="Profile photo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
          : (initials || 'G');
      }
      const avatarCircle = document.getElementById('avatarCircle');
      if (avatarCircle) {
        avatarCircle.innerHTML = savedPhoto
          ? `<img src="${savedPhoto}" alt="Profile photo">`
          : (initials || 'G');
      }
      const settingsName = document.getElementById('settingsName');
      if (settingsName) settingsName.value = fullName;
      const settingsEmail = document.getElementById('settingsEmail');
      if (settingsEmail) settingsEmail.value = res.user.email || '';
      const settingsContact = document.getElementById('settingsContact');
      if (settingsContact) settingsContact.value = res.user.contact_number || '';
      const settingsLocation = document.getElementById('settingsLocation');
      if (settingsLocation) settingsLocation.value = res.user.address || '';

      const validIdStatusEl = document.getElementById('validIdStatus');
      const validIdPreviewEl = document.getElementById('validIdPreview');
      const statusLabels = { not_submitted: 'Not submitted', pending: 'Pending review', verified: 'Verified', rejected: 'Rejected — please resubmit' };
      const idStatus = res.user.id_verification_status || 'not_submitted';
      if (validIdStatusEl) {
        validIdStatusEl.textContent = statusLabels[idStatus] || 'Not submitted';
        validIdStatusEl.className = 'valid-id-status status-' + idStatus;
      }
      if (validIdPreviewEl && res.user.valid_id_image) {
        validIdPreviewEl.innerHTML = `<img src="${res.user.valid_id_image}?t=${Date.now()}" alt="Valid ID">`;
      }
    }).catch(() => {});
  }
  function loadReservations(){
    return apiCall('reservations_list', {}).then(res => {
      if (!res || !res.success) return;
      let dismissedResIds = [];
      try { dismissedResIds = JSON.parse(localStorage.getItem('campDismissedReservations') || '[]'); } catch (e) { dismissedResIds = []; }
      state.reservations = (res.reservations || []).filter(row => !dismissedResIds.includes(row.id)).map(row => {
        const saved = row.data || {};
        return Object.assign({}, saved, {
          id: 'r' + row.id,
          dbId: row.id,
          status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
          cancelRequested: !!row.cancel_requested,
          cancelReason: row.cancel_reason || '',
          guest: saved.guest || { name: row.guest_name, email: row.guest_email, phone: row.guest_phone },
          cabin: saved.cabin || row.cabin_name,
          total: saved.total || Number(row.total_amount),
          paymentMethod: saved.paymentMethod || row.payment_method || '',
          checkInLabel: saved.checkInLabel || row.check_in,
          checkOutLabel: saved.checkOutLabel || row.check_out,
          lineItems: saved.lineItems || [{ label: row.cabin_name, price: Number(row.total_amount) }]
        });
      });
      renderHistory();
    }).catch(() => {});
  }

  function loadFeedback(){
    return apiCall('feedback_list', {}).then(res => {
      if (!res || !res.success) return;
      state.feedback = (res.feedback || []).map(f => ({
        rating: Number(f.rating),
        message: f.message,
        response: f.response || '',
        status: f.status || 'open',
        accommodationName: f.accommodation_name || '',
        when: f.submitted_at ? new Date(f.submitted_at).toLocaleString() : ''
      }));
      renderFeedback();
    }).catch(() => {});
  }

  function loadAllFeedback(){
    return apiCall('feedback_public_list', {}).then(res => {
      if (!res || !res.success) return;
      state.allFeedback = (res.feedback || []).map(f => ({
        rating: Number(f.rating),
        message: f.message,
        guestName: f.guest_display_name || 'Guest',
        accommodationId: f.accommodation_id ? Number(f.accommodation_id) : null,
        accommodationName: f.accommodation_name || '',
        when: f.submitted_at ? new Date(f.submitted_at).toLocaleString() : ''
      }));
      renderAllFeedback();
    }).catch(() => {});
  }

  function renderAllFeedback(){
    const el = document.getElementById('allFeedbackList');
    if (!el) return;
    const filterSelect = document.getElementById('allFeedbackRatingFilter');
    const ratingFilter = filterSelect ? filterSelect.value : '';
    const accFilterSelect = document.getElementById('allFeedbackAccommodationFilter');
    const accFilter = accFilterSelect ? accFilterSelect.value : '';
    let rows = state.allFeedback;
    if (ratingFilter) rows = rows.filter(f => f.rating === Number(ratingFilter));
    if (accFilter) rows = rows.filter(f => f.accommodationId === Number(accFilter));
    if (!rows.length) {
      el.innerHTML = `
        <div class="feedback-empty">
          <svg viewBox="0 0 24 24" fill="none" width="30" height="30"><path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0112 6.5 5.5 5.5 0 0121.5 12c-2.5 4.65-9.5 9-9.5 9Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <p>${ratingFilter || accFilter ? 'No reviews match these filters yet.' : 'No guest reviews yet.'}</p>
        </div>`;
      return;
    }
    el.innerHTML = rows.map(f => `
      <div class="feedback-entry">
        <div class="fb-entry-top">
          <div class="fb-stars-mini">${'\u2605'.repeat(f.rating)}${'\u2606'.repeat(5-f.rating)}</div>
          <div class="fmeta">${f.when}</div>
        </div>
        <p class="fb-entry-room">${f.guestName}${f.accommodationName ? ' \u00b7 ' + f.accommodationName : ''}</p>
        <p class="fb-entry-msg">${f.message}</p>
      </div>
    `).join('');
  }

  /** Fills the "Which room are you rating?" select with the rooms this
   *  guest has actually booked, newest stay first, deduplicated. */
  function populateFeedbackAccommodationSelect(){
    const select = document.getElementById('fbAccommodation');
    if (!select) return;
    const current = select.value;
    let options = '<option value="">General / overall stay (no specific room)</option>';
    ACCOMMODATIONS_RAW.forEach(a => {
      options += `<option value="${a.accommodation_id}">${a.accommodation_name}</option>`;
    });
    select.innerHTML = options;
    if (current) select.value = current;
  }

  function loadNotifications(){
    return apiCall('notifications_list', {}).then(res => {
      if (!res || !res.success) return;
      state.notifications = (res.notifications || []).map(n => ({
        id: String(n.id),
        type: n.type,
        title: n.title,
        desc: n.description,
        timestamp: new Date(n.created_at).toLocaleString(),
        created: n.created_at,
        read: !!Number(n.is_read)
      }));
      renderNotifications();
    }).catch(() => {});
  }

  function peso(n){ return '\u20b1' + n.toLocaleString(); }

  function artContent(cabin){
    if (cabin.image){
      return `<img src="${cabin.image}" alt="${cabin.name}">`;
    }
    return ICONS[cabin.icon] || ICONS.hut;
  }

  // Totoong reservations (accommodation + dates lang, walang guest info) -
  // dating fake/random ang availability dito, ngayon galing na sa
  // totoong database (advisor requirement: "no fake availability data").
  let realBookings = [];

  function toLocalDateKey(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function loadAccommodationsForGuest(){
    return apiCall('accommodations_list', {}).then(res => {
      const rows = (res && res.success && res.accommodations) ? res.accommodations : [];
      CABINS = rows
        .filter(a => a.status !== 'unavailable') // itago ang mga pansamantalang di-available na accommodation
        .map(mapAccommodationToCabin);
      // Lahat ng accommodation (kahit unavailable), para sa "All guest
      // reviews" filter at sa "Which room are you rating?" select -
      // automatic na kasama dito ang bagong idinagdag ng admin dahil
      // kinukuha ito mula sa live accommodations table.
      ACCOMMODATIONS_RAW = rows;
      populateAllFeedbackAccommodationFilter(rows);
      populateFeedbackAccommodationSelect();
    }).catch(() => {
      CABINS = [];
    });
  }

  function populateAllFeedbackAccommodationFilter(rows){
    const select = document.getElementById('allFeedbackAccommodationFilter');
    if (!select) return;
    const current = select.value;
    let options = '<option value="">All accommodations</option>';
    rows.forEach(a => {
      options += `<option value="${a.accommodation_id}">${a.accommodation_name}</option>`;
    });
    select.innerHTML = options;
    select.value = current || '';
  }

  function loadAvailability(){
    return apiCall('availability_list', {}).then(res => {
      realBookings = (res && res.success && res.bookings) ? res.bookings : [];
    }).catch(() => {});
  }

  function isAvailable(cabinId, dayIndex){
    const dayKey = toLocalDateKey(getDateForDay(dayIndex));
    return !realBookings.some(b => {
      if (b.slug !== cabinId) return false;
      const ci = String(b.check_in).slice(0, 10);
      const co = String(b.check_out).slice(0, 10);
      return ci <= dayKey && dayKey < co;
    });
  }
  function availKey(cabinId, dayIndex){ return cabinId + '_' + dayIndex; }

  function buildAvailability(){
    const map = {};
    CABINS.forEach(c => {
      DAYS.forEach((d, i) => {
        map[availKey(c.id, i)] = isAvailable(c.id, i);
      });
    });
    return map;
  }

  const today = new Date();
  state.selectedDate = today.toISOString().slice(0,10);

 
  function renderHomeCards(){
    const grid = document.getElementById('homeCardGrid');
    grid.innerHTML = CABINS.slice(0,4).map(c => `
      <div class="cabin-card">
        <div class="cabin-art" style="background:${ART_BG[c.icon]}">${artContent(c)}</div>
        <div class="cabin-body">
          <p class="cabin-name">${c.name}</p>
          <p class="cabin-note">${c.note}</p>
          <div class="cabin-foot">
            <span class="cabin-price">${peso(c.price)}/ ${c.unit}</span>
            <span class="fav-wrap">
              <span class="fav-count" title="Guests who favorited this">${state.favCounts[c.id] || 0}</span>
              <button class="fav-btn ${state.favorites.has(c.id)?'active':''}" data-fav="${c.id}" aria-label="Save ${c.name}">
                <svg viewBox="0 0 24 24" fill="${state.favorites.has(c.id)?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7.5-4.7-10-9.3C.5 8.2 2.5 5 6 5c2 0 3.6 1.1 4.5 2.6.9-1.5 2.5-2.6 4.5-2.6 3.5 0 5.5 3.2 4 6.7C19.5 16.3 12 21 12 21z"/></svg>
              </button>
            </span>
          </div>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('[data-fav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.fav;
        const cabin = CABINS.find(c => c.id === id);
        if (!cabin || !cabin.accId) return;
        const wasFav = state.favorites.has(id);
        wasFav ? state.favorites.delete(id) : state.favorites.add(id);
        state.favCounts[id] = Math.max(0, (state.favCounts[id] || 0) + (wasFav ? -1 : 1));
        renderHomeCards();
        apiCall('favorites_toggle', { accommodation_id: cabin.accId }).then(res => {
          if (res && res.success) {
            state.favCounts[id] = Number(res.count);
            renderHomeCards();
          } else {
            loadFavorites();
          }
        }).catch(() => loadFavorites());
      });
    });
    grid.querySelectorAll('[data-reviews]').forEach(btn => {
      btn.addEventListener('click', () => openAccReviews(Number(btn.dataset.reviews)));
    });
  }

  function loadFavorites(){
    return apiCall('favorites_list', {}).then(res => {
      if (!res || !res.success) return;
      const idToSlug = {};
      CABINS.forEach(c => { if (c.accId) idToSlug[c.accId] = c.id; });
      state.favorites = new Set((res.favorites || []).map(id => idToSlug[id]).filter(Boolean));
      state.favCounts = {};
      (res.counts || []).forEach(r => {
        const slug = idToSlug[Number(r.accommodation_id)];
        if (slug) state.favCounts[slug] = Number(r.total);
      });
      renderHomeCards();
    }).catch(() => {});
  }

  let TRENDING = [];
  function loadTrendingAccommodations(){
    return apiCall('accommodations_trending', {}).then(res => {
      TRENDING = (res && res.success && res.accommodations) ? res.accommodations : [];
      renderTrendingCards();
    }).catch(() => {});
  }
  function renderTrendingCards(){
    const row = document.getElementById('trendingScroll');
    if (!row) return;
    // Naka-hide ang buong Trending panel hangga't wala pang kahit isang
    // accommodation na may rating.
    const panel = row.closest('.trending-panel');
    if (panel) panel.style.display = TRENDING.length ? '' : 'none';
    if (!TRENDING.length){
      row.innerHTML = '';
      return;
    }
    row.innerHTML = TRENDING.map(a => {
      const cabin = mapAccommodationToCabin(a);
      const rating = Number(a.avg_rating).toFixed(1);
      return `
      <div class="trend-card" role="button" tabindex="0" data-acc-id="${a.accommodation_id}" title="View reviews">
        <div class="trend-art">${artContent(cabin)}</div>
        <div class="trend-body">
          <p class="trend-name">${escHtml(cabin.name)}</p>
          <div class="trend-rating">
            <svg viewBox="0 0 24 24" fill="#d3a94a" width="14" height="14"><path d="M12 2L14.9 8.6L22 9.3L16.7 14L18.2 21L12 17.3L5.8 21L7.3 14L2 9.3L9.1 8.6L12 2Z"/></svg>
            <span>${rating}</span><span class="trend-rating-count">(${a.rating_count} ${Number(a.rating_count) === 1 ? 'review' : 'reviews'})</span>
          </div>
          <div class="trend-foot">
            <span class="trend-price">${peso(cabin.price)}/ ${cabin.unit}</span>
            <span class="trend-badge">${a.booking_count} booked</span>
          </div>
          <span class="trend-see-reviews">See reviews ›</span>
        </div>
      </div>`;
    }).join('');
    row.querySelectorAll('.trend-card').forEach(card => {
      const open = () => openAccReviews(Number(card.dataset.accId));
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  function escHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]
    ));
  }

  function starsText(n){
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
  }

  // Reviews modal: ratings + comments ng mga dating nag-stay sa napiling
  // accommodation.
  function openAccReviews(accId){
    const a = TRENDING.find(x => Number(x.accommodation_id) === accId)
           || CABINS.find(x => x.accId === accId);
    const overlay = document.getElementById('accReviewsModal');
    if (!overlay) return;
    document.getElementById('accReviewsTitle').textContent = a ? (a.accommodation_name || a.name) : 'Reviews';
    const summary = document.getElementById('accReviewsSummary');
    const list = document.getElementById('accReviewsList');
    summary.innerHTML = '';
    list.innerHTML = '<p class="trend-empty">Loading reviews\u2026</p>';
    overlay.classList.add('open');
    apiCall('accommodation_reviews', { accommodation_id: accId }).then(res => {
      if (!res || !res.success){
        list.innerHTML = '<p class="trend-empty">Could not load reviews. Please try again.</p>';
        return;
      }
      const reviews = res.reviews || [];
      if (!reviews.length){
        list.innerHTML = '<p class="trend-empty">No reviews yet.</p>';
        return;
      }
      summary.innerHTML = `
        <span class="acc-rev-avg">${Number(res.avg_rating).toFixed(1)}</span>
        <span class="acc-rev-stars">${starsText(res.avg_rating)}</span>
        <span class="acc-rev-total">${res.rating_count} ${res.rating_count === 1 ? 'review' : 'reviews'}</span>`;
      list.innerHTML = reviews.map(r => `
        <div class="acc-rev-item">
          <div class="acc-rev-top">
            <span class="acc-rev-name">${escHtml(r.guest_display_name || 'Guest')}</span>
            <span class="acc-rev-date">${r.submitted_at ? escHtml(new Date(r.submitted_at.replace(' ', 'T')).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })) : ''}</span>
          </div>
          <div class="fb-stars-mini">${starsText(r.rating)}</div>
          <p class="acc-rev-msg">${escHtml(r.message)}</p>
        </div>`).join('');
    }).catch(() => {
      list.innerHTML = '<p class="trend-empty">Could not load reviews. Please try again.</p>';
    });
  }
  function closeAccReviews(){
    const overlay = document.getElementById('accReviewsModal');
    if (overlay) overlay.classList.remove('open');
  }
  (function wireAccReviewsModal(){
    const overlay = document.getElementById('accReviewsModal');
    const closeX = document.getElementById('accReviewsCloseX');
    if (closeX) closeX.addEventListener('click', closeAccReviews);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAccReviews(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAccReviews(); });
  })();

  const ACCOM_PAGE_SIZE = 6;
  let accomPage = 0;

  function renderAccomGrid(){
    const grid = document.getElementById('accomGrid');
    const pageItems = CABINS.slice(accomPage * ACCOM_PAGE_SIZE, accomPage * ACCOM_PAGE_SIZE + ACCOM_PAGE_SIZE);

    grid.innerHTML = pageItems.map(c => `
      <div class="accom-card">
        <div class="accom-art" style="background:${ART_BG[c.icon]}">${artContent(c)}</div>
        <div class="accom-info">
          <div>
            <p class="accom-name">${c.name}</p>
            <p class="accom-note">${c.note}</p>
          </div>
          <span class="accom-price">${peso(c.price)}/ ${c.unit}</span>
        </div>
        <div class="day-row">
          ${DAYS.map((d,i) => {
            const avail = state.availability[availKey(c.id,i)];
            return `<button class="day-pill ${avail?'avail':'booked'}" data-cabin="${c.id}" data-day="${i}" ${avail?'':'disabled'}>${d}</button>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-reviews]').forEach(btn => {
      btn.addEventListener('click', () => openAccReviews(Number(btn.dataset.reviews)));
    });
    grid.querySelectorAll('.day-pill.avail').forEach(btn => {
      btn.addEventListener('click', () => openBookingModal(btn.dataset.cabin, Number(btn.dataset.day)));
    });

    updatePaginationButtons();
  }

  function updatePaginationButtons(){
    const prevBtn = document.getElementById('prevAccomBtn');
    const nextBtnEl = document.getElementById('nextBtn');
    const totalPages = Math.max(1, Math.ceil(CABINS.length / ACCOM_PAGE_SIZE));
    if (prevBtn) prevBtn.style.display = accomPage > 0 ? 'inline-flex' : 'none';
    if (nextBtnEl) {
      nextBtnEl.disabled = accomPage >= totalPages - 1;
      nextBtnEl.style.opacity = nextBtnEl.disabled ? '0.5' : '1';
      nextBtnEl.style.cursor = nextBtnEl.disabled ? 'not-allowed' : 'pointer';
    }
  }

  function getDateForDay(dayIndex){
    const monthEl = document.getElementById('monthInput');
    const dayEl = document.getElementById('dayInput');
    let ref;
    if (dayEl && dayEl.value) ref = new Date(dayEl.value + 'T00:00');
    else if (monthEl && monthEl.value) ref = new Date(monthEl.value + '-01');
    else ref = new Date();
    const dow = ref.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + mondayOffset);
    const target = new Date(monday);
    target.setDate(monday.getDate() + dayIndex);
    return target;
  }
  function fmtDate(d){
    return d.toLocaleDateString(undefined,{month:'long', day:'numeric', year:'numeric'}).toUpperCase();
  }
  function fmtTime(t){
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2,'0') + ' ' + period;
  }

  // Builds a "YYYY-MM-DD HH:mm:ss" string using the browser's LOCAL
  // date/time (no UTC conversion). Using Date.toISOString() here was a
  // bug: it converts to UTC first, which can push the stored date back
  // (or forward) a full day for the Philippines timezone. That mismatch
  // is why a booking made for e.g. Sept 6 could end up saved as Sept 5,
  // so it never showed up under the right day on the admin's Reservation
  // Calendar. Always build the date/time string from local fields instead.
  function toMysqlDateTime(d, timeStr){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const time = (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) ? timeStr + ':00' : '00:00:00';
    return y + '-' + m + '-' + day + ' ' + time;
  }

  let pendingBooking = null;
  const extraQty = { person:1, blanket:1, pillow:1, nights:1 };

  function resetSteppers(){
    extraQty.person = 1; extraQty.blanket = 1; extraQty.pillow = 1; extraQty.nights = 1;
    document.getElementById('qtyPerson').textContent = 1;
    document.getElementById('qtyBlanket').textContent = 1;
    document.getElementById('qtyPillow').textContent = 1;
    document.getElementById('qtyNights').textContent = 1;
    document.getElementById('chkPerson').checked = true;
    document.getElementById('chkBlanket').checked = true;
    document.getElementById('chkPillow').checked = true;
  }
  document.querySelectorAll('.stepper').forEach(st => {
    const key = st.dataset.stepper;
    st.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.step);
        const min = (key === 'person' || key === 'nights') ? 1 : 0;
        extraQty[key] = Math.max(min, extraQty[key] + delta);
        document.getElementById('qty' + key.charAt(0).toUpperCase() + key.slice(1)).textContent = extraQty[key];
      });
    });
  });

  function openBookingModal(cabinId, dayIndex){
    const cabin = CABINS.find(c => c.id === cabinId);
    pendingBooking = { cabinId, dayIndex, cabin };
    document.getElementById('modalCabinSub').textContent = cabin.name + ' \u00b7 ' + DAYS[dayIndex] + ' \u00b7 ' + peso(cabin.price) + '/ ' + cabin.unit;
    // I-prefill gamit ang totoong detalye ng account na naka-login -
    // puwede pa ring i-edit ng guest kung kailangan (hal. ibang tao ang
    // magbabakasyon gamit ang account nila).
    document.getElementById('guestName').value = sessionUser ? (sessionUser.firstname + ' ' + sessionUser.lastname).trim() : '';
    document.getElementById('guestPhone').value = sessionUser ? (sessionUser.contact_number || '') : '';
    document.getElementById('guestEmail').value = sessionUser ? (sessionUser.email || '') : '';
    resetSteppers();
    const amenBox = document.getElementById('bookingAmenitiesBox');
    const amenList = document.getElementById('bookingAmenities');
    amenList.innerHTML = '';
    (cabin.amenities || []).forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'amenity-chip';
      chip.textContent = name;
      amenList.appendChild(chip);
    });
    amenBox.style.display = (cabin.amenities && cabin.amenities.length) ? '' : 'none';
    document.getElementById('bookingModal').classList.add('open');
  }
  function closeBookingModal(){
    document.getElementById('bookingModal').classList.remove('open');
  }
  document.getElementById('modalCloseX').addEventListener('click', () => { closeBookingModal(); pendingBooking = null; });
  document.getElementById('bookingModal').addEventListener('click', (e) => {
    if (e.target.id === 'bookingModal'){ closeBookingModal(); pendingBooking = null; }
  });
  document.getElementById('modalConfirm').addEventListener('click', () => {
    if (!pendingBooking) return;
    const name = document.getElementById('guestName').value.trim();
    const phone = document.getElementById('guestPhone').value.trim();
    const email = document.getElementById('guestEmail').value.trim();
    if (!name || !phone || !email){ showToast('Please fill in guest name, contact number and email'); return; }
    pendingBooking.guest = { name, phone, email };
    pendingBooking.checkIn = '14:00';
    pendingBooking.checkOut = '12:00';
    pendingBooking.nights = document.getElementById('qtyNights') ? extraQty.nights : 1;
    pendingBooking.persons = document.getElementById('chkPerson').checked ? extraQty.person : 0;
    pendingBooking.blankets = document.getElementById('chkBlanket').checked ? extraQty.blanket : 0;
    pendingBooking.pillows = document.getElementById('chkPillow').checked ? extraQty.pillow : 0;
    closeBookingModal();
    openPaymentModal();
  });

  let uploadedReceiptName = null;
  let uploadedReceiptDataUrl = null;

  function openPaymentModal(){
    document.getElementById('gcashRef').value = '';
    uploadedReceiptName = null;
    uploadedReceiptDataUrl = null;
    document.getElementById('uploadFileName').textContent = '';
    document.getElementById('uploadDrop').classList.remove('dragover');
    document.getElementById('receiptInput').value = '';
    var prevEl = document.getElementById('receiptPreview');
    if (prevEl) { prevEl.src = ''; prevEl.style.display = 'none'; }
    document.getElementById('bankSelect').value = 'bdo';
    document.getElementById('tncCheck').checked = false;
    updateBankDisplay();
    const { total } = computeCharges(pendingBooking.cabin, pendingBooking.persons, pendingBooking.blankets, pendingBooking.pillows, pendingBooking.nights);
    document.getElementById('paymentTotalAmount').textContent = peso(total);
    pendingBooking.paymentMethod = null;
    pendingBooking.gcashRef = '';
    updatePaymentConfirmState();
    document.getElementById('paymentModal').classList.add('open');
  }
  function closePaymentModal(){
    document.getElementById('paymentModal').classList.remove('open');
  }
  const BANKS = {
    bdo: { label:'BDO', className:'bdo' },
    ub:  { label:'UB',  className:'ub'  }
  };
  function updateBankDisplay(){
    const choice = BANKS[document.getElementById('bankSelect').value] || BANKS.bdo;
    const logo = document.getElementById('bankLogo');
    logo.textContent = choice.label;
    logo.className = choice.className;
    if (pendingBooking) pendingBooking.bank = document.getElementById('bankSelect').value;
  }
  document.getElementById('bankSelect').addEventListener('change', updateBankDisplay);
  function updatePaymentConfirmState(){
    const ref = document.getElementById('gcashRef').value.trim();
    const tncOk = document.getElementById('tncCheck').checked;
    const ready = (!!ref || !!uploadedReceiptName) && tncOk;
    document.getElementById('paymentConfirm').disabled = !ready;
    if (pendingBooking) pendingBooking.paymentMethod = ref ? 'GCash' : (uploadedReceiptName ? 'Bank Transfer' : null);
  }
  document.getElementById('tncCheck').addEventListener('change', updatePaymentConfirmState);
  document.getElementById('gcashRef').addEventListener('input', () => {
    if (pendingBooking) pendingBooking.gcashRef = document.getElementById('gcashRef').value.trim();
    updatePaymentConfirmState();
  });

  const uploadDrop = document.getElementById('uploadDrop');
  const receiptInput = document.getElementById('receiptInput');
  function handleReceiptFile(file){
    if (!file) return;
    if (!/image\/(jpeg|png)/.test(file.type)){ showToast('Please upload a JPEG or PNG file'); return; }
    if (file.size > 5 * 1024 * 1024){ showToast('File is larger than 5MB'); return; }
    uploadedReceiptName = file.name;
    document.getElementById('uploadFileName').textContent = file.name;
    updatePaymentConfirmState();

    // Read the actual image so it's sent along with the booking and the
    // admin dashboard can show the real receipt, not just the file name.
    var reader = new FileReader();
    reader.onload = function () {
      uploadedReceiptDataUrl = reader.result;
      var prev = document.getElementById('receiptPreview');
      if (prev) { prev.src = reader.result; prev.style.display = 'block'; }
    };
    reader.readAsDataURL(file);
  }
  uploadDrop.addEventListener('click', (e) => {
    if (e.target.id === 'receiptPreview') { openReceiptZoom(e.target.src); return; }
    receiptInput.click();
  });
  function openReceiptZoom(src){
    var ov = document.createElement('div');
    ov.className = 'receipt-zoom';
    ov.innerHTML = '<img alt="Receipt">';
    ov.firstChild.src = src;
    function close(){ ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev){ if (ev.key === 'Escape') close(); }
    ov.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  }
  receiptInput.addEventListener('change', (e) => handleReceiptFile(e.target.files && e.target.files[0]));
  var qrReal = document.querySelector('.qr-real');
  if (qrReal) qrReal.addEventListener('click', () => openReceiptZoom(qrReal.src));
  uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); uploadDrop.classList.add('dragover'); });
  uploadDrop.addEventListener('dragleave', () => uploadDrop.classList.remove('dragover'));
  uploadDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDrop.classList.remove('dragover');
    handleReceiptFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  document.getElementById('paymentBack').addEventListener('click', () => {
    closePaymentModal();
    document.getElementById('bookingModal').classList.add('open');
  });
  document.getElementById('paymentModal').addEventListener('click', (e) => {
    if (e.target.id === 'paymentModal'){ closePaymentModal(); pendingBooking = null; }
  });
  document.getElementById('paymentConfirm').addEventListener('click', finalizeBooking);

  function computeCharges(cabin, persons, blankets, pillows, nights){
    nights = Math.max(1, Number(nights) || 1);
    const baseRate = cabin.price * nights;
    const extraGuestsCharge = persons * 150 * nights;
    const totalAccommodation = baseRate + extraGuestsCharge;
    const addons = [];
    if (blankets > 0) addons.push({ label: 'Blankets (' + blankets + ')', price: blankets * 50 });
    if (pillows > 0) addons.push({ label: 'Pillows (' + pillows + ')', price: pillows * 50 });
    const addonsTotal = addons.reduce((s, a) => s + a.price, 0);
    const total = totalAccommodation + addonsTotal;
    return { baseRate, extraGuestsCharge, totalAccommodation, addons, addonsTotal, total, nights };
  }

  function finalizeBooking(){
    if (!pendingBooking || !pendingBooking.paymentMethod) return;

    // Iwas double-click at malinaw na ipapakita na "sinasave pa" -
    // dati agad nagsasara ang modal kahit hindi pa tapos mag-save sa
    // server, kaya minsan akala successful pero hindi pala na-save.
    const confirmBtn = document.getElementById('paymentConfirm');
    if (confirmBtn.disabled) return; // nagse-save pa, huwag hayaang mag-double click
    const originalBtnText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sinasave ang booking...';

    const { cabinId, dayIndex, cabin, guest, checkIn: checkInTime, checkOut: checkOutTime, persons, blankets, pillows, paymentMethod, nights } = pendingBooking;

    const checkInDate = getDateForDay(dayIndex);
    const checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkInDate.getDate() + Math.max(1, Number(nights) || 1));

    const { baseRate, extraGuestsCharge, totalAccommodation, addons, addonsTotal, total } = computeCharges(cabin, persons, blankets, pillows, nights);

    const lineItems = [
      { label: cabin.name + ' - ' + cabin.note + ' (' + Math.max(1, Number(nights) || 1) + ' night' + (Math.max(1, Number(nights) || 1) > 1 ? 's' : '') + ')', price: baseRate },
    ];
    if (persons > 0) lineItems.push({ label: persons + ' Extra Person' + (persons > 1 ? 's' : ''), price: extraGuestsCharge });
    lineItems.push(...addons);

    state.reservationSeq += 1;
    const code = 'CMY-' + checkInDate.getFullYear() + '-' + cabin.code + '-' + String(state.reservationSeq).padStart(2, '0');

    const reservation = {
      id: 'r' + Date.now(),
      code,
      cabinId, dayIndex, cabin: cabin.name, icon: cabin.icon, capacity: cabin.note,
      checkInLabel: fmtDate(checkInDate) + ' \u00b7 ' + fmtTime(checkInTime),
      checkOutLabel: fmtDate(checkOutDate) + ' \u00b7 ' + fmtTime(checkOutTime),
      guest, paymentMethod, lineItems, total, status: 'Reserved',
      guestsCount: 1 + persons, baseRate, extraGuestsCharge, totalAccommodation, addons, addonsTotal,
      gcashRef: pendingBooking.gcashRef || '',
      receiptImage: paymentMethod === 'Bank Transfer' ? uploadedReceiptDataUrl : null,
      receiptFileName: paymentMethod === 'Bank Transfer' ? uploadedReceiptName : null
    };

    // MUNA i-save sa server BAGO ipakita bilang successful. Wala munang
    // pag-uupdate ng history/availability/thank-you modal hanggang
    // matiyak na aktwal na na-save ito sa database - dito nagkakamali
    // dati, dahil nagpapakita agad ng "success" kahit pa hindi pa
    // sigurado kung na-save nga sa server.
    apiCall('reservations_create', {
      code: code,
      cabin_id: cabinId,
      cabin_name: cabin.name,
      check_in: toMysqlDateTime(checkInDate, checkInTime),
      check_out: toMysqlDateTime(checkOutDate, checkOutTime),
      guests_count: reservation.guestsCount,
      guest_name: guest.name,
      guest_email: guest.email,
      guest_phone: guest.phone,
      payment_method: paymentMethod,
      total_amount: total,
      data: reservation
    }).then(res => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalBtnText;

      if (!res || !res.success || !res.reservation) {
        // HINDI na-save sa server - huwag ipakita bilang successful.
        showToast((res && res.message) ? res.message : 'Hindi na-save ang booking. Pakisubukan ulit.');
        return;
      }

      // Successful na - ngayon lang natin gagawin ang mga sumusunod.
      reservation.id = 'r' + res.reservation.id;
      reservation.dbId = res.reservation.id;
      state.availability[availKey(cabinId, dayIndex)] = false;
      state.reservations.unshift(reservation);

      renderAccomGrid();
      renderHistory();
      renderNotifications();
      loadNotifications();
      closePaymentModal();

      document.getElementById('thankyouSummary').textContent =
        cabin.name + ', ' + reservation.checkInLabel + ' \u2013 ' + reservation.checkOutLabel + ', paid via ' + paymentMethod + '.';
      document.getElementById('thankyouModal').classList.add('open');
      pendingBooking = null;
    }).catch(() => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalBtnText;
      showToast('Hindi maka-konekta sa server. Pakisubukan ulit.');
    });
  }
  document.getElementById('thankyouDone').addEventListener('click', () => {
    document.getElementById('thankyouModal').classList.remove('open');
    goToView('history');
  });

  function renderHistory(){
    const el = document.getElementById('historyList');
    if (state.reservations.length === 0){
      el.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 8V12L15 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <p><strong>No reservations yet</strong></p>
        <p>Book a spot from Accommodation and it'll show up here.</p>
      </div>`;
      return;
    }
    el.innerHTML = state.reservations.map(r => `
      <div class="resv-card">
        <div class="resv-top">
          <span class="resv-dates">${r.checkInLabel} - ${r.checkOutLabel}</span>
          <span class="resv-pay">PAYMENT METHOD: ${r.paymentMethod.toUpperCase()}</span>
        </div>
        <div class="resv-body">
          <div class="resv-panel">
            <h4>Guest info</h4>
            <span class="ro-label">Name</span>
            <div class="ro-field">${r.guest.name}</div>
            <span class="ro-label">Contact number</span>
            <div class="ro-field">${r.guest.phone}</div>
            <span class="ro-label">Email</span>
            <div class="ro-field">${r.guest.email}</div>
          </div>
          <div class="resv-panel">
            <h4>Payment summary</h4>
            <div class="sum-head"><span>Type</span><span>Price</span></div>
            ${r.lineItems.map(li => `<div class="sum-row"><span>${li.label}</span><span>${peso(li.price)}</span></div>`).join('')}
            <div class="sum-total"><span>Total:</span><span>${peso(r.total)}</span></div>
            ${r.cancelRequested ? '<p style="color:#8a6d1d;font-size:13px;margin:8px 0 0;">Cancellation requested \u2014 waiting for admin review.</p>' : ''}
            <div class="resv-actions">
              ${r.status === 'Cancelled' ? `<button class="btn-cancel-resv" data-id="${r.id}" data-action="delete">Delete</button>` : (r.cancelRequested ? '' : `<button class="btn-cancel-resv" data-id="${r.id}">Cancel booking</button>`)}
              <button class="btn-secondary btn-receipt" data-id="${r.id}" type="button" style="flex:0 0 auto; padding:11px 16px;">Receipt</button>
              <button class="btn-status">${r.cancelRequested ? 'Pending' : r.status}</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-cancel-resv').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = state.reservations.find(x => x.id === btn.dataset.id);
        if (!r) return;
        if (btn.dataset.action === 'delete') {
          if (!confirm('Remove this cancelled booking from your history?')) return;
          let dismissed = [];
          try { dismissed = JSON.parse(localStorage.getItem('campDismissedReservations') || '[]'); } catch (e) { dismissed = []; }
          if (r.dbId && !dismissed.includes(r.dbId)) dismissed.push(r.dbId);
          try { localStorage.setItem('campDismissedReservations', JSON.stringify(dismissed)); } catch (e) {}
          state.reservations = state.reservations.filter(x => x.id !== r.id);
          renderHistory();
          showToast('Removed from your history.');
          return;
        }
        if (!r.dbId) return;
        openCancelReasonModal(r);
      });
    });
    el.querySelectorAll('.btn-receipt').forEach(btn => {
      btn.addEventListener('click', () => openReceipt(btn.dataset.id));
    });
  }

  let cancelReasonTarget = null;

  function openCancelReasonModal(r){
    cancelReasonTarget = r;
    document.querySelectorAll('input[name="cancelReasonChoice"]').forEach(radio => { radio.checked = false; });
    document.getElementById('cancelReasonOtherInput').value = '';
    document.getElementById('cancelReasonOtherWrap').style.display = 'none';
    document.getElementById('cancelReasonConfirm').disabled = true;
    document.getElementById('cancelReasonModal').classList.add('open');
  }
  function closeCancelReasonModal(){
    document.getElementById('cancelReasonModal').classList.remove('open');
    cancelReasonTarget = null;
  }
  document.getElementById('cancelReasonCloseX').addEventListener('click', closeCancelReasonModal);
  document.getElementById('cancelReasonBack').addEventListener('click', closeCancelReasonModal);
  document.getElementById('cancelReasonModal').addEventListener('click', (e) => {
    if (e.target.id === 'cancelReasonModal') closeCancelReasonModal();
  });
  document.querySelectorAll('input[name="cancelReasonChoice"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isOther = radio.value === 'Other' && radio.checked;
      document.getElementById('cancelReasonOtherWrap').style.display = isOther ? 'block' : 'none';
      const otherText = document.getElementById('cancelReasonOtherInput').value.trim();
      document.getElementById('cancelReasonConfirm').disabled = isOther ? otherText === '' : false;
    });
  });
  document.getElementById('cancelReasonOtherInput').addEventListener('input', (e) => {
    const otherSelected = document.querySelector('input[name="cancelReasonChoice"][value="Other"]').checked;
    if (otherSelected) document.getElementById('cancelReasonConfirm').disabled = e.target.value.trim() === '';
  });
  document.getElementById('cancelReasonConfirm').addEventListener('click', () => {
    const r = cancelReasonTarget;
    if (!r) return;
    const picked = document.querySelector('input[name="cancelReasonChoice"]:checked');
    if (!picked) return;
    const reason = picked.value === 'Other' ? document.getElementById('cancelReasonOtherInput').value.trim() : picked.value;
    if (!reason) return;
    const confirmBtn = document.getElementById('cancelReasonConfirm');
    confirmBtn.disabled = true;
    apiCall('reservations_cancel', { id: r.dbId, reason: reason }).then(res => {
      confirmBtn.disabled = false;
      if (!res || !res.success) {
        showToast((res && res.message) || 'Could not send your cancellation request. Please try again.');
        return;
      }
      closeCancelReasonModal();
      showToast('Cancellation request sent \u2014 waiting for admin approval.');
      loadReservations();
    }).catch(() => {
      confirmBtn.disabled = false;
      showToast('Could not reach the server. Please try again.');
    });
  });

  function openReceipt(resId){
    const r = state.reservations.find(x => x.id === resId);
    if (!r) return;
    const el = document.getElementById('receiptCard');
    el.innerHTML = `
      <div class="receipt-head-row">
        <div>
          <p class="receipt-title">Reservation Confirmation</p>
          <div class="receipt-meta">
            Camp Mayagay<br>
            Barangay Sampaloc, Tanay, Philippines
          </div>
        </div>
        <div class="receipt-camp-logo">
          <div class="receipt-logo-mark" role="img" aria-label="Camp Mayagay logo"></div>
          <span>CAMP MAYAGAY</span>
        </div>
      </div>
      <div class="receipt-meta">
        Reservation ID: ${r.code}<br>
        Guest: ${r.guest.name}<br>
        Contact: ${r.guest.phone}<br>
        Email: ${r.guest.email}<br>
        Check-In: ${r.checkInLabel}<br>
        Check-Out: ${r.checkOutLabel}
      </div>
      <hr class="receipt-divider">
      <p class="receipt-section-label">STAY DETAILS</p>
      <div class="receipt-row"><span>Accommodation:</span><span>${r.cabin}</span></div>
      <div class="receipt-row"><span>Capacity:</span><span>${r.capacity}</span></div>
      <div class="receipt-row"><span>Guests:</span><span>${r.guestsCount}</span></div>
      <br>
      <div class="receipt-row"><span>Payment Method:</span><span>${r.paymentMethod.toUpperCase()}</span></div>
      <div class="receipt-row"><span>Status:</span><span>${r.status.toUpperCase()}</span></div>
      <hr class="receipt-divider">
      <p class="receipt-section-label">CHARGE SUMMARY</p>
      <div class="receipt-row"><span>Base Rate:</span><span>${peso(r.baseRate)}</span></div>
      ${r.extraGuestsCharge > 0 ? `<div class="receipt-row"><span>Extra Guests:</span><span>${peso(r.extraGuestsCharge)}</span></div>` : ''}
      <div class="receipt-row bold"><span>Total Accommodation:</span><span>${peso(r.totalAccommodation)}</span></div>
      ${r.addons.length ? `<br><div class="receipt-row"><span>Add-ons:</span><span></span></div>` + r.addons.map(a => `<div class="receipt-row indent"><span>${a.label}:</span><span>${peso(a.price)}</span></div>`).join('') : ''}
      <hr class="receipt-divider">
      <div class="receipt-row bold"><span>Total Estimated Charges:</span><span>${peso(r.total)}</span></div>
      <div class="receipt-actions">
        <button class="btn-print" id="receiptPrintBtn" type="button">Print / Download</button>
      </div>
    `;
    document.getElementById('receiptPrintBtn').addEventListener('click', () => window.print());
    goToView('receipt');
  }
  document.getElementById('receiptBackBtn').addEventListener('click', () => goToView('history'));

  let currentRating = 0;
  const RATING_LABELS = { 1:'Poor', 2:'Fair', 3:'Good', 4:'Very Good', 5:'Excellent' };
  const STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.6 6.2 20.6l1.1-6.6L2.5 9.4l6.6-.9L12 2.5z';

  // Buttons are built ONCE and only their classes/fill are updated, so
  // hovering never replaces the element under the cursor (replacing it
  // made the click get lost, so the chosen rating did not stay).
  function buildStars(){
    const row = document.getElementById('starRow');
    row.innerHTML = [1,2,3,4,5].map(n => `
      <button class="star-btn" data-star="${n}" type="button" aria-label="${n} star${n > 1 ? 's' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="${STAR_PATH}" stroke-linejoin="round"/>
        </svg>
      </button>
    `).join('');
    row.querySelectorAll('[data-star]').forEach(btn => {
      const n = Number(btn.dataset.star);
      btn.addEventListener('click', () => { currentRating = n; renderStars(); });
      btn.addEventListener('mouseenter', () => renderStars(n));
      btn.addEventListener('focus', () => renderStars(n));
      btn.addEventListener('blur', () => renderStars());
    });
    row.addEventListener('mouseleave', () => renderStars());
  }
  function renderStars(hover){
    const row = document.getElementById('starRow');
    if (!row.children.length) buildStars();
    const shown = hover || currentRating;
    row.querySelectorAll('[data-star]').forEach(btn => {
      const n = Number(btn.dataset.star);
      btn.classList.toggle('on', n <= shown);
      btn.setAttribute('aria-pressed', String(n <= currentRating));
      btn.querySelector('svg').setAttribute('fill', n <= shown ? 'currentColor' : 'none');
    });
    const label = document.getElementById('starLabel');
    if (label){
      label.textContent = shown ? `${shown}/5 - ${RATING_LABELS[shown]}` : 'Tap stars to select rating';
      label.classList.toggle('picked', !!shown);
    }
  }
  renderStars();

  document.getElementById('feedbackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const message = document.getElementById('fbMessage').value.trim();
    if (!message) {
      // Dati, tahimik lang itong tumitigil dito kapag walang message -
      // kaya parang walang nangyayari pag pinindot ang Submit. Ngayon,
      // may paalala na para malaman ng guest kung bakit hindi nag-submit.
      showToast('Please write your feedback or concern before submitting.');
      return;
    }
    const accSelect = document.getElementById('fbAccommodation');
    const accommodationId = accSelect ? accSelect.value : '';
    const accommodationName = accSelect && accSelect.value ? accSelect.options[accSelect.selectedIndex].text : '';
    apiCall('feedback_create', { rating: currentRating, message, accommodation_id: accommodationId }).then(res => {
      if (!res || !res.success) {
        showToast((res && res.message) || 'Could not send feedback. Please try again.');
        return;
      }
      state.feedback.unshift({ rating: currentRating, message, accommodationName, when: new Date().toLocaleString() });
      document.getElementById('fbMessage').value = '';
      if (accSelect) accSelect.value = '';
      currentRating = 0;
      renderStars();
      renderFeedback();
      loadTrendingAccommodations();
      showToast('Feedback sent \u2014 thank you');
    }).catch(() => showToast('Could not send feedback. Please try again.'));
  });
  function renderFeedback(){
    const el = document.getElementById('feedbackList');
    if (!state.feedback.length) {
      el.innerHTML = `
        <div class="feedback-empty">
          <svg viewBox="0 0 24 24" fill="none" width="30" height="30"><path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0112 6.5 5.5 5.5 0 0121.5 12c-2.5 4.65-9.5 9-9.5 9Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <p>No feedback sent yet. Your submissions will show up here.</p>
        </div>`;
      return;
    }
    el.innerHTML = state.feedback.map(f => `
      <div class="feedback-entry">
        <div class="fb-entry-top">
          <div class="fb-stars-mini">${'\u2605'.repeat(f.rating)}${'\u2606'.repeat(5-f.rating)}</div>
          <div class="fmeta">${f.when}</div>
        </div>
        ${f.accommodationName ? `<p class="fb-entry-room">Room: ${f.accommodationName}</p>` : ''}
        <p class="fb-entry-msg">${f.message}</p>
        ${f.response ? `
          <div class="fb-admin-reply">
            <p class="fb-admin-reply-label">Response from Camp Mayagay</p>
            <p class="fb-admin-reply-msg">${f.response}</p>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderNotifications(){
    const unreadCount = state.notifications.filter(n => !n.read).length;
    document.getElementById('notifDot').style.display = unreadCount ? 'block' : 'none';

    const list = document.getElementById('notifPageList');
    if (!list) return;
    if (state.notifications.length === 0){
      list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
      return;
    }
    list.innerHTML = state.notifications.map(n => `
      <div class="notif-row ${n.read ? 'read' : 'unread'}" data-id="${n.id}" role="button" tabindex="0">
        <input type="checkbox" class="notif-check" data-id="${n.id}" aria-label="Select notification">
        <span class="notif-sender">Camp Mayagay</span>
        <span class="notif-line"><span class="notif-subject">${escHtml(n.title)}</span><span class="notif-snippet"> - ${escHtml(n.desc)}</span></span>
        <span class="notif-time">${notifShortTime(n)}</span>
        <span class="notif-hover-actions">
          ${n.read ? '' : `<button type="button" class="gm-icon-btn" data-act="read" data-id="${n.id}" title="Mark as read" aria-label="Mark as read"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M3 7l9 6 9-6M3 7v10h18V7M3 7l2-3h14l2 3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>`}
          <button type="button" class="gm-icon-btn" data-act="delete" data-id="${n.id}" title="Delete" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </span>
      </div>
    `).join('');

    document.getElementById('notifSelectAll').checked = false;

    list.querySelectorAll('.notif-row').forEach(row => {
      const open = (e) => {
        if (e.target.closest('.notif-check') || e.target.closest('.notif-hover-actions')) return;
        const n = state.notifications.find(x => x.id === row.dataset.id);
        if (n) openNotifDetail(n);
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    });
    list.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (btn.dataset.act === 'read') markNotifRead(id);
        else deleteNotif(id);
      });
    });
  }
  renderNotifications();

  /* ---- Gmail-style helpers ---- */
  function escHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  // Today -> "3:45 PM", this year -> "Oct 12", older -> "10/12/25"
  function notifShortTime(n){
    const d = new Date(n.created);
    if (isNaN(d.getTime())) return escHtml(n.timestamp || '');
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return d.toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'2-digit' });
  }
  function markNotifRead(id){
    const n = state.notifications.find(x => x.id === id);
    if (!n || n.read) return;
    n.read = true;
    renderNotifications();
    if (/^\d+$/.test(String(id))) apiCall('notifications_mark_read', { ids: [Number(id)] }).catch(() => {});
  }
  function deleteNotif(id){
    state.notifications = state.notifications.filter(x => x.id !== id);
    renderNotifications();
    if (/^\d+$/.test(String(id))) apiCall('notifications_delete', { ids: [Number(id)] }).catch(() => {});
    showToast('Notification deleted');
  }

  /* Full message opens in the page (like opening an email), with a back arrow. */
  let openNotifId = null;
  function openNotifDetail(n){
    openNotifId = n.id;
    document.getElementById('notifDetailTitle').textContent = n.title || 'Notification';
    document.getElementById('notifDetailTime').textContent = n.timestamp || '';
    document.getElementById('notifDetailBody').textContent = n.desc || '';
    document.querySelector('.notif-panel').hidden = true;
    document.getElementById('notifDetailView').hidden = false;
    window.scrollTo({ top:0 });
    markNotifRead(n.id);
  }
  function closeNotifDetail(){
    openNotifId = null;
    const d = document.getElementById('notifDetailView');
    if (d) d.hidden = true;
    const p = document.querySelector('.notif-panel');
    if (p) p.hidden = false;
  }
  document.getElementById('notifDetailBack').addEventListener('click', closeNotifDetail);
  document.getElementById('notifDetailDelete').addEventListener('click', () => {
    if (openNotifId == null) return;
    const id = openNotifId;
    closeNotifDetail();
    deleteNotif(id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openNotifId != null) closeNotifDetail();
  });

  document.getElementById('notifSelectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.notif-check').forEach(cb => cb.checked = e.target.checked);
  });
  document.getElementById('notifMarkReadBtn').addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('.notif-check:checked')).map(cb => cb.dataset.id);
    const ids = checked.length ? checked : state.notifications.map(n => n.id);
    state.notifications.forEach(n => { if (ids.includes(n.id)) n.read = true; });
    renderNotifications();
    const dbIds = ids.filter(id => /^\d+$/.test(String(id))).map(Number);
    apiCall('notifications_mark_read', { ids: dbIds.length ? dbIds : null }).catch(() => {});
    showToast(checked.length ? 'Selected notifications marked as read' : 'All notifications marked as read');
  });
  document.getElementById('notifDeleteBtn').addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('.notif-check:checked')).map(cb => cb.dataset.id);
    const ids = checked.length ? checked : state.notifications.map(n => n.id);
    if (!ids.length) return;
    if (!confirm(checked.length ? 'Delete the selected notifications?' : 'Delete all notifications?')) return;
    state.notifications = state.notifications.filter(n => !ids.includes(n.id));
    renderNotifications();
    const dbIds = ids.filter(id => /^\d+$/.test(String(id))).map(Number);
    apiCall('notifications_delete', { ids: dbIds.length ? dbIds : null }).catch(() => {});
    showToast(checked.length ? 'Selected notifications deleted' : 'All notifications deleted');
  });

  function toggleDropdown(id, others){
    const el = document.getElementById(id);
    const willOpen = !el.classList.contains('open');
    others.forEach(o => document.getElementById(o).classList.remove('open'));
    el.classList.toggle('open', willOpen);
  }
  document.getElementById('notifBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('profileDropdown').classList.remove('open');
    goToView('notifications');
  });
  document.getElementById('profileBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown('profileDropdown', []);
  });
  document.addEventListener('click', () => {
    document.getElementById('profileDropdown').classList.remove('open');
  });

  /* ---------------- HERO SLIDER ---------------- */
  function initHeroSlider(){
    const slides = document.querySelectorAll('.hero-slide');
    const dotsWrap = document.getElementById('heroDots');
    if (!slides.length || !dotsWrap) return;

    let current = 0;
    dotsWrap.innerHTML = Array.from(slides).map((_, i) =>
      `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-slide="${i}" aria-label="Slide ${i+1}"></button>`
    ).join('');
    const dots = dotsWrap.querySelectorAll('.hero-dot');

    function goToSlide(index){
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    let timer = setInterval(() => {
      goToSlide((current + 1) % slides.length);
    }, 5000);

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        clearInterval(timer);
        goToSlide(Number(dot.dataset.slide));
        timer = setInterval(() => goToSlide((current + 1) % slides.length), 5000);
      });
    });
  }

  function goToView(name){
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    if (typeof closeNotifDetail === 'function') closeNotifDetail();
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    window.scrollTo({ top:0, behavior:'smooth' });
    closeSidebar();
  }

  /* ---------------- MOBILE SIDEBAR (hamburger drawer) ---------------- */
  const sidebarEl = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const hamburgerBtn = document.getElementById('hamburgerBtn');

  function openSidebar(){
    if (sidebarEl) sidebarEl.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('show');
  }
  function closeSidebar(){
    if (sidebarEl) sidebarEl.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('show');
  }
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
      if (sidebarEl && sidebarEl.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
  });
  document.getElementById('heroBookBtn').addEventListener('click', () => goToView('accommodation'));
  document.getElementById('viewAllBtn').addEventListener('click', () => goToView('accommodation'));
  document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(CABINS.length / ACCOM_PAGE_SIZE));
    if (accomPage < totalPages - 1) {
      accomPage += 1;
      renderAccomGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.getElementById('prevAccomBtn').addEventListener('click', () => {
    if (accomPage > 0) {
      accomPage -= 1;
      renderAccomGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.querySelectorAll('[data-view-link]').forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.viewLink));
  });
  var helpContactUsBtn = document.getElementById('helpContactUsBtn');
  if (helpContactUsBtn) {
    helpContactUsBtn.addEventListener('click', () => {
      showToast('Call +63 912 345 6789 or email info@campmayagay.ph');
    });
  }
  document.getElementById('saveSettingsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const fullName = document.getElementById('settingsName').value.trim();
    const parts = fullName.split(/\s+/);
    const firstname = parts.shift() || '';
    const lastname = parts.join(' ') || '';
    apiCall('profile_update', {
      firstname: firstname,
      lastname: lastname,
      contact_number: document.getElementById('settingsContact').value.trim(),
      address: document.getElementById('settingsLocation').value.trim()
    }).then(res => {
      if (res && res.success) {
        // FIX: dati, wala talagang nag-se-save ng photo kahit saan kapag
        // pinindot ang "Save changes" - dun nangyayari ang bug. Kaya dito
        // natin i-persist sa localStorage ang napiling photo (kung meron)
        // bago mag-loadSession(), para hindi na siya mawala pag-reload.
        if (pendingAvatarPhoto) {
          apiCall('profile_photo_update', { photo: pendingAvatarPhoto }).then(photoRes => {
            pendingAvatarPhoto = null;
            if (!photoRes || !photoRes.success) {
              showToast((photoRes && photoRes.message) || 'Settings saved, but the photo could not be uploaded.');
            }
            loadSession();
          }).catch(() => {
            pendingAvatarPhoto = null;
            showToast('Settings saved, but the photo could not be uploaded.');
            loadSession();
          });
        } else {
          loadSession();
        }
        showToast('Settings saved');
      } else {
        showToast((res && res.message) || 'Could not save settings.');
      }
    }).catch(() => showToast('Could not save settings.'));
  });
  document.getElementById('discardSettingsBtn').addEventListener('click', () => {
    pendingAvatarPhoto = null;
    loadSession();
    showToast('Changes discarded');
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = 'php/logout.php';
  });
  var dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  if (dropdownLogoutBtn) {
    dropdownLogoutBtn.addEventListener('click', () => {
      window.location.href = 'php/logout.php';
    });
  }
  document.getElementById('passwordOkBtn').addEventListener('click', () => {
    var errorEl = document.getElementById('passwordChangeError');
    var okBtn = document.getElementById('passwordOkBtn');
    errorEl.textContent = '';

    var currentPassword = document.getElementById('currentPasswordInput').value;
    var newPassword = document.getElementById('newPasswordInput').value;
    var confirmPassword = document.getElementById('confirmNewPasswordInput').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      errorEl.textContent = 'Please fill in all password fields.';
      return;
    }
    if (newPassword.length < 8) {
      errorEl.textContent = 'New password must be at least 8 characters.';
      return;
    }
    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'New password and confirmation do not match.';
      return;
    }

    okBtn.disabled = true;
    apiCall('change_password', {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    }).then(res => {
      if (res && res.success) {
        document.getElementById('currentPasswordInput').value = '';
        document.getElementById('newPasswordInput').value = '';
        document.getElementById('confirmNewPasswordInput').value = '';
        showToast('Password updated');
      } else {
        errorEl.textContent = (res && res.message) || 'Could not update password.';
      }
    }).catch(() => {
      errorEl.textContent = 'Unable to reach the server. Please try again.';
    }).finally(() => {
      okBtn.disabled = false;
    });
  });

  document.querySelectorAll('.pw-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.dataset.target);
      if (!input) return;
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      btn.innerHTML = isHidden
        ? '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M3 3L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.6 5.1C11 5.05 11.5 5 12 5C16 5 20 8 22 12C21.4 13.2 20.6 14.3 19.7 15.2M6.5 6.6C4.6 7.9 3 9.7 2 12C4 16 8 19 12 19C13.4 19 14.7 18.7 15.9 18.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.9 10C9.3 10.5 9 11.2 9 12C9 13.7 10.3 15 12 15C12.8 15 13.5 14.7 14 14.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M2 12C4 7 8 4 12 4S20 7 22 12C20 17 16 20 12 20S4 17 2 12Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>';
    });
  });
  document.getElementById('avatarInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingAvatarPhoto = reader.result;
      document.getElementById('avatarCircle').innerHTML = `<img src="${reader.result}" alt="Profile photo">`;
      showToast("Photo selected — click 'Save changes' to apply it.");
    };
    reader.readAsDataURL(file);
  });
  const validIdInput = document.getElementById('validIdInput');
  if (validIdInput) {
    validIdInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/image\/(jpeg|png)/.test(file.type)) { showToast('Please upload a JPEG or PNG file'); return; }
      if (file.size > 5 * 1024 * 1024) { showToast('File is larger than 5MB'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        apiCall('valid_id_upload', { photo: reader.result }).then(res => {
          if (res && res.success) {
            showToast('Valid ID submitted for review');
            loadSession();
          } else {
            showToast((res && res.message) || 'Could not upload your ID. Please try again.');
          }
        }).catch(() => showToast('Could not upload your ID. Please try again.'));
      };
      reader.readAsDataURL(file);
    });
  }
  const themeToggleInput = document.getElementById('themeToggleInput');
  const THEME_KEY = 'campMayagayTheme';

  function applyTheme(isDark){
    document.body.classList.toggle('dark-mode', isDark);
    if (themeToggleInput) themeToggleInput.checked = isDark;
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  }

  const savedTheme = localStorage.getItem(THEME_KEY);
  applyTheme(savedTheme === 'dark');

  if (themeToggleInput) {
    themeToggleInput.addEventListener('change', () => {
      applyTheme(themeToggleInput.checked);
    });
  }

 function openNativePicker(inputEl){
  if (typeof inputEl.showPicker === 'function') {
    try { inputEl.showPicker(); } catch (err) { inputEl.focus(); }
  } else {
    inputEl.focus();
  }
}
monthPill.addEventListener('click', () => openNativePicker(monthInput));
dayPill.addEventListener('click', () => openNativePicker(dayInput));

  function applyDateFilter(){
    if (dayInput.value){
      monthInput.value = dayInput.value.slice(0,7);
    }
    const key = monthInput.value || dayInput.value.slice(0,7) || state.selectedDate.slice(0,7);
    const fullKey = key + (dayInput.value ? dayInput.value.slice(7) : '');
    state.availability = buildAvailability();
    renderAccomGrid();

    monthLabel.textContent = monthInput.value
      ? new Date(monthInput.value + '-01').toLocaleDateString(undefined,{month:'short', year:'numeric'})
      : 'Month';
    monthPill.classList.toggle('filled', !!monthInput.value);

    dayLabel.textContent = dayInput.value
      ? new Date(dayInput.value + 'T00:00').toLocaleDateString(undefined,{month:'short', day:'numeric'})
      : 'Day';
    dayPill.classList.toggle('filled', !!dayInput.value);

    const label = dayInput.value ? new Date(dayInput.value + 'T00:00').toLocaleDateString(undefined,{month:'long', day:'numeric', year:'numeric'})
      : monthInput.value ? new Date(monthInput.value + '-01').toLocaleDateString(undefined,{month:'long', year:'numeric'})
      : 'this week';
    document.getElementById('filterNote').textContent = 'Showing availability for ' + label + '.';
  }
  monthInput.addEventListener('change', applyDateFilter);
  dayInput.addEventListener('change', applyDateFilter);
  document.getElementById('clearDateBtn').addEventListener('click', () => {
    monthInput.value = '';
    dayInput.value = '';
    applyDateFilter();
  });

  let pendingAvatarPhoto = null; 

  let toastTimer = null;
  function showToast(msg){
    const el = document.getElementById('toast');
    document.getElementById('toastText').textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------------- WEATHER WIDGET (live, auto-updating) ----------------
     Gumagamit ng Open-Meteo API (libre, walang kailangang API key) para
     awtomatikong ma-update ang temperature/description sa sidebar, base
     sa coordinates ng Barangay Sampaloc, Tanay, Rizal. Kung mabigo ang
     fetch (hal. walang internet), mananatili na lang ang default text
     na naka-hardcode sa HTML - hindi masisira ang page. */
  function weatherCodeToText(code){
    const WEATHER_CODES = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Foggy',
      51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      56: 'Freezing drizzle', 57: 'Freezing drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
      66: 'Freezing rain', 67: 'Freezing rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
      85: 'Snow showers', 86: 'Snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail'
    };
    return WEATHER_CODES[code] || 'Weather update';
  }

  function loadWeather(){
    // Approximate coordinates for Barangay Sampaloc, Tanay, Rizal.
    const lat = 14.5825;
    const lon = 121.3702;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lat + '&longitude=' + lon
      + '&current=temperature_2m,weather_code&timezone=Asia%2FManila';

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data || !data.current) return;
        const tempEl = document.getElementById('weatherTemp');
        const descEl = document.getElementById('weatherDesc');
        if (tempEl) tempEl.textContent = Math.round(data.current.temperature_2m) + '\u00b0C';
        if (descEl) descEl.textContent = weatherCodeToText(data.current.weather_code);
      })
      .catch(() => {
        // Tahimik na mananatili ang default na "28°C / Partly cloudy" na
        // nasa HTML kung sakaling walang internet o nag-timeout ang API.
      });
  }

  /* ---------------- ROLE PERMISSIONS (hides nav items the admin
     turned off for the "guest" role in Security Management) ---------------- */
  function applyMyPermissions(){
    apiCall('my_permissions', {}).then(res => {
      if (!res || !res.success || !res.permissions) return;
      const perms = res.permissions;

      const navMap = {
        accommodation: 'accommodation',
        history: 'reservation',
        feedback: 'feedback',
        settings: 'settings'
      };

      Object.keys(navMap).forEach(viewName => {
        const moduleKey = navMap[viewName];
        const btn = document.querySelector('.nav-item[data-view="' + viewName + '"]');
        if (!btn) return;
        const allowed = perms[moduleKey] !== false;
        btn.style.display = allowed ? '' : 'none';
        if (!allowed && btn.classList.contains('active')) {
          goToView('home');
        }
      });

      const notifBtn = document.getElementById('notifBtn');
      if (notifBtn) notifBtn.style.display = (perms.notifications !== false) ? '' : 'none';
    }).catch(() => {});
  }

  loadAccommodationsForGuest().then(() => {
    renderHomeCards();
    loadFavorites();
    return loadAvailability();
  }).then(() => {
    state.availability = buildAvailability();
    renderAccomGrid();
  });
  renderHistory();
  renderFeedback();
  loadSession();
  loadReservations().then(populateFeedbackAccommodationSelect);
  loadFeedback();
  loadAllFeedback();
  loadTrendingAccommodations();
  const allFeedbackRatingFilter = document.getElementById('allFeedbackRatingFilter');
  if (allFeedbackRatingFilter) allFeedbackRatingFilter.addEventListener('change', renderAllFeedback);
  const allFeedbackAccommodationFilter = document.getElementById('allFeedbackAccommodationFilter');
  if (allFeedbackAccommodationFilter) allFeedbackAccommodationFilter.addEventListener('change', renderAllFeedback);
  loadNotifications();
  loadWeather();
  applyMyPermissions();
  initHeroSlider();

  /* Draggable "Need Help?" floating button - nagsa-snap sa kaliwa/kanang
     gilid pag binitawan, hindi kasabay mag-scroll ang page habang
     hinihila ito, at awtomatikong inaayos ang posisyon (hindi na
     matatago sa likod ng bottom tab bar o lalabas sa screen) kahit
     magbago ang laki ng window, hal. pagbukas/pagsara ng DevTools */
  (function initHelpWidgetDrag(){
    var widget = document.querySelector('.help-widget');
    var fab = document.querySelector('.help-widget-fab');
    if (!widget || !fab) return;
    var dragging = false, moved = false, startX, startY, startLeft, startTop;

    function pointFromEvent(e){ return e.touches ? e.touches[0] : e; }

    function bottomReserve(){
      var tabbar = document.querySelector('.mobile-tabbar');
      if (tabbar && getComputedStyle(tabbar).display !== 'none') {
        return tabbar.offsetHeight + 12;
      }
      return 4;
    }

    function clampToViewport(){
      var reserve = bottomReserve();
      var maxLeft = Math.max(4, window.innerWidth - widget.offsetWidth - 4);
      var maxTop = Math.max(4, window.innerHeight - widget.offsetHeight - reserve);
      if (widget.style.left && widget.style.left !== 'auto') {
        widget.style.left = Math.min(Math.max(parseFloat(widget.style.left) || 4, 4), maxLeft) + 'px';
      }
      if (widget.style.top && widget.style.top !== 'auto') {
        widget.style.top = Math.min(Math.max(parseFloat(widget.style.top) || 4, 4), maxTop) + 'px';
      }
    }

    function onMove(e){
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      var p = pointFromEvent(e);
      var dx = p.clientX - startX;
      var dy = p.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      var reserve = bottomReserve();
      var newLeft = Math.min(Math.max(startLeft + dx, 4), window.innerWidth - widget.offsetWidth - 4);
      var newTop = Math.min(Math.max(startTop + dy, 4), window.innerHeight - widget.offsetHeight - reserve);
      widget.style.left = newLeft + 'px';
      widget.style.top = newTop + 'px';
    }
    function onUp(){
      dragging = false;
      fab.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      if (moved) {
        var rect = widget.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var snapRight = centerX > window.innerWidth / 2;
        var reserve = bottomReserve();
        var topPx = Math.min(Math.max(rect.top, 4), window.innerHeight - widget.offsetHeight - reserve);
        widget.style.transition = 'left 0.25s ease, right 0.25s ease';
        widget.style.top = topPx + 'px';
        widget.style.bottom = 'auto';
        if (snapRight) {
          widget.style.right = '16px';
          widget.style.left = 'auto';
        } else {
          widget.style.left = '16px';
          widget.style.right = 'auto';
        }
        setTimeout(function () { widget.style.transition = ''; }, 260);
        try {
          localStorage.setItem('helpWidgetPos', JSON.stringify({ side: snapRight ? 'right' : 'left', top: topPx + 'px' }));
        } catch (err) {}
      }
    }
    function onDown(e){
      dragging = true; moved = false;
      var p = pointFromEvent(e);
      startX = p.clientX; startY = p.clientY;
      var rect = widget.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      widget.style.left = startLeft + 'px';
      widget.style.top = startTop + 'px';
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      fab.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchend', onUp);
    }
    fab.addEventListener('mousedown', onDown);
    fab.addEventListener('touchstart', onDown, { passive: true });
    fab.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); moved = false; }
    });

    try {
      var saved = JSON.parse(localStorage.getItem('helpWidgetPos'));
      if (saved && saved.side && saved.top) {
        widget.style.top = saved.top;
        widget.style.bottom = 'auto';
        if (saved.side === 'right') { widget.style.right = '16px'; widget.style.left = 'auto'; }
        else { widget.style.left = '16px'; widget.style.right = 'auto'; }
        clampToViewport();
      }
    } catch (err) {}

    window.addEventListener('resize', clampToViewport);
  })();

})();

function confirmLogout() {
  const confirmAction = confirm("Are you sure you want to logout from your Camp Mayagay account?");
  if (confirmAction) {
    window.location.href = 'php/logout.php';
  }
}