# App widgets (after the 1.0 polish)

Inspired by docks where a pinned app's icon becomes its own live widget.
Agreed with the owner; to start once the 1.0 audit and stability work is done.

## Behaviour

- Opt-in per app: right-click a pinned app > "Show as widget". Two sizes:
  icon (with a small live detail) and wide (info plus mini buttons).
- The panel of each app widget has an "Open app ↗" link.
- Mini buttons on the wide card (for example new window, search).
- Revisit the dock tooltip style.

## First app widgets (local Windows data only, no accounts, no network)

- **Player (Spotify and others):** cover, title, controls on the card; the
  panel adds a draggable progress bar and volume. The standalone Media widget
  merges into this: the app that is playing becomes the widget.
- **Browser:** count and list of open windows with their active tab, switch
  between them, new / private window. Real tab lists would need an extension;
  not planned.
- **Calendar / Outlook:** day and next event through the Windows calendar
  permission, asked when the widget is turned on; without it, only the date.
  The standalone Calendar widget merges into this.
- **Badges:** optional notification access (UserNotificationListener) to
  count notifications per app. Never read or store their text.

## System widgets (one widget each)

- Wi-Fi: state and network list; connecting opens the Windows panel.
- Bluetooth: on/off and connected devices with battery.
- Settings: shortcut to Windows Settings and specific pages.

## Device notices

"Headphones connected · 100%" / "disconnected" show in the dynamic notch.
