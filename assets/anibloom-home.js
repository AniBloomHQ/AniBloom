const setupButton = document.getElementById("start-setup");
const setupDialog = document.getElementById("setup-dialog");
const mobileMenu = document.querySelector(".mobile-menu");

mobileMenu?.querySelector('a[href="#install"]')?.addEventListener("click", () => {
  mobileMenu.open = false;
});

if (setupButton && typeof setupDialog?.showModal === "function") {
  setupButton.hidden = false;
  document.querySelector(".setup-fallback").hidden = true;
  setupButton.addEventListener("click", () => {
    setupDialog.showModal();
    document.body.classList.add("preview-open");
  });
  setupDialog.querySelector(".preview-close").addEventListener("click", () => setupDialog.close());
  setupDialog.addEventListener("close", () => {
    document.body.classList.remove("preview-open");
    setupButton.focus({ preventScroll: true });
  });
}
