import SwiftUI

/// 数値を1つ表示するカード。値が nil のときは「データ未取得」と表示する（架空の値は出さない）
struct MetricCard: View {
    let title: String
    let systemImage: String
    let value: String?
    var unit: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let value {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(.title2.bold())
                    Text(unit).font(.subheadline).foregroundStyle(.secondary)
                }
            } else {
                Text("データ未取得")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// 準備中の機能を示す共通の表示
struct ComingSoonView: View {
    let message: String

    var body: some View {
        ContentUnavailableView("準備中", systemImage: "hammer", description: Text(message))
    }
}
