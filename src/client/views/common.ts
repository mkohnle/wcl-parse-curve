export const img = (src: string, classes: string, fallback?: string, style = "") =>
  `<img src="${src}" alt="" loading="lazy" class="icon ${classes}"${fallback ? ` data-fallback="${fallback}"` : ""}${style ? ` style="${style}"` : ""} />`;

/** Separator between details on one line, e.g. "Arms Warrior | Arthas". */
export const SEP = `<span class="mx-1.5 text-zinc-600" aria-hidden="true">|</span>`;

/** A grey placeholder block while something loads. */
export const skeleton = (classes: string) =>
  `<span class="block animate-pulse rounded-sm bg-panel-2 ${classes}"></span>`;
