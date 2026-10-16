# Table-to-entity mapping

| PostgreSQL table | Entity class | Repository interface |
|---|---|---|
| `restaurants` | `Restaurant` | `RestaurantRepository` |
| `restaurant_settings` | `RestaurantSettings` | `RestaurantSettingsRepository` |
| `profiles` | `Profile` | `ProfileRepository` |
| `restaurant_members` | `RestaurantMember` | `RestaurantMemberRepository` |
| `user_devices` | `UserDevice` | `UserDeviceRepository` |
| `categories` | `Category` | `CategoryRepository` |
| `products` | `Product` | `ProductRepository` |
| `product_variants` | `ProductVariant` | `ProductVariantRepository` |
| `modifier_groups` | `ModifierGroup` | `ModifierGroupRepository` |
| `modifier_options` | `ModifierOption` | `ModifierOptionRepository` |
| `product_modifier_groups` | `ProductModifierGroup` (composite id) | `ProductModifierGroupRepository` |
| `dining_tables` | `DiningTable` | `DiningTableRepository` |
| `daily_queue_counters` | `DailyQueueCounter` | `DailyQueueCounterRepository` |
| `queue_tickets` | `QueueTicket` | `QueueTicketRepository` |
| `customer_addresses` | `CustomerAddress` | `CustomerAddressRepository` |
| `delivery_zones` | `DeliveryZone` | `DeliveryZoneRepository` |
| `orders` | `RestaurantOrder` | `RestaurantOrderRepository` |
| `order_items` | `OrderItem` | `OrderItemRepository` |
| `order_item_modifiers` | `OrderItemModifier` | `OrderItemModifierRepository` |
| `order_status_history` | `OrderStatusHistory` | `OrderStatusHistoryRepository` |
| `deliveries` | `Delivery` | `DeliveryRepository` |
| `delivery_status_history` | `DeliveryStatusHistory` | `DeliveryStatusHistoryRepository` |
| `payments` | `Payment` | `PaymentRepository` |
| `notifications` | `AppNotification` | `AppNotificationRepository` |
