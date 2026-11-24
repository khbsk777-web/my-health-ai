import Foundation
import HealthKit
import Observation

/// Appleヘルスケア（HealthKit）との連携を担当する部品。
/// このアプリはデータを「読むだけ」で、ヘルスケアに書き込むことはしない。
@MainActor
@Observable
final class HealthKitManager {

    /// 連携の状態
    enum ConnectionState: Equatable {
        case checking       // 確認中
        case unavailable    // この端末ではヘルスケアが使えない
        case notRequested   // まだ許可を求めていない
        case requested      // 許可画面は表示済み（項目ごとのオン/オフはiOSの仕様で分からない）
        case unknown        // 状態が分からない
    }

    private let store = HKHealthStore()

    private(set) var state: ConnectionState = .checking
    private(set) var lastError: String?

    /// 読み取りたいデータの種類（表示用の名前つき）
    struct ReadItem: Identifiable {
        let name: String
        let type: HKObjectType
        var id: String { name }

        init(_ name: String, _ type: HKObjectType) {
            self.name = name
            self.type = type
        }
    }

    static var readItems: [ReadItem] {
        var items: [ReadItem] = [
            ReadItem("睡眠（時間・ステージ）", HKCategoryType(.sleepAnalysis)),
            ReadItem("心拍数", HKQuantityType(.heartRate)),
            ReadItem("安静時心拍数", HKQuantityType(.restingHeartRate)),
            ReadItem("心拍変動（HRV）", HKQuantityType(.heartRateVariabilitySDNN)),
            ReadItem("呼吸数", HKQuantityType(.respiratoryRate)),
            ReadItem("血中酸素", HKQuantityType(.oxygenSaturation)),
            ReadItem("睡眠中の手首皮膚温", HKQuantityType(.appleSleepingWristTemperature)),
            ReadItem("歩数", HKQuantityType(.stepCount)),
            ReadItem("歩行・ランニング距離", HKQuantityType(.distanceWalkingRunning)),
            ReadItem("アクティブエネルギー（消費カロリー）", HKQuantityType(.activeEnergyBurned)),
            ReadItem("運動時間", HKQuantityType(.appleExerciseTime)),
            ReadItem("ワークアウト", HKObjectType.workoutType()),
        ]
        if #available(iOS 18.0, *) {
            items.append(ReadItem("呼吸の乱れ", HKQuantityType(.appleSleepingBreathingDisturbances)))
        }
        return items
    }

    static var readTypes: Set<HKObjectType> {
        Set(readItems.map { $0.type })
    }

    /// 現在の連携状態を確認する
    func refreshStatus() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            state = .unavailable
            return
        }
        do {
            let status = try await store.statusForAuthorizationRequest(toShare: [], read: Self.readTypes)
            switch status {
            case .shouldRequest: state = .notRequested
            case .unnecessary: state = .requested
            default: state = .unknown
            }
        } catch {
            state = .unknown
            lastError = error.localizedDescription
        }
    }

    /// ヘルスケアの許可画面を表示する
    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            state = .unavailable
            return
        }
        lastError = nil
        do {
            try await store.requestAuthorization(toShare: [], read: Self.readTypes)
            await refreshStatus()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
