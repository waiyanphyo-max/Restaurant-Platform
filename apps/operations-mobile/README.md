# Operations Android project

This is a separate Expo/React Native application project for Owner, Manager, Staff, and Driver workflows. It is not a marketplace app or a customer-ordering app. The build embeds one restaurant ID and public brand; there is no tenant picker or full operational feature set in M1.

Set `RESTAURANT_SLUG`, `MOBILE_ENV=staging|production`, and `PUBLIC_API_BASE_URL` to select a real file in [`configs/restaurants`](../../configs/restaurants/README.md). A real production build requires the restaurant's unique Operations Android application ID and approved brand assets. Missing configuration fails the build. Do not put secrets in Expo `extra` or other client configuration.

From the repository root, `npm run typecheck -w @restaurant-platform/operations-mobile`, `npm run lint -w @restaurant-platform/operations-mobile`, and `npm run test -w @restaurant-platform/operations-mobile` validate this starter. `npm run build:starter -w @restaurant-platform/operations-mobile` exports a development-only Android JavaScript bundle using the explicit fixture; it does not produce an APK. `npm run android -w @restaurant-platform/operations-mobile` generates/runs the native Android project when the Android SDK is installed and a real tenant is selected.

The production Android package and icon are selected in `app.config.js` from the real build config. This project remains independent from `apps/customer-mobile`; each restaurant receives a different Operations and Customer application ID. Backend authorization still determines which signed-in members can perform each action.
