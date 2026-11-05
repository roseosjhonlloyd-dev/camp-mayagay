document.addEventListener('DOMContentLoaded', function () {
  hideNavAndView('security');

  fetch('php/api.php?action=my_permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({})
  })
    .then(function (res) { return res.json(); })
    .then(function (res) {
      if (!res || !res.success || !res.permissions) return;

      var viewToModuleKey = {
        'reservation':    'reservation',
        'payments':       'payments',
        'accommodations': 'accommodation',
        'guest-record':   'guest_record',
        'notifications':  'notifications',
        'feedback':       'feedback',
        'reports':        'reports',
        'settings':       'settings'
      };

      Object.keys(viewToModuleKey).forEach(function (viewName) {
        var moduleKey = viewToModuleKey[viewName];
        var allowed = !!res.permissions[moduleKey];
        if (!allowed) hideNavAndView(viewName);
      });

      var activeView = document.querySelector('.view.active');
      if (activeView && activeView.style.display === 'none' && typeof goToView === 'function') {
        goToView('dashboard');
      }
    })
    .catch(function () {
    });

  function hideNavAndView(viewName) {
    var navBtn = document.querySelector('.nav-item[data-view="' + viewName + '"]');

    document.querySelectorAll('.nav-item[data-view="' + viewName + '"]').forEach(function (navBtn) {
      navBtn.style.display = 'none';
    });

    var section = document.getElementById('view-' + viewName);
    if (section) section.style.display = 'none';
  }
});
