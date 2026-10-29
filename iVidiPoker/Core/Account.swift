import Foundation
import AuthenticationServices
import CryptoKit
import Security
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct AccountUser: Codable { let id: String; let email: String? }
struct Session: Codable {
    let access_token: String
    let refresh_token: String
    let expires_in: Double?
    let user: AccountUser
    var savedAt: Date?
    var expiredSoon: Bool { Date().timeIntervalSince(savedAt ?? .distantPast) > (expires_in ?? 3600) - 90 }
}
private enum SecureStore {
    static let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"dev.ividi.iVidiPoker",kSecAttrAccount as String:"session"]
    static func read() -> Data? {
        var q=query; q[kSecReturnData as String]=true; q[kSecMatchLimit as String]=kSecMatchLimitOne
        var result: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary,&result) == errSecSuccess ? result as? Data : nil
    }
    static func save(_ data: Data) throws {
        let changes=[kSecValueData as String:data]
        let status=SecItemUpdate(query as CFDictionary,changes as CFDictionary)
        if status == errSecItemNotFound {
            var q=query; q[kSecValueData as String]=data; q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(q as CFDictionary,nil)==errSecSuccess else { throw ServiceError(code:"secure_storage") }; return
        }
        guard status==errSecSuccess else { throw ServiceError(code:"secure_storage") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
@MainActor final class Account: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var session: Session?
    private var webSession: ASWebAuthenticationSession?
    private var refreshTask: Task<Session, Error>?
    private(set) var generation=UUID()
    override init() {
        if let data=SecureStore.read() { session=try? JSONDecoder().decode(Session.self,from:data) }
        super.init()
    }
    var userID: String { session?.user.id ?? "" }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
        #else
        return UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        #endif
    }
    private func request(_ path: String, body: [String:Any], method: String = "POST", token: String? = nil) async throws -> Data {
        guard AppConfiguration.ready, let url=URL(string:AppConfiguration.authURL+"/auth/v1/"+path) else { throw ServiceError(code:"not_configured") }
        var req=URLRequest(url:url); req.httpMethod=method; req.timeoutInterval=20
        req.setValue(AppConfiguration.key,forHTTPHeaderField:"apikey")
        req.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if let token { req.setValue("Bearer "+token,forHTTPHeaderField:"Authorization") }
        req.httpBody=try JSONSerialization.data(withJSONObject:body)
        let (data,response)=try await URLSession.shared.data(for:req)
        guard let http=response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let error=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
            throw ServiceError(code:error?["error_code"] as? String ?? error?["error"] as? String ?? "service_unavailable")
        }
        return data
    }
    @discardableResult private func accept(_ data: Data, newAccount: Bool = true) throws -> Session {
        var value=try JSONDecoder().decode(Session.self,from:data); value.savedAt=Date()
        try SecureStore.save(JSONEncoder().encode(value))
        if newAccount { refreshTask?.cancel(); refreshTask=nil; generation=UUID() }
        session=value
        return value
    }
    func signIn(email: String,password: String) async throws {
        try accept(await request("token?grant_type=password",body:["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password]))
    }
    func signUp(name:String,email:String,password:String) async throws -> Bool {
        guard password.count>=8 else { throw ServiceError(code:"weak_password") }
        let data=try await request("signup",body:["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password,"data":["display_name":name]])
        if (try? JSONDecoder().decode(Session.self,from:data)) != nil { try accept(data); return true }
        return false
    }
    func recover(email:String) async throws { _ = try await request("recover",body:["email":email.trimmingCharacters(in:.whitespacesAndNewlines)]) }
    func reset(email:String,code:String,password:String) async throws {
        guard password.count>=8 else { throw ServiceError(code:"weak_password") }
        let data=try await request("verify",body:["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"token":code.trimmingCharacters(in:.whitespacesAndNewlines),"type":"recovery"])
        let recovered=try JSONDecoder().decode(Session.self,from:data)
        _ = try await request("user",body:["password":password],method:"PUT",token:recovered.access_token)
        try accept(data)
    }
    func token() async throws -> String {
        guard let session else { throw ServiceError(code:"authentication_required") }
        if !session.expiredSoon { return session.access_token }
        if let refreshTask { return try await refreshTask.value.access_token }
        let startedGeneration=generation
        let task=Task<Session, Error> {
            let data=try await self.request("token?grant_type=refresh_token",body:["refresh_token":session.refresh_token])
            try Task.checkCancellation()
            guard self.generation==startedGeneration else { throw CancellationError() }
            return try self.accept(data,newAccount:false)
        }
        refreshTask=task; defer { if generation==startedGeneration {refreshTask=nil} }
        do { return try await task.value.access_token }
        catch {
            guard generation==startedGeneration else {throw CancellationError()}
            if generation==startedGeneration, let service=error as? ServiceError, ["refresh_token_not_found","refresh_token_already_used","invalid_grant","session_not_found"].contains(service.code) { clear() }
            throw error
        }
    }
    func signOut() async {
        let value=session?.access_token
        clear()
        if let value { _ = try? await request("logout?scope=local",body:[:],token:value) }
    }
    func clear() { generation=UUID(); refreshTask?.cancel(); refreshTask=nil; SecureStore.clear(); session=nil }
    func social(_ provider: String) async throws {
        guard AppConfiguration.ready else { throw ServiceError(code:"not_configured") }
        var bytes=[UInt8](repeating:0,count:32)
        guard SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes)==errSecSuccess else { throw ServiceError(code:"random_failed") }
        let verifier=Data(bytes).base64URLEncoded
        let challenge=Data(SHA256.hash(data:Data(verifier.utf8))).base64URLEncoded
        guard var url=URLComponents(string:AppConfiguration.authURL+"/auth/v1/authorize") else {throw ServiceError(code:"not_configured")}
        url.queryItems=[.init(name:"provider",value:provider),.init(name:"redirect_to",value:"ividipoker://auth/callback"),.init(name:"code_challenge",value:challenge),.init(name:"code_challenge_method",value:"s256")]
        if provider=="azure" { url.queryItems?.append(.init(name:"scopes",value:"email")) }
        guard let authorizationURL=url.url else {throw ServiceError(code:"not_configured")}
        defer {webSession=nil}
        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            let web=ASWebAuthenticationSession(url:authorizationURL,callbackURLScheme:"ividipoker") { callback,error in
                if let callback { continuation.resume(returning:callback) }
                else { continuation.resume(throwing:ServiceError(code:error == nil ? "service_unavailable" : "cancelled")) }
            }
            web.presentationContextProvider=self
            self.webSession=web
            if !web.start() { self.webSession=nil; continuation.resume(throwing:ServiceError(code:"service_unavailable")) }
        }
        guard callback.host=="auth", callback.path=="/callback",
              let code=URLComponents(url:callback,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="code"})?.value else { throw ServiceError(code:"authentication_required") }
        try accept(await request("token?grant_type=pkce",body:["auth_code":code,"code_verifier":verifier]))
    }
}
private extension Data {
    var base64URLEncoded: String { base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"") }
}
