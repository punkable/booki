# Booki themes and motion

Source: Microsoft's [WinUI theme resources](https://github.com/microsoft/microsoft-ui-xaml/blob/main/controls/dev/CommonStyles/Common_themeresources_any.xaml), inspected October 17, 2026. These are the actual Windows resource values, not a palette inferred from a screenshot.

| Role | Light | Dark |
| --- | --- | --- |
| Settings background | `#f3f3f3` | `#202020` |
| Dock / notch automatic acrylic tint | `#f3f3f3` | `#2c2c2c` |
| Elevated panel | translucent white | `#2c2c2c` |
| Taskbar matching | `#eeeeee` | `#202020` |
| Primary text | `#1b1b1b` | `#f5f5f5` |

WinUI names the dark elevated neutral `SolidBackgroundFillColorQuarternary`; its tertiary/secondary roles are `#282828` and `#1c1c1c`. Booki uses the elevated neutral for small translucent reading surfaces, rather than WinUI's near-black BaseAlt `#0a0a0a`. Accent/wallpaper tints mix with the base gray. User-picked colors remain user-picked. Black in shadows is not a background surface. High contrast and reduced transparency continue to take precedence.

A shared damped spring interpolates the capsule's width, height, position and corner radius together. The previous full-width checkpoint held height constant and then grew vertically; removing it eliminates that second stage. Both reveal and tuck use the same shape path on all four edges. CSS animation follows display refresh rather than a fixed 60 Hz JavaScript timer. No claim about measured frame rate or native GPU composition is made without Windows-device evidence. Reduced motion keeps the non-geometric fallback.
