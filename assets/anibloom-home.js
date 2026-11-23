/* Homepage interactions: no catalog requests until a visitor opens a preview. */
(() => {
  "use strict";

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
      copyStatus.textContent = "Manifest URL copied. Paste it into Nuvio.";
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

  document.querySelectorAll('[name="install-platform"]').forEach(radio => {
    radio.addEventListener("change", () => {
      document.querySelectorAll("[data-platform-panel]").forEach(panel => {
        panel.hidden = panel.dataset.platformPanel !== radio.value;
      });
    });
  });
})();
