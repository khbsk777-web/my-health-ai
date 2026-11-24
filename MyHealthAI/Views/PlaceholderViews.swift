import SwiftUI

/// ② 睡眠分析画面（STEP 5・7で実装）
struct SleepView: View {
    var body: some View {
        NavigationStack {
            ComingSoonView(message: "睡眠時間のグラフ・睡眠ステージ・いびき検知結果をここに表示します。")
                .navigationTitle("睡眠")
        }
    }
}

/// ③ AI健康分析画面（STEP 6で実装）
struct AnalysisView: View {
    var body: some View {
        NavigationStack {
            ComingSoonView(message: "7日間・30日間の比較とAIの健康レポートをここに表示します。")
                .navigationTitle("AI分析")
        }
    }
}

/// ④ 運動管理画面（STEP 5で実装）
struct ExerciseView: View {
    var body: some View {
        NavigationStack {
            ComingSoonView(message: "歩数・消費カロリー・運動時間・ジムやバスケットボールの履歴をここに表示します。")
                .navigationTitle("運動")
        }
    }
}

/// ⑤ データ管理画面（STEP 4で実装）
struct DataSettingsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Appleヘルスケア連携") {
                    Label("連携状態：未設定", systemImage: "heart.text.square")
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
