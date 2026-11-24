import SwiftUI

@main
struct MyHealthAIApp: App {
    @State private var healthKit = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(healthKit)
        }
    }
}
