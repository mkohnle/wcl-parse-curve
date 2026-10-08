import type { Region } from "../../shared/api.ts";
import { showBudget } from "../budget.ts";
import { dom, setStatus } from "../dom.ts";
import { prefs } from "../prefs.ts";
import { loadRecent } from "../recent.ts";
import { navigate, registerPage } from "../router.ts";
import { renderHeroCurve, renderRecent } from "../views/landing.ts";

// The front page: key visual and recently viewed; hidden once something is open.
registerPage("landing", {
  show() {
    dom.hero.innerHTML = renderHeroCurve();
    dom.recent.innerHTML = renderRecent(loadRecent());
    setStatus("");
    showBudget();
  },
  hide() {
    dom.hero.innerHTML = "";
    dom.recent.innerHTML = "";
  },
});

dom.recent.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-recent]");
  const it = btn && loadRecent()[Number(btn.dataset.recent)];
  if (!it) return;
  if (it.kind === "report") {
    navigate({ page: "report", code: it.code, fight: null, player: null, tree: null });
  } else {
    navigate({
      page: "character",
      name: it.name,
      realm: it.realm,
      region: it.region as Region,
      section: prefs.section(),
    });
  }
});
