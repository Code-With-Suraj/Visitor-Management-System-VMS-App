/* ============================================================
   VMS — Application Logic (script.js)
   Standalone frontend controller for the Visitor Management System.
   Communicates with Google Apps Script deployed as REST API.
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     CONFIGURATION
     Replace the URL below with your deployed Google Apps Script
     Web App URL (the one ending in /exec).
     ========================================================== */
  var API_URL = 'https://script.google.com/macros/s/AKfycby2XFgGV9KqdZZZdCxhdyM75V_U65hu34qfuEZAt0ujWAP9Xy0X9FNMvWfbhvak4_4w/exec';

  /* ---------- State ---------- */
  var state = {
    hosts: [],
    cameraStream: null,
    capturedImage: null,
    isSubmitting: false
  };

  /* ---------- DOM References ---------- */
  var dom = {};

  /** Caches all required DOM references */
  function cacheDom() {
    dom.pageLoader = document.getElementById('pageLoader');
    dom.formSection = document.getElementById('formSection');
    dom.successScreen = document.getElementById('successScreen');

    dom.visitorName = document.getElementById('visitorName');
    dom.mobileNumber = document.getElementById('mobileNumber');
    dom.company = document.getElementById('company');
    dom.hostName = document.getElementById('hostName');
    dom.purpose = document.getElementById('purpose');
    dom.aadhaarLast4 = document.getElementById('aadhaarLast4');

    dom.cameraViewport = document.getElementById('cameraViewport');
    dom.cameraPlaceholder = document.getElementById('cameraPlaceholder');
    dom.videoElement = document.getElementById('videoElement');
    dom.capturedPreview = document.getElementById('capturedPreview');

    dom.btnStartCamera = document.getElementById('btnStartCamera');
    dom.btnCapture = document.getElementById('btnCapture');
    dom.btnRetake = document.getElementById('btnRetake');

    dom.btnSubmit = document.getElementById('btnSubmit');
    dom.btnSubmitText = document.getElementById('btnSubmitText');
    dom.btnSubmitSpinner = document.getElementById('btnSubmitSpinner');

    dom.successVisitorId = document.getElementById('successVisitorId');
    dom.successHostName = document.getElementById('successHostName');
    dom.successTime = document.getElementById('successTime');
    dom.btnWhatsApp = document.getElementById('btnWhatsApp');
    dom.btnNewVisitor = document.getElementById('btnNewVisitor');

    dom.hostSkeleton = document.getElementById('hostSkeleton');
    dom.toastContainer = document.getElementById('toastContainer');
  }

  /* ---------- Initialization ---------- */
  /** Boots the application */
  function init() {
    cacheDom();
    bindEvents();
    loadHosts();
  }

  /** Binds all event listeners */
  function bindEvents() {
    dom.btnStartCamera.addEventListener('click', startCamera);
    dom.btnCapture.addEventListener('click', capturePhoto);
    dom.btnRetake.addEventListener('click', retakePhoto);
    dom.btnSubmit.addEventListener('click', handleSubmit);
    dom.btnNewVisitor.addEventListener('click', resetForm);

    /* Auto-format: allow digits only for mobile */
    dom.mobileNumber.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 10);
    });

    /* Auto-format: allow digits only for Aadhaar */
    dom.aadhaarLast4.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  /* ==========================================================
     HOST LOADING
     Fetches the host list from the GAS REST API via GET request.
     Uses Google Apps Script redirect-based CORS handling.
     ========================================================== */

  /** Fetches host list from the backend API */
  function loadHosts() {
    dom.hostSkeleton.classList.remove('hidden');
    dom.hostName.classList.add('hidden');

    fetch(API_URL + '?action=hosts', {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data && json.data.hosts) {
          state.hosts = json.data.hosts;
          populateHostDropdown(json.data.hosts);
        } else {
          showToast('Failed to load hosts', 'error');
        }
      })
      .catch(function (err) {
        console.error('Host fetch error:', err);
        showToast('Network error loading hosts. Check your connection.', 'error');
      })
      .finally(function () {
        dom.hostSkeleton.classList.add('hidden');
        dom.hostName.classList.remove('hidden');
        hidePageLoader();
      });
  }

  /** Populates the host dropdown with fetched data */
  function populateHostDropdown(hosts) {
    dom.hostName.innerHTML = '<option value="">-- Select Host --</option>';
    hosts.forEach(function (host) {
      var opt = document.createElement('option');
      opt.value = host.name;
      opt.textContent = host.name + (host.department ? ' (' + host.department + ')' : '');
      dom.hostName.appendChild(opt);
    });
  }

  /** Hides the full-page loading screen */
  function hidePageLoader() {
    setTimeout(function () {
      dom.pageLoader.classList.add('hidden');
    }, 600);
  }

  /* ==========================================================
     CAMERA
     Uses navigator.mediaDevices.getUserMedia() for photo capture.
     Defaults to front camera on mobile devices.
     ========================================================== */

  /** Starts the device camera (front-facing on mobile) */
  function startCamera() {
    if (state.cameraStream) {
      stopCamera();
    }

    var constraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        state.cameraStream = stream;
        dom.videoElement.srcObject = stream;
        dom.videoElement.play();

        dom.cameraPlaceholder.classList.add('hidden');
        dom.videoElement.classList.remove('hidden');
        dom.capturedPreview.classList.add('hidden');

        dom.btnStartCamera.classList.add('hidden');
        dom.btnCapture.classList.remove('hidden');
        dom.btnRetake.classList.add('hidden');
      })
      .catch(function (err) {
        console.error('Camera error:', err);
        if (err.name === 'NotAllowedError') {
          showToast('Camera permission denied. Please allow camera access.', 'error');
        } else if (err.name === 'NotFoundError') {
          showToast('No camera found on this device.', 'error');
        } else {
          showToast('Unable to access camera: ' + err.message, 'error');
        }
      });
  }

  /** Stops the active camera stream */
  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });
      state.cameraStream = null;
    }
  }

  /** Captures a photo from the video stream and compresses it */
  function capturePhoto() {
    var video = dom.videoElement;
    var canvas = document.createElement('canvas');

    var vw = video.videoWidth;
    var vh = video.videoHeight;

    /* Scale down to max 900px on longest side */
    var maxDim = 900;
    var scale = 1;
    if (vw > maxDim || vh > maxDim) {
      scale = maxDim / Math.max(vw, vh);
    }

    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    /* Compress to JPEG at 0.45 quality */
    var quality = 0.45;
    var dataUrl = canvas.toDataURL('image/jpeg', quality);

    /* If still over 200KB, compress harder */
    var sizeBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
    if (sizeBytes > 200000 && quality > 0.2) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.3);
    }

    state.capturedImage = dataUrl;
    dom.capturedPreview.src = dataUrl;
    dom.capturedPreview.classList.remove('hidden');
    dom.videoElement.classList.add('hidden');

    dom.btnCapture.classList.add('hidden');
    dom.btnRetake.classList.remove('hidden');

    stopCamera();
    showToast('Photo captured successfully', 'success');
  }

  /** Clears the captured photo and restarts the camera */
  function retakePhoto() {
    state.capturedImage = null;
    dom.capturedPreview.src = '';
    dom.capturedPreview.classList.add('hidden');
    startCamera();
  }

  /* ==========================================================
     FORM VALIDATION (Client-side)
     Validates all fields before submission.
     Server-side validation is the final gatekeeper.
     ========================================================== */

  /** Validates form fields and returns error array */
  function validateForm() {
    var errors = [];
    clearFieldErrors();

    var name = dom.visitorName.value.trim();
    if (!name || name.length < 2) {
      errors.push({ field: 'visitorName', msg: 'Name is required (min 2 characters)' });
    }

    var mobile = dom.mobileNumber.value.trim();
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      errors.push({ field: 'mobileNumber', msg: 'Enter a valid 10-digit mobile number' });
    }

    if (!dom.hostName.value) {
      errors.push({ field: 'hostName', msg: 'Please select a host' });
    }

    var purpose = dom.purpose.value.trim();
    if (!purpose || purpose.length < 3) {
      errors.push({ field: 'purpose', msg: 'Purpose is required (min 3 characters)' });
    }

    var aadhaar = dom.aadhaarLast4.value.trim();
    if (!aadhaar || !/^\d{4}$/.test(aadhaar)) {
      errors.push({ field: 'aadhaarLast4', msg: 'Enter last 4 digits of Aadhaar' });
    }

    if (!state.capturedImage) {
      errors.push({ field: 'camera', msg: 'Please capture a photo' });
    }

    errors.forEach(function (e) {
      showFieldError(e.field, e.msg);
    });

    return errors;
  }

  /** Shows an inline error for a specific form field */
  function showFieldError(fieldId, message) {
    var errorEl = document.getElementById(fieldId + 'Error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
    var inputEl = document.getElementById(fieldId);
    if (inputEl) {
      inputEl.classList.add('error');
    }
  }

  /** Clears all inline field errors */
  function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.classList.remove('visible');
      el.textContent = '';
    });
    document.querySelectorAll('.form-control.error').forEach(function (el) {
      el.classList.remove('error');
    });
  }

  /* ==========================================================
     FORM SUBMISSION
     Sends visitor data as JSON POST to the GAS REST API.
     Uses text/plain Content-Type to avoid CORS preflight.
     ========================================================== */

  /** Handles the submit button click */
  function handleSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    var errors = validateForm();
    if (errors.length > 0) {
      showToast(errors[0].msg, 'error');
      return;
    }

    var payload = {
      action: 'register',
      visitorName: dom.visitorName.value.trim(),
      mobileNumber: dom.mobileNumber.value.trim(),
      company: dom.company.value.trim(),
      hostName: dom.hostName.value,
      purpose: dom.purpose.value.trim(),
      aadhaarLast4: dom.aadhaarLast4.value.trim(),
      visitorImage: state.capturedImage
    };

    setSubmitting(true);

    fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success) {
          showSuccessScreen(json.data);
          showToast(json.message || 'Visitor registered successfully!', 'success');
        } else {
          showToast(json.message || 'Registration failed', 'error');
        }
      })
      .catch(function (err) {
        console.error('Submit error:', err);
        showToast('Network error. Please check your connection and try again.', 'error');
      })
      .finally(function () {
        setSubmitting(false);
      });
  }

  /** Toggles the submit button loading state */
  function setSubmitting(loading) {
    state.isSubmitting = loading;
    dom.btnSubmit.disabled = loading;
    dom.btnSubmitText.textContent = loading ? 'Registering...' : 'Register Visitor';
    if (loading) {
      dom.btnSubmitSpinner.classList.remove('hidden');
    } else {
      dom.btnSubmitSpinner.classList.add('hidden');
    }
  }

  /* ==========================================================
     SUCCESS SCREEN
     Shows registration confirmation and WhatsApp notify button.
     ========================================================== */

  /** Shows the success screen with visitor details */
  function showSuccessScreen(data) {
    dom.formSection.classList.add('hidden');
    dom.successScreen.classList.add('active');

    dom.successVisitorId.textContent = data.visitorId || '';
    dom.successHostName.textContent = data.hostName || '';
    dom.successTime.textContent = data.checkInTime || '';

    /* Populate the digital badge on the success screen */
    var successPhoto = document.getElementById('successVisitorPhoto');
    if (successPhoto && state.capturedImage) {
      successPhoto.src = state.capturedImage;
    }
    var successName = document.getElementById('successVisitorNameDisplay');
    if (successName) {
      successName.textContent = dom.visitorName.value.trim() || 'Visitor';
    }

    /* Build WhatsApp notification URL */
    var hostMobile = data.hostMobile || '';
    if (hostMobile) {
      var visitorName = dom.visitorName.value.trim();
      var purposeText = dom.purpose.value.trim();
      var message = 'Hello,\n\nVisitor *' + visitorName + '* is waiting at the gate.\n\nPurpose: ' + purposeText + '\n\nPlease receive them.';
      var waUrl = 'https://wa.me/91' + hostMobile + '?text=' + encodeURIComponent(message);
      dom.btnWhatsApp.href = waUrl;
      dom.btnWhatsApp.classList.remove('hidden');
    } else {
      dom.btnWhatsApp.classList.add('hidden');
    }

    stopCamera();
  }

  /** Resets the form and shows it for a new visitor */
  function resetForm() {
    dom.successScreen.classList.remove('active');
    dom.formSection.classList.remove('hidden');

    dom.visitorName.value = '';
    dom.mobileNumber.value = '';
    dom.company.value = '';
    dom.hostName.value = '';
    dom.purpose.value = '';
    dom.aadhaarLast4.value = '';

    /* Reset success digital badge fields */
    var successPhoto = document.getElementById('successVisitorPhoto');
    if (successPhoto) {
      successPhoto.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
    var successName = document.getElementById('successVisitorNameDisplay');
    if (successName) {
      successName.textContent = 'Visitor Name';
    }

    state.capturedImage = null;
    dom.capturedPreview.src = '';
    dom.capturedPreview.classList.add('hidden');
    dom.videoElement.classList.add('hidden');
    dom.cameraPlaceholder.classList.remove('hidden');

    dom.btnStartCamera.classList.remove('hidden');
    dom.btnCapture.classList.add('hidden');
    dom.btnRetake.classList.add('hidden');

    clearFieldErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ==========================================================
     TOAST NOTIFICATIONS
     Lightweight toast system for user feedback.
     ========================================================== */

  /** Shows a toast notification */
  function showToast(message, type) {
    type = type || 'info';
    var icons = { success: '✓', error: '✕', info: 'ℹ' };

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span class="toast-message">' + escapeHtml(message) + '</span>';

    dom.toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('exit');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  /** Escapes HTML characters to prevent XSS in toast messages */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
