import { getBudget } from "./api.ts";
import { dom } from "./dom.ts";

/** API points left, in the footer. A dev tool: left out of the production build. */
export async function showBudget() {
  if (!import.meta.env.DEV) return;
  const b = await getBudget().catch(() => null);
  if (!b) {
    dom.budget.textContent = "";
    return;
  }
  const minutes = Math.max(1, Math.ceil(b.resetIn / 60));
  dom.budget.textContent = `Warcraft Logs API: ${Math.max(0, Math.floor(b.remaining))} of ${b.limit} points left this hour, resets in ${minutes} min`;
}
