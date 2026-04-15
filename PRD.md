# Planning Guide

A high-tech operator interface for camera streaming within Telegram, blending cyberpunk brutalism with occult mysticism through a carbon-and-glass aesthetic that transforms from dormant to alive when the video feed activates.

**Experience Qualities**:
1. **Arcane** - The interface feels like forbidden technology, a ritual device disguised as software, where activation sequences replace mundane interactions
2. **Tactical** - Every element conveys precision and purpose with military-grade clarity through strict monospace typography and severe geometric containment
3. **Responsive** - The UI breathes with state changes—dormant carbon awakens to neon-lit glass when the video stream initializes

**Complexity Level**: Light Application (multiple features with basic state)
This is a focused camera interface with three core states (dormant, streaming, recording) and simple permission/stream management, making it a light application despite its technical appearance.

## Essential Features

**Camera Initialization**
- Functionality: Requests browser camera/audio permissions and establishes media stream
- Purpose: Grants access to device hardware for video capture
- Trigger: User taps "INITIALIZE UPLINK" button
- Progression: Dormant UI → Permission prompt → Stream establishment → Video feed display with neon green glow
- Success criteria: Live video feed visible in center panel, UI transitions from gray to green accent

**Video Stream Display**
- Functionality: Renders real-time camera feed within glass-panel container
- Purpose: Provides live visual feedback of capture device
- Trigger: Successful camera initialization
- Progression: Black void → getUserMedia call → Stream attachment → Auto-playing muted video
- Success criteria: Smooth 30fps video playback, proper aspect ratio maintenance, no audio feedback

**Recording Control**
- Functionality: Toggles video/audio capture state with visual indicator
- Purpose: Allows user to mark recording sessions
- Trigger: User taps "START CAPTURE" / "STOP CAPTURE" button
- Progression: Green-lit streaming → Recording toggle → Pulsing red indicator → State update
- Success criteria: Clear visual differentiation between streaming and recording states

**Stream Termination**
- Functionality: Releases camera hardware and returns UI to dormant state
- Purpose: Explicitly closes media stream and frees device resources
- Trigger: User taps "SEVER CONNECTION" button
- Progression: Active stream → Stream tracks stopped → Video element cleared → UI returns to carbon gray
- Success criteria: Camera light turns off, UI resets to initial dormant state

## Edge Case Handling

- **Permission Denied**: Display carbon-red error message "ACCESS DENIED - CAMERA PERMISSIONS REQUIRED" in monospace
- **No Camera Available**: Show "NO CAPTURE DEVICE DETECTED" status message
- **Stream Interruption**: Auto-detect stream end and reset UI to dormant state
- **Mobile Compatibility**: Ensure getUserMedia works across iOS Safari and Android Chrome
- **Multiple Activations**: Prevent double-initialization by disabling "INITIALIZE" when stream is active

## Design Direction

The interface should evoke the feeling of operating classified surveillance equipment—cold, precise, and faintly ominous. Users should feel like they've accessed something powerful and slightly forbidden, with the transition from dormant carbon to neon-lit glass creating a sense of technological awakening.

## Color Selection

A palette of technological darkness with tactical accents that activate based on system state.

- **Primary Color**: Obsidian Black (oklch(0.1 0 0)) - The void of the base layer, absolute darkness representing dormant potential
- **Secondary Colors**: 
  - Carbon Glass (oklch(1 0 0 / 0.05)) - Translucent panels that float above the void
  - Tactical Green (oklch(0.7 0.2 142)) - Activation state, living system indicator
  - Alert Red (oklch(0.6 0.25 27)) - Recording pulse, warning state
- **Accent Color**: Neon Green Border (oklch(0.75 0.22 142) / 0.5) - Critical for active video container glow
- **Foreground/Background Pairings**: 
  - Obsidian (oklch(0.1 0 0)): Monospace White (oklch(0.95 0 0)) - Ratio 14.2:1 ✓
  - Carbon Glass (oklch(1 0 0 / 0.05)): Muted Gray (oklch(0.65 0 0)) - Ratio 6.8:1 ✓
  - Tactical Green (oklch(0.7 0.2 142)): Pure White (oklch(1 0 0)) - Ratio 5.2:1 ✓

## Font Selection

The typeface must communicate technical precision and monospaced discipline, evoking command-line interfaces and military readouts.

- **Primary Font**: JetBrains Mono - Engineered for code, perfect for the operator aesthetic with its sharp geometric forms and excellent readability

- **Typographic Hierarchy**:
  - App Title: JetBrains Mono Bold / 18px / Uppercase / tracking-widest / Tactical green when active
  - Button Labels: JetBrains Mono Medium / 11px / Uppercase / tracking-wider / Carbon gray dormant, accent when active
  - Status Text: JetBrains Mono Regular / 10px / Uppercase / tracking-wide / Muted gray
  - Error Messages: JetBrains Mono Medium / 12px / Uppercase / tracking-wide / Alert red

## Animations

Animations should feel precise and mechanical, like machinery activating rather than organic motion—every transition reinforces the sense of operating technical equipment.

- **State Transitions**: 200ms ease-out for button states and border color changes, suggesting instant mechanical response
- **Recording Pulse**: 2s infinite pulse on red indicator using opacity 40%→100%, creating a "heartbeat" effect
- **Panel Appearance**: Subtle 300ms fade-in for glass panels when stream initializes
- **Glow Intensity**: Smooth 400ms transition when video border shifts from dormant to neon green

## Component Selection

- **Components**: 
  - Button (Shadcn) - Heavily customized with glass morphism (backdrop-blur-md, bg-white/5, border-white/10) for the three control buttons
  - Card (Shadcn) - Modified for the video container with neon glow states
  - Alert (Shadcn) - For error states with cyber-occult styling
  
- **Customizations**: 
  - Custom `VideoPanel` component wrapping the native `<video>` element with glass container and state-based neon borders
  - Custom `ControlDeck` component for the bottom-anchored button array
  - Custom `StatusIndicator` component showing dormant/active/recording states with appropriate glows
  
- **States**: 
  - Buttons: Dormant (gray, low opacity) → Hover (increased opacity, subtle glow) → Active (full opacity, bright border) → Disabled (reduced opacity, no interaction)
  - Video Container: Empty (carbon borders) → Streaming (pulsing green border) → Recording (pulsing red corner indicator)
  - Status Text: Updates color and content based on camera state
  
- **Icon Selection**: 
  - Camera (phosphor) for initialization
  - Record (phosphor) for capture start
  - X (phosphor) for connection severance
  - Warning (phosphor) for error states
  
- **Spacing**: 
  - Outer container: p-6 for breathing room
  - Video panel: mb-6 separation from controls
  - Button group: gap-3 for tactical spacing
  - Internal padding: p-4 for glass panels
  
- **Mobile**: 
  - Full viewport height (h-screen) with flex column layout ensures proper stacking on mobile
  - Video element uses object-cover and max-h to prevent overflow
  - Bottom control deck remains anchored with safe spacing
  - Touch targets minimum 44px for all buttons
  - Responsive text sizing using clamp() for title (16px-18px range)
