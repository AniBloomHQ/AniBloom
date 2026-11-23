export function renderCatalogPreviewDialog({ configurationPath = "" } = {}) {
  return `<dialog class="catalog-preview" id="catalog-preview" aria-labelledby="preview-heading"${configurationPath ? ` data-preview-configuration="${configurationPath}"` : ""}>
    <div class="preview-header"><div><span class="about-kicker">Catalog preview</span><h2 id="preview-heading">Catalog sample</h2><p id="preview-language"></p></div>
      <button class="preview-close" type="button" aria-label="Close catalog preview" autofocus>×</button></div>
    <div class="preview-body"><p id="preview-status" class="preview-status" role="status" aria-live="polite"></p>
      <ul class="preview-grid" id="preview-titles" aria-label="Preview titles"></ul>
      <button class="outline-button" id="preview-retry" type="button" hidden>Try again</button>
      <p class="preview-note"></p></div>
  </dialog>`;
}
