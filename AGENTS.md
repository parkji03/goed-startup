<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Component Library

This project uses [Intent UI](https://intentui.com) built on [React Aria Components](https://react-aria.adobe.com/). **Always use Intent UI and React Aria components** — never reach for plain HTML elements or other UI libraries when an Intent UI component exists.

Rules:
- All interactive buttons → `Button` from `@/components/ui/button`
- Icon-only buttons **must** be wrapped in `Tooltip` from `@/components/ui/tooltip` with a descriptive label
- Overlays (modals, sheets, drawers, popovers) → use the matching component from `@/components/ui/`
- Use `onPress` not `onClick` on all React Aria / Intent UI components
- Animations use `tw-animate-css` + `tailwindcss-react-aria-components` variants (`entering:`, `exiting:`, `placement-*:`, etc.) — do not add inline animation styles
- The `Tooltip` wraps both the trigger and content as children of `<Tooltip>` (the `TooltipTriggerPrimitive`)

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
