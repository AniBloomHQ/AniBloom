import { BASE_URL, REPOSITORY_URL } from "./config.js";

const CATALOGS = [
  ["Upcoming 3 days", "upcoming_3_days", "Anime with new episodes airing in the next 3 days."],
  ["Previous 3 days", "previous_3_days", "Anime that aired in the last 3 days."],
  ["Current Season", "current_season", "Anime in the current season."],
  ["Current Season Movies", "current_season_movies", "Movies from the current season."],
  ["Previous Season", "previous_season", "Anime from the recently ended season."],
  ["Previous Season Movies", "previous_season_movies", "Movies from the recently ended season."],
  ["Upcoming Season", "upcoming_season", "Anime from the next upcoming season."],
  ["Upcoming Season Movies", "upcoming_season_movies", "Movies from the next upcoming season."]
];

// All supported catalogs are advertised by the default manifest; Nuvio manages row visibility.
const ADDITIONAL_CATALOGS = [
  ["Top Anime of the Season", "top_season", "Popular anime from the current Japanese broadcast season."],
];

const DEFAULT_DONATION_URL = "https://buymeacoffee.com/mark475";

function getDonationUrl() {
  const configured = process.env.DONATION_URL?.trim();
  if (!configured) return DEFAULT_DONATION_URL;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return DEFAULT_DONATION_URL;
    }
    return url.href;
  } catch {
    return DEFAULT_DONATION_URL;
  }
}

function icon(id) {
  const paths = {
    top_season: '<path d="M15 10h18v9c0 7-4 12-9 12s-9-5-9-12v-9Z"/><path d="M15 13H8v5c0 6 4 10 10 10M33 13h7v5c0 6-4 10-10 10"/><path d="M24 31v7M18 38h12M15 42h18"/><path d="m24 14 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7Z" fill="currentColor" stroke="none"/>',
    upcoming_3_days: '<rect x="7" y="10" width="27" height="29" rx="4"/><path d="M14 6v9M27 6v9M8 19h25"/><circle cx="33" cy="31" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="M33 25v6l4 2"/>',
    current_season: '<circle cx="24" cy="24" r="8"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2m18.4 18.4 4.2 4.2m0-26.8-4.2 4.2M14.8 33.2l-4.2 4.2"/>',
    previous_season: '<rect x="7" y="9" width="34" height="32" rx="4"/><path d="M15 5v9M33 5v9M8 18h32"/><path d="m17 29 5 5 10-11"/>',
    upcoming_season: '<rect x="7" y="10" width="34" height="31" rx="4"/><path d="M15 6v9M33 6v9M8 19h32M24 35V24m-5 5 5-5 5 5"/>',
    previous_3_days: '<path d="M7 7v10h10"/><path d="M7 17a17 17 0 1 1 2 15"/><path d="M24 14v10l7 5"/>',
    current_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/>',
    previous_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/><circle cx="35" cy="32" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="m30 32 3 3 6-7"/>',
    upcoming_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/><circle cx="35" cy="32" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="M35 37V27m-4 4 4-4 4 4"/>'
  };
  return '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + (paths[id] || '<circle cx="24" cy="24" r="14"/><path d="M24 16v16M16 24h16"/>') + '</svg>';
}

function iconName(id) {
  const names = {
    top_season: "trophy",
    upcoming_3_days: "calendar-clock",
    current_season: "sun",
    previous_season: "calendar-check",
    upcoming_season: "calendar-arrow-up",
    previous_3_days: "history",
    current_season_movies: "film",
    previous_season_movies: "film-check",
    upcoming_season_movies: "film-up"
  };
  return names[id] || "calendar";
}
function card(item, { routePrefix = "", optional = false } = {}) {
  const [name, id, description] = item;
  const type = id.endsWith("_movies") ? "movie" : "series";
  const url = `${BASE_URL}${routePrefix}/catalog/${type}/${id}.json`;
  const className = optional ? "catalog-card catalog-card-optional" : "catalog-card";
  return '<a class="' + className + '" href="' + url + '" data-preview-catalog="' + id + '" data-preview-type="' + type + '" data-preview-name="' + name + '" aria-haspopup="dialog" aria-controls="catalog-preview" aria-label="Open ' + name + ' catalog"><span class="catalog-icon" data-icon="' + iconName(id) + '" aria-hidden="true">' + icon(id) + '</span><span class="catalog-copy"><strong>' + name + '</strong><span>' + description + '</span><span class="preview-prompt">Preview titles <span aria-hidden="true">↗</span></span></span><svg class="catalog-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';
}

function installationGuide(manifest, install) {
  const supportsAppLink = manifest.startsWith("https:");
  return `<section class="install-guide" id="install" aria-labelledby="install-heading"><div class="container">
    <div class="guide-heading"><div><span class="about-kicker">A little setup. A lot to discover.</span><h2 id="install-heading">Add AniBloom to Nuvio</h2><p>Choose your titles, add one link, and make the catalogs your own.</p></div><span class="guide-badge">All 9 catalogs included</span></div>
    <div class="install-layout"><div class="install-options">
      <span class="step-label">01 / Your addon link</span>
      <div class="title-preference"><label for="title-preference">Anime title preference</label><select id="title-preference" aria-describedby="title-preference-help"><option value="english">English (default)</option><option value="romaji">Romaji (Latin alphabet)</option><option value="native">Native titles + Japanese catalog names</option></select><p id="title-preference-help">Choose how anime titles appear in your catalogs. All 9 catalogs are included with every language.</p><p>BetterPosters automatically enhances compatible posters. English and Romaji use English poster labels; Native uses Japanese. Titles without a compatible poster ID keep their original cover.</p></div>
      <p class="manual-install">Manual installation: <a href="${manifest}">${manifest}</a></p>
      <div class="manifest-actions"><button class="install-button" id="copy-manifest" type="button">Copy manifest URL</button><button class="outline-button" id="show-qr" type="button" aria-expanded="false" aria-controls="manifest-qr">Show QR code</button></div>
      <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      <div id="manifest-qr" class="manifest-qr" hidden><div id="qr-image" role="img" aria-label="QR code for the selected manifest URL"></div><p id="qr-status" role="status"></p><p>Scan to open this manifest URL on your phone, then copy it into Nuvio.</p></div>
      <p class="local-install-note" id="local-install-note" hidden>This link uses localhost and works only on this computer. A phone or TV needs an address it can reach on your network.</p>
      <noscript><p>Copy the manifest URL above manually. Language selection, QR codes, and catalog previews need JavaScript.</p></noscript>
    </div><div class="install-instructions">
      <span class="step-label">02 / Add it to your device</span>
      <fieldset class="platform-picker"><legend>Where do you use Nuvio?</legend><div><label><input type="radio" name="install-platform" value="web" checked><span>Web</span></label><label><input type="radio" name="install-platform" value="mobile"><span>Mobile</span></label><label><input type="radio" name="install-platform" value="tv"><span>TV</span></label></div></fieldset>
      <div data-platform-panel="web"><ol class="setup-steps"><li>Open Nuvio Web and select your profile.</li><li>Open Addons and choose the option to add an addon by URL.</li><li>Paste the manifest URL, confirm installation, and return to Home.</li></ol></div>
      <div data-platform-panel="mobile" hidden><ol class="setup-steps"><li>Install and open Nuvio on your phone.</li>${supportsAppLink ? `<li>Tap <a href="${install}" data-install-link>Add to Nuvio</a> to hand the link to the app.</li><li>If the app does not open, copy the manifest URL into the addon URL field in Nuvio.</li>` : '<li>Open Addons and choose the option to add an addon by URL.</li><li>Paste a manifest URL your phone can reach. Local HTTP installation depends on your Nuvio client.</li>'}</ol></div>
      <div data-platform-panel="tv" hidden><ol class="setup-steps"><li>Open the Addons screen in Nuvio on your TV.</li><li>Choose the custom addon or URL installation option available in your TV build.</li><li>Enter a manifest URL your TV can reach and confirm. Menu names and installation options vary by TV build.</li></ol></div>
      <a class="guide-install-link" href="${install}" data-install-link>${supportsAppLink ? "Open in the Nuvio app" : "Open manifest URL"} <span aria-hidden="true">↗</span></a>
      <div class="setup-finish"><span class="step-label">03 / Make it yours</span><p>Use Nuvio’s catalog controls to show, hide, and reorder your Home rows. Keep a compatible metadata provider installed for title details and artwork.</p></div>
      <div class="setup-help"><details><summary>Top Anime is missing from Home</summary><p>Top Anime of the Season is the ninth catalog. Some clients initially show only eight rows. In Nuvio Web, open Settings → Home catalog customization to enable or reorder it using per-catalog controls; on mobile/TV, look for Catalog Customization. Home arrangements can differ by platform.</p></details><details><summary>I see duplicate catalogs</summary><p>Switching an installed addon variant may require removing the previous installation. Keep one AniBloom title-language variant installed.</p></details><details><summary>Titles open without details or artwork</summary><p>AniBloom supplies catalogs. Add a compatible metadata provider in Nuvio, such as ioametadata, Xperience, or BingeCat. External poster availability and detail-page artwork depend on the client and provider.</p></details></div>
    </div></div></div></section>`;
}

function featureIcon(kind) {
  const paths = {
    layers: '<path d="m24 5 18 10-18 10L6 15 24 5Z"/><path d="m6 23 18 10 18-10M6 31l18 10 18-10"/>',
    radio: '<path d="M14 10Q2 24 14 38M34 10Q46 24 34 38M20 17Q13 24 20 31M28 17Q35 24 28 31"/><circle cx="24" cy="38" r="3" fill="currentColor" stroke="none"/>',
    bolt: '<path d="m27 3-19 24h14l-2 18 20-26H26l1-16Z" fill="currentColor" stroke="none"/>'
  };
  return '<svg viewBox="0 0 48 48" aria-hidden="true">' + paths[kind] + '</svg>';
}

export default function handler(req, res) {
  const manifest = BASE_URL + "/manifest.json";
  const install = manifest.replace("https://", "nuvio://");
  const donate = getDonationUrl();
  const html = [
    '<!doctype html><html lang="en"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark light"><meta name="theme-color" content="#090B0D">',
    '<meta name="description" content="Anime discovery catalogs, organized for Nuvio. Discover upcoming seasons, current releases, and recently aired anime through focused catalogs.">',
    '<title>AniBloom — Anime Discovery for Nuvio</title><link rel="stylesheet" href="/assets/anibloom.css"><script src="/assets/anibloom-home.js" defer></script></head><body>',
    '<a class="skip-link" href="#main-content">Skip to content</a>',
    '<header class="site-header"><div class="container header-inner">',
    '<a class="brand" href="#home" aria-label="AniBloom home"><img src="/assets/anibloom-icon.png" width="43" height="43" alt=""><span class="brand-name">AniBloom</span><span class="brand-tagline">Anime Discovery for Nuvio</span></a>',
    '<nav class="desktop-nav" aria-label="Main navigation"><a class="active" href="#home" data-section-link="home" aria-current="location">Overview</a><a href="#catalogs" data-section-link="catalogs">Catalogs</a><a href="#about" data-section-link="about">About</a></nav>',
    '<a class="install-button header-install" href="' + install + '" data-install-link><span aria-hidden="true">↓</span> Add to Nuvio</a>',
    '<details class="mobile-menu"><summary aria-label="Open navigation menu"><span class="menu-icon" aria-hidden="true"><span></span></span></summary><nav aria-label="Mobile navigation"><a class="active" href="#home" data-section-link="home" aria-current="location">Overview</a><a href="#catalogs" data-section-link="catalogs">Catalogs</a><a href="#about" data-section-link="about">About</a><a href="' + install + '" data-install-link>Add to Nuvio</a></nav></details>',
    '</div></header><main id="main-content">',
    '<section class="hero-section" id="home"><div class="hero-stage"><div class="container hero-grid"><div class="hero-copy">',
    '<h1>Discover anime.<br>Every season.</h1><p class="hero-lead">Anime discovery catalogs, organized for Nuvio.</p>',
    '<p class="hero-description">Find upcoming seasons, current releases, and recently aired anime through focused catalogs built for a better Nuvio experience.</p>',
    '<div class="hero-actions"><a class="install-button" href="' + install + '" data-install-link>↓ &nbsp; Add to Nuvio</a><a class="outline-button" href="#catalogs">Explore catalogs →</a></div>',
    '<p class="setup-link">First time here? <a href="#install">Follow the installation guide <span aria-hidden="true">→</span></a></p>',
    '<p class="metadata-provider-note">Catalogs only. Use a separate metadata provider in Nuvio<br>(e.g., ioametadata, Xperience, BingeCat, or other compatible providers).</p>',
    '</div></div>',
    '<div class="hero-art"><img src="/assets/anibloom-anime-hero-artwork.webp" width="1024" height="683" alt="Anime-inspired Nuvio discovery interface on a tablet and phone, framed by cherry blossoms" fetchpriority="high"></div></div>',
    '<div class="container features"><article class="feature"><span class="feature-icon">' + featureIcon("layers") + '</span><div><h2>Seasonal discovery</h2><p>Browse anime by season, including upcoming, current, and previous releases.</p></div></article>',
    '<article class="feature"><span class="feature-icon" data-icon="radio">' + featureIcon("radio") + '</span><div><h2>Airing now &amp; next</h2><p>Follow what is airing now and what is coming up next.</p></div></article>',
    '<article class="feature"><span class="feature-icon">' + featureIcon("bolt") + '</span><div><h2>One-click installation</h2><p>Add the addon to Nuvio with a single tap or use the manifest URL.</p></div></article></div></section>',
    installationGuide(manifest, install),
    '<section class="catalog-section section-reveal" id="catalogs"><div class="container"><div class="section-heading"><h2>Explore catalogs</h2><p>Nine supported catalogs to help you discover and follow anime in Nuvio. Select a catalog to preview its titles.</p></div>',
    '<div class="catalog-grid">' + CATALOGS.map((item) => card(item)).join("") + '</div>',
    '<section class="optional-catalogs" aria-labelledby="optional-catalogs-heading"><h3 id="optional-catalogs-heading">More included catalogs</h3><p>All 9 catalogs are included in the standard manifest. Top Anime of the Season is the ninth catalog and may be hidden from Home initially. In Nuvio Web, use Settings → Home; on supported TV/mobile clients, open Catalog Customization to enable or reorder it. A newly enabled ranking row may generate extra requests.</p>',
    '<div class="catalog-grid optional-catalog-grid">' + ADDITIONAL_CATALOGS.map((item) => card(item, { optional: true })).join("") + '</div></section>',
    '',
    '</div></section><section class="about-section section-reveal" id="about"><div class="container"><div class="about-grid"><div class="about-label"><span class="about-kicker">About AniBloom</span><h2>What AniBloom is</h2></div><div class="about-copy"><p>AniBloom is a catalog-only Nuvio addon for discovering anime. It organizes titles into focused catalogs for upcoming episodes, recently aired episodes, and current, previous, and upcoming seasons—including seasonal movies.</p><p>It helps you find what to watch. Nuvio and your separately installed providers handle the metadata and playback experience.</p></div><div class="about-label about-label-secondary"><h2>What AniBloom is not</h2></div><div class="about-copy"><p>AniBloom is not a streaming service, media host, or metadata provider. It does not host, store, stream, or distribute anime, and it does not provide metadata such as descriptions, artwork, or episode information.</p><p>To see detailed titles and artwork in Nuvio, use a compatible metadata provider alongside AniBloom.</p></div></div><section class="donation-section reveal-on-scroll" id="support" aria-labelledby="support-heading"><div><h2 id="support-heading">Support the addon</h2><p>Your support helps keep AniBloom maintained.</p></div><a class="button donation-button" data-support-button href="' + donate + '" target="_blank" rel="noopener noreferrer">Support development</a></section></div></section></main>',
    '<footer class="site-footer">',
    '<div class="container footer-inner"><div><div class="footer-brand"><img src="/assets/anibloom-icon.png" width="40" height="40" alt="">AniBloom</div><p class="footer-subtitle">Anime Discovery for Nuvio · Where anime blooms.</p></div>',
    '<nav class="footer-links" aria-label="Footer links"><a href="/privacy.html">Privacy &amp; data</a><a href="' + REPOSITORY_URL + '" target="_blank" rel="noopener noreferrer">◉ &nbsp; Open Source</a>',
    '</nav></div></footer>',
    '<dialog class="catalog-preview" id="catalog-preview" aria-labelledby="preview-heading"><div class="preview-header"><div><span class="about-kicker">A glimpse of your next watch</span><h2 id="preview-heading">Catalog preview</h2><p id="preview-language"></p></div><button class="preview-close" type="button" aria-label="Close catalog preview" autofocus>×</button></div><div class="preview-body"><p id="preview-status" class="preview-status" role="status" aria-live="polite"></p><ul class="preview-grid" id="preview-titles" aria-label="Preview titles"></ul><button class="outline-button" id="preview-retry" type="button" hidden>Try again</button><p class="preview-note">A sample from this catalog. Install AniBloom to browse the full selection in Nuvio.</p></div></dialog>',
    "<script>(function(){const picker=document.getElementById(\"title-preference\");if(!picker)return;const origin=" + JSON.stringify(BASE_URL) + ";const links=Array.from(document.querySelectorAll('a[data-install-link]'));const manual=document.querySelector(\".manual-install a\");const update=()=>{const prefix=picker.value===\"romaji\"?\"/romaji\":picker.value===\"native\"?\"/native\":\"\";const url=origin+prefix+\"/manifest.json\";const link=url.replace(\"https://\",\"nuvio://\");links.forEach(a=>a.href=link);if(manual){manual.href=url;manual.textContent=url;}};picker.addEventListener(\"change\",update);update();})();</script>",
    '<script>(function(){const links=Array.from(document.querySelectorAll("[data-section-link]"));const sections=links.map(link=>document.getElementById(link.dataset.sectionLink)).filter(Boolean);const header=document.querySelector(".site-header");const revealItems=Array.from(document.querySelectorAll(".feature,.catalog-card,.about-label,.about-copy,.donation-section,.section-reveal"));const setActive=id=>links.forEach(link=>{const active=link.dataset.sectionLink===id;link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");});const updateActive=()=>{header?.classList.toggle("is-floating",window.scrollY>24);const marker=Math.min(window.innerHeight*0.35,260);let current=sections[0];for(const section of sections){if(section.getBoundingClientRect().top<=marker)current=section;else break;}setActive(current.id);header?.classList.toggle("is-floating",window.scrollY>24);};const reveal = (entries, observer) => entries.forEach(entry => { if (!entry.isIntersecting) return; entry.target.classList.add("is-visible"); observer.unobserve(entry.target); });const sectionObserver=new IntersectionObserver(reveal,{threshold:.1,rootMargin:"0px 0px -18%"});const cardObserver=new IntersectionObserver(reveal,{threshold:.25,rootMargin:"0px 0px -12%"});revealItems.forEach(item=>{item.classList.add("reveal-on-scroll");if(item.classList.contains("catalog-card"))cardObserver.observe(item);else if(item.classList.contains("section-reveal"))sectionObserver.observe(item);else sectionObserver.observe(item);});links.forEach(link=>link.addEventListener("click",()=>setActive(link.dataset.sectionLink)));window.addEventListener("scroll",updateActive,{passive:true});window.addEventListener("resize",updateActive);window.addEventListener("hashchange",updateActive);updateActive();})();</script></body></html>'
  ].join("");
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.send(html);
}
