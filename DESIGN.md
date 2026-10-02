---
name: claude-code-mods
description: Claude Code as a worksite. Today's conditions are posted, and blasting needs a permit.
colors:
  caution-yellow: "#f2c200"
  danger-red: "#c8102e"
  safe-green: "#007a4d"
  mandatory-blue: "#005eb8"
  site-ink: "#151515"
  placard-white: "#fbfaf7"
  hoarding-ply: "#ecebe5"
  hoarding-ply-deep: "#e2e0d8"
  weathered-ink: "#46443f"
  terminal-black: "#141414"
  terminal-ink: "#e9e6df"
  terminal-dim: "#8f8a80"
  tw-yellow: "#e5c07b"
  tw-cyan: "#56b6c2"
  tw-blue: "#61afef"
  tw-magenta: "#c678dd"
  tw-red: "#e06c75"
typography:
  display:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "clamp(48px, 6.4vw, 96px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "clamp(40px, 5vw, 72px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.005em"
  title:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 0.95
  signal:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "clamp(20px, 2vw, 26px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.03em"
  readout:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "clamp(64px, 7vw, 112px)"
    fontWeight: 800
    lineHeight: 0.8
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Barlow, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  lead:
    fontFamily: "Barlow, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow Condensed, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, Weather Symbols, ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  note:
    fontFamily: "Barlow, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: "0px"
  term: "6px"
  term-inner: "4px"
  sign-disc: "50%"
spacing:
  module: "8px"
  gap: "24px"
  placard-pad: "18px 20px 20px"
  placard-pad-mobile: "14px"
  hero: "32px 0 40px"
  sheet: "80px 0"
  sheet-mobile: "56px 0"
components:
  button-primary:
    backgroundColor: "{colors.mandatory-blue}"
    textColor: "{colors.placard-white}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  button-secondary:
    backgroundColor: "{colors.placard-white}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  stamp-button-proceed:
    backgroundColor: "{colors.placard-white}"
    textColor: "{colors.safe-green}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  stamp-button-cancel:
    backgroundColor: "{colors.placard-white}"
    textColor: "{colors.danger-red}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  placard:
    backgroundColor: "{colors.placard-white}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.placard-pad}"
  signal-caution:
    backgroundColor: "{colors.caution-yellow}"
    textColor: "{colors.site-ink}"
    typography: "{typography.signal}"
    padding: "10px 16px"
  signal-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "#ffffff"
    typography: "{typography.signal}"
    padding: "10px 16px"
  signal-mandatory:
    backgroundColor: "{colors.mandatory-blue}"
    textColor: "#ffffff"
    typography: "{typography.signal}"
    padding: "10px 16px"
  signal-plain:
    backgroundColor: "{colors.site-ink}"
    textColor: "{colors.placard-white}"
    typography: "{typography.signal}"
    padding: "10px 16px"
  rail:
    backgroundColor: "{colors.site-ink}"
    textColor: "{colors.placard-white}"
    height: "56px"
  terminal:
    backgroundColor: "{colors.terminal-black}"
    textColor: "{colors.terminal-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.term}"
    padding: "14px 16px"
  command-line:
    backgroundColor: "{colors.terminal-black}"
    textColor: "{colors.terminal-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.term}"
    padding: "10px 10px 10px 14px"
  picker-chip:
    backgroundColor: "{colors.placard-white}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
  picker-chip-selected:
    backgroundColor: "{colors.site-ink}"
    textColor: "{colors.placard-white}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
---

# Design System: claude-code-mods

## Overview

**Creative North Star: "The Site Notice Board"**

The page is a construction-site hoarding: a pale plywood ground with screen-printed placards bolted to it. Each placard has a coloured signal header and a white body. Safety colour works the way it does on a real site. Every hue carries one meaning, and the meaning comes from ISO 3864: yellow for caution, red for prohibition and danger, green for safe, blue for mandatory action. Type is condensed signage in capitals. The content is shown on permit forms, condition boards and clipboards. Terminal output stays a separate material, dark and rounded, so the worksite frames the product without being mistaken for it.

Density is high but orderly. Placards line up on one 8px module with 24px gutters. Sections alternate between two plywood tones and are separated by 3px ink rules. Only one motion is authored. When a permit is signed, a rubber stamp drops onto the form with an ink-bleed texture. Everything else is a short state transition.

Rejected by the direction contract: the dark hero followed by a feature-card grid.

**Key Characteristics:**
- Plywood hoarding ground with square-cornered white placards (3px ink border)
- ISO 3864 safety colours used only to signal state, each with one fixed meaning
- Barlow Condensed 800 capitals for every sign, Barlow for reading, JetBrains Mono for anything typed or printed by a machine
- Terminal recreations are the only rounded, dark surfaces
- One authored motion: the permit stamp press

## Colors

Four regulatory safety hues set against near-black ink and warm plywood neutrals. Inside terminals, the product's own ANSI palette is used, and only there.

### Primary
- **Caution Yellow** (caution-yellow): Caution signal headers (conditions board, forecast bands, limits). Also the yellow and black boundary stripe under the rail, text selection, link-hover underline, focus rings on dark surfaces, and the yellow-on-black closing gate sign.
- **Danger Red** (danger-red): Prohibition headers (blast area, what it stops), the Cancel stamp button and the Cancelled stamp.
- **Safe Green** (safe-green): The Proceed stamp button and the Approved stamp.
- **Mandatory Blue** (mandatory-blue): Instruction headers (install, four steps), the primary Install button, numbered step discs, and the default focus ring.

### Neutral
- **Site Ink** (site-ink): All text, every border and rule, the rail, the plain signal header and the closing section ground.
- **Placard White** (placard-white): Placard bodies, secondary buttons and text on ink.
- **Hoarding Ply** (hoarding-ply): The page ground.
- **Hoarding Ply Deep** (hoarding-ply-deep): The ground for every second section sheet.
- **Weathered Ink** (weathered-ink): Notes, captions and readout sub-lines.
- **Terminal Black / Terminal Ink / Terminal Dim** (terminal-black, terminal-ink, terminal-dim): Surface, text and secondary text inside terminal recreations and command lines.

### Product palette (terminal only)
- **token-weather band colours** (tw-yellow, tw-cyan, tw-blue, tw-magenta, tw-red): These are the colours the mod actually prints for Clear, Cloudy, Showers, Storm and Compact soon. They appear in the live band, the weather glyphs, the context scrubber track and the copied-state icon. Treat them as product facts, not as brand colours.

### Named Rules
**The One Meaning Rule.** Each ISO colour stands for one state: caution, danger, safe or mandatory. Never use it as decoration or switch it to another meaning. If a surface is neither a hazard, a sign-off nor an instruction, it stays ink and plywood.

**The Two Palettes Rule.** Safety colours belong to the site, and the tw-* ANSI colours belong to the terminal. Neither palette crosses into the other's material. The scrubber track is the single bridge, because it is a control for the terminal band.

## Typography

**Display Font:** Barlow Condensed 800 (with Noto Sans KR, Apple SD Gothic Neo, sans-serif)
**Body Font:** Barlow 400/600 (with Noto Sans KR, Apple SD Gothic Neo, sans-serif)
**Label/Mono Font:** JetBrains Mono 400–700 variable, with a "Weather Symbols" subset of Noto Sans Symbols 2 (☀☁☂☇↯) layered in for the forecast glyphs
**Korean Display:** Black Han Sans (subset to the page's Hangul), used through the Barlow Condensed → Black Han Sans stack

**Character:** The condensed capitals read like stencilled site signage. Barlow, from the same family, keeps long reading text calm. Mono marks anything a machine prints or a person types.

### Hierarchy
- **Display** (800, clamp(48px, 6.4vw, 96px), 0.95, uppercase): The hero headline only. The Korean version uses clamp(40px, 5vw, 76px) with line-height 1.08.
- **Headline** (800, clamp(40px, 5vw, 72px), 0.95, uppercase): Section sheet titles. The closing gate sign goes up to clamp(44px, 6vw, 88px), set in caution yellow on ink.
- **Title** (800, 28px, uppercase): Method step titles.
- **Signal** (800, clamp(20px, 2vw, 26px), 0.03em, uppercase): Placard signal headers. Buttons use the same voice at 18px/0.05em, and stamp buttons at 22px/0.08em.
- **Readout** (800, clamp(64px, 7vw, 112px), 0.8, tabular figures): The conditions board's big percentage. The condition word next to it is set at clamp(26px, 2.6vw, 38px).
- **Body** (400, 17px, 1.55; 16px below 720px): Running text, capped at 68ch. Lead paragraphs are 19px.
- **Label** (600, 14px, 0.06em, uppercase): Table heads, permit field names and the scrubber label. Rail navigation uses the same voice at 16px.
- **Mono** (400, 14px, 1.6): Terminal recreations, command lines and permit values. Inline code is 0.88em.
- **Note** (400, 13px, weathered ink): Illustrative-recreation disclaimers under boards.

### Named Rules
**The Signage Caps Rule.** Every sign (headings, signal headers, buttons, stamps, labels) is set in Barlow Condensed capitals, and nothing else is. Under `lang="ko"`, drop the uppercase and letter-spacing and let Black Han Sans carry the Hangul.

**The Machine Voice Rule.** Mono is reserved for strings that a terminal prints or that the user types. Never use it for decoration.

## Layout

There is one placard module of 8px. Gutters are 24px (3 modules). The container is min(1360px, 100% − 48px), centred. The hero has a 1.25fr / 1fr headline row above two boards (1fr / 1.1fr), with the full-width install clipboard underneath. Section sheets have 80px vertical padding, a 3px ink top rule and alternating plywood tones. Each sheet opens with a two-column head (title left, lead right, aligned to the bottom), followed by a two-column placard grid. Method steps are list rows split 1fr text / 1.15fr terminal.

Breakpoints: at 1080px every two-column grid collapses to one, and the clipboard's Copy All button joins the flow. At 720px the rail wraps so navigation sits on its own scrolling row (the external GitHub link is hidden), placard padding drops to 14px, sheet padding drops to 56px, and terminal text drops to 12.5px. The rail stays sticky at all widths.

## Elevation & Depth

Depth here is physical. Placards are hung on a board, not floating cards. Each placard casts one soft shadow that drops below it, as if it hangs a little proud of the plywood. Otherwise, structure comes from heavy ink borders and the two-tone ground. Inside the closing section, the clipboard sits flat on the ink, with no shadow.

### Shadow Vocabulary
- **Hung placard** (`box-shadow: 0 14px 28px -18px rgba(21,21,21,.55)`): Every placard on a plywood ground, and nothing else.

### Named Rules
**The Hung, Not Floating Rule.** There is a single shadow and it falls downward, with a negative spread so it only shows beneath the placard. Don't use hover lift shadows, glows or stacked elevations.

## Shapes

Site material is square. Placards, buttons, picker chips, the language toggle, the scrubber track and its thumb all have 0 radius and solid ink borders: 3px on placards and buttons, 2px on chips, permit grids and toggles, and 1px on internal table and list rules. Only terminal material is rounded (6px for terminals and command lines, 4px for copy buttons and glyph cells). The circle appears only as an ISO sign shape: the blue mandatory disc behind each method step number, and the prohibition and mandatory pictograms. The rail rests on a 12px yellow and black hazard stripe at -45°, with 14px bands.

## Components

### Buttons
- **Shape:** Square (0px), 3px ink border, Signal-voice capitals at 18px with 0.05em tracking. Padding is 12px 18px, with an optional 20px icon.
- **Primary:** Mandatory blue fill and border with white text. Used for the one install action.
- **Secondary:** Placard white with ink border and text (Source).
- **Hover / Focus:** A 2px upward lift over 0.2s using the site ease. Active returns to 0. Focus is a 3px mandatory-blue outline, offset 3px.

### Stamp Buttons (permit sign-off)
- **Style:** Outlined only. A 3px border in currentColor, Barlow Condensed 800 at 22px with 0.08em tracking. Proceed is safe green, Cancel is danger red.
- **Hover:** A 10% tint of their own colour.

### Picker Chips
- **Style:** Mono 13px, 2px ink border, placard white. When selected (aria-pressed), the colours invert to ink with white text. Focus uses a mandatory-blue outline.

### Placards
- **Corner Style:** Square (0px).
- **Background:** Placard white on a plywood ground, with a 3px ink border.
- **Shadow Strategy:** Hung placard (see Elevation & Depth).
- **Header:** A full-width signal band (10px 16px) carrying a 30px ISO pictogram and the title. The band colour is the placard's meaning: caution, danger, mandatory, or plain ink for neutral information.
- **Internal Padding:** 18px 20px 20px, or 14px on mobile.

### Navigation (hoarding rail)
- **Style:** A sticky ink bar, at least 56px tall. Brand in 22px display capitals with the caution pictogram. Nav links in 16px condensed 600 capitals with 0.06em tracking. A yellow hazard stripe sits underneath.
- **States:** Hover adds a 2px caution-yellow underline. The EN/한국어 toggle is a 2px placard-white box, and the pressed language inverts to white with ink text.
- **Mobile:** Nav wraps to its own horizontally scrolling row at 14px.

### Terminal Recreations and Command Lines
- **Style:** Terminal black, 6px radius, mono 14px/1.6, terminal-ink text with dim secondary text. Overflowing lines fade out at the right edge with a mask. Command lines carry a 34px square copy button that confirms in tw-yellow.
- **Rule:** Always labelled as an illustrative recreation in a note beneath.

### Permit Form (signature)
A carbon-copy form with a 2px ink grid of field-name/value rows: condensed uppercase labels on the left, mono values on the right. Above it sits a picker of example commands. Below it, the sign-off row holds the two stamp buttons and an outcome line. When a button is pressed, a rubber stamp (44px display capitals, 5px double border, rotated -9°, SVG fractal-noise ink filter) presses onto the form. It drops from 1.6× to 0.96× and settles at 1×, over 0.45s with `cubic-bezier(.16, 1, .3, 1)`, ending at 0.88 opacity.

### Conditions Board (signature)
A big tabular readout with a square colour lamp and the condition word. Underneath is a live terminal band, then a context scrubber whose track is split into the five token-weather bands. The scrubber thumb is a square ink block. Band and lamp colours change over 0.4s.

## Do's and Don'ts

### Do:
- **Do** use a coloured signal header to state what a placard means. Caution goes on hazards and limits, danger on prohibitions, mandatory on instructions, plain ink on neutral facts.
- **Do** keep site material square with ink borders (3px for placards and buttons), and keep the 6px radius for terminal material only.
- **Do** lay everything out on the 8px module with 24px gutters, and alternate section grounds between hoarding-ply and hoarding-ply-deep.
- **Do** keep the stamp press as the one authored motion. Other transitions should be at most 0.4s state changes on `cubic-bezier(.16, 1, .3, 1)`, and all of them collapse under prefers-reduced-motion.
- **Do** self-host every face as woff2 with `font-display: swap`. Subset Black Han Sans to the page's Hangul and regenerate it whenever the Korean copy changes.
- **Do** label terminal and dry-run renders as illustrative recreations.

### Don't:
- **Don't** use an ISO safety colour for decoration or brand fill. Green appears only on sign-off and blue only on mandatory instructions.
- **Don't** let the tw-* terminal colours onto site material (headers, buttons, rules), apart from the scrubber track that controls the band.
- **Don't** build a dark hero followed by a feature-card grid.
- **Don't** add shadows beyond the single hung-placard drop, and don't add hover glows.
- **Don't** round placards, buttons or chips.
