import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// 元レイヤーを変更せず、README 用の透過アニメーションを合成する。
enum RenderError: Error { case source(String), context, destination, finalize }
let args = CommandLine.arguments
let root = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let evidence = URL(fileURLWithPath: args[3])
func load(_ name: String) throws -> CGImage {
    let url = root.appendingPathComponent(name)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw RenderError.source(name) }
    return image
}
let body = try load("body-charcoal.png"), sky = try load("body-sky-blue.png")
let eyes = try load("eyes-default.png"), mouth = try load("mouth-default.png"), monocle = try load("monocle.png")
let width = 320, height = 280, frames = 234
let fps = 30.0
let space = CGColorSpaceCreateDeviceRGB()
func context(_ w: Int, _ h: Int) throws -> CGContext {
    guard let result = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
        bytesPerRow: w * 4, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw RenderError.context }
    result.interpolationQuality = .high
    return result
}
func ease(_ t: Double) -> Double {
    // 既存の視線モーションと同じ cubic-bezier(.77,0,.175,1)。
    var lo = 0.0, hi = 1.0
    for _ in 0..<30 {
        let m = (lo + hi) / 2, u = 1 - m
        let x = 3 * u * u * m * 0.77 + 3 * u * m * m * 0.175 + m * m * m
        if x < t { lo = m } else { hi = m }
    }
    let m = (lo + hi) / 2
    return 3 * (1 - m) * m * m + m * m * m
}
func cycle(_ p: Double) -> Double { let f = p - floor(p); return ease(f < 0.5 ? f * 2 : (1 - f) * 2) }
func writePNG(_ image: CGImage, _ url: URL) throws {
    guard let target = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw RenderError.destination }
    CGImageDestinationAddImage(target, image, nil)
    guard CGImageDestinationFinalize(target) else { throw RenderError.finalize }
}
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: evidence, withIntermediateDirectories: true)
guard let gif = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, frames, nil) else { throw RenderError.destination }
CGImageDestinationSetProperties(gif, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for index in 0..<frames {
    let time = Double(index) / fps
    let c = try context(width, height)
    c.scaleBy(x: CGFloat(width) / 832, y: CGFloat(height) / 728)
    c.translateBy(x: -96, y: -96)
    // 全レイヤーは 1024 キャンバスのまま、同じ基準線で動かす。左右反転なし。
    let breathe = cycle(time / 2.6), sway = sin(time / 7.8 * 2 * .pi)
    c.translateBy(x: 512, y: 256)
    c.rotate(by: CGFloat(sway * 1.7 * .pi / 180))
    c.scaleBy(x: 1 - breathe * 0.01, y: 1 + breathe * 0.02)
    c.translateBy(x: -512, y: -256 + breathe * 6)
    let plane = CGRect(x: 0, y: 0, width: 1024, height: 1024)
    c.draw(body, in: plane)
    c.saveGState()
    c.setAlpha(CGFloat(cycle(time / 7.8) * 0.65))
    c.draw(sky, in: plane)
    c.restoreGState()
    c.draw(mouth, in: plane)
    let look = sin(time / 7.8 * 2 * .pi) * 14
    let blinkPhase = time.truncatingRemainder(dividingBy: 3.9)
    // 瞼は急に方向を変えず、閉じる・短い休止・開くを連続補間する。
    let blink: Double
    if blinkPhase < 1.65 || blinkPhase >= 2.0833333333 { blink = 0 }
    else if blinkPhase < 1.83 { blink = ease((blinkPhase - 1.65) / 0.18) }
    else if blinkPhase < 1.8633333333 { blink = 1 }
    else { blink = 1 - ease((blinkPhase - 1.8633333333) / 0.22) }
    c.saveGState()
    c.translateBy(x: 512 + look, y: 481.28)
    c.scaleBy(x: 1, y: 1 - blink * 0.92)
    c.translateBy(x: -512, y: -481.28)
    c.draw(eyes, in: plane)
    c.restoreGState()
    c.draw(monocle, in: plane)
    guard let image = c.makeImage() else { throw RenderError.context }
    // GIF は 1/100 秒単位なので 3・4cs を累積丸めし、平均30fpsを保つ。
    let delay = (round(Double(index + 1) * 100 / fps) - round(Double(index) * 100 / fps)) / 100
    CGImageDestinationAddImage(gif, image, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay, kCGImagePropertyGIFUnclampedDelayTime: delay]] as CFDictionary)
    try writePNG(image, evidence.appendingPathComponent(String(format: "frame-%03d.png", index)))
}
guard CGImageDestinationFinalize(gif) else { throw RenderError.finalize }
// 透過 GIF の各フレームを消去し、体の移動に残像が出ないよう disposal=2 にする。
var data = try Data(contentsOf: output)
// ImageIO は 87a として書き出すため、透過・ループ拡張を持つ 89a ヘッダーに合わせる。
data.replaceSubrange(0..<6, with: Data("GIF89a".utf8))
var position = 13
if data[10] & 0x80 != 0 { position += 3 * (1 << (Int(data[10] & 7) + 1)) }
var controls = 0
while position < data.count {
    let marker = data[position]
    if marker == 0x3b { break }
    if marker == 0x21 {
        let label = data[position + 1]
        if label == 0xf9 && data[position + 2] == 4 { data[position + 3] = (data[position + 3] & 0xe3) | 0x08; controls += 1 }
        position += 2
        while data[position] != 0 { position += Int(data[position]) + 1 }
        position += 1
    } else if marker == 0x2c {
        let packed = data[position + 9]
        position += 10
        if packed & 0x80 != 0 { position += 3 * (1 << (Int(packed & 7) + 1)) }
        position += 1
        while data[position] != 0 { position += Int(data[position]) + 1 }
        position += 1
    } else { throw RenderError.finalize }
}
try data.write(to: output)
let blank = try context(160, 1)
guard let blankImage = blank.makeImage() else { throw RenderError.context }
try writePNG(blankImage, output.deletingLastPathComponent().appendingPathComponent("highsoul-hidden.png"))
print("GIF: \(width)x\(height), \(frames) frames, 30fps average, 7.8s, infinite loop, \(data.count) bytes, \(controls) transparency disposal controls")
