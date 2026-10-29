import SwiftUI

struct TableView: View {
    let table:PokerTable
    @EnvironmentObject private var preferences:Preferences
    @EnvironmentObject private var account:Account
    @EnvironmentObject private var store:TableStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var raiseAmount=40.0
    @State private var confirmLeave=false
    @State private var confirmFold=false
    private var me:Seat? {table.players.first{$0.id==account.userID}}
    private var myTurn:Bool {table.players.indices.contains(table.actor) && table.players[table.actor].id==account.userID}
    private var call:Int {max(0,table.currentBet-(me?.bet ?? 0))}
    private var betTitle:String {table.currentBet==0 ? preferences.text("Apostar ","Bet "):preferences.text("Aumentar ","Raise ")}
    private var maxRaise:Int {(me?.stack ?? 0)+(me?.bet ?? 0)}
    private var minRaise:Int {min(maxRaise,table.currentBet+table.minRaise)}
    var body: some View {
        GeometryReader {geometry in
            ScrollView {
                VStack(spacing:22) {
                    header
                    if store.disconnected {
                        Label(preferences.text("A restabelecer ligação… As jogadas estão suspensas neste dispositivo.","Reconnecting… Actions are paused on this device."),systemImage:"wifi.exclamationmark").font(.caption).foregroundStyle(.orange)
                    }
                    ScrollView(.horizontal,showsIndicators:false) {
                        HStack(spacing:10) {
                            ForEach(Array(table.players.enumerated()),id:\.element.id) {index,seat in seatView(seat,index:index).frame(width: max(140,min(190,(geometry.size.width-68)/CGFloat(max(1,table.players.count)))))}
                        }
                    }
                    felt(width:min(geometry.size.width-48,850))
                    if !table.log.isEmpty {
                        VStack(alignment:.leading,spacing:7) {
                            ForEach(Array(table.log.suffix(3).enumerated()),id:\.offset) {_,event in
                                HStack {Text(event.name).fontWeight(.semibold);Text(preferences.action(event.action));Spacer();if event.action=="call" || event.action=="raise" || event.action=="bet" {Text(event.amount.formatted()).monospacedDigit()}}
                            }
                        }.font(.caption).foregroundStyle(.secondary).padding(.horizontal,8)
                    }
                }.padding(24).frame(maxWidth:1000).frame(maxWidth:.infinity)
            }
        }.safeAreaInset(edge:.bottom,spacing:0) {
            Group {if table.betweenHands {betweenHands} else {controls}}
                .frame(maxWidth:952).padding(.horizontal,16).padding(.vertical,10).frame(maxWidth:.infinity).background(.regularMaterial)
        }.onChange(of:table.version) {_,_ in raiseAmount=Double(minRaise);confirmFold=false}
        .onAppear {raiseAmount=Double(minRaise)}
        #if os(iOS)
        .sensoryFeedback(.impact(weight:.medium),trigger:myTurn) {_,turn in turn}
        #endif
        .confirmationDialog(preferences.text("Sair da mesa?","Leave the table?"),isPresented:$confirmLeave,titleVisibility:.visible) {
            Button(preferences.text("Sair da mesa","Leave table"),role:.destructive) {Task {await store.command("leave")}}
            Button(preferences.text("Cancelar","Cancel"),role:.cancel) {}
        } message:{Text(preferences.text("As fichas desta mesa não são transferidas.","Chips from this table are not carried over."))}
        .confirmationDialog(preferences.text("Podes passar sem apostar. Queres desistir?","You can check for free. Fold anyway?"),isPresented:$confirmFold,titleVisibility:.visible) {
            Button(preferences.text("Desistir","Fold"),role:.destructive) {Task {await store.action("fold")}}
            Button(preferences.text("Cancelar","Cancel"),role:.cancel) {}
        }
    }
    private var header: some View {
        HStack(alignment:.top) {
            VStack(alignment:.leading,spacing:7) {
                Text(table.practice ? preferences.text("MESA DE TREINO","PRACTICE TABLE"):preferences.text("MESA PRIVADA","PRIVATE TABLE")).font(.caption.weight(.bold)).tracking(2).foregroundStyle(Brand.amber)
                HStack(spacing:10) {
                    Text(table.code).font(.system(.title2,design:.monospaced,weight:.semibold)).textSelection(.enabled)
                    if !table.practice {ShareLink(item:table.code) {Image(systemName:"square.and.arrow.up")}.accessibilityLabel(preferences.text("Partilhar código","Share code"))}
                }
            }
            Spacer()
            Button {confirmLeave=true} label:{Image(systemName:"rectangle.portrait.and.arrow.right").frame(width:44,height:44)}
                .buttonStyle(.plain).disabled(!table.betweenHands || store.busy)
                .accessibilityLabel(preferences.text("Sair da mesa (entre mãos)","Leave table (between hands)"))
        }
    }
    private func seatView(_ seat:Seat,index:Int) -> some View {
        let turn=index==table.actor
        return VStack(alignment:.leading,spacing:10) {
            HStack(spacing:9) {
                ZStack(alignment:.bottomTrailing) {
                    Circle().fill(turn ? Brand.amber:Brand.amber.opacity(0.13)).frame(width:34,height:34)
                        .overlay(Text(String(seat.name.prefix(1)).uppercased()).font(.system(.headline,design:.serif)).foregroundStyle(turn ? Brand.ink:Brand.amber))
                    if index==table.dealer {Text("D").font(.system(size:9,weight:.black)).padding(3).background(.white,in:Circle()).foregroundStyle(.black).offset(x:3,y:3)}
                }
                VStack(alignment:.leading,spacing:3) {
                    Text(seat.id==account.userID ? preferences.text("Tu","You"):seat.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(seat.folded ? preferences.text("Fora desta mão","Folded"):seat.stack==0 && !table.betweenHands ? "All-in":seat.bot ? preferences.text("Computador","Computer"):preferences.text("Jogador","Player")).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength:0)
            }
            HStack {
                Text(seat.stack.formatted()).font(.system(.title3,design:.rounded,weight:.bold)).monospacedDigit()
                Spacer(minLength:0)
                if seat.bet>0 && !table.betweenHands {Text("+\(seat.bet)").font(.caption.monospacedDigit()).foregroundStyle(Brand.amber)}
            }
            if table.phase=="showdown" && !seat.cards.isEmpty {
                HStack(spacing:4) {ForEach(seat.cards,id:\.self) {CardFace(card:$0,width:30)}}
            }
        }.padding(13).background(turn ? Brand.amber.opacity(0.10):.primary.opacity(0.035),in:RoundedRectangle(cornerRadius:17))
            .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(turn ? Brand.amber:.primary.opacity(0.08),lineWidth:turn ? 1.5:1))
            .opacity(seat.folded && !table.betweenHands ? 0.5:1)
            .animation(reduceMotion ? nil:.easeInOut(duration:0.3),value:turn)
    }
    private func felt(width:CGFloat) -> some View {
        let cardWidth=max(34,min(76,(width-72)/5.6))
        return VStack(spacing:22) {
            HStack {
                Text("NO LIMIT HOLD’EM").tracking(2)
                Spacer()
                Text(preferences.text("MÃO ","HAND ")+String(table.hand)).monospacedDigit()
            }.font(.system(size:10,weight:.semibold)).foregroundStyle(.white.opacity(0.45))
            VStack(spacing:7) {
                Text(preferences.phase(table.phase)).font(.caption.weight(.semibold)).foregroundStyle(Brand.gold)
                Text(table.pot.formatted()).font(.system(size:40,weight:.medium,design:.serif)).foregroundStyle(.white).contentTransition(.numericText())
                Text(preferences.text("FICHAS NO POTE","CHIPS IN THE POT")).font(.system(size:9,weight:.bold)).tracking(3).foregroundStyle(.white.opacity(0.45))
            }
            HStack(spacing:8) {
                ForEach(0..<5,id:\.self) {index in
                    if index<table.board.count {CardFace(card:table.board[index],width:cardWidth).transition(.offset(y:-16).combined(with:.opacity))}
                    else {RoundedRectangle(cornerRadius:9).strokeBorder(.white.opacity(0.12),style:StrokeStyle(lineWidth:1,dash:[4,4])).frame(width:cardWidth,height:cardWidth*1.43).overlay(Image(systemName:"suit.spade").foregroundStyle(.white.opacity(0.08)))}
                }
            }.animation(reduceMotion ? nil:.spring(response:0.5,dampingFraction:0.8),value:table.board)
            HStack(spacing:8) {
                Rectangle().fill(Brand.gold.opacity(0.3)).frame(width:30,height:1)
                Text("iVidiPoker").font(.system(.caption,design:.serif)).foregroundStyle(Brand.gold.opacity(0.7))
                Rectangle().fill(Brand.gold.opacity(0.3)).frame(width:30,height:1)
            }
            if let me, !me.cards.isEmpty && table.phase != "waiting" {
                HStack(spacing:12) {
                    HStack(spacing:-8) {ForEach(Array(me.cards.enumerated()),id:\.offset) {index,card in CardFace(card:card,width:cardWidth*0.9).rotationEffect(.degrees(index==0 ? -5:5)).id("\(table.hand)-\(index)").transition(.offset(y:18).combined(with:.opacity))}}
                    VStack(alignment:.leading,spacing:6) {
                        Text(preferences.text("A TUA MÃO","YOUR HAND")).font(.system(size:10,weight:.bold)).tracking(2)
                        Text(me.folded ? preferences.text("Desististe","You folded"):myTurn ? preferences.text("É a tua vez","Your turn"):preferences.text("Joga com calma.","Keep your cool.")).font(.caption)
                        if table.handCategory>=0 && !me.folded {
                            Text(preferences.category(table.handCategory)).font(.system(.subheadline,design:.serif,weight:.semibold)).foregroundStyle(Brand.gold)
                        }
                    }.foregroundStyle(.white.opacity(0.7))
                    Spacer(minLength:0)
                }.padding(.top,4).animation(reduceMotion ? nil:.spring(response:0.5,dampingFraction:0.8),value:table.hand)
            }
        }.padding(22).background {
            RoundedRectangle(cornerRadius:34).fill(LinearGradient(colors:[Color(red:0.18,green:0.14,blue:0.10),Color(red:0.08,green:0.085,blue:0.08)],startPoint:.topLeading,endPoint:.bottomTrailing))
                .overlay(RoundedRectangle(cornerRadius:34).strokeBorder(Brand.amber.opacity(0.25),lineWidth:2))
                .overlay(RoundedRectangle(cornerRadius:27).strokeBorder(.white.opacity(0.05)).padding(7))
                .shadow(color:.black.opacity(0.18),radius:18,y:10)
        }
    }
    private var betweenHands: some View {
        VStack(spacing:15) {
            if table.phase=="showdown" {
                ScrollView {
                    VStack(spacing:12) {
                        ForEach(table.winners,id:\.id) {winner in
                            HStack {
                                Image(systemName:"crown.fill").foregroundStyle(Brand.amber)
                                VStack(alignment:.leading,spacing:4) {
                                    Text(table.players.first{$0.id==winner.id}?.name ?? "").font(.headline)
                                    Text(preferences.category(winner.category)).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer();Text("+\(winner.amount)").font(.system(.title2,design:.rounded,weight:.bold)).foregroundStyle(Brand.amber)
                            }
                        }
                        ForEach(table.refunds,id:\.id) {refund in
                            HStack {
                                Text(table.players.first{$0.id==refund.id}?.name ?? "")
                                Text(preferences.text("Aposta devolvida","Uncalled bet returned")).foregroundStyle(.secondary)
                                Spacer();Text("+\(refund.amount)")
                            }.font(.caption)
                        }
                    }
                }.frame(height:min(130,CGFloat(table.winners.count*48+table.refunds.count*32)))
            } else {
                Text(table.practice ? preferences.text("Os teus adversários estão prontos.","Your opponents are ready."):preferences.text("Partilha o código e espera pelos teus amigos.","Share the code and wait for your friends.")).font(.subheadline).foregroundStyle(.secondary)
            }
            if me?.stack==0 {Button(preferences.text("Receber 2 000 fichas","Get 2,000 chips")) {Task {await store.command("rebuy")}}.buttonStyle(GoldButton(secondary:true))}
            if table.host==account.userID {
                Button {Task {await store.command("start")}} label:{Label(table.phase=="waiting" ? preferences.text("Dar as cartas","Deal cards"):preferences.text("Próxima mão","Next hand"),systemImage:"suit.spade.fill")}
                    .buttonStyle(GoldButton()).disabled((!table.practice && table.players.filter{$0.stack>0}.count<2) || (me?.stack==0) || store.busy)
            } else {Text(preferences.text("O anfitrião inicia a próxima mão.","The host starts the next hand.")).font(.caption).foregroundStyle(.secondary)}
        }.padding(20).background(.primary.opacity(0.035),in:RoundedRectangle(cornerRadius:20))
    }
    private var controls: some View {
        VStack(spacing:10) {
            HStack {
                Text(myTurn ? preferences.text("A decisão é tua.","Your move."):preferences.text("A aguardar jogada…","Waiting for a move…")).font(.subheadline.bold())
                Spacer()
                TimelineView(.periodic(from:.now,by:1)) {context in
                    Text("\(max(0,Int(ceil(table.deadline/1000-context.date.timeIntervalSince1970))))s").font(.system(.caption,design:.monospaced)).foregroundStyle(.secondary)
                }
            }
            if myTurn {
                if table.canRaise {
                    HStack(spacing:12) {
                        Text(Int(raiseAmount).formatted()).font(.subheadline.monospacedDigit().bold()).frame(minWidth:40)
                        if maxRaise>minRaise {Slider(value:$raiseAmount,in:Double(minRaise)...Double(maxRaise),step:1).accessibilityLabel(preferences.text("Aposta total","Total bet"))} else {Spacer()}

                    }
                    HStack(spacing:8) {
                        Button(preferences.text("½ pote","½ pot")) {if let me {raiseAmount=Double(table.suggestedRaise(for:me,fraction:0.5))}}.frame(maxWidth:.infinity)
                        Button(preferences.text("Pote","Pot")) {if let me {raiseAmount=Double(table.suggestedRaise(for:me,fraction:1))}}.frame(maxWidth:.infinity)
                        Button("All-in") {raiseAmount=Double(maxRaise)}.frame(maxWidth:.infinity)
                    }.buttonStyle(.bordered).controlSize(.small)
                    .accessibilityHint(preferences.text("Seleciona o valor; confirma no botão de aposta.","Selects an amount; confirm with the betting button."))
                }
                HStack(spacing:8) {
                    Button(preferences.text("Desistir","Fold")) {
                        if call==0 {confirmFold=true} else {Task {await store.action("fold")}}
                    }.buttonStyle(GoldButton(secondary:true))
                    Button(call==0 ? preferences.text("Passar","Check"):preferences.text("Pagar ","Call ")+min(call,me?.stack ?? 0).formatted()) {Task {await store.action(call==0 ? "check":"call")}}.buttonStyle(GoldButton(secondary:table.canRaise))
                    if table.canRaise {
                        Button(betTitle+Int(raiseAmount).formatted()) {Task {await store.action("raise",amount:Int(raiseAmount))}}.buttonStyle(GoldButton())
                    }
                }
            }
        }.padding(12).disabled(store.busy || store.disconnected)
    }
}
