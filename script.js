/* ============================================================
   VisitorSarthi — Application Logic (script.js)
   Standalone frontend controller with offline capability, device controls,
   receptionist queue dashboard, history analytics, and state flows.
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     CONFIGURATION
     ========================================================== */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyBgjHk04NPHQSO9CjaOUbhUXvJPnw9x5L_4vTR4700FMNgEvpTDY6j0hZlujvOpKaz/exec';

  /* ---------- State ---------- */
  var state = {
    hosts: [],
    cameraStream: null,
    capturedImage: null,
    idCardImage: null,
    oldVisitorPhoto: null,
    isSubmitting: false,
    currentTab: 'register',
    pendingCheckoutId: null,
    videoDevices: []
  };

  /* ---------- DOM References ---------- */
  var dom = {};

  /** Caches DOM references */
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
    dom.btnSwitchCamera = document.getElementById('btnSwitchCamera');
    dom.cameraSource = document.getElementById('cameraSource');
    dom.cameraSelectGroup = document.getElementById('cameraSelectGroup');
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

  /* ---------- IndexedDB Configuration ---------- */
  var DB_NAME = 'VisitorSarthiDB';
  var DB_VERSION = 1;
  var STORE_NAME = 'offline_registrations';
  var db = null;

  function initDB(callback) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function (e) {
      var database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = function (e) {
      db = e.target.result;
      if (callback) callback();
    };
    request.onerror = function (e) {
      console.error('IndexedDB open error:', e);
      showToast('IndexedDB error. Offline storage disabled.', 'error');
    };
  }

  function saveOfflineRecord(payload, callback) {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    var transaction = db.transaction([STORE_NAME], 'readwrite');
    var store = transaction.objectStore(STORE_NAME);
    var request = store.add(payload);
    request.onsuccess = function () {
      if (callback) callback();
    };
    request.onerror = function (e) {
      console.error('Save offline record error:', e);
    };
  }

  function getOfflineRecords(callback) {
    if (!db) return callback([]);
    var transaction = db.transaction([STORE_NAME], 'readonly');
    var store = transaction.objectStore(STORE_NAME);
    var request = store.getAll();
    request.onsuccess = function (e) {
      callback(e.target.result || []);
    };
  }

  function deleteOfflineRecord(id, callback) {
    if (!db) return;
    var transaction = db.transaction([STORE_NAME], 'readwrite');
    var store = transaction.objectStore(STORE_NAME);
    var request = store.delete(id);
    request.onsuccess = function () {
      if (callback) callback();
    };
  }

  /* ---------- Initialization ---------- */
  function init() {
    cacheDom();
    initDB(function () {
      updateNetworkStatus();
    });
    bindEvents();
    loadHosts();
    enumerateVideoDevices();
  }

  /** Binds event listeners */
  function bindEvents() {
    // Cameras & Capture
    dom.btnStartCamera.addEventListener('click', startCamera);
    dom.btnSwitchCamera.addEventListener('click', function () {
      if (state.videoDevices.length > 1) {
        var selected = dom.cameraSource.selectedIndex;
        dom.cameraSource.selectedIndex = (selected + 1) % state.videoDevices.length;
        startCamera();
      }
    });
    dom.cameraSource.addEventListener('change', startCamera);
    dom.btnCapture.addEventListener('click', capturePhoto);
    dom.btnRetake.addEventListener('click', retakePhoto);

    // ID Card Camera
    var idCardType = document.getElementById('idCardType');
    if (idCardType) {
      idCardType.addEventListener('change', handleIdCardTypeChange);
    }
    var btnStartId = document.getElementById('btnStartIdCamera');
    if (btnStartId) btnStartId.addEventListener('click', startIdCardCamera);
    var btnCaptureId = document.getElementById('btnCaptureId');
    if (btnCaptureId) btnCaptureId.addEventListener('click', captureIdCard);
    var btnRetakeId = document.getElementById('btnRetakeId');
    if (btnRetakeId) btnRetakeId.addEventListener('click', retakeIdCard);

    // Form Submission & Reset
    dom.btnSubmit.addEventListener('click', handleSubmit);
    dom.btnNewVisitor.addEventListener('click', resetForm);

    // Auto-fill & Search (Keyup triggers check at 10 digits)
    dom.mobileNumber.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 10);
      if (this.value.length === 10) {
        lookupVisitor(this.value);
      } else {
        hideRepeatVisitorBanner();
      }
    });

    dom.aadhaarLast4.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });

    var btnUseOld = document.getElementById('btnUseOldPhoto');
    if (btnUseOld) {
      btnUseOld.addEventListener('click', useOldPhoto);
    }

    // Tabs
    var tabRegister = document.getElementById('tabRegister');
    var tabDashboard = document.getElementById('tabDashboard');
    if (tabRegister && tabDashboard) {
      tabRegister.addEventListener('click', function () { switchTab('register'); });
      tabDashboard.addEventListener('click', function () { switchTab('dashboard'); });
    }

    // Remarks modal confirmation
    var btnCancelRemarks = document.getElementById('btnCancelRemarks');
    if (btnCancelRemarks) btnCancelRemarks.addEventListener('click', closeRemarksModal);
    var btnConfirmCheckout = document.getElementById('btnConfirmCheckout');
    if (btnConfirmCheckout) btnConfirmCheckout.addEventListener('click', handleConfirmCheckout);

    // History drawer close
    var btnHistoryClose = document.getElementById('btnHistoryClose');
    if (btnHistoryClose) btnHistoryClose.addEventListener('click', closeHistory);
    var historyOverlay = document.getElementById('historyDrawerOverlay');
    if (historyOverlay) historyOverlay.addEventListener('click', closeHistory);

    // Dashboard search
    var dashboardSearch = document.getElementById('dashboardSearchInput');
    if (dashboardSearch) {
      dashboardSearch.addEventListener('input', handleDashboardSearch);
    }

    // Network connection listeners
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
  }

  /* ---------- Network State Badge & Sync ---------- */
  function updateNetworkStatus() {
    var badge = document.getElementById('networkBadge');
    if (!badge) return;
    if (navigator.onLine) {
      badge.className = 'network-badge online';
      badge.querySelector('.badge-text').textContent = 'Online';
      syncOfflineRecords();
    } else {
      badge.className = 'network-badge offline';
      badge.querySelector('.badge-text').textContent = 'Offline';
      showToast('You are currently offline. Data will save locally.', 'warning');
    }
  }

  function syncOfflineRecords() {
    if (!navigator.onLine) return;
    getOfflineRecords(function (records) {
      if (records.length === 0) return;

      showToast('Syncing ' + records.length + ' offline registrations...', 'info');

      var cleanRecords = records.map(function (r) {
        var copy = Object.assign({}, r);
        delete copy.id;
        return copy;
      });

      fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync',
          records: cleanRecords
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.success) {
            showToast('Synchronized successfully!', 'success');
            records.forEach(function (r) {
              deleteOfflineRecord(r.id);
            });
            if (state.currentTab === 'dashboard') {
              loadDashboardData();
            }
          } else {
            showToast('Sync failed: ' + json.message, 'error');
          }
        })
        .catch(function (err) {
          console.error('Sync error:', err);
        });
    });
  }

  /* ---------- Video Source Management ---------- */
  function enumerateVideoDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    navigator.mediaDevices.enumerateDevices()
      .then(function (devices) {
        state.videoDevices = devices.filter(function (d) { return d.kind === 'videoinput'; });
        populateCameraSelect();
      })
      .catch(function (err) {
        console.error('Enumerate devices error:', err);
      });
  }

  function populateCameraSelect() {
    if (!dom.cameraSource) return;
    dom.cameraSource.innerHTML = '';
    if (state.videoDevices.length === 0) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Default Camera';
      dom.cameraSource.appendChild(opt);
      return;
    }
    state.videoDevices.forEach(function (device, index) {
      var opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.textContent = device.label || ('Camera ' + (index + 1));
      dom.cameraSource.appendChild(opt);
    });
  }

  /* ---------- Camera Operations ---------- */
  function startCamera() {
    if (state.cameraStream) {
      stopCamera();
    }

    var deviceId = dom.cameraSource ? dom.cameraSource.value : null;

    var constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
      audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        state.cameraStream = stream;
        dom.videoElement.srcObject = stream;
        dom.videoElement.play();

        if (state.videoDevices.length <= 1) {
          enumerateVideoDevices();
        }

        dom.cameraPlaceholder.classList.add('hidden');
        dom.videoElement.classList.remove('hidden');
        dom.capturedPreview.classList.add('hidden');

        dom.btnStartCamera.classList.add('hidden');
        if (state.videoDevices.length > 1) {
          dom.btnSwitchCamera.classList.remove('hidden');
        }
        if (dom.cameraSelectGroup) dom.cameraSelectGroup.classList.remove('hidden');
        dom.btnCapture.classList.remove('hidden');
        dom.btnRetake.classList.add('hidden');
      })
      .catch(function (err) {
        console.error('Camera access error:', err);
        if (deviceId) {
          if (dom.cameraSource) dom.cameraSource.value = '';
          startCamera();
        } else {
          showToast('Camera error: ' + err.message, 'error');
        }
      });
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });
      state.cameraStream = null;
    }
  }

  function capturePhoto() {
    var video = dom.videoElement;
    var canvas = document.createElement('canvas');
    var vw = video.videoWidth;
    var vh = video.videoHeight;

    var maxDim = 900;
    var scale = 1;
    if (vw > maxDim || vh > maxDim) {
      scale = maxDim / Math.max(vw, vh);
    }

    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    var quality = 0.45;
    var dataUrl = canvas.toDataURL('image/jpeg', quality);

    state.capturedImage = dataUrl;
    dom.capturedPreview.src = dataUrl;
    dom.capturedPreview.classList.remove('hidden');
    dom.videoElement.classList.add('hidden');

    dom.btnCapture.classList.add('hidden');
    dom.btnRetake.classList.remove('hidden');

    stopCamera();
    showToast('Photo captured successfully', 'success');
  }

  function retakePhoto() {
    state.capturedImage = null;
    dom.capturedPreview.src = '';
    dom.capturedPreview.classList.add('hidden');
    startCamera();
  }

  /* ---------- ID Card Camera ---------- */
  var idCardStream = null;

  function handleIdCardTypeChange() {
    var idCardSection = document.getElementById('idCardSection');
    if (!idCardSection) return;

    if (this.value) {
      idCardSection.classList.remove('hidden');
    } else {
      idCardSection.classList.add('hidden');
      stopIdCardCamera();
      state.idCardImage = null;
      document.getElementById('idCardPreview').src = '';
      document.getElementById('idCardPreview').classList.add('hidden');
      document.getElementById('idCardVideo').classList.add('hidden');
      document.getElementById('idCardPlaceholder').classList.remove('hidden');
      document.getElementById('btnStartIdCamera').classList.remove('hidden');
      document.getElementById('btnCaptureId').classList.add('hidden');
      document.getElementById('btnRetakeId').classList.add('hidden');
    }
  }

  function startIdCardCamera() {
    if (idCardStream) {
      stopIdCardCamera();
    }

    var constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    var video = document.getElementById('idCardVideo');
    var placeholder = document.getElementById('idCardPlaceholder');
    var preview = document.getElementById('idCardPreview');
    var btnStart = document.getElementById('btnStartIdCamera');
    var btnCapture = document.getElementById('btnCaptureId');
    var btnRetake = document.getElementById('btnRetakeId');

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        idCardStream = stream;
        video.srcObject = stream;
        video.play();

        placeholder.classList.add('hidden');
        video.classList.remove('hidden');
        preview.classList.add('hidden');

        btnStart.classList.add('hidden');
        btnCapture.classList.remove('hidden');
        btnRetake.classList.add('hidden');
      })
      .catch(function (err) {
        console.error('ID Camera error:', err);
        showToast('Unable to start rear camera: ' + err.message, 'error');
      });
  }

  function stopIdCardCamera() {
    if (idCardStream) {
      idCardStream.getTracks().forEach(function (track) {
        track.stop();
      });
      idCardStream = null;
    }
  }

  function captureIdCard() {
    var video = document.getElementById('idCardVideo');
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    var dataUrl = canvas.toDataURL('image/jpeg', 0.45);
    state.idCardImage = dataUrl;

    var preview = document.getElementById('idCardPreview');
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    video.classList.add('hidden');

    document.getElementById('btnCaptureId').classList.add('hidden');
    document.getElementById('btnRetakeId').classList.remove('hidden');

    stopIdCardCamera();
    showToast('ID Card captured successfully', 'success');
  }

  function retakeIdCard() {
    state.idCardImage = null;
    var preview = document.getElementById('idCardPreview');
    preview.src = '';
    preview.classList.add('hidden');
    startIdCardCamera();
  }

  /* ---------- Visitor Lookup & Auto-fill ---------- */
  function lookupVisitor(mobile) {
    if (!navigator.onLine) {
      showToast('Offline Mode: Search disabled', 'info');
      return;
    }

    fetch(API_URL + '?action=search&mobile=' + mobile, {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data && json.data.visitor) {
          var visitor = json.data.visitor;
          var history = json.data.history || {};

          dom.visitorName.value = visitor.name || '';
          dom.company.value = visitor.company || '';
          dom.aadhaarLast4.value = visitor.aadhaarLast4 || '';

          state.oldVisitorPhoto = visitor.photo || null;
          showRepeatVisitorBanner(visitor, history);
          showToast('Auto-filled repeat visitor details!', 'success');
        } else {
          hideRepeatVisitorBanner();
        }
      })
      .catch(function (err) {
        console.error('Lookup error:', err);
      });
  }

  function showRepeatVisitorBanner(visitor, history) {
    var banner = document.getElementById('repeatVisitorBanner');
    var img = document.getElementById('repeatVisitorImage');
    var name = document.getElementById('repeatVisitorName');
    var total = document.getElementById('repeatTotalVisits');
    var last = document.getElementById('repeatLastVisit');
    var host = document.getElementById('repeatLastHost');
    var avg = document.getElementById('repeatAvgStay');
    var remarksWrapper = document.getElementById('repeatRemarksWrapper');
    var remarks = document.getElementById('repeatRemarks');
    var btnUseOld = document.getElementById('btnUseOldPhoto');

    if (!banner) return;

    name.textContent = visitor.name || 'Visitor';
    total.textContent = history.totalVisits || '1';
    last.textContent = history.lastVisit || 'N/A';
    host.textContent = history.lastHost || 'N/A';
    avg.textContent = history.averageStay || 'N/A';

    if (history.remarks) {
      remarks.textContent = history.remarks;
      remarksWrapper.classList.remove('hidden');
    } else {
      remarksWrapper.classList.add('hidden');
    }

    if (visitor.photo) {
      img.src = visitor.photo;
      btnUseOld.classList.remove('hidden');
    } else {
      img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      btnUseOld.classList.add('hidden');
    }

    banner.classList.remove('hidden');
  }

  function hideRepeatVisitorBanner() {
    var banner = document.getElementById('repeatVisitorBanner');
    if (banner) {
      banner.classList.add('hidden');
    }
    state.oldVisitorPhoto = null;
  }

  function useOldPhoto() {
    if (state.oldVisitorPhoto) {
      state.capturedImage = state.oldVisitorPhoto;
      dom.capturedPreview.src = state.oldVisitorPhoto;
      dom.capturedPreview.classList.remove('hidden');
      dom.videoElement.classList.add('hidden');
      dom.cameraPlaceholder.classList.add('hidden');
      dom.btnStartCamera.classList.remove('hidden');
      dom.btnSwitchCamera.classList.add('hidden');
      if (dom.cameraSelectGroup) dom.cameraSelectGroup.classList.add('hidden');
      dom.btnCapture.classList.add('hidden');
      dom.btnRetake.classList.remove('hidden');
      stopCamera();
      showToast('Loaded previous visit photo', 'success');
    }
  }

  /* ---------- Host Loading ---------- */
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
        showToast('Network error loading hosts.', 'error');
      })
      .finally(function () {
        dom.hostSkeleton.classList.add('hidden');
        dom.hostName.classList.remove('hidden');
        setTimeout(function () {
          dom.pageLoader.classList.add('hidden');
        }, 600);
      });
  }

  function populateHostDropdown(hosts) {
    dom.hostName.innerHTML = '<option value="">-- Select Host --</option>';
    hosts.forEach(function (host) {
      var opt = document.createElement('option');
      opt.value = host.name;
      opt.textContent = host.name + (host.department ? ' (' + host.department + ')' : '');
      dom.hostName.appendChild(opt);
    });
  }

  /* ---------- Form Validation ---------- */
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

  function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.classList.remove('visible');
      el.textContent = '';
    });
    document.querySelectorAll('.form-control.error').forEach(function (el) {
      el.classList.remove('error');
    });
  }

  /* ---------- Submit Logic ---------- */
  function handleSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    var errors = validateForm();
    if (errors.length > 0) {
      showToast(errors[0].msg, 'error');
      return;
    }

    var payload = {
      visitorName: dom.visitorName.value.trim(),
      mobileNumber: dom.mobileNumber.value.trim(),
      company: dom.company.value.trim(),
      hostName: dom.hostName.value,
      purpose: dom.purpose.value.trim(),
      aadhaarLast4: dom.aadhaarLast4.value.trim(),
      visitorImage: state.capturedImage,
      idCardType: document.getElementById('idCardType').value || '',
      idCardImage: state.idCardImage || ''
    };

    setSubmitting(true);

    if (!navigator.onLine) {
      payload.checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      payload.visitorId = 'OFF-' + Math.random().toString(36).substr(2, 9).toUpperCase();

      saveOfflineRecord(payload, function () {
        setSubmitting(false);
        showSuccessScreen({
          visitorId: payload.visitorId,
          hostName: payload.hostName,
          checkInTime: payload.checkInTime,
          hostMobile: ''
        });
        showToast('Saved offline. Data will sync when you are online.', 'warning');
      });
      return;
    }

    payload.action = 'register';

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
        payload.checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        payload.visitorId = 'ERR-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        saveOfflineRecord(payload, function () {
          showSuccessScreen({
            visitorId: payload.visitorId,
            hostName: payload.hostName,
            checkInTime: payload.checkInTime,
            hostMobile: ''
          });
          showToast('Saved locally due to connection failure.', 'warning');
        });
      })
      .finally(function () {
        setSubmitting(false);
      });
  }

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

  /* ---------- Success Screen ---------- */
  function showSuccessScreen(data) {
    dom.formSection.classList.add('hidden');
    dom.successScreen.classList.add('active');

    dom.successVisitorId.textContent = data.visitorId || '';
    dom.successHostName.textContent = data.hostName || '';
    dom.successTime.textContent = data.checkInTime || '';

    var successPhoto = document.getElementById('successVisitorPhoto');
    if (successPhoto && state.capturedImage) {
      successPhoto.src = state.capturedImage;
    }
    var successName = document.getElementById('successVisitorNameDisplay');
    if (successName) {
      successName.textContent = dom.visitorName.value.trim() || 'Visitor';
    }

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
    stopIdCardCamera();
  }

  function resetForm() {
    dom.successScreen.classList.remove('active');
    dom.formSection.classList.remove('hidden');

    dom.visitorName.value = '';
    dom.mobileNumber.value = '';
    dom.company.value = '';
    dom.hostName.value = '';
    dom.purpose.value = '';
    dom.aadhaarLast4.value = '';

    var idCardSelect = document.getElementById('idCardType');
    if (idCardSelect) {
      idCardSelect.value = '';
      handleIdCardTypeChange.call(idCardSelect);
    }

    var successPhoto = document.getElementById('successVisitorPhoto');
    if (successPhoto) {
      successPhoto.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
    var successName = document.getElementById('successVisitorNameDisplay');
    if (successName) {
      successName.textContent = 'Visitor Name';
    }

    state.capturedImage = null;
    state.idCardImage = null;
    dom.capturedPreview.src = '';
    dom.capturedPreview.classList.add('hidden');
    dom.videoElement.classList.add('hidden');
    dom.cameraPlaceholder.classList.remove('hidden');

    dom.btnStartCamera.classList.remove('hidden');
    dom.btnSwitchCamera.classList.add('hidden');
    if (dom.cameraSelectGroup) dom.cameraSelectGroup.classList.add('hidden');
    dom.btnCapture.classList.add('hidden');
    dom.btnRetake.classList.add('hidden');

    hideRepeatVisitorBanner();
    clearFieldErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Navigation Tabs ---------- */
  function switchTab(tab) {
    var tabRegister = document.getElementById('tabRegister');
    var tabDashboard = document.getElementById('tabDashboard');

    if (tab === 'register') {
      tabRegister.classList.add('active');
      tabDashboard.classList.remove('active');
      dom.formSection.classList.remove('hidden');
      document.getElementById('dashboardSection').classList.add('hidden');
      dom.successScreen.classList.remove('active');
      state.currentTab = 'register';
    } else {
      tabRegister.classList.remove('active');
      tabDashboard.classList.add('active');
      dom.formSection.classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');
      dom.successScreen.classList.remove('active');
      state.currentTab = 'dashboard';
      loadDashboardData();
    }
  }

  /* ---------- Dashboard Controller ---------- */
  var dashboardVisitors = [];

  function loadDashboardData() {
    var listContainer = document.getElementById('dashboardVisitorList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><span class="spinner"></span> Loading dashboard queue...</div>';

    if (!navigator.onLine) {
      listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--warning);">⚠️ Dashboard queue requires an active network.</div>';
      return;
    }

    fetch(API_URL + '?action=dashboard', {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data) {
          dashboardVisitors = json.data.visitors || [];
          updateDashboardStats(json.data.stats || {});
          renderVisitorList(dashboardVisitors);
        } else {
          showToast('Failed to retrieve dashboard records.', 'error');
          listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Failed to load dashboard data.</div>';
        }
      })
      .catch(function (err) {
        console.error('Dashboard load error:', err);
        listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Network error loading live queue.</div>';
      });
  }

  function updateDashboardStats(stats) {
    document.getElementById('statToday').textContent = stats.today || 0;
    document.getElementById('statInside').textContent = stats.inside || 0;
    document.getElementById('statExpected').textContent = stats.expected || 0;
    document.getElementById('statCheckedOut').textContent = stats.checkedOut || 0;
    document.getElementById('statRejected').textContent = stats.rejected || 0;
  }

  function renderVisitorList(visitors) {
    var listContainer = document.getElementById('dashboardVisitorList');
    if (!listContainer) return;

    if (visitors.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No visitor entries matching filters today.</div>';
      return;
    }

    listContainer.innerHTML = '';

    visitors.forEach(function (visitor) {
      var card = document.createElement('div');
      card.className = 'visitor-item-card';

      var statusClass = 'status-waiting';
      var statusLower = (visitor.status || '').toLowerCase();
      if (statusLower === 'inside') statusClass = 'status-inside';
      else if (statusLower === 'approved') statusClass = 'status-approved';
      else if (statusLower === 'checked out') statusClass = 'status-checked-out';
      else if (statusLower === 'rejected') statusClass = 'status-rejected';

      var photoUrl = visitor.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

      var badgeHtml = '<span class="status-badge ' + statusClass + '">' + (visitor.status || 'Waiting') + '</span>';

      var actionsHtml = '';
      if (statusLower === 'waiting approval') {
        actionsHtml = '<button type="button" class="btn btn-primary btn-sm btn-approve" data-id="' + visitor.id + '" style="background: var(--success); border-color: var(--success); font-size: 0.75rem; padding: 4px 8px; margin-right: 4px;">Approve</button>' +
          '<button type="button" class="btn btn-secondary btn-sm btn-reject" data-id="' + visitor.id + '" style="background: var(--danger); border-color: var(--danger); font-size: 0.75rem; padding: 4px 8px;">Reject</button>';
      } else if (statusLower === 'approved') {
        actionsHtml = '<button type="button" class="btn btn-primary btn-sm btn-checkin" data-id="' + visitor.id + '" style="font-size: 0.75rem; padding: 4px 8px;">Check In</button>';
      } else if (statusLower === 'inside') {
        actionsHtml = '<button type="button" class="btn btn-secondary btn-sm btn-checkout" data-id="' + visitor.id + '" style="background: var(--warning); border-color: var(--warning); font-size: 0.75rem; padding: 4px 8px;">Check Out</button>';
      }

      var timeLabel = visitor.checkOutTime ? 'Stay: ' + (visitor.duration || '') : 'Time: ' + (visitor.checkInTime || '');

      card.innerHTML =
        '<div class="visitor-avatar btn-view-history" data-mobile="' + visitor.mobile + '" title="View History">' +
        '<img src="' + photoUrl + '" alt="Visitor photo">' +
        '</div>' +
        '<div class="visitor-details">' +
        '<div class="visitor-meta-main">' +
        '<span class="visitor-meta-name">' + escapeHtml(visitor.name) + '</span>' +
        '<span class="visitor-meta-sub">' + visitor.mobile + ' | ' + escapeHtml(visitor.company || 'Personal') + '</span>' +
        '</div>' +
        '<div class="visitor-meta-visit">' +
        '<div>Host: <strong>' + escapeHtml(visitor.host) + '</strong></div>' +
        '<div style="font-size:0.75rem; color:var(--text-secondary);">' + timeLabel + '</div>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top: 4px;">' +
        badgeHtml +
        '<div class="visitor-item-actions">' + actionsHtml + '</div>' +
        '</div>' +
        '</div>';

      listContainer.appendChild(card);
    });

    listContainer.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        updateStatus(e.target.getAttribute('data-id'), 'Approved');
      });
    });
    listContainer.querySelectorAll('.btn-reject').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        updateStatus(e.target.getAttribute('data-id'), 'Rejected');
      });
    });
    listContainer.querySelectorAll('.btn-checkin').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        updateStatus(e.target.getAttribute('data-id'), 'Inside');
      });
    });
    listContainer.querySelectorAll('.btn-checkout').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        state.pendingCheckoutId = e.target.getAttribute('data-id');
        openRemarksModal();
      });
    });
    listContainer.querySelectorAll('.btn-view-history').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var parent = e.target.closest('.btn-view-history');
        if (parent) {
          viewHistory(parent.getAttribute('data-mobile'));
        }
      });
    });
  }

  function updateStatus(id, newStatus, remarks) {
    if (!navigator.onLine) {
      showToast('Action requires connection.', 'error');
      return;
    }

    var payload = {
      action: 'status',
      id: id,
      status: newStatus,
      remarks: remarks || ''
    };

    fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success) {
          showToast('Visitor status updated to ' + newStatus, 'success');
          loadDashboardData();
        } else {
          showToast('Update failed: ' + json.message, 'error');
        }
      })
      .catch(function (err) {
        console.error('Update status error:', err);
        showToast('Network error updating state.', 'error');
      });
  }

  function openRemarksModal() {
    var modal = document.getElementById('remarksModal');
    var remarksInput = document.getElementById('checkoutRemarks');
    if (modal) {
      remarksInput.value = '';
      modal.classList.remove('hidden');
    }
  }

  function closeRemarksModal() {
    var modal = document.getElementById('remarksModal');
    if (modal) {
      modal.classList.add('hidden');
    }
    state.pendingCheckoutId = null;
  }

  function handleConfirmCheckout() {
    var remarksInput = document.getElementById('checkoutRemarks');
    var remarks = remarksInput ? remarksInput.value.trim() : '';
    if (state.pendingCheckoutId) {
      updateStatus(state.pendingCheckoutId, 'Checked Out', remarks);
    }
    closeRemarksModal();
  }

  function handleDashboardSearch(e) {
    var query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderVisitorList(dashboardVisitors);
      return;
    }

    var filtered = dashboardVisitors.filter(function (v) {
      var name = (v.name || '').toLowerCase();
      var mobile = (v.mobile || '').toLowerCase();
      var host = (v.host || '').toLowerCase();
      var company = (v.company || '').toLowerCase();
      var id = (v.id || '').toLowerCase();
      return name.indexOf(query) !== -1 ||
        mobile.indexOf(query) !== -1 ||
        host.indexOf(query) !== -1 ||
        company.indexOf(query) !== -1 ||
        id.indexOf(query) !== -1;
    });

    renderVisitorList(filtered);
  }

  /* ---------- Visitor History drawer ---------- */
  function viewHistory(mobile) {
    var overlay = document.getElementById('historyDrawerOverlay');
    var drawer = document.getElementById('historyDrawer');
    if (!overlay || !drawer) return;

    document.getElementById('historyProfileName').textContent = 'Loading...';
    document.getElementById('historyProfileMobile').textContent = mobile;
    document.getElementById('historyProfileCompany').textContent = '';
    document.getElementById('historyProfilePhoto').src = '';
    document.getElementById('historyStatTotal').textContent = '0';
    document.getElementById('historyStatAvg').textContent = 'N/A';
    document.getElementById('historyStatAadhaar').textContent = '0000';
    document.getElementById('historyTimeline').innerHTML = '<div style="text-align: center; padding: 20px;">Loading profile data...</div>';

    overlay.classList.remove('hidden');
    drawer.classList.remove('hidden');

    if (!navigator.onLine) {
      document.getElementById('historyTimeline').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--warning);">⚠️ History requires an active network.</div>';
      return;
    }

    fetch(API_URL + '?action=history&mobile=' + mobile, {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data) {
          var profile = json.data.profile || {};
          var stats = json.data.stats || {};
          var visits = json.data.visits || [];

          document.getElementById('historyProfileName').textContent = profile.name || 'Visitor';
          document.getElementById('historyProfileMobile').textContent = profile.mobile || mobile;
          document.getElementById('historyProfileCompany').textContent = profile.company || 'Personal';
          document.getElementById('historyProfilePhoto').src = profile.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

          document.getElementById('historyStatTotal').textContent = stats.totalVisits || '0';
          document.getElementById('historyStatAvg').textContent = stats.averageStay || 'N/A';
          document.getElementById('historyStatAadhaar').textContent = profile.aadhaarLast4 || 'N/A';

          var timelineContainer = document.getElementById('historyTimeline');
          if (visits.length === 0) {
            timelineContainer.innerHTML = '<div style="text-align: center; padding: 20px;">No logs recorded.</div>';
            return;
          }

          timelineContainer.innerHTML = '';
          visits.forEach(function (v) {
            var item = document.createElement('div');
            item.className = 'timeline-item';

            var remarksHtml = v.remarks ? '<div class="timeline-remarks">Remarks: ' + escapeHtml(v.remarks) + '</div>' : '';

            item.innerHTML =
              '<div class="timeline-dot"></div>' +
              '<div class="timeline-time">' + v.date + ' ' + (v.checkInTime || '') + ' (' + (v.status || 'Inside') + ')</div>' +
              '<div class="timeline-host">Host: ' + escapeHtml(v.host) + '</div>' +
              '<div class="timeline-purpose">Purpose: ' + escapeHtml(v.purpose) + '</div>' +
              remarksHtml;

            timelineContainer.appendChild(item);
          });
        } else {
          document.getElementById('historyTimeline').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger);">Failed to retrieve history logs.</div>';
        }
      })
      .catch(function (err) {
        console.error('History load error:', err);
        document.getElementById('historyTimeline').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger);">Connection error loading timeline.</div>';
      });
  }

  function closeHistory() {
    var overlay = document.getElementById('historyDrawerOverlay');
    var drawer = document.getElementById('historyDrawer');
    if (overlay) overlay.classList.add('hidden');
    if (drawer) drawer.classList.add('hidden');
  }

  /* ---------- Toast helper ---------- */
  function showToast(message, type) {
    type = type || 'info';
    var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠️' };

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
