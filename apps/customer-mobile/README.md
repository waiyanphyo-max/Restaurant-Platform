# Customer Android project

This is a separate Expo/React Native application project for a restaurant's account-based home delivery customers. It is not a marketplace app and cannot switch restaurants at runtime. The build embeds one restaurant ID and public brand; M1 does not implement ordering or authentication screens.

Set `RESTAURANT_SLUG`, `MOBILE_ENV=staging|production`, and `PUBLIC_API_BASE_URL` to select a real file in [`configs/restaurants`](../../configs/restaurants/README.md). A real production build requires the restaurant's unique Customer Android application ID and approved brand assets. Missing configuration fails the build. Do not put secrets in Expo `extra` or other client configuration.

From the repository root, `npm run typecheck -w @restaurant-platform/customer-mobile`, `npm run lint -w @restaurant-platform/customer-mobile`, and `npm run test -w @restaurant-platform/customer-mobile` validate this starter. `npm run build:starter -w @restaurant-platform/customer-mobile` exports a development-only Android JavaScript bundle using the explicit fixture; it does not produce an APK. `npm run android -w @restaurant-platform/customer-mobile` generates/runs the native Android project when the Android SDK is installed and a real tenant is selected.

The production Android package and icon are selected in `app.config.js` from the real build config. This project remains independent from `apps/operations-mobile`; each restaurant receives a different Customer and Operations application ID. Backend data remains scoped by the embedded restaurant ID and authenticated customer identity when those features are implemented.
