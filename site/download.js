// Point the download button straight at the latest installer, with its version. If GitHub can't
// be reached, the links stay on the latest release page, which always works.
(async () => {
  try {
    const r = await fetch('https://api.github.com/repos/offdarecord/tScore/releases/latest');
    if (!r.ok) return;
    const release = await r.json();
    const assets = release.assets || [];
    // The Mac beta's .dmg files (#61), when this release has them.
    for (const arch of ['arm64', 'x64']) {
      const dmg = assets.find((a) => a.name.endsWith(`-mac-${arch}.dmg`));
      const link = globalThis.document.getElementById(`mac-${arch}`);
      if (dmg && link) link.href = dmg.browser_download_url;
    }
    const exe = assets.find((a) => /^tScore-Setup-.+\.exe$/.test(a.name));
    if (!exe) return;
    const version = String(release.tag_name || '').replace(/^v/, '');
    const mb = Math.round(exe.size / 1_000_000);
    for (const id of ['download-button', 'download-link']) {
      const a = globalThis.document.getElementById(id);
      if (a) a.href = exe.browser_download_url;
    }
    const button = globalThis.document.getElementById('download-button');
    if (button && version) button.textContent = `Download for Windows (${version})`;
    const note = globalThis.document.getElementById('download-note');
    if (note && version) {
      note.textContent = `Version ${version}, ${mb} MB. Free and open source. Windows 10 and 11. Early version: try it at home before you use it at an event.`;
    }
  } catch {
    // Offline or rate-limited: the release page link still works.
  }
})();
