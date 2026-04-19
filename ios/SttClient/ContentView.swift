import SwiftUI
import AVFoundation

/// Minimal STT tester: POSTs WAV to FastAPI `/transcribe`.
/// Server default: Cactus **Parakeet TDT** (`cactus_transcribe`), not Gemma — that path is what does real ASR.
/// Set `STT_BACKEND=gemma` on the server only if you need Gemma 4 multimodal (weaker verbatim STT).
/// Simulator: run the API on the Mac with `HOST=0.0.0.0` and use the Mac’s **LAN IP** in the text field.
struct ContentView: View {
    @State private var baseURL = "http://127.0.0.1:8000"
    @State private var transcript = ""
    @State private var status = ""
    @State private var recorder: AVAudioRecorder?
    @State private var lastRecordSeconds: TimeInterval = 0

    private let uploadSession: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 300
        c.timeoutIntervalForResource = 600
        return URLSession(configuration: c)
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Cactus STT").font(.headline)
            TextField("API base URL (no trailing slash)", text: $baseURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)

            HStack {
                Button("Record") { startRecording() }
                Button("Stop & transcribe") { stopAndUpload() }
            }

            Text(status).font(.caption).foregroundStyle(.secondary)

            Text("Transcript")
                .font(.subheadline.weight(.semibold))
            ScrollView {
                Text(transcript.isEmpty ? "—" : transcript)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 120)
        }
        .padding()
    }

    private func startRecording() {
        transcript = ""
        AVAudioApplication.requestRecordPermission { ok in
            DispatchQueue.main.async {
                guard ok else {
                    status = "Microphone permission denied."
                    return
                }
                do {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
                    try session.setActive(true)

                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("recording.wav")
                    try? FileManager.default.removeItem(at: url)

                    let settings: [String: Any] = [
                        AVFormatIDKey: Int(kAudioFormatLinearPCM),
                        AVSampleRateKey: 16_000,
                        AVNumberOfChannelsKey: 1,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsBigEndianKey: false,
                        AVLinearPCMIsFloatKey: false,
                    ]
                    recorder = try AVAudioRecorder(url: url, settings: settings)
                    recorder?.prepareToRecord()
                    recorder?.record()
                    status = "Recording…"
                } catch {
                    status = "Record error: \(error.localizedDescription)"
                }
            }
        }
    }

    private func stopAndUpload() {
        lastRecordSeconds = recorder?.currentTime ?? 0
        recorder?.stop()
        recorder = nil
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("recording.wav")
        guard FileManager.default.fileExists(atPath: url.path) else {
            status = "No recording found."
            return
        }

        if lastRecordSeconds < 0.2 {
            status = "Too short — speak, then tap Stop & transcribe (record ~0.2s min)."
            return
        }

        if let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? Int64, size < 500 {
            status = "Recording file is empty or too small; check mic permission or try again."
            return
        }

        guard let uploadURL = transcribeEndpoint() else {
            status = "Bad URL."
            return
        }

        status = "Uploading / transcribing (first run can take a while)…"
        Task {
            do {
                let (data, http) = try await multipartUpload(fileURL: url, to: uploadURL)
                await MainActor.run {
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        transcript = json["transcript"] as? String ?? ""
                        if http.statusCode >= 400 {
                            if let d = json["detail"] as? String {
                                status = "HTTP \(http.statusCode): \(d)"
                            } else {
                                status = "HTTP \(http.statusCode)"
                            }
                        } else {
                            status = "Done."
                        }
                    } else {
                        transcript = String(data: data, encoding: .utf8) ?? ""
                        status = http.statusCode >= 400 ? "HTTP \(http.statusCode)" : "Unexpected response."
                    }
                }
            } catch {
                await MainActor.run {
                    status = "Upload failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func transcribeEndpoint() -> URL? {
        var s = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        guard let root = URL(string: s) else { return nil }
        return root.appendingPathComponent("transcribe")
    }

    private func multipartUpload(fileURL: URL, to endpoint: URL) async throws -> (Data, HTTPURLResponse) {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let fileData = try Data(contentsOf: fileURL)
        var body = Data()
        let prefix = "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
        body.append(Data(prefix.utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        req.httpBody = body

        let (data, response) = try await uploadSession.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (data, http)
    }
}

#Preview {
    ContentView()
}
