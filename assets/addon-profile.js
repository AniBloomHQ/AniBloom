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

const wizard = document.querySelector("[data-profile-wizard]");
if (wizard) {
  const panels = [...wizard.querySelectorAll("[data-profile-step]")];
  const progress = document.querySelector("[data-profile-steps]");
  const progressItems = [...progress.children];
  const progressButtons = [...progress.querySelectorAll("[data-profile-go]")];
  const back = wizard.querySelector("[data-profile-back]");
  const next = wizard.querySelector("[data-profile-next]");
  const save = wizard.querySelector('button[type="submit"]');
  const catalogError = wizard.querySelector("[data-catalog-error]");
  const language = wizard.elements.namedItem("titleStyle");
  const password = wizard.elements.namedItem("password");
  const confirmation = wizard.elements.namedItem("confirmation");
  const encoder = new TextEncoder();
  let currentStep = Number(wizard.dataset.startStep);

  function showStep(step, moveFocus = true) {
    currentStep = step;
    for (const [index, panel] of panels.entries()) panel.hidden = index + 1 !== step;
    for (const [index, item] of progressItems.entries()) {
      const number = index + 1;
      item.toggleAttribute("data-complete", number < step);
      if (number === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    back.hidden = step === 1;
    next.hidden = step === panels.length;
    save.hidden = !next.hidden;
    if (moveFocus) panels[step - 1].querySelector("h2").focus();
  }

  function hasCatalogs() {
    return Boolean(wizard.querySelector('input[name="catalog"]:checked'));
  }

  function validateLanguage() {
    if (language.validity.valid) return true;
    if (currentStep !== 1) showStep(1);
    language.reportValidity();
    return false;
  }

  function validateCatalogs() {
    const checked = hasCatalogs();
    catalogError.hidden = checked;
    if (checked) return true;
    if (currentStep !== 2) showStep(2);
    wizard.querySelector('input[name="catalog"]').focus();
    return false;
  }

  function advance() {
    if (validateLanguage() && (currentStep === 1 || validateCatalogs())) showStep(currentStep + 1);
  }

  function updatePasswordValidity() {
    let passwordError = "";
    if (password.value && [...password.value].length < password.minLength) {
      passwordError = `Use at least ${password.minLength} characters.`;
    } else if (encoder.encode(password.value).length > 256) {
      passwordError = "Use a password of at most 256 bytes.";
    }
    password.setCustomValidity(passwordError);
    confirmation?.setCustomValidity(confirmation.value && password.value !== confirmation.value ? "The passwords must match." : "");
  }

  function updateProgressButtons() {
    updatePasswordValidity();
    const languageReady = language.validity.valid;
    const catalogsReady = languageReady && hasCatalogs();
    const passwordReady = password.validity.valid && (!confirmation || confirmation.validity.valid);
    const available = [true, languageReady, catalogsReady, catalogsReady && passwordReady && !save.disabled];
    for (const [index, button] of progressButtons.entries()) button.disabled = !available[index];
  }

  wizard.addEventListener("input", event => {
    if (event.target.name === "catalog" && event.target.checked) catalogError.hidden = true;
    updateProgressButtons();
  });
  progress.addEventListener("click", event => {
    const button = event.target.closest("[data-profile-go]");
    if (!button || button.disabled) return;
    const step = Number(button.dataset.profileGo);
    if (step > panels.length) {
      if (currentStep !== panels.length) showStep(panels.length);
      wizard.requestSubmit(save);
    } else if (step !== currentStep) {
      showStep(step);
    }
  });
  back.addEventListener("click", () => showStep(currentStep - 1));
  next.addEventListener("click", advance);
  wizard.addEventListener("submit", event => {
    if (currentStep < panels.length) {
      event.preventDefault();
      advance();
      return;
    }
    if (!validateLanguage() || !validateCatalogs()) {
      event.preventDefault();
      return;
    }
    updatePasswordValidity();
    if (!password.reportValidity() || (confirmation && !confirmation.reportValidity())) {
      event.preventDefault();
      return;
    }
    save.disabled = true;
    updateProgressButtons();
  });
  window.addEventListener("pageshow", () => {
    save.disabled = false;
    updateProgressButtons();
  });

  // The same inputs submit as a single form when JavaScript is unavailable.
  wizard.noValidate = true;
  updateProgressButtons();
  progress.hidden = false;
  showStep(currentStep, false);
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
