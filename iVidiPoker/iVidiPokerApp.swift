import SwiftUI

@main struct iVidiPokerApp: App {
    @StateObject private var preferences=Preferences()
    @StateObject private var account=Account()
    var body: some Scene {
        WindowGroup {
            RootView(account:account).environmentObject(preferences).environmentObject(account)
                .preferredColorScheme(preferences.scheme).tint(Brand.amber)
                #if os(macOS)
                .frame(minWidth:800,minHeight:700)
                #endif
        }
        #if os(macOS)
        .defaultSize(width:1120,height:820)
        #endif
    }
}
struct RootView: View {
    @EnvironmentObject private var preferences:Preferences
    @EnvironmentObject private var account:Account
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var store:TableStore
    @State private var splash=true
    @State private var settings=false
    @State private var rules=false
    init(account:Account) { _store=StateObject(wrappedValue:TableStore(account:account)) }
    var body: some View {
        ZStack {
            CanvasBackground()
            if splash { splashView.transition(.opacity) }
            else {
                VStack(spacing:0) {
                    HStack(spacing:12) {
                        BrandMark(size:34)
                        Text("iVidiPoker").font(.system(.title3,design:.rounded,weight:.bold))
                        Spacer()
                        Button {rules=true} label:{Image(systemName:"questionmark.circle").frame(width:44,height:44)}
                            .accessibilityLabel(preferences.text("Como jogar","How to play"))
                        Button {settings=true} label:{Image(systemName:"slider.horizontal.3").frame(width:44,height:44)}
                            .accessibilityLabel(preferences.text("Definições","Settings"))
                    }.buttonStyle(.plain).padding(.horizontal,24).padding(.vertical,8)
                    Divider().opacity(0.5)
                    if account.session == nil { AuthView().frame(maxWidth:.infinity,maxHeight:.infinity) }
                    else if store.restoring {ProgressView(preferences.text("A recuperar a tua mesa…","Restoring your table…")).frame(maxWidth:.infinity,maxHeight:.infinity)}
                    else if store.restoreFailed && store.table == nil {
                        ContentUnavailableView {
                            Label(preferences.text("Sem ligação à mesa","Cannot reach your table"),systemImage:"wifi.exclamationmark")
                        } description: {
                            Text(preferences.text("Verifica a ligação antes de continuar.","Check your connection before continuing."))
                        } actions: {
                            Button(preferences.text("Tentar novamente","Try again")) {Task {await store.restore()}}.buttonStyle(.borderedProminent)
                        }
                    }
                    else if let table=store.table { TableView(table:table) }
                    else { LobbyView() }
                }.transition(.opacity)
            }
        }
        .environmentObject(store)
        .task {
            try? await Task.sleep(for:.seconds(1.8))
            withAnimation(reduceMotion ? nil:.easeOut(duration:0.45)) {splash=false}
        }
        .task(id:account.userID) { if !account.userID.isEmpty {await store.restore()} else {store.table=nil} }
        .task(id:store.table?.code) {if store.table != nil {await store.poll()}}
        .sheet(isPresented:$settings) { SettingsView().environmentObject(store).preferredColorScheme(preferences.scheme) }
        .sheet(isPresented:$rules) { RulesView().preferredColorScheme(preferences.scheme) }
        .sheet(isPresented:$account.choosingPassword) { NewPasswordView().preferredColorScheme(preferences.scheme) }
        .onOpenURL {url in Task {do {try await account.open(url)} catch {store.error=(error as? ServiceError)?.code ?? "service_unavailable"}}}
        .alert(preferences.text("Não foi possível concluir","Could not complete"),isPresented:Binding(get:{store.error != nil && !settings},set:{if !$0 {store.error=nil}})) {
            Button("OK") {store.error=nil}
        } message: {Text(preferences.error(store.error ?? ""))}
    }
    private var splashView: some View {
        VStack(spacing:24) {
            Spacer()
            // The logo already carries the name.
            BrandMark(size:220).shadow(color:Brand.amber.opacity(0.18),radius:40)
            Text("TEXAS HOLD’EM").font(.caption.weight(.semibold)).tracking(6).foregroundStyle(Brand.amber)
            Spacer()
            CreditLinks().padding(.bottom,36)
        }.padding(24)
    }
}
