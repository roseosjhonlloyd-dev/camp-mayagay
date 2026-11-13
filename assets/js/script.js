function passwordIssue(pw) {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a special character (e.g. ! @ # $ %).';
  return '';
}
/* Terms and Conditions popup on the sign-up page */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var link = document.getElementById('termsLink');
    var modal = document.getElementById('termsModal');
    if (!link || !modal) return;
    function open(e) { e.preventDefault(); e.stopPropagation(); modal.hidden = false; }
    function close() { modal.hidden = true; }
    link.addEventListener('click', open);
    document.getElementById('termsModalClose').addEventListener('click', close);
    document.getElementById('termsModalOk').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  });
})();

document.addEventListener('DOMContentLoaded', function () {
  initPasswordToggles();
  initLoginForm();
  initRegisterForm();
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

  // Message after the guest clicked the link in the activation email.
  try {
    var qs = new URLSearchParams(window.location.search);
    if (qs.get('verified') === '1') showAlert(alertEl, 'Email verified! Your account is active. You can log in now.', 'success');
    else if (qs.get('verified') === '0') showAlert(alertEl, 'That verification link is invalid or has expired. Log in to get a new one.', 'error');
  } catch (e) {}

  // "Resend verification email" button shown when an unverified account tries to log in.
  function addResendVerification(identifier) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Resend verification email';
    btn.style.cssText = 'display:block;margin:8px auto 0;background:none;border:0;text-decoration:underline;cursor:pointer;color:inherit;font:inherit;font-weight:600;';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      fetch('php/resend_verification.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier })
      }).then(function (r) { return r.json(); }).then(function (d) {
        showAlert(alertEl, d.message || 'Done.', d.success ? 'success' : 'error');
      }).catch(function () {
        showAlert(alertEl, 'Unable to reach the server. Please try again.', 'error');
      });
    });
    alertEl.appendChild(btn);
  }

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
          if (result.data.needs_verification) addResendVerification(identifier);
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
  /* ---------- Email verification (link sent before the account is created) ---------- */
  var emailInput    = document.getElementById('email');
  var verifyBtn     = document.getElementById('verifyEmailBtn');
  var verifyBtnText = document.getElementById('verifyEmailBtnText');
  var statusEl      = document.getElementById('emailVerifyStatus');
  var hintEl        = document.getElementById('verifyHint');
  var modal         = document.getElementById('verifyModal');
  var modalEmail    = document.getElementById('verifyModalEmail');
  var modalClose    = document.getElementById('verifyModalClose');
  var modalError    = document.getElementById('verifyModalError');
  var resendBtn     = document.getElementById('resendEmailCodeBtn');
  var resendTimerEl = document.getElementById('resendEmailTimer');
  var codeToggle    = document.getElementById('verifyCodeToggle');
  var codeRow       = document.getElementById('verifyCodeRow');
  var codeInput     = document.getElementById('verifyCodeInput');
  var codeBtn       = document.getElementById('verifyCodeBtn');
  var emailVerified = false;
  var resendCountdown = null;
  var pollTimer = null;

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    });
  }

  function openModal(email) {
    modalEmail.textContent = email;
    modalError.textContent = '';
    codeRow.hidden = true;
    codeToggle.hidden = false;
    codeInput.value = '';
    modal.hidden = false;
    document.body.classList.add('modal-open');
    startPolling();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    stopPolling();
  }

  // Sign Up is enabled only after the email is verified AND the guest agreed to the terms.
  var consentEl = document.getElementById('consent');
  function refreshSubmit() {
    var agreed = !consentEl || consentEl.checked;
    submitBtn.disabled = !(emailVerified && agreed);
    if (!emailVerified) {
      hintEl.textContent = 'Verify your email to enable Sign Up.';
      hintEl.classList.remove('is-hidden');
    } else if (!agreed) {
      hintEl.textContent = 'Tick the agreement box to enable Sign Up.';
      hintEl.classList.remove('is-hidden');
    } else {
      hintEl.classList.add('is-hidden');
    }
  }
  if (consentEl) consentEl.addEventListener('change', function () {
    setFieldError('consent', '');
    refreshSubmit();
  });

  function setEmailVerified(ok) {
    emailVerified = ok;
    statusEl.textContent = ok ? 'Email verified ✓' : 'Email not verified';
    statusEl.classList.toggle('is-verified', ok);
    statusEl.classList.toggle('is-unverified', !ok);
    emailInput.readOnly = ok;
    emailInput.classList.toggle('is-verified-input', ok);
    verifyBtnText.textContent = ok ? 'Change' : 'Verify';
    verifyBtn.classList.toggle('is-verified', ok);
    verifyBtn.disabled = false;
    refreshSubmit();
    if (ok) {
      closeModal();
      stopResendTimer();
    }
  }

  // While the popup is open, ask the server every 3 seconds whether the link was opened.
  function checkVerified() {
    if (emailVerified) return;
    postJson('php/signup_email.php?action=status', { email: emailInput.value.trim() })
      .then(function (result) {
        if (result.data && result.data.verified) {
          setFieldError('email', '');
          setEmailVerified(true);
        }
      })
      .catch(function () { /* try again on the next tick */ });
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(checkVerified, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Coming back to this tab after opening the email: check right away.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !modal.hidden) checkVerified();
  });

  function stopResendTimer() {
    if (resendCountdown) { clearInterval(resendCountdown); resendCountdown = null; }
    resendTimerEl.textContent = '';
  }

  function startResendTimer(seconds) {
    stopResendTimer();
    resendBtn.disabled = true;
    resendTimerEl.textContent = '(' + seconds + 's)';
    resendCountdown = setInterval(function () {
      seconds--;
      if (seconds <= 0) {
        stopResendTimer();
        resendBtn.disabled = false;
      } else {
        resendTimerEl.textContent = '(' + seconds + 's)';
      }
    }, 1000);
  }

  // Asks the server to email the link. `fromModal` is true when the guest pressed
  // "resend email" inside the popup, so errors are shown there instead.
  function sendVerifyLink(fromModal) {
    var email = emailInput.value.trim();
    setFieldError('email', '');
    modalError.textContent = '';
    if (email === '') { setFieldError('email', 'Email is required.'); return; }
    if (!isValidEmail(email)) { setFieldError('email', 'Enter a valid email address.'); return; }

    var originalLabel = verifyBtnText.textContent;
    verifyBtn.disabled = true;
    resendBtn.disabled = true;
    if (!fromModal) verifyBtnText.textContent = 'Sending...';

    postJson('php/signup_email.php?action=send_link', { email: email })
      .then(function (result) {
        if (result.data.success) {
          openModal(email);
          startResendTimer(30);
        } else if (fromModal) {
          modalError.textContent = result.data.message || 'Could not send the email.';
          if (result.status === 429 && result.data.wait) startResendTimer(result.data.wait);
          else resendBtn.disabled = false;
        } else if (result.status === 429 && result.data.wait) {
          // An email was just sent: reopen the popup instead of showing an error.
          openModal(email);
          startResendTimer(result.data.wait);
        } else {
          setFieldError('email', result.data.message || 'Could not send the email.');
        }
      })
      .catch(function () {
        var msg = 'Unable to reach the server. Please try again.';
        if (fromModal) { modalError.textContent = msg; resendBtn.disabled = false; }
        else setFieldError('email', msg);
      })
      .finally(function () {
        verifyBtn.disabled = false;
        if (!fromModal) verifyBtnText.textContent = originalLabel;
      });
  }

  verifyBtn.addEventListener('click', function () {
    if (emailVerified) {
      // "Change": unlock the email so another one can be verified.
      setEmailVerified(false);
      emailInput.focus();
      return;
    }
    sendVerifyLink(false);
  });

  resendBtn.addEventListener('click', function () { sendVerifyLink(true); });

  // Backup: type the 6-digit code from the email when the link can't be opened.
  codeToggle.addEventListener('click', function () {
    codeToggle.hidden = true;
    codeRow.hidden = false;
    codeInput.focus();
  });

  codeInput.addEventListener('input', function () {
    codeInput.value = codeInput.value.replace(/[^0-9]/g, '').slice(0, 6);
    modalError.textContent = '';
  });
  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); codeBtn.click(); }
  });

  codeBtn.addEventListener('click', function () {
    var code = codeInput.value.trim();
    modalError.textContent = '';
    if (code.length !== 6) { modalError.textContent = 'Enter all 6 digits.'; return; }

    codeBtn.disabled = true;
    codeBtn.textContent = 'Checking...';
    postJson('php/signup_email.php?action=verify_code', { email: emailInput.value.trim(), code: code })
      .then(function (result) {
        if (result.data.success) {
          setFieldError('email', '');
          setEmailVerified(true);
        } else {
          modalError.textContent = result.data.message || 'Incorrect code. Please try again.';
          codeInput.value = '';
          codeInput.focus();
        }
      })
      .catch(function () {
        modalError.textContent = 'Unable to reach the server. Please try again.';
      })
      .finally(function () {
        codeBtn.disabled = false;
        codeBtn.textContent = 'Confirm';
      });
  });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // Typing a different email (before it is verified) stops the old resend timer.
  emailInput.addEventListener('input', function () {
    if (!emailVerified) stopResendTimer();
  });

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
    clearErrors(fieldIds);

    var values = {};
    fieldIds.forEach(function (id) {
      values[id] = document.getElementById(id).value.trim();
    });

    var hasError = false;

    if (!emailVerified) {
      setFieldError('email', 'Verify your email first.');
      return;
    }

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

    if (values.contact_number !== '') {
      var ccSel = document.getElementById('contact_country');
      var ccode = ccSel ? ccSel.value : 'PH';
      if (ccode === 'PH') {
        if (!/^[0-9]{11}$/.test(values.contact_number)) {
          setFieldError('contact_number', 'Enter an 11-digit contact number (e.g. 09XXXXXXXXX).'); hasError = true;
        }
      } else {
        var national = values.contact_number.replace(/^0+/, '');
        if (!/^[0-9]{6,14}$/.test(national)) {
          setFieldError('contact_number', 'Enter a valid phone number for the selected country.'); hasError = true;
        } else {
          var dial = ccSel.options[ccSel.selectedIndex].getAttribute('data-dial');
          values.contact_number = '+' + dial + national;
        }
      }
    }

    if (values.password === '') {
      setFieldError('password', 'Password is required.'); hasError = true;
    } else if (passwordIssue(values.password)) {
      setFieldError('password', passwordIssue(values.password)); hasError = true;
    }

    if (values.confirm_password === '') {
      setFieldError('confirm_password', 'Please confirm your password.'); hasError = true;
    } else if (values.password !== values.confirm_password) {
      setFieldError('confirm_password', 'Passwords do not match.'); hasError = true;
    }

    if (consentEl && !consentEl.checked) { setFieldError('consent', 'Please agree to the Terms and Conditions.'); hasError = true; }

    if (hasError) return;
    values.consent = true;

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';

    Promise.resolve().then(function () {
      return fetch('php/register.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(values)
      });
    })
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (result) {
        if (result.data.success) {
          showAlert(alertEl, result.data.message || 'Registration successful.', 'success');
          form.reset();
          setEmailVerified(false);
          setTimeout(function () {
            window.location.href = result.data.redirect || 'index.html';
          }, result.data.needs_verification ? 6000 : 1200);
        } else {
          if (result.status === 403) setEmailVerified(false);
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
        refreshSubmit();
        submitBtn.textContent = originalText;
      });
  });
}

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
// Contact number: country code picker. Philippines = 11 digits (09XXXXXXXXX);
// other countries = digits only, saved as +<country code><number>.
(function () {
  var cn = document.getElementById('contact_number');
  var cc = document.getElementById('contact_country');
  if (!cn) return;
  function isPH() { return !cc || cc.value === 'PH'; }
  function apply() {
    var d = cn.value.replace(/\D/g, '').slice(0, isPH() ? 11 : 14);
    if (cn.value !== d) cn.value = d;
    cn.maxLength = isPH() ? 11 : 14;
    cn.placeholder = isPH() ? '09XXXXXXXXX' : 'Phone number';
  }
  cn.addEventListener('input', apply);
  if (cc) cc.addEventListener('change', apply);
  apply();
})();
