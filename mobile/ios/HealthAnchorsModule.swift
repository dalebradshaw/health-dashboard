import Foundation
import HealthKit

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
    let sampleTypes = types.compactMap { self.quantityType(for: $0) }
    if sampleTypes.isEmpty { resolve(["samples": []]); return }

    let group = DispatchGroup()
    var out: [[String: Any]] = []
    var lastError: Error?

    for qt in sampleTypes {
      group.enter()
      let anchorKey = self.anchorKey(for: qt)
      var anchor: HKQueryAnchor? = nil
      if let data = ud.data(forKey: anchorKey) {
        anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
      }

      let query = HKAnchoredObjectQuery(type: qt, predicate: nil, anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] (_, samplesOrNil, _, newAnchor, error) in
        defer { group.leave() }
        if let error = error { lastError = error; return }
        guard let strongSelf = self else { return }
        if let newAnchor = newAnchor, let data = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
          strongSelf.ud.set(data, forKey: anchorKey)
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
      }
      store.execute(query)
    }

    group.notify(queue: .main) {
      if let err = lastError { reject("sync_error", err.localizedDescription, err); return }
      resolve(["samples": out])
    }
  }

  // MARK: - Helpers
  private func sampleType(for t: String) -> HKSampleType? {
    return quantityType(for: t)
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
}
