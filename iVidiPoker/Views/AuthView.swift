import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var preferences:Preferences
    @EnvironmentObject private var account:Account
    @State private var creating=false
    @State private var recovering=false
    @State private var recoverySent=false
    @State private var name=""
    @State private var email=""
    @State private var password=""
    @State private var code=""
    @State private var busy=false
    @State private var message:String?
    @State private var error:String?
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                if geometry.size.width>820 {
                    HStack(spacing:64) { introduction.frame(maxWidth:420); form.frame(width:360) }
                        .frame(maxWidth:.infinity).padding(40).frame(minHeight:geometry.size.height)
                } else {
                    VStack(spacing:28) { introduction;form }.frame(maxWidth:440).padding(24).frame(maxWidth:.infinity)
                }
            }
        }
    }
    private var introduction: some View {
        VStack(alignment:.leading,spacing:22) {
            Text("THE AMBER TABLE").font(.caption.weight(.bold)).tracking(4).foregroundStyle(Brand.amber)
            Text(preferences.text("A próxima mão\né tua.","The next hand\nis yours."))
                .font(.system(size:48,weight:.medium,design:.serif)).fixedSize(horizontal:false,vertical:true)
            Text(preferences.text("Os teus amigos. A mesma mesa.\nNo iPhone, iPad ou Mac.","Your friends. One table.\nOn iPhone, iPad or Mac."))
                .font(.title3).foregroundStyle(.secondary).lineSpacing(5)
            CardFan().frame(maxWidth:.infinity).padding(.vertical,10)
            HStack(spacing:12) {
                Image(systemName:"suit.club.fill").foregroundStyle(Brand.amber)
                Text(preferences.text("Texas Hold’em · Apenas fichas virtuais","Texas Hold’em · Virtual chips only")).font(.caption)
            }.foregroundStyle(.secondary)
        }
    }
    private var form: some View {
        VStack(alignment:.leading,spacing:16) {
            Text(recovering ? preferences.text("Recuperar conta","Recover account") : creating ? preferences.text("O teu lugar à mesa","Your seat at the table") : preferences.text("Bem-vindo à mesa","Welcome to the table"))
                .font(.system(.title2,design:.serif,weight:.semibold))
            Text(preferences.text("Entra na tua conta para jogar.","Sign in to your account to play.")).foregroundStyle(.secondary).font(.subheadline)
            if !AppConfiguration.ready {
                Label(preferences.text("O serviço online aguarda ativação.","Online service awaiting activation."),systemImage:"network.slash")
                    .font(.caption).foregroundStyle(.secondary).padding(12).frame(maxWidth:.infinity,alignment:.leading).background(Brand.amber.opacity(0.08),in:RoundedRectangle(cornerRadius:10))
            }
            if creating && !recovering {field(preferences.text("Nome na mesa","Table name"),text:$name)}
            field("Email",text:$email).disabled(recovering && recoverySent)
            if !recovering || recoverySent {
                if recoverySent {field(preferences.text("Código do email","Email code"),text:$code)}
                SecureField(recovering ? preferences.text("Nova palavra-passe","New password") : preferences.text("Palavra-passe","Password"),text:$password)
                    .textContentType(creating || recovering ? .newPassword:.password).textFieldStyle(.plain).padding(14).background(.primary.opacity(0.05),in:RoundedRectangle(cornerRadius:10))
            }
            if let error {Text(preferences.error(error)).font(.caption).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently)}
            if let message {Text(message).font(.caption).foregroundStyle(.secondary)}
            Button {run {
                if recovering {
                    if recoverySent {try await account.reset(email:email,code:code,password:password)}
                    else {try await account.recover(email:email);recoverySent=true;message=preferences.text("Consulta o código no teu email.","Check your email for the code.")}
                } else if creating {
                    if try await account.signUp(name:name,email:email,password:password) == false {message=preferences.text("Confirma o teu email e entra na conta.","Confirm your email, then sign in.");creating=false}
                } else {try await account.signIn(email:email,password:password)}
            }} label: {
                HStack {if busy {ProgressView().controlSize(.small)};Text(recovering ? preferences.text("Continuar","Continue"):creating ? preferences.text("Criar conta","Create account"):preferences.text("Entrar","Sign in"));Image(systemName:"arrow.right")}
            }.buttonStyle(GoldButton()).disabled(busy || email.isEmpty || (!recovering && password.isEmpty) || (!recovering && creating && name.trimmingCharacters(in:.whitespaces).isEmpty) || (recovering && recoverySent && (code.isEmpty || password.count<8)) || !AppConfiguration.ready)
            if !recovering {
                HStack {Rectangle().frame(height:1);Text(preferences.text("ou continua com","or continue with")).fixedSize();Rectangle().frame(height:1)}.foregroundStyle(.secondary.opacity(0.5)).font(.caption)
                HStack(spacing:8) {
                    provider("Apple","apple",icon:"apple.logo")
                    provider("Google","google",icon:nil)
                    provider("Microsoft","azure",icon:nil)
                }
                Button(creating ? preferences.text("Já tens conta? Entrar","Already have an account? Sign in"):preferences.text("Ainda não tens conta? Criar conta","New here? Create an account")) {creating.toggle();message=nil;error=nil}.font(.caption).frame(maxWidth:.infinity)
                Button(preferences.text("Esqueci-me da palavra-passe","Forgot password")) {recovering=true;creating=false;password="";error=nil;message=nil}.font(.caption).foregroundStyle(.secondary).frame(maxWidth:.infinity)
            } else {
                Button(preferences.text("Voltar ao início de sessão","Back to sign in")) {recovering=false;recoverySent=false;error=nil;message=nil}.font(.caption)
            }
            CreditLinks().frame(maxWidth:.infinity).padding(.top,8)
        }.panel().disabled(busy)
    }
    private func field(_ label:String,text:Binding<String>) -> some View {
        TextField(label,text:text).textFieldStyle(.plain).autocorrectionDisabled().padding(14)
            .background(.primary.opacity(0.05),in:RoundedRectangle(cornerRadius:10))
            #if os(iOS)
            .textInputAutocapitalization(.never)
            #endif
    }
    private func provider(_ title:String,_ id:String,icon:String?) -> some View {
        Button {run {try await account.social(id)}} label:{
            VStack(spacing:7) {if let icon {Image(systemName:icon).font(.title3)} else {Text(title=="Google" ? "G":"⊞").font(.title3.bold())};Text(title).font(.system(size:10,weight:.semibold))}
                .frame(maxWidth:.infinity).frame(height:60).background(.primary.opacity(0.05),in:RoundedRectangle(cornerRadius:12))
        }.buttonStyle(.plain).disabled(busy || !AppConfiguration.ready)
    }
    private func run(_ operation:@escaping () async throws -> Void) {
        busy=true;error=nil;message=nil
        Task {defer{busy=false};do {try await operation()} catch{self.error=(error as? ServiceError)?.code ?? "service_unavailable"}}
    }
}
