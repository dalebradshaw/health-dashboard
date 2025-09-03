watchOS Extension Setup (manual in Xcode)

1) Open `mobile/ios/mobile.xcodeproj` in Xcode.
2) File > New > Target… > WatchOS > Watch App (App) and name it `Watchmobile`.
   - Check “Include Notification Scene” only if you need it.
   - Do NOT embed without iOS app (keep default embedded with iOS app).
3) Capabilities:
   - In the watch Extension target: enable HealthKit capability (adds `com.apple.developer.healthkit` entitlement).
   - In the Watch App target: no special capability needed beyond default.
4) Background delivery:
   - In Extension, request read authorization for: heart rate, workouts, active energy, etc.
   - Create `HKObserverQuery` + `HKAnchoredObjectQuery` to fetch deltas.
   - Consider `HKWorkoutSession` for workout/live HR.
5) Phone ↔ Watch communication:
   - Use `WCSession` to message the iOS app or transfer files with sample batches.
   - Alternatively, rely solely on iPhone HealthKit + background delivery (simpler for MVP).
6) App groups (optional): if you need shared storage between app/extension.

Minimal sample (pseudo):
```
let store = HKHealthStore()
store.requestAuthorization(toShare: nil, read: readTypes) { ok, err in
  store.enableBackgroundDelivery(for: heartRateType, frequency: .immediate) { ok, err in }
  let obs = HKObserverQuery(sampleType: heartRateType, predicate: nil) { _, completion, _ in
    // run anchored query and send to phone via WCSession
    completion()
  }
  store.execute(obs)
}
```

Build/run the Watch app on a paired simulator or device. Ensure both iOS app and Watch Extension are signed with the same team.

