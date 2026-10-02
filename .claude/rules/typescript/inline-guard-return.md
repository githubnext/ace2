---
paths: "**/*.{ts,tsx,js,jsx}"
---

# TypeScript: Inline Guard Returns

When a guard's only purpose is to run one expression and return, fold both into a single `return`.

## Rule

- Prefer `if (cond) return fn();` over `if (cond) { fn(); return; }`
- Works when the enclosing function returns `void` — `return expr;` discards the value
- Skip when the enclosing function returns `T | undefined` (e.g. `Bridge | undefined`) — TS rejects `return voidExpr;` even though `return;` is fine there
- Skip when the inner call returns a thenable inside an `async` function — inlining auto-awaits and changes timing
- Skip pure assignments like `ref.current = true; return;` — `return ref.current = true;` reads worse than the original

## Example

**Avoid:**

```ts
if (win) {
	win.focus();
	return;
}
```

**Prefer:**

```ts
if (win) return win.focus();
```
