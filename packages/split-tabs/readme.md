# @ace/split-tabs

Renderless split-pane and tab state for Ace. The package owns layout math:
tabs, panes, grid lines, resize bounds, min-size constraints, and saved state
shape. Rendering, labels, icons, storage, tooltips, and drag UI belong to the
consuming app.

## Model

```ts
import * as Split from "@ace/split-tabs";

let state = Split.initial("session");
let api = Split.create(state, { min: tab => tab === "session" ? 450 : 350 });
```

- `Tab` is a string id.
- `Pane` stores a grid area, ordered tab ids, and the active tab.
- `State` stores `rows`, `cols`, `panes`, `tabs`, focused pane, and id counters.
- `Config.min` is optional and returns the minimum pane size in pixels.

## Rendering

```ts
let view = api.view({ width, height, flat });
let css = Split.style(view);

root.style.gridTemplateColumns = css.gridTemplateColumns;
root.style.gridTemplateRows = css.gridTemplateRows;

for (let pane of view.panes) {
	element.style.gridArea = Split.place(pane);
}

for (let handle of Split.handles(view)) {
	handleElement.style.gridArea = Split.place(handle);
}
```

- `view(data)` returns the render state for a container size, projecting ratios inside min-size limits when possible.
- `flat: true` collapses all panes into one tab strip without changing saved state.
- `style(state)` returns CSS grid templates with named lines.
- `place(pane | handle)` returns a CSS `grid-area`.
- `handles(state)` returns resize handles for visible shared grid lines.

## Mutations

All mutations return `false` when nothing changed.

```ts
api.open({ tab: "notes" });
api.open({ to: { pane: "pane-1", side: "right" }, fit });
api.open({ tab: "notes", to: { pane: "pane-1" }, background: true });
api.move({ tab: "notes", to: { pane: "pane-2" }, fit });
api.move({ tab: "notes", to: { pane: "pane-2", before: "logs" }, fit });
api.move({ tab: "notes", to: { pane: "pane-2", side: "bottom" }, fit });
api.select({ tab: "notes" });
api.focus({ pane: "pane-2" });
api.close({ tab: "notes" });
api.resize({ axis: "col", line: "C1", ratio: 0.5, size: width });
```

- `open` creates a tab, optionally into a pane or split. `background` leaves active tabs and focus as they were.
- `move` reorders, moves between panes, or creates a split.
- `select` activates a tab and focuses its host pane.
- `focus` changes the focused pane.
- `close` removes a tab and compacts empty panes.
- `resize` moves a named grid line within min-size bounds.

## Persistence

```ts
let json = JSON.stringify(Split.save(api.get()));
let state = Split.restore(JSON.parse(json));
```

- `save` returns a versioned data object suitable for storage or transfer.
- `restore` turns saved data back into state. It also accepts raw `State` for migration from unversioned data.

## Constraints

```ts
let fit = { width, height, min };

let allowed = Split.can(state, {
	...fit,
	move: { tab: "notes", to: { pane: "pane-2", side: "right" } },
});

let bounds = Split.bounds(state, {
	axis: "col",
	line: "C1",
	ratio: 0.5,
	size: width,
	min,
});
```

- `can` checks whether an `open` or `move` would fit.
- `fits` checks whether a layout can fit a container after projection.
- `bounds` returns min/max resize ratios for a line.
- `constrain` projects a layout back inside min-size limits.
- `collapse` returns a one-pane tabbed layout.

## Store

```ts
let unsubscribe = api.subscribe(render);
let state = api.get();
```

The store is synchronous and framework-neutral. During pointer resize, update DOM
directly with `Split.style(next)` and call `api.resize` once on pointer up.
