// The search field: a report link, or a character as Name-Realm with realm suggestions.

import type { Realm, Region } from "../shared/api.ts";
import { getRealms } from "./api.ts";
import { dom, errorMessage, setStatus } from "./dom.ts";
import { esc } from "./format.ts";
import { prefs } from "./prefs.ts";
import { navigate, onNavigate } from "./router.ts";
import { DEMO_CODE, matchRealms, parseCharacterInput, parseReportInput } from "./search-input.ts";

const { search: input, form, regionButton, suggestions: list } = dom;

// ---------- region ----------

let region: Region = prefs.region();
regionButton.textContent = region;

function setRegion(r: Region) {
  region = r;
  regionButton.textContent = r;
  prefs.setRegion(r);
}

regionButton.addEventListener("click", () => {
  setRegion(region === "EU" ? "US" : "EU");
  updateSuggestions();
  input.focus();
});

// ---------- submit ----------

/** "Name-Realm" typed and not a report link. */
const characterInput = (value: string) => (/reports\//.test(value) ? null : parseCharacterInput(value));

async function submit() {
  hideSuggestions();
  const value = input.value;
  const char = characterInput(value);
  if (char) {
    try {
      const realm = matchRealms(await getRealms(region), char.realm)[0];
      if (!realm) {
        setStatus(`Unknown ${region} realm "${char.realm}".`, true);
        return;
      }
      navigate({
        page: "character",
        name: char.name,
        realm: realm.slug,
        region,
        section: prefs.section(),
        zone: null,
        difficulty: null,
      });
    } catch (e) {
      setStatus(errorMessage(e), true);
    }
    return;
  }
  const report = parseReportInput(value);
  if (!report) {
    setStatus("Paste a Warcraft Logs report link, or type a character as Name-Realm.", true);
    return;
  }
  navigate({
    page: "report",
    code: report.code,
    fight: report.fight,
    player: null,
    tree: null,
    metric: null,
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});

// load right away when a link is pasted
input.addEventListener("paste", () => setTimeout(submit));

// keep the field in sync with what's shown (e.g. after back/forward)
onNavigate((route) => {
  if (route.page === "landing") input.value = "";
  else if (route.page === "report") {
    input.value = route.code === DEMO_CODE ? DEMO_CODE : `https://www.warcraftlogs.com/reports/${route.code}`;
  } else {
    setRegion(route.region);
    const typed = characterInput(input.value);
    if (typed?.name.toLowerCase() !== route.name.toLowerCase()) input.value = `${route.name}-${route.realm}`;
  }
});

// ---------- realm suggestions while typing "Name-Re…" ----------

let suggestions: Realm[] = [];
let active = -1;

function hideSuggestions() {
  suggestions = [];
  active = -1;
  list.classList.add("hidden");
}

function renderSuggestions(name: string) {
  list.innerHTML = suggestions
    .map(
      (r, i) =>
        `<li data-realm="${i}" class="cursor-pointer px-3 py-1.5 ${i === active ? "bg-panel-2 text-gold" : "text-zinc-300 hover:bg-panel-2"}">
          <span class="text-zinc-500">${esc(name)}-</span>${esc(r.name)}
        </li>`,
    )
    .join("");
  list.classList.toggle("hidden", !suggestions.length);
}

async function updateSuggestions() {
  if (!characterInput(input.value)) {
    hideSuggestions();
    return;
  }
  const realms = await getRealms(region).catch(() => []);
  const current = characterInput(input.value);
  if (!current) return;
  const matches = matchRealms(realms, current.realm);
  // nothing to suggest once the realm is typed out exactly
  suggestions = matches[0]?.name.toLowerCase() === current.realm.toLowerCase() ? [] : matches.slice(0, 8);
  active = -1;
  renderSuggestions(current.name);
}

function pickSuggestion(i: number) {
  const char = characterInput(input.value);
  const realm = suggestions[i];
  if (!char || !realm) return;
  input.value = `${char.name}-${realm.name}`;
  submit();
}

input.addEventListener("input", updateSuggestions);
input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
input.addEventListener("keydown", (e) => {
  if (!suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    active = (active + step + suggestions.length) % suggestions.length;
    renderSuggestions(characterInput(input.value)?.name ?? "");
  } else if (e.key === "Enter" && active >= 0) {
    e.preventDefault();
    pickSuggestion(active);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});
// mousedown, so it fires before the input's blur hides the list
list.addEventListener("mousedown", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("[data-realm]");
  if (!li) return;
  e.preventDefault();
  pickSuggestion(Number(li.dataset.realm));
});
