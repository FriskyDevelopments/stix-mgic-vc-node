# Planning Guide

STIX MΛGIC VC NODE is a premium multi-platform session control node for live voice and media operator infrastructure—a unified command surface for routing, monitoring, and managing live session presence across Telegram and Discord with support for OBS integration, RTMP streaming, session management, and real-time diagnostics.

**Experience Qualities**:
1. **Cinematic** - Every interaction should feel like operating high-grade broadcast equipment with polished animations and premium visual feedback
2. **Precise** - Controls and status indicators must communicate technical state with surgical clarity and zero ambiguity, adapting language to platform context (Telegram vs Discord)
3. **Alive** - The interface breathes with subtle motion, real-time telemetry, and responsive state changes that feel connected to live cross-platform infrastructure

**Complexity Level**: Light Application (multiple features with basic state) - Progressive disclosure approach
  - A refined multi-platform operator interface using progressive disclosure principles to reduce visual noise while maintaining access to all features through collapsible sections, with platform-aware language and routing logic

## Essential Features

### Platform Selector (Telegram + Discord)
- **Functionality**: High-level platform destination selector allowing operators to choose between Telegram and Discord as the target platform for session output, with platform-aware UI adaptation
- **Purpose**: Positions the system as a multi-platform session control node rather than Telegram-only, communicating "same operator brain, different platform destination"
- **Trigger**: Visible near top of interface above mode/source controls; user selects platform before configuring session
- **Progression**: Page loads → Telegram selected by default → User can switch to Discord → UI language adapts (VC→Voice Channel, Call→Channel, etc.) → Session mode concepts adjust → Diagnostics show platform-aware logs → Architecture reflects platform output
- **Success criteria**: Platform selection clearly visible; UI language adapts to platform (Telegram: "VC/Call/Broadcast" vs Discord: "Voice Channel/Channel/Stage"); diagnostics include PLATFORM category; controls use platform-appropriate terminology; architecture shows selected platform; system feels unified across both platforms; Telegram remains primary reference but Discord support feels native

### DJ Audio Source Selection (Optional Spotify Integration)
- **Functionality**: Audio source management for DJ Mode with managed sources (STIX Library, ClipsFlow Audio Pack, STIX MΛGIC Session Pack) and optional personal Spotify integration, clearly positioning Spotify as secondary personalization layer
- **Purpose**: Provides flexible audio routing while maintaining managed STIX audio as the default path, with Spotify as an optional "bring your own music" enhancement for users who want personalized tracks
- **Trigger**: Appears as collapsible section when DJ Mode protocol is selected or when session is in DJ Mode state; users can choose from managed sources or optionally log into Spotify
- **Progression**: Section collapsed by default → User expands "DJ Audio Source" → Sees Managed Sources (STIX Library, ClipsFlow Pack, Session Pack) → Sees Personal Source section below → (Optional) Clicks "Log in with Spotify" → OAuth simulation (1.5s) → Spotify connected → User can choose track → Selected track displayed → User can switch back to managed sources anytime → Spotify remains available but not required
- **Success criteria**: Managed sources appear first and feel primary; Spotify appears in separate "Personal Source" section; Spotify login is clearly optional; users can disconnect Spotify; switching between sources updates diagnostic logs; selected Spotify track displays when connected; system works fully without Spotify; UI communicates "bring your own music" positioning

### Input Protocol Selector
- **Functionality**: Primary mode selector for media input routing: ClipsFlow File (prepared media intake), Virtual Camera (OBS call mode), RTMP Stream (broadcast mode), Local Media, or Relay Input
- **Purpose**: Establishes the fundamental system mode and determines how media enters the VC node, with ClipsFlow representing upstream prepared media that protects the node from heavy file processing
- **Trigger**: User selects protocol type; selection is locked when session is active
- **Progression**: Page loads → ClipsFlow default shown → User reviews options → Selects protocol → Active protocol highlights → System mode adapts → Controls and metrics update to match protocol
- **Success criteria**: Clear visual distinction between protocols, obvious active state, mode-appropriate controls appear, ClipsFlow shows distinct prepared media messaging

### ClipsFlow File Mode (Prepared Media Intake)
- **Functionality**: ClipsFlow file intake mode showing prepared media metadata including asset type, preparation state, compression profile, delivery mode, and payload status with infrastructure protection messaging
- **Purpose**: Represents the architectural pattern where heavy media processing happens upstream in ClipsFlow, protecting the VC NODE from raw file handling and server burden
- **Trigger**: User selects ClipsFlow File protocol and initiates routing
- **Progression**: Protocol selected → "Route to VC" appears → User clicks → ClipsFlow asset received → Preparation verified → Media linked to session → Routing confirmed
- **Success criteria**: Metadata clearly shows prepared/optimized state; logs reflect INTAKE/PREP/ROUTING events; interface communicates infrastructure efficiency; metrics show intake and routing status

### Virtual Camera Mode (Call Injection)
- **Functionality**: OBS Virtual Camera integration mode showing camera feed status, frame rate, audio sync, and latency metrics specific to camera injection
- **Purpose**: Represents real-world workflow of injecting OBS output into Telegram VC as a virtual camera device
- **Trigger**: User selects Virtual Camera protocol and initiates connection
- **Progression**: Protocol selected → "Inject Camera" appears → User clicks → System detects OBS → Camera feed activates → Metrics show frame rate and sync → Live injection confirmed
- **Success criteria**: Metrics accurately reflect camera feed status; logs show OBS detection and sync status; controls say "Inject Camera" not generic "Join"

### RTMP Broadcast Mode (Stream Uplink)
- **Functionality**: RTMP streaming mode with stream key management, uplink status, bitrate monitoring, and packet loss tracking
- **Purpose**: Represents real-world RTMP broadcast workflow to Telegram ingest endpoints
- **Trigger**: User selects RTMP protocol and initiates stream
- **Progression**: Protocol selected → Stream key displayed → "Start Stream" appears → User clicks → RTMP handshake → Uplink connects → Bitrate stabilizes → Stream health monitored
- **Success criteria**: Stream key can be copied; uplink metrics show bitrate and packet loss; logs reflect RTMP-specific events; controls say "Start/Stop Stream"

### Live Session Status Panel
- **Functionality**: Real-time display of current VC session health with protocol-specific metrics (Virtual Camera shows frame rate/sync, RTMP shows bitrate/packet loss, other modes show generic signal quality)
- **Purpose**: Gives operators immediate situational awareness tailored to their chosen input protocol and session mode (CALL INJECTION vs BROADCAST UPLINK)
- **Trigger**: Automatically displays current state on page load; updates in real-time as conditions change; shows mode badge when active
- **Progression**: Page loads → Status indicators animate in → Protocol-specific metrics display → Session mode badge appears (if applicable) → Continuous state updates → Visual feedback on state changes
- **Success criteria**: Operator can instantly assess session health, identify protocol mode, see mode-specific metrics, and detect issues at a glance

### Operator Control Surface
- **Functionality**: Protocol-aware action controls that adapt to input mode (Virtual Camera: "Inject Camera", RTMP: "Start Stream", etc.) for lifecycle management, with automatic operator session timer countdown (2 minutes) and seamless DJ Mode fallback transition when time expires
- **Purpose**: Provides direct operator command execution with language and actions appropriate to the selected protocol, while demonstrating the premium tier fallback behavior where active operator sessions gracefully transition to autonomous DJ Mode
- **Trigger**: User clicks control buttons based on operational needs and current protocol; operator timer starts automatically when premium user activates preflight; timer countdown triggers warnings at 60s, 30s, and 10s; automatic transition initiates at 0s
- **Progression**: Operator assesses protocol and state → Selects appropriate action → Button provides feedback → State updates reflect action → Status panel confirms change with protocol-specific logs → (Premium tier) Timer counts down during active session → Warnings appear at intervals → Session seamlessly transitions to DJ Mode at expiration → Logs document continuity preservation
- **Success criteria**: Controls feel responsive, use correct terminology per protocol, provide clear confirmation of execution; timer displays in MM:SS format with visual urgency (amber when <30s); transition happens smoothly without session drop; DJ Mode activates with autonomous loop + audio; logs clearly communicate fallback behavior

### DJ Mode (Autonomous Session Fallback)
- **Functionality**: Lightweight autonomous session mode running looping visual content + ambient audio track with session branding, serving as both no-cost entry point and automatic fallback when premium operator time expires
- **Purpose**: Demonstrates the commercial tier system where sessions gracefully transition from active operator control to autonomous presence, maintaining session continuity without interruption
- **Trigger**: User can start DJ Mode directly from standby as free/no-cost entry; automatic transition occurs when premium operator session timer reaches zero; manual upgrade available from DJ Mode to operator session
- **Progression**: (Direct start) User selects DJ Mode protocol → Clicks "Start DJ Mode" → Connecting state → DJ Mode activates with loop + audio | (Fallback) Active operator session → Timer reaches 60s warning → 30s warning → 10s warning → 0s triggers transition → Connecting state with fallback logs → Input protocol switches to dj-mode → DJ Mode activates → Session continues autonomously → Session mark persists → Signal metrics adjust to autonomous mode values
- **Success criteria**: Direct start works from standby; fallback transition happens smoothly during active session without session drop; logs communicate "operator window completed" → "fallback initiated" → "DJ Mode active"; visual preview updates to show looping content; audio state reflects ambient track; signal quality stabilizes around 88%; operator can upgrade from DJ Mode back to full session; branding/session mark persists through transition

### Operator Session Timer & Seamless Fallback
- **Functionality**: Live countdown timer (2 minutes default) displayed during active premium operator sessions, with progressive warnings and automatic seamless transition to DJ Mode when time expires, plus "Extend Time" control available when timer is running low
- **Purpose**: Demonstrates the premium tier's time-based operator sessions with intelligent fallback behavior that preserves session continuity rather than abruptly ending the session
- **Trigger**: Timer starts automatically when premium user initiates preflight; countdown runs every second; warnings trigger at 60s, 30s, and 10s remaining; transition triggers at 0s; "Extend Time" button appears when time is below 90s
- **Progression**: Preflight starts → Timer badge appears in session status (MM:SS format) → Countdown runs → 60s: info log + toast → 30s: warning log + toast + timer badge turns amber → 10s: warning log + toast → 0s: transition flag set → Status changes to "connecting" → Logs document completion and fallback → Brief delay → Input protocol switches to "dj-mode" → Additional logs for routing change → DJ Mode activates → Transition flag clears → Session continues in autonomous mode | (Extension) Timer running low → "Extend Time" button visible → User clicks → 60s added to timer → Success log + toast
- **Success criteria**: Timer displays prominently with clear MM:SS format; visual urgency increases as time decreases (amber at <30s); warnings provide clear advance notice; transition happens smoothly without UI jank; logs tell clear story of session continuity; DJ Mode takes over seamlessly; all session state (branding, preview) persists through transition; "Extend Time" button appears conditionally and adds time successfully; no duplicate transitions occur
- **Functionality**: Visual representation of available input protocols with mode indicators (Virtual Camera/RTMP show their session modes)
- **Purpose**: Communicates the system's protocol-agnostic architecture and establishes whether the system is in call injection or broadcast uplink mode
- **Trigger**: Displays available protocols on load; operator can select different protocol when session is inactive
- **Progression**: Protocols display → Operator reviews options with mode indicators → Can select different protocol (if inactive) → Active protocol highlighted → Session mode badge updates → Status reflects change
- **Success criteria**: Clear differentiation between protocol types, obvious active state, mode indicators visible, seamless visual transitions

### Architecture Visualization
- **Functionality**: Clean visual diagram showing system flow with dynamic highlighting based on active protocol: ClipsFlow → VC NODE → Telegram for prepared media, OBS → VC NODE → Telegram for live feeds
- **Purpose**: Communicates product architecture with emphasis on upstream intake layers (ClipsFlow or OBS) and positions the system as a bridge with intelligent routing based on source type
- **Trigger**: User scrolls to architecture section; diagram adapts to show ClipsFlow when using prepared media, OBS when using camera/RTMP, or generic Source otherwise
- **Progression**: Section enters viewport → Layers animate in sequentially → Source layer highlighted when active → Connections draw with pulse animation → Labels adapt to protocol → System feels cohesive
- **Success criteria**: Users understand ClipsFlow protects the node from heavy processing; technical users see the layered architecture value; active connections visually pulse; ClipsFlow mode shows distinct upstream intake layer

### Diagnostic Telemetry Stream
- **Functionality**: Live event log with protocol-specific categories (SOURCE, SESSION, AUDIO, UPLINK, SYNC, HEALTH, INTAKE, PREP, ROUTING) showing realistic system-level events tailored to each input protocol
- **Purpose**: Provides operational transparency with language that reflects real system interactions, including ClipsFlow intake/preparation flow, OBS/Telegram events, and routing operations
- **Trigger**: Events generate continuously based on protocol actions; log auto-scrolls and updates in real-time
- **Progression**: Event occurs → Protocol-aware log entry appears with timestamp → Color-coded by severity → Category reflects protocol context (INTAKE/PREP for ClipsFlow) → Auto-scroll maintains latest focus → History preserved
- **Success criteria**: Operators can trace protocol-specific behavior, identify issues, verify command execution, see realistic system events including ClipsFlow intake preparation messaging

## Edge Case Handling

- **No Active Session**: Display standby state with protocol-appropriate call-to-action ("Inject Camera" for Virtual Camera, "Start Stream" for RTMP, etc.)
- **Connection Interruption**: Show reconnecting status with retry count and signal quality degradation warnings appropriate to protocol
- **Protocol Switch During Active Session**: Prevent protocol changes when session is active; show error toast explaining session must be disconnected first
- **Multiple Rapid Actions**: Queue or debounce control actions to prevent conflicting state changes
- **RTMP Stream Key Security**: Display stream key as password field by default; provide copy button for secure clipboard transfer
- **ClipsFlow Prepared Media Not Available**: In ClipsFlow mode, show metadata indicating prepared/optimized state even when inactive (UI simulation only)
- **OBS Virtual Camera Not Detected**: In virtual camera mode, show diagnostic message if OBS virtual camera device is unavailable (UI simulation only)
- **Emergency Stop Invoked**: Immediately override all other states regardless of protocol, display critical alert, require deliberate recovery action

## Design Direction

The interface should evoke the feeling of operating **a calm, focused operator-grade control instrument** with progressive disclosure that prevents visual overwhelm. The redesigned layout follows a strict hierarchy: **Live Surface** (always visible preview, status, and mode), **Primary Action Zone** (single most important action), and **Expandable System Panels** (collapsible sections for protocols, metrics, branding, diagnostics, and architecture). This creates a premium broadcast interface where operators see only what matters right now, with depth available when needed. Think: Telegram's clean interaction patterns meets Apple's obsessive finish meets professional broadcast equipment with intelligent information layering. The aesthetic remains **radiant dark**: deep charcoal foundations with glass panels, restrained glow on active elements, and carbon-fiber-like textures. The restructure emphasizes preview-first design - the live preview is the largest, most central element, with controls directly underneath and advanced panels collapsed by default. This prevents the dashboard clutter of the previous version while maintaining all capabilities through thoughtful progressive disclosure.

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

Animations should feel like **broadcast-grade equipment responding to operator input**—precise, confident, and purposeful. Status changes should have subtle glow transitions (200-300ms). Control buttons should provide immediate tactile feedback (100ms press, 200ms release with ripple). Panel state changes should use smooth slide/fade combinations (300ms ease-out). Protocol switches should smoothly transition metrics and controls (400ms crossfade). Diagnostic entries should slide in from bottom with subtle blur-fade (250ms). Live metrics should pulse gently on significant changes (400ms heartbeat). RTMP mode should include subtle animated signal lines on architecture connections suggesting uplink energy flow. Virtual Camera mode should have softer, more local-feeling pulses. Emergency actions should have sharp, immediate visual feedback (150ms) with red glow emphasis. All motion should suggest **real infrastructure responding**, not arbitrary decoration.

## Component Selection

- **Components**:
  - **Collapsible Section** - Custom progressive disclosure component for Input Protocol, Source Details, Branding, Advanced Controls, Diagnostics, and Architecture
  - **Tabs** - Compact tab row for protocol selection (DJ/Prepared/Call/Broadcast/Local/Relay) replacing the large grid
  - **Card/Glass Panel** - Main containers for live surface and primary actions (reduced from 8+ cards to 2 always-visible panels)
  - **Button** - All operator controls with adaptive labeling and state-aware actions
  - **Badge** - Compact mode indicators (DJ/CALL/BROADCAST), status pills, timer display
  - **Input** - Stream key display field (password type) for RTMP mode with copy functionality
  - **Separator** - Subtle dividers within expandable sections
  - **ScrollArea** - Diagnostic log container with filtering controls
  - **Progress** - Signal strength bars (shown only when metrics section is expanded)
  
- **Customizations**:
  - **CollapsibleSection** - New component with animated expand/collapse, title/description, default state control for progressive disclosure
  - **Live Surface Panel** - Always-visible glass panel containing preview, mode badge, and status indicator as the primary visual anchor
  - **Primary Action Panel** - Always-visible compact control panel showing only the single most important action for current state
  - **Diagnostic Filter Bar** - Interactive filter buttons (All/Source/Session/Audio/Uplink/Brand/DJ) for focused telemetry viewing
  - **Compact Tabs** - Space-efficient protocol selector replacing visual-heavy grid layout
  - **Metric Display** - Shown only within expandable Source Details section, not cluttering main view
  - **Architecture Visualization** - Moved into collapsible section, smaller node sizes for reduced visual weight

- **States**:
  - CollapsibleSection: Collapsed (default for most), Expanded (animated height transition), Hover (subtle background change on header)
  - Buttons: Simplified states with less visual weight, primary action remains prominent
  - Live Surface: Always visible regardless of session state, becomes visual anchor
  - Primary Actions: Context-aware - shows only Start/Stop/Upgrade/Go Live based on current state, never shows wall of buttons
  - Expandable Panels: Hidden by default, revealed on demand, maintaining focus on live surface
  
- **Icon Selection**: Same phosphor-icons set, but used more sparingly in collapsed states, full detail shown when sections expand
  - FunnelSimple - Diagnostic filtering
  - CaretDown - Collapsible section indicators
  - (existing icons remain for their original purposes)

- **Spacing**:
  - Reduced overall vertical rhythm (8 units between major sections vs previous 16)
  - Tighter header (py-8 vs py-12)
  - Compact section gaps (space-y-6 vs space-y-16)  
  - Collapsible content uses internal padding to feel contained
  - Live surface gets most visual weight and breathing room

- **Mobile**:
  - Collapsible sections especially valuable on mobile - users expand only what they need
  - Protocol tabs remain scrollable horizontal row
  - Live preview remains largest element
  - Primary action buttons stay full-width
  - Collapsed sections show title + description only, minimizing scroll
  - Overall experience much calmer than previous crowded mobile view
