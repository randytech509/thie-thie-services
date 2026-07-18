# ThieThie Services Firestore Security Specification (TDD)

## 1. Data Invariants
1. **User Ownership**: A user profile document `/users/{userId}` can only be read or written by the authenticated user whose `uid` matches `{userId}`.
2. **Verified Users Only**: Standard writes (create, update) require a verified email token (`request.auth.token.email_verified == true`).
3. **No Cross-User Access**: Coupons in `/users/{userId}/coupons/{couponId}` are strictly owned by `{userId}`. No other authenticated user can read or write to them.
4. **Relational Consistency for Orders**: Orders `/orders/{orderId}` must contain the `userId` field matching the authenticated user's `uid`. No user can read or write orders belonging to another user.
5. **No System Overwrites**: Once an order reaches a terminal state or is created, core fields like `orderId`, `userId`, `createdAt`, `priceUSD` are immutable.
6. **Limit Exhaustion (Denial of Wallet)**: Document IDs must have sizes $\le 128$ and conform to the regular expression `^[a-zA-Z0-9_\-]+$`.

---

## 2. The "Dirty Dozen" Malicious Payloads

We design 12 specific payloads intended to breach our database security. Each of these must return `PERMISSION_DENIED` under our fortress rules.

### Payload 1: Identity Spoofing - Cross-User Profile Write
- **Attack**: Authenticated User `user_A` tries to overwrite User `user_B`'s profile at `/users/user_B`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 2: Privilege Escalation - Email Verification Spoofing
- **Attack**: Authenticated User with unverified email tries to register/create profile.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 3: Resource Poisoning - Over-Sized Document ID (Denial of Wallet)
- **Attack**: Authenticated User tries to create an order with a document ID of 1KB of junk characters.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 4: Identity Spoofing - Order Hijacking on Create
- **Attack**: Authenticated User `user_A` tries to create an order at `/orders/order_1` with `userId = "user_B"`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 5: Integrity Breach - Modifying Immutable Order Creator Fields
- **Attack**: Authenticated User `user_A` tries to update an existing order's `userId` from `"user_A"` to `"user_B"`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 6: Integrity Breach - Forging Client Timestamps
- **Attack**: User tries to set `createdAt` to a custom timestamp in the past instead of `request.time`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 7: State Shortcutting - Direct Order Completion
- **Attack**: Standard user tries to create or update an order with status directly set to `"completed"` without admin verification.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 8: PII Blanket Leak - Scraping All User Profiles
- **Attack**: Authenticated user tries to run a blanket list query on `/users` without specifying their own UID filter.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 9: Cross-User Coupon Theft
- **Attack**: User `user_A` tries to read the coupons subcollection of User `user_B` at `/users/user_B/coupons/coupon_1`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 10: Value Poisoning - Injecting Negative Points
- **Attack**: User tries to update their profile with negative points `thieThiePoints = -9999`.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 11: Value Poisoning - Setting Non-Numeric/Malformed Types
- **Attack**: User tries to set their `displayName` to a boolean or an object of size 1MB.
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 12: Orphaned Subcollection Write
- **Attack**: User tries to write a coupon at `/users/non_existent_user/coupons/coupon_1` where the parent user profile does not exist.
- **Expected Outcome**: `PERMISSION_DENIED`
