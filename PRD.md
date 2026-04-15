# Planning Guide

STIX MΛGIC VC NODE is a premium operator-facing control surface for orchestrating Telegram voice chat infrastructure—a command node for live media routing, session management, and real-time diagnostics.

**Experience Qualities**:
1. **Cinematic** - Every interaction should feel like operating high-grade broadcast equipment with polished animations and premium visual feedback
2. **Precise** - Controls and status indicators must communicate technical state with surgical clarity and zero ambiguity
3. **Alive** - The interface breathes with subtle motion, real-time telemetry, and responsive state changes that feel connected to live infrastructure

**Complexity Level**: Light Application (multiple features with basic state)
  - This is a polished prototype demonstrating operator controls, live session state, and diagnostic telemetry without requiring full backend orchestration logic

## Essential Features

### Live Session Status Panel
- **Functionality**: Real-time display of current VC session health, connection state, active media source, and signal quality metrics
- **Purpose**: Gives operators immediate situational awareness of the live voice infrastructure
- **Trigger**: Automatically displays current state on page load; updates in real-time as conditions change
- **Progression**: Page loads → Status indicators animate in → Live metrics display → Continuous state updates → Visual feedback on state changes
- **Success criteria**: Operator can instantly assess session health, identify active source, and detect connection issues at a glance

### Operator Control Surface
- **Functionality**: Primary action controls for VC lifecycle management (join, disconnect, source switching, signal stabilization, emergency stop)
- **Purpose**: Provides direct operator command execution for critical session management tasks
- **Trigger**: User clicks control buttons based on operational needs
- **Progression**: Operator assesses state → Selects action → Button provides feedback → State updates reflect action → Status panel confirms change
- **Success criteria**: Controls feel responsive, purposeful, and provide clear confirmation of execution

### Source Layer Management
- **Functionality**: Visual representation of available media input sources (local, stream relay, live input, bridge)
- **Purpose**: Communicates the system's source-agnostic architecture and allows future source routing
- **Trigger**: Displays available sources on load; operator can view and conceptually switch between sources
- **Progression**: Sources display → Operator reviews options → Can select different source → Active source highlighted → Status reflects change
- **Success criteria**: Clear differentiation between source types, obvious active state, and seamless visual transitions

### Architecture Visualization
- **Functionality**: Clean visual diagram showing system layers (Operator UI → Control Bot → VC Engine → Source Adapters → Bridge Layer)
- **Purpose**: Communicates product architecture to technical stakeholders and positions the system as modular infrastructure
- **Trigger**: User scrolls to architecture section
- **Progression**: Section enters viewport → Layers animate in sequentially → Connections draw → Labels appear → System feels cohesive
- **Success criteria**: Non-developers understand the system's modularity; technical users see the architectural value

### Diagnostic Telemetry Stream
- **Functionality**: Live event log showing session events, reconnect attempts, source changes, signal updates
- **Purpose**: Provides operational transparency and debugging insight during live sessions
- **Trigger**: Events generate continuously; log auto-scrolls and updates in real-time
- **Progression**: Event occurs → Log entry appears with timestamp → Color-coded by severity → Auto-scroll maintains latest focus → History preserved
- **Success criteria**: Operators can trace session behavior, identify issues, and verify command execution through log inspection

## Edge Case Handling

- **No Active Session**: Display standby state with clear "Join VC" prompt and dimmed indicators
- **Connection Interruption**: Show reconnecting status with retry count and signal quality degradation warnings
- **Multiple Rapid Actions**: Queue or debounce control actions to prevent conflicting state changes
- **Source Unavailable**: Display source as offline/unavailable with diagnostic reasoning if possible
- **Emergency Stop Invoked**: Immediately override all other states, display critical alert, require deliberate recovery action

## Design Direction

The interface should evoke the feeling of operating **premium broadcast infrastructure**—a cinematic operator console that feels technical, alive, and intentional. Think: Telegram's clean interaction patterns meets Apple's obsessive finish meets high-grade A/V equipment control surfaces. The aesthetic should be **radiant dark**: deep charcoal foundations with glass panels, restrained glow on active elements, and carbon-fiber-like textures. Every element should feel deliberate, precise, and operator-grade—not a consumer music bot, not a cheap hacker terminal, not a generic admin dashboard.

## Color Selection

**Radiant Dark / Glass + Carbon** palette with cinematic depth and technical precision.

- **Primary Color**: Deep Electric Blue `oklch(0.55 0.18 250)` - represents active uplink state, primary actions, and live signal presence with clinical precision
- **Secondary Colors**: 
  - Matte Charcoal `oklch(0.15 0.01 260)` - foundational surface color evoking premium carbon materials
  - Slate Glass `oklch(0.25 0.02 260)` - elevated panel surfaces with subtle translucency
- **Accent Color**: Radiant Cyan `oklch(0.75 0.14 195)` - signal quality indicators, live state glow, active source highlights
- **Destructive**: Emergency Red `oklch(0.55 0.22 25)` - emergency stop, critical warnings, connection failures
- **Success**: Signal Green `oklch(0.65 0.15 145)` - healthy connection, stable uplink, successful operations
- **Foreground/Background Pairings**: 
  - Background (Matte Charcoal `oklch(0.15 0.01 260)`): Soft White `oklch(0.95 0.01 260)` - Ratio 14.2:1 ✓
  - Primary (Electric Blue `oklch(0.55 0.18 250)`): White `oklch(0.98 0 0)` - Ratio 5.8:1 ✓
  - Slate Glass (Panel `oklch(0.25 0.02 260)`): Soft White `oklch(0.95 0.01 260)` - Ratio 8.1:1 ✓
  - Accent (Radiant Cyan `oklch(0.75 0.14 195)`): Deep Charcoal `oklch(0.15 0.01 260)` - Ratio 11.3:1 ✓

## Font Selection

Typography should communicate **technical precision and premium finish** with excellent readability in low-light operator environments.

- **Primary Typeface**: JetBrains Mono (already loaded) - monospaced precision for metrics, diagnostics, and operator interface elements
- **Secondary Typeface**: Inter - clean sans-serif for labels, descriptions, and body content (to be added)

- **Typographic Hierarchy**:
  - H1 (Hero Title - STIX MΛGIC): JetBrains Mono Bold / 56px / tight letter-spacing (-0.02em)
  - H2 (Section Headers): Inter SemiBold / 24px / normal letter-spacing
  - H3 (Panel Titles): Inter Medium / 18px / slight letter-spacing (0.01em)
  - Body (Descriptions): Inter Regular / 15px / line-height 1.6
  - Metrics/Data: JetBrains Mono Medium / 14px / tabular-nums
  - Diagnostics Log: JetBrains Mono Regular / 13px / tabular-nums / line-height 1.5

## Animations

Animations should feel like **broadcast-grade equipment responding to operator input**—precise, confident, and purposeful. Status changes should have subtle glow transitions (200-300ms). Control buttons should provide immediate tactile feedback (100ms press, 200ms release with ripple). Panel state changes should use smooth slide/fade combinations (300ms ease-out). Diagnostic entries should slide in from bottom with subtle blur-fade (250ms). Live metrics should pulse gently on significant changes (400ms heartbeat). Emergency actions should have sharp, immediate visual feedback (150ms) with red glow emphasis. All motion should suggest **real infrastructure responding**, not arbitrary decoration.

## Component Selection

- **Components**:
  - **Card** - Main panel containers for session status, controls, sources (with custom glass/border styling)
  - **Button** - All operator controls with distinct variants for primary/secondary/destructive actions
  - **Badge** - Status pills for connection state, signal quality, source type
  - **Separator** - Subtle dividers between panel sections
  - **Scroll Area** - Diagnostic log container with custom scrollbar styling
  - **Tabs** - Source layer navigation if needed
  - **Progress** - Signal strength bars, uplink quality indicators
  - **Alert** - Emergency state warnings
  
- **Customizations**:
  - **Glass Panel Component** - Custom card variant with backdrop-blur, subtle border glow, and semi-transparent backgrounds
  - **Status Indicator** - Custom component combining Badge with animated glow dot for live state
  - **Metric Display** - Custom component pairing label + value with monospace data and icon
  - **Action Button** - Enhanced button with icon, glow on hover, and state-aware coloring
  - **Log Entry** - Custom diagnostic row with timestamp, severity color, event type, and message
  - **Architecture Node** - Custom visual component for system layer blocks with connecting lines

- **States**:
  - Buttons: Default (matte), Hover (subtle glow + lift), Active (pressed + inner shadow), Disabled (50% opacity + no interaction)
  - Status Indicators: Standby (muted gray), Active (cyan glow pulse), Warning (amber), Error (red pulse), Connecting (blue animated dots)
  - Panels: Inactive (reduced opacity borders), Active (bright border accent), Critical (red border glow)
  
- **Icon Selection**:
  - **@phosphor-icons/react** for all UI icons
  - Broadcast / RadioButton - VC session
  - Lightning - Signal/Uplink
  - PlayCircle / Stop - Playback controls
  - ArrowsClockwise - Reconnect
  - Warning - Alert states
  - CheckCircle - Success
  - WaveformSlash - Emergency stop
  - Database - Source layers
  - Tree - Architecture
  - Terminal - Diagnostics
  - Pulse - Live indicators

- **Spacing**:
  - Section gaps: 16 (between major page sections)
  - Panel padding: 6 (internal card content)
  - Button groups: 3 (between related actions)
  - Metric rows: 4 (between data pairs)
  - Log entries: 2 (between diagnostic lines)
  - Icon-to-label: 2 (inside buttons and metrics)

- **Mobile**:
  - Hero typography scales down (H1 to 36px)
  - Session status metrics stack vertically instead of grid
  - Control buttons remain full-width for tap targets
  - Architecture diagram simplifies to vertical flow
  - Diagnostic log maintains fixed height but reduces font to 12px
  - Source cards stack in single column
  - Overall layout remains single-column with preserved spacing ratios
