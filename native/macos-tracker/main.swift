import AppKit
import ApplicationServices
import Foundation

func accessibilityTrusted(prompt: Bool) -> Bool {
    if !prompt { return AXIsProcessTrusted() }
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options = [promptKey: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

if CommandLine.arguments.contains("--check-accessibility") || CommandLine.arguments.contains("--request-accessibility") {
    let prompt = CommandLine.arguments.contains("--request-accessibility")
    let trusted = accessibilityTrusted(prompt: prompt)
    if prompt && !trusted {
        // The macOS consent prompt is asynchronous. Keep the helper alive long
        // enough for the system to attribute and present it before we exit.
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
    }
    exit((trusted || AXIsProcessTrusted()) ? 0 : 77)
}

struct Snapshot: Equatable {
    let app: String
    let process: String
    let title: String
    let context: String
}

let collectTitles = ProcessInfo.processInfo.environment["DAYTRACE_COLLECT_TITLES"] != "0"
let collectInput = ProcessInfo.processInfo.environment["DAYTRACE_COLLECT_INPUT"] != "0"
let encoder = JSONSerialization.self
var active = Snapshot(app: "Application", process: "", title: "", context: "other")
var inputs = 0
var clicks = 0
var isIdle = false
let idleThreshold: TimeInterval = 5 * 60
let lock = NSLock()
var eventTap: CFMachPort?

func context(for bundle: String, name: String) -> String {
    let value = "\(bundle) \(name)".lowercased()
    if value.contains("safari") || value.contains("chrome") || value.contains("firefox") || value.contains("edge") || value.contains("brave") { return "browser" }
    if value.contains("telegram") || value.contains("slack") || value.contains("discord") || value.contains("whatsapp") || value.contains("signal") { return "messaging" }
    if value.contains("xcode") || value.contains("visual studio code") || value.contains("jetbrains") || value.contains("android studio") { return "editor" }
    return "other"
}

func snapshot() -> Snapshot {
    guard let app = NSWorkspace.shared.frontmostApplication else { return Snapshot(app: "Application", process: "", title: "", context: "other") }
    let name = app.localizedName ?? "Application"
    let bundle = app.bundleIdentifier ?? ""
    var title = ""
    if collectTitles {
        let element = AXUIElementCreateApplication(app.processIdentifier)
        var windowValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &windowValue) == .success, let windowValue {
            var titleValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(windowValue as! AXUIElement, kAXTitleAttribute as CFString, &titleValue) == .success {
                title = (titleValue as? String ?? "").replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }
    return Snapshot(app: name, process: bundle, title: title, context: context(for: bundle, name: name))
}

func emit(kind: String, count: Int, value: Snapshot) {
    let payload: [String: Any] = [
        "at": ISO8601DateFormatter().string(from: Date()), "kind": kind, "count": count,
        "app": value.app, "process": value.process, "title": value.title, "context": value.context, "tabCount": 0,
    ]
    if let data = try? encoder.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) { print(line); fflush(stdout) }
}

func flush(value: Snapshot? = nil) {
    lock.lock(); let inputValue = inputs; let clickValue = clicks; inputs = 0; clicks = 0; let current = value ?? active; lock.unlock()
    if inputValue > 0 { emit(kind: "input", count: inputValue, value: current) }
    if clickValue > 0 { emit(kind: "click", count: clickValue, value: current) }
}

func sample(force: Bool = false) {
    let current = snapshot()
    lock.lock(); let previous = active; active = current; let idle = isIdle; lock.unlock()
    if (force || current != previous) && !idle { flush(value: previous); emit(kind: "foreground", count: 1, value: current) }
}

func secondsSinceInput() -> TimeInterval {
    let types: [CGEventType] = [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown, .mouseMoved, .scrollWheel]
    return types.map { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) }.min() ?? 0
}

func samplePresence() {
    let idleNow = secondsSinceInput() >= idleThreshold
    lock.lock(); let wasIdle = isIdle; isIdle = idleNow; let current = active; lock.unlock()
    if idleNow && !wasIdle { flush(value: current); emit(kind: "idle", count: 1, value: current) }
    if !idleNow && wasIdle { emit(kind: "resume", count: 1, value: current) }
}

func heartbeat() {
    lock.lock(); let idle = isIdle; let current = active; lock.unlock()
    if !idle { emit(kind: "heartbeat", count: 1, value: current) }
}

let callback: CGEventTapCallBack = { _, type, event, _ in
    lock.lock()
    if type == .keyDown { inputs += 1 }
    if type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown { clicks += 1 }
    lock.unlock()
    return Unmanaged.passUnretained(event)
}

guard accessibilityTrusted(prompt: false) else {
    fputs("Daytrace requires macOS Accessibility permission.\n", stderr)
    exit(77)
}

if collectInput {
    let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.otherMouseDown.rawValue)
    eventTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly, eventsOfInterest: CGEventMask(mask), callback: callback, userInfo: nil)
    if let eventTap {
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: eventTap, enable: true)
    }
}

active = snapshot(); isIdle = secondsSinceInput() >= idleThreshold; emit(kind: "foreground", count: 1, value: active)
if isIdle { emit(kind: "idle", count: 1, value: active) }
let center = NSWorkspace.shared.notificationCenter
let observer = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in sample(force: false) }
let sampleTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in sample(force: false) }
let flushTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { _ in flush() }
let presenceTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { _ in samplePresence() }
let heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in heartbeat() }
RunLoop.main.run()
center.removeObserver(observer); sampleTimer.invalidate(); flushTimer.invalidate(); presenceTimer.invalidate(); heartbeatTimer.invalidate(); flush()
