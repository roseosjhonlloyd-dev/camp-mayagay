document.addEventListener('DOMContentLoaded', function () {
  initPasswordToggles();
  initLoginForm();
  initRegisterForm();
  initForgotPasswordForm();
});

function initPasswordToggles() {
  var eyeSvg =
    '<svg class="eye-open" viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="eye-closed" viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0112 5c7 0 10.5 7 10.5 7a17 17 0 01-3.2 4.2M6.6 6.6A16.6 16.6 0 001.5 12S5 19 12 19c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';

  document.querySelectorAll('.toggle-password').forEach(function (btn) {
    btn.innerHTML = eyeSvg;
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

function setFieldError(inputId, message) {
  var input = document.getElementById(inputId);
  var errorEl = document.getElementById(inputId + 'Error');
  if (input) input.classList.toggle('input-error', !!message);
  if (errorEl) errorEl.textContent = message || '';
}

function clearErrors(fieldIds) {
  fieldIds.forEach(function (id) { setFieldError(id, ''); });
}

function showAlert(alertEl, message, type) {
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.classList.remove('error', 'success');
  alertEl.classList.add('show', type);
}

function hideAlert(alertEl) {
  if (!alertEl) return;
  alertEl.classList.remove('show', 'error', 'success');
  alertEl.textContent = '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initLoginForm() {
  var form = document.getElementById('loginForm');
  if (!form) return;

  var alertEl = document.getElementById('loginAlert');
  var submitBtn = document.getElementById('loginSubmitBtn') || form.querySelector('button[type="submit"]');
  var identifierGroup = document.getElementById('identifierGroup');
  var passwordGroup = document.getElementById('passwordGroup');
  var twoFaGroup = document.getElementById('twoFaGroup');
  var forgotPasswordRow = document.getElementById('forgotPasswordRow');
  var twoFaCodeInput = document.getElementById('twoFaCode');
  var resendBtn = document.getElementById('resendCodeBtn');
  var resendInterval = null;

  var awaitingTwoFa = false;

  function startResendCountdown(seconds) {
    clearInterval(resendInterval);
    var remaining = seconds;
    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Resend code in ' + remaining + 's';
    }
    resendInterval = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendInterval);
        if (resendBtn) {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend Code';
        }
      } else if (resendBtn) {
        resendBtn.textContent = 'Resend code in ' + remaining + 's';
      }
    }, 1000);
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', function () {
      if (resendBtn.disabled) return;
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending...';
      fetch('php/login.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend_2fa' })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success) {
            showAlert(alertEl, data.message || 'A new code was sent.', 'success');
            startResendCountdown(60);
          } else {
            showAlert(alertEl, data.message || 'Could not resend the code.', 'error');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
          }
        })
        .catch(function () {
          showAlert(alertEl, 'Unable to reach the server. Please try again.', 'error');
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend Code';
        });
    });
  }

  function showTwoFaStep() {
    awaitingTwoFa = true;
    if (identifierGroup) identifierGroup.style.display = 'none';
    if (passwordGroup) passwordGroup.style.display = 'none';
    if (forgotPasswordRow) forgotPasswordRow.style.display = 'none';
    if (twoFaGroup) twoFaGroup.style.display = '';
    if (submitBtn) submitBtn.textContent = 'Verify Code';
    if (twoFaCodeInput) twoFaCodeInput.focus();
    startResendCountdown(60);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAlert(alertEl);

    if (awaitingTwoFa) {
      clearErrors(['twoFaCode']);
      var code = (twoFaCodeInput && twoFaCodeInput.value.trim()) || '';
      if (code === '') {
        setFieldError('twoFaCode', 'Enter the code sent to your email.');
        return;
      }

      submitBtn.disabled = true;
      var vOriginalText = submitBtn.textContent;
      submitBtn.textContent = 'Verifying...';

      fetch('php/login.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_2fa', code: code })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success) {
            showAlert(alertEl, data.message || 'Login successful.', 'success');
            window.location.href = data.redirect || 'dashboard-guest.html';
          } else {
            showAlert(alertEl, data.message || 'Incorrect or expired code.', 'error');
          }
        })
        .catch(function () {
          showAlert(alertEl, 'Unable to reach the server. Please try again.', 'error');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = vOriginalText;
        });
      return;
    }

    clearErrors(['identifier', 'password']);

    var identifier = document.getElementById('identifier').value.trim();
    var password = document.getElementById('password').value;

    var hasError = false;
    if (identifier === '') {
      setFieldError('identifier', 'Enter your username or email.');
      hasError = true;
    }
    if (password === '') {
      setFieldError('password', 'Enter your password.');
      hasError = true;
    }
    if (hasError) return;

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';

    // Ask the browser for the device's position (asks the user for
    // permission). Falls back to the server's IP-based guess if denied,
    // unavailable, or slow.
    getClientPosition().then(function (pos) {
      var payload = { identifier: identifier, password: password };
      if (pos) { payload.client_lat = pos.lat; payload.client_lng = pos.lng; }
      return fetch('php/login.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    })
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (result) {
        if (result.data.success && result.data.needs_2fa) {
          showAlert(alertEl, result.data.message || 'Enter the verification code we emailed you.', 'success');
          showTwoFaStep();
        } else if (result.data.success) {
          showAlert(alertEl, result.data.message || 'Login successful.', 'success');
          window.location.href = result.data.redirect || 'dashboard-guest.html';
        } else {
          showAlert(alertEl, result.data.message || 'Login failed.', 'error');
        }
      })
      .catch(function () {
        showAlert(alertEl, 'Unable to reach the server. Please try again.', 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = awaitingTwoFa ? 'Verify Code' : originalText;
      });
  });
}

function initRegisterForm() {
  var form = document.getElementById('registerForm');
  if (!form) return;

  var alertEl = document.getElementById('registerAlert');
  var submitBtn = form.querySelector('button[type="submit"]');

  var fieldIds = ['firstname', 'lastname', 'email', 'username', 'contact_number', 'password', 'confirm_password'];
  var validIdInput = document.getElementById('valid_id');

  if (validIdInput) {
    validIdInput.addEventListener('change', function (e) {
      setFieldError('valid_id', '');
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/image\/(jpeg|png)/.test(file.type)) {
        setFieldError('valid_id', 'Please upload a JPEG or PNG file.');
        validIdInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setFieldError('valid_id', 'File is larger than 5MB.');
        validIdInput.value = '';
        return;
      }
      var filenameEl = document.getElementById('idUploadFilename');
      if (filenameEl) filenameEl.textContent = file.name;

      var reader = new FileReader();
      reader.onload = function () {
        var preview = document.getElementById('idUploadPreview');
        if (preview) preview.innerHTML = '<img src="' + reader.result + '" alt="Valid ID preview">';
      };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAlert(alertEl);
    clearErrors(fieldIds.concat(['valid_id']));

    var values = {};
    fieldIds.forEach(function (id) {
      values[id] = document.getElementById(id).value.trim();
    });

    var hasError = false;

    if (values.firstname === '') { setFieldError('firstname', 'First name is required.'); hasError = true; }
    if (values.lastname === '') { setFieldError('lastname', 'Last name is required.'); hasError = true; }

    if (values.email === '') {
      setFieldError('email', 'Email is required.'); hasError = true;
    } else if (!isValidEmail(values.email)) {
      setFieldError('email', 'Enter a valid email address.'); hasError = true;
    }

    if (values.username === '') {
      setFieldError('username', 'Username is required.'); hasError = true;
    } else if (!/^[A-Za-z0-9_.]{3,50}$/.test(values.username)) {
      setFieldError('username', '3-50 characters: letters, numbers, . and _ only.'); hasError = true;
    }

    if (values.contact_number !== '' && !/^[0-9+\-\s]{7,20}$/.test(values.contact_number)) {
      setFieldError('contact_number', 'Enter a valid contact number.'); hasError = true;
    }

    var idFile = validIdInput && validIdInput.files && validIdInput.files[0];
    if (!idFile) {
      setFieldError('valid_id', 'Please upload a photo of a valid ID.'); hasError = true;
    } else if (!/image\/(jpeg|png)/.test(idFile.type)) {
      setFieldError('valid_id', 'Please upload a JPEG or PNG file.'); hasError = true;
    } else if (idFile.size > 5 * 1024 * 1024) {
      setFieldError('valid_id', 'File is larger than 5MB.'); hasError = true;
    }

    if (values.password === '') {
      setFieldError('password', 'Password is required.'); hasError = true;
    } else if (values.password.length < 8) {
      setFieldError('password', 'Password must be at least 8 characters.'); hasError = true;
    }

    if (values.confirm_password === '') {
      setFieldError('confirm_password', 'Please confirm your password.'); hasError = true;
    } else if (values.password !== values.confirm_password) {
      setFieldError('confirm_password', 'Passwords do not match.'); hasError = true;
    }

    if (hasError) return;

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';

    readFileAsDataUrl(idFile).then(function (dataUrl) {
      values.valid_id_image = dataUrl;
      return fetch('php/register.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
    })
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (result) {
        if (result.data.success) {
          showAlert(alertEl, result.data.message || 'Registration successful.', 'success');
          form.reset();
          setTimeout(function () {
            window.location.href = result.data.redirect || 'index.html';
          }, 1200);
        } else {
          showAlert(alertEl, result.data.message || 'Registration failed.', 'error');
          if (result.data.errors) {
            Object.keys(result.data.errors).forEach(function (key) {
              setFieldError(key, result.data.errors[key]);
            });
          }
        }
      })
      .catch(function () {
        showAlert(alertEl, 'Unable to reach the server. Please try again.', 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
  });
}

/* Resolves to {lat, lng} or null. Never rejects. */
function getClientPosition() {
  return new Promise(function (resolve) {
    if (!('geolocation' in navigator)) { resolve(null); return; }
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 8000);
    try {
      navigator.geolocation.getCurrentPosition(function (p) {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      }, function () {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve(null);
      }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 });
    } catch (e) { clearTimeout(timer); resolve(null); }
  });
}
