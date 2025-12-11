import Foundation

struct JSONNode: Identifiable {
    let id = UUID()
    let key: String
    let valueDescription: String
    let children: [JSONNode]

    init(json: Any, key: String = "") {
        self.key = key
        if let dict = json as? [String: Any] {
            self.valueDescription = "Objekt (\(dict.count))"
            self.children = dict.keys.sorted().map { k in
                JSONNode(json: dict[k] as Any, key: k)
            }
        } else if let array = json as? [Any] {
            self.valueDescription = "Array (\(array.count))"
            self.children = array.enumerated().map { idx, item in
                JSONNode(json: item, key: "[\(idx)]")
            }
        } else if let str = json as? String {
            self.valueDescription = str
            self.children = []
        } else if let num = json as? NSNumber {
            self.valueDescription = "\(num)"
            self.children = []
        } else if json is NSNull {
            self.valueDescription = "null"
            self.children = []
        } else {
            self.valueDescription = "(unbekannt)"
            self.children = []
        }
    }

    var displayKey: String {
        key.isEmpty ? "root" : key
    }

    var displayValue: String {
        valueDescription
    }

    var isExpandable: Bool { !children.isEmpty }

    func matches(_ text: String) -> Bool {
        guard !text.isEmpty else { return false }
        let hay = (key + " " + valueDescription).lowercased()
        return hay.contains(text.lowercased())
    }
}
