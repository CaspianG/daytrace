import AppKit
import ApplicationServices
import Foundation

func argumentValue(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}

final class CallbackTransport {
    private let stream: OutputStream
    private let lock = NSLock()

    init?(port: Int) {
        guard (1...65535).contains(port) else { return nil }
        stream = OutputStream(toHost: "127.0.0.1", port: port)
        stream.schedule(in: .current, forMode: .default)
        stream.open()
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline && (stream.streamStatus == .notOpen || stream.streamStatus == .opening) {
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
        guard stream.streamStatus == .open || stream.streamStatus == .writing else {
            stream.close()
            stream.remove(from: .current, forMode: .default)
            return nil
        }
    }

    func write(line: String) -> Bool {
        guard let data = "\(line)\n".data(using: .utf8) else { return false }
        lock.lock()
        defer { lock.unlock() }
        return data.withUnsafeBytes { rawBuffer in
            guard let base = rawBuffer.bindMemory(to: UInt8.self).baseAddress else { return false }
            var offset = 0
            while offset < data.count {
                let written = stream.write(base.advanced(by: offset), maxLength: data.count - offset)
                if written <= 0 { return false }
                offset += written
            }
            return true
        }
    }

    deinit {
        stream.close()
        stream.remove(from: .current, forMode: .default)
    }
}

let callbackPort = Int(argumentValue("--callback-port") ?? "")
let callbackToken = String(argumentValue("--callback-token") ?? "").prefix(128)
var callbackTransport = callbackPort.flatMap { CallbackTransport(port: $0) }

@discardableResult
func sendCallback(_ payload: [String: Any]) -> Bool {
    guard let transport = callbackTransport,
          JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return false }
    return transport.write(line: line)
}

func accessibilityTrusted(prompt: Bool) -> Bool {
    if !prompt { return AXIsProcessTrusted() }
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options = [promptKey: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

if CommandLine.arguments.contains("--check-accessibility") || CommandLine.arguments.contains("--request-accessibility") {
    let prompt = CommandLine.arguments.contains("--request-accessibility")
    var trusted = accessibilityTrusted(prompt: prompt)
    if !trusted && prompt {
        // The prompt is asynchronous. Keep the exact helper identity alive while
        // the user enables its switch, and report success without a relaunch.
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
            if AXIsProcessTrusted() { trusted = true; break }
        }
    }
    if callbackPort != nil && !callbackToken.isEmpty {
        _ = sendCallback([
            "type": "probe", "token": String(callbackToken), "trusted": trusted,
            "pid": ProcessInfo.processInfo.processIdentifier,
            "error": trusted ? "" : "permission-required",
        ])
    }
    exit(trusted ? 0 : 77)
}

struct Snapshot: Equatable {
    let app: String
    let process: String
    let title: String
    let context: String
}

let collectTitles = argumentValue("--collect-titles").map { $0 != "0" } ?? (ProcessInfo.processInfo.environment["DAYTRACE_COLLECT_TITLES"] != "0")
let collectInput = argumentValue("--collect-input").map { $0 != "0" } ?? (ProcessInfo.processInfo.environment["DAYTRACE_COLLECT_INPUT"] != "0")
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
    if let data = try? encoder.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) {
        if callbackTransport != nil {
            if !callbackTransport!.write(line: line) { exit(0) }
        } else {
            print(line); fflush(stdout)
        }
    }
}

func flush(value: Snapshot? = nil) {
    lock.lock(); let inputValue = inputs; let clickValue = clicks; inputs = 0; clicks = 0; let current = value ?? active; lock.unlock()
    if inputValue > 0 { emit(kind: "input", count: inputValue, value: current) }
    if clickValue > 0 { emit(kind: "click", count: clickValue, value: current) }
}

func sample(force: Bool = false) {
    lock.lock(); let idleBeforeSample = isIdle; lock.unlock()
    if idleBeforeSample && !force { return }
    let current = autoreleasepool { snapshot() }
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
    if !idleNow && wasIdle { emit(kind: "resume", count: 1, value: current); sample(force: true) }
}

func heartbeat() {
    if !AXIsProcessTrusted() {
        flush()
        _ = sendCallback(["type": "status", "code": 77, "error": "permission-required"])
        exit(77)
    }
    lock.lock(); let idle = isIdle; let current = active; lock.unlock()
    if !idle { emit(kind: "heartbeat", count: 1, value: current) }
}

let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let eventTap { CGEvent.tapEnable(tap: eventTap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    lock.lock()
    if type == .keyDown { inputs += 1 }
    if type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown { clicks += 1 }
    lock.unlock()
    return Unmanaged.passUnretained(event)
}

guard accessibilityTrusted(prompt: false) else {
    _ = sendCallback(["type": "status", "token": String(callbackToken), "code": 77, "error": "permission-required"])
    fputs("Daytrace requires macOS Accessibility permission.\n", stderr)
    exit(77)
}

if CommandLine.arguments.contains("--stream-events") {
    guard callbackTransport != nil, !callbackToken.isEmpty else {
        fputs("Daytrace collector callback is missing.\n", stderr)
        exit(70)
    }
    guard sendCallback([
        "type": "ready", "token": String(callbackToken),
        "pid": ProcessInfo.processInfo.processIdentifier,
    ]) else { exit(70) }
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

active = autoreleasepool { snapshot() }; isIdle = secondsSinceInput() >= idleThreshold; emit(kind: "foreground", count: 1, value: active)
if isIdle { emit(kind: "idle", count: 1, value: active) }
let center = NSWorkspace.shared.notificationCenter
let observer = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in sample(force: false) }
let sampleTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in sample(force: false) }
let flushTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { _ in flush() }
let presenceTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in samplePresence() }
let heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in heartbeat() }
let livenessTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
    if callbackTransport != nil && !sendCallback(["type": "liveness"]) { exit(0) }
}
RunLoop.main.run()
center.removeObserver(observer); sampleTimer.invalidate(); flushTimer.invalidate(); presenceTimer.invalidate(); heartbeatTimer.invalidate(); livenessTimer.invalidate(); flush()
