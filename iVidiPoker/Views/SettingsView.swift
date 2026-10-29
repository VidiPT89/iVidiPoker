import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var preferences:Preferences
    @EnvironmentObject private var account:Account
    @EnvironmentObject private var store:TableStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete=false
    @State private var busy=false
    var body: some View {
        NavigationStack {
            Form {
                Section(preferences.text("A tua experiência","Your experience")) {
                    Picker(preferences.text("Idioma","Language"),selection:$preferences.language) {
                        Text("Português (Portugal)").tag("pt");Text("English").tag("en")
                    }
                    Picker(preferences.text("Aparência","Appearance"),selection:$preferences.appearance) {
                        Label(preferences.text("Sistema","System"),systemImage:"circle.lefthalf.filled").tag("system")
                        Label(preferences.text("Claro","Light"),systemImage:"sun.max").tag("light")
                        Label(preferences.text("Escuro","Dark"),systemImage:"moon").tag("dark")
                    }
                }
                if account.session != nil {
                    Section(preferences.text("Conta","Account")) {
                        if let email=account.session?.user.email {Text(email).textSelection(.enabled)}
                        Button(preferences.text("Terminar sessão","Sign out")) {
                            busy=true
                            Task {await account.signOut();busy=false;dismiss()}
                        }.disabled(busy)
                        Button(preferences.text("Eliminar conta","Delete account"),role:.destructive) {confirmDelete=true}.disabled(store.busy)
                    }
                }
                Section(preferences.text("Sobre o iVidiPoker","About iVidiPoker")) {
                    HStack(spacing:14) {BrandMark(size:44);VStack(alignment:.leading,spacing:4) {Text("iVidiPoker").font(.headline);Text((Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "1.0")+" · Texas Hold’em").font(.caption).foregroundStyle(.secondary)}}
                    Text(preferences.text("Um jogo social com fichas virtuais. Sem depósitos, prémios monetários ou apostas com dinheiro real.","A social game with virtual chips. No deposits, cash prizes or real-money wagering.")).font(.footnote)
                    CreditLinks().padding(.vertical,8)
                }
                Section(preferences.text("Privacidade","Privacy")) {
                    Text(preferences.text("A conta guarda o teu email e nome. As mesas guardam temporariamente as jogadas e as fichas. A sessão fica protegida no Porta-chaves deste dispositivo. Não usamos publicidade nem rastreadores.","Your account stores your email and name. Tables temporarily store moves and chips. Your session is protected in this device’s Keychain. We do not use advertising or trackers.")).font(.footnote).foregroundStyle(.secondary)
                    Link(preferences.text("Contactar o criador","Contact the developer"),destination:URL(string:"mailto:ividi.dev@gmail.com")!)
                }
            }.formStyle(.grouped)
                .navigationTitle(preferences.text("Definições","Settings"))
                .toolbar {ToolbarItem(placement:.confirmationAction) {Button(preferences.text("Concluído","Done")) {dismiss()}}}
                .alert(preferences.text("Não foi possível concluir","Could not complete"),isPresented:Binding(get:{store.error != nil},set:{if !$0 {store.error=nil}})) {
                    Button("OK") {store.error=nil}
                } message:{Text(preferences.error(store.error ?? ""))}
                .confirmationDialog(preferences.text("Eliminar a tua conta definitivamente?","Permanently delete your account?"),isPresented:$confirmDelete,titleVisibility:.visible) {
                    Button(preferences.text("Eliminar conta","Delete account"),role:.destructive) {Task {await store.deleteAccount();if account.session==nil {dismiss()}}}
                    Button(preferences.text("Cancelar","Cancel"),role:.cancel) {}
                } message:{Text(preferences.text("Esta ação elimina a conta e o teu lugar na mesa. Não pode ser desfeita.","This deletes your account and your seat at the table. It cannot be undone."))}
        }.frame(minWidth:320,minHeight:530)
        #if os(macOS)
        .frame(width:520,height:650)
        #endif
    }
}
struct RulesView: View {
    @EnvironmentObject private var preferences:Preferences
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    Text(preferences.text("Duas cartas.\nMuitas possibilidades.","Two cards.\nEndless possibilities.")).font(.system(size:32,weight:.medium,design:.serif))
                    rule("01",preferences.text("A melhor mão de cinco","The best five-card hand"),preferences.text("Recebes duas cartas privadas. Combina-as com as cinco cartas comuns para formar a melhor mão de cinco cartas. Podes usar zero, uma ou duas das tuas cartas.","You receive two private cards. Combine them with the five community cards to make the best five-card hand. You may use zero, one or both of your cards."))
                    rule("02",preferences.text("Quatro rondas de apostas","Four betting rounds"),preferences.text("Pré-flop, flop (três cartas), turn e river. Em cada ronda podes passar, pagar, aumentar ou desistir, conforme a aposta em jogo. O botão D identifica o dealer. As blinds são 10 e 20 fichas. Os atalhos ½ pote, Pote e All-in selecionam um valor; o botão Apostar ou Aumentar confirma a jogada.","Preflop, flop (three cards), turn and river. On each round you can check, call, raise or fold, depending on the current bet. D marks the dealer. Blinds are 10 and 20 chips. The ½ pot, Pot and All-in shortcuts select an amount; Bet or Raise confirms the move."))
                    rule("03",preferences.text("All-in e potes laterais","All-ins and side pots"),preferences.text("Podes apostar todas as tuas fichas. Só podes ganhar a parte do pote coberta pela tua aposta. Os empates dividem o pote. Um all-in inferior ao aumento mínimo nem sempre reabre o direito de aumentar.","You may bet all your chips. You can only win the portion of the pot covered by your contribution. Ties split the pot. An all-in below the minimum raise does not always reopen raising."))
                    rule("04",preferences.text("A mesa continua","The table keeps moving"),preferences.text("Tens 45 segundos para jogar. Se o tempo acabar, passas quando possível; caso contrário, desistes. Podes sair entre mãos. Sem fichas, recebe mais 2 000 antes da próxima mão. As fichas não têm valor monetário.","You have 45 seconds to act. When time runs out, you check if possible or fold. Leave between hands. If you run out, get another 2,000 chips before the next hand. Chips have no monetary value."))
                    Divider()
                    Text(preferences.text("Mãos, da mais forte à mais fraca","Hands, strongest to weakest")).font(.headline)
                    ForEach((0...8).reversed(),id:\.self) {index in HStack {Text(String(9-index)).font(.caption.monospaced()).foregroundStyle(Brand.amber).frame(width:20);Text(preferences.category(index));Spacer();if index==8 {Text("10 J Q K A").font(.caption.monospaced()).foregroundStyle(.secondary)}}}
                    Text(preferences.text("A sequência real é a sequência de cor mais alta. O ás pode ser alto ou baixo (A 2 3 4 5).", "A royal flush is the highest straight flush. The ace can be high or low (A 2 3 4 5). ")).font(.caption).foregroundStyle(.secondary)
                }.padding(28)
            }.navigationTitle(preferences.text("Como jogar","How to play"))
                .toolbar {ToolbarItem(placement:.confirmationAction) {Button(preferences.text("Concluído","Done")) {dismiss()}}}
        }.frame(minWidth:320,minHeight:530)
        #if os(macOS)
        .frame(width:560,height:680)
        #endif
    }
    private func rule(_ number:String,_ title:String,_ body:String) -> some View {
        VStack(alignment:.leading,spacing:8) {
            HStack {Text(number).font(.caption.monospaced()).foregroundStyle(Brand.amber);Text(title).font(.headline)}
            Text(body).font(.subheadline).foregroundStyle(.secondary).lineSpacing(4)
        }
    }
}
