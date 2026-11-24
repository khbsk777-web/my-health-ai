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

// ⑤ データ管理画面は DataSettingsView.swift に移動しました（STEP 4）
