import { TITLE_PREFERENCES } from "./title-preference.js";
import { catalogDefinitions } from "./catalog-config.js";
import { renderCatalogPreviewDialog } from "./catalog-preview-dialog.js";

const TITLE_LABELS = { english: "English", romaji: "Romaji", native: "Japanese" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function renderProfilePage({ mode, seasonInfo, definitions, settings, id, origin, message, error }) {
  const title = { create: "Create your AniBloom profile", login: "Sign in to edit your profile", edit: "Edit your AniBloom profile", unavailable: "Profile unavailable" }[mode];
  const description = {
    create: "Choose your title style and preview catalogs before installing in Nuvio.",
    login: "Enter the password you set when you created this profile.",
    edit: "Preview, choose, and reorder the catalogs for this Nuvio installation.",
  }[mode];
  const path = id ? `/${id}/configure` : "/configure";
  const showPreviews = mode === "create" || mode === "edit";
  const notice = message
    ? `<p class="profile-notice${error ? " profile-error" : ""}" role="${error ? "alert" : "status"}">${escapeHtml(message)}</p>`
    : "";
  let content = "";
  let aside = "";
  if (mode === "login") {
    content = `<form class="profile-form" method="post" action="${path}">
      <input type="hidden" name="action" value="login">
      <label for="profile-password">Profile password</label>
      <input id="profile-password" type="password" name="password" autocomplete="current-password" required>
      <button class="install-button" type="submit">Sign in</button>
    </form>`;
    aside = renderInstallLinks(id, origin);
  } else if (showPreviews) {
    const creating = mode === "create";
    const chosen = settings.catalogIds;
    const names = Object.fromEntries(TITLE_PREFERENCES.map(style => [
      style, Object.fromEntries(catalogDefinitions(seasonInfo, style).map(catalog => [catalog.id, catalog.name])),
    ]));
    const ordered = [...chosen, ...definitions.map(catalog => catalog.id).filter(id => !chosen.includes(id))];
    content = `<form class="profile-form" method="post" action="${path}">
      <input type="hidden" name="action" value="${creating ? "create" : "save"}">
      <label for="title-style">Anime title style</label>
      <select id="title-style" name="titleStyle">${TITLE_PREFERENCES.map(style =>
        `<option value="${style}"${style === settings.titleStyle ? " selected" : ""}>${TITLE_LABELS[style]}</option>`
      ).join("")}</select>
      <fieldset aria-describedby="profile-catalog-help"><legend>Catalogs</legend>
        <p class="profile-help" id="profile-catalog-help">Select at least one catalog. Use the arrows to set their order in Nuvio.</p>
        <ol class="profile-catalogs" data-catalog-order>
        ${ordered.map(id => {
          const label = escapeHtml(names[settings.titleStyle]?.[id] || names.english[id]);
          const nameOptions = TITLE_PREFERENCES.map(style => `data-${style}="${escapeHtml(names[style][id])}"`).join(" ");
          return `<li><label><input name="catalog" type="checkbox" value="${id}"${chosen.includes(id) ? " checked" : ""}>
             <span data-catalog-name ${nameOptions}>${label}</span></label>
            <div class="profile-order"><button class="outline-button profile-preview-button" type="button" data-preview-catalog="${id}" data-preview-name="${label}" aria-label="Preview ${label}" aria-haspopup="dialog" aria-controls="catalog-preview" hidden>Preview</button>
              <button class="outline-button" type="button" data-move="up" aria-label="Move ${label} up">↑</button>
              <button class="outline-button" type="button" data-move="down" aria-label="Move ${label} down">↓</button></div></li>`;
        }).join("")}
      </ol><p id="profile-order-status" class="profile-sr-only" role="status"></p></fieldset>
      <label for="profile-password">${creating ? "Create a password" : "Confirm with your password"}</label>
      <input id="profile-password" name="password" type="password" autocomplete="${creating ? "new-password" : "current-password"}" ${creating ? 'minlength="12"' : ""} required>
      ${creating ? `<p class="profile-help">Use at least 12 characters. Save your password somewhere safe. Password recovery is unavailable.</p>
        <label for="profile-confirm">Repeat password</label>
        <input id="profile-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" required>` : ""}
      <button class="install-button" type="submit">${creating ? "Create profile" : "Save changes"}</button>
    </form>`;
    aside = creating
      ? `<h2>Open a saved profile</h2><p class="profile-help">Enter the UUID from your manifest URL.</p>
        <form class="profile-form" method="get" action="/configure"><label for="profile-id">Profile UUID</label><input id="profile-id" name="profile" type="text" required autocomplete="off" spellcheck="false"><button class="outline-button" type="submit">Open profile</button></form>`
      : `${renderInstallLinks(id, origin)}
        <p class="profile-help">Use Refresh add-ons in Nuvio if your saved changes aren’t visible yet.</p>
        <form class="profile-session" method="post" action="${path}"><button class="outline-button" name="action" value="logout" type="submit">Sign out</button></form>`;
  } else {
    content = '<a class="outline-button" href="/configure">Back to Configure</a>';
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#090B0D">
<title>${title} · AniBloom</title><link rel="icon" href="/assets/anibloom-icon-small.png">
<link rel="stylesheet" href="/assets/anibloom.css"><link rel="stylesheet" href="/assets/addon-profile.css">
<script src="/assets/addon-profile.js" defer></script>${showPreviews ? '<script src="/assets/catalog-preview-dialog.js" defer></script>' : ""}
</head><body class="profile-page">
<a class="skip-link" href="#main-content">Skip to content</a>
<header class="site-header"><div class="container header-inner">
  <a class="brand" href="/" aria-label="AniBloom home"><img src="/assets/anibloom-icon.png" width="43" height="43" alt=""><span class="brand-name">AniBloom</span><span class="brand-tagline">Anime Discovery for Nuvio</span></a>
  <a class="profile-home-link" href="/">Back to home</a>
</div></header>
<main class="install-guide profile-main" id="main-content"><div class="container">
  <div class="guide-heading profile-heading"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ""}</div></div>
  <div class="install-layout profile-layout${aside ? "" : " profile-layout-single"}">
    <div class="install-options">${notice}${content}</div>
    ${aside ? `<aside class="install-options profile-aside">${aside}</aside>` : ""}
  </div>
</div></main>
<footer class="site-footer"><div class="container footer-inner">
  <div class="footer-brand"><img src="/assets/anibloom-icon.png" width="40" height="40" alt="">AniBloom</div>
  <nav class="footer-links" aria-label="Footer links"><a href="/privacy.html">Privacy &amp; data</a></nav>
</div></footer>
${showPreviews ? renderCatalogPreviewDialog({ configurationPath: path }) : ""}
</body></html>`;
}

function renderInstallLinks(id, origin) {
  const manifest = escapeHtml(`${origin}/${id}/manifest.json`);
  const install = origin.startsWith("https://") ? manifest.replace(/^https:/, "nuvio:") : "";
  return `<h2>Install in Nuvio</h2>
    <p class="profile-help">Paste this manifest URL into Nuvio. Anyone with the link can use this profile.</p>
    <label for="profile-link">Manifest URL</label>
    <input id="profile-link" type="url" readonly value="${manifest}">
    <div class="profile-actions"><button class="outline-button" type="button" data-copy-profile>Copy manifest URL</button>
    ${install ? `<a class="guide-install-link" href="${install}">Open in Nuvio</a>` : ""}</div>
    <p class="copy-status" role="status" id="profile-copy-status"></p>
    <p class="profile-help">To edit from another device, bookmark <a class="guide-install-link" href="/${id}/configure">this configuration page</a>.</p>`;
}
