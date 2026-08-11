# Clip-path borders

CSS `border` and `box-shadow: inset` do not produce visible borders on clip-path elements. A content background covers an inset shadow, and the clip-path cuts a border away. This page shows the technique that works.

## Wrapper-fill pattern (preferred)

Two nested clip-paths. The outer carries the border color, the inner carries the fill:

```css
/* Outer: border color */
.panel {
    background: var(--border-color);
    padding: 1px;
    clip-path: polygon(
        12px 0, calc(100% - 12px) 0,
        100% 12px, 100% calc(100% - 12px),
        calc(100% - 12px) 100%, 12px 100%,
        0 calc(100% - 12px), 0 12px
    );
}

/* Inner: fill color */
.panel-content {
    background-color: var(--fill-color);
    clip-path: polygon(
        11px 0, calc(100% - 11px) 0,
        100% 11px, 100% calc(100% - 11px),
        calc(100% - 11px) 100%, 11px 100%,
        0 calc(100% - 11px), 0 11px
    );
}
```

The 1px gap between the outer (12px chamfer) and inner (11px chamfer) clip-paths creates a consistent border, including at the chamfered corners.

## Pseudo-element pattern (alternative)

Same idea, but the inner clip lives on `::before` with `position: absolute; inset: 1px`. This requires z-index management to keep content above the pseudo-element.

## Anti-patterns

| Wrong | Why it fails |
|:---|:---|
| `box-shadow: inset 0 0 0 1px` | Content backgrounds sit on top of the shadow |
| `border: 1px solid` | The border sits outside the clip-path, so the clip cuts it |
| `::before` with `backdrop-filter` | Blurs the content underneath, and z-index fights |
