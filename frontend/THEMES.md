# OpenVision Theme System

## Overview

OpenVision routes visual decisions through tokens in [frontend/src/app/globals.css](/Users/davidcvetkovski/Documents/Uni/TH/ExamTakerEnvironment/frontend/src/app/globals.css). The default `:root` theme is the dark admin shell. Theme overrides live in `[data-theme="..."]` blocks.

## Naming

- Colors use `--color-<role>-<modifier>`.
- Typography uses `--font-size-*` and `--tracking-*`.
- Geometry uses `--radius-*`, `--size-*`, and `--shadow-*`.
- Motion uses `--duration-*` and `--ease-*`.

## Theme Resolution

1. Stage 8 behavior: authenticated `STUDENT` users get `data-theme="warm"`.
2. Authenticated non-student users fall back to the default dark shell.
3. Logged-out users fall back to the default dark shell.
4. Stage 9 will let a stored user preference override the role default.

## Adding A Theme

1. Add a new `[data-theme="<name>"]` block in `globals.css`.
2. Override only the tokens you want to change.
3. Leave components alone. Color-only theme additions should not require JSX changes.

## Exemptions

- TipTap syntax highlighting colors in `TipTapEditor.css` remain fixed to the GitHub Dark palette.
- Named Tailwind semantic colors such as `text-emerald-400` and `bg-rose-500/10` remain valid where they communicate state.
- Named Tailwind transition utilities remain valid. The motion-token migration targets literal inline transition values.
- `frontend/src/app/blueprint/page.tsx` still keeps `min-h-[40px]`, `min-h-[60px]`, and `min-w-[150px]` as local layout values because they are tightly scoped to that editor surface.
