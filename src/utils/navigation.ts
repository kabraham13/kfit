/**
 * History-stack helpers.
 *
 * The app is a single page driving Android's Back button through history
 * entries, so it needs to know how deep in the stack it currently is. The
 * browser will not tell you that, so every entry carries its own depth: entry 0
 * is the app root, and each navigation pushes depth + 1.
 *
 * Knowing the depth is what makes "go back to the log" possible as a single
 * `go(-n)` rather than stack surgery. Rewriting an entry in place to become the
 * new root would strand the older entries beneath it, and Exit — which relies on
 * stepping back off entry 0 — would land on one of them instead of leaving.
 */

export interface AppHistoryState {
  depth: number;
  appRoot?: boolean;
  tab?: string;
  subViewType?: string;
  [key: string]: unknown;
}

/** Depth of the entry currently displayed. */
export function currentDepth(): number {
  const state = window.history.state as AppHistoryState | null;
  return typeof state?.depth === 'number' ? state.depth : 0;
}

export function pushAppState(state: Record<string, unknown>) {
  window.history.pushState({ ...state, depth: currentDepth() + 1 }, '');
}

/** Rewrites the current entry, keeping its place in the stack. */
export function replaceAppState(state: Record<string, unknown>) {
  window.history.replaceState({ ...state, depth: currentDepth() }, '');
}

/** Establishes the root and the first real entry. Call once, on mount. */
export function anchorHistory(rootTab: string) {
  window.history.replaceState({ appRoot: true, depth: 0 }, '');
  window.history.pushState({ tab: rootTab, depth: 1 }, '');
}

/**
 * Unwinds to the first entry above the root — the log view.
 *
 * Fires a single popstate, which the normal handlers use to restore the tab and
 * close any open sub-view. Returns false when already there, so the caller can
 * skip the navigation entirely.
 */
export function resetToRootEntry(): boolean {
  const depth = currentDepth();
  if (depth <= 1) return false;
  window.history.go(-(depth - 1));
  return true;
}
