# UI Standardization Plan: Enterprise-Grade Professional Application

## Overview
Transform the application from a flashy demo SaaS to an enterprise-grade business application with consistent, professional styling optimized for daily business use.

## Requirements
- **Scope**: All pages + Component library base
- **Approach**: Enterprise-grade (rounded-lg max, minimal shadows, no decorative animations)
- **Goal**: Professional, consistent, efficient

---

## Design System Standards

### Brand Colors
```
Primary (Brand):     neutral-900 (buttons, emphasis)
Accent:              amber-500 (brand highlight, kept subtle)
Success:             green-600
Warning:             amber-600
Error:               red-600
Info:                blue-600
```

### Service Colors (Functional Only - For UX Clarity)
```
School:    amber-600 (icon tint, status badge only)
Medical:   sky-600 (icon tint, status badge only)
Wedding:   violet-600 (icon tint, status badge only)
```
*Use only for icons and status indicators, NOT backgrounds or borders*

### Typography Scale
| Element | Weight | Size | Tracking |
|---------|--------|------|----------|
| Page Title | `font-semibold` | `text-2xl` | normal |
| Section Title | `font-semibold` | `text-lg` | normal |
| Card Title | `font-medium` | `text-base` | normal |
| Body | `font-normal` | `text-sm` | normal |
| Label | `font-medium` | `text-sm` | normal |
| Caption | `font-normal` | `text-xs` | normal |

**Forbidden:** `font-black`, `font-extrabold`, `tracking-widest`, `tracking-[0.15em]+`

### Sizing Standards
| Element | Height | Padding |
|---------|--------|---------|
| Input | `h-10` (40px) | `px-3` |
| Button SM | `h-8` (32px) | `px-3` |
| Button Default | `h-9` (36px) | `px-4` |
| Button LG | `h-10` (40px) | `px-5` |
| Card | auto | `p-5` or `p-6` |

### Border Radius
| Element | Value |
|---------|-------|
| Buttons/Inputs/Badges | `rounded-md` (6px) |
| Cards/Modals/Dropdowns | `rounded-lg` (8px) |
| Avatars | `rounded-full` |
| **Forbidden** | `rounded-xl+`, `rounded-2xl`, custom `rounded-[*]` |

### Shadows
| Usage | Value |
|-------|-------|
| Cards | `shadow-sm` |
| Dropdowns/Modals | `shadow-lg` |
| Elevated buttons | `shadow-sm` (optional) |
| **Forbidden** | `shadow-[custom]`, `shadow-premium`, blur > 10px |

### Transitions
| Allowed | Forbidden |
|---------|-----------|
| `transition-colors duration-150` | `transition-all` |
| `transition-opacity duration-150` | `hover:scale-*` |
| Loading spinners (functional) | `hover:rotate-*` |
| | `hover:-translate-y-*` |
| | `group-hover:scale-*` |
| | Custom `@keyframes` (except spinners) |

### Focus States
```tsx
// Standard focus ring for all interactive elements
focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2
```

### Hover States
```tsx
// Buttons: background shift only
hover:bg-neutral-800  // for dark buttons
hover:bg-neutral-100  // for ghost buttons

// Cards: NO hover effects (remove all)
// Links: underline or color change only
```

### Loading States
```tsx
// Spinner: Simple rotating border
<div className="h-4 w-4 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />

// Skeleton: Simple pulse
<div className="h-4 bg-neutral-200 rounded animate-pulse" />
```

### Error States
```tsx
// Input error
<Input className="border-red-500 focus:ring-red-500" />
<span className="text-sm text-red-600">Error message</span>
```

---

## Implementation Strategy

### Phase 1: Foundation (Do First)

#### 1.1 globals.css - Remove Custom Effects
**File:** `src/app/globals.css`

**Remove entirely:**
- `@keyframes float`, `@keyframes shine`, `@keyframes progress-glow`, `@keyframes bounce-slow`
- `--shadow-premium`, `--shadow-glass` variables
- `.glass`, `.glass-card` classes

#### 1.2 UI Component Library
**Files:** `src/components/ui/*.tsx`

| Component | Changes |
|-----------|---------|
| `button.tsx` | `rounded-md`, heights h-8/h-9/h-10, remove scale effects |
| `input.tsx` | `h-10`, `rounded-md`, standard focus ring |
| `card.tsx` | `rounded-lg`, `shadow-sm`, remove hover |
| `badge.tsx` | `rounded-md` |
| `select.tsx` | `h-10`, `rounded-md` |
| `dropdown-menu.tsx` | `rounded-lg`, `shadow-lg` |
| `dialog.tsx` | `rounded-lg` |

---

### Phase 2: Global Search & Replace Patterns

Execute these regex patterns across all `.tsx` files:

#### Border Radius
```
rounded-\[2\.5rem\]     →  rounded-lg
rounded-\[2\.6rem\]     →  rounded-lg
rounded-\[32px\]        →  rounded-lg
rounded-\[2rem\]        →  rounded-lg
rounded-\[3rem\]        →  rounded-lg
rounded-\[1\.25rem\]    →  rounded-md
rounded-2xl             →  rounded-lg (cards) or rounded-md (inputs)
```

#### Shadows
```
shadow-\[0_\d+px.*?\]   →  shadow-sm (cards) or shadow-lg (modals)
shadow-premium          →  shadow-sm
shadow-glass            →  shadow-sm
```

#### Animations (Remove)
```
hover:-translate-y-\S+  →  (remove)
hover:scale-\S+         →  (remove)
hover:rotate-\S+        →  (remove)
active:scale-\S+        →  (remove)
group-hover:scale-\S+   →  (remove)
group-hover:rotate-\S+  →  (remove)
transition-all          →  transition-colors duration-150
```

#### Font Weights
```
font-black              →  font-semibold
font-extrabold          →  font-semibold
```

#### Heights
```
h-14                    →  h-10 (inputs only)
h-18                    →  h-10 (buttons)
h-16                    →  h-10 (buttons)
```

#### Backgrounds
```
bg-white/\d+ backdrop-blur-\S+  →  bg-white
bg-gradient-to-\S+ from-.*?to-\S+/\d+  →  (remove decorative gradients)
```

---

### Phase 3: Component-Specific Updates

#### Navigation
| File | Key Changes |
|------|-------------|
| `navbar.tsx` | Remove logo scale/rotate, solid bg-white, remove avatar scale |
| `footer.tsx` | rounded-lg, remove stats section, font-semibold |

#### Dashboard
| File | Key Changes |
|------|-------------|
| `dashboard/page.tsx` | rounded-lg cards, h-10 inputs, remove shimmer |
| `master/admin/page.tsx` | rounded-lg, shadow-sm, p-6 padding |
| `users/page.tsx` | Standardize to match admin |

#### Forms
| File | Key Changes |
|------|-------------|
| `service-switcher.tsx` | rounded-lg container, remove sliding animation |
| `location-input.tsx` | h-10, rounded-md |

#### Specialized
| File | Key Changes |
|------|-------------|
| `ai-chat-panel.tsx` | rounded-lg, shadow-sm, remove pulse |
| `trips-sidebar.tsx` | rounded-lg, remove scale on FAB |
| `quote-card.tsx` | rounded-lg, solid colors (no gradients) |

#### Landing
| File | Key Changes |
|------|-------------|
| `hero.tsx` | Remove all decorative gradients, rounded-lg, h-10, shadow-sm, remove marquee |
| `how-it-works.tsx` | rounded-lg, remove hover translate, remove icon rotate |

#### Auth
| File | Key Changes |
|------|-------------|
| `login/page.tsx` | solid bg-white, rounded-lg, h-10 inputs |

---

## Quick Reference Card

### Allowed Classes
```
Border Radius:  rounded-md | rounded-lg | rounded-full
Shadows:        shadow-sm | shadow-md | shadow-lg
Heights:        h-8 | h-9 | h-10
Font Weight:    font-normal | font-medium | font-semibold | font-bold
Transitions:    transition-colors duration-150
```

### Forbidden Patterns (Search & Remove)
```
rounded-[*]     rounded-xl+    rounded-2xl+
shadow-[*]      shadow-premium shadow-glass
hover:scale-*   hover:rotate-* hover:-translate-*
group-hover:scale-* group-hover:rotate-*
font-black      font-extrabold
h-14 h-16 h-18  (on inputs/buttons)
backdrop-blur-* bg-white/*
transition-all  animate-* (except spin for loading)
tracking-[0.15em]+ tracking-widest uppercase (reduce 80%)
```

---

## Before/After Examples

```tsx
// BUTTON - Before
<Button className="h-18 py-8 rounded-[1.25rem] hover:-translate-y-1
  shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] font-extrabold text-xl">

// BUTTON - After
<Button className="h-10 rounded-md font-semibold">

// INPUT - Before
<Input className="h-14 rounded-2xl bg-neutral-50/80
  focus-visible:ring-amber-500/20 shadow-premium" />

// INPUT - After
<Input className="h-10 rounded-md" />

// CARD - Before
<Card className="rounded-[2.5rem] p-10
  shadow-[0_60px_150px_-30px_rgba(0,0,0,0.18)]
  hover:-translate-y-3 bg-gradient-to-tr from-black/[0.03]">

// CARD - After
<Card className="rounded-lg p-6 shadow-sm">
```

---

## Testing Checklist

- [ ] All inputs: `h-10`, `rounded-md`
- [ ] All buttons: `h-8`/`h-9`/`h-10`, `rounded-md`
- [ ] All cards: `rounded-lg`, `shadow-sm`
- [ ] No `hover:scale-*`, `hover:rotate-*`, `hover:-translate-*`
- [ ] No `font-black`, `font-extrabold`
- [ ] No `backdrop-blur-*`
- [ ] No custom `shadow-[*]`
- [ ] No custom `rounded-[*]`
- [ ] Consistent focus rings: `ring-2 ring-neutral-900 ring-offset-2`
- [ ] All backgrounds solid (no gradients except brand elements)

---

## Priority Files (Execute in Order)

| Priority | File | Impact |
|----------|------|--------|
| 1 | `src/app/globals.css` | Foundation - removes all custom animations/shadows |
| 2 | `src/components/ui/button.tsx` | All buttons inherit |
| 3 | `src/components/ui/input.tsx` | All inputs inherit |
| 4 | `src/components/ui/card.tsx` | All cards inherit |
| 5 | `src/components/navbar.tsx` | Always visible |
| 6 | `src/app/dashboard/page.tsx` | Primary workspace |
| 7 | `src/app/master/admin/page.tsx` | Business critical |
| 8 | `src/components/hero.tsx` | Most demo-like |
| 9 | `src/components/how-it-works.tsx` | Heavy animations |
| 10 | `src/app/login/page.tsx` | First impression |

---

## Success Criteria

✅ Zero custom `shadow-[*]` in codebase
✅ Zero custom `rounded-[*]` > 12px in codebase
✅ Zero `hover:scale/rotate/translate` effects
✅ 100% of inputs at `h-10`
✅ 100% of buttons at `h-8`/`h-9`/`h-10`
✅ No `backdrop-blur` effects
✅ All focus states use consistent ring

---

## Outcome

**Before:** Flashy demo SaaS optimized for conversion
**After:** Enterprise-grade business app optimized for daily use

- Predictable & stable
- Fast (no animation overhead)
- Accessible & clear
- Consistent everywhere
- Zero visual distractions
- Professional appearance
