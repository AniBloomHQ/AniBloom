/* Homepage interactions: no catalog requests until a visitor opens a preview. */
(() => {
  "use strict";

  const picker = document.getElementById("title-preference");
  const manual = document.querySelector(".manual-install a");
  const copyStatus = document.getElementById("copy-status");
  const qrToggle = document.getElementById("show-qr");
  const qrPanel = document.getElementById("manifest-qr");
  const qrImage = document.getElementById("qr-image");
  const qrStatus = document.getElementById("qr-status");
  let qrGeneration = 0;

  async function renderQr() {
    const generation = ++qrGeneration;
    const url = manual.href;
    qrImage.replaceChildren();
    qrStatus.textContent = "Preparing QR code…";
    try {
      const { default: qrcode } = await import("/assets/vendor/qrcode-generator.js");
      if (generation !== qrGeneration) return;
      const code = qrcode(0, "M");
      code.addData(url);
      code.make();
      const count = code.getModuleCount();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${count + 8} ${count + 8}`);
      svg.setAttribute("aria-hidden", "true");
      const background = document.createElementNS(svg.namespaceURI, "rect");
      background.setAttribute("width", "100%");
      background.setAttribute("height", "100%");
      background.setAttribute("fill", "#fff");
      const path = document.createElementNS(svg.namespaceURI, "path");
      let squares = "";
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (code.isDark(row, col)) squares += `M${col + 4},${row + 4}h1v1h-1z`;
        }
      }
      path.setAttribute("d", squares);
      path.setAttribute("fill", "#000");
      svg.append(background, path);
      qrImage.append(svg);
      qrImage.setAttribute("aria-label", `QR code for ${url}`);
      qrStatus.textContent = "";
    } catch {
      if (generation === qrGeneration) qrStatus.textContent = "QR code unavailable. Copy the manifest URL instead.";
    }
  }

  document.getElementById("copy-manifest").addEventListener("click", async () => {
    const url = manual.href;
    try {
      await navigator.clipboard.writeText(url);
      // A preference change during a permission prompt invalidates the old copy status.
      if (manual.href === url) copyStatus.textContent = "Manifest URL copied. Paste it into Nuvio.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(manual);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      copyStatus.textContent = "Copy is unavailable. The URL is selected; copy it manually.";
    }
  });

  qrToggle.addEventListener("click", () => {
    qrPanel.hidden = !qrPanel.hidden;
    qrToggle.setAttribute("aria-expanded", String(!qrPanel.hidden));
    qrToggle.textContent = qrPanel.hidden ? "Show QR code" : "Hide QR code";
    if (!qrPanel.hidden) renderQr();
    else qrGeneration++;
  });

  document.getElementById("local-install-note").hidden = !["localhost", "127.0.0.1", "[::1]"].includes(new URL(manual.href).hostname);
  picker.addEventListener("change", () => {
    copyStatus.textContent = "";
    if (!qrPanel.hidden) renderQr();
  });

  document.querySelectorAll('[name="install-platform"]').forEach(radio => {
    radio.addEventListener("change", () => {
      document.querySelectorAll("[data-platform-panel]").forEach(panel => {
        panel.hidden = panel.dataset.platformPanel !== radio.value;
      });
    });
  });

  const dialog = document.getElementById("catalog-preview");
  // Links still open their catalog JSON when dialog support is unavailable.
  if (typeof dialog.showModal !== "function") return;
  const heading = document.getElementById("preview-heading");
  const status = document.getElementById("preview-status");
  const titles = document.getElementById("preview-titles");
  const retry = document.getElementById("preview-retry");
  const cache = new Map();
  let activeRequest;
  let activeCard;
  let retryTimer;
  const titleModes = { english: "English", romaji: "Romaji", native: "Native" };

  function renderTitles(metas) {
    for (const meta of metas.slice(0, 12)) {
      const item = document.createElement("li");
      const artwork = document.createElement("div");
      artwork.className = "preview-poster";
      const placeholder = document.createElement("span");
      placeholder.textContent = "Poster unavailable";
      artwork.append(placeholder);
      try {
        const url = new URL(meta.poster);
        if (url.protocol === "https:" && !url.username && !url.password) {
          const image = document.createElement("img");
          image.alt = ""; // The adjacent title labels the poster.
          image.loading = "lazy";
          image.decoding = "async";
          image.referrerPolicy = "no-referrer";
          image.addEventListener("error", () => image.remove(), { once: true });
          image.src = url.href;
          artwork.append(image);
        }
      } catch { /* Keep the placeholder when the poster URL is absent or invalid. */ }
      const name = document.createElement("h3");
      name.textContent = typeof meta.name === "string" ? meta.name : "Untitled anime";
      const year = document.createElement("p");
      year.textContent = typeof meta.releaseInfo === "string" ? meta.releaseInfo : "";
      item.append(artwork, name, year);
      titles.append(item);
    }
    status.textContent = metas.length
      ? `Showing ${Math.min(metas.length, 12)} ${metas.length === 1 ? "title" : "titles"} from this catalog.`
      : "No titles to show right now. Check this catalog again later.";
  }

  async function loadPreview(card) {
    activeRequest?.abort();
    clearTimeout(retryTimer);
    const controller = new AbortController();
    activeRequest = controller;
    let timedOut = false;
    titles.replaceChildren();
    retry.hidden = true;
    retry.disabled = false;
    retry.textContent = "Try again";
    heading.textContent = card.dataset.previewName;
    document.getElementById("preview-language").textContent = `${titleModes[picker.value] || "English"} titles · Up to 12 titles`;
    status.textContent = "Loading titles…";
    titles.setAttribute("aria-busy", "true");
    const params = new URLSearchParams({ type: card.dataset.previewType, id: card.dataset.previewCatalog, titleMode: picker.value });
    const url = `/api/catalog-preview?${params}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      renderTitles(cached.metas);
      titles.setAttribute("aria-busy", "false");
      return;
    }
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) {
        const rawDelay = response.headers.get("Retry-After");
        const seconds = /^\d+$/.test(rawDelay || "") ? Number(rawDelay) : Math.ceil((Date.parse(rawDelay) - Date.now()) / 1000);
        const error = new Error("Catalog unavailable");
        error.delay = Number.isFinite(seconds) ? Math.min(3600, Math.max(0, seconds)) : 0;
        throw error;
      }
      const data = await response.json();
      if (!Array.isArray(data.metas)) throw new Error("Invalid catalog response");
      if (controller.signal.aborted || activeRequest !== controller) return;
      const metas = data.metas.filter(meta => meta && typeof meta === "object");
      // Reuse only successful responses, partitioned by catalog and title language.
      cache.set(url, { metas, expiresAt: Date.now() + 60_000 });
      document.querySelector(".preview-note").textContent = data.artworkSource === "anilist"
        ? "A quick look at titles from AniList, using original covers. Install AniBloom to browse in Nuvio; enhanced artwork may differ."
        : "A sample from this catalog. Install AniBloom to browse the full selection in Nuvio.";
      renderTitles(metas);
    } catch (error) {
      if (activeRequest !== controller || (controller.signal.aborted && !timedOut)) return;
      status.textContent = timedOut
        ? "This catalog is taking a while. Please try again later."
        : "This catalog is temporarily unavailable. Please try again shortly.";
      retry.hidden = false;
      if (error.delay > 0) {
        retry.disabled = true;
        retry.textContent = "Please wait before retrying";
        status.textContent += ` Retry in ${error.delay} seconds.`;
        retryTimer = setTimeout(() => { retry.disabled = false; retry.textContent = "Try again"; }, error.delay * 1000);
      }
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) titles.setAttribute("aria-busy", "false");
    }
  }

  document.querySelectorAll("[data-preview-catalog]").forEach(card => {
    card.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activeCard = card;
      dialog.showModal();
      document.body.classList.add("preview-open");
      loadPreview(card);
    });
  });
  retry.addEventListener("click", () => loadPreview(activeCard));
  function finishClose() {
    // Native close events can arrive after another catalog has already opened.
    if (dialog.open) return;
    activeRequest?.abort();
    clearTimeout(retryTimer);
    document.body.classList.remove("preview-open");
    activeCard?.focus({ preventScroll: true });
  }
  function closePreview() {
    dialog.close();
    finishClose();
  }
  dialog.querySelector(".preview-close").addEventListener("click", closePreview);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closePreview();
  });
  dialog.addEventListener("close", finishClose);
})();
