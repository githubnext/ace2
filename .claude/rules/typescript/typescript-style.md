---
paths: "**/*.{ts,tsx,js,jsx}"
---

# TypeScript: Style and Patterns

## Documentation

- Comment only when explaining a non-obvious reason, constraint, or contract.
- Don't narrate implementation or repeat types, parameters, or return values.
- Keep necessary comments accurate; prefer clear code over explanatory prose.

## Style

- Prefer `||` over `??`; only use `??` when strictly needed
- Name variables to enable shorthand property syntax (`{ settings }` not `{ settings: mySettings }`)

## Import Ordering

Group imports in this order (separated by blank lines):

1. **External** — Third-party packages from node_modules
2. **App-wide** — Shared packages (`@ace/*`)
3. **Local** — Relative imports from current package

## Conditionals

- Prefer early returns and guard clauses over nested if statements
- Invert for early returns (use negative conditions to exit early)
- Inline single-line returns without braces
- Break long AND chains into sequential checks

## Boolean Function Naming

Use prefixes: `is`, `has`, `should`, `can`, `will`

- `is` — State checks: `isRecent()`, `isVisible()`
- `has` — Possession: `hasPermission()`, `hasReaction()`
- `should` — Conditional: `shouldShowToolbar()`
- `can` — Capability: `canEdit()`, `canDelete()`

## Null Guards

Before adding guards (`?.`, `??`, `if (!value)`), verify data can actually be undefined:

- Check TypeScript types first — if non-nullable, don't guard
- Trace data sources — if always initialized, it can't be undefined
- Trust backend guarantees and types
- Don't guard dev-only issues (HMR, cache timing)
