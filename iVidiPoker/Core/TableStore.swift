import Foundation

@MainActor final class TableStore: ObservableObject {
    @Published var table: PokerTable?
    @Published var busy=false
    @Published var error: String?
    @Published var disconnected=false
    @Published private(set) var restoring=false
    @Published private(set) var restoreFailed=false
    private let account: Account
    init(account: Account) { self.account=account }
    private func request(_ path:String, _ body:[String:Any]? = nil) async throws -> Data {
        guard AppConfiguration.ready, let url=URL(string:AppConfiguration.apiURL+path) else { throw ServiceError(code:"not_configured") }
        let generation=account.generation
        var req=URLRequest(url:url); req.timeoutInterval=15; req.httpMethod=body == nil ? "GET":"POST"
        req.setValue("Bearer "+(try await account.token()),forHTTPHeaderField:"Authorization")
        guard generation==account.generation else {throw CancellationError()}
        if let body { req.httpBody=try JSONSerialization.data(withJSONObject:body);req.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        let (data,response)=try await URLSession.shared.data(for:req)
        guard generation==account.generation else {throw CancellationError()}
        guard let http=response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
            let code=object?["error"] as? String ?? "service_unavailable"
            if (response as? HTTPURLResponse)?.statusCode == 401 { account.clear(); table=nil }
            throw ServiceError(code:code)
        }
        return data
    }
    private func update(_ data:Data) throws {
        let value=try JSONDecoder().decode(PokerTable.self,from:data)
        if table?.code != value.code || value.version >= (table?.version ?? -1) { table=value }
        disconnected=false
    }
    private func perform(_ operation: () async throws -> Void) async {
        guard !busy && !restoring else {return}; busy=true; error=nil; defer{busy=false}
        do {try await operation()} catch is CancellationError {return} catch {self.error=(error as? ServiceError)?.code ?? "service_unavailable"}
    }
    func restore() async {
        guard !restoring && !busy else {return}
        restoring=true; restoreFailed=false
        defer {restoring=false}
        struct Response:Decodable {let room:PokerTable?}
        do {
            let data=try await request("/me")
            table=try JSONDecoder().decode(Response.self,from:data).room
            disconnected=false
        } catch is CancellationError {return}
        catch {restoreFailed=true; self.error=(error as? ServiceError)?.code ?? "service_unavailable"}
    }
    func create(practice:Bool) async {await perform { try self.update(await self.request("/rooms",["practice":practice])) }}
    func join(code:String) async {await perform {try self.update(await self.request("/rooms/"+code.trimmingCharacters(in:.whitespacesAndNewlines).uppercased()+"/join",[:]))}}
    func command(_ name:String,body:[String:Any]=[:]) async {
        guard let code=table?.code else{return}
        await perform {
            let data=try await self.request("/rooms/"+code+"/"+name,body)
            if name=="leave" {self.table=nil} else {try self.update(data)}
        }
    }
    func action(_ action:String,amount:Int=0) async {
        guard let version=table?.version else{return}
        await command("action",body:["action":action,"amount":amount,"version":version])
    }
    func poll() async {
        while !Task.isCancelled {
            guard let code=table?.code, !account.userID.isEmpty else{return}
            if !busy {
                do {let data=try await request("/rooms/"+code); if !Task.isCancelled && table?.code==code {try update(data)}}
                catch {
                    guard !Task.isCancelled else{return}; disconnected=true
                    if (error as? ServiceError)?.code == "table_not_found" {table=nil;self.error="table_not_found";return}
                }
            }
            do {try await Task.sleep(for:.seconds(1.5))} catch{return}
        }
    }
    func deleteAccount() async {
        await perform { _ = try await self.request("/account/delete",[:]); self.table=nil; self.account.clear() }
    }
}
