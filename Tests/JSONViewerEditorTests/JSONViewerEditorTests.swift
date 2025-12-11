import XCTest
@testable import JSONViewerEditor

final class JSONViewerEditorTests: XCTestCase {
    func testJSONNodeLeaf() {
        let node = JSONNode(json: "hello", key: "greeting")
        XCTAssertEqual(node.displayKey, "greeting")
        XCTAssertEqual(node.displayValue, "hello")
        XCTAssertFalse(node.isExpandable)
    }
}
