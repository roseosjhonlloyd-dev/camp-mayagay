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
      avgRating: a.avg_rating != null ? Number(a.avg_rating) : null,
      ratingCount: Number(a.rating_count) || 0,
      amenities: Array.isArray(a.amenities) ? a.amenities : ['Complete beddings', 'Kettle', 'Plates', 'Mugs']
    };
  }

  const state = {
    selectedDate: '',
    availability: {},
    reservations: [],
    bookedAccIds: [],
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
        setTimeout(() => { window.location.href = 'index.html'; }, 1800);
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
          ? `<img src="${savedPhoto}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.replaceWith(document.createTextNode(${JSON.stringify(initials || 'G')}))">`
          : (initials || 'G');
      }
      const avatarCircle = document.getElementById('avatarCircle');
      if (avatarCircle) {
        avatarCircle.innerHTML = savedPhoto
          ? `<img src="${savedPhoto}" alt="" onerror="this.replaceWith(document.createTextNode(${JSON.stringify(initials || 'G')}))">`
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

    }).catch(() => {});
  }
  function loadReservations(){
    return apiCall('reservations_list', {}).then(res => {
      if (!res || !res.success) return;
      let dismissedResIds = [];
      try { dismissedResIds = JSON.parse(localStorage.getItem('campDismissedReservations') || '[]'); } catch (e) { dismissedResIds = []; }
      // Rooms na talagang na-book ng guest (confirmed o completed) - ito lang
      // ang puwedeng i-rate sa Feedback. Hindi apektado ng "dismissed" sa history.
      state.bookedAccIds = Array.from(new Set((res.reservations || [])
        .filter(row => ['confirmed', 'completed'].includes(String(row.status || '').toLowerCase()))
        .map(row => Number(row.accommodation_id))
        .filter(Boolean)));
      state.reservations = (res.reservations || []).filter(row => !dismissedResIds.includes(row.id)).map(row => {
        const saved = row.data || {};
        return Object.assign({}, saved, {
          id: 'r' + row.id,
          dbId: row.id,
          accId: row.accommodation_id ? Number(row.accommodation_id) : null,
          code: saved.code || row.code || '',
          status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
          createdAt: row.created_at || '',
          cancelRequested: !!row.cancel_requested,
          cancelReason: row.cancel_reason || '',
          guest: saved.guest || { name: row.guest_name, email: row.guest_email, phone: row.guest_phone },
          cabin: saved.cabin || row.cabin_name,
          total: saved.total || Number(row.total_amount),
          paymentMethod: saved.paymentMethod || row.payment_method || '',
          checkInLabel: saved.checkInLabel || row.check_in,
          checkOutLabel: saved.checkOutLabel || row.check_out,
          lineItems: saved.lineItems || [{ label: row.cabin_name, price: Number(row.total_amount) }],
          amountPaid: Number(row.amount_paid) || 0,
          payStatus: row.payment_status || 'unpaid'
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

  /** Fills the "Which room are you rating?" select with ONLY the rooms this
   *  guest has actually booked (confirmed/completed reservations). */
  function populateFeedbackAccommodationSelect(){
    const select = document.getElementById('fbAccommodation');
    if (!select) return;
    const current = select.value;
    const booked = ACCOMMODATIONS_RAW.filter(a => state.bookedAccIds.includes(Number(a.accommodation_id)));
    const note = document.getElementById('fbRoomNote');
    if (!booked.length){
      select.innerHTML = '<option value="">No booked rooms yet</option>';
      select.disabled = true;
      if (note) note.textContent = 'Book a room first so you can rate it. Only rooms you have booked can be rated.';
      return;
    }
    select.disabled = false;
    let options = '<option value="">Select a room you booked</option>';
    booked.forEach(a => {
      options += `<option value="${a.accommodation_id}">${escHtml(a.accommodation_name)}</option>`;
    });
    select.innerHTML = options;
    if (current && booked.some(a => String(a.accommodation_id) === current)) select.value = current;
    if (note) note.textContent = 'Only the rooms you have booked are listed here.';
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

  // ---- Accommodation photo slider -----------------------------------
  const ACCOM_EXTRA_DIR = 'assets/images/accommodations/';
  const ACCOM_EXTRA_PHOTOS = {
    nipahut1:  ['Nipa1 inside.jfif'],
    nipahut2:  ['Nipahut2 inside.jpg'],
    nipahut3:  ['Nipahut3 inside.jpg'],
    nipahut4:  ['Nipahut 4 inside.png'],
    glassdoor: ['Glassdoor inside1.jpg', 'Glassdoor inside2.jpg', 'Glassdoor inside3.jpg'],
    bighouse2: ['Bighouse 2 inside1.jpg', 'Bighouse 2 inside2.jpg', 'Bighouse 2 inside3.jpg']
  };
  function extraPhotosFor(cabin){
    const n = String(cabin.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key in ACCOM_EXTRA_PHOTOS){
      if (n.indexOf(key) === 0) return ACCOM_EXTRA_PHOTOS[key].map(f => ACCOM_EXTRA_DIR + f);
    }
    return [];
  }
  function accomSlider(cabin){
    const slides = (cabin.image ? [cabin.image] : []).concat(extraPhotosFor(cabin));
    if (!slides.length) return artContent(cabin);
    const imgs = slides.map((src, i) =>
      `<img class="slide${i === 0 ? ' active' : ''}" src="${encodeURI(src)}" alt="${cabin.name}" onerror="this.remove()">`
    ).join('');
    return imgs +
      '<button type="button" class="slide-btn slide-prev" aria-label="Previous photo">&#10094;</button>' +
      '<button type="button" class="slide-btn slide-next" aria-label="Next photo">&#10095;</button>' +
      '<div class="slide-dots"></div>';
  }
  function refreshSlider(art){
    const imgs = art.querySelectorAll('img.slide');
    if (imgs.length && !art.querySelector('img.slide.active')) imgs[0].classList.add('active');
    const multi = imgs.length > 1;
    art.querySelectorAll('.slide-btn').forEach(b => { b.style.display = multi ? '' : 'none'; });
    const dots = art.querySelector('.slide-dots');
    if (dots){
      const cur = Array.prototype.findIndex.call(imgs, im => im.classList.contains('active'));
      dots.innerHTML = multi ? Array.prototype.map.call(imgs, (im, i) => `<span class="${i === cur ? 'on' : ''}"></span>`).join('') : '';
    }
  }
  function moveSlide(art, delta){
    const imgs = art.querySelectorAll('img.slide');
    if (imgs.length < 2) return;
    let cur = Array.prototype.findIndex.call(imgs, im => im.classList.contains('active'));
    if (cur < 0) cur = 0;
    imgs[cur].classList.remove('active');
    imgs[(cur + delta + imgs.length) % imgs.length].classList.add('active');
    refreshSlider(art);
  }
  // ---- Fullscreen photo viewer (click a photo) -----------------------
  function openAccomLightbox(art){
    const imgs = Array.prototype.slice.call(art.querySelectorAll('img.slide'));
    if (!imgs.length) return;
    let idx = Math.max(0, imgs.findIndex(im => im.classList.contains('active')));
    const name = imgs[0].alt || '';
    const box = document.createElement('div');
    box.className = 'accom-lb';
    box.innerHTML = '<button type="button" class="lb-close" aria-label="Close">&times;</button>' +
      '<button type="button" class="lb-nav lb-prev" aria-label="Previous">&#10094;</button>' +
      '<img class="lb-img" alt="">' +
      '<button type="button" class="lb-nav lb-next" aria-label="Next">&#10095;</button>' +
      '<div class="lb-count"></div>';
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    const big = box.querySelector('.lb-img');
    const count = box.querySelector('.lb-count');
    function show(){
      big.src = imgs[idx].src;
      big.alt = name;
      count.textContent = name + ' \u00b7 ' + (idx + 1) + ' / ' + imgs.length;
      box.classList.toggle('single', imgs.length < 2);
    }
    function go(d){ idx = (idx + d + imgs.length) % imgs.length; show(); }
    function close(){
      document.removeEventListener('keydown', onKey);
      box.remove();
      document.body.style.overflow = '';
      refreshSlider(art);
    }
    function onKey(e){
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', e => {
      if (e.target.closest('.lb-close') || e.target === box) close();
      else if (e.target.closest('.lb-prev')) go(-1);
      else if (e.target.closest('.lb-next')) go(1);
    });
    let sx = null;
    box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    });
    show();
  }
  function initAccomSliders(grid){
    if (!grid.dataset.sliderReady){
      grid.dataset.sliderReady = '1';
      grid.addEventListener('click', e => {
        const im = e.target.closest('img.slide');
        if (im) openAccomLightbox(im.closest('.accom-art'));
      });
      grid.addEventListener('click', e => {
        const btn = e.target.closest('.slide-btn');
        if (!btn) return;
        moveSlide(btn.closest('.accom-art'), btn.classList.contains('slide-next') ? 1 : -1);
      });
      let startX = null;
      grid.addEventListener('touchstart', e => {
        startX = e.target.closest('.accom-art') ? e.touches[0].clientX : null;
      }, { passive: true });
      grid.addEventListener('touchend', e => {
        const art = e.target.closest('.accom-art');
        if (startX === null || !art) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) moveSlide(art, dx < 0 ? 1 : -1);
      });
      grid.addEventListener('error', e => {
        const art = e.target.closest && e.target.closest('.accom-art');
        if (art) setTimeout(() => refreshSlider(art), 0);
      }, true);
    }
    grid.querySelectorAll('.accom-art').forEach(refreshSlider);
  }

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

  /* Blanket / pillow stock per night (server keeps the daily limits). */
  let inventory = { items: [], limits: {}, remaining: {} };
  function loadInventory(){
    return apiCall('inventory_list', {}).then(res => {
      if (res && res.success){
        inventory = { items: res.items || [], limits: res.limits || {}, remaining: res.remaining || {} };
        if (document.getElementById('rentalRows')) renderRentalRows();
      }
    }).catch(() => {});
  }
  function stockLeft(dateKey, item){
    const r = inventory.remaining[dateKey];
    return r && typeof r[item] === 'number' ? r[item] : inventory.limits[item];
  }
  function isBookedOn(cabinId, dayKey){
    return realBookings.some(b => b.slug === cabinId &&
      String(b.check_in).slice(0, 10) <= dayKey && dayKey < String(b.check_out).slice(0, 10));
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

 
  /* Home card: average guest rating (replaces the old favorites heart). */
  function ratingWrapHtml(c){
    if (c.avgRating == null){
      return '<span class="rate-wrap none" title="No guest ratings yet"><span class="rate-star">&#9733;</span><span class="rate-none">No ratings yet</span></span>';
    }
    const n = c.ratingCount || 0;
    return '<span class="rate-wrap" title="Average guest rating"><span class="rate-star">&#9733;</span>' +
      '<span class="rate-val">' + c.avgRating.toFixed(1) + '</span>' +
      '<span class="rate-count">(' + n + ')</span></span>';
  }
  /* Re-read the ratings from the server and refresh Home + Accommodation views. */
  function refreshRatings(){
    return apiCall('accommodations_list', {}).then(res => {
      if (!res || !res.success) return;
      const bySlug = {};
      (res.accommodations || []).forEach(a => { bySlug[a.slug] = a; });
      CABINS.forEach(c => {
        const a = bySlug[c.id];
        if (!a) return;
        c.avgRating = a.avg_rating != null ? Number(a.avg_rating) : null;
        c.ratingCount = Number(a.rating_count) || 0;
      });
      renderHomeCards();
      const accomGrid = document.getElementById('accomGrid');
      if (accomGrid && accomGrid.children.length) renderAccomGrid();
    }).catch(() => {});
  }
  /* Rating pill (kapareho ng nasa Accommodation page). */
  function ratingPillHtml(c){
    return c.avgRating != null
      ? '<span class="acc2-rating" title="Average guest rating"><span class="acc2-star">&#9733;</span>' + c.avgRating.toFixed(1) + ' <small>(' + c.ratingCount + ')</small></span>'
      : '<span class="acc2-rating none" title="No guest ratings yet"><span class="acc2-star">&#9733;</span>No ratings yet</span>';
  }

  function renderHomeCards(){
    const grid = document.getElementById('homeCardGrid');
    // Ranked by guest rating: pinakamataas na average muna, tapos mas maraming
    // reviews, tapos original order. Walang rating = nasa dulo. Top 4 ang ipinapakita.
    const ranked = CABINS.map((c, i) => ({ c, i }))
      .sort((x, y) => {
        const rx = x.c.avgRating, ry = y.c.avgRating;
        if ((rx == null) !== (ry == null)) return rx == null ? 1 : -1;
        if (rx != null && ry != null && ry !== rx) return ry - rx;
        return ((y.c.ratingCount || 0) - (x.c.ratingCount || 0)) || (x.i - y.i);
      })
      .slice(0, 4).map(x => x.c);
    grid.innerHTML = ranked.map((c, idx) => {
      const rank = c.avgRating != null ? '<span class="home-rank" title="Rating rank">#' + (idx + 1) + '</span>' : '';
      return `
      <div class="cabin-card">
        <div class="cabin-art" style="background:${ART_BG[c.icon]}">${artContent(c)}</div>
        <div class="cabin-body">
          <p class="cabin-name">${rank}${c.name}</p>
          <p class="cabin-note">${c.note}</p>
          <div class="cabin-foot">
            <span class="cabin-price">${peso(c.price)}/ ${c.unit}</span>
            ${ratingPillHtml(c)}
          </div>
          <button class="book-now-btn" type="button" data-booknow="${c.id}">Book now</button>
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-booknow]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); bookNow(btn.dataset.booknow); });
    });
    grid.querySelectorAll('.cabin-card').forEach((card, i) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => openAccDetails(ranked[i].id));
    });
    grid.querySelectorAll('[data-reviews]').forEach(btn => {
      btn.addEventListener('click', () => openAccReviews(Number(btn.dataset.reviews)));
    });
  }

  /* First open day in the current availability view, or -1 if none. */
  function firstAvailableDay(cabinId){
    for (let i = 0; i < DAYS.length; i++){
      const dt = getDateForDay(i);
      if (keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()) < todayKey()) continue;
      if (state.availability[availKey(cabinId, i)]) return i;
    }
    return -1;
  }
  /* "Book now": go straight to the booking form for this accommodation. */
  function bookNow(cabinId){
    closeAccDetails();
    const day = firstAvailableDay(cabinId);
    // Walang bakante this week? Buksan pa rin ang booking form para makapili ng ibang araw (next week).
    openBookingModal(cabinId, day < 0 ? 0 : day);
  }

  /* Details of an accommodation (photos, amenities, price, open days). */
  function openAccDetails(cabinId, simple){
    const c = CABINS.find(x => x.id === cabinId);
    if (!c) return;
    const body = document.getElementById('accDetailsBody');
    body.innerHTML = `
      <div class="accom-art acc-details-art" style="background:${ART_BG[c.icon]}">${accomSlider(c)}</div>
      <div class="acc-details-info">
        <h3>${c.name}</h3>
        <p class="accom-note">${c.note || ''}</p>
        <p class="acc-details-price">${peso(c.price)}/ ${c.unit}</p>
        <p class="ro-label" style="margin:12px 0 6px;">Amenities</p>
        <div class="amenity-list">${(c.amenities || []).map(a => `<span class="amenity-chip">${a}</span>`).join('')}</div>
        <p class="ro-label" style="margin:14px 0 6px;">Check-in and check-out</p>
        <div class="amenity-list"><span class="amenity-chip">Check-in: 2:00 PM</span><span class="amenity-chip">Check-out: 12:00 NN</span></div>
        ${simple ? '' : `<button class="btn-primary acc-details-book" type="button" data-booknow="${c.id}">Book now</button>`}
      </div>`;
    initAccomSliders(body);
    body.querySelectorAll('.accom-art').forEach(refreshSlider);
    const bookBtn = body.querySelector('[data-booknow]');
    if (bookBtn) bookBtn.addEventListener('click', () => bookNow(c.id));
    document.getElementById('accDetailsModal').classList.add('open');
  }
  function closeAccDetails(){
    const m = document.getElementById('accDetailsModal');
    if (m) m.classList.remove('open');
  }
  (function(){
    const x = document.getElementById('accDetailsCloseX');
    if (x) x.addEventListener('click', closeAccDetails);
    const m = document.getElementById('accDetailsModal');
    if (m) m.addEventListener('click', (e) => { if (e.target.id === 'accDetailsModal') closeAccDetails(); });
  })();

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

  /* True when this day of the shown week has already passed. */
  function isPastDay(i){
    const d = getDateForDay(i);
    return keyOf(d.getFullYear(), d.getMonth(), d.getDate()) < todayKey();
  }
  function availSummaryHtml(c){
    let a = 0;
    DAYS.forEach((d, i) => { if (state.availability[availKey(c.id, i)]) a++; });
    return `<p class="accom-avail-line"><span class="av-dot ok"></span>Available: ${a} day${a === 1 ? '' : 's'} <span class="av-dot no"></span>Booked: ${DAYS.length - a} day${DAYS.length - a === 1 ? '' : 's'}</p>`;
  }
  /* ---------- Accommodation page (v2): filters, week strip, summary bar ---------- */
  let accomFilter = 'all';
  let accSelected = null;   // { cabinId, dayIndex } set by "Book now" - shown in the summary bar
  function cabinMatchesFilter(c){
    switch (accomFilter){
      case 'nipa':      return c.icon === 'hut';
      case 'rooms':     return c.icon === 'glass' || c.icon === 'house';
      case 'tent':      return c.icon === 'tent';
      case 'available': return DAYS.some((d, i) => !isPastDay(i) && state.availability[availKey(c.id, i)]);
      default:          return true;
    }
  }
  function filteredCabins(){ return CABINS.filter(cabinMatchesFilter); }
  /* A day that is already over (before today) is greyed out and can no longer be booked. */
  function isPastDay(i){ return toLocalDateKey(getDateForDay(i)) < todayKey(); }
  function weekAvailCount(c){
    let n = 0;
    DAYS.forEach((d, i) => { if (!isPastDay(i) && state.availability[availKey(c.id, i)]) n++; });
    return n;
  }
  function availBadgeText(c){
    const n = weekAvailCount(c);
    const remaining = DAYS.filter((d, i) => !isPastDay(i)).length;
    if (remaining === 0) return 'Week ended';
    if (n === remaining) return 'Fully available';
    if (n === 0) return 'Fully booked';
    return n + ' day' + (n === 1 ? '' : 's') + ' left';
  }
  function maxGuestsOf(c){
    const m = /(\d+)\s*pax/i.exec(c.note || '');
    return m ? Number(m[1]) : 0;
  }
  function shortDate(d){ return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }); }

  function updateAccSummary(){
    const bar = document.getElementById('accSummary');
    if (!bar) return;
    let c = null, day = -1;
    if (accSelected){
      c = CABINS.find(x => x.id === accSelected.cabinId);
      day = c ? firstAvailableDay(c.id) : -1;
    }
    if (!c || day < 0){ accSelected = null; bar.hidden = true; return; }
    accSelected.dayIndex = day;
    const inDate = getDateForDay(day);
    const outDate = new Date(inDate); outDate.setDate(outDate.getDate() + 1);
    const guests = maxGuestsOf(c);
    document.getElementById('accSummaryTitle').textContent = c.name + ' · 1 night';
    document.getElementById('accSummarySub').textContent =
      shortDate(inDate) + ' → ' + shortDate(outDate) +
      (guests ? ' · ' + guests + ' guest' + (guests === 1 ? '' : 's') : '') +
      ' · 50% down payment ' + peso(Math.round(c.price * 0.5));
    bar.hidden = false;
  }

  function renderAccomGrid(){
    const grid = document.getElementById('accomGrid');
    const list = filteredCabins();
    const totalPages = Math.max(1, Math.ceil(list.length / ACCOM_PAGE_SIZE));
    if (accomPage > totalPages - 1) accomPage = totalPages - 1;
    const pageItems = list.slice(accomPage * ACCOM_PAGE_SIZE, accomPage * ACCOM_PAGE_SIZE + ACCOM_PAGE_SIZE);

    if (!pageItems.length){
      grid.innerHTML = '<p class="acc2-empty">No accommodations match this filter.</p>';
    } else grid.innerHTML = pageItems.map(c => {
      const chips = (c.amenities || []).slice(0, 3).map(a => '<span class="acc2-amenity">' + escHtml(a) + '</span>').join('');
      const bars = DAYS.map((d, i) => {
        const past = isPastDay(i);
        const free = state.availability[availKey(c.id, i)];
        const avail = free && !past;
        const cls = past && free ? 'past' : (free ? 'avail' : 'booked');
        const label = past && free ? ' - day has passed' : (free ? ' - available' : ' - booked');
        return '<div class="acc2-day"><button type="button" class="acc2-bar ' + cls + '" data-cabin="' + c.id + '" data-day="' + i +
               '" aria-label="' + d + label + '"' + (avail ? '' : ' disabled') + '></button><span>' + d.charAt(0) + '</span></div>';
      }).join('');
      const badge = availBadgeText(c);
      return `
      <div class="accom-card acc2-card${accSelected && accSelected.cabinId === c.id ? ' selected' : ''}">
        <div class="accom-art" style="background:${ART_BG[c.icon]}${c.image ? ";--art-img:url('" + encodeURI(c.image).replace(/'/g, '%27') + "')" : ''}">
          ${accomSlider(c)}
          <span class="acc2-badge${weekAvailCount(c) === 0 ? ' none' : ''}">${badge}</span>
          <div class="acc2-price"><b>${peso(c.price)}</b> / ${c.unit}</div>
        </div>
        <div class="acc2-body">
          <div class="acc2-titlerow">
            <p class="accom-name">${c.name}</p>
            ${c.avgRating != null
              ? '<span class="acc2-rating" title="Average guest rating"><span class="acc2-star">&#9733;</span>' + c.avgRating.toFixed(1) + ' <small>(' + c.ratingCount + ')</small></span>'
              : '<span class="acc2-rating none" title="No guest ratings yet"><span class="acc2-star">&#9733;</span>No ratings yet</span>'}
          </div>
          <p class="accom-note">${c.note || ''}</p>
          <div class="acc2-amenities">${chips}</div>
          <div class="acc2-week">${bars}</div>
          <div class="acc2-actions">
            <span class="acc2-weeklabel">This week</span>
            <button type="button" class="acc2-btn ghost" data-details="${c.id}">Details</button>
            <button type="button" class="acc2-btn solid" data-book="${c.id}">Book now</button>
          </div>
        </div>
      </div>`;
    }).join('');

    // One delegated listener: week bars open the booking form (as before), Details opens the popup,
    // Book now selects the stay and shows the summary bar.
    grid.onclick = (e) => {
      const bar = e.target.closest('.acc2-bar.avail');
      if (bar && grid.contains(bar)){ openBookingModal(bar.dataset.cabin, Number(bar.dataset.day)); return; }
      const det = e.target.closest('[data-details]');
      if (det && grid.contains(det)){ openAccDetails(det.dataset.details); return; }
      const book = e.target.closest('[data-book]');
      if (book && grid.contains(book)){
        const id = book.dataset.book;
        const fd = firstAvailableDay(id);
        openBookingModal(id, fd < 0 ? 0 : fd);
      }
    };
    try { initAccomSliders(grid); } catch (err) { console.error(err); }
    updatePaginationButtons();
    updateAccSummary();
  }

  function updatePaginationButtons(){
    const prevBtn = document.getElementById('prevAccomBtn');
    const nextBtnEl = document.getElementById('nextBtn');
    const totalPages = Math.max(1, Math.ceil(filteredCabins().length / ACCOM_PAGE_SIZE));
    const navRow = document.querySelector('#view-accommodation .next-row');
    if (navRow) navRow.style.display = totalPages > 1 ? '' : 'none';   // no pager when everything fits on one page
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
  const extraQty = { person:0, nights:1, ownTents:0, heads:1 };
  const STEP_MAX = { person:5, ownTents:5, heads:20 };
  let rentalQty = {};            // rental item id -> quantity picked
  const STEP_LIMIT = 5; // most blankets / pillows / extra persons per booking day
  const STEP_MIN = { nights:1, heads:1 };
  // Tent Area pricing (per the camp owner): own tent 250/tent, rented tent 500/tent,
  // plus 150 entrance per head.
  const TENT_OWN_PRICE = 250, TENT_RENT_PRICE = 500, ENTRANCE_PER_HEAD = 150;
  function isTentArea(cabin){ return !!cabin && /^tent area/i.test(cabin.name || ''); }
  const EXTRA_MAX = 5;

  function resetSteppers(){
    extraQty.person = 0; extraQty.nights = 1; extraQty.ownTents = 0; extraQty.heads = 1;
    rentalQty = {};
    document.getElementById('qtyOwnTents').textContent = 0;
    document.getElementById('qtyHeads').textContent = 1;
    document.getElementById('qtyPerson').textContent = 0;
    Object.keys(extraQty).forEach(markAddon);
    renderRentalRows();
  }
  // Highlights an add-on row once the guest has picked some of it.
  function markAddon(key){
    const el = document.getElementById('qty' + key.charAt(0).toUpperCase() + key.slice(1));
    const row = el && el.closest('.addon-row');
    if (row) row.classList.toggle('has-qty', extraQty[key] > (STEP_MIN[key] || 0));
  }
  document.querySelectorAll('.stepper').forEach(st => {
    const key = st.dataset.stepper;
    st.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.step);
        const min = STEP_MIN[key] || 0;
        const next = extraQty[key] + delta;
        const max = STEP_MAX[key];
        if (max !== undefined && next > max){ showToast(max === 0 ? 'Out of stock for your selected day(s)' : 'Maximum of ' + max + ' only'); return; }
        extraQty[key] = Math.max(min, next);
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        document.getElementById('qty' + cap).textContent = extraQty[key];
        markAddon(key);
      });
    });
  });

  /* ---------- Day picker (calendar, multi-select) ---------- */
  const bk = { dates: new Set(), y: 0, m: 0 };
  function pad2(n){ return String(n).padStart(2, '0'); }
  function keyOf(y, m, d){ return y + '-' + pad2(m + 1) + '-' + pad2(d); }
  function keyToDate(k){ return new Date(k + 'T00:00'); }
  function todayKey(){ const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); }
  function dayChoiceState(key){
    if (key < todayKey()) return 'past';
    if (Number(key.slice(0, 4)) > new Date().getFullYear()) return 'past'; // this year only
    if (pendingBooking && isBookedOn(pendingBooking.cabinId, key)) return 'booked';
    return 'ok';
  }
  function renderCalendar(){
    const grid = document.getElementById('calGrid');
    document.getElementById('calTitle').textContent =
      new Date(bk.y, bk.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const lead = (new Date(bk.y, bk.m, 1).getDay() + 6) % 7;
    const dim = new Date(bk.y, bk.m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < lead; i++) html += '<span class="cal-blank"></span>';
    for (let d = 1; d <= dim; d++){
      const key = keyOf(bk.y, bk.m, d);
      const st = dayChoiceState(key);
      const sel = bk.dates.has(key);
      const cls = 'cal-day ' + (sel ? 'sel' : st);
      html += '<button type="button" class="' + cls + '" data-day="' + key + '"' + (st !== 'ok' ? ' disabled' : '') +
        ' aria-pressed="' + sel + '">' + d + '</button>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => toggleDay(b.dataset.day)));
    const prevBtn = document.getElementById('calPrev');
    const now = new Date();
    prevBtn.disabled = (bk.y === now.getFullYear() && bk.m <= now.getMonth()) || bk.y < now.getFullYear();
    document.getElementById('calNext').disabled = bk.y >= now.getFullYear() && bk.m >= 11; // no booking beyond December of this year
  }
  function toggleDay(key){
    if (bk.dates.has(key)) bk.dates.delete(key); else bk.dates.add(key);
    afterDaysChanged();
  }
  function afterDaysChanged(){
    renderCalendar();
    const list = Array.from(bk.dates).sort();
    document.getElementById('selectedDays').textContent = list.length
      ? list.length + ' day' + (list.length > 1 ? 's' : '') + ' selected: ' +
        list.map(k => keyToDate(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(', ')
      : 'No day selected yet.';
    updateStockLimits();
  }
  /* ---------- Rental items (blankets, pillows, tents, items the admin adds) ---------- */
  function rentalLeft(id){
    let left = inventory.limits[id];
    if (left === undefined) return 0;
    bk.dates.forEach(k => { left = Math.min(left, stockLeft(k, id)); });
    return left;
  }
  function rentalRowHtml(it){
    const isTent = it.id === 'tents';
    const name = isTent ? 'Tents to rent from the camp' : it.name;
    const unit = isTent ? '/tent' : ' each';
    const safe = String(it.name).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    return '<div class="addon-row" data-rent-row="' + it.id + '"><div class="addon-info"><span class="addon-name">' + (isTent ? name : safe) + '</span>' +
      '<span class="addon-meta">₱' + Number(it.price).toLocaleString() + unit + ' <span class="stock-note" id="rn-' + it.id + '">checking stock...</span></span></div>' +
      '<div class="stepper"><button type="button" data-rent-id="' + it.id + '" data-rent-step="-1" aria-label="Fewer">−</button>' +
      '<span id="rq-' + it.id + '">' + (rentalQty[it.id] || 0) + '</span>' +
      '<button type="button" data-rent-id="' + it.id + '" data-rent-step="1" aria-label="More">+</button></div></div>';
  }
  function renderRentalRows(){
    const addonBox = document.getElementById('rentalRows');
    const tentBox2 = document.getElementById('tentRentalRows');
    if (!addonBox || !tentBox2) return;
    let a = '', t = '';
    (inventory.items || []).forEach(it => { if (it.id === 'tents') t += rentalRowHtml(it); else a += rentalRowHtml(it); });
    addonBox.innerHTML = a;
    tentBox2.innerHTML = t;
    [addonBox, tentBox2].forEach(box => box.querySelectorAll('[data-rent-step]').forEach(btn => {
      btn.addEventListener('click', () => stepRental(btn.dataset.rentId, Number(btn.dataset.rentStep)));
    }));
    updateStockLimits();
  }
  function stepRental(id, delta){
    const max = rentalLeft(id);
    const next = (rentalQty[id] || 0) + delta;
    if (next > max){ showToast(max === 0 ? 'Out of stock for your selected day(s)' : 'Maximum of ' + max + ' only'); return; }
    rentalQty[id] = Math.max(0, next);
    const q = document.getElementById('rq-' + id);
    if (q) q.textContent = rentalQty[id];
    const row = q && q.closest('.addon-row');
    if (row) row.classList.toggle('has-qty', rentalQty[id] > 0);
  }
  /* Max per item = what is still in stock on every chosen night (no fixed cap). */
  function updateStockLimits(){
    (inventory.items || []).forEach(it => {
      const left = rentalLeft(it.id);
      const max = left;
      if ((rentalQty[it.id] || 0) > max) rentalQty[it.id] = max;
      const q = document.getElementById('rq-' + it.id);
      if (q){
        q.textContent = rentalQty[it.id] || 0;
        const row = q.closest('.addon-row');
        if (row) row.classList.toggle('has-qty', (rentalQty[it.id] || 0) > 0);
      }
      const note = document.getElementById('rn-' + it.id);
      if (note) note.textContent = left <= 0 ? 'out of stock' : (left <= 5 ? 'only ' + left + ' left' : left + ' available');
    });
  }
  document.getElementById('calPrev').addEventListener('click', () => { bk.m--; if (bk.m < 0){ bk.m = 11; bk.y--; } renderCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { if (bk.y >= new Date().getFullYear() && bk.m >= 11) return; bk.m++; if (bk.m > 11){ bk.m = 0; bk.y++; } renderCalendar(); });
  document.querySelectorAll('[data-wd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wd = Number(btn.dataset.wd);
      const dim = new Date(bk.y, bk.m + 1, 0).getDate();
      const keys = [];
      for (let d = 1; d <= dim; d++){
        const k = keyOf(bk.y, bk.m, d);
        if (keyToDate(k).getDay() === wd && dayChoiceState(k) === 'ok') keys.push(k);
      }
      if (!keys.length){ showToast('No open day for that weekday this month'); return; }
      const allOn = keys.every(k => bk.dates.has(k));
      keys.forEach(k => { if (allOn) bk.dates.delete(k); else bk.dates.add(k); });
      afterDaysChanged();
    });
  });

  let stockTimer = null;
  function openBookingModal(cabinId, dayIndex, skipRestore){
    loadInventory();
    clearInterval(stockTimer);
    stockTimer = setInterval(() => {
      const m = document.getElementById('bookingModal');
      if (m && m.classList.contains('open')) loadInventory(); else clearInterval(stockTimer);
    }, 20000);
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
    // Calendar: start on the day the guest clicked (if still open).
    bk.dates = new Set();
    const startDate = getDateForDay(dayIndex);
    bk.y = startDate.getFullYear(); bk.m = startDate.getMonth();
    const startKey = keyOf(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (dayChoiceState(startKey) === 'ok') bk.dates.add(startKey);
    else { const n = new Date(); bk.y = n.getFullYear(); bk.m = n.getMonth(); }
    afterDaysChanged();
    const tentMode = isTentArea(cabin);
    document.getElementById('tentBox').style.display = tentMode ? '' : 'none';
    document.getElementById('personRow').style.display = tentMode ? 'none' : '';
    // Bonfire Area: walang Add person / Blanket / Pillow.
    document.getElementById('extrasBox').style.display = /^bonfire/i.test(cabin.name || '') ? 'none' : '';
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
    // Ibalik ang dating na-fill-up (draft) kung may naka-save para sa room na ito.
    const restored = skipRestore ? false : restoreBookingDraft(cabinId);
    const draftNote = document.getElementById('bkDraftNote');
    if (draftNote) draftNote.hidden = !restored;
    document.getElementById('bookingModal').classList.add('open');
  }
  function closeBookingModal(){
    document.getElementById('bookingModal').classList.remove('open');
  }
  document.getElementById('modalCloseX').addEventListener('click', () => { closeBookingModal(); pendingBooking = null; });
  // Hindi na nagsasara ang booking form kapag napindot ang labas/gilid nito -
  // X button lang ang magsasara, at naka-save pa rin ang na-fill-up (draft).

  /* ---------- Booking form draft (naka-save habang nag-fill up) ---------- */
  const DRAFT_PREFIX = 'campBookingDraft:';
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  function draftKey(cabinId){
    const who = sessionUser ? (sessionUser.id || sessionUser.user_id || sessionUser.email || 'guest') : 'guest';
    return DRAFT_PREFIX + who + ':' + cabinId;
  }
  function saveBookingDraft(){
    try {
      const modal = document.getElementById('bookingModal');
      if (!pendingBooking || !modal || !modal.classList.contains('open')) return;
      localStorage.setItem(draftKey(pendingBooking.cabinId), JSON.stringify({
        ts: Date.now(),
        name: document.getElementById('guestName').value,
        phone: document.getElementById('guestPhone').value,
        email: document.getElementById('guestEmail').value,
        dates: Array.from(bk.dates),
        y: bk.y, m: bk.m,
        extra: { person: extraQty.person, ownTents: extraQty.ownTents, heads: extraQty.heads },
        rentals: rentalQty
      }));
    } catch (e) { /* storage unavailable - ok lang */ }
  }
  function clearBookingDraft(cabinId){
    try { localStorage.removeItem(draftKey(cabinId)); } catch (e) {}
  }
  function clearAllBookingDrafts(){
    try {
      Object.keys(localStorage).filter(k => k.indexOf(DRAFT_PREFIX) === 0).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
  /* Returns true if a draft was found and applied. */
  function restoreBookingDraft(cabinId){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftKey(cabinId)) || 'null'); } catch (e) { d = null; }
    if (!d || !d.ts || Date.now() - d.ts > DRAFT_TTL_MS){ clearBookingDraft(cabinId); return false; }
    document.getElementById('guestName').value = d.name || '';
    document.getElementById('guestPhone').value = d.phone || '';
    document.getElementById('guestEmail').value = d.email || '';
    // Past/booked na ang ibang araw? Tanggalin lang ang mga iyon.
    bk.dates = new Set((d.dates || []).filter(k => typeof k === 'string' && dayChoiceState(k) === 'ok'));
    if (Number.isInteger(d.y) && Number.isInteger(d.m)){ bk.y = d.y; bk.m = d.m; }
    const ex = d.extra || {};
    extraQty.person = Math.min(STEP_MAX.person, Math.max(0, Number(ex.person) || 0));
    extraQty.ownTents = Math.min(STEP_MAX.ownTents, Math.max(0, Number(ex.ownTents) || 0));
    extraQty.heads = Math.min(STEP_MAX.heads, Math.max(1, Number(ex.heads) || 1));
    document.getElementById('qtyPerson').textContent = extraQty.person;
    document.getElementById('qtyOwnTents').textContent = extraQty.ownTents;
    document.getElementById('qtyHeads').textContent = extraQty.heads;
    Object.keys(extraQty).forEach(markAddon);
    rentalQty = {};
    Object.keys(d.rentals || {}).forEach(id => { const n = Number(d.rentals[id]) || 0; if (n > 0) rentalQty[id] = n; });
    afterDaysChanged();   // redraws the calendar and clamps rentals to stock
    renderRentalRows();   // redraws rental rows with the restored quantities
    return true;
  }
  (function(){
    const modal = document.getElementById('bookingModal');
    const queueSave = (e) => {
      if (e.target.closest && e.target.closest('#bkDraftNote')) return;
      setTimeout(saveBookingDraft, 0); // after the click/input handlers have updated the state
    };
    modal.addEventListener('input', queueSave);
    modal.addEventListener('click', queueSave);
    const clearBtn = document.getElementById('bkClearDraft');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!pendingBooking) return;
      clearBookingDraft(pendingBooking.cabinId);
      openBookingModal(pendingBooking.cabinId, pendingBooking.dayIndex, true);
      showToast('Form cleared');
    });
  })();
  document.getElementById('modalConfirm').addEventListener('click', () => {
    if (!pendingBooking) return;
    const name = document.getElementById('guestName').value.trim();
    const phone = document.getElementById('guestPhone').value.trim();
    const email = document.getElementById('guestEmail').value.trim();
    if (!name || !phone || !email){ showToast('Please fill in guest name, contact number and email'); return; }
    if (!bk.dates.size){ showToast('Please pick at least one day on the calendar'); return; }
    pendingBooking.guest = { name, phone, email };
    pendingBooking.checkIn = '14:00';
    pendingBooking.checkOut = '12:00';
    pendingBooking.nights = 1; // each picked day is its own 1-night reservation
    pendingBooking.dates = Array.from(bk.dates).sort();
    const tentMode2 = isTentArea(pendingBooking.cabin);
    if (tentMode2 && (extraQty.ownTents + (rentalQty.tents || 0)) < 1){
      showToast('Please choose at least one tent: bring your own or rent one from the camp');
      return;
    }
    pendingBooking.tent = tentMode2 ? { own: extraQty.ownTents, rent: rentalQty.tents || 0, heads: extraQty.heads } : null;
    pendingBooking.persons = extraQty.person;
    const picked = {};
    Object.keys(rentalQty).forEach(id => { if (rentalQty[id] > 0 && (tentMode2 || id !== 'tents')) picked[id] = rentalQty[id]; });
    pendingBooking.rentals = picked;
    closeBookingModal();
    openPaymentModal();
  });

  let uploadedReceiptName = null;
  let uploadedReceiptDataUrl = null;

  /* Magkakasunod na araw = isang reservation (n nights); magkakahiwalay = kanya-kanyang reservation. */
  function groupConsecutiveDates(keys){
    const sorted = Array.from(keys).sort();
    const runs = [];
    sorted.forEach(k => {
      const last = runs[runs.length - 1];
      if (last){
        const next = keyToDate(last.start); next.setDate(next.getDate() + last.nights);
        if (keyOf(next.getFullYear(), next.getMonth(), next.getDate()) === k){ last.nights += 1; return; }
      }
      runs.push({ start: k, nights: 1 });
    });
    return runs;
  }

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
    const { total } = computeCharges(pendingBooking.cabin, pendingBooking.persons, pendingBooking.rentals || {}, pendingBooking.nights, pendingBooking.tent);
    const days = (pendingBooking.dates || []).length || 1;
    const grand = total * days;
    const runCount = groupConsecutiveDates(pendingBooking.dates || []).length || 1;
    document.getElementById('paymentTotalAmount').textContent = peso(grand) + (days > 1 ? ' (' + days + ' nights x ' + peso(total) + (runCount > 1 ? ', ' + runCount + ' reservations' : '') + ')' : '');
    const downEl = document.getElementById('paymentDownAmount');
    if (downEl) downEl.textContent = peso(Math.ceil(grand / 2));
    setPayChoice(null);
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
  /* Shopee-style: tap an option, then only that option's fields appear. */
  let payChoice = null;
  function setPayChoice(choice){
    payChoice = choice;
    document.querySelectorAll('.pay-option').forEach(b => {
      const on = b.dataset.pay === choice;
      b.classList.toggle('active', on);
      if (b.parentElement) b.parentElement.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    document.getElementById('panelGcash').style.display = choice === 'GCash' ? '' : 'none';
    document.getElementById('panelBank').style.display = choice === 'Bank Transfer' ? '' : 'none';
    document.getElementById('receiptBlock').style.display = choice ? '' : 'none';
    const qr = document.querySelector('.qr-box');
    if (qr) qr.style.display = choice === 'GCash' ? '' : 'none';
    const t = document.getElementById('receiptTitle');
    if (t) t.textContent = choice === 'Bank Transfer' ? 'Upload deposit slip (required)' : 'Upload GCash screenshot (optional)';
    updatePaymentConfirmState();
  }
  document.querySelectorAll('.pay-option').forEach(b => b.addEventListener('click', () => setPayChoice(b.dataset.pay)));
  function updatePaymentConfirmState(){
    const ref = document.getElementById('gcashRef').value.trim();
    const tncOk = document.getElementById('tncCheck').checked;
    let ready = false;
    if (payChoice === 'GCash') ready = /^\d{13}$/.test(ref);
    else if (payChoice === 'Bank Transfer') ready = !!uploadedReceiptName;
    document.getElementById('paymentConfirm').disabled = !(ready && tncOk);
    if (pendingBooking) pendingBooking.paymentMethod = payChoice;
  }
  document.getElementById('tncCheck').addEventListener('change', updatePaymentConfirmState);
  function markGcashRef(){
    const el = document.getElementById('gcashRef');
    const v = el.value.trim();
    const bad = v.length > 0 && (!/^\d+$/.test(v) || v.length > 13);   // too long or not digits -> red
    el.classList.toggle('ref-invalid', bad);
    el.style.borderColor = bad ? '#e5484d' : '';
    el.style.color = bad ? '#e5484d' : '';
    el.style.boxShadow = bad ? '0 0 0 2px rgba(229,72,77,.35)' : '';
    let msg = document.getElementById('gcashRefMsg');
    if (!msg){
      msg = document.createElement('div');
      msg.id = 'gcashRefMsg';
      msg.style.cssText = 'color:#e5484d;font-size:12px;margin-top:6px;';
      el.insertAdjacentElement('afterend', msg);
    }
    msg.textContent = bad ? 'GCash reference number must be exactly 13 digits.' : '';
  }
  document.getElementById('gcashRef').addEventListener('input', () => {
    markGcashRef();
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

  function rentalItem(id){ return (inventory.items || []).find(x => x.id === id); }
  function tentRentPrice(){ const it = rentalItem('tents'); return it ? it.price : TENT_RENT_PRICE; }
  function computeCharges(cabin, persons, rentals, nights, tent){
    nights = Math.max(1, Number(nights) || 1);
    rentals = rentals || {};
    let baseRate = cabin.price * nights;
    let extraGuestsCharge = persons * 150 * nights;
    if (tent){
      baseRate = (tent.own * TENT_OWN_PRICE + tent.rent * tentRentPrice()) * nights;
      extraGuestsCharge = tent.heads * ENTRANCE_PER_HEAD * nights;
    }
    const totalAccommodation = baseRate + extraGuestsCharge;
    const addons = [];
    Object.keys(rentals).forEach(id => {
      const it = rentalItem(id);
      if (id === 'tents' || !it || rentals[id] <= 0) return;
      addons.push({ label: it.name + ' (' + rentals[id] + ')', price: rentals[id] * it.price });
    });
    const addonsTotal = addons.reduce((s, a) => s + a.price, 0);
    const total = totalAccommodation + addonsTotal;
    return { baseRate, extraGuestsCharge, totalAccommodation, addons, addonsTotal, total, nights };
  }

  function finalizeBooking(){
    if (!pendingBooking || !pendingBooking.paymentMethod) return;

    // Iwas double-click at malinaw na "sinasave pa".
    const confirmBtn = document.getElementById('paymentConfirm');
    if (confirmBtn.disabled) return;
    const originalBtnText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sinasave ang booking...';

    const pb = pendingBooking;
    const { cabinId, cabin, guest, checkIn: checkInTime, checkOut: checkOutTime, persons, rentals: pickedRentals, paymentMethod, tent } = pb;
    const dates0 = (pb.dates && pb.dates.length) ? pb.dates : [keyOf(...(function(){ const d = getDateForDay(pb.dayIndex); return [d.getFullYear(), d.getMonth(), d.getDate()]; })())];
    const runs = groupConsecutiveDates(dates0);
    const dates = runs; // one reservation per run of consecutive days
    const one = computeCharges(cabin, persons, pickedRentals || {}, 1, tent);
    const { addons } = one;

    // One reservation per picked day (own code and payment record); the
    // form is filled only once. Saved one after another so the server can
    // assign unique codes and re-check availability / stock each time.
    const saved = [];
    let failMsg = '';
    function saveOne(run){
      const dateKey = run.start;
      const nights = run.nights;
      const baseRate = one.baseRate * nights, extraGuestsCharge = one.extraGuestsCharge * nights;
      const addonsTotal = one.addonsTotal * nights, totalAccommodation = baseRate + extraGuestsCharge;
      const total = one.total * nights;
      const nLabel = '(' + nights + ' night' + (nights > 1 ? 's' : '') + ')';
      const lineItems = [{ label: cabin.name + ' - ' + cabin.note + ' ' + nLabel, price: baseRate }];
      if (tent){
        const tentParts = [];
        if (tent.own > 0) tentParts.push(tent.own + ' own tent' + (tent.own > 1 ? 's' : '') + ' @ ₱' + TENT_OWN_PRICE);
        if (tent.rent > 0) tentParts.push(tent.rent + ' rented tent' + (tent.rent > 1 ? 's' : '') + ' @ ₱' + tentRentPrice());
        lineItems[0].label = cabin.name + ' - ' + tentParts.join(' + ') + ' ' + nLabel;
        lineItems.push({ label: 'Entrance fee: ' + tent.heads + ' guest' + (tent.heads > 1 ? 's' : '') + ' @ ₱' + ENTRANCE_PER_HEAD, price: extraGuestsCharge });
      } else if (persons > 0) lineItems.push({ label: persons + ' Extra Person' + (persons > 1 ? 's' : ''), price: extraGuestsCharge });
      addons.forEach(a => lineItems.push({ label: a.label, price: a.price * nights }));
      const checkInDate = keyToDate(dateKey);
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setDate(checkInDate.getDate() + nights);
      state.reservationSeq += 1;
      const code = 'CMY-' + checkInDate.getFullYear() + '-' + cabin.code + '-' + String(state.reservationSeq).padStart(2, '0');
      const reservation = {
        id: 'r' + Date.now(),
        code,
        cabinId, dayIndex: pb.dayIndex, cabin: cabin.name, icon: cabin.icon, capacity: cabin.note,
        checkInLabel: fmtDate(checkInDate) + ' · ' + fmtTime(checkInTime),
        checkOutLabel: fmtDate(checkOutDate) + ' · ' + fmtTime(checkOutTime),
        guest, paymentMethod, lineItems, total, status: 'Pending',
        guestsCount: tent ? tent.heads : 1 + persons, baseRate, extraGuestsCharge, totalAccommodation, addons, addonsTotal,
        rentals: pickedRentals || {}, blankets: (pickedRentals && pickedRentals.blankets) || 0, pillows: (pickedRentals && pickedRentals.pillows) || 0,
        gcashRef: pb.gcashRef || '',
        receiptImage: uploadedReceiptDataUrl || null,
        receiptFileName: uploadedReceiptName || null
      };
      return apiCall('reservations_create', {
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
        if (!res || !res.success || !res.reservation){
          failMsg = (res && res.message) ? res.message : 'Hindi na-save ang booking. Pakisubukan ulit.';
          return false;
        }
        reservation.id = 'r' + res.reservation.id;
        reservation.dbId = res.reservation.id;
        if (res.reservation.code) reservation.code = res.reservation.code;
        realBookings.push({ slug: cabinId, check_in: dateKey, check_out: keyOf(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate()) });
        state.reservations.unshift(reservation);
        saved.push(reservation);
        return true;
      });
    }

    dates.reduce((chain, dk) => chain.then(ok => ok ? saveOne(dk) : false), Promise.resolve(true)).then(() => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalBtnText;
      if (!saved.length){
        showToast(failMsg || 'Hindi na-save ang booking. Pakisubukan ulit.');
        return;
      }
      state.availability = buildAvailability();
      loadInventory();
      renderAccomGrid();
      renderHomeCards();
      renderHistory();
      renderNotifications();
      loadNotifications();
      closePaymentModal();
      clearBookingDraft(cabinId);

      const first = saved[0];
      let msg = cabin.name + ', ' + saved.map(r => r.checkInLabel.split(' · ')[0] + (r.checkOutLabel ? ' to ' + r.checkOutLabel.split(' · ')[0] : '')).join('; ') +
        ' · Ref ' + saved.map(r => r.code).join(', ') + ' · via ' + paymentMethod +
        '. Status: Pending until Camp Mayagay confirms your payment.';
      if (saved.length < dates.length) msg += ' Hindi na-save ang ' + (dates.length - saved.length) + ' na reservation: ' + failMsg;
      document.getElementById('thankyouSummary').textContent = msg;
      document.getElementById('thankyouModal').classList.add('open');
      pendingBooking = null;
    }).catch(() => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalBtnText;
      if (saved.length){ state.availability = buildAvailability(); renderAccomGrid(); renderHistory(); }
      showToast('Hindi maka-konekta sa server. Pakisubukan ulit.');
    });
  }
  document.getElementById('thankyouDone').addEventListener('click', () => {
    document.getElementById('thankyouModal').classList.remove('open');
    goToView('history');
  });

  /* "Fully paid" when settled, otherwise the remaining balance. */
  function paymentBalanceHtml(r){
    const total = Number(r.total) || 0;
    const paid = Number(r.amountPaid) || 0;
    if (r.payStatus === 'refunded') return '<span class="resv-balance refunded">Refunded</span>';
    if (r.payStatus === 'paid' || (total > 0 && paid >= total)) return '<span class="resv-balance paid">Fully paid</span>';
    return '<span class="resv-balance due">Remaining balance: ' + peso(Math.max(0, total - paid)) + '</span>';
  }

  /* Guests may cancel only within 24 hours after the booking was made. */
  function canCancelNow(r){
    if (String(r.status || '').toLowerCase() !== 'pending') return false; // confirmed na = hindi na pwede i-cancel
    if (!r.createdAt) return true;
    const made = new Date(String(r.createdAt).replace(' ', 'T'));
    if (isNaN(made.getTime())) return true;
    return Date.now() - made.getTime() <= 24 * 60 * 60 * 1000;
  }

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
    // Original per-reservation card (guest info, payment summary, Cancel / Receipt) - now shown
    // as the expandable detail of each table row so no action is lost.
    const cardHtml = r => `
      <div class="resv-card">
        <div class="resv-top">
          <span class="resv-dates" title="Check-in: ${r.checkInLabel}  |  Check-out: ${r.checkOutLabel}">${r.checkInLabel} - ${r.checkOutLabel}</span>
          <span class="resv-pay">PAYMENT METHOD: ${r.paymentMethod.toUpperCase()}</span>
          ${paymentBalanceHtml(r)}
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
              ${r.status === 'Cancelled' ? `<button class="btn-cancel-resv" data-id="${r.id}" data-action="delete">Delete</button>` : (r.cancelRequested ? '' : (canCancelNow(r) ? `<span class="cancel-note">You can cancel within 24 hours of booking while still Pending.</span><button class="btn-cancel-resv" data-id="${r.id}">Cancel booking</button>` : '<span class="cancel-closed">' + (String(r.status || '').toLowerCase() === 'confirmed' ? 'Confirmed bookings can no longer be cancelled.' : 'Cancellation is only allowed within 24 hours of booking.') + '</span>'))}
              <button class="btn-secondary btn-receipt" data-id="${r.id}" type="button" style="flex:0 0 auto; padding:11px 16px;">Receipt</button>
              <button class="btn-status${(r.cancelRequested || String(r.status).toLowerCase() === 'pending') ? ' st-pending' : ''}">${r.cancelRequested ? 'Pending' : r.status}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const resBalance = r => {
      if (r.status === 'Cancelled' || r.payStatus === 'refunded' || r.payStatus === 'paid') return 0;
      return Math.max(0, (Number(r.total) || 0) - (Number(r.amountPaid) || 0));
    };
    const total = state.reservations.length;
    const upcoming = state.reservations.filter(r => r.status === 'Confirmed' || r.status === 'Pending').length;
    const completed = state.reservations.filter(r => r.status === 'Completed').length;
    const balanceDue = state.reservations.reduce((sum, r) => sum + resBalance(r), 0);
    const statsHtml = `
      <div class="hist2-stats">
        <div class="hist2-stat"><span>Total reservations</span><strong>${total}</strong></div>
        <div class="hist2-stat"><span>Upcoming</span><strong>${upcoming}</strong></div>
        <div class="hist2-stat"><span>Completed</span><strong>${completed}</strong></div>
        <div class="hist2-stat"><span>Balance due</span><strong>${peso(balanceDue)}</strong></div>
      </div>`;

    const rowsHtml = state.reservations.map(r => {
      const bal = resBalance(r);
      const fullyPaid = r.status !== 'Cancelled' && r.status !== 'Declined' && r.payStatus !== 'refunded' && (r.payStatus === 'paid' || ((Number(r.total) || 0) > 0 && (Number(r.amountPaid) || 0) >= Number(r.total)));
      const label = r.cancelRequested ? 'Cancel requested' : r.status;
      const cls = r.cancelRequested ? 'pending' : String(r.status).toLowerCase();
      const code = r.code || ('RES-' + String(r.dbId || '').padStart(4, '0'));
      return `
        <tr class="hist2-row">
          <td class="hist2-code" data-label="Code">${escHtml(code)}</td>
          <td class="hist2-acc" data-label="Accommodation">${escHtml(String(r.cabin || ''))}</td>
          <td data-label="Check-in">${escHtml(String(r.checkInLabel || ''))}</td>
          <td data-label="Check-out">${escHtml(String(r.checkOutLabel || ''))}</td>
          <td class="hist2-bal${bal > 0 ? ' due' : (fullyPaid ? ' paid' : '')}" data-label="Balance">${fullyPaid && bal === 0 ? 'Fully paid' : peso(bal)}</td>
          <td data-label="Status"><span class="hist2-pill ${cls}">${escHtml(label)}</span></td>
          <td class="hist2-act"><button type="button" class="hist2-view" data-row="${r.id}" aria-expanded="false">View</button></td>
        </tr>
        <tr class="hist2-detail" data-detail="${r.id}" hidden>
          <td colspan="7">${cardHtml(r)}</td>
        </tr>`;
    }).join('');

    el.innerHTML = statsHtml + `
      <div class="hist2-table-wrap">
        <table class="hist2-table">
          <thead><tr><th>Code</th><th>Accommodation</th><th>Check-in</th><th>Check-out</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    el.querySelectorAll('.hist2-view').forEach(btn => {
      btn.addEventListener('click', () => {
        const detail = el.querySelector('.hist2-detail[data-detail="' + btn.dataset.row + '"]');
        if (!detail) return;
        const open = detail.hidden;
        detail.hidden = !open;
        btn.textContent = open ? 'Hide' : 'View';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

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
      ${r.extraGuestsCharge > 0 ? `<div class="receipt-row"><span>${r.cabinId && /^tent/i.test(r.cabin || '') ? 'Entrance Fee' : 'Extra Guests'}:</span><span>${peso(r.extraGuestsCharge)}</span></div>` : ''}
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
    const fbCategory = (document.getElementById('fbCategory') || {}).value || 'feedback';
    if (fbCategory === 'feedback' && !accommodationId){
      showToast(state.bookedAccIds.length ? 'Please pick the room you booked to rate.' : 'Book a room first so you can rate it.');
      return;
    }
    const fbSubjectEl = document.getElementById('fbSubject');
    const fbSubject = (fbSubjectEl && fbSubjectEl.value.trim()) || (fbCategory === 'concern' ? 'Guest concern' : 'Guest feedback');
    apiCall('feedback_create', { rating: currentRating, message, accommodation_id: accommodationId, subject: fbSubject, category: fbCategory }).then(res => {
      if (!res || !res.success) {
        showToast((res && res.message) || 'Could not send feedback. Please try again.');
        return;
      }
      state.feedback.unshift({ rating: currentRating, message, accommodationName, when: new Date().toLocaleString() });
      document.getElementById('fbMessage').value = '';
      if (fbSubjectEl) fbSubjectEl.value = '';
      if (accSelect) accSelect.value = '';
      currentRating = 0;
      renderStars();
      renderFeedback();
      loadTrendingAccommodations();
      refreshRatings();
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
  let openNotifTitle = '';
  function openNotifDetail(n){
    openNotifId = n.id;
    document.getElementById('notifDetailTitle').textContent = n.title || 'Notification';
    document.getElementById('notifDetailTime').textContent = n.timestamp || '';
    document.getElementById('notifDetailBody').textContent = n.desc || '';
    openNotifTitle = n.title || '';
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
    if (name === 'notifications') {
      // Opening the Notifications page clears the "new" highlight.
      setTimeout(() => {
        const view = document.getElementById('view-notifications');
        if (!view || !view.classList.contains('active')) return;
        const unread = state.notifications.filter(n => !n.read);
        if (!unread.length) return;
        unread.forEach(n => { n.read = true; });
        renderNotifications();
        const dbIds = unread.map(n => n.id).filter(id => /^\d+$/.test(String(id))).map(Number);
        if (dbIds.length) apiCall('notifications_mark_read', { ids: dbIds }).catch(() => {});
      }, 1200);
    }
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
  (function wireAccomV2(){
    const chips = document.getElementById('accFilters');
    if (chips) chips.addEventListener('click', (e) => {
      const btn = e.target.closest('.acc2-chip');
      if (!btn) return;
      accomFilter = btn.dataset.filter || 'all';
      accomPage = 0;
      chips.querySelectorAll('.acc2-chip').forEach(b => b.classList.toggle('active', b === btn));
      renderAccomGrid();
    });
    const go = document.getElementById('accSummaryGo');
    if (go) go.addEventListener('click', () => {
      if (!accSelected) return;
      openBookingModal(accSelected.cabinId, accSelected.dayIndex);
    });
  })();
  document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredCabins().length / ACCOM_PAGE_SIZE));
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
    helpContactUsBtn.addEventListener('click', () => openCompose(''));
  }

  /* Compose a message to the admin (Contact Us and Reply). */
  function openCompose(subject){
    document.getElementById('composeSubject').value = subject || '';
    document.getElementById('composeBody').value = '';
    document.getElementById('composeModal').classList.add('open');
    setTimeout(() => document.getElementById(subject ? 'composeBody' : 'composeSubject').focus(), 50);
  }
  function closeCompose(){ document.getElementById('composeModal').classList.remove('open'); }
  document.getElementById('composeCloseX').addEventListener('click', closeCompose);
  document.getElementById('composeCancelBtn').addEventListener('click', closeCompose);
  document.getElementById('composeModal').addEventListener('click', (e) => { if (e.target.id === 'composeModal') closeCompose(); });
  document.getElementById('notifReplyBtn').addEventListener('click', () => {
    const t = openNotifTitle || 'Camp Mayagay';
    openCompose(/^re:/i.test(t) ? t : 'Re: ' + t);
  });
  document.getElementById('composeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = document.getElementById('composeSubject').value.trim();
    const message = document.getElementById('composeBody').value.trim();
    if (!subject || !message){ showToast('Please enter a subject and a message.'); return; }
    const btn = document.getElementById('composeSendBtn');
    btn.disabled = true;
    apiCall('guest_message_send', { subject: subject, message: message }).then(res => {
      btn.disabled = false;
      if (res && res.success){ closeCompose(); showToast('Message sent to Camp Mayagay.'); }
      else showToast((res && res.message) || 'Could not send your message.');
    }).catch(() => { btn.disabled = false; showToast('Could not send your message.'); });
  });
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
    clearAllBookingDrafts();
    window.location.href = 'php/logout.php';
  });
  var dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  if (dropdownLogoutBtn) {
    dropdownLogoutBtn.addEventListener('click', () => {
      clearAllBookingDrafts();
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
    var pwIssue = (function (pw) {
      if (pw.length < 12) return 'New password must be at least 12 characters.';
      if (!/[A-Z]/.test(pw)) return 'New password must include an uppercase letter.';
      if (!/[a-z]/.test(pw)) return 'New password must include a lowercase letter.';
      if (!/[0-9]/.test(pw)) return 'New password must include a number.';
      if (!/[^A-Za-z0-9]/.test(pw)) return 'New password must include a special character (e.g. ! @ # $ %).';
      return '';
    })(newPassword);
    if (pwIssue) {
      errorEl.textContent = pwIssue;
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
      document.getElementById('avatarCircle').innerHTML = `<img src="${reader.result}" alt="">`;
      showToast("Photo selected — click 'Save changes' to apply it.");
    };
    reader.readAsDataURL(file);
  });
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

    if (typedDate) typedDate.value = dayInput.value;
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
  /* Typed date for the availability filter (YYYY-MM-DD, auto-formatted). */
  function autoFormatDate(el){
    const d = el.value.replace(/\D/g, '').slice(0, 8);
    let out = d.slice(0, 4);
    if (d.length > 4) out += '-' + d.slice(4, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    el.value = out;
  }
  function validDateKey(v){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00');
    return !isNaN(d.getTime()) && keyOf(d.getFullYear(), d.getMonth(), d.getDate()) === v;
  }
  const typedDate = document.getElementById('typedDate');
  typedDate.addEventListener('input', () => {
    autoFormatDate(typedDate);
    if (typedDate.value.length === 10){
      if (validDateKey(typedDate.value)){ dayInput.value = typedDate.value; applyDateFilter(); }
      else showToast('Please enter a valid date (YYYY-MM-DD)');
    }
  });
  document.getElementById('clearDateBtn').addEventListener('click', () => {
    monthInput.value = '';
    dayInput.value = '';
    applyDateFilter();
  });

  /* Larger text switch and step-by-step guide, for older guests. */
  (function(){
    const btn = document.getElementById('textSizeBtn');
    function apply(on){
      document.body.classList.toggle('large-text', on);
      if (btn) btn.textContent = on ? 'A-' : 'A+';
    }
    let saved = false;
    try { saved = localStorage.getItem('cmy_large_text') === '1'; } catch (e) {}
    apply(saved);
    if (btn) btn.addEventListener('click', () => {
      const on = !document.body.classList.contains('large-text');
      apply(on);
      try { localStorage.setItem('cmy_large_text', on ? '1' : '0'); } catch (e) {}
    });
    const guide = document.getElementById('guideModal');
    function openGuide(){ guide.classList.add('open'); }
    function closeGuide(){ guide.classList.remove('open'); }
    ['helpGuideBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', openGuide);
    });
    const gx = document.getElementById('guideCloseX');
    if (gx) gx.addEventListener('click', closeGuide);
    guide.addEventListener('click', (e) => { if (e.target.id === 'guideModal') closeGuide(); });
  })();

  /* ---------------- EMERGENCY REPORT (guest tells admin/staff) ---------------- */
  (function initEmergency(){
    const modal = document.getElementById('emergencyModal');
    const form = document.getElementById('emergencyForm');
    const btn = document.getElementById('emergencyBtn');
    if (!modal || !form || !btn) return;
    const close = () => modal.classList.remove('open');
    btn.addEventListener('click', () => {
      document.getElementById('emContact').value = (typeof sessionUser !== 'undefined' && sessionUser && sessionUser.contact_number) ? sessionUser.contact_number : document.getElementById('emContact').value;
      modal.classList.add('open');
    });
    document.getElementById('emergencyCloseX').addEventListener('click', close);
    document.getElementById('emergencyCancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target.id === 'emergencyModal') close(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desc = document.getElementById('emDesc').value.trim();
      if (!desc) { showToast('Please describe what is happening.'); return; }
      const send = document.getElementById('emergencySend');
      send.disabled = true;
      try {
        const res = await apiCall('emergency_report', {
          incident_type: document.getElementById('emType').value,
          location: document.getElementById('emLocation').value.trim(),
          description: desc,
          contact_number: document.getElementById('emContact').value.trim()
        });
        if (res && res.success) {
          showToast('Emergency report sent. The camp staff has been notified.');
          form.reset();
          close();
        } else {
          showToast((res && res.message) || 'Could not send the report. Please call the camp directly.');
        }
      } catch (err) {
        showToast('Could not send the report. Please call the camp directly.');
      }
      send.disabled = false;
    });
  })();

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
    return Promise.all([loadAvailability(), loadInventory()]);
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
    try { Object.keys(localStorage).filter(k => k.indexOf('campBookingDraft:') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    window.location.href = 'php/logout.php';
  }
}