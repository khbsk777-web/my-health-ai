import SwiftUI

/// 画面下のタブ（5画面）をまとめる画面
struct ContentView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("ホーム", systemImage: "heart.text.square") }
            SleepView()
                .tabItem { Label("睡眠", systemImage: "bed.double") }
            AnalysisView()
                .tabItem { Label("AI分析", systemImage: "sparkles") }
            ExerciseView()
                .tabItem { Label("運動", systemImage: "figure.run") }
            DataSettingsView()
                .tabItem { Label("データ", systemImage: "lock.shield") }
        }
    }
}

#Preview {
    ContentView()
}
