---
name: safe-rules
version: 1.0.0
description: Use when designing, building, or reviewing ANY visual UI, or as a final lint pass before shipping a screen/component. Anthony Hobday's "visual design rules you can safely follow every time" — mechanical, near-universal invariants for color, spacing, alignment, typography, depth, and borders. Safe defaults; break only deliberately. Companion to the `refactoring-ui` method skill.
---

# Safe Rules — Hobday's mechanical checklist

27 rules that "most people agree are good." They're **safe defaults**, not laws — break any of them on purpose, never by accident. Use as a pre-ship lint pass: walk the screen against each group.

## Color
1. **Near-black & near-white, never pure.** Pure `#000`/`#fff` are uncomfortably harsh; use off-black and off-white.
2. **Saturate your neutrals.** Push grays slightly toward a hue so they harmonize with the palette.
3. **Pick warm OR cool neutrals, not both.** If you saturate grays, commit to one temperature.
4. **High contrast for important elements.** The thing that matters most should have the strongest contrast against its surroundings.
5. **Palette colors need distinct brightness values.** Two colors at the same lightness fight and muddy.
6. **Keep container colors within brightness limits.** Stacked surfaces shouldn't drift too dark or too light off the background.
7. **Closer elements should be lighter.** In a flat scheme, lightness signals proximity/elevation.

## Spacing & measurement
8. **Measurements should be mathematically related.** Sizes and gaps come from one scale, not ad-hoc numbers.
9. **Put spacing between points of high contrast.** Space belongs at the real visual seams, not arbitrarily.
10. **Outer padding ≥ inner padding.** A container's margin to the world should be at least its internal padding.
11. **Button horizontal padding = ~2× vertical.** Wider than it is tall reads as a button.

## Alignment
12. **Everything aligns with something else.** No element floats unaligned to any other.
13. **Optical alignment beats mathematical alignment.** Trust the eye over the pixel measurement (e.g. a triangle/play icon nudged off-center to *look* centered).
14. **Order elements by visual weight.** Heavier elements lead; arrange in a deliberate weight sequence.

## Typography
15. **Larger text → tighter letter & line spacing; smaller text → looser.** Inverse relationship, always.
16. **Body text ≥ 16px.**
17. **Line length ~70 characters.**
18. **Two typefaces at most.**

## Depth & shadow
19. **Drop-shadow blur = ~2× its distance.** A 4px-down shadow gets ~8px blur.
20. **No shadows in dark interfaces.** Convey depth with lightness instead (see rule 7).
21. **Don't mix depth techniques.** Shadows or color-elevation or borders — pick one language.

## Borders & containers
22. **Container borders contrast with BOTH the container and the background.** A border invisible against either does nothing.
23. **Nest corners properly.** Inner radius = outer radius − padding, so concentric corners stay parallel.
24. **Don't put two hard divides next to each other.** Avoid a border touching another border/edge with no breathing room.

## General principles
25. **Everything should be deliberate.** Every size, color, and position is a decision you can justify — no defaults left on by accident.
26. **Put simple on complex, or complex on simple.** A busy element needs a calm ground; a calm element can sit on a busy one. Never busy-on-busy.
27. **Lower the contrast of icons paired with text.** Icons read heavier than letterforms — mute them so they sit with the text.

---

Source: Anthony Hobday, *Visual design rules you can safely follow every time*. Use alongside the **`refactoring-ui`** skill, which supplies the underlying method (grayscale-first, constrained scales, hierarchy via size/weight/color).
