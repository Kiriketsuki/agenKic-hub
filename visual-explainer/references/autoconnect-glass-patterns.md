# AutoConnect HEX-GEO Glass Patterns

AutoConnect-specific VE design patterns. These extend (not replace) the base `css-patterns.md`.
Used when generating VEs for the AutoConnect DOC-Hadi documentation site.

**Palette:** Coral `#e87956` + Teal `#5eadb0` (AutoConnect brand)
**Aesthetic:** Geometric chamfers + glassmorphism + layered textures

## Geometric Chamfers + Glassmorphism (v2)

**`border-radius` is forbidden in all VE output.** Use `clip-path` chamfers instead for all corners. This creates the HEX-GEO identity — engineered, precise, intentionally angular.

### Clip-Path Chamfer Library

Define these as CSS custom properties on `:root` for reuse:

```css
:root {
  /* 45-degree chamfered corners — pick size by element importance */
  --clip-chamfer-xs: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
  --clip-chamfer-sm: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  --clip-chamfer: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  --clip-chamfer-lg: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);

  /* Top-only chamfer — headers, badges, hero elements */
  --clip-chamfer-top: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%, 0 12px);

  /* Bottom-only chamfer — footers, callouts */
  --clip-chamfer-bottom: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px));

  /* Notched corner — single corner cut for asymmetric feel */
  --clip-notch-tr: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);

  /* Hex-inspired — angled top edge */
  --clip-hex-top: polygon(24px 0, calc(100% - 24px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px);
}
```

**Size mapping:**
| Element | Chamfer size |
|---------|-------------|
| Badges, inline code, pills | `--clip-chamfer-xs` (4px) |
| Inner cards, code blocks, pipeline steps | `--clip-chamfer-sm` (8px) |
| Section cards, main containers | `--clip-chamfer` (12px) |
| Hero sections, modals, headers | `--clip-chamfer-lg` (20px) |

**Exception:** `border-radius: 50%` is acceptable ONLY for circular indicators (status dots, spinners) that must remain round.

### Glass Surface Tiers

Apply glassmorphism to ALL card surfaces. Five tiers, from most to least prominent:

```css
/* HERO GLASS — hero sections, modals, important cards */
.glass-hero {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  clip-path: var(--clip-chamfer-lg);
}

/* DEFAULT GLASS — main content cards, section containers */
.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  clip-path: var(--clip-chamfer);
}

/* SUBTLE GLASS — inner cards, nested elements */
.glass-subtle {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.04);
  clip-path: var(--clip-chamfer-sm);
}

/* RECESSED GLASS — callouts, secondary info */
.glass-recessed {
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.03);
  clip-path: var(--clip-chamfer-sm);
}

/* TINTED GLASS — accent-colored translucent surfaces */
.glass-tinted {
  background: rgba(232, 121, 86, 0.06); /* or teal: rgba(94, 173, 176, 0.06) */
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  border: 1px solid rgba(232, 121, 86, 0.12);
  clip-path: var(--clip-chamfer);
}
```

### Body Texture Layers

Three layers create depth and atmosphere. Apply to `body` using pseudo-elements:

```css
/* Layer 1: Atmospheric radial glows on body background-image */
body {
  background: var(--bg);
  background-image:
    radial-gradient(ellipse at 25% 10%, rgba(232, 121, 86, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 75% 85%, rgba(94, 173, 176, 0.04) 0%, transparent 50%);
  position: relative;
}

/* Layer 2: Tech grid — subtle engineering grid pattern (body::before) */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(94, 173, 176, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(94, 173, 176, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
}

/* Layer 3: Noise — subtle grain texture (body::after) */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: overlay;
}

/* CRITICAL: Main content must sit above textures */
.diagram, .main-content, h1, .subtitle {
  position: relative;
  z-index: 2;
}
```

Adapt the grid color to match the palette: use teal for cool palettes, accent color for warm.

### Surface Texture for Cards

Add subtle inner radial gradients to glass cards for a tactile feel:

```css
.glass-textured {
  position: relative;
}

.glass-textured::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.02;
  background-image:
    radial-gradient(circle at 20% 50%, rgba(232, 121, 86, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 50%, rgba(94, 173, 176, 0.1) 0%, transparent 50%);
  pointer-events: none;
  clip-path: inherit;
}
```

### Geometric Divider

Replace `<hr>` or simple borders with a gradient divider + diamond accent:

```css
.divider-geo {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(94, 173, 176, 0.3) 20%, rgba(94, 173, 176, 0.3) 80%, transparent 100%);
  margin: 32px 0;
  position: relative;
}

.divider-geo::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -3px;
  width: 6px;
  height: 6px;
  background: rgba(94, 173, 176, 0.4);
  transform: translateX(-50%) rotate(45deg);
}
```

### Light Mode Glass Overrides

When VEs support light mode, override glass backgrounds for readability:

```css
@media (prefers-color-scheme: light) {
  .glass {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(0, 0, 0, 0.06);
  }
  .glass-hero {
    background: rgba(255, 255, 255, 0.75);
    border-color: rgba(0, 0, 0, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }
  .glass-subtle {
    background: rgba(255, 255, 255, 0.4);
    border-color: rgba(0, 0, 0, 0.04);
  }
  .glass-recessed {
    background: rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.04);
  }
  .glass-tinted {
    background: rgba(232, 121, 86, 0.06);
    border-color: rgba(232, 121, 86, 0.1);
  }
}
```

### Migration Checklist

When converting an existing VE to v2 geometric + glassmorphism:

1. **REMOVE** all `border-radius` (set to 0 or remove). Exception: `border-radius: 50%` on circular indicators only.
2. **ADD** clip-path chamfers: `--clip-chamfer` on section cards, `--clip-chamfer-sm` on inner cards, `--clip-chamfer-lg` on hero sections, `--clip-chamfer-xs` on badges/code.
3. **ADD** glassmorphism to all card surfaces: `backdrop-filter: blur(16px) saturate(1.2)` + translucent `background`.
4. **ADD** body textures: tech grid `::before`, noise `::after`, radial atmospheric glows on `background-image`.
5. **SET** main content `position: relative; z-index: 2` to sit above body textures.
6. **KEEP** all content, text, Mermaid definitions, animations, and functional JS unchanged.
7. **ADD** light mode glass overrides if the VE supports `prefers-color-scheme: light`.
