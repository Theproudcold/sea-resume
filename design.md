# Design: Sea Resume

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: app screen (workbench, editor, template gallery, interview history, interview)
- Theme: Cobalt, app-trimmed (no ASCII field, no cut corners: plain 8px and 6px radius)
- Axes: light and dark/sans/cool · posture: restrained
- Two colour schemes: light (default) and dark, switched by `html.dark` (`src/composables/useColorScheme.ts`, toggle in `AppHeader`). Every colour comes from a token, so a component never needs a dark-mode rule of its own.

## Tokens
`src/styles/tokens.css` is the source of truth for both schemes; `src/styles/app.css` (stamped, imported by `main.scss`) maps the legacy `--ui-*` names and every Element Plus `--el-*` variable onto it and styles the shared controls. `main.scss` keeps only the Sass-interpolated resume roles, the Element Plus tint loop, Tailwind and print.

Roles (the same names in both schemes):
- `--color-paper` page ground · `--color-paper-3` raised surface (cards, dialogs, fields, menus) · `--color-paper-2` subtle fill and hover · `--color-sunken` tray under a set of options
- `--color-ink` text · `--color-ink-2` secondary text · `--color-muted` meta, placeholders, labels
- `--color-rule` hairline edges and row dividers · `--color-rule-2` a stronger edge (key borders, hovered field)
- `--color-accent` cobalt: the one primary, links on hover, focus, the selected item · `--color-accent-deep` hover · `--color-accent-wash` selected row, active nav cell · `--color-accent-ink` text on cobalt · `--color-accent-2` light cobalt for highlights and syntax, never a fill under body text
- `--color-error`/`-wash`, `--color-success`/`-wash`, `--color-warning`/`-wash` (warning text is text-safe; a reminder is the wash with a warning edge)
- `--color-graphite`/`-2`/`-ink`/`-muted`: code and machine output panels
- `--color-overlay` modal scrim
- Fonts: `--font-display` Familjen Grotesk 500/600 (heads, figures, buttons, labels), `--font-body` IBM Plex Sans 400/500, `--font-outlier` JetBrains Mono for code and machine values only. CJK falls back to PingFang SC / Noto Sans SC.
- `--radius-card` 8px · `--radius-input` 6px (buttons, fields, tags) · `--radius-s` 4px (small parts). Never a pill.
- `--rule-hair` 1px. `--rule-bar` is also 1px now (legacy name); never a 2px border, never an ink-coloured border.
- `--shadow-card` resting cards · `--shadow-float` dialogs, poppers, menus · `--shadow-key` secondary buttons · `--shadow-key-accent` the primary · `--shadow-key-press` pressed.

The spacing scale (`--space-3xs` 2px to `--space-4xl` 144px), the type scale (`--text-xs` 12px, `sm` 14, `md` 16, `lg` 19.2, `xl` 23, `2xl` 27.6), the easings and the durations live in `tokens.css`. Weights: 400, 500, 600 only (never 700/800).

## Surfaces
- Page: `--color-paper`. Cards, panels, lists and dialogs: `--color-paper-3`, 1px `--color-rule`, `--radius-card`, `--shadow-card` at most. Rows inside a card split with `--color-rule` hairlines.
- Never a card in a card, never a bordered box inside a well, never a hard-coded colour (no `#fff`, no `white`, no Tailwind `gray-*` in app UI) because it breaks dark mode.
- The top bar (`AppHeader`) is a `--color-paper-3` surface with a hairline bottom edge; one cobalt primary in it.
- A reminder: `--color-warning-wash` with a 1px `--color-warning` edge at 40% mix, ink text (`.ui-plate`, `.el-alert--warning`).
- A danger zone: 1px `--color-error` edge (mixed 40%) on `--color-error-wash` (`.ui-danger-zone`).
- Every place a resume appears is an A4 sheet on `--resume-paper` (always white, in both schemes), with a 1px `--color-rule` edge and `--shadow-card`. Resume templates (`src/components/preview/templates/**`) are the user's document, never restyled; their wrappers carry `.resume-document`, which the base type rules skip.

## Controls
- Primary: cobalt key (`--color-accent` fill, `--color-accent-ink` text, `--shadow-key-accent`), 500, `--radius-input`, `--control-height`. One filled primary per screen and per dialog.
- Secondary: key face (`--color-key-face`), 1px `--color-rule-2` border, `--shadow-key`; hover lifts the fill to `--color-paper-2`; press sinks (`--shadow-key-press`, translateY(1px)).
- Text buttons: no border, `--color-paper-2` on hover. Disabled: `opacity: 0.5`, `cursor: not-allowed`, the native attribute.
- Fields: 1px `--color-rule-2` edge on `--color-paper-3`, `--radius-input`, cobalt border plus a 3px `--color-accent-wash` ring on focus.
- Choice sets: keys on a `--color-sunken` tray, the chosen one a raised `--color-paper-3` key with ink text. Nav rails: rows with `--radius-input`, the current one `--color-accent-wash` with `--color-accent` text. Tabs: ink 600 over a 2px cobalt bar.
- Status is text with one icon, or a 6px-radius tag on a wash; never a filled pill.
- Labels, table heads, meta: Familjen Grotesk 500 a step smaller, `--color-muted`, sentence case, never uppercase, never an eyebrow above a heading.

## Motion
- Character: quiet. Colour and shadow change over `--dur-micro` with `--ease-out`; keys move 1px. No reveals, no fades on route change, no bounce. Only `transform`, `opacity`, colour and `box-shadow` transition. Under reduced motion everything ends at once (`base.css`).

## Exports
`src/styles/tokens.css` in this project; Tailwind colours `primary`, `success`, `warning`, `danger`, `info` read the `--ui-*` roles, and `paper`, `ink`, `muted`, `rule`, `accent` read the tokens directly.
