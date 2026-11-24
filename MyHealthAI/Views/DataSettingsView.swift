import SwiftUI

/// ⑤ データ管理画面：ヘルスケア連携・プライバシー
struct DataSettingsView: View {
    @Environment(HealthKitManager.self) private var healthKit
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Label("連携状態", systemImage: "heart.text.square")
                        Spacer()
                        Text(statusText)
                            .foregroundStyle(statusColor)
                    }

                    if healthKit.state == .notRequested {
                        Button {
                            Task { await healthKit.requestAuthorization() }
                        } label: {
                            Label("ヘルスケアと連携する", systemImage: "link")
                        }
                    }

                    if healthKit.state == .requested {
                        Button {
                            openURL(URL(string: "x-apple-health://")!)
                        } label: {
                            Label("ヘルスケアアプリで許可を変更", systemImage: "arrow.up.forward.app")
                        }
                    }

                    if let error = healthKit.lastError {
                        Text("エラー：\(error)")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Appleヘルスケア連携")
                } footer: {
                    Text("iOSのプライバシー保護のため、どの項目を許可したかはアプリから確認できません。変更はヘルスケアアプリ →「共有」→「アプリ」→「MY HEALTH AI」で行えます。")
                }

                Section("読み取るデータ（書き込みはしません）") {
                    ForEach(HealthKitManager.readItems) { item in
                        Text(item.name)
                    }
                }

                Section("プライバシー") {
                    Label("健康データは端末の中だけで処理します", systemImage: "lock")
                    Label("音声は外部に送信しません", systemImage: "mic.slash")
                }

                Section("アプリ情報") {
                    LabeledContent("バージョン", value: Bundle.main.appVersion)
                }
            }
            .navigationTitle("データ管理")
            .task { await healthKit.refreshStatus() }
        }
    }

    private var statusText: String {
        switch healthKit.state {
        case .checking: return "確認中…"
        case .unavailable: return "この端末では使えません"
        case .notRequested: return "未連携"
        case .requested: return "連携済み"
        case .unknown: return "不明"
        }
    }

    private var statusColor: Color {
        switch healthKit.state {
        case .requested: return .green
        case .unavailable, .unknown: return .red
        default: return .secondary
        }
    }
}

extension Bundle {
    var appVersion: String {
        let version = infoDictionary?["CFBundleShortVersionString"] as? String ?? "-"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "-"
        return "\(version) (\(build))"
    }
}
