import SwiftUI

/// ① ホーム画面（STEP 5でHealthKitの実データにつなぐ）
struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    MetricCard(title: "今日の健康スコア", systemImage: "gauge.medium", value: nil)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        MetricCard(title: "睡眠時間", systemImage: "bed.double", value: nil)
                        MetricCard(title: "安静時心拍", systemImage: "heart", value: nil)
                        MetricCard(title: "HRV", systemImage: "waveform.path.ecg", value: nil)
                        MetricCard(title: "歩数", systemImage: "figure.walk", value: nil)
                    }
                    MetricCard(title: "AIからの今日のアドバイス", systemImage: "sparkles", value: nil)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("MY HEALTH AI")
        }
    }
}

#Preview {
    HomeView()
}
