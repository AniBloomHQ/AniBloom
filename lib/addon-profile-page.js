import { TITLE_PREFERENCES } from "./title-preference.js";
import { catalogDefinitions } from "./catalog-config.js";
import { renderCatalogPreviewDialog } from "./catalog-preview-dialog.js";
import { getNuvioInstallUrl } from "./nuvio-install.js";

const TITLE_LABELS = { english: "English", native: "Japanese" };
const PROFILE_STEPS = ["Select Language", "Select Catalog", "Save Profile", "Install Addon"];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function renderProfilePage({ mode, seasonInfo, definitions, settings, id, origin, loginId, message, error, step = 1 }) {
  const standaloneLogin = mode === "login" && !id;
  const showPreviews = mode === "create" || mode === "edit";
  const installing = mode === "install";
  const title = {
    create: "Create your AniBloom profile",
    login: standaloneLogin ? "Sign in to AniBloom" : "Sign in to edit your profile",
    edit: "Edit your AniBloom profile",
    install: "Install your AniBloom addon",
    unavailable: "Profile unavailable",
  }[mode];
  const description = {
    create: "Choose your title style and preview catalogs before installing in Nuvio.",
    login: standaloneLogin ? "Use the UUID from your manifest URL and your profile password." : "Enter the password you set when you created this profile.",
    edit: "Update the title language and catalogs for your Nuvio profile.",
    install: "Use your profile’s manifest URL to add AniBloom to Nuvio.",
  }[mode];
  const path = id ? `/${id}/configure` : "/configure";
  const notice = message
    ? `<p class="profile-notice${error ? " profile-error" : ""}" role="${error ? "alert" : "status"}">${escapeHtml(message)}</p>`
    : "";
  let content = "";
  let aside = "";
  if (mode === "login") {
    content = `<form class="profile-form" method="post" action="${standaloneLogin ? "/login" : path}">
      <input type="hidden" name="action" value="login">
      ${standaloneLogin ? `<label for="profile-id">Profile UUID</label>
      <input id="profile-id" type="text" name="profileId" value="${escapeHtml(loginId)}" autocomplete="username" autocapitalize="none" spellcheck="false" required>` : ""}
      <label for="profile-password">Profile password</label>
      <input id="profile-password" type="password" name="password" autocomplete="current-password" required>
      <button class="install-button" type="submit">Sign in</button>
    </form>${standaloneLogin ? '<p class="profile-help profile-form-link">New to AniBloom? <a class="guide-install-link" href="/configure">Create a profile</a>.</p>' : ""}`;
    if (id) aside = renderInstallLinks(id, origin);
  } else if (showPreviews) {
    const creating = mode === "create";
    const chosen = settings.catalogIds;
    const names = Object.fromEntries(TITLE_PREFERENCES.map(style => [
      style, Object.fromEntries(catalogDefinitions(seasonInfo, style).map(catalog => [catalog.id, catalog.name])),
    ]));
    const ordered = [...chosen, ...definitions.map(catalog => catalog.id).filter(id => !chosen.includes(id))];
    const language = `
      <label for="title-style">Anime title style</label>
      <div class="profile-select">
        <select id="title-style" name="titleStyle" required>${TITLE_PREFERENCES.map(style =>
          `<option value="${style}"${style === settings.titleStyle ? " selected" : ""}>${TITLE_LABELS[style]}</option>`
        ).join("")}</select>
      </div>`;
    const catalogs = `
      <fieldset aria-describedby="profile-catalog-help"><legend class="profile-sr-only">Catalogs</legend>
        <p class="profile-help" id="profile-catalog-help">Select at least one catalog. Use the arrows to set their order in Nuvio.</p>
        <p class="profile-notice profile-error" data-catalog-error role="alert" hidden>Select at least one catalog to continue.</p>
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
      </ol><p id="profile-order-status" class="profile-sr-only" role="status"></p></fieldset>`;
    const password = `
      <label for="profile-password">${creating ? "Create a password" : "Confirm with your password"}</label>
      <input id="profile-password" name="password" type="password" autocomplete="${creating ? "new-password" : "current-password"}" ${creating ? 'minlength="12"' : ""} required>
      ${creating ? `<p class="profile-help">Use at least 12 characters. Save your password somewhere safe. Password recovery is unavailable.</p>
        <label for="profile-confirm">Repeat password</label>
        <input id="profile-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" required>` : ""}`;
    const links = creating
      ? '<p class="profile-help profile-form-link">Already have a profile? <a class="guide-install-link" href="/login">Sign in</a>.</p>'
      : renderProfileLinks(path, { installing: false });
    content = `${links}
    <form class="profile-form profile-wizard" method="post" action="${path}" data-profile-wizard data-start-step="${step}">
      <input type="hidden" name="action" value="${creating ? "create" : "save"}">
      ${renderStep(1, "Choose an anime title language", language)}
      ${renderStep(2, "Choose and order your catalogs", catalogs)}
      ${renderStep(3, creating ? "Protect your profile" : "Confirm your changes", password)}
      <div class="profile-step-actions">
        <button class="outline-button" type="button" data-profile-back hidden>Back</button>
        <button class="install-button" type="button" data-profile-next hidden>Next</button>
        <button class="install-button" type="submit">${creating ? "Save profile" : "Save changes"}</button>
      </div>
    </form>`;
  } else if (installing) {
    content = `<div class="profile-install-summary">
      ${renderInstallLinks(id, origin, { inWizard: true })}
      <p class="profile-help">If AniBloom is already installed, use Refresh add-ons in Nuvio to load your changes.</p>
      ${renderProfileLinks(path, { installing: true })}
    </div>`;
  } else {
    content = '<a class="outline-button" href="/configure">Back to Configure</a>';
  }
  const singleColumnClass = showPreviews || installing ? "profile-layout-setup" : "profile-layout-single";
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
<main class="install-guide profile-main${standaloneLogin ? " profile-main-standalone-login" : ""}" id="main-content"><div class="container">
  <div class="guide-heading profile-heading"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ""}</div></div>
  ${showPreviews || installing ? renderProfileSteps(installing ? 4 : step, { installing, path }) : ""}
  <div class="install-layout profile-layout${aside ? "" : ` ${singleColumnClass}`}">
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

function renderProfileSteps(current, { installing, path }) {
  return `<ol class="profile-steps" aria-label="Profile setup progress" data-profile-steps${installing ? "" : " hidden"}>
    ${PROFILE_STEPS.map((label, index) => {
      const number = index + 1;
      const content = `<span class="profile-step-number" aria-hidden="true">${number}</span><span>${label}</span>`;
      let control = `<button class="profile-step-control" type="button" data-profile-go="${number}">${content}</button>`;
      if (installing) {
        control = number < current
          ? `<a class="profile-step-control" href="${path}?step=${number}">${content}</a>`
          : `<span class="profile-step-control">${content}</span>`;
      }
      return `<li${number === current ? ' aria-current="step"' : ""}${number < current ? " data-complete" : ""}>${control}</li>`;
    }).join("")}
  </ol>`;
}

function renderStep(number, title, fields) {
  return `<section class="profile-step" data-profile-step aria-labelledby="profile-step-${number}">
    <h2 id="profile-step-${number}" tabindex="-1">${title}</h2>${fields}
  </section>`;
}

function renderProfileLinks(path, { installing }) {
  return `<div class="profile-flow-links">
    <a class="guide-install-link" href="${installing ? path : `${path}?install=1`}">${installing ? "Edit profile" : "Install saved profile"}</a>
    <form method="post" action="${path}"><button class="guide-install-link" name="action" value="logout" type="submit">Sign out</button></form>
  </div>`;
}

function renderInstallLinks(id, origin, { inWizard = false } = {}) {
  const manifestUrl = `${origin}/${id}/manifest.json`;
  const install = getNuvioInstallUrl(manifestUrl);
  return `${inWizard ? "" : "<h2>Install your profile</h2>"}
    <p class="profile-help">Anyone with this manifest URL can use this profile.</p>
    <label for="profile-link">Manifest URL</label>
    <input id="profile-link" type="url" readonly value="${escapeHtml(manifestUrl)}">
    <div class="profile-actions">${install ? `<a class="install-button" href="${escapeHtml(install)}">Install in Nuvio</a>`
      : '<button class="install-button" type="button" disabled aria-describedby="profile-install-help">Install in Nuvio</button>'}
      <button class="outline-button" type="button" data-copy-profile>Copy manifest URL</button></div>
    <p class="copy-status" role="status" id="profile-copy-status"></p>
    ${install ? "" : '<p class="profile-help" id="profile-install-help">Copy the manifest URL for this HTTP preview. Opening Nuvio directly requires HTTPS.</p>'}
    ${inWizard ? "" : `<p class="profile-help">To edit from another device, bookmark <a class="guide-install-link" href="/${id}/configure">this configuration page</a>.</p>`}`;
}
