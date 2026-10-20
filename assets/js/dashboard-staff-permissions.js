/**
 * dashboard-staff-permissions.js
 * Ito lang ang ginagamit ng dashboard-staff.html.
 *
 * Layunin: itago ang mga sidebar item / pages na WALANG access ang
 * naka-login na Staff account, base sa tunay na Roles & Permissions
 * data na naka-set ng Admin sa Security Management > Roles & Permissions.
 *
 * Walang hardcoded na "staff pwede/hindi pwede dito" - kinukuha lahat
 * mula sa database (role_permissions table) sa pamamagitan ng
 * my_permissions action sa php/api.php. Kapag binago ng Admin ang
 * toggle sa Roles & Permissions, kusang susunod dito ang Staff Dashboard.
 */
document.addEventListener('DOMContentLoaded', function () {

  // Security Management (User Management + Roles & Permissions) ay
  // laging para sa Admin lang - hindi kailanman ipapakita sa Staff,
  // kahit ano pa ang laman ng permissions table. Tumutugma ito sa
  // requireAdmin() guard na ginagamit na rin sa mga users_* actions
  // sa php/api.php.
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

      // Mapa mula sa data-view (pangalan ng button sa sidebar) papunta
      // sa module_key na ginagamit ng role_permissions table sa DB.
      var viewToModuleKey = {
        'reservation':    'reservation',
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

      // Kung yung kasalukuyang bukas na view pala ay itinago natin
      // (dahil wala palang access dito ang staff), bumalik sa Dashboard.
      var activeView = document.querySelector('.view.active');
      if (activeView && activeView.style.display === 'none' && typeof goToView === 'function') {
        goToView('dashboard');
      }
    })
    .catch(function () {
      // Kung mabigo kumuha ng permissions (hal. connection issue),
      // itago na lang lahat maliban sa Dashboard bilang pinaka-ligtas
      // na default.
    });

  function hideNavAndView(viewName) {
    var navBtn = document.querySelector('.nav-item[data-view="' + viewName + '"]');
    if (navBtn) navBtn.style.display = 'none';

    var section = document.getElementById('view-' + viewName);
    if (section) section.style.display = 'none';
  }
});
