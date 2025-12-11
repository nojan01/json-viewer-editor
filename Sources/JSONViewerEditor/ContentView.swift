import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: DocumentStore
    @State private var searchText: String = ""

    var body: some View {
        NavigationView {
            SidebarView(searchText: $searchText)
            Text("Wähle oder lade eine JSON-Datei…")
                .foregroundColor(.secondary)
        }
        .navigationTitle("JSON Viewer/Editor")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    store.openDocument()
                } label: {
                    Label("Datei öffnen", systemImage: "folder")
                }
            }
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: "Volltextsuche")
    }
}

struct SidebarView: View {
    @EnvironmentObject private var store: DocumentStore
    @Binding var searchText: String

    var body: some View {
        List(selection: $store.selection) {
            ForEach(store.nodes) { node in
                TreeNodeView(node: node, searchText: searchText)
            }
        }
        .listStyle(.sidebar)
    }
}

struct TreeNodeView: View {
    let node: JSONNode
    let searchText: String

    var body: some View {
        DisclosureGroup(isExpanded: .constant(node.isExpandable)) {
            ForEach(node.children) { child in
                TreeNodeView(node: child, searchText: searchText)
            }
        } label: {
            HStack {
                Text(node.displayKey)
                    .fontWeight(node.matches(searchText) ? .semibold : .regular)
                Spacer()
                Text(node.displayValue)
                    .foregroundColor(.secondary)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(DocumentStore.sample())
}
