# UXI-10 Operations navigation icons

Read-only exports of the Restaurant Platform Figma file `WTKlnQ51UsYuRX2md60Fbn`, reviewed on 21 November 2026. Icons occupy 24 × 24 native slots; semantic tinting follows the active restaurant palette.

| Asset | Figma component | Source and callsite |
| --- | --- | --- |
| home.png | `28:13` | Exact existing Customer UXI-08 export; Today tab |
| orders.png | `28:22` | Exact existing Customer UXI-08 export; Orders/Updates tab |
| account.png | `28:25` | Exact existing Customer UXI-08 export; Driver Account tab |
| delivery.png | `28:28` | Live Figma 24 × 24 PNG export; Delivery/Tasks tab |
| more.png | `28:31` | Live Figma 24 × 24 PNG export; More tab |
| food.png | `28:52` | Exact existing Customer UXI-08 export; CounterProductMedia missing/failed catalog-photo slot |

The Operations shell renders these local files through React Native Image. No temporary asset URL, sample restaurant logo or food preview is a runtime dependency. Current restaurant identity remains supplied by RuntimeBrandingProvider.
