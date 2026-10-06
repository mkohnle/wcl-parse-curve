import "./style.css";
import "./pages/landing.ts";
import "./pages/report.ts";
import "./pages/character.ts";
import "./search.ts";
import { captureAdminToken } from "./api.ts";
import { navigate, startRouter } from "./router.ts";

// home link: switch pages instead of reloading (ctrl/middle click still open a new tab)
document.getElementById("home")?.addEventListener("click", (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate({ page: "landing" });
});

// missing boss icon: use the fallback, else hide
document.addEventListener(
  "error",
  (e) => {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    const fallback = target.dataset.fallback;
    if (fallback) {
      delete target.dataset.fallback;
      target.src = fallback;
    } else {
      target.style.visibility = "hidden";
    }
  },
  true,
);

captureAdminToken();
startRouter();
