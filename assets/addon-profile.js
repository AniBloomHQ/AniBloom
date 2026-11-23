const list = document.querySelector("[data-catalog-order]");
if (list) {
  const status = document.getElementById("profile-order-status");
  const titleStyle = document.getElementById("title-style");
  titleStyle.addEventListener("change", () => {
    for (const row of list.children) {
      const label = row.querySelector("[data-catalog-name]");
      const name = label.dataset[titleStyle.value];
      label.textContent = name;
      for (const button of row.querySelectorAll("[data-move]")) {
        button.setAttribute("aria-label", `Move ${name} ${button.dataset.move}`);
      }
      const preview = row.querySelector("[data-preview-catalog]");
      if (preview) {
        preview.dataset.previewName = name;
        preview.setAttribute("aria-label", `Preview ${name}`);
      }
    }
  });
  function updateButtons() {
    for (const row of list.children) {
      row.querySelector('[data-move="up"]').disabled = !row.previousElementSibling;
      row.querySelector('[data-move="down"]').disabled = !row.nextElementSibling;
    }
  }
  updateButtons();
  list.addEventListener("click", event => {
    const direction = event.target.dataset.move;
    if (!direction) return;
    const row = event.target.closest("li");
    const neighbor = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
    if (!neighbor) return;
    if (direction === "up") neighbor.before(row);
    else neighbor.after(row);
    updateButtons();
    const target = event.target.disabled ? row.querySelector("button[data-move]:not(:disabled)") : event.target;
    target?.focus();
    status.textContent = `${row.querySelector("label").textContent.trim()} moved to position ${Array.from(list.children).indexOf(row) + 1}.`;
  });
}

document.querySelector("[data-copy-profile]")?.addEventListener("click", async () => {
  const input = document.getElementById("profile-link");
  const status = document.getElementById("profile-copy-status");
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = "Manifest URL copied.";
  } catch {
    input.select();
    status.textContent = "The URL is selected. Copy it manually.";
  }
});
