import SwiftUI

enum Brand {
    static let amber=Color(red:249/255,green:156/255,blue:0)
    static let gold=Color(red:252/255,green:187/255,blue:0)
    static let ink=Color(red:10/255,green:10/255,blue:15/255)
    static let gradient=LinearGradient(colors:[gold,amber],startPoint:.topLeading,endPoint:.bottomTrailing)
}
struct CanvasBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            (scheme == .dark ? Brand.ink : Color(red:0.96,green:0.95,blue:0.92))
            RadialGradient(colors:[Brand.amber.opacity(scheme == .dark ? 0.10:0.13),.clear],center:.topTrailing,startRadius:0,endRadius:700)
        }.ignoresSafeArea()
    }
}
struct Panel: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content:Content) -> some View {
        content.padding(24).background(scheme == .dark ? Color.white.opacity(0.045):Color.white.opacity(0.8),in:RoundedRectangle(cornerRadius:24))
            .overlay(RoundedRectangle(cornerRadius:24).strokeBorder(.primary.opacity(0.08)))
    }
}
extension View { func panel() -> some View { modifier(Panel()) } }
struct GoldButton: ButtonStyle {
    var secondary=false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration:Configuration) -> some View {
        configuration.label.font(.system(.body,design:.rounded,weight:.bold)).lineLimit(1).minimumScaleFactor(0.7)
            .padding(.horizontal,12).frame(minHeight:50).frame(maxWidth:.infinity)
            .foregroundStyle(secondary ? Color.primary:Brand.ink)
            .background(secondary ? AnyShapeStyle(.primary.opacity(0.07)):AnyShapeStyle(Brand.gradient),in:RoundedRectangle(cornerRadius:14))
            .overlay(RoundedRectangle(cornerRadius:14).strokeBorder(secondary ? .primary.opacity(0.12):Brand.gold.opacity(0.4)))
            .opacity(enabled ? (configuration.isPressed ? 0.75:1):0.4)
            .scaleEffect(configuration.isPressed ? 0.98:1)
    }
}
struct BrandMark: View {
    var size:CGFloat=60
    var body: some View {
        Image("Logo").resizable().interpolation(.high).scaledToFit()
            .frame(width:size,height:size).accessibilityHidden(true)
    }
}
struct CardFace: View {
    let card: PlayingCard
    let width:CGFloat
    @EnvironmentObject private var preferences:Preferences
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius:width*0.12).fill(Color(red:0.99,green:0.98,blue:0.94))
            VStack(spacing:0) {
                HStack {Text(card.label).font(.system(size:width*0.28,weight:.heavy,design:.serif));Spacer(minLength:0)}
                Text(card.symbol).font(.system(size:width*0.43))
                HStack {Spacer(minLength:0);Text(card.label).font(.system(size:width*0.2,weight:.heavy,design:.serif)).rotationEffect(.degrees(180))}
            }.padding(width*0.10).foregroundStyle(card.red ? Color(red:0.72,green:0.18,blue:0.12):Brand.ink)
        }.frame(width:width,height:width*1.43)
            .overlay(RoundedRectangle(cornerRadius:width*0.12).strokeBorder(.white.opacity(0.15)))
            .shadow(color:.black.opacity(0.25),radius:5,y:4)
            .accessibilityElement(children:.ignore)
            .accessibilityLabel(card.spokenName(language:preferences.language))
    }
}
struct CardFan: View {
    var body: some View {
        ZStack {
            Ellipse().fill(Brand.amber.opacity(0.16)).frame(width:240,height:90).blur(radius:30).offset(y:70)
            CardFace(card:.init(rank:13,suit:0),width:100).rotationEffect(.degrees(-20)).offset(x:-62,y:12)
            CardFace(card:.init(rank:14,suit:1),width:100).rotationEffect(.degrees(-4)).offset(x:0,y:-4)
            CardFace(card:.init(rank:14,suit:0),width:100).rotationEffect(.degrees(15)).offset(x:64,y:9)
        }.frame(height:190).accessibilityHidden(true)
    }
}
struct CreditLinks: View {
    var body: some View {
        VStack(spacing:8) {
            Text("Developed by David Arsénio Martins").font(.caption).foregroundStyle(.secondary)
            HStack(spacing:18) {
                Link("ividi.dev",destination:URL(string:"https://ividi.dev/")!)
                Link("GitHub / VidiPT89",destination:URL(string:"https://github.com/VidiPT89/")!)
            }.font(.caption.weight(.semibold)).tint(Brand.amber)
        }
    }
}
