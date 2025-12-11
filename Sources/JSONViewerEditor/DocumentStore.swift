import SwiftUI
import UniformTypeIdentifiers

final class DocumentStore: ObservableObject {
    @Published var nodes: [JSONNode] = []
    @Published var selection: JSONNode.ID?
    @Published var fileName: String = ""

    private let decoder = JSONDecoder()

    func openDocument() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.load(url: url)
        }
    }

    func load(url: URL) {
        do {
            let data = try Data(contentsOf: url)
            let json = try JSONSerialization.jsonObject(with: data, options: [])
            let root = JSONNode(json: json, key: url.lastPathComponent)
            DispatchQueue.main.async {
                self.nodes = [root]
                self.fileName = url.lastPathComponent
            }
        } catch {
            print("Fehler beim Laden: \(error)")
        }
    }

    static func sample() -> DocumentStore {
        let store = DocumentStore()
        let sample: [String: Any] = ["hello": "world", "items": [1, 2, 3]]
        store.nodes = [JSONNode(json: sample, key: "sample.json")]
        store.fileName = "sample.json"
        return store
    }
}

extension UTType {
    static var json: UTType { UTType(importedAs: "public.json") }
}
