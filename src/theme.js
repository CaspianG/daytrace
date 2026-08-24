export const THEME_MODES = Object.freeze(["system", "light", "dark"]);

export function normalizeTheme(value, fallback = "system") {
  const normalized = String(value || "").toLowerCase();
  if (THEME_MODES.includes(normalized)) return normalized;
  return THEME_MODES.includes(fallback) ? fallback : "system";
}

export function systemPrefersDark(media = globalThis.matchMedia?.("(prefers-color-scheme: dark)")) {
  return Boolean(media?.matches);
}

export function effectiveTheme(mode, prefersDark = systemPrefersDark()) {
  const normalized = normalizeTheme(mode);
  return normalized === "system" ? (prefersDark ? "dark" : "light") : normalized;
}

export function applyDocumentTheme(mode, root = globalThis.document?.documentElement, prefersDark = systemPrefersDark()) {
  const normalized = normalizeTheme(mode);
  const effective = effectiveTheme(normalized, prefersDark);
  if (!root) return effective;
  root.dataset.themeMode = normalized;
  root.dataset.theme = effective;
  root.style.colorScheme = effective;
  return effective;
}

export function bootstrapTheme(search = globalThis.location?.search || "") {
  const selected = normalizeTheme(new URLSearchParams(search).get("theme"));
  return applyDocumentTheme(selected);
}

export function observeSystemTheme(mode, onChange) {
  const selected = normalizeTheme(mode);
  const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  if (selected !== "system" || !media) return () => {};
  const listener = () => {
    const effective = applyDocumentTheme("system", globalThis.document?.documentElement, media.matches);
    onChange?.(effective);
  };
  media.addEventListener?.("change", listener);
  return () => media.removeEventListener?.("change", listener);
}

export function transitionDocumentTheme(mode, { clientX, clientY, onCommit } = {}) {
  const selected = normalizeTheme(mode);
  const root = globalThis.document?.documentElement;
  if (!root) {
    onCommit?.(selected);
    return null;
  }

  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    applyDocumentTheme(selected, root);
    onCommit?.(selected);
  };
  if (reducedMotion) {
    commit();
    return null;
  }

  const x = Number.isFinite(clientX) ? clientX : globalThis.innerWidth - 56;
  const y = Number.isFinite(clientY) ? clientY : globalThis.innerHeight - 56;
  const farthestX = Math.max(x, globalThis.innerWidth - x);
  const farthestY = Math.max(y, globalThis.innerHeight - y);
  const radius = Math.ceil(Math.hypot(farthestX, farthestY));
  root.style.setProperty("--theme-x", `${x}px`);
  root.style.setProperty("--theme-y", `${y}px`);
  root.style.setProperty("--theme-radius", `${radius}px`);

  if (typeof globalThis.document?.startViewTransition === "function") {
    root.classList.add("theme-transitioning");
    try {
      const transition = globalThis.document.startViewTransition(commit);
      transition.finished.catch(() => {}).finally(() => root.classList.remove("theme-transitioning"));
      return transition;
    } catch {
      root.classList.remove("theme-transitioning");
    }
  }

  root.classList.add("theme-transition-fallback");
  const veil = globalThis.document.createElement("div");
  const target = effectiveTheme(selected);
  veil.className = "theme-transition-veil";
  veil.setAttribute("aria-hidden", "true");
  Object.assign(veil.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    background: target === "dark"
      ? `radial-gradient(circle at ${x}px ${y}px, #33412f 0, #1a2017 28%, #11140f 58%)`
      : `radial-gradient(circle at ${x}px ${y}px, #e1eadc 0, #f4f3ed 30%, #fbfaf7 60%)`,
    clipPath: `circle(0 at ${x}px ${y}px)`,
  });
  globalThis.document.body.append(veil);

  if (typeof veil.animate !== "function") {
    commit();
    veil.remove();
    root.classList.remove("theme-transition-fallback");
    return null;
  }

  const cover = veil.animate([
    { clipPath: `circle(0 at ${x}px ${y}px)` },
    { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
  ], { duration: 340, easing: "cubic-bezier(.2, .82, .2, 1)", fill: "forwards" });
  cover.finished.then(() => {
    commit();
    return veil.animate([
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.012)" },
    ], { duration: 210, easing: "ease-out", fill: "forwards" }).finished;
  }).catch(commit).finally(() => {
    veil.remove();
    root.classList.remove("theme-transition-fallback");
  });
  return cover;
}
