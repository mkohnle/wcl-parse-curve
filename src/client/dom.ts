import { esc } from "./format.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Page elements; the content area gets one container per page. */
export const dom = {
  form: $<HTMLFormElement>("load-form"),
  search: $<HTMLInputElement>("url"),
  searchButton: $<HTMLButtonElement>("go"),
  regionButton: $<HTMLButtonElement>("region"),
  suggestions: $("suggest"),
  status: $("status"),
  hero: $("hero"),
  recent: $("recent"),
  content: $("report"),
  tooltip: $("tooltip"),
  budget: $("budget"),
};

dom.content.innerHTML = `<div id="character"></div><div id="report-head"></div><div id="fights"></div><div id="players"></div><div id="analysis"></div>`;

export const pageDom = {
  character: $("character"),
  reportHead: $("report-head"),
  fights: $("fights"),
  players: $("players"),
  analysis: $("analysis"),
};

export function setStatus(text: string, isError = false) {
  dom.status.innerHTML = isError ? `<span class="text-red-400">${esc(text)}</span>` : esc(text);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Disables the search button while something loads. */
export function setBusy(busy: boolean) {
  dom.searchButton.disabled = busy;
}
