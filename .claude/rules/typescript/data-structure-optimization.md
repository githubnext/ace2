---
paths: "**/*.{ts,tsx,js,jsx}"
---

# Data Structure Optimization: Map vs Array for Lookups

Use Map or Record instead of arrays for frequent key-based lookups to avoid O(n) operations.

- Use `Map<string, Value>` or `Record<string, Value>` when frequently looking up by key
- Avoid `array.find()` or `array.filter()` in hot paths
- `Map<string, Set<string>>` preferred over `Record<string, string[]>` for O(1) membership checks.

## Examples

**Anti-pattern (O(n) lookups):**

```typescript
let items: Item[] = [{ key: "a", value: "..." }];
const found = items.find(item => item.key === targetKey); // O(n)
```

**Better (O(1) lookups):**

```typescript
let items = new Map<string, Value>([["a", valueA]]);
const found = items.get(targetKey); // O(1)
```
