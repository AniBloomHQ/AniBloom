/* Shared catalog previews fetch only when opened. */
(() => {
  "use strict";

  const dialog = document.getElementById("catalog-preview");
  // Links still open their catalog JSON when dialog support is unavailable.
  if (typeof dialog?.showModal !== "function") return;
  const configurationPath = dialog.dataset.previewConfiguration;
  const titleStyle = configurationPath ? document.getElementById("title-style") : null;
  const heading = document.getElementById("preview-heading");
  const status = document.getElementById("preview-status");
  const titles = document.getElementById("preview-titles");
  const retry = document.getElementById("preview-retry");
  const note = dialog.querySelector(".preview-note");
  const cache = new Map();
  let activeRequest;
  let activeCard;
  let retryTimer;

  function renderSample({ metas, artworkSource }) {
    note.textContent = artworkSource === "anilist"
      ? "This sample uses original AniList covers. Artwork in Nuvio may differ."
      : "Browse the full catalog in Nuvio.";
    renderTitles(metas);
  }

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
    const language = titleStyle?.selectedOptions[0]?.textContent || "English";
    document.getElementById("preview-language").textContent = `${language} titles · Up to 12 titles`;
    status.textContent = "Loading titles…";
    note.textContent = "";
    titles.setAttribute("aria-busy", "true");
    const params = configurationPath
      ? new URLSearchParams({ preview: card.dataset.previewCatalog, titleStyle: titleStyle.value })
      : new URLSearchParams({ type: card.dataset.previewType, id: card.dataset.previewCatalog });
    const url = `${configurationPath || "/api/catalog-preview"}?${params}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      renderSample(cached);
      titles.setAttribute("aria-busy", "false");
      return;
    }
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: configurationPath ? "same-origin" : "omit" });
      if (configurationPath && response.status === 401) {
        if (activeRequest === controller && !controller.signal.aborted) {
          status.textContent = "Your session expired. Sign in again to preview catalogs.";
        }
        return;
      }
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
      const sample = { metas, artworkSource: data.artworkSource, expiresAt: Date.now() + 60_000 };
      cache.set(url, sample);
      renderSample(sample);
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
    if (card instanceof HTMLButtonElement) card.hidden = false;
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
