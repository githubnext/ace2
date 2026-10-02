# Creating New Rule Files

When creating a new rule file in `.claude/rules/`, follow this structure and place it in the appropriate category directory.

## Required Structure

```markdown
---
paths: "**/*.{ts,tsx}"
---

# Topic: Brief Context

One sentence describing the rule.

## Rule

- Actionable guideline 1
- Actionable guideline 2
```

## Rules for Writing Rules

**YAML Frontmatter (required):**

- Every rule file MUST have a `paths` field in YAML frontmatter
- Use glob patterns to specify which files the rule applies to
- Common patterns:
  - `**/*.{ts,tsx,js,jsx}` - All TypeScript/JavaScript files
  - `**/*.{css,scss,sass}` - All CSS files
  - `clients/app/**/*.tsx` - Only app client TSX files
  - `**/*.stories.{ts,tsx}` - Only Storybook files

**Directory placement:**

- Place in appropriate category: `typescript/`, `css/`
- If creating a new category, create a new subdirectory

**Content:**

- As short as possible. Max 50 lines.
- Title includes topic + context: "React: Component Patterns"
- Lead with the solution, not the problem
- Avoid repetition
- Each rule file addresses one topic. Split complex topics into multiple files.

**Naming:**

- kebab-case ending in `.md`
- Use prefixes for related rules: `react-patterns.md`
- Be descriptive: `component-placement.md`

**What to avoid:**

- Long explanations
- Obvious patterns already covered by linters

## File Organization

```
.claude/rules/
├── typescript/             # TypeScript/JavaScript rules
│   └── your-rule.md
├── css/                    # CSS rules
│   └── your-rule.md
└── writing-rules-guide.md  # This file
```

## After Creating a Rule

1. **Verify the paths pattern:**
   - Ensure the glob pattern in frontmatter matches intended files
   - Test by editing a file that should match the pattern
   - Claude Code will automatically load rules matching the file being edited

2. **Check rule loads correctly:**
   - Edit a file matching the rule's `paths` pattern
   - Claude should automatically apply the rule

## Example Reference

See existing files in `.claude/rules/` for patterns
