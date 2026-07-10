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
  var API_URL = 'https://script.google.com/macros/s/AKfycbzZCpyASFtsPucopKl7XC_K4n1hECMgeap1tSAV98xjF5ZLYMbLTVU9oT5neJkVpMgM/exec';

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
    videoDevices: [],
    dashboardUnlocked: false,
    dashboardPassword: '',
    currentPage: 1,
    itemsPerPage: 10,
    filteredVisitors: [],
    isAutoFilled: false,
    registrationUrl: ''
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
    dom.btnNewVisitor = document.getElementById('btnNewVisitor');

    dom.hostSkeleton = document.getElementById('hostSkeleton');
    dom.toastContainer = document.getElementById('toastContainer');

    // Searchable host select elements
    dom.hostSearchInput = document.getElementById('hostSearchInput');
    dom.hostDropdownMenu = document.getElementById('hostDropdownMenu');
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

  /* ---------- Professional Click Ripple & Button Loaders ---------- */

  // Dynamic Ripple Effect delegation
  document.body.addEventListener('click', function (e) {
    var target = e.target.closest('.btn, .tab-button, .pagination-controls button, .visitor-avatar, .drawer-close');
    if (!target) return;
    if (target.disabled || target.classList.contains('disabled')) return;

    var ripple = document.createElement('span');
    ripple.className = 'click-ripple';

    var rect = target.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);

    ripple.style.width = ripple.style.height = size + 'px';

    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top - size / 2;
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    target.appendChild(ripple);

    ripple.addEventListener('animationend', function () {
      ripple.remove();
    });
  });

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 1.5px; border-top-color: currentColor; margin-right: 0;"></span>';
    } else {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
    }
  }

  function setActionsLoading(actionsContainer, clickedBtn, isLoading) {
    if (!actionsContainer) return;
    var buttons = actionsContainer.querySelectorAll('button');
    buttons.forEach(function (btn) {
      if (isLoading) {
        btn.disabled = true;
        if (btn === clickedBtn) {
          btn.classList.add('btn-loading');
          btn.dataset.originalHtml = btn.innerHTML;
          btn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; border-width: 1.5px; border-top-color: currentColor; margin-right: 0;"></span>';
        }
      } else {
        btn.disabled = false;
        if (btn.classList.contains('btn-loading')) {
          btn.classList.remove('btn-loading');
          if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
          }
        }
      }
    });
  }

  function formatVisitDateTime(dateVal) {
    if (!dateVal) return '—';
    var d = dateVal;
    if (typeof dateVal === 'string') {
      var cleanStr = dateVal.trim();
      if (cleanStr.length === 19 && cleanStr.charAt(10) === ' ') {
        cleanStr = cleanStr.substring(0, 10) + 'T' + cleanStr.substring(11);
      }
      d = new Date(cleanStr);
    } else {
      d = new Date(dateVal);
    }

    if (isNaN(d.getTime())) {
      return dateVal;
    }

    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    var dayName = days[d.getDay()];
    var day = d.getDate();
    var monthName = months[d.getMonth()];
    var year = d.getFullYear();

    var hours = d.getHours();
    var minutes = d.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;

    return dayName + ' ,' + day + ' ' + monthName + ' ' + year + ' ' + hours + ':' + minutes + ' ' + ampm;
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
      btnUseOld.addEventListener('click', function () { useOldPhoto(false); });
    }

    // Searchable dropdown select events
    if (dom.hostSearchInput) {
      dom.hostSearchInput.addEventListener('focus', function () {
        filterHosts();
        dom.hostDropdownMenu.classList.remove('hidden');
      });

      dom.hostSearchInput.addEventListener('input', function () {
        if (this.value.trim() === '') {
          dom.hostName.value = '';
        }
        filterHosts();
      });
    }

    document.addEventListener('click', function (e) {
      var container = document.getElementById('hostSearchContainer');
      if (container && !container.contains(e.target)) {
        dom.hostDropdownMenu.classList.add('hidden');
        var currentSelected = null;
        for (var idx = 0; idx < state.hosts.length; idx++) {
          var h = state.hosts[idx];
          var display = h.name + (h.department ? ' (' + h.department + ')' : '');
          if (dom.hostSearchInput.value === display) {
            currentSelected = h;
            break;
          }
        }
        if (!currentSelected) {
          dom.hostName.value = '';
          dom.hostSearchInput.value = '';
        }
      }
    });

    // Tabs
    var tabRegister = document.getElementById('tabRegister');
    var tabDashboard = document.getElementById('tabDashboard');
    if (tabRegister && tabDashboard) {
      tabRegister.addEventListener('click', function (e) { e.preventDefault(); switchTab('register'); });
      tabDashboard.addEventListener('click', function (e) { e.preventDefault(); switchTab('dashboard'); });
    }

    // Remarks modal confirmation
    var btnCancelRemarks = document.getElementById('btnCancelRemarks');
    if (btnCancelRemarks) btnCancelRemarks.addEventListener('click', function (e) { e.preventDefault(); closeRemarksModal(); });
    var btnConfirmCheckout = document.getElementById('btnConfirmCheckout');
    if (btnConfirmCheckout) btnConfirmCheckout.addEventListener('click', function (e) { e.preventDefault(); handleConfirmCheckout(); });

    // QR Code modal
    var btnShowQR = document.getElementById('btnShowQR');
    if (btnShowQR) btnShowQR.addEventListener('click', function (e) { e.preventDefault(); showQRModal(); });
    var btnCloseQR = document.getElementById('btnCloseQR');
    if (btnCloseQR) btnCloseQR.addEventListener('click', function (e) { e.preventDefault(); closeQRModal(); });
    var qrOverlay = document.getElementById('qrCodeModal');
    if (qrOverlay) {
      qrOverlay.addEventListener('click', function (e) {
        if (e.target === qrOverlay) closeQRModal();
      });
    }

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

    // Password modal events
    var btnCancelPassword = document.getElementById('btnCancelPassword');
    if (btnCancelPassword) btnCancelPassword.addEventListener('click', function (e) { e.preventDefault(); closePasswordModal(); });
    var btnConfirmPassword = document.getElementById('btnConfirmPassword');
    if (btnConfirmPassword) btnConfirmPassword.addEventListener('click', function (e) { e.preventDefault(); handleConfirmPassword(); });
    var passwordInput = document.getElementById('dashboardPasswordInput');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          handleConfirmPassword();
        }
      });
    }
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

    // Crop to 1:1 square from center
    var size = Math.min(vw, vh);
    var targetDim = 600; // 600x600 is compact and high quality
    if (size < targetDim) {
      targetDim = size;
    }

    canvas.width = targetDim;
    canvas.height = targetDim;

    var sx = (vw - size) / 2;
    var sy = (vh - size) / 2;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, size, size, 0, 0, targetDim, targetDim);

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
        /* API response structure: jsonSuccess wraps searchVisitorByMobile result
           → json = { success, data: { success, exists, data: { visitor, history } } }
           So the actual visitor data is at json.data.data.visitor */
        var searchResult = json.data || {};
        if (json.success && searchResult.exists && searchResult.data && searchResult.data.visitor) {
          var visitor = searchResult.data.visitor;
          var history = searchResult.data.history || {};

          dom.visitorName.value = visitor.name || '';
          dom.company.value = visitor.company || '';
          dom.aadhaarLast4.value = visitor.aadhaarLast4 || '';

          state.oldVisitorPhoto = visitor.photo || null;
          showRepeatVisitorBanner(visitor, history);

          state.isAutoFilled = true;
          if (visitor.photo) {
            useOldPhoto(true);
          }

          showToast('Returning visitor identified! Details auto-filled.', 'success');
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
    if (state.isAutoFilled) {
      clearAutoFilledDetails();
      state.isAutoFilled = false;
    }
  }

  function useOldPhoto(silent) {
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
      if (!silent) {
        showToast('Loaded previous visit photo', 'success');
      }
    }
  }

  function clearAutoFilledDetails() {
    dom.visitorName.value = '';
    dom.company.value = '';
    dom.aadhaarLast4.value = '';
    state.capturedImage = null;
    dom.capturedPreview.src = '';
    dom.capturedPreview.classList.add('hidden');
    dom.cameraPlaceholder.classList.remove('hidden');
    dom.btnStartCamera.classList.remove('hidden');
    dom.btnSwitchCamera.classList.add('hidden');
    if (dom.cameraSelectGroup) dom.cameraSelectGroup.classList.add('hidden');
    dom.btnCapture.classList.add('hidden');
    dom.btnRetake.classList.add('hidden');
  }

  /* ---------- Host Loading ---------- */
  function loadHosts(isSilent) {
    if (!isSilent) {
      dom.hostSkeleton.classList.remove('hidden');
      dom.hostName.classList.add('hidden');
      var searchContainer = document.getElementById('hostSearchContainer');
      if (searchContainer) searchContainer.classList.add('hidden');
    }

    fetch(API_URL + '?action=hosts', {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data && json.data.hosts) {
          state.hosts = json.data.hosts;
          state.registrationUrl = json.data.registrationUrl || API_URL;
          populateHostDropdown(json.data.hosts);

          // Apply dynamic white-label branding
          if (json.data.companyName) {
            var brandingEl = document.getElementById('appCompanyBranding');
            if (brandingEl) {
              brandingEl.textContent = json.data.companyName;
            }
            var subBrandingEl = document.getElementById('appSubBranding');
            if (subBrandingEl) {
              subBrandingEl.innerHTML = 'Visitor Management &bull; Powered by VisitorSarthi';
            }
            document.title = json.data.companyName + ' — Smart Visitor Management';
          }
        } else {
          showToast('Failed to load hosts', 'error');
        }
      })
      .catch(function (err) {
        console.error('Host fetch error:', err);
        showToast('Network error loading hosts.', 'error');
      })
      .finally(function () {
        if (!isSilent) {
          dom.hostSkeleton.classList.add('hidden');
          var searchContainer = document.getElementById('hostSearchContainer');
          if (searchContainer) {
            searchContainer.classList.remove('hidden');
          } else {
            dom.hostName.classList.remove('hidden');
          }
          setTimeout(function () {
            dom.pageLoader.classList.add('hidden');
          }, 600);
        }
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

  /* ---------- Searchable Dropdown Helper Functions ---------- */
  function filterHosts() {
    var query = dom.hostSearchInput.value.toLowerCase().trim();
    var filtered = state.hosts.filter(function (host) {
      var name = (host.name || '').toLowerCase();
      var dept = (host.department || '').toLowerCase();
      return name.indexOf(query) !== -1 || dept.indexOf(query) !== -1;
    });
    renderHostMenu(filtered);
  }

  function renderHostMenu(hostsToRender) {
    dom.hostDropdownMenu.innerHTML = '';
    if (hostsToRender.length === 0) {
      dom.hostDropdownMenu.innerHTML = '<div class="searchable-select-no-results">No hosts found</div>';
      return;
    }

    hostsToRender.forEach(function (host) {
      var item = document.createElement('div');
      item.className = 'searchable-select-item';
      if (dom.hostName.value === host.name) {
        item.classList.add('selected');
      }
      item.textContent = host.name + (host.department ? ' (' + host.department + ')' : '');
      item.addEventListener('click', function () {
        selectHost(host);
      });
      dom.hostDropdownMenu.appendChild(item);
    });
  }

  function selectHost(host) {
    dom.hostSearchInput.value = host.name + (host.department ? ' (' + host.department + ')' : '');
    dom.hostName.value = host.name;
    dom.hostDropdownMenu.classList.add('hidden');

    // Clear error if active
    dom.hostName.classList.remove('error');
    if (dom.hostSearchInput) dom.hostSearchInput.classList.remove('error');
    var errorEl = document.getElementById('hostNameError');
    if (errorEl) {
      errorEl.classList.remove('visible');
      errorEl.textContent = '';
    }
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

    var company = dom.company.value.trim();
    if (!company || company.length < 3) {
      errors.push({ field: 'company', msg: 'Company / Address is required (min 3 characters)' });
    }

    if (!dom.hostName.value) {
      errors.push({ field: 'hostName', msg: 'Please select a host' });
      if (dom.hostSearchInput) dom.hostSearchInput.classList.add('error');
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
    dom.successTime.textContent = data.timestamp || '';

    var successPhoto = document.getElementById('successVisitorPhoto');
    if (successPhoto && state.capturedImage) {
      successPhoto.src = state.capturedImage;
    }
    var successName = document.getElementById('successVisitorNameDisplay');
    if (successName) {
      successName.textContent = dom.visitorName.value.trim() || 'Visitor';
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

    if (dom.hostSearchInput) {
      dom.hostSearchInput.value = '';
      dom.hostSearchInput.classList.remove('error');
    }
    state.isAutoFilled = false;

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
      loadHosts(true); // Silent dynamic refresh of hosts from Google Sheet!
    } else {
      if (!state.dashboardUnlocked) {
        openPasswordModal();
        return;
      }
      tabRegister.classList.remove('active');
      tabDashboard.classList.add('active');
      dom.formSection.classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');
      dom.successScreen.classList.remove('active');
      state.currentTab = 'dashboard';
      loadDashboardData();
    }
  }

  /* ---------- Dashboard Password Modal ---------- */
  function openPasswordModal() {
    var modal = document.getElementById('passwordModal');
    var input = document.getElementById('dashboardPasswordInput');
    if (modal) {
      input.value = '';
      modal.classList.remove('hidden');
      input.focus();
    }
  }

  function closePasswordModal() {
    var modal = document.getElementById('passwordModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function handleConfirmPassword() {
    var input = document.getElementById('dashboardPasswordInput');
    var password = input ? input.value : '';
    if (!password) {
      showToast('Please enter a password', 'warning');
      return;
    }
    var unlockBtn = document.getElementById('btnConfirmPassword');
    setButtonLoading(unlockBtn, true);
    loadDashboardData(password);
  }

  /* ---------- Dashboard Controller ---------- */
  var dashboardVisitors = [];

  function loadDashboardData(verifyPassword) {
    var listContainer = document.getElementById('dashboardVisitorList');
    if (!listContainer) return;

    var passwordToUse = verifyPassword || state.dashboardPassword;

    listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><span class="spinner"></span> Loading dashboard queue...</div>';

    if (!navigator.onLine) {
      listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--warning);">⚠️ Dashboard queue requires an active network.</div>';
      var unlockBtn = document.getElementById('btnConfirmPassword');
      if (unlockBtn) setButtonLoading(unlockBtn, false);
      return;
    }

    fetch(API_URL + '?action=dashboard&password=' + encodeURIComponent(passwordToUse), {
      method: 'GET',
      redirect: 'follow'
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.data) {
          if (verifyPassword) {
            state.dashboardPassword = verifyPassword;
            state.dashboardUnlocked = true;
            closePasswordModal();
            // Perform tab switch visually
            var tabRegister = document.getElementById('tabRegister');
            var tabDashboard = document.getElementById('tabDashboard');
            tabRegister.classList.remove('active');
            tabDashboard.classList.add('active');
            dom.formSection.classList.add('hidden');
            document.getElementById('dashboardSection').classList.remove('hidden');
            dom.successScreen.classList.remove('active');
            state.currentTab = 'dashboard';
          }
          dashboardVisitors = json.data.visitors || [];
          state.filteredVisitors = dashboardVisitors;
          state.currentPage = 1;
          updateDashboardStats(json.data.stats || {});
          renderVisitorList(state.filteredVisitors);
        } else {
          var errMsg = json.message || 'Failed to retrieve dashboard records.';
          showToast(errMsg, 'error');
          if (verifyPassword) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Enter correct password to unlock dashboard.</div>';
          } else {
            state.dashboardUnlocked = false;
            state.dashboardPassword = '';
            listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">' + escapeHtml(errMsg) + '</div>';
            openPasswordModal();
          }
        }
      })
      .catch(function (err) {
        console.error('Dashboard load error:', err);
        listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--danger);">Network error loading live queue.</div>';
      })
      .finally(function () {
        var unlockBtn = document.getElementById('btnConfirmPassword');
        if (unlockBtn) setButtonLoading(unlockBtn, false);
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
    var paginationContainer = document.getElementById('dashboardPagination');
    if (!listContainer) return;

    if (visitors.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No visitor entries matching filters today.</div>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    // Pagination Calculation
    var totalPages = Math.ceil(visitors.length / state.itemsPerPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    var start = (state.currentPage - 1) * state.itemsPerPage;
    var end = start + state.itemsPerPage;
    var pageVisitors = visitors.slice(start, end);

    listContainer.innerHTML = '';

    pageVisitors.forEach(function (visitor) {
      var card = document.createElement('div');
      card.className = 'visitor-item-card';

      var statusClass = 'status-waiting';
      var statusLower = (visitor.status || '').toLowerCase();
      if (statusLower === 'inside') statusClass = 'status-inside';
      else if (statusLower === 'approved') statusClass = 'status-approved';
      else if (statusLower === 'checked out') statusClass = 'status-checked-out';
      else if (statusLower === 'rejected') statusClass = 'status-rejected';

      var photoUrl = visitor.visitorImage || visitor.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2338bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

      var badgeHtml = '<span class="status-badge ' + statusClass + '">' + (visitor.status || 'Waiting') + '</span>';

      var actionsHtml = '';
      if (statusLower === 'waiting approval') {
        var visitorName = visitor.visitorName || '';
        var companyText = visitor.company || 'Personal';
        var purposeText = visitor.purpose || '';
        var visitorId = visitor.visitorId || '';
        var hostMobile = visitor.hostMobile || '';

        var message = '🏢 *Visitor Approval Request*\n'
          + '━━━━━━━━━━━━━━━━━━━━━\n'
          + '👤 *Name:* ' + visitorName + '\n'
          + '🏭 *Company:* ' + companyText + '\n'
          + '📋 *Purpose:* ' + purposeText + '\n'
          + '🆔 *Visitor ID:* ' + visitorId + '\n'
          + '━━━━━━━━━━━━━━━━━━━━━\n\n'
          + '_Powered by VisitorSarthi_';

        var waUrl = hostMobile ? 'https://wa.me/91' + hostMobile + '?text=' + encodeURIComponent(message) : 'javascript:void(0)';
        var waTarget = hostMobile ? 'target="_blank" rel="noopener"' : '';
        var waClass = hostMobile ? 'btn btn-whatsapp' : 'btn btn-whatsapp disabled';

        actionsHtml = '<a href="' + waUrl + '" ' + waTarget + ' class="' + waClass + '" onclick="event.stopPropagation();" style="font-size:0.75rem !important; padding:6px 12px !important; border-radius:var(--radius-sm); text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600;">💬 Notify</a>' +
          '<button type="button" class="btn btn-approve" data-id="' + visitor.visitorId + '">Approve</button>' +
          '<button type="button" class="btn btn-reject" data-id="' + visitor.visitorId + '">Reject</button>';
      } else if (statusLower === 'approved') {
        actionsHtml = '<button type="button" class="btn btn-checkin" data-id="' + visitor.visitorId + '">Check In</button>';
      } else if (statusLower === 'inside') {
        actionsHtml = '<button type="button" class="btn btn-checkout" data-id="' + visitor.visitorId + '">Check Out</button>';
      }

      var displayTime = visitor.checkInTime || visitor.timestamp || '';
      var formattedTime = formatVisitDateTime(displayTime);
      var timeLabel = '';
      if (statusLower === 'checked out') {
        timeLabel = 'Time: ' + formattedTime + ' (Stay: ' + (visitor.duration || '—') + ')';
      } else {
        timeLabel = 'Time: ' + formattedTime;
      }

      card.innerHTML =
        '<div class="visitor-avatar btn-view-history" data-mobile="' + visitor.mobileNumber + '" title="View History">' +
        '<img src="' + photoUrl + '" alt="Visitor photo">' +
        '</div>' +
        '<div class="visitor-details">' +
        '<div class="visitor-meta-main">' +
        '<span class="visitor-meta-name">' + escapeHtml(visitor.visitorName) + '</span>' +
        '<span class="visitor-meta-sub">' + visitor.mobileNumber + ' | ' + escapeHtml(visitor.company || 'Personal') + '</span>' +
        '</div>' +
        '<div class="visitor-meta-visit">' +
        '<div>Host: <strong>' + escapeHtml(visitor.hostName) + '</strong></div>' +
        '<div style="font-size:0.75rem; color:var(--text-secondary);">' + timeLabel + '</div>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top: 4px;">' +
        badgeHtml +
        '<div class="visitor-item-actions">' + actionsHtml + '</div>' +
        '</div>' +
        '</div>';

      listContainer.appendChild(card);
    });

    // Render Pagination Controls
    if (paginationContainer) {
      if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        paginationContainer.classList.add('hidden');
      } else {
        paginationContainer.classList.remove('hidden');
        paginationContainer.className = 'pagination-container';

        // Stats Summary
        var fromItem = start + 1;
        var toItem = Math.min(end, visitors.length);
        var statsHtml = '<div class="pagination-summary">Showing <span class="highlight">' + fromItem + '</span> to <span class="highlight">' + toItem + '</span> of <span class="highlight">' + visitors.length + '</span> entries</div>';

        // Page Navigation Buttons
        var pagesHtml = '<div class="pagination-pages">';

        // First & Prev buttons
        pagesHtml += '<button type="button" class="pagination-btn first-page" data-page="1" ' + (state.currentPage === 1 ? 'disabled' : '') + ' title="First Page">&laquo;</button>';
        pagesHtml += '<button type="button" class="pagination-btn prev-page" data-page="' + (state.currentPage - 1) + '" ' + (state.currentPage === 1 ? 'disabled' : '') + ' title="Previous Page">&lsaquo;</button>';

        // Numbered buttons with ellipses
        var range = [];
        var rangeWidth = 1; // how many pages around current page
        for (var i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= state.currentPage - rangeWidth && i <= state.currentPage + rangeWidth)) {
            range.push(i);
          } else if (range[range.length - 1] !== '...') {
            range.push('...');
          }
        }

        range.forEach(function (p) {
          if (p === '...') {
            pagesHtml += '<span class="pagination-ellipsis">&hellip;</span>';
          } else {
            var activeClass = p === state.currentPage ? 'active' : '';
            pagesHtml += '<button type="button" class="pagination-btn ' + activeClass + '" data-page="' + p + '">' + p + '</button>';
          }
        });

        // Next & Last buttons
        pagesHtml += '<button type="button" class="pagination-btn next-page" data-page="' + (state.currentPage + 1) + '" ' + (state.currentPage === totalPages ? 'disabled' : '') + ' title="Next Page">&rsaquo;</button>';
        pagesHtml += '<button type="button" class="pagination-btn last-page" data-page="' + totalPages + '" ' + (state.currentPage === totalPages ? 'disabled' : '') + ' title="Last Page">&raquo;</button>';

        pagesHtml += '</div>';

        paginationContainer.innerHTML = statsHtml + pagesHtml;

        // Bind events on buttons
        paginationContainer.querySelectorAll('.pagination-btn').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var targetPage = parseInt(this.getAttribute('data-page'), 10);
            if (targetPage && targetPage >= 1 && targetPage <= totalPages && targetPage !== state.currentPage) {
              state.currentPage = targetPage;
              renderVisitorList(visitors);
              var dashboardSearch = document.getElementById('dashboardSearchInput');
              if (dashboardSearch) {
                dashboardSearch.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          });
        });
      }
    }

    listContainer.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var clickedBtn = e.target.closest('button');
        if (clickedBtn) {
          updateStatus(clickedBtn.getAttribute('data-id'), 'Approved', null, clickedBtn);
        }
      });
    });
    listContainer.querySelectorAll('.btn-reject').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var clickedBtn = e.target.closest('button');
        if (clickedBtn) {
          updateStatus(clickedBtn.getAttribute('data-id'), 'Rejected', null, clickedBtn);
        }
      });
    });
    listContainer.querySelectorAll('.btn-checkin').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var clickedBtn = e.target.closest('button');
        if (clickedBtn) {
          updateStatus(clickedBtn.getAttribute('data-id'), 'Inside', null, clickedBtn);
        }
      });
    });
    listContainer.querySelectorAll('.btn-checkout').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var clickedBtn = e.target.closest('button');
        if (clickedBtn) {
          state.pendingCheckoutId = clickedBtn.getAttribute('data-id');
          openRemarksModal();
        }
      });
    });
    listContainer.querySelectorAll('.btn-view-history').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var parent = e.target.closest('.btn-view-history');
        if (parent) {
          viewHistory(parent.getAttribute('data-mobile'));
        }
      });
    });
  }

  function updateStatus(id, newStatus, remarks, clickedBtn) {
    if (!navigator.onLine) {
      showToast('Action requires connection.', 'error');
      return;
    }

    var actionsContainer = clickedBtn ? clickedBtn.closest('.visitor-item-actions') : null;
    if (actionsContainer && clickedBtn) {
      setActionsLoading(actionsContainer, clickedBtn, true);
    } else if (clickedBtn) {
      setButtonLoading(clickedBtn, true);
    }

    var payload = {
      action: 'status',
      id: id,
      visitorId: id,
      status: newStatus,
      remarks: remarks || '',
      password: state.dashboardPassword
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
          var card = clickedBtn ? clickedBtn.closest('.visitor-item-card') : null;
          if (card) {
            card.classList.add('removing');
            setTimeout(function () {
              loadDashboardData();
            }, 400);
          } else {
            loadDashboardData();
          }
        } else {
          showToast('Update failed: ' + json.message, 'error');
          if (actionsContainer && clickedBtn) {
            setActionsLoading(actionsContainer, clickedBtn, false);
          } else if (clickedBtn) {
            setButtonLoading(clickedBtn, false);
          }
        }
      })
      .catch(function (err) {
        console.error('Update status error:', err);
        showToast('Network error updating state.', 'error');
        if (actionsContainer && clickedBtn) {
          setActionsLoading(actionsContainer, clickedBtn, false);
        } else if (clickedBtn) {
          setButtonLoading(clickedBtn, false);
        }
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
    var confirmBtn = document.getElementById('btnConfirmCheckout');
    if (state.pendingCheckoutId) {
      var cardBtn = document.querySelector('.btn-checkout[data-id="' + state.pendingCheckoutId + '"]');
      setButtonLoading(confirmBtn, true);
      if (cardBtn) {
        setButtonLoading(cardBtn, true);
      }
      updateStatus(state.pendingCheckoutId, 'Checked Out', remarks, cardBtn || confirmBtn);
    }
    closeRemarksModal();
    setButtonLoading(confirmBtn, false);
  }

  function handleDashboardSearch(e) {
    var query = e.target.value.toLowerCase().trim();
    if (!query) {
      state.filteredVisitors = dashboardVisitors;
      state.currentPage = 1;
      renderVisitorList(state.filteredVisitors);
      return;
    }

    var filtered = dashboardVisitors.filter(function (v) {
      var name = String(v.visitorName || '').toLowerCase();
      var mobile = String(v.mobileNumber || '').toLowerCase();
      var host = String(v.hostName || '').toLowerCase();
      var company = String(v.company || '').toLowerCase();
      var id = String(v.visitorId || '').toLowerCase();
      return name.indexOf(query) !== -1 ||
        mobile.indexOf(query) !== -1 ||
        host.indexOf(query) !== -1 ||
        company.indexOf(query) !== -1 ||
        id.indexOf(query) !== -1;
    });

    state.filteredVisitors = filtered;
    state.currentPage = 1;
    renderVisitorList(state.filteredVisitors);
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

    fetch(API_URL + '?action=history&mobile=' + mobile + '&password=' + encodeURIComponent(state.dashboardPassword), {
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

  /* ---------- QR Code Self-Registration ---------- */
  function showQRModal() {
    var modal = document.getElementById('qrCodeModal');
    var qrImg = document.getElementById('qrCodeImage');
    if (!modal || !qrImg) return;

    var registrationUrl = state.registrationUrl || API_URL;
    var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&color=38bdf8&bgcolor=0b1326&data=' + encodeURIComponent(registrationUrl);
    qrImg.src = qrApiUrl;
    modal.classList.remove('hidden');
  }

  function closeQRModal() {
    var modal = document.getElementById('qrCodeModal');
    if (modal) modal.classList.add('hidden');
  }

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
