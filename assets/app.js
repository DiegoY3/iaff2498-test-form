/* IAFF Local 2498 TEST FORM (temporary test copy)
   The form is filled in this browser. Save and Print stay on the device.
   Send to Local 2498 emails the PDF only to the configured test inbox. */
(function () {
  "use strict";

  // Paste the Apps Script /exec URL and the same SHARED_KEY from Code.gs.
  // Leave url empty until the union officer finishes SETUP.md.
  const emailConfig = {
    url: "",
    key: "SHARED_KEY_HERE",
  };

  const PDF_URL = "assets/IAFF_Local_2498_TEST_FORM.pdf";
  const MAX_PDF_BYTES = 10 * 1024 * 1024;

  const TEXT_FIELDS = [
    "full_name", "todays_date", "home_address", "telephone", "email",
    "station", "shift", "iaff_member_number", "encounter_date", "encounter_time",
    "nfirs_incident_number", "injury_report_number", "incident_address",
    "hazardous_conditions", "total_time_exposed", "symptoms", "wc_claim_date",
    "hospital_physician", "witness_1", "witness_2", "witness_3", "witness_4",
  ];

  const statusEl = document.getElementById("status");

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function fieldValue(id) {
    const el = document.getElementById(id);
    return el ? (el.value || "").trim() : "";
  }

  function isInkPixel(r, g, b, a) {
    if (a < 20) return false;
    // Treat near-white (the pad fill) as background so the exported PNG
    // stays transparent and does not stamp a black or white box into the PDF.
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 240;
  }

  function cropInk(source) {
    const w = source.width, h = source.height;
    if (!w || !h) return null;
    const srcCtx = source.getContext("2d");
    const data = srcCtx.getImageData(0, 0, w, h).data;
    let minx = w, miny = h, maxx = -1, maxy = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (isInkPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          if (x < minx) minx = x;
          if (y < miny) miny = y;
          if (x > maxx) maxx = x;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (maxx < 0) return null;
    const pad = Math.max(4, Math.round(Math.max(w, h) * 0.012));
    minx = Math.max(0, minx - pad);
    miny = Math.max(0, miny - pad);
    maxx = Math.min(w - 1, maxx + pad);
    maxy = Math.min(h - 1, maxy + pad);
    const cw = maxx - minx + 1, ch = maxy - miny + 1;
    const tmp = document.createElement("canvas");
    tmp.width = cw;
    tmp.height = ch;
    const tctx = tmp.getContext("2d");
    const out = tctx.createImageData(cw, ch);
    const od = out.data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const si = ((miny + y) * w + (minx + x)) * 4;
        const di = (y * cw + x) * 4;
        if (isInkPixel(data[si], data[si + 1], data[si + 2], data[si + 3])) {
          od[di] = 0;
          od[di + 1] = 0;
          od[di + 2] = 0;
          od[di + 3] = data[si + 3];
        }
      }
    }
    tctx.putImageData(out, 0, 0);
    return tmp;
  }

  function canvasToPngBytes(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(null); return; }
        blob.arrayBuffer().then(function (buf) {
          resolve(new Uint8Array(buf));
        });
      }, "image/png");
    });
  }

  function renderTypedSignature(text) {
    const t = (text || "").trim();
    if (!t) return null;
    const canvas = document.createElement("canvas");
    const dpr = 2;
    const cssW = Math.max(420, Math.min(900, 40 + t.length * 28));
    const cssH = 140;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "middle";
    ctx.font = '58px "Pinyon Script", "Homemade Apple", cursive';
    ctx.fillText(t, 10, cssH * 0.58);
    return cropInk(canvas) || canvas;
  }

  /* ---------- fullscreen signing overlay (shared) ---------- */
  const overlay = document.getElementById("sig-overlay");
  const overlayTitle = document.getElementById("sig-overlay-title");
  const rotateHint = document.getElementById("sig-rotate-hint");
  const stage = document.getElementById("sig-stage");
  const canvas = document.getElementById("sig-overlay-canvas");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const btnClear = document.getElementById("sig-btn-clear");
  const btnCancel = document.getElementById("sig-btn-cancel");
  const btnDone = document.getElementById("sig-btn-done");

  let activeField = null;
  let strokes = []; // each stroke: array of {x, y} in CSS pixels of current canvas
  let currentStroke = null;
  let lastPoint = null;
  let lastMid = null;
  let drawing = false;
  let storedCssW = 0;
  let storedCssH = 0;
  let scrollLockY = 0;
  let usedNativeFullscreen = false;
  let prevFocus = null;

  function isPortrait() {
    return window.innerHeight >= window.innerWidth;
  }

  function updatePortraitHint() {
    overlay.classList.toggle("is-portrait", isPortrait());
    rotateHint.hidden = !isPortrait();
  }

  function lineWidthFor(cssH) {
    return Math.max(2.4, Math.min(3.6, cssH / 130));
  }

  function applyStrokeStyle(cssH) {
    ctx.lineWidth = lineWidthFor(cssH || stage.getBoundingClientRect().height || 200);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#000000";
  }

  function fillPadWhite() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function lockScroll() {
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add("sig-signing");
    document.body.style.position = "fixed";
    document.body.style.top = "-" + scrollLockY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function unlockScroll() {
    document.documentElement.classList.remove("sig-signing");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollLockY);
  }

  function syncOverlayViewport() {
    if (overlay.hidden) return;
    const nativeFs = document.fullscreenElement === overlay ||
      document.webkitFullscreenElement === overlay;
    if (nativeFs) {
      overlay.style.top = "";
      overlay.style.left = "";
      overlay.style.width = "";
      overlay.style.height = "";
      return;
    }
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const left = vv ? vv.offsetLeft : 0;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    overlay.style.top = top + "px";
    overlay.style.left = left + "px";
    overlay.style.width = w + "px";
    overlay.style.height = h + "px";
  }

  function drawStroke(points, cssH) {
    if (!points || !points.length) return;
    applyStrokeStyle(cssH);
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }
    let midX = (points[0].x + points[1].x) / 2;
    let midY = (points[0].y + points[1].y) / 2;
    ctx.lineTo(midX, midY);
    for (let i = 1; i < points.length - 1; i++) {
      const nextMidX = (points[i].x + points[i + 1].x) / 2;
      const nextMidY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, nextMidX, nextMidY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function redrawAll() {
    const cssW = storedCssW, cssH = storedCssH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillPadWhite();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyStrokeStyle(cssH);
    for (let i = 0; i < strokes.length; i++) {
      drawStroke(strokes[i], cssH);
    }
  }

  function layoutCanvas(preserve) {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const cssW = Math.max(Math.floor(rect.width), 2);
    const cssH = Math.max(Math.floor(rect.height), 2);
    const prevW = storedCssW || cssW;
    const prevH = storedCssH || cssH;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    fillPadWhite();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyStrokeStyle(cssH);

    if (preserve && strokes.length && prevW > 0 && prevH > 0 && (prevW !== cssW || prevH !== cssH)) {
      const sx = cssW / prevW;
      const sy = cssH / prevH;
      const s = Math.min(sx, sy);
      const ox = (cssW - prevW * s) / 2;
      const oy = (cssH - prevH * s) / 2;
      for (let i = 0; i < strokes.length; i++) {
        for (let j = 0; j < strokes[i].length; j++) {
          const p = strokes[i][j];
          p.x = p.x * s + ox;
          p.y = p.y * s + oy;
        }
      }
    }
    storedCssW = cssW;
    storedCssH = cssH;
    redrawAll();
  }

  function pointFromEvent(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function addPoint(p) {
    if (!currentStroke) return;
    currentStroke.push(p);
    applyStrokeStyle(storedCssH);
    if (!lastPoint) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      lastPoint = p;
      lastMid = p;
      return;
    }
    const mid = { x: (lastPoint.x + p.x) / 2, y: (lastPoint.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(lastMid.x, lastMid.y);
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, mid.x, mid.y);
    ctx.stroke();
    lastPoint = p;
    lastMid = mid;
  }

  function onPointerDown(ev) {
    if (!ev.isPrimary) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    drawing = true;
    currentStroke = [];
    lastPoint = null;
    lastMid = null;
    addPoint(pointFromEvent(ev));
  }

  function onPointerMove(ev) {
    if (!drawing || !ev.isPrimary) return;
    ev.preventDefault();
    const evs = (typeof ev.getCoalescedEvents === "function" && ev.getCoalescedEvents()) || [ev];
    for (let i = 0; i < evs.length; i++) {
      addPoint(pointFromEvent(evs[i]));
    }
  }

  function onPointerUp(ev) {
    if (!ev.isPrimary && ev.type !== "pointercancel") return;
    if (!drawing) return;
    ev.preventDefault();
    if (currentStroke && currentStroke.length) {
      strokes.push(currentStroke);
    }
    drawing = false;
    currentStroke = null;
    lastPoint = null;
    lastMid = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("lostpointercapture", function () {
    if (drawing && currentStroke && currentStroke.length) {
      strokes.push(currentStroke);
    }
    drawing = false;
    currentStroke = null;
    lastPoint = null;
    lastMid = null;
  });

  // Belt-and-suspenders: block page scroll while the overlay is open (iOS).
  overlay.addEventListener("touchmove", function (ev) {
    ev.preventDefault();
  }, { passive: false });
  overlay.addEventListener("wheel", function (ev) {
    ev.preventDefault();
  }, { passive: false });

  function clearInk() {
    strokes = [];
    currentStroke = null;
    lastPoint = null;
    lastMid = null;
    drawing = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillPadWhite();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyStrokeStyle(storedCssH);
  }

  function hasInk() {
    return strokes.some(function (s) { return s && s.length; });
  }

  function exitNativeFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (exit && fsEl) {
      try { exit.call(document); } catch (e) { /* ignore */ }
    }
    usedNativeFullscreen = false;
  }

  function closeOverlay(opts) {
    opts = opts || {};
    if (overlay.hidden) return;
    exitNativeFullscreen();
    overlay.hidden = true;
    overlay.style.top = "";
    overlay.style.left = "";
    overlay.style.width = "";
    overlay.style.height = "";
    unlockScroll();
    clearInk();
    activeField = null;
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus(); } catch (e) { /* ignore */ }
    }
    prevFocus = null;
  }

  function cancelOverlay() {
    closeOverlay();
  }

  function doneOverlay() {
    if (!activeField) { closeOverlay(); return Promise.resolve(); }
    const field = activeField;
    if (!hasInk()) {
      // Empty canvas after Clear + Done removes a previously drawn signature,
      // but leaves a typed name (if any) as the alternative.
      field.commitDrawn(null);
      closeOverlay();
      return Promise.resolve();
    }
    // Guides are HTML behind the canvas, so cropInk captures ink only.
    const trimmed = cropInk(canvas);
    const source = trimmed || canvas;
    return canvasToPngBytes(source).then(function (bytes) {
      const dataUrl = source.toDataURL("image/png");
      field.commitDrawn({ dataUrl: dataUrl, bytes: bytes, canvas: source });
      closeOverlay();
    });
  }

  function enterFullscreenIfPossible() {
    usedNativeFullscreen = false;
    const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen ||
      overlay.webkitRequestFullScreen;
    if (!req) return;
    try {
      const result = req.call(overlay);
      if (result && typeof result.then === "function") {
        result.then(function () {
          usedNativeFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
          syncOverlayViewport();
          layoutCanvas(true);
        }).catch(function () {
          usedNativeFullscreen = false;
          syncOverlayViewport();
          layoutCanvas(true);
        });
      }
    } catch (e) {
      usedNativeFullscreen = false;
    }
  }

  function openOverlay(field) {
    if (!overlay.hidden && activeField === field) return;
    prevFocus = document.activeElement;
    activeField = field;
    overlayTitle.textContent = field.title;
    clearInk();
    overlay.hidden = false;
    lockScroll();
    updatePortraitHint();
    syncOverlayViewport();
    // Two rAFs so the stage has a real size (including after Fullscreen).
    requestAnimationFrame(function () {
      layoutCanvas(false);
      enterFullscreenIfPossible();
      requestAnimationFrame(function () {
        layoutCanvas(false);
        try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
      });
    });
  }

  btnClear.addEventListener("click", function () { clearInk(); });
  btnCancel.addEventListener("click", cancelOverlay);
  btnDone.addEventListener("click", doneOverlay);

  document.addEventListener("keydown", function (ev) {
    if (overlay.hidden) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      cancelOverlay();
    }
  });

  function onViewportChange() {
    if (overlay.hidden) return;
    updatePortraitHint();
    syncOverlayViewport();
    layoutCanvas(true);
  }

  window.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", function () {
    // iOS fires this before the new size is committed.
    setTimeout(onViewportChange, 50);
    setTimeout(onViewportChange, 250);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewportChange);
    window.visualViewport.addEventListener("scroll", function () {
      if (overlay.hidden) return;
      syncOverlayViewport();
    });
  }
  document.addEventListener("fullscreenchange", function () {
    if (overlay.hidden) return;
    syncOverlayViewport();
    requestAnimationFrame(function () { layoutCanvas(true); });
  });
  document.addEventListener("webkitfullscreenchange", function () {
    if (overlay.hidden) return;
    syncOverlayViewport();
    requestAnimationFrame(function () { layoutCanvas(true); });
  });

  /* ---------- per-field signature controller ---------- */
  function createSignatureField(opts) {
    const openBtn = document.getElementById(opts.openId);
    const previewImg = document.getElementById(opts.previewId);
    const previewTyped = document.getElementById(opts.previewTypedId);
    const placeholder = document.getElementById(opts.placeholderId);
    const typedInput = document.getElementById(opts.typedId);
    const clearBtn = document.getElementById(opts.clearId);
    let drawn = null; // { dataUrl, bytes, canvas }

    function refreshPreview() {
      const typed = (typedInput.value || "").trim();
      if (drawn && drawn.dataUrl) {
        previewImg.src = drawn.dataUrl;
        previewImg.hidden = false;
        previewTyped.hidden = true;
        previewTyped.textContent = "";
        placeholder.hidden = true;
        openBtn.classList.add("has-signature");
        return;
      }
      previewImg.hidden = true;
      previewImg.removeAttribute("src");
      if (typed) {
        previewTyped.textContent = typed;
        previewTyped.hidden = false;
        placeholder.hidden = true;
        openBtn.classList.add("has-signature");
      } else {
        previewTyped.hidden = true;
        previewTyped.textContent = "";
        placeholder.hidden = false;
        openBtn.classList.remove("has-signature");
      }
    }

    function commitDrawn(next) {
      drawn = next;
      refreshPreview();
    }

    function clear() {
      drawn = null;
      typedInput.value = "";
      refreshPreview();
    }

    openBtn.addEventListener("click", function () {
      openOverlay(api);
    });
    typedInput.addEventListener("input", function () {
      // Typing is an alternative to drawing — a new typed name replaces a drawing.
      if ((typedInput.value || "").trim()) {
        drawn = null;
      }
      refreshPreview();
    });
    clearBtn.addEventListener("click", clear);

    const api = {
      title: opts.title,
      commitDrawn: commitDrawn,
      clear: clear,
      hasDrawn: function () { return !!(drawn && drawn.dataUrl); },
      isEmpty: function () {
        if (drawn && drawn.dataUrl) return false;
        return !(typedInput.value || "").trim();
      },
      toPngBytes: function () {
        if (drawn && drawn.bytes && drawn.bytes.length) {
          return Promise.resolve(drawn.bytes);
        }
        const typed = (typedInput.value || "").trim();
        if (!typed) return Promise.resolve(null);
        const painted = renderTypedSignature(typed);
        if (!painted) return Promise.resolve(null);
        return canvasToPngBytes(painted);
      },
    };
    refreshPreview();
    return api;
  }

  const employeePad = createSignatureField({
    title: "Employee signature",
    openId: "employee_signature_open",
    previewId: "employee_signature_preview",
    previewTypedId: "employee_signature_preview_typed",
    placeholderId: "employee_signature_placeholder",
    typedId: "employee_signature_typed",
    clearId: "employee_signature_clear",
  });
  const supervisorPad = createSignatureField({
    title: "Supervisor signature",
    openId: "supervisor_signature_open",
    previewId: "supervisor_signature_preview",
    previewTypedId: "supervisor_signature_preview_typed",
    placeholderId: "supervisor_signature_placeholder",
    typedId: "supervisor_signature_typed",
    clearId: "supervisor_signature_clear",
  });

  /* ---------- PDF fill ---------- */
  async function buildFilledPdf() {
    if (typeof PDFLib === "undefined") {
      throw new Error("pdf-lib failed to load");
    }
    const res = await fetch(PDF_URL);
    if (!res.ok) throw new Error("Could not load the blank form PDF (" + res.status + ")");
    const existing = await res.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(existing);
    const form = pdfDoc.getForm();

    TEXT_FIELDS.forEach(function (name) {
      const value = fieldValue(name);
      try {
        const field = form.getTextField(name);
        field.setText(value);
        if (name === "hazardous_conditions" || name === "symptoms") {
          field.setFontSize(10);
        } else {
          field.setFontSize(11);
        }
      } catch (err) {
        console.warn("Missing PDF field", name, err);
      }
    });

    async function applySignature(fieldName, pad, typedId) {
      const field = form.getTextField(fieldName);
      const typed = fieldValue(typedId);
      if (pad.isEmpty()) {
        field.setText("");
        return;
      }
      const pngBytes = await pad.toPngBytes();
      if (pngBytes && pngBytes.length) {
        const img = await pdfDoc.embedPng(pngBytes);
        const widgets = field.acroField.getWidgets();
        if (widgets && widgets.length) {
          const rect = widgets[0].getRectangle();
          let targetPage = pdfDoc.getPages()[1];
          try {
            const wp = widgets[0].getPage();
            if (wp) targetPage = wp;
          } catch (e) { /* keep page 2 fallback */ }
          const maxW = Math.max(rect.width - 4, 8);
          const maxH = Math.max(rect.height - 2, 8);
          let w = maxW;
          let h = (img.height / img.width) * w;
          if (h > maxH) {
            h = maxH;
            w = (img.width / img.height) * h;
          }
          targetPage.drawImage(img, {
            x: rect.x + 1,
            y: rect.y + 1,
            width: w,
            height: h,
          });
          field.setText("");
          return;
        }
      }
      field.setText(typed);
    }

    await applySignature("employee_signature", employeePad, "employee_signature_typed");
    await applySignature("supervisor_signature", supervisorPad, "supervisor_signature_typed");

    try {
      form.updateAppearances();
    } catch (err) {
      console.warn("updateAppearances", err);
    }

    return pdfDoc.save();
  }

  function lastNameFromFull(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return parts[parts.length - 1].replace(/[^\w.\-]+/g, "");
  }

  function safeDateToken() {
    return fieldValue("encounter_date")
      .replace(/[/.]/g, "-")
      .replace(/[^\d\-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function safeFilename() {
    const last = lastNameFromFull(fieldValue("full_name"));
    const date = safeDateToken();
    let base = "TEST_Form";
    if (last) base += "_" + last;
    if (date) base += "_" + date;
    return base + ".pdf";
  }

  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
      binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")) return true;
    try {
      return window.matchMedia("(pointer: coarse)").matches &&
        window.matchMedia("(max-width: 900px)").matches;
    } catch (e) {
      return false;
    }
  }

  function canSharePdfFile(file) {
    try {
      return typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
    } catch (e) {
      return false;
    }
  }

  function downloadViaAnchor(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return "downloaded";
  }

  // Desktop: blob + <a download>. Mobile: Web Share (Save to Files / share sheet)
  // when the browser supports sharing a file; otherwise the same blob download.
  async function savePdfToDevice(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    let file = null;
    try {
      if (typeof File === "function") {
        file = new File([blob], filename, { type: "application/pdf" });
      }
    } catch (e) {
      file = null;
    }
    if (file && isMobileDevice() && canSharePdfFile(file)) {
      try {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      } catch (err) {
        if (err && err.name === "AbortError") return "aborted";
      }
    }
    return downloadViaAnchor(blob, filename);
  }

  async function onSave() {
    const btn = document.getElementById("btn-save");
    btn.disabled = true;
    setStatus("Preparing your PDF…");
    try {
      const bytes = await buildFilledPdf();
      const result = await savePdfToDevice(bytes, safeFilename());
      if (result === "aborted") {
        setStatus("Save canceled.");
      } else if (result === "shared") {
        setStatus("Use Save to Files (or your share sheet) to keep the PDF on this device.", "ok");
      } else {
        setStatus("Saved. Open the PDF in any PDF editor if you need to make changes.", "ok");
      }
    } catch (err) {
      console.error(err);
      setStatus("Could not save the PDF. " + (err && err.message ? err.message : "Please try again."), "error");
    } finally {
      btn.disabled = false;
    }
  }

  function collectMailPayload(bytes, filename) {
    return {
      sharedKey: emailConfig.key,
      honeypot: fieldValue("website"),
      pdfBase64: bytesToBase64(bytes),
      filename: filename,
      fullName: fieldValue("full_name"),
      memberNumber: fieldValue("iaff_member_number"),
      todaysDate: fieldValue("todays_date"),
      encounterDate: fieldValue("encounter_date"),
      encounterTime: fieldValue("encounter_time"),
      station: fieldValue("station"),
      shift: fieldValue("shift"),
      telephone: fieldValue("telephone"),
      email: fieldValue("email"),
      nfirsIncidentNumber: fieldValue("nfirs_incident_number"),
      injuryReportNumber: fieldValue("injury_report_number"),
      incidentAddress: fieldValue("incident_address"),
      totalTimeExposed: fieldValue("total_time_exposed"),
      wcClaimDate: fieldValue("wc_claim_date"),
      hospitalPhysician: fieldValue("hospital_physician"),
    };
  }

  async function postToAppsScript(payload) {
    const body = JSON.stringify(payload);
    const opts = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      redirect: "follow",
    };
    try {
      const res = await fetch(emailConfig.url, opts);
      let text = "";
      try {
        text = await res.text();
      } catch (readErr) {
        if (res.ok || res.type === "opaqueredirect" || res.type === "opaque") {
          return { ok: true, optimistic: true };
        }
        throw new Error("Could not read the server response.");
      }
      if (text) {
        try {
          const json = JSON.parse(text);
          if (json && json.ok) return { ok: true, json: json };
          const msg = (json && (json.error || json.message)) || "The office email could not be sent.";
          return { ok: false, error: msg };
        } catch (parseErr) {
          if (res.ok) return { ok: true, optimistic: true };
        }
      }
      if (res.ok) return { ok: true, optimistic: true };
      return { ok: false, error: "The office email could not be sent (HTTP " + res.status + ")." };
    } catch (err) {
      try {
        await fetch(emailConfig.url, Object.assign({}, opts, { mode: "no-cors" }));
        return { ok: true, optimistic: true };
      } catch (err2) {
        throw err2;
      }
    }
  }

  function signaturesMissingMessage() {
    const missing = [];
    if (employeePad.isEmpty()) missing.push("employee");
    if (supervisorPad.isEmpty()) missing.push("supervisor");
    if (!missing.length) return "";
    if (missing.length === 2) {
      return "No employee or supervisor signature was added. Send the form anyway?";
    }
    return "The " + missing[0] + " signature is missing. Send the form anyway?";
  }

  async function onSend(opts) {
    opts = opts || {};
    const sendBtn = document.getElementById("btn-send");
    const saveBtn = document.getElementById("btn-save");

    if (!emailConfig.url) {
      setStatus("Email sending isn’t set up yet. You can still use Save Exposure Form and deliver the PDF to the union office.", "error");
      return { ok: false, reason: "not-configured" };
    }

    const fullName = fieldValue("full_name");
    const encounterDate = fieldValue("encounter_date");
    if (!fullName || !encounterDate) {
      setStatus("Please enter your Full Name and the Toxic Exposure Encounter Date before sending.", "error");
      return { ok: false, reason: "validation" };
    }

    if (!opts.skipSignatureWarn) {
      const warn = signaturesMissingMessage();
      if (warn && !window.confirm(warn)) {
        setStatus("Send canceled. You can add signatures and try again, or use Save Exposure Form.");
        return { ok: false, reason: "canceled" };
      }
    }

    const prevLabel = sendBtn.textContent;
    sendBtn.disabled = true;
    saveBtn.disabled = true;
    sendBtn.classList.add("is-sending");
    sendBtn.textContent = "Sending…";
    setStatus("Preparing and sending your form…");
    try {
      const bytes = await buildFilledPdf();
      if (!bytes || !bytes.length) {
        throw new Error("The PDF could not be built.");
      }
      if (bytes.length > MAX_PDF_BYTES) {
        throw new Error("The PDF is too large to email (limit 10 MB).");
      }
      const result = await postToAppsScript(collectMailPayload(bytes, safeFilename()));
      if (result.ok && result.optimistic) {
        setStatus("Sent to Local 2498. If the office doesn’t receive it, use Save Exposure Form and deliver the PDF to the union office.", "ok");
        return { ok: true, optimistic: true };
      }
      if (result.ok) {
        setStatus("Sent to Local 2498. The union office will file this with your record.", "ok");
        return { ok: true };
      }
      setStatus((result.error || "Could not send the form.") + " Use Save Exposure Form and deliver the PDF to the union office, or try again.", "error");
      return { ok: false, reason: "server", error: result.error };
    } catch (err) {
      console.error(err);
      setStatus("Could not send the form. Use Save Exposure Form and deliver the PDF to the union office, or try again.", "error");
      return { ok: false, reason: "network", error: err && err.message ? err.message : String(err) };
    } finally {
      sendBtn.classList.remove("is-sending");
      sendBtn.textContent = prevLabel;
      sendBtn.disabled = false;
      saveBtn.disabled = false;
    }
  }

  document.getElementById("btn-save").addEventListener("click", onSave);
  document.getElementById("btn-send").addEventListener("click", function () { onSend(); });
  document.getElementById("btn-print").addEventListener("click", function () {
    window.print();
  });
  document.getElementById("exposure-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    onSave();
  });

  // Used by the local test harness.
  window.__buildFilledPdf = buildFilledPdf;
  window.__safeFilename = safeFilename;
  window.__sendToLocal = onSend;
  window.__saveExposureForm = onSave;
  window.__setEmailConfig = function (url, key) {
    emailConfig.url = url || "";
    emailConfig.key = key || "";
  };
  // Used by the local test harness.
  window.__buildFilledPdf = buildFilledPdf;
  window.__sigTest = {
    open: function (which) {
      const field = which === "supervisor" ? supervisorPad : employeePad;
      openOverlay(field);
      return new Promise(function (resolve) {
        function wait(n) {
          if (storedCssW > 10 && storedCssH > 10 && !overlay.hidden) {
            resolve(true);
            return;
          }
          if (n <= 0) { resolve(false); return; }
          requestAnimationFrame(function () { wait(n - 1); });
        }
        wait(45);
      });
    },
    ready: function () {
      return !overlay.hidden && storedCssW > 10 && storedCssH > 10;
    },
    canvasSize: function () { return { w: storedCssW, h: storedCssH }; },
    close: cancelOverlay,
    cancel: cancelOverlay,
    clear: clearInk,
    done: doneOverlay,
    isOpen: function () { return !overlay.hidden; },
    isPortrait: isPortrait,
    hasInk: hasInk,
    strokeCount: function () { return strokes.length; },
    // Draw a recognizable cursive-like signature in CSS coordinates.
    drawDemo: function () {
      if (overlay.hidden) return false;
      if (storedCssW < 4 || storedCssH < 4) layoutCanvas(false);
      const w = storedCssW, h = storedCssH;
      const baseY = h * 0.62;
      const x0 = w * 0.16;
      const x1 = w * 0.78;
      const pts = [];
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        // A looping "signature" wave that sits above the baseline.
        const y = baseY
          - Math.sin(t * Math.PI) * h * 0.16
          - Math.sin(t * Math.PI * 4.2) * h * 0.07
          - Math.sin(t * Math.PI * 9) * h * 0.025
          - (t > 0.72 ? Math.sin((t - 0.72) / 0.28 * Math.PI) * h * 0.12 : 0);
        pts.push({ x: x, y: y });
      }
      // A crossing flourish for the initial
      const flourish = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        flourish.push({
          x: x0 - w * 0.02 + t * w * 0.14,
          y: baseY - h * 0.18 + t * h * 0.28,
        });
      }
      strokes.push(flourish, pts);
      redrawAll();
      return true;
    },
  };
})();
