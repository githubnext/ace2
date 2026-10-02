# Third-party notices

`@ace/ui` is MIT-licensed. It contains or depends on the third-party material below, which keeps
its own license.

## Copied or adapted into this package

| Material                                                                       | Where                        | License                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [shadcn/ui](https://github.com/shadcn-ui/ui) components                        | `src/ui/*`, `src/shadcn.css` | [MIT](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), © 2023 shadcn                                                             |
| [Lucide](https://lucide.dev) icons, through `lucide-react` and `lucide-static` | `src/icons.tsx`              | [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE), © Lucide Icons and Contributors; portions © Cole Bemis (Feather, MIT) |

Lucide is the only icon set included. The Ace logo, avatar, and emoji glyph
(`src/assets/ace-*`, `src/components/logo`, `src/ui/emoji-picker.tsx`) are Ace's own; the MIT license
does not grant trademark rights to the Ace name or marks.

## Fonts

| Material                                                                 | License                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [Inter](https://github.com/rsms/inter), via `@fontsource-variable/inter` | [SIL OFL 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt), © 2016 The Inter Project Authors |

Distributions that bundle the font files must keep Inter's copyright notice and license.

## Dependencies with non-MIT licenses

These are installed from npm, not copied. Distributed bundles must carry their notices.

| Package                                   | License    |
| ----------------------------------------- | ---------- |
| `@pierre/diffs`, `@pierre/trees`          | Apache-2.0 |
| `class-variance-authority`                | Apache-2.0 |
| `lucide-react`, `lucide-static`           | ISC        |
| `@fontsource-variable/inter` (font files) | OFL-1.1    |

All other runtime dependencies in [package.json](package.json) are MIT. Shiki language grammars
(`@shikijs/langs`) are redistributed by Shiki under their upstream licenses.
