## ADDED Requirements

### Requirement: Two topology layouts
The topology page SHALL draw the user's network in one of two layouts, **Klassisch** and **Baum**. Both layouts SHALL be built from the same topology model, so every device, group, online state and local draft appears identically in both.

#### Scenario: Klassisch layout
- **WHEN** the Klassisch layout is active
- **THEN** the router image is shown in the centre, each hub (group or connection type) is shown as a pill with its name and device count on a ring around the router, and each device is shown as a dot on a ring around its hub, connected by lines

#### Scenario: Baum layout
- **WHEN** the Baum layout is active
- **THEN** a router card, a column of hub cards and one row per device are shown from left to right, connected by curves, and each device row shows the online state, the name and the connection type

#### Scenario: Same data in both layouts
- **WHEN** the user switches between Klassisch and Baum
- **THEN** the same devices, hubs, counts and online states are shown, and the selected device, the group filter, the search text, "Nur online" and the Gruppen/Verbindungen mode are kept

### Requirement: Layout switch is remembered
The page SHALL offer a "Klassisch | Baum" switch and SHALL remember the last choice in the browser. Without a remembered choice it SHALL open Klassisch on wide screens and Baum on narrow screens (under 700 px stage width).

#### Scenario: Choice survives reload
- **WHEN** the user selects Baum and reloads the page
- **THEN** the page opens in Baum

#### Scenario: Default on a phone
- **WHEN** a user without a remembered choice opens the page at 390 px width
- **THEN** the page opens in Baum

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be read or written
- **THEN** the page still renders using the default layout and the switch still works for the current visit

### Requirement: Ring dots without glow
In Klassisch, an online device SHALL be drawn as a thin ring in its group colour with a small solid core, and an offline device SHALL be drawn as a dashed ring without a core and with a softer label. Classic device rings and pills SHALL NOT glow or pulse. The router asset and F's router/status shadows SHALL match the original mockup, as explicitly requested in the local visual-fidelity revision.

#### Scenario: Online and offline devices
- **WHEN** the network contains an online and an offline device in the same group
- **THEN** the online device shows a solid ring with a core and the offline device shows a dashed ring without a core

#### Scenario: No glow
- **WHEN** the Klassisch layout is rendered
- **THEN** no classic device ring or group pill has a blurred or coloured glow shadow and no element animates continuously; the original router image and its plain dark shadow are preserved

### Requirement: Selection and highlighting
Selecting a device SHALL highlight it without glow: in Klassisch with a white ring while all other devices fade, and in Baum with an accent-bordered row and a fully coloured connecting curve. Hovering or focusing a device in Klassisch SHALL show a solid ring in the group colour. The inspector SHALL show the selected device's details in both layouts.

#### Scenario: Select in Klassisch
- **WHEN** the user clicks a device dot in Klassisch
- **THEN** that dot gets a white ring, the other devices and labels fade, its connecting line is emphasised, and the inspector shows the device's group, template, rules and connection details

#### Scenario: Select in Baum
- **WHEN** the user clicks a device row in Baum
- **THEN** that row (and every other row of the same device under another group) is highlighted, its curve is drawn in full group colour, and the inspector shows the device details

#### Scenario: Clear selection
- **WHEN** the user clicks empty space in the stage or chooses "Netzwerkübersicht" in the device picker
- **THEN** no device is highlighted and the inspector shows the network overview

#### Scenario: Keyboard selection
- **WHEN** a keyboard user focuses a device and presses Enter or Space
- **THEN** the device is selected exactly as with a click

### Requirement: Existing filters and modes work in both layouts
The group filter, search, "Nur online" filter and the Gruppen/Verbindungen mode SHALL work in both layouts with the same results as the topology model's `matchingDevices` and `onlineOnly`.

#### Scenario: Group filter
- **WHEN** the user activates a group in the legend (or clicks a group pill in Klassisch)
- **THEN** devices outside that group fade in Klassisch and are hidden or faded in Baum, and the device picker lists only matching devices

#### Scenario: Only online
- **WHEN** the user turns on "Nur online"
- **THEN** offline devices disappear from both layouts, hub counts update, and empty hubs are not drawn

#### Scenario: Connection mode
- **WHEN** the user switches to Verbindungen
- **THEN** hubs are the connection types (e.g. WLAN, LAN) and each device keeps its group colour

### Requirement: Multiple group memberships
A device that belongs to several groups SHALL be reachable from every one of those groups without being duplicated in Klassisch.

#### Scenario: Device in two groups, Klassisch
- **WHEN** a device belongs to the groups "Familie" and "Arbeit"
- **THEN** the device is drawn once next to its primary group and a thin dashed line connects it to the other group's pill

#### Scenario: Device in two groups, Baum
- **WHEN** a device belongs to the groups "Familie" and "Arbeit"
- **THEN** the device has a row under both group cards

### Requirement: Arrangement in Klassisch
In Klassisch the user SHALL be able to drag group pills (devices follow) and single devices, zoom in and out, and reset the arrangement. A click that moves the pointer by less than 4 px SHALL count as a click, not a drag.

#### Scenario: Drag a group
- **WHEN** the user drags a group pill
- **THEN** the pill and all of its devices move together and the connecting lines follow

#### Scenario: Reset arrangement
- **WHEN** the user presses "Anordnung zurücksetzen"
- **THEN** all pills and devices return to their computed positions and the zoom returns to fit

#### Scenario: Tools in Baum
- **WHEN** the Baum layout is active
- **THEN** zoom and reset controls are hidden and the stage scrolls vertically when the rows do not fit

### Requirement: Mockup surfaces and on-demand details
The C2 Ring and F visual design SHALL be transferred from mockup.html: router asset, node and hub geometry, background, gradients, borders and labels. A same-fixture browser test SHALL compare geometry and computed surface styles against the unchanged reference. The application SHALL keep its own navigation and functional controls rather than the mockup's option gallery and explanatory notes.

#### Scenario: Classic device bar
- **WHEN** Klassisch is displayed
- **THEN** group chips and reset sit inside the graph, and the bottom device bar offers previous/next selection, a selected-device summary and access to full details without a permanent side column

#### Scenario: Tree details
- **WHEN** a device row is selected in Baum
- **THEN** the reference-style detail card opens over the graph, with group, status, connection, IP, MAC and preset; additional rules and local draft information remain available

#### Scenario: Search and narrow view
- **WHEN** the user opens search or uses a narrow screen
- **THEN** search and the device picker remain keyboard-accessible, the tree scrolls inside its stage, and neither the graph nor a detail panel causes page-level horizontal overflow

### Requirement: Existing page behaviour is preserved
Both layouts SHALL keep the existing page behaviour: local draft notice and captions, demo captions, reload, error and empty states, fullscreen including the inspector, and no horizontal page scroll at 390, 768 and 1440 px.

#### Scenario: Local draft
- **WHEN** a local security draft changes a device's group
- **THEN** both layouts show the draft group and the page shows the existing local preview notice

#### Scenario: Load failure
- **WHEN** the router data cannot be loaded
- **THEN** the stage shows "Netzwerk nicht verfügbar", the inspector is empty, and a later successful reload renders the active layout again

#### Scenario: Fullscreen
- **WHEN** the user opens fullscreen in either layout
- **THEN** the workspace including the layout switch and the inspector is shown fullscreen and the layout is re-fitted to the new size

#### Scenario: Empty network
- **WHEN** the router reports no devices
- **THEN** the router is still drawn and the stage shows "Noch keine Geräte vorhanden"
