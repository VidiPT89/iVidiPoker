import SwiftUI

struct LobbyView: View {
    @EnvironmentObject private var preferences:Preferences
    @EnvironmentObject private var store:TableStore
    @State private var code=""
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:28) {
                HStack {
                    VStack(alignment:.leading,spacing:10) {
                        Text(preferences.text("O TEU CLUBE DE POKER","YOUR POKER CLUB")).font(.caption.weight(.bold)).tracking(3).foregroundStyle(Brand.amber)
                        Text(preferences.text("Vamos a jogo.","Let’s play."))
                            .font(.system(size:44,weight:.medium,design:.serif))
                        Text(preferences.text("Escolhe a mesa. Nós damos as cartas.","Choose your table. We’ll deal the cards."))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    BrandMark(size:64)
                }.padding(.vertical,12)
                ViewThatFits(in:.horizontal) {
                    HStack(alignment:.top,spacing:20) {privateTable.frame(minWidth:330);practiceTable.frame(minWidth:290)}
                    VStack(spacing:20) {privateTable;practiceTable}
                }
                HStack(spacing:14) {
                    Image(systemName:"lock.shield").font(.title2).foregroundStyle(Brand.amber)
                    VStack(alignment:.leading,spacing:5) {
                        Text(preferences.text("Uma mesa, todos os teus dispositivos","One table, all your devices")).font(.subheadline.bold())
                        Text(preferences.text("Partilha o código com os teus amigos. Podem entrar pelo iPhone, iPad ou Mac.","Share the code with friends. They can join on iPhone, iPad or Mac.")).font(.subheadline).foregroundStyle(.secondary)
                    }
                }.padding(.vertical,12)
                Divider()
                HStack {Text("NO LIMIT HOLD’EM").tracking(2);Spacer();Text(preferences.text("2 a 6 jogadores · Blinds 10 / 20","2–6 players · Blinds 10 / 20"))}.font(.caption).foregroundStyle(.secondary)
                CreditLinks().frame(maxWidth:.infinity).padding(.top,12)
            }.padding(28).frame(maxWidth:1000).frame(maxWidth:.infinity)
        }.overlay {if store.busy {ProgressView().padding(24).background(.regularMaterial,in:RoundedRectangle(cornerRadius:16))}}
        .disabled(store.busy || store.restoring)
    }
    private var privateTable: some View {
        VStack(alignment:.leading,spacing:20) {
            Image(systemName:"person.2.fill").font(.title).foregroundStyle(Brand.amber)
            Text(preferences.text("Entre amigos","With friends")).font(.system(.title,design:.serif))
            Text(preferences.text("Uma mesa privada para grandes mãos e boas conversas.","A private table for great hands and good company."))
                .foregroundStyle(.secondary).frame(minHeight:44,alignment:.top)
            Button {Task {await store.create(practice:false)}} label:{Label(preferences.text("Criar mesa","Create table"),systemImage:"plus")}.buttonStyle(GoldButton())
            HStack {
                TextField(preferences.text("Código da mesa","Table code"),text:$code).textFieldStyle(.plain).autocorrectionDisabled().font(.system(.body,design:.monospaced)).padding(14)
                    .background(.primary.opacity(0.05),in:RoundedRectangle(cornerRadius:12)).onChange(of:code) {_,value in code=String(value.uppercased().filter{"0123456789ABCDEF".contains($0)}.prefix(8))}
                Button {Task {await store.join(code:code)}} label:{Image(systemName:"arrow.right").frame(width:48,height:48)}.buttonStyle(.bordered).disabled(code.count != 8).accessibilityLabel(preferences.text("Entrar na mesa","Join table"))
            }
        }.frame(maxWidth:.infinity,alignment:.leading).panel()
    }
    private var practiceTable: some View {
        VStack(alignment:.leading,spacing:20) {
            Image(systemName:"suit.spade.fill").font(.title).foregroundStyle(Brand.amber)
            Text(preferences.text("Apura o instinto","Sharpen your instinct")).font(.system(.title,design:.serif))
            Text(preferences.text("Treina com três adversários automáticos, ao teu ritmo.","Practise against three computer opponents."))
                .foregroundStyle(.secondary).frame(minHeight:44,alignment:.top)
            HStack(spacing:10) {ForEach(["A","D","L"],id:\.self) {Text($0).font(.system(.headline,design:.serif)).frame(width:42,height:42).background(Brand.amber.opacity(0.12),in:Circle())};Spacer();Text("2 000").font(.system(.title2,design:.rounded,weight:.bold)).foregroundStyle(Brand.amber)}.frame(height:50)
            Button {Task {await store.create(practice:true)}} label:{Label(preferences.text("Treinar","Practise"),systemImage:"play.fill")}.buttonStyle(GoldButton(secondary:true))
        }.frame(maxWidth:.infinity,alignment:.leading).panel()
    }
}
