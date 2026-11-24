export function getNuvioInstallUrl(manifestUrl) {
  // Nuvio decodes addon links as HTTPS, so HTTP manifests need manual setup.
  return manifestUrl.startsWith("https://") ? manifestUrl.replace(/^https:/, "nuvio:") : null;
}
