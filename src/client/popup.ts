// Popups on <body> (talents, talent and log comparison): one at a time, closed by the backdrop, ✕ or Esc.

import { setStatus } from "./dom.ts";

const open = () => document.querySelector("[data-popup]");

/** Show `html` (a [data-popup] element), replacing the open popup if there is one. */
export function showPopup(html: string) {
  const current = open();
  if (current) current.outerHTML = html;
  else document.body.insertAdjacentHTML("beforeend", html);
}

export const closePopup = () => open()?.remove();

/** False once the visitor closed it, e.g. while its data was loading. */
export const isPopupOpen = () => open() !== null;

document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest("[data-popup]")) return;
  if (target.matches("[data-popup]") || target.closest("[data-close-popup]")) {
    closePopup();
    return;
  }
  const copy = target.closest<HTMLElement>("[data-copy-talents]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copyTalents ?? "").then(
      // done: plain text instead of the button
      () =>
        copy.replaceWith(
          Object.assign(document.createElement("span"), {
            className: "ml-auto text-sm text-zinc-400",
            textContent: "Copied ✓",
          }),
        ),
      () => setStatus("Couldn't copy to the clipboard.", true),
    );
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopup();
});
