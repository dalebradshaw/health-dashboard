import Foundation
import HealthKit
import React

@objc(HealthAnchorsModule)
class HealthAnchorsModule: NSObject {
  private let store = HKHealthStore()
  private let ud = UserDefaults.standard

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(requestAuthorization:resolver:rejecter:)
  func requestAuthorization(_ types: [String], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard HKHealthStore.isHealthDataAvailable() else { resolve(false); return }
    let read = Set(types.compactMap { self.sampleType(for: $0) })
    store.requestAuthorization(toShare: nil, read: read) { ok, err in
      if let err = err { reject("auth_error", err.localizedDescription, err); return }
      resolve(ok)
    }
  }

  @objc(sync:resolver:rejecter:)
  func sync(_ types: [String], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let qtyTypes = types.compactMap { self.quantityType(for: $0) }
    let catTypes = types.compactMap { self.categoryType(for: $0) }
    if qtyTypes.isEmpty && catTypes.isEmpty { resolve(["samples": []]); return }

    let group = DispatchGroup()
    var out: [[String: Any]] = []
    var deletesOut: [[String: Any]] = []
    var lastError: Error?

    // Quantity types (HR, HRV, steps, energy)
    for qt in qtyTypes {
      group.enter()
      let anchorKey = self.anchorKey(for: qt)
      var anchor: HKQueryAnchor? = nil
      if let data = ud.data(forKey: anchorKey) {
        anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
      }

      let query = HKAnchoredObjectQuery(type: qt, predicate: nil, anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] (_, samplesOrNil, deletedObjects, newAnchor, error) in
        defer { group.leave() }
        if let error = error { lastError = error; return }
        guard let strongSelf = self else { return }
        // Do not persist here; return token to JS to commit after successful upload
        if let newAnchor = newAnchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
          let token = data.base64EncodedString()
          out.append(["type": "__anchor__", "forType": strongSelf.typeString(for: qt), "token": token])
        }
        guard let samples = samplesOrNil as? [HKQuantitySample] else { return }
        let unit = strongSelf.unit(for: qt)
        for s in samples {
          let val = s.quantity.doubleValue(for: unit)
          let item: [String: Any] = [
            "type": strongSelf.typeString(for: qt),
            "start": ISO8601DateFormatter().string(from: s.startDate),
            "end": ISO8601DateFormatter().string(from: s.endDate),
            "value": val,
            "unit": strongSelf.unitString(for: qt),
            "uuid": s.uuid.uuidString,
          ]
          out.append(item)
        }
        if let dels = deletedObjects {
          for d in dels { deletesOut.append(["type": strongSelf.typeString(for: qt), "uuid": d.uuid.uuidString]) }
        }
      }
      store.execute(query)
    }

    // Category types (Sleep)
    for ct in catTypes {
      group.enter()
      let anchorKey = "HKAnchor-\(ct.identifier)"
      var anchor: HKQueryAnchor? = nil
      if let data = ud.data(forKey: anchorKey) {
        anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
      }
      let query = HKAnchoredObjectQuery(type: ct, predicate: nil, anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] (_, samplesOrNil, deletedObjects, newAnchor, error) in
        defer { group.leave() }
        if let error = error { lastError = error; return }
        guard let strongSelf = self else { return }
        // Defer persistence; return token for commit
        if let newAnchor = newAnchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
          let token = data.base64EncodedString()
          out.append(["type": "__anchor__", "forType": "sleep", "token": token])
        }
        guard let samples = samplesOrNil as? [HKCategorySample] else { return }
        for s in samples {
          let mins = s.endDate.timeIntervalSince(s.startDate) / 60.0
          if let stage = HKCategoryValueSleepAnalysis(rawValue: s.value) {
            var t: String? = nil
            switch stage {
            case .asleepREM: t = "sleepREM"
            case .asleepDeep: t = "sleepDeep"
            case .asleepCore: t = "sleepCore" // iOS 16+
            case .asleep: t = "sleepCore" // map unspecified asleep to core
            default: t = nil // ignore awake/inBed
            }
            if let tp = t {
              let item: [String: Any] = [
                "type": tp,
                "start": ISO8601DateFormatter().string(from: s.startDate),
                "end": ISO8601DateFormatter().string(from: s.endDate),
                "value": mins,
                "unit": "min",
                "uuid": s.uuid.uuidString,
              ]
              out.append(item)
            }
          }
        }
        if let dels = deletedObjects {
          for d in dels { deletesOut.append(["type": "sleep", "uuid": d.uuid.uuidString]) }
        }
      }
      store.execute(query)
    }

    group.notify(queue: .main) {
      if let err = lastError { reject("sync_error", err.localizedDescription, err); return }
      // Split out anchors and data for clarity
      var samples: [[String: Any]] = []
      var anchors: [String: String] = [:]
      for item in out {
        if let t = item["type"] as? String, t == "__anchor__" {
          if let ft = item["forType"] as? String, let token = item["token"] as? String { anchors[ft] = token }
        } else {
          samples.append(item)
        }
      }
      resolve(["samples": samples, "anchors": anchors, "deletes": deletesOut])
    }
  }

  // MARK: - Helpers
  private func sampleType(for t: String) -> HKSampleType? {
    if let q = quantityType(for: t) { return q }
    if let c = categoryType(for: t) { return c }
    return nil
  }

  private func quantityType(for t: String) -> HKQuantityType? {
    switch t {
    case "heartRate": return HKObjectType.quantityType(forIdentifier: .heartRate)
    case "hrv": return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
    case "steps": return HKObjectType.quantityType(forIdentifier: .stepCount)
    case "activeEnergyBurned": return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
    default: return nil
    }
  }

  private func categoryType(for t: String) -> HKCategoryType? {
    switch t {
    case "sleep": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    default: return nil
    }
  }

  private func unit(for qt: HKQuantityType) -> HKUnit {
    switch qt {
    case HKObjectType.quantityType(forIdentifier: .heartRate)!: return HKUnit.count().unitDivided(by: HKUnit.minute())
    case HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!: return HKUnit.secondUnit(with: .milli)
    case HKObjectType.quantityType(forIdentifier: .stepCount)!: return HKUnit.count()
    case HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!: return HKUnit.kilocalorie()
    default: return HKUnit.count()
    }
  }

  private func unitString(for qt: HKQuantityType) -> String {
    switch qt {
    case HKObjectType.quantityType(forIdentifier: .heartRate)!: return "count/min"
    case HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!: return "ms"
    case HKObjectType.quantityType(forIdentifier: .stepCount)!: return "count"
    case HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!: return "kcal"
    default: return "count"
    }
  }

  private func typeString(for qt: HKQuantityType) -> String {
    switch qt {
    case HKObjectType.quantityType(forIdentifier: .heartRate)!: return "heartRate"
    case HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!: return "hrv"
    case HKObjectType.quantityType(forIdentifier: .stepCount)!: return "steps"
    case HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!: return "activeEnergyBurned"
    default: return "unknown"
    }
  }

  private func anchorKey(for qt: HKQuantityType) -> String {
    return "HKAnchor-\(typeString(for: qt))"
  }

  private func anchorKeyForTypeString(_ t: String) -> String? {
    if let qt = quantityType(for: t) { return anchorKey(for: qt) }
    if t == "sleep" { return "HKAnchor-\(HKCategoryTypeIdentifier.sleepAnalysis.rawValue)" }
    return nil
  }

  @objc(commitAnchor:token:resolver:rejecter:)
  func commitAnchor(_ type: String, token: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let key = anchorKeyForTypeString(type) else { resolve(false); return }
    guard let data = Data(base64Encoded: token) else { resolve(false); return }
    // Validate token decodes to an anchor
    if (try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)) != nil {
      ud.set(data, forKey: key)
      resolve(true)
    } else {
      resolve(false)
    }
  }
}
