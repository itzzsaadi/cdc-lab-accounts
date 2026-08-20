---
name: CDC Clinical Ledger
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3e4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#46617a'
  on-secondary: '#ffffff'
  secondary-container: '#c3e0fe'
  on-secondary-container: '#48637d'
  tertiary: '#3b3bc9'
  on-tertiary: '#ffffff'
  tertiary-container: '#5457e2'
  on-tertiary-container: '#eae8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#adcae7'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#2e4961'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  tabular-nums:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  container-margin: 24px
  gutter: 16px
  sidebar-width: 260px
  header-height: 56px
  touch-target-min: 44px
---

## Brand & Style
The design system is engineered for a high-stakes environment where medical precision meets financial accountability. The brand personality is **Professional, Accurate, and Calm**, ensuring that users handling sensitive lab assets and high-volume financial data feel a sense of control and reliability.

The visual style is **Corporate / Modern**, leaning heavily into a functional, systematic aesthetic. It prioritizes information density over decorative flair, utilizing a structured layout to reduce cognitive load during complex data entry and auditing tasks. The interface evokes a sense of "clinical efficiency" through crisp edges, subtle depth, and a disciplined use of brand colors.

## Colors
The palette is rooted in trust and stability. The **Deep Teal primary** is used for core actions and brand presence, while the **Dark Navy secondary** provides a grounded foundation for navigation systems. 

- **Background & Surface:** We use a cool-toned Light Gray/Blue for the main canvas to reduce eye strain, reserving Pure White for cards and interactive containers to create clear focal points.
- **Functional Logic:** Status colors are high-chroma to ensure they are immediately scannable. "Partner-funded" assets use Indigo to distinguish them from standard clinical assets.
- **Data Visualization:** Use the primary teal and secondary navy for standard data; functional colors should only be used when specific status or financial health is being communicated.

## Typography
This design system utilizes **Inter** for its exceptional legibility and comprehensive OpenType features. 

- **Tabular Numerals:** For all financial tables, asset counts, and PKR currency displays, the `tnum` (tabular numbers) setting must be enabled. This ensures that decimal points and digits align vertically, allowing for rapid visual auditing of ledger columns.
- **Hierarchy:** Use `label-caps` for table headers and small metadata categories. `headline-sm` is the default for card titles.
- **Mobile scaling:** On devices smaller than 768px, `display-lg` should scale down to 24px to maintain readability within compact mobile views.

## Layout & Spacing
The layout follows a **Fixed-Fluid hybrid model**. 
- **Desktop:** A fixed 260px sidebar provides persistent navigation. The main content area uses a fluid grid with a maximum content width of 1440px to prevent excessive line lengths in data tables.
- **Density:** We employ a 4px baseline grid. Internal card padding is set to 16px or 20px (4x/5x) to maintain a compact, professional feel without crowding the data.
- **Mobile:** The sidebar collapses into a bottom-sheet or "hamburger" drawer. Margins reduce to 16px. All interactive elements (buttons, chevron icons, toggles) must maintain a minimum height of 44px to ensure touch accuracy in clinical settings where users may be mobile.

## Elevation & Depth
This design system uses **Tonal Layering and Low-Contrast Outlines** rather than heavy shadows to convey depth. This keeps the UI feeling clean and modern.

- **Level 0 (Background):** #F6F8FA. No elevation.
- **Level 1 (Cards/Surface):** #FFFFFF with a 1px border in #E2E8F0. This is the standard container for all data lists and forms.
- **Level 2 (Popovers/Modals):** #FFFFFF with a subtle, diffused shadow (0px 4px 12px rgba(18, 48, 71, 0.08)) to indicate temporary overlay.
- **Active State:** Use a 2px Deep Teal left-border on active list items or navigation links to indicate focus without relying on heavy color fills.

## Shapes
The shape language is **Soft (0.25rem)**. This provides a professional, "tool-like" appearance that is more modern than sharp 90-degree corners but avoids the overly casual nature of fully rounded/pill shapes.

- **Standard Elements:** Buttons, input fields, and checkboxes use 4px (`rounded-sm`).
- **Containers:** Large cards and modals use 8px (`rounded-lg`) to provide a clear structural frame.
- **Status Badges:** Use a 2px radius for a tight, technical look that mimics physical asset tags.

## Components
- **Data Tables:** These are the heart of the system. Headers should be sticky. Currency (PKR) columns must be right-aligned with monospace-like alignment. Row hovering should trigger a subtle gray-wash (#F1F5F9).
- **Status Badges:** Use "Dot + Text" indicators for sync states. 
    - *Online:* Green dot.
    - *Offline:* Amber dot.
    - *Conflict:* Red dot.
- **Action Buttons:**
    - *Primary:* Deep Teal background, white text.
    - *Secondary:* Dark Navy outline, navy text.
    - *Destructive:* Error-red text, no background (ghost style) until hover.
- **Input Fields:** Use persistent labels (not floating) for maximum clarity during rapid data entry. Borders should be #CBD5E1, changing to Deep Teal on focus.
- **Sidebars:** Use the Dark Navy (#123047) background with high-contrast icons for primary navigation. Use a "compact" mode (icon only) for users who prioritize screen real estate.
- **Asset Cards:** Use for "at-a-glance" inventory. Include a top-border accent color reflecting the asset status (e.g., Indigo for Partner-funded).