export const img = (src: string, classes: string, fallback?: string, style = "") =>
  `<img src="${src}" alt="" loading="lazy" class="icon ${classes}"${fallback ? ` data-fallback="${fallback}"` : ""}${style ? ` style="${style}"` : ""} />`;

/** A grey placeholder block while something loads. */
export const skeleton = (classes: string) =>
  `<span class="block animate-pulse rounded-sm bg-panel-2 ${classes}"></span>`;
